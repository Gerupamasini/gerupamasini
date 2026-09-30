import * as THREE from 'three';
import { WING, buildScapularLayout } from './featherLayout.js';
import { projectToSurface } from './sdf.js';
import { computeSpineWeights, bodyDisplacementMasks } from './bodyMesh.js';
import { conformAt, foldLayer } from './wingFold.js';

const smooth01 = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Real feather geometry: rachis + asymmetric vanes, bend and camber defined per vertex.
// Opaque (outline = vertices), so there is no alpha overdraw. Colour pattern is procedural in
// KentishPloverMaterials (uses uv: x = across vane −1..1 (0 = rachis), y = base→tip).
// aLie / aLieMask: outward body normal (bind frame of the vertex, × contact weight) and the body shader's
// displacement masks where the feather lies on the body (folded wing: at its folded place), so the plumage
// rises and falls with the fluffed / breathing body instead of being swallowed by it. aCore: arm tube
// vertex → tube axis (the propatagium folds away with the wing). aConform: bend of a folded wing feather onto
// its layer of the folded-wing shell (wingFold.conformAt), in its bind frame (m), applied while folded;
// aConformN: the matching change of its normal.

export const FEATHER_TYPE = {
  primary: 0,
  secondary: 1,
  tertial: 2,
  primaryCovert: 3,
  greaterCovert: 4,
  medianCovert: 5,
  lesserCovert: 6,
  alula: 7,
  rectrix: 8,
  upperTailCovert: 9,
  scapular: 10,
  arm: 11,
  underTailCovert: 12,
};

const deg = Math.PI / 180;

// LOD2 draws every other remex / greater covert as a wider card (the wing-fold solver clears both shapes)
export const LOD2_CARD = { types: new Set(['primary', 'secondary', 'greaterCovert']), width: 1.9, rows: 4 };

const OVATE = new Set(['greaterCovert', 'medianCovert', 'lesserCovert', 'primaryCovert', 'scapular', 'upperTailCovert', 'underTailCovert']);
function widthProfile(t, type) {
  // base (calamus) → full width → tip; pointed for primaries/alula, broadly ovate for coverts & body feathers
  const pointed = type === 'primary' || type === 'alula';
  if (OVATE.has(type)) {
    const base = Math.min(1, 0.35 + t / 0.18);
    const tipStart = 0.38;
    if (t <= tipStart) return base;
    const u = (t - tipStart) / (1 - tipStart);
    return Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.1 * u);
  }
  const base = Math.min(1, 0.22 + t / 0.12);
  const tipStart = pointed ? 0.62 : 0.66;
  if (t <= tipStart) return base;
  const u = (t - tipStart) / (1 - tipStart);
  return pointed ? Math.pow(Math.max(0, 1 - u), 0.72) * (1 - 0.15 * u) : Math.sqrt(Math.max(0, 1 - u * u));
}

