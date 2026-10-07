// Skin mesh (head / trunk / tail), mouth interior and baked skin textures for the adult トビハゼ.
import {
  S_END, SL, BODY_U, ARM_U, DOME_U, EYE, CUP, MOUTH, RICTUS_S, OPEN_S, FEAT, uvS, uvT, windowAngle,
  section, basePoint, project, field, fieldGrad, toObject, dirToObject, gapeY, sideZ, normHeight, topY, botY, norm3,
} from './anatomy.mjs';
import { perlin3, fbm3, ridged3, hash01, hash3i, clamp, mix, smoothstep, forEachCell3 } from '../../lib/noise.mjs';

const TAU = Math.PI * 2;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const DOME_OPTS = { dome: true };

/** where the skin is split into the glTF parts (fish s, mm) */
export const SPLIT = { head: 16.8, tail: 56.5 };

function distributeSections(NS) {
  const M = 20000;
  const cdf = new Float64Array(M + 1);
  for (let i = 1; i <= M; i++) {
    const s = (i / M) * S_END;
    const d = 1.0 + 2.6 * Math.exp(-s / 0.9) + 1.5 * smoothstep(2.5, 4.0, s) * smoothstep(11.5, 9.5, s) + 0.6 * smoothstep(11, 13, s) * smoothstep(19, 17, s)
      + 0.5 * smoothstep(60, 64.5, s);
    cdf[i] = cdf[i - 1] + d;
  }
  const out = new Float64Array(NS);
  let k = 0;
  for (let i = 0; i < NS; i++) {
    const target = (i / (NS - 1)) * cdf[M];
    while (k < M && cdf[k + 1] < target) k++;
    const f = (target - cdf[k]) / Math.max(cdf[k + 1] - cdf[k], 1e-12);
    out[i] = ((k + f) / M) * S_END;
  }
  out[0] = 0;
  out[NS - 1] = S_END;
  return out;
}

// columns: denser over the back (eyes, dorsal fins) and the belly than on the flanks
function distributeColumns(NV) {
  const M = 8192;
  const cdf = new Float64Array(M + 1);
  const dens = (phi) => 1 + 0.9 * Math.exp(-(((phi - Math.PI) / 0.75) ** 2)) + 0.35 * Math.exp(-((Math.min(phi, TAU - phi) / 0.6) ** 2));
  for (let i = 1; i <= M; i++) cdf[i] = cdf[i - 1] + dens(((i - 0.5) / M) * TAU);
  const out = new Float64Array(NV + 1);
  let k = 0;
  for (let j = 0; j <= NV; j++) {
    const target = (j / NV) * cdf[M];
    while (k < M && cdf[k + 1] < target) k++;
    const f = (target - cdf[k]) / Math.max(cdf[k + 1] - cdf[k], 1e-12);
    out[j] = ((k + f) / M) * TAU;
  }
  out[0] = 0;
  out[NV] = TAU;
  // exact mirror symmetry (left/right)
  for (let j = 0; j <= NV / 2; j++) { const a = 0.5 * (out[j] + (TAU - out[NV - j])); out[j] = a; out[NV - j] = TAU - a; }
  return out;
}

/** Inverse of basePoint(): loft parameter phi for a fish-space point. */
export function invPhi(s, y, z) {
  const q = section(clamp(s, 0.01, S_END - 0.01));
  const dy = y - q.yc;
  const up = dy > 0;
  const n = up ? q.nT : q.nB;
  const h = Math.max(up ? q.t : q.b, 1e-4);
  const a = Math.sign(z) * Math.pow(Math.min(1, Math.abs(z) / Math.max(q.w, 1e-4)), n / 2);
  const c = -Math.sign(dy) * Math.pow(Math.min(1, Math.abs(dy) / h), n / 2);
  let phi = Math.atan2(a, c);
  if (phi < 0) phi += TAU;
  return phi;
}

// ---------------------------------------------------------------------------------------------------------------
// Texture u along the body: on every loft column, the arc length along the sculpted surface from the snout tip,
// normalised (and smoothed over neighbouring columns). Walls that face along the axis — the snout's face, the eye
// sockets, the lips — get texels in proportion to their real size, not to their short extent in s.
let UVMAP = null;
function uvMap() {
  if (UVMAP) return UVMAP;
  const N = 420, M = 192, R = 3, RV = 2;
  const S = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) S[i] = Math.min(S_END - 0.002, Math.max(0.002, uvS(i / N)));
  // the projected surface on a regular (s-row, phi-column) table
  const P = [];
  for (let i = 0; i <= N; i++) {
    const row = [];
    const q = section(S[i]);
    for (let j = 0; j <= M; j++) row.push(j === M ? row[0] : project(basePoint(S[i], (j / M) * TAU, q)));
    P.push(row);
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // u: arc length down each column
  const raw = [], len = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    const T = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) T[i] = T[i - 1] + dist(P[i][j], P[i - 1][j]);
    len[j] = T[N];
    for (let i = 0; i <= N; i++) T[i] /= T[N];
    raw.push(T);
  }
  // circular Gaussian smoothing across columns (the sockets would otherwise shear the texture sideways)
  const T = [], L = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    const t = new Float64Array(N + 1);
    let wsum = 0;
    for (let k = -R; k <= R; k++) {
      const w = Math.exp(-((k / (R * 0.6)) ** 2));
      const src = raw[(j + k + M) % M];
      for (let i = 0; i <= N; i++) t[i] += src[i] * w;
      L[j] += len[(j + k + M) % M] * w;
      wsum += w;
    }
    for (let i = 0; i <= N; i++) t[i] /= wsum;
    t[0] = 0; t[N] = 1;
    L[j] /= wsum;
    // more texels over the snout's face: round the tip (the pole where the columns meet) the rows are short, so the
    // columns there need texels as fine as the rows' or the skin's dots blur out radially
    for (let i = 0; i <= N; i++) t[i] = tipWarp(t[i] * L[j], L[j]);
    T.push(t);
  }
  // v: arc length around each row (the eye domes' walls and the lips get texels in proportion to their size),
  // smoothed over neighbouring rows
  const rawV = [], C = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const V = new Float64Array(M + 1);
    for (let j = 1; j <= M; j++) V[j] = V[j - 1] + dist(P[i][j], P[i][j - 1]);
    C[i] = V[M];
    for (let j = 0; j <= M; j++) V[j] = V[M] > 1e-9 ? V[j] / V[M] : j / M;
    rawV.push(V);
  }
  const V = [];
  for (let i = 0; i <= N; i++) {
    const v = new Float64Array(M + 1);
    let wsum = 0;
    for (let k = -RV; k <= RV; k++) {
      const ii = Math.min(N, Math.max(0, i + k));
      const w = Math.exp(-((k / (RV * 0.7)) ** 2));
      for (let j = 0; j <= M; j++) v[j] += rawV[ii][j] * w;
      wsum += w;
    }
    for (let j = 0; j <= M; j++) v[j] /= wsum;
    // left-right symmetry: v(phi) + v(2π − phi) = 1
    for (let j = 0; j <= M / 2; j++) { const a = 0.5 * (v[j] + 1 - v[M - j]); v[j] = a; v[M - j] = 1 - a; }
    v[0] = 0; v[M] = 1;
    V.push(v);
  }
  UVMAP = { N, M, S, T, L, V, C };
  return UVMAP;
}
function uvColumns(phi) {
  const { M, T } = uvMap();
  const fj = ((((phi / TAU) % 1) + 1) % 1) * M;
  const j0 = Math.floor(fj) % M, j1 = (j0 + 1) % M, g = fj - Math.floor(fj);
  return { a: T[j0], b: T[j1], g, j0, j1 };
}
/** texture t (u = t · BODY_U) of the loft parameter (s, phi) */
export function uvTof(s, phi) {
  const { N, S } = uvMap();
  const { a, b, g } = uvColumns(phi);
  let lo = 0, hi = N;
  if (s <= S[0]) return 0;
  if (s >= S[N]) return 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] > s) hi = m; else lo = m; }
  const f = (s - S[lo]) / (S[hi] - S[lo]);
  const tl = a[lo] * (1 - g) + b[lo] * g, th = a[hi] * (1 - g) + b[hi] * g;
  return tl + (th - tl) * f;
}
/** inverse of uvTof along the column at phi */
export function uvSof(t, phi) {
  const { N, S } = uvMap();
  const { a, b, g } = uvColumns(phi);
  const at = (i) => a[i] * (1 - g) + b[i] * g;
  if (t <= 0) return S[0];
  if (t >= 1) return S[N];
  let lo = 0, hi = N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (at(m) > t) hi = m; else lo = m; }
  const f = (t - at(lo)) / Math.max(at(hi) - at(lo), 1e-12);
  return S[lo] + (S[hi] - S[lo]) * f;
}
/** the row table bracketing s */
function uvRow(s) {
  const { N, S } = uvMap();
  if (s <= S[0]) return { lo: 0, hi: 0, f: 0 };
  if (s >= S[N]) return { lo: N, hi: N, f: 0 };
  let lo = 0, hi = N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] > s) hi = m; else lo = m; }
  return { lo, hi, f: (s - S[lo]) / (S[hi] - S[lo]) };
}
/** texture v of the loft parameter (s, phi): normalised arc length around the row */
export function uvVof(s, phi) {
  const { M, V } = uvMap();
  const { lo, hi, f } = uvRow(s);
  const x = Math.min(1, Math.max(0, phi / TAU)) * M;
  const j = Math.min(M - 1, Math.floor(x)), g = x - j;
  const at = (i) => V[i][j] * (1 - g) + V[i][j + 1] * g;
  return at(lo) * (1 - f) + at(hi) * f;
}
/** inverse of uvVof around the row at s */
function uvPhiOfV(v, s) {
  const { M, V } = uvMap();
  const { lo, hi, f } = uvRow(s);
  const at = (j) => V[lo][j] * (1 - f) + V[hi][j] * f;
  if (v <= 0) return 0;
  if (v >= 1) return TAU;
  let a = 0, b = M;
  while (b - a > 1) { const m = (a + b) >> 1; if (at(m) > v) b = m; else a = m; }
  const g = (v - at(a)) / Math.max(at(b) - at(a), 1e-12);
  return ((a + g) / M) * TAU;
}
/** (s, phi) of a texel (t, v) */
export function uvInverse(t, v) {
  let phi = v * TAU, s = uvSof(t, phi);
  for (let k = 0; k < 4; k++) { phi = uvPhiOfV(v, s); s = uvSof(t, phi); }
  return { s, phi };
}
/** circumference (mm) of the row at s */
function uvRowArc(s) {
  const { C } = uvMap();
  const { lo, hi, f } = uvRow(s);
  return C[lo] * (1 - f) + C[hi] * f;
}
/** arc length (mm) of the loft column at phi */
function uvArc(phi) {
  const { L } = uvMap();
  const { g, j0, j1 } = uvColumns(phi);
  return L[j0] * (1 - g) + L[j1] * g;
}
/** texture t of arc length a (mm from the snout tip) down a column of length L: denser over the snout's face */
const UV_TIP = { gain: 8, a0: 1.4 };
const tipArc = (a) => a + UV_TIP.gain * UV_TIP.a0 * (1 - Math.exp(-a / UV_TIP.a0));
function tipWarp(a, L) { return tipArc(a) / tipArc(L); }
/** surface distance (mm) per unit t at texture t down the column at phi */
function uvArcRate(t, phi) {
  const L = uvArc(phi), Lt = tipArc(L);
  let a = t * L;
  for (let k = 0; k < 8; k++) a -= (tipArc(a) - t * Lt) / (1 + UV_TIP.gain * Math.exp(-a / UV_TIP.a0));
  return Lt / (1 + UV_TIP.gain * Math.exp(-Math.max(a, 0) / UV_TIP.a0));
}

