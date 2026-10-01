// Procedural goldfish locomotion — motor layer between the behaviour AI and
// the rig. Every number below is anchored to the literature summarised in
// docs/RESEARCH_REPORT.md §4 (kinematics):
//
//  * Body wave  h(s,t) = A·env(s)·sin(2πs/λ − φ(t)),  λ ≈ 0.95 L,
//    env from the Videler–Hess carangiform fit a(ξ)/L = 0.02 − 0.0825ξ + 0.1625ξ²
//    (minimum ≈ 0.25 L, head recoil ≈ 20 % of tail amplitude).
//  * Tail-beat frequency from Bainbridge (1958): U = (L/4)(3f − 4)
//    ⇒ f = (4/3)(U/L + 1); tail amplitude grows with f and saturates at
//    ≈ ±0.1 L above 5 Hz.
//  * Routine turns: head leads, a curvature pulse travels caudally (Howe et
//    al. 2020). Implemented by letting every body segment follow the heading
//    the head had (Δs·L)/U seconds earlier.
//  * C-start (Eaton 1977/1988; Domenici & Blake 1997): ~8 ms latency, stage 1
//    ≈ 20–25 ms C-bend with head angular velocity ≈ 3000–4500 °/s, stage 2
//    return stroke, peak ≈ 15 BL/s, then burst swimming.
//  * Gaits follow displacement, so every bit of travel has visible
//    propulsion: below ~0.35 BL/s the fish rows with its pectorals
//    (labriform swimming, alternating strokes) and the caudal fin, held still
//    and straight, gives an occasional single assisting beat; up to ~0.55
//    BL/s it swims intermittently (Videler & Weihs 1982; Wu et al. 2007 for
//    goldfish): bouts of 6–8 tail beats, then a glide of ~1 s with a straight
//    body during which the fish visibly slows down (passive deceleration,
//    time constant ≈ 1 s) until it kicks again; faster swimming is a steady
//    Bainbridge tail beat, interrupted only by glides while slowing down.
//    Gaits change only after a minimum dwell, so the fish does not flit
//    between them.
//  * Pectoral fins row during slow swimming, are used in short bouts while
//    hovering (station holding, pivot turns, braking, fine positioning),
//    are otherwise held still, slightly spread while hovering, and adducted
//    against the body when the caudal fin drives the fish.
//  * Bottom rest: the fish settles just above the gravel with the dorsal fin
//    partly lowered, fins folded, slower ventilation and few corrections.
//  * Buccal–opercular ventilation (mouth leads operculum), ~70–110 min⁻¹.
//  * Horizontal saccades 2–25° with independent eyes (Easter 1971; Mensh 2004).

import * as THREE from 'three';
import { NS } from './RigLayout.js';
import { TAU, clamp, lerp, damp, wrapAngle, smoothstep, jitterDuration } from '../core/math.js';
import { fbm1 } from '../core/random.js';
import { TANK } from '../world/TankConfig.js';

const HIST = 256;
const S_ANCHOR = 0.36; // centre of mass along the body (fraction of SL)
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export function forwardFromYawPitch(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  return out.set(cp * Math.cos(yaw), Math.sin(pitch), -cp * Math.sin(yaw));
}

export class Locomotion {
  constructor(fish) {
    this.fish = fish;
    const r = fish.rng;
    const P = fish.personality;
    this.SL = fish.SL;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.speed = 0; // m/s along the body axis
    this.quat = new THREE.Quaternion();
    // Motion smoothness: every channel the eye follows is at least C1 (no
    // steps in velocity) and its acceleration is low-pass filtered, so starts,
    // stops, kicks and turns ease in and out instead of popping. Only the
    // C-start escape is allowed to be abrupt.
    this.accel = 0; // m/s² along the body axis (thrust builds up, it never jumps)
    this.yawAcc = 0; // rad/s²
    this.desSpeed = 0; // BL/s, eased speed command
    this.tYaw = null; // eased heading command (rad)
    this.contactVel = new THREE.Vector3(); // m/s, soft separation from bumps (see Steering)
    this.contactBrake = 0; // 1/s, speed loss from contacts, applied gradually

    // tail wave
    this.phase = r.range(0, TAU);
    this.freq = 0;
    this.amp = 0; // tail-tip amplitude, SL units
    this.waveLen = 0.95 * r.range(0.95, 1.05);
    this.gait = 'hover';
    this.coast = false;
    // tail-beat bout: n cycles (0 = tail held still), u = cycles done,
    // f = beat frequency (Hz), A = peak amplitude (SL)
    this.bout = { n: 0, u: 0, f: 2, A: 0 };
    this.glideTime = 0; // time since the last bout ended
    this.glideLow = 0.8; // the next bout starts when U < glideLow * target
    this.glideMax = 1; // ... or after this long gliding (s)
    this.boutTarget = 0; // speed (BL/s) the current bout drives toward
    this.decelGlide = false; // steady swimmer coasting down to a lower speed
    this.steadyMode = false;
    this.assistTimer = r.range(0.5, 2.5); // next assisting caudal beat while rowing
    this.rowDrive = 0; // 0..1 pectoral rowing (slow labriform swimming)
    this.groundContact = 0; // > 0: the body touched the gravel this frame (m pushed up)
    this.flickTimer = r.range(4, 20); // rare corrective tail flick while hovering
    this.brakeLevel = 0;
    this.exertion = 0; // accumulates with fast swimming -> faster breathing
    this.hoverVel = new THREE.Vector3(); // pectoral translation while hovering (m/s)
    this.restLevel = 0; // 0..1 bottom-rest posture
    this.driftAcc = 0; // uncorrected drift since the last pectoral bout (SL)

    // individual motor signature
    this.sig = {
      freqMul: r.range(0.92, 1.08),
      ampMul: r.range(0.9, 1.1),
      turnAgility: r.range(0.85, 1.2) * (0.8 + 0.4 * (P.activity ?? 1) * 0.5),
      // swimming style: some individuals kick long and glide far, others
      // swim in short, frequent bouts
      burstCoastBias: lerp(0.3, 0.85, 0.65 * (P.burstCoast ?? 0.5) + 0.35 * r.next()),
      // passive deceleration time constant of a glide (s): a gliding
      // goldfish loses about half its speed within ~0.7–0.8 s
      glideTau: r.range(0.85, 1.2),
      noiseSeed: r.range(0, 1000),
      pectFreq: r.range(1.1, 1.8), // pectoral stroke rate during a bout (Hz)
      pectHold: r.range(0.7, 1.4) * (P.calm ?? 1), // individual patience between pectoral bouts
      breathRate: r.range(1.15, 1.6), // Hz  (≈ 70–96 / min at ~22 °C)
      opercAmp: r.range(0.35, 0.55),
      mouthAmp: r.range(0.05, 0.1),
      asym: r.range(-0.06, 0.06),
    };

    // commands from the behaviour layer
    this.cmd = {
      dir: new THREE.Vector3(1, 0, 0),
      speed: 0, // BL/s
      brake: false,
      urgency: 0, // 0..1: tighter / faster turns
      pitchBias: 0, // extra head-up (+) / head-down (-) posture (rad)
      lookAt: null, // THREE.Vector3 | null
      finsClamped: 0, // 0..1 fear posture
      hoverPrecision: 0, // 0..1 fine positioning (feeding)
      hoverVel: new THREE.Vector3(), // pectoral translation while hovering (m/s, world)
      rest: 0, // 0..1 bottom-rest posture
      steady: false, // force continuous (non-intermittent) tail beating
      pitchLimit: 0.62, // max |body pitch| (rad, ≈35°); raised for surface feeding
    };

    // heading history for caudally propagating turns
    this.hT = new Float32Array(HIST);
    this.hYaw = new Float32Array(HIST);
    this.hPitch = new Float32Array(HIST);
    this.hHead = 0;
    this.hCount = 0;

    // pectorals / fins
    // each pectoral runs its own bouts of strokes (n strokes at f Hz, peak A)
    // separated by holds; `act` is the smoothed stroke activity
    this.pect = [
      { phase: 0, amp: 0, ext: 0.7, brake: 0, bout: { n: 0, u: 0, f: 1.4, A: 0 }, hold: r.range(0.2, 2.5), act: 0, fLast: 1.4 },
      { phase: 0, amp: 0, ext: 0.7, brake: 0, bout: { n: 0, u: 0, f: 1.4, A: 0 }, hold: r.range(0.2, 2.5), act: 0, fLast: 1.4 },
    ];
    this.fins = { dorsal: 1, anal: 1, caudalSpread: 0.85, pelvic: 0.6, relax: 0 };

    // head: breathing, mouth, eyes
    this.breathPhase = r.range(0, TAU);
    this.mouth = 0;
    this.protrusion = 0; // premaxillary protrusion (0..1, scales with the gape)
    this.throat = 0; // hyoid / branchiostegal expansion of the head floor
    this.yawnLevel = 0; // 0..1 envelope of a yawn (fins, posture)
    this.operc = [0, 0];
    this.mouthProgram = null;
    this.coughTimer = r.range(40, 160);
    this.eyes = [
      { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, timer: r.range(0.3, 2) },
      { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, timer: r.range(0.3, 2) },
    ];

    // C-start program
    this.cstart = null;
    this.refractory = 0;

    // outputs
    this.localP = new Float32Array(NS * 3);
    this.localQ = new Float32Array(NS * 4);
    this.bend = new Float32Array(NS);
    this.bendPitch = new Float32Array(NS);
    this.debug = { tailFreq: 0, tailAmp: 0, speedBL: 0, gait: 'hover' };

    // overrides from the debug GUI
    this.override = { enabled: false, speed: 0, freqMul: 1, ampMul: 1, brake: false };
    this.globalMul = { freq: 1, amp: 1, breath: 1 };
  }

