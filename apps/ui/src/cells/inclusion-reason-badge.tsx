import { cn } from '@/lib/utils';
import type { InclusionReason, Person, TrackedPr } from '@/snapshot/types';
import { INCLUSION_REASON_LABELS, VIEWER_INCLUSION_REASON_LABELS } from './labels';

const STYLES: Record<InclusionReason, string> = {
  teamRepo: 'border-border text-muted-foreground',
  authoredByMember: 'border-indigo-200 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300',
  memberReviewRequested: 'border-sky-200 text-sky-700 dark:border-sky-800 dark:text-sky-300',
  reviewedByMember: 'border-teal-200 text-teal-700 dark:border-teal-800 dark:text-teal-300',
  assignedToMember: 'border-fuchsia-200 text-fuchsia-700 dark:border-fuchsia-800 dark:text-fuchsia-300',
  teamReviewRequested: 'border-dashed border-indigo-200 text-indigo-600 dark:border-indigo-800 dark:text-indigo-300',
};

/** The people an Inclusion Reason may have been met through, for the reasons that name a Team Member. */
const PEOPLE: Partial<Record<InclusionReason, (pr: TrackedPr) => readonly Person[]>> = {
  authoredByMember: (pr) => [pr.author],
  memberReviewRequested: (pr) => pr.requestedReviewers,
  assignedToMember: (pr) => pr.assignees,
  reviewedByMember: (pr) => pr.reviewers,
};

/** Names the Viewer when they are one of the Team Members the reason means. */
function labelOf(reason: InclusionReason, pr: TrackedPr, viewer: string | null): string {
  const viewerLabel = VIEWER_INCLUSION_REASON_LABELS[reason];
  const isViewers = viewer !== null && (PEOPLE[reason]?.(pr).some((person) => person.login === viewer) ?? false);
  return isViewers && viewerLabel !== undefined ? viewerLabel : INCLUSION_REASON_LABELS[reason];
}

/** Why the PR is a Tracked PR: its strongest Inclusion Reason, with all of them on hover. */
export function InclusionReasonBadge({ pr, viewer }: { pr: TrackedPr; viewer: string | null }) {
  const [main] = pr.inclusionReasons;
  if (main === undefined) {
    return null;
  }
  const labels = pr.inclusionReasons.map((reason) => labelOf(reason, pr, viewer));
  return (
    <span className="flex" title={`Why tracked: ${labels.join(', ')}`}>
      <span className={cn('rounded border px-1 py-px text-[10px] font-medium whitespace-nowrap', STYLES[main])}>{labels[0]}</span>
    </span>
  );
}
