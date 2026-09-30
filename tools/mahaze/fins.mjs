// Fins: pleated membrane meshes with individual rays + a shared texture atlas.
import { section, topY, botY, surfaceAt, toObject, dirToObject } from './anatomy.mjs';
import { perlin3, fbm3, hash01, clamp, mix, smoothstep } from '../lib/noise.mjs';

const DEG = Math.PI / 180;
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const ATLAS = 2048;
const INSET = 6;

function inPlaneBend(dir, normal) {
  // component of the posterior axis (+s) perpendicular to the ray, inside the fin plane
  let b = sub([1, 0, 0], mul(dir, dot([1, 0, 0], dir)));
  b = sub(b, mul(normal, dot(b, normal)));
  const l = Math.hypot(...b);
  return l < 1e-5 ? [0, 0, 0] : mul(b, 1 / l);
}

// ---------------------------------------------------------------------------
// Fin definitions (fish-space mm)

function medianFin({ name, s0, s1, count, a0, a1, lengths, dorsal, spines, curv, notch, pleat, sag, rect, branchT, segStart, pigment }) {
  const rays = [];
  const normal = [0, 0, 1];
  for (let k = 0; k < count; k++) {
    const f = k / (count - 1);
    const s = s0 + (s1 - s0) * f;
    const y = dorsal ? topY(s) - 0.14 : botY(s) + 0.14;
    const a = (a0 + (a1 - a0) * f) * DEG;
    const dir = nrm([Math.cos(a), Math.sin(a), 0]);
    rays.push({ base: [s, y, 0], dir, len: lengths[k], kind: k < spines ? 'spine' : 'soft', curv, bend: inPlaneBend(dir, normal), ang: a });
  }
  return { name, type: 'median', dorsal, rays, normal, notch, pleat, sag, rect, branchT, segStart, pigment, cup: 0, wave: 0.0 };
}

function caudalFin(rect) {
  const rays = [];
  const normal = [0, 0, 1];
  const q = section(40.9);
  // dorsal procurrent rays (short, unbranched), principal rays, ventral procurrent rays
  const proc = [[38.9, 1.0, 13], [39.5, 1.9, 16], [40.1, 3.0, 18.5]];
  for (const [s, len, ang] of proc) {
    const dir = nrm([Math.cos(ang * DEG), Math.sin(ang * DEG), 0]);
    rays.push({ base: [s, topY(s) - 0.12, 0], dir, len, kind: 'spine', curv: 0, bend: [0, 0, 0], ang: ang * DEG });
  }
  const NP = 17;
  for (let k = 0; k < NP; k++) {
    const f = k / (NP - 1);
    const u = 2 * f - 1; // -1 dorsal … +1 ventral
    const s = 40.85 - 0.3 * Math.abs(u);
    const y = q.yc - u * 1.15;
    const ang = -u * 20 * DEG;
    const len = 6.9 + 2.2 * Math.pow(Math.max(0, 1 - u * u), 0.8);
    const dir = nrm([Math.cos(ang), Math.sin(ang), 0]);
    rays.push({ base: [s, y, 0], dir, len, kind: 'soft', curv: 0, bend: [0, 0, 0], ang });
  }
  for (const [s, len, ang] of proc.slice().reverse()) {
    const dir = nrm([Math.cos(-ang * DEG), Math.sin(-ang * DEG), 0]);
    rays.push({ base: [s, botY(s) + 0.12, 0], dir, len, kind: 'spine', curv: 0, bend: [0, 0, 0], ang: -ang * DEG });
  }
  return {
    name: 'Fin_Caudal', type: 'caudal', rays, normal, notch: 0.035, pleat: 0.035, sag: 0.025, rect, branchT: 0.5, segStart: 0.12, cup: 0, wave: 0.16,
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      let mel = 0;
      const upper = 1 - fAcross;
      for (let j = 0; j < 12; j++) {
        const Lj = 0.8 + j * 0.8 + r * 0.02 + (hash01(r, j, 2, 502) - 0.5) * 0.28;
        if (Lj > len * 0.9) break;
        if (hash01(r, j, 1, 501) < 0.3) continue;
        const ls = 0.1 + 0.09 * hash01(r, j, 3, 503);
        const amp = 0.45 + 0.55 * hash01(r, j, 4, 504);
        mel = Math.max(mel, amp * Math.exp(-(((Lr - Lj) / ls) ** 2)) * Math.exp(-((dRay / 0.075) ** 2)));
      }
      mel *= 0.8 * (0.5 + 0.5 * upper) * smoothstep(0.97, 0.75, t);
      // dark spot at the caudal base
      mel = Math.max(mel, 0.55 * smoothstep(0.16, 0.04, t) * smoothstep(0.62, 0.3, Math.abs(fAcross - 0.45) * 2));
      return { mel: mel * 0.85, xan: 0.18 * smoothstep(0.6, 0.1, t), irid: 0.08 };
    },
  };
}

