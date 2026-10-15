import type { Clock } from '@/snapshot/types';

export const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A clock's span in Working Days. The API counts each Working Day as 24 h of working time. */
export function workingDays(clock: Clock): number {
  return clock.workingMs / DAY;
}

/** "40 s", "14 min", "3 h", "2 d": how long ago `time` was, for sync status lines. */
export function formatSince(time: string, now: number): string {
  const elapsed = Math.max(0, now - Date.parse(time));
  if (elapsed < MINUTE) {
    return `${Math.floor(elapsed / SECOND)} s`;
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h`;
  }
  return `${Math.floor(elapsed / DAY)} d`;
}
