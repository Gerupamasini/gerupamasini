// Skin mesh (head / trunk / tail), mouth interior and baked skin textures for the adult トビハゼ.
import {
  S_END, SL, BODY_U, EYE, MOUTH, RICTUS_S, OPERCLE, PREOPERCLE, FEAT,
  section, basePoint, project, field, fieldGrad, toObject, dirToObject, gapeY, sideZ, normHeight, topY, botY, norm3,
} from './anatomy.mjs';
import { perlin3, fbm3, ridged3, hash01, hash3i, clamp, mix, smoothstep, forEachCell3 } from '../../lib/noise.mjs';

const TAU = Math.PI * 2;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

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
    const pg = gapePhi(s), pr = phiBase[jg];
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
    const v0 = verts[i * NV];
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
      if (sList[i] > 5.5) break;
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
      const f = smoothstep(2.5, 5.5, v.s);
      v.n = norm3([n[0] * (1 - f) + v.n[0] * f, n[1] * (1 - f) + v.n[1] * f, n[2] * (1 - f) + v.n[2] * f]);
    }
    for (let i = 0; i < NS; i++) verts[i * cols + NV].n = verts[i * cols].n;
  }
  // the gape columns: snap onto the crease between the lips by marching horizontally inward at the gape height
  for (let i = i0; i <= ir; i++) for (const j of [jg, NV - jg]) {
    const v = verts[gid(i, j)];
    const side = j < NV / 2 ? 1 : -1;
    const sv = v.fish[0], yg = gapeY(Math.min(sv, RICTUS_S));
    const fwd = smoothstep(2.4, S_FRONT, sv);
    const d = norm3([fwd, 0, -side * (1 - fwd)]);
    const o = [sv - d[0] * 3, yg, side * 7 * (1 - fwd)];
    let t0 = -1;
    for (let n = 0; n < 500; n++) { const t = n * 0.02; if (field(o[0] + d[0] * t, o[1], o[2] + d[2] * t) < 0) { t0 = t; break; } }
    if (t0 < 0) continue;
    let lo = t0 - 0.02, hi = t0;
    for (let n = 0; n < 16; n++) { const m = 0.5 * (lo + hi); if (field(o[0] + d[0] * m, o[1], o[2] + d[2] * m) < 0) hi = m; else lo = m; }
    const t = 0.5 * (lo + hi);
    const p = [o[0] + d[0] * t, o[1], o[2] + d[2] * t];
    if (Math.abs(p[0] - sv) > 0.8) continue;
    v.fish = p;
    v.n = fieldGrad(p[0], p[1], p[2]);
  }
  // jaw membership and the duplicated cut vertices
  const inStrip = (j) => j <= jg || j >= NV - jg;
  for (const v of verts) if (v.i > i0 && v.i < ir && inStrip(v.j) && v.j !== jg && v.j !== NV - jg) v.jaw = 1;
  const jawCopy = new Map();
  const dup = (g, tag) => { const c = { ...verts[g], jaw: 1, cut: 'lower' }; verts[g].cut = tag; jawCopy.set(g, verts.length); verts.push(c); };
  for (let i = i0; i < ir; i++) for (const j of [jg, NV - jg]) dup(gid(i, j), 'upper');
  for (let j = 0; j <= NV; j++) if (inStrip(j) && j !== jg && j !== NV - jg) dup(gid(i0, j), 'upper');
  const isJawQuad = (i, j) => i >= i0 && i + 1 <= ir && (j + 1 <= jg || j >= NV - jg);
  return { verts, sList, cols, NS, NV, jg, i0, ir, gid, jawCopy, isJawQuad, phiOf };
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
    uv[k * 2] = clamp(v.s / S_END, 0, 1) * BODY_U;
    uv[k * 2 + 1] = v.phi / TAU;
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
    const p = project(v.base, opts);
    const a = toObject(v.fish), b = toObject(p);
    d[k * 3] = b[0] - a[0]; d[k * 3 + 1] = b[1] - a[1]; d[k * 3 + 2] = b[2] - a[2];
  });
  return d;
}

/**
 * Mouth interior: a pouch hanging from the upper and lower cut edges into the head (palate above, floor below),
 * dark and wet; seen only while the jaw is open.
 */
