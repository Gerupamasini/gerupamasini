#!/usr/bin/env node
// The トビハゼ model as one GLB per tier (rounds B1–B3: the clay stage, with its rig, blend shapes and LOD tiers; the
// textures are the next round). The pieces:
//   skin    the whole fish's sculpt (head.mjs + body.mjs) meshed per tier (fishmesh.mjs bodyTierMesh: the hero's full
//           sculpt at h 0.09 mm, lod1's sealed one at 0.16, lod2's far one at 0.40), UV-charted on the body atlas
//   rig     rig.mjs: the 33 hero joints (the head's mechanism, the axial chain, the pectoral arms, the pelvic base), their
//           weight rows on the hero's dense mesh (heroRig), the head's blend shapes solved on its packed skin
//           (headmorphs.mjs); lod1 and lod2 carry both over from the hero's dense mesh by tissue class (transfer.mjs)
//           and re-solve the blend shapes against their own reduced skins (26 and 12 joints)
//   eyes    eyemesh.mjs: a globe mesh under each eye joint (Eye_L; Eye_R the left's mirror image built as its own mesh
//           with its own tangents, round B3), merged into the Body at lod2
//   teeth   teeth.mjs: the fitted tooth rows (hero), on J_premax and J_imj
//   fins    fins.mjs: the seven fins with their blend shapes (fold, spread; the caudal's flex; the pectorals' furl, plant +
//           plantMid; the pelvic's press); lod2: one card each, merged into one alpha-tested `Fins` mesh with every card's
//           states, the far cup's J_pelvic pitch and the reference states' correctives as blend shapes
// The hero's dense mesh, its rows and blend shapes are computed once (heroData) and reused by every tier.
//   node tools/models/tobihaze/build.mjs [--tier hero|lod1|lod2|all] [--out <dir>] [--clay] [--cache <file>] [--hero-h <mm>]
// --out defaults to tools/models/tobihaze/out/tiers/ (shipping into src/assets/ is a later round); --cache keeps the
// hero data on disk (a scratch file) so a rebuild of the GLBs skips the hero's meshing, weights and blend-shape solve
// (several minutes); --clay writes clay materials (the only kind this round: without it the build says so and writes
// clay all the same).
//
// Meshes per tier (class M budget, body_contract §6; round B3: the skin split by the blend-shape groups that move it,
// headmorphs.splitByMorphs, each morph mesh carrying only its own targets, the rest a static Body):
//   hero  Head_Orbit (blinkL, blinkR, eyesUpL, eyesUpR; inflate, inflateMid where the cheeks reach it), Head_Mouth (gape,
//         gum; throat, inflate, inflateMid), Head (throat, inflate, inflateMid), Body (static), Eye_L, Eye_R,
//         Mouth_Teeth, Fin_* (the hero's vent target moves nothing and is dropped: the gill slit opens by J_opercL/R)
//   lod1  Head_OrbitL (blinkL, eyesUpL), Head_Orbits (both sides' and the cheeks' shapes where they meet), Head_OrbitR
//         (blinkR, eyesUpR), Head (throat, inflate, inflateMid), Body (static), Eye_L, Eye_R, Fin_*
//   lod2  Body (with both eyes), Fins (MASK)
// (the exact target list per mesh is in each tier's extras tobihaze.morphs and the build report's headSplit)
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
import { HL, TL, SL, S0, EYE_MM, toObject, dirToObject } from './anatomy.mjs';
import { HEAD_SCULPT, headSDF } from './head.mjs';
import { BODY_SCULPT, trunkProfile } from './body.mjs';
import { morphNormals, BLINK_DROP } from './headrig.mjs';
import { bodyTierMesh, fishDense, tierField, morphAttrs, tierMorphAttrs, ready, BODY_LAYOUT, TIERS as MESH_TIERS, rectUVWH } from './fishmesh.mjs';
import { vertexTangents, tangentCheck } from './tiers.mjs';
import { finDefinitions, buildFinMesh, buildFinTargets, finCard, finCardTargets, finTierParams } from './fins.mjs';
import { JOINTS, J, NJ, TIER_JOINTS, jointsForTier, heroRig, packTop4, morphSkin, skinForTier, finWeights, teethWeights, axesForTier, partShares, poseWorldHero, skinPacked, statePose, crawlFrames, fishToQuatObj, contactsFor, contactGaps, poseForTier, mirrorErrors, limitExcess, AXES } from './rig.mjs';
import { headMorphs, solveBindDelta, poseWorldFor, skinWith, wrapMorph, MORPH_ORDER, MORPH_EXTRA, MORPH_DRIVERS, MORPH_DRIVE, MORPH_EPS, MORPH_GROUPS_SIDES, MORPH_MESH_SIDES, pruneMorphs, splitByMorphs } from './headmorphs.mjs';
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
  hero: { mesh: 'hero', eye: EYE_TIERS.hero, fins: 'hero', teeth: true, morphs: [...MORPH_ORDER, ...MORPH_EXTRA], morphMesh: 'Head' },
  // (round B3: lod1 has the eyes-up correctives too, re-solved on its skin as its other shapes, so its alert eyes lift as
  // the hero's: B2 held lod1's lift to liftBareM, 0.47 mm under the hero's at the switch; the morph meshes as the hero's)
  lod1: { mesh: 'lod1', eye: EYE_TIERS.lod1, fins: 'lod1', teeth: false, morphs: ['blinkL', 'blinkR', 'throat', 'inflate', 'inflateMid', 'eyesUpL', 'eyesUpR'], morphMesh: 'Head' },
  lod2: { mesh: 'lod2', eye: EYE_TIERS.lod2, fins: 'card', teeth: false, morphs: [], merged: true },
};
const P = 'Tobihaze';
/** The hero blend shapes the simplifier keeps vertices for (fishmesh.morphAttrs: 6 × 3 floats; 23 with normal and uv). */
const HERO_ATTR_MORPHS = ['blinkL', 'blinkR', 'gape', 'vent', 'inflate', 'throat'];
/** lod1's: the blink and the inflation (the design §3.3). */
const LOD1_ATTR_MORPHS = ['blinkL', 'blinkR', 'inflate'];
/** The fins' blend shapes' drivers (fins.mjs): fold and spread are opposite (drive one at a time). */
const FIN_DRIVERS = {
  press: 'pelvic: w, the cup pressed flat on the ground under the chest (LAND; each ray from its base onto a plane under the bases, the front raised 15°; J_pelvic near 0)',
  fold: 'w: the fin folded (median fins down along the back / belly, the caudal closed into its spear, the pectoral fan closed, the pelvic laid back); drive fold or spread, not both',
  spread: 'w: the fin erect / its fan fully open (fold or spread, not both)',
  flex: 'caudal: w > 0 bends the fin\'s rear to the fish\'s left (+X), w < 0 to the right',
  plant: 'pectoral: w, the blade furled and planted: the inner blade along the junction\'s line to the heel, the distal part turned forward into the sole and pressed flat, the tips splayed (the rig\'s J_pecTip bends them under load; on the ground when the lobe stands as a leg; rig solveArmPlant levels it); from furl, not with it',
  plantMid: 'pectoral: 4·w·(1 − w) of plant (keeps the rays their length half way)',
  furl: 'pectoral: w, the rays bundled into a narrow fan, the membrane pleated between them (its surface ~70 % of the spread fan\'s; the land default: the crawl\'s crutch, rig crawlFrames, its tip the welded contact); drive furl or plant, not both',
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

/** The per-vertex arrays' strides (round B1 inferred the stride from the length, which hid meshopt's per-corner tangent
 * array: its fractional stride copied nothing, and the hero's TANGENT came out all zero). */
const STRIDE = { position: 3, normal: 3, tangent: 4, uv: 2, joints: 4, weights: 4 };
/** A mesh's sub-mesh of the triangles `keep` accepts, every per-vertex array in `keys` carried (STRIDE; an array whose
 * length is not the vertex count × its stride is an error). */
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
    const c = STRIDE[k];
    if (!c) throw new Error(`subMesh: no stride for ${k}`);
    if (a.length !== nv * c) throw new Error(`subMesh: ${k} has ${a.length} values for ${nv} vertices (stride ${c})`);
    const b = new a.constructor(m * c);
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
  const M = await headMorphs(rig.headSub, ms.skin, { K: HEAD_SCULPT, headSDF, headField: rig.headField, teeth: rig.teeth, inflateScale: ms.inflateScale, which: [...MORPH_ORDER, ...MORPH_EXTRA], log });
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
      charts: tier.charts.map((c) => ({ name: c.name, rect: c.rect, ...(c.rects ? { rects: c.rects } : {}), ...(c.hidden ? { hidden: true } : {}), ...(c.relay ? { relay: true } : {}) })), tierStats: tier.stats,
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
    // (weighted per shape by the tier: fishmesh TIERS.lod1.morphWeights, the blinks 2 so the hood keeps its rings)
    extraAttrs = tierMorphAttrs(TB.mesh, LOD1_ATTR_MORPHS, LOD1_ATTR_MORPHS.map((_, j) => { const d = new Float32Array(nD * 3); for (let v = 0; v < nD; v++) for (let c = 0; c < 3; c++) d[v * 3 + c] = t[v * k + j * 3 + c]; return d; }));
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
        // (round B3, lod1's eyes-up: the cup's lining the tier keeps inside the resting globe rides the lifted globe whole,
        // hidden in it: the hero has no skin there to carry a lift from. A shrink-wrap onto the hero's posed stalk, as the
        // blink's, was tried and dropped: 135 web edges over 2× at the land lift against 2)
        if (/^eyesUp[LR]$/.test(nm)) {
          const sd = nm.endsWith('L') ? 1 : -1, lift = w.pose[`J_eye${nm.slice(-1)}`].t[1], ec = EYE_MM.center, P = tier.position;
          for (let v = 0; v < n; v++) if (Math.hypot(P[v * 3] - ec[0], P[v * 3 + 1] - ec[1], P[v * 3 + 2] - sd * ec[2]) < EYE_MM.radius - 0.005) { E[v * 3] = 0; E[v * 3 + 1] = lift; E[v * 3 + 2] = 0; mask[v] = 1; }
        }
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
    // the blink re-solved as a shrink-wrap (round B2: B1's carried and solved hood crumpled and let the globe through at
    // lod1): each hood vertex near an eye laid on the hero's posed blink surface at its material point (the closest hero
    // bind point carried through the hero's own pose: targetBind), relaxed over it, then solved against the tier's own
    // skin (headmorphs.wrapMorph); both eyes at once, split across the midline as the hero's blink is
    if (TB.morphs.includes('blinkL') && TB.morphs.includes('blinkR')) {
      const wr = lod1Blink(tier, skin, morphs.d.blinkL, morphs.d.blinkR, H);
      morphs.d.blinkL = wr.L; morphs.d.blinkR = wr.R; morphs.blinkWrap = wr.stats;
      log(`${tierName}: blinkL/R shrink-wrapped onto the hero's posed hood (${JSON.stringify(wr.stats)})`);
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

/**
 * lod1's blinkL / blinkR as a shrink-wrap of its hood onto the hero's posed blink (rig round B2, t_blink: 0 globe
 * pixels in view at gaze 0 and 45° with the kept lining): the pose both eyes dropped BLINK_DROP; the target the hero's
 * dense skin with both blinks at 1, skinned by its packed weights; the start the carried-and-solved shapes; the wrapped
 * set every vertex the start moves or within 0.3 HL of an eye; each vertex follows its material point (targetBind, the
 * hero's dense bind positions, with the normals facing alike). The bind displacement (mm) is split across the midline
 * as headmorphs splits the hero's (a sine over |z| < 0.03 HL).
 */
function lod1Blink(tier, skin, dL, dR, H) {
  const names = TIER_JOINTS.lod1, n = tier.position.length / 3;
  const pose = { J_eyeL: { t: [0, -BLINK_DROP, 0] }, J_eyeR: { t: [0, -BLINK_DROP, 0] } }, W = poseWorldHero(pose);
  const PH0 = Float32Array.from(H.dense.position);
  for (const k of ['blinkL', 'blinkR']) for (let i = 0; i < PH0.length; i++) PH0[i] += H.D[k][i];
  const PH = skinPacked(PH0, H.packed, W);
  const start = new Float32Array(n * 3); for (let i = 0; i < start.length; i++) start[i] = dL[i] + dR[i];
  const ec = EYE_MM.center;
  const nearEye = (p) => Math.min(Math.hypot(p[0] - ec[0], p[1] - ec[1], p[2] - ec[2]), Math.hypot(p[0] - ec[0], p[1] - ec[1], p[2] + ec[2])) < 0.3 * HL;
  const mask = new Float32Array(n);
  for (let v = 0; v < n; v++) mask[v] = Math.hypot(start[v * 3], start[v * 3 + 1], start[v * 3 + 2]) > 1e-6 || nearEye([tier.position[v * 3], tier.position[v * 3 + 1], tier.position[v * 3 + 2]]) ? 1 : 0;
  const centres = [[ec[0], ec[1], ec[2]], [ec[0], ec[1], -ec[2]]].map((c, i) => { const T = W[i ? 'J_eyeR' : 'J_eyeL']; return [0, 1, 2].map((k) => T.R[k * 3] * c[0] + T.R[k * 3 + 1] * c[1] + T.R[k * 3 + 2] * c[2] + T.t[k]); });
  const wr = wrapMorph({ position: tier.position, normal: tier.normal, indices: tier.indices, skin, names, source: tier.source }, { position: PH, indices: H.dense.indices },
    { W, start, mask, globe: { centres, radius: EYE_MM.radius }, targetBind: H.dense.position, targetNormal: H.dense.normal });
  const L = new Float32Array(n * 3), R = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const z = tier.position[v * 3 + 2] / HL, tl = 0.5 + 0.5 * (Math.abs(z) < 0.03 ? Math.sin((z / 0.03) * Math.PI / 2) : Math.sign(z));
    for (let k = 0; k < 3; k++) { L[v * 3 + k] = wr.d[v * 3 + k] * tl; R[v * 3 + k] = wr.d[v * 3 + k] * (1 - tl); }
  }
  return { L, R, stats: { ...wr.stats, masked: mask.reduce((a, b) => a + b, 0) } };
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

/** The runtime axes for a tier (rig.axesForTier), with lod1's jaw clamped (lod1's sealed skin has no slit, so a wide
 * gape stretches the closed lips: the integration design §10), the eye lift held to the bare joint's range where the
 * tier has no eyesUp corrective (rig AXES liftBareM), and the head's reference poses cut to the tier's joints (the
 * bone-only joints of the head rig, J_jawL … J_bstegR, listed apart as `boneOnly`). */
function tierAxes(tierName, morphNames = []) {
  const axes = structuredClone(axesForTier(tierName));
  const keep = new Set(TIER_JOINTS[tierName]);
  const jaw = axes.joints?.J_jaw?.channels?.angle;
  if (tierName === 'lod1' && jaw) { jaw.range = [jaw.range[0], Math.min(jaw.range[1], 30)]; jaw.note = 'lod1: clamped to 30° (the sealed skin has no slit; the gape and gum shapes are hero only)'; jaw.tierClamp = true; }
  // (round B2: lod1's blink is a shrink-wrap of its kept hood and lining onto the hero's closed hood, so the globe
  // stays covered with the joint's own drop: B1's blinkGlobeExtraDropM is gone)
  for (const S of ['L', 'R']) {
    const j = axes.joints?.[`J_eye${S}`]?.translate;
    if (j && !morphNames.includes(`eyesUp${S}`)) { j.rangeM = [j.rangeM[0], j.liftBareM]; j.note = `this tier has no eyesUp${S} corrective: the lift stays within liftBareM`; }
    if (axes.eyes?.[S] && !morphNames.includes(`eyesUp${S}`)) { axes.eyes[S].liftM = j?.liftBareM ?? axes.eyes[S].liftM; axes.eyes[S].alertLiftM = Math.min(axes.eyes[S].alertLiftM, axes.eyes[S].liftM); }
  }
  if (axes.head?.poses) {
    const bone = new Set(), fixed = {};
    const mPerHL = HL * 0.001, names = new Set(morphNames);
    for (const [k, P] of Object.entries(axes.head.poses)) {
      if (!P || typeof P !== 'object') continue;
      const Q = Object.fromEntries(Object.entries(P).filter(([j]) => { if (!/^J_/.test(j)) return true; if (keep.has(j)) return true; bone.add(j); return false; }));
      // (round B3 integration, tech P4: a reference pose within the tier's own ranges and naming only blend shapes the
      // tier has: lod1's gapeFull asked J_jaw 70° of its 30°, the hero's inflated J_operc 26° of 20°, lod2's blink named
      // blinkL/R; the hero's vent target is dropped (it moves nothing). What was clamped or dropped is listed in `fixed`)
      for (const [j, ch] of Object.entries(Q)) {
        if (!/^J_/.test(j) || !ch || typeof ch !== 'object') continue;
        const A = axes.joints?.[j];
        for (const [c, v] of Object.entries(ch)) {
          if (c === 't' && A?.translate?.rangeM && Array.isArray(v)) {
            const [lo, hi] = A.translate.rangeM.map((m) => m / mPerHL), y = Math.min(hi, Math.max(lo, v[1]));
            if (Math.abs(y - v[1]) > 1e-9) { (fixed[k] ??= []).push(`${j}.t ${v[1]} → ${+y.toFixed(6)} HL`); ch.t = [v[0], +y.toFixed(6), v[2]]; }
            continue;
          }
          const C = A?.channels?.[c], r = C?.range;
          if (!r || typeof v !== 'number' || (v >= r[0] && v <= r[1])) continue;
          if (C.tierClamp) { const y = Math.min(r[1], Math.max(r[0], v)); (fixed[k] ??= []).push(`${j}.${c} ${v} → ${y} (the tier's clamp)`); ch[c] = y; }
          else {
            // (a range the head rig's own reference pose passes, e.g. the inflated cheeks' J_operc 26° against 20°: the range
            // widened to the pose, which the accepted head is posed in, rather than the pose cut)
            C.range = [Math.min(r[0], v), Math.max(r[1], v)]; C.rangeNote = `widened to ${k}'s ${v} (the head rig's reference pose)`;
            (fixed[k] ??= []).push(`${j}.${c} range → [${C.range.join(', ')}]`);
          }
        }
      }
      if (Q.morph) {
        const kept = Object.fromEntries(Object.entries(Q.morph).filter(([m]) => names.has(m)));
        const gone = Object.keys(Q.morph).filter((m) => !names.has(m));
        if (gone.length) (fixed[k] ??= []).push(`morph ${gone.join(', ')} dropped (not on this tier)`);
        if (Object.keys(kept).length) Q.morph = kept; else delete Q.morph;
      }
      axes.head.poses[k] = Q;
    }
    axes.head.boneOnly = [...bone].sort();
    axes.head.boneOnlyNote = 'joints of the head rig that this tier does not ship (their motion is in the blend shapes or rides a kept ancestor): dropped from the poses';
    if (Object.keys(fixed).length) { axes.head.posesFixed = fixed; axes.head.posesFixedNote = 'the reference poses held to this tier: channels the tier clamps cut to it, ranges the head rig\'s own poses pass widened to them, blend shapes the tier lacks dropped'; }
  }
  return axes;
}

/** The hero tier's skin weights (packed rows at each tier vertex's dense source). */
function heroTierSkin(H) {
  const b = H.tier, n = b.position.length / 3, joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
  for (let v = 0; v < n; v++) { const s = b.source[v]; joints.set(H.packed.joints.subarray(s * 4, s * 4 + 4), v * 4); weights.set(H.packed.weights.subarray(s * 4, s * 4 + 4), v * 4); }
  return { joints, weights };
}

/** The fins of a tier, built once: { [name]: { def, mesh, targets: { names, deltas, normals }, w (hero-space packed
 * weights) } } (hero / lod1: buildFinMesh with buildFinTargets; lod2: finCard with cardStateTargets). */
const FIN_CACHE = new Map();
/**
 * A far-tier card's states as blend shapes (round B3: B2's cards had fold and plant only, so the far fish in the water
 * kept a 12° caudal brush and closed paddles while the near tiers spread them, and popped at every lod1↔lod2 switch;
 * the room tanks load lod2 underwater at every preset): fins.mjs finCardTargets (def.cardTargets, the fins owners'
 * states with what a state needs baked in, e.g. the pectoral plant's junction flexion: the far arm is J_pecL alone),
 * then every other state the near tiers' fin takes (def.targets but the in-between correctives *Mid, which ride their
 * state at 4w(1 − w)) as finCard(def, { state }) − finCard(def): spread for every fin, the caudal's flex, the pelvic's
 * press. { names, deltas, normals } like buildFinTargets'.
 */
function cardStateTargets(def, bind) {
  const T = finCardTargets(def), names = [...T.names], deltas = [...T.deltas], normals = [...T.normals];
  for (const st of def.targets ?? []) {
    if (names.includes(st) || /Mid$/.test(st)) continue;
    const c = finCard(def, { state: st });
    names.push(st);
    deltas.push(Float32Array.from(c.position, (v, i) => v - bind.position[i]));
    normals.push(Float32Array.from(c.normal, (v, i) => v - bind.normal[i]));
  }
  return { names, deltas, normals };
}
/**
 * The far tier's pelvic cup turned as J_pelvic turns it (round B3: lod2 keeps 12 joints, J_pelvic's weights ride J_head,
 * so B2's far cup stayed untilted in LAND, 2.0 mm over the hero's ground): the card in the land state's own shape (its
 * blend shapes at the land weights) turned about J_pelvic's pivot by the land state's pitch pL, as a blend shape
 * `pitch` (delta and normal delta, fish mm) whose weight J_pelvic.pitch / pL is exact at LAND. null when the land
 * state leaves the cup within 0.5° of its bind (nothing to carry) or turns it the other way (a drive needs per > 0).
 */
function pelvicPitchTarget(fin, pose) {
  const pL = pose?.J_pelvic?.pitch ?? 0;
  if (!fin || !(pL > 0.5)) return null;
  const c = fin.mesh, T = fin.targets, w = pose.morph?.[fin.def.name] ?? {}, n = c.position.length / 3;
  const X = Float64Array.from(c.position), Nn = Float64Array.from(c.normal);
  T.names.forEach((k, i) => { const wk = w[k] ?? 0; if (!wk) return; for (let q = 0; q < X.length; q++) { X[q] += wk * T.deltas[i][q]; Nn[q] += wk * T.normals[i][q]; } });
  // (the channel's axis in the object frame → the fish frame: dirToObject is (s, y, z) → (z, y, −s), a rotation)
  const ao = AXES.joints.J_pelvic.channels.pitch.axis, a0 = [-ao[2], ao[1], ao[0]], al = Math.hypot(...a0), ax = a0.map((x) => x / al);
  const th = (pL * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th), piv = JOINTS[J.J_pelvic].at;
  const rot = (v) => { const d = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2], cr = [ax[1] * v[2] - ax[2] * v[1], ax[2] * v[0] - ax[0] * v[2], ax[0] * v[1] - ax[1] * v[0]]; return [0, 1, 2].map((k) => v[k] * cs + cr[k] * sn + ax[k] * d * (1 - cs)); };
  const delta = new Float32Array(n * 3), dnormal = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const r = rot([X[v * 3] - piv[0], X[v * 3 + 1] - piv[1], X[v * 3 + 2] - piv[2]]), m = rot([Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]]);
    for (let k = 0; k < 3; k++) { delta[v * 3 + k] = r[k] + piv[k] - X[v * 3 + k]; dnormal[v * 3 + k] = m[k] - Nn[v * 3 + k]; }
  }
  return { pL, delta, dnormal };
}
/** The states with the far cards' own weights merged into their poses' morphs (lod2Morph: { [state]: { [fin]: { [target]:
 * w } } }: the cup's `pitch`, the states' correctives), so lod2's contacts and extras pose the cards as the viewer
 * does; the states themselves when there are none (hero, lod1). */
