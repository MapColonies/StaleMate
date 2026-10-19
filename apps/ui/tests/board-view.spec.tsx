import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@/snapshot/types';
import { BoardView } from '@/views/board/board-view';
import { aPr, aSnapshot, clock, member, waitingOnAuthor, waitingOnReviewer, waitingOnTheTeam } from './fixtures/snapshot';

const NOW = Date.parse('2026-10-15T09:00:00Z');

const alice = member('alice');
const bob = member('bob');
const carol = member('carol');

function renderBoard(snapshot: Snapshot, viewer: string | null = null) {
  return render(<BoardView snapshot={snapshot} viewer={viewer} now={NOW} />);
}

/** The columns' names, left to right. */
const columnNames = (): string[] => screen.queryAllByRole('region').map((column) => column.getAttribute('aria-label') ?? '');

const column = (name: string) => screen.getByRole('region', { name });

/** The titles of the PRs in a column, top to bottom. */
const titlesIn = (name: string): string[] =>
  within(column(name))
    .queryAllByRole('link')
    .map((link) => link.textContent ?? '');

const stats = () => screen.getByRole('group', { name: 'Board stats' });

const snapshot = aSnapshot({
  prs: [
    aPr({
      title: 'asks bob and carol',
      author: alice,
      requestedReviewers: [bob, carol],
      waitingOn: [waitingOnReviewer(bob), waitingOnReviewer(carol)],
      age: clock(9),
      urgency: 3,
    }),
    aPr({ title: 'asks the Team', author: bob, requestedReviewers: [], waitingOn: [waitingOnTheTeam], age: clock(3), urgency: 1 }),
    aPr({ title: 'asks bob', author: carol, requestedReviewers: [bob], waitingOn: [waitingOnReviewer(bob)], age: clock(1) }),
    aPr({
      title: 'nobody asked',
      author: carol,
      requestedReviewers: [],
      waitingOn: [waitingOnAuthor(carol)],
      noReviewer: true,
      age: clock(5),
      urgency: 2,
    }),
  ],
});

describe('the Board', () => {
  it('has a column per party the PRs wait on, the Viewer’s first and the Team in its own', () => {
    renderBoard(snapshot, 'alice');

    expect(columnNames()).toEqual(['You', 'bob', 'carol', '@infra']);
    expect(within(column('You')).getByText(/no PR is waiting on you/i)).toBeInTheDocument();
    expect(titlesIn('@infra')).toEqual(['asks the Team']);
  });

  it('shows a PR in every column it waits on, oldest first', () => {
    renderBoard(snapshot);

    expect(titlesIn('bob')).toEqual(['asks bob and carol', 'asks bob']);
    expect(titlesIn('carol')).toEqual(['asks bob and carol', 'nobody asked']);
  });

  it('flags a No Reviewer PR in its author’s column', () => {
    renderBoard(snapshot);

    const card = within(column('carol')).getByRole('listitem', { name: 'nobody asked' });
    expect(within(card).getByText('No Reviewer')).toBeInTheDocument();
    expect(within(card).getByText('as author')).toBeInTheDocument();
  });

  it('sums up the Board in a stats strip', () => {
    renderBoard(snapshot);

    expect(within(stats()).getByTitle('Urgency 0: Age under 2 Working Days')).toHaveTextContent('1');
    expect(within(stats()).getByTitle('Urgency 3: Age of 8 Working Days or more')).toHaveTextContent('1');
    expect(within(stats()).getByTitle('PRs Awaiting Review that no reviewer owes a move on')).toHaveTextContent('1 No Reviewer');
    expect(within(stats()).getByTitle('The column with the most PRs')).toHaveTextContent('bob · 2 PRs');
  });

  it('shows only the PRs that pass the filters', async () => {
    renderBoard(snapshot);

    await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), 'nobody');

    expect(columnNames()).toEqual(['carol']);
    expect(titlesIn('carol')).toEqual(['nobody asked']);
  });
});

describe('the Board’s order', () => {
  it('is oldest first, and can be newest first, kept in the URL', async () => {
    renderBoard(snapshot);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Order' }), 'Newest first');

    expect(titlesIn('bob')).toEqual(['asks bob', 'asks bob and carol']);
    expect(new URLSearchParams(window.location.search).get('order')).toBe('newest');
  });

  it('is read from the URL', () => {
    window.history.replaceState(null, '', '/?order=newest');

    renderBoard(snapshot);

    expect(screen.getByRole('combobox', { name: 'Order' })).toHaveDisplayValue('Newest first');
    expect(titlesIn('carol')).toEqual(['nobody asked', 'asks bob and carol']);
  });
});
