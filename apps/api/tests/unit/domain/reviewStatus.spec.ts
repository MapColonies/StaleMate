import { describe, expect, it } from 'vitest';
import type { Actor, CheckFact, PrFacts, ReviewRequestFact } from '@domain/facts';
import type { ReviewStatus } from '@domain/trackedPr';
import { deriveReviewStatus } from '@domain/reviewStatus';
import { anActor, aPrFacts, aReview, aReviewThread, aThreadComment } from '@tests/utils/facts';

const botLogins = ['mapcolonies-devops'];

const alice = anActor({ id: 'U_alice', login: 'alice' });
const bob = anActor({ id: 'U_bob', login: 'bob' });
const carol = anActor({ id: 'U_carol', login: 'carol' });
// Copilot's GraphQL login differs from its REST login, so only its id and type are stable.
const copilot = anActor({ id: 'BOT_copilot', login: 'copilot-pull-request-reviewer', isBot: true });
const dave = anActor({ id: 'U_dave', login: 'dave' });
const serviceAccount = anActor({ id: 'U_devops', login: 'mapcolonies-devops' });

const requested = (reviewer: Actor): ReviewRequestFact => ({ type: 'person', reviewer, asCodeOwner: false });
const withChecks = (state: CheckFact['state']): Partial<PrFacts> => ({
  headCommit: { ...aPrFacts().headCommit, checks: [{ name: 'build', state }] },
});

