import * as THREE from 'three';
import { animation as ANIM, joints as J } from './KentishPloverConfig.js';
import { KentishPloverConfig as CFG } from './KentishPloverConfig.js';
import { computeWingFold, spreadAt, spreadScaleAt, raiseAt, foldAt, foldScaleAt, foldPath, WING_RAISE } from './anatomy/wingFold.js';
import { getBodySDF, getTorsoSDF } from './anatomy/bodyMesh.js';
import { WING } from './anatomy/featherLayout.js';
import { BILL } from './anatomy/bareParts.js';
import { clamp, lerp, damp, smoothstep, makeRng, makeFbm1D, frameQuat, mirrorQuat, wrapAngle } from '../../core/math.js';

// Procedural, layered animation for the plover (docs/animation_reference.md).
// Layers: posture → locomotion (planted feet + 2-bone IK) → head/gaze (space-stabilised) →
//         actions (peck, preen, …) → wings/tail → micro (breathing, blinks).
// The entity owns root position/heading; the animator only poses bones relative to it.

const mm = 0.001;
const DEG = Math.PI / 180;
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const qAxis = (axis, a, out = new THREE.Quaternion()) => out.setFromAxisAngle(axis, a);
const easeInOut = (t) => t * t * (3 - 2 * t);
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

// Bind-pose vectors (mm → m)
const V = (a) => new THREE.Vector3(a[0] * mm, a[1] * mm, a[2] * mm);
const BIND = {
  headPivot: V(J.head),
  neck0: V(J.neck0),
  billTip: V(BILL.tip),
  hip: V(J.hip),
  knee: V(J.knee),
  ankle: V(J.ankle),
  foot: V(J.foot),
};
const L_TIB = BIND.ankle.distanceTo(BIND.knee);
const L_TAR = BIND.foot.distanceTo(BIND.ankle);
const BILL_FROM_HEAD = BIND.billTip.clone().sub(BIND.headPivot); // head-local (bind rotation = identity)
const NECK_LEN = BIND.headPivot.distanceTo(BIND.neck0);
// resting gaze pitch (rad, + = bill down): with the bind bill axis (23.6° down) the relaxed bill points 25° down
// (photos 20–27°, body_shape_spec.md §6, §17.3)
export const GAZE_PITCH_REST = 0.02;

// ---------------------------------------------------------------- contact with the plumage
// Trunk outline without the head and the neck-filling plumage (rest space, mm) and the head's outline as sample points (head-local,
// mm from the head pivot): when preening or resting with the bill in the scapulars the head is kept on top
// of the plumage lying on the body instead of sinking into it. The relaxed head is sunk into the mantle /
// fore-breast (no visible neck, body_shape_spec.md §7), so each point may sink no deeper than it does at rest.
const TORSO_SDF = getTorsoSDF(CFG, { trunkOnly: true });
const PLUMAGE = 3.5; // mm: scapulars, lesser coverts and tertials above the outline
// mm: how much deeper than at rest a head / neck point on or near the trunk at rest may go — the neck-filling
// plumage (mantleNape, foreBreast) is compressed when the neck retracts (walking: crown only ≈6 mm above the
// back, photos; body_shape_spec.md §7, §12). Points clear of the trunk at rest (crown, face) get none.
const SINK = 10;
// share of the body pitch that carries the head pivot with it (about the hip). 1: the head keeps its place on
// the body — walking photos in the bill–tail frame match the relaxed stand (IoU 0.88), only the crown sits lower
const HEAD_PITCH_FOLLOW = 1;
const sinkLimit = (rest, need) => Math.min(rest, need) - SINK * smoothstep(need + 6, need + 2, rest);
const HEAD_PTS = (() => {
  const head = CFG.bodySculpt.prims.find((p) => p.name === 'head');
  const c = [head.c[0] - J.head[0], head.c[1] - J.head[1], head.c[2] - J.head[2]];
  const pts = [new THREE.Vector3(c[0], c[1] + head.r[1], c[2]), new THREE.Vector3(c[0], c[1] - head.r[1], c[2])];
  for (let la = -2; la <= 2; la++)
    for (let lo = 0; lo < 8; lo++) {
      const a = (la * 30 * Math.PI) / 180;
      const b = (lo / 8) * Math.PI * 2;
      pts.push(new THREE.Vector3(c[0] + head.r[0] * Math.cos(a) * Math.sin(b), c[1] + head.r[1] * Math.sin(a), c[2] + head.r[2] * Math.cos(a) * Math.cos(b)));
    }
  // depth over the torso outline at rest (mm)
  for (const q of pts) q.rest = TORSO_SDF(q.x + J.head[0], q.y + J.head[1], q.z + J.head[2]);
  return pts;
})();
// The neck the same way: rings on its outline around neck1 / neck2 (bone-local, mm), each allowed to sink no
// lower than min(its rest height over the torso, the plumage) — when the head is turned back to preen the
// flank or tucked into the scapulars the neck lies on the scapulars instead of passing through them. `t`:
// how far along the chain from neck0 to the head the point is (a push of the head moves it by about t).
const NECK_PTS = (() => {
  const neck = CFG.bodySculpt.neckContact; // the neck is not sculpted (filled by mantleNape / foreBreast at rest)
  const axis = new THREE.Vector3(...neck.b).sub(new THREE.Vector3(...neck.a)).normalize();
  const u = new THREE.Vector3(1, 0, 0);
  const v = axis.clone().cross(u).normalize();
  const n0 = new THREE.Vector3(...J.neck0);
  const len = new THREE.Vector3(...J.head).distanceTo(n0);
  const pts = [];
  for (const bone of ['neck1', 'neck2']) {
    const c = new THREE.Vector3(...J[bone]);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const rest = c.clone().addScaledVector(u, neck.r * Math.cos(a)).addScaledVector(v, neck.r * Math.sin(a));
      pts.push({ bone, local: rest.clone().sub(c), rest: TORSO_SDF(rest.x, rest.y, rest.z), t: c.distanceTo(n0) / len });
    }
  }
  return pts;
})();
// Folded wing raised off the flank (preening under it, scratching over it): wingFold.WING_RAISE
const WING_HINGE = new THREE.Vector3(...WING_RAISE.hinge);

// ---------------------------------------------------------------- wing fold solution
// (anatomy/wingFold.js: Z-folded arm + per-feather orientations that wrap the curved flank)
let FOLD = null;
function getFold(model) {
  if (!FOLD) FOLD = computeWingFold(model.spec.wingFeathers, getBodySDF(CFG), getTorsoSDF(CFG));
  return FOLD;
}

/** Left-wing local rotation from (sweep back, elevation, twist/pronation) in the bone's bind frame. */
function wingQuat(sweep, elev, twist, out = new THREE.Quaternion()) {
  out.setFromAxisAngle(Y, sweep);
  out.multiply(_q2.setFromAxisAngle(Z, elev));
  out.multiply(_q2.setFromAxisAngle(X, twist));
  return out;
}

// ---------------------------------------------------------------- the animator
export class KentishPloverAnimator {
  constructor(model, { seed = 1, individual = {} } = {}) {
    this.model = model;
    this.b = model.bones;
    this.fold = getFold(model);
    this.rng = makeRng(seed * 977 + 13);
    this.ind = individual;
    this.timing = 1 + (individual.animationTiming ?? 0);
    this.headAmp = 1 + (individual.headMovement ?? 0);
    this.legScale = 1 + (individual.legLength ?? 0);
    this.n1 = makeFbm1D(seed * 3 + 1);
    this.n2 = makeFbm1D(seed * 5 + 2);
    this.n3 = makeFbm1D(seed * 7 + 3);
    this.time = this.rng() * 100;

    // Root (set by the entity every frame)
    this.rootPos = new THREE.Vector3();
    this.heading = 0;
    this.velocity = new THREE.Vector3();
    this.groundHeight = () => 0;

    // Smoothed posture state
    this.p = {
      height: 0, // body vertical offset (m)
      pitch: 0, // body pitch (rad, + = nose down)
      roll: 0,
      neck: 0, // −1 retracted … 0 relaxed … +1 fully stretched (alert)
      fold: 1, // 1 folded wings, 0 spread
      tailPitch: 0,
      tailSpread: 0,
      fluff: 0,
      sleep: 0,
      oneLeg: 0, // 0 both legs, 1 = left raised, −1 = right raised
      sit: 0,
    };
    this.target = { ...this.p };
    this.posture = 'relaxed';

    // Gait
    this.stride = { clock: 0, duty: 0.62, hz: 0, amount: 0 };
    this.feet = ['L', 'R'].map((s, i) => ({
      side: s,
      sign: i === 0 ? 1 : -1,
      phaseOffset: i * 0.5,
      planted: new THREE.Vector3(),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      yaw: 0,
      yawFrom: 0,
      yawTo: 0,
      pos: new THREE.Vector3(),
      swing: 0, // 0 stance, 0..1 swing progress
      lift: 0,
      wasSwing: false,
      initialised: false,
      raise: 0, // for one-leg rest / scratching (0..1)
    }));
    this.idleStepTimer = 0;

    // Head / gaze
    this.gaze = { yaw: 0, pitch: GAZE_PITCH_REST, roll: 0, tYaw: 0, tPitch: GAZE_PITCH_REST, tRoll: 0, timer: 0, mode: 'idle', point: null };
    this.headWorldTarget = null; // optional absolute head-pivot target (set by actions)
    this.headOverride = null; // {q: world quaternion}
    this.headStab = new THREE.Vector3();

    // Wings / flight
    this.foldLR = [1, 1]; // how folded each wing is (after action overrides)
    this.flight = { active: false, phase: 0, hz: ANIM.flight.cruiseHz, amp: 0, glide: 0, flap: 0, brake: 0 };
    this.attitude = { pitch: 0, roll: 0 }; // whole-body attitude in flight (set by the entity)

    // Actions
    this.action = null;
    this.events = [];

    // Micro
    this.blink = { t: 0, next: this._nextBlink(), dur: ANIM.blinkDuration };
    this.lids = { close: 0, target: 0 };
    this.breathPhase = this.rng() * 10;

    // Lean from acceleration
    this._prevVel = new THREE.Vector3();
    this.accel = new THREE.Vector3();
    this.aFwd = 0; // low-passed forward acceleration
    this.lean = 0;

    this._initFeet = true;
    this._coverts = { L: [], R: [] };
    for (const bone of model.boneList) {
      const f = bone.userData.spec.feather;
      if (f && (/Covert$/.test(f.type) || f.type === 'alula')) this._coverts[bone.name.endsWith('_L') ? 'L' : 'R'].push(bone);
    }
  }

