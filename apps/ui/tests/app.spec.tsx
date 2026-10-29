import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/app';
import type { Snapshot, SyncState, WatchedTeam } from '@/snapshot/types';
import { onRequest, requests, requestsWithQuery } from './http-stub';
import { aPr, aSnapshot, aTeam, bot, member, waitingOnAuthor, waitingOnReviewer, waitingOnTheTeam } from './fixtures/snapshot';
import { stubCompactWindow } from './window-width';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

function renderApp() {
  // No retries: a stubbed failure should surface on the first pass.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
  return { ...rendered, queryClient };
}

/** Serves the Snapshot, and /teams listing its Team with the Snapshot's members unless `teams` says otherwise. */
function serve(snapshot: Snapshot, teams: WatchedTeam[] = [aTeam(snapshot.teamInfo.slug, snapshot.teamInfo.name, snapshot.team)]): void {
  onRequest('GET', '/api/snapshot', { status: 200, body: snapshot });
  onRequest('GET', '/api/teams', { status: 200, body: teams });
}

/** A Snapshot read 40 s ago, whose sweep's refresh cooldown has passed. */
function aFreshSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return aSnapshot({ readAt: ago(40 * SECOND), sync: { state: 'idle', lastAttemptAt: ago(40 * SECOND) }, ...overrides });
}

// Most tests are about a browser that has been here before, and remembers infra; the first visit has its own.
beforeEach(() => {
  window.localStorage.setItem('stalemate.team', 'infra');
});

const alice = member('alice');
const bob = member('bob');

describe('before the first sync', () => {
  it('asks the API for the Snapshot under /api', async () => {
    onRequest('GET', '/api/snapshot', { status: 503, body: { status: 'warming', sync: { state: 'syncing' } } });

    renderApp();

    await screen.findByText(/waiting for the first sync/i);
    expect(
      requests()
        .filter((request) => request !== 'GET /version.json')
        .sort()
    ).toEqual(['GET /api/snapshot', 'GET /api/teams']);
  });

  it('says why the first sync is failing', async () => {
    onRequest('GET', '/api/snapshot', {
      status: 503,
      body: { status: 'warming', sync: { state: 'idle', lastAttemptAt: ago(MINUTE), lastError: 'GitHub App authentication failed' } },
    });

    renderApp();

    expect(await screen.findByText(/first sync with GitHub — the last attempt failed: GitHub App authentication failed/)).toBeInTheDocument();
  });

  it('says when the API cannot be reached', async () => {
    onRequest('GET', '/api/snapshot', 'unreachable');

    renderApp();

    expect(await screen.findByText(/can’t reach the StaleMate API/i)).toBeInTheDocument();
  });
});

describe('"I am…"', () => {
  it('offers the Team Members, without Bots', async () => {
    serve(aFreshSnapshot({ team: [bob, alice, bot('mapcolonies-devops')] }));

    renderApp();

    const picker = await screen.findByLabelText(/I am/);
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Pick yourself…', 'alice', 'bob']);
  });

  it('remembers the Viewer in this browser', async () => {
    serve(aFreshSnapshot());
    const first = renderApp();

    await userEvent.selectOptions(await screen.findByLabelText(/I am/), 'carol');
    first.unmount();
    renderApp();

    expect(await screen.findByLabelText(/I am/)).toHaveValue('carol');
    expect(window.localStorage.getItem('stalemate.viewer')).toBe('carol');
  });

  it('forgets a Viewer who is no longer a Team Member', async () => {
    window.localStorage.setItem('stalemate.viewer', 'mallory');
    serve(aFreshSnapshot());

    renderApp();

    expect(await screen.findByLabelText(/I am/)).toHaveValue('');
  });
});

const raster = aTeam('raster', 'Raster Team', [member('dave'), bob]);
const infra = aTeam('infra', 'Infra', [alice, bob, bot('mapcolonies-devops')]);

/** Serves the Teams, and each one's slice on `?team=`; without it, infra's. */
function serveTeams(slices: Record<string, Snapshot>): void {
  const teams = Object.values(slices).map((slice) => aTeam(slice.teamInfo.slug, slice.teamInfo.name, slice.team));
  onRequest('GET', '/api/teams', { status: 200, body: teams });
  onRequest('GET', '/api/snapshot', (url) => {
    const slice = slices[url.searchParams.get('team') ?? 'infra'];
    return slice ? { status: 200, body: slice } : { status: 404, body: { message: 'unknown team' } };
  });
}

const raster_slice = (overrides: Partial<Snapshot> = {}) =>
  aFreshSnapshot({ teamInfo: { slug: 'raster', name: 'Raster Team' }, team: raster.members, ...overrides });

