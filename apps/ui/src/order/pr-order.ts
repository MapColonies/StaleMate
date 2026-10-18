import type { TrackedPr } from '@/snapshot/types';

/** How the PRs are ordered within an Inbox bucket or a Board column. */
export const PR_ORDERS = {
  oldest: { label: 'Oldest first', compare: (a: TrackedPr, b: TrackedPr) => b.age.workingMs - a.age.workingMs },
  newest: { label: 'Newest first', compare: (a: TrackedPr, b: TrackedPr) => a.age.workingMs - b.age.workingMs },
  idleLongest: { label: 'Idle longest first', compare: (a: TrackedPr, b: TrackedPr) => b.idleTime.workingMs - a.idleTime.workingMs },
  recentlyActive: { label: 'Recently active first', compare: (a: TrackedPr, b: TrackedPr) => a.idleTime.workingMs - b.idleTime.workingMs },
} as const;

export type PrOrder = keyof typeof PR_ORDERS;

/** Oldest first: the Age StaleMate exists to shrink. */
export const DEFAULT_PR_ORDER: PrOrder = 'oldest';
