// Pose layer of ユビナガホンヤドカリ: everything that is not walking.
//
//  * withdrawal / emergence with per-appendage staging (the order is a game supplement [S]; the final
//    posture – right chela across the aperture, P2/P3 propodi and dactyli folded vertically on both
//    sides – is taken from the photographs [D])
//  * antennae (A2): segmented chains driven as a curve – base orientation + per-segment springs with lag,
//    droop out of water, independent non-periodic exploration sweeps for left and right
//  * antennules (A1): non-rhythmic flicks, never synchronised between sides, faster with odour
//    [Pagurus alaskensis: Snow 1973; Coenobita downstroke 0.06–0.15 s: Waldrop et al. 2016]
//  * eyestalks: whole-stalk orientation weakly tracking food / threat / moving objects, saccades with
//    fast onset and slow return, 2–5 Hz micro tremor, independent sides [Carcinus]
//  * third maxillipeds: irregular flutter, feeding strokes, antennule wiping
//  * chelipeds: rest/alert poses and IK tasks (pick, scoop sediment, bring to mouth, probe an aperture)
//  * the hidden abdomen: bones laid along the whorl centre line of the shell actually carried
import * as THREE from 'three';
import { Rig, solveChelipedIK, quatFromDir, yawFor } from './PagurusMinutusRig.js';
import { MORPH } from './PagurusMinutusMorphology.js';
import { clamp, damp, lerp, smoothstep, fbm1, noise1, Twitch, SeededRandom } from './PagurusMinutusUtil.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

/** withdrawal / emergence staging [S]: delay (s) and duration (s) per channel */
const STAGE = {
  withdraw: {
    antennules: [0.0, 0.08], antennae: [0.03, 0.18], eyes: [0.05, 0.2], body: [0.1, 0.3], legs: [0.12, 0.33], chelipeds: [0.2, 0.26],
  },
  emerge: {
    antennules: [0.0, 0.5], antennae: [0.1, 0.9], eyes: [0.45, 0.8], body: [0.9, 1.1], chelipeds: [1.2, 0.9], legs: [1.5, 0.9],
  },
};
const CHANNELS = Object.keys(STAGE.withdraw);

/** body retreat into the shell when fully withdrawn (SL) */
const RETREAT_DEPTH = 1.55;

const legFold = (leg) => {
  // P2/P3 folded in front of the aperture: propodus and long dactyl hanging vertically [D: photos]
  const s = leg.side;
  const front = leg.n === 1 ? 0.55 : 0.75;
  return { yaw: yawFor(s * front, 0.85), lift: leg.n === 1 ? 0.05 : -0.05, knee: -2.35, cp: -0.35, pd: -0.95 };
};

const CHELA_POSES = {
  // held flexed in front of the cephalothorax, chela tips near the substrate
  rest: { R: { yaw: yawFor(-0.4, 0.92), lift: 0.45, roll: 0.15, knee: -1.0, swing: -0.6, pitch: 0.42, gape: 0.04 }, L: { yaw: yawFor(0.42, 0.9), lift: 0.4, roll: 0.15, knee: -1.05, swing: -0.5, pitch: 0.38, gape: 0.06 } },
  alert: { R: { yaw: yawFor(-0.5, 0.85), lift: 0.7, roll: 0.0, knee: -0.9, swing: -0.3, pitch: 0.45, gape: 0.12 }, L: { yaw: yawFor(0.5, 0.85), lift: 0.65, roll: 0.0, knee: -0.95, swing: -0.35, pitch: 0.4, gape: 0.1 } },
  // aperture closed: major chela laid across the opening, minor tucked behind [D]
  block: { R: { yaw: yawFor(-0.15, 1.0), lift: -0.15, roll: 0.35, knee: -1.95, swing: -1.05, pitch: 0.2, gape: 0.0 }, L: { yaw: yawFor(0.2, 1.0), lift: -0.05, roll: 0.3, knee: -2.25, swing: -1.2, pitch: 0.25, gape: 0.0 } },
};
const JOINT_KEYS = ['yaw', 'lift', 'roll', 'knee', 'swing', 'pitch', 'gape'];

