/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters, used once #15 lands */
import type { PrFacts } from './facts';
import type { ReviewStatus } from './trackedPr';

export interface ReviewOutcome {
  status: ReviewStatus;
  /** The number of current approvals. */
  approvals: number;
}

/**
 * Derives the PR's Review Status from its reviews.
 *
 * Stub: returns a placeholder. Owned by #15 (Review Status and Check Status derivation).
 */
export function deriveReviewStatus(_facts: PrFacts): ReviewOutcome {
  return { status: 'awaitingReview', approvals: 0 };
}
