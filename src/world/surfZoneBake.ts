/**
 * The surf zone's bake as plain arrays (no three.js), so the same code runs on the main thread and in the worker
 * (surfZone.worker.ts). See SurfZone for what it makes and why.
 */
import { phaseSpeed } from './surfPhysics';

/** the terrain, and the shore's own frame laid over it (s seaward, y along the shore, one cell apart) */
export interface BakeFrame {
  n: number; half: number; cell: number;
  /** unit seaward direction (world x, z) */
  dx: number; dy: number;
  ns: number; ny: number; s0: number; y0: number;
  /** the ground in the shore frame */
  g: Float32Array;
}

/** one level's bake, on the terrain grid */
export interface LevelBake {
  level: number;
  /** arrival time (s) from the outer edge; on the beach, that of the waterline below */
  t: Float32Array;
  /** 1 open water .. 0 behind a rock */
  sh: Float32Array;
  /** where the waves strike a rock or a wall face (0..1) */
  imp: Float32Array;
  /** mean depth along the outer edge (m) and the waves' speed there (m/s) */
  edgeDepth: number; edgeSpeed: number;
}

const INF = 1e9;
const SEA = 1, LAND = 2, ROCK = 3;

export function groundAt(heights: Float32Array, n: number, half: number, cell: number, x: number, z: number): number {
  const gx = Math.max(0, Math.min(n - 1.001, (x + half) / cell));
  const gz = Math.max(0, Math.min(n - 1.001, (z + half) / cell));
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, h = heights;
  return (h[j * n + i] * (1 - fx) + h[j * n + i + 1] * fx) * (1 - fz) + (h[(j + 1) * n + i] * (1 - fx) + h[(j + 1) * n + i + 1] * fx) * fz;
}

export function makeFrame(heights: Float32Array, n: number, size: number, seaward: readonly [number, number]): BakeFrame {
  const half = size / 2, cell = size / (n - 1);
  const len = Math.hypot(seaward[0], seaward[1]) || 1;
  const dx = seaward[0] / len, dy = seaward[1] / len;
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, z]) => [x * dx + z * dy, -x * dy + z * dx]);
  const s0 = Math.min(...corners.map((c) => c[0])), s1 = Math.max(...corners.map((c) => c[0]));
  const y0 = Math.min(...corners.map((c) => c[1])), y1 = Math.max(...corners.map((c) => c[1]));
  const ns = Math.round((s1 - s0) / cell) + 1, ny = Math.round((y1 - y0) / cell) + 1;
  const g = new Float32Array(ns * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < ns; i++) {
    const s = s0 + i * cell, y = y0 + j * cell;
    g[j * ns + i] = groundAt(heights, n, half, cell, s * dx - y * dy, s * dy + y * dx);
  }
  return { n, half, cell, dx, dy, ns, ny, s0, y0, g };
}

/** level-independent: the highest ground crossed on the way in (a bar) and the seaward bed slope, on the terrain grid */
export function bakeStatic(f: BakeFrame, heights: Float32Array): { gmax: Float32Array; slope: Float32Array } {
  const { ns, ny, g, n, cell, dx, dy } = f;
  const gmaxR = new Float32Array(ns * ny);
  for (let j = 0; j < ny; j++) {
    let m = -INF;
    for (let i = ns - 1; i >= 0; i--) { const k = j * ns + i; gmaxR[k] = m; m = Math.max(m, g[k]); }
  }
  const raw = new Float32Array(n * n), h = heights;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const l = h[j * n + Math.max(0, i - 1)], r = h[j * n + Math.min(n - 1, i + 1)];
    const d = h[Math.max(0, j - 1) * n + i], u = h[Math.min(n - 1, j + 1) * n + i];
    raw[j * n + i] = -(((r - l) / (2 * cell)) * dx + ((u - d) / (2 * cell)) * dy);
  }
  // (spread along the shore over a metre or two: a bar or a ledge breaks the waves behind it, and its edge in the lee is
  // never a sharp line)
  const gmaxS = blurY(blurY(gmaxR, ns, ny, 5), ns, ny, 5);
  return { gmax: toTerrain(f, gmaxS), slope: blur(raw, n, n, 3) };
}

