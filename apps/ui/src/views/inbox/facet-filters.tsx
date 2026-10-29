import { type ReactNode, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { CHECK_STATUS_LABELS, INCLUSION_REASON_LABELS, PersonChip, REVIEW_STATUS_LABELS, RepoName } from '@/cells';
import { AGE_PRESETS, IDLE_PRESETS, type Filters, type ListFilter, facetCounts, toggled } from '@/filters/filter-model';
import { FilterSwitches } from '@/filters/filter-switches';
import { cn } from '@/lib/utils';
import type { Person, TrackedPr } from '@/snapshot/types';

// How many unpicked values a facet shows before "Show N more".
const SHOWN_UNPICKED = 6;

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

type FacetEntry<T extends string> = readonly [value: T, count: number];

/**
 * Which of a facet's values show, and how many wait behind "Show N more". The picked values come first, so the Viewer can
 * always see and untick what they filtered on, even with no PR left to count; the unpicked ones follow, busiest first, and
 * only they are cut. Each group is busiest first, then by name.
 */
function facetValues<T extends string>(
  counts: ReadonlyMap<T, number>,
  picked: readonly T[],
  showAll: boolean
): { shown: FacetEntry<T>[]; cut: number } {
  const busiestFirst = (entries: FacetEntry<T>[]) => entries.sort(([a, countA], [b, countB]) => countB - countA || byName(a, b));
  const pickedEntries = busiestFirst(picked.map((value) => [value, counts.get(value) ?? 0]));
  const unpicked = busiestFirst([...counts].filter(([value]) => !picked.includes(value)));
  const shownUnpicked = showAll ? unpicked : unpicked.slice(0, SHOWN_UNPICKED);
  return { shown: [...pickedEntries, ...shownUnpicked], cut: Math.max(unpicked.length - SHOWN_UNPICKED, 0) };
}

/** Everyone the PRs name, by login, so a facet can show each as a chip. */
function peopleIn(prs: readonly TrackedPr[]): Map<string, Person> {
  const people = new Map<string, Person>();
  for (const pr of prs) {
    for (const person of [pr.author, ...pr.assignees, ...pr.requestedReviewers, ...pr.reviewers]) {
      people.set(person.login, person);
    }
    for (const party of pr.waitingOn) {
      if (party.type === 'person') {
        people.set(party.login, { login: party.login, kind: party.kind });
      }
    }
  }
  return people;
}

/** How many of a list facet's values are picked, and how to unpick them all. */
interface Picks {
  count: number;
  clear: () => void;
}

/**
 * A facet: its heading, with how many values are picked and a Clear that unpicks them, when any are. Clear goes away once
 * used, so it hands focus to the facet, keeping a keyboard Viewer's place.
 */
function Facet({ title, picks, children }: { title: string; picks?: Picks; children: ReactNode }) {
  const group = useRef<HTMLDivElement>(null);
  const separator = <span aria-hidden> · </span>;
  const picked = picks !== undefined && picks.count > 0 ? picks : null;

  return (
    <div
      ref={group}
      role="group"
      aria-label={title}
      tabIndex={-1}
      className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
        <h3 className="inline uppercase">
          {title}
          {picked && (
            <>
              {separator}
              <span className="text-indigo-600 tabular-nums dark:text-indigo-400">
                {picked.count}
                <span className="sr-only"> picked</span>
              </span>
            </>
          )}
        </h3>
        {picked && (
          <>
            {separator}
            <button
              type="button"
              aria-label={`Clear ${title}`}
              onClick={() => {
                picked.clear();
                group.current?.focus();
              }}
              className="rounded-sm text-indigo-600 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-indigo-400"
            >
              Clear
            </button>
          </>
        )}
      </div>
      {children}
    </div>
  );
}

function Pill({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 text-xs',
        pressed ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent'
      )}
    >
      {children}
    </button>
  );
}

