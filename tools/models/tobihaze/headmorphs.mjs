// The head's blend shapes, one code path for the pose tests (build-pose.mjs) and the shipped tiers (rig.mjs, build.mjs):
// the blink, the throat's pouch, the gape's correctives (gape, gum), the vent's, and the cheeks' inflation with its
// in-between shape, each with its normal deltas, solved against a head-space skin (headrig.mjs JOINT_NAMES index space).
// Extracted from build-pose.mjs (rounds n15–n17) without a change to the arithmetic: build-pose's pose GLBs stay byte for
// byte the same.
//
// Besides the bind-frame displacements every posed shape also carries its WORLD displacement and the pose it is solved for
// (`world`): what the skin must look like once posed, independent of the skin weights. A lighter tier, whose skin and
// mesh differ, carries that world displacement over (transfer.mjs) and solves its own bind displacement against its own
// skin (solveBindDelta, poseWorldFor), so its posed skin lands where the hero's does.
import { HEAD_SCULPT as HEAD_SCULPT0, headSDF as headSDF0 } from './head.mjs';
import { HEAD_JOINTS } from './skull.mjs';
import { worldTransforms } from './skel.mjs';
import {
  HEAD_POSES, poseLocals, poseWorld, skinVertices, blinkTargets, throatTargets, gapeTargets, inflateTargets, inflateMorph,
  inflateMidMorph, smoothSculpt, morphNormals, bindNormalDeltas, faceNormals, smoothField, rotateTo, ventTargets, BLINK_DROP,
  JOINT_NAMES,
} from './headrig.mjs';

/** The blend shapes in their glTF order. */
export const MORPH_ORDER = ['blinkL', 'blinkR', 'throat', 'gape', 'gum', 'vent', 'inflate', 'inflateMid'];

/** What drives each blend shape at run time (written into the mesh extras, as build-pose.mjs writes them). */
export const MORPH_DRIVERS = {
  blinkL: 'J_eyeL drop / BLINK_DROP (the eye pulled down 0.10 HL)', blinkR: 'J_eyeR drop / BLINK_DROP',
  throat: 'buccal pumping (gulp 1, inflate 1)', inflate: 'cheek inflation w (inflated 1, inflatedHalf 0.5)', inflateMid: '4 w (1 − w) of the inflation w',
  gape: 'J_jaw angle / 70°, clamped 0…1', gum: 'J_jaw angle / 40°, clamped 0…1',
  vent: 'J_opercL/R angle / 18° (vent 1, gulp 4/18), clamped 0…1; 0 in the cheek inflation (its own blend shape carries the covers)',
};

/** The same drivers as numbers for the runtime: weight = clamp((value of `joint`'s channel) / `per`, 0, 1). */
export const MORPH_DRIVE = {
  blinkL: { joint: 'J_eyeL', channel: 'drop', per: BLINK_DROP, unit: 'HL' },
  blinkR: { joint: 'J_eyeR', channel: 'drop', per: BLINK_DROP, unit: 'HL' },
  gape: { joint: 'J_jaw', channel: 'angle', per: 70, unit: 'deg' },
  gum: { joint: 'J_jaw', channel: 'angle', per: 40, unit: 'deg' },
  vent: { joint: ['J_opercL', 'J_opercR'], channel: 'angle', per: 18, unit: 'deg', zeroWhen: 'inflate' },
  inflate: { input: 'inflation w' },
  inflateMid: { input: 'inflation w', curve: '4w(1-w)' },
  throat: { input: 'buccal pumping (0..1)' },
};

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const solve3 = (A, q) => {
  const [a, b, c, d, e, f, g, h, i] = A;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const inv = [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d].map((x) => x / det);
  return [inv[0] * q[0] + inv[1] * q[1] + inv[2] * q[2], inv[3] * q[0] + inv[4] * q[1] + inv[5] * q[2], inv[6] * q[0] + inv[7] * q[1] + inv[8] * q[2]];
};

