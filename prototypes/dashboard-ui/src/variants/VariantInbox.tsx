// PROTOTYPE — Variant B: "Inbox". Viewer-centric triage: faceted sidebar on the left,
// PRs bucketed by whose move it is relative to *you*, two-line rows sorted by Waiting Time.
import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronRight, Inbox, Send, Eye, Hourglass, Layers } from 'lucide-react';
import {
  CHECK_LABEL, REASON_LABEL, REVIEW_LABEL, activeFilterCount, ageMs, applyFilters, fmtDuration, sortPRs, urgency, waitMs,
  type Filters, type PR, type View,
} from '../model';
import { PRS } from '../mock';
import {
  AGE_PRESETS, Avatar, CheckBadge, Logo, PersonChip, ReasonBadges, ReviewBadge, SearchBox, SyncStatus, Toggle,
  URGENCY_BAR, ViewerPicker, WAIT_PRESETS, WaitingOn, displayName,
} from '../shared';
import type { VariantProps } from '../App';

export const name = 'Inbox';

interface Bucket {
  key: string;
  title: string;
  hint: string;
  icon: ReactNode;
  prs: PR[];
}

function bucketize(prs: PR[], viewer: string | null): Bucket[] {
  if (viewer) {
    const yourTurn: PR[] = [], yours: PR[] = [], nobody: PR[] = [], rest: PR[] = [];
    for (const pr of prs) {
      if (pr.waitingOn.some((w) => w.login === viewer)) yourTurn.push(pr);
      else if (pr.author.login === viewer) yours.push(pr);
      else if (!pr.waitingOn.length) nobody.push(pr);
      else rest.push(pr);
    }
    return [
      { key: 'turn', title: 'Your turn', hint: 'You owe the next move', icon: <Inbox className="size-4" />, prs: yourTurn },
      { key: 'yours', title: 'Your PRs, waiting on others', hint: 'Nudge someone?', icon: <Send className="size-4" />, prs: yours },
      { key: 'nobody', title: 'Nobody’s turn', hint: 'No reviewer requested — easy to miss', icon: <Hourglass className="size-4" />, prs: nobody },
      { key: 'rest', title: 'Rest of the team', hint: 'Waiting on someone else', icon: <Eye className="size-4" />, prs: rest },
    ];
  }
  const reviewers: PR[] = [], authors: PR[] = [], both: PR[] = [], nobody: PR[] = [];
  for (const pr of prs) {
    const roles = new Set(pr.waitingOn.map((w) => w.role));
    if (!roles.size) nobody.push(pr);
    else if (roles.size === 2) both.push(pr);
    else if (roles.has('author')) authors.push(pr);
    else reviewers.push(pr);
  }
  return [
    { key: 'reviewers', title: 'Waiting on reviewers', hint: '', icon: <Eye className="size-4" />, prs: reviewers },
    { key: 'both', title: 'Waiting on author and reviewers', hint: 'e.g. checks failing while review is pending', icon: <Layers className="size-4" />, prs: both },
    { key: 'authors', title: 'Waiting on the author', hint: '', icon: <Send className="size-4" />, prs: authors },
    { key: 'nobody', title: 'Nobody’s turn', hint: 'No reviewer requested', icon: <Hourglass className="size-4" />, prs: nobody },
  ];
}