/**
 * One level: which cells are the sea (wet and joined to the outer edge), the land (joined to the landward edge) and
 * rocks (dry islands); the arrival time swept in from the outer edge (straight or diagonal steps, then relaxed along
 * the shore, so the lee of a rock is reached from its sides); the shelter (the straight shadow of the rocks, blurred
 * along the shore by the Fresnel width of each step); and the faces the waves strike.
 */
export function bakeLevel(f: BakeFrame, level: number, period: number): LevelBake {
  const { ns, ny, g, cell } = f;
  const M = ns * ny, T = period;
  const cls = new Uint8Array(M);
  const stack: number[] = [];
  for (let j = 0; j < ny; j++) { const k = j * ns + ns - 1; if (g[k] < level) { cls[k] = SEA; stack.push(k); } }
  flood(stack, cls, ns, ny, (k) => cls[k] === 0 && g[k] < level, SEA);
  for (let j = 0; j < ny; j++) { const k = j * ns; if (cls[k] === 0) { cls[k] = LAND; stack.push(k); } }
  flood(stack, cls, ns, ny, (k) => cls[k] === 0, LAND);
  for (let k = 0; k < M; k++) if (cls[k] === 0) cls[k] = ROCK;
  const c = new Float32Array(M);
  for (let k = 0; k < M; k++) c[k] = cls[k] === SEA ? phaseSpeed(T, Math.max(level - g[k], 0.03)) : 0;
  const t = new Float32Array(M).fill(INF), sh = new Float32Array(M), imp = new Float32Array(M);
  const d2 = cell * Math.SQRT2;
  const row = new Float32Array(ny), w = new Float32Array(ny);
  for (let j = 0; j < ny; j++) { const k = j * ns + ns - 1; if (cls[k] === SEA) { t[k] = 0; sh[k] = 1; } }
  // the eikonal's upwind update from the seaward neighbour (a) and one along the shore (b): ((T−a)/h)² + ((T−b)/h)² =
  // 1/c², the first-order (Godunov) solution, so the fronts come out smooth instead of kinked in 45° steps
  const relax = (i: number, j: number, jp: number) => {
    const k = j * ns + i, q = jp * ns + i;
    if (cls[k] !== SEA || cls[q] !== SEA || t[q] >= INF) return;
    const up = k + 1, a = cls[up] === SEA ? t[up] : INF, b = t[q];
    const hc = cell / c[k];
    let v: number;
    if (a >= INF || Math.abs(a - b) >= hc) v = Math.min(a, b) + hc;
    else v = 0.5 * (a + b + Math.sqrt(2 * hc * hc - (a - b) * (a - b)));
    if (v < t[k]) t[k] = v;
  };
  for (let i = ns - 2; i >= 0; i--) {
    for (let j = 0; j < ny; j++) {
      const k = j * ns + i, kc = cls[k];
      if (kc === ROCK) continue;
      const up = k + 1, qa = j > 0 ? up - ns : -1, qb = j < ny - 1 ? up + ns : -1;
      if (kc === SEA) {
        // straight on from the row before (the diagonals only where that is blocked: the lateral sweeps below do the rest)
        let best = INF;
        if (cls[up] === SEA && t[up] < INF) best = t[up] + cell / c[k];
        else {
          if (qa >= 0 && cls[qa] === SEA && t[qa] < INF) best = Math.min(best, t[qa] + d2 / c[k]);
          if (qb >= 0 && cls[qb] === SEA && t[qb] < INF) best = Math.min(best, t[qb] + d2 / c[k]);
        }
        t[k] = best;
      } else {
        // the beach: the time of the waterline straight below it (or beside it, past a rock)
        if (cls[up] !== ROCK && t[up] < INF) t[k] = t[up];
        else t[k] = Math.min(qa >= 0 && cls[qa] !== ROCK ? t[qa] : INF, qb >= 0 && cls[qb] !== ROCK ? t[qb] : INF);
        sh[k] = cls[up] === ROCK ? 0 : sh[up];
      }
    }
    // round obstacles: the sea reached from beside, along the shore, both ways (twice, so a lee fills from both sides)
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 1; j < ny; j++) relax(i, j, j - 1);
      for (let j = ny - 2; j >= 0; j--) relax(i, j, j + 1);
    }
    // shelter: the row behind, blurred along the shore (rocks block, the land is not counted). A row with nothing in
    // the way stays open: the blur is only worked where there is a shadow to spread.
    let open = true;
    for (let j = 0; j < ny; j++) {
      const q = j * ns + i + 1;
      row[j] = cls[q] === SEA ? sh[q] : 0; w[j] = cls[q] === LAND ? 0 : 1;
      if (w[j] > 0 && row[j] < 0.9999) open = false;
    }
    if (open) { for (let j = 0; j < ny; j++) { const k = j * ns + i; if (cls[k] === SEA) sh[k] = 1; } continue; }
    for (let j = 0; j < ny; j++) {
      const k = j * ns + i;
      if (cls[k] !== SEA) continue;
      const ker = gaussKernel(Math.sqrt((c[k] * T * cell) / (2 * Math.PI)) / cell);   // (σ in cells)
      const R = (ker.length - 1) / 2;
      let acc = 0, wsum = 0;
      for (let o = -R; o <= R; o++) {
        const jj = j + o < 0 ? 0 : j + o >= ny ? ny - 1 : j + o;
        const ww = ker[o + R] * w[jj];
        acc += ww * row[jj]; wsum += ww;
      }
      sh[k] = wsum > 0 ? acc / wsum : 0;
    }
  }
  // (cells nothing reached take the latest time about)
  let tMax = 0;
  for (let k = 0; k < M; k++) if (t[k] < INF && t[k] > tMax) tMax = t[k];
  for (let k = 0; k < M; k++) if (t[k] >= INF) t[k] = tMax;
  // where the waves strike: a rock, or a steep land face (a wall), with open sea in front of it
  for (let j = 0; j < ny; j++) for (let i = 0; i < ns - 1; i++) {
    const k = j * ns + i, q = k + 1;
    if (cls[k] === SEA || cls[q] !== SEA) continue;
    const steep = (g[k] - g[q]) / cell;
    const face = cls[k] === ROCK ? Math.max(0.6, Math.min(1, steep * 2)) : Math.max(0, Math.min(1, (steep - 0.25) / 0.4));
    imp[k] = Math.max(imp[k], sh[q] * face);
    imp[q] = Math.max(imp[q], sh[q] * face * 0.8);
  }
  let edgeD = 0, edgeN = 0;
  for (let j = 0; j < ny; j++) { const k = j * ns + ns - 1; if (cls[k] === SEA) { edgeD += level - g[k]; edgeN++; } }
  const edgeDepth = edgeN ? edgeD / edgeN : 3;
  return {
    level, t: toTerrain(f, t), sh: toTerrain(f, sh),
    // (spread over the water in front, half a metre or so, without diluting the strike)
    imp: toTerrain(f, blur(dilate(imp, ns, ny, 2), ns, ny, 1)),
    edgeDepth, edgeSpeed: phaseSpeed(T, edgeDepth),
  };
}