const S_FRONT = MOUTH[0][0];
/** phi of the gape on the +z side at s (0 in front of the lower jaw) */
function gapePhi(s) {
  if (s <= S_FRONT) return Math.max(0.0, gapePhi(S_FRONT + 1e-3) * (s / S_FRONT));
  const sc = Math.min(s, RICTUS_S);
  const y = gapeY(sc);
  return invPhi(sc, y, Math.max(sideZ(sc, y), 1e-3));
}

/**
 * The skin grid (rows = sections, columns = loft angle), projected on the sculpted surface, with a U-shaped cut
 * along the gape (left gape line, front of the lower jaw, right gape line) so the lower jaw can drop.
 */
export function buildSkin(NS, NV, log = () => {}) {
  const sList = distributeSections(NS);
  const phiBase = distributeColumns(NV);
  const cols = NV + 1;
  // gape column on the left side: the base column closest to the gape angle at the rictus
  const phiR = gapePhi(RICTUS_S);
  let jg = 1;
  for (let j = 1; j < NV / 2; j++) if (Math.abs(phiBase[j] - phiR) < Math.abs(phiBase[jg] - phiR)) jg = j;
  const phiOf = (s, j) => {
    const base = phiBase[j];
    const blend = smoothstep(RICTUS_S + 0.3, RICTUS_S + 4.0, s);
    if (blend >= 1) return base;
    // (in front of the lower jaw the columns ease back to the loft's own spacing toward the snout's tip instead of
    // being squeezed onto the midline: squeezed, they pleat across the lips' front)
    const pr = phiBase[jg];
    const pg = s <= S_FRONT ? pr + (gapePhi(S_FRONT + 1e-3) - pr) * smoothstep(0, S_FRONT, s) : gapePhi(s);
    let pw;
    if (j <= jg) pw = (base / pr) * pg;
    else if (j >= NV - jg) pw = TAU - ((TAU - base) / pr) * pg;
    else pw = pg + ((base - pr) / (TAU - 2 * pr)) * (TAU - 2 * pg);
    return pw * (1 - blend) + base * blend;
  };
  let i0 = 0, ir = 0;
  for (let i = 0; i < NS; i++) { if (sList[i] < S_FRONT) i0 = i + 1; if (sList[i] <= RICTUS_S) ir = i; }

  const verts = [];
  const P = new Float64Array(NS * cols * 3);
  for (let i = 0; i < NS; i++) {
    const s = sList[i];
    const q = section(s);
    for (let j = 0; j < NV; j++) {
      const phi = phiOf(s, j);
      const b = basePoint(s, phi, q);
      const p = project(b);
      const n = fieldGrad(p[0], p[1], p[2]);
      verts.push({ i, j, s, phi, base: b, fish: p, n, jaw: 0, cut: '' });
    }
    // seam column NV duplicates column 0 (u wraps)
    const v0 = verts[i * cols];
    verts.push({ ...v0, j: NV, phi: TAU });
    if (i % 60 === 0) log(`    skin row ${i}/${NS}`);
  }
  const gid = (i, j) => i * cols + j;
  // Over the snout cap the loft's radial distance is not a true distance (the section shrinks fast along s), so its
  // gradient leans outward and the tip would shade like a pinched cone: take the normals from the mesh surface there.
  {
    const P = (i, j) => verts[gid(i, ((j % NV) + NV) % NV)].fish;
    const geo = new Map();
    for (let i = 0; i < NS; i++) {
      if (sList[i] > 2.8) break;
      for (let j = 0; j < NV; j++) {
        let n;
        if (i === 0) {
          // the pole: the mean direction of the first ring's normals
          n = [0, 0, 0];
          for (let k = 0; k < NV; k++) { const a = P(1, k), b = P(1, k + 1), o = P(0, 0); const c = cross(sub(a, o), sub(b, o)); n[0] += c[0]; n[1] += c[1]; n[2] += c[2]; }
        } else {
          const ds = sub(P(Math.min(NS - 1, i + 1), j), P(i - 1, j));
          const dp = sub(P(i, j + 1), P(i, j - 1));
          n = cross(ds, dp);
        }
        n = norm3(n);
        if (dot(n, verts[gid(i, j)].n) < 0) n = n.map((c) => -c);
        geo.set(gid(i, j), n);
      }
    }
    for (const [g, n] of geo) {
      const v = verts[g];
      // (where the grid's columns are pinched together - round the mouth corner, where they gather onto the gape -
      // the differences across a row are unreliable: there the field's own normal is kept)
      const f = Math.max(smoothstep(1.2, 2.6, v.s), smoothstep(0.85, 0.6, dot(n, v.n)));
      v.n = norm3([n[0] * (1 - f) + v.n[0] * f, n[1] * (1 - f) + v.n[1] * f, n[2] * (1 - f) + v.n[2] * f]);
    }
    for (let i = 0; i < NS; i++) verts[i * cols + NV].n = verts[i * cols].n;
    // Round the tip, where the grid's columns close on their pole just above the lips, the rows are tiny and the
    // differences across them noisy: the normals there are smoothed over their neighbours (a few rings, fading out
    // ~1 mm from the pole), or the lips' front shades as a small faceted star.
    const pole = [0, SNOUT_POLE_Y, 0];
    for (let it = 0; it < 6; it++) {
      const next = new Map();
      for (let i = 0; i < NS && sList[i] < 0.6; i++) for (let j = 0; j < NV; j++) {
        const v = verts[gid(i, j)];
        const w = smoothstep(1.0, 0.35, Math.hypot(v.fish[0] - pole[0], v.fish[1] - pole[1], v.fish[2] - pole[2]));
        if (w <= 0) continue;
        const acc = [...v.n];
        const add = (ii, jj) => { const n = verts[gid(ii, ((jj % NV) + NV) % NV)].n; acc[0] += n[0]; acc[1] += n[1]; acc[2] += n[2]; };
        if (i > 0) { add(i - 1, j); add(i - 1, j - 1); add(i - 1, j + 1); }
        add(i + 1, j); add(i + 1, j - 1); add(i + 1, j + 1); add(i, j - 1); add(i, j + 1);
        const m = norm3(acc);
        next.set(gid(i, j), norm3([v.n[0] + (m[0] - v.n[0]) * w, v.n[1] + (m[1] - v.n[1]) * w, v.n[2] + (m[2] - v.n[2]) * w]));
      }
      for (const [g, n] of next) verts[g].n = n;
    }
    for (let i = 0; i < NS; i++) verts[i * cols + NV].n = verts[i * cols].n;
  }
  // the gape columns onto the gape: the columns are warped to follow it on the loft, but projected onto the
  // sculpted face (the jowls, the lip lobes) they wander off it. In each row from the front of the mouth to its corner
  // the columns round the gape column slide along the row (keeping their order) so that the gape column lies on the
  // gape line, its neighbours spread out evenly on either side.
  {
    const gyR = (p) => gapeY(clamp(p[0], MOUTH[0][0], RICTUS_S));
    const WIN = 6;
    for (let i = i0; i <= ir; i++) for (const side of [1, -1]) {
      const col = (k) => (side > 0 ? jg + k : NV - jg - k);
      const P = [];
      for (let k = -WIN; k <= WIN; k++) P.push(verts[gid(i, col(k))].fish);
      const A = [0];
      for (let k = 1; k < P.length; k++) A.push(A[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1], P[k][2] - P[k - 1][2]));
      // where the row crosses the gape height (the crossing nearest the gape column)
      let best = null;
      for (let k = 0; k < P.length - 1; k++) {
        const d0 = P[k][1] - gyR(P[k]), d1 = P[k + 1][1] - gyR(P[k + 1]);
        if (d0 * d1 > 0 || d0 === d1) continue;
        const a = A[k] + (A[k + 1] - A[k]) * (d0 / (d0 - d1));
        if (!best || Math.abs(a - A[WIN]) < Math.abs(best - A[WIN])) best = a;
      }
      if (best === null) continue;
      const aStar = clamp(best, A[2], A[P.length - 3]);
      const at = (a) => {
        let k = 0;
        while (k < P.length - 2 && A[k + 1] < a) k++;
        const t = clamp((a - A[k]) / Math.max(A[k + 1] - A[k], 1e-9), 0, 1);
        return P[k].map((x, c) => x + (P[k + 1][c] - x) * t);
      };
      const next = [];
      for (let k = 1; k < P.length - 1; k++) {
        // piecewise-linear remap of the arc: the ends of the window stay, the gape column goes to the crossing
        const a = k <= WIN ? A[0] + (aStar - A[0]) * ((A[k] - A[0]) / (A[WIN] - A[0])) : aStar + (A[P.length - 1] - aStar) * ((A[k] - A[WIN]) / (A[P.length - 1] - A[WIN]));
        let q = at(a);
        for (let it = 0; it < 2; it++) { const nn = fieldGrad(q[0], q[1], q[2]); const f = field(q[0], q[1], q[2]); q = [q[0] - nn[0] * f, q[1] - nn[1] * f, q[2] - nn[2] * f]; }
        if (k === WIN) q[1] = gyR(q);
        next.push([gid(i, col(k - WIN)), q]);
      }
      for (const [g, q] of next) { verts[g].fish = q; verts[g].n = fieldGrad(q[0], q[1], q[2]); }
    }
  }
  // The lower jaw's lips: every quad below the gape line in front of the corners seen head-on (OPEN_S). The cut runs
  // between these and the quads above them - along the gape columns at the sides of the snout, and across the face in
  // front, where the lips meet below the grid's pole - so the front of the mouth opens; the corners stay sealed (their
  // vertices are not split), and behind them the gape is a fold of continuous skin, the cheek's, which stretches as
  // the jaw drops (rig.mjs).
  const gyAt = (p) => gapeY(clamp(p[0], MOUTH[0][0], RICTUS_S)) - 0.1 * Math.max(0, p[0] - RICTUS_S);
  const quadOf = (i, j) => [gid(i, j), gid(i + 1, j), gid(i + 1, j + 1), gid(i, j + 1)];
  const kind = new Map(); // i * NV + j → 'L' lower jaw, 'U' above the gape, 'B' below it behind the corners
  let iMax = 0;
  while (iMax < NS - 2 && sList[iMax] < RICTUS_S + 1.5) iMax++;
  for (let i = 0; i < iMax; i++) for (let j = 0; j < NV; j++) {
    const q = quadOf(i, j).map((g) => verts[g].fish);
    const c = [0, 1, 2].map((k) => (q[0][k] + q[1][k] + q[2][k] + q[3][k]) / 4);
    kind.set(i * NV + j, c[1] >= gyAt(c) ? 'U' : c[0] < OPEN_S ? 'L' : 'B');
  }
  const kindOf = (i, j) => (i < 0 || i >= iMax ? 'U' : kind.get(i * NV + (((j % NV) + NV) % NV)));
  // (the seam column NV is the same skin as column 0)
  const canon = (g) => (g % cols === NV ? g - NV : g);
  const touch = new Map();
  for (let i = 0; i < iMax; i++) for (let j = 0; j < NV; j++) for (const g of quadOf(i, j)) {
    const t = touch.get(canon(g)) ?? new Set();
    t.add(kindOf(i, j));
    touch.set(canon(g), t);
  }
  const cutSet = new Set();
  for (const [g, t] of touch) {
    if (t.has('L') && t.has('U') && !t.has('B')) cutSet.add(g);
    else if (t.has('L') && !t.has('U')) { verts[g].jaw = 1; if (g % cols === 0) verts[g + NV].jaw = 1; }
  }
  // whether the quads round grid vertex g stay unfolded with it at p
  const unfolded = (g, p) => {
    const v = verts[g];
    for (const [a0, b0] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
      const ia = v.i + a0, ja = v.j + b0;
      if (ia < 0 || ia + 1 >= NS) continue;
      const q = [[ia, ja], [ia + 1, ja], [ia + 1, ja + 1], [ia, ja + 1]].map(([ii, jj]) => {
        const h = gid(ii, ((jj % NV) + NV) % NV);
        return canon(h) === canon(g) ? p : verts[h].fish;
      });
      for (const [x, y, z] of [[0, 1, 2], [0, 2, 3]]) {
        const n = cross(sub(q[y], q[x]), sub(q[z], q[x]));
        const l = Math.hypot(n[0], n[1], n[2]);
        if (l < 1e-9) continue;
        if (dot(n, v.n) / l < 0.15) return false;
      }
    }
    return true;
  };
  // Slide a vertex along a grid line until it sits `off` above the gape (off < 0: below it), back on the skin, and no
  // further than the quads round it stay unfolded (across the front the grid's rows bunch toward the pole, and a
  // vertex slid past a neighbour's row would turn its quad over). The normal is kept: round the snout's tip it was
  // smoothed over the grid, above.
  const slideToGape = (g, off) => {
    const v = verts[g];
    const dy = v.fish[1] - gyAt(v.fish) - off;
    let best = null;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = v.i + di;
      // (toward the snout's tip too: across the front the first ring round the grid's pole lies below the gape)
      if (ii < 0 || ii >= NS) continue;
      const n = verts[gid(ii, (((v.j + dj) % NV) + NV) % NV)].fish;
      const dn = n[1] - gyAt(n) - off;
      if (dn * dy >= 0) continue;
      const t = dy / (dy - dn);
      if (!best || t < best.t) best = { t, n };
    }
    if (!best) return;
    // (the point along the grid line, put back on the skin; the height is matched after that projection, which
    // moves it - round the snout's front the line is a chord well inside the skin)
    const onSkin = (t) => {
      let p = v.fish.map((x, k) => x + (best.n[k] - x) * t);
      for (let it = 0; it < 2; it++) { const nn = fieldGrad(p[0], p[1], p[2]); const f = field(p[0], p[1], p[2]); p = [p[0] - nn[0] * f, p[1] - nn[1] * f, p[2] - nn[2] * f]; }
      return p;
    };
    const above = (q) => Math.sign(q[1] - gyAt(q) - off);
    let lo = 0, hi = 0.92;
    const sgn = Math.sign(dy);
    if (above(onSkin(hi)) === sgn) lo = hi;
    else for (let it = 0; it < 24; it++) { const m = 0.5 * (lo + hi); if (above(onSkin(m)) === sgn) lo = m; else hi = m; }
    const okAt = (p) => unfolded(g, p);
    let tt = lo === hi ? hi : 0.5 * (lo + hi);
    let p = onSkin(tt);
    for (let k = 0; k < 8 && !okAt(p); k++) { tt *= 0.6; p = onSkin(tt); }
    if (!okAt(p)) return;
    v.fish = p;
    if (g % cols === 0) verts[g + NV].fish = p;
  };
  // the cut in front of the gape columns (which were snapped onto the gape above) follows the grid in steps: its
  // vertices slide onto the gape, so the lip's edge runs straight along it instead of in a sawtooth
  for (const g of cutSet) if (verts[g].i < i0 || Math.abs(verts[g].fish[1] - gyAt(verts[g].fish)) > 0.02) slideToGape(g, 0);
  // and the upper lip's skin is kept above the gape: a vertex of it left below the line (in a quad that straddles
  // it) would hang down out of the upper lip like a tooth when the mouth opens
  for (const [g, t] of touch) {
    const v = verts[g];
    if (cutSet.has(g) || t.has('L') || v.i < 1 || v.fish[0] > RICTUS_S) continue;
    if (v.fish[1] < gyAt(v.fish) + 0.02) slideToGape(g, 0.04);
  }
  const jawCopy = new Map();
  const dup = (g) => { const c = { ...verts[g], jaw: 1, cut: 'lower' }; verts[g].cut = 'upper'; jawCopy.set(g, verts.length); verts.push(c); };
  for (const g of cutSet) { dup(g); if (g % cols === 0) dup(g + NV); }
  const isJawQuad = (i, j) => kindOf(i, j) === 'L';
  // the gape, in order from the left (+z) corner across the front to the right corner: the edges between the lower
  // jaw's quads and the quads above them
  const adj = new Map();
  const link = (a, b) => { a = canon(a); b = canon(b); for (const [x, y] of [[a, b], [b, a]]) { const l = adj.get(x) ?? []; if (!l.includes(y)) l.push(y); adj.set(x, l); } };
  for (let i = 0; i < iMax; i++) for (let j = 0; j < NV; j++) {
    if (kindOf(i, j) !== 'L') continue;
    const [a, b, c, d] = quadOf(i, j);
    if (kindOf(i, j - 1) === 'U') link(a, b);
    if (kindOf(i + 1, j) === 'U') link(b, c);
    if (kindOf(i, j + 1) === 'U') link(c, d);
    if (kindOf(i - 1, j) === 'U') link(d, a);
  }
  const ends = [...adj].filter(([, l]) => l.length === 1).map(([g]) => g);
  if (ends.length !== 2 || [...adj.values()].some((l) => l.length > 2)) throw new Error(`gape cut is not a simple path (${ends.length} ends)`);
  const gape = [ends.find((g) => verts[g].fish[2] > 0) ?? ends[0]];
  while (gape.length < adj.size) {
    const next = adj.get(gape[gape.length - 1]).find((g) => g !== gape[gape.length - 2]);
    if (next === undefined) break;
    gape.push(next);
  }
  // the cut's front part steps between the grid's rows, which bunch round the snout's pole: there the lips' edge is
  // smoothed along the gape (each vertex toward the middle of its neighbours on the cut, at the gape's height, as far
  // as the quads round it stay unfolded), or the open lower lip shows a sawtooth
  for (let it = 0; it < 6; it++) for (let k = 1; k < gape.length - 1; k++) {
    const g = gape[k];
    const v = verts[g];
    if (v.i > i0 + 2) continue;
    const a = verts[gape[k - 1]].fish, b = verts[gape[k + 1]].fish;
    const tgt = [0.5 * (a[0] + b[0]), gyAt(v.fish), 0.5 * (a[2] + b[2])];
    let p = v.fish.map((x, c) => x + (tgt[c] - x) * 0.5);
    // (back onto the skin, horizontally, so its height stays the gape's)
    const gr = fieldGrad(p[0], p[1], p[2]);
    const h = norm3([gr[0], 0, gr[2]]);
    let lo = -0.6, hi = 0.6;
    const f = (t) => field(p[0] + h[0] * t, p[1], p[2] + h[2] * t);
    if (f(lo) > 0 || f(hi) < 0) continue;
    for (let n = 0; n < 30; n++) { const m = 0.5 * (lo + hi); if (f(m) < 0) lo = m; else hi = m; }
    const t = 0.5 * (lo + hi);
    p = [p[0] + h[0] * t, p[1], p[2] + h[2] * t];
    if (!unfolded(g, p)) continue;
    for (const h2 of [g, jawCopy.get(g)]) if (h2 !== undefined) verts[h2].fish = p;
    if (g % cols === 0) for (const h2 of [g + NV, jawCopy.get(g + NV)]) if (h2 !== undefined) verts[h2].fish = p;
  }
  log(`    gape cut: ${gape.length} vertices, ${cutSet.size} split`);
  return { verts, sList, cols, NS, NV, jg, i0, ir, gid, jawCopy, isJawQuad, phiOf, gape };
}

