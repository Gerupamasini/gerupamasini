// Procedural walking of ユビナガホンヤドカリ.
//
// Evidence used (01_research.md §4):
//  - only the walking legs P2 (Leg_*1) and P3 (Leg_*2) step; P4/P5 hold the shell        [Pagurus: Chapple 2012]
//  - P2/P3 alternate in DIAGONAL pairs (L1+R2 ↔ R1+L2)                                   [Pagurus: Chapple 2012]
//  - forward walking is the main mode; sideways walking is possible                      [Pagurus; phylogeny]
//  - speed rises mainly through stride length                                             [Coenobita: Herreid & Full 1986]
//  - shell yaws with each P3 step; large shells drag on the substrate                     [Coenobita]
// Game supplements [S]: duty factor 0.62–0.80, stride frequency, turning ≤ ~14° per step.
//
// Every walking leg owns: footTarget, plantedPosition, stepProgress, stepHeight, strideLength.
// Planted feet are fixed in WORLD space during stance, so feet never slide; the body moves over them and
// the analytic IK (PagurusMinutusRig.solveLegIK) re-solves the joints each frame.
import * as THREE from 'three';
import { Rig, solveLegIK } from './PagurusMinutusRig.js';
import { MORPH } from './PagurusMinutusMorphology.js';
import { clamp, damp, lerp, smoothstep, wrapAngle, fbm1 } from './PagurusMinutusUtil.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** neutral foot positions in the body frame (SL units, x lateral (left +), z forward) [P][S] */
export const NEUTRAL_FEET = {
  L1: { x: 1.5, z: 2.35 }, R1: { x: -1.5, z: 2.35 },
  L2: { x: 2.25, z: 0.85 }, R2: { x: -2.2, z: 0.85 },
};
/** diagonal pairs: L1+R2 together, R1+L2 half a cycle later */
const PHASE = { L1: 0.0, R2: 0.04, R1: 0.5, L2: 0.54 };

export const POSTURE = {
  stand: { height: 0.5, footScale: 1.0 },
  alert: { height: 0.62, footScale: 1.03 },
  low: { height: 0.4, footScale: 1.06 },
  rest: { height: 0.3, footScale: 1.1 },
  climb: { height: 0.44, footScale: 0.92 },
};

export class Locomotion {
  /**
   * @param {import('./PagurusMinutus.js').HermitCrab} crab
   */
  constructor(crab) {
    this.crab = crab;
    this.rig = crab.rig;
    this.rng = crab.rng;
    this.position = new THREE.Vector3(); // world, ground under body centre
    this.heading = 0;
    this.velocity = new THREE.Vector3();
    this.speed = 0; // SL/s, signed (negative = walking backward)
    this.turnRate = 0;
    this.phase = this.rng.next();
    this.frequency = 0;
    this.duty = 0.8;
    this.stride = 0.8; // SL
    this.bodyHeight = POSTURE.stand.height;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.bodySway = 0;
    this.bodyBob = 0;
    this.posture = 'stand';
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.footScale = 1;
    this.moving = false;
    this.stuck = 0;
    this.climbing = 0;
    this.stepCount = 0;
    this.headingSinceStep = 0;
    this.legs = {};
    const offsetJitter = () => (this.rng.next() - 0.5) * 0.06;
    for (const key of ['L1', 'R1', 'L2', 'R2']) {
      const chain = this.rig.legs[key];
      this.legs[key] = {
        key, chain,
        phaseOffset: PHASE[key] + offsetJitter(),
        planted: new THREE.Vector3(),
        footTarget: new THREE.Vector3(),
        stepFrom: new THREE.Vector3(),
        stepProgress: 1,
        stepping: false,
        stepHeight: 0.38,
        strideLength: 0.8,
        swingDuration: 0.2,
        contact: true,
        joints: { yaw: chain.restYaw, lift: 0.5, knee: -1.4, cp: -0.22, pd: -0.3, reach: 0.5, contact: -0.85 },
        footWorld: new THREE.Vector3(),
        lastStepAt: 0,
        load: 0.25,
      };
    }
    this.time = 0;
    this.initialised = false;
    this.bodyMatrix = new THREE.Matrix4();
    this.bodyMatrixInv = new THREE.Matrix4();
  }

