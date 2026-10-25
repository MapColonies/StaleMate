import { useMemo } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from 'lucide-react';
import { createColumnHelper, functionalUpdate, useTable, type Header } from '@tanstack/react-table';
import {
  AgeChip,
  CheckStatusBadge,
  ConflictBadge,
  IdleLine,
  InclusionReasonBadge,
  JiraTickets,
  NoReviewerFlag,
  PersonChip,
  RepoName,
  ReviewStatusBadge,
  WaitingOnChips,
} from '@/cells';
import { CheckboxMenu } from '@/components/checkbox-menu';
import { FilterBar } from '@/filters/filter-bar';
import { REVIEW_STATUSES, applyFilters } from '@/filters/filter-model';
import { useFilters } from '@/filters/use-filters';
import { cn } from '@/lib/utils';
import { isWaitingOnViewer, sharedOrg } from '@/snapshot/selectors';
import type { CheckStatus, Snapshot, TrackedPr } from '@/snapshot/types';
import { COLUMN_NAMES, type ColumnId, features } from './table-model';
import { TAB_NAMES, TABS, type Tab, prsInTab } from './tabs';
import { useHiddenColumns } from './use-hidden-columns';
import { isDefaultSorting, useTableUrlState } from './table-url';

const helper = createColumnHelper<typeof features, TrackedPr>();

// Ascending puts what needs fixing first.
const CHECK_ORDER: readonly CheckStatus[] = ['failing', 'pending', 'passing', 'none'];

/** What the cells need beyond the PR. */
interface CellContext {
  viewer: string | null;
  hideViaTeam: boolean;
  now: number;
  jiraBaseUrl: string | undefined;
  /** The org every Tracked PR's repo is in, which the Repo column leaves out. */
  org: string | null;
}

function tableColumns({ viewer, hideViaTeam, now, jiraBaseUrl, org }: CellContext) {
  return helper.columns([
    helper.accessor((pr) => pr.age.workingMs, {
      id: 'age',
      header: COLUMN_NAMES.age,
      sortFn: 'basic',
      sortDescFirst: true,
      cell: ({ row }) => <AgeChip pr={row.original} now={now} />,
    }),
    helper.accessor((pr) => pr.idleTime.workingMs, {
      id: 'idle',
      header: COLUMN_NAMES.idle,
      sortFn: 'basic',
      sortDescFirst: true,
      cell: ({ row }) => <IdleLine pr={row.original} />,
    }),
    helper.accessor('title', {
      header: COLUMN_NAMES.title,
      sortFn: 'text',
      enableHiding: false,
      cell: ({ row }) => (
        <div className="min-w-64">
          <a href={row.original.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
            {row.original.title}
          </a>
          <span className="ml-1.5 text-xs text-muted-foreground">#{row.original.number}</span>
        </div>
      ),
    }),
    helper.display({
      id: 'waitingOn',
      // It carries the No Reviewer flag, which every view shows.
      enableHiding: false,
      header: COLUMN_NAMES.waitingOn,
      // The PR takes the spare width, so without a floor most rows' chips would wrap onto a second line.
      cell: ({ row }) => (
        <div className="flex min-w-80 flex-wrap items-center gap-2">
          <WaitingOnChips pr={row.original} viewer={viewer} hideViaTeam={hideViaTeam} />
          <NoReviewerFlag pr={row.original} />
        </div>
      ),
    }),
    helper.accessor('repo', {
      header: COLUMN_NAMES.repo,
      sortFn: 'text',
      cell: ({ row }) => (
        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
          <RepoName repo={row.original.repo} org={org} />
        </span>
      ),
    }),
    helper.accessor((pr) => pr.author.login, {
      id: 'author',
      header: COLUMN_NAMES.author,
      sortFn: 'text',
      cell: ({ row }) => <PersonChip person={row.original.author} viewer={viewer} />,
    }),
    helper.accessor((pr) => REVIEW_STATUSES.indexOf(pr.reviewStatus), {
      id: 'review',
      header: COLUMN_NAMES.review,
      sortFn: 'basic',
      cell: ({ row }) => <ReviewStatusBadge pr={row.original} />,
    }),
    helper.accessor((pr) => CHECK_ORDER.indexOf(pr.checkStatus), {
      id: 'checks',
      header: COLUMN_NAMES.checks,
      sortFn: 'basic',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2">
          <CheckStatusBadge status={row.original.checkStatus} />
          <ConflictBadge pr={row.original} />
        </span>
      ),
    }),
    // Ascending puts the PRs without a Jira Ticket first. Without a Jira site there is nothing to show.
    ...(jiraBaseUrl === undefined
      ? []
      : [
          // Padding the number sorts MAPCO-9 before MAPCO-10.
          helper.accessor((pr) => pr.jiraTickets[0]?.replace(/\d+$/, (number) => number.padStart(12, '0')) ?? '', {
            id: 'jira',
            header: COLUMN_NAMES.jira,
            sortFn: 'text',
            cell: ({ row }) => <JiraTickets pr={row.original} jiraBaseUrl={jiraBaseUrl} compact />,
          }),
        ]),
    helper.display({
      id: 'reasons',
      header: COLUMN_NAMES.reasons,
      cell: ({ row }) => <InclusionReasonBadge pr={row.original} viewer={viewer} />,
    }),
  ]);
}

