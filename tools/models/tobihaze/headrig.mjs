// The トビハゼ head's skinning from its skeleton (skull.mjs): every skin vertex follows the bones it lies on, so the
// mouth, the gill covers and the throat open as the real mechanism does when the joints are posed.
//
// Weights: for each joint, the distance from the vertex to that joint's bones (in the bind pose); the nearest bones
// win, with a soft falloff (sigma) so the skin stretches between two bone groups instead of tearing. The tissue a
// vertex belongs to limits which joints may move it (head.mjs parts):
//   - the lower jaw's tissue (below the gape slit, in front of the rictus, told by the slit's own carve) moves only
//     with the lower jaw, the hyoid and the suspensoria; everything above the slit never with the lower jaw
//   - in front of the hyoid the intermandibular skin swings with the rami; over and behind it the floor and the
//     throat follow the hyoid; the roof of the mouth (and, in front of the rictus, all upper tissue) never does
//   - the premaxillae and maxillae move the upper-lip pads, and fading out the snout's sheath over the labial groove:
//     the pads slide out from under it (Murdy 1989), the sheath stays with the skull
//   - the suspensoria move the cheeks, not the snout's skin over the palatines
//   - behind the opercle's skin margin the skin is the trunk's (the pectoral girdle is rigid to the skull), but for a
//     band where the opercular membrane is fused to it; the gill slit's inner wall stays with the trunk, so the cover
//     swings off it and the slit opens
// Then the weights are smoothed over the mesh (never across the gape in front of the rictus, nor across the edge of
// the mouth's roof), the throat's membrane more than the rest.
// Blend shapes: the blink (the dermal cup closing over the lowered globe), the throat's pouch (buccal pumping) and the
// cheeks' inflation (u5: the skin carried onto the balloon of head-inflated.mjs, inflateTargets / inflateMorph).
import { HEAD } from './anatomy.mjs';
import { HEAD_JOINTS, skullBones } from './skull.mjs';
import { worldTransforms, axisAngle, boundedUnion, v3 } from './skel.mjs';

export const JOINT_NAMES = HEAD_JOINTS.map((j) => j.name);

// the opercle's skin margin and the gill slit of the n14 sculpt (head.mjs HEAD_SCULPT.opercle, .gillSlit), used when
// the caller does not pass the sculpt (o.K)
const OPERCLE_PATH = [[0.996, 0.50, 0.25], [1.014, 0.44, 0.29], [1.032, 0.36, 0.325], [1.032, 0.26, 0.34], [1.007, 0.15, 0.33], [0.962, 0.06, 0.29], [0.912, 0.02, 0.24]];
const GILL_SLIT = { y0: 0.175, y1: 0.375, depth: 0.020, reach: 0.10 };

/** The opercle's skin margin as s at height y: a cubic Hermite through its path's (s, y) points, as head.mjs draws it
 * (the gill cover's rim, the cheek's clip and the gill slit follow the same curve). */
export function marginCurve(path) {
  const opP = path.map((p) => [p[0], p[1]]).sort((a, b) => a[1] - b[1]);
  const opT = opP.map((_, i) => {
    const a = opP[Math.max(0, i - 1)], c = opP[Math.min(opP.length - 1, i + 1)];
    return (c[0] - a[0]) / (c[1] - a[1]);
  });
  return (y) => {
    if (y <= opP[0][1]) return opP[0][0];
    for (let i = 0; i + 1 < opP.length; i++) {
      const [s1, y1] = opP[i], [s2, y2] = opP[i + 1];
      if (y <= y2) {
        const h = y2 - y1, t = (y - y1) / h, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * s1 + (t3 - 2 * t2 + t) * h * opT[i] + (-2 * t3 + 3 * t2) * s2 + (t3 - t2) * h * opT[i + 1];
      }
    }
    return opP[opP.length - 1][0];
  };
}

/**
 * Which side of the gape a vertex is on (true: the lower jaw's tissue), told by the slit's own carve as head.mjs cuts
 * it (the lower jaw's tissue cut back 2·half from the upper head's field: full width up to its rounded end `slitEnd`
 * under the pads' rear ends, or, in the older form without slitEnd, tapering shut over the rictus by w³), not by the
 * raw fields, whose overlap under the pads would put upper-lip skin on the lower jaw. p: head.parts(x, y, z).
 */
export function gapeSide(K, rictus = 0.33) {
  const G = { yFront: 0.108, yBack: 0.092, half: 0.0025, rictus: 0.315, close: 0.060, lean: 1.3, ...(K?.gape ?? {}) };
  const ss = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
  const gapeY = (x) => G.yFront + (G.yBack - G.yFront) * ss(0.03, G.rictus, x);
  const wFront = (x, y) => 1 - ss(G.rictus - G.close * 0.4, G.rictus + G.close * 0.6, x - G.lean * Math.max(0, gapeY(x) - y));
  return (x, y, p) => {
    if (x >= rictus) return false;
    if (G.slitEnd !== undefined) {
      if (x < G.slitEnd) return Math.max(p.j, smin1(2 * G.half - p.f, G.slitEnd - x, G.endRound ?? 0.01)) < p.f;
      return p.j < p.f - 0.002;
    }
    const w = wFront(x, y);
    return w > 0.5 ? Math.max(p.j, 2 * G.half * w * w * w - p.f) < p.f : p.j < p.f - 0.002;
  };
}

