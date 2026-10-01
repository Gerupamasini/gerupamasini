import { Group, MathUtils, Object3D, Vector3, type Material, type Mesh } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Floor, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { hashInts } from '../../../core/Rng';
import { ShrimpModel } from './model/ShrimpModel.js';
import { Shrimp } from './model/Shrimp.js';

/** the procedural model is built at this total length (metres); individuals scale it */
const MODEL_TL = 0.06;

/** What the ported locomotion expects from its world: ground height, flow, bounds and a scene for the antennae. */
class ShrimpWorld {
  time = 0;
  flowBase = new Vector3();
  flowSpeed = 0;
  floor: Floor | null = null;
  bounds: DriverContext['bounds'];
  /** skip the antenna physics (far from the player) */
  cheap = false;
  /** ground height used before the first update hands us the floor (the spawn height) */
  fallbackY = 0;
  constructor(public scene: Object3D) {}
  heightAt(x: number, z: number): number { return this.floor ? this.floor.heightAt(x, z) : this.fallbackY; }
  groundY(x: number, z: number): number { return this.heightAt(x, z); }
  onSediment(p: Vector3): boolean { return p.y - this.heightAt(p.x, p.z) < 0.001; }
  flowAt(_p: Vector3, out: Vector3): Vector3 { return out.set(0, 0, 0); }
  upstreamness(): number { return 0; }
  steer(): void {}
  puff(): void {}
  wake(): void {}
  stimulus(): void {}
  constrain(p: Vector3, _onGround: boolean, vel?: Vector3): void {
    const b = this.bounds;
    if (!b) return;
    if (p.x > b.maxX) { p.x = b.maxX; if (vel && vel.x > 0) vel.x *= -0.3; }
    if (p.x < b.minX) { p.x = b.minX; if (vel && vel.x < 0) vel.x *= -0.3; }
    if (p.z > b.maxZ) { p.z = b.maxZ; if (vel && vel.z > 0) vel.z *= -0.3; }
    if (p.z < b.minZ) { p.z = b.minZ; if (vel && vel.z < 0) vel.z *= -0.3; }
  }
}

interface ShrimpIntent { mode: 'ground' | 'water'; target: Vector3 | null; speed: number; face: Vector3 | null; rheotaxis: number; arms: string; groomPart?: string }

/** The game's intents stand in for the viewer's utility-AI brain. */
class StubBrain {
  s = { fear: 0, fatigue: 0, hunger: 0.3, energy: 1 };
  behavior = 'idle';
  intent: ShrimpIntent = { mode: 'ground', target: null, speed: 0, face: null, rheotaxis: 0, arms: 'rest' };
  update(): void {}
  stimulus(): void {}
}

type Mode = 'idle' | 'walk' | 'swim' | 'forage' | 'flee';

// our heading: forward = (sin h, 0, cos h); the shrimp's yaw: forward = (cos yaw, 0, -sin yaw)
const headingToYaw = (h: number) => Math.atan2(-Math.cos(h), Math.sin(h));
const yawToHeading = (yaw: number) => Math.atan2(Math.cos(yaw), -Math.sin(yaw));

