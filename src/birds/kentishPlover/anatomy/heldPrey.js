import * as THREE from 'three';
import { BILL } from './bareParts.js';

// Prey held in the bill while it is handled (ACTIONS.peck): a ragworm pulled from the mud (stretched to its
// burrow while the bird tugs, then dangling and swallowed in jerks), a small crab gripped across the bill tip (p007)
// or an amphipod. Parented to the head bone; posed per frame from the animator's `held` state
// (KentishPloverModel.setHeldPrey). Sizes from the prey (mm): ragworm 25–35 × 1.6, crab carapace 8–10, amphipod 6.

const WORM_N = 14; // points along the worm
const WORM_R = 6; // vertices round it
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();

function wormGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WORM_N * WORM_R * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(WORM_N * WORM_R * 3), 3));
  const idx = [];
  for (let i = 0; i < WORM_N - 1; i++)
    for (let j = 0; j < WORM_R; j++) {
      const a = i * WORM_R + j;
      const b = i * WORM_R + ((j + 1) % WORM_R);
      idx.push(a, a + WORM_R, b, b, a + WORM_R, b + WORM_R);
    }
  g.setIndex(idx);
  return g;
}

function crabGroup(mat, legMat) {
  const g = new THREE.Group();
  // carapace: a flattened, slightly wider-than-long ellipsoid (mm → m below)
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), mat);
  body.scale.set(4.6, 1.7, 3.8);
  g.add(body);
  // walking legs (3 a side) and claws, bent down at the knee
  const seg = new THREE.CylinderGeometry(0.35, 0.28, 1, 5);
  seg.translate(0, 0.5, 0);
  for (const s of [-1, 1])
    for (let k = 0; k < 4; k++) {
      const claw = k === 3;
      const root = new THREE.Group();
      root.position.set(s * 3.8, -0.4, -1.8 + k * 1.3);
      root.rotation.set(0, 0, s * -1.15);
      const a = new THREE.Mesh(seg, legMat);
      a.scale.set(claw ? 1.5 : 1, claw ? 3.2 : 4, claw ? 1.5 : 1);
      root.add(a);
      const knee = new THREE.Group();
      knee.position.y = claw ? 3.2 : 4;
      knee.rotation.z = s * (claw ? 1.4 : 1.9);
      const b = new THREE.Mesh(seg, legMat);
      b.scale.set(claw ? 1.8 : 0.8, claw ? 2.6 : 4, claw ? 1.8 : 0.8);
      knee.add(b);
      root.add(knee);
      if (claw) root.rotation.y = s * 0.8;
      g.add(root);
    }
  return g;
}

export class HeldPrey {
  /** @param {THREE.Bone} head  head bone (bind world rotation = identity, position J.head mm) */
  constructor(head, headJoint) {
    this.head = head;
    // bill tip in head-local mm, a little behind and between the mandibles
    this.tip = new THREE.Vector3(...BILL.tip.map((x, i) => x - headJoint[i])).add(new THREE.Vector3(0, -0.5, -1.6));
    this.root = new THREE.Group();
    this.root.name = 'heldPrey';
    this.root.scale.setScalar(0.001);
    this.root.visible = false;
    head.add(this.root);
    const wormMat = new THREE.MeshStandardMaterial({ color: 0x8a4a3c, roughness: 0.35, metalness: 0 });
    this.worm = new THREE.Mesh(wormGeometry(), wormMat);
    this.worm.frustumCulled = false;
    const crabMat = new THREE.MeshStandardMaterial({ color: 0x6d6250, roughness: 0.6 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x7a6e5a, roughness: 0.6 });
    this.crab = crabGroup(crabMat, legMat);
    const amphMat = new THREE.MeshStandardMaterial({ color: 0xb8ab92, roughness: 0.45, transparent: true, opacity: 0.92 });
    const amph = new THREE.CapsuleGeometry(0.9, 4.2, 3, 8);
    amph.rotateZ(Math.PI / 2);
    this.amph = new THREE.Mesh(amph, amphMat);
    for (const o of [this.worm, this.crab, this.amph]) {
      this.root.add(o);
      o.traverse((c) => {
        if (c.isMesh) c.castShadow = true;
      });
    }
    this._pts = Array.from({ length: WORM_N }, () => new THREE.Vector3());
  }

