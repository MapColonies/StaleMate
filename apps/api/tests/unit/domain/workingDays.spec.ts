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
    // Three 25 h days clocks fall back are Working Days; the 23 h days clocks spring forward are Fridays.
    ['three years', '2021-01-03T00:00+02:00', '2024-01-07T00:00+02:00', [], 746 * DAY + 3 * HOUR],
    // Clocks spring forward at 02:00 on Fri 2026-03-27.
    ['an interval across the day clocks spring forward', '2026-03-26T12:00+02:00', '2026-03-29T12:00+03:00', [], 24 * HOUR],
    // Sun 2026-10-25 starts at 21:00Z the day before and ends at 22:00Z.
    ['the first part of the day clocks fall back', '2026-10-24T12:00+03:00', '2026-10-25T12:00+02:00', [], 13 * HOUR],
    ['the last part of the day clocks fall back', '2026-10-25T12:00+02:00', '2026-10-26T00:00+02:00', [], 12 * HOUR],
    ['an interval that ends mid-day on a Saturday', '2026-10-15T12:00+03:00', '2026-10-17T12:00+03:00', [], 12 * HOUR],
    // Rosh Hashana is Mon 2029-09-10 and Tue.
    ['an interval that starts mid-holiday', '2029-09-10T12:00+03:00', '2029-09-12T12:00+03:00', [], 12 * HOUR],
    ['an interval within one non-working day', '2026-10-16T08:00+03:00', '2026-10-16T20:00+03:00', [], 0],
    ['an interval that starts mid-way through an extra non-working day', '2026-10-27T12:00+02:00', '2026-10-29T00:00+02:00', ['2026-10-27'], DAY],
    [
      'several extra non-working days, one on a Friday',
      '2026-10-25T00:00+02:00',
      '2026-11-01T00:00+02:00',
      ['2026-10-27', '2026-10-28', '2026-10-30'],
      3 * DAY,
    ],
  ])('should count the working time in %s', function (_, from, to, extraNonWorkingDays, expected) {
    expect(workingMsBetween(new Date(from), new Date(to), extraNonWorkingDays)).toBe(expected);
  });

  it('should count a span split mid-day as the sum of its parts', function () {
    const from = new Date('2021-01-03T00:00+02:00');
    const midDay = new Date('2022-07-14T15:30+03:00');
    const to = new Date('2024-01-07T00:00+02:00');

    expect(workingMsBetween(from, midDay, []) + workingMsBetween(midDay, to, [])).toBe(746 * DAY + 3 * HOUR);
  });

  it('should keep each list of extra non-working days apart', function () {
    const from = new Date('2026-10-26T00:00+02:00');
    const to = new Date('2026-10-29T00:00+02:00');

    expect([
      workingMsBetween(from, to, ['2026-10-27']),
      workingMsBetween(from, to, []),
      workingMsBetween(from, to, ['2026-10-27', '2026-10-28']),
      workingMsBetween(from, to, ['2026-10-27']),
    ]).toEqual([2 * DAY, 3 * DAY, DAY, 2 * DAY]);
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

  it('should take the day before a holiday on 1 January off', function () {
    // No Israeli public holiday falls on 1 January, so pretend one does in a year nothing else reads.
    const realHolidays = new Holidays('IL');
    const realGetHolidays = realHolidays.getHolidays.bind(realHolidays);
    const newYearHoliday = { date: '2091-01-01 00:00:00', type: 'public' } as ReturnType<Holidays['getHolidays']>[number];
    vi.spyOn(Holidays.prototype, 'getHolidays').mockImplementation((year) => (year === 2091 ? [newYearHoliday] : realGetHolidays(year)));

    // Sun 2090-12-31 is the erev, Mon 2091-01-01 the holiday, Tue a Working Day.
    // An extra day off outside the span keeps this away from the days other tests count.
    expect(workingMsBetween(new Date('2090-12-31T00:00+02:00'), new Date('2091-01-03T00:00+02:00'), ['2090-06-01'])).toBe(DAY);
  });
});

describe('toWorkingDays', function () {
  it('should count 24 h of working time as one Working Day', function () {
    expect(toWorkingDays(36 * HOUR)).toBe(1.5);
  });
});
