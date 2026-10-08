import { Group, Vector2, Vector3, type Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { MODEL_TL } from './anatomy';
import { AmimehagiFish, type AmhState, type FishEnv } from './Behavior';
import { AMH_UNIFORMS, AmimehagiLook, pickPalette, tickAmimehagiMaterials } from './materials';
import { buildModel, disposeModel, LOD1_AT, LOD2_AT, type AmimehagiModel } from './model';
import { applyPose, restPose } from './pose';
import { seagrass, type SeagrassQuery } from './seagrass';
import { shadowLayerFor, sunOf, underwaterSun, type ShadowLayer } from '../haku/ContactShadows';

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** The individual's own look: its palette, where its spots fall, a little brighter or darker, warmer or cooler. */
export function lookFor(id: string): AmimehagiLook {
  const r = new Rng(hashInts(strHash(id), 0xa31));
  return new AmimehagiLook({ palette: pickPalette(r.next()), seed: new Vector2(r.range(0, 97), r.range(0, 97)), value: r.range(-1, 1), warmth: r.range(-1, 1) });
}

/**
 * アミメハギ (Rudarius ercodes): a small filefish of the eelgrass. Each individual lives on its own (AmimehagiFish:
 * the five states, the balistiform fin work, the eyes) and draws itself through three tiers of shared geometry with
 * its own materials. Within the near tiers it pushes the leaves it swims into aside (the meadow's push slots).
 */
export class AmimehagiDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: AmimehagiModel | null = null;
  private fish: AmimehagiFish | null = null;
  private shadows: ShadowLayer | null = null;
  private shadowSlot = -1;
  private pushSlot = -1;
  private locked = false;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  private readonly sun = new Vector3();
  private readonly player = new Vector3(Number.NaN, 0, 0);
  private shadowTick = 0;
  private placed = false;
  busy = false;
  /** the vegetation the fish lives in (the page's meadow bridge; a viewer may give its own) */
  grass: SeagrassQuery | null = seagrass;

  /** The view's holder; the rig and meshes are built in attach(). */
  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'Amimehagi';
    return { root, parts: {}, length: MODEL_TL };
  }

  /** A hovering アミメハギ at the model size for the 図鑑 (`seed` picks the individual's look). */
  static makePreview(seed = 0): Object3D {
    const m = buildModel(lookFor(`preview#${Math.floor(seed * 1e6)}`), [0]);
    const pose = restPose();
    pose.medPhase = 1.3; pose.medAmp = 0.18; pose.pecOpenL = pose.pecOpenR = 0.5; pose.caudalSpread = 0.7; pose.spine = 0.9;
    applyPose(m.rig, pose, 0);
    m.lod.autoUpdate = false;
    m.root.updateMatrixWorld(true);
    // the preview's own skeleton and materials go with it (the geometry is shared)
    m.root.userData.disposer = () => disposeModel(m);
    return m.root;
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const tl = individual.length_mm / 1000;
    const scale = tl / MODEL_TL;
    this.model = buildModel(lookFor(individual.id));
    root.add(this.model.root);
    root.scale.setScalar(scale);
    const lv = this.model.lod.levels;
    lv[1].distance = LOD1_AT * scale; lv[2].distance = LOD2_AT * scale;
    if (!this.fish) {
      this.fish = new AmimehagiFish(tl, new Rng(hashInts(strHash(individual.id), 57)));
      this.fish.pos.copy(individual.pos);
      this.fish.heading = individual.heading;
      this.fish.onEvent = (id) => this.emit(id);
      this.placed = false;
    }
    this.shadows = shadowLayerFor(root.parent ?? root);
    this.shadowSlot = this.shadows.claim();
    root.visible = false;
  }

  detach(): void {
    if (this.shadows) this.shadows.release(this.shadowSlot);
    this.shadowSlot = -1;
    this.shadows = null;
    this.releasePush();
    if (this.model) disposeModel(this.model);
    this.model = null;
    this.root = null;
  }

  private releasePush(): void {
    if (this.pushSlot >= 0) this.grass?.releasePush(this.pushSlot);
    this.pushSlot = -1;
  }

  private env(ctx: DriverContext): FishEnv {
    const known = !Number.isNaN(this.player.x) && (this.ind?.alert ?? 0) > 0.15;
    return {
      floor: ctx.floor, bounds: ctx.bounds, minDepth: Math.max(0.03, ctx.minDepth ?? 0.03),
      // a case or a tank (bounded) has no leaves; the flat's meadow is elsewhere
      grass: ctx.bounds ? null : this.grass,
      threat: known ? this.player : null,
    };
  }
  private lastCtx: DriverContext | null = null;

  setIntent(intent: Intent): void {
    const f = this.fish, ind = this.ind, ctx = this.lastCtx;
    this.busy = true;
    if (!f || !ind || !ctx) { this.pending = intent; return; }
    const env = this.env(ctx);
    const secs = intent.seconds > 0 ? intent.seconds : 8;
    const go = (s: AmhState, t: number, o: Parameters<AmimehagiFish['enter']>[3] = {}) => f.enter(s, t, env, o);
    switch (intent.kind) {
      case 'flee':
        go('ESCAPE', Math.max(secs, 6), { from: intent.from ?? (Number.isNaN(this.player.x) ? null : this.player) });
        break;
      case 'rest':
        // by a leaf, or tucked in among them when the fish is uneasy
        go(ind.alert > 0.35 && env.grass ? 'SEAGRASS_HIDE' : 'HOVER', secs);
        break;
      case 'burrow':
        go('SEAGRASS_HIDE', secs);
        break;
      case 'wander': case 'moveTo':
        go('SLOW_SWIM', Math.max(secs, 6), { target: intent.target ?? null });
        break;
      case 'forage':
        go('FORAGE', Math.max(secs, 4));
        break;
      case 'display':
        go('SEAGRASS_HIDE', Math.max(secs, 5), { from: intent.from ?? (Number.isNaN(this.player.x) ? null : this.player) });
        break;
      case 'special':
        if (intent.param === 'sleep') go('SEAGRASS_HIDE', Math.max(secs, 30), { sleep: true });
        else if (intent.param === 'hide') go('SEAGRASS_HIDE', Math.max(secs, 8));
        else go('HOVER', Math.max(secs, 6));
        break;
      default:
        go('HOVER', 6);
    }
  }
  private pending: Intent | null = null;

  update(dt: number, ctx: DriverContext): void {
    const f = this.fish, ind = this.ind, model = this.model, root = this.root;
    if (!f || !ind || !model || !root) return;
    this.lastCtx = ctx;
    tickAmimehagiMaterials(performance.now() / 1000);
    this.player.copy(ctx.player);
    const env = this.env(ctx);
    if (!this.placed) {
      // start at a height in the canopy: a third of the way up the water, off the sand
      const L = f.layer(env, f.pos.x, f.pos.z);
      f.pos.y = Math.min(L.hi, Math.max(L.lo, L.bottom + 0.3 * (L.surface - L.bottom)));
      f.enter('HOVER', 4, env);
      this.placed = true;
    }
    if (this.pending) { const p = this.pending; this.pending = null; this.setIntent(p); }
    if (!!ctx.locked !== this.locked) {
      this.locked = !!ctx.locked;
      model.lod.autoUpdate = !this.locked;
      if (this.locked) model.lod.levels.forEach((l, i) => { l.object.visible = i === 0; });
    }
    const sdt = Math.min(0.1, dt * ctx.simScale);
    // a long frame is taken in steps of at most 1/60 s so the burst and the pecks look the same at any frame rate
    const steps = Math.max(1, Math.ceil(sdt * 60 - 1e-6));
    for (let i = 0; i < steps; i++) f.update(sdt / steps, env);
    ind.pos.copy(f.pos);
    ind.heading = f.heading;
    root.position.copy(f.pos);
    root.rotation.set(-f.pitch, f.heading, f.roll, 'YXZ');
    root.visible = true;
    AMH_UNIFORMS.uSurfaceY.value = ctx.floor.waterAt(f.pos.x, f.pos.z);
    model.look.dark = f.dark;
    const level = this.locked ? 0 : model.lod.getCurrentLevel();
    applyPose(model.rig, f.pose, level as 0 | 1 | 2);
    this.busy = !f.expired;
    // the leaves it is among bend away from it (near tiers only)
    if (env.grass && level <= 1) {
      if (this.pushSlot < 0) this.pushSlot = env.grass.claimPush();
      if (this.pushSlot >= 0) env.grass.setPush(this.pushSlot, f.pos.x, f.pos.y, f.pos.z, f.tl * (f.state === 'ESCAPE' ? 1.1 : 0.75));
    } else this.releasePush();
    if (level < 2 || (this.shadowTick++ & 1) === 0) this.updateShadow(env);
  }

  private updateShadow(env: FishEnv): void {
    const f = this.fish, sh = this.shadows, root = this.root;
    if (!f || !sh || this.shadowSlot < 0 || !root) return;
    const strength = underwaterSun(sunOf(root), this.sun);
    const ground = env.floor.heightAt(f.pos.x, f.pos.z);
    const h = Math.max(0, f.pos.y - ground);
    if (strength <= 0.01 || h > 0.8) { sh.hide(this.shadowSlot); return; }
    const L = this.sun;
    const k = h / Math.max(L.y, 0.2);
    const x = f.pos.x - L.x * k, z = f.pos.z - L.z * k;
    const gy = env.floor.heightAt(x, z) + 0.003;
    const tl = f.tl;
    const blur = 0.002 + 0.05 * h;
    // a deep, thin fish: from straight above a sliver, under a low sun the side of its body
    const cosP = Math.abs(Math.cos(f.pitch));
    const side = Math.min(1, Math.hypot(L.x, L.z) * 1.4);
    const len = tl * (0.8 * cosP + 0.5 * (1 - cosP)) + 2 * blur, wid = tl * (0.12 + 0.4 * side + 0.25 * (1 - cosP)) + 2 * blur;
    const opacity = strength * 0.6 * (tl * tl) / ((tl + 1.6 * blur) * (tl + 1.6 * blur));
    sh.set(this.shadowSlot, x, gy, z, f.heading, len, wid, opacity, Math.min(0.95, 0.25 + (2 * blur) / Math.max(wid, 1e-4)));
  }

  holdAt(x: number, z: number, heading?: number): void {
    const f = this.fish, ind = this.ind;
    if (!f || !ind) return;
    f.pos.x = x; f.pos.z = z;
    f.vel.set(0, 0, 0);
    if (heading !== undefined) f.heading = heading;
    this.placed = false;
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
    const f = this.fish;
    if (!f || !this.placed) return this.ind ? this.tmp.copy(this.ind.pos) : this.tmp.set(0, 0, 0);
    return this.tmp.copy(f.pos);
  }

  get openings(): { mouth: number; gill: number } {
    return { mouth: this.fish?.pose.jaw ?? 0, gill: 0 };
  }

  debugLabel(): string {
    const f = this.fish;
    return f ? `${f.state}${f.sleeping ? ' zz' : ''}` : '';
  }

  /** the fish's behaviour model (the viewer and tests drive it directly) */
  get behaviour(): AmimehagiFish | null { return this.fish; }

  dispose(): void {
    this.detach();
    this.fish = null;
    this.listeners.clear();
  }
}
