import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { isNewVersion } from '@/shell/use-new-version-deployed';
import { NewVersionBanner } from '@/shell/new-version-banner';
import { onRequest, requests } from './http-stub';

const MINUTE = 60 * 1000;

// The running version, as vitest.config.ts compiles it in.
const RUNNING = '1.2.3';

function renderBanner() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewVersionBanner />
    </QueryClientProvider>
  );
}

function deploy(version: string): void {
  onRequest('GET', '/version.json', { status: 200, body: { version } });
}

const versionChecks = (): number => requests().filter((request) => request === 'GET /version.json').length;

/** Waits until the `count`th check has been sent and its answer read. */
async function checked(count: number): Promise<void> {
  await vi.waitFor(() => expect(versionChecks()).toBe(count));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe('isNewVersion', () => {
  it('is false when the deployed version is the running one', () => {
    expect(isNewVersion({ version: RUNNING }, RUNNING)).toBe(false);
  });

  it('is true for a newer deployed version', () => {
    expect(isNewVersion({ version: '1.3.0' }, RUNNING)).toBe(true);
  });

  it('is true for an older deployed version, as after a rollback', () => {
    expect(isNewVersion({ version: '1.1.0' }, RUNNING)).toBe(true);
  });

  it.each([undefined, null, 'oops', {}, { version: 7 }, { version: '' }])('is false for a malformed version.json: %j', (deployed) => {
    expect(isNewVersion(deployed, RUNNING)).toBe(false);
  });
});

describe('the new version banner', () => {
  it('asks the Viewer to reload when another version is deployed', async () => {
    deploy('1.3.0');

    renderBanner();

    expect(await screen.findByRole('status')).toHaveTextContent('A new version of StaleMate is available — Reload');
  });

  it('shows the running version on the Reload button’s tooltip, and nowhere else', async () => {
    deploy('1.3.0');

    renderBanner();

    const reload = await screen.findByRole('button', { name: 'Reload' });
    expect(reload).toHaveAttribute('title', `You’re on v${RUNNING}`);
    expect(screen.getByRole('status')).not.toHaveTextContent(/\d/);
  });

  it('reloads the page on Reload, and offers no way to dismiss it', async () => {
    deploy('1.3.0');
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('is hidden while the running version is deployed', async () => {
    deploy(RUNNING);

    renderBanner();

    await checked(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    ['missing', { status: 404, body: { message: 'not found' } } as const],
    ['malformed', { status: 200, body: { nope: true } } as const],
    ['unreachable', 'unreachable' as const],
  ])('is hidden when version.json is %s', async (_, answer) => {
    onRequest('GET', '/version.json', answer);

    renderBanner();

    await checked(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is hidden when the host answers with a page instead, as vite dev does', async () => {
    onRequest('GET', '/version.json', { status: 200, body: undefined });

    renderBanner();

    await checked(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('checking for a new version', () => {
  it('checks every 5 minutes while the tab is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    deploy(RUNNING);
    renderBanner();
    await checked(1);

    deploy('1.3.0');
    await act(() => vi.advanceTimersByTimeAsync(5 * MINUTE));

    expect(versionChecks()).toBe(2);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('does not check from a background tab', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    deploy(RUNNING);
    renderBanner();
    await checked(1);

    act(() => focusManager.setFocused(false));
    await act(() => vi.advanceTimersByTimeAsync(15 * MINUTE));

    expect(versionChecks()).toBe(1);
  });

  it('checks when the window regains focus', async () => {
    deploy(RUNNING);
    renderBanner();
    await checked(1);

    deploy('1.3.0');
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));

    await checked(2);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});
