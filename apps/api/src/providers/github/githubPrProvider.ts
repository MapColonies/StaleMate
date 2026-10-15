import type { Logger } from '@map-colonies/js-logger';
import type { PrFacts, Roster } from '@domain/facts';
import type { SyncMetrics } from '../../sync/syncMetrics';
import type { PrProvider, SweepResult } from '../prProvider';
import { createGetToken, type GithubAuthConfig } from './auth';
import { GraphqlClient } from './graphqlClient';
import {
  DETAILS_QUERY,
  type NodesData,
  type PullRequestNode,
  REVIEW_TEAMS_QUERY,
  type ReviewTeamsNode,
  ROSTER_QUERY,
  type RosterData,
  SEARCH_QUERY,
  type SearchData,
  THREADS_QUERY,
  type ThreadsNode,
} from './queries';
import { toActor, toPrFacts, toReviewTeams, toReviewThreads, truncatedConnections, whichTruncated } from './toFacts';

/** The org whose PRs StaleMate tracks. */
const ORG = 'MapColonies';

/** GitHub accepted 100 OR-ed qualifiers in one advanced search in 2026-10, so this leaves headroom. */
const MAX_SEARCH_TERMS = 50;

/** A search returns at most 1,000 results. */
const SEARCH_RESULTS_WARNING = 800;

/** GitHub kills a call that takes over 10 s, and 50 PRs take about 5 s. */
const DEFAULT_BATCH_SIZE = 50;

/**
 * Builds the searches that find PRs matching any of the groups of qualifiers, each group kept in one search.
 * In advanced search a bare space between qualifiers means AND, so they are joined by OR.
 */
