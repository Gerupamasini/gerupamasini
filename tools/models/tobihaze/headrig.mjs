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
//   - the premaxillae and maxillae move the upper-lip pads, and the snout's sheath over the labial groove in a band
//     fading over 0.14 HL from the pad: the pads slide out from under it (Murdy 1989), the groove's walls move together
//     and the sheath's skin is drawn after them, so the protrusion stretches the face instead of tearing the crease
//   - the suspensoria move the cheeks, not the snout's skin over the palatines
//   - behind the opercle's skin margin the skin is the trunk's (the pectoral girdle is rigid to the skull), but for a
//     band where the opercular membrane is fused to it; the gill slit's inner wall stays with the trunk and its flap
//     (the cover's free edge) with the opercle, so the cover swings off the wall and the slit opens
//   - the eyes carry the head's surface inside their globes and, in part, the skin round them above the cups' rims and
//     the rims themselves (the cup's skin runs on into the globe's), so a raised globe draws them up after it
// Then the weights are smoothed over the mesh (never across the gape in front of the rictus, nor across the edge of
// the mouth's roof inside the mouth), the throat's membrane more than the rest.
// Blend shapes: the blink (the dermal cup drawn up over the lowered globe as a lid, closing to one seam near the top),
// the throat's pouch (buccal pumping), the cheeks' inflation (u5: the skin carried onto the balloon of head-inflated.mjs,
// inflateTargets / inflateMorph) and the gape's correctives (gapeTargets: the lower lip everted, the upper lip's stretch
// spread, the gum drawn back from the teeth). Each carries normal deltas (morphNormals, bindNormalDeltas), so the game's
// morph targets shade the moved skin as the shape it is.
import { HEAD } from './anatomy.mjs';
import { HEAD_JOINTS, skullBones } from './skull.mjs';
import { worldTransforms, axisAngle, boundedUnion, v3 } from './skel.mjs';
import { neckLobe } from './head.mjs';

export const JOINT_NAMES = HEAD_JOINTS.map((j) => j.name);
/** Joints whose bones count toward another joint's skin weights (headWeights): the hyoid's splay and fan joints. */
const HYOID_SKIN = { J_chL: 'J_hyoid', J_chR: 'J_hyoid', J_bstegL: 'J_hyoid', J_bstegR: 'J_hyoid' };

