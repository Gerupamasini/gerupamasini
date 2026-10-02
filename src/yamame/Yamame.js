// Runtime wrapper: Yamame{ Body, Eyes, Fins, Skeleton, Materials, Animations } (docs/yamame/spec/07 §7.3).
// Takes a parsed glTF (GLTFLoader result) and drives the 62-bone rig procedurally. three.js objects only; no loader here.
import * as THREE from 'three';
import { SPINE_COUNT } from '../locomotion/wave.js';
import { Locomotion } from '../locomotion/locomotion.js';

const AXIS_Y = new THREE.Vector3(0, 1, 0), AXIS_Z = new THREE.Vector3(0, 0, 1), AXIS_X = new THREE.Vector3(1, 0, 0);
const q = new THREE.Quaternion();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export class Yamame {
  constructor(gltf, opts = {}) {
    this.gltf = gltf; this.root = gltf.scene; this.SL = opts.SL ?? 0.19;
    this.bones = {}; this.rest = {};
    this.root.traverse((o) => {
      if (o.isBone) { this.bones[o.name] = o; this.rest[o.name] = { p: o.position.clone(), q: o.quaternion.clone() }; }
      if (o.isSkinnedMesh) { o.frustumCulled = false; (this.skinned ??= []).push(o); }
    });
    // material fix-ups that glTF cannot express (eye module spec: cornea = black, additive, no depth write, weak specular)
    this.materials = {};
    this.root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) this.materials[m.name] = m; });
    const cor = this.materials.M_Eye_Cornea;
    if (cor) { cor.color.set(0x000000); cor.blending = THREE.AdditiveBlending; cor.transparent = true; cor.opacity = 1; cor.depthWrite = false; cor.roughness = 0.03; if ('specularIntensity' in cor) cor.specularIntensity = 0.1; cor.needsUpdate = true; }
    this.#buildLOD(opts);
    this.spine = Array.from({ length: SPINE_COUNT }, (_, j) => this.bones[`spine_${String(j).padStart(2, '0')}`]);
    this.rootBone = this.bones.fish_root;
    this.loco = new Locomotion({ SL: this.SL, phase0: opts.phase0 ?? Math.random() * 6.28, variation: opts.variation });
    this.time = 0;
    this.breath = { phase: Math.random() * 6.28, f: 1.0, amp: 1.0 };
    // fin pose targets (1 = fully erect / abducted)
    this.fin = { pecAbd: 0.08, pelAbd: 0.1, dorsalErect: 1, analErect: 1, caudalSpread: 0.7 };
    this.finState = { pecAbd: 0.08, pelAbd: 0.1, dorsalErect: 1, analErect: 1, caudalSpread: 0.7 };
    this.jawOpen = 0; this.opercleFlare = 0;
    this.eyeLook = { yaw: 0, pitch: 0 };
  }

  // world kinematics live in Locomotion (metres, radians); the glTF scene node follows them
  get pos() { return this.loco.pos; } get wave() { return this.loco.wave; }
  get heading() { return this.loco.heading; } set heading(v) { this.loco.heading = v; }
  get pitch() { return this.loco.pitch; } set pitch(v) { this.loco.pitch = v; }
  get speed() { return this.loco.speed; } get esc() { return this.loco.esc; }

  /** Feeding strike (5.6.2). T_strike seconds (default 0.12). */
  triggerStrike(T = 0.12) { this.loco.triggerStrike(T); }

  /** C-start escape (05 §5.3.3). side: +1 = bend left. */
  triggerEscape(side = 1, opts = {}) { this.loco.triggerEscape(side, opts); }

  /** intent: { U_bl, turn (1/SL, left +), boost, jawOpen (deg 0..), fins:{...} } */
  update(dt, intent = {}) {
    dt = Math.min(dt, 1 / 20); this.time += dt;
    if (intent.mode && typeof intent.mode === 'object') intent = { ...intent.mode, ...intent };
    const { res, w } = this.loco.update(dt, intent);
    this.strikePose = this.loco.strikePose;
    for (let j = 0; j < SPINE_COUNT; j++) {
      const b = this.spine[j]; q.setFromAxisAngle(AXIS_Y, res.rel[j]); b.quaternion.copy(this.rest[b.name].q).multiply(q);
    }
    if (this.rootBone) this.rootBone.position.copy(this.rest.fish_root.p).add(new THREE.Vector3(0, 0, res.recoil * this.SL));
    this.root.position.set(this.pos.x, this.pos.y, this.pos.z); this.root.rotation.order = 'YXZ'; this.root.rotation.set(0, this.heading, this.pitch);
    this.#headAndGills(dt, intent, w);
    this.#fins(dt, intent, w, res);
    return res;
  }

  /** Group the *_LODn skinned meshes (same Skeleton / bindMatrix, 07 §7.5) into one THREE.LOD; distances are in SL multiples (06 §6.8.1). */
  #buildLOD(opts) {
    const holder = this.root.getObjectByName('Yamame') || this.root, levels = [];
    for (const c of [...holder.children]) { const m = /^(Body|Fins)_LOD(\d)$/.exec(c.name); if (m) (levels[+m[2]] ??= []).push(c); }
    this.lodLevels = levels.filter(Boolean).length;
    if (this.lodLevels < 2 || opts.lod === false) return;
    const lod = new THREE.LOD(); lod.name = 'YamameLOD';
    const dist = opts.lodDistances ?? [0, 4 * this.SL, 12 * this.SL];
    levels.forEach((nodes, L) => {
      if (!nodes) return;
      const g = new THREE.Group(); g.name = `LOD${L}`; nodes.forEach((n) => g.add(n));
      lod.addLevel(g, dist[L] ?? dist[dist.length - 1], L ? 0.1 : 0);
      if (L >= 1) g.traverse((m) => {   // cheaper material variants (06 §6.8.1): no iridescence at LOD1, no clearcoat / normal map at LOD2
        if (!m.isMesh) return;
        const cheap = (mat) => { const c = mat.clone(); if ('iridescence' in c) c.iridescence = 0; if (L >= 2) { if ('clearcoat' in c) c.clearcoat = 0; c.normalMap = null; } return c; };
        m.material = Array.isArray(m.material) ? m.material.map(cheap) : cheap(m.material);
      });
    });
    holder.add(lod); this.lod = lod;
  }

  /** Force a LOD level (null = automatic by camera distance). */
  setLOD(level) {
    if (!this.lod) return; this.lod.autoUpdate = level == null;
    if (level != null) this.lod.levels.forEach((lv, i) => { lv.object.visible = i === level; });
  }

  #setRot(name, axis, ang) { const b = this.bones[name]; if (!b) return; q.setFromAxisAngle(axis, ang); b.quaternion.copy(this.rest[name].q).multiply(q); }

  #headAndGills(dt, intent, w) {
    // buccal pump: ~1.0-1.6 Hz at rest in cool water (spec 5.6.1, [E]); jaw opens a few degrees, opercles flare out of phase
    this.breath.phase += 2 * Math.PI * this.breath.f * dt;
    const ph = this.breath.phase, amp = this.breath.amp;
    const pump = 0.5 + 0.5 * Math.sin(ph), gill = 0.5 + 0.5 * Math.sin(ph - 1.1);
    const sk = this.strikePose; const jawDeg = (intent.jawOpen ?? 0) + (sk ? sk.jaw : 0) + 2.0 * amp * pump * pump;
    this.#setRot('jaw_lower', AXIS_Z, -jawDeg * Math.PI / 180);       // opens: tip rotates down (negative about +Z, see viewer/dev/body.html)
    const flare = (intent.opercle ?? 0) + (sk ? sk.opercle : 0) + 7 * amp * gill;                    // degrees
    this.#setRot('opercle_R', AXIS_Y, flare * Math.PI / 180); this.#setRot('opercle_L', AXIS_Y, -flare * Math.PI / 180);
    this.#setRot('hyoid', AXIS_Z, -(1.5 * amp * pump + (sk ? sk.hyoid : 0)) * Math.PI / 180);
  }

  #fins(dt, intent, w, res) {
    const f = { ...this.fin, ...(intent.fins || {}) }, st = this.finState, k = 1 - Math.exp(-dt / 0.15);
    for (const key of Object.keys(st)) st[key] = lerp(st[key], f[key], k);
    // paired fins: abduction about Y (right +, left -); slight flutter driven by body wave phase
    const flutter = Math.sin(w.phase * 0.5) * 0.08;
    const pec = (st.pecAbd * 70 + 4) * Math.PI / 180, pel = (st.pelAbd * 40 + 3) * Math.PI / 180;
    this.#setRot('pectoral_R', AXIS_Y, pec * (1 + flutter)); this.#setRot('pectoral_L', AXIS_Y, -pec * (1 - flutter));
    this.#setRot('pelvic_R', AXIS_Y, pel); this.#setRot('pelvic_L', AXIS_Y, -pel);
    // caudal rays fan: spread scales the lateral splay of the five ray bones (rotation about X rolls them apart)
    const sp = st.caudalSpread;
    [['u2', 1], ['u1', 0.5], ['mid', 0], ['l1', -0.5], ['l2', -1]].forEach(([n, d]) => this.#setRot(`caudal_ray_${n}`, AXIS_Z, d * (sp - 0.7) * 0.10));
    // passive caudal lag: the hub follows the tail wave with a small extra yaw (fin trails the peduncle)
    const tailRel = res.rel[SPINE_COUNT - 1], hub = this.bones.caudal_hub;
    if (hub) { q.setFromAxisAngle(AXIS_Y, tailRel * 0.6 * (0.5 + 0.5 * sp)); hub.quaternion.copy(this.rest.caudal_hub.q).multiply(q); }
    // dorsal/anal erect: tilt hinge about Z toward the body when depressed
    const dTilt = (1 - st.dorsalErect) * 0.9, aTilt = (1 - st.analErect) * 0.9;
    this.#setRot('dorsal_hinge', AXIS_Z, dTilt); this.#setRot('anal_hinge', AXIS_Z, -aTilt);
  }
}