describe('deriveReviewStatus', function () {
  // The Review Status column of the worked scenarios in "Rules for Review Status, Check Status and Waiting On" (#4).
  // A is bob, B is carol and C is dave.
  it.each<[string, Partial<PrFacts>, ReviewStatus, number]>([
    ['a new PR with A requested', { reviewRequests: [requested(bob)] }, 'awaitingReview', 0],
    ['A requested and checks failing', { reviewRequests: [requested(bob)], ...withChecks('failed') }, 'awaitingReview', 0],
    [
      'A asking for changes with B still requested',
      { reviews: [aReview({ author: bob, state: 'changesRequested' })], reviewRequests: [requested(carol)] },
      'changesRequested',
      0,
    ],
    [
      "the author replying on all of A's threads",
      {
        reviews: [aReview({ id: 'PRR_a', author: bob, state: 'changesRequested' })],
        reviewThreads: [
          aReviewThread({
            comments: [
              aThreadComment({ author: bob, reviewId: 'PRR_a' }),
              aThreadComment({ author: alice, createdAt: new Date('2026-10-13T09:00:00Z'), reviewId: 'PRR_reply' }),
            ],
          }),
        ],
        reviewRequests: [requested(carol)],
      },
      'awaitingReReview',
      0,
    ],
    [
      'A leaving a comment-only review with a question thread',
      {
        reviews: [aReview({ id: 'PRR_a', author: bob, state: 'commented' })],
        reviewThreads: [aReviewThread({ comments: [aThreadComment({ author: bob, reviewId: 'PRR_a' })] })],
      },
      'awaitingReview',
      0,
    ],
    [
      'A approving with B still requested',
      { reviews: [aReview({ author: bob, state: 'approved' })], reviewRequests: [requested(carol)] },
      'approved',
      1,
    ],
    ['an approved PR with checks failing', { reviews: [aReview({ author: bob, state: 'approved' })], ...withChecks('failed') }, 'approved', 1],
    ['an approved PR conflicting with its base', { reviews: [aReview({ author: bob, state: 'approved' })], mergeable: 'conflicting' }, 'approved', 1],
    ['only @infra requested', { reviewRequests: [{ type: 'team', slug: 'infra', asCodeOwner: false }] }, 'awaitingReview', 0],
    ['only Copilot requested', { reviewRequests: [requested(copilot)] }, 'awaitingReview', 0],
    ['nobody requested', {}, 'awaitingReview', 0],
    ['unrequested reviewer C asking for changes', { reviews: [aReview({ author: dave, state: 'changesRequested' })] }, 'changesRequested', 0],
    ['a draft, whose reviews are ignored', { isDraft: true, reviews: [aReview({ author: bob, state: 'approved' })] }, 'draft', 0],
  ])('should derive the Review Status of %s', function (_, overrides, status, approvals) {
    const facts = aPrFacts({ author: alice, ...overrides });

    expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status, approvals });
  });

  it('should count each approval from someone other than the author', function () {
    const facts = aPrFacts({
      reviews: [aReview({ id: 'PRR_1', author: bob, state: 'approved' }), aReview({ id: 'PRR_2', author: carol, state: 'approved' })],
    });

    expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'approved', approvals: 2 });
  });

  it.each([
    ["the author's own approval", aReview({ author: alice, state: 'approved' })],
    ["the author's own request for changes", aReview({ author: alice, state: 'changesRequested' })],
    ['a Copilot review', aReview({ author: copilot, state: 'changesRequested' })],
    ['an approval from a configured service account', aReview({ author: serviceAccount, state: 'approved' })],
    ['a comment-only review', aReview({ author: bob, state: 'commented' })],
    ['a dismissed approval', aReview({ author: bob, state: 'dismissed' })],
  ])('should stay Awaiting Review when the only review is %s', function (_, review) {
    const facts = aPrFacts({ author: alice, reviews: [review] });

    expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'awaitingReview', approvals: 0 });
  });

  it.each([
    [
      'one reviewer approves and another asks for changes',
      [aReview({ id: 'PRR_1', author: bob, state: 'approved' }), aReview({ id: 'PRR_2', author: carol, state: 'changesRequested' })],
      1,
    ],
    [
      'a reviewer approves, then asks for changes',
      [
        aReview({ id: 'PRR_1', author: bob, state: 'approved', submittedAt: new Date('2026-10-13T08:00:00Z') }),
        aReview({ id: 'PRR_2', author: bob, state: 'changesRequested', submittedAt: new Date('2026-10-13T09:00:00Z') }),
      ],
      0,
    ],
  ])('should report Changes Requested when %s', function (_, reviews, approvals) {
    const facts = aPrFacts({ reviews });

    expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'changesRequested', approvals });
  });

  it("should let a reviewer's later approval replace their request for changes", function () {
    const facts = aPrFacts({
      reviews: [
        aReview({ id: 'PRR_1', author: bob, state: 'changesRequested', submittedAt: new Date('2026-10-13T08:00:00Z') }),
        aReview({ id: 'PRR_2', author: bob, state: 'approved', submittedAt: new Date('2026-10-13T09:00:00Z') }),
      ],
    });

    expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'approved', approvals: 1 });
  });

  it("should keep a reviewer's approval through their later comment-only review", function () {
    const facts = aPrFacts({
      reviews: [
        aReview({ id: 'PRR_1', author: bob, state: 'approved', submittedAt: new Date('2026-10-13T08:00:00Z') }),
        aReview({ id: 'PRR_2', author: bob, state: 'commented', submittedAt: new Date('2026-10-13T09:00:00Z') }),
      ],
    });

    expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'approved', approvals: 1 });
  });

  describe('a request for changes', function () {
    const reviewedAt = new Date('2026-10-13T08:00:00Z');
    const earlier = new Date('2026-10-13T07:00:00Z');
    const later = new Date('2026-10-13T09:00:00Z');
    const requestForChanges = aReview({ id: 'PRR_cr', author: bob, state: 'changesRequested', submittedAt: reviewedAt, commitOid: 'c0ffee' });
    const reviewerComment = aThreadComment({ author: bob, createdAt: reviewedAt, reviewId: 'PRR_cr' });
    const authorReply = aThreadComment({ author: alice, createdAt: later, reviewId: 'PRR_reply' });

    it('should be Answered when the author replied to or someone resolved every one of its threads', function () {
      const facts = aPrFacts({
        author: alice,
        reviews: [requestForChanges],
        reviewThreads: [
          aReviewThread({ comments: [reviewerComment, authorReply] }),
          aReviewThread({ isResolved: true, comments: [reviewerComment] }),
        ],
      });

      expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'awaitingReReview', approvals: 0 });
    });

    it('should not be Answered while one of its threads has no author reply and is unresolved', function () {
      const facts = aPrFacts({
        author: alice,
        reviews: [requestForChanges],
        reviewThreads: [
          aReviewThread({ comments: [reviewerComment, authorReply] }),
          aReviewThread({ comments: [reviewerComment, aThreadComment({ author: carol, createdAt: later, reviewId: 'PRR_carol' })] }),
        ],
      });

      expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'changesRequested', approvals: 0 });
    });

    it('should be Answered when it has no threads and the author commented on the PR after it', function () {
      const facts = aPrFacts({ author: alice, reviews: [requestForChanges], timeline: [{ type: 'comment', at: later, actor: alice }] });

      expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'awaitingReReview', approvals: 0 });
    });

    it.each([
      ['the author commented before it', { reviewThreads: [], timeline: [{ type: 'comment' as const, at: earlier, actor: alice }] }],
      ['someone else commented after it', { reviewThreads: [], timeline: [{ type: 'comment' as const, at: later, actor: carol }] }],
      [
        'it has an unanswered thread, even though the author commented on the PR after it',
        { reviewThreads: [aReviewThread({ comments: [reviewerComment] })], timeline: [{ type: 'comment' as const, at: later, actor: alice }] },
      ],
    ])('should not be Answered when %s', function (_, overrides) {
      const facts = aPrFacts({ author: alice, reviews: [requestForChanges], ...overrides });

      expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'changesRequested', approvals: 0 });
    });

    it.each([
      ['new commits arrived after it', { headCommit: { ...aPrFacts().headCommit, oid: 'beef' } }],
      [
        'its reviewer was asked to review again after it',
        { timeline: [{ type: 'reviewRequested' as const, at: later, actor: alice, requested: requested(bob) }] },
      ],
    ])('should be Answered when %s, even with an unanswered thread', function (_, overrides) {
      const facts = aPrFacts({
        author: alice,
        reviews: [requestForChanges],
        reviewThreads: [aReviewThread({ comments: [reviewerComment] })],
        ...overrides,
      });

      expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'awaitingReReview', approvals: 0 });
    });

    it.each([
      [
        'its reviewer was requested only before it',
        { timeline: [{ type: 'reviewRequested' as const, at: earlier, actor: alice, requested: requested(bob) }] },
      ],
      [
        'someone else was requested after it',
        { timeline: [{ type: 'reviewRequested' as const, at: later, actor: alice, requested: requested(carol) }] },
      ],
    ])('should not be Answered when %s', function (_, overrides) {
      const facts = aPrFacts({ author: alice, reviews: [requestForChanges], ...overrides });

      expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'changesRequested', approvals: 0 });
    });

    it('should be Answered when the code host no longer knows the commit it was given on, as after a force push', function () {
      const facts = aPrFacts({
        author: alice,
        reviews: [{ ...requestForChanges, commitOid: null }],
        reviewThreads: [aReviewThread({ comments: [reviewerComment] })],
      });

      expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'awaitingReReview', approvals: 0 });
    });

    describe('that replies in a thread an earlier review opened', function () {
      const openingComment = aThreadComment({ author: bob, createdAt: earlier, reviewId: 'PRR_earlier' });
      const earlierAuthorReply = aThreadComment({ author: alice, createdAt: earlier, reviewId: 'PRR_earlier_reply' });

      it('should not be Answered by an author reply from before it, nor by a PR comment', function () {
        const facts = aPrFacts({
          author: alice,
          reviews: [requestForChanges],
          reviewThreads: [aReviewThread({ comments: [openingComment, earlierAuthorReply, reviewerComment] })],
          timeline: [{ type: 'comment', at: later, actor: alice }],
        });

        expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'changesRequested', approvals: 0 });
      });

      it('should be Answered once the author replies after it', function () {
        const facts = aPrFacts({
          author: alice,
          reviews: [requestForChanges],
          reviewThreads: [aReviewThread({ comments: [openingComment, earlierAuthorReply, reviewerComment, authorReply] })],
        });

        expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'awaitingReReview', approvals: 0 });
      });
    });

    it('should keep the PR at Changes Requested while only one of two requests for changes is Answered', function () {
      const facts = aPrFacts({
        author: alice,
        reviews: [requestForChanges, aReview({ id: 'PRR_carol', author: carol, state: 'changesRequested', submittedAt: reviewedAt })],
        reviewThreads: [aReviewThread({ comments: [reviewerComment, authorReply] })],
      });

      expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'changesRequested', approvals: 0 });
    });

    it('should hold an approved PR at Awaiting Re-review until the reviewer who asked for changes looks again', function () {
      const facts = aPrFacts({
        author: alice,
        reviews: [requestForChanges, aReview({ id: 'PRR_carol', author: carol, state: 'approved', submittedAt: later })],
        reviewThreads: [aReviewThread({ comments: [reviewerComment, authorReply] })],
      });

      expect(deriveReviewStatus(facts, botLogins)).toMatchObject({ status: 'awaitingReReview', approvals: 1 });
    });

    it("should report each reviewer's verdict and whether a request for changes is Answered", function () {
      const facts = aPrFacts({
        author: alice,
        reviews: [
          requestForChanges,
          aReview({ id: 'PRR_carol', author: carol, state: 'changesRequested', submittedAt: reviewedAt }),
          aReview({ id: 'PRR_dave', author: dave, state: 'approved', submittedAt: later }),
          aReview({ id: 'PRR_copilot', author: copilot, state: 'commented', submittedAt: later }),
        ],
        reviewThreads: [aReviewThread({ comments: [reviewerComment, authorReply] })],
      });

      expect(deriveReviewStatus(facts, botLogins).verdicts).toIncludeSameMembers([
        { reviewer: bob, verdict: 'changesRequested', submittedAt: reviewedAt, answered: true },
        { reviewer: carol, verdict: 'changesRequested', submittedAt: reviewedAt, answered: false },
        { reviewer: dave, verdict: 'approved', submittedAt: later, answered: false },
      ]);
    });
  });
});
