import { Bone, Group, LOD, Matrix4, Object3D, Skeleton, SkinnedMesh, Sphere, Vector3, type Material } from 'three';
import { BONES, MODEL_TL } from './anatomy';
import { amimehagiGeometry, rigRest, PART_KIND, type Lod, type PartName } from './geometry';
import { AmimehagiLook } from './materials';
import type { RigBones } from './pose';

/** camera distances (m, for a 40 mm fish; scaled with size) where the tiers change */
export const LOD1_AT = 0.75;
export const LOD2_AT = 3.6;
const IDENTITY = new Matrix4();
const SPHERE = new Sphere(new Vector3(), MODEL_TL * 0.75);

export interface AmimehagiModel {
  /** AmimehagiRoot: the skeleton's root bone and the tiers under one group */
  root: Group;
  bones: Bone[];
  rig: RigBones;
  lod: LOD;
  skeleton: Skeleton;
  look: AmimehagiLook;
  /** the near tier's named parts (Body, Head, Eye_L, …) */
  parts: Partial<Record<PartName, SkinnedMesh>>;
}

/**
 * One fish: its rig, its own materials and three tiers of shared geometry. The hierarchy is
 *   AmimehagiRoot
 *   ├── J_root (the skeleton)
 *   └── AmimehagiLOD
 *       ├── LOD0: Body, Head, Eye_L, Eye_R, DorsalFin, AnalFin, PectoralFin_L, PectoralFin_R, CaudalFin, DorsalSpine
 *       ├── LOD1: Body, Fins
 *       └── LOD2: Body
 * every mesh skinned to the same skeleton.
 */
export function buildModel(look: AmimehagiLook, tiers: Lod[] = [0, 1, 2]): AmimehagiModel {
  const rest = rigRest();
  const bones = BONES.map((name, i) => {
    const b = new Bone();
    b.name = name;
    const pi = rest.parent[i];
    b.position.copy(rest.world[i]);
    if (pi >= 0) b.position.sub(rest.world[pi]);
    return b;
  });
  BONES.forEach((_, i) => { const pi = rest.parent[i]; if (pi >= 0) bones[pi].add(bones[i]); });
  const skeleton = new Skeleton(bones, rest.inverses);
  const lod = new LOD();
  lod.name = 'AmimehagiLOD';
  const parts: Partial<Record<PartName, SkinnedMesh>> = {};
  for (const t of tiers) {
    const geo = amimehagiGeometry(t);
    const level = new Group();
    level.name = `LOD${t}`;
    for (const [name, g] of Object.entries(geo) as [PartName, NonNullable<(typeof geo)[PartName]>][]) {
      const kind = PART_KIND[name];
      const mat: Material = kind === 'eye' ? look.eyes : kind === 'fin' ? look.fins : t === 2 ? look.skinLow : look.skin;
      const m = new SkinnedMesh(g, mat);
      m.name = name;
      // fins after the body (transparent, no depth write)
      m.renderOrder = kind === 'fin' ? 2 : 0;
      m.bind(skeleton, IDENTITY);
      m.boundingSphere = SPHERE;
      m.castShadow = false;
      m.receiveShadow = false;
      // skinned meshes are kept from frustum culling by their (approximate) sphere: the LOD group decides visibility
      m.frustumCulled = true;
      level.add(m);
      if (t === tiers[0]) parts[name] = m;
    }
    lod.addLevel(level, t === 0 ? 0 : t === 1 ? LOD1_AT : LOD2_AT, 0.12);
  }
  const by = (n: (typeof BONES)[number]) => bones[BONES.indexOf(n)];
  const rig: RigBones = {
    head: by('J_head'), trunk: [by('J_sp1'), by('J_sp2'), by('J_ped'), by('J_tail')], jaw: by('J_jaw'),
    eyeL: by('J_eye_L'), eyeR: by('J_eye_R'), spine: by('J_spine'), flap: by('J_flap'),
    pecL: by('J_pec_L'), pecL2: by('J_pec_L2'), pecR: by('J_pec_R'), pecR2: by('J_pec_R2'), cauU: by('J_cau_U'), cauL: by('J_cau_L'),
    dor: [0, 1, 2, 3, 4, 5, 6].map((i) => by(`J_dor${i}` as (typeof BONES)[number])),
    ana: [0, 1, 2, 3, 4, 5, 6].map((i) => by(`J_ana${i}` as (typeof BONES)[number])),
    dorsalAxes: rest.dorsalAxes, analAxes: rest.analAxes, pecBase: rest.pecBase,
  };
  const root = new Group();
  root.name = 'AmimehagiRoot';
  root.add(bones[0], lod);
  return { root, bones, rig, lod, skeleton, look, parts };
}

/** Free the fish's own parts (its skeleton and materials; the geometry is shared). */
export function disposeModel(m: AmimehagiModel): void {
  m.root.removeFromParent();
  m.skeleton.dispose();
  m.look.dispose();
}

/** walk the tiers' meshes */
export function meshesOf(m: AmimehagiModel): Object3D[] {
  const out: Object3D[] = [];
  m.lod.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) out.push(o); });
  return out;
}
