import { beforeAll, describe, expect, it } from 'vitest';
import 'jest-openapi';
import { Registry } from 'prom-client';
import { jsLogger } from '@map-colonies/js-logger';
import type { PrFacts } from '@domain/facts';
import { deriveTrackedPr } from '@domain/deriveTrackedPr';
import { createGithubPrProvider } from '@src/providers/github/githubPrProvider';
import { createSyncMetrics } from '@src/sync/syncMetrics';
import { RECORDED_BATCH_SIZE } from '@tests/fixtures/github/recording';
import { aDerivationConfig } from '@tests/utils/facts';
import { sweep as aSweep } from '@tests/utils/sweep';
import { aRecordedGithub } from './helpers/recordedGithub';

// Over a real sweep of MapColonies, recorded on 2026-10-26 by tests/fixtures/github/record.ts with people pseudonymized.

const copilotReviewer = { id: 'BOT_kgDOCnlnWA', login: 'copilot-pull-request-reviewer', isBot: true };
const copilotAgent = { id: 'BOT_kgDOC9w8XQ', login: 'copilot-swe-agent', isBot: true };
const devops = { id: 'U_kgDOCIdygg', login: 'mapcolonies-devops', isBot: false };
const person = (login: string): object => ({ id: `U_${login.replace('-', '_')}`, login, isBot: false });

