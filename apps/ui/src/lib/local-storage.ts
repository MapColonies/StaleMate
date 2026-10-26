import { useCallback, useState } from 'react';

/** Storage keys, all under one prefix so they're easy to find and clear. */
export const STORAGE_KEYS = {
  viewer: 'stalemate.viewer',
  team: 'stalemate.team',
  view: 'stalemate.view',
  theme: 'stalemate.theme',
  hiddenTableColumns: 'stalemate.table.hiddenColumns',
  prOrder: 'stalemate.prOrder',
  groupStacks: 'stalemate.groupStacks',
  tableSort: 'stalemate.table.sort',
  osNotifications: 'stalemate.osNotifications',
} as const;

const NOTIFICATIONS_PREFIX = 'stalemate.notifications.';

/** Each Viewer's Notifications about each Team are kept under their own key. */
export const notificationsKey = (team: string, viewer: string): string => `${NOTIFICATIONS_PREFIX}${team}.${viewer}`;

/** The Team every browser that used StaleMate before Teams could be picked was looking at. */
const PRE_TEAMS_TEAM = 'infra';

/**
 * Moves each Viewer's Notification state from before it was kept per Team, to infra's key. The old keys have no dot
 * after the prefix (logins and slugs have none), and are removed, so it only ever moves them once. State already under
 * infra's key wins.
 */
export function migrateNotificationKeys(): void {
  try {
    const legacy: string[] = [];
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(NOTIFICATIONS_PREFIX) && !key.slice(NOTIFICATIONS_PREFIX.length).includes('.')) {
        legacy.push(key);
      }
    }
    for (const key of legacy) {
      const viewer = key.slice(NOTIFICATIONS_PREFIX.length);
      const target = notificationsKey(PRE_TEAMS_TEAM, viewer);
      const state = window.localStorage.getItem(key);
      if (state !== null && window.localStorage.getItem(target) === null) {
        window.localStorage.setItem(target, state);
      }
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be blocked by the browser; there is then nothing to move.
  }
}

const KEY_PREFIX = 'stalemate.';

/** Set once the existing-user check below has run, so it never runs again. */
const TEAM_MIGRATED_KEY = 'stalemate.teamMigrated';

/**
 * The one-off for existing users: the first time it runs, a browser with no Team remembered but some other `stalemate.*`
 * setting has used StaleMate before Teams could be picked, so it remembers infra, quietly. A browser with nothing stored
 * is new, and gets the first-visit modal instead. It runs once: a Team dropped later brings the modal back, not infra.
 */
export function migrateRememberedTeam(): void {
  try {
    if (window.localStorage.getItem(TEAM_MIGRATED_KEY) !== null) {
      return;
    }
    if (window.localStorage.getItem(STORAGE_KEYS.team) === null) {
      for (let index = 0; index < window.localStorage.length; index++) {
        if (window.localStorage.key(index)?.startsWith(KEY_PREFIX)) {
          window.localStorage.setItem(STORAGE_KEYS.team, PRE_TEAMS_TEAM);
          break;
        }
      }
    }
    window.localStorage.setItem(TEAM_MIGRATED_KEY, 'true');
  } catch {
    // Storage can be blocked by the browser; there is then nothing to go by.
  }
}

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage can be blocked by the browser; the app then just forgets between visits.
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // See readStored().
  }
}

/** A string kept in localStorage for this browser. `null` means nothing is stored. */
export function useStoredString(key: string): [string | null, (value: string | null) => void] {
  const [value, setValue] = useState(() => readStored(key));
  const store = useCallback(
    (next: string | null) => {
      writeStored(key, next);
      setValue(next);
    },
    [key]
  );
  return [value, store];
}
