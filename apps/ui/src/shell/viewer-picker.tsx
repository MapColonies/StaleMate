import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "I am…": the Viewer picks which Team Member they are. */
export function ViewerPicker({ options, viewer, onChange }: { options: string[]; viewer: string | null; onChange: (login: string | null) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
      <span className="text-muted-foreground">I am</span>
      <span className="relative">
        <select
          value={viewer ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          className={cn(
            'h-8 appearance-none rounded-md border border-input bg-background pr-7 pl-2.5 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
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
