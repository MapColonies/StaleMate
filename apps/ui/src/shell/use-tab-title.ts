import { useEffect } from 'react';

/** The browser tab's title: `(N) StaleMate` with N the bell count, plain `StaleMate` at 0 or when there's no Viewer. */
export function tabTitle(count: number, hasViewer: boolean): string {
  return hasViewer && count > 0 ? `(${count}) StaleMate` : 'StaleMate';
}

/** Keeps the tab title current with the bell, so it shows in a background tab. */
export function useTabTitle(count: number, hasViewer: boolean): void {
  useEffect(() => {
    document.title = tabTitle(count, hasViewer);
  }, [count, hasViewer]);
}
