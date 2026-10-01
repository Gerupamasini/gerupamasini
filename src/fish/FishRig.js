// CPU side of the fish rig.
//
// * Spine: NS world-space samples (position + orientation) produced by the
//   locomotion controller; sampled with Catmull-Rom exactly like the GPU.
// * Fins: every fin is driven by a few "ray chains" (see RigLayout). Each
//   chain is a position-based-dynamics polyline anchored to the body:
//     - inextensible segments (lepidotrichia do not stretch)
//     - bending stiffness decreasing from base to tip (fin rays taper; distal
//       segments are far more flexible — Alben, Madden & Lauder 2007)
//     - weak memory of the actively controlled rest pose (fin muscles set the
//       ray angles at the base: erection, spread, rowing)
//     - anisotropic hydrodynamic drag (plate normal >> tangential)
//     - membrane coupling between neighbouring chains
//   The result: fin tips lag behind the base, flutter, fold under load and
//   drape at rest — secondary motion emerges instead of being keyed.

import * as THREE from 'three';
import { NS } from './RigLayout.js';
import { buildFinDefs, profile, head } from './morphology.js';
import { surfacePointAtY } from './BodyGeometry.js';
import { clamp, lerp } from '../core/math.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

function interpRay(rays, r) {
  // linear interpolation of ray properties at fin position r (0..1)
  for (let i = 0; i < rays.length - 1; i++) {
    const a = rays[i];
    const b = rays[i + 1];
    if (r <= b.r + 1e-9) {
      const f = clamp((r - a.r) / Math.max(1e-9, b.r - a.r), 0, 1);
      return { s: lerp(a.s, b.s, f), y: lerp(a.y, b.y, f), z: lerp(a.z || 0, b.z || 0, f), angle: lerp(a.angle, b.angle, f), length: lerp(a.length, b.length, f), r };
    }
  }
  const l = rays[rays.length - 1];
  return { ...l, r };
}

// fin mechanical parameters: tip stiffness, rest-shape memory, drag,
// tangential damping, gravity sag, how far the fin droops when relaxed (rad)
// and how much its rays curl downward toward the tip (the soft distal ray
// segments sag; strongest in a relaxed fin). The caudal tip is damped well
// enough that a still fish has a still tail: it trails and sags instead of
// whipping.
const FIN_MECH = {
  0: { kBase: 0.97, kTip: 0.24, memBase: 0.38, memTip: 0.05, drag: 170, dragT: 5, grav: 0.35, droop: 0.12, curl: 0.6 }, // caudal
  1: { kBase: 0.96, kTip: 0.34, memBase: 0.45, memTip: 0.08, drag: 150, dragT: 4.5, grav: 0.2, droop: 0.1, curl: 0.2 }, // dorsal
  2: { kBase: 0.96, kTip: 0.32, memBase: 0.45, memTip: 0.08, drag: 150, dragT: 4.5, grav: 0.25, droop: 0, curl: 0.22 }, // anal
  3: { kBase: 0.97, kTip: 0.42, memBase: 0.6, memTip: 0.16, drag: 140, dragT: 4, grav: 0.15, droop: 0, curl: 0.1 }, // pectoral
  4: { kBase: 0.96, kTip: 0.34, memBase: 0.5, memTip: 0.1, drag: 150, dragT: 4, grav: 0.2, droop: 0, curl: 0.16 }, // pelvic
};

