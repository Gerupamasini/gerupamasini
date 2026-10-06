import { FogExp2, Scene, Vector3, type PerspectiveCamera, type WebGLRenderer } from 'three';
import type { MapDef, TideStationDef } from '../data/schemas';
import { TideModel } from '../tide/TideModel';
import { Terrain, loadTerrainGrid } from '../world/Terrain';
import { WaterPass } from '../world/Water';
import { createWaves } from '../world/Waves';
import { SkyDome } from '../world/Sky';
import { Habitat } from '../world/Habitat';
import { carveCoarse, placeFeedingPits } from '../world/FeedingPits';
import { createPitDebris } from '../world/PitDebris';
import { Skyline } from '../world/Skyline';
import { Riprap } from '../world/Riprap';
import { OysterAtlas } from '../creatures/oyster/bake';
import { OysterReef } from '../creatures/oyster/OysterReef';
import { oysterEnv } from '../creatures/oyster/material';
import type { FeedingPit } from '../world/FeedingPits';
import { hashInts } from '../core/Rng';
import { sunDirection, sunPosition, timeOfDay, type TimeOfDay } from '../world/Sun';
import { jstParts, seasonOf, type Season } from '../core/Time';
import type { QualityPreset } from '../core/Settings';

/** The tidal flat: terrain, water, sky, habitat and the tide model bound to a map. */
export class World {
  /** the stingray feeding pits (debug, tests) */
  pits: FeedingPit[] = [];
  /** the far scenery on the horizon (landmarks as flat silhouettes) */
  readonly skyline = new Skyline();
  /** the stones along the levees and the rubble mounds (hard ground for oysters) */
  riprap: Riprap | null = null;
  /** the マガキ reef on those stones */
  oysters: OysterReef | null = null;

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
  }

  static async create(map: MapDef, station: TideStationDef | TideModel, renderer: WebGLRenderer, preset: QualityPreset, onProgress?: (label: string) => void, pitSeed = 20261001): Promise<World> {
    onProgress?.('地形');
    const grid = await loadTerrainGrid(map);
    // アカエイの昼寝跡: dug into the flat before the terrain is built, so pools, tags and shading all see them;
    // the seed is the day's, so the rays have been somewhere else by the next visit
    const pits = placeFeedingPits(grid, map.substrate.palette, hashInts(map.id.length * 7919, pitSeed));
    grid.baseHeights = grid.heights.slice();
    grid.pitMask = carveCoarse(grid, pits);
    const terrain = new Terrain(grid, map.substrate.palette, pits);
    terrain.setDetail(preset.surfaceDetail > 0);
    onProgress?.('潮だまり');
    const habitat = new Habitat(terrain, 5, pits);
    terrain.setSpill(habitat.poolLevels);
    // one wave set for the surface and the caustics; the seed follows the map so the ripples differ between flats
    const waves = createWaves({ windDir: 0.7, depth: 0.6, seed: map.id.length * 131 + 7 });
    terrain.setWaves(waves);
    const water = new WaterPass(terrain, waves);
    const tide = station instanceof TideModel ? station : new TideModel(station);
    // the sky needs its own scene reference; create it after the scene exists
    const w = new World(map, terrain, water, null as unknown as SkyDome, habitat, tide);
    for (const m of createPitDebris(pits, terrain, pitSeed)) w.scene.add(m);
    w.pits = pits;
    w.scene.add(w.skyline.group);
    // hard ground and the oyster reef on it: stones along the levees' toes and on the low flat; every face in the
    // oyster zone (about mean sea level down to the spring low) grows a clump
    onProgress?.('牡蠣礁');
    const quality = preset.surfaceDetail === 0 ? 'low' : preset.shadowMapSize >= 2048 ? 'high' : 'mid';
    const riprap = new Riprap(terrain, hashInts(map.id.length * 17, 0x51b));
    for (const m of riprap.group) w.scene.add(m);
    w.riprap = riprap;
    try {
      const atlas = OysterAtlas.shared(renderer, quality);
      const sites = riprap.attachSites(map.id.length * 101 + 7, 0.38, -1.15, 0.2).map((s) => ({
        p: s.p, n: s.n, room: s.room,
        surface: (world: Vector3, outP: Vector3, outN: Vector3) => riprap.surfaceToward(s.stone, world, outP, outN),
      }));
      const reef = new OysterReef({
        atlas, sites, seed: hashInts(map.id.length, 0x0a5), quality, maxOysters: quality === 'low' ? 5000 : 12000,
        ground: (x, z, n) => { terrain.normalAt(x, z, n); return terrain.heightAt(x, z) + riprap.heightBoost(x, z); },
      });
      w.scene.add(reef.group);
      w.oysters = reef;
    } catch (e) {
      // the reef needs float render targets for its texture bake; the flat works without it
      console.warn('[oysters] reef not built', e);
    }
    const sky = new SkyDome(w.scene, renderer, preset.shadows, preset.shadowMapSize);
    (w as { sky: SkyDome }).sky = sky;
    return w;
  }

  /** Advance environment state for a game time (ms) and real dt (s). */
  update(gameMs: number, dt: number, anchor: Vector3, camera: PerspectiveCamera): void {
    this.timeAcc += dt;
    // tide
    this.tideLevel = this.tideOverride ?? this.tide.level(gameMs);
    if (this.timeAcc > 1 || this.tideRate === 0) this.tideRate = this.tideOverride !== null ? 0 : this.tide.rate(gameMs);
    this.water.setLevel(this.tideLevel);
    oysterEnv.uOyWater.value.set(this.tideLevel, this.habitat.wetLevel);
    oysterEnv.uOyTime.value += dt;
    this.riprap?.update(camera);
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
    // lift the exposure at night so the flat stays readable under the moon
    this.exposure = 0.58 + 0.32 * (1 - Math.max(0, Math.min(1, (sp.elevation + 4) / 14)));
    this.scene.background = this.sky.fogColor;
    // the sky refreshes its environment maps itself whenever the sun moved enough (so time jumps show at once)
    this.sky.refreshEnvironment();
    this.sky.sky.position.copy(camera.position);
    this.skyline.update(camera.position, this.sky.fogColor, day);
    if (this.timeAcc > 1) this.timeAcc -= 0; // keep accumulating; used as shader time
  }
}
