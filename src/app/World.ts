import { FogExp2, Scene, Vector3, type PerspectiveCamera, type WebGLRenderer } from 'three';
import type { MapDef, TideStationDef } from '../data/schemas';
import { TideModel } from '../tide/TideModel';
import { Terrain, loadTerrainGrid } from '../world/Terrain';
import { Water } from '../world/Water';
import { SkyDome } from '../world/Sky';
import { Habitat } from '../world/Habitat';
import { sunDirection, sunPosition, timeOfDay, type TimeOfDay } from '../world/Sun';
import { jstParts, seasonOf, type Season } from '../core/Time';
import type { QualityPreset } from '../core/Settings';

/** The tidal flat: terrain, water, sky, habitat and the tide model bound to a map. */
export class World {
  readonly scene = new Scene();
  readonly fog: FogExp2;
  readonly sunDir = new Vector3(0, 1, 0);
  sunElevation = 45;
  tod: TimeOfDay = 'day';
  season: Season = 'autumn';
  tideLevel = 0;
  tideRate = 0;
  private lastHabitatMs = 0;
  private lastEnvMs = 0;
  private timeAcc = 0;

  private constructor(
    readonly map: MapDef,
    readonly terrain: Terrain,
    readonly water: Water,
    readonly sky: SkyDome,
    readonly habitat: Habitat,
    readonly tide: TideModel,
  ) {
    this.fog = new FogExp2(0xbfd2dc, 0.0032);
    this.scene.fog = this.fog;
    this.scene.add(terrain.mesh, water.mesh);
    for (const pool of habitat.pools) this.scene.add(water.addPool(pool.cells, pool.level));
  }

  static async create(map: MapDef, station: TideStationDef, renderer: WebGLRenderer, preset: QualityPreset, onProgress?: (label: string) => void): Promise<World> {
    onProgress?.('地形');
    const grid = await loadTerrainGrid(map);
    const terrain = new Terrain(grid, map.substrate.palette);
    onProgress?.('潮だまり');
    const habitat = new Habitat(terrain);
    const water = new Water(terrain);
    const tide = new TideModel(station);
    // the sky needs its own scene reference; create it after the scene exists
    const w = new World(map, terrain, water, null as unknown as SkyDome, habitat, tide);
    const sky = new SkyDome(w.scene, renderer, preset.shadows, preset.shadowMapSize);
    (w as { sky: SkyDome }).sky = sky;
    return w;
  }

  /** Advance environment state for a game time (ms) and real dt (s). */
  update(gameMs: number, dt: number, anchor: Vector3, camera: PerspectiveCamera): void {
    this.timeAcc += dt;
    // tide
    this.tideLevel = this.tide.level(gameMs);
    if (this.timeAcc > 1 || this.tideRate === 0) this.tideRate = this.tide.rate(gameMs);
    this.water.setLevel(this.tideLevel);
    this.water.update(dt);
    if (gameMs - this.lastHabitatMs > 2000 || this.lastHabitatMs === 0) {
      this.lastHabitatMs = gameMs;
      this.habitat.update(gameMs, this.tideLevel);
    }
    this.terrain.setWater(this.tideLevel, this.habitat.wetLevel, this.timeAcc);
    // sun and sky
    const sp = sunPosition(gameMs, this.map.origin.lat, this.map.origin.lon);
    sunDirection(sp, this.sunDir);
    this.sunElevation = sp.elevation;
    this.tod = timeOfDay(sp.elevation, jstParts(gameMs).hour);
    this.season = seasonOf(gameMs);
    this.sky.update(this.sunDir, sp.elevation, anchor);
    this.fog.color.copy(this.sky.fogColor);
    this.scene.background = this.sky.fogColor;
    if (this.timeAcc - this.lastEnvMs > 30 || this.lastEnvMs === 0) {
      this.lastEnvMs = this.timeAcc;
      this.sky.refreshEnvironment();
    }
    this.sky.sky.position.copy(camera.position);
    if (this.timeAcc > 1) this.timeAcc -= 0; // keep accumulating; used as shader time
  }
}
