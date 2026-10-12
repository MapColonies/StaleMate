// PROTOTYPE — Variant C: "People board". One column per person who owes a move — answers
// "who is the bottleneck right now?" at a glance. A PR waiting on two people shows in both columns.
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { SlidersHorizontal, Users2 } from 'lucide-react';
import {
  CHECK_LABEL, REASON_LABEL, REVIEW_LABEL, activeFilterCount, ageMs, applyFilters, fmtDuration, urgency, waitMs,
  type PR,
} from '../model';
import { ALL_AUTHORS, ALL_REPOS, ALL_REVIEWERS, PEOPLE, PRS } from '../mock';
import {
  AGE_PRESETS, Avatar, CheckBadge, Logo, MultiSelect, ReasonBadges, ReviewBadge, SearchBox, Segmented, SyncStatus,
  Toggle, URGENCY_BAR, ViewerPicker, WAIT_PRESETS, WaitTime, displayName,
} from '../shared';
import type { VariantProps } from '../App';

export const name = 'People board';

const NOBODY = '(nobody)';

export function VariantBoard({ filters: f, update, reset, viewer, setViewer, sync, now }: VariantProps) {
  const [showFilters, setShowFilters] = useState(false);
  // this variant replaces the "view" tabs with "My column" highlighting, so ignore view
  const visible = useMemo(() => applyFilters(PRS, { ...f, view: 'all' }, now), [f, now]);

  const columns = useMemo(() => {
    const byPerson = new Map<string, PR[]>();
    for (const pr of visible) {
      const keys = pr.waitingOn.length ? pr.waitingOn.map((w) => w.login) : [NOBODY];
      for (const k of keys) byPerson.set(k, [...(byPerson.get(k) ?? []), pr]);
    }
    for (const prs of byPerson.values()) prs.sort((a, b) => b.waitingSince < a.waitingSince ? 1 : -1);
    const rank = (login: string) => (login === viewer ? 0 : login === NOBODY ? 3 : PEOPLE[login]?.kind === 'member' || PEOPLE[login]?.kind === 'team' ? 1 : 2);
    return [...byPerson.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length);
  }, [visible, viewer]);

  const staleCount = visible.filter((p) => urgency(waitMs(p, now)) === 'stale').length;
  const oldest = visible.reduce((m, p) => Math.max(m, waitMs(p, now)), 0);
  const nActive = activeFilterCount(f);

  return (
    <div className="flex h-screen flex-col bg-zinc-100">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-5">
        <Logo />
        <div className="ml-4 flex items-center gap-4 text-sm">
          <Stat label="tracked" value={visible.length} />
          <Stat label="waiting > 3d" value={staleCount} tone="red" />
          <Stat label="oldest wait" value={fmtDuration(oldest)} />
          <Stat label="nobody's turn" value={visible.filter((p) => !p.waitingOn.length).length} tone="amber" />
        </div>
        <div className="ml-auto flex items-center gap-5">
          <SyncStatus sync={sync} now={now} />
          <ViewerPicker viewer={viewer} setViewer={setViewer} />
        </div>
      </header>

      <div className="shrink-0 border-b border-zinc-200 bg-white px-5 py-2">
        <div className="flex items-center gap-3">
          <SearchBox value={f.q} onChange={(q) => update({ q })} className="w-80" />
          <Segmented value={f.minWait} onChange={(minWait) => update({ minWait })} options={WAIT_PRESETS.map((p) => ({ value: p.hours, label: p.label }))} />
          <Toggle label="Bots" checked={f.bots} onChange={(bots) => update({ bots })} />
          <Toggle label="Non-team authors" checked={f.outsiders} onChange={(outsiders) => update({ outsiders })} />
          <button onClick={() => setShowFilters(!showFilters)} className={clsx('ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm', showFilters ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')}>
            <SlidersHorizontal className="size-3.5" /> More filters {nActive > 0 && <span className="rounded bg-indigo-600 px-1 text-[11px] text-white">{nActive}</span>}
          </button>
          {nActive > 0 && <button onClick={reset} className="text-sm text-zinc-500 hover:text-zinc-900">Reset</button>}
        </div>
        {showFilters && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2">
            <MultiSelect label="Repo" value={f.repo} onChange={(repo) => update({ repo })} options={ALL_REPOS.map((r) => ({ value: r, label: r }))} />
            <MultiSelect label="Author" value={f.author} onChange={(author) => update({ author })} options={ALL_AUTHORS.map((l) => ({ value: l, label: l }))} />
            <MultiSelect label="Reviewer" value={f.reviewer} onChange={(reviewer) => update({ reviewer })} options={ALL_REVIEWERS.map((l) => ({ value: l, label: displayName(l) }))} />
            <MultiSelect label="Review" value={f.review} onChange={(review) => update({ review })} options={Object.entries(REVIEW_LABEL).map(([value, label]) => ({ value, label }))} />
            <MultiSelect label="Checks" value={f.check} onChange={(check) => update({ check })} options={Object.entries(CHECK_LABEL).map(([value, label]) => ({ value, label }))} />
            <MultiSelect label="Why tracked" value={f.reason} onChange={(reason) => update({ reason })} options={Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label }))} />
            <Segmented value={f.maxAge} onChange={(maxAge) => update({ maxAge })} options={AGE_PRESETS.map((p) => ({ value: p.days, label: p.label }))} />
          </div>
        )}
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto p-4 pb-20">
        {columns.map(([login, prs]) => (
          <Column key={login} login={login} prs={prs} viewer={viewer} now={now} />
        ))}
        {columns.length === 0 && <div className="m-auto text-zinc-400">No Tracked PRs match these filters.</div>}
      </div>
    </div>
  );
}