function withCardMorphs(states, lod2Morph) {
  if (!Object.keys(lod2Morph).length) return states;
  return Object.fromEntries(Object.entries(states).map(([k, S]) => {
    const pose = structuredClone(S.pose);
    for (const [fin, ws] of Object.entries(lod2Morph[k] ?? {})) pose.morph = { ...(pose.morph ?? {}), [fin]: { ...(pose.morph?.[fin] ?? {}), ...ws } };
    return [k, { ...S, pose }];
  }));
}
function tierFins(tierName, H) {
  if (FIN_CACHE.has(tierName)) return FIN_CACHE.get(tierName);
  const defs = finDefinitions(BODY_SCULPT), body0 = { position: H.dense.position, indices: H.dense.indices, rows: H.rig.rows, grid: H.grid };
  const TP = tierName === 'lod2' ? null : finTierParams(TIERS[tierName].fins);
  const out = {};
  for (const def of defs) {
    const mesh = TP ? buildFinMesh(def, TP[def.name]) : finCard(def);
    const targets = TP ? buildFinTargets(def, mesh) : cardStateTargets(def, mesh);
    out[def.name] = { def, mesh, targets, w: finWeights(def, mesh, { body: body0 }) };
  }
  FIN_CACHE.set(tierName, out);
  return out;
}

