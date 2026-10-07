import { Color, type Mesh } from 'three';

/**
 * The far horizon at 走水, drawn on the Skyline's ring (bearings in degrees clockwise from north; the sea is east).
 * Across the 浦賀水道 the 房総 hills run low and blue from 富津岬 to 鋸山, the old fort of 第二海堡 lies low in the
 * channel, and ships pass up and down it all day. The near land (the hills behind the road, the 観音崎 headland, the
 * point to the south) is real ground with trees on it: see land.ts.
 */

/** the Skyline's ring radius (m) and the angle → width on it */
const R = 1900;
const DEG = Math.PI / 180;
const ang = (deg: number) => R * Math.tan(deg * DEG);
/** pictures stand a little above the sea */
const FOOT = 3;

type Plane = (bearing: number, width: number, height: number, bottomY: number, cw: number, ch: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, base: Color, haze: number) => Mesh;

export interface ShipMark { mesh: Mesh; bearing0: number; degPerSec: number; sector: [number, number] }

let seed = 0x2468ace1;
const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 374761393) >>> 0; return seed / 4294967296; };

/** a ridge line: height (0..1 of the picture) along x, from a few soft bumps and some roughness */
function ridge(c: CanvasRenderingContext2D, w: number, h: number, f: (u: number) => number, fill: string): void {
  c.fillStyle = fill;
  for (let x = 0; x < w; x++) {
    const hh = Math.max(0, Math.min(1, f(x / (w - 1)))) * h;
    c.fillRect(x, h - hh, 1, hh);
  }
}
const bump = (u: number, c: number, wd: number, ht: number) => ht * Math.exp(-((u - c) ** 2) / (wd * wd));

