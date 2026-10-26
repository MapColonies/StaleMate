import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/lib/local-storage';
import type { Snapshot } from '@/snapshot/types';
import { BoardView } from '@/views/board/board-view';
import { InboxView } from '@/views/inbox/inbox-view';
import { aPr, aSnapshot, aStack, clock, member, waitingOnAuthor, waitingOnReviewer, waitingOnTheTeam } from './fixtures/snapshot';
import { stubCompactWindow } from './window-width';

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

const row = (title: string) => screen.getByRole('listitem', { name: new RegExp(title) });

/** The block of a row that holds the PR itself: its title, repo and badges. */
const prBlock = (title: string): HTMLElement => {
  const block = screen.getByRole('link', { name: title }).closest<HTMLElement>('[data-pr-block]');
  if (block === null) {
    throw new Error(`no PR block around "${title}"`);
  }
  return block;
};

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
      'Rest of Infra',
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

    expect(titlesIn('Rest of Infra')).toEqual([]);
    await userEvent.click(within(bucket('Rest of Infra')).getByRole('button', { name: /Rest of Infra/ }));

    expect(titlesIn('Rest of Infra')).toEqual(['on carol']);
  });

  it('asks who the Viewer is without one, and shows what is not theirs', () => {
    renderInbox(snapshot, null);

    expect(screen.getByText(/I am…/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your turn' })).not.toBeInTheDocument();
    expect(titlesIn('No Reviewer')).toEqual(['nobody asked']);
    expect(titlesIn('Rest of Infra')).toHaveLength(4);
  });

  it('shows each PR’s repo without the org every PR shares, with the full name on hover', () => {
    renderInbox(snapshot, 'alice');

    expect(
      within(bucket('Your turn'))
        .getAllByTitle('MapColonies/a')
        .map((repo) => repo.textContent)
    ).toEqual(['a', 'a']);
  });
});