/**
 * The reference states every tier is posed in (rig.statePose, solved once on the hero; round B3: rig.statePose is the
 * one source, no overrides here): land (the front raised, the pectoral soles planted flat by solveArmPlant on the hero's
 * tier skin, the pelvic cup pressed onto the same ground), rest (prone, the arms in fins.mjs's rest pose, every fin
 * folded) and water (the swim wave, the paddles spread beside the flank). rig.statePose('reach') and rig.crawlFrames
 * give the reach and the crawl's stance from the same rig.
 */
export function heroStates(H) {
  if (H.states) return H.states;
  const fins = tierFins('hero', H), pel = fins.Fin_Pelvic;
  const tierMesh = { position: H.tier.position, skin: heroTierSkin(H), names: TIER_JOINTS.hero };
  // (round B3: the fins with their blend shapes, so the land and rest states lay the folded fins and the belly on the
  // ground (rig settleOnGround) and press the pelvic cup by its own 'press' shape (rig pressPelvic))
  const finParts = Object.fromEntries(Object.entries(fins).map(([k, f]) => [k, { position: f.mesh.position, skin: f.w, names: TIER_JOINTS.hero, targets: { names: f.targets.names, deltas: f.targets.deltas } }]));
  const land = statePose('land', { tierMesh, pelvic: finParts.Fin_Pelvic, fins: finParts });
  // (round B3 integration: the reach (A023, A070: the arm forward, the planted blade's tip ahead of the shoulder) as a
  // fourth reference state, solved the same way, so every tier's extras carry its pose and contacts)
  const reach = statePose('reach', { tierMesh, pelvic: finParts.Fin_Pelvic, fins: finParts });
  const rest = statePose('rest', { tierMesh, fins: finParts });
  const water = statePose('water');
  H.states = { land, reach, rest, water };
  return H.states;
}

