import type { PrFacts, Roster } from '@domain/facts';

export interface SweepResult {
  roster: Roster;
  /** Every Tracked PR, open ones only. */
  prs: PrFacts[];
}

/** Reads the Team and its Tracked PRs from a code host in one full sweep. */
export interface PrProvider {
  sweep: () => Promise<SweepResult>;
}
