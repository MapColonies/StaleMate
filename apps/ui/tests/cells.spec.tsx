import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  AgeChip,
  CheckStatusBadge,
  ConflictBadge,
  IdleLine,
  InclusionReasonBadge,
  JiraTickets,
  MovePills,
  NoReviewerFlag,
  ReviewStatusBadge,
  StackPositionChip,
  WaitingOnChips,
} from '@/cells';
import type { TrackedPr } from '@/snapshot/types';
import {
  JIRA_BASE_URL,
  aPr,
  aStack,
  clock,
  member,
  outsider,
  waitingOnAuthor,
  waitingOnReviewer,
  waitingOnTeam,
  waitingOnTheTeam,
} from './fixtures/snapshot';

const alice = member('alice');
const bob = member('bob');

describe('ReviewStatusBadge', () => {
  it('names the Review Status', () => {
    render(<ReviewStatusBadge pr={aPr({ reviewStatus: 'awaitingReReview' })} />);

    expect(screen.getByText('Awaiting Re-review')).toBeInTheDocument();
  });

  it('counts the approvals on Approved', () => {
    render(<ReviewStatusBadge pr={aPr({ reviewStatus: 'approved', approvals: 2 })} />);

    expect(screen.getByText('Approved ×2')).toBeInTheDocument();
  });
});

describe('CheckStatusBadge', () => {
  it('names the Check Status', () => {
    render(<CheckStatusBadge status="failing" />);

    expect(screen.getByText('Failing')).toBeInTheDocument();
  });
});