// the opercle's skin margin and the gill slit of the n15 sculpt (head.mjs HEAD_SCULPT.opercle, .gillSlit), used when
// the caller does not pass the sculpt (o.K); the slit is a thin pocket under the cover's free edge, `reach` in front
// of the margin, and `depth` (negative: over the mass's skin, between the pocket's floor and roof) the split between
// the body wall under it (the trunk's) and the flap over it (the opercle's)
const OPERCLE_PATH = [[0.996, 0.50, 0.25], [1.014, 0.44, 0.29], [1.032, 0.36, 0.325], [1.032, 0.26, 0.34], [1.007, 0.15, 0.33], [0.962, 0.06, 0.29], [0.912, 0.02, 0.24]];
const GILL_SLIT = { y0: 0.175, y1: 0.375, depth: -0.002, reach: 0.035 };

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
  // the slit's half-width along s, as head.mjs carves it (gape.front narrower, gape.back wider toward the slit's end,
  // when the sculpt has them)
  const F = G.front, B = G.back;
  const halfAt = (x) => (F ? F.half + (G.half - F.half) * ss(F.s[0], F.s[1], x) : G.half) + (B ? (B.half - G.half) * ss(B.s[0], B.s[1], x) : 0);
  const wFront = (x, y) => 1 - ss(G.rictus - G.close * 0.4, G.rictus + G.close * 0.6, x - G.lean * Math.max(0, gapeY(x) - y));
  return (x, y, p) => {
    if (x >= rictus) return false;
    if (G.slitEnd !== undefined) {
      if (x < G.slitEnd) return Math.max(p.j, smin1(2 * halfAt(x) - p.f, G.slitEnd - x, G.endRound ?? 0.01)) < p.f;
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
 * @param o     { sigma, smooth, rictus, K (the sculpt: its gape, opercle margin and gill slit), teeth (skull.mjs fitTeeth: the
 *              tooth rows the bones carry), floor, padReach, padPen, fuse,
 *              throatSmooth, band (the labial band), flapPen, floorShare (the gill slit's flap and floor), eyeIn, eyeBand,
 *              webBand, eyeCup, eyeSmooth (the eyes' share) }
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
  // (the hyoid's splay and the branchiostegal fan move only their bones: their skin stays with the hyoid's share,
  // HYOID_SKIN, so every pose but the inflation's skins exactly as before; the inflation's blend shape carries the
  // throat onto the balloon whatever the bones do)
  const groups = JOINT_NAMES.map((name) => {
    const fs = skullBones(o.teeth ? { teeth: o.teeth } : {}).filter((b) => (HYOID_SKIN[b.joint] ?? b.joint) === name).map((b) => b.field);
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
  const W = new Float32Array(n * J), side = new Uint8Array(n), roofs = new Uint8Array(n), roofIn = new Uint8Array(n), throat = new Uint8Array(n);
  // one vertex's weights from the bones (x, y, z; its parts p; on the lower jaw's tissue; on the mouth's roof; its
  // normal's y), into W's row v
  const rule = (x, y, z, p, lower, roof, ny, row) => {
    // the pads (and, fading out, the snout's sheath over the labial groove, which they drag a little as they slide
    // out from under it) ride on the upper jaws
    const padReach = o.padReach ?? 0.03, onPad = p.u < padReach, padPen = Math.max(0, p.u - 0.006) * (o.padPen ?? 2.5);
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
    // the gill slit's flap (the cover's free edge over the slot, in front of the margin): the cleithrum lies close
    // under it, but the flap is the opercle's: the trunk's bones let go of it, so it swings out whole and the slot opens
    const flapPen = !trunk && inSlit && behind < 0.012 ? (o.flapPen ?? 0.02) * smooth(-GS.reach, -0.01, behind) : 0;
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
      if (flapPen > 0 && headOnly.has(k)) d[k] += flapPen;
    }
    // the lower jaw carries its own flesh (lips, chin, the rami's sides) and, in front of the hyoid, the intermandibular
    // skin slung between the rami (it swings down with them at the gape instead of tearing off them as a sliver); over
    // and behind the hyoid the floor belongs to the hyoid, which balloons it down in buccal pumping
    const fl = FLOOR(x);
    if (fl > 0 && d[idx.J_hyoid] < Infinity) for (const k of jawJ) if (d[k] < Infinity) d[k] += Math.max(0, d[k] - 0.03) * 2.5 * fl;
    let dm = Infinity;
    for (let k = 0; k < J; k++) dm = Math.min(dm, d[k]);
    let sum = 0;
    for (let k = 0; k < J; k++) { const w = d[k] < Infinity ? Math.exp(-(d[k] - dm) / sigma) : 0; row[k] = w; sum += w; }
    for (let k = 0; k < J; k++) row[k] /= sum || 1;
  };
  // the labial groove: the premaxillae slide the pads 0.1 HL forward and down out from under the snout's sheath (gapeFull),
  // where a real fold unrolls the skin tucked in the groove. The mesh's groove is a crease with no slack in it, so the
  // pull is spread over the sheath instead: skin within `band` [u0, u1] of the pad (above the groove, round the pad's
  // rear end, the median lip's join to the snout) takes the weights of the pad's nearest point, fading to its own
  // over the band; the groove's two walls move together and the stretch is spread over a few hundredths of an HL
  // instead of tearing the crease open
  const [bu0, bu1] = o.band ?? [0.012, 0.14];
  const rowQ = new Float64Array(J), floorShare = o.floorShare ?? 0.4;
  const uGrad = (x, y, z) => { const e = 1e-4; return [(head.parts(x + e, y, z).u - head.parts(x - e, y, z).u) / (2 * e), (head.parts(x, y + e, z).u - head.parts(x, y - e, z).u) / (2 * e), (head.parts(x, y, z + e).u - head.parts(x, y, z - e).u) / (2 * e)]; };
  const row = new Float64Array(J);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const p = head.parts(x, y, z);
    const lower = isLower(x, y, p);
    side[v] = lower ? 1 : 0;
    // the roof of the mouth (the palate, the upper lip's underside, the slit's upper wall: upper tissue facing down)
    // belongs to the skull and the upper jaws: the hyoid, close under it, must not drag it down
    const nl = Math.hypot(vn[v * 3], vn[v * 3 + 1], vn[v * 3 + 2]) || 1, ny = vn[v * 3 + 1] / nl;
    const roof = !lower && ny < -0.3 && (x < rictus || y > 0.12) && x < 0.75;
    roofs[v] = roof ? 1 : 0;
    // the roof proper faces into the mouth: a ray down its normal meets the head again (the floor, the lower lip, the
    // tongue). The rule above also takes in the outer skin facing down (the snout's and the cheeks' undersides),
    // which the smoothing must not cut along its iso-normal line (a seam the labial band's weights would show)
    if (roof) {
      const nx = vn[v * 3] / nl, nz = vn[v * 3 + 2] / nl;
      let t = 0.004, hit = false;
      for (let it = 0; it < 64 && t < 0.25; it++) { const h = head(x + nx * t, y + ny * t, z + nz * t); if (h < 0) { hit = true; break; } t += Math.max(h, 0.002); }
      roofIn[v] = hit ? 1 : 0;
    }
    throat[v] = !roof && ny < -0.35 && y < 0.10 && x > 0.14 && x < 0.85 ? 1 : 0;
    rule(x, y, z, p, lower, roof, ny, row);
    // the gill slit's floor (the body wall in the pocket under the flap, in front of the margin) takes `floorShare` of
    // the flap's weights, so the shut slit stays shut while the covers move a little (gulp, the cheeks' bulge) and opens
    // only as they swing out (vent): Michel 2014 (fading to the trunk's own at the margin) (round n15, 0.4: the pocket's
    // mean gap mid-slit at gulp 0.024 → 0.020 HL, vent 0.036 → 0.027 (0.02–0.05 measured), the flap's swing 0.058 and
    // the wall behind the margin 0.006 unchanged)
    if (floorShare > 0 && p.f < -GS.depth && y > GS.y0 - 0.01 && y < GS.y1 + 0.01) {
      const behind = x - sOp(y);
      if (behind < 0 && behind > -GS.reach - 0.02) {
        rule(x, y, z, { ...p, f: -GS.depth + 1e-4 }, lower, roof, ny, rowQ);
        const a = floorShare * smooth(0, 0.01, -behind);
        for (let k = 0; k < J; k++) row[k] = (1 - a) * row[k] + a * rowQ[k];
      }
    }
    if (bu1 > bu0 && !lower && x < rictus + 0.05 && p.u > 1e-4 && p.u < bu1) {
      // (the lining of the mouth's cavity behind the pads, and in front of it, comes along: it is the lips' inner face)
      const phi = 1 - Math.min(1, Math.max(0, (p.u - bu0) / (bu1 - bu0)));
      // the pad's nearest point (Newton steps along the pad field's gradient)
      let qx = x, qy = y, qz = z, qu = p.u;
      for (let it = 0; it < 4 && Math.abs(qu) > 2e-4; it++) {
        const g = uGrad(qx, qy, qz), gg = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] || 1;
        qx -= (qu * g[0]) / gg; qy -= (qu * g[1]) / gg; qz -= (qu * g[2]) / gg;
        qu = head.parts(qx, qy, qz).u;
      }
      const pq = head.parts(qx, qy, qz);
      rule(qx, qy, qz, pq, false, roof, ny, rowQ);
      for (let k = 0; k < J; k++) row[k] = phi * rowQ[k] + (1 - phi) * row[k];
    }
    for (let k = 0; k < J; k++) W[v * J + k] = row[k];
  }
  // smoothing over the mesh's edges (Laplacian, a few passes)
  if (iters > 0) {
    const nb = Array.from({ length: n }, () => new Set());
    // nothing smooths across the gape in front of the rictus, even where the mesh bridges the slit, nor across the edge of
    // the mouth's roof inside the mouth
    const link = (a, b) => { if (side[a] !== side[b] && pos[a * 3] < rictus - 0.02 && pos[b * 3] < rictus - 0.02) return; if (roofs[a] !== roofs[b] && (roofIn[a] || roofIn[b])) return; nb[a].add(b); nb[b].add(a); };
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
  // the eyes: the sculpt runs the head into each globe above its cup's rim (the web between the domes, the fillets, the
  // rim's ends: head.mjs cup.carveTop), so head surface lies inside the rest globe, hidden by it. It rides with the
  // globe (J_eyeL/R) wherever the globe goes; the skin just outside it above the rim (within `eyeBand`) follows in part,
  // and so does the cup's rim (its share `eyeCup`, fading down the cup to its base): the dermal cup's skin runs on into
  // the globe's own, so a raised globe draws the rim and the head's surface up after it as a sleeve instead of
  // leaving the socket's lining and the hidden faces bare. Near the midline the share is split between the two eyes,
  // so the web between the domes follows both. (The blink's blend shape takes this share of the globe's drop out of
  // its own: blinkTargets o.weights.)
  // (eyeIn: inside the globe out to re − eyeIn the weight is 1; −0.001 since round n15, so the head's surface the sculpt
  // runs into the globe just under its skin (in front, where the rim is lowered, head.mjs cup.D) rides up whole: at
  // 0.0015 it took the cup's 0.8–0.9 there and peeked out under the raised dome, 101 px in the eyesUp side view)
  const eyeIn = o.eyeIn ?? -0.001, eyeBand = o.eyeBand ?? 0.012, eyeCup = o.eyeCup ?? 0.8;
  if (eyeBand >= 0 && head.cup) {
    const E = HEAD.eye, re = E.d / 2, rimH = head.cup.rimH, C = o.K?.cup ?? {}, rimR = re + (C.gap ?? 0.0015) + (C.thick ?? 0.02);
    const we = new Float32Array(n), fixed = new Uint8Array(n), cand = [];
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const dx = x - E.s, dy = y - E.y, dz = Math.abs(z) - E.z, r = Math.hypot(dx, dy, dz);
      if (r > re + 0.07) continue;
      cand.push(v);
      if (r < re - eyeIn) { we[v] = 1; fixed[v] = 1; continue; }
      const h = rimH(dx, dz), above = smooth(h - 0.004, h + 0.006, dy);
      const e = Math.asin(Math.max(-1, Math.min(1, dy / r))), er = Math.asin(Math.max(-0.99, Math.min(0.99, h / rimR)));
      // (between the domes the whole web follows: its saddle lies 0.03 HL off either globe)
      const band = eyeBand + ((o.webBand ?? 0.05) - eyeBand) * smooth(0, 0.05, E.z - dz) * smooth(-0.02, 0.03, dy);
      const top = 1 - smooth(re - eyeIn, re + band, r);
      const cup = eyeCup * smooth(er - 0.5, er - 0.05, e) * (1 - smooth(rimR + 0.004, rimR + 0.03, r));
      we[v] = above * top + (1 - above) * cup;
    }
    // a few passes of smoothing over the mesh (the globe's inside held), so the share has no seams
    const nbE = new Map();
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      for (const [p, q] of [[a, b], [b, c], [c, a]]) { if (!nbE.has(p)) nbE.set(p, new Set()); if (!nbE.has(q)) nbE.set(q, new Set()); nbE.get(p).add(q); nbE.get(q).add(p); }
    }
    let cur = Float32Array.from(we), nx2 = Float32Array.from(we);
    for (let it = 0; it < (o.eyeSmooth ?? 6); it++) {
      for (const v of cand) { if (fixed[v]) continue; const nb = nbE.get(v); let acc = cur[v], c = 1; if (nb) for (const u of nb) { acc += cur[u]; c++; } nx2[v] = acc / c; }
      [cur, nx2] = [nx2, cur];
    }
    for (const v of cand) {
      const w = Math.min(1, Math.max(0, cur[v]));
      if (w <= 0) continue;
      const z = pos[v * 3 + 2], toL = 0.5 + 0.5 * (Math.abs(z) < 0.03 ? Math.sin((z / 0.03) * Math.PI / 2) : Math.sign(z));
      for (let k = 0; k < J; k++) W[v * J + k] *= 1 - w;
      W[v * J + idx.J_eyeL] += w * toL;
      W[v * J + idx.J_eyeR] += w * (1 - toL);
    }
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
  // (morph: the gape's correctives, gapeTargets: `gape` driven by J_jaw / 70°, `gum` by J_jaw / 25°)
  gapeFull: { J_jaw: { angle: 70 }, J_imj: { angle: 15 }, J_premax: { angle: 12, slide: 0.07 }, J_maxL: { angle: 25 }, J_maxR: { angle: 25 }, J_hyoid: { angle: 14 }, J_suspL: { angle: 6 }, J_suspR: { angle: 6 }, J_opercL: { angle: 8 }, J_opercR: { angle: 8 }, morph: { gape: 1, gum: 1 } },
  gapeHalf: { J_jaw: { angle: 32 }, J_premax: { angle: 6, slide: 0.035 }, J_maxL: { angle: 12 }, J_maxR: { angle: 12 }, J_hyoid: { angle: 6 }, morph: { gape: 32 / 70, gum: 1 } },
  // buccal pumping: the hyoid down, the cheeks out, the mouth shut
  gulp: { J_hyoid: { angle: 4 }, J_suspL: { angle: 6 }, J_suspR: { angle: 6 }, J_opercL: { angle: 4 }, J_opercR: { angle: 4 }, morph: { throat: 1 } },
  // the cheeks blown up (u5; a mouthful of water or air held on land, and the males' display): the suspensoria and
  // the gill covers abducted, the hyoid down and the throat's pouch full, the mouth and the slits shut (the cheeks'
  // own swelling is the soft tissue's blend shape)
  // (the skeleton's share alone: the full u5 state, with the skin's balloon, is `inflated` below)
  inflate: { J_hyoid: { angle: 5 }, J_suspL: { angle: 12 }, J_suspR: { angle: 12 }, J_opercL: { angle: 6 }, J_opercR: { angle: 6 }, morph: { throat: 1 } },
  // the cheeks and gill covers inflated with a mouthful of water or air (u5; research/anat_soft.md §3.4): the
  // suspensoria and the gill covers swing out, the hyoid drops its full 18°, the mouth and the gill slits stay shut;
  // the skin is carried onto the balloon by the `inflate` blend shape (head-inflated.mjs, inflateTargets). The bones
  // fill the balloon: the suspensoria abduct 21° and the gill covers a further 26° about their front edge, tilted down
  // 22° (`lift`) so that their hind margins swing out under the widest part while their upper edges stay under u5's
  // narrowing shoulders (the opercle's front 0.075 HL under the skin at most, s 0.65–0.85; its dorsal edge in but for
  // 0.006). The hyoid bars splay 12° on their hypohyals (J_chL/R), so the interhyals stay with the abducted suspensoria
  // (0.048 HL apart, not 0.09), and the branchiostegal rays fan 14° down and out (J_bstegL/R) under the ballooned floor
  // of the gill chambers instead of rising behind the dropped hyoid (their tips 0.014 HL under the skin).
  // inflatedHalf: the game's drive at weight 0.5: the suspensoria, the hyoid and its splay at w of the full, the gill
  // covers and the rays at w² (they open last, Michel 2014), the inflate morph at 0.5 with its in-between shape
  // (inflateMidMorph) at 1, so the skin is exactly half-way and every bone under it; driven by w, w² and 4w(1 − w) the
  // skin misses the ideal (bind + w × the inflation) by 0.004–0.005 HL at most at w 0.25 and 0.75
  inflated: { J_suspL: { angle: 21 }, J_suspR: { angle: 21 }, J_opercL: { angle: 26, lift: -22 }, J_opercR: { angle: 26, lift: -22 }, J_hyoid: { angle: 18 }, J_chL: { angle: 12 }, J_chR: { angle: 12 }, J_bstegL: { angle: 14 }, J_bstegR: { angle: 14 }, morph: { inflate: 1 } },
  inflatedHalf: { J_suspL: { angle: 10.5 }, J_suspR: { angle: 10.5 }, J_opercL: { angle: 6.5, lift: -5.5 }, J_opercR: { angle: 6.5, lift: -5.5 }, J_hyoid: { angle: 9 }, J_chL: { angle: 6 }, J_chR: { angle: 6 }, J_bstegL: { angle: 3.5 }, J_bstegR: { angle: 3.5 }, morph: { inflate: 0.5, inflateMid: 1 } },
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
 * The blink's blend shapes (left and right): the eye is pulled down into its orbit (Aiello et al. 2023: the globe drops
 * ≈0.5–0.6 ED) and the dermal cup, which no muscle moves, is drawn up over it like a lid; closed, the domes are low,
 * smooth, convex skin-covered bumps with a seam near the top (Movies S1, S3). Built as the closed shape (round n16):
 *   - the lid: in each section across the head (s fixed) the cup's lateral wall runs up to its rim at thR and the globe
 *     lies bare from there over the top to the medial lobe at thJ (where the head's surface meets the globe: both read
 *     off the sculpt); the wall swings up about the globe's long axis until its rim meets the lobe (`hinge`: `margin`
 *     short of it, `depth` the wall's profile under the rim, fading out at the dome's ends over `ends`), its outer half
 *     laid on the lowered globe as a shell `th[0]` proud thinning to flush at its rim, its inner half (the socket's
 *     lining, split at the bead's mid-thickness: `split`) tucked inside the globe, so the closed dome is skin all over
 *     with one seam from front to back near the top; (`hinge: false`: the older ring map, the cup closing up the globe
 *     toward its top within `lipAz` of the window, to `cover` by `lamMin`…1, which leaves a crescent of the globe bare)
 *   - elsewhere (the lobes, the fillets, the web between the domes, the ridge before them, the nape) the skin rides down
 *     with the globe by rho, 1 on and in it and falling off with the distance from it (`fall`)
 *   - all of it laid onto the closed head's surface, a field: the head without its domes (the collar and the mass under
 *     them, the web between them lowered by `mu` of the drop) smoothly united (`k`, round the domes' foot only) with the
 *     lowered domes and their medial lobes, so each dome sinks into the head with fillets and no clefts in front of it,
 *     behind it or between the two; then relaxed over that surface (`iters` passes of `lambda`, laid again each pass),
 *     so the swing's folds and the pleats even out
 *   - what lay inside the rest globe, and the faces that looked into the socket, stay inside the lowered globe
 * Displacements are in the bind frame, applied before the skinning; the globe itself is moved by J_eyeL/R (BLINK_DROP),
 * and so is the eye joints' share of each vertex (o.weights, headWeights), which is taken out of the displacement. The
 * both-eyes shape is split between the two blend shapes across the midline as the eye joints' weights are, so blinkL +
 * blinkR is the both-closed shape and either alone leaves no step there.
 * @param o { weights, index (the mesh's triangles: the relaxation needs them), drop, close: { the closed shape's
 *            tunables, BLINK_CLOSE }, and the lid's: base, cover, lamMin, azimuths, lipAz, reach, thick, rimThick, tuck, hugT, thin }
 * @returns { L, R: Float32Array displacements (HL); normal, normalShare: the closed surface's normals where the skin was
 *   laid on it (bind frame) and their share, for the blend shapes' normal deltas }
 */
export const BLINK_CLOSE = { k: 0.03, th: [0.008, 0.0005], el: [30, 2], tuckR: [0.022, 0.03], edgeK: 0.03, split: [0.12, 0.15], mu: 0.5, iters: 90, lambda: 0.5, proj: 6, region: [0.07, 0.13], fall: [0, 0.07], rhoSmooth: 20, lobeK: 0.003, hinge: { ends: [0.92, 0.99], margin: 0.035, depth: 0.7, offRim: [0.026, 0.04] } };
export function blinkTargets(pos, nrm, headSDF, K, o = {}) {
  const CO = { ...BLINK_CLOSE, ...(o.close ?? {}) };
  if (o.close && o.close.hinge !== undefined && o.close.hinge !== false) CO.hinge = { ...BLINK_CLOSE.hinge, ...o.close.hinge };
  const drop = o.drop ?? BLINK_DROP, base = o.base ?? -1.15, cover = ((o.cover ?? 72) * Math.PI) / 180;
  const reach = o.reach ?? 0.075, deep = o.deep ?? 0.006;
  const thick = o.thick ?? 0.010, rimThick = o.rimThick ?? 0.0035, tuck = o.tuck ?? 0.004;
  const E = HEAD.eye, re = E.d / 2, C = K.cup, lo = (C.low * Math.PI) / 180, gap = C.gap ?? 0.0015;
  const f = headSDF(K, { cut: true });
  const rimH = f.cup.rimH, rimR = re + gap + (C.thick ?? 0.02);
  const [c0, c1] = o.azimuths ?? [150, 0], lamMin = o.lamMin ?? 0.35, lipAz = o.lipAz ?? [50, 80];
  const cosd = (d) => Math.cos((d * Math.PI) / 180);
  const lipOf = (cA) => 1 - smooth(cosd(lipAz[0]), cosd(lipAz[1]), cA);
  const n = pos.length / 3, L = new Float32Array(n * 3), R = new Float32Array(n * 3);
  const eyeShare = new Float32Array(n);
  if (o.weights) {
    const iL = JOINT_NAMES.indexOf('J_eyeL'), iR = JOINT_NAMES.indexOf('J_eyeR');
    for (let v = 0; v < n; v++) for (let q = 0; q < 4; q++) { const j = o.weights.joints[v * 4 + q]; if (j === iL || j === iR) eyeShare[v] += o.weights.weights[v * 4 + q]; }
  }
  // ---- the closed head's field
  // the head without its domes: no bead, no rim cut, no socket, no fillets, no lobes (the collar and its crease stay)
  const Kc = structuredClone(K);
  Object.assign(Kc.cup, { A: 1, B: 0, C: 0, D: 0, thick: -1, carveTop: [-9, -8.99], carveWin: [0, 1e-4] });
  delete Kc.cup.fillet; delete Kc.cup.neck;
  const M0 = headSDF(Kc, { cut: true });
  // the web between the domes (the septum and the turret's top, over the frontals) lowered by mu of the drop
  const muAt = (x, z) => CO.mu * (1 - smooth(0.02, 0.10, Math.abs(z))) * smooth(0.17, 0.25, x) * (1 - smooth(0.36, 0.46, x));
  const Mw = (x, y, z) => M0(x, y + drop * muAt(x, z), z);
  const cyL = E.y - drop, NK = C.neck ?? { shift: 0 };
  // (the sculpt's radial-profile lobes, cup.neck with `rise` (head.mjs neckLobe), laid on the lowered globes like their
  // shell; they meet the globe nearly tangent, so they are united with it over only `lobeK`, not the neck's own blend,
  // which would swell the whole band where the two nearly coincide)
  const NKL = NK.rise !== undefined ? neckLobe(NK, re) : null;
  // the closing rim's elevation (seen from the lowered centre) for an azimuth: the shell over the globe thins to the
  // rim, where it meets the globe's own skin flush (a seam, not a step)
  const eTof = (dx, dz, cA) => {
    const er = Math.asin(Math.max(-0.99, Math.min(0.99, rimH(dx, dz) / rimR)));
    const lam = lamMin + (1 - lamMin) * smooth(cosd(c0), cosd(c1), cA);
    return er + (Math.max(er, cover) - er) * lam;
  };
  const thAt = (dx, dy, dz) => {
    const h = Math.hypot(dx, dz) || 1e-9, el = Math.atan2(dy, h), cA = Math.cos(Math.atan2(-dx, dz) - lo);
    const lip = lipOf(cA), eT = eTof(dx, dz, cA);
    return CO.th[1] + (CO.th[0] - CO.th[1]) * lip * (1 - smooth(eT - (CO.el[0] * Math.PI) / 180, eT - (CO.el[1] * Math.PI) / 180, el));
  };
  const thAtH = (dx, dy, dz) => {
    const th = Math.atan2(dy, dz), thT = tabAt(thJt, dx) - HG.margin;
    return CO.th[1] + (CO.th[0] - CO.th[1]) * (1 - smooth(thT - (CO.el[0] * Math.PI) / 180, thT - (CO.el[1] * Math.PI) / 180, th)) * (1 - smooth(re * 0.86, re * 0.98, Math.abs(dx)));
  };
  const thBl = (dx, dy, dz) => (HG ? thAtH(dx, dy, dz) : thAt(dx, dy, dz));
  const dome = (x, y, z) => {
    const za = Math.abs(z), dx = x - E.s, dy = y - cyL, dz = za - E.z;
    const g = Math.hypot(dx, dy, dz) - (re + thBl(dx, dy, dz));
    if (NKL) {
      const lobe = (zz) => NKL(dx, dy, zz - E.z) - CO.th[1];
      return smin1(g, smin1(lobe(z), lobe(-z), NK.k ?? 0.004), CO.lobeK);
    }
    if (!NK.shift) return g;
    const lobe = (zz) => Math.hypot(dx, dy, zz - E.z + NK.shift) - (re + (NK.dr ?? 0) + CO.th[1]);
    return smin1(g, smin1(lobe(z), lobe(-z), NK.k ?? 0.004), NK.blend ?? 0.01);
  };
  // the fillet between the head and the dome only round the dome's foot: over its top the dome is itself (the globe's
  // own skin there, the head's surface meeting it as at rest)
  const kAt = (x, y, z) => { const dy = y - cyL, h = Math.hypot(x - E.s, Math.abs(z) - E.z) || 1e-9, el = Math.atan2(dy, h); return CO.k * (1 - smooth((CO.kEl?.[0] ?? 20) * Math.PI / 180, (CO.kEl?.[1] ?? 50) * Math.PI / 180, el)) + 1e-5; };
  const T = (x, y, z) => smin1(Mw(x, y, z), dome(x, y, z), kAt(x, y, z));
  const project = (q, steps) => {
    let [x, y, z] = q;
    for (let i = 0; i < steps; i++) {
      const d = T(x, y, z), e = 1e-4;
      if (Math.abs(d) < 2e-6) break;
      const gx = (T(x + e, y, z) - d) / e, gy = (T(x, y + e, z) - d) / e, gz = (T(x, y, z + e) - d) / e;
      const gg = gx * gx + gy * gy + gz * gz || 1;
      x -= (d * gx) / gg; y -= (d * gy) / gg; z -= (d * gz) / gg;
    }
    return [x, y, z];
  };
  // ---- rho: the translation's share off the lip (1 on and in the globe, falling off with the distance from it)
  const [a0, a1] = CO.fall ?? [0, 0.07];
  const rho = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let best = 0;
    for (const sd of [1, -1]) best = Math.max(best, 1 - smooth(a0, a1, Math.hypot(x - E.s, y - E.y, z - sd * E.z) - re));
    rho[v] = best;
  }
  const rhoS = o.index ? smoothOnMesh(rho, o.index, CO.rhoSmooth ?? 20) : rho;
  // ---- the hinge (CO.hinge): in each section across the head (s fixed) the cup's lateral wall runs up to its rim at
  // thR, the globe lies bare from there over the top to the medial lobe at thJ (the head's surface meets the globe
  // there); closing, the lateral wall swings up about the globe's long axis like a lid until its rim meets the lobe,
  // so the closed dome is skin all over with one seam from front to back near the top (Aiello et al. 2023, Movie S3)
  const HG = CO.hinge, tabW = 0.002, tabN = Math.ceil((2 * re) / tabW) + 1, thRt = new Float32Array(tabN), thJt = new Float32Array(tabN);
  if (HG) {
    for (let i = 0; i < tabN; i++) {
      const w = -re + i * tabW, R0 = re + 0.002, rr0 = Math.sqrt(Math.max(1e-8, R0 * R0 - w * w));
      let prev = null, tR = -Math.PI / 2, tJ = Math.PI, stage = 0;
      for (let a = -100; a <= 200; a += 0.5) {
        const th = (a * Math.PI) / 180, inH = f(E.s + w, E.y + rr0 * Math.sin(th), E.z + rr0 * Math.cos(th)) < 0;
        if (prev === true && !inH && stage === 0) { tR = th; stage = 1; }
        else if (prev === false && inH && stage === 1) { tJ = th; stage = 2; break; }
        prev = inH;
      }
      thRt[i] = tR; thJt[i] = tJ;
    }
  }
  const tabAt = (T, w) => { const x = Math.min(tabN - 1.001, Math.max(0, (w + re) / tabW)), i = Math.floor(x), u = x - i; return T[i] * (1 - u) + T[i + 1] * u; };
  // ---- the map
  const HID = 1, TUCK = 2, FREE = 3;
  const cls = new Uint8Array(n), Q = new Float64Array(n * 3), wReg = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const z = pos[v * 3 + 2], side = z >= 0 ? 1 : -1;
    const dx = pos[v * 3] - E.s, dy = pos[v * 3 + 1] - E.y, dz = Math.abs(z) - E.z;
    const r = Math.hypot(dx, dy, dz);
    Q[v * 3] = pos[v * 3]; Q[v * 3 + 1] = pos[v * 3 + 1]; Q[v * 3 + 2] = pos[v * 3 + 2];
    wReg[v] = 1 - smooth(re + CO.region[0], re + CO.region[1], r);
    if (wReg[v] <= 0 && rhoS[v] < 1e-4) continue;
    if (r < re - 0.0003) { Q[v * 3 + 1] -= drop; cls[v] = HID; continue; }
    const rr = rhoS[v];
    let tx = dx, ty = dy - drop * rr, tz = dz;
    const e = Math.asin(Math.max(-1, Math.min(1, dy / r)));
    const h = Math.hypot(dx, dz) || 1e-9, ux = dx / h, uz = dz / h;
    const dAz = Math.atan2(-dx, dz) - lo, cA = Math.cos(dAz), lip = lipOf(cA);
    const nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2] * side;
    const facing = (nx * dx + ny * dy + nz * dz) / r;
    // the tucking share of a lip vertex: the socket's lining and the bead's inner face, next to the globe (the collar's
    // underside, curling into the infraorbital crease, faces the globe's centre too but stays where it is); on the bead
    // itself, round the rim (its angle `a` past `aR`, the rim's), the split is its mid-thickness: the outer half is the
    // closing hood, the inner half tucks in, so the seam follows the rim's own smooth line instead of the facets' facing
    const tuckOf = (a, aR) => {
      let tk = (1 - smooth(-0.25, 0.25, facing)) * (1 - smooth(CO.tuckR[0], CO.tuckR[1], r - re));
      if (CO.split && a > aR - CO.split[0]) {
        const TP = C.taper, aD = Math.atan2(-dx, dz) - lo, cD = Math.cos(aD);
        const [tf, tt] = TP && TP.back && Math.sin(aD) < 0 ? TP.back : TP ? [TP.from, TP.to] : [0, 0];
        const tw = TP ? smooth(cosd(tf), cosd(tt), cD) : 0, thk = (C.thick ?? 0.02) * (1 - (1 - (TP ? TP.thickMin : 1)) * tw);
        const ts = 1 - smooth(re + gap + thk * (0.5 - CO.split[1]), re + gap + thk * (0.5 + CO.split[1]), r);
        const wS = smooth(aR - CO.split[0], aR - CO.split[0] * 0.5, a);
        tk = tk * (1 - wS) + ts * wS;
      }
      return tk;
    };
    const shellR = (t) => re + gap + thick + (rimThick - thick) * smooth(o.thin?.[0] ?? 0.2, o.thin?.[1] ?? 0.75, t);
    // the lid as a hinge, or the cup as a ring closing up the globe toward its top (the older map, `hinge: false`)
    const bH = HG ? 1 : 0;
    let tuckW = 0;
    const acc = [0, 0, 0];
    if (bH > 0 && r <= re + reach) {
      const w = dx, th = Math.atan2(dy, dz), thR = tabAt(thRt, w), thJ = tabAt(thJt, w);
      const thB = thR - HG.depth, thT = thJ - HG.margin;
      // (above the rim only the bead's own round swings: the head standing off the globe there, as the ridge in front of
      // the dome where the globe's front lies bare low down, is not the cup)
      const above = smooth(thR + 0.03, thR + 0.2, th) * smooth(re + gap + HG.offRim[0], re + gap + HG.offRim[1], r);
      const wl = (1 - above) * smooth(thB - 0.3, thB, th) * (1 - smooth(thJ - 0.35, thJ - 0.12, th)) * (1 - smooth(re * HG.ends[0], re * HG.ends[1], Math.abs(w))) * (1 - smooth(re + reach * 0.7, re + reach, r));
      if (wl > 0) {
        const t = Math.min(1, Math.max(0, (th - thB) / Math.max(0.05, thR - thB))), st = smooth(0, 1, t);
        const vc = dy + drop, thc = Math.atan2(vc, dz), rhoc = Math.hypot(dz, vc);
        const th2 = smin1(thc + (th - thc + thT - thR) * st, thT, CO.edgeK);
        const tk = tuckOf(th, thR), Rs = shellR(t) + (re - tuck - shellR(t)) * tk;
        const rhoS = Math.sqrt(Math.max(1e-6, Rs * Rs - w * w)), rho2 = rhoc + (rhoS - rhoc) * smooth(0, o.hugT ?? 0.25, t);
        const lx = dx, ly = rho2 * Math.sin(th2) - drop, lz = rho2 * Math.cos(th2);
        acc[0] += (lx - tx) * wl; acc[1] += (ly - ty) * wl; acc[2] += (lz - tz) * wl;
        if (tk > 0.5 && t > 0.05) tuckW += wl;
      }
    }
    if (bH < 1 && lip > 0 && r <= re + reach && e > base) {
      const er = Math.asin(Math.max(-0.99, Math.min(0.99, rimH(dx, dz) / rimR)));
      const lam = lamMin + (1 - lamMin) * smooth(cosd(c0), cosd(c1), cA);
      const eT = er + (Math.max(er, cover) - er) * lam;
      const yc = dy + drop, rc = Math.hypot(h, yc), ec = Math.atan2(yc, h);
      const t = Math.min(1, (e - base) / Math.max(0.05, er - base)), st = smooth(0, 1, t);
      // (the rim's own round, above its line, is kept at the closing rim (a soft clamp): carried on past it, it lay as a
      // flap over the globe beyond the seam and folded back to the tucked lining in a wall that showed its back)
      const e2 = smin1(ec + (e - ec + eT - er) * st, eT, CO.edgeK);
      const tk = tuckOf(e, er), R2 = shellR(t) + (re - tuck - shellR(t)) * tk;
      const r2 = rc + (R2 - rc) * smooth(0, o.hugT ?? 0.25, t);
      const lx = ux * Math.cos(e2) * r2, ly = Math.sin(e2) * r2 - drop, lz = uz * Math.cos(e2) * r2;
      const wl = (1 - bH) * lip * (1 - smooth(re + reach * 0.7, re + reach, r));
      acc[0] += (lx - tx) * wl; acc[1] += (ly - ty) * wl; acc[2] += (lz - tz) * wl;
      if (tk > 0.5 && t > 0.05) tuckW += wl;
    }
    tx += acc[0]; ty += acc[1]; tz += acc[2];
    let tucked = tuckW > 0.5;
    Q[v * 3] = E.s + tx; Q[v * 3 + 1] = E.y + ty; Q[v * 3 + 2] = side * (E.z + tz);
    // the socket's lining off the lip (faces looking into the globe, just outside it) goes inside the lowered globe
    if (!tucked && facing < -0.3 && r < re + gap + 0.004) {
      const qx = Q[v * 3] - E.s, qy = Q[v * 3 + 1] - cyL, qz = Math.abs(Q[v * 3 + 2]) - E.z, qr = Math.hypot(qx, qy, qz) || 1, k = (re - tuck) / qr;
      if (k < 1) { Q[v * 3] = E.s + qx * k; Q[v * 3 + 1] = cyL + qy * k; Q[v * 3 + 2] = side * (E.z + qz * k); }
      tucked = true;
    }
    cls[v] = tucked ? TUCK : FREE;
  }
  // ---- laid onto the closed head, then relaxed over it
  const free = [];
  for (let v = 0; v < n; v++) if (cls[v] === FREE && wReg[v] > 0) free.push(v);
  // (an initial place inside the dome is first pushed out of it from the lowered centre: the cup's foot, engulfed by
  // the lowered globe, is pushed out round it before it is laid)
  for (const v of free) {
    const side = pos[v * 3 + 2] >= 0 ? 1 : -1, qx = Q[v * 3] - E.s, qy = Q[v * 3 + 1] - cyL, qz = side * Q[v * 3 + 2] - E.z, qr = Math.hypot(qx, qy, qz) || 1e-9;
    const Rd = re + thBl(qx, qy, qz);
    if (qr < Rd) { const k = Rd / qr; Q[v * 3] = E.s + qx * k; Q[v * 3 + 1] = cyL + qy * k; Q[v * 3 + 2] = side * (E.z + qz * k); }
  }
  const lay = (v, steps) => {
    const q = [Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2]], p = project(q, steps), w = wReg[v];
    for (let k = 0; k < 3; k++) Q[v * 3 + k] = q[k] + (p[k] - q[k]) * w;
  };
  for (const v of free) lay(v, CO.proj);
  if (o.index && CO.iters > 0) {
    const nb = new Map();
    const fs = new Uint8Array(n); for (const v of free) fs[v] = 1;
    const I = o.index;
    for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) {
      if (fs[a]) { if (!nb.has(a)) nb.set(a, new Set()); nb.get(a).add(b); }
      if (fs[b]) { if (!nb.has(b)) nb.set(b, new Set()); nb.get(b).add(a); }
    }
    const nbA = free.map((v) => Uint32Array.from(nb.get(v) ?? []));
    const nx = new Float64Array(free.length * 3);
    for (let it = 0; it < CO.iters; it++) {
      for (let i = 0; i < free.length; i++) {
        const v = free[i], N = nbA[i], lam = CO.lambda * wReg[v];
        // (positions, so the skin laid into a fold of the closed surface spreads out of it; `delta`: the displacements,
        // the skin keeping its own spacing)
        // (by position, so the skin laid into a fold of the closed surface spreads out of it; smoothing the
        // displacements instead left the swing's folds: 562/326 back px in the eye views)
        let x = 0, y = 0, z = 0, c = 0;
        for (const u of N) { if (cls[u] === HID || cls[u] === TUCK) continue; x += Q[u * 3]; y += Q[u * 3 + 1]; z += Q[u * 3 + 2]; c++; }
        if (!c) { nx[i * 3] = Q[v * 3]; nx[i * 3 + 1] = Q[v * 3 + 1]; nx[i * 3 + 2] = Q[v * 3 + 2]; continue; }
        nx[i * 3] = Q[v * 3] + lam * (x / c - Q[v * 3]); nx[i * 3 + 1] = Q[v * 3 + 1] + lam * (y / c - Q[v * 3 + 1]); nx[i * 3 + 2] = Q[v * 3 + 2] + lam * (z / c - Q[v * 3 + 2]);
      }
      for (let i = 0; i < free.length; i++) { const v = free[i]; Q[v * 3] = nx[i * 3]; Q[v * 3 + 1] = nx[i * 3 + 1]; Q[v * 3 + 2] = nx[i * 3 + 2]; lay(v, 2); }
    }
  }
  // ---- the closed surface's own normals where the skin was laid on it (its field's gradient, smooth: the laid mesh
  // carries the relaxation's small facets, which its rotated normals would show as a hammered sheen), with the share
  // `wReg` (build-pose.mjs blends them into the blink's normal deltas)
  const NT = new Float32Array(n * 3), NW = new Float32Array(n);
  for (const v of free) {
    const x = Q[v * 3], y = Q[v * 3 + 1], z = Q[v * 3 + 2], e = 1e-4;
    const gx = T(x + e, y, z) - T(x - e, y, z), gy = T(x, y + e, z) - T(x, y - e, z), gz = T(x, y, z + e) - T(x, y, z - e), gl = Math.hypot(gx, gy, gz) || 1;
    NT[v * 3] = gx / gl; NT[v * 3 + 1] = gy / gl; NT[v * 3 + 2] = gz / gl; NW[v] = wReg[v];
  }
  // ---- the displacements, split between the two blend shapes across the midline
  for (let v = 0; v < n; v++) {
    if (!cls[v] && wReg[v] <= 0) continue;
    const z = pos[v * 3 + 2], tl = 0.5 + 0.5 * (Math.abs(z) < 0.03 ? Math.sin((z / 0.03) * Math.PI / 2) : Math.sign(z));
    const d = [Q[v * 3] - pos[v * 3], Q[v * 3 + 1] - pos[v * 3 + 1] + drop * eyeShare[v], Q[v * 3 + 2] - pos[v * 3 + 2]];
    if (Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) < 1e-7) continue;
    for (let k = 0; k < 3; k++) { L[v * 3 + k] = d[k] * tl; R[v * 3 + k] = d[k] * (1 - tl); }
  }
  return o.debug ? { L, R, normal: NT, normalShare: NW, cls, rho: rhoS, wReg } : { L, R, normal: NT, normalShare: NW };
}

