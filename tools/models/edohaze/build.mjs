#!/usr/bin/env node
// Builds the エドハゼ GLB tiers (geometry + baked textures) procedurally, with the マハゼ pipeline.
//   node tools/models/edohaze/build.mjs [--tier hero|lod1|lod2] [--fast] [--dump-textures <dir>]
//   GOBY_GRAVID=1 node tools/models/edohaze/build.mjs --tier hero   (the gravid female)
// Each tier is held to the model budget of a medium (M) species (docs/quality/model-budget.md, tools/models/budget.json):
//   hero  ≤ 150,000 triangles, 8 maps ≤ 2048 (the observed fish and the tank's hero: the volumetric materials)
//   lod1  ≤ 15,000 triangles, 4 maps ≤ 1024 (the near field and the other tank fish)
//   lod2  ≤ 1,500 triangles, 2 maps ≤ 256, 2 materials, 12 joints (everything else)
// Every tier's standard materials have one map set (body: colour + normal map; fins: colour + alpha; lod2 only
// alpha-tested): the maps only the hero's own volumetric materials read (ORM, the fins' data and relief, the pigment
// layers, the snout cap) ride in the extras, and the light tiers leave them out. The body's normal map carries the
// detailed surface onto the coarse mesh (body.mjs), and the iris takes a corner of the fin atlas instead of a texture
// of its own. The far tier paints the eyes on the body, keeps the melanin in its colour atlas's alpha, merges the fins
// into one rigid mesh (as a perched fish holds them) and keeps only the axial joints and the pelvic disc.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { GLBBuilder } from '../../lib/glb.mjs';
import { encodePNG } from '../../lib/png.mjs';
import { S0, Y0, SL, S_END, TL, VERT_START, VERT_COUNT, EYE, GRAVID, profileTable, toObject, botY, setEyeFilled } from './anatomy.mjs';
import { buildBody } from './body.mjs';
import { ATLAS, finDefinitions, buildFinMesh, buildFinTargets, paintFinAtlas } from './fins.mjs';
import { buildEyeMesh, eyeTransform, paintIris, PUPIL_ANGLE, IRIS_ANGLE, CORNEA_BULGE } from './eye.mjs';
import { buildMouth, buildGills } from './interior.mjs';
import { JOINTS, J, AXES, BODY, bodyWeights, interiorWeights, finWeights, buildClips } from './rig.mjs';
import { FIN_TARGETS, PERCH_FOLDS, computePose, defaultPose } from '../../../src/creatures/species/mahaze/pose.js';
import { SPECIES } from './species.mjs';
const P = SPECIES.prefix;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
// --tier hero|lod1|lod2 selects the detail level (hero = observation quality, lod1 = near, lod2 = mid distance)
const tierIdx = args.indexOf('--tier');
const tierName = tierIdx >= 0 ? args[tierIdx + 1] : args.includes('--fast') ? 'lod1' : 'hero';
// NS × NV: body sections × columns of the render mesh; NSb × NVb: the regular grid the textures are baked on;
// finSub / finNT: fin columns per ray interval / rows along the rays (finSub < 1: a column every 1/finSub rays)
const TIERS = {
  hero: {
    NS: 300, NV: 152, NSb: 400, NVb: 192, texW: 2048, texH: 1024, finSub: 4, finNT: 28, finNTCaudal: 34,
    eyeNT: 40, eyeNP: 64, interior: true, teeth: { outer: [4, 6], villi: [2, 4] }, atlas: 2048, cap: 480,
  },
  lod1: { NS: 104, NV: 52, NSb: 200, NVb: 96, texW: 1024, texH: 512, pigment: 512, finSub: 2, finNT: 6, finNTCaudal: 8, eyeNT: 12, eyeNP: 18, atlas: 1024, lite: true },
  // (baked at twice the size it ships in: 256 × 126 at the top of the colour atlas, the fins in the bottom half)
  lod2: { NS: 32, NV: 18, NSb: 100, NVb: 48, texW: 512, texH: 252, finSub: 0.5, finNT: 2, finNTCaudal: 2, atlas: 256, lite: true, far: true },
};
const tier = TIERS[tierName];
if (!tier) { console.error(`unknown tier ${tierName}`); process.exit(1); }
const dumpIdx = args.indexOf('--dump-textures');
const dumpDir = dumpIdx >= 0 ? args[dumpIdx + 1] : null;
// GOBY_GRAVID=1 builds the gravid female (egg-swollen belly) as its own set of tiers
const outFile = path.join(root, 'src', 'assets', 'models', 'edohaze', `edohaze${GRAVID ? '_gravid' : ''}.${tierName}.glb`);
// the far tier has no eyeball meshes: the body's surface takes the balls in and its texture paints them
if (tier.far) setEyeFilled(true);

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);

