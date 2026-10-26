import type { Logger } from '@map-colonies/js-logger';
import type { PrFacts, WatchedTeam } from '@domain/facts';
import type { SyncMetrics } from '../../sync/syncMetrics';
import type { DiscoveredPr, Discovery, PrProvider } from '../prProvider';
import { createGetToken, type GithubAuthConfig } from './auth';
import { GraphqlClient } from './graphqlClient';
import {
  DETAILS_QUERY,
  type NodesData,
  type PerPrData,
  type PerPrQuery,
  type PullRequestNode,
  type ReviewTeamsNode,
  reviewTeamsQuery,
  ROSTER_QUERY,
  type RosterData,
  SEARCH_QUERY,
  type SearchData,
  type SizedRead,
  type ThreadsNode,
  threadsQuery,
} from './queries';
import { toActor, toPrFacts, toReviewTeams, toReviewThreads, truncatedConnections, whichTruncated } from './toFacts';

/** The org whose PRs StaleMate tracks. */
const ORG = 'MapColonies';

/** GitHub accepted 100 OR-ed qualifiers in one advanced search in 2026-10, so this leaves headroom. */
const MAX_SEARCH_TERMS = 50;

/** A search returns at most 1,000 results. */
const SEARCH_RESULTS_CAP = 1000;

const HALVES = 2;

/** A search this near the cap is warned about early. */
const SEARCH_RESULTS_WARNING = 800;

/** GitHub kills a call that takes over 10 s, and 50 PRs take about 5 s. */
const DEFAULT_BATCH_SIZE = 50;

/** The most items GitHub returns from a connection at once. */
const MAX_PAGE_SIZE = 100;

/** How many more items than the details query counted a follow-up asks for, so items that turn up in between aren't lost. */
const SIZE_HEADROOM = 5;

function sizedRead(id: string, count: number): SizedRead {
  return { id, size: Math.min(count + SIZE_HEADROOM, MAX_PAGE_SIZE) };
}

/** A search for PRs matching any of the groups of qualifiers; a group is never split across searches, so it is the smallest a search can get. */
interface SearchBatch {
  base: string;
  groups: string[][];
}

function queryOf({ base, groups }: SearchBatch): string {
  const terms = groups.flat();
  return terms.length === 1 ? `${base} ${terms[0]}` : `${base} (${terms.join(' OR ')})`;
}

/**
 * Builds the searches that find PRs matching any of the groups of qualifiers, each group kept in one search.
 * In advanced search a bare space between qualifiers means AND, so they are joined by OR.
 */
function anyOf(base: string, qualifierGroups: readonly string[][]): SearchBatch[] {
  const batches: SearchBatch[] = [];
  let groups: string[][] = [];
  let termCount = 0;
  const flush = (): void => {
    if (groups.length > 0) {
      batches.push({ base, groups });
      groups = [];
      termCount = 0;
    }
  };
  for (const qualifiers of qualifierGroups) {
    if (termCount + qualifiers.length > MAX_SEARCH_TERMS) {
      flush();
    }
    groups.push(qualifiers);
    termCount += qualifiers.length;
  }
  flush();
  return batches;
}

function compare(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

/** The distinct values, sorted. */
function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compare);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

interface StepCost {
  durationMs: number;
  points: number;
  requests: number;
}

/** Records how long each step of an operation took, and the points and requests it spent. */
class StepCosts {
  public readonly steps: Record<string, StepCost> = {};

  public constructor(private readonly client: GraphqlClient) {}

  public async measure<T>(step: string, run: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    const { pointsSpent, requestsSent } = this.client;
    const result = await run();
    this.steps[step] = {
      durationMs: Math.round(performance.now() - startedAt),
      points: this.client.pointsSpent - pointsSpent,
      requests: this.client.requestsSent - requestsSent,
    };
    return result;
  }
}