/** Jacobi smoothing of a scalar per-vertex field over the mesh's edges (k passes). */
function smoothOnMesh(A, index, k) {
  const n = A.length, nb = Array.from({ length: n }, () => []);
  for (let t = 0; t < index.length; t += 3) { const a = index[t], b = index[t + 1], c = index[t + 2]; nb[a].push(b, c); nb[b].push(a, c); nb[c].push(a, b); }
  let cur = Float32Array.from(A), nxt = new Float32Array(n);
  for (let it = 0; it < k; it++) {
    for (let v = 0; v < n; v++) { const N = nb[v]; if (!N.length) { nxt[v] = cur[v]; continue; } let s = cur[v] * 2; for (const u of N) s += cur[u]; nxt[v] = s / (N.length + 2); }
    [cur, nxt] = [nxt, cur];
  }
  return cur;
}

/**
 * The gape's correctives (corrective blend shapes, glTF morph targets, in the bind frame), round n16:
 *   gape  (driven by the lower jaw's angle: J_jaw / 70°, so 1 at gapeFull): solved for gapeFull, so the posed skin lands
 *         on (1) the skinned skin with its displacements relaxed over the upper lip (the labial groove's band spread
 *         over more of the face: `relax` boxes, `iters` Jacobi passes, never across the gape in front of the rictus; a
 *         box's `pos` share relaxes the places instead) (round n16: relaxing the mouth's corner too, by displacement or
 *         by place, spread the rictal web's stretch over more rows, 331 → 460–670 stretched triangles there, and pulling
 *         the lip's rear toward the maxilla folded it, 54 → 689 flips: the corner needs the slit's end taller, head.mjs
 *         gape.back), and
 *         (2) the lower lip everted into a raised labial rim: the lip's rim (its sculpted path, K.jaw.lip) rolled out
 *         `evert` from the jaw's U and raised `rim`, fading back toward the rictus and in to the floor, so the hanging
 *         jaw's tip is a broad U framed by its lip (the strike's round aperture) instead of a pointed spade
 *   gum   (driven by J_jaw / 25°): the oral surface round each tooth's exit (skull.mjs fitTeeth) drawn back `depth` along
 *         the tooth's axis, so the teeth, hidden under it when the mouth is shut, stand proud of the gum once it opens
 * @param o { teeth: fitTeeth(head), W: poseWorld(HEAD_POSES.gapeFull) and the overrides of GAPE_CORR }
 * @returns { gape: Float32Array, gum: Float32Array } (HL, bind frame)
 */
