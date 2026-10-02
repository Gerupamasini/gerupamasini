// Shared state for all ユビナガホンヤドカリ in one scene: the other crabs, food items, empty shells.
// The game's creature system has no food or neighbour model, so the hermit crabs keep their own:
//  * food: carrion fragments and Ulva pieces (omnivore, scavenges carcasses, eats algae [D]); deposit
//    feeding on the sediment surface needs no object
//  * empty gastropod shells lying on the substrate (shell inspection / exchange)
//  * neighbours for avoidance, aggregation and food convergence ("others gather once one finds food" [D])
// One World per THREE.Scene (field, tank and zukan preview are separate).
import * as THREE from 'three';
import { Shell, chooseShellFor } from './PagurusMinutusShell.js';
import { SeededRandom, clamp } from './PagurusMinutusUtil.js';

const worlds = new WeakMap();
let nextId = 1;

function sceneOf(obj) {
  let o = obj;
  while (o && o.parent) o = o.parent;
  return o;
}

const FOOD_KINDS = {
  carrion: { color: '#e7d2c3', roughness: 0.55, size: [0.0025, 0.005], nutrition: 1.0 },
  algae: { color: '#5f9a3c', roughness: 0.7, size: [0.004, 0.008], nutrition: 0.45 },
};

const geoCache = {};
function foodGeometry(kind) {
  if (geoCache[kind]) return geoCache[kind];
  let g;
  if (kind === 'algae') {
    // a crumpled Ulva fragment: thin wavy sheet
    g = new THREE.PlaneGeometry(1, 1, 8, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, 0.08 * Math.sin(x * 9 + y * 4) + 0.05 * Math.sin(y * 13));
      const r = Math.hypot(x, y);
      const edge = 0.5 + 0.12 * Math.sin(Math.atan2(y, x) * 5);
      if (r > edge) { p.setX(i, x * edge / r); p.setY(i, y * edge / r); }
    }
    g.rotateX(-Math.PI / 2);
  } else {
    // a soft flesh fragment: lumpy blob
    g = new THREE.IcosahedronGeometry(0.5, 2);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + 0.22 * Math.sin(v.x * 7.1) * Math.sin(v.y * 5.3 + 1) * Math.sin(v.z * 6.2 + 2);
      v.multiplyScalar(n);
      v.y *= 0.55;
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  geoCache[kind] = g;
  return g;
}

const matCache = {};
function foodMaterial(kind) {
  if (!matCache[kind]) {
    const k = FOOD_KINDS[kind];
    matCache[kind] = new THREE.MeshStandardMaterial({ color: k.color, roughness: k.roughness, metalness: 0, side: kind === 'algae' ? THREE.DoubleSide : THREE.FrontSide });
  }
  return matCache[kind];
}