/**
 * Per-vertex joint weights.
 * @param pos   Float32Array of positions in HL (fish frame)
 * @param index Uint32Array triangles (for the smoothing)
 * @param head  the head's field (headSDF), with .parts
 * @param o     { sigma, smooth, rictus, K (the sculpt: its gape, opercle margin and gill slit), floor, padReach, padPen, fuse,
 *              throatSmooth }
 * @returns { joints: Uint16Array(n*4), weights: Float32Array(n*4) }
 */
export function headWeights(pos, index, head, o = {}) {
  const sigma = o.sigma ?? 0.025, rictus = o.rictus ?? 0.33, iters = o.smooth ?? 16;
  // the opercle's skin margin as s at height y: behind it is the trunk (the pectoral girdle, fixed to the skull)
  const sOp = marginCurve(o.K?.opercle?.path ?? OPERCLE_PATH);
  const GS = { ...GILL_SLIT, ...(o.K?.gillSlit ?? {}) };
  // the gape (head.mjs HEAD_SCULPT.gape): which side of the slit a vertex is on is decided with the slit's own carve
  // (the lower jaw's tissue is cut back 2·half from the upper head's field), not with the raw fields, whose overlap
  // under the pads would put upper-lip skin on the lower jaw
  const isLower = gapeSide(o.K, rictus);
  const [fl0, fl1] = o.floor ?? [0.18, 0.30];
  const FLOOR = (x) => { const t = Math.min(1, Math.max(0, (x - fl0) / (fl1 - fl0))); return t * t * (3 - 2 * t); };
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
  const suspJ = new Set(['J_suspL', 'J_suspR'].map((k) => idx[k]));
  const headOnly = new Set([idx.J_head]);
  // vertex normals (area-weighted), to tell the roof of the mouth (facing down) from its floor
  const vn = new Float32Array(n * 3);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const i of [a, b, c]) { vn[i * 3] += nx; vn[i * 3 + 1] += ny; vn[i * 3 + 2] += nz; }
  }
  const W = new Float32Array(n * J), side = new Uint8Array(n), roofs = new Uint8Array(n), throat = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const p = head.parts(x, y, z);
    // the pads (and, fading out, the snout's sheath over the labial groove, which they drag a little as they slide
    // out from under it) ride on the upper jaws
    const padReach = o.padReach ?? 0.03, onPad = p.u < padReach, padPen = Math.max(0, p.u - 0.006) * (o.padPen ?? 2.5);
    const lower = isLower(x, y, p);
    side[v] = lower ? 1 : 0;
    const d = new Float64Array(J).fill(Infinity);
    // behind the opercle's margin the skin is the trunk's (the pectoral girdle is rigid to the skull: Michel 2014), and
    // so is the gill slit's inner wall (the slot under the opercle's free edge), so the cover swings off it and the
    // slit opens; the margin's own fold stays on the cover
    const behind = x - sOp(y);
    const inSlit = y > GS.y0 - 0.01 && y < GS.y1 + 0.01 && behind > -GS.reach - 0.02 && behind < 0.012;
    // a band of the trunk's skin just behind the margin is the opercular membrane's attachment: it is drawn out a
    // little with the cover (so the slit gapes 0.02–0.05 HL at the cover's full swing, and stays nearly sealed when
    // the covers bulge with the cheeks), fading to the trunk's own within `fuse` behind the margin
    const fuseW = o.fuse ?? 0.05;
    const trunk = behind > 0.012 + fuseW || (inSlit && p.f < -GS.depth);
    const fusePen = behind > 0.012 ? 0.02 + (behind - 0.012) * 1.5 : 0;
    // the roof of the mouth (the palate, the upper lip's underside, the slit's upper wall: upper tissue facing down)
    // belongs to the skull and the upper jaws: the hyoid, close under it, must not drag it down
    const nl = Math.hypot(vn[v * 3], vn[v * 3 + 1], vn[v * 3 + 2]) || 1, ny = vn[v * 3 + 1] / nl;
    const roof = !lower && ny < -0.3 && (x < rictus || y > 0.12) && x < 0.75;
    roofs[v] = roof ? 1 : 0;
    throat[v] = !roof && ny < -0.35 && y < 0.10 && x > 0.14 && x < 0.85 ? 1 : 0;
    for (let k = 0; k < J; k++) {
      if (!groups[k]) continue;
      if (trunk && !headOnly.has(k)) continue;
      // the roof, and in front of the rictus everything above the gape (the pads, the pocket of the mouth cavity
      // carved over the slit), stays off the hyoid: only the floor below the gape and the throat drop with it
      if (k === idx.J_hyoid && (roof || (!lower && x < rictus))) continue;
      if (lower && !lowerOnly.has(k)) continue;
      // above the slit, and on the cheek behind the rictus, the lower jaw moves only the skin under its hinge
      if (!lower && jawJ.has(k) && (x < rictus || y > 0.11 || x > 0.46)) continue;
      if (lipJ.has(k) && !onPad) continue;
      d[k] = Math.max(0, groups[k](x, y, z));
      if (lipJ.has(k)) d[k] += padPen;
      // the palatines reach forward under the snout, but the snout's skin sheath is fixed to the skull: the
      // suspensoria move only the cheeks (behind the pads' front ends)
      if (suspJ.has(k)) d[k] += Math.max(0, 0.26 - x) * 2;
      // the mouth's floor (the lower tissue's upper face): its rim along the dentaries (the lower lip's inner face and
      // the teeth's gum) rides on the jaw, so the lips stay sealed in buccal pumping; its middle is the mucosa over
      // the tongue and the hyoid, which the gape stretches into a slope from the lower lip back to the tongue,
      // opening the mouth's cavity instead of swinging the whole floor up as a plate
      if (jawJ.has(k) && lower && ny > 0.3) d[k] += Math.max(0, d[k] - (o.rim ?? 0.022)) * 4;
      if (fusePen > 0 && !headOnly.has(k)) d[k] += fusePen;
    }
    // the lower jaw carries its own flesh (lips, chin, the rami's sides) and, in front of the hyoid, the intermandibular
    // skin slung between the rami (it swings down with them at the gape instead of tearing off them as a sliver); over
    // and behind the hyoid the floor belongs to the hyoid, which balloons it down in buccal pumping
    const fl = FLOOR(x);
    if (fl > 0 && d[idx.J_hyoid] < Infinity) for (const k of jawJ) if (d[k] < Infinity) d[k] += Math.max(0, d[k] - 0.03) * 2.5 * fl;
    let dm = Infinity;
    for (let k = 0; k < J; k++) dm = Math.min(dm, d[k]);
    let sum = 0;
    for (let k = 0; k < J; k++) { const w = d[k] < Infinity ? Math.exp(-(d[k] - dm) / sigma) : 0; W[v * J + k] = w; sum += w; }
    for (let k = 0; k < J; k++) W[v * J + k] /= sum || 1;
  }
  // smoothing over the mesh's edges (Laplacian, a few passes)
  if (iters > 0) {
    const nb = Array.from({ length: n }, () => new Set());
    // nothing smooths across the gape in front of the rictus, even where the mesh bridges the slit
    const link = (a, b) => { if (side[a] !== side[b] && pos[a * 3] < rictus - 0.02 && pos[b * 3] < rictus - 0.02) return; if (roofs[a] !== roofs[b]) return; nb[a].add(b); nb[b].add(a); };
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      link(a, b); link(b, c); link(c, a);
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
    // the throat's skin (the floor between the rami and the branchiostegal membrane, seen from below) is a slack
    // membrane slung between the rami: more smoothing there spreads the hyoid's pull across it, so buccal pumping
    // drops it as a rounded pouch, not a keel along the midline
    const tIters = o.throatSmooth ?? 48;
    if (tIters > 0) {
      const tv = [];
      for (let v = 0; v < n; v++) if (throat[v]) tv.push(v);
      for (let it = 0; it < tIters; it++) {
        nxt.set(cur);
        for (const v of tv) {
          const s = nb[v].size;
          for (let k = 0; k < J; k++) {
            let acc = cur[v * J + k];
            for (const u of nb[v]) acc += cur[u * J + k];
            nxt[v * J + k] = acc / (s + 1);
          }
        }
        [cur, nxt] = [nxt, cur];
      }
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
/** The globe's drop in the blink (HL; 0.48 ED: Aiello et al. 2023 measured 0.5–0.6 ED), shared by the pose and its blend shape. */
export const BLINK_DROP = 0.10;
export const HEAD_POSES = {
  rest: {},
  // a strike on land at full gape: the lower jaw down 70°, the premaxillae protruded, the maxillae swung forward, the
  // hyoid depressed, the suspensoria and gill covers abducted
  gapeFull: { J_jaw: { angle: 70 }, J_imj: { angle: 15 }, J_premax: { angle: 12, slide: 0.07 }, J_maxL: { angle: 25 }, J_maxR: { angle: 25 }, J_hyoid: { angle: 14 }, J_suspL: { angle: 6 }, J_suspR: { angle: 6 }, J_opercL: { angle: 8 }, J_opercR: { angle: 8 } },
  gapeHalf: { J_jaw: { angle: 32 }, J_premax: { angle: 6, slide: 0.035 }, J_maxL: { angle: 12 }, J_maxR: { angle: 12 }, J_hyoid: { angle: 6 } },
  // buccal pumping: the hyoid down, the cheeks out, the mouth shut
  gulp: { J_hyoid: { angle: 4 }, J_suspL: { angle: 6 }, J_suspR: { angle: 6 }, J_opercL: { angle: 4 }, J_opercR: { angle: 4 }, morph: { throat: 1 } },
  // the cheeks blown up (u5; a mouthful of water or air held on land, and the males' display): the suspensoria and
  // the gill covers abducted, the hyoid down and the throat's pouch full, the mouth and the slits shut (the cheeks'
  // own swelling is the soft tissue's blend shape)
  // (the skeleton's share alone: the full u5 state, with the skin's balloon, is `inflated` below)
  inflate: { J_hyoid: { angle: 5 }, J_suspL: { angle: 12 }, J_suspR: { angle: 12 }, J_opercL: { angle: 6 }, J_opercR: { angle: 6 }, morph: { throat: 1 } },
  // the cheeks and gill covers inflated with a mouthful of water or air (u5; research/anat_soft.md §3.4): the
  // suspensoria and the gill covers swing out, the covers rise, the hyoid drops, the mouth and the gill slits stay
  // shut; the skin is carried onto the balloon by the `inflate` blend shape (head-inflated.mjs, inflateTargets)
  // (the gill covers swing out only as far as the balloon's skin keeps them covered: u5's outline narrows above the
  // cheeks, so the covers' upper hind corners stay in; the balloon itself is the blend shape's)
  inflated: { J_suspL: { angle: 10 }, J_suspR: { angle: 10 }, J_opercL: { angle: 8, lift: 2 }, J_opercR: { angle: 8, lift: 2 }, J_hyoid: { angle: 16 }, morph: { inflate: 1 } },
  inflatedHalf: { J_suspL: { angle: 5 }, J_suspR: { angle: 5 }, J_opercL: { angle: 4, lift: 1 }, J_opercR: { angle: 4, lift: 1 }, J_hyoid: { angle: 8 }, morph: { inflate: 0.5 } },
  // venting through the gill slits: the gill covers swing out
  vent: { J_opercL: { angle: 18 }, J_opercR: { angle: 18 }, J_suspL: { angle: 4 }, J_suspR: { angle: 4 } },
  // the eyes raised (alert) and pulled down into the orbits (blink)
  eyesUp: { J_eyeL: { t: [0, 0.03, 0] }, J_eyeR: { t: [0, 0.03, 0] } },
  blink: { J_eyeL: { t: [0, -BLINK_DROP, 0] }, J_eyeR: { t: [0, -BLINK_DROP, 0] }, morph: { blinkL: 1, blinkR: 1 } },
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
 * into the orbit (Aiello et al. 2023: the eye drops ≈0.5–0.6 ED and the cup, which no muscle moves, is stretched up
 * over it; closed, the domes are low skin-covered bumps with a crease near the top: Movies S1, S3).
 *
 * Per azimuth about the globe's vertical axis the cup is a profile from its base on the head (the infraorbital
 * crease, fixed) up to its rim; t is a vertex's share of it (0 at the base, 1 at the rim). Seen from the lowered
 * centre, every profile point is turned up by a share of the rim's lift that grows with t, and drawn in onto the
 * lowered globe, the sheet thinning toward the rim, so the closed rim lies on the dome as a crease, not a ledge. On
 * the window's side the rim closes up to `cover` degrees of elevation (well above the window, which faces lateral
 * and a little forward), falling off round the dome to `lamMin` of that lift medially, where the two domes meet, so
 * the closed lid is one smooth arch with a crease near the top (S3), not a hood with tips. The skin above the rim
 * (a cap over the dome, the fillets, the web between the domes) and the head's surfaces inside the globe ride down
 * rigidly with the globe; the sheet slides over them, kept clear of their thickness. Where the lowered globe meets
 * the skin under the overhanging eye, the skin is pushed out round it. Displacements are in the bind frame, applied
 * before the skinning; the globe itself is moved by J_eyeL/R (BLINK_DROP).
 * @returns { L: Float32Array, R: Float32Array } displacements (HL)
 */
export function blinkTargets(pos, nrm, headSDF, K, o = {}) {
  const drop = o.drop ?? BLINK_DROP, base = o.base ?? -1.15, cover = ((o.cover ?? 64) * Math.PI) / 180;
  const thick = o.thick ?? 0.016, edge = o.edge ?? 0.3, reach = o.reach ?? 0.075;
  const E = HEAD.eye, re = E.d / 2, C = K.cup, lo = (C.low * Math.PI) / 180, gap = C.gap ?? 0.0015;
  // the rim's height for an azimuth: the head's own (cupField) when the field exports it
  const f = headSDF(K, { cut: true });
  const rimH = f.cup?.rimH ?? ((px, pz) => { const D = Math.atan2(-px, pz) - lo; return C.A - C.B * Math.cos(D) - C.C * Math.cos(2 * D); });
  const rimR = re + gap + (C.thick ?? 0.02);
  // the closing falls off from the window's azimuth (c1) to c0, down to lamMin; the sheet is drawn tight within r0
  const [c0, c1] = o.azimuths ?? [150, 0], lamMin = o.lamMin ?? 0.35, [r0, r1] = o.tight ?? [155, 95];
  const n = pos.length / 3, L = new Float32Array(n * 3), R = new Float32Array(n * 3);
  // the globe pushes the skin out where it sinks past it (the eyes overhang the head's sides, so the lowered globe
  // meets the infraorbital skin: Aiello's "the descending globe stretches the cup laterally"): every outward-facing
  // vertex ends at least `skin` off the lowered globe (a smooth maximum, so the skin bulges, not creases)
  const skinT = o.skin ?? 0.007, kPush = o.push ?? 0.02;
  // the skin the head lays on the globe above the rim (a cap over the dome, the fillets, the web between the domes)
  // is the globe's own: it rides down with it, and the closing sheet slides over it, so the sheet keeps clear of its
  // thickness (per azimuth, from the bind mesh)
  const NB = 48, capOff = new Float32Array(NB);
  const bin = (dx, dz) => ((Math.floor(((Math.atan2(-dx, dz) + Math.PI) / (2 * Math.PI)) * NB) % NB) + NB) % NB;
  for (let v = 0; v < n; v++) {
    const dx = pos[v * 3] - E.s, dy = pos[v * 3 + 1] - E.y, dz = Math.abs(pos[v * 3 + 2]) - E.z, r = Math.hypot(dx, dy, dz);
    if (r > re + 0.04 || r < re - 0.02) continue;
    const e = Math.asin(Math.max(-1, Math.min(1, dy / r)));
    const er = Math.asin(Math.max(-0.99, Math.min(0.99, rimH(dx, dz) / rimR)));
    if (e < er + 0.12) continue;
    const b = bin(dx, dz);
    capOff[b] = Math.max(capOff[b], Math.min(0.03, r - re));
  }
  // a little spread over the neighbouring azimuths
  const capS = Float32Array.from(capOff, (c, i) => Math.max(c, capOff[(i + 1) % NB], capOff[(i + NB - 1) % NB]));
  for (let v = 0; v < n; v++) {
    const z = pos[v * 3 + 2], side = z >= 0 ? 1 : -1;
    const dx = pos[v * 3] - E.s, dy = pos[v * 3 + 1] - E.y, dz = Math.abs(z) - E.z;
    const r = Math.hypot(dx, dy, dz);
    if (r > re + 0.13 || r < 1e-6) continue;
    const e = Math.asin(Math.max(-1, Math.min(1, dy / r)));
    const h = Math.hypot(dx, dz) || 1e-9, ux = dx / h, uz = dz / h;
    let tx = dx, ty = dy - 0, tz = dz;
    let mapped = false;
    // the head's interior inside the globe, wherever it lies (the sculpt leaves it uncarved above the rim's height,
    // down to a floor deep under the window side: head.mjs cup.carveTop), is hidden by the globe at rest and stays
    // hidden: it rides down rigidly with the globe and is never pushed out onto the lowered globe (pushed, its
    // inward-facing faces showed through the closed hood)
    if (r < re - (o.deep ?? 0.006)) {
      const T = side > 0 ? L : R;
      T[v * 3 + 1] = -drop;
      continue;
    }
    if (r <= re + reach && e > base) {
      const er = Math.asin(Math.max(-0.99, Math.min(0.99, rimH(dx, dz) / rimR)));
      const t = (e - base) / Math.max(0.05, er - base);
      const dAz = Math.atan2(-dx, dz) - lo, lam = lamMin + (1 - lamMin) * smooth(Math.cos((c0 * Math.PI) / 180), Math.cos((c1 * Math.PI) / 180), Math.cos(dAz));
      // the sheet is drawn tight onto the globe all round but the medial side (where the two cups meet)
      const lamR = Math.max(lam, smooth(Math.cos((r0 * Math.PI) / 180), Math.cos((r1 * Math.PI) / 180), Math.cos(dAz)));
      // where the rim closes to, seen from the lowered centre: over the window up to `cover`, medially riding down
      const eT = er + (Math.max(er, cover) - er) * lam;
      let e2, r2;
      // the head's surfaces inside the globe (where the sculpt runs the head into it above the rim) are hidden by it:
      // they ride down with it
      const inside = 1 - smooth(re - 0.004, re, r);
      if (inside >= 1) { e2 = e; r2 = r; } else if (t <= 1) {
        // polar about the lowered centre: the identity at the base; at the rim the closing rim (drawn onto the globe,
        // the sheet thinning toward it) on the window's side, the rigid ride down with the globe medially
        const yc = dy + drop, rc = Math.hypot(h, yc), ec = Math.atan2(yc, h), st = smooth(0, 1, t);
        e2 = ec + (e - ec + eT - er) * st;
        const hug = Math.max(re + gap, re + gap + thick * (1 - (1 - edge) * smooth(0.45, 1, t)), re + capS[bin(dx, dz)] + 0.004);
        // the lip's inner face is laid onto the skin above the rim (it hugs the dome's cap), the outer face just over it
        const capR = re + capS[bin(dx, dz)] * smooth(0.5, 1, t);
        r2 = rc + (r - rc + lamR * (Math.max(Math.min(r, hug), capR) - r)) * smooth(0.05, 0.7, t);
        if (inside > 0) { e2 += (e - e2) * inside; r2 += (r - r2) * inside; }
      } else {
        // above the rim: down with the globe (the closing sheet slides over it)
        e2 = e; r2 = r;
      }
      const ch = Math.cos(e2) * r2;
      // faded away from the globe (the head round the collar keeps its shape)
      const w = 1 - smooth(re + reach * 0.7, re + reach, r);
      tx = dx + (ux * ch - dx) * w; ty = dy + (Math.sin(e2) * r2 - drop - dy) * w; tz = dz + (uz * ch - dz) * w;
      mapped = true;
    }
    // the push-out (outward-facing skin only: the socket's own face stays inside the globe)
    const nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2] * side;
    const facing = (nx * dx + ny * dy + nz * dz) / r;
    if (facing > 0.1) {
      const qy = ty + drop, rq = Math.hypot(tx, qy, tz), Rm = re + gap + skinT;
      if (rq < Rm + kPush && rq > 1e-6) {
        const rr = -smin1(-rq, -Rm, kPush), k = (rr / rq - 1) * smooth(0.1, 0.4, facing);
        tx += tx * k; tz += tz * k; ty += qy * k;
        mapped = true;
      }
    }
    if (!mapped) continue;
    const T = side > 0 ? L : R;
    T[v * 3] = tx - dx; T[v * 3 + 1] = ty - dy; T[v * 3 + 2] = (tz - dz) * side;
  }
  return { L, R };
}
/**
 * The throat pouch blend shape: in buccal pumping (and in display, Matoba & Dotsu 1977) the floor of the mouth and the
 * branchiostegal membrane, slung between the rami and the gill covers, bulge out as one rounded pouch under the
 * water or air the fish holds (Michel et al. 2016: the ventral contour drops behind the chin and stays round). The
 * hyoid's own drop (J_hyoid) pulls the midline; this rounds it: every downward-facing vertex of the outer floor moves
 * out along its normal by `amp` × a profile that is full between s 0.3 and 0.7 and across the floor's middle,
 * fading to nothing at the chin, at the gill covers' margin and up the cheeks.
 * @returns Float32Array displacements (HL)
 */