  get forward() {
    return forwardFromYawPitch(this.yaw, this.pitch, new THREE.Vector3());
  }

  // ------------------------------------------------------------------ programs
  /** Escape response. `awayDir`: unit vector pointing away from the threat. */
  startle(awayDir, intensity = 1) {
    if (this.refractory > 0 || this.cstart) return false;
    const targetYaw = Math.atan2(-awayDir.z, awayDir.x);
    let dYaw = wrapAngle(targetYaw - this.yaw);
    // frontal threats: laterality decides the turn side
    if (Math.abs(dYaw) > Math.PI * 0.88) dYaw = Math.PI * 0.8 * (this.fish.personality.turnBias >= 0 ? 1 : -1);
    const side = Math.sign(dYaw) || 1;
    const total = clamp(Math.abs(dYaw), 0.6, 2.6);
    this.cstart = {
      t: 0,
      side,
      total,
      intensity: clamp(intensity, 0.5, 1.2),
      latency: 0.006 + this.fish.rng.range(0, 0.004),
      s1: 0.022 + this.fish.rng.range(0, 0.008), // stage 1 (C-bend)
      s2: 0.04 + this.fish.rng.range(0, 0.01), // stage 2 (return stroke)
      burst: 0.45 + this.fish.rng.range(0, 0.5),
      yaw0: this.yaw,
      pitch0: this.pitch,
      pitchKick: this.fish.rng.range(-0.25, 0.1),
    };
    this.refractory = 1.2 + this.fish.rng.range(0, 0.8);
    this.exertion = Math.min(1, this.exertion + 0.6);
    return true;
  }

  /**
   * Mouth programs: 'strike' (suction), 'peck' (substrate), 'gulp' (surface),
   * 'spit', 'cough' (gill clearing) and 'yawn'.
   * prot: premaxillary protrusion at the gape peak, throat: hyoid depression.
   * A yawn (Rasa 1971; Baenninger 1987) is a slow, maximal gape with the
   * buccal floor and opercula expanded, fins erected and the head raised,
   * held for up to a second and closed abruptly.
   */
  mouthAction(kind) {
    const r = this.fish.rng;
    const presets = {
      strike: { open: r.range(0.05, 0.09), hold: 0.04, close: r.range(0.1, 0.16), peak: 1.0, chew: r.range(0.6, 1.2), operc: 1.0, prot: 1.0, throat: 0.8 },
      peck: { open: r.range(0.07, 0.11), hold: 0.06, close: 0.14, peak: 0.85, chew: r.range(0.8, 1.8), operc: 0.9, prot: 0.9, throat: 0.6 },
      gulp: { open: r.range(0.09, 0.14), hold: 0.1, close: 0.2, peak: 1.0, chew: r.range(0.6, 1.2), operc: 0.8, prot: 0.55, throat: 0.7 },
      spit: { open: 0.05, hold: 0.03, close: 0.1, peak: 0.6, chew: 0, operc: 1.0, prot: 0.35, throat: 0.1 },
      cough: { open: 0.07, hold: 0.08, close: 0.12, peak: 0.55, chew: 0, operc: 1.3, prot: 0.2, throat: 0.5, repeat: 1 },
      yawn: { open: r.range(0.65, 1.0), hold: r.range(0.45, 1.0), close: r.range(0.09, 0.14), peak: r.range(1.15, 1.25), chew: 0, operc: r.range(1.5, 1.9), prot: r.range(0.3, 0.5), throat: 1.0, yawn: true },
    };
    if (!presets[kind]) return;
    this.mouthProgram = { kind, t: 0, ...presets[kind] };
    if (kind === 'yawn') this.yawns = (this.yawns || 0) + 1;
  }

