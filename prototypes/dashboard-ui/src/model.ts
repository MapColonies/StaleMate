// PROTOTYPE — throwaway. Domain types, URL-backed filters and helpers shared by every variant.
import { useEffect, useState, useSyncExternalStore } from 'react';

export type PersonKind = 'member' | 'service' | 'bot' | 'outsider' | 'team';
export interface Person {
  login: string;
  kind: PersonKind;
}

export type ReviewStatus = 'draft' | 'review-required' | 'commented' | 'changes-requested' | 'approved';
export type CheckStatus = 'passing' | 'failing' | 'pending' | 'none';
export type Reason = 'team-repo' | 'authored' | 'review-requested' | 'team-requested' | 'reviewed' | 'assigned';

export interface WaitingOnEntry {
  login: string;
  role: 'author' | 'reviewer';
}

export interface PR {
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  author: Person;
  createdAt: number;
  waitingSince: number;
  reviewStatus: ReviewStatus;
  checkStatus: CheckStatus;
  waitingOn: WaitingOnEntry[];
  requested: string[];
  reviewed: string[];
  assignees: string[];
  reasons: Reason[];
  approvals: number;
  additions: number;
  deletions: number;
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  draft: 'Draft',
  'review-required': 'Awaiting review',
  commented: 'Commented',
  'changes-requested': 'Changes requested',
  approved: 'Approved',
};
export const REVIEW_RANK: Record<ReviewStatus, number> = {
  'changes-requested': 0,
  'review-required': 1,
  commented: 2,
  approved: 3,
  draft: 4,
};
export const CHECK_LABEL: Record<CheckStatus, string> = {
  failing: 'Failing',
  pending: 'Pending',
  passing: 'Passing',
  none: 'No checks',
};
export const CHECK_RANK: Record<CheckStatus, number> = { failing: 0, pending: 1, passing: 2, none: 3 };
export const REASON_LABEL: Record<Reason, string> = {
  'team-repo': 'Team repo',
  authored: 'Authored',
  'review-requested': 'Review requested',
  'team-requested': 'Team requested',
  reviewed: 'Reviewed',
  assigned: 'Assigned',
};

// ---- formatting / urgency -------------------------------------------------

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 14) return h % 24 && d < 3 ? `${d}d ${h % 24}h` : `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

// Proposed thresholds (open fog on the map: "Visual urgency"). Tweak here.
export const URGENCY = { agingAfter: 1 * DAY, staleAfter: 3 * DAY };
export type Urgency = 'fresh' | 'aging' | 'stale';
export function urgency(ms: number): Urgency {
  if (ms >= URGENCY.staleAfter) return 'stale';
  if (ms >= URGENCY.agingAfter) return 'aging';
  return 'fresh';
}

export const waitMs = (pr: PR, now: number) => now - pr.waitingSince;
export const ageMs = (pr: PR, now: number) => now - pr.createdAt;

// ---- URL-backed filters ---------------------------------------------------

export type View = 'all' | 'my-turn' | 'my-prs' | 'involved';
export interface Filters {
  view: View;
  q: string;
  repo: string[];
  author: string[];
  reviewer: string[];
  waitingOn: string[];
  reason: string[];
  review: string[];
  check: string[];
  minWait: number; // hours
  maxAge: number; // days, 0 = any
  bots: boolean; // show Bots (incl. configured service accounts)
  outsiders: boolean; // show non-team authors
  sort: string; // "waiting.desc,age.desc"
}

export const DEFAULT_FILTERS: Filters = {
  view: 'all',
  q: '',
  repo: [],
  author: [],
  reviewer: [],
  waitingOn: [],
  reason: [],
  review: [],
  check: [],
  minWait: 0,
  maxAge: 0,
  bots: false,
  outsiders: true,
  sort: 'waiting.desc',
};

const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb);
  window.addEventListener('urlchange', cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener('urlchange', cb);
  };
};
export const useSearch = () => useSyncExternalStore(subscribe, () => location.search);

export function setParams(mutate: (p: URLSearchParams) => void) {
  const p = new URLSearchParams(location.search);
  mutate(p);
  const s = p.toString();
  history.replaceState(null, '', s ? `?${s}` : location.pathname);
  window.dispatchEvent(new Event('urlchange'));
}

function parse(search: string): Filters {
  const p = new URLSearchParams(search);
  const f: Filters = { ...DEFAULT_FILTERS };
  for (const key of Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]) {
    const raw = p.get(key);
    if (raw === null) continue;
    const def = DEFAULT_FILTERS[key];
    if (Array.isArray(def)) (f as any)[key] = raw ? raw.split(',') : [];
    else if (typeof def === 'boolean') (f as any)[key] = raw === '1';
    else if (typeof def === 'number') (f as any)[key] = Number(raw) || 0;
    else (f as any)[key] = raw;
  }
  return f;
}

export function useFilters(): [Filters, (patch: Partial<Filters>) => void, () => void] {
  const search = useSearch();
  const filters = parse(search);
  const update = (patch: Partial<Filters>) =>
    setParams((p) => {
      for (const [key, value] of Object.entries(patch) as [keyof Filters, any][]) {
        const def = DEFAULT_FILTERS[key];
        const isDefault = Array.isArray(value) ? value.length === 0 : value === def;
        if (isDefault) p.delete(key);
        else if (Array.isArray(value)) p.set(key, value.join(','));
        else if (typeof value === 'boolean') p.set(key, value ? '1' : '0');
        else p.set(key, String(value));
      }
    });
  const reset = () =>
    setParams((p) => {
      for (const key of Object.keys(DEFAULT_FILTERS)) if (key !== 'sort') p.delete(key);
    });
  return [filters, update, reset];
}

export function activeFilterCount(f: Filters) {
  let n = 0;
  for (const key of Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]) {
    if (key === 'sort' || key === 'view') continue;
    const v = f[key];
    if (Array.isArray(v) ? v.length : v !== DEFAULT_FILTERS[key]) n++;
  }
  return n;
}

export function isInvolved(pr: PR, login: string) {
  return (
    pr.author.login === login ||
    pr.requested.includes(login) ||
    pr.reviewed.includes(login) ||
    pr.assignees.includes(login)
  );
}

export function matchesView(pr: PR, view: View, viewer: string | null) {
  if (view === 'all' || !viewer) return true;
  if (view === 'my-turn') return pr.waitingOn.some((w) => w.login === viewer);
  if (view === 'my-prs') return pr.author.login === viewer;
  return isInvolved(pr, viewer);
}

/** Everything except the view tab — so views can show counts. */
export function applyFilters(prs: PR[], f: Filters, now: number, opts: { skipView?: boolean; viewer?: string | null } = {}) {
  const q = f.q.trim().toLowerCase();
  return prs.filter((pr) => {
    if (!f.bots && (pr.author.kind === 'bot' || pr.author.kind === 'service')) return false;
    if (!f.outsiders && pr.author.kind === 'outsider') return false;
    if (!opts.skipView && !matchesView(pr, f.view, opts.viewer ?? null)) return false;
    if (q && !`${pr.repo} #${pr.number} ${pr.title} ${pr.author.login}`.toLowerCase().includes(q)) return false;
    if (f.repo.length && !f.repo.includes(pr.repo)) return false;
    if (f.author.length && !f.author.includes(pr.author.login)) return false;
    if (f.reviewer.length && ![...pr.requested, ...pr.reviewed].some((l) => f.reviewer.includes(l))) return false;
    if (f.waitingOn.length) {
      const ids = pr.waitingOn.length ? pr.waitingOn.map((w) => w.login) : ['(nobody)'];
      if (!ids.some((l) => f.waitingOn.includes(l))) return false;
    }
    if (f.reason.length && !pr.reasons.some((r) => f.reason.includes(r))) return false;
    if (f.review.length && !f.review.includes(pr.reviewStatus)) return false;
    if (f.check.length && !f.check.includes(pr.checkStatus)) return false;
    if (f.minWait && waitMs(pr, now) < f.minWait * HOUR) return false;
    if (f.maxAge && ageMs(pr, now) > f.maxAge * DAY) return false;
    return true;
  });
}

