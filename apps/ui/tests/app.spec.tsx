import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { components } from 'stalemate-openapi';
import App from '@/app';
import { answerWith, requestedPaths } from './http-stub';

type Snapshot = components['schemas']['snapshot'];

function renderApp() {
  // No retries: a stubbed failure should surface on the first pass.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

describe('App', () => {
  it('asks the API for the Snapshot under /api', async () => {
    answerWith(503, { status: 'warming', sync: { state: 'syncing' } });

    renderApp();

    await screen.findByText(/waiting for the first sync/i);
    expect(requestedPaths()).toEqual(['/api/snapshot']);
  });

  it('shows the API is warming before the first sync', async () => {
    answerWith(503, { status: 'warming', sync: { state: 'syncing' } });

    renderApp();

    expect(await screen.findByText(/waiting for the first sync/i)).toBeInTheDocument();
  });

  it('shows how many Tracked PRs the Snapshot holds', async () => {
    const snapshot: Snapshot = {
      readAt: '2026-10-14T09:00:00Z',
      sync: { state: 'idle' },
      config: { urgencyThresholds: [2, 4, 8] },
      team: [],
      prs: [],
    };
    answerWith(200, snapshot);

    renderApp();

    expect(await screen.findByText(/0 Tracked PRs/)).toBeInTheDocument();
  });
});
