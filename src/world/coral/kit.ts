import {
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three';
import { coralGeometry } from './geometry';
import { createWaves, type WaveSet } from '../Waves';
import { coralMaterial, type CoralLight } from './materials';
import { type CoralSpec, type CoralSpecies, type CoralVariant, type CoralLod } from './types';
export interface CoralGround {
  heightAt(x: number, z: number): number;
  normalAt?(x: number, z: number, out: Vector3): Vector3;
}
export class CoralKit {
  readonly light: CoralLight = {
    water: { value: 0 },
    time: { value: 0 },
    sun: { value: new Vector3(0.4, 0.8, 0.3).normalize() },
    waves: createWaves().uniforms,
  };
  private geometries = new Map<string, BufferGeometry>();
  private materials = new Map<string, MeshStandardMaterial>();
  private views = new Set<InstancedBufferGeometry>();
  private owners = new Map<BufferGeometry, InstancedBufferGeometry>();
  disposed = false;
  /** Stable uniform holders follow the actual water field, including later gain changes. */
  setWaves(waves: WaveSet): void {
    if (this.disposed) throw Error('CoralKit disposed');
    for (const key of ['uWaveA', 'uWaveB', 'uWaveGain'] as const) {
      const source = waves.uniforms[key];
      if (this.light.waves[key] === source) continue;
      Object.defineProperty(this.light.waves[key], 'value', {
        configurable: true,
        get: () => source.value,
        // Water owns the value; material consumers only read this forwarded uniform.
      });
    }
  }
  geometry(species: CoralSpecies, variant: CoralVariant, lod: CoralLod): BufferGeometry {
    if (this.disposed) throw Error('CoralKit disposed');
    const key = `${species}/${variant}/${lod}`;
    if (!this.geometries.has(key)) this.geometries.set(key, coralGeometry(species, variant, lod));
    return this.geometries.get(key)!;
  }
  material(species: CoralSpecies, lod: CoralLod): MeshStandardMaterial {
    const key = `${species}/${lod}`;
    if (!this.materials.has(key)) this.materials.set(key, coralMaterial(species, lod, this.light));
    return this.materials.get(key)!;
  }
  mesh(species: CoralSpecies, variant: CoralVariant, lod: CoralLod, capacity: number): InstancedMesh {
    const source = this.geometry(species, variant, lod),
      g = new InstancedBufferGeometry();
    for (const key of Object.keys(source.attributes)) g.setAttribute(key, source.attributes[key]);
    g.setIndex(source.index);
    g.boundingBox = source.boundingBox?.clone() ?? null;
    g.boundingSphere = source.boundingSphere?.clone() ?? null;
    g.userData.coralSource = source;
    g.setAttribute(
      'aCoralLook',
      new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage),
    );
    this.views.add(g);
    if (!this.owners.has(source)) this.owners.set(source, g);
    const m = new InstancedMesh(g, this.material(species, lod), capacity);
    m.name = source.name;
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.count = 0;
    m.castShadow = lod < 2;
    m.receiveShadow = true;
    return m;
  }
  release(m: InstancedMesh): void {
    m.dispose();
    m.removeFromParent();
    const g = m.geometry as InstancedBufferGeometry;
    if (this.owners.get(g.userData.coralSource) !== g && this.views.has(g)) {
      for (const key of Object.keys(g.attributes)) if (key !== 'aCoralLook') g.deleteAttribute(key);
      g.setIndex(null);
      g.dispose();
      this.views.delete(g);
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const g of this.views) g.dispose();
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.views.clear();
    this.owners.clear();
    this.geometries.clear();
    this.materials.clear();
  }
  get stats(): { geometries: number; materials: number; views: number } {
    return { geometries: this.geometries.size, materials: this.materials.size, views: this.views.size };
  }
}
const up = new Vector3(0, 1, 0);
export function coralMatrix(spec: CoralSpec, ground: CoralGround): Matrix4 {
  const normal = ground.normalAt?.(spec.x, spec.z, new Vector3()) ?? up;
  // Massive colonies retain their broad contact plane. Large whole-body growth tilts otherwise
  // lift a metre-wide rim off the bottom; narrow-based branching colonies can lean further.
  const massive = spec.species === 'porites_lobata' || spec.species === 'platygyra_daedalea';
  const substrateGain = massive ? 1 : 0.25,
    growthGain = massive ? 0.12 : 1;
  const dir = new Vector3(
    normal.x * substrateGain + spec.growthDirection[0] * growthGain,
    massive ? normal.y : 1,
    normal.z * substrateGain + spec.growthDirection[1] * growthGain,
  ).normalize();
  const q = new Quaternion()
    .setFromUnitVectors(up, dir)
    .multiply(new Quaternion().setFromAxisAngle(up, spec.yaw));
  const width = 1 + (spec.branchDensity - 1) * 0.14;
  return new Matrix4().compose(
    new Vector3(spec.x, ground.heightAt(spec.x, spec.z) - 0.04 * spec.scale, spec.z),
    q,
    new Vector3(spec.scale * width, spec.scale, spec.scale / width),
  );
}
export function writeCoral(m: InstancedMesh, i: number, s: CoralSpec, ground: CoralGround): void {
  m.setMatrixAt(i, coralMatrix(s, ground));
  m.setColorAt(i, s.surfaceColor);
  (m.geometry.getAttribute('aCoralLook') as InstancedBufferAttribute).setXYZW(
    i,
    (s.seed >>> 0) / 4294967296,
    s.damageAmount,
    s.algaeAmount,
    s.scale,
  );
}
export function finishCorals(m: InstancedMesh, count: number): void {
  m.count = count;
  m.visible = count > 0;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.geometry.getAttribute('aCoralLook').needsUpdate = true;
  if (count) {
    m.computeBoundingBox();
    m.computeBoundingSphere();
  }
}
export class OkinawaCoral extends Group {
  readonly levels: InstancedMesh[] = [];
  constructor(
    readonly kit: CoralKit,
    readonly spec: CoralSpec,
    ground: CoralGround,
  ) {
    super();
    this.name = spec.species;
    for (const lod of [0, 1, 2] as const) {
      const m = kit.mesh(spec.species, spec.variant, lod, 1);
      writeCoral(m, 0, spec, ground);
      finishCorals(m, 1);
      this.levels.push(m);
      this.add(m);
    }
    this.setLod(0);
  }
  setLod(lod: CoralLod): void {
    this.levels.forEach((m, i) => (m.visible = i === lod));
  }
  override dispose(): void {
    for (const m of this.levels) this.kit.release(m);
    this.clear();
  }
}
