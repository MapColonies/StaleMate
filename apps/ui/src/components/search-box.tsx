import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The free-text search over the title, repo, #number and author, with a button to clear it. */
export function SearchBox({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search title, repo, #number, author…"
        aria-label="Search"
        className="h-8 w-full rounded-md border border-input bg-background pr-7 pl-7 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Clear the search"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
