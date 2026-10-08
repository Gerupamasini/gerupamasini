import { FogExp2, Scene, Vector3, type Mesh, type PerspectiveCamera, type WebGLRenderer } from 'three';
import type { MapDef, TideStationDef } from '../data/schemas';
import { TideModel } from '../tide/TideModel';
import { Terrain, loadTerrainGrid } from '../world/Terrain';
import { WaterPass } from '../world/Water';
import { createWaves } from '../world/Waves';
import { LAYER_MIRROR, reflectInWater } from '../render/Mirror';
import { surfUniforms } from '../world/Surf';
import { SkyDome } from '../world/Sky';
import { Habitat } from '../world/Habitat';
import { carveCoarse, placeFeedingPits } from '../world/FeedingPits';
import { createPitDebris } from '../world/PitDebris';
import { Skyline } from '../world/Skyline';
import { AmamoMeadow, MEADOW_QUALITY } from '../world/amamo';
import { LAYOUTS, type ShoreLayout } from '../world/maps/hashirimizu';
import type { FeedingPit } from '../world/FeedingPits';
import { hashInts } from '../core/Rng';
import { sunDirection, sunPosition, timeOfDay, type TimeOfDay } from '../world/Sun';
import { jstParts, seasonOf, type Season } from '../core/Time';
import type { QualityPreset } from '../core/Settings';

/** direction the breeze drives the ripples and the waves over the eelgrass (radians in the xz plane) */
const WIND_DIR = 0.7;

/** The tidal flat: terrain, water, sky, habitat and the tide model bound to a map. */
export class World {
  /** the stingray feeding pits (debug, tests) */
  pits: FeedingPit[] = [];
  /** the far scenery on the horizon (landmarks as flat silhouettes) */
  readonly skyline: Skyline;
  /** the map's own shore features, when it has them (null: the 葛西 flat) */
  readonly layout: ShoreLayout | null;
  /** the アマモ beds below the low-water mark */
  amamo: AmamoMeadow | null = null;

  readonly scene = new Scene();
  readonly fog: FogExp2;
  readonly sunDir = new Vector3(0, 1, 0);
  sunElevation = 45;
  tod: TimeOfDay = 'day';
  season: Season = 'autumn';
  tideLevel = 0;
  tideRate = 0;
  /** debug: fixed tide level in metres (null = follow the model) */
  tideOverride: number | null = null;
  /** 0 = clear sky, 1 = full overcast */
  overcast = 0;
  /** tone-mapping exposure suggested for the current light */
  exposure = 0.5;
  private readonly sunColTmp = new Vector3();
  private lastHabitatMs = 0;
  private timeAcc = 0;

  private constructor(
    readonly map: MapDef,
    readonly terrain: Terrain,
    readonly water: WaterPass,
    readonly sky: SkyDome,
    readonly habitat: Habitat,
    readonly tide: TideModel,
  ) {
    this.fog = new FogExp2(0xbfd2dc, 0.0024);
    this.scene.fog = this.fog;
    this.scene.add(terrain.mesh);
    this.layout = map.layout ? LAYOUTS[map.layout] ?? null : null;
    this.skyline = new Skyline(map.layout);
  }

  static async create(map: MapDef, station: TideStationDef | TideModel, renderer: WebGLRenderer, preset: QualityPreset, onProgress?: (label: string) => void, pitSeed = 20261001): Promise<World> {
    // (performance marks: where the loading goes, read with performance.getEntriesByType('mark'))
    const mark = (what: string) => performance.mark(`world:${what}`);
    mark('start');
    onProgress?.('地形');
    const grid = await loadTerrainGrid(map);
    mark('grid');
    const layout = map.layout ? LAYOUTS[map.layout] ?? null : null;
    // アカエイの昼寝跡: dug into the flat before the terrain is built, so pools, tags and shading all see them;
    // the seed is the day's, so the rays have been somewhere else by the next visit
    const pits = layout
      ? placeFeedingPits(grid, map.substrate.palette, hashInts(map.id.length * 7919, pitSeed), layout.pits.clusters, layout.pits.opts)
      : placeFeedingPits(grid, map.substrate.palette, hashInts(map.id.length * 7919, pitSeed));
    grid.baseHeights = grid.heights.slice();
    grid.pitMask = carveCoarse(grid, pits);
    const terrain = new Terrain(grid, map.substrate.palette, pits);
    terrain.setDetail(preset.surfaceDetail > 0);
    mark('terrain');
    onProgress?.('潮だまり');
    const habitat = new Habitat(terrain, map.habitat?.coarse_m ?? 5, pits);
    mark('habitat');
    if (layout) { terrain.setLandLevel(layout.landLevel[0], layout.landLevel[1]); terrain.setSandTint(...layout.sandTint); terrain.setRippleAngle(layout.rippleAngle); }
    terrain.setSpill(habitat.poolLevels);
    // one wave set for the surface and the caustics; the seed follows the map so the ripples differ between flats
    const waves = createWaves({ windDir: WIND_DIR, depth: 0.6, seed: map.id.length * 131 + 7 });
    terrain.setWaves(waves);
    // the surf on an open shore: one set of uniforms for the water and the sand it wets
    const surf = surfUniforms(layout?.surf ?? null);
    terrain.setSurf(surf);
    const water = new WaterPass(terrain, waves, surf);
    if (layout) water.setBody(...layout.water.colour, layout.water.turbidity);
    const tide = station instanceof TideModel ? station : new TideModel(station);
    // the sky needs its own scene reference; create it after the scene exists
    mark('water');
    const w = new World(map, terrain, water, null as unknown as SkyDome, habitat, tide);
    mark('skyline');
    for (const m of createPitDebris(pits, terrain, pitSeed)) w.scene.add(m);
    w.pits = pits;
    onProgress?.('アマモ場');
    const mapSeed = hashInts(...[...map.id].map((c) => c.charCodeAt(0)), 20261006);
    w.amamo = new AmamoMeadow(terrain, habitat, mapSeed, layout?.meadow);
    w.amamo.setQuality(MEADOW_QUALITY[preset.vegetation]);
    w.amamo.setSurf(water.surfField);
    terrain.setMeadowCover(w.amamo.coverTexture, MEADOW_QUALITY[preset.vegetation].lod[2]);
    w.scene.add(w.amamo.group);
    mark('meadow');
    // the standing features the animals gather at: the eelgrass, its edges, the open sand among it
    const meadow = w.amamo;
    habitat.setFeatures((x, z) => ({ eelgrass: meadow.coverAt(x, z), zone: meadow.suitability(x, z) }));
    if (layout) {
      onProgress?.('浜');
      for (const o of layout.props(terrain, mapSeed)) w.scene.add(o);
      mark('props');
    }
    w.scene.add(reflectInWater(w.skyline.group));
    if (w.skyline.land) w.scene.add(reflectInWater(w.skyline.land.group));
    w.scene.add(terrain.mirrorProxy(LAYER_MIRROR));
    const sky = new SkyDome(w.scene, renderer, preset.shadows, preset.shadowMapSize);
    // (lights obey layers too: the mirror's camera must see the sun and the sky light, or the land comes out black)
    reflectInWater(sky.sky); reflectInWater(sky.sunLight); reflectInWater(sky.hemi);
    (w as { sky: SkyDome }).sky = sky;
    water.setMirror(preset.mirror);
    water.setSurfSteps(preset.surfSteps);
    water.mirrorGate = () => !renderer.shadowMap.enabled || !sky.sunLight.castShadow || sky.sunLight.shadow.map !== null;
    mark('sky');
    return w;
  }