/** a shore-frame array resampled onto the terrain grid */
function toTerrain(f: BakeFrame, arr: Float32Array): Float32Array {
  const { n, half, cell, dx, dy, ns, ny, s0, y0 } = f;
  const out = new Float32Array(n * n);
  for (let jz = 0; jz < n; jz++) for (let ix = 0; ix < n; ix++) {
    const x = -half + ix * cell, z = -half + jz * cell;
    const si = Math.max(0, Math.min(ns - 1.001, (x * dx + z * dy - s0) / cell));
    const yj = Math.max(0, Math.min(ny - 1.001, (-x * dy + z * dx - y0) / cell));
    const i0 = Math.floor(si), j0 = Math.floor(yj), fx = si - i0, fz = yj - j0;
    out[jz * n + ix] = (arr[j0 * ns + i0] * (1 - fx) + arr[j0 * ns + i0 + 1] * fx) * (1 - fz) + (arr[(j0 + 1) * ns + i0] * (1 - fx) + arr[(j0 + 1) * ns + i0 + 1] * fx) * fz;
  }
  return out;
}

function flood(stack: number[], cls: Uint8Array, ns: number, ny: number, ok: (k: number) => boolean, mark: number): void {
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % ns, j = (k - i) / ns;
    if (i > 0 && ok(k - 1)) { cls[k - 1] = mark; stack.push(k - 1); }
    if (i < ns - 1 && ok(k + 1)) { cls[k + 1] = mark; stack.push(k + 1); }
    if (j > 0 && ok(k - ns)) { cls[k - ns] = mark; stack.push(k - ns); }
    if (j < ny - 1 && ok(k + ns)) { cls[k + ns] = mark; stack.push(k + ns); }
  }
}