  // ------------------------------------------------------------------ update
  update(dt, time) {
    const SL = this.SL;
    const cmd = this.cmd;
    const sig = this.sig;
    const P = this.fish.personality;
    this.refractory = Math.max(0, this.refractory - dt);
    this.exertion = Math.max(0, this.exertion - dt * 0.02);

    let desiredSpeedBL = cmd.speed;
    if (this.override.enabled) desiredSpeedBL = this.override.speed;
    desiredSpeedBL *= 1 - 0.6 * this.yawnLevel; // yawns happen while (nearly) stationary
    const rawSpeedBL = desiredSpeedBL;
    // the speed command is eased (a fish does not decide to go from a halt to
    // cruising within one frame); urgent commands pass almost unfiltered
    {
      const up = desiredSpeedBL > this.desSpeed;
      const rate = cmd.urgency > 0.3 || this.cstart ? 14 : up ? 1.8 : 3.5;
      this.desSpeed = damp(this.desSpeed, desiredSpeedBL, rate, dt);
      // (tiny residues are snapped so that "stopped" really means stopped)
      if (desiredSpeedBL === 0 && this.desSpeed < 0.02) this.desSpeed = 0;
      desiredSpeedBL = this.desSpeed;
    }

    // ---------------------------------------------------------- C-start
    let cBend = 0;
    if (this.cstart) {
      cBend = this._updateCStart(dt);
    }

    // ---------------------------------------------------------- steering
    this.restLevel = damp(this.restLevel, cmd.rest, cmd.rest > this.restLevel ? 0.8 : 2.5, dt);
    const rest = this.restLevel;
    this.pitchErr = 0;
    if (!this.cstart || this.cstart.free) {
      const d = cmd.dir;
      // Heading intent: the horizontal command direction is low-passed as a
      // VECTOR (not as an angle). Steering terms that trade places or flip
      // from one frame to the next then cancel out instead of swinging the
      // target heading from side to side, and a command that keeps changing
      // its mind leaves a short intent vector, which turns the fish only
      // weakly: the fish commits to a direction. Urgent commands pass quickly.
      const hd = Math.hypot(d.x, d.z);
      if (this.tYaw === null) {
        this.tYaw = Math.atan2(-d.z, d.x);
        this.intent = { x: Math.cos(this.tYaw), z: -Math.sin(this.tYaw) };
      }
      if (hd > 1e-4) {
        const kI = 1 - Math.exp(-dt / lerp(0.6, 0.05, cmd.urgency * cmd.urgency));
        this.intent.x += (d.x / hd - this.intent.x) * kI;
        this.intent.z += (d.z / hd - this.intent.z) * kI;
      }
      const iLen = Math.hypot(this.intent.x, this.intent.z);
      if (iLen > 1e-3) this.tYaw = Math.atan2(-this.intent.z, this.intent.x);
      const commit = smoothstep(0.1, 0.55, iLen);
      const targetYaw = this.tYaw;
      const horiz = Math.hypot(d.x, d.z);
      // climbing / diving fish tilt only moderately (softly limited to
      // ≈ ±35°, never pinned at the limit); only surface feeding raises the
      // head further
      const lim = cmd.pitchLimit ?? 0.62;
      let targetPitch = lim * Math.tanh((Math.atan2(d.y, horiz) * 0.85 + cmd.pitchBias + this.yawnLevel * 0.16 - 0.05 * rest) / lim);
      // touching the gravel (see clampToTank): level out instead of nosing
      // into it, unless the fish is picking at the bottom on purpose
      if (this.groundContact > 0 && cmd.hoverPrecision < 0.5) targetPitch = Math.max(targetPitch, 0.04);
      let err = wrapAngle(targetYaw - this.yaw);
      // a target (nearly) behind: keep turning the way we already turn
      // instead of flipping sides when the error crosses ±180°
      if (Math.abs(err) > 2.3 && this.yawRate * err < 0 && Math.abs(this.yawRate) > 0.15) err -= Math.sign(err) * TAU;
      const U = this.speed / SL;
      // routine turn rates: a calmly hovering fish pivots on its pectorals at
      // ~45 °/s (a 90° re-orientation takes 1.5–2 s), a calmly swimming one
      // turns at ~75–150 °/s; only urgent manoeuvres (food, escape) are fast
      // (koi: 88–1050 °/s)
      const calmHover = (1 - smoothstep(0.15, 0.6, Math.max(U, desiredSpeedBL))) * (1 - cmd.urgency);
      const wMax = lerp(lerp(1.0, 1.8, clamp(U / 2.2, 0, 1)), 0.8 * (1 - 0.5 * rest), calmHover) * sig.turnAgility * (1 + 4 * cmd.urgency ** 4);
      // well damped turning (damping ratio ≈ 0.8–0.9 at every urgency, no
      // overshoot: an under-damped heading loop swings the whole fish from
      // side to side at ~1 Hz, which reads as a nervous wagging head). The
      // wanted turn rate follows the heading error, the angular acceleration
      // that reaches it is bounded and itself eased in (muscle and fin forces
      // build up over ~0.1 s), so a turn starts softly, peaks and settles.
      const uS = cmd.urgency;
      const wTarget = clamp(err * (1.1 + 4 * uS) * lerp(0.35, 1, commit), -wMax, wMax);
      const aMax = lerp(5, 2.2, calmHover) * (1 + 3.5 * uS);
      const aDes = clamp((wTarget - this.yawRate) / (0.3 / (1 + 3.3 * uS)), -aMax, aMax);
      this.yawAcc = damp(this.yawAcc, aDes, (1 + 3.8 * uS) / 0.12, dt);
      this.yawRate += this.yawAcc * dt;
      // slow heading drift (never a perfectly straight line); a hovering or
      // resting fish hardly wanders off its heading
      const n = fbm1(time * 0.2 + sig.noiseSeed, 2) * 0.12 * (1 - cmd.hoverPrecision) * lerp(1, 0.25, calmHover) * (1 - 0.9 * rest);
      this.yaw = wrapAngle(this.yaw + (this.yawRate + n) * dt);
      this.pitchErr = wrapAngle(targetPitch - this.pitch);
      // pitch: a critically damped spring (no kink in the pitch rate when
      // the target posture changes); back within the posture limit quickly,
      // e.g. after surface feeding
      const wp = (Math.abs(this.pitch) > lim ? 5 : 3) + cmd.urgency * 3;
      this.pitchRate += (wp * wp * this.pitchErr - 2 * wp * this.pitchRate) * dt;
      this.pitch += this.pitchRate * dt;
    }
    const bankTarget = clamp(-this.yawRate * (this.speed / SL) * 0.05, -0.3, 0.3) + fbm1(time * 0.23 + sig.noiseSeed * 1.3, 2) * 0.03 * (1 - 0.7 * rest);
    this.roll = damp(this.roll, bankTarget, 3, dt);

    // ---------------------------------------------------------- gait / speed
    const U = this.speed / SL;
    const r = this.fish.rng;
    // a fish that is merely faster than it wants to be glides; it brakes
    // with the pectorals to stop from a brisk speed, when homing in on
    // something (food) or on command
    // (also when it comes to a halt: the pectorals flare as brakes)
    const homing = cmd.urgency > 0 || cmd.lookAt !== null || cmd.hoverPrecision > 0.3;
    const brakeWant =
      cmd.brake ||
      this.override.brake ||
      (!this.cstart && ((Math.min(desiredSpeedBL, rawSpeedBL) < 0.1 && U > (this.gait === 'brake' ? 0.3 : 0.6)) || (desiredSpeedBL < 0.3 && U > 0.9) || (homing && U > desiredSpeedBL * 1.8 + 0.6)));
    // a braking manoeuvre, once begun, is carried through (>= 0.6 s), and a
    // fish that has just stopped braking does not flare its fins again at
    // once: no stuttering between braking and swimming
    // (the time the tail needs to finish its last beat does not count)
    if (!this._finishing) this.brakeT = (this.brakeT || 0) + dt;
    if (this.cstart) {
      this.braking = false;
    } else if (brakeWant !== !!this.braking && ((this.brakeT > (this.braking ? 0.6 : 0.9) && !(brakeWant && this.gait === 'coast' && this.coastT < 0.6)) || cmd.brake || this.override.brake || (brakeWant && U > 2.2))) {
      this.braking = brakeWant;
      this.brakeT = 0;
    }
    const brake = !!this.braking;
    this.brakeLevel = damp(this.brakeLevel, brake ? 1 : 0, brake ? 6 : 3, dt);
    const B = this.bout;
    // Gait band (0 hover, 1 pectoral rowing, 2 intermittent kick-and-glide,
    // 3 steady beat) from the COMMANDED speed, not from the eased speed ramp:
    // a fish that sets off at 0.5 BL/s kicks off with its tail at once
    // instead of passing through rowing first, and one that stops glides to a
    // halt instead of rowing on and braking. Hysteresis on every boundary, a
    // short debounce and a minimum dwell keep it from toggling between gaits.
    this.gaitSpd = damp(this.gaitSpd ?? 0, rawSpeedBL, 6, dt);
    {
      const up = [0.12, 0.34, 0.56];
      const down = [0.08, 0.28, 0.48];
      let b = this.band ?? 0;
      const g = rawSpeedBL;
      while (b < 3 && g >= up[b]) b++;
      while (b > 0 && g < down[b - 1]) b--;
      if (cmd.steady && b === 2) b = 3;
      this.bandT = (this.bandT || 0) + dt;
      this.bandAsk = b !== this.band ? (this.bandAsk || 0) + dt : 0;
      const fast = cmd.urgency > 0.9 || this.cstart;
      // speeding up is decided quickly (a fish setting off does not wait),
      // slowing down only after a while in the current gait; a glide that has
      // just begun is not cut short by a faster gait
      const upward = this.band === undefined || b > this.band;
      const gliding = this.gait === 'coast' && this.coastT < 0.7;
      const ok = upward ? this.bandAsk > (cmd.urgency > 0.3 ? 0.05 : 0.2) && !(gliding && b === 3) : this.bandAsk > 0.25 && this.bandT > 0.7;
      if (b !== this.band && (this.band === undefined || fast || ok)) {
        this.band = b;
        this.bandT = 0;
        this.bandAsk = 0;
      }
    }
    const band = this.band;
    const prevGait = this.gait;
    let finishing = false; // a running tail beat is being finished
    const inCStart = this.cstart && this.cstart.t < this.cstart.latency + this.cstart.s1 + this.cstart.s2;
    let targetSpeed = null; // m/s; null = unpowered glide
    let tau = 0.45;
    let steady = false;
    this.coast = false;
    if (inCStart) {
      // the C-bend itself comes from the C-start program
      this.gait = 'cstart';
      B.n = 0;
      B.u = 0;
    } else if (this.cstart) {
      // post-escape burst swimming
      const k = 1 - smoothstep(0, this.cstart.burst, this.cstart.t - this.cstart.latency - this.cstart.s1 - this.cstart.s2);
      // (the behaviour layer lowers the command when the escape heads for an
      // obstacle: the burst is then shorter)
      const burstU = lerp(Math.max(desiredSpeedBL, 1.5), 7.5 * clamp(cmd.speed / 4, 0.35, 1), k);
      this._steadyBeat((4 / 3) * (burstU + 1) * sig.freqMul, 0.1, dt);
      targetSpeed = burstU * SL;
      this.boutTarget = burstU;
      this.gait = 'burst';
      this.glideTime = 0;
    } else if (band === 0 || brake) {
      // hovering / braking: the caudal fin is held still and straight. A
      // running tail beat is finished, never frozen mid-stroke. (Hysteresis
      // on every gait threshold keeps a fish from toggling between gaits.)
      this.gait = brake ? 'brake' : 'hover';
      this.decelGlide = false;
      if (B.n > 0) {
        B.n = Math.min(B.n, Math.max(Math.floor(B.u) + 1, B.u + 0.5));
        finishing = true;
      }
      else if (!brake && rest < 0.2) {
        // a rare single, small corrective sweep while holding station
        this.flickTimer -= dt;
        if (this.flickTimer <= 0) {
          if (Math.abs(this.yawRate) > 0.3 || this.driftAcc > 0.05 || this.hoverVel.length() > 0.08 * SL) {
            this._startBout(1, r.range(1.2, 1.6) * sig.freqMul, r.range(0.01, 0.016));
            this.boutTarget = Math.max(U, desiredSpeedBL);
            this.driftAcc *= 0.3;
            this.flickTimer = jitterDuration(r, 18, 0.5);
          } else this.flickTimer = r.range(1.5, 4);
        }
      }
      targetSpeed = (brake ? desiredSpeedBL * 0.5 : desiredSpeedBL) * SL;
      // pectoral thrust and braking are gentle; coming to a halt, the
      // pectorals check the remaining glide a little more firmly
      tau = brake ? 0.35 : desiredSpeedBL < 0.04 ? 0.6 : 0.8;
      // (not gliding: a fish that sets off from here kicks at once)
      this.glideTime = 10;
    } else if (band === 1) {
      // slow labriform swimming: the pectorals row (alternating strokes, see
      // _updateFins) and carry the fish; the caudal fin is held still and
      // straight and now and then gives a single assisting beat, more often
      // the faster the fish goes
      this.gait = 'row';
      this.decelGlide = false;
      if (B.n > 0) {
        B.n = Math.min(B.n, Math.max(Math.floor(B.u) + 1, B.u + 0.5));
        finishing = true;
      }
      else if (rest < 0.3 && U > 0.14) {
        this.assistTimer -= dt;
        const deficit = desiredSpeedBL - U;
        if (this.assistTimer <= 0 || deficit > 0.2) {
          // (one slow, full sweep - a quick flick reads as a twitch)
          const f = r.range(1.35, 1.7) * sig.freqMul;
          this._startBout(1, f, r.range(0.028, 0.038) * sig.ampMul);
          this.boutTarget = desiredSpeedBL * r.range(1.1, 1.25);
          this.assistTimer = jitterDuration(r, lerp(2.2, 1.1, smoothstep(0.1, 0.34, desiredSpeedBL)), 0.35);
        }
      }
      // a beat adds a small surge; rowing thrust itself is gentle. A rowing
      // fish clearly travels (it does not creep at the edge of standing still).
      const rowU = Math.max(desiredSpeedBL, 0.17);
      targetSpeed = (B.n > 0 ? Math.max(rowU, this.boutTarget) : rowU) * SL;
      tau = B.n > 0 ? 0.45 : 0.75;
      this.glideTime = 10;
    } else if (band === 2) {
      // intermittent swimming: a bout of tail beats, then a short glide with
      // the body straight and the tail still, during which the fish slows
      // down visibly until it kicks again
      this.decelGlide = false;
      if (B.n <= 0) {
        this.glideTime += dt;
        // (a fish that has decided to swim off kicks toward the speed it wants,
        // not toward the first few per cent of the eased command)
        const want = Math.max(desiredSpeedBL, 0.8 * this.gaitSpd);
        const deficit = want - U;
        // (no new kick once the fish has been told to slow down or stop)
        if (rawSpeedBL > 0.3 && ((this.glideTime > (this.glideMin || 0) && (U < want * this.glideLow || (this.glideTime > this.glideMax && deficit > 0))) || deficit > 0.6)) {
          this._kickBout(want, U);
          this.glideTime = 0;
        }
      }
      if (B.n > 0) {
        this.gait = 'swim';
        targetSpeed = this.boutTarget * SL;
        tau = 0.3; // the first strokes of a kick give most of the thrust
      } else {
        this.gait = 'coast';
        this.coast = true;
      }
    } else {
      // steady swimming: Bainbridge tail-beat frequency. A fish that is
      // clearly faster than it wants to be stops beating and glides down.
      steady = true;
      // (a glide down, once begun, lasts >= 0.7 s, and so does the beating
      // that follows it: no flicker between beating and gliding)
      this.decelT = (this.decelT || 0) + dt;
      if (!this.decelGlide && U > desiredSpeedBL * 1.3 + 0.15 && !cmd.steady && this.decelT > 0.7) {
        this.decelGlide = true;
        this.decelT = 0;
      } else if (this.decelGlide && (U < desiredSpeedBL * 1.06 || cmd.steady) && this.decelT > 0.7) {
        this.decelGlide = false;
        this.decelT = 0;
      }
      if (this.decelGlide) {
        if (B.n > 0) {
          B.n = Math.min(B.n, Math.max(Math.floor(B.u) + 1, B.u + 0.5));
          finishing = true;
        }
        this.gait = 'coast';
        this.coast = true;
      } else {
        const accel = clamp(desiredSpeedBL - U, 0, 3);
        const uCmd = desiredSpeedBL + accel * 0.9; // thrust overdrive while accelerating
        const f = (4 / 3) * (uCmd + 1) * sig.freqMul;
        this._steadyBeat(f, this._ampForFreq(f) * sig.ampMul, dt);
        targetSpeed = uCmd * SL;
        this.boutTarget = desiredSpeedBL;
        this.gait = U > 2.5 ? 'cruise-fast' : 'swim';
      }
      this.glideTime = 0;
    }
    this.steadyMode = steady;
    // while its last beat is being finished the fish is still swimming: the
    // gait changes when the tail actually comes to rest
    if (finishing && (prevGait === 'swim' || prevGait === 'cruise-fast')) this.gait = prevGait;
    this._finishing = finishing;
    this.coastT = this.gait === 'coast' ? (this.coastT || 0) + dt : 0;
    // pectoral rowing drive: the pectorals carry slow swimming and keep
    // rowing through the glides of slow intermittent swimming; they are
    // folded away as soon as the caudal fin drives a faster fish
    let rowT = 0;
    if (!this.cstart && !brake) {
      if (this.gait === 'row') rowT = 1;
      else if (this.gait === 'coast' && !this.decelGlide) rowT = 0.8 * (1 - smoothstep(0.5, 0.65, U));
      else if (this.gait === 'swim' && !steady) rowT = 0.4 * (1 - smoothstep(0.4, 0.55, U));
    }
    this.rowDrive = damp(this.rowDrive, rowT * (1 - 0.7 * rest), 4, dt);
    // advance the tail-beat bout; the wave amplitude rises over the first
    // third of a cycle and fades over the last half, so every bout starts and
    // ends with a straight body
    let fMul = this.globalMul.freq;
    let aMul = this.globalMul.amp;
    if (this.override.enabled) {
      fMul *= this.override.freqMul;
      aMul *= this.override.ampMul;
    }
    let targetA = 0;
    let targetF = 0;
    if (B.n > 0) {
      const f = Math.min(B.f * fMul, 14);
      B.u += f * dt;
      this.phase += TAU * f * dt;
      // (a kick swells over the first beat and dies away over the last one;
      // a single corrective beat is a soft, symmetric sweep)
      const rise = Math.min(0.5, 0.4 * B.n);
      const fall = Math.min(0.75, 0.55 * B.n);
      targetA = Math.min(B.A * aMul, 0.13) * smoothstep(0, rise, B.u) * (1 - smoothstep(B.n - fall, B.n, B.u));
      targetF = f;
      this.fLast = f;
      if (B.u >= B.n) {
        B.n = 0;
        B.u = 0;
      }
    } else if (this.amp > 0.001) {
      // the wave keeps travelling while the last stroke dies away (a frozen
      // phase would stop the tail dead in mid-sweep)
      this.phase += TAU * (this.fLast || 2) * dt;
    }
    this.amp = damp(this.amp, targetA, this.cstart ? 25 : 16, dt);
    this.freq = damp(this.freq, targetF, 8, dt);

    // speed dynamics
    // (second order: the wanted acceleration follows the speed error, the
    // actual one eases toward it - thrust builds up with the first strokes,
    // drag takes over smoothly when the tail stops)
    if (!inCStart) {
      const aDes = targetSpeed === null ? -this.speed / sig.glideTau : (targetSpeed - this.speed) / tau;
      // (drag takes over quickly once the tail stops: a glide visibly slows)
      const tauA = this.cstart || cmd.urgency > 0.6 ? 0.05 : targetSpeed === null ? 0.08 : brake ? 0.12 : 0.17;
      this.accel = damp(this.accel, aDes, 1 / tauA, dt);
      this.speed = Math.max(0, this.speed + this.accel * dt);
      if (this.speed === 0) this.accel = Math.max(0, this.accel);
    } else this.accel = 0;
    // contact losses (bumping a neighbour, sliding along the glass) are
    // spread over a few frames instead of cutting the speed at once
    if (this.contactBrake > 0) {
      this.speed *= Math.exp(-this.contactBrake * dt);
      this.contactBrake *= Math.exp(-dt / 0.15);
      if (this.contactBrake < 1e-3) this.contactBrake = 0;
    }
    this.exertion = Math.min(1, this.exertion + dt * 0.02 * Math.max(0, U - 1.5));

    // ---------------------------------------------------------- integrate
    this.quat.setFromEuler(_e.set(0, this.yaw, 0, 'YXZ'));
    _q.setFromAxisAngle(Z, this.pitch);
    this.quat.multiply(_q);
    _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.roll);
    this.quat.multiply(_q);
    const fwd = forwardFromYawPitch(this.yaw, this.pitch, new THREE.Vector3());
    // pectoral translation while hovering (station keeping, repositioning,
    // being nudged by a neighbour) - no turn, no tail
    this.hoverVel.lerp(cmd.hoverVel, 1 - Math.exp(-dt / 0.7));
    // hovering fish drift slowly between pectoral bouts (the fins are held
    // still, so nothing balances the slight buoyancy and current); a bout of
    // strokes corrects it
    const hoverDrift = this.gait === 'hover' ? 1 : 0.3;
    const pectAct = 0.5 * (this.pect[0].act + this.pect[1].act);
    const drift = new THREE.Vector3(
      fbm1(time * 0.11 + sig.noiseSeed * 3.3, 2),
      fbm1(time * 0.09 + sig.noiseSeed * 4.1, 2) * 0.6,
      fbm1(time * 0.1 + sig.noiseSeed * 5.7, 2)
    ).multiplyScalar(0.012 * SL * hoverDrift * (1 - cmd.hoverPrecision * 0.8) * (1 - 0.85 * rest) * (1 - 0.7 * pectAct));
    if (this.gait === 'hover') this.driftAcc += (drift.length() / SL) * dt;
    this.driftAcc *= Math.exp(-dt * (0.05 + 1.5 * pectAct));
    // soft separation after a bump (Steering.resolveOverlaps) fades out
    this.contactVel.multiplyScalar(Math.exp(-dt / 0.06));
    this.vel.copy(fwd).multiplyScalar(this.speed).add(this.hoverVel).add(drift).add(this.contactVel);
    // the water surface is a soft ceiling: rising into it, a fish is slowed
    // over the last few millimetres instead of being stopped dead by the tank
    // clamp (Steering.clampToTank), which would read as a jolt
    if (this.fish.brain && this.vel.y > 0) {
      const room = TANK.water - 0.1 * SL - this.pos.y;
      this.vel.y *= smoothstep(0, 0.15 * SL, room);
    }
    // likewise the gravel: sinking toward it, the fish settles softly
    // instead of being lifted back out of it from one frame to the next
    const fl = this.fish.rig.floor;
    if (this.fish.brain && fl && this.vel.y < 0) {
      const ds = this.fish.variation ? this.fish.variation.depthScale : 1;
      const room = this.pos.y - fl.y - 0.19 * SL * ds;
      this.vel.y *= 0.15 + 0.85 * smoothstep(0, 0.2 * SL, room);
    }
    this.pos.addScaledVector(this.vel, dt);

