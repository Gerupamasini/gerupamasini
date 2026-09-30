import * as THREE from 'three';
import { MORPH, LOCO, HABITAT } from './EdohazeParams.js';
import { clamp, lerp, smoothstep, wrapAngle, damp } from './EdohazeMath.js';

// ---------------------------------------------------------------------------
// Rigid-body kinematics of the fish on the mudflat.
// Behaviour issues *motor commands*; this module turns them into physically
// plausible motion with goby-specific gaits:
//   perch     : resting on pelvic disc + pectorals, can pivot slowly with fins
//   hop       : saltatory move = orient → launch (tail beats) → glide → settle
//   swim      : continuous low-altitude swimming (approach, follow-through)
//   hover     : station holding ≤ 1.5 BL above bottom with pectoral sculling
//   escape    : C-start turn (≈40 ms) + burst, then glide
//   burrow    : constrained to the burrow shaft centre-line
// Outputs kinematic state used by the animator.
// ---------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);

export class EdohazeLocomotion {
  constructor(fish, world) {
    this.fish = fish; this.world = world;
    this.SL = fish.SL; this.L = fish.SL * MORPH.tlOverSl;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.prevYaw = 0; this.yawRate = 0; this.speed = 0; this.accel = 0; this.prevSpeed = 0;
    this.contact = true; this.mode = 'perch';
    this.cmd = { type: 'perch' };
    this.hop = null;
    this.escape = null;
    this.burrow = null; // { b, d, dir: +1 in / -1 out, headIn }
    this.gliding = false; this.braking = false; this.burst = 0;
    this.restClear = 0.085 * this.SL;        // axis height above substrate when perched
    this.groundN = new THREE.Vector3(0, 1, 0);
    this.quat = new THREE.Quaternion();
    this.hidden = false;
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._e = new THREE.Euler();
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
  }
  ground(x, z) { return this.world.getGroundHeight(x, z); }
  heightAboveBottom() { return this.pos.y - this.ground(this.pos.x, this.pos.z); }

  place(p, yaw) {
    this.pos.copy(p); this.pos.y = this.ground(p.x, p.z) + this.restClear; this.yaw = yaw; this.prevYaw = yaw;
  }

  setCommand(cmd) {
    const prev = this.cmd;
    this.cmd = cmd;
    if (cmd.type === 'hop' && (!this.hop || prev.type !== 'hop' || prev.target !== cmd.target)) this._startHop(cmd);
    if (cmd.type === 'escape' && prev.type !== 'escape') this._startEscape(cmd);
    if (cmd.type === 'burrow' && (prev.type !== 'burrow' || prev.burrow !== cmd.burrow || prev.targetD !== cmd.targetD ||
        prev.headIn !== cmd.headIn || prev.speed !== cmd.speed)) this._startBurrow(cmd);
  }

  _startHop(cmd) {
    this.hop = { phase: 'orient', t: 0, target: cmd.target.clone(), urgency: cmd.urgency ?? 0.3, arc: 0.25 + Math.random() * 0.3, done: false };
  }
  _startEscape(cmd) {
    const dir = cmd.dir.clone().setY(0).normalize();
    const want = Math.atan2(dir.x, dir.z);
    const turn = wrapAngle(want - this.yaw);
    this.escape = { t: 0, yaw0: this.yaw, turn, side: Math.sign(turn) || 1, peak: LOCO.burstBLs * this.L * (0.7 + 0.3 * (cmd.intensity ?? 1)) };
    this.fish.animator.triggerCStart(this.escape.side);
  }
  _startBurrow(cmd) {
    const keep = this.burrow && this.burrow.b === cmd.burrow;
    this.burrow = { b: cmd.burrow, d: cmd.startD ?? -0.02, dir: cmd.dir ?? 1, speed: cmd.speed ?? 0.08, headIn: cmd.headIn ?? true, target: cmd.targetD,
      blendFrom: this.pos.clone(), blend: keep ? 0 : 1 };
  }

