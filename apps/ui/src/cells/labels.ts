import type { CheckStatus, InclusionReason, Move, ReviewStatus } from '@/snapshot/types';

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
  none: 'No checks',
};

/** Strongest first, as the contract ranks them. */
export const INCLUSION_REASON_LABELS: Record<InclusionReason, string> = {
  authoredByMember: 'Authored by Team Member',
  memberReviewRequested: 'Team Member review requested',
  teamReviewRequested: 'Team review requested',
  assignedToMember: 'Assigned to Team Member',
  reviewedByMember: 'Reviewed by Team Member',
  teamRepo: 'Team Repo',
};

/** The Inclusion Reasons that name a Team Member, as they read when that Team Member is the Viewer. */
export const VIEWER_INCLUSION_REASON_LABELS: Partial<Record<InclusionReason, string>> = {
  authoredByMember: 'Authored by you',
  memberReviewRequested: 'Your review requested',
  assignedToMember: 'Assigned to you',
  reviewedByMember: 'Reviewed by you',
};

export const MOVE_LABELS: Record<Move, string> = {
  finishDraft: 'Finish draft',
  merge: 'Merge',
  answerChanges: 'Answer changes',
  reply: 'Reply',
  findReviewer: 'Find reviewer',
  fixChecks: 'Fix checks',
  resolveConflict: 'Resolve conflict',
  review: 'Review',
  reReview: 'Re-review',
};
