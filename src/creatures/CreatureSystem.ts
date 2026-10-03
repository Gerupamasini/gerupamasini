import { Group, Object3D, PerspectiveCamera, Ray, Scene, Sphere, Vector3, type Camera } from 'three';
import type { GameData } from '../data/loader';
import type { SpeciesDef, TidePhase } from '../data/schemas';
import type { Habitat } from '../world/Habitat';
import type { Terrain } from '../world/Terrain';
import type { TimeOfDay } from '../world/Sun';
import type { Season } from '../core/Time';
import type { QualityPreset } from '../core/Settings';
import { EventBus } from '../core/EventBus';
import { BehaviorTree, type PerceptionContext } from './brain/BehaviorTree';
import { Spawner, type SpawnEnv } from './Spawner';
export type { SpawnEnv };
import { isAquatic, minDepthFor, type Individual } from './Individual';
import type { BehaviorEvent, Driver, Floor, Intent } from './drivers/Driver';
import { DRIVERS } from './drivers/index';
import { instantiateModel, preloadModel, type LoadedModel, type Tier } from './models/ModelLoader';
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
}

export interface CreatureFrame {
  dt: number;
  gameMs: number;
  playerPos: Vector3;
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
      if (sp.model.lod2) jobs.push(preloadModel(sp.model.lod2));
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
    const far = sp.model.viewDistance_m ?? (sp.taxon.group === 'bird' ? BIRD_DIST : Math.min(LOD2_DIST, Math.max(10, (sp.size.length_mm.mean / 1000) * 400)));
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
      this.followTheWater(f);
      const scale = this.preset.creatureScale;
      const requests = this.spawner.plan(f.playerPos.x, f.playerPos.z, env, this.individuals);
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
    // brains and drivers
    const nowSec = f.gameMs / 1000;
    for (const e of this.entries.values()) {
      const ind = e.ind;
      const dist = ind.pos.distanceTo(f.playerPos);
      // alert dynamics
      const fleeD = Number(ind.species.brain.params.fleeDistance_m ?? 2);
      if (dist < fleeD * 2.5) ind.alert = Math.min(1, ind.alert + f.dt * (dist < fleeD * 1.3 ? 0.5 : 0.15));
      else ind.alert = Math.max(0, ind.alert - f.dt * 0.08);
      ind.energy = Math.max(0, ind.energy - f.dt * 0.001);
      // brain tick at the tree's rate for this LOD
      const tree = this.trees.get(ind.species.id)!;
      const hz = ind.lod <= 1 ? tree.def.tickHz.near : ind.lod === 2 ? tree.def.tickHz.mid : tree.def.tickHz.far;
      if (nowSec >= ind.brain.nextTick) {
        ind.brain.nextTick = nowSec + 1 / hz;
        if (!e.driver.busy) ind.brain.done = true;
        const ctx: PerceptionContext = {
          ind, sample: this.habitat.sample(ind.pos.x, ind.pos.z, f.gameMs), habitat: this.habitat, tidePhase: f.tidePhase, tod: f.tod, season: f.season,
          playerPos: f.playerPos, playerDist: dist, nowSec, aquatic: isAquatic(ind.species),
        };
        const intent = tree.tick(ctx);
        if (intent) this.issue(e, intent, nowSec);
      }
      // driver update (near every frame, mid every 2nd, far every 4th)
      if (e.view) {
        const every = ind.lod <= 1 || e.driver.everyFrame ? 1 : ind.lod === 2 ? 2 : 4;
        if (this.frameIndex % every === 0) e.driver.update(f.dt * every, { floor: this.floor, player: f.playerPos, simScale: f.simScale, nowMs: f.gameMs, locked: e.ind.id === f.lockedId });
        if (e.view.hero) e.view.hero.update(f.camera, e.driver.openings ?? { mouth: 0, gill: 0 });
      }
    }
  }

  private issue(e: Entry, intent: Intent, nowSec: number): void {
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
      const rel = sp.model[tier]!;
      let model: LoadedModel;
      try { model = await instantiateModel(rel); } catch (err) { console.warn(err); e.pendingTier = null; return; }
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
    e.driver.attach(view.root, e.ind, view.model?.extras ?? {}, bones as Record<string, Object3D>, meshes);
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
   * Aquatic animals never sit on dry ground: when the water under one gets too shallow it heads for the nearest water
   * that is deep enough; when there is none nearby, it has been dry for a while, or nobody is close enough to see it,
   * it simply leaves (slipped off with the tide). Pit residents leave when their pit dries.
   */
  private followTheWater(f: CreatureFrame): void {
    for (const e of [...this.entries.values()]) {
      const ind = e.ind;
      if (ind.id === f.lockedId) continue;
      if (!isAquatic(ind.species) || ind.managed) continue;
      const need = minDepthFor(ind.species, ind.length_mm);
      if (this.habitat.depthAt(ind.pos.x, ind.pos.z) >= need) { ind.strandedSince = 0; continue; }
      if (!ind.strandedSince) ind.strandedSince = f.gameMs;
      const dist = ind.pos.distanceTo(f.playerPos);
      const wet = ind.pitId === undefined ? this.habitat.nearestWater(ind.pos.x, ind.pos.z, need + 0.02, 6) : null;
      if (!wet || dist > 25 || f.gameMs - ind.strandedSince > 12000) { this.despawn(ind.id); continue; }
      if (ind.brain.lastIntentKind !== 'moveTo' || !e.driver.busy) {
        ind.alert = Math.max(ind.alert, 0.5);
        this.issue(e, { id: this.tmpIntent.id--, kind: 'moveTo', urgency: 0.9, seconds: 6, target: wet }, f.gameMs / 1000);
      }
    }
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

  /**
   * The individual under the screen centre within `maxDist` metres: of those whose pick sphere the view ray
   * passes through, the one closest to the ray (relative to its sphere), then the nearer. Animals out of sight
   * (down a burrow) are skipped.
   */
  pickTarget(camera: Camera, maxDist = 8): Individual | null {
    camera.getWorldDirection(this.tmp);
    this.ray.set(camera.position, this.tmp);
    let best: Individual | null = null, bestScore = Infinity;
    for (const e of this.entries.values()) {
      if (!e.view || e.driver.hidden) continue;
      const scale = e.ind.length_mm / e.ind.species.model.modelLength_mm;
      const r = Math.max(0.12, e.view.radius * scale * 1.6);
      const a = e.driver.anchor();
      this.sphere.set(a, r);
      const d = e.ind.pos.distanceTo(camera.position);
      if (d > maxDist) continue;
      if (!this.ray.intersectsSphere(this.sphere)) continue;
      const off = Math.sqrt(this.ray.distanceSqToPoint(a)) / r;
      const score = off + d / maxDist * 0.25;
      if (score < bestScore) { bestScore = score; best = e.ind; }
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
