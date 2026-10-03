import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Vector3 } from 'three';
import { ABDOMEN, CARAPACE, CHELIPED, EYE, LEGS, MXP3 } from './ScopimeraGlobosaMorphology.js';
import { SEGMENTS, SIDES, sharedRig } from './ScopimeraGlobosaRig.js';
import { clamp, hash01, mulberry, smoothstep, TAU } from './util.js';

/**
 * Procedural geometry of the crab, built once per level of detail in the rig's bind pose and shared by every
 * individual (rigid skinning: each vertex belongs to one bone, exactly like a jointed exoskeleton).
 *
 * Silhouette-scale form lives here (dome, regions, orbits, the buccal frame, segment cross-sections, teeth on the
 * fingers, the tympanum's slight hollow); everything finer — granules, grooves, speckles, setal sockets, sand — is
 * the material's job (normal / roughness / height evaluated in the shader from aLocal and uv).
 *
 * Vertex attributes beyond three's: aLocal (vec3, bone-local position in CW: patterns stay glued to their
 * segment), aInfo (vec4: part id, limb id, joint-membrane factor, thinness for translucency).
 */

export const PART = {
  CARAPACE: 0, BRANCHIO: 1, STERNUM: 2, FACE: 3, BUCCAL: 4, EYESTALK: 5, CORNEA: 6, MXP: 7, ABDOMEN: 8,
  CHELA_ARM: 9, PALM: 10, FINGER: 11, LEG_PROX: 12, MERUS: 13, LEG_DIST: 14, DACTYL: 15, SETA: 17,
};

/** resolution per LOD: carapace grid, tube radial / ring density, setae */
const RES = [
  { carT: 168, carS: 96, radial: 22, ringK: 70, setae: 1, teeth: true },
  { carT: 76, carS: 44, radial: 12, ringK: 30, setae: 0, teeth: false },
  { carT: 30, carS: 16, radial: 6, ringK: 12, setae: 0, teeth: false },
];

class MeshBuilder {
  constructor() {
    this.p = []; this.n = []; this.uv = []; this.loc = []; this.info = []; this.si = []; this.idx = [];
  }
  get count() { return this.p.length / 3; }
  vert(p, n, u, v, loc, info, bone) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v);
    this.loc.push(loc.x, loc.y, loc.z); this.info.push(info[0], info[1], info[2], info[3]); this.si.push(bone);
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  build() {
    const g = new BufferGeometry();
    const n = this.count;
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aLocal', new BufferAttribute(new Float32Array(this.loc), 3));
    g.setAttribute('aInfo', new BufferAttribute(new Float32Array(this.info), 4));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = this.si[i]; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
    g.setIndex(n > 65535 ? new BufferAttribute(new Uint32Array(this.idx), 1) : new BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    return g;
  }
}

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _d = new Vector3(), _e = new Vector3();
const _nm = new Matrix3();

/**
 * A parametric patch P(i, j) on a (rows+1) × (cols+1) grid, normals from the grid's own neighbours (so the
 * shading follows the final, displaced surface), transformed by the bone's bind matrix.
 * fn(u, v, out, inside) fills `out` (bone-local position) and, optionally, `inside` with a point the surface wraps
 * around (normals are turned to face away from it and every triangle is wound to agree with its normals);
 * it returns per-vertex info [part, limb·10+segment, membrane, thin].
 */
function patch(B, { rows, cols, fn, bone, wrapCols = false }) {
  const M = sharedRig().bind[bone];
  _nm.getNormalMatrix(M);
  const W = cols + 1, H = rows + 1;
  const P = new Array(W * H), I = new Array(W * H), C = new Array(W * H), N = new Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const o = new Vector3(), c = new Vector3(NaN, 0, 0);
    I[j * W + i] = fn(i / cols, j / rows, o, c);
    P[j * W + i] = o;
    C[j * W + i] = c;
  }
  const at = (i, j) => P[clamp(j, 0, H - 1) * W + (wrapCols ? ((i % cols) + cols) % cols : clamp(i, 0, W - 1))];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = P[j * W + i];
    // central differences on the grid
    _a.subVectors(at(i + 1, j), at(i - 1, j));
    _b.subVectors(at(i, j + 1), at(i, j - 1));
    _c.crossVectors(_a, _b);
    if (_c.lengthSq() < 1e-14) {
      // a pole: average the ring next to it
      const jj = j === 0 ? 1 : H - 2;
      _c.set(0, 0, 0);
      for (let k = 0; k < cols; k++) {
        _a.subVectors(at(k + 1, jj), at(k - 1, jj));
        _b.subVectors(at(k, jj + 1), at(k, jj - 1));
        _c.add(_d.crossVectors(_a, _b));
      }
    }
    const n = _c.clone().normalize();
    const c = C[j * W + i];
    if (!Number.isNaN(c.x) && n.dot(_e.subVectors(p, c)) < 0) n.negate();
    N[j * W + i] = n;
  }
  const base = B.count;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const wp = _d.copy(P[k]).applyMatrix4(M);
    const wn = _e.copy(N[k]).applyMatrix3(_nm).normalize();
    B.vert(wp, wn, i / cols, j / rows, P[k], I[k], bone);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const ka = j * W + i, kb = ka + 1, kc = ka + W, kd = kc + 1;
    const a = base + ka, b = base + kb, c = base + kc, d = base + kd;
    // wind each quad so its face normal agrees with the vertex normals (front faces outward)
    _a.subVectors(P[kc], P[ka]); _b.subVectors(P[kb], P[ka]);
    _c.crossVectors(_a, _b);
    if (_c.lengthSq() < 1e-16) { _a.subVectors(P[kd], P[kb]); _b.subVectors(P[kc], P[kb]); _c.crossVectors(_b, _a); }
    const avg = _d.copy(N[ka]).add(N[kb]).add(N[kc]).add(N[kd]);
    if (_c.dot(avg) >= 0) { B.tri(a, c, b); B.tri(b, c, d); } else { B.tri(a, b, c); B.tri(b, d, c); }
  }
}

