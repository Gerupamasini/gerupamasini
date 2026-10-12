import type { SurfUniforms } from './Surf';

/**
 * The surf's surface on the CPU: SURF_GLSL's surfEval (its height only, surfEtaAt) line for line, reading the very zone
 * the shaders read (the uniforms' textures: the ground, the arrival times and the slope through the same cubic
 * B-spline, the bar and the shelter), so what swims in the surf rides the waves that are drawn. The hashes are reckoned
 * in single precision, as the GPU does, so the noise lattice, the waves' numbers and their heights come out the same;
 * the smooth parts in double precision differ from the GPU's by far less than a millimetre.
 */

const fr = Math.fround;
const fract = (x: number): number => x - Math.floor(x);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
/** GLSL's smoothstep (by its formula, so edges in either order behave as the GPU's do) */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
const PI = Math.PI, HALF_PI = Math.PI / 2;

const K_HASH = fr(0.1031), K_HASH2 = fr(33.33), K_GOLD = fr(0.6180339887);
function surfHash(n: number): number {
  let x = fract(fr(fr(n) * K_HASH));
  x = fr(x * fr(x + K_HASH2));
  x = fr(x * fr(x + x));
  return fract(x);
}
const surfW = (n: number): number => fr(fract(fr(fr(n) * K_GOLD)) * 89.0);
function surfNoise(px: number, py: number): number {
  const ix = Math.floor(px), iy = Math.floor(py);
  let fx = px - ix, fy = py - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const n = ix + iy * 57;
  return mix(mix(surfHash(n), surfHash(n + 1), fx), mix(surfHash(n + 57), surfHash(n + 58), fx), fy);
}
function surfNoise1(x: number): number {
  const i = Math.floor(x);
  let f = x - i;
  f = f * f * (3 - 2 * f);
  return mix(surfHash(i * 1.375 + 0.125), surfHash(i * 1.375 + 1.5), f);
}

/** The surf's uniforms read once per call (the zone is re-made as the tide moves, the day's sea can change). */
interface Ctx {
  Hs: number; Tp: number;
  dx: number; dz: number; sinA: number; spread: number;
  lv0: number; lv1: number; edgeSpeed: number; edgeDepth: number;
  half: number; N: number;
  zone: Float32Array; aux: Float32Array; w: number; h: number;
}

const ctxOf = (u: SurfUniforms): Ctx | null => {
  const S = u.uSurf.value;
  if (S.w <= 0) return null;
  const d = u.uSurfDir.value, L = u.uSurfLv.value, g = u.uSurfGrid.value;
  const zi = u.tSurfZone.value.image as { data: Float32Array; width: number; height: number };
  const ai = u.tSurfAux.value.image as { data: Float32Array; width: number; height: number };
  return {
    Hs: S.x, Tp: S.y, dx: d.x, dz: d.y, sinA: d.z, spread: d.w,
    lv0: L.x, lv1: L.y, edgeSpeed: L.z, edgeDepth: L.w, half: g.x, N: g.y,
    zone: zi.data, aux: ai.data, w: Math.min(zi.width, ai.width), h: Math.min(zi.height, ai.height),
  };
};

const out4 = new Float64Array(4);
/** surfZoneAt: the zone's (ground, arrival time at the bracket's two levels, slope) through the cubic B-spline the
 * shader builds from four bilinear lookups (the textures clamp at their edges); into out4 */