export const GAPE_CORR = {
  relax: [
    { box: [0.05, 0.36, 0.12, 0.30, 0.0, 1.0], soft: 0.02, lambda: 0.4 },
  ],
  iters: 40, evert: 0.03, rim: 0.006, lipBand: [0.006, 0.03], lipS: [0.13, 0.24], centre: [0.14, 0.3],
  gum: { depth: 0.013, r: [0.005, 0.014], below: 0.006, labial: [0.0, 0.004], keep: 1 },
};
export function gapeTargets(pos, nrm, index, head, K, skin, o = {}) {
  const G = { ...GAPE_CORR, ...o, gum: { ...GAPE_CORR.gum, ...(o.gum ?? {}) } };
  const n = pos.length / 3, W = o.W ?? poseWorld(HEAD_POSES.gapeFull);
  const isLower = gapeSide(K, 0.33);
  const lower = new Uint8Array(n);
  for (let v = 0; v < n; v++) lower[v] = isLower(pos[v * 3], pos[v * 3 + 1], head.parts(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])) ? 1 : 0;
  // (1) relaxed: the skinned displacements smoothed in the boxes
  const posed = skinVertices(pos, nrm, skin, W).position;
  const D = new Float64Array(n * 3);
  for (let i = 0; i < n * 3; i++) D[i] = posed[i] - pos[i];
  const lam = new Float32Array(n), posW = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], za = Math.abs(pos[v * 3 + 2]);
    for (const R of G.relax) {
      const [s0, s1, y0, y1, z0, z1] = R.box, e = R.soft;
      const w = smooth(s0 - e, s0, x) * (1 - smooth(s1, s1 + e, x)) * smooth(y0 - e, y0, y) * (1 - smooth(y1, y1 + e, y)) * smooth(z0 - e, z0, za) * (1 - smooth(z1, z1 + e, za));
      if (w * R.lambda > lam[v]) { lam[v] = w * R.lambda; posW[v] = R.pos ?? 0; }
    }
  }
  const nb = Array.from({ length: n }, () => []);
  const rictus = K.gape?.rictus ?? 0.29;
  for (let t = 0; t < index.length; t += 3) for (const [a, b] of [[index[t], index[t + 1]], [index[t + 1], index[t + 2]], [index[t + 2], index[t]]]) {
    if (lower[a] !== lower[b] && pos[a * 3] < rictus - 0.02 && pos[b * 3] < rictus - 0.02) continue;
    if (lam[a] > 0) nb[a].push(b);
    if (lam[b] > 0) nb[b].push(a);
  }
  const act = []; for (let v = 0; v < n; v++) if (lam[v] > 0 && nb[v].length) act.push(v);
  const nx = new Float64Array(act.length * 3);
  for (let it = 0; it < G.iters; it++) {
    for (let i = 0; i < act.length; i++) {
      const v = act[i], N = nb[v];
      for (let c = 0; c < 3; c++) {
        let a = 0, ap = 0; for (const u of N) { a += D[u * 3 + c]; ap += pos[u * 3 + c]; }
        // (positions: the neighbours' mean place, pos + D; displacements: their mean D)
        const target = a / N.length + posW[v] * (ap / N.length - pos[v * 3 + c]);
        nx[i * 3 + c] = D[v * 3 + c] + lam[v] * (target - D[v * 3 + c]);
      }
    }
    for (let i = 0; i < act.length; i++) for (let c = 0; c < 3; c++) D[act[i] * 3 + c] = nx[i * 3 + c];
  }
  // the bind-frame displacement that lands the skinned skin on pos + D: A (p + Δ) + b = p + D
  const T = JOINT_NAMES.map((nm) => W[nm] ?? { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
  const gape = new Float32Array(n * 3);
  for (const v of act) {
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0];
    for (let i = 0; i < 4; i++) { const w = skin.weights[v * 4 + i]; if (!w) continue; const { R, t } = T[skin.joints[v * 4 + i]]; for (let k = 0; k < 9; k++) A[k] += w * R[k]; for (let k = 0; k < 3; k++) b[k] += w * t[k]; }
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const x = solve3(A, [0, 1, 2].map((k) => p[k] + D[v * 3 + k] - b[k]));
    for (let k = 0; k < 3; k++) gape[v * 3 + k] = x[k] - p[k];
  }
  // the gum drawn back round the teeth: a trough along each row through the teeth's exits, `depth` deep (more round
  // the canines: their `gum` factor), along the teeth's axes, on the tongue's side of the row only (the lip stays in
  // front of the teeth)
  const gum = new Float32Array(n * 3), gumW = new Float32Array(n), TF = o.teeth, GU = G.gum;
  if (TF) {
    const rows = [];
    for (const row of ['dentary', 'premax']) for (const sd of [1, -1]) {
      const pts = [];
      for (const t of TF[row] ?? []) {
        if (t.exit === null || t.exit === undefined) continue;
        const dl = Math.hypot(t.tip[0] - t.root[0], t.tip[1] - t.root[1], t.tip[2] - t.root[2]) || 1, dir = [0, 1, 2].map((k) => (t.tip[k] - t.root[k]) / dl);
        pts.push({ g: [t.root[0] + dir[0] * t.exit, t.root[1] + dir[1] * t.exit, (t.root[2] + dir[2] * t.exit) * sd], dir: [dir[0], dir[1], dir[2] * sd], f: t.gum ?? 1 });
      }
      if (pts.length > 1) rows.push(pts);
    }
    for (let v = 0; v < n; v++) {
      const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      let best = 0, bd = null;
      for (const pts of rows) for (let i = 0; i + 1 < pts.length; i++) {
        const A = pts[i], B = pts[i + 1], ab = [B.g[0] - A.g[0], B.g[1] - A.g[1], B.g[2] - A.g[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
        const u = Math.min(1, Math.max(0, ((p[0] - A.g[0]) * ab[0] + (p[1] - A.g[1]) * ab[1] + (p[2] - A.g[2]) * ab[2]) / L2));
        // (the row's ends: half a tooth's spacing past the end teeth)
        const c = [A.g[0] + ab[0] * u, A.g[1] + ab[1] * u, A.g[2] + ab[2] * u], dir = [0, 1, 2].map((k) => A.dir[k] * (1 - u) + B.dir[k] * u), f = A.f * (1 - u) + B.f * u;
        const q = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], along = q[0] * dir[0] + q[1] * dir[1] + q[2] * dir[2];
        if (along < -GU.below || along > 0.004) continue;
        const rad = Math.hypot(q[0] - dir[0] * along, q[1] - dir[1] * along, q[2] - dir[2] * along);
        let ox = (c[0] - G.centre[0]) * G.centre[1], oz = c[2]; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
        const lab = q[0] * ox + q[2] * oz;
        const w = (1 - smooth(GU.r[0], GU.r[1], rad)) * (1 - smooth(GU.labial[0], GU.labial[1], lab)) * f;
        if (w > best) { best = w; bd = dir; }
      }
      if (best > 0) { gumW[v] = Math.min(1, best); for (let k = 0; k < 3; k++) gum[v * 3 + k] = -bd[k] * GU.depth * best; }
    }
  }
  // (2) the lower lip everted (bind frame: the lip rides on the jaw, so the displacement turns with it); not the gum
  // drawn back round the teeth (its share `gum.keep`): with the lower lip set back over the dentary's front (head.mjs
  // jaw.lip), the rim's band reached the tongue side of the row and rolled the gum out over the tips at the full gape
  const LP = K.jaw?.lip?.path;
  if (LP && G.evert > 0) {
    const seg = (q) => { let best = Infinity, bt = 0, bs = 0; for (let i = 0; i + 1 < LP.length; i++) { const a = LP[i], c = LP[i + 1], ab = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1; const tt = Math.min(1, Math.max(0, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1] + (q[2] - a[2]) * ab[2]) / L2)); const d = Math.hypot(q[0] - a[0] - ab[0] * tt, q[1] - a[1] - ab[1] * tt, q[2] - a[2] - ab[2] * tt); if (d < best) { best = d; bs = a[0] + ab[0] * tt; } } return [best, bs]; };
    for (let v = 0; v < n; v++) {
      if (!lower[v]) continue;
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], za = Math.abs(z);
      const [d, sOn] = seg([x, y, za]);
      const w = (1 - smooth(G.lipBand[0], G.lipBand[1], d)) * (1 - smooth(G.lipS[0], G.lipS[1], sOn)) * (1 - (GU.keep ?? 0) * gumW[v]);
      if (w <= 0) continue;
      // outward from the jaw's U (an ellipse's normal about `centre`: mostly lateral on the sides, forward at the front)
      let ox = (x - G.centre[0]) * G.centre[1], oz = za; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      gape[v * 3] += G.evert * w * ox; gape[v * 3 + 1] += G.rim * w; gape[v * 3 + 2] += G.evert * w * oz * Math.sign(z || 1);
    }
  }
  return { gape, gum };
}

