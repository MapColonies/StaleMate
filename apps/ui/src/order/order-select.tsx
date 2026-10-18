import { PR_ORDERS, type PrOrder } from './pr-order';

/** Picks the order of the PRs within each bucket or column. */
export function OrderSelect({ order, onChange }: { order: PrOrder; onChange: (order: PrOrder) => void }) {
  return (
    <select
      aria-label="Order"
      value={order}
      onChange={(event) => onChange(event.target.value as PrOrder)}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
    >
      {Object.entries(PR_ORDERS).map(([value, { label }]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
