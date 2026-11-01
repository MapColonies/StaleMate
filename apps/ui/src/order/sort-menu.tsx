import { ArrowUpDown, ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/checkbox';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OrderSelect } from './order-select';
import { PR_ORDERS, type PrOrder } from './pr-order';

/** Below 768px: the order and the Stack grouping behind one Sort button, which names the order, and the grouping when it is off. */
export function SortMenu({
  order,
  onOrderChange,
  grouped,
  onGroupedChange,
}: {
  order: PrOrder;
  onOrderChange: (order: PrOrder) => void;
  grouped: boolean;
  onGroupedChange: (grouped: boolean) => void;
}) {
  const label = `Sort: ${PR_ORDERS[order].label}${grouped ? '' : ', Stacks not grouped'}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={label} title={label}>
          <ArrowUpDown />
          Sort
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-60 flex-col gap-3">
        <OrderSelect order={order} onChange={onOrderChange} />
        <Checkbox label="Group Stacks" title="Show a Stack's PRs together, bottom first" checked={grouped} onChange={onGroupedChange} />
      </PopoverContent>
    </Popover>
  );
}