describe('the Team dropdown', () => {
  const rasterPr = aPr({ title: 'Raster only', author: member('dave'), waitingOn: [{ type: 'team', slug: 'raster', viaTeam: true }] });
  const infraPr = aPr({ title: 'Infra only' });

  function serveBoth(): void {
    serveTeams({ infra: aFreshSnapshot({ prs: [infraPr] }), raster: raster_slice({ prs: [rasterPr] }) });
  }

  it('lists the Teams by display name, with the slug as the value', async () => {
    serveBoth();

    renderApp();

    const picker = await screen.findByLabelText('Team');
    const options = within(picker).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Infra', 'Raster Team']);
    expect(options.map((option) => option.getAttribute('value'))).toEqual(['infra', 'raster']);
  });

  it('shows the Team picked, asking for its Snapshot and writing ?team= and the remembered Team', async () => {
    serveBoth();
    renderApp();
    await screen.findByText('Infra only');

    await userEvent.selectOptions(screen.getByLabelText('Team'), 'raster');

    expect(await screen.findByText('Raster only')).toBeInTheDocument();
    expect(screen.queryByText('Infra only')).not.toBeInTheDocument();
    expect(requestsWithQuery()).toContain('GET /api/snapshot?team=raster');
    expect(window.location.search).toBe('?team=raster');
    expect(window.localStorage.getItem('stalemate.team')).toBe('raster');
    expect(screen.getByLabelText('Team')).toHaveValue('raster');
  });

  it('opens the Team in the URL', async () => {
    window.history.replaceState(null, '', '/?team=raster');
    window.localStorage.setItem('stalemate.team', 'infra');
    serveBoth();

    renderApp();

    expect(await screen.findByText('Raster only')).toBeInTheDocument();
    // Opening a link leaves the remembered Team alone.
    expect(window.localStorage.getItem('stalemate.team')).toBe('infra');
  });

  it('opens the remembered Team when the URL names none', async () => {
    window.localStorage.setItem('stalemate.team', 'raster');
    serveBoth();

    renderApp();

    expect(await screen.findByText('Raster only')).toBeInTheDocument();
  });

  it('drops a Team that is not in /teams, from the URL and from storage', async () => {
    window.history.replaceState(null, '', '/?team=ghost');
    window.localStorage.setItem('stalemate.team', 'phantom');
    serveBoth();

    renderApp();

    // Neither is a Team, so the visitor is asked.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(window.localStorage.getItem('stalemate.team')).toBeNull();
  });

  it('falls back to the remembered Team when the URL names an unknown one', async () => {
    window.history.replaceState(null, '', '/?team=ghost');
    window.localStorage.setItem('stalemate.team', 'raster');
    serveBoth();

    renderApp();

    expect(await screen.findByText('Raster only')).toBeInTheDocument();
  });

  it('drops a Team the Snapshot is answered 404 for', async () => {
    window.history.replaceState(null, '', '/?team=gone');
    window.localStorage.setItem('stalemate.team', 'gone');
    onRequest('GET', '/api/teams', { status: 200, body: [infra, aTeam('gone', 'Gone', [])] });
    onRequest('GET', '/api/snapshot', (url) =>
      url.searchParams.get('team') === 'gone'
        ? { status: 404, body: { message: 'unknown team' } }
        : { status: 200, body: aFreshSnapshot({ prs: [infraPr] }) }
    );

    renderApp();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(window.localStorage.getItem('stalemate.team')).toBeNull();
  });

  it('asks again when the remembered Team no longer exists, rather than landing on another', async () => {
    window.localStorage.setItem('stalemate.team', 'phantom');
    serveBoth();

    renderApp();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem('stalemate.team')).toBeNull());
    expect(screen.queryByText('Infra only')).not.toBeInTheDocument();
  });

  it('names the Team of the Snapshot in the header counts, the switch and the Inbox', async () => {
    window.localStorage.setItem('stalemate.viewer', 'dave');
    window.localStorage.setItem('stalemate.view', 'inbox');
    window.history.replaceState(null, '', '/?team=raster');
    serveBoth();

    renderApp();

    expect(await screen.findByTestId('my-turn')).toHaveTextContent('via @raster');
    expect(screen.getByText('Ignore requests to @raster')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rest of Raster Team' })).toBeInTheDocument();
  });

  describe('"I am…"', () => {
    it('lists every Team’s members, and keeps the Viewer across Team switches', async () => {
      window.localStorage.setItem('stalemate.viewer', 'alice');
      serveBoth();
      renderApp();
      const picker = await screen.findByLabelText(/I am/);
      expect(
        within(picker)
          .getAllByRole('option')
          .map((option) => option.textContent)
      ).toEqual(['Pick yourself…', 'alice', 'bob', 'carol', 'dave']);

      await userEvent.selectOptions(screen.getByLabelText('Team'), 'raster');
      await screen.findByText('Raster only');

      expect(screen.getByLabelText(/I am/)).toHaveValue('alice');
    });

    it('never changes the Team when the Viewer picks themselves', async () => {
      window.history.replaceState(null, '', '/?team=raster');
      serveBoth();
      renderApp();
      await screen.findByText('Raster only');

      await userEvent.selectOptions(screen.getByLabelText(/I am/), 'alice');

      expect(screen.getByLabelText('Team')).toHaveValue('raster');
      expect(window.location.search).toBe('?team=raster');
    });
  });

  describe('switching Team', () => {
    it('clears the filters but keeps the view, tab, sort, order, hidden columns, theme and Viewer', async () => {
      window.localStorage.setItem('stalemate.viewer', 'alice');
      window.localStorage.setItem('stalemate.view', 'table');
      window.localStorage.setItem('stalemate.theme', 'dark');
      window.localStorage.setItem('stalemate.table.hiddenColumns', JSON.stringify(['repo']));
      window.history.replaceState(null, '', '/?team=infra&repo=MapColonies%2Fopa-la&q=thing&hideBots=0&tab=mine&sort=repo.asc&order=oldest');
      serveBoth();
      renderApp();
      await screen.findByLabelText('Team');

      await userEvent.selectOptions(screen.getByLabelText('Team'), 'raster');

      const params = new URLSearchParams(window.location.search);
      expect(Object.fromEntries(params)).toEqual({ team: 'raster', tab: 'mine', sort: 'repo.asc', order: 'oldest' });
      expect(window.localStorage.getItem('stalemate.view')).toBe('table');
      expect(window.localStorage.getItem('stalemate.theme')).toBe('dark');
      expect(window.localStorage.getItem('stalemate.table.hiddenColumns')).toBe(JSON.stringify(['repo']));
      expect(screen.getByLabelText(/I am/)).toHaveValue('alice');
    });
  });
});

describe('the header', () => {
  const prs = [
    aPr({ author: bob, waitingOn: [waitingOnReviewer(alice)] }),
    aPr({ author: alice, waitingOn: [waitingOnAuthor(alice)] }),
    aPr({ author: bob, waitingOn: [waitingOnTheTeam] }),
    aPr({ author: bob, waitingOn: [waitingOnAuthor(bob)], noReviewer: true }),
  ];

  it('counts the Viewer’s turn, with the Team’s requests on top, and the No Reviewer PRs', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    serve(aFreshSnapshot({ prs }));

    renderApp();

    expect(await screen.findByTestId('my-turn')).toHaveTextContent('Your turn 2 + 1 via @infra');
    expect(screen.getByTestId('no-reviewer')).toHaveTextContent('1 No Reviewer');
  });

  it('shows no turn count until the Viewer picks themselves', async () => {
    serve(aFreshSnapshot({ prs }));

    renderApp();

    await screen.findByTestId('no-reviewer');
    expect(screen.queryByTestId('my-turn')).not.toBeInTheDocument();
  });

  it('says how long ago the Snapshot was read', async () => {
    serve(aFreshSnapshot());

    renderApp();

    expect(await screen.findByText('Updated 40 s ago')).toBeInTheDocument();
  });

  it('keeps saying how old the Snapshot is while a sync runs', async () => {
    serve(aFreshSnapshot({ sync: { state: 'syncing', lastAttemptAt: ago(5 * SECOND) } }));

    renderApp();

    expect(await screen.findByText('Updated 40 s ago')).toBeInTheDocument();
    expect(screen.getByText(/syncing with github/i)).toBeInTheDocument();
  });
});

describe('when the API stops answering with a Snapshot', () => {
  it('keeps the Snapshot, and says the API restarted while its first sync runs', async () => {
    serve(aFreshSnapshot({ prs: [aPr({ title: 'Kept change' })] }));
    const { queryClient } = renderApp();
    await screen.findByText('Kept change');

    onRequest('GET', '/api/snapshot', { status: 503, body: { status: 'warming', sync: { state: 'syncing', lastAttemptAt: ago(SECOND) } } });
    await act(() => queryClient.refetchQueries());

    expect(await screen.findByText(/API restarted — first sync running/)).toBeInTheDocument();
    expect(screen.queryByText(/API unreachable/)).not.toBeInTheDocument();
    expect(screen.getByText('Kept change')).toBeInTheDocument();
  });

  it('keeps the Snapshot, and says the API is unreachable when it is', async () => {
    serve(aFreshSnapshot({ prs: [aPr({ title: 'Kept change' })] }));
    const { queryClient } = renderApp();
    await screen.findByText('Kept change');

    onRequest('GET', '/api/snapshot', 'unreachable');
    await act(() => queryClient.refetchQueries());

    expect(await screen.findByText(/API unreachable/)).toBeInTheDocument();
    expect(screen.getByText('Kept change')).toBeInTheDocument();
  });
});

describe('the Out-of-date Snapshot banner', () => {
  it('is hidden while syncs succeed', async () => {
    serve(aFreshSnapshot());

    renderApp();

    await screen.findByText(/Updated/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows how old the data is and why the sync fails', async () => {
    serve(aSnapshot({ readAt: ago(14 * MINUTE), sync: { state: 'idle', lastAttemptAt: ago(MINUTE), lastError: 'GitHub API unreachable' } }));

    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Showing the Snapshot from 14 min ago — the last sync with GitHub failed: GitHub API unreachable'
    );
  });
});

