// Body mesh + baked surface textures for the juvenile goby.
import {
  S_END, SL, VERT_START, VERT_COUNT, EYE, MOUTH, OPERCLE, PREOPERCLE,
  section, basePoint, project, fieldGrad, field, throughDist, toObject, dirToObject,
} from './anatomy.mjs';
import { perlin3, fbm3, ridged3, hash01, hash3i, clamp, mix, smoothstep } from '../lib/noise.mjs';

const TAU = Math.PI * 2;

function distributeSections(NS) {
  // density of loft sections along the axis (denser at the snout/head and caudal insertion)
  const M = 20000;
  const cdf = new Float64Array(M + 1);
  for (let i = 1; i <= M; i++) {
    const s = (i / M) * S_END;
    const d = 1.0 + 2.2 * Math.exp(-s / 1.1) + 1.15 * smoothstep(13.5, 8.5, s) + 0.4 * smoothstep(39.5, 42.2, s);
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

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Inverse of basePoint(): loft parameter phi for a fish-space point. */
export function invPhi(s, y, z) {
  const q = section(clamp(s, 0.01, S_END - 0.01));
  const dy = y - q.yc;
  const up = dy > 0;
  const n = up ? q.nT : q.nB;
  const h = Math.max(up ? q.t : q.b, 1e-4);
  const a = Math.sign(z) * Math.pow(Math.abs(z) / Math.max(q.w, 1e-4), n / 2);
  const c = -Math.sign(dy) * Math.pow(Math.abs(dy) / h, n / 2);
  let phi = Math.atan2(a, c);
  if (phi < 0) phi += TAU;
  return phi;
}

// piecewise-linear lookup of the opercular margin: s at a given height
function sOperc(y) {
  const P = OPERCLE; // ordered from top to bottom
  if (y >= P[0][1]) return P[0][0];
  if (y <= P[P.length - 1][1]) return P[P.length - 1][0];
  for (let i = 0; i < P.length - 1; i++) {
    const [s0, y0] = P[i], [s1, y1] = P[i + 1];
    if (y <= y0 && y >= y1) return s0 + ((y - y0) / (y1 - y0)) * (s1 - s0);
  }
  return 10.5;
}

function distToPolyline2(s, y, poly) {
  let best = 1e9;
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[i + 1];
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((s - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
    const d = Math.hypot(s - ax - dx * t, y - ay - dy * t);
    if (d < best) best = d;
  }
  return best;
}

export function buildBody({ NS = 400, NV = 192, texW = 2048, texH = 1024, log = () => {} } = {}) {
  const sList = distributeSections(NS);
  const cols = NV + 1;
  const nVert = NS * cols;
  const P = new Float64Array(nVert * 3);
  const N = new Float64Array(nVert * 3);

  log('  projecting loft onto sculpt field …');
  for (let i = 0; i < NS; i++) {
    const s = sList[i];
    const q = section(s);
    for (let j = 0; j < NV; j++) {
      const phi = (j / NV) * TAU;
      const p = project(basePoint(s, phi, q));
      const n = fieldGrad(p[0], p[1], p[2]);
      const k = (i * cols + j) * 3;
      P[k] = p[0]; P[k + 1] = p[1]; P[k + 2] = p[2];
      N[k] = n[0]; N[k + 1] = n[1]; N[k + 2] = n[2];
    }
    const k0 = i * cols * 3, kN = (i * cols + NV) * 3;
    for (let c = 0; c < 3; c++) { P[kN + c] = P[k0 + c]; N[kN + c] = N[k0 + c]; }
  }

  const gp = (i, j) => { const k = (i * cols + j) * 3; return [P[k], P[k + 1], P[k + 2]]; };
  const gn = (i, j) => { const k = (i * cols + j) * 3; return [N[k], N[k + 1], N[k + 2]]; };

  // metric, tangent frames, AO, thickness, dorsal arc coordinate
  log('  tangents, AO, thickness …');
  const dS = new Float32Array(nVert); // |dP/ds|
  const dPhi = new Float32Array(nVert); // |dP/dphi|
  const tangentObj = new Float32Array(nVert * 4);
  const AO = new Float32Array(nVert);
  const THK = new Float32Array(nVert);
  const QD = new Float32Array(nVert);
  for (let i = 0; i < NS; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(NS - 1, i + 1);
    for (let j = 0; j <= NV; j++) {
      const jj0 = j === 0 ? NV - 1 : j - 1, jj1 = j === NV ? 1 : j + 1;
      const ps = sub(gp(i1, j), gp(i0, j));
      const pp = sub(gp(i, jj1), gp(i, jj0));
      const idx = i * cols + j;
      dS[idx] = Math.max(Math.hypot(...ps) / Math.max(sList[i1] - sList[i0], 1e-6), 0.05);
      dPhi[idx] = Math.max(Math.hypot(...pp) / ((2 * TAU) / NV), 1e-3);
      // tangent frame in object space
      const n = dirToObject(gn(i, j));
      let t = dirToObject(ps);
      if (Math.hypot(...t) < 1e-9) t = [0, 0, -1];
      t = nrm(sub(t, n.map((c) => c * dot(n, t))));
      const bDesired = dirToObject(pp.map((c) => -c));
      const w = dot(cross(n, t), bDesired) >= 0 ? 1 : -1;
      tangentObj.set([t[0], t[1], t[2], w], idx * 4);
      // SDF ambient occlusion
      const p = gp(i, j), nn = gn(i, j);
      let occ = 0;
      const dks = [0.06, 0.15, 0.3, 0.55, 0.9], wks = [0.3, 0.28, 0.2, 0.14, 0.08];
      for (let k = 0; k < dks.length; k++) {
        const d = dks[k];
        const f = field(p[0] + nn[0] * d, p[1] + nn[1] * d, p[2] + nn[2] * d);
        occ += (wks[k] * Math.max(0, d - f)) / d;
      }
      AO[idx] = clamp(1 - occ * 1.25, 0.2, 1);
      THK[idx] = throughDist([p[0] - nn[0] * 0.02, p[1] - nn[1] * 0.02, p[2] - nn[2] * 0.02], [-nn[0], -nn[1], -nn[2]], 12);
    }
    // arc length from dorsal midline (j = NV/2)
    const jt = NV / 2;
    QD[i * cols + jt] = 0;
    for (let j = jt + 1; j <= NV; j++) QD[i * cols + j] = QD[i * cols + j - 1] + Math.hypot(...sub(gp(i, j), gp(i, j - 1)));
    for (let j = jt - 1; j >= 0; j--) QD[i * cols + j] = QD[i * cols + j + 1] + Math.hypot(...sub(gp(i, j), gp(i, j + 1)));
  }

  // ---------------------------------------------------------------------------
  // Mesh arrays (object space)
  const position = new Float32Array(nVert * 3);
  const normal = new Float32Array(nVert * 3);
  const uv = new Float32Array(nVert * 2);
  for (let i = 0; i < NS; i++)
    for (let j = 0; j <= NV; j++) {
      const idx = i * cols + j;
      position.set(toObject(gp(i, j)), idx * 3);
      normal.set(dirToObject(gn(i, j)), idx * 3);
      uv[idx * 2] = sList[i] / S_END;
      uv[idx * 2 + 1] = j / NV;
    }
  const tris = [];
  for (let i = 0; i < NS - 1; i++)
    for (let j = 0; j < NV; j++) {
      const a = i * cols + j, b = (i + 1) * cols + j, c = (i + 1) * cols + j + 1, d = i * cols + j + 1;
      tris.push(a, b, c, a, c, d);
    }
  // orient winding outward (check a mid-body quad)
  {
    const i = Math.floor(NS / 2), j = Math.floor(NV / 4);
    const a = i * cols + j, b = (i + 1) * cols + j, c = (i + 1) * cols + j + 1;
    const pa = position.subarray(a * 3, a * 3 + 3), pb = position.subarray(b * 3, b * 3 + 3), pc = position.subarray(c * 3, c * 3 + 3);
    const fn = cross(sub(pb, pa), sub(pc, pa));
    if (dot(fn, normal.subarray(a * 3, a * 3 + 3)) < 0) {
      for (let k = 0; k < tris.length; k += 3) { const t = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = t; }
    }
  }
  const indices = new Uint32Array(tris);

  // ---------------------------------------------------------------------------
  // Texture baking
  log('  baking body textures …');
  const T = bakeBodyTextures({ sList, NS, NV, cols, P, N, AO, THK, QD, dS, dPhi, texW, texH, log });

  return { position, normal, tangent: tangentObj, uv, indices, textures: T, stats: { vertices: nVert, triangles: indices.length / 3 } };
}

// =============================================================================
// Pattern + height baking

function bakeBodyTextures(ctx) {
  const { sList, NS, NV, cols, P, N, AO, THK, QD, dS, dPhi, texW, texH, log } = ctx;
  const nT = texW * texH;
  // per-texel interpolated attributes
  const A = {
    px: new Float32Array(nT), py: new Float32Array(nT), pz: new Float32Array(nT),
    nx: new Float32Array(nT), ny: new Float32Array(nT), nz: new Float32Array(nT),
    ao: new Float32Array(nT), thk: new Float32Array(nT), qd: new Float32Array(nT),
    du: new Float32Array(nT), dv: new Float32Array(nT),
  };
  const colI = new Int32Array(texW), colF = new Float32Array(texW);
  for (let x = 0; x < texW; x++) {
    const s = ((x + 0.5) / texW) * S_END;
    let lo = 0, hi = NS - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sList[m] > s) hi = m; else lo = m; }
    colI[x] = lo;
    colF[x] = (s - sList[lo]) / Math.max(sList[lo + 1] - sList[lo], 1e-9);
  }
  for (let y = 0; y < texH; y++) {
    const jv = ((y + 0.5) / texH) * NV;
    const j0 = Math.floor(jv), fj = jv - j0, j1 = j0 + 1;
    for (let x = 0; x < texW; x++) {
      const i0 = colI[x], fi = colF[x], i1 = i0 + 1;
      const w00 = (1 - fi) * (1 - fj), w10 = fi * (1 - fj), w01 = (1 - fi) * fj, w11 = fi * fj;
      const a00 = i0 * cols + j0, a10 = i1 * cols + j0, a01 = i0 * cols + j1, a11 = i1 * cols + j1;
      const t = y * texW + x;
      const L3 = (arr, c) => w00 * arr[a00 * 3 + c] + w10 * arr[a10 * 3 + c] + w01 * arr[a01 * 3 + c] + w11 * arr[a11 * 3 + c];
      const L1 = (arr) => w00 * arr[a00] + w10 * arr[a10] + w01 * arr[a01] + w11 * arr[a11];
      A.px[t] = L3(P, 0); A.py[t] = L3(P, 1); A.pz[t] = L3(P, 2);
      let nx = L3(N, 0), ny = L3(N, 1), nz = L3(N, 2);
      const nl = Math.hypot(nx, ny, nz) || 1;
      A.nx[t] = nx / nl; A.ny[t] = ny / nl; A.nz[t] = nz / nl;
      A.ao[t] = L1(AO); A.thk[t] = L1(THK); A.qd[t] = L1(QD);
      A.du[t] = (L1(dS) * S_END) / texW; // mm per texel along u
      A.dv[t] = (L1(dPhi) * TAU) / texH; // mm per texel along v
    }
  }

  // per-column section cache
  const secs = new Array(texW);
  for (let x = 0; x < texW; x++) secs[x] = section(clamp(((x + 0.5) / texW) * S_END, 0.01, S_END - 0.01));

  const eyeC = EYE.center;
  const eyeDist = (s, y, z) => Math.hypot(s - eyeC[0], y - eyeC[1], Math.abs(z) - eyeC[2]);

  // ---------------------------------------------------------------------------
  // Region helpers
  const headF = (s, y) => smoothstep(0.25, -0.25, s - sOperc(y));

  // Irregular blotches: clusters of sub-blobs (deterministic), slightly asymmetric L/R via signed z noise.
  const BLOBS = []; // [s, hn, rs, rh, strength]
  const rnd = (a, b, c) => hash01(a, b, c, 4242);
  const MAIN = [[12.9, 0.05, 0.75], [17.4, 0.07, 1], [22.0, 0.05, 1], [26.5, 0.04, 1], [30.9, 0.05, 0.95], [35.1, 0.04, 0.95], [39.1, 0.06, 1]];
  MAIN.forEach(([bs, bh, st], k) => {
    for (let i = 0; i < 5; i++) {
      BLOBS.push([bs + (rnd(k, i, 1) - 0.5) * 1.5, bh + (rnd(k, i, 2) - 0.5) * 0.3, 0.32 + 0.38 * rnd(k, i, 3), 0.1 + 0.1 * rnd(k, i, 4), st * (0.65 + 0.35 * rnd(k, i, 5))]);
    }
  });
  [15.1, 19.7, 24.3, 28.8, 33.1, 37.1].forEach((bs, k) => {
    for (let i = 0; i < 3; i++) {
      BLOBS.push([bs + (rnd(k, i, 11) - 0.5) * 1.2, 0.52 + (rnd(k, i, 12) - 0.5) * 0.22, 0.22 + 0.25 * rnd(k, i, 13), 0.06 + 0.07 * rnd(k, i, 14), 0.5 + 0.2 * rnd(k, i, 15)]);
    }
  });
  const DORSAL = [];
  for (let k = 0; k < 40; k++) {
    DORSAL.push([9.2 + k * 0.8 + (rnd(k, 0, 21) - 0.5) * 0.6, 0.7 + 0.3 * rnd(k, 0, 22), 0.2 + 0.28 * rnd(k, 0, 23), 0.08 + 0.1 * rnd(k, 0, 24), 0.35 + 0.35 * rnd(k, 0, 25)]);
  }

  function blotchAt(s, y, z, hn) {
    const nz = fbm3(s * 0.6, y * 0.6, z * 0.6, 3, 11) * 0.7 + fbm3(s * 2.4, y * 2.4, z * 2.4, 2, 12) * 0.35;
    let b = 0;
    for (const [bs, bh, rs, rh, st] of BLOBS) {
      const ds = (s - bs) / rs, dh = (hn - bh) / rh;
      if (Math.abs(ds) > 2.2 || Math.abs(dh) > 2.6) continue;
      b = Math.max(b, st * smoothstep(1.0, 0.25, ds * ds + dh * dh + nz));
    }
    let sd = 0;
    if (hn > 0.45) {
      for (const [bs, bh, rs, rh, st] of DORSAL) {
        const ds = (s - bs) / rs, dh = (hn - bh) / rh;
        if (Math.abs(ds) > 2.2 || Math.abs(dh) > 2.6) continue;
        sd = Math.max(sd, st * smoothstep(1.0, 0.25, ds * ds + dh * dh + nz));
      }
    }
    return { b, sd };
  }

  function headMarks(s, y, z, hn) {
    // subocular bar, postorbital streak, opercular spot, cheek spots
    let m = 0;
    const nz = fbm3(s * 1.4, y * 1.4, 3.1, 2, 21) * 0.25;
    const d1 = distToPolyline2(s, y, [[5.0, 3.3], [4.65, 2.5], [4.35, 1.75]]);
    m = Math.max(m, 0.7 * smoothstep(0.42, 0.12, d1 + nz));
    const d2 = distToPolyline2(s, y, [[6.7, 4.35], [8.2, 4.3], [9.6, 4.15]]);
    m = Math.max(m, 0.45 * smoothstep(0.3, 0.08, d2 + nz));
    const d3 = Math.hypot(s - 10.35, y - 3.95);
    m = Math.max(m, 0.65 * smoothstep(0.55, 0.2, d3 + nz));
    const spots = [[7.4, 2.6, 0.32], [8.6, 3.3, 0.28], [9.4, 2.2, 0.3], [6.5, 1.9, 0.25], [8.9, 1.5, 0.24]];
    for (const [ss, yy, r] of spots) m = Math.max(m, 0.45 * smoothstep(r, r * 0.3, Math.hypot(s - ss, y - yy) + nz * 0.5));
    return m * smoothstep(-0.9, -0.3, hn);
  }

  // melanophore density (spots per mm^2) and size factor at a fish-space point
  function melDensity(s, y, z) {
    if (s < 0.2 || s > S_END - 0.1) return [0, 1];
    const q = section(s);
    const dy = y - q.yc;
    const hn = dy / Math.max(dy > 0 ? q.t : q.b, 1e-3);
    const dorsal = smoothstep(-0.2, 0.8, hn);
    const belly = smoothstep(-0.05, -0.7, hn);
    const head = headF(s, y);
    const { b, sd } = blotchAt(s, y, z, hn);
    const n = fbm3(s * 0.8, y * 0.8, Math.abs(z) * 0.8, 3, 5);
    let d = 3.0 + 24.0 * dorsal * (0.65 + 0.55 * n) + 6.0 * (1 - Math.abs(hn));
    d += 24.0 * b + 16.0 * sd;
    if (head > 0) {
      const hm = headMarks(s, y, z, hn);
      const hd = 6.0 + 26.0 * dorsal + 40.0 * hm + 10.0 * smoothstep(3.5, 1.0, s);
      d = mix(d, hd, head);
    }
    // keep the eye itself and lips clean
    const ed = eyeDist(s, y, z);
    d *= smoothstep(EYE.radius + 0.05, EYE.radius + 0.35, ed);
    d *= 1 - belly * 0.97;
    const size = 0.8 + 0.5 * dorsal + 0.35 * b;
    return [Math.max(0, d), size];
  }

  // ---------------------------------------------------------------------------
  // Diffuse (smooth) pigment fields per texel
  log('    pigment fields …');
  const MEL = new Float32Array(nT);
  const IRI = new Float32Array(nT);
  const XAN = new Float32Array(nT);
  const GILL = new Float32Array(nT);
  const HN = new Float32Array(nT);
  const HEAD = new Float32Array(nT);
  for (let y = 0; y < texH; y++)
    for (let x = 0; x < texW; x++) {
      const t = y * texW + x;
      const s = A.px[t], yy = A.py[t], z = A.pz[t];
      const q = secs[x];
      const dy = yy - q.yc;
      const hn = clamp(dy / Math.max(dy > 0 ? q.t : q.b, 1e-3), -1.2, 1.2);
      HN[t] = hn;
      const head = headF(s, yy);
      HEAD[t] = head;
      const dorsal = smoothstep(-0.2, 0.8, hn);
      const belly = smoothstep(-0.05, -0.7, hn);
      const { b, sd } = blotchAt(s, yy, z, hn);
      let m = 0.035 * dorsal + 0.075 * b + 0.05 * sd;
      if (head > 0) m = mix(m, 0.08 * dorsal + 0.3 * headMarks(s, yy, z, hn), head);
      // dusky dorsal reticulation (pigment along scale pockets)
      m += 0.1 * dorsal * smoothstep(0.55, 0.8, ridged3(s * 2.2, yy * 2.2, z * 2.2, 3, 3)) * (1 - head * 0.5);
      m *= 1 - belly;
      m *= smoothstep(EYE.radius + 0.05, EYE.radius + 0.3, eyeDist(s, yy, z));
      MEL[t] = m;
      const ed = eyeDist(s, yy, z);
      let iri = 0.85 * belly + 0.3 * smoothstep(0.25, -0.4, hn) + 0.12 * Math.exp(-(((hn - 0.02) / 0.22) ** 2));
      iri = Math.max(iri, head * 0.55 * smoothstep(0.55, -0.3, hn) * smoothstep(3.0, 5.5, s));
      iri = Math.max(iri, 0.2 * smoothstep(EYE.radius + 0.7, EYE.radius + 0.25, ed) * smoothstep(EYE.radius, EYE.radius + 0.2, ed));
      iri *= 1 - 0.7 * b;
      iri *= 0.85 + 0.3 * fbm3(s * 1.3, yy * 1.3, z * 1.3, 3, 41);
      IRI[t] = clamp(iri);
      let xan = 0.2 + 0.45 * dorsal + 0.35 * head * smoothstep(-0.3, 0.4, hn);
      xan *= 1 - 0.85 * belly;
      xan *= 0.8 + 0.4 * fbm3(s * 0.9, yy * 0.9, z * 0.9, 3, 51);
      XAN[t] = clamp(xan);
      // gill region seen through the operculum (used for the fallback albedo only)
      GILL[t] = smoothstep(7.5, 9.0, s) * smoothstep(11.6, 10.6, s) * smoothstep(0.35, -0.2, hn) * smoothstep(-0.95, -0.55, hn);
    }

  // ---------------------------------------------------------------------------
  // Melanophore splats
  log('    melanophores …');
  const cellsU = 512, cellsV = 256;
  let nSpots = 0;
  const splatSpot = (cx, cy, rCore, arms, strength, soft = 1) => {
    // cx, cy texel coordinates (float); arms: [{ ox, oy, c, s, len, w, k }] in mm
    const t0 = Math.floor(cy) * texW + clamp(Math.floor(cx), 0, texW - 1);
    const du = A.du[t0], dv = A.dv[t0];
    let R = rCore;
    for (const a of arms) R = Math.max(R, Math.hypot(a.ox, a.oy) + a.len + a.w);
    const rx = Math.ceil(R / du) + 1, ry = Math.ceil(R / dv) + 1;
    if (rx > 60 || ry > 60) return;
    for (let oy = -ry; oy <= ry; oy++) {
      let yy = Math.floor(cy) + oy;
      yy = ((yy % texH) + texH) % texH;
      for (let ox = -rx; ox <= rx; ox++) {
        const xx = Math.floor(cx) + ox;
        if (xx < 0 || xx >= texW) continue;
        const dx = (xx + 0.5 - cx) * du, dy2 = (Math.floor(cy) + oy + 0.5 - cy) * dv;
        const r = Math.hypot(dx, dy2);
        if (r > R) continue;
        let v = smoothstep(rCore * soft, rCore * 0.25, r);
        for (const a of arms) {
          const ex = dx - a.ox, ey = dy2 - a.oy;
          const along = ex * a.c + ey * a.s;
          if (along < 0 || along > a.len) continue;
          const f = along / a.len;
          const perp = Math.abs(-ex * a.s + ey * a.c);
          const w = a.w * Math.pow(1 - f, 0.9) + 0.0025;
          v = Math.max(v, a.k * smoothstep(w * soft, w * 0.2, perp) * (1 - f * f * 0.7));
        }
        v *= strength;
        const t = yy * texW + xx;
        MEL[t] = 1 - (1 - MEL[t]) * (1 - Math.min(v, 0.97));
      }
    }
    nSpots++;
  };
  for (let cy = 0; cy < cellsV; cy++)
    for (let cx = 0; cx < cellsU; cx++) {
      const x0 = (cx / cellsU) * texW, y0 = (cy / cellsV) * texH;
      const xc = Math.floor(x0 + texW / cellsU / 2), yc = Math.floor(y0 + texH / cellsV / 2);
      const t = yc * texW + xc;
      const area = A.du[t] * (texW / cellsU) * A.dv[t] * (texH / cellsV);
      const [dens, size] = melDensity(A.px[t], A.py[t], A.pz[t]);
      const expected = dens * area;
      let count = Math.floor(expected);
      if (hash01(cx, cy, 1, 99) < expected - count) count++;
      for (let k = 0; k < count; k++) {
        const hx = hash01(cx, cy, k, 7), hy = hash01(cx, cy, k, 8), hs = hash01(cx, cy, k, 9), ha = hash01(cx, cy, k, 10);
        const fx = x0 + hx * (texW / cellsU), fy = y0 + hy * (texH / cellsV);
        const rCore = (0.012 + 0.016 * hs) * size;
        const punct = hash01(cx, cy, k, 12) < 0.35;
        // ~30 % lie deeper in the dermis: larger, softer and fainter through the overlying tissue
        const deep = hash01(cx, cy, k, 16) < 0.3;
        const nArms = 3 + Math.floor(hash01(cx, cy, k, 11) * 5);
        const arms = [];
        for (let a = 0; a < nArms; a++) {
          const ang = ha * TAU + (a / nArms) * TAU + (hash01(cx + a, cy, k, 13) - 0.5) * 0.9;
          const len = rCore * (punct ? 0.9 : 1.8 + 3.0 * hash01(cx, cy + a, k, 14));
          const c = Math.cos(ang), sn = Math.sin(ang);
          const w = rCore * (0.2 + 0.16 * hash01(cx, cy, k + a, 15));
          arms.push({ ox: 0, oy: 0, c, s: sn, len, w, k: 0.9 });
          if (!punct && len > rCore * 2.6) {
            // one or two side branches per dendrite
            for (const sgn of [1, -1]) {
              if (hash01(cx + a, cy, k + (sgn > 0 ? 1 : 2), 17) < 0.45) continue;
              const f0 = 0.4 + 0.3 * hash01(cx, cy + a, k + (sgn > 0 ? 3 : 4), 18);
              const ba = ang + sgn * (0.5 + 0.4 * hash01(cx + 2 * a, cy, k, 19));
              arms.push({ ox: c * len * f0, oy: sn * len * f0, c: Math.cos(ba), s: Math.sin(ba), len: len * (0.35 + 0.25 * hash01(cx, cy, k + a, 20)), w: w * 0.7, k: 0.8 });
            }
          }
        }
        splatSpot(fx, fy, rCore * (deep ? 1.5 : 1), deep ? arms.map((a) => ({ ...a, w: a.w * 1.8, len: a.len * 1.2, ox: a.ox * 1.2, oy: a.oy * 1.2 })) : arms,
          deep ? 0.32 + 0.2 * hs : 0.7 + 0.3 * hs, deep ? 2.4 : 1);
      }
    }
  log(`      ${nSpots} melanophores`);

  // ---------------------------------------------------------------------------
  // Height field (mm)
  log('    height field …');
  const H = new Float32Array(nT);
  const vertLen = (SL - VERT_START) / VERT_COUNT;
  const SC_S = 0.4, SC_Q = 0.34, SC_R = 0.29;
  for (let y = 0; y < texH; y++)
    for (let x = 0; x < texW; x++) {
      const t = y * texW + x;
      const s = A.px[t], yy = A.py[t], z = A.pz[t];
      const hn = HN[t], head = HEAD[t];
      const q = secs[x];
      const zn = Math.abs(z) / Math.max(q.w, 1e-3);
      let h = 0;
      // --- scales
      const scaled = (1 - head) * smoothstep(sOperc(yy) + 0.15, sOperc(yy) + 0.5, s) * smoothstep(SL + 0.6, SL - 0.2, s);
      const nape = smoothstep(8.4, 9.2, s) * smoothstep(0.5, 0.75, hn) * smoothstep(EYE.radius + 0.6, EYE.radius + 1.3, eyeDist(s, yy, z));
      const scMask = Math.max(scaled, nape);
      if (scMask > 0.001) {
        const qd = A.qd[t];
        const bq = qd / SC_Q;
        const rb = Math.floor(bq);
        let top = null, second = null;
        for (let dr = -1; dr <= 1; dr++) {
          const row = rb + dr;
          const off = (row & 1) * 0.5;
          const ac = s / SC_S - off;
          const cb = Math.floor(ac);
          for (let dc = -1; dc <= 1; dc++) {
            const col = cb + dc;
            const hsh = hash3i(col, row, 3, 1234);
            const jx = ((hsh & 255) / 255 - 0.5) * 0.12, jy = (((hsh >>> 8) & 255) / 255 - 0.5) * 0.12;
            const rr = SC_R * (0.92 + 0.16 * (((hsh >>> 16) & 255) / 255));
            const cs = (col + off + 0.5 + jx) * SC_S;
            const cq = (row + 0.5 + jy) * SC_Q;
            const ds = s - cs, dq = qd - cq;
            const dist = Math.hypot(ds, dq);
            if (dist < rr) {
              const cand = { cs, ds, dq, dist, rr, hsh };
              if (!top || cs < top.cs) { second = top; top = cand; } else if (!second || cs < second.cs) second = cand;
            }
          }
        }
        const scaleH = (c) => {
          if (!c) return 0;
          const post = smoothstep(-c.rr, c.rr * 0.85, c.ds);
          let v = 0.35 + 0.65 * post;
          // circuli
          v += 0.12 * Math.sin((c.dist / 0.017) * TAU) * (1 - post) * 0.5;
          // ctenii on the posterior margin
          const rim = Math.exp(-(((c.rr - c.dist) / 0.018) ** 2)) * smoothstep(0, 0.1, c.ds);
          const ang = Math.atan2(c.dq, c.ds);
          v += 0.45 * rim * Math.pow(0.5 + 0.5 * Math.cos(ang * 34), 4);
          return v;
        };
        let sh;
        if (top) {
          const edge = smoothstep(top.rr, top.rr - 0.02, top.dist);
          sh = mix(scaleH(second), scaleH(top), edge);
          // melanophores concentrate along the scale pockets (reticulated look of the upper flank)
          const pocket = Math.exp(-(((top.rr - top.dist) / 0.035) ** 2)) * smoothstep(-0.05, 0.12, top.ds);
          const dors = smoothstep(-0.1, 0.7, hn);
          MEL[t] = 1 - (1 - MEL[t]) * (1 - 0.16 * pocket * dors * scMask * (0.6 + 0.4 * hash01(top.hsh & 1023, 0, 0, 7)));
        } else sh = 0.3;
        const amp = 0.013 * (1 - 0.45 * smoothstep(-0.3, -0.8, hn)) * (0.75 + 0.25 * zn);
        h += amp * sh * scMask;
      }
      // --- myomere relief on the flanks
      if (s > 11 && s < 41) {
        const an = Math.abs(hn);
        const chev = an < 0.55 ? an / 0.55 : 1 - (0.45 * (an - 0.55)) / 0.45;
        const ph = (s - VERT_START - 0.95 * chev) / vertLen;
        h += 0.011 * (0.5 - 0.5 * Math.cos(ph * TAU)) * smoothstep(0.15, 0.5, zn) * smoothstep(11, 13, s) * (1 - head);
      }
      // --- micro skin texture
      h += 0.003 * fbm3(s * 18, yy * 18, z * 18, 3, 71) + 0.0012 * fbm3(s * 55, yy * 55, z * 55, 2, 72);
      if (head > 0) {
        h += head * 0.0045 * (ridged3(s * 7 + z * 3, yy * 9, z * 7, 3, 81) - 0.6);
        // mouth crease reinforcement
        if (s < 6 && yy < 2.6) {
          const dm = distToPolyline2(s, yy, MOUTH);
          h -= 0.028 * Math.exp(-((dm / 0.04) ** 2)) * smoothstep(0.1, 0.4, zn + (s < 0.6 ? 1 : 0));
        }
        // preopercular groove
        const dp = distToPolyline2(s, yy, PREOPERCLE);
        h -= 0.009 * Math.exp(-((dp / 0.05) ** 2)) * smoothstep(0.3, 0.6, zn);
        // branchiostegal folds under the throat
        if (hn < -0.4 && s > 6 && s < 11) {
          const f = Math.pow(0.5 + 0.5 * Math.sin(((s * 2.1 + Math.abs(z) * 1.6) * TAU) / 0.6), 6);
          h -= 0.005 * f * smoothstep(-0.4, -0.75, hn);
        }
      }
      // opercular margin: raised operculum + groove
      if (s > 8.5 && s < 12.5 && yy > 0.2 && yy < 5.0) {
        const d = s - sOperc(yy);
        const lat = smoothstep(0.2, 0.5, zn);
        h += lat * (0.01 * smoothstep(0.05, -0.12, d) - 0.012 * Math.exp(-((d / 0.035) ** 2)));
      }
      H[t] = h;
    }

  // pores & sensory papillae (splatted bumps/pits)
  log('    pores & papillae …');
  const bumps = [];
  const PORES = [[6.85, 4.75], [7.35, 4.4], [7.05, 5.05], [6.4, 5.2], [4.2, 5.0], [3.5, 4.55], [2.05, 3.8], [7.65, 3.6], [8.1, 2.95], [8.25, 2.25], [8.05, 1.6]];
  for (const [s, y] of PORES) bumps.push({ s, y, kind: 'pore' });
  const papRow = (pts, spacing) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [s0, y0] = pts[i], [s1, y1] = pts[i + 1];
      const L = Math.hypot(s1 - s0, y1 - y0);
      const n = Math.max(1, Math.round(L / spacing));
      for (let k = 0; k < n; k++) {
        const f = (k + hash01(i, k, pts.length, 5) * 0.3) / n;
        bumps.push({ s: s0 + (s1 - s0) * f, y: y0 + (y1 - y0) * f + (hash01(i, k, 3, 6) - 0.5) * 0.02, kind: 'pap' });
      }
    }
  };
  papRow([[4.8, 2.95], [6.5, 3.0], [8.6, 2.9]], 0.09);
  papRow([[3.6, 2.25], [6.0, 2.15], [8.8, 2.2]], 0.09);
  papRow([[1.0, 1.15], [3.0, 0.95], [5.6, 0.85]], 0.1);
  papRow([[1.2, 3.0], [3.0, 3.45]], 0.09);
  for (const sv of [5.8, 6.6, 7.4]) papRow([[sv, 3.3], [sv + 0.15, 1.6]], 0.085);
  for (const sv of [9.1, 9.8]) papRow([[sv, 4.0], [sv + 0.1, 2.2]], 0.085);
  for (const side of [1, -1]) {
    for (const b of bumps) {
      const q = section(b.s);
      const dy = b.y - q.yc;
      const hN = Math.max(dy > 0 ? q.t : q.b, 1e-3);
      if (Math.abs(dy) >= hN) continue;
      const n = dy > 0 ? q.nT : q.nB;
      const z = side * q.w * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(dy) / hN, n)), 1 / n);
      const phi = invPhi(b.s, b.y, z);
      const cx = (b.s / S_END) * texW, cy = (phi / TAU) * texH;
      const t0 = clamp(Math.floor(cy), 0, texH - 1) * texW + clamp(Math.floor(cx), 0, texW - 1);
      const du = A.du[t0], dv = A.dv[t0];
      const R = b.kind === 'pore' ? 0.075 : 0.03;
      const rx = Math.ceil(R / du) + 1, ry = Math.ceil(R / dv) + 1;
      for (let oy = -ry; oy <= ry; oy++)
        for (let ox = -rx; ox <= rx; ox++) {
          const xx = Math.floor(cx) + ox, yy = ((Math.floor(cy) + oy) % texH + texH) % texH;
          if (xx < 0 || xx >= texW) continue;
          const r = Math.hypot((xx + 0.5 - cx) * du, (Math.floor(cy) + oy + 0.5 - cy) * dv);
          let v;
          if (b.kind === 'pore') v = -0.02 * smoothstep(0.05, 0.02, r) + 0.006 * Math.exp(-(((r - 0.055) / 0.012) ** 2));
          else v = 0.012 * smoothstep(0.028, 0.004, r);
          H[yy * texW + xx] += v;
        }
    }
  }

  // ---------------------------------------------------------------------------
  // Encode maps
  log('    encoding …');
  const albedo = new Uint8Array(nT * 3);
  const normalMap = new Uint8Array(nT * 3);
  const orm = new Uint8Array(nT * 3);
  const pigment = new Uint8Array(nT * 3);
  const volume = new Uint8Array(nT * 3);
  const srgb = (c) => {
    c = clamp(c, 0, 1);
    return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  };
  for (let y = 0; y < texH; y++) {
    const ym = (y - 1 + texH) % texH, yp = (y + 1) % texH;
    for (let x = 0; x < texW; x++) {
      const t = y * texW + x;
      const xm = Math.max(0, x - 1), xp = Math.min(texW - 1, x + 1);
      // tangent-space normal (T = +u, B = image up)
      const gx = (H[y * texW + xp] - H[y * texW + xm]) / ((xp - xm) * A.du[t]);
      const gyUp = (H[ym * texW + x] - H[yp * texW + x]) / (2 * A.dv[t]);
      let nx = -gx, ny = -gyUp, nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl; ny /= nl; nz /= nl;
      normalMap[t * 3] = Math.round((nx * 0.5 + 0.5) * 255);
      normalMap[t * 3 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalMap[t * 3 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      // cavity from the height Laplacian (mm^-1)
      const lap = (H[y * texW + xp] + H[y * texW + xm] - 2 * H[t]) / (A.du[t] * A.du[t]) +
        (H[ym * texW + x] + H[yp * texW + x] - 2 * H[t]) / (A.dv[t] * A.dv[t]);
      const cavity = clamp(lap * 0.35, 0, 0.35);

      const s = A.px[t], yy = A.py[t], z = A.pz[t];
      const hn = HN[t], head = HEAD[t];
      const dorsal = smoothstep(-0.2, 0.8, hn);
      const belly = smoothstep(-0.05, -0.7, hn);
      const M = MEL[t] * 1.6;
      // base milky-amber tissue (linear)
      let r = 0.64, g = 0.54, b = 0.34;
      r = mix(r, 0.5, dorsal * 0.45); g = mix(g, 0.45, dorsal * 0.45); b = mix(b, 0.26, dorsal * 0.45);
      r = mix(r, 0.74, belly); g = mix(g, 0.7, belly); b = mix(b, 0.6, belly);
      const X = XAN[t];
      r *= mix(1, 1.0, X * 0.6); g *= mix(1, 0.9, X * 0.6); b *= mix(1, 0.6, X * 0.6);
      const I = IRI[t];
      r = mix(r, 0.78, I * 0.5); g = mix(g, 0.79, I * 0.5); b = mix(b, 0.75, I * 0.5);
      r *= Math.exp(-M * 2.0); g *= Math.exp(-M * 2.15); b *= Math.exp(-M * 2.35);
      // shadowed mouth slit
      if (s < 5.5 && yy < 2.4) {
        const dm = distToPolyline2(s, yy, MOUTH);
        const slit = Math.exp(-((dm / 0.05) ** 2)) * smoothstep(0.1, 0.35, Math.abs(z) / Math.max(secs[x].w, 1e-3) + (s < 0.6 ? 1 : 0));
        r *= 1 - 0.5 * slit; g *= 1 - 0.52 * slit; b *= 1 - 0.54 * slit;
      }
      const gl = GILL[t] * 0.35;
      g *= 1 - 0.2 * gl; b *= 1 - 0.22 * gl;
      albedo[t * 3] = srgb(r); albedo[t * 3 + 1] = srgb(g); albedo[t * 3 + 2] = srgb(b);

      const ao = clamp(A.ao[t] * (1 - cavity), 0, 1);
      let rough = 0.31 + 0.035 * fbm3(s * 1.7, yy * 1.7, z * 1.7, 3, 91) - 0.04 * head + 0.03 * belly + cavity * 0.25;
      orm[t * 3] = Math.round(ao * 255);
      orm[t * 3 + 1] = Math.round(clamp(rough, 0.12, 0.8) * 255);
      orm[t * 3 + 2] = 0;

      pigment[t * 3] = Math.round(clamp(MEL[t]) * 255);
      pigment[t * 3 + 1] = Math.round(clamp(I) * 255);
      pigment[t * 3 + 2] = Math.round(clamp(X) * 255);

      const thk = A.thk[t];
      const trans = clamp(1.1 - thk / 5.0, 0.12, 0.92) * (1 - 0.7 * clamp(MEL[t])) * (1 - 0.45 * I);
      volume[t * 3] = Math.round(trans * 255);
      volume[t * 3 + 1] = Math.round(clamp(thk / 8.0) * 255);
      volume[t * 3 + 2] = 0;
    }
  }
  return { width: texW, height: texH, albedo, normal: normalMap, orm, pigment, volume };
}
