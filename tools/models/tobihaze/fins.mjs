// Fins of the adult トビハゼ: first and second dorsal, anal, caudal, the pectoral fins on their muscular arms, and the
// pelvic fins joined by a frenum. Every fin is a fan of rays with a membrane between them, meshed as a grid
// (a = continuous ray index, t = 0 at the base … 1 at the margin), skinned to the rig and with fold targets.
//
// Counts and shapes (FishBase / Murdy 1989; Polgar, mudskipper.it; Okamoto et al. 2018; Ziadi-Künzli et al. 2024):
// D1 rounded, ~14 flexible spines, grey-brown with a dark band inside a narrow whitish margin; D2 I,12, base 22 % SL,
// transparent with a grey-brown mid stripe and dark speckles at the ray bases; anal I,11, base 19 % SL; pectoral 14
// rays on a protruding muscular base (elongated radials); pelvics I,5 each, joined in front by a frenum and the inner
// rays linked by membrane for half their length, length 13 % SL; caudal lanceolate, the lower rays shorter and stouter.
import { S_END, SL, TL, FEAT, EYE, section, topY, botY, toObject, dirToObject, surfaceAt, norm3, ARM_U } from './anatomy.mjs';
import { perlin3, fbm3, hash01, clamp, mix, smoothstep } from '../../lib/noise.mjs';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerpV = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** rotate v about unit axis k by angle (Rodrigues) */
function rot(v, k, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const kv = cross(k, v), kd = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}

// ------------------------------------------------------------------------------------------------ pectoral arm
// The arm (fleshy base over the elongated radials) leaves the flank low behind the gill slit; in the rest pose of the
// model it points back, down and out. It ends in a flat "hand" whose distal edge carries the fin web; the joint
// between the forearm and the hand (the "wrist", J_pecArm) is where the web turns relative to the arm when it is laid
// on the mud.
export const PEC = (() => {
  const base = [FEAT.pecLobe[0] + 0.3, FEAT.pecLobe[1] + 0.05, FEAT.pecLobe[2] - 0.95];
  const dir = norm3([0.6, -0.58, 0.55]);
  const len = 6.2; // shoulder → distal edge of the hand
  const joint = 4.4; // shoulder → wrist joint
  const wrist = add(base, scl(dir, joint));
  const hand = add(base, scl(dir, len));
  // the fin plane holds the arm axis and its "width" direction (in the rest pose: up and slightly in)
  const width = norm3(sub([0, 1, -0.25], scl(dir, dot([0, 1, -0.25], dir))));
  const normal = norm3(cross(dir, width)); // faces out-and-down for the left fin
  return { base, dir, len, joint, wrist, hand, width, normal, rays: 14 };
})();

