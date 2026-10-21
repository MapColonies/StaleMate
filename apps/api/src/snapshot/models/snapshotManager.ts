import { inject, injectable } from 'tsyringe';
import type { components } from 'stalemate-openapi';
import type { ConfigType } from '@common/config';
import { SERVICES } from '@common/constants';
import { type DerivationConfig, deriveTeam, deriveTrackedPr } from '@domain/deriveTrackedPr';
import { SNAPSHOT_STORE, type SnapshotStore } from '../../cache/snapshotStore';
import { SYNC_LOOP, type SyncLoop, type SyncState } from '../../sync/syncLoop';

type Snapshot = components['schemas']['snapshot'];

export type SnapshotResult = { status: 'warming'; sync: SyncState } | { status: 'ready'; snapshot: Snapshot };

/** Derives the Snapshot from what the last successful sweep read. */
@injectable()
export class SnapshotManager {
  private readonly derivationConfig: DerivationConfig;
  private readonly refreshCooldownMs: number;
  /** Undefined when configured empty, which hides Jira Tickets. */
  private readonly jiraBaseUrl: string | undefined;

  public constructor(
    @inject(SNAPSHOT_STORE) private readonly store: SnapshotStore,
    @inject(SYNC_LOOP) private readonly syncLoop: SyncLoop,
    @inject(SERVICES.CONFIG) config: ConfigType
  ) {
    this.derivationConfig = {
      teamSlug: config.get('team.slug'),
      botLogins: config.get('bots.logins'),
      // The config schema pins exactly three thresholds.
      urgencyThresholds: config.get('urgency.thresholds') as unknown as DerivationConfig['urgencyThresholds'],
      extraNonWorkingDays: config.get('extraNonWorkingDays'),
      excludedChecks: config.get('checks.excluded'),
      jiraProjectKeys: config.get('jira.projectKeys'),
    };
    this.refreshCooldownMs = config.get('sync.refreshCooldownMs');
    const jiraBaseUrl = config.get('jira.baseUrl');
    this.jiraBaseUrl = jiraBaseUrl === '' ? undefined : jiraBaseUrl.replace(/\/+$/, '');
  }

  /** Age and Idle Time are counted up to `now`, the request time, so they stay current between sweeps. */
  public async getSnapshot(now = new Date()): Promise<SnapshotResult> {
    const sync = this.syncLoop.getState();
    const stored = await this.store.get();
    if (stored === undefined) {
      return { status: 'warming', sync };
    }

    const { roster, prs, readAt } = stored;
    return {
      status: 'ready',
      snapshot: {
        readAt: readAt.toISOString(),
        sync,
        config: {
          urgencyThresholds: [...this.derivationConfig.urgencyThresholds],
          refreshCooldownMs: this.refreshCooldownMs,
          ...(this.jiraBaseUrl !== undefined && { jiraBaseUrl: this.jiraBaseUrl }),
        },
        team: deriveTeam(roster, this.derivationConfig),
        prs: prs.map((facts) => deriveTrackedPr(facts, roster, this.derivationConfig, now)),
      },
    };
  }

  public refresh(): SyncState {
    return this.syncLoop.refresh();
  }
}