describe('ConflictBadge', () => {
  it('flags a PR that conflicts with its base', () => {
    render(<ConflictBadge pr={aPr({ conflicting: true })} />);

    expect(screen.getByText('Conflicts')).toBeInTheDocument();
  });

  it('shows nothing for a PR that does not conflict', () => {
    const { container } = render(<ConflictBadge pr={aPr({ conflicting: false })} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('JiraTickets', () => {
  it('links the Jira Ticket to Jira, in a new tab', () => {
    render(<JiraTickets pr={aPr({ jiraTickets: ['MAPCO-1234'] })} jiraBaseUrl={JIRA_BASE_URL} />);

    const link = screen.getByRole('link', { name: 'MAPCO-1234' });

    expect(link).toHaveAttribute('href', 'https://mapcolonies.atlassian.net/browse/MAPCO-1234');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('links the first of several Jira Tickets and folds the rest, naming them on hover', () => {
    render(<JiraTickets pr={aPr({ jiraTickets: ['MAPCO-1', 'MAPCO-2', 'MAPCO-3'] })} jiraBaseUrl={JIRA_BASE_URL} />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'MAPCO-1' })).toBeInTheDocument();
    expect(screen.getByText('+2')).toHaveAttribute('title', 'Also MAPCO-2, MAPCO-3');
  });

  it('says a PR has no Jira Ticket', () => {
    render(<JiraTickets pr={aPr({ jiraTickets: [] })} jiraBaseUrl={JIRA_BASE_URL} />);

    expect(screen.getByText('No ticket')).toHaveAttribute('title', 'No Jira ticket');
  });

  it('says it with a dash where it is short of room', () => {
    render(<JiraTickets pr={aPr({ jiraTickets: [] })} jiraBaseUrl={JIRA_BASE_URL} compact />);

    expect(screen.getByText('—')).toHaveAttribute('title', 'No Jira ticket');
  });

  it('shows nothing without a Jira site', () => {
    const { container } = render(<JiraTickets pr={aPr({ jiraTickets: [] })} jiraBaseUrl={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('MovePills', () => {
  const pills = (): string[] =>
    within(screen.getByRole('list', { name: 'Your move' }))
      .getAllByRole('listitem')
      .map((pill) => pill.textContent ?? '');

  it('names the moves the Viewer owes, even where the Review Status points at someone else', () => {
    const waitingOn = [waitingOnReviewer(alice, ['reReview']), waitingOnAuthor(bob, ['fixChecks', 'resolveConflict'])];
    render(<MovePills pr={aPr({ author: bob, reviewStatus: 'awaitingReReview', waitingOn })} viewer="bob" hideViaTeam={false} />);

    expect(pills()).toEqual(['Fix checks', 'Resolve conflict']);
  });

  it('names a review where a request to the Team puts the PR on the Viewer', () => {
    render(<MovePills pr={aPr({ author: bob, waitingOn: [waitingOnTheTeam] })} viewer="alice" hideViaTeam={false} />);

    expect(pills()).toEqual(['Review']);
  });

  it('shows nothing when it is not the Viewer’s turn', () => {
    const pr = aPr({ author: bob, waitingOn: [waitingOnReviewer(alice), waitingOnTheTeam] });
    const { container, rerender } = render(<MovePills pr={pr} viewer="carol" hideViaTeam />);
    expect(container).toBeEmptyDOMElement();

    rerender(<MovePills pr={pr} viewer={null} hideViaTeam={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('WaitingOnChips', () => {
  /** The chips' text, one per party. */
  const chips = (): string[] =>
    within(screen.getByRole('list', { name: 'Waiting On' }))
      .getAllByRole('listitem')
      .map((chip) => chip.textContent ?? '');

  it('names the author and the reviewers it waits on', () => {
    render(<WaitingOnChips pr={aPr({ author: bob, waitingOn: [waitingOnAuthor(bob), waitingOnReviewer(alice)] })} viewer={null} />);

    expect(chips()).toEqual(['bob author', 'alice reviewer']);
  });

  it('shows the Viewer as You', () => {
    render(<WaitingOnChips pr={aPr({ author: bob, waitingOn: [waitingOnReviewer(alice)] })} viewer="alice" />);

    expect(chips()).toEqual(['You reviewer']);
  });

  it('puts the Viewer first, the others in their order', () => {
    const carol = member('carol');
    render(
      <WaitingOnChips
        pr={aPr({ author: bob, waitingOn: [waitingOnReviewer(carol), waitingOnReviewer(alice), waitingOnReviewer(bob)] })}
        viewer="alice"
      />
    );

    expect(chips()).toEqual(['You reviewer', 'carol reviewer', 'bob reviewer']);
  });

  it('folds the parties past the most it may show into +N more, naming them on hover', () => {
    const waitingOn = [waitingOnReviewer(member('carol')), waitingOnReviewer(alice), waitingOnReviewer(member('dave')), waitingOnTheTeam];
    render(<WaitingOnChips pr={aPr({ author: bob, waitingOn })} viewer="alice" stacked max={2} />);

    expect(chips()).toEqual(['You reviewer', 'carol reviewer +2 more']);
    expect(screen.getByText('+2 more')).toHaveAttribute('title', 'dave · reviewer\n@infra');
  });

  it('shows every party when they fit', () => {
    render(<WaitingOnChips pr={aPr({ author: bob, waitingOn: [waitingOnAuthor(bob), waitingOnReviewer(alice)] })} viewer={null} stacked max={2} />);

    expect(chips()).toEqual(['bob author', 'alice reviewer']);
  });

  it('marks people outside the Team ext', () => {
    const stranger = outsider('stranger');
    render(<WaitingOnChips pr={aPr({ author: stranger, waitingOn: [waitingOnAuthor(stranger)] })} viewer={null} />);

    expect(chips()).toEqual(['stranger ext author']);
  });

  it('names a team by its slug', () => {
    render(<WaitingOnChips pr={aPr({ author: bob, waitingOn: [waitingOnTeam('raster')] })} viewer="alice" />);

    expect(chips()).toEqual(['@raster']);
    expect(screen.queryByText(/via @/)).not.toBeInTheDocument();
  });

  it('marks a request to the Team via @infra when it puts the PR on the Viewer', () => {
    render(<WaitingOnChips pr={aPr({ author: bob, waitingOn: [waitingOnTheTeam] })} viewer="alice" />);

    expect(screen.getByText('@infra')).toBeInTheDocument();
    expect(screen.getByText('via @infra')).toBeInTheDocument();
  });

  it('leaves the via @infra mark off where the request is not the Viewer’s turn', () => {
    const ownPr = aPr({ author: member('alice'), waitingOn: [waitingOnTheTeam] });
    const { rerender } = render(<WaitingOnChips pr={ownPr} viewer="alice" />);
    expect(screen.queryByText('via @infra')).not.toBeInTheDocument();

    rerender(<WaitingOnChips pr={aPr({ author: bob, waitingOn: [waitingOnTheTeam] })} viewer="alice" hideViaTeam />);
    expect(screen.queryByText('via @infra')).not.toBeInTheDocument();

    rerender(<WaitingOnChips pr={aPr({ author: bob, waitingOn: [waitingOnTheTeam] })} viewer={null} />);
    expect(screen.queryByText('via @infra')).not.toBeInTheDocument();
  });
});

describe('AgeChip', () => {
  const now = Date.parse('2026-10-15T09:00:00Z');

  it('shows the Age in whole Working Days, coloured by Urgency', () => {
    render(<AgeChip pr={aPr({ age: clock(5.6), urgency: 2 })} now={now} />);

    expect(screen.getByText('5d')).toHaveAttribute('data-urgency', '2');
  });

  it('gives a Draft no Urgency', () => {
    render(<AgeChip pr={aPr({ reviewStatus: 'draft', age: clock(9), urgency: null })} now={now} />);

    expect(screen.getByText('9d')).toHaveAttribute('data-urgency', 'none');
  });

  it('shows when the PR became ready, how long ago in wall-clock time, and its last human activity on hover', () => {
    const pr = aPr({
      age: { workingMs: clock(9).workingMs, since: '2026-10-01T09:00:00Z' },
      idleTime: { workingMs: clock(2).workingMs, since: '2026-10-12T09:00:00Z' },
    });
    render(<AgeChip pr={pr} now={now} />);

    const hover = screen.getByText('9d').closest('[title]')?.getAttribute('title');
    expect(hover).toMatch(/Ready for review: .*2026.* \(14 d ago\)/);
    expect(hover).toMatch(/Last human activity: .*2026/);
  });
});

describe('IdleLine', () => {
  it('shows the Idle Time from 1 Working Day', () => {
    render(<IdleLine pr={aPr({ idleTime: clock(3.2) })} />);

    expect(screen.getByText('idle 3d')).toBeInTheDocument();
  });

  it('shows nothing under 1 Working Day', () => {
    const { container } = render(<IdleLine pr={aPr({ idleTime: clock(0.9) })} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('NoReviewerFlag', () => {
  it('flags a PR with No Reviewer', () => {
    render(<NoReviewerFlag pr={aPr({ noReviewer: true, waitingOn: [waitingOnAuthor(bob)] })} />);

    expect(screen.getByText('No Reviewer')).toBeInTheDocument();
  });

  it('shows nothing otherwise', () => {
    const { container } = render(<NoReviewerFlag pr={aPr({ noReviewer: false })} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('InclusionReasonBadge', () => {
  it('names only the strongest Inclusion Reason, and all of them on hover', () => {
    render(<InclusionReasonBadge pr={aPr({ inclusionReasons: ['teamReviewRequested', 'teamRepo'] })} viewer={null} />);

    expect(screen.getByText('Team review requested')).toBeInTheDocument();
    expect(screen.queryByText('Team Repo')).not.toBeInTheDocument();
    expect(screen.getByTitle('Why tracked: Team review requested, Team Repo')).toBeInTheDocument();
  });

  it.each<[string, Partial<TrackedPr>]>([
    ['Authored by you', { inclusionReasons: ['authoredByMember'], author: alice }],
    ['Your review requested', { inclusionReasons: ['memberReviewRequested'], requestedReviewers: [bob, alice] }],
    ['Assigned to you', { inclusionReasons: ['assignedToMember'], assignees: [alice] }],
    ['Reviewed by you', { inclusionReasons: ['reviewedByMember'], reviewers: [bob, alice] }],
  ])('says %s when the Team Member it means is the Viewer', (label, overrides) => {
    render(<InclusionReasonBadge pr={aPr(overrides)} viewer="alice" />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('names the Team Member when they are not the Viewer', () => {
    render(<InclusionReasonBadge pr={aPr({ inclusionReasons: ['reviewedByMember', 'teamRepo'], reviewers: [bob] })} viewer="alice" />);

    expect(screen.getByText('Reviewed by Team Member')).toBeInTheDocument();
  });

  it('keeps its rank when a weaker reason names the Viewer', () => {
    const pr = aPr({ inclusionReasons: ['authoredByMember', 'reviewedByMember'], author: bob, reviewers: [alice] });
    render(<InclusionReasonBadge pr={pr} viewer="alice" />);

    expect(screen.getByText('Authored by Team Member')).toBeInTheDocument();
    expect(screen.getByTitle('Why tracked: Authored by Team Member, Reviewed by you')).toBeInTheDocument();
  });
});

describe('StackPositionChip', () => {
  const inStack = (position: number, size: number, overrides: Partial<NonNullable<TrackedPr['stack']>> = {}) =>
    aPr({ repo: 'MapColonies/jobnik', number: 63 + position, stack: aStack(position, size, overrides) });

  it('shows the Stack Position as position/size', () => {
    render(<StackPositionChip pr={inStack(2, 4)} />);

    expect(screen.getByRole('button', { name: 'Stack position 2 of 4' })).toHaveTextContent('2/4');
  });

  it('shows nothing for a PR with no Stack', () => {
    const { container } = render(<StackPositionChip pr={aPr()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the full size of a long Stack even when its list is cut short', async () => {
    const stack = aStack(1, 13);
    render(
      <StackPositionChip
        pr={aPr({ repo: 'MapColonies/jobnik', number: 64, stack: { ...stack, truncated: true, siblings: stack.siblings.slice(0, 10) } })}
      />
    );

    expect(screen.getByRole('button', { name: 'Stack position 1 of 13' })).toHaveTextContent('1/13');

    await userEvent.click(screen.getByRole('button', { name: /Stack position/ }));

    expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('Showing the first 10 of 13 PRs.')).toBeInTheDocument();
  });

  it('says where the current PR is when a cut-short list does not reach it', async () => {
    const stack = aStack(12, 13);
    render(
      <StackPositionChip
        pr={aPr({ repo: 'MapColonies/jobnik', number: 75, stack: { ...stack, truncated: true, siblings: stack.siblings.slice(0, 10) } })}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Stack position/ }));

    expect(screen.getByText(/This PR is number 12\./)).toBeInTheDocument();
  });

  it('lists the PRs in the Stack in order, linked, with their state and draft flag, marking the current one', async () => {
    const stack = aStack(2, 3);
    const siblings = [{ ...stack.siblings[0]!, state: 'merged' as const }, stack.siblings[1]!, { ...stack.siblings[2]!, draft: true }];
    render(<StackPositionChip pr={inStack(2, 3, { siblings })} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Stack position/ }));

    const items = within(screen.getByRole('dialog')).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('link').textContent)).toEqual(['step 64', 'step 65', 'step 66']);
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('href', 'https://github.com/MapColonies/jobnik/pull/64');
    expect(items[0]).toHaveTextContent('Merged');
    expect(items[1]).toHaveTextContent('Open');
    expect(items[2]).toHaveTextContent('Draft');
    expect(items.map((item) => item.getAttribute('aria-current'))).toEqual([null, 'true', null]);
    expect(items[1]).toHaveTextContent('This PR');
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it('closes the list on Escape', async () => {
    render(<StackPositionChip pr={inStack(1, 2)} />);
    await userEvent.click(screen.getByRole('button', { name: /Stack position/ }));

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
