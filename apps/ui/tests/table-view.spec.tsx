import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { STORAGE_KEYS } from '@/lib/local-storage';
import type { Snapshot } from '@/snapshot/types';
import { TableView } from '@/views/table/table-view';
import { aPr, aSnapshot, aStack, clock, member, waitingOnAuthor, waitingOnReviewer, waitingOnTheTeam } from './fixtures/snapshot';

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
    .map((row) => within(row).getByRole('link', { name: /^(?!MAPCO-)/ }).textContent ?? '');

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

  it('sorts by Age, newest first, by default', () => {
    renderTable(snapshot);

    expect(rowTitles()).toEqual(['young, idle long', 'middling in a', 'middling in b', 'old']);
    expect(header('Age')).toHaveAttribute('aria-sort', 'ascending');
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('button', { name: 'Reset sort' })).not.toBeInTheDocument();
  });

  it('remembers the sort, sort levels included, in this browser', async () => {
    const user = userEvent.setup();
    const first = renderTable(snapshot);

    await user.click(sortButton('Repo'));
    await user.keyboard('{Shift>}');
    await user.click(sortButton('Idle'));
    await user.keyboard('{/Shift}');
    first.unmount();
    window.history.replaceState(null, '', '/');

    renderTable(snapshot);
    expect(rowTitles()).toEqual(['middling in a', 'middling in b', 'young, idle long', 'old']);
    expect(window.localStorage.getItem('stalemate.table.sort')).toBe('repo.asc,idle.desc');
  });

  it('prefers the URL’s sort over the saved one, leaving the saved one alone', () => {
    window.localStorage.setItem('stalemate.table.sort', 'idle.desc');
    window.history.replaceState(null, '', '/?sort=repo.desc,age.asc');

    renderTable(snapshot);

    expect(rowTitles()).toEqual(['old', 'young, idle long', 'middling in b', 'middling in a']);
    expect(window.localStorage.getItem('stalemate.table.sort')).toBe('idle.desc');
  });

  it('falls back to the default when the saved sort is unusable', () => {
    window.localStorage.setItem('stalemate.table.sort', 'sideways.up');

    renderTable(snapshot);

    expect(rowTitles()).toEqual(['young, idle long', 'middling in a', 'middling in b', 'old']);
  });

  it('resets the sort to the default and forgets the saved one', async () => {
    window.localStorage.setItem('stalemate.table.sort', 'idle.desc');
    renderTable(snapshot);

    await userEvent.click(screen.getByRole('button', { name: 'Reset sort' }));

    expect(rowTitles()).toEqual(['young, idle long', 'middling in a', 'middling in b', 'old']);
    expect(window.localStorage.getItem('stalemate.table.sort')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset sort' })).not.toBeInTheDocument();
  });

  it('resets a sort from the URL, keeping the default in the URL so the link opens newest first', async () => {
    window.history.replaceState(null, '', '/?sort=idle.desc');
    renderTable(snapshot);

    await userEvent.click(screen.getByRole('button', { name: 'Reset sort' }));

    expect(rowTitles()).toEqual(['young, idle long', 'middling in a', 'middling in b', 'old']);
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('age.asc');
  });

  it('still sorts and resets when the browser blocks storage', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    renderTable(snapshot);

    await userEvent.click(sortButton('Idle'));
    expect(rowTitles()).toEqual(['middling in b', 'old', 'middling in a', 'young, idle long']);
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('idle.desc');

    await userEvent.click(screen.getByRole('button', { name: 'Reset sort' }));
    expect(rowTitles()).toEqual(['young, idle long', 'middling in a', 'middling in b', 'old']);
  });

  it('sorts by Idle Time, longest first, and keeps the sort in the URL', async () => {
    renderTable(snapshot);

    await userEvent.click(sortButton('Idle'));

    expect(rowTitles()).toEqual(['middling in b', 'old', 'middling in a', 'young, idle long']);
    expect(header('Age')).not.toHaveAttribute('aria-sort');
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('idle.desc');
  });

  it('sorts by PR title, A to Z', async () => {
    renderTable(snapshot);

    await userEvent.click(sortButton('PR'));

    expect(rowTitles()).toEqual(['middling in a', 'middling in b', 'old', 'young, idle long']);
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
    // The PR names the row, and Waiting On carries the No Reviewer flag, so they stay.
    expect(screen.queryByRole('menuitemcheckbox', { name: 'PR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Waiting On' })).not.toBeInTheDocument();

    expect(screen.queryByRole('columnheader', { name: /Why tracked/ })).not.toBeInTheDocument();
    first.unmount();
    renderTable(snapshot);
    expect(screen.queryByRole('columnheader', { name: /Why tracked/ })).not.toBeInTheDocument();
    expect(header('Age')).toBeInTheDocument();
  });

  it('sorts by Jira Ticket, PRs without one first', async () => {
    renderTable(
      aSnapshot({
        prs: [
          aPr({ title: 'second ticket', jiraTickets: ['MAPCO-10'], age: clock(3) }),
          aPr({ title: 'no ticket', jiraTickets: [], age: clock(2) }),
          aPr({ title: 'first ticket', jiraTickets: ['MAPCO-9'], age: clock(1) }),
        ],
      })
    );

    await userEvent.click(sortButton('Jira'));

    expect(rowTitles()).toEqual(['no ticket', 'first ticket', 'second ticket']);
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('jira.asc');
  });

  it('links each PR’s Jira Ticket, or says it has none', () => {
    renderTable(aSnapshot({ prs: [aPr({ title: 'ticketed', jiraTickets: ['MAPCO-7'] }), aPr({ title: 'unticketed', jiraTickets: [] })] }));

    expect(within(screen.getByRole('row', { name: /\bticketed/ })).getByRole('link', { name: 'MAPCO-7' })).toHaveAttribute(
      'href',
      'https://mapcolonies.atlassian.net/browse/MAPCO-7'
    );
    expect(within(screen.getByRole('row', { name: /unticketed/ })).getByTitle('No Jira ticket')).toHaveTextContent('—');
  });

  it('leaves the Jira column out without a Jira site', () => {
    renderTable(aSnapshot({ config: { urgencyThresholds: [2, 4, 8], refreshCooldownMs: 30_000 }, prs: [aPr()] }));

    expect(screen.queryByRole('columnheader', { name: /^Jira/ })).not.toBeInTheDocument();
  });

  it('puts the PR right after Age and Idle', () => {
    renderTable(aSnapshot({ prs: [aPr({ title: 'third', jiraTickets: ['MAPCO-1'] })] }));

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Age',
      'Idle',
      'PR',
      'Waiting On',
      'Repo',
      'Author',
      'Review',
      'Checks',
      'Jira',
      'Why tracked',
    ]);
    const cells = within(screen.getByRole('row', { name: /third/ })).getAllByRole('cell');
    expect(cells[2]).toContainElement(screen.getByRole('link', { name: 'third' }));
  });

  it('scrolls the PRs in a region of their own, under the tabs, Columns picker and filters', () => {
    renderTable(aSnapshot({ prs: [aPr({ title: 'scrolled' })] }));

    const scroller = screen.getByRole('region', { name: 'Tracked PRs' });
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(within(scroller).getByRole('table')).toHaveTextContent('scrolled');
    expect(within(scroller).getByText(/1 of 1 Tracked PRs/)).toBeInTheDocument();
    expect(scroller).not.toContainElement(screen.getByRole('tablist'));
    expect(scroller).not.toContainElement(screen.getByRole('button', { name: /columns/i }));
    expect(scroller).not.toContainElement(screen.getByRole('textbox', { name: 'Search' }));
  });

  it('flags the No Reviewer PRs', () => {
    renderTable(aSnapshot({ prs: [aPr({ title: 'nobody asked', noReviewer: true, requestedReviewers: [], waitingOn: [waitingOnAuthor(bob)] })] }));

    const row = screen.getByRole('row', { name: /nobody asked/ });
    expect(within(row).getByText('No Reviewer')).toBeInTheDocument();
  });

  it('shows repos without the org every PR shares, with the full name on hover', () => {
    renderTable(aSnapshot({ prs: [aPr({ title: 'overseer', repo: 'MapColonies/discrete-overseer' }), aPr({ repo: 'MapColonies/opa-la' })] }));

    const row = screen.getByRole('row', { name: /overseer/ });
    expect(within(row).getByTitle('MapColonies/discrete-overseer')).toHaveTextContent(/^discrete-overseer$/);
  });

  it('shows full repo names when the PRs span more than one org', () => {
    renderTable(aSnapshot({ prs: [aPr({ title: 'overseer', repo: 'MapColonies/discrete-overseer' }), aPr({ repo: 'open-policy-agent/opa' })] }));

    const row = screen.getByRole('row', { name: /overseer/ });
    expect(within(row).getByText('MapColonies/discrete-overseer')).not.toHaveAttribute('title');
  });

  it('offers the repos by their short names in the Repo filter, which filters by the full name', async () => {
    renderTable(snapshot);

    // The Repo filter's button, not the Repo column's sort button.
    await userEvent.click(screen.getByRole('button', { name: /^Repo/, expanded: false }));
    expect(screen.getAllByRole('menuitemcheckbox').map((option) => option.textContent)).toEqual(['a', 'b', 'c']);
    expect(within(screen.getByRole('menuitemcheckbox', { name: 'a' })).getByTitle('MapColonies/a')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'a' }));

    expect(new URLSearchParams(window.location.search).get('repo')).toBe('MapColonies/a');
    expect(rowTitles()).toEqual(['middling in a']);
  });

  it('still finds a repo’s PRs by its full name', async () => {
    renderTable(snapshot);

    await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), 'MapColonies/c');

    expect(rowTitles()).toEqual(['old']);
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

  it('shows the Stack Position chip of a PR in a Stack, and opens its siblings, but nothing on a PR with none', async () => {
    const stack = aStack(2, 4);
    renderTable(aSnapshot({ prs: [aPr({ title: 'stacked', stack }), aPr({ title: 'alone' })] }));

    expect(screen.getByRole('button', { name: 'Stack position 2 of 4' })).toHaveTextContent('2/4');
    expect(screen.getAllByRole('button', { name: /Stack position/ })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /Stack position/ }));

    expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(4);
  });
});

