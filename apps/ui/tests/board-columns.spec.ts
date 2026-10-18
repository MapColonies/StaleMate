import { describe, expect, it } from 'vitest';
import { boardColumns, boardStats } from '@/views/board/columns';
import type { TrackedPr } from '@/snapshot/types';
import { aPr, clock, member, outsider, waitingOnAuthor, waitingOnReviewer, waitingOnTeam, waitingOnTheTeam } from './fixtures/snapshot';

const alice = member('alice');
const bob = member('bob');
const carol = member('carol');
const stranger = outsider('stranger');

/** Each column's key with the ids of its PRs, in order. */
const columnIds = (prs: readonly TrackedPr[], viewer: string | null): [string, string[]][] =>
  boardColumns(prs, viewer).map((column) => [column.key, column.prs.map((pr) => pr.id)]);

describe('boardColumns', () => {
  it('puts a PR waiting on two people in both their columns', () => {
    const prs = [aPr({ id: 'two', author: carol, waitingOn: [waitingOnReviewer(alice), waitingOnReviewer(bob)] })];

    expect(columnIds(prs, null)).toEqual([
      ['alice', ['two']],
      ['bob', ['two']],
    ]);
  });

  it('gives the Team its own column, and other teams theirs', () => {
    const prs = [
      aPr({ id: 'team', author: bob, waitingOn: [waitingOnTheTeam] }),
      aPr({ id: 'raster', author: bob, waitingOn: [waitingOnTeam('raster')] }),
    ];

    expect(columnIds(prs, null)).toEqual([
      ['@infra', ['team']],
      ['@raster', ['raster']],
    ]);
    expect(boardColumns(prs, null)[0]?.owner).toEqual({ type: 'team', slug: 'infra', viaTeam: true });
  });

  it('puts the Viewer’s column first, however few PRs wait on them', () => {
    const prs = [
      aPr({ id: 'on bob', waitingOn: [waitingOnReviewer(bob)] }),
      aPr({ id: 'on bob too', waitingOn: [waitingOnReviewer(bob)] }),
      aPr({ id: 'on carol', waitingOn: [waitingOnReviewer(carol)] }),
    ];

    expect(columnIds(prs, 'carol').map(([key]) => key)).toEqual(['carol', 'bob']);
  });

  it('keeps the Viewer’s column when nothing waits on them', () => {
    const columns = boardColumns([aPr({ waitingOn: [waitingOnReviewer(bob)] })], 'alice');

    expect(columns.map((column) => column.key)).toEqual(['alice', 'bob']);
    expect(columns[0]).toMatchObject({ owner: { type: 'person', person: { login: 'alice', kind: 'member' } }, prs: [] });
  });

  it('orders the rest by the Team before outsiders and other teams, then by most PRs, then by name', () => {
    const prs = [
      aPr({ waitingOn: [waitingOnReviewer(stranger)] }),
      aPr({ waitingOn: [waitingOnReviewer(stranger)] }),
      aPr({ waitingOn: [waitingOnTeam('raster')] }),
      aPr({ waitingOn: [waitingOnReviewer(carol)] }),
      aPr({ waitingOn: [waitingOnReviewer(bob)] }),
      aPr({ waitingOn: [waitingOnTheTeam] }),
      aPr({ waitingOn: [waitingOnTheTeam] }),
    ];

    expect(columnIds(prs, null).map(([key]) => key)).toEqual(['@infra', 'bob', 'carol', 'stranger', '@raster']);
  });

  it('puts the oldest PR first in a column', () => {
    const prs = [aPr({ id: 'young', age: clock(1) }), aPr({ id: 'old', age: clock(9) }), aPr({ id: 'middling', age: clock(4) })];

    expect(columnIds(prs, null)).toEqual([['alice', ['old', 'middling', 'young']]]);
  });

  it('keeps a No Reviewer PR in its author’s column', () => {
    const prs = [aPr({ id: 'nobody asked', author: carol, requestedReviewers: [], waitingOn: [waitingOnAuthor(carol)], noReviewer: true })];

    expect(columnIds(prs, null)).toEqual([['carol', ['nobody asked']]]);
  });
});

describe('boardStats', () => {
  it('counts the PRs at each Urgency, the Drafts, and the No Reviewer PRs, each PR once', () => {
    const prs = [
      aPr({ urgency: 0, waitingOn: [waitingOnReviewer(alice), waitingOnReviewer(bob)] }),
      aPr({ urgency: 3 }),
      aPr({ urgency: 3, noReviewer: true }),
      aPr({ urgency: 1 }),
      aPr({ urgency: null, reviewStatus: 'draft' }),
    ];

    expect(boardStats(prs, boardColumns(prs, null))).toMatchObject({ byUrgency: [1, 1, 0, 2], drafts: 1, noReviewer: 1 });
  });

  it('names the biggest column, the first in order on a tie', () => {
    const prs = [
      aPr({ waitingOn: [waitingOnReviewer(bob)] }),
      aPr({ waitingOn: [waitingOnReviewer(carol)] }),
      aPr({ waitingOn: [waitingOnReviewer(carol)] }),
      aPr({ waitingOn: [waitingOnReviewer(bob)] }),
    ];

    expect(boardStats(prs, boardColumns(prs, 'alice')).biggest?.key).toBe('bob');
  });

  it('names no biggest column when no PR is on the Board', () => {
    expect(boardStats([], boardColumns([], 'alice')).biggest).toBeNull();
  });
});
