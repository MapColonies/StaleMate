import { vi } from 'vitest';

const REM = 16;

/** Makes the window the given width in px, as `(width < …rem)` queries see it. Undo with `vi.unstubAllGlobals()`. */
export function stubWindowWidth(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const bound = /^\(width < ([\d.]+)rem\)$/.exec(query)?.[1];
    return {
      matches: bound !== undefined && width < Number(bound) * REM,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });
}

/** Makes the window narrower than 1280px, or not, as `useCompact()` sees it. Undo with `vi.unstubAllGlobals()`. */
export function stubCompactWindow(compact: boolean): void {
  stubWindowWidth(compact ? 1024 : 1440);
}
