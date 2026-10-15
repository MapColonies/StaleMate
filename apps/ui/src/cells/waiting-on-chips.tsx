import { Users } from 'lucide-react';
import { partyKey } from '@/filters/filter-model';
import { cn } from '@/lib/utils';
import { isOnViewerViaTeam } from '@/snapshot/selectors';
import type { TrackedPr, WaitingOnParty } from '@/snapshot/types';
import { PersonChip } from './person-chip';

function TeamChip({ slug, viaTeam }: { slug: string; viaTeam: boolean }) {
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
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{party.role === 'author' ? 'author' : 'review'}</span>
    </span>
  );
}

/**
 * Who the PR is Waiting On. A request to the Team that puts the PR on the Viewer is marked "via @infra",
 * unless the Viewer has hidden those requests.
 */
export function WaitingOnChips({ pr, viewer, hideViaTeam = false }: { pr: TrackedPr; viewer: string | null; hideViaTeam?: boolean }) {
  const markViaTeam = isOnViewerViaTeam(pr, viewer, { hideViaTeam });
  return (
    <span role="list" aria-label="Waiting On" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {pr.waitingOn.map((party) => (
        <span key={partyKey(party)} role="listitem">
          <PartyChip party={party} viewer={viewer} markViaTeam={markViaTeam} />
        </span>
      ))}
    </span>
  );
}