describe('the new version banner', () => {
  it('shows under the header once another version is deployed, even before the first sync', async () => {
    onRequest('GET', '/api/snapshot', { status: 503, body: { status: 'warming', sync: { state: 'syncing' } } });
    onRequest('GET', '/version.json', { status: 200, body: { version: '9.9.9' } });

    renderApp();

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('A new version of StaleMate is available — Reload');
    expect(banner.previousElementSibling?.tagName).toBe('HEADER');
  });
});

describe('"Refresh now"', () => {
  it('asks the API to sync, and shows the sync running', async () => {
    let sync: SyncState = { state: 'idle', lastAttemptAt: ago(MINUTE) };
    onRequest('GET', '/api/snapshot', () => ({ status: 200, body: aFreshSnapshot({ sync }) }));
    onRequest('POST', '/api/refresh', () => {
      sync = { state: 'syncing', lastAttemptAt: new Date().toISOString() };
      return { status: 202, body: sync };
    });

    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /refresh now/i }));

    expect(await screen.findByText(/syncing with github/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh now/i })).toBeDisabled();
    expect(requests()).toContain('POST /api/refresh');
  });

  it('counts down the cooldown since the last sync started', async () => {
    serve(
      aFreshSnapshot({
        sync: { state: 'idle', lastAttemptAt: ago(10 * SECOND) },
        config: { urgencyThresholds: [2, 4, 8], refreshCooldownMs: 30 * SECOND },
      })
    );

    renderApp();

    const button = await screen.findByRole('button', { name: /refresh in 20 s/i });
    expect(button).toBeDisabled();
  });

  it('reports a failed request inline', async () => {
    serve(aFreshSnapshot());
    onRequest('POST', '/api/refresh', 'unreachable');

    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /refresh now/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh failed: API unreachable');
  });

  it('reports an error answer inline, even one without a body', async () => {
    serve(aFreshSnapshot());
    onRequest('POST', '/api/refresh', { status: 502, body: undefined });

    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /refresh now/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh failed: HTTP 502');
    expect(screen.getByText('Updated 40 s ago')).toBeInTheDocument();
  });
});

describe('the top bar below 1280px', () => {
  beforeEach(() => {
    stubCompactWindow(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const syncDot = (name: string | RegExp) => screen.findByRole('button', { name });

  it('shows the sync status as a dot, whose tooltip says what the text would', async () => {
    serve(aFreshSnapshot());

    renderApp();

    const dot = await syncDot('Updated 40 s ago · Refresh now');
    expect(dot).toHaveAttribute('data-state', 'fresh');
    expect(dot.parentElement).toHaveAttribute('title', 'Updated 40 s ago · Refresh now');
    expect(screen.queryByText('Updated 40 s ago')).not.toBeInTheDocument();
  });

  it('refreshes from the dot, and shows the sync running', async () => {
    let sync: SyncState = { state: 'idle', lastAttemptAt: ago(MINUTE) };
    onRequest('GET', '/api/snapshot', () => ({ status: 200, body: aFreshSnapshot({ sync }) }));
    onRequest('POST', '/api/refresh', () => {
      sync = { state: 'syncing', lastAttemptAt: new Date().toISOString() };
      return { status: 202, body: sync };
    });

    renderApp();
    await userEvent.click(await syncDot(/refresh now/i));

    const dot = await syncDot(/syncing with GitHub…/);
    expect(dot).toBeDisabled();
    expect(dot).toHaveAttribute('data-state', 'syncing');
    expect(requests()).toContain('POST /api/refresh');
  });

  it('counts down the cooldown in its tooltip', async () => {
    serve(
      aFreshSnapshot({
        sync: { state: 'idle', lastAttemptAt: ago(10 * SECOND) },
        config: { urgencyThresholds: [2, 4, 8], refreshCooldownMs: 30 * SECOND },
      })
    );

    renderApp();

    expect(await syncDot('Updated 40 s ago · Refresh in 20 s')).toBeDisabled();
  });

  it('marks an Out-of-date Snapshot', async () => {
    serve(aSnapshot({ readAt: ago(14 * MINUTE), sync: { state: 'idle', lastAttemptAt: ago(MINUTE), lastError: 'GitHub API unreachable' } }));

    renderApp();

    const dot = await syncDot(/^Updated 14 min ago · the last sync with GitHub failed/);
    expect(dot).toHaveAttribute('data-state', 'out-of-date');
  });

  it.each([
    [
      'restarted',
      'restarted',
      { status: 503, body: { status: 'warming', sync: { state: 'syncing', lastAttemptAt: ago(SECOND) } } },
      /API restarted — first sync running…/,
    ],
    ['is unreachable', 'unreachable', 'unreachable' as const, /API unreachable/],
  ] as const)('marks an API that %s', async (_, problem, answer, text) => {
    serve(aFreshSnapshot({ prs: [aPr({ title: 'Kept change' })] }));
    const { queryClient } = renderApp();
    await screen.findByText('Kept change');

    onRequest('GET', '/api/snapshot', answer);
    await act(() => queryClient.refetchQueries());

    expect(await syncDot(text)).toHaveAttribute('data-api-problem', problem);
  });

  it('marks an Out-of-date Snapshot and an unreachable API at once', async () => {
    serve(aSnapshot({ readAt: ago(14 * MINUTE), sync: { state: 'idle', lastAttemptAt: ago(MINUTE), lastError: 'GitHub API unreachable' } }));
    const { queryClient } = renderApp();
    await syncDot(/the last sync with GitHub failed/);

    onRequest('GET', '/api/snapshot', 'unreachable');
    await act(() => queryClient.refetchQueries());

    const dot = await syncDot(/the last sync with GitHub failed · API unreachable/);
    expect(dot).toHaveAttribute('data-state', 'out-of-date');
    expect(dot).toHaveAttribute('data-api-problem', 'unreachable');
  });

  it('reports a failed refresh in its tooltip, and to screen readers', async () => {
    serve(aFreshSnapshot());
    onRequest('POST', '/api/refresh', 'unreachable');

    renderApp();
    await userEvent.click(await syncDot(/refresh now/i));

    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh failed: API unreachable');
    expect(await syncDot(/Refresh failed: API unreachable$/)).toBeInTheDocument();
  });

  it('keeps the Viewer picker and the bell', async () => {
    serve(aFreshSnapshot({ team: [alice] }));

    renderApp();

    expect(await screen.findByLabelText(/I am/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });
});

describe('the theme', () => {
  function systemPrefersDark(dark: boolean): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: dark && query === '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  }

  it('follows the system, until a toggle picks light, then dark, then the system again', async () => {
    systemPrefersDark(true);
    serve(aFreshSnapshot());
    renderApp();
    const html = document.documentElement;

    await waitFor(() => expect(html).toHaveClass('dark'));

    await userEvent.click(screen.getByRole('button', { name: /theme: system/i }));
    expect(html).not.toHaveClass('dark');
    expect(window.localStorage.getItem('stalemate.theme')).toBe('light');

    await userEvent.click(screen.getByRole('button', { name: /theme: light/i }));
    expect(html).toHaveClass('dark');
    expect(window.localStorage.getItem('stalemate.theme')).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: /theme: dark/i }));
    expect(html).toHaveClass('dark');
    expect(window.localStorage.getItem('stalemate.theme')).toBeNull();

    vi.unstubAllGlobals();
  });

  it('is light on a light system', async () => {
    systemPrefersDark(false);
    serve(aFreshSnapshot());

    renderApp();

    await screen.findByRole('button', { name: /theme: system/i });
    expect(document.documentElement).not.toHaveClass('dark');
    vi.unstubAllGlobals();
  });
});

describe('the views', () => {
  it('opens the Table first, and remembers the last view', async () => {
    serve(aFreshSnapshot());
    const first = renderApp();

    expect(await screen.findByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    first.unmount();
    renderApp();

    expect(await screen.findByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the Inbox, bucketed for the Viewer', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    serve(aFreshSnapshot({ prs: [aPr({ title: 'Asks alice', author: bob, waitingOn: [waitingOnReviewer(alice)] })] }));
    renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'Inbox' }));

    expect(within(screen.getByRole('region', { name: 'Your turn' })).getByText('Asks alice')).toBeInTheDocument();
  });

  it('opens the Board, the Viewer’s column first', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    serve(aFreshSnapshot({ prs: [aPr({ title: 'Asks alice', author: bob, waitingOn: [waitingOnReviewer(alice)] })] }));
    renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'Board' }));

    expect(within(screen.getAllByRole('region')[0] as HTMLElement).getByText('Asks alice')).toBeInTheDocument();
    expect(screen.getAllByRole('region')[0]).toHaveAccessibleName('You');
  });

  it('shows the PRs that pass the filters in the URL, hiding Bots by default', async () => {
    serve(aFreshSnapshot({ prs: [aPr({ title: 'Human change' }), aPr({ title: 'Bump deps', author: bot('renovate') })] }));
    renderApp();

    expect(await screen.findByText('Human change')).toBeInTheDocument();
    expect(screen.queryByText('Bump deps')).not.toBeInTheDocument();
  });

  it('reads the filters from the URL', async () => {
    window.history.replaceState(null, '', '/?hideBots=0&q=bump');
    serve(aFreshSnapshot({ prs: [aPr({ title: 'Human change' }), aPr({ title: 'Bump deps', author: bot('renovate') })] }));
    renderApp();

    expect(await screen.findByText('Bump deps')).toBeInTheDocument();
    expect(screen.queryByText('Human change')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /reset filters \(2\)/i }));

    expect(window.location.search).toBe('');
    expect(await screen.findByText('Human change')).toBeInTheDocument();
  });
});

