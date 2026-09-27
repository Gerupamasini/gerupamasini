// Behaviour for a pair of butterflyfish: cruise, pick at coral, stay together, and keep
// clear of the glass, the surface, the sand and the rock work.
import * as THREE from 'three';
import { TANK } from './config.js';
import { mulberry32 } from './noise.js';

const BOUNDS = { x: TANK.w / 2 - 0.09, zN: TANK.d / 2 - 0.07, yMin: 0.13, yMax: TANK.level - 0.07 };

export class Butterflyfish {
  constructor(model, { scale = 0.11, seed = 1, start = new THREE.Vector3(), leader = null, obstacles = [] }) {
    this.model = model;
    this.rnd = mulberry32(seed);
    this.obj = new THREE.Group();
    this.obj.add(model.group);
    model.group.scale.setScalar(scale);
    this.scale = scale;
    this.p = start.clone();
    this.yaw = this.rnd() * Math.PI * 2; this.pitch = 0; this.roll = 0;
    this.speed = 0.06;
    this.leader = leader; this.obstacles = obstacles;
    this.target = this.pickTarget();
    this.mode = 'cruise'; this.modeT = 0;
    this.turnRate = 0;
    this.t = 0;
  }
  pickTarget() {
    const r = this.rnd;
    // favour the open water in front of the rock work
    return new THREE.Vector3((r() * 2 - 1) * BOUNDS.x * 0.85, 0.2 + r() * (BOUNDS.yMax - 0.2), -0.06 + r() * (BOUNDS.zN + 0.06));
  }
  update(dt) {
    this.t += dt;
    this.modeT -= dt;
    const fwd = new THREE.Vector3(Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.sin(this.yaw) * Math.cos(this.pitch));
    let goal = this.target.clone();
    if (this.leader) {
      // stay a body length or two beside / behind the partner
      const off = new THREE.Vector3(-Math.cos(this.leader.yaw), 0, Math.sin(this.leader.yaw)).multiplyScalar(0.2)
        .add(new THREE.Vector3(Math.sin(this.leader.yaw), 0.35, Math.cos(this.leader.yaw)).multiplyScalar(0.12));
      goal = this.leader.p.clone().add(off);
    } else if (this.p.distanceTo(this.target) < 0.08 || this.modeT < -12) {
      this.target = this.pickTarget(); this.modeT = 0;
      // sometimes hover and pick at something
      if (this.rnd() < 0.35) { this.mode = 'hover'; this.modeT = 2 + this.rnd() * 3; } else this.mode = 'cruise';
    }
    if (this.mode === 'hover' && this.modeT < 0) this.mode = 'cruise';

    // steering: seek + avoid
    const desired = goal.clone().sub(this.p);
    const dist = desired.length();
    desired.normalize();
    const avoid = new THREE.Vector3();
    const wall = (d, n, k = 0.1) => { if (d < k) avoid.addScaledVector(n, Math.pow(1 - d / k, 2) * 3); };
    wall(BOUNDS.x + 0.06 - this.p.x, new THREE.Vector3(-1, 0, 0));
    wall(this.p.x + BOUNDS.x + 0.06, new THREE.Vector3(1, 0, 0));
    wall(BOUNDS.zN + 0.05 - this.p.z, new THREE.Vector3(0, 0, -1), 0.08);
    wall(this.p.z + BOUNDS.zN + 0.05, new THREE.Vector3(0, 0, 1), 0.08);
    wall(BOUNDS.yMax + 0.04 - this.p.y, new THREE.Vector3(0, -1, 0), 0.08);
    wall(this.p.y - BOUNDS.yMin + 0.04, new THREE.Vector3(0, 1, 0), 0.08);
    for (const o of this.obstacles) {
      const d = this.p.distanceTo(o.c) - o.r;
      if (d < 0.08) avoid.addScaledVector(this.p.clone().sub(o.c).normalize(), Math.pow(1 - Math.max(d, 0) / 0.08, 2) * 2.5);
    }
    if (this.leader) {
      const d = this.p.distanceTo(this.leader.p);
      if (d < 0.12) avoid.addScaledVector(this.p.clone().sub(this.leader.p).normalize(), (1 - d / 0.12) * 3);
    }
    const steer = desired.add(avoid).normalize();
    const wantYaw = Math.atan2(-steer.z, steer.x);
    let dy = wantYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const maxTurn = this.mode === 'hover' ? 0.8 : 1.4;
    const tr = THREE.MathUtils.clamp(dy * 2.0, -maxTurn, maxTurn);
    this.turnRate += (tr - this.turnRate) * Math.min(1, dt * 3);
    this.yaw += this.turnRate * dt;
    const wantPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(steer.y, -1, 1)), -0.35, 0.35) + (this.mode === 'hover' ? -0.25 : 0);
    this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 1.5);
    let wantSpeed = this.mode === 'hover' ? 0.012 : 0.05 + 0.03 * Math.sin(this.t * 0.3 + this.yaw);
    if (this.leader) wantSpeed = THREE.MathUtils.clamp(dist * 0.7, 0.02, 0.12);
    this.speed += (wantSpeed - this.speed) * Math.min(1, dt * 1.2);
    this.p.addScaledVector(fwd, this.speed * dt);
    this.p.x = THREE.MathUtils.clamp(this.p.x, -BOUNDS.x - 0.05, BOUNDS.x + 0.05);
    this.p.z = THREE.MathUtils.clamp(this.p.z, -BOUNDS.zN - 0.04, BOUNDS.zN + 0.04);
    this.p.y = THREE.MathUtils.clamp(this.p.y, BOUNDS.yMin - 0.04, BOUNDS.yMax + 0.04);
    this.roll += (-this.turnRate * 0.12 - this.roll) * Math.min(1, dt * 2);

    this.obj.position.copy(this.p);
    this.obj.rotation.set(0, 0, 0);
    this.obj.rotateY(this.yaw);
    this.obj.rotateZ(this.pitch);
    this.obj.rotateX(this.roll);
    // swimming: faster tail beat with speed, body arcs into turns
    const sp = this.speed / this.scale;       // body lengths per second
    this.model.update(dt, this.t, {
      amp: 0.015 + Math.min(sp, 1.2) * 0.035,
      freq: 0.6 + Math.min(sp, 1.5) * 0.9,
      turn: THREE.MathUtils.clamp(-this.turnRate * 0.12, -0.25, 0.25),
    });
  }
}