class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.feather = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.lie = [];
    this.lieMask = [];
    this.core = [];
    this.conform = [];
    this.conformN = [];
    this.index = [];
  }
  get count() {
    return this.pos.length / 3;
  }
  vertex(p, n, uv, f, si, sw) {
    this.pos.push(p[0] / 1000, p[1] / 1000, p[2] / 1000);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    this.feather.push(f[0], f[1], f[2], f[3]);
    this.skinIndex.push(si[0] ?? 0, si[1] ?? 0, si[2] ?? 0, si[3] ?? 0);
    this.skinWeight.push(sw[0] ?? 1, sw[1] ?? 0, sw[2] ?? 0, sw[3] ?? 0);
    this.lie.push(0, 0, 0);
    this.lieMask.push(0, 0);
    this.core.push(0, 0, 0);
    this.conform.push(0, 0, 0);
    this.conformN.push(0, 0, 0);
  }
  setContact(v, n, mask) {
    for (let k = 0; k < 3; k++) this.lie[v * 3 + k] = n[k];
    for (let k = 0; k < 2; k++) this.lieMask[v * 2 + k] = mask[k];
  }
  mirrorFrom(start, boneMap) {
    // Duplicate vertices [start, count) mirrored in X with remapped bones and flipped winding.
    const vStart = start.v;
    const vEnd = this.count;
    const iStart = start.i;
    const iEnd = this.index.length;
    const offset = vEnd - vStart;
    for (let v = vStart; v < vEnd; v++) {
      this.pos.push(-this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]);
      this.nrm.push(-this.nrm[v * 3], this.nrm[v * 3 + 1], this.nrm[v * 3 + 2]);
      this.uv.push(this.uv[v * 2], this.uv[v * 2 + 1]);
      this.feather.push(this.feather[v * 4], this.feather[v * 4 + 1], this.feather[v * 4 + 2], this.feather[v * 4 + 3]);
      for (let k = 0; k < 4; k++) this.skinIndex.push(boneMap(this.skinIndex[v * 4 + k]));
      for (let k = 0; k < 4; k++) this.skinWeight.push(this.skinWeight[v * 4 + k]);
      this.lie.push(-this.lie[v * 3], this.lie[v * 3 + 1], this.lie[v * 3 + 2]);
      this.lieMask.push(this.lieMask[v * 2], this.lieMask[v * 2 + 1]);
      this.core.push(-this.core[v * 3], this.core[v * 3 + 1], this.core[v * 3 + 2]);
      this.conform.push(-this.conform[v * 3], this.conform[v * 3 + 1], this.conform[v * 3 + 2]);
      this.conformN.push(-this.conformN[v * 3], this.conformN[v * 3 + 1], this.conformN[v * 3 + 2]);
    }
    for (let i = iStart; i < iEnd; i += 3) {
      this.index.push(this.index[i] + offset, this.index[i + 2] + offset, this.index[i + 1] + offset);
    }
  }
  mark() {
    return { v: this.count, i: this.index.length };
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aFeather', new THREE.Float32BufferAttribute(this.feather, 4));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));
    g.setAttribute('aLie', new THREE.Float32BufferAttribute(this.lie, 3));
    g.setAttribute('aLieMask', new THREE.Float32BufferAttribute(this.lieMask, 2));
    g.setAttribute('aCore', new THREE.Float32BufferAttribute(this.core, 3));
    g.setAttribute('aConform', new THREE.Float32BufferAttribute(this.conform, 3));
    g.setAttribute('aConformN', new THREE.Float32BufferAttribute(this.conformN, 3));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Shape of a feather in its own frame: offset from the base as [along shaft, along `side`, along the dorsal
 * normal] (mm) at t (0 base … 1 tip) and a (−1 outer vane edge … 0 rachis … +1 inner edge).
 * Shared by the mesh and the wing-fold solver (anatomy/wingFold.js), so both see the same surface.
 */
export function featherOffset(f, t, a, sweepK = 0.03) {
  const L = f.length;
  const W = f.width;
  const wp = widthProfile(t, f.type);
  const across = a < 0 ? a * W * (1 - f.innerVane) * wp : a * W * f.innerVane * wp;
  // Longitudinal bend: shaft curves ventrally toward the tip (concave underside).
  const bend = -f.curve * L * t * t;
  // Slight lateral sweep of the tip (feathers curve toward the inner vane).
  const sweep = sweepK * L * t * t;
  // Camber: vanes drop away from the rachis (gives the feather volume in grazing light).
  const camber = -0.06 * W * Math.abs(a) * Math.abs(a) * wp;
  return [t * L, sweep - across, bend + camber];
}

/**
 * Emit one feather as a grid (nL along × nW across).
 * frame: { base, dir (unit, along shaft), side (unit, toward outer vane), normal (unit, dorsal) }
 * bone: { idx[], w[] } for the whole feather, or a function of the vertex position returning one.
 * conform(p) optional → [p', n'] projects vertices onto a surface (scapulars).
 */
function emitFeather(gb, f, frame, bone, typeId, rnd, opts = {}) {
  const nL = opts.nL ?? 9;
  const nW = opts.nW ?? 3; // vertices per vane side (excluding rachis)
  const { base, dir, side, normal } = frame;
  const start = gb.count;
  const cols = nW * 2 + 1;
  for (let i = 0; i < nL; i++) {
    const t = i / (nL - 1);
    for (let j = 0; j < cols; j++) {
      const a = (j - nW) / nW; // −1 outer edge … 0 rachis … +1 inner edge
      const o = featherOffset(f, t, a, opts.sweep ?? 0.03);
      const p = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        p[k] = base[k] + dir[k] * o[0] + side[k] * o[1] + normal[k] * o[2];
      }
      let n = normal;
      if (opts.conform) {
        const [pp, nn] = opts.conform(p, t);
        p[0] = pp[0];
        p[1] = pp[1];
        p[2] = pp[2];
        n = nn;
      } else {
        // tilt normal with camber slope
        const s = 0.12 * Math.sign(a) * Math.abs(a);
        n = [normal[0] + side[0] * s, normal[1] + side[1] * s, normal[2] + side[2] * s];
        const l = Math.hypot(n[0], n[1], n[2]);
        n = [n[0] / l, n[1] / l, n[2] / l];
      }
      const sk = typeof bone === 'function' ? bone(p) : bone;
      gb.vertex(p, n, [a, t], [typeId, f.index ?? 0, rnd, f.side ?? 0], sk.idx, sk.w);
    }
  }
  // Winding so that the front face is the dorsal (normal) side regardless of vane handedness.
  const cx = dir[1] * side[2] - dir[2] * side[1];
  const cy = dir[2] * side[0] - dir[0] * side[2];
  const cz = dir[0] * side[1] - dir[1] * side[0];
  const flip = cx * normal[0] + cy * normal[1] + cz * normal[2] > 0;
  for (let i = 0; i < nL - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = start + i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (flip) gb.index.push(a, b, c, b, d, c);
      else gb.index.push(a, c, b, b, c, d);
    }
  }
}