/** Arm tube (left side; the right one mirrors z). Returns fish-space vertices with arm parameters for skinning. */
export function buildArm(NA = 18, NR = 20, side = 1) {
  const { base, dir, len, width, normal } = PEC;
  const start = sub(base, scl(dir, 1.2)); // sunk into the body so the junction never opens
  const total = len + 1.2;
  const rows = [];
  const fish = [], nrm = [], uv = [], at = [];
  const tris = [];
  for (let i = 0; i <= NA; i++) {
    const f = i / NA;
    const along = f * total;
    // a thick, fleshy limb (the muscles over the elongated radials): broad where it leaves the flank, a rounded
    // forearm, then (past the wrist joint) flattening into a broad, thin "hand" where the rays insert along its
    // distal edge (the fin web grows out of that edge, not out of a point)
    const hand = smoothstep((PEC.joint + 1.2 - 0.2) / total, 0.95, f);
    const rw = mix(mix(2.35, 1.85, smoothstep(0.0, 0.55, f)), 2.0, hand);
    const rt = mix(mix(1.6, 1.15, smoothstep(0.0, 0.55, f)), 0.55, hand);
    // the distal edge rounds off over the last 0.35 mm
    const cap = f > 0.97 ? Math.sqrt(Math.max(0, 1 - ((f - 0.97) / 0.03) ** 2)) : 1;
    const c = add(start, scl(dir, along));
    const row = [];
    for (let j = 0; j <= NR; j++) {
      const a = (j / NR) * TAU;
      const off = add(scl(width, Math.cos(a) * rw * cap), scl(normal, Math.sin(a) * rt * cap));
      const p = add(c, off);
      const n = norm3(add(scl(width, Math.cos(a) / rw), scl(normal, Math.sin(a) / rt)));
      const pp = side > 0 ? p : [p[0], p[1], -p[2]];
      const nn = side > 0 ? n : [n[0], n[1], -n[2]];
      row.push(fish.length / 3);
      fish.push(...pp); nrm.push(...nn);
      uv.push(ARM_U[0] + (ARM_U[1] - ARM_U[0]) * (0.02 + 0.96 * f), j / NR);
      at.push(along - 1.2);
    }
    rows.push(row);
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j < NR; j++) {
    const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
    if (side > 0) tris.push(a, b, c, a, c, d); else tris.push(a, c, b, a, d, c);
  }
  // make sure the winding faces out
  {
    const P = (k) => [fish[k * 3], fish[k * 3 + 1], fish[k * 3 + 2]];
    const a = tris[0], b = tris[1], c = tris[2];
    const fn = cross(sub(dirToObject(P(b)), dirToObject(P(a))), sub(dirToObject(P(c)), dirToObject(P(a))));
    const n0 = dirToObject([nrm[a * 3], nrm[a * 3 + 1], nrm[a * 3 + 2]]);
    if (dot(fn, n0) < 0) for (let k = 0; k < tris.length; k += 3) { const t = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = t; }
  }
  return { fish, nrm, uv, at, indices: tris };
}

/**
 * paint of the arm strip in the body texture: the flank's skin (grey-olive, dense dark melanophores, a few pale
 * spots) over the muscular forearm, paler underneath, turning yellowish and translucent-looking on the flat hand
 * where the rays insert
 */
export function armPaint(ua, va) {
  const f = ua;
  const a = va * TAU;
  const p = [f * 7, Math.cos(a) * 1.5, Math.sin(a) * 0.8];
  const top = Math.cos(a); // +1: the upper (outer) side in the rest pose
  const under = smoothstep(0.2, -0.8, top);
  let col = [mix(116, 146, under), mix(111, 138, under), mix(98, 120, under)];
  const n = fbm3(p[0] * 0.8, p[1] * 0.8, p[2] * 0.8, 3, 401);
  col = col.map((c) => c * (1 + 0.12 * n));
  // melanophore speckle (fine, dense) and a few larger dark freckles, fewer underneath
  const fine = smoothstep(0.6, 0.76, perlin3(p[0] * 9, p[1] * 9, p[2] * 9, 403) * 0.5 + 0.5);
  const big = smoothstep(0.66, 0.8, perlin3(p[0] * 3.2, p[1] * 3.2, p[2] * 3.2, 405) * 0.5 + 0.5);
  col = col.map((c, i) => mix(c, [52, 48, 42][i], (fine * 0.7 + big * 0.5) * (1 - 0.7 * under)));
  // pale spots like the flank's
  const pale = smoothstep(0.74, 0.84, perlin3(p[0] * 4 + 7, p[1] * 4, p[2] * 4, 407) * 0.5 + 0.5) * (1 - under);
  col = col.map((c, i) => mix(c, [206, 214, 210][i], pale * 0.45));
  // the hand: yellowish where the rays insert
  const hand = smoothstep(0.62, 0.95, f);
  col = col.map((c, i) => mix(c, [178, 156, 110][i], hand * 0.6));
  const h = 0.012 * fbm3(p[0] * 4, p[1] * 4, p[2] * 4, 3, 409) + 0.012 * Math.sin(f * 46 + 2 * n) * smoothstep(0.15, 0.55, f) * (1 - hand);
  return { col, h, ao: mix(0.7, 1, smoothstep(0.0, 0.25, f)), rough: 0.5, mudAff: clamp(0.5 - 0.4 * top), mucus: 0.65, sun: clamp(0.1 + 0.3 * top) };
}

