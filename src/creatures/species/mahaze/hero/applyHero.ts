import { Mesh, NoColorSpace, SRGBColorSpace, SkinnedMesh, Vector3, type Camera, type Material, type Texture } from 'three';
import type { LoadedModel } from '../../../models/ModelLoader';
import type { SharedUniforms } from '../../../../render/HeroPipeline';
import { LAYER_BEHIND, LAYER_FISH } from '../../../../render/HeroPipeline';
import { createBodyMaterial, createProfileTexture } from './BodyMaterial.js';
import { createFinMaterials } from './FinMaterial.js';
import { createEyeMaterial } from './EyeMaterial.js';
import { createInteriorMaterial } from './InteriorMaterial.js';

interface MahazeMatExtras {
  role: string;
  pigmentTexture?: number;
  snoutCap?: { albedoRoughness: number; pigment: number; rectMM: { y0: number; y1: number; z0: number; z1: number } };
  profile?: { n: number; data: number[] };
  fishFrame?: { S0: number; Y0: number; SL: number; SEND: number };
  vertebrae?: { start: number; count: number };
  dataTexture?: number;
  /** fin: tint and melanophore factor of the individual's colour morph (the fin atlases are shared by the colours) */
  tint?: [number, number, number];
  melK?: number;
}

interface FinEntry {
  mesh: SkinnedMesh;
  scatter: SkinnedMesh;
  center: Vector3;
}

/** A model instance whose standard materials were swapped for the volumetric hero materials. */
export class HeroInstance {
  private fins: FinEntry[] = [];
  private originals = new Map<Mesh, Material | Material[]>();
  private created: Material[] = [];
  private interiorMat: { uniforms: { uMouthOpen: { value: number }; uGillOpen: { value: number } } } | null = null;
  private readonly tmp = new Vector3();

  private constructor() {}

  static async apply(model: LoadedModel, shared: SharedUniforms): Promise<HeroInstance> {
    const inst = new HeroInstance();
    const parser = model.parser;
    const tex = async (index: number | undefined, colorSpace: string): Promise<Texture | null> => {
      if (index === undefined) return null;
      const t = (await parser.getDependency('texture', index)) as Texture;
      t.colorSpace = colorSpace;
      return t;
    };
    const roleOf = (m: Mesh): MahazeMatExtras | undefined => (m.userData.mahaze as MahazeMatExtras | undefined) ?? ((m.material as Material).userData as { mahaze?: MahazeMatExtras }).mahaze;
    const body = model.meshes.find((m) => roleOf(m)?.role === 'body');
    const eyes = model.meshes.filter((m) => roleOf(m)?.role === 'eye');
    const finMeshes = model.meshes.filter((m) => roleOf(m)?.role === 'fin') as SkinnedMesh[];
    const interiors = model.meshes.filter((m) => roleOf(m)?.role === 'interior');
    if (!body || !finMeshes.length || !eyes.length) throw new Error('mahaze hero: roles missing');
    const bx = roleOf(body)!;
    const orig = body.material as unknown as { map: Texture; normalMap: Texture; roughnessMap?: Texture; aoMap?: Texture };
    const pigment = await tex(bx.pigmentTexture, NoColorSpace);
    const capAlbedo = await tex(bx.snoutCap?.albedoRoughness, SRGBColorSpace);
    const capPigment = await tex(bx.snoutCap?.pigment, NoColorSpace);
    const bodyMat = createBodyMaterial({
      textures: { albedo: orig.map, normal: orig.normalMap, orm: orig.roughnessMap ?? orig.aoMap, pigment, capAlbedo, capPigment },
      capRect: bx.snoutCap!.rectMM,
      profileTexture: createProfileTexture(bx.profile),
      frame: bx.fishFrame,
      vertebrae: bx.vertebrae,
      shared,
    }) as Material;
    inst.swap(body, bodyMat);
    const eyeOrig = eyes[0].material as unknown as { map: Texture; userData: { mahaze: unknown } };
    const eyeMat = createEyeMaterial({ irisTexture: eyeOrig.map, params: eyeOrig.userData.mahaze, shared }) as Material;
    for (const e of eyes) inst.swap(e, eyeMat);
    const interiorMat = createInteriorMaterial({ shared });
    for (const m of interiors) inst.swap(m, interiorMat as unknown as Material);
    inst.interiorMat = interiorMat as unknown as HeroInstance['interiorMat'];
    const finOrig = finMeshes[0].material as unknown as { map: Texture; normalMap: Texture; userData: { mahaze: MahazeMatExtras } };
    const finData = await tex(finOrig.userData.mahaze.dataTexture, NoColorSpace);
    const fx = finOrig.userData.mahaze;
    const finMats = createFinMaterials({ textures: { color: finOrig.map, data: finData, normal: finOrig.normalMap }, shared, tint: fx.tint, melK: fx.melK }) as { transmit: Material; scatter: Material };
    inst.created.push(bodyMat, eyeMat, interiorMat as unknown as Material, finMats.transmit, finMats.scatter);
    for (const f of finMeshes) {
      const scatter = new SkinnedMesh(f.geometry, finMats.scatter);
      scatter.bind(f.skeleton, f.bindMatrix);
      scatter.morphTargetInfluences = f.morphTargetInfluences;
      scatter.morphTargetDictionary = f.morphTargetDictionary;
      scatter.frustumCulled = false;
      scatter.layers.set(LAYER_FISH);
      scatter.layers.enable(LAYER_BEHIND);
      scatter.name = `${f.name}_scatter`;
      f.parent?.add(scatter);
      f.layers.enable(LAYER_BEHIND);
      inst.swap(f, finMats.transmit);
      f.geometry.computeBoundingSphere();
      inst.fins.push({ mesh: f, scatter, center: f.geometry.boundingSphere!.center.clone() });
    }
    for (const m of model.meshes) {
      m.layers.set(LAYER_FISH);
      m.frustumCulled = false;
      m.castShadow = false;
    }
    for (const f of inst.fins) { f.mesh.layers.enable(LAYER_BEHIND); }
    return inst;
  }

  private swap(mesh: Mesh, mat: Material): void {
    if (!this.originals.has(mesh)) this.originals.set(mesh, mesh.material);
    mesh.material = mat;
  }

  /** Per frame: sort the two fin passes back to front and feed mouth / gill openings. */
  update(camera: Camera, openings: { mouth: number; gill: number }): void {
    const list = this.fins.map((f) => ({ f, d: this.tmp.copy(f.center).applyMatrix4(f.mesh.matrixWorld).distanceToSquared(camera.position) }));
    list.sort((a, b) => b.d - a.d);
    list.forEach(({ f }, i) => {
      f.mesh.renderOrder = 100 + i * 2;
      f.scatter.renderOrder = 101 + i * 2;
    });
    if (this.interiorMat) {
      this.interiorMat.uniforms.uMouthOpen.value = openings.mouth;
      this.interiorMat.uniforms.uGillOpen.value = openings.gill;
    }
  }

  /** Restore the standard materials and remove the scatter passes. */
  dispose(): void {
    for (const [mesh, mat] of this.originals) {
      mesh.material = mat;
      mesh.layers.set(0);
      mesh.frustumCulled = true;
    }
    for (const f of this.fins) f.scatter.removeFromParent();
    for (const m of this.created) m.dispose();
    this.fins = [];
    this.originals.clear();
  }
}
