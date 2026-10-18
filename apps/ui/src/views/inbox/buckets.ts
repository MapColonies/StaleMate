import type { Filters } from '@/filters/filter-model';
import { isWaitingOnViewer } from '@/snapshot/selectors';
import type { TrackedPr } from '@/snapshot/types';

/** The Inbox's buckets, in the order it shows them; a PR lands in the first that takes it. */
export const BUCKETS = ['yourTurn', 'yourPrs', 'noReviewer', 'rest'] as const;

export type BucketKey = (typeof BUCKETS)[number];

// Only a Viewer has a turn or PRs of their own.
const VIEWERS_BUCKETS: readonly BucketKey[] = ['yourTurn', 'yourPrs'];

export interface Bucket {
  key: BucketKey;
  prs: TrackedPr[];
}

function bucketOf(pr: TrackedPr, viewer: string | null, filters: Pick<Filters, 'hideViaTeam'>): BucketKey {
  if (isWaitingOnViewer(pr, viewer, filters)) {
    return 'yourTurn';
  }
  if (pr.author.login === viewer) {
    return 'yourPrs';
  }
  return pr.noReviewer ? 'noReviewer' : 'rest';
}

/**
 * The PRs in the Inbox's buckets, each PR in exactly one, oldest first within a bucket.
 * Your turn takes the Team's requests too, mixed in, unless the via-Team filter hides them.
 * Without a Viewer, their buckets are left out: they could only ever be empty.
 */
export function inboxBuckets(prs: readonly TrackedPr[], viewer: string | null, filters: Pick<Filters, 'hideViaTeam'>): Bucket[] {
  const buckets = BUCKETS.map((key): Bucket => ({ key, prs: [] }));
  const oldestFirst = [...prs].sort((a, b) => b.age.workingMs - a.age.workingMs);
  for (const pr of oldestFirst) {
    buckets[BUCKETS.indexOf(bucketOf(pr, viewer, filters))]?.prs.push(pr);
  }
  return viewer === null ? buckets.filter((bucket) => !VIEWERS_BUCKETS.includes(bucket.key)) : buckets;
}
