import type { Move, Person, Snapshot, TrackedPr, WaitingOnParty } from '@/snapshot/types';

const HOUR = 60 * 60 * 1000;
const WORKING_DAY = 24 * HOUR;

const readAt = '2026-10-14T09:00:00Z';

export const member = (login: string): Person => ({ login, kind: 'member' });
export const bot = (login: string): Person => ({ login, kind: 'bot' });
export const outsider = (login: string): Person => ({ login, kind: 'outsider' });

export const waitingOnAuthor = (person: Person, moves: Move[] = ['merge']): WaitingOnParty => ({
  type: 'person',
  login: person.login,
  kind: person.kind,
  role: 'author',
  moves,
});
export const waitingOnReviewer = (person: Person, moves: Move[] = ['review']): WaitingOnParty => ({
  type: 'person',
  login: person.login,
  kind: person.kind,
  role: 'reviewer',
  moves,
});
export const waitingOnTheTeam: WaitingOnParty = { type: 'team', slug: 'infra', viaTeam: true };
export const waitingOnTeam = (slug: string): WaitingOnParty => ({ type: 'team', slug, viaTeam: false });

/** A clock of `workingDays` Working Days. */
export const clock = (workingDays: number) => ({ workingMs: Math.round(workingDays * WORKING_DAY), since: '2026-10-01T09:00:00Z' });

let nextNumber = 1;

/** A Tracked PR by a Team Member, Awaiting Review on alice, unless overridden. */
export function aPr(overrides: Partial<TrackedPr> = {}): TrackedPr {
  const number = nextNumber++;
  const author = overrides.author ?? member('bob');
  return {
    id: `PR_${number}`,
    repo: 'MapColonies/opa-la',
    number,
    title: `Change number ${number}`,
    url: `https://github.com/MapColonies/opa-la/pull/${number}`,
    author,
    assignees: [],
    requestedReviewers: [member('alice')],
    reviewers: [],
    inclusionReasons: ['teamRepo'],
    reviewStatus: 'awaitingReview',
    approvals: 0,
    checkStatus: 'passing',
    conflicting: false,
    waitingOn: [waitingOnReviewer(member('alice'))],
    noReviewer: false,
    age: clock(1),
    idleTime: clock(0.5),
    urgency: 0,
    ...overrides,
  };
}

export function aSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    readAt,
    sync: { state: 'idle', lastAttemptAt: readAt },
    config: { urgencyThresholds: [2, 4, 8], refreshCooldownMs: 30_000 },
    team: [member('alice'), member('bob'), member('carol'), bot('mapcolonies-devops')],
    prs: [],
    ...overrides,
  };
}
