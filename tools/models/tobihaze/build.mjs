#!/usr/bin/env node
// The トビハゼ model as one GLB per tier (round B1: the clay stage, with its rig, blend shapes and LOD tiers; the
// textures are the next round). The pieces:
//   skin    the whole fish's sculpt (head.mjs + body.mjs) meshed per tier (fishmesh.mjs bodyTierMesh: the hero's full
//           sculpt at h 0.09 mm, lod1's sealed one at 0.16, lod2's far one at 0.40), UV-charted on the body atlas
//   rig     rig.mjs: the 33 hero joints (the head's mechanism, the axial chain, the pectoral arms, the pelvic base), their
//           weight rows on the hero's dense mesh (heroRig), the head's blend shapes solved on its packed skin
//           (headmorphs.mjs); lod1 and lod2 carry both over from the hero's dense mesh by tissue class (transfer.mjs)
//           and re-solve the blend shapes against their own reduced skins (26 and 12 joints)
//   eyes    eyemesh.mjs: one globe mesh under the eye joints (Eye_L, and Eye_R mirrored), merged into the Body at lod2
//   teeth   teeth.mjs: the fitted tooth rows (hero), on J_premax and J_imj
//   fins    fins.mjs: the seven fins with their blend shapes (fold, spread, flex, plant + plantMid); lod2: one card each,
//           merged into one alpha-tested `Fins` mesh
// The hero's dense mesh, its rows and blend shapes are computed once (heroData) and reused by every tier.
//   node tools/models/tobihaze/build.mjs [--tier hero|lod1|lod2|all] [--out <dir>] [--clay] [--cache <file>] [--hero-h <mm>]
// --out defaults to tools/models/tobihaze/out/tiers/ (shipping into src/assets/ is a later round); --cache keeps the
// hero data on disk (a scratch file) so a rebuild of the GLBs skips the hero's meshing, weights and blend-shape solve
// (several minutes); --clay writes clay materials (the only kind this round: without it the build says so and writes
// clay all the same).
//
// Meshes per tier (class M budget, body_contract §6):
//   hero  Head (the skin in front of 1.32 HL but the arms, plus whatever the head's blend shapes move: blinkL, blinkR,
//         throat, gape, gum, vent, inflate, inflateMid), Body (the rest), Eye (nodes Eye_L, Eye_R), Mouth_Teeth, Fin_*
//   lod1  Body (blinkL, blinkR, throat, inflate, inflateMid), Eye, Fin_*
//   lod2  Body (with both eyes), Fins (MASK)
// Materials (clay): Tobihaze_Body (the skin, the eye's skin cap, the teeth by their swatch), Tobihaze_Fin (BLEND,
// double-sided; lod2 Tobihaze_Fins, MASK), Tobihaze_Cornea (the eye's pupil, dark gloss) and Tobihaze_Iris (Cornea)
// (the iris ring under the cornea): the viewer's clay mode keys on those names.
// Units: fish frame mm (s back from the snout, y up from the head's floor, z to the fish's left) to the object frame
// in metres (+X left, +Y dorsal, +Z anterior) by anatomy.toObject / dirToObject (a rotation: windings keep).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLBBuilder } from '../../lib/glb.mjs';
import { vertexNormals, mergeParts, compactIndices } from '../../lib/gobyTiers.mjs';
import { HL, TL, SL, EYE_MM, toObject, dirToObject } from './anatomy.mjs';
import { HEAD_SCULPT, headSDF } from './head.mjs';
import { BODY_SCULPT, trunkProfile } from './body.mjs';
import { morphNormals } from './headrig.mjs';
import { bodyTierMesh, fishDense, tierField, morphAttrs, ready, BODY_LAYOUT, TIERS as MESH_TIERS, rectUVWH } from './fishmesh.mjs';
import { finDefinitions, buildFinMesh, buildFinTargets, finCard, finTierParams } from './fins.mjs';
import { JOINTS, J, NJ, TIER_JOINTS, jointsForTier, heroRig, packTop4, morphSkin, skinForTier, finWeights, teethWeights, axesForTier, partShares, axialRow } from './rig.mjs';
import { headMorphs, solveBindDelta, poseWorldFor, skinWith, MORPH_ORDER, MORPH_DRIVERS, MORPH_DRIVE } from './headmorphs.mjs';
import { vertexGrid, tissueClass, transferRows } from './transfer.mjs';
import { eyeMeshForTier, eyesAtRest, EYE_TIERS } from './eyemesh.mjs';
import { teethMesh } from './teeth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const t0 = Date.now();
const logDefault = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${m}`);

/** Per tier: the skin's mesh tier (fishmesh TIERS), the eye's rings, the fins' mesh options, the teeth, the blend
 * shapes and the mesh that carries them. */
export const TIERS = {
  hero: { mesh: 'hero', eye: EYE_TIERS.hero, fins: 'hero', teeth: true, morphs: MORPH_ORDER, morphMesh: 'Head' },
  lod1: { mesh: 'lod1', eye: EYE_TIERS.lod1, fins: 'lod1', teeth: false, morphs: ['blinkL', 'blinkR', 'throat', 'inflate', 'inflateMid'], morphMesh: 'Body' },
  lod2: { mesh: 'lod2', eye: EYE_TIERS.lod2, fins: 'card', teeth: false, morphs: [], merged: true },
};
const P = 'Tobihaze';
/** The hero blend shapes the simplifier keeps vertices for (fishmesh.morphAttrs: 6 × 3 floats; 23 with normal and uv). */
const HERO_ATTR_MORPHS = ['blinkL', 'blinkR', 'gape', 'vent', 'inflate', 'throat'];
/** lod1's: the blink and the inflation (the design §3.3). */
const LOD1_ATTR_MORPHS = ['blinkL', 'blinkR', 'inflate'];
/** The fins' blend shapes' drivers (fins.mjs): fold and spread are opposite (drive one at a time). */
const FIN_DRIVERS = {
  fold: 'w: the fin folded (median fins down along the back / belly, the caudal closed into its spear, the pectoral fan closed, the pelvic laid back); drive fold or spread, not both',
  spread: 'w: the fin erect / its fan fully open (fold or spread, not both)',
  flex: 'caudal: w > 0 bends the fin\'s rear to the fish\'s left (+X), w < 0 to the right',
  plant: 'pectoral: w, the blade flexed at the wrist and laid flat across the lobe\'s end (on the ground when the lobe stands as a leg)',
  plantMid: 'pectoral: 4·w·(1 − w) of plant (keeps the rays their length half way)',
};

// ------------------------------------------------------------------------------------------------ frames
const posToObject = (p) => {
  const n = p.length / 3, o = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) o.set(toObject([p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]), i * 3);
  return o;
};
const dirsToObject = (d, stride = 3) => {
  const n = d.length / stride, o = new Float32Array(d.length);
  for (let i = 0; i < n; i++) {
    const v = dirToObject([d[i * stride], d[i * stride + 1], d[i * stride + 2]]);
    o[i * stride] = v[0]; o[i * stride + 1] = v[1]; o[i * stride + 2] = v[2];
    if (stride === 4) o[i * 4 + 3] = d[i * 4 + 3];
  }
  return o;
};
/** fish-frame mm displacements → object-frame metres */
const deltasToObject = (d) => { const o = dirsToObject(d); for (let i = 0; i < o.length; i++) o[i] *= 0.001; return o; };

/** The skeleton in the object frame: world pivots and local translations (bind rotation identity). */
function skeleton(joints) {
  const obj = joints.map((j) => toObject(j.at));
  const idx = Object.fromEntries(joints.map((j, i) => [j.name, i]));
  return joints.map((j, i) => {
    const p = j.parent ? obj[idx[j.parent]] : [0, 0, 0];
    return { name: j.name, parent: j.parent, at: j.at, obj: obj[i], local: [obj[i][0] - p[0], obj[i][1] - p[1], obj[i][2] - p[2]], parentIndex: j.parent ? idx[j.parent] : -1 };
  });
}

/** The joints as nodes and the skin: { skin, jointNodes, rootJoint }. */
function addSkeleton(gb, sk) {
  const nodes = sk.map((j) => gb.addNode({ name: j.name, translation: j.local }));
  sk.forEach((j, i) => {
    const kids = sk.map((c, k) => (c.parentIndex === i ? nodes[k] : -1)).filter((k) => k >= 0);
    if (kids.length) gb.json.nodes[nodes[i]].children = kids;
  });
  const ibm = new Float32Array(sk.length * 16);
  sk.forEach((j, i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.obj[0], -j.obj[1], -j.obj[2], 1], i * 16));
  const acc = gb.addAccessor(ibm, 'MAT4');
  const rootIndex = sk.findIndex((j) => j.parentIndex < 0);
  const skin = gb.addSkin({ name: `${P}_Rig`, joints: nodes, inverseBindMatrices: acc, skeleton: nodes[rootIndex] });
  return { skin, jointNodes: nodes, rootJoint: nodes[rootIndex] };
}

// ------------------------------------------------------------------------------------------------ materials
/** The clay materials (body_contract §7). hero and lod1 the same set (Body, Fin, Cornea, Iris); lod2 Body and Fins. */
function clayMaterials(gb, tier) {
  const lod2 = tier === 'lod2';
  const body = gb.addMaterial({ name: `${P}_Body`, pbrMetallicRoughness: { baseColorFactor: [0.72, 0.70, 0.66, 1], metallicFactor: 0, roughnessFactor: 0.6 }, extras: { tobihaze: { role: 'body', layout: BODY_LAYOUT } } });
  const fin = gb.addMaterial({
    name: lod2 ? `${P}_Fins` : `${P}_Fin`, doubleSided: true,
    alphaMode: lod2 ? 'MASK' : 'BLEND', ...(lod2 ? { alphaCutoff: 0.5 } : {}),
    pbrMetallicRoughness: { baseColorFactor: [0.74, 0.68, 0.58, lod2 ? 1 : 0.75], metallicFactor: 0, roughnessFactor: 0.5 },
    extras: { tobihaze: { role: 'fin', ...(lod2 ? { merged: true } : {}) } },
  });
  if (lod2) return { body, fin };
  const eyeX = { role: 'eye', radiusMM: +EYE_MM.radius.toFixed(4), irisRect: rectUVWH(BODY_LAYOUT.iris), skinRect: rectUVWH(BODY_LAYOUT.eyeSkin) };
  const cornea = gb.addMaterial({ name: `${P}_Cornea`, pbrMetallicRoughness: { baseColorFactor: [0.08, 0.09, 0.08, 1], metallicFactor: 0, roughnessFactor: 0.12 }, extras: { tobihaze: { ...eyeX, part: 'pupil' } } });
  const iris = gb.addMaterial({ name: `${P}_Iris (Cornea)`, pbrMetallicRoughness: { baseColorFactor: [0.52, 0.40, 0.17, 1], metallicFactor: 0, roughnessFactor: 0.12 }, extras: { tobihaze: { ...eyeX, part: 'iris' } } });
  return { body, fin, cornea, iris };
}

const skinAttrs = (w) => ({ JOINTS_0: { array: w.joints, type: 'VEC4' }, WEIGHTS_0: { array: w.weights, type: 'VEC4', normalized: true } });

/** A mesh's sub-mesh of the triangles `keep` accepts, every per-vertex array in `keys` (stride from the length) carried. */
function subMesh(mesh, keep, keys) {
  const I = mesh.indices, nv = mesh.position.length / 3, remap = new Int32Array(nv).fill(-1), tris = [];
  let m = 0;
  for (let t = 0; t < I.length / 3; t++) {
    if (!keep(t)) continue;
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; if (remap[v] < 0) remap[v] = m++; tris.push(remap[v]); }
  }
  const map = new Uint32Array(m);
  for (let v = 0; v < nv; v++) if (remap[v] >= 0) map[remap[v]] = v;
  const out = { indices: Uint32Array.from(tris), map };
  for (const k of keys) {
    const a = mesh[k]; if (!a) continue;
    const c = a.length / nv, b = new a.constructor(m * c);
    for (let j = 0; j < m; j++) for (let q = 0; q < c; q++) b[j * c + q] = a[map[j] * c + q];
    out[k] = b;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the hero's data
/** Typed arrays and a JSON part to and from one file (the --cache of the hero's data). */
function saveCache(file, arrays, json) {
  const head = { json, arrays: {} }, bufs = [];
  let at = 0;
  for (const [k, a] of Object.entries(arrays)) {
    head.arrays[k] = { type: a.constructor.name, length: a.length, at };
    const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength); bufs.push(b); at += b.length;
    const pad = (8 - (at % 8)) % 8; if (pad) { bufs.push(Buffer.alloc(pad)); at += pad; }
  }
  const hj = Buffer.from(JSON.stringify(head)), hl = Buffer.alloc(4); hl.writeUInt32LE(hj.length);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([hl, hj, ...bufs]));
}
function loadCache(file) {
  const b = fs.readFileSync(file), hl = b.readUInt32LE(0), head = JSON.parse(b.subarray(4, 4 + hl).toString());
  const base = 4 + hl, C = { Float32Array, Float64Array, Uint32Array, Int32Array, Int16Array, Uint16Array, Uint8Array, Int8Array };
  const arrays = {};
  for (const [k, d] of Object.entries(head.arrays)) {
    const T = C[d.type], start = base + d.at;
    arrays[k] = new T(b.buffer.slice(b.byteOffset + start, b.byteOffset + start + d.length * T.BYTES_PER_ELEMENT));
  }
  return { arrays, json: head.json };
}
const TIER_KEYS = ['position', 'normal', 'tangent', 'uv', 'indices', 'chart', 'source', 'region', 'triChart'];

/**
 * Everything every tier takes from the hero (computed once): the hero's dense skin (fishmesh.fishDense of the full
 * sculpt at h 0.09 mm), its weight rows (rig.heroRig) and packed skin, the head's blend shapes on the packed skin
 * (headmorphs.headMorphs with rig.morphSkin's override: the arm and the pelvic base kept at J_head and off the balloon)
 * scattered onto the dense mesh (mm), their world displacements for the lighter tiers' re-solve, the hero's tier mesh
 * (simplified with the morphs' displacements as attributes), the tissue classes and a grid for the transfer.
 * @param o { log, cache: file (read when it exists, else written), h: the dense cell in mm (default the hero's 0.09; a
 *   coarser one only to try the build quickly: the head rig's tunables are per hop, validated at 0.09) }
 */
export async function heroData({ log = logDefault, cache = null, h = null } = {}) {
  await ready;
  const field = tierField('hero'), fish = field.hl;
  const headField = headSDF(HEAD_SCULPT, { cut: false });
  if (cache && fs.existsSync(cache)) {
    const { arrays: A, json } = loadCache(cache);
    log(`hero data from ${path.relative(root, cache)}`);
    const dense = { position: A.densePosition, normal: A.denseNormal, indices: A.denseIndices, source: A.denseSource, stats: json.denseStats };
    const tier = Object.fromEntries(TIER_KEYS.map((k) => [k, A[`tier_${k}`]]));
    tier.charts = json.charts; tier.stats = json.tierStats; tier.dense = dense;
    const D = {}, DN = {}, W = {};
    for (const k of json.names) { D[k] = A[`D_${k}`]; DN[k] = A[`DN_${k}`]; }
    for (const [k, w] of Object.entries(json.world)) W[k] = { ...w, E: A[`E_${k}`], support: A[`S_${k}`] };
    const rig = { rows: A.rows, m: A.m, mp: A.mp, nJ: NJ, teeth: json.teeth, headField };
    return { dense, fish, field, rig, packed: { joints: A.packedJ, weights: A.packedW }, names: json.names, drivers: json.drivers, D, DN, W, tier, cls: A.cls, grid: vertexGrid(dense.position, 0.2), teeth: json.teeth };
  }
  const T = MESH_TIERS.hero;
  const dense = fishDense({ h: h ?? T.h, field, log });
  const nD = dense.position.length / 3;
  const rig = heroRig(dense, fish, { log, headField });
  const packed = packTop4(rig.rows);
  const ms = morphSkin(rig, packed);
  log('head blend shapes …');
  const M = await headMorphs(rig.headSub, ms.skin, { K: HEAD_SCULPT, headSDF, headField: rig.headField, teeth: rig.teeth, inflateScale: ms.inflateScale, log });
  // the blend shapes on the dense mesh (mm; normal deltas unitless), zero off the head's submesh
  const ids = rig.headSub.ids, D = {}, DN = {}, W = {};
  for (const k of M.names) {
    const d = new Float32Array(nD * 3), dn = new Float32Array(nD * 3);
    for (let i = 0; i < ids.length; i++) for (let c = 0; c < 3; c++) { d[ids[i] * 3 + c] = M.d[k][i * 3 + c] * HL; dn[ids[i] * 3 + c] = M.n[k][i * 3 + c]; }
    D[k] = d; DN[k] = dn;
  }
  for (const [k, w] of Object.entries(M.world)) {
    const E = new Float32Array(nD * 3), S = new Uint8Array(nD);
    for (let i = 0; i < ids.length; i++) { for (let c = 0; c < 3; c++) E[ids[i] * 3 + c] = w.E[i * 3 + c] * HL; S[ids[i]] = w.support[i]; }
    W[k] = { pose: w.pose, base: w.base ?? null, E, support: S };
  }
  log(`blend shapes on the dense mesh: ${M.names.join(', ')}`);
  const tier = bodyTierMesh('hero', { dense, extraAttrs: morphAttrs(HERO_ATTR_MORPHS.map((k) => D[k])), log });
  // the tissue classes of the dense vertices (transfer.mjs: the rule the tiers' vertices use too)
  const cls = new Uint8Array(nD);
  for (let v = 0; v < nD; v++) cls[v] = tissueClass([dense.position[v * 3], dense.position[v * 3 + 1], dense.position[v * 3 + 2]], { fish, m: rig.m[v], mp: rig.mp[v] });
  log('tissue classes');
  const out = { dense, fish, field, rig, packed, names: M.names, drivers: M.drivers, D, DN, W, tier, cls, grid: vertexGrid(dense.position, 0.2), teeth: rig.teeth };
  if (cache) {
    const arrays = {
      densePosition: dense.position, denseNormal: dense.normal, denseIndices: dense.indices, denseSource: dense.source,
      rows: rig.rows, m: rig.m, mp: rig.mp, packedJ: packed.joints, packedW: packed.weights, cls,
      ...Object.fromEntries(TIER_KEYS.filter((k) => tier[k]).map((k) => [`tier_${k}`, tier[k]])),
      ...Object.fromEntries(M.names.flatMap((k) => [[`D_${k}`, D[k]], [`DN_${k}`, DN[k]]])),
      ...Object.fromEntries(Object.entries(W).flatMap(([k, w]) => [[`E_${k}`, w.E], [`S_${k}`, w.support]])),
    };
    const json = {
      names: M.names, drivers: M.drivers, teeth: rig.teeth, denseStats: dense.stats,
      world: Object.fromEntries(Object.entries(W).map(([k, w]) => [k, { pose: w.pose, base: w.base }])),
      charts: tier.charts.map((c) => ({ name: c.name, rect: c.rect })), tierStats: tier.stats,
    };
    saveCache(cache, arrays, json);
    log(`hero data cached in ${path.relative(root, cache)}`);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ lighter tiers' skin
/**
 * A lighter tier's skin mesh with its rig data carried over from the hero's dense mesh (design §4.5, §5.2): the tier's
 * dense mesh (its sealed or far sculpt), lod1 simplified with the hero's blink and inflation displacements carried to
 * it as attributes; the rows by tissue class, packed and reduced to the tier's joints; lod1's blend shapes re-solved:
 * each world displacement carried over and solved against the tier's own skin at its pose (inflateMid less 0.5 ×
 * inflate's), the throat's bind displacement carried as it is; their normals by morphNormals on the tier mesh (welded
 * across the chart seams by the dense vertex).
 */
export function lighterSkin(tierName, H, log = logDefault) {
  const TB = TIERS[tierName], T = MESH_TIERS[TB.mesh];
  const field = tierField(TB.mesh), shares = partShares(H.fish);
  const dense = fishDense({ h: T.h, field, log });
  const nD = dense.position.length / 3;
  const dcls = new Uint8Array(nD);
  for (let v = 0; v < nD; v++) dcls[v] = tissueClass([dense.position[v * 3], dense.position[v * 3 + 1], dense.position[v * 3 + 2]], { fish: H.fish, shares });
  const src = { position: H.dense.position, normal: H.dense.normal, cls: H.cls };
  let extraAttrs;
  if (TB.morphs.length) {
    // (the hero's bind displacements as the simplifier's attributes: where the tier's blink and inflation will move)
    const k = LOD1_ATTR_MORPHS.length * 3, rows = new Float32Array((H.dense.position.length / 3) * k);
    LOD1_ATTR_MORPHS.forEach((nm, j) => { const d = H.D[nm]; for (let v = 0; v < d.length / 3; v++) for (let c = 0; c < 3; c++) rows[v * k + j * 3 + c] = d[v * 3 + c]; });
    const t = transferRows({ ...src, rows, J: k }, { position: dense.position, normal: dense.normal, cls: dcls }, { grid: H.grid, normal: true });
    extraAttrs = morphAttrs(LOD1_ATTR_MORPHS.map((_, j) => { const d = new Float32Array(nD * 3); for (let v = 0; v < nD; v++) for (let c = 0; c < 3; c++) d[v * 3 + c] = t[v * k + j * 3 + c]; return d; }));
    log(`${tierName}: the hero's ${LOD1_ATTR_MORPHS.join(', ')} carried to the dense mesh`);
  }
  const tier = bodyTierMesh(TB.mesh, { dense, extraAttrs, log });
  const n = tier.position.length / 3, cls = new Uint8Array(n);
  for (let v = 0; v < n; v++) cls[v] = dcls[tier.source[v]];
  const dst = { position: tier.position, normal: tier.normal, cls };
  const rows = transferRows({ ...src, rows: H.rig.rows, J: NJ }, dst, { grid: H.grid, normal: true });
  const skin = skinForTier(packTop4(rows), tierName);
  log(`${tierName}: rows carried over, ${TIER_JOINTS[tierName].length} joints`);
  const morphs = { names: [], d: {}, n: {} };
  if (TB.morphs.length) {
    const names = TIER_JOINTS[tierName];
    // (a vector field carried over: three components as a row)
    const carry = (data) => transferRows({ ...src, rows: data, J: 3 }, dst, { grid: H.grid, normal: true });
    const posHL = Float32Array.from(tier.position, (x) => x / HL);
    const solved = {};
    for (const nm of TB.morphs) {
      let d;
      if (H.W[nm]) {
        // (the support is one value a vertex: carried as a row of one)
        const w = H.W[nm], E = carry(w.E), S = transferRows({ ...src, rows: Float32Array.from(w.support), J: 1 }, dst, { grid: H.grid, normal: true });
        const mask = new Float32Array(n); for (let v = 0; v < n; v++) mask[v] = S[v] > 0.5 ? 1 : 0;
        for (let i = 0; i < E.length; i++) E[i] /= HL;
        const Wp = poseWorldFor(w.pose, names);
        d = solveBindDelta(posHL, skin, names, Wp, E, { mask });
        // (the solve's residual: the posed skin against the carried world displacement, where the shape acts)
        { const q = Float32Array.from(posHL, (x, i) => x + d[i]), S2 = skinWith(q, skin, names, Wp); let r = 0; for (let v = 0; v < n; v++) if (mask[v]) for (let c = 0; c < 3; c++) r = Math.max(r, Math.abs(S2[v * 3 + c] - posHL[v * 3 + c] - E[v * 3 + c])); morphs.residual = { ...(morphs.residual ?? {}), [nm]: r }; }
        if (w.base && solved[w.base.name]) for (let i = 0; i < d.length; i++) d[i] -= w.base.w * solved[w.base.name][i];
        solved[nm] = Float32Array.from(d);
        for (let i = 0; i < d.length; i++) d[i] *= HL;
      } else {
        d = carry(H.D[nm]);
      }
      morphs.d[nm] = d;
    }
    // the normals' deltas on the tier mesh welded by the dense vertex (HL positions and displacements)
    const weld = new Map(), wid = new Uint32Array(n);
    for (let v = 0; v < n; v++) { let j = weld.get(tier.source[v]); if (j === undefined) { j = weld.size; weld.set(tier.source[v], j); } wid[v] = j; }
    const nw = weld.size, WP = new Float32Array(nw * 3), WN = new Float32Array(nw * 3), WI = Uint32Array.from(tier.indices, (i) => wid[i]);
    for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) { WP[wid[v] * 3 + c] = tier.position[v * 3 + c] / HL; WN[wid[v] * 3 + c] = tier.normal[v * 3 + c]; }
    for (const nm of TB.morphs) {
      const WD = new Float32Array(nw * 3);
      for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) WD[wid[v] * 3 + c] = morphs.d[nm][v * 3 + c] / HL;
      const dn = morphNormals(WP, WN, WI, WD, { smooth: 2 });
      morphs.n[nm] = Float32Array.from({ length: n * 3 }, (_, i) => dn[wid[(i / 3) | 0] * 3 + (i % 3)]);
    }
    morphs.names = TB.morphs.slice();
    log(`${tierName}: blend shapes ${morphs.names.join(', ')} re-solved on the tier's skin (residual max ${Object.entries(morphs.residual ?? {}).map(([k, r]) => `${k} ${r.toExponential(1)}`).join(', ')} HL)`);
  }
  return { tier, skin, cls, morphs };
}