function vertexAttributes(list, flipCheck) {
  const n = list.length;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), tangent = new Float32Array(n * 4), uv = new Float32Array(n * 2);
  list.forEach((v, k) => {
    position.set(toObject(v.fish), k * 3);
    const nn = dirToObject(v.n);
    normal.set(nn, k * 3);
    let t = dirToObject(v.ds ?? [1, 0, 0]);
    t = sub(t, nn.map((c) => c * dot(nn, t)));
    const tl = Math.hypot(...t) || 1;
    tangent.set([t[0] / tl, t[1] / tl, t[2] / tl, v.tw ?? 1], k * 4);
    uv[k * 2] = clamp(uvTof(v.s, v.phi), 0, 1) * BODY_U;
    uv[k * 2 + 1] = uvVof(v.s, v.phi);
  });
  return { position, normal, tangent, uv };
}

/** Split the skin grid into the Head / Body / Tail primitives (boundary rows are duplicated, so they meet exactly). */
export function skinParts(G) {
  const { verts, sList, NS, NV, gid, jawCopy, isJawQuad } = G;
  // tangent along s for every grid vertex
  for (const v of verts) {
    const i0 = Math.max(0, v.i - 1), i1 = Math.min(NS - 1, v.i + 1);
    const a = verts[gid(i0, v.j)].fish, b = verts[gid(i1, v.j)].fish;
    v.ds = sub(b, a);
    if (Math.hypot(...v.ds) < 1e-9) v.ds = [1, 0, 0];
  }
  let iH = 0, iT = 0;
  for (let i = 0; i < NS; i++) { if (Math.abs(sList[i] - SPLIT.head) < Math.abs(sList[iH] - SPLIT.head)) iH = i; if (Math.abs(sList[i] - SPLIT.tail) < Math.abs(sList[iT] - SPLIT.tail)) iT = i; }
  const make = (name, ia, ib) => {
    const map = new Map();
    const list = [];
    const take = (g) => { if (!map.has(g)) { map.set(g, list.length); list.push(verts[g]); } return map.get(g); };
    const tris = [];
    for (let i = ia; i < ib; i++) for (let j = 0; j < NV; j++) {
      const q = [gid(i, j), gid(i + 1, j), gid(i + 1, j + 1), gid(i, j + 1)];
      const jq = isJawQuad(i, j);
      const m = q.map((g) => take(jq && jawCopy.has(g) ? jawCopy.get(g) : g));
      tris.push(m[0], m[1], m[2], m[0], m[2], m[3]);
    }
    // outward winding check (a mid-flank quad)
    const im = Math.floor((ia + ib) / 2), jm = Math.floor(NV / 4);
    const A = toObject(verts[gid(im, jm)].fish), B = toObject(verts[gid(im + 1, jm)].fish), C = toObject(verts[gid(im + 1, jm + 1)].fish);
    const fn = cross(sub(B, A), sub(C, A));
    if (dot(fn, dirToObject(verts[gid(im, jm)].n)) < 0) for (let k = 0; k < tris.length; k += 3) { const t = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = t; }
    // tangent handedness from the uv layout: u along s, v around
    for (const v of list) v.tw = 1;
    return { name, list, indices: new Uint32Array(tris), ...vertexAttributes(list) };
  };
  return { head: make('Head', 0, iH), body: make('Body', iH, iT), tail: make('Tail', iT, NS - 1), rows: { iH, iT } };
}

/** Morph deltas (object space, metres) of a part for field options (projection along the same rays). */
export function skinTarget(part, opts, sMax = Infinity) {
  const d = new Float32Array(part.list.length * 3);
  part.list.forEach((v, k) => {
    if (v.s > sMax || v.cut === 'lower' || v.cut === 'upper') return;
    // (the change the options make to the projected surface: some vertices were moved off their plain projection
    // - onto the gape, relaxed round it - and keep that offset)
    const p = project(v.base, opts);
    const a = toObject(v.relaxed ? project(v.base) : v.fish), b = toObject(p);
    d[k * 3] = b[0] - a[0]; d[k * 3 + 1] = b[1] - a[1]; d[k * 3 + 2] = b[2] - a[2];
  });
  return d;
}

// ---------------------------------------------------------------------------------------------------------------
// Eye domes. The dermal cup round each eye is meshed on its own, from rays cast out of the eye's centre (the body
// loft, cast from the body axis, would graze the dome's steep walls). Where a dome blends into the head its mesh
// dips just under the loft's skin, so the two read as one surface; the texture is painted from the same 3D pattern.
export const DOME = { thetaMax: 1.95, pole: norm3([0.1, 1.0, 0.3]), sink: 0.1 };
/** texture u of a dome row (t = 0 at the pole … 1 at the skirt's end), kept clear of the strip's edges */
export const domeU = (t) => DOME_U[0] + (DOME_U[1] - DOME_U[0]) * (0.03 + 0.92 * t);

