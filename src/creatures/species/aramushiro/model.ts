import { Group, LOD, Matrix4, Mesh, Sphere, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODEL_SH } from './anatomy';
import { shellGeometry, type Lod } from './shell';
import { PART, PART_NAMES, farFootGeometry, softMergedGeometry, softPartGeometry } from './body';
import { aramushiroMaterials, type AramushiroMaterials, type Look } from './materials';
import { applyPose, poseUniforms, type AmPose } from './pose';

/** camera distances (m, for the 12 mm model; scaled with the snail) where the tiers change */
export const LOD1_AT = 0.2;
export const LOD2_AT = 1.4;

/** the soft parts reach about this far from the foot's middle (the proboscis everted, the siphon raised) */
const SOFT_BOUNDS = new Sphere(new Vector3(0, 0.3 * MODEL_SH, 0.25 * MODEL_SH), 1.65 * MODEL_SH);

let farGeo: BufferGeometry | null = null;
/** the far tier: the smooth shell and a stand-in for the foot, one geometry */
function farGeometry(): BufferGeometry {
  if (!farGeo) {
    farGeo = mergeGeometries([shellGeometry(2), farFootGeometry()])!;
    farGeo.name = 'AramushiroFar';
    farGeo.computeBoundingSphere();
  }
  return farGeo;
}

export interface AmModel {
  /** AramushiroRoot: the LOD, its levels and their parts */
  root: Group;
  lod: LOD;
  /** the shell mesh of each level (posed by matrix) */
  shells: Mesh[];
  mats: AramushiroMaterials;
  /** the shell's matrix this frame (shell frame → animal frame) */
  shellM: Matrix4;
  dispose(): void;
}

/**
 * One snail's model: AramushiroRoot → AramushiroLOD → LOD0 (Shell, SoftBody, Foot, Tentacle_L, Tentacle_R, Siphon,
 * Proboscis, Operculum), LOD1 (the shell and the soft parts in one mesh), LOD2 (one mesh). Geometry is shared by every
 * snail; the materials are the individual's (its colours, its pose).
 */
export function buildModel(look: Look, scale: number, tiers: Lod[] = [0, 1, 2]): AmModel {
  const pose = poseUniforms();
  const mats = aramushiroMaterials(look, scale, pose);
  const root = new Group();
  root.name = 'AramushiroRoot';
  const lod = new LOD();
  lod.name = 'AramushiroLOD';
  const shells: Mesh[] = [];
  for (const t of tiers) {
    const level = new Group();
    level.name = `AramushiroLOD${t}`;
    if (t === 0) {
      const shell = new Mesh(shellGeometry(0), mats.shell);
      shell.name = 'Shell';
      level.add(shell);
      shells.push(shell);
      for (const part of [PART.head, PART.foot, PART.tentacleL, PART.tentacleR, PART.siphon, PART.proboscis, PART.operculum]) {
        const geo = softPartGeometry(part);
        geo.boundingSphere = SOFT_BOUNDS;
        const m = new Mesh(geo, mats.soft);
        m.name = PART_NAMES[part];
        level.add(m);
      }
    } else if (t === 1) {
      const shell = new Mesh(shellGeometry(1), mats.shell);
      shell.name = 'Shell_LOD1';
      const geo = softMergedGeometry();
      geo.boundingSphere = SOFT_BOUNDS;
      const soft = new Mesh(geo, mats.soft);
      soft.name = 'Soft_LOD1';
      level.add(shell, soft);
      shells.push(shell);
    } else {
      const body = new Mesh(farGeometry(), mats.shell);
      body.name = 'Body_LOD2';
      level.add(body);
      shells.push(body);
    }
    for (const o of level.children) { o.castShadow = false; o.receiveShadow = false; }
    lod.addLevel(level, t === 0 ? 0 : t === 1 ? LOD1_AT : LOD2_AT, 0.15);
  }
  for (const s of shells) s.matrixAutoUpdate = false;
  root.add(lod);
  return { root, lod, shells, mats, shellM: new Matrix4(), dispose: () => mats.dispose() };
}

/** pose the model (all tiers) */
export function poseModel(m: AmModel, p: AmPose, time: number): void {
  applyPose(p, m.mats.pose, time, m.shellM);
  for (const s of m.shells) { s.matrix.copy(m.shellM); s.matrixWorldNeedsUpdate = true; }
}
