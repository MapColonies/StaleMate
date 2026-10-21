import type {
  Actor,
  CheckFact,
  HeadCommitFact,
  Mergeability,
  PrFacts,
  ReviewFact,
  ReviewRequestFact,
  ReviewState,
  ReviewThreadFact,
  TimelineEventFact,
} from '@domain/facts';
import type { ActorNode, CheckContextNode, PullRequestNode, ReviewTeamsNode, ReviewerNode, ThreadsNode, TimelineNode } from './queries';

/** GitHub's placeholder for a deleted account, which GraphQL reports as a null actor. */
const GHOST: Actor = { id: 'MDQ6VXNlcjEwMTM3', login: 'ghost', isBot: false };

/* eslint-disable @typescript-eslint/naming-convention -- GitHub's enum values */
const REVIEW_STATES: Record<Exclude<PullRequestNode['reviews']['nodes'][number]['state'], 'PENDING'>, ReviewState> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changesRequested',
  COMMENTED: 'commented',
  DISMISSED: 'dismissed',
};

const MERGEABILITY: Record<PullRequestNode['mergeable'], Mergeability> = {
  MERGEABLE: 'mergeable',
  CONFLICTING: 'conflicting',
  UNKNOWN: 'unknown',
};

const STATUS_CONTEXT_STATES: Record<Extract<CheckContextNode, { __typename: 'StatusContext' }>['state'], CheckFact['state']> = {
  SUCCESS: 'passed',
  FAILURE: 'failed',
  ERROR: 'failed',
  PENDING: 'pending',
  EXPECTED: 'pending',
};
/* eslint-enable @typescript-eslint/naming-convention */

/** The conclusions of a completed check run that count as passed. Every other conclusion counts as failed. */
const PASSED_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

/** GitHub's global ids name the type of their object, and a Bot's start with this, even where GitHub types it as a User. */
const BOT_ID_PREFIX = 'BOT_';

function toActorOrGhost(node: ActorNode | null): Actor {
  return node === null ? GHOST : toActor(node);
}

function toActorOrNull(node: ActorNode | null): Actor | null {
  return node === null ? null : toActor(node);
}

function toReviewRequest(reviewer: ReviewerNode | null, asCodeOwner: boolean): ReviewRequestFact | null {
  if (reviewer === null) {
    return null;
  }
  if ('slug' in reviewer) {
    return { type: 'team', slug: reviewer.slug, asCodeOwner };
  }
  if ('login' in reviewer) {
    return { type: 'person', reviewer: toActor(reviewer), asCodeOwner };
  }
  return null;
}

function toReviews(node: PullRequestNode): ReviewFact[] {
  return node.reviews.nodes.flatMap((review) =>
    // A pending review is an unsubmitted draft.
    review.state === 'PENDING' || review.submittedAt === null
      ? []
      : [
          {
            id: review.id,
            state: REVIEW_STATES[review.state],
            author: toActorOrGhost(review.author),
            submittedAt: new Date(review.submittedAt),
            commitOid: review.commit?.oid ?? null,
            onBehalfOf: [],
          },
        ]
  );
}

function toTimelineEvent(node: TimelineNode): TimelineEventFact {
  const at = new Date(node.createdAt);
  switch (node.__typename) {
    case 'ReadyForReviewEvent':
      return { type: 'readyForReview', at, actor: toActorOrNull(node.actor) };
    case 'ConvertToDraftEvent':
      return { type: 'convertToDraft', at, actor: toActorOrNull(node.actor) };
    case 'ReviewRequestedEvent':
      // The timeline doesn't say whether CODEOWNERS made the request.
      return { type: 'reviewRequested', at, actor: toActorOrNull(node.actor), requested: toReviewRequest(node.requestedReviewer, false) };
    case 'IssueComment':
      return { type: 'comment', at, actor: toActorOrNull(node.author) };
  }
}

function toCheck(node: CheckContextNode): CheckFact {
  if (node.__typename === 'StatusContext') {
    return { name: node.context, state: STATUS_CONTEXT_STATES[node.state] };
  }
  if (node.status !== 'COMPLETED') {
    return { name: node.name, state: 'pending' };
  }
  return { name: node.name, state: node.conclusion !== null && PASSED_CONCLUSIONS.has(node.conclusion) ? 'passed' : 'failed' };
}

