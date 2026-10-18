import { Switch } from '@/components/switch';
import type { TrackedPr } from '@/snapshot/types';
import type { Filters } from './filter-model';
import { teamSlug } from './filter-options';

/** The shared filter model's on/off filters, laid out by whichever bar or sidebar holds them. */
export function FilterSwitches({
  prs,
  filters,
  onChange,
}: {
  /** Every Tracked PR, to name the Team as its requests do. */
  prs: readonly TrackedPr[];
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const slug = teamSlug(prs) ?? 'team';
  return (
    <>
      <Switch label="Hide Bots" checked={filters.hideBots} onChange={(hideBots) => onChange({ hideBots })} />
      <Switch label="Hide non-team authors" checked={filters.hideOutsiders} onChange={(hideOutsiders) => onChange({ hideOutsiders })} />
      <Switch
        label={`Hide via @${slug}`}
        title={`Requests to @${slug} stop counting as your turn`}
        checked={filters.hideViaTeam}
        onChange={(hideViaTeam) => onChange({ hideViaTeam })}
      />
    </>
  );
}