function zoneAt(c: Ctx, x: number, z: number): Float64Array {
  const px = clamp(x, -c.half, c.half), pz = clamp(z, -c.half, c.half);
  const sx = ((px + c.half) / (2 * c.half)) * (c.N - 1), sz = ((pz + c.half) / (2 * c.half)) * (c.N - 1);
  const ix = Math.floor(sx), iz = Math.floor(sz), fx = sx - ix, fz = sz - iz;
  const wx = bspline(fx, wX), wz = bspline(fz, wZ);
  out4.fill(0);
  for (let b = 0; b < 4; b++) {
    const jj = clamp(iz - 1 + b, 0, c.h - 1);
    for (let a = 0; a < 4; a++) {
      const ii = clamp(ix - 1 + a, 0, c.w - 1), k = (jj * c.w + ii) * 4, wt = wx[a] * wz[b];
      out4[0] += wt * c.zone[k]; out4[1] += wt * c.zone[k + 1]; out4[2] += wt * c.zone[k + 2]; out4[3] += wt * c.zone[k + 3];
    }
  }
  // beyond the map's seaward edge the arrival time runs on at the edge's speed
  const beyond = Math.max((x - px) * c.dx + (z - pz) * c.dz, 0) / Math.max(c.edgeSpeed, 0.5);
  out4[1] -= beyond; out4[2] -= beyond;
  return out4;
}
const wX = new Float64Array(4), wZ = new Float64Array(4);
function bspline(f: number, w: Float64Array): Float64Array {
  const f2 = f * f, f3 = f2 * f;
  w[0] = (1 - 3 * f + 3 * f2 - f3) / 6; w[1] = (4 - 6 * f2 + 3 * f3) / 6;
  w[2] = (1 + 3 * f + 3 * f2 - 3 * f3) / 6; w[3] = f3 / 6;
  return w;
}
const aux4 = new Float64Array(4);
/** surfAuxAt: (the highest ground crossed on the way in, the shelter at the bracket's two levels, impact), bilinear */
function auxAt(c: Ctx, x: number, z: number): Float64Array {
  const px = clamp(x, -c.half, c.half), pz = clamp(z, -c.half, c.half);
  const sx = ((px + c.half) / (2 * c.half)) * (c.N - 1), sz = ((pz + c.half) / (2 * c.half)) * (c.N - 1);
  const ix = Math.floor(sx), iz = Math.floor(sz), fx = sx - ix, fz = sz - iz;
  const i0 = clamp(ix, 0, c.w - 1), i1 = clamp(ix + 1, 0, c.w - 1), j0 = clamp(iz, 0, c.h - 1), j1 = clamp(iz + 1, 0, c.h - 1);
  for (let ch = 0; ch < 4; ch++) {
    const at = (i: number, j: number) => c.aux[(j * c.w + i) * 4 + ch];
    aux4[ch] = (at(i0, j0) * (1 - fx) + at(i1, j0) * fx) * (1 - fz) + (at(i0, j1) * (1 - fx) + at(i1, j1) * fx) * fz;
  }
  return aux4;
}

// ---- the waves' timing (surfWarp, surfSinA, surfBend, surfPhase, surfWaveH)
const warp = (c: Ctx, ta: number): number =>
  ta + c.Tp * (0.55 * (surfNoise1(ta / (c.Tp * 5.3)) - 0.5) + 0.2 * (surfNoise1(ta / (c.Tp * 1.7) + 7.1) - 0.5));
const sinA = (c: Ctx, ta: number): number => clamp(c.sinA + c.spread * 2 * (surfNoise1(ta / (c.Tp * 6.1) + 3.7) - 0.5), -0.7, 0.7);
const bend = (y: number, ta: number): number =>
  0.8 * (surfNoise(y * 0.014 + ta * 0.004, 1.3) - 0.5)
  + 0.4 * (surfNoise(y * 0.055, ta * 0.045 + 5.1) - 0.5)
  + 0.14 * (surfNoise(y * 0.2, ta * 0.09 + 9.7) - 0.5);
function phase(c: Ctx, syy: number, T: number, t: number): number {
  const ta = t - T;
  return warp(c, ta + (syy * sinA(c, ta)) / Math.max(c.edgeSpeed, 0.5)) / c.Tp + bend(syy, ta);
}
function waveH(c: Ctx, n: number, syx: number, syy: number): number {
  const w = surfW(n);
  const ray = clamp(0.706 * Math.sqrt(-Math.log(Math.max(1 - 0.985 * surfHash(Math.floor(w * 64) + 0.5), 1e-3))), 0.3, 1.5);
  const grp = 0.8 + 0.4 * surfNoise1(n * 0.16 + 4.3);
  const sect = 0.68 + 0.64 * smoothstep(0.12, 0.88, surfNoise(syy * 0.075 + w, syx * 0.02 + w));
  const fine = 0.88 + 0.24 * surfNoise(syy * 0.32 - w * 1.3, syx * 0.05 - w * 1.3);
  return c.Hs * ray * grp * sect * fine;
}

