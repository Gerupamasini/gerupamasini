import { Color, type Mesh } from 'three';

/**
 * The far horizon at 走水, drawn on the Skyline's ring (bearings in degrees clockwise from north; the sea is east).
 * Out on the 浦賀水道 the ships pass up and down all day; beyond them the sea runs to an open horizon (the far shore
 * and the islands are left out). The near land (the hills behind the road, the 観音崎 headland, the point to the
 * south) is real ground with trees on it: see land.ts.
 *
 * 横須賀 is just up the coast, so now and then the ship coming down a lane is a 護衛艦 (an Aegis destroyer of the
 * こんごう or あたご／まや classes, or a もがみ-class frigate) and, very rarely, the nuclear carrier from the US base.
 * Which ship sails is drawn afresh each time a lane comes round, from the pass's own number: the same moment brings
 * the same ship for everyone.
 */

/** the Skyline's ring radius (m) and the angle → width on it */
const R = 1900;
const DEG = Math.PI / 180;
const ang = (deg: number) => R * Math.tan(deg * DEG);
/** pictures stand a little above the sea */
const FOOT = 3;

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
/** one ship picture on the ring: `key` names the drawing, made once and shared by every lane that carries it */
export type ShipPlane = (key: string, bearing: number, width: number, height: number, bottomY: number, cw: number, ch: number, draw: Draw, base: Color, haze: number) => Mesh;

export interface ShipMark {
  /** the ships this lane can carry; one of them sails each pass */
  meshes: Mesh[];
  /** which of `meshes` sails on pass `n` (the passes are numbered as the lane comes round, negative before the epoch) */
  pick(n: number): number;
  bearing0: number;
  degPerSec: number;
  sector: [number, number];
}

/** a ship's share of the passes on a lane that can carry it */
export const NAVY_ODDS = {
  /** a 護衛艦 (any of the three classes, equally likely) */
  escort: 0.15,
  /** the carrier (only on the two lanes nearest the shore, inbound to 横須賀) */
  carrier: 0.03,
} as const;

let seed = 0x2468ace1;
const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 374761393) >>> 0; return seed / 4294967296; };

/** 0..1 from a lane and a pass number */
export function passHash(lane: number, n: number, salt = 0): number {
  let h = Math.imul(lane + 1, 0x27d4eb2d) ^ Math.imul(n | 0, 0x165667b1) ^ Math.imul(salt + 7, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// The warships, drawn side on with the bow to the left like the merchantmen. Shapes are given in fractions of the
// ship's length (x, from the bow) and of the picture's height (y, up from the waterline).
type Pt = readonly [number, number];
function fill(c: CanvasRenderingContext2D, w: number, h: number, colour: string, pts: readonly Pt[]): void {
  c.fillStyle = colour;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x * w, h - y * h) : c.moveTo(x * w, h - y * h)));
  c.closePath();
  c.fill();
}
function rect(c: CanvasRenderingContext2D, w: number, h: number, colour: string, x0: number, x1: number, y0: number, y1: number): void {
  c.fillStyle = colour;
  c.fillRect(x0 * w, h - y1 * h, (x1 - x0) * w, (y1 - y0) * h);
}
/** a thin pole or yard (width in pixels, at least one) */
function line(c: CanvasRenderingContext2D, w: number, h: number, colour: string, x0: number, y0: number, x1: number, y1: number, px = 1): void {
  c.strokeStyle = colour;
  c.lineWidth = Math.max(1, px);
  c.beginPath(); c.moveTo(x0 * w, h - y0 * h); c.lineTo(x1 * w, h - y1 * h); c.stroke();
}

const HAZE_GREY = '#8c9297', HAZE_DARK = '#6f757a', HAZE_LIGHT = '#a3a9ae', BOOT = '#2c2e30';

