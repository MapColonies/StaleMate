import { useCallback, useState } from 'react';

/** Storage keys, all under one prefix so they're easy to find and clear. */
export const STORAGE_KEYS = {
  viewer: 'stalemate.viewer',
  view: 'stalemate.view',
  theme: 'stalemate.theme',
  hiddenTableColumns: 'stalemate.table.hiddenColumns',
  prOrder: 'stalemate.prOrder',
  tableSort: 'stalemate.table.sort',
} as const;

/** Each Viewer's Notifications are kept under their own key. */
export const notificationsKey = (viewer: string): string => `stalemate.notifications.${viewer}`;

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
