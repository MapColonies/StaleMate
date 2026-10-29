import { isOnViewerViaTeam, viewerMoves } from '@/snapshot/selectors';
import type { Move, Snapshot, TrackedPr } from '@/snapshot/types';

/**
 * How long a browser can be away before it starts over quietly instead of replaying everything that changed meanwhile.
 * Real time, not Working Days: it measures time away from the keyboard.
 */
export const AWAY_LIMIT_MS = 4 * 24 * 60 * 60 * 1000;

/** What the bell and drawer show of a PR, kept so a Notification outlives the PR leaving the Viewer, or the Snapshot. */
export interface PrSummary {
  repo: string;
  number: number;
  title: string;
  url: string;
}

const summaryOf = ({ repo, number, title, url }: TrackedPr): PrSummary => ({ repo, number, title, url });

/** News for the Viewer: a PR became Waiting On them, gave them new Moves, or named them where only their Team had been asked. */
export interface Notification {
  prId: string;
  /** The Moves that are news, not every Move the Viewer owes on the PR. */
  moves: Move[];
  /** When this browser noticed it, in epoch ms. */
  noticedAt: number;
  /** The PR as last seen. Absent in what an earlier version saved, until the PR is next in a Snapshot. */
  pr?: PrSummary;
  /** Whether the PR is still on the Viewer. A Notification outlives that, until dismissed. */
  onYou: boolean;
}

/** What this browser last saw for one Viewer. */
export interface NotificationState {
  /** The via-Team setting it was worked out under. */
  hideViaTeam: boolean;
  /** When it was last worked out, in epoch ms. */
  seenAt: number;
  /** The Moves the Viewer owed on each PR that was on them. */
  owed: Record<string, Move[]>;
  /** The PRs in `owed` that were on the Viewer only through a request to their Team. Absent in what an earlier version saved. */
  viaTeam?: string[];
  notifications: Notification[];
}

/** The Moves the Viewer owes on each PR on them, and which of those PRs are on them only through their Team. */
function owedMoves(snapshot: Snapshot, viewer: string, hideViaTeam: boolean): { owed: Record<string, Move[]>; viaTeam: string[] } {
  const owed: Record<string, Move[]> = {};
  const viaTeam: string[] = [];
  for (const pr of snapshot.prs) {
    const moves = viewerMoves(pr, viewer, hideViaTeam);
    if (moves.length > 0) {
      owed[pr.id] = moves;
      if (isOnViewerViaTeam(pr, viewer, { hideViaTeam })) {
        viaTeam.push(pr.id);
      }
    }
  }
  return { owed, viaTeam };
}

/**
 * Diffs a new Snapshot against what this browser last saw for the Viewer. Returns the state to save next, and the
 * Notifications newly due for a popup, holding only their new Moves.
 *
 * With nothing seen before it starts over: what is on the Viewer now becomes the baseline, with no Notifications.
 * A different via-Team setting keeps the Notifications and re-baselines quietly under the new one. A gap over
 * AWAY_LIMIT_MS keeps them and adds what changed meanwhile, but due is empty: no popups for a vacation's worth.
 * A Notification is never discarded except by dismiss.
 */
