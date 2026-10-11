import { Group, Matrix4, Vector3, type Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { FOOT, HEAD, MODEL_SH } from './anatomy';
import { LANDMARKS, shellHeight } from './shell';
import { Aramushiro, PACE, type SnailEnv } from './behavior';
import { MORPHS, lookFor, tickAramushiroMaterials } from './materials';
import { LOD1_AT, LOD2_AT, buildModel, poseModel, type AmModel } from './model';
import { MARK, sandLayerFor, type SandLayer } from './sand';
import { restPose } from './pose';

/** trail marks kept per snail (a few centimetres of track) */
const TRAIL_SLOTS = 44;

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/**
 * アラムシロ (Reticunassa festiva): the snail of the sand and mud. The behaviour (behavior.ts) moves it and poses its
 * body; this driver keeps the model and its tiers, the individual's colours, the marks it leaves in the sand (its
 * contact shadow, its trail, the heap of a burrow, the hole it comes out of) and its place on the bed (in the sand
 * when buried, tilted with the slope).
 */
export class AramushiroDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: AmModel | null = null;
  private snail: Aramushiro | null = null;
  private layer: SandLayer | null = null;
  private slots = { contact: -1, cast: -1, mound: -1, pit: -1 };
  private trail: number[] = [];
  private trailNext = 0;
  private locked = false;
  private placed = false;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private ctx: DriverContext | null = null;
  private readonly tmp = new Vector3();
  private readonly mw = new Matrix4();
  private time = 0;
  private scale = 1;
  busy = false;

  /** the model's true shell height (mm): an individual's length_mm is its shell height */
  static get MODEL_MM(): number { return shellHeight() * 1000; }

  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'AramushiroHolder';
    return { root, parts: {}, length: MODEL_SH };
  }

  /** a crawling snail at the model size for the 図鑑 (seed picks the colour form) */
  static makePreview(seed = 0.3): Object3D {
    const morph = Math.floor(seed * MORPHS.length) % MORPHS.length;
    const m = buildModel(lookFor(morph, seed * 7.1 + 0.13), 1, [0]);
    const p = restPose();
    p.reach = 0.6;
    p.siphonPitch += 0.1;
    poseModel(m, p, 0);
    m.lod.autoUpdate = false;
    m.root.userData.disposable = true;
    m.root.updateMatrixWorld(true);
    return m.root;
  }

  /** The species' materials (the shell and the soft parts, shared by every tier) on a model that is never drawn: DriverEntry.keep. */
  static keep(parent: Object3D): { dispose(): void } {
    const m = buildModel(lookFor(0, 0.5), 1);
    parent.add(m.root);
    return { dispose: () => { m.root.removeFromParent(); m.dispose(); } };
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const h = strHash(individual.id);
    this.scale = individual.length_mm / AramushiroDriver.MODEL_MM;
    if (!this.snail) {
      this.snail = new Aramushiro((individual.length_mm / 1000), new Rng(hashInts(h, 71)), individual.id);
      this.snail.pos.copy(individual.pos);
      this.snail.heading = individual.heading;
      this.snail.onEvent = (id) => this.emit(id);
    }
    // the colour form: most are the banded cream, the rest spread over the others
    const r = (h >>> 4) % 100;
    const morph = r < 42 ? 0 : r < 58 ? 1 : r < 70 ? 2 : r < 86 ? 3 : 4;
    this.model = buildModel(lookFor(morph, (h % 9973) / 9973), this.scale);
    root.add(this.model.root);
    root.scale.setScalar(this.scale);
    root.rotation.order = 'YXZ';
    const lv = this.model.lod.levels;
    lv[1].distance = LOD1_AT * this.scale;
    lv[2].distance = LOD2_AT * this.scale;
    this.layer = sandLayerFor(root.parent ?? root);
    this.slots.contact = this.layer.claim();
    this.slots.cast = this.layer.claim();
    this.busy = false;
  }

  detach(): void {
    const l = this.layer;
    if (l) {
      for (const k of Object.keys(this.slots) as (keyof typeof this.slots)[]) { l.release(this.slots[k]); this.slots[k] = -1; }
      for (const s of this.trail) l.release(s);
    }
    this.trail = [];
    this.layer = null;
    if (this.model) { this.model.root.removeFromParent(); this.model.dispose(); }
    this.model = null;
    this.root = null;
  }

  private env(ctx: DriverContext): SnailEnv {
    const meadow = ctx.floor.meadow;
    const cur = meadow ? meadow.kit.uniforms.uAmCurrent.value : null;
    return {
      floor: ctx.floor, bounds: ctx.bounds, canBurrow: ctx.canBurrow !== false, t: this.time,
      scent: ctx.floor.scent ?? null, current: cur, minDepth: ctx.minDepth,
    };
  }

  setIntent(intent: Intent): void {
    const s = this.snail, ind = this.ind;
    if (!s || !ind) return;
    this.busy = true;
    const secs = intent.seconds > 0 ? intent.seconds : 8;
    const ctx = this.ctx;
    switch (intent.kind) {
      case 'flee': case 'display':
        // into the shell (longer when it was badly frightened)
        s.hide(Math.max(secs, 4 + 8 * ind.alert + 4 * ind.rng.next()));
        break;
      case 'rest':
        s.rest(secs);
        break;
      case 'wander': case 'moveTo': {
        const t = intent.target ?? s.pos.clone().add(new Vector3(Math.sin(s.heading), 0, Math.cos(s.heading)).multiplyScalar(s.size * 6));
        // (sent back to the water: a little faster)
        s.crawlTo(t, Math.max(secs, 30), intent.kind === 'moveTo' && intent.urgency > 0.8 ? PACE.away : PACE.crawl);
        break;
      }
      case 'forage':
        s.forage(Math.max(secs, 20));
        break;
      case 'burrow':
        if (ctx) s.burrow(Math.max(secs, 30), this.env(ctx));
        else s.rest(secs);
        break;
      default:
        s.rest(secs);
    }
    this.busy = !s.done;
  }

  update(dt: number, ctx: DriverContext): void {
    const s = this.snail, ind = this.ind, model = this.model, root = this.root;
    if (!s || !ind || !model || !root) return;
    this.ctx = ctx;
    const sdt = Math.min(0.25, dt * ctx.simScale);
    this.time += sdt;
    tickAramushiroMaterials(performance.now() / 1000);
    if (!!ctx.locked !== this.locked) {
      this.locked = !!ctx.locked;
      model.lod.autoUpdate = !this.locked;
      if (this.locked) model.lod.levels.forEach((l, i) => { l.object.visible = i === 0; });
    }
    const level = (this.locked ? 0 : model.lod.getCurrentLevel()) as 0 | 1 | 2;
    s.lod = level;
    const env = this.env(ctx);
    // the first look round: a snail that turns up near carrion has usually found it already
    if (!this.placed) {
      this.placed = true;
      this.firstPlace(env, ind);
    }
    // long frames in steps of at most 1/20 s
    const steps = Math.max(1, Math.ceil(sdt * 20 - 1e-6));
    for (let i = 0; i < steps; i++) s.update(sdt / steps, env);
    // on the bed, tilted with its slope, down in the sand when buried
    const f = ctx.floor;
    const g = f.heightAt(s.pos.x, s.pos.z);
    s.pos.y = g;
    ind.pos.copy(s.pos);
    ind.heading = s.heading;
    root.position.set(s.pos.x, g - s.sink, s.pos.z);
    let pitch = 0, roll = 0;
    if (!ctx.bounds) {
      const r = Math.max(0.01, s.size * 0.6), sn = Math.sin(s.heading), cs = Math.cos(s.heading);
      pitch = Math.atan2(f.heightAt(s.pos.x + sn * r, s.pos.z + cs * r) - f.heightAt(s.pos.x - sn * r, s.pos.z - cs * r), 2 * r);
      roll = Math.atan2(f.heightAt(s.pos.x + cs * r, s.pos.z - sn * r) - f.heightAt(s.pos.x - cs * r, s.pos.z + sn * r), 2 * r);
    }
    root.rotation.set(-pitch + s.dig, s.heading, roll);
    if (level < 2 || (Math.floor(this.time * 10) & 1) === 0) poseModel(model, s.pose, this.time);
    // buried: how far the siphon must reach from the canal to stand a little out of the sand
    if (s.sink > 0) {
      root.updateMatrixWorld();
      const canal = this.tmp.copy(LANDMARKS.canal).applyMatrix4(model.shellM).applyMatrix4(root.matrixWorld);
      s.siphonReach = (g + 0.22 * s.size - canal.y) / (HEAD.siphon * s.size * 0.93);
    }
    // the sand clings to what is pushed into it
    const own = model.mats.own;
    own.uSandY.value = g;
    own.uSandDust.value = Math.min(1, s.sink / (0.2 * s.size) + s.mound * 0.5);
    this.busy = !s.done;
    this.marks(g, level, ctx);
  }

  /** the snail's marks in the sand */
  private marks(ground: number, level: number, ctx: DriverContext): void {
    const s = this.snail!, l = this.layer, root = this.root;
    if (!l || !root) return;
    l.tick(ctx.nowMs / 1000, root);
    const sz = s.size;
    const sn = Math.sin(s.heading), cs = Math.cos(s.heading);
    const out = s.pose.retractFoot;
    const buried = s.sink > 0.45 * sz;
    // contact: under the foot (or the fallen shell), and the shell's own shadow cast a little down-sun
    const fz = (FOOT.front - FOOT.length / 2) * sz * (1 - out);
    const footW = FOOT.width * sz * (1 - 0.55 * out), footL = FOOT.length * sz * (1 - 0.55 * out);
    if (buried) l.hide(this.slots.contact);
    else l.set(this.slots.contact, MARK.contact, s.pos.x + sn * fz, ground + 0.0004, s.pos.z + cs * fz, s.heading, footW * 1.05, footL * 1.05, 0.55 + 0.2 * out, 0, 0);
    const shellAt = this.tmp.copy(LANDMARKS.aperture).applyMatrix4(this.mw.copy(this.model!.shellM));
    shellAt.applyMatrix4(root.matrixWorld);
    const lift = Math.max(0, shellAt.y - ground);
    if (buried || lift > 0.03) l.hide(this.slots.cast);
    else {
      const k = lift * 0.9;
      l.set(this.slots.cast, MARK.contact, shellAt.x - 0.3 * k, ground + 0.0005, shellAt.z - 0.3 * k, s.heading + 0.35, sz * 0.62, sz * 1.0, 0.35, 0, 0);
    }
    // the heap of a burrow and the hole left after one
    if (s.mound > 0.02) {
      if (this.slots.mound < 0) this.slots.mound = l.claim();
      const sc = sz * (0.9 + 0.5 * s.mound);
      l.set(this.slots.mound, MARK.mound, s.pos.x + sn * sz * 0.1, ground + 0.0005, s.pos.z + cs * sz * 0.1, s.heading, sc * 0.9, sc * 1.2, 0.7 * s.mound, 0, (strHash(this.ind!.id) % 97) / 97);
    } else if (this.slots.mound >= 0) { l.release(this.slots.mound); this.slots.mound = -1; }
    if (s.pit > 0.02) {
      if (this.slots.pit < 0) this.slots.pit = l.claim();
      l.set(this.slots.pit, MARK.pit, s.pitAt.x, ctx.floor.heightAt(s.pitAt.x, s.pitAt.z) + 0.0005, s.pitAt.z, 0, sz * 0.9, sz * 0.9, 0.6 * s.pit, 0, 0);
    } else if (this.slots.pit >= 0) { l.release(this.slots.pit); this.slots.pit = -1; }
    // the trail: only near (a few metres), only on soft ground, not in a tank's case
    if (level <= 1 && ctx.canBurrow !== false) {
      for (const m of s.marks) {
        if (this.trail.length < TRAIL_SLOTS) { const i = l.claim(); if (i >= 0) this.trail.push(i); }
        if (!this.trail.length) break;
        const slot = this.trail[this.trailNext % this.trail.length];
        this.trailNext++;
        l.set(slot, MARK.trail, m.x, ctx.floor.heightAt(m.x, m.z) + 0.0003, m.z, m.heading, sz * 0.62, m.len * 1.02, 1, ctx.nowMs / 1000, (this.trailNext * 0.137) % 1);
      }
    } else if (this.trail.length && level === 2) {
      for (const i of this.trail) l.release(i);
      this.trail = [];
    }
  }

  /** placed near carrion when it first appears: already feeding there, more often than not */
  private firstPlace(env: SnailEnv, ind: Individual): void {
    const s = this.snail!;
    const scent = env.scent;
    if (!scent || env.bounds) return;
    for (const f of scent.sourcesNear(s.pos.x, s.pos.z, 3)) {
      if (f.meat < 0.1 || !ind.rng.chance(0.75)) continue;
      const a = scent.claim(f, s.id, ind.rng.range(0, Math.PI * 2));
      if (a === null) continue;
      const reach = f.r + s.size * 0.75;
      const x = f.x + Math.sin(a) * reach, z = f.z + Math.cos(a) * reach;
      const need = env.minDepth ?? 0;
      if (need > 0 && env.floor.waterAt(x, z) - env.floor.heightAt(x, z) < need) { scent.release(f, s.id); continue; }
      s.pos.set(x, env.floor.heightAt(x, z), z);
      s.heading = Math.atan2(f.x - x, f.z - z);
      s.startFeeding(f, a);
      return;
    }
  }

  holdAt(x: number, z: number, heading?: number): void {
    const s = this.snail, ind = this.ind;
    if (!s || !ind) return;
    s.pos.set(x, s.pos.y, z);
    if (heading !== undefined) s.heading = heading;
    s.speed = 0;
    s.rest(3);
    ind.pos.x = x; ind.pos.z = z;
    this.busy = false;
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
    const root = this.root, m = this.model;
    if (!root || !m) return this.ind ? this.tmp.copy(this.ind.pos) : this.tmp.set(0, 0, 0);
    // the middle of the shell
    root.updateMatrixWorld();
    return this.tmp.set(0, -0.45 * MODEL_SH, 0).applyMatrix4(m.shellM).applyMatrix4(root.matrixWorld);
  }

  debugLabel(): string {
    const s = this.snail;
    return s ? `${s.state}${s.sub ? ':' + s.sub : ''}` : '';
  }

  /** the behaviour (the viewer and the tests read it) */
  get behaviour(): Aramushiro | null { return this.snail; }
  get modelOf(): AmModel | null { return this.model; }

  dispose(): void {
    const s = this.snail;
    if (s?.food) this.ctx?.floor.scent?.release(s.food, s.id);
    this.detach();
    this.snail = null;
    this.listeners.clear();
  }
}

