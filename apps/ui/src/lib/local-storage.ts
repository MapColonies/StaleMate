import { useCallback, useState } from 'react';

/** Storage keys, all under one prefix so they're easy to find and clear. */
export const STORAGE_KEYS = {
  viewer: 'stalemate.viewer',
  view: 'stalemate.view',
  theme: 'stalemate.theme',
} as const;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage can be blocked by the browser; the app then just forgets between visits.
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // See read().
  }
}

/** A string kept in localStorage for this browser. `null` means nothing is stored. */
export function useStoredString(key: string): [string | null, (value: string | null) => void] {
  const [value, setValue] = useState(() => read(key));
  const store = useCallback(
    (next: string | null) => {
      write(key, next);
      setValue(next);
    },
    [key]
  );
  return [value, store];
}
