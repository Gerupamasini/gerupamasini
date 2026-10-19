// The トビハゼ head's skinning from its skeleton (skull.mjs): every skin vertex follows the bones it lies on, so the
// mouth, the gill covers and the throat open as the real mechanism does when the joints are posed.
//
// Weights: for each joint, the distance from the vertex to that joint's bones (in the bind pose); the nearest bones
// win, with a soft falloff (sigma) so the skin stretches between two bone groups instead of tearing. The tissue a
// vertex belongs to limits which joints may move it (head.mjs parts):
//   - the lower jaw's tissue (below the gape slit, in front of the rictus) moves only with the lower jaw, the hyoid and
//     the suspensoria; everything above the slit never with the lower jaw
//   - the premaxillae and maxillae move only the upper-lip pads: they slide under the snout's skin sheath, which stays
//     with the skull (Murdy 1989: the sheath overlies the upper lip, which slides out from under it)
// Then the weights are smoothed over the mesh (the slit and the gill slit separate it, so nothing smooths across them).
import { HEAD } from './anatomy.mjs';
import { HEAD_JOINTS, skullBones } from './skull.mjs';
import { worldTransforms, axisAngle, boundedUnion, v3 } from './skel.mjs';

export const JOINT_NAMES = HEAD_JOINTS.map((j) => j.name);

/**
 * Per-vertex joint weights.
 * @param pos   Float32Array of positions in HL (fish frame)
 * @param index Uint32Array triangles (for the smoothing)
 * @param head  the head's field (headSDF), with .parts
 * @param o     { sigma, smooth, rictus }
 * @returns { joints: Uint16Array(n*4), weights: Float32Array(n*4) }
 */
export function headWeights(pos, index, head, o = {}) {
  const sigma = o.sigma ?? 0.025, rictus = o.rictus ?? 0.33, iters = o.smooth ?? 16;
  const n = pos.length / 3, J = JOINT_NAMES.length;
  const box = { min: [-0.15, -0.15, -0.5], max: [1.25, 0.85, 0.5] };
  // one bounded union per joint (the eyes have no bones: the globes are separate meshes)
  const groups = JOINT_NAMES.map((name) => {
    const fs = skullBones().filter((b) => b.joint === name).map((b) => b.field);
    return fs.length ? boundedUnion(fs, box) : null;
  });
  const idx = Object.fromEntries(JOINT_NAMES.map((nm, i) => [nm, i]));
  const lowerOnly = new Set(['J_jaw', 'J_imj', 'J_hyoid', 'J_suspL', 'J_suspR'].map((k) => idx[k]));
  const jawJ = new Set(['J_jaw', 'J_imj'].map((k) => idx[k]));
  const lipJ = new Set(['J_premax', 'J_maxL', 'J_maxR'].map((k) => idx[k]));
  const W = new Float32Array(n * J);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const p = head.parts(x, y, z);
    const onPad = p.u < 0.008;
    const lower = x < rictus && p.j < p.f - 0.002;
    const d = new Float64Array(J).fill(Infinity);
    for (let k = 0; k < J; k++) {
      if (!groups[k]) continue;
      if (lower && !lowerOnly.has(k)) continue;
      // above the slit, and on the cheek behind the rictus, the lower jaw moves only the skin under its hinge
      if (!lower && jawJ.has(k) && (x < rictus || y > 0.11 || x > 0.46)) continue;
      if (lipJ.has(k) && !onPad) continue;
      d[k] = Math.max(0, groups[k](x, y, z));
    }
    let dm = Infinity;
    for (let k = 0; k < J; k++) dm = Math.min(dm, d[k]);
    let sum = 0;
    for (let k = 0; k < J; k++) { const w = d[k] < Infinity ? Math.exp(-(d[k] - dm) / sigma) : 0; W[v * J + k] = w; sum += w; }
    for (let k = 0; k < J; k++) W[v * J + k] /= sum || 1;
  }
  // smoothing over the mesh's edges (Laplacian, a few passes)
  if (iters > 0) {
    const nb = Array.from({ length: n }, () => new Set());
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
    }
    let cur = W, nxt = new Float32Array(W.length);
    for (let it = 0; it < iters; it++) {
      for (let v = 0; v < n; v++) {
        const s = nb[v].size;
        for (let k = 0; k < J; k++) {
          let acc = cur[v * J + k];
          for (const u of nb[v]) acc += cur[u * J + k];
          nxt[v * J + k] = acc / (s + 1);
        }
      }
      [cur, nxt] = [nxt, cur];
    }
    W.set(cur);
  }
  // the four largest, renormalised
  const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const order = [...Array(J).keys()].sort((a, b) => W[v * J + b] - W[v * J + a]).slice(0, 4);
    let s = 0;
    for (const k of order) s += W[v * J + k];
    order.forEach((k, i) => { joints[v * 4 + i] = k; weights[v * 4 + i] = W[v * J + k] / (s || 1); });
  }
  return { joints, weights };
}

