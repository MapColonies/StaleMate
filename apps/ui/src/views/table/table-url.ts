import { useCallback, useMemo } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { replaceParam, useSearch } from '@/lib/url-search';
import { SORTABLE_COLUMNS } from './table-model';
import { TABS, type Tab } from './tabs';

/** Oldest first: the Age StaleMate exists to shrink. */
const DEFAULT_SORTING: SortingState = [{ id: 'age', desc: true }];

const isTab = (value: string | null): value is Tab => TABS.includes(value as Tab);

/** Reads "repo.asc,age.desc", keeping the levels on columns that can sort. Nothing usable means the default. */
function parseSorting(raw: string | null): SortingState {
  const sorting = (raw ?? '')
    .split(',')
    .map((level) => level.split('.'))
    .filter(([id, dir]) => id !== undefined && (SORTABLE_COLUMNS as readonly string[]).includes(id) && (dir === 'asc' || dir === 'desc'))
    .map(([id, dir]) => ({ id: id as string, desc: dir === 'desc' }))
    .filter((level, index, all) => all.findIndex((other) => other.id === level.id) === index);
  return sorting.length > 0 ? sorting : DEFAULT_SORTING;
}

const formatSorting = (sorting: SortingState): string => sorting.map(({ id, desc }) => `${id}.${desc ? 'desc' : 'asc'}`).join(',');

const DEFAULT_SORT_PARAM = formatSorting(DEFAULT_SORTING);

/** The sort parameter's value; null for the default, which stays out of the URL. */
function sortParam(sorting: SortingState): string | null {
  const value = formatSorting(sorting);
  return value === '' || value === DEFAULT_SORT_PARAM ? null : value;
}

/**
 * The Table's tab and sort, kept in the URL beside the filters so a link opens the same view.
 * Defaults are left out of the URL.
 */
export function useTableUrlState() {
  const search = useSearch();
  const { tab, sorting } = useMemo(() => {
    const params = new URLSearchParams(search);
    const tab = params.get('tab');
    return { tab: isTab(tab) ? tab : 'all', sorting: parseSorting(params.get('sort')) };
  }, [search]);

  const setTab = useCallback((next: Tab) => replaceParam('tab', next === 'all' ? null : next), []);
  const setSorting = useCallback((next: SortingState) => replaceParam('sort', sortParam(next)), []);

  return { tab, setTab, sorting, setSorting };
}