export function VariantInbox({ filters: f, update, reset, viewer, setViewer, sync, now }: VariantProps) {
  const visible = useMemo(() => sortPRs(applyFilters(PRS, f, now, { viewer }), f.sort, now), [f, now, viewer]);
  const buckets = bucketize(visible, viewer);
  const nActive = activeFilterCount(f);

  return (
    <div className="flex h-screen">
      <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-14 items-center border-b border-zinc-200 px-4"><Logo /></div>
        <div className="border-b border-zinc-200 p-4"><ViewerPicker viewer={viewer} setViewer={setViewer} /></div>
        <div className="flex-1 space-y-5 overflow-auto p-4 pb-24">
          <ViewNav f={f} update={update} viewer={viewer} now={now} />
          <div className="space-y-2">
            <Toggle label="Show Bots" checked={f.bots} onChange={(bots) => update({ bots })} />
            <Toggle label="Show non-team authors" checked={f.outsiders} onChange={(outsiders) => update({ outsiders })} />
          </div>
          <Facet title="Waiting time" >
            <div className="flex flex-wrap gap-1">
              {WAIT_PRESETS.map((p) => (
                <Pill key={p.hours} on={f.minWait === p.hours} onClick={() => update({ minWait: p.hours })}>{p.label}</Pill>
              ))}
            </div>
          </Facet>
          <Facet title="Age">
            <div className="flex flex-wrap gap-1">
              {AGE_PRESETS.map((p) => (
                <Pill key={p.days} on={f.maxAge === p.days} onClick={() => update({ maxAge: p.days })}>{p.label}</Pill>
              ))}
            </div>
          </Facet>
          <FacetList title="Waiting on" field="waitingOn" f={f} update={update} now={now} viewer={viewer}
            values={(pr) => (pr.waitingOn.length ? pr.waitingOn.map((w) => w.login) : ['(nobody)'])}
            render={(v) => (v === '(nobody)' ? <span className="italic text-zinc-500">Nobody</span> : <PersonChip login={v} viewer={viewer} />)} />
          <FacetList title="Review status" field="review" f={f} update={update} now={now} viewer={viewer}
            values={(pr) => [pr.reviewStatus]} render={(v) => REVIEW_LABEL[v as keyof typeof REVIEW_LABEL]} />
          <FacetList title="Checks" field="check" f={f} update={update} now={now} viewer={viewer}
            values={(pr) => [pr.checkStatus]} render={(v) => CHECK_LABEL[v as keyof typeof CHECK_LABEL]} />
          <FacetList title="Reviewer" field="reviewer" f={f} update={update} now={now} viewer={viewer}
            values={(pr) => [...new Set([...pr.requested, ...pr.reviewed])]} render={(v) => <PersonChip login={v} viewer={viewer} />} />
          <FacetList title="Author" field="author" f={f} update={update} now={now} viewer={viewer}
            values={(pr) => [pr.author.login]} render={(v) => <PersonChip login={v} viewer={viewer} />} />
          <FacetList title="Repo" field="repo" f={f} update={update} now={now} viewer={viewer}
            values={(pr) => [pr.repo]} render={(v) => <span className="font-mono text-xs">{v}</span>} />
          <FacetList title="Why tracked" field="reason" f={f} update={update} now={now} viewer={viewer}
            values={(pr) => pr.reasons} render={(v) => REASON_LABEL[v as keyof typeof REASON_LABEL]} />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-5">
          <SearchBox value={f.q} onChange={(q) => update({ q })} className="w-96" />
          <select value={f.sort} onChange={(e) => update({ sort: e.target.value })} className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm">
            <option value="waiting.desc">Longest waiting first</option>
            <option value="waiting.asc">Most recent first</option>
            <option value="age.desc">Oldest PR first</option>
            <option value="repo.asc,waiting.desc">Repo, then waiting</option>
          </select>
          {nActive > 0 && <button onClick={reset} className="text-sm text-zinc-500 hover:text-zinc-900">Clear {nActive} filter{nActive > 1 && 's'}</button>}
          <div className="ml-auto"><SyncStatus sync={sync} now={now} /></div>
        </header>
        <div className="flex-1 space-y-6 overflow-auto bg-zinc-50 p-5 pb-24">
          {!viewer && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
              Tell StaleMate who you are (left) and this page reorganises into <b>Your turn</b>, <b>Your PRs</b> and the rest.
            </div>
          )}
          {buckets.map((b) => <BucketSection key={b.key} bucket={b} viewer={viewer} now={now} defaultOpen={b.key !== 'rest'} />)}
        </div>
      </main>
    </div>
  );
}