/** Discovers every watched Team and its Tracked PRs on GitHub, and reads chosen PRs, through GraphQL. */
class GithubPrProvider implements PrProvider {
  public constructor(
    private readonly client: GraphqlClient,
    private readonly excludedTeams: ReadonlySet<string>,
    private readonly logger: Logger,
    private readonly batchSize: number
  ) {}

  public async discover(): Promise<Discovery> {
    return this.logged('discovered PRs on GitHub', async (costs) => {
      const teams = await costs.measure('roster', async () => this.readTeams());
      const prs = await costs.measure('search', async () => this.searchTracked(teams));
      return { result: { teams, prs }, prs: prs.length };
    });
  }

  public async read(ids: readonly string[]): Promise<PrFacts[]> {
    return this.logged('read PRs from GitHub', async (costs) => {
      const prs = await this.readDetails(ids, costs);
      return { result: prs, prs: prs.length };
    });
  }

  /** Runs one operation, then logs how long it took, the points it spent, how many PRs it found or read, and the cost of each step. */
  private async logged<T>(msg: string, run: (costs: StepCosts) => Promise<{ result: T; prs: number }>): Promise<T> {
    const startedAt = performance.now();
    const pointsBefore = this.client.pointsSpent;
    const costs = new StepCosts(this.client);
    const { result, prs } = await run(costs);
    this.logger.info({
      msg,
      durationMs: Math.round(performance.now() - startedAt),
      points: this.client.pointsSpent - pointsBefore,
      prs,
      steps: costs.steps,
    });
    return result;
  }