export class PagurusWorld {
  /** the world of the scene `obj` lives in (created on demand) */
  static of(obj) {
    const scene = sceneOf(obj);
    let w = worlds.get(scene);
    if (!w) {
      w = new PagurusWorld(scene);
      worlds.set(scene, w);
    }
    return w;
  }

  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'pagurus-world';
    if (scene && scene.isObject3D) scene.add(this.group);
    this.crabs = new Set();
    this.foods = [];
    this.shells = [];
    this.rng = new SeededRandom(1234);
    this.spawnTimer = 20;
    this.time = 0;
    this.lastUpdateFrame = -1;
    this.autoSpawn = true;
  }

  register(crab) { this.crabs.add(crab); }
  unregister(crab) { this.crabs.delete(crab); }

  // ── food ───────────────────────────────────────────────────────────────────────────────────
  addFood(kind, pos, groundAt, size) {
    const k = FOOD_KINDS[kind];
    const s = size ?? this.rng.range(k.size[0], k.size[1]);
    const mesh = new THREE.Mesh(foodGeometry(kind), foodMaterial(kind));
    mesh.scale.setScalar(s);
    mesh.rotation.y = this.rng.range(0, Math.PI * 2);
    const y = groundAt ? groundAt(pos.x, pos.z) : pos.y;
    mesh.position.set(pos.x, y + (kind === 'algae' ? s * 0.06 : s * 0.22), pos.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `food-${kind}`;
    this.group.add(mesh);
    const f = { id: nextId++, kind, pos: mesh.position.clone(), amount: 1, size: s, nutrition: k.nutrition, mesh, age: 0, claimedBy: new Set() };
    this.foods.push(f);
    return f;
  }

  /** a crab takes a bite: the item shrinks gradually instead of vanishing */
  biteFood(f, amount) {
    const take = Math.min(f.amount, amount);
    f.amount -= take;
    const s = f.size * (0.35 + 0.65 * Math.cbrt(Math.max(0, f.amount)));
    f.mesh.scale.setScalar(s);
    if (f.amount <= 0.02) this.removeFood(f);
    return take * f.nutrition;
  }

  removeFood(f) {
    const i = this.foods.indexOf(f);
    if (i >= 0) this.foods.splice(i, 1);
    f.mesh.removeFromParent();
    f.amount = 0;
  }

  // ── empty shells ───────────────────────────────────────────────────────────────────────────
  /** place an empty shell lying on the substrate (aperture sideways/down, random yaw) */
  addShell(spec, pos, groundAt) {
    const shell = spec instanceof Shell ? spec : new Shell(spec);
    const entry = { id: nextId++, shell, pos: new THREE.Vector3(), free: true, rejectedBy: new Map(), handledBy: null };
    this.group.add(shell.object3D);
    this.restShell(entry, pos, groundAt, this.rng.range(0, Math.PI * 2));
    this.shells.push(entry);
    return entry;
  }

  /** lay a shell to rest: carry frame rotated onto its side, lowest hull point on the ground */
  restShell(entry, pos, groundAt, yaw = 0) {
    const shell = entry.shell;
    const o = shell.object3D;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // lying with the aperture facing sideways-down (a shell on a flat bed rests on its body whorl)
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI * 0.42));
    q.multiply(shell.carry.quaternion);
    o.quaternion.copy(q);
    o.position.set(pos.x, 0, pos.z);
    o.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const p of shell.hullWorld()) lowest = Math.min(lowest, p.y - (groundAt ? groundAt(p.x, p.z) : 0));
    o.position.y -= lowest;
    o.updateMatrixWorld(true);
    entry.pos.copy(o.position);
    shell.object3D.userData.restQuat = o.quaternion.clone();
    shell.object3D.userData.restPos = o.position.clone();
  }

  /** register a shell that is already placed in the world (e.g. the one a crab just left) and let it settle */
  adoptShell(shell, groundAt) {
    this.group.attach(shell.object3D);
    const o = shell.object3D;
    o.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const p of shell.hullWorld()) lowest = Math.min(lowest, p.y - (groundAt ? groundAt(p.x, p.z) : 0));
    if (isFinite(lowest)) o.position.y -= lowest;
    o.updateMatrixWorld(true);
    const entry = { id: nextId++, shell, pos: o.position.clone(), free: true, rejectedBy: new Map(), handledBy: null };
    o.userData.restQuat = o.quaternion.clone();
    o.userData.restPos = o.position.clone();
    this.shells.push(entry);
    return entry;
  }

  removeShell(entry) {
    const i = this.shells.indexOf(entry);
    if (i >= 0) this.shells.splice(i, 1);
  }

  // ── queries ────────────────────────────────────────────────────────────────────────────────
  neighbors(pos, r, except) {
    const out = [];
    for (const c of this.crabs) {
      if (c === except || !c.active) continue;
      const d = Math.hypot(c.loco.position.x - pos.x, c.loco.position.z - pos.z);
      if (d < r) out.push({ crab: c, d });
    }
    return out;
  }

  nearbyFood(pos, r) {
    const out = [];
    for (const f of this.foods) {
      const d = Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z);
      if (d < r) out.push({ food: f, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  nearbyShells(pos, r) {
    const out = [];
    for (const s of this.shells) {
      if (!s.free) continue;
      const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
      if (d < r) out.push({ entry: s, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  /** obstacles for body/shell collision: other crabs' shells and bodies, empty shells */
  obstacles(x, z, r, except) {
    const out = [];
    const tmp = new THREE.Vector3();
    for (const c of this.crabs) {
      if (c === except || !c.active || (except && except.partner === c)) continue; // a guarding pair touches
      const sp = c.shellCenterOffset(tmp).add(c.loco.position);
      if (Math.hypot(sp.x - x, sp.z - z) < r + c.radius) out.push({ x: sp.x, z: sp.z, r: c.shell ? c.shell.radius * 0.5 : 0.6 * c.SL, soft: true });
      if (Math.hypot(c.loco.position.x - x, c.loco.position.z - z) < r + c.radius) out.push({ x: c.loco.position.x, z: c.loco.position.z, r: 0.9 * c.SL, soft: true });
    }
    for (const s of this.shells) {
      if (s.handledBy && s.handledBy === except) continue;
      if (Math.hypot(s.pos.x - x, s.pos.z - z) < r + s.shell.radius) out.push({ x: s.pos.x, z: s.pos.z, r: s.shell.radius * 0.45, soft: false });
    }
    return out;
  }

  /** extra height of loose objects (empty shells) at a point, so feet can step onto them */
  bumpAt(x, z) {
    let h = 0;
    for (const s of this.shells) {
      const r = s.shell.radius * 0.45;
      const d = Math.hypot(s.pos.x - x, s.pos.z - z);
      if (d < r) h = Math.max(h, s.shell.radius * 0.5 * Math.sqrt(1 - (d * d) / (r * r)));
    }
    return h;
  }

  // ── upkeep ─────────────────────────────────────────────────────────────────────────────────
  /**
   * Keep a little food and a few empty shells around the crabs (rate limited). Called by every crab;
   * runs once per frame.
   */
  update(dt, frame, groundAt, waterAt) {
    if (frame === this.lastUpdateFrame) return;
    this.lastUpdateFrame = frame;
    this.time += dt;
    for (const f of [...this.foods]) {
      f.age += dt;
      if (f.age > 600) this.removeFood(f);
    }
    if (!this.autoSpawn || this.crabs.size === 0 || !groundAt) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.rng.range(25, 70);
    const crabs = [...this.crabs].filter((c) => c.active);
    if (!crabs.length) return;
    const c = this.rng.pick(crabs);
    const p = c.loco.position;
    const SL = c.SL;
    const near = (r) => {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(r * 0.4, r);
      return new THREE.Vector3(p.x + Math.sin(a) * d, 0, p.z + Math.cos(a) * d);
    };
    const foodNear = this.nearbyFood(p, 60 * SL).length;
    if (foodNear < Math.max(1, Math.round(crabs.length / 6))) {
      const kind = this.rng.chance(0.6) ? 'carrion' : 'algae';
      this.addFood(kind, near(40 * SL), groundAt);
    }
    const shellsNear = this.nearbyShells(p, 50 * SL).length;
    if (shellsNear < Math.max(1, Math.round(crabs.length / 4)) && this.shells.length < 24) {
      const spec = chooseShellFor(c.shieldLength_mm * this.rng.range(0.8, 1.35), this.rng);
      this.addShell(spec, near(30 * SL), groundAt);
    }
  }

  dispose() {
    for (const f of [...this.foods]) this.removeFood(f);
    for (const s of this.shells) s.shell.dispose();
    this.shells.length = 0;
    this.group.removeFromParent();
  }
}

export { FOOD_KINDS, clamp };
