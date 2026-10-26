import { type ReactNode, useId, useMemo, useState } from 'react';
import { ChevronRight, Eye, FilterX, Inbox, Send, TriangleAlert } from 'lucide-react';
import {
  AgeChip,
  CheckStatusBadge,
  ConflictBadge,
  IdleLine,
  InclusionReasonBadge,
  JiraTickets,
  MovePills,
  NoReviewerFlag,
  PersonChip,
  RepoName,
  ReviewStatusBadge,
  StackPositionChip,
  UrgencyBar,
  WaitingOnChips,
} from '@/cells';
import { Checkbox } from '@/components/checkbox';
import { StackConnector } from '@/components/stack-connector';
import { SearchBox } from '@/components/search-box';
import { activeFilterCount, applyFilters } from '@/filters/filter-model';
import { useFilters } from '@/filters/use-filters';
import { useCompact } from '@/lib/use-compact';
import { cn } from '@/lib/utils';
import { OrderSelect } from '@/order/order-select';
import { groupStacks, sameStack } from '@/order/stack-groups';
import { useGroupStacks } from '@/order/use-group-stacks';
import { usePrOrder } from '@/order/use-pr-order';
import { sharedOrg } from '@/snapshot/selectors';
import type { Snapshot, TrackedPr } from '@/snapshot/types';
import { type Bucket, type BucketKey, inboxBuckets } from './buckets';
import { FacetSidebar } from './facet-filters';
import { FiltersPanel } from './filters-panel';

/** The Rest of the Team is named for the Team the Snapshot is for. */
const bucketHeadings = (teamName: string): Record<BucketKey, { title: string; hint: string; icon: ReactNode }> => ({
  yourTurn: { title: 'Your turn', hint: 'You owe the next move', icon: <Inbox className="size-4" /> },
  yourPrs: { title: 'Your PRs, waiting on others', hint: 'Nudge someone?', icon: <Send className="size-4" /> },
  noReviewer: { title: 'No Reviewer', hint: 'Nobody owes a review — the author has to find a reviewer', icon: <TriangleAlert className="size-4" /> },
  rest: { title: `Rest of ${teamName}`, hint: 'Waiting on someone else', icon: <Eye className="size-4" /> },
});

/** What the rows need beyond the PR. */
interface RowContext {
  viewer: string | null;
  hideViaTeam: boolean;
  now: number;
  jiraBaseUrl: string | undefined;
  /** The display name of the Team the Snapshot is for. */
  teamName: string;
  /** The org every Tracked PR's repo is in, which the rows leave out. */
  org: string | null;
  /** Whether the window is too narrow for Waiting On to have a column of its own. */
  compact: boolean;
}

/** Who the PR is Waiting On, at most two of them before the rest fold into "+N more", and the No Reviewer flag. */
function WaitingOn({ pr, viewer, hideViaTeam, stacked = false }: { pr: TrackedPr; viewer: string | null; hideViaTeam: boolean; stacked?: boolean }) {
  return (
    <>
      <WaitingOnChips pr={pr} viewer={viewer} hideViaTeam={hideViaTeam} stacked={stacked} max={2} />
      <NoReviewerFlag pr={pr} />
    </>
  );
}

