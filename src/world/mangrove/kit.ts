import { Box3, ClampToEdgeWrapping, DataTexture, DynamicDrawUsage, FloatType, Group, InstancedBufferAttribute, InstancedBufferGeometry,
  InstancedMesh, LinearFilter, Matrix4, Quaternion, RedFormat, Sphere, Vector2, Vector3, type MeshDepthMaterial, type MeshStandardMaterial } from 'three';
import { buildTreeGeometry, type TreeGeometry } from './geometry';
import { treeDepth, treeMaterial, PARTS, type HirugiUniforms, type TreePart } from './materials';
import { buildSkeleton } from './skeleton';
import { createLeafAtlas } from './leafAtlas';
import { seedValues, treeScale, type Ground, type HirugiBase, type HirugiLod, type SaplingSize, type TreeSkeleton, type TreeSpec } from './types';

export interface HirugiGround extends Ground { size?: number; n?: number }
const UP = new Vector3(0, 1, 0);
export function treeMatrix(spec: TreeSpec, ground: Ground, out = new Matrix4()): Matrix4 {
  const scale = treeScale(spec);
  return out.compose(new Vector3(spec.x, ground.heightAt(spec.x, spec.z), spec.z), new Quaternion().setFromAxisAngle(UP, spec.yaw), new Vector3(scale, scale, scale));
}

/** Shared owner of exactly five adult and three juvenile models. Nothing is rebuilt per seed. */
export class HirugiKit {
  readonly uniforms: HirugiUniforms;
  readonly materials = {} as Record<TreePart, MeshStandardMaterial>;
  readonly depth = {} as Record<TreePart, MeshDepthMaterial>;
  private readonly skeletons = new Map<string, TreeSkeleton>();
  private readonly geometries = new Map<string, TreeGeometry>();
  private readonly views = new Set<InstancedBufferGeometry>();
  /** One registered view per source keeps shared WebGL attributes alive until final kit disposal. */
  private readonly owners = new Map<import('three').BufferGeometry, InstancedBufferGeometry>();
  private readonly groundTexture: DataTexture;
  private readonly leafAtlas = createLeafAtlas();
  disposed = false;
  constructor(readonly ground: HirugiGround) {
    const size = ground.size ?? 512, n = ground.n ?? 129, heights = new Float32Array(n * n);
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) heights[z * n + x] = ground.heightAt((x / (n - 1) - 0.5) * size, (z / (n - 1) - 0.5) * size);
    this.groundTexture = new DataTexture(heights, n, n, RedFormat, FloatType);
    this.groundTexture.minFilter = this.groundTexture.magFilter = LinearFilter;
    this.groundTexture.wrapS = this.groundTexture.wrapT = ClampToEdgeWrapping; this.groundTexture.needsUpdate = true;
    this.uniforms = { uHgTime: { value: 0 }, uHgWater: { value: -10 }, uHgWet: { value: -10 }, uHgWind: { value: 1 }, uHgGround: { value: this.groundTexture }, uHgLeafAtlas: { value: this.leafAtlas }, uHgGrid: { value: new Vector2(size, n) } };
    for (const part of PARTS) { this.materials[part] = treeMaterial(this.uniforms, part); this.depth[part] = treeDepth(this.uniforms, part); }
  }
  skeleton(base: HirugiBase, sapling: SaplingSize | null = null): TreeSkeleton {
    const key = sapling === null ? `adult-${base}` : `juvenile-${sapling}`;
    if (!this.skeletons.has(key)) this.skeletons.set(key, buildSkeleton(base, sapling));
    return this.skeletons.get(key)!;
  }
  geometry(base: HirugiBase, lod: HirugiLod, sapling: SaplingSize | null = null, lowFar = false): TreeGeometry {
    const key = `${sapling === null ? `adult-${base}` : `juvenile-${sapling}`}/${lod}/${lowFar && lod === 2 ? 'cards' : 'normal'}`;
    if (!this.geometries.has(key)) this.geometries.set(key, buildTreeGeometry(this.skeleton(base, sapling), lod, lowFar));
    return this.geometries.get(key)!;
  }
  /** Wrapper adds batch-owned instance attributes; the heavy vertex/index attributes remain shared on the GPU. */
  mesh(base: HirugiBase, lod: HirugiLod, part: TreePart, capacity: number, sapling: SaplingSize | null = null, lowFar = false): InstancedMesh {
    if (this.disposed) throw new Error('HirugiKit was disposed');
    const source = this.geometry(base, lod, sapling, lowFar)[part], g = new InstancedBufferGeometry();
    for (const name of Object.keys(source.attributes)) g.setAttribute(name, source.getAttribute(name));
    g.setIndex(source.index); g.boundingSphere = source.boundingSphere?.clone() ?? null; g.boundingBox = source.boundingBox?.clone() ?? null;
    g.userData.hirugiSource = source;
    g.setAttribute('aSeeds', new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage));
    this.views.add(g);
    if (!this.owners.has(source)) this.owners.set(source,g);
    const m = new InstancedMesh(g, this.materials[part], capacity); m.name = part; m.customDepthMaterial = this.depth[part];
    m.instanceMatrix.setUsage(DynamicDrawUsage); m.castShadow = lod < 2; m.receiveShadow = true; m.count = 0;
    return m;
  }
  /** Release a batch without destroying shared GPU buffers. Views are destroyed together with the kit. */
  release(mesh: InstancedMesh): void {
    mesh.dispose(); mesh.removeFromParent();
    const g = mesh.geometry as InstancedBufferGeometry;
    if (this.owners.get(g.userData.hirugiSource) !== g && this.views.has(g)) {
      // Disposing a geometry normally deletes *all* its GPU attributes. Detach borrowed attributes first,
      // so deleting this batch's aSeeds/VAO cannot break another tree using the shared geometry.
      for (const name of Object.keys(g.attributes)) if (name !== 'aSeeds') g.deleteAttribute(name);
      g.setIndex(null); g.dispose(); this.views.delete(g);
    }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const view of this.views) view.dispose(); this.views.clear();
    this.owners.clear();
    for (const g of this.geometries.values()) for (const part of PARTS) g[part].dispose();
    this.geometries.clear(); this.skeletons.clear();
    for (const part of PARTS) { this.materials[part].dispose(); this.depth[part].dispose(); }
    this.groundTexture.dispose();
    this.leafAtlas.dispose();
  }
  get templateCount(): number { return this.skeletons.size; }
  get geometryCount(): number { return this.geometries.size * 4; }
  get batchGeometryCount(): number { return this.views.size; }
}

