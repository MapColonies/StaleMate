import { Gauge, Histogram, type Registry } from 'prom-client';

export interface SyncMetrics {
  /** Labelled by outcome: success or failure. */
  sweepDuration: Histogram<'outcome'>;
  lastSuccessfulSweep: Gauge;
  /** Set by the GitHub provider from the rateLimit it reads in every query. */
  graphqlPointsRemaining: Gauge;
}

export function createSyncMetrics(registry: Registry): SyncMetrics {
  return {
    sweepDuration: new Histogram({
      name: 'stalemate_sweep_duration_seconds',
      help: 'How long a sweep of the code host took',
      labelNames: ['outcome'],
      // A GitHub sweep takes about 30 s.
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- the buckets, in seconds
      buckets: [1, 5, 10, 20, 30, 45, 60, 90, 120, 300],
      registers: [registry],
    }),
    lastSuccessfulSweep: new Gauge({
      name: 'stalemate_last_successful_sweep_timestamp_seconds',
      help: 'When the last successful sweep started, in Unix seconds',
      registers: [registry],
    }),
    graphqlPointsRemaining: new Gauge({
      name: 'stalemate_github_graphql_points_remaining',
      help: 'The GitHub GraphQL rate-limit points left in the current window',
      registers: [registry],
    }),
  };
}

export const SYNC_METRICS = Symbol('SyncMetrics');