function pectoralFin(side, rect) {
  const rays = [];
  const NR = 20;
  // fin held away from the flank; its lower half flares outward (plane tilted ~30° from vertical)
  const Xf = nrm([1, 0, 0.42 * side]);
  const up0 = nrm([0, 1, -0.58 * side]);
  const Yf = nrm(sub(up0, mul(Xf, dot(up0, Xf))));
  let normal = nrm(cross(Xf, Yf));
  if (normal[2] * side < 0) normal = mul(normal, -1);
  for (let k = 0; k < NR; k++) {
    const f = k / (NR - 1);
    const s = 12.3 + 0.45 * f + 0.15 * f * f;
    const y = 4.0 - 2.9 * f;
    const sp = surfaceAt(s, y).p;
    const base = [s, y, side * (sp[2] - 0.12)];
    // upper rays sweep back at ~25°, lower rays point down-back (fan top stays at eye level)
    const psi = (25 - f * 82) * DEG;
    const dir = nrm(add(mul(Xf, Math.cos(psi)), mul(Yf, Math.sin(psi))));
    const len = 4.6 + 2.8 * Math.pow(Math.max(0, 1 - ((f - 0.4) / 0.62) ** 2), 0.75);
    rays.push({ base, dir, len, kind: 'soft', curv: 0.05, bend: inPlaneBend(dir, normal), psi });
  }
  return {
    name: side > 0 ? 'Fin_Pectoral_L' : 'Fin_Pectoral_R', type: 'pectoral', Xf, Yf, rays, normal, notch: 0.03, pleat: 0.06, sag: 0.03, rect, branchT: 0.45, segStart: 0.15, cup: 0.22, wave: 0.05,
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      let mel = 0;
      for (let j = 0; j < 3; j++) {
        const Lj = 0.7 + j * 0.75 + r * 0.03;
        mel = Math.max(mel, Math.exp(-(((Lr - Lj) / 0.12) ** 2)) * Math.exp(-((dRay / 0.06) ** 2)));
      }
      mel *= 0.4 * smoothstep(0.7, 0.2, fAcross);
      return { mel, xan: 0.16 * smoothstep(0.5, 0.0, t), irid: 0.14 * smoothstep(0.25, 0.0, t) };
    },
  };
}

