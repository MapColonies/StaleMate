import { beforeAll, describe, expect, it } from 'vitest';
import 'jest-openapi';
import type { SweepResult } from '@src/providers/prProvider';
import type { TrackedPr } from '@domain/trackedPr';
import { deriveTrackedPr } from '@domain/deriveTrackedPr';
import { FixturePrProvider } from '@src/providers/fixture/fixturePrProvider';
import { aDerivationConfig } from '@tests/utils/facts';

const now = new Date('2026-10-14T12:00:00Z');
const config = aDerivationConfig({ teamSlug: 'infra' });

describe('FixturePrProvider', function () {
  let sweep: SweepResult;
  let trackedPrs: TrackedPr[];

  beforeAll(async function () {
    sweep = await new FixturePrProvider('infra', () => now).sweep();
    trackedPrs = sweep.prs.map((facts) => deriveTrackedPr(facts, sweep.roster, config, now));
  });

  it('should emit the same facts on every sweep at the same instant', async function () {
    const again = await new FixturePrProvider('infra', () => now).sweep();

    expect(again).toEqual(sweep);
  });

  it('should read a roster of Team Members, service accounts among them, and Team Repos', function () {
    const logins = sweep.roster.members.map((member) => member.login);

    expect(logins).toContain('mapcolonies-devops');
    expect(logins.length).toBeGreaterThan(2);
    expect(sweep.roster.repos).toContain('MapColonies/opa-la');
  });

  it('should give every PR its own id and its own repo and number', function () {
    expect(new Set(sweep.prs.map((pr) => pr.id)).size).toBe(sweep.prs.length);
    expect(new Set(sweep.prs.map((pr) => `${pr.repo}#${pr.number}`)).size).toBe(sweep.prs.length);
  });

  it('should only emit facts from the past', function () {
    for (const pr of sweep.prs) {
      const instants = [
        pr.createdAt,
        pr.headCommit.committedDate,
        ...pr.reviews.map((review) => review.submittedAt),
        ...pr.reviewThreads.flatMap((thread) => thread.comments.map((comment) => comment.createdAt)),
        ...pr.timeline.map((event) => event.at),
      ];

      expect(instants.every((at) => at <= now && at >= pr.createdAt)).toBe(true);
    }
  });

  it('should only emit Tracked PRs, each of which derives a contract-valid Tracked PR', function () {
    for (const trackedPr of trackedPrs) {
      expect(trackedPr).toSatisfySchemaInApiSpec('trackedPr');
    }
  });

  it.each<[string, (pr: TrackedPr) => boolean]>([
    ['drafts', (pr) => pr.reviewStatus === 'draft'],
    ['PRs awaiting review', (pr) => pr.reviewStatus === 'awaitingReview'],
    ['requests for changes', (pr) => pr.reviewStatus === 'changesRequested'],
    ['PRs awaiting re-review', (pr) => pr.reviewStatus === 'awaitingReReview'],
    ['approved PRs', (pr) => pr.reviewStatus === 'approved'],
    ['PRs by Bots', (pr) => pr.author.kind === 'bot'],
    ['PRs by outsiders', (pr) => pr.author.kind === 'outsider'],
    ['requests to the Team', (pr) => pr.waitingOn.some((party) => party.type === 'team' && party.viaTeam)],
    ['PRs with No Reviewer', (pr) => pr.noReviewer],
    ['failing checks', (pr) => pr.checkStatus === 'failing'],
    ['PRs without checks', (pr) => pr.checkStatus === 'none'],
    ['PRs outside the Team Repos', (pr) => !pr.inclusionReasons.includes('teamRepo')],
    ['PRs with several Inclusion Reasons', (pr) => pr.inclusionReasons.length > 1],
    [
      'PRs waiting on both the author and a reviewer',
      (pr) => ['author', 'reviewer'].every((role) => pr.waitingOn.some((party) => party.type === 'person' && party.role === role)),
    ],
  ])('should include %s', function (_, matches) {
    expect(trackedPrs.some(matches)).toBe(true);
  });

  it('should include PRs that conflict with their base', function () {
    expect(sweep.prs.some((pr) => pr.mergeable === 'conflicting')).toBe(true);
  });

  it('should include every Urgency', function () {
    expect(new Set(trackedPrs.map((pr) => pr.urgency))).toEqual(new Set([null, 0, 1, 2, 3]));
  });
});
