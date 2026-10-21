import { columnVisibilityFeature, createSortedRowModel, rowSortingFeature, sortFn_basic, sortFn_text, tableFeatures } from '@tanstack/react-table';

export const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, text: sortFn_text },
});

/** Each column's name, for its header and the column picker. */
export const COLUMN_NAMES = {
  age: 'Age',
  idle: 'Idle',
  waitingOn: 'Waiting On',
  repo: 'Repo',
  title: 'PR',
  author: 'Author',
  review: 'Review',
  checks: 'Checks',
  jira: 'Jira',
  reasons: 'Why tracked',
} as const;

export type ColumnId = keyof typeof COLUMN_NAMES;

export const SORTABLE_COLUMNS: readonly ColumnId[] = ['age', 'idle', 'repo', 'title', 'author', 'review', 'checks', 'jira'];
