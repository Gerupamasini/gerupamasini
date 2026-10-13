import { Group, LOD, Matrix4, Skeleton, SkinnedMesh, Sphere, Vector3, type Bone, type Material } from 'three';
import { MODEL_CW } from './anatomy';
import { LODS, buildTier, rigDefinition, type RigDef, type TierGeometry } from './geometry';
import { createBones } from './rig';

export { MODEL_CW };
/** camera distances (m, for the 100 mm model; scaled with size) where the tiers change */
export const LOD1_AT = 0.85;
export const LOD2_AT = 2.6;

/** what the model needs of a look: the shell's material for a tier, the setae's, and freeing them */
export interface GazamiLookLike {
  shellFor(tier: 0 | 1 | 2): Material;
  readonly setae: Material;
  dispose(): void;
}

let RIG: RigDef | null = null;
const TIERS: (TierGeometry | null)[] = [null, null, null];

export function gazamiRig(): RigDef {
  return (RIG ??= rigDefinition());
}

/** one tier's geometry, built once and shared by every crab */
export function gazamiGeometry(t: 0 | 1 | 2): TierGeometry {
  return (TIERS[t] ??= buildTier(gazamiRig(), LODS[t]));
}

export interface GazamiModel<L extends GazamiLookLike = GazamiLookLike> {
  /** GazamiRoot: the skeleton and the tiers under one group */
  root: Group;
  bones: Record<string, Bone>;
  skeleton: Skeleton;
  lod: LOD;
  look: L;
  /** per tier shown: the shell (and on the top tier the setae) */
  shells: SkinnedMesh[];
  setae: SkinnedMesh | null;
  tiers: (0 | 1 | 2)[];
  level: number;
}

const IDENTITY = new Matrix4();
/** (a generous sphere: the legs reach well out of the carapace and the swimming crab tilts) */
const SPHERE = new Sphere(new Vector3(0, 0.01, 0), 0.11);

/**
 * One crab: its skeleton, its own materials and the tiers of shared geometry.
 *   GazamiRoot
 *   ├── Armature: J_root ─ J_body ─ legs (P1…P5 × L/R × 6 articles), eyes, antennae, antennules, third maxillipeds
 *   └── GazamiLOD
 *       ├── LOD0: Shell (carapace with every tooth, body, legs with spines, fingers' teeth, eyes, mouthparts), Setae
 *       ├── LOD1: Shell, coarser (teeth and spines kept: the outline is the species)
 *       └── LOD2: Shell, coarse (the teeth as triangles, the lateral spines, the claws and the paddles kept)
 */
export function buildModel<L extends GazamiLookLike>(look: L, tiers: (0 | 1 | 2)[] = [0, 1, 2]): GazamiModel<L> {
  const rig = gazamiRig();
  const root = new Group();
  root.name = 'GazamiRoot';
  const armature = new Group();
  armature.name = 'Armature';
  root.add(armature);
  const { bones, list } = createBones(rig, armature);
  const skeleton = new Skeleton(list, rig.defs.map((d) => d.inverse.clone()));
  const lod = new LOD();
  lod.name = 'GazamiLOD';
  const shells: SkinnedMesh[] = [];
  let setae: SkinnedMesh | null = null;
  for (const t of tiers) {
    const geo = gazamiGeometry(t);
    const level = new Group();
    level.name = `LOD${t}`;
    const m = new SkinnedMesh(geo.shell, look.shellFor(t));
    m.name = 'Shell';
    m.bind(skeleton, IDENTITY);
    m.boundingSphere = SPHERE;
    m.castShadow = false;
    m.receiveShadow = false;
    level.add(m);
    shells.push(m);
    if (geo.setae) {
      const s = new SkinnedMesh(geo.setae, look.setae);
      s.name = 'Setae';
      s.bind(skeleton, IDENTITY);
      s.boundingSphere = SPHERE;
      s.renderOrder = 1;
      s.castShadow = false;
      level.add(s);
      if (t === tiers[0]) setae = s;
    }
    lod.addLevel(level, t === 0 ? 0 : t === 1 ? LOD1_AT : LOD2_AT, 0.1);
  }
  root.add(lod);
  return { root, bones, skeleton, lod, look, shells, setae, tiers, level: 0 };
}

/** after the LOD has chosen a level (index into `tiers`) */
export function syncLevel(m: GazamiModel, level: number): void {
  m.level = level;
}

/** free the crab's own parts (skeleton, materials; the geometry is shared) */
export function disposeModel(m: GazamiModel): void {
  m.root.removeFromParent();
  m.skeleton.dispose();
  m.look.dispose();
}
