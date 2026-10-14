import { Rng } from '../core/Rng';
import type { Substrate } from '../data/schemas';
import type { TerrainGrid } from './Terrain';

/**
 * アカエイの昼寝跡 / 食痕: the oval hollow a stingray leaves where it settled and blew the sand out from under
 * itself hunting clams. A bowl 10–18 cm deep with a low rim of pushed-out sand, crushed アサリ shell in the
 * middle, sometimes a groove where the tail lay. When the tide is out each one is a small pool.
 *
 * The shape is analytic (`pitShape`), so the ground under a pit is exact at any scale: the coarse terrain grid
 * only gets a rough depression (hidden under a fine patch mesh), and `Terrain.heightAt` adds the true shape.
 */
export interface FeedingPit {
  id: number;
  x: number;
  z: number;
  /** semi-axes (m): along the body and across it */
  a: number;
  b: number;
  /** heading of the long axis (rad) */
  rot: number;
  /** the larger semi-axis, for callers that only need a radius */
  r: number;
  /** depth at the centre (m) */
  depth: number;
  /** height of the pushed-out rim above the flat (m) */
  rimH: number;
  /** the undisturbed ground level */
  rim: number;
  /** tail groove: length (0 = none) and heading */
  tailLen: number;
  tailDir: number;
  /** how far from the centre the shape reaches (m) */
  reach: number;
}

const TAIL_HALF_W = 0.1;

/** Height change (m) the pit makes at a point: negative in the bowl and the tail groove, positive on the rim. */
export function pitShape(pit: FeedingPit, x: number, z: number): number {
  const dx = x - pit.x, dz = z - pit.z;
  if (Math.abs(dx) > pit.reach || Math.abs(dz) > pit.reach) return 0;
  const cosR = Math.cos(pit.rot), sinR = Math.sin(pit.rot);
  const u = dx * cosR + dz * sinR, v = -dx * sinR + dz * cosR;
  const d = Math.hypot(u / pit.a, v / pit.b);
  let dh = 0;
  if (d < 1) dh -= pit.depth * Math.pow(1 - d * d, 1.25);
  let rimBump = 0;
  if (d < 1.7) { const t = (d - 1.14) / 0.14; rimBump = pit.rimH * Math.exp(-t * t); }
  dh += rimBump;
  if (pit.tailLen > 0) {
    // the tail's groove: widest where it leaves the bowl (cutting through the rim), narrowing and fading along its length
    const tx = Math.cos(pit.tailDir), tz = Math.sin(pit.tailDir);
    const along = dx * tx + dz * tz, across = -dx * tz + dz * tx;
    const edge = Math.max(pit.a, pit.b) * 0.9;
    if (along > edge && along < edge + pit.tailLen) {
      const f = 1 - (along - edge) / pit.tailLen, hw = TAIL_HALF_W * (0.55 + 0.45 * f);
      const wv = 1 - (across / hw) ** 2;
      if (wv > 0) dh -= rimBump * wv * 0.9 + 0.028 * wv * Math.pow(f, 0.7);
    }
  }
  return dh;
}

/** 0..1: how far inside the dug bowl (or groove) a point is — the sediment there is darker and unrippled. */
export function pitMaskAt(pit: FeedingPit, x: number, z: number): number {
  const dx = x - pit.x, dz = z - pit.z;
  if (Math.abs(dx) > pit.reach || Math.abs(dz) > pit.reach) return 0;
  const cosR = Math.cos(pit.rot), sinR = Math.sin(pit.rot);
  const u = dx * cosR + dz * sinR, v = -dx * sinR + dz * cosR;
  const d = Math.hypot(u / pit.a, v / pit.b);
  let m = d < 1 ? Math.min(1, (1 - d) / 0.3) : 0;
  if (pit.tailLen > 0) {
    const tx = Math.cos(pit.tailDir), tz = Math.sin(pit.tailDir);
    const along = dx * tx + dz * tz, across = -dx * tz + dz * tx;
    const edge = Math.max(pit.a, pit.b) * 0.9;
    if (along > edge && along < edge + pit.tailLen) {
      const f = 1 - (along - edge) / pit.tailLen, hw = TAIL_HALF_W * (0.55 + 0.45 * f);
      m = Math.max(m, 0.22 * Math.max(0, 1 - (across / hw) ** 2) * f);
    }
  }
  return m;
}

/**
 * Choose where the rays lay last night: clusters of 3–9 on sandy and muddy-sand parts of the intertidal flat,
 * deterministic for a seed — a seed per day means fresh marks on every visit.
 */