describe('the Table’s Stack grouping', () => {
  const step = (position: number, age: number, overrides: Partial<Parameters<typeof aPr>[0]> = {}) =>
    aPr({ title: `step ${position}`, age: clock(age), idleTime: clock(1), stack: aStack(position, 3), ...overrides });
  const grouping = () => screen.getByRole('checkbox', { name: 'Group Stacks' });
  const connected = (title: string) =>
    within(screen.getByRole('link', { name: title }).closest('tr')!).queryAllByTestId('stack-connector').length > 0;

  const stacked = aSnapshot({ prs: [step(3, 5), aPr({ title: 'alone', age: clock(3) }), step(1, 1), step(2, 2)] });

  it('is on by default: a Stack sits together in Stack order, where its best-ranked member sits', () => {
    renderTable(stacked);

    // Newest first: step 1 (1 day) leads, so the Stack leads, then alone.
    expect(rowTitles()).toEqual(['step 1', 'step 2', 'step 3', 'alone']);
    expect(grouping()).toBeChecked();
  });

  it('gives the plain sorted Table when turned off, and remembers the choice', async () => {
    renderTable(stacked);

    await userEvent.click(grouping());

    expect(rowTitles()).toEqual(['step 1', 'step 2', 'alone', 'step 3']);
    expect(connected('step 1')).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEYS.groupStacks)).toBe('off');
  });

  it('is read from the URL, ahead of the saved choice', () => {
    window.localStorage.setItem(STORAGE_KEYS.groupStacks, 'on');
    window.history.replaceState(null, '', '/?group=off');
    renderTable(stacked);

    expect(grouping()).not.toBeChecked();
  });

  it('puts the Stack where its best-ranked member sits under a column sort', async () => {
    renderTable(aSnapshot({ prs: [aPr({ title: 'old', age: clock(9) }), step(2, 4), step(1, 6), aPr({ title: 'new', age: clock(1) })] }));

    // Newest first: the Stack's best is step 2 (4 days), behind "new".
    expect(rowTitles()).toEqual(['new', 'step 1', 'step 2', 'old']);

    await userEvent.click(sortButton('Age'));

    // Oldest first: the Stack's best is step 1 (6 days), behind "old".
    expect(rowTitles()).toEqual(['old', 'step 1', 'step 2', 'new']);
  });

  it('puts the Stack where its best-ranked member sits under a multi-column sort', async () => {
    const idle = (minutes: number) => ({ workingMs: minutes * 60_000, since: '2026-10-01T09:00:00Z' });
    renderTable(
      aSnapshot({
        prs: [
          aPr({ title: 'a-short', repo: 'MapColonies/a', idleTime: idle(1) }),
          step(2, 2, { repo: 'MapColonies/b', idleTime: idle(3) }),
          step(1, 7, { repo: 'MapColonies/b', idleTime: idle(1) }),
          aPr({ title: 'c-alone', repo: 'MapColonies/c' }),
          aPr({ title: 'a-long', repo: 'MapColonies/a', idleTime: idle(5) }),
        ],
      })
    );

    const user = userEvent.setup();
    await user.click(sortButton('Repo'));
    await user.keyboard('{Shift>}');
    await user.click(sortButton('Idle'));
    await user.keyboard('{/Shift}');

    // Repo A to Z, then longest idle first: both repo a PRs, then the Stack, whose best member (step 2, repo b) is next.
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('repo.asc,idle.desc');
    expect(rowTitles()).toEqual(['a-long', 'a-short', 'step 1', 'step 2', 'c-alone']);
  });

  it('groups only within a tab', async () => {
    const alice = member('alice');
    renderTable(
      aSnapshot({
        prs: [
          step(1, 1, { waitingOn: [waitingOnReviewer(alice)] }),
          aPr({ title: 'between', age: clock(2), waitingOn: [waitingOnAuthor(bob)] }),
          step(2, 3, { waitingOn: [waitingOnAuthor(bob)] }),
        ],
      }),
      'alice'
    );

    await userEvent.click(screen.getByRole('tab', { name: /^Your turn/ }));

    expect(rowTitles()).toEqual(['step 1']);
    expect(connected('step 1')).toBe(false);

    await userEvent.click(screen.getByRole('tab', { name: /^All/ }));

    expect(rowTitles()).toEqual(['step 1', 'step 2', 'between']);
  });

  it('groups the members a filter leaves, and the chip still shows the full Stack', () => {
    const botStep = step(2, 2, { author: { login: 'renovate', kind: 'bot' } });
    renderTable(aSnapshot({ prs: [step(3, 5), botStep, step(1, 1)] }));

    expect(rowTitles()).toEqual(['step 1', 'step 3']);
    expect(connected('step 1')).toBe(true);
    expect(connected('step 3')).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Stack position 3 of 3' })).toHaveLength(1);
  });

  it('connects the adjacent rows of a Stack, and nothing else', () => {
    renderTable(stacked);

    expect(connected('step 1')).toBe(true);
    expect(connected('step 2')).toBe(true);
    expect(connected('step 3')).toBe(true);
    expect(connected('alone')).toBe(false);
  });

  it('shows a Stack with one visible member as a plain row with its chip', () => {
    renderTable(aSnapshot({ prs: [step(2, 1), aPr({ title: 'alone', age: clock(3) })] }));

    expect(connected('step 2')).toBe(false);
    expect(screen.getByRole('button', { name: 'Stack position 2 of 3' })).toBeInTheDocument();
  });
});