  /** Free what the flat built (leaving for another map). Animals, tools and the case are freed by their owners. */
  dispose(): void {
    this.amamo?.dispose();
    this.amamo = null;
    this.skyline.dispose();
    this.sky.dispose();
    this.water.dispose();
    this.terrain.dispose();
    this.scene.traverse((o) => {
      // the pit debris and the shore's own props: geometry and materials made for this flat
      if (o.userData.mapOwned) { const m = o as Mesh; m.geometry?.dispose(); const mat = m.material; if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose(); }
    });
    this.scene.clear();
  }

  /** Advance environment state for a game time (ms) and real dt (s). */
  update(gameMs: number, dt: number, anchor: Vector3, camera: PerspectiveCamera): void {
    this.timeAcc += dt;
    // tide
    this.tideLevel = this.tideOverride ?? this.tide.level(gameMs);
    if (this.timeAcc > 1 || this.tideRate === 0) this.tideRate = this.tideOverride !== null ? 0 : this.tide.rate(gameMs);
    this.water.setLevel(this.tideLevel);
    this.terrain.updateLod(anchor.x, anchor.z);
    // (absolute: a ticket or the debug clock can move game time backwards, and the pools must follow at once)
    if (Math.abs(gameMs - this.lastHabitatMs) > 2000 || this.lastHabitatMs === 0) {
      this.lastHabitatMs = gameMs;
      this.habitat.update(gameMs, this.tideLevel);
    }
    // sun and sky
    const sp = sunPosition(gameMs, this.map.origin.lat, this.map.origin.lon);
    sunDirection(sp, this.sunDir);
    this.sunElevation = sp.elevation;
    this.tod = timeOfDay(sp.elevation, jstParts(gameMs).hour);
    this.season = seasonOf(gameMs);
    const sunUp = Math.max(0, Math.min(1, (sp.elevation + 2) / 14)) * (1 - 0.8 * this.overcast);
    this.sky.update(this.sunDir, sp.elevation, anchor, this.overcast);
    this.fog.color.copy(this.sky.fogColor);
    this.fog.density = 0.0024 * (1 + 2.5 * this.overcast);
    const day = Math.max(0, Math.min(1, (sp.elevation + 4) / 14));
    this.water.update(dt, {
      sunUp, sunDir: this.sunDir, sunCol: this.sky.sunColorHdr(this.sunColTmp), ambient: this.sky.hemi.intensity * (0.5 + 0.6 * day),
      fogColor: this.sky.fogColor, fogDensity: this.fog.density, env: this.sky.envCube, day,
    });
    // the bed's caustics run on the water's clock so they sit under the ripples that cast them
    this.terrain.setWater(this.tideLevel, this.habitat.wetLevel, this.water.uniforms.uTime.value, sunUp, this.sunDir);
    // the eelgrass sways with the same breeze and leans with the tidal current
    this.amamo?.update(dt, camera, { tideLevel: this.tideLevel, tideRate: this.tideRate, windDir: WIND_DIR, waveGain: this.water.uniforms.uWaveGain.value });
    // lift the exposure at night so the flat stays readable under the moon
    this.exposure = 0.58 + 0.32 * (1 - Math.max(0, Math.min(1, (sp.elevation + 4) / 14)));
    this.scene.background = this.sky.fogColor;
    // the sky refreshes its environment maps itself whenever the sun moved enough (so time jumps show at once)
    this.sky.refreshEnvironment();
    this.sky.sky.position.copy(camera.position);
    this.skyline.update(camera.position, this.sky.fogColor, day, gameMs / 1000);
    if (this.timeAcc > 1) this.timeAcc -= 0; // keep accumulating; used as shader time
  }
}