describe('the Inbox below 1280px', () => {
  beforeEach(() => {
    stubCompactWindow(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts Waiting On, with the No Reviewer flag, under the PR', () => {
    renderInbox(snapshot, 'alice');

    const pr = prBlock('nobody asked');
    expect(within(pr).getByText('Waiting On')).toBeInTheDocument();
    expect(within(pr).getByRole('list', { name: 'Waiting On' })).toHaveTextContent('carol');
    expect(within(pr).getByText('No Reviewer')).toBeInTheDocument();
  });

  it('still buckets the PRs, and shows the Viewer, their moves and each PR’s Urgency', () => {
    renderInbox(aSnapshot({ prs: [aPr({ title: 'old ask', author: bob, waitingOn: [waitingOnReviewer(alice)], urgency: 3 })] }), 'alice');

    expect(titlesIn('Your turn')).toEqual(['old ask']);
    expect(within(row('old ask')).getByRole('list', { name: 'Your move' })).toBeInTheDocument();
    expect(within(row('old ask')).getByRole('list', { name: 'Waiting On' })).toHaveTextContent('You');
    expect(within(row('old ask')).getByText(/d$/, { selector: '[data-urgency]' })).toHaveAttribute('data-urgency', '3');
  });

  describe('its filters', () => {
    const filtersPanel = () => screen.queryByRole('dialog', { name: 'Filters' });

    const openFilters = async () => {
      await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
      return screen.findByRole('dialog', { name: 'Filters' });
    };

    it('hide behind a Filters button that opens them in a side panel', async () => {
      renderInbox(snapshot, 'alice');
      expect(screen.queryByRole('complementary', { name: 'Filters' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();

      const panel = await openFilters();

      expect(within(panel).getByRole('switch', { name: 'Hide Bots' })).toBeInTheDocument();
      expect(within(within(panel).getByRole('group', { name: 'Age' })).getByRole('button', { name: '< 5 Working Days' })).toBeInTheDocument();
      expect(within(within(panel).getByRole('group', { name: 'Idle Time' })).getByRole('button', { name: '> 3 Working Days' })).toBeInTheDocument();
      expect(facetEntries('Repo')).toEqual(['b3', 'a2']);
    });

    it('count on the button the active filters the panel holds, leaving out the search beside it', () => {
      window.history.replaceState(null, '', '/?review=approved&hideBots=0&q=tiles');

      renderInbox(snapshot, 'alice');

      const button = screen.getByRole('button', { name: 'Filters: 2 active' });
      expect(button).toHaveTextContent('2');
      // A second count beside it, with the search in it, would disagree with the button's.
      expect(screen.queryByRole('button', { name: /Reset filters/ })).not.toBeInTheDocument();
    });

    it('filter the Inbox as soon as one changes in the panel, through the URL the Table and Board share', async () => {
      renderInbox(snapshot, 'alice');
      await openFilters();

      await userEvent.click(within(facet('Repo')).getByRole('checkbox', { name: /^a/ }));

      expect(new URLSearchParams(window.location.search).get('repo')).toBe('MapColonies/a');
      // The open panel hides the page behind it from screen readers.
      const yourPrs = screen.getByRole('region', { name: 'Your PRs, waiting on others', hidden: true });
      expect(within(yourPrs).queryAllByRole('link', { hidden: true })).toEqual([]);
      expect(screen.getByRole('button', { name: 'Filters: 1 active', hidden: true })).toBeInTheDocument();
    });

    it('reset from the panel, keeping the search, which has its own clear button', async () => {
      window.history.replaceState(null, '', '/?review=approved&idle=3&q=asks');
      renderInbox(snapshot, 'alice');
      const panel = await openFilters();

      await userEvent.click(within(panel).getByRole('button', { name: 'Reset filters' }));

      expect(window.location.search).toBe('?q=asks');
      expect(screen.getByRole('button', { name: 'Filters', hidden: true })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Reset filters' })).toBeDisabled();
    });

    it('close with Escape, giving focus back to the button', async () => {
      renderInbox(snapshot, 'alice');
      await openFilters();

      await userEvent.keyboard('{Escape}');

      await waitFor(() => expect(filtersPanel()).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus();
    });

    it('close with a click outside the panel', async () => {
      renderInbox(snapshot, 'alice');
      await openFilters();

      // The overlay has no role to find it by; it is what a click outside the panel lands on.
      await userEvent.click(document.querySelector('[data-slot="sheet-overlay"]')!);

      await waitFor(() => expect(filtersPanel()).not.toBeInTheDocument());
    });
  });
});

describe('the Inbox at 1280px and up', () => {
  beforeEach(() => {
    stubCompactWindow(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps Waiting On in a column of its own, beside the PR', () => {
    renderInbox(snapshot, 'alice');

    const pr = prBlock('nobody asked');
    expect(within(row('nobody asked')).getByRole('list', { name: 'Waiting On' })).toHaveTextContent('carol');
    expect(within(row('nobody asked')).getByText('No Reviewer')).toBeInTheDocument();
    expect(within(pr).queryByRole('list', { name: 'Waiting On' })).not.toBeInTheDocument();
    expect(within(pr).queryByText('No Reviewer')).not.toBeInTheDocument();
    expect(within(row('nobody asked')).queryByText('Waiting On')).not.toBeInTheDocument();
  });

  it('keeps the filters in a sidebar, with no Filters button', () => {
    renderInbox(snapshot, 'alice');

    expect(within(screen.getByRole('complementary', { name: 'Filters' })).getByRole('group', { name: 'Repo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Filters/ })).not.toBeInTheDocument();
  });
});

describe('the Inbox’s facets', () => {
  it('count the PRs for each value', () => {
    renderInbox(snapshot, 'alice');

    expect(facetEntries('Repo')).toEqual(['b3', 'a2']);
    expect(facetEntries('Author')).toEqual(['bob3', 'You1', 'carol1']);
    expect(within(facet('Repo')).getByTitle('MapColonies/a')).toHaveTextContent(/^a$/);
  });

  it('filter the PRs, keep the filter in the URL, and recount the other facets', async () => {
    renderInbox(snapshot, 'alice');

    await userEvent.click(within(facet('Repo')).getByRole('checkbox', { name: /^a/ }));

    expect(new URLSearchParams(window.location.search).get('repo')).toBe('MapColonies/a');
    expect(within(facet('Repo')).getByRole('checkbox', { name: /^a/ })).toHaveAttribute('aria-checked', 'true');
    expect(titlesIn('Your PRs, waiting on others')).toEqual([]);
    // The Repo facet keeps its other values; the others count what the Repo filter keeps.
    expect(facetEntries('Repo')).toEqual(['b3', 'a2']);
    expect(facetEntries('Author')).toEqual(['bob2']);
  });

  it('reflect the filters read from the URL', () => {
    window.history.replaceState(null, '', '/?review=approved');

    renderInbox(snapshot, 'alice');

    expect(facetEntries('Repo')).toEqual(['b1']);
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

  it('shows the Stack Position chip of a PR in a Stack, and opens its siblings, but nothing on a PR with none', async () => {
    const stack = aStack(2, 4);
    renderInbox(aSnapshot({ prs: [aPr({ title: 'stacked', stack }), aPr({ title: 'alone' })] }));

    expect(screen.getByRole('button', { name: 'Stack position 2 of 4' })).toHaveTextContent('2/4');
    expect(screen.getAllByRole('button', { name: /Stack position/ })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /Stack position/ }));

    expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(4);
  });

  it('hints that a PR the author owes a merge on is Held, beside the merge move', () => {
    const stack = aStack(2, 3, { heldBy: { repo: 'MapColonies/jobnik', number: 64 } });
    renderInbox(aSnapshot({ prs: [aPr({ title: 'held one', author: bob, waitingOn: [waitingOnAuthor(bob)], stack })] }), 'bob');

    expect(screen.getByText('Held by #64')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Your move' })).getByText('Merge')).toBeInTheDocument();
  });

  it('marks a PR in the Stack that the Team does not track', async () => {
    const stack = aStack(1, 2);
    const siblings = [stack.siblings[0]!, { ...stack.siblings[1]!, tracked: false }];
    renderInbox(aSnapshot({ prs: [aPr({ repo: 'MapColonies/jobnik', number: 64, stack: { ...stack, siblings } })] }));

    await userEvent.click(screen.getByRole('button', { name: /Stack position/ }));

    const items = within(screen.getByRole('dialog')).getAllByRole('listitem');
    expect(items[0]).not.toHaveTextContent('Not tracked');
    expect(items[1]).toHaveTextContent('Not tracked');
  });
});

describe('the Inbox’s Stack grouping', () => {
  const step = (position: number, age: number, overrides: Partial<Parameters<typeof aPr>[0]> = {}) =>
    aPr({ title: `step ${position}`, age: clock(age), stack: aStack(position, 3), ...overrides });
  const grouping = () => screen.getByRole('checkbox', { name: 'Group Stacks' });
  const connected = (title: string) => within(row(title)).queryAllByTestId('stack-connector').length > 0;

  const stacked = aSnapshot({ prs: [step(3, 5), aPr({ title: 'alone', age: clock(3) }), step(1, 1), step(2, 2)] });

  it('is on by default: a Stack sits together in Stack order, where its best-ranked member sits', () => {
    renderInbox(stacked);

    // Newest first: step 1 (1 day) leads, so the Stack leads, then alone.
    expect(titlesIn('Rest of Infra').filter((title) => /step|alone/.test(title))).toEqual(['step 1', 'step 2', 'step 3', 'alone']);
    expect(grouping()).toBeChecked();
  });

  it('puts the Stack where its best-ranked member sits under each order', async () => {
    renderInbox(aSnapshot({ prs: [aPr({ title: 'old', age: clock(9) }), step(2, 4), step(1, 6), aPr({ title: 'new', age: clock(1) })] }));
    const shown = () => titlesIn('Rest of Infra').filter((title) => /step|old|new/.test(title));

    // Newest first: the Stack's best is step 2 (4 days), behind "new".
    expect(shown()).toEqual(['new', 'step 1', 'step 2', 'old']);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Order' }), 'Oldest first');

    // Oldest first: the Stack's best is step 1 (6 days), behind "old".
    expect(shown()).toEqual(['old', 'step 1', 'step 2', 'new']);
  });

  it('puts the Stack where its best-ranked member sits under the idle orders too', async () => {
    const idle = (minutes: number) => ({ workingMs: minutes * 60_000, since: '2026-10-01T09:00:00Z' });
    renderInbox(
      aSnapshot({
        prs: [
          aPr({ title: 'quiet', idleTime: idle(900) }),
          step(2, 1, { idleTime: idle(300) }),
          step(1, 1, { idleTime: idle(100) }),
          aPr({ title: 'busy', idleTime: idle(1) }),
        ],
      })
    );
    const shown = () => titlesIn('Rest of Infra').filter((title) => /step|quiet|busy/.test(title));

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Order' }), 'Idle longest first');
    expect(shown()).toEqual(['quiet', 'step 1', 'step 2', 'busy']);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Order' }), 'Recently active first');
    expect(shown()).toEqual(['busy', 'step 1', 'step 2', 'quiet']);
  });

  it('groups the members a filter leaves, and the chip still shows the full Stack', () => {
    const botStep = step(2, 2, { author: { login: 'renovate', kind: 'bot' } });
    renderInbox(aSnapshot({ prs: [step(3, 5), botStep, step(1, 1)] }));

    expect(titlesIn('Rest of Infra').filter((title) => /step/.test(title))).toEqual(['step 1', 'step 3']);
    expect(connected('step 1')).toBe(true);
    expect(connected('step 3')).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Stack position 3 of 3' })).toHaveLength(1);
  });

  it('is read from the URL, ahead of the saved choice', () => {
    window.localStorage.setItem(STORAGE_KEYS.groupStacks, 'on');
    window.history.replaceState(null, '', '/?group=off');
    renderInbox(stacked);

    expect(grouping()).not.toBeChecked();
  });

  it('connects the adjacent rows of a Stack, and nothing else', () => {
    renderInbox(stacked);

    expect(connected('step 1')).toBe(true);
    expect(connected('step 2')).toBe(true);
    expect(connected('step 3')).toBe(true);
    expect(connected('alone')).toBe(false);
  });

  it('shows a Stack with one visible member as a plain row with its chip', async () => {
    renderInbox(stacked);

    await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), 'step 2');

    expect(titlesIn('Rest of Infra').filter((title) => /step/.test(title))).toEqual(['step 2']);
    expect(connected('step 2')).toBe(false);
    expect(screen.getByRole('button', { name: /Stack position 2 of 3/ })).toBeInTheDocument();
  });

  it('groups only within a bucket', async () => {
    const snap = aSnapshot({
      prs: [
        step(1, 1, { author: bob, waitingOn: [waitingOnReviewer(alice)] }),
        step(2, 2, { author: bob, waitingOn: [waitingOnReviewer(bob)] }),
        step(3, 3, { author: bob, waitingOn: [waitingOnReviewer(bob)] }),
      ],
    });
    renderInbox(snap, 'alice');
    await userEvent.click(screen.getByRole('button', { name: /Rest of Infra/ }));

    expect(titlesIn('Your turn')).toEqual(['step 1']);
    expect(titlesIn('Rest of Infra')).toEqual(['step 2', 'step 3']);
    expect(connected('step 1')).toBe(false);
  });

  it('can be turned off, back to the plain order, and the choice is remembered', async () => {
    const { unmount } = renderInbox(stacked);

    await userEvent.click(grouping());

    expect(titlesIn('Rest of Infra').filter((title) => /step|alone/.test(title))).toEqual(['step 1', 'step 2', 'alone', 'step 3']);
    expect(connected('step 1')).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEYS.groupStacks)).toBe('off');

    unmount();
    window.history.replaceState(null, '', '/');
    renderInbox(stacked);
    expect(grouping()).not.toBeChecked();
  });
});