describe('the Notifications bell', () => {
  const onAlice = (title: string) => aPr({ title, author: bob, waitingOn: [waitingOnReviewer(alice)] });

  /** The app sees `first`, then polls and sees `then`. */
  async function seeThenPoll(first: Snapshot, then: Snapshot) {
    serve(first);
    const rendered = renderApp();
    await screen.findByTestId('no-reviewer');
    serve(then);
    await act(() => rendered.queryClient.refetchQueries());
    return rendered;
  }

  const bell = () => screen.getByRole('button', { name: /notifications/i });

  it('starts quiet on a first visit, whatever is already on the Viewer', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');

    const old = onAlice('Old news');

    await seeThenPoll(aFreshSnapshot({ prs: [old] }), aFreshSnapshot({ prs: [old] }));

    expect(bell()).toBeEnabled();
    expect(bell()).toHaveAccessibleName('Notifications');
    expect(screen.queryByTestId('notification-count')).not.toBeInTheDocument();
  });

  it('counts the PRs newly on the Viewer since their browser last saw them', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');

    const old = onAlice('Old news');

    await seeThenPoll(aFreshSnapshot({ prs: [old] }), aFreshSnapshot({ prs: [old, onAlice('New'), onAlice('Newer')] }));

    expect(await screen.findByTestId('notification-count')).toHaveTextContent('2');
    expect(bell()).toHaveAccessibleName('Notifications: 2 unread');
  });

  it('shows "9+" above 9', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    const many = Array.from({ length: 10 }, (_, index) => onAlice(`New ${index}`));

    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: many }));

    expect(await screen.findByTestId('notification-count')).toHaveTextContent('9+');
    expect(bell()).toHaveAccessibleName('Notifications: 10 unread');
  });

  it('shows changes made while the tab was closed', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    serve(aFreshSnapshot());
    const first = renderApp();
    await screen.findByTestId('no-reviewer');
    first.unmount();

    serve(aFreshSnapshot({ prs: [onAlice('New')] }));
    renderApp();

    expect(await screen.findByTestId('notification-count')).toHaveTextContent('1');
  });

  it('keeps counting a PR that left the Viewer, marked "no longer on you" until dismissed', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    const gone = onAlice('Gone');
    const left = { ...gone, waitingOn: [waitingOnAuthor(bob)] };

    const { queryClient } = await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: [gone] }));
    serve(aFreshSnapshot({ prs: [left] }));
    await act(() => queryClient.refetchQueries());

    expect(await screen.findByTestId('notification-count')).toHaveTextContent('1');
    await userEvent.click(bell());
    expect(await screen.findByText('no longer on you')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Gone' }));
    expect(screen.queryByText('no longer on you')).not.toBeInTheDocument();
  });

  it('is greyed out, with a hint, until the Viewer picks themselves', async () => {
    serve(aFreshSnapshot({ prs: [onAlice('New')] }));

    renderApp();

    await screen.findByTestId('no-reviewer');
    expect(bell()).toBeDisabled();
    expect(bell().parentElement).toHaveAttribute('title', expect.stringMatching(/pick yourself/i));
  });

  it('starts over quietly when what this browser saved is damaged', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    window.localStorage.setItem(
      'stalemate.notifications.infra.alice',
      JSON.stringify({ hideViaTeam: false, seenAt: Date.now(), owed: {}, notifications: [null] })
    );

    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: [onAlice('New')] }));

    expect(await screen.findByTestId('notification-count')).toHaveTextContent('1');
  });

  it('starts quiet on a Viewer’s first pick, and keeps each Viewer’s Notifications apart', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    const forAlice = aFreshSnapshot({ prs: [onAlice('For alice'), aPr({ title: 'For bob', author: alice, waitingOn: [waitingOnReviewer(bob)] })] });
    await seeThenPoll(aFreshSnapshot(), forAlice);
    expect(await screen.findByTestId('notification-count')).toHaveTextContent('1');

    await userEvent.selectOptions(screen.getByLabelText(/I am/), 'bob');
    await waitFor(() => expect(screen.queryByTestId('notification-count')).not.toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/I am/), 'alice');
    expect(await screen.findByTestId('notification-count')).toHaveTextContent('1');
  });
});

