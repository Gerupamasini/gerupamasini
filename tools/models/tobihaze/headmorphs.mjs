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
import { HEAD } from './anatomy.mjs';
import { HEAD_SCULPT as HEAD_SCULPT0, headSDF as headSDF0 } from './head.mjs';
import { HEAD_JOINTS } from './skull.mjs';
import { worldTransforms } from './skel.mjs';
import {
  HEAD_POSES, poseLocals, poseWorld, skinVertices, blinkTargets, throatTargets, gapeTargets, inflateTargets, inflateMorph,
  inflateMidMorph, smoothSculpt, morphNormals, bindNormalDeltas, faceNormals, smoothField, rotateTo, ventTargets, BLINK_DROP,
  JOINT_NAMES,
} from './headrig.mjs';

/** The blend shapes in their glTF order (build-pose.mjs writes these; round B2's eyes-up correctives are asked for by
 * name: MORPH_EXTRA). */
export const MORPH_ORDER = ['blinkL', 'blinkR', 'throat', 'gape', 'gum', 'vent', 'inflate', 'inflateMid'];
/** Round B2's further blend shapes, computed when `which` names them: the eyes-up correctives (EYES_UP). */
export const MORPH_EXTRA = ['eyesUpL', 'eyesUpR'];

/** What drives each blend shape at run time (written into the mesh extras, as build-pose.mjs writes them). */
export const MORPH_DRIVERS = {
  blinkL: 'J_eyeL drop / BLINK_DROP (the eye pulled down 0.10 HL)', blinkR: 'J_eyeR drop / BLINK_DROP',
  throat: 'buccal pumping (gulp 1, inflate 1)', inflate: 'cheek inflation w (inflated 1, inflatedHalf 0.5)', inflateMid: '4 w (1 − w) of the inflation w',
  gape: 'J_jaw angle / 70°, clamped 0…1', gum: 'J_jaw angle / 40°, clamped 0…1',
  vent: 'J_opercL/R angle / 18° (vent 1, gulp 4/18), clamped 0…1; 0 in the cheek inflation (its own blend shape carries the covers)',
  eyesUpL: 'J_eyeL lift / 0.08 HL (the alert periscope at 1), clamped 0…1', eyesUpR: 'J_eyeR lift / 0.08 HL, clamped 0…1',
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
  eyesUpL: { joint: 'J_eyeL', channel: 'lift', per: 0.08, unit: 'HL' },
  eyesUpR: { joint: 'J_eyeR', channel: 'lift', per: 0.08, unit: 'HL' },
};

/**
 * The shipped meshes' blend shapes by group (round B3: the morph textures' GPU memory). three.js packs every target of a
 * mesh for every one of its vertices (RGBA32F, position and normal, rows of 4096), and B2's one Head carried all ten
 * targets on its 27,986 vertices: 9.18 MB, most of it zeros (the gum moves 232 of them, the vent none). The skin is
 * split instead by the groups that move each triangle: a triangle any eye shape moves goes to `Head_Orbit`, else one the
 * mouth's shapes move to `Head_Mouth`, else one the face's (the throat and the cheeks' inflation) move to `Head` (lod1:
 * the same names), the rest to the static `Body`; each mesh carries every target that moves any of its vertices, so a
 * vertex two meshes share moves alike in both and no seam opens.
 */
export const MORPH_GROUPS = { eyes: ['blinkL', 'blinkR', 'eyesUpL', 'eyesUpR'], mouth: ['gape', 'gum', 'vent'], face: ['throat', 'inflate', 'inflateMid'] };
// (no 'eye' in the names: the viewer and the runtime take a mesh named so for an eye globe)
export const MORPH_MESH = { eyes: 'Head_Orbit', mouth: 'Head_Mouth', face: 'Head' };
/** The same with each eye's shapes a group of their own (lod1: its orbit mesh holds ~2,000 vertices, at the edge of a
 * texture row of 4,096 texels (2,048 vertices with their normals), past which its cost doubles: split by side its meshes
 * stay far below it). The two eyes' shared strip over the brow is `Head_Orbits`. */
export const MORPH_GROUPS_SIDES = { eyesL: ['blinkL', 'eyesUpL'], eyesR: ['blinkR', 'eyesUpR'], mouth: MORPH_GROUPS.mouth, face: MORPH_GROUPS.face };
export const MORPH_MESH_SIDES = { eyesL: 'Head_OrbitL', eyesR: 'Head_OrbitR', 'eyesL+eyesR': 'Head_Orbits', mouth: 'Head_Mouth', face: 'Head' };
/** Per tier (round B3): displacements (mm, `d`) and normal deltas (unit vectors, `n`) under these are dropped (hero 5 µm
 * and 0.6°, lod1 20 µm and 1.7°: below a pixel at any distance the tier is drawn at; they spread the shapes' supports over
 * the whole head, the inflation's 25,865 hero vertices falling to 17,451, for nothing a viewer could see; `by`: per
 * target), `draw`, the morph-texture bytes a mesh of its own must save to be worth its draw (splitByMorphs' penalty), and
 * `sides`: the eyes' shapes grouped by side (MORPH_GROUPS_SIDES). */
