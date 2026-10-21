import type { PrFacts } from './facts';
import type { CheckStatus } from './trackedPr';

/**
 * Derives the PR's Check Status from the head commit's checks, leaving out the Excluded Checks. Any failed check
 * makes it failing, else any pending one makes it pending. A PR with no checks left has none.
 */
export function deriveCheckStatus(facts: PrFacts, excludedChecks: readonly string[]): CheckStatus {
  const states = facts.headCommit.checks.filter((check) => !excludedChecks.includes(check.name)).map((check) => check.state);
  if (states.length === 0) {
    return 'none';
  }
  if (states.includes('failed')) {
    return 'failing';
  }
  return states.includes('pending') ? 'pending' : 'passing';
}
