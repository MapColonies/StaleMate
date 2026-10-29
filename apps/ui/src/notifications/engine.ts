import { viewerMoves } from '@/snapshot/selectors';
import type { Move, Snapshot, TrackedPr } from '@/snapshot/types';

/**
 * How long a browser can be away before it starts over quietly instead of replaying everything that changed meanwhile.
 * Real time, not Working Days: it measures time away from the keyboard.
 */
export const AWAY_LIMIT_MS = 4 * 24 * 60 * 60 * 1000;

/** News for the Viewer: a PR became Waiting On them, or gave them new Moves. */
export interface Notification {
  prId: string;
  /** The Moves that are news, not every Move the Viewer owes on the PR. */
  moves: Move[];
  /** When this browser noticed it, in epoch ms. */
  noticedAt: number;
}

/** What this browser last saw for one Viewer. */
export interface NotificationState {
  /** The via-Team setting it was worked out under. */
  hideViaTeam: boolean;
  /** When it was last worked out, in epoch ms. */
  seenAt: number;
  /** The Moves the Viewer owed on each PR that was on them. */
  owed: Record<string, Move[]>;
  notifications: Notification[];
}

/** The Moves the Viewer owes on each PR on them. */
function owedMoves(snapshot: Snapshot, viewer: string, hideViaTeam: boolean): Record<string, Move[]> {
  const owed: Record<string, Move[]> = {};
  for (const pr of snapshot.prs) {
    const moves = viewerMoves(pr, viewer, hideViaTeam);
    if (moves.length > 0) {
      owed[pr.id] = moves;
    }
  }
  return owed;
}

/**
 * Diffs a new Snapshot against what this browser last saw for the Viewer. Returns the state to save next, and the
 * Notifications newly due for a popup, holding only their new Moves.
 *
 * With nothing seen before, a different via-Team setting, or a gap over AWAY_LIMIT_MS, it starts over: what is on the
 * Viewer now becomes the baseline, with no Notifications.
 */
export function observe(
  previous: NotificationState | null,
  snapshot: Snapshot,
  viewer: string,
  hideViaTeam: boolean,
  now: number
): { state: NotificationState; due: Notification[] } {
  const owed = owedMoves(snapshot, viewer, hideViaTeam);
  if (previous === null || previous.hideViaTeam !== hideViaTeam || now - previous.seenAt > AWAY_LIMIT_MS) {
    return { state: { hideViaTeam, seenAt: now, owed, notifications: [] }, due: [] };
  }

  const due: Notification[] = [];
  const earlier = new Map(previous.notifications.map((notification) => [notification.prId, notification]));
  const notifications: Notification[] = [];
  for (const [prId, moves] of Object.entries(owed)) {
    const before = previous.owed[prId] ?? [];
    const fresh = moves.filter((move) => !before.includes(move));
    // A Notification only tells about Moves still owed.
    const existing = earlier.get(prId);
    const kept = existing?.moves.filter((move) => moves.includes(move)) ?? [];
    if (fresh.length > 0) {
      due.push({ prId, moves: fresh, noticedAt: now });
    }
    if (fresh.length > 0 || kept.length > 0) {
      const merged = moves.filter((move) => fresh.includes(move) || kept.includes(move));
      notifications.push({ prId, moves: merged, noticedAt: fresh.length > 0 || existing === undefined ? now : existing.noticedAt });
    }
  }
  // Oldest first, as they were noticed.
  notifications.sort((a, b) => a.noticedAt - b.noticedAt);
  return { state: { hideViaTeam, seenAt: now, owed, notifications }, due };
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
 * Snapshot, so the order is stable across polls. A Notification is only kept while its PR is on the Viewer, so it is in
 * the Snapshot; any whose PR isn't is left out, so the bell, the drawer and the popups always agree.
 */
export function withPrs(notifications: readonly Notification[], prs: readonly TrackedPr[]): { notification: Notification; pr: TrackedPr }[] {
  const positions = new Map(prs.map((pr, index) => [pr.id, index]));
  return notifications
    .flatMap((notification) => {
      const index = positions.get(notification.prId);
      return index === undefined ? [] : [{ notification, pr: prs[index], index }];
    })
    .sort((a, b) => b.notification.noticedAt - a.notification.noticedAt || a.index - b.index)
    .map(({ notification, pr }) => ({ notification, pr }));
}
