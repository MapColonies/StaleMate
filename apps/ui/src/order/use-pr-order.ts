import { useCallback } from 'react';
import { replaceParam, useSearch } from '@/lib/url-search';
import { DEFAULT_PR_ORDER, PR_ORDERS, type PrOrder } from './pr-order';

const isOrder = (value: string | null): value is PrOrder => value !== null && Object.hasOwn(PR_ORDERS, value);

/**
 * The order of the PRs, kept in the URL beside the filters so a link opens the same view. The default is left out.
 * The Inbox and the Board share it, so it carries over from one to the other.
 */
export function usePrOrder(): [PrOrder, (order: PrOrder) => void] {
  const raw = new URLSearchParams(useSearch()).get('order');
  const setOrder = useCallback((next: PrOrder) => replaceParam('order', next === DEFAULT_PR_ORDER ? null : next), []);
  return [isOrder(raw) ? raw : DEFAULT_PR_ORDER, setOrder];
}
