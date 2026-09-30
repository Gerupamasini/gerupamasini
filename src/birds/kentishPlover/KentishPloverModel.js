import * as THREE from 'three';
import { KentishPloverConfig as CFG } from './KentishPloverConfig.js';
import { buildSkeletonSpec, createBones } from './anatomy/skeleton.js';
import { buildBodyGeometry, getBodySDF } from './anatomy/bodyMesh.js';
import { buildFeatherGeometry } from './anatomy/feathers.js';
import { buildBareParts, buildEyes } from './anatomy/bareParts.js';
import { createBodyMaterial, createFeatherMaterial, createBarePartsMaterial, createEyeMaterials, getPalette } from './KentishPloverMaterials.js';

// Geometry is generated once per LOD and shared by every bird; each bird owns a skeleton and its
// own material instances (same shader programs, different uniforms for plumage variation).

let SPEC = null;
const GEO = new Map();

export function getSpec() {
  if (!SPEC) {
    SPEC = buildSkeletonSpec(CFG);
    SPEC.boneNames = SPEC.specs.map((s) => s.name);
    SPEC.boneIndex = Object.fromEntries(SPEC.boneNames.map((n, i) => [n, i]));
  }
  return SPEC;
}

export function getGeometries(detail) {
  if (GEO.has(detail)) return GEO.get(detail);
  const spec = getSpec();
  const sdf = getBodySDF(CFG);
  const res = CFG.lod.sdfResolution[detail];
  const g = {
    body: buildBodyGeometry(CFG, spec.boneIndex, res),
    feathers: buildFeatherGeometry(spec, spec.boneIndex, sdf, detail),
    bare: buildBareParts(spec.boneIndex, CFG.joints, spec.toes, detail),
    eyes: detail === 0 ? buildEyes(spec.boneIndex, CFG.joints, { segA: 10, segR: 24 }) : detail === 1 ? buildEyes(spec.boneIndex, CFG.joints, { segA: 4, segR: 12 }) : null,
  };
  GEO.set(detail, g);
  return g;
}

const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 0.05, 0), 0.26);

export class KentishPloverModel {
  /**
   * @param {object} o
   * @param {string} o.palette  maleBreeding | femaleBreeding | nonBreeding
   * @param {object} o.individual  individual variation values (see KentishPlover.js)
   * @param {number[]} o.lods  which detail levels to build (default 0,1,2)
   */
  constructor({ palette = 'maleBreeding', individual = {}, lods = [0, 1, 2], shadows = true } = {}) {
    const spec = getSpec();
    this.spec = spec;
    this.object = new THREE.Group();
    this.object.name = 'KentishPlover';
    const { bones, list, root } = createBones(spec);
    this.bones = bones;
    this.boneList = list;
    this.object.add(root);
    this.object.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(list);
    this.pal = getPalette(palette);
    this.individual = individual;
    this.materials = [];
    this.lods = {};
    for (const d of lods) this.lods[d] = this._buildLOD(d, shadows);
    this.level = -1;
    this.setLOD(lods[0]);
  }

  _skinned(geo, mat, name, shadows) {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.name = name;
    m.bind(this.skeleton);
    m.boundingSphere = BOUNDS.clone();
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    this.object.add(m);
    return m;
  }

  _buildLOD(detail, shadows) {
    const g = getGeometries(detail);
    const ind = this.individual;
    const body = createBodyMaterial(this.pal, ind, detail);
    const feathers = createFeatherMaterial(this.pal, ind, detail);
    const bare = createBarePartsMaterial(this.pal, detail);
    const meshes = [this._skinned(g.body, body, `body${detail}`, shadows), this._skinned(g.feathers, feathers, `feathers${detail}`, shadows), this._skinned(g.bare, bare, `bare${detail}`, shadows)];
    let eyeMats = null;
    if (g.eyes) {
      eyeMats = createEyeMaterials(this.pal);
      meshes.push(this._skinned(g.eyes.eyeball, eyeMats.eyeball, `eyeball${detail}`, false));
      if (detail === 0) {
        // cornea catch-light and lids/nictitating membrane only where they can be resolved
        const c = this._skinned(g.eyes.cornea, eyeMats.cornea, `cornea${detail}`, false);
        c.renderOrder = 2;
        meshes.push(c);
        meshes.push(this._skinned(g.eyes.lids, eyeMats.lids, `lids${detail}`, false));
      }
    }
    this.materials.push(body, feathers, bare);
    return { meshes, body, feathers, bare, eyeMats };
  }

  setLOD(level) {
    if (level === this.level) return;
    for (const [d, lod] of Object.entries(this.lods)) {
      const on = Number(d) === level;
      lod.meshes.forEach((m) => (m.visible = on));
    }
    this.level = level;
  }

  get current() {
    return this.lods[this.level];
  }

  setVisible(v) {
    this.object.visible = v;
  }

  /** Eye lid state for the current LOD (lower lid closure, nictitating membrane 0..1). */
  setEyelids(closeL, closeR, nictL, nictR) {
    const em = this.current?.eyeMats;
    if (!em) return;
    em.lids.userData.uniforms.uLidClose.value.set(closeL, closeR);
    em.lids.userData.uniforms.uNict.value.set(nictL, nictR);
  }

  /** Wing openness for the feather shader (underwing colour of the arm surface). */
  setWingFold(v) {
    const f = this.current?.feathers;
    if (f) f.userData.uniforms.uFold.value = v;
  }

  setFluff(v) {
    const b = this.current?.body;
    if (b) b.userData.uniforms.uFluff.value = v;
  }

  /** Breathing: −1..1 cycle value; displacement is masked to the chest/flanks in the shader. */
  setBreath(v) {
    const b = this.current?.body;
    if (b) b.userData.uniforms.uBreath.value = v;
  }

  dispose() {
    this.materials.forEach((m) => m.dispose());
  }
}
