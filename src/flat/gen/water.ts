/**
 * Where the water stands at a given tide.
 *  - sea: everything below the tide that is connected to the open edge of the map
 *  - pools: depressions keep water up to their spill sill (priority-flood filling, Barnes et al. 2014), a few
 *    millimetres lower (seepage); slivers too small or too shallow to read as water are dropped
 *  - creeks: the ebb trickle that still runs down the creek beds
 * Plus what the shaders need around the water: the level dilated a little past each shore (the exact shore line
 * comes from the rendered ground), the level of the nearest water and the distance to it (wet sand, water left in
 * ripple troughs), and the fetch upwind over open water (how far the wind has had to build ripples).
 */
import { boxBlur, type FlatData } from './generate';

export const DRY = -100;
export const KIND_DRY = 0, KIND_POOL = 1, KIND_SEA = 2, KIND_CREEK = 3;
/** fetch at which the ripples are fully grown (m) */
export const FETCH_FULL = 60;
/** distance-to-water encoding: metres per byte step */
export const DIST_STEP = 0.1;

export interface WaterGrid {
  n: number;
  /** RG float: level of the nearest water (the surface wherever that water reaches), and the water table */
  levels: Float32Array;
  /** RGBA8: nearest water's kind * 64 + per-body variation, fetch (0…255 = 0…FETCH_FULL m), distance to water (DIST_STEP m), 0 */
  info: Uint8Array;
}

export interface WaterState {
  tide: number;
  fine: WaterGrid;
  far: WaterGrid;
  /** number of pools on the fine grid */
  pools: number;
  /** fraction of the walkable square under water */
  wetFraction: number;
}

/** Min-heap over (float key, int value) in typed arrays. */
class Heap {
  private keys: Float32Array;
  private vals: Int32Array;
  size = 0;
  constructor(cap: number) { this.keys = new Float32Array(cap); this.vals = new Int32Array(cap); }
  push(k: number, v: number): void {
    if (this.size === this.keys.length) {
      const nk = new Float32Array(this.keys.length * 2); nk.set(this.keys); this.keys = nk;
      const nv = new Int32Array(this.vals.length * 2); nv.set(this.vals); this.vals = nv;
    }
    const K = this.keys, V = this.vals;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= k) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = k; V[i] = v;
  }
  /** pops the minimum; returns its value (the key is left in `lastKey`) */
  lastKey = 0;
  pop(): number {
    const K = this.keys, V = this.vals;
    const topV = V[0];
    this.lastKey = K[0];
    const n = --this.size;
    if (n > 0) {
      const k = K[n], v = V[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && K[r] < K[l] ? r : l;
        if (K[m] >= k) break;
        K[i] = K[m]; V[i] = V[m]; i = m;
      }
      K[i] = k; V[i] = v;
    }
    return topV;
  }
}

/** Depression-filled surface with outlets on the grid edge (Priority-Flood + FIFO for flat fills). */
export function fillDepressions(H: Float32Array, n: number): Float32Array {
  const F = new Float32Array(H);
  const done = new Uint8Array(n * n);
  const heap = new Heap(n * 8);
  const fifo = new Int32Array(n * n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) {
    for (const k of [i, (n - 1) * n + i, i * n, i * n + n - 1]) if (!done[k]) { done[k] = 1; heap.push(F[k], k); }
  }
  const visit = (c: number, nb: number) => {
    if (done[nb]) return;
    done[nb] = 1;
    if (F[nb] <= F[c]) { F[nb] = F[c]; fifo[qt++] = nb; }
    else heap.push(F[nb], nb);
  };
  while (heap.size > 0 || qh < qt) {
    const c = qh < qt ? fifo[qh++] : heap.pop();
    if (qh === qt) { qh = 0; qt = 0; }
    const i = c % n, j = (c - i) / n;
    if (i > 0) visit(c, c - 1);
    if (i < n - 1) visit(c, c + 1);
    if (j > 0) visit(c, c - n);
    if (j < n - 1) visit(c, c + n);
  }
  return F;
}

/** the last high water: only hollows it flooded hold sea water now (the backshore above it stays dry) */
export const LAST_HIGH_WATER = 0.95;

