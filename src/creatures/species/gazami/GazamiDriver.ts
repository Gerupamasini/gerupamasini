import { Group, Vector3, type Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, BodyState, Driver, DriverContext, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { createCrabBehavior, type CrabApi } from './behavior';
import { applyPose } from './rig';
import { stillPose } from './poses';
import { GazamiLook, SUBSTRATE_TINT, type GzLookSpec } from './materials';
import { buildModel, disposeModel, gazamiRig, LOD1_AT, LOD2_AT, MODEL_CW, syncLevel, type GazamiModel } from './model';
import { DIMORPHISM } from './anatomy';
import { SandFX } from '../akaei/SandFX';
import { keepSandDust, sandDustFor, type DustSource } from '../../fx/SandDust';
import { CONTACT_SHADOWS, sunOf, underwaterSun } from '../haku/ContactShadows';
import { AMH_UNIFORMS, tickAmimehagiMaterials } from '../amimehagi/materials';

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/**
 * The individual's own look: its morph (olive 45 %, purplish brown 25 %, dark brown 15 %, green-olive 15 % of the
 * photographed adults), how juvenile its colours still are (sandy and translucent under ≈ 4 cm: 1–3, 23, 24, 68), its
 * sex (the female's fingers orange-red) and its own pattern.
 */
export function lookSpecFor(id: string, sex: 'm' | 'f' | 'unknown' = 'm', cw_mm = 100): GzLookSpec {
  const r = new Rng(hashInts(strHash(id), 0x6a2));
  const u = r.next();
  const morph = u < 0.45 ? 0 : u < 0.7 ? 1 : u < 0.85 ? 2 : 3;
  const j = Math.min(1, Math.max(0, (48 - cw_mm) / 30));
  return { seed: r.next() * 1000, sex: sex === 'f' ? 1 : 0, juvenile: j * j * (3 - 2 * j), morph, value: r.range(0.85, 1.15) };
}

/** the chelipeds' size against the body: a male's long, a female's shorter (61, 9), one of the pair a little larger */
export function chelaScaleFor(id: string, sex: 'm' | 'f' | 'unknown', cw_mm: number): [number, number] {
  const r = new Rng(hashInts(strHash(id), 0x5c1));
  const base = (sex === 'f' ? DIMORPHISM.femaleCheliped : 1) * (cw_mm < 40 ? 0.9 : 1) * r.range(0.96, 1.04);
  const big = 1 + DIMORPHISM.asymmetry * r.next();
  return r.next() < 0.5 ? [base * big, base] : [base, base * big];
}

const _s = new Vector3();

/**
 * ガザミ (Portunus trituberculatus): the swimming crab of the sandy shallows. It rests on the sand with its claws
 * folded, walks sideways on planted feet, picks over the sand for food, buries itself shallowly backwards with only
 * its eyes out, rears up with its claws spread at a threat, runs off sideways and swims away on its paddles
 * (behavior.ts: IDLE, WALK, FORAGE, BURROW, DEFEND, ESCAPE, SWIM). The brain's intents choose what it does; the
 * behaviour carries each one out. It draws itself through three tiers of shared geometry with its own shell materials,
 * throws sand into the water (the shared dust, fx/SandDust), leaves the pit it digs and lays a soft contact shadow on
 * the bottom (the アカエイ's SandFX).
 */
export class GazamiDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: GazamiModel<GazamiLook> | null = null;
  private crab: CrabApi | null = null;
  private sandFx: SandFX | null = null;
  private dust: DustSource | null = null;
  private chela: [number, number] = [1, 1];
  private locked = false;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  private readonly bodyState: BodyState = { mode: 'bed', heading: 0, y: 0 };
  private readonly sun = new Vector3();
  private readonly player = new Vector3(Number.NaN, 0, 0);
  private ctx: DriverContext | null = null;
  private pending: Intent | null = null;
  private until = 0;
  private clock = 0;
  private substrateT = 0;
  private lastMode = '';
  private canBurrow = true;
  private wet = 1;
  private groundY = 0;
  busy = false;

  /** The view's holder; the rig and meshes are built in attach(). */
  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'Gazami';
    return { root, parts: {}, length: MODEL_CW };
  }

  /** A resting crab at the model size for the 図鑑 (`seed` picks the individual's look). */
  static makePreview(seed = 0): Object3D {
    const id = `preview#${Math.floor(seed * 1e6)}`;
    const m = buildModel(new GazamiLook(lookSpecFor(id, 'm', 110)), [0]);
    const P = stillPose(gazamiRig(), 'rest');
    applyPose(m.root, m.bones, gazamiRig(), P, chelaScaleFor(id, 'm', 110));
    m.lod.autoUpdate = false;
    m.root.userData.disposer = () => disposeModel(m);
    return m.root;
  }

  /** The species' materials in every tier (shell, far shell, setae) and the sand effects: DriverEntry.keep. */
  static keep(parent: Object3D): { dispose(): void } {
    const m = buildModel(new GazamiLook(lookSpecFor('keep')));
    for (const lv of m.lod.levels) lv.object.visible = true;
    parent.add(m.root);
    const fx = new SandFX(parent);
    const dust = keepSandDust(parent);
    // (the pit it digs: its material too)
    fx.imprint(0, 0, 0, 0.05, 0.03, () => 0);
    return {
      dispose: () => { m.root.removeFromParent(); disposeModel(m); fx.dispose(); dust.dispose(); },
    };
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const cw = individual.length_mm;
    const scale = cw / 1000 / MODEL_CW;
    this.model = buildModel(new GazamiLook(lookSpecFor(individual.id, individual.sex, cw)));
    this.model.look.uniforms.uMmScale.value = 0.001 * scale;
    this.chela = chelaScaleFor(individual.id, individual.sex, cw);
    root.add(this.model.root);
    root.scale.setScalar(scale);   // (once: the size does not change in the field)
    const lv = this.model.lod.levels;
    lv[1].distance = LOD1_AT * scale; lv[2].distance = LOD2_AT * scale;
    if (!this.crab) {
      const rng = new Rng(hashInts(strHash(individual.id), 211));
      this.crab = createCrabBehavior({
        world: this.worldAdapter(), rng: () => rng.next(), rig: gazamiRig(), scale: cw / 1000,
        start: { x: individual.pos.x, z: individual.pos.z, heading: individual.heading },
        home: { x: individual.home.x, z: individual.home.z }, range: Math.max(1.2, cw / 1000 * 40),
        autonomous: false,
        // a share of them is found dug in
        startBuried: (strHash(individual.id) % 3) === 0,
      });
    }
    const parent = root.parent ?? root;
    this.sandFx = new SandFX(parent);
    const dustRng = new Rng(hashInts(strHash(individual.id), 0xd057));
    this.dust = sandDustFor(parent).source(() => dustRng.next());
    root.visible = false;
  }

  detach(): void {
    this.sandFx?.dispose(); this.sandFx = null;
    this.dust?.release(); this.dust = null;
    if (this.model) disposeModel(this.model);
    this.model = null;
    this.root = null;
  }

  /** what the behaviour needs from the world */
  private worldAdapter() {
    const floor = () => this.ctx?.floor;
    return {
      ground: (x: number, z: number) => floor()?.heightAt(x, z) ?? 0,
      waterY: (x: number, z: number) => floor()?.waterAt(x, z) ?? 1e3,
      // the observer it has noticed (the brain's alert)
      threat: () => (!Number.isNaN(this.player.x) && (this.ind?.alert ?? 0) > 0.2 ? { pos: this.player } : null),
      bounds: () => this.ctx?.bounds ?? null,
      canBurrow: () => this.canBurrow,
    };
  }

  setIntent(intent: Intent): void {
    const c = this.crab, ind = this.ind;
    if (!c || !ind || !this.ctx) { this.pending = intent; this.busy = true; return; }
    const secs = intent.seconds > 0 ? intent.seconds : 8;
    this.until = this.clock + secs;
    this.busy = true;
    const st = c.state;
    const buried = st.bury > 0.5;
    const from = intent.from ?? (Number.isNaN(this.player.x) ? null : this.player);
    const cw = ind.length_mm / 1000;
    switch (intent.kind) {
      case 'flee':
        c.escape(from, intent.target ? { x: intent.target.x, z: intent.target.z } : null);
        break;
      case 'rest':
        if (buried) c.burrow(secs); else c.idle(secs);
        break;
      case 'burrow':
        if (this.canBurrow) c.burrow(Math.max(secs, 20)); else c.idle(secs);
        break;
      case 'wander': case 'moveTo': {
        const t = intent.target;
        if (!t) { c.idle(secs); break; }
        const d = Math.hypot(t.x - st.pos.x, t.z - st.pos.z);
        const deep = (this.ctx.floor.waterAt(st.pos.x, st.pos.z) - this.ctx.floor.heightAt(st.pos.x, st.pos.z)) > cw * 0.9;
        // far and deep enough: it swims; otherwise it walks (hurried when sent back to the water)
        if (deep && d > cw * 10 && ind.rng.chance(0.55)) c.swim({ x: t.x, z: t.z }, intent.urgency > 0.8);
        else c.walk({ x: t.x, z: t.z }, intent.kind === 'moveTo' && intent.urgency > 0.8);
        break;
      }
      case 'forage':
        c.forage(secs);
        break;
      case 'display':
        c.defend(from, Math.max(secs, 2.5));
        break;
      case 'special':
        if ((intent.param === 'hide' || intent.param === 'sleep') && this.canBurrow) c.burrow(Math.max(secs, 30));
        else c.idle(secs);
        break;
      default:
        c.idle(6);
    }
  }

  /** the net takes it only while it is out of the sand */
  canNetCapture(): boolean {
    return !this.crab || this.crab.state.bury < 0.5;
  }

  update(dt: number, ctx: DriverContext): void {
    const c = this.crab, ind = this.ind, model = this.model, root = this.root;
    if (!c || !ind || !model || !root) return;
    this.ctx = ctx;
    tickAmimehagiMaterials(performance.now() / 1000);
    const sdt = Math.min(0.1, dt * ctx.simScale);
    this.clock += sdt;
    this.player.copy(ctx.player);
    if (this.pending) { const p = this.pending; this.pending = null; this.setIntent(p); }
    // nothing to dig into (a bare tank, the acrylic case): it does not bury, and one born buried comes out
    this.canBurrow = ctx.canBurrow !== false;
    if (!this.canBurrow && c.state.bury > 0.05 && c.state.mode === 'BURROW') c.idle(6);
    if (!!ctx.locked !== this.locked) {
      this.locked = !!ctx.locked;
      model.lod.autoUpdate = !this.locked;
      if (this.locked) model.lod.levels.forEach((l, i) => { l.object.visible = i === 0; });
    }
    const st = c.state;
    // the sediment it sits in: the sand on its shell and in its puffs
    this.substrateT -= sdt;
    if (this.substrateT <= 0) {
      this.substrateT = 0.8;
      const smp = ctx.floor.sampleAt?.(st.pos.x, st.pos.z);
      const col = SUBSTRATE_TINT[smp?.substrate ?? 'sand'] ?? SUBSTRATE_TINT.sand;
      model.look.setCover(col[0], col[1], col[2]);
      this.dust?.setBed(smp?.substrate);
    }
    const level = this.locked ? 0 : model.lod.getCurrentLevel();
    // (steps of at most 1/40 s: the gait's feet and the paddles' strokes stay smooth at a low frame rate)
    const steps = Math.max(1, Math.ceil(sdt * 40 - 1e-6));
    for (let i = 0; i < steps; i++) c.update(sdt / steps, level >= 2);
    ind.pos.copy(st.pos);
    ind.heading = st.heading;
    this.groundY = ctx.floor.heightAt(st.pos.x, st.pos.z);
    const waterY = ctx.floor.waterAt(st.pos.x, st.pos.z);
    AMH_UNIFORMS.uSurfaceY.value = waterY;
    // out of the water the film on the shell dries and dulls (slowly); under water it is wet at once
    const cw = ind.length_mm / 1000;
    const submerged = waterY - this.groundY > cw * 0.22;
    this.wet = submerged ? Math.min(1, this.wet + sdt * 2) : Math.max(0.3, this.wet - sdt / 90);
    const u = model.look.uniforms;
    u.uWet.value = this.wet;
    u.uGroundY.value = this.groundY;
    applyPose(root, model.bones, gazamiRig(), c.pose, this.chela);
    syncLevel(model, level);
    u.uSandCoat.value = c.pose.sandCoat;
    root.visible = true;
    this.effects(sdt, ctx, level);
    this.updateShadow(sdt, ctx);
    if (st.mode !== this.lastMode) { this.lastMode = st.mode; this.emit(st.mode.toLowerCase()); }
    this.busy = this.clock < this.until || !c.settled;
  }

  /** sand: only near enough to be seen (the far tier skips the puffs) */
  private effects(dt: number, ctx: DriverContext, level: number): void {
    const c = this.crab!, fx = this.sandFx, dust = this.dust;
    const ground = (x: number, z: number) => ctx.floor.heightAt(x, z);
    const near = level <= 1 || this.locked;
    const cw = (this.ind?.length_mm ?? 60) / 1000;
    if (dust) { dust.near = near; if (near) dust.tick(dt, ctx); }
    for (const e of c.fx) {
      // (the silt, and a couple of grains in each puff)
      if (e.kind === 'sand') { if (near) dust?.kick(e.pos, e.vel, e.count, e.spread, e.size, e.life, e.alpha, 2); }
      else if (!fx) continue;
      else if (e.kind === 'imprint') fx.imprint(e.pos.x, e.pos.z, e.heading ?? 0, cw * 0.55, cw * 0.32, ground, e.strength ?? 0.2, e.life);
      else if (e.kind === 'grow') fx.growImprint(e.strength ?? 0.5);
    }
    c.fx.length = 0;
    fx?.update(dt);
  }

  /** a soft shadow under the crab: dark on the sand, wide and faint while it swims above it, cast along the sun */
  private updateShadow(dt: number, ctx: DriverContext): void {
    const c = this.crab, fx = this.sandFx, root = this.root;
    if (!c || !fx || !root) return;
    const sunK = underwaterSun(sunOf(root), this.sun);
    const st = c.state, cw = (this.ind?.length_mm ?? 60) / 1000;
    const h = st.alt + cw * 0.12;
    const L = this.sun;
    const k = h / Math.max(L.y, 0.25);
    const x = st.pos.x - L.x * k, z = st.pos.z - L.z * k;
    const contact = (CONTACT_SHADOWS.enabled ? 1 : 0) * (0.35 + 0.65 * sunK) * (1 - st.bury) * Math.max(0.15, 1 - st.alt / (cw * 2));
    fx.updateShadow(dt, x, z, st.heading, cw * (0.5 + 0.4 * st.alt / cw), cw * (0.3 + 0.3 * st.alt / cw), contact, (px, pz) => ctx.floor.heightAt(px, pz), st.vel.lengthSq() > 1e-6 || st.alt > 0);
  }

  holdAt(x: number, z: number, heading?: number): void {
    const c = this.crab, ind = this.ind;
    if (!c || !ind) return;
    c.state.pos.x = x; c.state.pos.z = z;
    c.state.vel.set(0, 0, 0);
    c.state.alt = 0;
    if (heading !== undefined) c.state.heading = heading;
    c.idle(4);
    ind.pos.x = x; ind.pos.z = z;
    this.busy = false;
  }

  /** on the sand, swimming above it, or buried out of everyone's way */
  body(): BodyState {
    const c = this.crab, b = this.bodyState;
    if (c) {
      const st = c.state;
      b.mode = st.bury > 0.6 ? 'away' : st.alt > 0.005 ? 'water' : 'bed';
      b.heading = st.heading;
      b.y = this.groundY + st.alt;
    }
    return b;
  }

  nudge(dx: number, dz: number): void {
    const c = this.crab, ind = this.ind;
    if (!c) return;
    c.state.pos.x += dx; c.state.pos.z += dz;
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
    const c = this.crab;
    if (!c) return this.ind ? this.tmp.copy(this.ind.pos) : this.tmp.set(0, 0, 0);
    return this.tmp.copy(c.state.pos).add(_s.set(0, ((this.ind?.length_mm ?? 60) / 1000) * 0.15, 0));
  }

  debugLabel(): string {
    const s = this.crab?.state;
    return s ? `${s.mode}/${s.phase}${s.bury > 0.5 ? ' (砂)' : ''}` : '';
  }

  /** the crab's behaviour (the viewer and tests drive it directly) */
  get behaviour(): CrabApi | null { return this.crab; }
  get view(): GazamiModel<GazamiLook> | null { return this.model; }

  dispose(): void {
    this.detach();
    this.crab = null;
    this.listeners.clear();
  }
}
