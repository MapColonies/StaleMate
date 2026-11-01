import { waitingOnViewerCounts } from '@/snapshot/selectors';
import type { TrackedPr } from '@/snapshot/types';

/** What the Inbox tab counts below 1280px, where the bar has no room for the header counts: the Viewer's turn. */
export interface InboxCount {
  count: number;
  /** What the count is, for the tooltip and screen readers. */
  label: string;
}

/** The Viewer's turn as the Inbox tab counts it, the Team's requests included; nothing until the Viewer picks themselves. */
export function inboxCount(prs: readonly TrackedPr[], teamSlug: string, viewer: string | null): InboxCount | undefined {
  if (viewer === null) {
    return undefined;
  }
  const turn = waitingOnViewerCounts(prs, viewer);
  return { count: turn.mine + turn.team, label: `Your turn ${turn.mine} + ${turn.team} via @${teamSlug}` };
}