/** `opts`: a map's own say: how many clusters, how many pits in each, how far they spread, and where they may be. */
export function placeFeedingPits(grid: TerrainGrid, palette: Substrate[], seed: number, clusters = 56, opts: { ok?(x: number, z: number): boolean; perCluster?: readonly [number, number]; spread?: number; margin?: number } = {}): FeedingPit[] {
  const rng = new Rng(seed);
  const n = grid.n, half = grid.size / 2, cell = grid.size / (n - 1);
  const h = grid.heights, sub = grid.substrate;
  const idx = (x: number, z: number) => {
    const i = Math.round((x + half) / cell), j = Math.round((z + half) / cell);
    return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i;
  };
  const pits: FeedingPit[] = [];
  const okHere = (x: number, z: number): boolean => {
    const k = idx(x, z);
    if (k < 0) return false;
    const s = palette[sub[k]];
    if (s !== 'sand' && s !== 'muddy_sand') return false;
    const y = h[k];
    if (opts.ok ? !opts.ok(x, z) : y < -1.3 || y > -0.15) return false;
    // flat ground only: no pits on the slopes of channels or the bar
    const kx = idx(x + cell * 2, z), kz = idx(x, z + cell * 2);
    if (kx < 0 || kz < 0 || Math.abs(h[kx] - y) > 0.06 || Math.abs(h[kz] - y) > 0.06) return false;
    return true;
  };
  for (let c = 0; c < clusters; c++) {
    let cx = 0, cz = 0, found = false;
    for (let tries = 0; tries < 40 && !found; tries++) {
      cx = rng.range(-half + (opts.margin ?? 12), half - (opts.margin ?? 12));
      cz = rng.range(-half + (opts.margin ?? 12), half - (opts.margin ?? 12));
      found = okHere(cx, cz);
    }
    if (!found) continue;
    const count = rng.int(opts.perCluster?.[0] ?? 3, opts.perCluster?.[1] ?? 9);
    const spread = opts.spread ?? 8;
    for (let p = 0; p < count; p++) {
      const x = cx + rng.range(-spread, spread), z = cz + rng.range(-spread, spread);
      if (!okHere(x, z)) continue;
      if (pits.some((q) => Math.hypot(q.x - x, q.z - z) < q.reach + 1.6)) continue;
      const a = rng.range(0.45, 0.75), b = a * rng.range(0.66, 0.9), rot = rng.range(0, Math.PI);
      const depth = rng.range(0.1, 0.18), rimH = rng.range(0.012, 0.022);
      const tailLen = rng.chance(0.55) ? rng.range(0.5, 1.0) : 0;
      const tailDir = rot + Math.PI * (rng.chance(0.5) ? 0 : 1) + rng.range(-0.3, 0.3);
      const reach = Math.max(a, b) * 1.75 + tailLen;
      pits.push({ id: pits.length, x, z, a, b, rot, r: Math.max(a, b), depth, rimH, rim: h[idx(x, z)], tailLen, tailDir, reach });
    }
  }
  return pits;
}

/**
 * Press the pits into the coarse grid: the true shape, plus a good margin more inside the bowl, because the
 * coarse mesh's straight edges would otherwise cut above the curved bowl and show through the fine patch.
 * The margin tapers to nothing by the patch's border so the two meet. The habitat reads this grid, so each pit
 * is a hollow that fills with water up to its rim. Returns the 0..1 dug mask per vertex for the coarse shading.
 */
export function carveCoarse(grid: TerrainGrid, pits: FeedingPit[]): Float32Array {
  const n = grid.n, half = grid.size / 2, cell = grid.size / (n - 1);
  const h = grid.heights;
  const mask = new Float32Array(n * n);
  for (const pit of pits) {
    const ci = Math.round((pit.x + half) / cell), cj = Math.round((pit.z + half) / cell), span = Math.ceil(pit.reach / cell) + 1;
    for (let j = cj - span; j <= cj + span; j++) for (let i = ci - span; i <= ci + span; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const x = -half + i * cell, z = -half + j * cell, k = j * n + i;
      const dh = pitShape(pit, x, z);
      const m = pitMaskAt(pit, x, z);
      const cosR = Math.cos(pit.rot), sinR = Math.sin(pit.rot);
      const u = (x - pit.x) * cosR + (z - pit.z) * sinR, v = -(x - pit.x) * sinR + (z - pit.z) * cosR;
      const d = Math.hypot(u / pit.a, v / pit.b);
      h[k] += dh - (0.03 + 0.8 * pit.depth) * Math.max(0, 1 - d / 1.6);
      mask[k] = Math.max(mask[k], m);
    }
  }
  return mask;
}