/**
 * World transforms of a head pose for a skeleton that keeps only `jointNames` of the head's joints: the pose's entries
 * for joints not kept are dropped (their skin went to a kept ancestor, gobyTiers.reduceSkeleton), and a joint not kept
 * reads its kept ancestor's transform. Joints outside the head (trunk, fins) are absent: identity.
 * @param pose       a HEAD_POSES entry ({ J_x: { angle, lift, slide, t } })
 * @param jointNames the tier's joint names (any order)
 * @returns { [name]: { R (3×3 row-major), t } } (HL, fish frame), for every HEAD_JOINTS name
 */
export function poseWorldFor(pose = {}, jointNames = HEAD_JOINTS.map((j) => j.name)) {
  const keep = new Set(jointNames);
  const kept = Object.fromEntries(Object.entries(pose).filter(([k]) => keep.has(k)));
  const W = worldTransforms(HEAD_JOINTS, poseLocals(kept));
  const parent = Object.fromEntries(HEAD_JOINTS.map((j) => [j.name, j.parent]));
  const out = {};
  for (const j of HEAD_JOINTS) {
    let k = j.name;
    while (k && !keep.has(k)) k = parent[k];
    out[j.name] = k ? W[k] : { R: I3, t: [0, 0, 0] };
  }
  return out;
}

/**
 * The bind-frame displacement Δ that lands the skinned vertex on p + E: A (p + Δ) + b = p + E with A = Σ w R, b = Σ w t
 * over the vertex's joints (headrig's inflateMorph / ventTargets solve, for any joint index space).
 * @param pos        bind positions (any unit; E and the transforms' t in the same unit)
 * @param skin       { joints (indices into jointNames), weights (floats summing to 1, or uint8 summing to 255) }
 * @param jointNames names of the skin's joint indices
 * @param W          { [name]: { R, t } } world transforms (missing: identity)
 * @param E          world displacements (n·3)
 * @param o          { mask: Float32Array(n) (only where > 0; else Δ = 0) }
 * @returns Float32Array (n·3)
 */
export function solveBindDelta(pos, skin, jointNames, W, E, o = {}) {
  const n = pos.length / 3, out = new Float32Array(n * 3);
  const T = jointNames.map((nm) => W[nm] ?? { R: I3, t: [0, 0, 0] });
  const scale = skin.weights instanceof Uint8Array ? 1 / 255 : 1;
  for (let v = 0; v < n; v++) {
    if (o.mask && !(o.mask[v] > 0)) continue;
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0];
    let ws = 0;
    for (let i = 0; i < 4; i++) {
      const w = skin.weights[v * 4 + i] * scale;
      if (!w) continue;
      ws += w;
      const { R, t } = T[skin.joints[v * 4 + i]];
      for (let k = 0; k < 9; k++) A[k] += w * R[k];
      for (let k = 0; k < 3; k++) b[k] += w * t[k];
    }
    if (!ws) continue;
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const x = solve3(A, [0, 1, 2].map((k) => p[k] + E[v * 3 + k] - b[k]));
    for (let k = 0; k < 3; k++) out[v * 3 + k] = x[k] - p[k];
  }
  return out;
}

/** Linear blend skinning of positions by world transforms keyed by name (skin joints index `jointNames`). */
export function skinWith(pos, skin, jointNames, W) {
  const n = pos.length / 3, out = new Float32Array(n * 3);
  const T = jointNames.map((nm) => W[nm] ?? { R: I3, t: [0, 0, 0] });
  const scale = skin.weights instanceof Uint8Array ? 1 / 255 : 1;
  for (let v = 0; v < n; v++) {
    const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < 4; i++) {
      const w = skin.weights[v * 4 + i] * scale;
      if (!w) continue;
      const { R, t } = T[skin.joints[v * 4 + i]];
      x += w * (R[0] * px + R[1] * py + R[2] * pz + t[0]);
      y += w * (R[3] * px + R[4] * py + R[5] * pz + t[1]);
      z += w * (R[6] * px + R[7] * py + R[8] * pz + t[2]);
    }
    out[v * 3] = x; out[v * 3 + 1] = y; out[v * 3 + 2] = z;
  }
  return out;
}

