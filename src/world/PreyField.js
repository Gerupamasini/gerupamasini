import * as THREE from 'three';
import { makeRng } from '../core/math.js';

// Intertidal prey for a visually hunting plover. Cues are what the bird detects (S19, S21):
// worms surfacing intermittently, crabs moving, amphipods hopping. Density follows the surface
// (SurfaceTypes.preyProbability) × time since emersion (S15). Items are generated lazily per cell
// so the whole flat never has to be simulated.

export const PREY_TYPES = {
  polychaete: {
    // ragworm (Hediste/Nereis) — main prey by biomass (S16)
    weights: { wetMud: 1.0, mud: 0.6, wetSand: 0.35, shallowWater: 0.2 },
    cueOn: [1.2, 3.5],
    cueOff: [3, 11],
    detectRange: 1.8,
    energy: 1.0,
    approach: 'run-then-creep',
    handling: 'pull',
  },
  crab: {
    weights: { wetMud: 0.55, mud: 0.45, wetSand: 0.45, sand: 0.2, shallowWater: 0.3 },
    cueOn: [2, 6],
    cueOff: [2, 6],
    detectRange: 2.6,
    energy: 1.4,
    approach: 'sprint', // must be caught before it reaches its burrow
    handling: 'shake',
    fleeDistance: 0.8,
  },
  amphipod: {
    weights: { wetSand: 1.0, sand: 0.5, shallowWater: 0.6, wetMud: 0.3 },
    cueOn: [0.25, 0.5],
    cueOff: [0.8, 3.5],
    detectRange: 1.0,
    energy: 0.25,
    approach: 'walk',
    handling: 'swallow',
  },
  insect: {
    weights: { drySand: 0.8, vegetation: 1.0, sand: 0.4 },
    cueOn: [1, 3],
    cueOff: [1, 4],
    detectRange: 1.3,
    energy: 0.3,
    approach: 'walk',
    handling: 'swallow',
  },
};

const CELL = 2; // m
const BASE_DENSITY = 0.8; // potential items per m² at preyFactor 1 (visible cue at any moment ≈ 25–40% of them)

export class PreyField {
  constructor(terrain, tide, { seed = 3 } = {}) {
    this.terrain = terrain;
    this.tide = tide;
    this.seed = seed;
    this.cells = new Map();
    this.time = 0;
    this.eaten = 0;
    this._id = 1;
  }

  _key(ix, iz) {
    return `${ix},${iz}`;
  }

  _cell(ix, iz) {
    const k = this._key(ix, iz);
    let c = this.cells.get(k);
    const x = (ix + 0.5) * CELL;
    const z = (iz + 0.5) * CELL;
    const s = this.terrain.surfaceAt(x, z);
    // regenerate when the cell was flooded (new tide → new prey activity) or never created
    const submerged = s.key === 'deepWater';
    if (!c || (submerged && !c.submerged)) {
      c = { ix, iz, items: [], submerged, surfaceKey: s.key, depletion: 0, t: this.time };
      if (!submerged) this._populate(c, s);
      this.cells.set(k, c);
    } else if (!submerged && c.submerged) {
      c.submerged = false;
      c.items = [];
      this._populate(c, s);
    }
    c.submerged = submerged;
    return c;
  }

  _populate(c, s) {
    const rng = makeRng((c.ix * 73856093) ^ (c.iz * 19349663) ^ (this.seed * 83492791) ^ Math.floor(this.tide.time / 44712));
    for (const [type, def] of Object.entries(PREY_TYPES)) {
      const w = def.weights[s.key] ?? 0;
      if (w <= 0) continue;
      const mean = BASE_DENSITY * CELL * CELL * w * Math.max(0.15, s.preyFactor / Math.max(0.05, s.def.preyProbability || 1)) * (s.def.preyProbability > 0 ? 1 : 0);
      // Poisson sample
      let n = 0;
      let L = Math.exp(-mean);
      let p = rng();
      while (p > L && n < 20) {
        n++;
        p *= rng();
      }
      for (let i = 0; i < n; i++) {
        const x = (c.ix + rng()) * CELL;
        const z = (c.iz + rng()) * CELL;
        c.items.push({
          id: this._id++,
          type,
          def,
          home: new THREE.Vector3(x, 0, z),
          pos: new THREE.Vector3(x, this.terrain.heightAt(x, z), z),
          phase: rng() * 20,
          on: rng.range(def.cueOn[0], def.cueOn[1]),
          off: rng.range(def.cueOff[0], def.cueOff[1]),
          alive: true,
          burrowed: 0, // crab escape time
          heading: rng() * Math.PI * 2,
          claimedBy: null,
        });
      }
    }
  }

