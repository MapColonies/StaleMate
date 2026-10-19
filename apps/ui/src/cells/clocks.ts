import { formatSince, workingDays } from '@/lib/time';
import type { Clock, TrackedPr } from '@/snapshot/types';

const DATE_TIME = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A clock in whole Working Days, as the chips show it: "3d". */
export function wholeWorkingDays(clock: Clock): number {
  return Math.floor(workingDays(clock));
}

/** The hover over the Idle Time: when a person, not a Bot, last acted on the PR. */
export function idleHover(pr: Pick<TrackedPr, 'idleTime'>): string {
  return `Last human activity: ${DATE_TIME.format(Date.parse(pr.idleTime.since))}`;
}

/** The hover over a PR's clocks: when it became ready and how long ago in wall-clock time, then its last human activity. */
export function clockHover(pr: Pick<TrackedPr, 'age' | 'idleTime'>, now: number): string {
  return [`Ready for review: ${DATE_TIME.format(Date.parse(pr.age.since))} (${formatSince(pr.age.since, now)} ago)`, idleHover(pr)].join('\n');
}
