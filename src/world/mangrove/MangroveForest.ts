import { Group, Sphere, Vector3, type InstancedMesh, type PerspectiveCamera } from 'three';
import { hashInts, Rng } from '../../core/Rng';
import type { QualityPreset } from '../../core/Settings';
import type { Terrain } from '../Terrain';
import { reflectInWater } from '../../render/Mirror';
import { collisionSegments, RootCollisionWorld } from './collision';
import { batchBounds, finishInstances, HirugiKit, writeInstance } from './kit';
import { PARTS, type TreePart } from './materials';
import { treeScale, treeSpec, type HirugiBase, type HirugiLod, type TreeSpec } from './types';

export interface MangroveCluster { x: number; z: number; radius: number; count: number }
export interface MangroveLayout {
  seed: number; clusters: readonly MangroveCluster[]; juvenileFraction?: number;
  /** Metres in the same datum as Terrain. No fixed geography or invented tide data. */
  minGround?: number; maxGround?: number; minSpacing?: number;
}
type VegetationQuality = QualityPreset['vegetation'];
export const MANGROVE_LOD: Record<VegetationQuality, readonly [number, number, number]> = { high: [11, 32, 180], mid: [8, 25, 145], low: [5, 18, 110] };
const NEAR_BUDGET: Record<VegetationQuality, number> = { high: 2, mid: 1, low: 1 };
interface Batch { specs: TreeSpec[]; bounds: Sphere; levels: Map<HirugiLod, Record<TreePart, InstancedMesh>> }

/** Deterministic gap/edge/juvenile structure; no uniform rows or independent random dots. */
export function placeMangroves(terrain: Terrain, layout: MangroveLayout): TreeSpec[] {
  const rng = new Rng(layout.seed), specs: TreeSpec[] = [], spacing = layout.minSpacing ?? 2.5;
  const cells = new Map<string, TreeSpec[]>(), cell = spacing;
  let id = 0;
  for (const cluster of layout.clusters) {
    for (let attempt = 0, accepted = 0; attempt < cluster.count * 45 && accepted < cluster.count; attempt++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * cluster.radius;
      const x = cluster.x + Math.cos(a) * r, z = cluster.z + Math.sin(a) * r;
      const edge = r / cluster.radius, young = rng.chance((layout.juvenileFraction ?? 0.2) * (0.4 + edge * 1.8));
      const s = treeSpec(hashInts(layout.seed, 173), id, rng.int(0, 4) as HirugiBase); s.x = x; s.z = z;
      s.scale = young ? 1 : rng.range(0.79, 1.16) * (1 - edge * 0.15);
      s.sapling = young ? rng.int(0, 2) as 0 | 1 | 2 : null;
      const h = terrain.heightAt(x, z), rootReach = young ? 0.45 : (s.base === 4 ? 4.1 : 3.5) * treeScale(s);
      if (!terrain.inside(x, z, rootReach + 0.5) || h < (layout.minGround ?? -0.35) || h > (layout.maxGround ?? 0.8)) continue;
      const sub = terrain.substrateAt(x, z);
      if (sub !== 'mud' && sub !== 'muddy_sand' && sub !== 'sand') continue;
      // Keep major roots off channels, steep banks and feeding pits. Root tips conform to local terrain in shader/physics.
      let suitable = true;
      for (let j = 0; j < 8; j++) {
        const xx = x + Math.cos(j * Math.PI / 4) * rootReach, zz = z + Math.sin(j * Math.PI / 4) * rootReach;
        if (Math.abs(terrain.heightAt(xx, zz) - h) > 0.65 || terrain.pitMaskAt(xx, zz) > 0.05 || terrain.substrateAt(xx, zz) === 'channel') suitable = false;
      }
      if (!suitable || terrain.pitMaskAt(x, z) > 0.05) continue;
      const ix = Math.floor(x / cell), iz = Math.floor(z / cell);
      for (let j = iz - 2; j <= iz + 2; j++) for (let i = ix - 2; i <= ix + 2; i++) {
        for (const other of cells.get(`${i},${j}`) ?? []) {
          const min = (young && other.sapling !== null ? 0.4 : young || other.sapling !== null ? 1.15 : spacing) * (young ? 1 : treeScale(s));
          if (Math.hypot(x - other.x, z - other.z) < min) suitable = false;
        }
      }
      // Irregular openings. The edge receives more pioneers and shorter crowns.
      if (!suitable || Math.sin(x * 0.21 + Math.cos(z * 0.17)) + Math.cos(z * 0.27) < -1.55) continue;
      const key = `${ix},${iz}`, list = cells.get(key) ?? []; list.push(s); cells.set(key, list);
      specs.push(s); accepted++; id++;
    }
  }
  return specs;
}