  update(dt) {
    const L = this.L;
    const c = this.cmd;
    this.gliding = false; this.braking = false;
    if (c.type !== 'burrow') this.hidden = false;
    let targetBurst = 0;
    const g = this.ground(this.pos.x, this.pos.z);
    this.world.getGroundNormal(this.pos.x, this.pos.z, this.groundN);
    const fwd = this.forward(this._v);

    switch (c.type) {
      case 'perch': case 'freeze': {
        this.vel.multiplyScalar(Math.exp(-dt * 8));
        if (c.faceYaw !== undefined) this._turnToward(c.faceYaw, (c.turnRate ?? 1.2), dt);
        this.pos.addScaledVector(this.vel, dt);
        this._alignToGround(dt, c.headUp ?? 0.03);
        this.pos.y = damp(this.pos.y, Math.max(this.restY, g - 0.002) + this.restClear, 10, dt);
        this.contact = true; this.mode = 'perch';
        break;
      }
      case 'hover': {
        const h = clamp(c.height ?? 0.8, 0.3, HABITAT.maxHoverHeightBL) * L;
        const tgt = c.target || this.pos;
        const to = this._v2.copy(tgt).sub(this.pos).setY(0);
        const dist = to.length();
        const want = dist > 0.004 ? to.multiplyScalar(Math.min(0.5 * L, dist * 2) / dist) : to.set(0, 0, 0);
        this.vel.x = damp(this.vel.x, want.x, 3, dt); this.vel.z = damp(this.vel.z, want.z, 3, dt);
        this.vel.y = damp(this.vel.y, (g + h - this.pos.y) * 3, 4, dt);
        if (c.faceYaw !== undefined) this._turnToward(c.faceYaw, 1.5, dt);
        this.pos.addScaledVector(this.vel, dt);
        this.contact = false; this.mode = 'hover';
        this.pitch = damp(this.pitch, clamp(this.vel.y / L * 0.2, -0.2, 0.2), 3, dt); this.roll = damp(this.roll, 0, 3, dt);
        break;
      }
      case 'hop': this._updateHop(dt, g); break;
      case 'swim': {
        const tgt = c.target;
        const to = this._v2.copy(tgt).sub(this.pos);
        const dist = to.length();
        const spd = (c.speed ?? 1.5) * L * smoothstep(0, 1.5 * L, dist);
        const wantYaw = Math.atan2(to.x, to.z);
        const maxRate = 2.5 + 4 * (c.urgency ?? 0);
        this._turnToward(wantYaw, maxRate, dt);
        const f = this.forward(this._v);
        const cur = this.vel.dot(f);
        const a = clamp((spd - cur) * 6, -12 * L, (20 + 40 * (c.urgency ?? 0)) * L);
        const nv = cur + a * dt;
        this.vel.copy(f).multiplyScalar(nv);
        const hTarget = clamp(c.height ?? 0.4, 0.15, HABITAT.maxHoverHeightBL) * L;
        const ty = Math.max(tgt.y, g + hTarget);
        this.pitch = damp(this.pitch, clamp(Math.atan2(ty - this.pos.y, Math.max(dist, L)), -0.5, 0.5), 5, dt);
        this.pos.addScaledVector(this.vel, dt);
        this.contact = false; this.mode = 'swim';
        this.roll = damp(this.roll, clamp(-this.yawRate * 0.05, -0.3, 0.3), 5, dt);
        break;
      }
      case 'escape': targetBurst = this._updateEscape(dt, g); break;
      case 'burrow': this._updateBurrow(dt); break;
    }

    // substrate constraint (never sink into mud except inside a burrow)
    if (c.type !== 'burrow') {
      const gg = this.ground(this.pos.x, this.pos.z);
      if (this.pos.y < gg + this.restClear * 0.9) { this.pos.y = gg + this.restClear * 0.9; if (this.vel.y < 0) this.vel.y = 0; }
      const wy = this.world.getWaterLevel();
      if (this.pos.y > wy - 0.2 * L) this.pos.y = wy - 0.2 * L; // stay submerged
    }

    this.burst = damp(this.burst, targetBurst, targetBurst > this.burst ? 30 : 5, dt);
    // kinematic outputs
    this.yawRate = wrapAngle(this.yaw - this.prevYaw) / Math.max(dt, 1e-4); this.prevYaw = this.yaw;
    const sp = this.vel.dot(this.forward(this._v));
    this.accel = damp(this.accel, (sp - this.prevSpeed) / Math.max(dt, 1e-4), 20, dt); this.prevSpeed = sp; this.speed = sp;
    this._e.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    this.quat.setFromEuler(this._e);
  }

