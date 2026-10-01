// Fins: pleated membrane meshes with individual rays + a shared texture atlas.
import { section, topY, botY, surfaceAt, toObject, dirToObject, MALE } from './anatomy.mjs';
import { perlin3, fbm3, hash01, clamp, mix, smoothstep } from '../lib/noise.mjs';

const DEG = Math.PI / 180;
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const ATLAS = 2048;

// Rows of oval dots on the rays (centred on the ray, elongated along it), staggered on alternate rays.
// Measured on live 014/001 and specimens [P colour report §3.8]; brick-red in life (xantho/erythrophores
// over some melanin), pale orange-tan in pale specimens.
function rayDots(r, Lr, len, dRay, { first, pitch, l, w, maxFrac = 0.92, drop = 0.1, seed = 0, stagger = 0.5 }) {
  let v = 0;
  for (let j = 0; j < 14; j++) {
    const Lj = first + (j + (r % 2) * stagger) * pitch + (hash01(r, j, 2, 600 + seed) - 0.5) * pitch * 0.2;
    if (Lj > len * maxFrac) break;
    if (hash01(r, j, 1, 610 + seed) < drop) continue;
    const amp = 0.7 + 0.3 * hash01(r, j, 4, 620 + seed);
    v = Math.max(v, amp * Math.exp(-(((Lr - Lj) / l) ** 2) - ((dRay / w) ** 2)));
  }
  return v;
}
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

function medianFin({ name, s0, s1, count, a0, a1, lengths, dorsal, spines, curv, notch, pleat, sag, rect, branchT, segStart, pigment, membrane = null }) {
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
  return { name, type: 'median', dorsal, rays, normal, notch, pleat, sag, rect, branchT, segStart, pigment, cup: 0, wave: 0.0, membrane };
}

function caudalFin(rect) {
  const rays = [];
  const normal = [0, 0, 1];
  const q = section(42.7);
  // dorsal procurrent rays (short, unbranched), principal rays, ventral procurrent rays
  const proc = [[40.9, 1.1, 13], [41.55, 2.1, 16], [42.2, 3.3, 18.5]];
  for (const [s, len, ang] of proc) {
    const dir = nrm([Math.cos(ang * DEG), Math.sin(ang * DEG), 0]);
    rays.push({ base: [s, topY(s) - 0.12, 0], dir, len, kind: 'spine', curv: 0, bend: [0, 0, 0], ang: ang * DEG });
  }
  const NP = 17;
  for (let k = 0; k < NP; k++) {
    const f = k / (NP - 1);
    const u = 2 * f - 1; // -1 dorsal … +1 ventral
    const s = 42.75 - 0.3 * Math.abs(u);
    const y = q.yc - u * 1.3;
    const ang = -u * 18 * DEG;
    // rounded caudal fin: longest rays 22–25 %SL (TL/SL 1.23), spread height ≈ 20 %SL [P 025/031/004]
    const len = 7.6 + 2.6 * Math.pow(Math.max(0, 1 - u * u), 0.75);
    const dir = nrm([Math.cos(ang), Math.sin(ang), 0]);
    // 17 principal rays: the outermost of each lobe are unbranched (15 branched)
    rays.push({ base: [s, y, 0], dir, len, kind: 'soft', simple: k === 0 || k === NP - 1, curv: 0, bend: [0, 0, 0], ang });
  }
  for (const [s, len, ang] of proc.slice().reverse()) {
    const dir = nrm([Math.cos(-ang * DEG), Math.sin(-ang * DEG), 0]);
    rays.push({ base: [s, botY(s) + 0.12, 0], dir, len, kind: 'spine', curv: 0, bend: [0, 0, 0], ang: -ang * DEG });
  }
  return {
    name: 'Fin_Caudal', type: 'caudal', rays, normal, notch: 0.035, pleat: 0.035, sag: 0.025, rect, branchT: 0.5, segStart: 0.12, cup: 0, wave: 0.16,
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      // 6–8 columns of brick-red oval dots across the rays, 2.5–3.5 %SL apart, shrinking toward the margin
      // (dot ≈ 1.8 × 1.0 %SL) [P colour report §3.8; F "several rows of dark marks"]
      const d = rayDots(r, Lr, len, dRay, { first: 0.75, pitch: 1.3, l: 0.3 * (1 - 0.3 * t), w: 0.23, drop: 0.08, seed: 1, stagger: 0.15 });
      // the black caudal-base spot extends slightly onto the fin base
      const base = 0.75 * smoothstep(0.1, 0.02, t) * smoothstep(0.5, 0.2, Math.abs(fAcross - 0.52) * 2);
      // breeding male: a black spot at the upper caudal margin (014 at 106.5 %SL, 001 at ~110 %SL) [P]
      const mspot = MALE ? Math.exp(-(((t - 0.5) / 0.12) ** 2) - (((fAcross - 0.14) / 0.06) ** 2)) : 0;
      return { mel: Math.max(0.36 * d, base, 0.95 * mspot), xan: 0.95 * d + 0.1 * smoothstep(0.5, 0.1, t), irid: 0.05 };
    },
  };
}

