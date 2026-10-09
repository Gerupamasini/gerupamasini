import { describe, expect, it } from 'vitest';
import { tideName } from '../../src/core/Moon';
import { jstParts, jstToMs } from '../../src/core/Time';
import { calendarDays, dailyTides, dateInputValue, DAY_MS, julySpringLows, parseJstDate } from '../../src/tide/calendar';
import { TideModel, type TideStationData } from '../../src/tide/TideModel';
import tokyo from '../../public/data/tide/stations/jma_tokyo.json';
import yokosuka from '../../public/data/tide/stations/jma_yokosuka.json';

describe('JST calendar dates', () => {
  it.each(['0001-01-01', '0099-12-31', '1900-02-28', '2000-02-29', '2024-02-29', '2030-07-16', '9999-12-31'])('round-trips %s without shifting early years to 1900', (date) => {
    const ms = parseJstDate(date);
    expect(ms).not.toBeNull();
    expect(dateInputValue(ms!)).toBe(date);
    expect(jstParts(ms!).hour).toBe(0);
    expect(jstParts(ms!).year).toBe(Number(date.slice(0, 4)));
  });
  it.each(['2023-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-07-00', '0000-01-01', '2026-7-1', 'invalid'])('rejects %s', (date) => {
    expect(parseJstDate(date)).toBeNull();
  });
  it('includes every day of a six-week month and aligns weekdays', () => {
    const days = calendarDays(2026, 8), dates = days.filter((ms) => ms !== null);
    expect(days).toHaveLength(42);
    expect(dates).toHaveLength(31);
    expect(dateInputValue(dates[0])).toBe('2026-08-01');
    expect(dateInputValue(dates.at(-1)!)).toBe('2026-08-31');
    days.forEach((ms, i) => { if (ms !== null) expect(jstParts(ms).weekday).toBe(i % 7); });
    expect(calendarDays(2024, 2).filter((ms) => ms !== null)).toHaveLength(29);
  });
});

describe('calendar tide predictions', () => {
  const model = new TideModel(tokyo as TideStationData);
  it('keeps only extrema on the selected JST date, including near midnight', () => {
    const start = jstToMs(2027, 7, 1), end = start + 31 * DAY_MS;
    const expected = model.extrema(start - DAY_MS, end + DAY_MS).filter((e) => e.t >= start && e.t < end);
    const actual = Array.from({ length: 31 }, (_, i) => dailyTides(model, start + i * DAY_MS)).flat();
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < actual.length; i++) {
      expect(Math.abs(actual[i].t - expected[i].t)).toBeLessThan(15000);
      expect(actual[i].kind).toBe(expected[i].kind);
    }
    expect(expected.some((e) => jstParts(e.t).secondsOfDay < 1200 || jstParts(e.t).secondsOfDay > 85200)).toBe(true);
  });

  it.each([2024, 2026, 2027, 2030])('recommends the three lowest July spring-tide dates for %i', (year) => {
    const recs = julySpringLows(model, year);
    expect(recs).toHaveLength(3);
    expect(new Set(recs.map((e) => dateInputValue(e.t))).size).toBe(3);
    recs.forEach((e, i) => {
      expect(jstParts(e.t)).toMatchObject({ year, month: 7 });
      expect(e.kind).toBe('low');
      expect(tideName(e.t)).toBe('大潮');
      expect(model.level(e.t)).toBeCloseTo(e.level, 8);
      expect(model.level(e.t - 60000)).toBeGreaterThan(e.level);
      expect(model.level(e.t + 60000)).toBeGreaterThan(e.level);
      if (i) expect(e.t).toBeGreaterThan(recs[i - 1].t);
    });
    // All other eligible lows are at least as high as the least favourable recommendation.
    const least = Math.max(...recs.map((e) => e.level));
    for (let day = 1; day <= 31; day++) {
      const start = jstToMs(year, 7, day);
      if (tideName(start + DAY_MS / 2) !== '大潮') continue;
      const lows = dailyTides(model, start).filter((e) => e.kind === 'low' && tideName(e.t) === '大潮');
      if (lows.length && !recs.some((e) => jstParts(e.t).day === day)) expect(Math.min(...lows.map((e) => e.level))).toBeGreaterThanOrEqual(least);
    }
  });

  it('calculates using the selected station instead of a fixed list of times', () => {
    const other = new TideModel(yokosuka as TideStationData);
    expect(julySpringLows(other, 2026).map((e) => [e.t, e.level])).not.toEqual(julySpringLows(model, 2026).map((e) => [e.t, e.level]));
    expect(julySpringLows(model, 2026, 0)).toEqual([]);
  });
});
