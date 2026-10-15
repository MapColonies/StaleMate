import { beforeAll, describe, expect, it } from 'vitest';
import 'jest-openapi';
import { Registry } from 'prom-client';
import { jsLogger } from '@map-colonies/js-logger';
import type { PrFacts } from '@domain/facts';
import { deriveTrackedPr } from '@domain/deriveTrackedPr';
import { createGithubPrProvider } from '@src/providers/github/githubPrProvider';
import type { SweepResult } from '@src/providers/prProvider';
import { createSyncMetrics } from '@src/sync/syncMetrics';
import { RECORDED_BATCH_SIZE } from '@tests/fixtures/github/recording';
import { aDerivationConfig } from '@tests/utils/facts';
import { aRecordedGithub } from './helpers/recordedGithub';

// Over a real sweep of MapColonies, recorded on 2026-10-15 by tests/fixtures/github/record.ts with people pseudonymized.

const copilotReviewer = { id: 'BOT_kgDOCnlnWA', login: 'copilot-pull-request-reviewer', isBot: true };
const copilotAgent = { id: 'BOT_kgDOC9w8XQ', login: 'copilot-swe-agent', isBot: true };
const devops = { id: 'U_kgDOCIdygg', login: 'mapcolonies-devops', isBot: false };
const person = (login: string): object => ({ id: `U_${login.replace('-', '_')}`, login, isBot: false });

describe('GithubPrProvider over a recorded sweep', function () {
  let sweep: SweepResult;

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
      teamSlug: 'infra',
      githubToken: 'ghp_test',
      githubApp: {},
      logger: await jsLogger({ enabled: false }),
      metrics: createSyncMetrics(new Registry()),
      fetch: github.fetch,
      batchSize: RECORDED_BATCH_SIZE,
    });
    sweep = await provider.sweep();
  });

  it('should read the Team, service accounts included, and its live public Team Repos', function () {
    expect(sweep.roster.members).toHaveLength(9);
    expect(sweep.roster.members).toContainEqual(devops);
    expect(sweep.roster.repos).toContain('MapColonies/opa-la');
    expect(sweep.roster.repos).not.toContain('MapColonies/telemetry');
  });

  it('should read each PR the searches found once', function () {
    expect(sweep.prs.map((facts) => facts.url).sort()).toEqual([
      'https://github.com/MapColonies/config-ui/pull/62',
      'https://github.com/MapColonies/infra-packages/pull/33',
      'https://github.com/MapColonies/javascript-github-actions/pull/17',
      'https://github.com/MapColonies/jobnik-manager/pull/247',
      'https://github.com/MapColonies/opa-la/pull/160',
      'https://github.com/MapColonies/schemas/pull/66',
      'https://github.com/MapColonies/telemetry/pull/96',
    ]);
  });

  it('should read a draft by a Bot, with the same Bot assigned under another login', function () {
    const facts = pr('https://github.com/MapColonies/config-ui/pull/62');

    expect(facts.isDraft).toBe(true);
    expect(facts.author).toEqual(copilotAgent);
    expect(facts.assignees).toContainEqual({ ...copilotAgent, login: 'Copilot' });
    expect(facts.headCommit.checkRollup).toBeNull();
  });

  it('should read a request for changes with its thread', function () {
    const facts = pr('https://github.com/MapColonies/opa-la/pull/160');

    const requests = facts.reviews.filter((review) => review.state === 'changesRequested');

    expect(requests.map((review) => review.author)).toEqual([person('member-6'), person('member-3')]);
    expect(facts.reviewThreads).toEqual([
      { isResolved: false, comments: [expect.objectContaining({ author: person('member-3'), reviewId: 'PRR_kwDOJLgOiM8AAAABRUJB-A' })] },
    ]);
    expect(facts.reviews.map((review) => review.id)).toContain('PRR_kwDOJLgOiM8AAAABRUJB-A');
  });

  it('should read a Copilot review, and the author’s replies in threads as reviews of their own', function () {
    const facts = pr('https://github.com/MapColonies/javascript-github-actions/pull/17');

    expect(facts.reviews).toContainEqual(expect.objectContaining({ author: copilotReviewer, state: 'commented' }));
    expect(facts.reviews.filter((review) => review.author.login === facts.author.login && review.state === 'commented')).not.toHaveLength(0);
    expect(facts.reviewThreads).toHaveLength(44);
    expect(facts.reviews.map((review) => review.submittedAt)).toEqual(
      [...facts.reviews.map((review) => review.submittedAt)].sort((a, b) => a.getTime() - b.getTime())
    );
  });

  it('should read dismissed reviews and when the PR became ready for review', function () {
    const facts = pr('https://github.com/MapColonies/schemas/pull/66');

    expect(facts.reviews.filter((review) => review.state === 'dismissed').map((review) => review.author.login)).toEqual(['person-1', 'member-4']);
    expect(facts.timeline.filter((event) => event.type === 'readyForReview')).toHaveLength(1);
  });

  it('should read a conflict and failing checks', function () {
    const facts = pr('https://github.com/MapColonies/jobnik-manager/pull/247');

    expect(facts.mergeable).toBe('conflicting');
    expect(facts.headCommit.checkRollup).toBe('failure');
    expect(facts.headCommit.firstCheckSuiteAt).not.toBeNull();
    expect(facts.reviewRequests.map((request) => request.type === 'person' && request.reviewer.login)).toEqual(['member-3', 'member-6']);
  });

  it('should read a request to the Team', function () {
    const facts = pr('https://github.com/MapColonies/telemetry/pull/96');

    expect(facts.reviewRequests).toEqual([{ type: 'team', slug: 'infra', asCodeOwner: expect.any(Boolean) as unknown }]);
    expect(facts.timeline).toContainEqual(
      expect.objectContaining({ type: 'reviewRequested', requested: { type: 'team', slug: 'infra', asCodeOwner: false } })
    );
  });

  it('should read a service account as a User, which config makes a Bot', function () {
    expect(pr('https://github.com/MapColonies/infra-packages/pull/33').author).toEqual(devops);
  });

  it('should emit facts that each derive a contract-valid Tracked PR', function () {
    const config = aDerivationConfig({ teamSlug: 'infra' });

    for (const facts of sweep.prs) {
      expect(deriveTrackedPr(facts, sweep.roster, config, new Date('2026-10-15T12:00:00Z'))).toSatisfySchemaInApiSpec('trackedPr');
    }
  });
});
