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
import { sweep } from '@tests/utils/sweep';
import {
  aNodesResponse,
  aPerPrResponse,
  aPrNode,
  aRateLimit,
  aRosterResponse,
  aTeamsResponse,
  aSearchResponse,
  aSpyLogger,
  anEmptyGithub,
  type FakeGithub,
  requestedIds,
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

      const { teams } = await sweep(aProvider());

      expect(teams).toEqual([
        {
          slug: 'infra',
          name: 'Infra',
          roster: {
            members: [
              { id: 'U_alice', login: 'alice', isBot: false },
              { id: 'U_bob', login: 'bob', isBot: false },
            ],
            repos: ['MapColonies/opa-la'],
          },
        },
      ]);
      expect(github.requestsFor('Roster')[0]?.variables).toEqual({ org: 'MapColonies' });
    });

    it('should read every Team but the excluded ones, in a stable order, with their display names', async function () {
      github.on('Roster', () =>
        aTeamsResponse([
          {
            slug: 'raster',
            name: 'Raster',
            members: [
              { id: 'U_dana', login: 'dana' },
              { id: 'U_alice', login: 'alice' },
            ],
            repos: [],
          },
          { slug: 'interns', name: 'Interns', members: [], repos: [] },
          { slug: 'infra', name: 'Infra', members: [{ id: 'U_bob', login: 'bob' }], repos: [] },
        ])
      );

      const { teams } = await sweep(aProvider({ excludedTeams: ['interns'] }));

      expect(teams.map(({ slug, name }) => [slug, name])).toEqual([
        ['infra', 'Infra'],
        ['raster', 'Raster'],
      ]);
      expect(teams[1]!.roster.members.map(({ login }) => login)).toEqual(['alice', 'dana']);
    });

    it('should warn when the org has more Teams than it reads', async function () {
      github.on('Roster', () => aTeamsResponse([], { hasNextPage: true }));

      await sweep(aProvider());

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ truncated: ['teams'] }));
    });

    it('should warn when a Team has more members or repos than it reads', async function () {
      github.on('Roster', () => {
        const response = aRosterResponse([{ id: 'U_alice', login: 'alice' }], []) as {
          data: { organization: { teams: { nodes: { repositories: { pageInfo: { hasNextPage: boolean } } }[] } } };
        };
        response.data.organization.teams.nodes[0]!.repositories.pageInfo.hasNextPage = true;
        return response;
      });

      await sweep(aProvider());

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ truncated: ['repositories'] }));
    });
  });

  describe('facts', function () {
    const alice = { __typename: 'User', id: 'U_alice', login: 'alice' };
    const bob = { __typename: 'User', id: 'U_bob', login: 'bob' };
    const copilot = { __typename: 'Bot', id: 'BOT_kgDOCnlnWA', login: 'copilot-pull-request-reviewer' };

    /** A head commit with these check runs and status contexts. */
    function withContexts(nodes: Record<string, unknown>[], hasNextPage = false): Record<string, unknown> {
      return {
        nodes: [
          {
            commit: {
              oid: 'c0ffee',
              committedDate: '2026-10-12T07:59:00Z',
              checkSuites: { nodes: [{ createdAt: '2026-10-12T07:59:07Z' }] },
              statusCheckRollup: { contexts: { pageInfo: { hasNextPage }, nodes } },
            },
          },
        ],
      };
    }

    async function sweepOne(node: Record<string, unknown>, extra: Partial<Record<string, (ids: string[]) => unknown>> = {}): Promise<PrFacts> {
      github.on('SearchPullRequests', () => aSearchResponse([String(node.id)])).on('PullRequestDetails', () => aNodesResponse([node]));
      for (const [operation, respond] of Object.entries(extra)) {
        github.on(operation, ({ variables }) => respond?.(requestedIds(variables)));
      }
      const { prs } = await sweep(aProvider());

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
                    contexts: {
                      pageInfo: { hasNextPage: false },
                      nodes: [
                        { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'FAILURE', completedAt: '2026-10-12T07:10:00Z' },
                        { __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS', conclusion: null, completedAt: null },
                        { __typename: 'StatusContext', context: 'jira/issue-validation', state: 'ERROR', createdAt: '2026-10-12T07:02:00Z' },
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
          checks: [
            { name: 'build', state: 'failed' },
            { name: 'test', state: 'pending' },
            { name: 'jira/issue-validation', state: 'failed' },
          ],
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

    it.each<[string, string | null, 'passed' | 'failed' | 'pending']>([
      ['COMPLETED', 'SUCCESS', 'passed'],
      ['COMPLETED', 'NEUTRAL', 'passed'],
      ['COMPLETED', 'SKIPPED', 'passed'],
      ['COMPLETED', 'STALE', 'failed'],
      ['COMPLETED', 'FAILURE', 'failed'],
      ['COMPLETED', 'CANCELLED', 'failed'],
      ['COMPLETED', 'TIMED_OUT', 'failed'],
      ['COMPLETED', 'ACTION_REQUIRED', 'failed'],
      ['COMPLETED', 'STARTUP_FAILURE', 'failed'],
      ['QUEUED', null, 'pending'],
      ['IN_PROGRESS', null, 'pending'],
      ['WAITING', null, 'pending'],
    ])('should report a %s check run concluded %s as %s', async function (status, conclusion, state) {
      const facts = await sweepOne(
        aPrNode({ commits: withContexts([{ __typename: 'CheckRun', name: 'build', status, conclusion, completedAt: null }]) })
      );

      expect(facts.headCommit.checks).toEqual([{ name: 'build', state }]);
    });

    it.each<[string, 'passed' | 'failed' | 'pending']>([
      ['SUCCESS', 'passed'],
      ['FAILURE', 'failed'],
      ['ERROR', 'failed'],
      ['PENDING', 'pending'],
      ['EXPECTED', 'pending'],
    ])('should report a %s status context as %s', async function (state, expected) {
      const facts = await sweepOne(
        aPrNode({
          commits: withContexts([{ __typename: 'StatusContext', context: 'jira/issue-validation', state, createdAt: '2026-10-12T07:02:00Z' }]),
        })
      );

      expect(facts.headCommit.checks).toEqual([{ name: 'jira/issue-validation', state: expected }]);
    });

    it('should report a PR without checks as having no checks and no check suite', async function () {
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
        checks: [],
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
          aPerPrResponse([
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

      const { prs } = await sweep(aProvider());

      expect(github.requestsFor('ReviewThreads').map((request) => requestedIds(request.variables))).toEqual([['PR_2']]);
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
          aPerPrResponse([{ id: 'PR_2', reviews: { nodes: [{ id: 'PRR_2', onBehalfOf: { nodes: [{ slug: 'infra' }, { slug: '3d' }] } }] } }])
        );

      const { prs } = await sweep(aProvider());

      expect(github.requestsFor('ReviewTeams').map((request) => requestedIds(request.variables))).toEqual([['PR_2']]);
      expect(prs.map((pr) => pr.reviews.map((prReview) => prReview.onBehalfOf))).toEqual([[[]], [['infra', '3d']]]);
    });

    // GitHub charges a query for the items it asks for, not for those it gets, so asking for 100 threads of every PR cost ~9× as much.
    // A few more than counted, so threads that turn up between the queries aren't lost.
    it('should ask for only as many threads as each PR has, and a few more, up to 100', async function () {
      github
        .on('SearchPullRequests', () => aSearchResponse(['PR_1', 'PR_2', 'PR_3']))
        .on('PullRequestDetails', () =>
          aNodesResponse([
            aPrNode({ id: 'PR_1', reviewThreads: { totalCount: 3 } }),
            aPrNode({ id: 'PR_2' }),
            aPrNode({ id: 'PR_3', reviewThreads: { totalCount: 150 } }),
          ])
        );

      await sweep(aProvider());

      expect(github.requestsFor('ReviewThreads').map((request) => request.variables)).toEqual([
        { id0: 'PR_1', threads0: 8, id1: 'PR_3', threads1: 100 },
      ]);
    });

    it('should ask for only as many reviews as each PR has, and a few more, when reading the teams they were given on behalf of', async function () {
      const teamRequest = {
        pageInfo: { hasNextPage: false },
        nodes: [{ asCodeOwner: false, requestedReviewer: { __typename: 'Team', slug: 'infra' } }],
      };
      const review = { state: 'APPROVED', submittedAt: '2026-10-13T08:00:00Z', author: bob, commit: { oid: 'c0ffee' } };
      github
        .on('SearchPullRequests', () => aSearchResponse(['PR_1', 'PR_2']))
        .on('PullRequestDetails', () =>
          aNodesResponse([
            aPrNode({ id: 'PR_1', reviewRequests: teamRequest }),
            aPrNode({
              id: 'PR_2',
              reviewRequests: teamRequest,
              reviews: {
                pageInfo: { hasPreviousPage: false },
                nodes: [
                  { id: 'PRR_1', ...review },
                  { id: 'PRR_2', ...review },
                ],
              },
            }),
          ])
        );

      await sweep(aProvider());

      // A PR without reviews has none to read the teams of.
      expect(github.requestsFor('ReviewTeams').map((request) => request.variables)).toEqual([{ id0: 'PR_2', reviews0: 7 }]);
    });

    it('should warn when it reads only part of what a PR has', async function () {
      await sweepOne(
        aPrNode({
          commits: withContexts([], true),
          reviews: { pageInfo: { hasPreviousPage: true }, nodes: [] },
          timelineItems: { pageInfo: { hasNextPage: true }, nodes: [] },
          reviewThreads: { totalCount: 1 },
        }),
        {
          ReviewThreads: (ids) =>
            aPerPrResponse(
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
          truncated: ['checks', 'reviews', 'timelineItems', 'reviewThreads', 'comments'],
        })
      );
    });

    describe('stacks', function () {
      const entry = (position: number, number: number, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
        position,
        pullRequest: {
          number,
          title: `feat: step ${number}`,
          url: `https://github.com/MapColonies/jobnik/pull/${number}`,
          state: 'OPEN',
          isDraft: false,
          reviewDecision: 'APPROVED',
          commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
          repository: { nameWithOwner: 'MapColonies/jobnik' },
          ...overrides,
        },
      });

      const inStack = (position: number, size: number, entries: unknown[], hasNextPage = false): Record<string, unknown> => ({
        stack: { number: 9, size, entries: { pageInfo: { hasNextPage }, nodes: entries } },
        stackEntry: { position },
      });

      it('should read a PR in a Stack with its position, the Stack size and its entries in order', async function () {
        const facts = await sweepOne(
          aPrNode(
            inStack(2, 3, [
              entry(1, 64, { state: 'MERGED' }),
              entry(2, 65),
              entry(3, 66, { state: 'CLOSED', isDraft: true, repository: { nameWithOwner: 'MapColonies/other' } }),
            ])
          )
        );

        expect(facts.stack).toStrictEqual({
          number: 9,
          position: 2,
          size: 3,
          entriesTruncated: false,
          entries: [
            {
              repo: 'MapColonies/jobnik',
              number: 64,
              title: 'feat: step 64',
              url: 'https://github.com/MapColonies/jobnik/pull/64',
              state: 'merged',
              isDraft: false,
              reviewDecision: 'approved',
              checkRollup: 'success',
            },
            {
              repo: 'MapColonies/jobnik',
              number: 65,
              title: 'feat: step 65',
              url: 'https://github.com/MapColonies/jobnik/pull/65',
              state: 'open',
              isDraft: false,
              reviewDecision: 'approved',
              checkRollup: 'success',
            },
            {
              repo: 'MapColonies/other',
              number: 66,
              title: 'feat: step 66',
              url: 'https://github.com/MapColonies/jobnik/pull/66',
              state: 'closed',
              isDraft: true,
              reviewDecision: 'approved',
              checkRollup: 'success',
            },
          ],
        });
      });

      it.each([
        ['CHANGES_REQUESTED', 'FAILURE', 'changesRequested', 'failure'],
        ['REVIEW_REQUIRED', 'PENDING', 'reviewRequired', 'pending'],
        ['REVIEW_REQUIRED', 'EXPECTED', 'reviewRequired', 'pending'],
        ['REVIEW_REQUIRED', 'ERROR', 'reviewRequired', 'failure'],
        [null, null, 'none', 'none'],
      ])('should read a sibling reviewed %s and checked %s as %s and %s', async function (reviewDecision, rollup, expectedReview, expectedChecks) {
        const commits = { nodes: [{ commit: { statusCheckRollup: rollup === null ? null : { state: rollup } } }] };
        const facts = await sweepOne(aPrNode(inStack(1, 1, [entry(1, 65, { reviewDecision, commits })])));

        expect(facts.stack?.entries[0]).toMatchObject({ reviewDecision: expectedReview, checkRollup: expectedChecks });
      });

      it('should report a PR with no Stack as having none', async function () {
        const facts = await sweepOne(aPrNode({ stack: null, stackEntry: null }));

        expect(facts.stack).toBeUndefined();
      });

      it('should read a PR whose response carries no stack fields as having none', async function () {
        const facts = await sweepOne(aPrNode());

        expect(facts.stack).toBeUndefined();
      });

      it('should leave out an entry whose PR comes back null, keeping the Stack size', async function () {
        const facts = await sweepOne(aPrNode(inStack(1, 3, [entry(1, 65), { position: 2, pullRequest: null }, entry(3, 67)])));

        expect(facts.stack?.entries.map((e) => e.number)).toStrictEqual([65, 67]);
        expect(facts.stack?.size).toBe(3);
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should keep the real size of a Stack longer than the entries it reads, and mark it cut short', async function () {
        const entries = Array.from({ length: 10 }, (_, index) => entry(index + 1, 60 + index));
        const facts = await sweepOne(aPrNode(inStack(1, 13, entries, true)));

        expect(facts.stack).toMatchObject({ size: 13, entriesTruncated: true });
        expect(facts.stack?.entries).toHaveLength(10);
        expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ truncated: ['stackEntries'] }));
      });
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
      await sweep(aProvider());

      expect(github.requests.every((request) => request.authorization === 'bearer ghp_test')).toBe(true);
      expect(github.restRequests).toEqual([]);
    });

    it('should authenticate as the App installation when an App is configured, rather than with the token', async function () {
      github.onRest('POST /app/installations/42/access_tokens', () => ({ token: 'ghs_installation', expires_at: '2099-01-01T00:00:00Z' }));

      await sweep(aProvider({ githubApp: { appId: 7, installationId: 42, privateKeyPath } }));

      expect(github.restRequests).toEqual([
        { route: 'POST /app/installations/42/access_tokens', authorization: expect.stringMatching(/^bearer ey/) as unknown },
      ]);
      expect(github.requests.every((request) => request.authorization === 'bearer ghs_installation')).toBe(true);
    });

    it('should fail the sweep with an authentication error when GitHub refuses the App', async function () {
      github.onRest('POST /app/installations/42/access_tokens', () =>
        Response.json({ message: 'A JSON web token could not be decoded' }, { status: 401 })
      );

      await expect(sweep(aProvider({ githubApp: { appId: 7, installationId: 42, privateKeyPath } }))).rejects.toEqual(
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

      await expect(sweep(aProvider())).rejects.toEqual(new SweepError(failure));
    });

    it('should fail the sweep with GitHub’s message when a query fails for another reason', async function () {
      github.on('Roster', () => ({ data: null, errors: [{ type: 'MAX_NODE_LIMIT_EXCEEDED', message: 'This query requests too many nodes' }] }));

      const swept = sweep(aProvider());

      await expect(swept).rejects.toThrow('This query requests too many nodes');
      await expect(swept).rejects.not.toBeInstanceOf(SweepError);
    });

    it('should fail the sweep when the org is not found', async function () {
      github.on('Roster', () => ({ data: { organization: null, rateLimit: aRateLimit() } }));

      await expect(sweep(aProvider())).rejects.toThrow('org MapColonies not found');
    });

    it('should leave out a PR that is gone by the time it is read', async function () {
      github.on('PullRequestDetails', () => ({
        data: { nodes: [aPrNode(), null], rateLimit: aRateLimit() },
        errors: [{ type: 'NOT_FOUND', path: ['nodes', 1], message: "Could not resolve to a node with the global id of 'PR_gone'" }],
      }));

      const prs = await aProvider().read(['PR_1', 'PR_gone']);

      expect(prs.map((pr) => pr.id)).toEqual(['PR_1']);
    });

    it.each<[string, () => unknown, SweepFailure]>([
      [
        'the network fails',
        () => {
          throw new TypeError('fetch failed');
        },
        'unreachable',
      ],
      ['the credentials are refused', () => Response.json({ message: 'Bad credentials' }, { status: 401 }), 'authentication'],
      ['too many requests are made', () => new Response('', { status: 429 }), 'rateLimit'],
    ])('should fail a read as %s, as it does discovery', async function (_, respond, failure) {
      github.on('PullRequestDetails', respond);

      await expect(aProvider().read(['PR_1'])).rejects.toEqual(new SweepError(failure));
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

      await sweep(aProvider());

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

      await expect(sweep(provider)).rejects.toEqual(new SweepError('rateLimit'));
      expect(github.requests.map((request) => request.operation)).toEqual(['Roster']);

      await expect(sweep(provider)).rejects.toEqual(new SweepError('rateLimit'));
      expect(github.requests).toHaveLength(1);

      vi.setSystemTime(new Date(resetAt));
      github.on('Roster', () => aRosterResponse([{ id: 'U_alice', login: 'alice' }], []));

      await expect(sweep(provider)).resolves.toBeDefined();
    });

    it('should not read PRs once discovery left fewer than 10% of the points', async function () {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T06:30:00Z') });
      // The search for requests to the Team is discovery's last query.
      github.on('SearchPullRequests', ({ variables }) => ({
        data: {
          ...(aSearchResponse(['PR_1']) as { data: object }).data,
          rateLimit: aRateLimit(String(variables.query).includes('team-review') ? { remaining: 499, resetAt } : {}),
        },
      }));
      const provider = aProvider();
      const { prs } = await provider.discover();

      await expect(provider.read(prs.map((pr) => pr.id))).rejects.toEqual(new SweepError('rateLimit'));
      expect(github.requestsFor('PullRequestDetails')).toEqual([]);
    });

    it('should keep querying while at least 10% of the points are left', async function () {
      github.on('Roster', () => ({
        data: { ...(aRosterResponse([{ id: 'U_alice', login: 'alice' }], []) as { data: object }).data, rateLimit: aRateLimit({ remaining: 500 }) },
      }));

      await expect(sweep(aProvider())).resolves.toBeDefined();
    });
  });

  describe('summary', function () {
    const durationMs = expect.any(Number) as unknown;

    it('should log how long discovery and the read each took, the points each spent and how many PRs each found or read', async function () {
      github
        .on('SearchPullRequests', () => aSearchResponse(['PR_1']))
        .on('PullRequestDetails', () => ({ data: { nodes: [aPrNode()], rateLimit: aRateLimit({ cost: 3 }) } }));

      await sweep(aProvider());

      // The roster and the three searches cost a point each.
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ msg: 'discovered PRs on GitHub', points: 4, prs: 1, durationMs }));
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ msg: 'read PRs from GitHub', points: 3, prs: 1, durationMs }));
    });

    it('should log the time, points and requests of each step of discovery and of the read', async function () {
      github
        .on('SearchPullRequests', () => aSearchResponse(['PR_1']))
        .on('PullRequestDetails', () => ({ data: { nodes: [aPrNode({ reviewThreads: { totalCount: 1 } })], rateLimit: aRateLimit({ cost: 3 }) } }));

      await sweep(aProvider());

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: {
            roster: { durationMs, points: 1, requests: 1 },
            search: { durationMs, points: 3, requests: 3 },
          },
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: {
            details: { durationMs, points: 3, requests: 1 },
            threads: { durationMs, points: 1, requests: 1 },
            reviewTeams: { durationMs, points: 0, requests: 0 },
          },
        })
      );
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

    it('should search the Team Repos, the Team Members and requests to the Team for open PRs, for a one-Team org', async function () {
      await sweep(aProvider());

      expect(searchQueries()).toEqual([
        'is:pr is:open (repo:MapColonies/config OR repo:MapColonies/opa-la)',
        'is:pr is:open org:MapColonies archived:false (author:alice OR assignee:alice OR reviewed-by:alice OR user-review-requested:alice OR author:bob OR assignee:bob OR reviewed-by:bob OR user-review-requested:bob)',
        'is:pr is:open org:MapColonies archived:false team-review-requested:MapColonies/infra',
      ]);
    });

    it('should search the union of every Team once, and discover a PR found through several Teams once', async function () {
      github.on('Roster', () =>
        aTeamsResponse([
          {
            slug: 'raster',
            name: 'Raster',
            members: [
              { id: 'U_bob', login: 'bob' },
              { id: 'U_dana', login: 'dana' },
            ],
            repos: [{ nameWithOwner: 'MapColonies/opa-la', isArchived: false }],
          },
          {
            slug: 'infra',
            name: 'Infra',
            members: [
              { id: 'U_alice', login: 'alice' },
              { id: 'U_bob', login: 'bob' },
            ],
            repos: [
              { nameWithOwner: 'MapColonies/opa-la', isArchived: false },
              { nameWithOwner: 'MapColonies/config', isArchived: false },
            ],
          },
        ])
      );
      github.on('SearchPullRequests', () => aSearchResponse(['PR_1']));

      const { discovery } = await sweep(aProvider());

      expect(searchQueries()).toEqual([
        'is:pr is:open (repo:MapColonies/config OR repo:MapColonies/opa-la)',
        'is:pr is:open org:MapColonies archived:false (author:alice OR assignee:alice OR reviewed-by:alice OR user-review-requested:alice OR author:bob OR assignee:bob OR reviewed-by:bob OR user-review-requested:bob OR author:dana OR assignee:dana OR reviewed-by:dana OR user-review-requested:dana)',
        'is:pr is:open org:MapColonies archived:false (team-review-requested:MapColonies/infra OR team-review-requested:MapColonies/raster)',
      ]);
      expect(discovery.prs.map(({ id }) => id)).toEqual(['PR_1']);
      expect(github.requestsFor('PullRequestDetails').flatMap((request) => requestedIds(request.variables))).toEqual(['PR_1']);
    });

    it('should discover the Roster and each PR found once, with when GitHub last saw it change, without reading it', async function () {
      github.on('SearchPullRequests', ({ variables }) =>
        aSearchResponse(
          String(variables.query).includes('team-review')
            ? [{ id: 'PR_2', updatedAt: '2026-10-14T10:00:00Z' }]
            : [
                { id: 'PR_1', updatedAt: '2026-10-13T09:00:00Z' },
                { id: 'PR_2', updatedAt: '2026-10-14T10:00:00Z' },
              ]
        )
      );

      const discovery = await aProvider().discover();

      expect(discovery).toEqual({
        teams: [
          {
            slug: 'infra',
            name: 'Infra',
            roster: {
              members: [
                { id: 'U_alice', login: 'alice', isBot: false },
                { id: 'U_bob', login: 'bob', isBot: false },
              ],
              repos: ['MapColonies/config', 'MapColonies/opa-la'],
            },
          },
        ],
        prs: [
          { id: 'PR_1', updatedAt: new Date('2026-10-13T09:00:00Z') },
          { id: 'PR_2', updatedAt: new Date('2026-10-14T10:00:00Z') },
        ],
      });
      expect(new Set(github.requests.map((request) => request.operation))).toEqual(new Set(['Roster', 'SearchPullRequests']));
    });

    it('should split a search over many Team Repos into queries of at most 50 repos', async function () {
      const repos = Array.from({ length: 60 }, (_, index) => ({
        nameWithOwner: `MapColonies/repo${String(index).padStart(2, '0')}`,
        isArchived: false,
      }));
      github.on('Roster', () => aRosterResponse([{ id: 'U_alice', login: 'alice' }], repos));

      await sweep(aProvider());

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
      const members = Array.from({ length: 13 }, (_, index) => ({ id: `U_${index}`, login: `member${String(index).padStart(2, '0')}` }));
      github.on('Roster', () => aRosterResponse(members, [{ nameWithOwner: 'MapColonies/opa-la', isArchived: false }]));

      await sweep(aProvider());

      const memberQueries = searchQueries().filter((query) => String(query).includes('author:'));

      expect(memberQueries).toHaveLength(2);
      expect(memberQueries[0]).toContain('user-review-requested:member11)');
      expect(memberQueries[1]).toBe(
        'is:pr is:open org:MapColonies archived:false (author:member12 OR assignee:member12 OR reviewed-by:member12 OR user-review-requested:member12)'
      );
    });

    it('should read the details, threads and teams of only the PRs it is given, 50 PRs at a time', async function () {
      const ids = Array.from({ length: 51 }, (_, index) => `PR_${index}`);
      const teamRequest = {
        pageInfo: { hasNextPage: false },
        nodes: [{ asCodeOwner: false, requestedReviewer: { __typename: 'Team', slug: 'infra' } }],
      };
      const reviews = {
        pageInfo: { hasPreviousPage: false },
        nodes: [{ id: 'PRR_1', state: 'APPROVED', submittedAt: '2026-10-13T08:00:00Z', author: null, commit: { oid: 'c0ffee' } }],
      };
      github.on('PullRequestDetails', ({ variables }) =>
        aNodesResponse(
          (variables.ids as string[]).map((id) => aPrNode({ id, reviewThreads: { totalCount: 1 }, reviewRequests: teamRequest, reviews }))
        )
      );

      const prs = await aProvider().read(ids);

      expect(github.requests.map((request) => request.operation)).not.toContain('SearchPullRequests');

      for (const operation of ['PullRequestDetails', 'ReviewThreads', 'ReviewTeams']) {
        expect(github.requestsFor(operation).map((request) => requestedIds(request.variables))).toEqual([ids.slice(0, 50), ids.slice(50)]);
      }

      expect(prs.map((pr) => pr.id)).toEqual(ids);
    });

    it('should warn when a search nears its cap of 1,000 results', async function () {
      github.on('SearchPullRequests', ({ variables }) => aSearchResponse([], { issueCount: String(variables.query).includes('repo:') ? 801 : 800 }));

      await sweep(aProvider());

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ query: expect.stringContaining('repo:') as unknown, results: 801 })
      );
    });

    it('should search the halves of a batch whose search reports more than 1,000 results', async function () {
      github.on('Roster', () =>
        aRosterResponse(
          [
            { id: 'U_alice', login: 'alice' },
            { id: 'U_bob', login: 'bob' },
          ],
          []
        )
      );
      github.on('SearchPullRequests', ({ variables }) => {
        const query = String(variables.query);
        if (query.includes('alice') && query.includes('bob')) {
          return aSearchResponse(['PR_1'], { issueCount: 1001 });
        }
        return aSearchResponse([query.includes('alice') ? 'PR_alice' : 'PR_bob', 'PR_1'], { issueCount: 2 });
      });

      await sweep(aProvider());

      expect(
        github
          .requestsFor('PullRequestDetails')
          .flatMap((request) => requestedIds(request.variables))
          .sort()
      ).toEqual(['PR_1', 'PR_alice', 'PR_bob']);
      expect(github.requestsFor('SearchPullRequests')).toHaveLength(4);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should keep splitting a half that is itself over the cap', async function () {
      github.on('Roster', () =>
        aRosterResponse(
          [
            { id: 'U_alice', login: 'alice' },
            { id: 'U_bob', login: 'bob' },
            { id: 'U_carol', login: 'carol' },
          ],
          []
        )
      );
      github.on('SearchPullRequests', ({ variables }) => {
        const query = String(variables.query);
        const people = ['alice', 'bob', 'carol'].filter((login) => query.includes(`author:${login}`));
        return people.length > 1 ? aSearchResponse([], { issueCount: 1001 }) : aSearchResponse(people.map((login) => `PR_${login}`));
      });

      await sweep(aProvider());

      expect(
        github
          .requestsFor('PullRequestDetails')
          .flatMap((request) => requestedIds(request.variables))
          .sort()
      ).toEqual(['PR_alice', 'PR_bob', 'PR_carol']);
      expect(github.requestsFor('SearchPullRequests')).toHaveLength(6);
    });

    it('should warn and keep the results of a single-term search over the cap', async function () {
      github.on('SearchPullRequests', ({ variables }) =>
        String(variables.query).includes('repo:MapColonies/opa-la') ? aSearchResponse(['PR_1'], { issueCount: 1001 }) : aSearchResponse([])
      );

      await sweep(aProvider());

      expect(github.requestsFor('PullRequestDetails').flatMap((request) => requestedIds(request.variables))).toEqual(['PR_1']);
      expect(github.requestsFor('SearchPullRequests')).toHaveLength(5);
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ query: 'is:pr is:open repo:MapColonies/opa-la', results: 1001 }));
    });

    it('should read every page of a search', async function () {
      github.on('SearchPullRequests', ({ variables }) =>
        variables.after === null ? aSearchResponse(['PR_1'], { issueCount: 2, endCursor: 'cursor1' }) : aSearchResponse(['PR_2'], { issueCount: 2 })
      );

      await sweep(aProvider());

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
