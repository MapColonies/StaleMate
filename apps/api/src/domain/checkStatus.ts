/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters, used once #15 lands */
import type { PrFacts } from './facts';
import type { CheckStatus } from './trackedPr';

/**
 * Derives the PR's Check Status from the head commit's check rollup.
 *
 * Stub: returns a placeholder. Owned by #15 (Review Status and Check Status derivation).
 */
export function deriveCheckStatus(_facts: PrFacts): CheckStatus {
  return 'none';
}
