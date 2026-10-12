// PROTOTYPE — Variant A: "Power table". One dense, sortable TanStack table under a horizontal filter bar.
import { useMemo } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown, FilterX } from 'lucide-react';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, type SortingState } from '@tanstack/react-table';
import {
  CHECK_LABEL, REASON_LABEL, REVIEW_LABEL, activeFilterCount, ageMs, applyFilters, fmtDuration, sortPRs, waitMs,
  type PR, type View,
} from '../model';
import { ALL_AUTHORS, ALL_REPOS, ALL_REVIEWERS, ALL_WAITING_ON, PRS } from '../mock';
import {
  AGE_PRESETS, CheckBadge, Logo, MultiSelect, PersonChip, ReasonBadges, ReviewBadge, SearchBox, Segmented, SyncStatus,
  Toggle, ViewerPicker, WAIT_PRESETS, WaitTime, WaitingOn, displayName,
} from '../shared';
import type { VariantProps } from '../App';

export const name = 'Power table';

const col = createColumnHelper<PR>();

export function VariantTable({ filters: f, update, reset, viewer, setViewer, sync, now }: VariantProps) {
  const base = useMemo(() => applyFilters(PRS, f, now, { skipView: true }), [f, now]);
  const rows = useMemo(
    () => sortPRs(applyFilters(PRS, f, now, { viewer }), f.sort, now),
    [f, now, viewer],
  );
  const viewCount = (v: View) => applyFilters(base, { ...f, view: v }, now, { viewer }).length;

  const sorting: SortingState = f.sort.split(',').filter(Boolean).map((s) => {
    const [id, dir] = s.split('.');
    return { id, desc: dir === 'desc' };
  });

  const columns = useMemo(
    () => [
      col.accessor(() => 0, {
        id: 'waiting',
        header: 'Waiting On',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <WaitTime ms={waitMs(row.original, now)} />
            <WaitingOn pr={row.original} viewer={viewer} />
          </div>
        ),
      }),
      col.accessor(() => 0, {
        id: 'repo',
        header: 'Repo',
        cell: ({ row }) => <span className="font-mono text-xs whitespace-nowrap text-zinc-600">{row.original.repo}</span>,
      }),
      col.accessor(() => 0, {
        id: 'title',
        header: 'PR',
        cell: ({ row }) => (
          <div className="min-w-64">
            <a href={row.original.url} target="_blank" rel="noreferrer" className="font-medium text-zinc-900 hover:underline">
              {row.original.title}
            </a>
            <span className="ml-1.5 text-xs text-zinc-400">#{row.original.number}</span>
          </div>
        ),
      }),
      col.accessor(() => 0, { id: 'author', header: 'Author', cell: ({ row }) => <PersonChip login={row.original.author.login} viewer={viewer} /> }),
      col.accessor(() => 0, { id: 'review', header: 'Review', cell: ({ row }) => <ReviewBadge pr={row.original} /> }),
      col.accessor(() => 0, { id: 'checks', header: 'Checks', cell: ({ row }) => <CheckBadge status={row.original.checkStatus} /> }),
      col.accessor(() => 0, {
        id: 'age',
        header: 'Age',
        cell: ({ row }) => <span className="text-xs text-zinc-500 tabular-nums">{fmtDuration(ageMs(row.original, now))}</span>,
      }),
      col.display({ id: 'reasons', header: 'Why tracked', enableSorting: false, cell: ({ row }) => <ReasonBadges reasons={row.original.reasons} /> }),
    ],
    [now, viewer],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    manualSorting: true,
    enableMultiSort: true,
    enableSortingRemoval: true,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      update({ sort: next.map((s) => `${s.id}.${s.desc ? 'desc' : 'asc'}`).join(',') });
    },
  });

  const nActive = activeFilterCount(f);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5">
        <Logo />
        <div className="flex items-center gap-5">
          <SyncStatus sync={sync} now={now} />
          <ViewerPicker viewer={viewer} setViewer={setViewer} />
        </div>
      </header>

      <div className="shrink-0 space-y-2.5 border-b border-zinc-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <Segmented
            value={f.view}
            onChange={(view) => update({ view })}
            options={[
              { value: 'all', label: <>All <Count n={viewCount('all')} /></> },
              { value: 'my-turn', label: <>My turn <Count n={viewer ? viewCount('my-turn') : undefined} hot /></> },
              { value: 'my-prs', label: <>My PRs <Count n={viewer ? viewCount('my-prs') : undefined} /></> },
              { value: 'involved', label: <>Involving me <Count n={viewer ? viewCount('involved') : undefined} /></> },
            ]}
          />
          {!viewer && f.view !== 'all' && <span className="text-xs text-amber-700">Pick who you are (top right) to use this view.</span>}
          <SearchBox value={f.q} onChange={(q) => update({ q })} className="ml-auto w-80" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect label="Waiting on" value={f.waitingOn} onChange={(waitingOn) => update({ waitingOn })}
            options={[{ value: '(nobody)', label: <span className="italic text-zinc-500">Nobody</span> }, ...ALL_WAITING_ON.map((l) => ({ value: l, label: displayName(l) }))]} />
          <MultiSelect label="Reviewer" value={f.reviewer} onChange={(reviewer) => update({ reviewer })} options={ALL_REVIEWERS.map((l) => ({ value: l, label: displayName(l) }))} />
          <MultiSelect label="Author" value={f.author} onChange={(author) => update({ author })} options={ALL_AUTHORS.map((l) => ({ value: l, label: l }))} />
          <MultiSelect label="Repo" value={f.repo} onChange={(repo) => update({ repo })} options={ALL_REPOS.map((r) => ({ value: r, label: r }))} />
          <MultiSelect label="Review" value={f.review} onChange={(review) => update({ review })} options={Object.entries(REVIEW_LABEL).map(([value, label]) => ({ value, label }))} />
          <MultiSelect label="Checks" value={f.check} onChange={(check) => update({ check })} options={Object.entries(CHECK_LABEL).map(([value, label]) => ({ value, label }))} />
          <MultiSelect label="Why tracked" value={f.reason} onChange={(reason) => update({ reason })} options={Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label }))} />
          <select value={f.minWait} onChange={(e) => update({ minWait: Number(e.target.value) })} className="h-8 rounded-md border border-dashed border-zinc-300 bg-white px-2 text-sm">
            {WAIT_PRESETS.map((p) => <option key={p.hours} value={p.hours}>Waiting: {p.label}</option>)}
          </select>
          <select value={f.maxAge} onChange={(e) => update({ maxAge: Number(e.target.value) })} className="h-8 rounded-md border border-dashed border-zinc-300 bg-white px-2 text-sm">
            {AGE_PRESETS.map((p) => <option key={p.days} value={p.days}>Age: {p.label}</option>)}
          </select>
          <div className="mx-1 h-5 w-px bg-zinc-200" />
          <Toggle label="Show Bots" checked={f.bots} onChange={(bots) => update({ bots })} />
          <Toggle label="Non-team authors" checked={f.outsiders} onChange={(outsiders) => update({ outsiders })} />
          {nActive > 0 && (
            <button onClick={reset} className="ml-auto inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
              <FilterX className="size-3.5" /> Reset ({nActive})
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const s = h.column.getIsSorted();
                  const idx = sorting.length > 1 ? h.column.getSortIndex() : -1;
                  return (
                    <th key={h.id} className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-zinc-500">
                      {h.column.getCanSort() ? (
                        <button onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-zinc-900" title="Click to sort, Shift+click to add a sort level">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {s === 'asc' ? <ArrowUp className="size-3" /> : s === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-30" />}
                          {idx >= 0 && s && <span className="text-[10px] text-indigo-600">{idx + 1}</span>}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white">
            {table.getRowModel().rows.map((row) => {
              const mine = !!viewer && row.original.waitingOn.some((w) => w.login === viewer);
              return (
                <tr key={row.id} className={clsx('hover:bg-zinc-50', mine && 'bg-indigo-50/50')}>
                  {row.getVisibleCells().map((cell, i) => (
                    <td key={cell.id} className={clsx('border-b border-zinc-100 px-3 py-2 align-middle', i === 0 && mine && 'border-l-2 border-l-indigo-500')}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-16 text-center text-zinc-400">No Tracked PRs match these filters.</div>}
        <div className="px-5 py-3 pb-20 text-xs text-zinc-400">
          {rows.length} of {PRS.length} Tracked PRs · Shift+click a column header to add a secondary sort
        </div>
      </div>
    </div>
  );
}

function Count({ n, hot }: { n?: number; hot?: boolean }) {
  if (n === undefined) return null;
  return <span className={clsx('ml-1 rounded px-1 text-[11px] tabular-nums', hot && n > 0 ? 'bg-indigo-600 text-white' : 'bg-zinc-200 text-zinc-600')}>{n}</span>;
}