// ---------------------------------------------------------------- image helpers
const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSRGB = (c) => { c = Math.min(Math.max(c, 0), 1); return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); };

function toJPEG(w, h, ch, data, quality) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = data[i * ch];
    rgba[i * 4 + 1] = data[i * ch + 1];
    rgba[i * 4 + 2] = data[i * ch + 2];
    rgba[i * 4 + 3] = 255;
  }
  return jpeg.encode({ data: rgba, width: w, height: h }, quality).data;
}

/**
 * Box-filtered reduction by whole factors (w / W, h / H). kind: 'srgb' averages in linear light, 'normal' renormalises,
 * 'rgba' averages the colour in linear light weighted by its alpha (no dark fringes at the fins' edges), 'data' plain.
 */
function reduce(w, h, ch, data, W, H, kind = 'data') {
  const fx = w / W, fy = h / H;
  if (!Number.isInteger(fx) || !Number.isInteger(fy)) throw new Error(`reduce ${w}x${h} → ${W}x${H}`);
  const out = new Uint8Array(W * H * ch);
  const n = fx * fy;
  const acc = new Float64Array(ch + 1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      acc.fill(0);
      for (let b = 0; b < fy; b++)
        for (let a = 0; a < fx; a++) {
          const i = ((y * fy + b) * w + x * fx + a) * ch;
          const wa = kind === 'rgba' ? data[i + 3] / 255 + 1e-4 : 1;
          for (let c = 0; c < ch; c++) {
            const v = data[i + c];
            if ((kind === 'srgb' || kind === 'rgba') && c < 3) acc[c] += toLin(v) * wa;
            else if (kind === 'normal') acc[c] += v / 127.5 - 1;
            else acc[c] += v;
          }
          acc[ch] += wa;
        }
      const o = (y * W + x) * ch;
      if (kind === 'normal') {
        const l = Math.hypot(acc[0], acc[1], acc[2]) || 1;
        for (let c = 0; c < 3; c++) out[o + c] = Math.round((acc[c] / l) * 127.5 + 127.5);
      } else {
        for (let c = 0; c < ch; c++) out[o + c] = (kind === 'srgb' || kind === 'rgba') && c < 3 ? toSRGB(acc[c] / acc[ch]) : Math.round(acc[c] / n);
      }
    }
  return out;
}

/** Copies a w × h image of ch channels into a W-wide canvas of outCh channels at (x, y); missing channels get `fill`. */
function blit(dst, W, outCh, src, w, h, ch, x, y, fill = 255) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const o = ((y + j) * W + x + i) * outCh, s = (j * w + i) * ch;
      for (let c = 0; c < outCh; c++) dst[o + c] = c < ch ? src[s + c] : fill;
    }
}

function image(gb, name, w, h, ch, data, fmt = 'png', quality = 92) {
  const buf = fmt === 'jpeg' ? toJPEG(w, h, ch, data, quality) : encodePNG(w, h, ch, data);
  if (dumpDir) {
    fs.mkdirSync(dumpDir, { recursive: true });
    fs.writeFileSync(path.join(dumpDir, `${name}.${fmt === 'jpeg' ? 'jpg' : 'png'}`), buf);
  }
  log(`  image ${name}: ${w}x${h} ${fmt} ${(buf.length / 1e6).toFixed(2)} MB`);
  return gb.addImage(buf, fmt === 'jpeg' ? 'image/jpeg' : 'image/png', name);
}

const gb = new GLBBuilder(SPECIES.generator);
for (const e of ['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior', 'KHR_materials_clearcoat']) gb.useExtension(e);

