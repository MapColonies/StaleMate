import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '@/app';
import { aPr, aSnapshot, aTeam } from './fixtures/snapshot';
import { onRequest } from './http-stub';

// How many times each view is rendered by what is above it: the app, which is what a ticking clock there would re-render.
const renders = vi.hoisted(() => ({ table: 0, inbox: 0, board: 0 }));

vi.mock('@/views/table/table-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/views/table/table-view')>();
  return {
    ...actual,
    TableView: (props: Parameters<typeof actual.TableView>[0]) => {
      renders.table += 1;
      return <actual.TableView {...props} />;
    },
  };
});
vi.mock('@/views/inbox/inbox-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/views/inbox/inbox-view')>();
  return {
    ...actual,
    InboxView: (props: Parameters<typeof actual.InboxView>[0]) => {
      renders.inbox += 1;
      return <actual.InboxView {...props} />;
    },
  };
});
vi.mock('@/views/board/board-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/views/board/board-view')>();
  return {
    ...actual,
    BoardView: (props: Parameters<typeof actual.BoardView>[0]) => {
      renders.board += 1;
      return <actual.BoardView {...props} />;
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * A dashboard left open all day must cost nothing while nothing changes. Time passing is not a change: only a new Snapshot or
 * the Viewer's own choices redraw a view, and only the small pieces that show elapsed time tick, each by itself.
 */
describe('an idle dashboard', () => {
  it.each(['table', 'inbox', 'board'] as const)('does not redraw the %s view as time passes', async (view) => {
    window.localStorage.setItem('stalemate.team', 'infra');
    window.localStorage.setItem('stalemate.view', view);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const readAt = new Date(Date.now() - 40_000).toISOString();
    const snapshot = aSnapshot({ readAt, sync: { state: 'idle', lastAttemptAt: readAt }, prs: [aPr({ title: 'Idle PR' })] });
    onRequest('GET', '/api/snapshot', { status: 200, body: snapshot });
    onRequest('GET', '/api/teams', { status: 200, body: [aTeam(snapshot.teamInfo.slug, snapshot.teamInfo.name, snapshot.team)] });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>
    );
    await screen.findByText('Idle PR');
    const before = { ...renders };

    // Long enough for the sync status to tick sixty times and the Snapshot to be polled again, unchanged.
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(renders).toEqual(before);
    // The sync status is one of the pieces that does tick.
    expect(screen.getByText(/Updated 1 min ago/)).toBeInTheDocument();
  });
});