/** a destroyer's hull: the raised bow, the long low quarterdeck, the dark boot-topping at the waterline */
function destroyerHull(c: CanvasRenderingContext2D, w: number, h: number, deck: number): void {
  fill(c, w, h, HAZE_GREY, [[0, deck + 0.05], [0.25, deck + 0.01], [0.6, deck], [1, deck - 0.02], [0.995, 0.03], [0.04, 0.0]]);
  rect(c, w, h, BOOT, 0.03, 0.995, 0, 0.025);
}
/** the 5-inch gun on the foredeck */
function gun(c: CanvasRenderingContext2D, w: number, h: number, x: number, deck: number): void {
  fill(c, w, h, HAZE_LIGHT, [[x - 0.025, deck], [x - 0.02, deck + 0.06], [x + 0.025, deck + 0.06], [x + 0.03, deck]]);
  line(c, w, h, HAZE_DARK, x - 0.02, deck + 0.04, x - 0.07, deck + 0.045, 2);
}

/** こんごう型: the SPY-1 block forward with the lattice tripod mast on it, two funnels, an open quarterdeck */
const drawKongo: Draw = (c, w, h) => {
  const deck = 0.19;
  destroyerHull(c, w, h, deck);
  gun(c, w, h, 0.15, deck + 0.03);
  // the bridge and the big block of the phased-array panels
  fill(c, w, h, HAZE_LIGHT, [[0.26, deck], [0.26, 0.33], [0.29, 0.37], [0.29, 0.43], [0.33, 0.47], [0.45, 0.47], [0.47, 0.41], [0.47, deck]]);
  fill(c, w, h, HAZE_DARK, [[0.355, 0.30], [0.37, 0.27], [0.4, 0.27], [0.415, 0.30], [0.4, 0.33], [0.37, 0.33]]);
  // the lattice tripod and its yards
  fill(c, w, h, HAZE_GREY, [[0.345, 0.47], [0.375, 0.97], [0.385, 0.97], [0.425, 0.47]]);
  for (const y of [0.56, 0.66, 0.76, 0.86]) line(c, w, h, HAZE_LIGHT, 0.36, y, 0.41, y);
  line(c, w, h, HAZE_DARK, 0.34, 0.8, 0.43, 0.8, 2);
  line(c, w, h, HAZE_DARK, 0.38, 0.97, 0.38, 1.0);
  // the funnels and the deckhouse between them
  rect(c, w, h, HAZE_GREY, 0.47, 0.8, deck, 0.3);
  fill(c, w, h, HAZE_LIGHT, [[0.5, 0.3], [0.505, 0.41], [0.565, 0.41], [0.575, 0.3]]);
  fill(c, w, h, HAZE_LIGHT, [[0.63, 0.3], [0.635, 0.4], [0.695, 0.4], [0.705, 0.3]]);
  rect(c, w, h, BOOT, 0.51, 0.56, 0.405, 0.41);
  rect(c, w, h, BOOT, 0.64, 0.69, 0.395, 0.4);
  // the after mast and a whip or two
  line(c, w, h, HAZE_DARK, 0.73, 0.3, 0.735, 0.56, 2);
  line(c, w, h, HAZE_DARK, 0.6, 0.3, 0.6, 0.52);
};

