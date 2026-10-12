// PROTOTYPE — throwaway. Small shadcn-flavoured building blocks shared across variants.
// Layout is NOT shared: each variant owns its own page structure.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Bot, Check, ChevronDown, CircleDashed, CircleDot, CircleX, GitPullRequestDraft, MessageSquare,
  RefreshCw, ShieldCheck, Users, X, CircleCheck, CircleMinus, Clock,
} from 'lucide-react';
import {
  CHECK_LABEL, REASON_LABEL, REVIEW_LABEL, fmtDuration, urgency,
  type CheckStatus, type PR, type Reason, type ReviewStatus, type Sync, type Urgency,
} from './model';
import { PEOPLE, VIEWER_OPTIONS } from './mock';

// ---- people ---------------------------------------------------------------

const HUES = [210, 340, 160, 30, 270, 190, 0, 100, 240, 50];
function hue(login: string) {
  let h = 0;
  for (const ch of login) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export function Avatar({ login, size = 20, ring }: { login: string; size?: number; ring?: boolean }) {
  const kind = PEOPLE[login]?.kind;
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (kind === 'bot' || kind === 'service')
    return (
      <span title={login} style={style} className="inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500">
        <Bot style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    );
  if (kind === 'team')
    return (
      <span title={login} style={style} className="inline-flex shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
        <Users style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    );
  const h = hue(login);
  return (
    <span
      title={login}
      style={{ ...style, background: `hsl(${h} 70% 92%)`, color: `hsl(${h} 50% 32%)` }}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase',
        kind === 'outsider' && 'border border-dashed border-zinc-400',
        ring && 'ring-2 ring-indigo-500 ring-offset-1',
      )}
    >
      {login.replace(/[^a-z0-9]/gi, '').slice(0, 2)}
    </span>
  );
}

export function displayName(login: string) {
  return PEOPLE[login]?.kind === 'team' ? 'infra (team)' : login;
}

export function PersonChip({ login, viewer, muted }: { login: string; viewer?: string | null; muted?: boolean }) {
  const isViewer = viewer === login;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap', muted && 'text-zinc-500')}>
      <Avatar login={login} size={18} ring={isViewer} />
      <span className={clsx('text-[13px]', isViewer && 'font-semibold text-indigo-700')}>{isViewer ? 'You' : displayName(login)}</span>
      {PEOPLE[login]?.kind === 'outsider' && <span className="text-[10px] uppercase tracking-wide text-zinc-400">ext</span>}
    </span>
  );
}

/** Waiting On: author / reviewers / both / nobody. */
export function WaitingOn({ pr, viewer, compact }: { pr: PR; viewer: string | null; compact?: boolean }) {
  if (!pr.waitingOn.length)
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-zinc-400 italic" title="No reviewer requested and nobody has reviewed">
        <CircleDashed className="size-3.5" /> Nobody — no reviewer requested
      </span>
    );
  if (compact)
    return (
      <span className="inline-flex items-center -space-x-1">
        {pr.waitingOn.map((w) => (
          <Avatar key={w.login} login={w.login} size={22} ring={w.login === viewer} />
        ))}
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {pr.waitingOn.map((w) => (
        <span key={w.login} className="inline-flex items-center gap-1">
          <PersonChip login={w.login} viewer={viewer} />
          <span className="text-[10px] uppercase tracking-wide text-zinc-400">{w.role === 'author' ? 'author' : 'review'}</span>
        </span>
      ))}
    </span>
  );
}

// ---- statuses -------------------------------------------------------------

const URGENCY_CLASS: Record<Urgency, string> = {
  fresh: 'bg-zinc-100 text-zinc-600',
  aging: 'bg-amber-100 text-amber-800',
  stale: 'bg-red-100 text-red-700',
};
export const URGENCY_BAR: Record<Urgency, string> = { fresh: 'bg-zinc-200', aging: 'bg-amber-400', stale: 'bg-red-500' };

