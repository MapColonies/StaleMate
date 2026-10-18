// The GraphQL documents of a sweep. Every one reads rateLimit, so the client sees the budget on every call.
/* eslint-disable @typescript-eslint/naming-convention -- GraphQL's field names */

const RATE_LIMIT = 'rateLimit { cost remaining limit resetAt }';

// Every actor reads its type, so GitHub's Bots are told apart by type and id, never by login.
const ACTOR = '__typename login ... on Node { id }';
const REVIEWER = `__typename ... on User { id login } ... on Bot { id login } ... on Mannequin { id login } ... on Team { slug }`;

interface Page<T> {
  pageInfo: { hasNextPage: boolean };
  nodes: T[];
}

interface TimelineActorEvent {
  __typename: 'ReadyForReviewEvent' | 'ConvertToDraftEvent';
  createdAt: string;
  actor: ActorNode | null;
}

/**
 * GitHub charges a query for the items it asks for, not for those it gets, and charges a connection nested in a list once
 * per item of that list. So rather than ask every PR of a batch for a connection's worth, each PR is read under its own
 * alias and asked for only about as many items as the details query found it has.
 */
function perPrQuery(operation: string, sizeVariable: string, selection: (size: string) => string): (reads: readonly SizedRead[]) => PerPrQuery {
  return (reads) => {
    const variables: Record<string, string | number> = {};
    const declarations: string[] = [];
    const fields = reads.map(({ id, size }, index) => {
      variables[`id${index}`] = id;
      variables[`${sizeVariable}${index}`] = size;
      declarations.push(`$id${index}: ID!, $${sizeVariable}${index}: Int!`);
      return `pr${index}: node(id: $id${index}) { ... on PullRequest { id ${selection(`$${sizeVariable}${index}`)} } }`;
    });
    return { document: `query ${operation}(${declarations.join(', ')}) {\n  ${fields.join('\n  ')}\n  ${RATE_LIMIT}\n}`, variables };
  };
}

export const ROSTER_QUERY = `query Roster($org: String!, $team: String!) {
  organization(login: $org) {
    team(slug: $team) {
      members(first: 100, membership: ALL) { pageInfo { hasNextPage } nodes { __typename id login } }
      repositories(first: 100) { pageInfo { hasNextPage } nodes { nameWithOwner isArchived } }
    }
  }
  ${RATE_LIMIT}
}`;

/** Finds PRs by id only. The details come from nodes(ids:), which is far cheaper than reading them through search. */
export const SEARCH_QUERY = `query SearchPullRequests($query: String!, $after: String) {
  search(type: ISSUE_ADVANCED, query: $query, first: 100, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { id } }
  }
  ${RATE_LIMIT}
}`;

export interface SearchData {
  search: {
    issueCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: { id?: string }[];
  };
}

export interface ActorNode {
  __typename: string;
  id: string;
  login: string;
}

export interface RosterData {
  organization: {
    team: {
      members: Page<ActorNode>;
      repositories: Page<{ nameWithOwner: string; isArchived: boolean }>;
    } | null;
  } | null;
}

/**
 * Reads everything about a batch of PRs that costs one request per PR. Connections nested in a list of a PR's
 * reviews or threads cost one request per item of that list, so their review threads and the teams their reviews
 * were given on behalf of are read by the follow-up queries below, only for the PRs that have them.
 */