// Pelvic sucker: the two pelvic fins (I,5 each) are fused into an oval, cup-shaped disc under the chest.
// The spines point forward-laterally and a membrane (frenum) closes the front, so the rim runs all the way
// round; the rim curls down to meet the substrate (the fish rests on it) and the centre stays vaulted.
export const PELVIC = { base: 12.0, front: 1.1, back: 5.6, halfWidth: 1.75, drop: 1.4 };
function pelvicDisc(rect) {
  const P = PELVIC;
  const c = P.back - (P.front + P.back) / 2; // oval centre, measured from the base along +s
  const a = (P.front + P.back) / 2, b = P.halfWidth;
  // distance from the base to the oval rim in the horizontal direction phi (0 = backwards, +90° = left)
  const rimR = (phi) => {
    const cp = Math.cos(phi), sp = Math.sin(phi);
    const A = (cp * cp) / (a * a) + (sp * sp) / (b * b), B = (-2 * c * cp) / (a * a), C = (c * c) / (a * a) - 1;
    return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  };
  // left frenum edge, left spine, 5 + 5 soft rays, right spine, right frenum edge
  const layout = [[178.5, 'frenum'], [124, 'spine'], [88, 'soft'], [66, 'soft'], [46, 'soft'], [28, 'soft'], [10, 'soft'],
    [-10, 'soft'], [-28, 'soft'], [-46, 'soft'], [-66, 'soft'], [-88, 'soft'], [-124, 'spine'], [-178.5, 'frenum']];
  const y0 = botY(P.base) + 0.06;
  const rays = layout.map(([deg, kind]) => {
    const phi = deg * DEG;
    const len0 = rimR(phi);
    // the rim sits at a constant depth below the base: part slope, part down-curl near the rim
    const lin = 0.35 * P.drop, curl = 0.65 * P.drop;
    const h = [Math.cos(phi), 0, Math.sin(phi)];
    const dir = nrm([h[0] * len0, -lin, h[2] * len0]);
    const len = Math.hypot(len0, lin);
    const base = [P.base + 0.12 * Math.cos(phi), y0, 0.12 * Math.sin(phi)];
    return { base, dir, len, kind, curv: 0, bend: [0, 0, 0], phi, cup: curl / (0.12 * len) };
  });
  const normal = [0, -1, 0];
  return {
    name: 'Fin_Pelvic', type: 'pelvic', rays, normal, notch: 0.02, pleat: 0.015, sag: 0.02, rect, branchT: 0.55, segStart: 0.25, cup: 0, wave: 0,
    pigment: (r, n, Lr, len, t) => ({ mel: 0, xan: 0.1, irid: 0.42 * smoothstep(1.0, 0.2, t) }),
  };
}

export function finDefinitions() {
  const R = (x, y, w, h) => ({ x, y, w, h });
  const D1 = medianFin({
    name: 'Fin_Dorsal1', s0: 12.9, s1: 16.8, count: 8, a0: 70, a1: 40, dorsal: true, spines: 8, curv: 0.09, notch: 0.3, pleat: 0.04, sag: 0.02,
    lengths: [3.9, 4.7, 5.0, 4.8, 4.3, 3.6, 2.9, 2.1], rect: R(1024, 1024, 512, 512), branchT: 2, segStart: 2,
    pigment: (r, n, Lr, len, t, dRay) => {
      let mel = 0;
      for (let j = 0; j < 9; j++) {
        const Lj = 0.55 + j * 0.62 + r * 0.08 + (hash01(r, j, 2, 512) - 0.5) * 0.2;
        if (Lj > len * 0.86) break;
        if (hash01(r, j, 1, 511) < 0.18) continue;
        const ls = 0.1 + 0.08 * hash01(r, j, 3, 513);
        mel = Math.max(mel, (0.5 + 0.5 * hash01(r, j, 4, 514)) * Math.exp(-(((Lr - Lj) / ls) ** 2)) * Math.exp(-((dRay / 0.1) ** 2)));
      }
      return { mel: 0.8 * mel + 0.04, xan: 0.25 * smoothstep(0.5, 0.0, t), irid: 0.05 };
    },
  });
  const D2 = medianFin({
    name: 'Fin_Dorsal2', s0: 19.7, s1: 35.6, count: 14, a0: 60, a1: 27, dorsal: true, spines: 1, curv: 0.03, notch: 0.07, pleat: 0.05, sag: 0.025,
    lengths: [2.9, 3.6, 4.0, 4.2, 4.3, 4.35, 4.4, 4.4, 4.45, 4.5, 4.55, 4.5, 4.35, 3.9], rect: R(0, 1024, 1024, 512), branchT: 0.55, segStart: 0.18,
    pigment: (r, n, Lr, len, t, dRay) => {
      let mel = 0;
      for (let j = 0; j < 9; j++) {
        const Lj = 0.42 + j * 0.55 + r * 0.05 + (hash01(r, j, 2, 522) - 0.5) * 0.2;
        if (Lj > len * 0.88) break;
        if (hash01(r, j, 1, 521) < 0.22) continue;
        const ls = 0.09 + 0.08 * hash01(r, j, 3, 523);
        mel = Math.max(mel, (0.45 + 0.55 * hash01(r, j, 4, 524)) * Math.exp(-(((Lr - Lj) / ls) ** 2)) * Math.exp(-((dRay / 0.075) ** 2)));
      }
      return { mel: 0.72 * mel + 0.03, xan: 0.22 * smoothstep(0.6, 0.0, t), irid: 0.05 };
    },
  });
  const AN = medianFin({
    name: 'Fin_Anal', s0: 21.4, s1: 35.0, count: 12, a0: -58, a1: -27, dorsal: false, spines: 1, curv: 0.03, notch: 0.07, pleat: 0.05, sag: 0.025,
    lengths: [2.1, 2.9, 3.3, 3.5, 3.6, 3.65, 3.7, 3.7, 3.75, 3.8, 3.75, 3.5], rect: R(0, 1536, 1024, 512), branchT: 0.55, segStart: 0.18,
    pigment: (r, n, Lr, len, t) => ({ mel: 0.12 * smoothstep(0.72, 0.95, t), xan: 0.14, irid: 0.32 * smoothstep(0.35, 0.0, t) }),
  });
  return [
    caudalFin(R(0, 0, 1024, 1024)),
    D1, D2, AN,
    pectoralFin(1, R(1024, 0, 1024, 1024)),
    pectoralFin(-1, R(1024, 0, 1024, 1024)),
    pelvicDisc(R(1536, 1024, 512, 512)),
  ];
}

