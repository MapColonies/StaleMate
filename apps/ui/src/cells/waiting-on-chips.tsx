import { Users } from 'lucide-react';
import { partyKey } from '@/filters/filter-model';
import { cn } from '@/lib/utils';
import { isOnViewerViaTeam } from '@/snapshot/selectors';
import type { TrackedPr, WaitingOnParty } from '@/snapshot/types';
import { PersonChip } from './person-chip';

/** A team, muted when it is another team than the Team, since no Team Member owes its moves. */
export function TeamChip({ slug, viaTeam }: { slug: string; viaTeam: boolean }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap', !viaTeam && 'text-muted-foreground')}
      title={viaTeam ? 'A request to the Team: every Team Member’s turn' : 'A request to another team: no Team Member’s turn'}
    >
      <span
        aria-hidden
        className="inline-flex size-[18px] items-center justify-center rounded-md bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
      >
        <Users className="size-3" />
      </span>
      @{slug}
    </span>
  );
}

const roleLabel = (role: 'author' | 'reviewer'): string => (role === 'author' ? 'author' : 'review');

function PartyChip({ party, viewer, markViaTeam }: { party: WaitingOnParty; viewer: string | null; markViaTeam: boolean }) {
  if (party.type === 'team') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <TeamChip slug={party.slug} viaTeam={party.viaTeam} />
        {party.viaTeam && markViaTeam && (
          <>
            {' '}
            <span className="rounded border border-dashed border-indigo-300 px-1 text-[10px] font-medium whitespace-nowrap text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
              via @{party.slug}
            </span>
          </>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <PersonChip person={party} viewer={viewer} />{' '}
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{roleLabel(party.role)}</span>
    </span>
  );
}

const isViewer = (party: WaitingOnParty, viewer: string | null): boolean => party.type === 'person' && party.login === viewer;

/** A party as the "+N more" hover names it. */
const partyText = (party: WaitingOnParty): string => (party.type === 'team' ? `@${party.slug}` : `${party.login} · ${roleLabel(party.role)}`);

/**
 * Who the PR is Waiting On, the Viewer first. A request to the Team that puts the PR on the Viewer is marked "via @infra",
 * unless the Viewer has hidden those requests.
 * Stacked puts one party per line, so the names line up down a list of rows; past `max` lines, the rest fold into
 * "+N more" at the end of the last line, named on hover.
 */
export function WaitingOnChips({
  pr,
  viewer,
  hideViaTeam = false,
  stacked = false,
  max = Infinity,
}: {
  pr: TrackedPr;
  viewer: string | null;
  hideViaTeam?: boolean;
  stacked?: boolean;
  max?: number;
}) {
  const markViaTeam = isOnViewerViaTeam(pr, viewer, { hideViaTeam });
  const parties = [...pr.waitingOn].sort((a, b) => Number(isViewer(b, viewer)) - Number(isViewer(a, viewer)));
  const shown = parties.slice(0, max);
  const folded = parties.slice(max);
  return (
    <span
      role="list"
      aria-label="Waiting On"
      className={cn('flex', stacked ? 'flex-col items-start gap-1' : 'flex-wrap items-center gap-x-3 gap-y-1')}
    >
      {shown.map((party, index) => (
        <span key={partyKey(party)} role="listitem" className="inline-flex items-center">
          <PartyChip party={party} viewer={viewer} markViaTeam={markViaTeam} />
          {index === shown.length - 1 && folded.length > 0 && (
            <>
              {' '}
              <span
                title={folded.map(partyText).join('\n')}
                className="ml-2 cursor-default rounded bg-muted px-1 text-[11px] whitespace-nowrap text-muted-foreground"
              >
                +{folded.length} more
              </span>
            </>
          )}
        </span>
      ))}
    </span>
  );
}
