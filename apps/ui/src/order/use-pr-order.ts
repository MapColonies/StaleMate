import { STORAGE_KEYS } from '@/lib/local-storage';
import { useRememberedParam } from '@/lib/remembered-param';
import { DEFAULT_PR_ORDER, PR_ORDERS, type PrOrder } from './pr-order';

const isOrder = (value: string | null): value is PrOrder => value !== null && Object.hasOwn(PR_ORDERS, value);
const parseOrder = (value: string | null): PrOrder | null => (isOrder(value) ? value : null);
const formatOrder = (order: PrOrder): string => order;

/**
 * The order of the PRs. The URL's wins, so a link opens the same view; then the Viewer's saved one; then the default
 * (see useRememberedParam).
 * The Inbox and the Board share it, so it carries over from one to the other.
 */
export function usePrOrder(): [PrOrder, (order: PrOrder) => void] {
  const [order, setOrder] = useRememberedParam({
    param: 'order',
    storageKey: STORAGE_KEYS.prOrder,
    parse: parseOrder,
    format: formatOrder,
    fallback: DEFAULT_PR_ORDER,
  });
  return [order, setOrder];
}
