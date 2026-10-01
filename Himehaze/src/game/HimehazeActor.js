// Game-side wrapper: one ヒメハゼ individual built from the shared GLB (models/himehaze*.glb).
//
//   const tpl = await loadHimehazeTemplate(url);
//   const fish = new HimehazeActor(tpl, { seed: 7, ground, onEvent });
//   scene.add(fish.root);
//   // every frame
//   fish.update(dt);                       // or let an Ecology controller call fish.behavior.* first
//
// Rendering uses the glTF standard PBR materials (KHR transmission / volume / clearcoat), so the actor
// drops into an ordinary three.js renderer. The volumetric "AAA" shaders of the viewer (src/materials)
// need its multi-pass background buffer and are therefore viewer-only.
// Units: metres. Frame: +Y up, the fish's head points along its local +Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createBehavior, mulberry32 } from '../fish/Behavior.js';
import { CONTACT_S, SPECIES } from '../fish/species.js';

const templates = new Map();

/**
 * Load (once) and cache a GLB as a cloneable template.
 * lods: geometry levels built with `tools/build-model.mjs --lod 1|2` (same skeleton, morph targets and UVs);
 * `true` derives their URLs (himehaze.glb → himehaze_lod1.glb, himehaze_lod2.glb). Missing files are skipped.
 */
export function loadHimehazeTemplate(url, { lods = true } = {}) {
  const key = `${url}|${lods}`;
  if (!templates.has(key)) {
    const loader = new GLTFLoader();
    const lodUrls = lods === true ? [1, 2].map((k) => url.replace(/\.glb$/, `_lod${k}.glb`)) : lods || [];
    const geoms = (gltf) => {
      const m = {};
      gltf.scene.traverse((o) => { if (o.isMesh) m[o.name] = o.geometry; });
      return m;
    };
    templates.set(key, Promise.all([
      loader.loadAsync(url),
      ...lodUrls.map((u) => loader.loadAsync(u).then(geoms).catch(() => null)),
    ]).then(([gltf, ...lodGeoms]) => {
      const meta = gltf.scene.getObjectByName('Himehaze_Adult');
      let body = null;
      gltf.scene.traverse((o) => { if (o.isMesh && o.material?.userData?.himehaze?.role === 'body') body = o; });
      return { gltf, rig: meta.userData.himehazeRig, extras: body.material.userData.himehaze, species: meta.userData, lodGeoms: lodGeoms.filter(Boolean) };
    }));
  }
  return templates.get(key);
}

/**
 * Seeded individual variation: small (±2–6 %) so individuals differ without looking like another species.
 * Size spread follows the Tokyo Bay adult range (typically 5–8 cm TL, model base 5.3 cm) [F].
 */
export function individualVariation(seed) {
  const r = mulberry32(seed * 2654435761);
  const j = (a) => 1 + (r() * 2 - 1) * a;
  return {
    scale: j(0.06) * (1 + 0.25 * r() * r()),   // a few larger fish
    brightness: j(0.07),                         // pale ↔ darker individuals (025 vs 026)
    warmth: j(0.04),
    finTint: j(0.05),
  };
}