  // ------------------------------------------------------------ public API
  setRoot(pos, heading, velocity) {
    this.rootPos.copy(pos);
    this.heading = heading;
    if (velocity) this.velocity.copy(velocity);
  }

  /** Place the whole bird at the root (position, heading, flight attitude) without re-posing the skeleton. */
  placeRoot(pos, heading) {
    const obj = this.model.object;
    obj.position.copy(pos);
    obj.quaternion.setFromAxisAngle(Y, heading);
    if (this.attitude.pitch || this.attitude.roll) obj.quaternion.multiply(qAxis(X, this.attitude.pitch, _q)).multiply(qAxis(Z, this.attitude.roll, _q2));
  }

  setPosture(name) {
    this.posture = name;
  }

  /** Gaze: mode ∈ idle | scan | fixate | forward | ground; point = world position (fixate/ground). */
  setGaze(mode, point = null) {
    if (mode !== this.gaze.mode) this.gaze.timer = 0;
    this.gaze.mode = mode;
    this.gaze.point = point ? (this.gaze.point || new THREE.Vector3()).copy(point) : null;
  }

  setFlight(active, { hz, amp = 1, glide = 0, brake = 0 } = {}) {
    this.flight.active = active;
    if (hz) this.flight.hz = hz;
    this.flight.ampTarget = amp;
    this.flight.glide = glide;
    this.flight.brake = brake;
  }

  /** Start an action. Returns the action record; `onEvent(name)` receives 'strike', 'done', … */
  play(name, params = {}, onEvent = null) {
    const def = ACTIONS[name];
    if (!def) throw new Error(`unknown action ${name}`);
    const dur = typeof def.duration === 'function' ? def.duration(params, this) : def.duration;
    this.action = { name, def, params, t: 0, dur: dur * this.timing, onEvent, fired: new Set() };
    return this.action;
  }

  stopAction() {
    this.action = null;
  }

  get busy() {
    return !!this.action;
  }

  /** Validation/preview helper: evaluate a named pose/action at normalised time t. */
  previewAction(name, t = 0.5, variant) {
    this.setRoot(new THREE.Vector3(), 0, new THREE.Vector3());
    this._initFeet = true;
    // reset transient state so previews are independent of each other
    this.action = null;
    this.flight.active = false;
    this.flight.freeze = false;
    this.flight.amp = 0;
    this.flight.glide = 0;
    this.flight.brake = 0;
    this.p.fold = this.target.fold = 1;
    if (name === 'stand') this.setPosture('relaxed');
    else if (name === 'alert') this.setPosture('alert');
    else if (name === 'forage') this.setPosture('forage');
    else if (name === 'restOneLeg') this.setPosture('restOneLeg');
    else if (name === 'restTucked') this.setPosture('restTucked');
    else if (name === 'sit') this.setPosture('sit');
    else if (name === 'walk' || name === 'run') {
      const speed = name === 'walk' ? ANIM.walk.speed : ANIM.run.speed;
      this.velocity.set(0, 0, speed);
      this.setPosture(name === 'run' ? 'run' : 'relaxed');
      // simulate a few strides on a treadmill (root fixed, ground scrolling)
      this._treadmill = speed;
      for (let i = 0; i < 180; i++) this.update(1 / 60);
      const hz = this.stride.hz || 1;
      const steps = Math.round(((t % 1) / hz) * 60);
      for (let i = 0; i < steps; i++) this.update(1 / 60);
      this._treadmill = 0;
      return;
    } else if (name === 'flight' || name === 'glide') {
      this.setFlight(true, { amp: name === 'glide' ? 0 : 1, glide: name === 'glide' ? 1 : 0 });
      this.flight.phase = t;
      this.flight.amp = name === 'glide' ? 0 : 1;
      this.p.fold = 0;
      this.target.fold = 0;
      this.flight.freeze = true;
      this.update(0);
      this._settle(1);
      this.flight.phase = t;
      this.update(0);
      return;
    } else if (ACTIONS[name]) {
      // freeze the action at normalised time t and let the smoothed posture converge on it
      this.play(name, { variant, target: new THREE.Vector3(0, 0, 0.055), preyType: variant === 'crab' ? 'crab' : 'polychaete' });
      this.action.t = t * this.action.dur;
      this._freezeAction = true;
      this._settle(1.2);
      this._freezeAction = false;
      return;
    }
    this._settle(1.5);
  }

  /** Cheap path for invisible / far birds: advance action timelines and fire their events, no posing. */
  advance(dt) {
    this.time += dt;
    if (this.action) {
      const a = this.action;
      a.t += dt;
      const u = clamp(a.t / a.dur, 0, 1);
      if (a.def.events) {
        for (const [name, at] of Object.entries(a.def.events)) {
          if (u >= at && !a.fired.has(name)) {
            a.fired.add(name);
            a.onEvent?.(name);
          }
        }
      }
      if (u >= 1) {
        this.action = null;
        a.onEvent?.('done');
      }
    }
    if (this.flight.active) this.flight.phase = (this.flight.phase + dt * this.flight.hz) % 1;
    this._initFeet = true;
  }

