import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AgeChip,
  CheckStatusBadge,
  ConflictBadge,
  IdleLine,
  InclusionReasonBadge,
  MovePills,
  NoReviewerFlag,
  ReviewStatusBadge,
  WaitingOnChips,
} from '@/cells';
import type { TrackedPr } from '@/snapshot/types';
import { aPr, clock, member, outsider, waitingOnAuthor, waitingOnReviewer, waitingOnTeam, waitingOnTheTeam } from './fixtures/snapshot';

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
