import { Group, Vector3, type Object3D } from 'three';
import type { Individual } from '../Individual';
import type { BehaviorEvent, BodyState, Driver, DriverContext, Intent } from '../drivers/Driver';
import type { PlaceholderModel } from '../models/placeholders';
import { WaterRider } from '../physics/water';
import { Rng, hashInts } from '../../core/Rng';
import { keepSandDust, sandDustFor, type DustSource } from '../fx/SandDust';
import { shadowLayerFor, sunOf, underwaterSun, type ShadowLayer } from '../species/haku/ContactShadows';
import { FishAgent, type FishEnv } from './motion';
import { applyPose, buildFishModel, disposeFishModel, hookRipple, restPose, setLodDistances, type FishModel } from './rig';
import { releaseSchool, schoolFor } from './school';
import { FISH_SPECS } from './species';
import type { FishSpec } from './spec';

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/**
 * The coastal fishes' driver: one class for all nine species (FISH_SPECS), the species' differences in its spec.
 * Each individual has its own skeleton over the species' shared tiers and materials, a FishAgent (or a member's place
 * in its spawn group's School), the sand it throws, its shadow on the bed, the swell carrying it.
 */
export class FishDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: FishModel | null = null;
  private agent: FishAgent | null = null;
  private dust: DustSource | null = null;
  private shadows: ShadowLayer | null = null;
  private shadowSlot = -1;
  private locked = false;
  private level: 0 | 1 | 2 = 2;
  private scale = 1;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly rider = new WaterRider();
  private readonly tmp = new Vector3();
  private readonly sun = new Vector3();
  private readonly player = new Vector3(Number.NaN, 0, 0);
  private readonly bodyState: BodyState = { mode: 'water', heading: 0, y: 0 };
  private bed: string | undefined;
  private bedT = 0;
  private shadowTick = 0;
  readonly spec: FishSpec;
  busy = false;

  constructor(id: string) {
    const spec = FISH_SPECS[id];
    if (!spec) throw new Error(`no fish spec ${id}`);
    this.spec = spec;
  }

  /** the view's holder; the rig and meshes are built in attach() */
  static makeModel(id: string): PlaceholderModel {
    const root = new Group();
    root.name = `Fish_${id}`;
    return { root, parts: {}, length: FISH_SPECS[id].modelTL };
  }

  /** a swimming fish at model size for the 図鑑 */
  static makePreview(id: string): Object3D {
    const spec = FISH_SPECS[id];
    const m = buildFishModel(spec, [0]);
    const root = new Group();
    root.name = `${id}Preview`;
    root.add(m.frame);
    const pose = restPose();
    pose.amp = spec.flat ? 0.02 : 0.06; pose.phase = 1.1; pose.pecL = pose.pecR = 0.4; pose.curv = spec.flat ? 0 : 0.2;
    if (spec.flat) root.position.y = 0;
    applyPose(m, pose, 0);
    m.lod.autoUpdate = false;
    root.updateMatrixWorld(true);
    return root;
  }

  /** the species in every tier, never drawn: keeps its programs compiled (DriverEntry.keep) */
  static keep(id: string, parent: Object3D): { dispose(): void } {
    const m = buildFishModel(FISH_SPECS[id]);
    m.lod.autoUpdate = false;
    for (const l of m.lod.levels) l.object.visible = true;
    m.frame.visible = false;
    parent.add(m.frame);
    const dust = keepSandDust(parent);
    return { dispose: () => { disposeFishModel(m); dust.dispose(); } };
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const spec = this.spec;
    const tl = individual.length_mm / 1000;
    this.scale = tl / spec.modelTL;
    this.model = buildFishModel(spec);
    root.add(this.model.frame);
    root.scale.setScalar(this.scale);
    const parent = root.parent ?? root;
    if (!this.agent) {
      const rng = new Rng(hashInts(strHash(individual.id), 57));
      this.agent = new FishAgent(spec, tl, () => rng.next());
      this.agent.pos.copy(individual.pos);
      this.agent.pos.y = Number.NaN;
      this.agent.heading = individual.heading;
      this.agent.onEvent = (id) => this.emit(id);
      this.agent.setState(spec.behavior.habit === 'ambusher' || spec.behavior.habit === 'flatfish' ? 'REST' : 'IDLE', 4 + rng.next() * 6);
      this.agent.wantHeading = individual.heading;
    }
    hookRipple(this.model, this.agent.pose);
    const a = this.agent;
    a.join(parent.uuid);
    // a group swims as a school (the schooling species, and the loose shoals of the others)
    if (spec.behavior.school >= 0.2) {
      const key = `${parent.uuid}|${individual.species.id}|${spec.id}|${individual.cell}|${individual.ruleIndex}`;
      schoolFor(key).add(a);
    }
    const rng = new Rng(hashInts(strHash(individual.id), 91));
    this.dust = sandDustFor(parent).source(() => rng.next());
    a.onDust = (kind, at, vel, amount) => {
      const d = this.dust;
      if (!d) return;
      const T = a.tl;
      if (kind === 'kick') d.kick(at, vel, Math.max(1, Math.round(4 * amount)), 0.35 * T, 0.18 * T, 2.4, 0.4, 2);
      else if (kind === 'gill') d.silt(at, vel, Math.max(1, Math.round(2 * amount)), 0.08 * T, 0.1 * T, 1.8, 0.3);
      else d.silt(at, vel, 1, 0.2 * T, 0.12 * T, 1.6, 0.2 * amount);
    };
    if (!(spec.behavior.habit === 'ambusher' || spec.behavior.habit === 'flatfish')) {
      this.shadows = shadowLayerFor(parent);
      this.shadowSlot = this.shadows.claim();
    }
    root.visible = false;
  }

  detach(): void {
    if (this.shadows) this.shadows.release(this.shadowSlot);
    this.shadows = null;
    this.shadowSlot = -1;
    this.dust?.release();
    this.dust = null;
    const a = this.agent;
    if (a) {
      const s = a.school;
      if (s) { s.remove(a); releaseSchool(s); }
      a.leaveScene();
    }
    if (this.model) { disposeFishModel(this.model); this.model = null; }
    this.root = null;
  }

  setIntent(intent: Intent): void {
    const a = this.agent;
    this.busy = true;
    if (!a) return;
    const s = a.school;
    const from = intent.from ?? null;
    if (s && intent.kind !== 'flee' && !(intent.kind === 'special' && intent.param === 'surface' && this.spec.behavior.extras.includes('leap'))) {
      switch (intent.kind) {
        case 'rest': case 'burrow': s.request('IDLE', intent.seconds || 8, null); return;
        case 'wander': s.request('SWIM', Math.max(intent.seconds, 8), intent.target ?? null); return;
        case 'moveTo': s.request('SWIM', 8, intent.target ?? null, intent.urgency >= 0.85); return;
        case 'forage': s.request('FORAGE', Math.max(intent.seconds, 6), null); return;
        case 'display': {
          const src = from ?? (Number.isNaN(this.player.x) ? null : this.player);
          const away = src ? this.tmp.set(a.pos.x - src.x, 0, a.pos.z - src.z) : this.tmp.set(Math.sin(a.heading), 0, Math.cos(a.heading));
          const goal = a.pos.clone().addScaledVector(away.lengthSq() > 1e-8 ? away.normalize() : away.set(0, 0, 1), 3 * a.tl + 0.5);
          s.request('ALERT', intent.seconds || 4, goal, true);
          return;
        }
        default: s.request('IDLE', 6, null); return;
      }
    }
    a.request(intent.kind, intent.seconds, intent.target ?? null, intent.param, from);
  }

  update(dt: number, ctx: DriverContext): void {
    const a = this.agent, ind = this.ind, model = this.model, root = this.root;
    if (!a || !ind || !model || !root) return;
    this.player.copy(ctx.player);
    const sdt = Math.min(0.1, dt * ctx.simScale);
    const env: FishEnv = { floor: ctx.floor, bounds: ctx.bounds, minDepth: Math.max(0.02, ctx.minDepth ?? 0.02), canBurrow: ctx.canBurrow !== false };
    a.alarm = ind.alert;
    if (Number.isNaN(a.pos.y)) {
      const L = a.layer(env);
      a.pos.y = a.benthic ? L.lo : Math.min(Math.max(L.lo, L.bottom + Math.max(this.spec.behavior.minLift * a.tl, this.spec.behavior.level * (L.surface - L.bottom)) + a.half.below), Math.max(L.lo, L.hi));
    }
    // the observed fish keeps full detail at any distance; the far tiers follow the creature system's detail
    if (!!ctx.locked !== this.locked) {
      this.locked = !!ctx.locked;
      model.lod.autoUpdate = !this.locked;
      if (this.locked) model.lod.levels.forEach((l, i) => { l.object.visible = i === 0; });
    }
    setLodDistances(model, this.scale, this.locked || ind.lod <= 1);
    a.detail = this.level;
    const steps = Math.max(1, Math.ceil(sdt * 30 - 1e-6));
    for (let i = 0; i < steps; i++) a.update(sdt / steps, env);
    // the swell carries it to and fro (less as it grows; a burst outruns it); a fish on the bed holds
    const holding = a.state === 'REST' || a.state === 'BURY' || (a.benthic && a.state !== 'ESCAPE');
    const r = this.rider.step(sdt, ctx.water, ctx.floor, a.pos.x, a.pos.y, a.pos.z, a.heading, a.tl, holding ? 0 : a.state === 'ESCAPE' ? 0.3 : 1, Math.max(env.minDepth, 2 * a.half.below));
    a.pos.addScaledVector(r.vel, sdt);
    ind.pos.copy(a.pos);
    ind.heading = a.heading;
    root.position.copy(a.pos);
    root.rotation.set(a.pitch + this.rider.tiltX, a.heading, a.roll + this.rider.tiltZ, 'YXZ');
    root.visible = true;
    const level = (this.locked ? 0 : model.lod.getCurrentLevel()) as 0 | 1 | 2;
    this.level = model.levels[level] ?? 2;
    applyPose(model, a.pose, this.level);
    if (this.dust) {
      this.dust.near = this.locked || !!ctx.bounds || ind.lod <= 1;
      if (this.dust.near) {
        this.dust.tick(sdt, ctx);
        this.bedT -= sdt;
        if (this.bedT <= 0 && ctx.floor.sampleAt) { this.bedT = 2; this.bed = ctx.floor.sampleAt(a.pos.x, a.pos.z)?.substrate; this.dust.setBed(this.bed); }
      }
    }
    this.busy = a.state === 'ESCAPE' || a.state === 'STRIKE' || a.state === 'LEAP' || a.stateT < a.stateDur;
    if (this.level < 2 || (this.shadowTick++ & 1) === 0) this.updateShadow(env);
  }

  private updateShadow(env: FishEnv): void {
    const a = this.agent, sh = this.shadows, root = this.root;
    if (!a || !sh || this.shadowSlot < 0 || !root) return;
    const strength = underwaterSun(sunOf(root), this.sun);
    const ground = env.floor.heightAt(a.pos.x, a.pos.z);
    const h = Math.max(0, a.pos.y - a.half.below - ground);
    if (strength <= 0.01 || h > 1.2 || a.pos.y > env.floor.waterAt(a.pos.x, a.pos.z)) { sh.hide(this.shadowSlot); return; }
    const L = this.sun;
    const k = h / Math.max(L.y, 0.2);
    const x = a.pos.x - L.x * k, z = a.pos.z - L.z * k;
    const gy = env.floor.heightAt(x, z) + 0.003;
    const tl = a.tl;
    const blur = 0.003 + 0.05 * h;
    const len = tl * (0.9 * Math.abs(Math.cos(a.pitch)) + 0.15) + 2 * blur;
    const wid = tl * this.spec.depth * (0.45 + 0.5 * Math.abs(Math.sin(a.roll))) + 2 * blur;
    const opacity = strength * 0.65 * (tl * tl) / ((tl + 1.6 * blur) * (tl + 1.6 * blur));
    sh.set(this.shadowSlot, x, gy, z, a.heading, len, wid, opacity, Math.min(0.95, 0.25 + (2 * blur) / Math.max(wid, 1e-4)));
  }

  holdAt(x: number, z: number, heading?: number): void {
    const a = this.agent, ind = this.ind;
    if (!a || !ind) return;
    a.pos.set(x, Number.NaN, z);
    if (heading !== undefined) a.heading = heading;
    a.speed = 0; a.vy = 0; a.buried = 0;
    a.setState(a.benthic ? 'REST' : 'IDLE', 3);
    ind.pos.x = x; ind.pos.z = z;
    this.rider.reset();
    this.busy = false;
  }

  body(): BodyState {
    const a = this.agent, b = this.bodyState;
    if (a && !Number.isNaN(a.pos.y)) { b.heading = a.heading; b.y = a.pos.y - a.half.below; b.mode = a.buried > 0.7 ? 'away' : a.benthic && a.state !== 'ESCAPE' ? 'bed' : 'water'; }
    else if (this.ind) { b.heading = this.ind.heading; b.y = this.ind.pos.y; }
    return b;
  }

  nudge(dx: number, dz: number): void {
    const a = this.agent, ind = this.ind;
    if (a) { a.pos.x += dx; a.pos.z += dz; }
    if (ind) { ind.pos.x += dx; ind.pos.z += dz; }
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
    const a = this.agent;
    if (!a || Number.isNaN(a.pos.y)) return this.ind ? this.tmp.copy(this.ind.pos) : this.tmp.set(0, 0, 0);
    return this.tmp.copy(a.pos);
  }

  get hidden(): boolean { return (this.agent?.buried ?? 0) > 0.95; }

  get openings(): { mouth: number; gill: number } { return { mouth: this.agent?.pose.jaw ?? 0, gill: 0 }; }

  debugLabel(): string {
    const a = this.agent;
    return a ? `${a.state}${a.buried > 0.1 ? ` buried ${a.buried.toFixed(1)}` : ''}` : '';
  }

  dispose(): void {
    this.detach();
    this.agent = null;
    this.listeners.clear();
  }
}

