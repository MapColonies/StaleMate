import { useEffect, useState } from 'react';

/**
 * The current time, re-read every `tickMs`. Call it in the smallest component that shows the time, never in a view or the app:
 * every tick re-renders the component that holds it, and everything below.
 */
export function useNow(tickMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}
