import { STORAGE_KEYS, useStoredString } from '@/lib/local-storage';

export const VIEWS = ['table', 'inbox', 'board'] as const;

export type View = (typeof VIEWS)[number];

export const VIEW_NAMES: Record<View, string> = { table: 'Table', inbox: 'Inbox', board: 'Board' };

const isView = (value: string | null): value is View => VIEWS.includes(value as View);

/** The last view this browser used, the Table by default. */
export function useLastView(): [View, (view: View) => void] {
  const [stored, store] = useStoredString(STORAGE_KEYS.view);
  return [isView(stored) ? stored : 'table', store];
}
