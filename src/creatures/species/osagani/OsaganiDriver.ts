import { Group, Vector3, type Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, BodyState, Driver, DriverContext, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { createCrabBehavior, type Burrow, type CrabApi } from './behavior';
import { applyPose } from './rig';
import { stillPose } from './poses';
import { OsaganiLook, SUBSTRATE_TINT, type OsLookSpec } from './materials';
import { buildModel, disposeModel, osaganiRig, MODEL_CW, showLevel, type OsaganiModel } from './model';
import { chelaFor } from './anatomy';
import { CRAB_RENDER_ORDER, burrowsFor, mouthRadius, releaseBurrow, type BurrowEntry } from './burrows';

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/**
 * The quality's say over the ヤマトオサガニ's tiers (App.applyPreset sets it from the field's preset): how far it is
 * drawn, how many of the nearest crabs get the near tier (`lod1Count`), whether the observed one gets the hero tier
 * (`hero` with `modelTier` 'hero'), and whether everything stays on the far tier (`modelTier` 'lod2').
 */
export const OSAGANI_DETAIL = { viewScale: 1, lod1Count: 4, hero: true, farOnly: false };

/**
 * The individual's own look: its colour morph (mud-brown 45 %, grey-brown 35 %, dark olive-grey 20 % of the
 * photographed adults), how young its colours still are (pale and sandy under ≈ 20 mm: B24, B52), the mature male's
 * cream (or bluish: B12, B14) claws, the mud on it.
 */
export function lookSpecFor(id: string, sex: 'm' | 'f' | 'unknown' = 'm', cw_mm = 35): OsLookSpec {
  const r = new Rng(hashInts(strHash(id), 0x05a));
  const u = r.next();
  const morph = u < 0.45 ? 0 : u < 0.8 ? 1 : 2;
  const j = Math.min(1, Math.max(0, (24 - cw_mm) / 10));
  const ch = chelaFor(sex, cw_mm);
  return {
    seed: r.next() * 1000, sex: sex === 'f' ? 1 : 0, maleChela: ch.male, juvenile: j * j * (3 - 2 * j), morph,
    palmBlue: r.next() < 0.3 ? r.range(0.4, 1) : r.range(0, 0.2), mud: r.range(0.05, 0.45), value: r.range(0.88, 1.12),
  };
}

/** the near (lod1) and hero tiers are handed out by distance among the crabs on the flat (OSAGANI_DETAIL) */
const LIVE = new Set<OsaganiDriver>();
let rankStamp = Number.NaN;
function rankTiers(stamp: number, player: Vector3): void {
  if (stamp === rankStamp) return;
  rankStamp = stamp;
  const list = [...LIVE].filter((d) => d.ready).map((d) => ({ d, dist: d.distanceTo(player) })).sort((a, b) => a.dist - b.dist);
  let near = 0;
  for (const { d, dist } of list) {
    let tier: 0 | 1 | 2 = 2;
    if (OSAGANI_DETAIL.farOnly) tier = 2;
    else if (d.locked) tier = OSAGANI_DETAIL.hero ? 0 : 1;
    else if (near < OSAGANI_DETAIL.lod1Count && dist < 2.2 * OSAGANI_DETAIL.viewScale * d.sizeK) { tier = 1; near++; }
    d.tier = tier;
  }
}

const _s = new Vector3();

/**
 * ヤマトオサガニ (Macrophthalmus japonicus): the burrowing crab of the muddy flat. It stands by its burrow with its
 * eyestalks up, walks sideways on planted feet, scrapes the mud's surface film with its claws, rears up with its claws
 * raised at a danger, runs for its burrow and goes down it, and comes up again eyestalks first (behavior.ts: IDLE,
 * WALK, FORAGE, BURROW_ENTRY, BURROW_EXIT, DEFEND, ESCAPE). The brain's intents choose what it does; the behaviour
 * carries each one out. It draws itself through three tiers of shared geometry with its own materials, the tier chosen
 * by the quality (OSAGANI_DETAIL), and its burrow on the flat's shared burrow renderer.
 */
export class OsaganiDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: OsaganiModel<OsaganiLook> | null = null;
  private crab: CrabApi | null = null;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  private readonly bodyState: BodyState = { mode: 'bed', heading: 0, y: 0 };
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
  private arm = 1;
  private burrow: Burrow | null = null;
  private entry: BurrowEntry | null = null;
  private burrowParent: Object3D | null = null;
  private shown = -1;
  busy = false;
  /** the tier to draw (rankTiers) */
  tier: 0 | 1 | 2 = 2;
  locked = false;

  /** The view's holder; the rig and meshes are built in attach(). */
  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'Osagani';
    return { root, parts: {}, length: MODEL_CW };
  }

  /** A standing crab at the model size for the 図鑑 (`seed` picks the individual's look; a mature male). */
  static makePreview(seed = 0): Object3D {
    const id = `preview#${Math.floor(seed * 1e6)}`;
    const look = new OsaganiLook(lookSpecFor(id, 'm', 36));
    look.uniforms.uGroundY.value = 0;
    const m = buildModel(look, [0]);
    const P = stillPose(osaganiRig(), 'stand');
    applyPose(m.root, m.bones, osaganiRig(), P, chelaFor('m', 36).arm);
    m.lod.autoUpdate = false;
    m.root.userData.disposer = () => disposeModel(m);
    return m.root;
  }

  /** The species' materials in every tier (shell, setae): DriverEntry.keep. */
  static keep(parent: Object3D): { dispose(): void } {
    const m = buildModel(new OsaganiLook(lookSpecFor('keep')));
    for (const lv of m.lod.levels) lv.object.visible = true;
    parent.add(m.root);
    return { dispose: () => { m.root.removeFromParent(); disposeModel(m); } };
  }

  get ready(): boolean { return !!this.crab && !!this.model; }
  /** (tiers' reach scales with the crab's size: a 15 mm young one is near only closer) */
  get sizeK(): number { return Math.min(1.2, Math.max(0.5, (this.ind?.length_mm ?? 35) / 35)); }
  distanceTo(p: Vector3): number { return this.crab ? this.crab.pos.distanceTo(p) : Infinity; }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const cw = individual.length_mm;
    const scale = cw / 1000 / MODEL_CW;
    const ch = chelaFor(individual.sex, cw);
    this.arm = ch.arm;
    this.model = buildModel(new OsaganiLook(lookSpecFor(individual.id, individual.sex, cw)));
    this.model.look.uniforms.uMmScale.value = 0.001 * scale;
    this.model.lod.autoUpdate = false;
    for (const m of this.model.shells) m.renderOrder = CRAB_RENDER_ORDER;
    if (this.model.setae) this.model.setae.renderOrder = CRAB_RENDER_ORDER;
    root.add(this.model.root);
    root.scale.setScalar(scale);
    const rng = new Rng(hashInts(strHash(individual.id), 307));
    // its burrow: where it lives (the spawn point), the shaft slanting its own way
    this.burrow = { x: individual.home.x, z: individual.home.z, az: rng.next() * Math.PI * 2 };
    if (!this.crab) {
      this.crab = createCrabBehavior({
        world: this.worldAdapter(), rng: () => rng.next(), rig: osaganiRig(), scale: cw / 1000,
        start: { x: individual.pos.x, z: individual.pos.z, heading: individual.heading },
        burrow: this.burrow, range: Math.max(0.6, (cw / 1000) * 45), maleChela: ch.male,
        // a share of them is found down their burrows
        startInBurrow: strHash(individual.id) % 3 === 0,
      });
    }
    const parent = root.parent ?? root;
    this.burrowParent = parent;
    this.entry = { x: this.burrow.x, z: this.burrow.z, az: this.burrow.az, r: mouthRadius(cw / 1000), crab: { x: 0, z: 0, heading: 0, cw: cw / 1000, out: true, shadow: 0.4 } };
    burrowsFor(parent).entries.add(this.entry);
    LIVE.add(this);
    root.visible = false;
  }

  detach(): void {
    LIVE.delete(this);
    if (this.burrowParent && this.entry) releaseBurrow(this.burrowParent, this.entry);
    this.entry = null; this.burrowParent = null;
    if (this.model) disposeModel(this.model);
    this.model = null;
    this.root = null;
    this.shown = -1;
  }

  /** what the behaviour needs from the world */
  private worldAdapter() {
    const floor = () => this.ctx?.floor;
    return {
      ground: (x: number, z: number) => floor()?.heightAt(x, z) ?? 0,
      waterY: (x: number, z: number) => floor()?.waterAt(x, z) ?? -1e3,
      // the observer it has noticed (the brain's alert)
      threat: () => (!Number.isNaN(this.player.x) && (this.ind?.alert ?? 0) > 0.25 ? { pos: this.player } : null),
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
    const inBurrow = c.state.burrow > 0.5;
    const from = intent.from ?? (Number.isNaN(this.player.x) ? null : this.player);
    switch (intent.kind) {
      case 'flee':
        c.escape(from);
        break;
      case 'rest':
        // down its burrow it stays down a while, or comes up to look out; on the mud it stands
        if (inBurrow) { if (ind.rng.chance(0.6)) c.exitBurrow(1.5 + 3 * ind.rng.next()); else c.enterBurrow(secs); } else c.idle(secs);
        break;
      case 'burrow':
        if (this.canBurrow) c.enterBurrow(Math.max(secs, 10)); else c.idle(secs);
        break;
      case 'wander': case 'moveTo': {
        const t = intent.target;
        if (!t) { c.idle(secs); break; }
        c.walk({ x: t.x, z: t.z }, intent.urgency > 0.8);
        break;
      }
      case 'forage':
        c.forage(secs);
        break;
      case 'display':
        if (inBurrow) c.enterBurrow(secs); else c.defend(from, Math.max(secs, 2.5));
        break;
      case 'special':
        if ((intent.param === 'hide' || intent.param === 'sleep') && this.canBurrow) c.enterBurrow(Math.max(secs, 30));
        else c.idle(secs);
        break;
      default:
        c.idle(6);
    }
  }

  /** the net takes it only while it is out of its burrow */
  canNetCapture(): boolean {
    return !this.crab || this.crab.state.burrow < 0.3;
  }

  /** down its burrow: not pickable, not catchable */
  get hidden(): boolean {
    return !!this.crab?.hidden;
  }

  update(dt: number, ctx: DriverContext): void {
    const c = this.crab, ind = this.ind, model = this.model, root = this.root;
    if (!c || !ind || !model || !root) return;
    this.ctx = ctx;
    const sdt = Math.min(0.1, dt * ctx.simScale);
    this.clock += sdt;
    this.player.copy(ctx.player);
    if (this.pending) { const p = this.pending; this.pending = null; this.setIntent(p); }
    // nothing to dig into (a tank, the acrylic case): no burrow, and one down it comes out
    this.canBurrow = ctx.canBurrow !== false && !ctx.bounds;
    if (!this.canBurrow && c.state.burrow > 0.05 && c.state.mode !== 'BURROW_EXIT') c.exitBurrow(0.2);
    this.locked = !!ctx.locked;
    const st = c.state;
    const cw = ind.length_mm / 1000;
    // the tide in over its burrow: it goes down and stays down until the water is off again
    const water = ctx.floor.waterAt(st.pos.x, st.pos.z) - ctx.floor.heightAt(st.pos.x, st.pos.z);
    if (this.canBurrow && water > Math.max(0.1, cw * 3) && !this.locked && st.mode !== 'BURROW_ENTRY' && st.mode !== 'ESCAPE') c.enterBurrow(30);
    // the mud it lives on: the film on its shell
    this.substrateT -= sdt;
    if (this.substrateT <= 0) {
      this.substrateT = 1;
      const smp = ctx.floor.sampleAt?.(st.pos.x, st.pos.z);
      const col = SUBSTRATE_TINT[smp?.substrate ?? 'mud'] ?? SUBSTRATE_TINT.mud;
      model.look.setMud(col[0], col[1], col[2]);
    }
    // the tier: the quality's share of the near tiers by distance (rankTiers); the observed one in full
    rankTiers(ctx.nowMs, ctx.player);
    const tier = this.tier;
    if (this.shown !== tier) { showLevel(model, tier); this.shown = tier; }
    // (steps of at most 1/40 s: the feet stay planted at a low frame rate)
    const steps = Math.max(1, Math.ceil(sdt * 40 - 1e-6));
    for (let i = 0; i < steps; i++) c.update(sdt / steps, tier);
    ind.pos.copy(st.pos);
    ind.heading = st.heading;
    this.groundY = ctx.floor.heightAt(st.pos.x, st.pos.z);
    // wet in the water, moist on the mud, drying slowly in the air (never quite dry at low tide)
    const submerged = water > cw * 0.3;
    this.wet = submerged || st.burrow > 0.5 ? Math.min(1, this.wet + sdt) : Math.max(0.55, this.wet - sdt / 240);
    const u = model.look.uniforms;
    u.uWet.value = this.wet;
    u.uGroundY.value = this.groundY;
    u.uMudCoat.value = Math.min(1, model.look.spec.mud + c.pose.mudCoat * 0.6);
    applyPose(root, model.bones, osaganiRig(), c.pose, this.arm);
    root.visible = !c.hidden || this.locked;
    // its burrow and its shadow on the mud
    if (this.entry && this.burrowParent) {
      const e = this.entry.crab!;
      e.x = st.pos.x; e.z = st.pos.z; e.heading = st.heading; e.out = st.burrow < 0.3; e.shadow = 0.38 * (1 - st.burrow / 0.3);
      burrowsFor(this.burrowParent).frame(ctx.nowMs, ctx.floor, ctx.player);
    }
    if (st.mode !== this.lastMode) { this.lastMode = st.mode; this.emit(st.mode.toLowerCase()); }
    this.busy = this.clock < this.until || !c.settled;
  }

  holdAt(x: number, z: number, heading?: number): void {
    const c = this.crab, ind = this.ind;
    if (!c || !ind) return;
    c.state.pos.x = x; c.state.pos.z = z;
    c.state.vel.set(0, 0, 0);
    c.state.burrow = c.state.burrowGoal = 0;
    if (heading !== undefined) c.state.heading = heading;
    c.idle(4);
    ind.pos.x = x; ind.pos.z = z;
    this.busy = false;
  }

  /** on the mud, or down its burrow out of everyone's way */
  body(): BodyState {
    const c = this.crab, b = this.bodyState;
    if (c) {
      const st = c.state;
      b.mode = st.burrow > 0.3 ? 'away' : 'bed';
      b.heading = st.heading;
      b.y = this.groundY;
    }
    return b;
  }

  nudge(dx: number, dz: number): void {
    const c = this.crab, ind = this.ind;
    if (!c || c.state.burrow > 0.05) return;
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
    return this.tmp.copy(c.state.pos).add(_s.set(0, ((this.ind?.length_mm ?? 35) / 1000) * 0.35, 0));
  }

  debugLabel(): string {
    const s = this.crab?.state;
    return s ? `${s.mode}/${s.phase}${s.burrow > 0.5 ? ' (巣穴)' : ''} t${this.tier}` : '';
  }

  /** the crab's behaviour (the viewer and tests drive it directly) */
  get behaviour(): CrabApi | null { return this.crab; }
  get view(): OsaganiModel<OsaganiLook> | null { return this.model; }

  dispose(): void {
    this.detach();
    this.crab = null;
    this.listeners.clear();
  }
}