/**
 * The crawl's stance for a tier (round B3 integration; rig.crawlFrames, the pectoral key's: the furled blades' tips
 * welded while the body moves over them, Pace & Gibb 2009): the hero's solved on its tier skin, lod1's on its own skin
 * with its own tip (o.tier 'lod1': lod1 has no J_pecTip, so the hero's frames would slide its tip 2.2 mm), lod2's the
 * hero's carried over (rig.stateForTier: lod2's one-bone arms aimed, not welded). The frames' poses add the land state's
 * folded median fins (the crawl is a land gait).
 * @returns { frames: [{ phase, raise, pose, tipErrMM }], weldMM, weldM, strideMM, groundMM, note }
 */
function tierCrawl(tierName, H, tierMesh, morphNames) {
  const land = H.states?.land?.pose?.morph ?? {};
  const keepFins = Object.fromEntries(Object.entries(land).filter(([k]) => !/^Fin_Pectoral_/.test(k) && k !== 'Fin_Pelvic'));
  const withFins = (pose) => ({ ...pose, morph: { ...keepFins, ...(pose.morph ?? {}) } });
  let C;
  if (tierName === 'lod2') {
    // (lod2 keeps J_pecL alone and a straight card: the hero's shoulder rotation leaves the furled card's tip 8 mm off the
    // weld (the hero's arm bends at the junction and the heel). Per frame and side the card's furl eased toward its plant
    // (plant w: the shoulder → tip length from 13.4 to 12.0 mm) so its tip lies as far from the shoulder as the weld does,
    // and the shoulder turned by the least rotation that lays the tip on the weld; where even the planted card is longer,
    // its tip on the ground toward the weld, never under it: cardTipFromWeldMM)
    const hero = (H.crawl ??= crawlFrames({ position: H.tier.position, skin: heroTierSkin(H), names: TIER_JOINTS.hero }));
    const card = tierFins('lod2', H).Fin_Pectoral_L, kF = card.targets.names.indexOf('furl'), kP = card.targets.names.indexOf('plant'), sh = JOINTS[J.J_pecL].at;
    const cardAt = (w, v) => [0, 1, 2].map((c) => card.mesh.position[v * 3 + c] + (1 - w) * card.targets.deltas[kF][v * 3 + c] + w * card.targets.deltas[kP][v * 3 + c]);
    let tv = 0, far = -1;
    for (let v = 0; v < card.mesh.position.length / 3; v++) { const q = cardAt(0, v), d = Math.hypot(q[0] - sh[0], q[1] - sh[1], q[2] - sh[2]); if (d > far) { far = d; tv = v; } }
    const lenAt = (w) => { const q = cardAt(w, tv); return Math.hypot(q[0] - sh[0], q[1] - sh[1], q[2] - sh[2]); };
    const wFor = (d) => { if (d >= lenAt(0)) return 0; if (d <= lenAt(1)) return 1; let a = 0, b = 1; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (lenAt(m) > d) a = m; else b = m; } return (a + b) / 2; };
    const mv = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
    const mm = (A, B) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]));
    const tr = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
    const between = (a, b) => {
      const na = Math.hypot(...a), nb = Math.hypot(...b), u = a.map((x) => x / na), w = b.map((x) => x / nb);
      const ax = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], sn = Math.hypot(...ax), cs = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
      if (sn < 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const [x, y, z] = ax.map((c) => c / sn), C = 1 - cs;
      return [cs + x * x * C, x * y * C - z * sn, x * z * C + y * sn, y * x * C + z * sn, cs + y * y * C, y * z * C - x * sn, z * x * C - y * sn, z * y * C + x * sn, cs + z * z * C];
    };
    const frames = hero.frames.map((f) => {
      const pose = statePose('land', 'lod2', { hero: { pose: f.pose }, morphNames }).pose, W = poseWorldHero(pose), err = {};
      for (const S of ['L', 'R']) {
        const m = S === 'L' ? 1 : -1, Ws = W[`J_pec${S}`], Wp = W[JOINTS[J[`J_pec${S}`]].parent];
        const at = JOINTS[J[`J_pec${S}`]].at, weld = [hero.weld[0], hero.weld[1], hero.weld[2] * m];
        const shW = mv(Ws.R, at).map((c, i) => c + Ws.t[i]), dist = Math.hypot(...weld.map((c, i) => c - shW[i])), w = wFor(dist), L = lenAt(w);
        // (where the card is longer than the shoulder's distance to the weld, its tip on the ground at that length, toward
        // the weld: on the ground plane through the weld, round the point under the shoulder)
        let aim = weld;
        if (L > dist + 1e-6) {
          const hgt = shW[1] - weld[1], hz = [weld[0] - shW[0], weld[2] - shW[2]], rw = Math.hypot(...hz), rho = Math.sqrt(Math.max(0, L * L - hgt * hgt));
          aim = rw > 1e-9 ? [shW[0] + (hz[0] * rho) / rw, weld[1], shW[2] + (hz[1] * rho) / rw] : weld;
        }
        const tip = cardAt(w, tv), tp = [tip[0], tip[1], tip[2] * m], tipW = mv(Ws.R, tp).map((c, i) => c + Ws.t[i]);
        const Rx = between(tipW.map((c, i) => c - shW[i]), aim.map((c, i) => c - shW[i]));
        pose[`J_pec${S}`] = fishToQuatObj(mm(tr(Wp.R), mm(Rx, Ws.R)));
        pose.morph = { ...(pose.morph ?? {}), [`Fin_Pectoral_${S}`]: { furl: +(1 - w).toFixed(4), plant: +w.toFixed(4) } };
        err[S] = +Math.hypot(...aim.map((c, i) => c - weld[i])).toFixed(3);
      }
      return { ...f, pose, cardTipFromWeldMM: err };
    });
    C = { ...hero, frames };
  } else if (tierName === 'hero') C = (H.crawl ??= crawlFrames(tierMesh));
  else C = crawlFrames(tierMesh, { tier: tierName });
  const r4 = (v) => +(+v).toFixed(4);
  return {
    frames: C.frames.map((f) => ({ phase: r4(f.phase), raise: r4(f.raise), pose: withFins(f.pose), ...(f.tipErrMM !== undefined && tierName !== 'lod2' ? { tipErrMM: r4(f.tipErrMM) } : {}), ...(f.cardTipFromWeldMM ? { cardTipFromWeldMM: f.cardTipFromWeldMM } : {}) })),
    weldMM: C.weld.map(r4), weldM: toObject(C.weld).map((c) => +c.toFixed(7)), strideMM: r4(C.strideMM), groundMM: r4(C.ground?.y ?? C.ground),
    note: tierName === 'lod2' ? 'lod2: the hero\'s frames, the card\'s furl eased toward its plant so its tip lies as far from the shoulder as the weld, each shoulder (J_pecL/R, a quaternion) turned so the tip lies on the weld, or, where even the planted card is longer, on the ground toward it (cardTipFromWeldMM)' : `rig.crawlFrames on this tier's skin${tierName === 'lod1' ? ' (J_pecTip held at 0, its own tip welded)' : ''}: the furled blades' tips (fins.mjs def.furl.tip) welded at weldMM (fish mm in the first frame's frame: the world) while J_root's t moves the body strideMM forward`,
  };
}