export function buildMouth(G) {
  const { verts, gid, jawCopy, jg, i0, ir, NV } = G;
  // the U-shaped cut, from the left rictus forward, across the front, back to the right rictus
  const ring = [];
  for (let i = ir; i >= i0; i--) ring.push(gid(i, jg));
  for (let j = jg - 1; j >= 1; j--) ring.push(gid(i0, j));
  for (let j = NV; j >= NV - jg; j--) if (j !== NV || true) ring.push(gid(i0, j));
  for (let i = i0 + 1; i <= ir; i++) ring.push(gid(i, NV - jg));
  const up = ring.map((g) => verts[g].fish);
  const lo = ring.map((g) => verts[jawCopy.get(g) ?? g].fish);
  const NR = 7; // rows from the lip edge into the cavity
  const position = [], normal = [], uv = [], color = [], fishPts = [], zone = [];
  const rows = [];
  const cavity = (p, upper, f) => {
    // pull toward a centre line behind the gape: up into the palate or down into the floor of the mouth
    const sC = Math.min(p[0] + 2.6 + 1.2 * f, RICTUS_S + 2.5);
    const cy = gapeY(Math.min(p[0], RICTUS_S)) + (upper ? 1.1 : -0.5);
    const tgt = [sC, cy, p[2] * 0.25];
    const k = Math.sin(f * Math.PI * 0.5);
    return [p[0] + (tgt[0] - p[0]) * k, p[1] + (tgt[1] - p[1]) * k * (upper ? 1 : 0.9), p[2] + (tgt[2] - p[2]) * k];
  };
  for (const upper of [true, false]) {
    const edge = upper ? up : lo;
    for (let r = 0; r <= NR; r++) {
      const f = r / NR;
      const row = [];
      for (let k = 0; k < edge.length; k++) {
        const p = cavity(edge[k], upper, Math.max(f, 0.06));
        // recess the first row slightly so the pouch starts just inside the lip margin
        row.push(position.length / 3);
        const inset = r === 0 ? 0 : 0;
        position.push(...toObject([p[0] + inset, p[1], p[2]]));
        fishPts.push(p);
        zone.push(upper ? 0 : 1);
        uv.push(k / (edge.length - 1), f * 0.5 + (upper ? 0 : 0.5));
        // the lip margin is skin-coloured; inside, the wet mucosa darkens quickly into the throat
        const shade = 1 - 0.85 * smoothstep(0.05, 0.8, f);
        const lip = 1 - smoothstep(0.0, 0.2, f);
        color.push((0.3 + 0.08 * lip) * shade + 0.02, (0.17 + 0.1 * lip) * shade + 0.02, (0.16 + 0.08 * lip) * shade + 0.02, 1);
        normal.push(0, upper ? -1 : 1, 0);
      }
      rows.push(row);
    }
  }
  const tris = [];
  const W = up.length;
  for (let part = 0; part < 2; part++) for (let r = 0; r < NR; r++) {
    const A = rows[part * (NR + 1) + r], B = rows[part * (NR + 1) + r + 1];
    for (let k = 0; k < W - 1; k++) {
      if (part === 0) tris.push(A[k], B[k], B[k + 1], A[k], B[k + 1], A[k + 1]);
      else tris.push(A[k], B[k + 1], B[k], A[k], A[k + 1], B[k + 1]);
    }
  }
  // close the back: join the deepest palate row to the deepest floor row
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
    indices: new Uint32Array(tris), fish: fishPts, zone,
  };
}

// =============================================================================================== textures

/** sRGB 0..255 helpers */
const C = (r, g, b) => [r, g, b];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// colours read from the photos (wet animal in daylight, sRGB)
const COL = {
  dorsal: C(104, 98, 84),
  flank: C(128, 121, 104),
  belly: C(200, 196, 184),
  throat: C(184, 178, 164),
  dark: C(46, 42, 36),
  speck: C(58, 52, 44),
  pale: C(214, 218, 212),
  blue: C(170, 200, 214),
  lip: C(150, 142, 126),
  arm: C(176, 160, 132),
};

