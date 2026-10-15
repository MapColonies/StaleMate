import { useMutation, useQueryClient } from '@tanstack/react-query';
import { $api, fetchClient } from '@/lib/http-client';
import type { Snapshot, SyncState, Warming } from './types';

const POLL_MS = 30_000;
// While the API warms up or a sweep runs, poll faster so the result shows soon after it lands.
const BUSY_POLL_MS = 2_000;

/** The 503 the API answers until its first sweep succeeds. */
export function isWarming(error: unknown): error is Warming {
  return typeof error === 'object' && error !== null && (error as Partial<Warming>).status === 'warming';
}

/** The Snapshot, refetched every ~30 s and when the window regains focus. */
export function useSnapshot() {
  return $api.useQuery(
    'get',
    '/snapshot',
    {},
    {
      refetchInterval: ({ state }) => {
        const sync = state.data?.sync ?? (isWarming(state.error) ? state.error.sync : undefined);
        return state.data === undefined || sync?.state === 'syncing' ? BUSY_POLL_MS : POLL_MS;
      },
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
