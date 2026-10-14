/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters, used once #18 lands */
import type { Actor, PrFacts, Roster } from './facts';
import type { InclusionReason, Person } from './trackedPr';

export interface Participants {
  assignees: Person[];
  requestedReviewers: Person[];
  reviewers: Person[];
}

/**
 * Classifies an account as a Team Member, a Bot or an outsider.
 *
 * Stub: returns a placeholder that treats everyone as a Team Member. Owned by #18 (Serve the Snapshot from the fixture provider).
 */
export function toPerson(actor: Actor, _roster: Roster, _botLogins: readonly string[]): Person {
  return { login: actor.login, kind: 'member' };
}

/**
 * Lists why the PR is a Tracked PR.
 *
 * Stub: returns a placeholder. Owned by #18 (Serve the Snapshot from the fixture provider).
 */
export function deriveInclusionReasons(_facts: PrFacts, _roster: Roster, _teamSlug: string): InclusionReason[] {
  return ['teamRepo'];
}

/**
 * Lists the PR's assignees, requested reviewers and reviewers.
 *
 * Stub: returns a placeholder with nobody. Owned by #18 (Serve the Snapshot from the fixture provider).
 */
export function deriveParticipants(_facts: PrFacts, _roster: Roster, _botLogins: readonly string[]): Participants {
  return { assignees: [], requestedReviewers: [], reviewers: [] };
}