export const MORPH_EPS = { hero: { d: 0.005, n: 0.01, draw: 0.5e6 }, lod1: { d: 0.02, n: 0.03, draw: 0.05e6, sides: true } };

/** Zeroes the negligible part of blend shapes in place: per vertex, both its displacement and its normal delta when the
 * displacement is under eps.d and the normal delta under eps.n. Returns { name: vertices left moving }. */
export function pruneMorphs(morph, eps) {
  const out = {};
  for (const k of morph.names) {
    const d = morph.d[k], n = morph.n?.[k], nv = d.length / 3, ed = eps.by?.[k]?.d ?? eps.d, en = eps.by?.[k]?.n ?? eps.n;
    let c = 0;
    for (let v = 0; v < nv; v++) {
      const a = Math.hypot(d[v * 3], d[v * 3 + 1], d[v * 3 + 2]), b = n ? Math.hypot(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]) : 0;
      if (a < ed && b < en) { d.fill(0, v * 3, v * 3 + 3); if (n) n.fill(0, v * 3, v * 3 + 3); } else c++;
    }
    out[k] = c;
  }
  return out;
}

/** The GPU bytes three.js (r16x–r18x WebGLMorphtargets) gives a mesh's morph targets: one RGBA32F texel per vertex and
 * attribute (position, normal) per target, in rows of `maxTexture`. */
export function morphTexBytes(nVertices, nTargets, withNormals = true, maxTexture = 4096) {
  if (!nTargets) return 0;
  const width = nVertices * (withNormals ? 2 : 1), rows = Math.ceil(width / maxTexture);
  return (rows > 1 ? maxTexture * rows : width) * 16 * nTargets;
}

/**
 * The skin's triangles split into meshes by the blend-shape groups that move them (MORPH_GROUPS): one mesh per set of
 * groups moving a triangle's vertices, each with every target that moves any of its vertices, then merged pairwise
 * while a merge saves more morph-texture memory than `penalty` bytes (the cost of a draw) — the fewest meshes the memory
 * allows. Named by their groups (MORPH_MESH: Head_Orbit, Head_Mouth, Head; a merged one by its first group, `order`).
 * @param indices the skin's triangles   @param morph { names, d, n } per vertex of the skin
 * @param o { groups, names, order, penalty (bytes; default 0.25 MB) }
 * @returns { meshes: [{ group, name, tris: Uint32Array (triangle ids), targets: [names], vertices, bytes }], still:
 *   Uint32Array (the static triangles), dropped: [targets moving no vertex], bytes }
 */