const LINEAR = 9729, MIPMAP = 9987, CLAMP = 33071, REPEAT = 10497;
const sBody = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: CLAMP, wrapT: REPEAT });
const sClamp = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: CLAMP, wrapT: CLAMP });
const indexArray = (idx, nVerts) => (nVerts < 65536 ? Uint16Array.from(idx) : idx);

// ---------------------------------------------------------------- texture layout
// The fin atlas (fins.mjs, laid out at 2048) has a free corner, x 1024–2048 × y 1536–2048: the iris takes its left
// half; in the hero the snout cap takes the right half (albedo + roughness in the colour atlas, pigment in the data
// atlas). Each tile keeps 16 px (at 2048) clear of its neighbours, and the iris and the cap pigment leave the alpha /
// coverage at 0, so the fins' edges stay clean down the mip chain. The far tier's one colour atlas (256²) has the body
// at the top (126 rows, then 2 repeating the last; its alpha holds the melanin) and the fins in the bottom half,
// squeezed to 256 × 128; its normal atlas has the body at the same place.
const A = tier.atlas;
const IRIS_TILE = [1040 / ATLAS, 1552 / ATLAS, 480 / ATLAS, 480 / ATLAS];
const CAP_TILE = [1552 / ATLAS, 1552 / ATLAS, 480 / ATLAS, 480 / ATLAS];
const IRIS_RMAX = 0.6; // θ ≤ 108°: the part of the ball that can show
const FAR = { bodyRows: 126, bodyH: 128, finY: 128 };
/** fin atlas UV → this tier's texture */
const finUV = tier.far ? (u, v) => [u, (FAR.finY + v * (A - FAR.finY)) / A] : (u, v) => [u, v];

// ---------------------------------------------------------------- fins: the atlas first (the eyes and the hero's cap use it)
log(`tier ${tierName}`);
log('fin atlas');
const defs = finDefinitions();
const atlas = paintFinAtlas(defs, log);
let tFinCol, tFinNrm = null, tFinData = null;
let finColor;
if (tier.far) {
  // the fins reduced into the bottom half of the colour atlas (the body goes on top once baked)
  finColor = new Uint8Array(A * A * 4);
  const fins = reduce(ATLAS, ATLAS, 4, atlas.color, A, A - FAR.finY, 'rgba');
  blit(finColor, A, 4, fins, A, A - FAR.finY, 4, 0, FAR.finY);
} else {
  finColor = A === ATLAS ? atlas.color : reduce(ATLAS, ATLAS, 4, atlas.color, A, A, 'rgba');
  const irisPx = Math.round(IRIS_TILE[2] * A);
  const iris = paintIris(irisPx, IRIS_RMAX);
  blit(finColor, A, 4, iris.rgb, irisPx, irisPx, 3, Math.round(IRIS_TILE[0] * A), Math.round(IRIS_TILE[1] * A), 0);
}

