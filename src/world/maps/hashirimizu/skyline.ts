import { Color, type Mesh } from 'three';

/**
 * The horizon at 走水, drawn on the Skyline's ring (bearings in degrees clockwise from north; the sea is east). Across
 * the 浦賀水道 the 房総 hills run low and blue from 富津岬 to 鋸山; 観音崎 stands close to the north-east, a wooded
 * headland with its white lighthouse; behind the road the Miura hills rise steep and green over the houses of 走水,
 * and the little port lies to the south. Ships pass up and down the channel all day.
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
  // ---- 観音崎: a wooded headland to the north-east, close (1.1 km); the lighthouse on its shoulder
  plane(38, ang(36), ang(3.6), FOOT - 1, 1600, 220, (c, w, h) => {
    ridge(c, w, h, (u) => {
      // rising from the sea at the right (the point), highest toward the land on the left
      const land = 0.78 - 0.35 * u + bump(u, 0.22, 0.12, 0.12) + bump(u, 0.55, 0.1, 0.07);
      return u > 0.93 ? land * Math.max(0, (1 - u) / 0.07) : land;
    }, '#33402c');
    // the canopy: rounded crowns along the skyline
    c.fillStyle = '#2b3826';
    for (let x = 0; x < w; x += 6) {
      const u = x / w, top = h * (1 - (0.78 - 0.35 * u)) - 2;
      if (u > 0.93) continue;
      c.beginPath(); c.arc(x, top + 4, 5 + rnd() * 6, 0, Math.PI * 2); c.fill();
    }
    // the sea cliff at the point: pale rock
    c.fillStyle = '#8a8475';
    c.fillRect(w * 0.84, h * 0.82, w * 0.1, h * 0.18);
    // 観音埼灯台: a white tower and its lamp house on the shoulder of the hill
    const lx = w * 0.62, base = h * (1 - (0.78 - 0.35 * 0.62)) + 2;
    c.fillStyle = '#f2f2ee';
    c.fillRect(lx - 7, base - 46, 14, 46);
    c.fillRect(lx - 10, base - 52, 20, 7);
    c.fillStyle = '#3a3a3a';
    c.fillRect(lx - 6, base - 62, 12, 10);
    c.fillStyle = '#f2f2ee';
    c.beginPath(); c.arc(lx, base - 63, 7, Math.PI, 0); c.fill();
  }, new Color(0.24, 0.31, 0.22), 0.22);
  // ---- 走水 to the south: the little port's breakwater, houses and the shrine's wooded hill
  plane(190, ang(42), ang(4.8), FOOT - 1, 1600, 240, (c, w, h) => {
    ridge(c, w, h, (u) => 0.25 + bump(u, 0.25, 0.14, 0.45) + bump(u, 0.7, 0.2, 0.55) + 0.03 * Math.sin(u * 70), '#344230');
    // houses along the shore road
    for (let x = w * 0.05; x < w * 0.95;) {
      const ww = 14 + rnd() * 26, hh = 10 + rnd() * 18;
      c.fillStyle = rnd() < 0.5 ? '#d9d6cc' : rnd() < 0.5 ? '#b7b4ab' : '#8f8a80';
      c.fillRect(x, h - hh - 6, ww, hh);
      c.fillStyle = '#5b5550'; c.fillRect(x - 1, h - hh - 9, ww + 2, 4);
      x += ww + rnd() * 18;
    }
    // the breakwater
    c.fillStyle = '#b9b6ad'; c.fillRect(w * 0.0, h - 7, w * 0.3, 7);
  }, new Color(0.27, 0.33, 0.24), 0.25);
  // ---- behind the road: the Miura hills, steep, wooded, a few hundred metres away
  for (const [b, wdeg, hdeg] of [[250, 50, 9], [300, 50, 11], [345, 42, 7]] as const) {
    plane(b, ang(wdeg), ang(hdeg), FOOT, 1600, 360, (c, w, h) => {
      ridge(c, w, h, (u) => 0.6 + bump(u, 0.3, 0.2, 0.25) + bump(u, 0.75, 0.15, 0.2) + 0.02 * Math.sin(u * 90) + 0.015 * Math.sin(u * 230), '#2c3a26');
      c.fillStyle = '#25321f';
      for (let x = 0; x < w; x += 7) { const y = h * 0.25 + rnd() * h * 0.6; c.beginPath(); c.arc(x, y, 6 + rnd() * 8, 0, Math.PI * 2); c.fill(); }
      // houses at the foot
      for (let x = 0; x < w;) {
        const ww = 18 + rnd() * 30, hh = 14 + rnd() * 22;
        c.fillStyle = rnd() < 0.5 ? '#d4d0c6' : '#a9a49a';
        c.fillRect(x, h - hh, ww, hh);
        c.fillStyle = '#4e4945'; c.fillRect(x - 2, h - hh - 4, ww + 4, 5);
        x += ww + 4 + rnd() * 30;
      }
    }, new Color(0.25, 0.32, 0.21), 0.18);
  }
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
