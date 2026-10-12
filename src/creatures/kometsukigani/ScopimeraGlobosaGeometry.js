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

/** smooth 2D value noise in [-1, 1] on a seeded lattice (small irregularities of the cuticle) */
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash01(a, b, seed) * 2 - 1;
  return (h(ix, iy) * (1 - ux) + h(ix + 1, iy) * ux) * (1 - uy) + (h(ix, iy + 1) * (1 - ux) + h(ix + 1, iy + 1) * ux) * uy;
}

/** superellipse direction: (cos, sin) → exponent-shaped */
const se = (c, n) => Math.sign(c) * Math.pow(Math.abs(c), 2 / n);

/**
 * A limb segment along the bone's +X from x0 to x1 (CW), with rounded closed ends.
 * section(t, th) → { cy, cz, ry, rz, n, dr } (t: 0..1 along x0..x1; th: angle, 0 = +Z, π/2 = +Y)
 * capA / capB: length of the rounded ends (CW). Normals come from the grid (outward).
 */
function tube(B, { bone, x0, x1, radial, rings, section, info, capA = 0.02, capB = 0.02, roll = 0, twist = 0 }) {
  // rings: evenly along the body, and a few more on each rounded end, spaced by angle so the ends are round
  // domes and rims rather than a facet or two (a segment's end is where the eye goes at a joint)
  const L = x1 - x0;
  const ca = Math.min(0.45, capA / L), cb = Math.min(0.45, capB / L);
  const K = Math.max(1, Math.round(radial / 7));
  const body = Math.max(2, rings - K);
  const rows = body + 2 * K;
  const ringT = (v) => {
    const j = v * rows;
    if (j <= K) return ca * (1 - Math.cos((Math.PI / 2) * (j / K)));
    if (j >= rows - K) return 1 - cb * (1 - Math.cos((Math.PI / 2) * ((rows - j) / K)));
    return ca + (1 - ca - cb) * ((j - K) / body);
  };
  patch(B, {
    rows, cols: radial, bone, wrapCols: true,
    fn: (u, v, o, inside) => { const t = ringT(v); tubePoint({ x0, x1, section, capA, capB, roll, twist }, t, u * TAU, o, inside); return info(t, u * TAU); },
  });
}

/** the surface point of a tube at (t, th) — shared by the mesh and by anything that must sit on it (setae) */
function tubePoint({ x0, x1, section, capA = 0.02, capB = 0.02, roll = 0, twist = 0 }, t, th, o, inside = null) {
  const L = x1 - x0;
  const ca = Math.min(0.45, capA / L), cb = Math.min(0.45, capB / L);
  const s = section(t, th);
  let m = 1;
  if (t < ca) m = Math.sqrt(Math.max(0, 1 - (1 - t / ca) ** 2));
  else if (t > 1 - cb) m = Math.sqrt(Math.max(0, 1 - ((t - (1 - cb)) / cb) ** 2));
  m = Math.max(m, 0.002);
  const c = Math.cos(th), sn = Math.sin(th), n = s.n ?? 2, ny = s.ny ?? n;
  const dr = s.dr ?? 0;
  // ny < n: the faces bulge less toward the fore and aft margins — a lens, thin-edged like a real flattened segment
  let y = (s.ry * se(sn, ny) + dr * sn) * m, z = (s.rz * se(c, n) + dr * c) * m;
  // roll: the segment's turn about its axis; twist: the turn growing along it (the cuticle is never a straight prism)
  const rl = roll + twist * (t - 0.5);
  if (rl) { const cr = Math.cos(rl), sr = Math.sin(rl); const yy = y * cr - z * sr; z = y * sr + z * cr; y = yy; }
  // the inside point for orienting normals: on the axis, pulled back inside the rounded ends
  if (inside) inside.set(x0 + clamp(t, Math.min(ca, 0.5), Math.max(1 - cb, 0.5)) * L, s.cy, s.cz);
  return o.set(x0 + t * L, s.cy + y, s.cz + z);
}

// --------------------------------------------------------------------------------------------- carapace

/**
 * plan outline (left half, x ≥ 0), from the front midline round to the posterior midline, traced on the specimen
 * 009 (CW 292 px; L/W 0.82) and checked on the live crabs seen from above (057, 049, 016): a broad, rounded
 * trapezoid — wider than long, widest a little behind the middle, the front narrower than the body [P]
 */