// ------------------------------------------------------------------------------------------------ extras
/** Boxes for the viewer's framing (object frame) from fish-frame boxes in HL. */
function regionBox(s0, s1, y0, y1, z0, z1) {
  const a = toObject([s0 * HL, y0 * HL, z0 * HL]), b = toObject([s1 * HL, y1 * HL, z1 * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])].map((v) => +v.toFixed(5)), [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])].map((v) => +v.toFixed(5))];
}
function boundsOf(list) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const P of list) for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  return [lo.map((v) => +v.toFixed(5)), hi.map((v) => +v.toFixed(5))];
}

/**
 * The ground contacts for the runtime (fish mm and object m; the bone each rides, the tier's kept joint): the chin
 * under the lower jaw, the pelvic fins' lowest point, the belly under each axial bone, the peduncle's and the caudal
 * fin's lowest points, and the pectoral feet (the wrist's underside and the blade's middle).
 */
function contactsFor(skinMesh, finMeshes, keep) {
  const prof = trunkProfile(BODY_SCULPT), Pm = skinMesh.position, out = [];
  // (the lowest point of a point set among those `sel` (s, y, z in HL) admits)
  const lowestOf = (A, sel) => {
    let best = null;
    for (let v = 0; v < A.length / 3; v++) { const s = A[v * 3] / HL, y = A[v * 3 + 1] / HL, z = A[v * 3 + 2] / HL; if (sel && !sel(s, y, z)) continue; if (!best || A[v * 3 + 1] < best[1]) best = [A[v * 3], A[v * 3 + 1], A[v * 3 + 2]]; }
    return best;
  };
  const lowest = (sel) => lowestOf(Pm, sel);
  const par = Object.fromEntries(JOINTS.map((j) => [j.name, j.parent]));
  const kept = (name) => { let k = name; while (k && !keep.has(k)) k = par[k]; return k; };
  const add = (name, bone, p, kind) => { if (!p) return; out.push({ name, kind, bone: kept(bone), heroBone: bone, mm: p.map((c) => +c.toFixed(3)), obj: toObject(p).map((c) => +c.toFixed(6)) }); };
  add('chin', 'J_jaw', lowest((s, y, z) => s > 0.15 && s < 0.45 && Math.abs(z) < 0.08), 'skin');
  add('throat', 'J_hyoid', lowest((s, y, z) => s > 0.6 && s < 0.9 && Math.abs(z) < 0.08), 'skin');
  if (finMeshes.Fin_Pelvic) add('pelvic', 'J_pelvic', lowestOf(finMeshes.Fin_Pelvic), 'fin');
  const row = new Float32Array(NJ);
  for (const s0 of [1.5, 1.8, 2.1, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9]) {
    row.fill(0); axialRow(s0, row, 1);
    let jb = 0; for (let k = 1; k < NJ; k++) if (row[k] > row[jb]) jb = k;
    add(`belly${s0.toFixed(1)}`, JOINTS[jb].name, lowest((s, y, z) => Math.abs(s - s0) < 0.04 && Math.abs(z) < 0.1) ?? [s0 * HL, prof.at(s0).yB * HL, 0], 'skin');
  }
  add('peduncle', 'J_caudal', lowest((s, y, z) => Math.abs(s - BODY_SCULPT.caudalBase) < 0.04 && Math.abs(z) < 0.1), 'skin');
  if (finMeshes.Fin_Caudal) add('caudalFin', 'J_caudal2', lowestOf(finMeshes.Fin_Caudal), 'fin');
  // the pectoral feet: the lowest skin round the wrist (the lobe's end the blade turns on) and the blade's pivot
  const w = BODY_SCULPT.pectoral.wrist, r = BODY_SCULPT.pectoral.radius[2] + 0.04;
  for (const [S, sd] of [['L', 1], ['R', -1]]) {
    add(`foot${S}`, `J_pecWrist${S}`, lowest((s, y, z) => Math.hypot(s - w[0], y - w[1], z - sd * w[2]) < r), 'wrist');
    add(`blade${S}`, `J_pecBlade${S}`, JOINTS[J[`J_pecBlade${S}`]].at, 'blade');
  }
  return out;
}