describe('Notifications per Team', () => {
  const onAlice = (title: string) => aPr({ title, author: bob, waitingOn: [waitingOnReviewer(alice)] });
  const rasterSlice = (prs: Snapshot['prs']) => raster_slice({ prs });
  const count = () => screen.queryByTestId('notification-count');

  it('moves a Viewer’s Notifications from before Teams to infra’s, dismissals kept', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    const kept = onAlice('Still there');
    const dismissed = onAlice('Dismissed');
    window.localStorage.setItem(
      'stalemate.notifications.alice',
      JSON.stringify({
        hideViaTeam: false,
        seenAt: Date.now(),
        owed: { [kept.id]: ['review'], [dismissed.id]: ['review'] },
        notifications: [{ prId: kept.id, moves: ['review'], noticedAt: Date.now(), onYou: true }],
      })
    );
    serve(aFreshSnapshot({ prs: [kept, dismissed] }));

    renderApp();

    expect(await screen.findByTestId('notification-count')).toHaveTextContent('1');
    expect(window.localStorage.getItem('stalemate.notifications.alice')).toBeNull();
    expect(window.localStorage.getItem('stalemate.notifications.infra.alice')).not.toBeNull();
  });

  it('keeps state already under infra’s key over the old one', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    const state = (notifications: unknown[]) => JSON.stringify({ hideViaTeam: false, seenAt: Date.now(), owed: {}, notifications });
    window.localStorage.setItem('stalemate.notifications.alice', state([null]));
    window.localStorage.setItem('stalemate.notifications.infra.alice', state([]));
    serve(aFreshSnapshot());

    renderApp();

    await screen.findByTestId('no-reviewer');
    expect(window.localStorage.getItem('stalemate.notifications.alice')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('stalemate.notifications.infra.alice') ?? '{}').notifications).toEqual([]);
  });

  it('raises none by switching Team, and shows a Team’s news since it was last seen on coming back', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    const infraOld = onAlice('Infra old');
    const rasterPr = onAlice('Raster one');
    let infraPrs = [infraOld];
    onRequest('GET', '/api/teams', { status: 200, body: [infra, raster] });
    onRequest('GET', '/api/snapshot', (url) => ({
      status: 200,
      body: url.searchParams.get('team') === 'raster' ? rasterSlice([rasterPr]) : aFreshSnapshot({ prs: infraPrs }),
    }));
    const { queryClient } = renderApp();
    await screen.findByText('Infra old');

    await userEvent.selectOptions(screen.getByLabelText('Team'), 'raster');
    await screen.findByText('Raster one');
    expect(count()).not.toBeInTheDocument();

    // News lands on infra while the tab looks at raster.
    infraPrs = [infraOld, onAlice('Infra news')];
    await userEvent.selectOptions(screen.getByLabelText('Team'), 'infra');
    await screen.findByText('Infra news');
    await act(() => queryClient.refetchQueries());

    expect(await screen.findByTestId('notification-count')).toHaveTextContent('1');
  });
});

