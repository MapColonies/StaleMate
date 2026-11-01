import { useMediaQuery } from './use-media-query';

// The same bounds as Tailwind's `max-xl:` and `max-md:`, so CSS and these hooks agree on which side of a bound the window is.
const COMPACT_QUERY = '(width < 80rem)';
const NARROW_QUERY = '(width < 48rem)';

/** Whether the window is narrower than 1280px, where the UI makes room by showing less. */
export function useCompact(): boolean {
  return useMediaQuery(COMPACT_QUERY);
}

/** Whether the window is narrower than 768px, as a tab split beside another is, where the UI shows only what it must. */
export function useNarrow(): boolean {
  return useMediaQuery(NARROW_QUERY);
}
