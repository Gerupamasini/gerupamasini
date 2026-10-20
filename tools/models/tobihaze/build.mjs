#!/usr/bin/env node
// The トビハゼ model as one GLB per tier (rounds B1–B4: the clay stage, with its rig, blend shapes and LOD tiers; the
// textures are the next round). The pieces:
//   skin    the whole fish's sculpt (head.mjs + body.mjs) meshed per tier (fishmesh.mjs bodyTierMesh: the hero's full
//           sculpt at h 0.09 mm, lod1's sealed one at 0.16, lod2's far one at 0.40), UV-charted on the body atlas
//   rig     rig.mjs: the 33 hero joints (the head's mechanism, the axial chain, the pectoral arms, the pelvic base), their
//           weight rows on the hero's dense mesh (heroRig), the head's blend shapes solved on its packed skin
//           (headmorphs.mjs); lod1 and lod2 carry both over from the hero's dense mesh by tissue class (transfer.mjs)
//           and re-solve the blend shapes against their own reduced skins (26 and 12 joints)
//   eyes    eyemesh.mjs: a globe mesh under each eye joint (Eye_L; Eye_R the left's mirror image built as its own mesh
//           with its own tangents, round B3; one primitive, round B4), merged into the Body at lod2
//   teeth   teeth.mjs: the fitted tooth rows (hero), on J_premax and J_imj
//   fins    fins.mjs: the seven fins with their blend shapes (fold, spread; the caudal's flex; the pectorals' furl, plant +
//           plantMid; the pelvic's press family: pressLow, press, pressHigh, pressDeep, round B4); the caudal's sheath
//           (round B4: the fleshy base past the skin's end, its triangles flagged in the fin mesh's extras `sheath` to be
//           drawn opaque); lod2: one card each, merged into one alpha-tested `Fins` mesh with every card's states, the far
//           cup's J_pelvic pitch and the reference states' correctives as blend shapes
// The hero's dense mesh, its rows and blend shapes are computed once (heroData) and reused by every tier.
//   node tools/models/tobihaze/build.mjs [--tier hero|lod1|lod2|all] [--out <dir>] [--clay] [--cache <file>] [--hero-h <mm>]
// --out defaults to tools/models/tobihaze/out/tiers/ (shipping into src/assets/ is a later round); --cache keeps the
// hero data on disk (a scratch file) so a rebuild of the GLBs skips the hero's meshing, weights and blend-shape solve
// (several minutes); --clay writes clay materials (the only kind this round: without it the build says so and writes
// clay all the same).
//
// Meshes per tier — the draws (class M budget, body_contract §6; CLAUDE.md counts a material as a draw: M hero 6, lod1
// 4, lod2 2; round B4 against B3's 18 / 18 / 2: one primitive an eye, the fins merged, lod1's skin one mesh). The skin is
// split by the blend-shape groups that move it (headmorphs.splitByMorphs) only where the morph textures need it:
//   hero  9 draws: Head_Orbit (blinkL, blinkR, eyesUpL, eyesUpR; inflate, inflateMid where the cheeks reach it),
//         Head_Mouth (gape, gum; throat, inflate, inflateMid), Head (throat, inflate, inflateMid), Body (static),
//         Mouth_Teeth, Eye_L, Eye_R, Fins_Median (D1, D2, anal, caudal) and Fins_Paired (the pectorals, the pelvic), each
//         fin's shapes `<target>_<fin>` (FIN_MESHES). The split is the morph memory's (round B4, at 4096 / 8192 / 16384
//         rows, B3's geometry, with the planned maps): as here 27.2 / 27.7 / 28.5 MB (34.1 with a third body map at
//         2048); the three head meshes as one (7 draws) 30.7 / 31.9 / 32.6 (38.2); the whole skin one mesh (6 draws) 36.0
//         / 36.6 / 37.4 (42.9: no third map). The fins: seven meshes 2.1–3.1 MB of morph textures, the two groups 7.5–8.1,
//         one mesh 15.9–17.3
//   lod1  4 draws: Body (the whole skin, blinkL, blinkR, throat, inflate, inflateMid, eyesUpL, eyesUpR), Fins (the seven,
//         their shapes' positions only), Eye_L, Eye_R
//   lod2  2 draws: Body (with both eyes at rest), Fins (the cards, MASK)
// (the exact target list per mesh is in each tier's extras tobihaze.morphs and the build report's headSplit)
// Materials (clay): Tobihaze_Body (the skin, the teeth by their swatch), Tobihaze_Eye (each globe whole: its skin cap
// from the atlas's eyeSkin rect, its window — the iris ring and the pupil — from the iris rect; round B4, B3's eye was
// three primitives on Body, Cornea and Iris; the viewer's clay paints the rects from the root extras' eyes.clay),
// Tobihaze_Fin (BLEND, double-sided; lod2 Tobihaze_Fins, MASK): 3 materials at hero and lod1, 2 at lod2.
// GPU plan for the textures round (TEX_PLAN; build report gpu: vertex and index buffers as written, the morph textures
// at 4096 / 8192 / 16384 rows — three.js packs a mesh's targets in one RGBA32F texture, rows of the GPU's maximum
// texture size — and the maps as KTX2 → BC7 / ASTC, a byte a texel, mipmaps a third more), round B4 on B3's geometry:
//   hero  body colour (RGB, A pigment) and body normal (XY, B roughness, A occlusion: the gobies' packing) at 2048 —
//         5.59 MB each — and the fin atlas (colour, A coverage) at 1024, 1.40 MB: maps 12.58 MB; buffers 2.90 MB; morph
//         textures 11.7 / 12.3 / 13.0 MB; total ≤ 28.5 MB of 40 (29.3 with the B4 merge: the pelvic press family and
//         the pectoral key's fins), 11 MB to spare for a third body map (pigment / thickness) at 2048
//   lod1  body colour at 1024 (1.40 MB), body normal at 512 (0.35 MB), fin atlas at 512 (0.35 MB): maps 2.10 MB; buffers
//         0.35 MB; morph textures 2.39 / 2.85 / 2.25 MB; total ≤ 5.29 MB of 6 (5.44 with the B4 merge). The normal at
//         512 because one skin mesh (4 draws) holds 1.2–1.8 MB of morph textures (B3's five held 0.33): both body maps at
//         1024 are 5.88 / 6.34 / 5.75 MB (6.03 / 6.48 / 5.89 merged), over at 4096 and 8192 rows; they fit only with a
//         fifth draw (the skin split, 5.42) or with lod1's skin shapes carrying no normal deltas (5.13–5.42: the rig's
//         round-B4 shading of lod1's blink, eyes-up and cheeks lost). The 512 normal map is 0.125 mm a texel on the body,
//         finer than a screen pixel at lod1's distances (~0.3 mm and up); the same maps as the hero's, one shader
//   lod2  body colour and fin atlas at 256 (0.09 MB each), buffers 0.03, morph textures 0.05: 0.25 MB of 0.5
// The fins keep no normal map at any tier (their relief is the hero's geometry; the gobies' standard fins alike); the eye
// reads the body maps. Same maps and blending at hero and lod1 (the body and the eye opaque with the same maps, the fin
// blended); lod2 the colours only, the fins alpha-tested.
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
import { JOINTS, J, NJ, TIER_JOINTS, jointsForTier, heroRig, packTop4, morphSkin, skinForTier, finWeights, teethWeights, axesForTier, partShares, poseWorldHero, skinPacked, statePose, crawlFrames, propFrames, plantedSole, fishToQuatObj, contactsFor, contactGaps, poseForTier, mirrorErrors, limitExcess, AXES, stateTransitions } from './rig.mjs';
import { headMorphs, solveBindDelta, poseWorldFor, skinWith, wrapMorph, MORPH_ORDER, MORPH_EXTRA, MORPH_DRIVERS, MORPH_DRIVE, MORPH_EPS, MORPH_GROUPS_SIDES, MORPH_MESH_SIDES, pruneMorphs, splitByMorphs, morphJointMove } from './headmorphs.mjs';
import { vertexGrid, tissueClass, transferRows, eyeLiftOnTier } from './transfer.mjs';
import { eyeMeshForTier, eyesAtRest, EYE_TIERS } from './eyemesh.mjs';
import { teethMesh } from './teeth.mjs';
// (round B4: the clay renderer's eye atlas, the root extras' eyes.clay)
import { eyeClayAtlas } from './eyemesh.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const t0 = Date.now();
const logDefault = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${m}`);

/**
 * The fins as draws (round B4; CLAUDE.md counts a material as a draw: class M hero 6, lod1 4, lod2 2): the near tiers'
 * fins merged into meshes of several fins each, every fin's blend shapes kept as `<target>_<fin>` (the far tier's card
 * names: the viewer and a runtime pose both alike, pose.morph[fin][target]), zero off the fin's own vertices. three.js
 * keeps a mesh's targets in one RGBA32F texture of (vertices × (1 + normals)) texels per target, so a merged mesh pays
 * every fin's targets on every fin's vertices: the hero groups the median fins and the paired ones (2 draws; 7.5–8.1 MB
 * of morph textures at 4096–16384 rows against 2.1–3.1 MB as seven meshes, 15.9–17.3 MB as one), lod1 merges all seven
 * (one draw) and keeps their targets' positions only (`normals: false`: 1.0 MB, against 2.0–2.9 MB with the normals,
 * which lod1's 6 MB cannot hold; build-report gpu, the plan in the header).
 */
const FIN_MESHES = {
  hero: { normals: true, groups: { Fins_Median: ['Fin_Dorsal1', 'Fin_Dorsal2', 'Fin_Anal', 'Fin_Caudal'], Fins_Paired: ['Fin_Pectoral_L', 'Fin_Pectoral_R', 'Fin_Pelvic'] } },
  lod1: { normals: false, groups: { Fins: ['Fin_Dorsal1', 'Fin_Dorsal2', 'Fin_Anal', 'Fin_Caudal', 'Fin_Pectoral_L', 'Fin_Pectoral_R', 'Fin_Pelvic'] } },
};
/**
 * The textures round's maps per tier (the GPU plan in the header): KTX2 → BC7 / ASTC 4×4, a byte a texel, mipmaps a
 * third more (docs/quality/model-budget.md §1; tools/models/budget.mjs). The body atlas (BODY_LAYOUT; the eye reads it
 * through its iris and eyeSkin rects) in two maps, channels packed as the gobies' (tools/lib/gobyBuild.mjs `channels`):
 * colour (RGB albedo, A pigment / translucency) and normal (XY, B roughness, A occlusion); the fin atlas (fins.mjs
 * FIN_ATLAS) in one, colour with the membrane's coverage in A (the fins' relief is their geometry at the hero; no fin
 * normal map at any tier, as the gobies' standard fins). The near tiers have the same maps (one shader set); lod1's
 * normal at half its colour's size (its skin's single morph mesh is 1.2–1.8 MB of morph textures by the GPU's row
 * size: the 6 MB holds the 4 draws only so); lod2 the two colours only.
 */
export const TEX_PLAN = {
  hero: [{ map: 'body colour', px: 2048 }, { map: 'body normal', px: 2048 }, { map: 'fin colour', px: 1024 }],
  lod1: [{ map: 'body colour', px: 1024 }, { map: 'body normal', px: 512 }, { map: 'fin colour', px: 512 }],
  lod2: [{ map: 'body colour', px: 256 }, { map: 'fin colour', px: 256 }],
};
/** The class-M GPU limits per tier (MB; tools/models/budget.json), and the draws CLAUDE.md allows (materials). */
const GPU_LIMIT = { hero: 40, lod1: 6, lod2: 0.5 }, DRAW_LIMIT = { hero: 10, lod1: 4, lod2: 2 };
/** lod2's fin cards' blend shapes carry normal deltas (round B4: no, see the Fins mesh). */
const LOD2_CARD_NORMALS = false;
/** lod2's crawl keys at most (+ the last): tierCrawl takes every k-th of the hero's (round B4). */
const LOD2_CRAWL_FRAMES = 16;
/** lod2's card fitted onto the hero's fin in a reference state (fitCard) where it misses it by `over` mm more than in the
 * bind and the fit gains `gain` mm (round B4). */
const CARD_FIT = { over: 0.3, gain: 0.2 };
/** Per tier: the skin's mesh tier (fishmesh TIERS), the eye's rings, the fins' mesh options, the teeth, the blend
 * shapes and the mesh that carries them (skinMeshes: 'split' the hero's blend-shape groups, headmorphs.splitByMorphs;
 * 'one' a single skin mesh with every shape), the fins' meshes (FIN_MESHES). */
export const TIERS = {
  hero: { mesh: 'hero', eye: EYE_TIERS.hero, fins: 'hero', teeth: true, morphs: [...MORPH_ORDER, ...MORPH_EXTRA], morphMesh: 'Head', skinMeshes: 'split', finMeshes: FIN_MESHES.hero },
  // (round B3: lod1 has the eyes-up correctives too, re-solved on its skin as its other shapes, so its alert eyes lift as
  // the hero's: B2 held lod1's lift to liftBareM, 0.47 mm under the hero's at the switch; round B4: one skin mesh with all
  // of them, see FIN_MESHES for the draws)
  lod1: { mesh: 'lod1', eye: EYE_TIERS.lod1, fins: 'lod1', teeth: false, morphs: ['blinkL', 'blinkR', 'throat', 'inflate', 'inflateMid', 'eyesUpL', 'eyesUpR'], morphMesh: 'Head', skinMeshes: 'one', finMeshes: FIN_MESHES.lod1 },
  lod2: { mesh: 'lod2', eye: EYE_TIERS.lod2, fins: 'card', teeth: false, morphs: [], merged: true },
};
const P = 'Tobihaze';
/** The hero blend shapes the simplifier keeps vertices for (fishmesh.morphAttrs: 6 × 3 floats; 23 with normal and uv). */
const HERO_ATTR_MORPHS = ['blinkL', 'blinkR', 'gape', 'vent', 'inflate', 'throat'];
/** lod1's: the blink and the inflation (the design §3.3). */
const LOD1_ATTR_MORPHS = ['blinkL', 'blinkR', 'inflate'];
/** The fins' blend shapes' drivers (fins.mjs): fold and spread are opposite (drive one at a time). */
const FIN_DRIVERS = {
  press: 'pelvic: w, the cup pressed on the ground under the chest at the land state\'s 15° raise (each ray from its base onto a plane under the bases; J_pelvic near 0)',
  pressLow: 'pelvic (round B4): the press for a low chest (raise ~10°: the reach, low props); with press, pressHigh, pressDeep a family blended by the two that bracket the chest\'s height (rig pressPelvic → fins pelvicPressWeights), J_pelvic within its clean range',
  pressHigh: 'pelvic (round B4): the press for a high chest (raise ~22.5°)',
  pressDeep: 'pelvic (round B4): the press for the highest props (raise ~30°: the rays as deep as they reach)',
  fold: 'w: the fin folded (median fins down along the back / belly, the caudal closed into its spear, the pectoral fan closed, the pelvic laid back); drive fold or spread, not both',
  spread: 'w: the fin erect / its fan fully open (fold or spread, not both); the pectoral\'s 0.5 is the reach\'s half-spread fan laid flat on the mud',
  flex: 'caudal: w > 0 bends the fin\'s rear to the fish\'s left (+X), w < 0 to the right',
  plant: 'pectoral (round B4, plant mode \'edge\'): w, the land leg\'s foot: the furled bundle bent forward in its own plane at the junction and the heel, the foot lying on its lower edge (the broad faces to the side, the toe line level; rig planeArm / solveArmPlant); from furl, not with it',
  plantMid: 'pectoral: 4·w·(1 − w) of plant (keeps the rays their length half way)',
  furl: 'pectoral: w, the rays bundled into a narrow fan, the membrane pleated between them (its surface ~70 % of the spread fan\'s); the crawl\'s crutch (rig crawlCycle: its distal tip rolls on the mud) and the rest (laid flat on the mud, A030); drive furl or plant, not both',
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
function clayMaterials(gb, tier, layout = BODY_LAYOUT) {
  const lod2 = tier === 'lod2';
  const body = gb.addMaterial({ name: `${P}_Body`, pbrMetallicRoughness: { baseColorFactor: [0.72, 0.70, 0.66, 1], metallicFactor: 0, roughnessFactor: 0.6 }, extras: { tobihaze: { role: 'body', ...(lod2 ? {} : { layout }) } } });
  const fin = gb.addMaterial({
    name: lod2 ? `${P}_Fins` : `${P}_Fin`, doubleSided: true,
    alphaMode: lod2 ? 'MASK' : 'BLEND', ...(lod2 ? { alphaCutoff: 0.5 } : {}),
    pbrMetallicRoughness: { baseColorFactor: [0.74, 0.68, 0.58, lod2 ? 1 : 0.75], metallicFactor: 0, roughnessFactor: 0.5 },
    extras: { tobihaze: { role: 'fin', ...(lod2 ? { merged: true } : {}) } },
  });
  if (lod2) return { body, fin };
  // (round B4: one Eye material for the whole globe, the skin cap and the window, read through the body atlas's eyeSkin
  // and iris rects (the textures round: the Body's maps, the window glossy in them); B3 drew the skin with the Body
  // material and the window with Cornea and Iris, three primitives a globe. Clay: the viewer paints the rects from the
  // root extras' eyes.clay, eyemesh.eyeClayAtlas)
  const eyeX = { role: 'eye', radiusMM: +EYE_MM.radius.toFixed(4), irisRect: rectUVWH(BODY_LAYOUT.iris), skinRect: rectUVWH(BODY_LAYOUT.eyeSkin), maps: 'the body atlas (iris, eyeSkin rects)' };
  const eye = gb.addMaterial({ name: `${P}_Eye`, pbrMetallicRoughness: { baseColorFactor: [0.72, 0.70, 0.66, 1], metallicFactor: 0, roughnessFactor: 0.35 }, extras: { tobihaze: eyeX } });
  return { body, fin, eye };
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
      // (round B4, tech P1: a shape posed by the eyes' translation (eyesUp, the wrapped blink) shaded on its whole move,
      // the eye joints' share of the lift or drop included: headmorphs.morphJointMove)
      const WD = new Float32Array(nw * 3), jm = morphJointMove(nm, skin, TIER_JOINTS[tierName], n);
      for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) WD[wid[v] * 3 + c] = morphs.d[nm][v * 3 + c] / HL + (jm ? jm[v * 3 + c] : 0);
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
  // (round B4, tech P5: a tier without eye joints has no `eyes` block, not a null one)
  if (axes.eyes == null) delete axes.eyes;
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
 * The far tier's pelvic cup turned as J_pelvic turns it (lod2 keeps 12 joints; J_pelvic's weights ride J_head): the bind
 * card turned about J_pelvic's pivot to each end of the channel's range (AXES J_pelvic pitch), blend shapes `pitchUp`
 * and `pitchDown` (delta and normal delta, fish mm), weight clamp(J_pelvic pitch / end, 0, 1) each — so the drive covers
 * the whole range (round B4, tech P3: B3's one `pitch` was authored at the land state's 1.445°, and the [0, 1] clamp held
 * the far cup to 0–1.45° of [−20, 35]); the reference states' residual is their `<state>_Fin_Pelvic` corrective.
 * [{ name, deg, delta, dnormal }], none for an end within 0.5° of 0.
 */
function pelvicPitchTargets(fin) {
  if (!fin) return [];
  const c = fin.mesh, n = c.position.length / 3;
  const X = Float64Array.from(c.position), Nn = Float64Array.from(c.normal ?? vertexNormals(c.position, c.indices));
  // (the channel's axis in the object frame → the fish frame: dirToObject is (s, y, z) → (z, y, −s), a rotation)
  const C = AXES.joints.J_pelvic.channels.pitch, ao = C.axis, a0 = [-ao[2], ao[1], ao[0]], al = Math.hypot(...a0), ax = a0.map((x) => x / al), piv = JOINTS[J.J_pelvic].at;
  return [['pitchDown', C.range[0]], ['pitchUp', C.range[1]]].filter(([, deg]) => Math.abs(deg) > 0.5).map(([name, deg]) => {
    const th = (deg * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th);
    const rot = (v) => { const d = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2], cr = [ax[1] * v[2] - ax[2] * v[1], ax[2] * v[0] - ax[0] * v[2], ax[0] * v[1] - ax[1] * v[0]]; return [0, 1, 2].map((k) => v[k] * cs + cr[k] * sn + ax[k] * d * (1 - cs)); };
    const delta = new Float32Array(n * 3), dnormal = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      const r = rot([X[v * 3] - piv[0], X[v * 3 + 1] - piv[1], X[v * 3 + 2] - piv[2]]), m = rot([Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]]);
      for (let k = 0; k < 3; k++) { delta[v * 3 + k] = r[k] + piv[k] - X[v * 3 + k]; dnormal[v * 3 + k] = m[k] - Nn[v * 3 + k]; }
    }
    return { name, deg, delta, dnormal };
  });
}
/** A point's nearest point on a mesh's triangles (brute force: the cards have tens): { d, t, w: [wa, wb, wc] }. */
function nearestOnMesh(p, V, I) {
  let best = { d: Infinity, t: -1, w: null };
  for (let t = 0; t < I.length; t += 3) {
    const a = [V[I[t] * 3], V[I[t] * 3 + 1], V[I[t] * 3 + 2]], b = [V[I[t + 1] * 3], V[I[t + 1] * 3 + 1], V[I[t + 1] * 3 + 2]], c = [V[I[t + 2] * 3], V[I[t + 2] * 3 + 1], V[I[t + 2] * 3 + 2]];
    const q = closestOnTri(p, a, b, c), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (d >= best.d) continue;
    // (q's barycentric weights in abc)
    const v0 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v2 = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
    const d00 = v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2], d01 = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2], d11 = v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2];
    const d20 = v2[0] * v0[0] + v2[1] * v0[1] + v2[2] * v0[2], d21 = v2[0] * v1[0] + v2[1] * v1[1] + v2[2] * v1[2], den = d00 * d11 - d01 * d01;
    const wb = den > 1e-18 ? (d11 * d20 - d01 * d21) / den : 0, wc = den > 1e-18 ? (d00 * d21 - d01 * d20) / den : 0;
    best = { d, t: t / 3, w: [1 - wb - wc, wb, wc] };
  }
  return best;
}
/** How far a card's vertices (V) lie from the hero's fin points (H, mm) at the farthest. */
function cardOut(V, H) {
  let m = 0;
  for (let i = 0; i < V.length; i += 3) { let bd = Infinity; for (let j = 0; j < H.length; j += 3) bd = Math.min(bd, (H[j] - V[i]) ** 2 + (H[j + 1] - V[i + 1]) ** 2 + (H[j + 2] - V[i + 2]) ** 2); m = Math.max(m, Math.sqrt(bd)); }
  return m;
}
/** How far the hero's fin (points H, mm) lies from a card (V, I): { max, p95 }. */
function cardCover(H, V, I) {
  const d = [];
  for (let i = 0; i < H.length; i += 3) d.push(nearestOnMesh([H[i], H[i + 1], H[i + 2]], V, I).d);
  d.sort((x, y) => x - y);
  return { max: d[d.length - 1] ?? 0, p95: d[Math.floor(0.95 * (d.length - 1))] ?? 0 };
}
/**
 * A far card fitted onto the near fin it stands for (round B4, tech P3: the folded pectoral card lay on the hero's rays
 * but 0.97 mm from its pleated membrane at REST, against 0.56 in the bind): the card's vertices moved by the least-squares
 * offsets that bring the card's surface onto the hero fin's points (each point's nearest card point, by its barycentric
 * weights), damped by `mu` (per vertex, as a share of the points a vertex carries), a few times over.
 * @param V0 the card's posed vertices (mm)   @param I its triangles   @param H the hero fin's posed points (mm)
 */
function fitCard(V0, I, H, { iters = 6, mu = 0.15, nu = 0.3 } = {}) {
  const n = V0.length / 3, V = Float64Array.from(V0), np = H.length / 3;
  for (let it = 0; it < iters; it++) {
    const A = new Float64Array(n * n), B = new Float64Array(n * 3);
    for (let i = 0; i < H.length; i += 3) {
      const p = [H[i], H[i + 1], H[i + 2]], r = nearestOnMesh(p, V, I);
      if (r.t < 0) continue;
      const vs = [I[r.t * 3], I[r.t * 3 + 1], I[r.t * 3 + 2]];
      const q = [0, 1, 2].map((k) => r.w[0] * V[vs[0] * 3 + k] + r.w[1] * V[vs[1] * 3 + k] + r.w[2] * V[vs[2] * 3 + k]);
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) A[vs[x] * n + vs[y]] += r.w[x] * r.w[y];
        for (let k = 0; k < 3; k++) B[vs[x] * 3 + k] += r.w[x] * (p[k] - q[k]);
      }
    }
    for (let i = 0; i < n; i++) A[i * n + i] += (mu * np) / n;
    // (and each card vertex pulled onto its nearest hero point, weight `nu` per vertex as a share of the points it
    // carries: the card covers the fin without standing out past its margins)
    if (nu > 0) for (let i = 0; i < n; i++) {
      let bd = Infinity, bh = 0;
      for (let j = 0; j < H.length; j += 3) { const d = (H[j] - V[i * 3]) ** 2 + (H[j + 1] - V[i * 3 + 1]) ** 2 + (H[j + 2] - V[i * 3 + 2]) ** 2; if (d < bd) { bd = d; bh = j; } }
      const k0 = (nu * np) / n;
      A[i * n + i] += k0;
      for (let k = 0; k < 3; k++) B[i * 3 + k] += k0 * (H[bh + k] - V[i * 3 + k]);
    }
    // (Gaussian elimination with partial pivoting: n is a card's tens of vertices)
    const M = Float64Array.from(A), R = Float64Array.from(B);
    for (let col = 0; col < n; col++) {
      let piv = col; for (let r = col + 1; r < n; r++) if (Math.abs(M[r * n + col]) > Math.abs(M[piv * n + col])) piv = r;
      if (Math.abs(M[piv * n + col]) < 1e-12) continue;
      if (piv !== col) { for (let k = 0; k < n; k++) [M[col * n + k], M[piv * n + k]] = [M[piv * n + k], M[col * n + k]]; for (let k = 0; k < 3; k++) [R[col * 3 + k], R[piv * 3 + k]] = [R[piv * 3 + k], R[col * 3 + k]]; }
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r * n + col] / M[col * n + col]; if (!f) continue;
        for (let k = col; k < n; k++) M[r * n + k] -= f * M[col * n + k];
        for (let k = 0; k < 3; k++) R[r * 3 + k] -= f * R[col * 3 + k];
      }
    }
    for (let i = 0; i < n; i++) if (Math.abs(M[i * n + i]) > 1e-12) for (let k = 0; k < 3; k++) V[i * 3 + k] += R[i * 3 + k] / M[i * n + i];
  }
  return Float32Array.from(V);
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
  // (round B4: the water state is the bottom rest under water (A061); the swimming fish its own state)
  const swim = statePose('swim');
  H.states = { land, reach, rest, water, swim };
  // (round B4, poses P2: the transitions between them, the arms lifted over an arc so no planted blade sweeps the ground,
  // solved on the hero: rig.stateTransitions)
  H.transitions = stateTransitions(H.states, { skin: { ...tierMesh, indices: H.tier.indices }, fins: finParts });
  return H.states;
}

/**
 * The crawl's cycle for a tier (round B4: rig.crawlFrames → crawlCycle, the pectoral key's full cycle — the stance with
 * the furled crutches rolling on their distal tips while the body vaults, then the recovery with the crutches carried
 * forward over an arc; Pace & Gibb 2009, behaviour §3.1). Solved on the build's own land state (heroStates: the body's
 * settle, the pressed pelvic cup) with the tier's fins: the hero's on its tier skin, lod1's on its own skin with its own
 * furled blade (o.tier 'lod1': lod1 has no J_pecTip) on the same land body and ground, lod2's the hero's carried over
 * with each one-bone card aimed at the hero's furled tip (below). The frames' poses add the land state's folded median
 * fins (the crawl is a land gait).
 * @returns { frames: [{ phase, raise, pose, tipErrMM, contacts }], weldMM, weldRMM, weldM, weldBind, strideMM, cycleS,
 *   duty, speedBLs, groundMM, schedule, note }
 */
function finPartsFor(tierName, H) {
  const fins = tierFins(tierName, H);
  return Object.fromEntries(Object.entries(fins).map(([k, f]) => [k, { position: f.mesh.position, skin: tierName === 'hero' ? f.w : skinForTier(f.w, tierName), names: TIER_JOINTS[tierName], targets: { names: f.targets.names, deltas: f.targets.deltas } }]));
}
function tierCrawl(tierName, H, tierMesh, morphNames) {
  const land = H.states?.land?.pose?.morph ?? {};
  const keepFins = Object.fromEntries(Object.entries(land).filter(([k]) => !/^Fin_Pectoral_/.test(k) && k !== 'Fin_Pelvic'));
  const withFins = (pose) => ({ ...pose, morph: { ...keepFins, ...(pose.morph ?? {}) } });
  // (round B4, the pectoral key's request: the cycle on the build's land state (its settle and pelvic press) with the
  // tier's fins and pelvic cup, as its gates were measured; B3's call solved its own fin-less land)
  const opts = (t) => { const fp = finPartsFor(t, H); return { land: H.states.land, fins: fp, pelvic: fp.Fin_Pelvic }; };
  const heroTM = { position: H.tier.position, skin: heroTierSkin(H), names: TIER_JOINTS.hero };
  let C;
  if (tierName === 'lod2') {
    // (lod2 keeps J_pecL alone and a straight card. Round B4 (the pectoral key's request): per frame and side the card is
    // aimed at the hero's blade as it is in that frame — its lowest point: the stance's rolling contact, the recovery's
    // arc; B3 aimed every frame at the phase-0 weld — its length matched by easing only within 'furl' (bind → furl: the
    // 'plant' card bakes the land leg's −84° in-plane sweep and is never blended toward), the shoulder turned by the
    // least rotation that lays the card's tip toward that point; where the straight aim would put the tip under the
    // ground, the tip laid on the ground toward it; and the card's own lowest vertex never under the ground)
    const hero = (H.crawl ??= crawlFrames(heroTM, opts('hero')));
    const card = tierFins('lod2', H).Fin_Pectoral_L, kF = card.targets.names.indexOf('furl'), sh = JOINTS[J.J_pecL].at;
    const cardAt = (w, v) => [0, 1, 2].map((c) => card.mesh.position[v * 3 + c] + w * card.targets.deltas[kF][v * 3 + c]);
    let tv = 0, far = -1;
    for (let v = 0; v < card.mesh.position.length / 3; v++) { const q = cardAt(1, v), d = Math.hypot(q[0] - sh[0], q[1] - sh[1], q[2] - sh[2]); if (d > far) { far = d; tv = v; } }
    const lenAt = (w) => { const q = cardAt(w, tv); return Math.hypot(q[0] - sh[0], q[1] - sh[1], q[2] - sh[2]); };
    const l0 = lenAt(0), l1 = lenAt(1), lMin = Math.min(l0, l1), lMax = Math.max(l0, l1);
    const wFor = (d) => { if (Math.abs(l1 - l0) < 1e-6) return 1; if (d <= lMin) return l0 < l1 ? 0 : 1; if (d >= lMax) return l0 > l1 ? 0 : 1; let a = 0, b = 1; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if ((lenAt(m) - d) * (l1 - l0) > 0) b = m; else a = m; } return (a + b) / 2; };
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
    // (the hero's blade's lowest posed point in the frame — the stance's bearing contact, the recovery's lowest — the
    // target: the hero's furled fin skinned by its hero weights at the frame's pose)
    const g = hero.ground, HF = tierFins('hero', H), heroLow = (pose, S) => {
      const f = HF[`Fin_Pectoral_${S}`], ws = pose.morph?.[`Fin_Pectoral_${S}`] ?? {}, P = Float32Array.from(f.mesh.position);
      f.targets.names.forEach((k, i) => { if (ws[k]) for (let q = 0; q < P.length; q++) P[q] += ws[k] * f.targets.deltas[i][q]; });
      const Q = skinPacked(P, f.w, poseWorldHero(pose));
      let b = null; for (let v = 0; v < Q.length / 3; v++) if (!b || Q[v * 3 + 1] < b[1]) b = [Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2]];
      return b;
    };
    // (the card as lod2 skins it: its lowest vertex, so the aimed card can be lifted onto the ground, never under it)
    const cardL2 = (S) => tierFins('lod2', H)[`Fin_Pectoral_${S}`], cardW = { L: skinForTier(cardL2('L').w, 'lod2'), R: skinForTier(cardL2('R').w, 'lod2') };
    const cardLow = (pose, S, w) => {
      const c = cardL2(S), k = c.targets.names.indexOf('furl'), P = Float32Array.from(c.mesh.position);
      for (let q = 0; q < P.length; q++) P[q] += w * c.targets.deltas[k][q];
      const Q = skinPacked(P, cardW[S], poseWorldHero(poseForTier(pose, 'lod2')), { names: TIER_JOINTS.lod2 });
      let b = null; for (let v = 0; v < Q.length / 3; v++) if (!b || Q[v * 3 + 1] < b[1]) b = [Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2]];
      return b;
    };
    const rotAbout = (k, a) => { const [x, y, z] = k, c = Math.cos(a), sn = Math.sin(a), C1 = 1 - c; return [c + x * x * C1, x * y * C1 - z * sn, x * z * C1 + y * sn, y * x * C1 + z * sn, c + y * y * C1, y * z * C1 - x * sn, z * x * C1 - y * sn, z * y * C1 + x * sn, c + z * z * C1]; };
    // (round B4, tech P4: at most LOD2_CRAWL_FRAMES + 1 keys, every k-th of the hero's and its last — a far card's arm
    // needs no finer cycle, and each key is ~0.3 kB of lod2's JSON)
    const kStep = Math.max(1, Math.ceil((hero.frames.length - 1) / LOD2_CRAWL_FRAMES));
    const frames = hero.frames.filter((_, i, a) => i % kStep === 0 || i === a.length - 1).map((f) => {
      const pose = statePose('land', 'lod2', { hero: { pose: f.pose }, morphNames }).pose, W = poseWorldHero(pose), err = {}, lo = {};
      for (const S of ['L', 'R']) {
        const m = S === 'L' ? 1 : -1, Ws = W[`J_pec${S}`], Wp = W[JOINTS[J[`J_pec${S}`]].parent];
        const at = JOINTS[J[`J_pec${S}`]].at, target = heroLow(f.pose, S);
        const shW = mv(Ws.R, at).map((c, i) => c + Ws.t[i]), dist = Math.hypot(...target.map((c, i) => c - shW[i])), w = wFor(dist), L = lenAt(w);
        let aim = target;
        // (the straight aim's tip: shoulder + L along the target's direction; under the ground → on the ground toward it)
        const tipY = shW[1] + ((target[1] - shW[1]) * L) / (dist || 1);
        if (tipY < g) {
          const hgt = shW[1] - g, hz = [target[0] - shW[0], target[2] - shW[2]], rw = Math.hypot(...hz), rho = Math.sqrt(Math.max(0, L * L - hgt * hgt));
          aim = rw > 1e-9 ? [shW[0] + (hz[0] * rho) / rw, g, shW[2] + (hz[1] * rho) / rw] : target;
        }
        const tip = cardAt(w, tv), tp = [tip[0], tip[1], tip[2] * m], tipW = mv(Ws.R, tp).map((c, i) => c + Ws.t[i]);
        let Rw = mm(between(tipW.map((c, i) => c - shW[i]), aim.map((c, i) => c - shW[i])), Ws.R);
        pose[`J_pec${S}`] = fishToQuatObj(mm(tr(Wp.R), Rw));
        pose.morph = { ...(pose.morph ?? {}), [`Fin_Pectoral_${S}`]: { furl: +w.toFixed(4) } };
        // (the card's own lowest vertex (its edge, not the aimed tip) under the ground — or, in the recovery, under the
        // hero blade's lowest point: the card turned up about the shoulder, about the horizontal axis square to its lowest
        // vertex's reach, by the least angle that lays it there (bisection))
        // (in the recovery as high as the hero's blade: its lowest point's height over the ground, so the card does not drag)
        const gL = Math.max(g, target[1]), lo0 = cardLow(pose, S, w);
        if (lo0[1] < gL - 1e-4) {
          const v = lo0.map((c, i) => c - shW[i]), kx = [v[2], 0, -v[0]], kn = Math.hypot(...kx) || 1, k = kx.map((c) => c / kn);
          // (the sign that raises it)
          const sg = mv(rotAbout(k, 0.01), v)[1] > v[1] ? 1 : -1;
          let a0 = 0, a1 = 0.6;
          for (let it = 0; it < 30; it++) {
            const am = (a0 + a1) / 2, Rt = mm(rotAbout(k, sg * am), Rw);
            pose[`J_pec${S}`] = fishToQuatObj(mm(tr(Wp.R), Rt));
            if (cardLow(pose, S, w)[1] < gL) a0 = am; else a1 = am;
          }
          Rw = mm(rotAbout(k, sg * a1), Rw);
          pose[`J_pec${S}`] = fishToQuatObj(mm(tr(Wp.R), Rw));
        }
        // (the card's lowest point against the hero blade's)
        const lowNow = cardLow(pose, S, w);
        err[S] = +Math.hypot(...lowNow.map((c, i) => c - target[i])).toFixed(3); lo[S] = +(lowNow[1] - g).toFixed(3);
      }
      const { vertex, transfers, ...ct } = f.contacts ?? {};
      return { ...f, pose, contacts: ct, cardLowFromHeroLowMM: err, cardLowOverGroundMM: lo };
    });
    C = { ...hero, frames };
  } else if (tierName === 'hero') C = (H.crawl ??= crawlFrames(tierMesh, opts('hero')));
  else C = crawlFrames(tierMesh, { tier: tierName, ...opts(tierName) });
  const r4 = (v) => +(+v).toFixed(4);
  const out = {
    frames: C.frames.map((f) => ({ phase: r4(f.phase), raise: r4(f.raise), pose: withFins(f.pose), ...(f.tipErrMM !== undefined && tierName !== 'lod2' ? { tipErrMM: r4(f.tipErrMM) } : {}), ...(f.contacts ? { contacts: f.contacts } : {}), ...(f.cardLowFromHeroLowMM ? { cardLowFromHeroLowMM: f.cardLowFromHeroLowMM, cardLowOverGroundMM: f.cardLowOverGroundMM } : {}) })),
    weldMM: C.weld.map(r4), weldRMM: (C.weldRMM ?? [C.weld[0], C.weld[1], -C.weld[2]]).map(r4), weldM: toObject(C.weld).map((c) => +c.toFixed(7)),
    ...(tierName !== 'lod2' && C.weldBind ? { weldBind: C.weldBind } : {}),
    strideMM: r4(C.strideMM), cycleS: C.cycleS, duty: C.duty, speedBLs: C.speedBLs, groundMM: r4(C.ground?.y ?? C.ground), schedule: C.schedule,
    note: tierName === 'lod2' ? 'lod2: the hero\'s keys, each card eased within furl (bind → furl) so its length matches the shoulder\'s distance to the hero blade\'s lowest point and its shoulder (J_pecL/R, a quaternion) turned to lay its tip on it, on the ground toward it where the straight aim would go under, its own lowest vertex never under the ground (build report cardLowFromHeroLowMM; contacts: the hero\'s)' : `rig.crawlCycle on this tier's skin${tierName === 'lod1' ? ' (J_pecTip held at 0, its own furled blade)' : ''} on the land state's body: the stance (phase 0 … duty) with each furled crutch rolling on its distal tip (contacts.weld: the bearing vertex's spot, world mm, this cycle's; contacts.vertex: its index in the tier's furled distal blade) while the body vaults strideMM forward, the recovery (duty … 1) with the crutches carried over an arc; phase 1 = phase 0 + strideMM (rig.crawlPose)`,
  };
  return out;
}

