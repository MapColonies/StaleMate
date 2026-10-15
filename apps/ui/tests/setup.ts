import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { fetchStub, resetRoutes } from './http-stub';

// Node's Request rejects relative URLs, which a browser resolves against the page. The API client uses /api.
class BrowserRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' ? new URL(input, window.location.href) : input, init);
  }
}

vi.stubGlobal('Request', BrowserRequest);
vi.stubGlobal('fetch', fetchStub);

beforeEach(() => {
  resetRoutes();
});

afterEach(() => {
  cleanup();
  fetchStub.mockReset();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  document.documentElement.className = '';
});