  /**
   * @param {null|{type:string, k:number, anchor?:THREE.Vector3, swing?:number, time?:number}} s
   *   k: how much of it is outside the bill (1 whole … 0 swallowed); anchor: world point its far end is still
   *   held at (a worm being pulled from its burrow); swing: side-to-side angular velocity proxy (crab shake)
   */
  set(s) {
    if (!s || !(s.k > 0.02)) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const type = s.type === 'polychaete' ? 'worm' : s.type === 'crab' ? 'crab' : 'amph';
    this.worm.visible = type === 'worm';
    this.crab.visible = type === 'crab';
    this.amph.visible = type === 'amph';
    if (type === 'worm') this._worm(s);
    else {
      const o = type === 'crab' ? this.crab : this.amph;
      // gripped across the bill tip, hanging below it; shrinks into the gape as it is swallowed
      const k = Math.min(1, s.k);
      o.position.copy(this.tip).add(_v.set(0, type === 'crab' ? -2.6 : -1.1, type === 'crab' ? 0.6 : 0.2));
      o.rotation.set(type === 'crab' ? 0.35 : 0.2, 0, (s.swing ?? 0) * 0.5);
      o.scale.setScalar(type === 'crab' ? 0.55 + 0.45 * k : 0.4 + 0.6 * k);
      if (type === 'crab') {
        // legs flail while it is shaken
        const t = s.time ?? 0;
        o.children.forEach((c, i) => {
          if (i > 0) c.rotation.x = Math.sin(t * 23 + i * 1.7) * 0.25;
        });
      }
    }
  }

  _worm(s) {
    this.head.updateMatrixWorld(true);
    const inv = _m.copy(this.head.matrixWorld).invert();
    const len = 30 * s.k; // mm outside the bill
    const P = this._pts;
    const t = s.time ?? 0;
    // gravity in head-local mm
    const down = _w.set(0, -1, 0).transformDirection(inv).normalize();
    if (s.anchor) {
      // stretched from the bill to the burrow mouth, a slight sag and the tension tremor
      // (world → head-local m → the root's mm)
      const end = _v.copy(s.anchor).applyMatrix4(inv).multiplyScalar(1000);
      for (let i = 0; i < WORM_N; i++) {
        const u = i / (WORM_N - 1);
        P[i].copy(this.tip).lerp(end, u).addScaledVector(down, Math.sin(u * Math.PI) * 1.5);
      }
    } else {
      // dangling and writhing: hangs from the bill, curling slowly
      const dir = new THREE.Vector3().copy(down);
      const side = new THREE.Vector3(1, 0, 0).sub(down.clone().multiplyScalar(down.x)).normalize();
      const p = this.tip.clone();
      const step = len / (WORM_N - 1);
      for (let i = 0; i < WORM_N; i++) {
        const u = i / (WORM_N - 1);
        P[i].copy(p);
        const a = Math.sin(t * 7 + u * 5) * 0.9 * u + (s.swing ?? 0) * 0.6 * u;
        const d = dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).add(new THREE.Vector3(0, 0, 0.35 * (1 - u)));
        p.addScaledVector(d.normalize(), step);
      }
    }
    // tube
    const pos = this.worm.geometry.getAttribute('position');
    const nrm = this.worm.geometry.getAttribute('normal');
    const T = new THREE.Vector3();
    const N = new THREE.Vector3();
    const B = new THREE.Vector3();
    for (let i = 0; i < WORM_N; i++) {
      const u = i / (WORM_N - 1);
      T.copy(P[Math.min(WORM_N - 1, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
      N.set(0, 1, 0).cross(T);
      if (N.lengthSq() < 1e-6) N.set(1, 0, 0).cross(T);
      N.normalize();
      B.crossVectors(T, N);
      // segmented ragworm: thickest a third of the way, tapering to the tail; ring bumps
      const r = (0.85 - 0.45 * Math.max(0, u - 0.3)) * (1 + 0.08 * Math.sin(u * 60));
      for (let j = 0; j < WORM_R; j++) {
        const a = (j / WORM_R) * Math.PI * 2;
        const nx = N.x * Math.cos(a) + B.x * Math.sin(a);
        const ny = N.y * Math.cos(a) + B.y * Math.sin(a);
        const nz = N.z * Math.cos(a) + B.z * Math.sin(a);
        const k = i * WORM_R + j;
        pos.setXYZ(k, P[i].x + nx * r, P[i].y + ny * r, P[i].z + nz * r);
        nrm.setXYZ(k, nx, ny, nz);
      }
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
  }
}
