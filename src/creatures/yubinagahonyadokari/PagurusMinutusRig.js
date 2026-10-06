// Skeleton of ユビナガホンヤドカリ: bone hierarchy, joint conventions and the analytic leg IK.
//
// Joint model (decapod pereopods articulate through a series of single-axis, dicondylic joints whose
// planes are successively perpendicular – Vidal-Gadea et al. 2008; Chapple 2012 for Pagurus):
//   Coxa      : promotion / remotion  → rotation about the body's vertical axis (local Y)        "TC"
//   Basis     : levation / depression → rotation about the leg's hinge axis (local Z)            "CB"
//   Ischium   : fused to the basis (immobile basi-ischial suture, no arthrodial membrane) – a rigid
//               child bone so the segment exists in the rig and the mesh; it never rotates  [G] decapods
//   Merus     : fixed in walking legs (ischio-meral joint carries the cheliped's roll)             "B/IM"
//   Carpus    : flexion of the merus–carpus "knee" (local Z)                                      "MC"
//   Propodus  : carpo-propodal flexion (local Z) – horizontal swing (local Y) in chelipeds         "CP"
//   Dactylus  : propodo-dactyl flexion (local Z); gape (local Y) in chelipeds                    "PD"
// Every leg bone's local +X runs distally along the segment; local +Y is dorsal in the leg plane;
// positive rotation about Z lifts the distal part, negative flexes it ventrally.
//
// Names follow the brief: walking legs Leg_L1/R1 (= P2), Leg_L2/R2 (= P3); reduced shell-holding legs
// Leg_L3/R3 (= P4), Leg_L4/R4 (= P5); Cheliped_L/R (= P1); EyeStalk_L/R; Antenna1_L/R (antennules);
// Antenna2_L/R (antennae); Abdomen; ShellAnchor.
import * as THREE from 'three';
import { MORPH } from './PagurusMinutusMorphology.js';
import { clamp } from './PagurusMinutusUtil.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

/** share of the fused basi-ischium length taken by the basis (the ischium is the longer, distal part) [S] */
export const BASIS_FRACTION = 0.42;
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** quaternion mapping local +X to `dir` with local +Y as close as possible to `up` */
export function quatFromDir(dir, up = Y, out = new THREE.Quaternion()) {
  const x = _v.copy(dir).normalize();
  let y = _w.copy(up).addScaledVector(x, -up.dot(x));
  if (y.lengthSq() < 1e-8) y.set(0, 0, 1).addScaledVector(x, -x.z);
  y.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}

/** yaw angle that maps local +X onto the horizontal direction (dx, dz) */
export const yawFor = (dx, dz) => Math.atan2(-dz, dx);

function bone(name, parent, pos, quat) {
  const b = new THREE.Bone();
  b.name = name;
  if (pos) b.position.copy(pos);
  if (quat) b.quaternion.copy(quat);
  if (parent) parent.add(b);
  return b;
}

const V = (o) => new THREE.Vector3(o.x, o.y, o.z);

/**
 * Builds the bone hierarchy in the bind pose (also the pose geometry is modelled in).
 * @param {{chelaR:number, chelaL:number}} ind individual dimensions from individualMorph()
 */
export class Rig {
  constructor(ind) {
    this.ind = ind;
    this.bones = {};
    this.list = [];
    const add = (name, parent, pos, quat) => {
      const b = bone(name, parent, pos, quat);
      this.bones[name] = b;
      this.list.push(b);
      return b;
    };
    const root = add('Body', null, new THREE.Vector3(0, 0, 0));
    this.root = root;

    // ── eyes ───────────────────────────────────────────────────────────────────────────────────
    const E = MORPH.eye;
    this.eyes = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const dir = new THREE.Vector3(s * Math.sin(E.restYaw), Math.sin(E.restPitch), Math.cos(E.restYaw)).normalize();
      const stalk = add(`EyeStalk_${side}`, root, new THREE.Vector3(s * E.base.x, E.base.y, E.base.z), quatFromDir(dir));
      const tip = add(`EyeStalk_${side}_Cornea`, stalk, new THREE.Vector3(E.length - E.corneaLength, 0, 0));
      this.eyes[side] = { side: s, stalk, tip, restDir: dir.clone(), length: E.length };
    }