describe('the Notifications drawer', () => {
  const onAlice = (title: string) => aPr({ title, author: bob, waitingOn: [waitingOnReviewer(alice)] });

  /** Alice's app sees `first`, then polls and sees `then`. */
  async function seeThenPoll(first: Snapshot, then: Snapshot) {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    serve(first);
    const rendered = renderApp();
    await screen.findByTestId('no-reviewer');
    serve(then);
    await act(() => rendered.queryClient.refetchQueries());
    return rendered;
  }

  const openDrawer = async () => {
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    return screen.findByRole('dialog', { name: 'Notifications' });
  };

  it('lists each Notification: its title linked to GitHub, repo #number, the new Moves and when it was noticed', async () => {
    const pr = aPr({ title: 'Add tiles', repo: 'MapColonies/raster', number: 7, author: bob, waitingOn: [waitingOnReviewer(alice)] });
    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: [pr] }));
    await screen.findByTestId('notification-count');

    const drawer = await openDrawer();

    const row = within(drawer).getByRole('listitem', { name: 'Add tiles' });
    const link = within(row).getByRole('link', { name: 'Add tiles' });
    expect(link).toHaveAttribute('href', pr.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(row).toHaveTextContent('MapColonies/raster#7');
    expect(within(row).getByRole('list', { name: 'Your move' })).toHaveTextContent('Review');
    expect(row).toHaveTextContent(/noticed \d+ s ago/);
  });

  it('shows only the new Moves of a PR already on the Viewer', async () => {
    const before = onAlice('Same PR');
    const after = { ...before, waitingOn: [waitingOnReviewer(alice, ['review', 'resolveConflict'])] };
    await seeThenPoll(aFreshSnapshot({ prs: [before] }), aFreshSnapshot({ prs: [after] }));
    await screen.findByTestId('notification-count');

    const drawer = await openDrawer();

    const moves = within(within(drawer).getByRole('listitem', { name: 'Same PR' })).getAllByRole('listitem');
    expect(moves.map((move) => move.textContent)).toEqual(['Resolve conflict']);
  });

  it('lists the most recently noticed first, ties in Snapshot order, stable across polls', async () => {
    const [a, b, c] = [onAlice('A'), onAlice('B'), onAlice('C')];
    const rendered = await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: [a, b] }));
    await screen.findByTestId('notification-count');
    const titles = (drawer: HTMLElement) =>
      within(drawer)
        .getAllByRole('link')
        .map((link) => link.textContent);
    const drawer = await openDrawer();
    expect(titles(drawer)).toEqual(['A', 'B']);

    serve(aFreshSnapshot({ prs: [c, a, b] }));
    await act(() => rendered.queryClient.refetchQueries());
    await waitFor(() => expect(titles(drawer)).toEqual(['C', 'A', 'B']));

    serve(aFreshSnapshot({ prs: [c, a, b] }));
    await act(() => rendered.queryClient.refetchQueries());
    expect(titles(drawer)).toEqual(['C', 'A', 'B']);
  });

  it('puts the count in the tab title, following dismissals, and drops it at 0 or with no Viewer', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    serve(aFreshSnapshot());
    const rendered = renderApp();
    await screen.findByTestId('no-reviewer');
    expect(document.title).toBe('StaleMate');

    serve(aFreshSnapshot({ prs: [onAlice('First'), onAlice('Second')] }));
    await act(() => rendered.queryClient.refetchQueries());
    await waitFor(() => expect(document.title).toBe('(2) StaleMate'));

    const drawer = await openDrawer();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Dismiss First' }));
    expect(document.title).toBe('(1) StaleMate');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Dismiss all' }));
    expect(document.title).toBe('StaleMate');
  });

  it('keeps a Notification when its PR is opened', async () => {
    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: [onAlice('New')] }));
    await screen.findByTestId('notification-count');
    const drawer = await openDrawer();

    await userEvent.click(within(drawer).getByRole('link', { name: 'New' }));

    expect(within(drawer).getByRole('listitem', { name: 'New' })).toBeInTheDocument();
    expect(screen.getByTestId('notification-count')).toHaveTextContent('1');
  });

  it('dismisses one Notification with its ✕, and the bell counts one fewer', async () => {
    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: [onAlice('First'), onAlice('Second')] }));
    await screen.findByTestId('notification-count');
    const drawer = await openDrawer();

    await userEvent.click(within(drawer).getByRole('button', { name: 'Dismiss First' }));

    expect(within(drawer).queryByRole('listitem', { name: 'First' })).not.toBeInTheDocument();
    expect(within(drawer).getByRole('listitem', { name: 'Second' })).toBeInTheDocument();
    expect(screen.getByTestId('notification-count')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Notifications: 1 unread', hidden: true })).toBeInTheDocument();
  });

  it('notifies again about a dismissed PR that leaves the Viewer and lands on them again', async () => {
    const pr = onAlice('Comes back');
    const rendered = await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: [pr] }));
    await screen.findByTestId('notification-count');
    await userEvent.click(within(await openDrawer()).getByRole('button', { name: 'Dismiss Comes back' }));
    await userEvent.keyboard('{Escape}');

    // Retitled, so the test can wait until the app shows it.
    serve(aFreshSnapshot({ prs: [{ ...pr, title: 'Back to bob', waitingOn: [waitingOnAuthor(bob)] }] }));
    await act(() => rendered.queryClient.refetchQueries());
    await screen.findByText('Back to bob');
    expect(screen.queryByTestId('notification-count')).not.toBeInTheDocument();
    serve(aFreshSnapshot({ prs: [pr] }));
    await act(() => rendered.queryClient.refetchQueries());

    expect(await screen.findByTestId('notification-count')).toHaveTextContent('1');
  });

  it('dismisses them all at once, then says nothing is new and points to the Inbox', async () => {
    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: [onAlice('First'), onAlice('Second')] }));
    await screen.findByTestId('notification-count');
    const drawer = await openDrawer();

    await userEvent.click(within(drawer).getByRole('button', { name: 'Dismiss all' }));

    expect(within(drawer).getByText(/nothing new on you/i)).toBeInTheDocument();
    expect(screen.queryByTestId('notification-count')).not.toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: /your turn/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inbox' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps a dismissal across visits, and notifies again only on a later change', async () => {
    const pr = onAlice('Same PR');
    const rendered = await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: [pr] }));
    await screen.findByTestId('notification-count');
    const drawer = await openDrawer();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Dismiss Same PR' }));
    rendered.unmount();

    serve(aFreshSnapshot({ prs: [pr] }));
    const again = renderApp();
    await screen.findByTestId('no-reviewer');
    expect(screen.queryByTestId('notification-count')).not.toBeInTheDocument();

    serve(aFreshSnapshot({ prs: [{ ...pr, waitingOn: [waitingOnReviewer(alice, ['review', 'fixChecks'])] }] }));
    await act(() => again.queryClient.refetchQueries());
    expect(await screen.findByTestId('notification-count')).toHaveTextContent('1');
  });

  describe('across tabs', () => {
    /** Two of Alice's tabs see `first`; then only the first tab polls and sees `then`. */
    async function twoTabs(first: Snapshot, then: Snapshot) {
      window.localStorage.setItem('stalemate.viewer', 'alice');
      serve(first);
      const one = renderApp();
      const other = renderApp();
      await waitFor(() => expect(screen.getAllByTestId('no-reviewer')).toHaveLength(2));
      serve(then);
      await act(() => one.queryClient.refetchQueries());
      return { one, other };
    }

    /** The browser tells the tabs another tab saved Alice's Notifications. */
    function storageEvent(): void {
      const key = 'stalemate.notifications.infra.alice';
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: window.localStorage.getItem(key), storageArea: window.localStorage }));
      });
    }

    const bellIn = (tab: { container: HTMLElement }) => within(tab.container).getByRole('button', { name: /notifications/i, hidden: true });
    const openDrawerIn = async (tab: { container: HTMLElement }) => {
      await userEvent.click(bellIn(tab));
      return screen.findByRole('dialog', { name: 'Notifications' });
    };

    it('shows a Notification another tab worked out', async () => {
      const pr = onAlice('Seen there');
      const { one, other } = await twoTabs(
        aFreshSnapshot({ prs: [pr] }),
        aFreshSnapshot({ prs: [{ ...pr, waitingOn: [waitingOnReviewer(alice, ['review', 'fixChecks'])] }] })
      );
      await waitFor(() => expect(bellIn(one)).toHaveAccessibleName('Notifications: 1 unread'));
      expect(bellIn(other)).toHaveAccessibleName('Notifications');

      storageEvent();

      expect(bellIn(other)).toHaveAccessibleName('Notifications: 1 unread');
    });

    it('shows a dismissal made in another tab, in the bell and the drawer', async () => {
      const { one, other } = await twoTabs(aFreshSnapshot(), aFreshSnapshot({ prs: [onAlice('First'), onAlice('Second')] }));
      await waitFor(() => expect(bellIn(one)).toHaveAccessibleName('Notifications: 2 unread'));
      await act(() => other.queryClient.refetchQueries());
      const drawer = await openDrawerIn(other);

      await userEvent.click(within(drawer).getByRole('button', { name: 'Dismiss First' }));
      storageEvent();

      expect(bellIn(one)).toHaveAccessibleName('Notifications: 1 unread');
      expect(bellIn(other)).toHaveAccessibleName('Notifications: 1 unread');
      expect(within(drawer).queryByRole('listitem', { name: 'First' })).not.toBeInTheDocument();
    });

    it('shows them all dismissed in another tab', async () => {
      const { one, other } = await twoTabs(aFreshSnapshot(), aFreshSnapshot({ prs: [onAlice('First'), onAlice('Second')] }));
      await waitFor(() => expect(bellIn(one)).toHaveAccessibleName('Notifications: 2 unread'));
      await act(() => other.queryClient.refetchQueries());

      await userEvent.click(within(await openDrawerIn(other)).getByRole('button', { name: 'Dismiss all' }));
      storageEvent();

      expect(bellIn(one)).toHaveAccessibleName('Notifications');
      expect(bellIn(other)).toHaveAccessibleName('Notifications');
    });

    it('never undoes another tab’s dismissal, even before hearing of it', async () => {
      const { one, other } = await twoTabs(aFreshSnapshot(), aFreshSnapshot({ prs: [onAlice('First'), onAlice('Second')] }));
      await waitFor(() => expect(bellIn(one)).toHaveAccessibleName('Notifications: 2 unread'));
      await act(() => other.queryClient.refetchQueries());
      await userEvent.click(within(await openDrawerIn(other)).getByRole('button', { name: 'Dismiss First' }));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      // The first tab hasn't heard of that dismissal yet.
      expect(bellIn(one)).toHaveAccessibleName('Notifications: 2 unread');
      await userEvent.click(within(await openDrawerIn(one)).getByRole('button', { name: 'Dismiss Second' }));
      await act(() => one.queryClient.refetchQueries());
      storageEvent();

      expect(bellIn(one)).toHaveAccessibleName('Notifications');
      expect(bellIn(other)).toHaveAccessibleName('Notifications');
    });
  });

  it('is an accessible dialog: Escape closes it and gives focus back to the bell', async () => {
    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot());
    await openDrawer();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /notifications/i })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('OS notifications', () => {
  const onAlice = (title: string) => aPr({ title, author: bob, waitingOn: [waitingOnReviewer(alice)] });

  /** The browser's Notification API, recording what the app asks of it. */
  class FakeNotification {
    static permission: NotificationPermission = 'default';
    static answer: NotificationPermission = 'granted';
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = FakeNotification.answer;
      return FakeNotification.answer;
    });
    static shown: FakeNotification[] = [];
    /** The popup shown `index`-th. */
    static nth(index: number): FakeNotification {
      const popup = FakeNotification.shown[index];
      if (popup === undefined) {
        throw new Error(`No popup #${index}`);
      }
      return popup;
    }
    onclick: (() => void) | null = null;
    close = vi.fn();
    readonly title: string;
    readonly options: NotificationOptions;
    constructor(title: string, options: NotificationOptions) {
      this.title = title;
      this.options = options;
      FakeNotification.shown.push(this);
    }
  }

  /** The Permissions API's status for notifications, which the browser changes from site settings. */
  const permissionStatus = new EventTarget();

  function fakeBrowser(permission: NotificationPermission, { permissionsApi = true } = {}): void {
    FakeNotification.permission = permission;
    FakeNotification.answer = 'granted';
    FakeNotification.requestPermission.mockClear();
    FakeNotification.shown = [];
    Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: FakeNotification });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: permissionsApi ? { query: vi.fn(async () => permissionStatus) } : undefined,
    });
  }

  afterEach(() => {
    delete (window as { Notification?: unknown }).Notification;
    delete (navigator as { permissions?: unknown }).permissions;
  });

  /** Alice's app sees `first`, then polls and sees `then`. */
  async function seeThenPoll(first: Snapshot, then: Snapshot) {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    serve(first);
    const rendered = renderApp();
    await screen.findByTestId('no-reviewer');
    serve(then);
    await act(() => rendered.queryClient.refetchQueries());
    return rendered;
  }

  const openDrawer = async () => {
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    return screen.findByRole('dialog', { name: 'Notifications' });
  };
  const checkbox = () => screen.getByRole('checkbox', { name: /send them to my OS/i });

  /** Alice, on a first visit, opens the drawer, ticks the checkbox and closes the drawer again. */
  async function turnOn() {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    serve(aFreshSnapshot());
    const rendered = renderApp();
    await screen.findByTestId('no-reviewer');
    await openDrawer();
    await userEvent.click(checkbox());
    await waitFor(() => expect(checkbox()).toBeChecked());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    return rendered;
  }

  async function poll(rendered: { queryClient: QueryClient }, snapshot: Snapshot) {
    serve(snapshot);
    await act(() => rendered.queryClient.refetchQueries());
  }

  it('is not offered when the browser has no Notification API', async () => {
    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot());

    await openDrawer();

    expect(screen.queryByRole('checkbox', { name: /send them to my OS/i })).not.toBeInTheDocument();
  });

  it('asks for permission only once the checkbox is ticked', async () => {
    fakeBrowser('default');
    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot());
    await openDrawer();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(checkbox()).not.toBeChecked();

    await userEvent.click(checkbox());

    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();
    await waitFor(() => expect(checkbox()).toBeChecked());
  });

  it('stays off when the Viewer refuses permission, and then says how to allow it from the padlock', async () => {
    fakeBrowser('default');
    FakeNotification.answer = 'denied';
    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot());
    await openDrawer();

    await userEvent.click(checkbox());

    await waitFor(() => expect(checkbox()).toBeDisabled());
    expect(checkbox()).not.toBeChecked();
    expect(checkbox()).toHaveAccessibleDescription(/padlock/i);
  });

  it('is disabled while the browser blocks notifications, and comes back once they are allowed again', async () => {
    fakeBrowser('denied');
    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot());
    await openDrawer();
    expect(checkbox()).toBeDisabled();
    expect(checkbox()).toHaveAccessibleDescription(/padlock/i);

    FakeNotification.permission = 'default';
    act(() => {
      permissionStatus.dispatchEvent(new Event('change'));
    });

    await waitFor(() => expect(checkbox()).toBeEnabled());
    expect(checkbox()).not.toHaveAccessibleDescription(/padlock/i);
  });

  it('is ticked right away when permission is already granted, and applies to every Viewer in this browser', async () => {
    fakeBrowser('granted');
    const rendered = await turnOn();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    rendered.unmount();

    window.localStorage.setItem('stalemate.viewer', 'bob');
    serve(aFreshSnapshot());
    renderApp();
    await screen.findByTestId('no-reviewer');
    await openDrawer();

    expect(checkbox()).toBeChecked();
  });

  it('pops up each new Notification, tagged by its PR, once it is on', async () => {
    fakeBrowser('granted');
    const rendered = await turnOn();

    const pr = aPr({ title: 'Add tiles', repo: 'MapColonies/raster', number: 7, author: bob, waitingOn: [waitingOnReviewer(alice)] });
    await poll(rendered, aFreshSnapshot({ prs: [pr, onAlice('Second')] }));

    await waitFor(() => expect(FakeNotification.shown).toHaveLength(2));
    const [first, second] = [FakeNotification.nth(0), FakeNotification.nth(1)];
    expect(first.title).toBe('Add tiles');
    expect(first.options.body).toBe('MapColonies/raster#7 · Review');
    expect(first.options.tag).toContain(pr.id);
    expect(first.options).toMatchObject({ renotify: true });
    expect(second.options.tag).not.toBe(first.options.tag);
  });

  it('pops up only what is newly due, not what it already told about', async () => {
    fakeBrowser('granted');
    const rendered = await turnOn();
    const first = onAlice('First');
    await poll(rendered, aFreshSnapshot({ prs: [first] }));
    await waitFor(() => expect(FakeNotification.shown).toHaveLength(1));

    await poll(rendered, aFreshSnapshot({ prs: [first, onAlice('Second')] }));

    await waitFor(() => expect(FakeNotification.shown).toHaveLength(2));
    expect(FakeNotification.nth(1).title).toBe('Second');
  });

  it('pops up one summary when more than 3 are due at once', async () => {
    fakeBrowser('granted');
    const rendered = await turnOn();

    await poll(rendered, aFreshSnapshot({ prs: Array.from({ length: 4 }, (_, index) => onAlice(`New ${index}`)) }));

    await screen.findByTestId('notification-count');
    expect(FakeNotification.shown.map((popup) => popup.title)).toEqual(['4 PRs are on you']);
  });

  it('pops up nothing while it is off', async () => {
    fakeBrowser('granted');

    await seeThenPoll(aFreshSnapshot(), aFreshSnapshot({ prs: [onAlice('New')] }));

    await screen.findByTestId('notification-count');
    expect(FakeNotification.shown).toEqual([]);
  });

  it('pops up nothing when it starts over: a first visit, or a switch of the via-Team setting', async () => {
    fakeBrowser('granted');
    window.localStorage.setItem('stalemate.osNotifications', 'on');
    window.localStorage.setItem('stalemate.viewer', 'alice');
    const team = aPr({ title: 'For the Team', author: bob, waitingOn: [waitingOnTheTeam] });
    serve(aFreshSnapshot({ prs: [onAlice('Old news'), team] }));
    const first = renderApp();
    await screen.findByTestId('no-reviewer');
    first.unmount();

    window.history.replaceState(null, '', '/?hideViaTeam=1');
    serve(aFreshSnapshot({ prs: [onAlice('Old news'), onAlice('Also old')] }));
    renderApp();
    await screen.findByText('Also old');

    expect(FakeNotification.shown).toEqual([]);
  });

  it('focuses the window and opens the drawer when a popup is clicked', async () => {
    fakeBrowser('granted');
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    const rendered = await turnOn();
    await poll(rendered, aFreshSnapshot({ prs: [onAlice('New')] }));
    await waitFor(() => expect(FakeNotification.shown).toHaveLength(1));

    act(() => FakeNotification.nth(0).onclick?.());

    expect(focus).toHaveBeenCalled();
    expect(FakeNotification.nth(0).close).toHaveBeenCalled();
    const drawer = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(within(drawer).getByRole('listitem', { name: 'New' })).toBeInTheDocument();
    focus.mockRestore();
  });

  describe('from a background tab', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
      focusManager.setFocused(undefined);
    });

    const snapshotPolls = (): number => requests().filter((request) => request === 'GET /api/snapshot').length;

    /**
     * How often Alice's tab, already showing a Snapshot, polls while in the background for 5 minutes. `meanwhile` is
     * served only once the tab is hidden, so only a background poll can bring it.
     */
    async function pollsWhileHiddenFor5Minutes(meanwhile?: Snapshot): Promise<number> {
      await waitFor(() => expect(snapshotPolls()).toBeGreaterThan(0));
      const before = snapshotPolls();
      act(() => focusManager.setFocused(false));
      if (meanwhile) {
        serve(meanwhile);
      }
      await act(() => vi.advanceTimersByTimeAsync(5 * MINUTE));
      return snapshotPolls() - before;
    }

    it('keeps polling while it is on, and pops up what lands meanwhile', async () => {
      fakeBrowser('granted');
      await turnOn();

      expect(await pollsWhileHiddenFor5Minutes(aFreshSnapshot({ prs: [onAlice('New')] }))).toBeGreaterThan(0);
      expect(FakeNotification.shown.map((popup) => popup.title)).toEqual(['New']);
    });

    it('keeps polling with a Viewer picked while OS popups are off, and updates the bell and the tab title', async () => {
      fakeBrowser('granted');
      window.localStorage.setItem('stalemate.viewer', 'alice');
      serve(aFreshSnapshot());
      renderApp();
      await screen.findByTestId('no-reviewer');

      expect(await pollsWhileHiddenFor5Minutes(aFreshSnapshot({ prs: [onAlice('New')] }))).toBeGreaterThan(0);
      expect(await screen.findByTestId('notification-count')).toHaveTextContent('1');
      expect(document.title).toBe('(1) StaleMate');
      expect(FakeNotification.shown).toEqual([]);
    });

    it('keeps polling while the browser blocks notifications, though the setting is on', async () => {
      fakeBrowser('denied');
      window.localStorage.setItem('stalemate.osNotifications', 'on');
      window.localStorage.setItem('stalemate.viewer', 'alice');
      serve(aFreshSnapshot());
      renderApp();
      await screen.findByTestId('no-reviewer');

      expect(await pollsWhileHiddenFor5Minutes()).toBeGreaterThan(0);
    });

    it('does not poll with no Viewer picked', async () => {
      fakeBrowser('granted');
      serve(aFreshSnapshot());
      renderApp();
      await screen.findByTestId('no-reviewer');

      expect(await pollsWhileHiddenFor5Minutes()).toBe(0);
    });
  });
});

