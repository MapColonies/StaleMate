import { TriangleAlert } from 'lucide-react';
import { SECOND, formatSince } from '@/lib/time';
import { useNow } from '@/lib/use-now';
import type { Snapshot } from '@/snapshot/types';

/** Warns of an Out-of-date Snapshot: shown only while the last sweep failed. */
export function OutOfDateBanner({ snapshot }: { snapshot: Snapshot }) {
  const { lastError } = snapshot.sync;
  return lastError === undefined ? null : <Warning readAt={snapshot.readAt} lastError={lastError} />;
}

/** Apart from the banner, so the one-second tick runs only while the warning is up. */
function Warning({ readAt, lastError }: { readAt: string; lastError: string }) {
  const now = useNow(SECOND);
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-5 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <TriangleAlert className="size-4 shrink-0" />
      Showing the Snapshot from {formatSince(readAt, now)} ago — the last sync with GitHub failed: {lastError}
    </div>
  );
}
