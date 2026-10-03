// Fins of the adult トビハゼ: first and second dorsal, anal, caudal, the pectoral fins on their muscular arms, and the
// pelvic fins joined by a frenum. Every fin is a fan of rays with a membrane between them, meshed as a grid
// (a = continuous ray index, t = 0 at the base … 1 at the margin), skinned to the rig and with fold targets.
//
// Counts and shapes (FishBase / Murdy 1989; Polgar, mudskipper.it; Okamoto et al. 2018; Ziadi-Künzli et al. 2024):
// D1 rounded, ~14 flexible spines, grey-brown with a dark band inside a narrow whitish margin; D2 I,12, base 22 % SL,
// transparent with a grey-brown mid stripe and dark speckles at the ray bases; anal I,11, base 19 % SL; pectoral 14
// rays on a protruding muscular base (elongated radials); pelvics I,5 each, joined in front by a frenum and the inner
// rays linked by membrane for half their length, length 13 % SL; caudal lanceolate, the lower rays shorter and stouter.
import { S_END, SL, TL, FEAT, EYE, section, topY, botY, toObject, dirToObject, surfaceAt, norm3, BODY_U } from './anatomy.mjs';
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
// model it points back, down and out. The fin web fans from its distal end ("wrist").
export const PEC = (() => {
  const base = [FEAT.pecLobe[0] + 0.2, FEAT.pecLobe[1] - 0.25, FEAT.pecLobe[2] - 0.65];
  const dir = norm3([0.72, -0.5, 0.48]);
  const len = 6.4;
  const wrist = add(base, scl(dir, len));
  // the fin plane holds the arm axis and its "width" direction (in the rest pose: up and slightly in)
  const width = norm3(sub([0, 1, -0.25], scl(dir, dot([0, 1, -0.25], dir))));
  const normal = norm3(cross(dir, width)); // faces out-and-down for the left fin
  return { base, dir, len, wrist, width, normal, rays: 14 };
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
    // radius profile: wide base, slender middle, a rounded swelling at the wrist where the rays insert
    const rw = mix(2.1, 1.45, smoothstep(0.0, 0.6, f)) + 0.06 * Math.exp(-(((f - 0.94) / 0.06) ** 2));
    const rt = mix(1.2, 0.62, smoothstep(0.0, 0.6, f)) + 0.04 * Math.exp(-(((f - 0.94) / 0.06) ** 2));
    // the distal end rounds off over the last 0.5 mm
    const cap = f > 0.965 ? Math.sqrt(Math.max(0, 1 - ((f - 0.965) / 0.035) ** 2)) : 1;
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
      uv.push(BODY_U + (1 - BODY_U) * (0.02 + 0.96 * f), j / NR);
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

/** paint of the arm strip in the body texture: pale, fleshy, finely speckled */
export function armPaint(ua, va) {
  const f = ua;
  const a = va * TAU;
  const p = [f * 6, Math.cos(a) * 1.4, Math.sin(a) * 0.9];
  const top = Math.cos(a); // +1: the upper (outer) side in the rest pose
  let col = [mix(112, 150, 0.5 - 0.5 * top), mix(104, 136, 0.5 - 0.5 * top), mix(90, 114, 0.5 - 0.5 * top)];
  const n = fbm3(p[0] * 0.8, p[1] * 0.8, p[2] * 0.8, 3, 401);
  col = col.map((c) => c * (1 + 0.12 * n));
  const sp = smoothstep(0.62, 0.8, perlin3(p[0] * 5, p[1] * 5, p[2] * 5, 403) * 0.5 + 0.5);
  col = col.map((c, i) => mix(c, [58, 52, 44][i], sp * (0.6 + 0.4 * smoothstep(0.3, -0.3, f - 0.4)) * 0.85));
  // proximally the arm takes the flank colour
  col = col.map((c, i) => mix(c, [118, 110, 94][i], smoothstep(0.55, 0.0, f) * 0.75));
  const h = 0.012 * fbm3(p[0] * 4, p[1] * 4, p[2] * 4, 3, 409) + 0.02 * Math.sin(f * 40 + n) * smoothstep(0.2, 0.6, f) * 0.4;
  return { col, h, ao: mix(0.7, 1, smoothstep(0.0, 0.25, f)), rough: 0.5, mudAff: clamp(0.5 - 0.4 * top), mucus: 0.6, sun: clamp(0.5 + 0.4 * top) };
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
  return { name: 'Fin_Caudal', type: 'caudal', rays: R, normal: [0, 0, 1], notch: () => 0.04, rect };
}

function pectoralWeb(rect) {
  // 14 rays fanning from the wrist; rounded fan, the middle rays longest
  const { wrist, dir, width, normal } = PEC;
  const n = PEC.rays;
  const R = [];
  const LEN = [5.6, 6.6, 7.3, 7.8, 8.1, 8.25, 8.25, 8.1, 7.8, 7.4, 6.8, 6.1, 5.3, 4.4];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1); // 0 = leading (upper) ray
    const along = (0.5 - f) * 2.5; // base positions along the wrist's width
    const base = add(sub(wrist, scl(dir, 0.35)), scl(width, along));
    const spread = (0.5 - f) * 118 * DEG; // the open fan spans ~118°
    const d = norm3(rot(dir, normal, spread));
    const fold = norm3(rot(dir, normal, (0.5 - f) * 22 * DEG));
    R.push({ base, dir: d, fold, len: LEN[i], bend: 0.12, spine: false });
  }
  return { name: 'Fin_Pectoral_L', type: 'pectoral', rays: R, normal, notch: () => 0.07, rect, pec: true };
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
    medianFin({ name: 'Fin_Dorsal1', s0: 25.6, s1: 33.4, rays: 14, top: true, spines: 14,
      heights: [5.6, 7.4, 8.4, 8.9, 9.0, 8.9, 8.6, 8.1, 7.5, 6.8, 6.0, 5.1, 4.1, 3.0], angle0: 14 * DEG, angle1: 62 * DEG, foldAngle: 82 * DEG,
      rect: [0.0, 0.0, 0.5, 0.25], notch: 0.018, bend: 0.12 }),
    medianFin({ name: 'Fin_Dorsal2', s0: 39.2, s1: 53.6, rays: 13, top: true, spines: 1,
      heights: [3.6, 4.1, 4.4, 4.6, 4.7, 4.75, 4.75, 4.7, 4.6, 4.45, 4.2, 3.8, 3.2], angle0: 38 * DEG, angle1: 66 * DEG, foldAngle: 84 * DEG,
      rect: [0.5, 0.0, 0.5, 0.25], notch: 0.08 }),
    medianFin({ name: 'Fin_Anal', s0: 41.4, s1: 53.6, rays: 12, top: false, spines: 1,
      heights: [3.0, 3.5, 3.8, 3.95, 4.0, 4.0, 3.95, 3.85, 3.7, 3.5, 3.15, 2.7], angle0: 40 * DEG, angle1: 66 * DEG, foldAngle: 84 * DEG,
      rect: [0.0, 0.25, 0.5, 0.25], notch: 0.08 }),
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
  // pleats: the membrane between rays sags out of the plane a little (more when folded)
  const sag = Math.sin(Math.PI * r.f) * (0.05 + 0.25 * folded) * tt * r.len * 0.06;
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
      const ray = smoothstep(0.16, 0.0, rayD) * (1 - 0.3 * t);
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
          if (def.name === 'Fin_Dorsal1') {
            // grey-brown with a dark band inside a narrow whitish margin; faint mottling at the base
            const band = smoothstep(mt - 0.24, mt - 0.12, t) * smoothstep(mt - 0.02, mt - 0.08, t);
            const margin = smoothstep(mt - 0.07, mt - 0.02, t);
            col = [120, 112, 100];
            col = col.map((c, i) => mix(c, [48, 42, 38][i], band * 0.85));
            col = col.map((c, i) => mix(c, [226, 224, 216][i], margin * 0.8));
            const mott = smoothstep(0.55, 0.75, fbm3(a * 0.9, t * 4, 3, 3, 507) * 0.5 + 0.5) * smoothstep(0.55, 0.2, t);
            col = col.map((c, i) => mix(c, [70, 62, 54][i], mott * 0.5));
            alpha = mix(0.62, 0.9, band) + 0.08 * margin;
          } else if (def.name === 'Fin_Dorsal2') {
            // transparent with a grey-brown mid stripe and dark speckles at the ray bases, pale edge
            const stripe = Math.exp(-(((t - 0.52) / 0.13) ** 2));
            const speck = smoothstep(0.62, 0.8, perlin3(a * 2.2, t * 9, 7, 511) * 0.5 + 0.5) * smoothstep(0.4, 0.05, t);
            const margin = smoothstep(mt - 0.08, mt - 0.02, t);
            col = [150, 142, 128];
            col = col.map((c, i) => mix(c, [72, 64, 54][i], stripe * 0.8));
            col = col.map((c, i) => mix(c, [40, 36, 32][i], speck * 0.8));
            col = col.map((c, i) => mix(c, [220, 220, 214][i], margin * 0.6));
            alpha = 0.32 + 0.45 * stripe + 0.4 * speck + 0.2 * margin;
          } else {
            // anal fin: pale, almost clear, a dusky submarginal shade
            const dusk = smoothstep(0.45, 0.85, t);
            col = [190, 186, 176].map((c, i) => mix(c, [118, 112, 104][i], dusk * 0.5));
            alpha = 0.34 + 0.22 * dusk;
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
          // pale yellowish, translucent; dark speckles over the proximal rays
          const sp = smoothstep(0.6, 0.78, perlin3(a * 2.6, t * 10, 11, 521) * 0.5 + 0.5) * smoothstep(0.7, 0.1, t);
          col = [168, 150, 116];
          col = col.map((c, i) => mix(c, [74, 62, 50][i], sp * 0.7));
          alpha = 0.42 + 0.3 * sp;
          break;
        }
        default: {
          // pelvic: whitish
          col = [214, 208, 194];
          alpha = 0.5;
        }
      }
      // rays are opaque and a little darker
      col = col.map((c) => c * (1 - 0.18 * ray));
      alpha = clamp(Math.max(alpha, ray * 0.92) * inside * (0.9 + 0.1 * n1));
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
