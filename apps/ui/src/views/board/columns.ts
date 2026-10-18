import { partyKey } from '@/filters/filter-model';
import { DEFAULT_PR_ORDER, PR_ORDERS, type PrOrder } from '@/order/pr-order';
import type { Person, TrackedPr, WaitingOnParty } from '@/snapshot/types';

/** Whom a column waits on: a person, or a team. A person's role differs from PR to PR, so it stays on the cards. */
export type ColumnOwner = { type: 'person'; person: Person } | { type: 'team'; slug: string; viaTeam: boolean };

export interface BoardColumn {
  /** The owner's key in the waitingOn filter: a login, or @slug for a team. */
  key: string;
  owner: ColumnOwner;
  prs: TrackedPr[];
}

const ownerOf = (party: WaitingOnParty): ColumnOwner =>
  party.type === 'team'
    ? { type: 'team', slug: party.slug, viaTeam: party.viaTeam }
    : { type: 'person', person: { login: party.login, kind: party.kind } };

/** The column is the Viewer's own. */
export const isViewersColumn = (owner: ColumnOwner, viewer: string | null): boolean => owner.type === 'person' && owner.person.login === viewer;

/** The Viewer first; then the Team and its members; then outsiders and other teams, whom no Team Member can chase as easily. */
function rank(column: BoardColumn, viewer: string | null): number {
  const { owner } = column;
  if (isViewersColumn(owner, viewer)) {
    return 0;
  }
  const ours = owner.type === 'team' ? owner.viaTeam : owner.person.kind === 'member';
  return ours ? 1 : 2;
}

/**
 * The Board's columns: one per party the PRs are Waiting On, each holding every PR that waits on it, in the given order.
 * A PR waiting on two parties is in both columns. A request to the Team stays in the Team's column rather than in
 * every member's. The Viewer's column comes first, even when nothing waits on them; the rest go by most PRs first.
 */
export function boardColumns(prs: readonly TrackedPr[], viewer: string | null, order: PrOrder = DEFAULT_PR_ORDER): BoardColumn[] {
  const columns = new Map<string, BoardColumn>();
  if (viewer !== null) {
    columns.set(viewer, { key: viewer, owner: { type: 'person', person: { login: viewer, kind: 'member' } }, prs: [] });
  }
  for (const pr of [...prs].sort(PR_ORDERS[order].compare)) {
    for (const party of pr.waitingOn) {
      const key = partyKey(party);
      const column = columns.get(key) ?? { key, owner: ownerOf(party), prs: [] };
      column.prs.push(pr);
      columns.set(key, column);
    }
  }
  return [...columns.values()].sort(
    (a, b) => rank(a, viewer) - rank(b, viewer) || b.prs.length - a.prs.length || a.key.localeCompare(b.key, undefined, { sensitivity: 'base' })
  );
}

export interface BoardStats {
  /** How many PRs are at each Urgency, from 0 to 3. */
  byUrgency: [number, number, number, number];
  /** Drafts have no Urgency. */
  drafts: number;
  noReviewer: number;
  /** The column with the most PRs, the first in order on a tie; `null` when no PR is on the Board. */
  biggest: BoardColumn | null;
}

/** The stats strip over the Board: each PR counted once, however many columns it is in. */
export function boardStats(prs: readonly TrackedPr[], columns: readonly BoardColumn[]): BoardStats {
  const stats: BoardStats = { byUrgency: [0, 0, 0, 0], drafts: 0, noReviewer: 0, biggest: null };
  for (const pr of prs) {
    if (pr.urgency === null) {
      stats.drafts++;
    } else {
      stats.byUrgency[pr.urgency] = (stats.byUrgency[pr.urgency] ?? 0) + 1;
    }
    if (pr.noReviewer) {
      stats.noReviewer++;
    }
  }
  for (const column of columns) {
    if (column.prs.length > (stats.biggest?.prs.length ?? 0)) {
      stats.biggest = column;
    }
  }
  return stats;
}