/**
 * A blend shape's normal deltas (glTF morph target NORMAL, bind frame), so the game shades the moved skin as the shape it
 * is: each bind normal turned as the smoothed facet normals round it turn between the bind mesh and the mesh moved by
 * the displacements D (the rotation taking the one to the other, applied to the bind normal, so the normal's own detail
 * is kept), minus the bind normal. Where nothing moves the delta is exactly 0.
 * @param D     displacements (bind frame, HL)
 * @param o     { smooth: passes of the facet normals' smoothing (2), eps: the displacement below which a vertex and its
 *              ring are taken as unmoved }
 * @returns Float32Array (n·3)
 */
export function morphNormals(pos, nrm, index, D, o = {}) {
  const n = pos.length / 3, k = o.smooth ?? 2, eps = o.eps ?? 1e-6, out = new Float32Array(n * 3);
  const moved = new Uint8Array(n);
  for (let v = 0; v < n; v++) if (Math.abs(D[v * 3]) + Math.abs(D[v * 3 + 1]) + Math.abs(D[v * 3 + 2]) > eps) moved[v] = 1;
  // (the ring round a moved vertex is shaded anew too: its facets moved)
  const near = Uint8Array.from(moved);
  for (let t = 0; t < index.length; t += 3) if (moved[index[t]] || moved[index[t + 1]] || moved[index[t + 2]]) { near[index[t]] = 1; near[index[t + 1]] = 1; near[index[t + 2]] = 1; }
  const P1 = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i++) P1[i] = pos[i] + D[i];
  const fb = smoothField(faceNormals(pos, index), index, k), fm = smoothField(faceNormals(P1, index), index, k);
  for (let v = 0; v < n; v++) {
    if (!near[v]) continue;
    const a = [fb[v * 3], fb[v * 3 + 1], fb[v * 3 + 2]], b = [fm[v * 3], fm[v * 3 + 1], fm[v * 3 + 2]];
    const la = Math.hypot(...a) || 1, lb = Math.hypot(...b) || 1;
    for (let c = 0; c < 3; c++) { a[c] /= la; b[c] /= lb; }
    const n0 = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]], r = rotateTo(a, b, n0), l = Math.hypot(...r) || 1;
    for (let c = 0; c < 3; c++) out[v * 3 + c] = r[c] / l - n0[c];
  }
  return out;
}

