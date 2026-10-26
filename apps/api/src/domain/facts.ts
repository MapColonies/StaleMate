// The provider-neutral facts a provider emits for each PR. The domain derives everything else from them.

/** An account on the code host. */
export interface Actor {
  /** The code host's stable id. Bots the code host types are matched by id or type, never by login: their logins differ between APIs. */
  id: string;
  login: string;
  /** The code host types the account as a Bot. Logins configured as Bots are not flagged here. */
  isBot: boolean;
}

/** One Team's members and repos, as the provider read them on this sweep. */
export interface Roster {
  /** Every Team Member, including members through child teams. */
  members: Actor[];
  /** The Team Repos, as owner/name. Archived repositories are left out. */
  repos: string[];
}

/** A Team the provider watches, with its roster. */
export interface WatchedTeam {
  /** The Team's slug, e.g. `infra`. */
  slug: string;
  /** The GitHub display name, e.g. `Infra`. */
  name: string;
  roster: Roster;
}

/** Pending reviews are unsubmitted drafts, so providers leave them out. */
export type ReviewState = 'approved' | 'changesRequested' | 'commented' | 'dismissed';

export interface ReviewFact {
  id: string;
  state: ReviewState;
  author: Actor;
  submittedAt: Date;
  /** The head commit the review was given on. */
  commitOid: string | null;
  /**
   * The slugs of the teams the review was given on behalf of. It only matters while the PR asks a team for review,
   * so a provider may leave it empty on a PR that asks none.
   */
  onBehalfOf: string[];
}

export type ReviewRequestFact = { type: 'person'; reviewer: Actor; asCodeOwner: boolean } | { type: 'team'; slug: string; asCodeOwner: boolean };

export interface ThreadCommentFact {
  author: Actor;
  createdAt: Date;
  /** The review the comment was posted in. */
  reviewId: string | null;
}

export interface ReviewThreadFact {
  isResolved: boolean;
  /** The thread's comments, oldest first. The first comment belongs to the review that opened the thread. */
  comments: ThreadCommentFact[];
}

export type TimelineEventFact =
  | { type: 'readyForReview'; at: Date; actor: Actor | null }
  | { type: 'convertToDraft'; at: Date; actor: Actor | null }
  | { type: 'reviewRequested'; at: Date; actor: Actor | null; requested: ReviewRequestFact | null }
  /** A top-level PR comment. */
  | { type: 'comment'; at: Date; actor: Actor | null };

/** A check on the head commit. Neutral and skipped checks count as passed; any other finished check that did not succeed, as failed. */
export interface CheckFact {
  /** The check run's name or the status context's context, e.g. `build` or `jira/issue-validation`. */
  name: string;
  state: 'passed' | 'failed' | 'pending';
}

/** Whether the PR merges cleanly into its base. `unknown` counts as no conflict. */
export type Mergeability = 'mergeable' | 'conflicting' | 'unknown';

export interface HeadCommitFact {
  oid: string;
  committedDate: Date;
  /** When the earliest check suite on the commit was created, which is when it was pushed. */
  firstCheckSuiteAt: Date | null;
  /** Every check run and status context on the commit. */
  checks: CheckFact[];
  /** When each check run completed and each status context was created. */
  checkActivity: Date[];
}

/** A PR in a Stack, as the code host lists it there. */
export interface StackEntryFact {
  /** The repository, as owner/name. */
  repo: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'merged' | 'closed';
  isDraft: boolean;
}

/** The Stack a PR belongs to, as the code host reports it. Position and size are the code host's, never renumbered. */
export interface StackFact {
  /** The Stack's own number. */
  number: number;
  /** The PR's place among the PRs still in the Stack, counted from the first. */
  position: number;
  /** How many PRs the Stack holds, whether or not `entries` lists them all. */
  size: number;
  /** The PRs the provider read, in Stack order. An entry the provider could not read is left out. */
  entries: StackEntryFact[];
  /** The Stack has more entries than the provider read. */
  entriesTruncated: boolean;
}

export interface PrFacts {
  /** The code host's id of the PR. */
  id: string;
  /** The repository, as owner/name. */
  repo: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: Date;
  mergeable: Mergeability;
  /** A deleted account is reported as the code host's placeholder account (`ghost` on GitHub). */
  author: Actor;
  assignees: Actor[];
  headCommit: HeadCommitFact;
  /** Every submitted review, oldest first. */
  reviews: ReviewFact[];
  /** The reviewers and teams currently requested, Bots included. */
  reviewRequests: ReviewRequestFact[];
  reviewThreads: ReviewThreadFact[];
  /** Ready-for-review, convert-to-draft, review-requested and comment events, oldest first. */
  timeline: TimelineEventFact[];
  /** The Stack the PR belongs to. Absent for a PR with no Stack. */
  stack?: StackFact;
}