// ------------------------------------------------------------------------------------------------ fin definitions
// A ray: base point (fish mm), unit direction, length, and a bend (rad over the length, about the fin-plane normal).
// def.notch(a): how far the margin is cut in between rays (0 = straight), def.marginT(a): margin position along t.

function medianFin({ name, s0, s1, rays, heights, angle0, angle1, foldAngle, top, inset = 0.15, rect, spines = 0, notch = 0.12, bend = 0.08 }) {
  const n = rays;
  const R = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const s = s0 + (s1 - s0) * f;
    const y = top ? topY(s) - inset : botY(s) + inset;
    const ang = mix(angle0, angle1, f); // tilt back from the vertical
    const dir = top ? [Math.sin(ang), Math.cos(ang), 0] : [Math.sin(ang), -Math.cos(ang), 0];
    const fold = top ? [Math.sin(foldAngle), Math.cos(foldAngle), 0] : [Math.sin(foldAngle), -Math.cos(foldAngle), 0];
    R.push({ base: [s, y, 0], dir, fold, len: heights[i], bend: top ? -bend : bend, spine: i < spines });
  }
  return { name, type: 'median', rays: R, normal: [0, 0, 1], notch: () => notch, rect, top };
}

function caudalFin(rect) {
  // 17 principal rays plus 4 procurrent above and below; lanceolate-rounded, the lower rays shorter and stouter
  const R = [];
  const n = 25;
  const sB = 63.6;
  const q = section(sB);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1); // 0 = dorsal-most
    const u = (f - 0.5) * 2; // -1 top … +1 bottom
    const proc = f < 4 / 24 || f > 20 / 24;
    const y = q.yc + 0.15 - u * (q.t + q.b) * 0.46;
    const s = sB + (proc ? 1.2 * Math.abs(u) - 0.6 : 0.0) + 1.4 * (1 - Math.abs(u));
    const spread = u * 25 * DEG;
    const dir = [Math.cos(spread), -Math.sin(spread), 0];
    // lanceolate outline: the middle rays reach TL; the lower lobe is a little shorter than the upper
    const lenMid = TL - s;
    let len = lenMid * (1 - 0.5 * Math.pow(Math.abs(u), 1.4)) * (u > 0 ? 0.93 : 1.0);
    if (proc) len *= 0.55;
    const fold = [Math.cos(spread * 0.35), -Math.sin(spread * 0.35), 0];
    R.push({ base: [s, y, 0], dir, fold, len, bend: 0, spine: proc });
  }
  return { name: 'Fin_Caudal', type: 'caudal', rays: R, normal: [0, 0, 1], notch: () => 0.018, rect };
}

function pectoralWeb(rect) {
  // 14 rays fanning from the wrist; rounded fan, the middle rays longest
  const { hand, dir, width, normal } = PEC;
  const n = PEC.rays;
  const R = [];
  // a rounded fan, the leading rays stoutest
  const LEN = [5.2, 6.3, 7.0, 7.5, 7.8, 7.95, 7.95, 7.8, 7.55, 7.15, 6.6, 5.9, 5.1, 4.2].map((l) => l + 0.9);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1); // 0 = leading (upper) ray
    // the rays insert along the hand's distal edge, their bases sheathed in its skin (they start inside the hand)
    const along = (0.5 - f) * 3.3;
    const base = add(sub(hand, scl(dir, 1.3)), scl(width, along));
    const spread = (0.5 - f) * 112 * DEG; // the open fan spans ~112°
    const d = norm3(rot(dir, normal, spread));
    const fold = norm3(rot(dir, normal, (0.5 - f) * 22 * DEG));
    R.push({ base, dir: d, fold, len: LEN[i], bend: 0.12, spine: false });
  }
  return { name: 'Fin_Pectoral_L', type: 'pectoral', rays: R, normal, notch: () => 0.012, rect, pec: true };
}