describe('GithubPrProvider over a recorded sweep', function () {
  let sweep: Awaited<ReturnType<typeof aSweep>>;

  function pr(url: string): PrFacts {
    const found = sweep.prs.find((candidate) => candidate.url === url);
    if (found === undefined) {
      throw new Error(`${url} was not swept`);
    }
    return found;
  }

  beforeAll(async function () {
    const github = aRecordedGithub();
    const provider = createGithubPrProvider({
      githubToken: 'ghp_test',
      githubApp: {},
      logger: await jsLogger({ enabled: false }),
      metrics: createSyncMetrics(new Registry()),
      fetch: github.fetch,
      batchSize: RECORDED_BATCH_SIZE,
    });
    sweep = await aSweep(provider);
  });

  it('should discover each PR the searches found once, with when GitHub last saw it change', function () {
    expect(sweep.discovery.prs.map((discovered) => discovered.id).sort()).toEqual(sweep.prs.map((facts) => facts.id).sort());
    expect(sweep.discovery.prs).toContainEqual({
      id: pr('https://github.com/MapColonies/opa-la/pull/160').id,
      updatedAt: new Date('2026-10-25T15:25:26Z'),
    });
  });

  it('should read the Team, service accounts included, and its live public Team Repos', function () {
    expect(sweep.teams.map((team) => team.slug)).toEqual(['infra', 'raster-team']);
    expect(sweep.teams[0]!.roster.members).toHaveLength(10);
    expect(sweep.teams[0]!.roster.members).toContainEqual(devops);
    expect(sweep.teams[0]!.roster.repos).toContain('MapColonies/opa-la');
    expect(sweep.teams[0]!.roster.repos).not.toContain('MapColonies/telemetry');
  });

  it('should read every other Team of the recording the same way, with its own members and repos', function () {
    const raster = sweep.teams[1]!;

    expect(raster.name).toBe('Raster Team');
    expect(raster.roster.members).toHaveLength(6);
    expect(raster.roster.repos).toContain('MapColonies/mc-utils');
    expect(raster.roster.repos).not.toContain('MapColonies/opa-la');
  });

  it('should read each PR the searches found once', function () {
    expect(sweep.prs.map((facts) => facts.url).sort()).toEqual([
      'https://github.com/MapColonies/config-ui/pull/62',
      'https://github.com/MapColonies/infra-packages/pull/33',
      'https://github.com/MapColonies/jobnik-manager/pull/247',
      'https://github.com/MapColonies/jobnik/pull/65',
      'https://github.com/MapColonies/jobnik/pull/66',
      'https://github.com/MapColonies/opa-la/pull/160',
      'https://github.com/MapColonies/telemetry/pull/96',
    ]);
  });

  it('should read a draft by a Bot, with the same Bot assigned under another login', function () {
    const facts = pr('https://github.com/MapColonies/config-ui/pull/62');

    expect(facts.isDraft).toBe(true);
    expect(facts.author).toEqual(copilotAgent);
    expect(facts.assignees).toContainEqual({ ...copilotAgent, login: 'Copilot' });
    expect(facts.headCommit.checks).toEqual([]);
  });

  it('should read a request for changes with its thread', function () {
    const facts = pr('https://github.com/MapColonies/opa-la/pull/160');

    const requests = facts.reviews.filter((review) => review.state === 'changesRequested');

    expect(requests.map((review) => review.author)).toEqual([person('member-12'), person('member-8')]);
    expect(facts.reviewThreads).toEqual([
      {
        isResolved: false,
        comments: [
          expect.objectContaining({ author: person('member-8'), reviewId: 'PRR_kwDOJLgOiM8AAAABRUJB-A' }),
          expect.objectContaining({ author: person('member-9'), reviewId: 'PRR_kwDOJLgOiM8AAAABUGZkhw' }),
        ],
      },
    ]);
    expect(facts.reviews.map((review) => review.id)).toContain('PRR_kwDOJLgOiM8AAAABRUJB-A');
  });

  it('should read a conflict and failing checks', function () {
    const facts = pr('https://github.com/MapColonies/jobnik-manager/pull/247');

    expect(facts.mergeable).toBe('conflicting');
    expect(facts.headCommit.checks).toContainEqual({ name: 'Run Tests (24.13.0)', state: 'failed' });
    expect(facts.headCommit.checks).toContainEqual({ name: 'jira/issue-validation', state: 'failed' });
    expect(facts.headCommit.firstCheckSuiteAt).not.toBeNull();
    expect(facts.reviewRequests.map((request) => request.type === 'person' && request.reviewer.login)).toEqual(['member-8', 'member-12']);
  });

  it('should read a request to the Team', function () {
    const facts = pr('https://github.com/MapColonies/telemetry/pull/96');

    expect(facts.reviewRequests).toEqual([{ type: 'team', slug: 'infra', asCodeOwner: expect.any(Boolean) as unknown }]);
    expect(facts.timeline).toContainEqual(
      expect.objectContaining({ type: 'reviewRequested', requested: { type: 'team', slug: 'infra', asCodeOwner: false } })
    );
  });

  it('should read a real Stack, with its position, its size and its siblings in order', function () {
    const facts = pr('https://github.com/MapColonies/jobnik/pull/65');

    expect(facts.stack).toMatchObject({ number: 68, position: 2, size: 4, entriesTruncated: false });
    expect(facts.stack?.entries.map((entry) => entry.number)).toEqual([64, 65, 66, 67]);

    for (const entry of facts.stack?.entries ?? []) {
      expect(entry).toMatchObject({ repo: 'MapColonies/jobnik', state: 'open', isDraft: true });
    }

    // What Held reads of each sibling: GitHub's own review decision and check rollup.
    expect(facts.stack?.entries.map((entry) => [entry.number, entry.reviewDecision, entry.checkRollup])).toEqual([
      [64, 'reviewRequired', 'failure'],
      [65, 'reviewRequired', 'failure'],
      [66, 'reviewRequired', 'success'],
      [67, 'reviewRequired', 'success'],
    ]);
    expect(pr('https://github.com/MapColonies/jobnik/pull/66').stack).toMatchObject({ number: 68, position: 3, size: 4 });
  });

  it('should carry the Stack to the Tracked PR, marking the siblings the Team does not track', function () {
    const facts = pr('https://github.com/MapColonies/jobnik/pull/65');

    const { stack } = deriveTrackedPr(facts, sweep.teams[0]!, aDerivationConfig(), new Date('2026-10-26T12:00:00Z'));

    expect(stack).toMatchObject({ number: 68, position: 2, size: 4, truncated: false });
    expect(stack?.siblings.map((sibling) => [sibling.number, sibling.tracked])).toEqual([
      [64, false],
      [65, true],
      [66, false],
      [67, false],
    ]);
  });

  it('should read a service account as a User, which config makes a Bot', function () {
    expect(pr('https://github.com/MapColonies/infra-packages/pull/33').author).toEqual(devops);
  });

  it('should emit facts that each derive a contract-valid Tracked PR', function () {
    const config = aDerivationConfig();

    for (const facts of sweep.prs) {
      expect(deriveTrackedPr(facts, sweep.teams[0]!, config, new Date('2026-10-15T12:00:00Z'))).toSatisfySchemaInApiSpec('trackedPr');
    }
  });
});