// ---------------------------------------------------------------- body
log('body');
const body = buildBody({ NS: tier.NS, NV: tier.NV, NSb: tier.NSb, NVb: tier.NVb, texW: tier.texW, texH: tier.texH, capSize: tier.lite ? 0 : tier.cap, log });
const BT = body.textures;
const profile = profileTable(512);
const bodyExtras = {
  role: 'body',
  fishFrame: { S0, Y0, SL, SEND: S_END, unitsPerMM: 0.001 },
  vertebrae: { start: VERT_START, count: VERT_COUNT },
  profile: { n: profile.length, fields: ['yc', 't', 'b', 'w', 'nT', 'nB'], data: profile.flat() },
  ...(SPECIES.shaderAnatomy ? { anatomy: SPECIES.shaderAnatomy } : {}),
};
// (the game's goby bodies compute their light through the tissue themselves: transmission is off in every tier, so
// no transmission / thickness map ships; the factors stay for other glTF viewers)
const bodyExt = {
  KHR_materials_transmission: { transmissionFactor: 0.5 },
  KHR_materials_volume: { thicknessFactor: 0.008, attenuationDistance: 0.0035, attenuationColor: [0.93, 0.74, 0.5] },
  KHR_materials_ior: { ior: 1.37 },
  KHR_materials_clearcoat: { clearcoatFactor: 0.35, clearcoatRoughnessFactor: 0.14 },
};
let mBody;
if (!tier.lite) {
  // hero: colour, relief, occlusion + roughness, and the pigment layers and snout cap the volumetric material reads
  const capPx = BT.cap.size;
  blit(finColor, A, 4, BT.cap.albedo, capPx, capPx, 4, CAP_TILE[0] * ATLAS, CAP_TILE[1] * ATLAS);
  if (capPx !== CAP_TILE[2] * ATLAS) throw new Error(`snout cap ${capPx} px does not fill its tile`);
  blit(atlas.data, ATLAS, 4, BT.cap.pigment, capPx, capPx, 3, CAP_TILE[0] * ATLAS, CAP_TILE[1] * ATLAS, 0);
  tFinCol = gb.addTexture(image(gb, 'fin_basecolor_alpha', A, A, 4, finColor, 'png'), sClamp, 'fin_basecolor_alpha_iris_snoutcap');
  // (the hero-only maps ride in the extras, read by the volumetric materials (applyHero.ts): the tier's standard
  // materials, drawn when those are off, keep the light tiers' map set, so the species compiles no third program)
  tFinNrm = gb.addTexture(image(gb, 'fin_normal', ATLAS, ATLAS, 3, atlas.normal, 'jpeg', 95), sClamp, 'fin_normal');
  tFinData = gb.addTexture(image(gb, 'fin_data', ATLAS, ATLAS, 4, atlas.data, 'png'), sClamp, 'fin_ray_mel_irid_coverage_snoutcap_pigment');
  const tAlb = gb.addTexture(image(gb, 'body_basecolor', BT.width, BT.height, 3, BT.albedo, 'jpeg', 93), sBody, 'body_basecolor');
  const tNrm = gb.addTexture(image(gb, 'body_normal', BT.width, BT.height, 3, BT.normal, 'png'), sBody, 'body_normal');
  const orm = reduce(BT.width, BT.height, 3, BT.orm, BT.width / 2, BT.height / 2);
  const tOrm = gb.addTexture(image(gb, 'body_orm', BT.width / 2, BT.height / 2, 3, orm, 'png'), sBody, 'body_occlusion_roughness');
  const tPig = gb.addTexture(image(gb, 'body_pigment', BT.width, BT.height, 3, BT.pigment, SPECIES.pigmentPNG ? 'png' : 'jpeg', 95), sBody, 'body_pigment_mel_irid_xan');
  let rough = 0;
  for (let t = 0; t < orm.length / 3; t++) rough += orm[t * 3 + 1] / 255;
  mBody = gb.addMaterial({
    name: `${P}_Body`,
    pbrMetallicRoughness: { baseColorTexture: { index: tAlb }, metallicFactor: 0, roughnessFactor: +(rough / (orm.length / 3)).toFixed(3) },
    normalTexture: { index: tNrm, scale: 1 },
    extensions: bodyExt,
    extras: {
      mahaze: {
        ...bodyExtras,
        pigmentTexture: tPig,
        ormTexture: tOrm,
        // planar (y, z) projected front of the snout, replaces the converging loft UVs at the tip; its two maps are
        // tiles of the fin atlases (tile: x, y, w, h in UV)
        snoutCap: { albedoRoughness: tFinCol, pigment: tFinData, rectMM: BT.cap.rect, tile: CAP_TILE },
      },
    },
  });
} else {
  // light tiers: the occlusion is baked into the colour and the roughness is the body's mean (no ORM map)
  const nT = BT.width * BT.height;
  const alb = new Uint8Array(nT * 3);
  let rough = 0;
  for (let t = 0; t < nT; t++) {
    const ao = 1 - 0.6 * (1 - BT.orm[t * 3] / 255);
    for (let c = 0; c < 3; c++) alb[t * 3 + c] = toSRGB(toLin(BT.albedo[t * 3 + c]) * ao);
    rough += BT.orm[t * 3 + 1] / 255;
  }
  rough /= nT;
  let tAlb, tNrm, tPig = null;
  if (tier.far) {
    const rows = FAR.bodyRows;
    const albR = reduce(BT.width, BT.height, 3, alb, A, rows, 'srgb');
    const nrmR = reduce(BT.width, BT.height, 3, BT.normal, A, rows, 'normal');
    // no pigment map: the alpha carries the melanin with the iridophores and xanthophores folded in at their green
    // filtering (bodyTranslucency.ts gbSkinT), so the far body lets through as much as the near one
    const pigR = reduce(BT.width, BT.height, 3, BT.pigment, A, rows);
    const mel = new Uint8Array(A * rows);
    for (let i = 0; i < A * rows; i++) {
      const m = pigR[i * 3] / 255, ir = pigR[i * 3 + 1] / 255, xa = pigR[i * 3 + 2] / 255;
      mel[i] = Math.round(Math.min(1, m + (-Math.log(1 - 0.45 * ir) + 0.12 * xa) / 3.8) * 255);
    }
    blit(finColor, A, 4, albR, A, rows, 3, 0, 0);
    for (let i = 0; i < A * rows; i++) finColor[i * 4 + 3] = mel[i];
    const nrmAtlas = new Uint8Array(A * A * 3);
    for (let i = 0; i < A * A; i++) { nrmAtlas[i * 3] = 128; nrmAtlas[i * 3 + 1] = 128; nrmAtlas[i * 3 + 2] = 255; }
    blit(nrmAtlas, A, 3, nrmR, A, rows, 3, 0, 0);
    // (the rows under the body repeat its last one: the fins' colour stays out of the belly)
    for (let g = rows; g < FAR.bodyH; g++) {
      finColor.copyWithin(g * A * 4, (rows - 1) * A * 4, rows * A * 4);
      nrmAtlas.copyWithin(g * A * 3, (rows - 1) * A * 3, rows * A * 3);
    }
    tFinCol = tAlb = gb.addTexture(image(gb, 'atlas_basecolor_alpha', A, A, 4, finColor, 'png'), sClamp, 'body_fins_basecolor_alpha');
    tNrm = gb.addTexture(image(gb, 'atlas_normal', A, A, 3, nrmAtlas, 'png'), sClamp, 'body_normal');
  } else {
    tAlb = gb.addTexture(image(gb, 'body_basecolor', BT.width, BT.height, 3, alb, 'jpeg', 93), sBody, 'body_basecolor');
    tNrm = gb.addTexture(image(gb, 'body_normal', BT.width, BT.height, 3, BT.normal, 'png'), sBody, 'body_normal');
    const pw = tier.pigment, ph = (tier.pigment * BT.height) / BT.width;
    const pig = reduce(BT.width, BT.height, 3, BT.pigment, pw, ph);
    tPig = gb.addTexture(image(gb, 'body_pigment', pw, ph, 3, pig, 'png'), sBody, 'body_pigment_mel_irid_xan');
    tFinCol = gb.addTexture(image(gb, 'fin_basecolor_alpha', A, A, 4, finColor, 'png'), sClamp, 'fin_basecolor_alpha_iris');
  }
  mBody = gb.addMaterial({
    name: `${P}_Body`,
    pbrMetallicRoughness: { baseColorTexture: { index: tAlb }, metallicFactor: 0, roughnessFactor: +rough.toFixed(3) },
    normalTexture: { index: tNrm, scale: 1 },
    extensions: bodyExt,
    extras: { mahaze: { ...bodyExtras, ...(tPig !== null ? { pigmentTexture: tPig } : { pigmentInMapAlpha: [0, 0, 1, FAR.bodyRows / A] }) } },
  });
}

