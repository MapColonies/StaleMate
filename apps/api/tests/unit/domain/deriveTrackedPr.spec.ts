import { describe, expect, it } from 'vitest';
import 'jest-openapi';
import type { StackEntryFact } from '@domain/facts';
import { deriveTeamFreePr, deriveTrackedPr } from '@domain/deriveTrackedPr';
import { aDerivationConfig, anActor, aPrFacts, aReview, aTeam } from '@tests/utils/facts';

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

    const trackedPr = deriveTrackedPr(facts, aTeam(), aDerivationConfig(), now);

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
    const trackedPr = deriveTrackedPr(aPrFacts({ mergeable }), aTeam(), aDerivationConfig(), now);

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
    const trackedPr = deriveTrackedPr(aPrFacts({ title }), aTeam(), aDerivationConfig({ jiraProjectKeys: ['MAPCO', 'SHIELD'] }), now);

    expect(trackedPr.jiraTickets).toStrictEqual(jiraTickets);
  });

  it('should read the Jira Tickets of every configured project', function () {
    const trackedPr = deriveTrackedPr(
      aPrFacts({ title: 'SHIELD-1: MAPCO-2' }),
      aTeam(),
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
    const trackedPr = deriveTrackedPr(facts, aTeam(), aDerivationConfig(), now);

    expect(trackedPr).toSatisfySchemaInApiSpec('trackedPr');
  });

  it('should derive the Team-free part from the facts alone, and each Team its own view of the same PR', function () {
    const facts = aPrFacts({ author: anActor({ id: 'U_zed', login: 'zed' }), reviewRequests: [{ type: 'team', slug: 'infra', asCodeOwner: false }] });

    const teamFree = deriveTeamFreePr(facts, aDerivationConfig());
    const infra = deriveTrackedPr(facts, aTeam({ slug: 'infra' }), aDerivationConfig(), now);
    const raster = deriveTrackedPr(facts, aTeam({ slug: 'raster' }), aDerivationConfig(), now);

    expect(teamFree.waitingOn).toContainEqual({ type: 'team', slug: 'infra' });
    expect(infra.waitingOn).toContainEqual({ type: 'team', slug: 'infra', viaTeam: true });
    expect(raster.waitingOn).toContainEqual({ type: 'team', slug: 'infra', viaTeam: false });
    expect(infra.inclusionReasons).toContain('teamReviewRequested');
    expect(raster.inclusionReasons).not.toContain('teamReviewRequested');
  });

  describe('stack', function () {
    const entry = (number: number, overrides: Partial<StackEntryFact> = {}): StackEntryFact => ({
      repo: 'MapColonies/jobnik',
      number,
      title: `feat: step ${number}`,
      url: `https://github.com/MapColonies/jobnik/pull/${number}`,
      state: 'open',
      isDraft: false,
      reviewDecision: 'approved',
      checkRollup: 'success',
      ...overrides,
    });

    it('should leave a PR with no Stack without one', function () {
      const trackedPr = deriveTrackedPr(aPrFacts(), aTeam(), aDerivationConfig(), now);

      expect(trackedPr).not.toHaveProperty('stack');
    });

    it('should carry a PR’s Stack over as its number, position, size and ordered siblings', function () {
      const facts = aPrFacts({
        stack: {
          number: 9,
          position: 2,
          size: 3,
          entriesTruncated: false,
          entries: [entry(64, { state: 'merged' }), entry(65), entry(66, { isDraft: true })],
        },
      });

      const trackedPr = deriveTrackedPr(facts, aTeam(), aDerivationConfig(), now);

      expect(trackedPr.stack).toStrictEqual({
        number: 9,
        position: 2,
        size: 3,
        truncated: false,
        siblings: [
          {
            repo: 'MapColonies/jobnik',
            number: 64,
            title: 'feat: step 64',
            url: 'https://github.com/MapColonies/jobnik/pull/64',
            state: 'merged',
            draft: false,
            tracked: false,
          },
          {
            repo: 'MapColonies/jobnik',
            number: 65,
            title: 'feat: step 65',
            url: 'https://github.com/MapColonies/jobnik/pull/65',
            state: 'open',
            draft: false,
            tracked: false,
          },
          {
            repo: 'MapColonies/jobnik',
            number: 66,
            title: 'feat: step 66',
            url: 'https://github.com/MapColonies/jobnik/pull/66',
            state: 'open',
            draft: true,
            tracked: false,
          },
        ],
      });
      expect(trackedPr).toSatisfySchemaInApiSpec('trackedPr');
    });

    it('should keep the real size and mark the list cut short when the entries were', function () {
      const facts = aPrFacts({ stack: { number: 9, position: 1, size: 13, entriesTruncated: true, entries: [entry(65)] } });

      const trackedPr = deriveTrackedPr(facts, aTeam(), aDerivationConfig(), now);

      expect(trackedPr.stack).toMatchObject({ size: 13, truncated: true });
      expect(trackedPr).toSatisfySchemaInApiSpec('trackedPr');
    });

    it('should change nothing else about the PR', function () {
      const plain = deriveTrackedPr(aPrFacts(), aTeam(), aDerivationConfig(), now);
      const stacked = deriveTrackedPr(
        aPrFacts({ stack: { number: 9, position: 2, size: 3, entriesTruncated: false, entries: [entry(65)] } }),
        aTeam(),
        aDerivationConfig(),
        now
      );

      const { stack, ...rest } = stacked;

      expect(stack).toBeDefined();
      expect(rest).toStrictEqual(plain);
    });

    describe('held', function () {
      const readyFacts = (entries: StackEntryFact[], position: number) =>
        aPrFacts({
          repo: entries[position - 1]?.repo,
          number: entries[position - 1]?.number,
          reviews: [aReview()],
          stack: { number: 9, position, size: entries.length, entriesTruncated: false, entries },
        });
      const held = (facts: ReturnType<typeof aPrFacts>) => deriveTrackedPr(facts, aTeam(), aDerivationConfig(), now);

      it.each<[string, Partial<StackEntryFact>]>([
        ['unapproved', { reviewDecision: 'reviewRequired' }],
        ['asked for changes', { reviewDecision: 'changesRequested' }],
        ['failing', { checkRollup: 'failure' }],
        ['pending', { checkRollup: 'pending' }],
        ['a draft', { isDraft: true }],
      ])('should hold an Approved, Passing PR when a PR below it is %s', function (_, lower) {
        const trackedPr = held(readyFacts([entry(64, lower), entry(65)], 2));

        expect(trackedPr.stack?.heldBy).toStrictEqual({ repo: 'MapColonies/jobnik', number: 64 });
        expect(trackedPr).toSatisfySchemaInApiSpec('trackedPr');
      });

      it('should name the lowest PR that is not ready', function () {
        const trackedPr = held(readyFacts([entry(64), entry(65, { checkRollup: 'failure' }), entry(66, { isDraft: true }), entry(67)], 4));

        expect(trackedPr.stack?.heldBy).toStrictEqual({ repo: 'MapColonies/jobnik', number: 65 });
      });

      it('should not hold a PR when every PR below it is ready', function () {
        expect(held(readyFacts([entry(64), entry(65)], 2)).stack).not.toHaveProperty('heldBy');
      });

      it('should not hold a PR for a PR above it or for one that already merged', function () {
        const entries = [entry(64, { state: 'merged', reviewDecision: 'reviewRequired' }), entry(65), entry(66, { checkRollup: 'failure' })];

        expect(held(readyFacts(entries, 2)).stack).not.toHaveProperty('heldBy');
      });

      it('should not hold a PR at position 1', function () {
        expect(held(readyFacts([entry(65), entry(66, { checkRollup: 'failure' })], 1)).stack).not.toHaveProperty('heldBy');
      });

      it('should not hold a PR that is not itself Approved and Passing', function () {
        const entries = [entry(64, { reviewDecision: 'reviewRequired' }), entry(65)];
        const unapproved = aPrFacts({
          repo: 'MapColonies/jobnik',
          number: 65,
          stack: { number: 9, position: 2, size: 2, entriesTruncated: false, entries },
        });
        const failing = {
          ...readyFacts(entries, 2),
          headCommit: { ...aPrFacts().headCommit, checks: [{ name: 'build', state: 'failed' as const }] },
        };

        expect(held(unapproved).stack).not.toHaveProperty('heldBy');
        expect(held(failing).stack).not.toHaveProperty('heldBy');
      });

      it('should change no Move, Waiting On, Review Status or Urgency', function () {
        const entries = [entry(64, { reviewDecision: 'reviewRequired' }), entry(65)];
        const stacked = readyFacts(entries, 2);
        const heldPr = held(stacked);
        const { stack: heldStack, ...heldRest } = heldPr;
        const { stack: plainStack, ...plainRest } = held({ ...stacked, stack: { ...stacked.stack!, entries: [entry(64), entry(65)] } });

        expect(heldStack?.heldBy).toBeDefined();
        expect(plainStack?.heldBy).toBeUndefined();
        expect(heldRest).toStrictEqual(plainRest);
      });
    });
  });
});
