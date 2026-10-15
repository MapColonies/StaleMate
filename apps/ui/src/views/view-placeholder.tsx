import { FilterX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TrackedPr } from '@/snapshot/types';

/** Stands in for a view until its ticket lands: the filtered PRs as a plain list. */
export function ViewPlaceholder({
  name,
  prs,
  total,
  activeFilters,
  viewer,
  onResetFilters,
}: {
  name: string;
  prs: readonly TrackedPr[];
  total: number;
  activeFilters: number;
  viewer: string | null;
  onResetFilters: () => void;
}) {
  return (
    <section className="mx-auto max-w-5xl space-y-3 p-5">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          The {name} view is on its way. <b className="text-foreground tabular-nums">{prs.length}</b> of {total} Tracked PRs match the filters.
        </span>
        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={onResetFilters}>
            <FilterX className="size-3.5" /> Reset filters ({activeFilters})
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border rounded-lg border bg-card text-sm">
        {prs.map((pr) => (
          <li key={pr.id} className="flex items-baseline gap-2 px-4 py-2">
            <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
              {pr.repo}#{pr.number}
            </span>
            <a href={pr.url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
              {pr.title}
            </a>
            <span className="ml-auto whitespace-nowrap text-muted-foreground">{pr.author.login === viewer ? 'You' : pr.author.login}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