/** The tabs, each with how many PRs it holds. The Viewer's tabs have no count without a Viewer. */
function TabBar({ tab, counts, onChange }: { tab: Tab; counts: Partial<Record<Tab, number>>; onChange: (tab: Tab) => void }) {
  return (
    <div role="tablist" aria-label="PRs to show" className="inline-flex rounded-md bg-muted p-0.5">
      {TABS.map((value) => {
        const count = counts[value];
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={value === tab}
            onClick={() => onChange(value)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2.5 py-1 text-sm whitespace-nowrap',
              value === tab ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {TAB_NAMES[value]}
            {count !== undefined && (
              <>
                {' '}
                <span
                  className={cn(
                    'rounded px-1 text-[11px] tabular-nums',
                    value === 'my-turn' && count > 0 ? 'bg-indigo-600 text-white' : 'bg-muted-foreground/15 text-muted-foreground'
                  )}
                >
                  {count}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SortableHeader({ header, multiSort }: { header: Header<typeof features, TrackedPr, unknown>; multiSort: boolean }) {
  const { column } = header;
  const name = COLUMN_NAMES[column.id as ColumnId];
  if (!column.getCanSort()) {
    return <>{name}</>;
  }
  const direction = column.getIsSorted();
  const level = column.getSortIndex();
  const Arrow = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      title="Click to sort, Shift+click to add a sort level"
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {name}
      <Arrow aria-hidden className={cn('size-3', direction === false && 'opacity-30')} />
      {direction !== false && multiSort && <span className="text-[10px] text-indigo-600 dark:text-indigo-400">{level + 1}</span>}
    </button>
  );
}

// The PR names the row, so once Age and Idle scroll out of view it sticks to the left edge.
const PINNED_COLUMN: ColumnId = 'title';

const PINNED = 'sticky left-0 z-1 border-r border-r-border/60';

// A pinned cell needs an opaque background to cover what scrolls under it, so it repeats the row's tint, and the hover's,
// on a layer above that.
const PINNED_CELL = `${PINNED} bg-background before:pointer-events-none before:absolute before:inset-0 before:-z-1 group-hover:before:bg-accent/60`;

// Each pinned cell repeats its row's tint, so the two change together.
const HIGHLIGHTS = {
  noReviewer: {
    row: 'bg-amber-50/70 dark:bg-amber-950/30',
    firstCell: 'border-l-2 border-l-amber-500',
    pinnedCell: 'before:bg-amber-50/70 dark:before:bg-amber-950/30',
  },
  viewersTurn: {
    row: 'bg-indigo-50/50 dark:bg-indigo-950/30',
    firstCell: 'border-l-2 border-l-indigo-500',
    pinnedCell: 'before:bg-indigo-50/50 dark:before:bg-indigo-950/30',
  },
} as const;

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/**
 * The Table (prototype variant A): every Tracked PR that passes the filters in one dense table, under tabs for the Viewer's
 * own slices. Shift+click sorts by more than one column; the column picker hides columns.
 */
export function TableView({ snapshot, viewer, now }: { snapshot: Snapshot; viewer: string | null; now: number }) {
  const { filters, setFilters, resetFilters } = useFilters();
  const { tab, setTab, sorting, setSorting, resetSorting } = useTableUrlState();
  const [columnVisibility, setColumnVisibility] = useHiddenColumns();

  const filtered = useMemo(() => applyFilters(snapshot.prs, filters), [snapshot.prs, filters]);
  const rows = useMemo(() => prsInTab(filtered, tab, viewer, filters), [filtered, tab, viewer, filters]);
  const counts = useMemo(
    () =>
      Object.fromEntries((viewer === null ? (['all'] as const) : TABS).map((value) => [value, prsInTab(filtered, value, viewer, filters).length])),
    [filtered, viewer, filters]
  );
  const { jiraBaseUrl } = snapshot.config;
  const org = useMemo(() => sharedOrg(snapshot.prs), [snapshot.prs]);
  const columns = useMemo(
    () => tableColumns({ viewer, hideViaTeam: filters.hideViaTeam, now, jiraBaseUrl, org }),
    [viewer, filters.hideViaTeam, now, jiraBaseUrl, org]
  );

  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (pr) => pr.id,
    state: { sorting, columnVisibility },
    onSortingChange: (updater) => setSorting(functionalUpdate(updater, sorting)),
    onColumnVisibilityChange: (updater) => setColumnVisibility(functionalUpdate(updater, columnVisibility)),
    enableMultiSort: true,
    // A sort level is replaced or flipped, never dropped: the table always has an order.
    enableSortingRemoval: false,
  });

  const hideable = table.getAllLeafColumns().filter((column) => column.getCanHide());

  return (
    // The Table fills the window: the tabs, Columns picker and filters stay put, and the PRs scroll both ways below them,
    // so the headers stay in view and the sideways scrollbar sits at the bottom of the window.
    <section className="flex h-full flex-col">
      <div className="shrink-0 space-y-2.5 border-b bg-background px-5 py-3">
        <div className="flex items-center gap-3">
          <TabBar tab={tab} counts={counts} onChange={setTab} />
          {viewer === null && tab !== 'all' && (
            <span className="text-xs text-amber-700 dark:text-amber-400">Pick who you are in I am… (top right) to use this tab.</span>
          )}
          <div className="ml-auto">
            <CheckboxMenu
              align="right"
              label={
                <>
                  <Columns3 className="size-3.5" /> Columns
                </>
              }
              options={hideable.map((column) => ({ value: column.id, label: COLUMN_NAMES[column.id as ColumnId], checked: column.getIsVisible() }))}
              onToggle={(id) => table.getColumn(id)?.toggleVisibility()}
            />
          </div>
        </div>
        <FilterBar prs={snapshot.prs} org={org} filters={filters} onChange={setFilters} onReset={resetFilters} />
      </div>

      {/* Focusable, so the keyboard can scroll it too. Its outline is inset, as the window's edges would clip one. */}
      <div
        role="region"
        aria-label="Tracked PRs"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const direction = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      aria-sort={direction === false ? undefined : ARIA_SORT[direction]}
                      className={cn(
                        'border-b px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground',
                        // The PR takes the width the other columns leave (w-full), so its title wraps onto fewer lines on a wide window.
                        header.column.id === PINNED_COLUMN && [PINNED, 'w-full bg-muted']
                      )}
                    >
                      <SortableHeader header={header} multiSort={sorting.length > 1} />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="bg-background">
            {table.getRowModel().rows.map((row) => {
              const pr = row.original;
              // No Reviewer outranks the Viewer's turn: it needs someone to find a reviewer.
              const highlight = pr.noReviewer ? HIGHLIGHTS.noReviewer : isWaitingOnViewer(pr, viewer, filters) ? HIGHLIGHTS.viewersTurn : null;
              return (
                <tr key={row.id} className={cn('group hover:bg-accent/60', highlight?.row)}>
                  {row.getVisibleCells().map((cell, index) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'border-b border-border/60 px-3 py-2 align-middle',
                        index === 0 && highlight?.firstCell,
                        cell.column.id === PINNED_COLUMN && [PINNED_CELL, highlight?.pinnedCell]
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* The empty state and footer stick to the left, so they stay in view while the table scrolls sideways. */}
        {rows.length === 0 && <p className="sticky left-0 p-16 text-center text-muted-foreground">No Tracked PRs match these filters.</p>}
        <p className="sticky left-0 px-5 py-3 text-xs text-muted-foreground">
          {rows.length} of {snapshot.prs.length} Tracked PRs · Shift+click a column header to add a sort level
          {!isDefaultSorting(sorting) && (
            <>
              {' · '}
              <button type="button" onClick={resetSorting} className="underline-offset-2 hover:text-foreground hover:underline">
                Reset sort
              </button>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
