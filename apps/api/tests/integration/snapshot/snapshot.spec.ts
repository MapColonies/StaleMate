import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'jest-openapi';
import 'jest-extended';
import supertest from 'supertest';
import { jsLogger, type Logger } from '@map-colonies/js-logger';
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
import type { Actor, PrFacts, WatchedTeam } from '@domain/facts';
import { anActor, aPrFacts } from '@tests/utils/facts';
import { FixturePrProvider } from '@src/providers/fixture/fixturePrProvider';
import { ScriptedProvider } from './helpers/scriptedProvider';

type Snapshot = components['schemas']['snapshot'];

/** The PRs without their clocks, which move with the request time. */
function withoutClocks(prs: Snapshot['prs']): Omit<Snapshot['prs'][number], 'age' | 'idleTime'>[] {
  return prs.map(({ age: _age, idleTime: _idleTime, ...pr }) => pr);
}

const infraOf = (teams: WatchedTeam[]): WatchedTeam => teams.find(({ slug }) => slug === 'infra') as WatchedTeam;

/** The Teams with infra's roster given more members. */
function withInfraMembers(teams: WatchedTeam[], extra: Actor[]): WatchedTeam[] {
  return teams.map((team) => (team.slug === 'infra' ? { ...team, roster: { ...team.roster, members: [...team.roster.members, ...extra] } } : team));
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

  async function getSnapshot(team = 'infra'): Promise<Snapshot> {
    const response = await requestSender.getSnapshot({ queryParams: { team } });
    expectResponseStatus(response, StatusCodes.OK);

    expect(response).toSatisfyApiSpec();

    return response.body;
  }

  describe('GET /snapshot', function () {
    it('should return 503 warming before the first sweep', async function () {
      const response = await requestSender.getSnapshot({ queryParams: { team: 'infra' } });

      expectResponseStatus(response, StatusCodes.SERVICE_UNAVAILABLE);

      expect(response).toSatisfyApiSpec();
      expect(response.body).toEqual({ status: 'warming', sync: { state: 'idle' } });
    });

    it('should return 503 warming while the first sweep runs', async function () {
      const release = provider.hold();
      const firstSweep = syncLoop.start();

      const response = await requestSender.getSnapshot({ queryParams: { team: 'infra' } });
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

        const response = await sender.getSnapshot({ queryParams: { team: 'infra' } });
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

  describe('GET /snapshot caching', function () {
    /** Asks for the Snapshot as a browser holding `etag` would. */
    async function getSnapshotIfNoneMatch(etag?: string): Promise<supertest.Response> {
      const request = supertest(app).get('/snapshot').query({ team: 'infra' });
      return etag === undefined ? request : request.set('If-None-Match', etag);
    }

    async function getEtag(): Promise<string> {
      const response = await getSnapshotIfNoneMatch();

      expect(response.status).toBe(StatusCodes.OK);

      return response.headers.etag as string;
    }

    it('should answer twice in the same minute with the same body and a strong ETag', async function () {
      await syncLoop.start();

      const first = await getSnapshotIfNoneMatch();
      vi.setSystemTime(mondayMorning.getTime() + MINUTE - 1);
      const second = await getSnapshotIfNoneMatch();

      expect(first.status).toBe(StatusCodes.OK);
      expect(first.headers.etag).toMatch(/^"[^"]+"$/);
      expect(second.headers.etag).toBe(first.headers.etag);
      expect(second.text).toBe(first.text);
    });

    it('should answer 304 with no body to a request with the current ETag', async function () {
      await syncLoop.start();
      const etag = await getEtag();

      const response = await getSnapshotIfNoneMatch(etag);

      expect(response.status).toBe(StatusCodes.NOT_MODIFIED);
      expect(response.text).toBe('');
    });

    it('should answer 200 with a new ETag in a new minute', async function () {
      await syncLoop.start();
      const etag = await getEtag();

      vi.setSystemTime(mondayMorning.getTime() + MINUTE);
      const response = await getSnapshotIfNoneMatch(etag);

      expect(response.status).toBe(StatusCodes.OK);
      expect(response.headers.etag).not.toBe(etag);
    });

    it('should answer 200 with a new ETag once a sweep landed', async function () {
      await syncLoop.start();
      // Pass the cooldown first, so the only change between the two requests is the sweep.
      vi.setSystemTime(mondayMorning.getTime() + cooldownMs);
      const etag = await getEtag();

      const release = provider.hold();
      await requestSender.refresh();
      const whileSyncing = await getEtag();
      release();
      await untilIdle();
      // The sweep landing changes the store, and the sync state back to idle.
      const afterSweep = await getEtag();

      expect(whileSyncing).not.toBe(etag);
      expect(afterSweep).not.toBe(whileSyncing);
      expect(afterSweep).not.toBe(etag);
    });

    it('should answer 200 with a new ETag once a sweep failed', async function () {
      await syncLoop.start();
      vi.setSystemTime(mondayMorning.getTime() + cooldownMs);
      const etag = await getEtag();

      provider.failure = new SweepError('unreachable');
      await requestSender.refresh();
      await untilIdle();
      const response = await getSnapshotIfNoneMatch(etag);

      expect(response.status).toBe(StatusCodes.OK);
      expect(response.headers.etag).not.toBe(etag);
      expect((response.body as Snapshot).sync.lastError).toBe('GitHub API unreachable');
    });

    it('should answer 503 to every request while warming, never cached', async function () {
      const first = await getSnapshotIfNoneMatch();
      const second = await getSnapshotIfNoneMatch(first.headers.etag);

      [first, second].forEach((response) => {
        expect(response.status).toBe(StatusCodes.SERVICE_UNAVAILABLE);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body).toEqual({ status: 'warming', sync: { state: 'idle' } });
      });
    });

    it('should record how long building the Snapshot took, only when it was not cached', async function () {
      await syncLoop.start();
      const server = createHttpServer(app, container);
      const buildCount = async (): Promise<string | undefined> =>
        /^stalemate_snapshot_build_duration_seconds_count(?:\{.*\})? (\d+)$/m.exec((await supertest(server).get('/metrics')).text)?.[1];

      const etag = await getEtag();
      await getEtag();
      const notModified = await getSnapshotIfNoneMatch(etag);

      expect(notModified.status).toBe(StatusCodes.NOT_MODIFIED);
      await expect(buildCount()).resolves.toBe('1');

      vi.setSystemTime(mondayMorning.getTime() + MINUTE);
      await getEtag();

      await expect(buildCount()).resolves.toBe('2');
    });
  });

  describe('Teams', function () {
    const dana = anActor({ id: 'U_dana-raster', login: 'dana-raster' });
    const schnitz = anActor({ id: 'U_CptSchnitz', login: 'CptSchnitz' });
    const ids = (snapshot: Snapshot): string[] => snapshot.prs.map(({ id }) => id);
    const prOf = (snapshot: Snapshot, id: string): Snapshot['prs'][number] | undefined => snapshot.prs.find((pr) => pr.id === id);

    async function getTeams(): Promise<components['schemas']['watchedTeam'][]> {
      const response = await requestSender.getTeams();
      expectResponseStatus(response, StatusCodes.OK);

      expect(response).toSatisfyApiSpec();

      return response.body;
    }

    describe('GET /teams', function () {
      it('should return 503 warming before the first sweep', async function () {
        const response = await requestSender.getTeams();

        expectResponseStatus(response, StatusCodes.SERVICE_UNAVAILABLE);

        expect(response).toSatisfyApiSpec();
        expect(response.body).toEqual({ status: 'warming', sync: { state: 'idle' } });
      });

      it('should return every watched Team sorted by display name, with its members', async function () {
        await syncLoop.start();

        const teams = await getTeams();

        expect(teams.map(({ slug, name }) => ({ slug, name }))).toEqual([
          { slug: '3d', name: '3D' },
          { slug: 'infra', name: 'Infra' },
          { slug: 'raster', name: 'Raster' },
          { slug: 'vector', name: 'Vector' },
        ]);
        expect(teams.find(({ slug }) => slug === 'raster')?.members).toIncludeSameMembers([
          { login: 'dana-raster', kind: 'member' },
          { login: 'eyal-gis', kind: 'member' },
          { login: 'CptSchnitz', kind: 'member' },
        ]);
        expect(teams.find(({ slug }) => slug === 'infra')?.members).toContainEqual({ login: 'mapcolonies-devops', kind: 'bot' });
      });

      it('should leave an excluded Team out', async function () {
        provider.teams = (await new FixturePrProvider(['raster']).discover()).teams;
        await syncLoop.start();

        expect((await getTeams()).map(({ slug }) => slug)).not.toContain('raster');

        expectResponseStatus(await requestSender.getSnapshot({ queryParams: { team: 'raster' } }), StatusCodes.NOT_FOUND);
      });
    });

    describe('GET /snapshot?team=', function () {
      it('should return the Team slice, naming its Team and its members', async function () {
        await syncLoop.start();

        const snapshot = await getSnapshot('raster');

        expect(snapshot.teamInfo).toEqual({ slug: 'raster', name: 'Raster' });
        expect(snapshot.team).toContainEqual({ login: 'dana-raster', kind: 'member' });
        expect(snapshot.team).not.toContainEqual({ login: 'mapcolonies-devops', kind: 'bot' });
        expect(snapshot.prs.length).toBeGreaterThan(0);

        snapshot.prs.forEach((pr) => expect(pr.inclusionReasons.length).toBeGreaterThan(0));
      });

      it('should answer 404 for a slug that is not a watched Team', async function () {
        await syncLoop.start();

        const response = await requestSender.getSnapshot({ queryParams: { team: 'nobody' } });

        expectResponseStatus(response, StatusCodes.NOT_FOUND);

        expect(response).toSatisfyApiSpec();
      });

      it('should answer 400 without a team', async function () {
        await syncLoop.start();

        const response = await supertest(app).get('/snapshot');

        expectResponseStatus(response, StatusCodes.BAD_REQUEST);

        expect(response).toSatisfyApiSpec();
      });

      it('should show a PR two Teams track in both slices, each with its own Inclusion Reasons, kinds and viaTeam', async function () {
        provider.add(
          aPrFacts({
            id: 'PR_shared',
            repo: 'MapColonies/shared-workflows',
            author: schnitz,
            reviewRequests: [
              { type: 'person', reviewer: dana, asCodeOwner: false },
              { type: 'team', slug: 'raster', asCodeOwner: false },
            ],
          }),
          mondayMorning
        );
        await syncLoop.start();

        const infra = prOf(await getSnapshot('infra'), 'PR_shared');
        const raster = prOf(await getSnapshot('raster'), 'PR_shared');

        expect(infra?.inclusionReasons).toEqual(['authoredByMember', 'teamRepo']);
        expect(infra?.requestedReviewers).toContainEqual({ login: 'dana-raster', kind: 'outsider' });
        expect(infra?.waitingOn).toContainEqual({ type: 'team', slug: 'raster', viaTeam: false });
        expect(raster?.inclusionReasons).toEqual(['authoredByMember', 'memberReviewRequested', 'teamReviewRequested', 'teamRepo']);
        expect(raster?.requestedReviewers).toContainEqual({ login: 'dana-raster', kind: 'member' });
        expect(raster?.waitingOn).toContainEqual({ type: 'team', slug: 'raster', viaTeam: true });
      });

      it('should show a PR no Team tracks in no slice', async function () {
        provider.add(aPrFacts({ id: 'PR_nobody', repo: 'MapColonies/nowhere', author: anActor({ id: 'U_zed', login: 'zed' }) }), mondayMorning);
        await syncLoop.start();

        for (const { slug } of await getTeams()) {
          expect(ids(await getSnapshot(slug))).not.toContain('PR_nobody');
        }
      });

      it("should keep a Team's ETag when only another Team's PRs changed, and answer 304 per Team", async function () {
        const rasterOnly = (title: string): PrFacts =>
          aPrFacts({ id: 'PR_raster_only', repo: 'MapColonies/discrete-overseer', author: dana, title, createdAt: mondayMorning });
        provider.add(rasterOnly('first'), mondayMorning);
        await syncLoop.start();
        const etagOf = async (team: string): Promise<string> => {
          const response = await supertest(app).get('/snapshot').query({ team });
          return response.headers.etag as string;
        };
        const [infraBefore, rasterBefore] = [await etagOf('infra'), await etagOf('raster')];

        // Sweeps again at the same instant, so only the PR's facts differ.
        provider.add(rasterOnly('second'), mondayMorning);
        await syncLoop.start();

        await expect(etagOf('infra')).resolves.toBe(infraBefore);
        await expect(etagOf('raster')).resolves.not.toBe(rasterBefore);

        const notModified = await supertest(app).get('/snapshot').query({ team: 'infra' }).set('If-None-Match', infraBefore);
        const modified = await supertest(app).get('/snapshot').query({ team: 'raster' }).set('If-None-Match', rasterBefore);

        expect(notModified.status).toBe(StatusCodes.NOT_MODIFIED);
        expect(modified.status).toBe(StatusCodes.OK);
      });

      it('should drop a stored PR from a slice, and from the Snapshot, when a roster change leaves no Team tracking it', async function () {
        const idle = new Date(mondayMorning.getTime() - 365 * 24 * HOUR);
        const pushed = { ...aPrFacts().headCommit, committedDate: idle, firstCheckSuiteAt: idle };
        const eyal = anActor({ id: 'U_eyal-gis', login: 'eyal-gis' });
        provider.add(aPrFacts({ id: 'PR_cold_by_eyal', repo: 'MapColonies/nowhere', author: eyal, createdAt: idle, headCommit: pushed }), idle);
        await syncLoop.start();

        expect(ids(await getSnapshot('raster'))).toContain('PR_cold_by_eyal');

        const { teams } = await new FixturePrProvider().discover();
        provider.teams = teams.map((team) =>
          team.slug === 'raster'
            ? { ...team, roster: { ...team.roster, members: team.roster.members.filter(({ login }) => login !== 'eyal-gis') } }
            : team
        );
        vi.setSystemTime(mondayMorning.getTime() + cooldownMs);
        await requestSender.refresh();
        await untilIdle();

        expect(provider.reads.at(-1)).not.toContain('PR_cold_by_eyal');
        expect(ids(await getSnapshot('raster'))).not.toContain('PR_cold_by_eyal');
      });

      it("should re-derive a stored PR in the affected Team's slice only when that Team's roster changes", async function () {
        const idle = new Date(mondayMorning.getTime() - 365 * 24 * HOUR);
        const pushed = { ...aPrFacts().headCommit, committedDate: idle, firstCheckSuiteAt: idle };
        const reviewRequests = [{ type: 'person' as const, reviewer: dana, asCodeOwner: false }];
        provider.add(aPrFacts({ id: 'PR_cold', repo: 'MapColonies/opa-la', createdAt: idle, headCommit: pushed, reviewRequests }), idle);
        await syncLoop.start();

        expect(prOf(await getSnapshot('infra'), 'PR_cold')?.inclusionReasons).toEqual(['teamRepo']);
        expect(prOf(await getSnapshot('raster'), 'PR_cold')?.inclusionReasons).toEqual(['memberReviewRequested']);

        const { teams } = await new FixturePrProvider().discover();
        provider.teams = teams.map((team) =>
          team.slug === 'infra' ? { ...team, roster: { ...team.roster, members: [...team.roster.members, dana] } } : team
        );
        vi.setSystemTime(mondayMorning.getTime() + cooldownMs);
        await requestSender.refresh();
        await untilIdle();

        expect(provider.reads.at(-1)).not.toContain('PR_cold');
        expect(prOf(await getSnapshot('infra'), 'PR_cold')?.inclusionReasons).toEqual(['memberReviewRequested', 'teamRepo']);
        expect(prOf(await getSnapshot('raster'), 'PR_cold')?.inclusionReasons).toEqual(['memberReviewRequested']);
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
      const { teams } = await new FixturePrProvider().discover();
      const { roster } = infraOf(teams);
      provider.teams = withInfraMembers(teams, [carol, dave]);
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

      provider.teams = teams;
      const snapshot = await sweepAgain();

      expect(byCarol(snapshot)).toMatchObject({ inclusionReasons: ['teamRepo'], waitingOn: [{ type: 'person', login: 'dave', kind: 'outsider' }] });
      expect(snapshot.team.map(({ login }) => login)).not.toContain('carol');
    });
  });

  describe('tiered reads', function () {
    const DAY = 24 * HOUR;

    /** A PR a person last acted on at `at`, when it was opened and pushed. */
    function aPrIdleSince(id: string, at: Date, overrides: Partial<PrFacts> = {}): PrFacts {
      return aPrFacts({ id, createdAt: at, headCommit: { ...aPrFacts().headCommit, committedDate: at, firstCheckSuiteAt: at }, ...overrides });
    }

    /** Sweeps with the clock at `ms` after Monday morning, and says which PRs that sweep read. */
    async function sweepAt(ms: number): Promise<string[]> {
      vi.setSystemTime(mondayMorning.getTime() + ms);
      await requestSender.refresh();
      await untilIdle();
      return provider.reads.at(-1) ?? [];
    }

    // Hot: idle under 10 Working Days. Warm: up to 60. Cold: beyond.
    const hot = aPrIdleSince('PR_hot', mondayMorning);
    const warm = aPrIdleSince('PR_warm', new Date(mondayMorning.getTime() - 30 * DAY));
    const cold = aPrIdleSince('PR_cold', new Date(mondayMorning.getTime() - 365 * DAY));

    beforeEach(function () {
      [hot, warm, cold].forEach((pr) => provider.add(pr, pr.createdAt));
    });

    it('should read every discovered PR on the first sweep', async function () {
      await syncLoop.start();

      const discovered = (await provider.discover()).prs.map(({ id }) => id);

      expect(provider.reads).toHaveLength(1);
      expect(provider.reads[0]).toIncludeSameMembers(discovered);
    });

    it('should read Hot PRs every sweep, and Warm and Cold ones only once their interval has passed', async function () {
      await syncLoop.start();

      const soon = await sweepAt(cooldownMs);

      expect(soon).toContain(hot.id);
      expect(soon).not.toIncludeAnyMembers([warm.id, cold.id]);

      const afterWarmInterval = await sweepAt(15 * MINUTE);

      expect(afterWarmInterval).toIncludeAllMembers([hot.id, warm.id]);
      expect(afterWarmInterval).not.toContain(cold.id);

      const afterColdInterval = await sweepAt(60 * MINUTE);

      expect(afterColdInterval).toIncludeAllMembers([hot.id, warm.id, cold.id]);
    });

    it('should read a Cold PR in the next sweep once it changed', async function () {
      await syncLoop.start();

      provider.touch(cold.id, mondayMorning);
      const changed = await sweepAt(cooldownMs);

      expect(changed).toContain(cold.id);
      await expect(sweepAt(2 * cooldownMs)).resolves.not.toContain(cold.id);
    });

    it('should cool down a PR whose only activity since a person acted on it is a Bot’s', async function () {
      const devops = anActor({ id: 'U_devops', login: 'mapcolonies-devops' });
      const botTouched = aPrIdleSince('PR_bot_touched', mondayMorning);
      provider.add(botTouched, mondayMorning);
      await syncLoop.start();

      // Three weeks on, a Bot comments: it is read once, then idles as Warm.
      const threeWeeks = 21 * DAY;
      const botCommented = new Date(mondayMorning.getTime() + threeWeeks);
      provider.add({ ...botTouched, timeline: [{ type: 'comment', actor: devops, at: botCommented }] }, botCommented);

      await expect(sweepAt(threeWeeks)).resolves.toContain(botTouched.id);
      await expect(sweepAt(threeWeeks + MINUTE)).resolves.not.toContain(botTouched.id);
      await expect(sweepAt(threeWeeks + 15 * MINUTE)).resolves.toContain(botTouched.id);

      // Four months on, it is Cold.
      const fourMonths = 120 * DAY;

      await expect(sweepAt(fourMonths)).resolves.toContain(botTouched.id);
      await expect(sweepAt(fourMonths + 15 * MINUTE)).resolves.not.toContain(botTouched.id);
      await expect(sweepAt(fourMonths + 60 * MINUTE)).resolves.toContain(botTouched.id);
    });

    it('should drop a PR chosen to read that was gone by the time it was read', async function () {
      await syncLoop.start();

      provider.closeBeforeRead(hot.id);
      const read = await sweepAt(cooldownMs);
      const snapshot = await getSnapshot();

      expect(read).toContain(hot.id);
      expect(snapshot.prs.map(({ id }) => id)).not.toContain(hot.id);
    });

    it('should log how many PRs the sweep discovered, read by reason, and dropped', async function () {
      const info = vi.spyOn(container.resolve<Logger>(SERVICES.LOGGER), 'info');
      await syncLoop.start();
      const discovered = provider.reads[0]!.length;
      info.mockClear();

      provider.touch(cold.id, mondayMorning);
      provider.remove(warm.id);
      provider.add(aPrIdleSince('PR_new', mondayMorning), mondayMorning);
      await sweepAt(cooldownMs);

      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'sweep succeeded',
          discovered,
          read: expect.objectContaining({ new: 1, changed: 1, warm: 0, cold: 0 }) as unknown,
          dropped: 1,
        })
      );
    });

    it('should re-derive a Cold PR not re-read when the Roster changes', async function () {
      const carol = anActor({ id: 'U_carol', login: 'carol' });
      const dave = anActor({ id: 'U_dave', login: 'dave' });
      const { teams } = await new FixturePrProvider().discover();
      const { roster } = infraOf(teams);
      const reviewRequests = [{ type: 'person' as const, reviewer: dave, asCodeOwner: false }];
      provider.add(aPrIdleSince(cold.id, cold.createdAt, { repo: roster.repos[0], author: carol, reviewRequests }), cold.createdAt);
      await syncLoop.start();
      const coldPr = (snapshot: Snapshot): Snapshot['prs'][number] | undefined => snapshot.prs.find(({ id }) => id === cold.id);

      expect(coldPr(await getSnapshot())).toMatchObject({
        author: { login: 'carol', kind: 'outsider' },
        inclusionReasons: ['teamRepo'],
        waitingOn: [{ type: 'person', login: 'dave', kind: 'outsider' }],
      });

      provider.teams = withInfraMembers(teams, [carol, dave]);
      const read = await sweepAt(cooldownMs);
      const snapshot = await getSnapshot();

      expect(read).not.toContain(cold.id);
      expect(coldPr(snapshot)).toMatchObject({
        author: { login: 'carol', kind: 'member' },
        inclusionReasons: ['authoredByMember', 'memberReviewRequested', 'teamRepo'],
        waitingOn: [{ type: 'person', login: 'dave', kind: 'member' }],
      });
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
      const response = await requestSender.getSnapshot({ queryParams: { team: 'infra' } });

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
