import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsKey, readStored, writeStored } from '@/lib/local-storage';
import type { Snapshot } from '@/snapshot/types';
import { type Notification, type NotificationState, dismiss as dismissIn, notificationsOf, observe } from './engine';

/** What this browser saved for the Viewer under this key, or null when there's nothing usable, which starts over. */
function load(key: string): NotificationState | null {
  const raw = readStored(key);
  if (raw === null) {
    return null;
  }
  try {
    const state = JSON.parse(raw) as Partial<NotificationState> | null;
    const usable =
      typeof state?.hideViaTeam === 'boolean' &&
      typeof state.seenAt === 'number' &&
      typeof state.owed === 'object' &&
      state.owed !== null &&
      Array.isArray(state.notifications);
    return usable ? (state as NotificationState) : null;
  } catch {
    return null;
  }
}

function save(key: string, state: NotificationState): void {
  writeStored(key, JSON.stringify(state));
}

interface ViewerNotifications {
  /** In the order they were noticed; withPrs orders them for display. */
  notifications: readonly Notification[];
  /** Dismisses the Notifications of these PRs. Their Moves stay seen, so only a later change notifies again. */
  dismiss: (prIds: readonly string[]) => void;
}

/**
 * The Viewer's Notifications about the Team the Snapshot is for: each Snapshot is diffed against what this browser last
 * saw for that Team and Viewer, which is saved for next time, so what lands while the tab is closed shows on return, and other tabs show what this one saves. None
 * without a Viewer. onDue hears of the Notifications each Snapshot newly brings, for a popup. A tab that polls after
 * another saved them finds them already seen; two tabs polling at once may both hear of them, which popups' tags
 * collapse into one.
 */
export function useNotifications(
  snapshot: Snapshot | undefined,
  viewer: string | null,
  hideViaTeam: boolean,
  onDue: (due: readonly Notification[], snapshot: Snapshot) => void
): ViewerNotifications {
  // The Team and Viewer the Snapshot is for, which a Snapshot of another Team never mixes with.
  const key = snapshot !== undefined && viewer !== null ? notificationsKey(snapshot.teamInfo.slug, viewer) : null;
  // Tagged with its key, so a switch of Team or Viewer never shows the previous one's Notifications.
  const [seen, setSeen] = useState<{ key: string; state: NotificationState } | null>(null);
  // The latest, so a new callback each render doesn't diff the Snapshot again.
  const onDueRef = useRef(onDue);
  useEffect(() => {
    onDueRef.current = onDue;
  });

  useEffect(() => {
    if (snapshot === undefined || viewer === null || key === null) {
      return;
    }
    const now = Date.now();
    let observed: ReturnType<typeof observe>;
    try {
      observed = observe(load(key), snapshot, viewer, hideViaTeam, now);
    } catch {
      // What was saved is damaged further down than load() checks: start over.
      observed = observe(null, snapshot, viewer, hideViaTeam, now);
    }
    save(key, observed.state);
    setSeen({ key, state: observed.state });
    if (observed.due.length > 0) {
      onDueRef.current(observed.due, snapshot);
    }
  }, [snapshot, viewer, key, hideViaTeam]);

  // Another tab saved the Viewer's Notifications: show what it saved, so tabs agree. Not when it worked them out under
  // the other via-Team setting, which would disagree with this tab's Your turn.
  useEffect(() => {
    if (key === null) {
      return;
    }
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== key) {
        return;
      }
      const state = load(key);
      if (state?.hideViaTeam === hideViaTeam) {
        setSeen({ key, state });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, hideViaTeam]);

  const dismiss = useCallback(
    (prIds: readonly string[]) => {
      if (seen === null || seen.key !== key) {
        return;
      }
      // Every tab saves what it works out, so what is saved is the latest: dismissing from it never undoes another
      // tab's dismissal this one hasn't heard of yet.
      const saved = load(seen.key);
      const state = prIds.reduce(dismissIn, saved?.hideViaTeam === seen.state.hideViaTeam ? saved : seen.state);
      save(seen.key, state);
      setSeen({ key: seen.key, state });
    },
    [seen, key]
  );

  return { notifications: seen !== null && seen.key === key ? notificationsOf(seen.state) : [], dismiss };
}
