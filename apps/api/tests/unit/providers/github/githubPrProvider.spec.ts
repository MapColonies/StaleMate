/* eslint-disable @typescript-eslint/naming-convention -- GitHub's field names */
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Registry } from 'prom-client';
import type { PrFacts } from '@domain/facts';
import { createGithubPrProvider, type GithubPrProviderOptions } from '@src/providers/github/githubPrProvider';
import { SweepError, type SweepFailure } from '@src/providers/prProvider';
import { createSyncMetrics, type SyncMetrics } from '@src/sync/syncMetrics';
import {
  aNodesResponse,
  aPrNode,
  aRateLimit,
  aRosterResponse,
  aSearchResponse,
  aSpyLogger,
  anEmptyGithub,
  type FakeGithub,
} from './helpers/fakeGithub';

describe('GithubPrProvider', function () {
  let github: FakeGithub;
  let metrics: SyncMetrics;
  let logger: ReturnType<typeof aSpyLogger>;

  beforeEach(function () {
    github = anEmptyGithub();
    metrics = createSyncMetrics(new Registry());
    logger = aSpyLogger();
  });

  function aProvider(overrides: Partial<GithubPrProviderOptions> = {}): ReturnType<typeof createGithubPrProvider> {
    return createGithubPrProvider({
      teamSlug: 'infra',
      githubToken: 'ghp_test',
      githubApp: {},
      logger,
      metrics,
      fetch: github.fetch,
      ...overrides,
    });
  }

  describe('roster', function () {
    it('should read the Team Members and the Team Repos, leaving archived repositories out', async function () {
      github.on('Roster', () =>
        aRosterResponse(
          [
            { id: 'U_alice', login: 'alice' },
            { id: 'U_bob', login: 'bob' },
          ],
          [
            { nameWithOwner: 'MapColonies/opa-la', isArchived: false },
            { nameWithOwner: 'MapColonies/telemetry', isArchived: true },
          ]
        )
      );

      const { roster } = await aProvider().sweep();

      expect(roster).toEqual({
        members: [
          { id: 'U_alice', login: 'alice', isBot: false },
          { id: 'U_bob', login: 'bob', isBot: false },
        ],
        repos: ['MapColonies/opa-la'],
      });
      expect(github.requestsFor('Roster')[0]?.variables).toEqual({ org: 'MapColonies', team: 'infra' });
    });

    it('should warn when the Team has more members or repos than it reads', async function () {
      github.on('Roster', () => {
        const response = aRosterResponse([{ id: 'U_alice', login: 'alice' }], []) as {
          data: { organization: { team: { repositories: { pageInfo: { hasNextPage: boolean } } } } };
        };
        response.data.organization.team.repositories.pageInfo.hasNextPage = true;
        return response;
      });

      await aProvider().sweep();

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ truncated: ['repositories'] }));
    });
  });

  describe('facts', function () {
    const alice = { __typename: 'User', id: 'U_alice', login: 'alice' };
    const bob = { __typename: 'User', id: 'U_bob', login: 'bob' };
    const copilot = { __typename: 'Bot', id: 'BOT_kgDOCnlnWA', login: 'copilot-pull-request-reviewer' };

    async function sweepOne(node: Record<string, unknown>, extra: Partial<Record<string, (ids: string[]) => unknown>> = {}): Promise<PrFacts> {
      github.on('SearchPullRequests', () => aSearchResponse([String(node.id)])).on('PullRequestDetails', () => aNodesResponse([node]));
      for (const [operation, respond] of Object.entries(extra)) {
        github.on(operation, ({ variables }) => respond?.(variables.ids as string[]));
      }
      const { prs } = await aProvider().sweep();

      expect(prs).toHaveLength(1);

      return prs[0] as PrFacts;
    }

    it('should translate what GitHub says about a PR into facts', async function () {
      const facts = await sweepOne(
        aPrNode({
          isDraft: true,
          mergeable: 'CONFLICTING',
          assignees: { pageInfo: { hasNextPage: false }, nodes: [alice] },
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'beef',
                  committedDate: '2026-10-12T07:00:00Z',
                  checkSuites: { nodes: [{ createdAt: '2026-10-12T07:05:00Z' }, { createdAt: '2026-10-12T07:01:00Z' }] },
                  statusCheckRollup: {
                    state: 'FAILURE',
                    contexts: {
                      pageInfo: { hasNextPage: false },
                      nodes: [
                        { __typename: 'CheckRun', completedAt: '2026-10-12T07:10:00Z' },
                        { __typename: 'CheckRun', completedAt: null },
                        { __typename: 'StatusContext', createdAt: '2026-10-12T07:02:00Z' },
                      ],
                    },
                  },
                },
              },
            ],
          },
          reviews: {
            pageInfo: { hasPreviousPage: false },
            nodes: [
              { id: 'PRR_2', state: 'APPROVED', submittedAt: '2026-10-13T09:00:00Z', author: bob, commit: { oid: 'beef' } },
              { id: 'PRR_1', state: 'CHANGES_REQUESTED', submittedAt: '2026-10-13T08:00:00Z', author: bob, commit: { oid: 'cafe' } },
              { id: 'PRR_3', state: 'COMMENTED', submittedAt: '2026-10-13T10:00:00Z', author: copilot, commit: null },
            ],
          },
          reviewRequests: {
            pageInfo: { hasNextPage: false },
            nodes: [
              { asCodeOwner: false, requestedReviewer: bob },
              { asCodeOwner: true, requestedReviewer: { __typename: 'Team', slug: 'infra' } },
              { asCodeOwner: false, requestedReviewer: copilot },
            ],
          },
          timelineItems: {
            pageInfo: { hasNextPage: false },
            nodes: [
              { __typename: 'IssueComment', createdAt: '2026-10-13T11:00:00Z', author: alice },
              { __typename: 'ReadyForReviewEvent', createdAt: '2026-10-12T09:00:00Z', actor: alice },
              {
                __typename: 'ReviewRequestedEvent',
                createdAt: '2026-10-12T09:01:00Z',
                actor: alice,
                requestedReviewer: { __typename: 'Team', slug: 'infra' },
              },
              { __typename: 'ConvertToDraftEvent', createdAt: '2026-10-14T09:00:00Z', actor: alice },
            ],
          },
        })
      );

      const aliceFact = { id: 'U_alice', login: 'alice', isBot: false };
      const bobFact = { id: 'U_bob', login: 'bob', isBot: false };
      const copilotFact = { id: 'BOT_kgDOCnlnWA', login: 'copilot-pull-request-reviewer', isBot: true };

      expect(facts).toEqual({
        id: 'PR_1',
        repo: 'MapColonies/opa-la',
        number: 1,
        title: 'feat: add retry policy to job polling',
        url: 'https://github.com/MapColonies/opa-la/pull/1',
        isDraft: true,
        createdAt: new Date('2026-10-12T08:00:00Z'),
        mergeable: 'conflicting',
        author: aliceFact,
        assignees: [aliceFact],
        headCommit: {
          oid: 'beef',
          committedDate: new Date('2026-10-12T07:00:00Z'),
          firstCheckSuiteAt: new Date('2026-10-12T07:01:00Z'),
          checkRollup: 'failure',
          checkActivity: [new Date('2026-10-12T07:10:00Z'), new Date('2026-10-12T07:02:00Z')],
        },
        reviews: [
          {
            id: 'PRR_1',
            state: 'changesRequested',
            author: bobFact,
            submittedAt: new Date('2026-10-13T08:00:00Z'),
            commitOid: 'cafe',
            onBehalfOf: [],
          },
          { id: 'PRR_2', state: 'approved', author: bobFact, submittedAt: new Date('2026-10-13T09:00:00Z'), commitOid: 'beef', onBehalfOf: [] },
          { id: 'PRR_3', state: 'commented', author: copilotFact, submittedAt: new Date('2026-10-13T10:00:00Z'), commitOid: null, onBehalfOf: [] },
        ],
        reviewRequests: [
          { type: 'person', reviewer: bobFact, asCodeOwner: false },
          { type: 'team', slug: 'infra', asCodeOwner: true },
          { type: 'person', reviewer: copilotFact, asCodeOwner: false },
        ],
        reviewThreads: [],
        timeline: [
          { type: 'readyForReview', at: new Date('2026-10-12T09:00:00Z'), actor: aliceFact },
          {
            type: 'reviewRequested',
            at: new Date('2026-10-12T09:01:00Z'),
            actor: aliceFact,
            requested: { type: 'team', slug: 'infra', asCodeOwner: false },
          },
          { type: 'comment', at: new Date('2026-10-13T11:00:00Z'), actor: aliceFact },
          { type: 'convertToDraft', at: new Date('2026-10-14T09:00:00Z'), actor: aliceFact },
        ],
      });
    });

    it('should tell a Bot by its id where GitHub types it as a User', async function () {
      // GitHub reports Copilot's coding agent as the Bot copilot-swe-agent when it authors, and as the User Copilot when assigned.
      const facts = await sweepOne(
        aPrNode({ assignees: { pageInfo: { hasNextPage: false }, nodes: [{ __typename: 'User', id: 'BOT_kgDOC9w8XQ', login: 'Copilot' }] } })
      );

      expect(facts.assignees).toEqual([{ id: 'BOT_kgDOC9w8XQ', login: 'Copilot', isBot: true }]);
    });

    it('should report a PR without checks as having no rollup and no check suite', async function () {
      const facts = await sweepOne(
        aPrNode({
          commits: {
            nodes: [{ commit: { oid: 'beef', committedDate: '2026-10-12T07:00:00Z', checkSuites: { nodes: [] }, statusCheckRollup: null } }],
          },
        })
      );

      expect(facts.headCommit).toEqual({
        oid: 'beef',
        committedDate: new Date('2026-10-12T07:00:00Z'),
        firstCheckSuiteAt: null,
        checkRollup: null,
        checkActivity: [],
      });
    });

    it('should leave pending reviews out, and report deleted accounts as ghost', async function () {
      const ghost = { id: 'MDQ6VXNlcjEwMTM3', login: 'ghost', isBot: false };
      const facts = await sweepOne(
        aPrNode({
          author: null,
          reviews: {
            pageInfo: { hasPreviousPage: false },
            nodes: [
              { id: 'PRR_1', state: 'PENDING', submittedAt: null, author: bob, commit: { oid: 'c0ffee' } },
              { id: 'PRR_2', state: 'DISMISSED', submittedAt: '2026-10-13T08:00:00Z', author: null, commit: { oid: 'c0ffee' } },
            ],
          },
          timelineItems: {
            pageInfo: { hasNextPage: false },
            nodes: [{ __typename: 'IssueComment', createdAt: '2026-10-13T11:00:00Z', author: null }],
          },
        })
      );

      expect(facts.author).toEqual(ghost);
      expect(facts.reviews).toEqual([expect.objectContaining({ id: 'PRR_2', state: 'dismissed', author: ghost })]);
      expect(facts.timeline).toEqual([{ type: 'comment', at: new Date('2026-10-13T11:00:00Z'), actor: null }]);
    });

    it('should read the review threads of only the PRs that have them', async function () {
      github
        .on('SearchPullRequests', () => aSearchResponse(['PR_1', 'PR_2']))
        .on('PullRequestDetails', () => aNodesResponse([aPrNode({ id: 'PR_1' }), aPrNode({ id: 'PR_2', reviewThreads: { totalCount: 2 } })]))
        .on('ReviewThreads', () =>
          aNodesResponse([
            {
              id: 'PR_2',
              reviewThreads: {
                pageInfo: { hasNextPage: false },
                nodes: [
                  {
                    isResolved: false,
                    comments: {
                      pageInfo: { hasNextPage: false },
                      nodes: [
                        { createdAt: '2026-10-13T08:00:00Z', author: bob, pullRequestReview: { id: 'PRR_1' } },
                        { createdAt: '2026-10-13T09:00:00Z', author: alice, pullRequestReview: { id: 'PRR_2' } },
                      ],
                    },
                  },
                  {
                    isResolved: true,
                    comments: {
                      pageInfo: { hasNextPage: false },
                      nodes: [{ createdAt: '2026-10-13T08:01:00Z', author: null, pullRequestReview: null }],
                    },
                  },
                ],
              },
            },
          ])
        );

      const { prs } = await aProvider().sweep();

      expect(github.requestsFor('ReviewThreads').map((request) => request.variables.ids)).toEqual([['PR_2']]);
      expect(prs.map((pr) => pr.reviewThreads)).toEqual([
        [],
        [
          {
            isResolved: false,
            comments: [
              { author: { id: 'U_bob', login: 'bob', isBot: false }, createdAt: new Date('2026-10-13T08:00:00Z'), reviewId: 'PRR_1' },
              { author: { id: 'U_alice', login: 'alice', isBot: false }, createdAt: new Date('2026-10-13T09:00:00Z'), reviewId: 'PRR_2' },
            ],
          },
          {
            isResolved: true,
            comments: [
              { author: { id: 'MDQ6VXNlcjEwMTM3', login: 'ghost', isBot: false }, createdAt: new Date('2026-10-13T08:01:00Z'), reviewId: null },
            ],
          },
        ],
      ]);
    });

    it('should read the teams reviews were given on behalf of, for only the PRs that ask a team for review', async function () {
      const teamRequest = {
        pageInfo: { hasNextPage: false },
        nodes: [{ asCodeOwner: false, requestedReviewer: { __typename: 'Team', slug: 'infra' } }],
      };
      const review = { state: 'APPROVED', submittedAt: '2026-10-13T08:00:00Z', author: bob, commit: { oid: 'c0ffee' } };
      github
        .on('SearchPullRequests', () => aSearchResponse(['PR_1', 'PR_2']))
        .on('PullRequestDetails', () =>
          aNodesResponse([
            aPrNode({ id: 'PR_1', reviews: { pageInfo: { hasPreviousPage: false }, nodes: [{ id: 'PRR_1', ...review }] } }),
            aPrNode({
              id: 'PR_2',
              reviewRequests: teamRequest,
              reviews: { pageInfo: { hasPreviousPage: false }, nodes: [{ id: 'PRR_2', ...review }] },
            }),
          ])
        )
        .on('ReviewTeams', () =>
          aNodesResponse([{ id: 'PR_2', reviews: { nodes: [{ id: 'PRR_2', onBehalfOf: { nodes: [{ slug: 'infra' }, { slug: '3d' }] } }] } }])
        );

      const { prs } = await aProvider().sweep();

      expect(github.requestsFor('ReviewTeams').map((request) => request.variables.ids)).toEqual([['PR_2']]);
      expect(prs.map((pr) => pr.reviews.map((prReview) => prReview.onBehalfOf))).toEqual([[[]], [['infra', '3d']]]);
    });

    it('should warn when it reads only part of what a PR has', async function () {
      await sweepOne(
        aPrNode({
          reviews: { pageInfo: { hasPreviousPage: true }, nodes: [] },
          timelineItems: { pageInfo: { hasNextPage: true }, nodes: [] },
          reviewThreads: { totalCount: 1 },
        }),
        {
          ReviewThreads: (ids) =>
            aNodesResponse(
              ids.map((id) => ({
                id,
                reviewThreads: {
                  pageInfo: { hasNextPage: true },
                  nodes: [{ isResolved: false, comments: { pageInfo: { hasNextPage: true }, nodes: [] } }],
                },
              }))
            ),
        }
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://github.com/MapColonies/opa-la/pull/1',
          truncated: ['reviews', 'timelineItems', 'reviewThreads', 'comments'],
        })
      );
    });

    it('should not warn about a PR it read in full', async function () {
      await sweepOne(aPrNode());

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('authentication', function () {
    let privateKeyPath: string;

    beforeAll(async function () {
      const directory = await mkdtemp(path.join(tmpdir(), 'stalemate-app-'));
      privateKeyPath = path.join(directory, 'app.pem');
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      await writeFile(privateKeyPath, privateKey.export({ type: 'pkcs1', format: 'pem' }));
    });

    it('should authenticate with the token when no App is configured', async function () {
      await aProvider().sweep();

      expect(github.requests.every((request) => request.authorization === 'bearer ghp_test')).toBe(true);
      expect(github.restRequests).toEqual([]);
    });

    it('should authenticate as the App installation when an App is configured, rather than with the token', async function () {
      github.onRest('POST /app/installations/42/access_tokens', () => ({ token: 'ghs_installation', expires_at: '2099-01-01T00:00:00Z' }));

      await aProvider({ githubApp: { appId: 7, installationId: 42, privateKeyPath } }).sweep();

      expect(github.restRequests).toEqual([
        { route: 'POST /app/installations/42/access_tokens', authorization: expect.stringMatching(/^bearer ey/) as unknown },
      ]);
      expect(github.requests.every((request) => request.authorization === 'bearer ghs_installation')).toBe(true);
    });

    it('should fail the sweep with an authentication error when GitHub refuses the App', async function () {
      github.onRest('POST /app/installations/42/access_tokens', () =>
        Response.json({ message: 'A JSON web token could not be decoded' }, { status: 401 })
      );

      await expect(aProvider({ githubApp: { appId: 7, installationId: 42, privateKeyPath } }).sweep()).rejects.toEqual(
        new SweepError('authentication')
      );
    });

    it('should refuse to start an App without its installation id and private key', function () {
      expect(() => aProvider({ githubApp: { appId: 7 } })).toThrow('githubApp.installationId and githubApp.privateKeyPath');
    });

    it('should refuse to start with neither a token nor an App', function () {
      expect(() => aProvider({ githubToken: undefined })).toThrow('githubToken or githubApp.appId');
    });
  });

  describe('failures', function () {
    it.each<[string, () => unknown, SweepFailure]>([
      [
        'the network fails',
        () => {
          throw new TypeError('fetch failed');
        },
        'unreachable',
      ],
      ['GitHub is down', () => new Response('bad gateway', { status: 502 }), 'unreachable'],
      ['GitHub times out', () => new Response('gateway timeout', { status: 504 }), 'unreachable'],
      ['the credentials are refused', () => Response.json({ message: 'Bad credentials' }, { status: 401 }), 'authentication'],
      ['access is forbidden', () => Response.json({ message: 'Resource not accessible' }, { status: 403 }), 'authentication'],
      [
        'the primary rate limit is used up',
        () => Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
        'rateLimit',
      ],
      [
        'a secondary rate limit is hit',
        () => Response.json({ message: 'You have exceeded a secondary rate limit' }, { status: 403, headers: { 'retry-after': '60' } }),
        'rateLimit',
      ],
      ['too many requests are made', () => new Response('', { status: 429 }), 'rateLimit'],
      ['GraphQL reports a rate limit', () => ({ data: null, errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] }), 'rateLimit'],
    ])('should fail the sweep as %s', async function (_, respond, failure) {
      github.on('Roster', respond);

      await expect(aProvider().sweep()).rejects.toEqual(new SweepError(failure));
    });

    it('should fail the sweep with GitHub’s message when a query fails for another reason', async function () {
      github.on('Roster', () => ({ data: null, errors: [{ type: 'MAX_NODE_LIMIT_EXCEEDED', message: 'This query requests too many nodes' }] }));

      const sweep = aProvider().sweep();

      await expect(sweep).rejects.toThrow('This query requests too many nodes');
      await expect(sweep).rejects.not.toBeInstanceOf(SweepError);
    });

    it('should fail the sweep when the Team is not found', async function () {
      github.on('Roster', () => ({ data: { organization: { team: null }, rateLimit: aRateLimit() } }));

      await expect(aProvider().sweep()).rejects.toThrow('team MapColonies/infra not found');
    });

    it('should carry on past a PR that is gone by the time its details are read', async function () {
      github
        .on('SearchPullRequests', () => aSearchResponse(['PR_1', 'PR_gone']))
        .on('PullRequestDetails', () => ({
          data: { nodes: [aPrNode(), null], rateLimit: aRateLimit() },
          errors: [{ type: 'NOT_FOUND', path: ['nodes', 1], message: "Could not resolve to a node with the global id of 'PR_gone'" }],
        }));

      const { prs } = await aProvider().sweep();

      expect(prs.map((pr) => pr.id)).toEqual(['PR_1']);
    });
  });

  describe('rate limit', function () {
    const resetAt = '2026-10-15T07:00:00Z';

    afterEach(function () {
      vi.useRealTimers();
    });

    it('should report the points left after every query', async function () {
      let remaining = 4000;
      github.on('SearchPullRequests', () => ({
        data: { ...(aSearchResponse([]) as { data: object }).data, rateLimit: aRateLimit({ remaining: --remaining }) },
      }));

      await aProvider().sweep();

      expect((await metrics.graphqlPointsRemaining.get()).values[0]?.value).toBe(3997);
    });

    it('should stop querying once fewer than 10% of the points are left, until the budget resets', async function () {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T06:30:00Z') });
      github.on('Roster', () => ({
        data: {
          ...(aRosterResponse([{ id: 'U_alice', login: 'alice' }], []) as { data: object }).data,
          rateLimit: aRateLimit({ remaining: 499, resetAt }),
        },
      }));
      const provider = aProvider();

      await expect(provider.sweep()).rejects.toEqual(new SweepError('rateLimit'));
      expect(github.requests.map((request) => request.operation)).toEqual(['Roster']);

      await expect(provider.sweep()).rejects.toEqual(new SweepError('rateLimit'));
      expect(github.requests).toHaveLength(1);

      vi.setSystemTime(new Date(resetAt));
      github.on('Roster', () => aRosterResponse([{ id: 'U_alice', login: 'alice' }], []));

      await expect(provider.sweep()).resolves.toBeDefined();
    });

    it('should keep querying while at least 10% of the points are left', async function () {
      github.on('Roster', () => ({
        data: { ...(aRosterResponse([{ id: 'U_alice', login: 'alice' }], []) as { data: object }).data, rateLimit: aRateLimit({ remaining: 500 }) },
      }));

      await expect(aProvider().sweep()).resolves.toBeDefined();
    });
  });

  describe('summary', function () {
    it('should log how long the sweep took, the points it spent and how many PRs it read', async function () {
      github
        .on('SearchPullRequests', () => aSearchResponse(['PR_1']))
        .on('PullRequestDetails', () => ({ data: { nodes: [aPrNode()], rateLimit: aRateLimit({ cost: 3 }) } }));

      await aProvider().sweep();

      // The roster and the three searches cost a point each.
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ points: 7, prs: 1, durationMs: expect.any(Number) as unknown }));
    });
  });

  describe('discovery', function () {
    const searchQueries = (): unknown[] => github.requestsFor('SearchPullRequests').map((request) => request.variables.query);

    beforeEach(function () {
      github.on('Roster', () =>
        aRosterResponse(
          [
            { id: 'U_alice', login: 'alice' },
            { id: 'U_bob', login: 'bob' },
          ],
          [
            { nameWithOwner: 'MapColonies/opa-la', isArchived: false },
            { nameWithOwner: 'MapColonies/config', isArchived: false },
          ]
        )
      );
    });

    it('should search the Team Repos, the Team Members and requests to the Team for open PRs', async function () {
      await aProvider().sweep();

      expect(searchQueries()).toEqual([
        'is:pr is:open (repo:MapColonies/opa-la OR repo:MapColonies/config)',
        'is:pr is:open org:MapColonies archived:false (author:alice OR assignee:alice OR reviewed-by:alice OR user-review-requested:alice OR author:bob OR assignee:bob OR reviewed-by:bob OR user-review-requested:bob)',
        'is:pr is:open org:MapColonies archived:false team-review-requested:MapColonies/infra',
      ]);
    });

    it('should read the details of each PR found once, however many searches found it', async function () {
      github
        .on('SearchPullRequests', ({ variables }) => aSearchResponse(String(variables.query).includes('team-review') ? ['PR_2'] : ['PR_1', 'PR_2']))
        .on('PullRequestDetails', ({ variables }) => aNodesResponse((variables.ids as string[]).map((id) => aPrNode({ id }))));

      const { prs } = await aProvider().sweep();

      expect(github.requestsFor('PullRequestDetails').map((request) => request.variables.ids)).toEqual([['PR_1', 'PR_2']]);
      expect(prs.map((pr) => pr.id)).toEqual(['PR_1', 'PR_2']);
    });

    it('should split a search over many Team Repos into queries of at most 50 repos', async function () {
      const repos = Array.from({ length: 60 }, (_, index) => ({ nameWithOwner: `MapColonies/repo${index}`, isArchived: false }));
      github.on('Roster', () => aRosterResponse([{ id: 'U_alice', login: 'alice' }], repos));

      await aProvider().sweep();

      const repoQueries = searchQueries().filter((query) => String(query).includes('repo:'));

      expect(repoQueries).toEqual([
        `is:pr is:open (${repos
          .slice(0, 50)
          .map((repo) => `repo:${repo.nameWithOwner}`)
          .join(' OR ')})`,
        `is:pr is:open (${repos
          .slice(50)
          .map((repo) => `repo:${repo.nameWithOwner}`)
          .join(' OR ')})`,
      ]);
    });

    it('should split a search over many Team Members into queries of at most 12 members', async function () {
      const members = Array.from({ length: 13 }, (_, index) => ({ id: `U_${index}`, login: `member${index}` }));
      github.on('Roster', () => aRosterResponse(members, [{ nameWithOwner: 'MapColonies/opa-la', isArchived: false }]));

      await aProvider().sweep();

      const memberQueries = searchQueries().filter((query) => String(query).includes('author:'));

      expect(memberQueries).toHaveLength(2);
      expect(memberQueries[0]).toContain('user-review-requested:member11)');
      expect(memberQueries[1]).toBe(
        'is:pr is:open org:MapColonies archived:false (author:member12 OR assignee:member12 OR reviewed-by:member12 OR user-review-requested:member12)'
      );
    });

    it('should read the details 50 PRs at a time', async function () {
      const ids = Array.from({ length: 51 }, (_, index) => `PR_${index}`);
      github
        .on('SearchPullRequests', () => aSearchResponse(ids))
        .on('PullRequestDetails', ({ variables }) => aNodesResponse((variables.ids as string[]).map((id) => aPrNode({ id }))));

      const { prs } = await aProvider().sweep();

      expect(github.requestsFor('PullRequestDetails').map((request) => request.variables.ids)).toEqual([ids.slice(0, 50), ids.slice(50)]);
      expect(prs).toHaveLength(51);
    });

    it('should warn when a search nears its cap of 1,000 results', async function () {
      github.on('SearchPullRequests', ({ variables }) => aSearchResponse([], { issueCount: String(variables.query).includes('repo:') ? 801 : 800 }));

      await aProvider().sweep();

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ query: expect.stringContaining('repo:') as unknown, results: 801 })
      );
    });

    it('should read every page of a search', async function () {
      github.on('SearchPullRequests', ({ variables }) =>
        variables.after === null ? aSearchResponse(['PR_1'], { issueCount: 2, endCursor: 'cursor1' }) : aSearchResponse(['PR_2'], { issueCount: 2 })
      );

      await aProvider().sweep();

      expect(github.requestsFor('SearchPullRequests').map((request) => request.variables.after)).toEqual([
        null,
        'cursor1',
        null,
        'cursor1',
        null,
        'cursor1',
      ]);
    });
  });
});
