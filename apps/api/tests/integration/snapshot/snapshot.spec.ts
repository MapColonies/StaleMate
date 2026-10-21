import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'jest-openapi';
import 'jest-extended';
import supertest from 'supertest';
import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { StatusCodes } from 'http-status-codes';
import type { Application } from 'express';
import type { DependencyContainer } from 'tsyringe';
import type { ExpectResponseStatus, RequestSender } from '@map-colonies/openapi-helpers/requestSender';
import { createRequestSender, expectResponseStatusFactory } from '@map-colonies/openapi-helpers/requestSender';
import type { components, operations, paths } from 'stalemate-openapi';
import { getApp } from '@src/app';
import { createHttpServer } from '@src/httpServer';
import { PR_PROVIDER, SweepError } from '@src/providers/prProvider';
import { SYNC_LOOP, type SyncLoop } from '@src/sync/syncLoop';
import { SERVICES } from '@common/constants';
import { getConfig, initConfig } from '@common/config';
import { OPENAPI_PATH } from '@tests/utils/paths.mjs';
import { anActor, aPrFacts } from '@tests/utils/facts';
import { FixturePrProvider } from '@src/providers/fixture/fixturePrProvider';
import { ScriptedProvider } from './helpers/scriptedProvider';

type Snapshot = components['schemas']['snapshot'];

/** The PRs without their clocks, which move with the request time. */
function withoutClocks(prs: Snapshot['prs']): Omit<Snapshot['prs'][number], 'age' | 'idleTime'>[] {
  return prs.map(({ age: _age, idleTime: _idleTime, ...pr }) => pr);
}

const expectResponseStatus: ExpectResponseStatus = expectResponseStatusFactory(expect);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
// A Monday morning in Israel, so the next hours are working time.
const mondayMorning = new Date('2026-10-12T09:00:00+03:00');