  /** world size of one shield length */
  get SL() {
    return this.crab.SL;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** teleport (spawn, re-attach): plants all feet at their neutral positions */
  reset(pos, heading, env) {
    this.position.copy(pos);
    this.heading = heading;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.position.y = env.groundAt(pos.x, pos.z);
    this.updateBodyMatrix(env);
    for (const leg of Object.values(this.legs)) {
      this.neutralWorld(leg, this.position, this.heading, leg.planted, env);
      leg.footTarget.copy(leg.planted);
      leg.footWorld.copy(leg.planted);
      leg.stepProgress = 1;
      leg.stepping = false;
      leg.contact = true;
    }
    this.initialised = true;
  }

  /** neutral (rest) foot position of a leg in world space for a given body position/heading */
  neutralWorld(leg, pos, heading, out, env) {
    const n = NEUTRAL_FEET[leg.key];
    const fs = this.footScale;
    const SL = this.SL;
    const s = Math.sin(heading), c = Math.cos(heading);
    // body frame: +X left, +Z forward. World: forward = (sin h, 0, cos h), left = (cos h, 0, −sin h)
    const lx = n.x * fs * SL, lz = n.z * fs * SL;
    out.set(pos.x + c * lx + s * lz, 0, pos.z - s * lx + c * lz);
    out.y = env.groundAt(out.x, out.z);
    return out;
  }

  updateBodyMatrix() {
    const crab = this.crab;
    crab.root.position.copy(this.position);
    crab.root.rotation.set(0, this.heading, 0);
    const b = this.rig.root;
    b.position.set(this.bodySway, this.bodyHeight + this.bodyBob + crab.anim.bodyLift, crab.anim.bodyRetreat);
    _e.set(this.bodyPitch + crab.anim.bodyPitch, 0, this.bodyRoll, 'YXZ');
    b.quaternion.setFromEuler(_e);
    // withdrawn: the shell (with the crab in it) tipped onto its side about a pivot on the substrate
    const tip = crab.anim.tip;
    if (tip && tip.angle !== 0) {
      _q.setFromAxisAngle(_Z, tip.angle);
      b.position.sub(tip.pivot).applyQuaternion(_q).add(tip.pivot);
      b.position.y += tip.lift;
      b.quaternion.premultiply(_q);
    }
    // withdrawn: the body inside the shell (rigid displacement from the standing pose)
    const X = crab.anim.bodyXf;
    if (X) {
      b.position.add(_v.copy(X.pos).applyQuaternion(b.quaternion));
      b.quaternion.multiply(X.quat);
    }
    crab.root.updateMatrixWorld(true);
    this.bodyMatrix.copy(b.matrixWorld);
    this.bodyMatrixInv.copy(this.bodyMatrix).invert();
  }

  /**
   * @param {number} dt seconds
   * @param {object} cmd { moveTarget?: Vector3, speed?: number (SL/s), arrive?: number (m), face?: Vector3,
   *   backward?: boolean, posture?: string, freeze?: boolean, legsActive?: boolean }
   * @param {object} env { groundAt(x,z), obstacles(pos, r) → [{x,z,r,h}], lod }
   */
  update(dt, cmd, env) {
    if (!this.initialised) this.reset(this.position, this.heading, env);
    this.time += dt;
    const SL = this.SL;
    const legsActive = cmd.legsActive !== false;
    // ── posture ──────────────────────────────────────────────────────────────────────────────
    const post = POSTURE[cmd.posture ?? 'stand'] ?? POSTURE.stand;
    this.posture = cmd.posture ?? 'stand';
    let hTarget = post.height * (cmd.heightScale ?? 1);
    this.footScale = damp(this.footScale, post.footScale, 3, dt);
    // heavier shells (relative to the body) are carried lower [G] P. pollicarus
    const shell = this.crab.shell;
    if (shell && this.crab.shellMode === 'carried') {
      const sl = this.crab.shieldLength_mm;
      const wRatio = shell.props.mass_g / (MORPH.bodyVolumeK * sl * sl * sl * 1.06e-3);
      hTarget *= 1 - 0.14 * clamp((wRatio - 1) / 4, 0, 1);
    }
    // shell dragging: if the shell digs into the ground, the crab stands a little taller
    const sd = this.crab.shellDyn;
    if (sd && this.posture !== 'rest' && legsActive) hTarget += clamp(sd.contactDepth / SL, 0, 0.25) * 0.6;
    // ── desired motion ───────────────────────────────────────────────────────────────────────
    let desiredSpeed = 0, desiredHeading = this.heading;
    if (!cmd.freeze && legsActive && cmd.moveTarget) {
      const dx = cmd.moveTarget.x - this.position.x, dz = cmd.moveTarget.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      const arrive = cmd.arrive ?? 0.6 * SL;
      if (dist > arrive) {
        desiredHeading = Math.atan2(dx, dz);
        if (cmd.backward) desiredHeading = wrapAngle(desiredHeading + Math.PI);
        const slowDown = clamp((dist - arrive) / (2.5 * SL), 0.25, 1);
        desiredSpeed = (cmd.speed ?? 1.5) * slowDown * (cmd.backward ? -0.6 : 1);
      }
    } else if (!cmd.freeze && legsActive && cmd.face) {
      desiredHeading = Math.atan2(cmd.face.x - this.position.x, cmd.face.z - this.position.z);
    }
    // heading error drives stepping turns: no turning without stepping ("not a tank")
    const headErr = wrapAngle(desiredHeading - this.heading);
    const turnNeedsSteps = Math.abs(headErr) > 0.12;
    // turning while nearly stationary: walk in place slowly so the legs re-place
    if (Math.abs(desiredSpeed) < 0.3 && turnNeedsSteps && legsActive && !cmd.freeze) desiredSpeed = Math.sign(desiredSpeed || 1) * 0.3;
    // large heading errors: slow down to turn over several steps
    desiredSpeed *= lerp(1, 0.45, smoothstep(0.4, 1.6, Math.abs(headErr)));
    const accel = (Math.abs(desiredSpeed) > Math.abs(this.speed) ? 3.5 : 6.0) * (cmd.urgent ? 2.5 : 1);
    this.speed += clamp(desiredSpeed - this.speed, -accel * dt, accel * dt);
    // gait parameters: speed ↑ mainly through stride length
    const sp = Math.abs(this.speed);
    this.stride = clamp(0.45 + 0.32 * sp, 0.45, 1.5);
    const fTarget = sp > 0.05 ? clamp(sp / this.stride, 0.7, 3.4) : 0;
    this.frequency = damp(this.frequency, fTarget, 6, dt);
    this.duty = lerp(0.8, 0.62, clamp(sp / 4, 0, 1));
    this.moving = this.frequency > 0.05;
    // heading change limited per step cycle (≤ ~14° per step of each diagonal pair)
    const maxTurn = (0.25 + 0.5 * this.frequency) * (cmd.urgent ? 1.6 : 1); // rad/s
    const turn = clamp(headErr, -maxTurn * dt, maxTurn * dt) * (this.moving ? 1 : 0);
    this.turnRate = turn / Math.max(dt, 1e-4);
    this.heading = wrapAngle(this.heading + turn);
    // ── integrate position with collision ────────────────────────────────────────────────────
    const fwd = this.forward(_v);
    const step = this.speed * SL * dt;
    const nx = this.position.x + fwd.x * step, nz = this.position.z + fwd.z * step;
    const res = this.resolveCollisions(nx, nz, env);
    const moved = Math.hypot(res.x - this.position.x, res.z - this.position.z);
    this.stuck = Math.abs(step) > 1e-7 ? damp(this.stuck, moved < Math.abs(step) * 0.3 ? 1 : 0, 4, dt) : damp(this.stuck, 0, 4, dt);
    this.velocity.set(res.x - this.position.x, 0, res.z - this.position.z).divideScalar(Math.max(dt, 1e-4));
    this.position.x = res.x;
    this.position.z = res.z;
    const g = env.groundAt(this.position.x, this.position.z);
    this.position.y = g;
    // ── terrain adaptation: body height and attitude from the planted feet and the local slope ──
    const feet = Object.values(this.legs);
    let meanY = 0, n = 0;
    for (const leg of feet) { meanY += leg.contact ? leg.planted.y : leg.footTarget.y; n++; }
    meanY /= Math.max(1, n);
    // slope by finite differences over ~1.5 SL (Floor provides heights only)
    const e = 1.5 * SL;
    const hF = env.groundAt(this.position.x + fwd.x * e, this.position.z + fwd.z * e);
    const hB = env.groundAt(this.position.x - fwd.x * e, this.position.z - fwd.z * e);
    const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
    const hL = env.groundAt(this.position.x + lx * e, this.position.z + lz * e);
    const hR = env.groundAt(this.position.x - lx * e, this.position.z - lz * e);
    const pitchT = -Math.atan2(hF - hB, 2 * e) * 0.85;
    const rollT = Math.atan2(hL - hR, 2 * e) * 0.85;
    this.climbing = smoothstep(0.35, 0.8, Math.abs(pitchT));
    this.groundNormal.set(-(hL - hR) / (2 * e), 1, -(hF - hB) / (2 * e)).normalize();
    this.bodyPitch = damp(this.bodyPitch, clamp(pitchT, -0.9, 0.9), 5, dt);
    this.bodyRoll = damp(this.bodyRoll, clamp(rollT, -0.7, 0.7), 5, dt);
    // feet higher than the ground under the body (stepping onto a stone) lift the body
    const footLift = clamp((meanY - g) / SL, -0.3, 0.6);
    // gait bob and sway: the body dips slightly while a diagonal pair is in swing, and shifts over the stance pair
    let swingLoad = 0, swayX = 0;
    for (const leg of feet) if (!leg.contact) { swingLoad += 0.5; swayX += -Math.sign(NEUTRAL_FEET[leg.key].x) * 0.5; }
    const bobT = -0.025 * swingLoad * clamp(sp, 0, 1);
    this.bodyBob = damp(this.bodyBob, bobT, 14, dt);
    this.bodySway = damp(this.bodySway, swayX * 0.03 * clamp(sp, 0, 1), 10, dt);
    this.bodyHeight = damp(this.bodyHeight, hTarget + footLift, 4, dt);
    this.updateBodyMatrix();
    // ── legs ─────────────────────────────────────────────────────────────────────────────────
    if (legsActive) this.updateLegs(dt, env, cmd);
    else for (const leg of feet) { leg.contact = false; leg.stepping = false; }
  }

  updateLegs(dt, env, cmd) {
    const SL = this.SL;
    const feet = Object.values(this.legs);
    if (this.moving) this.phase = (this.phase + this.frequency * dt) % 1;
    const swingDur = this.moving ? (1 - this.duty) / Math.max(0.3, this.frequency) : 0.18;
    // predicted body pose at the middle of the next stance (for foot placement)
    const lead = this.moving ? swingDur * 0.5 + (this.duty / Math.max(0.3, this.frequency)) * 0.5 : 0;
    const fwd = this.forward(_w);
    const predPos = new THREE.Vector3(this.position.x + this.velocity.x * lead, 0, this.position.z + this.velocity.z * lead);
    const predHeading = this.heading + this.turnRate * lead;
    // idle re-placement: one leg at a time when a foot strays too far from neutral
    let anySwinging = feet.some((l) => l.stepping);
    for (const leg of feet) {
      const legPhase = (this.phase + leg.phaseOffset) % 1;
      const inSwingWindow = this.moving && legPhase >= this.duty;
      if (!leg.stepping) {
        let start = false;
        if (inSwingWindow && this.time - leg.lastStepAt > swingDur * 0.9) start = true;
        if (!this.moving && !anySwinging) {
          const nw = this.neutralWorld(leg, this.position, this.heading, new THREE.Vector3(), env);
          const err = Math.hypot(nw.x - leg.planted.x, nw.z - leg.planted.z) / SL;
          if (err > 0.55 || (err > 0.3 && this.rng.chance(dt * 0.5)) || (cmd.shuffle && this.rng.chance(dt * 0.6))) start = true;
        }
        if (start) {
          leg.stepping = true;
          leg.contact = false;
          leg.stepProgress = 0;
          leg.stepFrom.copy(leg.planted);
          leg.swingDuration = swingDur * (0.9 + 0.2 * this.rng.next());
          leg.stepHeight = (0.32 + 0.12 * this.rng.next() + 0.25 * this.climbing) * SL;
          // target: neutral position at the predicted body pose, extended by half a stride
          this.neutralWorld(leg, predPos, predHeading, leg.footTarget, env);
          const fs = this.speed >= 0 ? 1 : -1;
          leg.strideLength = this.stride * SL;
          leg.footTarget.x += fwd.x * fs * leg.strideLength * 0.25;
          leg.footTarget.z += fwd.z * fs * leg.strideLength * 0.25;
          // small placement noise (real feet never land on a grid)
          leg.footTarget.x += (this.rng.next() - 0.5) * 0.12 * SL;
          leg.footTarget.z += (this.rng.next() - 0.5) * 0.12 * SL;
          leg.footTarget.y = env.groundAt(leg.footTarget.x, leg.footTarget.z);
          anySwinging = true;
        }
      }
      if (leg.stepping) {
        leg.stepProgress = Math.min(1, leg.stepProgress + dt / Math.max(0.05, leg.swingDuration));
        const s = leg.stepProgress;
        // horizontal: ease-in-out; vertical: asymmetric arc peaking early (dactyl lifts steeply, lands softly)
        const hs = s * s * (3 - 2 * s);
        leg.footWorld.lerpVectors(leg.stepFrom, leg.footTarget, hs);
        // keep the target attached to the ground (it may move with the body during long swings)
        const arc = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.9);
        const base = lerp(leg.stepFrom.y, env.groundAt(leg.footWorld.x, leg.footWorld.z), hs);
        leg.footWorld.y = Math.max(base, env.groundAt(leg.footWorld.x, leg.footWorld.z)) + arc * leg.stepHeight;
        if (s >= 1) {
          leg.stepping = false;
          leg.contact = true;
          leg.planted.copy(leg.footTarget);
          leg.planted.y = env.groundAt(leg.planted.x, leg.planted.z);
          leg.lastStepAt = this.time;
          this.stepCount++;
          this.crab.onFootfall?.(leg);
        }
      } else {
        leg.footWorld.copy(leg.planted);
      }
    }
    // IK (LOD2: solve half of the legs per update, alternating)
    const lod = env.lod ?? 1;
    const every = lod >= 2 ? 2 : 1;
    const local = new THREE.Vector3();
    let k = 0;
    for (const leg of feet) {
      k++;
      if (every > 1 && (k + this.stepCount) % every !== 0 && leg.joints.reach !== undefined && !leg.stepping) continue;
      local.copy(leg.footWorld).applyMatrix4(this.bodyMatrixInv);
      // slopes: steeper contact on climbs gives the long dactyl grip
      const contact = -0.55 - 0.3 * this.climbing;
      solveLegIK(leg.chain, local, { contactAngle: contact, cp: -0.38 }, leg.joints);
    }
  }