const OUTLINE = [
  // the front: a narrow frontal lobe between the eyestalks, then the orbits sloping back to the blunt external
  // orbital angles at a half-width of 0.39 (009: 0.39 at z 0.23; 016, 049) — narrower than the carapace, wider
  // than an egg's nose
  [0, 0.41], [0.04, 0.408], [0.065, 0.399], [0.085, 0.378], [0.14, 0.362], [0.22, 0.346], [0.29, 0.322],
  [0.345, 0.288], [0.38, 0.252], [0.402, 0.222],
  // the sides: convex, diverging to the widest point a little behind the middle (009: z ≈ −0.1)
  [0.448, 0.15], [0.478, 0.04], [0.495, -0.05], [0.5, -0.12], [0.488, -0.22], [0.458, -0.3],
  // rounded posterolateral corners and a broad, nearly straight posterior margin (009: half-width 0.25)
  [0.41, -0.35], [0.34, -0.388], [0.25, -0.405], [0.12, -0.411], [0, -0.412],
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

/**
 * height of the dorsal girth (the "margin") around the outline: front highest, posterior lowest. The front margin
 * and the orbits stand almost as high as the dorsum (2.webp, 4.webp and plates 001–005: seen from the front the
 * dorsum hardly shows above the eyestalk bases, the face below is tall) [P]
 */
function marginY(th) {
  const c = Math.cos(th);
  return CARAPACE.marginY + CARAPACE.frontRise * smoothstep(0.35, 0.85, c) - 0.04 * smoothstep(0.2, 1, -c);
}

/**
 * Carapace + cephalothorax as one closed surface over (θ, s): θ around the vertical axis, s from the dorsal pole
 * (s = 0) through the girth (s = .5) to the sternum (s = 1). The crab is globose: an inflated, nearly elliptic dome
 * over the plan outline, the sides continuing round below the margin and only then curving in to the sternum; the
 * face a little fuller (blunter) than the sides but still rounded — no box, no crest (063, 049, 060, 027).
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
    const nu = 1.75 + 0.15 * front - 0.1 * back;
    rho = Math.pow(Math.sin(phi), 2 / nu);
    y = ym + (H - ym) * Math.pow(Math.max(0, Math.cos(phi)), 2 / nu);
  } else {
    const nl = 2.1 + 1.3 * front + 0.3 * back;
    const k = Math.pow(Math.sin(phi), 2 / nl);
    // the branchiostegites bulge, then tuck in toward the sternum; the face less so
    const inset = 1 - (1 - CARAPACE.ventralInset) * (1 - 0.6 * front) * smoothstep(0.62, 1, v);
    rho = k * inset;
    y = ym * (1 - Math.pow(Math.abs(Math.cos(phi)), 2 / nl));
  }
  let x = rho * R * sn, z = rho * R * c;
  // ---- regional relief (silhouette scale only; grooves and granules are in the material)
  const ax = Math.abs(x);
  const dorsal = v < 0.5 ? 1 : 0;
  const g = (cx, cz, r) => Math.exp(-(((ax - cx) ** 2 + (z - cz) ** 2) / (r * r)));
  let dy = 0;
  // the regions as low convex lobes separated by shallow furrows (4.webp seen from the front catches a highlight
  // on every lobe; 6.webp, 008): branchial, epibranchial (behind the orbit), protogastric, mesogastric, cardiac,
  // intestinal
  // (low and soft: the live crab's dorsum reads as one inflated dome with faint regions, 060, 049, 057)
  dy += dorsal * (0.02 * g(0.29, -0.1, 0.19) + 0.012 * g(0.31, 0.17, 0.1) + 0.01 * g(0.11, 0.2, 0.09)
    + 0.008 * g(0, 0.08, 0.08) + 0.01 * g(0, -0.15, 0.09) + 0.006 * g(0, -0.3, 0.09));
  // and never quite symmetric or smooth: low irregular undulations of the dorsum (the left and right halves differ)
  dy += dorsal * (0.004 * vnoise(x * 6.5, z * 6.5, 9) + 0.0018 * vnoise(x * 17, z * 17, 10));
  // furrows: the cervical groove arching across, the H between the gastric and cardiac regions
  const cerv = Math.abs(z - (0.08 - 0.55 * ax * ax));
  dy -= dorsal * 0.008 * Math.exp(-(cerv * cerv) / 0.0005) * smoothstep(0.04, 0.1, ax) * (1 - smoothstep(0.3, 0.38, ax));
  const hx = Math.abs(ax - 0.065);
  dy -= dorsal * 0.007 * Math.exp(-(hx * hx) / 0.0003) * smoothstep(-0.22, -0.14, z) * (1 - smoothstep(0, 0.06, z));
  // the epibranchial arcs behind the orbits (a furrow in front of the branchial lobes) and the M-shaped ridge in
  // front of the intestinal region — the same curves the material draws (008, 4.webp)
  const eArc = Math.abs(Math.hypot(ax / 0.44, (z - 0.06) / 0.23) - 1) * 0.23;
  dy -= dorsal * 0.006 * Math.exp(-(eArc * eArc) / 0.0003) * smoothstep(0.12, 0.17, ax) * smoothstep(0.08, 0.14, z);
  const zM = -0.2 - 0.065 * Math.sin(Math.PI * clamp(ax / 0.36, 0, 1)) + 0.035 * Math.exp(-((ax / 0.035) ** 2));
  dy += dorsal * 0.003 * Math.exp(-((z - zM) ** 2) / 0.00015) * (1 - smoothstep(0.32, 0.4, ax));
  // ---- the front, measured along the rim (axR: the outline's half-width at this bearing), so it follows the outline
  const axR = R * Math.abs(sn);
  const frontS = smoothstep(0.5, 0.75, c);
  const rimBand = smoothstep(0.34, 0.46, v) * (1 - smoothstep(0.54, 0.64, v));
  // orbits: a cavity under the front margin from beside the frontal lobe to the external orbital angle, where the
  // eyestalk stands and folds down (063, 069, 002, 001, 009)
  const orb = smoothstep(0.075, 0.11, axR) * (1 - smoothstep(0.33, 0.39, axR)) * frontS * rimBand;
  // the front margin is not a straight edge: it rises at the external orbital angles, dips along each orbit and
  // rises a little again at the frontal lobe (063, 016, 069, 004)
  const ga = (cx, r) => Math.exp(-(((axR - cx) / r) ** 2));
  const undul = frontS * (0.014 * ga(0.375, 0.045) - 0.016 * ga(0.21, 0.085) + 0.006 * ga(0.03, 0.05));
  // front: a narrow lobe between the eyestalks, deflexed — it bends down over the face (004, 063, 016)
  const frontLobe = (1 - smoothstep(0.05, 0.08, axR)) * smoothstep(0.88, 0.97, c) * smoothstep(0.3, 0.46, v) * (1 - smoothstep(0.56, 0.66, v));
  // buccal frame: the face recess where the third maxillipeds sit
  const bx = 1 - smoothstep(0.17, 0.25, ax);
  const byw = smoothstep(0.04, 0.1, y) * (1 - smoothstep(0.32, 0.38, y));
  const buccal = bx * byw * smoothstep(0.8, 0.97, c) * (v > 0.5 ? 1 : 0);
  // displacement: along the (approximate) outward normal of the base shape
  const nx = sn * (v <= 0.5 ? Math.sin(phi) : 1), nz = c * (v <= 0.5 ? Math.sin(phi) : 1), ny = v <= 0.5 ? Math.cos(phi) * 1.3 : -Math.abs(Math.cos(phi));
  const nl = Math.hypot(nx, ny, nz) || 1;
  const disp = dy - 0.03 * orb + 0.006 * frontLobe - 0.01 * buccal;
  x += (nx / nl) * disp; z += (nz / nl) * disp; y += (ny / nl) * disp * (dorsal ? 1 : 0.4) + (dorsal ? dy * 0.4 : 0);
  // the margin's undulation, fading away from the rim; the lobe's downward bend
  y += undul * (smoothstep(0.2, 0.46, v) * (1 - smoothstep(0.5, 0.7, v)));
  y -= 0.018 * frontLobe * smoothstep(0.42, 0.56, v);
  o.set(x, y, z);
  // part: dorsal carapace, lateral wall (branchiostegite / pterygostomial), face, buccal cavity, sternum
  let part = PART.CARAPACE;
  if (v > 0.5) part = c > 0.8 && y > 0.05 ? PART.FACE : (v > 0.8 ? PART.STERNUM : PART.BRANCHIO);
  else if (v > 0.44) part = c > 0.8 ? PART.FACE : PART.BRANCHIO;
  // (the orbit's shading: a shallow cavity, half-lit — 063 shows the eyestalk bases in shade, not in a black hole)
  return [part, 0, orb * 0.55, 0];
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
      bone: base, x0: -0.03, x1: EYE.baseLen + 0.006, radial, rings: Math.max(3, Math.round(res.ringK * 0.12)),
      section: (t) => { const r = EYE.baseR + (EYE.stalkR0 * 1.04 - EYE.baseR) * smoothstep(0.2, 1, t); return { cy: 0, cz: 0, ry: r, rz: r * 0.92 }; },
      info: () => [PART.EYESTALK, limb * 10, 0, 0.6], capA: 0.02, capB: 0.005,
    });
    // stalk + terminal cornea (club-shaped), slightly curved forward at the tip
    const len = EYE.stalkLen + EYE.corneaLen;
    tube(B, {
      bone: dist, x0: -0.012, x1: len, radial, rings: Math.max(5, Math.round(res.ringK * 0.36)),
      section: (t) => {
        // a slim neck out of the orbit, widening steadily upward, then the cornea: an ovoid about 1.4 × the stalk
        // below it (063, 027, 013, 061)
        const x = -0.012 + t * (len + 0.012);
        const u = clamp(x / EYE.stalkLen, 0, 1);
        const stalk = EYE.stalkR0 + (EYE.stalkR1 - EYE.stalkR0) * Math.pow(u, 1.3);
        const cx = (x - EYE.stalkLen) / EYE.corneaLen;                   // 0 … 1 over the cornea
        // an ovoid with a full, rounded tip — not an onion dome (063, 027, 013)
        const bulb = EYE.corneaR * Math.pow(Math.max(0, 1 - ((cx - 0.45) / 0.6) ** 2), 0.4);
        // the joint with the basal article: a shallow waist, the stalk leaving it from inside (no collar)
        const r = Math.max(stalk * (1 - smoothstep(0.55, 1.0, cx)), bulb) * (0.93 + 0.07 * smoothstep(-0.006, 0.012, x));
        // flattened a little front-to-back, and leaning forward at the tip
        return { cy: 0.008 * smoothstep(EYE.stalkLen * 0.4, len, x), cz: 0, ry: r * 0.94, rz: r };
      },
      info: () => [PART.EYESTALK, limb * 10 + 1, 0, 0.7],
      capA: 0.005, capB: 0.022,
    });
  });
}

// --------------------------------------------------------------------------------------------- mouthparts

/**
 * Third maxillipeds: two thin, gently arched lids that close the buccal frame and meet on the midline (002–005, 2.webp,
 * 4.webp). Bone-local: X from the lateral hinge to the midline, Y the outer face, Z along the hinge — upward on the
 * left plate, downward on the right one (Z = X × Y), so "up" is `zUp * sideUp`. Each plate: the ischium below, the
 * slightly smaller merus above with its upper-medial corner cut obliquely (the notch between the pair), the whole
 * plate domed most along its medial half.
 */
function buildMxp(B, res) {
  const rig = sharedRig();
  const n = Math.max(8, Math.round(res.radial * 1.1)), m = Math.max(5, Math.round(res.radial * 0.75));
  SIDES.forEach(({ id, sign }, k) => {
    const bone = rig.index.get(`Mxp3_${id}`);
    const W = MXP3.width, H = MXP3.height, T = MXP3.thick;
    const up = sign;                                   // +Z is up on the left plate, down on the right
    // outline in (x: hinge 0 … midline W, zu: -H/2 bottom … H/2 top) for an angle a around the plate's centre
    const outline = (a) => {
      const c = Math.cos(a), s = Math.sin(a);
      const rx = 0.5 * W, rz = 0.5 * H;
      // a pillow: straight medial edge above (the pair meets on the midline), both lower corners well rounded so
      // the pair ends in two bulbs with a small notch between them (2.webp, 4.webp)
      // the upper medial corner nearly square, so the pair meets right up to the top (063: only a small notch)
      const nExp = s < 0 ? 2.15 : (c > 0 ? 6 : 3.2);
      let px = rx + rx * se(c, s < 0 ? 2.15 : (c > 0 ? 10 : 3.2)), pz = rz * se(s, nExp);
      // the merus narrows a little upward: its upper-medial corner only slightly bevelled, so the pair closes the
      // frame right up to the front with just a small notch between them (063, 027)
      const cut = smoothstep(0.2, 0.9, c) * smoothstep(0.3, 0.95, s);
      px -= 0.004 * cut; pz -= 0.006 * cut;
      const lat = smoothstep(0.2, 0.9, -c) * smoothstep(0.3, 0.9, s);
      pz -= 0.016 * lat;
      return [px, pz];
    };
    for (const face of [1, -1]) {
      patch(B, {
        rows: m, cols: n * 2, bone, wrapCols: true,
        fn: (u, v, o, inside) => {
          const a = u * TAU, r = 1 - v;
          const [px, pz] = outline(a);
          const cx = 0.5 * W, x = cx + (px - cx) * r, zu = pz * r;
          // a thin plate, gently arched: highest a little medial of centre and in the upper (merus) half, falling
          // off evenly to thin margins — a lid over the mouth, not a pillow (063, 027, 002)
          const dx = (x - 0.56 * W) / (0.62 * W), dz = (zu - 0.06 * H) / (0.62 * H);
          // the margin a rounded rim, not a cut edge: the lid's thickness rolls over it (r → 1)
          const rimR = Math.sqrt(Math.max(0, 1 - ((r - 0.86) / 0.14) ** 2 * (r > 0.86 ? 1 : 0)));
          const dome = Math.max(0, 1 - dx * dx - dz * dz * 0.85) * smoothstep(0, 0.5, 1 - r * r) ** 0.5;
          const y = face > 0 ? T * (0.28 * rimR + 0.72 * dome) : -0.003 - 0.004 * rimR - 0.004 * dome;
          o.set(x, y, zu * up);
          inside.set(x, y - face, zu * up);
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
        // the telson rounded off (3.webp: the male's abdomen ends in a broad round tip)
        const tip = sex === 'm' ? Math.sqrt(Math.max(0.06, 1 - Math.pow(Math.max(0, v - 0.7) / 0.3, 2))) : Math.sqrt(Math.max(0.05, 1 - Math.pow(Math.max(0, v - 0.55) / 0.45, 2)));
        const w = (A.width0 + (A.width1 - A.width0) * v) * 0.5 * tip;
        const x = (u * 2 - 1) * w;
        // a low convex plate with rounded flanks, folded tight into the sternal cavity: its margins sink into the
        // sternum and only the middle stands a little proud — it never hangs below the body (063, 027 from the front)
        const bulge = (sex === 'm' ? 0.022 : 0.02) * Math.sqrt(Math.max(0, 1 - (u * 2 - 1) ** 2)) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, v * 1.2)));
        o.set(x, -bulge, zz);
        inside.set(x, 1, zz);
        return [PART.ABDOMEN, 140, 0, 0.2];
      },
    });
  }
}

