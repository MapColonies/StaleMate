import { describe, expect, it } from 'vitest';
import { pollDelayMs } from '@/snapshot/use-snapshot';

const NOW = Date.parse('2026-10-15T09:00:00Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;

const at = (ms: number): string => new Date(NOW + ms).toISOString();

describe('pollDelayMs', () => {
  it('polls every 2 s while a sweep runs', () => {
    expect(pollDelayMs({ state: 'syncing', lastAttemptAt: at(-10 * SECOND) }, NOW)).toBe(2 * SECOND);
  });

  it('polls when the next sweep is due, so its Snapshot shows as it lands', () => {
    expect(pollDelayMs({ state: 'idle', lastAttemptAt: at(-MINUTE), nextAttemptAt: at(10 * SECOND) }, NOW)).toBe(10 * SECOND);
  });

  it('polls at least every 30 s while the next sweep is far off', () => {
    expect(pollDelayMs({ state: 'idle', lastAttemptAt: at(-MINUTE), nextAttemptAt: at(2 * MINUTE) }, NOW)).toBe(30 * SECOND);
  });

  it('polls every 2 s once the next sweep is overdue', () => {
    expect(pollDelayMs({ state: 'idle', lastAttemptAt: at(-3 * MINUTE), nextAttemptAt: at(-SECOND) }, NOW)).toBe(2 * SECOND);
  });

  it('falls back to the given delay when no sweep is scheduled', () => {
    expect(pollDelayMs({ state: 'idle' }, NOW)).toBe(30 * SECOND);
    expect(pollDelayMs({ state: 'idle' }, NOW, 2 * SECOND)).toBe(2 * SECOND);
  });
});