function domeFrame(side) {
  const e = FEAT.eyes[side > 0 ? 0 : 1];
  const P = side > 0 ? DOME.pole : [DOME.pole[0], DOME.pole[1], -DOME.pole[2]];
  const e1 = norm3(sub([1, 0, 0], scl(P, P[0])));
  const e2 = scl(cross(P, e1), side);
  return { c: e.c, P, e1, e2 };
}
function domeDir(fr, th, ps) {
  return norm3(add(scl(fr.P, Math.cos(th)), scl(add(scl(fr.e1, Math.cos(ps)), scl(fr.e2, Math.sin(ps))), Math.sin(th))));
}
/** first exit of the ray from the eye's centre out of the solid (from about t0 on), and the outward normal there */
function rayExit(c, d, opts, t0 = 0) {
  const f = (t) => field(c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t, opts);
  let a = Math.max(0, t0 - 0.4);
  while (a > 0 && f(a) > 0) a = Math.max(0, a - 0.4);
  let b = -1;
  for (let t = a + 0.025; t < 9; t += 0.025) { if (f(t) > 0) { b = t; break; } a = t; }
  if (b < 0) b = a;
  for (let k = 0; k < 20; k++) { const m = 0.5 * (a + b); if (f(m) > 0) b = m; else a = m; }
  const t = 0.5 * (a + b);
  const p = [c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t];
  return { t, p, n: fieldGrad(p[0], p[1], p[2], opts) };
}

/** pulls p onto the surface field(·, opts) = 0 along the gradient */
function toSurface(p, opts) {
  let q = p;
  for (let k = 0; k < 6; k++) {
    const f = field(q[0], q[1], q[2], opts);
    if (Math.abs(f) < 1e-5) break;
    const g = fieldGrad(q[0], q[1], q[2], opts);
    q = sub(q, scl(g, f));
  }
  return q;
}

/** true distance of p above the head's own surface (without the domes), along the head's normal; < 0 under it */
function headGap(p) {
  const hn = fieldGrad(p[0], p[1], p[2]);
  const g = (k) => field(p[0] - hn[0] * k, p[1] - hn[1] * k, p[2] - hn[2] * k);
  let lo = -0.8, hi = 2.5;
  if (!(g(lo) > 0 && g(hi) < 0)) return { gap: field(p[0], p[1], p[2]), hn };
  for (let it = 0; it < 24; it++) { const m = 0.5 * (lo + hi); if (g(m) > 0) lo = m; else hi = m; }
  return { gap: 0.5 * (lo + hi), hn };
}

/**
 * One meridian of the left dome (cached): rays from the eye's centre cover the cup and its upper walls; where they
 * start to graze the surface (the concave fillet into the head, which central rays cannot follow) the meridian is
 * continued by walking down the surface itself, in the meridian's plane, until the dome has merged with the head.
 */
const WALK = new Map();
const WALK_STEP = 0.02;
export function meridian(ps, shut) {
  const key = `${shut ? 1 : 0}|${ps.toFixed(6)}`;
  let W = WALK.get(key);
  if (W) return W;
  const fr = domeFrame(1);
  const opts = shut ? { dome: true, cupL: false } : DOME_OPTS;
  // 1. central rays until they graze (or the exit jumps)
  let thc = 0.6, prev = rayExit(fr.c, domeDir(fr, thc, ps), opts);
  for (let th = 0.6 + 0.02; th < 2.9; th += 0.02) {
    const d = domeDir(fr, th, ps);
    const q = rayExit(fr.c, d, opts, prev.t);
    // (inside the window the exit drops onto the globe's hidden core, and just round it the rays skim the lid's
    // rolled margin: neither is the fillet)
    const outer = q.t > EYE.radius + 0.25 && windowAngle(d, FEAT.eyes[0].D) < -0.35;
    const graze = (outer && dot(d, q.n) < 0.42) || (prev.t > EYE.radius + 0.25 && q.t - prev.t > 0.25) || q.p[2] < 0.02;
    if (graze) break;
    thc = th; prev = q;
  }
  const R = Math.max(prev.t, 0.5);
  // 2. walk down the surface in the meridian's plane
  const m = norm3(cross(fr.P, domeDir(fr, thc, ps))); // normal of the meridian plane
  const down = (th) => { const a = domeDir(fr, th + 1e-3, ps), b = domeDir(fr, th - 1e-3, ps); return norm3(sub(a, b)); };
  let p = prev.p, tprev = down(thc);
  const pts = [p];
  let sEnd = -1, merged = -1;
  for (let k = 1; k < 400; k++) {
    const n = fieldGrad(p[0], p[1], p[2], opts);
    let t = norm3(cross(m, n));
    if (dot(t, tprev) < 0) t = scl(t, -1);
    p = toSurface(add(p, scl(t, WALK_STEP)), opts);
    // stay in the meridian's plane
    const off = dot(sub(p, fr.c), m);
    p = toSurface(sub(p, scl(m, off)), opts);
    if (p[2] <= 0) {
      // the medial meridians end on the midplane, where the left and right domes meet
      const a = pts[pts.length - 1], f = a[2] / Math.max(a[2] - p[2], 1e-9);
      const q = add(a, scl(sub(p, a), f));
      pts.push([q[0], q[1], 0]);
      sEnd = (pts.length - 2 + f) * WALK_STEP;
      break;
    }
    pts.push(p);
    tprev = t;
    if (merged < 0) { if (headGap(p).gap < 0.015) merged = k; }
    else if ((k - merged) * WALK_STEP > 0.35) { sEnd = k * WALK_STEP; break; }
  }
  if (sEnd < 0) sEnd = (pts.length - 1) * WALK_STEP;
  W = { thc, R, pts, sEnd, tmax: thc + sEnd / R };
  WALK.set(key, W);
  return W;
}

/**
 * One meridian of the left dome as a polyline from the pole to the skirt's end (the central rays, then the walk),
 * with its arc length: the dome is meshed and textured by arc length along its meridians, so rows and texels are
 * spaced evenly over the cup, the steep walls and the long, low skirt alike. Inside the window the rays' exits lie
 * deep in the hidden core: they are kept as a shell just under the globe instead.
 */
const ARC = new Map();
function meridianArc(ps, shut) {
  const key = `${shut ? 1 : 0}|${ps.toFixed(6)}`;
  let M = ARC.get(key);
  if (M) return M;
  const fr = domeFrame(1);
  const opts = shut ? { dome: true, cupL: false } : DOME_OPTS;
  const W = meridian(ps, shut);
  const pts = [], th = [];
  const NR = Math.max(12, Math.ceil(W.thc / 0.008));
  let t0 = 0;
  for (let k = 0; k <= NR; k++) {
    const t = (k / NR) * W.thc;
    const d = domeDir(fr, t, ps);
    const q = rayExit(fr.c, d, opts, t0);
    t0 = q.t;
    pts.push(q.t < EYE.radius - 0.1 ? add(fr.c, scl(d, EYE.radius - 0.1)) : q.p);
    th.push(t);
  }
  for (let k = 1; k < W.pts.length; k++) { pts.push(W.pts[k]); th.push(W.thc + (k * WALK_STEP) / W.R); }
  const A = [0];
  for (let k = 1; k < pts.length; k++) A.push(A[k - 1] + Math.hypot(...sub(pts[k], pts[k - 1])));
  M = { pts, th, A, len: A[A.length - 1], aThc: A[NR] };
  ARC.set(key, M);
  return M;
}
function onArc(M, a) {
  const A = M.A;
  const aa = clamp(a, 0, M.len);
  let lo = 0, hi = A.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (A[mid] > aa) hi = mid; else lo = mid; }
  const f = A[hi] > A[lo] ? (aa - A[lo]) / (A[hi] - A[lo]) : 0;
  return { p: add(scl(M.pts[lo], 1 - f), scl(M.pts[hi], f)), th: M.th[lo] + (M.th[hi] - M.th[lo]) * f };
}

/** where the dome's surface is at arc length a (mm from the pole) along meridian ps; fr selects the side */
export function domePoint(fr, a, ps) {
  const side = fr.P[2] >= 0 ? 1 : -1;
  const M = meridianArc(ps, false);
  const { p: p0, th } = onArc(M, a);
  let n = fieldGrad(p0[0], p0[1], p0[2], DOME_OPTS);
  // under the bare globe the hidden shell's normals point straight out from the eye's centre: they are those of the
  // closed cup when a blink pulls the shell over the retracted eye (the morph moves positions, not normals)
  {
    const e = FEAT.eyes[0];
    const o = sub(p0, e.c);
    const k = smoothstep(0.0, 0.15, windowAngle(o, e.D));
    if (k > 0) n = norm3(add(scl(n, 1 - k), scl(norm3(o), k)));
  }
  // where the dome has merged into the head the two surfaces coincide: the dome's skirt runs on over the head's skin
  // (drawn over it with a depth offset, see the 'overlay' material) and its normals turn to the head's, so the dome's
  // edge lies on the head with nothing to show it but the texture, painted from the same 3D pattern
  if (field(p0[0], p0[1], p0[2]) < 0.5) {
    const { gap, hn } = headGap(p0);
    const wn = 1 - smoothstep(0.0, 0.18, gap);
    if (wn > 0) n = norm3(add(scl(n, 1 - wn), scl(hn, wn)));
  }
  const p = p0;
  if (side < 0) return { p: [p[0], p[1], -p[2]], n: [n[0], n[1], -n[2]], p0: [p0[0], p0[1], -p0[2]], th, M };
  return { p, n, p0, th, M };
}

/** the shut cup (blink) for a dome point: along the same ray from the eye's centre, fading out over the skirt */
function domeShut(fr, a, ps, open) {
  const side = fr.P[2] >= 0 ? 1 : -1;
  const frL = domeFrame(1);
  const pL = side > 0 ? open.p : [open.p[0], open.p[1], -open.p[2]];
  const dir = norm3(sub(pL, frL.c));
  const tOpen = Math.hypot(...sub(pL, frL.c));
  // the shut cup lies inside the open one: a point moves in along its ray to the shut surface (never out)
  const q = rayExit(frL.c, dir, { dome: true, cupL: false });
  // (under the window - the hidden shell beneath the bare globe - every point goes to the shut cup, out as well as in)
  const win = smoothstep(-0.12, 0.04, windowAngle(dir, FEAT.eyes[0].D));
  const w = (1 - smoothstep(open.M.aThc - 0.2, open.M.aThc + 0.6, a)) * Math.max(win, smoothstep(0.0, 0.25, tOpen - q.t));
  const nL = side > 0 ? open.n : [open.n[0], open.n[1], -open.n[2]];
  // past the cup (the walked skirt: the stalk, the web between the eyes) a point sinks straight in along its normal
  // onto the shut surface, where that lies inside the open one (on the head nothing moves). The web itself, near the
  // midline, goes to its own target (blinkWeb, driven by either eye's blink), so a one-eyed blink leaves no step.
  const sink = (SH) => {
    if (field(pL[0], pL[1], pL[2], SH) <= 0.01) return { dN: [0, 0, 0], nN: nL };
    const g = (t) => field(pL[0] - nL[0] * t, pL[1] - nL[1] * t, pL[2] - nL[2] * t, SH);
    let lo = 0, hi = 0.05;
    while (hi < 3 && g(hi) > 0) { lo = hi; hi += 0.05; }
    if (hi >= 3) return { dN: [0, 0, 0], nN: nL };
    for (let k = 0; k < 20; k++) { const m = 0.5 * (lo + hi); if (g(m) > 0) lo = m; else hi = m; }
    const t = 0.5 * (lo + hi);
    const pt = sub(pL, scl(nL, t));
    return { dN: scl(nL, -t), nN: fieldGrad(pt[0], pt[1], pt[2], SH) };
  };
  const web = (1 - w) * smoothstep(1.1, 0.35, Math.abs(pL[2]));
  const S1 = w < 1 && web < 1 ? sink({ dome: true, cupL: false }) : { dN: [0, 0, 0], nN: nL };
  const S2 = web > 0 ? sink({ dome: true, cup: false }) : { dN: [0, 0, 0], nN: nL };
  const ws = (1 - w) - web;
  const d = add(scl(sub(q.p, pL), w), scl(S1.dN, ws));
  const dW = scl(S2.dN, web);
  // the normal deltas: toward the shut surface's normal, by the same weights
  const dn = add(scl(sub(q.n, nL), w), scl(sub(S1.nN, nL), ws));
  const dnW = scl(sub(S2.nN, nL), web);
  const m = (v) => (side > 0 ? v : [v[0], v[1], -v[2]]);
  return { d: m(d), dn: m(dn), dW: m(dW), dnW: m(dnW) };
}

