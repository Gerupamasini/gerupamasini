import { Group, Object3D, Vector3, type Mesh } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { bakeLod, type ShoreModel } from './models';

/** beyond this (m) a small animal is drawn as one baked mesh, unless it is watched or in the tank */
const LOD_DIST = 3;

export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function turnToward(cur: number, want: number, maxStep: number): number {
  const d = wrapAngle(want - cur);
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}

/** a stable per-individual seed (the hex tail of its id), so a model rebuilt for another tier looks the same */
export function seedOf(ind: Individual): number {
  return parseInt(ind.id.split('#')[1] ?? '1', 16) >>> 0 || 1;
}

/** ease `cur` toward `want` with a time constant (s) */
export const ease = (cur: number, want: number, dt: number, tau: number): number => cur + (want - cur) * Math.min(1, dt / Math.max(1e-4, tau));

/**
 * The common body of the 走水 shore animals' drivers. Each builds its own procedural model per individual at its real
 * size (the view's root is an empty holder), walks it over the bed toward the intent's target at the species' pace
 * (crabs across their heading), keeps it on the ground, tilted with the slope, inside the tank's walls and in the
 * water when it has to stay there; the species animate their parts in `pose()`, and do less of it with distance.
 */
export abstract class ShoreDriver implements Driver {
  protected root: Object3D | null = null;
  protected ind: Individual | null = null;
  protected model: ShoreModel | null = null;
  protected parts: Record<string, Object3D> = {};
  /** the body's size (m): paces and poses are in these */
  protected size = 0.02;
  protected mode = 'idle';
  protected timer = 0;
  protected target: Vector3 | null = null;
  /** the pace asked for (m/s) and the ground speed now (eased) */
  protected pace = 0;
  protected speed = 0;
  /** the direction of travel (heading convention: forward = (sin h, cos h)) */
  protected travel = 0;
  /** animation clock (s, sim time) */
  protected t = 0;
  /** 0: near (full animation), 1: mid (body only), 2: far (posed once, then still) */
  protected detail = 0;
  /** in the tank or the field case (walls, flat floor) */
  protected inTank = false;
  /** water over the animal (m, 0 when out of it) */
  protected depth = 0;
  protected ctx: DriverContext | null = null;
  /** walkers that face across their travel (crabs) */
  protected sideways = false;
  /** how fast the body turns (rad/s) */
  protected turnRate = 4;
  /** whether to tilt the body with the slope of the bed */
  protected tilt = true;
  /** always under way (a school's path): an intent ends on its timer, not on arrival */
  protected cruising = false;
  /** the articulated parts the baked far mesh stands in for (empty: no baked mesh) */
  protected bakeParts: Object3D[] = [];
  private lod: Mesh | null = null;
  /** drawn as the baked mesh just now */
  protected far = false;
  busy = false;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private idleFor = 0;
  private restSent = false;
  private readonly tmp = new Vector3();

  /** the holder the creature system puts in the scene; the model comes with attach() */
  static holder(length_m: number, name: string): PlaceholderModel {
    const root = new Group();
    root.name = name;
    return { root, parts: {}, length: length_m };
  }

