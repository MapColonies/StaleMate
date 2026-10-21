import { Histogram, type Registry } from 'prom-client';

export interface SnapshotMetrics {
  /** Recorded only when the Snapshot response is built, not when it is served from the cache. */
  buildDuration: Histogram;
}

export function createSnapshotMetrics(registry: Registry): SnapshotMetrics {
  return {
    buildDuration: new Histogram({
      name: 'stalemate_snapshot_build_duration_seconds',
      help: 'How long building the Snapshot response took, on a cache miss',
      // The default buckets, 5 ms to 10 s, span a build from a few PRs to the whole org's.
      registers: [registry],
    }),
  };
}

export const SNAPSHOT_METRICS = Symbol('SnapshotMetrics');
