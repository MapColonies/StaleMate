import { type ReactNode, useId, useMemo, useState } from 'react';
import { ChevronRight, Eye, FilterX, Inbox, Send, TriangleAlert } from 'lucide-react';
import {
  AgeChip,
  CheckStatusBadge,
  ConflictBadge,
  IdleLine,
  InclusionReasonBadge,
  MovePills,
  NoReviewerFlag,
  PersonChip,
  ReviewStatusBadge,
  UrgencyBar,
  WaitingOnChips,
} from '@/cells';
import { SearchBox } from '@/components/search-box';
import { activeFilterCount, applyFilters } from '@/filters/filter-model';
import { useFilters } from '@/filters/use-filters';
import { cn } from '@/lib/utils';
import { OrderSelect } from '@/order/order-select';
import { usePrOrder } from '@/order/use-pr-order';
import type { Snapshot, TrackedPr } from '@/snapshot/types';
import { type Bucket, type BucketKey, inboxBuckets } from './buckets';
import { FacetSidebar } from './facet-sidebar';

const BUCKET_HEADINGS: Record<BucketKey, { title: string; hint: string; icon: ReactNode }> = {
  yourTurn: { title: 'Your turn', hint: 'You owe the next move', icon: <Inbox className="size-4" /> },
  yourPrs: { title: 'Your PRs, waiting on others', hint: 'Nudge someone?', icon: <Send className="size-4" /> },
  noReviewer: { title: 'No Reviewer', hint: 'Nobody owes a review — the author has to find a reviewer', icon: <TriangleAlert className="size-4" /> },
  rest: { title: 'Rest of the Team', hint: 'Waiting on someone else', icon: <Eye className="size-4" /> },
};

/** What the rows need beyond the PR. */
interface RowContext {
  viewer: string | null;
  hideViaTeam: boolean;
  now: number;
}

function InboxRow({ pr, context: { viewer, hideViaTeam, now } }: { pr: TrackedPr; context: RowContext }) {
  const titleId = useId();
  return (
    <li aria-labelledby={titleId} className="flex items-stretch hover:bg-accent/60">
      <UrgencyBar pr={pr} />
      <div className="flex w-20 shrink-0 flex-col items-end gap-0.5 py-2.5 pr-3">
        <AgeChip pr={pr} now={now} />
        <IdleLine pr={pr} />
      </div>
      <div className="min-w-0 flex-1 py-2.5">
        <div className="flex items-baseline gap-2">
          <MovePills pr={pr} viewer={viewer} hideViaTeam={hideViaTeam} />
          <a id={titleId} href={pr.url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
            {pr.title}
          </a>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {pr.repo}#{pr.number}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <PersonChip person={pr.author} viewer={viewer} />
          <ReviewStatusBadge pr={pr} />
          <CheckStatusBadge status={pr.checkStatus} />
          <ConflictBadge pr={pr} />
          <InclusionReasonBadge pr={pr} viewer={viewer} />
        </div>
      </div>
      <div className="flex w-72 shrink-0 flex-col items-start gap-1 px-4 py-2.5">
        {/* At most two lines, as on the left, so every row keeps one height. */}
        <WaitingOnChips pr={pr} viewer={viewer} hideViaTeam={hideViaTeam} stacked max={2} />
        <NoReviewerFlag pr={pr} />
      </div>
    </li>
  );
}

function BucketSection({ bucket, context, defaultOpen }: { bucket: Bucket; context: RowContext; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { title, hint, icon } = BUCKET_HEADINGS[bucket.key];
  return (
    <section aria-label={title}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mb-2 flex w-full items-center gap-2 text-left">
        <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
        <span className="rounded-full bg-muted-foreground/15 px-2 text-xs font-medium tabular-nums">{bucket.prs.length}</span>
        <span className="text-xs text-muted-foreground">— {hint}</span>
      </button>
      {open && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card text-sm">
          {bucket.prs.map((pr) => (
            <InboxRow key={pr.id} pr={pr} context={context} />
          ))}
          {bucket.prs.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing here.</li>}
        </ul>
      )}
    </section>
  );
}

/**
 * The Inbox, the developer view: the PRs that pass the filters, bucketed by whose move it is for the Viewer,
 * beside a sidebar of facets that count what each value would keep.
 */
export function InboxView({ snapshot, viewer, now }: { snapshot: Snapshot; viewer: string | null; now: number }) {
  const { filters, setFilters, resetFilters } = useFilters();
  const [order, setOrder] = usePrOrder();
  const filtered = useMemo(() => applyFilters(snapshot.prs, filters), [snapshot.prs, filters]);
  const buckets = useMemo(() => inboxBuckets(filtered, viewer, filters, order), [filtered, viewer, filters, order]);
  const context: RowContext = { viewer, hideViaTeam: filters.hideViaTeam, now };
  const active = activeFilterCount(filters);

  return (
    <div className="flex min-h-full">
      <FacetSidebar prs={snapshot.prs} filters={filters} viewer={viewer} onChange={setFilters} />
      <section className="min-w-0 flex-1 space-y-6 p-5">
        <div className="flex items-center gap-3">
          <SearchBox value={filters.q} onChange={(q) => setFilters({ q })} className="w-96" />
          <OrderSelect order={order} onChange={setOrder} />
          {active > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <FilterX className="size-3.5" /> Reset filters ({active})
            </button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {snapshot.prs.length} Tracked PRs
          </span>
        </div>
        {viewer === null && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100">
            Pick who you are in <b>I am…</b> (top right) to sort the Inbox into <b>Your turn</b> and <b>Your PRs</b>.
          </div>
        )}
        {buckets.map((bucket) => (
          // The Rest of the Team folds away while the Viewer has their own buckets to look at.
          <BucketSection key={bucket.key} bucket={bucket} context={context} defaultOpen={viewer === null || bucket.key !== 'rest'} />
        ))}
      </section>
    </div>
  );
}
