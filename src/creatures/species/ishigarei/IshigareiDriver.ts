import { Color, Group, Vector3, type Mesh, type Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, BodyState, Driver, DriverContext, Intent } from '../../drivers/Driver';
import { WaterRider } from '../../physics/water';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { createFlounderBehavior } from './behavior.js';
import { applyPose } from './rig.js';
import { jawAxis } from './rig.js';
import { IshigareiLook, wetSubstrateTint, type IshLookSpec } from './materials';
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
  /** off the bottom the swell carries it to and fro; lying on the sand it holds its place */
  private readonly rider = new WaterRider();
  private readonly bodyState: BodyState = { mode: 'bed', heading: 0, y: 0 };
  private groundY = 0;
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

  /** The species' materials in every tier (the skin, the far skin, the fins, the eyes) on a model that is never drawn: DriverEntry.keep. */
  static keep(parent: Object3D): { dispose(): void } {
    const m = buildModel(new IshigareiLook(lookSpecFor('keep')));
    m.look.ground.off();
    parent.add(m.root);
    return { dispose: () => { m.root.removeFromParent(); disposeModel(m); } };
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const scale = individual.length_mm / 1000 / MODEL_TL;
    this.model = buildModel(new IshigareiLook(lookSpecFor(individual.id)));
    root.add(this.model.root);
    root.scale.setScalar(scale);   // (once: the length does not change in the field)
    const lv = this.model.lod.levels;
    lv[1].distance = LOD1_AT * scale; lv[2].distance = LOD2_AT * scale;
    if (!this.fish) {
      const rng = new Rng(hashInts(strHash(individual.id), 71));
      this.fish = createFlounderBehavior({
        world: this.worldAdapter(), rng: () => rng.next(), scale,
        start: { x: individual.pos.x, z: individual.pos.z, heading: individual.heading },
        home: { x: individual.home.x, z: individual.home.z }, range: 1.5,
        autonomous: false, bounds: () => this.ctx?.bounds ?? null,
        // a fish that starts the day half the time buried; one just set into a tank or the case is seen first
        startBuried: root.userData.startOnSurface !== true && (strHash(individual.id) & 1) === 0,
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
        f.escape(intent.from ?? (Number.isNaN(this.player.x) ? null : this.player), intent.target ?? null);
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
        // (in a sand tank or the case, the odd 'special' is the time to bury: its signature behaviour)
        if ((intent.param === 'hide' || intent.param === 'sleep' || !!this.ctx?.bounds) && this.canBurrow) f.burrow(Math.max(secs, 30));
        else f.rest(secs);
        break;
      default:
        f.rest(6);
    }
    this.emit(intent.kind);
  }

  /** whether the floor here is sand to bury in (the flat: yes; a bare tank or the case: no) */
  private canBurrow = true;

  /** the net takes it only while its body shows: one buried to the eyes is not scooped by a hoop over the sand */
  canNetCapture(): boolean {
    return !this.fish || this.fish.state.bury < 0.5;
  }

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
    if (!this.canBurrow) { const s = f.state; if (s.mode !== 'GLIDE_SWIM' && s.mode !== 'ESCAPE' && (s.mode === 'BURROW_IN_SAND' || s.bury > 0.02)) f.glide(null); }
    if (!!ctx.locked !== this.locked) {
      this.locked = !!ctx.locked;
      model.lod.autoUpdate = !this.locked;
      if (this.locked) model.lod.levels.forEach((l, i) => { l.object.visible = i === 0; });
    }
    {
      const s0 = f.state, swimming = s0.lift > 0.004 && s0.bury < 0.1;
      const r = this.rider.step(sdt, ctx.water, ctx.floor, s0.pos.x, s0.pos.y, s0.pos.z, s0.heading, ind.length_mm / 1000, swimming ? (s0.mode === 'ESCAPE' ? 0.3 : 1) : 0, ctx.minDepth ?? 0);
      s0.pos.x += r.vel.x * sdt;
      s0.pos.z += r.vel.z * sdt;
    }
    const steps = Math.max(1, Math.ceil(sdt * 60 - 1e-6));
    let P = null as ReturnType<FlounderApi['update']> | null;
    for (let i = 0; i < steps; i++) P = f.update(sdt / steps);
    if (!P) return;
    const st = f.state;
    ind.pos.copy(st.pos);
    ind.heading = st.heading;
    this.groundY = ctx.floor.heightAt(st.pos.x, st.pos.z);
    applyPose(root, model.bones, P, JAW_AXIS);   // (ends by updating the world matrices: syncEyes reads them)
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
      // the colour of the ground here as it is drawn (the flat's terrain, the tank's bed); without it, the table's
      // colour of the substrate under water. A bare floor (null) leaves the last sediment's colour
      const c = ctx.floor.colorAt
        ? ctx.floor.colorAt(st.pos.x, st.pos.z, this.groundCol)
        : wetSubstrateTint(ctx.floor.sampleAt?.(st.pos.x, st.pos.z)?.substrate ?? 'sand', this.groundCol);
      model.look.setBed(ctx.floor.bed, st.pos.x, st.pos.z);
      if (c) {
        model.look.setSubstrate(c);
        // background matching: the melanophores follow the brightness of the ground, slowly
        const lum = (c.r + c.g + c.b) / 3;
        this.melGoal = model.look.melaninBase * Math.min(1.4, Math.max(0.55, 1.1 - 2.2 * (lum - 0.13)));
      }
    }
    u.uMelanin.value += (this.melGoal - u.uMelanin.value) * (1 - Math.exp(-sdt * 0.1));
    const level = this.locked ? 0 : model.lod.getCurrentLevel();
    // the sediment under the fish (the near tiers lay the blind side and the fins onto it)
    const ground = model.look.ground;
    ground.uniforms.uGroundSink.value = P.sink + P.bury * 0.0012 * root.scale.x;
    // buried, it lies in the sediment: a low mound with the eyes standing out, not a slab on top of it
    const fl = Math.min(1, Math.max(0, (P.bury - 0.25) / 0.55));
    ground.uniforms.uGroundFlat.value = fl * fl * (3 - 2 * fl);
    if (level <= 1) {
      // the patch is in world space (the shader clamps world positions); the floor is in the parent's frame, which
      // the raised home tank and the case only translate
      const o = root.parent ? root.parent.getWorldPosition(this.origin) : this.origin.set(0, 0, 0);
      const moved = !o.equals(this.originPrev);
      this.originPrev.copy(o);
      ground.update(st.pos.x + o.x, st.pos.z + o.z, 0.15 * root.scale.x, (x, z) => ctx.floor.heightAt(x - o.x, z - o.z) + o.y, moved);
    }
    this.updateShadow(P);
    this.setFinsBuried(P.bury > 0.6);
    if (st.mode !== this.lastMode) { this.lastMode = st.mode; this.emit(st.mode.toLowerCase()); }
    this.busy = this.clock < this.until || !f.settled;
  }
  private melGoal = 1;
  private finsBuried = false;

  /** buried, the fins are sand like the bed round them: drawn opaque with it (the transparent pass would show them as
   *  a veil, and the faded ray tips as a dotted rim); in the open, the translucent membrane again. The meshes' own
   *  materials, as the home tank lights its own copies of them. */
  private setFinsBuried(on: boolean): void {
    if (on === this.finsBuried || !this.model) return;
    this.finsBuried = on;
    this.model.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || mesh.renderOrder !== 2) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        m.transparent = !on; m.depthWrite = on; m.alphaTest = on ? 0.5 : 0;
        m.needsUpdate = true;
      }
    });
  }
  private readonly groundCol = new Color();
  private readonly origin = new Vector3();
  private readonly originPrev = new Vector3(Number.NaN, 0, 0);

  /** a flat oval under the fish: a narrow rim beside it on the bottom, the whole fish's shape when it swims */
  private updateShadow(P: { lift: number; bury: number }): void {
    const f = this.fish, sh = this.shadows, root = this.root;
    if (!f || !sh || this.shadowSlot < 0 || !root || !this.ctx) return;
    // (under the sand it casts none: what shows of it would be a dark rim through the gaps between the ray tips)
    const strength = underwaterSun(sunOf(root), this.sun) * (1 - Math.min(1, P.bury / 0.45));
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
    this.rider.reset();
    this.busy = false;
  }

  /** lying on the sand, gliding over it, or under it out of everyone's way */
  body(): BodyState {
    const f = this.fish, b = this.bodyState;
    if (f) {
      const st = f.state;
      b.mode = st.bury > 0.75 ? 'away' : st.lift > 0.01 ? 'water' : 'bed';
      b.heading = st.heading;
      b.y = this.groundY + st.lift;
    }
    return b;
  }

  nudge(dx: number, dz: number): void {
    const f = this.fish, ind = this.ind;
    if (!f) return;
    f.state.pos.x += dx; f.state.pos.z += dz;
    if (ind) { ind.pos.x += dx; ind.pos.z += dz; }
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