  _turnToward(yaw, rate, dt) {
    const e = wrapAngle(yaw - this.yaw);
    const step = clamp(e, -rate * dt, rate * dt);
    this.yaw = wrapAngle(this.yaw + step);
    return e;
  }

  _alignToGround(dt, headUp) {
    // Resting contact is the pelvic disc (under the pectoral girdle) and the
    // ventral caudal peduncle, so body pitch follows the line between those two
    // supports rather than the local normal (matters on burrow mounds/ripples).
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const a = 0.12 * this.SL, b = 0.45 * this.SL, w = 0.08 * this.SL;
    const p = this.pos;
    const hF = this.ground(p.x + fx * a, p.z + fz * a), hB = this.ground(p.x - fx * b, p.z - fz * b);
    const hL = this.ground(p.x + fz * w, p.z - fx * w), hR = this.ground(p.x - fz * w, p.z + fx * w);
    this.pitch = damp(this.pitch, Math.atan2(hF - hB, a + b) + headUp, 6, dt);
    this.roll = damp(this.roll, Math.atan2(hL - hR, 2 * w) * 0.8, 6, dt);
    this.restY = hF + (hB - hF) * (a / (a + b)); // ground under the root on the support line
  }

  _updateHop(dt, g) {
    const H = this.hop; const L = this.L;
    if (!H) return;
    H.t += dt;
    const to = this._v2.copy(H.target).sub(this.pos).setY(0);
    const dist = to.length();
    const wantYaw = Math.atan2(to.x, to.z);
    const f = this.forward(this._v).setY(0).normalize();
    let along = this.vel.dot(f);
    switch (H.phase) {
      case 'orient': {
        // pivot on the pelvic disc using pectoral strokes (slow) or a tail flick (fast)
        const err = this._turnToward(wantYaw, lerp(1.6, 5, H.urgency), dt);
        this.contact = true; this.mode = 'perch';
        this.pos.y = damp(this.pos.y, g + this.restClear, 10, dt);
        this._alignToGround(dt, 0.05);
        if (Math.abs(err) < 0.3 || dist < 0.8 * L) { H.phase = 'launch'; H.t = 0; }
        break;
      }
      case 'launch': {
        this._turnToward(wantYaw, 3, dt);
        const aL = lerp(25, 60, H.urgency) * L;
        along += aL * dt;
        const tau = 0.22;
        if (along * tau >= dist * 0.95 || H.t > 0.5) { H.phase = 'glide'; H.t = 0; }
        this.mode = 'hop'; this.contact = false;
        break;
      }
      case 'glide': {
        this._turnToward(wantYaw, 1.2, dt);
        along *= Math.exp(-dt / 0.22);
        this.gliding = true;
        if (along < 0.5 * L || dist < 0.25 * L) { H.phase = 'settle'; H.t = 0; }
        break;
      }
      case 'settle': {
        along *= Math.exp(-dt / 0.07);
        this.gliding = true; this.braking = true;
        if (H.t > 0.25) { H.done = true; this.contact = true; this.mode = 'perch'; }
        break;
      }
    }
    if (H.phase !== 'orient') {
      this.vel.copy(f).multiplyScalar(Math.max(along, 0));
      // skim trajectory: small rise during launch, descend during glide
      const prog = H.phase === 'launch' ? 1 : H.phase === 'glide' ? 0.5 : 0;
      const hT = g + this.restClear + H.arc * L * prog;
      this.vel.y = (hT - this.pos.y) * 8;
      this.pos.addScaledVector(this.vel, dt);
      this.pitch = damp(this.pitch, clamp(this.vel.y / Math.max(along, 0.2 * L), -0.35, 0.35) * 0.6, 8, dt);
      this.roll = damp(this.roll, 0, 6, dt);
      if (H.phase === 'settle') this._alignToGround(dt, 0.03);
    }
  }

