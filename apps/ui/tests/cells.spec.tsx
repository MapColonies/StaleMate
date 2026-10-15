import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgeChip, CheckStatusBadge, IdleLine, InclusionReasonBadges, NoReviewerFlag, ReviewStatusBadge, WaitingOnChips } from '@/cells';
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

describe('WaitingOnChips', () => {
  /** The chips' text, one per party. */
  const chips = (): string[] =>
    within(screen.getByRole('list', { name: 'Waiting On' }))
      .getAllByRole('listitem')
      .map((chip) => chip.textContent ?? '');

  it('names the author and the reviewers it waits on', () => {
    render(<WaitingOnChips pr={aPr({ author: bob, waitingOn: [waitingOnAuthor(bob), waitingOnReviewer(alice)] })} viewer={null} />);

    expect(chips()).toEqual(['bob author', 'alice review']);
  });

  it('shows the Viewer as You', () => {
    render(<WaitingOnChips pr={aPr({ author: bob, waitingOn: [waitingOnReviewer(alice)] })} viewer="alice" />);

    expect(chips()).toEqual(['You review']);
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

  it('shows when the PR became ready, its last activity and the wall-clock time on hover', () => {
    const pr = aPr({
      age: { workingMs: clock(9).workingMs, since: '2026-10-01T09:00:00Z' },
      idleTime: { workingMs: clock(2).workingMs, since: '2026-10-12T09:00:00Z' },
    });
    render(<AgeChip pr={pr} now={now} />);

    const hover = screen.getByText('9d').closest('[title]')?.getAttribute('title');
    expect(hover).toMatch(/Ready for review .*2026/);
    expect(hover).toMatch(/Last activity .*2026/);
    expect(hover).toContain('14 d wall-clock');
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

describe('InclusionReasonBadges', () => {
  it('names every Inclusion Reason', () => {
    render(<InclusionReasonBadges reasons={['teamRepo', 'teamReviewRequested']} />);

    expect(screen.getByText('Team Repo')).toBeInTheDocument();
    expect(screen.getByText('Team review requested')).toBeInTheDocument();
  });
});
