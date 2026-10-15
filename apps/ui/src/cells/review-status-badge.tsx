import { CircleDot, CircleX, GitPullRequestDraft, RotateCcw, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewStatus, TrackedPr } from '@/snapshot/types';
import { REVIEW_STATUS_LABELS } from './labels';

const STYLES: Record<ReviewStatus, { className: string; Icon: typeof CircleDot }> = {
  draft: { className: 'bg-muted text-muted-foreground', Icon: GitPullRequestDraft },
  awaitingReview: { className: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300', Icon: CircleDot },
  changesRequested: { className: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300', Icon: CircleX },
  awaitingReReview: { className: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300', Icon: RotateCcw },
  approved: { className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', Icon: ShieldCheck },
};

/** The Review Status, with the number of approvals on Approved. */
export function ReviewStatusBadge({ pr }: { pr: Pick<TrackedPr, 'reviewStatus' | 'approvals'> }) {
  const { className, Icon } = STYLES[pr.reviewStatus];
  const label = REVIEW_STATUS_LABELS[pr.reviewStatus] + (pr.reviewStatus === 'approved' ? ` ×${pr.approvals}` : '');
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', className)}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}