// ---------------------------------------------------------------- skeleton
// the far tier keeps the axial chain and the pelvic disc (12 joints): the jaws, gill covers, eyes and pectorals hand
// their skin to the nearest kept ancestor
log('rig');
const FAR_JOINTS = new Set(['J_root', 'J_head', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal', 'J_caudal2', 'J_pelvic']);
const kept = JOINTS.map((j) => !tier.far || FAR_JOINTS.has(j.name));
const skinJoints = JOINTS.map((j, i) => i).filter((i) => kept[i]);
/** rig joint index → skin joint index (a dropped joint → its nearest kept ancestor) */
const skinIndex = JOINTS.map((j, i) => {
  let a = i;
  while (!kept[a]) a = J[JOINTS[a].parent];
  return skinJoints.indexOf(a);
});
const jointNodes = [];
JOINTS.forEach((j, i) => {
  if (!kept[i]) return;
  const par = j.parent ? JOINTS[J[j.parent]].obj : [0, 0, 0];
  jointNodes[i] = gb.addNode({ name: j.name, translation: j.obj.map((v, c) => v - par[c]), children: [] });
});
JOINTS.forEach((j, i) => { if (kept[i] && j.parent) gb.json.nodes[jointNodes[J[j.parent]]].children.push(jointNodes[i]); });
const ibm = new Float32Array(skinJoints.length * 16);
skinJoints.forEach((i, n) => {
  const o = JOINTS[i].obj;
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -o[0], -o[1], -o[2], 1], n * 16);
});
const skin = gb.addSkin({ name: `${P}_Rig`, joints: skinJoints.map((i) => jointNodes[i]), skeleton: jointNodes[J.J_root], inverseBindMatrices: gb.addAccessor(ibm, 'MAT4') });
const skinned = [];
/** the rig's weights (rig joint indices) on this skin's joints, merged where the far tier folds joints together */
const skinAttrs = (w) => {
  const n = w.joints.length / 4;
  const joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
  const m = new Map();
  for (let v = 0; v < n; v++) {
    m.clear();
    for (let c = 0; c < 4; c++) {
      const wt = w.weights[v * 4 + c];
      if (!wt) continue;
      const jn = skinIndex[w.joints[v * 4 + c]];
      m.set(jn, (m.get(jn) || 0) + wt);
    }
    [...m.entries()].sort((a, b) => b[1] - a[1]).forEach(([jn, wt], c) => { joints[v * 4 + c] = jn; weights[v * 4 + c] = wt; });
  }
  return { JOINTS_0: { array: joints, type: 'VEC4' }, WEIGHTS_0: { array: weights, type: 'VEC4', normalized: true } };
};

