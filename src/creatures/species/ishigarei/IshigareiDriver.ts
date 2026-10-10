import { Color, Group, Vector3, type Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { createFlounderBehavior } from './behavior.js';
import { applyPose } from './rig.js';
import { jawAxis } from './rig.js';
import { IshigareiLook, SUBSTRATE_TINT, type IshLookSpec } from './materials';
import { buildModel, disposeModel, syncEyes, LOD1_AT, LOD2_AT, MODEL_TL, type IshigareiModel } from './model';
import { shadowLayerFor, sunOf, underwaterSun, type ShadowLayer } from '../haku/ContactShadows';
import { tickAmimehagiMaterials } from '../amimehagi/materials';

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** The individual's own look: a little warmer or cooler, darker or paler, its white spots more or less marked. */
export function lookSpecFor(id: string): IshLookSpec {
  const r = new Rng(hashInts(strHash(id), 0x15a));
  return { tint: [r.range(0.95, 1.06), r.range(0.95, 1.04), r.range(0.93, 1.03)], melanin: r.range(0.85, 1.15), spots: r.range(0.5, 1.3) };
}

const JAW_AXIS = jawAxis();

type FlounderApi = ReturnType<typeof createFlounderBehavior>;

/**
 * イシガレイ (Platichthys bicoloratus) juvenile: a right-eyed flounder of the sandy flats. It lies on its blind side
 * draped over the ripples, buries itself, creeps after small prey, skims the bottom on the waves of its long dorsal
 * and anal fins and escapes in a cloud of sand (behavior.js: BOTTOM_REST, GLIDE_SWIM, BURROW_IN_SAND, FORAGE,
 * ESCAPE). The brain's intents choose what it does; the behaviour carries each one out and settles back on the bottom.
 * It draws itself through three tiers of shared geometry with its own materials, and casts a flat oval shadow.
 */
export class IshigareiDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: IshigareiModel | null = null;
  private fish: FlounderApi | null = null;
  private shadows: ShadowLayer | null = null;
  private shadowSlot = -1;
  private locked = false;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  private readonly sun = new Vector3();
  private readonly player = new Vector3(Number.NaN, 0, 0);
  private readonly playerPrev = new Vector3(Number.NaN, 0, 0);
  private readonly playerVel = new Vector3();
  private ctx: DriverContext | null = null;
  private pending: Intent | null = null;
  private until = 0;
  private clock = 0;
  private substrateT = 0;
  private lastMode = '';
  busy = false;

  /** The view's holder; the rig and meshes are built in attach(). */
  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'Ishigarei';
    return { root, parts: {}, length: MODEL_TL };
  }

  /** A resting juvenile at the model size for the 図鑑 (`seed` picks the individual's look). */
  static makePreview(seed = 0): Object3D {
    const m = buildModel(new IshigareiLook(lookSpecFor(`preview#${Math.floor(seed * 1e6)}`)), [0]);
    m.look.ground.off();
    const b = createFlounderBehavior({ world: { ground: () => 0 }, rng: () => 0.5, scale: 1, start: { x: 0, z: 0, heading: 0 }, autonomous: false });
    const P = b.update(1 / 60);
    P.pos.set(0, 0, 0);
    applyPose(m.root, m.bones, P, JAW_AXIS);
    m.root.position.set(0, 0, 0);
    m.root.quaternion.identity();
    m.lod.autoUpdate = false;
    syncEyes(m);
    m.root.userData.disposer = () => disposeModel(m);
    return m.root;
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const scale = individual.length_mm / 1000 / MODEL_TL;
    this.model = buildModel(new IshigareiLook(lookSpecFor(individual.id)));
    root.add(this.model.root);
    const lv = this.model.lod.levels;
    lv[1].distance = LOD1_AT * scale; lv[2].distance = LOD2_AT * scale;
    if (!this.fish) {
      const rng = new Rng(hashInts(strHash(individual.id), 71));
      this.fish = createFlounderBehavior({
        world: this.worldAdapter(), rng: () => rng.next(), scale,
        start: { x: individual.pos.x, z: individual.pos.z, heading: individual.heading },
        home: { x: individual.home.x, z: individual.home.z }, range: 1.5,
        autonomous: false, bounds: () => this.ctx?.bounds ?? null,
        // a fish that starts the day half the time buried
        startBuried: (strHash(individual.id) & 1) === 0,
      });
    }
    this.shadows = shadowLayerFor(root.parent ?? root);
    this.shadowSlot = this.shadows.claim();
    root.visible = false;
  }

  detach(): void {
    if (this.shadows) this.shadows.release(this.shadowSlot);
    this.shadowSlot = -1;
    this.shadows = null;
    if (this.model) disposeModel(this.model);
    this.model = null;
    this.root = null;
  }

  /** what the behaviour needs from the world */
  private worldAdapter() {
    const floor = () => this.ctx?.floor;
    const e = 0.01;
    return {
      ground: (x: number, z: number) => floor()?.heightAt(x, z) ?? 0,
      normal: (x: number, z: number, s: number, out: Vector3) => {
        const f = floor();
        if (!f) return out.set(0, 1, 0);
        const d = Math.max(e, s * 0.5);
        const hx = f.heightAt(x + d, z) - f.heightAt(x - d, z), hz = f.heightAt(x, z + d) - f.heightAt(x, z - d);
        return out.set(-hx, 2 * d, -hz).normalize();
      },
      waterY: (x: number, z: number) => floor()?.waterAt(x, z) ?? 1e3,
      // the observer it has noticed (the brain's alert): its eyes follow it, and close and fast it bolts
      threat: () => (!Number.isNaN(this.player.x) && (this.ind?.alert ?? 0) > 0.15 ? { pos: this.player, vel: this.playerVel } : null),
      others: () => [],
    };
  }

  setIntent(intent: Intent): void {
    const f = this.fish, ind = this.ind;
    if (!f || !ind || !this.ctx) { this.pending = intent; this.busy = true; return; }
    const secs = intent.seconds > 0 ? intent.seconds : 8;
    this.until = this.clock + secs;
    this.busy = true;
    switch (intent.kind) {
      case 'flee':
        f.escape(intent.from ?? (Number.isNaN(this.player.x) ? null : this.player));
        break;
      case 'rest':
        f.rest(secs);
        break;
      case 'burrow':
        if (this.canBurrow) f.burrow(Math.max(secs, 10)); else f.rest(secs);
        break;
      case 'wander': case 'moveTo': {
        const t = intent.target;
        f.glide(t ? { x: t.x, z: t.z } : null);
        break;
      }
      case 'forage':
        f.forage();
        break;
      case 'display':
        // a flatfish does not display: it presses itself flat and keeps still, eyes on the threat
        f.freeze(Math.max(secs, 3));
        break;
      case 'special':
        if ((intent.param === 'hide' || intent.param === 'sleep') && this.canBurrow) f.burrow(Math.max(secs, 30));
        else f.rest(secs);
        break;
      default:
        f.rest(6);
    }
    this.emit(intent.kind);
  }

  /** whether the floor here is sand to bury in (the flat: yes; a bare tank or the case: no) */
  private canBurrow = true;

  update(dt: number, ctx: DriverContext): void {
    const f = this.fish, ind = this.ind, model = this.model, root = this.root;
    if (!f || !ind || !model || !root) return;
    this.ctx = ctx;
    tickAmimehagiMaterials(performance.now() / 1000);
    const sdt = Math.min(0.1, dt * ctx.simScale);
    this.clock += sdt;
    // the observer: where it is and how fast it comes
    if (!Number.isNaN(this.playerPrev.x) && sdt > 0) this.playerVel.subVectors(ctx.player, this.playerPrev).divideScalar(Math.max(sdt, 1e-3)).multiplyScalar(0.3).addScaledVector(this.playerVel, 0.7);
    this.playerPrev.copy(ctx.player);
    this.player.copy(ctx.player);
    if (this.pending) { const p = this.pending; this.pending = null; this.setIntent(p); }
    // nothing to dig into (a bare tank, the acrylic case): no burrowing, and one lying buried (born so) rises
    this.canBurrow = ctx.canBurrow !== false;
    if (!this.canBurrow) { const s = f.state; if (s.mode === 'BURROW_IN_SAND' || s.bury > 0.02) f.glide(null); }
    if (!!ctx.locked !== this.locked) {
      this.locked = !!ctx.locked;
      model.lod.autoUpdate = !this.locked;
      if (this.locked) model.lod.levels.forEach((l, i) => { l.object.visible = i === 0; });
    }
    const steps = Math.max(1, Math.ceil(sdt * 60 - 1e-6));
    let P = null as ReturnType<FlounderApi['update']> | null;
    for (let i = 0; i < steps; i++) P = f.update(sdt / steps);
    if (!P) return;
    const st = f.state;
    ind.pos.copy(st.pos);
    ind.heading = st.heading;
    applyPose(root, model.bones, P, JAW_AXIS);
    root.scale.setScalar(ind.length_mm / 1000 / MODEL_TL);
    root.updateMatrixWorld(true);
    syncEyes(model);
    root.visible = true;
    // materials: burial, mouth, gills; the substrate it lies on (sand over it, the hue it matches)
    const u = model.look.uniforms;
    u.uBury.value = P.bury;
    u.uMouthOpen.value = P.jaw;
    u.uBreath.value = P.breath;
    this.substrateT -= sdt;
    if (this.substrateT <= 0) {
      this.substrateT = 0.7;
      const s = ctx.floor.sampleAt?.(st.pos.x, st.pos.z);
      const c = SUBSTRATE_TINT[s?.substrate ?? 'sand'] ?? SUBSTRATE_TINT.sand;
      model.look.setSubstrate(new Color(c[0], c[1], c[2]));
      // background matching: the melanophores follow the brightness of the ground, slowly
      const lum = (c[0] + c[1] + c[2]) / 3;
      this.melGoal = model.look.melaninBase * (1.1 - 1.6 * (lum - 0.19));
    }
    u.uMelanin.value += (this.melGoal - u.uMelanin.value) * (1 - Math.exp(-sdt * 0.1));
    const level = this.locked ? 0 : model.lod.getCurrentLevel();
    // the sediment under the fish (the near tiers lay the blind side and the fins onto it)
    const ground = model.look.ground;
    ground.uniforms.uGroundSink.value = P.sink + P.bury * 0.0012 * root.scale.x;
    if (level <= 1) ground.update(st.pos.x, st.pos.z, 0.15 * root.scale.x, (x, z) => ctx.floor.heightAt(x, z));
    this.updateShadow(P);
    if (st.mode !== this.lastMode) { this.lastMode = st.mode; this.emit(st.mode.toLowerCase()); }
    this.busy = this.clock < this.until || !f.settled;
  }
  private melGoal = 1;

  /** a flat oval under the fish: a narrow rim beside it on the bottom, the whole fish's shape when it swims */
  private updateShadow(P: { lift: number; bury: number }): void {
    const f = this.fish, sh = this.shadows, root = this.root;
    if (!f || !sh || this.shadowSlot < 0 || !root || !this.ctx) return;
    const strength = underwaterSun(sunOf(root), this.sun) * (1 - P.bury);
    if (strength <= 0.01) { sh.hide(this.shadowSlot); return; }
    const st = f.state, L = this.sun, K = root.scale.x;
    const h = P.lift + 0.0019 * K;
    const k = h / Math.max(L.y, 0.2);
    // the oval's centre: the middle of the body disc (a little behind the origin)
    const cx = st.pos.x - Math.sin(st.heading) * 0.012 * K, cz = st.pos.z - Math.cos(st.heading) * 0.012 * K;
    const x = cx - L.x * k, z = cz - L.z * k;
    const gy = this.ctx.floor.heightAt(x, z) + 0.002;
    const blur = 0.0015 + 0.05 * P.lift;
    const len = MODEL_TL * K * 0.86 + 2 * blur, wid = MODEL_TL * K * 0.5 + 2 * blur;
    const opacity = strength * (0.35 + 0.3 * Math.min(1, P.lift / 0.01));
    sh.set(this.shadowSlot, x, gy, z, st.heading, len, wid, opacity, Math.min(0.95, 0.3 + (2 * blur) / wid));
  }

  holdAt(x: number, z: number, heading?: number): void {
    const f = this.fish, ind = this.ind;
    if (!f || !ind) return;
    f.state.pos.x = x; f.state.pos.z = z;
    f.state.speed = 0;
    if (heading !== undefined) f.state.heading = heading;
    f.rest(4);
    ind.pos.x = x; ind.pos.z = z;
    this.busy = false;
  }

  onEvent(cb: (e: BehaviorEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(behaviorId: string): void {
    if (!this.ind) return;
    const id = behaviorId === 'burrow_in_sand' ? 'burrow' : behaviorId === 'glide_swim' ? 'glide' : behaviorId === 'bottom_rest' ? 'rest' : behaviorId;
    const e: BehaviorEvent = { individualId: this.ind.id, behaviorId: id, t: performance.now() };
    for (const l of this.listeners) l(e);
  }

  anchor(): Vector3 {
    const f = this.fish;
    if (!f) return this.ind ? this.tmp.copy(this.ind.pos) : this.tmp.set(0, 0, 0);
    return this.tmp.copy(f.state.pos);
  }

  get openings(): { mouth: number; gill: number } {
    return { mouth: this.fish?.pose.jaw ?? 0, gill: Math.max(0, this.fish?.pose.breath ?? 0) };
  }

  debugLabel(): string {
    const s = this.fish?.state;
    return s ? `${s.mode}/${s.phase}${s.bury > 0.5 ? ' (砂)' : ''}` : '';
  }

  /** the fish's behaviour (the viewer and tests drive it directly) */
  get behaviour(): FlounderApi | null { return this.fish; }

  dispose(): void {
    this.detach();
    this.fish = null;
    this.listeners.clear();
  }
}