// --------------------------------------------------------------------------------------------- chelipeds

const N_TEETH = 13;
/** the palm starts this far inside the carpus (its condyle) */
const PALM_X0 = -0.02;

/** cheliped merus: stout, trigonal, its upper margin granular (the material); the inner face carries a tympanum */
function chelaMerusSection(t, th) {
  // slim, trigonal (063, 027: the arm is a thin rod beside the face; the bulk is the carpus' rounded shoulder)
  const p = Math.sin(Math.PI * clamp(t * 0.85 + 0.12, 0, 1));
  const tri = 1 + 0.12 * Math.cos(3 * th - Math.PI / 2);
  const C = CHELIPED;
  return { cy: 0.006 * p, cz: 0, ry: C.merusH * 0.5 * (0.72 + 0.28 * p) * tri, rz: C.merusW * 0.5 * (0.78 + 0.22 * p) * tri, n: 2.2 };
}

/** propodus: the palm (inflated, oval) drawn out into the long fixed finger, denticles on its cutting edge */
function chelaPropodusSection(t, th, res) {
  const C = CHELIPED;
  const PL = C.palm + C.finger;
  const x = PALM_X0 + t * (PL - PALM_X0);
  const f = smoothstep(C.palm - 0.03, C.palm + 0.025, x);              // 0 palm … 1 finger
  // the palm leaves the carpus' rim by a slim condyle, then opens at once to its full depth (002, 011)
  const kc = 0.78 + 0.22 * smoothstep(-0.004, 0.024, x);
  const pt = clamp(x / C.palm, 0, 1);
  // a broad oval plate, full almost to its distal margin (2.webp, 003–005)
  // an inflated bulb, deepest a little proximal of the middle, its upper margin arching down to the dactylus
  const palmRy = C.palmH * 0.5 * (0.55 + 0.45 * Math.sin(Math.PI * clamp(pt * 0.75 + 0.16, 0, 1)));
  const palmRz = C.palmW * 0.5 * (0.7 + 0.3 * Math.sin(Math.PI * clamp(pt * 0.85 + 0.12, 0, 1)));
  const ft = clamp((x - C.palm) / C.finger, 0, 1);
  const taper = Math.pow(1 - ft, 1.05) * (1 - 0.1 * ft);
  const fRy = C.fingerH * 0.5 * (0.04 + 0.96 * taper), fRz = C.fingerW * 0.5 * (0.06 + 0.94 * taper);
  // the finger leaves the palm along its lower half and curves up to meet the hooked dactylus: a narrow gape,
  // the tips touching (2.webp, 6.webp)
  const fCy = -C.palmH * 0.17 + 0.035 * ft * ft;
  let dr = 0;
  if (res.teeth && f > 0.5 && ft < 0.93) {
    const up = Math.max(0, Math.sin(th));
    dr = 0.0055 * Math.pow(up, 10) * (0.5 + 0.5 * Math.cos(TAU * N_TEETH * ft)) * (1 - ft);
  }
  // the palm's faces are gently uneven (011), the fingers smooth
  // (sampled round a circle so the noise closes on itself: no seam down the palm)
  if (res.teeth) dr += 0.0012 * vnoise(pt * 16 + 2.4 * Math.cos(th), 2.4 * Math.sin(th), 31) * (1 - f);
  // the palm a thin plate with rounded (not blocky) margins: faces gently convex, edges thin (063, 011)
  return { cy: f * fCy + (1 - f) * 0.012 * Math.sin(Math.PI * pt), cz: 0.004 * f, ry: (palmRy * (1 - f) + fRy * f) * kc, rz: (palmRz * (1 - f) + fRz * f) * kc, n: 1.6 + 0.4 * f, ny: 2.1 - 0.1 * f, dr };
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
      bone: bi('Merus'), x0: -0.015, x1: C.merus + 0.008, radial, rings: rings(C.merus),
      section: chelaMerusSection,
      info: (t) => [PART.CHELA_ARM, limb * 10 + 3, membrane(t, C.merus), 0.15], capA: 0.02, capB: 0.026,
    });
    // carpus: a rounded knob, leaving the merus' rim by a slim condyle and swelling toward the palm, its dorsal face
    // domed; it ends in a broad rim that takes the palm's condyle (002, 063, 011)
    const cX0 = -0.022, cL = C.carpus + 0.008 - cX0;
    tube(B, {
      bone: bi('Carpus'), x0: cX0, x1: cX0 + cL, radial, rings: rings(C.carpus),
      section: (t) => {
        const x = cX0 + t * cL;
        const p = smoothstep(0, 0.75, t) * (1 - 0.1 * smoothstep(0.85, 1, t));
        const k = (0.55 + 0.45 * smoothstep(-0.002, 0.03, x)) * (1 + 0.04 * smoothstep(1 - 0.02 / cL, 1 - 0.004 / cL, t));
        return { cy: 0.006 * p, cz: 0, ry: (0.034 + 0.03 * p) * k, rz: (0.028 + 0.022 * p) * k, n: 2.2, ny: 1.8 };
      },
      info: (t) => [PART.CHELA_ARM, limb * 10 + 4, membrane(t, cL, 0.034), 0.15], capA: 0.01, capB: 0.01,
    });
    // propodus: inflated palm drawn out into the long fixed finger (ventral), denticles on its cutting edge
    const PL = C.palm + C.finger;
    const nT = N_TEETH;
    tube(B, {
      bone: bi('Propodus'), x0: PALM_X0, x1: PL, radial: Math.round(radial * 1.25), rings: rings(PL) + 4,
      section: (t, th) => chelaPropodusSection(t, th, res),
      info: (t) => [PART.PALM, limb * 10 + 5, membrane(t, PL - PALM_X0, 0.03), 0.1],
      capA: 0.012, capB: 0.012,
    });
    // dactylus (movable finger): hinged at the palm's distal dorsal corner, curving down to cross the fixed tip
    tube(B, {
      bone: bi('Dactylus'), x0: -0.014, x1: C.dactylus, radial, rings: rings(C.dactylus) + 4,
      section: (t, th) => {
        const x = -0.014 + t * (C.dactylus + 0.014);
        const ft = clamp(x / C.dactylus, 0, 1);
        // hinged on the palm by a slim condyle (the joint is a neck, not a ball)
        const kc = 0.62 + 0.38 * smoothstep(-0.002, 0.016, x);
        let dr = 0;
        if (res.teeth && ft > 0.08 && ft < 0.92) {
          const down = Math.max(0, -Math.sin(th));
          dr = 0.005 * Math.pow(down, 10) * (0.5 + 0.5 * Math.cos(TAU * (nT - 1) * ft + 1.3)) * (1 - ft);
        }
        const taper = Math.pow(1 - ft, 1.05) * (1 - 0.1 * ft);
        return { cy: -0.05 * ft * ft, cz: 0.003 * ft, ry: C.fingerH * 0.5 * (0.04 + 0.98 * taper) * kc, rz: C.fingerW * 0.5 * (0.06 + 0.94 * taper) * kc, n: 2, dr };
      },
      info: () => [PART.FINGER, limb * 10 + 6, 0, 0.1], capA: 0.01, capB: 0.006,
    });
  });
}

