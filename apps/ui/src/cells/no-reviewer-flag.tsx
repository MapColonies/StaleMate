import { TriangleAlert } from 'lucide-react';
import type { TrackedPr } from '@/snapshot/types';

/** Flags a PR Awaiting Review that no reviewer owes a move on, so its author has to find one. */
export function NoReviewerFlag({ pr }: { pr: Pick<TrackedPr, 'noReviewer'> }) {
  if (!pr.noReviewer) {
    return null;
  }
  return (
    <span
      title="Awaiting Review, but no reviewer owes a move: the author has to find one"
      className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
    >
      <TriangleAlert className="size-3" />
      No Reviewer
    </span>
  );
}