/** A list filter's values, picked ones first, each with how many PRs picking it would keep. */
function FacetList<K extends ListFilter>({
  title,
  filter,
  prs,
  filters,
  onChange,
  label,
}: {
  title: string;
  filter: K;
  prs: readonly TrackedPr[];
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  label: (value: Filters[K][number]) => ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const picked = filters[filter] as readonly Filters[K][number][];
  const { shown, cut } = facetValues(facetCounts(prs, filters, filter), picked, showAll);

  return (
    <Facet title={title} picks={{ count: picked.length, clear: () => onChange({ [filter]: [] }) }}>
      <div className="space-y-px">
        {shown.map(([value, count]) => {
          const checked = picked.includes(value);
          return (
            <button
              key={value}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => onChange({ [filter]: toggled(picked, value) })}
              className={cn(
                'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm',
                checked ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100' : 'hover:bg-accent'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
                  checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-input'
                )}
              >
                {checked && <Check className="size-2.5" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{label(value)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
            </button>
          );
        })}
        {cut > 0 && (
          <button type="button" onClick={() => setShowAll(!showAll)} className="px-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            {showAll ? 'Show less' : `Show ${cut} more`}
          </button>
        )}
      </div>
    </Facet>
  );
}

export interface FacetFiltersProps {
  /** Every Tracked PR, so each facet counts over the whole Snapshot. */
  prs: readonly TrackedPr[];
  /** The slug of the Team the Snapshot is for. */
  teamSlug: string;
  /** The org every Tracked PR's repo is in, which the Repo facet leaves out. */
  org: string | null;
  filters: Filters;
  viewer: string | null;
  onChange: (patch: Partial<Filters>) => void;
}

/**
 * The Inbox's filters over the shared filter model: the switches, the Age and Idle presets, and a facet per list filter.
 * They sit in the sidebar, or in the Filters panel where the window is too narrow for one, in the order the Viewer reaches for
 * them: the buckets already split the PRs by whose move it is, so Waiting On sits low. The Table's filter bar keeps its own order.
 */
export function FacetFilters({ prs, teamSlug, org, filters, viewer, onChange }: FacetFiltersProps) {
  const people = peopleIn(prs);
  // A Waiting On key is a login, or @slug for a team.
  const partyLabel = (key: string) => {
    const person = people.get(key);
    return person ? <PersonChip person={person} viewer={viewer} /> : key;
  };
  const facetProps = { prs, filters, onChange };

  return (
    <>
      <div className="flex flex-col items-start gap-2">
        <FilterSwitches teamSlug={teamSlug} filters={filters} onChange={onChange} />
      </div>
      <FacetList
        title="Repo"
        filter="repo"
        label={(value) => (
          <span className="font-mono text-xs">
            <RepoName repo={value} org={org} />
          </span>
        )}
        {...facetProps}
      />
      <FacetList title="Review" filter="review" label={(value) => REVIEW_STATUS_LABELS[value]} {...facetProps} />
      <FacetList title="Checks" filter="check" label={(value) => CHECK_STATUS_LABELS[value]} {...facetProps} />
      <Facet title="Age">
        <div className="flex flex-wrap gap-1">
          {AGE_PRESETS.map((preset) => (
            <Pill
              key={preset.label}
              pressed={preset.ageMin === filters.ageMin && preset.ageMax === filters.ageMax}
              onClick={() => onChange({ ageMin: preset.ageMin, ageMax: preset.ageMax })}
            >
              {preset.label}
            </Pill>
          ))}
        </div>
      </Facet>
      <Facet title="Idle Time">
        <div className="flex flex-wrap gap-1">
          {IDLE_PRESETS.map((preset) => (
            <Pill key={preset.label} pressed={preset.idleOver === filters.idleOver} onClick={() => onChange({ idleOver: preset.idleOver })}>
              {preset.label}
            </Pill>
          ))}
        </div>
      </Facet>
      <FacetList title="Author" filter="author" label={partyLabel} {...facetProps} />
      <FacetList title="Reviewer" filter="reviewer" label={partyLabel} {...facetProps} />
      <FacetList title="Waiting On" filter="waitingOn" label={partyLabel} {...facetProps} />
      <FacetList title="Why tracked" filter="reason" label={(value) => INCLUSION_REASON_LABELS[value]} {...facetProps} />
    </>
  );
}

/** The Inbox's filters in a sidebar of their own, which stays put while the PRs scroll, and scrolls on its own when long. */
export function FacetSidebar(props: FacetFiltersProps) {
  return (
    <aside aria-label="Filters" className="w-72 shrink-0 space-y-5 overflow-y-auto border-r bg-background p-4">
      <FacetFilters {...props} />
    </aside>
  );
}
