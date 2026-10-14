import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/naming-convention -- the library's default export is a class
import Holidays from 'date-holidays';
import { toWorkingDays, workingMsBetween } from '@domain/workingDays';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('workingMsBetween', function () {
  afterEach(function () {
    vi.restoreAllMocks();
  });

  it.each([
    ['a plain week', '2026-10-11T00:00+03:00', '2026-10-18T00:00+03:00', [], 5 * DAY],
    ['a Friday and Saturday', '2026-10-16T00:00+03:00', '2026-10-18T00:00+03:00', [], 0],
    // Erev Rosh Hashana is Sun 2029-09-09, Rosh Hashana is Mon and Tue.
    ['Rosh Hashana and its erev', '2029-09-06T00:00+03:00', '2029-09-13T00:00+03:00', [], 2 * DAY],
    // Erev Sukkot is Sun 2029-09-23, Sukkot is Mon, chol hamoed runs Tue to Sun and Shmini Atzeret is Mon 2029-10-01.
    // Hoshana Raba, the last day of chol hamoed, is the erev of Shmini Atzeret.
    ['Sukkot, with chol hamoed counted as working', '2029-09-23T00:00+03:00', '2029-10-02T00:00+03:00', [], 3 * DAY],
    // Yom HaZikaron is Tue 2026-04-21, Yom HaAtzmaut is Wed.
    ['Yom HaZikaron and Yom HaAtzmaut', '2026-04-20T00:00+03:00', '2026-04-24T00:00+03:00', [], 2 * DAY],
    ['an extra non-working day', '2026-10-26T00:00+02:00', '2026-10-29T00:00+02:00', ['2026-10-27'], 2 * DAY],
    ['the same days with no extra non-working day', '2026-10-26T00:00+02:00', '2026-10-29T00:00+02:00', [], 3 * DAY],
    ['an interval that starts and ends mid-day', '2026-10-14T15:00+03:00', '2026-10-15T09:00+03:00', [], 18 * HOUR],
    ['an interval that starts mid-day on a Friday', '2026-10-16T12:00+03:00', '2026-10-18T10:00+03:00', [], 10 * HOUR],
    // 21:00Z on Thursday is already Friday in Israel.
    ['an interval that crosses midnight in Israel but not in UTC', '2026-10-15T20:00Z', '2026-10-15T23:00Z', [], HOUR],
    // Clocks fall back at 02:00 on Sun 2026-10-25.
    ['the 25 h day clocks fall back', '2026-10-24T00:00+03:00', '2026-10-26T00:00+02:00', [], 25 * HOUR],
    ['an empty interval', '2026-10-14T12:00+03:00', '2026-10-14T12:00+03:00', [], 0],
    ['an interval that ends before it starts', '2026-10-15T12:00+03:00', '2026-10-14T12:00+03:00', [], 0],
  ])('should count the working time in %s', function (_, from, to, extraNonWorkingDays, expected) {
    expect(workingMsBetween(new Date(from), new Date(to), extraNonWorkingDays)).toBe(expected);
  });

  it('should load the holiday data once, not per call', function () {
    const getHolidays = vi.spyOn(Holidays.prototype, 'getHolidays');
    const from = new Date('2031-01-05T00:00+02:00');
    const to = new Date('2031-01-12T00:00+02:00');

    workingMsBetween(from, to, []);
    const callsOnFirstUse = getHolidays.mock.calls.length;
    workingMsBetween(from, to, []);

    expect(callsOnFirstUse).toBeGreaterThan(0);
    expect(getHolidays).toHaveBeenCalledTimes(callsOnFirstUse);
  });
});

describe('toWorkingDays', function () {
  it('should count 24 h of working time as one Working Day', function () {
    expect(toWorkingDays(36 * HOUR)).toBe(1.5);
  });
});
