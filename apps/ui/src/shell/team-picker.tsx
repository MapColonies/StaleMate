import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeamRef } from '@/snapshot/types';

/** "Team": the Viewer picks which Team's PRs they look at, by display name. Below 1280px it waits behind the Team and Viewer button, stacked. */
export function TeamPicker({
  teams,
  team,
  onChange,
  stacked = false,
}: {
  teams: readonly TeamRef[];
  team: string;
  onChange: (slug: string) => void;
  /** The label above the dropdown, which then fills the width. */
  stacked?: boolean;
}) {
  return (
    <label className={cn('flex text-sm whitespace-nowrap', stacked ? 'flex-col gap-1' : 'items-center gap-2')}>
      <span className="text-muted-foreground">Team</span>
      <span className={cn('relative', stacked && 'w-full')}>
        <select
          value={team}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-full appearance-none truncate rounded-md border border-input bg-background pr-7 pl-2.5 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {teams.map(({ slug, name }) => (
            <option key={slug} value={slug}>
              {name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  );
}
