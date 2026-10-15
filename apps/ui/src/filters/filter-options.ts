import type { TrackedPr } from '@/snapshot/types';
import { partyKey } from './filter-model';

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

const unique = (values: Iterable<string>): string[] => [...new Set(values)].sort(byName);

/** The values each list filter can take, read off the PRs: every repo, author, reviewer and Waiting On party there is. */
export function filterOptions(prs: readonly TrackedPr[]) {
  return {
    repo: unique(prs.map((pr) => pr.repo)),
    author: unique(prs.map((pr) => pr.author.login)),
    reviewer: unique(prs.flatMap((pr) => [...pr.requestedReviewers, ...pr.reviewers].map((person) => person.login))),
    waitingOn: unique(prs.flatMap((pr) => pr.waitingOn.map(partyKey))),
  };
}

/** The Team's slug, as requests to it name it; `null` while no PR asks the Team. */
export function teamSlug(prs: readonly TrackedPr[]): string | null {
  for (const pr of prs) {
    const team = pr.waitingOn.find((party) => party.type === 'team' && party.viaTeam);
    if (team?.type === 'team') {
      return team.slug;
    }
  }
  return null;
}
