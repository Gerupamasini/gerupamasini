// Food: floating flakes and sinking pellets. Flakes float for a while
// (surface tension) then sink with a tumbling, drifting descent; pellets sink
// directly (~2–4 cm/s). Items on the gravel remain available for foraging.

import * as THREE from 'three';
import { TANK } from './TankConfig.js';
import { RNG } from '../core/random.js';
import { groundHeight } from './Substrate.js';
import { patchUnderwater } from './UnderwaterMaterial.js';

let FOOD_ID = 0;

export class FoodSystem {
  constructor(scene, max = 160) {
    this.max = max;
    this.items = [];
    this.rng = new RNG(1234);
    const geo = new THREE.SphereGeometry(1, 10, 8);
    const mat = patchUnderwater(new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.7 }), { key: 'food' });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.layers.enable(1);
    scene.add(this.mesh);
    this.m4 = new THREE.Matrix4();
    this.onSplash = null;
  }

  /** Drop a pinch of food at (x, z) on the surface. */
  drop(x, z, n = 8, kind = 'mixed') {
    for (let i = 0; i < n; i++) {
      if (this.items.length >= this.max) this.items.shift();
      const r = this.rng;
      const flake = kind === 'flake' || (kind === 'mixed' && r.next() < 0.55);
      const px = THREE.MathUtils.clamp(x + r.normal(0, 0.03), -TANK.L / 2 + 0.02, TANK.L / 2 - 0.02);
      const pz = THREE.MathUtils.clamp(z + r.normal(0, 0.025), -TANK.D / 2 + 0.02, TANK.D / 2 - 0.02);
      this.items.push({
        id: FOOD_ID++,
        pos: new THREE.Vector3(px, TANK.water - 0.001, pz),
        vel: new THREE.Vector3(),
        flake,
        size: flake ? r.range(0.0022, 0.0035) : r.range(0.0016, 0.0024),
        floatTime: flake ? r.range(4, 25) : r.range(0, 0.4),
        state: 'surface',
        age: 0,
        ph: r.range(0, 6.28),
        claimed: null,
        color: flake ? r.range(0, 1) : 0,
      });
      if (this.onSplash) this.onSplash(px, pz, 0.3);
    }
  }

  get available() {
    return this.items;
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  update(dt, time, flowAt) {
    const tmp = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let n = 0;
    for (const f of this.items) {
      f.age += dt;
      if (f.state === 'surface') {
        f.pos.y = TANK.water - f.size * 0.4;
        f.pos.x += Math.sin(time * 0.3 + f.ph) * 0.002 * dt;
        f.pos.z += Math.cos(time * 0.27 + f.ph) * 0.002 * dt;
        if (f.age > f.floatTime) f.state = 'sinking';
      } else if (f.state === 'sinking') {
        const vs = f.flake ? 0.012 : 0.03;
        f.vel.y += (-vs - f.vel.y) * Math.min(1, dt * 3);
        // tumbling lateral drift of flakes
        f.vel.x = Math.sin(time * 2.1 + f.ph) * (f.flake ? 0.012 : 0.002);
        f.vel.z = Math.cos(time * 1.7 + f.ph) * (f.flake ? 0.01 : 0.002);
        if (flowAt) f.vel.add(flowAt(f.pos, tmp).multiplyScalar(0.5));
        f.pos.addScaledVector(f.vel, dt);
        const g = groundHeight(f.pos.x, f.pos.z) + f.size * 0.5;
        if (f.pos.y <= g) {
          f.pos.y = g;
          f.state = 'bottom';
        }
      }
      f.pos.x = THREE.MathUtils.clamp(f.pos.x, -TANK.L / 2 + 0.005, TANK.L / 2 - 0.005);
      f.pos.z = THREE.MathUtils.clamp(f.pos.z, -TANK.D / 2 + 0.005, TANK.D / 2 - 0.005);
      if (n < this.max) {
        s.set(f.size, f.flake ? f.size * 0.25 : f.size, f.size);
        if (f.flake) q.setFromAxisAngle(tmp.set(1, 0, 0.3).normalize(), Math.sin(time * 3 + f.ph) * (f.state === 'sinking' ? 0.9 : 0.1));
        else q.identity();
        this.m4.compose(f.pos, q, s);
        this.mesh.setMatrixAt(n, this.m4);
        this.mesh.setColorAt(n, new THREE.Color().setHSL(0.07 + f.color * 0.03, 0.6, f.flake ? 0.35 + f.color * 0.2 : 0.3));
        n++;
      }
    }
    // uneaten food decays after a few minutes
    this.items = this.items.filter((f) => f.age < 240);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