/** 48 m chunk × five base silhouettes × three LODs, four semantic draw calls per populated bucket. */
export class MangroveForest {
  readonly group = new Group();
  readonly kit: HirugiKit;
  readonly collision = new RootCollisionWorld();
  readonly specs: TreeSpec[];
  private readonly batches: Batch[] = [];
  private readonly lods = new Map<number, number>();
  private quality: VegetationQuality = 'mid';
  private elapsed = Infinity;
  private lastCamera = new Vector3(Infinity, Infinity, Infinity);
  private forcedLod: HirugiLod | null = null;
  constructor(readonly terrain: Terrain, layout: MangroveLayout, explicit?: TreeSpec[]) {
    this.group.name = 'MangroveForest'; this.kit = new HirugiKit(terrain);
    this.specs = explicit ?? placeMangroves(terrain, layout);
    const buckets = new Map<string, TreeSpec[]>();
    for (const s of this.specs) {
      const key = `${Math.floor(s.x / 48)},${Math.floor(s.z / 48)}/${s.sapling === null ? `a${s.base}` : `j${s.sapling}`}`;
      const list = buckets.get(key) ?? []; list.push(s); buckets.set(key, list);
      this.collision.add(collisionSegments(this.kit.skeleton(s.base, s.sapling), s, terrain));
    }
    for (const specs of buckets.values()) this.batches.push({ specs, bounds: batchBounds(specs, this.kit), levels: new Map() });
  }
  setQuality(q: VegetationQuality): void {
    if ((q === 'low') !== (this.quality === 'low')) {
      for (const batch of this.batches) {
        const far = batch.levels.get(2);
        if (far) { for (const part of PARTS) this.kit.release(far[part]); batch.levels.delete(2); }
      }
    }
    this.quality = q; this.elapsed = Infinity;
  }
  /** For asset inspection only; automatic map rendering enforces the close-up budget. */
  setLod(lod: HirugiLod | null): void { this.forcedLod = lod; this.elapsed = Infinity; }
  update(dt: number, camera: Pick<PerspectiveCamera, 'position'>, env: { tideLevel: number; wetLevel: number; wind?: number }): void {
    this.kit.uniforms.uHgTime.value += dt; this.kit.uniforms.uHgWater.value = env.tideLevel;
    this.kit.uniforms.uHgWet.value = Math.max(env.tideLevel, env.wetLevel); this.kit.uniforms.uHgWind.value = env.wind ?? 1;
    this.elapsed += dt;
    if (this.elapsed < 0.25 && camera.position.distanceToSquared(this.lastCamera) < 1) return;
    this.elapsed = 0; this.lastCamera.copy(camera.position);
    const [near, mid, far] = MANGROVE_LOD[this.quality];
    const distance = (s: TreeSpec) => Math.hypot(s.x-camera.position.x,s.z-camera.position.z)/Math.max(0.65,treeScale(s));
    const nearest = new Set(this.specs.filter(s => s.sapling === null && distance(s)<near*1.12)
      .sort((a,b)=>distance(a)-distance(b)).slice(0,NEAR_BUDGET[this.quality]).map(s=>s.id));
    for (const batch of this.batches) {
      const levels: TreeSpec[][] = [[], [], []];
      for (const s of batch.specs) {
        const d = distance(s);
        const old = this.lods.get(s.id) ?? -1;
        // Hysteresis, both directions, independent of the collision representation.
        const n = near * (old === 0 ? 1.12 : 0.88), m = mid * (old === 1 ? 1.12 : 0.88);
        const f = far * (old === 2 ? 1.06 : 0.94);
        const lod = d > f ? -1 : this.forcedLod ?? (d < n && (s.sapling !== null || nearest.has(s.id)) ? 0 : d < m ? 1 : 2);
        this.lods.set(s.id, lod); if (lod >= 0) levels[lod].push(s);
      }
      for (const lod of [0, 1, 2] as const) {
        const specs = levels[lod];
        if (!specs.length && !batch.levels.has(lod)) continue;
        if (!batch.levels.has(lod)) {
          const first = batch.specs[0], level = {} as Record<TreePart, InstancedMesh>;
          for (const part of PARTS) {
            level[part] = this.kit.mesh(first.base, lod, part, batch.specs.length, first.sapling, this.quality === 'low' && lod === 2);
            this.group.add(reflectInWater(level[part]));
          }
          batch.levels.set(lod, level);
        }
        const level = batch.levels.get(lod)!;
        for (const part of PARTS) {
          const mesh = level[part]; specs.forEach((s, i) => writeInstance(mesh, i, s, this.terrain));
          finishInstances(mesh, specs.length, batch.bounds); mesh.castShadow = this.quality !== 'low' && lod < 2;
        }
      }
    }
  }
  get stats(): { trees: number; templates: number; geometries: number; calls: number; triangles: number; collisionSegments: number; lod: number[] } {
    let calls = 0, triangles = 0; const lod = [0, 0, 0];
    for (const batch of this.batches) for (const [l, level] of batch.levels) {
      lod[l] += level.Trunk.count;
      for (const part of PARTS) if (level[part].visible && level[part].geometry.index!.count) { calls++; triangles += level[part].count * level[part].geometry.index!.count / 3; }
    }
    return { trees: this.specs.length, templates: this.kit.templateCount, geometries: this.kit.geometryCount, calls, triangles, collisionSegments: this.collision.segments.length, lod };
  }
  dispose(): void {
    for (const batch of this.batches) for (const level of batch.levels.values()) for (const part of PARTS) this.kit.release(level[part]);
    this.batches.length = 0; this.lods.clear(); this.collision.clear(); this.group.clear(); this.kit.dispose();
  }
}