  _settle(seconds) {
    const n = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) this.update(seconds > 0 ? 1 / 60 : 0, { preview: true });
  }

  // ------------------------------------------------------------ main update
  update(dt, opts = {}) {
    this.time += dt;
    const b = this.b;
    const model = this.model;
    // reset bones to bind
    for (const bone of model.boneList) {
      bone.position.copy(bone.userData.bindLocalPos);
      bone.quaternion.copy(bone.userData.bindLocalQuat);
    }
    // place the whole bird
    const obj = model.object;
    this.placeRoot(this.rootPos, this.heading);
    obj.updateMatrixWorld(false);

    // acceleration → lean (plovers pitch forward when accelerating, rock back on stopping)
    if (dt > 0) {
      this.accel.copy(this.velocity).sub(this._prevVel).divideScalar(dt);
      this._prevVel.copy(this.velocity);
      const fwd = _v.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      const LN = ANIM.lean;
      this.aFwd = damp(this.aFwd, clamp(this.accel.dot(fwd), -15, 15), LN.inputRate, dt);
      this.lean = damp(this.lean, clamp(this.aFwd * LN.gain, -LN.max, LN.max), LN.rate, dt);
    }

    this._postureTargets();
    let act = null;
    if (this.action) act = this._runAction(dt);
    // smooth posture
    const rates = { height: 10, pitch: 9, roll: 8, neck: 7, fold: 7, tailPitch: 8, tailSpread: 8, fluff: 3, sleep: 1.5, oneLeg: 5, sit: 3 };
    for (const k of Object.keys(this.p)) {
      const r = (act && act.fast && act.fast[k]) || rates[k] || 8;
      this.p[k] = dt > 0 ? damp(this.p[k], this.target[k], r, dt) : this.target[k];
    }

    // -------------------------------------------------- body
    const speed = this.velocity.length();
    this._updateStride(dt, speed);
    const breath = Math.sin((this.time * ANIM.breathHz * 2 * Math.PI) / this.timing + this.breathPhase);
    const bob = this.stride.amount * this._bob();
    const sway = this.stride.amount * this._sway();
    const body = b.body;
    const flying = this.flight.active || this.flight.amp > 0.02;
    const idleShift = (1 - this.stride.amount) * (flying ? 0 : 1) * this.n1(this.time * 0.13) * 0.0007;
    body.position.y += this.p.height + bob - this.p.sit * 0.022;
    body.position.x += sway + idleShift;
    body.quaternion.multiply(qAxis(X, this.p.pitch + this.lean + (act?.pitchAdd ?? 0), _q));
    body.quaternion.multiply(qAxis(Z, this.p.roll + sway * 8 + idleShift * 6, _q));
    // breathing: chest/flank expansion in the body shader (allometric rate, animation_reference.md)
    this.model.setBreath(breath * (0.6 + 0.4 * this.p.sleep));

    // -------------------------------------------------- wings & tail
    this._poseWings(dt, act);
    this._poseTail(act);

    // -------------------------------------------------- legs
    obj.updateMatrixWorld(true);
    if (flying && !(act && act.legsGround)) this._legsFlight(act);
    else this._legsGround(dt, act);

    // -------------------------------------------------- head & neck
    this._updateGaze(dt, act);
    this._poseNeckHead(dt, act);

    // -------------------------------------------------- micro: blink / lids / fluff
    this._updateLids(dt, act);
    model.setFluff(this.p.fluff);
    model.setWingFold(this.foldLR[0], this.foldLR[1]);
    // feathers are sleeked when alert/flying (less flutter), loose when fluffed/resting
    model.setFeatherTime(this.time, clamp(0.35 + this.p.fluff * 0.4 - (this.flight.active ? 0.2 : 0), 0.05, 1));
    obj.updateMatrixWorld(true);
  }

  // ------------------------------------------------------------ posture presets
  _postureTargets() {
    const t = this.target;
    const P = this.posture;
    const run = this.stride.amount * smoothstep(0.5, 1.2, this.velocity.length());
    Object.assign(t, { height: 0, pitch: 0, roll: 0, neck: 0, fold: 1, tailPitch: 0, tailSpread: 0, fluff: 0.15, sleep: 0, oneLeg: 0, sit: 0 });
    // pitch is relative to the bind = relaxed stand (body axis 10° tail-down); values from the photos
    // (body_shape_spec.md §12)
    switch (P) {
      case 'alert': // head up, neck stretched, body more upright, feathers sleeked (S11; spec §12, n = 1)
        Object.assign(t, { height: 0.003, pitch: -0.1, neck: 0.6, fluff: -0.25, tailPitch: 0.05 });
        break;
      case 'forage': // searching: body tipped forward (axis ≈ −8°), neck slightly extended, bill 35–45° down
        Object.assign(t, { height: -0.002, pitch: 0.3, neck: 0.2, fluff: 0.1 });
        break;
      case 'hunched': // aggressive run posture: head low & forward
        Object.assign(t, { height: -0.004, pitch: 0.47, neck: -0.3, fluff: 0.35, tailPitch: -0.1 });
        break;
      case 'run':
        Object.assign(t, { height: -0.003, pitch: ANIM.run.bodyPitch, neck: ANIM.run.neck, fluff: -0.1 });
        break;
      case 'restOneLeg':
        Object.assign(t, { height: 0.001, pitch: 0.01, neck: -1, fluff: 0.8, sleep: 0.7, oneLeg: 1 });
        break;
      case 'restTucked':
        Object.assign(t, { height: 0.0, pitch: 0.0, neck: -1, fluff: 0.9, sleep: 1, oneLeg: 1 });
        break;
      case 'sit':
        Object.assign(t, { height: 0, pitch: 0, neck: -1, fluff: 0.9, sleep: 0.8, sit: 1 });
        break;
      default:
        break;
    }
    // walking levels the body and lowers the head (12 walking photos: axis −1°, crown ≈6 mm over the back)
    if (P !== 'run' && P !== 'forage' && P !== 'hunched') {
      const walk = this.stride.amount;
      t.pitch += walk * ANIM.walk.bodyPitch;
      if (P !== 'alert') t.neck = lerp(t.neck, Math.min(t.neck, ANIM.walk.neck), walk);
    }
    if (run > 0 && P !== 'run') {
      t.pitch = lerp(t.pitch, Math.max(t.pitch, ANIM.run.bodyPitch), run);
      t.neck = lerp(t.neck, ANIM.run.neck, run);
    }
    if (this.flight.active) {
      // level body in flight: +0.17 from the tail-down bind (spec §12)
      Object.assign(t, { fold: 0, pitch: 0.17, neck: -0.6, fluff: -0.3, tailSpread: this.flight.brake * 0.9, tailPitch: this.flight.brake * 0.35, oneLeg: 0, sit: 0, sleep: 0 });
    }
  }

  // ------------------------------------------------------------ gait
  _strideParams(speed) {
    const w = ANIM.walk;
    const r = ANIM.run;
    const u = clamp((speed - w.speed) / (r.speed - w.speed), 0, 1);
    const hz = speed < w.speed ? w.strideHz * Math.max(0.55, Math.sqrt(speed / w.speed)) : lerp(w.strideHz, r.strideHz, Math.sqrt(u)) + Math.max(0, speed - r.speed) * 2.2;
    // trunk bob (2× stride frequency) and sway (1×) are acceleration-limited (ANIM.trunkMaxAccel)
    const w2 = (2 * Math.PI * (hz / this.timing)) ** 2;
    return {
      hz: hz / this.timing,
      duty: lerp(w.duty, r.duty, u),
      bob: Math.min(lerp(w.bob, r.bob, u), ANIM.trunkMaxAccel / (2 * w2)),
      sway: Math.min(ANIM.sway, ANIM.trunkMaxAccel / w2),
      lift: lerp(w.footLift, r.footLift, u),
    };
  }

  _updateStride(dt, speed) {
    const s = this.stride;
    const moving = speed > 0.02 && !this.flight.active;
    const P = this._strideParams(Math.max(speed, 0.05));
    s.hz = P.hz;
    s.duty = P.duty;
    s.bobA = P.bob;
    s.swayA = P.sway;
    s.lift = P.lift;
    s.amount = dt > 0 ? damp(s.amount, moving ? 1 : 0, moving ? 12 : 8, dt) : moving ? 1 : 0;
    if (moving) s.clock = (s.clock + dt * s.hz) % 1;
  }

  _bob() {
    // inverted pendulum: body highest at mid-stance of each leg (2 peaks per stride)
    const ph = this.stride.clock;
    return this.stride.bobA * 0.5 * (1 - Math.cos(ph * 4 * Math.PI)) - this.stride.bobA * 0.5;
  }
  _sway() {
    return Math.sin(this.stride.clock * 2 * Math.PI) * this.stride.swayA;
  }

  // ------------------------------------------------------------ legs on the ground (planted feet + IK)
  _legsGround(dt, act) {
    const b = this.b;
    const obj = this.model.object;
    const ground = this.groundHeight;
    const speed = this.velocity.length();
    const moving = this.stride.amount > 0.05 && speed > 0.02;
    const fwd = _v3.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const s = this.stride;
    for (const f of this.feet) {
      // rest (neutral) foot position under the hip in world space
      const rest = _v.set(J.foot[0] * mm * f.sign, 0, J.foot[2] * mm + ANIM.gaitCentreOffset * this.stride.amount).applyQuaternion(obj.quaternion).add(this.rootPos);
      rest.y = ground(rest.x, rest.z);
      if (this._initFeet || !f.initialised) {
        f.planted.copy(rest);
        f.pos.copy(rest);
        f.yaw = this.heading;
        f.initialised = true;
      }
      if (this._treadmill) {
        // preview on a treadmill: ground scrolls backward under a fixed root
        f.planted.z -= this._treadmill * dt;
      }
      let swing = 0;
      if (moving) {
        const ph = (s.clock + f.phaseOffset) % 1;
        const inSwing = ph >= s.duty;
        if (inSwing) {
          const u = (ph - s.duty) / (1 - s.duty);
          if (!f.wasSwing) {
            f.from.copy(f.planted);
            f.yawFrom = f.yaw;
          }
          // predicted touchdown: under the hip half a stance ahead
          const stanceTime = s.duty / s.hz;
          const remaining = (1 - u) * ((1 - s.duty) / s.hz);
          f.to.copy(rest).addScaledVector(this.velocity, remaining + stanceTime * 0.5);
          if (this._treadmill) f.to.copy(rest).addScaledVector(fwd, this._treadmill * stanceTime * 0.5);
          f.to.y = ground(f.to.x, f.to.z);
          f.yawTo = this.heading;
          const e = easeInOut(u);
          f.pos.lerpVectors(f.from, f.to, e);
          f.pos.y = lerp(f.from.y, f.to.y, e) + Math.sin(u * Math.PI) ** 0.8 * s.lift * this.legScale;
          f.yaw = f.yawFrom + wrapAngle(f.yawTo - f.yawFrom) * e;
          swing = u;
          f.wasSwing = true;
        } else {
          if (f.wasSwing) {
            f.planted.copy(f.to);
            f.wasSwing = false;
          }
          f.pos.copy(f.planted);
          f.stance = ph / s.duty;
        }
      } else {
        f.stance = 0;
        // standing: settle any airborne foot; take a corrective step if the body drifted/turned
        if (f.wasSwing) {
          f.planted.copy(f.to);
          f.wasSwing = false;
        }
        const drift = _v2.copy(f.planted).sub(rest).setY(0).length();
        const turn = Math.abs(wrapAngle(this.heading - f.yaw));
        if (!f.stepping && (drift > 0.012 || turn > 0.5) && this._canStep(f)) {
          f.stepping = 0.0001;
          f.from.copy(f.planted);
          f.yawFrom = f.yaw;
        }
        if (f.stepping) {
          f.stepping = Math.min(1, f.stepping + dt * 5.5);
          const u = f.stepping;
          f.to.copy(rest);
          const e = easeInOut(u);
          f.pos.lerpVectors(f.from, f.to, e);
          f.pos.y += Math.sin(u * Math.PI) * 0.005;
          f.yaw = f.yawFrom + wrapAngle(this.heading - f.yawFrom) * e;
          swing = u < 1 ? u : 0;
          if (u >= 1) {
            f.planted.copy(f.to);
            f.stepping = 0;
          }
        } else f.pos.copy(f.planted);
      }
      f.swing = swing;
      if (swing > 0) f.stance = 0;
      // raised leg (one-legged rest, scratching, foot trembling)
      const raiseTarget = (this.p.oneLeg > 0 && f.side === 'R' ? this.p.oneLeg : 0) + (act?.legRaise?.[f.side] ?? 0);
      f.raise = raiseTarget;
    }
    this._initFeet = false;

    // Body height compensation when standing on one leg: shift over the support leg
    const b0 = b.body;
    if (this.p.oneLeg > 0.01) b0.position.x += 0.0035 * this.p.oneLeg;
    this.model.object.updateMatrixWorld(true);

    for (const f of this.feet) this._solveLeg(f, act);
  }

  _canStep(f) {
    const other = this.feet.find((o) => o !== f);
    return !other.stepping && this.p.oneLeg < 0.5 && !this.p.sit;
  }

  /** Two-bone IK (tibiotarsus + tarsometatarsus) with the intertarsal joint pointing backward. */
  _solveLeg(f, act) {
    const b = this.b;
    const s = f.side;
    const femur = b[`femur_${s}`];
    const tib = b[`tibio_${s}`];
    const tar = b[`tarso_${s}`];
    const foot = b[`foot_${s}`];
    const bodyQ = b.body.getWorldQuaternion(_q2);
    // femur swings slightly with the stride (thigh mostly fixed in birds, knee drives — S24)
    // femur: protracted (knee forward, negative X-rotation) at touchdown, retracts through stance
    // (knee moves back/down), swings forward again in swing. Larger arcs when running.
    const st = f.stance ?? 0;
    const runMixF = clamp((this.velocity.length() - ANIM.walk.speed) / (ANIM.run.speed - ANIM.walk.speed), 0, 1);
    const pro = lerp(0.16, 0.32, runMixF);
    const ret = lerp(0.1, 0.22, runMixF);
    const femurSwing = this.stride.amount * (f.swing > 0 ? lerp(ret, -pro, easeInOut(f.swing)) : lerp(-pro, ret, st));
    // hip extension compensates body pitch so the knee stays over the feet (the body pivots over the legs)
    const hipComp = -(this.p.pitch + this.lean) * 0.8;
    femur.quaternion.multiply(qAxis(X, femurSwing + hipComp - this.p.sit * 0.6 - f.raise * 0.5, _q));
    femur.updateMatrixWorld(true);
    const knee = tib.getWorldPosition(new THREE.Vector3());

    let target = new THREE.Vector3().copy(f.pos);
    target.y += J.foot[1] * mm; // joint above the sole
    // heel-off: in late stance the MTP joint rises while the toe tips stay planted
    const runMix = clamp((this.velocity.length() - ANIM.walk.speed) / (ANIM.run.speed - ANIM.walk.speed), 0, 1);
    const heel = this.stride.amount * smoothstep(0.55, 1.0, st) * lerp(ANIM.heelLift.walk, ANIM.heelLift.run, runMix);
    target.y += heel;
    const raise = f.raise;
    if (raise > 0.001) {
      // tuck the foot up under the belly feathers (one-legged rest) or forward for scratching
      const tuck = new THREE.Vector3(J.foot[0] * mm * f.sign * 0.5, 0.042, -0.004).applyQuaternion(this.model.object.quaternion).add(this.rootPos);
      tuck.y += this.p.height;
      if (act?.legRaiseTarget?.[s]) tuck.copy(act.legRaiseTarget[s]);
      target.lerp(tuck, clamp(raise, 0, 1));
    }
    if (this.p.sit > 0.01) {
      const sitPos = new THREE.Vector3(J.foot[0] * mm * f.sign, 0.004, 0.012).applyQuaternion(this.model.object.quaternion).add(this.rootPos);
      target.lerp(sitPos, this.p.sit);
    }
    const Lt = L_TIB * this.legScale;
    const Lm = L_TAR * this.legScale;
    const D = target.clone().sub(knee);
    let d = D.length();
    const dMax = (Lt + Lm) * 0.995;
    const dMin = Math.abs(Lt - Lm) + 0.004;
    if (d > dMax) {
      D.multiplyScalar(dMax / d);
      d = dMax;
    }
    if (d < dMin) {
      D.multiplyScalar(dMin / d);
      d = dMin;
    }
    const Dn = D.clone().normalize();
    // pole: backward in body space (the intertarsal joint points caudally), slightly outward
    const pole = (raise > 0.3 && act?.legRaiseTarget?.[s] ? new THREE.Vector3(f.sign, -0.25, -0.35) : new THREE.Vector3(0.12 * f.sign, 0.1, -1)).applyQuaternion(bodyQ);
    const bend = pole.sub(Dn.clone().multiplyScalar(pole.dot(Dn))).normalize();
    const cosA = clamp((Lt * Lt + d * d - Lm * Lm) / (2 * Lt * d), -1, 1);
    const a = Math.acos(cosA);
    const tibDir = Dn.clone().multiplyScalar(Math.cos(a)).addScaledVector(bend, Math.sin(a));
    const ankle = knee.clone().addScaledVector(tibDir, Lt);
    const tarDir = knee.clone().add(D).sub(ankle).normalize();

    // world rotations: map bind segment directions to the solved ones (bind world rotation = identity)
    const bindTib = BIND.ankle.clone().sub(BIND.knee).setX((J.ankle[0] - J.knee[0]) * mm * f.sign).normalize();
    const bindTar = BIND.foot.clone().sub(BIND.ankle).setX((J.foot[0] - J.ankle[0]) * mm * f.sign).normalize();
    const qTibW = new THREE.Quaternion().setFromUnitVectors(bindTib, tibDir);
    const qTarW = new THREE.Quaternion().setFromUnitVectors(bindTar, tarDir);
    const femurQ = femur.getWorldQuaternion(new THREE.Quaternion());
    tib.quaternion.copy(femurQ.clone().invert().multiply(qTibW));
    tar.quaternion.copy(qTibW.clone().invert().multiply(qTarW));
    if (this.legScale !== 1) {
      tar.position.multiplyScalar(this.legScale);
      foot.position.multiplyScalar(this.legScale);
    }
    // foot: flat on the ground along its yaw in stance; pitched and toes curled in swing
    const yaw = f.yaw;
    const swing = f.swing;
    const curl = Math.max(bump(swing, 0.0, 0.85), raise, this.p.sit * 0.7);
    // heel-off pitches the foot toes-down (angle keeps the toe tips on the ground)
    const heelPitch = Math.asin(clamp(heel / 0.014, 0, 0.9));
    const footPitch = -0.35 * bump(swing, 0, 0.35) + 0.25 * bump(swing, 0.55, 1.0) + raise * 0.9 + heelPitch;
    const qFootW = qAxis(Y, yaw, new THREE.Quaternion()).multiply(qAxis(X, footPitch, _q));
    foot.quaternion.copy(qTarW.clone().invert().multiply(qFootW));
    // toes: flex during swing (grasp-like curl), splay at touchdown, conform when planted
    for (const key of ['inner', 'mid', 'outer']) {
      const segs = key === 'mid' ? 3 : key === 'inner' ? 2 : 3;
      for (let i = 0; i < segs; i++) {
        const t = b[`toe_${key}${i}_${s}`];
        if (!t) continue;
        const c = curl * (0.35 + i * 0.25);
        t.quaternion.multiply(qAxis(X, c, _q));
        if (i === 0) {
          const splay = (key === 'inner' ? -1 : key === 'outer' ? 1 : 0) * f.sign * curl * -0.25;
          t.quaternion.multiply(qAxis(Y, splay, _q));
        }
      }
    }
  }

  _legsFlight(act) {
    // legs retracted backward under the belly/tail coverts (C)
    const b = this.b;
    const tuck = 1 - (act?.legsDown ?? 0);
    for (const s of ['L', 'R']) {
      // tuck: tibiotarsus pressed back along the belly, tarsus and toes trailing under the tail (C)
      b[`femur_${s}`].quaternion.multiply(qAxis(X, 0.05 * tuck - (1 - tuck) * 0.35, _q));
      b[`tibio_${s}`].quaternion.multiply(qAxis(X, 0.45 * tuck - (1 - tuck) * 0.1, _q));
      b[`tarso_${s}`].quaternion.multiply(qAxis(X, 1.05 * tuck - (1 - tuck) * 0.5, _q));
      b[`foot_${s}`].quaternion.multiply(qAxis(X, 0.35 * tuck, _q));
      for (const key of ['inner', 'mid', 'outer'])
        for (let i = 0; i < 3; i++) {
          const t = b[`toe_${key}${i}_${s}`];
          if (t) t.quaternion.multiply(qAxis(X, (0.3 + 0.2 * i) * tuck, _q));
        }
    }
    this._initFeet = true;
  }

  // ------------------------------------------------------------ wings
  _poseWings(dt, act) {
    const b = this.b;
    const F = this.flight;
    if (!F.freeze) F.amp = dt > 0 ? damp(F.amp ?? 0, F.active ? F.ampTarget ?? 1 : 0, 6, dt) : F.active ? F.ampTarget ?? 1 : 0;
    if (F.active && dt > 0 && !F.freeze) F.phase = (F.phase + dt * F.hz) % 1;
    const fold = clamp(this.p.fold, 0, 1);
    const w = act?.wing; // action wing override {L:{…}, R:{…}}
    for (const side of ['L', 'R']) {
      const ov = w?.[side] ?? w?.both;
      const spread = 1 - fold;
      // flapping cycle (left-wing convention)
      const ph = F.phase;
      const down = ph < ANIM.flight.downstrokeFraction;
      const u = down ? ph / ANIM.flight.downstrokeFraction : (ph - ANIM.flight.downstrokeFraction) / (1 - ANIM.flight.downstrokeFraction);
      const amp = F.amp * spread;
      const glide = F.glide ?? 0;
      // humerus elevation: +50° top → −42° bottom (downstroke), return during upstroke
      let elev = down ? lerp(0.87, -0.73, easeInOut(u)) : lerp(-0.73, 0.87, easeInOut(u));
      elev = lerp(0.08, elev, amp) * (1 - glide) + glide * 0.06;
      const flex = down ? 0 : Math.sin(u * Math.PI); // wrist/elbow flexion in upstroke
      const brake = F.brake ?? 0;
      let hSweep = -0.05 + flex * 0.35 * amp - brake * 0.25;
      let hTwist = (down ? 0.12 * Math.sin(u * Math.PI) : -0.25 * flex) * amp + brake * -0.45;
      let fSweep = -flex * 0.55 * amp;
      let wSweep = flex * 1.0 * amp + glide * 0.15;
      let wTwist = (down ? 0.25 * Math.sin(u * Math.PI) : -0.35 * flex) * amp;
      let wElev = (down ? -0.12 : 0.18 * flex) * amp;
      if (ov) {
        elev = ov.elev ?? elev;
        hSweep = ov.hSweep ?? hSweep;
        hTwist = ov.hTwist ?? hTwist;
        fSweep = ov.fSweep ?? fSweep;
        wSweep = ov.wSweep ?? wSweep;
        wTwist = ov.wTwist ?? wTwist;
        wElev = ov.wElev ?? wElev;
      }
      const effFold = ov?.fold ?? fold;
      this.foldLR[side === 'L' ? 0 : 1] = clamp(effFold, 0, 1);
      // blend flight/spread pose with the folded pose (wingFold.foldPath: hand first, then the humerus)
      const path = foldPath(effFold);
      const qH = wingQuat(hSweep, elev, hTwist);
      const qF = wingQuat(fSweep, 0, 0);
      const qW = wingQuat(wSweep, wElev, wTwist);
      qH.slerp(this.fold.arm.humerus, path.arm).premultiply(qAxis(Z, path.abduct, _q2));
      qF.slerp(this.fold.arm.forearm, path.hand);
      qW.slerp(this.fold.arm.hand, path.hand);
      const mir = side === 'R';
      const apply = (bone, q) => bone.quaternion.copy(bone.userData.bindLocalQuat).multiply(mir ? mirrorQuat(q, _q) : q);
      apply(b[`humerus_${side}`], qH);
      apply(b[`forearm_${side}`], qF);
      apply(b[`hand_${side}`], qW);
      // shoulder: droop slightly when sleeping (wings sag)
      // flight feathers: fan in when folded / during upstroke; stack neatly when folded
      // flight feathers: spread pose (fan in during the upstroke) blended with the per-feather fold
      const fanIn = flex * 0.45 * amp;
      const FF = this.fold.feather;
      // wing-root feathers re-aimed for the current humerus elevation / sweep / twist so the spread wing clears the body
      const SP = this.fold.spread;
      const root = (f, q) => (SP.has(f.name) ? q.premultiply(spreadAt(SP.get(f.name), elev, hSweep, hTwist, _q3)) : q);
      // folded feathers re-aimed while the wing is raised off the flank (below)
      const raise = ov?.raise ?? 0;
      const folded = (f) => (raise ? _q4.copy(FF.get(f.name)).premultiply(raiseAt(this.fold.raise.get(f.name), raise, _q3)) : FF.get(f.name));
      // spread → folded, each feather lifted on the way so it swings past the flank instead of through it
      const FD = this.fold.folding;
      const blend = (f, q) => {
        q.slerp(folded(f), path.hand);
        return effFold > 0 && effFold < 1 && FD.has(f.name) ? q.multiply(foldAt(FD.get(f.name), effFold, _q3)) : q;
      };
      for (let i = 1; i <= 10; i++) {
        const bone = b[`p${i}_${side}`];
        const f = bone.userData.spec.feather;
        apply(bone, blend(f, root(f, qAxis(Y, (15 * DEG - f.angle * DEG) * fanIn * 0.6, _q2))));
      }
      for (let j = 1; j <= 11; j++) {
        const bone = b[`s${j}_${side}`];
        const f = bone.userData.spec.feather;
        apply(bone, blend(f, root(f, qAxis(Y, flex * amp * -0.12, _q2))));
      }
      for (let k = 1; k <= 3; k++) {
        const bone = b[`t${k}_${side}`];
        const f = bone.userData.spec.feather;
        apply(bone, blend(f, root(f, _q2.identity())));
      }
      for (const bone of this._coverts[side]) {
        const f = bone.userData.spec.feather;
        apply(bone, blend(f, root(f, _q2.identity())));
        // coverts shortened where no turn keeps them clear: the shoulder-end marginal coverts where the spread
        // wing presses them against the neck / breast, the wrist's coverts where the folding hand passes it
        const sSpread = SP.has(f.name) ? lerp(spreadScaleAt(SP.get(f.name), elev, hSweep, hTwist), 1, effFold) : 1;
        const sFold = effFold > 0 && effFold < 1 && FD.has(f.name) ? foldScaleAt(FD.get(f.name), effFold) : 1;
        bone.scale.setScalar(sSpread * sFold);
      }
      // alula raised during braking/landing (slow flight)
      apply(b[`alula_${side}`], qAxis(Y, -brake * 0.4 * spread, _q2));
      // whole wing raised about the dorsal hinge (rotation of the shoulder about WING_HINGE)
      if (raise) {
        const sh = b[`shoulder_${side}`];
        const S = _v.fromArray(WING.shoulder);
        const off = _v2.copy(S).sub(WING_HINGE).applyAxisAngle(Z, raise).add(WING_HINGE).sub(S);
        sh.position.add(off.set(mir ? -off.x : off.x, off.y, off.z).multiplyScalar(mm));
        apply(sh, qAxis(Z, raise, _q2));
      }
    }
  }

  _poseTail(act) {
    const b = this.b;
    const spread = clamp(this.p.tailSpread + (act?.tailSpread ?? 0), 0, 1.2);
    const pitch = this.p.tailPitch + (act?.tailPitch ?? 0) + this.n2(this.time * 0.4) * 0.02;
    b.tail.quaternion.multiply(qAxis(X, -pitch, _q));
    for (let i = 1; i <= 6; i++) {
      for (const s of ['L', 'R']) {
        const bone = b[`r${i}_${s}`];
        const sign = s === 'L' ? 1 : -1;
        bone.quaternion.multiply(qAxis(Y, sign * spread * (i - 1) * 6.5 * DEG, _q));
      }
    }
  }

  // ------------------------------------------------------------ head & gaze
  _nextSaccade() {
    const iv = ANIM.saccadeInterval[this.gaze.mode === 'scan' || this.gaze.mode === 'ground' ? 'scan' : this.gaze.mode === 'fixate' ? 'alert' : 'idle'];
    return this.rng.range(iv[0], iv[1]) * this.timing;
  }

  _updateGaze(dt, act) {
    const g = this.gaze;
    g.timer -= dt;
    const amp = this.headAmp;
    if (g.timer <= 0) {
      g.timer = this._nextSaccade();
      // choose a new fixation (head direction relative to the body/root)
      switch (g.mode) {
        case 'scan':
        case 'ground': {
          // looking down at the substrate with one eye: head tilted (roll), yaw to the side
          const side = this.rng() < 0.5 ? -1 : 1;
          g.tYaw = side * this.rng.range(0.1, 0.55) * amp;
          g.tPitch = this.rng.range(0.55, 0.95);
          g.tRoll = -side * this.rng.range(0.15, 0.45);
          if (this.rng() < 0.3) {
            g.tYaw = this.rng.range(-0.15, 0.15);
            g.tRoll = 0;
            g.tPitch = this.rng.range(0.4, 0.7);
          }
          break;
        }
        case 'forward':
          g.tYaw = this.rng.range(-0.12, 0.12);
          g.tPitch = this.rng.range(0.0, 0.25);
          g.tRoll = 0;
          break;
        case 'fixate':
          g.tRoll = this.rng.range(-0.25, 0.25);
          break;
        default: {
          // idle: look around; occasional sky check with one eye (head roll)
          const r = this.rng();
          g.tYaw = this.rng.range(-0.9, 0.9) * amp;
          g.tPitch = this.rng.range(-0.1, 0.25);
          g.tRoll = this.rng.range(-0.12, 0.12);
          if (r < 0.12) {
            g.tRoll = (this.rng() < 0.5 ? -1 : 1) * this.rng.range(0.5, 0.85);
            g.tPitch = -0.25;
          }
        }
      }
    }
    if ((g.mode === 'fixate' || g.mode === 'ground') && g.point) {
      // turn the head toward the point (monocular fixation for distant threats: one eye toward it)
      const dir = _v.copy(g.point).sub(this.rootPos);
      const yawW = Math.atan2(dir.x, dir.z);
      let yaw = wrapAngle(yawW - this.heading);
      const dist = Math.hypot(dir.x, dir.z);
      if (g.mode === 'fixate' && dist > 3) {
        // lateral eyes: present one eye (head turned ±60–75° away from the target)
        const s = yaw >= 0 ? 1 : -1;
        yaw = wrapAngle(yaw - s * 1.15);
      }
      g.tYaw = clamp(yaw, -2.4, 2.4);
      g.tPitch = g.mode === 'ground' ? clamp(Math.atan2(0.08, dist) + 0.35, 0.3, 1.1) : -0.05;
    }
    // saccade dynamics: fast rotation, then hold (time constant ~ 25–35 ms)
    const rate = dt > 0 ? 1 / 0.03 : 1e3;
    g.yaw = damp(g.yaw, g.tYaw, rate, dt || 1);
    g.pitch = damp(g.pitch, g.tPitch, rate, dt || 1);
    g.roll = damp(g.roll, g.tRoll, rate * 0.7, dt || 1);
  }

  _poseNeckHead(dt, act) {
    const b = this.b;
    const obj = this.model.object;
    const rootQ = obj.quaternion;
    // 1) desired head orientation (world)
    let headQ;
    let tuckPos = null;
    if (!act?.headQ && this.posture === 'restTucked') {
      // bill tucked into the scapulars: head rotated ~160° and resting on the mantle (sleep posture)
      const side = this._tuckSide ?? (this._tuckSide = this.rng() < 0.5 ? 1 : -1);
      // head on the mantle, crown the bird's highest point, bill into the scapulars (p040; spec §12)
      const onBack = this.bodyPoint([side * 6, 92, 2]);
      const dir = this.bodyPoint([side * 11, 84, -14]).sub(onBack).normalize();
      headQ = this.billQuat(dir, side * 0.5);
      tuckPos = onBack.clone().sub(BILL_FROM_HEAD.clone().multiplyScalar(0.45).applyQuaternion(headQ));
    } else if (act?.headQ) headQ = act.headQ;
    else {
      const g = this.gaze;
      headQ = new THREE.Quaternion().copy(rootQ).multiply(qAxis(Y, g.yaw, _q)).multiply(qAxis(X, g.pitch + (act?.headPitchAdd ?? 0), _q)).multiply(qAxis(Z, g.roll, _q));
    }
    // 2) desired head pivot position (world). Default: relative to the ROOT (not the bobbing body) → head stabilisation.
    let headPos;
    if (tuckPos) headPos = tuckPos;
    else if (act?.billTarget) {
      headPos = act.billTarget.clone().sub(BILL_FROM_HEAD.clone().applyQuaternion(headQ));
    } else if (act?.headPos) headPos = act.headPos;
    else {
      const n = this.p.neck;
      // posture offsets (m, root space): alert = up & slightly forward, retracted = down & back
      // (neck −1: crown − back +15 → +10 mm, spec §12)
      const up = n > 0 ? n * 0.009 : n * 0.005;
      const fwd = n > 0 ? n * 0.003 : n * 0.002;
      const local = BIND.headPivot.clone().add(new THREE.Vector3(0, up + this.p.height - this.p.sit * 0.022, fwd));
      // body pitch carries the head forward/down with it (about the hip)
      const pitch = this.p.pitch + this.lean;
      const hip = new THREE.Vector3(0, BIND.hip.y + this.p.height, BIND.hip.z);
      local.sub(hip).applyAxisAngle(X, pitch * HEAD_PITCH_FOLLOW).add(hip);
      headPos = local.applyQuaternion(rootQ).add(this.rootPos);
      // stabilisation: residual body bob is NOT transferred to the head (ANIM.headStabilization)
      const bob = this.stride.amount * this._bob();
      headPos.y += bob * (1 - ANIM.headStabilization);
      // idle micro head motion (sub-mm drift), not looping
      headPos.x += this.n2(this.time * 0.7) * 0.0004 * this.headAmp;
      headPos.y += this.n3(this.time * 0.9) * 0.0003 * this.headAmp;
    }
    // 3) neck chain to the head pivot. The head rests on the plumage lying on the back / flanks, never
    //    inside it — checked on the solved chain too (far-back preening targets are beyond the neck's reach)
    headPos = this._clearHead(headPos.clone(), headQ);
    let stretch = this._solveNeck(headPos, headQ);
    const reached = b.head.getWorldPosition(new THREE.Vector3());
    if (act?.billTarget && reached.distanceTo(headPos) > 0.001) {
      // bill target beyond the neck's reach (preening far back): the bill points at it from where the head got
      const bill = BILL_FROM_HEAD.clone().applyQuaternion(headQ).normalize();
      headQ = new THREE.Quaternion().setFromUnitVectors(bill, act.billTarget.clone().sub(reached).normalize()).multiply(headQ);
      headPos = this._clearHead(reached, headQ);
      stretch = this._solveNeck(headPos, headQ);
    }
    for (let pass = 0; pass < 24; pass++) {
      const reached = b.head.getWorldPosition(new THREE.Vector3());
      const push = this._clearHead(reached.clone(), headQ).sub(reached).add(this._neckPush());
      if (push.lengthSq() < 1e-12) break;
      stretch = this._solveNeck(headPos.add(push), headQ); // accumulate: beyond reach only the aim turns
    }
    // jaw: opens briefly when swallowing / pulling prey
    b.jaw.quaternion.multiply(qAxis(X, act?.jaw ?? 0, _q));
    this.neckStretch = stretch;
  }

  /** Distribute the head rotation over the neck, then aim + stretch neck0 so the head pivot reaches headPos. */
  _solveNeck(headPos, headQ) {
    const b = this.b;
    const chestQ = b.chest.getWorldQuaternion(new THREE.Quaternion());
    const rel = chestQ.clone().invert().multiply(headQ);
    const w = [0.3, 0.3, 0.25];
    const I = new THREE.Quaternion();
    b.neck0.quaternion.copy(I.clone().slerp(rel, w[0]));
    b.neck1.quaternion.copy(I.clone().slerp(rel, w[1]));
    b.neck2.quaternion.copy(I.clone().slerp(rel, w[2]));
    let stretch = 1;
    for (let it = 0; it < 2; it++) {
      b.neck1.position.copy(b.neck1.userData.bindLocalPos).multiplyScalar(stretch);
      b.neck2.position.copy(b.neck2.userData.bindLocalPos).multiplyScalar(stretch);
      b.head.position.copy(b.head.userData.bindLocalPos).multiplyScalar(stretch);
      b.neck0.updateMatrixWorld(true);
      const n0 = b.neck0.getWorldPosition(new THREE.Vector3());
      const e = b.head.getWorldPosition(new THREE.Vector3());
      const cur = e.clone().sub(n0);
      const des = headPos.clone().sub(n0);
      const aim = new THREE.Quaternion().setFromUnitVectors(cur.clone().normalize(), des.clone().normalize());
      const n0w = b.neck0.getWorldQuaternion(new THREE.Quaternion());
      const parentQ = b.chest.getWorldQuaternion(new THREE.Quaternion());
      b.neck0.quaternion.copy(parentQ.invert().multiply(aim.multiply(n0w)));
      stretch = clamp((stretch * des.length()) / Math.max(1e-5, cur.length()), 0.62, 2.0);
    }
    b.neck1.position.copy(b.neck1.userData.bindLocalPos).multiplyScalar(stretch);
    b.neck2.position.copy(b.neck2.userData.bindLocalPos).multiplyScalar(stretch);
    b.head.position.copy(b.head.userData.bindLocalPos).multiplyScalar(stretch);
    b.neck0.updateMatrixWorld(true);
    const n2q = b.neck2.getWorldQuaternion(new THREE.Quaternion());
    b.head.quaternion.copy(n2q.invert().multiply(headQ));
    return stretch;
  }

  /** Head pivot push (world, m) that lifts the solved neck's worst NECK_PTS point back onto the plumage. */
  _neckPush() {
    const chest = this.b.chest;
    const inv = _m.copy(chest.matrixWorld).invert();
    const plumage = PLUMAGE + 1.2 * Math.max(0, this.p.fluff);
    const p = new THREE.Vector3();
    let worst = 0;
    const at = new THREE.Vector3();
    for (const s of NECK_PTS) {
      p.copy(s.local).multiplyScalar(mm).applyMatrix4(this.b[s.bone].matrixWorld).applyMatrix4(inv).add(BIND_CHEST).multiplyScalar(1000);
      const deficit = (sinkLimit(s.rest, plumage) - TORSO_SDF(p.x, p.y, p.z)) / s.t;
      if (deficit > worst) [worst, at.x, at.y, at.z] = [deficit, p.x, p.y, p.z];
    }
    if (worst <= 0.01) return p.set(0, 0, 0);
    const e = 0.2;
    const g = new THREE.Vector3(TORSO_SDF(at.x + e, at.y, at.z) - TORSO_SDF(at.x - e, at.y, at.z), TORSO_SDF(at.x, at.y + e, at.z) - TORSO_SDF(at.x, at.y - e, at.z), TORSO_SDF(at.x, at.y, at.z + e) - TORSO_SDF(at.x, at.y, at.z - e)).normalize();
    return g.applyQuaternion(chest.getWorldQuaternion(_q)).multiplyScalar(worst * mm);
  }

  /** Push the head pivot off the torso outline until the head clears the plumage (PLUMAGE mm, + fluffing). */
  _clearHead(headPos, headQ) {
    const chest = this.b.chest;
    chest.updateMatrixWorld(true);
    const inv = _m.copy(chest.matrixWorld).invert();
    const need = PLUMAGE + 1.2 * Math.max(0, this.p.fluff);
    const p = new THREE.Vector3();
    for (let it = 0; it < 3; it++) {
      let worst = 0;
      const at = new THREE.Vector3();
      for (const s of HEAD_PTS) {
        // world → chest-local → rest (mm)
        p.copy(s).multiplyScalar(mm).applyQuaternion(headQ).add(headPos).applyMatrix4(inv).add(BIND_CHEST).multiplyScalar(1000);
        const deficit = sinkLimit(s.rest, need) - TORSO_SDF(p.x, p.y, p.z);
        if (deficit > worst) [worst, at.x, at.y, at.z] = [deficit, p.x, p.y, p.z];
      }
      if (worst <= 0.01) break;
      const e = 0.2;
      const g = new THREE.Vector3(TORSO_SDF(at.x + e, at.y, at.z) - TORSO_SDF(at.x - e, at.y, at.z), TORSO_SDF(at.x, at.y + e, at.z) - TORSO_SDF(at.x, at.y - e, at.z), TORSO_SDF(at.x, at.y, at.z + e) - TORSO_SDF(at.x, at.y, at.z - e)).normalize();
      headPos.addScaledVector(g.applyQuaternion(chest.getWorldQuaternion(_q)), worst * mm);
    }
    return headPos;
  }

  // ------------------------------------------------------------ eyes
  _nextBlink() {
    return this.rng.range(ANIM.blinkInterval[0], ANIM.blinkInterval[1]) * this.timing;
  }
  _updateLids(dt, act) {
    const bl = this.blink;
    bl.next -= dt;
    if (bl.next <= 0 && bl.t === 0) bl.t = 1e-4;
    let nict = 0;
    if (bl.t > 0) {
      bl.t += dt / bl.dur;
      nict = Math.sin(Math.min(1, bl.t) * Math.PI);
      if (bl.t >= 1) {
        bl.t = 0;
        bl.next = this._nextBlink();
      }
    }
    // sleeping: lower lids rise, with periodic peeking (vigilance while resting)
    const peek = this.p.sleep > 0.3 && this.n1(this.time * 0.35) > 0.55 ? 0.6 : 0;
    const close = clamp(this.p.sleep * 1.05 - peek, 0, 1);
    this.model.setEyelids(close, close * (0.95 + 0.05 * this.n3(this.time)), nict, nict);
  }

  // ------------------------------------------------------------ actions
  _runAction(dt) {
    const a = this.action;
    if (!this._freezeAction) a.t += dt;
    const u = clamp(a.t / a.dur, 0, 1);
    const out = a.def.pose(u, a.params, this, a) || {};
    if (a.def.events) {
      for (const [name, at] of Object.entries(a.def.events)) {
        if (u >= at && !a.fired.has(name)) {
          a.fired.add(name);
          a.onEvent?.(name);
        }
      }
    }
    if (u >= 1 && !a.def.loop && !this._freezeAction) {
      const cb = a.onEvent;
      this.action = null;
      cb?.('done');
    }
    // actions can push posture targets
    if (out.posture) Object.assign(this.target, out.posture);
    return out;
  }

  /** World-space point on the bird's body from bird-local mm coordinates (for preening targets). */
  bodyPoint(mmXYZ) {
    const bone = this.b.chest;
    bone.updateMatrixWorld(true);
    const local = new THREE.Vector3(mmXYZ[0] * mm, mmXYZ[1] * mm, mmXYZ[2] * mm).sub(BIND_CHEST);
    return local.applyMatrix4(bone.matrixWorld);
  }

  /** Head orientation (world) that points the bill along `dir` with a roll. */
  billQuat(dir, roll = 0) {
    const d = dir.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(BILL_DIR, d);
    // keep head "up" as close to world up as possible, then apply roll about the bill
    const upNow = Y.clone().applyQuaternion(q);
    const upWant = Y.clone().sub(d.clone().multiplyScalar(d.y)).normalize();
    if (upWant.lengthSq() > 0.01) {
      const ang = Math.atan2(upNow.clone().cross(upWant).dot(d), upNow.dot(upWant));
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(d, ang));
    }
    if (roll) q.premultiply(new THREE.Quaternion().setFromAxisAngle(d, roll));
    return q;
  }

  rootToWorld(x, y, z) {
    return new THREE.Vector3(x, y, z).applyQuaternion(this.model.object.quaternion).add(this.rootPos);
  }
}

