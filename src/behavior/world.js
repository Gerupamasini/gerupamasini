// Minimal environment (04 §4.4): 1-D stream flowing toward -X, a rock with a wake (cover), drifting prey, registered threats. No three.js.
import { mulberry32 } from './rng.js';

export class World {
  /** u_mean: m/s; rock: {x,z,r}; bedY: bed height (m, world Y); all [E] defaults from 04 §4.4. */
  constructor({ seed = 1, u_mean = 0.25, rock = { x: -0.9, z: 0.55, r: 0.15 }, bedY = -0.075, drift_rate = 0.06, area = { zmax: 0.4, ymin: 0.0, ymax: 0.12 } } = {}) {
    this.rng = mulberry32(seed); this.u_mean = u_mean; this.rock = rock; this.bedY = bedY; this.drift_rate = drift_rate; this.area = area;
    this.prey = []; this.threats = []; this.t = 0; this.nextId = 1; this.spawnAcc = 0; this.temp_C = 12; this.daylight = 1;
  }
  /** Water velocity at (x,y,z) in m/s [vx, vz]; flow points to -X. Wake behind the rock (downstream = smaller x) is 0.3x (04 §4.4.1). */
  flowAt(x, z, y = 0) {
    const h = Math.max(0.005, y - this.bedY); let u = this.u_mean * Math.min(1.4, Math.pow(h / 0.15, 1 / 7));
    const r = this.rock; if (r) {
      const dx = x - r.x, dz = z - r.z;
      if (dx < r.r * 0.5 && dx > -2 * 2 * r.r && Math.abs(dz) < r.r * 1.1) u *= 0.3;
      if (Math.hypot(dx, dz) < r.r) u *= 0.05;
    }
    return [-u, 0];
  }
  addThreat(th) { th.id = th.id ?? `th${this.nextId++}`; this.threats.push(th); return th; }
  update(dt) {
    this.t += dt;
    this.spawnAcc += this.drift_rate * dt * 4;     // cross-section ~4 m^2 wide channel slice [E]
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1; const a = this.area;
      this.prey.push({ id: `pr${this.nextId++}`, x: 2.2, z: (this.rng() * 2 - 1) * a.zmax, y: a.ymin + this.rng() * (a.ymax - a.ymin), size_BL: 0.01 + this.rng() * 0.02, terrestrial: this.rng() < 0.5, alive: true, wob: this.rng() * 6.28 });
    }
    for (const p of this.prey) { const [fx, fz] = this.flowAt(p.x, p.z, p.y); p.x += fx * dt; p.z += fz * dt; p.wob += dt * 3; if (p.x < -3) p.alive = false; }
    this.prey = this.prey.filter((p) => p.alive);
    for (const th of this.threats) { th.pos[0] += th.vel[0] * dt; th.pos[1] += th.vel[1] * dt; th.pos[2] += th.vel[2] * dt; }
    this.threats = this.threats.filter((th) => !th.expire || this.t < th.expire);
  }
}