export const DETAILS_QUERY = `query PullRequestDetails($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on PullRequest {
      id number title url isDraft createdAt mergeable
      repository { nameWithOwner }
      author { ${ACTOR} }
      assignees(first: 20) { pageInfo { hasNextPage } nodes { __typename id login } }
      commits(last: 1) {
        nodes {
          commit {
            oid committedDate
            checkSuites(first: 20) { nodes { createdAt } }
            statusCheckRollup {
              state
              contexts(first: 100) {
                pageInfo { hasNextPage }
                nodes { __typename ... on CheckRun { completedAt } ... on StatusContext { createdAt } }
              }
            }
          }
        }
      }
      reviews(last: 100) {
        pageInfo { hasPreviousPage }
        nodes { id state submittedAt author { ${ACTOR} } commit { oid } }
      }
      reviewRequests(first: 50) {
        pageInfo { hasNextPage }
        nodes { asCodeOwner requestedReviewer { ${REVIEWER} } }
      }
      reviewThreads(first: 0) { totalCount }
      timelineItems(first: 100, itemTypes: [READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT, REVIEW_REQUESTED_EVENT, ISSUE_COMMENT]) {
        pageInfo { hasNextPage }
        nodes {
          __typename
          ... on ReadyForReviewEvent { createdAt actor { ${ACTOR} } }
          ... on ConvertToDraftEvent { createdAt actor { ${ACTOR} } }
          ... on ReviewRequestedEvent { createdAt actor { ${ACTOR} } requestedReviewer { ${REVIEWER} } }
          ... on IssueComment { createdAt author { ${ACTOR} } }
        }
      }
    }
  }
  ${RATE_LIMIT}
}`;

/** A requested reviewer: a person, a Bot, a Team, or an empty object for a kind the query doesn't read. */
export type ReviewerNode = ActorNode | { __typename: 'Team'; slug: string } | { __typename: string };

export type TimelineNode =
  | TimelineActorEvent
  | { __typename: 'ReviewRequestedEvent'; createdAt: string; actor: ActorNode | null; requestedReviewer: ReviewerNode | null }
  | { __typename: 'IssueComment'; createdAt: string; author: ActorNode | null };

export interface PullRequestNode {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  repository: { nameWithOwner: string };
  /** Null when the account was deleted. */
  author: ActorNode | null;
  assignees: Page<ActorNode>;
  commits: {
    nodes: {
      commit: {
        oid: string;
        committedDate: string;
        checkSuites: { nodes: { createdAt: string }[] };
        statusCheckRollup: {
          state: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED';
          contexts: Page<{ __typename: string; completedAt?: string | null; createdAt?: string }>;
        } | null;
      };
    }[];
  };
  reviews: {
    pageInfo: { hasPreviousPage: boolean };
    nodes: {
      id: string;
      state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
      /** Null while the review is pending. */
      submittedAt: string | null;
      author: ActorNode | null;
      commit: { oid: string } | null;
    }[];
  };
  reviewRequests: Page<{ asCodeOwner: boolean; requestedReviewer: ReviewerNode | null }>;
  reviewThreads: { totalCount: number };
  timelineItems: Page<TimelineNode>;
}

export interface NodesData<T> {
  /** A node is null when it is gone, e.g. a PR deleted since the search found it. */
  nodes: (T | null)[];
}

/** A PR read by id, with how many items of its costly connection to ask for. */
export interface SizedRead {
  id: string;
  size: number;
}

/** A query that reads a batch of PRs, each under its own alias: pr0, pr1 and so on. */
export interface PerPrQuery {
  document: string;
  variables: Record<string, string | number>;
}

/** Holds the PRs a per-PR query read, by alias. A PR is null when it is gone. */
export type PerPrData<T> = Partial<Record<`pr${number}`, T | null>>;

/** A PR's review threads cost one request per thread, so only PRs that have threads are read, each for the threads it has. */
export const threadsQuery = perPrQuery(
  'ReviewThreads',
  'threads',
  (size) => `reviewThreads(first: ${size}) {
      pageInfo { hasNextPage }
      nodes {
        isResolved
        comments(first: 50) {
          pageInfo { hasNextPage }
          nodes { createdAt author { ${ACTOR} } pullRequestReview { id } }
        }
      }
    }`
);

export interface ThreadsNode {
  id: string;
  reviewThreads: Page<{
    isResolved: boolean;
    comments: Page<{ createdAt: string; author: ActorNode | null; pullRequestReview: { id: string } | null }>;
  }>;
}

/** Which teams each review was given on behalf of costs one request per review, and only matters while a team is asked for review. */
export const reviewTeamsQuery = perPrQuery(
  'ReviewTeams',
  'reviews',
  (size) => `reviews(last: ${size}) { nodes { id onBehalfOf(first: 10) { nodes { slug } } } }`
);

export interface ReviewTeamsNode {
  id: string;
  reviews: { nodes: { id: string; onBehalfOf: { nodes: { slug: string }[] } }[] };
}
