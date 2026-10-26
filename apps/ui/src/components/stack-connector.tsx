import { cn } from '@/lib/utils';

/** The line joining a Stack's adjacent rows: it runs up to the row above and down to the row below. Its row must be positioned. */
export function StackConnector({ above, below }: { above: boolean; below: boolean }) {
  return (
    <span
      aria-hidden
      data-testid="stack-connector"
      className={cn('absolute left-1.5 w-0.5 bg-violet-300 dark:bg-violet-700', above ? 'top-0' : 'top-1/2', below ? 'bottom-0' : 'bottom-1/2')}
    />
  );
}