export function splitByMorphs(indices, morph, { groups = MORPH_GROUPS, names = MORPH_MESH, order = ['eyes', 'mouth', 'face'], penalty = 0.25e6 } = {}) {
  const nv = Math.max(...Object.values(morph.d).map((d) => d.length / 3)), nT = indices.length / 3;
  const mv = {}, live = [];
  for (const k of morph.names) {
    const d = morph.d[k], n = morph.n?.[k], m = new Uint8Array(nv);
    let any = false;
    for (let v = 0; v < nv; v++) if (d[v * 3] || d[v * 3 + 1] || d[v * 3 + 2] || (n && (n[v * 3] || n[v * 3 + 1] || n[v * 3 + 2]))) { m[v] = 1; any = true; }
    mv[k] = m; if (any) live.push(k);
  }
  const groupOf = Object.fromEntries(Object.entries(groups).flatMap(([g, ks]) => ks.map((k) => [k, g])));
  for (const k of live) if (!groupOf[k]) throw new Error(`splitByMorphs: ${k} is in no group`);
  const sets = new Map(), still = [];
  for (let t = 0; t < nT; t++) {
    const ks = new Set();
    for (let q = 0; q < 3; q++) { const v = indices[t * 3 + q]; for (const k of live) if (mv[k][v]) ks.add(k); }
    if (!ks.size) { still.push(t); continue; }
    const key = order.filter((g) => [...ks].some((k) => groupOf[k] === g)).join('+');
    if (!sets.has(key)) sets.set(key, { groups: key.split('+'), tris: [], verts: new Set(), targets: new Set() });
    const m = sets.get(key); m.tris.push(t); for (let q = 0; q < 3; q++) m.verts.add(indices[t * 3 + q]); for (const k of ks) m.targets.add(k);
  }
  const cost = (m) => morphTexBytes(m.verts.size, m.targets.size);
  let list = [...sets.values()];
  for (;;) {
    let best = null;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const u = { verts: new Set([...list[i].verts, ...list[j].verts]), targets: new Set([...list[i].targets, ...list[j].targets]) };
      const gain = cost(list[i]) + cost(list[j]) + penalty - cost(u);
      if (gain > 0 && (!best || gain > best.gain)) best = { i, j, gain, u };
    }
    if (!best) break;
    const a = list[best.i], b = list[best.j];
    const merged = { groups: order.filter((g) => a.groups.includes(g) || b.groups.includes(g)), tris: [...a.tris, ...b.tris], verts: best.u.verts, targets: best.u.targets };
    list = list.filter((_, k) => k !== best.i && k !== best.j).concat([merged]);
  }
  // (names: the first group's mesh name, then the next groups' as suffixes when two meshes would share it)
  list.sort((a, b) => order.indexOf(a.groups[0]) - order.indexOf(b.groups[0]) || a.groups.length - b.groups.length);
  const taken = new Set();
  const meshes = list.map((m) => {
    // (the longest leading run of its groups that has a name of its own, e.g. eyesL+eyesR → Head_Orbits)
    let name = names[m.groups[0]];
    for (let i = m.groups.length; i > 1; i--) { const k = names[m.groups.slice(0, i).join('+')]; if (k && !taken.has(k)) { name = k; break; } }
    for (let i = 1; taken.has(name) && i < m.groups.length; i++) name = `${name}_${m.groups[i][0].toUpperCase()}${m.groups[i].slice(1)}`;
    taken.add(name);
    const targets = morph.names.filter((k) => m.targets.has(k));
    return { group: m.groups.join('+'), name, tris: Uint32Array.from(m.tris.sort((x, y) => x - y)), targets, vertices: m.verts.size, bytes: cost(m) };
  });
  return { meshes, still: Uint32Array.from(still), dropped: morph.names.filter((k) => !live.includes(k)), bytes: meshes.reduce((a, m) => a + m.bytes, 0) };
}

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

/**
 * A lighter tier's blend shape shrink-wrapped onto the hero's posed shape (round B2: lod1's blink; the carried world
 * displacement alone left the lod1 hood crumpled and torn over the globe, 49 flipped facets): the tier's skin posed at
 * the shape's pose from a starting bind displacement (e.g. the carried and solved one), each wrapped vertex laid on the
 * hero's posed surface (its closest point, skipping the hero's lining tucked inside the lowered globes), then relaxed over
 * that surface (`iters` passes of `lambda`, laid again each pass; the vertices left out of `mask` hold the pose), and
 * the bind displacement solved against the tier's own skin (solveBindDelta). Vertices the start puts inside a lowered globe
 * (the tucked lining) keep the start. Units: fish mm.
 * @param tier   { position, indices, skin { joints, weights }, names (the skin's joint names), source? (dense vertex per
 *               tier vertex: the charts' seams welded by it, else by position) }
 * @param target { position (posed), indices }: the hero's skin at the shape's pose with the shape
 * @param o      { W: { name: { R, t } } the pose's world transforms (fish mm), mask (per tier vertex, > 0: wrap), start
 *               (bind displacement to start from), globe: { centres: [posed centre per eye], radius } (the lowered globes),
 *               iters (40; 10 with targetBind), lambda (0.5), tuck (mm inside the globe that counts as tucked: 0.02),
 *               targetTuck (0.01), targetBind (the target's bind positions, mm: each tier vertex follows its material
 *               point on the hero, the closest hero bind point, instead of the closest posed point; b2_rig: the lod1
 *               hood with its kept lining closes with 0 globe pixels in view at gaze 0 and 45°), targetNormal (the
 *               target's posed normals), tuckMode ('keep' the default: the tucked lining keeps the start; 'project': laid
 *               on the hero's own tucked lining; 'surface': wrapped like the rest, for a tier without a lining) }
 * @returns { d: Float32Array (bind-frame displacement, mm), stats }
 */