export function WaitTime({ ms, big }: { ms: number; big?: boolean }) {
  const u = urgency(ms);
  return (
    <span
      title={`Waiting ${fmtDuration(ms)}`}
      className={clsx('inline-flex items-center gap-1 rounded-md font-medium tabular-nums', URGENCY_CLASS[u], big ? 'px-2 py-1 text-sm' : 'px-1.5 py-0.5 text-xs')}
    >
      <Clock className={big ? 'size-3.5' : 'size-3'} />
      {fmtDuration(ms)}
    </span>
  );
}

const REVIEW_STYLE: Record<ReviewStatus, { cls: string; icon: ReactNode }> = {
  draft: { cls: 'text-zinc-500 bg-zinc-100', icon: <GitPullRequestDraft className="size-3" /> },
  'review-required': { cls: 'text-sky-700 bg-sky-50', icon: <CircleDot className="size-3" /> },
  commented: { cls: 'text-violet-700 bg-violet-50', icon: <MessageSquare className="size-3" /> },
  'changes-requested': { cls: 'text-orange-700 bg-orange-50', icon: <CircleX className="size-3" /> },
  approved: { cls: 'text-emerald-700 bg-emerald-50', icon: <ShieldCheck className="size-3" /> },
};
export function ReviewBadge({ pr, iconOnly }: { pr: PR; iconOnly?: boolean }) {
  const s = REVIEW_STYLE[pr.reviewStatus];
  const label = REVIEW_LABEL[pr.reviewStatus] + (pr.reviewStatus === 'approved' && pr.approvals > 1 ? ` ×${pr.approvals}` : '');
  return (
    <span title={label} className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', s.cls)}>
      {s.icon}
      {!iconOnly && label}
    </span>
  );
}

const CHECK_STYLE: Record<CheckStatus, { cls: string; icon: ReactNode }> = {
  passing: { cls: 'text-emerald-600', icon: <CircleCheck className="size-3.5" /> },
  failing: { cls: 'text-red-600', icon: <CircleX className="size-3.5" /> },
  pending: { cls: 'text-amber-600', icon: <CircleDashed className="size-3.5 animate-spin [animation-duration:3s]" /> },
  none: { cls: 'text-zinc-400', icon: <CircleMinus className="size-3.5" /> },
};
export function CheckBadge({ status, iconOnly }: { status: CheckStatus; iconOnly?: boolean }) {
  const s = CHECK_STYLE[status];
  return (
    <span title={CHECK_LABEL[status]} className={clsx('inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap', s.cls)}>
      {s.icon}
      {!iconOnly && CHECK_LABEL[status]}
    </span>
  );
}

const REASON_CLASS: Record<Reason, string> = {
  'team-repo': 'border-zinc-300 text-zinc-600',
  authored: 'border-indigo-200 text-indigo-700',
  'review-requested': 'border-sky-200 text-sky-700',
  'team-requested': 'border-indigo-200 text-indigo-600 border-dashed',
  reviewed: 'border-teal-200 text-teal-700',
  assigned: 'border-fuchsia-200 text-fuchsia-700',
};
export function ReasonBadges({ reasons }: { reasons: Reason[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span key={r} className={clsx('rounded border px-1 py-px text-[10px] font-medium whitespace-nowrap', REASON_CLASS[r])}>
          {REASON_LABEL[r]}
        </span>
      ))}
    </span>
  );
}

// ---- header pieces --------------------------------------------------------

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">♞</div>
      <span className="font-semibold tracking-tight">StaleMate</span>
      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">@MapColonies/infra</span>
    </div>
  );
}

