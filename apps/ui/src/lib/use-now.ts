import { useEffect, useState } from 'react';

const TICK_MS = 1000;

/** The current time, ticking every second, for "updated 40 s ago" and countdowns. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}
