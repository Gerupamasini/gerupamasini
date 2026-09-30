// Procedural, skinned geometry for ヒメハゼ.
// Fish local frame: +X = anterior (snout), +Y = dorsal, +Z = fish's right side. Units: metres.
// All builders take positions in "s-space" (s ∈ [0,1] snout→caudal tip, lengths ×TL) and emit metres.
import * as THREE from 'three';
import { SECTIONS, FINS, PROPORTIONS, ROOT_S } from './anatomy.js';
import { BODY_END } from '../textures/HimehazeTextures.js';

// ----- bone layout --------------------------------------------------------------------------------
// Axial chain (s positions). Head is the neck joint pivot; Spine01 sits at the pelvic/root pivot.
export const AXIAL = [
  ['Head', 0.235], ['Spine01', 0.30], ['Spine02', 0.40], ['Spine03', 0.50], ['Spine04', 0.60],
  ['Spine05', 0.70], ['TailBase', 0.78], ['TailMid', 0.86], ['TailTip', 0.94],
];
export const BONE_NAMES = [
  'Root', 'Body', ...AXIAL.map((a) => a[0]),
  'Jaw', 'Opercle_L', 'Opercle_R', 'Eye_L', 'Eye_R',
  'DorsalFin1', 'DorsalFin2', 'AnalFin', 'Pectoral_L', 'Pectoral_R', 'Pelvic', 'Caudal',
];
export const BI = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));

// ----- section interpolation ----------------------------------------------------------------------
const KEYS = ['top', 'bot', 'w', 'n', 'nb', 'yc'];
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
export function sectionAt(s) {
  const S = SECTIONS;
  if (s <= S[0].s) return { ...S[0] };
  if (s >= S[S.length - 1].s) return { ...S[S.length - 1] };
  let i = 0; while (S[i + 1].s < s) i++;
  const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)];
  const t = (s - b.s) / (c.s - b.s);
  const out = { s };
  for (const k of KEYS) out[k] = Math.max(k === 'yc' ? -1 : 0.0005, catmull(a[k], b[k], c[k], d[k], t));
  if (out.yc < -0.5) out.yc = b.yc;
  return out;
}

const sgnPow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ----- landmark helpers (s-space, ×TL) -----------------------------------------------------------
export function eyeCentre(v, side) {
  const s = PROPORTIONS.eyeCentreS[0];
  const sec = sectionAt(s);
  const R = (PROPORTIONS.eyeDiameter[0] / 2) * v.eyeScale;
  // dorsolateral & close-set: centre sits just below the dorsal profile, bulging above it (P)
  // centre sits ~0.45 R beneath the dorsolateral head surface so only the upper-lateral part protrudes (P)
  return { x: s, y: sec.yc + sec.top * v.headScale * 0.66, z: side * sec.w * v.headScale * 0.36, R };
}

// ----- skin weights --------------------------------------------------------------------------------
function axialWeights(s) {
  if (s <= AXIAL[0][1]) return [[BI.Head, 1]];
  for (let i = 0; i < AXIAL.length - 1; i++) {
    const [na, sa] = AXIAL[i], [nb, sb] = AXIAL[i + 1];
    if (s <= sb) { const t = sstep(0, 1, (s - sa) / (sb - sa)); return [[BI[na], 1 - t], [BI[nb], t]]; }
  }
  return [[BI.TailTip, 1]];
}
function pack(list) {
  const m = new Map();
  for (const [i, w] of list) if (w > 1e-4) m.set(i, (m.get(i) || 0) + w);
  const arr = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = arr.reduce((a, e) => a + e[1], 0) || 1;
  while (arr.length < 4) arr.push([0, 0]);
  return arr.map(([i, w]) => [i, w / sum]);
}
const scaleList = (l, k) => l.map(([i, w]) => [i, w * k]);

