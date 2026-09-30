// Procedural bone animation for ヒメハゼ.
// Consumes a MotorCommand each frame (from HimehazeBehavior or user code) and poses the skeleton.
//
// MotorCommand {
//   gait: 'rest'|'idle'|'crawl'|'swim'|'burst'|'hover'   – selects wave parameters
//   thrust: 0..1           – how hard the current gait is driven (scales amplitude/frequency)
//   turn: rad/s            – desired yaw rate (bends body toward turn)
//   cstart: ±1 | 0         – one-shot C-start trigger (sign = escape side)
//   finErect: 0..1         – dorsal/anal fin erection (display/alert=1, fast swim≈0)
//   pectoral: 'rest'|'flutter'|'stroke'|'tuck'|'brace'
//   gaze: THREE.Vector3|null  world point to look at
//   strike: bool           – one-shot suction strike
//   dig: bool              – nest excavation / burying body wriggle
// }
import * as THREE from 'three';
import { AXIAL } from './model/HimehazeGeometry.js';

// Wave parameters per gait. amp = lateral bend (rad per joint) at the tail tip; head gets headFrac of it.
// f in Hz, k = body wavelengths per body length (≈ 1 for anguilliform-to-subcarangiform gobies; R).
// Values are R/G: gobiid kinematics measured on related sand gobies (Pomatoschistus) and generic
// small-fish C-start literature; not measured on F. gymnauchen.
export const GAITS = {
  rest:  { f: 0.25, amp: 0.012, k: 0.9, headFrac: 0.0 },
  idle:  { f: 0.45, amp: 0.02, k: 0.9, headFrac: 0.05 },
  hover: { f: 2.2, amp: 0.07, k: 0.95, headFrac: 0.06 },
  crawl: { f: 4.0, amp: 0.13, k: 1.0, headFrac: 0.08 },
  swim:  { f: 7.0, amp: 0.2, k: 1.05, headFrac: 0.08 },
  burst: { f: 15.0, amp: 0.28, k: 1.1, headFrac: 0.1 },
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const damp = (cur, tgt, lambda, dt) => THREE.MathUtils.lerp(cur, tgt, 1 - Math.exp(-lambda * dt));
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v1 = new THREE.Vector3(), m1 = new THREE.Matrix4();

export class HimehazeAnimator {
  constructor(fish) {
    this.fish = fish;
    this.b = fish.bones;
    const s0 = AXIAL[0][1], s1 = AXIAL[AXIAL.length - 1][1];
    this.axial = AXIAL.map(([n, s]) => ({ name: n, s, u: (s - s0) / (s1 - s0) }));
    this.cur = { ...GAITS.idle };
    this.phase = 0;
    this.time = 0;
    this.turnBend = 0;
    this.finErect = 0.6;
    this.pecSpread = 0.6;
    this.pecPhase = 0;
    this.breathPhase = 0;
    this.breathRate = 1.4;   // Hz
    this.cstart = null;
    this.strikeT = -1;
    this.digT = 0;
    this.mouth = 0;
    const rng = mulberry(fish.variation.seed + 991);
    this.rng = rng;
    this.noiseSeed = rng() * 100;
    // gaze system: eyes → head → body with increasing latency
    this.eye = [
      { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, hold: 0, bone: this.b.Eye_L, side: -1 },
      { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, hold: 0, bone: this.b.Eye_R, side: 1 },
    ];
    this.headYaw = 0; this.headPitch = 0;
    this.headDemand = 0;   // exposed to behaviour: how much body yaw is needed to centre the target
    this.gazeError = 0;
  }

  // one-shot helpers used by behaviour
  triggerCStart(sign) { this.cstart = { t: 0, sign: Math.sign(sign) || 1 }; }
  triggerStrike() { this.strikeT = 0; }

  update(dt, cmd) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const g = GAITS[cmd.gait] || GAITS.idle;
    const thrust = cmd.thrust ?? 1;
    const lam = cmd.gait === 'burst' ? 30 : 6;
    this.cur.f = damp(this.cur.f, g.f * (0.6 + 0.4 * thrust), lam, dt);
    this.cur.amp = damp(this.cur.amp, g.amp * (0.35 + 0.65 * thrust), lam, dt);
    this.cur.k = damp(this.cur.k, g.k, lam, dt);
    this.cur.headFrac = damp(this.cur.headFrac, g.headFrac, lam, dt);
    this.phase += this.cur.f * Math.PI * 2 * dt;
    this.turnBend = damp(this.turnBend, clamp((cmd.turn || 0) * 0.05, -0.12, 0.12), 8, dt);
    if (cmd.cstart && !this.cstart) this.triggerCStart(cmd.cstart);
    if (cmd.strike && this.strikeT < 0) this.triggerStrike();

    this._poseAxial(dt, cmd);
    this._poseFins(dt, cmd);
    this._breathe(dt, cmd);
    this._gaze(dt, cmd);
  }

  _poseAxial(dt, cmd) {
    const { amp, k, headFrac } = this.cur;
    let cBend = 0;
    if (this.cstart) {
      // Stage 1 (~25 ms for a 7 cm fish): body curls into a C away from threat.
      // Stage 2 (~30 ms): tail sweeps back in the opposite direction – main propulsive stroke. (R: Domenici & Blake 1997)
      const c = this.cstart; c.t += dt;
      const T1 = 0.028, T2 = 0.06;
      if (c.t < T1) cBend = c.sign * 0.32 * Math.sin((c.t / T1) * Math.PI / 2);
      else if (c.t < T1 + T2) cBend = c.sign * 0.32 * Math.cos(((c.t - T1) / T2) * Math.PI) ;
      else this.cstart = null;
    }
    this.digT = cmd.dig ? this.digT + dt : 0;
    const digAmp = cmd.dig ? 0.12 : 0;
    for (let i = 0; i < this.axial.length; i++) {
      const a = this.axial[i];
      const u = a.u;
      // amplitude envelope: small at head, grows quadratically toward the tail
      const env = headFrac + (1 - headFrac) * (0.15 * u + 0.85 * u * u);
      let yaw = amp * env * Math.sin(this.phase - k * Math.PI * 2 * u);
      yaw += this.turnBend * (1 - 0.5 * u);
      yaw += cBend * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.1)));
      if (digAmp) yaw += digAmp * env * Math.sin(this.digT * 30 - 4 * u);
      // heads counter-rotate slightly relative to swimming wave (recoil minimisation)
      const bone = this.b[a.name];
      const sign = a.name === 'Head' ? -1 : 1;   // Head sits anterior to its parent: flip for correct curvature
      q1.setFromAxisAngle(Y, sign * yaw);
      // subtle dorsoventral undulation while resting on substrate (body settling)
      const pitch = a.name === 'Head' ? this.headPitch : 0;
      q2.setFromAxisAngle(Z, pitch);
      bone.quaternion.copy(this.fish.restQuat[a.name]).multiply(q1).multiply(q2);
      if (a.name === 'Head') bone.quaternion.multiply(q2.setFromAxisAngle(Y, this.headYaw));
    }
  }

  _poseFins(dt, cmd) {
    const b = this.b, t = this.time;
    // D1/D2/A erection. Fins fold at high speed (drag reduction), erect when alert/displaying.
    const targetErect = cmd.finErect ?? (cmd.gait === 'burst' ? 0.05 : cmd.gait === 'swim' ? 0.35 : 0.6);
    this.finErect = damp(this.finErect, targetErect, cmd.gait === 'burst' ? 25 : 5, dt);
    const e = this.finErect;
    const fold = (bone, amt, lean) => {
      bone.scale.set(1, 0.25 + 0.75 * amt, 1);
      bone.quaternion.copy(this.fish.restQuat[bone.name]).multiply(q1.setFromAxisAngle(Z, (1 - amt) * lean));
    };
    fold(b.DorsalFin1, e, 0.5);
    fold(b.DorsalFin2, 0.3 + 0.7 * e, 0.25);
    fold(b.AnalFin, 0.35 + 0.65 * e, -0.25);

    // pectorals: independent L/R. Modes: flutter at rest (P: pectorals are rarely still), stroke while
    // crawling, tucked against body in fast swim, braced/spread when perched and alert.
    const mode = cmd.pectoral || 'flutter';
    const spreadTarget = { rest: 0.55, flutter: 0.7, stroke: 0.8, tuck: 0.0, brace: 1.0 }[mode] ?? 0.6;
    this.pecSpread = damp(this.pecSpread, spreadTarget, mode === 'tuck' ? 20 : 6, dt);
    const pf = mode === 'stroke' ? 4.5 : mode === 'flutter' ? 2.2 : mode === 'rest' ? 0.9 : 0.0;
    this.pecPhase += pf * Math.PI * 2 * dt;
    for (const side of [-1, 1]) {
      const bone = side > 0 ? b.Pectoral_R : b.Pectoral_L;
      const n = this._noise(t * 0.7 + side * 3.1);
      const osc = mode === 'stroke' ? Math.sin(this.pecPhase) * 0.45
        : Math.sin(this.pecPhase + (side > 0 ? 0 : 1.9)) * (mode === 'flutter' ? 0.12 : 0.05) * (1 + 0.5 * n);
      // abduction (rotate about vertical axis away from body) + feathering (about ray axis ≈ X)
      const abd = (0.1 + 0.55 * this.pecSpread + osc * 0.6);
      bone.quaternion.copy(this.fish.restQuat[bone.name])
        .multiply(q1.setFromAxisAngle(Y, side * -abd + (1 - this.pecSpread) * side * 0.35))
        .multiply(q2.setFromAxisAngle(X, side * osc * 0.5));
      bone.scale.set(1, 0.6 + 0.4 * this.pecSpread, 1);   // fan folds (rays converge) when tucked
    }
    // pelvic disc: slight flexing when braced on substrate
    b.Pelvic.quaternion.copy(this.fish.restQuat.Pelvic).multiply(q1.setFromAxisAngle(Z, -0.05 * this.pecSpread + 0.02 * this._noise(t)));
    // caudal fan spread: open in burst/turns, partly closed at rest
    const spread = cmd.gait === 'burst' || cmd.gait === 'swim' ? 1.05 : cmd.gait === 'rest' ? 0.85 : 0.95;
    b.Caudal.scale.y = damp(b.Caudal.scale.y, spread, 6, dt);
  }

  _breathe(dt, cmd) {
    // Buccal-opercular pump. Rate varies with activity & slow noise (never perfectly periodic).
    const act = { rest: 0.8, idle: 1.0, hover: 1.3, crawl: 1.4, swim: 1.8, burst: 2.2 }[cmd.gait] ?? 1;
    const target = 1.2 * act * (1 + 0.12 * this._noise(this.time * 0.13));   // ~70-160 /min (R/G)
    this.breathRate = damp(this.breathRate, target, 1.5, dt);
    this.breathPhase += this.breathRate * Math.PI * 2 * dt;
    const amp = 0.8 + 0.25 * this._noise(this.time * 0.37 + 5);
    const buccal = Math.max(0, Math.sin(this.breathPhase));                 // mouth/floor expands first
    const opercle = Math.max(0, Math.sin(this.breathPhase - 1.3));         // opercula open ~quarter-cycle later
    let jaw = 0.035 * buccal * amp;
    // strike: fast gape (~15 ms) + opercular flare for suction, then close (R: suction feeding kinematics)
    if (this.strikeT >= 0) {
      this.strikeT += dt;
      const s = this.strikeT;
      const g = s < 0.02 ? s / 0.02 : s < 0.06 ? 1 : Math.max(0, 1 - (s - 0.06) / 0.08);
      jaw = Math.max(jaw, 0.42 * g);
      this._strikeFlare = g;
      if (s > 0.2) { this.strikeT = -1; this._strikeFlare = 0; }
    }
    this.mouth = jaw;
    const b = this.b;
    b.Jaw.quaternion.copy(this.fish.restQuat.Jaw).multiply(q1.setFromAxisAngle(Z, -jaw));
    const flare = 0.06 * opercle * amp + 0.25 * (this._strikeFlare || 0);
    for (const [bone, side] of [[b.Opercle_L, -1], [b.Opercle_R, 1]]) {
      bone.quaternion.copy(this.fish.restQuat[bone.name]).multiply(q1.setFromAxisAngle(Y, side * -flare));
      bone.scale.set(1, 1, 1 + flare * 0.6);
    }
  }

  // Gaze: independent saccadic eyes; head follows after a delay if the target exceeds eye range;
  // residual error is exported as headDemand so the behaviour layer turns the body last.
  _gaze(dt, cmd) {
    const fish = this.fish;
    const headBone = this.b.Head;
    const EYE_RANGE = 0.45, HEAD_RANGE = 0.22;
    let tgtLocal = null;
    if (cmd.gaze) {
      headBone.updateWorldMatrix(true, false);
      m1.copy(headBone.matrixWorld).invert();
      tgtLocal = v1.copy(cmd.gaze).applyMatrix4(m1);
    }
    let meanYaw = 0;
    for (const e of this.eye) {
      e.hold -= dt;
      if (tgtLocal) {
        const rel = tgtLocal.clone().sub(e.bone.position);
        e.tYaw = clamp(Math.atan2(-rel.z, rel.x) - 0, -EYE_RANGE - 0.4, EYE_RANGE + 0.4);
        e.tPitch = clamp(Math.atan2(rel.y, Math.hypot(rel.x, rel.z)), -0.3, 0.35);
      } else if (e.hold <= 0) {
        // spontaneous independent scanning saccades (gobies move eyes independently; R)
        e.tYaw = (this.rng() * 2 - 1) * 0.35 + e.side * -0.1;
        e.tPitch = (this.rng() * 2 - 1) * 0.15;
        e.hold = 0.4 + this.rng() * 1.6;
      }
      // saccade: very fast (τ≈25 ms) then fixation with microtremor
      e.yaw = damp(e.yaw, clamp(e.tYaw - this.headYaw, -EYE_RANGE, EYE_RANGE), 40, dt);
      e.pitch = damp(e.pitch, e.tPitch, 40, dt);
      const trem = 0.004 * this._noise(this.time * 7 + e.side);
      e.bone.quaternion.copy(fish.restQuat[e.bone.name])
        .multiply(q1.setFromAxisAngle(Y, e.yaw + trem))
        .multiply(q2.setFromAxisAngle(Z, e.pitch));
      meanYaw += e.tYaw / 2;
    }
    // head follows with ~150 ms latency, only when the eyes approach their limit
    const need = tgtLocal ? meanYaw : 0;
    const headTarget = Math.abs(need) > EYE_RANGE * 0.6 ? clamp(need, -HEAD_RANGE, HEAD_RANGE) : this.headYaw * 0.98;
    this.headYaw = damp(this.headYaw, tgtLocal ? headTarget : 0, 6, dt);
    const pitchT = tgtLocal ? clamp(Math.atan2(tgtLocal.y, Math.hypot(tgtLocal.x, tgtLocal.z)) * 0.3, -0.08, 0.1) : 0;
    this.headPitch = damp(this.headPitch, pitchT, 4, dt);
    this.headDemand = tgtLocal ? need - this.headYaw : 0;
    this.gazeError = tgtLocal ? Math.abs(need) : 0;
  }

  _noise(x) {
    const s = this.noiseSeed;
    return (Math.sin(x * 1.3 + s) * 0.5 + Math.sin(x * 2.9 + s * 1.7) * 0.3 + Math.sin(x * 5.3 + s * 0.3) * 0.2);
  }
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