export function wrapMorph(tier, target, o) {
  const n = tier.position.length / 3, I = tier.indices, names = tier.names, W = o.W;
  const start = o.start ?? new Float32Array(n * 3), mask = o.mask;
  const bind = tier.position, P0 = Float32Array.from(bind, (x, i) => x + start[i]);
  const Ps = skinWith(P0, tier.skin, names, W);
  // weld the charts' seams (same source vertex, or same position)
  const key = (v) => (tier.source ? `s${tier.source[v]}` : `${bind[v * 3].toFixed(5)},${bind[v * 3 + 1].toFixed(5)},${bind[v * 3 + 2].toFixed(5)}`);
  const wid = new Int32Array(n), groups = new Map();
  for (let v = 0; v < n; v++) { const k = key(v); let g = groups.get(k); if (g === undefined) { g = groups.size; groups.set(k, g); } wid[v] = g; }
  const m = groups.size, rep = new Int32Array(m).fill(-1);
  for (let v = 0; v < n; v++) if (rep[wid[v]] < 0) rep[wid[v]] = v;
  const nb = Array.from({ length: m }, () => new Set());
  for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { const A = wid[a], B = wid[b]; if (A !== B) { nb[A].add(B); nb[B].add(A); } }
  const G = o.globe, tuck = o.tuck ?? 0.02;
  const inGlobe = (p, slack) => G && G.centres.some((c) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < G.radius - slack);
  // the target surface without its tucked lining: vertices inside a lowered globe are not snapped to
  const TP = target.position, nT = TP.length / 3, okT = new Uint8Array(nT);
  for (let v = 0; v < nT; v++) okT[v] = inGlobe([TP[v * 3], TP[v * 3 + 1], TP[v * 3 + 2]], o.targetTuck ?? 0.01) ? 0 : 1;
  const grid = vertexGridLocal(TP, 0.2);
  const closest = (p) => grid.closest(p, target.indices, (v) => okT[v] === 1);
  // the wrapped set (welded): masked, not tucked
  const free = new Uint8Array(m), q = new Float32Array(m * 3), tuckedG = new Uint8Array(m);
  let tucked = 0;
  // (o.targetBind: the target's bind positions, same vertices: each tier vertex starts at the hero's posed place of the
  // same material point, its closest point on the hero's bind surface carried through the hero's own pose; the tucked
  // lining, the lid and its seam come out as the hero has them)
  const gridB = o.targetBind ? vertexGridLocal(o.targetBind, 0.2) : null, TN = o.targetNormal ?? null;
  for (let g = 0; g < m; g++) {
    const v = rep[g];
    let p = [Ps[v * 3], Ps[v * 3 + 1], Ps[v * 3 + 2]];
    if (gridB && mask[v] > 0) {
      const b = [bind[v * 3], bind[v * 3 + 1], bind[v * 3 + 2]], nv = tier.normal ? [tier.normal[v * 3], tier.normal[v * 3 + 1], tier.normal[v * 3 + 2]] : null;
      const c = gridB.closest(b, target.indices, nv && TN ? (u) => TN[u * 3] * nv[0] + TN[u * 3 + 1] * nv[1] + TN[u * 3 + 2] * nv[2] > 0 : null);
      if (c) p = [0, 1, 2].map((k) => c.w[0] * TP[c.ids[0] * 3 + k] + c.w[1] * TP[c.ids[1] * 3 + k] + c.w[2] * TP[c.ids[2] * 3 + k]);
    }
    q.set(p, g * 3);
    if (!(mask[v] > 0)) continue;
    if (o.tuckMode !== 'surface' && inGlobe(p, tuck)) { tucked++; tuckedG[g] = 1; continue; }
    free[g] = 1;
  }
  const lay = (g) => { const c = closest([q[g * 3], q[g * 3 + 1], q[g * 3 + 2]]); if (c) { const ids = c.ids, w = c.w; for (let k = 0; k < 3; k++) q[g * 3 + k] = w[0] * TP[ids[0] * 3 + k] + w[1] * TP[ids[1] * 3 + k] + w[2] * TP[ids[2] * 3 + k]; } };
  for (let g = 0; g < m; g++) if (free[g]) lay(g);
  // (o.tuckMode 'project': the tucked lining laid on the hero's own tucked lining, its closest point on the whole target)
  if (o.tuckMode === 'project') for (let g = 0; g < m; g++) if (tuckedG[g]) { const c = grid.closest([q[g * 3], q[g * 3 + 1], q[g * 3 + 2]], target.indices); if (c) for (let k = 0; k < 3; k++) q[g * 3 + k] = c.w[0] * TP[c.ids[0] * 3 + k] + c.w[1] * TP[c.ids[1] * 3 + k] + c.w[2] * TP[c.ids[2] * 3 + k]; }
  const iters = o.iters ?? (gridB ? 10 : 40), lambda = o.lambda ?? 0.5, tmp = new Float32Array(m * 3);
  for (let it = 0; it < iters; it++) {
    tmp.set(q);
    for (let g = 0; g < m; g++) {
      if (!free[g] || !nb[g].size) continue;
      // (the tucked lining is no neighbour to average with: it lies inside the globe, and pulling toward it folds the rim)
      const a = [0, 0, 0]; let cnt = 0; for (const h of nb[g]) { if (tuckedG[h]) continue; cnt++; for (let k = 0; k < 3; k++) a[k] += q[h * 3 + k]; }
      if (!cnt) continue; for (let k = 0; k < 3; k++) a[k] /= cnt;
      for (let k = 0; k < 3; k++) tmp[g * 3 + k] = (1 - lambda) * q[g * 3 + k] + lambda * a[k];
    }
    q.set(tmp);
    for (let g = 0; g < m; g++) if (free[g]) lay(g);
  }
  // the bind displacement that lands the tier's skin there
  const E = new Float32Array(n * 3), sm = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const g = wid[v];
    if (!(mask[v] > 0)) continue;
    sm[v] = 1;
    for (let k = 0; k < 3; k++) E[v * 3 + k] = (free[g] || (tuckedG[g] && (o.tuckMode === 'project' || gridB)) ? q[g * 3 + k] : Ps[v * 3 + k]) - bind[v * 3 + k];
  }
  const d = solveBindDelta(bind, tier.skin, names, W, E, { mask: sm });
  return { d, stats: { wrapped: free.reduce((a, b) => a + b, 0), tucked, welded: m, iters } };
}