function pectoralFin(side, rect) {
  const rays = [];
  const NR = 17; // pectoral rays: 15–18 in Favonigobius [R]; 17 used
  // fin held away from the flank; its lower half flares outward (plane tilted ~30° from vertical)
  const Xf = nrm([1, 0, 0.42 * side]);
  const up0 = nrm([0, 1, -0.58 * side]);
  const Yf = nrm(sub(up0, mul(Xf, dot(up0, Xf))));
  let normal = nrm(cross(Xf, Yf));
  if (normal[2] * side < 0) normal = mul(normal, -1);
  for (let k = 0; k < NR; k++) {
    const f = k / (NR - 1);
    // ray insertion line at 26.4 %SL, nearly vertical, from +1 to −7 %SL about the axis [P]
    const s = 11.15 + 0.4 * f + 0.12 * f * f;
    const y = 4.0 - 3.3 * f;
    const sp = surfaceAt(s, y).p;
    const base = [s, y, side * (sp[2] - 0.12)];
    // upper rays sweep back at ~25°, lower rays point down-back (fan top stays at eye level)
    const psi = (25 - f * 82) * DEG;
    const dir = nrm(add(mul(Xf, Math.cos(psi)), mul(Yf, Math.sin(psi))));
    // rounded fan (skeleton reference): the upper rays shorten quickly (top ray ~1/3 of the longest),
    // the longest are at mid-fin, the lower rays shorten gently
    const x = (f - 0.5) / (f < 0.5 ? 0.5 : 0.62);
    const len = 8.6 * (0.36 + 0.64 * Math.pow(Math.max(0, 1 - x * x), 0.6));
    // uppermost and lowermost rays are simple (unbranched), the rest branch near their tips
    rays.push({ base, dir, len, kind: 'soft', simple: k < 2 || k === NR - 1, curv: 0.05, bend: inPlaneBend(dir, normal), psi });
  }
  return {
    name: side > 0 ? 'Fin_Pectoral_L' : 'Fin_Pectoral_R', type: 'pectoral', Xf, Yf, rays, normal, notch: 0.03, pleat: 0.06, sag: 0.03, rect, branchT: 0.45, segStart: 0.15, cup: 0.22, wave: 0.05,
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      // translucent, with tan to golden rays; a few small dark specks on the upper rays [P colour report §2.4, 017]
      const onRay = Math.exp(-((dRay / 0.07) ** 2));
      const speck = 0.35 * rayDots(r, Lr, len, dRay, { first: 0.8, pitch: 1.1, l: 0.12, w: 0.06, drop: 0.5, seed: 3 }) * smoothstep(0.75, 0.25, fAcross);
      return { mel: speck + 0.02, xan: 0.3 * onRay + 0.12 * smoothstep(0.5, 0.0, t), irid: 0.12 * smoothstep(0.25, 0.0, t) };
    },
  };
}