    // ── antennules (A1): 3 peduncle articles + flagellum ────────────────────────────────────────
    const A1 = MORPH.antennule;
    this.antennules = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const dir = new THREE.Vector3(s * 0.12, 0.55, 0.83).normalize();
      const b0 = add(`Antenna1_${side}`, root, new THREE.Vector3(s * A1.base.x, A1.base.y, A1.base.z), quatFromDir(dir));
      const b1 = add(`Antenna1_${side}_2`, b0, new THREE.Vector3(A1.peduncle[0], 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, -0.5));
      const b2 = add(`Antenna1_${side}_3`, b1, new THREE.Vector3(A1.peduncle[1], 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, 0.75));
      const fl = add(`Antenna1_${side}_Flagellum`, b2, new THREE.Vector3(A1.peduncle[2], 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, -0.35));
      this.antennules[side] = { side: s, chain: [b0, b1, b2, fl], lengths: [...A1.peduncle, A1.flagellum], restQ: [b0, b1, b2, fl].map((b) => b.quaternion.clone()) };
    }

    // ── antennae (A2): peduncle (2 bones) + flagellum chain ─────────────────────────────────────
    const A2 = MORPH.antenna;
    this.antennaSegments = 12;
    this.antennae = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const dir = new THREE.Vector3(s * 0.32, 0.26, 0.9).normalize();
      const p0 = add(`Antenna2_${side}`, root, new THREE.Vector3(s * A2.base.x, A2.base.y, A2.base.z), quatFromDir(dir));
      const pedLen = A2.peduncle.reduce((a, b) => a + b, 0);
      const p1 = add(`Antenna2_${side}_Peduncle`, p0, new THREE.Vector3(pedLen * 0.5, 0, 0), new THREE.Quaternion().setFromAxisAngle(Y, s * 0.1));
      const flag = [];
      const segLen = A2.flagellum / this.antennaSegments;
      let parent = p1;
      for (let i = 0; i < this.antennaSegments; i++) {
        const b = add(`Antenna2_${side}_F${i}`, parent, new THREE.Vector3(i === 0 ? pedLen * 0.5 : segLen, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, i === 0 ? 0.05 : -0.035));
        flag.push(b);
        parent = b;
      }
      this.antennae[side] = { side: s, peduncle: [p0, p1], flagellum: flag, segLen, pedLen, restQ: [p0, p1, ...flag].map((b) => b.quaternion.clone()) };
    }

    // ── third maxillipeds ───────────────────────────────────────────────────────────────────────
    const M3 = MORPH.mxp3;
    this.mxp3 = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const dir = new THREE.Vector3(s * 0.08, 0.35, 0.93).normalize();
      const chain = [];
      let parent = root;
      let pos = new THREE.Vector3(s * M3.base.x, M3.base.y, M3.base.z);
      for (let i = 0; i < M3.segments.length; i++) {
        const q = i === 0 ? quatFromDir(dir) : new THREE.Quaternion().setFromAxisAngle(Z, i === 1 ? 0.45 : 0.25);
        const b = add(`Mxp3_${side}${i ? '_' + i : ''}`, parent, pos, q);
        chain.push(b);
        parent = b;
        pos = new THREE.Vector3(M3.segments[i], 0, 0);
      }
      this.mxp3[side] = { side: s, chain, lengths: M3.segments, restQ: chain.map((b) => b.quaternion.clone()) };
    }

    // ── chelipeds ───────────────────────────────────────────────────────────────────────────────
    this.chelipeds = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const C = MORPH.chelipeds[side];
      const chela = side === 'R' ? ind.chelaR : ind.chelaL;
      const c = MORPH.coxae.cheliped;
      const coxa = add(`Cheliped_${side}_Coxa`, root, new THREE.Vector3(s * c.x, c.y, c.z), new THREE.Quaternion().setFromAxisAngle(Y, yawFor(s * 0.62, 0.78)));
      const basis = add(`Cheliped_${side}_Basis`, coxa, new THREE.Vector3(C.coxa, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, 0.25));
      const ischium = add(`Cheliped_${side}_Ischium`, basis, new THREE.Vector3(C.basis * BASIS_FRACTION, 0, 0));
      const merus = add(`Cheliped_${side}_Merus`, ischium, new THREE.Vector3(C.basis * (1 - BASIS_FRACTION), 0, 0));
      const carpus = add(`Cheliped_${side}_Carpus`, merus, new THREE.Vector3(C.merus, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, -0.45));
      // chela swung mesially (negative swing), held in front of the face
      const propodus = add(`Cheliped_${side}_Propodus`, carpus, new THREE.Vector3(C.carpus, 0, 0), new THREE.Quaternion().setFromAxisAngle(Y, -s * 0.6));
      const palm = chela * C.palmFraction;
      const dactylus = add(`Cheliped_${side}_Dactylus`, propodus, new THREE.Vector3(palm, 0.0, s * chela * (side === 'R' ? 0.13 : 0.1)));
      const tip = add(`Cheliped_${side}_Tip`, propodus, new THREE.Vector3(chela, 0, 0));
      this.chelipeds[side] = {
        side: s, name: `Cheliped_${side}`, coxa, basis, ischium, merus, carpus, propodus, dactylus, tip,
        len: { coxa: C.coxa, basis: C.basis, merus: C.merus, carpus: C.carpus, chela, palm, dactyl: chela * C.dactylFraction },
        coxaPos: coxa.position.clone(),
      };
    }

    // ── walking legs (P2 = *1, P3 = *2) ─────────────────────────────────────────────────────────
    this.legs = {};
    const legDirs = { 1: [0.55, 0.83], 2: [0.88, 0.47] };
    for (const n of [1, 2]) {
      for (const side of ['L', 'R']) {
        const s = side === 'L' ? 1 : -1;
        const D = MORPH.walkingLegs[`${side}${n}`];
        const cp = n === 1 ? MORPH.coxae.p2 : MORPH.coxae.p3;
        const name = `Leg_${side}${n}`;
        const [dx, dz] = legDirs[n];
        const restYaw = yawFor(s * dx, dz);
        const coxa = add(`${name}_Coxa`, root, new THREE.Vector3(s * cp.x, cp.y, cp.z), new THREE.Quaternion().setFromAxisAngle(Y, restYaw));
        const basis = add(`${name}_Basis`, coxa, new THREE.Vector3(D.coxa, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, 0.5));
        const ischium = add(`${name}_Ischium`, basis, new THREE.Vector3(D.basis * BASIS_FRACTION, 0, 0));
        const merus = add(`${name}_Merus`, ischium, new THREE.Vector3(D.basis * (1 - BASIS_FRACTION), 0, 0));
        const carpus = add(`${name}_Carpus`, merus, new THREE.Vector3(D.merus, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, -0.95));
        const propodus = add(`${name}_Propodus`, carpus, new THREE.Vector3(D.carpus, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, -0.2));
        const dactylus = add(`${name}_Dactylus`, propodus, new THREE.Vector3(D.propodus, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, -0.4));
        const tip = add(`${name}_Tip`, dactylus, new THREE.Vector3(D.dactylus, 0, 0));
        this.legs[`${side}${n}`] = {
          side: s, n, name, coxa, basis, ischium, merus, carpus, propodus, dactylus, tip,
          len: { ...D }, coxaPos: coxa.position.clone(), restYaw, restDir: new THREE.Vector3(s * dx, 0, dz).normalize(),
        };
      }
    }

    // ── posterior carapace: membranous and flexible [G]; bends with the whorl when the crab withdraws.
    // Carries the P4/P5 bases and the abdomen base.
    this.carapacePosterior = add('CarapacePosterior', root, new THREE.Vector3(0, 0, 0));
    // the soft branchiostegites at its sides: free (inflated) out of the shell, pressed in inside it.
    // Only translated (never rotated), so the skinned sides move in parallel.
    const PC = MORPH.posteriorCarapace;
    this.branchio = {
      L: add('Branchiostegite_L', this.carapacePosterior, new THREE.Vector3(PC.halfWidthMax, 0, -PC.length * PC.maxAt)),
      R: add('Branchiostegite_R', this.carapacePosterior, new THREE.Vector3(-PC.halfWidthMax, 0, -PC.length * PC.maxAt)),
    };

    // ── reduced legs (P4 = *3, P5 = *4) ─────────────────────────────────────────────────────────
    this.reduced = {};
    for (const n of [3, 4]) {
      for (const side of ['L', 'R']) {
        const s = side === 'L' ? 1 : -1;
        const D = n === 3 ? MORPH.reducedLegs.P4 : MORPH.reducedLegs.P5;
        const cp = n === 3 ? MORPH.coxae.p4 : MORPH.coxae.p5;
        const name = `Leg_${side}${n}`;
        // tucked back along the posterior carapace, propodal rasps braced against the inner shell wall [G]
        const dir = n === 3 ? [0.32, -0.95] : [0.22, -0.97];
        const coxa = add(`${name}_Coxa`, this.carapacePosterior, new THREE.Vector3(s * cp.x, cp.y, cp.z), new THREE.Quaternion().setFromAxisAngle(Y, yawFor(s * dir[0], dir[1])));
        const basis = add(`${name}_Basis`, coxa, new THREE.Vector3(D.coxa, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, 0.35));
        const ischium = add(`${name}_Ischium`, basis, new THREE.Vector3(D.basis * BASIS_FRACTION, 0, 0));
        const merus = add(`${name}_Merus`, ischium, new THREE.Vector3(D.basis * (1 - BASIS_FRACTION), 0, 0));
        const carpus = add(`${name}_Carpus`, merus, new THREE.Vector3(D.merus, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, -2.1));
        const propodus = add(`${name}_Propodus`, carpus, new THREE.Vector3(D.carpus, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, -0.35));
        const dactylus = add(`${name}_Dactylus`, propodus, new THREE.Vector3(D.propodus, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z, -0.5));
        this.reduced[`${side}${n}`] = { side: s, n, name, coxa, basis, ischium, merus, carpus, propodus, dactylus, len: { ...D }, restQ: [coxa, basis, merus, carpus, propodus, dactylus].map((b) => b.quaternion.clone()) };
      }
    }

    // ── abdomen chain (posed along the shell's whorl every frame) ───────────────────────────────
    // the soft abdomen is laid along the shell's whorl every frame, so its bones are independent
    // children of Body (each can be squeezed to the local lumen width without shearing the others)
    const AB = MORPH.abdomen;
    const segL = AB.length / AB.segments;
    this.abdomen = [];
    let parent = root;
    const z0 = -MORPH.posteriorCarapace.length + 0.05;
    this.abdomenBaseRest = new THREE.Vector3(0, AB.baseY, z0);
    for (let i = 0; i < AB.segments; i++) {
      const b = add(`Abdomen${i}`, root, new THREE.Vector3(0, AB.baseY, z0 - i * segL), quatFromDir(new THREE.Vector3(0, 0, -1)));
      this.abdomen.push(b);
      parent = b;
    }
    this.abdomenSegLen = segL;
    this.telson = add('Telson', parent, new THREE.Vector3(segL, 0, 0));
    this.uropods = {
      L: add('Uropod_L', parent, new THREE.Vector3(segL * 0.8, 0.0, AB.radiusEnd * 0.6), new THREE.Quaternion().setFromAxisAngle(Y, -0.5)),
      R: add('Uropod_R', parent, new THREE.Vector3(segL * 0.8, 0.0, -AB.radiusEnd * 0.6), new THREE.Quaternion().setFromAxisAngle(Y, 0.5)),
    };

    // ── shell grip ──────────────────────────────────────────────────────────────────────────────
    this.shellAnchor = add('ShellAnchor', root, V(MORPH.shellAnchor));
    this.shellAnchorRest = this.shellAnchor.position.clone();

    // bind pose snapshot
    this.bind = new Map();
    for (const b of this.list) this.bind.set(b, { p: b.position.clone(), q: b.quaternion.clone() });
    root.updateMatrixWorld(true);
    this.bindWorld = new Map();
    for (const b of this.list) this.bindWorld.set(b, b.matrixWorld.clone());
    this.skeleton = null;
  }

  /** skeleton with inverse bind matrices from the bind pose in the body frame (meshes bind with identity) */
  createSkeleton() {
    if (!this.skeleton) this.skeleton = new THREE.Skeleton(this.list, this.list.map((b) => this.bindWorld.get(b).clone().invert()));
    return this.skeleton;
  }

  indexOf(name) {
    return this.list.indexOf(this.bones[name]);
  }

  resetToBind() {
    for (const [b, t] of this.bind) {
      b.position.copy(t.p);
      b.quaternion.copy(t.q);
    }
  }

  // ── joint setters (allocation-free) ──────────────────────────────────────────────────────────
  static setZ(b, a) { b.quaternion.setFromAxisAngle(Z, a); }
  static setY(b, a) { b.quaternion.setFromAxisAngle(Y, a); }
  static setX(b, a) { b.quaternion.setFromAxisAngle(X, a); }
  static setYZ(b, y, z) {
    b.quaternion.setFromAxisAngle(Y, y);
    _q.setFromAxisAngle(Z, z);
    b.quaternion.multiply(_q);
  }

  /** apply a walking-leg joint vector {yaw, lift, knee, cp, pd} */
  static applyLeg(leg, j) {
    Rig.setY(leg.coxa, j.yaw);
    Rig.setZ(leg.basis, j.lift);
    leg.merus.quaternion.identity();
    Rig.setZ(leg.carpus, j.knee);
    Rig.setZ(leg.propodus, j.cp);
    Rig.setZ(leg.dactylus, j.pd);
  }

  /** apply a cheliped joint vector {yaw, lift, roll, knee, swing, pitch, gape} */
  static applyCheliped(ch, j) {
    Rig.setY(ch.coxa, j.yaw);
    Rig.setZ(ch.basis, j.lift);
    Rig.setX(ch.merus, j.roll * ch.side);
    Rig.setZ(ch.carpus, j.knee);
    Rig.setYZ(ch.propodus, j.swing * ch.side, j.pitch);
    Rig.setY(ch.dactylus, -j.gape * ch.side);
  }
}

