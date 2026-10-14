import { Bone, Box3, LoadingManager, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, SkinnedMesh, Vector3, type AnimationClip, type Material, type WebGLRenderer } from 'three';
import { GLTFLoader, type GLTF, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import basisTranscoderJs from 'three/examples/jsm/libs/basis/basis_transcoder.js?url';
import basisTranscoderWasm from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url';
import { gobyLook, gobyLookReady, isGobyBody, makeTranslucentBody } from '../species/mahaze/bodyTranslucency';
import { morphPick, type MorphTable } from '../species/mahaze/colourMorph.js';

export type Tier = 'hero' | 'lod1' | 'lod2';

/**
 * Asset URLs keyed by path relative to src/assets/models (e.g. "mahaze/mahaze_juvenile.lod2.glb", "nets/net_small.hero.glb").
 * The game loads the packed copies (src/assets/models-packed: KTX2 textures, meshopt geometry), made from the masters
 * the model builders write by `npm run models:pack`.
 */
const MODEL_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../../assets/models-packed/**/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
    .map(([k, v]) => [k.replace(/^.*\/assets\/models-packed\//, ''), v]),
);

export function modelUrl(rel: string): string {
  const u = MODEL_URLS[rel];
  if (!u) throw new Error(`モデルが見つかりません: ${rel}`);
  return u;
}

export interface LoadedModel {
  tier: Tier;
  root: Object3D;
  bones: Record<string, Bone>;
  meshes: Mesh[];
  clips: AnimationClip[];
  extras: Record<string, unknown>;
  /** bounding sphere radius of the rest pose (metres, model scale 1) */
  radius: number;
  /** glTF parser of the cached asset (texture dependencies for custom materials) */
  parser: GLTFParser;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();
const loaded = new Set<string>();
let ktx2: KTX2Loader | null = null;

/**
 * Readies the loader for a renderer: the KTX2 textures are transcoded, on worker threads, to a compressed format the
 * GPU samples (BC7 on PCs and the Steam Deck, ASTC or ETC2 on phones, RGBA where there is none). Called once, before
 * the first model loads; the format chosen serves every renderer of the page (they share the GPU).
 */
export function configureModelLoader(renderer: WebGLRenderer): void {
  if (ktx2) return;
  // (the transcoder's two files are looked up by name: pointed at the URLs the bundler gave them)
  const manager = new LoadingManager();
  manager.setURLModifier((url) => url.endsWith('/basis_transcoder.js') ? basisTranscoderJs : url.endsWith('/basis_transcoder.wasm') ? basisTranscoderWasm : url);
  ktx2 = new KTX2Loader(manager).setTranscoderPath('basis/').detectSupport(renderer);
  loader.setKTX2Loader(ktx2);
}

export function preloadModel(rel: string): Promise<GLTF> {
  let p = cache.get(rel);
  if (!p) {
    if (!ktx2) return Promise.reject(new Error('configureModelLoader(renderer) must run before a model loads'));
    p = loader.loadAsync(modelUrl(rel)).then(async (gltf) => {
      await prepareMaterials(gltf, rel.includes('.hero.') ? 'hero' : rel.includes('.lod1.') ? 'lod1' : 'lod2');
      loaded.add(rel);
      return gltf;
    }).catch((error: unknown) => {
      if (cache.get(rel) === p) cache.delete(rel);
      throw error;
    });
    cache.set(rel, p);
  }
  return p;
}

export function isModelLoaded(rel: string): boolean {
  return loaded.has(rel);
}

/** Tier-dependent material adjustments on the shared (cached) materials; resolves when the maps they add are in. */
function prepareMaterials(gltf: GLTF, tier: Tier): Promise<unknown> {
  const pending: Promise<void>[] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
    for (const m of mats) pending.push(prepareMaterial(m, tier, gltf.parser));
    mesh.castShadow = tier !== 'lod2';
    mesh.receiveShadow = false;
  });
  return Promise.all(pending);
}

function prepareMaterial(m: Material, tier: Tier, parser: GLTFParser): Promise<void> {
  const pm = m as MeshPhysicalMaterial;
  if (tier !== 'hero' && pm.isMeshPhysicalMaterial) {
    // transmission needs an extra scene pass; keep it for the observed hero only
    pm.transmission = 0;
    pm.thickness = 0;
  }
  if (tier === 'lod2') {
    pm.clearcoat = 0;
    // (a goby body blends by the light through it, not by its map's alpha, which holds a pigment)
    if (pm.transparent && pm.alphaTest === 0 && !isGobyBody(m)) { pm.transparent = false; pm.alphaTest = 0.5; }
  }
  const sm = m as MeshStandardMaterial;
  sm.envMapIntensity = 0.8;
  // the gobies' bodies: translucent tissue in every tier (the observed hero swaps in its volumetric material)
  return pm.isMeshPhysicalMaterial && isGobyBody(m) ? makeTranslucentBody(pm, tier, parser) : Promise.resolve();
}

/** The looks a loaded asset's individuals wear (the マハゼ's patterns × colour morphs, body extras `morphs`), if any. */
function morphsOf(gltf: GLTF): MorphTable | null {
  let t: MorphTable | null = null;
  gltf.scene.traverse((o) => {
    const m = (o as Mesh).material;
    if (!t && m && !Array.isArray(m)) t = (m.userData as { mahaze?: { morphs?: MorphTable } }).mahaze?.morphs ?? null;
  });
  return t;
}

/**
 * Instantiate a loaded model (skeleton-aware clone). Materials are shared. `variant` picks the look of an asset that
 * carries several (the マハゼ's three patterns × three colour morphs; any integer, taken modulo their number): the mesh
 * and the maps stay the same, the body and fin materials are the look's own.
 */
export async function instantiateModel(rel: string, variant?: number): Promise<LoadedModel> {
  const gltf = await preloadModel(rel);
  const tier: Tier = rel.includes('.hero.') ? 'hero' : rel.includes('.lod1.') ? 'lod1' : 'lod2';
  const root = skeletonClone(gltf.scene);
  const bones: Record<string, Bone> = {};
  const meshes: Mesh[] = [];
  const morphs = variant !== undefined ? morphsOf(gltf) : null;
  const pick = morphs ? morphPick(morphs, variant!) : null;
  root.traverse((o) => {
    if ((o as Bone).isBone) bones[o.name] = o as Bone;
    if ((o as Mesh).isMesh) {
      const mesh = o as Mesh;
      meshes.push(mesh);
      if (morphs && pick && !Array.isArray(mesh.material)) mesh.material = gobyLook(mesh.material, morphs, pick, (m) => prepareMaterial(m, tier, gltf.parser));
    }
  });
  // (the look's pattern is in its pigment map: not drawn before that is in its uniforms)
  await Promise.all(meshes.map((mesh) => gobyLookReady(mesh.material as Material)));
  for (const mesh of meshes) {
    // keep the species extras on the mesh so drivers still find them after a material swap
    const mx = ((Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material).userData?.mahaze;
    if (mx) mesh.userData.mahaze = mx;
    if ((mesh as SkinnedMesh).isSkinnedMesh) {
      // skinned bounds move with the animation; keep culling but with a generous sphere set by the caller
      mesh.frustumCulled = true;
    }
  }
  const box = new Box3().setFromObject(root);
  const size = new Vector3();
  box.getSize(size);
  const radius = Math.max(size.x, size.y, size.z) * 0.6 || 0.05;
  const extras = (root.children.find((c) => c.userData && Object.keys(c.userData).length)?.userData ?? gltf.scene.userData) as Record<string, unknown>;
  return { tier, root, bones, meshes, clips: gltf.animations, extras, radius, parser: gltf.parser };
}

export function disposeInstance(model: LoadedModel): void {
  model.root.removeFromParent();
  // geometries and materials are shared with the cache; nothing else to free per instance
}