const kernels = new Map<number, Float32Array>();
/** a Gaussian of σ cells (σ quantised to a quarter cell; at most 12 cells either side) */
function gaussKernel(sigma: number): Float32Array {
  const key = Math.max(1, Math.round(sigma * 4));
  let k = kernels.get(key);
  if (!k) {
    const sg = key / 4, R = Math.min(12, Math.ceil(2.5 * sg));
    k = new Float32Array(2 * R + 1);
    for (let o = -R; o <= R; o++) k[o + R] = Math.exp(-(o * o) / (2 * sg * sg));
    kernels.set(key, k);
  }
  return k;
}

/** the largest value within r cells (separable) */
function dilate(src: Float32Array, ns: number, ny: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let j = 0; j < ny; j++) for (let i = 0; i < ns; i++) {
    let m = 0;
    for (let o = -r; o <= r; o++) { const ii = i + o; if (ii >= 0 && ii < ns) m = Math.max(m, src[j * ns + ii]); }
    tmp[j * ns + i] = m;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < ns; i++) {
    let m = 0;
    for (let o = -r; o <= r; o++) { const jj = j + o; if (jj >= 0 && jj < ny) m = Math.max(m, tmp[jj * ns + i]); }
    out[j * ns + i] = m;
  }
  return out;
}

/** a box blur along the shore only (y), of radius r (clamped edges; the 'nothing seaward' sentinel left alone) */
function blurY(src: Float32Array, ns: number, ny: number, r: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let j = 0; j < ny; j++) for (let i = 0; i < ns; i++) {
    const k = j * ns + i;
    if (src[k] <= -INF) { out[k] = src[k]; continue; }
    let s = 0, c = 0;
    for (let o = -r; o <= r; o++) { const jj = j + o; if (jj < 0 || jj >= ny) continue; const v = src[jj * ns + i]; if (v <= -INF) continue; s += v; c++; }
    out[k] = s / c;
  }
  return out;
}

/** a separable box blur of radius r (clamped edges) */
function blur(src: Float32Array, ns: number, ny: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let j = 0; j < ny; j++) for (let i = 0; i < ns; i++) {
    let s = 0, c = 0;
    for (let o = -r; o <= r; o++) { const ii = i + o; if (ii < 0 || ii >= ns) continue; s += src[j * ns + ii]; c++; }
    tmp[j * ns + i] = s / c;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < ns; i++) {
    let s = 0, c = 0;
    for (let o = -r; o <= r; o++) { const jj = j + o; if (jj < 0 || jj >= ny) continue; s += tmp[jj * ns + i]; c++; }
    out[j * ns + i] = s / c;
  }
  return out;
}
