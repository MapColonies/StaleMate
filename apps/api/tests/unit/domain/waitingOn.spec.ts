import { describe, expect, it } from 'vitest';
import type { Actor, CheckRollupState, PrFacts, ReviewRequestFact } from '@domain/facts';
import type { WaitingOnParty } from '@domain/trackedPr';
import { deriveTrackedPr } from '@domain/deriveTrackedPr';
import { aDerivationConfig, anActor, aPrFacts, aReview, aReviewThread, aRoster, aThreadComment } from '@tests/utils/facts';

const now = new Date('2026-10-14T12:00:00Z');

const alice = anActor({ id: 'U_alice', login: 'alice' });
const bob = anActor({ id: 'U_bob', login: 'bob' });
const carol = anActor({ id: 'U_carol', login: 'carol' });
// Not a Team Member.
const dave = anActor({ id: 'U_dave', login: 'dave' });
// Copilot's GraphQL login differs from its REST login, so only its id and type are stable.
const copilot = anActor({ id: 'BOT_copilot', login: 'copilot-pull-request-reviewer', isBot: true });
const serviceAccount = anActor({ id: 'U_devops', login: 'mapcolonies-devops' });

const roster = aRoster({ members: [alice, bob, carol] });

const earlier = new Date('2026-10-13T07:00:00Z');
const reviewedAt = new Date('2026-10-13T08:00:00Z');
const later = new Date('2026-10-13T09:00:00Z');
const latest = new Date('2026-10-13T10:00:00Z');

const requested = (reviewer: Actor): ReviewRequestFact => ({ type: 'person', reviewer, asCodeOwner: false });
const teamRequested = (slug: string): ReviewRequestFact => ({ type: 'team', slug, asCodeOwner: false });
const withChecks = (checkRollup: CheckRollupState): Partial<PrFacts> => ({ headCommit: { ...aPrFacts().headCommit, checkRollup } });

/** Names each party: `author` for the author, the login for a reviewer and `@slug` for a team. */
function describeParty(party: WaitingOnParty): string {
  if (party.type === 'team') {
    return `@${party.slug}`;
  }
  return party.role === 'author' ? 'author' : party.login;
}

function waitingOnOf(overrides: Partial<PrFacts>): { waitingOn: string[]; noReviewer: boolean } {
  const trackedPr = deriveTrackedPr(aPrFacts({ author: alice, ...overrides }), roster, aDerivationConfig(), now);
  return { waitingOn: trackedPr.waitingOn.map(describeParty), noReviewer: trackedPr.noReviewer };
}

