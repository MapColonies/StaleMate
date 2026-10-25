import { ListFilter, X } from 'lucide-react';
import { HIGHLIGHTED_CLASS, HIGHLIGHTED_COUNT_CLASS } from '@/components/highlight-classes';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { activeFilterCount, clearedBesidesSearch } from '@/filters/filter-model';
import { cn } from '@/lib/utils';
import { FacetFilters, type FacetFiltersProps } from './facet-filters';

/** The Filters button, with how many of its filters are active, and the side panel it opens them in. */
export function FiltersPanel(props: FacetFiltersProps) {
  const { filters, onChange } = props;
  // The search sits beside the button, not in the panel, so the panel neither counts it nor resets it.
  const active = activeFilterCount(filters, { besidesSearch: true });
  const label = active > 0 ? `Filters: ${active} active` : 'Filters';

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" aria-label={label} className={cn(active > 0 && HIGHLIGHTED_CLASS)}>
          <ListFilter />
          Filters
          {active > 0 && <span className={HIGHLIGHTED_COUNT_CLASS}>{active}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined} className="gap-0">
        <SheetHeader className="flex-row items-center gap-2 border-b">
          <SheetTitle className="flex-1">Filters</SheetTitle>
          <Button variant="ghost" size="sm" disabled={active === 0} onClick={() => onChange(clearedBesidesSearch(filters))}>
            Reset filters
          </Button>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
          <FacetFilters {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