/** The runtime axes for a tier (rig.axesForTier), with lod1's jaw clamped: lod1's sealed skin has no slit, so a wide
 * gape stretches the closed lips (the integration design §10: clamp the jaw at lod1, to 30°). */
function tierAxes(tierName) {
  const axes = structuredClone(axesForTier(tierName));
  const jaw = axes.joints?.J_jaw?.channels?.angle;
  if (tierName === 'lod1' && jaw) { jaw.range = [jaw.range[0], Math.min(jaw.range[1], 30)]; jaw.note = 'lod1: clamped to 30° (the sealed skin has no slit; the gape and gum shapes are hero only)'; }
  // (lod1's sealed cup lies inside the globe, so its blink hood has no lining to close over the globe's top as the
  // hero's does: the globe node dropped a further 0.03 HL at a full blink keeps it under the coarser hood; the window
  // shows through the lower lid beyond 0.05)
  if (tierName === 'lod1' && axes.eyes) for (const S of ['L', 'R']) if (axes.eyes[S]) { axes.eyes[S].blinkGlobeExtraDropM = +(0.03 * HL * 0.001).toFixed(6); axes.eyes[S].blinkGlobeExtraDropNote = 'lod1: translate the Eye node (not the joint) down by this × the blink weight'; }
  return axes;
}

