import { useMediaQuery } from './use-media-query';

// The same bound as Tailwind's `max-xl:`, so CSS and this hook agree on which side of 1280px the window is.
const COMPACT_QUERY = '(width < 80rem)';

/** Whether the window is narrower than 1280px, where the UI makes room by showing less. */
export function useCompact(): boolean {
  return useMediaQuery(COMPACT_QUERY);
}
