import type { SurfUniforms } from './Surf';

/**
 * The surf's surface on the CPU: SURF_GLSL's surfAt (its height only) and the water pass's surfEta, line for line, so
 * what swims in the surf can ride the very waves that are drawn. The hashes are reckoned in single precision, as the
 * GPU does, so the noise lattice, the waves' numbers and their heights come out the same; the smooth parts in double
 * precision differ from the GPU's by far less than a millimetre.
 */

const fr = Math.fround;
const fract = (x: number): number => x - Math.floor(x);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** GLSL's smoothstep, edges in either order (the shader uses it falling, edge0 > edge1, too) */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function surfHash(n: number): number {
  let x = fract(fr(n * 0.1031));
  x = fr(x * fr(x + 33.33));
  x = fr(x * fr(x + x));
  return fract(x);
}
const surfW = (n: number): number => fract(fr(n * 0.6180339887)) * 89.0;
function surfNoise(px: number, py: number): number {
  const ix = Math.floor(px), iy = Math.floor(py);
  let fx = px - ix, fy = py - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const n = ix + iy * 57;
  return mix(mix(surfHash(n), surfHash(n + 1), fx), mix(surfHash(n + 57), surfHash(n + 58), fx), fy);
}

/** A surf: its uniforms read once per call (the debug panel and the map switch change them). */
interface Surf { H: number; T: number; slope: number; dx: number; dz: number }

function phase(s: Surf, x: number, z: number, D: number, t: number): number {
  const travel = (2 * Math.sqrt(Math.max(D, 0))) / (s.slope * 3.1321);
  const ta = t + travel;
  const y = -s.dz * x + s.dx * z;
  const bend = 1.0 * (surfNoise(y * 0.014 + ta * 0.004, 1.3) - 0.5)
    + 0.6 * (surfNoise(y * 0.055, ta * 0.045 + 5.1) - 0.5)
    + 0.2 * (surfNoise(y * 0.2, ta * 0.09 + 9.7) - 0.5);
  return ta / s.T + bend;
}

function heightAt(s: Surf, n: number, sx: number, sy: number, broad: number): number {
  return s.H * (0.55 + 0.75 * surfHash(surfW(n) * 13.7 + 0.5)) * (0.72 + 0.28 * Math.sin(n * 0.9)) * broad
    * (0.3 + 1.25 * smoothstep(0.12, 0.88, surfNoise(sy * 0.24 + surfW(n), sx * 0.07 + surfW(n))));
}
const broadAt = (sx: number, sy: number): number => 0.75 + 0.5 * surfNoise(sy * 0.06 + 3.1, sx * 0.03 + 3.1);

/** the swash sheet's height over the still level up the beach (surfSwash's x) */
function swash(s: Surf, x: number, z: number, t: number): number {
  const ph = phase(s, x, z, 0, t);
  const n = Math.floor(ph), tau = ph - n;
  const sx = s.dx * x + s.dz * z, sy = -s.dz * x + s.dx * z;
  const w = surfW(n);
  const R = 0.5 * heightAt(s, n, sx, sy, broadAt(sx, sy)) * (0.45 + 1.1 * surfNoise(x * 0.22 + w * 1.7, z * 0.22 + w * 1.7));
  const u = tau / 0.8;
  const shape = u < 0.35 ? Math.sin((u / 0.35) * 1.5707963) : u < 1 ? 1 - Math.pow((u - 0.35) / 0.65, 1.6) : 0;
  const lace = (surfNoise(x * 1.3 + w * 5.3, z * 1.3 + w * 5.3) - 0.5) * 0.5 + (surfNoise(x * 4.1 - w * 2.1, z * 4.1 - w * 2.1) - 0.5) * 0.2;
  const skin = 0.004 * (surfNoise(x * 9 + fract(t * 0.01) * 600, z * 9 + w) - 0.5);
  return R * (shape - 0.25 + lace * shape) + skin * shape;
}

/** surfProfile's x: a shoaling wave's height about the period's mean, per unit crest-to-trough height */
function profile(u: number, lean: number, q: number): number {
  const b = mix(0.5, 0.92, lean);
  const th = u < b ? (Math.PI * u) / b : Math.PI * (1 + (u - b) / (1 - b));
  const c = 0.5 + 0.5 * Math.cos(th);
  return Math.pow(c, q) - 0.56 / Math.sqrt(q + 0.25);
}

/** surfAt's x: the surface relative to the still level (m) at a point whose still-water depth is D. */
function surfAt(s: Surf, x: number, z: number, D: number, t: number): number {
  const ph = phase(s, x, z, D, t);
  const n = Math.floor(ph), u = ph - n;
  const sx = s.dx * x + s.dz * z, sy = -s.dz * x + s.dx * z;
  const broad = broadAt(sx, sy);
  const H = mix(heightAt(s, n, sx, sy, broad), heightAt(s, n + 1, sx, sy, broad), smoothstep(0.35, 0.65, u));
  const Db = H / 1.05;
  const k = smoothstep(Db, 0.78 * Db, D);
  let eta = 0;
  if (k < 1) {
    const near = smoothstep(3 * Db, Db, D);
    const A = H * Math.min(1.25, Math.max(0.8, Math.pow(0.8 / Math.max(D, 0.05), 0.25)));
    eta = A * profile(u, near, 1 + 1.2 * near);
  }
  if (k > 0) {
    let Hb = mix(0.55 * Math.max(D, 0), 0.85 * H, smoothstep(0.75 * Db, Db, D));
    const w = surfW(n) * 2.3;
    Hb *= 0.45 + 0.75 * smoothstep(0.1, 0.9, surfNoise(sy * 0.3 + w, sx * 0.05 + w));
    const fr0 = 0.08;
    let f: number;
    if (u < 1 - fr0) f = 1 - u / (1 - fr0);
    else { const v = (u - (1 - fr0)) / fr0; f = v * v * (3 - 2 * v); }
    eta = mix(eta, Hb * (f - 0.42), k);
  }
  const sw = 1 - smoothstep(0, 0.6 * Db, D);
  if (sw > 0) eta = mix(eta, swash(s, x, z, t), sw);
  return eta;
}

const surfOf = (u: SurfUniforms): Surf | null => {
  const S = u.uSurf.value, d = u.uSurfDir.value;
  return S.w > 0 ? { H: S.x, T: S.y, slope: S.z, dx: d.x, dz: d.y } : null;
};

/**
 * The surf's surface over the still level (m) at (x, z), where the still water is D deep, at the water's clock t (s):
 * the water pass's surfEta (0 on a sheltered flat and beyond the surf, past 1.4 m of water).
 */
export function surfEta(u: SurfUniforms, x: number, z: number, D: number, t: number): number {
  const s = surfOf(u);
  if (!s || D > 1.4) return 0;
  return surfAt(s, x, z, D, t) * (1 - smoothstep(0.8, 1.4, D));
}