/** あたご／まや型: the same block with a pole mast on it, a hangar aft for the helicopter, the flight deck behind */
const drawAtago: Draw = (c, w, h) => {
  const deck = 0.18;
  destroyerHull(c, w, h, deck);
  gun(c, w, h, 0.14, deck + 0.03);
  fill(c, w, h, HAZE_LIGHT, [[0.25, deck], [0.25, 0.32], [0.28, 0.36], [0.28, 0.42], [0.32, 0.46], [0.44, 0.46], [0.46, 0.4], [0.46, deck]]);
  fill(c, w, h, HAZE_DARK, [[0.345, 0.29], [0.36, 0.26], [0.39, 0.26], [0.405, 0.29], [0.39, 0.32], [0.36, 0.32]]);
  // the pole mast, raked aft, with its platforms and yards
  fill(c, w, h, HAZE_GREY, [[0.355, 0.46], [0.385, 0.9], [0.392, 0.9], [0.405, 0.46]]);
  line(c, w, h, HAZE_DARK, 0.388, 0.9, 0.396, 1.0);
  for (const [y, half] of [[0.66, 0.035], [0.78, 0.025], [0.87, 0.018]] as const) line(c, w, h, HAZE_DARK, 0.385 - half, y, 0.385 + half, y, 2);
  rect(c, w, h, HAZE_GREY, 0.46, 0.66, deck, 0.29);
  fill(c, w, h, HAZE_LIGHT, [[0.49, 0.29], [0.495, 0.4], [0.555, 0.4], [0.565, 0.29]]);
  fill(c, w, h, HAZE_LIGHT, [[0.6, 0.29], [0.605, 0.39], [0.66, 0.39], [0.67, 0.29]]);
  rect(c, w, h, BOOT, 0.5, 0.55, 0.395, 0.4);
  rect(c, w, h, BOOT, 0.61, 0.655, 0.385, 0.39);
  // the hangar, then the open flight deck to the stern
  fill(c, w, h, HAZE_LIGHT, [[0.66, deck], [0.66, 0.31], [0.68, 0.33], [0.79, 0.33], [0.8, deck]]);
  line(c, w, h, HAZE_DARK, 0.7, 0.33, 0.705, 0.56, 2);
  line(c, w, h, HAZE_DARK, 0.57, 0.29, 0.57, 0.5);
};

/** もがみ型 FFM: a smooth stealthy slab, the one tall integrated mast, the hangar and a long flight deck aft */
const drawMogami: Draw = (c, w, h) => {
  const light = '#a9afb4', mid = '#959ba0';
  // high, flat-sided hull
  fill(c, w, h, mid, [[0, 0.29], [0.2, 0.26], [0.85, 0.24], [1, 0.24], [0.995, 0.03], [0.05, 0.0]]);
  rect(c, w, h, BOOT, 0.04, 0.995, 0, 0.025);
  // the stealth gun house and its barrel
  fill(c, w, h, light, [[0.11, 0.27], [0.12, 0.32], [0.16, 0.32], [0.17, 0.265]]);
  line(c, w, h, HAZE_DARK, 0.12, 0.305, 0.07, 0.31, 2);
  // one long smooth superstructure, raked at the front, the hangar at its after end
  fill(c, w, h, light, [[0.24, 0.26], [0.29, 0.4], [0.7, 0.4], [0.72, 0.36], [0.76, 0.36], [0.77, 0.24]]);
  // the integrated mast (UNICORN): a tall tapering tower, the OPY-2 faces on it, the round NORA-50 on top
  fill(c, w, h, light, [[0.33, 0.4], [0.37, 0.84], [0.405, 0.84], [0.44, 0.4]]);
  rect(c, w, h, '#878d92', 0.375, 0.4, 0.55, 0.6);
  rect(c, w, h, '#878d92', 0.38, 0.395, 0.66, 0.7);
  rect(c, w, h, light, 0.381, 0.394, 0.84, 1.0);
  // whip antennas amidships
  for (const x of [0.5, 0.53, 0.56, 0.6]) line(c, w, h, HAZE_DARK, x, 0.4, x + 0.004, 0.56);
};

/** the nuclear carrier (ニミッツ級, as at 横須賀): the long flight deck overhanging the hull, the island aft of
 * midships with its mast, a second mast behind, aircraft parked along the deck edge */
