import { useMemo } from 'react';
import type { ColumnVisibilityState } from '@tanstack/react-table';
import { STORAGE_KEYS, useStoredString } from '@/lib/local-storage';

/**
 * The columns the Viewer hid with the column picker, kept in localStorage for this browser.
 * Only hidden columns are stored, so a column added later shows by default.
 */
export function useHiddenColumns(): [ColumnVisibilityState, (visibility: ColumnVisibilityState) => void] {
  const [stored, store] = useStoredString(STORAGE_KEYS.hiddenTableColumns);
  const visibility = useMemo(
    () =>
      Object.fromEntries(
        (stored ?? '')
          .split(',')
          .filter(Boolean)
          .map((id) => [id, false])
      ),
    [stored]
  );
  const setVisibility = (next: ColumnVisibilityState) => {
    const hidden = Object.keys(next).filter((id) => next[id] === false);
    store(hidden.length > 0 ? hidden.join(',') : null);
  };
  return [visibility, setVisibility];
}
