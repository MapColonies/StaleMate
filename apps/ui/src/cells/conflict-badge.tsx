import { GitMerge } from 'lucide-react';
import type { TrackedPr } from '@/snapshot/types';

/** Flags a PR that conflicts with its base, which its author owes a fix for whatever its Review Status. */
export function ConflictBadge({ pr }: { pr: Pick<TrackedPr, 'conflicting'> }) {
  if (!pr.conflicting) {
    return null;
  }
  return (
    <span
      title="Conflicts with its base: the author has to rebase or merge"
      className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-red-600 dark:text-red-400"
    >
      <GitMerge className="size-3.5" />
      Conflicts
    </span>
  );
}
