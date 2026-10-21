/* eslint-disable @typescript-eslint/no-magic-numbers -- fixture data */
import type { Actor, PrFacts, ReviewFact, ReviewThreadFact, Roster, ThreadCommentFact } from '@domain/facts';
import type { DerivationConfig } from '@domain/deriveTrackedPr';

export function anActor(overrides: Partial<Actor> = {}): Actor {
  return { id: 'U_alice', login: 'alice', isBot: false, ...overrides };
}

export function aPrFacts(overrides: Partial<PrFacts> = {}): PrFacts {
  return {
    id: 'PR_1',
    repo: 'MapColonies/opa-la',
    number: 1,
    title: 'feat: add retry policy to job polling',
    url: 'https://github.com/MapColonies/opa-la/pull/1',
    isDraft: false,
    createdAt: new Date('2026-10-12T08:00:00Z'),
    mergeable: 'mergeable',
    author: anActor(),
    assignees: [],
    headCommit: {
      oid: 'c0ffee',
      committedDate: new Date('2026-10-12T07:59:00Z'),
      firstCheckSuiteAt: new Date('2026-10-12T07:59:07Z'),
      checks: [{ name: 'build', state: 'passed' }],
      checkActivity: [],
    },
    reviews: [],
    reviewRequests: [],
    reviewThreads: [],
    timeline: [],
    ...overrides,
  };
}

export function aReview(overrides: Partial<ReviewFact> = {}): ReviewFact {
  return {
    id: 'PRR_1',
    state: 'approved',
    author: anActor({ id: 'U_bob', login: 'bob' }),
    submittedAt: new Date('2026-10-13T08:00:00Z'),
    commitOid: 'c0ffee',
    onBehalfOf: [],
    ...overrides,
  };
}

export function aThreadComment(overrides: Partial<ThreadCommentFact> = {}): ThreadCommentFact {
  return { author: anActor({ id: 'U_bob', login: 'bob' }), createdAt: new Date('2026-10-13T08:00:00Z'), reviewId: 'PRR_1', ...overrides };
}

export function aReviewThread(overrides: Partial<ReviewThreadFact> = {}): ReviewThreadFact {
  return { isResolved: false, comments: [aThreadComment()], ...overrides };
}

export function aRoster(overrides: Partial<Roster> = {}): Roster {
  return {
    members: [anActor(), anActor({ id: 'U_bob', login: 'bob' })],
    repos: ['MapColonies/opa-la'],
    ...overrides,
  };
}

export function aDerivationConfig(overrides: Partial<DerivationConfig> = {}): DerivationConfig {
  return {
    teamSlug: 'infra',
    botLogins: ['mapcolonies-devops', 'mapcolonies-org'],
    urgencyThresholds: [2, 4, 8],
    extraNonWorkingDays: ['2026-10-27'],
    excludedChecks: ['jira/issue-validation', 'jira-validation'],
    jiraProjectKeys: ['MAPCO'],
    ...overrides,
  };
}