export class FishRig {
  /**
   * @param layout rig layout
   * @param variation per-fish fin proportions (see morphology.buildFinDefs)
   * @param SL standard length in metres
   */
  constructor(layout, variation, SL) {
    this.layout = layout;
    this.SL = SL;
    this.defs = buildFinDefs(variation);
    this.spineP = new Float32Array(NS * 3);
    this.spineQ = new Float32Array(NS * 4);
    for (let i = 0; i < NS; i++) this.spineQ[i * 4 + 3] = 1;
    this.stiffnessMul = 1;
    this.dragMul = 1;
    this.floor = null; // local ground plane {x, z, y, gx, gz} (set while in the tank)
    this.flow = new THREE.Vector3(); // ambient water velocity (flume / filter current)
    this.iterations = 2; // PBD constraint iterations per substep

    // chains
    this.chains = [];
    let nodeTotal = 0;
    for (const fin of layout.fins) {
      const def = this.defs[fin.name.replace(/[LR]$/, '')];
      fin.chainStart = this.chains.length;
      for (let j = 0; j < def.chains.length; j++) {
        const ray = interpRay(def.rays, def.chains[j]);
        const M = def.nodes;
        const ch = {
          fin,
          type: fin.type,
          side: fin.side,
          j,
          M,
          ray,
          offset: nodeTotal,
          seg: 0,
          rootLocal: new THREE.Vector3(), // rest attachment in SL units (fish-local)
          restDir: new THREE.Vector3(1, 0, 0),
          rootW: new THREE.Vector3(),
          rootPrev: new THREE.Vector3(),
          // leading rays (both outer rays of the forked caudal) are stiffer
          lead: j === 0 || (fin.type === 0 && j === def.chains.length - 1) ? 1 : 0,
          // rays differ a little in their distal flexibility: the trailing
          // edge bends unevenly instead of moving as one straight line
          flex: 1 + 0.16 * Math.sin(j * 2.39 + (variation.seed ?? 0) * 1.7 + fin.type * 0.9),
          // the soft rays next to the caudal fork are the most flexible
          inner: fin.type === 0 ? 1 - Math.abs(def.chains[j] - 0.5) * 2 : 0,
        };
        // attachment point on the body
        if (fin.type === 3 || fin.type === 4) {
          const y = fin.type === 3 ? ray.y : profile.bot(ray.s) + 0.012;
          const p = new THREE.Vector3();
          if (fin.type === 4) {
            p.set(-ray.s, y, fin.side * (0.018 + 0.012 * ray.r));
          } else {
            surfacePointAtY(ray.s, y, fin.side, p);
            p.z -= fin.side * 0.004;
          }
          ch.rootLocal.copy(p);
        } else {
          ch.rootLocal.set(-ray.s, ray.y, 0);
        }
        nodeTotal += M;
        this.chains.push(ch);
      }
    }
    this.nodeTotal = nodeTotal;
    this.pos = new Float32Array(nodeTotal * 3);
    this.vel = new Float32Array(nodeTotal * 3);
    this.pred = new Float32Array(nodeTotal * 3);
    this.nrm = new Float32Array(nodeTotal * 3);
    this.restCross = new Float32Array(nodeTotal); // rest distance to next chain (same node index)
    this.initialized = false;

    // fin pose (set by locomotion)
    this.pose = {
      dorsalErect: 1,
      analErect: 1,
      caudalSpread: 0.9,
      relax: 0, // 0..1: slow, calm fish -> fins droop slightly
      pect: [
        { ext: 0.6, brake: 0, stroke: 0, feather: 0, spread: 0.8 },
        { ext: 0.6, brake: 0, stroke: 0, feather: 0, spread: 0.8 },
      ],
      pelv: [
        { ext: 0.6, spread: 0.7 },
        { ext: 0.6, spread: 0.7 },
      ],
    };
  }

  // ------------------------------------------------------------------ spine
  setSpine(rootPos, rootQuat, localP, localQ) {
    for (let i = 0; i < NS; i++) {
      _v.fromArray(localP, i * 3).applyQuaternion(rootQuat).add(rootPos);
      _v.toArray(this.spineP, i * 3);
      _q.fromArray(localQ, i * 4).premultiply(rootQuat);
      _q.toArray(this.spineQ, i * 4);
    }
  }

  sampleSpine(s, outP, outQ) {
    const u = clamp(s, 0, 1) * (NS - 1);
    const i = Math.min(Math.floor(u), NS - 2);
    const f = u - i;
    const P = this.spineP;
    const i0 = Math.max(0, i - 1);
    const i3 = Math.min(NS - 1, i + 2);
    for (let c = 0; c < 3; c++) {
      const p1 = P[i * 3 + c];
      const p2 = P[(i + 1) * 3 + c];
      const p0 = i > 0 ? P[i0 * 3 + c] : 2 * p1 - p2;
      const p3 = i + 2 < NS ? P[i3 * 3 + c] : 2 * p2 - p1;
      const t2 = f * f;
      const t3 = t2 * f;
      const val = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      if (c === 0) outP.x = val;
      else if (c === 1) outP.y = val;
      else outP.z = val;
    }
    if (outQ) {
      _q.fromArray(this.spineQ, i * 4);
      _q2.fromArray(this.spineQ, (i + 1) * 4);
      if (_q.dot(_q2) < 0) _q2.set(-_q2.x, -_q2.y, -_q2.z, -_q2.w);
      outQ.set(lerp(_q.x, _q2.x, f), lerp(_q.y, _q2.y, f), lerp(_q.z, _q2.z, f), lerp(_q.w, _q2.w, f)).normalize();
    }
  }