// Pelvic sucker: the two pelvic fins (I,5 each) are fused into an oval, cup-shaped disc under the chest.
// The spines point forward-laterally and a membrane (frenum) closes the front, so the rim runs all the way
// round; the rim curls down to meet the substrate (the fish rests on it) and the centre stays vaulted.
// pelvic disc origin 27.3–28 %SL, folded tip reaching ~49 %SL [P] → long oval disc
export const PELVIC = { base: 11.95, front: 1.0, back: 8.4, halfWidth: 2.25, drop: 0.45 };
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
    // hyaline white; black (dusky blue-black) in breeding males [P colour report: 004, 051]
    pigment: (r, n, Lr, len, t) => (MALE ? { mel: 0.85 * smoothstep(0.1, 0.35, t), xan: 0.05, irid: 0.1 } : { mel: 0, xan: 0.08, irid: 0.42 * smoothstep(1.0, 0.2, t) }),
  };
}

export function finDefinitions() {
  const R = (x, y, w, h) => ({ x, y, w, h });
  // First dorsal: VI spines [F: FishBase D VI–VII]; base 34.9–48.9 %SL [P]; erect height ~9–10 %SL; spines rake back.
  const D1male = MALE ? [5.2, 5.0, 4.6, 3.9, 3.1, 2.3] : null; // membrane reach (mm) along each spine
  const D1 = medianFin({
    name: 'Fin_Dorsal1', s0: 14.9, s1: 21.0, count: 6, a0: 72, a1: 42, dorsal: true, spines: 6, curv: 0.08, notch: 0.28, pleat: 0.04, sag: 0.02, membrane: D1male,
    // breeding males: spine 2 (1–2) drawn out into a filament [F: zukan.com, Wikipedia-ja, Fauna Sinica; P 001, 031]
    lengths: MALE ? [5.2, 8.6, 4.6, 3.9, 3.1, 2.3] : [4.3, 4.6, 4.35, 3.8, 3.1, 2.3], rect: R(1024, 1024, 512, 512), branchT: 2, segStart: 2,
    pigment: (r, n, Lr, len, t, dRay, fAcross) => {
      // grey membrane, 3–4 rows of brick-red oval dots (≈2.0 × 0.85 %SL) and a dark distal margin [F: Fauna
      // Sinica, NIBR; P colour report §3.8]
      const d = rayDots(r, Lr, len, dRay, { first: 0.6, pitch: 0.95, l: 0.3, w: 0.25, maxFrac: 0.8, drop: 0.1, seed: 5 });
      const margin = smoothstep(0.8, 0.95, t);
      let mel = Math.max(0.34 * d, 0.5 * margin) + 0.05, xan = 0.95 * d + 0.12 * smoothstep(0.5, 0.0, t);
      // breeding male: black spot between the last spines near the base, yellow patch in front of / above it
      // [P colour report: 004/005 x 46–51 %SL, 052L dorsal view; literature: dark D1 with pale margin]
      if (MALE) {
        const spot = Math.exp(-(((fAcross - 0.86) / 0.13) ** 2) - (((t - 0.32) / 0.2) ** 2));
        const yel = Math.exp(-(((fAcross - 0.62) / 0.14) ** 2) - (((t - 0.62) / 0.15) ** 2));
        mel = Math.max(mel * (1 - yel), 0.95 * spot);
        xan = Math.max(xan, 1.0 * yel);
      }
      return { mel, xan, irid: 0.05 };
    },
  });
  // Second dorsal: I,9 [F]; long base 53.8–83.2 %SL [P]; folded tips reach 88–90 %SL.
  const D2 = medianFin({
    name: 'Fin_Dorsal2', s0: 23.1, s1: 35.8, count: 10, a0: 60, a1: 30, dorsal: true, spines: 1, curv: 0.03, notch: 0.07, pleat: 0.05, sag: 0.025,
    lengths: [3.0, 3.6, 3.9, 4.0, 4.05, 4.05, 4.0, 3.95, 3.85, 3.55], rect: R(0, 1024, 1024, 512), branchT: 0.55, segStart: 0.18,
    pigment: (r, n, Lr, len, t, dRay) => {
      // 4–5 rows of large brick-red oval dots (2.2 × 0.7–1.0 %SL) about 1.6–2 %SL apart, staggered between
      // neighbouring rays; greyish margin [P colour report §3.8; F "rows of spots, may carry reddish-brown spots"]
      const d = rayDots(r, Lr, len, dRay, { first: 0.45, pitch: 0.78, l: 0.3, w: 0.27, maxFrac: 0.9, drop: 0.08, seed: 7 });
      return { mel: 0.32 * d + 0.03 + 0.25 * smoothstep(0.85, 0.97, t), xan: 0.95 * d + 0.12 * smoothstep(0.6, 0.0, t), irid: 0.05 };
    },
  });
  // Anal: I,9 [F]; base 55.2–81.3 %SL, origin ~1.4 %SL behind the D2 origin [P].
  const AN = medianFin({
    name: 'Fin_Anal', s0: 23.7, s1: 35.0, count: 10, a0: -58, a1: -28, dorsal: false, spines: 1, curv: 0.03, notch: 0.07, pleat: 0.05, sag: 0.025,
    lengths: [2.3, 2.9, 3.2, 3.35, 3.4, 3.4, 3.35, 3.3, 3.15, 2.85], rect: R(0, 1536, 1024, 512), branchT: 0.55, segStart: 0.18,
    // hyaline whitish without dots; breeding males with a dark longitudinal band [P colour report §2.4: 051, 004]
    pigment: (r, n, Lr, len, t) => ({ mel: MALE ? 0.6 * Math.exp(-(((t - 0.55) / 0.18) ** 2)) + 0.1 : 0.04, xan: 0.1, irid: 0.32 * smoothstep(0.35, 0.0, t) }),
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
    // folded: the rays close into a narrow fan pointing straight back and the fin lies flat against the
    // flank (its lower half no longer flares out), as when a goby tucks its pectorals in for a dart
    const side = Math.sign(def.Xf[2]);
    const mid = -4 * DEG;
    return withRayAngles(def, (r) => mid - (r.psi - mid) * 0.08, nrm([1, 0, 0.12 * side]), [0, 1, 0]);
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
          if (soft && !ray.simple && t > def.branchT && r > 0 && r < n - 1) {
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
        // free filament: the membrane stops well below the tip of an elongated spine (male D1 spine 2)
        if (def.membrane) {
          const k0 = clamp(Math.floor(a), 0, n - 2), f0 = a - k0;
          const reach = def.membrane[k0] * (1 - f0) + def.membrane[k0 + 1] * f0;
          edge = Math.min(edge, reach / Math.max(rayLenAt(def, a), 1e-3) - def.notch * 0.6 * Math.pow(Math.sin(Math.PI * fr), 0.85));
        }
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
        // xantho/erythrophores: brick-red to orange-tan dots (live 014/001/018: R:G:B ≈ 1 : 0.35 : 0.27) [P]
        cr *= mix(1, 0.95, xan); cg *= mix(1, 0.6, xan); cb *= mix(1, 0.36, xan);
        cr = mix(cr, 0.9, irid * 0.5); cg = mix(cg, 0.9, irid * 0.5); cb = mix(cb, 0.88, irid * 0.5);
        cr *= Math.exp(-mel * 2.4); cg *= Math.exp(-mel * 2.8); cb *= Math.exp(-mel * 3.1);
        const o = (py * S + px) * 4;
        const opacity = clamp(0.2 + 0.5 * rayD + 0.75 * mel + 0.35 * xan + 0.3 * irid);
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