  _updateEscape(dt, g) {
    const E = this.escape; const L = this.L;
    E.t += dt;
    let burst = 0;
    const f = this.forward(this._v).setY(0).normalize();
    let along = this.vel.dot(f);
    if (E.t < 0.045) {
      // stage 1: C-bend rotates the body in place (head swings toward escape direction)
      const k = smoothstep(0, 0.045, E.t);
      this.yaw = wrapAngle(E.yaw0 + E.turn * k * 0.8);
      along = 0.5 * L;
      burst = 1;
    } else if (E.t < 0.30) {
      // stage 2 + burst swimming
      if (E.t < 0.09) this.yaw = wrapAngle(E.yaw0 + E.turn * lerp(0.8, 1.0, smoothstep(0.045, 0.09, E.t)));
      along = Math.min(E.peak, along + 160 * L * dt);
      burst = 1;
    } else {
      along *= Math.exp(-dt / 0.25);
      this.gliding = true;
      burst = 0;
    }
    this.vel.copy(f).multiplyScalar(along);
    this.vel.y = (g + this.restClear + 0.5 * L - this.pos.y) * 5;
    this.pos.addScaledVector(this.vel, dt);
    this.mode = 'escape'; this.contact = false;
    this.pitch = damp(this.pitch, 0.05, 6, dt); this.roll = damp(this.roll, 0, 8, dt);
    E.done = E.t > 0.55;
    return burst;
  }

  _updateBurrow(dt) {
    const B = this.burrow; const b = B.b;
    // root sits ~0.40 SL behind the snout; keep the root on the centre-line
    const target = B.target ?? (B.dir > 0 ? b.usableDepth - 0.01 : -0.02);
    const e = target - B.d;
    const step = clamp(e, -B.speed * dt, B.speed * dt);
    B.d += step;
    B.arrived = Math.abs(e) < 0.002;
    const p = b.pointAt(B.d, this._v2);
    if (B.blend > 0) { p.lerp(B.blendFrom, B.blend * B.blend); B.blend = Math.max(0, B.blend - dt / 0.18); }
    const tng = b.tangentAt(B.d, this._v).normalize();
    if (!B.headIn) tng.negate();               // facing out of the burrow
    this.pos.copy(p);
    const wantYaw = Math.atan2(tng.x, tng.z);
    const wantPitch = Math.asin(clamp(tng.y, -1, 1));
    // near vertical: yaw ill-defined; keep current yaw
    if (Math.abs(tng.y) < 0.97) this.yaw = wrapAngle(this.yaw + wrapAngle(wantYaw - this.yaw) * Math.min(1, dt * 10));
    this.pitch = damp(this.pitch, wantPitch, 12, dt);
    this.roll = damp(this.roll, 0, 8, dt);
    this.vel.copy(tng).multiplyScalar(Math.abs(step) / Math.max(dt, 1e-4) * Math.sign(step || 1) * (B.headIn ? 1 : -1));
    this.contact = false; this.mode = B.d > 0.01 ? 'burrow' : 'burrowHold';
    this.hidden = B.d > this.SL * 1.25 + 0.01;
  }
}