  /** World position of a rest-pose body point (fish-local SL units). */
  bodyPoint(local, out, outQ) {
    const s = -local.x;
    const s0 = clamp(s, 0, 1);
    const Q = outQ || new THREE.Quaternion();
    this.sampleSpine(s0, out, Q);
    _v2.set(-(s - s0), local.y, local.z).multiplyScalar(this.SL).applyQuaternion(Q);
    out.add(_v2);
    return out;
  }

  // ------------------------------------------------------------------ fins
  /** Rest direction of a chain in fish-local coordinates, given the fin pose. */
  _restDirLocal(ch, out) {
    const p = this.pose;
    const a = ch.ray.angle;
    const droop = FIN_MECH[ch.type].droop * p.relax;
    switch (ch.type) {
      case 0: {
        // relaxed comet lobes hang a little below the body axis
        const ae = a * p.caudalSpread - droop;
        return out.set(-Math.cos(ae), Math.sin(ae), 0);
      }
      case 1: {
        const ae = lerp(0.1 + 0.05 * ch.ray.r, a, p.dorsalErect) - droop * ch.ray.r;
        return out.set(-Math.cos(ae), Math.sin(ae), 0);
      }
      case 2: {
        const ae = lerp(0.14, a, p.analErect);
        return out.set(-Math.cos(ae), -Math.sin(ae), 0);
      }
      case 3:
        return this._pectoralDir(ch, out);
      case 4:
        return this._pelvicDir(ch, out);
    }
    return out;
  }

  _finFrame(D0, N, out) {
    // orthonormal basis (D0, S, N) with S pointing toward the trailing rays
    const S = _v2.crossVectors(N, D0).normalize();
    if (S.x > 0) S.negate();
    out.D.copy(D0).normalize();
    out.S.copy(S);
    return out;
  }

  _pectoralDir(ch, out) {
    const side = ch.side;
    const ps = this.pose.pect[side > 0 ? 0 : 1];
    // three reference poses (fish-local): adducted, hover-extended, braking
    const Df = _tmpA.set(-1, -0.16, 0.12 * side).normalize();
    const De = _tmpB.set(-0.62, -0.5, 0.6 * side).normalize();
    const Db = _tmpC.set(0.06, -0.42, 0.9 * side).normalize();
    const D0 = _tmpD.copy(Df).lerp(De, ps.ext).lerp(Db, ps.brake).normalize();
    // rowing stroke: rotate about the (oblique) fin-base hinge
    _axis.set(-0.6, -0.55, 0.15 * side).normalize();
    _qq.setFromAxisAngle(_axis, ps.stroke * side);
    D0.applyQuaternion(_qq);
    const Nf = _tmpE.set(0.02, 0.2, side).normalize();
    const Ne = _tmpF.set(0.12, 0.45, 0.88 * side).normalize();
    const Nb = _tmpG.set(0.95, 0.15, -0.1 * side).normalize();
    const N = _tmpH.copy(Nf).lerp(Ne, ps.ext).lerp(Nb, ps.brake).applyQuaternion(_qq);
    // feathering: rotate plane about the leading edge
    _qq.setFromAxisAngle(D0, ps.feather * side);
    N.applyQuaternion(_qq);
    // re-orthogonalise
    N.addScaledVector(D0, -N.dot(D0)).normalize();
    const S = _tmpI.crossVectors(N, D0).normalize();
    if (S.x > 0) S.negate();
    const phi = ch.ray.angle * ps.spread;
    return out.copy(D0).multiplyScalar(Math.cos(phi)).addScaledVector(S, Math.sin(phi)).normalize();
  }

