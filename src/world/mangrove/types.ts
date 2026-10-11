import { Vector3 } from 'three';
import { hashInts, Rng } from '../../core/Rng';

export type HirugiLod = 0 | 1 | 2;
export type HirugiBase = 0 | 1 | 2 | 3 | 4;
export type SaplingSize = 0 | 1 | 2;
export const BASE_NAMES = ['低い横広がり', '二股の開いた樹冠', '水路へ傾く樹冠', '縦長の林内木', '多幹の古木'] as const;
export interface Ground { heightAt(x: number, z: number): number }
export interface HirugiSeeds { trunkSeed: number; rootSeed: number; leafSeed: number; scaleSeed: number }
export interface TreeSpec extends HirugiSeeds {
  id: number; base: HirugiBase; x: number; z: number; yaw: number; scale: number;
  /** null: adult; 0..2: fixed juvenile models, no seed deformation. */
  sapling: SaplingSize | null;
  /** deep forest row: skipped on low quality */
  deep?: boolean;
}
export interface WoodPath { points: Vector3[]; radii: number[]; order: number; root: boolean }
export interface LeafSpec { center: Vector3; axis: Vector3; roll: number; length: number; width: number; age: number; phase: number }
export interface TreeSkeleton { trunk: WoodPath[]; branches: WoodPath[]; roots: WoodPath[]; leaves: LeafSpec[];
  /** Far-LOD foliage cards, one per twig. Empty for juveniles, which keep true leaves at every LOD. */
  tufts: LeafSpec[]; height: number; reach: number }
export interface RootSegment { a: Vector3; b: Vector3; ra: number; rb: number; tree: number; root: boolean }

export function treeSpec(seed: number, id = 0, base: HirugiBase = (id % 5) as HirugiBase): TreeSpec {
  const rng = new Rng(hashInts(seed, id));
  return { id, base, x: 0, z: 0, yaw: rng.range(0, Math.PI * 2), scale: 1, sapling: null,
    trunkSeed: hashInts(seed, id, 11), rootSeed: hashInts(seed, id, 29), leafSeed: hashInts(seed, id, 53), scaleSeed: hashInts(seed, id, 97) };
}
/** Exact CPU counterpart of hgShape in materials.ts. Uniform scale keeps capsule radii meaningful. */
export function seedValues(s: TreeSpec): [number, number, number, number] {
  return s.sapling !== null ? [0.5, 0.5, 0.5, 0.5] : [s.trunkSeed / 4294967295, s.rootSeed / 4294967295, s.leafSeed / 4294967295, s.scaleSeed / 4294967295];
}
export function treeScale(s: TreeSpec): number { return s.scale * (s.sapling !== null ? 1 : 0.86 + seedValues(s)[3] * 0.28); }
export function shapePoint(p: Vector3, s: TreeSpec, root: boolean, out = new Vector3()): Vector3 {
  const [a, b] = seedValues(s), y = Math.max(0, p.y), t = Math.min(1, y / 2);
  const lean = y * t * t * (3 - 2 * t);
  const weight = root ? Math.max(0, 1-y/2.6) : 0;
  const spread = 1 + (b-0.5)*0.28*weight;
  const twist = weight * (b-0.5) * 0.16 * Math.sin(p.x*1.4+p.z*0.8);
  const c = Math.cos(twist), sn = Math.sin(twist);
  return out.set((p.x*c-p.z*sn) * spread + (a - 0.5) * 0.14 * lean, p.y, (p.x*sn+p.z*c) * spread + Math.sin(a * Math.PI * 2) * 0.055 * lean);
}
export function worldPoint(p: Vector3, s: TreeSpec, root: boolean, ground: Ground, out = new Vector3()): Vector3 {
  shapePoint(p, s, root, out);
  const scale = treeScale(s), c = Math.cos(s.yaw), sn = Math.sin(s.yaw), x = out.x * scale, z = out.z * scale;
  out.set(s.x + c * x + sn * z, ground.heightAt(s.x, s.z) + out.y * scale, s.z - sn * x + c * z);
  if (root) {
    const t = Math.max(0, Math.min(1, 1 - Math.max(p.y, 0) / 1.35));
    out.y += (ground.heightAt(out.x, out.z) - ground.heightAt(s.x, s.z)) * t * t * (3 - 2 * t);
  }
  return out;
}