/**
 * Named poses (the mechanism's couplings from Michel et al. 2014, research/anat_mech.md §6): angles in degrees about
 * each joint's axis, `lift` about its second axis, `slide` along its slide (HL), `t` a translation (HL).
 */
export const HEAD_POSES = {
  rest: {},
  // a strike on land at full gape: the lower jaw down 70°, the premaxillae protruded, the maxillae swung forward, the
  // hyoid depressed, the suspensoria and gill covers abducted
  gapeFull: { J_jaw: { angle: 70 }, J_imj: { angle: 15 }, J_premax: { angle: 12, slide: 0.07 }, J_maxL: { angle: 25 }, J_maxR: { angle: 25 }, J_hyoid: { angle: 14 }, J_suspL: { angle: 6 }, J_suspR: { angle: 6 }, J_opercL: { angle: 8 }, J_opercR: { angle: 8 } },
  gapeHalf: { J_jaw: { angle: 32 }, J_premax: { angle: 6, slide: 0.035 }, J_maxL: { angle: 12 }, J_maxR: { angle: 12 }, J_hyoid: { angle: 6 } },
  // buccal pumping: the hyoid down, the cheeks out, the mouth shut
  gulp: { J_hyoid: { angle: 16 }, J_suspL: { angle: 10 }, J_suspR: { angle: 10 }, J_opercL: { angle: 6 }, J_opercR: { angle: 6 } },
  // venting through the gill slits: the gill covers swing out
  vent: { J_opercL: { angle: 18 }, J_opercR: { angle: 18 }, J_suspL: { angle: 4 }, J_suspR: { angle: 4 } },
  // the eyes raised (alert) and pulled down into the orbits (blink)
  eyesUp: { J_eyeL: { t: [0, 0.03, 0] }, J_eyeR: { t: [0, 0.03, 0] } },
  blink: { J_eyeL: { t: [0, -0.10, 0] }, J_eyeR: { t: [0, -0.10, 0] }, morph: { blinkL: 1, blinkR: 1 } },
};

/** Local joint transforms for a pose. */
export function poseLocals(pose) {
  const local = {};
  for (const j of HEAD_JOINTS) {
    const p = pose[j.name];
    if (!p) continue;
    let R;
    if (p.angle && j.axis) R = axisAngle(j.axis, (p.angle * Math.PI) / 180);
    if (p.lift && j.lift) { const L = axisAngle(j.lift, (p.lift * Math.PI) / 180); R = R ? mul3(R, L) : L; }
    local[j.name] = { R, t: p.slide && j.slide ? v3.add(v3.mul(j.slide, p.slide), p.t ?? [0, 0, 0]) : p.t };
  }
  return local;
}
const mul3 = (A, B) => { const C = new Array(9); for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) C[i * 3 + k] = A[i * 3] * B[k] + A[i * 3 + 1] * B[3 + k] + A[i * 3 + 2] * B[6 + k]; return C; };

