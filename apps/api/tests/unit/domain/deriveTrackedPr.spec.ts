import { describe, expect, it } from 'vitest';
import 'jest-openapi';
import { deriveTrackedPr } from '@domain/deriveTrackedPr';
import { aDerivationConfig, anActor, aPrFacts, aRoster } from '@tests/utils/facts';

const now = new Date('2026-10-14T12:00:00Z');

describe('deriveTrackedPr', function () {
  it('should carry the PR identity over from the facts', function () {
    const facts = aPrFacts({
      id: 'PR_42',
      repo: 'MapColonies/nginx',
      number: 42,
      title: 'fix: cache headers',
      url: 'https://github.com/x/42',
      author: anActor({ id: 'U_bob', login: 'bob' }),
    });

    const trackedPr = deriveTrackedPr(facts, aRoster(), aDerivationConfig(), now);

    expect(trackedPr).toMatchObject({
      id: 'PR_42',
      repo: 'MapColonies/nginx',
      number: 42,
      title: 'fix: cache headers',
      url: 'https://github.com/x/42',
      author: { login: 'bob' },
    });
  });

  it.each([
    ['an open PR', aPrFacts()],
    ['a draft', aPrFacts({ isDraft: true })],
  ])('should return a contract-valid Tracked PR for %s', function (_, facts) {
    const trackedPr = deriveTrackedPr(facts, aRoster(), aDerivationConfig(), now);

    expect(trackedPr).toSatisfySchemaInApiSpec('trackedPr');
  });
});