export function wingFrame(f) {
  const a = f.angle * deg;
  const dir = [Math.cos(a), 0, -Math.sin(a)];
  // outer vane lies toward the leading edge (+Z side of the shaft)
  const side = [Math.sin(a), 0, Math.cos(a)];
  return { base: f.base, dir, side, normal: [0, 1, 0] };
}

function armTube(gb, boneIndex) {
  // Flattened tube over humerus–forearm–hand: the propatagium/arm under the lesser coverts.
  const pts = [
    { p: [WING.humerus[0] - 2, WING.humerus[1] + 1.2, WING.humerus[2] + 1.5], w: 11, h: 2.6, bones: [['humerus', 1]] },
    { p: [WING.elbow[0] - 6, WING.elbow[1] + 1.4, WING.elbow[2] + 3.5], w: 12.5, h: 2.6, bones: [['humerus', 0.8], ['forearm', 0.2]] },
    { p: [WING.elbow[0] + 3, WING.elbow[1] + 1.4, WING.elbow[2] + 4.5], w: 12, h: 2.5, bones: [['humerus', 0.25], ['forearm', 0.75]] },
    { p: [(WING.elbow[0] + WING.wrist[0]) / 2, WING.elbow[1] + 1.3, (WING.elbow[2] + WING.wrist[2]) / 2 + 5], w: 11.5, h: 2.4, bones: [['forearm', 1]] },
    { p: [WING.wrist[0] - 4, WING.wrist[1] + 1.2, WING.wrist[2] + 4.5], w: 10, h: 2.8, bones: [['forearm', 0.8], ['hand', 0.2]] },
    { p: [WING.wrist[0] + 3, WING.wrist[1] + 1.1, WING.wrist[2] + 3.5], w: 8.5, h: 2.6, bones: [['forearm', 0.2], ['hand', 0.8]] },
    { p: [WING.handTip[0] - 6, WING.handTip[1] + 0.9, WING.handTip[2] + 2.2], w: 6, h: 1.9, bones: [['hand', 1]] },
    { p: [WING.handTip[0], WING.handTip[1] + 0.7, WING.handTip[2] + 1.2], w: 3, h: 1.2, bones: [['hand', 1]] },
  ];
  const seg = 12;
  const start = gb.count;
  pts.forEach((q, i) => {
    const t = i / (pts.length - 1);
    for (let s = 0; s < seg; s++) {
      const ang = (s / seg) * Math.PI * 2;
      const cz = Math.cos(ang);
      const sy = Math.sin(ang);
      // leading edge rounder, trailing edge thinner
      const zOff = cz * q.w * 0.5 * (cz > 0 ? 1 : 1.1);
      const yOff = sy * q.h * 0.5 * (cz > 0 ? 1 : 0.6 + 0.4 * (1 + cz));
      const p = [q.p[0], q.p[1] + yOff, q.p[2] + zOff - 1.5];
      const n = [0, sy, cz];
      const nl = Math.hypot(n[1], n[2]);
      gb.vertex(p, [0, n[1] / nl, n[2] / nl], [cz, t], [FEATHER_TYPE.arm, 0, 0.5, 0], q.bones.map((b) => boneIndex[`${b[0]}_L`]), q.bones.map((b) => b[1]));
      gb.core.splice(-3, 3, 0, -yOff / 1000, -zOff / 1000); // this vertex → ring centre (m)
    }
  });
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = start + i * seg + s;
      const b = start + i * seg + ((s + 1) % seg);
      const c = a + seg;
      const d = b + seg;
      gb.index.push(a, b, c, b, d, c);
    }
  }
}

