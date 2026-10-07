import { Group, Object3D, PerspectiveCamera, Ray, Scene, Sphere, Vector3, type Camera } from 'three';
import type { GameData } from '../data/loader';
import { isAquatic, type SpeciesDef, type TidePhase } from '../data/schemas';
import type { Habitat } from '../world/Habitat';
import type { Terrain } from '../world/Terrain';
import type { TimeOfDay } from '../world/Sun';
import type { Season } from '../core/Time';
import type { QualityPreset } from '../core/Settings';
import { EventBus } from '../core/EventBus';
import { BehaviorTree, type PerceptionContext } from './brain/BehaviorTree';
import { Spawner, type SpawnEnv } from './Spawner';
export type { SpawnEnv };
import { minDepthFor, type Individual } from './Individual';
import type { BehaviorEvent, Driver, Floor, Intent } from './drivers/Driver';
import { DRIVERS } from './drivers/index';
import { instantiateModel, preloadModel, type LoadedModel, type Tier } from './models/ModelLoader';
import { modelFor, variantOf } from './models/choice';
import type { HeroInstance } from './species/mahaze/hero/applyHero';

interface View {
  tier: Tier | 'placeholder';
  root: Object3D;
  model: LoadedModel | null;
  radius: number;
  hero: HeroInstance | null;
}

interface Entry {
  ind: Individual;
  driver: Driver;
  view: View | null;
  pendingTier: string | null;
  unsub: () => void;
  /** the last spot where an aquatic animal had enough water under it */
  lastWet?: Vector3;
}

export interface CreatureFrame {
  dt: number;
  gameMs: number;
  playerPos: Vector3;
  /** the player's ground speed (m/s), stance and gait: a still or crouched figure barely registers, a running one is a predator */
  playerSpeed: number;
  playerCrouched: boolean;
  playerRunning: boolean;
  camera: PerspectiveCamera;
  simScale: number;
  tod: TimeOfDay;
  season: Season;
  tidePhase: TidePhase;
  lockedId: string | null;
}

const LOD1_DIST = 6;
const LOD2_DIST = 40;
const BIRD_DIST = 120;
/** an animal in the water is lost in it within this (m) seen from the shore, however large: no need to draw it further */
const AQUATIC_DIST = 14;
/** below this length (mm) an animal's shadow is a few pixels on the bed: its parts are not drawn again for the shadows */
const SHADOWLESS_MM = 80;