/** A small uniform grid over posed points for closest-point queries (transfer.mjs's vertexGrid, local copy so this
 * module stays free of the transfer's imports). */
function vertexGridLocal(position, cell) {
  const n = position.length / 3, inv = 1 / cell, cells = new Map(), K = (i, j, k) => `${i},${j},${k}`;
  for (let v = 0; v < n; v++) { const k = K(Math.floor(position[v * 3] * inv), Math.floor(position[v * 3 + 1] * inv), Math.floor(position[v * 3 + 2] * inv)); let a = cells.get(k); if (!a) cells.set(k, (a = [])); a.push(v); }
  let vt = null;
  const near = (p, kk, accept) => {
    const i0 = Math.floor(p[0] * inv), j0 = Math.floor(p[1] * inv), k0 = Math.floor(p[2] * inv), best = [];
    for (let r = 0; r <= 12; r++) {
      if (best.length >= kk && best[kk - 1][1] <= (r - 1) * (r - 1) * cell * cell) break;
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
        if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) !== r) continue;
        const L = cells.get(K(i0 + a, j0 + b, k0 + c)); if (!L) continue;
        for (const v of L) { if (accept && !accept(v)) continue; const d2 = (position[v * 3] - p[0]) ** 2 + (position[v * 3 + 1] - p[1]) ** 2 + (position[v * 3 + 2] - p[2]) ** 2; if (best.length < kk) { best.push([v, d2]); best.sort((x, y) => x[1] - y[1]); } else if (d2 < best[kk - 1][1]) { best[kk - 1] = [v, d2]; best.sort((x, y) => x[1] - y[1]); } }
      }
    }
    return best;
  };
  const closest = (p, indices, accept) => {
    if (!vt) { vt = Array.from({ length: n }, () => []); for (let t = 0; t < indices.length / 3; t++) for (let k = 0; k < 3; k++) vt[indices[t * 3 + k]].push(t); }
    let best = null;
    for (const [v] of near(p, 3, accept)) for (const t of vt[v]) {
      const ids = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]], P = ids.map((i) => [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]]);
      const r = closestOnTri(p, P[0], P[1], P[2]);
      if (!best || r.d < best.d) best = { ids, w: r.w, d: r.d };
    }
    return best;
  };
  return { closest };
}
function closestOnTri(p, a, b, c) {
  const sub = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]], dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  let w;
  if (d1 <= 0 && d2 <= 0) w = [1, 0, 0];
  else {
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) w = [0, 1, 0];
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const t = d1 / (d1 - d3); w = [1 - t, t, 0]; }
      else {
        const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) w = [0, 0, 1];
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const t = d2 / (d2 - d6); w = [1 - t, 0, t]; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const t = (d4 - d3) / ((d4 - d3) + (d5 - d6)); w = [0, 1 - t, t]; }
            else { const den = 1 / (va + vb + vc), v2 = vb * den, w2 = vc * den; w = [1 - v2 - w2, v2, w2]; }
          }
        }
      }
    }
  }
  const q = [0, 1, 2].map((k) => w[0] * a[k] + w[1] * b[k] + w[2] * c[k]);
  return { w, d: Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) };
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