  _pelvicDir(ch, out) {
    const side = ch.side;
    const ps = this.pose.pelv[side > 0 ? 0 : 1];
    const Df = _tmpA.set(-1, -0.12, 0.05 * side).normalize();
    const De = _tmpB.set(-0.74, -0.62, 0.26 * side).normalize();
    const D0 = _tmpD.copy(Df).lerp(De, ps.ext).normalize();
    const Nf = _tmpE.set(0.0, -0.1, side).normalize();
    const Ne = _tmpF.set(0.18, -0.12, 0.97 * side).normalize();
    const N = _tmpH.copy(Nf).lerp(Ne, ps.ext);
    N.addScaledVector(D0, -N.dot(D0)).normalize();
    const S = _tmpI.crossVectors(N, D0).normalize();
    if (S.x > 0) S.negate();
    const phi = ch.ray.angle * ps.spread;
    return out.copy(D0).multiplyScalar(Math.cos(phi)).addScaledVector(S, Math.sin(phi)).normalize();
  }

  /** Height of the gravel below the fish (from the last tank clamp). */
  floorY() {
    return this.floor ? this.floor.y : -Infinity;
  }

  /** Rigidly shift the posed spine and fins (positional collision fix-ups). */
  translate(dx, dy, dz) {
    for (let i = 0; i < NS; i++) {
      this.spineP[i * 3] += dx;
      this.spineP[i * 3 + 1] += dy;
      this.spineP[i * 3 + 2] += dz;
    }
    for (let i = 0; i < this.nodeTotal; i++) {
      this.pos[i * 3] += dx;
      this.pos[i * 3 + 1] += dy;
      this.pos[i * 3 + 2] += dz;
    }
    for (const ch of this.chains) {
      ch.rootW.x += dx;
      ch.rootW.y += dy;
      ch.rootW.z += dz;
    }
  }

  /** Recompute chain roots (world) and rest directions (world). */
  _updateRoots() {
    const Q = _qRoot;
    // caudal rays are carried by the hypural plate: one frame (last vertebra)
    this.sampleSpine(1.0, _tailP, _tailQ);
    for (const ch of this.chains) {
      ch.rootPrev.copy(ch.rootW);
      if (ch.type === 0) {
        const s = -ch.rootLocal.x;
        if (s >= 1.0) {
          _v2.set(-(s - 1.0), ch.rootLocal.y, ch.rootLocal.z).multiplyScalar(this.SL).applyQuaternion(_tailQ);
          ch.rootW.copy(_tailP).add(_v2);
        } else this.bodyPoint(ch.rootLocal, ch.rootW, Q);
        Q.copy(_tailQ);
      } else {
        this.bodyPoint(ch.rootLocal, ch.rootW, Q);
      }
      this._restDirLocal(ch, ch.restDir);
      ch.restDir.applyQuaternion(Q).normalize();
      ch.seg = (ch.ray.length * this.SL) / (ch.M - 1);
      // downward curl of the distal rays: strong in a relaxed fin, small in
      // a working one (water flow and fin muscles straighten the rays)
      ch.curl = FIN_MECH[ch.type].curl * (0.2 + 0.8 * this.pose.relax) * (1 + 0.25 * ch.inner);
    }
  }

  _placeRest() {
    for (const ch of this.chains) {
      for (let k = 0; k < ch.M; k++) {
        const i = (ch.offset + k) * 3;
        this.pos[i] = ch.rootW.x + ch.restDir.x * ch.seg * k;
        this.pos[i + 1] = ch.rootW.y + ch.restDir.y * ch.seg * k;
        this.pos[i + 2] = ch.rootW.z + ch.restDir.z * ch.seg * k;
        this.vel[i] = this.vel[i + 1] = this.vel[i + 2] = 0;
      }
      ch.rootPrev.copy(ch.rootW);
    }
    this._computeRestCross();
  }

  _computeRestCross() {
    for (const fin of this.layout.fins) {
      const c0 = fin.chainStart;
      const n = fin.nChains;
      for (let j = 0; j < n - 1; j++) {
        const a = this.chains[c0 + j];
        const b = this.chains[c0 + j + 1];
        for (let k = 0; k < a.M; k++) {
          const pa = _v.copy(a.rootW).addScaledVector(a.restDir, a.seg * k);
          const pb = _v2.copy(b.rootW).addScaledVector(b.restDir, b.seg * k);
          this.restCross[a.offset + k] = pa.distanceTo(pb);
        }
      }
    }
  }

