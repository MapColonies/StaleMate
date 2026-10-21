import { inject, injectable } from 'tsyringe';
import type { components } from 'stalemate-openapi';
import type { ConfigType } from '@common/config';
import { SERVICES } from '@common/constants';
import { DERIVATION_CONFIG } from '@common/derivationConfig';
import { type DerivationConfig, withClocks } from '@domain/deriveTrackedPr';
import { SNAPSHOT_STORE, type SnapshotStore } from '../../cache/snapshotStore';
import { SYNC_LOOP, type SyncLoop, type SyncState } from '../../sync/syncLoop';

const MS_PER_MINUTE = 60_000;

type Snapshot = components['schemas']['snapshot'];

export type SnapshotResult = { status: 'warming'; sync: SyncState } | { status: 'ready'; snapshot: Snapshot };

/** Serves the Snapshot the sync loop derived, adding the clocks. */
@injectable()
export class SnapshotManager {
  private readonly refreshCooldownMs: number;
  /** Undefined when configured empty, which hides Jira Tickets. */
  private readonly jiraBaseUrl: string | undefined;

  public constructor(
    @inject(SNAPSHOT_STORE) private readonly store: SnapshotStore,
    @inject(SYNC_LOOP) private readonly syncLoop: SyncLoop,
    @inject(DERIVATION_CONFIG) private readonly derivationConfig: DerivationConfig,
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
    const records = await this.store.getRecords();
    return {
      status: 'ready',
      snapshot: {
        readAt: snapshotWide.readAt.toISOString(),
        sync,
        config: {
          urgencyThresholds: [...this.derivationConfig.urgencyThresholds],
          refreshCooldownMs: this.refreshCooldownMs,
          ...(this.jiraBaseUrl !== undefined && { jiraBaseUrl: this.jiraBaseUrl }),
        },
        team: snapshotWide.team,
        prs: records.map(({ derived }) => withClocks(derived, this.derivationConfig, nowToTheMinute)),
      },
    };
  }

  public refresh(): SyncState {
    return this.syncLoop.refresh();
  }
}
