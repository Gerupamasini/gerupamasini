import { Bone, Matrix4, Quaternion, Skeleton, Vector3 } from 'three';
import { ABDOMEN, CHELIPED, EYE, LEGS, MXP3, STANCE, CARAPACE } from './ScopimeraGlobosaMorphology.js';
import { clamp } from './util.js';

/**
 * Bone hierarchy and joint mechanics of the crab.
 *
 *   CrabRoot (Group, world placement)
 *   └── Root (ground point under the body)
 *       └── Body (sternum centre; height / pitch / roll / sway)
 *           ├── EyeStalk_L ─ EyeStalk_L_Distal          (fold + look; left and right independent)
 *           ├── EyeStalk_R ─ EyeStalk_R_Distal
 *           ├── Mxp3_L, Mxp3_R                          (third maxillipeds: opercular plates, hinged laterally)
 *           ├── Mouth                                   (where the sorted sand gathers into a pellet)
 *           ├── Abdomen_M / Abdomen_F                   (one of the two is collapsed by sex)
 *           ├── Cheliped_L_Coxa ─ Basis ─ Ischium ─ Merus ─ Carpus ─ Propodus ─ Dactylus
 *           ├── Cheliped_R_…
 *           ├── Leg_L1_Coxa ─ Basis ─ Ischium ─ Merus ─ Carpus ─ Propodus ─ Dactylus   (P2)
 *           ├── … Leg_L4 (P5), Leg_R1 … Leg_R4
 *
 * Joint mechanics follow the brachyuran walking leg: thorax–coxa promotion/remotion (yaw), coxa–basis
 * levation/depression, basis and ischium FUSED (basi-ischium: the Ischium bone exists for naming and the suture
 * line, but its joint is locked), ischium–merus nearly immobile, merus–carpus flexion (the "knee"), carpus–propodus
 * a small anterior/posterior bend, propodus–dactylus flexion. All flexions of a walking leg act in one vertical
 * plane; the coxa yaw turns that plane.
 *
 * Every appendage bone runs along its local +X (proximal → distal), +Y dorsal in its flexion plane, +Z = X × Y.
 * Bind pose: limbs straight along X from their socket (the geometry is built in this pose; rigid skinning).
 */

export const SEGMENTS = ['Coxa', 'Basis', 'Ischium', 'Merus', 'Carpus', 'Propodus', 'Dactylus'];
export const SIDES = [{ id: 'L', sign: 1 }, { id: 'R', sign: -1 }];

const DEG = Math.PI / 180;
const _m = new Matrix4();
const _v = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _q = new Quaternion();
const _ccdT = new Vector3();
const _ccdC = new Vector3();
const Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);

