import type { Filters } from '@/filters/filter-model';
import { isWaitingOnViewer } from '@/snapshot/selectors';
import type { TrackedPr } from '@/snapshot/types';

export const TABS = ['all', 'my-turn', 'my-prs', 'involving-me'] as const;

export type Tab = (typeof TABS)[number];

export const TAB_NAMES: Record<Tab, string> = { all: 'All', 'my-turn': 'My turn', 'my-prs': 'My PRs', 'involving-me': 'Involving me' };

const isPerson = (people: readonly { login: string }[], login: string): boolean => people.some((person) => person.login === login);

/** The Viewer authored, reviewed, is asked to review or assigned to the PR, or owes a move on it. */
function involves(pr: TrackedPr, viewer: string, filters: Pick<Filters, 'hideViaTeam'>): boolean {
  return (
    pr.author.login === viewer ||
    isPerson(pr.assignees, viewer) ||
    isPerson(pr.requestedReviewers, viewer) ||
    isPerson(pr.reviewers, viewer) ||
    isWaitingOnViewer(pr, viewer, filters)
  );
}

/** The PRs a Table tab shows. Every tab but All is the Viewer's, so it is empty without one. */
export function prsInTab(prs: readonly TrackedPr[], tab: Tab, viewer: string | null, filters: Pick<Filters, 'hideViaTeam'>): TrackedPr[] {
  if (tab === 'all') {
    return [...prs];
  }
  if (viewer === null) {
    return [];
  }
  switch (tab) {
    case 'my-turn':
      return prs.filter((pr) => isWaitingOnViewer(pr, viewer, filters));
    case 'my-prs':
      return prs.filter((pr) => pr.author.login === viewer);
    case 'involving-me':
      return prs.filter((pr) => involves(pr, viewer, filters));
  }
}
