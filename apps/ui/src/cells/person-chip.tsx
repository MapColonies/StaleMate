import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Person } from '@/snapshot/types';

const HUES = [210, 340, 160, 30, 270, 190, 0, 100, 240, 50];

function hue(login: string): number {
  let hash = 0;
  for (const char of login) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return HUES[hash % HUES.length] ?? 0;
}

function Avatar({ person, isViewer }: { person: Person; isViewer: boolean }) {
  if (person.kind === 'bot') {
    return (
      <span aria-hidden className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot className="size-3" />
      </span>
    );
  }
  const h = hue(person.login);
  return (
    <span
      aria-hidden
      // The initials are drawn by CSS, so they stay out of the chip's text.
      data-initials={person.login.replace(/[^a-z0-9]/gi, '').slice(0, 2)}
      style={{ background: `hsl(${h} 70% 92%)`, color: `hsl(${h} 50% 32%)` }}
      className={cn(
        'inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[8px] font-semibold uppercase before:content-[attr(data-initials)]',
        person.kind === 'outsider' && 'border border-dashed border-zinc-400',
        isViewer && 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-background'
      )}
    />
  );
}

/** A person, shown as "You" when they are the Viewer and marked ext when they are outside the Team. */
export function PersonChip({ person, viewer }: { person: Person; viewer: string | null }) {
  const isViewer = person.login === viewer;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={person.login}>
      <Avatar person={person} isViewer={isViewer} />
      <span className={cn('text-[13px]', isViewer && 'font-semibold text-indigo-700 dark:text-indigo-300')}>{isViewer ? 'You' : person.login}</span>
      {person.kind === 'outsider' && ' '}
      {person.kind === 'outsider' && (
        <span className="text-[10px] tracking-wide text-muted-foreground uppercase" title="Not a Team Member">
          ext
        </span>
      )}
    </span>
  );
}
