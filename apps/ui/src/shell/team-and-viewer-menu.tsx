import { ChevronDown, UserRound } from 'lucide-react';
import { Avatar } from '@/cells/person-chip';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { TeamRef } from '@/snapshot/types';
import { TeamPicker } from './team-picker';
import { ThemeToggle } from './theme-toggle';
import type { ThemePreference } from './use-theme';
import { ViewerPicker } from './viewer-picker';

/**
 * Below 1280px: one button, showing the Viewer and the Team's name, that opens the Team and "I am…" dropdowns and the
 * theme. All three are picked once and seldom changed, so they give the bar's width to what changes. When the bar runs
 * short, the Team's name truncates.
 */
export function TeamAndViewerMenu({
  teams,
  team,
  onTeamChange,
  options,
  viewer,
  onViewerChange,
  theme,
  onThemeCycle,
}: {
  teams: readonly TeamRef[];
  team: string;
  onTeamChange: (slug: string) => void;
  options: string[];
  viewer: string | null;
  onViewerChange: (login: string | null) => void;
  theme: ThemePreference;
  onThemeCycle: () => void;
}) {
  const teamName = teams.find(({ slug }) => slug === team)?.name ?? team;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Team: ${teamName} · I am: ${viewer ?? 'nobody yet'}`} className="max-w-44 min-w-0 shrink">
          {viewer === null ? <UserRound className="text-muted-foreground" /> : <Avatar person={{ login: viewer, kind: 'member' }} isViewer={false} />}
          <span className="truncate">{teamName}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-64 flex-col gap-3">
        <TeamPicker teams={teams} team={team} onChange={onTeamChange} stacked />
        <ViewerPicker options={options} viewer={viewer} onChange={onViewerChange} stacked />
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Theme</span>
          <ThemeToggle preference={theme} onCycle={onThemeCycle} named />
        </div>
      </PopoverContent>
    </Popover>
  );
}
