import * as THREE from 'three';
import { KentishPloverConfig as CFG } from './KentishPloverConfig.js';
import { KentishPloverModel } from './KentishPloverModel.js';
import { KentishPloverAnimator } from './KentishPloverAnimator.js';
import { KentishPloverAI } from './KentishPloverAI.js';
import { clamp, damp, dampAngle, makeRng, wrapAngle } from '../../core/math.js';

// One bird: model + animator + behaviour AI + locomotion/flight integration.
// Individual variation is small and clamped at ±2 SD (docs/behavior.md §4, config.individualVariation).

export function makeIndividual(seed, palette) {
  const r = makeRng(seed * 7919 + 1);
  const V = CFG.individualVariation;
  const c = V.clampSD;
  const female = palette === 'femaleBreeding';
  return {
    seed: r(),
    sex: female ? 'F' : palette === 'maleBreeding' ? 'M' : r() < 0.5 ? 'M' : 'F',
    bodyScale: (female ? CFG.morphology.sexualSizeRatio : 1) * (1 + r.variation(V.bodyScale, c)),
    legLength: r.variation(V.legLength, c),
    melaninPatchScale: 1 + r.variation(V.melaninPatchScale, c),
    rufousSaturation: 1 + r.variation(V.rufousSaturation, c),
    plumageWear: clamp(0.25 + r.variation(V.plumageWear, c), 0, 0.9),
    walkSpeed: 1 + r.variation(V.walkSpeed, c),
    fearThreshold: 1 + r.variation(V.fearThreshold, c),
    personalSpace: CFG.social.personalSpace * (1 + r.variation(V.personalSpace, c)),
    animationTiming: r.variation(V.animationTiming, c),
    headMovement: r.variation(V.headMovement, c),
    hunger: r.range(0.35, 0.8),
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class KentishPlover {
  constructor({ world, id = 0, seed = 1, palette = 'maleBreeding', position = new THREE.Vector3(), heading = 0, lods = [0, 1, 2], shadows = true } = {}) {
    this.world = world;
    this.id = id;
    this.palette = palette;
    this.individual = makeIndividual(seed, palette);
    this.model = new KentishPloverModel({ palette, individual: this.individual, lods, shadows });
    this.model.object.scale.setScalar(this.individual.bodyScale);
    this.model.object.userData.bird = this;
    this.animator = new KentishPloverAnimator(this.model, { seed, individual: this.individual });
    this.animator.groundHeight = (x, z) => world.terrain.heightAt(x, z);
    this.pos = position.clone();
    this.pos.y = world.terrain.heightAt(this.pos.x, this.pos.z);
    this.heading = heading;
    this.vel = new THREE.Vector3();
    this.loco = { mode: 'idle', target: null, speed: 0, arrive: 0.02, face: null, onArrive: null, blocked: false };
    this.flight = null;
    this.ai = new KentishPloverAI(this, { seed });
    this.lod = 0;
    this._animAccum = 0;
    this._aiAccum = Math.random() * 0.05;
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }
  get airborne() {
    return !!this.flight;
  }

  // ------------------------------------------------------------ ground locomotion commands
  moveTo(target, { gait = 'walk', speed, arrive = 0.03, onArrive = null } = {}) {
    const base = gait === 'run' ? CFG.animation.run.speed : CFG.animation.walk.speed;
    this.loco.mode = 'move';
    this.loco.target = (this.loco.target || new THREE.Vector3()).copy(target);
    this.loco.speed = (speed ?? base) * this.individual.walkSpeed;
    this.loco.gait = gait;
    this.loco.arrive = arrive;
    this.loco.onArrive = onArrive;
    this.loco.blocked = false;
  }

  stop() {
    this.loco.mode = 'idle';
    this.loco.onArrive = null;
  }

  faceTowards(p) {
    this.loco.face = p ? (this.loco.face || new THREE.Vector3()).copy(p) : null;
  }

  _updateGround(dt) {
    const L = this.loco;
    const A = CFG.animation;
    let desired = 0;
    let dirX = Math.sin(this.heading);
    let dirZ = Math.cos(this.heading);
    if (L.mode === 'move' && L.target) {
      const dx = L.target.x - this.pos.x;
      const dz = L.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= L.arrive) {
        L.mode = 'idle';
        const cb = L.onArrive;
        L.onArrive = null;
        cb?.();
      } else {
        dirX = dx / dist;
        dirZ = dz / dist;
        // stopping profile: v ≤ sqrt(2·a·d) → the characteristic abrupt plover stop
        desired = Math.min(L.speed, Math.sqrt(2 * A.stopDecel * Math.max(0, dist - L.arrive * 0.5)));
        // turn before accelerating when facing away
        const turn = Math.abs(wrapAngle(Math.atan2(dirX, dirZ) - this.heading));
        desired *= clamp(1.2 - turn / 1.6, 0.15, 1);
      }
    }
    // accelerate / decelerate along the heading
    const cur = this.speed;
    const a = desired > cur ? A.accel : A.stopDecel;
    const next = cur + clamp(desired - cur, -a * dt, a * dt);
    // heading: toward travel direction, or toward the face target when standing
    let want = this.heading;
    if (L.mode === 'move' && desired > 0.001) want = Math.atan2(dirX, dirZ);
    else if (L.face) want = Math.atan2(L.face.x - this.pos.x, L.face.z - this.pos.z);
    const turnRate = next > 0.5 ? 9 : 6;
    this.heading = dampAngle(this.heading, want, turnRate, dt);
    this.vel.set(Math.sin(this.heading) * next, 0, Math.cos(this.heading) * next);
    // don't walk into deep water
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    // only refuse steps that go into deeper water (a bird caught by the tide can still wade out)
    const tr = this.world.terrain;
    if (next > 0.001 && tr.surfaceAt(nx, nz).key === 'deepWater' && tr.heightAt(nx, nz) < tr.heightAt(this.pos.x, this.pos.z)) {
      this.vel.set(0, 0, 0);
      if (L.mode === 'move') {
        L.blocked = true;
        L.mode = 'idle';
        const cb = L.onArrive;
        L.onArrive = null;
        cb?.('blocked');
      }
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = this.world.terrain.heightAt(this.pos.x, this.pos.z);
  }

  // ------------------------------------------------------------ flight
  /** Begin a flight toward a landing point (called by the AI after the take-off action). */
  startFlight(landing, { altitude = 2.5 } = {}) {
    const f = {
      phase: 'climb',
      landing: landing.clone(),
      altitude: altitude + Math.random() * 1.2,
      speed: 3.2,
      vy: 1.6, // leg-driven launch (S23)
      t: 0,
      glideTimer: 2 + Math.random() * 3,
      gliding: 0,
      roll: 0,
      pitch: 0,
      landingStarted: false,
    };
    this.flight = f;
    this.vel.set(Math.sin(this.heading) * 2.0, f.vy, Math.cos(this.heading) * 2.0);
    this.animator.setFlight(true, { hz: CFG.animation.flight.takeoffHz, amp: 1 });
  }

  _updateFlight(dt) {
    const f = this.flight;
    const A = CFG.animation.flight;
    f.t += dt;
    const ground = this.world.terrain.heightAt(this.pos.x, this.pos.z);
    const to = _v.set(f.landing.x - this.pos.x, 0, f.landing.z - this.pos.z);
    const dist = to.length();
    to.normalize();
    // phase logic
    const glideDist = 9;
    if (f.phase === 'climb' && this.pos.y - ground > f.altitude * 0.8) f.phase = 'cruise';
    if (f.phase !== 'approach' && f.phase !== 'flare' && dist < glideDist + f.altitude * 2) f.phase = 'approach';
    if (f.phase === 'approach' && dist < 1.4) f.phase = 'flare';
    let targetSpeed = A.cruiseSpeed;
    let targetAlt = ground + f.altitude;
    let hz = A.cruiseHz;
    let amp = 1;
    let glide = 0;
    let brake = 0;
    if (f.phase === 'climb') {
      targetSpeed = 7;
      hz = A.takeoffHz;
    } else if (f.phase === 'cruise') {
      // occasional short glides (steady wingbeats with short glides)
      f.glideTimer -= dt;
      if (f.glideTimer < 0 && f.gliding <= 0) {
        f.gliding = 0.25 + Math.random() * 0.35;
        f.glideTimer = 1.5 + Math.random() * 3;
      }
      if (f.gliding > 0) {
        f.gliding -= dt;
        glide = 1;
        amp = 0;
      }
    } else if (f.phase === 'approach') {
      // descend on a glide path, then braking flaps
      const k = clamp(dist / (glideDist + f.altitude * 2), 0, 1);
      targetAlt = ground + 0.15 + f.altitude * k * k;
      targetSpeed = 2.5 + 6.5 * k;
      glide = k > 0.35 ? 1 : 0;
      amp = glide ? 0 : 0.9;
      brake = 1 - k;
    } else {
      targetAlt = ground;
      targetSpeed = 1.3;
      amp = 1;
      hz = A.takeoffHz;
      brake = 1;
    }
    // horizontal velocity
    const hv = _v2.set(this.vel.x, 0, this.vel.z);
    const cur = hv.length();
    const newSpeed = damp(cur, targetSpeed, 1.6, dt);
    const desiredDir = to;
    const curHeading = this.heading;
    const wantHeading = Math.atan2(desiredDir.x, desiredDir.z);
    const turnRate = f.phase === 'flare' ? 3 : 1.6;
    const newHeading = dampAngle(curHeading, wantHeading, turnRate, dt);
    const yawRate = wrapAngle(newHeading - curHeading) / Math.max(dt, 1e-4);
    this.heading = newHeading;
    // vertical
    const errY = targetAlt - this.pos.y;
    f.vy = damp(f.vy, clamp(errY * 2.2, -2.2, 2.8), 3, dt);
    this.vel.set(Math.sin(this.heading) * newSpeed, f.vy, Math.cos(this.heading) * newSpeed);
    this.pos.addScaledVector(this.vel, dt);
    // attitude: bank into turns (centripetal), pitch with climb/brake
    const aLat = yawRate * newSpeed;
    const maxBank = f.phase === 'climb' ? 0.35 : 0.9;
    f.roll = damp(f.roll, clamp(Math.atan2(aLat, 9.81), -maxBank, maxBank), 5, dt);
    f.pitch = damp(f.pitch, clamp(-f.vy * 0.12, -0.35, 0.35) - brake * 0.45, 4, dt);
    this.animator.attitude.pitch = f.pitch;
    this.animator.attitude.roll = -f.roll;
    this.animator.setFlight(true, { hz, amp, glide, brake });
    // touchdown
    const h = this.pos.y - this.world.terrain.heightAt(this.pos.x, this.pos.z);
    if (f.phase === 'flare' && !f.landingStarted && h < 0.1) {
      f.landingStarted = true;
      this.ai.onLandingStart();
    }
    if (f.landingStarted && h <= 0.002) this._touchdown();
    if (f.t > 60) this._touchdown(); // safety
  }

  _touchdown() {
    this.flight = null;
    this.pos.y = this.world.terrain.heightAt(this.pos.x, this.pos.z);
    this.vel.y = 0;
    this.animator.setFlight(false);
    this.animator.attitude.pitch = 0;
    this.animator.attitude.roll = 0;
    this.animator._initFeet = true;
    // run out the remaining momentum (2–3 steps)
    const s = Math.min(1.4, this.speed);
    this.vel.set(Math.sin(this.heading) * s, 0, Math.cos(this.heading) * s);
    this.moveTo(this.pos.clone().add(new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(0.18)), { gait: 'run', speed: s, arrive: 0.04 });
    this.ai.onTouchdown();
  }

  // ------------------------------------------------------------ frame update
  /**
   * @param {number} dt real seconds
   * @param {object} sched {aiRate, animRate, visible}
   */
  update(dt, sched = { aiRate: 20, animRate: 60, visible: true }) {
    this._aiAccum += dt;
    const aiStep = 1 / sched.aiRate;
    if (this._aiAccum >= aiStep) {
      if (!this.ai.manual) this.ai.update(this._aiAccum);
      this._aiAccum = 0;
    }
    if (this.flight) this._updateFlight(dt);
    else this._updateGround(dt);
    this.ai.tick(dt); // cheap per-frame parts (state timers)
    this._animAccum += dt;
    const animStep = 1 / sched.animRate;
    if (sched.visible && this._animAccum >= animStep * 0.999) {
      this.animator.setRoot(this.pos, this.heading, this.vel);
      this.animator.update(this._animAccum);
      this._animAccum = 0;
    } else if (!sched.visible) {
      // not drawn: keep action timelines/events running without touching the skeleton
      this.animator.advance(this._animAccum);
      this._animAccum = 0;
    }
  }
}
