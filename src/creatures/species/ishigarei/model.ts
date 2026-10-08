import { Group, LOD, Matrix4, Mesh, Object3D, Skeleton, SkinnedMesh, Sphere, Vector3, type Bone, type BufferGeometry, type Material } from 'three';
import { EYES, S_ROOT, TL_MM } from './anatomy.js';
import { LODS, buildBody, buildEye, buildFins, rigDefinition } from './geometry.js';
import { createBones } from './rig.js';
import type { IshigareiLook } from './materials';

/** model length (m): the geometry is built for a 70 mm fish and scaled to the individual */
export const MODEL_TL = TL_MM / 1000;
/** camera distances (m, for the 70 mm model; scaled with size) where the tiers change */
export const LOD1_AT = 0.32;
export const LOD2_AT = 1.3;

export type PartName = 'Body' | 'Head' | 'DorsalFin' | 'AnalFin' | 'Tail' | 'PectoralFins' | 'PelvicFins' | 'MarginalFins';

interface TierGeometry {
  parts: [PartName, BufferGeometry, 'skin' | 'fin'][];
  eyes: (BufferGeometry | null)[];
}

let RIG: ReturnType<typeof rigDefinition> | null = null;
const TIERS: (TierGeometry | null)[] = [null, null, null];

/** the skeleton's definition (shared) */
export function ishigareiRig(): ReturnType<typeof rigDefinition> {
  return (RIG ??= rigDefinition());
}

/** one tier's geometry, built once and shared by every fish */
export function ishigareiGeometry(t: 0 | 1 | 2): TierGeometry {
  const cached = TIERS[t];
  if (cached) return cached;
  const rig = ishigareiRig(), lod = LODS[t];
  const b = buildBody(rig, lod), fins = buildFins(rig, lod);
  const parts: TierGeometry['parts'] = [['Body', b.body, 'skin']];
  if (b.head) parts.push(['Head', b.head, 'skin']);
  if (fins.all) parts.push(['MarginalFins', fins.all, 'fin']);
  else {
    parts.push(['DorsalFin', fins.dorsal, 'fin'], ['AnalFin', fins.anal, 'fin'], ['Tail', fins.tail, 'fin'], ['PectoralFins', fins.pectoral, 'fin'], ['PelvicFins', fins.pelvic, 'fin']);
  }
  const g = { parts, eyes: EYES.map((e: (typeof EYES)[number]) => buildEye(e, lod)) };
  TIERS[t] = g;
  return g;
}

export interface IshigareiModel {
  /** IshigareiJuvenileRoot: the skeleton and the tiers under one group */
  root: Group;
  bones: Record<string, Bone>;
  skeleton: Skeleton;
  lod: LOD;
  look: IshigareiLook;
  /** the near tier's named parts */
  parts: Partial<Record<PartName, SkinnedMesh>>;
  /** Eye_UpperSide_1 (lower eye) and Eye_UpperSide_2 (upper, migrated eye) of every tier: they follow the eye bones */
  eyeNodes: Object3D[][];
}

const IDENTITY = new Matrix4();
const SPHERE = new Sphere(new Vector3(0, 0, (S_ROOT - 32) / 1000), 0.05);

/**
 * One fish: its skeleton, its own materials and three tiers of shared geometry.
 *   IshigareiJuvenileRoot
 *   ├── Armature (J_root → J_head, J_sp1 … J_caudal2; jaws, eyes, fin rays)
 *   └── IshigareiLOD
 *       ├── LOD0: Body, Head (with the lips), Eye_UpperSide_1, Eye_UpperSide_2, DorsalFin, AnalFin, Tail, PectoralFins, PelvicFins
 *       ├── LOD1: the same, coarser
 *       └── LOD2: Body (head included), MarginalFins
 */
export function buildModel(look: IshigareiLook, tiers: (0 | 1 | 2)[] = [0, 1, 2]): IshigareiModel {
  const rig = ishigareiRig();
  const root = new Group();
  root.name = 'IshigareiJuvenileRoot';
  const armature = new Group();
  armature.name = 'Armature';
  root.add(armature);
  const { bones, list } = createBones(rig, armature) as { bones: Record<string, Bone>; list: Bone[] };
  const skeleton = new Skeleton(list, rig.defs.map((d: { inverse: Matrix4 }) => d.inverse.clone()));
  const lod = new LOD();
  lod.name = 'IshigareiLOD';
  const parts: Partial<Record<PartName, SkinnedMesh>> = {};
  const eyeNodes: Object3D[][] = [];
  for (const t of tiers) {
    const geo = ishigareiGeometry(t);
    const level = new Group();
    level.name = `LOD${t}`;
    for (const [name, g, kind] of geo.parts) {
      const mat: Material = kind === 'fin' ? look.fins : t === 2 ? look.skinLow : look.skin;
      const m = new SkinnedMesh(g, mat);
      m.name = name;
      m.renderOrder = kind === 'fin' ? 2 : 0;
      m.bind(skeleton, IDENTITY);
      m.boundingSphere = SPHERE;
      m.frustumCulled = true;
      m.castShadow = false;
      m.receiveShadow = false;
      level.add(m);
      if (t === tiers[0]) parts[name] = m;
    }
    const nodes: Object3D[] = [];
    geo.eyes.forEach((g, i) => {
      if (!g) return;
      const node = new Group();
      node.name = EYES[i].name;
      node.matrixAutoUpdate = false;
      node.userData.bone = EYES[i].bone;
      const ball = new Mesh(g, look.eyes);
      ball.name = `${EYES[i].name}_ball`;
      ball.frustumCulled = false;
      node.add(ball);
      level.add(node);
      nodes.push(node);
    });
    eyeNodes.push(nodes);
    lod.addLevel(level, t === 0 ? 0 : t === 1 ? LOD1_AT : LOD2_AT, 0.1);
  }
  root.add(lod);
  return { root, bones, skeleton, lod, look, parts, eyeNodes };
}

const _m = new Matrix4();
/** after the bones have moved: the eyeballs follow their bones (in the model root's frame) */
export function syncEyes(m: IshigareiModel): void {
  m.root.updateMatrixWorld(true);
  _m.copy(m.root.matrixWorld).invert();
  for (const nodes of m.eyeNodes) for (const n of nodes) {
    if (!n.parent?.visible && nodes !== m.eyeNodes[0]) continue;
    n.matrix.multiplyMatrices(_m, m.bones[n.userData.bone as string].matrixWorld);
    n.matrixWorldNeedsUpdate = true;
  }
}

/** free the fish's own parts (skeleton, materials; the geometry is shared) */
export function disposeModel(m: IshigareiModel): void {
  m.root.removeFromParent();
  m.skeleton.dispose();
  m.look.dispose();
}
