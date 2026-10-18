import { type ReactNode, useState } from 'react';
import { Check } from 'lucide-react';
import { CHECK_STATUS_LABELS, INCLUSION_REASON_LABELS, PersonChip, REVIEW_STATUS_LABELS } from '@/cells';
import { AGE_PRESETS, IDLE_PRESETS, type Filters, type ListFilter, facetCounts, toggled } from '@/filters/filter-model';
import { FilterSwitches } from '@/filters/filter-switches';
import { cn } from '@/lib/utils';
import type { Person, TrackedPr } from '@/snapshot/types';

// A facet shows its busiest values; the rest wait behind "Show N more".
const SHOWN_VALUES = 6;

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

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

function Facet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title}>
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
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

/** A list filter's values, busiest first, each with how many PRs picking it would keep. */
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
  const selected = filters[filter] as readonly Filters[K][number][];
  const counts = facetCounts(prs, filters, filter);
  // A picked value stays on show when no PR has it any more, so it can be unpicked.
  for (const value of selected) {
    if (!counts.has(value)) {
      counts.set(value, 0);
    }
  }
  const entries = [...counts].sort(([a, countA], [b, countB]) => countB - countA || byName(a, b));
  const shown = showAll ? entries : entries.slice(0, SHOWN_VALUES);

  return (
    <Facet title={title}>
      <div className="space-y-px">
        {shown.map(([value, count]) => {
          const checked = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => onChange({ [filter]: toggled(selected, value) })}
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
        {entries.length > SHOWN_VALUES && (
          <button type="button" onClick={() => setShowAll(!showAll)} className="px-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            {showAll ? 'Show less' : `Show ${entries.length - SHOWN_VALUES} more`}
          </button>
        )}
      </div>
    </Facet>
  );
}

/** The Inbox's sidebar over the shared filter model: the switches, the Age and Idle presets, and a facet per list filter. */
export function FacetSidebar({
  prs,
  filters,
  viewer,
  onChange,
}: {
  /** Every Tracked PR, so each facet counts over the whole Snapshot. */
  prs: readonly TrackedPr[];
  filters: Filters;
  viewer: string | null;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const people = peopleIn(prs);
  // A Waiting On key is a login, or @slug for a team.
  const partyLabel = (key: string) => {
    const person = people.get(key);
    return person ? <PersonChip person={person} viewer={viewer} /> : key;
  };
  const facetProps = { prs, filters, onChange };

  return (
    <aside aria-label="Filters" className="w-72 shrink-0 space-y-5 border-r bg-background p-4">
      <div className="flex flex-col items-start gap-2">
        <FilterSwitches prs={prs} filters={filters} onChange={onChange} />
      </div>
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
      <FacetList title="Waiting On" filter="waitingOn" label={partyLabel} {...facetProps} />
      <FacetList title="Review" filter="review" label={(value) => REVIEW_STATUS_LABELS[value]} {...facetProps} />
      <FacetList title="Checks" filter="check" label={(value) => CHECK_STATUS_LABELS[value]} {...facetProps} />
      <FacetList title="Reviewer" filter="reviewer" label={partyLabel} {...facetProps} />
      <FacetList title="Author" filter="author" label={partyLabel} {...facetProps} />
      <FacetList title="Repo" filter="repo" label={(value) => <span className="font-mono text-xs">{value}</span>} {...facetProps} />
      <FacetList title="Why tracked" filter="reason" label={(value) => INCLUSION_REASON_LABELS[value]} {...facetProps} />
    </aside>
  );
}