function basisQuat(xAxis, upHint) {
  const x = xAxis.clone().normalize();
  const y = upHint.clone().addScaledVector(x, -upHint.dot(x)).normalize();
  const z = new Vector3().crossVectors(x, y);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

/** joint limits (radians) per segment of a walking leg: [axis, min, max] */
export const LEG_JOINTS = {
  Coxa: ['y', -0.62, 0.62],
  Basis: ['z', -0.75, 1.25],
  Ischium: ['z', 0, 0],          // fused basi-ischium
  Merus: ['y', -0.08, 0.08],     // ischium–merus: barely moves in crabs
  Carpus: ['z', -2.55, -0.12],   // merus–carpus flexion (always bent)
  Propodus: ['y', -0.35, 0.35],  // carpus–propodus: small fore/aft bend
  Dactylus: ['z', -1.35, 0.55],
};

/**
 * Cheliped postures (coxa, basis, ischium, merus, carpus, propodus, dactylus; radians; + = medial / raise / open).
 * fold: carried folded in front of the face, palms vertical, fingers down (002–005) [P]; scoop: reaching down to
 * the sand ahead; mouth: fingertips at the buccal frame; wave: raised high (the male's display) [L].
 */
export const CHELA_POSES = {
  fold: [0.02, 0.92, 0, 0.12, 1.62, -1.55, 0.03],
  scoop: [0.05, 0.25, 0, 0.12, 1.25, -1.15, 0.3],
  mouth: [0.1, 0.95, 0, 0.25, 1.8, -1.2, 0.05],
  wave: [-0.15, 1.6, 0, -0.2, 0.45, 0.1, 0.1],
  guard: [0.0, 1.05, 0, 0.05, 1.2, -0.8, 0.25],
  tuck: [0.18, 0.7, 0, 0.45, 1.85, -1.6, 0.0],
};

/** cheliped joints: [axis, min, max] */
export const CHELA_JOINTS = {
  Coxa: ['y', -0.45, 0.6],
  Basis: ['z', -1.1, 1.75],      // the whole limb up (waving) or down (scooping)
  Ischium: ['z', 0, 0],
  Merus: ['y', -0.35, 0.65],     // swing in front of the face
  Carpus: ['y', -0.2, 1.85],     // fold the chela medially
  Propodus: ['z', -1.6, 0.9],    // wrist: fingers down … level
  Dactylus: ['z', 0, 0.55],      // gape
};

/**
 * Static description of the bones in bind pose (local transforms), in hierarchy order. Pure data.
 * @returns {{ name: string, parent: number, pos: Vector3, quat: Quaternion, limb?: string, seg?: string, side?: number }[]}
 */
export function rigDefinition() {
  const out = [];
  const add = (name, parent, pos, quat = new Quaternion(), extra = {}) => { out.push({ name, parent, pos, quat, ...extra }); return out.length - 1; };
  const root = add('Root', -1, new Vector3());
  const body = add('Body', root, new Vector3(0, STANCE.bodyHeight.calm, 0));

  for (const { id, sign } of SIDES) {
    // eyestalk, erect: up, leaning out and a little forward; its local Y faces forward
    const out_ = EYE.erectOutDeg * DEG, fwd = EYE.erectForwardDeg * DEG;
    const dir = new Vector3(sign * Math.sin(out_), Math.cos(out_) * Math.cos(fwd), Math.sin(fwd)).normalize();
    const [ex, ey, ez] = CARAPACE.eyeBase;
    const e = add(`EyeStalk_${id}`, body, new Vector3(sign * ex, ey, ez), basisQuat(dir, Z), { limb: `Eye_${id}`, side: sign });
    add(`EyeStalk_${id}_Distal`, e, new Vector3(EYE.baseLen, 0, 0), new Quaternion(), { limb: `Eye_${id}`, side: sign });
  }
  for (const { id, sign } of SIDES) {
    // third maxilliped: X from the lateral hinge toward the midline, Y the plate's outer normal (forward, leaning
    // back with the face), Z along the hinge
    const lean = MXP3.leanDeg * DEG;
    const xAx = new Vector3(-sign, 0, 0);
    const yAx = new Vector3(0, Math.sin(lean), Math.cos(lean));
    const [hx, hy, hz] = MXP3.hinge;
    add(`Mxp3_${id}`, body, new Vector3(sign * hx, hy, hz), basisQuat(xAx, yAx), { limb: `Mxp3_${id}`, side: sign });
  }
  // where the sorted sand is pressed into a pellet: above the mouth, at the top of the buccal frame [L]
  add('Mouth', body, new Vector3(0, 0.31, 0.445));
  add('Abdomen_M', body, new Vector3(0, -0.004, ABDOMEN.z0));
  add('Abdomen_F', body, new Vector3(0, -0.004, ABDOMEN.z0));

  for (const { id, sign } of SIDES) {
    const C = CHELIPED;
    const yaw = C.yawDeg * DEG, pitch = C.pitchDeg * DEG;
    const dir = new Vector3(sign * Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    const lens = [C.coxa, C.basis, C.ischium, C.merus, C.carpus, C.palm];
    let parent = body;
    for (let s = 0; s < SEGMENTS.length; s++) {
      const seg = SEGMENTS[s];
      const pos = s === 0 ? new Vector3(sign * C.base[0], C.base[1], C.base[2])
        : seg === 'Dactylus' ? new Vector3(C.palm - 0.012, C.palmH * 0.22, 0)
          : new Vector3(lens[s - 1], 0, 0);
      // the right limb's local Z points the other way (Z = X × Y); flexions are mirrored by the joint signs
      const quat = s === 0 ? basisQuat(dir, Y) : new Quaternion();
      parent = add(`Cheliped_${id}_${seg}`, parent, pos, quat, { limb: `Cheliped_${id}`, seg, side: sign });
    }
  }
  for (const { id, sign } of SIDES) {
    for (const L of LEGS) {
      const yaw = L.yawDeg * DEG;
      const dir = new Vector3(sign * Math.cos(yaw), 0, Math.sin(yaw));
      const lens = [L.coxa, L.basis, L.ischium, L.merus, L.carpus, L.propodus];
      let parent = body;
      for (let s = 0; s < SEGMENTS.length; s++) {
        const seg = SEGMENTS[s];
        const pos = s === 0 ? new Vector3(sign * L.base[0], L.base[1], L.base[2]) : new Vector3(lens[s - 1], 0, 0);
        const quat = s === 0 ? basisQuat(dir, Y) : new Quaternion();
        parent = add(`Leg_${id}${L.name}_${seg}`, parent, pos, quat, { limb: `Leg_${id}${L.name}`, seg, side: sign });
      }
    }
  }
  return out;
}

let DEF = null;
/** the shared definition, plus each bone's bind matrix relative to Root (for building the skinned geometry) */
export function sharedRig() {
  if (DEF) return DEF;
  const bones = rigDefinition();
  const bind = [];
  for (let i = 0; i < bones.length; i++) {
    const b = bones[i];
    const local = new Matrix4().compose(b.pos, b.quat, new Vector3(1, 1, 1));
    bind.push(b.parent < 0 ? local : new Matrix4().multiplyMatrices(bind[b.parent], local));
  }
  const index = new Map(bones.map((b, i) => [b.name, i]));
  DEF = { bones, bind, index };
  return DEF;
}

/**
 * Knee (merus–carpus) interior angles that bound a stance: up to COMFORT_GAMMA the leg still looks like a crab's —
 * knee high, carpus and propodus angled down to the sand — and a home foot point is never placed beyond it;
 * MAX_GAMMA is as straight as a planted leg may be pulled before the foot must be lifted or the body lowered.
 */
const COMFORT_GAMMA = 140 * DEG;
const MAX_GAMMA = 168 * DEG;
/** and inward: folded tighter than this the leg looks cramped (a foot that close lifts and steps out) */
const FOLD_GAMMA = 62 * DEG;
const FOLD_HARD_GAMMA = 44 * DEG;
/** reach tables are the same for every crab (legs are not scaled per individual): one per leg and side */
const REACH_CACHE = new Map();
const REACH_STEP = 0.025, REACH_N = 33;              // drop below the coxa socket: 0 … 0.8 CW

/** Analytic walking-leg IK in the leg's vertical plane (coxa yaw, levation, knee, dactylus). */
export class LegRig {
  constructor(bones, side, spec) {
    this.side = side;
    this.spec = spec;
    this.coxa = bones[0]; this.basis = bones[1]; this.ischium = bones[2]; this.merus = bones[3];
    this.carpus = bones[4]; this.propodus = bones[5]; this.dactylus = bones[6];
    this.bindQuat = this.coxa.quaternion.clone();
    this.base = this.coxa.position.clone();
    this.c = spec.coxa;
    this.l1 = spec.basis + spec.ischium + spec.merus;
    this.l2 = spec.carpus + spec.propodus;
    this.l3 = spec.dactylus;
    this.reach = this.c + this.l1 + this.l2 + this.l3;
    /** current joint angles */
    this.ang = { yaw: 0, lev: 0, knee: -1.2, cp: 0, dac: -0.5 };
    this.invBind = this.bindQuat.clone().invert();
    /** last IK residual (CW units): > 0 means the target was out of reach or clamped */
    this.error = 0;
    /** knee interior angle of the last plan, and whether the dactylus had to lie flatter to reach */
    this.gamma = Math.PI / 2;
    this.flat = false;
    this.tables = null;
  }

  /**
   * Solve for a foot (dactylus tip) target given in Body space. dactylAbs: the dactylus' angle from the
   * horizontal in the leg plane (negative = pointing down). Writes the bone rotations.
   */
  solve(target, dactylAbs = STANCE.dactylDeg * DEG, cpBend = 0) {
    this.error = this.plan(target, dactylAbs, cpBend, this.ang);
    this.apply();
    return this.error;
  }

  /** the IK without touching the bones: joint angles into A, returns the residual (CW) */
  plan(target, dactylAbs, cpBend, A) {
    const J = LEG_JOINTS;
    // target in the coxa's bind frame
    _v.copy(target).sub(this.base).applyQuaternion(this.invBind);
    let yaw = Math.atan2(-_v.z, _v.x);
    yaw = clamp(yaw, J.Coxa[1], J.Coxa[2]);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const u = _v.x * cy - _v.z * sy - this.c;          // outward from the coxa–basis joint
    const w = _v.y;                                      // up
    const outOfPlane = Math.abs(_v.x * sy + _v.z * cy);
    // propodus–dactylus joint target
    let a = dactylAbs;
    let qu = u - this.l3 * Math.cos(a), qv = w - this.l3 * Math.sin(a);
    const l1 = this.l1, l2 = this.l2;
    let d = Math.hypot(qu, qv);
    this.flat = false;
    // out of reach: let the dactylus lie flatter before giving up (the tip still reaches the sand)
    if (d > l1 + l2 - 1e-4) {
      this.flat = true;
      for (let k = 0; k < 6 && d > l1 + l2 - 1e-4; k++) {
        a = a * 0.75;
        qu = u - this.l3 * Math.cos(a); qv = w - this.l3 * Math.sin(a);
        d = Math.hypot(qu, qv);
      }
    }
    let lev = 0, knee = 0, dac = 0, gamma = 0;
    this.tilted = false;
    // a folded leg cannot keep the dactylus at its stance angle (the propodus–dactylus joint runs out): let the
    // dactylus tilt by what the joint lacks and solve again (twice is plenty)
    for (let pass = 0; pass < 3; pass++) {
      const dc = clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
      const phi = Math.atan2(qv, qu);
      const a1 = Math.acos(clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1));
      gamma = Math.acos(clamp((l1 * l1 + l2 * l2 - dc * dc) / (2 * l1 * l2), -1, 1));
      lev = clamp(phi + a1, J.Basis[1], J.Basis[2]);           // knee up: the merus rises from the body
      knee = clamp(-(Math.PI - gamma), J.Carpus[1], J.Carpus[2]);
      const want = a - (lev + knee);
      dac = clamp(want, J.Dactylus[1], J.Dactylus[2]);
      if (Math.abs(want - dac) < 1e-4) break;
      this.tilted = true;
      a += dac - want;
      qu = u - this.l3 * Math.cos(a); qv = w - this.l3 * Math.sin(a);
      d = Math.hypot(qu, qv);
    }
    this.gamma = gamma;
    A.yaw = yaw; A.lev = lev; A.knee = knee; A.dac = dac; A.cp = clamp(cpBend, J.Propodus[1], J.Propodus[2]);
    // residual: forward kinematics in the plane
    const a2 = lev + knee, a3 = a2 + dac;
    const fu = Math.cos(lev) * l1 + Math.cos(a2) * l2 + Math.cos(a3) * this.l3;
    const fv = Math.sin(lev) * l1 + Math.sin(a2) * l2 + Math.sin(a3) * this.l3;
    return Math.hypot(fu - u, fv - w) + outOfPlane * 0.5;
  }

  /**
   * How far (CW, horizontally from the coxa socket) the foot can stand when it is `drop` below the socket, with
   * the dactylus at its stance angle: { comf, max } arrays over drop 0 … 0.8 CW, built once per leg and side.
   */
  reachTables() {
    if (this.tables) return this.tables;
    const key = `${this.spec.name}${this.side}`;
    let T = REACH_CACHE.get(key);
    if (!T) {
      const A = { yaw: 0, lev: 0, knee: 0, cp: 0, dac: 0 };
      const t = new Vector3();
      const dac = STANCE.dactylDeg * DEG;
      // a foot at radius r, `drop` below the socket, along the leg's own direction: solvable, and how bent?
      const test = (r, drop) => {
        this.homeFoot(t, r, 0, 0);
        t.y = this.base.y - drop;
        return this.plan(t, dac, 0, A) < 1e-3;
      };
      const okOut = (r, drop, gmax) => test(r, drop) && !this.flat && this.gamma <= gmax;
      const okIn = (r, drop, gmin, tilt) => test(r, drop) && !this.flat && this.gamma >= gmin && (tilt || !this.tilted);
      // outward bound: from beyond the leg's length inward to the first radius that works
      const outer = (gmax) => {
        const arr = new Float32Array(REACH_N);
        for (let j = 0; j < REACH_N; j++) {
          const drop = j * REACH_STEP;
          let r = this.reach + 0.1;
          while (r > 0.05 && !okOut(r, drop, gmax)) r -= 0.02;
          if (r <= 0.05) { arr[j] = 0; continue; }
          let lo = r, hi = r + 0.02;
          for (let it = 0; it < 8; it++) { const mid = (lo + hi) / 2; if (okOut(mid, drop, gmax)) lo = mid; else hi = mid; }
          arr[j] = lo;
        }
        return arr;
      };
      // inward bound: from the comfortable outer radius inward while the knee stays open enough
      const inner = (outerArr, gmin, tilt) => {
        const arr = new Float32Array(REACH_N);
        for (let j = 0; j < REACH_N; j++) {
          const drop = j * REACH_STEP;
          let r = outerArr[j] - 0.01;
          if (r <= 0.05 || !okIn(r, drop, gmin, tilt)) { arr[j] = Math.max(0.05, r); continue; }
          while (r - 0.02 > 0.05 && okIn(r - 0.02, drop, gmin, tilt)) r -= 0.02;
          let lo = Math.max(0.05, r - 0.02), hi = r;
          for (let it = 0; it < 8; it++) { const mid = (lo + hi) / 2; if (okIn(mid, drop, gmin, tilt)) hi = mid; else lo = mid; }
          arr[j] = hi;
        }
        return arr;
      };
      const comf = outer(COMFORT_GAMMA), max = outer(MAX_GAMMA);
      T = { comf, max, fold: inner(comf, FOLD_GAMMA, false), foldHard: inner(max, FOLD_HARD_GAMMA, true) };
      REACH_CACHE.set(key, T);
    }
    this.tables = T;
    return T;
  }

  /** comfortable (or, hard = true, the most) horizontal reach for a foot `drop` below the coxa socket */
  maxReach(drop, hard = false) {
    const arr = hard ? this.reachTables().max : this.reachTables().comf;
    const x = clamp(drop / REACH_STEP, 0, REACH_N - 1.001);
    const j = Math.floor(x), f = x - j;
    return arr[j] * (1 - f) + arr[j + 1] * f;
  }

  /** the nearest comfortable (or, hard = true, the tightest) foot radius for a foot `drop` below the socket */
  minReach(drop, hard = false) {
    const arr = hard ? this.reachTables().foldHard : this.reachTables().fold;
    const x = clamp(drop / REACH_STEP, 0, REACH_N - 1.001);
    const j = Math.floor(x), f = x - j;
    return arr[j] * (1 - f) + arr[j + 1] * f;
  }

  /** the deepest drop below the coxa socket at which a foot r away (horizontally) can still be reached */
  maxDrop(r, hard = true) {
    const arr = hard ? this.reachTables().max : this.reachTables().comf;
    if (arr[REACH_N - 1] >= r) return (REACH_N - 1) * REACH_STEP;
    for (let j = REACH_N - 2; j >= 0; j--) {
      if (arr[j] >= r) return (j + (arr[j] - r) / Math.max(1e-6, arr[j] - arr[j + 1])) * REACH_STEP;
    }
    // not reachable at any height: the drop where the leg reaches furthest
    let best = 0;
    for (let j = 1; j < REACH_N; j++) if (arr[j] > arr[best]) best = j;
    return best * REACH_STEP;
  }

  apply() {
    const A = this.ang;
    this.coxa.quaternion.copy(this.bindQuat).multiply(_q.setFromAxisAngle(Y, A.yaw));
    this.basis.quaternion.setFromAxisAngle(Z, A.lev);
    this.ischium.quaternion.identity();
    this.merus.quaternion.identity();
    this.carpus.quaternion.setFromAxisAngle(Z, A.knee);
    this.propodus.quaternion.setFromAxisAngle(Y, A.cp * this.side);
    this.dactylus.quaternion.setFromAxisAngle(Z, A.dac);
  }

  /** Foot (dactylus tip) position in Body space for the current angles. */
  footBody(out) {
    const A = this.ang;
    const a2 = A.lev + A.knee, a3 = a2 + A.dac;
    const u = this.c + Math.cos(A.lev) * this.l1 + Math.cos(a2) * this.l2 + Math.cos(a3) * this.l3;
    const v = Math.sin(A.lev) * this.l1 + Math.sin(a2) * this.l2 + Math.sin(a3) * this.l3;
    out.set(u * Math.cos(A.yaw), v, -u * Math.sin(A.yaw)).applyQuaternion(this.bindQuat).add(this.base);
    return out;
  }

  /** The leg's natural foot point (Body space) for a stance reach r (CW) and body height h. */
  homeFoot(out, r, h, yawOffset = 0) {
    out.set(Math.cos(yawOffset), 0, -Math.sin(yawOffset)).multiplyScalar(r).applyQuaternion(this.bindQuat);
    out.y = 0;
    out.add(_v2.set(this.base.x, 0, this.base.z));
    out.y = -h;
    return out;
  }
}

/**
 * Cheliped: CCD toward a fingertip target in Body space, with per-joint axes and limits, then a wrist pass so the
 * fingers meet the sand at the wanted pitch.
 */
export class ChelaRig {
  constructor(bones, side) {
    this.side = side;
    this.bones = bones;                    // Coxa … Dactylus
    this.bindQuat = bones[0].quaternion.clone();
    this.names = SEGMENTS;
    this.ang = [0, 0, 0, 0, 0, 0, 0];
    this.axes = SEGMENTS.map((s) => (CHELA_JOINTS[s][0] === 'y' ? Y : Z));
    this.limits = SEGMENTS.map((s) => [CHELA_JOINTS[s][1], CHELA_JOINTS[s][2]]);
    // tip of the closed fingers in the Propodus frame
    this.tipLocal = new Vector3(CHELIPED.palm + CHELIPED.finger * 0.96, -CHELIPED.palmH * 0.12, 0);
    this.frames = SEGMENTS.map(() => ({ p: new Vector3(), q: new Quaternion() }));
    this.error = 0;
    this.scale = 1;
  }

  /** side-aware sign: about local Y a positive angle swings medially on both sides */
  sgn(i) { return this.axes[i] === Y ? -this.side : 1; }

  /** set all joints from a posture (radians, coxa … dactylus) */
  setPose(a) {
    for (let i = 0; i < 7; i++) this.ang[i] = a[i];
    this.apply();
  }

  /** forward kinematics in Body space (positions and orientations of each joint frame) */
  fk() {
    const s = this.scale;
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i], f = this.frames[i];
      const rot = _q.setFromAxisAngle(this.axes[i], this.ang[i] * this.sgn(i));
      if (i === 0) {
        f.p.copy(b.position);
        f.q.copy(this.bindQuat).multiply(rot);
      } else {
        const pf = this.frames[i - 1];
        f.p.copy(b.position).multiplyScalar(s).applyQuaternion(pf.q).add(pf.p);
        f.q.copy(pf.q).multiply(rot);
      }
    }
  }

  tip(out) {
    const f = this.frames[5];
    return out.copy(this.tipLocal).multiplyScalar(this.scale).applyQuaternion(f.q).add(f.p);
  }

  /**
   * @param target fingertip target (Body space)
   * @param wristPitch wanted pitch of the finger axis relative to the Body's horizontal (rad, negative = down), or null
   * @param joints which joints CCD may move (indices), default coxa, basis, merus, carpus, propodus
   */
  solve(target, wristPitch = null, iters = 8, joints = [5, 4, 3, 1, 0], init = null) {
    const tipW = _v3;
    // start from an anatomical posture each time: CCD then settles on the nearby natural solution
    if (init) for (let i = 0; i < 7; i++) this.ang[i] = init[i];
    for (let it = 0; it < iters; it++) {
      for (const i of joints) {
        this.fk();
        this.tip(tipW);
        const f = this.frames[i];
        // the joint axis in Body space (sign folded in, so a positive step always turns about +axis)
        const axis = _v.copy(this.axes[i]).multiplyScalar(this.sgn(i)).applyQuaternion(f.q).normalize();
        const e = _v2.copy(tipW).sub(f.p);
        const t = _ccdT.copy(target).sub(f.p);
        e.addScaledVector(axis, -e.dot(axis));
        t.addScaledVector(axis, -t.dot(axis));
        if (e.lengthSq() < 1e-10 || t.lengthSq() < 1e-10) continue;
        e.normalize(); t.normalize();
        const ang = Math.atan2(_ccdC.crossVectors(e, t).dot(axis), e.dot(t));
        const [lo, hi] = this.limits[i];
        this.ang[i] = clamp(this.ang[i] + ang * 0.9, lo, hi);
      }
      if (wristPitch !== null) {
        // wrist pass: rotate the propodus so the finger axis has the wanted pitch
        this.fk();
        const f = this.frames[5];
        const fx = _v.set(1, 0, 0).applyQuaternion(f.q);
        const pitchNow = Math.asin(clamp(fx.y, -1, 1));
        const [lo, hi] = this.limits[5];
        this.ang[5] = clamp(this.ang[5] + (wristPitch - pitchNow) * 0.8, lo, hi);
      }
    }
    this.fk();
    this.tip(tipW);
    this.error = tipW.distanceTo(target);
    this.apply();
    return this.error;
  }

  apply() {
    for (let i = 0; i < this.bones.length; i++) {
      const rot = _q.setFromAxisAngle(this.axes[i], this.ang[i] * this.sgn(i));
      if (i === 0) this.bones[0].quaternion.copy(this.bindQuat).multiply(rot);
      else this.bones[i].quaternion.copy(rot);
    }
  }
}

