import { vi } from 'vitest';

/**
 * The one seam these tests use: the global fetch.
 *
 * Installed from the setup file, because the API client captures fetch when its module loads.
 */
export const fetchStub = vi.fn<typeof fetch>();

type Method = 'GET' | 'POST';
type Answer = { status: number; body: unknown } | 'unreachable';

const routes = new Map<string, () => Answer>();

/** Answers `method path` (under /api) with what `answer` returns at the time of each request. */
export function onRequest(method: Method, path: string, answer: Answer | (() => Answer)): void {
  routes.set(`${method} ${path}`, typeof answer === 'function' ? answer : () => answer);
}

export function resetRoutes(): void {
  routes.clear();
  fetchStub.mockImplementation(async (input) => {
    const request = input as Request;
    const answer = routes.get(`${request.method} ${new URL(request.url).pathname}`)?.() ?? { status: 404, body: { message: 'no stub' } };
    if (answer === 'unreachable') {
      throw new TypeError('Failed to fetch');
    }
    // An undefined body answers with no body at all, as a proxy does when the API is down.
    if (answer.body === undefined) {
      return new Response('', { status: answer.status, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
  });
}

/** Every request the app sent, as `METHOD /path`, in order. */
export function requests(): string[] {
  return fetchStub.mock.calls.map(([input]) => {
    const request = input as Request;
    return `${request.method} ${new URL(request.url).pathname}`;
  });
}