/** The pose each posed blend shape is solved for (its world displacement holds there). */
export const MORPH_POSES = {
  gape: { J_jaw: HEAD_POSES.gapeFull.J_jaw, J_imj: HEAD_POSES.gapeFull.J_imj, J_premax: HEAD_POSES.gapeFull.J_premax, J_maxL: HEAD_POSES.gapeFull.J_maxL, J_maxR: HEAD_POSES.gapeFull.J_maxR, J_hyoid: HEAD_POSES.gapeFull.J_hyoid, J_suspL: HEAD_POSES.gapeFull.J_suspL, J_suspR: HEAD_POSES.gapeFull.J_suspR, J_opercL: HEAD_POSES.gapeFull.J_opercL, J_opercR: HEAD_POSES.gapeFull.J_opercR },
  vent: { J_opercL: HEAD_POSES.vent.J_opercL, J_opercR: HEAD_POSES.vent.J_opercR, J_suspL: HEAD_POSES.vent.J_suspL, J_suspR: HEAD_POSES.vent.J_suspR },
  inflate: Object.fromEntries(Object.entries(HEAD_POSES.inflated).filter(([k]) => k.startsWith('J_'))),
  inflateMid: Object.fromEntries(Object.entries(HEAD_POSES.inflatedHalf).filter(([k]) => k.startsWith('J_'))),
  blinkL: { J_eyeL: { t: [0, -BLINK_DROP, 0] } },
  blinkR: { J_eyeR: { t: [0, -BLINK_DROP, 0] } },
};

/**
 * The head's blend shapes on a head-space skin.
 * @param sub   { position (HL, fish frame), normal, indices (wound consistently: headrig fixWinding) }
 * @param skin  { joints: indices into headrig JOINT_NAMES, weights } (headWeights, or the shipped weights mapped there)
 * @param o     { K: the head sculpt (HEAD_SCULPT), headSDF: the head module's headSDF, headField: the bind head's field
 *              with .parts and .cup (default headSDF(K, { cut: false })), teeth (skull.mjs fitTeeth), which: the names
 *              wanted (MORPH_ORDER; a blink computes both sides, the gape both gape and gum, the inflation both inflate and
 *              inflateMid), inflated: the inflated head's module (head-inflated.mjs, or its path), inflateScale:
 *              Float32Array(n) multiplying the inflation's mask (the pectoral lobe and pelvic base kept off the balloon,
 *              rig.mjs), world: false to skip the world displacements, log }
 * @returns { names (glTF order), d: { name: Float32Array (HL, bind frame) }, n: { name: normal deltas }, world: { name:
 *   { pose (HEAD_POSES-like, joints only), E: Float32Array (HL: skinned(p + Δ) − p at that pose), support: Uint8Array
 *   (Δ ≠ 0), base?: { name, w } (the in-between shape's: its bind delta is solveBindDelta(E) − w · that shape's) } },
 *   drivers: { name: text },
 *   inflate: { mask, d, laid } | null, blink: blinkTargets' result | null }
 */
