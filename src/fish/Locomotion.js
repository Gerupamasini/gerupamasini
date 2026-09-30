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
//  * Burst-and-coast intermittent swimming, pectoral sculling during hovering
//    (fins are never still: hovering costs ~2× RMR), pectoral braking.
//  * Buccal–opercular ventilation (mouth leads operculum), ~70–110 min⁻¹.
//  * Horizontal saccades 2–25° with independent eyes (Easter 1971; Mensh 2004).

import * as THREE from 'three';
import { NS } from './RigLayout.js';
import { TAU, clamp, lerp, damp, dampAngle, wrapAngle, smoothstep, jitterDuration } from '../core/math.js';
import { fbm1 } from '../core/random.js';

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

    // tail wave
    this.phase = r.range(0, TAU);
    this.freq = 1.0;
    this.amp = 0.015; // tail-tip amplitude, SL units
    this.waveLen = 0.95 * r.range(0.95, 1.05);
    this.gait = 'hover';
    this.coast = false;
    this.coastTimer = 0;
    this.burstBeats = 0;
    this.lastPhaseCycle = 0;
    this.brakeLevel = 0;
    this.exertion = 0; // accumulates with fast swimming -> faster breathing

    // individual motor signature
    this.sig = {
      freqMul: r.range(0.92, 1.08),
      ampMul: r.range(0.9, 1.1),
      turnAgility: r.range(0.85, 1.2) * (0.8 + 0.4 * (P.activity ?? 1) * 0.5),
      burstCoastBias: r.range(0.3, 0.85),
      noiseSeed: r.range(0, 1000),
      pectFreq: r.range(1.4, 2.3), // hovering pectoral beat (Hz)
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
    };

    // heading history for caudally propagating turns
    this.hT = new Float32Array(HIST);
    this.hYaw = new Float32Array(HIST);
    this.hPitch = new Float32Array(HIST);
    this.hHead = 0;
    this.hCount = 0;

    // pectorals / fins
    this.pect = [
      { phase: r.range(0, TAU), amp: 0.3, ext: 0.7, brake: 0 },
      { phase: r.range(0, TAU), amp: 0.3, ext: 0.7, brake: 0 },
    ];
    this.fins = { dorsal: 1, anal: 1, caudalSpread: 0.85, pelvic: 0.6 };

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

    // ---------------------------------------------------------- C-start
    let cBend = 0;
    if (this.cstart) {
      cBend = this._updateCStart(dt);
    }

    // ---------------------------------------------------------- steering
    if (!this.cstart) {
      const d = cmd.dir;
      const targetYaw = Math.atan2(-d.z, d.x);
      const horiz = Math.hypot(d.x, d.z);
      const targetPitch = clamp(Math.atan2(d.y, horiz) * 0.85 + cmd.pitchBias + this.yawnLevel * 0.16, -1.05, 1.0);
      const err = wrapAngle(targetYaw - this.yaw);
      const U = this.speed / SL;
      // routine turn rates: ~115 °/s hovering .. ~300 °/s swimming (koi: 88–1050 °/s)
      const wMax = lerp(2.0, 5.2, clamp(U / 2.2, 0, 1)) * sig.turnAgility * (1 + cmd.urgency * 0.9);
      const wTarget = clamp(err * (2.6 + cmd.urgency * 2), -wMax, wMax);
      const aMax = 26 * (1 + cmd.urgency);
      this.yawRate += clamp(wTarget - this.yawRate, -aMax * dt, aMax * dt);
      // wandering micro-heading noise (never a perfectly straight line)
      const n = fbm1(time * 0.35 + sig.noiseSeed, 2) * 0.12 * (1 - cmd.hoverPrecision);
      this.yaw = wrapAngle(this.yaw + (this.yawRate + n) * dt);
      this.pitch = dampAngle(this.pitch, targetPitch, 2.2 + cmd.urgency * 2, dt);
    }
    const bankTarget = clamp(-this.yawRate * (this.speed / SL) * 0.05, -0.3, 0.3) + fbm1(time * 0.23 + sig.noiseSeed * 1.3, 2) * 0.03;
    this.roll = damp(this.roll, bankTarget, 3, dt);

    // ---------------------------------------------------------- gait / speed
    const U = this.speed / SL;
    let brake = cmd.brake || this.override.brake || (U > desiredSpeedBL * 1.6 + 0.25 && !this.cstart);
    this.brakeLevel = damp(this.brakeLevel, brake ? 1 : 0, brake ? 10 : 4, dt);

    let targetF;
    let targetA;
    let prodSpeed;
    if (this.cstart && this.cstart.t < this.cstart.latency + this.cstart.s1 + this.cstart.s2) {
      targetF = this.freq;
      targetA = this.amp;
      prodSpeed = this.speed / SL;
      this.gait = 'cstart';
    } else if (this.cstart) {
      // post-escape burst swimming
      const k = 1 - smoothstep(0, this.cstart.burst, this.cstart.t - this.cstart.latency - this.cstart.s1 - this.cstart.s2);
      const burstU = lerp(Math.max(desiredSpeedBL, 1.5), 7.5, k);
      targetF = (4 / 3) * (burstU + 1) * sig.freqMul;
      targetA = 0.1;
      prodSpeed = burstU;
      this.gait = 'burst';
    } else if (desiredSpeedBL < 0.22 || brake) {
      // hovering / slow pectoral swimming; tail makes small corrective sweeps
      this.gait = brake ? 'brake' : 'hover';
      const corr = 0.5 + 0.5 * Math.max(0, fbm1(time * 0.4 + sig.noiseSeed * 2.1, 2));
      targetF = lerp(0.75, 1.3, corr) * sig.freqMul;
      targetA = (0.008 + 0.014 * corr) * (brake ? 1.8 : 1);
      prodSpeed = desiredSpeedBL;
      this.coast = false;
    } else {
      // swimming, optionally intermittent (burst-and-coast)
      const accel = clamp(desiredSpeedBL - U, 0, 3);
      const uCmd = desiredSpeedBL + accel * 0.9; // thrust overdrive while accelerating
      const useBC = desiredSpeedBL > 0.35 && desiredSpeedBL < 2.2 && sig.burstCoastBias > 0.35;
      if (useBC) {
        // count completed tail beats to end a burst of 1–3 beats
        const cyc = Math.floor(this.phase / TAU);
        if (!this.coast && cyc !== this.lastPhaseCycle) {
          this.burstBeats++;
          if (this.burstBeats >= this.burstTarget && U > desiredSpeedBL * 0.95) {
            this.coast = true;
            this.coastTimer = 0;
          }
        }
        this.lastPhaseCycle = cyc;
        if (this.coast) {
          this.coastTimer += dt;
          if (U < desiredSpeedBL * lerp(0.55, 0.8, sig.burstCoastBias) || this.coastTimer > 2.5 || accel > 0.6) {
            this.coast = false;
            this.burstBeats = 0;
            this.burstTarget = 1 + Math.floor(this.fish.rng.range(0, 3));
          }
        }
      } else this.coast = false;
      if (this.burstTarget === undefined) this.burstTarget = 2;
      targetF = Math.max(1.25, (4 / 3) * (uCmd * (this.coast ? 0.5 : 1.12) + 1)) * sig.freqMul;
      targetA = 0.1 * clamp(0.18 + (0.82 * (targetF - 1.33)) / 3.67, 0.16, 1.0) * sig.ampMul;
      if (this.coast) targetA *= 0.12;
      prodSpeed = this.coast ? 0 : uCmd * (useBC ? 1.12 : 1);
      this.gait = this.coast ? 'coast' : U > 2.5 ? 'cruise-fast' : 'swim';
    }
    if (this.override.enabled) {
      targetF *= this.override.freqMul;
      targetA *= this.override.ampMul;
    }
    targetF *= this.globalMul.freq;
    targetA *= this.globalMul.amp;
    targetF = Math.min(targetF, 14);
    targetA = Math.min(targetA, 0.13);
    this.freq = damp(this.freq, targetF, 5, dt);
    this.amp = damp(this.amp, targetA, targetA > this.amp ? 7 : 3, dt);
    this.phase += TAU * this.freq * dt;

    // speed dynamics
    if (!(this.cstart && this.cstart.t < this.cstart.latency + this.cstart.s1 + this.cstart.s2)) {
      let tau = 0.45;
      let target = prodSpeed * SL;
      if (this.coast) tau = 1.6; // glide
      if (brake) {
        tau = 0.28;
        target = desiredSpeedBL * SL * 0.5;
      }
      if (this.gait === 'hover') tau = 0.9;
      this.speed = damp(this.speed, target, 1 / tau, dt);
    }
    this.exertion = Math.min(1, this.exertion + dt * 0.02 * Math.max(0, U - 1.5));

    // ---------------------------------------------------------- integrate
    this.quat.setFromEuler(_e.set(0, this.yaw, 0, 'YXZ'));
    _q.setFromAxisAngle(Z, this.pitch);
    this.quat.multiply(_q);
    _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.roll);
    this.quat.multiply(_q);
    const fwd = forwardFromYawPitch(this.yaw, this.pitch, new THREE.Vector3());
    // hovering fish drift slowly (pectoral sculling is not perfectly balanced)
    const drift = new THREE.Vector3(
      fbm1(time * 0.11 + sig.noiseSeed * 3.3, 2),
      fbm1(time * 0.09 + sig.noiseSeed * 4.1, 2) * 0.6,
      fbm1(time * 0.1 + sig.noiseSeed * 5.7, 2)
    ).multiplyScalar(0.012 * SL * (this.gait === 'hover' ? 1 : 0.3) * (1 - cmd.hoverPrecision * 0.8));
    this.vel.copy(fwd).multiplyScalar(this.speed).add(drift);
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
      yawFrac = 1;
      if (t > e2 + c.burst) {
        this.cstart = null;
        this.yawRate = 0;
      }
    }
    this.yaw = wrapAngle(c.yaw0 + c.side * c.total * yawFrac);
    this.pitch = c.pitch0 + c.pitchKick * Math.min(1, yawFrac);
    this.yawRate = 0;
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
    for (let i = 0; i < NS; i++) {
      const s = i * ds;
      // Videler–Hess amplitude envelope (normalised to 1 at the tail)
      const env = (0.02 - 0.0825 * s + 0.1625 * s * s) / 0.1;
      const denv = (-0.0825 + 0.325 * s) / 0.1;
      const arg = k * s - this.phase;
      const slope = A * (denv * Math.sin(arg) + env * k * Math.cos(arg));
      let yawA = Math.atan(slope);
      let pitchA = 0;
      // caudally propagating turn: follow the delayed heading
      if (s > S_ANCHOR) {
        const [hy, hp] = this._history(((s - S_ANCHOR) * SL) / U, time);
        yawA += clamp(wrapAngle(hy - this.yaw), -1.1, 1.1);
        pitchA += clamp(hp - this.pitch, -0.5, 0.5) * 0.7;
      } else {
        yawA += this.yawRate * 0.05 * ((S_ANCHOR - s) / S_ANCHOR);
      }
      // C-start: constant curvature C-shape
      yawA += -cBend * (s - S_ANCHOR);
      // postural micro-adjustments (tiny, slow, individual)
      yawA += fbm1(time * 0.31 + n1 + s * 0.8, 2) * 0.025 * (s - S_ANCHOR);
      pitchA += fbm1(time * 0.27 + n1 * 1.7 + s * 0.5, 2) * 0.02 * (s - S_ANCHOR);
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
    const U = this.speed / this.SL;
    const fear = cmd.finsClamped;
    const hover = this.gait === 'hover';
    const fast = smoothstep(0.8, 2.5, U);
    const pectFold = smoothstep(0.25, 1.4, U); // pectorals adduct already at moderate speed
    // dorsal: erect when slow / manoeuvring, lowered at speed, clamped in fear
    const dorsalT = clamp(1 - 0.45 * fast - 0.65 * fear + 0.1 * this.brakeLevel, 0.15, 1);
    const yl = this.yawnLevel; // a yawn erects every fin ("stretch")
    this.fins.dorsal = damp(this.fins.dorsal, this.cstart ? 0.35 : lerp(dorsalT, 1.18, yl), 4, dt);
    this.fins.anal = damp(this.fins.anal, lerp(clamp(1 - 0.35 * fast - 0.4 * fear, 0.3, 1), 1.1, yl), 4, dt);
    const spreadT = 0.82 + 0.35 * this.brakeLevel + 0.15 * Math.abs(this.yawRate) / 3 - 0.3 * fear + (this.gait === 'burst' ? 0.2 : 0) - (hover ? 0.1 : 0);
    this.fins.caudalSpread = damp(this.fins.caudalSpread, lerp(clamp(spreadT, 0.45, 1.35), 1.3, yl), 5, dt);
    this.fins.pelvic = damp(this.fins.pelvic, lerp(clamp(0.75 - 0.6 * fast + 0.4 * this.brakeLevel - 0.3 * fear, 0.05, 1), 1.0, yl), 4, dt);

    // pectorals: sculling while hovering, adducted at speed, flared to brake,
    // inner fin extended as a pivot during turns
    for (let s = 0; s < 2; s++) {
      const p = this.pect[s];
      const side = s === 0 ? 1 : -1;
      const turnInner = clamp(-this.yawRate * side * 0.25, 0, 0.4); // left fin is the inner (pivot) fin in left turns (yawRate < 0)
      const extT = lerp(clamp(lerp(0.85, 0.06, pectFold) + turnInner - fear * 0.4, 0.04, 1), 1.0, yl);
      p.ext = damp(p.ext, this.cstart ? 0.05 : extT, 6, dt);
      p.brake = damp(p.brake, this.brakeLevel * 0.9, 8, dt);
      const f = sig.pectFreq * (hover ? 1 : 1.25) * (1 + 0.1 * fbm1(time * 0.5 + sig.noiseSeed + s * 7, 1));
      // alternating strokes with slowly drifting phase relation
      p.phase += TAU * f * dt;
      const ampT = ((hover ? 0.42 : 0.25) * (1 - fast) + this.brakeLevel * 0.25 + cmd.hoverPrecision * 0.15) * (1 - 0.85 * yl);
      p.amp = damp(p.amp, ampT, 3, dt);
    }
    // phase coupling: pectorals tend toward antiphase while hovering
    const dphi = wrapAngle(this.pect[0].phase - this.pect[1].phase - Math.PI);
    this.pect[0].phase -= dphi * 0.3 * dt;
    this.pect[1].phase += dphi * 0.3 * dt;
  }

  _updateHead(dt, time) {
    const sig = this.sig;
    // ---- ventilation
    const rate = sig.breathRate * this.globalMul.breath * (1 + 0.6 * this.exertion) * (1 + 0.08 * fbm1(time * 0.2 + sig.noiseSeed, 2));
    this.breathPhase += TAU * rate * dt;
    const bp = this.breathPhase;
    const breathAmp = 1 + 0.9 * this.exertion;
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
        // both eyes rotate toward the snout (convergence) for targets ahead
        e.tYaw = clamp(0.38 * Math.cos(localYaw), -0.2, 0.4);
        e.tPitch = clamp((toT.y / (toT.length() + 1e-4)) * 0.4, -0.2, 0.2);
      } else if (e.timer <= 0) {
        // saccade: amplitude 2–25° within ±~17° of the primary position
        const other = this.eyes[1 - s];
        const corr = this.fish.rng.next() < 0.6;
        e.tYaw = corr ? clamp(other.tYaw + this.fish.rng.range(-0.08, 0.08), -0.3, 0.3) : this.fish.rng.range(-0.3, 0.3);
        e.tPitch = this.fish.rng.range(-0.06, 0.06);
        e.timer = jitterDuration(this.fish.rng, 2.0, 0.6);
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