/**
 * The eyes raised for the alert periscope (u1, A070; behaviour §3.9: the eye's top 0.5–0.9 ED over the nape, the collar
 * showing as a stalk): the joints lift the globes, the cups' rims and the web (headWeights' eye shares) by up to
 * `lift` HL; skinned alone, the collar and the web between the eye's share and the head's stretch in a narrow band
 * (round B1 at 0.03: 49 web edges more than 2× and 0.15 mm longer, ratio 33 on slivers) and keep their rest normals
 * (striped shading). The corrective keeps the skinned shape but spreads the stretch: the band and `rings` rings of skin
 * round it are smoothed over (`iters` passes of `lambda` toward their neighbours' mean, laid back `layShare` of the way
 * onto the skinned surface each pass: 0, the stalk smoothed free of the stretched band's ridges; the globe-borne rims and
 * lining and the rest of the head hold), solved at the full lift (solveBindDelta), split across the midline into
 * eyesUpL / eyesUpR as the blink is; its normals the posed surface's own (the skinned rest normals over a stretched
 * collar shaded it in stripes).
 * Round B3 (`smooth` 'displacement', 30 rings, 2,500 passes): B2's corrective relaxed the free skin's positions over 10
 * rings, which flattened the cup's lips and left the dermal cup's lining under the globe (eye share 0.1–0.5 against the
 * rims' 1) as a frayed skirt below the window: on the shipped hero tier at the land state's lift (0.06 HL) 130 web edges
 * more than 2× and 0.15 mm longer (123 of them within 0.03 mm of the globe), 11 new flipped facets, area 0.25 at the
 * 0.1st percentile; at 0.08 HL 450 / 22 / 0.06. Relaxing the displacement instead (a harmonic lift from the eye-borne
 * skin into the still head over about 0.17 HL of the cup and the collar, the relief carried along) gives 0 / 0 / 0.78 at
 * 0.06 and 0 / 2 / 0.75 at 0.08 (b3_rig t_web).
 * The rest geometry is untouched (the shapes are 0 at rest).
 */
export const EYES_UP = { lift: 0.08, iters: 2500, lambda: 0.5, share: 1e-4, rings: 30, layShare: 0, smooth: 'displacement' };

/** The eyes-up corrective's targets (HL, bind frame) on a head mesh: { L, R, both, E (world displacement), mask, pose }. */
export function eyesUpTargets(head, skin, K, headSDF, o = {}) {
  const C = { ...EYES_UP, ...(o.eyesUp ?? {}) }, lift = C.lift;
  const P0 = head.position, N0 = head.normal, I0 = head.indices, nV = P0.length / 3;
  const pose = { J_eyeL: { t: [0, lift, 0] }, J_eyeR: { t: [0, lift, 0] } };
  const W = poseWorld(pose), posed = skinVertices(P0, N0, skin, W).position;
  // the eye joints' share of each vertex
  const iL = JOINT_NAMES.indexOf('J_eyeL'), iR = JOINT_NAMES.indexOf('J_eyeR'), share = new Float32Array(nV);
  for (let v = 0; v < nV; v++) for (let q = 0; q < 4; q++) { const j = skin.joints[v * 4 + q]; if (j === iL || j === iR) share[v] += skin.weights[v * 4 + q] * (skin.weights instanceof Uint8Array ? 1 / 255 : 1); }
  // the sliding set: the band the eyes carry in part (the collar, the web) and `rings` rings round it, but the globe-
  // borne parts (share ≈ 1: the rims, the lining, the cap) and what lies inside the resting globe
  const E0 = HEAD.eye, re = E0.d / 2, inGlobe = (v) => Math.hypot(P0[v * 3] - E0.s, P0[v * 3 + 1] - E0.y, Math.abs(P0[v * 3 + 2]) - E0.z) < re;
  const free = new Uint8Array(nV);
  for (let v = 0; v < nV; v++) if (share[v] > C.share && share[v] < 0.999 && !inGlobe(v)) free[v] = 1;
  for (let r = 0; r < C.rings; r++) {
    const grow = Uint8Array.from(free);
    for (let t = 0; t < I0.length; t += 3) { const a = I0[t], b = I0[t + 1], c = I0[t + 2]; if (free[a] || free[b] || free[c]) for (const v of [a, b, c]) if (share[v] < 0.999 && !inGlobe(v)) grow[v] = 1; }
    free.set(grow);
  }
  // the skinned surface they slide on (its globe-borne parts left out, so nothing slides onto the rims or the lining)
  const okT = new Uint8Array(nV); for (let v = 0; v < nV; v++) okT[v] = share[v] < 0.999 && !inGlobe(v) ? 1 : 0;
  const grid = vertexGridLocal(posed, 0.01);
  const q = Float32Array.from(posed);
  const lay = (v) => { const c = grid.closest([q[v * 3], q[v * 3 + 1], q[v * 3 + 2]], I0, (u) => okT[u] === 1); if (c) for (let k = 0; k < 3; k++) q[v * 3 + k] += C.layShare * (c.w[0] * posed[c.ids[0] * 3 + k] + c.w[1] * posed[c.ids[1] * 3 + k] + c.w[2] * posed[c.ids[2] * 3 + k] - q[v * 3 + k]); };
  const nb = Array.from({ length: nV }, () => []);
  for (let t = 0; t < I0.length; t += 3) for (const [a, b] of [[I0[t], I0[t + 1]], [I0[t + 1], I0[t + 2]], [I0[t + 2], I0[t]]]) { if (free[a]) nb[a].push(b); if (free[b]) nb[b].push(a); }
  const tmp = new Float32Array(q.length);
  // (C.smooth 'position': B2's, the free skin's positions relaxed toward their neighbours' mean, which also flattens the
  // rest shape's own relief there; 'displacement' (round B3): the displacement from the bind relaxed instead, a harmonic
  // stretch between the eye-borne skin and the still head that keeps the cup's lips and the interorbital groove)
  const disp = C.smooth === 'displacement';
  if (disp) for (let i = 0; i < q.length; i++) q[i] -= P0[i];
  for (let it = 0; it < C.iters; it++) {
    tmp.set(q);
    for (let v = 0; v < nV; v++) { if (!free[v] || !nb[v].length) continue; const a = [0, 0, 0]; for (const u of nb[v]) for (let k = 0; k < 3; k++) a[k] += q[u * 3 + k] / nb[v].length; for (let k = 0; k < 3; k++) tmp[v * 3 + k] = (1 - C.lambda) * q[v * 3 + k] + C.lambda * a[k]; }
    q.set(tmp);
    if (C.layShare && !disp) for (let v = 0; v < nV; v++) if (free[v]) lay(v);
  }
  if (disp) for (let i = 0; i < q.length; i++) q[i] += P0[i];
  const E = new Float32Array(nV * 3), mask = new Float32Array(nV);
  for (let v = 0; v < nV; v++) if (free[v]) { mask[v] = 1; for (let k = 0; k < 3; k++) E[v * 3 + k] = q[v * 3 + k] - P0[v * 3 + k]; }
  const both = solveBindDelta(P0, skin, JOINT_NAMES, W, E, { mask });
  // (split across the midline as the blink is: the left eye's shape on z > 0, smoothly over ±0.03)
  const L = new Float32Array(nV * 3), R = new Float32Array(nV * 3);
  for (let v = 0; v < nV; v++) { const z = P0[v * 3 + 2], tl = 0.5 + 0.5 * (Math.abs(z) < 0.03 ? Math.sin((z / 0.03) * Math.PI / 2) : Math.sign(z)); for (let k = 0; k < 3; k++) { L[v * 3 + k] = both[v * 3 + k] * tl; R[v * 3 + k] = both[v * 3 + k] * (1 - tl); } }
  return { L, R, both, E, mask, pose, stats: { laid: free.reduce((a, b) => a + b, 0) } };
}