// ---- the wave's shape (surfAbreu's η, surfK, surfShape)
function abreu(th: number, r: number, phi: number): number {
  const s = Math.sqrt(1 - r * r), cc = (r * Math.sin(phi)) / (1 + s), c0 = -r / (1 + s);
  const range = (1 + c0) / (1 - r) + (1 - c0) / (1 + r);
  return (Math.sin(th) + cc) / (1 - r * Math.cos(th + phi)) / range;
}
function waveK(c: Ctx, D: number): number {
  const w = (2 * PI) / c.Tp, w2g = (w * w) / 9.81;
  return w2g / Math.sqrt(Math.tanh(w2g * Math.max(D, 0.02)));
}
/** (r, φ) into shape[0], shape[1] */
const shape = new Float64Array(2);
function waveShape(H: number, D: number, k: number): Float64Array {
  const kd = k * Math.max(D, 0.02);
  const ur = Math.max((0.375 * H * k) / (kd * kd * kd), 1e-6);
  const B = 0.857 / (1 + Math.exp((-0.471 - Math.log(ur) * 0.4342945) / 0.297));
  const psi = -HALF_PI + HALF_PI * Math.tanh(0.815 / Math.pow(ur, 0.672));
  const b = (B * Math.SQRT2) / Math.sqrt(9 + 2 * B * B);
  const r = (2 * b) / (1 + b * b);
  shape[0] = Math.max(r, Math.min(0.4, 0.45 * k * H));
  shape[1] = -HALF_PI - psi;
  return shape;
}

// ---- the swash (surfSwashAt's water depth alone)
function swashDepth(c: Ctx, syx: number, syy: number, D: number, ph: number, ta: number, beta: number, shelter: number): number {
  const Tp = c.Tp;
  const b = clamp(beta, 0.02, 0.25);
  const x = -D / b;
  const a0 = ta + (syy * sinA(c, ta)) / Math.max(c.edgeSpeed, 0.5);
  const Tl = Tp / Math.max((warp(c, a0 + 0.15) - warp(c, a0 - 0.15)) / 0.3, 0.4);
  const n0 = Math.floor(ph), tau0 = (ph - n0) * Tl;
  const Hs = Math.max(c.Hs, 0.02), L0 = 1.5613 * Tp * Tp, HL = Hs * L0;
  const R2 = b / Math.sqrt(Hs / L0) < 0.3 ? 0.043 * Math.sqrt(HL) : 1.1 * (0.35 * b * Math.sqrt(HL) + 0.5 * Math.sqrt(HL * (0.563 * b * b + 0.004)));
  const shel = Math.pow(clamp(shelter, 0, 1), 0.8);
  let best = 0;
  for (let i = 0; i < 3; i++) {
    const n = n0 - i, tau = tau0 + i * Tl, wn = surfW(n);
    const Hn = waveH(c, n, syx, syy) * shel;
    const R = Math.max(0.62 * R2 * Math.sqrt(Math.max(Hn, 0) / Hs) * (0.75 + 0.5 * surfNoise(syy * 0.2 + wn * 3.1, 1.7 + wn * 3.1)), 0.004);
    const Xr = R / b, U0 = Math.sqrt(19.62 * R), tU = Math.max(U0 / (9.81 * b), 0.05), tD = 1.35 * tU;
    let xs: number, us: number;
    if (tau < tU) { xs = U0 * tau - 4.905 * b * tau * tau; us = U0 - 9.81 * b * tau; }
    else { const tb = tau - tU; xs = Xr * (1 - (tb / tD) * (tb / tD)); us = (-2 * Xr * tb) / (tD * tD); }
    xs = Math.max(xs, -0.6 * Xr - 0.3);
    xs += (0.16 * (surfNoise(syx * 0.9 + wn * 5.3, syy * 1.4 + wn * 5.3) - 0.5) + 0.06 * (surfNoise(syx * 3 - wn * 2.1, syy * 4.5 - wn * 2.1) - 0.5)) * Math.min(Xr, 1.6);
    const te = tau + 0.3, dx = xs - x;
    const nose = (0.004 + 0.012 * smoothstep(0, 0.6, us) * Math.min(Hn / 0.3, 1.5)) * smoothstep(0, 0.03, dx) * Math.exp(-dx / 0.35);
    const h = dx > 0 ? Math.min(Math.max((dx * dx) / (88.29 * te * te), nose), 0.5 * Hn) : 0;
    if (h > best) best = h;
  }
  return best;
}

