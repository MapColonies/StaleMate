import { Columns3, Inbox, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VIEW_NAMES, VIEWS, type View } from './use-last-view';

const ICONS: Record<View, typeof Table2> = { table: Table2, inbox: Inbox, board: Columns3 };

export function ViewSwitcher({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <div role="group" aria-label="View" className="inline-flex shrink-0 rounded-md bg-muted p-0.5">
      {VIEWS.map((value) => {
        const Icon = ICONS[value];
        return (
          <button
            key={value}
            type="button"
            aria-pressed={value === view}
            onClick={() => onChange(value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm whitespace-nowrap',
              value === view ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-3.5" />
            {VIEW_NAMES[value]}
          </button>
        );
      })}
    </div>
  );
}
