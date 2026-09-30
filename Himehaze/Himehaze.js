// Himehaze: procedural, rigged, LOD'd ヒメハゼ (Favonigobius gymnauchen) for Three.js.
//
//   const fish = new Himehaze({ seed: 7, sex: 'male', breeding: true });
//   scene.add(fish);
//   fish.animator.update(dt, command); fish.updateLOD(camera);
//
// Frame: +X anterior, +Y dorsal. Units: metres. Root origin ≈ pelvic disc / centre of mass.
import * as THREE from 'three';
import { DEFAULT_TL, SPECIES } from './model/anatomy.js';
import { buildBody, buildFin, finDefs, bonePositions, BONE_NAMES, eyeCentre } from './model/HimehazeGeometry.js';
import { ROOT_S } from './model/anatomy.js';
import { createMaterials } from './materials/HimehazeMaterials.js';
import { mulberry32 } from './textures/HimehazeTextures.js';
import { HimehazeAnimator } from './HimehazeAnimator.js';

export const LOD_LEVELS = [
  { name: 'LOD0', maxDist: 0.35, rings: 170, radial: 72, finSeg: 12, finSub: 4, rays: true, cornea: 'physical' },
  { name: 'LOD1', maxDist: 1.2, rings: 96, radial: 40, finSeg: 7, finSub: 2, rays: true, cornea: 'cheap' },
  { name: 'LOD2', maxDist: 4.0, rings: 48, radial: 22, finSeg: 4, finSub: 1, rays: false, cornea: 'none' },
  { name: 'LOD3', maxDist: Infinity, rings: 24, radial: 12, finSeg: 2, finSub: 1, rays: false, cornea: 'none' },
];

// Individual variation: small (±2-6 %) so individuals differ without looking like another species.
export function makeVariation(seed, opts = {}) {
  const r = mulberry32(seed * 2654435761);
  const j = (amt) => 1 + (r() * 2 - 1) * amt;
  const male = opts.sex ? opts.sex === 'male' : r() < 0.5;
  return {
    seed,
    male,
    breeding: opts.breeding ?? false,
    TL: (opts.TL ?? DEFAULT_TL) * j(0.06),
    thickness: j(0.04),
    width: j(0.04),
    headScale: j(0.03) * (male ? 1.02 : 1.0),    // G: slight male head robustness (common in gobies, R)
    eyeScale: j(0.04),
    blotch: 0.85 + r() * 0.25,
    spot: 0.8 + r() * 0.3,
    finTint: (r() * 2 - 1) * 0.03,
    brightness: 0.92 + r() * 0.14,
    finScale: j(0.04) * (male ? 1.04 : 1.0),
    caudalShape: r() * 2 - 1,
    whiteLines: r() < 0.35,                       // F: "occasionally" narrow white lines low on sides
  };
}

export class Himehaze extends THREE.Group {
  constructor(opts = {}) {
    super();
    this.name = `Himehaze_${opts.seed ?? 1}`;
    this.userData.species = SPECIES;
    this.variation = makeVariation(opts.seed ?? 1, opts);
    const v = this.variation;
    this.TL = v.TL;
    this.materials = createMaterials(v, opts.quality ?? 'high');

    // --- skeleton ---
    const bp = bonePositions(v);
    this.bones = {};
    const bonesArr = BONE_NAMES.map((n) => { const b = new THREE.Bone(); b.name = n; this.bones[n] = b; return b; });
    for (const n of BONE_NAMES) {
      const [s, y, z, parent] = bp[n];
      const b = this.bones[n];
      const wx = (ROOT_S - s) * v.TL, wy = y * v.TL, wz = z * v.TL;
      b.userData.world = new THREE.Vector3(wx, wy, wz);
      if (parent) {
        const pw = this.bones[parent].userData.world;
        b.position.set(wx - pw.x, wy - pw.y, wz - pw.z);
        this.bones[parent].add(b);
      } else b.position.set(wx, wy, wz);
    }
    this.add(this.bones.Root);
    this.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(bonesArr);
    this.restQuat = Object.fromEntries(BONE_NAMES.map((n) => [n, this.bones[n].quaternion.clone()]));
    this.restScale = Object.fromEntries(BONE_NAMES.map((n) => [n, this.bones[n].scale.clone()]));

    // --- LOD mesh sets, all bound to one skeleton ---
    this.lods = LOD_LEVELS.map((L) => this._buildLevel(L));
    this.lods.forEach((g) => this.add(g));

    // --- eyes (attached to eye bones; shared by all LODs) ---
    this.eyes = [this._buildEye(-1), this._buildEye(1)];

    // Distance from root origin down to the ventral contact surface (pelvic disc / belly), metres.
    this.contactOffset = 0.071 * v.TL;
    this.forcedLOD = null;
    this.currentLOD = -1;
    this.setLOD(0);
    this.animator = new HimehazeAnimator(this);
  }

