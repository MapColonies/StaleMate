import { useEffect, useMemo, useState } from 'react';
import { useFilters } from '@/filters/use-filters';
import { STORAGE_KEYS, migrateNotificationKeys, migrateRememberedTeam, useStoredString } from '@/lib/local-storage';
import { useNow } from '@/lib/use-now';
import { popUp } from '@/notifications/pop-up';
import { useNotifications } from '@/notifications/use-notifications';
import { useOsNotifications } from '@/notifications/use-os-notifications';
import { viewerOptions } from '@/snapshot/selectors';
import { UnknownTeamError, isWarming, useSnapshot, useTeams } from '@/snapshot/use-snapshot';
import { FirstVisitModal } from '@/shell/first-visit-modal';
import { HeaderCounts } from '@/shell/header-counts';
import { NewVersionBanner } from '@/shell/new-version-banner';
import { NotificationsDrawer } from '@/shell/notifications-drawer';
import { OutOfDateBanner } from '@/shell/out-of-date-banner';
import { type ApiProblem, SyncStatus } from '@/shell/sync-status';
import { ThemeToggle } from '@/shell/theme-toggle';
import { useTheme } from '@/shell/use-theme';
import { TeamPicker } from '@/shell/team-picker';
import { useTeam } from '@/shell/use-team';
import { ViewerPicker } from '@/shell/viewer-picker';
import { useLastView } from '@/shell/use-last-view';
import { ViewSwitcher } from '@/shell/view-switcher';
import { BoardView } from '@/views/board/board-view';
import { InboxView } from '@/views/inbox/inbox-view';
import { TableView } from '@/views/table/table-view';

function Logo() {
  return (
    <div className="flex shrink-0 items-center gap-2">
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

/** What shows before there is something to show: why not yet. */
function startupMessage(error: unknown): string {
  if (isWarming(error)) {
    return error.sync.lastError
      ? `Waiting for the first sync with GitHub — the last attempt failed: ${error.sync.lastError}`
      : 'Waiting for the first sync with GitHub…';
  }
  return error ? 'Can’t reach the StaleMate API. Retrying…' : 'Loading…';
}

export default function App() {
  // Before anything reads them: each Viewer's Notifications from before they were kept per Team move to infra's, and a
  // browser that has used StaleMate before remembers infra, so only a new one is asked which Team.
  useState(() => {
    migrateNotificationKeys();
    migrateRememberedTeam();
  });
  const os = useOsNotifications();
  const { data: teams, error: teamsError } = useTeams();
  const knownTeams = useMemo(() => teams?.map((team) => team.slug), [teams]);
  const { team, selectTeam, dropTeam } = useTeam(knownTeams);
  const { data: snapshot, error, isError } = useSnapshot({ team, inBackground: os.enabled });
  // A Team the API turned away is dropped, and the Snapshot is asked for again without it.
  useEffect(() => {
    if (team !== null && error instanceof UnknownTeamError) {
      dropTeam(team);
    }
  }, [team, error, dropTeam]);
  const [storedViewer, setViewer] = useStoredString(STORAGE_KEYS.viewer);
  const [view, setView] = useLastView();
  const theme = useTheme();
  const now = useNow();

  const options = useMemo(() => (teams ? viewerOptions(teams) : []), [teams]);
  // A stored Viewer who is in no Team is no Viewer.
  const viewer = storedViewer !== null && options.includes(storedViewer) ? storedViewer : null;
  const { filters } = useFilters();
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
        {/* When the bar runs short, the counts give way first; the controls on the right never do. */}
        {snapshot && <HeaderCounts prs={snapshot.prs} teamSlug={snapshot.teamInfo.slug} viewer={viewer} />}
        <div className="ml-auto flex shrink-0 items-center gap-4">
          {snapshot && team !== null && <SyncStatus snapshot={snapshot} team={team} now={now} apiProblem={apiProblem(error, isError)} />}
          <ThemeToggle preference={theme.preference} onCycle={theme.cycle} />
          {teams && team !== null && <TeamPicker teams={teams} team={team} onChange={selectTeam} />}
          {teams && team !== null && <ViewerPicker options={options} viewer={viewer} onChange={setViewer} />}
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
        {team !== null && !snapshot && <p className="p-10 text-center text-muted-foreground">{startupMessage(error)}</p>}
      </main>
      {team === null && (
        <FirstVisitModal
          teams={teams}
          viewers={options}
          status={startupMessage(teamsError)}
          onChoose={(slug, login) => {
            selectTeam(slug);
            if (login !== null) {
              setViewer(login);
            }
          }}
        />
      )}
    </div>
  );
}
