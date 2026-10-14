import type { PrFacts } from './facts';
import type { Person, WaitingOnParty } from './trackedPr';

export interface WaitingOn {
  /** Never empty and never a Bot. */
  parties: WaitingOnParty[];
  noReviewer: boolean;
}

/**
 * Derives who owes the PR's next move, and whether it has No Reviewer.
 *
 * Stub: returns a placeholder that always waits on the author. Owned by #16 (Waiting On and No Reviewer derivation).
 */
export function deriveWaitingOn(_facts: PrFacts, author: Person): WaitingOn {
  return { parties: [{ type: 'person', login: author.login, kind: author.kind, role: 'author' }], noReviewer: false };
}
