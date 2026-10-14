/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters, used once #17 lands */
import type { PrFacts } from './facts';
import type { DerivationConfig } from './deriveTrackedPr';
import type { Clock, Urgency } from './trackedPr';

export interface Clocks {
  age: Clock;
  idleTime: Clock;
  urgency: Urgency;
}

/**
 * Derives the PR's Age, Idle Time and Urgency in Working Days up to `now`.
 *
 * Stub: returns placeholders that start at `createdAt` with no working time. Owned by #17 (Age, Idle Time and Urgency).
 */
export function deriveClocks(facts: PrFacts, _urgencyThresholds: DerivationConfig['urgencyThresholds'], _now: Date): Clocks {
  const since = facts.createdAt.toISOString();
  return { age: { workingMs: 0, since }, idleTime: { workingMs: 0, since }, urgency: 0 };
}
