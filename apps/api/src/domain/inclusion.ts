import type { Actor, PrFacts, Roster } from './facts';
import type { InclusionReason, Person } from './trackedPr';
import { isBot } from './bots';

/** Team Members are matched by id, so a renamed account stays a member and a login reused by someone else doesn't. */
function isMember(actor: Actor, roster: Roster): boolean {
  return roster.members.some((member) => member.id === actor.id);
}

/** The people other than the author who reviewed the PR, each once, in the order they first reviewed. */
function reviewersOf(facts: PrFacts): Actor[] {
  const byId = new Map<string, Actor>();
  for (const review of facts.reviews) {
    if (review.author.id !== facts.author.id && !byId.has(review.author.id)) {
      byId.set(review.author.id, review.author);
    }
  }
  return [...byId.values()];
}

function requestedReviewersOf(facts: PrFacts): Actor[] {
  return facts.reviewRequests.flatMap((request) => (request.type === 'person' ? [request.reviewer] : []));
}

export interface Participants {
  assignees: Person[];
  requestedReviewers: Person[];
  /** Bots are left out. */
  reviewers: Person[];
}

/** Classifies an account as a Bot, a Team Member or an outsider. A Team Member whose login is configured as a Bot is a Bot. */
export function toPerson(actor: Actor, roster: Roster, botLogins: readonly string[]): Person {
  if (isBot(actor, botLogins)) {
    return { login: actor.login, kind: 'bot' };
  }
  return { login: actor.login, kind: isMember(actor, roster) ? 'member' : 'outsider' };
}

/**
 * Lists why the PR is a Tracked PR, strongest first, in the order the contract ranks the reasons.
 * Team membership decides, whatever the account's kind, so a service account in the Team counts.
 */
export function deriveInclusionReasons(facts: PrFacts, roster: Roster, teamSlug: string): InclusionReason[] {
  const anyMember = (actors: readonly Actor[]): boolean => actors.some((actor) => isMember(actor, roster));
  const applies: Record<InclusionReason, boolean> = {
    authoredByMember: isMember(facts.author, roster),
    memberReviewRequested: anyMember(requestedReviewersOf(facts)),
    teamReviewRequested: facts.reviewRequests.some((request) => request.type === 'team' && request.slug === teamSlug),
    assignedToMember: anyMember(facts.assignees),
    reviewedByMember: anyMember(reviewersOf(facts)),
    teamRepo: roster.repos.includes(facts.repo),
  };
  return (Object.keys(applies) as InclusionReason[]).filter((reason) => applies[reason]);
}

/** Lists the PR's assignees, requested reviewers and reviewers. */
export function deriveParticipants(facts: PrFacts, roster: Roster, botLogins: readonly string[]): Participants {
  const toPeople = (actors: readonly Actor[]): Person[] => actors.map((actor) => toPerson(actor, roster, botLogins));
  return {
    assignees: toPeople(facts.assignees),
    requestedReviewers: toPeople(requestedReviewersOf(facts)),
    reviewers: toPeople(reviewersOf(facts).filter((reviewer) => !isBot(reviewer, botLogins))),
  };
}
