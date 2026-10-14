// eslint-disable-next-line @typescript-eslint/naming-convention -- the library's default export is a class
import Holidays from 'date-holidays';

const TIME_ZONE = 'Asia/Jerusalem';
const MS_PER_SECOND = 1000;
const MS_PER_DAY = 86_400_000;
const FRIDAY = 5;
const SATURDAY = 6;
const ISO_DATE_LENGTH = 'YYYY-MM-DD'.length;

// Loaded once per process. Each year's days off are computed on first use and kept.
const israeliHolidays = new Holidays('IL');
const holidayDaysOffByYear = new Map<number, ReadonlySet<string>>();

const wallClockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** @param day `YYYY-MM-DD` in Asia/Jerusalem. */
function isWorkingDay(day: string, extraNonWorkingDays: readonly string[]): boolean {
  const date = new Date(utcMidnightOf(day));
  const dayOfWeek = date.getUTCDay();
  if (dayOfWeek === FRIDAY || dayOfWeek === SATURDAY) {
    return false;
  }

  const year = date.getUTCFullYear();
  // The day before a holiday on 1 January belongs to the previous year.
  const isHolidayDayOff = holidayDaysOff(year).has(day) || holidayDaysOff(year + 1).has(day);
  return !isHolidayDayOff && !extraNonWorkingDays.includes(day);
}

/** The year's public holidays and the day before each, which covers erev chag and Yom HaZikaron. */
function holidayDaysOff(year: number): ReadonlySet<string> {
  let daysOff = holidayDaysOffByYear.get(year);
  if (daysOff === undefined) {
    // Hebrew-calendar holidays start at 18:00 the evening before, so read the civil date rather than `start`.
    const publicHolidays = israeliHolidays
      .getHolidays(year)
      .filter((holiday) => holiday.type === 'public')
      .map((holiday) => holiday.date.slice(0, ISO_DATE_LENGTH));
    daysOff = new Set(publicHolidays.flatMap((day) => [day, dayBefore(day)]));
    holidayDaysOffByYear.set(year, daysOff);
  }
  return daysOff;
}

/** When `day` starts in Asia/Jerusalem, in epoch milliseconds. */
function startOfDay(day: string): number {
  const midnightUtc = utcMidnightOf(day);
  // Israel changes its clocks at 02:00, so local midnight always exists once and the offset at it is unambiguous.
  const estimate = midnightUtc - offsetAt(midnightUtc);
  return midnightUtc - offsetAt(estimate);
}

/** The local day in Asia/Jerusalem, as `YYYY-MM-DD`. */
function localDayOf(epochMs: number): string {
  return toIsoDate(epochMs + offsetAt(epochMs));
}

/** How far Asia/Jerusalem's wall clock is ahead of UTC at the instant, in milliseconds. */
function offsetAt(epochMs: number): number {
  const parts = wallClockFormat.formatToParts(epochMs);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((candidate) => candidate.type === type)?.value);
  const wallClockAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  // The wall clock is read to the second, so drop the instant's milliseconds before comparing.
  return wallClockAsUtc - (epochMs - (epochMs % MS_PER_SECOND));
}

function dayAfter(day: string): string {
  return toIsoDate(utcMidnightOf(day) + MS_PER_DAY);
}

function dayBefore(day: string): string {
  return toIsoDate(utcMidnightOf(day) - MS_PER_DAY);
}

/** The instant `day` starts in UTC, which lets plain date arithmetic ignore Israel's clock changes. */
function utcMidnightOf(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function toIsoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, ISO_DATE_LENGTH);
}

/**
 * The working time between two instants, in milliseconds.
 * Working Days run midnight to midnight in Asia/Jerusalem, so this sums each Working Day's overlap with the interval.
 * @param extraNonWorkingDays Extra days off, as `YYYY-MM-DD` in Asia/Jerusalem.
 */
export function workingMsBetween(from: Date, to: Date, extraNonWorkingDays: readonly string[]): number {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  let workingMs = 0;

  let day = localDayOf(fromMs);
  let dayStart = startOfDay(day);
  while (dayStart < toMs) {
    const nextDay = dayAfter(day);
    const nextDayStart = startOfDay(nextDay);
    if (isWorkingDay(day, extraNonWorkingDays)) {
      workingMs += Math.max(0, Math.min(nextDayStart, toMs) - Math.max(dayStart, fromMs));
    }
    day = nextDay;
    dayStart = nextDayStart;
  }

  return workingMs;
}

/** Converts working time to Working Days, for display and Urgency thresholds. A Working Day is 24 h of working time. */
export function toWorkingDays(workingMs: number): number {
  return workingMs / MS_PER_DAY;
}