/**
 * The welded prop's keyframes for the runtime's IDLE raise (round B4, the pectoral key's request; rig.propFrames:
 * behaviour §3.6, the front raised 10–25° with the planted feet held where they stood), solved once on the hero's tier
 * skin from the land state; each carried to the tier as its states are. lod2 keeps every other key.
 */
function heroProp(H) {
  if (H.prop) return H.prop;
  const fp = finPartsFor('hero', H), heroTM = { position: H.tier.position, skin: heroTierSkin(H), names: TIER_JOINTS.hero };
  H.prop = propFrames({ tierMesh: heroTM, fins: fp, pelvic: fp.Fin_Pelvic, ref: H.states.land });
  return H.prop;
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

// ------------------------------------------------------------------------------------------------ contacts across tiers
/** The fins the fish's midline splits in two mirror halves (their lowest point is a mirror pair: B3's 'pelvic' fell on
 * the left half on one tier and the right on another, 5.4–6.6 mm apart). */
const MIRROR_FINS = { pelvic: 'Fin_Pelvic', anal: 'Fin_Anal', caudal: 'Fin_Caudal' };
const finOfContact = (name) => MIRROR_FINS[name] ?? (/^(sole|soleTip|blade)([LR])/.exec(name) ? `Fin_Pectoral_${/^(?:sole|soleTip|blade)([LR])/.exec(name)[1]}` : null);
/**
 * Same-name contacts naming the same physical point on every tier (round B4, tech P3; rig.contactsFor picks each tier's
 * own lowest vertices, so a fin's contact could fall on another vertex — or the other half of a mirror-symmetric fin —
 * from tier to tier, and a ground-welding gait would jump at the LOD switch): on the hero, a mirror fin's contact taken
 * from its touching vertices (within 0.1 mm of its lowest) on the fish's left half and midline only (z ≥ −0.01 mm), the
 * one nearest their centroid — a deterministic side; on a lighter tier, every fin contact moved to the point of the
 * tier's own posed fin (same name, same state, the tier's pose of it) nearest the hero's posed contact, bone-local on the
 * tier joint that carries that point most. The skin contacts (rays down at fixed stations) stay as contactsFor gives
 * them. Each contact keeps lying on its tier's posed surface (contactGaps ≤ 0.0001 mm).
 * @param heroPts null for the hero, else { [state]: { [name]: posed fish-mm point } } (the hero's, aligned)
 * @returns { result (contactsFor's, contacts replaced), points ({ [state]: { [name]: p } }), heroDistMM }
 */
function alignContacts(tierName, parts, result, heroPts) {
  const names = TIER_JOINTS[tierName], jIdx = Object.fromEntries(names.map((n, i) => [n, i]));
  const points = {}, heroDistMM = {}, out = {};
  for (const [st, R] of Object.entries(result)) {
    const pose = poseForTier(R.pose, tierName), W = poseWorldHero(pose), morphs = pose.morph ?? {};
    const posed = {};
    const finP = (nm) => {
      if (posed[nm]) return posed[nm];
      const f = parts.fins?.[nm]; if (!f) return null;
      const P = Float32Array.from(f.position);
      for (const [k, w] of Object.entries(morphs[nm] ?? {})) { const i = f.targets?.names?.indexOf(k) ?? -1; if (i < 0 || !w) continue; const D = f.targets.deltas[i]; for (let q = 0; q < P.length; q++) P[q] += w * D[q]; }
      return (posed[nm] = { P: skinPacked(P, f.skin, W, { names }), f });
    };
    const dom = (sk, v) => { let b = 0, bw = -1; for (let q = 0; q < 4; q++) if (sk.weights[v * 4 + q] > bw) { bw = sk.weights[v * 4 + q]; b = sk.joints[v * 4 + q]; } return names[b]; };
    const local = (bone, p) => {
      const T = W[bone], q = [p[0] - T.t[0], p[1] - T.t[1], p[2] - T.t[2]], R0 = T.R;
      const b = [R0[0] * q[0] + R0[3] * q[1] + R0[6] * q[2], R0[1] * q[0] + R0[4] * q[1] + R0[7] * q[2], R0[2] * q[0] + R0[5] * q[1] + R0[8] * q[2]];
      const at = JOINTS[J[bone]].at;
      return dirToObject([b[0] - at[0], b[1] - at[1], b[2] - at[2]]).map((c) => +(c * 0.001).toFixed(7));
    };
    points[st] = {}; heroDistMM[st] = {};
    const list = R.contacts.map((c) => {
      const nm = c.kind === 'fin' ? finOfContact(c.name) : null, F = nm ? finP(nm) : null;
      let p = c.mm, bone = c.bone;
      if (F && !heroPts && MIRROR_FINS[c.name]) {
        // (the hero: the touching vertices on the left half and the midline, the one nearest their centroid)
        const P = F.P, n = P.length / 3;
        let lo = Infinity; for (let v = 0; v < n; v++) lo = Math.min(lo, P[v * 3 + 1]);
        const near = []; for (let v = 0; v < n; v++) if (P[v * 3 + 1] - lo < 0.1 && P[v * 3 + 2] >= -0.01) near.push(v);
        if (near.length) {
          const cm = [0, 0, 0]; for (const v of near) for (let k = 0; k < 3; k++) cm[k] += P[v * 3 + k] / near.length;
          let b = near[0], bd = Infinity; for (const v of near) { const d = Math.hypot(P[v * 3] - cm[0], P[v * 3 + 1] - cm[1], P[v * 3 + 2] - cm[2]); if (d < bd - 1e-9) { bd = d; b = v; } }
          p = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]]; bone = dom(F.f.skin, b);
        }
      } else if (F && heroPts?.[st]?.[c.name]) {
        // (a lighter tier: the nearest point of its own posed fin to the hero's contact; the bone of that triangle's
        // corner nearest it)
        const h = heroPts[st][c.name], P = F.P, I = F.f.indices;
        let best = Infinity, bp = null, bv = 0;
        for (let t = 0; t < I.length; t += 3) {
          const a = I[t], b2 = I[t + 1], c2 = I[t + 2];
          const q = closestOnTri(h, [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], [P[b2 * 3], P[b2 * 3 + 1], P[b2 * 3 + 2]], [P[c2 * 3], P[c2 * 3 + 1], P[c2 * 3 + 2]]);
          const d = Math.hypot(q[0] - h[0], q[1] - h[1], q[2] - h[2]);
          if (d < best - 1e-12) { best = d; bp = q; let vb = a, vd = Infinity; for (const v of [a, b2, c2]) { const e = Math.hypot(P[v * 3] - q[0], P[v * 3 + 1] - q[1], P[v * 3 + 2] - q[2]); if (e < vd) { vd = e; vb = v; } } bv = vb; }
        }
        if (bp) { p = bp; bone = dom(F.f.skin, bv); }
      }
      while (bone && !(bone in jIdx)) bone = JOINTS[J[bone]].parent;
      points[st][c.name] = p;
      if (heroPts?.[st]?.[c.name]) { const h = heroPts[st][c.name]; heroDistMM[st][c.name] = +Math.hypot(p[0] - h[0], p[1] - h[1], p[2] - h[2]).toFixed(4); }
      if (p === c.mm && bone === c.bone) return c;
      return { ...c, bone, local: local(bone, p), mm: p.map((x) => +x.toFixed(4)), obj: toObject(p).map((x) => +x.toFixed(7)), groundGapMM: +(p[1] - R.groundMM).toFixed(4), aligned: heroPts ? 'hero' : 'left' };
    });
    out[st] = { ...R, contacts: list };
  }
  return { result: out, points, heroDistMM };
}
/**
 * Every pose under `root` (any object's `pose`, in place) held to what the tier has (round B4, tech P5: B3's lod1 crawl
 * frames set J_pecTipL/R, which lod1 does not keep, and lod2's land and reach states the pectorals' plantMid, which its
 * cards do not have): joints the tier keeps (and the Eye_L/R nodes), blend-shape weights that some mesh of the tier
 * carries — per fin the targets its mesh (or merged mesh: `<target>_<fin>`) has, per mesh name its own, a bare number
 * a target of that name on any mesh — and the rest as it is. Returns the dropped entries ({ what: count }).
 */
