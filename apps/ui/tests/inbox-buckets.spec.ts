import { describe, expect, it } from 'vitest';
import { BUCKETS, type BucketKey, inboxBuckets } from '@/views/inbox/buckets';
import { aPr, aSnapshot, clock, member, outsider, waitingOnAuthor, waitingOnReviewer, waitingOnTeam, waitingOnTheTeam } from './fixtures/snapshot';

const alice = member('alice');
const bob = member('bob');
const carol = member('carol');

// One fixture Snapshot, seen by alice.
const snapshot = aSnapshot({
  prs: [
    // alice is a requested reviewer: her turn.
    aPr({ id: 'review', author: bob, requestedReviewers: [alice], waitingOn: [waitingOnReviewer(alice)], age: clock(2) }),
    // alice's own PR, Waiting On her: her turn beats her PRs.
    aPr({ id: 'own, her move', author: alice, requestedReviewers: [bob], reviewers: [bob], waitingOn: [waitingOnAuthor(alice)], age: clock(1) }),
    // alice's own No Reviewer PR waits on her: her turn beats No Reviewer.
    aPr({ id: 'own, no reviewer', author: alice, requestedReviewers: [], waitingOn: [waitingOnAuthor(alice)], noReviewer: true, age: clock(3) }),
    // A request to the Team: her turn, mixed in, unless requests via the Team are hidden.
    aPr({ id: 'team', author: bob, requestedReviewers: [], waitingOn: [waitingOnTheTeam], age: clock(5) }),
    // alice's own PR, Waiting On bob.
    aPr({ id: 'own, on bob', author: alice, requestedReviewers: [bob], waitingOn: [waitingOnReviewer(bob)], age: clock(4) }),
    // alice's own PR asks the Team: the others' turn, so it waits on others.
    aPr({ id: 'own, team requested', author: alice, requestedReviewers: [], waitingOn: [waitingOnTheTeam], age: clock(6) }),
    // Someone else's No Reviewer PR.
    aPr({ id: 'no reviewer', author: carol, requestedReviewers: [], waitingOn: [waitingOnAuthor(carol)], noReviewer: true, age: clock(2) }),
    // Another team's turn.
    aPr({ id: 'other team', author: carol, requestedReviewers: [], waitingOn: [waitingOnTeam('raster')], age: clock(1) }),
    // On bob.
    aPr({ id: 'unrelated', author: outsider('stranger'), requestedReviewers: [bob], waitingOn: [waitingOnReviewer(bob)], age: clock(9) }),
  ],
});

function bucketIds(viewer: string | null, hideViaTeam = false): Partial<Record<BucketKey, string[]>> {
  const buckets = inboxBuckets(snapshot.prs, viewer, { hideViaTeam });
  return Object.fromEntries(buckets.map((bucket) => [bucket.key, bucket.prs.map((pr) => pr.id)]));
}

describe('inboxBuckets', () => {
  it('returns the buckets in order', () => {
    expect(inboxBuckets(snapshot.prs, 'alice', { hideViaTeam: false }).map((bucket) => bucket.key)).toEqual(BUCKETS);
    expect(BUCKETS).toEqual(['yourTurn', 'yourPrs', 'noReviewer', 'rest']);
  });

  it('puts each PR in exactly one bucket', () => {
    for (const [viewer, hideViaTeam] of [
      ['alice', false],
      ['alice', true],
      [null, false],
    ] as const) {
      const ids = Object.values(bucketIds(viewer, hideViaTeam)).flat();
      expect(ids.sort()).toEqual(snapshot.prs.map((pr) => pr.id).sort());
    }
  });

  it('buckets by precedence: Your turn, then your PRs, then No Reviewer, then the rest; oldest first within a bucket', () => {
    expect(bucketIds('alice')).toEqual({
      yourTurn: ['team', 'own, no reviewer', 'review', 'own, her move'],
      yourPrs: ['own, team requested', 'own, on bob'],
      noReviewer: ['no reviewer'],
      rest: ['unrelated', 'other team'],
    });
  });

  it('moves the requests to the Team out of Your turn when they are hidden', () => {
    const buckets = bucketIds('alice', true);

    expect(buckets.yourTurn).not.toContain('team');
    expect(buckets.rest).toContain('team');
  });

  it('leaves out the Viewer’s buckets without a Viewer', () => {
    expect(bucketIds(null)).toEqual({
      noReviewer: ['own, no reviewer', 'no reviewer'],
      rest: ['unrelated', 'own, team requested', 'team', 'own, on bob', 'review', 'own, her move', 'other team'],
    });
  });

  describe('the order within a bucket', () => {
    const prs = [
      aPr({ id: 'young, idle long', age: clock(1), idleTime: clock(0.9) }),
      aPr({ id: 'old, busy', age: clock(30), idleTime: clock(0.1) }),
      aPr({ id: 'middling', age: clock(5), idleTime: clock(3) }),
    ];
    const order = (inboxOrder: Parameters<typeof inboxBuckets>[3]) =>
      inboxBuckets(prs, null, { hideViaTeam: false }, inboxOrder)
        .find((bucket) => bucket.key === 'rest')
        ?.prs.map((pr) => pr.id);

    it('is oldest first by default', () => {
      expect(
        inboxBuckets(prs, null, { hideViaTeam: false })
          .find((bucket) => bucket.key === 'rest')
          ?.prs.map((pr) => pr.id)
      ).toEqual(['old, busy', 'middling', 'young, idle long']);
    });

    it('can be newest first', () => {
      expect(order('newest')).toEqual(['young, idle long', 'middling', 'old, busy']);
    });

    it('can be by Idle Time, longest or shortest first', () => {
      expect(order('idleLongest')).toEqual(['middling', 'young, idle long', 'old, busy']);
      expect(order('recentlyActive')).toEqual(['old, busy', 'young, idle long', 'middling']);
    });
  });
});
