import * as THREE from 'three';
import { WING, buildWingLayout, buildTailLayout } from './featherLayout.js';

// Bird skeleton (not a humanoid rig): pelvis → spine → neck chain → head; wings with one bone per flight
// feather and per covert (coverts are rooted on the arm: primary coverts on the hand, greater/median on the
// forearm, lesser on forearm/humerus); legs femur → tibiotarsus → tarsometatarsus → foot → 3 forward toes.
// Bind pose: every bone has identity world rotation except the right wing chain which is rotated
// 180° about Y so that left-wing local rotations mirror with q → (−x, −y, z, w).

const TOES = {
  // [angle from +Z toward lateral (deg), total length mm, segment fractions]
  inner: { angle: -27, length: 13, segs: [0.56, 0.44] },
  mid: { angle: 3, length: 19, segs: [0.38, 0.33, 0.29] },
  outer: { angle: 26, length: 15, segs: [0.42, 0.31, 0.27] },
};

// arm bone that carries each covert row (lesser coverts name theirs in the layout)
export const COVERT_ARM = { primaryCovert: 'hand', greaterCovert: 'forearm', medianCovert: 'forearm' };

/** Returns an ordered list of bone specs: {name, parent, pos[mm world], mirror(bool)} */
export function buildSkeletonSpec(cfg) {
  const J = cfg.joints;
  const specs = [];
  const add = (name, parent, pos, extra = {}) => specs.push({ name, parent, pos: [...pos], ...extra });

  add('root', null, [0, 0, 0]);
  add('body', 'root', J.body);
  add('chest', 'body', J.chest);
  add('neck0', 'chest', J.neck0);
  add('neck1', 'neck0', J.neck1);
  add('neck2', 'neck1', J.neck2);
  add('head', 'neck2', J.head);
  add('jaw', 'head', J.jaw);
  add('eye_L', 'head', J.eyeCenter);
  add('eye_R', 'head', [-J.eyeCenter[0], J.eyeCenter[1], J.eyeCenter[2]]);
  add('tail', 'body', J.tail);

  const wingFeathers = buildWingLayout();
  for (const side of ['L', 'R']) {
    const m = side === 'L' ? 1 : -1;
    const mir = (p) => [p[0] * m, p[1], p[2]];
    const mirror = side === 'R';
    add(`shoulder_${side}`, 'chest', mir(WING.shoulder), { mirror });
    add(`humerus_${side}`, `shoulder_${side}`, mir(WING.humerus), { mirror });
    add(`forearm_${side}`, `humerus_${side}`, mir(WING.elbow), { mirror });
    add(`hand_${side}`, `forearm_${side}`, mir(WING.wrist), { mirror });
    add(`alula_${side}`, `hand_${side}`, mir([WING.wrist[0] + 1, WING.wrist[1] + 0.5, WING.wrist[2] + 4]), { mirror });
    for (const f of wingFeathers) {
      if (f.type === 'lesserCovert' || f.type === 'alula' || COVERT_ARM[f.type]) {
        add(`${f.name}_${side}`, `${f.type === 'alula' ? 'alula' : COVERT_ARM[f.type] ?? f.bone}_${side}`, mir(f.base), { mirror, feather: f });
        continue;
      }
      if (!['primary', 'secondary', 'tertial'].includes(f.type)) continue;
      const parent = f.type === 'primary' ? 'hand' : f.type === 'secondary' ? 'forearm' : 'humerus';
      add(`${f.bone}_${side}`, `${parent}_${side}`, mir(f.base), { mirror, feather: f });
    }
  }

  const tailFeathers = buildTailLayout(J.tail);
  for (const f of tailFeathers) {
    if (f.type !== 'rectrix') continue;
    add(f.bone, 'tail', f.base, { feather: f });
  }

  for (const side of ['L', 'R']) {
    const m = side === 'L' ? 1 : -1;
    const mir = (p) => [p[0] * m, p[1], p[2]];
    add(`femur_${side}`, 'body', mir(J.hip));
    add(`tibio_${side}`, `femur_${side}`, mir(J.knee));
    add(`tarso_${side}`, `tibio_${side}`, mir(J.ankle));
    add(`foot_${side}`, `tarso_${side}`, mir(J.foot));
    for (const [key, toe] of Object.entries(TOES)) {
      const a = (toe.angle * Math.PI) / 180;
      const dir = [Math.sin(a) * m, 0, Math.cos(a)];
      let p = [...mir(J.foot)];
      // first phalanx descends from the joint (y 2.5 mm) to toe-centre height (0.9 mm)
      const segPts = [p];
      let acc = 0;
      toe.segs.forEach((f, si) => {
        acc += f;
        const along = toe.length * acc;
        const y = si === 0 ? 0.95 : 0.85 - 0.12 * si;
        segPts.push([mir(J.foot)[0] + dir[0] * along, y, mir(J.foot)[2] + dir[2] * along]);
      });
      for (let si = 0; si < toe.segs.length; si++) {
        const parent = si === 0 ? `foot_${side}` : `toe_${key}${si - 1}_${side}`;
        add(`toe_${key}${si}_${side}`, parent, segPts[si], { toe: key, seg: si, end: segPts[si + 1] });
      }
    }
  }
  // helper: carries the fore-neck / throat plumage half-way between the chest and the head (posed by the animator,
  // bodyMesh.computeSpineWeights). Last, so the other bones keep their indices.
  add('throat', 'chest', J.throat);
  return { specs, wingFeathers, tailFeathers, toes: TOES };
}

const Y180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** Instantiate THREE.Bones from a spec (positions converted from mm to metres). */
export function createBones(spec) {
  const bones = {};
  const list = [];
  const worldQ = {};
  const worldP = {};
  for (const s of spec.specs) {
    const b = new THREE.Bone();
    b.name = s.name;
    const wp = new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]).multiplyScalar(0.001);
    const wq = s.mirror ? Y180.clone() : new THREE.Quaternion();
    worldP[s.name] = wp;
    worldQ[s.name] = wq;
    if (s.parent) {
      const pq = worldQ[s.parent];
      const pp = worldP[s.parent];
      const inv = pq.clone().invert();
      b.position.copy(wp).sub(pp).applyQuaternion(inv);
      b.quaternion.copy(inv).multiply(wq);
      bones[s.parent].add(b);
    }
    b.userData.spec = s;
    b.userData.bindLocalPos = b.position.clone();
    b.userData.bindLocalQuat = b.quaternion.clone();
    bones[s.name] = b;
    list.push(b);
  }
  return { bones, list, root: bones.root, worldP, worldQ };
}