export function buildHashirimizuSkyline(plane: Plane, ships: ShipMark[]): void {
  // ---- 房総: the far shore across the channel, 8–20 km, low and hazy blue; drawn in four pieces
  const boso: [number, number, (u: number) => number][] = [
    // 富津岬: a long flat spit, barely above the sea, and the hills behind it starting
    [32, 26, (u) => 0.08 + 0.05 * Math.sin(u * 40) * 0.2 + bump(u, 0.95, 0.25, 0.35)],
    // 鹿野山 and the hills of 君津: rounded, the highest at ~110°
    [62, 30, (u) => 0.32 + bump(u, 0.35, 0.18, 0.25) + bump(u, 0.7, 0.2, 0.32) + 0.03 * Math.sin(u * 63)],
    [98, 34, (u) => 0.38 + bump(u, 0.35, 0.16, 0.42) + bump(u, 0.75, 0.2, 0.22) + 0.03 * Math.sin(u * 51)],
    // 鋸山: the quarried saw-tooth ridge above 金谷, then lower to 保田
    [138, 30, (u) => 0.3 + bump(u, 0.35, 0.12, 0.45) + (u > 0.22 && u < 0.5 ? 0.08 * Math.abs(Math.sin(u * 90)) : 0) - 0.25 * Math.max(0, u - 0.6)],
  ];
  for (const [b, wdeg, f] of boso) {
    plane(b, ang(wdeg) * 1.02, ang(1.9), FOOT, 1024, 128, (c, w, h) => {
      ridge(c, w, h, f, '#9aa0a8');
      // a few white specks of buildings along the far shore
      c.fillStyle = '#d8d8d8';
      for (let i = 0; i < 18; i++) { const x = rnd() * w; c.fillRect(x, h - 3 - rnd() * 4, 2 + rnd() * 3, 2); }
    }, new Color(0.47, 0.54, 0.64), 0.66);
  }
  // ---- 第二海堡: a low fort island out in the channel to the north
  plane(6, ang(1.6), ang(0.22), FOOT, 256, 32, (c, w, h) => {
    ridge(c, w, h, (u) => (u > 0.08 && u < 0.92 ? 0.55 + 0.25 * Math.sin(u * 30) * 0.3 : 0), '#7b7f74');
  }, new Color(0.38, 0.42, 0.38), 0.55);
  // ---- ships in the 浦賀水道: inbound to Tokyo close to this shore (moving north), outbound further out
  const kinds: { len: number; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void; tall: number }[] = [
    { len: 300, tall: 50, draw: (c, w, h) => { // a container ship: boxes in rows, the bridge aft
      c.fillStyle = '#3a3c40'; c.beginPath(); c.moveTo(0, h * 0.62); c.lineTo(w, h * 0.62); c.lineTo(w * 0.97, h); c.lineTo(w * 0.04, h); c.closePath(); c.fill();
      for (let x = w * 0.12; x < w * 0.84; x += w * 0.035) { c.fillStyle = ['#8a4a3a', '#3f5a74', '#9a9a92', '#5b6b4a', '#a07a3a'][Math.floor(rnd() * 5)]; c.fillRect(x, h * (0.3 + rnd() * 0.12), w * 0.032, h * 0.33); }
      c.fillStyle = '#e8e8e4'; c.fillRect(w * 0.86, h * 0.08, w * 0.07, h * 0.55);
    } },
    { len: 240, tall: 32, draw: (c, w, h) => { // a tanker: long and low, the bridge aft
      c.fillStyle = '#4a2e2a'; c.fillRect(0, h * 0.62, w, h * 0.38);
      c.fillStyle = '#2f3134'; c.fillRect(0, h * 0.55, w, h * 0.1);
      c.fillStyle = '#ecebe6'; c.fillRect(w * 0.84, h * 0.08, w * 0.09, h * 0.5);
      c.fillStyle = '#8a8a86'; c.fillRect(w * 0.88, h * 0.0, w * 0.015, h * 0.1);
    } },
    { len: 200, tall: 42, draw: (c, w, h) => { // a car carrier: one tall box
      c.fillStyle = '#e6e6e2'; c.beginPath(); c.moveTo(w * 0.03, h * 0.08); c.lineTo(w * 0.98, h * 0.08); c.lineTo(w, h * 0.85); c.lineTo(0, h * 0.85); c.closePath(); c.fill();
      c.fillStyle = '#3a3c40'; c.fillRect(0, h * 0.85, w, h * 0.15);
    } },
    { len: 80, tall: 22, draw: (c, w, h) => { // the 久里浜–金谷 ferry: white, two decks, a blue band
      c.fillStyle = '#f0f0ec'; c.fillRect(w * 0.05, h * 0.35, w * 0.9, h * 0.5);
      c.fillRect(w * 0.25, h * 0.1, w * 0.5, h * 0.3);
      c.fillStyle = '#2f5c9a'; c.fillRect(w * 0.05, h * 0.7, w * 0.9, h * 0.08);
      c.fillStyle = '#3a3c40'; c.fillRect(0, h * 0.85, w, h * 0.15);
    } },
  ];
  const lanes: [number, number, number, number][] = [
    // [kind, distance (km), start bearing, knots (+ southbound / outbound, - northbound / inbound)]
    [0, 3.0, 120, -15], [1, 3.4, 60, -12], [2, 5.5, 95, 14], [3, 4.2, 140, 11], [1, 6.0, 40, 13],
  ];
  for (const [ki, km, b0, kn] of lanes) {
    const k = kinds[ki];
    const wdeg = (k.len / (km * 1000)) / DEG, hdeg = (k.tall / (km * 1000)) / DEG;
    const mesh = plane(b0, ang(wdeg), ang(hdeg * 1.3), FOOT, 512, Math.max(32, Math.round(512 * hdeg / wdeg)), k.draw, new Color(0.32, 0.34, 0.38), 0.45);
    // the angular speed of a ship at that distance across the line of sight
    const degPerSec = ((kn * 0.514) / (km * 1000)) / DEG;
    ships.push({ mesh, bearing0: b0, degPerSec, sector: [22, 168] });
  }
}
