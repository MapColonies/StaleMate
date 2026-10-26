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

/** A Team as the Team-relative rules see it: its slug and its roster. */
export interface Team {
  /** The Team's slug, e.g. `infra`. */
  slug: string;
  roster: Roster;
}

/** The accounts around a PR, before they are classified relative to a Team. */
export interface ParticipantActors {
  assignees: Actor[];
  requestedReviewers: Actor[];
  /** Bots are left out. */
  reviewers: Actor[];
}

export interface Participants {
  assignees: Person[];
  requestedReviewers: Person[];
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
export function deriveInclusionReasons(facts: PrFacts, { slug, roster }: Team): InclusionReason[] {
  const anyMember = (actors: readonly Actor[]): boolean => actors.some((actor) => isMember(actor, roster));
  const applies: Record<InclusionReason, boolean> = {
    authoredByMember: isMember(facts.author, roster),
    memberReviewRequested: anyMember(requestedReviewersOf(facts)),
    teamReviewRequested: facts.reviewRequests.some((request) => request.type === 'team' && request.slug === slug),
    assignedToMember: anyMember(facts.assignees),
    reviewedByMember: anyMember(reviewersOf(facts)),
    teamRepo: roster.repos.includes(facts.repo),
  };
  return (Object.keys(applies) as InclusionReason[]).filter((reason) => applies[reason]);
}

/** Lists the PR's assignees, requested reviewers and reviewers, Bot reviewers left out. */
export function deriveParticipantActors(facts: PrFacts, botLogins: readonly string[]): ParticipantActors {
  return {
    assignees: facts.assignees,
    requestedReviewers: requestedReviewersOf(facts),
    reviewers: reviewersOf(facts).filter((reviewer) => !isBot(reviewer, botLogins)),
  };
}

/** Classifies the PR's participants relative to a Team. */
export function classifyParticipants(actors: ParticipantActors, roster: Roster, botLogins: readonly string[]): Participants {
  const toPeople = (list: readonly Actor[]): Person[] => list.map((actor) => toPerson(actor, roster, botLogins));
  return {
    assignees: toPeople(actors.assignees),
    requestedReviewers: toPeople(actors.requestedReviewers),
    reviewers: toPeople(actors.reviewers),
  };
}
