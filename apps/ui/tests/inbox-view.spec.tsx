import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '@/snapshot/types';
import { BoardView } from '@/views/board/board-view';
import { InboxView } from '@/views/inbox/inbox-view';
import { aPr, aSnapshot, clock, member, waitingOnAuthor, waitingOnReviewer, waitingOnTheTeam } from './fixtures/snapshot';

const NOW = Date.parse('2026-10-15T09:00:00Z');

const alice = member('alice');
const bob = member('bob');
const carol = member('carol');

function renderInbox(snapshot: Snapshot, viewer: string | null = null) {
  return render(<InboxView snapshot={snapshot} viewer={viewer} now={NOW} />);
}

const bucket = (name: string) => screen.getByRole('region', { name });

/** The titles of the PRs in a bucket, top to bottom. */
const titlesIn = (name: string): string[] =>
  within(bucket(name))
    .queryAllByRole('link')
    .map((link) => link.textContent ?? '');

const facet = (name: string) => screen.getByRole('group', { name });

/** A facet's values with their counts, as shown. */
const facetEntries = (name: string): string[] =>
  within(facet(name))
    .getAllByRole('checkbox')
    .map((option) => option.textContent ?? '');

const snapshot = aSnapshot({
  prs: [
    aPr({ title: 'asks alice', repo: 'MapColonies/a', author: bob, waitingOn: [waitingOnReviewer(alice)], age: clock(2) }),
    aPr({ title: 'asks the Team', repo: 'MapColonies/a', author: bob, requestedReviewers: [], waitingOn: [waitingOnTheTeam], age: clock(4) }),
    aPr({ title: 'alice’s own', repo: 'MapColonies/b', author: alice, requestedReviewers: [bob], waitingOn: [waitingOnReviewer(bob)] }),
    aPr({
      title: 'nobody asked',
      repo: 'MapColonies/b',
      author: carol,
      requestedReviewers: [],
      waitingOn: [waitingOnAuthor(carol)],
      noReviewer: true,
      reviewStatus: 'awaitingReview',
    }),
    aPr({
      title: 'on carol',
      repo: 'MapColonies/b',
      author: bob,
      requestedReviewers: [carol],
      waitingOn: [waitingOnReviewer(carol)],
      reviewStatus: 'approved',
    }),
  ],
});

describe('the Inbox', () => {
  it('buckets the PRs by whose move it is for the Viewer', () => {
    renderInbox(snapshot, 'alice');

    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
      'Your turn',
      'Your PRs, waiting on others',
      'No Reviewer',
      'Rest of the Team',
    ]);
    expect(titlesIn('Your turn')).toEqual(['asks alice', 'asks the Team']);
    expect(titlesIn('Your PRs, waiting on others')).toEqual(['alice’s own']);
    expect(titlesIn('No Reviewer')).toEqual(['nobody asked']);
  });

  it('badges the requests to the Team in Your turn', () => {
    renderInbox(snapshot, 'alice');

    const row = within(bucket('Your turn')).getByRole('listitem', { name: /asks the Team/ });
    expect(within(row).getByText('via @infra')).toBeInTheDocument();
  });

  it('folds the rest of the team away, until opened', async () => {
    renderInbox(snapshot, 'alice');

    expect(titlesIn('Rest of the Team')).toEqual([]);
    await userEvent.click(within(bucket('Rest of the Team')).getByRole('button', { name: /Rest of the Team/ }));

    expect(titlesIn('Rest of the Team')).toEqual(['on carol']);
  });

  it('asks who the Viewer is without one, and shows what is not theirs', () => {
    renderInbox(snapshot, null);

    expect(screen.getByText(/I am…/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your turn' })).not.toBeInTheDocument();
    expect(titlesIn('No Reviewer')).toEqual(['nobody asked']);
    expect(titlesIn('Rest of the Team')).toHaveLength(4);
  });
});

describe('the Inbox’s facets', () => {
  it('count the PRs for each value', () => {
    renderInbox(snapshot, 'alice');

    expect(facetEntries('Repo')).toEqual(['MapColonies/b3', 'MapColonies/a2']);
    expect(facetEntries('Author')).toEqual(['bob3', 'You1', 'carol1']);
  });

  it('filter the PRs, keep the filter in the URL, and recount the other facets', async () => {
    renderInbox(snapshot, 'alice');

    await userEvent.click(within(facet('Repo')).getByRole('checkbox', { name: /MapColonies\/a/ }));

    expect(new URLSearchParams(window.location.search).get('repo')).toBe('MapColonies/a');
    expect(within(facet('Repo')).getByRole('checkbox', { name: /MapColonies\/a/ })).toHaveAttribute('aria-checked', 'true');
    expect(titlesIn('Your PRs, waiting on others')).toEqual([]);
    // The Repo facet keeps its other values; the others count what the Repo filter keeps.
    expect(facetEntries('Repo')).toEqual(['MapColonies/b3', 'MapColonies/a2']);
    expect(facetEntries('Author')).toEqual(['bob2']);
  });

  it('reflect the filters read from the URL', () => {
    window.history.replaceState(null, '', '/?review=approved');

    renderInbox(snapshot, 'alice');

    expect(facetEntries('Repo')).toEqual(['MapColonies/b1']);
  });
});

describe('the Inbox’s order', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is newest first, and can be oldest first, kept in the URL and saved', async () => {
    renderInbox(snapshot, 'alice');
    expect(titlesIn('Your turn')).toEqual(['asks alice', 'asks the Team']);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Order' }), 'Oldest first');

    expect(titlesIn('Your turn')).toEqual(['asks the Team', 'asks alice']);
    expect(new URLSearchParams(window.location.search).get('order')).toBe('oldest');
    expect(window.localStorage.getItem('stalemate.prOrder')).toBe('oldest');
  });

  it('is read from the URL, without changing the saved order', () => {
    window.localStorage.setItem('stalemate.prOrder', 'idleLongest');
    window.history.replaceState(null, '', '/?order=oldest');

    renderInbox(snapshot, 'alice');

    expect(screen.getByRole('combobox', { name: 'Order' })).toHaveDisplayValue('Oldest first');
    expect(titlesIn('Your turn')).toEqual(['asks the Team', 'asks alice']);
    expect(window.localStorage.getItem('stalemate.prOrder')).toBe('idleLongest');
  });

  it('is the saved order when the URL has none, the same one the Board saved', async () => {
    const board = render(<BoardView snapshot={snapshot} viewer="alice" now={NOW} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Order' }), 'Oldest first');
    board.unmount();
    window.history.replaceState(null, '', '/');

    renderInbox(snapshot, 'alice');

    expect(screen.getByRole('combobox', { name: 'Order' })).toHaveDisplayValue('Oldest first');
  });

  it('falls back past an unusable URL value to the saved order', () => {
    window.localStorage.setItem('stalemate.prOrder', 'oldest');
    window.history.replaceState(null, '', '/?order=sideways');

    renderInbox(snapshot, 'alice');

    expect(screen.getByRole('combobox', { name: 'Order' })).toHaveDisplayValue('Oldest first');
  });

  it('falls back past an unusable saved value to newest first', () => {
    window.localStorage.setItem('stalemate.prOrder', 'sideways');

    renderInbox(snapshot, 'alice');

    expect(screen.getByRole('combobox', { name: 'Order' })).toHaveDisplayValue('Newest first');
  });

  it('still works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    renderInbox(snapshot, 'alice');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Order' }), 'Oldest first');

    expect(titlesIn('Your turn')).toEqual(['asks the Team', 'asks alice']);
    expect(new URLSearchParams(window.location.search).get('order')).toBe('oldest');
  });
});
