import { createHash } from 'node:crypto';
import { inject, Lifecycle, scoped } from 'tsyringe';
import type { components } from 'stalemate-openapi';
import type { ConfigType } from '@common/config';
import { SERVICES } from '@common/constants';
import { DERIVATION_CONFIG } from '@common/derivationConfig';
import { type DerivationConfig, withClocks } from '@domain/deriveTrackedPr';
import { SNAPSHOT_STORE, type SnapshotStore } from '../../cache/snapshotStore';
import { SYNC_LOOP, type SyncLoop, type SyncState } from '../../sync/syncLoop';
import { SNAPSHOT_METRICS, type SnapshotMetrics } from './snapshotMetrics';

const MS_PER_MINUTE = 60_000;

type Snapshot = components['schemas']['snapshot'];

/** The Snapshot serialized, with a strong ETag of its bytes. */
export interface SnapshotResponse {
  body: string;
  etag: string;
}

export type SnapshotResult = { status: 'warming'; sync: SyncState } | ({ status: 'ready' } & SnapshotResponse);

/**
 * Serves the Snapshot the sync loop derived, adding the clocks.
 * The response is cached until the minute, the store or the sync state changes, so Viewers polling in the same minute cost one build.
 * One per container, so every resolve shares the cache.
 */
@scoped(Lifecycle.ContainerScoped)
export class SnapshotManager {
  private readonly refreshCooldownMs: number;
  /** Undefined when configured empty, which hides Jira Tickets. */
  private readonly jiraBaseUrl: string | undefined;
  private cached: { key: string; response: SnapshotResponse } | undefined;

  public constructor(
    @inject(SNAPSHOT_STORE) private readonly store: SnapshotStore,
    @inject(SYNC_LOOP) private readonly syncLoop: SyncLoop,
    @inject(DERIVATION_CONFIG) private readonly derivationConfig: DerivationConfig,
    @inject(SNAPSHOT_METRICS) private readonly metrics: SnapshotMetrics,
    @inject(SERVICES.CONFIG) config: ConfigType
  ) {
    this.refreshCooldownMs = config.get('sync.refreshCooldownMs');
    const jiraBaseUrl = config.get('jira.baseUrl');
    this.jiraBaseUrl = jiraBaseUrl === '' ? undefined : jiraBaseUrl.replace(/\/+$/, '');
  }

  /** Age and Idle Time are counted up to `now`, the request time rounded down to the minute, so they stay current between sweeps. */
  public async getSnapshot(now = new Date()): Promise<SnapshotResult> {
    const sync = this.syncLoop.getState();
    const snapshotWide = await this.store.getSnapshotWide();
    if (snapshotWide === undefined) {
      return { status: 'warming', sync };
    }

    const nowToTheMinute = new Date(now.getTime() - (now.getTime() % MS_PER_MINUTE));
    // Everything else in the response is config, which doesn't change at runtime.
    const key = JSON.stringify([nowToTheMinute.getTime(), snapshotWide.version, sync]);
    if (this.cached?.key !== key) {
      const endTimer = this.metrics.buildDuration.startTimer();
      const records = await this.store.getRecords();
      const snapshot: Snapshot = {
        readAt: snapshotWide.readAt.toISOString(),
        sync,
        config: {
          urgencyThresholds: [...this.derivationConfig.urgencyThresholds],
          refreshCooldownMs: this.refreshCooldownMs,
          ...(this.jiraBaseUrl !== undefined && { jiraBaseUrl: this.jiraBaseUrl }),
        },
        team: snapshotWide.team,
        prs: records.map(({ derived }) => withClocks(derived, this.derivationConfig, nowToTheMinute)),
      };
      const body = JSON.stringify(snapshot);
      this.cached = { key, response: { body, etag: `"${createHash('sha1').update(body).digest('base64url')}"` } };
      endTimer();
    }
    return { status: 'ready', ...this.cached.response };
  }

  public refresh(): SyncState {
    return this.syncLoop.refresh();
  }
}
