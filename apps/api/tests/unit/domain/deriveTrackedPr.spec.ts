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
    ['conflicting', true],
    ['mergeable', false],
    ['unknown', false],
  ] as const)('should mark a PR whose mergeability is %s as conflicting: %s', function (mergeable, conflicting) {
    const trackedPr = deriveTrackedPr(aPrFacts({ mergeable }), aRoster(), aDerivationConfig(), now);

    expect(trackedPr.conflicting).toBe(conflicting);
  });

  it.each<[string, string, string[]]>([
    ['a key at the end', 'feat: add retry policy MAPCO-1234', ['MAPCO-1234']],
    ['a bracketed key at the start', '[MAPCO-7] fix: cache headers', ['MAPCO-7']],
    ['several keys, in title order', 'MAPCO-20 MAPCO-3: split the job', ['MAPCO-20', 'MAPCO-3']],
    ['the same key twice', 'MAPCO-5: fix MAPCO-5 again', ['MAPCO-5']],
    ['no key', 'fix: cache headers', []],
    ['a key of another project', 'fix: cache headers OTHER-12', []],
    ['an issue-key-like token', 'fix: read UTF-8 and SHA-256', []],
    ['a key inside a longer word', 'fix: XMAPCO-12 and MAPCO-12a', []],
    ['a lowercase key', 'fix: cache headers mapco-12', []],
  ])('should read the Jira Tickets of a title with %s', function (_, title, jiraTickets) {
    const trackedPr = deriveTrackedPr(aPrFacts({ title }), aRoster(), aDerivationConfig({ jiraProjectKeys: ['MAPCO', 'SHIELD'] }), now);

    expect(trackedPr.jiraTickets).toStrictEqual(jiraTickets);
  });

  it('should read the Jira Tickets of every configured project', function () {
    const trackedPr = deriveTrackedPr(
      aPrFacts({ title: 'SHIELD-1: MAPCO-2' }),
      aRoster(),
      aDerivationConfig({ jiraProjectKeys: ['MAPCO', 'SHIELD'] }),
      now
    );

    expect(trackedPr.jiraTickets).toStrictEqual(['SHIELD-1', 'MAPCO-2']);
  });

  it.each([
    ['an open PR', aPrFacts()],
    ['a PR with Jira Tickets', aPrFacts({ title: 'feat: add retry policy MAPCO-1234' })],
    ['a draft', aPrFacts({ isDraft: true })],
  ])('should return a contract-valid Tracked PR for %s', function (_, facts) {
    const trackedPr = deriveTrackedPr(facts, aRoster(), aDerivationConfig(), now);

    expect(trackedPr).toSatisfySchemaInApiSpec('trackedPr');
  });
});
