import { TriangleAlert } from 'lucide-react';
import { formatSince } from '@/lib/time';
import type { Snapshot } from '@/snapshot/types';

/** Warns of an Out-of-date Snapshot: shown only while the last sweep failed. */
export function OutOfDateBanner({ snapshot, now }: { snapshot: Snapshot; now: number }) {
  const { lastError } = snapshot.sync;
  if (lastError === undefined) {
    return null;
  }
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-5 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <TriangleAlert className="size-4 shrink-0" />
      Showing data from {formatSince(snapshot.readAt, now)} ago — sync failing: {lastError}
    </div>
  );
}
