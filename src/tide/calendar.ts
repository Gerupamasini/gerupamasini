import { jstMidnight, jstParts, jstToMs } from '../core/Time';
import { tideName } from '../core/Moon';
import type { TideExtremum, TideModel } from './TideModel';

export const DAY_MS = 86400000;

export function dateInputValue(ms: number): string {
  const p = jstParts(ms);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Reject invalid wall-clock dates instead of silently rolling them into the next month. */
export function parseJstDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = jstToMs(year, month, day), p = jstParts(ms);
  return p.year === year && p.month === month && p.day === day ? ms : null;
}

/** Sunday-first month grid; padding cells are not selectable dates. */
export function calendarDays(year: number, month: number): (number | null)[] {
  const start = jstToMs(year, month, 1), lead = jstParts(start).weekday;
  const count = jstParts(jstToMs(year, month + 1, 0)).day;
  return Array.from({ length: Math.ceil((lead + count) / 7) * 7 }, (_, i) =>
    i < lead || i >= lead + count ? null : start + (i - lead) * DAY_MS);
}

/** Include extrema close to midnight, which a scan beginning at midnight can otherwise miss. */
export function dailyTides(model: TideModel, ms: number): TideExtremum[] {
  const start = jstMidnight(ms), end = start + DAY_MS, margin = 20 * 60000;
  return model.extrema(start - margin, end + margin).filter((e) => e.t >= start && e.t < end);
}

/** The lowest July spring-tide lows, one per date, shown in calendar order. */
export function julySpringLows(model: TideModel, year: number, limit = 3): TideExtremum[] {
  const candidates: TideExtremum[] = [];
  for (let day = 1; day <= 31; day++) {
    const start = jstToMs(year, 7, day);
    if (tideName(start + DAY_MS / 2) !== '大潮') continue;
    const lows = dailyTides(model, start).filter((e) => e.kind === 'low' && tideName(e.t) === '大潮');
    if (lows.length) candidates.push(lows.reduce((a, b) => a.level < b.level ? a : b));
  }
  return candidates.sort((a, b) => a.level - b.level).slice(0, Math.max(0, limit)).sort((a, b) => a.t - b.t);
}