const bw = bodyWeights(body);
// (the far tier's body sits in the top rows of its atlas)
const bodyUVs = tier.far ? body.uv.map((x, i) => (i & 1 ? (x * FAR.bodyRows) / A : x)) : body.uv;
const bodyPrim = gb.primitive({ position: body.position, normal: body.normal, tangent: body.tangent, uv: bodyUVs, indices: indexArray(body.indices, body.position.length / 3), material: mBody, extraAttributes: skinAttrs(bw) });
skinned.push(gb.addNode({ name: 'Body', mesh: gb.addMesh('Body', [bodyPrim]), skin }));

// ---------------------------------------------------------------- mouth & gill interiors (hero)
if (tier.interior) {
  log('interiors');
  const mInterior = gb.addMaterial({
    name: `${P}_Interior`,
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.3 },
    doubleSided: true,
    extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.6, clearcoatRoughnessFactor: 0.08 } },
    extras: { mahaze: { role: 'interior' } },
  });
  const mouth = buildMouth(body, { teeth: tier.teeth });
  const gills = buildGills(body);
  for (const part of [mouth.cavity, mouth.teeth, gills]) {
    const w = interiorWeights(part, body);
    const prim = gb.primitive({
      position: part.position, normal: part.normal, uv: part.uv, indices: indexArray(part.indices, part.position.length / 3), material: mInterior,
      extraAttributes: { ...skinAttrs(w), COLOR_0: { array: part.color, type: 'VEC4' }, _GILL: { array: part.gill, type: 'SCALAR' } },
    });
    skinned.push(gb.addNode({ name: part.name, mesh: gb.addMesh(part.name, [prim]), skin }));
    log(`  ${part.name}: ${part.position.length / 3} verts, ${part.indices.length / 3} tris`);
  }
}

