import { isDeepStrictEqual } from 'node:util';
import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import type { components } from 'stalemate-openapi';
import type { ConfigType } from '@common/config';
import { SERVICES } from '@common/constants';
import { DERIVATION_CONFIG } from '@common/derivationConfig';
import { TIER_CONFIG, type TierConfig } from '@common/tierConfig';
import { type DerivationConfig, deriveClockFreePr, deriveTeam } from '@domain/deriveTrackedPr';
import { PR_PROVIDER, type PrProvider, SweepError, type SweepFailure } from '../providers/prProvider';
import { type PrRecord, SNAPSHOT_STORE, type SnapshotStore } from '../cache/snapshotStore';
import { SYNC_METRICS, type SyncMetrics } from './syncMetrics';
import { planReads, type ReadReason } from './readPlan';

const MS_PER_SECOND = 1000;

// lastError is shown to every Viewer, so it is one of these and never the raw error.
const SAFE_MESSAGES: Record<SweepFailure, string> = {
  unreachable: 'GitHub API unreachable',
  authentication: 'GitHub App authentication failed',
  rateLimit: 'GitHub rate limit reached',
};
const UNRECOGNISED_FAILURE_MESSAGE = 'Unexpected error';

function toSafeMessage(error: unknown): string {
  return error instanceof SweepError ? SAFE_MESSAGES[error.failure] : UNRECOGNISED_FAILURE_MESSAGE;
}

/** How many PRs the sweep chose to read for each reason. */
function countReasons(plan: ReadonlyMap<string, ReadReason>): Record<ReadReason, number> {
  const counts: Record<ReadReason, number> = { new: 0, changed: 0, hot: 0, warm: 0, cold: 0 };
  plan.forEach((reason) => counts[reason]++);
  return counts;
}

export type SyncState = components['schemas']['syncState'];

/**
 * Sweeps the code host into the SnapshotStore, in the API process, deriving each PR it reads but for its clocks.
 * A sweep reads only the PRs whose details may have changed, choosing by each PR's Idle Time (ADR 0004).
 * Each sweep schedules the next one sync.intervalMs after it ends, so sweeps never overlap.
 */
@injectable()
export class SyncLoop {
  private syncing = false;
  private running = false;
  private lastAttemptAt: Date | undefined;
  private nextAttemptAt: Date | undefined;
  private lastError: string | undefined;
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    @inject(PR_PROVIDER) private readonly provider: PrProvider,
    @inject(SNAPSHOT_STORE) private readonly store: SnapshotStore,
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(DERIVATION_CONFIG) private readonly derivationConfig: DerivationConfig,
    @inject(TIER_CONFIG) private readonly tierConfig: TierConfig,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SYNC_METRICS) private readonly metrics: SyncMetrics
  ) {}

  /** Sweeps now and keeps sweeping until stopped. Resolves when the first sweep ends, whether or not it succeeded. */
  public async start(): Promise<void> {
    this.running = true;
    await this.sweep();
  }

  public stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    this.nextAttemptAt = undefined;
  }

  /** Sweeps at once if no sweep is running and the cooldown since the last one started has passed. Otherwise does nothing. */
  public refresh(): SyncState {
    const cooldownPassed = this.lastAttemptAt === undefined || Date.now() - this.lastAttemptAt.getTime() >= this.config.get('sync.refreshCooldownMs');
    if (!this.syncing && cooldownPassed) {
      void this.sweep();
    }
    return this.getState();
  }

  public getState(): SyncState {
    return {
      state: this.syncing ? 'syncing' : 'idle',
      ...(this.lastAttemptAt && { lastAttemptAt: this.lastAttemptAt.toISOString() }),
      ...(this.nextAttemptAt && { nextAttemptAt: this.nextAttemptAt.toISOString() }),
      ...(this.lastError !== undefined && { lastError: this.lastError }),
    };
  }

  private async sweep(): Promise<void> {
    clearTimeout(this.timer);
    this.nextAttemptAt = undefined;
    this.syncing = true;
    const startedAt = new Date();
    this.lastAttemptAt = startedAt;
    const endTimer = this.metrics.sweepDuration.startTimer();

    try {
      const { roster, prs: discovered } = await this.provider.discover();
      const stored = await this.store.getRecords();
      const plan = planReads(discovered, stored, { ...this.tierConfig, extraNonWorkingDays: this.derivationConfig.extraNonWorkingDays }, startedAt);
      const readById = new Map((await this.provider.read([...plan.keys()])).map((facts) => [facts.id, facts]));

      // The sweep read the code host from when it started, so that is how fresh what it read is.
      const readRecords = discovered.flatMap(({ id, updatedAt }): PrRecord[] => {
        const facts = readById.get(id);
        return facts ? [{ facts, readAt: startedAt, updatedAt, derived: deriveClockFreePr(facts, roster, this.derivationConfig) }] : [];
      });
      // A PR is gone once discovery no longer finds it, or it was gone by the time it was read.
      const discoveredIds = new Set(discovered.map(({ id }) => id));
      const gone = stored.map(({ facts }) => facts.id).filter((id) => !discoveredIds.has(id) || (plan.has(id) && !readById.has(id)));
      // A PR not read this sweep still has Waiting On and Inclusion Reasons that depend on the Roster, so they are re-derived when it changes.
      const previousRoster = (await this.store.getSnapshotWide())?.roster;
      const rederived = isDeepStrictEqual(previousRoster, roster)
        ? []
        : stored
            .filter(({ facts }) => discoveredIds.has(facts.id) && !plan.has(facts.id))
            .map((record) => ({ ...record, derived: deriveClockFreePr(record.facts, roster, this.derivationConfig) }));
      const records = [...readRecords, ...rederived];

      // The in-memory store applies these writes with no request served in between.
      // A networked store would have to apply them as one transaction, or a request could see half a sweep.
      await this.store.upsert(records);
      await this.store.delete(gone);
      // Written last, so the Snapshot never exists before its first sweep's PRs do.
      await this.store.setSnapshotWide({ roster, team: deriveTeam(roster, this.derivationConfig), readAt: startedAt });
      this.lastError = undefined;
      endTimer({ outcome: 'success' });
      this.metrics.lastSuccessfulSweep.set(startedAt.getTime() / MS_PER_SECOND);
      this.logger.info({
        msg: 'sweep succeeded',
        discovered: discovered.length,
        read: countReasons(plan),
        rederived: rederived.length,
        dropped: gone.length,
      });
    } catch (error) {
      this.lastError = toSafeMessage(error);
      endTimer({ outcome: 'failure' });
      this.logger.error({ msg: 'sweep failed', err: error });
    } finally {
      this.syncing = false;
      if (this.running) {
        const intervalMs = this.config.get('sync.intervalMs');
        this.nextAttemptAt = new Date(Date.now() + intervalMs);
        this.timer = setTimeout(() => void this.sweep(), intervalMs);
      }
    }
  }
}

export const SYNC_LOOP = Symbol('SyncLoop');
