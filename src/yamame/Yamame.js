// Runtime wrapper: Yamame{ Body, Eyes, Fins, Skeleton, Materials, Animations } (docs/yamame/spec/07 §7.3).
// Takes a parsed glTF (GLTFLoader result) and drives the 62-bone rig procedurally. three.js objects only; no loader here.
import * as THREE from 'three';
import { strikePose } from './modes.js';
import { SPINE_COUNT, spineWave, WaveDriver, cStartShape } from '../locomotion/wave.js';

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
    this.spine = Array.from({ length: SPINE_COUNT }, (_, j) => this.bones[`spine_${String(j).padStart(2, '0')}`]);
    this.rootBone = this.bones.fish_root;
    this.wave = new WaveDriver({ phase0: opts.phase0 ?? Math.random() * 6.28 });
    this.time = 0;
    this.breath = { phase: Math.random() * 6.28, f: 1.0, amp: 1.0 };
    // per-individual variation hooks (spec 5.8)
    this.var = { A_scale: 1, lambda: 0.9, head_gain: 1, ...(opts.variation || {}) };
    // fin pose targets (1 = fully erect / abducted)
    this.fin = { pecAbd: 0.08, pelAbd: 0.1, dorsalErect: 1, analErect: 1, caudalSpread: 0.7 };
    this.finState = { pecAbd: 0.08, pelAbd: 0.1, dorsalErect: 1, analErect: 1, caudalSpread: 0.7 };
    this.jawOpen = 0; this.opercleFlare = 0;
    this.eyeLook = { yaw: 0, pitch: 0 };
    // world kinematics (metres, radians): the glTF scene node is moved so that the fish swims through the world
    this.pos = new THREE.Vector3(); this.heading = 0; this.speed = 0; this.esc = null;
  }

  /** Feeding strike (5.6.2). T_strike seconds (default 0.12). */
  triggerStrike(T = 0.12) { this.strike = { t: 0, T }; }

  /** C-start escape (5.3.3). side: +1 = bend left. */
  triggerEscape(side = 1, opts = {}) { this.esc = { t: 0, side, T12: opts.T12 ?? 0.088, type: Math.random() < 0.7 ? 'C' : 'S', vPeak: opts.vPeak ?? 1.4, yaw0: this.heading }; }

  /** intent: { U_bl, turn (1/SL, left +), boost, jawOpen (deg 0..), fins:{...} } */
  update(dt, intent = {}) {
    dt = Math.min(dt, 1 / 20); this.time += dt;
    const mode = intent.mode ? { ...intent.mode, ...intent } : intent;
    intent = mode;
    const w = this.wave.update(dt, { U_target: intent.U_bl ?? 1.0, turn: intent.turn ?? 0, boost: intent.boost ?? 1, A_override: intent.A_override ?? null, f_override: intent.f_override ?? null });
    let res = spineWave({ phase: w.phase, A_tail: w.A * this.var.A_scale, lambda: this.var.lambda, turn: w.turn, head_gain: this.var.head_gain });
    let U_ms = (w.U - (intent.flow_bl ?? 0)) * this.SL, yawRate = w.U * w.turn;          // m/s ; rad/s = U[BL/s] * kappa[1/SL] (left turn: kappa>0 -> +yaw about +Y)
    if (this.esc) {
      const e = this.esc; e.t += dt;
      const sh = cStartShape(e.t, { T12: e.T12, side: e.side, type: e.type });
      // blend the swimming wave back in during stage 3
      const mix = e.t < e.T12 ? 0 : Math.min(1, (e.t - e.T12) / 0.15);
      const rel = new Float64Array(SPINE_COUNT); for (let j = 0; j < SPINE_COUNT; j++) rel[j] = sh.rel[j] * (1 - mix) + res.rel[j] * mix;
      res = { ...res, rel, recoil: res.recoil * mix };
      const T = e.T12; const a = e.t < T ? 4 * (e.vPeak / T) * Math.sin(Math.PI * e.t / T) ** 2 / 2 : 0;       // sin^2 acceleration profile, integrates to ~vPeak
      this.speed = e.t < T ? Math.min(e.vPeak, this.speed + a * dt) : Math.max(w.U * this.SL, this.speed - 1.0 * dt);
      U_ms = this.speed;
      yawRate = e.t < 0.45 * e.T12 ? e.side * 0.87 / (0.45 * e.T12) : (e.t < e.T12 ? -e.side * 0.25 / (0.55 * e.T12) : 0);   // head turns ~50 deg toward the bend in stage 1, partly back in stage 2 [E]
      if (!sh.active) this.esc = null;
    } else this.speed = U_ms;
    const strike = this.strike ? (this.strike.t += dt, strikePose(this.strike.t / this.strike.T)) : null; if (this.strike && this.strike.t > this.strike.T) this.strike = null;
    this.strikePose = strike;
    for (let j = 0; j < SPINE_COUNT; j++) {
      const b = this.spine[j]; q.setFromAxisAngle(AXIS_Y, res.rel[j]); b.quaternion.copy(this.rest[b.name].q).multiply(q);
    }
    if (this.rootBone) this.rootBone.position.copy(this.rest.fish_root.p).add(new THREE.Vector3(0, 0, res.recoil * this.SL));
    this.heading += yawRate * dt;
    this.pos.x += Math.cos(this.heading) * U_ms * dt; this.pos.z += -Math.sin(this.heading) * U_ms * dt;
    if (!intent.hold) { this.root.position.copy(this.pos); this.root.rotation.y = this.heading; }
    this.#headAndGills(dt, intent, w);
    this.#fins(dt, intent, w, res);
    return res;
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
