import { describe, expect, it } from 'vitest';
import { isWaitingOnViewer, noReviewerCount, sharedOrg, shortRepoName, viewerOptions, waitingOnViewerCounts } from '@/snapshot/selectors';
import {
  aPr,
  aSnapshot,
  aTeam,
  bot,
  member,
  outsider,
  waitingOnAuthor,
  waitingOnReviewer,
  waitingOnTeam,
  waitingOnTheTeam,
} from './fixtures/snapshot';

const alice = member('alice');
const bob = member('bob');

describe('viewerOptions', () => {
  it('offers the Team Members only, sorted, without Bots or service accounts', () => {
    const team = aTeam('infra', 'Infra', [member('carol'), bot('mapcolonies-devops'), alice, bot('mapcolonies-org'), bob]);

    expect(viewerOptions([team])).toEqual(['alice', 'bob', 'carol']);
  });

  it('unites every Team’s members, each once', () => {
    const infra = aTeam('infra', 'Infra', [alice, bob]);
    const raster = aTeam('raster', 'Raster', [bob, member('dave'), bot('mapcolonies-devops')]);

    expect(viewerOptions([infra, raster])).toEqual(['alice', 'bob', 'dave']);
  });

  it('sorts without regard to case', () => {
    expect(viewerOptions([aTeam('infra', 'Infra', [member('Zed'), member('amir'), member('CptSchnitz')])])).toEqual(['amir', 'CptSchnitz', 'Zed']);
  });
});

describe('waitingOnViewerCounts', () => {
  // One fixture Snapshot, seen by alice.
  const snapshot = aSnapshot({
    prs: [
      // alice is a requested reviewer: Waiting On her.
      aPr({ id: 'review', author: bob, waitingOn: [waitingOnReviewer(alice)] }),
      // alice's own PR with failing checks: Waiting On her, as its author.
      aPr({ id: 'own', author: alice, waitingOn: [waitingOnAuthor(alice)] }),
      // On alice and the Team at once: counted once, as hers.
      aPr({ id: 'both', author: bob, waitingOn: [waitingOnReviewer(alice), waitingOnTheTeam] }),
      // Requests to the Team: Waiting On the Team.
      aPr({ id: 'team', author: bob, waitingOn: [waitingOnTheTeam] }),
      aPr({ id: 'team, external author', author: outsider('stranger'), waitingOn: [waitingOnTheTeam, waitingOnAuthor(outsider('stranger'))] }),
      // alice's own PR asks the Team to review: not Waiting On her.
      aPr({ id: 'own, team requested', author: alice, waitingOn: [waitingOnTheTeam] }),
      // Another team: Waiting On no Team Member.
      aPr({ id: 'other team', author: bob, waitingOn: [waitingOnTeam('raster')] }),
      // Waiting On someone else.
      aPr({ id: 'bob', author: alice, waitingOn: [waitingOnReviewer(bob)] }),
    ],
  });

  it('counts the PRs Waiting On the Viewer, and the Team requests on top', () => {
    expect(waitingOnViewerCounts(snapshot.prs, 'alice')).toEqual({ mine: 3, team: 2 });
  });

  it('counts nothing without a Viewer', () => {
    expect(waitingOnViewerCounts(snapshot.prs, null)).toEqual({ mine: 0, team: 0 });
  });

  it('counts from another Viewer’s side', () => {
    // bob: the 'bob' PR waits on him; of the four Team requests, the two he authored aren't his.
    expect(waitingOnViewerCounts(snapshot.prs, 'bob')).toEqual({ mine: 1, team: 2 });
  });
});

describe('isWaitingOnViewer', () => {
  const viaTeam = aPr({ author: bob, waitingOn: [waitingOnTheTeam] });
  const direct = aPr({ author: bob, waitingOn: [waitingOnReviewer(alice)] });

  it('includes the Team’s requests unless they are hidden', () => {
    expect(isWaitingOnViewer(direct, 'alice', { hideViaTeam: false })).toBe(true);
    expect(isWaitingOnViewer(viaTeam, 'alice', { hideViaTeam: false })).toBe(true);
    expect(isWaitingOnViewer(viaTeam, 'alice', { hideViaTeam: true })).toBe(false);
    expect(isWaitingOnViewer(direct, 'alice', { hideViaTeam: true })).toBe(true);
  });

  it('is never Waiting On the Viewer without one', () => {
    expect(isWaitingOnViewer(direct, null, { hideViaTeam: false })).toBe(false);
  });
});

describe('noReviewerCount', () => {
  it('counts the PRs flagged No Reviewer', () => {
    const prs = [
      aPr({ noReviewer: true, waitingOn: [waitingOnAuthor(bob)] }),
      aPr({ noReviewer: false }),
      aPr({ noReviewer: true, waitingOn: [waitingOnAuthor(bob)] }),
    ];

    expect(noReviewerCount(prs)).toBe(2);
  });

  it('leaves out Bot PRs, though they are flagged', () => {
    const renovate = bot('renovate[bot]');
    const prs = [
      aPr({ noReviewer: true, waitingOn: [waitingOnAuthor(bob)] }),
      aPr({ author: renovate, noReviewer: true, waitingOn: [waitingOnAuthor(renovate)] }),
    ];

    expect(noReviewerCount(prs)).toBe(1);
  });
});

describe('sharedOrg', () => {
  it('is the org every PR’s repo is in', () => {
    const prs = [aPr({ repo: 'MapColonies/discrete-overseer' }), aPr({ repo: 'MapColonies/opa-la' })];

    expect(sharedOrg(prs)).toBe('MapColonies');
  });

  it('is none when the PRs span more than one org', () => {
    const prs = [aPr({ repo: 'MapColonies/opa-la' }), aPr({ repo: 'open-policy-agent/opa' })];

    expect(sharedOrg(prs)).toBeNull();
  });

  it('is none without PRs', () => {
    expect(sharedOrg([])).toBeNull();
  });
});

describe('shortRepoName', () => {
  it('drops the shared org', () => {
    expect(shortRepoName('MapColonies/discrete-overseer', 'MapColonies')).toBe('discrete-overseer');
  });

  it('keeps the full name without a shared org', () => {
    expect(shortRepoName('MapColonies/discrete-overseer', null)).toBe('MapColonies/discrete-overseer');
  });
});
