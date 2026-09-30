// Scripted demonstrations of every locomotor / behavioural mode, selectable
// from the GUI. In the aquarium they drive the selected fish (or all fish)
// through the behaviour layer; in the studio flume they drive the motor layer
// directly while the fish holds station.

import * as THREE from 'three';

export const ANIMS = ['AI', 'idle', 'slow', 'cruise', 'accelerate', 'turn', 'brake', 'startle', 'feeding', 'surfaceFeeding'];

export class AnimDemo {
  constructor() {
    this.anim = 'AI';
    this.t = 0;
    this.timers = new Map();
  }

  set(anim) {
    this.anim = anim;
    this.t = 0;
    this.timers.clear();
  }

  _every(fish, key, period, dt) {
    const k = fish.id + ':' + key;
    const v = (this.timers.get(k) ?? period * 0.5) + dt;
    if (v >= period) {
      this.timers.set(k, 0);
      return true;
    }
    this.timers.set(k, v);
    return false;
  }

  /** Behaviour-level demo for an aquarium fish (has a brain). */
  applyAquarium(fish, dt, world) {
    const b = fish.brain;
    const L = fish.loc;
    const o = L.override;
    o.enabled = false;
    o.brake = false;
    o.freqMul = o.ampMul = 1;
    switch (this.anim) {
      case 'AI':
        b.forced = null;
        break;
      case 'idle':
        b.forced = 'pause';
        break;
      case 'slow':
        b.forced = 'wander';
        o.enabled = true;
        o.speed = 0.45;
        break;
      case 'cruise':
        b.forced = 'cruise';
        o.enabled = true;
        o.speed = 1.4;
        break;
      case 'accelerate': {
        b.forced = 'cruise';
        o.enabled = true;
        const ph = (this.t % 6) / 6;
        o.speed = ph < 0.5 ? 0.4 : 3.6;
        break;
      }
      case 'turn': {
        b.forced = 'wander';
        if (this._every(fish, 'turn', 2.4, dt)) {
          const ang = (fish.rng.next() < 0.5 ? -1 : 1) * fish.rng.range(1.8, 2.8);
          const dir = L.forward.clone().setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
          b.target.copy(L.pos).addScaledVector(dir, 0.3);
          b.target.x = THREE.MathUtils.clamp(b.target.x, -0.5, 0.5);
          b.target.z = THREE.MathUtils.clamp(b.target.z, -0.16, 0.16);
          b.phase = 'go';
          b.sub.pauseAt = false;
        }
        o.enabled = true;
        o.speed = 1.1;
        break;
      }
      case 'brake': {
        b.forced = 'cruise';
        o.enabled = true;
        const ph = this.t % 5;
        o.speed = ph < 3 ? 2.4 : 0;
        o.brake = ph >= 3;
        break;
      }
      case 'startle':
        b.forced = null;
        if (this._every(fish, 'startle', 5, dt)) {
          const away = new THREE.Vector3(fish.rng.range(-1, 1), 0, fish.rng.range(-1, 1)).normalize();
          b.triggerStartle(away, 1, world.time);
        }
        break;
      case 'feeding':
        b.forced = null;
        b.drives.hunger = 1;
        if (this._every(fish, 'feed', 7, dt)) {
          const p = fish.headPosition().addScaledVector(L.forward, 0.12);
          world.food.drop(p.x, p.z, 3, 'pellet');
        }
        break;
      case 'surfaceFeeding':
        b.forced = null;
        b.drives.hunger = 1;
        if (this._every(fish, 'sfeed', 8, dt)) {
          const p = fish.headPosition().addScaledVector(L.forward, 0.08);
          world.food.drop(p.x, p.z, 3, 'flake');
          for (const f of world.food.items.slice(-3)) f.floatTime = 60;
        }
        break;
    }
  }

  /** Motor-level demo for the studio flume fish (no brain). */
  applyStudio(fish, dt) {
    const L = fish.loc;
    const c = L.cmd;
    c.brake = false;
    c.pitchBias = 0;
    c.lookAt = null;
    c.urgency = 0;
    c.hoverPrecision = 0;
    c.dir.set(1, 0, 0);
    const T = this.t;
    switch (this.anim) {
      case 'AI':
      case 'idle':
        c.speed = 0;
        c.hoverPrecision = 0.6;
        break;
      case 'slow':
        c.speed = 0.5;
        break;
      case 'cruise':
        c.speed = 1.4;
        break;
      case 'accelerate':
        c.speed = T % 6 < 3 ? 0.4 : 3.6;
        break;
      case 'turn': {
        const s = Math.floor(T / 1.8) % 2 === 0 ? 1 : -1;
        c.dir.set(Math.cos(0.9), 0, s * Math.sin(0.9));
        c.speed = 1.0;
        break;
      }
      case 'brake':
        c.speed = T % 5 < 3 ? 2.4 : 0;
        c.brake = T % 5 >= 3;
        break;
      case 'startle':
        c.speed = 0.3;
        if (this._every(fish, 'st', 3.2, dt)) L.startle(new THREE.Vector3(fish.rng.range(-0.3, 0.3), 0, fish.rng.next() < 0.5 ? 1 : -1).normalize(), 1);
        break;
      case 'feeding':
        c.speed = 0.2;
        c.lookAt = L.pos.clone().add(new THREE.Vector3(fish.SL, 0, 0));
        if (this._every(fish, 'strike', 2.2, dt)) L.mouthAction('strike');
        break;
      case 'surfaceFeeding':
        c.speed = 0.15;
        c.pitchBias = 0.7;
        if (this._every(fish, 'gulp', 2.6, dt)) L.mouthAction('gulp');
        break;
    }
    // flume keeps heading roughly constant
    if (this.anim !== 'turn' && !L.cstart) L.yaw *= 1 - Math.min(1, dt * 1.5);
  }

  update(dt) {
    this.t += dt;
  }
}