export function throatTargets(pos, nrm, K, o = {}) {
  const amp = o.amp ?? 0.035, n = pos.length / 3, D = new Float32Array(n * 3);
  const L = K.loft, sMax = L.s[L.s.length - 1];
  const halfW = (x) => { let j = 0; while (j < L.s.length - 2 && L.s[j + 1] < x) j++; const t = Math.min(1, Math.max(0, (x - L.s[j]) / (L.s[j + 1] - L.s[j]))); return L.w[j] + (L.w[j + 1] - L.w[j]) * t; };
  const yW = (x) => { let j = 0; while (j < L.s.length - 2 && L.s[j + 1] < x) j++; const t = Math.min(1, Math.max(0, (x - L.s[j]) / (L.s[j + 1] - L.s[j]))); return L.yW[j] + (L.yW[j + 1] - L.yW[j]) * t; };
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (x < 0.1 || x > Math.min(1.0, sMax)) continue;
    const nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
    if (ny > -0.1) continue;
    // the outer floor only: under the pads and the slit in front of the rictus, under the widest line behind it
    const yTop = x < 0.36 ? 0.075 : Math.min(yW(x), 0.16);
    if (y > yTop) continue;
    const S = smooth(0.12, 0.32, x) * (1 - smooth(0.72, 0.97, x));
    const Z = 1 - smooth(0.4, 1.0, Math.abs(z) / Math.max(0.05, halfW(x)));
    const V = smooth(0.1, 0.6, -ny) * (1 - smooth(yTop - 0.03, yTop, y));
    const a = amp * S * Z * V;
    if (a <= 0) continue;
    D[v * 3] = nx * a; D[v * 3 + 1] = ny * a; D[v * 3 + 2] = nz * a;
  }
  return D;
}
const smin1 = (a, b, k) => { const hh = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - hh * hh * k * 0.25; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The head's sculpt without what rides on its skin: the gill margin's fold, its slit and the chamber behind it,
 * the gill cover's rim, the upper lip's pads, the rictal fold and its crease (the snout's sheath over the pads is the
 * face's own skin and stays). The inflation carries this smooth skin, and the features with
 * it (the margin and its shut slit ride out on the balloon, the pads' hind ends with the cheeks). */
export function smoothSculpt(K) {
  const S = structuredClone(K);
  S.opercle.radius = S.opercle.radius.map(() => 0);
  // the gill cover's proud rim (head.mjs opercle.cover) rides on the balloon like the margin's fold: it keeps its step
  // over the trunk instead of being projected away
  if (S.opercle.cover) S.opercle.cover = { ...S.opercle.cover, t: 0 };
  S.blend = { ...S.blend, fold: 0, groove: 0 };
  S.gillSlit = { ...S.gillSlit, y0: 9, y1: -9 };
  S.gillChamber = { c: [9, 9, 9], r: [0.01, 0.01, 0.01] };
  S.pad = { ...S.pad, radius: S.pad.radius.map(() => 1e-4), median: { ...S.pad.median, radius: S.pad.median.radius.map(() => 1e-4), blend: 0 }, seam: { r: 0, k: 0 }, web: undefined };
  S.rictal = { ...S.rictal, r: [1e-4, 1e-4, 1e-4], blend: 0 };
  S.rictalCrease = { ...S.rictalCrease, radius: S.rictalCrease.radius.map(() => 0) };
  return S;
}

const adjacency = (index, n) => {
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
  }
  return nb.map((s) => Uint32Array.from(s));
};

/**
 * The cheek-inflation blend shape (research/anat_soft.md §3.4; the owner's photo u5): every vertex of the bind mesh
 * carried onto the inflated head (head-inflated.mjs) across its own cross-section, outward from the section's centre
 * (s fixed, so the gill margin and its slit stay at their place along the head and ride out on the balloon). The
 * smooth outer skin is projected exactly; whatever stands on it or lies in it (the margin's fold, the shut slit and
 * its pocket, the upper lip's pads, the rictal fold and crease) rides with the skin under it, its nearest point on the
 * smooth skin; what is hidden from outside (the mouth's inside, the nostrils) takes the displacement of the skin round
 * it (a harmonic fill over the mesh). The mask keeps the snout, the lower lip and chin, the eye domes with their
 * collars, and the trunk's seam where they are, fading over a few hundredths of an HL.
 * @param pos     bind positions (HL)
 * @param index   triangles
 * @param head    the bind head's field (headSDF, with .parts and .cup)
 * @param smooth  the bind head without what rides on its skin (headSDF(smoothSculpt(K)))
 * @param target  the inflated head's field (head-inflated.mjs inflatedSDF)
 * @param o       { centreY: the sections' centre height (0.22), reach: the longest move (0.45 HL), K: the sculpt (its gape) }
 * @returns { d: Float32Array (HL, unmasked), mask: Float32Array, projected: Uint8Array (the exactly projected skin) }
 */
export function inflateTargets(pos, index, head, smooth, target, o = {}) {
  const yc = o.centreY ?? 0.22, reach = o.reach ?? 0.45;
  // the lower lip and chin (below the gape, told by the slit's own carve when the sculpt is given)
  const lowerOf = o.K ? gapeSide(o.K, 0.36) : (x, y, p) => x < 0.36 && p.j < p.f - 0.002;
  const n = pos.length / 3, nb = adjacency(index, n), cup = head.cup.field;
  const mask = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], za = Math.abs(z);
    const p = head.parts(x, y, z);
    // the lower lip and the chin stay, the throat behind them balloons; the pads ride on the skin under them (their
    // fronts stay with the snout, their hind ends go out with the cheeks)
    const lower = lowerOf(x, y, p);
    const face = lower ? sm(0.14, 0.34, x) * (1 - sm(0.035, 0.075, y)) : sm(0.17, 0.27, x);
    mask[v] = sm(0.004, 0.05, cup(x, y, za)) * face * (1 - sm(1.08, 1.20, x));
  }
  // Jacobi smoothing over the mesh's edges (k passes); with `keep`, those vertices hold their values (a harmonic fill)
  const lap = (A, k, keep) => {
    const m = A.length / n, free = [];
    for (let v = 0; v < n; v++) if (!keep || !keep[v]) free.push(v);
    let cur = Float32Array.from(A), nxt = Float32Array.from(A);
    for (let it = 0; it < k; it++) {
      for (const v of free) {
        const nv = nb[v];
        for (let c = 0; c < m; c++) { let a = cur[v * m + c]; for (const u of nv) a += cur[u * m + c]; nxt[v * m + c] = a / (nv.length + 1); }
      }
      [cur, nxt] = [nxt, cur];
    }
    return cur;
  };
  const M = lap(mask, 6);
  const d = new Float32Array(n * 3), fixed = new Uint8Array(n), proj = new Uint8Array(n);
  let nFix = 0, nFeat = 0;
  for (let v = 0; v < n; v++) {
    if (M[v] < 1e-3) { fixed[v] = 1; continue; }
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    // the skin under a feature: the nearest point of the smooth skin (the margin's fold stands on it, the slit's
    // pocket lies under it), which the feature rides with
    let q = smooth(x, y, z);
    if (Math.abs(q) < 0.0015) proj[v] = 1;
    else if (Math.abs(q) < 0.07) {
      for (let k = 0; k < 4 && Math.abs(q) > 1e-5; k++) {
        const e = 1e-4, gx = (smooth(x + e, y, z) - smooth(x - e, y, z)) / (2 * e), gy = (smooth(x, y + e, z) - smooth(x, y - e, z)) / (2 * e), gz = (smooth(x, y, z + e) - smooth(x, y, z - e)) / (2 * e);
        const gg = gx * gx + gy * gy + gz * gz || 1;
        x -= (q * gx) / gg; y -= (q * gy) / gg; z -= (q * gz) / gg;
        q = smooth(x, y, z);
      }
    } else { nFeat++; continue; }
    let dy = y - yc, dz = z, l = Math.hypot(dy, dz);
    if (l < 1e-6) { dy = 1; dz = 0; l = 1; }
    dy /= l; dz /= l;
    // hidden from outside along the ray (the mouth's inside, the nostrils): filled from round it
    let occluded = false;
    for (let t = 0.004, k = 0; t < 0.5 && k < 200; k++) {
      const h = smooth(x, y + dy * t, z + dz * t);
      if (h < -5e-4) { occluded = true; break; }
      t += Math.max(h, 0.002);
    }
    if (occluded) { proj[v] = 0; nFeat++; continue; }
    // the march to the balloon (from inside the inflated head outward)
    const g = (t) => target(x, y + dy * t, z + dz * t);
    let t0 = 0, g0 = g(0);
    if (g0 < 0) {
      let t1 = t0, g1 = g0;
      for (let k = 0; k < 300 && g1 < 0 && t1 < reach; k++) { t0 = t1; g0 = g1; t1 += Math.max(-g1 * 0.9, 2e-4); g1 = g(t1); }
      if (g1 >= 0) { for (let k = 0; k < 24; k++) { const tm = (t0 + t1) / 2, gm = g(tm); if (gm < 0) t0 = tm; else t1 = tm; } t0 = (t0 + t1) / 2; }
      else t0 = 0;
    } else t0 = 0;
    d[v * 3 + 1] = dy * t0; d[v * 3 + 2] = dz * t0;
    fixed[v] = 1; nFix++;
  }
  // the features take the displacement of the skin round them
  const D = lap(d, 400, fixed);
  // the projected skin is exact (on the balloon) where the mask is whole: smoothing it would pull it off the balloon
  // wherever the bind mesh's vertices sit unevenly. Where the mask fades (round the lips, the chin, the eyes' collars)
  // the rays meet the head's own folds at uneven depths, and the skin there is a blend anyway: it is smoothed.
  const hold = new Uint8Array(n);
  for (let v = 0; v < n; v++) hold[v] = M[v] > 0.98 || M[v] < 1e-3 ? 1 : 0;
  return { d: lap(D, 20, hold), mask: M, projected: proj, stats: { projected: nFix, filled: nFeat } };
}

