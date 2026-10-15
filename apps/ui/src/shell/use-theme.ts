import { useEffect, useSyncExternalStore } from 'react';
import { STORAGE_KEYS, useStoredString } from '@/lib/local-storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystem(onChange: () => void): () => void {
  const query = window.matchMedia?.(DARK_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

const systemIsDark = (): boolean => window.matchMedia?.(DARK_QUERY).matches ?? false;

const NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };

/**
 * Dark mode follows the system until the Viewer picks a theme, which this browser remembers.
 * index.html applies the same rule before the first paint, so there is no flash.
 */
export function useTheme(): { preference: ThemePreference; cycle: () => void } {
  const [stored, store] = useStoredString(STORAGE_KEYS.theme);
  const preference: ThemePreference = stored === 'light' || stored === 'dark' ? stored : 'system';
  const systemDark = useSyncExternalStore(subscribeToSystem, systemIsDark);
  const isDark = preference === 'dark' || (preference === 'system' && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const cycle = (): void => {
    const next = NEXT[preference];
    store(next === 'system' ? null : next);
  };

  return { preference, cycle };
}