export const PELVIC = { s: 19.6, len: 8.3 };
function pelvicFins(rect) {
  // two fans of I,5 under the pectoral girdle; inner rays of the two sides joined by membrane for half their length
  const R = [];
  const s0 = PELVIC.s, y0 = botY(s0) + 0.25;
  const side = (k) => (k < 6 ? 1 : -1);
  for (let k = 0; k < 12; k++) {
    const sd = side(k);
    const m = k < 6 ? k : 11 - k; // 0 = outer spine … 5 = inner ray
    const zb = sd * (1.45 - m * 0.24);
    const base = [s0 + m * 0.18, y0, zb];
    const out = (5 - m) / 5; // outer rays splay more laterally
    const d = norm3([Math.cos(18 * DEG), -Math.sin(18 * DEG), sd * (0.12 + 0.55 * out)]);
    const fold = norm3([1, -0.08, sd * (0.06 + 0.2 * out)]);
    const len = PELVIC.len * [0.62, 0.86, 0.96, 1.0, 0.98, 0.92][m];
    R.push({ base, dir: d, fold, len, bend: 0.0, spine: m === 0 });
  }
  return {
    name: 'Fin_Pelvic', type: 'pelvic', rays: R, normal: [0, 1, 0], rect,
    // between the two inner rays (gap 5) the membrane reaches only half way
    notch: (gap) => (gap === 5 ? 0.5 : 0.05),
  };
}

export const ATLAS = 2048;
export function finDefinitions() {
  // atlas rectangles in 0..1 (x, y, w, h)
  return [
    // first dorsal: a tall sail over the pectorals (leading edge near vertical, the top rounded, the trailing edge
    // sloping to the back), ~1.2 × the body's depth when raised, its base ~18 % TL
    medianFin({ name: 'Fin_Dorsal1', s0: 21.5, s1: 36.0, rays: 14, top: true, spines: 14,
      heights: [10.6, 12.6, 13.4, 13.5, 13.1, 12.3, 11.3, 10.2, 9.0, 7.8, 6.6, 5.4, 4.2, 3.0], angle0: 9 * DEG, angle1: 60 * DEG, foldAngle: 82 * DEG,
      rect: [0.0, 0.0, 0.5, 0.25], notch: 0.045, bend: 0.1 }),
    // second dorsal: long and even, from above the vent nearly to the peduncle
    medianFin({ name: 'Fin_Dorsal2', s0: 39.0, s1: 58.0, rays: 13, top: true, spines: 1,
      heights: [5.0, 5.5, 5.75, 5.85, 5.9, 5.9, 5.85, 5.75, 5.6, 5.35, 5.0, 4.5, 3.8], angle0: 32 * DEG, angle1: 64 * DEG, foldAngle: 84 * DEG,
      rect: [0.5, 0.0, 0.5, 0.25], notch: 0.03 }),
    medianFin({ name: 'Fin_Anal', s0: 41.0, s1: 56.5, rays: 12, top: false, spines: 1,
      heights: [3.4, 3.9, 4.2, 4.35, 4.4, 4.4, 4.35, 4.25, 4.1, 3.85, 3.5, 3.0], angle0: 38 * DEG, angle1: 64 * DEG, foldAngle: 84 * DEG,
      rect: [0.0, 0.25, 0.5, 0.25], notch: 0.03 }),
    caudalFin([0.5, 0.25, 0.5, 0.375]),
    pectoralWeb([0.0, 0.5, 0.5, 0.25]),
    pelvicFins([0.0, 0.75, 0.5, 0.25]),
  ];
}