export class HimehazeActor {
  /**
   * @param {object} tpl   result of loadHimehazeTemplate()
   * @param {object} o     { seed, ground(x,z) → {y, normal}, heightAt(x,z) → y, onEvent(type, data, actor), castShadow }
   */
  constructor(tpl, { seed = 1, ground = null, heightAt = null, onEvent = null, castShadow = true, underwater = true } = {}) {
    this.seed = seed;
    this.castShadow = castShadow;
    this.variation = individualVariation(seed);
    this.root = SkeletonUtils.clone(tpl.gltf.scene);
    this.root.name = `Himehaze_${seed}`;
    this.root.scale.setScalar(this.variation.scale);
    this.species = SPECIES;

    const bones = {}, finMeshes = {};
    const v = this.variation;
    this.root.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (!o.isMesh) return;
      o.frustumCulled = false; // skinned
      o.castShadow = castShadow;
      o.receiveShadow = true;
      const role = o.material?.userData?.himehaze?.role;
      if (role === 'fin') finMeshes[o.name] = o;
      if (role === 'body' || role === 'fin') {
        o.material = o.material.clone();
        const c = o.material.color;
        if (role === 'body') c.setRGB(c.r * v.brightness * v.warmth, c.g * v.brightness, c.b * v.brightness / v.warmth);
        else c.multiplyScalar(v.finTint);
      }
      // Underwater the skin/mucus (n ≈ 1.37) borders water (n = 1.33), not air: the surface Fresnel reflection
      // nearly vanishes (F0 ≈ 0.0002 vs 0.024 in air), so a wet "plastic" sheen is wrong in the water [F: optics].
      // three.js assumes air outside, so the surface lobes are scaled down here; guanine sheen stays in the albedo.
      if (underwater && (role === 'body' || role === 'fin' || role === 'eye')) {
        if (!o.material.userData.uw) { o.material = o.material.clone(); o.material.userData.uw = true; }
        const m = o.material;
        m.specularIntensity = role === 'eye' ? 0.6 : 0.3;
        m.clearcoat = (m.clearcoat || 0) * (role === 'eye' ? 0.45 : 0.25);
      }
    });
    this.bones = bones;
    this.root.updateMatrixWorld(true);
    for (const b of Object.values(bones)) b.userData.restObj = this.root.worldToLocal(b.getWorldPosition(new THREE.Vector3()));

    // contact points (pelvic-sucker rim, belly line, lower caudal lobe) in each bone's frame
    const F = tpl.extras.fishFrame, P = tpl.extras.profile, rig = tpl.rig;
    const botY = (s) => { const k = Math.min(P.n - 1, Math.round((s / F.SEND) * (P.n - 1))); return P.data[k * 6] - P.data[k * 6 + 2]; };
    const rimY = rig.contactY * 1000 + F.Y0;
    const contacts = [
      ...CONTACT_S.pelvicRim.map((s) => ['J_pelvic', s, rimY]),
      ...CONTACT_S.belly.map(([bone, s]) => [bone, s, botY(s)]),
      ['J_caudal2', CONTACT_S.tail, rig.tailContactY * 1000 + F.Y0],
    ].map(([bone, s, y]) => ({ bone: bones[bone], p: new THREE.Vector3(0, (y - F.Y0) * 0.001, (F.S0 - s) * 0.001).sub(bones[bone].userData.restObj) }));

    this.behavior = createBehavior({
      root: this.root, bones, finMeshes, axes: rig.axes, contacts,
      floorY: 0, ground, heightAt, seed, onEvent: onEvent ? (type, data) => onEvent(type, data, this) : null,
    });
    this.behavior.setAuto(false);

    // LOD: the GLB has one geometry level; distant fish drop the small interior meshes, fin/eye shadows and
    // the transmission/clearcoat lobes (each transmissive material needs the extra transmission pass).
    this.meshes = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const full = o.material, cheap = full.clone();
      cheap.transmission = 0; cheap.thickness = 0; cheap.clearcoat = 0;
      if (o.material.userData?.himehaze?.role === 'fin') { cheap.transparent = true; cheap.opacity = Math.min(full.opacity, 0.55); cheap.depthWrite = false; }
      o.userData.lodMat = [full, cheap];
      o.userData.lodGeo = [o.geometry, ...tpl.lodGeoms.map((g) => g[o.name] || o.geometry)];
      this.meshes.push(o);
    });
    this.lod = -1;
    this.setLOD(0);
  }

  /**
   * 0: full mesh (body 104k verts), interior, teeth, gill chamber, all shadows, transmission
   * 1: LOD1 mesh (body 19k verts), no teeth / gill chamber, fins stop casting shadows
   * 2: LOD2 mesh (body 4k verts), no mouth cavity, no transmission / clearcoat, only the body casts a shadow
   * 3: LOD2 mesh, pelvic and anal fins hidden, no shadows (silhouette level)
   */
  setLOD(l) {
    if (l === this.lod) return;
    this.lod = l;
    for (const o of this.meshes) {
      const n = o.name;
      let vis = true;
      if (/Teeth|Gill/.test(n)) vis = l === 0;
      else if (/Mouth_Cavity/.test(n)) vis = l <= 1;
      else if (/Pelvic|Anal/.test(n)) vis = l <= 2;
      o.visible = vis;
      o.material = o.userData.lodMat[l >= 2 ? 1 : 0];
      const G = o.userData.lodGeo;
      o.geometry = G[Math.min(l, G.length - 1)];
      o.castShadow = this.castShadow && (n === 'Body' ? l <= 2 : l === 0 && /Fin_|Eye/.test(n));
    }
  }

  /**
   * Keep resting fish from interpenetrating: each body is a capsule along its heading (snout → tail tip,
   * radius ≈ half the body width); overlapping pairs are pushed apart on the sand. Call once per frame.
   */
  static separate(actors, gap = 0.003) {
    const seg = (a) => {
      const p = a.behavior.state.pos, h = a.heading, sc = a.variation.scale, fx = Math.sin(h), fz = Math.cos(h);
      return [p.x + fx * 0.022 * sc, p.z + fz * 0.022 * sc, p.x - fx * 0.024 * sc, p.z - fz * 0.024 * sc, 0.0042 * sc];
    };
    for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
      const A = seg(actors[i]), B = seg(actors[j]);
      const [ax, az, bx, bz] = closestSegSeg(A, B);
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), min = A[4] + B[4] + gap;
      if (d >= min) continue;
      const push = (min - d) / 2, nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
      actors[i].behavior.state.pos.x -= nx * push; actors[i].behavior.state.pos.z -= nz * push;
      actors[j].behavior.state.pos.x += nx * push; actors[j].behavior.state.pos.z += nz * push;
    }
  }

  /** world position on the sand (x, z) and heading (rad, yaw about +Y; 0 = facing +Z) */
  place(x, z, heading = 0) { this.behavior.teleport(x, z, heading); return this; }
  get position() { return this.root.position; }
  get heading() { return this.behavior.heading(); }
  get TL() { return 0.053 * this.variation.scale; }

  update(dt) { this.behavior.update(dt); }
}

// closest points between 2D segments (p0→p1) and (q0→q1); returns [ax, az, bx, bz]
function closestSegSeg([p0x, p0z, p1x, p1z], [q0x, q0z, q1x, q1z]) {
  const ux = p1x - p0x, uz = p1z - p0z, vx = q1x - q0x, vz = q1z - q0z, wx = p0x - q0x, wz = p0z - q0z;
  const a = ux * ux + uz * uz, b = ux * vx + uz * vz, c = vx * vx + vz * vz, d = ux * wx + uz * wz, e = vx * wx + vz * wz;
  const den = a * c - b * b;
  let s = den > 1e-12 ? Math.min(1, Math.max(0, (b * e - c * d) / den)) : 0;
  let t = (b * s + e) / c;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -d / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - d) / a)); }
  return [p0x + ux * s, p0z + uz * s, q0x + vx * t, q0z + vz * t];
}
