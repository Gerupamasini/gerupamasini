import { Bone, Group, LOD, Matrix4, Object3D, Skeleton, SkinnedMesh, Sphere, Vector3 } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { BONES, MODEL_TL, SPINE } from './anatomy';
import { hakuGeometry, rigRest, type Lod } from './geometry';
import { hakuMaterials, tickHakuMaterials, VARIANT_COUNT } from './materials';
import { applyPose, restPose, type RigBones } from './swim';
import { HakuFish, releaseSchool, schoolFor, type FishEnv, type School } from './School';
import { shadowLayerFor, sunOf, underwaterSun, type ShadowLayer } from './ContactShadows';

/** camera distances (m, for a 30 mm fish; scaled with size) where the tiers change */
const LOD1_AT = 0.9;
const LOD2_AT = 4.5;
const IDENTITY = new Matrix4();
const SPHERE = new Sphere(new Vector3(), MODEL_TL * 0.7);

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

interface Model {
  bones: Bone[];
  rig: RigBones;
  lod: LOD;
  skeleton: Skeleton;
}

/** One fish's rig and three tiers (shared geometry and materials, its own skeleton). */
function buildModel(variant: number, tiers: Lod[] = [0, 1, 2]): Model {
  const rest = rigRest();
  const bones = BONES.map((name, i) => {
    const b = new Bone();
    b.name = name;
    const pi = rest.parent[i];
    b.position.copy(rest.world[i]);
    if (pi >= 0) b.position.sub(rest.world[pi]);
    return b;
  });
  BONES.forEach((_, i) => { const pi = rest.parent[i]; if (pi >= 0) bones[pi].add(bones[i]); });
  const skeleton = new Skeleton(bones, rest.inverses);
  const mats = hakuMaterials();
  const lod = new LOD();
  lod.name = 'HakuLOD';
  for (const t of tiers) {
    const geo = hakuGeometry(t);
    const level = new Group();
    level.name = `HakuLOD${t}`;
    const body = new SkinnedMesh(geo.body, t === 2 ? mats.bodyLow[variant] : mats.body[variant]);
    body.name = `HakuBody${t}`;
    level.add(body);
    if (geo.fins) {
      const fins = new SkinnedMesh(geo.fins, mats.fins);
      fins.name = `HakuFins${t}`;
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
  const by = (n: string) => bones[BONES.indexOf(n as (typeof BONES)[number])];
  const rig: RigBones = { head: by('J_head'), spine: SPINE.map(([n]) => by(n)), pecL: by('J_pec_L'), pecR: by('J_pec_R'), d1: by('J_d1'), jaw: by('J_jaw'), operL: by('J_oper_L'), operR: by('J_oper_R') };
  return { bones, rig, lod, skeleton };
}

/**
 * ハク (juvenile Mugil cephalus): a school fish. Each individual swims as a member of its spawn group's school
 * (School.ts) and draws itself through three shared-geometry tiers (THREE.LOD picks the tier per camera).
 */
export class HakuDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private model: Model | null = null;
  private fish: HakuFish | null = null;
  private school: School | null = null;
  private shadows: ShadowLayer | null = null;
  private shadowSlot = -1;
  private locked = false;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  private readonly sun = new Vector3();
  /** where the player was at the last update (the alarm's "away") */
  private readonly player = new Vector3(Number.NaN, 0, 0);
  private shadowTick = 0;
  busy = false;

  /** The view's holder; the rig and meshes are built in attach(). */
  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'Haku';
    return { root, parts: {}, length: MODEL_TL };
  }

  /** A swimming ハク at the model size for the 図鑑. */
  static makePreview(): Object3D {
    const m = buildModel(0, [0]);
    const root = new Group();
    root.name = 'HakuPreview';
    root.add(m.bones[0], m.lod);
    const pose = restPose();
    pose.amp = 0.07; pose.phase = 1.1; pose.pecL = pose.pecR = 0.45; pose.curv = 0.25;
    applyPose(m.rig, pose, 0);
    // a model-sized fish needs the camera close: the preview frames it from its bounds
    m.lod.autoUpdate = false;
    root.updateMatrixWorld(true);
    return root;
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const tl = individual.length_mm / 1000;
    const scale = tl / MODEL_TL;
    const variant = strHash(individual.id) % VARIANT_COUNT;
    this.model = buildModel(variant);
    root.add(this.model.bones[0], this.model.lod);
    root.scale.setScalar(scale);
    // the tiers switch at distances that grow with the fish
    const lv = this.model.lod.levels;
    lv[1].distance = LOD1_AT * scale; lv[2].distance = LOD2_AT * scale;
    const parent = root.parent ?? root;
    // the school: every member of one spawn group in one scene
    const key = `${parent.uuid}|${individual.species.id}|${individual.cell}|${individual.ruleIndex}`;
    this.school = schoolFor(key, strHash(key));
    if (!this.fish) {
      this.fish = new HakuFish(tl, new Rng(hashInts(strHash(individual.id), 31)));
      this.fish.pos.copy(individual.pos);
      this.fish.heading = individual.heading;
      this.fish.onEvent = (id) => this.emit(id);
    }
    const f = this.fish;
    f.time = Math.max(f.time, this.school.time);
    this.school.add(f);
    this.gather(f, this.school);
    this.shadows = shadowLayerFor(parent);
    this.shadowSlot = this.shadows.claim();
    // shown from the first update on, once it knows where the water is
    root.visible = false;
    this.place();
  }

  /** a fish that never swam with its school (or got left far behind) joins it where the school is */
  private gather(f: HakuFish, school: School): void {
    const c = this.tmp;
    const has = school.placedCenter(c);
    const far = has && Math.hypot(f.pos.x - c.x, f.pos.z - c.z) > Math.max(0.6, 3 * school.radius);
    if (has && (!f.placed || far)) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.max(school.radius, 2 * f.tl) * 0.8;
      f.pos.set(c.x + Math.sin(a) * r, f.pos.y, c.z + Math.cos(a) * r);
      let hx = 0, hz = 0;
      for (const m of school.members) if (m.placed && m !== f) { hx += Math.sin(m.heading); hz += Math.cos(m.heading); }
      f.heading = (hx || hz ? Math.atan2(hx, hz) : school.travel) + (Math.random() - 0.5) * 0.5;
      f.speed = 0;
    }
    if (!f.placed) {
      f.placed = true;
      // start at the depth the school swims in
      f.pos.y = Number.NaN;
    }
  }

  detach(): void {
    if (this.shadows) this.shadows.release(this.shadowSlot);
    this.shadowSlot = -1;
    this.shadows = null;
    if (this.model) {
      this.model.lod.removeFromParent();
      this.model.bones[0].removeFromParent();
      this.model.skeleton.dispose();
    }
    if (this.school && this.fish) { this.school.remove(this.fish); releaseSchool(this.school); }
    this.school = null;
    this.model = null;
    this.root = null;
  }

  setIntent(intent: Intent): void {
    const school = this.school, f = this.fish, ind = this.ind;
    this.busy = true;
    if (!school || !f || !ind) return;
    switch (intent.kind) {
      case 'flee': {
        const t = intent.target;
        const from = intent.from ?? (t ? new Vector3(2 * f.pos.x - t.x, f.pos.y, 2 * f.pos.z - t.z) : f.pos.clone().add(new Vector3(0, 0, -1)));
        school.startle(from, f.pos, t);
        break;
      }
      case 'rest': case 'burrow':
        school.request('IDLE', intent.seconds, null);
        break;
      case 'wander':
        school.request('SCHOOL_SWIM', intent.seconds > 0 ? Math.max(intent.seconds, 8) : 10, intent.target ?? null);
        break;
      case 'moveTo':
        // back to deeper water (the brain, or the creature system when the ebb leaves the school short of water)
        school.request('SCHOOL_SWIM', 8, intent.target ?? null, intent.urgency >= 0.85);
        break;
      case 'forage':
        school.request('FORAGE', intent.seconds, null);
        break;
      case 'display': {
        // an uneasy school tightens and moves off, away from the player, without bolting
        if (school.state === 'SCHOOL_SWIM' && school.alert >= 0.6 && school.time - school.stateStart < 3) break;
        const src = intent.from ?? (Number.isNaN(this.player.x) ? null : this.player);
        const away = src ? this.tmp.set(f.pos.x - src.x, 0, f.pos.z - src.z) : this.tmp.set(Math.sin(school.travel), 0, Math.cos(school.travel));
        const goal = f.pos.clone().addScaledVector(away.lengthSq() > 1e-8 ? away.normalize() : away.set(0, 0, 1), 1.2);
        if (school.request('SCHOOL_SWIM', intent.seconds, goal, true)) school.alert = Math.max(school.alert, 0.6);
        break;
      }
      case 'special':
        if (intent.param === 'surface' || intent.param === 'yawn') school.request('SURFACE_SWIM', 8 + ind.rng.next() * 8, null);
        else school.request('IDLE', 6, null);
        break;
      default:
        school.request('IDLE', 6, null);
    }
  }

  update(dt: number, ctx: DriverContext): void {
    const f = this.fish, school = this.school, ind = this.ind, model = this.model;
    if (!f || !school || !ind || !model || !this.root) return;
    tickHakuMaterials(performance.now() / 1000);
    this.player.copy(ctx.player);
    const sdt = Math.min(0.1, dt * ctx.simScale);
    const env: FishEnv = { floor: ctx.floor, bounds: ctx.bounds, minDepth: Math.max(0.012, ctx.minDepth ?? 0.012) };
    if (Number.isNaN(f.pos.y)) {
      const L = f.layer(env, f.pos.x, f.pos.z);
      f.pos.y = L.surface - Math.min(0.07, Math.max(0.012, 0.3 * (L.surface - L.bottom)));
      f.pos.y = Math.min(L.hi, Math.max(L.lo, f.pos.y));
    }
    // the observed fish keeps full detail at any distance
    if (!!ctx.locked !== this.locked) {
      this.locked = !!ctx.locked;
      model.lod.autoUpdate = !this.locked;
      if (this.locked) model.lod.levels.forEach((l, i) => { l.object.visible = i === 0; });
    }
    // a long frame (a slow machine, the far tier's every-other-frame update) is taken in steps of at most 1/40 s,
    // so the school's spacing and the C-start stay the same at any frame rate
    const steps = Math.max(1, Math.ceil(sdt * 40 - 1e-6));
    for (let i = 0; i < steps; i++) f.update(sdt / steps, school, env);
    ind.pos.copy(f.pos);
    ind.heading = f.heading;
    this.place();
    this.root.visible = true;
    const level = this.locked ? 0 : model.lod.getCurrentLevel();
    applyPose(model.rig, f.pose, level as 0 | 1 | 2);
    this.busy = school.state === 'ESCAPE' || !school.expired;
    // the shadow on the bed (the far tier's at half rate)
    if (level < 2 || (this.shadowTick++ & 1) === 0) this.updateShadow(env);
  }

  private place(): void {
    const f = this.fish, root = this.root;
    if (!f || !root || Number.isNaN(f.pos.y)) return;
    root.position.copy(f.pos);
    root.rotation.set(f.pitch, f.heading, f.roll, 'YXZ');
  }

  private updateShadow(env: FishEnv): void {
    const f = this.fish, sh = this.shadows, root = this.root;
    if (!f || !sh || this.shadowSlot < 0 || !root) return;
    const strength = underwaterSun(sunOf(root), this.sun);
    const ground = env.floor.heightAt(f.pos.x, f.pos.z);
    const h = Math.max(0, f.pos.y - ground);
    if (strength <= 0.01 || h > 0.6) { sh.hide(this.shadowSlot); return; }
    const L = this.sun;
    const k = h / Math.max(L.y, 0.2);
    const x = f.pos.x - L.x * k, z = f.pos.z - L.z * k;
    const gy = env.floor.heightAt(x, z) + 0.003;
    const tl = f.tl;
    // penumbra: the sun's disc (0.5°) and the ripples' defocus, a little silt scatter on top
    const blur = 0.002 + 0.05 * h;
    const cosP = Math.abs(Math.cos(f.pitch));
    const len = tl * (0.95 * cosP + 0.2) + 2 * blur, wid = tl * (0.2 + 0.1 * Math.abs(Math.sin(f.roll))) + 2 * blur;
    const opacity = strength * 0.7 * (tl * tl) / ((tl + 1.6 * blur) * (tl + 1.6 * blur));
    sh.set(this.shadowSlot, x, gy, z, f.heading, len, wid, opacity, Math.min(0.95, 0.25 + (2 * blur) / Math.max(wid, 1e-4)));
  }

  holdAt(x: number, z: number, heading?: number): void {
    const f = this.fish, ind = this.ind;
    if (!f || !ind) return;
    f.pos.x = x; f.pos.z = z; f.pos.y = Number.NaN;
    if (heading !== undefined) f.heading = heading;
    f.speed = 0; f.vy = 0; f.reactAt = -1; f.escT = -1;
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
    return this.tmp.copy(f.pos);
  }

  dispose(): void {
    this.detach();
    this.fish = null;
    this.listeners.clear();
  }
}