// ---------------------------------------------------------------------------
// Geometry

function rayPoint(def, r, t) {
  let p = add(r.base, mul(r.dir, r.len * t));
  p = add(p, mul(r.bend, r.len * r.curv * t * t));
  p = add(p, mul(def.normal, (r.cup ?? def.cup) * t * t * r.len * 0.12));
  return p;
}

function catmull(p0, p1, p2, p3, f) {
  const f2 = f * f, f3 = f2 * f;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    out[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * f + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * f2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * f3);
  }
  return out;
}

export function finSurface(def, a, t) {
  const R = def.rays;
  const n = R.length;
  const k = clamp(Math.floor(a), 0, n - 2);
  const f = a - k;
  const p = catmull(
    rayPoint(def, R[Math.max(k - 1, 0)], t), rayPoint(def, R[k], t),
    rayPoint(def, R[k + 1], t), rayPoint(def, R[Math.min(k + 2, n - 1)], t), f,
  );
  const zig = (i) => (i === 0 || i === n - 1 ? 0 : def.pleat * (i % 2 ? 1 : -1)) * Math.pow(t, 0.8);
  let off = zig(k) * (1 - f) + zig(k + 1) * f + def.sag * Math.sin(Math.PI * f) * Math.pow(t, 1.2);
  off += def.wave * t * t * Math.sin(a * 0.45 + 0.7);
  return add(p, mul(def.normal, off));
}

// ---------------------------------------------------------------------------
// Morph targets (fish-space shapes evaluated on the same (a, t) grid as the mesh)

/** Rays rotated in a fin plane (spanned by u, v) from angle a0 to a1 about each ray base. */
function withRayAngles(def, angleOf, planeU, planeV, pleatK = 2.6) {
  const rays = def.rays.map((r, k) => {
    const ang = angleOf(r, k);
    const dir = nrm(add(mul(planeU, Math.cos(ang)), mul(planeV, Math.sin(ang))));
    return { ...r, dir, curv: r.curv * 0.3, bend: inPlaneBend(dir, def.normal) };
  });
  // the membrane gathers into deeper pleats as the rays close up
  return { ...def, rays, pleat: def.pleat * pleatK, sag: def.sag * 0.5, wave: def.wave * 0.3 };
}

function foldedDef(def) {
  if (def.type === 'median') {
    // rays lie back along the body (dorsal fins drop into their groove, the anal fin folds back)
    const sgn = def.dorsal ? 1 : -1;
    return withRayAngles(def, (r) => sgn * (0.07 + 0.06 * Math.abs(r.ang)), [1, 0, 0], [0, 1, 0]);
  }
  if (def.type === 'caudal') return withRayAngles(def, (r) => r.ang * 0.3, [1, 0, 0], [0, 1, 0]);
  if (def.type === 'pectoral') {
    const mid = -6 * DEG;
    return withRayAngles(def, (r) => mid + (r.psi - mid) * 0.28, def.Xf, def.Yf);
  }
  if (def.type === 'pelvic') {
    const rays = def.rays.map((r) => {
      const phi = r.phi * 0.55;
      const dir = nrm([Math.cos(phi), r.dir[1] * 0.3, Math.sin(phi)]);
      return { ...r, dir, cup: (r.cup ?? 0) * 0.25 };
    });
    return { ...def, rays, pleat: def.pleat * 2.5 };
  }
  return def;
}