    // heading history
    this.hHead = (this.hHead + 1) % HIST;
    this.hT[this.hHead] = time;
    this.hYaw[this.hHead] = this.yaw;
    this.hPitch[this.hHead] = this.pitch;
    this.hCount = Math.min(HIST, this.hCount + 1);

    // ---------------------------------------------------------- midline
    this._buildMidline(time, cBend);

    // ---------------------------------------------------------- fins & head
    this._updateFins(dt, time, brake);
    this._updateHead(dt, time);

    this.debug.tailFreq = this.freq;
    this.debug.tailAmp = this.amp;
    this.debug.speedBL = this.speed / SL;
    this.debug.gait = this.gait;
  }

  /** Tail-tip amplitude (SL) for a beat frequency: grows with f, ≈ ±0.1 SL above 5 Hz. */
  _ampForFreq(f) {
    return 0.1 * clamp(0.18 + (0.82 * (f - 1.33)) / 3.67, 0.16, 1.0);
  }

  _startBout(n, f, A) {
    const B = this.bout;
    B.n = n;
    B.u = 0;
    B.f = f;
    B.A = A;
  }

  /** One kick bout of intermittent swimming toward `want` BL/s from `U`. */
  _kickBout(want, U) {
    const r = this.fish.rng;
    const sig = this.sig;
    const deficit = Math.max(0, want - U);
    // 6–8 beats, more when well below the wanted speed
    const n = 6 + (r.next() < lerp(0.4, 0.75, smoothstep(0.4, 0.85, want)) ? 1 : 0) + (deficit > 0.3 ? 1 : 0);
    const f = r.range(2.1, 2.8) * lerp(1, 1.12, smoothstep(0.5, 0.85, want)) * sig.freqMul;
    const A = this._ampForFreq(f) * sig.ampMul * lerp(1.05, 1.3, smoothstep(0, 0.5, deficit));
    this._startBout(n, f, A);
    // kick up to ~1.2x the wanted speed; the glide that follows is short:
    // the next bout starts once drag has slowed the fish to ~0.75–0.9x
    this.boutTarget = want * r.range(1.15, 1.3) + deficit * 0.3;
    // (a glide always lasts long enough to read as one, >= ~0.7 s: a tail
    // that stops for a moment and starts again reads as a hiccup)
    this.glideLow = lerp(0.8, 0.7, sig.burstCoastBias) * r.range(0.96, 1.04);
    this.glideMax = lerp(1.1, 1.8, sig.burstCoastBias) * r.range(0.85, 1.15);
    this.glideMin = r.range(0.9, 1.2);
  }

  /** Continuous tail beating (steady swimming, escape burst). */
  _steadyBeat(f, A, dt) {
    const B = this.bout;
    if (B.n <= 0) {
      this._startBout(1, f, A);
      return;
    }
    B.n = Math.max(B.n, B.u + 1);
    B.f = damp(B.f, f, 5, dt);
    B.A = damp(B.A, A, A > B.A ? 7 : 3, dt);
  }

  _history(tAgo, now) {
    // heading (yaw, pitch) the fish had `tAgo` seconds ago
    const target = now - tAgo;
    let idx = this.hHead;
    for (let k = 0; k < this.hCount - 1; k++) {
      const prev = (idx - 1 + HIST) % HIST;
      if (this.hT[prev] <= target) {
        const t0 = this.hT[prev];
        const t1 = this.hT[idx];
        const f = t1 > t0 ? clamp((target - t0) / (t1 - t0), 0, 1) : 0;
        const y = this.hYaw[prev] + wrapAngle(this.hYaw[idx] - this.hYaw[prev]) * f;
        const p = lerp(this.hPitch[prev], this.hPitch[idx], f);
        return [y, p];
      }
      idx = prev;
    }
    return [this.hYaw[idx], this.hPitch[idx]];
  }

  _updateCStart(dt) {
    const c = this.cstart;
    c.t += dt;
    const t = c.t - c.latency;
    const k = 2.35 * c.intensity; // total C-bend (rad) head-to-tail
    let bend = 0;
    if (t < 0) return 0;
    const e1 = c.s1;
    const e2 = c.s1 + c.s2;
    // heading: ~55 % of the turn in stage 1, rest in stage 2
    let yawFrac;
    if (t < e1) {
      const u = smoothstep(0, e1, t);
      bend = k * u;
      yawFrac = 0.55 * u;
    } else if (t < e2) {
      const u = smoothstep(e1, e2, t);
      bend = k * lerp(1, -0.35, u);
      yawFrac = lerp(0.55, 1.0, u);
      // stage 2 return stroke produces the escape thrust
      const peak = 14 * this.SL * c.intensity;
      this.speed = Math.max(this.speed, lerp(this.speed, peak, u));
    } else {
      const u = smoothstep(e2, e2 + 0.12, t);
      bend = k * lerp(-0.35, 0, u);
      // the escape turn is complete: during the burst that follows the fish
      // steers again (away from the glass instead of ramming it)
      if (!c.free) {
        c.free = true;
        this.yawRate = 0;
        this.yawAcc = 0;
        this.pitchRate = 0;
      }
      if (t > e2 + c.burst) {
        this.cstart = null;
        this.accel = 0;
      }
      return bend * c.side;
    }
    this.yaw = wrapAngle(c.yaw0 + c.side * c.total * yawFrac);
    this.pitch = clamp(c.pitch0 + c.pitchKick * Math.min(1, yawFrac), -0.62, 0.62);
    this.yawRate = 0;
    this.tYaw = this.yaw;
    this.intent = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    return bend * c.side;
  }

  _buildMidline(time, cBend) {
    const SL = this.SL;
    const ds = 1 / (NS - 1);
    const k = TAU / this.waveLen;
    const A = this.amp;
    const U = Math.max(this.speed, 1.3 * SL);
    const ia = Math.round(S_ANCHOR * (NS - 1));
    const n1 = this.sig.noiseSeed;
    const calm = 1 - 0.6 * this.restLevel;
    for (let i = 0; i < NS; i++) {
      const s = i * ds;
      // Videler–Hess amplitude envelope (normalised to 1 at the tail)
      const env = (0.02 - 0.0825 * s + 0.1625 * s * s) / 0.1;
      const denv = (-0.0825 + 0.325 * s) / 0.1;
      const arg = k * s - this.phase;
      // (the head is stabilised: its recoil yaw is about a third of what the
      // bare envelope gives - real goldfish keep the snout within ±3–6° -
      // so the head does not waggle with every beat)
      const headCalm = 0.3 + 0.7 * smoothstep(0.1, 0.45, s);
      const slope = A * (denv * Math.sin(arg) + env * k * Math.cos(arg)) * headCalm;
      let yawA = Math.atan(slope);
      let pitchA = 0;
      // caudally propagating turn: follow the delayed heading
      if (s > S_ANCHOR) {
        const [hy, hp] = this._history(((s - S_ANCHOR) * SL) / U, time);
        // (a routine turn bends the body into a moderate C, never a U; the
        // limit is soft - a hard clip puts a kink into the bend rate that
        // makes the caudal fin whip)
        yawA += 0.85 * Math.tanh(wrapAngle(hy - this.yaw) / 0.85);
        pitchA += 0.5 * Math.tanh((hp - this.pitch) / 0.5) * 0.7;
      } else {
        yawA += this.yawRate * 0.05 * ((S_ANCHOR - s) / S_ANCHOR);
      }
      // C-start: constant curvature C-shape
      yawA += -cBend * (s - S_ANCHOR);
      // postural micro-adjustments (tiny, slow, individual)
      yawA += fbm1(time * 0.2 + n1 + s * 0.8, 2) * 0.025 * (s - S_ANCHOR) * calm;
      pitchA += fbm1(time * 0.17 + n1 * 1.7 + s * 0.5, 2) * 0.02 * (s - S_ANCHOR) * calm;
      this.bend[i] = yawA;
      this.bendPitch[i] = pitchA;
    }
    // frames
    for (let i = 0; i < NS; i++) {
      _qa.setFromAxisAngle(Y, this.bend[i]);
      _qb.setFromAxisAngle(Z, this.bendPitch[i]);
      _qa.multiply(_qb);
      _qa.toArray(this.localQ, i * 4);
    }
    // integrate positions from the anchor
    const seg = ds * SL;
    const P = this.localP;
    P[ia * 3] = 0;
    P[ia * 3 + 1] = 0;
    P[ia * 3 + 2] = 0;
    const dir = (i0, i1, out) => {
      const yaw = 0.5 * (this.bend[i0] + this.bend[i1]);
      const pit = 0.5 * (this.bendPitch[i0] + this.bendPitch[i1]);
      return forwardFromYawPitch(yaw, pit, out);
    };
    const d = new THREE.Vector3();
    for (let i = ia - 1; i >= 0; i--) {
      dir(i, i + 1, d);
      P[i * 3] = P[(i + 1) * 3] + d.x * seg;
      P[i * 3 + 1] = P[(i + 1) * 3 + 1] + d.y * seg;
      P[i * 3 + 2] = P[(i + 1) * 3 + 2] + d.z * seg;
    }
    for (let i = ia + 1; i < NS; i++) {
      dir(i - 1, i, d);
      P[i * 3] = P[(i - 1) * 3] - d.x * seg;
      P[i * 3 + 1] = P[(i - 1) * 3 + 1] - d.y * seg;
      P[i * 3 + 2] = P[(i - 1) * 3 + 2] - d.z * seg;
    }
    // shift so that the snout is at local x = +S_ANCHOR*SL when straight (pos = COM)
  }

  _updateFins(dt, time, brake) {
    const sig = this.sig;
    const cmd = this.cmd;
    const r = this.fish.rng;
    const SL = this.SL;
    const U = this.speed / SL;
    const fear = cmd.finsClamped;
    const rest = this.restLevel;
    const bl = this.brakeLevel;
    const fast = smoothstep(0.8, 2.5, U);
    const slow = 1 - smoothstep(0.1, 0.6, U);
    // pectorals adducted as soon as the caudal fin drives the fish, spread
    // while they row
    const row = this.rowDrive;
    const pectFold = smoothstep(0.15, 0.6, U) * (1 - 0.9 * row);
    // relaxed fins droop when the fish is slow and calm (FishRig)
    this.fins.relax = damp(this.fins.relax, clamp(slow * (1 - 0.7 * fear) * (1 - bl) * (1 - 0.5 * row) + 0.3 * rest, 0, 1) * (1 - this.yawnLevel), 1.5, dt);
    // dorsal: erect when slow / manoeuvring, lowered at speed, clamped in
    // fear, partly lowered while resting on the bottom
    const dorsalT = clamp(1 - 0.45 * fast - 0.65 * fear + 0.1 * bl - 0.5 * rest, 0.15, 1);
    const yl = this.yawnLevel; // a yawn erects every fin ("stretch")
    this.fins.dorsal = damp(this.fins.dorsal, this.cstart ? 0.35 : lerp(dorsalT, 1.18, yl), 4, dt);
    this.fins.anal = damp(this.fins.anal, lerp(clamp(1 - 0.35 * fast - 0.4 * fear - 0.3 * rest, 0.3, 1), 1.1, yl), 4, dt);
    // the caudal fin is partly folded while hovering and more so at rest
    const spreadT = 0.82 + 0.35 * bl + (0.15 * Math.abs(this.yawRate)) / 3 - 0.3 * fear + (this.gait === 'burst' ? 0.2 : 0) - 0.22 * slow - 0.22 * rest;
    this.fins.caudalSpread = damp(this.fins.caudalSpread, lerp(clamp(spreadT, 0.38, 1.35), 1.3, yl), 3, dt);
    // pelvics: spread as stabilisers while hovering, tucked at speed and at
    // rest (where they would otherwise dig into the gravel)
    this.fins.pelvic = damp(this.fins.pelvic, lerp(clamp(0.72 - 0.6 * fast + 0.4 * bl - 0.3 * fear - 0.4 * rest, 0.05, 1), 1.0, yl), 3, dt);

    // ---- pectorals: short bouts of strokes, held still in between.
    // How much sculling the moment calls for: slow pectoral swimming,
    // repositioning, pivot turns, pitch changes, fine positioning (feeding),
    // accumulated drift, braking.
    const hoverK = 1 - pectFold;
    const turnN = smoothstep(0.12, 0.7, Math.abs(this.yawRate));
    let need =
      hoverK *
      clamp(
        smoothstep(0.03, 0.2, U) +
          smoothstep(0.01, 0.12, this.hoverVel.length() / SL) +
          0.8 * turnN +
          0.5 * smoothstep(0.08, 0.4, Math.abs(this.pitchErr || 0)) +
          0.6 * cmd.hoverPrecision +
          0.6 * clamp(this.driftAcc / 0.06, 0, 1),
        0,
        1
      ) *
      (1 - 0.6 * rest);
    need = clamp(need + bl, 0, 1);
    const canScull = !this.cstart && (pectFold < 0.7 || bl > 0.3);
    // rowing: continuous, alternating strokes (the fins half a stroke apart)
    // whose amplitude and rate grow with the speed they carry
    const rowing = canScull && row > 0.3;
    const rowF = sig.pectFreq * lerp(1.1, 1.45, smoothstep(0.1, 0.45, Math.max(U, cmd.speed))) * (1 - 0.3 * rest);
    const rowA = lerp(0.15, 0.24, smoothstep(0.08, 0.42, Math.max(U, Math.min(cmd.speed, 0.6)))) * smoothstep(0.3, 0.6, row) * (1 - 0.5 * rest);
    if (rowing) {
      const p0 = this.pect[0];
      const p1 = this.pect[1];
      p0.phase += TAU * rowF * dt;
      // the right fin locks on to half a stroke behind the left one
      p1.phase += TAU * rowF * dt + wrapAngle(p0.phase - Math.PI - p1.phase) * Math.min(1, 3 * dt);
      p0.phase = wrapAngle(p0.phase);
      p1.phase = wrapAngle(p1.phase);
    }
    for (let s = 0; s < 2; s++) {
      const p = this.pect[s];
      const side = s === 0 ? 1 : -1;
      const turnInner = clamp(-this.yawRate * side * 0.25, 0, 0.4); // left fin is the inner (pivot) fin in left turns (yawRate < 0)
      // held slightly spread while hovering, lowered as props at rest,
      // adducted against the body while swimming
      const extT = lerp(clamp(lerp(lerp(0.78, 0.5, rest), 0.06, pectFold) + turnInner - fear * 0.4, 0.04, 1), 1.0, yl);
      p.ext = damp(p.ext, this.cstart ? 0.05 : extT, 5, dt);
      p.brake = damp(p.brake, bl * 0.9, 5, dt);
      const b = p.bout;
      if (rowing) {
        // bouts are suspended while the fin rows; sculling may resume soon after
        b.n = 0;
        b.u = 0;
        p.hold = Math.min(p.hold, r.range(0.3, 1.2));
        p.fLast = rowF;
        p.amp = damp(p.amp, rowA * (1 - pectFold * (1 - bl)) * (1 - 0.85 * yl), 4, dt);
        p.act = damp(p.act, 1, 3, dt);
        continue;
      }
      if (b.n > 0) {
        b.u += b.f * dt;
        if (b.u >= b.n || !canScull) {
          b.n = 0;
          b.u = 0;
          // hold: long when nothing is needed, short when sculling is needed
          p.hold = lerp(r.range(1.2, 5.5), r.range(0.1, 0.5), need) * sig.pectHold * (1 + 1.5 * rest);
        }
      } else if (canScull) {
        p.hold -= dt * (1 + 3 * need);
        if (p.hold <= 0) {
          const urge = need + hoverK * 0.25 * (1 - 0.7 * rest);
          if (r.next() < clamp(urge, 0.06, 1)) {
            // the fin on the outside of a turn sculls harder
            const outer = clamp(this.yawRate * side, -1, 1) * turnN;
            const n = rest > 0.5 ? 1 + (r.next() < 0.4 ? 1 : 0) : 2 + Math.floor(r.range(0, 3.99)) + (need > 0.6 ? 2 : 0);
            const f = sig.pectFreq * lerp(1, 1.35, need) * r.range(0.9, 1.1);
            const A = r.range(0.16, 0.24) * lerp(0.75, 1.15, need) * (1 - 0.5 * rest) * (1 + 0.4 * outer) + 0.08 * bl;
            // a fin still swinging out of a stroke continues from where it is
            this._pectBout(p, n, f, A, p.amp > 0.02 ? (((p.phase / TAU) % 1) + 1) % 1 : 0);
            // usually both fins row, alternating; about a third of the bouts
            // use a single fin
            const o = this.pect[1 - s];
            if (o.bout.n <= 0 && r.next() < 0.7) this._pectBout(o, n, f * r.range(0.95, 1.05), A * r.range(0.8, 1.1) * (1 - 0.8 * outer), o.amp > 0.02 ? (((o.phase / TAU) % 1) + 1) % 1 : -r.range(0.35, 0.6));
          } else p.hold = r.range(0.8, 2.5) * sig.pectHold * (1 + rest);
        }
      }
      // stroke envelope: eases in over half a stroke and out over the last
      // ~0.6 stroke (no popping fins). Between bouts a fin that is still swinging (e.g. at the end of
      // rowing) finishes its stroke instead of snapping back.
      const env = b.n > 0 ? smoothstep(0, 0.45, b.u) * (1 - smoothstep(b.n - 0.6, b.n, b.u)) : 0;
      if (b.n > 0) {
        p.phase = Math.max(0, b.u) * TAU;
        p.fLast = b.f;
      } else if (p.amp > 0.004) p.phase += TAU * p.fLast * dt;
      else p.phase = 0;
      const ampT = b.A * env * (1 - pectFold * (1 - bl)) * (1 - 0.85 * yl);
      p.amp = damp(p.amp, ampT, b.n > 0 ? 10 : 4, dt);
      p.act = damp(p.act, b.n > 0 && b.u > 0 ? 1 : 0, 3, dt);
    }
  }

  _pectBout(p, n, f, A, u0) {
    const b = p.bout;
    b.n = n;
    b.u = u0; // negative: delayed start (the partner fin lags the leader)
    b.f = f;
    b.A = A;
  }

  _updateHead(dt, time) {
    const sig = this.sig;
    // ---- ventilation
    // resting fish ventilate more slowly and shallowly
    const rest = this.restLevel;
    const rate = sig.breathRate * this.globalMul.breath * (1 + 0.6 * this.exertion) * (1 - 0.22 * rest) * (1 + 0.08 * fbm1(time * 0.2 + sig.noiseSeed, 2));
    this.breathPhase += TAU * rate * dt;
    const bp = this.breathPhase;
    const breathAmp = (1 + 0.9 * this.exertion) * (1 - 0.15 * rest);
    // buccal expansion (mouth opens) leads opercular abduction by ~0.3 cycle
    let mouth = sig.mouthAmp * breathAmp * Math.pow(Math.max(0, Math.sin(bp)), 1.5);
    let operc = sig.opercAmp * breathAmp * Math.pow(Math.max(0, Math.sin(bp - 1.9)), 1.3);
    // the buccal floor drops just after the mouth opens (water drawn in)
    let throat = 0.18 * breathAmp * Math.pow(Math.max(0, Math.sin(bp - 0.6)), 1.4);
    let prot = 0;
    let yawn = 0;

    // occasional gill clearing ("cough")
    this.coughTimer -= dt;
    if (this.coughTimer < 0 && !this.mouthProgram) {
      this.mouthAction('cough');
      this.coughTimer = jitterDuration(this.fish.rng, 90, 0.5);
    }
    // ---- mouth programs
    const mp = this.mouthProgram;
    if (mp) {
      mp.t += dt;
      const t = mp.t;
      let m = 0;
      let o = 0;
      const tOpen = mp.open;
      const tHold = tOpen + mp.hold;
      const tClose = tHold + mp.close;
      if (t < tOpen) m = mp.peak * smoothstep(0, tOpen, t);
      else if (t < tHold) m = mp.peak;
      else if (t < tClose) m = mp.peak * (1 - smoothstep(tHold, tClose, t));
      // operculum flares just after the gape peak (suction flow exits via gills)
      o = mp.operc * smoothstep(tOpen * 0.6, tHold + 0.03, t) * (1 - smoothstep(tClose, tClose + 0.15, t));
      const env = m / mp.peak;
      prot = Math.max(prot, (mp.prot || 0) * env);
      throat = Math.max(throat, (mp.throat || 0) * env);
      if (mp.yawn) {
        // slow ease-in opening, the floor of the head and the gill covers
        // keep expanding through the hold, everything snaps shut together
        m = mp.peak * (t < tOpen ? Math.pow(smoothstep(0, tOpen, t), 1.3) : t < tHold ? 1 : 1 - smoothstep(tHold, tClose, t));
        throat = Math.max(throat, mp.throat * smoothstep(tOpen * 0.25, tHold, t) * (1 - smoothstep(tHold, tClose + 0.05, t)));
        o = mp.operc * smoothstep(tOpen * 0.45, tHold, t) * (1 - smoothstep(tHold + 0.02, tClose + 0.12, t));
        yawn = smoothstep(0, tOpen * 0.8, t) * (1 - smoothstep(tHold, tClose + 0.45, t));
      }
      // chewing / sorting: pharyngeal processing shows as small rhythmic mouth motion
      if (t > tClose && mp.chew > 0) {
        const tc = t - tClose;
        m = Math.max(m, 0.12 * Math.max(0, Math.sin(tc * TAU * 3.2)) * (1 - smoothstep(mp.chew * 0.7, mp.chew, tc)));
        o = Math.max(o, 0.3 * Math.max(0, Math.sin(tc * TAU * 3.2 - 1.2)));
      }
      mouth = Math.max(mouth, m);
      operc = Math.max(operc, o);
      if (t > tClose + (mp.chew || 0) + 0.2) {
        if (mp.kind === 'cough' && mp.repeat) {
          this.mouthProgram = { ...mp, t: 0, repeat: 0 };
        } else this.mouthProgram = null;
      }
    }
    this.mouth = damp(this.mouth, mouth, 30, dt);
    this.protrusion = damp(this.protrusion, prot, 25, dt);
    this.throat = damp(this.throat, throat, 20, dt);
    this.yawnLevel = damp(this.yawnLevel, yawn, 8, dt);
    this.operc[0] = damp(this.operc[0], operc * (1 + sig.asym), 25, dt);
    this.operc[1] = damp(this.operc[1], operc * (1 - sig.asym), 25, dt);

    // ---- eyes: independent horizontal saccades + fixation drift / target tracking
    const look = this.cmd.lookAt;
    for (let s = 0; s < 2; s++) {
      const e = this.eyes[s];
      e.timer -= dt;
      if (look) {
        // converge toward the target (rotate each eye's axis toward it)
        const toT = look.clone().sub(this.pos);
        const localYaw = wrapAngle(Math.atan2(-toT.z, toT.x) - this.yaw);
        // both eyes rotate toward the snout (convergence) for targets ahead;
        // the target is followed by smooth pursuit (rate limited), not by a
        // string of small saccades while the head turns
        const wantY = clamp(0.38 * Math.cos(localYaw), -0.2, 0.4);
        e.tYaw += clamp(wantY - e.tYaw, -0.9 * dt, 0.9 * dt);
        e.tPitch = clamp((toT.y / (toT.length() + 1e-4)) * 0.4, -0.2, 0.2);
        e.timer = Math.max(e.timer, 0.6);
      } else if (e.timer <= 0) {
        // saccade: amplitude 2–25° within ±~17° of the primary position
        const other = this.eyes[1 - s];
        const corr = this.fish.rng.next() < 0.6;
        e.tYaw = corr ? clamp(other.tYaw + this.fish.rng.range(-0.08, 0.08), -0.3, 0.3) : this.fish.rng.range(-0.3, 0.3);
        e.tPitch = this.fish.rng.range(-0.06, 0.06);
        // (calm goldfish fixate for several seconds between saccades)
        e.timer = jitterDuration(this.fish.rng, 3.4 * (1 + 1.0 * rest), 0.45);
      }
      // saccades are fast (~40–60 ms), fixations drift < 1 °/s
      e.yaw = damp(e.yaw, e.tYaw, look ? 10 : 45, dt);
      e.pitch = damp(e.pitch, e.tPitch, 30, dt);
    }
  }

  /** Fin pose consumed by FishRig (pectoral rowing is evaluated here). */
  writeFinPose(pose) {
    pose.dorsalErect = this.fins.dorsal;
    pose.analErect = this.fins.anal;
    pose.caudalSpread = this.fins.caudalSpread;
    pose.relax = this.fins.relax;
    for (let s = 0; s < 2; s++) {
      const p = this.pect[s];
      const o = pose.pect[s];
      o.ext = p.ext;
      o.brake = p.brake;
      o.stroke = Math.sin(p.phase) * p.amp * (0.4 + 0.6 * p.ext);
      o.feather = Math.cos(p.phase) * p.amp * 0.8 + p.brake * 0.6;
      o.spread = lerp(0.35, 0.95, p.ext) + p.brake * 0.2;
      const pv = pose.pelv[s];
      pv.ext = this.fins.pelvic;
      pv.spread = lerp(0.35, 0.9, this.fins.pelvic);
    }
  }
}
