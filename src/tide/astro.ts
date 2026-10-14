// Astronomical arguments for tidal harmonic prediction.
// Mean longitudes (degrees) from Meeus / ELP2000, evaluated in Julian centuries from J2000.0.
// τ is Doodson's mean lunar time angle for the Greenwich meridian.

export interface AstroArgs {
  /** Julian centuries since J2000.0 (UT, TT difference ignored: < 1 minute of error) */
  T: number;
  /** moon mean longitude */
  s: number;
  /** sun mean longitude */
  h: number;
  /** lunar perigee */
  p: number;
  /** lunar ascending node */
  N: number;
  /** solar perigee */
  pp: number;
  /** mean lunar time angle (Greenwich) */
  tau: number;
}

const DEG = 360;
export const norm360 = (x: number): number => ((x % DEG) + DEG) % DEG;

/** Julian Date from a JS epoch in milliseconds (UTC). */
export function julianDate(ms: number): number {
  return ms / 86400000 + 2440587.5;
}

export function astroArgs(ms: number): AstroArgs {
  const jd = julianDate(ms);
  const T = (jd - 2451545.0) / 36525;
  const T2 = T * T;
  const s = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2);
  const h = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T2);
  const p = norm360(83.3532465 + 4069.0137287 * T - 0.01032 * T2);
  const N = norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T2);
  const pp = norm360(282.93735 + 1.71946 * T);
  // hours of the UT day
  const hoursUT = ((ms / 3600000) % 24 + 24) % 24;
  const tau = norm360(15 * hoursUT - s + h);
  return { T, s, h, p, N, pp, tau };
}
