import { FilterX, Search, X } from 'lucide-react';
import { CHECK_STATUS_LABELS, INCLUSION_REASON_LABELS, REVIEW_STATUS_LABELS } from '@/cells';
import { CheckboxMenu } from '@/components/checkbox-menu';
import { AGE_PRESETS, IDLE_PRESETS, type Filters, activeFilterCount } from '@/filters/filter-model';
import { filterOptions, teamSlug } from '@/filters/filter-options';
import { cn } from '@/lib/utils';
import type { TrackedPr } from '@/snapshot/types';

type ListFilter = 'repo' | 'author' | 'reviewer' | 'waitingOn' | 'review' | 'check' | 'reason';

const toggled = <T extends string>(values: readonly T[], value: T): T[] =>
  values.includes(value) ? values.filter((other) => other !== value) : [...values, value];

const entries = <K extends string>(labels: Record<K, string>) => Object.entries(labels) as [K, string][];

function ListFilterMenu<K extends ListFilter>({
  name,
  filter,
  choices,
  filters,
  onChange,
}: {
  name: string;
  filter: K;
  choices: readonly (readonly [Filters[K][number], string])[];
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const selected = filters[filter] as readonly string[];
  return (
    <CheckboxMenu
      label={
        <>
          {name}
          {selected.length > 0 && <span className="rounded bg-indigo-600 px-1 text-[11px] font-semibold text-white">{selected.length}</span>}
        </>
      }
      highlighted={selected.length > 0}
      options={choices.map(([value, label]) => ({ value, label, text: label, checked: selected.includes(value) }))}
      onToggle={(value) => onChange({ [filter]: toggled(selected, value) })}
      onClear={() => onChange({ [filter]: [] })}
    />
  );
}

function Switch({ label, title, checked, onChange }: { label: string; title?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm whitespace-nowrap"
    >
      <span className={cn('relative h-[18px] w-8 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-input')}>
        <span className={cn('absolute top-0.5 size-3.5 rounded-full bg-background shadow transition-all', checked ? 'left-4' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}

const SELECT_CLASS = 'h-8 rounded-md border border-dashed border-input bg-background px-2 text-sm';

/** The Table's horizontal bar over the shared filter model. */
export function FilterBar({
  prs,
  filters,
  onChange,
  onReset,
}: {
  /** Every Tracked PR, to offer every value there is. */
  prs: readonly TrackedPr[];
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
}) {
  const options = filterOptions(prs);
  const slug = teamSlug(prs) ?? 'team';
  const same = (values: readonly string[]) => values.map((value) => [value, value] as const);
  const agePreset = AGE_PRESETS.findIndex((preset) => preset.ageMin === filters.ageMin && preset.ageMax === filters.ageMax);
  const idlePreset = IDLE_PRESETS.findIndex((preset) => preset.idleOver === filters.idleOver);
  const active = activeFilterCount(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-72">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={filters.q}
          onChange={(event) => onChange({ q: event.target.value })}
          placeholder="Search title, repo, #number, author…"
          aria-label="Search"
          className="h-8 w-full rounded-md border border-input bg-background pr-7 pl-7 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        {filters.q !== '' && (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => onChange({ q: '' })}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <ListFilterMenu name="Waiting On" filter="waitingOn" choices={same(options.waitingOn)} filters={filters} onChange={onChange} />
      <ListFilterMenu name="Reviewer" filter="reviewer" choices={same(options.reviewer)} filters={filters} onChange={onChange} />
      <ListFilterMenu name="Author" filter="author" choices={same(options.author)} filters={filters} onChange={onChange} />
      <ListFilterMenu name="Repo" filter="repo" choices={same(options.repo)} filters={filters} onChange={onChange} />
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
        {agePreset === -1 && <option value={-1}>Age: custom</option>}
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
        {idlePreset === -1 && <option value={-1}>Idle: custom</option>}
        {IDLE_PRESETS.map((preset, index) => (
          <option key={preset.label} value={index}>
            {preset.label}
          </option>
        ))}
      </select>
      <div className="mx-1 h-5 w-px bg-border" />
      <Switch label="Hide Bots" checked={filters.hideBots} onChange={(hideBots) => onChange({ hideBots })} />
      <Switch label="Hide non-team authors" checked={filters.hideOutsiders} onChange={(hideOutsiders) => onChange({ hideOutsiders })} />
      <Switch
        label={`Hide via @${slug}`}
        title={`Requests to @${slug} stop counting as your turn`}
        checked={filters.hideViaTeam}
        onChange={(hideViaTeam) => onChange({ hideViaTeam })}
      />
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
