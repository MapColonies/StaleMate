import { useMutation, useQueryClient } from '@tanstack/react-query';
import { $api, fetchClient } from '@/lib/http-client';
import type { Snapshot, SyncState, Warming } from './types';

const POLL_MS = 30_000;
// While a sweep runs or is due, poll faster so its Snapshot shows soon after it lands. Never more often than this, so a
// hung or failing sweep doesn't have every tab hammering the API.
const BUSY_POLL_MS = 10_000;

/** The 503 the API answers until its first sweep succeeds. */
export function isWarming(error: unknown): error is Warming {
  return typeof error === 'object' && error !== null && (error as Partial<Warming>).status === 'warming';
}

/**
 * How long to wait before polling again: every 10 s while a sweep runs or is overdue, otherwise until the next sweep is
 * due, between 10 s and 30 s. Without a scheduled sweep, `unscheduledMs`.
 */
export function pollDelayMs(sync: SyncState, now: number, unscheduledMs = POLL_MS): number {
  if (sync.state === 'syncing') {
    return BUSY_POLL_MS;
  }
  if (sync.nextAttemptAt === undefined) {
    return unscheduledMs;
  }
  const untilNext = Date.parse(sync.nextAttemptAt) - now;
  return Math.max(BUSY_POLL_MS, Math.min(POLL_MS, untilNext));
}

/**
 * The Snapshot, refetched as sweeps land (at least every 30 s) and when the window regains focus. A tab in the
 * background polls only when `inBackground`, e.g. so OS notifications still arrive; the browser throttles it to about
 * once a minute, which is enough.
 */
export function useSnapshot({ inBackground = false }: { inBackground?: boolean } = {}) {
  return $api.useQuery(
    'get',
    '/snapshot',
    {},
    {
      refetchInterval: ({ state }) => {
        // A warming API is about to have a Snapshot.
        if (isWarming(state.error)) {
          return pollDelayMs(state.error.sync, Date.now(), BUSY_POLL_MS);
        }
        // Unreachable: retry soon until there is something to show, then at the usual pace.
        if (state.error || state.data === undefined) {
          return state.data === undefined ? BUSY_POLL_MS : POLL_MS;
        }
        return pollDelayMs(state.data.sync, Date.now());
      },
      refetchIntervalInBackground: inBackground,
      refetchOnWindowFocus: true,
      // Polling already retries; a warming 503 should show at once.
      retry: false,
    }
  );
}

/** The API, or the proxy in front of it, answered a refresh with an error status. */
export class RefreshRejectedError extends Error {
  public readonly status: number;

  public constructor(status: number) {
    super(`refresh answered ${status}`);
    this.status = status;
    this.name = 'RefreshRejectedError';
  }
}

/** "Refresh now": asks the API to sweep, and shows the sync state it answers with straight away. */
export function useRefresh() {
  const queryClient = useQueryClient();
  const { queryKey } = $api.queryOptions('get', '/snapshot');

  // Not $api.useMutation: it treats an error answer with an empty body, as a proxy sends when the API is down, as success.
  return useMutation({
    mutationFn: async (): Promise<SyncState> => {
      const { data, response } = await fetchClient.POST('/refresh');
      if (!response.ok || data === undefined) {
        throw new RefreshRejectedError(response.status);
      }
      return data;
    },
    onSuccess: (sync) => {
      queryClient.setQueryData<Snapshot>(queryKey, (snapshot) => snapshot && { ...snapshot, sync });
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
