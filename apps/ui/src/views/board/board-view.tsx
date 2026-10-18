import { useId, useMemo } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  AgeChip,
  CheckStatusBadge,
  IdleLine,
  InclusionReasonBadges,
  NoReviewerFlag,
  PersonChip,
  ReviewStatusBadge,
  TeamChip,
  URGENCY_FILLS,
  UrgencyBar,
  WaitingOnChips,
} from '@/cells';
import { wholeWorkingDays } from '@/cells/clocks';
import { FilterBar } from '@/filters/filter-bar';
import { applyFilters, partyKey } from '@/filters/filter-model';
import { useFilters } from '@/filters/use-filters';
import { cn } from '@/lib/utils';
import { OrderSelect } from '@/order/order-select';
import { usePrOrder } from '@/order/use-pr-order';
import type { Snapshot, TrackedPr } from '@/snapshot/types';
import { type BoardColumn, type BoardStats, type ColumnOwner, boardColumns, boardStats, isViewersColumn } from './columns';

const URGENCIES = [0, 1, 2, 3] as const;

/** An Urgency's span of Age, short for the strip and long for its hover. */
function urgencySpan(urgency: (typeof URGENCIES)[number], thresholds: readonly number[]): { short: string; long: string } {
  const from = thresholds[urgency - 1];
  const to = thresholds[urgency];
  if (from === undefined) {
    return { short: `< ${to}d`, long: `Age under ${to} Working Days` };
  }
  if (to === undefined) {
    return { short: `≥ ${from}d`, long: `Age of ${from} Working Days or more` };
  }
  return { short: `${from}–${to}d`, long: `Age of ${from} to ${to} Working Days` };
}

