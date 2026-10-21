import { useCallback, useEffect, useState } from 'react';
import { notificationsKey, readStored, writeStored } from '@/lib/local-storage';
import type { Snapshot } from '@/snapshot/types';
import { type Notification, type NotificationState, dismiss as dismissIn, notificationsOf, observe } from './engine';

/** What this browser saved for the Viewer, or null when there's nothing usable, which starts over. */
function load(viewer: string): NotificationState | null {
  const raw = readStored(notificationsKey(viewer));
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

function save(viewer: string, state: NotificationState): void {
  writeStored(notificationsKey(viewer), JSON.stringify(state));
}

interface ViewerNotifications {
  /** Oldest first. */
  notifications: readonly Notification[];
  /** Dismisses the Notifications of these PRs. Their Moves stay seen, so only a later change notifies again. */
  dismiss: (prIds: readonly string[]) => void;
}

/**
 * The Viewer's Notifications: each Snapshot is diffed against what this browser last saw for them, which is saved for
 * next time, so what lands while the tab is closed shows on return, and other tabs show what this one saves. None
 * without a Viewer.
 */
export function useNotifications(snapshot: Snapshot | undefined, viewer: string | null, hideViaTeam: boolean): ViewerNotifications {
  // Tagged with its Viewer, so a switch never shows the previous Viewer's Notifications.
  const [seen, setSeen] = useState<{ viewer: string; state: NotificationState } | null>(null);

  useEffect(() => {
    if (snapshot === undefined || viewer === null) {
      return;
    }
    const now = Date.now();
    let state: NotificationState;
    try {
      ({ state } = observe(load(viewer), snapshot, viewer, hideViaTeam, now));
    } catch {
      // What was saved is damaged further down than load() checks: start over.
      ({ state } = observe(null, snapshot, viewer, hideViaTeam, now));
    }
    save(viewer, state);
    setSeen({ viewer, state });
  }, [snapshot, viewer, hideViaTeam]);

  // Another tab saved the Viewer's Notifications: show what it saved, so tabs agree. Not when it worked them out under
  // the other via-Team setting, which would disagree with this tab's Your turn.
  useEffect(() => {
    if (viewer === null) {
      return;
    }
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== notificationsKey(viewer)) {
        return;
      }
      const state = load(viewer);
      if (state?.hideViaTeam === hideViaTeam) {
        setSeen({ viewer, state });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [viewer, hideViaTeam]);

  const dismiss = useCallback(
    (prIds: readonly string[]) => {
      if (seen === null || seen.viewer !== viewer) {
        return;
      }
      // Every tab saves what it works out, so what is saved is the latest: dismissing from it never undoes another
      // tab's dismissal this one hasn't heard of yet.
      const saved = load(seen.viewer);
      const state = prIds.reduce(dismissIn, saved?.hideViaTeam === seen.state.hideViaTeam ? saved : seen.state);
      save(seen.viewer, state);
      setSeen({ viewer: seen.viewer, state });
    },
    [seen, viewer]
  );

  return { notifications: seen !== null && seen.viewer === viewer ? notificationsOf(seen.state) : [], dismiss };
}
