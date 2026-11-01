import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "I am…": the Viewer picks which Team Member they are. Below 1280px it waits behind the Team and Viewer button, stacked. */
export function ViewerPicker({
  options,
  viewer,
  onChange,
  stacked = false,
}: {
  options: string[];
  viewer: string | null;
  onChange: (login: string | null) => void;
  /** The label above the dropdown, which then fills the width. */
  stacked?: boolean;
}) {
  return (
    <label className={cn('flex text-sm whitespace-nowrap', stacked ? 'flex-col gap-1' : 'items-center gap-2')}>
      <span className="text-muted-foreground">I am</span>
      <span className={cn('relative', stacked && 'w-full')}>
        <select
          value={viewer ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          className={cn(
            'h-8 w-full appearance-none truncate rounded-md border border-input bg-background pr-7 pl-2.5 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            viewer === null && 'text-muted-foreground'
          )}
        >
          <option value="">Pick yourself…</option>
          {options.map((login) => (
            <option key={login} value={login}>
              {login}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  );
}