  /** Advance fin dynamics. `flow` = ambient water velocity (world, m/s). */
  update(dt, substeps = 2) {
    this._updateRoots();
    if (!this.initialized) {
      this._placeRest();
      this._computeNormals();
      this.initialized = true;
      return;
    }
    // rest spacing between neighbouring rays only changes with the fin pose
    if ((this._frame = (this._frame || 0) + 1) % 3 === 0) this._computeRestCross();
    const h = dt / substeps;
    const pos = this.pos;
    const vel = this.vel;
    const pred = this.pred;
    const nrm = this.nrm;
    const fx = this.flow.x;
    const fy = this.flow.y;
    const fz = this.flow.z;
    for (let st = 0; st < substeps; st++) {
      const f0 = (st + 1) / substeps;
      for (const ch of this.chains) {
        const mech = FIN_MECH[ch.type];
        const kDrag = mech.drag * this.dragMul;
        const damp = Math.exp(-mech.dragT * h);
        // root: kinematic, interpolated across substeps
        const r = ch.offset * 3;
        pred[r] = lerp(ch.rootPrev.x, ch.rootW.x, f0);
        pred[r + 1] = lerp(ch.rootPrev.y, ch.rootW.y, f0);
        pred[r + 2] = lerp(ch.rootPrev.z, ch.rootW.z, f0);
        for (let k = 1; k < ch.M; k++) {
          const i = (ch.offset + k) * 3;
          // velocity relative to the water
          let vx = vel[i] - fx;
          let vy = vel[i + 1] - fy;
          let vz = vel[i + 2] - fz;
          // gravity (fins are slightly denser than water: long comet tails droop at rest)
          vy -= mech.grav * (k / (ch.M - 1)) * h;
          // quadratic drag normal to the membrane, linear tangential damping
          const nx = nrm[i];
          const ny = nrm[i + 1];
          const nz = nrm[i + 2];
          const vn = vx * nx + vy * ny + vz * nz;
          const vnNew = vn / (1 + kDrag * Math.abs(vn) * h + 6 * h);
          vx = (vx - vn * nx) * damp + vnNew * nx;
          vy = (vy - vn * ny) * damp + vnNew * ny;
          vz = (vz - vn * nz) * damp + vnNew * nz;
          vx += fx;
          vy += fy;
          vz += fz;
          vel[i] = vx;
          vel[i + 1] = vy;
          vel[i + 2] = vz;
          pred[i] = pos[i] + vx * h;
          pred[i + 1] = pos[i + 1] + vy * h;
          pred[i + 2] = pos[i + 2] + vz * h;
        }
      }
      // constraint projection
      for (let it = 0; it < this.iterations; it++) {
        for (const ch of this.chains) this._projectChain(ch);
        this._projectMembrane();
        if (this.floor) this._projectFloor();
        if (this.walls) this._projectWalls();
      }
      // velocities from positions
      for (let i = 0; i < this.nodeTotal * 3; i++) {
        vel[i] = (pred[i] - pos[i]) / h;
        pos[i] = pred[i];
      }
    }
    this._computeNormals();
  }

  _chainTables(ch) {
    const mech = FIN_MECH[ch.type];
    const stiff = this.stiffnessMul;
    if (ch.kap && ch.tabStiff === stiff) return;
    ch.kap = new Float32Array(ch.M);
    ch.mem = new Float32Array(ch.M);
    for (let k = 1; k < ch.M; k++) {
      const t = k / (ch.M - 1);
      const soft = lerp(1, ch.flex * (1 - 0.18 * ch.inner), t);
      ch.kap[k] = clamp(lerp(mech.kBase, mech.kTip, Math.pow(t, 0.8)) * (ch.lead ? 1.25 : soft) * stiff, 0, 0.995);
      ch.mem[k] = lerp(mech.memBase, mech.memTip, t) * Math.min(1.5, stiff) * (ch.lead ? 1 : soft);
    }
    ch.tabStiff = stiff;
  }