const BIND_CHEST = V(J.chest);
const BILL_DIR = BIND.billTip.clone().sub(V(BILL.base)).normalize();

// ---------------------------------------------------------------- action library
// Each action: duration (s) or fn, pose(u, params, anim, state) → overrides, optional events {name: u}.
// Overrides: billTarget (world), headQ (world), headPos, posture{…}, pitchAdd, wing{L,R,both}, legRaise{L,R},
//            legRaiseTarget, jaw, tailSpread, tailPitch, fast{…} (faster smoothing for keys)

function preenTarget(variant) {
  // bird-local mm points on the plumage + bill approach roll
  switch (variant) {
    case 'breast':
      return { p: [3, 66, 30], roll: 0.2 };
    case 'belly':
      return { p: [6, 52, 19], roll: 0.3 };
    case 'flank':
      return { p: [15, 58, 0], roll: 0.9, wingLift: 0.5 };
    case 'scapulars':
      return { p: [9, 87, -6], roll: 1.4 };
    case 'wing':
      return { p: [16, 66, -28], roll: 1.3, wingLift: 0.2 };
    case 'tail':
      return { p: [0, 67, -52], roll: 0.4 };
    default:
      return { p: [3, 66, 30], roll: 0.2 };
  }
}

export const PREEN_VARIANTS = ['breast', 'belly', 'flank', 'scapulars', 'wing', 'tail'];