/** Area-weighted vertex normals of a triangle mesh. */
export function faceNormals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { N[i] += nx; N[i + 1] += ny; N[i + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}

/** Jacobi smoothing of a per-vertex field (any number of components) over the mesh's edges. */
export function smoothField(A, I, k) {
  let n = 0; for (const i of I) if (i >= n) n = i + 1;
  const m = A.length / n;
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b); }
  let cur = Float32Array.from(A), nxt = new Float32Array(A.length);
  for (let it = 0; it < k; it++) {
    for (let v = 0; v < n; v++) for (let c = 0; c < m; c++) { let s = cur[v * m + c]; for (const u of nb[v]) s += cur[u * m + c]; nxt[v * m + c] = s / (nb[v].size + 1); }
    [cur, nxt] = [nxt, cur];
  }
  return cur;
}

/** The rotation taking unit a to unit b, applied to n (Rodrigues). */
export function rotateTo(a, b, n) {
  const v = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (c < -0.999) return n;
  const vn = [v[1] * n[2] - v[2] * n[1], v[2] * n[0] - v[0] * n[2], v[0] * n[1] - v[1] * n[0]], k = (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / (1 + c);
  return [n[0] * c + vn[0] + v[0] * k, n[1] * c + vn[1] + v[1] * k, n[2] * c + vn[2] + v[2] * k];
}

/**
 * Normal deltas in the bind frame from normals wanted on the posed skin (the inflation's rule in build-pose.mjs): the
 * bind normal whose skinning (Σ w R) gives the posed one, minus the bind normal (the in-between shape's: minus the
 * bind normal moved by `base` already, e.g. half the full shape's delta).
 */
export function bindNormalDeltas(nrm, skin, W, Nposed, base = null) {
  const n = nrm.length / 3, out = new Float32Array(n * 3);
  const T = JOINT_NAMES.map((nm) => W[nm] ?? { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
  for (let v = 0; v < n; v++) {
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 4; i++) { const w = skin.weights[v * 4 + i]; if (!w) continue; const { R } = T[skin.joints[v * 4 + i]]; for (let k = 0; k < 9; k++) A[k] += w * R[k]; }
    const x = solve3(A, [Nposed[v * 3], Nposed[v * 3 + 1], Nposed[v * 3 + 2]]), l = Math.hypot(...x) || 1;
    for (let c = 0; c < 3; c++) {
      const b0 = base ? nrm[v * 3 + c] + base[v * 3 + c] : nrm[v * 3 + c];
      out[v * 3 + c] = x[c] / l - b0;
    }
  }
  return out;
}

/**
 * The throat pouch blend shape: in buccal pumping (and in display, Matoba & Dotsu 1977) the floor of the mouth and the
 * branchiostegal membrane, slung between the rami and the gill covers, bulge out as one rounded pouch under the
 * water or air the fish holds (Michel et al. 2016: the ventral contour drops behind the chin and stays round). The
 * hyoid's own drop (J_hyoid) pulls the midline; this rounds it: every downward-facing vertex of the outer floor moves
 * out along its normal by `amp` × a profile that is full between s 0.3 and 0.7 and across the floor's middle,
 * fading to nothing at the chin, at the gill covers' margin and up the cheeks.
 * @param o { amp, index (the triangles: the displacement is smoothed over the mesh, `smooth` passes) }
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
  // (smoothed over the mesh, `smooth` passes, round n16: the profile's masks on the normal's y and the floor's top cut
  // the pouch off in a fold behind the mouth's corner, which its normal deltas showed as a dark seam there)
  if (o.index && (o.smooth ?? 12) > 0) return smoothField(D, o.index, o.smooth ?? 12);
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

/** The inflation's tissue rules (inflateTargets): the lower jaw's ramp from the throat (ballooning) to the lower lip
 * (staying), eased into the cheek's rule behind the rictus (`lowerBack`) and under the chin (`underRamp`) so the mask
 * has no step where the jaw's tissue ends; the upper lip's pads, which stay on their jaw bones (the premaxillae and
 * maxillae do not move with the inflation) and follow the swelling skin under them by only `follow`, the skin round
 * them easing from that share to the cheek's over `iso` (their distance from the pad), their stand-off shrinking by up
 * to `flatten` as the fold is stretched; where the balloon takes in a pad's hind half (`engulf`: its depth inside the
 * balloon), the pad and the skin round it go out with the cheek, laid onto the inflated head by `lay` passes of a
 * relaxation over its surface: u5's flat wavy lip band with its corners tucked into the ball, not lobes standing off
 * it; the mouth's corner, where the displacement is relaxed over the mesh (the lips' corner, the rictal fold and the
 * jaw's side meet there, and moved apart they crumple); and `linSmooth`, the smoothing passes made exact for a field
 * that changes linearly across the skin (on the uneven mesh a plain ring mean shifts such a field and drew the steep
 * drop under the chin into striations). */
export const INFLATE_TISSUE = {
  lowerY: [0.035, 0.075], lowerBack: [0.30, 0.40], underRamp: true,
  pad: { iso: [0.002, 0.06], follow: 0.25, flatten: 0.4, engulf: [0, 0.08], lay: 30, layFade: 1 },
  relax: { c: [0.29, 0.075, 0.19], r: [0.09, 0.075, 0.11], iters: 80 },
  linSmooth: true,
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
 * The pads stay on their jaw bones and the swollen cheek closes round them; where the balloon takes in their hind halves
 * they are laid onto it with the cheek (INFLATE_TISSUE.pad: only the lip band shows, its corners tucked into the ball);
 * round the mouth's corner the displacement is relaxed over the mesh (INFLATE_TISSUE.relax), so the lips' corner, the
 * rictal fold and the jaw's side move together instead of crumpling where the lower lip stays and the cheek goes out.
 * @param pos     bind positions (HL)
 * @param index   triangles
 * @param head    the bind head's field (headSDF, with .parts and .cup)
 * @param smooth  the bind head without what rides on its skin (headSDF(smoothSculpt(K)))
 * @param target  the inflated head's field (head-inflated.mjs inflatedSDF)
 * @param o       { centreY: the sections' centre height (0.22), reach: the longest move (0.45 HL), K: the sculpt (its
 *                gape), tissue: INFLATE_TISSUE overrides }
 * @returns { d: Float32Array (HL, the displacement at full weight, the mask applied), mask: Float32Array (the share
 *   of the inflation: for the normals), premultiplied: true, projected: Uint8Array (the exactly projected skin) }
 */
export function inflateTargets(pos, index, head, smooth, target, o = {}) {
  const yc = o.centreY ?? 0.22, reach = o.reach ?? 0.45;
  const TI = { ...INFLATE_TISSUE, ...(o.tissue ?? {}) };
  // the lower lip and chin (below the gape, told by the slit's own carve when the sculpt is given)
  const lowerOf = o.K ? gapeSide(o.K, 0.36) : (x, y, p) => x < 0.36 && p.j < p.f - 0.002;
  const n = pos.length / 3, nb = adjacency(index, n), cup = head.cup.field;
  const mask = new Float32Array(n), padU = new Float32Array(n);
  const balloon = target.balloon, EG = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], za = Math.abs(z);
    const p = head.parts(x, y, z);
    padU[v] = p.u;
    // the lower lip and the chin stay, the throat behind them balloons; the pads ride on the skin under them (their
    // fronts stay with the snout, their hind ends go out with the cheeks)
    const lower = lowerOf(x, y, p);
    // (behind the rictus the jaw's corner flesh eases into the cheek's rule over TI.lowerBack, so the mask does not
    // step where the lower jaw's tissue ends: that step crumpled the jaw's corner into a fold)
    const up = sm(0.17, 0.27, x), lb = TI.lowerBack ? sm(TI.lowerBack[0], TI.lowerBack[1], x) : 0;
    // (and the throat's skin under the chin takes the lower jaw's ramp along s, easing into the cheek's rule above
    // lowerY: the two rules met in a jagged step along the chin's edge, which the inflation drew out into striations)
    const ramp = sm(0.14, 0.34, x), yr = sm(TI.lowerY[0], TI.lowerY[1], y);
    const face = lower ? ramp * (1 - yr) * (1 - lb) + up * lb
      : TI.underRamp && y < TI.lowerY[1] ? (ramp * (1 - yr) + up * yr) * (1 - lb) + up * lb : up;
    mask[v] = sm(0.004, 0.05, cup(x, y, za)) * face * (1 - sm(1.08, 1.20, x));
  }
  // Jacobi smoothing over the mesh's edges (k passes); with `keep`, those vertices hold their values (a harmonic fill)
  // (lin: linear precision. The plain mean of a vertex and its ring sits off the vertex wherever the mesh is uneven,
  // so smoothing a field that changes fast across the skin (the throat's drop under the chin) shifts it by the
  // gradient times that offset, vertex by vertex: striations. The shift is put back from the field's own gradient,
  // fitted over the ring of a lightly pre-smoothed copy.)
  const lap = (A, k, keep, lin = false) => {
    const m = A.length / n, free = [];
    for (let v = 0; v < n; v++) if (!keep || !keep[v]) free.push(v);
    let corr = null;
    if (lin && m === 3) corr = linCorr(lap(A, 3, keep), free);
    let cur = Float32Array.from(A), nxt = Float32Array.from(A);
    for (let it = 0; it < k; it++) {
      for (const v of free) {
        const nv = nb[v];
        for (let c = 0; c < m; c++) { let a = cur[v * m + c]; for (const u of nv) a += cur[u * m + c]; nxt[v * m + c] = a / (nv.length + 1) + (corr ? corr[v * m + c] : 0); }
      }
      [cur, nxt] = [nxt, cur];
    }
    return cur;
  };
  // the linear-precision correction of a ring mean for the vertices `free`, from the field S's ring gradient
  function linCorr(S, free) {
    const corr = new Float32Array(n * 3);
    {
      for (const v of free) {
        const nv = nb[v], px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
        const C = [0, 0, 0, 0, 0, 0, 0, 0, 0], Y = [0, 0, 0, 0, 0, 0, 0, 0, 0], o = [0, 0, 0];
        for (const u of nv) {
          const q = [pos[u * 3] - px, pos[u * 3 + 1] - py, pos[u * 3 + 2] - pz];
          for (let a = 0; a < 3; a++) { o[a] += q[a]; for (let b = 0; b < 3; b++) { C[a * 3 + b] += q[a] * q[b]; Y[a * 3 + b] += (S[u * 3 + a] - S[v * 3 + a]) * q[b]; } }
        }
        const tr = (C[0] + C[4] + C[8]) * 0.05 + 1e-12; C[0] += tr; C[4] += tr; C[8] += tr;
        const Ci = inv3(C);
        // the plain mean's offset from the vertex: (sum of ring offsets) / (ring + 1)
        for (let a = 0; a < 3; a++) o[a] /= nv.length + 1;
        for (let a = 0; a < 3; a++) {
          let g0 = 0, g1 = 0, g2 = 0;
          for (let b = 0; b < 3; b++) { g0 += Y[a * 3 + b] * Ci[b * 3]; g1 += Y[a * 3 + b] * Ci[b * 3 + 1]; g2 += Y[a * 3 + b] * Ci[b * 3 + 2]; }
          corr[v * 3 + a] = -(g0 * o[0] + g1 * o[1] + g2 * o[2]);
        }
      }
    }
    return corr;
  }
  const M = lap(mask, 6);
  const d = new Float32Array(n * 3), fixed = new Uint8Array(n), proj = new Uint8Array(n);
  let nFix = 0, nFeat = 0, nFlat = 0;
  for (let v = 0; v < n; v++) {
    if (M[v] < 1e-3) { fixed[v] = 1; continue; }
    const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
    let x = px, y = py, z = pz;
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
    // a pad's vertex: the pad stays on its jaw bones (they do not move with the inflation), following the skin under
    // it by only `follow`, so the swelling cheek closes round its hind end; its stand-off over that skin (p − foot)
    // shrinks a little as the fold is stretched
    // (the skin round the pad, out to `iso[1]` from it, eases from the pad's share to the cheek's: the ball closes round
    // the pad's hind end in a soft crease, not a torn wall)
    const wp = 1 - sm(TI.pad.iso[0], TI.pad.iso[1], padU[v]);
    if (wp > 0) {
      // where the swollen cheek's balloon takes in the pad (its hind half, inside the balloon's front by `engulf`), the
      // pad and the skin round it go out onto the balloon with the cheek, the pad's stand-off laid down: only the lip
      // band in front of the ball shows, its corners in a fold of the ball (u5)
      const eg = TI.pad.engulf && balloon ? sm(TI.pad.engulf[0], TI.pad.engulf[1], -balloon(px, py, pz)) : 0;
      EG[v] = eg * (TI.pad.layFade ? sm(0, TI.pad.layFade, wp) : 1);
      const k = 1 - wp * (1 - TI.pad.follow) * (1 - eg);
      d[v * 3 + 1] *= k; d[v * 3 + 2] *= k;
      if (!proj[v] && (padU[v] < TI.pad.iso[0] * 3 || eg > 0)) {
        const ox = px - x, oy = py - y, oz = pz - z, h = Math.hypot(ox, oy, oz);
        const f = (padU[v] < TI.pad.iso[0] * 3 ? TI.pad.flatten * sm(0, Math.max(h, 0.01), t0) : 0) * (1 - eg) + eg;
        if (f > 0) { d[v * 3] -= f * ox; d[v * 3 + 1] -= f * oy; d[v * 3 + 2] -= f * oz; }
      }
      nFlat++;
    }
    fixed[v] = 1; nFix++;
  }
  // the features take the displacement of the skin round them
  const D = lap(d, 400, fixed);
  // the projected skin is exact (on the balloon) where the mask is whole: smoothing it would pull it off the balloon
  // wherever the bind mesh's vertices sit unevenly. Where the mask fades (round the lips, the chin, the eyes' collars)
  // the rays meet the head's own folds at uneven depths, and the skin there is a blend anyway: it is smoothed.
  const hold = new Uint8Array(n);
  for (let v = 0; v < n; v++) hold[v] = M[v] > 0.98 || M[v] < 1e-3 ? 1 : 0;
  const Ds = lap(D, 20, hold, !!TI.linSmooth);
  // the displacement at full weight (the mask applied), relaxed round the mouth's corner: within the zone each pass
  // moves a vertex toward its neighbours' mean by the zone's weight there, the rest of the skin holding
  const E = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) for (let k = 0; k < 3; k++) E[v * 3 + k] = M[v] * Ds[v * 3 + k];
  const RZ = TI.relax, zw = new Float32Array(n), zone = [];
  if (RZ) {
    for (let v = 0; v < n; v++) {
      const r = Math.hypot((pos[v * 3] - RZ.c[0]) / RZ.r[0], (pos[v * 3 + 1] - RZ.c[1]) / RZ.r[1], (Math.abs(pos[v * 3 + 2]) - RZ.c[2]) / RZ.r[2]);
      zw[v] = 1 - sm(0.6, 1, r);
      if (zw[v] > 0) zone.push(v);
    }
    let cur = Float32Array.from(E), nxt = Float32Array.from(E);
    const rc = TI.linSmooth ? linCorr(lap(E, 3, null), zone) : null;
    for (let it = 0; it < RZ.iters; it++) {
      for (const v of zone) {
        const nv = nb[v], w = zw[v];
        for (let c = 0; c < 3; c++) { let a = cur[v * 3 + c]; for (const u of nv) a += cur[u * 3 + c]; nxt[v * 3 + c] = cur[v * 3 + c] * (1 - w) + (a / (nv.length + 1) + (rc ? rc[v * 3 + c] : 0)) * w; }
      }
      [cur, nxt] = [nxt, cur];
    }
    E.set(cur);
  }
  // the pad taken in by the balloon is laid onto the inflated head: the patch relaxed over the surface (each pass a
  // vertex moves to its neighbours' mean, then onto the surface, by its share), so its rim, groove and overhanging hind
  // face spread out over the ball instead of folding where they are pressed onto it
  let nLay = 0, layW = null;
  if (TI.pad.engulf && balloon && TI.pad.lay) {
    const R = [], wR = new Float32Array(n);
    for (let v = 0; v < n; v++) { wR[v] = Math.min(1, EG[v] * M[v]); if (wR[v] > 0.01) R.push(v); }
    const Q = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) Q[i] = pos[i] + E[i];
    const Q0 = Float32Array.from(Q), e = 1e-4, q = [0, 0, 0];
    const onto = () => {
      for (let k = 0; k < 3; k++) {
        const g0 = target(q[0], q[1], q[2]); if (Math.abs(g0) < 1e-5) break;
        const gx = (target(q[0] + e, q[1], q[2]) - target(q[0] - e, q[1], q[2])) / (2 * e), gy = (target(q[0], q[1] + e, q[2]) - target(q[0], q[1] - e, q[2])) / (2 * e), gz = (target(q[0], q[1], q[2] + e) - target(q[0], q[1], q[2] - e)) / (2 * e);
        const gg = gx * gx + gy * gy + gz * gz || 1;
        q[0] -= (g0 * gx) / gg; q[1] -= (g0 * gy) / gg; q[2] -= (g0 * gz) / gg;
      }
    };
    for (let it = 0; it < TI.pad.lay; it++) {
      for (const v of R) {
        const nv = nb[v]; q[0] = q[1] = q[2] = 0;
        for (const u of nv) { q[0] += Q[u * 3]; q[1] += Q[u * 3 + 1]; q[2] += Q[u * 3 + 2]; }
        q[0] /= nv.length; q[1] /= nv.length; q[2] /= nv.length;
        onto();
        const w = wR[v];
        for (let k = 0; k < 3; k++) Q[v * 3 + k] = Q0[v * 3 + k] * (1 - w) + q[k] * w;
      }
    }
    for (const v of R) { for (let k = 0; k < 3; k++) E[v * 3 + k] = Q[v * 3 + k] - pos[v * 3 + k]; if (wR[v] > 0.5) proj[v] = 1; }
    nLay = R.length; layW = wR;
  }
  // the share for the normals: the mask, raised where the relaxation moved skin the mask had kept
  const Mo = Float32Array.from(M);
  for (const v of zone) Mo[v] = Math.max(M[v], zw[v] * sm(0, 0.004, Math.hypot(E[v * 3], E[v * 3 + 1], E[v * 3 + 2])));
  return { d: E, mask: Mo, premultiplied: true, projected: proj, stats: { projected: nFix, filled: nFeat, flattened: nFlat, relaxed: zone.length, laid: nLay }, ...(o.debug ? { dbg: { M, D, Ds, fixed, proj, zw, EG, layW } } : {}) };
}

