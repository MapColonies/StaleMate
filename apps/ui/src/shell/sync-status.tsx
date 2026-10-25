import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SECOND, formatSince } from '@/lib/time';
import { useCompact } from '@/lib/use-compact';
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

type SnapshotState = 'fresh' | 'syncing' | 'out-of-date';

const DOTS: Record<SnapshotState, string> = {
  fresh: 'bg-emerald-500',
  syncing: 'animate-pulse bg-amber-500',
  'out-of-date': 'bg-red-500',
};

// A ring around the dot, which still shows how the last Snapshot the API served stood.
const RINGS: Record<ApiProblem, string> = {
  restarted: 'ring-2 ring-amber-500 ring-offset-2 ring-offset-background',
  unreachable: 'ring-2 ring-red-500 ring-offset-2 ring-offset-background',
};

/** What the sync status says and offers, however it is shown. */
interface Status {
  since: string;
  syncing: boolean;
  outOfDate: boolean;
  apiProblem: ApiProblem | null;
  /** Refreshing waits out a cooldown after each sync starts. */
  coolingDown: boolean;
  cooldownSeconds: number;
  /** "Refresh now", or "Refresh in 18 s" while it cools down. */
  refreshLabel: string;
  refreshError: string | null;
  onRefresh: () => void;
}

const snapshotState = ({ syncing, outOfDate }: Status): SnapshotState => (syncing ? 'syncing' : outOfDate ? 'out-of-date' : 'fresh');

/** Below 1280px: a dot, whose tooltip says what the line would, and which refreshes when clicked. */
function SyncDot({ status }: { status: Status }) {
  const { since, syncing, outOfDate, apiProblem, coolingDown, refreshLabel, refreshError, onRefresh } = status;
  const tooltip = [
    `Updated ${since} ago`,
    syncing && 'syncing with GitHub…',
    outOfDate && 'the last sync with GitHub failed',
    apiProblem !== null && API_PROBLEMS[apiProblem],
    refreshLabel,
    refreshError,
  ]
    .filter(Boolean)
    .join(' · ');
  const state = snapshotState(status);
  return (
    // The tooltip sits on a wrapper: a disabled button gets no pointer events, so it would show no tooltip.
    <span title={tooltip}>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 disabled:opacity-100"
        aria-label={tooltip}
        data-state={state}
        data-api-problem={apiProblem ?? undefined}
        disabled={syncing || coolingDown}
        onClick={onRefresh}
      >
        <span className={cn('size-2 rounded-full', DOTS[state], apiProblem !== null && RINGS[apiProblem])} />
      </Button>
      {refreshError !== null && (
        <span role="alert" className="sr-only">
          {refreshError}
        </span>
      )}
    </span>
  );
}

/** "Updated 40 s ago", whether a sync runs, and "Refresh now", with its cooldown and any error inline. */
function SyncLine({ status }: { status: Status }) {
  const { since, syncing, apiProblem, coolingDown, cooldownSeconds, refreshLabel, refreshError, onRefresh } = status;
  return (
    <div className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className={cn('size-1.5 rounded-full', DOTS[snapshotState(status)])} />
        <span>Updated {since} ago</span>
        {syncing && <span>· syncing with GitHub…</span>}
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
        onClick={onRefresh}
      >
        <RefreshCw className={cn('size-3', syncing && 'animate-spin')} />
        {refreshLabel}
      </Button>
      {refreshError !== null && (
        <span role="alert" className="text-red-600 dark:text-red-400">
          {refreshError}
        </span>
      )}
    </div>
  );
}

/** How fresh the Snapshot is, and "Refresh now": a line of text, or a dot below 1280px. */
export function SyncStatus({ snapshot, now, apiProblem }: { snapshot: Snapshot; now: number; apiProblem: ApiProblem | null }) {
  const compact = useCompact();
  // Here, not in the dot or the line, so a failed refresh still shows after the window crosses 1280px.
  const refresh = useRefresh();
  const { sync, readAt } = snapshot;
  const syncing = sync.state === 'syncing' || refresh.isPending;
  const cooldownSeconds = Math.ceil((refreshAvailableAt(snapshot) - now) / SECOND);
  const coolingDown = !syncing && cooldownSeconds > 0;
  const status: Status = {
    since: formatSince(readAt, now),
    syncing,
    outOfDate: sync.lastError !== undefined,
    apiProblem,
    coolingDown,
    cooldownSeconds,
    refreshLabel: coolingDown ? `Refresh in ${cooldownSeconds} s` : 'Refresh now',
    refreshError: refresh.isError ? `Refresh failed: ${refreshErrorMessage(refresh.error)}` : null,
    onRefresh: () => refresh.mutate(),
  };
  return compact ? <SyncDot status={status} /> : <SyncLine status={status} />;
}
