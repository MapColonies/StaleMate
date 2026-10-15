import type { CheckStatus, InclusionReason, ReviewStatus, TrackedPr, WaitingOnParty } from '@/snapshot/types';
import { workingDays } from '@/lib/time';

/**
 * The one filter model every view shares. It lives in the URL, so a filtered view can be shared as a link.
 * Every filter runs client-side, over the whole Snapshot.
 */
export interface Filters {
  /** Free text over the title, repo, #number and author. */
  q: string;
  repo: string[];
  author: string[];
  /** Requested or already reviewed. */
  reviewer: string[];
  /** Party keys: a login, or @slug for a team. */
  waitingOn: string[];
  review: ReviewStatus[];
  check: CheckStatus[];
  reason: InclusionReason[];
  /** Age in Working Days, from ageMin up to but not including ageMax. */
  ageMin: number | null;
  ageMax: number | null;
  /** Idle for more than this many Working Days. */
  idleOver: number | null;
  hideBots: boolean;
  hideOutsiders: boolean;
  /** Requests to the Team stop counting as Waiting On the Viewer. It hides no PR by itself; the views read it through isWaitingOnViewer. */
  hideViaTeam: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  q: '',
  repo: [],
  author: [],
  reviewer: [],
  waitingOn: [],
  review: [],
  check: [],
  reason: [],
  ageMin: null,
  ageMax: null,
  idleOver: null,
  hideBots: true,
  hideOutsiders: false,
  hideViaTeam: false,
};

const REVIEW_STATUSES: readonly ReviewStatus[] = ['draft', 'awaitingReview', 'changesRequested', 'awaitingReReview', 'approved'];
const CHECK_STATUSES: readonly CheckStatus[] = ['passing', 'failing', 'pending', 'none'];
const INCLUSION_REASONS: readonly InclusionReason[] = [
  'teamRepo',
  'authoredByMember',
  'memberReviewRequested',
  'reviewedByMember',
  'assignedToMember',
  'teamReviewRequested',
];

/** The prototype's presets, re-expressed in Working Days: a working week is 5, a month about 20, a quarter about 60. */
export const AGE_PRESETS: readonly { label: string; ageMin: number | null; ageMax: number | null }[] = [
  { label: 'Any age', ageMin: null, ageMax: null },
  { label: '< 5 Working Days', ageMin: null, ageMax: 5 },
  { label: '< 20 Working Days', ageMin: null, ageMax: 20 },
  { label: '< 60 Working Days', ageMin: null, ageMax: 60 },
  { label: '≥ 60 Working Days', ageMin: 60, ageMax: null },
];

export const IDLE_PRESETS: readonly { label: string; idleOver: number | null }[] = [
  { label: 'Any Idle Time', idleOver: null },
  { label: 'Idle > 1 Working Day', idleOver: 1 },
  { label: 'Idle > 3 Working Days', idleOver: 3 },
  { label: 'Idle > 5 Working Days', idleOver: 5 },
];

/** The key a Waiting On party goes by in the waitingOn filter. */
export function partyKey(party: WaitingOnParty): string {
  return party.type === 'team' ? `@${party.slug}` : party.login;
}

// ---- the URL --------------------------------------------------------------

type Codec<T> = { parse: (raw: string) => T | undefined; serialize: (value: T) => string };

const text: Codec<string> = { parse: (raw) => raw, serialize: (value) => value };

const list = <T extends string>(allowed?: readonly T[]): Codec<T[]> => ({
  parse: (raw) => raw.split(',').filter((item): item is T => item !== '' && (allowed === undefined || allowed.includes(item as T))),
  serialize: (value) => value.join(','),
});

const workingDayCount: Codec<number | null> = {
  parse: (raw) => {
    const value = raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  },
  serialize: (value) => String(value),
};

const onOff: Codec<boolean> = {
  parse: (raw) => (raw === '1' ? true : raw === '0' ? false : undefined),
  serialize: (value) => (value ? '1' : '0'),
};