/** Eyestalk: direction in Body space from erect/folded blend plus a look offset; never a rolling eyeball. */
export class EyeRig {
  constructor(base, distal, side) {
    this.base = base;
    this.distal = distal;
    this.side = side;
    this.bindQuat = base.quaternion.clone();
    this.bindDir = new Vector3(1, 0, 0).applyQuaternion(this.bindQuat);
    const fo = EYE.foldOutDeg * DEG, ff = EYE.foldForwardDeg * DEG;
    this.foldDir = new Vector3(side * Math.sin(fo), Math.cos(fo) * Math.cos(ff), Math.sin(ff)).normalize();
    this.dir = this.bindDir.clone();
  }

  /** fold: 0 erect … 1 lying in the orbit; look: desired direction (Body space, unit) or null; strength 0..1 */
  pose(fold, look, strength, bend = 0) {
    const d = _v.copy(this.bindDir).lerp(this.foldDir, fold).normalize();
    if (look && strength > 0) {
      // a stalk swings a little toward what it watches (±~25°), it does not roll
      const l = _v2.copy(look).normalize();
      const k = strength * 0.42 * (1 - fold);
      d.lerp(l, k).normalize();
      // keep it from tipping below the carapace line
      if (d.y < 0.15 && fold < 0.5) { d.y = 0.15; d.normalize(); }
    }
    this.dir.copy(d);
    _q.setFromUnitVectors(this.bindDir, d);
    this.base.quaternion.copy(_q).multiply(this.bindQuat);
    this.distal.quaternion.setFromAxisAngle(Z, bend);
  }
}