/** The pose each posed blend shape is solved for (its world displacement holds there). */
export const MORPH_POSES = {
  gape: { J_jaw: HEAD_POSES.gapeFull.J_jaw, J_imj: HEAD_POSES.gapeFull.J_imj, J_premax: HEAD_POSES.gapeFull.J_premax, J_maxL: HEAD_POSES.gapeFull.J_maxL, J_maxR: HEAD_POSES.gapeFull.J_maxR, J_hyoid: HEAD_POSES.gapeFull.J_hyoid, J_suspL: HEAD_POSES.gapeFull.J_suspL, J_suspR: HEAD_POSES.gapeFull.J_suspR, J_opercL: HEAD_POSES.gapeFull.J_opercL, J_opercR: HEAD_POSES.gapeFull.J_opercR },
  vent: { J_opercL: HEAD_POSES.vent.J_opercL, J_opercR: HEAD_POSES.vent.J_opercR, J_suspL: HEAD_POSES.vent.J_suspL, J_suspR: HEAD_POSES.vent.J_suspR },
  inflate: Object.fromEntries(Object.entries(HEAD_POSES.inflated).filter(([k]) => k.startsWith('J_'))),
  inflateMid: Object.fromEntries(Object.entries(HEAD_POSES.inflatedHalf).filter(([k]) => k.startsWith('J_'))),
  blinkL: { J_eyeL: { t: [0, -BLINK_DROP, 0] } },
  blinkR: { J_eyeR: { t: [0, -BLINK_DROP, 0] } },
  eyesUpL: { J_eyeL: { t: [0, 0.08, 0] } },
  eyesUpR: { J_eyeR: { t: [0, 0.08, 0] } },
};

