import * as THREE from 'three';
import { ANATOMY as A } from './anatomy.js';
import { MORPH } from './morphology.js';
import { ShrimpModel } from './ShrimpModel.js';
import { Brain } from './Brain.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _k = new THREE.Vector3();
const _k2 = new THREE.Vector3();
const _k3 = new THREE.Vector3();
const _k4 = new THREE.Vector3();
const _k5 = new THREE.Vector3();
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (t) => t * t * (3 - 2 * t);

/** Critically-damped scalar spring (keeps procedural channels organic). */
class Spring {
  constructor(v = 0, freq = 8) {
    this.v = v;
    this.vel = 0;
    this.freq = freq;
  }
  step(target, dt, freq = this.freq) {
    const w = TAU * freq;
    const f = 1 + 2 * dt * w;
    const oo = w * w;
    const hoo = dt * oo;
    const hhoo = dt * hoo;
    const detInv = 1 / (f + hhoo);
    const detX = f * this.v + dt * this.vel + hhoo * target;
    const detV = this.vel + hoo * (target - this.v);
    this.v = detX * detInv;
    this.vel = detV * detInv;
    return this.v;
  }
}

/** Smooth 1D value noise for micro-motion. */
function noise1(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  return lerp(h(i), h(i + 1), smooth(f)) * 2 - 1;
}

let SEED = 1;

export class Shrimp {
  constructor(world, opts = {}) {
    this.world = world;
    this.id = SEED++;
    this.seed = this.id * 13.37;
    this.model = new ShrimpModel(opts);
    this.root = this.model.root;
    this.scale = this.model.scale;
    this.name = opts.name ?? `#${this.id}`;
    world.scene.add(this.root);
    this.model.addFlagellaTo(world.scene);

    this.position = opts.position ? opts.position.clone() : new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? Math.random() * TAU;
    this.pitch = 0;
    this.roll = 0;
    this.pitchRate = 0;
    this.yawRate = 0;
    this.mode = 'ground';
    this.time = Math.random() * 10;
    this.speed = 0;
    this.socialPush = new THREE.Vector3();
    this.walkSpeed = A.walk.speed * this.scale;
    this.swimSpeed = A.swim.speed * this.scale;
    this.standH = -this.model.groundY * this.scale; // from the photo-matched stance (ShrimpModel.poseStanding)
    this.bodyY = new Spring(0, 3);
    this.bodyPitch = new Spring(0, 2.5);
    this.bodyRoll = new Spring(0, 2.5);
    this.flip = null;
    this.startleT = 1e9;
    this.startlePoint = new THREE.Vector3();
    this.thrust = 0;
    this.pleoPhase = Math.random() * TAU;
    this.gaitClock = 0;
    this.lastFlipEnd = -10;
    this.abdSprings = this.model.abd.map((_, i) => new Spring(A.abdomen.rest[i], 6));
    this.uroSpread = new Spring(0, 10);
    this.flickT = 0;
    this.flickAmt = 0;

    this.brain = new Brain(this);
    this.initLegs();
    this.position.y = world.heightAt(this.position.x, this.position.z) + this.standH;
    this.bodyY.v = this.position.y;
    this.applyRootTransform();
    this.plantAllFeet();
  }

  brainNoise() {
    return Math.random() * 2 - 1;
  }

  // ------------------------------------------------------------------ legs
  initLegs() {
    // Metachronal wave back-to-front; left/right in antiphase; per-leg jitter.
    const offsets = { P5: 0.0, P4: 0.34, P3: 0.68 };
    // Foot rest positions in TL (same as ShrimpModel.poseStanding) [PHOTO 001, 005].
    const TLm = A.totalLength;
    const fwd = { P3: -0.005 * TLm, P4: -0.02 * TLm, P5: -0.04 * TLm };
    const lat = { P3: 0.14 * TLm, P4: 0.15 * TLm, P5: 0.15 * TLm };
    this.legs = this.model.walkLegs.map((leg) => {
      const n = leg.P.name;
      const restLocal = leg.restFoot.clone().multiplyScalar(this.scale);
      return {
        ...leg,
        restLocal,
        foot: new THREE.Vector3(),
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        swingT: 1,
        swingDur: A.walk.stepDuration,
        swinging: false,
        phase: (offsets[n] + (leg.side > 0 ? 0 : 0.5) + (Math.random() - 0.5) * 0.08) % 1,
        lastPhase: 0,
        grounded: true,
        dangle: new Spring(0, 3),
      };
    });
  }

