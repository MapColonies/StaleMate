import type { PrFacts, Roster } from '@domain/facts';

export interface SweepResult {
  roster: Roster;
  /** Every Tracked PR, open ones only. */
  prs: PrFacts[];
}

/** Reads the Team and its Tracked PRs from a code host in one full sweep. */
export interface PrProvider {
  /** Rejects with a SweepError when it can tell why the sweep failed. */
  sweep: () => Promise<SweepResult>;
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