export function sortPRs(prs: PR[], sort: string, now: number) {
  const keys = sort.split(',').filter(Boolean).map((s) => s.split('.') as [string, string]);
  const val = (pr: PR, k: string): number | string => {
    switch (k) {
      case 'waiting': return waitMs(pr, now);
      case 'age': return ageMs(pr, now);
      case 'repo': return pr.repo;
      case 'title': return pr.title.toLowerCase();
      case 'author': return pr.author.login.toLowerCase();
      case 'review': return REVIEW_RANK[pr.reviewStatus];
      case 'checks': return CHECK_RANK[pr.checkStatus];
      default: return 0;
    }
  };
  return [...prs].sort((a, b) => {
    for (const [k, dir] of keys) {
      const va = val(a, k), vb = val(b, k);
      if (va === vb) continue;
      const c = va < vb ? -1 : 1;
      return dir === 'desc' ? -c : c;
    }
    return 0;
  });
}

// ---- Viewer (localStorage) and sync (fake) --------------------------------

export function useViewer(): [string | null, (login: string | null) => void] {
  const [viewer, set] = useState<string | null>(() => localStorage.getItem('stalemate.viewer'));
  const setViewer = (login: string | null) => {
    if (login) localStorage.setItem('stalemate.viewer', login);
    else localStorage.removeItem('stalemate.viewer');
    set(login);
  };
  return [viewer, setViewer];
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export interface Sync {
  lastSynced: number;
  refreshing: boolean;
  cooldownUntil: number;
  refresh: () => void;
}
const REFRESH_COOLDOWN = 60_000;
export function useSync(): Sync {
  const [lastSynced, setLastSynced] = useState(Date.now() - 47_000);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const refresh = () => {
    if (refreshing || Date.now() < cooldownUntil) return;
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setLastSynced(Date.now());
      setCooldownUntil(Date.now() + REFRESH_COOLDOWN);
    }, 1400);
  };
  // the fake poller: "sync" every 2 minutes
  useEffect(() => {
    const id = setInterval(() => setLastSynced(Date.now()), 120_000);
    return () => clearInterval(id);
  }, []);
  return { lastSynced, refreshing, cooldownUntil, refresh };
}
