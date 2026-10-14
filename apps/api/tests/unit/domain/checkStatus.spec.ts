import { describe, expect, it } from 'vitest';
import type { CheckRollupState } from '@domain/facts';
import type { CheckStatus } from '@domain/trackedPr';
import { deriveCheckStatus } from '@domain/checkStatus';
import { aPrFacts } from '@tests/utils/facts';

describe('deriveCheckStatus', function () {
  it.each<[CheckRollupState | null, CheckStatus]>([
    ['success', 'passing'],
    ['failure', 'failing'],
    ['error', 'failing'],
    ['pending', 'pending'],
    ['expected', 'pending'],
    [null, 'none'],
  ])('should map a %s rollup to %s', function (checkRollup, expected) {
    const facts = aPrFacts();
    facts.headCommit.checkRollup = checkRollup;

    expect(deriveCheckStatus(facts)).toBe(expected);
  });
});
