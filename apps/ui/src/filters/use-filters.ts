import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_FILTERS, type Filters, parseFilters, serializeFilters } from './filter-model';

// history.replaceState fires no event, so the app announces its own URL changes.
const URL_CHANGE = 'stalemate:urlchange';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(URL_CHANGE, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(URL_CHANGE, onChange);
  };
}

const currentSearch = (): string => window.location.search;

function replaceSearch(search: string): void {
  const { pathname, hash } = window.location;
  window.history.replaceState(window.history.state, '', `${pathname}${search ? `?${search}` : ''}${hash}`);
  window.dispatchEvent(new Event(URL_CHANGE));
}

/** The shared filter model, read from and written to the URL. */
export function useFilters(): { filters: Filters; setFilters: (patch: Partial<Filters>) => void; resetFilters: () => void } {
  const search = useSyncExternalStore(subscribe, currentSearch);
  const filters = useMemo(() => parseFilters(search), [search]);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    const search = currentSearch();
    replaceSearch(serializeFilters({ ...parseFilters(search), ...patch }, search));
  }, []);
  const resetFilters = useCallback(() => replaceSearch(serializeFilters(DEFAULT_FILTERS, currentSearch())), []);

  return { filters, setFilters, resetFilters };
}
