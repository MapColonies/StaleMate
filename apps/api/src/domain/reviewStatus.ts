import type { Actor, PrFacts, ReviewFact } from './facts';
import type { ReviewStatus } from './trackedPr';
import { isBot } from './bots';
import { authorCommentedOnPrAfter, isPrAuthor, threadsOf } from './reviewActivity';

type VerdictReview = ReviewFact & { state: ReviewerVerdict['verdict'] };

/** Each reviewer's latest verdict. A dismissed review cancels the reviewer's verdict. */
function latestVerdictReviews(facts: PrFacts, botLogins: readonly string[]): VerdictReview[] {
  const latestByReviewer = new Map<string, ReviewFact>();
  for (const review of facts.reviews) {
    if (review.state === 'commented' || review.author.id === facts.author.id || isBot(review.author, botLogins)) {
      continue;
    }
    latestByReviewer.set(review.author.id, review);
  }
  return [...latestByReviewer.values()].filter((review): review is VerdictReview => review.state !== 'dismissed');
}

/** Whether the PR's side has responded to a request for changes since it was given. */
function isAnswered(review: ReviewFact, facts: PrFacts): boolean {
  // A review whose commit the code host no longer knows was given on a commit a force push replaced.
  // Updating the branch counts as new commits too. That's accepted noise.
  const hasNewCommits = review.commitOid !== facts.headCommit.oid;
  const reRequested = facts.timeline.some(
    (event) =>
      event.type === 'reviewRequested' &&
      event.requested?.type === 'person' &&
      event.requested.reviewer.id === review.author.id &&
      event.at > review.submittedAt
  );
  if (hasNewCommits || reRequested) {
    return true;
  }

  const threads = threadsOf(review, facts);
  if (threads.length > 0) {
    return threads.every(
      (thread) => thread.isResolved || thread.comments.some((comment) => isPrAuthor(comment.author, facts) && comment.createdAt > review.submittedAt)
    );
  }
  return authorCommentedOnPrAfter(review.submittedAt, facts);
}

/** A reviewer's latest verdict on the PR. */
export interface ReviewerVerdict {
  reviewer: Actor;
  verdict: 'approved' | 'changesRequested';
  submittedAt: Date;
  /** Whether a request for changes is Answered. Always false for an approval. */
  answered: boolean;
}

export interface ReviewOutcome {
  status: ReviewStatus;
  /** The number of current approvals. */
  approvals: number;
  /** One per reviewer with a current verdict. A Draft's reviews are ignored, so it has none. */
  verdicts: ReviewerVerdict[];
}

/**
 * Derives the PR's Review Status from its reviews, by the Team's norm of one current approval with nothing outstanding.
 * Each reviewer's latest verdict counts. Comment-only reviews, the author's own reviews and Bot reviews are ignored.
 */
export function deriveReviewStatus(facts: PrFacts, botLogins: readonly string[]): ReviewOutcome {
  if (facts.isDraft) {
    return { status: 'draft', approvals: 0, verdicts: [] };
  }

  const verdicts = latestVerdictReviews(facts, botLogins).map((review): ReviewerVerdict => ({
    reviewer: review.author,
    verdict: review.state,
    submittedAt: review.submittedAt,
    answered: review.state === 'changesRequested' && isAnswered(review, facts),
  }));
  const approvals = verdicts.filter((verdict) => verdict.verdict === 'approved').length;
  const requestsForChanges = verdicts.filter((verdict) => verdict.verdict === 'changesRequested');

  let status: ReviewStatus = 'awaitingReview';
  if (requestsForChanges.some((verdict) => !verdict.answered)) {
    status = 'changesRequested';
  } else if (requestsForChanges.length > 0) {
    status = 'awaitingReReview';
  } else if (approvals > 0) {
    status = 'approved';
  }
  return { status, approvals, verdicts };
}