/** jittered dot field on the surface (3D cells): returns coverage 0..1 of dots of radius r (mm) at density */
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
function skinPoint(s, phi, p, n, ao) {
  const nh = normHeight(s, p[1]);
  const z = p[2];
  const lat = Math.abs(n[2]);
  const ventral = smoothstep(-0.15, -0.7, nh) * smoothstep(0.1, -0.5, n[1]);
  const dorsal = smoothstep(0.1, 0.75, nh);
  // base colour: dark olive-brown back, lighter flanks, pale belly; the throat and chin a little darker than the belly
  let col = lerp3(COL.flank, COL.dorsal, dorsal);
  col = lerp3(col, lerp3(COL.throat, COL.belly, smoothstep(10, 18, s)), ventral);
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
      // lateral blotch between saddles, elongated along the body, ragged
      const bl = (s + warp * 0.8 - c - 3.6) / 1.9;
      const bh = (nh - 0.08 + 0.15 * perlin3(p[0] * 0.6, 3, 7, 29)) / 0.26;
      const blotch = Math.exp(-(bl * bl + bh * bh) * 1.6);
      dark = Math.max(dark, blotch);
    }
    // break everything up into a reticulate, speckled pattern
    const brk = fbm3(p[0] * 0.75, p[1] * 0.75, p[2] * 0.75, 4, 37);
    dark *= smoothstep(-0.45, 0.35, brk + 0.2);
    dark *= 1 - ventral;
  }
  // head: fine reticulate mottling
  if (s < 18) {
    const r = ridged3(p[0] * 0.65, p[1] * 0.65, p[2] * 0.65, 3, 41);
    dark = Math.max(dark, smoothstep(0.72, 0.9, r) * 0.5 * (1 - ventral) * smoothstep(17.5, 13, s));
  }
  col = lerp3(col, COL.dark, clamp(dark) * 0.66);
  // melanophore speckle: dense, fine, stronger on the back and head
  const sp = dots(p, 0.42, 0.11, 101, 0.8) * (0.35 + 0.65 * (1 - ventral)) * (s < 16 ? 1.1 : 1);
  col = lerp3(col, COL.speck, sp * 0.75);
  const sp2 = dots(p, 0.9, 0.16, 131, 0.5) * (1 - ventral);
  col = lerp3(col, COL.dark, sp2 * 0.6);
  // small pale (some bluish) spots over cheeks and flanks
  const pale = dots(p, 1.25, 0.2, 211, 0.55, 0.5) * smoothstep(-0.6, -0.1, nh) * smoothstep(0.85, 0.3, nh) * (1 - ventral * 0.8);
  const blueish = s < 18 ? 0.65 : 0.25;
  col = lerp3(col, lerp3(COL.pale, COL.blue, blueish), pale * 0.55);
  // lips
  const g = gapeY(Math.min(Math.max(s, MOUTH[0][0]), RICTUS_S));
  if (s < RICTUS_S + 1.2) {
    const dy = p[1] - g;
    const along = smoothstep(RICTUS_S + 1.0, RICTUS_S - 0.2, s);
    const up = dy > 0 ? smoothstep(1.3, 0.5, dy) * along : 0;
    const lo = dy <= 0 ? smoothstep(0.7, 0.2, -dy) * along : 0;
    col = lerp3(col, COL.lip, up * 0.55);
    col = lerp3(col, COL.belly, lo * 0.6);
  }
  // eye turrets: the dermal cup's rim is paler and smoother
  for (const e of FEAT.eyes) {
    const dE = Math.hypot(p[0] - e.c[0], p[1] - e.c[1], p[2] - e.c[2]);
    const rim = smoothstep(EYE.radius + 0.75, EYE.radius + 0.12, dE);
    col = lerp3(col, lerp3(col, COL.lip, 0.6), rim * 0.6);
  }
  // pectoral lobe: pale, fleshy
  {
    const L = FEAT.pecLobe;
    const d = Math.hypot((p[0] - L[0]) / 2.6, (p[1] - L[1]) / 2.2, (Math.abs(z) - L[2]) / 1.4);
    col = lerp3(col, COL.arm, smoothstep(1.2, 0.6, d) * 0.5);
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

  // ---------------- roughness and skin data
  let rough = 0.52 + 0.08 * fbm3(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, 2, 91) + 0.06 * dorsal;
  const mudAff = clamp(ventral * 0.8 + smoothstep(0.0, -0.6, nh) * 0.35 + (1 - ao) * 0.6 + 0.25 * fbm3(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4, 3, 97));
  const mucus = clamp(0.55 + 0.35 * (1 - ao) + 0.2 * ventral - 0.25 * dorsal + 0.2 * fbm3(p[0] * 0.7, p[1] * 0.7, p[2] * 0.7, 3, 103));
  // what dries first in the sun and wind: the top of the head, the eye turrets and the back
  let sun = clamp(smoothstep(0.0, 0.8, n[1]) * 0.8 + 0.2 * dorsal);
  for (const e of FEAT.eyes) sun = Math.max(sun, smoothstep(EYE.radius + 1.6, EYE.radius + 0.3, Math.hypot(p[0] - e.c[0], p[1] - e.c[1], p[2] - e.c[2])) * 0.9);
  return { col, h, rough, mudAff, mucus, sun, lat };
}

