import { Vector3 } from 'three';
import { julianDate } from '../tide/astro';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export interface SunPos {
  /** degrees above the horizon */
  elevation: number;
  /** degrees clockwise from north */
  azimuth: number;
  declination: number;
}

/** NOAA solar position approximation (accuracy ~0.01° for 1950–2050). */
export function sunPosition(ms: number, latDeg: number, lonDeg: number): SunPos {
  const jd = julianDate(ms);
  const T = (jd - 2451545) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * D2R;
  const C = (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(Mr) + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) + 0.000289 * Math.sin(3 * Mr);
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * D2R);
  const decl = Math.asin(Math.sin(eps * D2R) * Math.sin(lambda * D2R));
  const y = Math.tan((eps / 2) * D2R) ** 2;
  const L0r = L0 * D2R;
  const eot = 4 * R2D * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const minutesUT = ((ms / 60000) % 1440 + 1440) % 1440;
  const tst = (minutesUT + eot + 4 * lonDeg + 1440) % 1440;
  const H = (tst / 4 - 180) * D2R;
  const phi = latDeg * D2R;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * R2D + 180;
  az = ((az % 360) + 360) % 360;
  return { elevation: el * R2D, azimuth: az, declination: decl * R2D };
}

/** Unit vector pointing toward the sun in world space (x east, y up, z south). */
export function sunDirection(pos: SunPos, out = new Vector3()): Vector3 {
  const el = pos.elevation * D2R, az = pos.azimuth * D2R;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export function timeOfDay(elevation: number, hourLocal: number): TimeOfDay {
  if (elevation > 6) return 'day';
  if (elevation > -6) return hourLocal < 12 ? 'dawn' : 'dusk';
  return 'night';
}
