import * as THREE from 'three';
import { MORPH, S0, bodyProfile } from './EdohazeParams.js';
import { smoothstep, clamp } from './EdohazeMath.js';

// Skeleton layout. Positions are axial s (snout=0 → hypural=1) in SL units.
// The axial chain follows the vertebral column; the Head pivots at the occiput /
// pectoral girdle so the neurocranium stays rigid (fish have no neck — head yaw
// comes from the anterior trunk bending, which Head+Spine01 blending reproduces).
export const BONE_LAYOUT = {
  spine: [
    { name: 'Spine01', s: 0.285 },
    { name: 'Spine02', s: 0.43 },
    { name: 'Spine03', s: 0.57 },
    { name: 'Spine04', s: 0.69 },
    { name: 'CaudalPeduncle', s: 0.80 },
    { name: 'Tail', s: 0.935 },
  ],
  head: { name: 'Head', s: 0.26 },
  jaw: { name: 'Jaw', s: 0.135 },          // quadrate–articular joint (below/behind eye)
  operc: { s: 0.185 },                      // opercular hinge (hyomandibula)
  eye: { s: 0.105, theta: 0.62, sink: 0.55 },
};

export const zOf = (s, SL) => (S0 - s) * SL;

// Nodes used for axial skin weights (hat functions between node centres).
// Head node sits forward of the Head pivot so the whole cranium is rigid.
const AXIAL_NODES = [
  { bone: 'Head', s: 0.16 },
  { bone: 'Spine01', s: 0.32 },
  { bone: 'Spine02', s: 0.45 },
  { bone: 'Spine03', s: 0.585 },
  { bone: 'Spine04', s: 0.70 },
  { bone: 'CaudalPeduncle', s: 0.815 },
  { bone: 'Tail', s: 0.95 },
];