/** World transforms of the head's joints for a pose (by name). */
export const poseWorld = (pose) => worldTransforms(HEAD_JOINTS, poseLocals(pose));

/** Linear blend skinning of positions and normals (HL) by a pose's world transforms. */
export function skinVertices(pos, nrm, skin, W) {
  const n = pos.length / 3, P = new Float32Array(pos.length), N = new Float32Array(nrm.length);
  const T = JOINT_NAMES.map((nm) => W[nm] ?? { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
  for (let v = 0; v < n; v++) {
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], q = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < 4; i++) {
      const w = skin.weights[v * 4 + i];
      if (!w) continue;
      const { R, t } = T[skin.joints[v * 4 + i]];
      px += w * (R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + t[0]);
      py += w * (R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + t[1]);
      pz += w * (R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + t[2]);
      nx += w * (R[0] * q[0] + R[1] * q[1] + R[2] * q[2]);
      ny += w * (R[3] * q[0] + R[4] * q[1] + R[5] * q[2]);
      nz += w * (R[6] * q[0] + R[7] * q[1] + R[8] * q[2]);
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz;
    N[v * 3] = nx / l; N[v * 3 + 1] = ny / l; N[v * 3 + 2] = nz / l;
  }
  return { position: P, normal: N };
}

/**
 * The blink's blend shapes (left and right): the dermal cup sliding up over the globe as the globe is pulled down
 * into the orbit (Aiello et al. 2023: the eye drops ≈0.5 ED and the cup, which no muscle moves, rises over it). The
 * cup is a sheet round the globe: each of its vertices keeps its distance from the globe's centre and its azimuth,
 * while its elevation is stretched from the collar's base (fixed to the head) up to the rim, which comes to lie near
 * the top of the lowered globe; the upper part of the sheet follows the globe down.
 * @returns { L: Float32Array, R: Float32Array } displacements (HL)
 */
export function blinkTargets(pos, nrm, headSDF, K, o = {}) {
  const drop = o.drop ?? 0.10, top = o.top ?? 1.22, base = o.base ?? -1.15;
  const E = HEAD.eye, re = E.d / 2, C = K.cup, lo = (C.low * Math.PI) / 180;
  const rimH = (px, pz) => { const D = Math.atan2(-px, pz) - lo; return C.A - C.B * Math.cos(D) - C.C * Math.cos(2 * D); };
  const n = pos.length / 3, L = new Float32Array(n * 3), R = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const z = pos[v * 3 + 2], side = z >= 0 ? 1 : -1;
    const dx = pos[v * 3] - E.s, dy = pos[v * 3 + 1] - E.y, dz = Math.abs(z) - E.z;
    const r = Math.hypot(dx, dy, dz);
    if (r > re + 0.075 || r < 1e-6) continue;
    const e = Math.asin(Math.max(-1, Math.min(1, dy / r)));
    if (e <= base) continue;
    const er = Math.asin(Math.max(-0.99, Math.min(0.99, rimH(dx, dz) / (re + 0.012))));
    const t = Math.min(1.25, (e - base) / Math.max(0.05, er - base));
    const e2 = base + t * (top - base), ts = smooth(0, 1, t);
    // fade out away from the globe (the head round the collar keeps its shape)
    const w = 1 - smooth(re + 0.05, re + 0.075, r);
    const h = Math.hypot(dx, dz) || 1e-9, ch = Math.cos(e2) * r, nx = (dx / h) * ch, nz = (dz / h) * ch;
    const ny = Math.sin(e2) * r - drop * ts;
    const T = side > 0 ? L : R;
    T[v * 3] = (nx - dx) * w; T[v * 3 + 1] = (ny - dy) * w; T[v * 3 + 2] = (nz - dz) * w * side;
  }
  return { L, R };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