function gridPositions(def, SUB, NT, disp) {
  const n = def.rays.length;
  const cols = (n - 1) * SUB + 1;
  const out = [];
  for (let j = 0; j <= NT; j++) {
    const t = j / NT;
    for (let i = 0; i < cols; i++) {
      const a = i / SUB;
      let p = finSurface(def, a, t);
      if (disp) p = add(p, disp(a, t, n));
      out.push(p);
    }
  }
  return out;
}

const rayLenAt = (def, a) => {
  const k = clamp(Math.floor(a), 0, def.rays.length - 2), f = a - k;
  return def.rays[k].len * (1 - f) + def.rays[k + 1].len * f;
};

/** Object-space morph deltas in the order of FIN_TARGETS[def.name]. */
export function buildFinTargets(def, SUB, NT, targetNames) {
  const rest = gridPositions(def, SUB, NT);
  const delta = (pts) => {
    const d = new Float32Array(rest.length * 3);
    // fish-space mm offset → object-space metres (X = z, Y = y, Z = −s)
    pts.forEach((p, i) => { const q = sub(p, rest[i]); d.set([q[2] / 1000, q[1] / 1000, -q[0] / 1000], i * 3); });
    return d;
  };
  const N = def.normal;
  const make = {
    fold: () => gridPositions(foldedDef(def), SUB, NT),
    // passive trailing flex: tips lag sideways (weight ±1 = tip deflected by ~30 % of its length)
    flex: () => gridPositions(def, SUB, NT, (a, t) => mul(N, (def.type === 'caudal' ? 0.32 : 0.22) * rayLenAt(def, a) * t * t)),
    // pectoral sculling: a travelling wave across the fin (sin / cos basis)
    waveS: () => gridPositions(def, SUB, NT, (a, t, n) => mul(N, 0.16 * rayLenAt(def, a) * Math.pow(t, 1.5) * Math.sin((2 * Math.PI * a) / ((n - 1) * 0.85)))),
    waveC: () => gridPositions(def, SUB, NT, (a, t, n) => mul(N, 0.16 * rayLenAt(def, a) * Math.pow(t, 1.5) * Math.cos((2 * Math.PI * a) / ((n - 1) * 0.85)))),
  };
  return targetNames.map((name) => delta(make[name]()));
}

export function buildFinMesh(def, SUB = 6, NT = 36) {
  const n = def.rays.length;
  const cols = (n - 1) * SUB + 1;
  const rows = NT + 1;
  const count = cols * rows;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const tangent = new Float32Array(count * 4);
  const uv = new Float32Array(count * 2);
  const fish = new Float32Array(count * 3);
  const rayT = new Float32Array(count);
  const baseS = new Float32Array(count);
  const { x, y, w, h } = def.rect;
  const e = 1e-3;
  for (let j = 0; j < rows; j++) {
    const t = j / NT;
    for (let i = 0; i < cols; i++) {
      const a = i / SUB;
      const idx = j * cols + i;
      const p = finSurface(def, a, t);
      const pa = sub(finSurface(def, Math.min(a + e, n - 1), t), finSurface(def, Math.max(a - e, 0), t));
      const pt = sub(finSurface(def, a, Math.min(t + e, 1)), finSurface(def, a, Math.max(t - e, 0)));
      let nn = nrm(cross(pa, pt));
      if (dot(nn, def.normal) < 0) nn = mul(nn, -1);
      const nO = dirToObject(nn);
      let tO = dirToObject(nrm(pa));
      tO = nrm(sub(tO, mul(nO, dot(nO, tO))));
      const bDesired = dirToObject(mul(pt, -1));
      const wsign = dot(cross(nO, tO), bDesired) >= 0 ? 1 : -1;
      position.set(toObject(p), idx * 3);
      fish.set(p, idx * 3);
      rayT[idx] = t;
      baseS[idx] = finSurface(def, a, 0)[0];
      normal.set(nO, idx * 3);
      tangent.set([tO[0], tO[1], tO[2], wsign], idx * 4);
      uv[idx * 2] = (x + INSET + (a / (n - 1)) * (w - 2 * INSET)) / ATLAS;
      uv[idx * 2 + 1] = (y + INSET + t * (h - 2 * INSET)) / ATLAS;
    }
  }
  const tris = [];
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = j * cols + i + 1, c = (j + 1) * cols + i + 1, d = (j + 1) * cols + i;
      tris.push(a, b, c, a, c, d);
    }
  // orient winding to agree with normals
  {
    const j = Math.floor(rows / 2), i = Math.floor(cols / 2);
    const a = j * cols + i, b = j * cols + i + 1, c = (j + 1) * cols + i + 1;
    const P = (k) => [position[k * 3], position[k * 3 + 1], position[k * 3 + 2]];
    const fn = cross(sub(P(b), P(a)), sub(P(c), P(a)));
    if (dot(fn, [normal[a * 3], normal[a * 3 + 1], normal[a * 3 + 2]]) < 0) {
      for (let k = 0; k < tris.length; k += 3) { const tmp = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = tmp; }
    }
  }
  return { position, normal, tangent, uv, indices: new Uint32Array(tris), fish, rayT, baseS };
}