/** the longest meridian's arc length: the dome's rows run from 0 to this (a shorter meridian stays at its end) */
let ARC_MAX = null;
const NPSI = 128;
export function domeArcMax() {
  if (ARC_MAX === null) {
    ARC_MAX = 0;
    for (let j = 0; j < NPSI; j++) ARC_MAX = Math.max(ARC_MAX, meridianArc((j / NPSI) * TAU, false).len);
  }
  return ARC_MAX;
}

/** both domes: one primitive, left then right (mirrored), with blink targets (left dome, right dome) */
export function buildDomes(NT = 40, NP = 96) {
  const cols = NP + 1;
  const sides = [1, -1];
  const position = [], normal = [], tangent = [], uv = [], fish = [], blinkL = [], blinkR = [], blinkLn = [], blinkRn = [], blinkW = [], blinkWn = [];
  const tris = [];
  sides.forEach((side, si) => {
    const fr = domeFrame(side);
    const base = fish.length / 3;
    const amax = domeArcMax();
    for (let i = 0; i <= NT; i++) {
      for (let j = 0; j <= NP; j++) {
        const ps = (j / NP) * TAU;
        const a = (i / NT) * amax;
        const D = domePoint(fr, a, ps);
        const { p, n } = D;
        fish.push(...p);
        position.push(...toObject(p));
        normal.push(...dirToObject(n));
        // tangent along the meridian
        const q = domePoint(fr, Math.min(D.M.len, a + 0.03), ps).p, q0 = domePoint(fr, Math.max(0, Math.min(D.M.len, a) - 0.03), ps).p;
        let tg = dirToObject(sub(q, q0));
        const nn = dirToObject(n);
        tg = sub(tg, scl(nn, dot(tg, nn)));
        let tl = Math.hypot(...tg);
        if (tl < 1e-9) { tg = norm3(cross(nn, Math.abs(nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])); tl = 1; }
        tangent.push(tg[0] / tl, tg[1] / tl, tg[2] / tl, 1);
        uv.push(domeU(i / NT), j / NP);
        const sh = domeShut(fr, a, ps, D);
        const dd = scl(dirToObject(sh.d), 1 / 1000); // mm → m
        const dnn = dirToObject(sh.dn);
        (side > 0 ? blinkLn : blinkRn).push(...dnn);
        (side > 0 ? blinkRn : blinkLn).push(0, 0, 0);
        (side > 0 ? blinkL : blinkR).push(...dd);
        (side > 0 ? blinkR : blinkL).push(0, 0, 0);
        blinkW.push(...scl(dirToObject(sh.dW), 1 / 1000));
        blinkWn.push(...dirToObject(sh.dnW));
      }
    }
    for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
      const a = base + i * cols + j, b = base + (i + 1) * cols + j, c = base + (i + 1) * cols + j + 1, d = base + i * cols + j + 1;
      tris.push(a, b, c, a, c, d);
    }
    // outward winding check at mid theta
    const k = base + Math.floor(NT / 2) * cols + 3;
    const P = (m) => position.slice(m * 3, m * 3 + 3);
    const fn = cross(sub(P(k + cols), P(k)), sub(P(k + cols + 1), P(k)));
    const nk = normal.slice(k * 3, k * 3 + 3);
    if (dot(fn, nk) < 0) for (let m = (base / cols) * 0 + tris.length - NT * NP * 6; m < tris.length; m += 3) { const t = tris[m + 1]; tris[m + 1] = tris[m + 2]; tris[m + 2] = t; }
  });
  return {
    position: new Float32Array(position), normal: new Float32Array(normal), tangent: new Float32Array(tangent), uv: new Float32Array(uv),
    indices: new Uint32Array(tris), fish, blinkL: new Float32Array(blinkL), blinkR: new Float32Array(blinkR),
    blinkLn: new Float32Array(blinkLn), blinkRn: new Float32Array(blinkRn), blinkW: new Float32Array(blinkW), blinkWn: new Float32Array(blinkWn),
  };
}

/**
 * Mouth interior: a pouch hanging from the upper and lower cut edges into the head (palate above, floor below),
 * dark and wet; seen only while the jaw is open.
 */
export function buildMouth(G) {
  const { verts, jawCopy } = G;
  // the cut along the gape, from the left mouth corner across the front to the right corner (buildSkin)
  const ring = G.gape;
  const up = ring.map((g) => verts[g].fish);
  const lo = ring.map((g) => verts[jawCopy.get(g) ?? g].fish);
  const NR = 9; // rows from the lip edge into the cavity
  const position = [], normal = [], uv = [], color = [], fishPts = [], zone = [], lipPts = [], depth = [];
  const rows = [];
  // The mouth cavity, a pouch behind the lips: from each lip point the palate runs back and up under the snout and the
  // floor back and down into the lower jaw's U, narrowing a little; the deepest rows are joined by the back wall of
  // the throat, and at each corner the palate's and the floor's first columns by the inner wall of the cheek.
  const cavity = (p, upper, f) => {
    const gy = gapeY(clamp(p[0], MOUTH[0][0], RICTUS_S));
    const k = Math.sin(f * Math.PI * 0.5);
    const sT = Math.min(p[0] + 2.4, 3.6);
    const yT = gy + (upper ? 0.9 : -0.7);
    return [p[0] + (sT - p[0]) * f, p[1] + (yT - p[1]) * k, p[2] * (1 - (upper ? 0.45 : 0.3) * f)];
  };
  for (const upper of [true, false]) {
    const edge = upper ? up : lo;
    for (let r = 0; r <= NR; r++) {
      const f = r / NR;
      const row = [];
      for (let k = 0; k < edge.length; k++) {
        // (the first row on the lip's own edge, so no gap opens between the lip and the inside of the mouth)
        const p = r === 0 ? [...edge[k]] : cavity(edge[k], upper, Math.max(f, 0.06));
        row.push(position.length / 3);
        position.push(...toObject(p));
        fishPts.push(p);
        zone.push(upper ? 0 : 1);
        lipPts.push(edge[k]);
        depth.push(f);
        uv.push(k / (edge.length - 1), f * 0.5 + (upper ? 0 : 0.5));
        // the lip margin is skin-coloured; inside, the wet mucosa darkens quickly into the throat
        // (linear colours) a pinkish lip margin, then wet dark mucosa going black toward the throat
        // (photograph 6: a pinkish-beige margin, then dull brownish pink, dark toward the throat)
        // (under the upper lip the roof of the mouth is in its shadow: dark from the edge in)
        const shade = 1 - 0.96 * smoothstep(0.02, upper ? 0.12 : 0.2, f);
        const lip = (1 - smoothstep(0.0, 0.1, f)) * (upper ? 0.4 : 1);
        color.push((0.12 + 0.14 * lip) * shade + 0.006, (0.05 + 0.11 * lip) * shade + 0.004, (0.045 + 0.09 * lip) * shade + 0.004, 1);
        normal.push(0, upper ? -1 : 1, 0);
      }
      rows.push(row);
    }
  }
  const W = up.length;
  // (the lip's edge steps a little unevenly along the gape, and the rows drawn in from it would carry those steps
  // back into the mouth as ribs: the deeper rows are smoothed along the gape)
  for (const row of rows) {
    const r = rows.indexOf(row) % (NR + 1);
    if (r < 1) continue;
    for (let it = 0; it < Math.max(6, Math.round(W / 8)); it++) {
      const P = row.map((v) => position.slice(v * 3, v * 3 + 3));
      for (let k = 1; k < W - 1; k++) for (let c = 0; c < 3; c++) position[row[k] * 3 + c] = 0.5 * P[k][c] + 0.25 * (P[k - 1][c] + P[k + 1][c]);
    }
  }
  const tris = [];
  for (let part = 0; part < 2; part++) for (let r = 0; r < NR; r++) {
    const A = rows[part * (NR + 1) + r], B = rows[part * (NR + 1) + r + 1];
    for (let k = 0; k < W - 1; k++) {
      if (part === 0) tris.push(A[k], B[k], B[k + 1], A[k], B[k + 1], A[k + 1]);
      else tris.push(A[k], B[k + 1], B[k], A[k], A[k + 1], B[k + 1]);
    }
  }
  // the cheeks' inner walls: at each corner the palate's and the floor's first columns start together and part as
  // they run back
  for (const k of [0, W - 1]) for (let r = 0; r < NR; r++) {
    const a0 = rows[r][k], a1 = rows[r + 1][k], b0 = rows[NR + 1 + r][k], b1 = rows[NR + 1 + r + 1][k];
    tris.push(a0, a1, b1, a0, b1, b0);
  }
  // the back wall of the throat: the deepest palate row joined to the deepest floor row
  const Ap = rows[NR], Bf = rows[2 * NR + 1];
  for (let k = 0; k < W - 1; k++) tris.push(Ap[k], Bf[k], Bf[k + 1], Ap[k], Bf[k + 1], Ap[k + 1]);
  // smooth normals from the triangles
  const nrm = new Float32Array(position.length);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const pa = position.slice(a * 3, a * 3 + 3), pb = position.slice(b * 3, b * 3 + 3), pc = position.slice(c * 3, c * 3 + 3);
    const fn = cross(sub(pb, pa), sub(pc, pa));
    for (const v of [a, b, c]) { nrm[v * 3] += fn[0]; nrm[v * 3 + 1] += fn[1]; nrm[v * 3 + 2] += fn[2]; }
  }
  for (let v = 0; v < nrm.length / 3; v++) { const n = norm3([nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]]); nrm.set(n, v * 3); }
  return {
    name: 'Mouth', position: new Float32Array(position), normal: nrm, uv: new Float32Array(uv), color: new Float32Array(color),
    indices: new Uint32Array(tris), fish: fishPts, zone, lip: lipPts, depth,
  };
}

// =============================================================================================== textures

/** sRGB 0..255 helpers */
const C = (r, g, b) => [r, g, b];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// colours read from the photos (wet animal in daylight, sRGB)
const COL = {
  dorsal: C(92, 89, 80),
  flank: C(132, 128, 117),
  belly: C(206, 202, 194),
  throat: C(140, 134, 122),
  dark: C(44, 41, 37),
  speck: C(50, 46, 42),
  pale: C(218, 222, 218),
  blue: C(172, 202, 216),
  lip: C(198, 188, 174),
  arm: C(172, 160, 142),
  grain: C(236, 234, 226),
};