function holdPosesToTier(root, tierName, meshes) {
  const keep = new Set(TIER_JOINTS[tierName]), byMesh = {}, byFin = {}, flat = new Set(), dropped = {};
  for (const m of meshes) {
    const names = m.extras?.targetNames ?? [];
    byMesh[m.name] = new Set(names);
    for (const k of names) { flat.add(k); const f = /^([A-Za-z]+)_(Fin_\w+)$/.exec(k); if (f) (byFin[f[2]] ??= new Set()).add(f[1]); }
    if (/^Fin_/.test(m.name)) for (const k of names) (byFin[m.name] ??= new Set()).add(k);
  }
  const drop = (k) => { dropped[k] = (dropped[k] ?? 0) + 1; };
  const hold = (pose) => {
    for (const k of Object.keys(pose)) if (/^J_/.test(k) && !keep.has(k)) { delete pose[k]; drop(k); }
    if (!pose.morph) return;
    // (the weights' objects may be shared with the hero's states: filtered on a copy)
    pose.morph = structuredClone(pose.morph);
    for (const [mk, mv] of Object.entries(pose.morph)) {
      if (typeof mv === 'number') { if (!flat.has(mk)) { delete pose.morph[mk]; drop(mk); } continue; }
      const set = byFin[mk] ?? byMesh[mk];
      if (!set || !mv) { delete pose.morph[mk]; drop(mk); continue; }
      for (const t of Object.keys(mv)) if (!set.has(t)) { delete mv[t]; drop(`${mk}.${t}`); }
      if (!Object.keys(mv).length) delete pose.morph[mk];
    }
  };
  const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(walk); return; } if (o.pose && typeof o.pose === 'object' && !Array.isArray(o.pose)) hold(o.pose); for (const [k, v] of Object.entries(o)) if (k !== 'pose') walk(v); };
  walk(root);
  return dropped;
}
/** The hero's aligned contact points per state (fish mm, posed), computed once (buildTier('hero') sets them; a lighter
 * tier built alone computes them here the same way). */
