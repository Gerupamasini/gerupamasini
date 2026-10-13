import { Color, Euler, Group, Vector3, type Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, BodyState, Driver, DriverContext, Intent } from '../../drivers/Driver';
import { WaterRider } from '../../physics/water';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { createSquidBehavior, type FxEvent, type SquidApi } from './behavior';
import { applyPose, armExtOf, armThin } from './rig';
import { MimiikaLook, SUBSTRATE_TINT, type MmLookSpec } from './materials';
import { buildModel, disposeModel, syncLevel, LOD1_AT, LOD2_AT, MODEL_ML, type MimiikaModel } from './model';
import { makeMysidModel, poseMysid } from './prey';
import { keepSandDust, sandDustFor, type DustSource } from '../../fx/SandDust';
import { SandFX, type ImprintLook } from '../akaei/SandFX';
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
 * Sand events the behaviour may give beyond FxEvent's: single grains that swell little (`grow` × their start size) and
 * are gone where they reach the sand (`kill`), sand darker than the bed (`shade`), and the pit it blows (kind 'pit':
 * centre, heading, half-sizes in m, how dark 0 … 1; `deepen` darkens the last pit instead of laying a new one, `fill`
 * fills it in over that many seconds).
 */
type SandEvent = FxEvent & { grow?: number; kill?: boolean; shade?: number };
interface PitEvent { kind: 'pit'; pos: Vector3; heading: number; halfW: number; halfL: number; strength: number; deepen?: boolean; life?: number; fill?: number }

/**
 * ミミイカ (Euprymna morsei): the small bobtail squid of the sandy shallows. By day it lies buried with only its eyes
 * out; at night it hangs and swims over the sand on its ear-like fins, hunts mysids with its tentacles and, when
 * startled, inks and jets away mantle first and buries again (behavior.ts: REST, HOVER, SWIM, CRAWL, BURROW, HUNT,
 * ESCAPE). The brain's intents choose what it does; the behaviour carries each one out. It draws itself through three
 * tiers of shared geometry with its own chromatophore materials, throws sand and ink (the shared dust, fx/SandDust) and
 * casts a soft contact shadow.
 */