// ---------------------------------------------------------------------------------------------
// Inverse kinematics
// ---------------------------------------------------------------------------------------------

export const LEG_LIMITS = {
  yaw: 1.05, // ± around rest yaw (promotor/remotor range)
  lift: [-0.7, 1.45],
  knee: [-2.5, 0.15],
  pd: [-1.7, 0.7],
};

/**
 * Analytic IK for a walking leg in the body frame (SL units).
 * The leg is planar after the coxal yaw (single-axis dicondylic joints). The dactyl tip is the end
 * effector; the dactyl meets the ground at `contactAngle` (rad below horizontal), the carpo-propodal
 * angle is fixed at `cp`, and the remaining two-link problem (basis+merus, carpus+propodus) is solved
 * in closed form with the merus–carpus "knee" up, as in decapod walking.
 * @returns {{yaw:number, lift:number, knee:number, cp:number, pd:number, reach:number}} reach ≥ 1 when clamped
 */
export function solveLegIK(leg, target, opts, out) {
  const L = leg.len;
  const C = leg.coxaPos;
  const dx = target.x - C.x, dz = target.z - C.z;
  const horiz = Math.hypot(dx, dz);
  let yaw = horiz > 1e-6 ? yawFor(dx, dz) : leg.restYaw;
  // limit promotion/remotion around rest yaw
  let dyaw = Math.atan2(Math.sin(yaw - leg.restYaw), Math.cos(yaw - leg.restYaw));
  dyaw = clamp(dyaw, -LEG_LIMITS.yaw, LEG_LIMITS.yaw);
  yaw = leg.restYaw + dyaw;
  const L1 = L.basis + L.merus;
  const prefContact = opts.contactAngle ?? -0.85;
  const prefCp = opts.cp ?? -0.22;
  // Redundancy: the dactyl's ground-contact angle and the carpo-propodal flexion are free. Prefer the
  // given values; if a joint would leave its range (foot late in stance, close to the body), fold the
  // distal leg at the carpo-propodal joint and/or change the dactyl angle so the tip stays on target.
  let best = null, bestErr = Infinity;
  for (let ci = 0; ci < CP_TRIES.length && bestErr > 0.004; ci++) {
    const cp = clamp(prefCp + CP_TRIES[ci], -1.4, 0.1);
    const l2x = L.carpus + L.propodus * Math.cos(cp), l2y = L.propodus * Math.sin(cp);
    const L2 = Math.hypot(l2x, l2y);
    const eps = Math.atan2(l2y, l2x);
    for (let k = 0; k < CONTACT_TRIES.length; k++) {
      const contact = clamp(prefContact + CONTACT_TRIES[k], -1.45, -0.2);
      const pu = horiz - L.coxa - L.dactylus * Math.cos(contact);
      const pv = target.y - C.y - L.dactylus * Math.sin(contact);
      let D = Math.hypot(pu, pv);
      const Dmax = (L1 + L2) * 0.995, Dmin = Math.abs(L1 - L2) * 1.05 + 1e-4;
      const reach = D / Dmax;
      D = clamp(D, Dmin, Dmax);
      const base = Math.atan2(pv, pu);
      const cosG = clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1);
      const liftRaw = base + Math.acos(cosG);
      const lift = clamp(liftRaw, LEG_LIMITS.lift[0], LEG_LIMITS.lift[1]);
      const kx = L1 * Math.cos(lift), ky = L1 * Math.sin(lift);
      const px = Math.cos(base) * D, py = Math.sin(base) * D;
      const lam = Math.atan2(py - ky, px - kx);
      const kneeRaw = lam - eps - lift;
      const knee = clamp(kneeRaw, LEG_LIMITS.knee[0], LEG_LIMITS.knee[1]);
      const pdRaw = contact - (lift + knee + cp);
      const pd = clamp(pdRaw, LEG_LIMITS.pd[0], LEG_LIMITS.pd[1]);
      // clamping error (rad) dominates; small penalties keep the preferred posture when several fit
      const clampErr = Math.abs(liftRaw - lift) + Math.abs(kneeRaw - knee) + Math.abs(pdRaw - pd) + Math.max(0, reach - 1) * 2;
      const err = clampErr * 10 + Math.abs(CONTACT_TRIES[k]) * 0.002 + Math.abs(CP_TRIES[ci]) * 0.0015;
      if (err < bestErr) {
        bestErr = err;
        best = { lift, knee, pd, reach, contact, cp };
        if (clampErr < 1e-4 && k === 0) break;
      }
    }
  }
  out.yaw = yaw;
  out.lift = best.lift;
  out.knee = best.knee;
  out.cp = best.cp;
  out.pd = best.pd;
  out.reach = best.reach;
  out.contact = best.contact;
  return out;
}

