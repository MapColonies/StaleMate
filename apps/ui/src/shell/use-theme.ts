import { useEffect } from 'react';
import { STORAGE_KEYS, useStoredString } from '@/lib/local-storage';
import { useMediaQuery } from '@/lib/use-media-query';

export type ThemePreference = 'system' | 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };

/**
 * Dark mode follows the system until the Viewer picks a theme, which this browser remembers.
 * index.html applies the same rule before the first paint, so there is no flash.
 */
export function useTheme(): { preference: ThemePreference; cycle: () => void } {
  const [stored, store] = useStoredString(STORAGE_KEYS.theme);
  const preference: ThemePreference = stored === 'light' || stored === 'dark' ? stored : 'system';
  const systemDark = useMediaQuery(DARK_QUERY);
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