// ---------------------------------------------------------------- eyes (children of the eye joints; painted on the far tier's body)
if (!tier.far) {
  log('eyes');
  const mEye = gb.addMaterial({
    name: `${P}_Eye`,
    pbrMetallicRoughness: { baseColorTexture: { index: tFinCol }, metallicFactor: 0, roughnessFactor: 0.4 },
    extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.03 }, KHR_materials_ior: { ior: 1.376 } },
    // irisTile / irisRMax: where the iris map sits in the fin atlas, and how much of the ball it spans (eye.mjs)
    extras: { mahaze: { role: 'eye', radiusMM: EYE.radius, pupilAngle: PUPIL_ANGLE, irisAngle: IRIS_ANGLE, corneaBulge: CORNEA_BULGE, irisTile: IRIS_TILE, irisRMax: IRIS_RMAX, ...(SPECIES.eye || {}) } },
  });
  const eye = buildEyeMesh(tier.eyeNT, tier.eyeNP, { rMax: IRIS_RMAX, tile: IRIS_TILE });
  const meshEye = gb.addMesh('Eye', [gb.primitive({ ...eye, indices: indexArray(eye.indices, eye.position.length / 3), material: mEye })]);
  for (const [side, name, jn] of [[1, 'Eye_L', 'J_eyeL'], [-1, 'Eye_R', 'J_eyeR']]) {
    const tr = eyeTransform(side);
    const node = gb.addNode({ name, mesh: meshEye, rotation: tr.rotation, ...(tr.offset ? { translation: tr.offset } : {}) });
    gb.json.nodes[jointNodes[J[jn]]].children.push(node);
  }
}