export class MimiikaDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: MimiikaModel | null = null;
  private squid: SquidApi | null = null;
  /** the sand and the ink it throws into the water (shared by every animal under the parent) */
  private dust: DustSource | null = null;
  /** the pit it blows in the sand as it buries */
  private pitFx: SandFX | null = null;
  private readonly bedCol = new Color();
  private preyModel: Group | null = null;
  private shadows: ShadowLayer | null = null;
  private shadowSlot = -1;
  private locked = false;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  /** hovering or swimming, the swell carries the little squid to and fro and rocks it; on the sand it holds on */
  private readonly rider = new WaterRider();
  private readonly rock = new Euler(0, 0, 0, 'YXZ');
  private readonly bodyState: BodyState = { mode: 'bed', heading: 0, y: 0 };
  private groundY = 0;
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

  /**
   * The hollow the jets blow round it (42, 44–46): a crater darkest round the sinking body, its wall shading off into
   * a faint rim of thrown-out sand (the ray's resting oval is a shallow, even darkening).
   */
  static readonly PIT_LOOK: ImprintLook = { dark: 0.5, centre: 0.12, bowl: [0.64, 0.78], rim: 0.25, wobble: 0.08 };

  /** The species' materials in every tier (skin, far skin, fins, eyes), the mysid, the sand, the pit and ink: DriverEntry.keep. */
  static keep(parent: Object3D): { dispose(): void } {
    const m = buildModel(new MimiikaLook(lookSpecFor('keep')));
    for (const t of m.tentacles) if (t) t.visible = true;
    parent.add(m.root);
    // the far tier's eyeball material too
    const far = buildModel(new MimiikaLook(lookSpecFor('keep-far')), [2]);
    parent.add(far.root);
    const prey = makeMysidModel();
    parent.add(prey);
    const fx = keepSandDust(parent);
    // (the pit it blows as it buries)
    const pit = new SandFX(parent);
    pit.imprint(0, 0, 0, 0.01, 0.015, () => 0, 0.5, 150, 0.0007, MimiikaDriver.PIT_LOOK);
    return {
      dispose: () => {
        m.root.removeFromParent(); disposeModel(m);
        far.root.removeFromParent(); disposeModel(far);
        prey.removeFromParent();
        fx.dispose();
        pit.dispose();
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
    for (let i = 0; i < u.uArmThin.value.length; i++) u.uArmThin.value[i] = armThin(armExtOf(P, i));
    u.uPupil.value = P.pupil;
    u.uLid.value = P.lid;
    // the head's funnel groove fills as the funnel swings out of it
    { const x = Math.min(1, Math.max(0, (Math.abs(P.funnelSide) - 0.4) / 0.5)); u.uGrooveFill.value = x * x * (3 - 2 * x); }
    // the far tier's balls take the lid skin's mean colour
    const k = Math.min(1, Math.max(0, 0.8 * P.chroma.r + 0.3 * P.chroma.b));
    u.uLidCol.value.setRGB(0.42 + (0.13 - 0.42) * k, 0.38 + (0.045 - 0.38) * k, 0.36 + (0.03 - 0.36) * k);
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const scale = individual.length_mm / 1000 / MODEL_ML;
    this.model = buildModel(new MimiikaLook(lookSpecFor(individual.id)));
    // (the sand coat's fade into the bed and its grains follow the size)
    this.model.look.setScale(scale);
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
    const dustRng = new Rng(hashInts(strHash(individual.id), 0xd057));
    this.dust = sandDustFor(parent).source(() => dustRng.next());
    // (the ray's decals, for the pit only: its contact shadow is the layer below)
    this.pitFx = new SandFX(parent);
    this.pitFx.shadow.visible = false;
    this.shadows = shadowLayerFor(parent);
    this.shadowSlot = this.shadows.claim();
    root.visible = false;
  }

  detach(): void {
    if (this.shadows) this.shadows.release(this.shadowSlot);
    this.shadowSlot = -1;
    this.shadows = null;
    this.dust?.release(); this.dust = null;
    this.pitFx?.dispose(); this.pitFx = null;
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
    // nothing to dig into (a bare tank, the acrylic case): it does not bury, and one born buried comes out
    // (known before the first intent, which may have been waiting for the context: else it could start a burial)
    this.canBurrow = ctx.canBurrow !== false;
    if (this.pending) { const p = this.pending; this.pending = null; this.setIntent(p); }
    // (once it hangs on its fins the sand lets it go: not asked again every frame, which would restart the rise)
    if (!this.canBurrow && s.state.bury > 0.05 && s.state.mode !== 'ESCAPE' && s.state.mode !== 'SWIM' && s.state.mode !== 'HOVER') s.hover(6);
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
      const c = sandColour(smp?.substrate, ctx.floor.colorAt?.(s.state.pos.x, s.state.pos.z, this.bedCol) ?? null, _v);
      model.look.setCover(c.x, c.y, c.z);
      this.dust?.setBed(smp?.substrate);
      // background matching: the darker the bottom, the more the brown set spreads
      const lum = (c.x + c.y + c.z) / 3;
      s.setSurroundings((0.37 - lum) / 0.2, this.night);
    }
    {
      const s0 = s.state, afloat = s0.alt > 0.004 && s0.bury < 0.05 && s0.mode !== 'CRAWL' && s0.mode !== 'BURROW';
      const r = this.rider.step(sdt, ctx.water, ctx.floor, s0.pos.x, s0.pos.y, s0.pos.z, s0.heading, ind.length_mm / 1000, afloat ? (s0.mode === 'ESCAPE' ? 0.3 : 1) : 0, ctx.minDepth ?? 0);
      s0.pos.x += r.vel.x * sdt;
      s0.pos.z += r.vel.z * sdt;
      // (its height is kept over the sand on a spring: the swell's heave goes into that height)
      if (afloat) s0.alt = Math.max(0.002, s0.alt + r.vel.y * sdt);
    }
    const steps = Math.max(1, Math.ceil(sdt * 60 - 1e-6));
    let P = null as ReturnType<SquidApi['update']> | null;
    for (let i = 0; i < steps; i++) P = s.update(sdt / steps);
    if (!P) return;
    const st = s.state;
    ind.pos.copy(st.pos);
    ind.heading = st.heading;
    this.groundY = ctx.floor.heightAt(st.pos.x, st.pos.z);
    AMH_UNIFORMS.uSurfaceY.value = ctx.floor.waterAt(st.pos.x, st.pos.z);
    if (this.rider.tiltX !== 0 || this.rider.tiltZ !== 0) P.quat.setFromEuler(this.rock.set(-(st.pitch + st.pitchKick) + this.rider.tiltX, st.heading, st.roll + this.rider.tiltZ));
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
    const s = this.squid!, dust = this.dust;
    const near = level <= 1 || this.locked;
    if (dust) {
      dust.near = near;
      if (near) dust.tick(dt, ctx);
    }
    const ground = (x: number, z: number) => ctx.floor.heightAt(x, z);
    for (const ev of s.fx as (SandEvent | PitEvent)[]) {
      if (!near) continue;
      if (ev.kind === 'pit') {
        // (laid just over the bed: under a small squid's buried eyes)
        const K = this.root?.scale.x ?? 1;
        if (ev.fill) this.pitFx?.fillImprint(ev.fill);
        else if (ev.deepen) this.pitFx?.growImprint(ev.strength);
        else this.pitFx?.imprint(ev.pos.x, ev.pos.z, ev.heading, ev.halfW, ev.halfL, ground, ev.strength, ev.life ?? 150, Math.min(0.0015, 0.0003 + 0.0004 * K), MimiikaDriver.PIT_LOOK);
        continue;
      }
      if (!dust) continue;
      if (ev.kind === 'ink') dust.ink(ev.pos, ev.vel, ev.count, ev.spread, ev.size, ev.life, ev.alpha, INK);
      // single grains (the poured sand, the shed coat's spray) fall back onto the bed; the rest is the silt a jet
      // throws, with a grain or so in each puff
      else if (ev.kill) dust.grains(ev.pos, ev.vel, ev.count, ev.spread, ev.size, ev.life, ev.alpha);
      else dust.kick(ev.pos, ev.vel, ev.count, ev.spread, ev.size, ev.life, ev.alpha, 1);
    }
    s.fx.length = 0;
    this.pitFx?.update(dt);
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
    // (lifted clear of the sand, but under the arms and belly of a small squid lying on it)
    const gy = this.ctx.floor.heightAt(x, z) + Math.min(0.002, 0.0006 + 0.0012 * K);
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
    this.rider.reset();
    this.busy = false;
  }

  /** sitting or crawling on the sand, hovering over it, or buried out of everyone's way */
  body(): BodyState {
    const s = this.squid, b = this.bodyState;
    if (s) {
      const st = s.state;
      b.mode = st.bury > 0.6 ? 'away' : st.alt > 0.005 ? 'water' : 'bed';
      b.heading = st.heading;
      b.y = this.groundY + st.alt;
    }
    return b;
  }

  nudge(dx: number, dz: number): void {
    const s = this.squid, ind = this.ind;
    if (!s) return;
    s.state.pos.x += dx; s.state.pos.z += dz;
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

/**
 * The bed's colour for the sand coat: the substrate's grey from the table (the brightness the coat and the background
 * matching are tuned to), in the hue of the bed as it is drawn here (Floor.colorAt: 走水's warm sand), when there is one.
 */
export function sandColour(sub: string | undefined, drawn: Readonly<Color> | null, out: Vector3): Vector3 {
  const c = SUBSTRATE_TINT[sub ?? 'sand'] ?? SUBSTRATE_TINT.sand;
  out.set(c[0], c[1], c[2]);
  const l = drawn ? (drawn.r + drawn.g + drawn.b) / 3 : 0;
  return l > 1e-4 ? out.set(drawn!.r, drawn!.g, drawn!.b).multiplyScalar((c[0] + c[1] + c[2]) / 3 / l) : out;
}

/** the sand's colour as a Color (for a viewer's bed) */
export const sandColor = (sub = 'sand') => new Color(...(SUBSTRATE_TINT[sub] ?? SUBSTRATE_TINT.sand));
