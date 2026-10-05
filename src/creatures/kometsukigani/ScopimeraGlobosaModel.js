import { Group, IcosahedronGeometry, Matrix4, Mesh, SkinnedMesh, Sphere, Vector3 } from 'three';
import { crabGeometry } from './ScopimeraGlobosaGeometry.js';
import { createRigInstance } from './ScopimeraGlobosaRig.js';
import { crabPalette, makeExoskeletonMaterial, makePelletMaterial, makeSetaeMaterial } from './ScopimeraGlobosaMaterial.js';
import { CHELIPED, PELLET } from './ScopimeraGlobosaMorphology.js';
import { mulberry } from './util.js';

const IDENT = new Matrix4();
/** generous bounds in CW units (legs spread, chelae raised); the crab culls itself, not the skinning */
const BOUNDS = new Sphere(new Vector3(0, 0.35, 0.1), 1.9);
let PELLET_GEO = null;
export function pelletGeometry(detail = 2) {
  if (!PELLET_GEO) PELLET_GEO = [new IcosahedronGeometry(1, 0), new IcosahedronGeometry(1, 1), new IcosahedronGeometry(1, 2)];
  return PELLET_GEO[detail];
}

/**
 * One crab's renderable: CrabRoot (scaled to the carapace width in metres) holding the bone hierarchy and three
 * skinned meshes (LOD0 close-up with setae, LOD1 near, LOD2 far) that share one skeleton; only one is visible.
 * Geometry is shared by every crab; materials are per crab (uniforms) but compile to one program.
 */
export class CrabModel {
  /**
   * @param {{ sex: 'm'|'f', cw_m: number, seed: number, juvenile?: number, ovigerous?: boolean }} o
   */
  constructor({ sex, cw_m, seed, juvenile = 0 }) {
    this.sex = sex;
    this.cw = cw_m;
    this.rig = createRigInstance();
    this.root = new Group();
    this.root.name = 'CrabRoot';
    this.root.add(this.rig.root);
    this.root.scale.setScalar(cw_m);
    const rand = mulberry(seed);
    this.palette = crabPalette(rand, sex);
    this.mat = makeExoskeletonMaterial({ lod: 0 });
    this.setaeMat = makeSetaeMaterial();
    for (const m of [this.mat, this.setaeMat]) {
      const u = m.userData.uniforms;
      u.uKgSeed.value.set(this.palette.patternSeed, this.palette.colorSeed, this.palette.purple, this.palette.pale);
      u.uKgTint.value.copy(this.palette.tint);
      u.uKgDark.value.copy(this.palette.dark);
      u.uKgMorph.value.x = this.palette.red ?? 0;
      u.uKgMorph.value.z = this.palette.cover ?? 0.6;
      u.uKgFeed.value.z = juvenile;
      u.uKgState.value.w = cw_m;
    }
    this.lods = [0, 1, 2].map((lod) => {
      const g = crabGeometry(lod);
      const mesh = new SkinnedMesh(g.body, this.mat);
      mesh.name = `ScopimeraGlobosa_LOD${lod}`;
      mesh.bind(this.rig.skeleton, IDENT);
      mesh.boundingSphere = BOUNDS.clone();
      mesh.frustumCulled = true;
      mesh.visible = lod === 1;
      this.root.add(mesh);
      return mesh;
    });
    const sg = crabGeometry(0).setae;
    this.setae = new SkinnedMesh(sg, this.setaeMat);
    this.setae.name = 'ScopimeraGlobosa_setae';
    this.setae.bind(this.rig.skeleton, IDENT);
    this.setae.boundingSphere = BOUNDS.clone();
    this.setae.visible = false;
    this.root.add(this.setae);
    this.lod = 1;
    // sexual dimorphism: abdomen shape, and the male's longer chelipeds [L]
    this.rig.abdomen[sex === 'm' ? 'f' : 'm'].scale.setScalar(1e-4);
    const cs = sex === 'm' ? CHELIPED.maleScale * (0.85 + 0.15 * (1 - juvenile)) : 1;
    for (const c of this.rig.chelae) { c.bones[0].scale.setScalar(cs); c.scale = cs; }
    // the pellet growing at the mouth and the one a cheliped carries away
    this.pelletMat = makePelletMaterial({ detail: 1 });
    this.pelletMat.userData.uniforms.uPelScale.value = cw_m * 0.12;
    this.mouthPellet = new Mesh(pelletGeometry(2), this.pelletMat);
    this.mouthPellet.name = 'mouth-pellet';
    this.mouthPellet.visible = false;
    this.rig.mouth.add(this.mouthPellet);
    this.carried = new Mesh(pelletGeometry(2), this.pelletMat);
    this.carried.name = 'carried-pellet';
    this.carried.visible = false;
    this.root.add(this.carried);
    this.pelletDiam = PELLET.feedDiam[0] + (PELLET.feedDiam[1] - PELLET.feedDiam[0]) * rand();
    this.castShadow = false;
  }

  /** recolour (palette as made by crabPalette / paletteFor) */
  applyPalette(p) {
    if (!p) return;
    this.palette = { ...this.palette, ...p };
    for (const m of [this.mat, this.setaeMat]) {
      const u = m.userData.uniforms;
      u.uKgSeed.value.set(this.palette.patternSeed, this.palette.colorSeed, this.palette.purple, this.palette.pale);
      u.uKgTint.value.copy(this.palette.tint);
      u.uKgDark.value.copy(this.palette.dark);
      u.uKgMorph.value.x = this.palette.red ?? 0;
      u.uKgMorph.value.z = this.palette.cover ?? 0.6;
    }
  }

  /** the sand the crab works (its mouth pellet is made of it) — linear colour */
  setSandColor(c) {
    this.pelletMat.userData.uniforms.uPelSand.value.copy(c);
  }

  setLod(lod) {
    if (lod === this.lod) return;
    this.lod = lod;
    this.lods.forEach((m, i) => { m.visible = i === lod; });
    this.setae.visible = lod === 0;
    this.mat.userData.uniforms.uKgState.value.z = lod === 0 ? 1 : lod === 1 ? 0.6 : 0.2;
  }

  setShadows(on) {
    if (on === this.castShadow) return;
    this.castShadow = on;
    for (const m of this.lods) { m.castShadow = on; m.receiveShadow = on; }
    this.setae.castShadow = on;
    this.mouthPellet.castShadow = this.carried.castShadow = on;
  }

  setVisible(v) { this.root.visible = v; }

  /** wetness 0..1, sand coat 0..1, fingertip sand 0..1, mouth wetness 0..1 */
  setSurface(wet, sand, tipSand, mouthWet) {
    for (const m of [this.mat, this.setaeMat]) {
      const u = m.userData.uniforms;
      u.uKgState.value.x = wet;
      u.uKgState.value.y = sand;
      u.uKgFeed.value.x = tipSand;
      u.uKgFeed.value.y = mouthWet;
    }
  }

  /** the pellet at the mouth: growth 0..1 (radius in CW at full size = half the pellet diameter) */
  setMouthPellet(growth) {
    const p = this.mouthPellet;
    p.visible = growth > 0.04;
    const r = (this.pelletDiam * 0.5) * Math.cbrt(Math.max(0, growth));
    p.scale.setScalar(Math.max(1e-4, r));
    p.position.set(0, r * 0.4, r * 0.8);
  }

  dispose() {
    this.root.removeFromParent();
    this.mat.dispose();
    this.setaeMat.dispose();
    this.pelletMat.dispose();
    this.rig.skeleton.dispose();
  }
}