// ---------------------------------------------------------------------------
// Atlas painting

export function paintFinAtlas(defs, log = () => {}) {
  const S = ATLAS;
  const color = new Uint8Array(S * S * 4);
  const data = new Uint8Array(S * S * 4);
  const normal = new Uint8Array(S * S * 3);
  const H = new Float32Array(S * S);
  const DU = new Float32Array(S * S).fill(0.01);
  const DV = new Float32Array(S * S).fill(0.01);
  for (let i = 0; i < S * S; i++) { normal[i * 3] = 128; normal[i * 3 + 1] = 128; normal[i * 3 + 2] = 255; }
  const srgb = (c) => { c = clamp(c); return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); };
  const painted = new Set();

  for (const def of defs) {
    const key = `${def.rect.x},${def.rect.y}`;
    if (painted.has(key)) continue;
    painted.add(key);
    log(`    atlas: ${def.name}`);
    const R = def.rays;
    const n = R.length;
    const { x, y, w, h } = def.rect;
    const iw = w - 2 * INSET, ih = h - 2 * INSET;
    // precompute spacing per ray interval at sampled t
    const NTS = 64;
    const spacing = [];
    for (let k = 0; k < n - 1; k++) {
      const row = new Float32Array(NTS + 1);
      for (let j = 0; j <= NTS; j++) {
        const t = j / NTS;
        row[j] = Math.max(Math.hypot(...sub(rayPoint(def, R[k + 1], t), rayPoint(def, R[k], t))), 0.02);
      }
      spacing.push(row);
    }
    const spAt = (a, t) => {
      const k = clamp(Math.floor(a), 0, n - 2);
      const jt = clamp(t, 0, 1) * NTS;
      const j0 = Math.floor(jt), j1 = Math.min(j0 + 1, NTS), f = jt - j0;
      return spacing[k][j0] * (1 - f) + spacing[k][j1] * f;
    };
    for (let py = y; py < y + h; py++)
      for (let px = x; px < x + w; px++) {
        const a = clamp(((px + 0.5 - x - INSET) / iw) * (n - 1), 0, n - 1);
        const tRaw = (py + 0.5 - y - INSET) / ih;
        const t = clamp(tRaw, 0, 1);
        const sp = spAt(a, t);
        const kNear = Math.round(a);
        const fAcross = a / (n - 1);
        // rays (with branching)
        let rayD = 0, dRay = 1e9, jointAll = 0;
        let rNear = kNear;
        for (let r = Math.max(0, kNear - 1); r <= Math.min(n - 1, kNear + 1); r++) {
          const ray = R[r];
          if (ray.kind === 'frenum') continue;
          const soft = ray.kind === 'soft';
          const width0 = soft ? 0.062 : 0.09;
          const width = width0 * (1 - (soft ? 0.55 : 0.7) * t);
          const centers = [];
          if (soft && t > def.branchT && r > 0 && r < n - 1) {
            const d1 = 0.17 * smoothstep(def.branchT, def.branchT + 0.3, t);
            if (def.name === 'Fin_Caudal' && t > 0.8) {
              const d2 = 0.06 * smoothstep(0.8, 0.95, t);
              centers.push([r - d1 - d2, 0.55], [r - d1 + d2, 0.55], [r + d1 - d2, 0.55], [r + d1 + d2, 0.55]);
            } else centers.push([r - d1, 0.72], [r + d1, 0.72]);
          } else centers.push([r, 1]);
          for (const [ac, wf] of centers) {
            const dmm = Math.abs(a - ac) * sp;
            const ww = width * wf;
            let dens = Math.exp(-((dmm / (0.5 * ww)) ** 2));
            if (soft && t > def.segStart) {
              const Lr = t * ray.len;
              const ph = Lr / 0.27 + r * 0.37;
              const fr = ph - Math.floor(ph);
              const joint = Math.exp(-(((fr - 0.5) / 0.07) ** 2));
              dens *= 1 - 0.32 * joint;
              jointAll = Math.max(jointAll, joint * dens);
            }
            if (dens > rayD) rayD = dens;
            if (dmm < dRay) { dRay = dmm; rNear = r; }
          }
        }
        // membrane coverage with notched / frayed edge
        const fr = a - Math.floor(a);
        const L = R[clamp(Math.round(a), 0, n - 1)].len;
        let edge = 1 - def.notch * Math.pow(Math.sin(Math.PI * fr), 0.85);
        edge -= (0.035 / Math.max(L, 1)) * (0.5 + 0.5 * perlin3(a * 5.3, 0.5, 1.7, 77)) + (0.02 / Math.max(L, 1)) * Math.abs(perlin3(a * 23, 3.1, 0.2, 78));
        const covM = smoothstep(edge + 0.004, edge - 0.004, tRaw);
        const covR = smoothstep(0.12, 0.35, rayD) * smoothstep(1.004, 0.996, tRaw);
        let cov = Math.max(covM, covR);
        if (tRaw < 0) cov = 1;
        // pigment
        const ray = R[rNear];
        const pg = def.pigment(rNear, n, t * ray.len, ray.len, t, dRay, fAcross);
        const mel = clamp(pg.mel), xan = clamp(pg.xan), irid = clamp(pg.irid);
        // colours (linear)
        let cr = mix(0.8, 0.78, rayD), cg = mix(0.78, 0.7, rayD), cb = mix(0.72, 0.52, rayD);
        cr *= mix(1, 1.0, xan); cg *= mix(1, 0.86, xan); cb *= mix(1, 0.5, xan);
        cr = mix(cr, 0.9, irid * 0.5); cg = mix(cg, 0.9, irid * 0.5); cb = mix(cb, 0.88, irid * 0.5);
        cr *= Math.exp(-mel * 2.4); cg *= Math.exp(-mel * 2.8); cb *= Math.exp(-mel * 3.1);
        const o = (py * S + px) * 4;
        const opacity = clamp(0.2 + 0.5 * rayD + 0.75 * mel + 0.3 * irid);
        color[o] = srgb(cr); color[o + 1] = srgb(cg); color[o + 2] = srgb(cb); color[o + 3] = Math.round(cov * opacity * 255);
        data[o] = Math.round(rayD * 255); data[o + 1] = Math.round(mel * 255); data[o + 2] = Math.round(irid * 255); data[o + 3] = Math.round(cov * 255);
        // height (mm)
        const pi = py * S + px;
        H[pi] = 0.02 * rayD - 0.007 * jointAll + 0.0015 * perlin3(a * 40, t * 6, 0.3, 79) * (1 - rayD);
        DU[pi] = (sp * (n - 1)) / iw;
        DV[pi] = Math.max(ray.len, 0.5) / ih;
      }
  }
  // normals from height
  for (let py = 0; py < S; py++)
    for (let px = 0; px < S; px++) {
      const i = py * S + px;
      const xm = Math.max(px - 1, 0), xp = Math.min(px + 1, S - 1), ym = Math.max(py - 1, 0), yp = Math.min(py + 1, S - 1);
      const gx = (H[py * S + xp] - H[py * S + xm]) / ((xp - xm) * DU[i]);
      const gy = (H[ym * S + px] - H[yp * S + px]) / ((yp - ym) * DV[i]);
      let nx = -gx, ny = -gy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      normal[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255);
      normal[i * 3 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      normal[i * 3 + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
    }
  return { size: S, color, data, normal };
}
