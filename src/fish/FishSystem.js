// Rendering side of all fish: one rig data texture, three LOD levels, each
// with one instanced draw for bodies, one for fins (sorted back-to-front per
// frame) and one for eyes. Per-fish frustum culling and screen-size LOD
// selection happen on the CPU before the instance lists are filled.

import * as THREE from 'three';
import { buildRigLayout, NS } from './RigLayout.js';
import { buildBodyGeometry, eyeRest } from './BodyGeometry.js';
import { buildFinGeometry } from './FinGeometry.js';
import { head } from './morphology.js';
import { createBodyMaterial, createBodyDepthMaterial, createFinMaterial, createFinDepthMaterial, createFinDepthWriteMaterial, createEyeMaterial } from './FishMaterials.js';
import { U } from '../render/SharedUniforms.js';

const LOD_SPECS = [
  { body: { nBody: 210, nCavity: 12, nTheta: 128 }, fin: 1, eye: [40, 28] },
  { body: { nBody: 104, nCavity: 6, nTheta: 64 }, fin: 0.5, eye: [22, 16] },
  { body: { nBody: 46, nCavity: 3, nTheta: 26 }, fin: 0.25, eye: [12, 8] },
];

export class FishSystem {
  constructor(scene, { maxFish = 48 } = {}) {
    this.scene = scene;
    this.maxFish = maxFish;
    this.layout = buildRigLayout();
    this.width = this.layout.width;
    this.data = new Float32Array(this.width * maxFish * 4);
    this.tex = new THREE.DataTexture(this.data, this.width, maxFish, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    U.uRig.value = this.tex;

    this.fish = [];
    this.freeRows = [];
    for (let i = maxFish - 1; i >= 0; i--) this.freeRows.push(i);
    this.forceLOD = -1;
    this.lodPixels = [200, 70];
    this.stats = { visible: 0, lod: [0, 0, 0], triangles: 0 };
    this.eyeRest = [eyeRest(1), eyeRest(-1)];

    this.group = new THREE.Group();
    this.group.name = 'fish';
    scene.add(this.group);

    this.bodyDepth = createBodyDepthMaterial(this.layout);
    this.finDepth = createFinDepthMaterial(this.layout);
    this.finDepthWrite = createFinDepthWriteMaterial(this.layout);
    this.eyeMat = createEyeMaterial();
    this.lods = LOD_SPECS.map((spec, lod) => this._buildLOD(spec, lod));
  }

  _instanced(geom, attrName, itemSize) {
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = geom.index;
    for (const [k, v] of Object.entries(geom.attributes)) ig.setAttribute(k, v);
    const arr = new Float32Array(this.maxFish * itemSize);
    const attr = new THREE.InstancedBufferAttribute(arr, itemSize);
    attr.setUsage(THREE.DynamicDrawUsage);
    ig.setAttribute(attrName, attr);
    ig.instanceCount = 0;
    ig.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    ig.userData = geom.userData;
    return ig;
  }

  _buildLOD(spec, lod) {
    const bodyGeom = this._instanced(buildBodyGeometry(spec.body), 'aFishRow', 1);
    const finGeom = this._instanced(buildFinGeometry(this.layout, spec.fin), 'aFishRow', 1);
    const bodyMat = createBodyMaterial(this.layout, { lod });
    const finMat = createFinMaterial(this.layout, { lod });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.frustumCulled = false;
    body.castShadow = true;
    body.receiveShadow = true;
    body.customDepthMaterial = this.bodyDepth;
    body.name = `fishBody.LOD${lod}`;
    const fins = new THREE.Mesh(finGeom, finMat);
    fins.frustumCulled = false;
    fins.castShadow = true;
    fins.receiveShadow = false;
    fins.customDepthMaterial = this.finDepth;
    fins.renderOrder = 2;
    fins.name = `fishFins.LOD${lod}`;
    // same instances, depth only, after all fins (for the depth of field)
    const finsZ = new THREE.Mesh(finGeom, this.finDepthWrite);
    finsZ.frustumCulled = false;
    finsZ.renderOrder = 3;
    finsZ.name = `fishFinsDepth.LOD${lod}`;
    const eyeGeom = new THREE.SphereGeometry(1, spec.eye[0], spec.eye[1]);
    // SphereGeometry poles sit on ±Y, so the optical axis (+Z) has no pole pinch
    const eyeParams = new THREE.InstancedBufferAttribute(new Float32Array(this.maxFish * 2 * 4), 4);
    eyeParams.setUsage(THREE.DynamicDrawUsage);
    eyeGeom.setAttribute('aEyeParams', eyeParams);
    const eyes = new THREE.InstancedMesh(eyeGeom, this.eyeMat, this.maxFish * 2);
    eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    eyes.frustumCulled = false;
    eyes.castShadow = false;
    eyes.count = 0;
    eyes.name = `fishEyes.LOD${lod}`;
    for (const m of [body, fins, eyes]) m.layers.enable(1); // visible in the surface (TIR) reflection
    this.group.add(body, fins, finsZ, eyes);
    return {
      body,
      fins,
      finsZ,
      eyes,
      bodyTris: bodyGeom.index.count / 3,
      finTris: finGeom.index.count / 3,
      eyeTris: eyeGeom.index.count / 3,
      list: [],
    };
  }

  add(fish) {
    if (!this.freeRows.length) throw new Error('FishSystem: maxFish exceeded');
    fish.row = this.freeRows.pop();
    this.fish.push(fish);
  }

  remove(fish) {
    const i = this.fish.indexOf(fish);
    if (i >= 0) {
      this.fish.splice(i, 1);
      this.freeRows.push(fish.row);
      fish.row = -1;
    }
  }

  setWireframe(on) {
    for (const l of this.lods) {
      l.body.material.wireframe = on;
      l.fins.material.wireframe = on;
    }
  }

  update(camera, renderer) {
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const h = renderer ? renderer.domElement.height : 1080;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    for (const l of this.lods) l.list.length = 0;
    const sphere = new THREE.Sphere();
    this.stats.visible = 0;
    this.stats.lod = [0, 0, 0];
    for (const f of this.fish) {
      sphere.set(f.loc.pos, f.boundRadius);
      f.visible = frustum.intersectsSphere(sphere);
      f.distance = camPos.distanceTo(f.loc.pos);
      // rig rows are written for every fish (shadows may need off-screen fish)
      const o = f.rig.writeRow(this.data, f.row * this.width * 4);
      f.writeMisc(this.data, (f.row * this.width + this.layout.misc) * 4);
      if (!f.visible) continue;
      const px = (f.SL / Math.max(0.01, f.distance * tanHalf)) * (h * 0.5);
      let lod = px > this.lodPixels[0] ? 0 : px > this.lodPixels[1] ? 1 : 2;
      if (this.forceLOD >= 0) lod = this.forceLOD;
      f.lod = lod;
      this.lods[lod].list.push(f);
      this.stats.visible++;
      this.stats.lod[lod]++;
    }
    this.tex.needsUpdate = true;

    let tris = 0;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qe = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const Yax = new THREE.Vector3(0, 1, 0);
    for (let li = 0; li < this.lods.length; li++) {
      const L = this.lods[li];
      // far-to-near so translucent fins blend correctly between individuals
      L.list.sort((a, b) => b.distance - a.distance);
      const rows = L.body.geometry.attributes.aFishRow;
      const frows = L.fins.geometry.attributes.aFishRow;
      const ep = L.eyes.geometry.attributes.aEyeParams;
      let n = 0;
      let ne = 0;
      for (const f of L.list) {
        rows.array[n] = f.row;
        frows.array[n] = f.row;
        n++;
        // eyes
        for (let s = 0; s < 2; s++) {
          const er = this.eyeRest[s];
          const side = s === 0 ? 1 : -1;
          _eyeLocal.set(er.center.x, er.center.y * f.variation.depthScale, er.center.z * f.variation.widthScale);
          f.rig.bodyPoint(_eyeLocal, p, q);
          const e = f.loc.eyes[s];
          // base orientation: +Z -> optical axis, then saccade about body up axis
          qe.setFromUnitVectors(new THREE.Vector3(0, 0, 1), er.axis);
          const rot = new THREE.Quaternion().setFromAxisAngle(Yax, side * e.yaw);
          const rotP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), e.pitch);
          q.multiply(rot).multiply(rotP).multiply(qe);
          const r = er.radius * f.SL;
          sc.set(r, r, r);
          m4.compose(p, q, sc);
          L.eyes.setMatrixAt(ne, m4);
          const v = f.variation;
          ep.array[ne * 4] = v.irisHue;
          ep.array[ne * 4 + 1] = 1.0;
          ep.array[ne * 4 + 2] = 1.0;
          ep.array[ne * 4 + 3] = v.seed + s * 0.37;
          ne++;
        }
      }
      L.body.geometry.instanceCount = n;
      L.fins.geometry.instanceCount = n;
      L.body.visible = L.fins.visible = L.finsZ.visible = n > 0;
      L.eyes.count = ne;
      rows.needsUpdate = true;
      frows.needsUpdate = true;
      rows.clearUpdateRanges();
      frows.clearUpdateRanges();
      ep.needsUpdate = true;
      L.eyes.instanceMatrix.needsUpdate = true;
      tris += n * (L.bodyTris + L.finTris) + ne * L.eyeTris;
    }
    this.stats.triangles = tris;
  }
}

const _eyeLocal = new THREE.Vector3();
export { NS, head };
