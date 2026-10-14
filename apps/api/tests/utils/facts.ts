/* eslint-disable @typescript-eslint/no-magic-numbers -- fixture data */
import type { Actor, PrFacts, Roster } from '@domain/facts';
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
      checkRollup: 'success',
      checkActivity: [],
    },
    reviews: [],
    reviewRequests: [],
    reviewThreads: [],
    timeline: [],
    ...overrides,
  };
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
    ...overrides,
  };
}
