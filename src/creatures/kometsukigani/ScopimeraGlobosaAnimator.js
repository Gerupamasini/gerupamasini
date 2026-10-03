import { Matrix4, Quaternion, Vector3, Euler } from 'three';
import { CHELIPED, LEGS, STANCE, CARAPACE } from './ScopimeraGlobosaMorphology.js';
import { CHELA_POSES, DEG } from './ScopimeraGlobosaRig.js';
import { clamp, damp, dampAngle, fbm1, lerp, noise1, smooth01, smoothstep, Spring, wrapAngle } from './util.js';

/**
 * Procedural motion of one crab: where the body is, how each leg steps, what the chelipeds, eyestalks and
 * mouthparts are doing. The behaviour layer writes a command (velocity, heading, posture, appendage modes) and
 * requests cheliped "motion primitives"; this class turns them into bone rotations every frame.
 *
 * Locomotion is event-driven, not a looped clip: during stance a foot is welded to its point on the ground (it never
 * slides); it lifts only when the body has carried it too far from where it would like to stand, and then only if
 * its neighbours are down (front/back on the same side, and its partner across) — at speed a gait clock adds the
 * alternation of the two tetrapods (L1 L3 R2 R4 / L2 L4 R1 R3; the fiddler crab's gait [R]). So the slow shuffle of a
 * feeding crab, a turn on the spot and a sideways sprint all come out of the same rules, and every foot lands on
 * the ground as it actually is (terrain, pellets, the rim of a burrow).
 *
 * Units: the model is in carapace widths (CW); the world in metres; this.cw converts.
 */

const _v = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _q = new Quaternion(), _q2 = new Quaternion();
const _m = new Matrix4(), _mInv = new Matrix4(), _mBody = new Matrix4(), _mBodyInv = new Matrix4();
const _vS = new Vector3(), _vR = new Vector3();
const _e = new Euler(0, 0, 0, 'YXZ');
const UP = new Vector3(0, 1, 0);

/** neighbours that must be planted before a leg may lift (indices: L1..L4 = 0..3, R1..R4 = 4..7) */
const NEIGHBOURS = [
  [1, 4], [0, 2, 5], [1, 3, 6], [2, 7],
  [5, 0], [4, 6, 1], [5, 7, 2], [6, 3],
];
/** tetrapod groups for the gait clock */
const GROUP = [0, 1, 0, 1, 1, 0, 1, 0];
/**
 * Gait phase lag of each leg (cycles): alternating tetrapods, the second leg of each tetrapod on a side a beat
 * after the first, so the four feet of a tetrapod never land as one [L] (Uca pugnax: Barnes 1975) [G]
 */
const LAG = [0, 0.5, 0.07, 0.57, 0.5, 0, 0.57, 0.07];
/** a little anterior/posterior bend of the carpus–propodus joint per leg (dactyli 1–3 curve in, 4 out) [R] */
const CP_BEND = [0.18, 0.06, -0.1, -0.25];

/** command written by the behaviour every frame */
export function makeCommand() {
  return {
    /** desired body velocity in the world (m/s) and the most it may reach */
    vel: new Vector3(), maxSpeed: 0.05,
    /** desired heading (rad) and how fast it may turn (rad/s) */
    yaw: 0, turnRate: 3,
    /** posture: sternum height (CW), pitch (+ nose down), roll, leg spread (1 normal), standing on the tips 0..1 */
    height: STANCE.bodyHeight.calm, pitch: 0, roll: 0, spread: 1, tiptoe: 0,
    /** chelipeds' resting posture when no primitive plays: 'fold' | 'guard' | 'tuck' */
    chelaRest: 'fold',
    /** eyestalks: fold 0..1, a world point to watch (or null), scanning 0..1, alertness 0..1 */
    eyeFold: 0, look: null, look2: null, scan: 0.5, alert: 0,
    /** mouthparts: processing activity 0..1 */
    mouth: 0,
    /** inside / through a burrow: null or { e: entrance (world), axis: down the shaft (world, unit), r: radius (m), d: depth of the body centre along the axis (CW), roll: rad } */
    burrow: null,
    /** freeze the legs' stepping (alert pause) */
    freeze: false,
  };
}

class Foot {
  constructor() {
    this.w = new Vector3();        // world position of the dactylus tip
    this.from = new Vector3();
    this.to = new Vector3();
    this.planted = true;
    this.t = 0;
    this.dur = 0.15;
    this.lift = 0.2;
    this.since = 0;                // time since it last landed
    this.error = 0;
    this.ahead = 0;                // swing: prediction still to go when lifted (s)
    this.lead = 0;                 // swing: how far ahead of home it should land (s of motion)
  }
}

class ChelaMotion {
  constructor(side) {
    this.side = side;              // +1 left, -1 right
    this.kind = null;              // current primitive
    this.t = 0;
    this.phase = 0;
    this.target = new Vector3();   // body-space target (scoop contact / drop point)
    this.target2 = new Vector3();
    this.done = null;              // callback(kind, info)
    this.carry = false;            // holding a pellet
    this.ang = CHELA_POSES.fold.slice();
    this.rest = 'fold';
    this.gape = 0.04;
  }
  get busy() { return this.kind !== null; }
}

