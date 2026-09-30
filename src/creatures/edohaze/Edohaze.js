import * as THREE from 'three';
import { EDOHAZE_TL_METRES, MORPH } from './EdohazeParams.js';
import { EdohazeRig } from './EdohazeRig.js';
import { EdohazeModelBuilder, buildEye, EYE_R, LOD_SPECS } from './EdohazeModel.js';
import { EdohazeMaterialSet } from './EdohazeMaterial.js';
import { EdohazeAnimator } from './EdohazeAnimator.js';
import { EdohazeLocomotion } from './EdohazeLocomotion.js';
import { EdohazeBehavior, makePersonality } from './EdohazeBehavior.js';
import { EdohazeLOD } from './EdohazeLOD.js';
import { mulberry32, lerp } from './EdohazeMath.js';

/**
 * Edohaze — Gymnogobius macrognathos, real-time creature.
 *
 * World adapter contract (all distances in metres, +Y up):
 *   getGroundHeight(x,z) → number
 *   getGroundNormal(x,z,out:Vector3) → Vector3
 *   getWaterLevel() → number                  (surface Y; tide)
 *   getSubstrate?(x,z) → 'mud'|'sandy_mud'|'sand'
 *   getBurrows?() → CrustaceanBurrow[]        (src/habitat/CrustaceanBurrow.js)
 *   getThreats?() → [{position, velocity, size, visible}]
 *   getPrey?() → [{position, alive}] ; consumePrey?(prey)
 *   getConspecifics?() → Edohaze[]
 *   getVisibility?() → m ; getDaylight?() → 0..1 ; getTideRate?() → m/s
 *   isBreedingSeason?() → bool ; inBounds?(Vector3) → bool
 */
export class Edohaze {
  constructor({ world, seed = 1, sex, tl, position = new THREE.Vector3(), yaw = 0 }) {
    const r = mulberry32(seed * 1013 + 5);
    this.seed = seed;
    this.world = world;
    this.sex = sex || (r() < 0.5 ? 'male' : 'female');
    this.TL = tl || EDOHAZE_TL_METRES * lerp(0.88, 1.12, r());
    this.SL = this.TL / MORPH.tlOverSl;
    // sexual dimorphism kept weak: males slightly larger head/jaw (inferred; see docs)
    const sexScale = this.sex === 'male' ? 1.06 : 1.0;

    this.object = new THREE.Group();
    this.object.name = `Edohaze#${seed}`;
    this.rig = new EdohazeRig(this.SL);
    this.object.add(this.rig.root);
    this.materials = new EdohazeMaterialSet({ variantSeed: seed % 4, sex: sexScale, slMm: this.SL * 1000, seed });
    // per-individual tint (small)
    this.materials.perFish.uTint.value.setRGB(lerp(0.95, 1.05, r()), lerp(0.96, 1.04, r()), lerp(0.94, 1.03, r()));

    // build LODs (geometry first → eye placement → finalize skeleton → bind)
    this.lods = [];
    for (let l = 0; l < 3; l++) {
      const m = EdohazeModelBuilder.build({ SL: this.SL, sex: sexScale, materials: this.materials, lodIndex: l, rig: this.rig });
      this.lods.push(m);
    }
    const eyes = this.lods[0].eyes;
    this.rig.placeEye('L', eyes.L.c.clone().multiplyScalar(this.SL));
    this.rig.placeEye('R', eyes.R.c.clone().multiplyScalar(this.SL));
    this.rig.finalize();
    const I = new THREE.Matrix4();
    for (const m of this.lods) {
      this.object.add(m.group);
      m.group.traverse((o) => { if (o.isSkinnedMesh) { o.bind(this.rig.skeleton, I); o.frustumCulled = o.name === 'body'; } });
      m.body.computeBoundingSphere(); m.body.boundingSphere.radius *= 1.5;
      // eyes
      m.eyeGroups = ['L', 'R'].map((side) => {
        const g = buildEye(EYE_R * this.SL, this.materials.eye, LOD_SPECS[this.lods.indexOf(m)]);
        const axis = eyes[side].axis;
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
        this.rig.bones[side === 'L' ? 'Eye_L' : 'Eye_R'].add(g);
        g.traverse((o) => { o.castShadow = false; });
        return g;
      });
    }
    this._buildInteriors();

    this.animator = new EdohazeAnimator(this.rig, this.materials, { SL: this.SL, seed });
    this.loco = new EdohazeLocomotion(this, world);
    this.personality = makePersonality(seed);
    this.behavior = new EdohazeBehavior(this, world, this.personality);
    this.lod = new EdohazeLOD(this);
    this.loco.place(position, yaw);
    this.setLOD(0);
    this._syncTransform();
    this._headInv = new THREE.Matrix4();
    this.object.userData.edohaze = this;
  }

  _buildInteriors() {
    const SL = this.SL, B = this.rig.bones;
    // (buccal lining is a skinned mesh per LOD — see buildMouthLining)
    // gill arches behind each operculum (seen when opercula flare)
    for (const [side, sg] of [['L', 1], ['R', -1]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(0.02 * SL, 0.09 * SL, 1, 4), this.materials.gill);
      g.position.copy(new THREE.Vector3(sg * 0.052 * SL, -0.01 * SL, (0.40 - 0.255) * SL)).sub(B.Head.userData.abs);
      g.rotation.y = Math.PI / 2; g.rotation.x = 0.2;
      B.Head.add(g); this['gill' + side] = g;
    }
    this.interiors = [this.gillL, this.gillR];
  }

  setLOD(level) {
    this.lods.forEach((m, i) => { m.group.visible = i === level; m.eyeGroups.forEach((g) => { g.visible = i === level; }); });
    this.interiors.forEach((o) => { o.visible = level < 2; });
    this.gillL.visible = this.gillR.visible = level === 0;
    this.currentLOD = level;
  }

  /** world point → direction in Head bone space (for eye targeting) */
  toHeadLocal(p) {
    this._headInv.copy(this.rig.bones.Head.matrixWorld).invert();
    return p.clone().applyMatrix4(this._headInv);
  }

  _syncTransform() {
    this.object.position.copy(this.loco.pos);
    this.object.quaternion.copy(this.loco.quat);
    this.object.visible = !this.loco.hidden;
  }

  /** LOD selection; call every rendered frame (also while simulation is paused). */
  updateLOD(camera, viewportH = 1000) { return this.lod.update(camera, viewportH); }

  update(dt, camera, viewportH = 1000) {
    const lvl = this.lod.update(camera, viewportH);
    this.behavior.update(dt);
    this.loco.update(dt);
    this._syncTransform();
    const k = this.lod.animStep();
    if (k > 0 && !this.loco.hidden) {
      this.animator.update(dt * k, {
        speed: this.loco.speed, accel: this.loco.accel, yawRate: this.loco.yawRate, mode: this.loco.mode,
        contact: this.loco.contact, gliding: this.loco.gliding, braking: this.loco.braking, burst: this.loco.burst,
      }, this.behavior.intent, { lod: lvl });
    }
  }

  dispose() {
    this.object.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.materials.dispose();
    this.object.removeFromParent();
  }
}

export { EdohazeBehavior, makePersonality };
