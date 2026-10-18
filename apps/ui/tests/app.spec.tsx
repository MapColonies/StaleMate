import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@/app';
import type { Snapshot, SyncState } from '@/snapshot/types';
import { onRequest, requests } from './http-stub';
import { aPr, aSnapshot, bot, member, waitingOnAuthor, waitingOnReviewer, waitingOnTheTeam } from './fixtures/snapshot';

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

function serve(snapshot: Snapshot): void {
  onRequest('GET', '/api/snapshot', { status: 200, body: snapshot });
}

/** A Snapshot read 40 s ago, whose sweep's refresh cooldown has passed. */
function aFreshSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return aSnapshot({ readAt: ago(40 * SECOND), sync: { state: 'idle', lastAttemptAt: ago(40 * SECOND) }, ...overrides });
}

const alice = member('alice');
const bob = member('bob');

describe('before the first sync', () => {
  it('asks the API for the Snapshot under /api', async () => {
    onRequest('GET', '/api/snapshot', { status: 503, body: { status: 'warming', sync: { state: 'syncing' } } });

    renderApp();

    await screen.findByText(/waiting for the first sync/i);
    expect(requests()).toEqual(['GET /api/snapshot']);
  });

  it('says why the first sync is failing', async () => {
    onRequest('GET', '/api/snapshot', {
      status: 503,
      body: { status: 'warming', sync: { state: 'idle', lastAttemptAt: ago(MINUTE), lastError: 'App authentication failed' } },
    });

    renderApp();

    expect(await screen.findByText(/first sync — it is failing: App authentication failed/)).toBeInTheDocument();
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

    expect(await screen.findByTestId('my-turn')).toHaveTextContent('Your turn 2 + 1 team');
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

    expect(await screen.findByText('updated 40 s ago')).toBeInTheDocument();
  });

  it('keeps saying how old the Snapshot is while a sync runs', async () => {
    serve(aFreshSnapshot({ sync: { state: 'syncing', lastAttemptAt: ago(5 * SECOND) } }));

    renderApp();

    expect(await screen.findByText('updated 40 s ago')).toBeInTheDocument();
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

    await screen.findByText(/updated/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows how old the data is and why the sync fails', async () => {
    serve(aSnapshot({ readAt: ago(14 * MINUTE), sync: { state: 'idle', lastAttemptAt: ago(MINUTE), lastError: 'GitHub API unreachable' } }));

    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent('Showing data from 14 min ago — sync failing: GitHub API unreachable');
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
    expect(screen.getByText('updated 40 s ago')).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: /theme: follows the system/i }));
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

    await screen.findByRole('button', { name: /theme: follows the system/i });
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
