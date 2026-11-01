import { Columns3, Inbox, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InboxCount } from './inbox-count';
import { VIEW_NAMES, VIEWS, type View } from './use-last-view';

const ICONS: Record<View, typeof Table2> = { table: Table2, inbox: Inbox, board: Columns3 };

/** The views, by name; below 576px by icon, the name left to screen readers and the tooltip. */
export function ViewSwitcher({ view, onChange, inboxCount }: { view: View; onChange: (view: View) => void; inboxCount?: InboxCount }) {
  return (
    <div role="group" aria-label="View" className="inline-flex shrink-0 rounded-md bg-muted p-0.5">
      {VIEWS.map((value) => {
        const Icon = ICONS[value];
        const count = value === 'inbox' ? inboxCount : undefined;
        const label = count ? `${VIEW_NAMES[value]} — ${count.label}` : VIEW_NAMES[value];
        return (
          <button
            key={value}
            type="button"
            aria-pressed={value === view}
            aria-label={label}
            title={label}
            onClick={() => onChange(value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm whitespace-nowrap max-[30rem]:px-2',
              value === view ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-3.5" />
            <span className="max-[36rem]:sr-only">{VIEW_NAMES[value]}</span>
            {count !== undefined && count.count > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 text-xs font-medium text-white tabular-nums">{count.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
