/* eslint-disable */
// This file was auto-generated. Do not edit manually.
// To update, run the error generation script again.

import type { TypedRequestHandlers as ImportedTypedRequestHandlers } from '@map-colonies/openapi-helpers/typedRequestHandler';
export type paths = {
  '/snapshot': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** returns the latest Snapshot, with Age and Idle Time computed against the request time */
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
      inclusionReasons: components['schemas']['inclusionReason'][];
      reviewStatus: components['schemas']['reviewStatus'];
      /** @description The number of current approvals, shown as ×N on Approved. */
      approvals: number;
      checkStatus: components['schemas']['checkStatus'];
      /** @description Who owes the next move. Never empty and never a Bot. */
      waitingOn: components['schemas']['waitingOnParty'][];
      /** @description The PR is Awaiting Review and no reviewer owes a move, so it waits on its author. */
      noReviewer: boolean;
      age: components['schemas']['clock'];
      idleTime: components['schemas']['clock'];
      urgency: components['schemas']['urgency'];
    };
    /**
     * @description Why the PR is a Tracked PR.
     * @enum {string}
     */
    inclusionReason: 'teamRepo' | 'authoredByMember' | 'memberReviewRequested' | 'reviewedByMember' | 'assignedToMember' | 'teamReviewRequested';
    /** @enum {string} */
    reviewStatus: 'draft' | 'awaitingReview' | 'changesRequested' | 'awaitingReReview' | 'approved';
    /** @enum {string} */
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
    };
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
  getSnapshot: {
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
          'application/json': components['schemas']['snapshot'];
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
