import * as THREE from 'three';
import { BONE_LAYOUT } from './EdohazeRig.js';
import { MORPH, LOCO } from './EdohazeParams.js';
import { Spring, Noise1, clamp, lerp, smoothstep, damp, mulberry32, wrapAngle } from './EdohazeMath.js';

// ---------------------------------------------------------------------------
// Swimming biomechanics
//  • Body: traveling wave h(s,t) = A_tail·L·env(s)·sin(2π s/λ − φ(t)), φ̇ = 2πf.
//    Segment yaw = atan(∂h/∂x); bone local rotation = segment yaw − parent yaw.
//    Envelope rises quadratically toward the tail (subcarangiform, small head
//    recoil). Frequency/amplitude are springs driven by speed AND thrust demand,
//    so burst-and-coast hops show high-frequency beats then a straight glide.
//  • Turning: static arc curvature ∝ yaw rate (head into the turn).
//  • Fast-start (C-start): underdamped curvature spring → C-bend then counter-
//    stroke (stage 1 ≈ 40 ms, stage 2 ≈ 60 ms) + high-freq burst.
//  • Pectorals: drag-based goby fins — perch props, sculling for hover,
//    asymmetric abduction for yaw, symmetric depression for pitch, flare braking.
// ---------------------------------------------------------------------------

const SPINE = BONE_LAYOUT.spine; // Spine01..Tail
const SEG_MID = SPINE.map((b, i) => (i < SPINE.length - 1 ? 0.5 * (b.s + SPINE[i + 1].s) : 1.0));
const HEAD_S = 0.14;

