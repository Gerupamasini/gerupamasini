import { Color, Group, Vector3, type Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { createSquidBehavior, type SquidApi } from './behavior';
import { applyPose } from './rig';
import { MimiikaLook, SUBSTRATE_TINT, type MmLookSpec } from './materials';
import { buildModel, disposeModel, syncLevel, LOD1_AT, LOD2_AT, MODEL_ML, type MimiikaModel } from './model';
import { makeMysidModel, poseMysid } from './prey';
import { SandFX } from '../akaei/SandFX';
import { CONTACT_SHADOWS, shadowLayerFor, sunOf, underwaterSun, type ShadowLayer } from '../haku/ContactShadows';
import { AMH_UNIFORMS, tickAmimehagiMaterials } from '../amimehagi/materials';

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** The individual's own look: warmer or cooler, darker or paler at rest, its own pattern. */
export function lookSpecFor(id: string): MmLookSpec {
  const r = new Rng(hashInts(strHash(id), 0x5e9));
  return { tint: [r.range(0.96, 1.05), r.range(0.95, 1.03), r.range(0.94, 1.04)], seed: r.next(), dark: r.range(0.85, 1.15) };
}

const INK = new Vector3(0.012, 0.01, 0.011);
const _v = new Vector3();

/**
 * ミミイカ (Euprymna morsei): the small bobtail squid of the sandy shallows. By day it lies buried with only its eyes
 * out; at night it hangs and swims over the sand on its ear-like fins, hunts mysids with its tentacles and, when
 * startled, inks and jets away mantle first and buries again (behavior.ts: REST, HOVER, SWIM, CRAWL, BURROW, HUNT,
 * ESCAPE). The brain's intents choose what it does; the behaviour carries each one out. It draws itself through three
 * tiers of shared geometry with its own chromatophore materials, throws sand and ink (the アカエイ's SandFX) and
 * casts a soft contact shadow.
 */
export class MimiikaDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: MimiikaModel | null = null;
  private squid: SquidApi | null = null;
  private sandFx: SandFX | null = null;
  private inkFx: SandFX | null = null;
  private preyModel: Group | null = null;
  private shadows: ShadowLayer | null = null;
  private shadowSlot = -1;
  private locked = false;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  private readonly sun = new Vector3();
  private readonly player = new Vector3(Number.NaN, 0, 0);
  private ctx: DriverContext | null = null;
  private pending: Intent | null = null;
  private until = 0;
  private clock = 0;
  private substrateT = 0;
  private lastMode = '';
  private canBurrow = true;
  private night = false;
  busy = false;

  /** The view's holder; the rig and meshes are built in attach(). */
  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'Mimiika';
    return { root, parts: {}, length: MODEL_ML };
  }

  /** A resting squid at the model size for the 図鑑 (`seed` picks the individual's look). */
  static makePreview(seed = 0): Object3D {
    const m = buildModel(new MimiikaLook(lookSpecFor(`preview#${Math.floor(seed * 1e6)}`)), [0]);
    const b = createSquidBehavior({ world: { ground: () => 0, waterY: () => 1 }, rng: () => 0.5, scale: 1, start: { x: 0, z: 0, heading: 0 }, autonomous: false });
    let P = b.update(1 / 60);
    for (let i = 0; i < 30; i++) P = b.update(1 / 30);
    P.pos.set(0, 0, 0);
    applyPose(m.root, m.bones, P);
    m.root.position.set(0, 0, 0);
    m.lod.autoUpdate = false;
    syncLevel(m, 0, false);
    MimiikaDriver.applyMaterials(m, P);
    m.root.userData.disposer = () => disposeModel(m);
    return m.root;
  }

  /** The species' materials in every tier (skin, far skin, fins, eyes), the mysid, the sand and ink: DriverEntry.keep. */
  static keep(parent: Object3D): { dispose(): void } {
    const m = buildModel(new MimiikaLook(lookSpecFor('keep')));
    for (const t of m.tentacles) if (t) t.visible = true;
    parent.add(m.root);
    // the far tier's eyeball material too
    const far = buildModel(new MimiikaLook(lookSpecFor('keep-far')), [2]);
    parent.add(far.root);
    const prey = makeMysidModel();
    parent.add(prey);
    const fx = new SandFX(parent);
    return {
      dispose: () => {
        m.root.removeFromParent(); disposeModel(m);
        far.root.removeFromParent(); disposeModel(far);
        prey.removeFromParent();
        fx.dispose();
      },
    };
  }

  /** the pose's skin state into the materials */
  static applyMaterials(m: MimiikaModel, P: ReturnType<SquidApi['update']>): void {
    const u = m.look.uniforms;
    u.uMantle.value = P.mantle;
    u.uFinAmp.value.set(P.finAmp[0], P.finAmp[1]);
    u.uFinPh.value.set(P.finPh[0], P.finPh[1]);
    u.uFinK.value = P.finK;
    u.uChroma.value.set(P.chroma.y, P.chroma.r, P.chroma.b, P.chroma.mottle);
    u.uIrid.value = P.chroma.irid;
    u.uPale.value = P.chroma.pale;
    u.uSandCoat.value = P.sandCoat;
    u.uHeadCover.value = P.headCover;
    u.uPupil.value = P.pupil;
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const scale = individual.length_mm / 1000 / MODEL_ML;
    this.model = buildModel(new MimiikaLook(lookSpecFor(individual.id)));
    root.add(this.model.root);
    root.scale.setScalar(scale);   // (once: the size does not change in the field)
    const lv = this.model.lod.levels;
    lv[1].distance = LOD1_AT * scale; lv[2].distance = LOD2_AT * scale;
    if (!this.squid) {
      const rng = new Rng(hashInts(strHash(individual.id), 113));
      this.squid = createSquidBehavior({
        world: this.worldAdapter(), rng: () => rng.next(), scale,
        start: { x: individual.pos.x, z: individual.pos.z, heading: individual.heading },
        home: { x: individual.home.x, z: individual.home.z }, range: 1.2,
        autonomous: false,
        // by day most of them are found buried
        startBuried: (strHash(individual.id) % 3) !== 0,
      });
    }
    const parent = root.parent ?? root;
    this.sandFx = new SandFX(parent);
    this.sandFx.shadow.visible = false;
    this.inkFx = new SandFX(parent);
    this.inkFx.shadow.visible = false;
    this.inkFx.setSandColour(INK);
    this.inkFx.points.name = 'MimiikaInk';
    this.shadows = shadowLayerFor(parent);
    this.shadowSlot = this.shadows.claim();
    root.visible = false;
  }

  detach(): void {
    if (this.shadows) this.shadows.release(this.shadowSlot);
    this.shadowSlot = -1;
    this.shadows = null;
    this.sandFx?.dispose(); this.sandFx = null;
    this.inkFx?.dispose(); this.inkFx = null;
    this.preyModel?.removeFromParent(); this.preyModel = null;
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
      // the observer it has noticed (the brain's alert): its eyes follow it
      threat: () => (!Number.isNaN(this.player.x) && (this.ind?.alert ?? 0) > 0.15 ? { pos: this.player } : null),
      bounds: () => this.ctx?.bounds ?? null,
      canBurrow: () => this.canBurrow,
    };
  }

  setIntent(intent: Intent): void {
    const s = this.squid, ind = this.ind;
    if (!s || !ind || !this.ctx) { this.pending = intent; this.busy = true; return; }
    const secs = intent.seconds > 0 ? intent.seconds : 8;
    this.until = this.clock + secs;
    this.busy = true;
    const st = s.state;
    const buried = st.mode === 'BURROW' && st.bury > 0.5;
    const r = ind.rng;
    switch (intent.kind) {
      case 'flee':
        s.escape(intent.from ?? (Number.isNaN(this.player.x) ? null : this.player), intent.target ?? null);
        break;
      case 'rest':
        // at night a resting squid often hangs over the sand instead of sitting on it
        if (!buried && this.night && r.chance(0.4)) s.hover(secs);
        else s.rest(secs);
        break;
      case 'burrow':
        if (this.canBurrow) s.burrow(Math.max(secs, 20)); else s.rest(secs);
        break;
      case 'wander': case 'moveTo': {
        const t = intent.target;
        const d = t ? Math.hypot(t.x - st.pos.x, t.z - st.pos.z) : 0;
        if (!t) s.hover(secs);
        else if (d < 0.12 * (ind.length_mm / 25) && !buried) s.crawl({ x: t.x, z: t.z });
        else s.swim({ x: t.x, z: t.z });
        break;
      }
      case 'forage':
        s.hunt();
        break;
      case 'display':
        // a squid does not display at an observer: it darkens and keeps still, eyes on it (buried, it stays put)
        s.freeze(Math.max(secs, 3));
        break;
      case 'special':
        if ((intent.param === 'hide' || intent.param === 'sleep' || !!this.ctx?.bounds) && this.canBurrow) s.burrow(Math.max(secs, 30));
        else s.hover(secs);
        break;
      default:
        s.rest(6);
    }
  }

  /** the net takes it only while it is out of the sand */
  canNetCapture(): boolean {
    return !this.squid || this.squid.state.bury < 0.5;
  }

  update(dt: number, ctx: DriverContext): void {
    const s = this.squid, ind = this.ind, model = this.model, root = this.root;
    if (!s || !ind || !model || !root) return;
    this.ctx = ctx;
    tickAmimehagiMaterials(performance.now() / 1000);
    const sdt = Math.min(0.1, dt * ctx.simScale);
    this.clock += sdt;
    this.player.copy(ctx.player);
    if (this.pending) { const p = this.pending; this.pending = null; this.setIntent(p); }
    // nothing to dig into (a bare tank, the acrylic case): it does not bury, and one born buried comes out
    this.canBurrow = ctx.canBurrow !== false;
    if (!this.canBurrow && s.state.bury > 0.05 && s.state.mode !== 'ESCAPE' && s.state.mode !== 'SWIM') s.hover(6);
    if (!!ctx.locked !== this.locked) {
      this.locked = !!ctx.locked;
      model.lod.autoUpdate = !this.locked;
      if (this.locked) model.lod.levels.forEach((l, i) => { l.object.visible = i === 0; });
    }
    // the light: night when the sun casts no shadow under water
    const sunK = underwaterSun(sunOf(root), this.sun);
    this.night = sunK < 0.15;
    this.substrateT -= sdt;
    if (this.substrateT <= 0) {
      this.substrateT = 0.8;
      const smp = ctx.floor.sampleAt?.(s.state.pos.x, s.state.pos.z);
      const c = SUBSTRATE_TINT[smp?.substrate ?? 'sand'] ?? SUBSTRATE_TINT.sand;
      model.look.setCover(c[0], c[1], c[2]);
      this.sandFx?.setSandColour(_v.set(c[0], c[1], c[2]));
      // background matching: the darker the bottom, the more the brown set spreads
      const lum = (c[0] + c[1] + c[2]) / 3;
      s.setSurroundings((0.37 - lum) / 0.2, this.night);
    }
    const steps = Math.max(1, Math.ceil(sdt * 60 - 1e-6));
    let P = null as ReturnType<SquidApi['update']> | null;
    for (let i = 0; i < steps; i++) P = s.update(sdt / steps);
    if (!P) return;
    const st = s.state;
    ind.pos.copy(st.pos);
    ind.heading = st.heading;
    AMH_UNIFORMS.uSurfaceY.value = ctx.floor.waterAt(st.pos.x, st.pos.z);
    applyPose(root, model.bones, P);
    const level = this.locked ? 0 : model.lod.getCurrentLevel();
    const tentaclesOut = P.ten[0].ext > 0.12 || P.ten[1].ext > 0.12;
    syncLevel(model, level, tentaclesOut);
    MimiikaDriver.applyMaterials(model, P);
    model.look.uniforms.uGroundY.value = ctx.floor.heightAt(st.pos.x, st.pos.z);
    root.visible = true;
    this.effects(sdt, ctx, level);
    this.updatePrey(level);
    this.updateShadow(P, sunK);
    if (st.mode !== this.lastMode) { this.lastMode = st.mode; this.emit(st.mode.toLowerCase()); }
    this.busy = this.clock < this.until || !s.settled;
  }

  /** sand and ink: only near enough to be seen (the far tier skips them) */
  private effects(dt: number, ctx: DriverContext, level: number): void {
    const s = this.squid!;
    const ground = (x: number, z: number) => ctx.floor.heightAt(x, z);
    const near = level <= 1 || this.locked;
    for (const e of s.fx) {
      if (!near) continue;
      const fx = e.kind === 'ink' ? this.inkFx : this.sandFx;
      fx?.emit(e.pos, e.vel, e.count, e.spread, e.size, e.life, e.alpha);
    }
    s.fx.length = 0;
    this.sandFx?.update(dt, ground);
    // (ink hangs in the water: it barely settles)
    this.inkFx?.update(dt, (x, z) => ground(x, z) - 1);
  }

  private updatePrey(level: number): void {
    const s = this.squid!, root = this.root!;
    const p = s.prey;
    if (!p || level > 1) { if (this.preyModel) this.preyModel.visible = false; return; }
    if (!this.preyModel) { this.preyModel = makeMysidModel(); (root.parent ?? root).add(this.preyModel); }
    if (p.state === 'caught' && s.state.phase !== 'eat' && s.state.phase !== 'aeating') {
      // on the club: where the tentacle's last joint is
      const b = this.model!.bones.J_tenL_5;
      b.getWorldPosition(p.pos);
    }
    poseMysid(this.preyModel, p);
  }

  /** a soft round shadow under the squid: tight when it sits, wide and faint when it hangs higher */
  private updateShadow(P: { lift: number; bury: number }, sunK: number): void {
    const s = this.squid, sh = this.shadows, root = this.root;
    if (!s || !sh || this.shadowSlot < 0 || !root || !this.ctx) return;
    const strength = sunK * (1 - P.bury) * (CONTACT_SHADOWS.enabled ? 1 : 0);
    if (strength <= 0.01) { sh.hide(this.shadowSlot); return; }
    const st = s.state, L = this.sun, K = root.scale.x;
    const h = P.lift + 0.006 * K;
    const k = h / Math.max(L.y, 0.2);
    const cx = st.pos.x + Math.sin(st.heading) * 0.002 * K, cz = st.pos.z + Math.cos(st.heading) * 0.002 * K;
    const x = cx - L.x * k, z = cz - L.z * k;
    const gy = this.ctx.floor.heightAt(x, z) + 0.002;
    const blur = 0.002 * K + 0.25 * P.lift;
    const len = MODEL_ML * K * 1.25 + 2 * blur, wid = MODEL_ML * K * 0.78 + 2 * blur;
    const opacity = strength * (0.5 - 0.3 * Math.min(1, P.lift / (MODEL_ML * K * 3)));
    sh.set(this.shadowSlot, x, gy, z, st.heading, len, wid, opacity, Math.min(0.95, 0.35 + (2 * blur) / wid));
  }

  holdAt(x: number, z: number, heading?: number): void {
    const s = this.squid, ind = this.ind;
    if (!s || !ind) return;
    s.state.pos.x = x; s.state.pos.z = z;
    s.state.vel.set(0, 0, 0);
    if (heading !== undefined) s.state.heading = heading;
    s.rest(4);
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
    const s = this.squid;
    if (!s) return this.ind ? this.tmp.copy(this.ind.pos) : this.tmp.set(0, 0, 0);
    return this.tmp.copy(s.state.pos);
  }

  debugLabel(): string {
    const s = this.squid?.state;
    return s ? `${s.mode}/${s.phase}${s.bury > 0.5 ? ' (砂)' : ''}` : '';
  }

  /** the squid's behaviour (the viewer and tests drive it directly) */
  get behaviour(): SquidApi | null { return this.squid; }
  get view(): MimiikaModel | null { return this.model; }

  dispose(): void {
    this.detach();
    this.squid = null;
    this.listeners.clear();
  }
}

/** the sand's colour as a Color (for a viewer's bed) */
export const sandColor = (sub = 'sand') => new Color(...(SUBSTRATE_TINT[sub] ?? SUBSTRATE_TINT.sand));