// ---------------------------------------------------------------- fins
log('fins');
const mFin = gb.addMaterial({
  name: `${P}_Fin`,
  pbrMetallicRoughness: { baseColorTexture: { index: tFinCol }, metallicFactor: 0, roughnessFactor: 0.38 },
  alphaMode: tier.far ? 'MASK' : 'BLEND',
  ...(tier.far ? { alphaCutoff: 0.5 } : {}),
  doubleSided: true,
  extensions: { KHR_materials_ior: { ior: 1.36 } },
  extras: { mahaze: { role: 'fin', ...(tFinData !== null ? { dataTexture: tFinData, normalTexture: tFinNrm } : {}) } },
});
const finNodes = {};
// lowest point of the pelvic sucker rim (the fish rests on it), from the full-detail disc so every tier rests alike
let contactFishY = Infinity;
{
  const pel = buildFinMesh(defs.find((d) => d.type === 'pelvic'), 6, 36);
  for (let i = 1; i < pel.fish.length; i += 3) contactFishY = Math.min(contactFishY, pel.fish[i]);
}
// the far tier's rigid fins as the driver holds a perched fish: its fold weights (pose.js PERCH_FOLDS, as Behavior.js
// holds them; the first dorsal at its rest fold) and the pectorals set down on the sand by their joints' resting rotation
const perch = computePose(defaultPose(), AXES, BODY);
const restMorph = {
  ...perch.morph,
  Fin_Dorsal1: [BODY.restFold.d1, 0], Fin_Dorsal2: [PERCH_FOLDS.d2, 0], Fin_Anal: [PERCH_FOLDS.anal, 0], Fin_Caudal: [PERCH_FOLDS.caudal, 0],
};
const PEC_JOINT = { Fin_Pectoral_L: 'J_pecL', Fin_Pectoral_R: 'J_pecR' };
const rotate = ([x, y, z, w], v) => {
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
const merged = { position: [], normal: [], uv: [], indices: [], joints: [], weights: [] };
for (const def of defs) {
  const SUB = tier.finSub, NT = def.name === 'Fin_Caudal' ? tier.finNTCaudal : tier.finNT;
  const m = buildFinMesh(def, SUB, NT);
  const w = finWeights(def.name, m.fish, m.rayT, m.baseS);
  const names = FIN_TARGETS[def.name];
  const targets = buildFinTargets(def, SUB, NT, names);
  for (let i = 0; i < m.uv.length; i += 2) [m.uv[i], m.uv[i + 1]] = finUV(m.uv[i], m.uv[i + 1]);
  if (tier.far) {
    // one rigid mesh for all the fins, each in its resting fold (the far tier has no morph targets)
    const base = merged.position.length / 3;
    const rest = restMorph[def.name] || [];
    const jn = PEC_JOINT[def.name], q = jn && perch.q[jn], pivot = jn && JOINTS[J[jn]].obj;
    for (let v = 0; v < m.position.length / 3; v++) {
      let p = [0, 1, 2].map((c) => {
        let x = m.position[v * 3 + c];
        targets.forEach((d, t) => { x += (rest[t] || 0) * d[v * 3 + c]; });
        return x;
      });
      let n = [m.normal[v * 3], m.normal[v * 3 + 1], m.normal[v * 3 + 2]];
      if (q) { p = rotate(q, p.map((x, c) => x - pivot[c])).map((x, c) => x + pivot[c]); n = rotate(q, n); }
      merged.position.push(...p);
      merged.normal.push(...n);
    }
    merged.uv.push(...m.uv);
    for (const ix of m.indices) merged.indices.push(base + ix);
    const sa = skinAttrs(w);
    merged.joints.push(...sa.JOINTS_0.array);
    merged.weights.push(...sa.WEIGHTS_0.array);
    continue;
  }
  const prim = gb.primitive({ position: m.position, normal: m.normal, tangent: tFinNrm !== null ? m.tangent : undefined, uv: m.uv, indices: indexArray(m.indices, m.position.length / 3), material: mFin, extraAttributes: skinAttrs(w), targets });
  const mesh = gb.addMesh(def.name, [prim], { targetNames: names });
  gb.json.meshes[mesh].weights = names.map(() => 0);
  finNodes[def.name] = gb.addNode({ name: def.name, mesh, skin, extras: { mahaze: { fin: def.name } } });
  skinned.push(finNodes[def.name]);
}
if (tier.far) {
  const n = merged.position.length / 3;
  const prim = gb.primitive({
    position: Float32Array.from(merged.position), normal: Float32Array.from(merged.normal), uv: Float32Array.from(merged.uv),
    indices: indexArray(merged.indices, n), material: mFin,
    extraAttributes: { JOINTS_0: { array: Uint8Array.from(merged.joints), type: 'VEC4' }, WEIGHTS_0: { array: Uint8Array.from(merged.weights), type: 'VEC4', normalized: true } },
  });
  skinned.push(gb.addNode({ name: 'Fins', mesh: gb.addMesh('Fins', [prim]), skin, extras: { mahaze: { fin: 'all' } } }));
  log(`  Fins (merged): ${n} verts, ${merged.indices.length / 3} tris`);
}

// ---------------------------------------------------------------- animations
log('animations');
for (const clip of buildClips()) {
  const channels = clip.channels.filter((c) => kept[c.joint]).map((c) => ({ node: jointNodes[c.joint], path: c.path, times: c.times, values: c.values }));
  for (const wch of clip.weights) if (finNodes[wch.mesh] !== undefined) channels.push({ node: finNodes[wch.mesh], path: 'weights', times: wch.times, values: wch.values });
  gb.addAnimation({ name: clip.name, channels });
  log(`  ${clip.name}: ${clip.duration.toFixed(3)}s, ${channels.length} channels`);
}

// ---------------------------------------------------------------- scene
const rootNode = gb.addNode({
  name: SPECIES.rootName,
  children: [jointNodes[J.J_root]],
  extras: {
    species: SPECIES.scientific,
    commonName: SPECIES.commonName,
    totalLength_mm: TL,
    standardLength_mm: SL,
    units: 'metres (+Y dorsal, +Z anterior)',
    animations: SPECIES.animations,
    // rig axes (object space, sign folded in) for procedural animation with src/fish/pose.js
    mahazeRig: { axes: AXES, contactY: toObject([SPECIES.pelvicBaseS, contactFishY, 0])[1], tailContactY: toObject(SPECIES.tailContact)[1] },
    ...(SPECIES.viewer ? { viewer: SPECIES.viewer } : {}),
  },
});
// skinned meshes sit at the scene root (their node transforms are ignored; joints drive them)
gb.addScene(P, [rootNode, ...skinned]);
gb.json.asset.copyright = 'Procedurally generated model (no photographic textures).';

const glb = gb.toBuffer();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, glb);
const tris = gb.json.meshes.reduce((a, m) => a + m.primitives.reduce((b, p) => b + gb.json.accessors[p.indices].count / 3, 0), 0);
log(`wrote ${path.relative(root, outFile)} (${(glb.length / 1e6).toFixed(2)} MB): ${tris} triangles (body ${body.stats.triangles}), ${(gb.json.images || []).length} maps, ${gb.json.materials.length} materials, ${skinJoints.length} joints`);
