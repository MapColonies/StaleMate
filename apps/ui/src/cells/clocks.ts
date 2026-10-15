import { formatSince, workingDays } from '@/lib/time';
import type { Clock, TrackedPr } from '@/snapshot/types';

const DATE_TIME = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A clock in whole Working Days, as the chips show it: "3d". */
export function wholeWorkingDays(clock: Clock): number {
  return Math.floor(workingDays(clock));
}

/** The hover over the Idle Time: when a person last acted on the PR. */
export function idleHover(pr: Pick<TrackedPr, 'idleTime'>): string {
  return `Last activity ${DATE_TIME.format(Date.parse(pr.idleTime.since))}`;
}

/** The hover over a PR's clocks: when it became ready, its last human activity, and the wall-clock time since it became ready. */
export function clockHover(pr: Pick<TrackedPr, 'age' | 'idleTime'>, now: number): string {
  return [`Ready for review ${DATE_TIME.format(Date.parse(pr.age.since))}`, idleHover(pr), `${formatSince(pr.age.since, now)} wall-clock`].join('\n');
}