function solveGrid(H: Float32Array, n: number, cell: number, tide: number, wind: [number, number], creek: Float32Array | null, walk: ((k: number) => boolean) | null): { grid: WaterGrid; pools: number; wet: number } {
  const N2 = n * n;
  const level = new Float32Array(N2).fill(DRY);
  const kind = new Uint8Array(N2);
  // ---- sea: below the tide and connected to the edge
  const stack = new Int32Array(N2);
  let sp = 0;
  for (let i = 0; i < n; i++) for (const k of [i, (n - 1) * n + i, i * n, i * n + n - 1]) if (H[k] < tide && kind[k] !== KIND_SEA) { kind[k] = KIND_SEA; stack[sp++] = k; }
  const seaVisit = (k: number) => { if (kind[k] !== KIND_SEA && H[k] < tide) { kind[k] = KIND_SEA; stack[sp++] = k; } };
  while (sp > 0) {
    const c = stack[--sp];
    level[c] = tide;
    const i = c % n, j = (c - i) / n;
    if (i > 0) seaVisit(c - 1);
    if (i < n - 1) seaVisit(c + 1);
    if (j > 0) seaVisit(c - n);
    if (j < n - 1) seaVisit(c + n);
  }
  // ---- pools: filled depressions above the tide
  const F = fillDepressions(H, n);
  const poolId = new Int32Array(N2).fill(-1);
  let pools = 0;
  const comp: number[] = [];
  for (let s = 0; s < N2; s++) {
    if (kind[s] !== KIND_DRY || poolId[s] !== -1 || F[s] - H[s] < 0.0015) continue;
    if (F[s] > LAST_HIGH_WATER) { poolId[s] = -3; continue; }
    // flood the component of equal fill level
    comp.length = 0;
    poolId[s] = -2;
    comp.push(s);
    let maxD = 0;
    const take = (k: number) => { if (poolId[k] === -1 && kind[k] === KIND_DRY && F[k] - H[k] >= 0.0015) { poolId[k] = -2; comp.push(k); } };
    for (let q = 0; q < comp.length; q++) {
      const c = comp[q];
      maxD = Math.max(maxD, F[c] - H[c]);
      const i = c % n, j = (c - i) / n;
      if (i > 0) take(c - 1);
      if (i < n - 1) take(c + 1);
      if (j > 0) take(c - n);
      if (j < n - 1) take(c + n);
    }
    const area = comp.length * cell * cell;
    // a sliver on its own (a groove one or two cells wide) does not read as a pool: a pool needs a body. (Grooves that
    // run out of a pool stay: cutting them off would leave holes in its surface.)
    let interior = 0;
    for (const c of comp) {
      const i = c % n;
      if (i > 0 && i < n - 1 && c >= n && c < N2 - n && poolId[c - 1] === -2 && poolId[c + 1] === -2 && poolId[c - n] === -2 && poolId[c + n] === -2) interior++;
    }
    const keep = area >= 0.4 && maxD >= 0.006 && interior * cell * cell >= 0.3;
    // the level sits a little under the sill: the water seeps away through the sand between tides
    const drop = Math.min(0.005, maxD * 0.22);
    const id = keep ? pools++ : -3;
    for (const c of comp) {
      poolId[c] = id;
      if (!keep) continue;
      const L = F[c] - drop;
      if (L > H[c]) { level[c] = L; kind[c] = KIND_POOL; }
    }
  }
  // ---- creeks: the ebb trickle (fine grid only), where no pool or sea already stands: a trickle running into a
  // pool joins its surface instead of standing above it in a strip
  if (creek) {
    for (let k = 0; k < N2; k++) {
      const c = creek[k];
      if (kind[k] === KIND_DRY && c > H[k] + 0.001) { level[k] = c; kind[k] = KIND_CREEK; }
    }
    // running water does not stand in steps: where two reaches touch (a meander neck, a junction, the mouth) the
    // higher one spills toward the lower, so no creek cell stands more than 2 cm per metre above a wet neighbour
    // (pools and the sea hold their levels)
    const s1 = 0.02 * cell, s2 = s1 * Math.SQRT2;
    const relax = (k: number, o: number, s: number) => { if (level[o] > DRY && level[k] > level[o] + s) level[k] = level[o] + s; };
    for (let it = 0; it < 2; it++) {
      for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
        const k = j * n + i;
        if (kind[k] !== KIND_CREEK) continue;
        relax(k, k - 1, s1); relax(k, k - n, s1); relax(k, k - n - 1, s2); relax(k, k - n + 1, s2);
      }
      for (let j = n - 2; j >= 1; j--) for (let i = n - 2; i >= 1; i--) {
        const k = j * n + i;
        if (kind[k] !== KIND_CREEK) continue;
        relax(k, k + 1, s1); relax(k, k + n, s1); relax(k, k + n + 1, s2); relax(k, k + n - 1, s2);
      }
    }
    for (let k = 0; k < N2; k++) if (kind[k] === KIND_CREEK && level[k] <= H[k] + 0.0005) { level[k] = DRY; kind[k] = KIND_DRY; }
  }
  // ---- fetch: open-water distance upwind, swept in the order the wind crosses the grid
  const fetch = new Float32Array(N2);
  const ax = Math.abs(wind[0]), az = Math.abs(wind[1]);
  const sx = wind[0] >= 0 ? 1 : -1, sz = wind[1] >= 0 ? 1 : -1;
  const step = cell / Math.max(ax, az);
  for (let jj = 0; jj < n; jj++) {
    const j = sz > 0 ? jj : n - 1 - jj;
    for (let ii = 0; ii < n; ii++) {
      const i = sx > 0 ? ii : n - 1 - ii;
      const k = j * n + i;
      if (kind[k] === KIND_DRY) continue;
      if (kind[k] === KIND_SEA) { fetch[k] = FETCH_FULL; continue; }
      const ui = i - sx, uj = j - sz;
      const fa = ui >= 0 && ui < n ? fetch[j * n + ui] : 0;
      const fb = uj >= 0 && uj < n ? fetch[uj * n + i] : 0;
      fetch[k] = Math.min(FETCH_FULL, (ax * fa + az * fb) / (ax + az) + step);
    }
  }
  // ---- nearest water level and distance (two-pass chamfer transform carrying the source level)
  const dist = new Float32Array(N2).fill(1e9);
  const near = new Float32Array(N2).fill(tide);
  const nearKind = new Uint8Array(N2).fill(KIND_SEA);
  const nearVar = new Uint8Array(N2);
  for (let k = 0; k < N2; k++) if (kind[k] !== KIND_DRY) { dist[k] = 0; near[k] = level[k]; nearKind[k] = kind[k]; nearVar[k] = poolId[k] >= 0 ? (poolId[k] * 37) & 63 : 0; }
  const d1 = cell, d2 = cell * Math.SQRT2;
  const relax = (k: number, o: number, d: number) => { const v = dist[o] + d; if (v < dist[k]) { dist[k] = v; near[k] = near[o]; nearKind[k] = nearKind[o]; nearVar[k] = nearVar[o]; } };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    if (i > 0) relax(k, k - 1, d1);
    if (j > 0) { relax(k, k - n, d1); if (i > 0) relax(k, k - n - 1, d2); if (i < n - 1) relax(k, k - n + 1, d2); }
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    const k = j * n + i;
    if (i < n - 1) relax(k, k + 1, d1);
    if (j < n - 1) { relax(k, k + n, d1); if (i < n - 1) relax(k, k + n + 1, d2); if (i > 0) relax(k, k + n - 1, d2); }
  }
  // ---- the water table under the sand: the nearest water's level close to it, and away from the water a smooth
  // blend of the levels around (the nearest-water map jumps where two bodies at different levels meet; the ground
  // water does not)
  const blurred = boxBlur(near, n, Math.max(1, Math.round(5 / cell)), 3);
  const levels = new Float32Array(N2 * 2);
  const info = new Uint8Array(N2 * 4);
  let wet = 0, walkCells = 0;
  for (let k = 0; k < N2; k++) {
    // around a shore the nearest water's level carries on over the dry ground (the shader finds the exact shore line
    // where the smooth ground rises through it); but ground lower than that level and not part of the water is a
    // hollow of its own, cut off by a sill (a dropped puddle, a groove beside a bank): no water spills into it.
    // A creek's surface slopes and the sea's swash runs, so beside those only a clearly lower hollow is cut off (a
    // millimetre would punch holes in the running water)
    const cut = nearKind[k] === KIND_POOL ? 0.0005 : 0.02;
    levels[k * 2] = dist[k] > 0 && H[k] < near[k] - cut ? DRY : near[k];
    const t = Math.min(1, Math.max(0, (dist[k] - 1) / 7));
    levels[k * 2 + 1] = near[k] + (blurred[k] - near[k]) * t * t * (3 - 2 * t);
    const kd = kind[k];
    // the kind of the nearest water (defined around every shore, so the shaders never see a blocky mask)
    info[k * 4] = nearKind[k] * 64 + nearVar[k];
    info[k * 4 + 1] = Math.round((fetch[k] / FETCH_FULL) * 255);
    info[k * 4 + 2] = Math.min(255, Math.round(dist[k] / DIST_STEP));
    if (walk && walk(k)) { walkCells++; if (kd !== KIND_DRY) wet++; }
  }
  return { grid: { n, levels, info }, pools, wet: walkCells ? wet / walkCells : 0 };
}

export function computeWater(data: FlatData, tide: number): WaterState {
  const f = data.fine, g = data.far;
  const walk = (k: number) => {
    const x = f.origin + (k % f.n) * f.cell, z = f.origin + Math.floor(k / f.n) * f.cell;
    return Math.abs(x) <= 150 && Math.abs(z) <= 150;
  };
  const fine = solveGrid(f.height, f.n, f.cell, tide, data.wind, f.creek, walk);
  const far = solveGrid(g.height, g.n, g.cell, tide, data.wind, null, null);
  return { tide, fine: fine.grid, far: far.grid, pools: fine.pools, wetFraction: fine.wet };
}