const drawCarrier: Draw = (c, w, h) => {
  const hull = '#71767b', deckCol = '#50545a', island = '#7d8287', deck = 0.3;
  fill(c, w, h, hull, [[0, deck], [1, deck], [0.985, 0.06], [0.97, 0.0], [0.07, 0.0], [0.02, 0.12]]);
  rect(c, w, h, BOOT, 0.06, 0.975, 0, 0.025);
  // the flight deck's edge, the sponsons and the elevator openings
  rect(c, w, h, deckCol, 0, 1, deck - 0.025, deck);
  for (const [x0, x1] of [[0.38, 0.44], [0.52, 0.57], [0.8, 0.86]] as const) rect(c, w, h, '#5c6065', x0, x1, 0.15, deck - 0.03);
  for (const x of [0.1, 0.23, 0.9]) rect(c, w, h, '#63676c', x, x + 0.03, deck - 0.08, deck - 0.025);
  // aircraft parked along the deck: small irregular humps
  for (let x = 0.03; x < 0.97; x += 0.012 + rnd() * 0.02) {
    if (x > 0.62 && x < 0.73) continue;
    if (rnd() < 0.35) continue;
    const ht = 0.025 + rnd() * 0.03;
    fill(c, w, h, '#62666b', [[x, deck], [x + 0.004, deck + ht], [x + 0.012, deck + ht * 0.8], [x + 0.016, deck]]);
  }
  // the island: the lower block, the bridge above, the big mast with its yards and dome
  rect(c, w, h, island, 0.63, 0.7, deck, 0.6);
  rect(c, w, h, island, 0.635, 0.69, 0.6, 0.7);
  rect(c, w, h, '#2f3235', 0.636, 0.689, 0.655, 0.67);
  fill(c, w, h, island, [[0.65, 0.7], [0.66, 0.97], [0.668, 0.97], [0.678, 0.7]]);
  for (const [y, half] of [[0.78, 0.022], [0.87, 0.016], [0.94, 0.01]] as const) line(c, w, h, '#4b4f53', 0.664 - half, y, 0.664 + half, y, 2);
  line(c, w, h, '#4b4f53', 0.664, 0.97, 0.664, 1.0);
  // the second, lattice mast aft of the island
  fill(c, w, h, island, [[0.755, deck], [0.765, 0.66], [0.772, 0.66], [0.785, deck]]);
  line(c, w, h, '#4b4f53', 0.75, 0.6, 0.79, 0.6, 2);
  // a crane on the deck forward of the island
  line(c, w, h, '#4b4f53', 0.56, deck, 0.585, deck + 0.12, 2);
};

interface ShipKind { key: string; len: number; tall: number; draw: Draw }

