import { useCallback, useMemo } from 'react';
import { useStoredString } from './local-storage';
import { replaceParam, useSearch } from './url-search';

interface RememberedParam<T> {
  param: string;
  storageKey: string;
  /** The value a raw string stands for; null when it's unusable. */
  parse: (raw: string | null) => T | null;
  format: (value: T) => string;
  fallback: T;
}

/**
 * A view setting kept in the URL, so a link opens the same view, and saved in this browser for next time.
 * The URL's wins, then the saved one, then the fallback. Setting it saves it and writes it to the URL;
 * opening a link leaves the saved one alone. Resetting forgets the saved one and goes back to the fallback.
 * `parse`, `format` and `fallback` must keep their identity across renders, or the value is re-read every render.
 */
export function useRememberedParam<T>({ param, storageKey, parse, format, fallback }: RememberedParam<T>): [T, (next: T) => void, () => void] {
  const search = useSearch();
  const [saved, save] = useStoredString(storageKey);
  // Memoized so an unchanged setting keeps its identity across renders.
  const value = useMemo(() => parse(new URLSearchParams(search).get(param)) ?? parse(saved) ?? fallback, [search, saved, param, parse, fallback]);
  const set = useCallback(
    (next: T) => {
      const raw = format(next);
      save(raw);
      // Written even when it's the fallback, so the link doesn't open in the recipient's saved setting instead.
      replaceParam(param, raw);
    },
    [save, format, param]
  );
  const reset = useCallback(() => {
    save(null);
    replaceParam(param, format(fallback));
  }, [save, format, fallback, param]);
  return [value, set, reset];
}
