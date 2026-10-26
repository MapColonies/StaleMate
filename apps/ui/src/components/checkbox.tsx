/** A labelled checkbox. */
export function Checkbox({
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
    <label title={title} className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-primary" />
      {label}
    </label>
  );
}
