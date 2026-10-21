import { useMemo, useState } from 'react';
import { useFilters } from '@/filters/use-filters';
import { STORAGE_KEYS, useStoredString } from '@/lib/local-storage';
import { useNow } from '@/lib/use-now';
import { popUp } from '@/notifications/pop-up';
import { useNotifications } from '@/notifications/use-notifications';
import { useOsNotifications } from '@/notifications/use-os-notifications';
import { viewerOptions } from '@/snapshot/selectors';
import { isWarming, useSnapshot } from '@/snapshot/use-snapshot';
import { HeaderCounts } from '@/shell/header-counts';
import { NewVersionBanner } from '@/shell/new-version-banner';
import { NotificationsDrawer } from '@/shell/notifications-drawer';
import { OutOfDateBanner } from '@/shell/out-of-date-banner';
import { type ApiProblem, SyncStatus } from '@/shell/sync-status';
import { ThemeToggle } from '@/shell/theme-toggle';
import { useTheme } from '@/shell/use-theme';
import { ViewerPicker } from '@/shell/viewer-picker';
import { useLastView } from '@/shell/use-last-view';
import { ViewSwitcher } from '@/shell/view-switcher';
import { BoardView } from '@/views/board/board-view';
import { InboxView } from '@/views/inbox/inbox-view';
import { TableView } from '@/views/table/table-view';

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
      ? `Waiting for the first sync with GitHub — the last attempt failed: ${error.sync.lastError}`
      : 'Waiting for the first sync with GitHub…';
  } else if (error) {
    message = 'Can’t reach the StaleMate API. Retrying…';
  }
  return <p className="p-10 text-center text-muted-foreground">{message}</p>;
}

export default function App() {
  const { data: snapshot, error, isError } = useSnapshot();
  const [storedViewer, setViewer] = useStoredString(STORAGE_KEYS.viewer);
  const [view, setView] = useLastView();
  const theme = useTheme();
  const now = useNow();

  const options = useMemo(() => (snapshot ? viewerOptions(snapshot.team) : []), [snapshot]);
  // A stored Viewer who has left the Team is no Viewer.
  const viewer = storedViewer !== null && options.includes(storedViewer) ? storedViewer : null;
  const { filters } = useFilters();
  const os = useOsNotifications();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { notifications, dismiss } = useNotifications(snapshot, viewer, filters.hideViaTeam, (due, observed) => {
    if (os.enabled) {
      popUp(due, observed.prs, () => setDrawerOpen(true));
    }
  });

  return (
    // The header stays put; the views scroll below it, and the Board scrolls inside itself.
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-5 border-b bg-background px-5">
        <Logo />
        <ViewSwitcher view={view} onChange={setView} />
        {snapshot && <HeaderCounts prs={snapshot.prs} viewer={viewer} />}
        <div className="ml-auto flex items-center gap-4">
          {snapshot && <SyncStatus snapshot={snapshot} now={now} apiProblem={apiProblem(error, isError)} />}
          <ThemeToggle preference={theme.preference} onCycle={theme.cycle} />
          {snapshot && <ViewerPicker options={options} viewer={viewer} onChange={setViewer} />}
          <NotificationsDrawer
            notifications={notifications}
            prs={snapshot?.prs ?? []}
            hasViewer={viewer !== null}
            now={now}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            os={os}
            onDismiss={dismiss}
            onOpenInbox={() => setView('inbox')}
          />
        </div>
      </header>
      <NewVersionBanner />
      {snapshot && <OutOfDateBanner snapshot={snapshot} now={now} />}
      <main className="min-h-0 flex-1 overflow-auto bg-muted/40">
        {snapshot && view === 'table' && <TableView snapshot={snapshot} viewer={viewer} now={now} />}
        {snapshot && view === 'inbox' && <InboxView snapshot={snapshot} viewer={viewer} now={now} />}
        {snapshot && view === 'board' && <BoardView snapshot={snapshot} viewer={viewer} now={now} />}
        {!snapshot && <StartupState error={error} />}
      </main>
    </div>
  );
}
