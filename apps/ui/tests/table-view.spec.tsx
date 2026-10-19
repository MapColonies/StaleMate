import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@/snapshot/types';
import { TableView } from '@/views/table/table-view';
import { aPr, aSnapshot, clock, member, waitingOnAuthor, waitingOnReviewer, waitingOnTheTeam } from './fixtures/snapshot';

const NOW = Date.parse('2026-10-15T09:00:00Z');

const alice = member('alice');
const bob = member('bob');

function renderTable(snapshot: Snapshot, viewer: string | null = null) {
  return render(<TableView snapshot={snapshot} viewer={viewer} now={NOW} />);
}

/** The titles of the PRs in the table, top to bottom. */
const rowTitles = (): string[] =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getByRole('link').textContent ?? '');

const header = (name: string) => screen.getByRole('columnheader', { name: new RegExp(`^${name}`) });

const sortButton = (name: string) => within(header(name)).getByRole('button');

describe('the Table', () => {
  const snapshot = aSnapshot({
    prs: [
      aPr({ title: 'young, idle long', repo: 'MapColonies/b', age: clock(1), idleTime: clock(0.9) }),
      aPr({ title: 'old', repo: 'MapColonies/c', age: clock(30), idleTime: clock(3) }),
      aPr({ title: 'middling in b', repo: 'MapColonies/b', age: clock(5.5), idleTime: clock(5) }),
      aPr({ title: 'middling in a', repo: 'MapColonies/a', age: clock(5.2), idleTime: clock(1) }),
    ],
  });

  it('sorts by Age, oldest first, by default', () => {
    renderTable(snapshot);

    expect(rowTitles()).toEqual(['old', 'middling in b', 'middling in a', 'young, idle long']);
    expect(header('Age')).toHaveAttribute('aria-sort', 'descending');
    expect(window.location.search).toBe('');
  });

  it('sorts by Idle Time, longest first, and keeps the sort in the URL', async () => {
    renderTable(snapshot);

    await userEvent.click(sortButton('Idle'));

    expect(rowTitles()).toEqual(['middling in b', 'old', 'middling in a', 'young, idle long']);
    expect(header('Age')).not.toHaveAttribute('aria-sort');
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('idle.desc');
  });

  it('adds a sort level on Shift+click', async () => {
    const user = userEvent.setup();
    renderTable(snapshot);

    // Repo first, then Age within a repo.
    await user.click(sortButton('Repo'));
    await user.keyboard('{Shift>}');
    await user.click(sortButton('Age'));
    await user.keyboard('{/Shift}');

    expect(new URLSearchParams(window.location.search).get('sort')).toBe('repo.asc,age.desc');
    expect(rowTitles()).toEqual(['middling in a', 'middling in b', 'young, idle long', 'old']);
  });

  it('reads the sort from the URL', () => {
    window.history.replaceState(null, '', '/?sort=repo.desc,age.asc');

    renderTable(snapshot);

    expect(rowTitles()).toEqual(['old', 'young, idle long', 'middling in b', 'middling in a']);
  });

  it('remembers the columns the Viewer picks in this browser', async () => {
    const first = renderTable(snapshot);
    expect(header('Why tracked')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /columns/i }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Why tracked' }));
    // Waiting On carries the No Reviewer flag, so it stays.
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Waiting On' })).not.toBeInTheDocument();

    expect(screen.queryByRole('columnheader', { name: /Why tracked/ })).not.toBeInTheDocument();
    first.unmount();
    renderTable(snapshot);
    expect(screen.queryByRole('columnheader', { name: /Why tracked/ })).not.toBeInTheDocument();
    expect(header('Age')).toBeInTheDocument();
  });

  it('flags the No Reviewer PRs', () => {
    renderTable(aSnapshot({ prs: [aPr({ title: 'nobody asked', noReviewer: true, requestedReviewers: [], waitingOn: [waitingOnAuthor(bob)] })] }));

    const row = screen.getByRole('row', { name: /nobody asked/ });
    expect(within(row).getByText('No Reviewer')).toBeInTheDocument();
  });
});

describe('the Table’s tabs', () => {
  const snapshot = aSnapshot({
    prs: [
      aPr({ title: 'asks alice', author: bob, waitingOn: [waitingOnReviewer(alice)] }),
      aPr({ title: 'asks the Team', author: bob, requestedReviewers: [], waitingOn: [waitingOnTheTeam] }),
      aPr({ title: 'alice’s own', author: alice, requestedReviewers: [bob], waitingOn: [waitingOnReviewer(bob)] }),
      aPr({ title: 'not hers', author: bob, requestedReviewers: [member('carol')], waitingOn: [waitingOnReviewer(member('carol'))] }),
    ],
  });

  it('shows the Viewer’s turn, requests to the Team included, and keeps the tab in the URL', async () => {
    renderTable(snapshot, 'alice');

    await userEvent.click(screen.getByRole('tab', { name: /Your turn/ }));

    expect(rowTitles().sort()).toEqual(['asks alice', 'asks the Team']);
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('my-turn');
  });

  it('counts the PRs in each tab', () => {
    renderTable(snapshot, 'alice');

    expect(screen.getByRole('tab', { name: 'All 4' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Your turn 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Your PRs 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Involving you 3' })).toBeInTheDocument();
  });

  it('asks for a Viewer in their tabs', () => {
    window.history.replaceState(null, '', '/?tab=my-prs');

    renderTable(snapshot, null);

    expect(screen.getByText(/pick who you are/i)).toBeInTheDocument();
  });
});
