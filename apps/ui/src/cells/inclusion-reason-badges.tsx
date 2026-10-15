import { cn } from '@/lib/utils';
import type { InclusionReason } from '@/snapshot/types';
import { INCLUSION_REASON_LABELS } from './labels';

const STYLES: Record<InclusionReason, string> = {
  teamRepo: 'border-border text-muted-foreground',
  authoredByMember: 'border-indigo-200 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300',
  memberReviewRequested: 'border-sky-200 text-sky-700 dark:border-sky-800 dark:text-sky-300',
  reviewedByMember: 'border-teal-200 text-teal-700 dark:border-teal-800 dark:text-teal-300',
  assignedToMember: 'border-fuchsia-200 text-fuchsia-700 dark:border-fuchsia-800 dark:text-fuchsia-300',
  teamReviewRequested: 'border-dashed border-indigo-200 text-indigo-600 dark:border-indigo-800 dark:text-indigo-300',
};

/** Why the PR is a Tracked PR. */
export function InclusionReasonBadges({ reasons }: { reasons: readonly InclusionReason[] }) {
  return (
    <span className="flex flex-wrap gap-1" title="Why tracked">
      {reasons.map((reason) => (
        <span key={reason} className={cn('rounded border px-1 py-px text-[10px] font-medium whitespace-nowrap', STYLES[reason])}>
          {INCLUSION_REASON_LABELS[reason]}
        </span>
      ))}
    </span>
  );
}
