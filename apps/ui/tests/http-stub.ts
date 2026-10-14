import { vi } from 'vitest';

/**
 * The one seam these tests use: the global fetch.
 *
 * Installed from the setup file, because the API client captures fetch when its module loads.
 */
export const fetchStub = vi.fn<typeof fetch>();

export function answerWith(status: number, body: unknown): void {
  fetchStub.mockImplementation(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

/** The paths of every request the app sent, in order. */
export function requestedPaths(): string[] {
  return fetchStub.mock.calls.map(([input]) => new URL((input as Request).url).pathname);
}