  /** Reads the PRs, then the threads and review teams of the PRs that have them. */
  private async readDetails(ids: readonly string[], costs: StepCosts): Promise<PrFacts[]> {
    const nodes = await costs.measure('details', async () => this.readNodes<PullRequestNode>(DETAILS_QUERY, ids));
    const prs = nodes.map(toPrFacts);

    const withThreads = nodes.filter((node) => node.reviewThreads.totalCount > 0).map((node) => sizedRead(node.id, node.reviewThreads.totalCount));
    const threadNodes = new Map(
      (await costs.measure('threads', async () => this.readPerPr<ThreadsNode>(threadsQuery, withThreads))).map((node) => [node.id, node])
    );

    const askingTeams = prs
      .filter((pr) => pr.reviews.length > 0 && pr.reviewRequests.some((request) => request.type === 'team'))
      .map((pr) => sizedRead(pr.id, pr.reviews.length));
    const reviewTeams = new Map(
      (await costs.measure('reviewTeams', async () => this.readPerPr<ReviewTeamsNode>(reviewTeamsQuery, askingTeams))).map((node) => [
        node.id,
        toReviewTeams(node),
      ])
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

  /** Reads PRs in batches through a per-PR query, as readNodes does. */
  private async readPerPr<T>(buildQuery: (reads: readonly SizedRead[]) => PerPrQuery, reads: readonly SizedRead[]): Promise<T[]> {
    const nodes: T[] = [];
    for (const batch of chunk(reads, this.batchSize)) {
      const { document, variables } = buildQuery(batch);
      const data = await this.client.query<PerPrData<T>>(document, variables);
      nodes.push(...batch.flatMap((_, index) => data[`pr${index}`] ?? []));
    }
    return nodes;
  }

  /** Searches over the union of every watched Team: its repos, its members' four terms, and requests to any of the Teams. */
  private async searchTracked(teams: readonly WatchedTeam[]): Promise<DiscoveredPr[]> {
    const open = 'is:pr is:open';
    const inLiveOrgRepos = `${open} org:${ORG} archived:false`;
    const repos = unique(teams.flatMap((team) => team.roster.repos));
    const members = uniqueBy(
      teams.flatMap((team) => team.roster.members),
      ({ id }) => id
    ).sort((a, b) => compare(a.login, b.login));
    const batches: SearchBatch[] = [
      ...anyOf(
        open,
        repos.map((repo) => [`repo:${repo}`])
      ),
      ...anyOf(
        inLiveOrgRepos,
        members.map(({ login }) => [`author:${login}`, `assignee:${login}`, `reviewed-by:${login}`, `user-review-requested:${login}`])
      ),
      ...anyOf(
        inLiveOrgRepos,
        teams.map(({ slug }) => [`team-review-requested:${ORG}/${slug}`])
      ),
    ];
    // A PR found by several searches is discovered once.
    const prs = new Map<string, DiscoveredPr>();
    for (const batch of batches) {
      for (const pr of await this.searchBatch(batch)) {
        prs.set(pr.id, pr);
      }
    }
    return [...prs.values()];
  }

  /** Searches the batch, or its halves when GitHub reports more results than it will return, so no PR is lost to the cap. */
  private async searchBatch(batch: SearchBatch): Promise<DiscoveredPr[]> {
    const query = queryOf(batch);
    const { prs, issueCount } = await this.search(query);
    if (issueCount <= SEARCH_RESULTS_CAP) {
      return prs;
    }
    if (batch.groups.length === 1) {
      this.logger.warn({ msg: 'search exceeds its cap of 1,000 results and cannot be split, so PRs past it are missed', query, results: issueCount });
      return prs;
    }
    const middle = Math.ceil(batch.groups.length / HALVES);
    const halves = [batch.groups.slice(0, middle), batch.groups.slice(middle)];
    const found = new Map<string, DiscoveredPr>();
    for (const groups of halves) {
      for (const pr of await this.searchBatch({ base: batch.base, groups })) {
        found.set(pr.id, pr);
      }
    }
    return [...found.values()];
  }

  private async search(query: string): Promise<{ prs: DiscoveredPr[]; issueCount: number }> {
    const prs: DiscoveredPr[] = [];
    let issueCount = 0;
    let after: string | null = null;
    do {
      const { search }: SearchData = await this.client.query<SearchData>(SEARCH_QUERY, { query, after });
      if (after === null) {
        issueCount = search.issueCount;
        if (issueCount > SEARCH_RESULTS_WARNING && issueCount <= SEARCH_RESULTS_CAP) {
          this.logger.warn({ msg: 'search nears its cap of 1,000 results, so PRs past it would be missed', query, results: issueCount });
        }
      }
      prs.push(
        ...search.nodes.flatMap(({ id, updatedAt }) => (id === undefined || updatedAt === undefined ? [] : [{ id, updatedAt: new Date(updatedAt) }]))
      );
      after = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null;
    } while (after !== null);
    return { prs, issueCount };
  }

  /** Reads every Team in the org but the excluded ones, in a stable order. */
  private async readTeams(): Promise<WatchedTeam[]> {
    const data = await this.client.query<RosterData>(ROSTER_QUERY, { org: ORG });
    if (!data.organization) {
      throw new Error(`org ${ORG} not found`);
    }
    const { teams } = data.organization;
    this.warnIfTruncated(whichTruncated({ teams: teams.pageInfo.hasNextPage }), { org: ORG });
    return teams.nodes
      .filter((team) => !this.excludedTeams.has(team.slug))
      .map((team) => {
        this.warnIfTruncated(whichTruncated({ members: team.members.pageInfo.hasNextPage, repositories: team.repositories.pageInfo.hasNextPage }), {
          team: team.slug,
        });
        return {
          slug: team.slug,
          name: team.name,
          roster: {
            members: team.members.nodes.map(toActor).sort((a, b) => compare(a.login, b.login)),
            repos: unique(team.repositories.nodes.filter((repo) => !repo.isArchived).map((repo) => repo.nameWithOwner)),
          },
        };
      })
      .sort((a, b) => compare(a.slug, b.slug));
  }
}

export interface GithubPrProviderOptions extends GithubAuthConfig {
  /** Slugs of Teams to leave out. */
  excludedTeams?: readonly string[];
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
  return new GithubPrProvider(client, new Set(options.excludedTeams ?? []), options.logger, options.batchSize ?? DEFAULT_BATCH_SIZE);
}
