// Body mesh + baked surface textures for the juvenile goby.
import {
  S_END, SL, VERT_START, VERT_COUNT, EYE, MOUTH, OPERCLE, PREOPERCLE, RICTUS_S, MAXILLA_END,
  section, basePoint, project, fieldGrad, field, throughDist, toObject, dirToObject, gapeY,
} from './anatomy.mjs';
import { perlin3, fbm3, ridged3, hash01, hash3i, clamp, mix, smoothstep, forEachCell3 } from '../lib/noise.mjs';

const TAU = Math.PI * 2;

// Piecewise-linear morph of マハゼ-juvenile head coordinates (mm) onto the エドハゼ head, anchored at the
// snout tip, the eye centre (4.9 → 3.38 mm) and the opercular margin (11.7 → 10.4 mm); used only for
// the generic gobiid sensory-papilla rows and pores, whose layout scales with the head.
export function mapHead(s, y) {
  const s2 = s <= 4.9 ? s * (3.38 / 4.9) : 3.38 + (s - 4.9) * ((10.4 - 3.38) / (11.7 - 4.9));
  return [s2, y * 0.9 + 0.05];
}

function distributeSections(NS) {
  // density of loft sections along the axis (denser at the snout/head and caudal insertion)
  const M = 20000;
  const cdf = new Float64Array(M + 1);
  for (let i = 1; i <= M; i++) {
    const s = (i / M) * S_END;
    const d = 1.0 + 2.2 * Math.exp(-s / 0.95) + 1.15 * smoothstep(12.2, 7.6, s) + 0.4 * smoothstep(S_END - 3.7, S_END - 1.0, s);
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

// Upper / lower lip bands around the gape (0..1), fish-space s, y in mm.
function lipBands(s, y) {
  if (s > RICTUS_S + 0.85 || y > 3.4) return { up: 0, lo: 0, rim: 0 };
  const g = gapeY(Math.min(Math.max(s, 0.05), RICTUS_S));
  const along = smoothstep(RICTUS_S + 0.7, RICTUS_S - 0.3, s);
  const dy = y - g;
  const wu = 0.62 - 0.22 * clamp(s / RICTUS_S, 0, 1); // upper lip roll height
  const wl = 0.5 - 0.18 * clamp(s / RICTUS_S, 0, 1);
  const up = dy > 0 ? smoothstep(wu, wu * 0.55, dy) * along : 0;
  const lo = dy <= 0 ? smoothstep(wl, wl * 0.55, -dy) * along : 0;
  const rim = Math.exp(-((dy / 0.09) ** 2)) * along; // moist margin where the lips meet
  return { up, lo, rim };
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
  return 9.6;
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

function projectGrid(sOf, phiOf, NS, NV, log) {
  const cols = NV + 1;
  const nVert = NS * cols;
  const P = new Float64Array(nVert * 3);
  const N = new Float64Array(nVert * 3);
  const S = new Float64Array(nVert);
  const PHI = new Float64Array(nVert);
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NV; j++) {
      const sv = sOf(i, j), phi = phiOf(i, j);
      const p = project(basePoint(sv, phi, section(sv)));
      const n = fieldGrad(p[0], p[1], p[2]);
      const k = (i * cols + j) * 3;
      P[k] = p[0]; P[k + 1] = p[1]; P[k + 2] = p[2];
      N[k] = n[0]; N[k + 1] = n[1]; N[k + 2] = n[2];
      S[i * cols + j] = sv; PHI[i * cols + j] = phi;
    }
    const k0 = i * cols * 3, kN = (i * cols + NV) * 3;
    for (let c = 0; c < 3; c++) { P[kN + c] = P[k0 + c]; N[kN + c] = N[k0 + c]; }
    S[i * cols + NV] = S[i * cols]; PHI[i * cols + NV] = TAU;
    if (log && i % 100 === 0) log(`    row ${i}/${NS}`);
  }
  return { P, N, S, PHI, cols, nVert };
}

export function buildBody({ NS = 460, NV = 224, NSb = 400, NVb = 192, texW = 2048, texH = 1024, log = () => {} } = {}) {
  // --------------------------------------------------------------------------- bake grid (regular s/φ)
  log('  projecting bake grid …');
  const sListB = distributeSections(NSb);
  const B = projectGrid((i) => sListB[i], (i, j) => (j / NVb) * TAU, NSb, NVb);
  const colsB = B.cols;
  const gpB = (i, j) => { const k = (i * colsB + j) * 3; return [B.P[k], B.P[k + 1], B.P[k + 2]]; };
  const gnB = (i, j) => { const k = (i * colsB + j) * 3; return [B.N[k], B.N[k + 1], B.N[k + 2]]; };
  log('  AO, thickness, metric …');
  const nB = B.nVert;
  const dS = new Float32Array(nB), dPhi = new Float32Array(nB), AO = new Float32Array(nB), THK = new Float32Array(nB), QD = new Float32Array(nB);
  for (let i = 0; i < NSb; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(NSb - 1, i + 1);
    for (let j = 0; j <= NVb; j++) {
      const jj0 = j === 0 ? NVb - 1 : j - 1, jj1 = j === NVb ? 1 : j + 1;
      const ps = sub(gpB(i1, j), gpB(i0, j));
      const pp = sub(gpB(i, jj1), gpB(i, jj0));
      const idx = i * colsB + j;
      dS[idx] = Math.max(Math.hypot(...ps) / Math.max(sListB[i1] - sListB[i0], 1e-6), 0.05);
      dPhi[idx] = Math.max(Math.hypot(...pp) / ((2 * TAU) / NVb), 1e-3);
      const p = gpB(i, j), nn = gnB(i, j);
      let occ = 0;
      const dks = [0.06, 0.15, 0.3, 0.55, 0.9], wks = [0.3, 0.28, 0.2, 0.14, 0.08];
      for (let k = 0; k < dks.length; k++) {
        const d = dks[k];
        occ += (wks[k] * Math.max(0, d - field(p[0] + nn[0] * d, p[1] + nn[1] * d, p[2] + nn[2] * d))) / d;
      }
      AO[idx] = clamp(1 - occ * 1.25, 0.2, 1);
      THK[idx] = throughDist([p[0] - nn[0] * 0.02, p[1] - nn[1] * 0.02, p[2] - nn[2] * 0.02], [-nn[0], -nn[1], -nn[2]], 12);
    }
    const jt = NVb / 2;
    QD[i * colsB + jt] = 0;
    for (let j = jt + 1; j <= NVb; j++) QD[i * colsB + j] = QD[i * colsB + j - 1] + Math.hypot(...sub(gpB(i, j), gpB(i, j - 1)));
    for (let j = jt - 1; j >= 0; j--) QD[i * colsB + j] = QD[i * colsB + j + 1] + Math.hypot(...sub(gpB(i, j), gpB(i, j + 1)));
  }
  log('  baking body textures …');
  const T = bakeBodyTextures({ sList: sListB, NS: NSb, NV: NVb, cols: colsB, P: B.P, N: B.N, AO, THK, QD, dS, dPhi, texW, texH, log });

  // --------------------------------------------------------------------------- render mesh (warped grid with cuts)
  log('  render mesh …');
  const mesh = buildWarpedMesh(NS, NV, log);
  return { ...mesh, textures: T };
}

// base-loft surface z on the +z side at height y
function sideZ(s, y) {
  const q = section(clamp(s, 0.01, S_END - 0.01));
  const dy = y - q.yc;
  const h = Math.max(dy > 0 ? q.t : q.b, 1e-4);
  const n = dy > 0 ? q.nT : q.nB;
  return q.w * Math.pow(Math.max(0, 1 - Math.pow(clamp(Math.abs(dy) / h), n)), 1 / n);
}

// φ of the gape on the +z side at s (base loft)
function gapePhi(s) {
  const sc = clamp(s, 0.15, RICTUS_S);
  const y = gapeY(sc);
  return invPhi(sc, y, Math.max(sideZ(sc, y), 1e-3));
}

// Opercular margin in loft parameters: table of (φ, s) on the +z side (ordered by φ ascending)
function marginTable() {
  const pts = OPERCLE.map(([s, y]) => [invPhi(s, y, Math.max(sideZ(s, y), 1e-3)), s]);
  pts.sort((a, b) => a[0] - b[0]);
  return pts;
}

function buildWarpedMesh(NS, NV, log) {
  const sList = distributeSections(NS);
  const cols = NV + 1;
  // ---- gape: column jg (left) and NV-jg (right) follow the gape up to the rictus
  const jg = Math.round(NV * 0.22);
  const vg = jg / NV;
  const phiOfRow = (sv, v) => {
    const pg = gapePhi(sv);
    let pw;
    if (v <= vg) pw = (v / vg) * pg;
    else if (v <= 1 - vg) pw = pg + ((v - vg) / (1 - 2 * vg)) * (TAU - 2 * pg);
    else pw = TAU - pg + ((v - (1 - vg)) / vg) * pg;
    const beta = smoothstep(RICTUS_S + 0.4, RICTUS_S + 3.5, sv);
    return pw * (1 - beta) + v * TAU * beta;
  };
  // ---- operculum: row im is bent so it runs along the free margin of the gill cover
  const sM = 9.45;
  let im = 0;
  for (let i = 0; i < NS; i++) if (Math.abs(sList[i] - sM) < Math.abs(sList[im] - sM)) im = i;
  const sIm = sList[im];
  const MT = marginTable();
  const phiB = MT[0][0], phiT = MT[MT.length - 1][0];
  const marginS = (phi) => {
    const f = clamp(phi, phiB, phiT);
    for (let k = 0; k < MT.length - 1; k++) {
      if (f <= MT[k + 1][0]) return MT[k][1] + ((f - MT[k][0]) / Math.max(MT[k + 1][0] - MT[k][0], 1e-9)) * (MT[k + 1][1] - MT[k][1]);
    }
    return MT[MT.length - 1][1];
  };
  const deltaAt = (phi) => {
    const ph = phi > Math.PI ? TAU - phi : phi; // mirror right side
    const fade = smoothstep(phiB - 0.35, phiB, ph) * smoothstep(phiT + 0.35, phiT, ph);
    return (marginS(ph) - sIm) * fade;
  };
  const sOf = (i, j) => {
    const s0 = sList[i];
    const phi = phiOfRow(s0, j / NV);
    const K = Math.exp(-(((s0 - sIm) / 1.6) ** 2));
    return s0 + deltaAt(phi) * K;
  };
  const phiOf = (i, j) => phiOfRow(sList[i], j / NV);
  const G = projectGrid(sOf, phiOf, NS, NV, log);
  const { P, N, S, PHI } = G;
  const gp = (i, j) => { const k = (i * cols + j) * 3; return [P[k], P[k + 1], P[k + 2]]; };
  const gn = (i, j) => { const k = (i * cols + j) * 3; return [N[k], N[k + 1], N[k + 2]]; };

  // flap cut columns
  const jB = Math.ceil((phiB / TAU) * NV), jT = Math.floor((phiT / TAU) * NV);
  let ir = 0;
  for (let i = 0; i < NS; i++) if (sList[i] <= RICTUS_S) ir = i;

  // Snap the gape columns exactly onto the lip seam: march horizontally (at the gape height) from outside
  // toward the midline and stop at the surface. The radial projection alone lands them alternately on
  // the upper or lower lip flank, which shows as a stair-stepped mouth line.
  for (let i = 1; i <= ir; i++) {
    for (const j of [jg, NV - jg]) {
      const k = (i * cols + j) * 3;
      const sv = P[k], side = Math.sign(P[k + 2]) || 1;
      const yg = gapeY(Math.min(Math.max(sv, 0.05), RICTUS_S));
      // horizontal inward direction: toward the midline, tilted forward near the snout tip
      const fwd = smoothstep(0.9, 0.05, sv);
      const d = nrm([fwd, 0, -side * (1 - fwd)]);
      const o = [sv - d[0] * 2.0, yg, side * 3.5 * (1 - fwd) + 0];
      let t0 = 0, found = false;
      for (let n = 0; n < 300; n++) {
        const t = n * 0.02;
        if (field(o[0] + d[0] * t, o[1], o[2] + d[2] * t) < 0) { found = true; t0 = t; break; }
      }
      if (!found) continue;
      let lo = t0 - 0.02, hi = t0;
      for (let n = 0; n < 14; n++) { const m = 0.5 * (lo + hi); if (field(o[0] + d[0] * m, o[1], o[2] + d[2] * m) < 0) hi = m; else lo = m; }
      const t = 0.5 * (lo + hi);
      const p = [o[0] + d[0] * t, o[1], o[2] + d[2] * t];
      if (Math.abs(p[0] - sv) > 0.6) continue; // safety: stay on this section
      const g = fieldGrad(p[0], p[1], p[2]);
      P[k] = p[0]; P[k + 1] = p[1]; P[k + 2] = p[2];
      N[k] = g[0]; N[k + 1] = g[1]; N[k + 2] = g[2];
    }
  }

  // ---- per-grid vertex data
  const base = [];
  for (let i = 0; i < NS; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(NS - 1, i + 1);
    for (let j = 0; j <= NV; j++) {
      const jj0 = j === 0 ? NV - 1 : j - 1, jj1 = j === NV ? 1 : j + 1;
      const ps = sub(gp(i1, j), gp(i0, j));
      const pp = sub(gp(i, jj1), gp(i, jj0));
      const n = dirToObject(gn(i, j));
      let t = dirToObject(ps);
      if (Math.hypot(...t) < 1e-9) t = [0, 0, -1];
      t = nrm(sub(t, n.map((c) => c * dot(n, t))));
      const w = dot(cross(n, t), dirToObject(pp.map((c) => -c))) >= 0 ? 1 : -1;
      base.push({ i, j, fish: gp(i, j), n, t: [t[0], t[1], t[2], w], s: S[i * cols + j], phi: PHI[i * cols + j] });
    }
  }
  const verts = base.map((b) => ({ ...b, jawSide: 0, flap: 0, cut: '' }));
  const gid = (i, j) => i * cols + j;
  // lower arc (jaw side) membership for grid vertices in the cut zone
  const lowerArc = (j) => j <= jg || j >= NV - jg;
  for (const v of verts) if (v.i <= ir && lowerArc(v.j) && v.j !== jg && v.j !== NV - jg) v.jawSide = 1;
  // duplicate gape columns (rows 0 … ir-1) for the jaw side
  const jawCopy = new Map();
  for (let i = 0; i < ir; i++) {
    for (const j of [jg, NV - jg]) {
      const c = { ...base[gid(i, j)], jawSide: 1, flap: 0, cut: 'gapeLower' };
      verts[gid(i, j)].cut = 'gapeUpper';
      jawCopy.set(gid(i, j), verts.length);
      verts.push(c);
    }
  }
  // duplicate the margin row (columns strictly inside the cut) for the flap side
  const flapCopy = new Map();
  const flapCols = [];
  for (let j = jB + 1; j < jT; j++) flapCols.push(j, NV - j);
  for (const j of flapCols) {
    const c = { ...base[gid(im, j)], jawSide: 0, flap: 1, cut: 'flap' };
    verts[gid(im, j)].cut = 'opercBody';
    flapCopy.set(gid(im, j), verts.length);
    verts.push(c);
  }
  const inFlapQuad = (i, j) => {
    const jc = j + 0.5;
    const left = jc > jB && jc < jT, right = jc > NV - jT && jc < NV - jB;
    return i < im && (left || right);
  };
  const tris = [];
  for (let i = 0; i < NS - 1; i++)
    for (let j = 0; j < NV; j++) {
      const q = [gid(i, j), gid(i + 1, j), gid(i + 1, j + 1), gid(i, j + 1)];
      const jawQuad = i + 1 <= ir && (j + 1 <= jg || j >= NV - jg);
      const flapQuad = inFlapQuad(i, j) && i === im - 1;
      const mapped = q.map((g) => {
        if (jawQuad && jawCopy.has(g)) return jawCopy.get(g);
        if (flapQuad && flapCopy.has(g)) return flapCopy.get(g);
        return g;
      });
      tris.push(mapped[0], mapped[1], mapped[2], mapped[0], mapped[2], mapped[3]);
    }
  // orient winding outward
  {
    const i = Math.floor(NS / 2), j = Math.floor(NV / 4);
    const a = verts[gid(i, j)].fish, b = verts[gid(i + 1, j)].fish, c = verts[gid(i + 1, j + 1)].fish;
    const fn = cross(sub(dirToObject(sub(b, a)), [0, 0, 0]), dirToObject(sub(c, a)));
    if (dot(fn, verts[gid(i, j)].n) < 0) for (let k = 0; k < tris.length; k += 3) { const t = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = t; }
  }
  // flap membership (for skin weights): vertices anterior to the margin row inside the cut columns, back to
  // just in front of the preopercle (a mm bound, independent of the mesh resolution)
  const flapS0 = Math.min(...PREOPERCLE.map((p) => p[0])) - 0.3;
  for (const v of verts) {
    if (v.flap) continue;
    const left = v.j > jB && v.j < jT, right = v.j > NV - jT && v.j < NV - jB;
    if ((left || right) && v.i < im && v.fish[0] > flapS0) v.flap = v.cut === 'opercBody' ? 0 : 0.5; // 0.5 = candidate; weight decided by the rig
  }

  const nV = verts.length;
  const position = new Float32Array(nV * 3), normal = new Float32Array(nV * 3), tangent = new Float32Array(nV * 4), uv = new Float32Array(nV * 2);
  verts.forEach((v, k) => {
    position.set(toObject(v.fish), k * 3);
    normal.set(v.n, k * 3);
    tangent.set(v.t, k * 4);
    uv[k * 2] = clamp(v.s / S_END, 0, 1);
    uv[k * 2 + 1] = v.phi / TAU;
  });
  // ordered cut edges for the interior meshes
  const gapeEdge = (side) => {
    const j = side > 0 ? jg : NV - jg;
    const up = [], lo = [];
    for (let i = ir; i >= 0; i--) {
      up.push(gid(i, j));
      lo.push(i < ir ? jawCopy.get(gid(i, j)) : gid(i, j));
    }
    return { up, lo };
  };
  const marginEdge = (side) => {
    const js = [];
    for (let j = jB; j <= jT; j++) js.push(side > 0 ? j : NV - j);
    return { body: js.map((j) => gid(im, j)), flap: js.map((j) => (flapCopy.has(gid(im, j)) ? flapCopy.get(gid(im, j)) : gid(im, j))) };
  };
  log(`    mesh: ${nV} vertices, ${tris.length / 3} triangles (gape rows 0…${ir}, margin row ${im}, cols ${jB}…${jT})`);
  return {
    position, normal, tangent, uv, indices: new Uint32Array(tris),
    verts, grid: { NS, NV, cols, ir, jg, im, jB, jT, sList },
    edges: { gapeL: gapeEdge(1), gapeR: gapeEdge(-1), marginL: marginEdge(1), marginR: marginEdge(-1) },
    stats: { vertices: nV, triangles: tris.length / 3 },
  };
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
  const rnd = (a, b, c) => hash01(a, b, c, 5237);
  // Photos (n ≈ 20 individuals with readable pattern): a midlateral row of 9–10 faint, diffuse dusky blotches
  // on h ≈ 0 from s ≈ 0.31 to 0.95 SL, ~0.06 SL apart, contrast fading posteriorly; no dorsal saddles.
  // (Not the conspicuous mid-body black bar of チクゼンハゼ G. uchidai.)
  const MID = [0.31, 0.37, 0.44, 0.5, 0.555, 0.615, 0.68, 0.735, 0.79, 0.845, 0.9].map((f) => f * SL);
  MID.forEach((bs, k) => {
    const st = 0.62 - 0.03 * k;
    for (let i = 0; i < 4; i++) {
      BLOBS.push([bs + (rnd(k, i, 1) - 0.5) * 1.0, (rnd(k, i, 2) - 0.5) * 0.22, 0.42 + 0.32 * rnd(k, i, 3), 0.12 + 0.1 * rnd(k, i, 4), st * (0.6 + 0.4 * rnd(k, i, 5))]);
    }
  });
  // faint dusky dorsal mottling (irregular, low contrast) — individual variation, not saddles
  const DORSAL = [];
  for (let k = 0; k < 30; k++) {
    DORSAL.push([8.5 + k * 0.95 + (rnd(k, 0, 21) - 0.5) * 0.7, 0.62 + 0.3 * rnd(k, 0, 22), 0.22 + 0.25 * rnd(k, 0, 23), 0.08 + 0.1 * rnd(k, 0, 24), 0.18 + 0.2 * rnd(k, 0, 25)]);
  }

  // Consensus spec (70 photos): a row of 6–10 small whitish iridophore spots along the dorsolateral line
  // (s 0.25–0.95 SL, h +0.05–0.07 SL) alternating with dark speckle clusters — a "beaded" dorsal edge
  // (019, 028, 034, 035, 039, 050, 061)
  const BEADS = [0.27, 0.35, 0.44, 0.53, 0.62, 0.71, 0.8, 0.88, 0.95].map((f, k) => [f * SL + (rnd(k, 0, 61) - 0.5) * 0.6, 0.66 + 0.12 * rnd(k, 0, 62), 0.55 + 0.45 * rnd(k, 0, 63)]);
  function beadAt(s, y, q) {
    let w = 0, dk = 0;
    for (let k = 0; k < BEADS.length; k++) {
      const [bs, bh, st] = BEADS[k];
      if (Math.abs(s - bs) > 2.5) continue;
      const by = q.yc + bh * q.t;
      w = Math.max(w, st * Math.exp(-((Math.hypot(s - bs, (y - by) * 1.3) / 0.3) ** 2)));
      if (k + 1 < BEADS.length) {
        const ms = 0.5 * (bs + BEADS[k + 1][0]);
        dk = Math.max(dk, Math.exp(-((Math.hypot((s - ms) / 0.75, (y - by) / 0.45)) ** 2)));
      }
    }
    return { w, dk };
  }
  // dorsal net of dark-edged scale pockets with pale centres (dorsal photos 025, 029, 043, 065), densest
  // from the nape to s ≈ 0.6 SL, often as two paramedian chains; a dark nape patch behind the eyes
  function dorsalNet(s, y, z, hn, q) {
    const top = smoothstep(0.35, 0.85, hn);
    if (top <= 0 || s < 5.5) return { net: 0, nape: 0 };
    const net = smoothstep(0.58, 0.82, ridged3(s * 0.95, y * 0.95, z * 0.95, 3, 34));
    const para = 0.55 + 0.45 * Math.exp(-(((Math.abs(z) / Math.max(q.w, 0.2) - 0.42) / 0.3) ** 2));
    const along = smoothstep(6.5, 9.0, s) * (0.45 + 0.55 * smoothstep(0.78 * SL, 0.58 * SL, s));
    const nape = smoothstep(0.5, 0.9, hn) * Math.exp(-(((s - 7.9) / 1.5) ** 2));
    return { net: top * net * para * along, nape };
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
    // エドハゼ head (photos): finely peppered top and snout; a short dark oblique streak below/behind the
    // eye (s ≈ 0.13 SL); scattered larger round dark spots on the cheek and gill cover; a dark rim round the
    // eye; a faint subocular blotch and a dotted preorbital line (spec: 010, 011, 030, 054).
    let m = 0;
    const nz = fbm3(s * 1.5, y * 1.5, 4.7, 2, 23) * 0.22;
    const eyeS = EYE.center[0], eyeY = EYE.center[1];
    const d1 = distToPolyline2(s, y, [[eyeS + 0.55, eyeY - 0.95], [eyeS + 1.35, eyeY - 1.55]]);
    m = Math.max(m, 0.42 * smoothstep(0.26, 0.08, d1 + nz));
    const spots = [[5.4, 2.65, 0.17], [6.3, 3.35, 0.15], [7.1, 2.4, 0.16], [8.0, 3.2, 0.15], [8.6, 2.1, 0.14], [5.9, 1.75, 0.13], [7.6, 1.55, 0.13], [9.3, 3.6, 0.14]];
    for (const [ss, yy, r] of spots) m = Math.max(m, 0.5 * smoothstep(r, r * 0.3, Math.hypot(s - ss, y - yy) + nz * 0.4));
    // spec: a dark oblique blotch below the anterior eye and a dotted line from the eye to the upper lip
    const d2 = distToPolyline2(s, y, [[eyeS - 0.15, eyeY - 1.0], [eyeS + 0.35, eyeY - 1.75]]);
    m = Math.max(m, 0.34 * smoothstep(0.24, 0.07, d2 + nz));
    for (let k = 0; k < 4; k++) {
      const f = (k + 0.5) / 4, ds0 = mix(eyeS - EYE.radius - 0.1, 1.15, f), dy0 = mix(eyeY - 0.45, 2.55, f);
      m = Math.max(m, 0.42 * smoothstep(0.12, 0.035, Math.hypot(s - ds0, y - dy0) + nz * 0.2));
    }
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
    // peppered dorsal two thirds (photos: fine dots ~0.002–0.003 SL), fading on the lower flank
    const upper = smoothstep(-0.45, 0.35, hn);
    let d = 3.0 + 80.0 * upper * (0.7 + 0.5 * n) + 10.0 * (1 - Math.abs(hn));
    d += 18.0 * b + 9.0 * sd; // blotches are mostly diffuse dusky pigment (smooth term), not spot clusters
    {
      const bd = beadAt(s, y, q), dn = dorsalNet(s, y, z, hn, q);
      d += 55.0 * dn.net + 40.0 * dn.nape + 45.0 * bd.dk * upper;
      d *= 1 - 0.9 * bd.w;
    }
    if (head > 0) {
      const hm = headMarks(s, y, z, hn);
      const hd = 8.0 + 48.0 * dorsal + 26.0 * smoothstep(-0.85, -0.25, hn) * (1 - dorsal) + 30.0 * hm + 8.0 * smoothstep(3.0, 0.8, s); // cheeks spotted too (photo 004)
      d = mix(d, hd, head);
    }
    // keep the eye itself and lips clean
    const ed = eyeDist(s, y, z);
    d *= 1 + 0.9 * Math.exp(-(((ed - EYE.radius - EYE.skin) / 0.35) ** 2));
    d *= 1 - belly * 0.97;
    const lb = lipBands(s, y);
    d = d * (1 - 0.6 * lb.lo) + 32.0 * lb.up + 8.0 * lb.lo;
    d *= 1 - 0.85 * lb.rim;
    const size = (0.72 + 0.35 * dorsal + 0.3 * b) * (1 - 0.15 * lb.up);
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
  // smooth pigment fields at a fish-space surface point
  function pigmentAt(s, yy, z, q = section(clamp(s, 0.01, S_END - 0.01))) {
    const dy = yy - q.yc;
    const hn = clamp(dy / Math.max(dy > 0 ? q.t : q.b, 1e-3), -1.2, 1.2);
    const head = headF(s, yy);
    const dorsal = smoothstep(-0.2, 0.8, hn);
    const belly = smoothstep(-0.05, -0.7, hn);
    const { b, sd } = blotchAt(s, yy, z, hn);
    let m = 0.03 * dorsal + 0.3 * b + 0.025 * sd;
    if (head > 0) {
      // エドハゼ: no vermiculation; the head top is peppered (point melanophores, splatted below)
      m = mix(m, 0.13 * dorsal + 0.3 * headMarks(s, yy, z, hn), head);
    }
    // dusky dorsal reticulation (pigment along scale pockets)
    m += 0.05 * dorsal * smoothstep(0.6, 0.82, ridged3(s * 2.2, yy * 2.2, z * 2.2, 3, 33)) * (1 - head * 0.5);
    const dn = dorsalNet(s, yy, z, hn, q), bd = beadAt(s, yy, q);
    m += (0.12 * dn.net + 0.1 * dn.nape) * (1 - head * 0.6);
    // posterior body: one or two thin dark axial lines along the horizontal septum carrying small dashes,
    // and a dark mark at the caudal base (spec, s 0.65–1.0)
    {
      const post = smoothstep(0.6 * SL, 0.7 * SL, s) * smoothstep(S_END + 0.2, SL + 0.4, s);
      const dash = 0.55 + 0.45 * smoothstep(0.2, 0.7, 0.5 + 0.5 * Math.sin((s / 0.85) * TAU + 1.3 * fbm3(s * 0.7, 1.1, 2.2, 2, 57)));
      const l1 = Math.exp(-(((yy - q.yc) / 0.09) ** 2)), l2 = Math.exp(-(((yy - q.yc - 0.42) / 0.06) ** 2));
      m += post * dash * (0.16 * l1 + 0.08 * l2);
      m += 0.22 * Math.exp(-((Math.hypot(s - (SL - 0.45), (yy - q.yc) * 0.9) / 0.6) ** 2));
    }
    m *= 1 - 0.85 * bd.w;
    m *= 1 - belly;
    const ed = eyeDist(s, yy, z);
    m += 0.2 * Math.exp(-(((ed - EYE.radius - EYE.skin) / 0.22) ** 2)) * smoothstep(-0.6, 0.2, yy - EYE.center[1]); // dark periocular rim
    const bellyMass = smoothstep(0.3 * SL, 0.36 * SL, s) * smoothstep(0.66 * SL, 0.6 * SL, s) * smoothstep(0.1, -0.45, hn);
    let iri = 0.7 * belly + 0.1 * smoothstep(0.05, -0.5, hn) + 0.03 * Math.exp(-(((hn - 0.02) / 0.22) ** 2)) + 0.4 * bellyMass;
    // whitish crescent under the eye (photos)
    iri = Math.max(iri, 0.55 * Math.exp(-((Math.hypot(s - EYE.center[0], yy - (EYE.center[1] - EYE.radius - 0.28)) / 0.32) ** 2)));
    iri = Math.max(iri, head * 0.25 * smoothstep(0.2, -0.6, hn) * smoothstep(2.4, 4.6, s));
    iri = Math.max(iri, 0.06 * smoothstep(EYE.radius + 0.5, EYE.radius + 0.2, ed) * smoothstep(EYE.radius, EYE.radius + 0.15, ed));
    iri = Math.max(iri, 0.62 * bd.w);
    // opercle iridescent patch (yellow-green / blue-green sheen over the gills, s 0.20–0.27 SL)
    iri = Math.max(iri, 0.3 * smoothstep(7.4, 8.2, s) * smoothstep(10.4, 9.6, s) * Math.exp(-(((hn + 0.05) / 0.45) ** 2)) * head);
    iri *= 1 - 0.7 * b;
    iri *= 0.85 + 0.3 * fbm3(s * 1.3, yy * 1.3, z * 1.3, 3, 41);
    // lips carry no silvery iridophores; the chin is only faintly silvered
    if (s < 4.6) iri *= 1 - 0.9 * smoothstep(0.7, 0.22, distToPolyline2(s, yy, MOUTH)) * smoothstep(4.4, 3.4, s);
    iri *= 1 - 0.55 * smoothstep(5.0, 3.0, s) * smoothstep(0.1, -0.4, hn);
    let xan = 0.22 + 0.38 * dorsal + 0.25 * head * smoothstep(-0.3, 0.4, hn);
    xan *= 1 - 0.85 * belly;
    xan *= 0.8 + 0.4 * fbm3(s * 0.9, yy * 0.9, z * 0.9, 3, 51);
    // gill region seen through the operculum (used for the fallback albedo only)
    const gill = smoothstep(6.6, 7.9, s) * smoothstep(10.3, 9.4, s) * smoothstep(0.35, -0.2, hn) * smoothstep(-0.95, -0.55, hn);
    return { hn, head, mel: m, iri: clamp(iri), xan: clamp(xan), gill };
  }

  // melanophores as a 3D jittered point field (used where the texture parameterisation degenerates)
  function spots3D(s0, yy, z) {
    const CELL = 0.1;
    const px = s0 / CELL, py = yy / CELL, pz = z / CELL;
    let v = 0;
    forEachCell3(px, py, pz, 6163, (fx, fy, fz, h) => {
      const [dens, size] = melDensity(Math.max(fx * CELL, 0.21), fy * CELL, fz * CELL);
      if ((h >>> 3) / 536870912 > Math.min(0.95, dens * CELL * CELL * 1.6)) return;
      const dx = (px - fx) * CELL, dy = (py - fy) * CELL, dz = (pz - fz) * CELL;
      const r = Math.hypot(dx, dy, dz);
      // same look as the texture-space splats: a soft dark core with a few short, irregular dendrites
      const rc = (0.012 + 0.014 * ((h & 255) / 255)) * size;
      if (r > rc * 3.2) return;
      const ang = Math.atan2(dz, dy) + ((h >>> 8) & 255) / 40;
      const arms = 3 + ((h >>> 16) & 3);
      const wob = 0.5 + 0.5 * Math.cos(arms * ang + 1.7 * Math.sin(2 * ang + ((h >>> 12) & 15)));
      const reach = rc * (1 + 1.4 * Math.pow(wob, 6));
      const core = smoothstep(rc * 1.05, rc * 0.25, r);
      const dend = 0.75 * smoothstep(reach, rc * 0.6, r) * Math.pow(wob, 3);
      v = Math.max(v, (0.65 + 0.3 * ((h >>> 20) & 255) / 255) * Math.max(core, dend));
    });
    return v;
  }

  for (let y = 0; y < texH; y++)
    for (let x = 0; x < texW; x++) {
      const t = y * texW + x;
      const P = pigmentAt(A.px[t], A.py[t], A.pz[t], secs[x]);
      HN[t] = P.hn; HEAD[t] = P.head; MEL[t] = P.mel; IRI[t] = P.iri; XAN[t] = P.xan; GILL[t] = P.gill;
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
      // near the snout pole the texture parameterisation collapses: spots would smear radially
      if (A.px[t] < 0.55 || A.du[t] / Math.max(A.dv[t], 1e-6) > 3) continue;
      const expected = dens * area;
      let count = Math.floor(expected);
      if (hash01(cx, cy, 1, 199) < expected - count) count++;
      for (let k = 0; k < count; k++) {
        const hx = hash01(cx, cy, k, 307), hy = hash01(cx, cy, k, 308), hs = hash01(cx, cy, k, 309), ha = hash01(cx, cy, k, 310);
        const fx = x0 + hx * (texW / cellsU), fy = y0 + hy * (texH / cellsV);
        const rCore = (0.016 + 0.014 * hs) * size;
        const punct = hash01(cx, cy, k, 312) < 0.72;
        // ~30 % lie deeper in the dermis: larger, softer and fainter through the overlying tissue
        const deep = hash01(cx, cy, k, 316) < 0.3;
        const nArms = 3 + Math.floor(hash01(cx, cy, k, 311) * 5);
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
              if (hash01(cx + a, cy, k + (sgn > 0 ? 1 : 2), 317) < 0.45) continue;
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

  // Snout tip: the loft's texture pole collapses there, so texture-space splats would smear. Place the
  // melanophores of the front face as a 3D point field instead (the front face itself is shaded from a
  // separate planar "snout cap" texture, see below).
  for (let y = 0; y < texH; y++)
    for (let x = 0; x < texW; x++) {
      const t = y * texW + x;
      if (A.px[t] > 1.25) continue;
      const v = spots3D(A.px[t], A.py[t], A.pz[t]) * smoothstep(1.25, 0.7, A.px[t]);
      MEL[t] = 1 - (1 - MEL[t]) * (1 - Math.min(v, 0.95));
    }

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
      const nape = smoothstep(7.4, 8.2, s) * smoothstep(0.5, 0.75, hn) * smoothstep(EYE.radius + 0.6, EYE.radius + 1.3, eyeDist(s, yy, z));
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
            const hsh = hash3i(col, row, 3, 2357);
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
      if (s > VERT_START + 0.6 && s < S_END - 2.2) {
        const an = Math.abs(hn);
        const chev = an < 0.55 ? an / 0.55 : 1 - (0.45 * (an - 0.55)) / 0.45;
        const ph = (s - VERT_START - 0.95 * chev) / vertLen;
        h += 0.003 * (0.5 - 0.5 * Math.cos(ph * TAU)) * smoothstep(0.15, 0.5, zn) * smoothstep(VERT_START + 0.6, VERT_START + 2.4, s) * (1 - head);
      }
      // --- micro skin texture
      h += 0.003 * fbm3(s * 18, yy * 18, z * 18, 3, 71) + 0.0012 * fbm3(s * 55, yy * 55, z * 55, 2, 72);
      if (head > 0) {
        h += head * 0.0045 * (ridged3(s * 7 + z * 3, yy * 9, z * 7, 3, 81) - 0.6);
        // lips: fine folds running across the lip roll, plus tiny papillae (fleshy, not rubbery)
        const lbH = lipBands(s, yy);
        const lipAmt = Math.max(lbH.up, lbH.lo);
        if (lipAmt > 0) {
          const fold = Math.pow(0.5 + 0.5 * Math.sin((s / 0.11 + 0.8 * fbm3(s * 6, yy * 6, z * 6, 2, 83)) * Math.PI * 2), 3);
          const pap = smoothstep(0.35, 0.6, fbm3(s * 38, yy * 38, z * 38, 2, 84));
          h += lipAmt * (-0.0045 * fold + 0.0025 * pap);
        }
        // mouth crease reinforcement
        if (s < 5.0 && yy < 2.45) {
          const dm = distToPolyline2(s, yy, MOUTH);
          h -= 0.028 * Math.exp(-((dm / 0.04) ** 2)) * smoothstep(0.1, 0.4, zn + (s < 0.6 ? 1 : 0));
        }
        // preopercular groove
        const dp = distToPolyline2(s, yy, PREOPERCLE);
        h -= 0.009 * Math.exp(-((dp / 0.05) ** 2)) * smoothstep(0.3, 0.6, zn);
        // branchiostegal folds under the throat
        if (hn < -0.4 && s > 5.2 && s < 9.8) {
          const f = Math.pow(0.5 + 0.5 * Math.sin(((s * 2.1 + Math.abs(z) * 1.6) * TAU) / 0.6), 6);
          h -= 0.005 * f * smoothstep(-0.4, -0.75, hn);
        }
      }
      // opercular margin: raised operculum + groove
      if (s > 7.8 && s < 11.2 && yy > 0.2 && yy < 4.7) {
        const d = s - sOperc(yy);
        const lat = smoothstep(0.2, 0.5, zn);
        h += lat * (0.005 * smoothstep(0.05, -0.12, d) - 0.004 * Math.exp(-((d / 0.035) ** 2))); // faint in photos (028, 004)
      }
      // fade relief out at the snout pole (degenerate UVs)
      H[t] = h * smoothstep(0.25, 0.7, s);
    }

  // pores & sensory papillae (splatted bumps/pits)
  log('    pores & papillae …');
  const bumps = [];
  // generic gobiid head canal pores and sensory papilla rows, mapped onto the エドハゼ head (mapHead)
  const MZ_PORES = [[6.6, 5.15], [7.1, 4.85], [6.9, 5.4], [6.2, 5.3], [3.7, 4.75], [3.0, 4.3], [1.8, 3.6], [7.6, 3.95], [8.0, 3.2], [8.2, 2.45], [8.0, 1.7]];
  for (const [s0, y0] of MZ_PORES) { const [s, y] = mapHead(s0, y0); bumps.push({ s, y, kind: 'pore' }); }
  const papRow = (pts0, spacing) => {
    const pts = pts0.map(([a, c]) => mapHead(a, c));
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
  papRow([[4.6, 2.95], [6.4, 3.1], [8.6, 3.05]], 0.085);
  papRow([[3.6, 2.2], [6.0, 2.25], [8.8, 2.3]], 0.085);
  papRow([[1.2, 1.1], [3.0, 0.7], [5.6, 0.5]], 0.095);
  papRow([[1.0, 2.75], [2.8, 3.35]], 0.085);
  for (const sv of [5.8, 6.6, 7.4]) papRow([[sv, 3.6], [sv + 0.15, 1.7]], 0.08);
  for (const sv of [9.1, 9.8]) papRow([[sv, 4.3], [sv + 0.1, 2.35]], 0.08);
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
          else v = (0.004 + 0.004 * hash01(Math.round(b.s * 97), Math.round(b.y * 97), 3, 9)) * smoothstep(0.024, 0.004, r);
          H[yy * texW + xx] += v;
        }
    }
  }

  // albedo (linear) + roughness at a surface point
  function shadeAt(s, yy, z, hn, head, MELv, I, X, G, cavity, halfW) {
    const dorsal = smoothstep(-0.2, 0.8, hn);
    const belly = smoothstep(-0.05, -0.7, hn);
    const M = MELv * 1.6;
    // pale amber tissue, olive-brown back, milky belly (juvenile photos IMG_1603 / 9176 / user photo 1)
    // エドハゼ (70-photo palette, white-balanced medians): pale tan back (186,171,128), warmer flank
    // (178,161,126), warm whitish belly (199,186,170); head top darker (156,145,108) via melanophores
    // the head's lower flank (cheek, gill cover) keeps the tan ground colour; only the throat is pale
    const bellyC = belly * (1 - 0.7 * head * smoothstep(-0.95, -0.55, hn));
    let r = 0.62, g = 0.49, b = 0.27;
    r = mix(r, 0.53, dorsal * 0.5); g = mix(g, 0.46, dorsal * 0.5); b = mix(b, 0.25, dorsal * 0.5);
    r = mix(r, 0.74, bellyC); g = mix(g, 0.64, bellyC); b = mix(b, 0.52, bellyC);
    r *= mix(1, 1.02, X * 0.6); g *= mix(1, 0.9, X * 0.6); b *= mix(1, 0.55, X * 0.6);
    r = mix(r, 0.78, I * 0.4); g = mix(g, 0.77, I * 0.4); b = mix(b, 0.7, I * 0.4);
    // blood-tinted throat and cheeks under the thin skin
    const flush = head * smoothstep(0.2, -0.55, hn) * smoothstep(3.8, 5.6, s) + smoothstep(8.6, 10.2, s) * smoothstep(12.6, 11.2, s) * smoothstep(0.1, -0.5, hn);
    r = mix(r, 0.76, flush * 0.25); g = mix(g, 0.55, flush * 0.25); b = mix(b, 0.47, flush * 0.25);
    const lb = lipBands(s, yy);
    {
      const n = 0.85 + 0.3 * fbm3(s * 9, yy * 9, z * 9, 2, 85);
      // upper lip: dusky olive-brown like the snout, speckled (speckles come from MEL below)
      r = mix(r, 0.56 * n, lb.up * 0.35); g = mix(g, 0.46 * n, lb.up * 0.35); b = mix(b, 0.3 * n, lb.up * 0.35);
      // lower lip: pale warm cream (not grey-white), a little translucent
      r = mix(r, 0.7 * n, lb.lo * 0.4); g = mix(g, 0.6 * n, lb.lo * 0.4); b = mix(b, 0.46 * n, lb.lo * 0.4);
      // moist margin: faint warm translucency, strongly desaturated
      r = mix(r, 0.66, lb.rim * 0.22); g = mix(g, 0.52, lb.rim * 0.22); b = mix(b, 0.45, lb.rim * 0.22);
    }
    r *= Math.exp(-M * 2.0); g *= Math.exp(-M * 2.15); b *= Math.exp(-M * 2.35);
    // shadowed mouth slit
    if (s < 4.6 && yy < 2.45) {
      const dm = distToPolyline2(Math.max(s, 0.02), yy, MOUTH);
      const slit = 0.6 * Math.exp(-((dm / 0.07) ** 2)) * smoothstep(0.1, 0.35, Math.abs(z) / Math.max(halfW, 1e-3) + (s < 0.6 ? 1 : 0));
      r *= 1 - 0.42 * slit; g *= 1 - 0.44 * slit; b *= 1 - 0.46 * slit;
    }
    const gl = G * 0.35;
    g *= 1 - 0.2 * gl; b *= 1 - 0.22 * gl;
    let rough = 0.31 + 0.035 * fbm3(s * 1.7, yy * 1.7, z * 1.7, 3, 91) - 0.04 * head + 0.03 * belly + cavity * 0.25;
    rough += 0.12 * Math.max(lb.up, lb.lo) - 0.06 * lb.rim;
    return { r, g, b, rough };
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
      const poleK = smoothstep(0.3, 0.8, A.px[t]);
      const gx = poleK * (H[y * texW + xp] - H[y * texW + xm]) / ((xp - xm) * A.du[t]);
      const gyUp = poleK * (H[ym * texW + x] - H[yp * texW + x]) / (2 * Math.max(A.dv[t], 0.004));
      let nx = -gx, ny = -gyUp, nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl; ny /= nl; nz /= nl;
      normalMap[t * 3] = Math.round((nx * 0.5 + 0.5) * 255);
      normalMap[t * 3 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalMap[t * 3 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      // cavity from the height Laplacian (mm^-1)
      // (dv is clamped: near the snout pole the texel height collapses and would blow up the Laplacian)
      const lap = poleK * (H[y * texW + xp] + H[y * texW + xm] - 2 * H[t]) / (A.du[t] * A.du[t]) + poleK *
        (H[ym * texW + x] + H[yp * texW + x] - 2 * H[t]) / Math.max(A.dv[t] * A.dv[t], 1e-4);
      const cavity = clamp(lap * 0.35, 0, 0.35);

      const s = A.px[t], yy = A.py[t], z = A.pz[t];
      const C = shadeAt(s, yy, z, HN[t], HEAD[t], MEL[t], IRI[t], XAN[t], GILL[t], cavity, secs[x].w);
      const I = IRI[t], X = XAN[t];
      albedo[t * 3] = srgb(C.r); albedo[t * 3 + 1] = srgb(C.g); albedo[t * 3 + 2] = srgb(C.b);
      const ao = clamp(A.ao[t] * (1 - cavity), 0, 1);
      orm[t * 3] = Math.round(ao * 255);
      orm[t * 3 + 1] = Math.round(clamp(C.rough, 0.12, 0.8) * 255);
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
  // ---------------------------------------------------------------------------
  // Snout cap: planar (y, z) projection of the front face, shaded with the same functions. The viewer
  // blends it over the loft UVs where they converge at the snout tip.
  log('    snout cap …');
  const CAP = texW >= 2048 ? 384 : 192;
  const capRect = { y0: -0.2, y1: 4.6, z0: -2.4, z1: 2.4 };
  const capAlb = new Uint8Array(CAP * CAP * 4);
  const capPig = new Uint8Array(CAP * CAP * 3);
  const valid = new Uint8Array(CAP * CAP);
  for (let j = 0; j < CAP; j++)
    for (let i = 0; i < CAP; i++) {
      const yy = capRect.y0 + ((j + 0.5) / CAP) * (capRect.y1 - capRect.y0);
      const z = capRect.z0 + ((i + 0.5) / CAP) * (capRect.z1 - capRect.z0);
      // march from in front of the fish toward +s until inside
      let s0 = -1.2, hit = false;
      for (let k = 0; k < 160; k++) { if (field(s0, yy, z) < 0) { hit = true; break; } s0 += 0.025; }
      if (!hit || s0 > 2.2) continue;
      let lo = s0 - 0.025, hi = s0;
      for (let k = 0; k < 12; k++) { const m = 0.5 * (lo + hi); if (field(m, yy, z) < 0) hi = m; else lo = m; }
      const sp = 0.5 * (lo + hi);
      const P = pigmentAt(Math.max(sp, 0.02), yy, z);
      const mel = 1 - (1 - P.mel) * (1 - Math.min(spots3D(Math.max(sp, 0.21), yy, z), 0.95));
      const C = shadeAt(Math.max(sp, 0.02), yy, z, P.hn, P.head, mel, P.iri, P.xan, P.gill, 0, section(Math.max(sp, 0.05)).w);
      const o = j * CAP + i;
      valid[o] = 1;
      capAlb[o * 4] = srgb(C.r); capAlb[o * 4 + 1] = srgb(C.g); capAlb[o * 4 + 2] = srgb(C.b);
      capAlb[o * 4 + 3] = Math.round(clamp(C.rough, 0.12, 0.8) * 255);
      capPig[o * 3] = Math.round(clamp(mel) * 255); capPig[o * 3 + 1] = Math.round(P.iri * 255); capPig[o * 3 + 2] = Math.round(P.xan * 255);
    }
  // dilate into the empty border so bilinear / mip filtering never pulls in black
  for (let pass = 0; pass < 12; pass++) {
    const next = valid.slice();
    for (let j = 0; j < CAP; j++)
      for (let i = 0; i < CAP; i++) {
        const o = j * CAP + i;
        if (valid[o]) continue;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= CAP || jj >= CAP) continue;
          const q = jj * CAP + ii;
          if (!valid[q]) continue;
          for (let c = 0; c < 4; c++) capAlb[o * 4 + c] = capAlb[q * 4 + c];
          for (let c = 0; c < 3; c++) capPig[o * 3 + c] = capPig[q * 3 + c];
          next[o] = 1;
          break;
        }
      }
    valid.set(next);
  }
  const cap = { size: CAP, albedo: capAlb, pigment: capPig, rect: capRect };
  return { width: texW, height: texH, albedo, normal: normalMap, orm, pigment, volume, cap };
}