// ----- body ---------------------------------------------------------------------------------------
export function buildBody(v, detail) {
  const TL = v.TL;
  const rings = detail.rings, radial = detail.radial;
  const pos = [], uv = [], sIdx = [], sW = [], idx = [];
  const eyes = [eyeCentre(v, 1), eyeCentre(v, -1)];

  // non-uniform s sampling: denser in the head
  const sAt = (i) => { const t = i / (rings - 1); return BODY_END * (0.55 * t * t + 0.45 * t) ; };
  const vtx = new THREE.Vector3();

  for (let i = 0; i < rings; i++) {
    const s = sAt(i);
    const sec = sectionAt(s);
    const head = sstep(0.30, 0.18, s);
    const hs = 1 + (v.headScale - 1) * head;
    const top = sec.top * hs * v.thickness, bot = sec.bot * hs * v.thickness, w = sec.w * hs * v.thickness * v.width;
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const up = c >= 0;
      const n = up ? sec.n : sec.nb;
      let y = sec.yc + (up ? top : bot) * sgnPow(c, 2 / n);
      let z = w * sgnPow(sn, 2 / n);
      let x = s;
      const lat = c;

      // lower jaw projects beyond upper jaw (F): lower-front vertices pushed anterior
      if (s < 0.05 && lat < 0.1) x -= 0.007 * (1 - s / 0.05) * sstep(0.1, -0.6, lat);
      // pointed, slightly depressed snout: flatten dorsal snout profile (P)
      if (s < 0.09 && up) y -= top * 0.12 * sstep(0.09, 0.02, s) * c;
      // mouth gape groove: oblique line from snout tip to below anterior eye (P)
      const gapeY = sec.yc - 0.004 + (s - 0.0) * -0.18;
      if (s < PROPORTIONS.mouthRearS[0] + 0.01 && Math.abs(sn) > 0.2) {
        const g = Math.exp(-(((y - gapeY) / 0.0035) ** 2)) * sstep(PROPORTIONS.mouthRearS[0] + 0.01, 0.07, s);
        z *= 1 - 0.10 * g; y -= 0.0015 * g;
      }
      // cheek bulge and operculum margin (curved groove with raised posterior lip)
      const cheek = Math.exp(-(((s - 0.17) / 0.045) ** 2)) * sstep(0.5, -0.3, lat) * sstep(-1, -0.6, lat);
      z *= 1 + 0.06 * cheek;
      const opS = PROPORTIONS.opercleRearS[0] - 0.012 * (1 - lat) * 0.5;   // margin curves forward ventrally
      const dOp = s - opS;
      if (lat < 0.7) {
        const groove = Math.exp(-((dOp / 0.006) ** 2)) * sstep(0.7, 0.3, lat);
        z *= 1 - 0.05 * groove;
        y += 0;
      }
      // gill-slit: ventral isthmus narrowing (P)
      if (lat < -0.6) z *= 1 - 0.1 * Math.exp(-((dOp / 0.02) ** 2));

      vtx.set(x, y, z);
      // orbits: dimple under eyeball + raised rim so the eyes sit in sockets on top of the head
      for (const e of eyes) {
        const dx = vtx.x - e.x, dy = vtx.y - e.y, dz = vtx.z - e.z;
        const d = Math.hypot(dx, dy, dz);
        const R = e.R;
        // skin passing through the eyeball stays hidden inside it; just outside, a soft orbital rim
        if (d >= R * 0.98 && d < R * 1.5) {
          const bump = Math.sin(((d - R * 0.98) / (R * 0.52)) * Math.PI) * R * 0.07;
          vtx.x += (dx / d) * bump * 0.3; vtx.y += (dy / d) * bump; vtx.z += (dz / d) * bump;
        }
      }
      // interorbital depression and naked nape (smooth profile)
      if (up && s > 0.08 && s < 0.2) vtx.y -= Math.exp(-((vtx.z / 0.01) ** 2)) * 0.003 * sstep(0.08, 0.12, s) * sstep(0.2, 0.15, s);

      pos.push((ROOT_S - vtx.x) * TL, vtx.y * TL, vtx.z * TL);
      uv.push(s / BODY_END, j / radial);

      // skin weights
      let wl = axialWeights(s);
      // jaw: lower head ahead of the jaw joint
      const jaw = sstep(0.11, 0.07, s) * sstep(0.0, -0.45, lat);
      // opercle flaps: lateral head region between cheek and opercle margin
      const op = sstep(0.17, 0.215, s) * sstep(opS + 0.004, opS - 0.002, s) * sstep(0.55, 0.1, lat) * sstep(-0.95, -0.6, lat);
      // branchiostegal / throat pumps with jaw (buccal pumping)
      const throat = sstep(0.08, 0.14, s) * sstep(0.24, 0.18, s) * sstep(-0.55, -0.9, lat);
      const rest = Math.max(0, 1 - jaw - op - throat * 0.6);
      wl = pack([
        ...scaleList(wl, rest), [BI.Jaw, jaw + throat * 0.6],
        [sn >= 0 ? BI.Opercle_R : BI.Opercle_L, op],
      ]);
      for (const [bi, bw] of wl) { sIdx.push(bi); sW.push(bw); }
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // caps: snout tip and caudal-end
  const capAt = (ring, dir, s) => {
    const cx = [0, 0, 0];
    for (let j = 0; j < radial; j++) for (let k = 0; k < 3; k++) cx[k] += pos[(ring * stride + j) * 3 + k] / radial;
    cx[0] += dir * 0.0015 * TL;
    const ci = pos.length / 3;
    pos.push(...cx); uv.push(s / BODY_END, 0.5);
    for (const [bi, bw] of pack(axialWeights(s))) { sIdx.push(bi); sW.push(bw); }
    for (let j = 0; j < radial; j++) {
      const a = ring * stride + j, b = a + 1;
      if (dir > 0) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  capAt(0, 1, 0); capAt(rings - 1, -1, BODY_END);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld normals across the UV seam (dorsal midline)
  const nrm = g.attributes.normal;
  for (let i = 0; i < rings; i++) {
    const a = i * stride, b = a + radial;
    const nx = nrm.getX(a) + nrm.getX(b), ny = nrm.getY(a) + nrm.getY(b), nz = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l); nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  g.computeTangents?.();
  g.computeBoundingSphere();
  return g;
}
function mix(a, b, t) { return a + (b - a) * t; }

// ----- fins ---------------------------------------------------------------------------------------
// A fin is described by rays: base point, unit direction, length (s-space). The membrane is a grid
// spanned between neighbouring rays with pleating (corrugation) and incised margins; rays are thin
// tapered prisms. weightFn(s, t, rayIndex) → bone weight list.
export function buildFin(def, v, detail) {
  const TL = v.TL;
  const { rays, segs = detail.finSeg, pleat = 0.004, incision = 0.0, sub = detail.finSub, weightFn, thickness = 0.0016 } = def;
  const mPos = [], mUv = [], mIdx = [], mSI = [], mSW = [];
  const rPos = [], rIdx = [], rSI = [], rSW = [], rUv = [];
  const toM = (p) => [(p[0] - ROOT_S) * -TL, p[1] * TL, p[2] * TL];
  const pt = (r, t) => {
    // curved ray: slight bend (rays arc distally)
    const b = r.bend || 0;
    return [
      r.base[0] + r.dir[0] * r.len * t + (r.bendDir?.[0] || 0) * b * t * t,
      r.base[1] + r.dir[1] * r.len * t + (r.bendDir?.[1] || 0) * b * t * t,
      r.base[2] + r.dir[2] * r.len * t + (r.bendDir?.[2] || 0) * b * t * t,
    ];
  };
  const nR = rays.length;
  const cols = (nR - 1) * sub + 1;
  for (let ci = 0; ci < cols; ci++) {
    const rf = ci / sub, r0 = Math.min(nR - 2, Math.floor(rf)), a = rf - r0;
    const A = rays[r0], B = rays[r0 + 1];
    const tMax = 1 - incision * Math.sin(Math.PI * a) * (def.incisionProfile ? def.incisionProfile(r0) : 1);
    for (let k = 0; k <= segs; k++) {
      const t = (k / segs) * tMax;
      const pa = pt(A, t / 1), pb = pt(B, t / 1);
      // lengths of neighbouring rays can differ; interpolate along each own ray
      const p = [mix(pa[0], pb[0], a), mix(pa[1], pb[1], a), mix(pa[2], pb[2], a)];
      // pleat: membrane between rays sits slightly to one side (corrugated fan)
      const pl = Math.sin(Math.PI * a) * pleat * t * ((r0 % 2) ? 1 : -1);
      const n = def.normal;
      p[0] += n[0] * pl; p[1] += n[1] * pl; p[2] += n[2] * pl;
      mPos.push(...toM(p));
      mUv.push((r0 + a) / (nR - 1), t);
      for (const [bi, bw] of pack(weightFn(p[0], t, r0 + a))) { mSI.push(bi); mSW.push(bw); }
    }
  }
  const st = segs + 1;
  for (let ci = 0; ci < cols - 1; ci++) for (let k = 0; k < segs; k++) {
    const a = ci * st + k, b = a + 1, c = a + st, d = c + 1;
    mIdx.push(a, c, b, b, c, d);
  }
  // rays: 3-sided tapered prisms (visible as fine ridges; they catch specular light)
  if (detail.rays) {
    for (let r = 0; r < nR; r++) {
      const R = rays[r];
      const base = rPos.length / 3;
      const rs = segs;
      const th0 = (R.thick || thickness) * (def.spiny && r < def.spiny ? 1.25 : 1);
      for (let k = 0; k <= rs; k++) {
        const t = k / rs;
        const p = pt(R, t);
        const rad = th0 * (1 - 0.8 * t);
        const n = def.normal, side = def.side || [0, 0, 0];
        const along = R.dir;
        // two perpendicular axes: fin normal, and in-plane perpendicular
        const perp = [along[1] * n[2] - along[2] * n[1], along[2] * n[0] - along[0] * n[2], along[0] * n[1] - along[1] * n[0]];
        for (let q = 0; q < 3; q++) {
          const ang = (q / 3) * Math.PI * 2;
          const o = [n[0] * Math.cos(ang) + perp[0] * Math.sin(ang) * 0.6, n[1] * Math.cos(ang) + perp[1] * Math.sin(ang) * 0.6, n[2] * Math.cos(ang) + perp[2] * Math.sin(ang) * 0.6];
          rPos.push(...toM([p[0] + o[0] * rad, p[1] + o[1] * rad, p[2] + o[2] * rad]));
          rUv.push(r / (nR - 1), t);
          for (const [bi, bw] of pack(weightFn(p[0], t, r))) { rSI.push(bi); rSW.push(bw); }
        }
      }
      for (let k = 0; k < rs; k++) for (let q = 0; q < 3; q++) {
        const a = base + k * 3 + q, b = base + k * 3 + ((q + 1) % 3), c = a + 3, d = b + 3;
        rIdx.push(a, b, c, b, d, c);
      }
    }
  }
  const mk = (P, U, I, SI, SW) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    g.setIndex(I); g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  };
  return { membrane: mk(mPos, mUv, mIdx, mSI, mSW), rays: detail.rays ? mk(rPos, rUv, rIdx, rSI, rSW) : null };
}

const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

// Fin definitions (positions P-derived; ray counts F / R as annotated in anatomy.js).
export function finDefs(v) {
  const defs = {};
  const topAt = (s) => { const c = sectionAt(s); return c.yc + c.top * v.thickness; };
  const botAt = (s) => { const c = sectionAt(s); return c.yc - c.bot * v.thickness; };
  const fH = v.finScale;

  // First dorsal: VI spines, triangular-rounded; in males anterior spines elongate into filaments (F).
  {
    const [s0, s1] = FINS.dorsal1.sRange, n = 6;
    const rays = [];
    for (let i = 0; i < n; i++) {
      const s = mix(s0, s1, i / (n - 1));
      let h = FINS.dorsal1.height * fH * (i < 2 ? 1.0 : 1 - (i - 1) * 0.14);
      if (v.male && v.breeding) h += FINS.dorsal1.maleSpineExt * (i === 0 ? 0.7 : i === 1 ? 1 : 0.35);
      const lean = 0.55 + i * 0.1;          // spines rake backwards
      rays.push({ base: [s, topAt(s) - 0.004, 0], dir: norm([lean, 1, 0]), len: h, thick: 0.0022 });
    }
    defs.dorsal1 = {
      rays, normal: [0, 0, 1], pleat: 0.0025, incision: 0.18, spiny: 6,
      weightFn: (s, t) => pack([...scaleList(axialWeights(s), 1 - t * 0.9), [BI.DorsalFin1, t * 0.9]]),
      bone: 'DorsalFin1', kind: 'dorsal1',
    };
  }
  // Second dorsal: I,9 (F). Rectangular, height decreasing slightly posteriorly.
  {
    const [s0, s1] = FINS.dorsal2.sRange, n = 10;
    const rays = [];
    for (let i = 0; i < n; i++) {
      const s = mix(s0, s1, i / (n - 1));
      const h = FINS.dorsal2.height * fH * (i === 0 ? 0.75 : 1 - i * 0.02) * (i === n - 1 ? 1.08 : 1);
      rays.push({ base: [s, topAt(s) - 0.003, 0], dir: norm([0.55 + i * 0.04, 1, 0]), len: h });
    }
    defs.dorsal2 = {
      rays, normal: [0, 0, 1], pleat: 0.002, incision: 0.04,
      weightFn: (s, t) => pack([...scaleList(axialWeights(s), 1 - t * 0.4), [BI.DorsalFin2, t * 0.4]]),
      bone: 'DorsalFin2', kind: 'dorsal2',
    };
  }
  // Anal: I,9 (F), originates slightly behind D2 origin (P).
  {
    const [s0, s1] = FINS.anal.sRange, n = 10;
    const rays = [];
    for (let i = 0; i < n; i++) {
      const s = mix(s0, s1, i / (n - 1));
      const h = FINS.anal.height * fH * (i === 0 ? 0.7 : 1 - i * 0.015);
      rays.push({ base: [s, botAt(s) + 0.003, 0], dir: norm([0.6 + i * 0.04, -1, 0]), len: h });
    }
    defs.anal = {
      rays, normal: [0, 0, 1], pleat: 0.002, incision: 0.04,
      weightFn: (s, t) => pack([...scaleList(axialWeights(s), 1 - t * 0.4), [BI.AnalFin, t * 0.4]]),
      bone: 'AnalFin', kind: 'anal',
    };
  }
  // Caudal: rounded / slightly lanceolate (P). Rays fan from a vertical hypural plate.
  {
    const n = 15, s0 = 0.835;
    const c = sectionAt(s0);
    const rays = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1) * 2 - 1;                 // -1 ventral … 1 dorsal
      const ang = f * 0.62;
      const len = (0.165 + 0.012 * v.caudalShape) * (1 - 0.30 * f * f) * (Math.abs(f) > 0.9 ? 0.85 : 1);
      rays.push({ base: [s0, c.yc + f * c.top * 0.85, 0], dir: norm([Math.cos(ang), Math.sin(ang), 0]), len });
    }
    defs.caudal = {
      rays, normal: [0, 0, 1], pleat: 0.0022, incision: 0.03,
      weightFn: (s, t) => pack([...scaleList(axialWeights(s), 1 - t * 0.3), [BI.TailTip, t * 0.3]]),
      bone: 'Caudal', kind: 'caudal',
    };
  }
  // Pectorals: large rounded fans, base vertical just behind the opercle, low on the side (P).
  for (const side of [1, -1]) {
    const n = 17, s0 = FINS.pectoral.baseS;
    const c = sectionAt(s0);
    const rays = [];
    const zB = side * c.w * v.thickness * v.width * 0.82;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);                           // 0 dorsal ray … 1 ventral ray
      const y = c.yc + c.top * 0.35 - f * (c.top * 0.35 + c.bot * 0.55);
      const ang = 0.45 - f * 1.05;                     // fan: upper rays go back/up, lower go back/down
      const len = FINS.pectoral.length * fH * (0.7 + 0.35 * Math.sin(Math.PI * (0.25 + f * 0.6)));
      rays.push({ base: [s0 - 0.004, y, zB], dir: norm([Math.cos(ang), Math.sin(ang) * 0.9, side * 0.55]), len, bend: 0.012, bendDir: [0, -0.3, side] });
    }
    defs[side > 0 ? 'pectoralR' : 'pectoralL'] = {
      rays, normal: norm([-0.55, -0.2, side]), pleat: 0.003, incision: 0.03,
      weightFn: () => pack([[side > 0 ? BI.Pectoral_R : BI.Pectoral_L, 1]]),
      bone: side > 0 ? 'Pectoral_R' : 'Pectoral_L', kind: 'pectoral',
    };
  }
  // Pelvic disc: I,5 per side, fused into a cup with frenum (Gobiidae; R). Lies on substrate.
  {
    const n = 11, s0 = FINS.pelvic.baseS;
    const c = sectionAt(s0);
    const yB = c.yc - c.bot * v.thickness * 0.92;
    const rays = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1) * 2 - 1;                 // -1 left … +1 right, 0 = fused midline
      const spread = f * 0.75;
      const len = FINS.pelvic.length * (1 - 0.18 * f * f);
      rays.push({ base: [s0 - 0.01, yB, f * 0.012], dir: norm([Math.cos(spread), -0.08 - 0.12 * Math.abs(f), Math.sin(spread)]), len });
    }
    defs.pelvic = {
      rays, normal: [0, 1, 0], pleat: 0.0015, incision: 0.05,
      weightFn: () => pack([[BI.Pelvic, 1]]), bone: 'Pelvic', kind: 'pelvic',
    };
  }
  return defs;
}