export function observe(
  previous: NotificationState | null,
  snapshot: Snapshot,
  viewer: string,
  hideViaTeam: boolean,
  now: number
): { state: NotificationState; due: Notification[] } {
  const { owed, viaTeam } = owedMoves(snapshot, viewer, hideViaTeam);
  if (previous === null) {
    return { state: { hideViaTeam, seenAt: now, owed, viaTeam, notifications: [] }, due: [] };
  }

  const away = now - previous.seenAt > AWAY_LIMIT_MS;
  // Under another via-Team setting what is on the Viewer changes without anything having happened: compare to now.
  const requalified = previous.hideViaTeam !== hideViaTeam;
  const before = requalified ? owed : previous.owed;
  const wasViaTeam = new Set(requalified ? viaTeam : (previous.viaTeam ?? []));
  const isViaTeam = new Set(viaTeam);
  /** The Moves on a PR that are news: all of them when a request to the Team now names the Viewer, else the ones not owed before. */
  const freshMoves = (prId: string, moves: Move[]): Move[] =>
    wasViaTeam.has(prId) && !isViaTeam.has(prId) ? moves : moves.filter((move) => !(before[prId] ?? []).includes(move));
  const prs = new Map(snapshot.prs.map((pr) => [pr.id, pr]));

  const due: Notification[] = [];
  const notifications: Notification[] = [];
  for (const existing of previous.notifications) {
    const moves = owed[existing.prId];
    const pr = prs.get(existing.prId);
    const summary = pr === undefined ? existing.pr : summaryOf(pr);
    if (moves === undefined) {
      // No longer on the Viewer: stays, as it was, until dismissed.
      notifications.push({ ...existing, onYou: false, ...(summary && { pr: summary }) });
      continue;
    }
    // Still on the Viewer: it only tells about Moves still owed, and only until those are done.
    const fresh = freshMoves(existing.prId, moves);
    const kept = existing.moves.filter((move) => moves.includes(move));
    const merged = moves.filter((move) => fresh.includes(move) || kept.includes(move));
    if (merged.length > 0) {
      notifications.push({
        ...existing,
        moves: merged,
        noticedAt: fresh.length > 0 ? now : existing.noticedAt,
        onYou: true,
        ...(summary && { pr: summary }),
      });
    }
    if (fresh.length > 0 && !away) {
      due.push({ prId: existing.prId, moves: fresh, noticedAt: now, onYou: true });
    }
  }

  const hadNotification = new Set(previous.notifications.map(({ prId }) => prId));
  for (const [prId, moves] of Object.entries(owed)) {
    if (hadNotification.has(prId)) {
      continue;
    }
    const fresh = freshMoves(prId, moves);
    if (fresh.length > 0) {
      const pr = prs.get(prId);
      notifications.push({ prId, moves: fresh, noticedAt: now, onYou: true, ...(pr && { pr: summaryOf(pr) }) });
      if (!away) {
        due.push({ prId, moves: fresh, noticedAt: now, onYou: true });
      }
    }
  }
  // Oldest first, as they were noticed.
  notifications.sort((a, b) => a.noticedAt - b.noticedAt);
  return { state: { hideViaTeam, seenAt: now, owed, viaTeam, notifications }, due };
}

/** Removes the PR's Notification. The Moves it told about stay seen, so only a later change notifies again. */
export function dismiss(state: NotificationState, prId: string): NotificationState {
  return { ...state, notifications: state.notifications.filter((notification) => notification.prId !== prId) };
}

/** The Notifications the Viewer has, oldest first. */
export function notificationsOf(state: NotificationState): readonly Notification[] {
  return state.notifications;
}

/**
 * Each Notification with its PR, newest first; Notifications noticed together keep the order of their PRs in the
 * Snapshot, so the order is stable across polls. A Notification outlives the PR leaving the Viewer, so its PR may be
 * only the summary it kept; one with no PR at all is left out. The bell, the drawer and the popups all go through this,
 * so they always agree.
 */
export function withPrs(
  notifications: readonly Notification[],
  prs: readonly TrackedPr[]
): { notification: Notification; pr: PrSummary & { id: string } }[] {
  const positions = new Map(prs.map((pr, index) => [pr.id, index]));
  return notifications
    .flatMap((notification) => {
      const index = positions.get(notification.prId);
      const summary = index === undefined ? notification.pr : summaryOf(prs[index]);
      return summary === undefined ? [] : [{ notification, pr: { id: notification.prId, ...summary }, index: index ?? Infinity }];
    })
    .sort((a, b) => b.notification.noticedAt - a.notification.noticedAt || a.index - b.index)
    .map(({ notification, pr }) => ({ notification, pr }));
}
