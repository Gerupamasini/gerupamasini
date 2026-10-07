import {
  Bone, BufferGeometry, Color, CylinderGeometry, Group, LOD, Matrix4, Mesh, MeshStandardMaterial, Object3D, Skeleton, SkinnedMesh, Sphere,
  SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { BONES, MODEL_TL, NSEG } from './anatomy';
import { rigRest, youjiuoGeometry, type Lod } from './geometry';
import { GREEN_MORPH, MORPHS, lookFor, tickYoujiuoMaterials, youjiuoMaterials, type YoujiuoMaterials } from './materials';
import { applyPose, chainFromBends, restPose } from './pose';
import { Youjiuo, type FishEnv } from './behavior';
import { shadowLayerFor, sunOf, underwaterSun, type ShadowLayer } from '../haku/ContactShadows';

/** camera distances (m, for the 20 cm model; scaled with the fish) where the tiers change */
const LOD1_AT = 1.4;
const LOD2_AT = 5.5;
const IDENTITY = new Matrix4();
const SPHERE = new Sphere(new Vector3(), MODEL_TL * 0.78);

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

interface Model {
  bones: Bone[];
  lod: LOD;
  skeleton: Skeleton;
  mats: YoujiuoMaterials;
}

/** One fish's rig (its own bones, all children of the root) over the three shared-geometry tiers. */
function buildModel(mats: YoujiuoMaterials, tiers: Lod[] = [0, 1, 2]): Model {
  const rest = rigRest();
  const bones = BONES.map((name, i) => {
    const b = new Bone();
    b.name = name;
    b.position.copy(rest.pos[i]);
    return b;
  });
  const skeleton = new Skeleton(bones, rest.inverses);
  const lod = new LOD();
  lod.name = 'YoujiuoLOD';
  for (const t of tiers) {
    const geo = youjiuoGeometry(t);
    const level = new Group();
    level.name = `YoujiuoLOD${t}`;
    const body = new SkinnedMesh(geo.body, t === 2 ? mats.bodyLow : mats.body);
    body.name = `YoujiuoBody${t}`;
    level.add(body);
    if (geo.fins) {
      const fins = new SkinnedMesh(geo.fins, mats.fins);
      fins.name = `YoujiuoFins${t}`;
      fins.renderOrder = 2;
      level.add(fins);
    }
    for (const m of level.children as SkinnedMesh[]) {
      m.bind(skeleton, IDENTITY);
      m.boundingSphere = SPHERE;
      m.castShadow = false;
      m.receiveShadow = false;
    }
    lod.addLevel(level, t === 0 ? 0 : t === 1 ? LOD1_AT : LOD2_AT, 0.12);
  }
  return { bones, lod, skeleton, mats };
}

// ------------------------------------------------------------------ prey

let preyGeo: BufferGeometry | null = null;
let preyMat: MeshStandardMaterial | null = null;
/** a copepod about 1.4 mm long: a translucent amber body, its long first antennae spread */
function preyMesh(): Mesh {
  if (!preyGeo) {
    const body = new SphereGeometry(0.00028, 10, 6).scale(1, 1, 2.4);
    const uro = new SphereGeometry(0.00012, 6, 4).scale(1, 1, 2.6).translate(0, 0, -0.0009);
    const ant = (side: number) => new CylinderGeometry(0.00002, 0.00003, 0.0012, 4).rotateZ(side * 1.25).rotateY(side * 0.2).translate(side * 0.00055, 0.0001, 0.0005);
    preyGeo = mergeGeometries([body, uro, ant(1), ant(-1)].map((g) => g.toNonIndexed()));
    preyMat = new MeshStandardMaterial({ color: new Color(0.62, 0.34, 0.1), roughness: 0.4, transparent: true, opacity: 0.75, emissive: new Color(0.08, 0.04, 0.01) });
  }
  const m = new Mesh(preyGeo, preyMat!);
  m.name = 'YoujiuoPrey';
  m.visible = false;
  return m;
}

/**
 * ヨウジウオ (Syngnathus schlegeli): a pipefish of the eelgrass. The behaviour (behavior.ts) gives the motion and the
 * pose; this driver keeps the rig, the tiers, the fish's own colours, the prey it stalks and its shadow on the bed.
 */
export class YoujiuoDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: Model | null = null;
  private fish: Youjiuo | null = null;
  private prey: Mesh | null = null;
  private shadows: ShadowLayer | null = null;
  private shadowSlot = -1;
  private shadowTick = 0;
  private locked = false;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly sun = new Vector3();
  private readonly player = new Vector3(Number.NaN, 0, 0);
  private cover = 0;
  busy = false;

  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'YoujiuoRoot';
    return { root, parts: {}, length: MODEL_TL };
  }

  /** A hovering ヨウジウオ at the model size for the 図鑑 (seed picks the colour morph). */
  static makePreview(seed = 0): Object3D {
    const morph = Math.floor(seed * MORPHS.length) % MORPHS.length;
    const mats = youjiuoMaterials(lookFor(morph, seed * 7.3 + 0.2, 0.3), 1);
    const m = buildModel(mats, [0]);
    const root = new Group();
    root.name = 'YoujiuoRoot';
    root.add(...m.bones, m.lod);
    const pose = restPose();
    const yb = new Float32Array(NSEG + 1), pb = new Float32Array(NSEG + 1);
    for (let k = 1; k < NSEG; k++) { yb[k] = 0.035 * Math.sin(k * 0.45); pb[k] = -0.004; }
    chainFromBends(pose.pts, 0.12, 0, yb, pb);
    for (let i = 0; i < pose.dorsal.length; i++) pose.dorsal[i] = 0.25 * Math.sin(1.2 - i * 1.1);
    pose.eyeL = [0.3, 0.1]; pose.eyeR = [-0.1, 0.05];
    pose.pecL = 0.7; pose.pecR = 0.35;
    applyPose(m.bones, pose, 0);
    m.lod.autoUpdate = false;
    root.updateMatrixWorld(true);
    return root;
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const tl = individual.length_mm / 1000;
    const scale = tl / MODEL_TL;
    const h = strHash(individual.id);
    if (!this.fish) {
      this.fish = new Youjiuo(tl, new Rng(hashInts(h, 53)));
      this.fish.pos.copy(individual.pos);
      this.fish.heading = individual.heading;
      this.fish.onEvent = (id) => this.emit(id);
    }
    // the colour morph (a quarter of them the green eelgrass form); living among the blades makes the rest greener too
    let morph = h % MORPHS.length;
    if (((h >>> 8) & 3) === 0) morph = GREEN_MORPH;
    const mats = youjiuoMaterials(lookFor(morph, (h % 9973) / 9973, 0.5), scale);
    this.model = buildModel(mats);
    root.add(...this.model.bones, this.model.lod);
    root.scale.setScalar(scale);
    const lv = this.model.lod.levels;
    lv[1].distance = LOD1_AT * scale; lv[2].distance = LOD2_AT * scale;
    this.prey = preyMesh();
    root.add(this.prey);
    const parent = root.parent ?? root;
    this.shadows = shadowLayerFor(parent);
    this.shadowSlot = this.shadows.claim();
    root.visible = false;
  }

  detach(): void {
    if (this.shadows) this.shadows.release(this.shadowSlot);
    this.shadowSlot = -1;
    this.shadows = null;
    if (this.model) {
      this.model.lod.removeFromParent();
      for (const b of this.model.bones) b.removeFromParent();
      this.model.skeleton.dispose();
      this.model.mats.dispose();
    }
    this.prey?.removeFromParent();
    this.prey = null;
    this.model = null;
    this.root = null;
  }

  private env(ctx: DriverContext): FishEnv {
    return { floor: ctx.floor, bounds: ctx.bounds, t: ctx.nowMs / 1000 };
  }
  private lastCtx: DriverContext | null = null;

  setIntent(intent: Intent): void {
    const f = this.fish, ind = this.ind;
    if (!f || !ind) return;
    this.busy = true;
    const ctx = this.lastCtx;
    const env: FishEnv | null = ctx ? this.env(ctx) : null;
    const secs = intent.seconds > 0 ? intent.seconds : 10;
    const playerFrom = () => intent.from ?? (Number.isNaN(this.player.x) ? f.pos.clone().add(new Vector3(0, 0, -1)) : this.player.clone());
    switch (intent.kind) {
      case 'flee':
        if (env) f.escape(env, playerFrom());
        break;
      case 'rest': case 'burrow':
        // rest among the blades if there are any, else hang in mid-water
        if (!env || !f.holdGrass(env, Math.max(secs, 8))) f.hover(secs);
        break;
      case 'wander': case 'moveTo': {
        const t = intent.target ?? f.pos.clone().add(new Vector3(Math.sin(f.heading), 0, Math.cos(f.heading)).multiplyScalar(0.6));
        f.swimTo(t, Math.max(secs, 8));
        break;
      }
      case 'forage':
        f.forage(Math.max(secs, 6));
        break;
      case 'display':
        if (env) f.uneasy(env, playerFrom(), secs);
        break;
      case 'special':
        if (intent.param === 'hold' && env && f.holdGrass(env, 15)) break;
        f.hover(secs);
        break;
      default:
        f.hover(secs);
    }
  }

  update(dt: number, ctx: DriverContext): void {
    const f = this.fish, ind = this.ind, model = this.model, root = this.root;
    if (!f || !ind || !model || !root) return;
    this.lastCtx = ctx;
    tickYoujiuoMaterials(performance.now() / 1000);
    this.player.copy(ctx.player);
    const sdt = Math.min(0.1, dt * ctx.simScale);
    const env = this.env(ctx);
    if (!!ctx.locked !== this.locked) {
      this.locked = !!ctx.locked;
      model.lod.autoUpdate = !this.locked;
      if (this.locked) model.lod.levels.forEach((l, i) => { l.object.visible = i === 0; });
    }
    const level = (this.locked ? 0 : model.lod.getCurrentLevel()) as 0 | 1 | 2;
    f.lod = level;
    // a long frame is taken in steps of at most 1/30 s (the strike and the escape stay the same at any frame rate)
    const steps = Math.max(1, Math.ceil(sdt * 30 - 1e-6));
    for (let i = 0; i < steps; i++) f.update(sdt / steps, env);
    ind.pos.copy(f.pos);
    ind.heading = f.heading;
    root.position.copy(f.pos);
    root.rotation.set(0, f.heading, 0);
    applyPose(model.bones, f.pose, level);
    root.visible = true;
    this.busy = !f.done;
    // the eelgrass around it tints the light it sees; a buzzing dorsal fin blurs
    const m = ctx.floor.meadow;
    const c = m ? m.coverAt(f.pos.x, f.pos.z) : 0;
    this.cover += (c - this.cover) * Math.min(1, dt * 0.5);
    const own = model.mats.own;
    own.uCover.value = this.cover;
    own.uFinBlur.value = Math.min(1, Math.max(0, (f.finHz - 13) / 12)) * Math.min(1, f.finAmp / 0.35);
    // the prey (near tiers only)
    const prey = this.prey;
    if (prey) {
      prey.visible = f.prey.alive && level < 2;
      if (prey.visible) {
        prey.position.copy(f.toModel(this.tmp.copy(f.prey.pos)));
        prey.scale.setScalar(1 / f.scale);
        prey.rotation.y += dt * 0.7;
      }
    }
    if (level < 2 || (this.shadowTick++ & 1) === 0) this.updateShadow(env);
  }

  /** a soft shadow on the bed along the refracted sun (the shadow map is far too coarse for a fish this thin) */
  private updateShadow(env: FishEnv): void {
    const f = this.fish, sh = this.shadows, root = this.root;
    if (!f || !sh || this.shadowSlot < 0 || !root) return;
    const strength = underwaterSun(sunOf(root), this.sun);
    const P = f.pose.pts;
    const a = f.toWorld(this.tmp.copy(P[0])), b = f.toWorld(this.tmp2.copy(P[NSEG]));
    const mx = 0.5 * (a.x + b.x), my = 0.5 * (a.y + b.y), mz = 0.5 * (a.z + b.z);
    const ground = env.floor.heightAt(mx, mz);
    const hgt = Math.max(0, my - ground);
    if (strength <= 0.01 || hgt > 0.8) { sh.hide(this.shadowSlot); return; }
    const L = this.sun, k = hgt / Math.max(L.y, 0.2);
    const x = mx - L.x * k, z = mz - L.z * k;
    const blur = 0.002 + 0.05 * hgt;
    const len = Math.hypot(a.x - b.x, a.z - b.z) + 2 * blur + 0.01 * f.scale;
    const wid = 0.006 * f.scale + 2 * blur;
    const opacity = strength * 0.55 * Math.min(1, (0.006 * f.scale) / wid) * (1 - 0.5 * this.cover);
    sh.set(this.shadowSlot, x, env.floor.heightAt(x, z) + 0.003, z, Math.atan2(a.x - b.x, a.z - b.z), len, wid, opacity, Math.min(0.95, 0.3 + (2 * blur) / Math.max(wid, 1e-4)));
  }

  holdAt(x: number, z: number, heading?: number): void {
    const f = this.fish, ind = this.ind;
    if (!f || !ind) return;
    f.releaseHold();
    f.pos.set(x, Number.NaN, z);
    f.placed = false;
    if (heading !== undefined) f.heading = heading;
    f.speed = 0;
    f.hover(4);
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
    if (!f || Number.isNaN(f.pos.y)) return this.ind ? this.tmp.copy(this.ind.pos) : this.tmp.set(0, 0, 0);
    // the middle of the body (the pivot is mid-trunk; the camera frames the whole fish)
    return f.toWorld(this.tmp.copy(f.pose.pts[Math.floor(NSEG * 0.35)]));
  }

  get openings(): { mouth: number; gill: number } {
    return { mouth: this.fish?.pose.jaw ?? 0, gill: 0 };
  }

  debugLabel(): string {
    const f = this.fish;
    return f ? `${f.state}${f.sub ? ':' + f.sub : ''}` : '';
  }

  /** Change the fish's colours: a morph (materials.MORPHS) and how green its life among the blades has made it. */
  recolor(morph: number, green = 0.5, seed = 0.37): void {
    const own = this.model?.mats.own;
    if (!own) return;
    const l = lookFor(morph, seed, green);
    own.uBase.value.copy(l.base); own.uDark.value.copy(l.dark); own.uPale.value.copy(l.pale); own.uBelly.value.copy(l.belly);
    own.uAccent.value.copy(l.accent);
    own.uPattern.value.set(l.band, l.dots, l.ocelli, l.mottle);
    own.uPattern2.value.set(l.streak, l.pepper, l.sheen, l.translucency);
    own.uPattern3.value.set(l.snout, l.granules, 0, 0);
    own.uSeed.value = l.seed;
  }

  /** the behaviour (the viewer and the tests read it) */
  get behaviour(): Youjiuo | null { return this.fish; }

  dispose(): void {
    this.detach();
    this.fish = null;
    this.listeners.clear();
  }
}