export class CrabAnimator {
  /**
   * @param model CrabModel
   * @param o { rand: () => number, personality: { speed, jitter, scoopBias } }
   */
  constructor(model, { rand, personality = {} } = {}) {
    this.model = model;
    this.rig = model.rig;
    this.cw = model.cw;
    this.rand = rand ?? Math.random;
    this.p = { speed: 1, jitter: 1, ...personality };
    this.seed = Math.floor(this.rand() * 1000);
    this.cmd = makeCommand();
    // body placement (world): ground point under the body centre, heading
    this.pos = new Vector3();
    this.heading = 0;
    this.yawRate = 0;              // rad/s, for the gait and for where swinging feet will land
    this.yawLeft = 0;              // how much of the commanded turn is still to come (rad)
    this.strain = 0;               // how far the planted feet lag behind the body (0 fine … 1+ falling behind)
    this.vel = new Vector3();
    this.ground = 0;
    this.feet = Array.from({ length: 8 }, () => new Foot());
    this.chela = [new ChelaMotion(1), new ChelaMotion(-1)];
    this.height = new Spring(STANCE.bodyHeight.calm, 3.5);
    this.pitch = new Spring(0, 3);
    this.roll = new Spring(0, 3);
    this.sway = new Vector3();
    this.bob = 0;
    this.eyeFold = [new Spring(0, 4), new Spring(0, 4)];
    this.eyeLook = [new Vector3(0, 0.6, 1).normalize(), new Vector3(0, 0.6, 1).normalize()];
    this.eyeSacc = [0, 0];
    this.eyeTarget = [new Vector3(0, 0.5, 1).normalize(), new Vector3(0, 0.5, 1).normalize()];
    this.mxp = 0;
    this.time = 0;
    this.clock = 0;                // gait clock (cycles)
    this.gaitOn = false;           // clocked gait running (walking), or single adjustment steps (standing)
    this.duty = 0.7;               // stance fraction of the cycle
    this.freq = 2;                 // stride frequency (Hz)
    this.skid = 0;                 // how much a stance foot had to give way this frame (diagnostics)
    this.speed = 0;
    this.pelletGrowth = 0;
    this.listeners = [];
    this.probe = null;
    this.inBurrow = 0;             // 0 on the surface … 1 fully inside
    this.hidden = false;
    this.lastBurrowD = 0;
    this.footLiftMul = 1;
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, info) { for (const l of this.listeners) l(type, info); }

  // ------------------------------------------------------------------------------------------ placement

  /** Put the crab down at a point (all feet planted at their home spots on the ground). */
  placeAt(x, z, heading, probe) {
    this.probe = probe;
    this.pos.set(x, probe.heightAt(x, z), z);
    this.heading = heading;
    this.vel.set(0, 0, 0);
    this.cmd.yaw = heading;
    this.ground = this.pos.y;
    this.updateRootMatrix();
    for (let i = 0; i < 8; i++) {
      this.homeWorld(i, this.feet[i].w, 0);
      this.feet[i].planted = true;
      this.feet[i].since = this.rand();
    }
    this.height.reset(this.cmd.height);
  }

  /**
   * Out of the burrow pose onto the gait, where the crab is: the feet stay planted where the climb left them,
   * the body keeps its height and offset (they ease to the stance from there) — nothing jumps.
   */
  settleFromBurrow() {
    const body = this.rig.body;
    this.inBurrow = 0;
    this.vel.set(0, 0, 0);
    this.cmd.burrow = null;
    this.sway.set(body.position.x, 0, body.position.z);
    this.height.reset(body.position.y);
    this.pitch.reset(0);
    this.roll.reset(0);
    for (const f of this.feet) { f.planted = true; f.since = 0; }
  }

  updateRootMatrix() {
    const root = this.model.root;
    root.position.copy(this.pos);
    root.rotation.set(0, this.heading, 0);
    root.updateMatrix();
    _m.copy(root.matrix);
    _mInv.copy(_m).invert();
  }