/**
 * One species whose individuals change driver as they grow: the ボラ's fry and juveniles (ハク, スバシリ) school with the
 * ハク's own driver, the adults (from `atMM`) with the coastal fishes'.
 */
export class GrowthDriver implements Driver {
  private inner: Driver | null = null;
  private pending: Intent | null = null;
  private readonly cbs = new Set<(e: BehaviorEvent) => void>();
  private unsubs: (() => void)[] = [];

  constructor(private readonly young: () => Driver, private readonly adult: () => Driver, private readonly atMM: number) {}

  attach(root: Object3D, individual: Individual, extras: Record<string, unknown>, bones: Record<string, Object3D>, meshes: Object3D[]): void {
    if (!this.inner) {
      this.inner = individual.length_mm >= this.atMM ? this.adult() : this.young();
      for (const cb of this.cbs) this.unsubs.push(this.inner.onEvent(cb));
    }
    this.inner.attach(root, individual, extras, bones, meshes);
    if (this.pending) { this.inner.setIntent(this.pending); this.pending = null; }
  }

  detach(): void { this.inner?.detach(); }
  setIntent(intent: Intent): void { if (this.inner) this.inner.setIntent(intent); else this.pending = intent; }
  get busy(): boolean { return this.inner?.busy ?? false; }
  update(dt: number, ctx: DriverContext): void { this.inner?.update(dt, ctx); }
  holdAt(x: number, z: number, heading?: number): void { this.inner?.holdAt?.(x, z, heading); }
  body(): BodyState { return this.inner?.body?.() ?? { mode: 'water', heading: 0, y: 0 }; }
  nudge(dx: number, dz: number): void { this.inner?.nudge?.(dx, dz); }
  onEvent(cb: (e: BehaviorEvent) => void): () => void {
    this.cbs.add(cb);
    const un = this.inner?.onEvent(cb);
    return () => { this.cbs.delete(cb); un?.(); };
  }
  anchor(): Vector3 { return this.inner?.anchor() ?? new Vector3(); }
  get hidden(): boolean { return this.inner?.hidden ?? false; }
  get openings(): { mouth: number; gill: number } | undefined { return this.inner?.openings; }
  debugLabel(): string { return this.inner?.debugLabel?.() ?? ''; }
  dispose(): void { this.inner?.dispose(); for (const u of this.unsubs) u(); this.unsubs = []; this.cbs.clear(); }
}
