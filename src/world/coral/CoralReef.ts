import { Group, Vector3, type InstancedMesh } from 'three';
import type { Quality } from '../../core/Settings';
import { hashInts, Rng } from '../../core/Rng';
import type { Terrain } from '../Terrain';
import { reflectInWater } from '../../render/Mirror';
import { CoralKit, finishCorals, writeCoral } from './kit';
import { CORAL_IDS, CORAL_INFO, coralSpec, type CoralSpec, type CoralSpecies, type CoralLod } from './types';
export interface ReefCluster {
  x: number;
  z: number;
  radius: number;
  count: number;
  exposure?: number;
}
export interface ReefLayout {
  seed: number;
  clusters: readonly ReefCluster[];
  waterLevel?: number;
  lowWater?: number;
  minSpacing?: number;
}
export const CORAL_LOD: Record<Quality, readonly [number, number, number]> = {
  high: [6.5, 20, 85],
  mid: [3.2, 13, 65],
  low: [1.6, 9, 50],
  minimal: [0, 6, 35],
};
const HERO_BUDGET: Record<Quality, number> = { high: 8, mid: 3, low: 1, minimal: 0 };
const colonyHeight: Record<CoralSpecies, number> = {
  acropora_digitifera: 0.86,
  acropora_hyacinthus: 0.68,
  porites_lobata: 1.4,
  montipora_foliosa: 0.92,
  platygyra_daedalea: 0.88,
};
const colonyRadius: Record<CoralSpecies, number> = {
  acropora_digitifera: 0.6,
  acropora_hyacinthus: 1.2,
  porites_lobata: 1.35,
  montipora_foliosa: 0.9,
  platygyra_daedalea: 1.1,
};
/** A conservative low-tide clearance check; live colonies never spawn on mud, plants, channels or steep slopes. */
export function placeCorals(terrain: Terrain, layout: ReefLayout): CoralSpec[] {
  const r = new Rng(layout.seed),
    out: CoralSpec[] = [],
    cells = new Map<string, CoralSpec[]>(),
    cell = 3;
  const level = layout.waterLevel ?? 0,
    low = layout.lowWater ?? -0.65;
  for (const [clusterIndex, cluster] of layout.clusters.entries())
    for (let attempt = 0, accepted = 0; attempt < cluster.count * 55 && accepted < cluster.count; attempt++) {
      const a = r.range(0, Math.PI * 2),
        rr = Math.sqrt(r.next()) * cluster.radius,
        x = cluster.x + Math.cos(a) * rr,
        z = cluster.z + Math.sin(a) * rr;
      // Dominant colonies form local stands, with recruitment of other forms between them.
      // This is an art-directed habitat mosaic, not a claimed field survey.
      const dominant = CORAL_IDS[hashInts(layout.seed, clusterIndex, 61) % CORAL_IDS.length],
        species = r.next() < 0.48 ? dominant : r.pick(CORAL_IDS),
        spec = coralSpec(layout.seed, out.length, species);
      spec.x = x;
      spec.z = z;
      // Flow-facing open patches prefer Acropora; sheltered pockets keep more foliose colonies.
      const exposure = cluster.exposure ?? 0.5;
      if (species === 'montipora_foliosa' && r.next() < exposure * 0.45) continue;
      const h = terrain.heightAt(x, z),
        depth = level - h,
        [min, max] = CORAL_INFO[species].depth,
        reach = colonyRadius[species] * spec.scale;
      if (
        depth < min ||
        depth > max ||
        h + colonyHeight[species] * spec.scale > low - 0.08 ||
        !terrain.inside(x, z, reach + 0.25)
      )
        continue;
      if (!['rock', 'gravel'].includes(terrain.substrateAt(x, z)) || terrain.pitMaskAt(x, z) > 0.02) continue;
      if (terrain.normalAt(x, z, new Vector3()).y < 0.97) continue;
      let ok = true;
      for (let j = 0; j < 8; j++) {
        const xx = x + Math.cos((j * Math.PI) / 4) * reach,
          zz = z + Math.sin((j * Math.PI) / 4) * reach;
        if (
          Math.abs(terrain.heightAt(xx, zz) - h) > 0.22 ||
          !['rock', 'gravel'].includes(terrain.substrateAt(xx, zz))
        )
          ok = false;
      }
      const ix = Math.floor(x / cell),
        iz = Math.floor(z / cell);
      for (let j = iz - 2; j <= iz + 2; j++)
        for (let i = ix - 2; i <= ix + 2; i++)
          for (const other of cells.get(`${i},${j}`) ?? []) {
            const spacing = Math.max(
              layout.minSpacing ?? 0.2,
              reach + colonyRadius[other.species] * other.scale + 0.12,
            );
            if (Math.hypot(other.x - x, other.z - z) < spacing) ok = false;
          }
      if (!ok) continue;
      const key = `${ix},${iz}`,
        list = cells.get(key) ?? [];
      list.push(spec);
      cells.set(key, list);
      out.push(spec);
      accepted++;
    }
  return out;
}
interface Bucket {
  specs: CoralSpec[];
  levels: Map<CoralLod, InstancedMesh>;
}
/** Spatial buckets × species × four forms × LOD, with one shared material per species/tier. */
export class CoralReef {
  readonly group = new Group();
  readonly kit = new CoralKit();
  readonly specs: CoralSpec[];
  private readonly buckets: Bucket[] = [];
  private readonly lods = new Map<number, number>();
  private quality: Quality = 'mid';
  private lastCamera = new Vector3(Infinity, Infinity, Infinity);
  private elapsed = Infinity;
  private forced: CoralLod | null = null;
  constructor(
    readonly terrain: Terrain,
    layout: ReefLayout,
    explicit?: CoralSpec[],
  ) {
    this.group.name = 'OkinawaCoralReef';
    this.specs = explicit ?? placeCorals(terrain, layout);
    const map = new Map<string, CoralSpec[]>();
    for (const s of this.specs) {
      const key = `${Math.floor(s.x / 32)},${Math.floor(s.z / 32)}/${s.species}/${s.variant}`,
        list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    for (const specs of map.values()) this.buckets.push({ specs, levels: new Map() });
  }
  setQuality(q: Quality): void {
    this.quality = q;
    this.elapsed = Infinity;
  }
  setLod(lod: CoralLod | null): void {
    this.forced = lod;
    this.elapsed = Infinity;
  }
  update(dt: number, camera: { position: Vector3 }, env: { tideLevel: number; sunDir?: Vector3 }): void {
    this.kit.light.water.value = env.tideLevel;
    this.kit.light.time.value += dt;
    if (env.sunDir) this.kit.light.sun.value.copy(env.sunDir);
    this.elapsed += dt;
    if (this.elapsed < 0.25 && camera.position.distanceToSquared(this.lastCamera) < 0.25) return;
    this.elapsed = 0;
    this.lastCamera.copy(camera.position);
    const [near, mid, far] = CORAL_LOD[this.quality];
    const distance = (s: CoralSpec) =>
      Math.hypot(
        s.x - camera.position.x,
        this.terrain.heightAt(s.x, s.z) + 0.4 * s.scale - camera.position.y,
        s.z - camera.position.z,
      ) / Math.max(0.7, s.scale);
    const closest = new Set(
      this.specs
        .filter((s) => distance(s) < near * 1.12)
        .sort((a, b) => distance(a) - distance(b))
        .slice(0, HERO_BUDGET[this.quality])
        .map((s) => s.id),
    );
    for (const bucket of this.buckets) {
      const lists: CoralSpec[][] = [[], [], []];
      for (const s of bucket.specs) {
        const d = distance(s),
          old = this.lods.get(s.id) ?? -1,
          n = near * (old === 0 ? 1.12 : 0.88),
          m = mid * (old === 1 ? 1.12 : 0.88),
          f = far * (old === 2 ? 1.08 : 0.92);
        const lod = d > f ? -1 : (this.forced ?? (d < n && closest.has(s.id) ? 0 : d < m ? 1 : 2));
        this.lods.set(s.id, lod);
        if (lod >= 0) lists[lod].push(s);
      }
      for (const lod of [0, 1, 2] as const) {
        const specs = lists[lod];
        if (!specs.length && !bucket.levels.has(lod)) continue;
        if (!bucket.levels.has(lod)) {
          const s = bucket.specs[0],
            m = this.kit.mesh(s.species, s.variant, lod, bucket.specs.length);
          bucket.levels.set(lod, m);
          this.group.add(reflectInWater(m));
        }
        const mesh = bucket.levels.get(lod)!;
        specs.forEach((s, i) => writeCoral(mesh, i, s, this.terrain));
        finishCorals(mesh, specs.length);
        mesh.castShadow = (this.quality === 'high' || this.quality === 'mid') && lod < 2;
      }
    }
  }
  get stats(): {
    colonies: number;
    calls: number;
    triangles: number;
    lod: number[];
    geometries: number;
    materials: number;
  } {
    let calls = 0,
      triangles = 0;
    const lod = [0, 0, 0];
    for (const b of this.buckets)
      for (const [l, m] of b.levels)
        if (m.visible) {
          calls++;
          lod[l] += m.count;
          triangles += (m.count * (m.geometry.index?.count ?? 0)) / 3;
        }
    return {
      colonies: this.specs.length,
      calls,
      triangles,
      lod,
      geometries: this.kit.stats.geometries,
      materials: this.kit.stats.materials,
    };
  }
  dispose(): void {
    for (const b of this.buckets) for (const m of b.levels.values()) this.kit.release(m);
    this.kit.dispose();
    this.group.clear();
    this.buckets.length = 0;
    this.lods.clear();
  }
}