  /**
   * A leg's home foot point in world space, optionally predicted `ahead` seconds along the body's motion and turn.
   * The point is kept where the leg can stand with its knee still well bent — within its comfortable reach of the
   * coxa socket (as high as the socket stands, pitch and roll included) and inside the coxa's swing — so a foot
   * never lands where it would have to stretch or twist.
   */
  homeWorld(i, out, ahead) {
    const leg = this.rig.legs[i];
    const k = i % 4;
    // walking, the stance draws in a little so a whole stride fits between a folded and a stretched leg
    const walking = this.gaitOn ? smoothstep(0.5, 4, this.speed / this.cw) : 0;
    const want = STANCE.footReach[k] * this.cmd.spread * (1 - 0.14 * walking);
    const body = this.rig.body;
    _vS.copy(leg.base).applyQuaternion(body.quaternion);           // socket from the body origin (root-local, CW)
    const sx = _vS.x + body.position.x, sz = _vS.z + body.position.z;
    const socket = Math.max(this.cmd.height, this.height.v) + _vS.y;
    // the leg's neutral direction in the ground plane, and the prediction in root-local terms
    _vR.set(1, 0, 0).applyQuaternion(leg.bindQuat);
    const dir0 = Math.atan2(-_vR.z, _vR.x);                    // the coxa's swing is centred on its bind direction
    let rot = 0, px = 0, pz = 0;
    if (ahead) {
      rot = clamp(this.yawRate * ahead, -Math.abs(this.yawLeft), Math.abs(this.yawLeft));
      const c = Math.cos(-this.heading), sn = Math.sin(-this.heading);
      const vx = (this.vel.x * ahead) / this.cw, vz = (this.vel.z * ahead) / this.cw;
      px = vx * c + vz * sn; pz = -vx * sn + vz * c;
    }
    let drop = socket;
    for (let pass = 0; pass < 2; pass++) {
      const reach = leg.maxReach(drop);
      leg.homeFoot(out, Math.min(want, reach), 0, CP_BEND[k] * 0.6 * leg.side);
      if (ahead) {
        // where the spot will be when the foot lands: the body turns and moves on meanwhile (root-local)
        const c = Math.cos(rot), sn = Math.sin(rot), x = out.x, z = out.z;
        out.x = x * c + z * sn + px;
        out.z = -x * sn + z * c + pz;
      }
      // clamp around the socket: comfortable reach outward, a folded leg inward, the coxa's swing sideways
      let dx = out.x - sx, dz = out.z - sz;
      let r = Math.hypot(dx, dz);
      const rr = clamp(r, Math.min(reach - 0.05, leg.minReach(drop) + 0.03), reach);
      let ang = Math.atan2(-dz, dx);
      const dev = clamp(wrapAngle(ang - dir0), -0.46, 0.46);
      ang = dir0 + dev;
      if (rr !== r || Math.abs(wrapAngle(Math.atan2(-dz, dx) - ang)) > 1e-6) {
        out.x = sx + Math.cos(ang) * rr;
        out.z = sz - Math.sin(ang) * rr;
      }
      out.y = 0;
      // root-local (CW) → world
      out.applyMatrix4(_m);
      out.y = this.probe ? this.probe.heightAt(out.x, out.z) : this.pos.y;
      // downhill the sand lies further below the socket: one more pass with the drop it really has
      const d2 = socket + (this.pos.y - out.y) / this.cw;
      if (d2 <= drop + 0.01) break;
      drop = d2;
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------ cheliped primitives

  /**
   * Request a motion primitive on one cheliped (0 left, 1 right). Returns false if it is busy.
   * kinds: 'scoop' (target: world point on the sand), 'discard' (target: world drop point), 'wave', 'dig'
   * (carry a lump out of the burrow; target: drop point), 'probe' (touch the sand), 'clean' (wipe an eyestalk)
   */
  play(side, kind, target = null, done = null) {
    const c = this.chela[side];
    if (c.busy) return false;
    c.kind = kind; c.t = 0; c.phase = 0; c.done = done;
    if (target) c.target2.copy(target);
    if (kind === 'discard' || kind === 'dig') c.carry = false;
    return true;
  }

  chelaBusy(side) { return this.chela[side].busy; }

  // ------------------------------------------------------------------------------------------ frame

  update(dt, probe) {
    if (dt <= 0) return;
    this.probe = probe;
    this.time += dt;
    const cmd = this.cmd;
    // ---- heading and velocity (acceleration-limited)
    const inBurrow = cmd.burrow !== null;
    if (!inBurrow) {
      // the body cannot outrun its own feet: when the planted ones lag far behind, turning and walking ease off
      // until the steps catch up
      const keepUp = clamp(1.6 - this.strain, 0.25, 1);
      const yawErr = wrapAngle(cmd.yaw - this.heading);
      const maxTurn = cmd.turnRate * dt * keepUp;
      const turn = clamp(yawErr, -maxTurn, maxTurn);
      this.heading = wrapAngle(this.heading + turn);
      this.yawRate = turn / dt;
      this.yawLeft = yawErr - turn;
      const sp = cmd.vel.length();
      _v.copy(cmd.vel);
      if (sp > cmd.maxSpeed) _v.multiplyScalar(cmd.maxSpeed / sp);
      if (!cmd.freeze && cmd.maxSpeed < 0.08) _v.multiplyScalar(keepUp);
      // small crabs start and stop almost at once, but not instantly
      const acc = cmd.maxSpeed > 0.08 ? 14 : 7;
      this.vel.x = damp(this.vel.x, _v.x, acc, dt);
      this.vel.z = damp(this.vel.z, _v.z, acc, dt);
      if (cmd.freeze) this.vel.multiplyScalar(Math.exp(-30 * dt));
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    } else {
      this.vel.set(0, 0, 0);
      this.yawRate = 0;
      this.yawLeft = 0;
      // the root (the shaft's reference) slides onto the mouth — a crab arriving a little off it is drawn in,
      // never moved in a jump
      const e = cmd.burrow.e, k = 1 - Math.exp(-14 * dt);
      this.pos.x += (e.x - this.pos.x) * k;
      this.pos.z += (e.z - this.pos.z) * k;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.ground = probe.heightAt(this.pos.x, this.pos.z);
    this.pos.y = this.ground;
    this.updateRootMatrix();

    // ---- feet (stepping), then the body pose that rests on them
    if (!inBurrow) this.stepFeet(dt);
    this.poseBody(dt);
    // matrices for the IK: Root (world) and Body (root-local)
    const body = this.rig.body;
    body.updateMatrix();
    _mBody.copy(body.matrix);
    _mBodyInv.copy(_mBody).invert();
    this.solveLegs(dt);
    this.updateChelae(dt);
    this.updateEyes(dt);
    this.updateMouth(dt);
  }

  // ------------------------------------------------------------------------------------------ legs

  /**
   * The feet. Standing or shuffling, a foot steps on its own when it has drifted too far from where it belongs.
   * Walking, a gait clock runs: alternating tetrapods (LAG), the stride frequency rising with speed so a stance
   * never asks a leg for more than its reach; each foot lifts as its phase comes round and lands where the body
   * will carry its home spot to by mid-stance. A foot that is about to be pulled straight or twisted past its
   * coxa's swing lifts early whatever the clock says. Planted feet are welded to the sand.
   */
  stepFeet(dt) {
    const cmd = this.cmd;
    const body = this.rig.body;
    // how fast the feet are being left behind (CW/s): walking, plus turning (a foot about 0.9 CW out)
    const v = this.speed / this.cw;
    const sp = v + Math.abs(this.yawRate) * 0.9;
    // the rhythm follows the pace being asked for, so the first steps of setting off already have it
    const spCmd = cmd.freeze ? 0 : Math.min(cmd.vel.length(), cmd.maxSpeed) / this.cw;
    const spG = Math.max(sp, spCmd);
    // walking or standing (with a little hysteresis)
    if (this.gaitOn ? spG < 0.25 : spG > 0.45) {
      this.gaitOn = !this.gaitOn;
      // setting off: the first tetrapod lifts at once rather than waiting for the clock to come round — the one
      // holding the legs the motion is about to stretch (those trailing behind it)
      if (this.gaitOn) {
        const score = [0, 0];
        const c = Math.cos(-this.heading), sn = Math.sin(-this.heading);
        const vx = this.vel.x * c + this.vel.z * sn, vz = -this.vel.x * sn + this.vel.z * c;   // root-local
        const vl = Math.hypot(vx, vz) || 1;
        for (let i = 0; i < 8; i++) {
          _vR.copy(this.feet[i].w).applyMatrix4(_mInv);
          const dx = _vR.x - this.rig.legs[i].base.x, dz = _vR.z - this.rig.legs[i].base.z;
          const dl = Math.hypot(dx, dz) || 1;
          score[GROUP[i]] += Math.max(0, -(dx * vx + dz * vz) / (dl * vl));
        }
        this.clock = score[0] >= score[1] ? 0.995 : 0.495;
      }
    }
    const fast = clamp((spG - 2.5) / 10, 0, 1);           // 0 walk … 1 sprint
    // stance fraction: ~0.72 walking, 0.5 running; stride grows with speed; frequency follows
    const duty = lerp(0.72, 0.5, smoothstep(2, 9, spG));
    // a stance can carry a foot ~0.35 CW between a cramped and a stretched leg (the hind legs are shortest);
    // past that the steps quicken
    const stride = lerp(0.26, 0.36, smoothstep(1, 10, spG));
    const freq = clamp(((spG * duty) / stride) * (0.9 + 0.2 * this.p.speed), 1.4, 20);
    this.duty = duty; this.freq = freq;
    const prevClock = this.clock;
    if (this.gaitOn) this.clock = (this.clock + dt * freq) % 1;
    // landing lead: swing time plus half a stance, so the stance is centred on the home spot
    const tSwing = (1 - duty) / freq, tStance = duty / freq;
    const ahead = this.gaitOn ? tSwing + 0.5 * tStance : 0;
    let swinging = 0;
    const plantedSide = [0, 0];
    for (let i = 0; i < 8; i++) { if (!this.feet[i].planted) swinging++; else plantedSide[i < 4 ? 0 : 1]++; }
    // threshold for standing adjustment steps: how far a planted foot may drift from its ideal spot (CW)
    const thresh = 0.16 * (cmd.freeze ? 3 : 1);
    const cand = [];
    let strain = 0;
    for (let i = 0; i < 8; i++) {
      const f = this.feet[i];
      f.since += dt;
      if (!f.planted) {
        // swing: an arc from lift-off to the landing point; the landing point keeps tracking the ground ahead
        f.t += dt / f.dur;
        this.homeWorld(i, _v, f.ahead * clamp(1 - f.t, 0, 1) + f.lead);
        f.to.lerp(_v, clamp(dt * 14, 0, 1));
        f.to.y = this.probe.heightAt(f.to.x, f.to.z);
        const t = smooth01(f.t);
        f.w.lerpVectors(f.from, f.to, t);
        f.w.y = lerp(f.from.y, f.to.y, t) + Math.sin(Math.PI * Math.min(1, f.t)) * f.lift * this.cw;
        if (f.t >= 1) {
          f.planted = true; f.since = 0;
          f.w.copy(f.to);
          this.emit('footfall', { leg: i, pos: f.w });
        }
        continue;
      }
      // planted: how far from where it would like to be now?
      this.homeWorld(i, _v, 0);
      const err = Math.hypot(_v.x - f.w.x, _v.z - f.w.z) / this.cw;
      f.error = err;
      // and how close to the end of its reach at the height the body wants, and to the end of the coxa's swing
      const leg = this.rig.legs[i];
      _vR.copy(f.w).applyMatrix4(_mInv);
      _vS.copy(leg.base).applyQuaternion(body.quaternion);
      const r = Math.hypot(_vR.x - _vS.x - body.position.x, _vR.z - _vS.z - body.position.z);
      const drop = cmd.height + _vS.y - _vR.y;
      // past the stretched limit outward, or folded tighter than the cramped limit inward
      const excess = Math.max(r - leg.maxReach(drop, true), leg.minReach(drop, true) - r);
      const over = excess + 0.03 + v * 0.02;               // lift a little before the limit, earlier at speed
      const twist = Math.abs(leg.ang.yaw) - 0.54;
      const legErr = leg.error;
      // strain: real limits only (when walking a foot is meant to be off its home spot by half a stride)
      strain = Math.max(strain, this.gaitOn ? 0 : err / 0.45, legErr * 12, excess > 0 ? 1 + excess * 10 : 0, twist > 0.05 ? 1 + twist * 6 : 0);
      let urgency = 0;
      if (over > 0) urgency = Math.max(urgency, 3 + over * 40);
      if (twist > 0) urgency = Math.max(urgency, 3 + twist * 30);
      if (legErr > 0.04) urgency = Math.max(urgency, 2 + legErr * 20);
      if (this.gaitOn) {
        // the clock: lift as this leg's phase comes round to the start of its swing
        const ph = (this.clock - LAG[i] + 1) % 1, ph0 = (prevClock - LAG[i] + 1) % 1;
        if (ph < ph0 && f.since > tStance * 0.4) urgency = Math.max(urgency, 2.5);
      } else if (err > thresh) urgency = Math.max(urgency, err / thresh);
      if (urgency > 0) cand.push({ i, urgency });
    }
    this.strain = strain;
    if (!cand.length || cmd.freeze) return;
    cand.sort((a, b) => b.urgency - a.urgency);
    // feet in the air at once, and feet that must stay down on each side: running crabs carry themselves on
    // fewer legs (the frames are coarse at a run: a swing lasts two or three of them, and the tetrapods overlap)
    const maxSwing = this.gaitOn ? (v > 8 ? 5 : 4) : 2;
    const minDown = this.gaitOn && v > 8 ? 1 : 2;
    for (const c of cand) {
      const i = c.i;
      if (swinging >= maxSwing) break;
      const side = i < 4 ? 0 : 1;
      if (plantedSide[side] <= minDown) continue;
      if (!this.gaitOn) {
        // standing: one foot at a time per neighbourhood, and not one that has only just landed
        let ok = true;
        for (const n of NEIGHBOURS[i]) if (!this.feet[n].planted) { ok = false; break; }
        if (!ok && c.urgency < 3) continue;
        if (this.feet[i].since < 0.06 && c.urgency < 3) continue;
      }
      this.liftFoot(i, this.gaitOn ? tSwing : 0, ahead, spG);
      swinging++;
      plantedSide[side]--;
    }
  }

  /** lift a foot: swing time (0 = choose by distance), landing lead (s), speed (CW/s) */
  liftFoot(i, tSwing, ahead, sp) {
    const f = this.feet[i];
    f.planted = false;
    f.t = 0;
    f.from.copy(f.w);
    // the landing spot is tracked during the swing with a shrinking lead (the time still to go) plus the half
    // stance it should be ahead of home by when it lands
    f.lead = Math.max(0, ahead - tSwing);
    f.ahead = tSwing;
    this.homeWorld(i, f.to, ahead);
    // tiny irregularity: no two steps land identically
    f.to.x += (this.rand() - 0.5) * 0.03 * this.cw;
    f.to.z += (this.rand() - 0.5) * 0.03 * this.cw;
    f.to.y = this.probe.heightAt(f.to.x, f.to.z);
    const dist = f.from.distanceTo(f.to) / this.cw;
    // an adjustment step takes ~0.12–0.2 s; a walking step the clock's swing time
    f.dur = tSwing > 0 ? tSwing : clamp(0.13 * (0.75 + dist * 0.5), 0.08, 0.24) / (0.85 + 0.3 * this.p.speed);
    if (tSwing <= 0) { f.ahead = 0; f.lead = 0; }
    const fast = clamp((sp - 2.5) / 10, 0, 1);
    f.lift = lerp(0.16, 0.24, fast) * this.footLiftMul * clamp(0.6 + dist * 0.8, 0.6, 1.2);
  }

  /** body height, pitch, roll and sway resting on the planted feet */
  poseBody(dt) {
    const cmd = this.cmd, body = this.rig.body;
    const b = cmd.burrow;
    if (b) { this.poseInBurrow(dt, b); return; }
    this.inBurrow = Math.max(0, this.inBurrow - dt * 4);
    // feet heights relative to the root ground, and the support centroid in root-local (CW)
    let left = 0, right = 0, front = 0, back = 0, nl = 0, nr = 0, nf = 0, nb = 0;
    let cx = 0, cz = 0, n = 0, mean = 0;
    for (let i = 0; i < 8; i++) {
      const f = this.feet[i];
      _v.copy(f.w).applyMatrix4(_mInv);              // root-local (CW)
      const dh = _v.y;
      mean += dh;
      if (i < 4) { left += dh; nl++; } else { right += dh; nr++; }
      const k = i % 4;
      if (k < 2) { front += dh; nf++; } else { back += dh; nb++; }
      if (f.planted) { cx += _v.x; cz += _v.z; n++; }
    }
    mean /= 8;
    const rollT = Math.atan2((left / nl - right / nr), 1.6) + cmd.roll;
    const pitchT = Math.atan2((back / nb - front / nf), 0.9) + cmd.pitch;
    // a step lifts weight off: the body dips a hair; and leans toward the legs that hold it
    let swinging = 0;
    for (const f of this.feet) if (!f.planted) swinging += Math.sin(Math.PI * clamp(f.t, 0, 1));
    const dip = swinging * 0.006;
    if (n > 0) { cx /= n; cz /= n; }
    this.sway.x = damp(this.sway.x, clamp(cx * 0.12, -0.04, 0.04), 10, dt);
    this.sway.z = damp(this.sway.z, clamp(cz * 0.1, -0.03, 0.03), 10, dt);
    // the legs that stand must reach their feet: the body rises no higher than the most stretched of them allows
    // (sockets placed with last frame's attitude; a foot that cannot be reached at all is lifted by stepFeet)
    let hMax = Infinity;
    for (let i = 0; i < 8; i++) {
      const f = this.feet[i];
      if (!f.planted) continue;
      const leg = this.rig.legs[i];
      _vR.copy(f.w).applyMatrix4(_mInv);                                  // foot, root-local (CW)
      _vS.copy(leg.base).applyQuaternion(body.quaternion);                // socket relative to the body origin
      const r = Math.hypot(_vR.x - _vS.x - body.position.x, _vR.z - _vS.z - body.position.z);
      hMax = Math.min(hMax, leg.maxDrop(r, true) + _vR.y - _vS.y);
    }
    this.hMax = hMax;
    const hWant = cmd.height + mean - dip;
    let h = this.height.step(Math.min(hWant, hMax - 0.01), dt, cmd.freeze ? 6 : 3.5);
    this.skid = 0;
    if (h > hMax) {
      // the body gives way a little (at most 0.1 CW — the weight shift of setting off — and only so fast); past
      // that a stretched stance foot skids in toward its socket — at a sprint, where the feet are a blur — rather
      // than the body dropping to the sand
      h = Math.max(hMax, hWant - 0.1, body.position.y - 2 * dt);
      for (let i = 0; i < 8; i++) {
        const f = this.feet[i];
        if (!f.planted) continue;
        const leg = this.rig.legs[i];
        _vR.copy(f.w).applyMatrix4(_mInv);
        _vS.copy(leg.base).applyQuaternion(body.quaternion);
        const sx = _vS.x + body.position.x, sz = _vS.z + body.position.z;
        const dx = _vR.x - sx, dz = _vR.z - sz, r = Math.hypot(dx, dz);
        const rMax = leg.maxReach(h + _vS.y - _vR.y, true) - 0.005;
        if (r <= rMax || r < 1e-4) continue;
        _vR.x = sx + (dx * rMax) / r; _vR.z = sz + (dz * rMax) / r;
        _vR.applyMatrix4(_m);
        this.skid = Math.max(this.skid, (r - rMax));
        f.w.x = _vR.x; f.w.z = _vR.z;
        f.w.y = this.probe.heightAt(f.w.x, f.w.z);
      }
      this.height.reset(h);
    }
    const pt = this.pitch.step(pitchT, dt), rl = this.roll.step(rollT, dt);
    // breathing-scale micro motion: the body is never perfectly still
    const j = this.p.jitter;
    const micro = noise1(this.time * 0.7, this.seed) * 0.004 * j;
    body.position.set(this.sway.x + noise1(this.time * 0.5, this.seed + 3) * 0.003 * j, h + micro, this.sway.z);
    _e.set(pt + noise1(this.time * 0.6, this.seed + 5) * 0.01 * j, noise1(this.time * 0.4, this.seed + 7) * 0.012 * j, rl);
    body.quaternion.setFromEuler(_e);
  }

  /**
   * Inside / through a burrow. b.d is the depth (CW, along the shaft axis, + down) of the reference point: the
   * head (between the eyestalk bases) when coming out head first — so d ≈ 0.1 is a peek with only the eyestalks
   * above the rim — or the body centre when going in sideways (b.headUp → 0, rolled onto the leading side).
   * Legs fold down the shaft against its wall; climbing out, they reach for the rim and the gait takes over.
   */
  poseInBurrow(dt, b) {
    const body = this.rig.body;
    // the shaft in root-local terms (the root sits on the entrance, facing the crab's heading)
    const ax = _v.copy(b.axis).applyQuaternion(_q.setFromAxisAngle(UP, -this.heading)).normalize();
    const d = b.d;
    const headUp = b.headUp ?? 1;
    // how far inside: 0 once the head is well out and the body levelling onto the sand
    const inside = smooth01((d + 0.45) / 0.75);
    this.inBurrow = inside;
    const tilt = Math.acos(clamp(-ax.y, -1, 1));
    const lean = (Math.PI / 2 - tilt) * inside * headUp;
    _e.set(-lean, 0, (b.roll ?? 0) * smooth01((d + 0.3) / 0.5));
    body.quaternion.setFromEuler(_e);
    // reference point on the crab: head (0, .42, .42) or body centre (0, .28, 0)
    const ref = _v2.set(0, lerp(0.28, 0.42, headUp), lerp(0, 0.42, headUp)).applyQuaternion(body.quaternion);
    // where it should be: down the axis by d (when d < 0, up from the entrance and a little forward)
    const want = _v3.copy(ax).multiplyScalar(Math.max(0, d));
    if (d < 0) want.set(0, -d * 0.9, -d * 0.35 * headUp);
    const inPos = _v4.copy(want).sub(ref);
    // blended with the standing pose as the crab comes out
    const stand = this.height.v;
    body.position.set(
      lerp(0, inPos.x, inside),
      lerp(Math.max(stand, STANCE.bodyHeight.calm * 0.8), inPos.y, inside),
      lerp(0.08, inPos.z, inside),
    );
    this.height.v = lerp(STANCE.bodyHeight.calm, body.position.y, inside);
    this.pitch.reset(0);
    this.roll.reset(0);
    body.updateMatrix();
    // feet: folded down the shaft against its wall; out on the rim as the crab leaves
    for (let i = 0; i < 8; i++) {
      const f = this.feet[i];
      const leg = this.rig.legs[i];
      leg.homeFoot(_v2, 0.44, 0, 0);
      _v2.y = -0.2;
      _v2.z -= 0.14 * headUp;
      _v2.applyMatrix4(body.matrix).applyMatrix4(_m);          // body → root → world
      this.homeWorld(i, _v3, 0);                                // its spot on the sand
      _v2.lerp(_v3, 1 - inside);
      f.w.lerp(_v2, clamp(dt * 16, 0, 1));
      f.planted = true;
      f.since = 0;
    }
  }

  solveLegs(dt) {
    const legs = this.rig.legs;
    for (let i = 0; i < 8; i++) {
      const f = this.feet[i];
      // world → root-local → body-local
      _v.copy(f.w).applyMatrix4(_mInv).applyMatrix4(_mBodyInv);
      const k = i % 4;
      // the dactylus stabs steeply in stance; it swings more upright, then reaches for the landing
      let dac = STANCE.dactylDeg * DEG;
      if (!f.planted) dac = lerp(dac, -88 * DEG, Math.sin(Math.PI * clamp(f.t, 0, 1)));
      dac -= 0.12 * this.cmd.tiptoe;
      legs[i].solve(_v, dac, CP_BEND[k] * legs[i].side * (f.planted ? 1 : 0.6));
    }
  }

  // ------------------------------------------------------------------------------------------ chelipeds

  /** fingertip target helpers in Body space */
  mouthPoint(out, side) {
    return out.set(side * 0.03, CARAPACE.marginY - 0.01, 0.47);
  }

  updateChelae(dt) {
    const rig = this.rig;
    for (let s = 0; s < 2; s++) {
      const c = this.chela[s];
      const cr = rig.chelae[s];
      const side = c.side;
      const restPose = CHELA_POSES[this.cmd.chelaRest] ?? CHELA_POSES.fold;
      // micro-motion of the resting limb
      const j = this.p.jitter;
      const n0 = fbm1(this.time * 0.6 + s * 10, this.seed + 11) * 0.06 * j;
      const n1 = fbm1(this.time * 0.45 + s * 5, this.seed + 13) * 0.05 * j;
      if (!c.kind) {
        for (let k = 0; k < 7; k++) c.ang[k] = damp(c.ang[k], restPose[k], 8, dt);
        c.ang[1] += n0 * dt * 6; c.ang[4] += n1 * dt * 6;
        cr.setPose(this.withNoise(c.ang, n0, n1));
        continue;
      }
      c.t += dt;
      const k = c.kind;
      if (k === 'scoop') this.runScoop(c, cr, dt);
      else if (k === 'discard' || k === 'dig') this.runDiscard(c, cr, dt);
      else if (k === 'wave') this.runWave(c, cr, dt);
      else if (k === 'probe') this.runProbe(c, cr, dt);
      else c.kind = null;
    }
    // the carried pellet rides on the fingertips
    const carried = this.model.carried;
    const holder = this.chela.find((c) => c.carry);
    carried.visible = !!holder;
    if (holder) {
      const cr = rig.chelae[holder.side > 0 ? 0 : 1];
      cr.fk();
      cr.tip(_v);
      _v.applyMatrix4(_mBody);                         // body → root-local
      carried.position.copy(_v);
      const r = (this.model.pelletDiam * 0.5) * (holder.kind === 'dig' ? 1.8 : 1);
      carried.scale.setScalar(r);
    }
  }

  withNoise(a, n0, n1) {
    this._tmpA ??= [0, 0, 0, 0, 0, 0, 0];
    const o = this._tmpA;
    for (let k = 0; k < 7; k++) o[k] = a[k];
    o[1] += n0; o[4] += n1; o[6] = Math.max(0, o[6] + n1 * 0.3);
    return o;
  }

  /** blend the limb's angles toward a pose (or a CCD solution) */
  blendTo(c, cr, pose, rate, dt) {
    for (let k = 0; k < 7; k++) c.ang[k] = damp(c.ang[k], pose[k], rate, dt);
    cr.setPose(c.ang);
  }

  /** CCD from a posture toward a Body-space fingertip target; then blend there */
  reach(c, cr, init, targetBody, wristPitch, rate, dt, gape) {
    cr.solve(targetBody, wristPitch, 6, [5, 4, 3, 1, 0], init);
    const sol = cr.ang.slice();
    sol[6] = gape;
    this.blendTo(c, cr, sol, rate, dt);
  }

  worldToBody(out, w) { return out.copy(w).applyMatrix4(_mInv).applyMatrix4(_mBodyInv); }

  /**
   * Feeding scoop (the rice-pounder's beat [L]): a sudden drop onto the sand ahead, the fingertips scrape a little
   * sand toward the body, then a slower lift to the mouth, a moment there, and back.
   */
  runScoop(c, cr, dt) {
    const sp = this.p.speed;
    const T = [0.11, 0.14, 0.3, 0.1].map((x) => x / sp);
    let ph = c.phase, t = c.t;
    const target = this.worldToBody(_v3, c.target2);
    if (ph === 0) {
      // drop: fast, fingers open
      this.reach(c, cr, CHELA_POSES.scoop, _v4.copy(target).add(_v2.set(0, 0.05, 0.03)), -1.15, 22, dt, 0.32);
      if (t > T[0]) { c.phase = 1; c.t = 0; this.emit('scoop', { side: c.side, pos: c.target2 }); }
    } else if (ph === 1) {
      // scrape toward the mouth along the surface, closing
      const k = smooth01(t / T[1]);
      _v4.copy(target).add(_v2.set(-c.side * 0.02 * k, 0.005, -0.09 * k));
      this.reach(c, cr, CHELA_POSES.scoop, _v4, -1.0, 26, dt, lerp(0.32, 0.06, k));
      if (t > T[1]) { c.phase = 2; c.t = 0; }
    } else if (ph === 2) {
      // slow lift to the mouth
      this.mouthPoint(_v4, c.side);
      const k = smooth01(t / T[2]);
      _v4.lerp(_v2.copy(target).setY(target.y + 0.05), 1 - k);
      this.reach(c, cr, CHELA_POSES.mouth, _v4, lerp(-1.0, -0.5, k), 14, dt, 0.06);
      if (t > T[2]) { c.phase = 3; c.t = 0; }
    } else if (ph === 3) {
      this.mouthPoint(_v4, c.side);
      this.reach(c, cr, CHELA_POSES.mouth, _v4, -0.45, 18, dt, 0.12 + 0.06 * Math.sin(t * 60));
      if (t > T[3]) {
        c.kind = null;
        this.emit('deposit', { side: c.side });
        c.done?.('scoop');
      }
    }
  }

  /**
   * Pellet removal: reach to the top of the buccal frame where the sorted sand has been pressed into a ball [L],
   * pinch it off, carry it out to the side and down, let it go on the sand at the crab's feet. 'dig' does the same
   * with a lump of wet sand carried out of the burrow.
   */
  runDiscard(c, cr, dt) {
    const sp = this.p.speed;
    const T = [0.2, 0.08, 0.28, 0.06, 0.2].map((x) => x / sp);
    const t = c.t;
    if (c.phase === 0) {
      this.mouthPoint(_v4, c.side * 0.2);
      _v4.y += 0.02;
      this.reach(c, cr, CHELA_POSES.mouth, _v4, -0.4, 16, dt, 0.18);
      if (t > T[0]) { c.phase = 1; c.t = 0; }
    } else if (c.phase === 1) {
      this.mouthPoint(_v4, c.side * 0.2);
      _v4.y += 0.02;
      this.reach(c, cr, CHELA_POSES.mouth, _v4, -0.4, 20, dt, 0.02);
      if (t > T[1]) {
        c.phase = 2; c.t = 0; c.carry = true;
        if (c.kind === 'discard') { this.pelletGrowth = 0; this.model.setMouthPellet(0); }
        this.emit('pinch', { side: c.side, kind: c.kind });
      }
    } else if (c.phase === 2) {
      const drop = this.worldToBody(_v3, c.target2);
      const k = smooth01(t / T[2]);
      this.mouthPoint(_v4, c.side * 0.2);
      _v4.lerp(_v2.copy(drop).setY(drop.y + 0.03 + 0.1 * Math.sin(Math.PI * k)), k);
      this.reach(c, cr, CHELA_POSES.scoop, _v4, lerp(-0.4, -1.0, k), 14, dt, 0.02);
      if (t > T[2]) { c.phase = 3; c.t = 0; }
    } else if (c.phase === 3) {
      const drop = this.worldToBody(_v3, c.target2);
      this.reach(c, cr, CHELA_POSES.scoop, _v4.copy(drop).setY(drop.y + 0.03), -1.0, 20, dt, 0.3);
      if (t > T[3]) {
        c.carry = false;
        c.phase = 4; c.t = 0;
        // where the fingertips actually let go (world)
        cr.fk(); cr.tip(_v4);
        _v4.applyMatrix4(_mBody).applyMatrix4(_m);
        this.emit('drop', { side: c.side, kind: c.kind, pos: _v4.clone() });
      }
    } else {
      this.blendTo(c, cr, CHELA_POSES[this.cmd.chelaRest] ?? CHELA_POSES.fold, 10, dt);
      if (t > T[4]) { const kind = c.kind; c.kind = null; c.done?.(kind); }
    }
  }

  /**
   * Waving [L]: the male rises on his legs, lifts both chelipeds high, then swings them forward and down —
   * a vertical wave. Both sides play it together (the behaviour starts them in the same frame).
   */
  runWave(c, cr, dt) {
    const sp = this.p.speed;
    const T = [0.32, 0.12, 0.22, 0.28].map((x) => x / sp);
    const t = c.t;
    if (c.phase === 0) {
      this.blendTo(c, cr, CHELA_POSES.wave, 9, dt);
      if (t > T[0]) { c.phase = 1; c.t = 0; if (c.side > 0) this.emit('wave', {}); }
    } else if (c.phase === 1) {
      this.blendTo(c, cr, CHELA_POSES.wave, 12, dt);
      if (t > T[1]) { c.phase = 2; c.t = 0; }
    } else if (c.phase === 2) {
      // the sweep forward and down
      this.blendTo(c, cr, CHELA_POSES.guard, 16, dt);
      if (t > T[2]) { c.phase = 3; c.t = 0; }
    } else {
      this.blendTo(c, cr, CHELA_POSES.fold, 9, dt);
      if (t > T[3]) { c.kind = null; c.done?.('wave'); }
    }
  }

  /** a light touch of the sand ahead (surface scan) */
  runProbe(c, cr, dt) {
    const target = this.worldToBody(_v3, c.target2);
    if (c.phase === 0) {
      this.reach(c, cr, CHELA_POSES.scoop, _v4.copy(target).add(_v2.set(0, 0.02, 0)), -1.1, 10, dt, 0.15);
      if (c.t > 0.22) { c.phase = 1; c.t = 0; }
    } else {
      this.blendTo(c, cr, CHELA_POSES[this.cmd.chelaRest] ?? CHELA_POSES.fold, 8, dt);
      if (c.t > 0.25) { c.kind = null; c.done?.('probe'); }
    }
  }

  // ------------------------------------------------------------------------------------------ eyestalks

  /**
   * Each eyestalk is its own: erect or folded into its orbit, and swinging a little toward whatever it watches —
   * a threat, a neighbour, the sand being worked — with small irregular jumps in between (never a rolling eyeball).
   */
  updateEyes(dt) {
    const cmd = this.cmd;
    const rig = this.rig;
    for (let s = 0; s < 2; s++) {
      const e = rig.eyes[s];
      const fold = this.eyeFold[s].step(cmd.eyeFold, dt, cmd.eyeFold > this.eyeFold[s].v ? 7 : 2.2);
      // where to look: a world point → body-space direction from the eye base
      const look = s === 0 ? cmd.look : (cmd.look2 ?? cmd.look);
      if (look) {
        this.worldToBody(_v, look).sub(e.base.position).normalize();
        this.eyeTarget[s].copy(_v);
      }
      // saccade-like re-aiming now and then, more often when alert
      this.eyeSacc[s] -= dt;
      if (this.eyeSacc[s] <= 0) {
        this.eyeSacc[s] = (0.35 + this.rand() * 1.6) / (0.6 + cmd.scan + cmd.alert);
        if (!look) {
          const a = (this.rand() - 0.5) * 2.4 + (s === 0 ? 0.5 : -0.5);
          this.eyeTarget[s].set(Math.sin(a), 0.25 + this.rand() * 0.6, Math.cos(a)).normalize();
        }
      }
      this.eyeLook[s].lerp(this.eyeTarget[s], clamp(dt * (8 + 10 * cmd.alert), 0, 1)).normalize();
      const tremor = noise1(this.time * 9 + s * 3, this.seed + 21) * 0.02;
      _v2.copy(this.eyeLook[s]);
      _v2.x += tremor;
      e.pose(fold, _v2, 0.45 + 0.4 * cmd.alert, 0.06 + noise1(this.time * 1.3 + s, this.seed + 23) * 0.05);
    }
  }

  // ------------------------------------------------------------------------------------------ mouthparts

  updateMouth(dt) {
    const rig = this.rig;
    const act = this.cmd.mouth;
    // the third maxillipeds part a little and flutter while sand is being sorted; never a clean sine
    const flutter = act > 0.01 ? (0.5 + 0.5 * Math.sin(this.time * (32 + 8 * noise1(this.time, this.seed)))) * (0.05 + 0.07 * act) : 0;
    const target = 0.015 + flutter + act * 0.03 + Math.max(0, noise1(this.time * 0.8, this.seed + 31)) * 0.01;
    this.mxp = damp(this.mxp, target, 18, dt);
    for (let s = 0; s < 2; s++) {
      const m = rig.mxp[s];
      m.quaternion.copy(rig.mxpBind[s]).multiply(_q2.setFromAxisAngle(_v.set(0, 0, 1), this.mxp * (s === 0 ? 1 : 1)));
    }
  }

  /** the world position of the body centre (camera anchor) — this crab's own root, not the shared scratch matrix */
  anchor(out) {
    const body = this.rig.body;
    return out.copy(body.position).add(_v.set(0, 0.25, 0)).applyMatrix4(this.model.root.matrix);
  }
}

export { NEIGHBOURS, GROUP };