export class Animator {
  constructor(crab) {
    this.crab = crab;
    this.rig = crab.rig;
    const rng = (this.rng = new SeededRandom(crab.seed * 31 + 7));
    // outputs consumed by locomotion / crab
    crab.anim = { bodyLift: 0, bodyRetreat: 0, bodyPitch: 0 };
    this.retractTarget = 0;
    this.retractDir = 0;
    this.stageTime = 0;
    this.ch = {};
    for (const c of CHANNELS) this.ch[c] = 0;
    this.retract = 0;
    this.time = rng.next() * 100;
    // cheliped state
    this.chela = {};
    for (const side of ['L', 'R']) {
      const p = { ...CHELA_POSES.rest[side] };
      this.chela[side] = { cur: { ...p }, task: { mode: 'rest' }, phase: rng.next(), ikOut: { ...p } };
    }
    // antennae state
    this.ant = {};
    for (const side of ['L', 'R']) {
      const a = this.rig.antennae[side];
      const n = a.flagellum.length;
      this.ant[side] = {
        yaw: 0, pitch: 0, yawT: 0, pitchT: 0, yawV: 0, prevYaw: 0, prevPitch: 0,
        segZ: new Float32Array(n), segY: new Float32Array(n), velZ: new Float32Array(n), velY: new Float32Array(n),
        timer: rng.wait(1.2), seed: side === 'L' ? 11 : 23, lift: 0,
      };
      this.ant[side].restDir = new THREE.Vector3(1, 0, 0).applyQuaternion(a.peduncle[0].quaternion).clone();
    }
    this.flick = {};
    for (const side of ['L', 'R']) this.flick[side] = { t: -1, down: 0.1, up: 0.12, timer: rng.wait(2.5), amp: 1, rot: 0, rotT: 0 };
    this.eye = {};
    for (const side of ['L', 'R']) this.eye[side] = { off: new THREE.Vector2(), offT: new THREE.Vector2(), timer: rng.wait(1.5), seed: side === 'L' ? 5 : 9, dir: this.rig.eyes[side].restDir.clone(), dip: 0, dipT: 0 };
    this.mouth = { level: 0, phase: 0, groom: 0, groomSide: 'L' };
    this.twitchChela = new Twitch(rng, 4.5, 0.6);
    this.twitchBody = new Twitch(rng, 7, 1.4);
    this.twitchP45 = new Twitch(rng, 5, 0.8);
    this.abdomenExit = 0; // SL of abdomen pulled out of the shell (shell exchange)
    this.freeCurl = 0; // 0..1 blend toward the free (naked) abdomen curl
    this.exposedAbdomen = false;
    this.chelaContacts = { L: null, R: null };
    this.lastFlick = 0;
  }

  /** helper: world point → body frame (SL units) */
  toBody(p, out) {
    return out.copy(p).applyMatrix4(this.crab.loco.bodyMatrixInv);
  }

  setRetractTarget(r) {
    const dir = Math.sign(r - this.retractTarget);
    if (dir !== 0 && dir !== this.retractDir) {
      this.retractDir = dir;
      this.stageTime = 0;
    }
    this.retractTarget = r;
  }

