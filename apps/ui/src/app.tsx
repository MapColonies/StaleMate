import { useMemo } from 'react';
import { activeFilterCount, applyFilters } from '@/filters/filter-model';
import { useFilters } from '@/filters/use-filters';
import { STORAGE_KEYS, useStoredString } from '@/lib/local-storage';
import { useNow } from '@/lib/use-now';
import { viewerOptions } from '@/snapshot/selectors';
import { isWarming, useSnapshot } from '@/snapshot/use-snapshot';
import { HeaderCounts } from '@/shell/header-counts';
import { OutOfDateBanner } from '@/shell/out-of-date-banner';
import { type ApiProblem, SyncStatus } from '@/shell/sync-status';
import { ThemeToggle } from '@/shell/theme-toggle';
import { useTheme } from '@/shell/use-theme';
import { ViewerPicker } from '@/shell/viewer-picker';
import { VIEW_NAMES, useLastView } from '@/shell/use-last-view';
import { ViewSwitcher } from '@/shell/view-switcher';
import { TableView } from '@/views/table/table-view';
import { ViewPlaceholder } from '@/views/view-placeholder';

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">♞</div>
      <h1 className="font-semibold tracking-tight">StaleMate</h1>
    </div>
  );
}

/** Why the last poll brought no Snapshot, while the last one it brought is still on show. */
function apiProblem(error: unknown, isError: boolean): ApiProblem | null {
  if (!isError) {
    return null;
  }
  return isWarming(error) ? 'restarted' : 'unreachable';
}

/** What shows before there is a Snapshot to show. */
function StartupState({ error }: { error: unknown }) {
  let message = 'Loading…';
  if (isWarming(error)) {
    message = error.sync.lastError
      ? `Waiting for the first sync — it is failing: ${error.sync.lastError}`
      : 'Waiting for the first sync with GitHub…';
  } else if (error) {
    message = 'Can’t reach the StaleMate API. Retrying…';
  }
  return <p className="p-10 text-center text-muted-foreground">{message}</p>;
}

export default function App() {
  const { data: snapshot, error, isError } = useSnapshot();
  const { filters, resetFilters } = useFilters();
  const [storedViewer, setViewer] = useStoredString(STORAGE_KEYS.viewer);
  const [view, setView] = useLastView();
  const theme = useTheme();
  const now = useNow();

  const options = useMemo(() => (snapshot ? viewerOptions(snapshot.team) : []), [snapshot]);
  // A stored Viewer who has left the Team is no Viewer.
  const viewer = storedViewer !== null && options.includes(storedViewer) ? storedViewer : null;
  const prs = useMemo(() => (snapshot ? applyFilters(snapshot.prs, filters) : []), [snapshot, filters]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-5 border-b bg-background px-5">
        <Logo />
        <ViewSwitcher view={view} onChange={setView} />
        {snapshot && <HeaderCounts prs={snapshot.prs} viewer={viewer} />}
        <div className="ml-auto flex items-center gap-4">
          {snapshot && <SyncStatus snapshot={snapshot} now={now} apiProblem={apiProblem(error, isError)} />}
          <ThemeToggle preference={theme.preference} onCycle={theme.cycle} />
          {snapshot && <ViewerPicker options={options} viewer={viewer} onChange={setViewer} />}
        </div>
      </header>
      {snapshot && <OutOfDateBanner snapshot={snapshot} now={now} />}
      <main className="flex-1 bg-muted/40">
        {snapshot && view === 'table' && <TableView snapshot={snapshot} viewer={viewer} now={now} />}
        {snapshot && view !== 'table' && (
          <ViewPlaceholder
            name={VIEW_NAMES[view]}
            prs={prs}
            total={snapshot.prs.length}
            activeFilters={activeFilterCount(filters)}
            viewer={viewer}
            onResetFilters={resetFilters}
          />
        )}
        {!snapshot && <StartupState error={error} />}
      </main>
    </div>
  );
}