// --------------------------------------------------------------------------------------------- walking legs

/**
 * The seven segments of a walking leg as tube specs (bone-local). Meri, carpi and propodi are flat blades with their
 * broad faces up and down: wide along Z (forward / back), shallow along Y (dorsal) — about a third as deep as broad
 * (009, 057, 063; Morphology LEGS). Each merus carries the
 * faint hollow of its tympanum on both broad faces. `roll` tilts the dorsal face forward (the anterior margin
 * down), so the blades show their faces from the front as well as from above (063, 069).
 */
function legSegments(L, sign, res) {
  const roll = (L.roll ?? 0) * sign;
  // every leg its own small irregularities (left and right legs differ; 009, 049: no two segments alike)
  const lseed = L.name * 13 + (sign > 0 ? 0 : 101);
  const tw = (k) => (0.08 + 0.08 * hash01(lseed, k, 3)) * sign * (hash01(lseed, k, 4) < 0.5 ? 1 : -1);
  /** each segment's own slight deviation in breadth (±6 %) — no two alike */
  const jw = (k) => 1 + 0.12 * (hash01(lseed, k, 9) - 0.5);
  const neck = (t, a, b, w = 0.06) => 1 - a * Math.exp(-((t / w) ** 2)) - b * Math.exp(-(((1 - t) / w) ** 2));
  /**
   * the articulations, as on the real legs (009, 068, 016): a segment ends in a broad, slightly flared rim (`lip`)
   * closed by a low dome, and the next one starts INSIDE it as a slim condyle (`cond`: `a` of its breadth, swelling
   * to full within `w` CW of the joint) carrying the pale joint membrane — a socket and a neck, not two rounded
   * sausage ends pressed together. x: CW from the joint along the segment.
   */
  const cond = (x, a, w) => a + (1 - a) * smoothstep(-0.002, w, x);
  const lip = (t, len) => 1 + 0.05 * smoothstep(1 - 0.022 / len, 1 - 0.004 / len, t);
  /** low, irregular undulations of the cuticle (≈ 0.02 CW across, 0.001 CW high), only at the close-up level */
  // (sampled round a circle, so it closes on itself without a seam along the segment)
  const bump = (t, th, len, k, amp) => (res.teeth ? amp * (vnoise(t * len * 48 + 2.6 * Math.cos(th), 2.6 * Math.sin(th) + k * 7.1, lseed + k) + 0.5 * vnoise(t * len * 120 + 5.2 * Math.cos(th), 5.2 * Math.sin(th) + k * 3.3, lseed + k + 50)) : 0);
  const mX0 = -0.012, mL = L.merus + 0.004 - mX0;
  const cX0 = -0.018, cL = L.carpus + 0.004 - cX0;
  const pX0 = -0.016, pL = L.propodus + 0.004 - pX0;
  const dX0 = -0.012, dL = L.dactylus - dX0;
  return {
    Coxa: { x0: -0.035, x1: L.coxa + 0.006, capA: 0.024, capB: 0.01, section: (t) => ({ cy: 0, cz: 0, ry: 0.034 - 0.004 * t, rz: 0.042 }), part: PART.LEG_PROX, thin: 0.35, mem: 0 },
    Basis: { x0: -0.008, x1: L.basis + 0.005, capA: 0.008, capB: 0.008, section: (t) => ({ cy: 0, cz: 0, ry: 0.03, rz: 0.036 * neck(t, 0.2, 0), ny: 1.8 }), part: PART.LEG_PROX, thin: 0.35, mem: 0.025 },
    Ischium: { x0: -0.005, x1: L.ischium + 0.008, capA: 0.006, capB: 0.006, roll: roll * 0.5, section: (t) => ({ cy: 0, cz: 0, ry: 0.028, rz: (0.032 + 0.008 * t) * neck(t, 0.15, 0) * lip(t, L.ischium + 0.013), n: 2.2, ny: 1.7 }), part: PART.LEG_PROX, thin: 0.4, mem: 0 },
    Merus: {
      x0: mX0, x1: mX0 + mL, capA: 0.008, capB: 0.009, roll, twist: tw(3),
      section: (t, th) => {
        // a long leaf, flat as a blade: half its breadth where it leaves the ischium, broadest a little before the
        // middle (0.15 CW with the clear margins), narrowing to the knee (009, 007, 049, 057, 016); lens-shaped in
        // section, 0.05 thick, with thin fore and aft margins — broad from above, a thin edge from the front (063)
        const leaf = Math.pow(Math.sin(Math.PI * clamp(0.06 + 0.86 * Math.pow(t, 0.85), 0, 1)), 0.6);
        const prof = (0.5 + 0.5 * leaf) * cond(mX0 + t * mL, 0.62, 0.03) * lip(t, mL) * jw(3);
        const sn = Math.sin(th), c = Math.cos(th);
        // the tympanum: an oval hollow over most of each broad face (up and down)
        const ov = Math.max(0, 1 - ((t - 0.48) / 0.34) ** 2) * Math.max(0, 1 - (c / 0.72) ** 2);
        const hollow = res.teeth ? 0.0014 * ov : 0;
        // the knee's dorsal condyle and the cuticle's own small undulations
        let dr = 0.0035 * Math.exp(-(((1 - t) / 0.06) ** 2)) * Math.max(0, sn) ** 2;
        dr += bump(t, th, L.merus, 3, 0.001);
        return { cy: -0.003 * Math.sin(Math.PI * t), cz: 0, ry: L.merusD * 0.5 * (0.6 + 0.4 * prof) - hollow * Math.abs(sn), rz: L.merusB * 0.5 * prof * (1 + 0.04 * c), n: 2.2, ny: 1.35, dr };
      },
      part: PART.MERUS, thin: 0.55, mem: 0.028,
    },
    Carpus: {
      x0: cX0, x1: cX0 + cL, capA: 0.008, capB: 0.009, roll: roll * 0.95, twist: tw(4),
      section: (t, th) => {
        // short and club-shaped: out of the knee by a slim condyle, flaring to its full breadth near the propodus
        // (009, 049, 068, 007)
        const p = (0.5 + 0.5 * Math.pow(smoothstep(0, 0.6, t), 0.8)) * cond(cX0 + t * cL, 0.55, 0.024) * lip(t, cL) * jw(4);
        const dr = 0.0025 * Math.exp(-((t / 0.12) ** 2)) * Math.max(0, Math.sin(th)) ** 2 + bump(t, th, L.carpus, 4, 0.0008);
        return { cy: 0.002 * t, cz: 0, ry: L.carpusD * 0.5 * (0.65 + 0.35 * p), rz: L.carpusB * 0.5 * p, n: 2.2, ny: 1.4, dr };
      },
      part: PART.LEG_DIST, thin: 0.6, mem: 0.03,
    },
    Propodus: {
      x0: pX0, x1: pX0 + pL, capA: 0.008, capB: 0.008, roll: roll * 0.85, twist: tw(5),
      section: (t, th) => {
        // an elongate oval: out of the carpus by a slim condyle, broadest in its proximal third, narrowing to half
        // that at the dactylus; bowed a little ventrally (009, 007)
        const p = (0.72 + 0.28 * smoothstep(0, 0.25, t)) * (1 - 0.36 * smoothstep(0.3, 1, t)) * cond(pX0 + t * pL, 0.55, 0.022) * lip(t, pL) * jw(5);
        return { cy: -0.005 * Math.sin(Math.PI * t), cz: 0, ry: L.propD * 0.5 * (0.7 + 0.3 * p), rz: L.propB * 0.5 * p, n: 2.1, ny: 1.45, dr: bump(t, th, L.propodus, 5, 0.0007) };
      },
      part: PART.LEG_DIST, thin: 0.65, mem: 0.028,
    },
    // dactylus: long, slender, lanceolate — broadest just beyond its base, then a long taper to a needle point —
    // curving ventrally (and a little backward) (007, 009, 068, 063); the last leg's straighter (S. sheni) [R]
    Dactylus: {
      x0: dX0, x1: L.dactylus, capA: 0.007, capB: 0.002, roll: roll * 0.6, twist: tw(6),
      section: (t, th) => {
        const u = clamp((dX0 + t * dL) / L.dactylus, 0, 1);
        const lance = (0.75 + 0.25 * Math.sin(Math.PI * clamp(u * 1.6 + 0.05, 0, 1))) * Math.pow(1 - u, 1.15) * cond(dX0 + t * dL, 0.6, 0.016);
        // fine longitudinal ridges (068)
        const ridge = res.teeth ? 0.0004 * Math.cos(th * 6) * (1 - u) : 0;
        const bend = L.name === 4 ? 0.025 : 0.065;
        return { cy: -bend * u * u, cz: 0.008 * sign * u * u, ry: L.dacD * 0.5 * lance + 0.0003, rz: L.dacB * 0.5 * lance + 0.0003, n: 2, ny: 1.55, dr: ridge };
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
    // a fine tapered hair, curving: it leaves the cuticle along `dir`, bends toward a random side and droops
    // distally; two crossed ribbons so it reads from any side (063, 049, 068, 010: short, stiff, a little bent)
    const side = new Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize();
    const side2 = new Vector3().crossVectors(dir, side).normalize();
    const ba = rand() * TAU, bend = 0.25 + 0.55 * rand();
    const bendDir = side.clone().multiplyScalar(Math.cos(ba)).addScaledVector(side2, Math.sin(ba));
    const id = rand();
    const segs = 5;
    const pts = [];
    const p = root.clone(), d = dir.clone();
    for (let s2 = 0; s2 <= segs; s2++) {
      pts.push(p.clone());
      d.addScaledVector(bendDir, bend / segs).add(new Vector3(0.06 / segs, 0, 0)).normalize();
      p.addScaledVector(d, len / segs);
    }
    for (const sd of [side, side2]) {
      const base = B.count;
      for (let s2 = 0; s2 <= segs; s2++) {
        const t = s2 / segs;
        const w = width * (1 - 0.88 * t) * (s2 === 0 ? 1.2 : 1);
        for (const k of [-1, 1]) {
          const q = pts[s2].clone().addScaledVector(sd, k * w * 0.5);
          const n = new Vector3().crossVectors(sd, dir).normalize();
          B.vert(q.clone().applyMatrix4(M), n.applyMatrix3(_nm).normalize(), t, k * 0.5 + 0.5, q, [PART.SETA, limb, t, id], bone);
        }
      }
      for (let s2 = 0; s2 < segs; s2++) {
        const a = base + s2 * 2;
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
      // short stiff dark setae, sparse, on the fore and aft margins of the flattened segments (the broad faces are
      // dorsal / ventral), leaning a little ventrally; the longest (≈ 0.06 CW) on the propodi and the meri's hind
      // margin (063, 049, 068, 010; "black stout setae, sparse" [L])
      const FWD = sign > 0 ? -0.35 : Math.PI + 0.35, AFT = sign > 0 ? Math.PI + 0.35 : -0.35;
      fringe(bi('Merus'), specs.Merus, 0.1, 0.94, AFT, 9, [0.03, 0.07], limb * 10 + 3, 0.42, 0.003);
      fringe(bi('Merus'), specs.Merus, 0.15, 0.9, FWD, 3, [0.02, 0.045], limb * 10 + 3, 0.45, 0.003);
      fringe(bi('Carpus'), specs.Carpus, 0.12, 0.88, AFT, 4, [0.02, 0.05], limb * 10 + 4, 0.45, 0.0028);
      fringe(bi('Propodus'), specs.Propodus, 0.06, 0.94, AFT, 8, [0.025, 0.065], limb * 10 + 5, 0.45, 0.0028);
      fringe(bi('Propodus'), specs.Propodus, 0.1, 0.9, FWD, 4, [0.02, 0.045], limb * 10 + 5, 0.5, 0.0028);
      fringe(bi('Dactylus'), specs.Dactylus, 0.06, 0.5, AFT, 3, [0.015, 0.035], limb * 10 + 6, 0.7, 0.0024);
      fringe(bi('Dactylus'), specs.Dactylus, 0.06, 0.5, FWD, 2, [0.015, 0.03], limb * 10 + 6, 0.7, 0.0024);
    });
    // water-wicking tufts between the bases of the first two walking legs (S. intermedia) [R]
    const cox = rig.index.get(`Leg_${id}1_Coxa`);
    for (let i = 0; i < 9; i++) {
      const root = new Vector3(0.02 + 0.03 * rand(), -0.03 - 0.01 * rand(), -sign * (0.04 + 0.02 * rand()));
      seta(cox, root, new Vector3(0.2, -1, (rand() - 0.5) * 0.4).normalize(), 0.02 + 0.025 * rand(), 0.0018, sk * 40);
    }
    const ci = (s) => rig.index.get(`Cheliped_${id}_${s}`);
    const C = CHELIPED;
    const merusSpec = { x0: -0.015, x1: C.merus + 0.008, capA: 0.02, capB: 0.026, section: chelaMerusSection };
    fringe(ci('Merus'), merusSpec, 0.15, 0.85, Math.PI / 2, 3, [0.02, 0.04], (8 + sk) * 10 + 3, 0.6, 0.002);
    const propSpec = { x0: PALM_X0, x1: C.palm + C.finger, capA: 0.012, capB: 0.012, section: (t, th) => chelaPropodusSection(t, th, res) };
    const palmEnd = (C.palm - PALM_X0) / (C.palm + C.finger - PALM_X0);
    fringe(ci('Propodus'), propSpec, 0.12, palmEnd * 0.9, Math.PI / 2, 3, [0.02, 0.035], (8 + sk) * 10 + 5, 0.6, 0.002);
    fringe(ci('Propodus'), propSpec, palmEnd, palmEnd + (1 - palmEnd) * 0.6, -Math.PI / 2, 2, [0.015, 0.025], (8 + sk) * 10 + 5, 0.8, 0.0018);
    // third maxillipeds: a dense fringe on the medial margin
    const mb = rig.index.get(`Mxp3_${id}`);
    for (let i = 0; i < 12; i++) {
      const z = -MXP3.height * 0.42 + (MXP3.height * 0.8 * (i + rand() * 0.6)) / 12;
      seta(mb, new Vector3(MXP3.width * 0.97, 0.004, z), new Vector3(0.75, 0.4, (rand() - 0.5) * 0.3).normalize(), 0.01 + 0.014 * rand(), 0.0016, (12 + sk) * 10);
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
    seta(body, root, dir, 0.01 + 0.018 * rand(), 0.0018, 150);
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