function Owner({ owner, viewer }: { owner: ColumnOwner; viewer: string | null }) {
  return owner.type === 'team' ? <TeamChip slug={owner.slug} viaTeam={owner.viaTeam} /> : <PersonChip person={owner.person} viewer={viewer} />;
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

function StatsStrip({ stats, thresholds, viewer }: { stats: BoardStats; thresholds: readonly number[]; viewer: string | null }) {
  return (
    <div role="group" aria-label="Board stats" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      {URGENCIES.map((urgency) => {
        const span = urgencySpan(urgency, thresholds);
        return (
          <span key={urgency} title={`Urgency ${urgency}: ${span.long}`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden className={cn('size-2.5 rounded-full', URGENCY_FILLS[urgency])} />
            <b className="tabular-nums">{stats.byUrgency[urgency]}</b>
            <span className="text-xs text-muted-foreground">{span.short}</span>
          </span>
        );
      })}
      <span title="Drafts have no Urgency" className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <b className="tabular-nums">{stats.drafts}</b>
        <span className="text-xs text-muted-foreground">Draft</span>
      </span>
      <div className="h-5 w-px bg-border" />
      <span
        title="PRs Awaiting Review that no reviewer owes a move on"
        className="inline-flex items-center gap-1 whitespace-nowrap text-amber-800 dark:text-amber-300"
      >
        <TriangleAlert className="size-3.5" />
        <b className="tabular-nums">{stats.noReviewer}</b> No Reviewer
      </span>
      {stats.biggest && (
        <>
          <div className="h-5 w-px bg-border" />
          <span title="The column with the most PRs" className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-xs text-muted-foreground">Biggest column</span> <Owner owner={stats.biggest.owner} viewer={viewer} />{' '}
            <span className="text-muted-foreground tabular-nums">· {plural(stats.biggest.prs.length, 'PR')}</span>
          </span>
        </>
      )}
    </div>
  );
}

function BoardCard({ pr, column, viewer, now }: { pr: TrackedPr; column: BoardColumn; viewer: string | null; now: number }) {
  const titleId = useId();
  const own = pr.waitingOn.find((party) => partyKey(party) === column.key);
  const role = own?.type === 'person' ? own.role : null;
  const others = pr.waitingOn.filter((party) => party !== own);
  return (
    <li aria-labelledby={titleId} className="flex overflow-hidden rounded-lg border bg-card shadow-xs hover:border-ring/40">
      <UrgencyBar pr={pr} />
      <div className="min-w-0 flex-1 space-y-1.5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {pr.repo}#{pr.number}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <IdleLine pr={pr} />
            <AgeChip pr={pr} now={now} />
          </span>
        </div>
        <a id={titleId} href={pr.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm leading-snug font-medium hover:underline">
          {pr.title}
        </a>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <PersonChip person={pr.author} viewer={viewer} />
          <ReviewStatusBadge pr={pr} />
          <CheckStatusBadge status={pr.checkStatus} />
        </div>
        {(role !== null || pr.noReviewer || others.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {role !== null && <span className="rounded bg-muted px-1 whitespace-nowrap">as {role}</span>}
            <NoReviewerFlag pr={pr} />
            {others.length > 0 && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                also on
                {/* The card's column is its own party; the chips name the rest. */}
                <WaitingOnChips pr={{ ...pr, waitingOn: others }} viewer={viewer} hideViaTeam max={2} />
              </span>
            )}
          </div>
        )}
        <InclusionReasonBadges reasons={pr.inclusionReasons} />
      </div>
    </li>
  );
}

function Column({ column, viewer, now }: { column: BoardColumn; viewer: string | null; now: number }) {
  const mine = isViewersColumn(column.owner, viewer);
  const oldest = Math.max(0, ...column.prs.map((pr) => wholeWorkingDays(pr.age)));
  return (
    <section
      aria-label={mine ? 'You' : column.key}
      className={cn(
        'flex max-h-full w-80 shrink-0 flex-col rounded-xl',
        mine ? 'bg-indigo-50 ring-2 ring-indigo-400 dark:bg-indigo-950/40 dark:ring-indigo-700' : 'bg-muted'
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
        <Owner owner={column.owner} viewer={viewer} />
        <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {plural(column.prs.length, 'PR')}
          {column.prs.length > 0 && ` · oldest ${oldest}d`}
        </span>
      </div>
      {/* How the column's PRs split by Urgency, the loudest first. */}
      <div aria-hidden className="mx-3 mb-2 flex h-1 overflow-hidden rounded-full bg-background/70">
        {[...URGENCIES].reverse().map((urgency) => (
          <div
            key={urgency}
            className={URGENCY_FILLS[urgency]}
            style={{ width: `${(column.prs.filter((pr) => pr.urgency === urgency).length / Math.max(1, column.prs.length)) * 100}%` }}
          />
        ))}
      </div>
      <ul className="min-h-0 space-y-2 overflow-y-auto px-2 pb-2">
        {column.prs.map((pr) => (
          <BoardCard key={pr.id} pr={pr} column={column} viewer={viewer} now={now} />
        ))}
        {column.prs.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted-foreground">Nothing waits on you by name.</li>}
      </ul>
    </section>
  );
}

/**
 * The Board, the "who is the bottleneck" view: a column per party the filtered PRs are Waiting On, the Viewer's first,
 * under a strip that sums them up.
 */
export function BoardView({ snapshot, viewer, now }: { snapshot: Snapshot; viewer: string | null; now: number }) {
  const { filters, setFilters, resetFilters } = useFilters();
  const filtered = useMemo(() => applyFilters(snapshot.prs, filters), [snapshot.prs, filters]);
  const [order, setOrder] = usePrOrder();
  const columns = useMemo(() => boardColumns(filtered, viewer, order), [filtered, viewer, order]);
  const stats = useMemo(() => boardStats(filtered, columns), [filtered, columns]);

  return (
    // The Board fills the window: the columns scroll down on their own, and the Board scrolls across.
    <section className="flex h-full flex-col">
      <div className="shrink-0 space-y-2.5 border-b bg-background px-5 py-3">
        <FilterBar prs={snapshot.prs} filters={filters} onChange={setFilters} onReset={resetFilters} />
        <div className="flex items-center gap-3">
          <OrderSelect order={order} onChange={setOrder} />
          <StatsStrip stats={stats} thresholds={snapshot.config.urgencyThresholds} viewer={viewer} />
          <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
            {filtered.length} of {snapshot.prs.length} Tracked PRs
          </span>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="p-10 text-center text-muted-foreground">No Tracked PRs match these filters.</p>
      ) : (
        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4">
          {columns.map((column) => (
            <Column key={column.key} column={column} viewer={viewer} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}