// ------------------------------------------------------------------------------------------------ fin surface
function rayAt(def, a, folded = 0) {
  const R = def.rays;
  const i = Math.max(0, Math.min(R.length - 2, Math.floor(a)));
  const f = Math.max(0, Math.min(1, a - i));
  const A = R[i], B = R[i + 1];
  const dA = norm3(lerpV(A.dir, A.fold, folded)), dB = norm3(lerpV(B.dir, B.fold, folded));
  return { base: lerpV(A.base, B.base, f), dir: norm3(lerpV(dA, dB, f)), len: mix(A.len, B.len, f) * (1 - 0.06 * folded), bend: mix(A.bend, B.bend, f), f, i };
}

/** margin position (t at the edge) for a continuous ray index: membranes are incised between the rays */
function marginT(def, a) {
  const i = Math.floor(a), f = a - i;
  if (f < 1e-6 || i >= def.rays.length - 1) return 1;
  return 1 - def.notch(i) * Math.sin(Math.PI * f) ** 1.4;
}

export function finPoint(def, a, t, folded = 0) {
  const r = rayAt(def, a, folded);
  const tt = Math.min(t, marginT(def, a));
  const L = r.len * tt;
  // the ray bends in the fin plane: rotate its direction progressively about the fin-plane normal
  const n = def.normal;
  const steps = 6;
  let p = r.base.slice();
  for (let k = 0; k < steps; k++) {
    const d = rot(r.dir, n, r.bend * ((k + 0.5) / steps) * tt);
    p = add(p, scl(d, L / steps));
  }
  // pleats: the membrane between rays sags out of the plane only when the fin folds (spread, it is taut)
  const sag = Math.sin(Math.PI * r.f) * (0.012 + 0.25 * folded) * tt * r.len * 0.06;
  const pn = def.type === 'pelvic' ? [0, 1, 0] : n;
  return add(p, scl(pn, sag * (r.i % 2 ? 1 : -1)));
}

/** Fin grid: a across the rays (SUB per gap), t along. Returns fish-space positions and per-vertex data. */
export function buildFinMesh(def, SUB = 4, NT = 24) {
  const nR = def.rays.length;
  const NA = (nR - 1) * SUB;
  const fish = [], uv = [], rayT = [], baseS = [], aIdx = [];
  for (let ia = 0; ia <= NA; ia++) {
    const a = ia / SUB;
    const mT = marginT(def, a);
    for (let it = 0; it <= NT; it++) {
      const t = (it / NT) * mT;
      const p = finPoint(def, a, t);
      fish.push(...p);
      const [rx, ry, rw, rh] = def.rect;
      uv.push(rx + rw * (0.02 + 0.96 * (a / (nR - 1))), ry + rh * (0.03 + 0.94 * t));
      rayT.push(t);
      baseS.push(rayAt(def, a).base[0]);
      aIdx.push(a);
    }
  }
  const cols = NT + 1;
  const tris = [];
  for (let ia = 0; ia < NA; ia++) for (let it = 0; it < NT; it++) {
    const a = ia * cols + it, b = (ia + 1) * cols + it, c = (ia + 1) * cols + it + 1, d = ia * cols + it + 1;
    tris.push(a, b, c, a, c, d);
  }
  const position = new Float32Array(fish.length), normal = new Float32Array(fish.length);
  for (let k = 0; k < fish.length / 3; k++) position.set(toObject([fish[k * 3], fish[k * 3 + 1], fish[k * 3 + 2]]), k * 3);
  // smooth normals
  for (let k = 0; k < tris.length; k += 3) {
    const [a, b, c] = [tris[k], tris[k + 1], tris[k + 2]];
    const pa = position.subarray(a * 3, a * 3 + 3), pb = position.subarray(b * 3, b * 3 + 3), pc = position.subarray(c * 3, c * 3 + 3);
    const fn = cross(sub(pb, pa), sub(pc, pa));
    for (const v of [a, b, c]) { normal[v * 3] += fn[0]; normal[v * 3 + 1] += fn[1]; normal[v * 3 + 2] += fn[2]; }
  }
  for (let v = 0; v < normal.length / 3; v++) normal.set(norm3([normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2]]), v * 3);
  return { position, normal, uv: new Float32Array(uv), indices: new Uint32Array(tris), fish, rayT, baseS, aIdx, NA, NT };
}

