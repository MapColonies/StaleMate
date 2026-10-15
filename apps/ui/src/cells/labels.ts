import type { CheckStatus, InclusionReason, ReviewStatus } from '@/snapshot/types';

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: 'Draft',
  awaitingReview: 'Awaiting Review',
  changesRequested: 'Changes Requested',
  awaitingReReview: 'Awaiting Re-review',
  approved: 'Approved',
};

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  passing: 'Passing',
  failing: 'Failing',
  pending: 'Pending',
  none: 'None',
};

export const INCLUSION_REASON_LABELS: Record<InclusionReason, string> = {
  teamRepo: 'Team Repo',
  authoredByMember: 'Authored by member',
  memberReviewRequested: 'Member review requested',
  reviewedByMember: 'Reviewed by member',
  assignedToMember: 'Assigned to member',
  teamReviewRequested: 'Team review requested',
};