  desiredFoot(leg, out, lead = 0) {
    out.copy(leg.restLocal).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
    out.add(this.position);
    if (lead) out.addScaledVector(_w.copy(this.vel).setY(0), lead);
    out.y = this.world.groundY(out.x, out.z, this.position.y + 0.02);
    return out;
  }

  plantAllFeet() {
    for (const leg of this.legs) {
      this.desiredFoot(leg, leg.foot);
      leg.swinging = false;
      leg.swingT = 1;
      leg.grounded = true;
    }
  }

  startStep(leg, stepLen, freq) {
    leg.swinging = true;
    leg.swingT = 0;
    leg.from.copy(leg.foot);
    // Spider-like gait: long, low swing (duty factor ~0.65) instead of a quick flick.
    const f = Math.max(freq, 0.6);
    leg.swingDur = clamp(0.35 / f, 0.25, 0.6) * (0.92 + Math.random() * 0.16);
    this.desiredFoot(leg, leg.to, leg.swingDur * 0.5);
  }

  updateGait(dt) {
    const stepLen = A.walk.stepLength * this.scale;
    const turning = Math.abs(this.yawRate) * 0.012;
    const freq = clamp((this.speed + turning) / stepLen, 0, 2.2);
    this.gaitClock += dt * freq;
    for (const leg of this.legs) {
      const ph = (this.gaitClock + leg.phase) % 1;
      const wrapped = ph < leg.lastPhase;
      leg.lastPhase = ph;
      this.desiredFoot(leg, _v);
      const err = _v.distanceTo(leg.foot);
      const neighbourSwinging = this.legs.some((o) => o !== leg && o.swinging && (o.side === leg.side ? Math.abs(o.index - leg.index) === 1 : o.index === leg.index));
      if (!leg.swinging) {
        const moving = freq > 0.2;
        // Steps follow the rhythmic wave (P5 -> P4 -> P3); adjacent legs never lift together.
        if ((moving && wrapped && err > stepLen * 0.08 && !neighbourSwinging) || err > stepLen * 1.3 || (!moving && err > stepLen * 0.45 && !neighbourSwinging && Math.random() < dt * 0.5)) {
          this.startStep(leg, stepLen, freq);
        }
      }
      if (leg.swinging) {
        leg.swingT += dt / leg.swingDur;
        const t = Math.min(1, leg.swingT);
        // Foot reaches forward smoothly; most of the lift happens early, then it is lowered gently.
        const s = 0.5 - 0.5 * Math.cos(Math.PI * t);
        this.desiredFoot(leg, _w, (1 - t) * leg.swingDur * 0.5);
        leg.to.lerp(_w, 1 - Math.exp(-dt * 6));
        leg.foot.lerpVectors(leg.from, leg.to, s);
        const lift = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.8);
        leg.foot.y += lift * 0.0011 * this.scale;
        if (t >= 1) {
          leg.swinging = false;
          leg.foot.y = this.world.groundY(leg.foot.x, leg.foot.z, leg.foot.y + 0.01);
          if (this.world.onSediment(leg.foot) && this.speed > 0.02 && Math.random() < 0.05) this.world.puff(leg.foot, 2, 0.002);
        }
      }
    }
  }

  solveLegIK(leg, footWorld) {
    // Shared analytic IK (knee splayed outward-up) lives on the model.
    this.model.solveLegIK(leg, this.model.ceph.worldToLocal(_v.copy(footWorld)));
  }

  poseLegFK(leg, dt, tuck) {
    // Swimming: legs hang down-lateral and trail; tuck (escape) folds them forward.
    const t = this.time;
    const s = leg.side;
    const trail = clamp(this.vel.length() * 6, 0, 0.6);
    const d = leg.dangle.step(tuck ? 1 : 0, dt, tuck ? 12 : 3);
    const n = noise1(t * 0.7 + leg.index * 3.1 + s, this.seed) * 0.08;
    // Hang from the same splay as the standing stance, trailing back a little with speed.
    const yaw = lerp(leg.restYaw - s * trail * 0.4, -s * 0.5, d);
    leg.hip.rotation.set(0, yaw, lerp(-0.35 + n, 0.2, d), 'YZX');
    leg.knee.rotation.set(0, 0, lerp(-0.9 + n, -2.4, d));
    leg.wrist.rotation.set(0, 0, lerp(-0.4, 0.15, d));
    leg.dactyl.rotation.set(0, 0, -0.3);
  }

  // ------------------------------------------------------------------ reflexes
  canFlip() {
    return !this.flip && this.time - this.lastFlipEnd > 0.35;
  }

  startle(point, strength) {
    this.startleT = 0;
    this.startlePoint.copy(point);
    this.startleStrength = clamp(strength * 3, 0.2, 1);
    _v.subVectors(this.position, point).setY(0).normalize().multiplyScalar(0.04 * this.startleStrength);
    if (this.mode === 'water') this.vel.add(_v);
  }

  startTailFlip(point, strength) {
    const away = new THREE.Vector3().subVectors(this.position, point);
    away.y = Math.max(away.y, 0) + 0.25 * away.length();
    away.normalize();
    this.flip = {
      count: clamp(1 + Math.floor(strength * 4 + Math.random()), 1, A.tailFlip.maxFlips),
      i: 0,
      phase: 'latency',
      t: 0,
      away,
      flex: 0,
    };
    this.mode = 'water';
  }

  updateTailFlip(dt) {
    const F = this.flip;
    const T = A.tailFlip;
    const sizeK = Math.sqrt(this.scale); // larger animals flex slower [R]
    F.t += dt;
    if (F.phase === 'latency') {
      // ~20 ms neural latency before movement.
      if (F.t > 0.02) {
        F.phase = 'flex';
        F.t = 0;
        // Steering via asymmetric flexion: rotate so the backward axis points away.
        const back = Math.atan2(F.away.z, -F.away.x); // yaw whose -forward = away
        F.yawKick = clamp(wrapAngle(back - this.yaw), -0.9, 0.9);
      }
    } else if (F.phase === 'flex') {
      const dur = T.flexTime * sizeK;
      F.flex = Math.min(1, F.t / dur);
      this.yaw += (F.yawKick / dur) * dt;
      if (F.t >= dur) {
        // Impulse: body shoots backward along its axis and pitches nose-up.
        const fwd = this.forward(_v);
        const dv = (T.deltaV / sizeK) * (F.i === 0 ? 1 : 0.8) * (0.85 + Math.random() * 0.3);
        this.vel.addScaledVector(fwd, -dv);
        this.vel.addScaledVector(F.away, dv * 0.35);
        this.pitchRate += (T.pitch / 0.14) * (0.7 + Math.random() * 0.5);
        this.world.wake(this.position, fwd.clone().negate(), dv, this.mode);
        F.phase = 'glide';
        F.t = 0;
      }
    } else if (F.phase === 'glide') {
      F.flex = 1;
      if (F.t > 0.03 + Math.random() * 0.02) {
        F.phase = 'extend';
        F.t = 0;
      }
    } else if (F.phase === 'extend') {
      const dur = T.reextendTime * sizeK;
      F.flex = 1 - smooth(Math.min(1, F.t / dur));
      if (F.t >= dur) {
        F.i++;
        if (F.i < F.count) {
          F.phase = 'latency';
          F.t = 0.0;
          // Update escape direction: keep going away but add variability.
          F.away.x += (Math.random() - 0.5) * 0.6;
          F.away.z += (Math.random() - 0.5) * 0.6;
          F.away.normalize();
        } else {
          this.flip = null;
          this.lastFlipEnd = this.time;
          this.brain.s.fatigue = clamp(this.brain.s.fatigue + 0.15, 0, 1);
        }
      }
    }
  }

  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(cp * Math.cos(this.yaw), Math.sin(this.pitch), -cp * Math.sin(this.yaw));
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    this.time += dt;
    const W = this.world;
    this.socialPush.set(0, 0, 0);
    this.brain.update(dt, W);
    const it = this.brain.intent;

    if (this.flip) this.updateTailFlip(dt);

    // ---- mode transitions
    const ground = W.groundY(this.position.x, this.position.z, this.position.y + 0.01);
    if (!this.flip) {
      if (it.mode === 'water' && this.mode === 'ground') {
        this.mode = 'water';
        this.vel.y += 0.012;
      } else if (it.mode === 'ground' && this.mode === 'water') {
        if (this.position.y - ground < this.standH * 1.4 && this.vel.length() < 0.06) {
          this.mode = 'ground';
          this.bodyY.v = this.position.y;
          this.bodyY.vel = 0;
          this.plantAllFeet();
        }
      }
    }

    // ---- steering
    let desiredDir = null;
    let desiredSpeed = 0;
    if (it.target) {
      _v.subVectors(it.target, this.position);
      if (this.mode === 'ground') _v.y = 0;
      const dist = _v.length();
      if (dist > 0.004) {
        desiredDir = _v.normalize().clone();
        desiredSpeed = it.speed * clamp(dist / 0.02, 0.25, 1);
      }
    }
    if (desiredDir) {
      desiredDir.addScaledVector(this.socialPush, 20);
      W.steer(this.position, desiredDir, this.mode === 'ground');
    } else if (this.socialPush.lengthSq() > 1e-8) {
      desiredDir = this.socialPush.clone().normalize();
      desiredSpeed = this.walkSpeed * 0.4;
    }

    // ---- heading
    let wantYaw = null;
    if (desiredDir) wantYaw = Math.atan2(-desiredDir.z, desiredDir.x);
    else if (it.face) wantYaw = Math.atan2(-(it.face.z - this.position.z), it.face.x - this.position.x);
    const flow = W.flowAt(this.position, _w);
    const flowMag = flow.length();
    if (!desiredDir && !it.face && it.rheotaxis > 0 && flowMag > 0.004) {
      // Positive rheotaxis: face upstream when stationary.
      wantYaw = Math.atan2(flow.z, -flow.x);
    }
    if (!this.flip) {
      const turnRate = this.mode === 'ground' ? 1.1 : 1.8;
      const target = wantYaw === null ? this.yaw + noise1(this.time * 0.15, this.seed) * 0.002 : wantYaw;
      const err = wrapAngle(target - this.yaw);
      const rate = clamp(err * 1.5, -turnRate, turnRate);
      this.yawRate = damp(this.yawRate, rate, 10, dt);
      this.yaw += this.yawRate * dt;
    }

    const fwd = this.forward(new THREE.Vector3());

    if (this.mode === 'ground') {
      // Walking: speed limited while turning sharply (animals re-orient first).
      const headingErr = desiredDir ? Math.abs(wrapAngle(Math.atan2(-desiredDir.z, desiredDir.x) - this.yaw)) : 0;
      const sp = desiredSpeed * clamp(1.2 - headingErr, 0, 1);
      _v.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(sp);
      // Walking can include a lateral component from social push/obstacles.
      if (desiredDir) _v.lerp(desiredDir.clone().setY(0).multiplyScalar(sp), 0.25);
      // Stronger flow pushes the animal slightly and lowers posture.
      _v.addScaledVector(flow, clamp(flowMag * 3, 0, 0.15));
      this.vel.x = damp(this.vel.x, _v.x, 6, dt);
      this.vel.z = damp(this.vel.z, _v.z, 6, dt);
      this.vel.y = 0;
      this.position.x += this.vel.x * dt;
      this.position.z += this.vel.z * dt;
      W.constrain(this.position, true);
      this.speed = Math.hypot(this.vel.x, this.vel.z);
      this.updateGait(dt);
      // Body height/pitch/roll from planted feet.
      let front = 0;
      let back = 0;
      let left = 0;
      let right = 0;
      let avg = 0;
      for (const l of this.legs) {
        // Support height from the substrate under each foot; a lifted foot must not raise the body
        // (otherwise the body bobs with every step).
        const gy = l.swinging ? lerp(l.from.y, l.to.y, Math.min(1, l.swingT)) : l.foot.y;
        avg += gy;
        if (l.P.name === 'P3') front += gy;
        if (l.P.name === 'P5') back += gy;
        if (l.side > 0) left += gy;
        else right += gy;
      }
      avg /= this.legs.length;
      const crouch = clamp(flowMag * 0.08, 0, 0.002) + (this.brain.s.fear > 0.3 ? 0.0015 : 0) + (it.arms === 'forage' ? 0.0012 : 0);
      this.position.y = this.bodyY.step(avg + this.standH - crouch, dt, 1.2);
      const span = 0.01 * this.scale;
      const pTarget = Math.atan2((front - back) / 2, span) + (it.arms === 'forage' ? -0.12 : 0) + (this.brain.behavior === 'hide' ? -0.05 : 0.03);
      this.pitch = this.bodyPitch.step(pTarget, dt, 1);
      this.roll = this.bodyRoll.step(Math.atan2((right - left) / 3, 0.024 * this.scale), dt, 1);
      this.pitchRate = 0;
      this.thrust = 0;
    } else {
      // ---- water dynamics: thrust + buoyancy + drag relative to water + added mass
      const acc = new THREE.Vector3();
      let thrustMag = 0;
      if (!this.flip) {
        let desiredVel = new THREE.Vector3();
        if (desiredDir) {
          desiredVel.copy(desiredDir).multiplyScalar(desiredSpeed || this.swimSpeed * 0.5);
        }
        if (it.mode === 'water' && it.target && !it.speed) {
          // Hover: PD station-keeping with small wandering.
          _v.subVectors(it.target, this.position);
          _v.x += noise1(this.time * 0.3, this.seed + 7) * 0.004;
          _v.y += noise1(this.time * 0.25, this.seed + 9) * 0.003;
          _v.z += noise1(this.time * 0.3, this.seed + 11) * 0.004;
          desiredVel.copy(_v).multiplyScalar(1.5).clampLength(0, 0.02);
        }
        if (it.mode === 'ground') {
          // Sink toward the bottom gently, legs outstretched.
          desiredVel.set(this.vel.x * 0.5, -0.03, this.vel.z * 0.5);
        }
        acc.subVectors(desiredVel, this.vel).multiplyScalar(4).clampLength(0, 0.6);
        acc.y += 0.03; // counter slight negative buoyancy with pleopods
        thrustMag = acc.length();
      }
      acc.y -= 0.03; // net negative buoyancy [R] (palaemonids sink slowly)
      const rel = _v.subVectors(this.vel, flow);
      const flexArea = this.flip ? 1 + this.flip.flex * 1.5 : 1;
      const k1 = 1.2 * flexArea;
      const k2 = 14 * flexArea;
      acc.addScaledVector(rel, -(k1 + k2 * rel.length()));
      this.vel.addScaledVector(acc, dt);
      this.position.addScaledVector(this.vel, dt);
      const floor = W.groundY(this.position.x, this.position.z, this.position.y + 0.02) + 0.004 * this.scale;
      if (this.position.y < floor) {
        this.position.y = floor;
        if (this.vel.y < 0) this.vel.y *= -0.2;
      }
      W.constrain(this.position, false, this.vel);
      this.speed = this.vel.length();
      this.thrust = damp(this.thrust, clamp(thrustMag / 0.3 + this.speed * 4, 0.15, 1), 5, dt);

      // Attitude: pitch follows vertical velocity when swimming; spring back after flips.
      const pitchTarget = this.flip ? 0 : clamp(Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z) + 0.02) * 0.6, -0.5, 0.5);
      this.pitchRate += (-(this.pitch - pitchTarget) * 60 - this.pitchRate * (this.flip ? 7 : 10)) * dt;
      this.pitch += this.pitchRate * dt;
      this.pitch = clamp(this.pitch, -1.4, 1.4);
      this.roll = damp(this.roll, -this.yawRate * 0.08, 4, dt);
    }

    this.applyRootTransform();
    this.animate(dt, fwd);
    this.root.updateMatrixWorld(true);
    // Feet IK after the body transform is final.
    if (this.mode === 'ground') for (const leg of this.legs) this.solveLegIK(leg, leg.foot);
    this.root.updateMatrixWorld(true);
    this.updateFlagella(dt);
  }

  applyRootTransform() {
    this.root.position.copy(this.position);
    this.root.rotation.set(this.roll, this.yaw, this.pitch, 'YZX');
  }

  // ------------------------------------------------------------------ procedural animation
  animate(dt, fwd) {
    const m = this.model;
    const t = this.time;
    const it = this.brain.intent;
    const beh = this.brain.behavior;
    const sd = this.seed;
    this.startleT += dt;
    const startle = this.startleT < 0.4 ? Math.sin(Math.PI * Math.min(1, this.startleT / 0.4)) * this.startleStrength : 0;

    // ---- Abdomen: rest curvature + swim undulation + flip flexion + startle twitch
    const Ab = A.abdomen;
    const swimming = this.mode === 'water' && !this.flip;
    const beat = swimming ? this.thrust : 0;
    for (let i = 0; i < 6; i++) {
      // Resting live posture traced from photo 001 (hump at s3, sharp bend at s3/s4).
      let target = Ab.rest[i];
      // Swimming: abdomen straightens and undulates slightly with the pleopod beat.
      if (swimming) target = Ab.rest[i] * 0.35 + 0.03 * beat * Math.sin(this.pleoPhase * 0.5 - i * 0.6);
      if (it.arms === 'groom' && it.groomPart === 'body') target += 0.25 * (i < 4 ? 1 : 0.5) * (0.6 + 0.4 * Math.sin(t * 2));
      target += startle * 0.35 * Ab.flexMax[i];
      target += noise1(t * 0.15 + i, sd) * 0.004;
      if (this.flip) {
        // Anterior-to-posterior recruitment: posterior joints lag slightly.
        const f = clamp(this.flip.flex * (1.15 - i * 0.04), 0, 1);
        this.abdSprings[i].v = lerp(this.abdSprings[i].v, lerp(Ab.rest[i], Ab.flexMax[i], f), 0.85);
        this.abdSprings[i].vel = 0;
      } else {
        this.abdSprings[i].step(target, dt, 5);
      }
      const a = clamp(this.abdSprings[i].v, -Ab.extendMax[i], Ab.flexMax[i]);
      m.abd[i].rotation.z = a;
      m.abd[i].rotation.y = this.flip ? (this.flip.yawKick ?? 0) * 0.04 * this.flip.flex : -this.yawRate * 0.01;
    }
    // Telson follows with slight extra flex
    m.telson.rotation.z = MORPH.rest.telson + (this.abdSprings[5].v - Ab.rest[5]) * 0.4;

    // ---- Tail fan spread (open during flips / hover steering)
    const spreadTarget = this.flip ? 1 : swimming ? 0.35 + 0.2 * Math.abs(this.yawRate) : 0.05 + startle * 0.5;
    const spread = this.uroSpread.step(spreadTarget, dt, this.flip ? 25 : 5);
    for (const u of m.uropods) {
      const s = u.userData.side;
      u.rotation.y = -s * (0.1 + spread * 0.6) + this.yawRate * 0.05;
      // Closed fan is rolled lateral-edge-down; spreading flattens it into a horizontal fan.
      u.rotation.x = s * MORPH.rest.fanRoll * (1 - spread);
      for (const k of ['exo', 'endo']) {
        const r = u.userData[k];
        r.rotation.y = r.userData.base * (1 + spread * 0.8);
      }
    }

    // ---- Pleopods: metachronal beating, posterior leads; rami open on power stroke
    const hz = this.mode === 'water' ? lerp(1.2, A.swim.pleopodHz, beat) : 0.35;
    this.pleoPhase += dt * TAU * (this.flip ? 0 : hz);
    const amp = this.flip ? 0 : this.mode === 'water' ? lerp(0.25, 0.8, beat) : beh === 'idle' || beh === 'hide' ? 0.08 : 0.12;
    m.pleopods.forEach((pairs, i) => {
      for (const p of pairs) {
        const ph = this.pleoPhase + (4 - i) * 0.95 + (p.side > 0 ? 0 : 0.15);
        // Asymmetric stroke: fast power stroke (backward), slow recovery.
        const s = Math.sin(ph);
        const skew = s + 0.25 * Math.sin(2 * ph);
        const tuck = this.flip ? 0.9 : 0;
        p.joint.rotation.z = -(skew * amp) + 0.25 + tuck;
        const open = clamp(-Math.cos(ph), 0, 1) * (this.mode === 'water' ? 0.35 : 0.1);
        for (const r of p.rami) r.rotation.x = r.userData.r * open;
      }
    });

    // ---- Walking legs: FK when not supported
    if (this.mode !== 'ground') for (const leg of this.legs) this.poseLegFK(leg, dt, !!this.flip);

    // ---- Chelipeds (P1 & P2)
    for (const c of m.chelipeds) {
      const s = c.side;
      const isP1 = c.P.name === 'P1';
      const alt = s > 0 ? 0 : Math.PI;
      const n = noise1(t * 0.25 + (isP1 ? 0 : 5) + s * 2, sd) * 0.02;
      // Rest carriage [PHOTO 001]: P2 held forward-down under the antennae, P1 folded.
      let yaw = -s * (isP1 ? 0.3 : 0.18);
      let pitch = isP1 ? -0.75 : -0.42;
      let knee = isP1 ? 1.35 : 0.38;
      let wrist = isP1 ? 0.35 : 0.05;
      let open = 0.06 + Math.max(0, noise1(t * 0.3 + s, sd + 1)) * 0.06;
      if (it.arms === 'forage') {
        // Alternating picking at substrate.
        const c1 = Math.sin(t * (isP1 ? 3.1 : 2.4) + alt + (isP1 ? 1 : 0));
        pitch = -1.3 + 0.25 * c1;
        knee = 0.9 - 0.4 * c1;
        open = c1 > 0.3 ? 0.5 : 0.02;
      } else if (it.arms === 'feed') {
        // Bring food to mouthparts alternately.
        const c1 = Math.sin(t * (isP1 ? 3.6 : 2.2) + alt);
        pitch = -0.7 + 0.15 * c1;
        knee = 1.7 + 0.6 * c1;
        wrist = 0.6 + 0.3 * c1;
        open = c1 < -0.3 ? 0.6 : 0.05;
      } else if (it.arms === 'groom' && isP1) {
        if (it.groomPart === 'antenna') {
          // Combing the antennal flagellum from base to tip.
          const c1 = (t * 0.9 + (s > 0 ? 0 : 0.5)) % 1;
          pitch = -0.2 + c1 * 0.6;
          yaw = -s * (0.1 - c1 * 0.1);
          knee = 1.6 - c1 * 1.2;
          open = c1 < 0.1 ? 0.5 : 0.02;
        } else if (it.groomPart === 'eye') {
          const c1 = Math.sin(t * 5 + alt);
          pitch = 0.1;
          yaw = -s * 0.05;
          knee = 2.1 + 0.2 * c1;
          wrist = 0.9;
        }
      }
      if (this.flip) {
        pitch = 0.1;
        knee = 2.4;
        yaw = -s * 0.1;
      }
      pitch -= startle * 0.4;
      c.hip.rotation.set(0, damp(c.hip.rotation.y, yaw + n, 12, dt), damp(c.hip.rotation.z, pitch + n, 12, dt), 'YZX');
      c.knee.rotation.z = damp(c.knee.rotation.z, knee, 12, dt);
      c.wrist.rotation.z = damp(c.wrist.rotation.z, wrist, 12, dt);
      c.dactyl.rotation.z = damp(c.dactyl.rotation.z, open, 20, dt);
    }

    // Groom body: P5 sweeps under the abdomen (override IK temporarily when on ground).
    if (it.arms === 'groom' && it.groomPart === 'body') {
      for (const leg of this.legs) {
        if (leg.P.name !== 'P5') continue;
        const c1 = Math.sin(t * 4 + (leg.side > 0 ? 0 : Math.PI));
        const back = new THREE.Vector3(-0.012 * this.scale, -0.004 * this.scale, leg.side * 0.004 * this.scale * (1 + 0.5 * c1));
        leg.foot.copy(back.applyMatrix4(this.root.matrixWorld));
        leg.swinging = false;
      }
    }

    // ---- 3rd maxillipeds & maxillae (constant scaphognathite ventilation)
    for (const j of m.mxp) {
      const s = j.userData.base;
      const feed = it.arms === 'feed' ? 1 : it.arms === 'forage' ? 0.5 : 0;
      const side = j.position.z > 0 ? 0 : Math.PI;
      const c1 = Math.sin(t * lerp(1.1, 5, feed) + side);
      j.rotation.z = s.z + c1 * lerp(0.02, 0.3, feed) + noise1(t * 0.4, sd + 4) * 0.01;
      j.rotation.y = s.y + c1 * lerp(0.02, 0.15, feed);
      const chain = j.userData.chain;
      chain[1].rotation.z = 0.35 + lerp(0, 0.5, feed) * (0.5 + 0.5 * c1);
    }
    m.maxillae.forEach((j, i) => {
      j.rotation.z = -1.3 + Math.sin(t * TAU * 3.2 + i) * 0.04;
    });
    // Heart beat visible through carapace (~3 Hz; rises with activity/fear).
    const hb = 2.5 + this.brain.s.fear * 2 + this.speed * 10;
    this.heartPhase = (this.heartPhase ?? 0) + dt * hb * TAU;
    const pulse = 1 + 0.12 * Math.max(0, Math.sin(this.heartPhase)) ** 4;
    m.heart.userData.sy ??= m.heart.scale.y;
    m.heart.scale.y = m.heart.userData.sy * pulse;

    // ---- Eyes: small independent drifts; fold back on startle/flip
    for (const e of m.eyes) {
      const s = e.userData.side;
      const b = e.userData.base;
      const fold = this.flip ? 0.6 : startle * 0.5;
      e.rotation.y = b.y + noise1(t * 0.3, sd + s * 5) * 0.03 - s * fold;
      e.rotation.z = b.z + noise1(t * 0.25, sd + s * 7) * 0.02 + (it.arms === 'groom' && it.groomPart === 'eye' ? -0.3 : 0);
    }

    // ---- Antennae (2nd) & antennules (1st): base actuators; flagella are physically simulated
    this.flickT -= dt;
    if (this.flickT <= 0) {
      // Antennule flicking = chemosensory sampling, rate increases when food smelled.
      this.flickT = 0.8 + Math.random() * (it.antenna === 'forward' || beh === 'investigate' ? 1.0 : 3.0);
      this.flickAmt = 1;
    }
    this.flickAmt = Math.max(0, this.flickAmt - dt * 8);
    for (const j of m.antennules) {
      const s = j.userData.side;
      const b = j.userData.base;
      j.rotation.z = b.z - this.flickAmt * 0.16 + noise1(t * 0.5, sd + s) * 0.02;
      j.rotation.y = b.y + noise1(t * 0.3, sd + s * 3) * 0.04;
    }
    for (const j of m.antennae) {
      const s = j.userData.side;
      const b = j.userData.base;
      let yaw = b.y + noise1(t * 0.15, sd + s * 11) * 0.06;
      let pitch = b.z + noise1(t * 0.12, sd + s * 13) * 0.03;
      switch (it.antenna) {
        case 'sweep':
          // Asymmetric sweeping, one antenna forward while the other scans laterally.
          yaw = b.y - s * (0.2 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.6 + (s > 0 ? 0 : 2.1))));
          pitch = -0.15 + 0.1 * Math.sin(t * 0.5 + s);
          break;
        case 'forward':
          yaw = -s * 0.08 + noise1(t * 0.6, sd + s) * 0.04;
          pitch = -0.1;
          break;
        case 'back':
          yaw = -s * 2.4;
          pitch = 0.15;
          break;
        case 'flick':
          yaw = b.y + s * 0.12 * Math.sin(t * 1.2);
          break;
      }
      if (it.arms === 'groom' && it.groomPart === 'antenna') {
        pitch = -0.9;
        yaw = -s * 0.15;
      }
      if (this.startleT < 1.2) {
        // Orient toward stimulus.
        const local = this.root.worldToLocal(_v.copy(this.startlePoint));
        const ang = Math.atan2(-local.z, local.x);
        yaw = lerp(yaw, clamp(ang, -2, 2) - s * 0.1, 0.7);
      }
      if (this.flip) {
        yaw = -s * 2.2;
        pitch = 0.1;
      }
      j.rotation.y = damp(j.rotation.y, yaw, this.flip ? 30 : 5, dt);
      j.rotation.z = damp(j.rotation.z, pitch, 5, dt);
    }
  }

  updateFlagella(dt) {
    const W = this.world;
    const rootDir = new THREE.Vector3();
    const selfVel = this.vel;
    const waterVel = (p, out) => W.flowAt(p, out);
    for (const f of this.model.flagella) {
      f.anchor.getWorldPosition(_v);
      rootDir.set(1, 0, 0).transformDirection(f.anchor.matrixWorld);
      f.update(dt, _v, rootDir, waterVel, (x, z) => W.heightAt(x, z));
    }
  }

  dispose() {
    this.model.removeFrom(this.world.scene);
  }
}