/**
 * The inflate blend shape's displacement in the bind frame (applied before the skinning, as a glTF morph target), for
 * the pose it is solved for (HEAD_POSES.inflated): posed, the skin lands on the bind head moved by the mask's share of
 * the inflation, whatever the pose's joints would do to it (the skin is the balloon's; the bones swing inside it). At
 * a partial weight with the joints partly posed (inflatedHalf) it lands near the same share of the way.
 */
export function inflateMorph(pos, skin, W, inf) {
  const n = pos.length / 3, out = new Float32Array(n * 3);
  const T = JOINT_NAMES.map((nm) => W[nm] ?? { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
  for (let v = 0; v < n; v++) {
    const m = inf.mask[v];
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const w = skin.weights[v * 4 + i];
      if (!w) continue;
      const { R, t } = T[skin.joints[v * 4 + i]];
      for (let k = 0; k < 9; k++) A[k] += w * R[k];
      for (let k = 0; k < 3; k++) b[k] += w * t[k];
    }
    // A (p + Δ) + b = p + m d  →  Δ = A⁻¹ (p + m d − b) − p
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const x = solve3(A, [0, 1, 2].map((k) => p[k] + m * inf.d[v * 3 + k] - b[k]));
    for (let k = 0; k < 3; k++) out[v * 3 + k] = x[k] - p[k];
  }
  return out;
}
const solve3 = (A, q) => {
  const [a, b, c, d, e, f, g, h, i] = A;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const inv = [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d].map((x) => x / det);
  return [inv[0] * q[0] + inv[1] * q[1] + inv[2] * q[2], inv[3] * q[0] + inv[4] * q[1] + inv[5] * q[2], inv[6] * q[0] + inv[7] * q[1] + inv[8] * q[2]];
};
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