/**
 * Bake the skin textures over the uv layout (u = s / S_END · BODY_U, v = phi / 2π) plus the pectoral arm strip
 * (u ∈ [BODY_U, 1]), from a projected grid.
 */
export function bakeSkinTextures({ W, H, armPaint, log = () => {} }) {
  // projected bake grid, regular in s and phi
  const NSb = Math.max(160, Math.round(W * BODY_U * 0.16)), NVb = Math.max(96, Math.round(H * 0.16));
  log(`  bake grid ${NSb}×${NVb} …`);
  const GP = new Float32Array((NSb + 1) * (NVb + 1) * 3), GN = new Float32Array((NSb + 1) * (NVb + 1) * 3), GA = new Float32Array((NSb + 1) * (NVb + 1));
  for (let i = 0; i <= NSb; i++) {
    const s = Math.min(S_END - 0.005, Math.max(0.005, (i / NSb) * S_END));
    const q = section(s);
    for (let j = 0; j <= NVb; j++) {
      const phi = (j / NVb) * TAU;
      const p = project(basePoint(s, phi, q));
      const nn = fieldGrad(p[0], p[1], p[2]);
      const k = i * (NVb + 1) + j;
      GP.set(p, k * 3); GN.set(nn, k * 3);
      let occ = 0;
      const dks = [0.12, 0.3, 0.6, 1.1, 1.8], wks = [0.3, 0.27, 0.2, 0.14, 0.09];
      for (let m = 0; m < dks.length; m++) {
        const d = dks[m];
        occ += (wks[m] * Math.max(0, d - field(p[0] + nn[0] * d, p[1] + nn[1] * d, p[2] + nn[2] * d))) / d;
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
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const phi = v * TAU;
    for (let x = 0; x < WB; x++) {
      const u = (x + 0.5) / WB;
      const s = u * S_END;
      const { p, n, ao } = sample(u, v);
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
  // the pectoral arm strip
  const WA = W - WB;
  for (let y = 0; y < H; y++) for (let x = 0; x < WA; x++) {
    const ua = (x + 0.5) / WA, va = (y + 0.5) / H;
    const r = armPaint(ua, va);
    const k = y * W + WB + x;
    for (let c = 0; c < 3; c++) albedo[k * 3 + c] = clamp(Math.round(r.col[c]), 0, 255);
    height[k] = r.h;
    orm[k * 3] = Math.round(255 * r.ao); orm[k * 3 + 1] = Math.round(255 * r.rough); orm[k * 3 + 2] = 0;
    data[k * 3] = Math.round(255 * r.mudAff); data[k * 3 + 1] = Math.round(255 * r.mucus); data[k * 3 + 2] = Math.round(255 * r.sun);
  }
  // normal map from the height field (metric: mm per texel along u and v)
  log('  normal map …');
  const normal = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    const inArm = x >= WB;
    const xl = inArm ? Math.max(WB, x - 1) : Math.max(0, x - 1), xr = inArm ? Math.min(W - 1, x + 1) : Math.min(WB - 1, x + 1);
    const yu = (y + H - 1) % H, yd = (y + 1) % H;
    let mmU, mmV;
    if (inArm) { mmU = 6.0 / WA; mmV = 7.0 / H; } else {
      const i = Math.min(NSb, Math.round(((x + 0.5) / WB) * NSb));
      mmU = S_END / WB; mmV = (arcPerRad[i] * TAU) / H;
    }
    const dhdu = (height[y * W + xr] - height[y * W + xl]) / ((xr - xl) * mmU || 1);
    const dhdv = (height[yu * W + x] - height[yd * W + x]) / (2 * mmV);
    // the uv rows converge at the snout tip: fade the relief out there (the texel metric degenerates)
    const kTip = inArm ? 1 : smoothstep(1.2, 4.0, ((x + 0.5) / WB) * S_END);
    const nn = norm3([-dhdu * kTip, dhdv * kTip, 1]);
    normal[k * 3] = Math.round((nn[0] * 0.5 + 0.5) * 255);
    normal[k * 3 + 1] = Math.round((nn[1] * 0.5 + 0.5) * 255);
    normal[k * 3 + 2] = Math.round((nn[2] * 0.5 + 0.5) * 255);
  }
  return { width: W, height: H, albedo, normal, orm, data };
}

export { COL };