/**
 * Build the merged feather geometry for one bird.
 * detail: 0 = LOD0 (everything), 1 = LOD1 (no lesser/median coverts, fewer segments), 2 = LOD2 (few big cards)
 * fold: wing-fold solution (wingFold.computeWingFold) — where each wing feather lies on the body when folded
 */
export function buildFeatherGeometry(spec, boneIndex, sdf, detail = 0, fold = null) {
  const gb = new GeoBuilder();
  // contact with the body at rest-space point p: outward normal × weight (full within 3 mm of the outline,
  // none beyond 6 mm) and the body shader's displacement masks there
  // (tail coverts: within 8 / 12 mm — the vent and rump swell under their whole length when fluffed)
  const contact = (p, near = 3) => {
    const e = 0.2;
    const g = [0, 1, 2].map((k) => {
      const a = [...p];
      const b = [...p];
      a[k] += e;
      b[k] -= e;
      return sdf(a[0], a[1], a[2]) - sdf(b[0], b[1], b[2]);
    });
    const gl = Math.hypot(...g) || 1;
    const x = Math.max(0, Math.min(1, (sdf(p[0], p[1], p[2]) - near) / near));
    const w = 1 - x * x * (3 - 2 * x);
    return [g.map((v) => (v / gl) * w), bodyDisplacementMasks(p, g.map((v) => v / gl))];
  };
  const bindMM = (v) => [gb.pos[v * 3] * 1000, gb.pos[v * 3 + 1] * 1000, gb.pos[v * 3 + 2] * 1000];
  const rng = mulberry(detail * 131 + 17);
  // body feathers (scapulars, tail coverts) deform exactly like the body surface they lie on
  const spineSkin = (p) => {
    const w = computeSpineWeights(p, boneIndex);
    return { idx: w.map((e) => e[0]), w: w.map((e) => e[1]) };
  };
  const torso = fold?.torso ?? sdf; // trunk outline without the neck (wingFold.conformAt)
  const segs = detail === 0 ? { nL: 8, nW: 2 } : detail === 1 ? { nL: 5, nW: 1 } : { nL: LOD2_CARD.rows, nW: 1 };

  // ---- Left wing (then mirrored) ----
  const wingStart = gb.mark();
  armTube(gb, boneIndex);
  for (const f of spec.wingFeathers) {
    if (detail >= 1 && (f.type === 'lesserCovert' || f.type === 'medianCovert')) continue;
    if (detail >= 2 && (f.type === 'primaryCovert' || f.type === 'alula' || (f.type === 'primary' && f.index % 2 === 1) || (f.type === 'secondary' && f.index % 2 === 0) || (f.type === 'greaterCovert' && f.index % 2 === 0))) continue;
    const boneName = f.type === 'primary' || f.type === 'secondary' || f.type === 'tertial' ? f.bone : f.name; // remiges share f.bone, coverts/alula own bones
    const idx = boneIndex[`${boneName}_L`];
    const fr = { ...f };
    if (detail >= 2 && LOD2_CARD.types.has(f.type)) fr.width *= LOD2_CARD.width;
    const m = gb.mark();
    emitFeather(gb, fr, wingFrame(fr), { idx: [idx], w: [1] }, FEATHER_TYPE[f.type], rng(), segs);
    // wing-root feathers re-aimed about their base so the spread wing clears the body (wingFold.js)
    const S = fold?.spread.get(f.name)?.bake;
    if (S) {
      const v3 = new THREE.Vector3();
      for (let v = m.v; v < gb.count; v++) {
        v3.set(...bindMM(v)).sub(new THREE.Vector3(...f.base)).applyQuaternion(S).add(new THREE.Vector3(...f.base)).multiplyScalar(0.001);
        gb.pos.splice(v * 3, 3, v3.x, v3.y, v3.z);
        v3.fromArray(gb.nrm, v * 3).applyQuaternion(S);
        gb.nrm.splice(v * 3, 3, v3.x, v3.y, v3.z);
      }
    }
    const F = fold?.world.get(f.name);
    if (F) {
      // contact evaluated where the feather lies when folded, expressed in its bind (spread) frame
      const Rinv = F.R.clone().invert();
      for (let v = m.v; v < gb.count; v++) {
        const pf = new THREE.Vector3(...bindMM(v)).sub(new THREE.Vector3(...f.base)).applyQuaternion(F.R).add(F.base);
        const [n, mask] = contact(pf.toArray());
        gb.setContact(v, new THREE.Vector3(...n).applyQuaternion(Rinv).toArray(), mask);
        // bent onto its layer of the folded-wing shell
        // (LOD1/2: a little higher over their coarser body, whose facets stand up to about half a millimetre off the
        // outline — invisible from the distances they are shown at)
        const nb = new THREE.Vector3();
        const cw = conformAt(fr, pf, gb.uv[v * 2 + 1], gb.uv[v * 2], sdf, torso, nb);
        if (detail && foldLayer(f) >= 0) cw.addScaledVector(nb, 0.35 * detail * smooth01(0, 0.22, gb.uv[v * 2 + 1]));
        const c = cw.applyQuaternion(Rinv).multiplyScalar(0.001);
        gb.conform.splice(v * 3, 3, c.x, c.y, c.z);
        // …and shaded like the surface it lies on (a quarter of its own vane's tilt kept), so neighbouring
        // feathers of a row do not read as separately tilted plates
        const n0 = new THREE.Vector3().fromArray(gb.nrm, v * 3);
        const dn = nb.applyQuaternion(Rinv).multiplyScalar(0.75).addScaledVector(n0, 0.25).normalize().sub(n0);
        gb.conformN.splice(v * 3, 3, dn.x, dn.y, dn.z);
      }
    }
  }
  const leftToRight = (i) => {
    const name = spec.boneNames[i];
    if (name && name.endsWith('_L')) return boneIndex[name.slice(0, -2) + '_R'] ?? i;
    return i;
  };
  gb.mirrorFrom(wingStart, leftToRight);

  // ---- Tail ----
  for (const f of spec.tailFeathers) {
    if (detail >= 2 && f.type === 'upperTailCovert') continue;
    if (detail >= 2 && f.type === 'rectrix' && f.index % 2 === 0) continue;
    const yaw = f.yaw;
    // tail 7.7° below the body frame (tip at (−85, 55.1) with the shaft's bend, spec §11); the under-tail coverts
    // run flatter along the vent
    const dir = [Math.sin(yaw), f.type === 'underTailCovert' ? -0.06 : -0.11, -Math.cos(yaw)];
    const dl = Math.hypot(dir[0], dir[1], dir[2]);
    const d = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
    // outer vane faces away from the tail midline
    const side = [f.side * Math.cos(yaw), 0, f.side * Math.sin(yaw) * 1];
    const fr = { ...f, innerVane: f.type === 'rectrix' ? 0.6 : 0.55 };
    if (detail >= 2 && f.type === 'rectrix') fr.width *= 1.8;
    const covert = f.type === 'upperTailCovert' || f.type === 'underTailCovert';
    const conform = covert
      ? (p) => {
          const up = f.type === 'upperTailCovert' ? 1 : -1;
          // stacked like the other coverts (inner over outer, left over right) instead of coplanar (z-fighting)
          const lift = 0.9 + (2 - f.index) * 0.3 + (f.side > 0 ? 0.1 : 0) + 0.4 * detail; // (coarser LOD bodies)
          // straight over / under the tail, but lying on the rump / vent wherever the body is in the way:
          // raised (lowered) vertically to `lift` above the outline. (Closest-point projection of the
          // rooted bases scattered neighbouring rows onto different sides and the straight part dived
          // 3–4 mm into the rump.)
          const q = [p[0], p[1] + up * 0.8, p[2]];
          if (sdf(q[0], q[1], q[2]) < lift) {
            let a = 0;
            let b = 0.5;
            while (sdf(q[0], q[1] + up * b, q[2]) < lift && b < 40) [a, b] = [b, b + 0.5];
            for (let it = 0; it < 12; it++) {
              const m = (a + b) / 2;
              if (sdf(q[0], q[1] + up * m, q[2]) < lift) a = m;
              else b = m;
            }
            q[1] += up * b;
          }
          return [q, [0, up, 0]];
        }
      : undefined;
    // coverts lie on the rump: skinned like the body surface under them, so they never cut into it when the
    // tail bone pitches; rectrices ride their own bones
    const bone = covert ? spineSkin : { idx: [boneIndex[f.bone]], w: [1] };
    const m = gb.mark();
    emitFeather(gb, fr, { base: f.base, dir: d, side, normal: f.type === 'underTailCovert' ? [0, -1, 0] : [0, 1, 0] }, bone, FEATHER_TYPE[f.type], rng(), { ...segs, conform, sweep: 0.0 });
    if (covert) for (let v = m.v; v < gb.count; v++) gb.setContact(v, ...contact(bindMM(v), 8));
  }

  // ---- Scapulars (body feathers lying on the mantle, conformed to the SDF surface) ----
  if (detail <= 1) {
    for (const f of buildScapularLayout()) {
      const [bp, bn] = projectToSurface(sdf, f.seed[0], f.seed[1], f.seed[2]);
      let dir = [f.outward, -0.12, -1];
      const dd = dir[0] * bn[0] + dir[1] * bn[1] + dir[2] * bn[2];
      dir = [dir[0] - dd * bn[0], dir[1] - dd * bn[1], dir[2] - dd * bn[2]];
      const dl = Math.hypot(...dir);
      dir = dir.map((v) => v / dl);
      const side = [dir[1] * bn[2] - dir[2] * bn[1], dir[2] * bn[0] - dir[0] * bn[2], dir[0] * bn[1] - dir[1] * bn[0]].map((v) => v * f.side);
      // over the folded-wing shell (wingFold.foldLayer ≤ 1.5 mm), row 0 over row 1
      const lift = 1.6 + f.layer * 0.1;
      const conform = (p) => {
        const [pp, nn] = projectToSurface(sdf, p[0], p[1], p[2]);
        return [[pp[0] + nn[0] * lift, pp[1] + nn[1] * lift, pp[2] + nn[2] * lift], nn];
      };
      const m = gb.mark();
      emitFeather(gb, f, { base: bp, dir, side, normal: bn }, spineSkin, FEATHER_TYPE.scapular, rng(), { ...segs, conform });
      for (let v = m.v; v < gb.count; v++) gb.setContact(v, ...contact(bindMM(v)));
    }
  }
  return gb.build();
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
