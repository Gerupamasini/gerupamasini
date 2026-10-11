import { Group, LOD, Matrix4, Mesh, Skeleton, SkinnedMesh, Sphere, Vector3, type Bone, type BufferGeometry, type Material } from 'three';
import { ML_MM } from './anatomy';
import { LODS, buildArms, buildBody, buildEye, buildFin, buildFunnel, buildTentacles, buildViscera, rigDefinition, type RigDef } from './geometry';
import { createBones } from './rig';
import type { MimiikaLook } from './materials';

/** model mantle length (m): the geometry is built for a 25 mm animal and scaled to the individual */
export const MODEL_ML = ML_MM / 1000;
/** camera distances (m, for the 25 mm model; scaled with size) where the tiers change */
export const LOD1_AT = 0.3;
export const LOD2_AT = 1.1;

export type PartName = 'Mantle' | 'Head' | 'Funnel' | 'Fin_L' | 'Fin_R' | 'Arms' | 'Tentacles' | 'Viscera';

interface TierGeometry {
  parts: [PartName, BufferGeometry, 'skin' | 'fin' | 'gut'][];
  eye: BufferGeometry;
}

let RIG: RigDef | null = null;
const TIERS: (TierGeometry | null)[] = [null, null, null];

export function mimiikaRig(): RigDef {
  return (RIG ??= rigDefinition());
}

/** one tier's geometry, built once and shared by every squid */
export function mimiikaGeometry(t: 0 | 1 | 2): TierGeometry {
  const cached = TIERS[t];
  if (cached) return cached;
  const rig = mimiikaRig(), lod = LODS[t];
  const body = buildBody(rig, lod);
  const parts: TierGeometry['parts'] = t < 2 ? [['Viscera', buildViscera(rig, lod), 'gut']] : [];
  parts.push(['Mantle', body.mantle, 'skin'], ['Head', body.head, 'skin']);
  if (lod.funnel) parts.push(['Funnel', buildFunnel(rig, lod), 'skin']);
  parts.push(['Fin_L', buildFin(rig, lod, 1), 'fin'], ['Fin_R', buildFin(rig, lod, -1), 'fin'], ['Arms', buildArms(rig, lod), 'skin']);
  if (lod.tentacles) parts.push(['Tentacles', buildTentacles(rig, lod), 'skin']);
  const g = { parts, eye: buildEye(lod) };
  TIERS[t] = g;
  return g;
}

export interface MimiikaModel {
  /** MimiIkaRoot: the skeleton (with the eyeballs on their bones) and the tiers under one group */
  root: Group;
  bones: Record<string, Bone>;
  skeleton: Skeleton;
  lod: LOD;
  look: MimiikaLook;
  /** the nearest tier's named parts */
  parts: Partial<Record<PartName, SkinnedMesh>>;
  /** Eye_L, Eye_R (rigid, under J_eye_L / J_eye_R; their geometry follows the tier shown) */
  eyes: [Mesh, Mesh];
  /** per tier: the tentacles' mesh (hidden while they are in their pockets) */
  tentacles: (SkinnedMesh | null)[];
  tiers: (0 | 1 | 2)[];
  level: number;
}

const IDENTITY = new Matrix4();
const SPHERE = new Sphere(new Vector3(0, 0, 0), 0.035);

/**
 * One squid: its skeleton, its own materials and three tiers of shared geometry.
 *   MimiIkaRoot
 *   ├── Armature: J_root ─ J_head ─ (J_eye_L ─ Eye_L) (J_eye_R ─ Eye_R) J_funnel, arm and tentacle chains; J_fin_L, J_fin_R
 *   └── MimiIkaLOD
 *       ├── LOD0: Viscera (seen through the mantle), Mantle, Head, Funnel, Fin_L, Fin_R, Arms, Tentacles
 *       ├── LOD1: the same, coarser
 *       └── LOD2: Mantle, Head, Fin_L, Fin_R, Arms (no funnel, no tentacles)
 */
export function buildModel(look: MimiikaLook, tiers: (0 | 1 | 2)[] = [0, 1, 2]): MimiikaModel {
  const rig = mimiikaRig();
  const root = new Group();
  root.name = 'MimiIkaRoot';
  const armature = new Group();
  armature.name = 'Armature';
  root.add(armature);
  const { bones, list } = createBones(rig, armature);
  const skeleton = new Skeleton(list, rig.defs.map((d) => d.inverse.clone()));
  const lod = new LOD();
  lod.name = 'MimiIkaLOD';
  const parts: MimiikaModel['parts'] = {};
  const tentacles: (SkinnedMesh | null)[] = [];
  for (const t of tiers) {
    const geo = mimiikaGeometry(t);
    const level = new Group();
    level.name = `LOD${t}`;
    let ten: SkinnedMesh | null = null;
    for (const [name, g, kind] of geo.parts) {
      const mat: Material = kind === 'gut' ? look.viscera : kind === 'fin' ? (t === 2 ? look.finsLow : look.fins) : t === 2 ? look.skinLow : look.skin;
      const m = new SkinnedMesh(g, mat);
      m.name = name;
      m.renderOrder = kind === 'fin' ? 2 : kind === 'gut' ? -1 : 0;
      m.bind(skeleton, IDENTITY);
      m.boundingSphere = SPHERE;
      m.frustumCulled = true;
      m.castShadow = false;
      m.receiveShadow = false;
      level.add(m);
      if (t === tiers[0]) parts[name] = m;
      if (name === 'Tentacles') ten = m;
    }
    tentacles.push(ten);
    lod.addLevel(level, t === 0 ? 0 : t === 1 ? LOD1_AT : LOD2_AT, 0.1);
  }
  root.add(lod);
  const g0 = mimiikaGeometry(tiers[0]).eye;
  const mk = (name: string, bone: string) => {
    const e = new Mesh(g0, tiers[0] === 2 ? look.eyesLow : look.eyes);
    e.name = name;
    e.frustumCulled = false;
    bones[bone].add(e);
    return e;
  };
  const eyes: [Mesh, Mesh] = [mk('Eye_L', 'J_eye_L'), mk('Eye_R', 'J_eye_R')];
  return { root, bones, skeleton, lod, look, parts, eyes, tentacles, tiers, level: 0 };
}

/** after the LOD has chosen a level (index into `tiers`): the eyes take that tier's ball, the tentacles show when out */
export function syncLevel(m: MimiikaModel, level: number, tentaclesOut: boolean): void {
  if (level !== m.level) {
    m.level = level;
    const t = m.tiers[Math.min(level, m.tiers.length - 1)];
    for (const e of m.eyes) { e.geometry = mimiikaGeometry(t).eye; e.material = t === 2 ? m.look.eyesLow : m.look.eyes; }
  }
  for (const ten of m.tentacles) if (ten) ten.visible = tentaclesOut;
}

/** free the squid's own parts (skeleton, materials; the geometry is shared) */
export function disposeModel(m: MimiikaModel): void {
  m.root.removeFromParent();
  m.skeleton.dispose();
  m.look.dispose();
}
