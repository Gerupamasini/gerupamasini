// Cinematic auto-camera: a small "director" that picks a subject fish and a
// shot type, holds it for a few seconds and cuts to the next one — tracking
// profile, three-quarter head close-up, low angle against the surface (thin
// parts glow), tail follow, top view through the water surface, and a slow
// dolly along the front glass. The camera follows a heavily smoothed pose of
// the subject (the body's own yaw oscillation is filtered out), adds a faint
// hand-held drift, keeps inside the water volume, and drives the lens focus.

import * as THREE from 'three';
import { TANK } from '../world/TankConfig.js';
import { groundHeight } from '../world/Substrate.js';
import { noise1 } from '../core/random.js';

const SHOTS = [
  { type: 'profile', w: 3, dur: [7, 10], fov: 30, fStop: 2.8 },
  { type: 'head34', w: 3, dur: [6, 8], fov: 28, fStop: 2.2 },
  { type: 'low', w: 2, dur: [6, 8], fov: 34, fStop: 2.8 },
  { type: 'tail', w: 2, dur: [6, 8], fov: 32, fStop: 2.8 },
  { type: 'track', w: 3, dur: [7, 10], fov: 32, fStop: 3.2 },
  { type: 'above', w: 1, dur: [6, 8], fov: 34, fStop: 4 },
  { type: 'wide', w: 2, dur: [8, 11], fov: 34, fStop: 5.6 },
];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class CinematicDirector {
  constructor(app) {
    this.app = app;
    this.shot = null;
    this.t = 0;
    this.subject = null;
    this.recent = [];
    this.focus = 1;
    this.fStop = 4;
    this.pose = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0) };
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.first = true;
  }

  _pickSubject(rng) {
    const fish = this.app.fishSystem.fish;
    if (!fish.length) return null;
    let best = null;
    let bs = -Infinity;
    for (const f of fish) {
      const p = f.loc.pos;
      // prefer active, well-lit fish away from walls, bottom and the last subjects
      const wall = Math.min(TANK.L / 2 - Math.abs(p.x), TANK.D / 2 - Math.abs(p.z));
      const st = f.brain ? f.brain.state : '';
      let s = Math.min(wall, 0.12) * 8 + Math.min(p.y - groundHeight(p.x, p.z), 0.12) * 4;
      s += Math.min(f.loc.speed / f.SL, 1.2) * 0.8;
      if (st === 'rest' || st === 'freeze') s -= 0.8;
      if (this.recent.includes(f)) s -= 1.2;
      s += rng.next() * 0.9;
      if (s > bs) {
        bs = s;
        best = f;
      }
    }
    this.recent.push(best);
    if (this.recent.length > 3) this.recent.shift();
    return best;
  }

  _pickShot(rng) {
    if (this.first) {
      this.first = false;
      return SHOTS.find((s) => s.type === 'wide');
    }
    const prev = this.shot ? this.shot.type : '';
    const pool = SHOTS.filter((s) => s.type !== prev);
    const tot = pool.reduce((a, s) => a + s.w, 0);
    let r = rng.next() * tot;
    for (const s of pool) if ((r -= s.w) <= 0) return s;
    return pool[0];
  }

  cut() {
    const rng = this.app.rng;
    const def = (this.forceType && SHOTS.find((x) => x.type === this.forceType)) || this._pickShot(rng);
    this.subject = this._pickSubject(rng) || this.subject;
    this.shot = { ...def, len: def.dur[0] + rng.next() * (def.dur[1] - def.dur[0]), side: rng.next() < 0.5 ? 1 : -1, seed: rng.next() * 100 };
    this.t = 0;
    if (this.subject) {
      this.pose.pos.copy(this.subject.loc.pos);
      this.pose.fwd.copy(this.subject.loc.forward).setY(0).normalize();
    }
    this._desired(this.camPos, this.camLook);
    this.app.camera.fov = def.fov;
    this.app.camera.updateProjectionMatrix();
    this.snap = true;
  }

  // desired camera position / look-at for the current shot
  _desired(pos, look) {
    const f = this.subject;
    const sh = this.shot;
    const P = this.pose.pos;
    const fwd = this.pose.fwd;
    const SL = f ? f.SL : 0.1;
    // side vector toward the viewer (front glass) unless the shot flips it
    const side = _v.set(-fwd.z, 0, fwd.x);
    if (side.z < 0) side.negate();
    if (sh.type === 'tail' || sh.type === 'low') side.multiplyScalar(sh.side > 0 ? 1 : 0.6).normalize();
    const up = _w.set(0, 1, 0);
    const k = this.t / sh.len; // 0..1 through the shot (slow push-ins / arcs)
    switch (sh.type) {
      case 'profile':
        pos.copy(P).addScaledVector(side, SL * (3.4 - 0.5 * k)).addScaledVector(fwd, SL * 0.2).addScaledVector(up, SL * 0.35);
        look.copy(P).addScaledVector(fwd, -SL * 0.25);
        break;
      case 'head34':
        pos.copy(P).addScaledVector(fwd, SL * (1.35 - 0.2 * k)).addScaledVector(side, SL * 1.05).addScaledVector(up, SL * 0.22);
        look.copy(P).addScaledVector(fwd, SL * 0.18);
        break;
      case 'low':
        pos.copy(P).addScaledVector(side, SL * 1.7).addScaledVector(up, -SL * 1.25).addScaledVector(fwd, SL * (0.4 - 0.8 * k));
        look.copy(P).addScaledVector(up, SL * 0.35).addScaledVector(fwd, -SL * 0.2);
        break;
      case 'tail':
        pos.copy(P).addScaledVector(fwd, -SL * 2.3).addScaledVector(side, SL * 1.5).addScaledVector(up, SL * 0.45);
        look.copy(P).addScaledVector(fwd, -SL * 0.8);
        break;
      case 'track':
        pos.copy(P).addScaledVector(side, SL * 2.5).addScaledVector(fwd, SL * (-1.0 + 1.4 * k)).addScaledVector(up, SL * 0.15);
        look.copy(P).addScaledVector(fwd, SL * 0.1);
        break;
      case 'above':
        pos.copy(P).addScaledVector(side, SL * 0.6).setY(TANK.water + 0.22);
        look.copy(P);
        break;
      case 'wide':
      default: {
        const x = THREE.MathUtils.lerp(-0.18, 0.18, sh.side > 0 ? k : 1 - k);
        pos.set(x, 0.24, 1.0 - 0.1 * k);
        look.set(x * 0.6, 0.2, 0);
        break;
      }
    }
    // portrait screens: back off so a horizontal fish still fits the frame
    const inside = sh.type !== 'wide' && sh.type !== 'above';
    const aspect = this.app.camera.aspect || 1.6;
    if (inside && aspect < 1.2) pos.sub(look).multiplyScalar(Math.min(1.9, 1.2 / aspect)).add(look);
    // stay inside the water (or outside the front glass / above the surface)
    if (inside) {
      pos.x = THREE.MathUtils.clamp(pos.x, -TANK.L / 2 + 0.03, TANK.L / 2 - 0.03);
      pos.z = THREE.MathUtils.clamp(pos.z, -TANK.D / 2 + 0.03, TANK.D / 2 - 0.012);
      const gy = groundHeight(pos.x, pos.z) + 0.03;
      pos.y = THREE.MathUtils.clamp(pos.y, gy, TANK.water - 0.02);
    }
  }

  update(dt) {
    const cam = this.app.camera;
    if (!this.shot || this.t > this.shot.len || !this.subject || !this.app.fishSystem.fish.includes(this.subject)) this.cut();
    this.t += dt;
    const f = this.subject;
    if (f) {
      // subject pose: the centre of mass hardly oscillates, so position is
      // tracked tightly; the heading is smoothed (filters the head's yaw
      // oscillation and makes turns read as slow camera arcs)
      this.pose.pos.lerp(f.loc.pos, 1 - Math.exp(-dt * 8));
      _v.copy(f.loc.forward).setY(0);
      if (_v.lengthSq() > 1e-6) this.pose.fwd.lerp(_v.normalize(), 1 - Math.exp(-dt * 1.2)).normalize();
      // camera rig moves with the subject (feed-forward), springs only correct the framing
      if (!this.snap && this.shot.type !== 'wide') {
        this.camPos.addScaledVector(f.loc.vel, dt);
        this.camLook.addScaledVector(f.loc.vel, dt);
      }
    }
    const want = new THREE.Vector3();
    const look = new THREE.Vector3();
    this._desired(want, look);
    // faint hand-held drift
    const s = this.shot.seed;
    const tt = this.app.time;
    const amp = this.shot.type === 'wide' ? 0.004 : 0.0025;
    want.x += noise1(tt * 0.35 + s) * 0.5 * amp;
    want.y += noise1(tt * 0.31 + s + 17) * 0.5 * amp;
    if (this.snap) {
      this.camPos.copy(want);
      this.camLook.copy(look);
      this.snap = false;
    } else {
      this.camPos.lerp(want, 1 - Math.exp(-dt * 2.2));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 5.0));
    }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    // focus on the subject's eye region (rack focus is naturally smoothed)
    if (f) {
      const eye = f.headPosition(new THREE.Vector3()).addScaledVector(f.loc.forward, -f.SL * 0.1);
      const target = this.shot.type === 'wide' ? f.loc.pos.distanceTo(cam.position) : eye.distanceTo(cam.position);
      this.focus += (target - this.focus) * (1 - Math.exp(-dt * 4));
    }
    this.fStop = this.shot.fStop;
  }

  /** Hand the current framing to the orbit controls. */
  release(controls) {
    controls.target.copy(this.camLook);
    this.app.camera.fov = 34;
    this.app.camera.updateProjectionMatrix();
  }
}