/** Owns every live individual on the flat: spawning, brains, drivers, model tiers and targeting. */
export class CreatureSystem {
  readonly events = new EventBus<{ behavior: BehaviorEvent; spawn: Individual; despawn: Individual }>();
  readonly entries = new Map<string, Entry>();
  readonly group = new Group();
  private readonly trees = new Map<string, BehaviorTree>();
  private readonly spawner: Spawner;
  private readonly floor: Floor;
  private spawnAcc = 0;
  private lodAcc = 0;
  private frameIndex = 0;
  private readonly tmp = new Vector3();
  private readonly ray = new Ray();
  private readonly sphere = new Sphere();
  private readonly tmpIntent = { id: 0 };
  /** when set, hero-tier models get the volumetric materials (observation lock) */
  heroApply: ((model: LoadedModel) => Promise<HeroInstance>) | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly data: GameData,
    private readonly habitat: Habitat,
    private readonly terrain: Terrain,
    private readonly preset: QualityPreset,
    private readonly mapId: string,
    readonly removed: Set<string>,
    /** animals never appear closer to the player than this (m); a small, busy shore lets them come nearer */
    private readonly minSpawnDist?: number,
  ) {
    this.group.name = 'creatures';
    scene.add(this.group);
    for (const sp of data.species.values()) this.trees.set(sp.id, new BehaviorTree(data.behaviors.get(sp.brain.tree)!, sp));
    this.spawner = new Spawner(habitat, data.species.values(), removed);
    this.floor = {
      heightAt: (x, z) => terrain.heightAt(x, z),
      waterAt: (x, z) => habitat.waterAt(x, z),
    };
  }

  /** Warm the model cache for the distance tiers. */
  async preload(): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const sp of this.data.species.values()) {
      // only what lives on this flat (the others load when they are first needed, in the tank or the book)
      if (!sp.spawn.some((r) => !r.maps || r.maps.includes(this.mapId))) continue;
      if (sp.model.lod2) jobs.push(preloadModel(sp.model.lod2));
      for (const st of sp.stages) if (st.model?.lod2) jobs.push(preloadModel(st.model.lod2));
    }
    await Promise.all(jobs);
  }

  get individuals(): Individual[] {
    return [...this.entries.values()].map((e) => e.ind);
  }

  get(id: string): Individual | undefined {
    return this.entries.get(id)?.ind;
  }

  driverOf(id: string): Driver | undefined {
    return this.entries.get(id)?.driver;
  }

  private tierFor(sp: SpeciesDef, dist: number, lod1Rank: number, locked: boolean): Tier | 'placeholder' | null {
    const far = sp.model.viewDistance_m ?? (sp.taxon.group === 'bird' ? BIRD_DIST : Math.min(isAquatic(sp) ? AQUATIC_DIST : LOD2_DIST, Math.max(10, (sp.size.length_mm.mean / 1000) * 400)));
    if (dist > far) return null;
    if (!sp.model.lod2 && !sp.model.lod1 && !sp.model.hero) return 'placeholder';
    if (locked) return sp.model.hero ? 'hero' : sp.model.lod1 ? 'lod1' : 'lod2';
    if (dist <= LOD1_DIST && lod1Rank < this.preset.lod1Count && sp.model.lod1) return 'lod1';
    return sp.model.lod2 ? 'lod2' : sp.model.lod1 ? 'lod1' : 'hero';
  }

  update(f: CreatureFrame): void {
    this.frameIndex++;
    const env: SpawnEnv = { tod: f.tod, season: f.season, tidePhase: f.tidePhase, mapId: this.mapId, gameMs: f.gameMs, day: Math.floor(f.gameMs / 86400000) };
    // spawning (1 Hz)
    this.spawnAcc += f.dt;
    if (this.spawnAcc >= 1) {
      this.spawnAcc = 0;
      const live = this.individuals;
      for (const ind of this.spawner.cull(f.playerPos.x, f.playerPos.z, env, live)) if (ind.id !== f.lockedId) this.despawn(ind.id);
      const scale = this.preset.creatureScale;
      const requests = this.spawner.plan(f.playerPos.x, f.playerPos.z, env, this.individuals, this.minSpawnDist);
      let n = 0;
      for (const req of requests) {
        if (scale < 1 && (n++ % Math.round(1 / (1 - scale + 1e-6))) === 0 && Math.random() > scale) continue;
        this.spawn(this.spawner.create(req, f.gameMs));
      }
    }
    // LOD assignment (4 Hz)
    this.lodAcc += f.dt;
    if (this.lodAcc >= 0.25) {
      this.lodAcc = 0;
      this.assignTiers(f);
    }
    this.keepInWater(f);
    // brains and drivers
    const nowSec = f.gameMs / 1000;
    for (const e of this.entries.values()) {
      const ind = e.ind;
      const dist = ind.pos.distanceTo(f.playerPos);
      // alert dynamics: what the animal makes of the player depends on how the player moves — standing still it is
      // soon forgotten, a slow crouched approach barely registers, a walk is noticed, a run sends everything off
      const fleeD = Number(ind.species.brain.params.fleeDistance_m ?? 2);
      const menace = f.playerRunning ? 2.2 : f.playerSpeed < 0.05 ? 0 : f.playerCrouched ? 0.4 : 1;
      if (dist < fleeD * 2.5 && menace > 0) ind.alert = Math.min(1, ind.alert + f.dt * menace * ind.wariness * (dist < fleeD * 1.3 ? 0.4 : 0.12));
      else ind.alert = Math.max(0, ind.alert - f.dt * (dist < fleeD * 2.5 ? 0.05 : 0.08));
      ind.energy = Math.max(0, ind.energy - f.dt * 0.001);
      // brain tick at the tree's rate for this LOD
      const tree = this.trees.get(ind.species.id)!;
      const hz = ind.lod <= 1 ? tree.def.tickHz.near : ind.lod === 2 ? tree.def.tickHz.mid : tree.def.tickHz.far;
      if (nowSec >= ind.brain.nextTick) {
        ind.brain.nextTick = nowSec + 1 / hz;
        if (!e.driver.busy) ind.brain.done = true;
        const ctx: PerceptionContext = {
          ind, sample: this.habitat.sample(ind.pos.x, ind.pos.z, f.gameMs), habitat: this.habitat, tidePhase: f.tidePhase, tod: f.tod, season: f.season,
          playerPos: f.playerPos, playerDist: dist, playerRunning: f.playerRunning, nowSec, aquatic: isAquatic(ind.species),
        };
        const intent = tree.tick(ctx);
        if (intent) this.issue(e, intent, nowSec);
      }
      // driver update (near every frame, mid every 2nd, far every 4th)
      if (e.view) {
        const every = ind.lod <= 1 ? 1 : ind.lod === 2 ? 2 : 4;
        if (this.frameIndex % every === 0) {
          e.driver.update(f.dt * every, {
            floor: this.floor, player: f.playerPos, simScale: f.simScale, nowMs: f.gameMs, locked: e.ind.id === f.lockedId,
            minDepth: isAquatic(ind.species) ? minDepthFor(ind.species, ind.length_mm) : undefined,
          });
        }
        if (e.view.hero) e.view.hero.update(f.camera, e.driver.openings ?? { mouth: 0, gill: 0 });
      }
    }
  }

  private issue(e: Entry, intent: Intent, nowSec: number): void {
    // an aquatic animal is never sent out of the water: the move stops where the water does
    if (intent.target && isAquatic(e.ind.species)) {
      const t = this.waterBound(e.ind, intent.target, intent.kind === 'flee');
      if (t !== intent.target) intent = { ...intent, target: t };
    }
    const b = e.ind.brain;
    b.done = false;
    b.intentId = intent.id;
    b.lastIntentKind = intent.kind;
    b.busyUntil = nowSec + (intent.seconds > 0 ? intent.seconds : 8);
    e.driver.setIntent(intent);
  }

  private assignTiers(f: CreatureFrame): void {
    const camPos = f.camera.position;
    const sorted = [...this.entries.values()].map((e) => ({ e, dist: e.ind.pos.distanceTo(camPos) })).sort((a, b) => a.dist - b.dist);
    let lod1Rank = 0;
    for (const { e, dist } of sorted) {
      const locked = e.ind.id === f.lockedId;
      const tier = this.tierFor(e.ind.species, dist, lod1Rank, locked);
      if (tier === 'lod1') lod1Rank++;
      e.ind.lod = locked ? 0 : tier === 'lod1' ? 1 : tier === null ? 3 : 2;
      if (tier === null) { if (e.view) this.dropView(e); continue; }
      if (e.view?.tier === tier || e.pendingTier === tier) continue;
      void this.setTier(e, tier);
    }
  }

  private async setTier(e: Entry, tier: Tier | 'placeholder'): Promise<void> {
    e.pendingTier = tier;
    const sp = e.ind.species;
    let view: View;
    if (tier === 'placeholder') {
      const entry = DRIVERS[sp.model.driver ?? ''];
      if (!entry?.placeholder) { e.pendingTier = null; return; }
      const ph = entry.placeholder();
      ph.root.userData.placeholder = ph;
      view = { tier, root: ph.root, model: null, radius: ph.length * 0.6, hero: null };
    } else {
      // the growth stage's own model where the species has them, in the individual's pattern variant
      const rel = modelFor(sp, e.ind.stage)[tier] ?? sp.model[tier]!;
      let model: LoadedModel;
      try { model = await instantiateModel(rel, variantOf(e.ind.id)); } catch (err) { console.warn(err); e.pendingTier = null; return; }
      if (!this.entries.has(e.ind.id) || e.pendingTier !== tier) { model.root.removeFromParent(); return; }
      let hero: HeroInstance | null = null;
      if (tier === 'hero' && this.heroApply) {
        try { hero = await this.heroApply(model); } catch (err) { console.warn('[hero] falling back to standard materials', err); hero = null; }
        if (!this.entries.has(e.ind.id) || e.pendingTier !== tier) { hero?.dispose(); model.root.removeFromParent(); return; }
      }
      view = { tier, root: model.root, model, radius: model.radius, hero };
    }
    if (e.view) this.dropView(e);
    e.view = view;
    e.pendingTier = null;
    this.group.add(view.root);
    const bones = view.model?.bones ?? {};
    const meshes = view.model?.meshes ?? [];
    // the baked clips ride on the root for drivers that play them (the plover)
    if (view.model) view.root.userData.clips = view.model.clips;
    e.driver.attach(view.root, e.ind, view.model?.extras ?? {}, bones as Record<string, Object3D>, meshes);
    if (tier !== 'hero' && sp.size.length_mm.mean < SHADOWLESS_MM) view.root.traverse((o) => { o.castShadow = false; });
  }

  private dropView(e: Entry): void {
    if (!e.view) return;
    e.view.hero?.dispose();
    e.driver.detach();
    e.view.root.removeFromParent();
    e.view = null;
  }

  spawn(ind: Individual): void {
    if (this.entries.has(ind.id)) return;
    const entry = DRIVERS[ind.species.model.driver ?? ''];
    if (!entry) { console.warn(`[creatures] no driver for ${ind.species.id}`); return; }
    const driver = entry.create();
    const unsub = driver.onEvent((ev) => this.events.emit('behavior', ev));
    ind.pos.y = this.terrain.heightAt(ind.pos.x, ind.pos.z);
    this.entries.set(ind.id, { ind, driver, view: null, pendingTier: null, unsub });
    this.events.emit('spawn', ind);
  }

  despawn(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.dropView(e);
    e.unsub();
    e.driver.dispose();
    this.entries.delete(id);
    this.events.emit('despawn', e.ind);
  }

  /** debug: spawn everything the rules allow right around the player, ignoring the pop-in distance */
  forceSpawn(playerPos: Vector3, env: SpawnEnv): number {
    const requests = this.spawner.plan(playerPos.x, playerPos.z, env, this.individuals, 0);
    for (const req of requests) this.spawn(this.spawner.create(req, env.gameMs));
    return requests.length;
  }

  /**
   * Aquatic animals stay in the water. Each remembers the last spot that was deep enough for it; the moment it is
   * out (its own dart, a flight from the net, the ebb pulling back) it is set back there, turned toward the nearest
   * water and sent that way. The ebb is followed, never a beach; only one with no water anywhere near and nobody
   * watching is quietly gone with the tide.
   */
  private keepInWater(f: CreatureFrame): void {
    for (const e of this.entries.values()) {
      const ind = e.ind;
      if (!isAquatic(ind.species) || ind.id === f.lockedId) continue;
      // every animal in view every frame (a dart is fast); the unseen ones at a few hertz
      if (ind.lod > 2 && (this.frameIndex & 7) !== 0) continue;
      const need = minDepthFor(ind.species, ind.length_mm);
      if (this.habitat.depthAt(ind.pos.x, ind.pos.z) >= need) {
        ind.strandedSince = 0;
        (e.lastWet ??= new Vector3()).copy(ind.pos);
        continue;
      }
      if (!ind.strandedSince) ind.strandedSince = f.gameMs;
      const wet = e.lastWet;
      const back = !!wet && this.habitat.depthAt(wet.x, wet.z) >= need;
      const fx = back && wet ? wet.x : ind.pos.x, fz = back && wet ? wet.z : ind.pos.z;
      const dest = this.habitat.nearestWater(fx, fz, need + 0.02, 3) ?? this.habitat.nearestWater(fx, fz, need + 0.02, 12) ?? this.habitat.nearestWater(fx, fz, need + 0.02, 25);
      if (back && wet) {
        e.driver.holdAt?.(wet.x, wet.z, dest ? Math.atan2(dest.x - wet.x, dest.z - wet.z) : undefined);
        ind.pos.x = wet.x; ind.pos.z = wet.z;
        ind.strandedSince = 0;
      }
      if (dest) {
        if (!back && ind.pos.distanceTo(f.playerPos) > 20) {
          // left high and dry out of sight (the ebb outran it): it is simply in the water again
          e.driver.holdAt?.(dest.x, dest.z);
          ind.pos.x = dest.x; ind.pos.z = dest.z;
          ind.strandedSince = 0;
        } else if (back || ind.brain.lastIntentKind !== 'moveTo' || !e.driver.busy) {
          ind.alert = Math.max(ind.alert, 0.5);
          this.issue(e, { id: this.tmpIntent.id--, kind: 'moveTo', urgency: 0.9, seconds: 6, target: dest }, f.gameMs / 1000);
        }
      } else if (f.gameMs - ind.strandedSince > 30000 && ind.pos.distanceTo(f.playerPos) > 30) {
        this.despawn(ind.id);
      }
    }
  }

  /**
   * The point along the way to `target` where the water still holds the animal (its own spot when the first step is
   * already dry). A flight that would run aground is turned to the side with the longest run of water instead.
   */
  private waterBound(ind: Individual, target: Vector3, flee: boolean): Vector3 {
    const need = minDepthFor(ind.species, ind.length_mm);
    if (this.habitat.depthAt(target.x, target.z) >= need) return target;
    const run = (dx: number, dz: number, len: number): number => {
      const n = Math.max(1, Math.ceil(len / 0.1));
      let ok = 0;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        if (this.habitat.depthAt(ind.pos.x + dx * u, ind.pos.z + dz * u) < need) break;
        ok = u;
      }
      return ok;
    };
    let dx = target.x - ind.pos.x, dz = target.z - ind.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return target;
    let u = run(dx, dz, len);
    if (flee && u * len < 0.3) {
      // try the sides, away from the threat still: the longest wet run wins
      const a0 = Math.atan2(dx, dz);
      for (const off of [0.9, -0.9, 1.6, -1.6, 2.3, -2.3]) {
        const ax = Math.sin(a0 + off) * len, az = Math.cos(a0 + off) * len;
        const ua = run(ax, az, len);
        if (ua > u) { u = ua; dx = ax; dz = az; }
      }
    }
    return new Vector3(ind.pos.x + dx * u, target.y, ind.pos.z + dz * u);
  }

  /** The water jumped (a ticket, a debug time): everyone but the watched animal leaves and the flat is repopulated. */
  resetPopulation(lockedId: string | null = null): void {
    for (const id of [...this.entries.keys()]) if (id !== lockedId) this.despawn(id);
    this.spawnAcc = 1;
  }

  /** Push an intent from outside the brain (e.g. a failed capture scares the animal). */
  forceIntent(id: string, intent: Intent): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.ind.alert = 1;
    this.issue(e, { ...intent, id: this.tmpIntent.id-- }, Date.now() / 1000);
  }

  /** Remove an individual permanently (captured). */
  remove(id: string): void {
    this.removed.add(id);
    this.despawn(id);
  }

  /** Nearest individual under the screen centre within `maxDist` metres. */
  pickTarget(camera: Camera, maxDist = 8): Individual | null {
    camera.getWorldDirection(this.tmp);
    this.ray.set(camera.position, this.tmp);
    let best: Individual | null = null, bestD = Infinity;
    for (const e of this.entries.values()) {
      if (!e.view) continue;
      const scale = e.ind.length_mm / e.ind.species.model.modelLength_mm;
      const r = Math.max(0.12, e.view.radius * scale * 1.6);
      this.sphere.set(e.driver.anchor(), r);
      const d = e.ind.pos.distanceTo(camera.position);
      if (d > maxDist) continue;
      if (this.ray.intersectsSphere(this.sphere) && d < bestD) { bestD = d; best = e.ind; }
    }
    return best;
  }

  /** true when the given individual is currently drawn with the hero materials */
  heroActive(id: string | null): boolean {
    if (!id) return false;
    return !!this.entries.get(id)?.view?.hero;
  }

  anchorOf(id: string): Vector3 | null {
    const e = this.entries.get(id);
    return e ? e.driver.anchor().clone() : null;
  }

  /** Visible individuals count by tier (debug / HUD). */
  stats(): { total: number; visible: number; lod1: number } {
    let visible = 0, lod1 = 0;
    for (const e of this.entries.values()) { if (e.view) visible++; if (e.ind.lod === 1) lod1++; }
    return { total: this.entries.size, visible, lod1 };
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) this.despawn(id);
    this.scene.remove(this.group);
  }
}