/** Each filter's URL parameter and how it is written. */
const PARAMS: { [K in keyof Filters]: { param: string; codec: Codec<Filters[K]> } } = {
  q: { param: 'q', codec: text },
  repo: { param: 'repo', codec: list() },
  author: { param: 'author', codec: list() },
  reviewer: { param: 'reviewer', codec: list() },
  waitingOn: { param: 'waitingOn', codec: list() },
  review: { param: 'review', codec: list(REVIEW_STATUSES) },
  check: { param: 'check', codec: list(CHECK_STATUSES) },
  reason: { param: 'reason', codec: list(INCLUSION_REASONS) },
  ageMin: { param: 'ageMin', codec: workingDayCount },
  ageMax: { param: 'ageMax', codec: workingDayCount },
  idleOver: { param: 'idle', codec: workingDayCount },
  hideBots: { param: 'hideBots', codec: onOff },
  hideOutsiders: { param: 'hideOutsiders', codec: onOff },
  hideViaTeam: { param: 'hideViaTeam', codec: onOff },
};

const FILTER_KEYS = Object.keys(DEFAULT_FILTERS) as (keyof Filters)[];

function isDefault<K extends keyof Filters>(key: K, value: Filters[K]): boolean {
  // Every list filter defaults to empty.
  return Array.isArray(value) ? value.length === 0 : value === DEFAULT_FILTERS[key];
}

/** Reads the filters from a query string. A filter whose value it doesn't understand keeps its default. */
export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const filters: Filters = { ...DEFAULT_FILTERS };
  for (const key of FILTER_KEYS) {
    const { param, codec } = PARAMS[key];
    const raw = params.get(param);
    const value = raw === null ? undefined : codec.parse(raw);
    if (value !== undefined) {
      (filters as Record<keyof Filters, unknown>)[key] = value;
    }
  }
  return filters;
}

/** Writes the filters onto a query string, leaving the parameters it doesn't own alone. Defaults are left out. */
export function serializeFilters(filters: Filters, search = ''): string {
  const params = new URLSearchParams(search);
  for (const key of FILTER_KEYS) {
    writeParam(params, key, filters[key]);
  }
  return params.toString();
}

function writeParam<K extends keyof Filters>(params: URLSearchParams, key: K, value: Filters[K]): void {
  const { param, codec } = PARAMS[key];
  if (isDefault(key, value)) {
    params.delete(param);
  } else {
    params.set(param, codec.serialize(value));
  }
}

export function activeFilterCount(filters: Filters): number {
  return FILTER_KEYS.filter((key) => !isDefault(key, filters[key])).length;
}

// ---- applying -------------------------------------------------------------

const anyOf = <T>(wanted: readonly T[], values: readonly T[]): boolean => wanted.length === 0 || values.some((value) => wanted.includes(value));

/** The PRs that pass every filter. Within one filter, any selected value matches. */
export function applyFilters(prs: readonly TrackedPr[], filters: Filters): TrackedPr[] {
  const q = filters.q.trim().toLowerCase();
  return prs.filter((pr) => {
    const age = workingDays(pr.age);
    return (
      !(filters.hideBots && pr.author.kind === 'bot') &&
      !(filters.hideOutsiders && pr.author.kind === 'outsider') &&
      (q === '' || `${pr.repo} #${pr.number} ${pr.title} ${pr.author.login}`.toLowerCase().includes(q)) &&
      anyOf(filters.repo, [pr.repo]) &&
      anyOf(filters.author, [pr.author.login]) &&
      anyOf(
        filters.reviewer,
        [...pr.requestedReviewers, ...pr.reviewers].map((person) => person.login)
      ) &&
      anyOf(filters.waitingOn, pr.waitingOn.map(partyKey)) &&
      anyOf(filters.review, [pr.reviewStatus]) &&
      anyOf(filters.check, [pr.checkStatus]) &&
      anyOf(filters.reason, pr.inclusionReasons) &&
      (filters.ageMin === null || age >= filters.ageMin) &&
      (filters.ageMax === null || age < filters.ageMax) &&
      (filters.idleOver === null || workingDays(pr.idleTime) > filters.idleOver)
    );
  });
}