/** jittered dot field on the surface (3D cells): returns coverage 0..1 of dots of radius r (mm) at density */
/** height of the snout tip, the pole where the loft's texture columns meet */
const SNOUT_POLE_Y = section(0).yc;
/** the average of a dot pattern over the skin (sampled once): its tone where the dots themselves are left out */
const DOT_MEAN = new Map();
function dotMean(cell, r, seed, keep = 1, jitterR = 0.4) {
  const key = `${cell}|${r}|${seed}|${keep}|${jitterR}`;
  let m = DOT_MEAN.get(key);
  if (m === undefined) {
    let acc = 0;
    const N = 8000;
    for (let i = 0; i < N; i++) acc += dots([hash01(i, 1, 2, 977) * 40, hash01(i, 3, 4, 977) * 12 - 2, hash01(i, 5, 6, 977) * 12 - 6], cell, r, seed, keep, jitterR);
    m = acc / N;
    DOT_MEAN.set(key, m);
  }
  return m;
}
/** like dots(), but each grain an irregular, flattened chip (a random axis squashed to 0.5-1 of its width, a crisp edge) */
function grainDots(p, cell, r, seed, keep = 1) {
  let cov = 0;
  const x = p[0] / cell, y = p[1] / cell, z = p[2] / cell;
  forEachCell3(x, y, z, seed, (fx, fy, fz, h) => {
    if ((h >>> 3) / 536870912 > keep) return;
    const rr = (r / cell) * (0.6 + 0.8 * (((h >>> 7) & 255) / 255));
    const a = norm3([((h >>> 11) & 255) / 127.5 - 1, ((h >>> 19) & 255) / 127.5 - 1, ((h >>> 1) & 63) / 31.5 - 1 + 1e-3]);
    const k = 0.5 + 0.5 * (((h >>> 15) & 15) / 15);
    const v = [x - fx, y - fy, z - fz];
    const t = v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
    const w = [v[0] - a[0] * t, v[1] - a[1] * t, v[2] - a[2] * t];
    // a lumpy outline: the radius wobbles with direction
    const wob = 1 + 0.22 * Math.sin(7 * Math.atan2(w[1], w[0] + 1e-6) + (h & 31));
    const d = Math.hypot(t / k, w[0], w[1], w[2]) / wob;
    cov = Math.max(cov, smoothstep(rr, rr * 0.78, d));
  });
  return cov;
}
function dots(p, cell, r, seed, keep = 1, jitterR = 0.4) {
  let cov = 0;
  const x = p[0] / cell, y = p[1] / cell, z = p[2] / cell;
  forEachCell3(x, y, z, seed, (fx, fy, fz, h) => {
    if ((h >>> 3) / 536870912 > keep) return;
    const rr = (r / cell) * (1 - jitterR + jitterR * 2 * (((h >>> 7) & 255) / 255));
    const d = Math.hypot(fx - x, fy - y, fz - z);
    cov = Math.max(cov, smoothstep(rr, rr * 0.55, d));
  });
  return cov;
}

/** pattern for one surface point: returns colour (sRGB 0..255), height (mm), roughness, mud affinity, mucus, sun */
function skinPoint(s, phi, p, n, ao, globe = false) {
  const nh = normHeight(s, p[1]);
  const z = p[2];
  const lat = Math.abs(n[2]);
  const ventral = smoothstep(-0.15, -0.7, nh) * smoothstep(0.1, -0.5, n[1]);
  const dorsal = smoothstep(0.1, 0.75, nh);
  // base colour: dark olive-brown back, lighter flanks, pale belly; the throat and chin a little darker than the belly
  let col = lerp3(COL.flank, COL.dorsal, dorsal);
  // (the chin and throat are grey-brown like the face, paling only toward the belly behind the head)
  col = lerp3(col, lerp3(COL.throat, COL.belly, smoothstep(11, 19, s)), ventral * mix(0.6, 1, smoothstep(6, 14, s)));
  // broad mottling
  const mott = fbm3(p[0] * 0.18, p[1] * 0.18, p[2] * 0.18, 4, 11);
  col = col.map((c) => c * (1 + 0.16 * mott));
  // dorsal saddles (「く」-shaped: from above they point forward) and a mid-lateral row of irregular blotches
  let dark = 0;
  if (s > 17) {
    const SAD = [21.5, 28.5, 35.5, 42.5, 49.5, 56.5];
    const warp = 1.4 * fbm3(p[0] * 0.22, p[1] * 0.35, p[2] * 0.35, 3, 23);
    for (const c of SAD) {
      const cs = c + 1.3 * (0.75 - nh) * 0.8;
      const ds = (s + warp - cs) / (1.25 + 0.35 * smoothstep(20, 60, s));
      const saddle = Math.exp(-ds * ds * 2.0) * smoothstep(0.15, 0.6, nh) * (0.55 + 0.45 * smoothstep(0.98, 0.7, nh));
      dark = Math.max(dark, saddle);
      // faint oblique bars down the flank, slanting forward and down from the saddles (Taiwan Fish DB), breaking
      // into a row of ragged blotches at mid-flank
      const sb = s + warp * 0.8 - c + 2.2 * (0.55 - nh);
      const bar = Math.exp(-((sb / 1.15) ** 2) * 1.4) * smoothstep(-0.55, -0.1, nh) * smoothstep(0.75, 0.35, nh);
      const bl = (s + warp * 0.8 - c - 1.2) / 1.6;
      const bh = (nh - 0.05 + 0.15 * perlin3(p[0] * 0.6, 3, 7, 29)) / 0.24;
      const blotch = Math.exp(-(bl * bl + bh * bh) * 1.6);
      dark = Math.max(dark, 0.55 * bar, 0.85 * blotch);
    }
    // break everything up into a reticulate, speckled pattern
    const brk = fbm3(p[0] * 0.75, p[1] * 0.75, p[2] * 0.75, 4, 37);
    dark *= smoothstep(-0.45, 0.35, brk + 0.2);
    dark *= 1 - ventral;
  }
  // head: fine reticulate mottling, and the crown and nape darker, in irregular patches (photographs: the top of the
  // head is the darkest part of a live animal, the cheeks lighter)
  if (s < 18) {
    const r = ridged3(p[0] * 0.65, p[1] * 0.65, p[2] * 0.65, 3, 41);
    dark = Math.max(dark, smoothstep(0.74, 0.92, r) * 0.32 * (1 - ventral) * smoothstep(17.5, 13, s));
    const crown = smoothstep(0.25, 0.85, nh) * smoothstep(1.0, 4.0, s);
    const patch = smoothstep(-0.25, 0.35, fbm3(p[0] * 0.55, p[1] * 0.55, p[2] * 0.55, 4, 43));
    dark = Math.max(dark, crown * (0.25 + 0.45 * patch));
  }
  col = lerp3(col, COL.dark, clamp(dark) * 0.66);
  // (the texture's columns converge on the snout tip, the pole of the loft's uv: small dots there would smear into a
  // star, so in a small disc round it each pattern of dots gives way to its own average tone - the same shade,
  // without the dots; the relief stays, so the wet film's highlights break up there as everywhere else)
  const rPole = Math.hypot(Math.max(s, 0), p[1] - SNOUT_POLE_Y, p[2]);
  // (the same at the mouth's corners, where the grid's columns gather onto the gape)
  const RC = FEAT.gapeLine[FEAT.gapeCorner];
  const rCorner = Math.hypot(s - RC[0], p[1] - RC[1], Math.abs(p[2]) - RC[2]);
  // (and along the lips, where the columns are squeezed together onto the cut: the lips are smooth there anyway)
  const lipCalm = Math.max(smoothstep(0.08, 0.5, Math.abs(p[1] - gapeY(clamp(s, MOUTH[0][0], RICTUS_S)))), smoothstep(RICTUS_S + 0.2, RICTUS_S + 0.8, s));
  const tipCalm = smoothstep(0.08, 0.4, rPole) * smoothstep(0.15, 0.75, rCorner) * lipCalm;
  const calmed = (v, cell, r, seed, keep, jitterR) => (tipCalm >= 1 ? v : v * tipCalm + dotMean(cell, r, seed, keep, jitterR) * (1 - tipCalm));
  // melanophore speckle: dense, fine, stronger on the back and head
  const sp = calmed(dots(p, 0.3, 0.085, 101, 0.9), 0.3, 0.085, 101, 0.9) * (0.35 + 0.65 * (1 - ventral)) * (s < 16 ? 1.2 : 1);
  col = lerp3(col, COL.speck, sp * 0.75);
  // a fine, blotchy dark network between the speckles (close-up photographs: the skin reads like grey granite)
  const net = smoothstep(0.05, 0.42, fbm3(p[0] * 4.2, p[1] * 4.2, p[2] * 4.2, 3, 137)) * (1 - ventral) * tipCalm;
  col = lerp3(col, COL.speck, net * (s < 18 ? 0.42 : 0.3));
  // and dark blotches about a millimetre across, between paler, sandier patches
  const blot = smoothstep(0.08, 0.38, fbm3(p[0] * 1.3 + 9, p[1] * 1.3, p[2] * 1.3, 3, 139)) * (1 - ventral);
  col = lerp3(col, COL.dark, blot * 0.32);
  const sp2 = dots(p, 0.9, 0.16, 131, 0.5) * (1 - ventral);
  col = lerp3(col, COL.dark, sp2 * 0.6);
  // and a dense, fine pepper of tiny melanophores over everything but the belly (close up a fine dark network over
  // the head and the back)
  const pepper = calmed(dots(p, 0.16, 0.05, 109, 0.88), 0.16, 0.05, 109, 0.88) * (0.3 + 0.7 * (1 - ventral));
  col = lerp3(col, COL.speck, pepper * (s < 18 ? 0.72 : 0.6));
  // small pale (some bluish) spots over cheeks and flanks
  const pale = calmed(dots(p, s < 18 ? 0.95 : 1.25, 0.21, 211, s < 18 ? 0.8 : 0.55, 0.5), s < 18 ? 0.95 : 1.25, 0.21, 211, s < 18 ? 0.8 : 0.55, 0.5) * smoothstep(-0.6, -0.1, nh) * smoothstep(0.85, 0.3, nh) * (1 - ventral * 0.8);
  const blueish = s < 18 ? 0.65 : 0.25;
  col = lerp3(col, lerp3(COL.pale, COL.blue, blueish), pale * 0.55);
  // lips
  const g = gapeY(Math.min(Math.max(s, MOUTH[0][0]), RICTUS_S));
  if (s < RICTUS_S + 1.2) {
    const dy = p[1] - g;
    const along = smoothstep(RICTUS_S + 0.3, RICTUS_S - 0.12, s);
    const up = dy > 0 ? smoothstep(1.3, 0.5, dy) * along : 0;
    const lo = dy <= 0 ? smoothstep(0.7, 0.2, -dy) * along : 0;
    // (the pale upper lip shows only round the front, at the sides of the snout; head-on, under the snout, the lip is
    // the face's own grey, and along the side of the head the upper jaw is under the lip lobe, the face's own skin)
    const front = 1 - smoothstep(1.2, 1.8, s);
    col = lerp3(col, COL.lip, up * 0.25 * front * smoothstep(0.2, 1.4, s) * (0.25 + 0.75 * smoothstep(0.4, 1.6, Math.abs(z))));
    // the lower lip, paler, all along the gape (photograph 10)
    col = lerp3(col, COL.belly, lo * (0.15 + 0.15 * front));
    col = lerp3(col, COL.dark, smoothstep(0.14, 0.02, Math.abs(dy)) * along * 0.55);
  }
  // (the lip pads are painted as the face round them: the same speckled grey)
  // eye sockets: the cup's skin is paler and smoother toward the window; its margin (and the hidden skin inside the
  // window, which the rim's faces stretch over) a plain darker grey, without speckles
  // round each eye's cup (wa: angle from the lid margin, > 0 on the bare globe): the margin is a pale rim; the
  // skin under the globe (the shut lid in a blink) is the cup's thin, pinkish skin; the cup under the eye is thin,
  // unpigmented skin, pinkish grey (the blood under it shows), fading into the head's pattern down the neck
  // (globe: a point of the eyeball's own skin, painted like the stalk's: the cup's skin running on over it)
  let lid = 0, stalk = globe ? 1 : 0;
  if (!globe) for (const e of FEAT.eyes) {
    const o = [p[0] - e.c[0], p[1] - e.c[1], p[2] - e.c[2]];
    const dE = Math.hypot(o[0], o[1], o[2]);
    const wa = windowAngle(o, e.D);
    const near = smoothstep(EYE.radius + 1.0, EYE.radius + 0.3, dE);
    // the lower lid (the thick rolled part of the cup's margin under the cornea, on the outer face; anatomy.mjs):
    // a smooth, pale, faintly pink band without sand right under the iris (photographs 3 and 10); elsewhere the
    // margin lies flush on the globe and shows nothing
    const lidW = smoothstep(0.3, 0.75, (o[2] * Math.sign(e.c[2])) / Math.max(dE, 1e-3)) * smoothstep(0.1, -0.35, o[1] / Math.max(dE, 1e-3));
    const band = smoothstep(-0.6, -0.25, wa) * smoothstep(0.08, -0.02, wa) * near;
    col = lerp3(col, C(166, 152, 144), band * lidW * 0.55);
    lid = Math.max(lid, band * lidW);
    // (the skin under the globe, hidden while the eye is open, becomes the lid when the cup closes in a blink)
    col = lerp3(col, lerp3(col, C(150, 124, 116), 0.6), smoothstep(0.05, 0.15, wa) * near * 0.6);
    // the stalk under the cup: the head's own speckled grey skin running on up to the globe, a little paler and
    // smoother, with less sand (photographs 3, 8 and 12)
    const neck = smoothstep(EYE.radius + 1.7, EYE.radius + 0.5, dE) * smoothstep(0.2, -0.3, o[1] / Math.max(dE, 1e-3)) * smoothstep(-0.1, 0.05, -wa);
    stalk = Math.max(stalk, neck);
  }
  col = lerp3(col, C(132, 126, 114), stalk * 0.12);
  // sand grains stuck in the mucus: tiny white specks, densest on the head, the turrets and the back
  // (photographed animals glitter with them: fine quartz grains, white, some grey; densest on the crown, the cheeks,
  // the eye domes and the back, sparse on the belly)
  // (photographs close up: grains of every size from fine silt to ~0.5 mm quartz, densest on the crown, the cheeks
  // and round the eyes, in patches where the animal last lay in the sand)
  const patchy = smoothstep(-0.35, 0.35, fbm3(p[0] * 0.35 + 3, p[1] * 0.35, p[2] * 0.35, 3, 161));
  const gd = (0.3 + 0.7 * smoothstep(-0.6, 0.3, nh)) * (s < 18 ? 1 : 0.7) * (1 - lid) * (1 - 0.3 * stalk) * (0.45 + 0.55 * patchy);
  const grainsA = calmed(grainDots(p, 0.26, 0.065, 151, 0.6), 0.26, 0.065, 151, 0.6) * gd;
  const grainsB = calmed(grainDots(p, 0.5, 0.11, 157, 0.55), 0.5, 0.11, 157, 0.55) * gd;
  const grainsC = calmed(grainDots(p, 0.9, 0.2, 167, 0.3 * smoothstep(-0.2, 0.4, nh) * (s < 20 ? 1 : 0.35)), 0.9, 0.2, 167, 0.15) * gd;
  // and a dusting of fine silt: tiny white specks between the grains
  const silt = calmed(dots(p, 0.12, 0.032, 169, 0.55), 0.12, 0.032, 169, 0.55) * gd * (s < 20 ? 1 : 0.6);
  col = lerp3(col, COL.grain, silt * 0.7);
  const grains = Math.max(grainsA, grainsB, grainsC);
  // quartz white or clear (taking the skin's colour through it), a few grey or buff
  const gh = hash01(Math.floor(p[0] / 0.26), Math.floor(p[1] / 0.26), Math.floor(p[2] / 0.26), 159);
  const gcol = gh < 0.2 ? C(150, 146, 136) : gh < 0.32 ? C(196, 176, 140) : gh < 0.55 ? lerp3(col, COL.grain, 0.55) : COL.grain;
  col = lerp3(col, gcol, grains * 0.92);
  // pectoral lobe: a little paler where the arm leaves the flank
  {
    const L = FEAT.pecLobe;
    const d = Math.hypot((p[0] - L[0]) / 2.6, (p[1] - L[1]) / 2.2, (Math.abs(z) - L[2]) / 1.4);
    col = lerp3(col, COL.arm, smoothstep(1.2, 0.6, d) * 0.15);
  }
  col = col.map((c) => c * (0.8 + 0.2 * ao));

  // ---------------- height (mm) for the normal map
  let h = 0;
  if (s > 16.5 && s < S_END) {
    // small cycloid scales, in oblique rows; ~0.8 mm on the trunk, smaller toward the head and on the belly
    const size = 0.78 * (0.75 + 0.25 * smoothstep(17, 30, s)) * (1 - 0.25 * ventral);
    const arc = phi * 6.0;
    const u = s / size, v = (arc + 0.5 * s * 0.0) / (size * 0.95);
    const row = Math.floor(v);
    const uu = u + (row & 1) * 0.5;
    const fu = uu - Math.floor(uu), fv = v - row;
    // scale: dome rising toward its free (posterior) edge, a step at the edge
    const dome = smoothstep(0.0, 0.85, fu) * (1 - smoothstep(0.86, 1.0, fu));
    const side = 1 - Math.pow(Math.abs(fv - 0.5) * 2, 3);
    h += 0.018 * dome * side * smoothstep(16.5, 19, s);
  }
  // sand grains stand proud of the skin, rounded
  h += 0.04 * Math.max(grainsA, grainsB) + 0.07 * grainsC;
  // the skin itself is finely granular (tiny tubercles under the mucus)
  h += 0.009 * dots(p, 0.13, 0.05, 171, 0.9, 0.5) + 0.005 * dots(p, 0.07, 0.028, 173, 0.9, 0.5);
  // head: sensory papillae rows and pores, fine wrinkles
  if (s < 18) {
    h += 0.02 * dots(p, 0.55, 0.09, 307, 0.6) + 0.012 * ridged3(p[0] * 2.2, p[1] * 2.2, p[2] * 2.2, 2, 53);
  }
  // skin micro-relief everywhere (mucus-covered, granular)
  h += 0.007 * fbm3(p[0] * 5, p[1] * 5, p[2] * 5, 3, 61) + 0.004 * perlin3(p[0] * 14, p[1] * 14, p[2] * 14, 71);
  // folds behind the head and around the pectoral base
  h += 0.02 * Math.sin((s - 14) * 5.5 + perlin3(p[0], p[1], p[2], 81) * 2) * smoothstep(14, 16, s) * smoothstep(21, 18, s) * smoothstep(-0.2, 0.3, nh) * 0.7;
  // myomeres: faint W-shaped grooves on the trunk
  if (s > 20 && s < 62) {
    const m = (s - 20) / 1.55 + Math.abs(nh) * 1.4;
    h -= 0.01 * Math.pow(Math.abs(Math.sin(m * Math.PI)), 12) * (1 - ventral);
  }

  // (the fine relief fades out over the snout's tip, where the texels still run long toward the uv pole and would draw
  // it out into radial streaks)
  h *= smoothstep(0.1, 1.2, rPole) * smoothstep(0.1, 0.7, rCorner) * lipCalm;
  // (the skin of the eyes' base is a little smoother)
  h *= 1 - 0.35 * stalk;
  // ---------------- roughness and skin data
  // (grains are dry, frosted quartz: matte)
  let rough = 0.52 + 0.08 * fbm3(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, 2, 91) + 0.06 * dorsal + 0.2 * grains;
  const mudAff = clamp(ventral * 0.8 + smoothstep(0.0, -0.6, nh) * 0.35 + (1 - ao) * 0.6 + 0.25 * fbm3(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4, 3, 97));
  // (right on the snout's tip, where the texture's columns meet, the film is thinner and the skin a little rougher:
  // no sharp glint gathers on the pole)
  const poleMatte = 1 - smoothstep(0.1, 0.7, rPole);
  rough += 0.22 * poleMatte;
  // (grains stick out of the mucus film: they dry first)
  const mucus = clamp(0.55 + 0.35 * (1 - ao) + 0.2 * ventral - 0.25 * dorsal + 0.2 * fbm3(p[0] * 0.7, p[1] * 0.7, p[2] * 0.7, 3, 103) - 0.45 * poleMatte - 0.7 * grains);
  // what dries first in the sun and wind: the top of the head, the eye turrets and the back
  let sun = clamp(smoothstep(0.0, 0.8, n[1]) * 0.8 + 0.2 * dorsal);
  for (const e of FEAT.eyes) sun = Math.max(sun, smoothstep(EYE.radius + 1.6, EYE.radius + 0.3, Math.hypot(p[0] - e.c[0], p[1] - e.c[1], p[2] - e.c[2])) * 0.9);
  return { col, h, rough, mudAff, mucus, sun, lat };
}