  _projectChain(ch) {
    this._chainTables(ch);
    const P = this.pred;
    const M = ch.M;
    const seg = ch.seg;
    const kapT = ch.kap;
    const memT = ch.mem;
    const rd = ch.restDir;
    const curl = ch.curl || 0;
    let px = rd.x;
    let py = rd.y;
    let pz = rd.z;
    for (let k = 1; k < M; k++) {
      const i = (ch.offset + k) * 3;
      const ip = i - 3;
      // bending stiffness tapers from base to tip (leading rays are stiffer)
      const kap = kapT[k];
      const mem = memT[k];
      // rest shape: the soft distal ray segments bend progressively
      // downward (the curvature grows toward the tip, so the ray arcs over
      // instead of tilting as a straight rod)
      const t = k / (M - 1);
      const sag = (1.5 * curl * t) / (M - 1);
      let dx = px * (1 - mem) + rd.x * mem;
      let dy = py * (1 - mem) + rd.y * mem - sag;
      let dz = pz * (1 - mem) + rd.z * mem;
      let dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const tx = P[ip] + (dx / dl) * seg;
      const ty = P[ip + 1] + (dy / dl) * seg;
      const tz = P[ip + 2] + (dz / dl) * seg;
      P[i] += (tx - P[i]) * kap;
      P[i + 1] += (ty - P[i + 1]) * kap;
      P[i + 2] += (tz - P[i + 2]) * kap;
      // inextensible segment
      dx = P[i] - P[ip];
      dy = P[i + 1] - P[ip + 1];
      dz = P[i + 2] - P[ip + 2];
      dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      P[i] = P[ip] + (dx / dl) * seg;
      P[i + 1] = P[ip + 1] + (dy / dl) * seg;
      P[i + 2] = P[ip + 2] + (dz / dl) * seg;
      px = dx / dl;
      py = dy / dl;
      pz = dz / dl;
    }
  }

  /** Fin nodes stay inside the glass (they slide along it, with friction). */
  _projectWalls() {
    const { min, max } = this.walls;
    const P = this.pred;
    const X = this.pos;
    // only near a wall (the longest fins reach ~1.1 SL from the spine)
    const reach = 1.3 * this.SL;
    const hx = this.spineP[0];
    const hz = this.spineP[2];
    const tx = this.spineP[(NS - 1) * 3];
    const tz = this.spineP[(NS - 1) * 3 + 2];
    if (Math.min(hx, tx) - min.x > reach && max.x - Math.max(hx, tx) > reach && Math.min(hz, tz) - min.z > reach && max.z - Math.max(hz, tz) > reach) return;
    const m = 0.0015;
    for (const ch of this.chains) {
      for (let k = 1; k < ch.M; k++) {
        const i = (ch.offset + k) * 3;
        let hit = false;
        if (P[i] < min.x + m) (P[i] = min.x + m), (hit = true);
        else if (P[i] > max.x - m) (P[i] = max.x - m), (hit = true);
        if (P[i + 2] < min.z + m) (P[i + 2] = min.z + m), (hit = true);
        else if (P[i + 2] > max.z - m) (P[i + 2] = max.z - m), (hit = true);
        if (hit) P[i + 1] = lerp(P[i + 1], X[i + 1], 0.5);
      }
    }
  }

  /** Fin nodes rest on the gravel instead of hanging into it (with friction). */
  _projectFloor() {
    const fl = this.floor;
    const P = this.pred;
    const X = this.pos;
    // only when the fish is close to the bottom (the longest fins reach ~1 SL)
    const lowest = fl.y + 1.2 * this.SL;
    if (this.spineP[(NS - 1) * 3 + 1] > lowest && this.spineP[1] > lowest) return;
    for (const ch of this.chains) {
      for (let k = 1; k < ch.M; k++) {
        const i = (ch.offset + k) * 3;
        const g = fl.y + fl.gx * (P[i] - fl.x) + fl.gz * (P[i + 2] - fl.z) + 0.0025;
        if (P[i + 1] < g) {
          P[i + 1] = g;
          // contact friction: the node barely slides along the gravel
          P[i] = lerp(P[i], X[i], 0.5);
          P[i + 2] = lerp(P[i + 2], X[i + 2], 0.5);
        }
      }
    }
  }