  /** apply the solved leg joints to the rig (blended by the animator for retraction) */
  applyLegs(blendFn) {
    for (const leg of Object.values(this.legs)) {
      const j = blendFn ? blendFn(leg) : leg.joints;
      Rig.applyLeg(leg.chain, j);
    }
  }

  /**
   * Collision of the crab (body circle + carried shell circle) with obstacles: other crabs' shells, empty
   * shells, food items flagged as solid. Pushes out and slides along. Small objects are climbed instead
   * (handled by groundAt bumps).
   */
  resolveCollisions(nx, nz, env) {
    const crab = this.crab;
    const out = { x: nx, z: nz };
    if (!env.obstacles) return out;
    const SL = this.SL;
    const bodyR = 1.1 * SL;
    const shellOff = crab.shellCenterOffset(_w); // world-space offset of the shell centre from the root
    const shellR = crab.shell ? crab.shell.radius * 0.55 : 0;
    const list = env.obstacles(out.x, out.z, 4 * SL + shellR, crab);
    for (let iter = 0; iter < 2; iter++) {
      for (const o of list) {
        if (o.climbable) continue;
        for (const [cx, cz, r] of [[out.x, out.z, bodyR], [out.x + shellOff.x, out.z + shellOff.z, shellR]]) {
          if (r <= 0) continue;
          const dx = cx - o.x, dz = cz - o.z;
          const d = Math.hypot(dx, dz);
          const min = r + o.r;
          if (d < min && d > 1e-7) {
            const push = (min - d) * (o.soft ? 0.35 : 1);
            out.x += (dx / d) * push;
            out.z += (dz / d) * push;
          }
        }
      }
    }
    return out;
  }

  /** debug data */
  snapshot() {
    return {
      speed: this.speed, frequency: this.frequency, duty: this.duty, stride: this.stride,
      legs: Object.values(this.legs).map((l) => ({ key: l.key, contact: l.contact, planted: l.planted.clone(), target: l.footTarget.clone(), foot: l.footWorld.clone(), progress: l.stepProgress })),
    };
  }
}

/** non-periodic idle weight shift for standing crabs (noise, not sine) */
export function idleSway(t, seed) {
  return fbm1(t * 0.35, seed) * 0.02;
}