function Column({ login, prs, viewer, now }: { login: string; prs: PR[]; viewer: string | null; now: number }) {
  const isViewer = login === viewer;
  const isNobody = login === NOBODY;
  const oldest = prs.length ? waitMs(prs[0], now) : 0;
  const stale = prs.filter((p) => urgency(waitMs(p, now)) === 'stale').length;
  return (
    <section className={clsx('flex w-80 shrink-0 flex-col rounded-xl', isViewer ? 'bg-indigo-100/70 ring-2 ring-indigo-400' : isNobody ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-zinc-200/60')}>
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        {isNobody ? <Users2 className="size-5 text-amber-600" /> : <Avatar login={login} size={26} />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{isNobody ? 'Nobody’s turn' : isViewer ? `You (${login})` : displayName(login)}</div>
          <div className="text-xs text-zinc-500">
            {prs.length} PR{prs.length !== 1 && 's'} · oldest {fmtDuration(oldest)}
            {stale > 0 && <span className="ml-1 font-medium text-red-600">· {stale} stale</span>}
          </div>
        </div>
        {PEOPLE[login]?.kind === 'outsider' && <span className="rounded bg-white px-1 text-[10px] text-zinc-500 uppercase">ext</span>}
      </div>
      {/* load bar: share of this column that is stale/aging */}
      <div className="mx-3 mb-2 flex h-1 overflow-hidden rounded-full bg-white/70">
        {(['stale', 'aging', 'fresh'] as const).map((u) => (
          <div key={u} className={URGENCY_BAR[u]} style={{ width: `${(prs.filter((p) => urgency(waitMs(p, now)) === u).length / Math.max(1, prs.length)) * 100}%` }} />
        ))}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {prs.map((pr) => <Card key={pr.id} pr={pr} column={login} viewer={viewer} now={now} />)}
      </div>
    </section>
  );
}

function Card({ pr, column, viewer, now }: { pr: PR; column: string; viewer: string | null; now: number }) {
  const u = urgency(waitMs(pr, now));
  const role = pr.waitingOn.find((w) => w.login === column)?.role;
  const others = pr.waitingOn.filter((w) => w.login !== column);
  return (
    <a href={pr.url} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-lg border border-zinc-200 bg-white p-2.5 pl-3.5 shadow-xs hover:border-zinc-300 hover:shadow">
      <span className={clsx('absolute inset-y-0 left-0 w-1', URGENCY_BAR[u])} />
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-zinc-500">{pr.repo}#{pr.number}</span>
        <WaitTime ms={waitMs(pr, now)} />
      </div>
      <div className="line-clamp-2 text-sm leading-snug font-medium">{pr.title}</div>
      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
        <Avatar login={pr.author.login} size={16} ring={pr.author.login === viewer} />
        <span className="truncate">{displayName(pr.author.login)}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <ReviewBadge pr={pr} iconOnly />
          <CheckBadge status={pr.checkStatus} iconOnly />
          <span className="tabular-nums" title="PR age">{fmtDuration(ageMs(pr, now))}</span>
        </span>
      </div>
      {(role || others.length > 0) && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
          {role && <span className="rounded bg-zinc-100 px-1">{role === 'author' ? 'as author' : 'as reviewer'}</span>}
          {others.length > 0 && (
            <span className="inline-flex items-center gap-1">
              also waiting on {others.map((o) => <Avatar key={o.login} login={o.login} size={14} ring={o.login === viewer} />)}
            </span>
          )}
        </div>
      )}
      <div className="mt-1.5"><ReasonBadges reasons={pr.reasons} /></div>
    </a>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'red' | 'amber' }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={clsx('font-semibold tabular-nums', tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-zinc-900')}>{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </span>
  );
}