/** シラタエビ: the photo-traced procedural model with leg-driven walking, swimming and the tail-flip escape. */
export class ShrimpDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: ShrimpModel | null = null;
  private shrimp: Shrimp | null = null;
  private world: ShrimpWorld | null = null;
  private readonly brain = new StubBrain();
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private mode: Mode = 'idle';
  private timer = 0;
  private idleFor = 0;
  private restSent = false;
  private forageStep = 0;
  private swimSent = false;
  private scale = 1;
  private settled = false;
  /** meshes hidden with distance: soft tissue and organs beyond 3 m, legs and antennae beyond 6 m */
  private detailMeshes: Mesh[] = [];
  private appendageMeshes: Mesh[] = [];
  private detailLevel = -1;
  private readonly tmp = new Vector3();
  busy = false;

  /** The real model is built in attach(), once the individual (sex, size) is known; this is only the holder. */
  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'Shrimp';
    return { root, parts: {}, length: MODEL_TL };
  }

  /** A female at the model size, standing, for the 図鑑. */
  static makePreview(): Object3D {
    const model = new ShrimpModel({ sex: 'female', berried: false, scale: 1 });
    model.root.name = 'ShrimpPreview';
    model.root.userData.disposable = true;
    return model.root;
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    this.scale = individual.length_mm / 1000 / MODEL_TL;
    const sex = individual.sex === 'f' ? 'female' : 'male';
    const berried = sex === 'female' && individual.stage === 'adult' && hashInts(individual.length_mm * 10, 17) % 100 < 35;
    this.model = new ShrimpModel({ sex, berried, scale: this.scale });
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.add(this.model.root);
    this.detailMeshes = [];
    this.appendageMeshes = [];
    this.detailLevel = -1;
    this.model.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as Material;
      const key = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey() : '';
      if (key.startsWith('cuticle-v3-app')) this.appendageMeshes.push(mesh);
      else if (!key.startsWith('cuticle-') && !key.startsWith('eye-')) this.detailMeshes.push(mesh);
    });
    // antennae are simulated in world space, so their meshes live beside the shrimp, not under it
    this.world = new ShrimpWorld(root.parent ?? root);
    this.world.fallbackY = individual.pos.y;
    this.settled = false;
    this.shrimp = new Shrimp(this.world, {
      model: this.model, brain: this.brain, attached: true,
      position: new Vector3(individual.pos.x, individual.pos.y, individual.pos.z), yaw: headingToYaw(individual.heading),
    });
    this.brain.intent = { mode: 'ground', target: null, speed: 0, face: null, rheotaxis: 0, arms: 'rest' };
    this.mode = 'idle';
  }

  detach(): void {
    if (this.shrimp) this.shrimp.dispose();
    if (this.model) {
      // geometry is per instance (materials are shared by all shrimp)
      this.model.root.traverse((o) => { const g = (o as Mesh).geometry; if ((o as Mesh).isMesh && g) g.dispose(); });
      for (const f of this.model.flagella as { mesh: Mesh }[]) f.mesh.geometry?.dispose();
    }
    this.model?.root.removeFromParent();
    this.detailMeshes = [];
    this.appendageMeshes = [];
    this.shrimp = null;
    this.model = null;
    this.root = null;
    this.world = null;
  }

  setIntent(intent: Intent): void {
    const ind = this.ind, sh = this.shrimp, b = this.brain, it = b.intent;
    this.busy = true;
    this.timer = intent.seconds > 0 ? intent.seconds : 6;
    if (!ind || !sh) return;
    b.s.fear = Math.max(0, b.s.fear - 0.3);
    switch (intent.kind) {
      case 'rest':
        this.mode = 'idle';
        it.target = null; it.speed = 0; it.arms = 'rest'; it.mode = 'ground';
        b.behavior = 'idle';
        break;
      case 'wander': case 'moveTo': {
        const t = intent.target ?? ind.pos;
        const far = Math.hypot(t.x - ind.pos.x, t.z - ind.pos.z) > 0.35 * this.scale;
        this.mode = far ? 'swim' : 'walk';
        it.target = new Vector3(t.x, 0, t.z);
        it.mode = far ? 'water' : 'ground';
        it.speed = far ? sh.swimSpeed * 0.5 : sh.walkSpeed;
        it.arms = 'walk';
        b.behavior = far ? 'swim' : 'walk';
        this.emit(far ? 'swim' : 'walk');
        break;
      }
      case 'flee': {
        this.mode = 'flee';
        // the threat sits opposite the flight target
        const t = intent.target ?? ind.pos;
        const threat = new Vector3(2 * ind.pos.x - t.x, ind.pos.y, 2 * ind.pos.z - t.z);
        b.s.fear = 1;
        b.behavior = 'flee';
        sh.startTailFlip(threat, 1);
        it.target = null; it.mode = 'ground';
        this.timer = Math.max(this.timer, 3);
        this.emit('tail_flip_escape');
        break;
      }
      case 'forage':
        this.mode = 'forage';
        this.forageStep = 0;
        it.target = null; it.mode = 'ground'; it.arms = 'forage';
        b.behavior = 'forage';
        this.emit('forage');
        break;
      case 'special': case 'display':
        this.mode = 'idle';
        it.target = null; it.mode = 'ground'; it.arms = 'groom'; it.groomPart = 'body';
        b.behavior = 'groom';
        this.timer = Math.min(this.timer, 4);
        break;
      default:
        this.mode = 'idle';
        it.target = null; it.arms = 'rest';
    }
    if (this.mode !== 'idle') { this.idleFor = 0; this.restSent = false; }
  }

  update(dt: number, ctx: DriverContext): void {
    const ind = this.ind, sh = this.shrimp, w = this.world, it = this.brain.intent;
    if (!ind || !sh || !w) return;
    w.floor = ctx.floor;
    w.bounds = ctx.bounds;
    const dist = ctx.player.distanceTo(sh.position);
    w.cheap = dist > 12 && !ctx.locked;
    const level = ctx.locked || ctx.bounds ? 0 : dist < 3 ? 0 : dist < 6 ? 1 : 2;
    if (level !== this.detailLevel) {
      this.detailLevel = level;
      for (const m of this.detailMeshes) m.visible = level === 0;
      for (const m of this.appendageMeshes) m.visible = level < 2;
    }
    if (!this.settled) {
      // the real floor arrives with the first update: stand on it rather than on the spawn-height guess
      this.settled = true;
      const g = w.heightAt(sh.position.x, sh.position.z);
      if (Math.abs(sh.position.y - sh.standH - g) > 0.01) { sh.position.y = g + sh.standH; sh.vel.set(0, 0, 0); sh.plantAllFeet(); }
    }
    const sdt = Math.min(0.05, dt * ctx.simScale);
    w.time += sdt;
    this.timer -= sdt;
    // keep the target on the bottom (walking) or just above it (swimming)
    if (it.target) it.target.y = w.heightAt(it.target.x, it.target.z) + (it.mode === 'water' ? 0.03 * this.scale : sh.standH);
    if (this.mode === 'forage') {
      // stop-and-go: short steps between pauses while the mouthparts work
      this.forageStep -= sdt;
      if (this.forageStep <= 0) {
        this.forageStep = ind.rng.range(0.8, 2.4);
        if (ind.rng.chance(0.6)) {
          const ang = ind.heading + ind.rng.range(-1.2, 1.2), d = 0.1 * this.scale;
          it.target = new Vector3(ind.pos.x + Math.sin(ang) * d, 0, ind.pos.z + Math.cos(ang) * d);
          it.speed = sh.walkSpeed * 0.6;
        } else it.target = null;
      }
    }
    sh.update(sdt);
    if (sh.mode === 'water' && !this.swimSent) { this.swimSent = true; this.emit('swim'); }
    if (sh.mode === 'ground') this.swimSent = false;
    ind.pos.copy(sh.position);
    ind.heading = yawToHeading(sh.yaw);
    // done?
    if (this.mode === 'walk' || this.mode === 'swim') {
      const t = it.target;
      if (!t || Math.hypot(t.x - sh.position.x, t.z - sh.position.z) < 0.012 * this.scale) { it.target = null; it.speed = 0; this.busy = false; }
    }
    if (this.mode === 'flee' && !sh.flip && this.timer <= 1.5) { this.busy = false; this.brain.s.fear = 0.3; }
    if (this.timer <= 0 && !sh.flip) this.busy = false;
    if (!this.busy && this.mode !== 'idle') { this.mode = 'idle'; it.target = null; it.speed = 0; it.arms = 'rest'; it.mode = 'ground'; this.brain.behavior = 'idle'; }
    if (this.mode === 'idle') {
      this.idleFor += sdt;
      if (this.idleFor > 10 && !this.restSent) { this.restSent = true; this.emit('rest'); }
    }
  }

  onEvent(cb: (e: BehaviorEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(behaviorId: string): void {
    if (!this.ind) return;
    const e: BehaviorEvent = { individualId: this.ind.id, behaviorId, t: performance.now() };
    for (const l of this.listeners) l(e);
  }

  anchor(): Vector3 {
    return this.shrimp ? this.tmp.copy(this.shrimp.position).add(new Vector3(0, 0.006 * this.scale, 0)) : this.tmp.set(0, 0, 0);
  }

  dispose(): void {
    this.detach();
    this.listeners.clear();
  }
}

export function turnToward(cur: number, want: number, maxStep: number): number {
  let d = want - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + MathUtils.clamp(d, -maxStep, maxStep);
}
