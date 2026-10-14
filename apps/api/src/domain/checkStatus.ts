import type { CheckRollupState, PrFacts } from './facts';
import type { CheckStatus } from './trackedPr';

const checkStatusByRollup: Record<CheckRollupState, CheckStatus> = {
  success: 'passing',
  failure: 'failing',
  error: 'failing',
  pending: 'pending',
  expected: 'pending',
};

/** Derives the PR's Check Status from the head commit's rollup over all checks. A PR with no checks has none. */
export function deriveCheckStatus(facts: PrFacts): CheckStatus {
  const rollup = facts.headCommit.checkRollup;
  return rollup === null ? 'none' : checkStatusByRollup[rollup];
}
