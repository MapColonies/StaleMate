import { useCallback, useMemo } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { STORAGE_KEYS } from '@/lib/local-storage';
import { useRememberedParam } from '@/lib/remembered-param';
import { replaceParam, useSearch } from '@/lib/url-search';
import { SORTABLE_COLUMNS } from './table-model';
import { TABS, type Tab } from './tabs';

/** Newest first, as in the Inbox and the Board: the day-to-day flow first, closing out old PRs second. */
const DEFAULT_SORTING: SortingState = [{ id: 'age', desc: false }];

const isTab = (value: string | null): value is Tab => TABS.includes(value as Tab);

/** Reads "repo.asc,age.desc", keeping the levels on columns that can sort. Nothing usable means null. */
function parseSorting(raw: string | null): SortingState | null {
  const sorting = (raw ?? '')
    .split(',')
    .map((level) => level.split('.'))
    .filter(([id, dir]) => id !== undefined && (SORTABLE_COLUMNS as readonly string[]).includes(id) && (dir === 'asc' || dir === 'desc'))
    .map(([id, dir]) => ({ id: id as string, desc: dir === 'desc' }))
    .filter((level, index, all) => all.findIndex((other) => other.id === level.id) === index);
  return sorting.length > 0 ? sorting : null;
}

const formatSorting = (sorting: SortingState): string => sorting.map(({ id, desc }) => `${id}.${desc ? 'desc' : 'asc'}`).join(',');

const DEFAULT_SORT_PARAM = formatSorting(DEFAULT_SORTING);

export const isDefaultSorting = (sorting: SortingState): boolean => formatSorting(sorting) === DEFAULT_SORT_PARAM;

/**
 * The Table's tab and sort, kept in the URL beside the filters so a link opens the same view. The default tab is
 * left out of the URL; the sort is also remembered in this browser (see useRememberedParam).
 */
export function useTableUrlState() {
  const search = useSearch();
  const tab = useMemo(() => {
    const tab = new URLSearchParams(search).get('tab');
    return isTab(tab) ? tab : 'all';
  }, [search]);
  const [sorting, setSorting, resetSorting] = useRememberedParam({
    param: 'sort',
    storageKey: STORAGE_KEYS.tableSort,
    parse: parseSorting,
    format: formatSorting,
    fallback: DEFAULT_SORTING,
  });

  const setTab = useCallback((next: Tab) => replaceParam('tab', next === 'all' ? null : next), []);

  return { tab, setTab, sorting, setSorting, resetSorting };
}
