import { useCallback, useEffect, useMemo } from 'react';
import { DEFAULT_FILTERS, serializeFilters } from '@/filters/filter-model';
import { STORAGE_KEYS, useStoredString } from '@/lib/local-storage';
import { currentSearch, replaceParam, replaceSearch, useSearch } from '@/lib/url-search';

const PARAM = 'team';

/**
 * The Team the Viewer is looking at: `?team=` in the URL, else the one remembered in this browser, else none (the
 * first-visit modal asks). Only a Team in `known` counts, once they are known: any other is dropped from the URL and
 * from storage. Picking a Team saves it and writes it to the URL like the other remembered settings, and clears
 * the filters, whose values name one Team's repos and people. `drop` is for a Team the API itself turned away.
 */
export function useTeam(known: readonly string[] | undefined): {
  team: string | null;
  selectTeam: (slug: string) => void;
  dropTeam: (slug: string) => void;
} {
  const search = useSearch();
  const [saved, save] = useStoredString(STORAGE_KEYS.team);
  const fromUrl = useMemo(() => new URLSearchParams(search).get(PARAM) || null, [search]);
  const isKnown = useCallback((slug: string | null): slug is string => slug !== null && (known === undefined || known.includes(slug)), [known]);

  useEffect(() => {
    if (known === undefined) {
      return;
    }
    if (fromUrl !== null && !isKnown(fromUrl)) {
      replaceParam(PARAM, null);
    }
    if (saved !== null && !isKnown(saved)) {
      save(null);
    }
  }, [known, fromUrl, saved, isKnown, save]);

  const selectTeam = useCallback(
    (slug: string) => {
      save(slug);
      const params = new URLSearchParams(serializeFilters(DEFAULT_FILTERS, currentSearch()));
      params.set(PARAM, slug);
      replaceSearch(params.toString());
    },
    [save]
  );

  const dropTeam = useCallback(
    (slug: string) => {
      if (new URLSearchParams(currentSearch()).get(PARAM) === slug) {
        replaceParam(PARAM, null);
      }
      if (saved === slug) {
        save(null);
      }
    },
    [saved, save]
  );

  // The URL's wins, then the saved one. An unknown URL Team falls through to the saved one.
  const team = isKnown(fromUrl) ? fromUrl : isKnown(saved) ? saved : null;
  return { team, selectTeam, dropTeam };
}