/** fold target: same grid with the rays turned to their folded directions (deltas, metres) */
export function buildFinFold(def, mesh, SUB, NT, amount = 1) {
  const nR = def.rays.length;
  const NA = (nR - 1) * SUB;
  const d = new Float32Array(mesh.position.length);
  let k = 0;
  for (let ia = 0; ia <= NA; ia++) {
    const a = ia / SUB;
    const mT = marginT(def, a);
    for (let it = 0; it <= NT; it++) {
      const t = (it / NT) * mT;
      const p = toObject(finPoint(def, a, t, amount));
      d[k * 3] = p[0] - mesh.position[k * 3]; d[k * 3 + 1] = p[1] - mesh.position[k * 3 + 1]; d[k * 3 + 2] = p[2] - mesh.position[k * 3 + 2];
      k++;
    }
  }
  return d;
}

/** mirror a left pectoral mesh to the right side (z → -z) with reversed winding */
export function mirrorMesh(m) {
  const position = m.position.slice(), normal = m.normal.slice();
  for (let k = 0; k < position.length; k += 3) { position[k] = -position[k]; normal[k] = -normal[k]; }
  const indices = m.indices.slice();
  for (let k = 0; k < indices.length; k += 3) { const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t; }
  const fish = m.fish.slice();
  for (let k = 0; k < fish.length; k += 3) fish[k + 2] = -fish[k + 2];
  return { ...m, position, normal, indices, fish };
}

// ------------------------------------------------------------------------------------------------ atlas
/**
 * Paint the fin atlas: RGBA colour (alpha = membrane opacity) and a normal map with the rays as ridges.
 * In each rect, x = ray index (rays at integer positions), y = t (base → margin).
 */
