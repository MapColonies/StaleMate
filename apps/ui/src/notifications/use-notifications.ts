import { useEffect, useState } from 'react';
import { notificationsKey, readStored, writeStored } from '@/lib/local-storage';
import type { Snapshot } from '@/snapshot/types';
import { type Notification, type NotificationState, notificationsOf, observe } from './engine';

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

/**
 * The Viewer's Notifications: each Snapshot is diffed against what this browser last saw for them, which is saved for
 * next time, so what lands while the tab is closed shows on return. None without a Viewer.
 */
export function useNotifications(snapshot: Snapshot | undefined, viewer: string | null, hideViaTeam: boolean): readonly Notification[] {
  // Tagged with its Viewer, so a switch never shows the previous Viewer's Notifications.
  const [seen, setSeen] = useState<{ viewer: string; notifications: readonly Notification[] } | null>(null);

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
    writeStored(notificationsKey(viewer), JSON.stringify(state));
    setSeen({ viewer, notifications: notificationsOf(state) });
  }, [snapshot, viewer, hideViaTeam]);

  return seen !== null && seen.viewer === viewer ? seen.notifications : [];
}
