import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isOnViewerViaTeam } from '@/snapshot/selectors';
import type { Move, TrackedPr } from '@/snapshot/types';
import { MOVE_LABELS } from './labels';

// The moves its Review Status doesn't explain, so they call for attention.
const ALARMING: readonly Move[] = ['resolveConflict', 'fixChecks'];

/** The moves the Viewer owes: theirs by name, or a review through a request to the Team. */
function viewerMoves(pr: TrackedPr, viewer: string | null, hideViaTeam: boolean): Move[] {
  const own = pr.waitingOn.find((party) => party.type === 'person' && party.login === viewer);
  if (own?.type === 'person') {
    return own.moves;
  }
  return isOnViewerViaTeam(pr, viewer, { hideViaTeam }) ? ['review'] : [];
}

/** What the Viewer owes on the PR, in plain words: why it is their turn. Nothing when it isn't. */
export function MovePills({ pr, viewer, hideViaTeam }: { pr: TrackedPr; viewer: string | null; hideViaTeam: boolean }) {
  const moves = viewerMoves(pr, viewer, hideViaTeam);
  if (moves.length === 0) {
    return null;
  }
  return (
    <span role="list" aria-label="Your move" className="inline-flex shrink-0 items-center gap-1">
      {moves.map((move) => {
        const alarming = ALARMING.includes(move);
        return (
          <span
            key={move}
            role="listitem"
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap',
              alarming
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'
                : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
            )}
          >
            {alarming && <TriangleAlert className="size-3" />}
            {MOVE_LABELS[move]}
          </span>
        );
      })}
    </span>
  );
}
