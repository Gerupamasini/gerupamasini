import { Group, LOD, Matrix4, Skeleton, SkinnedMesh, Sphere, Vector3, type Bone, type Material } from 'three';
import { MODEL_CW } from './anatomy';
import { LODS, buildTier, rigDefinition, type RigDef, type TierGeometry } from './geometry';
import { createBones } from './rig';

export { MODEL_CW };
/** camera distances (m, for the 35 mm model; scaled with size) where the tiers change when distance alone decides */
export const LOD1_AT = 0.45;
export const LOD2_AT = 1.8;

/** what the model needs of a look: the shell's material for a tier, the setae's, and freeing them */
export interface OsaganiLookLike {
  shellFor(tier: 0 | 1 | 2): Material;
  readonly setae: Material;
  dispose(): void;
}

let RIG: RigDef | null = null;
const TIERS: (TierGeometry | null)[] = [null, null, null];

export function osaganiRig(): RigDef {
  return (RIG ??= rigDefinition());
}

/** one tier's geometry, built once and shared by every crab */
export function osaganiGeometry(t: 0 | 1 | 2): TierGeometry {
  return (TIERS[t] ??= buildTier(osaganiRig(), LODS[t]));
}

export interface OsaganiModel<L extends OsaganiLookLike = OsaganiLookLike> {
  /** OsaganiRoot: the bones and the tiers under one group */
  root: Group;
  bones: Record<string, Bone>;
  /** one skeleton per tier shown, each over the bones that tier is skinned to (shared Bone objects) */
  skeletons: Skeleton[];
  lod: LOD;
  look: L;
  shells: SkinnedMesh[];
  setae: SkinnedMesh | null;
  tiers: (0 | 1 | 2)[];
}

const IDENTITY = new Matrix4();
/** (a generous sphere: the legs reach well out of the carapace, the male's claws far forward) */
const SPHERE = new Sphere(new Vector3(0, 0.01, 0.005), 0.065);

/**
 * One crab: its bones, its own materials and the tiers of shared geometry.
 *   OsaganiRoot
 *   ├── Armature: J_root ─ J_body ─ legs (P1…P5 × L/R × 6 articles, the female chela's dactylus), eyestalks, maxillipeds
 *   └── OsaganiLOD
 *       ├── LOD0 (hero): Shell (carapace with its teeth, grooves and ridges, body, segmented legs with spinules, both
 *       │                chelae, eyestalks, maxillipeds, antennules), Setae          — 67 bones (all but the root)
 *       ├── LOD1: Shell, coarser                                                    — 31 bones
 *       └── LOD2: Shell, one tube a leg                                             — 11 bones
 */
export function buildModel<L extends OsaganiLookLike>(look: L, tiers: (0 | 1 | 2)[] = [0, 1, 2]): OsaganiModel<L> {
  const rig = osaganiRig();
  const root = new Group();
  root.name = 'OsaganiRoot';
  const armature = new Group();
  armature.name = 'Armature';
  root.add(armature);
  const { bones } = createBones(rig, armature);
  const lod = new LOD();
  lod.name = 'OsaganiLOD';
  const shells: SkinnedMesh[] = [];
  const skeletons: Skeleton[] = [];
  let setae: SkinnedMesh | null = null;
  for (const t of tiers) {
    const geo = osaganiGeometry(t);
    const skeleton = new Skeleton(geo.bones.map((n) => bones[n]), geo.bones.map((n) => rig.defs[rig.byName[n]].inverse.clone()));
    skeletons.push(skeleton);
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
  return { root, bones, skeletons, lod, look, shells, setae, tiers };
}

/** show one tier (index into `tiers`) and hide the others (the driver chooses; the LOD object does not) */
export function showLevel(m: OsaganiModel, level: number): void {
  m.lod.levels.forEach((l, i) => { l.object.visible = i === level; });
}

/** free the crab's own parts (skeletons, materials; the geometry is shared) */
export function disposeModel(m: OsaganiModel): void {
  m.root.removeFromParent();
  for (const s of m.skeletons) s.dispose();
  m.look.dispose();
}