function InboxRow({
  pr,
  context: { viewer, hideViaTeam, now, jiraBaseUrl, org, compact },
  joined,
}: {
  pr: TrackedPr;
  context: RowContext;
  /** Whether the row above and the row below are in this PR's Stack. */
  joined: { above: boolean; below: boolean };
}) {
  const titleId = useId();
  return (
    <li aria-labelledby={titleId} className="relative flex items-stretch hover:bg-accent/60">
      {(joined.above || joined.below) && <StackConnector {...joined} />}
      <UrgencyBar pr={pr} />
      <div className="flex w-20 shrink-0 flex-col items-end gap-0.5 py-2.5 pr-3">
        <AgeChip pr={pr} now={now} />
        <IdleLine pr={pr} />
      </div>
      <div data-pr-block className={cn('min-w-0 flex-1 py-2.5', compact && 'pr-4')}>
        <div className="flex items-baseline gap-2">
          <MovePills pr={pr} viewer={viewer} hideViaTeam={hideViaTeam} />
          {/* The title wins the width: past it, the repo and Jira Ticket wrap onto a line of their own. */}
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
            <a id={titleId} href={pr.url} target="_blank" rel="noreferrer" className="line-clamp-2 min-w-0 font-medium wrap-anywhere hover:underline">
              {pr.title}
            </a>
            <span className="min-w-0 font-mono text-xs wrap-anywhere text-muted-foreground">
              <RepoName repo={pr.repo} org={org} />#{pr.number}
            </span>
            <JiraTickets pr={pr} jiraBaseUrl={jiraBaseUrl} />
            <StackPositionChip pr={pr} />
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <PersonChip person={pr.author} viewer={viewer} />
          <ReviewStatusBadge pr={pr} />
          <CheckStatusBadge status={pr.checkStatus} />
          <ConflictBadge pr={pr} />
          <InclusionReasonBadge pr={pr} viewer={viewer} />
        </div>
        {compact && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* The list names itself to screen readers. */}
            <span aria-hidden className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Waiting On
            </span>
            <WaitingOn pr={pr} viewer={viewer} hideViaTeam={hideViaTeam} />
          </div>
        )}
      </div>
      {!compact && (
        <div className="flex w-72 shrink-0 flex-col items-start gap-1 px-4 py-2.5">
          <WaitingOn pr={pr} viewer={viewer} hideViaTeam={hideViaTeam} stacked />
        </div>
      )}
    </li>
  );
}

function BucketSection({ bucket, context, defaultOpen, grouped }: { bucket: Bucket; context: RowContext; defaultOpen: boolean; grouped: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { title, hint, icon } = bucketHeadings(context.teamName)[bucket.key];
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
          {bucket.prs.map((pr, index) => (
            <InboxRow
              key={pr.id}
              pr={pr}
              context={context}
              joined={{
                above: grouped && index > 0 && sameStack(pr, bucket.prs[index - 1]!),
                below: grouped && index < bucket.prs.length - 1 && sameStack(pr, bucket.prs[index + 1]!),
              }}
            />
          ))}
          {bucket.prs.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing here.</li>}
        </ul>
      )}
    </section>
  );
}

/**
 * The Inbox, the developer view: the PRs that pass the filters, bucketed by whose move it is for the Viewer,
 * beside a sidebar of facets that count what each value would keep. Below 1280px the facets wait behind a Filters button.
 */
export function InboxView({ snapshot, viewer, now }: { snapshot: Snapshot; viewer: string | null; now: number }) {
  const { filters, setFilters, resetFilters } = useFilters();
  const [order, setOrder] = usePrOrder();
  const [grouped, setGrouped] = useGroupStacks();
  const filtered = useMemo(() => applyFilters(snapshot.prs, filters), [snapshot.prs, filters]);
  const buckets = useMemo(() => {
    const ordered = inboxBuckets(filtered, viewer, filters, order);
    return grouped ? ordered.map((bucket) => ({ ...bucket, prs: groupStacks(bucket.prs) })) : ordered;
  }, [filtered, viewer, filters, order, grouped]);
  const org = useMemo(() => sharedOrg(snapshot.prs), [snapshot.prs]);
  const compact = useCompact();
  const context: RowContext = {
    viewer,
    hideViaTeam: filters.hideViaTeam,
    now,
    jiraBaseUrl: snapshot.config.jiraBaseUrl,
    teamName: snapshot.teamInfo.name,
    org,
    compact,
  };
  const active = activeFilterCount(filters);
  const filterProps = { prs: snapshot.prs, teamSlug: snapshot.teamInfo.slug, org, filters, viewer, onChange: setFilters };

  return (
    <div className="flex min-h-full">
      {!compact && <FacetSidebar {...filterProps} />}
      <section className="min-w-0 flex-1 space-y-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox value={filters.q} onChange={(q) => setFilters({ q })} className="w-96" />
          {compact && <FiltersPanel {...filterProps} />}
          <OrderSelect order={order} onChange={setOrder} />
          <Checkbox label="Group Stacks" title="Show a Stack's PRs together, bottom first" checked={grouped} onChange={setGrouped} />
          {/* Below 1280px the panel resets its own filters, and the search has its own clear button. */}
          {!compact && active > 0 && (
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
          <BucketSection
            key={bucket.key}
            bucket={bucket}
            context={context}
            defaultOpen={viewer === null || bucket.key !== 'rest'}
            grouped={grouped}
          />
        ))}
      </section>
    </div>
  );
}
