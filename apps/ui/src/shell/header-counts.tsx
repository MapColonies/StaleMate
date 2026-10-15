import { Badge } from '@/components/ui/badge';
import { noReviewerCount, waitingOnViewerCounts } from '@/snapshot/selectors';
import type { TrackedPr } from '@/snapshot/types';

/** "Your turn 3 + 5 team" and the No Reviewer count, over the whole Snapshot whatever the filters. */
export function HeaderCounts({ prs, viewer }: { prs: readonly TrackedPr[]; viewer: string | null }) {
  const turn = waitingOnViewerCounts(prs, viewer);
  return (
    <div className="flex items-center gap-4 text-sm whitespace-nowrap">
      {viewer !== null && (
        <span data-testid="my-turn" title="PRs Waiting On you, plus review requests to the Team">
          <span className="text-muted-foreground">Your turn</span> <b className="tabular-nums">{turn.mine}</b>
          <span className="text-muted-foreground tabular-nums"> + {turn.team} team</span>
        </span>
      )}
      <Badge
        data-testid="no-reviewer"
        variant="outline"
        title="PRs Awaiting Review that no reviewer owes a move on"
        className="border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300"
      >
        <span className="tabular-nums">{noReviewerCount(prs)}</span> No Reviewer
      </Badge>
    </div>
  );
}
