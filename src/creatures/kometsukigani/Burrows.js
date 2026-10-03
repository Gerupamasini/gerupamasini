import { BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { makeCapMaterial, makeGroundDecalMaterial, makeShaftMaterial } from './ScopimeraGlobosaMaterial.js';

/**
 * Burrows on the ground: the open mouths near the camera are real holes, the rest are decals.
 *
 * A real hole is three things drawn in this order (renderOrder): the shaft (an oblique tube whose top is cut
 * exactly where it meets the sand, flared into a worn funnel) and the crabs; then a "depth cap" over the opening
 * that writes only depth; then the terrain, which fails the depth test inside the opening — so the flat shows a
 * hole without its shader knowing, and a crab down the shaft is seen through it. Farther away, plugged or in the
 * debug-less low quality, a burrow is a darkening decal (unlit, multiplied onto the sand).
 *
 * Instance space: the entrance centre on the ground, +Y the ground normal, the shaft leaning toward -Z, unit radius.
 */

export const SHAFT_TILTS = [0.35, 0.6, 0.85];      // rad from vertical: the three shaft variants
const SHAFT_LEN = 9;                                 // in entrance radii (about 4–5 cm for a 1 cm hole)
const MAX_OPEN = 40;
const MAX_DECALS = 6000;
export const RENDER_ORDER = { shaft: -30, crab: -30, cap: -20 };

const _m = new Matrix4(), _q = new Quaternion(), _q2 = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _n = new Vector3();
const UP = new Vector3(0, 1, 0);

/** the shaft: a tube along the tilted axis, its top ring lying in the ground plane, flared at the mouth; plus the cap */
function shaftGeometry(tilt, radial = 28, rings = 22) {
  const A = new Vector3(0, -Math.cos(tilt), -Math.sin(tilt));          // down the shaft
  const U = new Vector3(1, 0, 0);
  const V = new Vector3().crossVectors(A, U).normalize();
  const pos = [], nor = [], dep = [], idx = [];
  const top = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    for (let i = 0; i <= radial; i++) {
      const th = (i / radial) * Math.PI * 2;
      const dir = new Vector3().addScaledVector(U, Math.cos(th)).addScaledVector(V, Math.sin(th));
      // where this generator line leaves the ground (y = 0)
      const s0 = -dir.y / A.y;
      const s = s0 + v * v * SHAFT_LEN;                    // rings bunch near the mouth
      // the worn, crumbly mouth: wider and irregular at the top, settling to the shaft below
      const ragged = 1 + (0.07 * Math.sin(th * 3 + 1.3) + 0.05 * Math.sin(th * 7 + 0.4) + 0.03 * Math.sin(th * 13 + 2.2)) * Math.exp(-(((s - s0) / 0.6) ** 2));
      const flare = (1 + 0.18 * Math.exp(-(((s - s0) / 0.4) ** 2)) - 0.05 * Math.min(1, (s - s0) / SHAFT_LEN)) * ragged;
      const p = new Vector3().addScaledVector(A, s).addScaledVector(dir, flare);
      if (j === 0) { p.y = 0; top.push(p.clone()); }
      pos.push(p.x, p.y, p.z);
      nor.push(-dir.x, -dir.y, -dir.z);                    // facing into the hole
      dep.push(Math.min(1, (s - s0) / SHAFT_LEN));
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < radial; i++) {
    const a = j * (radial + 1) + i, b = a + 1, c = a + radial + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  // bottom: closed, dark
  const base = pos.length / 3;
  const end = new Vector3().addScaledVector(A, SHAFT_LEN + 0.3);
  pos.push(end.x, end.y, end.z); nor.push(-A.x, -A.y, -A.z); dep.push(1);
  for (let i = 0; i < radial; i++) idx.push(rings * (radial + 1) + i, rings * (radial + 1) + i + 1, base);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('aDepth', new BufferAttribute(new Float32Array(dep), 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  // cap: a fan over the top ring (exactly the opening), raised a hair
  const cp = [0, 0.002, 0], ci = [];
  for (const p of top) cp.push(p.x, 0.002, p.z);
  for (let i = 1; i <= radial; i++) ci.push(0, i + 1, i);
  const cap = new BufferGeometry();
  cap.setAttribute('position', new BufferAttribute(new Float32Array(cp), 3));
  cap.setIndex(ci);
  cap.computeBoundingSphere();
  return { shaft: g, cap, axis: A };
}

let SHAFTS = null;
export function shaftVariants() {
  if (!SHAFTS) SHAFTS = SHAFT_TILTS.map((t) => shaftGeometry(t));
  return SHAFTS;
}

/** the shaft axis (world, unit, pointing down) for a burrow: tilt variant k, azimuth (rad), ground normal */
export function shaftAxis(k, azimuth, normal, out = new Vector3()) {
  const A = shaftVariants()[k].axis;
  _q.setFromUnitVectors(UP, normal).multiply(_q2.setFromAxisAngle(UP, azimuth));
  return out.copy(A).applyQuaternion(_q);
}

export class BurrowRenderer {
  constructor() {
    this.group = new Group();
    this.group.name = 'kg-burrows';
    const shaftMat = makeShaftMaterial();
    const capMat = makeCapMaterial();
    this.shafts = shaftVariants().map((v, k) => {
      const m = new InstancedMesh(v.shaft, shaftMat, MAX_OPEN);
      m.name = `kg-shaft-${k}`;
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = RENDER_ORDER.shaft;
      m.receiveShadow = true;
      return m;
    });
    this.caps = shaftVariants().map((v, k) => {
      const m = new InstancedMesh(v.cap, capMat, MAX_OPEN);
      m.name = `kg-cap-${k}`;
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = RENDER_ORDER.cap;
      return m;
    });
    const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.decalAttr = new InstancedBufferAttribute(new Float32Array(MAX_DECALS * 4), 4);
    plane.setAttribute('aDec', this.decalAttr);
    this.decals = new InstancedMesh(plane, makeGroundDecalMaterial(), MAX_DECALS);
    this.decals.name = 'kg-decals';
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 2;
    this.group.add(...this.shafts, ...this.caps, this.decals);
    this.nOpen = [0, 0, 0];
    this.nDec = 0;
  }

  begin() {
    this.nOpen = [0, 0, 0];
    this.nDec = 0;
  }

  /** an open burrow drawn as a real hole: entrance (world), radius (m), tilt variant, azimuth, ground normal */
  addOpen(e, r, k, azimuth, normal) {
    if (this.nOpen[k] >= MAX_OPEN) return false;
    _q.setFromUnitVectors(UP, normal).multiply(_q2.setFromAxisAngle(UP, azimuth));
    _m.compose(_p.copy(e), _q, _s.set(r, r, r));
    const i = this.nOpen[k]++;
    this.shafts[k].setMatrixAt(i, _m);
    this.caps[k].setMatrixAt(i, _m);
    return true;
  }

  /**
   * a ground decal: kind 0 mouth (strength = open 0..1, extra = collar wetness), 1 contact shadow, 2 scrape mark
   * sx, sz: half sizes (m); yaw: rotation about the normal
   */
  addDecal(p, normal, sx, sz, yaw, kind, strength, seed = 0, extra = 1) {
    if (this.nDec >= MAX_DECALS) return;
    _n.copy(normal);
    _q.setFromUnitVectors(UP, _n).multiply(_q2.setFromAxisAngle(UP, yaw));
    _m.compose(_p.copy(p).addScaledVector(_n, 0.0003), _q, _s.set(sx * 2, 1, sz * 2));
    const i = this.nDec++;
    this.decals.setMatrixAt(i, _m);
    this.decalAttr.setXYZW(i, kind, strength, seed, extra);
  }

  end() {
    for (let k = 0; k < 3; k++) {
      this.shafts[k].count = this.caps[k].count = this.nOpen[k];
      this.shafts[k].instanceMatrix.needsUpdate = true;
      this.caps[k].instanceMatrix.needsUpdate = true;
    }
    this.decals.count = this.nDec;
    this.decals.instanceMatrix.needsUpdate = true;
    this.decalAttr.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of [...this.shafts, ...this.caps, this.decals]) m.dispose();
  }
}
