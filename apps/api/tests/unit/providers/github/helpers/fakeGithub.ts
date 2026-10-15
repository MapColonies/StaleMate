/* eslint-disable @typescript-eslint/naming-convention -- GraphQL's field names */
import type { Logger } from '@map-colonies/js-logger';
import { vi } from 'vitest';

export interface GraphqlRequest {
  operation: string;
  variables: Record<string, unknown>;
  authorization: string | null;
}

/** Answers one GraphQL request with a response body, a Response, or by throwing as fetch does when the network fails. */
export type GraphqlHandler = (request: GraphqlRequest) => unknown;

/** Serves GitHub's GraphQL endpoint from a handler per operation, and records every request it got. */
export class FakeGithub {
  public readonly requests: GraphqlRequest[] = [];
  public readonly restRequests: { route: string; authorization: string | null }[] = [];
  private readonly handlers = new Map<string, GraphqlHandler>();
  private readonly restHandlers = new Map<string, (init: RequestInit | undefined) => unknown>();

  public on(operation: string, handler: GraphqlHandler): this {
    this.handlers.set(operation, handler);
    return this;
  }

  public readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname !== '/graphql') {
      return this.restFetch(`${init?.method ?? 'GET'} ${url.pathname}`, init);
    }
    const body = JSON.parse(init?.body as string) as { query: string; variables?: Record<string, unknown> };
    const operation = /^\s*query\s+(\w+)/.exec(body.query)?.[1] ?? 'anonymous';
    const request = { operation, variables: body.variables ?? {}, authorization: new Headers(init?.headers).get('authorization') };
    this.requests.push(request);
    const handler = this.handlers.get(operation);
    if (handler === undefined) {
      throw new Error(`no handler for ${operation}`);
    }
    const response = await handler(request);
    return response instanceof Response ? response : Response.json(response);
  };

  /** Answers a REST request, such as for an App installation token, by its method and path. */
  public onRest(route: string, handler: (init: RequestInit | undefined) => unknown): this {
    this.restHandlers.set(route, handler);
    return this;
  }

  public requestsFor(operation: string): GraphqlRequest[] {
    return this.requests.filter((request) => request.operation === operation);
  }

  private async restFetch(route: string, init: RequestInit | undefined): Promise<Response> {
    this.restRequests.push({ route, authorization: new Headers(init?.headers).get('authorization') });
    const handler = this.restHandlers.get(route);
    if (handler === undefined) {
      throw new Error(`no handler for ${route}`);
    }
    const response = await handler(init);
    return response instanceof Response ? response : Response.json(response);
  }
}

export function aRateLimit(overrides: Partial<{ cost: number; remaining: number; limit: number; resetAt: string }> = {}): object {
  return { cost: 1, remaining: 4900, limit: 5000, resetAt: '2026-10-15T07:00:00Z', ...overrides };
}

export function aRosterResponse(members: { id: string; login: string }[], repos: { nameWithOwner: string; isArchived: boolean }[]): object {
  return {
    data: {
      organization: {
        team: {
          members: { pageInfo: { hasNextPage: false }, nodes: members.map((member) => ({ __typename: 'User', ...member })) },
          repositories: { pageInfo: { hasNextPage: false }, nodes: repos },
        },
      },
      rateLimit: aRateLimit(),
    },
  };
}

export function aSearchResponse(ids: string[], options: { issueCount?: number; endCursor?: string | null } = {}): object {
  const { issueCount = ids.length, endCursor = null } = options;
  return {
    data: {
      search: { issueCount, pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes: ids.map((id) => ({ id })) },
      rateLimit: aRateLimit(),
    },
  };
}

/** A PullRequest node as the details query reads it: an open PR by alice, with passing checks and nothing else on it. */
export function aPrNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'PR_1',
    number: 1,
    title: 'feat: add retry policy to job polling',
    url: 'https://github.com/MapColonies/opa-la/pull/1',
    isDraft: false,
    createdAt: '2026-10-12T08:00:00Z',
    mergeable: 'MERGEABLE',
    repository: { nameWithOwner: 'MapColonies/opa-la' },
    author: { __typename: 'User', id: 'U_alice', login: 'alice' },
    assignees: { pageInfo: { hasNextPage: false }, nodes: [] },
    commits: {
      nodes: [
        {
          commit: {
            oid: 'c0ffee',
            committedDate: '2026-10-12T07:59:00Z',
            checkSuites: { nodes: [{ createdAt: '2026-10-12T07:59:07Z' }] },
            statusCheckRollup: { state: 'SUCCESS', contexts: { pageInfo: { hasNextPage: false }, nodes: [] } },
          },
        },
      ],
    },
    reviews: { pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewRequests: { pageInfo: { hasNextPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0 },
    timelineItems: { pageInfo: { hasNextPage: false }, nodes: [] },
    ...overrides,
  };
}

export function aNodesResponse(nodes: unknown[]): object {
  return { data: { nodes, rateLimit: aRateLimit() } };
}

/** Serves an empty Team of alice and the opa-la repo, and empty search results, so a test overrides only what it is about. */
export function anEmptyGithub(): FakeGithub {
  return new FakeGithub()
    .on('Roster', () => aRosterResponse([{ id: 'U_alice', login: 'alice' }], [{ nameWithOwner: 'MapColonies/opa-la', isArchived: false }]))
    .on('SearchPullRequests', () => aSearchResponse([]))
    .on('PullRequestDetails', () => aNodesResponse([]))
    .on('ReviewThreads', ({ variables }) =>
      aNodesResponse((variables.ids as string[]).map((id) => ({ id, reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] } })))
    )
    .on('ReviewTeams', ({ variables }) => aNodesResponse((variables.ids as string[]).map((id) => ({ id, reviews: { nodes: [] } }))));
}

/** A Logger whose every method is a spy, so a test can assert what was logged. */
export function aSpyLogger(): Logger & Record<'info' | 'warn' | 'error' | 'debug', ReturnType<typeof vi.fn>> {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() };
  return logger as unknown as Logger & typeof logger;
}
