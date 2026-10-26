import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrackedPr } from '@/snapshot/types';

type Stack = NonNullable<TrackedPr['stack']>;

const STATE_LABELS: Record<Stack['siblings'][number]['state'], string> = { open: 'Open', merged: 'Merged', closed: 'Closed' };

const POPOVER_WIDTH = 320;
const GAP = 4;

/** Where the list sits: under the chip, kept inside the window. It is fixed, so no scrolling column or table clips it. */
function popoverPlace(chip: DOMRect): { top: number; left: number } {
  return { top: chip.bottom + GAP, left: Math.max(GAP, Math.min(chip.left, window.innerWidth - POPOVER_WIDTH - GAP)) };
}

function SiblingList({ pr, stack }: { pr: Pick<TrackedPr, 'repo' | 'number'>; stack: Stack }) {
  return (
    <>
      <ol className="space-y-0.5">
        {stack.siblings.map((sibling) => {
          const current = sibling.repo === pr.repo && sibling.number === pr.number;
          return (
            <li
              key={`${sibling.repo}#${sibling.number}`}
              aria-current={current ? 'true' : undefined}
              className={cn('flex items-baseline gap-2 rounded px-1.5 py-1', current && 'bg-accent font-medium')}
            >
              <span className="min-w-0 flex-1">
                <a href={sibling.url} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-1 hover:underline">
                  <span className="wrap-anywhere">{sibling.title}</span>
                  <ExternalLink aria-hidden className="size-3 shrink-0 self-center" />
                </a>
                <span className="ml-1.5 font-mono text-xs text-muted-foreground">#{sibling.number}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                {current && <span className="font-medium text-foreground">This PR</span>}
                {sibling.draft && <span>Draft</span>}
                <span>{STATE_LABELS[sibling.state]}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {stack.truncated && (
        <p className="mt-1 px-1.5 text-xs text-muted-foreground">
          Showing the first {stack.siblings.length} of {stack.size} PRs.
          {!stack.siblings.some((sibling) => sibling.repo === pr.repo && sibling.number === pr.number) && ` This PR is number ${stack.position}.`}
        </p>
      )}
    </>
  );
}

/** A PR's Stack Position as "2/4". Opening it lists the PRs in the Stack, in order, with links. A PR with no Stack shows nothing. */
export function StackPositionChip({ pr }: { pr: Pick<TrackedPr, 'repo' | 'number' | 'stack'> }) {
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const popoverId = useId();
  const open = place !== null;

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = () => setPlace(null);
    const closeOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        close();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    // A fixed list would drift from its chip as the page scrolls.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const { stack } = pr;
  if (stack === undefined) {
    return null;
  }
  return (
    <span ref={ref} className="inline-flex">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`Stack position ${stack.position} of ${stack.size}`}
        title={`Stack position ${stack.position} of ${stack.size}`}
        onClick={(event) => setPlace(open ? null : popoverPlace(event.currentTarget.getBoundingClientRect()))}
        className="inline-flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-violet-800 tabular-nums hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300 dark:hover:bg-violet-900"
      >
        <Layers aria-hidden className="size-3" />
        {stack.position}/{stack.size}
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Stack"
          style={{ top: place.top, left: place.left, width: POPOVER_WIDTH }}
          className="fixed z-30 rounded-lg border bg-popover p-1.5 text-sm text-popover-foreground shadow-lg"
        >
          <SiblingList pr={pr} stack={stack} />
        </div>
      )}
    </span>
  );
}