describe('snapshot', function () {
  let requestSender: RequestSender<paths, operations>;
  let app: Application;
  let container: DependencyContainer;
  let provider: ScriptedProvider;
  let syncLoop: SyncLoop;
  let cooldownMs: number;
  let intervalMs: number;

  beforeAll(async function () {
    await initConfig(true);
    cooldownMs = getConfig().get('sync.refreshCooldownMs');
    intervalMs = getConfig().get('sync.intervalMs');
  });

  const after = (from: Date | string, ms: number): string => new Date(new Date(from).getTime() + ms).toISOString();

  beforeEach(async function () {
    vi.useFakeTimers({ toFake: ['Date'], now: mondayMorning });
    provider = new ScriptedProvider();
    const [appInstance, appContainer] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: await jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
        { token: PR_PROVIDER, provider: { useValue: provider } },
      ],
      useChild: true,
    });
    app = appInstance;
    container = appContainer;
    syncLoop = container.resolve<SyncLoop>(SYNC_LOOP);
    requestSender = await createRequestSender<paths, operations>(OPENAPI_PATH, app);
  });

  afterEach(function () {
    syncLoop.stop();
    vi.useRealTimers();
  });

  /** Waits for the sweep that a refresh started to end. */
  async function untilIdle(): Promise<void> {
    await vi.waitFor(() => expect(syncLoop.getState().state).toBe('idle'));
  }

  async function refreshAfter(ms: number): Promise<components['schemas']['syncState']> {
    vi.setSystemTime(Date.now() + ms);
    const response = await requestSender.refresh();
    expectResponseStatus(response, StatusCodes.ACCEPTED);

    expect(response).toSatisfyApiSpec();

    return response.body;
  }

  async function getSnapshot(): Promise<Snapshot> {
    const response = await requestSender.getSnapshot();
    expectResponseStatus(response, StatusCodes.OK);

    expect(response).toSatisfyApiSpec();

    return response.body;
  }

  describe('GET /snapshot', function () {
    it('should return 503 warming before the first sweep', async function () {
      const response = await requestSender.getSnapshot();

      expectResponseStatus(response, StatusCodes.SERVICE_UNAVAILABLE);

      expect(response).toSatisfyApiSpec();
      expect(response.body).toEqual({ status: 'warming', sync: { state: 'idle' } });
    });

    it('should return 503 warming while the first sweep runs', async function () {
      const release = provider.hold();
      const firstSweep = syncLoop.start();

      const response = await requestSender.getSnapshot();
      release();
      await firstSweep;

      expectResponseStatus(response, StatusCodes.SERVICE_UNAVAILABLE);

      expect(response).toSatisfyApiSpec();
      expect(response.body).toEqual({ status: 'warming', sync: { state: 'syncing', lastAttemptAt: mondayMorning.toISOString() } });
    });

    it('should return the Snapshot, valid against the contract, once a sweep succeeded', async function () {
      await syncLoop.start();

      const snapshot = await getSnapshot();

      expect(snapshot).toMatchObject({
        readAt: mondayMorning.toISOString(),
        sync: { state: 'idle', lastAttemptAt: mondayMorning.toISOString(), nextAttemptAt: after(mondayMorning, intervalMs) },
        config: { urgencyThresholds: [2, 4, 8], refreshCooldownMs: cooldownMs, jiraBaseUrl: 'https://mapcolonies.atlassian.net' },
      });
      expect(snapshot.sync).not.toHaveProperty('lastError');
      expect(snapshot.team).toContainEqual({ login: 'CptSchnitz', kind: 'member' });
      expect(snapshot.team).toContainEqual({ login: 'mapcolonies-devops', kind: 'bot' });
      expect(snapshot.prs.length).toBeGreaterThan(0);
    });

    it('should leave the Jira site out when it is configured empty', async function () {
      vi.stubEnv('JIRA_BASE_URL', '');
      await initConfig(true);
      try {
        const [jiraless, jiralessContainer] = await getApp({
          override: [
            { token: SERVICES.LOGGER, provider: { useValue: await jsLogger({ enabled: false }) } },
            { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
            { token: PR_PROVIDER, provider: { useValue: provider } },
          ],
          useChild: true,
        });
        const sender = await createRequestSender<paths, operations>(OPENAPI_PATH, jiraless);
        const jiralessSyncLoop = jiralessContainer.resolve<SyncLoop>(SYNC_LOOP);
        await jiralessSyncLoop.start();

        const response = await sender.getSnapshot();
        jiralessSyncLoop.stop();

        expectResponseStatus(response, StatusCodes.OK);

        expect(response).toSatisfyApiSpec();
        expect(response.body.config).not.toHaveProperty('jiraBaseUrl');
      } finally {
        vi.unstubAllEnvs();
        await initConfig(true);
      }
    });

    it('should count Age and Idle Time up to the request time', async function () {
      await syncLoop.start();
      const before = await getSnapshot();

      vi.setSystemTime(mondayMorning.getTime() + HOUR);
      const after = await getSnapshot();

      expect(after.readAt).toBe(before.readAt);

      after.prs.forEach((pr, index) => {
        expect(pr.age.workingMs - (before.prs[index]?.age.workingMs ?? 0)).toBe(HOUR);
        expect(pr.idleTime.workingMs - (before.prs[index]?.idleTime.workingMs ?? 0)).toBe(HOUR);
      });
    });

    it('should count Age and Idle Time up to the request time rounded down to the minute', async function () {
      const pushed = { ...aPrFacts().headCommit, committedDate: mondayMorning, firstCheckSuiteAt: mondayMorning };
      provider.add(aPrFacts({ id: 'PR_opened_monday', createdAt: mondayMorning, headCommit: pushed }), mondayMorning);
      await syncLoop.start();
      const clocksAt = async (ms: number): Promise<Pick<Snapshot['prs'][number], 'age' | 'idleTime'> | undefined> => {
        vi.setSystemTime(mondayMorning.getTime() + ms);
        const pr = (await getSnapshot()).prs.find(({ id }) => id === 'PR_opened_monday');
        return pr && { age: pr.age, idleTime: pr.idleTime };
      };
      const since = mondayMorning.toISOString();

      await expect(clocksAt(HOUR + MINUTE - 1)).resolves.toEqual({ age: { workingMs: HOUR, since }, idleTime: { workingMs: HOUR, since } });
      await expect(clocksAt(HOUR + MINUTE)).resolves.toEqual({
        age: { workingMs: HOUR + MINUTE, since },
        idleTime: { workingMs: HOUR + MINUTE, since },
      });
    });
  });

  describe('POST /refresh', function () {
    it('should sweep at once when idle and past the cooldown', async function () {
      await syncLoop.start();

      const sync = await refreshAfter(cooldownMs);
      await untilIdle();

      expect(sync).toEqual({ state: 'syncing', lastAttemptAt: new Date(mondayMorning.getTime() + cooldownMs).toISOString() });
      expect(provider.sweeps).toBe(2);
      expect((await getSnapshot()).readAt).toBe(sync.lastAttemptAt);
    });

    it('should say when the next sweep starts: sync.intervalMs after the last one ended', async function () {
      const release = provider.hold();
      const firstSweep = syncLoop.start();
      // The sweep takes a minute.
      vi.setSystemTime(mondayMorning.getTime() + 60_000);
      release();
      await firstSweep;

      const { sync } = await getSnapshot();

      expect(sync.nextAttemptAt).toBe(after(mondayMorning, 60_000 + intervalMs));
    });

    it('should do nothing during the cooldown', async function () {
      await syncLoop.start();

      const sync = await refreshAfter(cooldownMs - 1);

      expect(sync).toEqual({ state: 'idle', lastAttemptAt: mondayMorning.toISOString(), nextAttemptAt: after(mondayMorning, intervalMs) });
      expect(provider.sweeps).toBe(1);
    });

    it('should do nothing while a sweep runs', async function () {
      const release = provider.hold();
      const firstSweep = syncLoop.start();

      const sync = await refreshAfter(cooldownMs);
      release();
      await firstSweep;

      expect(sync).toEqual({ state: 'syncing', lastAttemptAt: mondayMorning.toISOString() });
      expect(provider.sweeps).toBe(1);
    });
  });

  describe('a later sweep', function () {
    async function sweepAgain(): Promise<Snapshot> {
      await refreshAfter(cooldownMs);
      await untilIdle();
      return getSnapshot();
    }

    it('should show a PR opened since the last sweep', async function () {
      await syncLoop.start();

      provider.add(aPrFacts({ id: 'PR_new' }), mondayMorning);
      const snapshot = await sweepAgain();

      expect(snapshot.prs.map(({ id }) => id)).toContain('PR_new');
    });

    it('should drop a PR no longer discovered', async function () {
      await syncLoop.start();
      const [closed] = (await getSnapshot()).prs;

      provider.remove(closed!.id);
      const snapshot = await sweepAgain();

      expect(snapshot.prs.map(({ id }) => id)).not.toContain(closed!.id);
    });

    it('should re-derive Waiting On and Inclusion Reasons when the Roster changes', async function () {
      const carol = anActor({ id: 'U_carol', login: 'carol' });
      const dave = anActor({ id: 'U_dave', login: 'dave' });
      const { roster } = await new FixturePrProvider('infra').discover();
      provider.roster = { ...roster, members: [...roster.members, carol, dave] };
      provider.add(
        aPrFacts({
          id: 'PR_carol',
          repo: roster.repos[0],
          author: carol,
          reviewRequests: [{ type: 'person', reviewer: dave, asCodeOwner: false }],
        }),
        mondayMorning
      );
      await syncLoop.start();
      const byCarol = (snapshot: Snapshot): Snapshot['prs'][number] | undefined => snapshot.prs.find(({ id }) => id === 'PR_carol');

      expect(byCarol(await getSnapshot())).toMatchObject({
        inclusionReasons: ['authoredByMember', 'memberReviewRequested', 'teamRepo'],
        waitingOn: [{ type: 'person', login: 'dave', kind: 'member' }],
      });

      provider.roster = roster;
      const snapshot = await sweepAgain();

      expect(byCarol(snapshot)).toMatchObject({ inclusionReasons: ['teamRepo'], waitingOn: [{ type: 'person', login: 'dave', kind: 'outsider' }] });
      expect(snapshot.team.map(({ login }) => login)).not.toContain('carol');
    });
  });

  describe('a failed sweep', function () {
    it('should keep the last good Snapshot when the read fails after discovery', async function () {
      await syncLoop.start();
      const good = await getSnapshot();

      provider.remove(good.prs[0]!.id);
      provider.readFailure = new SweepError('rateLimit');
      await refreshAfter(cooldownMs);
      await untilIdle();
      const snapshot = await getSnapshot();

      expect(snapshot.readAt).toBe(good.readAt);
      expect(withoutClocks(snapshot.prs)).toEqual(withoutClocks(good.prs));
      expect(snapshot.sync.lastError).toBe('GitHub rate limit reached');
    });

    it('should keep the last good Snapshot and report a safe message, never the raw error', async function () {
      await syncLoop.start();
      const good = await getSnapshot();

      provider.failure = new Error('connect ECONNREFUSED 140.82.112.6:443 with token ghs_secret');
      const failedAt = new Date(mondayMorning.getTime() + cooldownMs).toISOString();
      await refreshAfter(cooldownMs);
      await untilIdle();
      const snapshot = await getSnapshot();

      expect(snapshot.readAt).toBe(good.readAt);
      expect(withoutClocks(snapshot.prs)).toEqual(withoutClocks(good.prs));
      expect(snapshot.sync).toEqual({
        state: 'idle',
        lastAttemptAt: failedAt,
        nextAttemptAt: after(failedAt, intervalMs),
        lastError: 'Unexpected error',
      });
    });

    it.each([
      ['unreachable', 'GitHub API unreachable'],
      ['authentication', 'GitHub App authentication failed'],
      ['rateLimit', 'GitHub rate limit reached'],
    ] as const)('should report a %s failure as "%s"', async function (failure, message) {
      provider.failure = new SweepError(failure, { cause: new Error('raw') });

      await syncLoop.start();
      const response = await requestSender.getSnapshot();

      expectResponseStatus(response, StatusCodes.SERVICE_UNAVAILABLE);

      expect(response).toSatisfyApiSpec();
      expect(response.body.sync.lastError).toBe(message);
    });

    it('should clear the error once a later sweep succeeds', async function () {
      provider.failure = new SweepError('unreachable');
      await syncLoop.start();

      provider.failure = undefined;
      await refreshAfter(cooldownMs);
      await untilIdle();

      expect((await getSnapshot()).sync).not.toHaveProperty('lastError');
    });
  });

  describe('probes', function () {
    it('should pass readiness only once a sweep succeeded, and pass liveness throughout', async function () {
      const server = createHttpServer(app, container);
      const probe = async (path: string): Promise<number> => (await supertest(server).get(path)).status;

      await expect(probe('/readiness')).resolves.toBe(StatusCodes.SERVICE_UNAVAILABLE);
      await expect(probe('/liveness')).resolves.toBe(StatusCodes.OK);

      provider.failure = new SweepError('authentication');
      await syncLoop.start();

      await expect(probe('/readiness')).resolves.toBe(StatusCodes.SERVICE_UNAVAILABLE);
      await expect(probe('/liveness')).resolves.toBe(StatusCodes.OK);

      provider.failure = undefined;
      await refreshAfter(cooldownMs);
      await untilIdle();

      await expect(probe('/readiness')).resolves.toBe(StatusCodes.OK);

      provider.failure = new SweepError('rateLimit');
      await refreshAfter(cooldownMs);
      await untilIdle();

      await expect(probe('/readiness')).resolves.toBe(StatusCodes.OK);
      await expect(probe('/liveness')).resolves.toBe(StatusCodes.OK);
    });
  });

  describe('metrics', function () {
    it('should expose how long sweeps take and when one last succeeded', async function () {
      await syncLoop.start();

      const response = await supertest(createHttpServer(app, container)).get('/metrics');

      // The registry adds default labels, such as the hostname, to every metric.
      expect(response.text).toMatch(/^stalemate_sweep_duration_seconds_count\{.*outcome="success".*\} 1$/m);
      expect(response.text).toMatch(new RegExp(`^stalemate_last_successful_sweep_timestamp_seconds\\{.*\\} ${mondayMorning.getTime() / 1000}$`, 'm'));
      expect(response.text).toContain('# TYPE stalemate_github_graphql_points_remaining gauge');
    });

    it('should expose the Node.js process metrics, including event-loop lag', async function () {
      const response = await supertest(createHttpServer(app, container)).get('/metrics');

      expect(response.text).toContain('# TYPE process_cpu_seconds_total counter');
      expect(response.text).toContain('# TYPE nodejs_heap_size_used_bytes gauge');
      expect(response.text).toContain('# TYPE nodejs_gc_duration_seconds histogram');
      expect(response.text).toContain('# TYPE nodejs_eventloop_lag_p99_seconds gauge');
    });
  });
});