export function writeInstance(mesh: InstancedMesh, index: number, spec: TreeSpec, ground: Ground): void {
  mesh.setMatrixAt(index, treeMatrix(spec, ground));
  (mesh.geometry.getAttribute('aSeeds') as InstancedBufferAttribute).setXYZW(index, ...seedValues(spec));
}
export function finishInstances(mesh: InstancedMesh, count: number, bounds?: Sphere): void {
  mesh.count = count; mesh.visible = count > 0; mesh.instanceMatrix.needsUpdate = true;
  mesh.geometry.getAttribute('aSeeds').needsUpdate = true;
  if (bounds) mesh.boundingSphere = bounds;
  else { mesh.computeBoundingSphere(); mesh.computeBoundingBox(); }
}

/** A standalone map prop / close-up asset. Physical placement is specified in metres by spec, not by a hidden parent transform. */
export class YaeyamaHirugi extends Group {
  readonly levels: Record<TreePart, InstancedMesh>[] = [];
  lod: HirugiLod = 0;
  constructor(readonly kit: HirugiKit, readonly spec: TreeSpec) {
    super(); this.name = 'YaeyamaHirugi';
    for (const lod of [0, 1, 2] as const) {
      const level = {} as Record<TreePart, InstancedMesh>;
      for (const part of PARTS) {
        const mesh = kit.mesh(spec.base, lod, part, 1, spec.sapling);
        writeInstance(mesh, 0, spec, kit.ground); finishInstances(mesh, 1); level[part] = mesh;
      }
      this.levels.push(level);
    }
    // The public hierarchy always has precisely the four semantic parts.
    for (const part of PARTS) { const group = new Group(); group.name = part; for (const level of this.levels) group.add(level[part]); this.add(group); }
    this.setLod(0);
  }
  setLod(lod: HirugiLod): void {
    this.lod = lod;
    for (let i = 0; i < 3; i++) for (const part of PARTS) this.levels[i][part].visible = i === lod;
  }
  get triangles(): number { return PARTS.reduce((n, part) => n + (this.levels[this.lod][part].geometry.index?.count ?? 0) / 3, 0); }
  override dispose(): void { for (const level of this.levels) for (const part of PARTS) this.kit.release(level[part]); this.clear(); }
}

export function batchBounds(specs: TreeSpec[], kit: HirugiKit): Sphere {
  const box = new Box3();
  for (const s of specs) {
    const skeleton = kit.skeleton(s.base, s.sapling), scale = treeScale(s), r = (skeleton.reach + 2) * scale, h = (skeleton.height + 1) * scale;
    box.expandByPoint(new Vector3(s.x - r, kit.ground.heightAt(s.x, s.z) - 2, s.z - r));
    box.expandByPoint(new Vector3(s.x + r, kit.ground.heightAt(s.x, s.z) + h, s.z + r));
  }
  return box.getBoundingSphere(new Sphere());
}