function heroContactPoints(H) {
  if (H.heroContactPts) return H.heroContactPts;
  const fins = tierFins('hero', H);
  const finParts = Object.fromEntries(Object.entries(fins).map(([k, f]) => [k, { position: f.mesh.position, indices: f.mesh.indices, skin: f.w, targets: { names: f.targets.names, deltas: f.targets.deltas } }]));
  const cparts = { skin: { position: H.tier.position, indices: H.tier.indices, skin: heroTierSkin(H) }, fins: finParts };
  const states = Object.fromEntries(Object.entries(heroStates(H)).map(([st, S]) => [st, { ...S, pose: structuredClone(S.pose) }]));
  return (H.heroContactPts = alignContacts('hero', cparts, contactsFor('hero', cparts, { states }), null).points);
}
/** The closest point of triangle abc to p (Ericson). */
function closestOnTri(p, a, b, c) {
  const sub = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]], dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const at = (o, u, s, v, t) => [o[0] + u[0] * s + (v ? v[0] * t : 0), o[1] + u[1] * s + (v ? v[1] * t : 0), o[2] + u[2] * s + (v ? v[2] * t : 0)];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return at(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  const den = 1 / (va + vb + vc);
  if (!Number.isFinite(den)) return [a, b, c].reduce((m, x) => (Math.hypot(...sub(p, x)) < Math.hypot(...sub(p, m)) ? x : m));
  return at(a, ab, vb * den, ac, vc * den);
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
  // (round B4: the tier's own atlas layout: lod2 packs only the rects it uses, fishmesh TIERS.lod2.layout)
  const layout = MESH_TIERS[TB.mesh]?.layout ?? BODY_LAYOUT;
  const gb = new GLBBuilder('tobihaze-builder');
  const { joints: kept, remap } = jointsForTier(tierName);
  const sk = skeleton(kept);
  const keep = new Set(kept.map((j) => j.name));
  const { skin, jointNodes, rootJoint } = addSkeleton(gb, sk);
  const jIndex = Object.fromEntries(sk.map((j, i) => [j.name, i]));
  const mats = clayMaterials(gb, tierName, layout);
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
  let body, bodySkin, morph = null, bodyCls = null;
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
    body = L.tier; bodySkin = L.skin; morph = L.morphs.names.length ? L.morphs : null; bodyCls = L.cls;
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
    // (round B4: TB.skinMeshes 'one' — lod1 — the whole skin as one mesh with every shape that moves a vertex, one draw
    // where B3's split by side drew five (1.24–1.38 MB of morph textures against 0.33; the plan in the header))
    const sp = TB.skinMeshes === 'one'
      ? { meshes: [{ group: 'skin', name: 'Body', tris: Uint32Array.from({ length: body.indices.length / 3 }, (_, t) => t), targets: morph.names.filter((k) => pruned[k] > 0) }], still: new Uint32Array(0), dropped: morph.names.filter((k) => !(pruned[k] > 0)) }
      : splitByMorphs(body.indices, morph, { penalty: ME.draw, ...(ME.sides ? { groups: MORPH_GROUPS_SIDES, names: MORPH_MESH_SIDES, order: ['eyesL', 'eyesR', 'mouth', 'face'] } : {}) });
    const vecs = (sm, src, k, f) => f(Float32Array.from({ length: sm.map.length * 3 }, (_, i) => src[k][sm.map[(i / 3) | 0] * 3 + (i % 3)]));
    for (const m of sp.meshes) {
      const set = new Set(m.tris), sm = subMesh(body, (t) => set.has(t), keys), w = pick(bodySkin, sm.map);
      const targets = m.targets.map((k) => vecs(sm, morph.d, k, deltasToObject)), normalTargets = m.targets.map((k) => vecs(sm, morph.n, k, dirsToObject));
      const part = m.group === 'skin' ? 'body' : 'head';
      addMeshNode(m.name, [gb.primitive({ ...bodyAttrs(sm, w), targets, normalTargets })], { ...morphExtras(m.targets), tobihaze: { part, group: m.group } }, { tobihaze: { part, group: m.group } }, { weights: m.targets.map(() => 0) });
      morphMeshes.push({ name: m.name, names: m.targets, vertices: sm.map.length, triangles: m.tris.length });
    }
    const still = new Set(sp.still), bm = subMesh(body, (t) => still.has(t), keys);
    if (bm.indices.length) addMeshNode('Body', [gb.primitive(bodyAttrs(bm, pick(bodySkin, bm.map)))], { tobihaze: { part: 'body' } }, { tobihaze: { part: 'body' } });
    morph.names = morph.names.filter((k) => !sp.dropped.includes(k));
    headSplit = { meshes: morphMeshes.map(({ name, names, vertices, triangles }) => ({ name, targets: names, vertices, triangles })), body: bm.indices.length / 3, dropped: sp.dropped, moving: pruned, skinMeshes: TB.skinMeshes ?? 'split' };
    log(`${tierName} skin: ${morphMeshes.map((m) => `${m.name} ${m.triangles} triangles / ${m.vertices} vertices (${m.names.join(', ')})`).join('; ')}${bm.indices.length ? `; Body ${bm.indices.length / 3}` : ''}${sp.dropped.length ? `; dropped ${sp.dropped.join(', ')} (no vertex moves)` : ''}`);
  }

  // ---- the eyes (each part with its own UVs and per-vertex tangents: eyemesh.eyeMeshForTier)
  const tangentGate = {};
  const gateTangent = (name, normal, tangent) => { if (!tangent) return; const c = tangentCheck(normal, tangent, { tol: 1e-3 }); tangentGate[name] = { n: c.n, bad: c.bad, maxDot: +c.maxDot.toExponential(2), maxLen: +(c.maxLen ?? 0).toExponential(2) }; };
  if (!lod2) {
    // (round B3: a mesh a side, the right built as the left's mirror image with its own tangents (eyemesh side −1), its
    // node not scaled: three.js does not turn the bitangent over for a mirroring node, so B2's Eye_R under scale
    // [−1, 1, 1] would have read the normal map's green channel inverted)
    for (const S of ['L', 'R']) {
      // (round B4: one primitive a globe on the Eye material: B3's three — skin on Body, pupil on Cornea, iris on Iris —
      // were three draws an eye)
      const e = eyeMeshForTier({ ...TB.eye, side: S === 'R' ? -1 : 1 }), p = e.parts.whole;
      gateTangent(`Eye_${S}`, p.normal, p.tangent);
      const prims = [gb.primitive({ position: p.position, normal: p.normal, tangent: p.tangent ?? null, uv: p.uv, indices: compactIndices(p.indices, p.position.length / 3), material: mats.eye })];
      const mesh = gb.addMesh(`Eye_${S}`, prims, { tobihaze: { part: 'eye', eye: S, triangles: { skin: p.ranges.skin, window: p.ranges.window } } });
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
  const gpu = { morphBytes4096: 0, morphBytes8192: 0, morphBytes16384: 0, meshes: {} };
  // (round B4: also at 8192 rows, a common mobile maximum: a mesh just over a row's width doubles there)
  const countMorph = (name, nv, nt, withN) => { const a = morphTextureBytes(nv, nt, withN, 4096), c = morphTextureBytes(nv, nt, withN, 8192), b = morphTextureBytes(nv, nt, withN, 16384); gpu.meshes[name] = { vertices: nv, targets: nt, normals: withN, bytes4096: a, bytes8192: c, bytes16384: b }; gpu.morphBytes4096 += a; gpu.morphBytes8192 += c; gpu.morphBytes16384 += b; };
  let cardTargets = null;
  // (lod2: per reference state, the far cards' own weights (the pelvic's `pitch`, the states' correctives), merged into
  // the states' lod2 poses below)
  const lod2Morph = {}, cardMorph = (st, fin, k, w) => { ((lod2Morph[st] ??= {})[fin] ??= {})[k] = +w.toFixed(4); };
  // (lod2's pelvic pitch cards: name and range end, for the poses that carry their own J_pelvic pitch — the prop's keys)
  const pitchCards = [];
  if (lod2) {
    // the eyes at rest, into the Body (its material; J_head)
    const eyes = eyesAtRest({ ...TB.eye, layout }), jh = jIndex.J_head;
    const parts = [{ position: posToObject(body.position), normal: dirsToObject(body.normal), uv: body.uv, indices: body.indices, joints: bodySkin.joints, weights: bodySkin.weights }];
    for (const e of eyes) {
      const n = e.position.length / 3, joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
      for (let v = 0; v < n; v++) { joints[v * 4] = jh; weights[v * 4] = 255; }
      parts.push({ ...e, joints, weights });
    }
    const mg = mergeParts(parts);
    // (round B4, poses P4: lod2 has no eye joints, so its alert eyes stood 0.9 mm under the near tiers' and popped at the
    // switch: the alert lift as the Body's blend shape `alert`, the hero's lift carried to the skin (transfer.eyeLiftOnTier)
    // and the merged globes raised alike; weight 1 in the land and reach states, cross-faded in the transitions)
    const liftHL = AXES.joints.J_eyeL.translate.alertM / (HL * 0.001), dSkin = eyeLiftOnTier(H, { position: body.position, normal: body.normal, cls: bodyCls }, { lift: liftHL, eyeJ: [J.J_eyeL, J.J_eyeR], HL });
    const dAlert = new Float32Array(mg.position.length); dAlert.set(deltasToObject(dSkin)); for (let i = dSkin.length; i < dAlert.length; i += 3) dAlert[i + 1] = liftHL * HL * 0.001;
    addMeshNode('Body', [gb.primitive({ position: mg.position, normal: mg.normal, uv: mg.uv, indices: mg.indices, material: mats.body, extraAttributes: skinAttrs(mg), targets: [dAlert] })], { targetNames: ['alert'], drive: { alert: { state: ['land', 'reach'], note: 'the alert eyes (the near tiers\' J_eyeL/R lift alertM with eyesUp): weight 1 in the land and reach states' } }, tobihaze: { part: 'body', eyes: 'merged' } }, { tobihaze: { part: 'body' } }, { weights: [0] });
    for (const st of ['land', 'reach']) if (states0[st]) cardMorph(st, 'Body', 'alert', 1);
    countMorph('Body', mg.position.length / 3, 1, false);
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
        drive[nm] = { fin: def.name, target: st };
      });
    }
    // (the far cup turned by J_pelvic's pitch, which lod2 does not keep: weight = J_pelvic pitch / pL, from the joint
    // where a pose gives none; tierStates writes it into the states)
    for (const pp of pelvicPitchTargets(fins.Fin_Pelvic)) {
      const o = offsets.Fin_Pelvic, d = new Float32Array(at * 3), dn = new Float32Array(at * 3), nm = `${pp.name}_Fin_Pelvic`;
      d.set(pp.delta, o * 3); dn.set(pp.dnormal, o * 3);
      names.push(nm); targets.push(deltasToObject(d)); normalTargets.push(dirsToObject(dn));
      // (per: the range end, negative for pitchDown: weight = clamp(pitch / per, 0, 1) either way)
      drive[nm] = { fin: 'Fin_Pelvic', target: pp.name, joint: 'J_pelvic', channel: 'pitch', per: pp.deg };
      const fp = finParts.Fin_Pelvic.targets;
      finParts.Fin_Pelvic.targets = { names: [...fp.names, pp.name], deltas: [...fp.deltas, pp.delta] };
      for (const [st, S] of Object.entries(states0)) { const w = Math.min(1, Math.max(0, (S.pose.J_pelvic?.pitch ?? 0) / pp.deg)); if (w > 0) cardMorph(st, 'Fin_Pelvic', pp.name, w); }
      pitchCards.push({ name: pp.name, deg: pp.deg });
    }
    // (each card a joint the far tier does not keep carries — the pectorals' junction, mid-blade and tips (lod2 keeps
    // J_pecL alone), the pelvic's J_pelvic — in each reference state as the hero holds it: B2's far paddles kept the
    // bind junction in WATER (the hero's J_pecFin flexion −15°, sweep 20°: 3.2 mm off, 0.57 of the hero's area). A
    // corrective `<state>_<fin>`, weight 1 in that state only (the states' lod2 poses set it): the bind-frame displacement
    // that lands the card, at that state's weights and skinned as lod2 skins it, on the card skinned by the hero's
    // joints (headmorphs.solveBindDelta); none where the two are within 0.05 mm)
    const keep2 = new Set(TIER_JOINTS.lod2), W2names = TIER_JOINTS.lod2;
    // (round B4, tech P3: each card also fitted onto the hero's own fin in each state (fitCard) where it misses it most
    // (CARD_FIT) — B3's correctives only made up for the joints lod2 drops, so its REST pectoral card stayed 0.97 mm off
    // the folded, pleated hero fin)
    const heroFins = tierFins('hero', H), fitLog = {};
    for (const def of defs) {
      const f = fins[def.name], c = f.mesh, hw = f.w, lw = toTier(f.w), n = c.position.length / 3;
      let carried = false;
      for (let i = 0; i < n * 4 && !carried; i++) if (hw.weights[i] && !keep2.has(TIER_JOINTS.hero[hw.joints[i]])) carried = true;
      const HF = heroFins[def.name];
      // (the card's own miss in the bind, where no state moves it: the fit is for the states it misses by more)
      let bindMax = 0;
      if (HF) { const Hb = []; for (let v = 0; v < HF.mesh.position.length / 3; v += 2) Hb.push(HF.mesh.position[v * 3], HF.mesh.position[v * 3 + 1], HF.mesh.position[v * 3 + 2]); bindMax = cardCover(Hb, c.position, c.indices).max; }
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
        const W2 = poseWorldHero(poseForTier(S.pose, 'lod2')), P2 = skinPacked(X, lw, W2, { names: W2names });
        const Ph = carried ? skinPacked(R, hw, poseWorldHero(S.pose)) : P2;
        // (the hero's fin in the state: its own shapes at the state's weights, skinned by its hero weights; every other
        // vertex, the fit's points)
        let Pt = Ph;
        if (HF) {
          const hm = HF.mesh, HP = Float32Array.from(hm.position), hwts = S.pose.morph?.[def.name] ?? {};
          HF.targets.names.forEach((k, i) => { if (hwts[k]) for (let q = 0; q < HP.length; q++) HP[q] += hwts[k] * HF.targets.deltas[i][q]; });
          const HPp = skinPacked(HP, HF.w, poseWorldHero(S.pose)), Hs = [];
          for (let v = 0; v < HPp.length / 3; v += 2) Hs.push(HPp[v * 3], HPp[v * 3 + 1], HPp[v * 3 + 2]);
          const F = fitCard(Ph, c.indices, Hs), before = cardCover(Hs, Ph, c.indices), after = cardCover(Hs, F, c.indices);
          // (and the card's own vertices off the hero's fin, so a fit that covers the fin by outgrowing it shows)
          const outB = cardOut(Ph, Hs), outA = cardOut(F, Hs);
          // (used where the card misses the hero's fin by more than it does in the bind (+ CARD_FIT.over) and the fit takes
          // CARD_FIT.gain off: a corrective costs lod2 ~1 kB of download, and a millimetre is under a pixel at its distance)
          const used = before.max > bindMax + CARD_FIT.over && Math.max(before.max, outB) - Math.max(after.max, outA) >= CARD_FIT.gain;
          (fitLog[def.name] ??= {})[st] = { bindMM: +bindMax.toFixed(3), maxMM: [+before.max.toFixed(3), +after.max.toFixed(3)], p95MM: [+before.p95.toFixed(3), +after.p95.toFixed(3)], cardOutMM: [+outB.toFixed(3), +outA.toFixed(3)], used };
          if (used) Pt = F;
        }
        let err = 0; for (let q = 0; q < X.length; q++) err = Math.max(err, Math.abs(Pt[q] - P2[q]));
        if (err < 0.05) continue;
        const E = Float32Array.from(Pt, (v, q) => v - X[q]), dl = solveBindDelta(X, lw, W2names, W2, E);
        const X1 = Float32Array.from(X, (v, q) => v + dl[q]), N0 = vertexNormals(X, c.indices), N1 = vertexNormals(X1, c.indices);
        const o = offsets[def.name], d = new Float32Array(at * 3), dn = new Float32Array(at * 3), nm = `${st}_${def.name}`;
        d.set(dl, o * 3); dn.set(Float32Array.from(N1, (v, q) => v - N0[q]), o * 3);
        names.push(nm); targets.push(deltasToObject(d)); normalTargets.push(dirsToObject(dn));
        drive[nm] = { fin: def.name, target: st, state: st, offMM: +err.toFixed(2), ...(Pt !== Ph ? { fit: true } : {}) };
        finParts[def.name].targets = { names: [...finParts[def.name].targets.names, st], deltas: [...finParts[def.name].targets.deltas, dl] };
        cardMorph(st, def.name, st, 1);
      }
    }
    cardTargets = { names, vertices: at, fit: fitLog };
    // (round B4, tech P4: the cards' targets move their positions only — an alpha-tested card a few pixels wide at lod2's
    // distance shades the same — and the drive keeps only what the `<target>_<fin>` name does not say (the pelvic pitch's
    // joint, the correctives' state) without B3's prose and its `drivers` copy: lod2's JSON 74 → ≤ 40 kB, its download
    // back to B2's; the rule once in the root extras' morphs.Fins)
    countMorph('Fins', at, names.length, LOD2_CARD_NORMALS);
    // (each kept entry without what its name says: `<target>_<fin>`; the correctives' miss and fit to the build report)
    const driveKept = Object.fromEntries(Object.entries(drive).filter(([k, d]) => !(Object.keys(d).length === 2 && k === `${d.target}_${d.fin}`))
      .map(([k, d]) => [k, Object.fromEntries(Object.entries(d).filter(([q]) => !['fin', 'target', 'offMM', 'fit'].includes(q)))]));
    cardTargets.drive = Object.fromEntries(Object.entries(drive).filter(([, d]) => d.offMM !== undefined).map(([k, d]) => [k, { offMM: d.offMM, ...(d.fit ? { fit: true } : {}) }]));
    addMeshNode('Fins', [gb.primitive({ position: mf.position, normal: mf.normal, uv: mf.uv, indices: mf.indices, material: mats.fin, extraAttributes: skinAttrs(mf), targets, ...(LOD2_CARD_NORMALS ? { normalTargets } : {}) })],
      { targetNames: names, drive: driveKept, tobihaze: { part: 'fins', merged: true, fins: defs.map((d) => d.name), offsets } }, { tobihaze: { fin: 'merged' } }, { weights: names.map(() => 0) });
  } else {
    const built = {};
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
      // (round B4, the trunk key's request: the caudal's sheath — fins.mjs mesh.extra, 1 = a sheath vertex; its triangles
      // the last of the fin's, contiguous — drawn opaque: its triangle range in the mesh's extras `sheath`)
      if (m0.extra) {
        const E = m0.extra, I0 = m0.indices, sh = [];
        for (let t = 0; t < I0.length / 3; t++) if (E[I0[t * 3]] && E[I0[t * 3 + 1]] && E[I0[t * 3 + 2]]) sh.push(t);
        if (sh.length && (sh.at(-1) - sh[0] + 1 !== sh.length || m.indices.length !== I0.length)) throw new Error(`${def.name}: the sheath's triangles are not one contiguous run`);
        // (the tangent split keeps the triangles' order: every sheath triangle's corners where the unsplit mesh has them)
        for (const t of sh) for (let c = 0; c < 3; c++) for (let q = 0; q < 3; q++) if (Math.abs(m.position[m.indices[t * 3 + c] * 3 + q] - m0.position[I0[t * 3 + c] * 3 + q]) > 1e-6) throw new Error(`${def.name}: the tangent split reordered the sheath's triangles`);
        if (sh.length) m.sheathTris = [sh[0], sh.length];
      }
      finMorphs[def.name] = tg.names;
      built[def.name] = { m, tg };
    }
    // (round B4: the fins merged into TB.finMeshes' groups, each fin's targets as `<target>_<fin>`, zero off its own
    // vertices; B3 drew each fin as a mesh of its own: 7 draws a tier)
    const FM = TB.finMeshes ?? { normals: true, groups: Object.fromEntries(defs.map((d) => [d.name, [d.name]])) };
    for (const [gName, members] of Object.entries(FM.groups)) {
      const list = members.filter((k) => built[k]);
      if (!list.length) continue;
      const nv = list.reduce((a, k) => a + built[k].m.position.length / 3, 0), ni = list.reduce((a, k) => a + built[k].m.indices.length, 0);
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Tn = new Float32Array(nv * 4), UV = new Float32Array(nv * 2), Jn = new Uint8Array(nv * 4), Wt = new Uint8Array(nv * 4), I = new Uint32Array(ni);
      const names = [], targets = [], normalTargets = [], drive = {}, ranges = {}, sheath = {};
      let v0 = 0, i0 = 0;
      for (const k of list) {
        const { m, tg } = built[k], n = m.position.length / 3;
        P.set(m.position, v0 * 3); N.set(m.normal, v0 * 3); Tn.set(m.tangent, v0 * 4); UV.set(m.uv, v0 * 2); Jn.set(m.joints, v0 * 4); Wt.set(m.weights, v0 * 4);
        for (let i = 0; i < m.indices.length; i++) I[i0 + i] = m.indices[i] + v0;
        tg.names.forEach((t, i) => {
          const d = new Float32Array(nv * 3); d.set(m[`d${i}`], v0 * 3);
          const nm = `${t}_${k}`;
          names.push(nm); targets.push(deltasToObject(d)); drive[nm] = { fin: k, target: t };
          if (FM.normals && m[`n${i}`]) { const dn = new Float32Array(nv * 3); dn.set(m[`n${i}`], v0 * 3); normalTargets.push(dirsToObject(dn)); }
        });
        ranges[k] = { vertices: [v0, n], triangles: [i0 / 3, m.indices.length / 3] };
        if (m.sheathTris) sheath[k] = [i0 / 3 + m.sheathTris[0], m.sheathTris[1]];
        v0 += n; i0 += m.indices.length;
      }
      const prim = gb.primitive({
        position: posToObject(P), normal: dirsToObject(N), tangent: dirsToObject(Tn, 4), uv: UV, indices: compactIndices(I, nv), material: mats.fin,
        targets, ...(FM.normals ? { normalTargets } : {}), extraAttributes: skinAttrs({ joints: Jn, weights: Wt }),
      });
      countMorph(gName, nv, names.length, !!FM.normals);
      // (`sheath`: [first triangle, count] per fin, top level so the node's own extras do not replace it in a loader that
      // merges them: the caudal's fleshy base past the skin's end, opaque — the clay viewer draws it with the body's clay,
      // the textures round gives its atlas region full coverage)
      addMeshNode(gName, [prim], { targetNames: names, drive, ...(Object.keys(sheath).length ? { sheath } : {}), tobihaze: { part: 'fin', fins: list, ranges, normalTargets: !!FM.normals } }, { tobihaze: { fin: list.length > 1 ? 'merged' : list[0] } }, { weights: names.map(() => 0) });
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
  // (round B4: the same name the same physical point on every tier: alignContacts, against the hero's)
  const aligned = alignContacts(tierName, cparts, contactsFor(tierName, cparts, { states: tierStates }), tierName === 'hero' ? null : heroContactPoints(H));
  if (tierName === 'hero') H.heroContactPts = aligned.points;
  const cres = aligned.result;
  const gaps = contactGaps(tierName, cparts, cres);
  // (round B4, tech P4: the extras carry what the runtime needs, { name, kind, bone, local }; the posed point, its height
  // over the ground, the tier's own dominant bone, its gap to the posed surface and its distance to the hero's go to the
  // build report: B3 wrote them into every tier's extras, 15.5 kB a tier)
  const contacts = {}, contactReport = {}, stateExtras = {};
  for (const [st, R] of Object.entries(cres)) {
    contacts[st] = R.contacts.map((c) => ({ name: c.name, kind: c.kind, bone: c.bone, local: c.local }));
    contactReport[st] = R.contacts.map((c) => ({ name: c.name, bone: c.bone, mm: c.mm, groundGapMM: c.groundGapMM, ...(c.tierBone ? { tierBone: c.tierBone } : {}), gapMM: gaps[st][c.name], ...(aligned.heroDistMM[st]?.[c.name] !== undefined ? { heroDistMM: aligned.heroDistMM[st][c.name] } : {}), ...(c.aligned ? { aligned: c.aligned } : {}) }));
    stateExtras[st] = { pose: tierStates[st].pose, groundMM: R.groundMM, groundM: +toObject([0, R.groundMM, 0])[1].toFixed(7), morphs: R.morphs };
  }
  // (round B3 integration: the crawl's stance per tier, rig.crawlFrames)
  const crawl = tierCrawl(tierName, H, { position: body.position, skin: bodySkin, names: TIER_JOINTS[tierName] }, morphNamesOfTier);
  // (round B4) the transitions (rig.stateTransitions, the hero's): each key carried to the tier as its states are; lod2's
  // card correctives (`<state>_<fin>`, pitch) cross-faded between the two states' own weights by the ease e(u)
  const transitions = Object.fromEntries(Object.entries(H.transitions ?? {}).map(([k, T]) => [k, { ...T, keys: T.keys.map((key) => {
    const pose = tierStatePose(T.from, { pose: key.pose }, tierName, morphNamesOfTier);
    if (lod2) { const e = key.u * key.u * (3 - 2 * key.u), A = tierStates[T.from]?.pose?.morph ?? {}, B = tierStates[T.to]?.pose?.morph ?? {}; for (const f of Object.keys(lod2Morph[T.from] ?? {}).concat(Object.keys(lod2Morph[T.to] ?? {}))) for (const t of new Set([...Object.keys(lod2Morph[T.from]?.[f] ?? {}), ...Object.keys(lod2Morph[T.to]?.[f] ?? {})])) pose.morph = { ...(pose.morph ?? {}), [f]: { ...(pose.morph?.[f] ?? {}), [t]: +((1 - e) * (A[f]?.[t] ?? 0) + e * (B[f]?.[t] ?? 0)).toFixed(4) } }; }
    return { u: key.u, pose, groundMM: key.groundMM };
  }) }]));
  log(`${tierName}: crawl ${crawl.frames.length} frames, stride ${crawl.strideMM} mm, tip error max ${Math.max(0, ...crawl.frames.map((f) => f.tipErrMM ?? 0))} mm`);
  // (round B4, the pectoral key's request) the welded prop's keyframes for the IDLE raise 10–25° (rig.propFrames, solved
  // once on the hero), each carried to the tier as the land state is; lod2 every other key, its land card correctives
  // with them and its pelvic pitch card weights from each key's own J_pelvic pitch
  const propH = heroProp(H), propKeys = lod2 ? propH.filter((_, i, a) => i % 2 === 0 || i === a.length - 1) : propH;
  const prop = {
    frames: propKeys.map((k) => {
      const pose = tierStatePose('land', { pose: k.pose }, tierName, morphNamesOfTier);
      if (lod2) {
        const lm = lod2Morph.land ?? {};
        for (const [fin, ws] of Object.entries(lm)) pose.morph = { ...(pose.morph ?? {}), [fin]: { ...(pose.morph?.[fin] ?? {}), ...ws } };
        for (const pc of pitchCards) { const w = Math.min(1, Math.max(0, (k.pose.J_pelvic?.pitch ?? 0) / pc.deg)); pose.morph.Fin_Pelvic = { ...(pose.morph.Fin_Pelvic ?? {}), [pc.name]: +w.toFixed(4) }; }
      }
      return { raise: k.raise, pose, groundMM: +(+(k.ground?.y ?? k.ground)).toFixed(4), weldErrMM: +(+(k.weldErrMM ?? 0)).toFixed(5) };
    }),
    note: 'the IDLE raise (behaviour §3.6): keyframes by raise (deg), the planted feet held where the land state put them (rig.propFrames: J_pecMid\'s frame welded, J_root t holding the rear); interpolate the channels between the two keys that bracket the raise',
  };
  log(`${tierName}: prop ${prop.frames.length} keys ${prop.frames[0].raise}–${prop.frames.at(-1).raise}°, weld error max ${Math.max(...prop.frames.map((f) => f.weldErrMM))} mm`);
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
  if (Object.keys(finMorphs).length) morphs.fins = { targets: finMorphs, meshes: TB.finMeshes?.groups, names: '<target>_<fin> on the fin\'s mesh (meshes); weight = pose.morph[fin][target]', normalTargets: !!TB.finMeshes?.normals, drivers: FIN_DRIVERS };
  if (cardTargets) morphs.Fins = { names: cardTargets.names, note: '<state>_<fin>: each card\'s state as the hero\'s fin of that name takes it (fold and spread for every card, the caudal\'s flex, the pectorals\' furl and plant, the pelvic\'s press; weight = the near tiers\' fin weight); pitch_Fin_Pelvic: driven by J_pelvic pitch (drive); <reference state>_<fin> (e.g. water_Fin_Pectoral_L): lod2-only correctives, weight 1 in that state\'s lod2 pose (the card as the hero\'s dropped joints hold it)' };
  // (round B3: the hero's, the same in every tier)
  const footprint = (H.footprint ??= footprintOf(H.tier, (v) => H.rig.m[H.tier.source[v]]));
  // (round B4, tech P5: the states' and the crawl's poses held to the tier's joints and blend shapes)
  const posesHeld = holdPosesToTier({ stateExtras, crawl, prop }, tierName, gb.json.meshes);
  const rootNode = gb.addNode({
    name: `${P}_Adult`, children: [rootJoint],
    extras: {
      species: 'periophthalmus_modestus', commonName: 'トビハゼ', totalLength_mm: TL, standardLength_mm: +SL.toFixed(3),
      units: 'metres (+X the fish\'s left, +Y dorsal, +Z anterior)',
      tobihaze: {
        tier: tierName, round: 'B4 clay', hlMM: +HL.toFixed(4), tlMM: TL, slMM: +SL.toFixed(3),
        joints: kept.map((j) => j.name), remapFromHero: Array.from(remap),
        axes: tierAxes(tierName, morphNamesOfTier),
        morphs, regions, footprint,
        // per reference state: the pose (channel values by joint, AXES order; lod2's arms as quaternions), the ground
        // under it (fish mm and object y in m: the posed fish's lowest point) and the blend-shape weights it assumes
        states: stateExtras,
        // the crawl's cycle (rig.crawlFrames / crawlCycle, round B4): keys over one cycle (phase 0 … 1; the stance to
        // `duty`, then the recovery), each with its pose and its contacts (the crutches' bearing spots, world mm, or null
        // in the recovery; the body's ground contacts), the schedule, the cycle's time, stride and speed
        crawl,
        // the welded prop's keys for the IDLE raise (rig.propFrames, round B4)
        prop,
        // (round B4) the transitions between the states (rig.stateTransitions): per 'from>to' the rule (ease, lift arc) and
        // the lift (the keys, sampled poses, in states.json only: 5 × 9 poses would add ~90 kB to every tier's JSON)
        transitions: Object.fromEntries(Object.entries(transitions).map(([k, T]) => [k, { from: T.from, to: T.to, ease: T.ease, curve: T.curve, lift: T.lift, rule: T.rule }])),
        // per state: [{ name, kind, bone (this tier's joint), local (object m from the joint's pivot in its bind frame:
        // bone · local is the point whatever the bone does) }] — a name the same physical point on every tier
        // (alignContacts); the posed point, its gaps and its distance to the hero's are in the build report
        contacts,
        layout,
        eyes: { ...(lod2 ? { merged: 'Body', note: 'lod2: both globes at rest in the Body, on J_head' } : { meshes: ['Eye_L', 'Eye_R'], nodes: ['Eye_L', 'Eye_R'], note: 'a mesh a side (one primitive, the Eye material), the right the left\'s mirror image with its own tangents (no mirroring node scale)' }), clay: eyeClayAtlas(layout) },
      },
      regions,
    },
  });
  // (round B4, tech P4: lod2's extras without the prose (every string over 40 characters: the axes' notes and `positive`
  // texts, the morphs' and the crawl's notes — the hero file carries them) and without the root's second copy of the
  // regions (the viewer reads tobihaze.regions): B3's lod2 was 111 kB packed, 74 kB of it JSON, against B2's 71 kB)
  if (lod2) {
    const ex = gb.json.nodes[rootNode].extras;
    delete ex.regions;
    const strip = (o) => {
      if (Array.isArray(o)) { for (let i = o.length - 1; i >= 0; i--) { if (typeof o[i] === 'string' && o[i].length > 40) o.splice(i, 1); else strip(o[i]); } return; }
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && v.length > 40) delete o[k]; else strip(v); }
    };
    strip(ex.tobihaze);
    ex.tobihaze.prose = 'in the hero file\'s extras (lod2 keeps the data only)';
    // (and what lod2 repeats or cannot use: B3's packed lod2 was 111 kB, B2's 70.9; the round-B4 card states cost ~4 kB of
    // binary over B2's, so its JSON goes ~3 kB under B2's 45 kB: each state's `morphs` where it only repeats pose.morph
    // (zeros aside: the weights stay in the pose), the crawl frames' card-tip errors (in the build report), the axes'
    // head-rig block (lod2 keeps no head joint and no head blend shape: its poses are empty), the crawl solver's own
    // settings (RIG.crawl: the frames are what a runtime plays), empty coupled-limit lists, the joint list the root already
    // has, the morph list the Fins mesh's targetNames has, and the clay eye's pupil edge at 16 samples)
    const x = ex.tobihaze, nz = (o) => Object.fromEntries(Object.entries(o ?? {}).flatMap(([f, w]) => { const k = Object.entries(w ?? {}).filter(([, v]) => v); return k.length ? [[f, Object.fromEntries(k)]] : []; }));
    for (const S of Object.values(x.states ?? {})) if (S.morphs && JSON.stringify(nz(S.morphs)) === JSON.stringify(nz(S.pose?.morph))) delete S.morphs;
    if (x.crawl?.frames) x.crawl = { ...x.crawl, frames: x.crawl.frames.map(({ cardLowFromHeroLowMM, cardLowOverGroundMM, ...f }) => f) };
    // (the crawl's keys without what every key repeats — the axial joints the land settle holds, the folded median fins:
    // `common`, a key's pose is { ...common, ...pose } with the morphs merged per fin; states.json keeps the full poses)
    const F = x.crawl?.frames;
    if (F?.length > 1) {
      const same = (get) => { const s = JSON.stringify(get(F[0])); return F.every((f) => JSON.stringify(get(f)) === s); };
      const common = {}, cm = {};
      for (const k of Object.keys(F[0].pose ?? {})) if (k !== 'morph' && same((f) => f.pose?.[k])) common[k] = F[0].pose[k];
      for (const fin of Object.keys(F[0].pose?.morph ?? {})) if (same((f) => f.pose?.morph?.[fin])) cm[fin] = F[0].pose.morph[fin];
      if (Object.keys(cm).length) common.morph = cm;
      const rest = F.map((f) => {
        const pose = {};
        for (const [k, v] of Object.entries(f.pose ?? {})) {
          if (k === 'morph') { const m = Object.fromEntries(Object.entries(v).filter(([fin]) => !(fin in cm))); if (Object.keys(m).length) pose.morph = m; } else if (!(k in common)) pose[k] = v;
        }
        const { raise, ...g } = f;
        return { ...g, pose, ...(same((q) => q.raise) ? {} : { raise }) };
      });
      x.crawl = { ...x.crawl, ...(same((q) => q.raise) ? { raise: F[0].raise } : {}), common, frames: rest, rule: 'key pose = { ...common, ...pose }' };
    }
    // (round B4: the prop's keys alike — what every key repeats in `common`, a key's pose = { ...common, ...pose })
    const PF = x.prop?.frames;
    if (PF?.length > 1) {
      const same = (get) => { const s0 = JSON.stringify(get(PF[0])); return PF.every((f) => JSON.stringify(get(f)) === s0); };
      const common = {}, cm = {};
      for (const k of Object.keys(PF[0].pose ?? {})) if (k !== 'morph' && same((f) => f.pose?.[k])) common[k] = PF[0].pose[k];
      for (const fin of Object.keys(PF[0].pose?.morph ?? {})) if (same((f) => f.pose?.morph?.[fin])) cm[fin] = PF[0].pose.morph[fin];
      if (Object.keys(cm).length) common.morph = cm;
      x.prop = { ...x.prop, common, rule: 'key pose = { ...common, ...pose }', frames: PF.map((f) => {
        const pose = {};
        for (const [k, v] of Object.entries(f.pose ?? {})) {
          if (k === 'morph') { const m = Object.fromEntries(Object.entries(v).filter(([fin]) => !(fin in cm))); if (Object.keys(m).length) pose.morph = m; } else if (!(k in common)) pose[k] = v;
        }
        return { ...f, pose };
      }) };
    }
    if (x.axes) {
      delete x.axes.head; delete x.axes.jointNames;
      if (x.axes.crawl) x.axes.crawl = Object.fromEntries(Object.entries(x.axes.crawl).filter(([k]) => ['blade', 'frames', 'strideMM', 'aheadMM', 'outMM', 'raiseDeg'].includes(k)));
      for (const A of Object.values(x.axes.joints ?? {})) if (Array.isArray(A.coupled) && !A.coupled.length) delete A.coupled;
    }
    if (x.morphs?.Fins) x.morphs.Fins = { rule: '<t>_<fin>: w = pose.morph[fin][t]; drive' };
    if (x.eyes?.clay) { const { note, ...c } = eyeClayAtlas(layout, 16); x.eyes.clay = c; }
  }
  gb.addScene(P, [rootNode, ...sceneNodes]);
  // (round B4: the draws (primitives over the mesh nodes) and the GPU memory: vertex and index buffers as written (the
  // packer quantizes a little further), the morph textures at 4096 and 16384 rows, the planned maps (TEX_PLAN))
  {
    const SZ = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, J0 = gb.json;
    let draws = 0, buffers = 0;
    for (const nd of J0.nodes) if (nd.mesh !== undefined) draws += J0.meshes[nd.mesh].primitives.length;
    for (const m of J0.meshes) for (const p of m.primitives) {
      for (const a of [...Object.values(p.attributes), ...(p.indices !== undefined ? [p.indices] : [])]) { const A = J0.accessors[a]; buffers += A.count * NC[A.type] * SZ[A.componentType]; }
    }
    const TP = TEX_PLAN[tierName], maps = TP.reduce((a, x) => a + (x.px * x.px * 4) / 3, 0);
    const tot = (m) => +((buffers + m + maps) / 1e6).toFixed(3);
    Object.assign(gpu, { draws, drawTarget: DRAW_LIMIT[tierName], buffersBytes: buffers, mapsPlanned: TP, mapsBytes: Math.round(maps), totalMB4096: tot(gpu.morphBytes4096), totalMB8192: tot(gpu.morphBytes8192), totalMB16384: tot(gpu.morphBytes16384), limitMB: GPU_LIMIT[tierName] });
    gpu.totalMB = Math.max(gpu.totalMB4096, gpu.totalMB8192, gpu.totalMB16384);
    gpu.pass = gpu.totalMB <= GPU_LIMIT[tierName] && draws <= DRAW_LIMIT[tierName];
  }
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
    tangentGate, contactGate, gpu, footprint, states: { ...stateExtras, crawl: crawl.frames.map((f) => ({ phase: f.phase, pose: f.pose, weldMM: crawl.weldMM, ...(f.contacts ? { contacts: f.contacts } : {}) })), crawlCycle: { strideMM: crawl.strideMM, cycleS: crawl.cycleS, duty: crawl.duty, speedBLs: crawl.speedBLs, groundMM: crawl.groundMM, weldMM: crawl.weldMM, weldRMM: crawl.weldRMM, ...(crawl.weldBind ? { weldBind: crawl.weldBind } : {}), schedule: crawl.schedule }, prop: prop.frames, transitions }, crawl: { strideMM: crawl.strideMM, weldMM: crawl.weldMM, tipErrMM: crawl.frames.map((f) => f.tipErrMM ?? null) }, blinkWrap: morph?.blinkWrap ?? null, residual: morph?.residual ?? null, cardTargets,
    land: tierName === 'hero' ? { sides: states.land.solved.sides, ground: states.land.ground, pelvic: states.land.solved.pelvic ?? null } : undefined,
  };
  // (round B4: the contacts' posed points, gaps and distances to the hero's (the extras keep { name, kind, bone, local }))
  res.contacts = contactReport;
  Object.assign(posesHeld, holdPosesToTier(res.states, tierName, gb.json.meshes));
  res.posesHeld = posesHeld;
  // (round B4, tech P5: numbers in the report, not nulls: lod2's crawl error is its card tip's distance from the weld; a
  // side's tip error where its solve welds no tip is left out)
  res.crawl.tipErrMM = crawl.frames.map((f) => f.tipErrMM ?? (f.cardLowFromHeroLowMM ? Math.max(...Object.values(f.cardLowFromHeroLowMM)) : 0));
  if (lod2) res.crawl.cardLowOverGroundMM = crawl.frames.map((f) => Math.min(...Object.values(f.cardLowOverGroundMM ?? { x: 0 })));
  for (const sd of Object.values(res.land?.sides ?? {})) if (sd && sd.tipErrMM === null) delete sd.tipErrMM;
  log(`${tierName}: ${tris} triangles (${Object.entries(meshTris).map(([k, v]) => `${k} ${v}`).join(', ')}), ${sk.length} joints, ${res.materials} materials → ${outFile ? path.relative(root, outFile) : '(not written)'} (${(buf.length / 1e6).toFixed(2)} MB)`);
  log(`${tierName}: tangents ${Object.entries(tangentGate).map(([k, g]) => `${k} ${g.bad}/${g.n}`).join(', ')}; contacts max gap ${Object.entries(contactGate).map(([k, g]) => `${k} ${g.maxGapMM} (${g.worst})`).join(', ')} mm; morph textures ${(gpu.morphBytes4096 / 1e6).toFixed(2)} / ${(gpu.morphBytes16384 / 1e6).toFixed(2)} MB (4096 / 16384 rows); draws ${gpu.draws} (target ${gpu.drawTarget}); GPU with the planned maps ${gpu.totalMB4096} / ${gpu.totalMB8192} / ${gpu.totalMB16384} MB at 4096 / 8192 / 16384 rows (limit ${gpu.limitMB})${gpu.pass ? '' : ' — OVER'}`);
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const which = arg('--tier', 'all');
  const outDir = path.resolve(arg('--out', path.join(here, 'out', 'tiers')));
  const clay = args.includes('--clay');
  if (!clay) logDefault('round B4 has no textures yet: writing clay materials (--clay)');
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