export class EdohazeRig {
  constructor(SL) {
    this.SL = SL;
    this.bones = {};
    this.list = [];
    const mk = (name, parent, x, y, z) => {
      const b = new THREE.Bone(); b.name = name;
      // positions are relative to parent; we compute absolute then convert
      b.userData.abs = new THREE.Vector3(x, y, z);
      if (parent) { b.position.copy(b.userData.abs).sub(parent.userData.abs); parent.add(b); }
      else b.position.copy(b.userData.abs);
      this.bones[name] = b; this.list.push(b); return b;
    };
    const root = mk('Root', null, 0, 0, 0);
    let prev = root;
    for (const n of BONE_LAYOUT.spine) prev = mk(n.name, prev, 0, 0, zOf(n.s, SL));
    const spine1 = this.bones.Spine01;
    const head = mk('Head', spine1, 0, 0, zOf(BONE_LAYOUT.head.s, SL));
    const pj = bodyProfile(BONE_LAYOUT.jaw.s);
    mk('Jaw', head, 0, -pj.bottom * 0.35 * SL, zOf(BONE_LAYOUT.jaw.s, SL));
    const po = bodyProfile(BONE_LAYOUT.operc.s);
    mk('Operc_L', head, po.half * 0.8 * SL, po.top * 0.1 * SL, zOf(BONE_LAYOUT.operc.s, SL));
    mk('Operc_R', head, -po.half * 0.8 * SL, po.top * 0.1 * SL, zOf(BONE_LAYOUT.operc.s, SL));
    // Eyes: computed by the model (needs surface); placeholder positions set later.
    mk('Eye_L', head, 0, 0, zOf(BONE_LAYOUT.eye.s, SL));
    mk('Eye_R', head, 0, 0, zOf(BONE_LAYOUT.eye.s, SL));
    // Paired fins
    const pp = bodyProfile(MORPH.pectoralBase);
    const pecY = -0.018 * SL; // centre of pectoral base line (see finDefs)
    mk('PectoralFin_L', spine1, pp.half * 0.92 * SL, pecY, zOf(MORPH.pectoralBase, SL));
    mk('PectoralFin_R', spine1, -pp.half * 0.92 * SL, pecY, zOf(MORPH.pectoralBase, SL));
    const pv = bodyProfile(MORPH.pelvicOrigin);
    mk('PelvicFin', spine1, 0, -pv.bottom * 0.93 * SL, zOf(MORPH.pelvicOrigin, SL));
    // Median fin control bones (drive erection/undulation uniforms; also give a
    // transform handle for tooling). Their rotation.x is read as erection angle.
    mk('DorsalFin1', this.bones.Spine02, 0, bodyProfile(MORPH.d1Origin).top * SL, zOf(MORPH.d1Origin, SL));
    mk('DorsalFin2', this.bones.Spine03, 0, bodyProfile(MORPH.d2Origin).top * SL, zOf(MORPH.d2Origin, SL));
    mk('AnalFin', this.bones.Spine03, 0, -bodyProfile(MORPH.anOrigin).bottom * SL, zOf(MORPH.anOrigin, SL));

    this.root = root;
    root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.list);
    this.index = {}; this.list.forEach((b, i) => { this.index[b.name] = i; });
    this.rest = this.list.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));
  }

  placeEye(side, localAbs) {
    const b = this.bones[side === 'L' ? 'Eye_L' : 'Eye_R'];
    b.userData.abs.copy(localAbs);
    b.position.copy(localAbs).sub(this.bones.Head.userData.abs);
    this.rest[this.index[b.name]].p.copy(b.position);
  }

  finalize() {
    this.root.updateMatrixWorld(true);
    this.skeleton.calculateInverses();
    this.rest = this.list.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));
  }

  resetPose() {
    this.list.forEach((b, i) => { b.position.copy(this.rest[i].p); b.quaternion.copy(this.rest[i].q); });
  }

  // ---- skin weights ------------------------------------------------------
  // Returns up to 4 {bone index, weight} for an axial coordinate s.
  axialWeights(s) {
    const out = [];
    const N = AXIAL_NODES;
    if (s <= N[0].s) { out.push([this.index[N[0].bone], 1]); return out; }
    if (s >= N[N.length - 1].s) { out.push([this.index[N[N.length - 1].bone], 1]); return out; }
    for (let i = 0; i < N.length - 1; i++) {
      if (s >= N[i].s && s <= N[i + 1].s) {
        // cosine blend → C1 continuous weights, no visible kinks at node centres
        const t = (s - N[i].s) / (N[i + 1].s - N[i].s);
        const w = 0.5 - 0.5 * Math.cos(Math.PI * t);
        out.push([this.index[N[i].bone], 1 - w], [this.index[N[i + 1].bone], w]);
        break;
      }
    }
    return out;
  }

  // Body vertex weights: axial + jaw + operculum regions.
  // seg: 'upper' | 'lower' (lip split), theta: angle from dorsal (rad, 0..2π; left side < π)
  bodyWeights(s, theta, seg, rictusS) {
    let w = this.axialWeights(s);
    // Mandible: everything in the lower lip segment in front of the rictus, fading
    // into the branchiostegal/throat region so the throat expands with jaw depression.
    if (seg === 'lower') {
      const ventral = smoothstep(0.35, 0.95, Math.abs(Math.cos(theta)) * (Math.cos(theta) < 0 ? 1 : 0));
      let jw = 1 - smoothstep(rictusS - 0.012, rictusS + 0.005, s);
      jw = Math.max(jw, ventral * (1 - smoothstep(rictusS, 0.25, s)) * 0.85);
      if (jw > 0) w = mix(w, [[this.index.Jaw, 1]], clamp(jw, 0, 1));
    }
    // Operculum flaps: lateral head surface in front of the gill opening.
    const lat = Math.sin(theta);           // +1 left, -1 right
    const lower = -Math.cos(theta);        // +1 ventral
    const inOperc = smoothstep(0.17, 0.235, s) * (1 - smoothstep(0.255, 0.268, s)) *
      smoothstep(0.35, 0.75, Math.abs(lat)) * smoothstep(-0.45, -0.1, lower);
    if (inOperc > 0.001) {
      const bone = lat > 0 ? this.index.Operc_L : this.index.Operc_R;
      w = mix(w, [[bone, 1]], inOperc * 0.9);
    }
    return w;
  }
}

function mix(a, b, t) {
  const m = new Map();
  for (const [i, w] of a) m.set(i, (m.get(i) || 0) + w * (1 - t));
  for (const [i, w] of b) m.set(i, (m.get(i) || 0) + w * t);
  return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
}

export function packWeights(list) {
  const idx = [0, 0, 0, 0], wt = [0, 0, 0, 0];
  let sum = 0;
  list.forEach(([i, w], k) => { if (k < 4) { idx[k] = i; wt[k] = w; sum += w; } });
  for (let k = 0; k < 4; k++) wt[k] = sum > 0 ? wt[k] / sum : (k === 0 ? 1 : 0);
  return { idx, wt };
}
