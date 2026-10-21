import type { PrFacts, Roster } from '@domain/facts';

export interface SweepResult {
  roster: Roster;
  /** Every Tracked PR, open ones only. */
  prs: PrFacts[];
}

/** A Tracked PR as discovery finds it: which PR, and when the code host last saw it change. */
export interface DiscoveredPr {
  id: string;
  updatedAt: Date;
}

export interface Discovery {
  roster: Roster;
  /** Every Tracked PR, open ones only. */
  prs: DiscoveredPr[];
}

/**
 * Reads the Team and its Tracked PRs from a code host. Finding out what is open and reading chosen PRs are separate,
 * so which PRs to read is StaleMate's decision. Both reject with a SweepError when they can tell why they failed.
 */
export interface PrProvider {
  discover: () => Promise<Discovery>;
  /** Reads the facts of exactly these PRs. A PR gone by the time it is read is left out. */
  read: (ids: readonly string[]) => Promise<PrFacts[]>;
}

/** Why a sweep failed: the code host couldn't be reached, refused StaleMate's credentials, or ran out of rate limit. */
export type SweepFailure = 'unreachable' | 'authentication' | 'rateLimit';

/** A failed sweep whose cause the provider recognised. */
export class SweepError extends Error {
  public constructor(
    public readonly failure: SweepFailure,
    options?: ErrorOptions
  ) {
    super(`sweep failed: ${failure}`, options);
    this.name = 'SweepError';
  }
}

export const PR_PROVIDER = Symbol('PrProvider');
