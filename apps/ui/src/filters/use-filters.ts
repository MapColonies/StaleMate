import { useCallback, useMemo } from 'react';
import { currentSearch, replaceSearch, useSearch } from '@/lib/url-search';
import { DEFAULT_FILTERS, type Filters, parseFilters, serializeFilters } from './filter-model';

/** The shared filter model, read from and written to the URL. */
export function useFilters(): { filters: Filters; setFilters: (patch: Partial<Filters>) => void; resetFilters: () => void } {
  const search = useSearch();
  const filters = useMemo(() => parseFilters(search), [search]);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    const search = currentSearch();
    replaceSearch(serializeFilters({ ...parseFilters(search), ...patch }, search));
  }, []);
  const resetFilters = useCallback(() => replaceSearch(serializeFilters(DEFAULT_FILTERS, currentSearch())), []);

  return { filters, setFilters, resetFilters };
}
