import { Bone, Box3, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, SkinnedMesh, Vector3, type AnimationClip, type Material } from 'three';
import { GLTFLoader, type GLTF, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

export type Tier = 'hero' | 'lod1' | 'lod2';

/** Asset URLs keyed by path relative to src/assets/models (e.g. "mahaze/mahaze_juvenile.lod2.glb"). */
const MODEL_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../../assets/models/**/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
    .map(([k, v]) => [k.replace(/^.*\/assets\/models\//, ''), v]),
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

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function preloadModel(rel: string): Promise<GLTF> {
  let p = cache.get(rel);
  if (!p) {
    p = loader.loadAsync(modelUrl(rel)).then((gltf) => {
      prepareMaterials(gltf, rel.includes('.hero.') ? 'hero' : rel.includes('.lod1.') ? 'lod1' : 'lod2');
      return gltf;
    });
    cache.set(rel, p);
  }
  return p;
}

export function isModelLoaded(rel: string): boolean {
  return cache.has(rel);
}

/** Tier-dependent material adjustments on the shared (cached) materials. */
function prepareMaterials(gltf: GLTF, tier: Tier): void {
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
    for (const m of mats) {
      const pm = m as MeshPhysicalMaterial;
      // a surface laid over another one (e.g. a skin patch on the skin it merges into) wins the depth test there
      if ((m.userData?.tobihaze as { overlay?: boolean } | undefined)?.overlay || m.userData?.overlay) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = -1;
        m.polygonOffsetUnits = -2;
      }
      if (tier !== 'hero' && pm.isMeshPhysicalMaterial) {
        // transmission needs an extra scene pass; keep it for the observed hero only
        pm.transmission = 0;
        pm.thickness = 0;
      }
      if (tier === 'lod2') {
        pm.clearcoat = 0;
        if (pm.transparent && pm.alphaTest === 0) { pm.transparent = false; pm.alphaTest = 0.5; }
      }
      const sm = m as MeshStandardMaterial;
      sm.envMapIntensity = 0.8;
    }
    mesh.castShadow = tier !== 'lod2';
    mesh.receiveShadow = false;
  });
}

/** Instantiate a loaded model (skeleton-aware clone). Materials are shared. */
export async function instantiateModel(rel: string): Promise<LoadedModel> {
  const gltf = await preloadModel(rel);
  const tier: Tier = rel.includes('.hero.') ? 'hero' : rel.includes('.lod1.') ? 'lod1' : 'lod2';
  const root = skeletonClone(gltf.scene);
  const bones: Record<string, Bone> = {};
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Bone).isBone) bones[o.name] = o as Bone;
    if ((o as Mesh).isMesh) {
      const mesh = o as Mesh;
      meshes.push(mesh);
      // keep the species extras on the mesh so drivers still find them after a material swap
      const mx = ((Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material).userData?.mahaze;
      if (mx) mesh.userData.mahaze = mx;
      if ((mesh as SkinnedMesh).isSkinnedMesh) {
        // skinned bounds move with the animation; keep culling but with a generous sphere set by the caller
        mesh.frustumCulled = true;
      }
    }
  });
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
