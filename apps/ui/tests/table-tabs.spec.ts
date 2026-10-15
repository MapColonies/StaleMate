import { describe, expect, it } from 'vitest';
import { prsInTab } from '@/views/table/tabs';
import { aPr, aSnapshot, member, outsider, waitingOnAuthor, waitingOnReviewer, waitingOnTeam, waitingOnTheTeam } from './fixtures/snapshot';

const alice = member('alice');
const bob = member('bob');
const carol = member('carol');

// One fixture Snapshot, seen by alice.
const snapshot = aSnapshot({
  prs: [
    // alice is a requested reviewer: her turn.
    aPr({ id: 'review', author: bob, requestedReviewers: [alice], waitingOn: [waitingOnReviewer(alice)] }),
    // alice's own PR, Waiting On her as its author.
    aPr({ id: 'own, her move', author: alice, requestedReviewers: [], waitingOn: [waitingOnAuthor(alice)], noReviewer: true }),
    // alice's own PR, Waiting On bob.
    aPr({ id: 'own, on bob', author: alice, requestedReviewers: [bob], waitingOn: [waitingOnReviewer(bob)] }),
    // A request to the Team: her turn, unless requests via the Team are hidden.
    aPr({ id: 'team', author: bob, requestedReviewers: [], waitingOn: [waitingOnTheTeam] }),
    // alice's own PR asks the Team: the others' turn, not hers.
    aPr({ id: 'own, team requested', author: alice, requestedReviewers: [], waitingOn: [waitingOnTheTeam] }),
    // Another team: never her turn.
    aPr({ id: 'other team', author: carol, requestedReviewers: [], waitingOn: [waitingOnTeam('raster')] }),
    // alice reviewed it and it is back on its author.
    aPr({ id: 'reviewed', author: carol, requestedReviewers: [], reviewers: [alice], waitingOn: [waitingOnAuthor(carol)] }),
    // alice is assigned to it.
    aPr({ id: 'assigned', author: outsider('stranger'), assignees: [alice], requestedReviewers: [bob], waitingOn: [waitingOnReviewer(bob)] }),
    // Nothing to do with alice.
    aPr({ id: 'unrelated', author: carol, requestedReviewers: [bob], waitingOn: [waitingOnReviewer(bob)] }),
  ],
});

const ids = (tab: Parameters<typeof prsInTab>[1], viewer: string | null, hideViaTeam = false): string[] =>
  prsInTab(snapshot.prs, tab, viewer, { hideViaTeam }).map((pr) => pr.id);

describe('prsInTab', () => {
  it('shows every PR under All, with or without a Viewer', () => {
    expect(ids('all', 'alice')).toHaveLength(snapshot.prs.length);
    expect(ids('all', null)).toHaveLength(snapshot.prs.length);
  });

  it('shows the PRs Waiting On the Viewer under My turn, requests to the Team included', () => {
    expect(ids('my-turn', 'alice')).toEqual(['review', 'own, her move', 'team']);
  });

  it('drops the requests to the Team from My turn when they are hidden', () => {
    expect(ids('my-turn', 'alice', true)).toEqual(['review', 'own, her move']);
  });

  it('shows the PRs the Viewer authored under My PRs, whoever they wait on', () => {
    expect(ids('my-prs', 'alice')).toEqual(['own, her move', 'own, on bob', 'own, team requested']);
  });

  it('shows every PR the Viewer authored, reviews, is asked on, is assigned or owes a move on under Involving me', () => {
    expect(ids('involving-me', 'alice')).toEqual(['review', 'own, her move', 'own, on bob', 'team', 'own, team requested', 'reviewed', 'assigned']);
  });

  it('leaves the Team’s requests out of Involving me when they are hidden', () => {
    expect(ids('involving-me', 'alice', true)).not.toContain('team');
  });

  it('shows nothing in the Viewer’s tabs without a Viewer', () => {
    expect(ids('my-turn', null)).toEqual([]);
    expect(ids('my-prs', null)).toEqual([]);
    expect(ids('involving-me', null)).toEqual([]);
  });
});
