import { beforeAll, describe, expect, it } from 'vitest';
import 'jest-openapi';
import type { WatchedTeam } from '@domain/facts';
import type { TrackedPr } from '@domain/trackedPr';
import { deriveTrackedPr } from '@domain/deriveTrackedPr';
import { FixturePrProvider } from '@src/providers/fixture/fixturePrProvider';
import { aDerivationConfig } from '@tests/utils/facts';
import { sweep as aSweep } from '@tests/utils/sweep';

const now = new Date('2026-10-14T12:00:00Z');
const config = aDerivationConfig();

describe('FixturePrProvider', function () {
  let sweep: Awaited<ReturnType<typeof aSweep>>;
  let discovery: typeof sweep.discovery;
  let trackedPrs: TrackedPr[];
  let infra: WatchedTeam;

  beforeAll(async function () {
    sweep = await aSweep(new FixturePrProvider([], () => now));
    discovery = sweep.discovery;
    infra = sweep.teams.find(({ slug }) => slug === 'infra') as WatchedTeam;
    trackedPrs = sweep.prs.map((facts) => deriveTrackedPr(facts, infra, config, now)).filter((pr) => pr.inclusionReasons.length > 0);
  });

  it('should emit the same facts on every sweep at the same instant', async function () {
    const again = await aSweep(new FixturePrProvider([], () => now));

    expect(again).toEqual(sweep);
  });

  it('should discover each PR as last changed no earlier than its latest activity, and not in the future', function () {
    expect(discovery.prs.map((discovered) => discovered.id)).toEqual(sweep.prs.map((pr) => pr.id));

    for (const [index, pr] of sweep.prs.entries()) {
      const updatedAt = discovery.prs[index]?.updatedAt ?? new Date(0);
      const activity = [
        pr.createdAt,
        pr.headCommit.committedDate,
        ...pr.headCommit.checkActivity,
        ...pr.reviews.map((review) => review.submittedAt),
        ...pr.reviewThreads.flatMap((thread) => thread.comments.map((comment) => comment.createdAt)),
        ...pr.timeline.map((event) => event.at),
      ];

      expect(activity.every((at) => at <= updatedAt) && updatedAt <= now).toBe(true);
    }
  });

  it('should read exactly the PRs it is asked for, in the order asked', async function () {
    const ids = [discovery.prs[3]?.id, 'PR_gone', discovery.prs[1]?.id] as string[];

    const prs = await new FixturePrProvider([], () => now).read(ids);

    expect(prs.map((pr) => pr.id)).toEqual([ids[0], ids[2]]);
  });

  it('should date its PRs as of its first discovery, so they keep their dates and age like real ones', async function () {
    let clock = now;
    const provider = new FixturePrProvider([], () => clock);
    await provider.discover();
    clock = new Date(now.getTime() + 60 * 60_000);

    const later = await aSweep(provider);

    expect(later).toEqual(sweep);
  });

  it('should read a roster of Team Members, service accounts among them, and Team Repos', function () {
    const logins = infra.roster.members.map((member) => member.login);

    expect(logins).toContain('mapcolonies-devops');
    expect(logins.length).toBeGreaterThan(2);
    expect(infra.roster.repos).toContain('MapColonies/opa-la');
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

  it('should watch several Teams with real slugs and display names, some sharing people and repos', function () {
    expect(sweep.teams.map(({ slug, name }) => ({ slug, name }))).toEqual(
      expect.arrayContaining([
        { slug: 'infra', name: 'Infra' },
        { slug: 'raster', name: 'Raster' },
      ])
    );

    const memberships = sweep.teams.flatMap((team) => team.roster.members.map(({ login }) => login));
    const repoships = sweep.teams.flatMap((team) => team.roster.repos);

    expect(memberships.length).toBeGreaterThan(new Set(memberships).size);
    expect(repoships.length).toBeGreaterThan(new Set(repoships).size);
  });

  it('should leave an excluded Team out of the Teams, and PRs only it tracks out of discovery', async function () {
    const without = await aSweep(new FixturePrProvider(['infra'], () => now));

    expect(without.teams.map(({ slug }) => slug)).not.toContain('infra');
    expect(without.discovery.prs.length).toBeLessThan(discovery.prs.length);
  });

  it('should leave PRs no Team tracks out of discovery', async function () {
    const all = await new FixturePrProvider([], () => now).read(Array.from({ length: 254 }, (_, index) => `PR_fixture_${index}`));

    expect(discovery.prs.length).toBeLessThan(all.length);
  });

  it('should discover PRs asking different Teams for review', function () {
    const requested = new Set(sweep.prs.flatMap((pr) => pr.reviewRequests.flatMap((request) => (request.type === 'team' ? [request.slug] : []))));

    expect(requested.size).toBeGreaterThan(1);
  });

  it('should only emit Tracked PRs, each of which derives a contract-valid Tracked PR', function () {
    // One call for all of them: the matcher rebuilds its validator on every call, which costs ~10ms per Tracked PR.
    const snapshot = {
      readAt: now.toISOString(),
      sync: { state: 'idle' },
      config: { urgencyThresholds: [2, 4, 8], refreshCooldownMs: 0 },
      teamInfo: { slug: infra.slug, name: infra.name },
      team: [],
      prs: trackedPrs,
    };

    expect(snapshot).toSatisfySchemaInApiSpec('snapshot');
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

  it('should model a Stack of PRs in one repo, each reporting the same entries in order and its own position', function () {
    const stacked = sweep.prs.filter((pr) => pr.stack !== undefined);

    expect(stacked.length).toBeGreaterThanOrEqual(3);
    expect(new Set(stacked.map((pr) => pr.repo)).size).toBe(1);

    for (const [index, pr] of stacked.entries()) {
      expect(pr.stack).toMatchObject({ position: index + 1, size: stacked.length, entriesTruncated: false });
      expect(pr.stack?.entries.map((entry) => entry.number)).toStrictEqual(stacked.map(({ number }) => number));
      expect(pr.stack?.entries[index]).toMatchObject({ number: pr.number, title: pr.title, url: pr.url });
    }
  });
});
