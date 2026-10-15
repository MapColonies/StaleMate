import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxMenuOption {
  value: string;
  label: ReactNode;
  /** What the search box matches; the value when absent. */
  text?: string;
  checked: boolean;
}

// Longer menus get a search box.
const SEARCH_FROM = 9;

/** A button that opens a menu of checkboxes: the filter bar's multi-selects and the Table's column picker. */
export function CheckboxMenu({
  label,
  options,
  onToggle,
  onClear,
  highlighted = false,
  align = 'left',
}: {
  label: ReactNode;
  options: readonly CheckboxMenuOption[];
  onToggle: (value: string) => void;
  /** Offers a Clear button while anything is checked. */
  onClear?: () => void;
  highlighted?: boolean;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = q === '' ? options : options.filter((option) => (option.text ?? option.value).toLowerCase().includes(q));
  const checkedCount = options.filter((option) => option.checked).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm whitespace-nowrap shadow-xs',
          highlighted
            ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200'
            : 'border-dashed border-input bg-background hover:bg-accent'
        )}
      >
        {label}
        <ChevronDown className="size-3.5 opacity-60" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={cn(
            'absolute top-9 z-30 w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {options.length >= SEARCH_FROM && (
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              aria-label="Search the options"
              className="mb-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none"
            />
          )}
          <div className="max-h-72 overflow-auto">
            {shown.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={option.checked}
                onClick={() => onToggle(option.value)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border',
                    option.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                  )}
                >
                  {option.checked && <Check className="size-3" />}
                </span>
                <span className="flex-1 truncate">{option.label}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">Nothing matches.</p>}
          </div>
          {onClear && checkedCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mt-1 w-full rounded border-t px-2 py-1.5 text-center text-xs text-muted-foreground hover:bg-accent"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
