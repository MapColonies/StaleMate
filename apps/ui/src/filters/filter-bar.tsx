import type { ReactNode } from 'react';
import { FilterX } from 'lucide-react';
import { CHECK_STATUS_LABELS, INCLUSION_REASON_LABELS, REVIEW_STATUS_LABELS, RepoName } from '@/cells';
import { CheckboxMenu } from '@/components/checkbox-menu';
import { HIGHLIGHTED_COUNT_CLASS } from '@/components/highlight-classes';
import { SearchBox } from '@/components/search-box';
import { AGE_PRESETS, IDLE_PRESETS, type Filters, type ListFilter, activeFilterCount, toggled } from '@/filters/filter-model';
import { filterOptions } from '@/filters/filter-options';
import { FilterSwitches } from '@/filters/filter-switches';
import type { TrackedPr } from '@/snapshot/types';

const entries = <K extends string>(labels: Record<K, string>) => Object.entries(labels) as [K, string][];

function ListFilterMenu<K extends ListFilter>({
  name,
  filter,
  choices,
  filters,
  onChange,
  label,
}: {
  name: string;
  filter: K;
  /** Each value with the text its search matches. */
  choices: readonly (readonly [Filters[K][number], string])[];
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  /** How a value shows; its text when absent. */
  label?: (value: Filters[K][number]) => ReactNode;
}) {
  const selected = filters[filter] as readonly string[];
  return (
    <CheckboxMenu
      label={
        <>
          {name}
          {selected.length > 0 && <span className={HIGHLIGHTED_COUNT_CLASS}>{selected.length}</span>}
        </>
      }
      highlighted={selected.length > 0}
      options={choices.map(([value, text]) => ({ value, label: label ? label(value) : text, text, checked: selected.includes(value) }))}
      onToggle={(value) => onChange({ [filter]: toggled(selected, value) })}
      onClear={() => onChange({ [filter]: [] })}
    />
  );
}

const SELECT_CLASS = 'h-8 rounded-md border border-dashed border-input bg-background px-2 text-sm';

/** A horizontal bar over the shared filter model, for the views that have no sidebar: the Table and the Board. */
export function FilterBar({
  prs,
  org,
  filters,
  onChange,
  onReset,
}: {
  /** Every Tracked PR, to offer every value there is. */
  prs: readonly TrackedPr[];
  /** The org every Tracked PR's repo is in, which the Repo filter leaves out. */
  org: string | null;
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
}) {
  const options = filterOptions(prs);
  const same = (values: readonly string[]) => values.map((value) => [value, value] as const);
  const agePreset = AGE_PRESETS.findIndex((preset) => preset.ageMin === filters.ageMin && preset.ageMax === filters.ageMax);
  const idlePreset = IDLE_PRESETS.findIndex((preset) => preset.idleOver === filters.idleOver);
  const active = activeFilterCount(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox value={filters.q} onChange={(q) => onChange({ q })} className="w-72" />
      <ListFilterMenu name="Waiting On" filter="waitingOn" choices={same(options.waitingOn)} filters={filters} onChange={onChange} />
      <ListFilterMenu name="Reviewer" filter="reviewer" choices={same(options.reviewer)} filters={filters} onChange={onChange} />
      <ListFilterMenu name="Author" filter="author" choices={same(options.author)} filters={filters} onChange={onChange} />
      <ListFilterMenu
        name="Repo"
        filter="repo"
        choices={same(options.repo)}
        filters={filters}
        onChange={onChange}
        label={(repo) => <RepoName repo={repo} org={org} />}
      />
      <ListFilterMenu name="Review" filter="review" choices={entries(REVIEW_STATUS_LABELS)} filters={filters} onChange={onChange} />
      <ListFilterMenu name="Checks" filter="check" choices={entries(CHECK_STATUS_LABELS)} filters={filters} onChange={onChange} />
      <ListFilterMenu name="Why tracked" filter="reason" choices={entries(INCLUSION_REASON_LABELS)} filters={filters} onChange={onChange} />
      <select
        aria-label="Age"
        value={agePreset}
        onChange={(event) => {
          const preset = AGE_PRESETS[Number(event.target.value)];
          if (preset) {
            onChange({ ageMin: preset.ageMin, ageMax: preset.ageMax });
          }
        }}
        className={SELECT_CLASS}
      >
        {agePreset === -1 && <option value={-1}>Age: Custom</option>}
        {AGE_PRESETS.map((preset, index) => (
          <option key={preset.label} value={index}>
            Age: {preset.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Idle Time"
        value={idlePreset}
        onChange={(event) => {
          const preset = IDLE_PRESETS[Number(event.target.value)];
          if (preset) {
            onChange({ idleOver: preset.idleOver });
          }
        }}
        className={SELECT_CLASS}
      >
        {idlePreset === -1 && <option value={-1}>Idle: Custom</option>}
        {IDLE_PRESETS.map((preset, index) => (
          <option key={preset.label} value={index}>
            Idle: {preset.label}
          </option>
        ))}
      </select>
      <div className="mx-1 h-5 w-px bg-border" />
      <FilterSwitches prs={prs} filters={filters} onChange={onChange} />
      {active > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <FilterX className="size-3.5" /> Reset filters ({active})
        </button>
      )}
    </div>
  );
}
