/* eslint-disable */
// This file was auto-generated. Do not edit manually.
// To update, run the error generation script again.

import type { TypedRequestHandlers as ImportedTypedRequestHandlers } from '@map-colonies/openapi-helpers/typedRequestHandler';
export type paths = {
  '/teams': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** returns the watched Teams, sorted by display name */
    get: operations['getTeams'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/snapshot': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** returns one Team's slice of the latest Snapshot, with Age and Idle Time computed against the request time */
    get: operations['getSnapshot'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/refresh': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** sweeps the code host now, unless a sweep is running or the refresh cooldown has not passed */
    post: operations['refresh'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
};
export type webhooks = Record<string, never>;
export type components = {
  schemas: {
    /** @description Every Tracked PR as StaleMate last read it from the code host. */
    snapshot: {
      teamInfo: components['schemas']['teamRef'];
      /**
       * Format: date-time
       * @description When the code host was read for this Snapshot.
       */
      readAt: string;
      sync: components['schemas']['syncState'];
      config: components['schemas']['snapshotConfig'];
      /** @description The Team Members. Members whose logins are configured as Bots have kind bot. */
      team: components['schemas']['person'][];
      prs: components['schemas']['trackedPr'][];
    };
    /** @description A Team by its slug and GitHub display name. */
    teamRef: {
      /** @example infra */
      slug: string;
      /**
       * @description The GitHub display name.
       * @example Infra
       */
      name: string;
    };
    watchedTeam: components['schemas']['teamRef'] & {
      /** @description The Team Members. Members whose logins are configured as Bots have kind bot. */
      members: components['schemas']['person'][];
    };
    error: {
      message: string;
    };
    warming: {
      /** @enum {string} */
      status: 'warming';
      sync: components['schemas']['syncState'];
    };
    syncState: {
      /** @enum {string} */
      state: 'idle' | 'syncing';
      /**
       * Format: date-time
       * @description When the last sweep started. Absent before the first sweep.
       */
      lastAttemptAt?: string;
      /**
       * Format: date-time
       * @description When the next scheduled sweep starts: sync.intervalMs after the last one ended. Absent while a sweep runs and before the first one, so the UI can poll for the new Snapshot as it lands.
       */
      nextAttemptAt?: string;
      /**
       * @description A short, safe message about why the last sweep failed. Absent when it succeeded.
       * @example GitHub API unreachable
       */
      lastError?: string;
    };
    snapshotConfig: {
      /**
       * @description The Age in Working Days at which Urgency rises to levels 1, 2 and 3.
       * @example [
       *       2,
       *       4,
       *       8
       *     ]
       */
      urgencyThresholds: number[];
      /**
       * @description How long after a sweep starts a refresh is ignored, in milliseconds. Counted from sync.lastAttemptAt, so the UI can show when "Refresh now" is available again.
       * @example 30000
       */
      refreshCooldownMs: number;
      /**
       * Format: uri
       * @description The Jira site a Jira Ticket links to, as <jiraBaseUrl>/browse/<key>. Absent when not configured, so Jira Tickets are hidden.
       * @example https://mapcolonies.atlassian.net
       */
      jiraBaseUrl?: string;
    };
    person: {
      login: string;
      kind: components['schemas']['personKind'];
    };
    /**
     * @description member is a Team Member. bot is a Bot, whether the code host types it as one or its login is configured as one. outsider is anyone else.
     * @enum {string}
     */
    personKind: 'member' | 'bot' | 'outsider';
    trackedPr: {
      /** @description The code host's id of the PR. */
      id: string;
      /**
       * @description The repository, as owner/name.
       * @example MapColonies/opa-la
       */
      repo: string;
      number: number;
      title: string;
      /** Format: uri */
      url: string;
      author: components['schemas']['person'];
      assignees: components['schemas']['person'][];
      /** @description The people currently requested for review. Team requests appear in waitingOn. */
      requestedReviewers: components['schemas']['person'][];
      /** @description The people other than the author who reviewed the PR. Bots are left out. */
      reviewers: components['schemas']['person'][];
      /** @description Strongest first, in the order inclusionReason lists them, so the first is the main one. */
      inclusionReasons: components['schemas']['inclusionReason'][];
      reviewStatus: components['schemas']['reviewStatus'];
      /** @description The number of current approvals, shown as ×N on Approved. */
      approvals: number;
      checkStatus: components['schemas']['checkStatus'];
      /** @description The PR conflicts with its base. False while the code host has not worked out whether it does. */
      conflicting: boolean;
      /** @description The keys of the Jira issues the PR's title names, in title order. Empty when it names none. */
      jiraTickets: string[];
      /** @description Who owes the next move. Never empty, and never a Bot except a Bot PR's own author. */
      waitingOn: components['schemas']['waitingOnParty'][];
      /** @description The PR is Awaiting Review and no reviewer owes a move, so it waits on its author. Set even while checks fail or the PR conflicts. */
      noReviewer: boolean;
      age: components['schemas']['clock'];
      idleTime: components['schemas']['clock'];
      urgency: components['schemas']['urgency'];
      stack?: components['schemas']['stack'];
    };
    /** @description The Stack the PR belongs to. Absent for a PR with no Stack. */
    stack: {
      /** @description The Stack's own number. */
      number: number;
      /** @description The PR's place among the PRs still in the Stack, counted from the first, as the code host reports it. */
      position: number;
      /** @description How many PRs the Stack holds, as the code host reports it, even when siblings is cut short. */
      size: number;
      /** @description The PRs in the Stack, in order, the first at the bottom. Includes the PR itself. Cut short when truncated. */
      siblings: components['schemas']['stackSibling'][];
      /** @description The Stack has more PRs than siblings lists. */
      truncated: boolean;
      /** @description Set when the PR is Approved and Passing but a PR below it in the Stack is not yet ready by the code host's own review decision and checks, or is a draft. Names the lowest such PR. A hint only: it changes no move. */
      heldBy?: {
        /** @description The repository, as owner/name. */
        repo: string;
        number: number;
      };
    };
    stackSibling: {
      /**
       * @description The repository, as owner/name.
       * @example MapColonies/jobnik
       */
      repo: string;
      number: number;
      title: string;
      /** Format: uri */
      url: string;
      /** @enum {string} */
      state: 'open' | 'merged' | 'closed';
      draft: boolean;
      /** @description Whether the Team being viewed tracks this PR. An untracked PR is shown only by its title, number, state, draft flag and link; StaleMate holds nothing else about it for this Team. */
      tracked: boolean;
    };
    /**
     * @description Why the PR is a Tracked PR. Listed strongest first.
     * @enum {string}
     */
    inclusionReason: 'authoredByMember' | 'memberReviewRequested' | 'teamReviewRequested' | 'assignedToMember' | 'reviewedByMember' | 'teamRepo';
    /** @enum {string} */
    reviewStatus: 'draft' | 'awaitingReview' | 'changesRequested' | 'awaitingReReview' | 'approved';
    /**
     * @description Over the head commit's checks, leaving out the Excluded Checks. none when no checks are left.
     * @enum {string}
     */
    checkStatus: 'passing' | 'failing' | 'pending' | 'none';
    waitingOnParty: components['schemas']['waitingOnPerson'] | components['schemas']['waitingOnTeam'];
    waitingOnPerson: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: 'person';
      login: string;
      kind: components['schemas']['personKind'];
      /**
       * @description Whether the person owes the move as the PR's author or as a reviewer.
       * @enum {string}
       */
      role: 'author' | 'reviewer';
      /** @description The moves the person owes, each once, in the order the rules found them. */
      moves: components['schemas']['move'][];
    };
    /**
     * @description A move a person owes on a PR. The author's: finishDraft, merge, answerChanges (an unanswered request for changes), reply (a comment-only review or its thread), findReviewer (No Reviewer), fixChecks and resolveConflict. A reviewer's: review (a request for review), reReview (an Answered request for changes) and reply (the author answered last in their comment-only thread).
     * @enum {string}
     */
    move: 'finishDraft' | 'merge' | 'answerChanges' | 'reply' | 'findReviewer' | 'fixChecks' | 'resolveConflict' | 'review' | 'reReview';
    waitingOnTeam: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: 'team';
      /** @example infra */
      slug: string;
      /** @description True when this is the Team itself, so every Team Member counts as Waiting On it. A request to any other team leaves no Team Member Waiting On it. */
      viaTeam: boolean;
    };
    /** @description A span of time counted in Working Days, computed against the request time. */
    clock: {
      /** @description The working time in the span, in milliseconds. Divide by 24 h for Working Days. */
      workingMs: number;
      /**
       * Format: date-time
       * @description When the span started, for showing wall-clock time.
       */
      since: string;
    };
    /** @description How loudly the PR's Age calls for attention, from 0 (neutral) to 3. Null for a Draft. */
    urgency: number | null;
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
  getTeams: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['watchedTeam'][];
        };
      };
      /** @description No sweep of the code host has succeeded yet */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['warming'];
        };
      };
    };
  };
  getSnapshot: {
    parameters: {
      query: {
        /** @description The slug of a watched Team. */
        team: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['snapshot'];
        };
      };
      /** @description The team query parameter is missing */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['error'];
        };
      };
      /** @description The slug is not a watched Team */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['error'];
        };
      };
      /** @description No sweep of the code host has succeeded yet */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['warming'];
        };
      };
    };
  };
  refresh: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Accepted. Returns the sync state after the request was handled. */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['syncState'];
        };
      };
    };
  };
}
export type TypedRequestHandlers = ImportedTypedRequestHandlers<paths, operations>;
