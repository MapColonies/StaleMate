import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SECOND, formatSince } from '@/lib/time';
import { cn } from '@/lib/utils';
import { refreshAvailableAt } from '@/snapshot/selectors';
import { RefreshRejectedError, useRefresh } from '@/snapshot/use-snapshot';
import type { Snapshot } from '@/snapshot/types';

function refreshErrorMessage(error: Error): string {
  // Anything but a rejected answer means the request never got one.
  return error instanceof RefreshRejectedError ? `HTTP ${error.status}` : 'API unreachable';
}

/** Why the Snapshot on show may be behind: the API restarted and is warming up, or it can't be reached. */
export type ApiProblem = 'restarted' | 'unreachable';

const API_PROBLEMS: Record<ApiProblem, string> = {
  restarted: 'API restarted — first sync running…',
  unreachable: 'API unreachable',
};

/** "updated 40 s ago", whether a sync runs, and "Refresh now", with its cooldown and any error inline. */
export function SyncStatus({ snapshot, now, apiProblem }: { snapshot: Snapshot; now: number; apiProblem: ApiProblem | null }) {
  const refresh = useRefresh();
  const { sync, readAt } = snapshot;
  const syncing = sync.state === 'syncing' || refresh.isPending;
  const cooldownSeconds = Math.ceil((refreshAvailableAt(snapshot) - now) / SECOND);
  const coolingDown = !syncing && cooldownSeconds > 0;

  return (
    <div className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className={cn('size-1.5 rounded-full', syncing ? 'animate-pulse bg-amber-500' : sync.lastError ? 'bg-red-500' : 'bg-emerald-500')} />
        <span>updated {formatSince(readAt, now)} ago</span>
        {syncing && <span>· Syncing with GitHub…</span>}
      </span>
      {apiProblem !== null && (
        <span className={apiProblem === 'unreachable' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}>
          · {API_PROBLEMS[apiProblem]}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={syncing || coolingDown}
        title={coolingDown ? `Refresh is rate-limited; available in ${cooldownSeconds} s` : 'Sync with GitHub now'}
        onClick={() => refresh.mutate()}
      >
        <RefreshCw className={cn('size-3', syncing && 'animate-spin')} />
        {coolingDown ? `Refresh in ${cooldownSeconds} s` : 'Refresh now'}
      </Button>
      {refresh.isError && (
        <span role="alert" className="text-red-600 dark:text-red-400">
          Refresh failed: {refreshErrorMessage(refresh.error)}
        </span>
      )}
    </div>
  );
}