/** Per-crab bone instances (all crabs share the bind pose; each has its own bones and skeleton). */
export function createRigInstance() {
  const def = sharedRig();
  const bones = def.bones.map((b) => {
    const bone = new Bone();
    bone.name = b.name;
    bone.position.copy(b.pos);
    bone.quaternion.copy(b.quat);
    return bone;
  });
  def.bones.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
  const by = (n) => bones[def.index.get(n)];
  const root = bones[0];
  root.updateMatrixWorld(true);
  const boneInverses = def.bind.map((m) => m.clone().invert());
  const skeleton = new Skeleton(bones, boneInverses);
  const legs = [];
  for (const { id, sign } of SIDES) for (const L of LEGS) legs.push(new LegRig(SEGMENTS.map((s) => by(`Leg_${id}${L.name}_${s}`)), sign, L));
  const chelae = SIDES.map(({ id, sign }) => new ChelaRig(SEGMENTS.map((s) => by(`Cheliped_${id}_${s}`)), sign));
  const eyes = SIDES.map(({ id, sign }) => new EyeRig(by(`EyeStalk_${id}`), by(`EyeStalk_${id}_Distal`), sign));
  return {
    root, bones, skeleton, by,
    body: by('Body'), mouth: by('Mouth'),
    mxp: [by('Mxp3_L'), by('Mxp3_R')], mxpBind: [by('Mxp3_L').quaternion.clone(), by('Mxp3_R').quaternion.clone()],
    abdomen: { m: by('Abdomen_M'), f: by('Abdomen_F') },
    legs, chelae, eyes,
  };
}

/** helpers for the order legs are listed in: index = side * 4 + (pereiopod - 2) */
export const legIndex = (sideIdx, k) => sideIdx * 4 + k;

export { DEG };