/** A state's pose for a tier: rig.statePose(state, tier) (round B3: the one source; the hero's carried over, the eye lift
 * held within liftBareM where the tier has no eyesUp corrective, and no weights written for the joint-driven correctives:
 * B2 wrote eyesUp 0.75 here, which a blink in the alert state could not take back). */
function tierStatePose(state, S, tierName, morphNames) {
  return tierName === 'hero' ? structuredClone(S.pose) : statePose(state, tierName, { hero: S, morphNames }).pose;
}

/** The posed fish's footprint for the runtime's contacts between animals (src/creatures/physics/contacts.ts BodyBuild,
 * in shares of TL): the body without its arms and fins. */
function footprintOf(body, armShare) {
  let zmax = 0, ylo = Infinity, yhi = -Infinity;
  for (let v = 0; v < body.position.length / 3; v++) {
    if (armShare(v) > 0.5) continue;
    zmax = Math.max(zmax, Math.abs(body.position[v * 3 + 2])); ylo = Math.min(ylo, body.position[v * 3 + 1]); yhi = Math.max(yhi, body.position[v * 3 + 1]);
  }
  // (round B3: the model's origin is the fish frame's s = S0 = TL/2 (anatomy.toObject), not the snout tip; the core's centre
  // (s = SL/2) lies S0 − SL/2 = 6.4 mm ahead of it: + 0.0799 TL. B2 wrote −(SL/2)/TL, half a TL behind the fish)
  return { width: +((2 * zmax) / TL).toFixed(4), height: +((yhi - ylo) / TL).toFixed(4), core: +(SL / TL).toFixed(4), ahead: +((S0 - SL / 2) / TL).toFixed(4), note: 'BodyBuild shares of TL (src/creatures/physics/contacts.ts): the body without the arms and fins, measured once on the hero and written alike into every tier; core = SL (the fish without its caudal fin); ahead: the core\'s centre (s = SL/2) ahead of the model\'s origin (s = S0 = TL/2, anatomy.toObject)' };
}

/** The GPU memory of a mesh's morph targets as three.js (r16x–r18x WebGLMorphtargets) packs them: one RGBA32F texel
 * per vertex and attribute (position, normal) per target, rows of the max texture size. */
function morphTextureBytes(nVertices, nTargets, withNormals, maxTexture = 4096) {
  if (!nTargets) return 0;
  const width = nVertices * (withNormals ? 2 : 1), rows = Math.ceil(width / maxTexture);
  return (rows > 1 ? maxTexture * rows : width) * 16 * nTargets;
}

/** Per-vertex tangents for an extra mesh (eyes are built with theirs; the teeth and the fins here): tiers.vertexTangents,
 * every per-vertex array in `extra` carried to the split copies. */