/** superellipse direction: (cos, sin) → exponent-shaped */
const se = (c, n) => Math.sign(c) * Math.pow(Math.abs(c), 2 / n);

/**
 * A limb segment along the bone's +X from x0 to x1 (CW), with rounded closed ends.
 * section(t, th) → { cy, cz, ry, rz, n, dr } (t: 0..1 along x0..x1; th: angle, 0 = +Z, π/2 = +Y)
 * capA / capB: length of the rounded ends (CW). Normals come from the grid (outward).
 */
function tube(B, { bone, x0, x1, radial, rings, section, info, capA = 0.02, capB = 0.02, roll = 0 }) {
  patch(B, {
    rows: rings, cols: radial, bone, wrapCols: true,
    fn: (u, v, o, inside) => { tubePoint({ x0, x1, section, capA, capB, roll }, v, u * TAU, o, inside); return info(v, u * TAU); },
  });
}

/** the surface point of a tube at (t, th) — shared by the mesh and by anything that must sit on it (setae) */
function tubePoint({ x0, x1, section, capA = 0.02, capB = 0.02, roll = 0 }, t, th, o, inside = null) {
  const L = x1 - x0;
  const ca = Math.min(0.45, capA / L), cb = Math.min(0.45, capB / L);
  const s = section(t, th);
  let m = 1;
  if (t < ca) m = Math.sqrt(Math.max(0, 1 - (1 - t / ca) ** 2));
  else if (t > 1 - cb) m = Math.sqrt(Math.max(0, 1 - ((t - (1 - cb)) / cb) ** 2));
  m = Math.max(m, 0.002);
  const c = Math.cos(th), sn = Math.sin(th), n = s.n ?? 2;
  const dr = s.dr ?? 0;
  let y = (s.ry * se(sn, n) + dr * sn) * m, z = (s.rz * se(c, n) + dr * c) * m;
  if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll); const yy = y * cr - z * sr; z = y * sr + z * cr; y = yy; }
  // the inside point for orienting normals: on the axis, pulled back inside the rounded ends
  if (inside) inside.set(x0 + clamp(t, Math.min(ca, 0.5), Math.max(1 - cb, 0.5)) * L, s.cy, s.cz);
  return o.set(x0 + t * L, s.cy + y, s.cz + z);
}

// --------------------------------------------------------------------------------------------- carapace

/** plan outline (left half, x ≥ 0), from the front midline round to the posterior midline (plate 009) */
const OUTLINE = [
  [0, 0.432], [0.04, 0.43], [0.066, 0.424], [0.085, 0.405], [0.13, 0.397], [0.22, 0.392], [0.29, 0.384], [0.34, 0.37],
  [0.38, 0.345], [0.42, 0.29], [0.455, 0.21], [0.483, 0.11], [0.498, 0.0], [0.5, -0.07], [0.487, -0.17], [0.45, -0.27],
  [0.39, -0.35], [0.32, -0.395], [0.25, -0.415], [0.12, -0.422], [0, -0.424],
];

