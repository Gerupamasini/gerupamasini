/** JST calendar helpers. Game time is always displayed in Japan Standard Time (UTC+9). */
export const JST_OFFSET_MS = 9 * 3600 * 1000;

export interface JstParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
  /** seconds since JST midnight */
  secondsOfDay: number;
}

export function jstParts(ms: number): JstParts {
  const d = new Date(ms + JST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday: d.getUTCDay(),
    secondsOfDay: d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(),
  };
}

/** Epoch ms for a JST wall-clock time. */
export function jstToMs(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  // Date.UTC treats years 0..99 as 1900..1999; a calendar must retain the selected year.
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  return d.getTime() - JST_OFFSET_MS;
}

export function jstMidnight(ms: number): number {
  const p = jstParts(ms);
  return jstToMs(p.year, p.month, p.day);
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export function seasonOf(ms: number): Season {
  const m = jstParts(ms).month;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

export function formatJst(ms: number, opts: { seconds?: boolean; date?: boolean } = {}): string {
  const p = jstParts(ms);
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  const time = opts.seconds ? `${hh}:${mm}:${String(p.second).padStart(2, '0')}` : `${hh}:${mm}`;
  return opts.date ? `${p.month}/${p.day} ${time}` : time;
}