describe('Waiting On', function () {
  // The Waiting On column of the worked scenarios in "Rules for Review Status, Check Status and Waiting On" (#4).
  // A is bob, B is carol and C is dave.
  const bobsQuestion = aThreadComment({ author: bob, createdAt: reviewedAt, reviewId: 'PRR_a' });
  const alicesReply = aThreadComment({ author: alice, createdAt: later, reviewId: 'PRR_reply' });

  it.each<[string, Partial<PrFacts>, string[], boolean]>([
    ['a new PR with A requested', { reviewRequests: [requested(bob)] }, ['bob'], false],
    ['A requested and checks failing', { reviewRequests: [requested(bob)], ...withChecks('failure') }, ['bob', 'author'], false],
    [
      'A asking for changes with B still requested',
      { reviews: [aReview({ author: bob, state: 'changesRequested' })], reviewRequests: [requested(carol)] },
      ['author', 'carol'],
      false,
    ],
    [
      "the author replying on all of A's threads with B still requested",
      {
        reviews: [aReview({ id: 'PRR_a', author: bob, state: 'changesRequested', submittedAt: reviewedAt })],
        reviewThreads: [aReviewThread({ comments: [bobsQuestion, alicesReply] })],
        reviewRequests: [requested(carol)],
      },
      ['bob', 'carol'],
      false,
    ],
    [
      "the author replying on all of A's threads, without re-requesting A",
      {
        reviews: [aReview({ id: 'PRR_a', author: bob, state: 'changesRequested', submittedAt: reviewedAt })],
        reviewThreads: [aReviewThread({ comments: [bobsQuestion, alicesReply] })],
      },
      ['bob'],
      false,
    ],
    [
      'A leaving a comment-only review with a question thread',
      {
        reviews: [aReview({ id: 'PRR_a', author: bob, state: 'commented', submittedAt: reviewedAt })],
        reviewThreads: [aReviewThread({ comments: [bobsQuestion] })],
      },
      ['author'],
      false,
    ],
    [
      "the author replying to A's question",
      {
        reviews: [aReview({ id: 'PRR_a', author: bob, state: 'commented', submittedAt: reviewedAt })],
        reviewThreads: [aReviewThread({ comments: [bobsQuestion, alicesReply] })],
      },
      ['bob'],
      false,
    ],
    [
      "A's question thread being resolved",
      {
        reviews: [aReview({ id: 'PRR_a', author: bob, state: 'commented', submittedAt: reviewedAt })],
        reviewThreads: [aReviewThread({ isResolved: true, comments: [bobsQuestion, alicesReply] })],
      },
      ['author'],
      true,
    ],
    [
      'A approving with B still requested',
      { reviews: [aReview({ author: bob, state: 'approved' })], reviewRequests: [requested(carol)] },
      ['author'],
      false,
    ],
    ['an approved PR with checks failing', { reviews: [aReview({ author: bob, state: 'approved' })], ...withChecks('failure') }, ['author'], false],
    [
      'an approved PR conflicting with its base',
      { reviews: [aReview({ author: bob, state: 'approved' })], mergeable: 'conflicting' },
      ['author'],
      false,
    ],
    ['only @infra requested', { reviewRequests: [teamRequested('infra')] }, ['@infra'], false],
    ['only Copilot requested', { reviewRequests: [requested(copilot)] }, ['author'], true],
    ['nobody requested', {}, ['author'], true],
    ['unrequested reviewer C asking for changes', { reviews: [aReview({ author: dave, state: 'changesRequested' })] }, ['author'], false],
    [
      'a draft, even with reviewers requested and checks failing',
      { isDraft: true, reviewRequests: [requested(bob)], ...withChecks('failure') },
      ['author'],
      false,
    ],
  ])('should derive Waiting On for %s', function (_, overrides, waitingOn, noReviewer) {
    const derived = waitingOnOf(overrides);

    expect(derived.waitingOn).toIncludeSameMembers(waitingOn);
    expect(derived.noReviewer).toBe(noReviewer);
  });

  describe('a team request', function () {
    it('should name the Team as its own party, which every Team Member counts as Waiting On', function () {
      const trackedPr = deriveTrackedPr(aPrFacts({ reviewRequests: [teamRequested('infra')] }), roster, aDerivationConfig(), now);

      expect(trackedPr.waitingOn).toStrictEqual([{ type: 'team', slug: 'infra', viaTeam: true }]);
    });

    it('should name another team as a party that leaves no Team Member Waiting On it', function () {
      const trackedPr = deriveTrackedPr(aPrFacts({ reviewRequests: [teamRequested('raster')] }), roster, aDerivationConfig(), now);

      expect(trackedPr.waitingOn).toStrictEqual([{ type: 'team', slug: 'raster', viaTeam: false }]);
    });

    // The author's PR comment answers each comment-only review, so only the team request is left to decide.
    const answeredByTheAuthor: Partial<PrFacts> = { timeline: [{ type: 'comment', at: latest, actor: alice }] };

    it("should be cleared by a Team Member's review on behalf of the team", function () {
      const derived = waitingOnOf({
        reviewRequests: [teamRequested('infra')],
        reviews: [aReview({ author: bob, state: 'commented', submittedAt: reviewedAt, onBehalfOf: ['infra'] })],
        ...answeredByTheAuthor,
      });

      expect(derived).toStrictEqual({ waitingOn: ['author'], noReviewer: true });
    });

    it("should stay open after an outsider's review", function () {
      const derived = waitingOnOf({
        reviewRequests: [teamRequested('infra')],
        reviews: [aReview({ author: dave, state: 'commented', submittedAt: reviewedAt, onBehalfOf: [] })],
        ...answeredByTheAuthor,
      });

      expect(derived).toStrictEqual({ waitingOn: ['@infra'], noReviewer: false });
    });

    it("should stay open after a Bot's review on behalf of the team", function () {
      const derived = waitingOnOf({
        reviewRequests: [teamRequested('infra')],
        reviews: [aReview({ author: copilot, state: 'commented', submittedAt: reviewedAt, onBehalfOf: ['infra'] })],
      });

      expect(derived).toStrictEqual({ waitingOn: ['@infra'], noReviewer: false });
    });

    it('should open again when the team is requested after the review that cleared it', function () {
      const derived = waitingOnOf({
        reviewRequests: [teamRequested('infra')],
        reviews: [aReview({ author: bob, state: 'commented', submittedAt: reviewedAt, onBehalfOf: ['infra'] })],
        timeline: [
          { type: 'comment', at: later, actor: alice },
          { type: 'reviewRequested', at: latest, actor: alice, requested: teamRequested('infra') },
        ],
      });

      expect(derived).toStrictEqual({ waitingOn: ['@infra'], noReviewer: false });
    });
  });

  describe('Bots', function () {
    it.each([
      ['Copilot', copilot],
      ['a configured service account', serviceAccount],
    ])('should flag No Reviewer when the only requested reviewer is %s', function (_, bot) {
      expect(waitingOnOf({ reviewRequests: [requested(bot)] })).toStrictEqual({ waitingOn: ['author'], noReviewer: true });
    });

    it("should ignore a Bot's comment-only review and its threads", function () {
      const derived = waitingOnOf({
        reviews: [aReview({ id: 'PRR_copilot', author: copilot, state: 'commented', submittedAt: reviewedAt })],
        reviewThreads: [aReviewThread({ comments: [aThreadComment({ author: copilot, createdAt: reviewedAt, reviewId: 'PRR_copilot' })] })],
      });

      expect(derived).toStrictEqual({ waitingOn: ['author'], noReviewer: true });
    });

    it('should ignore Bot comments when deciding who wrote last in a thread', function () {
      const derived = waitingOnOf({
        reviews: [aReview({ id: 'PRR_a', author: bob, state: 'commented', submittedAt: reviewedAt })],
        reviewThreads: [
          aReviewThread({ comments: [bobsQuestion, alicesReply, aThreadComment({ author: copilot, createdAt: latest, reviewId: 'PRR_copilot' })] }),
        ],
      });

      expect(derived).toStrictEqual({ waitingOn: ['bob'], noReviewer: false });
    });
  });

  describe('a comment-only review', function () {
    const bobsComment = aReview({ id: 'PRR_a', author: bob, state: 'commented', submittedAt: reviewedAt });

    it('should wait on the author when it has no threads', function () {
      expect(waitingOnOf({ reviews: [bobsComment] })).toStrictEqual({ waitingOn: ['author'], noReviewer: false });
    });

    it('should stop waiting on the author once the author comments on the PR after a thread-less review', function () {
      const derived = waitingOnOf({ reviews: [bobsComment], timeline: [{ type: 'comment', at: later, actor: alice }] });

      expect(derived).toStrictEqual({ waitingOn: ['author'], noReviewer: true });
    });

    it.each([
      ['the author commented only before it', { type: 'comment' as const, at: earlier, actor: alice }],
      ['someone else commented after it', { type: 'comment' as const, at: later, actor: carol }],
    ])('should keep waiting on the author when %s', function (_, comment) {
      expect(waitingOnOf({ reviews: [bobsComment], timeline: [comment] })).toStrictEqual({ waitingOn: ['author'], noReviewer: false });
    });

    it('should wait on the author when someone other than the author wrote last in its thread', function () {
      const derived = waitingOnOf({
        reviews: [bobsComment],
        reviewThreads: [
          aReviewThread({ comments: [bobsQuestion, alicesReply, aThreadComment({ author: carol, createdAt: latest, reviewId: 'PRR_c' })] }),
        ],
      });

      expect(derived).toStrictEqual({ waitingOn: ['author'], noReviewer: false });
    });

    it('should wait on each reviewer the author answered last, across several threads', function () {
      const derived = waitingOnOf({
        reviews: [bobsComment, aReview({ id: 'PRR_b', author: carol, state: 'commented', submittedAt: reviewedAt })],
        reviewThreads: [
          aReviewThread({ comments: [bobsQuestion, alicesReply] }),
          aReviewThread({ comments: [aThreadComment({ author: carol, createdAt: reviewedAt, reviewId: 'PRR_b' }), alicesReply] }),
        ],
      });

      expect(derived).toStrictEqual({ waitingOn: ['bob', 'carol'], noReviewer: false });
    });

    it("should ignore the author's own notes", function () {
      const derived = waitingOnOf({
        reviews: [aReview({ id: 'PRR_note', author: alice, state: 'commented', submittedAt: reviewedAt })],
        reviewThreads: [aReviewThread({ comments: [aThreadComment({ author: alice, createdAt: reviewedAt, reviewId: 'PRR_note' })] })],
      });

      expect(derived).toStrictEqual({ waitingOn: ['author'], noReviewer: true });
    });
  });

  describe('checks and conflicts', function () {
    it.each<[string, Partial<PrFacts>]>([
      ['checks fail', withChecks('failure')],
      ['a check errors', withChecks('error')],
      ['the PR conflicts with its base', { mergeable: 'conflicting' }],
    ])('should wait on both the author and the reviewer when %s', function (_, overrides) {
      expect(waitingOnOf({ reviewRequests: [requested(bob)], ...overrides })).toStrictEqual({ waitingOn: ['bob', 'author'], noReviewer: false });
    });

    it.each<[string, Partial<PrFacts>]>([
      ['mergeability is unknown', { mergeable: 'unknown' }],
      ['checks are pending', withChecks('pending')],
      ['there are no checks', { headCommit: { ...aPrFacts().headCommit, checkRollup: null } }],
    ])('should not wait on the author when %s', function (_, overrides) {
      expect(waitingOnOf({ reviewRequests: [requested(bob)], ...overrides })).toStrictEqual({ waitingOn: ['bob'], noReviewer: false });
    });

    it('should still flag No Reviewer when checks fail and no reviewer owes a move', function () {
      expect(waitingOnOf(withChecks('failure'))).toStrictEqual({ waitingOn: ['author'], noReviewer: true });
    });
  });

  it('should name each party once', function () {
    const derived = waitingOnOf({
      reviewRequests: [requested(bob)],
      reviews: [aReview({ id: 'PRR_a', author: bob, state: 'commented', submittedAt: reviewedAt })],
      reviewThreads: [aReviewThread({ comments: [bobsQuestion, alicesReply] })],
      mergeable: 'conflicting',
      ...withChecks('failure'),
    });

    expect(derived).toStrictEqual({ waitingOn: ['bob', 'author'], noReviewer: false });
  });

  it('should name the author with their role and each reviewer with theirs', function () {
    const trackedPr = deriveTrackedPr(
      aPrFacts({ author: alice, reviewRequests: [requested(bob)], ...withChecks('failure') }),
      roster,
      aDerivationConfig(),
      now
    );

    expect(trackedPr.waitingOn).toIncludeSameMembers([
      expect.objectContaining({ type: 'person', login: 'bob', role: 'reviewer' }),
      expect.objectContaining({ type: 'person', login: 'alice', role: 'author' }),
    ]);
  });
});