  protected abstract build(ind: Individual): ShoreModel;
  /** the species' reaction to a new intent: mode, target, pace, events */
  protected abstract begin(intent: Intent): void;
  /** animate the parts (dt in sim seconds) */
  protected abstract pose(dt: number): void;
  /** height of the body above the bed (swimmers ride in the water) */
  protected rideHeight(_ground: number, _water: number): number { return 0; }
  /** the move reached its target */
  protected arrived(): void { this.target = null; this.pace = 0; }
  /** the move was stopped (a wall, the water's edge) */
  protected blocked(): void { this.target = null; this.pace = 0; }
  /** after a hold (the creature system put the animal back in the water) */
  protected held(): void {}
  /** how close counts as there (m) */
  protected arriveDist(): number { return this.size * 0.4; }
  /** the camera anchor's height above the root */
  protected anchorHeight(): number { return this.size * 0.3; }
  /** move freely this frame (swimmers do their own) */
  protected steer(_dt: number): void {}
  /** the drawing detail changed (0 near, 1 mid, 2 far) */
  protected detailChanged(_level: number): void {}

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    this.model = this.build(individual);
    this.parts = this.model.parts;
    root.add(this.model.root);
    if (this.bakeParts.length) {
      this.lod = bakeLod(this.model.root);
      this.lod.visible = false;
      this.model.root.add(this.lod);
    }
    this.far = false;
    root.scale.setScalar(1);
    root.rotation.order = 'YXZ';
    root.position.copy(individual.pos);
    root.rotation.set(0, individual.heading, 0);
    this.target = null;
    this.speed = this.pace = 0;
    this.mode = 'idle';
    this.busy = false;
  }

  detach(): void {
    if (this.model) {
      this.model.root.removeFromParent();
      this.model.dispose();
    }
    this.lod?.geometry.dispose();
    this.lod = null;
    this.bakeParts = [];
    this.model = null;
    this.parts = {};
    this.root = null;
  }

  setIntent(intent: Intent): void {
    this.busy = true;
    this.timer = intent.seconds > 0 ? intent.seconds : 6;
    if (!this.ind) return;
    this.begin(intent);
    if (this.mode !== 'idle' && this.mode !== 'rest') { this.idleFor = 0; this.restSent = false; }
  }

  /** start a move to (x, z) at a pace */
  protected go(target: Vector3 | undefined, pace: number): void {
    if (!target || !this.ind) { this.target = null; return; }
    this.target = new Vector3(target.x, 0, target.z);
    this.pace = pace;
  }

  /** the heading across the travel nearest the present one (for sideways walkers) */
  private acrossTravel(h: number): number {
    const a = this.travel + Math.PI / 2, b = this.travel - Math.PI / 2;
    return Math.abs(wrapAngle(a - h)) < Math.abs(wrapAngle(b - h)) ? a : b;
  }

  /** whether the animal may step to (x, z): inside the walls, and not out of the water it is in */
  private canStep(x: number, z: number, ctx: DriverContext): boolean {
    const b = ctx.bounds;
    if (b && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) return false;
    const need = ctx.minDepth ?? 0;
    if (need > 0 && this.depth >= need) {
      const f = ctx.floor;
      if (f.waterAt(x, z) - f.heightAt(x, z) < need) return false;
    }
    return true;
  }

  update(dt: number, ctx: DriverContext): void {
    const ind = this.ind, root = this.root;
    if (!ind || !root) return;
    this.ctx = ctx;
    this.inTank = !!ctx.bounds;
    const sdt = Math.min(0.05, dt * ctx.simScale);
    this.t += sdt;
    this.timer -= sdt;
    const dist = ctx.player.distanceTo(ind.pos);
    const detail = ctx.locked || ctx.bounds ? 0 : dist < 5 ? 0 : dist < 14 ? 1 : 2;
    if (detail !== this.detail) { this.detail = detail; this.detailChanged(detail); }
    // a few metres off, the articulated animal gives way to its baked mesh
    const far = !!this.lod && !ctx.locked && !ctx.bounds && dist > LOD_DIST;
    if (far !== this.far && this.lod) {
      this.far = far;
      this.lod.visible = far;
      for (const p of this.bakeParts) p.visible = !far;
    }
    this.steer(sdt);
    // the move: turn toward the travel (or across it), step along it once lined up
    let want = 0;
    if (this.target) {
      const dx = this.target.x - ind.pos.x, dz = this.target.z - ind.pos.z;
      if (Math.hypot(dx, dz) < this.arriveDist()) this.arrived();
      else { want = this.pace; this.travel = Math.atan2(dx, dz); }
    }
    this.speed = ease(this.speed, want, sdt, 0.15);
    if (this.speed > 1e-5) {
      const face = this.sideways ? this.acrossTravel(ind.heading) : this.travel;
      ind.heading = wrapAngle(turnToward(ind.heading, face, this.turnRate * sdt));
      const align = this.sideways ? 1 : Math.max(0, Math.cos(wrapAngle(face - ind.heading)));
      const step = this.speed * sdt * align;
      const nx = ind.pos.x + Math.sin(this.travel) * step, nz = ind.pos.z + Math.cos(this.travel) * step;
      if (this.canStep(nx, nz, ctx)) { ind.pos.x = nx; ind.pos.z = nz; }
      else { this.speed = 0; this.blocked(); }
    }
    // on the bed (or in the water), tilted with its slope
    const f = ctx.floor;
    const g = f.heightAt(ind.pos.x, ind.pos.z), w = f.waterAt(ind.pos.x, ind.pos.z);
    this.depth = Math.max(0, w - g);
    ind.pos.y = g + this.rideHeight(g, w);
    root.position.copy(ind.pos);
    let pitch = 0, roll = 0;
    if (this.tilt && !this.inTank && this.detail < 2) {
      const r = Math.max(0.02, this.size * 0.6), s = Math.sin(ind.heading), c = Math.cos(ind.heading);
      pitch = Math.atan2(f.heightAt(ind.pos.x + s * r, ind.pos.z + c * r) - f.heightAt(ind.pos.x - s * r, ind.pos.z - c * r), 2 * r);
      // the animal's left is +x in its own frame: (cos h, -sin h) in the world
      roll = Math.atan2(f.heightAt(ind.pos.x + c * r, ind.pos.z - s * r) - f.heightAt(ind.pos.x - c * r, ind.pos.z + s * r), 2 * r);
    }
    root.rotation.set(-pitch, ind.heading, roll);
    if (this.detail < 2 || this.t < 0.2) this.pose(sdt);
    // done?
    if (this.timer <= 0 && (!this.target || this.cruising)) this.busy = false;
    if (!this.busy && this.mode !== 'idle') { this.mode = 'idle'; this.target = null; this.pace = 0; }
    if (this.mode === 'idle') {
      this.idleFor += sdt;
      if (this.idleFor > 10 && !this.restSent) { this.restSent = true; this.emit('rest'); }
    }
  }

  holdAt(x: number, z: number, heading?: number): void {
    const ind = this.ind;
    if (!ind) return;
    ind.pos.x = x; ind.pos.z = z;
    if (this.ctx) ind.pos.y = this.ctx.floor.heightAt(x, z);
    if (heading !== undefined) ind.heading = heading;
    this.target = null;
    this.speed = this.pace = 0;
    this.mode = 'idle';
    this.busy = false;
    this.root?.position.copy(ind.pos);
    this.held();
  }

  onEvent(cb: (e: BehaviorEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  protected emit(behaviorId: string): void {
    if (!this.ind) return;
    const e: BehaviorEvent = { individualId: this.ind.id, behaviorId, t: performance.now() };
    for (const l of this.listeners) l(e);
  }

  anchor(): Vector3 {
    const ind = this.ind;
    return ind ? this.tmp.set(ind.pos.x, ind.pos.y + this.anchorHeight(), ind.pos.z) : this.tmp.set(0, 0, 0);
  }

  dispose(): void {
    this.detach();
    this.listeners.clear();
  }
}
