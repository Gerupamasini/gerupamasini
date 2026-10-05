import { Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { AsariModel, ANATOMY, makeAsariPreview, sharedGeometry } from './AsariModel.js';
import { AsariBehavior, STATE } from './AsariBehavior.js';
import { makeShellOuterMaterial } from './AsariMaterial.js';

export { STATE };

/** distances from the player (m) for the three LODs */
const LOD0_DIST = 0.6;
const LOD1_DIST = 2.5;
/** threat: someone right on top of the clam, or approaching fast (footfall vibration) */
const THREAT_NEAR = 0.45;
const THREAT_FAST_DIST = 2.2;
const THREAT_FAST_SPEED = 0.9;

const X = new Vector3(1, 0, 0), Z = new Vector3(0, 0, 1);
const qLie = new Quaternion(), qUp = new Quaternion(), qTmp = new Quaternion(), qRock = new Quaternion();
const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3();

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * アサリ driver: builds the procedural model in attach(), runs AsariBehavior, and poses the rig against the
 * terrain every frame (burial depth, rocking, siphon length to reach the surface, sand clipping and decal).
 */
export class AsariDriver {
  constructor() {
    this.root = null;
    this.ind = null;
    this.model = null;
    this.beh = null;
    this.listeners = new Set();
    this.busy = false;
    this.scale = 0.035;
    this.tmp = new Vector3();
    this.lastPlayer = new Vector3();
    this.playerSpeed = 0;
    this.drift = new Vector3();
  }

  /** an empty holder; the clam is built once the individual (seeds, size) is known */
  static makeModel() {
    const root = new Group();
    root.name = 'Asari';
    return { root, parts: {}, length: 0.035 };
  }

  static makePreview() {
    const m = makeAsariPreview();
    m.root.rotation.set(0, 0.6, 0);
    return m.root;
  }

  attach(root, individual) {
    this.root = root;
    this.ind = individual;
    const h = hashString(individual.id);
    const rand = mulberry(h);
    this.scale = individual.length_mm / 1000;
    this.model = new AsariModel({ shellPatternSeed: rand(), shellColorSeed: rand() });
    this.model.root.scale.setScalar(this.scale);
    root.position.set(individual.pos.x, individual.pos.y, individual.pos.z);
    root.rotation.set(0, individual.heading, 0);
    root.add(this.model.root, this.model.decal);
    this.model.decal.scale.setScalar(this.scale * 0.8);
    // most are found buried; a few lie on the sand (washed out / dropped) and dig in
    const onSurface = rand() < 0.2;
    this.lieSide = rand() < 0.5 ? 1 : -1;
    this.uprightTilt = -1.05 + (rand() - 0.5) * 0.25;
    this.beh = new AsariBehavior(rand, onSurface);
    this.beh.onEvent((id) => this.emit(id));
    this.drift.set(0, 0, 0);
  }

  detach() {
    this.model?.dispose();
    this.model = null;
    this.root = null;
  }

  setIntent(intent) {
    this.busy = true;
    this.intentTimer = intent.seconds > 0 ? intent.seconds : 5;
    if (!this.beh) return;
    if (intent.kind === 'burrow') this.beh.request('reposition');
    else if (intent.kind === 'flee' || intent.kind === 'display') this.beh.request('threat');
  }

  update(dt, ctx) {
    const root = this.root, ind = this.ind, m = this.model, b = this.beh;
    if (!root || !ind || !m || !b) return;
    const sdt = Math.min(0.1, dt * ctx.simScale);
    this.intentTimer = (this.intentTimer ?? 0) - sdt;
    if (this.intentTimer <= 0) this.busy = false;

    const ground = ctx.floor.heightAt(ind.pos.x, ind.pos.z);
    const water = ctx.floor.waterAt(ind.pos.x, ind.pos.z);
    const submerged = water - ground > 0.01;
    const dist = Math.hypot(ctx.player.x - ind.pos.x, ctx.player.z - ind.pos.z);
    if (dt > 0) {
      const sp = Math.hypot(ctx.player.x - this.lastPlayer.x, ctx.player.z - this.lastPlayer.z) / dt;
      this.playerSpeed += (Math.min(sp, 10) - this.playerSpeed) * Math.min(1, dt * 4);
    }
    this.lastPlayer.copy(ctx.player);
    const threat = dist < THREAT_NEAR || (dist < THREAT_FAST_DIST && this.playerSpeed > THREAT_FAST_SPEED) || ind.alert > 0.7;

    b.update(sdt, { threat, submerged });

    // ---- LOD
    const lod = ctx.locked || dist < LOD0_DIST ? 0 : dist < LOD1_DIST ? 1 : 2;
    m.setLod(lod);

    // ---- body pose: lying on a valve → upright, posterior up, anterior-ventral end in the sand
    const L = this.scale;
    const tilt = smooth(0, 0.35, b.burial);
    qLie.setFromAxisAngle(X, -this.lieSide * Math.PI / 2);
    qUp.setFromAxisAngle(Z, this.uprightTilt);
    qTmp.slerpQuaternions(qLie, qUp, tilt);
    qRock.setFromAxisAngle(Z, b.rock);
    qTmp.multiply(qRock);
    qRock.setFromAxisAngle(X, b.roll);
    qTmp.multiply(qRock);
    m.root.quaternion.copy(qTmp);
    // lying on a valve, the foot probes obliquely down into the sand rather than along it
    m.foot.rotation.set(0, this.lieSide * (1 - tilt) * 0.8, ANATOMY.footDir);
    // lying on a valve: half-width 0.26 L, sunk ~0.06 L into the sand; buried upright the shell top (~0.46 L above
    // its centre at this tilt) sits ~0.23 L under the surface
    const centreY = 0.2 + (-0.69 - 0.2) * smooth(0.12, 1, b.burial);
    // pulled toward the foot during each stroke (a small lasting drift too)
    v1.set(Math.cos(ANATOMY.footDir), Math.sin(ANATOMY.footDir), 0).applyQuaternion(qTmp);
    v1.y = 0;
    if (b.pull > 0) this.drift.addScaledVector(v1, b.pull * sdt * 0.4).clampLength(0, 0.25);
    root.position.set(ind.pos.x, ground, ind.pos.z);
    m.root.position.set((this.drift.x + v1.x * b.pull) * L, centreY * L, (this.drift.z + v1.z * b.pull) * L);

    // ---- siphons long enough to just break the surface
    root.updateMatrixWorld(true);
    const siphonLen = (spec, grp) => {
      v2.copy(spec.root).applyMatrix4(m.root.matrixWorld);
      v3.set(1, 0, 0).transformDirection(grp.matrixWorld);
      const below = (ground - v2.y) / L;
      const up = Math.max(0.35, v3.y);
      // the openings sit just proud of the sand (reference 049: two fringed holes almost flush)
      return Math.min(0.9, Math.max(0.12, below / up + 0.012));
    };
    const reach = b.burial > 0.5 ? siphonLen(ANATOMY.siphonIn, m.siphonIn.grp) : 0.16;
    const reachOut = b.burial > 0.5 ? siphonLen(ANATOMY.siphonOut, m.siphonOut.grp) : 0.13;
    const ext = b.extOut, open = b.openOut;
    const sIn = { len: 0.03 + ext * reach, open, swayY: b.swayY, swayZ: b.swayZ };
    const sOut = { len: 0.03 + ext * (reachOut + 0.015), open: open * 0.8 + 0.1, swayY: b.swayY, swayZ: b.swayZ * 1.08 };   // fused: they move together
    m.pose(b.gapeOut, b.foot, sIn, sOut, b.breath * b.gapeOut);
    // fully under the sand: skip the shell draws altogether
    const buriedDeep = b.burial > 0.97;
    m.left.pivot.visible = m.right.pivot.visible = m.left.mantlePivot.visible = m.right.mantlePivot.visible = !buriedDeep;
    m.softBody.visible = !buriedDeep && lod < 2;
    m.setSand(ground, 0.06, submerged ? 1 : 0.8, true);

    // ---- sand decal: contact shadow, disturbance, siphon holes
    m.decal.position.set(0, 0.0015, 0);
    const du = m.mats.decal.userData.uniforms;
    const holes = smooth(0.85, 1, b.burial);
    du.uDecal.value.set(b.disturb * 0.75, holes, 0, (1 - smooth(0.4, 0.9, b.burial)) * 0.6);
    if (holes > 0) {
      // the holes sit under the deformed siphon tips (same bend as the vertex shader: offset = sway · L at t = 1)
      // (plus the Y fork baked into the geometry: the inhalant tip parts ventrally, the exhalant dorsally)
      const tip = (out, s, grp, fork) => out.set(s.len, s.swayY * s.len + fork, s.swayZ * s.len).applyMatrix4(grp.matrixWorld);
      tip(v2, sIn, m.siphonIn.grp, ANATOMY.siphonFork); tip(v3, sOut, m.siphonOut.grp, -ANATOMY.siphonFork);
      root.worldToLocal(v2); root.worldToLocal(v3);
      const half = this.scale * 0.8;
      const mx = (v2.x + v3.x) / (2 * half), mz = (v2.z + v3.z) / (2 * half);
      const dx = v2.x - v3.x, dz = v2.z - v3.z;
      du.uDecal.value.z = Math.hypot(dx, dz) / half;
      du.uHole.value.set(mx, mz, -Math.atan2(dz, dx), open * ext);
    }
    ind.pos.y = ground;
  }

  onEvent(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(behaviorId) {
    if (!this.ind) return;
    const e = { individualId: this.ind.id, behaviorId, t: performance.now() };
    for (const l of this.listeners) l(e);
  }

  anchor() {
    return this.root ? this.tmp.copy(this.root.position).add(v1.set(0, 0.01, 0)) : this.tmp.set(0, 0, 0);
  }

  get state() { return this.beh?.state; }

  dispose() {
    this.detach();
    this.listeners.clear();
  }
}

/**
 * A dense bed of static shells (dead valves, distant clams lying on the sand): one InstancedMesh with the
 * LOD2 valve geometry and the shared shell shader; each instance gets its own shellPatternSeed /
 * shellColorSeed through the `aSeed` attribute. One draw call for the whole bed.
 *
 * @param {{ x: number, y: number, z: number, length_m: number, yaw?: number }[]} items
 */
export function createAsariBed(items, lod = 2) {
  const geo = sharedGeometry().valve[lod].clone();
  const mat = makeShellOuterMaterial({ instanced: true });
  mat.userData.uniforms.uSand.value.set(-1e9, 0.04, 0, 0.8);
  const mesh = new InstancedMesh(geo, mat, items.length);
  const seeds = new Float32Array(items.length * 4);
  const o = new Object3D();
  const m4 = new Matrix4();
  items.forEach((it, i) => {
    const r = mulberry(i * 7919 + 17);
    // valves lie convex side up, half-sunk
    o.position.set(it.x, it.y - it.length_m * 0.01, it.z);   // the margin rests on (just in) the sand
    o.rotation.set(-Math.PI / 2 + (r() - 0.5) * 0.3, it.yaw ?? r() * Math.PI * 2, (r() - 0.5) * 0.3, 'YXZ');
    o.scale.setScalar(it.length_m);
    o.updateMatrix();
    m4.copy(o.matrix);
    mesh.setMatrixAt(i, m4);
    seeds.set([r(), r(), 1, lod === 2 ? 0 : 0.5], i * 4);
  });
  geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
  mesh.name = 'AsariBed';
  return mesh;
}
