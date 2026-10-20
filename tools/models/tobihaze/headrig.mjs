// The トビハゼ head's skinning from its skeleton (skull.mjs): every skin vertex follows the bones it lies on, so the
// mouth, the gill covers and the throat open as the real mechanism does when the joints are posed.
//
// Weights: for each joint, the distance from the vertex to that joint's bones (in the bind pose); the nearest bones
// win, with a soft falloff (sigma) so the skin stretches between two bone groups instead of tearing. The tissue a
// vertex belongs to limits which joints may move it (head.mjs parts):
//   - the lower jaw's tissue (below the gape slit, in front of the rictus, told by the slit's own carve) moves only
//     with the lower jaw, the hyoid and the suspensoria; everything above the slit never with the lower jaw; in front of
//     the intramandibular joint it is the dentary's (the articular's Meckel's cartilage runs on inside it)
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
// inflateTargets / inflateMorph), the gape's correctives (gapeTargets: the lower lip everted, the upper lip's stretch
// spread, the gum and the mouth's floor drawn back from the teeth) and the vent's (ventTargets: the gill slit's ends
// rounded). Each carries normal deltas (morphNormals, bindNormalDeltas), so the game's morph targets shade the moved skin
// as the shape it is. The mesh's triangles are wound consistently first (fixWinding).
import { HEAD } from './anatomy.mjs';
import { HEAD_JOINTS, skullBones } from './skull.mjs';
import { worldTransforms, axisAngle, boundedUnion, v3 } from './skel.mjs';
import { neckLobe } from './head.mjs';

export const JOINT_NAMES = HEAD_JOINTS.map((j) => j.name);
/** Joints whose bones count toward another joint's skin weights (headWeights): the hyoid's splay and fan joints, the
 * opercular series' roll and the lower jaw's splayed halves, all bone-only (the inflation's blend shape carries the skin). */
const HYOID_SKIN = { J_chL: 'J_hyoid', J_chR: 'J_hyoid', J_bstegL: 'J_hyoid', J_bstegR: 'J_hyoid', J_jawL: 'J_jaw', J_jawR: 'J_jaw', J_imjL: 'J_imj', J_imjR: 'J_imj', J_opercRollL: 'J_opercL', J_opercRollR: 'J_opercR' };