function BucketSection({ bucket, viewer, now, defaultOpen }: { bucket: Bucket; viewer: string | null; now: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const stale = bucket.prs.filter((p) => urgency(waitMs(p, now)) === 'stale').length;
  return (
    <section>
      <button onClick={() => setOpen(!open)} className="mb-2 flex w-full items-center gap-2 text-left">
        <ChevronRight className={clsx('size-4 text-zinc-400 transition-transform', open && 'rotate-90')} />
        <span className="text-zinc-500">{bucket.icon}</span>
        <h2 className="font-semibold">{bucket.title}</h2>
        <span className="rounded-full bg-zinc-200 px-2 text-xs font-medium tabular-nums">{bucket.prs.length}</span>
        {stale > 0 && <span className="rounded-full bg-red-100 px-2 text-xs font-medium text-red-700 tabular-nums">{stale} &gt; 3d</span>}
        {bucket.hint && <span className="text-xs text-zinc-400">— {bucket.hint}</span>}
      </button>
      {open && (
        <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {bucket.prs.length === 0 && <div className="px-4 py-6 text-center text-sm text-zinc-400">Nothing here 🎉</div>}
          {bucket.prs.map((pr) => <InboxRow key={pr.id} pr={pr} viewer={viewer} now={now} />)}
        </div>
      )}
    </section>
  );
}

function InboxRow({ pr, viewer, now }: { pr: PR; viewer: string | null; now: number }) {
  const w = waitMs(pr, now);
  const u = urgency(w);
  return (
    <div className="group flex items-stretch hover:bg-zinc-50">
      <div className={clsx('w-1 shrink-0', URGENCY_BAR[u])} />
      <div className="flex w-20 shrink-0 flex-col items-end justify-center pr-3">
        <span className={clsx('text-base font-semibold tabular-nums', u === 'stale' ? 'text-red-600' : u === 'aging' ? 'text-amber-600' : 'text-zinc-700')}>
          {fmtDuration(w)}
        </span>
        <span className="text-[10px] text-zinc-400">waiting</span>
      </div>
      <div className="min-w-0 flex-1 py-2.5">
        <div className="flex items-center gap-2">
          <a href={pr.url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">{pr.title}</a>
          <span className="shrink-0 font-mono text-xs text-zinc-400">{pr.repo}#{pr.number}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1"><Avatar login={pr.author.login} size={16} /> {displayName(pr.author.login)}</span>
          <ReviewBadge pr={pr} />
          <CheckBadge status={pr.checkStatus} />
          <span>opened {fmtDuration(ageMs(pr, now))} ago</span>
          <ReasonBadges reasons={pr.reasons} />
        </div>
      </div>
      <div className="flex w-72 shrink-0 items-center justify-end px-4">
        <WaitingOn pr={pr} viewer={viewer} />
      </div>
    </div>
  );
}

function ViewNav({ f, update, viewer, now }: { f: Filters; update: (p: Partial<Filters>) => void; viewer: string | null; now: number }) {
  const base = applyFilters(PRS, f, now, { skipView: true });
  const count = (v: View) => applyFilters(base, { ...f, view: v }, now, { viewer }).length;
  const items: { v: View; label: string }[] = [
    { v: 'all', label: 'Everything' },
    { v: 'my-turn', label: 'My turn' },
    { v: 'my-prs', label: 'My PRs' },
    { v: 'involved', label: 'Involving me' },
  ];
  return (
    <nav className="space-y-0.5">
      {items.map(({ v, label }) => {
        const disabled = v !== 'all' && !viewer;
        return (
          <button key={v} disabled={disabled} onClick={() => update({ view: v })}
            className={clsx('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm', f.view === v ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100', disabled && 'cursor-not-allowed opacity-40')}>
            {label}
            {!disabled && <span className="text-xs tabular-nums opacity-70">{count(v)}</span>}
          </button>
        );
      })}
    </nav>
  );
}

function Facet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">{title}</h3>
      {children}
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={clsx('rounded-full border px-2 py-0.5 text-xs', on ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100')}>
      {children}
    </button>
  );
}

type ArrayField = 'waitingOn' | 'review' | 'check' | 'reviewer' | 'author' | 'repo' | 'reason';
function FacetList({ title, field, f, update, values, render, now, viewer }: {
  title: string; field: ArrayField; f: Filters; update: (p: Partial<Filters>) => void;
  values: (pr: PR) => string[]; render: (v: string) => ReactNode; now: number; viewer: string | null;
}) {
  const [more, setMore] = useState(false);
  // counts honour every other filter, but not this facet's own selection
  const counts = new Map<string, number>();
  for (const pr of applyFilters(PRS, { ...f, [field]: [] }, now, { viewer })) for (const v of values(pr)) counts.set(v, (counts.get(v) ?? 0) + 1);
  const selected = f[field];
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const s of selected) if (!counts.has(s)) entries.push([s, 0]);
  const shown = more ? entries : entries.slice(0, 6);
  const toggle = (v: string) => update({ [field]: selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v] } as Partial<Filters>);
  return (
    <Facet title={title}>
      <div className="space-y-px">
        {shown.map(([v, n]) => (
          <button key={v} onClick={() => toggle(v)} className={clsx('flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm', selected.includes(v) ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-zinc-100')}>
            <input type="checkbox" readOnly checked={selected.includes(v)} className="accent-indigo-600" />
            <span className="min-w-0 flex-1 truncate">{render(v)}</span>
            <span className="text-xs text-zinc-400 tabular-nums">{n}</span>
          </button>
        ))}
        {entries.length > 6 && (
          <button onClick={() => setMore(!more)} className="px-1.5 text-xs text-indigo-600 hover:underline">
            {more ? 'Show less' : `Show ${entries.length - 6} more`}
          </button>
        )}
      </div>
    </Facet>
  );
}