export const ACTIONS = {
  // 06 Peck — aim (neck retracts), strike (fast), handle prey (type specific), recover.
  peck: {
    duration: (p) => ({ polychaete: 1.9, crab: 1.35, amphipod: 0.6, insect: 0.6 })[p.preyType] ?? 0.7,
    events: { strike: 0.28, catch: 0.34 },
    pose(u, p, A) {
      const target = p.target;
      const root = A.rootPos;
      const toT = target.clone().sub(root);
      const dist = Math.hypot(toT.x, toT.z);
      const yawW = Math.atan2(toT.x, toT.z);
      // plovers pick by tipping the whole body forward over the legs (up to +0.56 from the relaxed stand, body
      // axis ≈ −22°) and stretching the neck 15–20 mm (p007, p061; spec §7, §12); tilt builds up through aim → strike
      const maxPitch = 0.56 + clamp(0.055 - dist, -0.04, 0.04) * 4;
      const aimK = smoothstep(0, 0.22, u);
      const strikeK = smoothstep(0.2, 0.3, u);
      const recK = smoothstep(0.6, 1.0, u);
      const tilt = maxPitch * (0.55 * aimK + 0.45 * strikeK) * (1 - 0.85 * recK);
      const out = { posture: { pitch: tilt, height: -0.009 * (0.5 * aimK + 0.5 * strikeK) * (1 - recK), neck: -0.2 }, fast: { pitch: 18, height: 14 } };
      const dir = new THREE.Vector3(Math.sin(yawW) * 0.25, -1, Math.cos(yawW) * 0.25);
      const aimU = 0.22;
      const strikeU = 0.3;
      const type = p.preyType ?? 'amphipod';
      const recoverStart = type === 'polychaete' ? 0.78 : type === 'crab' ? 0.72 : 0.55;
      let billT;
      const above = target.clone().add(new THREE.Vector3(0, 0.022, 0));
      const deep = target.clone().add(new THREE.Vector3(0, type === 'polychaete' ? -0.006 : -0.0015, 0));
      if (u < aimU) {
        // head lowered toward the prey with a short fixation
        billT = above.clone().lerp(target.clone().add(new THREE.Vector3(0, 0.012, 0)), easeInOut(u / aimU));
      } else if (u < strikeU) {
        billT = target.clone().add(new THREE.Vector3(0, 0.012, 0)).lerp(deep, easeInOut((u - aimU) / (strikeU - aimU)));
      } else if (u < recoverStart) {
        const k = (u - strikeU) / (recoverStart - strikeU);
        billT = deep.clone();
        if (type === 'polychaete') {
          // pull the worm out: 2 backward tugs
          billT.y += 0.004 + 0.006 * Math.abs(Math.sin(k * Math.PI * 2));
          billT.addScaledVector(new THREE.Vector3(Math.sin(yawW), 0, Math.cos(yawW)), -0.006 * k);
          out.jaw = 0.06;
        } else if (type === 'crab') {
          // shake/beat the crab
          billT.y += 0.008;
          billT.x += Math.sin(k * Math.PI * 6) * 0.004;
          out.jaw = 0.05;
        } else billT.y += 0.004 * k;
      } else {
        const k = easeInOut((u - recoverStart) / (1 - recoverStart));
        billT = deep.clone().add(new THREE.Vector3(0, 0.01, 0)).lerp(A.rootToWorld(0, 0.085, 0.052), k);
        out.jaw = u < recoverStart + 0.15 ? 0.1 : 0; // swallow
      }
      out.billTarget = billT;
      const roll = type === 'crab' && u > strikeU && u < recoverStart ? Math.sin(u * 40) * 0.3 : 0;
      out.headQ = A.billQuat(dir.lerp(new THREE.Vector3(Math.sin(yawW), -0.25, Math.cos(yawW)), u > recoverStart ? easeInOut((u - recoverStart) / (1 - recoverStart)) : 0), roll);
      if (u > recoverStart) out.billTarget = null;
      if (u > recoverStart) out.headQ = null;
      return out;
    },
  },

  // 07 Preen — variants: breast, belly, flank, scapulars, wing, tail (nibbling motion at the target)
  preen: {
    duration: () => 2.8,
    pose(u, p, A, st) {
      const v = p.variant ?? 'breast';
      const tg = preenTarget(v);
      const side = p.side ?? (st.side ??= A.rng() < 0.5 ? 1 : -1);
      const pt = [tg.p[0] * side, tg.p[1], tg.p[2]];
      const onBody = A.bodyPoint(pt);
      const approach = bump(u, 0.0, 1.0) > 0 ? smoothstep(0, 0.2, u) * (1 - smoothstep(0.85, 1, u)) : 0;
      // nibble: small rapid movements along the feathers (3–4 Hz)
      const nib = Math.sin(u * 2.8 * Math.PI * 2 * 3.5) * 0.0025;
      const center = A.bodyPoint([pt[0] * 0.2, pt[1] + 16, pt[2] + 20]);
      const bill = center.clone().lerp(onBody, approach);
      bill.y += nib * approach;
      const dir = onBody.clone().sub(A.bodyPoint([pt[0] * -0.3, 96, pt[2] + 14])).normalize();
      const out = {
        billTarget: approach > 0.02 ? bill : null,
        headQ: approach > 0.02 ? A.billQuat(dir, tg.roll * side) : null,
        posture: { fluff: 0.7, neck: -0.2 },
      };
      if (tg.wingLift) {
        // the folded wing is lifted off the flank (unfolding it would swing the feathers through the body)
        const s = side > 0 ? 'L' : 'R';
        out.wing = { [s]: { raise: tg.wingLift * 0.6 * approach } };
      }
      if (v === 'tail') out.tailSpread = 0.3 * approach;
      return out;
    },
  },

  // Indirect head scratch: leg raised over the lowered wing (S33)
  scratch: {
    duration: 1.6,
    pose(u, p, A, st) {
      const side = (st.side ??= A.rng() < 0.5 ? 'L' : 'R');
      const sg = side === 'L' ? 1 : -1;
      const k = smoothstep(0, 0.2, u) * (1 - smoothstep(0.8, 1, u));
      const scr = Math.sin(u * Math.PI * 2 * 9) * 0.002;
      const out = {
        legRaise: { [side]: k },
        legRaiseTarget: { [side]: A.bodyPoint([sg * 12, 87 + scr * 1000, 14]) },
        wing: { [side]: { raise: 0.1 * k } }, // folded wing held slightly off the flank
        posture: { roll: -sg * 0.12 * k, pitch: 0.12 * k, neck: -0.3 },
      };
      out.headQ = new THREE.Quaternion().copy(A.model.object.quaternion).multiply(qAxis(Z, -sg * 0.5 * k, new THREE.Quaternion())).multiply(qAxis(X, 0.35 * k, new THREE.Quaternion()));
      return out;
    },
  },

  // Both-wings stretch over the back (S33)
  wingStretch: {
    duration: 1.8,
    pose(u) {
      const k = smoothstep(0, 0.3, u) * (1 - smoothstep(0.7, 1, u));
      return { wing: { both: { fold: 1 - k, elev: 1.25 * k, hSweep: 0.3, fSweep: -0.3 * k, wSweep: 0.6 * k, wTwist: 0 } }, posture: { pitch: 0.18 * k, neck: -0.3 } };
    },
  },

  // Body shake: feathers fluffed, rapid rotation about the body axis
  shake: {
    duration: 0.7,
    pose(u) {
      const k = bump(u, 0, 1);
      return { posture: { fluff: 1.2 * k, roll: Math.sin(u * Math.PI * 2 * 7) * 0.25 * k }, fast: { roll: 60, fluff: 30 } };
    },
  },

  // Foot-trembling on wet mud (S21, S22)
  footTremble: {
    duration: 1.0,
    pose(u, p, A, st) {
      const side = (st.side ??= A.rng() < 0.5 ? 'L' : 'R');
      const k = smoothstep(0, 0.1, u) * (1 - smoothstep(0.9, 1, u));
      const tr = 0.15 + 0.1 * Math.sin(u * Math.PI * 2 * 10);
      return { legRaise: { [side]: tr * k }, legRaiseTarget: { [side]: A.rootToWorld((side === 'L' ? 1 : -1) * 0.01, 0.006, 0.02) }, posture: { pitch: 0.3, neck: 0.2 } };
    },
  },

  // 10 Takeoff: crouch → leg thrust (≈90% of vertical take-off velocity, S23) → wings up → first downstroke
  takeoff: {
    duration: 0.5,
    events: { push: 0.24, airborne: 0.36 },
    pose(u, p, A) {
      const crouch = smoothstep(0, 0.24, u) * (1 - smoothstep(0.24, 0.36, u));
      // (lift-off: body levelled from the tail-down stand, +0.07 = 0.17 level − 0.1 nose up)
      const out = { posture: { height: -0.012 * crouch + 0.01 * smoothstep(0.24, 0.4, u), pitch: 0.25 * crouch + 0.07 * smoothstep(0.3, 0.5, u), neck: -0.5, fluff: -0.3 }, fast: { height: 30, pitch: 20 }, legsGround: u < 0.36 };
      out.wing = { both: { fold: 1 - smoothstep(0.1, 0.3, u), elev: lerp(0, 1.0, smoothstep(0.15, 0.32, u)) } };
      if (u > 0.34) out.wing = null;
      return out;
    },
  },

  // 12 Landing: brake → legs forward → touch down (absorb) → wings raised briefly → fold
  landing: {
    duration: 0.9,
    events: { touchdown: 0.2 },
    pose(u) {
      const absorb = bump(u, 0.18, 0.5);
      // braking in the air: tail down like the stand (pitch 0), then absorb forward
      const out = { posture: { height: -0.008 * absorb, pitch: 0.2 * absorb }, fast: { height: 25 }, legsGround: u > 0.18, legsDown: 1 };
      // wings: spread & raised after touchdown, then folded (C: characteristic plover "wing-lift")
      const up = smoothstep(0.2, 0.45, u) * (1 - smoothstep(0.55, 0.9, u));
      out.wing = { both: { fold: smoothstep(0.35, 0.95, u), elev: 0.9 * up, hSweep: 0.2, wSweep: 0.4 } };
      out.tailSpread = 0.8 * (1 - smoothstep(0.3, 0.7, u));
      return out;
    },
  },

  // Aggressive chase lunge (short run with hunched posture) — posture only; locomotion by AI
  threat: {
    duration: 0.8,
    pose(u) {
      const k = bump(u, 0, 1);
      return { posture: { pitch: 0.5 * k, neck: -0.4, fluff: 0.5 * k, height: -0.004 * k }, tailSpread: 0.4 * k, tailPitch: 0.15 * k };
    },
  },
};
