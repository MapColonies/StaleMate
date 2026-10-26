import { ChevronDown } from 'lucide-react';
import type { TeamRef } from '@/snapshot/types';

/** "Team": the Viewer picks which Team's PRs they look at, by display name. Below 1280px, only screen readers get the "Team". */
export function TeamPicker({ teams, team, onChange }: { teams: readonly TeamRef[]; team: string; onChange: (slug: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
      <span className="text-muted-foreground max-xl:sr-only">Team</span>
      <span className="relative">
        <select
          value={team}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 appearance-none truncate rounded-md max-xl:max-w-40 border border-input bg-background pr-7 pl-2.5 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
