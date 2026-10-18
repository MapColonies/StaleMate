import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrackedPr } from '@/snapshot/types';
import { clockHover, idleHover, wholeWorkingDays } from './clocks';

// Neutral, yellow, orange, red; a Draft has no Urgency.
const URGENCY_STYLES = [
  'bg-muted text-muted-foreground',
  'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
] as const;

// The same hues, solid, for a bar down the edge of a row.
const URGENCY_BARS = ['bg-transparent', 'bg-yellow-400', 'bg-orange-500', 'bg-red-500'] as const;

/** The same hues, solid, for a dot or a share of a bar; neutral shows as grey. */
export const URGENCY_FILLS = ['bg-zinc-300 dark:bg-zinc-600', 'bg-yellow-400', 'bg-orange-500', 'bg-red-500'] as const;

/** A strip coloured by the PR's Urgency, down the edge of a row. */
export function UrgencyBar({ pr }: { pr: Pick<TrackedPr, 'urgency'> }) {
  return <div aria-hidden className={cn('w-1 shrink-0', pr.urgency === null ? 'bg-transparent' : URGENCY_BARS[pr.urgency])} />;
}

/** The PR's Age in Working Days, coloured by its Urgency. Hovering shows the times behind it. */
export function AgeChip({ pr, now }: { pr: Pick<TrackedPr, 'age' | 'idleTime' | 'urgency'>; now: number }) {
  return (
    <span
      title={clockHover(pr, now)}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
        pr.urgency === null ? 'border border-dashed text-muted-foreground' : URGENCY_STYLES[pr.urgency]
      )}
    >
      <Clock className="size-3" />
      <span data-urgency={pr.urgency ?? 'none'}>{wholeWorkingDays(pr.age)}d</span>
    </span>
  );
}

/** "idle 3d", muted, once nobody has acted on the PR for a Working Day. */
export function IdleLine({ pr }: { pr: Pick<TrackedPr, 'idleTime'> }) {
  const days = wholeWorkingDays(pr.idleTime);
  if (days < 1) {
    return null;
  }
  return (
    <span title={idleHover(pr)} className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      idle {days}d
    </span>
  );
}