  /**
   * @param {number} dt
   * @param {object} cmd animation part of the behaviour command
   * @param {object} env
   */
  update(dt, cmd, env) {
    this.time += dt;
    const lod = env.lod ?? 1;
    this.setRetractTarget(cmd.retract ?? 0);
    this.updateStaging(dt, cmd.urgent);
    const ch = this.ch;
    const crab = this.crab;
    // body retreat: body slides back into the shell, the grip point slides forward so the shell stays put
    crab.anim.bodyRetreat = -RETREAT_DEPTH * ch.body;
    crab.anim.bodyPitch = 0.18 * ch.body + (cmd.lean ?? 0);
    crab.anim.bodyLift = -0.08 * ch.body;
    const a = this.rig.shellAnchor;
    a.position.copy(this.rig.shellAnchorRest);
    a.position.z += RETREAT_DEPTH * ch.body + (cmd.anchorOffsetZ ?? 0);

    // ── walking legs: IK (from locomotion) blended toward the folded pose ───────────────────────
    const loco = crab.loco;
    for (const leg of Object.values(loco.legs)) {
      const f = legFold(leg.chain);
      const w = smoothstep(0, 1, ch.legs);
      const j = leg.joints;
      // unloaded legs (withdrawn, emerging, or not stepping) relax a little between IK and fold
      Rig.applyLeg(leg.chain, {
        yaw: lerp(j.yaw, f.yaw, w), lift: lerp(j.lift, f.lift, w), knee: lerp(j.knee, f.knee, w),
        cp: lerp(j.cp, f.cp, w), pd: lerp(j.pd, f.pd, w),
      });
    }
    // ── reduced legs P4/P5: brace inside the aperture with small adjustments ──────────────────────
    const tw = this.twitchP45.update(dt);
    for (const key of Object.keys(this.rig.reduced)) {
      const r = this.rig.reduced[key];
      const bones = [r.coxa, r.basis, r.merus, r.carpus, r.propodus, r.dactylus];
      for (let i = 0; i < bones.length; i++) bones[i].quaternion.copy(r.restQ[i]);
      Rig.setZ(r.carpus, -2.1 + 0.1 * tw * r.side + 0.15 * ch.body);
      Rig.setZ(r.propodus, -0.35 - 0.08 * tw);
    }
    // ── chelipeds ──────────────────────────────────────────────────────────────────────────────
    this.updateChelipeds(dt, cmd, env);
    // ── antennae, antennules, eyes, mouthparts ─────────────────────────────────────────────────
    if (lod < 2) {
      this.updateAntennae(dt, cmd, env);
      this.updateAntennules(dt, cmd);
      this.updateMouth(dt, cmd);
    } else this.updateAntennaeCheap(dt, cmd);
    this.updateEyes(dt, cmd);
  }

  updateStaging(dt, urgent) {
    this.stageTime += dt;
    const target = this.retractTarget;
    const withdrawing = this.retractDir > 0;
    const table = withdrawing ? STAGE.withdraw : STAGE.emerge;
    const speedScale = withdrawing ? (urgent ? 1 : 2.2) : 1;
    for (const c of CHANNELS) {
      const [delay, dur] = table[c];
      if (this.stageTime < delay * speedScale) continue;
      // partial retraction keeps body/legs/chelipeds out less than antennae/eyes
      const tgt = c === 'antennae' || c === 'antennules' || c === 'eyes' ? clamp(target * 1.6, 0, 1) : clamp((target - 0.25) / 0.75, 0, 1);
      const rate = 1 / (dur * speedScale);
      this.ch[c] += clamp(tgt - this.ch[c], -rate * dt, rate * dt);
    }
    this.retract = (this.ch.body + this.ch.legs + this.ch.chelipeds + this.ch.eyes) / 4;
  }

  /** fully withdrawn and closed */
  get closed() {
    return this.ch.chelipeds > 0.97 && this.ch.legs > 0.97 && this.ch.body > 0.97;
  }

