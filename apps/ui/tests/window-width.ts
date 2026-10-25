import { vi } from 'vitest';

/** Makes the window narrower than 1280px, or not, as `useCompact()` sees it. Undo with `vi.unstubAllGlobals()`. */
export function stubCompactWindow(compact: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: compact && query === '(width < 80rem)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}