export function bonePositions(v) {
  // returns bone name → [s, y, z] rest position (s-space) and parent
  const e = [eyeCentre(v, -1), eyeCentre(v, 1)];
  const c = (s) => sectionAt(s);
  return {
    Root: [ROOT_S, 0, 0, null],
    Body: [ROOT_S, c(ROOT_S).yc, 0, 'Root'],
    Head: [AXIAL[0][1], c(AXIAL[0][1]).yc, 0, 'Body'],
    Spine01: [AXIAL[1][1], c(AXIAL[1][1]).yc, 0, 'Body'],
    Spine02: [AXIAL[2][1], c(AXIAL[2][1]).yc, 0, 'Spine01'],
    Spine03: [AXIAL[3][1], c(AXIAL[3][1]).yc, 0, 'Spine02'],
    Spine04: [AXIAL[4][1], c(AXIAL[4][1]).yc, 0, 'Spine03'],
    Spine05: [AXIAL[5][1], c(AXIAL[5][1]).yc, 0, 'Spine04'],
    TailBase: [AXIAL[6][1], c(AXIAL[6][1]).yc, 0, 'Spine05'],
    TailMid: [AXIAL[7][1], c(AXIAL[7][1]).yc, 0, 'TailBase'],
    TailTip: [AXIAL[8][1], c(AXIAL[8][1]).yc, 0, 'TailMid'],
    Jaw: [0.105, c(0.105).yc - 0.01, 0, 'Head'],            // quadrate-articular hinge under the eye (P)
    Opercle_L: [0.17, c(0.17).yc, -c(0.17).w * 0.9, 'Head'],
    Opercle_R: [0.17, c(0.17).yc, c(0.17).w * 0.9, 'Head'],
    Eye_L: [e[0].x, e[0].y, e[0].z, 'Head'],
    Eye_R: [e[1].x, e[1].y, e[1].z, 'Head'],
    DorsalFin1: [0.37, c(0.37).yc + c(0.37).top, 0, 'Spine01'],
    DorsalFin2: [0.575, c(0.575).yc + c(0.575).top, 0, 'Spine03'],
    AnalFin: [0.60, c(0.6).yc - c(0.6).bot, 0, 'Spine03'],
    Pectoral_L: [FINS.pectoral.baseS, c(0.245).yc - c(0.245).bot * 0.1, -c(0.245).w * 0.82, 'Body'],
    Pectoral_R: [FINS.pectoral.baseS, c(0.245).yc - c(0.245).bot * 0.1, c(0.245).w * 0.82, 'Body'],
    Pelvic: [FINS.pelvic.baseS + 0.01, c(0.275).yc - c(0.275).bot * 0.92, 0, 'Body'],
    Caudal: [0.835, c(0.835).yc, 0, 'TailBase'],
  };
}
