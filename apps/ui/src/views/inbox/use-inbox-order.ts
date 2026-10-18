import { useCallback } from 'react';
import { replaceParam, useSearch } from '@/lib/url-search';
import { DEFAULT_INBOX_ORDER, INBOX_ORDERS, type InboxOrder } from './buckets';

const isOrder = (value: string | null): value is InboxOrder => value !== null && Object.hasOwn(INBOX_ORDERS, value);

/** The Inbox's order, kept in the URL beside the filters so a link opens the same view. The default is left out. */
export function useInboxOrder(): [InboxOrder, (order: InboxOrder) => void] {
  const raw = new URLSearchParams(useSearch()).get('order');
  const setOrder = useCallback((next: InboxOrder) => replaceParam('order', next === DEFAULT_INBOX_ORDER ? null : next), []);
  return [isOrder(raw) ? raw : DEFAULT_INBOX_ORDER, setOrder];
}