/**
 * The joints' own share of a posed blend shape's move (round B4, tech P1): for a shape whose pose (MORPH_POSES) only
 * TRANSLATES joints (the eyes' lift and drop: J_eyeL/R carry the cups' rims, the lining and part of the collar), the
 * displacement the skin gets from the joints alone at full weight, per vertex: Σ_j share_j · t_j (HL, fish frame; the
 * joints turn nothing, so the posed surface is bind + Δ + this). A shape's normal deltas must be worked out on that whole
 * move: lod1's eyesUpL/R and its shrink-wrapped blinkL/R took them from bind + Δ alone (build.mjs lighterSkin), which
 * shears across the collar where the eye's share falls from 1 to 0, so the shading turned up to 146° off the posed
 * surface at the land state's lift (black specks and a crumpled rim on the lifted collar, the creased hood in the blink).
 * The hero's shapes take their normals this way already (headMorphs: `full`). null for a shape whose pose turns a joint
 * (its normals need the un-skinning bindNormalDeltas does) or has no pose.
 * @param name a blend shape's name   @param skin { joints, weights } (Uint8 weights /255 or floats)
 * @param jointNames the skin's joint index → name   @param n the vertex count
 * @returns Float32Array(n·3) (HL) | null
 */
export function morphJointMove(name, skin, jointNames, n) {
  const pose = MORPH_POSES[name];
  if (!pose) return null;
  for (const e of Object.values(pose)) for (const [c, v] of Object.entries(e)) if (c !== 't' && v) return null;
  const t = jointNames.map((nm) => pose[nm]?.t ?? null), sc = skin.weights instanceof Uint8Array ? 1 / 255 : 1, out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) for (let q = 0; q < 4; q++) {
    const w = skin.weights[v * 4 + q] * sc, tj = w ? t[skin.joints[v * 4 + q]] : null;
    if (tj) for (let k = 0; k < 3; k++) out[v * 3 + k] += w * tj[k];
  }
  return out;
}

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
  const eyesUp = needs('eyesUpL') || needs('eyesUpR') ? eyesUpTargets(head, skin, K, headSDF, o) : null;
  if (eyesUp) log(`eyes-up corrective (${eyesUp.stats.laid} laid)`);
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
  if (eyesUp) {
    // (the normals follow the whole move: the corrective and the eye joints' share of the lift, split as the positions)
    const iL = JOINT_NAMES.indexOf('J_eyeL'), iR = JOINT_NAMES.indexOf('J_eyeR'), full = Float32Array.from(eyesUp.both), lift = MORPH_POSES.eyesUpL.J_eyeL.t[1];
    for (let v = 0; v < nV; v++) { let es = 0; for (let q = 0; q < 4; q++) { const j = skin.joints[v * 4 + q]; if (j === iL || j === iR) es += skin.weights[v * 4 + q] * (skin.weights instanceof Uint8Array ? 1 / 255 : 1); } full[v * 3 + 1] += lift * es; }
    // (the posed surface's own normals, lightly smoothed, where the shape or the eyes move it and a ring round: the joints
    // only translate, so the posed normal is the bind normal plus the delta)
    const Pf = Float32Array.from(P0, (x, i) => x + full[i]), fnS = smoothField(faceNormals(Pf, I0), I0, 2), mv = new Uint8Array(nV);
    for (let v = 0; v < nV; v++) if (eyesUp.mask[v] > 0) mv[v] = 1;
    for (let r = 0; r < 2; r++) { const g2 = Uint8Array.from(mv); for (let t = 0; t < I0.length; t += 3) if (mv[I0[t]] || mv[I0[t + 1]] || mv[I0[t + 2]]) { g2[I0[t]] = 1; g2[I0[t + 1]] = 1; g2[I0[t + 2]] = 1; } mv.set(g2); }
    const dn = new Float32Array(P0.length);
    for (let v = 0; v < nV; v++) { if (!mv[v]) continue; const l = Math.hypot(fnS[v * 3], fnS[v * 3 + 1], fnS[v * 3 + 2]) || 1; for (let k = 0; k < 3; k++) dn[v * 3 + k] = fnS[v * 3 + k] / l - N0[v * 3 + k]; }
    const nL = new Float32Array(P0.length), nR = new Float32Array(P0.length);
    for (let v = 0; v < nV; v++) { const z = P0[v * 3 + 2], tl = 0.5 + 0.5 * (Math.abs(z) < 0.03 ? Math.sin((z / 0.03) * Math.PI / 2) : Math.sign(z)); for (let k = 0; k < 3; k++) { nL[v * 3 + k] = dn[v * 3 + k] * tl; nR[v * 3 + k] = dn[v * 3 + k] * (1 - tl); } }
    if (needs('eyesUpL')) shapes.eyesUpL = { d: eyesUp.L, n: nL };
    if (needs('eyesUpR')) shapes.eyesUpR = { d: eyesUp.R, n: nR };
  }
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
    for (const nm of ['gape', 'vent', 'blinkL', 'blinkR', 'eyesUpL', 'eyesUpR']) if (shapes[nm]) world[nm] = worldOf(nm, shapes[nm].d);
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