function toHeadCommit(node: PullRequestNode): HeadCommitFact {
  const head = node.commits.nodes[0]?.commit;
  if (head === undefined) {
    throw new Error(`PR ${node.url} has no commits`);
  }
  const suiteTimes = head.checkSuites.nodes.map((suite) => new Date(suite.createdAt).getTime());
  const contexts = head.statusCheckRollup?.contexts.nodes ?? [];
  return {
    oid: head.oid,
    committedDate: new Date(head.committedDate),
    firstCheckSuiteAt: suiteTimes.length === 0 ? null : new Date(Math.min(...suiteTimes)),
    checks: contexts.map(toCheck),
    checkActivity: contexts.flatMap((context) => {
      const at = context.__typename === 'CheckRun' ? context.completedAt : context.createdAt;
      return at === null ? [] : [new Date(at)];
    }),
  };
}

const byTime =
  <T>(at: (item: T) => Date) =>
  (a: T, b: T): number =>
    at(a).getTime() - at(b).getTime();

/** GitHub types Copilot's coding agent as a Bot when it authors a PR, and as a User when it is assigned one, so its id decides too. */
export function toActor(node: ActorNode): Actor {
  return { id: node.id, login: node.login, isBot: node.__typename === 'Bot' || node.id.startsWith(BOT_ID_PREFIX) };
}

/** Translates a PR as the details query read it into facts. Its review threads are read separately, so they start empty. */
export function toPrFacts(node: PullRequestNode): PrFacts {
  return {
    id: node.id,
    repo: node.repository.nameWithOwner,
    number: node.number,
    title: node.title,
    url: node.url,
    isDraft: node.isDraft,
    createdAt: new Date(node.createdAt),
    mergeable: MERGEABILITY[node.mergeable],
    author: toActorOrGhost(node.author),
    assignees: node.assignees.nodes.map(toActor),
    headCommit: toHeadCommit(node),
    reviews: toReviews(node).sort(byTime((review) => review.submittedAt)),
    reviewRequests: node.reviewRequests.nodes.flatMap((request) => toReviewRequest(request.requestedReviewer, request.asCodeOwner) ?? []),
    reviewThreads: [],
    timeline: node.timelineItems.nodes.map(toTimelineEvent).sort(byTime((event) => event.at)),
  };
}

/** A PR that wasn't read for threads has none. */
export function toReviewThreads(node: ThreadsNode | undefined): ReviewThreadFact[] {
  return (node?.reviewThreads.nodes ?? []).map((thread) => ({
    isResolved: thread.isResolved,
    comments: thread.comments.nodes.map((comment) => ({
      author: toActorOrGhost(comment.author),
      createdAt: new Date(comment.createdAt),
      reviewId: comment.pullRequestReview?.id ?? null,
    })),
  }));
}

/** The slugs of the teams each review was given on behalf of, by review id. */
export function toReviewTeams(node: ReviewTeamsNode): Map<string, string[]> {
  return new Map(node.reviews.nodes.map((review) => [review.id, review.onBehalfOf.nodes.map((team) => team.slug)]));
}

/** Names the connections GitHub had more of than a query read. */
export function whichTruncated(hasMore: Record<string, boolean>): string[] {
  return Object.entries(hasMore).flatMap(([connection, isTruncated]) => (isTruncated ? [connection] : []));
}

/** The connections of a PR that GitHub had more of than the queries read. */
export function truncatedConnections(node: PullRequestNode, threads: ThreadsNode | undefined): string[] {
  return whichTruncated({
    checks: node.commits.nodes[0]?.commit.statusCheckRollup?.contexts.pageInfo.hasNextPage ?? false,
    assignees: node.assignees.pageInfo.hasNextPage,
    reviews: node.reviews.pageInfo.hasPreviousPage,
    reviewRequests: node.reviewRequests.pageInfo.hasNextPage,
    timelineItems: node.timelineItems.pageInfo.hasNextPage,
    reviewThreads: threads?.reviewThreads.pageInfo.hasNextPage ?? false,
    comments: threads?.reviewThreads.nodes.some((thread) => thread.comments.pageInfo.hasNextPage) ?? false,
  });
}