const CP_TRIES = [0, -0.25, -0.5, -0.75, -1.0];
const CONTACT_TRIES = [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6];

/** forward kinematics of a walking leg joint vector → dactyl tip in body frame */
export function legTipFK(leg, j, out = new THREE.Vector3()) {
  const L = leg.len;
  let a = j.lift;
  let u = L.coxa + (L.basis + L.merus) * Math.cos(a);
  let v = (L.basis + L.merus) * Math.sin(a);
  a += j.knee;
  u += L.carpus * Math.cos(a); v += L.carpus * Math.sin(a);
  a += j.cp;
  u += L.propodus * Math.cos(a); v += L.propodus * Math.sin(a);
  a += j.pd;
  u += L.dactylus * Math.cos(a); v += L.dactylus * Math.sin(a);
  // yaw: local X → (cos yaw, 0, −sin yaw)
  return out.set(leg.coxaPos.x + u * Math.cos(j.yaw), leg.coxaPos.y + v, leg.coxaPos.z - u * Math.sin(j.yaw));
}

/**
 * IK for a cheliped reaching with its fingertip to `target` (body frame), chela pitched by `pitch`
 * (rad, negative = pointing down), used for picking food, scooping sediment and probing shell apertures.
 */
export function solveChelipedIK(ch, target, pitch, out) {
  const L = ch.len;
  const C = ch.coxaPos;
  const dx = target.x - C.x, dz = target.z - C.z;
  const horiz = Math.hypot(dx, dz);
  out.yaw = horiz > 1e-6 ? yawFor(dx, dz) : out.yaw;
  const pu = horiz - L.coxa - L.chela * Math.cos(pitch);
  const pv = target.y - C.y - L.chela * Math.sin(pitch);
  const L1 = L.basis + L.merus, L2 = L.carpus;
  let D = Math.hypot(pu, pv);
  D = clamp(D, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.995);
  const base = Math.atan2(pv, pu);
  const cosG = clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1);
  out.lift = clamp(base + Math.acos(cosG), -0.8, 1.4);
  const kx = L1 * Math.cos(out.lift), ky = L1 * Math.sin(out.lift);
  const px = Math.cos(base) * D, py = Math.sin(base) * D;
  out.knee = clamp(Math.atan2(py - ky, px - kx) - out.lift, -2.6, 0.3);
  out.pitch = pitch - (out.lift + out.knee);
  out.swing = 0;
  out.roll = out.roll ?? 0;
  return out;
}
