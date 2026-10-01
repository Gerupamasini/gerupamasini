/** Moon age and the Japanese tide-name cycle (大潮・中潮・小潮・長潮・若潮) from the lunar day. */
const SYNODIC_DAYS = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

export function moonAge(ms: number): number {
  const d = (ms - REF_NEW_MOON) / 86400000;
  return ((d % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
}

/** lunar day 1..30 (旧暦の日付に相当) */
export function lunarDay(ms: number): number {
  return Math.min(30, Math.floor(moonAge(ms)) + 1);
}

export type TideName = '大潮' | '中潮' | '小潮' | '長潮' | '若潮';

export function tideName(ms: number): TideName {
  const d = lunarDay(ms);
  if (d <= 3 || (d >= 15 && d <= 17) || d >= 29) return '大潮';
  if (d === 11 || d === 25) return '長潮';
  if (d === 12 || d === 26) return '若潮';
  if ((d >= 8 && d <= 10) || (d >= 22 && d <= 24)) return '小潮';
  return '中潮';
}

export function moonEmoji(ms: number): string {
  const a = moonAge(ms);
  if (a < 1) return '🌑';
  if (a < 6.5) return '🌒';
  if (a < 8.5) return '🌓';
  if (a < 14) return '🌔';
  if (a < 16) return '🌕';
  if (a < 21.5) return '🌖';
  if (a < 23.5) return '🌗';
  if (a < 29) return '🌘';
  return '🌑';
}