  /** both pairs of walking legs back on the substrate (startle-assay criterion) */
  get emerged() {
    return this.ch.legs < 0.03 && this.ch.body < 0.05;
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  updateChelipeds(dt, cmd, env) {
    const crab = this.crab;
    const tw = this.twitchChela.update(dt, cmd.restless ? 2 : 1);
    const block = smoothstep(0, 1, this.ch.chelipeds);
    for (const side of ['L', 'R']) {
      const st = this.chela[side];
      const chain = this.rig.chelipeds[side];
      const task = (side === 'R' ? cmd.chelaR : cmd.chelaL) ?? { mode: cmd.alert > 0.5 ? 'alert' : 'rest' };
      st.task = task;
      let goal = { ...CHELA_POSES[task.mode === 'alert' ? 'alert' : 'rest'][side] };
      // idle micro adjustments (non-periodic)
      goal.knee += 0.06 * tw * (side === 'R' ? 1 : -0.7);
      goal.pitch += 0.05 * fbm1(this.time * 0.4, side === 'R' ? 3 : 4);
      if (task.mode === 'reach' || task.mode === 'probe' || task.mode === 'scoop' || task.mode === 'toMouth') {
        let target = task.target;
        let pitch = task.pitch ?? -0.9;
        if (task.mode === 'toMouth' || (task.mode === 'scoop' && task.toMouth)) {
          target = this.mouthWorld(_w);
          pitch = -0.15;
        }
        if (target) {
          this.toBody(target, _v);
          st.ikOut.roll = 0.05;
          st.ikOut.yaw = st.cur.yaw;
          solveChelipedIK(chain, _v, pitch, st.ikOut);
          goal = { ...st.ikOut, gape: task.gape ?? 0.05 };
          if (task.mode === 'probe') goal.gape = 0.02 + 0.06 * Math.max(0, Math.sin(this.time * 7));
        }
      }
      if (task.mode === 'hold') goal.gape = 0;
      // withdrawal overrides everything
      const bp = CHELA_POSES.block[side];
      for (const k of JOINT_KEYS) {
        const g = lerp(goal[k], bp[k], block);
        const rate = task.fast || block > 0.01 ? 22 : task.mode === 'rest' ? 5 : 9;
        st.cur[k] = damp(st.cur[k], g, rate, dt);
      }
      Rig.applyCheliped(chain, st.cur);
    }
  }

  /** world position of the mouth (between the third maxillipeds) */
  mouthWorld(out) {
    return out.set(0, -0.18, 1.02).applyMatrix4(this.crab.loco.bodyMatrix);
  }

  /** world position of a chela tip */
  chelaTipWorld(side, out) {
    return out.setFromMatrixPosition(this.rig.chelipeds[side].tip.matrixWorld);
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  updateAntennae(dt, cmd, env) {
    const exposed = !!env.exposed;
    const fold = smoothstep(0, 1, this.ch.antennae);
    const explore = cmd.explore ?? 0.5;
    const flow = env.flowLocal; // optional Vector2 in body frame
    for (const side of ['L', 'R']) {
      const st = this.ant[side];
      const a = this.rig.antennae[side];
      const s = a.side;
      // non-periodic exploration targets (log-normal intervals), independent per side
      st.timer -= dt * (0.6 + explore);
      if (st.timer <= 0) {
        st.timer = this.rng.wait(1.1 / (0.4 + explore), 0.7);
        const att = cmd.attention?.[0];
        if (att && this.rng.chance(0.55)) {
          // point toward the attended object (food, shell, threat); yaw is measured outward from rest
          this.toBody(att.pos, _v).sub(a.peduncle[0].position);
          st.yawT = clamp(Math.atan2(_v.x * s, _v.z) - 0.34, -0.6, 0.8);
          st.pitchT = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)) - 0.27, -0.45, 0.35);
        } else {
          st.yawT = (this.rng.next() - 0.45) * 0.8 * explore;
          st.pitchT = (this.rng.next() - 0.55) * 0.5 * explore;
        }
      }
      const yawGoal = lerp(st.yawT + 0.08 * fbm1(this.time * 0.7, st.seed), 2.3, fold);
      const pitchGoal = lerp(st.pitchT + 0.06 * fbm1(this.time * 0.6, st.seed + 2) + st.lift, -0.3, fold);
      st.prevYaw = st.yaw;
      st.prevPitch = st.pitch;
      st.yaw = damp(st.yaw, yawGoal, fold > 0.05 ? 18 : 3.2, dt);
      st.pitch = damp(st.pitch, pitchGoal, fold > 0.05 ? 18 : 3.2, dt);
      const yawVel = (st.yaw - st.prevYaw) / Math.max(dt, 1e-4);
      const pitchVel = (st.pitch - st.prevPitch) / Math.max(dt, 1e-4);
      // peduncle orientation
      _q.copy(a.restQ[0]);
      _q2.setFromAxisAngle(Y, st.yaw * s);
      _q.premultiply(_q2);
      a.peduncle[0].quaternion.copy(_q).multiply(_q2.setFromAxisAngle(Z, st.pitch));
      a.peduncle[1].quaternion.copy(a.restQ[1]);
      // flagellum: per-segment springs; distal segments lag behind base motion (inertia, drag), droop in air
      const n = a.flagellum.length;
      const droop = exposed ? -0.075 : -0.022;
      for (let i = 0; i < n; i++) {
        const fi = (i + 1) / n;
        const k = 140 * (1 - 0.7 * fi), c = 2 * Math.sqrt(k) * 0.55;
        let tz = droop * (0.4 + fi) + 0.02 * noise1(this.time * 0.9 + i * 0.3, st.seed + i) - pitchVel * 0.012 * fi;
        let ty = s * 0.045 * (0.3 + fi) - yawVel * 0.016 * fi + 0.025 * noise1(this.time * 0.8 + i * 0.37, st.seed + 50 + i) * fi;
        if (flow) { ty += flow.x * 0.02 * fi * s; tz += flow.y * 0.01 * fi; }
        if (fold > 0) { tz = lerp(tz, 0.0, fold); ty = lerp(ty, 0.012 * s, fold); }
        st.velZ[i] += (k * (tz - st.segZ[i]) - c * st.velZ[i]) * dt;
        st.velY[i] += (k * (ty - st.segY[i]) - c * st.velY[i]) * dt;
        st.segZ[i] += st.velZ[i] * dt;
        st.segY[i] += st.velY[i] * dt;
        const b = a.flagellum[i];
        b.quaternion.setFromAxisAngle(Y, st.segY[i]);
        b.quaternion.multiply(_q2.setFromAxisAngle(Z, st.segZ[i] + (i === 0 ? 0.05 : 0)));
      }
      // ground contact: lift the antenna if its distal half would sink into the substrate
      if (env.groundAt) {
        a.peduncle[0].updateMatrixWorld(true);
        let pen = 0;
        for (const i of [Math.floor(n * 0.5), Math.floor(n * 0.8), n - 1]) {
          _u.setFromMatrixPosition(a.flagellum[i].matrixWorld);
          pen = Math.max(pen, env.groundAt(_u.x, _u.z) + 0.15 * this.crab.SL - _u.y);
        }
        st.lift = damp(st.lift, pen > 0 ? st.lift + 0.25 : Math.max(0, st.lift - 0.05), 6, dt);
      }
    }
  }

  updateAntennaeCheap(dt, cmd) {
    const fold = this.ch.antennae;
    for (const side of ['L', 'R']) {
      const a = this.rig.antennae[side];
      const st = this.ant[side];
      st.yaw = damp(st.yaw, lerp(0.1 * fbm1(this.time * 0.5, st.seed), 1.25, fold), 4, dt);
      _q.copy(a.restQ[0]).premultiply(_q2.setFromAxisAngle(Y, st.yaw * a.side));
      a.peduncle[0].quaternion.copy(_q);
    }
  }

  updateAntennules(dt, cmd) {
    const fold = this.ch.antennules;
    const sniff = cmd.sniff ?? 0.15;
    const rate = 0.2 + 1.3 * sniff; // flicks/s [G: 0.5–1.5 with odour]
    for (const side of ['L', 'R']) {
      const st = this.flick[side];
      const a = this.rig.antennules[side];
      if (st.t < 0) {
        st.timer -= dt;
        if (st.timer <= 0 && fold < 0.2) {
          st.t = 0;
          st.down = 0.06 + 0.09 * this.rng.next();
          st.up = 0.08 + 0.12 * this.rng.next();
          st.amp = 0.6 + 0.4 * this.rng.next();
          // exponential (Poisson) intervals: never rhythmic, sides never synchronised
          st.timer = -Math.log(1 - this.rng.next() * 0.98) / rate;
          this.lastFlick = this.time;
        }
      }
      let flick = 0;
      if (st.t >= 0) {
        st.t += dt;
        if (st.t < st.down) flick = Math.sin((st.t / st.down) * Math.PI * 0.5);
        else if (st.t < st.down + st.up) flick = Math.cos(((st.t - st.down) / st.up) * Math.PI * 0.5);
        else st.t = -1;
      }
      // slow rotation of the peduncle toward the attended side ("antennular gaze")
      st.rotT = cmd.attention?.[0] ? clamp(this.toBody(cmd.attention[0].pos, _v).x * a.side * 0.3, -0.4, 0.4) : 0.15 * fbm1(this.time * 0.3, side === 'L' ? 31 : 37);
      st.rot = damp(st.rot, st.rotT, 2, dt);
      const [b0, b1, b2, fl] = a.chain;
      b0.quaternion.copy(a.restQ[0]).multiply(_q.setFromAxisAngle(Y, st.rot * a.side)).multiply(_q2.setFromAxisAngle(Z, -0.9 * fold));
      b1.quaternion.copy(a.restQ[1]).multiply(_q.setFromAxisAngle(Z, -0.5 * fold));
      b2.quaternion.copy(a.restQ[2]).multiply(_q.setFromAxisAngle(Z, -0.18 * flick * st.amp));
      fl.quaternion.copy(a.restQ[3]).multiply(_q.setFromAxisAngle(Z, -0.75 * flick * st.amp - 0.4 * fold));
    }
  }

  updateEyes(dt, cmd) {
    const fold = smoothstep(0, 1, this.ch.eyes);
    for (const side of ['L', 'R']) {
      const st = this.eye[side];
      const e = this.rig.eyes[side];
      // weak tracking: blend 35 % of the way toward the strongest attended object on this side
      let goal = _v.copy(e.restDir);
      const att = cmd.attention ?? [];
      let best = null, bw = 0;
      for (const at of att) {
        const w = at.w * (at.kind === 'threat' ? 1.4 : at.kind === 'food' ? 1.0 : 0.8);
        if (w > bw) { bw = w; best = at; }
      }
      if (best) {
        this.toBody(best.pos, _w).sub(e.stalk.position).normalize();
        goal.lerp(_w, clamp(0.35 * bw, 0, 0.5)).normalize();
      }
      // saccades: fast onset, slow return
      st.timer -= dt;
      if (st.timer <= 0) {
        st.timer = this.rng.wait(1.6, 0.8);
        st.offT.set((this.rng.next() - 0.5) * 0.32, (this.rng.next() - 0.5) * 0.18);
        // now and then one stalk alone is pulled down and slowly raised again [G] Carcinus
        if (this.rng.next() < 0.05) st.dipT = 0.45 + 0.35 * this.rng.next();
      }
      st.dip = damp(st.dip, st.dipT, st.dipT > st.dip ? 22 : 2.2, dt);
      st.dipT *= Math.exp(-dt * 5);
      st.off.x = damp(st.off.x, st.offT.x, Math.abs(st.offT.x) > Math.abs(st.off.x) ? 28 : 3, dt);
      st.off.y = damp(st.off.y, st.offT.y, Math.abs(st.offT.y) > Math.abs(st.off.y) ? 28 : 3, dt);
      st.offT.multiplyScalar(Math.exp(-dt * 0.8));
      // 2–5 Hz tremor (tiny)
      const tr = 0.004 * Math.sin(this.time * 2 * Math.PI * (3.1 + (side === 'L' ? 0 : 0.7)) + noise1(this.time, st.seed) * 2);
      _u.set(goal.x + st.off.x * e.side, goal.y + st.off.y + tr, goal.z).normalize();
      // withdrawal: stalks lowered and swung back along the shield
      _w.set(e.side * 0.55, -0.35, 0.45).normalize();
      _u.lerp(_w, Math.max(fold, st.dip)).normalize();
      st.dir.lerp(_u, 1 - Math.exp(-dt * 30)).normalize();
      quatFromDir(st.dir, Y, e.stalk.quaternion);
    }
  }

  updateMouth(dt, cmd) {
    const m = this.mouth;
    const feeding = cmd.mouth ?? 0;
    m.level = damp(m.level, feeding, 4, dt);
    m.phase += dt * (1.2 + 2.6 * m.level) * (0.85 + 0.3 * noise1(this.time * 0.5, 71));
    // rare antennule wiping by the maxillipeds while idle [G: Snow 1973 "wiping"]
    if (m.groom <= 0 && feeding < 0.1 && this.rng.chance(dt * 0.03)) { m.groom = 1.4; m.groomSide = this.rng.chance(0.5) ? 'L' : 'R'; }
    m.groom = Math.max(0, m.groom - dt);
    for (const side of ['L', 'R']) {
      const mx = this.rig.mxp3[side];
      const sgn = side === 'L' ? 0 : Math.PI * 0.85;
      const flutter = 0.05 * noise1(this.time * 2.3, side === 'L' ? 3 : 4);
      const stroke = m.level * 0.32 * Math.max(0, Math.sin(m.phase * 2 * Math.PI + sgn));
      const groom = m.groom > 0 && m.groomSide === side ? Math.sin((1.4 - m.groom) / 1.4 * Math.PI) : 0;
      mx.chain[0].quaternion.copy(mx.restQ[0]).multiply(_q.setFromAxisAngle(Z, 0.25 * groom - 0.15 * this.ch.body));
      mx.chain[1].quaternion.copy(mx.restQ[1]).multiply(_q.setFromAxisAngle(Z, -stroke - flutter - 0.4 * groom));
      mx.chain[2].quaternion.copy(mx.restQ[2]).multiply(_q.setFromAxisAngle(Z, -stroke * 0.6 + flutter));
      if (mx.chain[3]) mx.chain[3].quaternion.copy(mx.restQ[3]).multiply(_q.setFromAxisAngle(Y, 0.2 * stroke * mx.side));
    }
    if (m.groom > 0) {
      // the wiped antennule bends down toward the mouthparts
      const a = this.rig.antennules[m.groomSide];
      a.chain[1].quaternion.multiply(_q.setFromAxisAngle(Z, -0.7 * Math.sin((1.4 - m.groom) / 1.4 * Math.PI)));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Lay the abdomen along the whorl of the carried shell. Called after the shell transform is known.
   * The first `abdomenExit` SL of the abdomen are outside the shell and follow a free dextral curl instead.
   */
  poseAbdomen() {
    const crab = this.crab;
    const shell = crab.shell;
    const ab = this.rig.abdomen;
    const n = ab.length;
    const segL = this.rig.abdomenSegLen;
    const SL = crab.SL;
    const bodyInv = crab.loco.bodyMatrixInv;
    const base = ab[0].position; // body frame
    const shellM = shell && crab.shellMode !== 'none' ? shell.object3D.matrixWorld : null;
    const exit = this.abdomenExit;
    const curl = this.freeCurl;
    // where the abdomen enters the tube: while seated, the path point closest to the abdomen base;
    // when partly pulled out (shell exchange), the aperture seat itself
    let u0 = 0;
    const seatB = new THREE.Vector3();
    if (shellM) {
      seatB.setFromMatrixPosition(shellM).applyMatrix4(bodyInv);
      if (exit <= 1e-3) {
        let best = Infinity;
        for (let k = 0; k <= 24; k++) {
          const u = (k / 24) * shell.abdomenPath.total * 0.5;
          shell.abdomenPath(u, _v).applyMatrix4(shellM).applyMatrix4(bodyInv);
          const d = _v.distanceToSquared(base);
          if (d < best) { best = d; u0 = u; }
        }
      }
    }
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const arc = i * segL; // SL from the base
      const pFree = this.freeCurlPoint(arc, new THREE.Vector3()).add(base);
      if (!shellM || curl >= 0.999) { pts.push(pFree); continue; }
      let p;
      if (arc < exit) {
        // naked part spanning from the body to the aperture, sagging under its own weight
        const f = arc / Math.max(1e-4, exit);
        p = new THREE.Vector3().lerpVectors(base, seatB, f);
        p.y -= Math.sin(Math.PI * f) * Math.min(0.5, exit * 0.18);
      } else {
        const u = u0 + (arc - exit) * SL;
        p = shell.abdomenPath(Math.min(u, shell.abdomenPath.total), new THREE.Vector3()).applyMatrix4(shellM).applyMatrix4(bodyInv);
      }
      pts.push(p.lerp(pFree, curl));
    }
    pts[0].copy(base);
    // orient bones along the polyline. At the base the abdomen's dorsum faces the apex like the
    // cephalothorax; deeper in, the pleon twists so its broad side follows the whorl's long axis
    // (dextral torsion), and each segment is squeezed to the lumen half-widths along its own axes.
    const AB = MORPH.abdomen;
    const axisB = _u.set(0, 1, 0);
    const radial = new THREE.Vector3(), radialB = new THREE.Vector3(), up = new THREE.Vector3();
    const yAx = new THREE.Vector3(), zAx = new THREE.Vector3();
    if (shellM) axisB.transformDirection(shellM).transformDirection(bodyInv).normalize();
    for (let i = 0; i < n; i++) {
      const dir = _v.subVectors(pts[i + 1], pts[i]);
      if (dir.lengthSq() < 1e-10) dir.set(0, 0, -1);
      ab[i].position.copy(pts[i]);
      const arc = (i + 0.5) * segL;
      const inside = shellM && arc >= exit && curl < 0.5;
      let lum = null;
      up.copy(axisB);
      if (inside) {
        const u = u0 + (arc - exit) * SL;
        lum = shell.abdomenPath.lumenAt(u, radial);
        radialB.copy(radial).transformDirection(shellM).transformDirection(bodyInv).normalize();
        up.lerp(radialB, smoothstep(0.05, 0.45, i / n)).normalize();
      }
      quatFromDir(dir, up, ab[i].quaternion);
      let ky = 1, kz = 1;
      if (lum) {
        yAx.set(0, 1, 0).applyQuaternion(ab[i].quaternion);
        zAx.set(0, 0, 1).applyQuaternion(ab[i].quaternion);
        const ra = lum.ra / SL, rb = lum.rb / SL;
        const half = (d) => 1 / Math.sqrt(Math.pow(d.dot(radialB) / ra, 2) + Math.pow(d.dot(axisB) / rb, 2) + 1e-9);
        const r = lerp(AB.radiusBase, AB.radiusEnd, Math.pow((i + 0.5) / n, 0.9));
        ky = clamp((0.88 * half(yAx)) / (r * AB.flatten), 0.3, 1);
        kz = clamp((0.88 * half(zAx)) / (r * 1.1), 0.3, 1);
      }
      ab[i].scale.set(1, ky, kz);
    }
    const lastLen = pts[n].distanceTo(pts[n - 1]);
    this.rig.telson.position.set(Math.min(lastLen, segL * 1.3), 0, 0);
    ab[0].parent.updateMatrixWorld(true);
    this.exposedAbdomen = exit > 0.1 || curl > 0.1;
  }

  /** free curl of a naked abdomen (shell exchange): coils under and to the right of the body [G] */
  freeCurlPoint(arc, out) {
    const R = 0.75;
    const a = arc / R;
    // starts going backward, curls down and to the animal's right (−X) – dextral
    return out.set(-0.35 * (1 - Math.cos(a)) * R - 0.04 * arc, -Math.sin(a) * R * 0.85 - 0.1 * arc, -Math.sin(a) * R * 0.9 - 0.15 * arc * 0.2);
  }
}

export { RETREAT_DEPTH };