  /** Is the item currently giving a visual cue? (deterministic from its phase → no per-frame cost) */
  cueActive(item) {
    if (!item.alive) return false;
    if (item.burrowed > this.time) return false;
    const period = item.on + item.off;
    return (this.time + item.phase) % period < item.on;
  }

  _updateItem(item) {
    if (item.type === 'crab' && this.cueActive(item)) {
      // slow wander around its burrow
      const t = this.time * 0.25 + item.phase;
      item.pos.set(item.home.x + Math.sin(t) * 0.18, 0, item.home.z + Math.cos(t * 0.8) * 0.18);
      item.pos.y = this.terrain.heightAt(item.pos.x, item.pos.z);
    }
  }

  update(realDt) {
    this.time += realDt;
  }

  /** Items within radius of p (creates cells on demand). */
  query(p, radius, out = []) {
    out.length = 0;
    const i0 = Math.floor((p.x - radius) / CELL);
    const i1 = Math.floor((p.x + radius) / CELL);
    const k0 = Math.floor((p.z - radius) / CELL);
    const k1 = Math.floor((p.z + radius) / CELL);
    const r2 = radius * radius;
    for (let ix = i0; ix <= i1; ix++) {
      for (let iz = k0; iz <= k1; iz++) {
        const c = this._cell(ix, iz);
        for (const it of c.items) {
          if (!it.alive) continue;
          this._updateItem(it);
          const dx = it.pos.x - p.x;
          const dz = it.pos.z - p.z;
          if (dx * dx + dz * dz <= r2) out.push(it);
        }
      }
    }
    return out;
  }

  /** A predator approaching fast makes crabs dash into their burrows. */
  disturb(item, birdPos, birdSpeed) {
    if (item.type !== 'crab' || !item.alive) return;
    const d = Math.hypot(item.pos.x - birdPos.x, item.pos.z - birdPos.z);
    if (d < item.def.fleeDistance && birdSpeed < 0.9) item.burrowed = this.time + 6 + (item.phase % 5);
  }

  consume(item) {
    item.alive = false;
    this.eaten++;
  }

  // ------------------------------------------------------------------ rendering of visible cues
  createVisuals(scene) {
    const mk = (geo, color, count) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }), count);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      scene.add(m);
      return m;
    };
    const worm = new THREE.CapsuleGeometry(0.0012, 0.012, 3, 6);
    worm.translate(0, 0.006, 0);
    const crabBody = new THREE.SphereGeometry(0.006, 10, 6);
    crabBody.scale(1.25, 0.45, 1);
    crabBody.translate(0, 0.003, 0);
    const amph = new THREE.CapsuleGeometry(0.0009, 0.004, 2, 5);
    amph.rotateX(Math.PI / 2);
    amph.translate(0, 0.001, 0);
    const insect = new THREE.SphereGeometry(0.0018, 6, 4);
    insect.scale(1, 0.6, 1.6);
    insect.translate(0, 0.0012, 0);
    this.vis = {
      polychaete: mk(worm, 0x9a4a3c, 400),
      crab: mk(crabBody, 0x4f5144, 400),
      amphipod: mk(amph, 0xc8b9a2, 400),
      insect: mk(insect, 0x2a2622, 400),
    };
  }

  updateVisuals(center, radius = 10) {
    if (!this.vis) return;
    const items = this.query(center, radius, this._visTmp || (this._visTmp = []));
    const counts = { polychaete: 0, crab: 0, amphipod: 0, insect: 0 };
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    for (const it of items) {
      if (!this.cueActive(it)) continue;
      const mesh = this.vis[it.type];
      const i = counts[it.type]++;
      if (i >= 400) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.heading + (it.type === 'crab' ? this.time * 0.3 : 0));
      if (it.type === 'polychaete') q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.5 * Math.sin(this.time * 2 + it.phase)));
      const y = it.type === 'amphipod' ? Math.abs(Math.sin((this.time + it.phase) * 9)) * 0.01 : 0;
      m4.compose(new THREE.Vector3(it.pos.x, it.pos.y + y, it.pos.z), q, s);
      mesh.setMatrixAt(i, m4);
    }
    for (const [k, mesh] of Object.entries(this.vis)) {
      mesh.count = Math.min(400, counts[k]);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