/**
 * Bake the skin textures over the uv layout (u = uvTof(s, phi) · BODY_U, v = phi / 2π) plus the pectoral arm strip
 * (u ∈ [BODY_U, 1]), from a projected grid.
 */
export function bakeSkinTextures({ W, H, armPaint, armPoint = null, armOcclusion = null, armShare = null, log = () => {} }) {
  // projected bake grid, regular in the texture's t (arc length along each column, see uvTof) and phi, so it
  // follows the surface up steep walls (eye sockets, the snout's face) instead of cutting through the air
  const NSb = Math.max(240, Math.round(W * BODY_U * 0.2)), NVb = Math.max(128, Math.round(H * 0.2));
  log(`  bake grid ${NSb}×${NVb} …`);
  const GP = new Float32Array((NSb + 1) * (NVb + 1) * 3), GN = new Float32Array((NSb + 1) * (NVb + 1) * 3), GA = new Float32Array((NSb + 1) * (NVb + 1));
  for (let i = 0; i <= NSb; i++) {
    for (let j = 0; j <= NVb; j++) {
      const phi = (j / NVb) * TAU;
      const s = Math.min(S_END - 0.005, Math.max(0.003, uvSof(i / NSb, phi)));
      const p = project(basePoint(s, phi));
      const nn = fieldGrad(p[0], p[1], p[2]);
      const k = i * (NVb + 1) + j;
      GP.set(p, k * 3); GN.set(nn, k * 3);
      let occ = 0;
      const dks = [0.12, 0.3, 0.6, 1.1, 1.8], wks = [0.3, 0.27, 0.2, 0.14, 0.09];
      for (let m = 0; m < dks.length; m++) {
        const d = dks[m];
        occ += (wks[m] * Math.max(0, d - field(p[0] + nn[0] * d, p[1] + nn[1] * d, p[2] + nn[2] * d, DOME_OPTS))) / d;
      }
      GA[k] = clamp(1 - occ * 1.2, 0.25, 1);
    }
    if (i % 40 === 0) log(`    bake row ${i}/${NSb}`);
  }
  const sample = (u, v) => {
    const fi = clamp(u, 0, 1) * NSb, fj = clamp(v, 0, 1) * NVb;
    const i = Math.min(NSb - 1, Math.floor(fi)), j = Math.min(NVb - 1, Math.floor(fj));
    const a = fi - i, b = fj - j;
    const k00 = i * (NVb + 1) + j, k10 = k00 + NVb + 1, k01 = k00 + 1, k11 = k10 + 1;
    const w = [(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b];
    const p = [0, 0, 0], n = [0, 0, 0];
    let ao = 0;
    [k00, k10, k01, k11].forEach((k, m) => {
      for (let c = 0; c < 3; c++) { p[c] += GP[k * 3 + c] * w[m]; n[c] += GN[k * 3 + c] * w[m]; }
      ao += GA[k] * w[m];
    });
    return { p, n: norm3(n), ao };
  };
  // arc length per radian of phi along each grid row (for the normal map's metric)
  const arcPerRad = new Float32Array(NSb + 1);
  for (let i = 0; i <= NSb; i++) {
    let L = 0;
    for (let j = 0; j < NVb; j++) {
      const a = (i * (NVb + 1) + j) * 3, b = a + 3;
      L += Math.hypot(GP[b] - GP[a], GP[b + 1] - GP[a + 1], GP[b + 2] - GP[a + 2]);
    }
    arcPerRad[i] = Math.max(L / TAU, 0.05);
  }

  log('  painting skin …');
  const albedo = new Uint8Array(W * H * 3), orm = new Uint8Array(W * H * 3), data = new Uint8Array(W * H * 3);
  const height = new Float32Array(W * H);
  const WB = Math.round(W * BODY_U);
  const TEXSP = new Float32Array(W * H * 2);
  const TIPR = new Float32Array(W * H).fill(99); // distance (mm) of a body texel from the snout's uv pole
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < WB; x++) {
      const t = (x + 0.5) / WB;
      const { s, phi } = uvInverse(t, v);
      TEXSP[(y * W + x) * 2] = s; TEXSP[(y * W + x) * 2 + 1] = phi;
      const { p, n, ao } = sample(t, phi / TAU);
      TIPR[y * W + x] = Math.hypot(Math.max(s, 0), p[1] - SNOUT_POLE_Y, p[2]);
      const r = skinPoint(s, phi, p, n, ao);
      const k = y * W + x;
      for (let c = 0; c < 3; c++) albedo[k * 3 + c] = clamp(Math.round(r.col[c]), 0, 255);
      height[k] = r.h;
      orm[k * 3] = Math.round(255 * ao);
      orm[k * 3 + 1] = Math.round(255 * clamp(r.rough));
      orm[k * 3 + 2] = 0;
      data[k * 3] = Math.round(255 * r.mudAff);
      data[k * 3 + 1] = Math.round(255 * r.mucus);
      data[k * 3 + 2] = Math.round(255 * r.sun);
    }
    if (y % 128 === 0) log(`    paint row ${y}/${H}`);
  }
  // the pectoral arm strip (arm.mjs): its root and the skirt it lays on the flank wear the body's own skin (sampled at
  // the same points, so the speckles and the occlusion run on across its edge), handing over to the arm's paint toward
  // the hand
  const WA1 = Math.round(W * ARM_U[1]);
  const WA = WA1 - WB;
  const NFa = 128, NAa = 72;
  const AG = [];
  if (armPoint) for (let i = 0; i <= NFa; i++) {
    for (let j = 0; j <= NAa; j++) {
      const { p, n, a } = armPoint(i / NFa, (j / NAa) * TAU);
      AG.push({ p, n, a, ao: armOcclusion(p, n), share: armShare ? armShare(p) : 0 });
    }
    if (i % 32 === 0) log(`    arm grid ${i}/${NFa}`);
  }
  const asample = (g, v) => {
    const fi = clamp(g, 0, 1) * NFa, fj = clamp(v, 0, 1) * NAa;
    const i = Math.min(NFa - 1, Math.floor(fi)), j = Math.min(NAa - 1, Math.floor(fj));
    const a = fi - i, b = fj - j;
    const ks = [i * (NAa + 1) + j, (i + 1) * (NAa + 1) + j, i * (NAa + 1) + j + 1, (i + 1) * (NAa + 1) + j + 1];
    const w = [(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b];
    const p = [0, 0, 0], n = [0, 0, 0];
    let at = 0, ao = 0, share = 0;
    ks.forEach((kk, m) => { for (let c = 0; c < 3; c++) { p[c] += AG[kk].p[c] * w[m]; n[c] += AG[kk].n[c] * w[m]; } at += AG[kk].a * w[m]; ao += AG[kk].ao * w[m]; share += AG[kk].share * w[m]; });
    return { p, n: norm3(n), at, ao, share };
  };
  // mm per texel along u and v over the arm strip (for the normal map), from the grid's spacing
  const AMM = new Float32Array(WA * H * 2).fill(0.05);
  const agP = (i, j) => AG[Math.min(NFa, Math.max(0, i)) * (NAa + 1) + ((j % NAa) + NAa) % NAa].p;
  for (let y = 0; y < H; y++) for (let x = 0; x < WA; x++) {
    const ua = (x + 0.5) / WA, va = (y + 0.5) / H;
    if (!armPoint) continue;
    const g = asample((ua - 0.02) / 0.96, va);
    {
      const i = Math.min(NFa - 1, Math.max(0, Math.floor(((ua - 0.02) / 0.96) * NFa))), j = Math.min(NAa - 1, Math.floor(va * NAa));
      const du = Math.hypot(...[0, 1, 2].map((c) => agP(i + 1, j)[c] - agP(i, j)[c])) * NFa / 0.96;
      const dv = Math.hypot(...[0, 1, 2].map((c) => agP(i, j + 1)[c] - agP(i, j)[c])) * NAa;
      AMM[(y * WA + x) * 2] = du / WA; AMM[(y * WA + x) * 2 + 1] = dv / H;
    }
    // (the arm's own paint is laid out along its axis as it always was: 0 deep in the flank … 1 at the hand's edge)
    let r = armPaint(clamp((g.at + 2.4) / 8.6, 0, 1), va);
    const ao = Math.min(r.ao, g.ao);
    const w = 1 - smoothstep(3.2, 4.6, g.at);
    if (w > 1e-3) {
      // (the arm hangs below the body's mid-height, where the skin would be painted as belly: it wears the flank's
      // skin instead - painted as if it lay on the flank beside its root - turning into the body's own paint exactly
      // where its skirt lies on the body)
      const pc = [g.p[0], g.p[1] + 2.8 * g.share, g.p[2]];
      const nc = norm3([g.n[0] * (1 - g.share), g.n[1] * (1 - g.share) + 0.15 * g.share, g.n[2] * (1 - g.share) + Math.sign(g.p[2] || 1) * g.share]);
      const b = skinPoint(pc[0], invPhi(pc[0], pc[1], pc[2]), pc, nc, g.ao);
      r = {
        col: r.col.map((c, i) => mix(c, b.col[i], w)), h: mix(r.h, b.h, w), rough: mix(r.rough, b.rough, w),
        mudAff: mix(r.mudAff, b.mudAff, w), mucus: mix(r.mucus, b.mucus, w), sun: mix(r.sun, b.sun, w),
      };
    }
    const k = y * W + WB + x;
    for (let c = 0; c < 3; c++) albedo[k * 3 + c] = clamp(Math.round(r.col[c]), 0, 255);
    height[k] = r.h;
    orm[k * 3] = Math.round(255 * ao); orm[k * 3 + 1] = Math.round(255 * clamp(r.rough)); orm[k * 3 + 2] = 0;
    data[k * 3] = Math.round(255 * r.mudAff); data[k * 3 + 1] = Math.round(255 * r.mucus); data[k * 3 + 2] = Math.round(255 * r.sun);
  }
  // the eye-dome strip (left dome; the right one is its mirror image): a grid over its meridians, by arc length
  log('  eye domes …');
  const WD = W - WA1;
  const NTd = 96, NPd = 240;
  const fr = domeFrame(1);
  const amax = domeArcMax();
  const DP = [], DN = [], DA = [];
  for (let i = 0; i <= NTd; i++) for (let j = 0; j <= NPd; j++) {
    const ps = (j / NPd) * TAU;
    const { p, n, p0 } = domePoint(fr, (i / NTd) * amax, ps);
    DP.push(p); DN.push(n);
    // occlusion, as for the head's skin
    let occ = 0;
    const dks = [0.12, 0.3, 0.6, 1.1], wks = [0.3, 0.27, 0.2, 0.14];
    for (let m = 0; m < dks.length; m++) occ += (wks[m] * Math.max(0, dks[m] - field(p0[0] + n[0] * dks[m], p0[1] + n[1] * dks[m], p0[2] + n[2] * dks[m], DOME_OPTS))) / dks[m];
    DA.push(clamp(1 - occ * 1.2, 0.25, 1));
  }
  const dsample = (ti, pj) => {
    const fi = clamp(ti, 0, 1) * NTd, fj = clamp(pj, 0, 1) * NPd;
    const i = Math.min(NTd - 1, Math.floor(fi)), j = Math.min(NPd - 1, Math.floor(fj));
    const a = fi - i, b = fj - j;
    const ks = [i * (NPd + 1) + j, (i + 1) * (NPd + 1) + j, i * (NPd + 1) + j + 1, (i + 1) * (NPd + 1) + j + 1];
    const w = [(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b];
    const p = [0, 0, 0], n = [0, 0, 0];
    let ao = 0;
    ks.forEach((kk, m) => { for (let c = 0; c < 3; c++) { p[c] += DP[kk][c] * w[m]; n[c] += DN[kk][c] * w[m]; } ao += DA[kk] * w[m]; });
    // mm per unit of the texture's u and v here
    const kk = ks[0];
    const du = Math.hypot(...sub(DP[Math.min(kk + NPd + 1, DP.length - 1)], DP[kk])) * NTd / 0.92;
    const dv = Math.hypot(...sub(DP[kk + 1], DP[kk])) * NPd;
    return { p, n: norm3(n), ao, du, dv };
  };
  const DMM = new Float32Array(WD * H * 2);
  const domeMM = amax / (WD * 0.92);
  for (let y = 0; y < H; y++) for (let x = 0; x < WD; x++) {
    const ti = ((x + 0.5) / WD - 0.03) / 0.92, pj = (y + 0.5) / H;
    const { p, n, ao, du, dv } = dsample(ti, pj);
    const r = skinPoint(p[0], invPhi(p[0], p[1], p[2]), p, n, ao);
    const k = y * W + WA1 + x;
    for (let c = 0; c < 3; c++) albedo[k * 3 + c] = clamp(Math.round(r.col[c]), 0, 255);
    height[k] = r.h;
    orm[k * 3] = Math.round(255 * ao); orm[k * 3 + 1] = Math.round(255 * clamp(r.rough)); orm[k * 3 + 2] = 0;
    data[k * 3] = Math.round(255 * r.mudAff); data[k * 3 + 1] = Math.round(255 * r.mucus); data[k * 3 + 2] = Math.round(255 * r.sun);
    DMM[(y * WD + x) * 2] = Math.max(du / WD, 1e-4); DMM[(y * WD + x) * 2 + 1] = Math.max(dv / H, 1e-4);
  }
  // normal map from the height field (metric: mm per texel along u and v)
  log('  normal map …');
  const normal = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    const inDome = x >= WA1, inArm = x >= WB && !inDome;
    const x0 = inDome ? WA1 : inArm ? WB : 0, x1 = inDome ? W - 1 : inArm ? WA1 - 1 : WB - 1;
    const xl = Math.max(x0, x - 1), xr = Math.min(x1, x + 1);
    const yu = (y + H - 1) % H, yd = (y + 1) % H;
    let mmU, mmV;
    // (on the dome, rows past a short meridian's end collapse onto it: floor the metric so the relief does not spike)
    if (inDome) { mmU = Math.max(DMM[(y * WD + x - WA1) * 2], 0.5 * domeMM); mmV = Math.max(DMM[(y * WD + x - WA1) * 2 + 1], 0.3 * domeMM); }
    else if (inArm) { mmU = Math.max(AMM[(y * WA + x - WB) * 2], 0.002); mmV = Math.max(AMM[(y * WA + x - WB) * 2 + 1], 0.002); } else {
      // u and v are arc lengths along the column and around the row: a texel spans length / texels on the surface
      const sp = TEXSP[k * 2], phi = TEXSP[k * 2 + 1];
      mmU = Math.max(uvArcRate((x + 0.5) / WB, phi) / WB, 1e-4); mmV = Math.max(uvRowArc(sp) / H, 1e-4);
    }
    const dhdu = (height[y * W + xr] - height[y * W + xl]) / ((xr - xl) * mmU || 1);
    const dhdv = (height[yu * W + x] - height[yd * W + x]) / (2 * mmV);
    // the uv columns still converge on the very tip: fade the relief out right round the pole
    const kTip = inArm || inDome ? 1 : smoothstep(0.03, 0.15, TIPR[k]);
    const nn = norm3([-dhdu * kTip, dhdv * kTip, 1]);
    normal[k * 3] = Math.round((nn[0] * 0.5 + 0.5) * 255);
    normal[k * 3 + 1] = Math.round((nn[1] * 0.5 + 0.5) * 255);
    normal[k * 3 + 2] = Math.round((nn[2] * 0.5 + 0.5) * 255);
  }
  return { width: W, height: H, albedo, normal, orm, data };
}

export { COL };

/**
 * The head's skin pattern at a fish-space point p (outward normal n), as baked into the skin texture: albedo (sRGB
 * 0..255), roughness, relief height. The eyeball's skin-covered dome is painted from it (eye.mjs), so the pattern
 * runs on unbroken from the head and the eye cup over the globe (photographs: one skin, the cornea set in it).
 */
export function skinAt(p, n, ao = 1) {
  return skinPoint(p[0], invPhi(p[0], p[1], p[2]), p, n, ao, true);
}