  _buildLevel(L) {
    const v = this.variation;
    const g = new THREE.Group();
    g.name = L.name;
    const body = new THREE.SkinnedMesh(buildBody(v, L), this.materials.body);
    body.name = 'Body'; body.castShadow = true; body.receiveShadow = true;
    body.frustumCulled = false;
    g.add(body);
    const defs = finDefs(v);
    for (const [key, def] of Object.entries(defs)) {
      const { membrane, rays } = buildFin(def, v, L);
      const matKey = def.kind;
      const m = new THREE.SkinnedMesh(membrane, this.materials.fins[matKey]);
      m.name = `Fin_${key}`; m.castShadow = L.rays; m.renderOrder = 2; m.frustumCulled = false;
      g.add(m);
      if (rays) {
        const r = new THREE.SkinnedMesh(rays, this.materials.ray);
        r.name = `FinRays_${key}`; r.renderOrder = 1; r.frustumCulled = false;
        g.add(r);
      }
    }
    g.traverse((o) => { if (o.isSkinnedMesh) o.bind(this.skeleton, new THREE.Matrix4()); });
    g.userData.level = L;
    return g;
  }

  _buildEye(side) {
    const v = this.variation;
    const e = eyeCentre(v, side);
    const R = e.R * v.TL;
    const bone = this.bones[side > 0 ? 'Eye_R' : 'Eye_L'];
    const eye = new THREE.Group();
    eye.name = side > 0 ? 'Eye_R_mesh' : 'Eye_L_mesh';
    // resting optical axis: dorsolateral, slightly anterior (P)
    const axis = new THREE.Vector3(0.12, 0.62, side * 0.78).normalize();
    eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    bone.add(eye);

    const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), this.materials.eyeball);
    eye.add(ball);
    const cap = (radius, ang, mat, segs = 32) => {
      const geo = new THREE.SphereGeometry(radius, segs, 12, 0, Math.PI * 2, 0, ang);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      const rr = radius * Math.sin(ang);
      for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * rr), 0.5 + p.getZ(i) / (2 * rr));
      return new THREE.Mesh(geo, mat);
    };
    const iris = cap(R * 1.002, 1.5, this.materials.iris);
    eye.add(iris);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(R * 0.36, 16, 12), this.materials.lens);
    lens.position.y = R * 0.8;           // lens bulges through pupil (fish lens is spherical, protrudes; F-general)
    eye.add(lens);
    const cornea = cap(R * 1.05, 1.15, this.materials.cornea, 40);
    cornea.renderOrder = 3;
    eye.add(cornea);
    const corneaCheap = cap(R * 1.05, 1.15, this.materials.corneaCheap, 20);
    corneaCheap.renderOrder = 3;
    eye.add(corneaCheap);
    eye.userData = { cornea, corneaCheap, lens, axis };
    return eye;
  }

  setLOD(i) {
    if (i === this.currentLOD) return;
    this.currentLOD = i;
    this.lods.forEach((g, k) => (g.visible = k === i));
    const c = LOD_LEVELS[i].cornea;
    for (const e of this.eyes) {
      e.userData.cornea.visible = c === 'physical';
      e.userData.corneaCheap.visible = c === 'cheap';
      e.userData.lens.visible = i < 2;
    }
  }

  updateLOD(camera) {
    if (this.forcedLOD !== null) return this.setLOD(this.forcedLOD);
    const d = camera.position.distanceTo(this.getWorldPosition(_tmp));
    const idx = LOD_LEVELS.findIndex((L) => d < L.maxDist);
    this.setLOD(idx);
  }

  dispose() {
    this.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    const m = this.materials;
    for (const t of Object.values(m.textures)) t.dispose();
    [m.body, m.ray, m.eyeball, m.iris, m.lens, m.cornea, m.corneaCheap, ...Object.values(m.fins)].forEach((x) => { x.map?.dispose(); x.dispose(); });
  }
}
const _tmp = new THREE.Vector3();