export function buildHashirimizuSkyline(ship: ShipPlane, ships: ShipMark[]): void {
  // ---- ships in the 浦賀水道: inbound to Tokyo close to this shore (moving north), outbound further out
  const merchants: ShipKind[] = [
    { key: 'container', len: 300, tall: 50, draw: (c, w, h) => { // a container ship: boxes in rows, the bridge aft
      c.fillStyle = '#3a3c40'; c.beginPath(); c.moveTo(0, h * 0.62); c.lineTo(w, h * 0.62); c.lineTo(w * 0.97, h); c.lineTo(w * 0.04, h); c.closePath(); c.fill();
      for (let x = w * 0.12; x < w * 0.84; x += w * 0.035) { c.fillStyle = ['#8a4a3a', '#3f5a74', '#9a9a92', '#5b6b4a', '#a07a3a'][Math.floor(rnd() * 5)]; c.fillRect(x, h * (0.3 + rnd() * 0.12), w * 0.032, h * 0.33); }
      c.fillStyle = '#e8e8e4'; c.fillRect(w * 0.86, h * 0.08, w * 0.07, h * 0.55);
    } },
    { key: 'tanker', len: 240, tall: 32, draw: (c, w, h) => { // a tanker: long and low, the bridge aft
      c.fillStyle = '#4a2e2a'; c.fillRect(0, h * 0.62, w, h * 0.38);
      c.fillStyle = '#2f3134'; c.fillRect(0, h * 0.55, w, h * 0.1);
      c.fillStyle = '#ecebe6'; c.fillRect(w * 0.84, h * 0.08, w * 0.09, h * 0.5);
      c.fillStyle = '#8a8a86'; c.fillRect(w * 0.88, h * 0.0, w * 0.015, h * 0.1);
    } },
    { key: 'carcarrier', len: 200, tall: 42, draw: (c, w, h) => { // a car carrier: one tall box
      c.fillStyle = '#e6e6e2'; c.beginPath(); c.moveTo(w * 0.03, h * 0.08); c.lineTo(w * 0.98, h * 0.08); c.lineTo(w, h * 0.85); c.lineTo(0, h * 0.85); c.closePath(); c.fill();
      c.fillStyle = '#3a3c40'; c.fillRect(0, h * 0.85, w, h * 0.15);
    } },
    { key: 'ferry', len: 80, tall: 22, draw: (c, w, h) => { // the 久里浜–金谷 ferry: white, two decks, a blue band
      c.fillStyle = '#f0f0ec'; c.fillRect(w * 0.05, h * 0.35, w * 0.9, h * 0.5);
      c.fillRect(w * 0.25, h * 0.1, w * 0.5, h * 0.3);
      c.fillStyle = '#2f5c9a'; c.fillRect(w * 0.05, h * 0.7, w * 0.9, h * 0.08);
      c.fillStyle = '#3a3c40'; c.fillRect(0, h * 0.85, w, h * 0.15);
    } },
  ];
  // (lengths and heights to the masthead: こんごう 161 m, あたご／まや 165–170 m, もがみ 133 m, the carrier 333 m)
  const escorts: ShipKind[] = [
    { key: 'kongo', len: 161, tall: 46, draw: drawKongo },
    { key: 'atago', len: 168, tall: 48, draw: drawAtago },
    { key: 'mogami', len: 133, tall: 40, draw: drawMogami },
  ];
  const carrier: ShipKind = { key: 'carrier', len: 333, tall: 66, draw: drawCarrier };
  const lanes: { kind: number; km: number; b0: number; kn: number; escorts: boolean; carrier: boolean }[] = [
    // knots: + southbound / outbound, - northbound / inbound; the warships use the lanes like everyone else, the
    // carrier only the inbound ones close in (it comes and goes from 横須賀, just up the coast)
    { kind: 0, km: 3.0, b0: 120, kn: -15, escorts: true, carrier: true },
    { kind: 1, km: 3.4, b0: 60, kn: -12, escorts: true, carrier: true },
    { kind: 2, km: 5.5, b0: 95, kn: 14, escorts: true, carrier: false },
    { kind: 3, km: 4.2, b0: 140, kn: 11, escorts: false, carrier: false },
    { kind: 1, km: 6.0, b0: 40, kn: 13, escorts: true, carrier: false },
  ];
  const base = new Color(0.32, 0.34, 0.38);
  lanes.forEach((lane, li) => {
    const fleet = [merchants[lane.kind], ...(lane.escorts ? escorts : []), ...(lane.carrier ? [carrier] : [])];
    const meshes = fleet.map((k) => {
      const wdeg = (k.len / (lane.km * 1000)) / DEG, hdeg = (k.tall / (lane.km * 1000)) / DEG;
      const cw = k === carrier ? 768 : 512;
      const mesh = ship(k.key, lane.b0, ang(wdeg), ang(hdeg * 1.3), FOOT, cw, Math.max(32, Math.round(cw * hdeg / wdeg)), k.draw, base, 0.45);
      mesh.visible = false;
      return mesh;
    });
    const nEscort = lane.escorts ? escorts.length : 0;
    const pick = (n: number): number => {
      const u = passHash(li, n);
      if (lane.carrier && u < NAVY_ODDS.carrier) return fleet.length - 1;
      if (nEscort && u < (lane.carrier ? NAVY_ODDS.carrier : 0) + NAVY_ODDS.escort) return 1 + Math.min(nEscort - 1, Math.floor(passHash(li, n, 1) * nEscort));
      return 0;
    };
    // the angular speed of a ship at that distance across the line of sight
    const degPerSec = ((lane.kn * 0.514) / (lane.km * 1000)) / DEG;
    ships.push({ meshes, pick, bearing0: lane.b0, degPerSec, sector: [22, 168] });
  });
}