describe('the first visit', () => {
  const infraPr = aPr({ title: 'Infra only' });
  const rasterPr = aPr({ title: 'Raster only', author: member('dave'), waitingOn: [{ type: 'team', slug: 'raster', viaTeam: true }] });

  beforeEach(() => {
    window.localStorage.clear();
    serveTeams({ infra: aFreshSnapshot({ prs: [infraPr] }), raster: raster_slice({ prs: [rasterPr] }) });
  });

  it('asks which Team before any PR loads, and makes no Snapshot request', async () => {
    renderApp();

    const modal = await screen.findByRole('dialog');
    expect(await within(modal).findByLabelText('Team')).toHaveValue('');
    expect(within(modal).getByRole('button', { name: 'Show PRs' })).toBeDisabled();
    expect(requests().filter((request) => request.includes('/snapshot'))).toEqual([]);
  });

  it('cannot be dismissed with Escape or a click outside', async () => {
    renderApp();
    await within(await screen.findByRole('dialog')).findByLabelText('Team');

    await userEvent.keyboard('{Escape}');
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the Team chosen, with the person if one is, and remembers both', async () => {
    renderApp();
    const modal = await screen.findByRole('dialog');

    await userEvent.selectOptions(await within(modal).findByLabelText('Team'), 'raster');
    await userEvent.selectOptions(within(modal).getByLabelText(/I am/), 'dave');
    await userEvent.click(within(modal).getByRole('button', { name: 'Show PRs' }));

    expect(await screen.findByText('Raster only')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('stalemate.team')).toBe('raster');
    expect(window.localStorage.getItem('stalemate.viewer')).toBe('dave');
    expect(window.location.search).toBe('?team=raster');
    expect(requestsWithQuery().filter((request) => request.includes('/snapshot'))).toEqual(['GET /api/snapshot?team=raster']);
  });

  it('lets the visitor skip "I am"', async () => {
    renderApp();
    const modal = await screen.findByRole('dialog');

    await userEvent.selectOptions(await within(modal).findByLabelText('Team'), 'infra');
    await userEvent.click(within(modal).getByRole('button', { name: 'Show PRs' }));

    expect(await screen.findByText('Infra only')).toBeInTheDocument();
    expect(window.localStorage.getItem('stalemate.viewer')).toBeNull();
    expect(screen.getByLabelText(/I am/)).toHaveValue('');
  });

  it.each([
    ['stalemate.viewer', 'alice'],
    ['stalemate.theme', 'light'],
    ['stalemate.notifications.alice', '{}'],
  ])('goes straight to infra for a browser that has %s, without the modal', async (key, value) => {
    window.localStorage.setItem(key, value);

    renderApp();

    expect(await screen.findByText('Infra only')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('stalemate.team')).toBe('infra');
  });

  it('asks with the modal, not infra, once the migration has run and the remembered Team is gone', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    window.localStorage.setItem('stalemate.team', 'phantom');

    renderApp();
    await waitFor(() => expect(window.localStorage.getItem('stalemate.team')).toBeNull());
    cleanup();
    renderApp();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(window.localStorage.getItem('stalemate.team')).toBeNull();
  });

  it('prefers the URL, then the remembered Team, over the migration', async () => {
    window.localStorage.setItem('stalemate.viewer', 'alice');
    window.localStorage.setItem('stalemate.team', 'raster');

    renderApp();

    expect(await screen.findByText('Raster only')).toBeInTheDocument();
    expect(window.localStorage.getItem('stalemate.team')).toBe('raster');
  });

  it('prefers the URL over the migration', async () => {
    window.history.replaceState(null, '', '/?team=raster');
    window.localStorage.setItem('stalemate.viewer', 'alice');

    renderApp();

    expect(await screen.findByText('Raster only')).toBeInTheDocument();
  });

  it('falls through an unknown URL Team to the migration', async () => {
    window.history.replaceState(null, '', '/?team=ghost');
    window.localStorage.setItem('stalemate.viewer', 'alice');

    renderApp();

    expect(await screen.findByText('Infra only')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls through an unknown URL Team to the modal on a new browser', async () => {
    window.history.replaceState(null, '', '/?team=ghost');

    renderApp();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByLabelText('Team')).toHaveValue('');
  });

  it('says the API is warming while /teams cannot answer', async () => {
    onRequest('GET', '/api/teams', { status: 503, body: { status: 'warming', sync: { state: 'idle', lastAttemptAt: ago(MINUTE) } } });

    renderApp();

    const modal = await screen.findByRole('dialog');
    expect(await within(modal).findByText(/Waiting for the first sync with GitHub/)).toBeInTheDocument();
    expect(within(modal).queryByLabelText('Team')).not.toBeInTheDocument();
    expect(requests().filter((request) => request.includes('/snapshot'))).toEqual([]);
  });

  it('shows the pickers once /teams answers, after it was warming on load', async () => {
    window.localStorage.setItem('stalemate.team', 'infra');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const snapshot = aFreshSnapshot();
      serve(snapshot);
      onRequest('GET', '/api/teams', { status: 503, body: { status: 'warming', sync: { state: 'syncing' } } });

      renderApp();
      await waitFor(() => expect(requests().some((request) => request.includes('/api/teams'))).toBe(true));
      await waitFor(() => expect(requests().join()).toContain('/api/snapshot'));
      expect(screen.queryByLabelText('I am')).not.toBeInTheDocument();

      serve(snapshot);
      await act(() => vi.advanceTimersByTimeAsync(15 * SECOND));

      expect(await screen.findByLabelText('I am')).toBeInTheDocument();
      expect(screen.getByLabelText('Team')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says the API cannot be reached while /teams cannot answer', async () => {
    onRequest('GET', '/api/teams', 'unreachable');

    renderApp();

    expect(await within(await screen.findByRole('dialog')).findByText(/can’t reach the StaleMate API/i)).toBeInTheDocument();
    expect(requests().filter((request) => request.includes('/snapshot'))).toEqual([]);
  });
});
