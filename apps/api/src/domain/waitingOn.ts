import type { Actor, PrFacts, ReviewFact, Roster } from './facts';
import type { WaitingOnParty } from './trackedPr';
import type { DerivationConfig } from './deriveTrackedPr';
import type { ReviewOutcome } from './reviewStatus';
import { isBot } from './bots';
import { deriveCheckStatus } from './checkStatus';
import { toPerson } from './inclusion';
import { authorCommentedOnPrAfter, isPrAuthor, threadsOf } from './reviewActivity';

type WaitingOnConfig = Pick<DerivationConfig, 'teamSlug' | 'botLogins'>;
type Role = Extract<WaitingOnParty, { type: 'person' }>['role'];

/** Collects the parties the rules pick, each once, in the order they were picked. */
class Parties {
  private readonly byKey = new Map<string, WaitingOnParty>();

  public constructor(
    private readonly roster: Roster,
    private readonly config: WaitingOnConfig
  ) {}

  public get size(): number {
    return this.byKey.size;
  }

  public addPerson(actor: Actor, role: Role): void {
    const { login, kind } = toPerson(actor, this.roster, this.config.botLogins);
    this.add(`person:${actor.id}`, { type: 'person', login, kind, role });
  }

  public addTeam(slug: string): void {
    this.add(`team:${slug}`, { type: 'team', slug, viaTeam: slug === this.config.teamSlug });
  }

  public toArray(): WaitingOnParty[] {
    return [...this.byKey.values()];
  }

  private add(key: string, party: WaitingOnParty): void {
    if (!this.byKey.has(key)) {
      this.byKey.set(key, party);
    }
  }
}

/**
 * Whether a review on behalf of the team cleared its request, with the team not requested again since.
 * A Team Member's review carries the team in onBehalfOf. A non-member's review doesn't, so it leaves the team request open.
 */
function isTeamRequestCleared(slug: string, humanReviews: readonly ReviewFact[], facts: PrFacts): boolean {
  const requestedAfter = (at: Date): boolean =>
    facts.timeline.some(
      (event) => event.type === 'reviewRequested' && event.requested?.type === 'team' && event.requested.slug === slug && event.at > at
    );
  return humanReviews.some((review) => review.onBehalfOf.includes(slug) && !requestedAfter(review.submittedAt));
}

/** Adds the reviewers who owe a move, and the author where a reviewer is waiting on their answer. */
function addReviewParties(facts: PrFacts, review: ReviewOutcome, config: WaitingOnConfig, parties: Parties): void {
  const isHuman = (actor: Actor): boolean => !isBot(actor, config.botLogins);
  const humanReviews = facts.reviews.filter((candidate) => isHuman(candidate.author));

  for (const request of facts.reviewRequests) {
    if (request.type === 'person') {
      if (isHuman(request.reviewer)) {
        parties.addPerson(request.reviewer, 'reviewer');
      }
    } else if (!isTeamRequestCleared(request.slug, humanReviews, facts)) {
      parties.addTeam(request.slug);
    }
  }

  // A reviewer's latest verdict ignores their comment-only reviews, so a reply in a thread doesn't count as reviewing again.
  for (const verdict of review.verdicts) {
    if (verdict.verdict === 'changesRequested') {
      if (verdict.answered) {
        parties.addPerson(verdict.reviewer, 'reviewer');
      } else {
        parties.addPerson(facts.author, 'author');
      }
    }
  }

  const commentOnlyReviews = humanReviews.filter((candidate) => candidate.state === 'commented' && !isPrAuthor(candidate.author, facts));
  for (const commentOnly of commentOnlyReviews) {
    // A review that commented only in other reviews' threads is not thread-less. Those threads pick by who wrote last, below.
    if (threadsOf(commentOnly, facts).length === 0 && !authorCommentedOnPrAfter(commentOnly.submittedAt, facts)) {
      parties.addPerson(facts.author, 'author');
    }
  }

  // A thread belongs to the review that opened it. A reply in someone else's thread is not a thread of the replying review.
  for (const thread of facts.reviewThreads) {
    const opener = facts.reviews.find((candidate) => candidate.id === thread.comments[0]?.reviewId);
    if (thread.isResolved || opener === undefined || !commentOnlyReviews.includes(opener)) {
      continue;
    }
    const lastHumanComment = [...thread.comments].reverse().find((comment) => isHuman(comment.author));
    if (isPrAuthor(lastHumanComment?.author ?? null, facts)) {
      parties.addPerson(opener.author, 'reviewer');
    } else {
      parties.addPerson(facts.author, 'author');
    }
  }
}

export interface WaitingOn {
  /** Never empty, and never a Bot except a Bot PR's own author. */
  parties: WaitingOnParty[];
  noReviewer: boolean;
}

/**
 * Derives who owes the PR's next move, and whether it has No Reviewer.
 * A Draft waits on its author, and so does an approved PR, whose author owes the merge. Otherwise the PR waits on the requested
 * reviewers, on whoever owes the next move on each request for changes and comment-only review, and on the author while checks
 * fail or the PR conflicts with its base. Bot reviewers are never picked, and Bots' reviews and threads are ignored. A Bot author is
 * picked like any author, as no human owes its moves in its place.
 * A PR Awaiting Review that no reviewer owes a move on, and whose reviews owe the author nothing, has No Reviewer and waits on its author,
 * even while its checks fail or it conflicts.
 */
export function deriveWaitingOn(facts: PrFacts, review: ReviewOutcome, roster: Roster, config: WaitingOnConfig): WaitingOn {
  const parties = new Parties(roster, config);
  if (review.status === 'draft' || review.status === 'approved') {
    parties.addPerson(facts.author, 'author');
    return { parties: parties.toArray(), noReviewer: false };
  }

  addReviewParties(facts, review, config, parties);
  // Failing checks or a conflict give the author a move, but leave a PR that no reviewer owes a move on flagged.
  const noReviewer = parties.size === 0;
  if (noReviewer || deriveCheckStatus(facts) === 'failing' || facts.mergeable === 'conflicting') {
    parties.addPerson(facts.author, 'author');
  }
  return { parties: parties.toArray(), noReviewer };
}