let OUTLINE_POLY = null;
/** dense, smoothed outline (centripetal Catmull–Rom), mirrored to the full closed loop */
function outlinePoly() {
  if (OUTLINE_POLY) return OUTLINE_POLY;
  const half = [];
  const pts = OUTLINE;
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
    for (let s = 0; s < 16; s++) {
      const t = s / 16, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      half.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  half.push(pts[pts.length - 1]);
  OUTLINE_POLY = half;
  return half;
}

/** outline radius along a direction θ (0 = +Z front, π/2 = +X left), by ray–polyline intersection */
export function outlineRadius(th) {
  const poly = outlinePoly();
  const dx = Math.abs(Math.sin(th)), dz = Math.cos(th);
  let best = 0.45;
  for (let k = 0; k < poly.length - 1; k++) {
    const [ax, az] = poly[k], [bx, bz] = poly[k + 1];
    const ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const s = (ax * ez - az * ex) / den;
    const u = (ax * dz - az * dx) / den;
    if (s > 0 && u >= -1e-6 && u <= 1 + 1e-6) { best = s; break; }
  }
  return best;
}

/** height of the dorsal girth (the "margin") around the outline: front highest, posterior lowest [P] */
function marginY(th) {
  const c = Math.cos(th);
  return CARAPACE.marginY + 0.07 * smoothstep(0.55, 1, c) - 0.05 * smoothstep(0.2, 1, -c);
}

/**
 * Carapace + cephalothorax as one closed surface over (θ, s): θ around the vertical axis, s from the dorsal pole
 * (s = 0) through the girth (s = .5) to the sternum (s = 1). Upper half a superellipse dome; lower half boxy at the
 * front (the face drops to the mouth) and rounder at the sides (branchiostegites curving in to the sternum).
 */
function carapaceFn(u, v, o, inside) {
  inside.set(0, 0.26, 0);
  const th = u * TAU;
  const R = outlineRadius(th);
  const c = Math.cos(th), sn = Math.sin(th);
  const front = smoothstep(0.55, 1, c), back = smoothstep(0.3, 1, -c);
  const H = CARAPACE.height, ym = marginY(th);
  let rho, y;
  const phi = Math.PI * v;
  if (v <= 0.5) {
    // dome: blunter toward the front (deflexed front, eyes on the rim)
    const nu = 1.95 + 0.55 * front - 0.12 * back;
    rho = Math.pow(Math.sin(phi), 2 / nu);
    y = ym + (H - ym) * Math.pow(Math.max(0, Math.cos(phi)), 2 / nu);
  } else {
    const nl = 2.4 + 3.4 * front + 0.5 * back;
    const k = Math.pow(Math.sin(phi), 2 / nl);
    // the branchiostegites tuck in toward the sternum; the face does not
    const inset = 1 - (1 - CARAPACE.ventralInset) * (1 - front) * smoothstep(0.55, 1, v);
    rho = k * inset;
    y = ym * (1 - Math.pow(Math.abs(Math.cos(phi)), 2 / nl));
  }
  let x = rho * R * sn, z = rho * R * c;
  // ---- regional relief (silhouette scale only; grooves and granules are in the material)
  const ax = Math.abs(x);
  const dorsal = v < 0.5 ? 1 : 0;
  const g = (cx, cz, r) => Math.exp(-(((ax - cx) ** 2 + (z - cz) ** 2) / (r * r)));
  let dy = 0;
  // branchial swellings (globose flanks), gastric and cardiac bosses
  dy += dorsal * (0.022 * g(0.27, -0.1, 0.19) + 0.012 * g(0, 0.13, 0.16) + 0.008 * g(0, -0.2, 0.1));
  // H-shaped mesogastric depression between the bosses, faint at this scale
  dy -= dorsal * 0.006 * g(0, -0.04, 0.07);
  // orbital grooves: a channel along the anterior rim where the eyestalk folds down (001, 009)
  const orb = smoothstep(0.07, 0.11, ax) * (1 - smoothstep(0.33, 0.4, ax)) * smoothstep(0.33, 0.39, z) * smoothstep(0.32, 0.47, v) * (1 - smoothstep(0.52, 0.6, v));
  // front: narrow, deflexed lobe with a median furrow
  const frontLobe = (1 - smoothstep(0.05, 0.075, ax)) * smoothstep(0.36, 0.42, z);
  // buccal frame: the face recess where the third maxillipeds sit
  const bx = 1 - smoothstep(0.14, 0.22, ax);
  const byw = smoothstep(0.04, 0.1, y) * (1 - smoothstep(0.3, 0.36, y));
  const buccal = bx * byw * smoothstep(0.8, 0.97, c) * (v > 0.5 ? 1 : 0);
  // displacement: along the (approximate) outward normal of the base shape
  const nx = sn * (v <= 0.5 ? Math.sin(phi) : 1), nz = c * (v <= 0.5 ? Math.sin(phi) : 1), ny = v <= 0.5 ? Math.cos(phi) * 1.3 : -Math.abs(Math.cos(phi));
  const nl = Math.hypot(nx, ny, nz) || 1;
  const disp = dy - 0.024 * orb + 0.008 * frontLobe * dorsal - 0.018 * buccal;
  x += (nx / nl) * disp; z += (nz / nl) * disp; y += (ny / nl) * disp * (dorsal ? 1 : 0.4) + (dorsal ? dy * 0.4 : 0);
  // the front lobe bends down between the eyes
  if (frontLobe > 0 && v < 0.6) y -= 0.02 * frontLobe * smoothstep(0.38, 0.43, z);
  o.set(x, y, z);
  // part: dorsal carapace, lateral wall (branchiostegite / pterygostomial), face, buccal cavity, sternum
  let part = PART.CARAPACE;
  if (v > 0.5) part = c > 0.8 && y > 0.05 ? PART.FACE : (v > 0.8 ? PART.STERNUM : PART.BRANCHIO);
  else if (v > 0.44) part = c > 0.8 ? PART.FACE : PART.BRANCHIO;
  return [part, 0, orb, 0];
}

function buildCarapace(B, res) {
  const body = sharedRig().index.get('Body');
  patch(B, { rows: res.carS, cols: res.carT, bone: body, wrapCols: true, fn: carapaceFn });
}

// --------------------------------------------------------------------------------------------- eyestalks

function buildEyes(B, res) {
  const rig = sharedRig();
  SIDES.forEach(({ id }, k) => {
    const base = rig.index.get(`EyeStalk_${id}`), dist = rig.index.get(`EyeStalk_${id}_Distal`);
    const radial = Math.max(6, Math.round(res.radial * 0.8));
    const limb = 10 + k;
    // basal article: short, wider
    tube(B, {
      bone: base, x0: -0.03, x1: EYE.baseLen + 0.008, radial, rings: Math.max(3, Math.round(res.ringK * 0.12)),
      section: (t) => ({ cy: 0, cz: 0, ry: EYE.baseR * (1 - 0.15 * t), rz: EYE.baseR * (1 - 0.15 * t) }),
      info: () => [PART.EYESTALK, limb * 10, 0, 0.6], capA: 0.02, capB: 0.012,
    });
    // stalk + terminal cornea (club-shaped), slightly curved forward at the tip
    const len = EYE.stalkLen + EYE.corneaLen;
    tube(B, {
      bone: dist, x0: -0.006, x1: len, radial, rings: Math.max(5, Math.round(res.ringK * 0.36)),
      section: (t) => {
        const x = -0.006 + t * (len + 0.006);
        const cs = smoothstep(EYE.stalkLen - 0.03, EYE.stalkLen + 0.02, x);
        const r = EYE.stalkR0 + (EYE.stalkR1 - EYE.stalkR0) * (x / EYE.stalkLen) + (EYE.corneaR - EYE.stalkR1) * cs * (1 - smoothstep(len - 0.035, len, x) * 0.2);
        return { cy: 0.006 * smoothstep(EYE.stalkLen * 0.5, len, x), cz: 0, ry: r, rz: r };
      },
      info: () => [PART.EYESTALK, limb * 10 + 1, 0, 0.7],
      capA: 0.01, capB: 0.03,
    });
  });
}

// --------------------------------------------------------------------------------------------- mouthparts

function buildMxp(B, res) {
  const rig = sharedRig();
  const n = Math.max(6, Math.round(res.radial * 0.9)), m = Math.max(4, Math.round(res.radial * 0.6));
  SIDES.forEach(({ id }, k) => {
    const bone = rig.index.get(`Mxp3_${id}`);
    const W = MXP3.width, H = MXP3.height, T = MXP3.thick;
    // outline in (x from the hinge to the midline, z along the hinge): the medial upper corner is rounded away so
    // the pair reads as a heart with a cleft on top (002–005)
    const outline = (a) => {
      const c = Math.cos(a), s = Math.sin(a);
      const rx = 0.5 * W, rz = 0.5 * H;
      let px = rx + rx * se(c, 3.2), pz = rz * se(s, 3.2);
      // upper-medial corner (x large, z large) rounded off
      const cut = smoothstep(0.2, 0.9, c) * smoothstep(0.2, 0.9, s);
      px -= 0.03 * cut; pz -= 0.025 * cut;
      return [px, pz];
    };
    for (const face of [1, -1]) {
      patch(B, {
        rows: m, cols: n * 2, bone, wrapCols: true,
        fn: (u, v, o, inside) => {
          const a = u * TAU, r = 1 - v;
          const [px, pz] = outline(a);
          const cx = 0.5 * W, x = cx + (px - cx) * r, z = pz * r;
          const dome = Math.sqrt(Math.max(0, 1 - r * r));
          const y = face > 0 ? T * (0.15 + 0.85 * dome) : -0.004 - 0.006 * dome;
          o.set(x, y, z);
          inside.set(x, y - face, z);
          return [PART.MXP, (12 + k) * 10, 0, 0.3];
        },
      });
    }
  });
}

function buildAbdomen(B, res) {
  const rig = sharedRig();
  for (const sex of ['m', 'f']) {
    const bone = rig.index.get(sex === 'm' ? 'Abdomen_M' : 'Abdomen_F');
    const A = sex === 'm' ? ABDOMEN.male : ABDOMEN.female;
    const rows = Math.max(3, Math.round(res.radial * 0.6)), cols = Math.max(4, res.radial);
    patch(B, {
      rows, cols, bone,
      fn: (u, v, o, inside) => {
        const zz = v * A.length;                          // forward from the posterior margin
        const w = (A.width0 + (A.width1 - A.width0) * v) * 0.5 * (sex === 'm' ? 1 - 0.35 * smoothstep(0.75, 1, v) : Math.sqrt(Math.max(0.05, 1 - Math.pow(Math.max(0, v - 0.55) / 0.45, 2))));
        const x = (u * 2 - 1) * w;
        const bulge = 0.012 * (1 - (u * 2 - 1) ** 2);
        o.set(x, -bulge, zz);
        inside.set(x, 1, zz);
        return [PART.ABDOMEN, 140, 0, 0.2];
      },
    });
  }
}

// --------------------------------------------------------------------------------------------- chelipeds

const N_TEETH = 13;

/** cheliped merus: stout, trigonal, its upper margin granular (the material); the inner face carries a tympanum */
function chelaMerusSection(t, th) {
  const p = Math.sin(Math.PI * clamp(t * 0.85 + 0.12, 0, 1));
  const tri = 1 + 0.12 * Math.cos(3 * th - Math.PI / 2);
  return { cy: 0.01 * p, cz: 0, ry: (0.05 + 0.028 * p) * tri, rz: (0.034 + 0.012 * p) * tri, n: 2.2 };
}

/** propodus: the palm (inflated, oval) drawn out into the long fixed finger, denticles on its cutting edge */
function chelaPropodusSection(t, th, res) {
  const C = CHELIPED;
  const PL = C.palm + C.finger;
  const x = -0.012 + t * (PL + 0.012);
  const f = smoothstep(C.palm - 0.05, C.palm + 0.03, x);               // 0 palm … 1 finger
  const pt = clamp(x / C.palm, 0, 1);
  const palmRy = C.palmH * 0.5 * (0.72 + 0.28 * Math.sin(Math.PI * clamp(pt * 0.9 + 0.1, 0, 1)));
  const palmRz = C.palmW * 0.5 * (0.75 + 0.25 * Math.sin(Math.PI * clamp(pt * 0.85 + 0.15, 0, 1)));
  const ft = clamp((x - C.palm) / C.finger, 0, 1);
  const taper = Math.pow(1 - ft, 0.85) * (1 - 0.15 * ft);
  const fRy = C.fingerH * 0.5 * (0.08 + 0.92 * taper), fRz = C.fingerW * 0.5 * (0.1 + 0.9 * taper);
  // the finger leaves the palm along its lower half and bows down a little toward the tip
  const fCy = -C.palmH * 0.24 - 0.022 * ft * ft;
  let dr = 0;
  if (res.teeth && f > 0.5 && ft < 0.93) {
    const up = Math.max(0, Math.sin(th));
    dr = 0.0055 * Math.pow(up, 10) * (0.5 + 0.5 * Math.cos(TAU * N_TEETH * ft)) * (1 - ft);
  }
  return { cy: f * fCy, cz: 0.004 * f, ry: palmRy * (1 - f) + fRy * f, rz: palmRz * (1 - f) + fRz * f, n: 2.1 - 0.2 * f, dr };
}


function buildChelipeds(B, res) {
  const rig = sharedRig();
  const C = CHELIPED;
  SIDES.forEach(({ id }, k) => {
    const bi = (s) => rig.index.get(`Cheliped_${id}_${s}`);
    const limb = 8 + k;
    const radial = res.radial, rk = res.ringK;
    const rings = (len) => Math.max(3, Math.round(rk * len * 1.1));
    const membrane = (t, L, a = 0.03) => 1 - smoothstep(0, a / L, t);
    tube(B, { bone: bi('Coxa'), x0: -0.035, x1: C.coxa + 0.01, radial, rings: rings(0.09), section: () => ({ cy: 0, cz: 0, ry: 0.05, rz: 0.05 }), info: () => [PART.CHELA_ARM, limb * 10, 0, 0.2] });
    tube(B, { bone: bi('Basis'), x0: -0.012, x1: C.basis + 0.008, radial, rings: rings(0.06), section: () => ({ cy: 0, cz: 0, ry: 0.046, rz: 0.044 }), info: (t) => [PART.CHELA_ARM, limb * 10 + 1, membrane(t, 0.07), 0.2] });
    tube(B, { bone: bi('Ischium'), x0: -0.01, x1: C.ischium + 0.01, radial, rings: rings(0.06), section: (t) => ({ cy: 0, cz: 0, ry: 0.05 + 0.02 * t, rz: 0.042 }), info: () => [PART.CHELA_ARM, limb * 10 + 2, 0, 0.2] });
    // merus: stout, trigonal, its upper margin granular (material)
    tube(B, {
      bone: bi('Merus'), x0: -0.015, x1: C.merus + 0.012, radial, rings: rings(C.merus),
      section: chelaMerusSection,
      info: (t) => [PART.CHELA_ARM, limb * 10 + 3, membrane(t, C.merus), 0.15], capA: 0.03, capB: 0.035,
    });
    tube(B, {
      bone: bi('Carpus'), x0: -0.014, x1: C.carpus + 0.014, radial, rings: rings(C.carpus),
      section: (t) => { const p = Math.sin(Math.PI * clamp(t * 0.8 + 0.15, 0, 1)); return { cy: 0.004, cz: 0, ry: 0.044 + 0.022 * p, rz: 0.036 + 0.016 * p }; },
      info: (t) => [PART.CHELA_ARM, limb * 10 + 4, membrane(t, C.carpus), 0.15], capA: 0.03, capB: 0.03,
    });
    // propodus: inflated palm drawn out into the long fixed finger (ventral), denticles on its cutting edge
    const PL = C.palm + C.finger;
    const nT = N_TEETH;
    tube(B, {
      bone: bi('Propodus'), x0: -0.012, x1: PL, radial: Math.round(radial * 1.25), rings: rings(PL) + 4,
      section: (t, th) => chelaPropodusSection(t, th, res),
      info: (t) => [PART.PALM, limb * 10 + 5, membrane(t, PL, 0.02), 0.1],
      capA: 0.03, capB: 0.012,
    });
    // dactylus (movable finger): hinged at the palm's distal dorsal corner, curving down to cross the fixed tip
    tube(B, {
      bone: bi('Dactylus'), x0: -0.014, x1: C.dactylus, radial, rings: rings(C.dactylus) + 4,
      section: (t, th) => {
        const x = -0.014 + t * (C.dactylus + 0.014);
        const ft = clamp(x / C.dactylus, 0, 1);
        let dr = 0;
        if (res.teeth && ft > 0.08 && ft < 0.92) {
          const down = Math.max(0, -Math.sin(th));
          dr = 0.005 * Math.pow(down, 10) * (0.5 + 0.5 * Math.cos(TAU * (nT - 1) * ft + 1.3)) * (1 - ft);
        }
        const taper = Math.pow(1 - ft, 0.85) * (1 - 0.15 * ft);
        return { cy: -0.032 * ft * ft, cz: 0.003 * ft, ry: C.fingerH * 0.5 * (0.08 + 0.97 * taper), rz: C.fingerW * 0.5 * (0.1 + 0.9 * taper), n: 2, dr };
      },
      info: () => [PART.FINGER, limb * 10 + 6, 0, 0.1], capA: 0.022, capB: 0.01,
    });
  });
}

// --------------------------------------------------------------------------------------------- walking legs

/**
 * The seven segments of a walking leg as tube specs (bone-local). Meri, carpi and propodi are laterally
 * compressed: tall in Y (their broad faces look forward and back, ±Z), thin in Z; each merus carries the faint
 * hollow of its tympanum on both faces. `roll` turns the anterior face a little upward.
 */
function legSegments(L, sign, res) {
  const roll = -(L.roll ?? 0) * sign;
  const mT = L.merusT * 0.5;
  return {
    Coxa: { x0: -0.04, x1: L.coxa + 0.008, capA: 0.03, capB: 0.012, section: (t) => ({ cy: 0, cz: 0, ry: 0.05 - 0.004 * t, rz: 0.048 }), part: PART.LEG_PROX, thin: 0.35, mem: 0 },
    Basis: { x0: -0.01, x1: L.basis + 0.006, capA: 0.01, capB: 0.01, section: () => ({ cy: 0, cz: 0, ry: 0.045, rz: 0.04 }), part: PART.LEG_PROX, thin: 0.35, mem: 0.025 },
    Ischium: { x0: -0.006, x1: L.ischium + 0.01, capA: 0.008, capB: 0.012, roll: roll * 0.5, section: (t) => ({ cy: 0, cz: 0, ry: 0.044 + 0.016 * t, rz: 0.036 - 0.004 * t, n: 2.1 }), part: PART.LEG_PROX, thin: 0.4, mem: 0 },
    Merus: {
      x0: -0.012, x1: L.merus + 0.008, capA: 0.016, capB: 0.016, roll,
      section: (t, th) => {
        const h = L.merusW * 0.5 * (0.55 + 0.45 * Math.sin(Math.PI * clamp(t * 0.8 + 0.12, 0, 1))) * (1 + 0.06 * smoothstep(0.9, 1, t));
        const w = mT * (0.8 + 0.2 * Math.sin(Math.PI * t));
        // the tympanum: an oval hollow over most of each broad face
        const ov = Math.max(0, 1 - ((t - 0.5) / 0.36) ** 2) * Math.max(0, 1 - (Math.sin(th) / 0.74) ** 2);
        const hollow = res.teeth ? 0.0026 * ov : 0;
        return { cy: 0, cz: 0, ry: h, rz: w - hollow * Math.abs(Math.cos(th)), n: 2.3 };
      },
      part: PART.MERUS, thin: 0.55, mem: 0.025,
    },
    Carpus: { x0: -0.012, x1: L.carpus + 0.008, capA: 0.012, capB: 0.012, roll: roll * 0.8, section: (t) => ({ cy: 0.003 * t, cz: 0, ry: 0.03 + 0.012 * t, rz: 0.023 + 0.002 * t, n: 2.2 }), part: PART.LEG_DIST, thin: 0.6, mem: 0.025 },
    Propodus: { x0: -0.01, x1: L.propodus + 0.006, capA: 0.01, capB: 0.01, roll: roll * 0.6, section: (t) => ({ cy: 0, cz: 0, ry: 0.029 - 0.005 * t + 0.003 * smoothstep(0.85, 1, t), rz: 0.019 - 0.003 * t, n: 2.2 }), part: PART.LEG_DIST, thin: 0.65, mem: 0.025 },
    // dactylus: long, lanceolate, sharp; legs 1–3 curve a little ventrally, the last one less (S. sheni) [R]
    Dactylus: {
      x0: -0.008, x1: L.dactylus, capA: 0.012, capB: 0.004, roll: roll * 0.4,
      section: (t) => {
        const lance = (0.8 + 0.6 * Math.sin(Math.PI * clamp(t * 1.1 + 0.05, 0, 1))) * (1 - t ** 1.6);
        return { cy: -(L.name === 4 ? 0.008 : 0.018) * t * t, cz: 0, ry: 0.021 * lance + 0.0006, rz: 0.016 * lance + 0.0006, n: 2 };
      },
      part: PART.DACTYL, thin: 0.75, mem: 0.02,
    },
  };
}

function buildLegs(B, res) {
  const rig = sharedRig();
  SIDES.forEach(({ id, sign }, sk) => {
    LEGS.forEach((L, li) => {
      const limb = sk * 4 + li;
      const specs = legSegments(L, sign, res);
      for (const seg of SEGMENTS) {
        const sp = specs[seg];
        const len = sp.x1 - sp.x0;
        const radial = seg === 'Merus' ? Math.round(res.radial * 1.15) : seg === 'Dactylus' ? Math.max(5, res.radial - 2) : res.radial;
        const rings = Math.max(3, Math.round(res.ringK * len)) + (seg === 'Merus' || seg === 'Dactylus' ? 2 : 1);
        tube(B, {
          bone: rig.index.get(`Leg_${id}${L.name}_${seg}`), ...sp, radial, rings,
          info: (t) => [sp.part, limb * 10 + SEGMENTS.indexOf(seg), sp.mem ? 1 - smoothstep(0, sp.mem / len, t) : 0, sp.thin],
        });
      }
    });
  });
}

// --------------------------------------------------------------------------------------------- setae

/**
 * Setae: fine tapered hairs along the leg margins (dense fringes on the propodus and carpus, sparse long ones on
 * the merus; 007–009, 063), on the palm, the maxillipeds' inner margins and the carapace rim. Two crossed ribbons
 * each, skinned to their segment. Close-up level only — farther away the material carries a hint of them.
 */
function buildSetae(B) {
  const rig = sharedRig();
  const rand = mulberry(0x5e7a);
  const res = RES[0];
  const p0 = new Vector3(), p1 = new Vector3(), p2 = new Vector3();
  const seta = (bone, root, dir, len, width, limb) => {
    const M = rig.bind[bone];
    _nm.getNormalMatrix(M);
    // two crossed ribbons; the strand droops distally (+X) as it grows
    const side = new Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize();
    const side2 = new Vector3().crossVectors(dir, side).normalize();
    const segs = 3;
    for (const sd of [side, side2]) {
      const base = B.count;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const p = new Vector3().copy(root).addScaledVector(dir, len * t);
        p.x += 0.12 * len * t * t;
        const w = width * (1 - 0.92 * t);
        for (const k of [-1, 1]) {
          const q = p.clone().addScaledVector(sd, k * w * 0.5);
          const n = new Vector3().crossVectors(sd, dir).normalize();
          B.vert(q.clone().applyMatrix4(M), n.applyMatrix3(_nm).normalize(), t, k * 0.5 + 0.5, q, [PART.SETA, limb, t, 1], bone);
        }
      }
      for (let s = 0; s < segs; s++) {
        const a = base + s * 2;
        B.tri(a, a + 2, a + 1); B.tri(a + 1, a + 2, a + 3);
      }
    }
  };
  /** setae standing out of a tube's surface at angle th, spread over t0..t1, leaning distally by `tilt` */
  const fringe = (bone, spec, t0, t1, th, count, lenR, limb, tilt = 0.7, width = 0.0042) => {
    for (let i = 0; i < count; i++) {
      const t = t0 + (t1 - t0) * (i + 0.25 + 0.5 * rand()) / count;
      const a = th + (rand() - 0.5) * 0.35;
      tubePoint(spec, t, a, p0);
      tubePoint(spec, t, a + 0.02, p1).sub(p0);
      tubePoint(spec, Math.min(1, t + 0.01), a, p2).sub(p0);
      const n = new Vector3().crossVectors(p1, p2).normalize();
      if (n.dot(new Vector3(0, p0.y, p0.z)) < 0) n.negate();
      const dir = n.multiplyScalar(1 - tilt).add(new Vector3(tilt, (rand() - 0.5) * 0.25, (rand() - 0.5) * 0.25)).normalize();
      seta(bone, p0.clone().addScaledVector(n, -0.002), dir, lenR[0] + (lenR[1] - lenR[0]) * rand(), width, limb);
    }
  };
  SIDES.forEach(({ id, sign }, sk) => {
    LEGS.forEach((L, li) => {
      const specs = legSegments(L, sign, res);
      const bi = (s) => rig.index.get(`Leg_${id}${L.name}_${s}`);
      const limb = sk * 4 + li;
      const UP = Math.PI / 2, DOWN = -Math.PI / 2;
      // merus: sparse long setae on both margins
      fringe(bi('Merus'), specs.Merus, 0.12, 0.92, UP, 5, [0.04, 0.09], limb * 10 + 3, 0.55);
      fringe(bi('Merus'), specs.Merus, 0.12, 0.92, DOWN, 6, [0.05, 0.1], limb * 10 + 3, 0.55);
      // carpus and propodus: dense fringes (063)
      fringe(bi('Carpus'), specs.Carpus, 0.1, 0.9, UP, 4, [0.04, 0.08], limb * 10 + 4);
      fringe(bi('Carpus'), specs.Carpus, 0.1, 0.9, DOWN, 6, [0.05, 0.1], limb * 10 + 4);
      fringe(bi('Propodus'), specs.Propodus, 0.08, 0.92, UP, 9, [0.05, 0.1], limb * 10 + 5);
      fringe(bi('Propodus'), specs.Propodus, 0.08, 0.92, DOWN, 11, [0.06, 0.12], limb * 10 + 5);
      // dactylus: two rows of short setae
      fringe(bi('Dactylus'), specs.Dactylus, 0.08, 0.6, UP, 4, [0.02, 0.04], limb * 10 + 6, 0.85);
      fringe(bi('Dactylus'), specs.Dactylus, 0.08, 0.6, DOWN, 4, [0.02, 0.04], limb * 10 + 6, 0.85);
    });
    // water-wicking tufts between the bases of the first two walking legs (S. intermedia) [R]
    const cox = rig.index.get(`Leg_${id}1_Coxa`);
    for (let i = 0; i < 9; i++) {
      const root = new Vector3(0.02 + 0.03 * rand(), -0.04 - 0.01 * rand(), -sign * (0.04 + 0.02 * rand()));
      seta(cox, root, new Vector3(0.2, -1, (rand() - 0.5) * 0.4).normalize(), 0.035 + 0.03 * rand(), 0.004, sk * 40);
    }
    const ci = (s) => rig.index.get(`Cheliped_${id}_${s}`);
    const C = CHELIPED;
    const merusSpec = { x0: -0.015, x1: C.merus + 0.012, capA: 0.03, capB: 0.035, section: chelaMerusSection };
    fringe(ci('Merus'), merusSpec, 0.15, 0.85, Math.PI / 2, 6, [0.03, 0.06], (8 + sk) * 10 + 3, 0.6);
    const propSpec = { x0: -0.012, x1: C.palm + C.finger, capA: 0.03, capB: 0.012, section: (t, th) => chelaPropodusSection(t, th, res) };
    const palmEnd = (C.palm + 0.012) / (C.palm + C.finger + 0.012);
    fringe(ci('Propodus'), propSpec, 0.12, palmEnd * 0.9, Math.PI / 2, 5, [0.025, 0.05], (8 + sk) * 10 + 5, 0.6);
    fringe(ci('Propodus'), propSpec, palmEnd, palmEnd + (1 - palmEnd) * 0.6, -Math.PI / 2, 4, [0.02, 0.035], (8 + sk) * 10 + 5, 0.8, 0.0035);
    // third maxillipeds: a dense fringe on the medial margin
    const mb = rig.index.get(`Mxp3_${id}`);
    for (let i = 0; i < 12; i++) {
      const z = -MXP3.height * 0.42 + (MXP3.height * 0.8 * (i + rand() * 0.6)) / 12;
      seta(mb, new Vector3(MXP3.width * 0.97, 0.004, z), new Vector3(0.75, 0.4, (rand() - 0.5) * 0.3).normalize(), 0.02 + 0.02 * rand(), 0.0035, (12 + sk) * 10);
    }
  });
  // carapace: short setae along the anterolateral rim and the front
  const body = rig.index.get('Body');
  for (let i = 0; i < 28; i++) {
    const s = rand() < 0.5 ? 1 : -1;
    const th = s * (0.35 + 1.0 * rand());
    const R = outlineRadius(th);
    const root = new Vector3(Math.sin(th) * R * 0.99, marginY(th) + 0.005, Math.cos(th) * R * 0.99);
    const dir = new Vector3(Math.sin(th), 0.5, Math.cos(th)).normalize();
    seta(body, root, dir, 0.02 + 0.025 * rand(), 0.0035, 150);
  }
}

// --------------------------------------------------------------------------------------------- assembly

const CACHE = new Map();

/**
 * Shared geometry for a LOD (0 close-up, 1 near, 2 far). Never disposed (all crabs share it).
 * @returns {{ body: BufferGeometry, setae: BufferGeometry | null }}
 */
export function crabGeometry(lod) {
  if (CACHE.has(lod)) return CACHE.get(lod);
  const res = RES[lod];
  const B = new MeshBuilder();
  buildCarapace(B, res);
  buildEyes(B, res);
  buildMxp(B, res);
  buildAbdomen(B, res);
  buildChelipeds(B, res);
  buildLegs(B, res);
  const body = B.build();
  body.name = `ScopimeraGlobosa_LOD${lod}`;
  let setae = null;
  if (res.setae) {
    const S = new MeshBuilder();
    buildSetae(S);
    setae = S.build();
    setae.name = `ScopimeraGlobosa_setae_LOD${lod}`;
  }
  const out = { body, setae };
  CACHE.set(lod, out);
  return out;
}

/** triangle counts (debug / docs) */
export function crabTriangles(lod) {
  const g = crabGeometry(lod);
  return (g.body.index.count + (g.setae ? g.setae.index.count : 0)) / 3;
}

export { hash01, SEGMENTS };
