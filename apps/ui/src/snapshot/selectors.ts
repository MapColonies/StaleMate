import type { Filters } from '@/filters/filter-model';
import type { Person, Snapshot, TrackedPr } from './types';

/** Who can pick themselves in "I am…": Team Members, never Bots or service accounts. */
export function viewerOptions(team: readonly Person[]): string[] {
  return team
    .filter((person) => person.kind === 'member')
    .map((person) => person.login)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function waitsOnPerson(pr: TrackedPr, login: string): boolean {
  return pr.waitingOn.some((party) => party.type === 'person' && party.login === login);
}

/**
 * Whether a request to the Team puts the PR on the Viewer.
 * The Team's request on the Viewer's own PR asks the others, so it doesn't wait on the Viewer.
 */
function waitsOnTheTeamFor(pr: TrackedPr, viewer: string): boolean {
  return pr.author.login !== viewer && pr.waitingOn.some((party) => party.type === 'team' && party.viaTeam);
}

/** The PR is Waiting On the Viewer: on them by name, or on the Team unless the via-Team filter hides that. */
export function isWaitingOnViewer(pr: TrackedPr, viewer: string | null, filters: Pick<Filters, 'hideViaTeam'>): boolean {
  if (viewer === null) {
    return false;
  }
  return waitsOnPerson(pr, viewer) || (!filters.hideViaTeam && waitsOnTheTeamFor(pr, viewer));
}

/** The header's "N + M team": PRs Waiting On the Viewer by name, then the Team's requests that aren't already theirs. */
export function waitingOnViewerCounts(prs: readonly TrackedPr[], viewer: string | null): { mine: number; team: number } {
  const counts = { mine: 0, team: 0 };
  if (viewer === null) {
    return counts;
  }
  for (const pr of prs) {
    if (waitsOnPerson(pr, viewer)) {
      counts.mine++;
    } else if (waitsOnTheTeamFor(pr, viewer)) {
      counts.team++;
    }
  }
  return counts;
}

export function noReviewerCount(prs: readonly TrackedPr[]): number {
  return prs.filter((pr) => pr.noReviewer).length;
}

/** When "Refresh now" works again: the API ignores a refresh until the cooldown since the last sweep started has passed. */
export function refreshAvailableAt({ sync, config }: Snapshot): number {
  return sync.lastAttemptAt === undefined ? 0 : Date.parse(sync.lastAttemptAt) + config.refreshCooldownMs;
}