/**
 * The inflate blend shape's displacement in the bind frame (applied before the skinning, as a glTF morph target), for
 * the pose it is solved for (HEAD_POSES.inflated): posed, the skin lands on the bind head moved by the inflation,
 * whatever the pose's joints would do to it (the skin is the balloon's; the bones swing inside it). At a partial weight
 * with the joints part-way the in-between shape (inflateMidMorph) puts it on the halfway shape.
 */
export function inflateMorph(pos, skin, W, inf) {
  const n = pos.length / 3, out = new Float32Array(n * 3);
  const T = JOINT_NAMES.map((nm) => W[nm] ?? { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
  for (let v = 0; v < n; v++) {
    // (inflateTargets gives the displacement with the mask applied; an unmasked one is scaled here)
    const m = inf.premultiplied ? 1 : inf.mask[v];
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

/**
 * The inflation's in-between shape (a corrective blend shape, glTF morph target 2): at the partial pose (HEAD_POSES
 * .inflatedHalf: the joints part-way, the inflate morph at weight h) the skinning turns the full morph's displacement
 * by the joints' partial turn, so the skin misses the halfway shape (bind + h · the inflation) by up to a few
 * hundredths of an HL and crumples where its weights blend joints that turn by different amounts (the jaw's corner, the
 * gill cover's front). This shape, at weight 1 at the partial pose, puts it exactly on the halfway shape; driven by
 * 4w(1 − w) from the inflate weight w, it is 0 at rest and when fully inflated.
 * @param full the inflate morph (inflateMorph)
 */
export function inflateMidMorph(pos, skin, Wh, inf, full, h = 0.5) {
  const n = pos.length / 3, out = new Float32Array(n * 3);
  const T = JOINT_NAMES.map((nm) => Wh[nm] ?? { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
  for (let v = 0; v < n; v++) {
    const m = inf.premultiplied ? 1 : inf.mask[v];
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const w = skin.weights[v * 4 + i];
      if (!w) continue;
      const { R, t } = T[skin.joints[v * 4 + i]];
      for (let k = 0; k < 9; k++) A[k] += w * R[k];
      for (let k = 0; k < 3; k++) b[k] += w * t[k];
    }
    // A (p + h Δ + Δc) + b = p + h e  →  Δc = A⁻¹ (p + h e − b) − p − h Δ
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const x = solve3(A, [0, 1, 2].map((k) => p[k] + h * m * inf.d[v * 3 + k] - b[k]));
    for (let k = 0; k < 3; k++) out[v * 3 + k] = x[k] - p[k] - h * full[v * 3 + k];
  }
  return out;
}
const inv3 = (A) => {
  const [a, b, c, d, e, f, g, h, i] = A;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g) || 1e-30;
  return [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d].map((x) => x / det);
};
const solve3 = (A, q) => {
  const [a, b, c, d, e, f, g, h, i] = A;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const inv = [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d].map((x) => x / det);
  return [inv[0] * q[0] + inv[1] * q[1] + inv[2] * q[2], inv[3] * q[0] + inv[4] * q[1] + inv[5] * q[2], inv[6] * q[0] + inv[7] * q[1] + inv[8] * q[2]];
};
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