// the opercle's skin margin and the gill slit of the sculpt (head.mjs HEAD_SCULPT.opercle, .gillSlit; the slit's reach
// as round 5's), used when
// the caller does not pass the sculpt (o.K); the slit is a thin pocket under the cover's free edge, `reach` in front
// of the margin, and `depth` (negative: over the mass's skin, between the pocket's floor and roof) the split between
// the body wall under it (the trunk's) and the flap over it (the opercle's)
const OPERCLE_PATH = [[0.996, 0.50, 0.25], [1.014, 0.44, 0.29], [1.032, 0.36, 0.325], [1.032, 0.26, 0.34], [1.007, 0.15, 0.33], [0.962, 0.06, 0.29], [0.912, 0.02, 0.24]];
const GILL_SLIT = { y0: 0.175, y1: 0.375, depth: -0.002, reach: 0.025 };

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
    const fs = skullBones(o.teeth ? { teeth: o.teeth } : {}).filter((b) => (HYOID_SKIN[b.joint] ?? b.joint) === name).map((b) => b.skinField ?? b.field);
    return fs.length ? boundedUnion(fs, box) : null;
  });
  const idx = Object.fromEntries(JOINT_NAMES.map((nm, i) => [nm, i]));
  const lowerOnly = new Set(['J_jaw', 'J_imj', 'J_hyoid', 'J_suspL', 'J_suspR'].map((k) => idx[k]));
  const jawJ = new Set(['J_jaw', 'J_imj'].map((k) => idx[k]));
  const lipJ = new Set(['J_premax', 'J_maxL', 'J_maxR'].map((k) => idx[k]));
  const suspJ = new Set(['J_suspL', 'J_suspR'].map((k) => idx[k]));
  const headOnly = new Set([idx.J_head]);
  const imjS = (HEAD_JOINTS.find((j) => j.name === 'J_imj')?.pivot[0] ?? 0.32) - (o.imjBack ?? 0.07);
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
    // (0.04: with head.mjs's thinner, shorter pocket (round 5) 0.02 opened the flap's lip only 0.006 HL off the wall at
    // vent and left a lump at the slit's lower end at gulp (16 levels over the 9-px median); 0.04 opens it 0.008 with
    // the lower end clean (13); 0.08–0.15 open it 0.011–0.012 but stretch 2–4× more triangles at the pocket's hinge)
    const flapPen = !trunk && inSlit && behind < 0.012 ? (o.flapPen ?? 0.04) * smooth(-GS.reach, -0.01, behind) : 0;
    for (let k = 0; k < J; k++) {
      if (!groups[k]) continue;
      if (trunk && !headOnly.has(k)) continue;
      // the roof, and in front of the rictus everything above the gape (the pads, the pocket of the mouth cavity
      // carved over the slit), stays off the hyoid: only the floor below the gape and the throat drop with it
      if (k === idx.J_hyoid && (roof || (!lower && x < rictus))) continue;
      if (lower && !lowerOnly.has(k)) continue;
      // above the slit, and on the cheek behind the rictus, the lower jaw moves only the skin under its hinge
      // (round n17, `web`: the cheek's skin beside the lower jaw under the pads' rear ends, below the slit (y under
      // web.y [full, none]) from web.s [none, full] back to the rictus, takes the jaw's share at a cost (`pen`, more
      // higher up), so the rictal web's stretch at the full gape is spread over the cheek instead of a few rows at the
      // jaw's side: the venetian-blind curtain)
      const WB = o.web, inWeb = WB && !lower && !roof && jawJ.has(k) && x < rictus && y < WB.y[1] && x > WB.s[0];
      if (!lower && jawJ.has(k) && (x < rictus || y > 0.11 || x > 0.46) && !inWeb) continue;
      if (lipJ.has(k) && !onPad) continue;
      d[k] = Math.max(0, groups[k](x, y, z));
      if (inWeb) d[k] += WB.pen + (1 - smooth(WB.s[0], WB.s[1], x) * (1 - smooth(WB.y[0], WB.y[1], y))) * 0.2;
      if (lipJ.has(k)) d[k] += padPen;
      // the palatines reach forward under the snout, but the snout's skin sheath is fixed to the skull: the
      // suspensoria move only the cheeks (behind the pads' front ends)
      if (suspJ.has(k)) d[k] += Math.max(0, 0.26 - x) * 2;
      // (round n17) in front of the intramandibular joint the lower jaw's flesh (the lip, the gum round the teeth, the
      // chin) is the dentary's: Meckel's cartilage, the articular's, runs forward inside the dentary under the tooth row
      // and took half the gum's weight, so the dentary's further 15° at the full gape sank the teeth into the gum (outside
      // the skin 276/726 at the half gape, 89 at the full)
      if (k === idx.J_jaw) d[k] += Math.max(0, imjS - x) * (o.imjPen ?? 1.5);
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
  // (morph: the gape's correctives, gapeTargets: `gape` driven by J_jaw / 70°, `gum` by J_jaw / 40° (round n17: the teeth
  // bared as the jaw drops, more at the full gape than at the half); the premaxillae tilted 8° (12° swung the pads' rear
  // ends 0.09 HL and stretched the rictal web, corner stretch>3 369 → 224))
  gapeFull: { J_jaw: { angle: 70 }, J_imj: { angle: 15 }, J_premax: { angle: 8, slide: 0.07 }, J_maxL: { angle: 25 }, J_maxR: { angle: 25 }, J_hyoid: { angle: 14 }, J_suspL: { angle: 6 }, J_suspR: { angle: 6 }, J_opercL: { angle: 8 }, J_opercR: { angle: 8 }, morph: { gape: 1, gum: 1 } },
  gapeHalf: { J_jaw: { angle: 32 }, J_premax: { angle: 4, slide: 0.035 }, J_maxL: { angle: 12 }, J_maxR: { angle: 12 }, J_hyoid: { angle: 6 }, morph: { gape: 32 / 70, gum: 32 / 40 } },
  // buccal pumping: the hyoid down, the cheeks out, the mouth shut
  gulp: { J_hyoid: { angle: 4 }, J_suspL: { angle: 6 }, J_suspR: { angle: 6 }, J_opercL: { angle: 4 }, J_opercR: { angle: 4 }, morph: { throat: 1, vent: 4 / 18 } },
  // the cheeks blown up (u5; a mouthful of water or air held on land, and the males' display): the suspensoria and
  // the gill covers abducted, the hyoid down and the throat's pouch full, the mouth and the slits shut (the cheeks'
  // own swelling is the soft tissue's blend shape)
  // (the skeleton's share alone: the full u5 state, with the skin's balloon, is `inflated` below)
  inflate: { J_hyoid: { angle: 5 }, J_suspL: { angle: 12 }, J_suspR: { angle: 12 }, J_opercL: { angle: 6 }, J_opercR: { angle: 6 }, morph: { throat: 1 } },
  // the cheeks and gill covers inflated with a mouthful of water or air (u5; research/anat_soft.md §3.4): the
  // suspensoria and the gill covers swing out, the hyoid drops its full 18°, the mouth and the gill slits stay shut;
  // the skin is carried onto the balloon by the `inflate` blend shape (head-inflated.mjs, inflateTargets). The bones
  // fill the balloon as far as the joints allow: the suspensoria abduct 10° (further, the quadrates would leave the
  // lower jaw: at 21° the condyle stood 0.066 HL off any rigid splay of the ramus and the joint opened 0.09) and the
  // lower jaw's halves splay 4.9° at the symphysis (J_jawL/R with J_imjL/R), so the articulars stay on the quadrates
  // (0.009 HL apart); the gill covers swing a further 26° about their front edge, tilted down 22° (`lift`), and roll 24°
  // out about the fore-aft line through their facet (J_opercRollL/R), so their front edges follow the cheek (0.04–0.08
  // HL under the skin at s 0.70) and their hind margins swing out under the widest part while their upper edges stay
  // under u5's narrowing shoulders. The hyoid bars splay 5° on their hypohyals (J_chL/R), so the interhyals stay with
  // the abducted suspensoria (0.020 HL apart), and the branchiostegal rays fan 14° down and out (J_bstegL/R) under the
  // ballooned floor of the gill chambers. The eyes look up and back (`gaze`, the globes only, build-pose.mjs: pitch 10°,
  // yaw −8°), as in u5, where each window shows as a tall crescent narrowing at its top (rt3 at the u5 camera: its
  // top/bottom width 0.70 → 0.59, reach 0.84 → 0.89; the rest gaze keeps the lateral photos' flat-topped window).
  // inflatedHalf: the game's drive at weight 0.5: the suspensoria, the jaw's splay, the hyoid and its splay at w of the
  // full, the gill covers (angle, lift and roll) and the rays at w² (they open last, Michel 2014), the inflate morph at
  // 0.5 with its in-between shape (inflateMidMorph) at 1, so the skin is exactly half-way and every bone under it
  inflated: { J_suspL: { angle: 10 }, J_suspR: { angle: 10 }, J_jawL: { angle: 4.9 }, J_jawR: { angle: 4.9 }, J_imjL: { angle: 4.9 }, J_imjR: { angle: 4.9 }, J_opercL: { angle: 26, lift: -22 }, J_opercR: { angle: 26, lift: -22 }, J_opercRollL: { angle: 24 }, J_opercRollR: { angle: 24 }, J_hyoid: { angle: 18 }, J_chL: { angle: 5 }, J_chR: { angle: 5 }, J_bstegL: { angle: 14 }, J_bstegR: { angle: 14 }, morph: { inflate: 1 }, gaze: { pitch: 10, yaw: -8 } },
  inflatedHalf: { J_suspL: { angle: 5 }, J_suspR: { angle: 5 }, J_jawL: { angle: 2.45 }, J_jawR: { angle: 2.45 }, J_imjL: { angle: 2.45 }, J_imjR: { angle: 2.45 }, J_opercL: { angle: 6.5, lift: -5.5 }, J_opercR: { angle: 6.5, lift: -5.5 }, J_opercRollL: { angle: 6 }, J_opercRollR: { angle: 6 }, J_hyoid: { angle: 9 }, J_chL: { angle: 2.5 }, J_chR: { angle: 2.5 }, J_bstegL: { angle: 3.5 }, J_bstegR: { angle: 3.5 }, morph: { inflate: 0.5, inflateMid: 1 } },
  // venting through the gill slits: the gill covers swing out
  // (morph: the vent's corrective, ventTargets, driven by J_opercL/R / 18°)
  vent: { J_opercL: { angle: 18 }, J_opercR: { angle: 18 }, J_suspL: { angle: 4 }, J_suspR: { angle: 4 }, morph: { vent: 1 } },
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
 *     them, the web between them lowered by `mu` of the drop over `muS`) smoothly united (`k`, round the domes' foot
 *     only) with the lowered domes (`convex`: one convex surface `off` proud of both globes, united across the midline
 *     over `kMid`; without it, the globes and their medial lobes), so each dome sinks into the head with fillets and no
 *     clefts in front of it, behind it or between the two; then relaxed over that surface (`iters` passes of `lambda`,
 *     laid again each pass), so the swing's folds and the pleats even out; at the dome's front end (`endsFree`) nothing
 *     is tucked and the head's band just under the eye's skin is laid too, so the front is skin, not a pit
 *   - the seam zipped (`zipSeam`): the lid's rim and the medial skin's edge, where they face each other across the tucked
 *     lining, drawn to their midpoints, smoothed along the seam and relaxed round it, so the closed dome carries one fine
 *     seam
 *   - what lay inside the rest globe, and the faces that looked into the socket, stay inside the lowered globe
 * Displacements are in the bind frame, applied before the skinning; the globe itself is moved by J_eyeL/R (BLINK_DROP),
 * and so is the eye joints' share of each vertex (o.weights, headWeights), which is taken out of the displacement. The
 * both-eyes shape is split between the two blend shapes across the midline as the eye joints' weights are, so blinkL +
 * blinkR is the both-closed shape and either alone leaves no step there.
 * @param o { weights, index (the mesh's triangles: the relaxation needs them; wound consistently, fixWinding), drop,
 *            close: { the closed shape's tunables, BLINK_CLOSE }, and the lid's: base, cover, lamMin, azimuths, lipAz,
 *            reach, thick, rimThick, tuck, hugT, thin }
 * @returns { L, R: Float32Array displacements (HL); normal, normalShare: the closed surface's normals where the skin was
 *   laid on it (bind frame) and their share, for the blend shapes' normal deltas }
 */
// (round n17: one convex closed surface over both lowered globes (`convex`: the globes `off` proud, smoothly united over
// `kMid` across the midline) in place of the sculpt's medial lobes laid on them (the lobes' junction at lobeK 0.003 tore
// open as a crack with shards on each dome's medial face); the dome's front end skin, not a pit (`endsFree` [front,
// back, band]: in front of 0.85 of the radius nothing is tucked and the head's band within 0.02 under the eye's skin is
// laid too; `hinge.ends` [0.96, 0.995], so the lid reaches further round the front); the seam zipped (`zipSeam`); the web
// between the domes lowered by 0.6 of the drop over a softer ramp (`mu`, `muS` [s from, to, back from, to]), so no strap
// stands between them. With the mesh's winding repaired (fixWinding) the closed lid's back-facing px fell from
// 134/58/93/59 to 4/1/0/2 (efront/eq34/eside/etop, CPU raster of the posed build's mesh), the cornea stays hidden and the
// dip between the domes is 0.027 HL)
export const BLINK_CLOSE = { k: 0.03, th: [0.008, 0.0005], el: [30, 2], tuckR: [0.022, 0.03], edgeK: 0.03, split: [0.12, 0.15], mu: 0.6, muS: [0.15, 0.30, 0.36, 0.46], iters: 90, lambda: 0.5, proj: 6, region: [0.07, 0.13], fall: [0, 0.07], rhoSmooth: 20, lobeK: 0.003, hinge: { ends: [0.96, 0.995], margin: 0.035, depth: 0.7, offRim: [0.026, 0.04] },
  convex: { off: 0.006, kMid: 0.02 }, endsFree: [0.85, 9, 0.02], zipSeam: { gap: 0.06, near: 0.035, w: 1, smooth: 30, hops: 8, along: 30 } };
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
  const muS = CO.muS ?? [0.17, 0.25, 0.36, 0.46], muZ = CO.muZ ?? [0, 0.10], muAt = (x, z) => CO.mu * (1 - smooth(muZ[0], muZ[1], Math.abs(z))) * smooth(muS[0], muS[1], x) * (1 - smooth(muS[2], muS[3], x));
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
  const CV = CO.convex;
  const dome = (x, y, z) => {
    if (CV) {
      const ex = x - E.s, ey = y - cyL, Rc = re + CV.off;
      return smin1(Math.hypot(ex, ey, z - E.z) - Rc, Math.hypot(ex, ey, z + E.z) - Rc, CV.kMid);
    }
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
    // (at the dome's front end, `endsFree`, the head's band just under the eye's skin (within endsFree[2] of it) is laid
    // on the closed surface too, so the skin in front of the lowered globe closes over it instead of opening a pocket)
    const EF0 = CO.endsFree, endBand = EF0 && EF0[2] && dx < 0 && -dx > EF0[0] * re && r > re - EF0[2];
    if (r < re - 0.0003 && !endBand) { Q[v * 3 + 1] -= drop; cls[v] = HID; continue; }
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
    // (`endsFree` [front, back]: past these fractions of the radius in front of / behind the centre nothing is tucked: the
    // lining there is laid on the closed surface with the rest, so the dome's ends are skin, not a pit)
    const EF = CO.endsFree, endFree = EF ? (dx < 0 ? -dx > EF[0] * re : dx > EF[1] * re) : false;
    let tucked = tuckW > 0.5 && !endFree;
    Q[v * 3] = E.s + tx; Q[v * 3 + 1] = E.y + ty; Q[v * 3 + 2] = side * (E.z + tz);
    // the socket's lining off the lip (faces looking into the globe, just outside it) goes inside the lowered globe
    if (!tucked && !endFree && facing < -0.3 && r < re + gap + 0.004) {
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
    const Rd = re + (CV ? CV.off : thBl(qx, qy, qz));
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
  // ---- the seam zipped (round n17, `zipSeam`: { gap, near, w, smooth, hops }): the lid's rim (the free skin next to the
  // tucked lining) and the medial skin's edge (next to the hidden head) are drawn together where they face each other
  // within `gap` on the dome (within `near` of the lowered globe): each edge vertex moves `w` of the way to the midpoint
  // with its nearest partner across the seam and is laid again; then the skin within `hops` rings of the seam is relaxed
  // (`smooth` passes, the seam held), so the closed dome has one fine seam instead of a crack with torn edges
  const ZS = CO.zipSeam;
  const stats = { zipped: 0 };
  if (o.index && ZS) {
    const I = o.index, nbAll = new Map();
    const isF = new Uint8Array(n); for (const v of free) isF[v] = 1;
    for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) {
      if (!nbAll.has(a)) nbAll.set(a, new Set()); if (!nbAll.has(b)) nbAll.set(b, new Set()); nbAll.get(a).add(b); nbAll.get(b).add(a);
    }
    const off = (v) => { const sd = Q[v * 3 + 2] >= 0 ? 1 : -1; return Math.hypot(Q[v * 3] - E.s, Q[v * 3 + 1] - cyL, Q[v * 3 + 2] - sd * E.z) - re; };
    const Bh = [], Bm = [];
    for (const v of free) {
      if (!(wReg[v] > 0) || off(v) > ZS.near) continue;
      let t = false, h = false; for (const u of nbAll.get(v) ?? []) { if (cls[u] === TUCK) t = true; if (cls[u] === HID) h = true; }
      if (t) Bh.push(v); else if (h) Bm.push(v);
    }
    const target = new Map();
    const pair = (A, B) => {
      for (const v of A) {
        let best = ZS.gap, bu = -1;
        for (const u of B) { if (Q[u * 3 + 2] * Q[v * 3 + 2] < 0) continue; const d = Math.hypot(Q[u * 3] - Q[v * 3], Q[u * 3 + 1] - Q[v * 3 + 1], Q[u * 3 + 2] - Q[v * 3 + 2]); if (d < best) { best = d; bu = u; } }
        if (bu >= 0) target.set(v, [0, 1, 2].map((k) => (Q[v * 3 + k] + Q[bu * 3 + k]) / 2));
      }
    };
    pair(Bh, Bm); pair(Bm, Bh);
    for (const [v, tg] of target) { for (let k = 0; k < 3; k++) Q[v * 3 + k] += (tg[k] - Q[v * 3 + k]) * ZS.w; lay(v, 6); }
    stats.zipped = target.size;
    // (the zipped edges smoothed along themselves, `along` passes, so the seam runs as one fair line, not a sawtooth of
    // the two rows' alternating vertices)
    for (let it = 0; it < (ZS.along ?? 0); it++) {
      const upd = [];
      for (const v of target.keys()) {
        let x = 0, y = 0, z = 0, c = 0;
        for (const u of nbAll.get(v)) if (target.has(u)) { x += Q[u * 3]; y += Q[u * 3 + 1]; z += Q[u * 3 + 2]; c++; }
        if (c >= 2) upd.push([v, Q[v * 3] + 0.5 * (x / c - Q[v * 3]), Q[v * 3 + 1] + 0.5 * (y / c - Q[v * 3 + 1]), Q[v * 3 + 2] + 0.5 * (z / c - Q[v * 3 + 2])]);
      }
      for (const [v, x, y, z] of upd) { Q[v * 3] = x; Q[v * 3 + 1] = y; Q[v * 3 + 2] = z; lay(v, 4); }
    }
    // relax round the seam, the zipped edge held
    const hop = new Int16Array(n).fill(-1);
    let front = [...target.keys()]; for (const v of front) hop[v] = 0;
    for (let h = 1; h <= ZS.hops; h++) { const nf = []; for (const v of front) for (const u of nbAll.get(v) ?? []) if (isF[u] && hop[u] < 0) { hop[u] = h; nf.push(u); } front = nf; }
    const act = []; for (const v of free) if (hop[v] > 0) act.push(v);
    const nx = new Float64Array(act.length * 3);
    for (let it = 0; it < ZS.smooth; it++) {
      for (let i = 0; i < act.length; i++) {
        const v = act[i]; let x = 0, y = 0, z = 0, c = 0;
        for (const u of nbAll.get(v)) { if (!isF[u]) continue; x += Q[u * 3]; y += Q[u * 3 + 1]; z += Q[u * 3 + 2]; c++; }
        const lam = 0.5 * (1 - smooth(ZS.hops * 0.5, ZS.hops + 0.5, hop[v]));
        nx[i * 3] = Q[v * 3] + (c ? lam * (x / c - Q[v * 3]) : 0); nx[i * 3 + 1] = Q[v * 3 + 1] + (c ? lam * (y / c - Q[v * 3 + 1]) : 0); nx[i * 3 + 2] = Q[v * 3 + 2] + (c ? lam * (z / c - Q[v * 3 + 2]) : 0);
      }
      for (let i = 0; i < act.length; i++) { const v = act[i]; Q[v * 3] = nx[i * 3]; Q[v * 3 + 1] = nx[i * 3 + 1]; Q[v * 3 + 2] = nx[i * 3 + 2]; lay(v, 2); }
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
  return o.debug ? { L, R, normal: NT, normalShare: NW, cls, rho: rhoS, wReg, stats, T, Mw, dome } : { L, R, normal: NT, normalShare: NW, stats };
}

/**
 * The mesh's triangles wound consistently with their neighbours (round n17): where the sculpt's features are thinner than
 * two cells (the infraorbital crease, the socket's carve, the medial lobes' band under the eye's skin) the surface nets
 * leave a few triangles wound against every neighbour (29 in the posed build's 0.09 mm head, all round the eyes). At rest
 * they lie hidden in the crease or inside the globe, but the blink carries them out onto the closed dome, where they
 * render as black (back-facing) triangles. A triangle more of whose edges run the same way as a neighbour's than
 * against it is turned over (a few passes, until none is left). In place; returns the number turned.
 */
export function fixWinding(index, passes = 4) {
  let total = 0;
  for (let pass = 0; pass < passes; pass++) {
    const E = new Map();
    const key = (a, b) => a * 4294967296 + b;
    for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) { const a = index[t + k], b = index[t + (k + 1) % 3], q = key(a, b); E.set(q, (E.get(q) ?? 0) + 1); }
    let turned = 0;
    for (let t = 0; t < index.length; t += 3) {
      let same = 0, against = 0;
      for (let k = 0; k < 3; k++) { const a = index[t + k], b = index[t + (k + 1) % 3]; same += (E.get(key(a, b)) ?? 0) - 1; against += E.get(key(b, a)) ?? 0; }
      if (same > against) { const b = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = b; turned++; }
    }
    total += turned;
    if (!turned) break;
  }
  return total;
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
 *         `evert` from the jaw's U and raised `rim`, fading back toward the rictus, only labial of the dentary's tooth row
 *         (`labial`) and over a wide band (`lipBand`), so the hanging jaw's tip is a broad U framed by its lip (the
 *         strike's round aperture) instead of a pointed spade, and the teeth stay clear of it at every weight; (3) the
 *         mouth's floor beside the row drawn down from the teeth (`floor`), the deeper of it and the gum's trough; then the
 *         lower jaw's displacements relaxed (`lowRelax`), the tooth row held
 *   gum   (driven by J_jaw / 40°): the oral surface round each tooth's exit (skull.mjs fitTeeth) drawn back `depth` along
 *         the tooth's axis (no deeper than `frac` of the tooth's length below its tip), so the teeth, hidden under it when
 *         the mouth is shut, stand proud of the gum as it opens, never to their roots
 * @param o { teeth: fitTeeth(head), W: poseWorld(HEAD_POSES.gapeFull) and the overrides of GAPE_CORR }
 * @returns { gape: Float32Array, gum: Float32Array } (HL, bind frame)
 */
export const GAPE_CORR = {
  relax: [
    { box: [0.05, 0.36, 0.12, 0.30, 0.0, 1.0], soft: 0.02, lambda: 0.4 },
  ],
  iters: 40, evert: 0.04, rim: 0.002, lipBand: [0.006, 0.05], lipS: [0.10, 0.24], centre: [0.14, 0.3], labial: [0.002, 0.012],
  lowRelax: { iters: 20, box: [0.03, 0.30, 0.02, 0.12], lambda: 0.5, hold: 1 },
  gum: { depth: 0.018, frac: 0.75, r: [0.005, 0.014], below: 0.006, labial: [0.0, 0.004], keep: 1 },
  floor: { depth: 0.018, frac: 0.75, lingual: [-0.004, 0.002, 0.02, 0.04] },
};
export function gapeTargets(pos, nrm, index, head, K, skin, o = {}) {
  const G = { ...GAPE_CORR, ...o, gum: { ...GAPE_CORR.gum, ...(o.gum ?? {}) } };
  if (o.floor === false) G.floor = null;
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
        // (round n17: no deeper than `frac` of the tooth's length below its tip, so the crown stands clear and never its
        // root: the trough's 0.013, 0.0175 round the first canine, had bared the short front teeth to their roots)
        const dep = Math.min(GU.depth * (t.gum ?? 1), GU.frac !== undefined ? GU.frac * dl + (t.exit - dl) : Infinity);
        pts.push({ g: [t.root[0] + dir[0] * t.exit, t.root[1] + dir[1] * t.exit, (t.root[2] + dir[2] * t.exit) * sd], dir: [dir[0], dir[1], dir[2] * sd], f: dep / GU.depth });
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
  // (2) the lower lip everted (bind frame: the lip rides on the jaw, so the displacement turns with it). Round n17: only
  // the tissue labial of the dentary's tooth row everts (`labial` [from, to]: its outward distance from the row through
  // the teeth's exits, so the gum and the tongue's side stay put at every weight and the teeth stand clear of the lip at
  // the full gape as at the half), over a wide band round the lip's rim (`lipBand`), so the rim rolls out as one smooth
  // U instead of a narrow band folding radially; `flare` spreads the front of the U sideways (the hanging jaw's tip a broad
  // U, not a square or pointed spade); then the gape's displacements on the lower jaw are relaxed (`lowRelax`: passes of
  // a Jacobi smoothing over the lower jaw's tissue, never across the gape; the tooth row held), so no fold or crumple is
  // left where the everted rim meets the jaw's side
  const LP = K.jaw?.lip?.path;
  if (LP && G.evert > 0) {
    const seg = (q) => { let best = Infinity, bs = 0; for (let i = 0; i + 1 < LP.length; i++) { const a = LP[i], c = LP[i + 1], ab = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1; const tt = Math.min(1, Math.max(0, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1] + (q[2] - a[2]) * ab[2]) / L2)); const d = Math.hypot(q[0] - a[0] - ab[0] * tt, q[1] - a[1] - ab[1] * tt, q[2] - a[2] - ab[2] * tt); if (d < best) { best = d; bs = a[0] + ab[0] * tt; } } return [best, bs]; };
    // the dentary's row through the exits, (s, z) on the left side, with the first tooth's mirror across the midline
    const row = (TF?.dentary ?? []).filter((t) => t.exit !== null && t.exit !== undefined).map((t) => { const dl = Math.hypot(t.tip[0] - t.root[0], t.tip[1] - t.root[1], t.tip[2] - t.root[2]) || 1; return [t.root[0] + ((t.tip[0] - t.root[0]) / dl) * t.exit, t.root[2] + ((t.tip[2] - t.root[2]) / dl) * t.exit]; });
    if (row.length) row.unshift([row[0][0], -row[0][1]]);
    const labOf = (x, za) => {
      let best = Infinity, lab = 0;
      for (let i = 0; i + 1 < row.length; i++) {
        const a = row[i], c = row[i + 1], ab = [c[0] - a[0], c[1] - a[1]], L2 = ab[0] ** 2 + ab[1] ** 2 || 1;
        const tt = Math.min(1, Math.max(0, ((x - a[0]) * ab[0] + (za - a[1]) * ab[1]) / L2)), q = [x - a[0] - ab[0] * tt, za - a[1] - ab[1] * tt], d = Math.hypot(q[0], q[1]);
        // (the outward normal of the row, (dz, −ds) along it from the midline back, points away from the U's inside)
        if (d < best) { best = d; const nx = -ab[1], nz = ab[0], nl = Math.hypot(nx, nz) || 1; lab = (q[0] * nx + q[1] * nz) / nl; }
      }
      return lab;
    };
    const LB = G.labial ?? [0.002, 0.012];
    for (let v = 0; v < n; v++) {
      if (!lower[v]) continue;
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], za = Math.abs(z);
      const [d, sOn] = seg([x, y, za]);
      const wl = row.length > 1 ? smooth(LB[0], LB[1], labOf(x, za)) : 1 - (GU.keep ?? 0) * gumW[v];
      const w = (1 - smooth(G.lipBand[0], G.lipBand[1], d)) * (1 - smooth(G.lipS[0], G.lipS[1], sOn)) * wl;
      if (w <= 0) continue;
      // outward from the jaw's U (an ellipse's normal about `centre`: mostly lateral on the sides, forward at the front),
      // and sideways at the front (`flare`, fading back over flareS)
      let ox = (x - G.centre[0]) * G.centre[1], oz = za; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const fl = (G.flare ?? 0) * (1 - smooth(G.flareS?.[0] ?? 0.1, G.flareS?.[1] ?? 0.2, x)) * Math.min(1, za / 0.03);
      gape[v * 3] += G.evert * w * ox; gape[v * 3 + 1] += G.rim * w; gape[v * 3 + 2] += (G.evert * w * oz + fl * w) * Math.sign(z || 1);
    }
  }
  // (3) round n17: at the full gape the mouth's floor beside the dentary's row (its tongue side, which the hyoid and the
  // dentary's further bend stand up against the teeth) drawn down from them too (`floor`: { depth, lingual [from, to] of
  // its distance from the row, r: the trough's radius as the gum's }), so more of each tooth shows at the full gape than
  // at the half, never its root
  const FL = G.floor;
  if (FL && TF?.dentary) {
    // (each tooth's share no deeper than `frac` of its length below its tip, as the gum's; from `s` [from, to] back: the
    // front teeth, short and close to the midline's floor, stand clear at the gum's trough alone)
    const pts = TF.dentary.filter((t) => t.exit !== null && t.exit !== undefined).map((t) => { const dl = Math.hypot(t.tip[0] - t.root[0], t.tip[1] - t.root[1], t.tip[2] - t.root[2]) || 1, dir = [0, 1, 2].map((k) => (t.tip[k] - t.root[k]) / dl); return { g: [0, 1, 2].map((k) => t.root[k] + dir[k] * t.exit), dir, dep: Math.min(FL.depth, (FL.frac ?? 9) * dl + (t.exit - dl)) }; });
    for (let v = 0; v < n; v++) {
      if (!lower[v] || pts.length < 2) continue;
      const p = [pos[v * 3], pos[v * 3 + 1], Math.abs(pos[v * 3 + 2])];
      let best = 0, bd = null;
      for (let i = 0; i + 1 < pts.length; i++) {
        const A = pts[i], B = pts[i + 1], ab = [B.g[0] - A.g[0], B.g[1] - A.g[1], B.g[2] - A.g[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
        const u = Math.min(1, Math.max(0, ((p[0] - A.g[0]) * ab[0] + (p[1] - A.g[1]) * ab[1] + (p[2] - A.g[2]) * ab[2]) / L2));
        const c = [0, 1, 2].map((k) => A.g[k] + ab[k] * u), dir = [0, 1, 2].map((k) => A.dir[k] * (1 - u) + B.dir[k] * u);
        const q = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], along = q[0] * dir[0] + q[1] * dir[1] + q[2] * dir[2];
        if (along < -GU.below || along > 0.006) continue;
        // the tongue's side: inward of the row in (s, z) (the row's inward normal, (dz, −ds) along it from the midline back)
        const nx = ab[2], nz = -ab[0], nl = Math.hypot(nx, nz) || 1, lin = (q[0] * nx + q[2] * nz) / nl;
        const w = smooth(FL.lingual[0], FL.lingual[1], lin) * (1 - smooth(FL.lingual[2], FL.lingual[3], lin)) * (FL.s ? smooth(FL.s[0], FL.s[1], p[0]) : 1) * (A.dep * (1 - u) + B.dep * u) / FL.depth;
        if (w > best) { best = w; bd = dir; }
      }
      // (not added to the gum's own trough there: the deeper of the two, so no tooth is bared below `frac`)
      const dd = Math.max(0, FL.depth * best - Math.hypot(gum[v * 3], gum[v * 3 + 1], gum[v * 3 + 2]));
      if (dd > 0) { const sd = Math.sign(pos[v * 3 + 2] || 1); gape[v * 3] -= bd[0] * dd; gape[v * 3 + 1] -= bd[1] * dd; gape[v * 3 + 2] -= bd[2] * sd * dd; }
    }
  }
  if ((G.lowRelax?.iters ?? 0) > 0) {
    const LR = G.lowRelax, [s0, s1, y0, y1] = LR.box, act2 = [], wt = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      if (!lower[v]) continue;
      const x = pos[v * 3], y = pos[v * 3 + 1];
      const w = smooth(s0 - 0.02, s0, x) * (1 - smooth(s1, s1 + 0.02, x)) * smooth(y0 - 0.02, y0, y) * (1 - smooth(y1, y1 + 0.02, y)) * (1 - (LR.hold ?? 1) * gumW[v]);
      if (w > 0) { wt[v] = w * (LR.lambda ?? 0.5); act2.push(v); }
    }
    const nbL = new Map();
    for (let t = 0; t < index.length; t += 3) for (const [a, b] of [[index[t], index[t + 1]], [index[t + 1], index[t + 2]], [index[t + 2], index[t]]]) {
      if (!lower[a] || !lower[b]) continue;
      if (wt[a] > 0) { if (!nbL.has(a)) nbL.set(a, []); nbL.get(a).push(b); }
      if (wt[b] > 0) { if (!nbL.has(b)) nbL.set(b, []); nbL.get(b).push(a); }
    }
    const nx2 = new Float64Array(act2.length * 3);
    for (let it = 0; it < LR.iters; it++) {
      for (let i = 0; i < act2.length; i++) {
        const v = act2[i], N = nbL.get(v) ?? [];
        for (let c = 0; c < 3; c++) { let a = 0; for (const u of N) a += gape[u * 3 + c]; nx2[i * 3 + c] = N.length ? gape[v * 3 + c] + wt[v] * (a / N.length - gape[v * 3 + c]) : gape[v * 3 + c]; }
      }
      for (let i = 0; i < act2.length; i++) for (let c = 0; c < 3; c++) gape[act2[i] * 3 + c] = nx2[i * 3 + c];
    }
  }
  return { gape, gum };
}

/**
 * The vent's corrective (round n17; a blend shape in the bind frame, driven by the gill covers' angle: J_opercL/R / 18°, so
 * 1 at `vent` and 0.22 at `gulp`, outside the cheeks' inflation, whose own blend shape carries the covers): the skinned skin
 * of the vent pose with its displacements relaxed over the gill cover and the wall behind it (`box` [s0, s1, y0, y1, |z|0,
 * |z|1], `soft`; `iters` Jacobi passes of `lambda`; round the slit's ends `endLambda` within `endR`), never across the slit
 * at the slit (the opercle's share of the weights above 0.5 on one side, below on the other), so the cover swings out as one smooth
 * shell, without the washboard of the bone-distance weights' ripples, and the slit's lower end, where the flap's share fades
 * into the fused membrane, opens as a rounded pocket instead of a crumple.
 * @returns Float32Array (HL, bind frame)
 */
// (round n17: relaxing the whole cover's displacements (lambda 0.3–0.5) raised its stretch>3 from 30 to 41–443 and its
// roughness; only the slit's ends are relaxed, by place: the lump at the lower end shrinks to a rounded pocket, the
// cover's mean normal roughness 2.18° → 1.88° (rest 1.71°), the mid-slit gap 0.027 HL kept)
export const VENT_CORR = { box: [0.70, 1.12, 0.02, 0.50, 0.10, 1.0], soft: 0.03, lambda: 0, iters: 30, ends: [0.03, 0], endR: 0, endLambda: 0.7, endPos: 1 };
export function ventTargets(pos, nrm, index, skin, o = {}) {
  const V = { ...VENT_CORR, ...o }, n = pos.length / 3, W = o.W ?? poseWorld(HEAD_POSES.vent);
  const sOp = marginCurve(o.K?.opercle?.path ?? OPERCLE_PATH), GS = { ...GILL_SLIT, ...(o.K?.gillSlit ?? {}) };
  // (the slit kept open between its ends, `ends` in from them: there the two sides are relaxed together, `endLambda`
  // within `endR` of the lower end (and the upper, `endHi`), so the flap's end eases into the fused membrane as a rounded
  // pocket, not a lump)
  const [eLo, eHi] = V.ends ?? [0, 0];
  const inSlit = (v) => { const x = pos[v * 3], y = pos[v * 3 + 1], b = x - sOp(y); return y > GS.y0 + eLo && y < GS.y1 - eHi && b > -GS.reach - 0.02 && b < 0.02; };
  const endW = (x, y) => { if (!V.endR) return 0; let w = 0; for (const ye of V.endHi === false ? [GS.y0] : [GS.y0, GS.y1]) w = Math.max(w, 1 - smooth(V.endR * 0.5, V.endR, Math.hypot(x - sOp(ye), y - ye))); return w; };
  const posed = skinVertices(pos, nrm, skin, W).position, D = new Float64Array(n * 3);
  for (let i = 0; i < n * 3; i++) D[i] = posed[i] - pos[i];
  const iL = JOINT_NAMES.indexOf('J_opercL'), iR = JOINT_NAMES.indexOf('J_opercR'), side = new Uint8Array(n), lam = new Float32Array(n), posW = new Float32Array(n);
  const [s0, s1, y0, y1, z0, z1] = V.box, e = V.soft;
  for (let v = 0; v < n; v++) {
    let w = 0; for (let q = 0; q < 4; q++) { const j = skin.joints[v * 4 + q]; if (j === iL || j === iR) w += skin.weights[v * 4 + q]; }
    side[v] = w > 0.5 ? 1 : 0;
    const x = pos[v * 3], y = pos[v * 3 + 1], za = Math.abs(pos[v * 3 + 2]);
    lam[v] = V.lambda * smooth(s0 - e, s0, x) * (1 - smooth(s1, s1 + e, x)) * smooth(y0 - e, y0, y) * (1 - smooth(y1, y1 + e, y)) * smooth(z0 - e, z0, za) * (1 - smooth(z1, z1 + e, za));
    const ew = endW(x, y); if (ew > 0) { lam[v] = Math.max(lam[v], (V.endLambda ?? 0.6) * ew); posW[v] = (V.endPos ?? 0) * ew; }
  }
  const nb = new Map();
  for (let t = 0; t < index.length; t += 3) for (const [a, b] of [[index[t], index[t + 1]], [index[t + 1], index[t + 2]], [index[t + 2], index[t]]]) {
    if (side[a] !== side[b] && inSlit(a) && inSlit(b)) continue;
    if (lam[a] > 0) { if (!nb.has(a)) nb.set(a, []); nb.get(a).push(b); }
    if (lam[b] > 0) { if (!nb.has(b)) nb.set(b, []); nb.get(b).push(a); }
  }
  const act = [...nb.keys()], nx = new Float64Array(act.length * 3);
  for (let it = 0; it < V.iters; it++) {
    // (`endPos`: round the ends the places are relaxed, not only the displacements, so the pocket's sculpted end, swung
    // open, is smoothed into a round instead of standing as a lump)
    for (let i = 0; i < act.length; i++) { const v = act[i], N = nb.get(v); for (let c = 0; c < 3; c++) { let a = 0, ap = 0; for (const u of N) { a += D[u * 3 + c]; ap += pos[u * 3 + c]; } const tg = a / N.length + posW[v] * (ap / N.length - pos[v * 3 + c]); nx[i * 3 + c] = D[v * 3 + c] + lam[v] * (tg - D[v * 3 + c]); } }
    for (let i = 0; i < act.length; i++) for (let c = 0; c < 3; c++) D[act[i] * 3 + c] = nx[i * 3 + c];
  }
  // the bind-frame displacement that lands the skinned skin on pos + D (as the gape's)
  const T = JOINT_NAMES.map((nm) => W[nm] ?? { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }), out = new Float32Array(n * 3);
  for (const v of act) {
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0];
    for (let i = 0; i < 4; i++) { const w = skin.weights[v * 4 + i]; if (!w) continue; const { R, t } = T[skin.joints[v * 4 + i]]; for (let k = 0; k < 9; k++) A[k] += w * R[k]; for (let k = 0; k < 3; k++) b[k] += w * t[k]; }
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], x = solve3(A, [0, 1, 2].map((k) => p[k] + D[v * 3 + k] - b[k]));
    for (let k = 0; k < 3; k++) out[v * 3 + k] = x[k] - p[k];
  }
  return out;
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
  lowerY: [0.035, 0.075], lowerBack: [0.30, 0.40], underRamp: true, lowerYBack: { s: [0.22, 0.30], y: [0.075, 0.09] },
  pad: { iso: [0.002, 0.06], follow: 0.25, flatten: 0.4, engulf: [0, 0.08], lay: 30, layFade: 1, squash: 0.25 },
  relax: { c: [0.29, 0.075, 0.19], r: [0.09, 0.075, 0.11], iters: 80 },
  repair: { box: [0.18, 0.35, 0.01, 0.20], soft: 0.02, z: [0.06, 0.10], cos: -0.45, ring: 2, iters: 300 },
  splayBlend: 0.08,
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
  const mask = new Float32Array(n), padU = new Float32Array(n), lowF = new Float32Array(n);
  const balloon = target.balloon, EG = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], za = Math.abs(z);
    const p = head.parts(x, y, z);
    padU[v] = p.u;
    // the lower lip and the chin stay, the throat behind them balloons; the pads ride on the skin under them (their
    // fronts stay with the snout, their hind ends go out with the cheeks)
    const lower = lowerOf(x, y, p);
    lowF[v] = lower ? 1 : 0;
    // (behind the rictus the jaw's corner flesh eases into the cheek's rule over TI.lowerBack, so the mask does not
    // step where the lower jaw's tissue ends: that step crumpled the jaw's corner into a fold)
    const up = sm(0.17, 0.27, x), lb = TI.lowerBack ? sm(TI.lowerBack[0], TI.lowerBack[1], x) : 0;
    // (and the throat's skin under the chin takes the lower jaw's ramp along s, easing into the cheek's rule above
    // lowerY: the two rules met in a jagged step along the chin's edge, which the inflation drew out into striations)
    // (lowerYBack: toward the rictus the band rises to { y }, so the jaw's rounded corner under the lip's end goes out
    // with the cheek instead of standing half-way as a knob under the pad's end)
    const LYB = TI.lowerYBack, lyw = LYB ? sm(LYB.s[0], LYB.s[1], x) : 0;
    const ramp = sm(0.14, 0.34, x), yr = sm(TI.lowerY[0] + ((LYB?.y[0] ?? 0) - TI.lowerY[0]) * lyw, TI.lowerY[1] + ((LYB?.y[1] ?? 0) - TI.lowerY[1]) * lyw, y);
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
  // the lower jaw's own tissue, where the mask keeps it, follows its splayed halves (o.jawSplay: the pose's world
  // transforms of J_jawL/R, skull.mjs), so the rami stay inside the lips and the chin and the lower lip's corners go
  // out with the abducted jaw joints (the two halves' turns blended across the symphysis); `lowerSmooth` passes soften
  // the tissue's edge
  const wsp = new Float32Array(n);
  if (o.jawSplay) {
    const L = lap(lowF, TI.lowerSmooth ?? 6), TL = o.jawSplay.J_jawL, TR = o.jawSplay.J_jawR;
    const mv = (T, p) => [T.R[0] * p[0] + T.R[1] * p[1] + T.R[2] * p[2] + T.t[0], T.R[3] * p[0] + T.R[4] * p[1] + T.R[5] * p[2] + T.t[1], T.R[6] * p[0] + T.R[7] * p[1] + T.R[8] * p[2] + T.t[2]];
    for (let v = 0; v < n; v++) {
      const w = (1 - M[v]) * L[v];
      if (w < 1e-4) continue;
      wsp[v] = w;
      const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], a = mv(TL, p), b = mv(TR, p);
      const z = p[2], zb = TI.splayBlend ?? 0.03, tl = 0.5 + 0.5 * (Math.abs(z) < zb ? Math.sin((z / zb) * Math.PI / 2) : Math.sign(z));
      for (let k = 0; k < 3; k++) E[v * 3 + k] += w * (tl * a[k] + (1 - tl) * b[k] - p[k]);
    }
  }
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
  const projPre = Uint8Array.from(proj);
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
    // (squash: the laid patch given back a share of its relief over the smooth skin (its stand-off, the smooth bind
    // head's distance) along the inflated head's normal: the pad's end a low crescent on the ball with its rim and groove
    // kept in miniature, not pressed flat, whose facets folded over where the round end was flattened onto the ball)
    if (TI.pad.squash) {
      const c = TI.pad.squash;
      for (const v of R) {
        const w = wR[v];
        q[0] = Q[v * 3]; q[1] = Q[v * 3 + 1]; q[2] = Q[v * 3 + 2];
        for (let k = 0; k < 2; k++) onto();
        const gx = target(q[0] + e, q[1], q[2]) - target(q[0] - e, q[1], q[2]), gy = target(q[0], q[1] + e, q[2]) - target(q[0], q[1] - e, q[2]), gz = target(q[0], q[1], q[2] + e) - target(q[0], q[1], q[2] - e);
        const gl = Math.hypot(gx, gy, gz) || 1, h = c * smooth(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        const nw = [q[0] + (h * gx) / gl, q[1] + (h * gy) / gl, q[2] + (h * gz) / gl];
        for (let k = 0; k < 3; k++) Q[v * 3 + k] = Q0[v * 3 + k] * (1 - w) + nw[k] * w;
      }
    }
    // (the laid skin counts as projected, its normals the inflated head's, only where it lies on that surface: the
    // squashed pad's relief stands off it, and its normals turn with its facets)
    for (const v of R) { for (let k = 0; k < 3; k++) E[v * 3 + k] = Q[v * 3 + k] - pos[v * 3 + k]; if (wR[v] > 0.5) proj[v] = TI.pad.squash ? (Math.abs(target(Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2])) < 0.0015 ? 1 : 0) : 1; }
    nLay = R.length; layW = wR;
  }
  // the pads' hind ends and the lips' corner cleaned up (TI.repair): wherever the moved skin turned a facet over (`cos`:
  // its normal against the bind's; the labial groove's walls and the pad's rim where the laid end meets the skin that
  // kept its place, the slit's end under it), the displacement there and `ring` rings round it is smoothed over the
  // mesh, pass by pass, until none is left or `iters` passes are done; the cheek's skin that lay on the balloon (the
  // projected skin, not the laid pad) is put back onto the inflated head after each pass. Within `box` (rest s0, s1,
  // y0, y1, fading over `soft`) and beyond |z| z[0]…z[1].
  let nRep = 0, repIt = 0, nRepLeft = 0, zrep = null;
  const RP = TI.repair;
  if (RP) {
    const [s0, s1, y0, y1] = RP.box, so = RP.soft, zr = new Float32Array(n), Z = [];
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], za = Math.abs(pos[v * 3 + 2]);
      zr[v] = sm(s0 - so, s0, x) * (1 - sm(s1, s1 + so, x)) * sm(y0 - so, y0, y) * (1 - sm(y1, y1 + so, y)) * sm(RP.z[0], RP.z[1], za);
      if (zr[v] > 0) Z.push(v);
    }
    const inZ = new Uint8Array(n); for (const v of Z) inZ[v] = 1;
    // the zone's faces and their bind normals
    const FZ = [];
    for (let t = 0; t < index.length; t += 3) if (inZ[index[t]] || inZ[index[t + 1]] || inZ[index[t + 2]]) FZ.push(t);
    const fnrm = (P, t) => { const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3; const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
    const N0 = FZ.map((t) => fnrm(pos, t));
    // the skin lying on the inflated head (kept on it)
    const Q = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) Q[i] = pos[i] + E[i];
    // (only where the inflated head's surface is the balloon's: put back onto the head's own folds there, the labial
    // groove's rear end, the skin was drawn into the crease and turned over)
    const onS = new Uint8Array(n);
    for (const v of Z) { const x = Q[v * 3], y = Q[v * 3 + 1], z = Q[v * 3 + 2], g = target(x, y, z); onS[v] = projPre[v] && Math.abs(g) < 0.0015 && (!balloon || Math.abs(balloon(x, y, z) - g) < 0.002) ? 1 : 0; }
    const e = 1e-4, onto = (v, w) => {
      let x = Q[v * 3], y = Q[v * 3 + 1], z = Q[v * 3 + 2];
      for (let k = 0; k < 2; k++) {
        const g0 = target(x, y, z); if (Math.abs(g0) < 1e-5) break;
        const gx = (target(x + e, y, z) - target(x - e, y, z)) / (2 * e), gy = (target(x, y + e, z) - target(x, y - e, z)) / (2 * e), gz = (target(x, y, z + e) - target(x, y, z - e)) / (2 * e);
        const gg = gx * gx + gy * gy + gz * gz || 1; x -= (g0 * gx) / gg; y -= (g0 * gy) / gg; z -= (g0 * gz) / gg;
      }
      Q[v * 3] += (x - Q[v * 3]) * w; Q[v * 3 + 1] += (y - Q[v * 3 + 1]) * w; Q[v * 3 + 2] += (z - Q[v * 3 + 2]) * w;
    };
    // one pass of displacement smoothing over the vertices `V` (each toward its ring's mean by its zone weight × w)
    const pass = (V, w) => {
      const nx = new Float32Array(V.length * 3);
      V.forEach((v, i) => {
        const nv = nb[v]; let a0 = 0, a1 = 0, a2 = 0;
        for (const u of nv) { a0 += Q[u * 3] - pos[u * 3]; a1 += Q[u * 3 + 1] - pos[u * 3 + 1]; a2 += Q[u * 3 + 2] - pos[u * 3 + 2]; }
        const m = nv.length || 1, ww = zr[v] * w;
        nx[i * 3] = (Q[v * 3] - pos[v * 3]) * (1 - ww) + (a0 / m) * ww; nx[i * 3 + 1] = (Q[v * 3 + 1] - pos[v * 3 + 1]) * (1 - ww) + (a1 / m) * ww; nx[i * 3 + 2] = (Q[v * 3 + 2] - pos[v * 3 + 2]) * (1 - ww) + (a2 / m) * ww;
      });
      V.forEach((v, i) => { for (let k = 0; k < 3; k++) Q[v * 3 + k] = pos[v * 3 + k] + nx[i * 3 + k]; if (onS[v]) onto(v, zr[v]); });
    };
    const cosF = RP.cos ?? 0;
    for (; repIt < RP.iters; repIt++) {
      const mark = new Uint8Array(n); let nf = 0;
      FZ.forEach((t, i) => {
        const a = N0[i], b = fnrm(Q, t), d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b) + 1e-30);
        if (d < cosF) { nf++; for (let k = 0; k < 3; k++) if (inZ[index[t + k]]) mark[index[t + k]] = 1; }
      });
      if (!nf) break;
      if (repIt === 0) nRep = nf;
      // the turned facets' vertices and `ring` rings round them
      for (let r = 0; r < RP.ring; r++) { const add = []; for (const v of Z) if (mark[v]) for (const u of nb[v]) if (inZ[u] && !mark[u]) add.push(u); for (const u of add) mark[u] = 1; }
      pass(Z.filter((v) => mark[v]), RP.w ?? 1);
    }
    FZ.forEach((t, i) => { const a = N0[i], b = fnrm(Q, t); if ((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b) + 1e-30) < cosF) nRepLeft++; });
    for (const v of Z) for (let k = 0; k < 3; k++) E[v * 3 + k] = Q[v * 3 + k] - pos[v * 3 + k];
    zrep = zr;
    // (and the skin the passes moved off the inflated head no longer counts as projected)
    for (const v of Z) if (proj[v] && Math.abs(target(Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2])) > 0.0015) proj[v] = 0;
  }
  // the share for the normals: the mask, raised where the relaxation moved skin the mask had kept
  const Mo = Float32Array.from(M);
  for (const v of zone) Mo[v] = Math.max(M[v], zw[v] * sm(0, 0.004, Math.hypot(E[v * 3], E[v * 3 + 1], E[v * 3 + 2])));
  // (and where the jaw's splay or the repair moved skin the mask had kept: its normals turn as its facets do)
  for (let v = 0; v < n; v++) {
    const ml = Math.max(wsp[v], zrep ? zrep[v] : 0) * sm(0, 0.004, Math.hypot(E[v * 3], E[v * 3 + 1], E[v * 3 + 2]));
    if (ml > Mo[v]) Mo[v] = ml;
  }
  return { d: E, mask: Mo, premultiplied: true, projected: proj, laid: layW, stats: { projected: nFix, filled: nFeat, flattened: nFlat, relaxed: zone.length, laid: nLay, turned: nRep, repairPasses: repIt, turnedLeft: nRepLeft }, ...(o.debug ? { dbg: { M, D, Ds, fixed, proj, zw, EG, layW } } : {}) };
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