/** surfEval's height: the surface above the still level (m) at (x, z) for the water level and the water's clock t */
function surfEval(c: Ctx, x: number, z: number, level: number, t: number): number {
  const Z = zoneAt(c, x, z);
  const ground = Z[0], Ta = Z[1], Tb = Z[2], slope = Z[3];
  const D = level - ground;
  // high and dry, above any run-up: the ground itself
  if (D < -0.9 * c.Hs - 0.12) return -D - 0.002;
  const A = auxAt(c, x, z);
  const bar = A[0];
  const f = clamp((level - c.lv0) / Math.max(c.lv1 - c.lv0, 1e-4), 0, 1);
  const T = mix(Ta, Tb, f), shelter = mix(A[1], A[2], f);
  const m = clamp(slope, 0.005, 0.2);
  const syx = x * c.dx + z * c.dz, syy = -x * c.dz + z * c.dx;
  const Tp = c.Tp, ta = t - T;
  const ph = phase(c, syy, T, t);
  const n = Math.floor(ph), u = ph - n;
  const shel = Math.pow(clamp(shelter, 0, 1), 0.8);
  const H0 = mix(waveH(c, n, syx, syy), waveH(c, n + 1, syx, syy), smoothstep(0.3, 0.7, u)) * shel;
  const Dsw = clamp(0.35 * H0, 0.05, 0.2);
  const wsw = 1 - smoothstep(0.45 * Dsw, Dsw, D);
  let eta = 0;
  if (wsw < 1) {
    const Dc = Math.max(D, 0.02);
    // surfBreak
    const Dr = Math.max(c.edgeDepth, 0.3);
    const H = H0 * clamp(Math.pow(Dr / Math.max(Dc, 0.05), 0.25), 0.8, 2.2);
    const gam = clamp(1.56 / (1 + Math.exp(-19.5 * m)) - (43.8 * (1 - Math.exp(-19 * m)) * H) / (9.81 * Tp * Tp), 0.6, 1.3);
    const Dbar = level - bar;
    const barOn = smoothstep(0.03, 0.15, Dbar) * (Dc >= Dbar ? 1 : 0);
    const Dctl = mix(Dc, mix(Math.max(Dbar, 0.02), Dc, smoothstep(1.5, 2.6, Dc / Math.max(Dbar, 0.02))), barOn);
    const Hr = H0 * Math.pow(Dr, 0.25);
    const Db = Math.pow(Hr / gam, 0.8);
    const q = (Hr * Math.pow(Math.max(Dctl, 0.02), -1.25)) / gam;
    const xi = m / Math.sqrt(Math.max(Hr * Math.pow(Math.max(Db, 0.02), -0.25), 0.01) / (1.5613 * Tp * Tp));
    const plunge = smoothstep(0.3, 0.6, xi);
    const k = smoothstep(1, mix(1.9, 1.25, plunge), q);
    const Hw = Math.min(H, gam * Dctl * 1.05);
    const kw = waveK(c, Dc);
    // whole: shoaled, peaked, then leaning forward as it nears the break
    const near = smoothstep(0.55, 1, q);
    if (k < 1) {
      const sh = waveShape(Hw, Dc, kw);
      const r = mix(sh[0], mix(0.6, 0.86, plunge), near);
      const phi = mix(sh[1], mix(-0.55, 0, plunge), near);
      eta = Hw * abreu(2 * PI * u + HALF_PI - (phi + HALF_PI) * 0.73 * r, r, phi);
    }
    // broken: a bore shrinking with the depth, its rolling front steep, its back sloping away
    if (k > 0) {
      let Hb = mix(0.55 * Dctl, 0.85 * Hw, smoothstep(0.75 * Db, Db, Dctl));
      const wb = surfW(n) * 2.3;
      Hb *= 0.5 + 0.7 * smoothstep(0.1, 0.9, surfNoise(syy * 0.3 + wb, syx * 0.05 + wb));
      const frt = mix(0.1, 0.06, plunge);
      let fb: number;
      if (u < 1 - frt) fb = 1 - u / (1 - frt);
      else { const v = (u - (1 - frt)) / frt; fb = v * v * (3 - 2 * v); }
      eta = mix(eta, Hb * (fb - 0.42), k);
    }
  }
  // up the beach (and a little below the still waterline) the surface is the swash's
  if (wsw > 0) {
    const h = swashDepth(c, syx, syy, D, ph, ta, m, shelter);
    eta = mix(eta, h > 0 ? -D + h : -D - 0.002, wsw);
  }
  return eta;
}

/**
 * The surf's surface over the still level (m) at (x, z), for the water level `level` (m; the tide) at the water's
 * clock t (s): the water pass's surfEta. 0 on a sheltered flat; on the beach above the swash, the ground (−D).
 */
export function surfEta(u: SurfUniforms, x: number, z: number, level: number, t: number): number {
  const c = ctxOf(u);
  return c ? surfEval(c, x, z, level, t) : 0;
}