// ------------------------------------------------------------------------------------------------ the tier
/**
 * One tier's GLB.
 * @param tierName 'hero' | 'lod1' | 'lod2'
 * @param o { outFile, clay, hero (heroData's result: shared by the tiers), log }
 * @returns { tris, joints, materials, images, meshes: { name: tris }, file, bytes }
 */
export async function buildTier(tierName, { outFile, clay = true, hero, log = logDefault } = {}) {
  await ready;
  const TB = TIERS[tierName];
  if (!TB) throw new Error(`buildTier: unknown tier ${tierName}`);
  const H = hero ?? await heroData({ log });
  const lod2 = tierName === 'lod2';
  const gb = new GLBBuilder('tobihaze-builder');
  const { joints: kept, remap } = jointsForTier(tierName);
  const sk = skeleton(kept);
  const keep = new Set(kept.map((j) => j.name));
  const { skin, jointNodes, rootJoint } = addSkeleton(gb, sk);
  const jIndex = Object.fromEntries(sk.map((j, i) => [j.name, i]));
  const mats = clayMaterials(gb, tierName);
  const sceneNodes = [], meshTris = {};
  const toTier = (w) => (tierName === 'hero' ? w : skinForTier(w, tierName));
  const addMeshNode = (name, prims, extras, nodeExtras, { weights = null } = {}) => {
    const mesh = gb.addMesh(name, prims, extras);
    if (weights) gb.json.meshes[mesh].weights = weights;
    const node = gb.addNode({ name, mesh, skin, ...(nodeExtras ? { extras: nodeExtras } : {}) });
    sceneNodes.push(node);
    meshTris[name] = prims.reduce((a, p) => a + gb.json.accessors[p.indices].count / 3, 0);
    return node;
  };

  // ---- the skin
  let body, bodySkin, morph = null;
  if (tierName === 'hero') {
    body = H.tier;
    const n = body.position.length / 3, joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
    for (let v = 0; v < n; v++) { const s = body.source[v]; joints.set(H.packed.joints.subarray(s * 4, s * 4 + 4), v * 4); weights.set(H.packed.weights.subarray(s * 4, s * 4 + 4), v * 4); }
    bodySkin = { joints, weights };
    morph = { names: TB.morphs.slice(), d: {}, n: {} };
    for (const nm of TB.morphs) {
      const d = new Float32Array(n * 3), dn = new Float32Array(n * 3), D = H.D[nm], DN = H.DN[nm];
      for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) { d[v * 3 + c] = D[body.source[v] * 3 + c]; dn[v * 3 + c] = DN[body.source[v] * 3 + c]; }
      morph.d[nm] = d; morph.n[nm] = dn;
    }
  } else {
    const L = lighterSkin(tierName, H, log);
    body = L.tier; bodySkin = L.skin; morph = L.morphs.names.length ? L.morphs : null;
  }
  const bodyAttrs = (sm, w) => ({
    position: posToObject(sm.position), normal: dirsToObject(sm.normal), tangent: lod2 || !sm.tangent ? null : dirsToObject(sm.tangent, 4), uv: sm.uv,
    indices: compactIndices(sm.indices, sm.position.length / 3), material: mats.body, extraAttributes: skinAttrs(w),
  });
  const pick = (w, map) => { const j = new Uint8Array(map.length * 4), ww = new Uint8Array(map.length * 4); map.forEach((v, i) => { j.set(w.joints.subarray(v * 4, v * 4 + 4), i * 4); ww.set(w.weights.subarray(v * 4, v * 4 + 4), i * 4); }); return { joints: j, weights: ww }; };
  const morphExtras = (names) => ({ targetNames: names, drivers: Object.fromEntries(names.map((k) => [k, MORPH_DRIVERS[k]])), drive: Object.fromEntries(names.map((k) => [k, MORPH_DRIVE[k]])) });
  const keys = ['position', 'normal', 'tangent', 'uv'];
  let morphMeshName = null, headSplit = null;
  if (tierName === 'hero') {
    // Head: the head region (fishmesh: centroid in front of 1.32 HL, the arms excluded) and every triangle that
    // touches a vertex the head's blend shapes move (position or normal), so the Body's vertices on their border all
    // stay still in every shape and the two meshes never part
    const n = body.position.length / 3, moves = new Uint8Array(n);
    for (const nm of morph.names) { const d = morph.d[nm], dn = morph.n[nm]; for (let v = 0; v < n; v++) if (Math.abs(d[v * 3]) + Math.abs(d[v * 3 + 1]) + Math.abs(d[v * 3 + 2]) > 0 || Math.abs(dn[v * 3]) + Math.abs(dn[v * 3 + 1]) + Math.abs(dn[v * 3 + 2]) > 1e-6) moves[v] = 1; }
    const I = body.indices;
    const inHead = (t) => body.region[t] === 0 || moves[I[t * 3]] || moves[I[t * 3 + 1]] || moves[I[t * 3 + 2]];
    let grown = 0; for (let t = 0; t < I.length / 3; t++) if (body.region[t] !== 0 && inHead(t)) grown++;
    const hm = subMesh(body, inHead, keys), bm = subMesh(body, (t) => !inHead(t), keys);
    const hw = pick(bodySkin, hm.map), bw = pick(bodySkin, bm.map);
    const targets = morph.names.map((k) => deltasToObject(Float32Array.from({ length: hm.map.length * 3 }, (_, i) => morph.d[k][hm.map[(i / 3) | 0] * 3 + (i % 3)])));
    const normalTargets = morph.names.map((k) => dirsToObject(Float32Array.from({ length: hm.map.length * 3 }, (_, i) => morph.n[k][hm.map[(i / 3) | 0] * 3 + (i % 3)])));
    addMeshNode('Head', [gb.primitive({ ...bodyAttrs(hm, hw), targets, normalTargets })], { ...morphExtras(morph.names), tobihaze: { part: 'head' } }, { tobihaze: { part: 'head' } }, { weights: morph.names.map(() => 0) });
    addMeshNode('Body', [gb.primitive(bodyAttrs(bm, bw))], { tobihaze: { part: 'body' } }, { tobihaze: { part: 'body' } });
    morphMeshName = 'Head';
    headSplit = { head: hm.indices.length / 3, body: bm.indices.length / 3, grownIntoHead: grown };
    log(`hero skin: Head ${hm.indices.length / 3} + Body ${bm.indices.length / 3} triangles (${grown} trunk/arm triangles in the Head: the blend shapes reach them)`);
  } else if (!lod2) {
    const targets = morph.names.map((k) => deltasToObject(morph.d[k])), normalTargets = morph.names.map((k) => dirsToObject(morph.n[k]));
    addMeshNode('Body', [gb.primitive({ ...bodyAttrs(body, bodySkin), targets, normalTargets })], { ...morphExtras(morph.names), tobihaze: { part: 'body' } }, { tobihaze: { part: 'body' } }, { weights: morph.names.map(() => 0) });
    morphMeshName = 'Body';
  }

  // ---- the eyes
  if (!lod2) {
    const e = eyeMeshForTier(TB.eye);
    const prims = [[e.parts.skin, mats.body], [e.parts.pupil, mats.cornea], [e.parts.iris, mats.iris]]
      .filter(([p]) => p.indices.length)
      .map(([p, m]) => gb.primitive({ position: p.position, normal: p.normal, uv: p.uv, indices: compactIndices(p.indices, p.position.length / 3), material: m }));
    const mesh = gb.addMesh('Eye', prims, { tobihaze: { part: 'eye' } });
    meshTris.Eye = e.triangles;
    for (const S of ['L', 'R']) {
      const node = gb.addNode({ name: `Eye_${S}`, mesh, ...(S === 'R' ? { scale: [-1, 1, 1] } : {}), extras: { tobihaze: { eye: S, ...(S === 'R' ? { mirrored: true } : {}) } } });
      const jn = gb.json.nodes[jointNodes[jIndex[`J_eye${S}`]]];
      jn.children = [...(jn.children ?? []), node];
    }
  }

  // ---- the teeth (hero)
  if (TB.teeth) {
    const tm = teethMesh(H.teeth);
    const n = tm.position.length / 3, joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
    const jP = teethWeights('premax', 1).joints[0], jD = teethWeights('dentary', 1).joints[0];
    for (let v = 0; v < n; v++) { joints[v * 4] = tm.group[v] === 0 ? jP : jD; weights[v * 4] = 255; }
    addMeshNode('Mouth_Teeth', [gb.primitive({ position: posToObject(tm.position), normal: dirsToObject(tm.normal), uv: tm.uv, indices: compactIndices(tm.indices, n), material: mats.body, extraAttributes: skinAttrs(toTier({ joints, weights })) })], { tobihaze: { part: 'teeth' } }, { tobihaze: { part: 'teeth' } });
  }

  // ---- the fins
  const defs = finDefinitions(BODY_SCULPT);
  const body0 = { position: H.dense.position, indices: H.dense.indices, rows: H.rig.rows, grid: H.grid };
  const finMorphs = {}, finBind = {};
  const lod2Parts = [];
  if (lod2) {
    // the eyes at rest, into the Body (its material; J_head)
    const eyes = eyesAtRest(TB.eye), jh = jIndex.J_head;
    const parts = [{ position: posToObject(body.position), normal: dirsToObject(body.normal), uv: body.uv, indices: body.indices, joints: bodySkin.joints, weights: bodySkin.weights }];
    for (const e of eyes) {
      const n = e.position.length / 3, joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
      for (let v = 0; v < n; v++) { joints[v * 4] = jh; weights[v * 4] = 255; }
      parts.push({ ...e, joints, weights });
    }
    const mg = mergeParts(parts);
    addMeshNode('Body', [gb.primitive({ position: mg.position, normal: mg.normal, uv: mg.uv, indices: mg.indices, material: mats.body, extraAttributes: skinAttrs(mg) })], { tobihaze: { part: 'body', eyes: 'merged' } }, { tobihaze: { part: 'body' } });
    meshTris.Body_skin = body.indices.length / 3; meshTris.Body_eyes = eyes.reduce((a, e) => a + e.indices.length / 3, 0);
    for (const def of defs) {
      const c = finCard(def);
      const w = toTier(finWeights(def, c, { body: body0 }));
      finBind[def.name] = c.position;
      lod2Parts.push({ position: posToObject(c.position), normal: dirsToObject(c.normal ?? vertexNormals(c.position, c.indices)), uv: c.uv, indices: c.indices, joints: w.joints, weights: w.weights });
    }
    const mf = mergeParts(lod2Parts);
    addMeshNode('Fins', [gb.primitive({ position: mf.position, normal: mf.normal, uv: mf.uv, indices: mf.indices, material: mats.fin, extraAttributes: skinAttrs(mf) })], { tobihaze: { part: 'fins', merged: true, fins: defs.map((d) => d.name) } }, { tobihaze: { fin: 'merged' } });
  } else {
    const TP = finTierParams(TB.fins);
    for (const def of defs) {
      const m = buildFinMesh(def, TP[def.name]);
      const tg = buildFinTargets(def, m);
      const w = toTier(finWeights(def, m, { body: body0 }));
      finBind[def.name] = m.position;
      const prim = gb.primitive({
        position: posToObject(m.position), normal: dirsToObject(m.normal), uv: m.uv, indices: compactIndices(m.indices, m.position.length / 3), material: mats.fin,
        targets: tg.deltas.map(deltasToObject), normalTargets: tg.normals.map((d) => dirsToObject(d)), extraAttributes: skinAttrs(w),
      });
      finMorphs[def.name] = tg.names;
      addMeshNode(def.name, [prim], { targetNames: tg.names, drivers: Object.fromEntries(tg.names.map((k) => [k, FIN_DRIVERS[k] ?? ''])), tobihaze: { part: 'fin', fin: def.name } }, { tobihaze: { fin: def.name } }, { weights: tg.names.map(() => 0) });
    }
  }

  // ---- the root, its extras, the scene
  const allP = [body.position, ...Object.values(finBind)];
  const bb = boundsOf(allP.map(posToObject));
  const armP = (side) => {
    const out = [];
    const fin = finBind[side > 0 ? 'Fin_Pectoral_L' : 'Fin_Pectoral_R'];
    const PC = BODY_SCULPT.pectoral;
    for (const q of [PC.shoulder, PC.elbow, PC.wrist, PC.root.c]) out.push(q[0] * HL, q[1] * HL, q[2] * side * HL);
    if (fin) for (let i = 0; i < fin.length; i++) out.push(fin[i]);
    return Float32Array.from(out);
  };
  const pad = (b, d) => [b[0].map((v) => +(v - d).toFixed(5)), b[1].map((v) => +(v + d).toFixed(5))];
  const regions = {
    fish: bb,
    body: regionBox(-0.02, TL / HL, -0.25, 1.35, -0.62, 0.62),
    head: regionBox(-0.02, 1.3, -0.05, 0.78, -0.4, 0.4),
    face: regionBox(-0.02, 0.5, -0.02, 0.76, -0.36, 0.36),
    chest: regionBox(0.7, 1.8, -0.45, 0.75, -0.62, 0.62),
    armL: pad(boundsOf([posToObject(armP(1))]), 0.06 * HL * 0.001),
    armR: pad(boundsOf([posToObject(armP(-1))]), 0.06 * HL * 0.001),
    tail: regionBox(3.4, TL / HL + 0.02, -0.1, 0.7, -0.2, 0.2),
    ...Object.fromEntries(Object.entries({ d1: 'Fin_Dorsal1', d2: 'Fin_Dorsal2', anal: 'Fin_Anal', caudal: 'Fin_Caudal', pelvic: 'Fin_Pelvic' }).filter(([, f]) => finBind[f]).map(([k, f]) => [k, pad(boundsOf([posToObject(finBind[f])]), 0.03 * HL * 0.001)])),
  };
  const contacts = contactsFor(body, finBind, keep);
  const morphs = {};
  if (morphMeshName) morphs[morphMeshName] = { names: morph.names, drivers: Object.fromEntries(morph.names.map((k) => [k, MORPH_DRIVERS[k]])), drive: Object.fromEntries(morph.names.map((k) => [k, MORPH_DRIVE[k]])) };
  if (Object.keys(finMorphs).length) morphs.fins = { targets: finMorphs, drivers: FIN_DRIVERS };
  const rootNode = gb.addNode({
    name: `${P}_Adult`, children: [rootJoint],
    extras: {
      species: 'periophthalmus_modestus', commonName: 'トビハゼ', totalLength_mm: TL, standardLength_mm: +SL.toFixed(3),
      units: 'metres (+X the fish\'s left, +Y dorsal, +Z anterior)',
      tobihaze: {
        tier: tierName, round: 'B1 clay', hlMM: +HL.toFixed(4), tlMM: TL, slMM: +SL.toFixed(3),
        joints: kept.map((j) => j.name), remapFromHero: Array.from(remap),
        axes: tierAxes(tierName),
        morphs, contacts, regions,
        layout: BODY_LAYOUT,
        eyes: lod2 ? { merged: 'Body', note: 'lod2: both globes at rest in the Body, on J_head' } : { mesh: 'Eye', nodes: ['Eye_L', 'Eye_R'], mirrored: 'Eye_R (node scale [-1, 1, 1])' },
      },
      regions,
    },
  });
  gb.addScene(P, [rootNode, ...sceneNodes]);
  const buf = gb.toBuffer();
  if (outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, buf); }
  const tris = Object.entries(meshTris).filter(([k]) => !/^Body_(skin|eyes)$/.test(k)).reduce((a, [, t]) => a + t, 0);
  const res = { tier: tierName, tris, joints: sk.length, materials: gb.json.materials.length, images: (gb.json.images ?? []).length, meshes: meshTris, headSplit, file: outFile, bytes: buf.length, morphs: morph?.names ?? [] };
  log(`${tierName}: ${tris} triangles (${Object.entries(meshTris).map(([k, v]) => `${k} ${v}`).join(', ')}), ${sk.length} joints, ${res.materials} materials → ${outFile ? path.relative(root, outFile) : '(not written)'} (${(buf.length / 1e6).toFixed(2)} MB)`);
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const which = arg('--tier', 'all');
  const outDir = path.resolve(arg('--out', path.join(here, 'out', 'tiers')));
  const clay = args.includes('--clay');
  if (!clay) logDefault('round B1 has no textures yet: writing clay materials (--clay)');
  const cache = arg('--cache', null);
  const heroH = arg('--hero-h', null);
  const hero = await heroData({ cache: cache ? path.resolve(cache) : null, h: heroH ? Number(heroH) : null });
  const results = [];
  for (const t of which === 'all' ? Object.keys(TIERS) : which.split(',')) results.push(await buildTier(t, { outFile: path.join(outDir, `tobihaze.${t}.glb`), clay: true, hero }));
  fs.writeFileSync(path.join(outDir, 'build-report.json'), JSON.stringify(results, null, 1));
}