function withTangents(mesh, extra = {}) {
  const vt = vertexTangents({ position: mesh.position, normal: mesh.normal, uv: mesh.uv, indices: mesh.indices, ...extra }, { keys: ['position', 'normal', 'uv', ...Object.keys(extra)] });
  return { ...vt.mesh, tangent: vt.tangent, split: vt.stats.split };
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
  let headSplit = null;
  const morphMeshes = [];
  if (!lod2 && morph) {
    // (round B3) the skin split by the blend-shape groups that move it (headmorphs.splitByMorphs): Head_Orbit (the blinks
    // and the eyes-up), Head_Mouth (the gape's), Head (the face's: the throat and the cheeks' inflation), each carrying
    // only the targets that move its vertices, and the static Body; the negligible deltas dropped first (MORPH_EPS) and the
    // targets that move nothing left out (the hero's vent: headrig VENT_CORR relaxes nothing by the n17 head's design,
    // lambda 0 and endR 0, so the slit opens by J_opercL/R alone, on the full fish as on build-pose's head). B2 shipped one
    // Head with all ten targets on 27,986 vertices (9.18 MB of morph textures) and lod1's Body with five on all 5,486
    // (0.98 MB). A vertex two meshes share moves alike in both (each mesh has every target moving any of its vertices)
    const ME = MORPH_EPS[tierName] ?? MORPH_EPS.hero, pruned = pruneMorphs(morph, ME);
    const sp = splitByMorphs(body.indices, morph, { penalty: ME.draw, ...(ME.sides ? { groups: MORPH_GROUPS_SIDES, names: MORPH_MESH_SIDES, order: ['eyesL', 'eyesR', 'mouth', 'face'] } : {}) });
    const vecs = (sm, src, k, f) => f(Float32Array.from({ length: sm.map.length * 3 }, (_, i) => src[k][sm.map[(i / 3) | 0] * 3 + (i % 3)]));
    for (const m of sp.meshes) {
      const set = new Set(m.tris), sm = subMesh(body, (t) => set.has(t), keys), w = pick(bodySkin, sm.map);
      const targets = m.targets.map((k) => vecs(sm, morph.d, k, deltasToObject)), normalTargets = m.targets.map((k) => vecs(sm, morph.n, k, dirsToObject));
      addMeshNode(m.name, [gb.primitive({ ...bodyAttrs(sm, w), targets, normalTargets })], { ...morphExtras(m.targets), tobihaze: { part: 'head', group: m.group } }, { tobihaze: { part: 'head', group: m.group } }, { weights: m.targets.map(() => 0) });
      morphMeshes.push({ name: m.name, names: m.targets, vertices: sm.map.length, triangles: m.tris.length });
    }
    const still = new Set(sp.still), bm = subMesh(body, (t) => still.has(t), keys);
    addMeshNode('Body', [gb.primitive(bodyAttrs(bm, pick(bodySkin, bm.map)))], { tobihaze: { part: 'body' } }, { tobihaze: { part: 'body' } });
    morph.names = morph.names.filter((k) => !sp.dropped.includes(k));
    headSplit = { meshes: morphMeshes.map(({ name, names, vertices, triangles }) => ({ name, targets: names, vertices, triangles })), body: bm.indices.length / 3, dropped: sp.dropped, moving: pruned };
    log(`${tierName} skin: ${morphMeshes.map((m) => `${m.name} ${m.triangles} triangles / ${m.vertices} vertices (${m.names.join(', ')})`).join('; ')}; Body ${bm.indices.length / 3}${sp.dropped.length ? `; dropped ${sp.dropped.join(', ')} (no vertex moves)` : ''}`);
  }

  // ---- the eyes (each part with its own UVs and per-vertex tangents: eyemesh.eyeMeshForTier)
  const tangentGate = {};
  const gateTangent = (name, normal, tangent) => { if (!tangent) return; const c = tangentCheck(normal, tangent, { tol: 1e-3 }); tangentGate[name] = { n: c.n, bad: c.bad, maxDot: +c.maxDot.toExponential(2), maxLen: +(c.maxLen ?? 0).toExponential(2) }; };
  if (!lod2) {
    // (round B3: a mesh a side, the right built as the left's mirror image with its own tangents (eyemesh side −1), its
    // node not scaled: three.js does not turn the bitangent over for a mirroring node, so B2's Eye_R under scale
    // [−1, 1, 1] would have read the normal map's green channel inverted)
    for (const S of ['L', 'R']) {
      const e = eyeMeshForTier({ ...TB.eye, side: S === 'R' ? -1 : 1 });
      const prims = [[e.parts.skin, mats.body, 'skin'], [e.parts.pupil, mats.cornea, 'pupil'], [e.parts.iris, mats.iris, 'iris']]
        .filter(([p]) => p.indices.length)
        .map(([p, m, k]) => { gateTangent(`Eye_${S}.${k}`, p.normal, p.tangent); return gb.primitive({ position: p.position, normal: p.normal, tangent: p.tangent ?? null, uv: p.uv, indices: compactIndices(p.indices, p.position.length / 3), material: m }); });
      const mesh = gb.addMesh(`Eye_${S}`, prims, { tobihaze: { part: 'eye', eye: S } });
      meshTris[`Eye_${S}`] = e.triangles;
      const node = gb.addNode({ name: `Eye_${S}`, mesh, extras: { tobihaze: { eye: S } } });
      const jn = gb.json.nodes[jointNodes[jIndex[`J_eye${S}`]]];
      jn.children = [...(jn.children ?? []), node];
    }
  }

  // ---- the teeth (hero; tangents: their constant swatch UV gives the fallback frame, so a normal map reads flat)
  if (TB.teeth) {
    const tm0 = teethMesh(H.teeth);
    const tm = withTangents(tm0, { group: tm0.group });
    const n = tm.position.length / 3, joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
    const jP = teethWeights('premax', 1).joints[0], jD = teethWeights('dentary', 1).joints[0];
    for (let v = 0; v < n; v++) { joints[v * 4] = tm.group[v] === 0 ? jP : jD; weights[v * 4] = 255; }
    gateTangent('Mouth_Teeth', tm.normal, tm.tangent);
    addMeshNode('Mouth_Teeth', [gb.primitive({ position: posToObject(tm.position), normal: dirsToObject(tm.normal), tangent: dirsToObject(tm.tangent, 4), uv: tm.uv, indices: compactIndices(tm.indices, n), material: mats.body, extraAttributes: skinAttrs(toTier({ joints, weights })) })], { tobihaze: { part: 'teeth' } }, { tobihaze: { part: 'teeth' } });
  }

  // ---- the fins (the reference states first: lod2's far cup carries the land state's J_pelvic pitch as a card shape)
  const states0 = heroStates(H);
  const fins = tierFins(tierName, H);
  const defs = Object.values(fins).map((f) => f.def);
  const finMorphs = {}, finBind = {}, finParts = {};
  const gpu = { morphBytes4096: 0, morphBytes16384: 0, meshes: {} };
  const countMorph = (name, nv, nt, withN) => { const a = morphTextureBytes(nv, nt, withN, 4096), b = morphTextureBytes(nv, nt, withN, 16384); gpu.meshes[name] = { vertices: nv, targets: nt, normals: withN, bytes4096: a, bytes16384: b }; gpu.morphBytes4096 += a; gpu.morphBytes16384 += b; };
  let cardTargets = null;
  // (lod2: per reference state, the far cards' own weights (the pelvic's `pitch`, the states' correctives), merged into
  // the states' lod2 poses below)
  const lod2Morph = {}, cardMorph = (st, fin, k, w) => { ((lod2Morph[st] ??= {})[fin] ??= {})[k] = +w.toFixed(4); };
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
    // the fin cards merged into one mesh, with each card's own states as blend shapes (round B2: B1's cards stayed in
    // the bind, so the planted pectoral cards hung under the hero's ground and D1 stood half raised at the LOD switch):
    // `<state>_<fin>` (round B3: every state of the fin: cardStateTargets), zero off the card's own vertices
    const lod2Parts = [], offsets = {};
    let at = 0;
    for (const def of defs) {
      const f = fins[def.name], c = f.mesh, w = toTier(f.w);
      finBind[def.name] = c.position;
      offsets[def.name] = at; at += c.position.length / 3;
      finParts[def.name] = { position: c.position, indices: c.indices, skin: w, targets: { names: f.targets.names, deltas: f.targets.deltas } };
      lod2Parts.push({ position: posToObject(c.position), normal: dirsToObject(c.normal ?? vertexNormals(c.position, c.indices)), uv: c.uv, indices: c.indices, joints: w.joints, weights: w.weights });
    }
    const mf = mergeParts(lod2Parts);
    if (mf.position.length / 3 !== at) throw new Error('lod2 fins: the merged cards do not keep their vertices in order');
    const names = [], targets = [], normalTargets = [], drive = {};
    for (const def of defs) {
      const t = fins[def.name].targets, o = offsets[def.name];
      t.names.forEach((st, i) => {
        const d = new Float32Array(at * 3), dn = new Float32Array(at * 3);
        d.set(t.deltas[i], o * 3); dn.set(t.normals[i], o * 3);
        const nm = `${st}_${def.name}`;
        names.push(nm); targets.push(deltasToObject(d)); normalTargets.push(dirsToObject(dn));
        drive[nm] = { fin: def.name, target: st, note: `the ${def.name} card's '${st}' state: weight = the hero's / lod1's ${def.name} '${st}' weight` };
      });
    }
    // (the far cup turned by J_pelvic's pitch, which lod2 does not keep: weight = J_pelvic pitch / pL, from the joint
    // where a pose gives none; tierStates writes it into the states)
    const pp = pelvicPitchTarget(fins.Fin_Pelvic, states0.land?.pose);
    if (pp) {
      const o = offsets.Fin_Pelvic, d = new Float32Array(at * 3), dn = new Float32Array(at * 3), nm = 'pitch_Fin_Pelvic';
      d.set(pp.delta, o * 3); dn.set(pp.dnormal, o * 3);
      names.push(nm); targets.push(deltasToObject(d)); normalTargets.push(dirsToObject(dn));
      drive[nm] = { fin: 'Fin_Pelvic', target: 'pitch', joint: 'J_pelvic', channel: 'pitch', per: +pp.pL.toFixed(4), note: `the pelvic card turned about J_pelvic's pivot by ${pp.pL.toFixed(2)}° (the land state's pitch; lod2 has no J_pelvic): weight = J_pelvic pitch / ${pp.pL.toFixed(2)}` };
      const fp = finParts.Fin_Pelvic.targets;
      finParts.Fin_Pelvic.targets = { names: [...fp.names, 'pitch'], deltas: [...fp.deltas, pp.delta] };
      for (const [st, S] of Object.entries(states0)) cardMorph(st, 'Fin_Pelvic', 'pitch', Math.min(1, Math.max(0, (S.pose.J_pelvic?.pitch ?? 0) / pp.pL)));
    }
    // (each card a joint the far tier does not keep carries — the pectorals' junction, mid-blade and tips (lod2 keeps
    // J_pecL alone), the pelvic's J_pelvic — in each reference state as the hero holds it: B2's far paddles kept the
    // bind junction in WATER (the hero's J_pecFin flexion −15°, sweep 20°: 3.2 mm off, 0.57 of the hero's area). A
    // corrective `<state>_<fin>`, weight 1 in that state only (the states' lod2 poses set it): the bind-frame displacement
    // that lands the card, at that state's weights and skinned as lod2 skins it, on the card skinned by the hero's
    // joints (headmorphs.solveBindDelta); none where the two are within 0.05 mm)
    const keep2 = new Set(TIER_JOINTS.lod2), W2names = TIER_JOINTS.lod2;
    for (const def of defs) {
      const f = fins[def.name], c = f.mesh, hw = f.w, lw = toTier(f.w), n = c.position.length / 3;
      let carried = false;
      for (let i = 0; i < n * 4 && !carried; i++) if (hw.weights[i] && !keep2.has(TIER_JOINTS.hero[hw.joints[i]])) carried = true;
      if (!carried) continue;
      const T = finParts[def.name].targets, raw = {};
      for (const [st, S] of Object.entries(states0)) {
        const w = { ...(S.pose.morph?.[def.name] ?? {}), ...(lod2Morph[st]?.[def.name] ?? {}) };
        // (X: the card at the state's weights as lod2 holds it, its targets as written (the pectoral plant's with the
        // junction's nominal flexion baked in, the cup's pitch); R: the card in the fin's own state shapes, unbaked,
        // which the hero's joints then carry)
        const X = Float32Array.from(c.position), R = Float32Array.from(c.position);
        T.names.forEach((k, i) => { if (w[k]) for (let q = 0; q < X.length; q++) X[q] += w[k] * T.deltas[i][q]; });
        for (const [k, wk] of Object.entries(w)) {
          if (!wk || !(def.targets ?? []).includes(k) || /Mid$/.test(k)) continue;
          raw[k] ??= finCard(def, { state: k }).position;
          for (let q = 0; q < R.length; q++) R[q] += wk * (raw[k][q] - c.position[q]);
        }
        const Ph = skinPacked(R, hw, poseWorldHero(S.pose)), W2 = poseWorldHero(poseForTier(S.pose, 'lod2'));
        const P2 = skinPacked(X, lw, W2, { names: W2names });
        let err = 0; for (let q = 0; q < X.length; q++) err = Math.max(err, Math.abs(Ph[q] - P2[q]));
        if (err < 0.05) continue;
        const E = Float32Array.from(Ph, (v, q) => v - X[q]), dl = solveBindDelta(X, lw, W2names, W2, E);
        const X1 = Float32Array.from(X, (v, q) => v + dl[q]), N0 = vertexNormals(X, c.indices), N1 = vertexNormals(X1, c.indices);
        const o = offsets[def.name], d = new Float32Array(at * 3), dn = new Float32Array(at * 3), nm = `${st}_${def.name}`;
        d.set(dl, o * 3); dn.set(Float32Array.from(N1, (v, q) => v - N0[q]), o * 3);
        names.push(nm); targets.push(deltasToObject(d)); normalTargets.push(dirsToObject(dn));
        drive[nm] = { fin: def.name, target: st, state: st, note: `lod2 only: the ${def.name} card as the hero's joints (which lod2 drops) hold it in the reference state '${st}' (${err.toFixed(2)} mm off without it): weight 1 in that state` };
        finParts[def.name].targets = { names: [...finParts[def.name].targets.names, st], deltas: [...finParts[def.name].targets.deltas, dl] };
        cardMorph(st, def.name, st, 1);
      }
    }
    cardTargets = { names, vertices: at };
    countMorph('Fins', at, names.length, true);
    addMeshNode('Fins', [gb.primitive({ position: mf.position, normal: mf.normal, uv: mf.uv, indices: mf.indices, material: mats.fin, extraAttributes: skinAttrs(mf), targets, normalTargets })],
      { targetNames: names, drive, drivers: Object.fromEntries(names.map((k) => [k, drive[k].note])), tobihaze: { part: 'fins', merged: true, fins: defs.map((d) => d.name), offsets } }, { tobihaze: { fin: 'merged' } }, { weights: names.map(() => 0) });
  } else {
    for (const def of defs) {
      const f = fins[def.name], m0 = f.mesh, tg = f.targets, w = toTier(f.w);
      finBind[def.name] = m0.position;
      finParts[def.name] = { position: m0.position, indices: m0.indices, skin: w, targets: { names: tg.names, deltas: tg.deltas } };
      // (per-vertex tangents: the corners that disagree split their vertex, every target and the skin carried along)
      const extra = { joints: w.joints, weights: w.weights };
      tg.deltas.forEach((d, i) => { extra[`d${i}`] = d; });
      tg.normals.forEach((d, i) => { extra[`n${i}`] = d; });
      const m = withTangents(m0, extra);
      gateTangent(def.name, m.normal, m.tangent);
      const prim = gb.primitive({
        position: posToObject(m.position), normal: dirsToObject(m.normal), tangent: dirsToObject(m.tangent, 4), uv: m.uv, indices: compactIndices(m.indices, m.position.length / 3), material: mats.fin,
        targets: tg.deltas.map((_, i) => deltasToObject(m[`d${i}`])), normalTargets: tg.normals.map((_, i) => dirsToObject(m[`n${i}`])), extraAttributes: skinAttrs({ joints: m.joints, weights: m.weights }),
      });
      finMorphs[def.name] = tg.names;
      countMorph(def.name, m.position.length / 3, tg.names.length, tg.normals.length > 0);
      addMeshNode(def.name, [prim], { targetNames: tg.names, drivers: Object.fromEntries(tg.names.map((k) => [k, FIN_DRIVERS[k] ?? ''])), tobihaze: { part: 'fin', fin: def.name } }, { tobihaze: { fin: def.name } }, { weights: tg.names.map(() => 0) });
    }
  }
  for (const m of morphMeshes) countMorph(m.name, m.vertices, m.names.length, true);
  if (tierName === 'hero') { const hm = H.tier; gateTangent('skin', hm.normal, hm.tangent); }
  else if (!lod2) gateTangent('skin', body.normal, body.tangent);

  // ---- the reference states and the ground contacts (rig.contactsFor on this tier's own posed skin and fins, in the
  // hero's states so every tier stands in the same pose; each contact bone-local on the tier joint that carries it)
  const states = withCardMorphs(heroStates(H), lod2Morph);
  const morphNamesOfTier = morph?.names ?? [];
  const cparts = { skin: { position: body.position, indices: body.indices, skin: bodySkin }, fins: finParts };
  // (round B3: the tier's own pose of each state, rig.statePose(state, tier), for the contacts and the extras alike)
  const tierStates = Object.fromEntries(Object.entries(states).map(([st, S]) => [st, { ...S, pose: tierStatePose(st, S, tierName, morphNamesOfTier) }]));
  const cres = contactsFor(tierName, cparts, { states: tierStates });
  const gaps = contactGaps(tierName, cparts, cres);
  const contacts = {}, stateExtras = {};
  for (const [st, R] of Object.entries(cres)) {
    contacts[st] = R.contacts.map((c) => ({ ...c, gapMM: gaps[st][c.name] }));
    stateExtras[st] = { pose: tierStates[st].pose, groundMM: R.groundMM, groundM: +toObject([0, R.groundMM, 0])[1].toFixed(7), morphs: R.morphs };
  }
  // (round B3 integration: the crawl's stance per tier, rig.crawlFrames)
  const crawl = tierCrawl(tierName, H, { position: body.position, skin: bodySkin, names: TIER_JOINTS[tierName] }, morphNamesOfTier);
  log(`${tierName}: crawl ${crawl.frames.length} frames, stride ${crawl.strideMM} mm, tip error max ${Math.max(0, ...crawl.frames.map((f) => f.tipErrMM ?? 0))} mm`);
  const armShare = (v) => { const s = tierName === 'hero' ? body.source[v] : null; if (s !== null) return H.rig.m[s]; let a = 0; for (let q = 0; q < 4; q++) if (/^J_pec/.test(TIER_JOINTS[tierName][bodySkin.joints[v * 4 + q]])) a += bodySkin.weights[v * 4 + q] / 255; return a; };

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
  const morphs = {};
  for (const m of morphMeshes) morphs[m.name] = { names: m.names, drivers: Object.fromEntries(m.names.map((k) => [k, MORPH_DRIVERS[k]])), drive: Object.fromEntries(m.names.map((k) => [k, MORPH_DRIVE[k]])) };
  if (headSplit?.dropped?.length) morphs.dropped = Object.fromEntries(headSplit.dropped.map((k) => [k, k === 'vent' ? 'no vertex moves: headrig VENT_CORR (round n17) relaxes nothing (lambda 0, endR 0); the gill slit opens by J_opercL/R alone (HEAD_POSES vent)' : 'no vertex moves']));
  if (Object.keys(finMorphs).length) morphs.fins = { targets: finMorphs, drivers: FIN_DRIVERS };
  if (cardTargets) morphs.Fins = { names: cardTargets.names, note: '<state>_<fin>: each card\'s state as the hero\'s fin of that name takes it (fold and spread for every card, the caudal\'s flex, the pectorals\' furl and plant, the pelvic\'s press; weight = the near tiers\' fin weight); pitch_Fin_Pelvic: driven by J_pelvic pitch (drive); <reference state>_<fin> (e.g. water_Fin_Pectoral_L): lod2-only correctives, weight 1 in that state\'s lod2 pose (the card as the hero\'s dropped joints hold it)' };
  // (round B3: the hero's, the same in every tier)
  const footprint = (H.footprint ??= footprintOf(H.tier, (v) => H.rig.m[H.tier.source[v]]));
  const rootNode = gb.addNode({
    name: `${P}_Adult`, children: [rootJoint],
    extras: {
      species: 'periophthalmus_modestus', commonName: 'トビハゼ', totalLength_mm: TL, standardLength_mm: +SL.toFixed(3),
      units: 'metres (+X the fish\'s left, +Y dorsal, +Z anterior)',
      tobihaze: {
        tier: tierName, round: 'B3 clay', hlMM: +HL.toFixed(4), tlMM: TL, slMM: +SL.toFixed(3),
        joints: kept.map((j) => j.name), remapFromHero: Array.from(remap),
        axes: tierAxes(tierName, morphNamesOfTier),
        morphs, regions, footprint,
        // per reference state: the pose (channel values by joint, AXES order; lod2's arms as quaternions), the ground
        // under it (fish mm and object y in m: the posed fish's lowest point) and the blend-shape weights it assumes
        states: stateExtras,
        // the crawl's stance (rig.crawlFrames): frames of poses, the welded tip (fish mm and object m), the stride
        crawl,
        // per state: [{ name, kind, bone (this tier's joint), local (object m from the joint's pivot in its bind frame:
        // bone · local is the point whatever the bone does), mm / obj (the posed point), groundGapMM, gapMM (the
        // bone-carried point's distance to this tier's posed surface) }]
        contacts,
        layout: BODY_LAYOUT,
        eyes: lod2 ? { merged: 'Body', note: 'lod2: both globes at rest in the Body, on J_head' } : { meshes: ['Eye_L', 'Eye_R'], nodes: ['Eye_L', 'Eye_R'], note: 'a mesh a side, the right the left\'s mirror image with its own tangents (no mirroring node scale)' },
      },
      regions,
    },
  });
  gb.addScene(P, [rootNode, ...sceneNodes]);
  const buf = gb.toBuffer();
  if (outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, buf); }
  const tris = Object.entries(meshTris).filter(([k]) => !/^Body_(skin|eyes)$/.test(k)).reduce((a, [, t]) => a + t, 0);
  // (round B3 integration: a non-finite gap fails the gate; the max is taken over the finite ones: B2's sort put NaN anywhere)
  const contactGate = Object.fromEntries(Object.entries(gaps).map(([st, g]) => {
    const all = Object.entries(g), bad = all.filter(([, v]) => !Number.isFinite(v)).map(([k]) => k);
    const w = all.filter(([, v]) => Number.isFinite(v)).sort((x, y) => y[1] - x[1])[0];
    return [st, { maxGapMM: w?.[1] ?? null, worst: w?.[0] ?? null, n: all.length, nonFinite: bad, pass: !bad.length && (w?.[1] ?? 0) <= 1e-4 }];
  }));
  const failed = Object.entries(contactGate).filter(([, g]) => !g.pass);
  if (failed.length) log(`${tierName}: CONTACT GATE FAILS: ${failed.map(([st, g]) => `${st} max ${g.maxGapMM} mm (${g.worst})${g.nonFinite.length ? `, non-finite ${g.nonFinite.join(', ')}` : ''}`).join('; ')}`);
  const res = {
    tier: tierName, tris, joints: sk.length, materials: gb.json.materials.length, images: (gb.json.images ?? []).length, meshes: meshTris, headSplit, file: outFile, bytes: buf.length, morphs: morph?.names ?? [],
    tangentGate, contactGate, gpu, footprint, states: { ...stateExtras, crawl: crawl.frames.map((f) => ({ phase: f.phase, pose: f.pose, weldMM: crawl.weldMM })) }, crawl: { strideMM: crawl.strideMM, weldMM: crawl.weldMM, tipErrMM: crawl.frames.map((f) => f.tipErrMM ?? null) }, blinkWrap: morph?.blinkWrap ?? null, residual: morph?.residual ?? null, cardTargets,
    land: tierName === 'hero' ? { sides: states.land.solved.sides, ground: states.land.ground, pelvic: states.land.solved.pelvic ?? null } : undefined,
  };
  log(`${tierName}: ${tris} triangles (${Object.entries(meshTris).map(([k, v]) => `${k} ${v}`).join(', ')}), ${sk.length} joints, ${res.materials} materials → ${outFile ? path.relative(root, outFile) : '(not written)'} (${(buf.length / 1e6).toFixed(2)} MB)`);
  log(`${tierName}: tangents ${Object.entries(tangentGate).map(([k, g]) => `${k} ${g.bad}/${g.n}`).join(', ')}; contacts max gap ${Object.entries(contactGate).map(([k, g]) => `${k} ${g.maxGapMM} (${g.worst})`).join(', ')} mm; morph textures ${(gpu.morphBytes4096 / 1e6).toFixed(2)} MB (4096 rows)`);
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const which = arg('--tier', 'all');
  const outDir = path.resolve(arg('--out', path.join(here, 'out', 'tiers')));
  const clay = args.includes('--clay');
  if (!clay) logDefault('round B3 has no textures yet: writing clay materials (--clay)');
  const cache = arg('--cache', null);
  const heroH = arg('--hero-h', null);
  const hero = await heroData({ cache: cache ? path.resolve(cache) : null, h: heroH ? Number(heroH) : null });
  const results = [];
  for (const t of which === 'all' ? Object.keys(TIERS) : which.split(',')) results.push(await buildTier(t, { outFile: path.join(outDir, `tobihaze.${t}.glb`), clay: true, hero }));
  // the reference states' poses per tier (the GLBs' extras tobihaze.states), for the render shots (shots-final.mjs)
  const statesOut = Object.fromEntries(results.filter((r) => r.states).map((r) => [r.tier, r.states]));
  for (const r of results) delete r.states;
  const prev = fs.existsSync(path.join(outDir, 'states.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'states.json'))) : {};
  fs.writeFileSync(path.join(outDir, 'states.json'), JSON.stringify({ ...prev, ...statesOut }, null, 1));
  const prevReport = fs.existsSync(path.join(outDir, 'build-report.json')) && which !== 'all' ? JSON.parse(fs.readFileSync(path.join(outDir, 'build-report.json'))).filter((r) => !results.some((x) => x.tier === r.tier)) : [];
  fs.writeFileSync(path.join(outDir, 'build-report.json'), JSON.stringify([...prevReport, ...results], null, 1));
}
