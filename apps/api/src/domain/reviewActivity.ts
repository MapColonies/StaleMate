import type { Actor, PrFacts, ReviewFact, ReviewThreadFact } from './facts';

export function isPrAuthor(actor: Actor | null, facts: PrFacts): boolean {
  return actor?.id === facts.author.id;
}

/** The threads the review commented in, including threads an earlier review opened. */
export function threadsOf(review: ReviewFact, facts: PrFacts): ReviewThreadFact[] {
  return facts.reviewThreads.filter((thread) => thread.comments.some((comment) => comment.reviewId === review.id));
}

/** Whether the PR's author left a top-level PR comment after the instant. */
export function authorCommentedOnPrAfter(at: Date, facts: PrFacts): boolean {
  return facts.timeline.some((event) => event.type === 'comment' && isPrAuthor(event.actor, facts) && event.at > at);
}
