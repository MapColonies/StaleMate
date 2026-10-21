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
const startOfDayByNumber = new Map<number, number>();

interface WorkingDayRow {
  /** When the day starts, in epoch milliseconds. */
  start: number;
  isWorkingDay: boolean;
  /** The working time from the table's origin to the day's start. Negative for days before the origin. */
  workingMsToStart: number;
}

/** A cumulative count of working time, one row per local day, so a span costs two lookups however long it is. */
interface WorkingDayTable {
  readonly extraNonWorkingDays: readonly string[];
  /** Keyed by day number. Covers every day from `firstDay` to `lastDay`. */
  readonly rows: Map<number, WorkingDayRow>;
  firstDay: number;
  lastDay: number;
}

// One per list of extra days off, which comes from config and so doesn't change at runtime. Each grows as callers ask about earlier or later instants.
const tablesByExtraNonWorkingDays = new Map<string, WorkingDayTable>();

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

/**
 * When the local day starts in Asia/Jerusalem, in epoch milliseconds. Computed once per day, since it costs two time-zone lookups.
 * @param dayNumber Days since 1970-01-01, counted by local date.
 */
function startOfDay(dayNumber: number): number {
  let start = startOfDayByNumber.get(dayNumber);
  if (start === undefined) {
    const midnightUtc = dayNumber * MS_PER_DAY;
    // Israel changes its clocks at 02:00, so local midnight always exists once and the offset at it is unambiguous.
    const estimate = midnightUtc - offsetAt(midnightUtc);
    start = midnightUtc - offsetAt(estimate);
    startOfDayByNumber.set(dayNumber, start);
  }
  return start;
}

/** How far Asia/Jerusalem's wall clock is ahead of UTC at the instant, in milliseconds. */
function offsetAt(epochMs: number): number {
  const parts = wallClockFormat.formatToParts(epochMs);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((candidate) => candidate.type === type)?.value);
  const wallClockAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  // The wall clock is read to the second, so drop the instant's milliseconds before comparing.
  return wallClockAsUtc - (epochMs - (epochMs % MS_PER_SECOND));
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

function tableFor(extraNonWorkingDays: readonly string[]): WorkingDayTable {
  const key = [...extraNonWorkingDays].sort().join(',');
  let table = tablesByExtraNonWorkingDays.get(key);
  if (table === undefined) {
    table = { extraNonWorkingDays: [...extraNonWorkingDays], rows: new Map(), firstDay: 0, lastDay: -1 };
    tablesByExtraNonWorkingDays.set(key, table);
  }
  return table;
}

/** The working time from the table's origin to the instant. */
function workingMsToInstant(table: WorkingDayTable, epochMs: number): number {
  // Local midnight is 2 or 3 h before UTC midnight, so the instant's local day is its UTC day or the one after.
  const utcDay = Math.floor(epochMs / MS_PER_DAY);
  extendToCover(table, utcDay, utcDay + 1);
  const nextDay = rowOf(table, utcDay + 1);
  const row = nextDay.start <= epochMs ? nextDay : rowOf(table, utcDay);
  return row.workingMsToStart + (row.isWorkingDay ? epochMs - row.start : 0);
}

/** Extends the table, forwards or backwards, until it covers every day from `firstDay` to `lastDay`. */
function extendToCover(table: WorkingDayTable, firstDay: number, lastDay: number): void {
  if (table.rows.size === 0) {
    // The origin is the first day asked for. Only differences between rows mean anything.
    table.rows.set(firstDay, { start: startOfDay(firstDay), isWorkingDay: isWorkingDayAt(firstDay, table.extraNonWorkingDays), workingMsToStart: 0 });
    table.firstDay = firstDay;
    table.lastDay = firstDay;
  }

  while (table.lastDay < lastDay) {
    const previous = rowOf(table, table.lastDay);
    const day = table.lastDay + 1;
    const start = startOfDay(day);
    const workingMsToStart = previous.workingMsToStart + (previous.isWorkingDay ? start - previous.start : 0);
    table.rows.set(day, { start, isWorkingDay: isWorkingDayAt(day, table.extraNonWorkingDays), workingMsToStart });
    table.lastDay = day;
  }

  while (table.firstDay > firstDay) {
    const next = rowOf(table, table.firstDay);
    const day = table.firstDay - 1;
    const start = startOfDay(day);
    const isWorking = isWorkingDayAt(day, table.extraNonWorkingDays);
    table.rows.set(day, { start, isWorkingDay: isWorking, workingMsToStart: next.workingMsToStart - (isWorking ? next.start - start : 0) });
    table.firstDay = day;
  }
}

function rowOf(table: WorkingDayTable, dayNumber: number): WorkingDayRow {
  const row = table.rows.get(dayNumber);
  if (row === undefined) {
    throw new Error(`The Working Day table doesn't cover day ${dayNumber}`);
  }
  return row;
}

function isWorkingDayAt(dayNumber: number, extraNonWorkingDays: readonly string[]): boolean {
  return isWorkingDay(toIsoDate(dayNumber * MS_PER_DAY), extraNonWorkingDays);
}

/**
 * The working time between two instants, in milliseconds.
 * Working Days run midnight to midnight in Asia/Jerusalem, so this is each instant's working time since a fixed origin, subtracted.
 * @param extraNonWorkingDays Extra days off, as `YYYY-MM-DD` in Asia/Jerusalem.
 */
export function workingMsBetween(from: Date, to: Date, extraNonWorkingDays: readonly string[]): number {
  const table = tableFor(extraNonWorkingDays);
  return Math.max(0, workingMsToInstant(table, to.getTime()) - workingMsToInstant(table, from.getTime()));
}

/** Converts working time to Working Days, for display and Urgency thresholds. A Working Day is 24 h of working time. */
export function toWorkingDays(workingMs: number): number {
  return workingMs / MS_PER_DAY;
}
