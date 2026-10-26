import { Switch } from '@/components/switch';
import type { Filters } from './filter-model';

/** The shared filter model's on/off filters, laid out by whichever bar or sidebar holds them. */
export function FilterSwitches({
  teamSlug,
  filters,
  onChange,
}: {
  /** The slug of the Team the Snapshot is for, as requests to it are named. */
  teamSlug: string;
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
}) {
  return (
    <>
      <Switch label="Hide Bots" title="Hide the PRs Bots authored" checked={filters.hideBots} onChange={(hideBots) => onChange({ hideBots })} />
      <Switch
        label="Hide external authors"
        title="Hide the PRs whose author isn’t a Team Member"
        checked={filters.hideOutsiders}
        onChange={(hideOutsiders) => onChange({ hideOutsiders })}
      />
      <Switch
        label={`Ignore requests to @${teamSlug}`}
        title={`Review requests to @${teamSlug} stop counting as your turn; their PRs still show`}
        checked={filters.hideViaTeam}
        onChange={(hideViaTeam) => onChange({ hideViaTeam })}
      />
    </>
  );
}
