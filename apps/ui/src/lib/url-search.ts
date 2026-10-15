import { useSyncExternalStore } from 'react';

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

export const currentSearch = (): string => window.location.search;

/** Swaps the query string without adding a history entry, and tells every useSearch() about it. */
export function replaceSearch(search: string): void {
  const { pathname, hash } = window.location;
  window.history.replaceState(window.history.state, '', `${pathname}${search ? `?${search}` : ''}${hash}`);
  window.dispatchEvent(new Event(URL_CHANGE));
}

/** The current query string, re-rendering when the app or the browser changes it. */
export function useSearch(): string {
  return useSyncExternalStore(subscribe, currentSearch);
}

/** Sets or, with null, removes one query parameter, leaving the rest alone. */
export function replaceParam(param: string, value: string | null): void {
  const params = new URLSearchParams(currentSearch());
  if (value === null) {
    params.delete(param);
  } else {
    params.set(param, value);
  }
  replaceSearch(params.toString());
}
