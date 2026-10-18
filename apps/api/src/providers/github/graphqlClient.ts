import { StatusCodes } from 'http-status-codes';
import { SweepError } from '../prProvider';

const GRAPHQL_URL = 'https://api.github.com/graphql';

/** Below this share of the budget the client stops querying until it resets, leaving the rest for anything else on the same budget. */
const RESERVED_SHARE = 0.1;

interface GraphqlResponse<T> {
  data?: (T & { rateLimit?: RateLimit | null }) | null;
  errors?: { type?: string; message: string }[];
}

/** Tells a rate limit from refused credentials, since GitHub answers both with a 403. */
function toHttpError(response: Response): Error {
  const { headers } = response;
  const status: StatusCodes = response.status;
  if (
    status === StatusCodes.TOO_MANY_REQUESTS ||
    (status === StatusCodes.FORBIDDEN && (headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after')))
  ) {
    return new SweepError('rateLimit');
  }
  if (status === StatusCodes.UNAUTHORIZED || status === StatusCodes.FORBIDDEN) {
    return new SweepError('authentication');
  }
  if (status >= StatusCodes.INTERNAL_SERVER_ERROR) {
    return new SweepError('unreachable');
  }
  return new Error(`GitHub GraphQL responded ${status}`);
}

/** The rateLimit every query reads, so the client sees the budget on every call. */
export interface RateLimit {
  cost: number;
  remaining: number;
  limit: number;
  resetAt: string;
}

export type GetToken = () => Promise<string>;

export interface GraphqlClientOptions {
  getToken: GetToken;
  fetch: typeof fetch;
  /** Called with the rateLimit of every response. */
  onRateLimit: (rateLimit: RateLimit) => void;
}

/** Sends GraphQL queries to GitHub. Rejects with a SweepError when it can tell why a query failed. */
export class GraphqlClient {
  /** The points every query so far has cost. */
  public pointsSpent = 0;
  /** How many queries were sent so far. */
  public requestsSent = 0;
  private lastRateLimit: RateLimit | undefined;

  public constructor(private readonly options: GraphqlClientOptions) {}

  /** Rejects with a SweepError('rateLimit') without querying while the budget is low. */
  public async query<T>(document: string, variables: Record<string, unknown>): Promise<T> {
    if (this.isBudgetLow()) {
      throw new SweepError('rateLimit');
    }
    const token = await this.options.getToken();
    let response: Response;
    this.requestsSent++;
    try {
      response = await this.options.fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'stalemate' },
        body: JSON.stringify({ query: document, variables }),
      });
    } catch (error) {
      throw new SweepError('unreachable', { cause: error });
    }
    if (!response.ok) {
      throw toHttpError(response);
    }

    const body = (await response.json()) as GraphqlResponse<T>;
    const errors = body.errors ?? [];
    if (errors.some((error) => error.type === 'RATE_LIMITED')) {
      throw new SweepError('rateLimit', { cause: errors });
    }
    // A node that is gone is reported as NOT_FOUND next to the data, with the node null.
    if (!body.data || errors.some((error) => error.type !== 'NOT_FOUND')) {
      throw new Error(`GitHub GraphQL query failed: ${errors.map((error) => error.message).join('; ')}`, { cause: errors });
    }

    const { rateLimit } = body.data;
    if (rateLimit) {
      this.pointsSpent += rateLimit.cost;
      this.lastRateLimit = rateLimit;
      this.options.onRateLimit(rateLimit);
    }
    return body.data;
  }

  private isBudgetLow(): boolean {
    const rateLimit = this.lastRateLimit;
    return rateLimit !== undefined && rateLimit.remaining < rateLimit.limit * RESERVED_SHARE && Date.now() < new Date(rateLimit.resetAt).getTime();
  }
}
