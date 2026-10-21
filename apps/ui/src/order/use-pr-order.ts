import { useCallback } from 'react';
import { STORAGE_KEYS, useStoredString } from '@/lib/local-storage';
import { replaceParam, useSearch } from '@/lib/url-search';
import { DEFAULT_PR_ORDER, PR_ORDERS, type PrOrder } from './pr-order';

const isOrder = (value: string | null): value is PrOrder => value !== null && Object.hasOwn(PR_ORDERS, value);

/**
 * The order of the PRs. The URL's wins, so a link opens the same view; then the Viewer's saved one; then the default.
 * Picking an order saves it and writes it to the URL; opening a link leaves the saved one alone.
 * The Inbox and the Board share it, so it carries over from one to the other.
 */
export function usePrOrder(): [PrOrder, (order: PrOrder) => void] {
  const fromUrl = new URLSearchParams(useSearch()).get('order');
  const [saved, save] = useStoredString(STORAGE_KEYS.prOrder);
  const setOrder = useCallback(
    (next: PrOrder) => {
      save(next);
      // Written even when it's the default, so the link doesn't open in the recipient's saved order instead.
      replaceParam('order', next);
    },
    [save]
  );
  return [[fromUrl, saved].find(isOrder) ?? DEFAULT_PR_ORDER, setOrder];
}