function anyOf(base: string, qualifierGroups: readonly string[][]): string[] {
  const queries: string[] = [];
  let terms: string[] = [];
  const flush = (): void => {
    if (terms.length > 0) {
      queries.push(`${base} (${terms.join(' OR ')})`);
      terms = [];
    }
  };
  for (const qualifiers of qualifierGroups) {
    if (terms.length + qualifiers.length > MAX_SEARCH_TERMS) {
      flush();
    }
    terms.push(...qualifiers);
  }
  flush();
  return queries;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

/** Reads the Team and its Tracked PRs from GitHub in one full GraphQL sweep. */
class GithubPrProvider implements PrProvider {
  public constructor(
    private readonly client: GraphqlClient,
    private readonly teamSlug: string,
    private readonly logger: Logger,
    private readonly batchSize: number
  ) {}

  public async sweep(): Promise<SweepResult> {
    const startedAt = performance.now();
    const pointsBefore = this.client.pointsSpent;
    const roster = await this.readRoster();
    const ids = await this.discover(roster);
    const prs = await this.readDetails(ids);
    this.logger.info({
      msg: 'swept GitHub',
      durationMs: Math.round(performance.now() - startedAt),
      points: this.client.pointsSpent - pointsBefore,
      prs: prs.length,
    });
    return { roster, prs };
  }

  /** Reads the PRs, then the threads and review teams of the PRs that have them. */
  private async readDetails(ids: readonly string[]): Promise<PrFacts[]> {
    const nodes = await this.readNodes<PullRequestNode>(DETAILS_QUERY, ids);
    const prs = nodes.map(toPrFacts);

    const withThreads = nodes.filter((node) => node.reviewThreads.totalCount > 0).map((node) => node.id);
    const threadNodes = new Map((await this.readNodes<ThreadsNode>(THREADS_QUERY, withThreads)).map((node) => [node.id, node]));

    const askingTeams = prs.filter((pr) => pr.reviewRequests.some((request) => request.type === 'team')).map((pr) => pr.id);
    const reviewTeams = new Map(
      (await this.readNodes<ReviewTeamsNode>(REVIEW_TEAMS_QUERY, askingTeams)).map((node) => [node.id, toReviewTeams(node)])
    );

    for (const node of nodes) {
      this.warnIfTruncated(truncatedConnections(node, threadNodes.get(node.id)), { url: node.url });
    }
    return prs.map((pr) => ({
      ...pr,
      reviewThreads: toReviewThreads(threadNodes.get(pr.id)),
      reviews: pr.reviews.map((review) => ({ ...review, onBehalfOf: reviewTeams.get(pr.id)?.get(review.id) ?? [] })),
    }));
  }

  /** The connections are sized well past what MapColonies holds, so outgrowing one is worth a look. */
  private warnIfTruncated(truncated: string[], context: Record<string, unknown>): void {
    if (truncated.length > 0) {
      this.logger.warn({ msg: 'read only part of a connection, so some facts may be off', ...context, truncated });
    }
  }

  /** Reads nodes in batches, one batch at a time, as GitHub asks of API clients. A node that is gone is left out. */
  private async readNodes<T>(document: string, ids: readonly string[]): Promise<T[]> {
    const nodes: T[] = [];
    for (const batch of chunk(ids, this.batchSize)) {
      const data = await this.client.query<NodesData<T>>(document, { ids: batch });
      nodes.push(...data.nodes.filter((node) => node !== null));
    }
    return nodes;
  }

  /** Finds the open PRs in the Team Repos, those a Team Member is involved in, and those that ask the Team for review. */
  private async discover(roster: Roster): Promise<string[]> {
    const open = 'is:pr is:open';
    const inLiveOrgRepos = `${open} org:${ORG} archived:false`;
    const queries = [
      ...anyOf(
        open,
        roster.repos.map((repo) => [`repo:${repo}`])
      ),
      ...anyOf(
        inLiveOrgRepos,
        roster.members.map(({ login }) => [`author:${login}`, `assignee:${login}`, `reviewed-by:${login}`, `user-review-requested:${login}`])
      ),
      `${inLiveOrgRepos} team-review-requested:${ORG}/${this.teamSlug}`,
    ];
    // A PR found by several searches is read once.
    const ids = new Set<string>();
    for (const query of queries) {
      for (const id of await this.search(query)) {
        ids.add(id);
      }
    }
    return [...ids];
  }

  private async search(query: string): Promise<string[]> {
    const ids: string[] = [];
    let after: string | null = null;
    do {
      const { search }: SearchData = await this.client.query<SearchData>(SEARCH_QUERY, { query, after });
      if (after === null && search.issueCount > SEARCH_RESULTS_WARNING) {
        this.logger.warn({ msg: 'search nears its cap of 1,000 results, so PRs past it would be missed', query, results: search.issueCount });
      }
      ids.push(...search.nodes.flatMap((node) => (node.id === undefined ? [] : [node.id])));
      after = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null;
    } while (after !== null);
    return ids;
  }

  private async readRoster(): Promise<Roster> {
    const data = await this.client.query<RosterData>(ROSTER_QUERY, {
      org: ORG,
      team: this.teamSlug,
    });
    const team = data.organization?.team;
    if (!team) {
      throw new Error(`team ${ORG}/${this.teamSlug} not found`);
    }
    this.warnIfTruncated(whichTruncated({ members: team.members.pageInfo.hasNextPage, repositories: team.repositories.pageInfo.hasNextPage }), {
      team: this.teamSlug,
    });
    return {
      members: team.members.nodes.map(toActor),
      repos: team.repositories.nodes.filter((repo) => !repo.isArchived).map((repo) => repo.nameWithOwner),
    };
  }
}

export interface GithubPrProviderOptions extends GithubAuthConfig {
  teamSlug: string;
  logger: Logger;
  metrics: Pick<SyncMetrics, 'graphqlPointsRemaining'>;
  fetch?: typeof fetch;
  /** How many PRs each details query reads. */
  batchSize?: number;
}

export function createGithubPrProvider(options: GithubPrProviderOptions): PrProvider {
  const fetchImpl = options.fetch ?? fetch;
  const client = new GraphqlClient({
    getToken: createGetToken(options, fetchImpl),
    fetch: fetchImpl,
    onRateLimit: (rateLimit): void => options.metrics.graphqlPointsRemaining.set(rateLimit.remaining),
  });
  return new GithubPrProvider(client, options.teamSlug, options.logger, options.batchSize ?? DEFAULT_BATCH_SIZE);
}