  _projectMembrane() {
    const P = this.pred;
    for (const fin of this.layout.fins) {
      const c0 = fin.chainStart;
      for (let j = 0; j < fin.nChains - 1; j++) {
        const a = this.chains[c0 + j];
        const b = this.chains[c0 + j + 1];
        for (let k = 1; k < a.M; k++) {
          const ia = (a.offset + k) * 3;
          const ib = (b.offset + k) * 3;
          const rest = this.restCross[a.offset + k];
          const dx = P[ib] - P[ia];
          const dy = P[ib + 1] - P[ia + 1];
          const dz = P[ib + 2] - P[ia + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const lo = rest * 0.72;
          const hi = rest * 1.12;
          let target = d;
          if (d > hi) target = hi;
          else if (d < lo) target = lo;
          else continue;
          const corr = ((d - target) / d) * 0.5 * 0.6;
          P[ia] += dx * corr;
          P[ia + 1] += dy * corr;
          P[ia + 2] += dz * corr;
          P[ib] -= dx * corr;
          P[ib + 1] -= dy * corr;
          P[ib + 2] -= dz * corr;
        }
      }
    }
  }

  _computeNormals() {
    const P = this.pos;
    const N = this.nrm;
    for (const fin of this.layout.fins) {
      const c0 = fin.chainStart;
      const nC = fin.nChains;
      for (let j = 0; j < nC; j++) {
        const ch = this.chains[c0 + j];
        const ja = this.chains[c0 + Math.max(0, j - 1)];
        const jb = this.chains[c0 + Math.min(nC - 1, j + 1)];
        for (let k = 0; k < ch.M; k++) {
          const ka = Math.max(0, k - 1);
          const kb = Math.min(ch.M - 1, k + 1);
          const ia = (ja.offset + k) * 3;
          const ib = (jb.offset + k) * 3;
          const ta = (ch.offset + ka) * 3;
          const tb = (ch.offset + kb) * 3;
          const cx = P[ib] - P[ia];
          const cy = P[ib + 1] - P[ia + 1];
          const cz = P[ib + 2] - P[ia + 2];
          let ax = P[tb] - P[ta];
          let ay = P[tb + 1] - P[ta + 1];
          let az = P[tb + 2] - P[ta + 2];
          if (k === 0 && ax * ax + ay * ay + az * az < 1e-14) {
            ax = ch.restDir.x;
            ay = ch.restDir.y;
            az = ch.restDir.z;
          }
          let nx = cy * az - cz * ay;
          let ny = cz * ax - cx * az;
          let nz = cx * ay - cy * ax;
          const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          const o = (ch.offset + k) * 3;
          N[o] = nx / l;
          N[o + 1] = ny / l;
          N[o + 2] = nz / l;
        }
      }
    }
  }

  /** Write spine + fin nodes into a row of the rig texture (Float32 RGBA). */
  writeRow(data, rowOffset) {
    let o = rowOffset;
    for (let i = 0; i < NS; i++) {
      data[o++] = this.spineP[i * 3];
      data[o++] = this.spineP[i * 3 + 1];
      data[o++] = this.spineP[i * 3 + 2];
      data[o++] = 1;
    }
    for (let i = 0; i < NS; i++) {
      data[o++] = this.spineQ[i * 4];
      data[o++] = this.spineQ[i * 4 + 1];
      data[o++] = this.spineQ[i * 4 + 2];
      data[o++] = this.spineQ[i * 4 + 3];
    }
    // chains are stored in layout order: fin -> chain -> node, (pos, normal)
    for (const ch of this.chains) {
      for (let k = 0; k < ch.M; k++) {
        const i = (ch.offset + k) * 3;
        data[o++] = this.pos[i];
        data[o++] = this.pos[i + 1];
        data[o++] = this.pos[i + 2];
        data[o++] = 1;
        data[o++] = this.nrm[i];
        data[o++] = this.nrm[i + 1];
        data[o++] = this.nrm[i + 2];
        data[o++] = 0;
      }
    }
    return o;
  }
}

const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();
const _tmpD = new THREE.Vector3();
const _tmpE = new THREE.Vector3();
const _tmpF = new THREE.Vector3();
const _tmpG = new THREE.Vector3();
const _tmpH = new THREE.Vector3();
const _tmpI = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _qq = new THREE.Quaternion();
const _qRoot = new THREE.Quaternion();
const _tailP = new THREE.Vector3();
const _tailQ = new THREE.Quaternion();
export { head, _m };