export async function headMorphs(sub, skin, o = {}) {
  const log = o.log ?? (() => {});
  const K = o.K ?? HEAD_SCULPT0, headSDF = o.headSDF ?? headSDF0;
  const f = o.headField ?? headSDF(K, { cut: false });
  const teeth = o.teeth;
  const which = new Set(o.which ?? MORPH_ORDER);
  const needs = (k) => which.has(k);
  const head = sub;
  // (the blink's blend shape is solved against the weights: the eye joints' share of the globe's drop is taken out of it)
  const blink = needs('blinkL') || needs('blinkR') ? blinkTargets(head.position, head.normal, headSDF, K, { weights: skin, index: head.indices }) : null;
  if (blink) log('blink targets');
  const throat = needs('throat') ? throatTargets(head.position, head.normal, K, { index: head.indices }) : null;
  if (throat) log('throat targets');
  const gapeC = needs('gape') || needs('gum') ? gapeTargets(head.position, head.normal, head.indices, f, K, skin, { teeth }) : null;
  if (gapeC) log('gape correctives');
  const vent = needs('vent') ? ventTargets(head.position, head.normal, head.indices, skin, { K }) : null;
  if (vent) log('vent corrective');
  // the inflation's blend shapes: onto the inflated head (head-inflated.mjs), solved for the full `inflated` pose, and
  // its in-between corrective (exact at `inflatedHalf`; driven by 4w(1 − w) from the inflate weight w)
  let inflate = null, inflateMid = null, inflateMask = null, inflateProjS = null, inflateField = null, inflateD = null, inflateLaid = null;
  if (needs('inflate') || needs('inflateMid')) {
    const IM = typeof o.inflated === 'object' && o.inflated ? o.inflated : await import(o.inflated ?? new URL('./head-inflated.mjs', import.meta.url).href);
    inflateField = IM.inflatedSDF(K, { cut: true, headSDF });
    const inf = inflateTargets(head.position, head.indices, f, headSDF(smoothSculpt(K), { cut: true }), inflateField, { K, jawSplay: poseWorld(HEAD_POSES.inflated) });
    // (the caller's override: parts that must stay off the balloon, e.g. the pectoral lobe's root and the pelvic base)
    if (o.inflateScale) for (let v = 0; v < inf.mask.length; v++) { const s = o.inflateScale[v]; if (s === 1) continue; inf.mask[v] *= s; for (let k = 0; k < 3; k++) inf.d[v * 3 + k] *= s; }
    inflate = inflateMorph(head.position, skin, poseWorld(HEAD_POSES.inflated), inf);
    const HP = HEAD_POSES.inflatedHalf;
    inflateMid = inflateMidMorph(head.position, skin, poseWorld(HP), inf, inflate, HP.morph.inflate);
    // (the displacement at full weight: inflateTargets applies the mask)
    inflateMask = inf.mask; inflateD = inf.d; inflateLaid = inf.laid ?? null;
    // the projected skin (1) against the features riding on it (0), smoothed so the normals' two rules blend
    inflateProjS = smoothField(Float32Array.from(inf.projected), head.indices, 3);
    log(`inflate targets (${inf.stats.projected} projected, ${inf.stats.filled} filled)`);
  }

  // ---- the blend shapes with their normal deltas (bind frame): { name: { d, n } }
  const P0 = head.position, N0 = head.normal, I0 = head.indices, nV = P0.length / 3;
  const shapes = {};
  if (blink) {
    // (the normals follow the blink's whole move: the blend shape and the eye joints' share of the globe's drop)
    const iL = JOINT_NAMES.indexOf('J_eyeL'), iR = JOINT_NAMES.indexOf('J_eyeR'), full = new Float32Array(P0.length);
    for (let v = 0; v < nV; v++) {
      let es = 0; for (let q = 0; q < 4; q++) { const j = skin.joints[v * 4 + q]; if (j === iL || j === iR) es += skin.weights[v * 4 + q]; }
      for (let k = 0; k < 3; k++) full[v * 3 + k] = blink.L[v * 3 + k] + blink.R[v * 3 + k];
      full[v * 3 + 1] -= BLINK_DROP * es;
    }
    // (where the skin was laid on the closed surface, its own normals: blinkTargets' normal, in their share)
    const dn = morphNormals(P0, N0, I0, full, { smooth: 4 }), nL = new Float32Array(P0.length), nR = new Float32Array(P0.length);
    if (blink.normal) for (let v = 0; v < nV; v++) {
      const w = blink.normalShare[v];
      if (!(w > 0)) continue;
      for (let k = 0; k < 3; k++) dn[v * 3 + k] = (1 - w) * dn[v * 3 + k] + w * (blink.normal[v * 3 + k] - N0[v * 3 + k]);
    }
    // (split across the midline as the positions are)
    for (let v = 0; v < nV; v++) {
      const z = P0[v * 3 + 2], tl = 0.5 + 0.5 * (Math.abs(z) < 0.03 ? Math.sin((z / 0.03) * Math.PI / 2) : Math.sign(z));
      for (let k = 0; k < 3; k++) { nL[v * 3 + k] = dn[v * 3 + k] * tl; nR[v * 3 + k] = dn[v * 3 + k] * (1 - tl); }
    }
    shapes.blinkL = { d: blink.L, n: nL }; shapes.blinkR = { d: blink.R, n: nR };
  }
  if (throat) shapes.throat = { d: throat, n: morphNormals(P0, N0, I0, throat) };
  if (gapeC) { shapes.gape = { d: gapeC.gape, n: morphNormals(P0, N0, I0, gapeC.gape) }; shapes.gum = { d: gapeC.gum, n: morphNormals(P0, N0, I0, gapeC.gum) }; }
  if (vent) shapes.vent = { d: vent, n: morphNormals(P0, N0, I0, vent) };
  // the inflation's normals. The skin lands at the bind position moved by the inflation's displacement (the joints swing
  // only the bones inside it): on the projected skin the normal is the bind's turned toward the balloon's own at the
  // displaced point (its field's gradient), in the mask's share; the features riding on the skin (the gill margin, the pads)
  // turn as the smoothed facets round them turn. Worked out on the posed skin of the full and the halfway pose and carried
  // back into the bind frame as the inflate and inflateMid shapes' normal deltas.
  const inflationNormals = (posed, wInf) => {
    const P = posed.position, N = Float32Array.from(posed.normal), e = 2e-4, g = inflateField, B = P0, D = inflateD;
    const fb = smoothField(faceNormals(B, I0), I0, 4), fp = smoothField(faceNormals(P, I0), I0, 4);
    // (the pads' laid ends (inflateTargets' laid share) take the posed skin's own normals, lightly smoothed: carried from
    // the bind's round end, the rule above combed their relief with stripes)
    const pv = inflateLaid ? smoothField(faceNormals(P, I0), I0, 3) : null;
    for (let v = 0; v < nV; v++) {
      const w = Math.min(1, wInf * inflateMask[v]);
      if (w < 1e-3) continue;
      const a = [fb[v * 3], fb[v * 3 + 1], fb[v * 3 + 2]], b = [fp[v * 3], fp[v * 3 + 1], fp[v * 3 + 2]];
      const la = Math.hypot(...a) || 1, lb = Math.hypot(...b) || 1;
      for (let k = 0; k < 3; k++) { a[k] /= la; b[k] /= lb; }
      const n0 = [N0[v * 3], N0[v * 3 + 1], N0[v * 3 + 2]];
      let r = rotateTo(a, b, n0);
      const pj = inflateProjS[v];
      if (pj > 1e-3) {
        const x = B[v * 3] + D[v * 3], y = B[v * 3 + 1] + D[v * 3 + 1], z = B[v * 3 + 2] + D[v * 3 + 2];
        const gx = g(x + e, y, z) - g(x - e, y, z), gy = g(x, y + e, z) - g(x, y - e, z), gz = g(x, y, z + e) - g(x, y, z - e);
        const gl = Math.hypot(gx, gy, gz) || 1;
        const t = [n0[0] * (1 - w) + (w * gx) / gl, n0[1] * (1 - w) + (w * gy) / gl, n0[2] * (1 - w) + (w * gz) / gl];
        const tl = Math.hypot(...t) || 1;
        r = [0, 1, 2].map((k) => r[k] * (1 - pj) + (t[k] / tl) * pj);
      }
      if (pv && inflateLaid[v] > 0) {
        const lw = Math.min(1, inflateLaid[v]), rl = Math.hypot(...r) || 1, q = [pv[v * 3], pv[v * 3 + 1], pv[v * 3 + 2]], ql = Math.hypot(...q) || 1;
        r = [0, 1, 2].map((k) => (r[k] / rl) * (1 - lw) + (q[k] / ql) * lw);
      }
      const l = Math.hypot(...r) || 1;
      N[v * 3] = r[0] / l; N[v * 3 + 1] = r[1] / l; N[v * 3 + 2] = r[2] / l;
    }
    return N;
  };
  if (inflate) {
    const WF = poseWorld(HEAD_POSES.inflated), HP = HEAD_POSES.inflatedHalf, WH = poseWorld(HP), h = HP.morph.inflate;
    const full = new Float32Array(P0.length), half = new Float32Array(P0.length);
    for (let i = 0; i < P0.length; i++) { full[i] = P0[i] + inflate[i]; half[i] = P0[i] + h * inflate[i] + (HP.morph.inflateMid ?? 0) * inflateMid[i]; }
    const nInf = bindNormalDeltas(N0, skin, WF, inflationNormals(skinVertices(full, N0, skin, WF), 1));
    const base = new Float32Array(P0.length); for (let i = 0; i < P0.length; i++) base[i] = h * nInf[i];
    const nMid = bindNormalDeltas(N0, skin, WH, inflationNormals(skinVertices(half, N0, skin, WH), h), base);
    shapes.inflate = { d: inflate, n: nInf }; shapes.inflateMid = { d: inflateMid, n: nMid };
  }
  log(`normal deltas (${Object.keys(shapes).join(', ')})`);
  const names = Object.keys(shapes);

  // ---- the world displacements (what the posed skin must show: skinned(p + Δ) − p at the shape's pose, weight 1) and
  // their poses, for the lighter tiers' re-solve (solveBindDelta against their own skin); `support` marks the vertices the
  // shape moves (Δ ≠ 0), so a tier solves only there and leaves the joints' own motion to its skin
  const world = {};
  if (o.world !== false) {
    const support = (d) => { const s = new Uint8Array(nV); for (let v = 0; v < nV; v++) if (d[v * 3] || d[v * 3 + 1] || d[v * 3 + 2]) s[v] = 1; return s; };
    const worldOf = (name, d) => {
      const pose = MORPH_POSES[name], W = poseWorldFor(pose, JOINT_NAMES), moved = new Float32Array(P0.length);
      for (let i = 0; i < P0.length; i++) moved[i] = P0[i] + d[i];
      const E = skinWith(moved, skin, JOINT_NAMES, W);
      for (let i = 0; i < P0.length; i++) E[i] -= P0[i];
      return { pose, E, support: support(d) };
    };
    for (const nm of ['gape', 'vent', 'blinkL', 'blinkR']) if (shapes[nm]) world[nm] = worldOf(nm, shapes[nm].d);
    if (inflate) {
      // (the inflation's skin lands on bind + inf.d whatever the joints do; the in-between shape on bind + h · inf.d, its
      // bind delta minus h times the full shape's: inflateMidMorph)
      const h = HEAD_POSES.inflatedHalf.morph.inflate;
      world.inflate = { pose: MORPH_POSES.inflate, E: Float32Array.from(inflateD), support: support(inflate) };
      world.inflateMid = { pose: MORPH_POSES.inflateMid, E: Float32Array.from(inflateD, (x) => h * x), base: { name: 'inflate', w: h }, support: support(inflate) };
    }
  }
  return {
    names, d: Object.fromEntries(names.map((k) => [k, shapes[k].d])), n: Object.fromEntries(names.map((k) => [k, shapes[k].n])),
    world, drivers: Object.fromEntries(names.map((k) => [k, MORPH_DRIVERS[k] ?? ''])),
    inflate: inflate ? { mask: inflateMask, d: inflateD, laid: inflateLaid } : null, blink,
  };
}