export class EdohazeAnimator {
  constructor(rig, materials, opts) {
    this.rig = rig; this.mats = materials;
    this.SL = opts.SL; this.L = opts.SL * MORPH.tlOverSl;
    const seed = opts.seed | 0;
    this.rand = mulberry32(seed + 77);
    this.n = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new Noise1(seed * 13 + k));
    // body channels
    this.phase = this.rand() * 10;
    this.freq = new Spring(0, 3, 1);
    this.amp = new Spring(0, 4, 0.9);
    this.turn = new Spring(0, 5, 1);
    this.cBend = new Spring(0, 11, 0.32);       // C-start curvature (underdamped → counter-bend)
    this.headPitch = new Spring(0, 3, 1);
    this.bodyArch = new Spring(0, 3, 1);
    this.headYawLook = new Spring(0, 2.5, 1);
    // fins
    this.pec = { L: this._pecState(), R: this._pecState() };
    this.pecPhase = this.rand() * 6;
    this.d1 = new Spring(0.4, 4, 1); this.d2 = new Spring(0.6, 3, 1); this.an = new Spring(0.6, 3, 1);
    this.caudalSpread = new Spring(1, 3, 1); this.caudalBend = new Spring(0, 9, 0.7);
    this.pelvicCup = new Spring(0.3, 3, 1); this.pelvicSpread = new Spring(1, 3, 1);
    this.medianWave = 0;
    // micro
    this.ventPhase = this.rand() * 6;
    this.jaw = new Spring(0, 14, 0.8); this.operc = new Spring(0, 10, 0.8);
    this.nextCough = 20 + this.rand() * 40;
    this.flick = { L: 0, R: 0, next: { L: 1 + this.rand() * 3, R: 1 + this.rand() * 3 } };
    this.strikeT = -1; this.coughT = -1; this.cStartT = -1;
    // eyes
    this.eyes = { L: this._eyeState('L'), R: this._eyeState('R') };
    this.time = 0;
    this.prevTailYaw = 0;
    this.debug = { tailFreq: 0, tailAmp: 0, pecMode: '' };
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
  }

  _pecState() {
    return { abd: new Spring(1.0, 5, 0.9), dep: new Spring(0.3, 5, 0.9), twist: new Spring(0, 6, 0.9), spread: new Spring(1, 4, 1), wave: new Spring(0, 4, 1) };
  }
  _eyeState(side) {
    return { yaw: new Spring(0, 18, 0.95), pitch: new Spring(0, 18, 0.95), fixYaw: 0, fixPitch: 0, nextSaccade: this.rand() * 1.5, side };
  }

  triggerCStart(side) { // side +1: bend to the left (head turns left)
    this.cBend.target = 2.2 * side; this.cStartT = 0; this.cSide = side;
  }
  triggerStrike() { this.strikeT = 0; }

  /**
   * @param {number} dt
   * @param {object} kin  from EdohazeLocomotion: speed, accel, yawRate, mode, contact, inBurrow
   * @param {object} intent from EdohazeBehavior: alert, fear, pecMode, yawCorr, pitchCorr, gaze[], headPitch, lookYaw
   * @param {object} ctx  { headWorld: Matrix4 inverse etc, lod }
   */
  update(dt, kin, intent, ctx) {
    this.time += dt;
    const t = this.time;
    const L = this.L;
    const U = Math.abs(kin.speed) / L;                  // body lengths per second
    const accBL = kin.accel / L;
    const lod = ctx.lod;

    // ------------------------------------------------ body wave targets
    let drive = clamp(Math.max(U / 3.5, accBL / 30), 0, 1);
    if (kin.gliding) drive *= 0.08;
    if (kin.mode === 'perch' || kin.mode === 'burrowHold') drive = 0;
    const burst = kin.burst || 0;
    const fT = drive > 0.02 ? clamp(3 + U / 0.55 + burst * 12, 0, LOCO.maxTailFreq) : 0;
    this.freq.target = fT;
    this.freq.freq = fT > this.freq.x ? 8 : 2.5;      // spin up fast, wind down slowly
    this.amp.target = drive > 0.02 ? (0.025 + 0.075 * drive + 0.03 * burst) : 0;
    this.amp.freq = this.amp.target > this.amp.x ? 9 : 2.2;
    this.freq.update(dt); this.amp.update(dt);
    const f = Math.max(this.freq.x, 0);
    this.phase += 2 * Math.PI * f * dt;
    const A = Math.max(this.amp.x, 0);

    this.turn.target = clamp(kin.yawRate * 0.055, -0.9, 0.9);
    this.turn.update(dt);
    // C-start curvature sequencing
    if (this.cStartT >= 0) {
      this.cStartT += dt;
      if (this.cStartT > 0.04 && this.cBend.target !== 0) this.cBend.target = 0; // release → counter-stroke overshoot
      if (this.cStartT > 0.6) this.cStartT = -1;
    }
    this.cBend.update(dt);

    // micro sway (non-periodic)
    const restness = 1 - smoothstep(0.0, 0.4, drive);
    const sway = restness * 0.035 * this.n[0].fbm(t * 0.35);

    // ------------------------------------------------ body pose
    const k = 2 * Math.PI / LOCO.waveLengthBL;
    const env = (s) => 0.10 + 0.90 * Math.pow(clamp((s - 0.15) / 0.85, 0, 1), 1.8);
    const slRatio = this.SL / L;
    const slope = (s) => {
      const x = s * slRatio;                                   // in body lengths
      const e = env(s);
      const de = 0.9 * 1.8 * Math.pow(clamp((s - 0.15) / 0.85, 0, 1), 0.8) / 0.85 / slRatio; // ∂env/∂x
      const ang = k * x - this.phase;
      // ∂h/∂x with h = A·env·sin(kx − φ)  (h, x in body lengths)
      return Math.atan(A * (de * Math.sin(ang) + e * k * Math.cos(ang)));
    };
    const arc = (s) => (this.turn.x + this.cBend.x) * (0.5 - s) + sway * (0.5 - s) * 2;
    const yaw = [];
    for (let i = 0; i < SPINE.length; i++) yaw.push(slope(SEG_MID[i]) + arc(SEG_MID[i]));
    const headYaw = slope(HEAD_S) + arc(HEAD_S);

    // pitch: slight arch when perched looking up, head raise on alert/peek
    this.headPitch.target = intent.headPitch || 0; this.headPitch.update(dt);
    this.bodyArch.target = (kin.mode === 'perch' ? 0.05 : 0) + (kin.gliding ? -0.02 : 0); this.bodyArch.update(dt);
    this.headYawLook.target = clamp(intent.lookYaw || 0, -0.12, 0.12); this.headYawLook.update(dt);

    const B = this.rig.bones;
    let prev = 0;
    for (let i = 0; i < SPINE.length; i++) {
      const b = B[SPINE[i].name];
      const localYaw = yaw[i] - prev; prev = yaw[i];
      const pitch = (i === 0 ? 0 : -this.bodyArch.x * 0.25);
      this._e.set(pitch, localYaw, 0, 'YXZ');
      b.quaternion.setFromEuler(this._e);
    }
    this._e.set(-this.headPitch.x, headYaw - yaw[0] + this.headYawLook.x, 0, 'YXZ');
    B.Head.quaternion.setFromEuler(this._e);

    // ------------------------------------------------ fins
    this._pectorals(dt, kin, intent, drive, burst);
    this._median(dt, kin, intent, drive, burst, yaw);

    // ------------------------------------------------ breathing / jaw
    const stress = clamp(Math.max(intent.fear || 0, drive * 0.8, intent.exertion || 0), 0, 1);
    const fv = lerp(LOCO.ventilationHz[0], LOCO.ventilationHz[1], stress) * (1 + 0.12 * this.n[1].at(t * 0.3));
    this.ventPhase += 2 * Math.PI * fv * dt;
    const vAmp = lerp(1, 1.8, stress) * (0.85 + 0.3 * this.n[2].at(t * 0.21));
    let jawT = 0.035 * vAmp * (0.5 + 0.5 * Math.sin(this.ventPhase));
    let opT = 0.07 * vAmp * (0.5 + 0.5 * Math.sin(this.ventPhase - 1.7));
    // occasional "cough" (gill flushing) — random interval
    if (t > this.nextCough && drive < 0.1) { this.coughT = 0; this.nextCough = t + 25 + this.rand() * 50; }
    if (this.coughT >= 0) {
      this.coughT += dt; const c = this.coughT;
      jawT += 0.28 * smoothstep(0, 0.06, c) * (1 - smoothstep(0.12, 0.3, c));
      opT += 0.30 * smoothstep(0.08, 0.16, c) * (1 - smoothstep(0.22, 0.4, c));
      if (c > 0.45) this.coughT = -1;
    }
    // suction strike: rapid gape (~25 ms), late opercular abduction
    if (this.strikeT >= 0) {
      this.strikeT += dt; const c = this.strikeT;
      jawT += 0.50 * smoothstep(0, 0.025, c) * (1 - smoothstep(0.05, 0.13, c));
      opT += 0.25 * smoothstep(0.04, 0.08, c) * (1 - smoothstep(0.12, 0.25, c));
      if (c > 0.3) this.strikeT = -1;
    }
    this.jaw.target = jawT; this.operc.target = opT;
    this.jaw.update(dt); this.operc.update(dt);
    B.Jaw.rotation.set(Math.max(this.jaw.x, -0.02), 0, 0);
    B.Operc_L.rotation.set(0, -Math.max(this.operc.x, 0), 0);
    B.Operc_R.rotation.set(0, Math.max(this.operc.x, 0), 0);

    // ------------------------------------------------ eyes
    if (lod < 2) this._eyes(dt, intent, ctx);

    // fin uniforms for the active LOD only
    this._applyFinUniforms(lod);
    this.debug.tailFreq = f; this.debug.tailAmp = A;
  }

  _pectorals(dt, kin, intent, drive, burst) {
    const t = this.time;
    let mode = intent.pecMode || 'perch';
    if (burst > 0.2) mode = 'burst';
    else if (kin.gliding && kin.braking) mode = 'brake';
    else if (drive > 0.35 && mode !== 'burrow') mode = 'swim';
    this.debug.pecMode = mode;
    const yc = clamp(intent.yawCorr || 0, -1, 1), pc = clamp(intent.pitchCorr || 0, -1, 1);
    let fp = 0;
    const sides = ['L', 'R'];
    for (const side of sides) {
      const P = this.pec[side], sg = side === 'L' ? 1 : -1;
      let abd, dep, twist = 0, spread = 1, wave = 0;
      switch (mode) {
        case 'perch':
          abd = intent.freeze ? 0.75 : 1.0; dep = intent.freeze ? 0.55 : 0.42; spread = 1.1; wave = 0.02;
          break;
        case 'hover': {
          fp = 3.4 + 0.8 * this.n[3].at(t * 0.2);
          const ph = this.pecPhase + (side === 'L' ? 0 : 2.1 + 0.4 * this.n[4].at(t * 0.3));
          abd = 0.85 + 0.32 * Math.sin(ph); twist = 0.45 * Math.cos(ph); dep = 0.15; spread = 1.0; wave = 0.15;
          break;
        }
        case 'slow': {
          fp = 2.6;
          const ph = this.pecPhase + (side === 'L' ? 0 : Math.PI * 0.9);
          abd = 0.55 + 0.35 * Math.sin(ph); twist = 0.35 * Math.cos(ph); dep = 0.1; spread = 0.95; wave = 0.12;
          break;
        }
        case 'swim': abd = 0.14; dep = 0.08; spread = 0.6; break;
        case 'burst': abd = 0.03; dep = 0.02; spread = 0.45; break;
        case 'brake': abd = 1.38; dep = 0.18; spread = 1.2; wave = 0.05; break;
        case 'burrow': abd = 0.1; dep = 0.05; spread = 0.55; break;
        default: abd = 1.0; dep = 0.4;
      }
      // control: yaw via asymmetric abduction (drag on the inner fin), pitch via symmetric depression
      abd += sg * yc * 0.35; dep += pc * 0.3;
      // intermittent flicks at rest (independent L/R, random intervals)
      if ((mode === 'perch' || mode === 'hover') && !intent.freeze) {
        if (t > this.flick.next[side]) { this.flick[side] = 1; this.flick.next[side] = t + 0.6 + this.rand() * 4.5; }
        this.flick[side] = Math.max(0, this.flick[side] - dt * 5);
        const fl = Math.sin(this.flick[side] * Math.PI);
        abd += fl * 0.25; wave += fl * 0.2;
        abd += 0.04 * this.n[5 + (side === 'L' ? 0 : 1)].at(t * 1.3);
      }
      P.abd.target = abd; P.dep.target = dep; P.twist.target = twist; P.spread.target = spread; P.wave.target = wave;
      const fast = mode === 'burst' ? 25 : 7;
      P.abd.freq = fast; P.dep.freq = 6;
      for (const k of ['abd', 'dep', 'twist', 'spread', 'wave']) P[k].update(dt);
      const b = this.rig.bones[side === 'L' ? 'PectoralFin_L' : 'PectoralFin_R'];
      this._e.set(-P.dep.x, -sg * P.abd.x, sg * P.twist.x * 0.5, 'YXZ');
      b.quaternion.setFromEuler(this._e);
    }
    this.pecPhase += 2 * Math.PI * (fp || 1.2) * dt;
  }

  _median(dt, kin, intent, drive, burst, yaw) {
    const alert = clamp(intent.alert || 0, 0, 1);
    this.d1.target = burst > 0.2 ? 0.05 : lerp(0.35, 1.0, alert) * (1 - 0.5 * drive);
    this.d2.target = burst > 0.2 ? 0.25 : lerp(0.65, 1.0, alert) * (1 - 0.3 * drive);
    this.an.target = this.d2.target;
    this.d1.freq = this.d1.target > this.d1.x ? 8 : 3; // snap up, fold slower
    this.d1.update(dt); this.d2.update(dt); this.an.update(dt);
    this.caudalSpread.target = burst > 0.2 ? 0.7 : lerp(1.1, 0.8, drive) + (kin.braking ? 0.15 : 0);
    this.caudalSpread.update(dt);
    // passive fin flex lags the tail's angular velocity (fluid loading)
    const tailYaw = yaw[yaw.length - 1];
    const w = (tailYaw - this.prevTailYaw) / Math.max(dt, 1e-4); this.prevTailYaw = tailYaw;
    this.caudalBend.target = clamp(-w * 0.012, -0.35, 0.35); this.caudalBend.update(dt);
    this.pelvicCup.target = kin.contact ? 0.35 : 0.1; this.pelvicCup.update(dt);
    this.pelvicSpread.target = drive > 0.4 ? 0.75 : 1.0; this.pelvicSpread.update(dt);
    this.medianWave += dt * (2 + 4 * (intent.hoverMode ? 1 : 0));
    const B = this.rig.bones;
    B.DorsalFin1.rotation.x = -(1 - this.d1.x) * 1.4; B.DorsalFin2.rotation.x = -(1 - this.d2.x) * 1.4; B.AnalFin.rotation.x = (1 - this.an.x) * 1.4;
    B.PelvicFin.rotation.x = (1 - this.pelvicSpread.x) * 0.4;
  }

  _applyFinUniforms(lod) {
    const t = this.time;
    const mats = this.mats.fins[lod];
    for (const m of mats) {
      const u = m.userData.fin;
      switch (m.name) {
        case 'dorsal1': u.uErect.value = this.d1.x; u.uWaveAmp.value = 0.02; u.uWavePhase.value = this.medianWave * 3; break;
        case 'dorsal2': u.uErect.value = this.d2.x; u.uWaveAmp.value = 0.03 + 0.03 * this.amp.x * 10; u.uWavePhase.value = this.phase; u.uWaveK.value = 2.5; break;
        case 'anal': u.uErect.value = this.an.x; u.uWaveAmp.value = 0.03 + 0.03 * this.amp.x * 10; u.uWavePhase.value = this.phase; u.uWaveK.value = 2.5; break;
        case 'caudal':
          u.uSpread.value = this.caudalSpread.x; u.uBend.value = this.caudalBend.x;
          u.uWaveAmp.value = 0.015 + 0.02 * this.n[7].at(t * 0.7); u.uWavePhase.value = t * 5; u.uWaveK.value = 4;
          u.uCup.value = 0.04; break;
        case 'pectoralL': case 'pectoralR': {
          const P = this.pec[m.name === 'pectoralL' ? 'L' : 'R'];
          u.uSpread.value = P.spread.x; u.uWaveAmp.value = P.wave.x; u.uWavePhase.value = this.pecPhase * 1.0 + (m.name === 'pectoralR' ? 1 : 0); u.uWaveK.value = 3.5;
          u.uBend.value = -0.08 * P.abd.x; u.uTwist.value = 0.2 * P.twist.x; break;
        }
        case 'pelvic': u.uCup.value = this.pelvicCup.x; u.uSpread.value = this.pelvicSpread.x; break;
      }
    }
  }

  // Eyes: independent saccade–fixation per eye; weak pursuit of salient targets
  // in that eye's hemifield. Not a human gaze: small range, no convergence
  // except brief convergence before a strike.
  _eyes(dt, intent, ctx) {
    const t = this.time;
    for (const side of ['L', 'R']) {
      const E = this.eyes[side];
      const sg = side === 'L' ? 1 : -1;
      // choose best target in hemifield (targets are given in head-local space)
      let best = null, bw = 0;
      for (const g of intent.gaze || []) {
        const d = g.local; if (!d) continue;
        if (d.x * sg < -0.3 * Math.abs(d.z) && d.z < 0.5) continue;  // other hemifield
        const w = g.weight;
        if (w > bw) { bw = w; best = d; }
      }
      let tyaw = 0, tpitch = 0.05;
      if (best) {
        // eye yaw relative to its resting optical axis (~lateral); map world dir to small rotation
        const az = Math.atan2(best.x * sg, best.z);                // 0 = straight ahead, π/2 = lateral
        tyaw = -clamp((Math.PI / 2 - az) * 0.35, -0.3, 0.35) * sg; // forward targets rotate eye forward
        tpitch = clamp(Math.atan2(best.y, Math.hypot(best.x, best.z)) * 0.4, -0.25, 0.3);
      }
      if (intent.converge) { tyaw = -0.32 * sg; }
      // saccades: jump fixation when error large or timer expires; tiny drift in between
      const err = Math.hypot(tyaw - E.fixYaw, tpitch - E.fixPitch);
      if (t > E.nextSaccade || err > 0.12) {
        const scan = best ? 0.03 : 0.18;
        E.fixYaw = tyaw + (this.rand() - 0.5) * scan; E.fixPitch = tpitch + (this.rand() - 0.5) * scan * 0.6;
        E.nextSaccade = t + 0.4 + this.rand() * (best ? 1.2 : 2.8);
      }
      E.yaw.target = E.fixYaw + 0.01 * this.n[side === 'L' ? 3 : 4].at(t * 0.8);
      E.pitch.target = E.fixPitch;
      E.yaw.update(dt); E.pitch.update(dt);
      const b = this.rig.bones[side === 'L' ? 'Eye_L' : 'Eye_R'];
      this._e.set(0, E.yaw.x, sg * E.pitch.x, 'YXZ'); // lateral-looking eye: elevation is a roll about the head's long axis
      b.quaternion.setFromEuler(this._e);
    }
  }
}