export function paintFinAtlas(defs, size = ATLAS, log = () => {}) {
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 3);
  for (let k = 0; k < size * size; k++) { normal[k * 3] = 128; normal[k * 3 + 1] = 128; normal[k * 3 + 2] = 255; color[k * 4 + 3] = 0; }
  for (const def of defs) {
    const [rx, ry, rw, rh] = def.rect;
    const x0 = Math.floor(rx * size), y0 = Math.floor(ry * size), W = Math.floor(rw * size), H = Math.floor(rh * size);
    const nR = def.rays.length;
    const hgt = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = ((x + 0.5) / W - 0.02) / 0.96, v = ((y + 0.5) / H - 0.03) / 0.94;
      const a = clamp(u) * (nR - 1), t = clamp(v);
      const fa = a - Math.floor(a);
      const rayD = Math.min(fa, 1 - fa); // 0 on a ray
      const ray = smoothstep(0.11, 0.0, rayD) * (1 - 0.35 * t);
      // segmented, branching soft rays (fine joints), spines unsegmented
      const r = def.rays[Math.min(nR - 1, Math.round(a))];
      const seg = r.spine ? 0 : 0.5 + 0.5 * Math.cos(t * 70 + Math.round(a) * 1.7);
      const branch = !r.spine && t > 0.55 ? smoothstep(0.12, 0.0, Math.abs(fa - 0.5 + (fa > 0.5 ? -0.25 : 0.25))) * 0.0 : 0;
      const mt = marginT(def, a);
      const inside = smoothstep(mt + 0.01, mt - 0.02, t) * smoothstep(-0.02, 0.01, t);
      const n1 = fbm3(a * 1.3, t * 6, def.name.length, 3, 501);
      let col, alpha;
      switch (def.type) {
        case 'median': {
          // white spots in rows on the rays (each ray carries a string of them, staggered between neighbours)
          const ri = Math.round(a), fr = a - ri;
          const spotRow = (rows, seed, r0) => {
            const tv = t * rows + 0.5 * (ri & 1) + 0.3 * hash01(ri, 0, 0, seed);
            let best = 0;
            for (const cy of [Math.floor(tv) - 1, Math.floor(tv), Math.floor(tv) + 1]) {
              if (hash01(ri, cy, 1, seed) < 0.15) continue;
              const oy = 0.5 + 0.35 * (hash01(ri, cy, 2, seed) - 0.5);
              const ox = 0.08 * (hash01(ri, cy, 3, seed) - 0.5);
              const r = r0 * (0.7 + 0.5 * hash01(ri, cy, 4, seed));
              const d = Math.hypot((fr - ox) / r, (tv - cy - oy) / (r * rows * 0.11));
              best = Math.max(best, smoothstep(1.0, 0.65, d));
            }
            return best;
          };
          const onRay = smoothstep(0.24, 0.06, Math.abs(fr));
          if (def.name === 'Fin_Dorsal1') {
            // orange-brown spines in a dark brown membrane, strings of white spots on the spines, a black blotch high
            // on the first spines, an orange margin (the spine tips run a little free beyond the membrane)
            const margin = smoothstep(mt - 0.1, mt - 0.03, t);
            const blotch = smoothstep(0.5, 0.66, t) * smoothstep(3.8, 1.6, a) * (1 - margin);
            const pearls = spotRow(9, 11, 0.3) * smoothstep(0.04, 0.1, t) * smoothstep(mt - 0.12, mt - 0.2, t) * (1 - blotch);
            col = [72, 54, 42].map((c, i) => mix(c, [178, 110, 58][i], onRay * 0.85));
            col = col.map((c, i) => mix(c, [104, 84, 66][i], smoothstep(0.12, 0.0, t) * 0.6));
            col = col.map((c, i) => mix(c, [242, 236, 222][i], pearls * 0.95));
            col = col.map((c, i) => mix(c, [24, 20, 18][i], blotch * 0.92));
            col = col.map((c, i) => mix(c, [214, 122, 56][i], margin * 0.8));
            alpha = mix(0.7, 0.92, onRay) + 0.2 * pearls + 0.2 * blotch;
          } else if (def.name === 'Fin_Dorsal2') {
            // pale membrane with strings of cream spots, a black submarginal band and a broad orange-red margin
            const band = smoothstep(mt - 0.42, mt - 0.32, t) * smoothstep(mt - 0.16, mt - 0.24, t);
            const orange = smoothstep(mt - 0.26, mt - 0.14, t);
            const pearls = spotRow(6, 23, 0.32) * smoothstep(0.04, 0.1, t) * smoothstep(mt - 0.36, mt - 0.44, t);
            col = [120, 98, 76].map((c, i) => mix(c, [168, 120, 76][i], onRay * 0.7));
            col = col.map((c, i) => mix(c, [236, 228, 208][i], pearls * 0.9));
            col = col.map((c, i) => mix(c, [30, 26, 24][i], band * 0.88));
            col = col.map((c, i) => mix(c, [212, 104, 52][i], orange * 0.8));
            alpha = 0.5 + 0.2 * onRay + 0.3 * pearls + 0.4 * band + 0.25 * orange;
          } else {
            // anal fin: pale yellowish, nearly clear, the rays yellow
            const dusk = smoothstep(0.55, 0.95, t);
            col = [200, 186, 146].map((c, i) => mix(c, [196, 164, 84][i], onRay * 0.6));
            col = col.map((c, i) => mix(c, [150, 136, 104][i], dusk * 0.35));
            alpha = 0.3 + 0.2 * onRay + 0.15 * dusk;
          }
          break;
        }
        case 'caudal': {
          // dusky grey-brown, fine dark speckles along the rays, the lower part darker
          const lower = smoothstep(0.55, 0.9, u);
          const sp = smoothstep(0.62, 0.8, perlin3(a * 1.7, t * 13, 5, 531) * 0.5 + 0.5 + 0.15 * n1) * smoothstep(0.05, 0.2, t);
          col = [132, 124, 110].map((c) => c * (0.92 + 0.12 * n1));
          col = col.map((c, i) => mix(c, [62, 56, 50][i], sp * 0.6));
          col = col.map((c, i) => mix(c, [74, 68, 62][i], lower * 0.55));
          alpha = 0.5 + 0.25 * sp + 0.18 * lower;
          break;
        }
        case 'pectoral': {
          // olive-yellow and translucent, many fine yellow rays; the base sheathed in the arm's thick skin (opaque,
          // the arm's colour), which fades out over the first fifth of the fin
          const sheath = smoothstep(0.24, 0.08, t);
          const sp = smoothstep(0.6, 0.78, perlin3(a * 2.6, t * 10, 11, 521) * 0.5 + 0.5) * smoothstep(0.6, 0.15, t);
          // each ray branches in its outer half: fine secondary rays between the main ones
          const fine = t > 0.4 ? smoothstep(0.1, 0.0, Math.abs(fa - 0.5)) * smoothstep(0.4, 0.6, t) : 0;
          col = [134, 124, 84];
          col = col.map((c, i) => mix(c, [196, 162, 76][i], Math.max(smoothstep(0.11, 0.0, rayD), fine) * 0.75));
          col = col.map((c, i) => mix(c, [74, 66, 50][i], sp * 0.6));
          col = col.map((c, i) => mix(c, [128, 120, 100][i], sheath));
          alpha = 0.26 + 0.24 * sp + 0.3 * fine + 0.7 * sheath;
          break;
        }
        default: {
          // pelvic: creamy yellow, fleshy at the base
          col = [212, 194, 150].map((c, i) => mix(c, [196, 176, 140][i], smoothstep(0.3, 0.0, t)));
          alpha = 0.55 + 0.3 * smoothstep(0.3, 0.0, t);
        }
      }
      // rays are more opaque and a little darker than the membrane
      col = col.map((c) => c * (1 - 0.12 * ray));
      alpha = clamp(Math.max(alpha, ray * 0.78) * inside * (0.9 + 0.1 * n1));
      const k = (y0 + y) * size + (x0 + x);
      color[k * 4] = clamp(Math.round(col[0]), 0, 255);
      color[k * 4 + 1] = clamp(Math.round(col[1]), 0, 255);
      color[k * 4 + 2] = clamp(Math.round(col[2]), 0, 255);
      color[k * 4 + 3] = Math.round(alpha * 255);
      hgt[y * W + x] = ray * 1.0 + seg * ray * 0.15 + 0.08 * n1 + branch;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const xl = Math.max(0, x - 1), xr = Math.min(W - 1, x + 1), yl = Math.max(0, y - 1), yr = Math.min(H - 1, y + 1);
      const dx = (hgt[y * W + xr] - hgt[y * W + xl]) * 0.6, dy = (hgt[yr * W + x] - hgt[yl * W + x]) * 0.6;
      const nn = norm3([-dx, -dy, 1]);
      const k = (y0 + y) * size + (x0 + x);
      normal[k * 3] = Math.round((nn[0] * 0.5 + 0.5) * 255);
      normal[k * 3 + 1] = Math.round((nn[1] * 0.5 + 0.5) * 255);
      normal[k * 3 + 2] = Math.round((nn[2] * 0.5 + 0.5) * 255);
    }
    log(`    fin ${def.name} painted`);
  }
  // dilate colour into transparent texels (avoids dark fringes under filtering)
  for (let pass = 0; pass < 4; pass++) {
    const src = color.slice();
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      const k = y * size + x;
      if (src[k * 4 + 3] > 8) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (const o of [-1, 1, -size, size]) { const kk = k + o; if (src[kk * 4 + 3] > 8 || (src[kk * 4] + src[kk * 4 + 1] + src[kk * 4 + 2]) > 0) { r += src[kk * 4]; g += src[kk * 4 + 1]; b += src[kk * 4 + 2]; c++; } }
      if (c) { color[k * 4] = r / c; color[k * 4 + 1] = g / c; color[k * 4 + 2] = b / c; }
    }
  }
  return { size, color, normal };
}
