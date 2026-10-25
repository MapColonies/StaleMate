import type { Filters } from '@/filters/filter-model';
import type { Move, Person, Snapshot, TrackedPr } from './types';

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

/** The PR is on the Viewer only through a request to the Team: the case marked "via @infra". */
export function isOnViewerViaTeam(pr: TrackedPr, viewer: string | null, filters: Pick<Filters, 'hideViaTeam'>): boolean {
  return viewer !== null && !filters.hideViaTeam && !waitsOnPerson(pr, viewer) && waitsOnTheTeamFor(pr, viewer);
}

/** The Moves the Viewer owes on the PR: theirs by name, or a review through a request to the Team. None when it isn't on them. */
export function viewerMoves(pr: TrackedPr, viewer: string | null, hideViaTeam: boolean): Move[] {
  const own = pr.waitingOn.find((party) => party.type === 'person' && party.login === viewer);
  if (own?.type === 'person') {
    return own.moves;
  }
  return isOnViewerViaTeam(pr, viewer, { hideViaTeam }) ? ['review'] : [];
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

/** The header's No Reviewer count is human work only: Bot PRs stay out of it whatever the filters, though they keep the flag. */
export function noReviewerCount(prs: readonly TrackedPr[]): number {
  return prs.filter((pr) => pr.noReviewer && pr.author.kind !== 'bot').length;
}

/** When "Refresh now" works again: the API ignores a refresh until the cooldown since the last sweep started has passed. */
export function refreshAvailableAt({ sync, config }: Snapshot): number {
  return sync.lastAttemptAt === undefined ? 0 : Date.parse(sync.lastAttemptAt) + config.refreshCooldownMs;
}

/** The org every Tracked PR's repo is in; null when they span more than one, so their repos keep their full names. */
export function sharedOrg(prs: readonly TrackedPr[]): string | null {
  const orgs = new Set(prs.map((pr) => pr.repo.split('/')[0]));
  const [org] = orgs;
  return orgs.size === 1 && org !== undefined ? org : null;
}

/** A repo's name without the org every Tracked PR shares, which tells no PRs apart. */
export function shortRepoName(repo: string, org: string | null): string {
  return org !== null && repo.startsWith(`${org}/`) ? repo.slice(org.length + 1) : repo;
}