export function ViewerPicker({ viewer, setViewer }: { viewer: string | null; setViewer: (v: string | null) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-zinc-500">I am</span>
      <span className="relative">
        {viewer && <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"><Avatar login={viewer} size={18} /></span>}
        <select
          value={viewer ?? ''}
          onChange={(e) => setViewer(e.target.value || null)}
          className={clsx(
            'h-8 appearance-none rounded-md border border-zinc-200 bg-white pr-7 text-sm shadow-xs outline-none focus:ring-2 focus:ring-indigo-500/30',
            viewer ? 'pl-8' : 'pl-2.5 text-zinc-400',
          )}
        >
          <option value="">Pick yourself…</option>
          {VIEWER_OPTIONS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-zinc-400" />
      </span>
    </label>
  );
}

export function SyncStatus({ sync, now }: { sync: Sync; now: number }) {
  const cooling = now < sync.cooldownUntil;
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <span className="flex items-center gap-1.5">
        <span className={clsx('size-1.5 rounded-full', sync.refreshing ? 'animate-pulse bg-amber-500' : 'bg-emerald-500')} />
        {sync.refreshing ? 'Syncing with GitHub…' : now - sync.lastSynced < 60_000 ? 'Synced just now' : `Synced ${fmtDuration(now - sync.lastSynced)} ago`}
      </span>
      <button
        onClick={sync.refresh}
        disabled={sync.refreshing || cooling}
        title={cooling ? `Rate-limited — available in ${Math.ceil((sync.cooldownUntil - now) / 1000)}s` : 'Sync now'}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={clsx('size-3', sync.refreshing && 'animate-spin')} />
        {cooling ? `${Math.ceil((sync.cooldownUntil - now) / 1000)}s` : 'Refresh now'}
      </button>
    </div>
  );
}

// ---- inputs ---------------------------------------------------------------

export interface Option {
  value: string;
  label: ReactNode;
  count?: number;
}

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  });
  return ref;
}

export function MultiSelect({ label, options, value, onChange }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useClickOutside(() => setOpen(false));
  const shown = options.filter((o) => !q || o.value.toLowerCase().includes(q.toLowerCase()));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm shadow-xs',
          value.length ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-dashed border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50',
        )}
      >
        {label}
        {value.length > 0 && (
          <span className="rounded bg-indigo-600 px-1 text-[11px] font-semibold text-white">{value.length}</span>
        )}
        <ChevronDown className="size-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-9 left-0 z-30 w-64 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
          {options.length > 8 && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="mb-1 h-8 w-full rounded-md border border-zinc-200 px-2 text-sm outline-none"
            />
          )}
          <div className="max-h-72 overflow-auto">
            {shown.map((o) => (
              <button key={o.value} onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100">
                <span className={clsx('flex size-4 items-center justify-center rounded border', value.includes(o.value) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-zinc-300')}>
                  {value.includes(o.value) && <Check className="size-3" />}
                </span>
                <span className="flex-1 truncate">{o.label}</span>
                {o.count !== undefined && <span className="text-xs text-zinc-400 tabular-nums">{o.count}</span>}
              </button>
            ))}
          </div>
          {value.length > 0 && (
            <button onClick={() => onChange([])} className="mt-1 w-full rounded border-t border-zinc-100 px-2 py-1.5 text-center text-xs text-zinc-500 hover:bg-zinc-50">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm text-zinc-700">
      <span className={clsx('relative h-[18px] w-8 rounded-full transition-colors', checked ? 'bg-zinc-900' : 'bg-zinc-300')}>
        <span className={clsx('absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-all', checked ? 'left-4' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}

export function SearchBox({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search title, repo, #number, author…"
        className="h-8 w-full rounded-md border border-zinc-200 bg-white pr-7 pl-2.5 text-sm shadow-xs outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute top-1/2 right-2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export const WAIT_PRESETS = [
  { hours: 0, label: 'Any wait' },
  { hours: 24, label: '> 1 day' },
  { hours: 72, label: '> 3 days' },
  { hours: 168, label: '> 1 week' },
];
export const AGE_PRESETS = [
  { days: 0, label: 'Any age' },
  { days: 7, label: '< 1 week' },
  { days: 30, label: '< 1 month' },
  { days: 90, label: '< 3 months' },
];

export function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md bg-zinc-100 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={clsx('rounded px-2.5 py-1 text-sm whitespace-nowrap', o.value === value ? 'bg-white font-medium text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PRLink({ pr, className }: { pr: PR; className?: string }) {
  return (
    <a href={pr.url} target="_blank" rel="noreferrer" className={clsx('hover:underline', className)}>
      {pr.title}
    </a>
  );
}
