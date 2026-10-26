import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { viewerMoves } from '@/snapshot/selectors';
import type { Move, TrackedPr } from '@/snapshot/types';
import { MOVE_LABELS } from './labels';

// The moves its Review Status doesn't explain, so they call for attention.
const ALARMING: readonly Move[] = ['resolveConflict', 'fixChecks'];

/** What the Viewer owes on the PR, in plain words: why it is their turn. Nothing when it isn't. */
export function MovePills({ pr, viewer, hideViaTeam }: { pr: TrackedPr; viewer: string | null; hideViaTeam: boolean }) {
  const moves = viewerMoves(pr, viewer, hideViaTeam);
  const heldBy = moves.includes('merge') ? pr.stack?.heldBy : undefined;
  const holder = heldBy && pr.stack?.siblings.find((sibling) => sibling.repo === heldBy.repo && sibling.number === heldBy.number);
  return (
    <>
      <MoveList moves={moves} />
      {heldBy && (
        <span
          title={`Held: cannot merge until ${holder ? `“${holder.title}” (#${heldBy.number})` : `#${heldBy.number}`} is ready`}
          className="inline-flex shrink-0 items-center rounded-md border border-dashed border-violet-300 px-1.5 py-0.5 text-xs whitespace-nowrap text-violet-800 dark:border-violet-700 dark:text-violet-300"
        >
          Held by #{heldBy.number}
        </span>
      )}
    </>
  );
}

/** The given Moves as pills. Nothing when there are none. */
export function MoveList({ moves }: { moves: readonly Move[] }) {
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
