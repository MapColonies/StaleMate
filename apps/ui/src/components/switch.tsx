import { cn } from '@/lib/utils';

/** An on/off toggle with its label. */
export function Switch({
  label,
  title,
  checked,
  onChange,
}: {
  label: string;
  title?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm whitespace-nowrap"
    >
      <span className={cn('relative h-[18px] w-8 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-input')}>
        <span className={cn('absolute top-0.5 size-3.5 rounded-full bg-background shadow transition-all', checked ? 'left-4' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}
