// One detail level (hero, lod1, lod2) of a goby GLB, built from a species' own modules (anatomy, body, fins, eye,
// interior, rig: the マハゼ pipeline and its ports to エドハゼ and ヒメハゼ). Each level fits the creatures' model budget
// (tools/models/budget.json; docs/quality/model-budget.md). For a size-class M goby (the levels' sizes are the
// species' own, GOBY_TIERS below for M; the マハゼ's, size class L, in tools/models/mahaze/build.mjs):
//
//   hero  observation: 8 maps — body colour (A: ambient occlusion), body normal, body pigment (A: roughness), the fin
//         atlas with the iris in its corner; and only for the volumetric hero material: the fin normal and data maps
//         and the snout cap's two maps. Body 300 × 144, fins 4 × 24, the mouth and gills, teeth 25 triangles each.
//   lod1  near: the first 4 of the hero's maps at 1024; no mouth, no snout cap; body 120 × 40, fins 2 × 8.
//   lod2  far: 2 maps of 256 (body colour, A: melanin; fin atlas) and 2 materials (body; fins and eyes in one
//         alpha-tested mesh posed at rest); 12 joints (the axial chain and the pelvic disc); body 40 × 12.
//
// A species whose individuals wear several looks (the マハゼ: three patterns × three colour morphs) ships them in the
// maps' channels instead of maps of their own (the morph layout, bodyMorphMaps below): the same count of maps.
//
// Every level keeps the same names the game reads (joints, fin meshes and morph targets where there are fins of
// their own, the clips, the body's extras); the near levels keep the same material features (maps, blending), so
// the hero file's standard materials and lod1 compile to the same programs. See docs/quality/model-budget.md §5.
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { GLBBuilder } from './glb.mjs';
import { encodePNG } from './png.mjs';
import {
  downsample2, softenChannels, finAtlasForTier, maskFinAlpha, remapUV, withAlpha, LOD2_JOINTS, reduceSkeleton, remapSkin,
  restFin, placeEye, mergeParts, vertexNormals, compactIndices,
} from './gobyTiers.mjs';

/** The default levels for a size-class M goby (≤ 120 mm). */
export const GOBY_TIERS = {
  hero: { NS: 300, NV: 144, NSb: 400, NVb: 192, texW: 2048, texH: 1024, texDown: 0, finSub: 4, finNT: 24, finNTCaudal: 30, atlas: 2048, eyeNT: 48, eyeNP: 64, interior: true, cap: true, lod2: false },
  lod1: { NS: 120, NV: 40, NSb: 200, NVb: 96, texW: 1024, texH: 512, texDown: 0, finSub: 2, finNT: 8, finNTCaudal: 10, atlas: 1024, eyeNT: 12, eyeNP: 16, interior: false, cap: false, lod2: false },
  lod2: { NS: 40, NV: 12, NSb: 100, NVb: 48, texW: 512, texH: 256, texDown: 1, finSub: 1, finNT: 2, finNTCaudal: 3, atlas: 256, eyeNT: 4, eyeNP: 6, interior: false, cap: false, lod2: true },
};

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
 * @param {object} o
 *   root, outFile, tierName, tier, log, dumpDir
 *   S: the species' SPECIES (prefix, rootName, generator, scientific, commonName, variant?, pelvicBaseS, tailContact,
 *      pigmentPNG, animations, viewer, eye?, shaderAnatomy?)
 *   A: anatomy exports { S0, Y0, SL, S_END, TL, VERT_START, VERT_COUNT, EYE, profileTable, toObject, botY }
 *   buildBody, F (fins: finDefinitions, buildFinMesh, buildFinTargets, paintFinAtlas), E (eye: buildEyeMesh,
 *   eyeTransform, paintIris, PUPIL_ANGLE, IRIS_ANGLE, CORNEA_BULGE), I (interior: buildMouth, buildGills),
 *   R (rig: JOINTS, J, AXES, REST_POSE, bodyWeights, interiorWeights, finWeights, buildClips), FIN_TARGETS
 */
export function buildGobyTier(o) {
  const { root, outFile, tierName, tier, log, dumpDir, S, A, buildBody, F, E, I, R, FIN_TARGETS } = o;
  const P = S.prefix;
  const far = tier.lod2;
  // a species whose individuals differ in pattern and colour (マハゼ): the morph layout (see bodyMorphMaps)
  const M = o.morphs ?? null;

  function image(gb, name, w, h, ch, data, fmt = 'png', quality = 92) {
    const buf = fmt === 'jpeg' ? toJPEG(w, h, ch, data, quality) : encodePNG(w, h, ch, data);
    if (dumpDir) {
      fs.mkdirSync(dumpDir, { recursive: true });
      fs.writeFileSync(path.join(dumpDir, `${name}.${fmt === 'jpeg' ? 'jpg' : 'png'}`), buf);
    }
    log(`  image ${name}: ${w}x${h} ${fmt} ${(buf.length / 1e6).toFixed(2)} MB`);
    return gb.addImage(buf, fmt === 'jpeg' ? 'image/jpeg' : 'image/png', name);
  }

  const gb = new GLBBuilder(S.generator);
  for (const e of ['KHR_materials_ior', 'KHR_materials_clearcoat']) gb.useExtension(e);
  const LINEAR = 9729, MIPMAP = 9987, CLAMP = 33071, REPEAT = 10497;
  const sBody = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: CLAMP, wrapT: REPEAT });
  const sClamp = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: CLAMP, wrapT: CLAMP });

  // ------------------------------------------------------------------------------------------------ body
  log('body');
  log(`tier ${tierName}${S.variant ? `, variant ${S.variant}` : ''}`);
  const body = buildBody({
    NS: tier.NS, NV: tier.NV, NSb: tier.NSb, NVb: tier.NVb, texW: tier.texW, texH: tier.texH, cap: tier.cap, log,
    ...(M ? { patterns: M.table.patterns.map((_, i) => i + 1), colors: M.validate ? M.table.colors.map((_, i) => i + 1) : [] } : {}),
  });
  const { tAlb, tNrm, tPig, tCapAlb, tCapPig, capRect } = M ? bodyMorphMaps(body.patternTextures) : bodyMaps(body.textures);
  if (M?.validate) validateMorphs(body.patternTextures, M.table, M.rebuild, log);

  /** One fish per file: its colour, normal and pigment maps (+ the snout cap's two on the hero). */
  function bodyMaps(BT) {
    // the baked maps at the level's own size (the far level is baked at twice its size and filtered down)
    let W = BT.width, H = BT.height, albedo = BT.albedo, normalMap = BT.normal, orm = BT.orm, pigment = BT.pigment;
    for (let k = 0; k < tier.texDown; k++) {
      albedo = downsample2(W, H, 3, albedo).data; normalMap = downsample2(W, H, 3, normalMap).data;
      orm = downsample2(W, H, 3, orm).data; pigment = downsample2(W, H, 3, pigment).data;
      W >>= 1; H >>= 1;
    }
    const nT = W * H;
    const r = {};
    if (far) {
      // body colour with the melanophores in its alpha: the far level's translucency filters by them (no pigment map)
      r.tAlb = gb.addTexture(image(gb, 'body_basecolor_melanin', W, H, 4, withAlpha(albedo, pigment, 3, 0, nT), 'png'), sBody, 'body_basecolor_melanin');
    } else {
      // body colour with the ambient occlusion in its alpha; pigment (melanophores, iridophores, xanthophores) with the
      // roughness in its alpha: the near levels' four maps hold what the ORM map held
      r.tAlb = gb.addTexture(image(gb, 'body_basecolor_ao', W, H, 4, withAlpha(albedo, orm, 3, 0, nT), 'png'), sBody, 'body_basecolor_ao');
      r.tNrm = gb.addTexture(image(gb, 'body_normal', W, H, 3, normalMap, 'png'), sBody, 'body_normal');
      r.tPig = gb.addTexture(image(gb, 'body_pigment', W, H, 4, withAlpha(pigment, orm, 3, 1, nT), 'png'), sBody, 'body_pigment_mel_irid_xan_rough');
    }
    if (tier.cap) {
      r.tCapAlb = gb.addTexture(image(gb, 'snoutcap_basecolor_roughness', BT.cap.size, BT.cap.size, 4, BT.cap.albedo, 'png'), sClamp, 'snoutcap_basecolor_roughness');
      r.tCapPig = gb.addTexture(image(gb, 'snoutcap_pigment', BT.cap.size, BT.cap.size, 3, BT.cap.pigment, 'png'), sClamp, 'snoutcap_pigment');
      r.capRect = BT.cap.rect;
    }
    return r;
  }

  /**
   * The morph layout: every individual is one of the patterns in one of the colour morphs, rebuilt by the game from
   *   colour   rgb: the standard colour's ground without the melanophores (the far level: its ambient occlusion folded
   *            in), a: the xanthophores
   *   normal   rg: the tangent-space normal's x and y (z rebuilt), b: ambient occlusion, a: roughness (near levels)
   *   pigment  rgb: the melanophores of patterns 1, 2, 3, a: the iridophores
   *   cap      the snout cap's ground (a: roughness) and its melanophores of patterns 1–3 (a: xanthophores) (hero)
   * The iridophores, xanthophores, ground and roughness are the first pattern's (the patterns differ in their
   * melanophores; the colour morphs scale the pigments and change the ground: body extras `morphs`).
   */
  function bodyMorphMaps(TS) {
    const T0 = TS[0];
    let W = T0.width, H = T0.height;
    const n0 = W * H;
    let ground = T0.ground;
    if (far) {
      // no occlusion map on the far level: half its strength folded into the ground
      ground = new Uint8Array(n0 * 3);
      for (let i = 0; i < n0; i++) {
        const k = 1 - 0.5 * (1 - T0.orm[i * 3] / 255);
        for (let c = 0; c < 3; c++) ground[i * 3 + c] = linToSRGB8(sRGB8ToLin(T0.ground[i * 3 + c]) * k);
      }
    }
    const pack = (n, chans) => {
      const out = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) chans.forEach(([a, ch, c], k) => { out[i * 4 + k] = a[i * ch + c]; });
      return out;
    };
    let colour = pack(n0, [[ground, 3, 0], [ground, 3, 1], [ground, 3, 2], [T0.raw.xan, 1, 0]]);
    let nrm = pack(n0, [[T0.normal, 3, 0], [T0.normal, 3, 1], [T0.orm, 3, 0], [T0.orm, 3, 1]]);
    let pig = pack(n0, [[TS[0].raw.mel, 1, 0], [TS[1].raw.mel, 1, 0], [TS[2].raw.mel, 1, 0], [T0.raw.iri, 1, 0]]);
    for (let k = 0; k < tier.texDown; k++) {
      colour = downsample2(W, H, 4, colour).data; nrm = downsample2(W, H, 4, nrm).data; pig = downsample2(W, H, 4, pig).data;
      W >>= 1; H >>= 1;
    }
    // (the distance tiers' melanophores softened by a texel: see softenChannels)
    if (!tier.cap) softenChannels(pig, W, H, 4, [0, 1, 2]);
    const r = {};
    r.tAlb = gb.addTexture(image(gb, 'body_basecolor_xan', W, H, 4, colour, 'png'), sBody, 'body_basecolor_xan');
    if (!far) r.tNrm = gb.addTexture(image(gb, 'body_normal_ao_rough', W, H, 4, nrm, 'png'), sBody, 'body_normal_ao_rough');
    r.tPig = gb.addTexture(image(gb, 'body_melanin3_irid', W, H, 4, pig, 'png'), sBody, 'body_melanin3_irid');
    if (tier.cap) {
      const C = T0.capMorph, nc = C.size * C.size;
      const capPig = pack(nc, [[TS[0].capMorph.mel, 1, 0], [TS[1].capMorph.mel, 1, 0], [TS[2].capMorph.mel, 1, 0], [C.xan, 1, 0]]);
      r.tCapAlb = gb.addTexture(image(gb, 'snoutcap_basecolor_roughness', C.size, C.size, 4, C.ground, 'png'), sClamp, 'snoutcap_basecolor_roughness');
      r.tCapPig = gb.addTexture(image(gb, 'snoutcap_melanin3_xan', C.size, C.size, 4, capPig, 'png'), sClamp, 'snoutcap_melanin3_xan');
      r.capRect = C.rect;
    }
    return r;
  }

  const profile = A.profileTable(512);
  const mBody = gb.addMaterial({
    name: `${P}_Body`,
    // (a plain glTF viewer: colour, relief and a mid roughness; the game reads the channels named in the extras)
    pbrMetallicRoughness: { baseColorTexture: { index: tAlb }, metallicFactor: 0, roughnessFactor: 0.33 },
    ...(far ? {} : { normalTexture: { index: tNrm, scale: 1 } }),
    extensions: {
      KHR_materials_ior: { ior: 1.37 },
      ...(far ? {} : { KHR_materials_clearcoat: { clearcoatFactor: 0.35, clearcoatRoughnessFactor: 0.14 } }),
    },
    extras: {
      mahaze: {
        role: 'body',
        // what the maps' free channels hold (bodyTranslucency.ts, hero/BodyMaterial.js)
        channels: M
          ? (far ? { mapAlpha: 'xanthophores', pigment: 'melanin3+iridophores' } : { mapAlpha: 'xanthophores', normal: 'xy+ao+roughness', aoStrength: 0.85, pigment: 'melanin3+iridophores' })
          : far ? { mapAlpha: 'melanin' } : { mapAlpha: 'ao', aoStrength: 0.85, pigmentAlpha: 'roughness' },
        ...(far && !M ? {} : { pigmentTexture: tPig }),
        // the patterns and colour morphs the individuals wear (the game picks one per fish: src/creatures/models)
        ...(M ? { morphs: M.table } : {}),
        // planar (y, z) projected front of the snout, replaces the converging loft UVs at the tip (hero only)
        ...(tier.cap ? { snoutCap: { albedoRoughness: tCapAlb, pigment: tCapPig, rectMM: capRect } } : {}),
        fishFrame: { S0: A.S0, Y0: A.Y0, SL: A.SL, SEND: A.S_END, unitsPerMM: 0.001, ...(A.jaws ? { jaws: A.jaws } : {}) },
        vertebrae: { start: A.VERT_START, count: A.VERT_COUNT },
        profile: { n: profile.length, fields: ['yc', 't', 'b', 'w', 'nT', 'nB'], data: profile.flat() },
        ...(S.shaderAnatomy ? { anatomy: S.shaderAnatomy } : {}),
      },
    },
  });

  // ------------------------------------------------------------------------------------------------ skeleton
  log('rig');
  const { JOINTS, J } = R;
  // the far level keeps the axial chain and the pelvic disc; the head-detail joints hand their weights to the head,
  // the pectorals' and the eyes' to their parents (the merged fins are posed at rest)
  const red = far ? reduceSkeleton(JOINTS, LOD2_JOINTS) : { kept: JOINTS, remap: JOINTS.map((_, i) => i) };
  const kept = red.kept, remap = red.remap;
  const keptIndex = Object.fromEntries(kept.map((j, i) => [j.name, i]));
  const jointNodes = kept.map((j) => {
    const par = j.parent ? JOINTS[J[j.parent]].obj : [0, 0, 0];
    return gb.addNode({ name: j.name, translation: j.obj.map((v, k) => v - par[k]), children: [] });
  });
  kept.forEach((j, i) => { if (j.parent) gb.json.nodes[jointNodes[keptIndex[j.parent]]].children.push(jointNodes[i]); });
  const ibm = new Float32Array(kept.length * 16);
  kept.forEach((j, i) => { ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.obj[0], -j.obj[1], -j.obj[2], 1], i * 16); });
  const skin = gb.addSkin({ name: `${P}_Rig`, joints: jointNodes, skeleton: jointNodes[keptIndex.J_root], inverseBindMatrices: gb.addAccessor(ibm, 'MAT4') });
  const skinned = [];
  const skinAttrs = (w) => ({ JOINTS_0: { array: w.joints, type: 'VEC4' }, WEIGHTS_0: { array: w.weights, type: 'VEC4', normalized: true } });
  const skinOf = (w) => (far ? remapSkin(w, remap) : w);

  const bw = skinOf(R.bodyWeights(body));
  const bodyPrim = gb.primitive({
    position: body.position, normal: body.normal, tangent: far ? null : body.tangent, uv: body.uv,
    indices: compactIndices(body.indices, body.position.length / 3), material: mBody, extraAttributes: skinAttrs(bw),
  });
  skinned.push(gb.addNode({ name: 'Body', mesh: gb.addMesh('Body', [bodyPrim]), skin }));

  // ------------------------------------------------------------------------------------------------ mouth & gills
  if (tier.interior) {
    log('interiors');
    const mInterior = gb.addMaterial({
      name: `${P}_Interior`,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.3 },
      doubleSided: true,
      extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.6, clearcoatRoughnessFactor: 0.08 } },
      extras: { mahaze: { role: 'interior' } },
    });
    const mouth = I.buildMouth(body);
    for (const part of [mouth.cavity, mouth.teeth, I.buildGills(body)]) {
      const w = R.interiorWeights(part, body);
      const prim = gb.primitive({
        position: part.position, normal: part.normal, uv: part.uv, indices: compactIndices(part.indices, part.position.length / 3), material: mInterior,
        extraAttributes: { ...skinAttrs(w), COLOR_0: { array: part.color, type: 'VEC4' }, _GILL: { array: part.gill, type: 'SCALAR' } },
      });
      skinned.push(gb.addNode({ name: part.name, mesh: gb.addMesh(part.name, [prim]), skin }));
      log(`  ${part.name}: ${part.position.length / 3} verts, ${part.indices.length / 3} tris`);
    }
  }

  // ------------------------------------------------------------------------------------------------ fin atlas (+ iris)
  log('fin atlas');
  const defs = F.finDefinitions();
  const atlas = finAtlasForTier(F.paintFinAtlas(defs, log), E.paintIris(512), tier.atlas, { opaqueIris: far });
  const finColor = far ? maskFinAlpha(atlas.color, atlas.data, atlas.size * atlas.size) : atlas.color;
  const tFinCol = gb.addTexture(image(gb, 'fin_basecolor_alpha', atlas.size, atlas.size, 4, finColor, 'png'), sClamp, 'fin_basecolor_alpha');
  let tFinNrm, tFinData;
  if (tier.cap) {
    // the volumetric hero's fin material only (the standard fins keep no normal map at any level)
    tFinNrm = gb.addTexture(image(gb, 'fin_normal', atlas.size, atlas.size, 3, atlas.normal, 'jpeg', 95), sClamp, 'fin_normal');
    tFinData = gb.addTexture(image(gb, 'fin_data', atlas.size, atlas.size, 4, atlas.data, 'png'), sClamp, 'fin_ray_mel_irid_coverage');
  }
  // (the colour morphs tint the fins and scale their melanophores; the standard colour's in the file)
  const finMorph = M ? { tint: M.table.colors[0].fin.tint, melK: M.table.colors[0].fin.melK } : {};
  const eyeExtras = { radiusMM: A.EYE.radius, pupilAngle: E.PUPIL_ANGLE, irisAngle: E.IRIS_ANGLE, corneaBulge: E.CORNEA_BULGE, irisRect: atlas.irisRect, ...(S.eye || {}) };
  const eye = E.buildEyeMesh(tier.eyeNT, tier.eyeNP);
  const eyeUV = remapUV(eye.uv, atlas.irisRect);

  let finNodes = {};
  let contactFishY = A.botY(S.pelvicBaseS) - 0.2; // lowest point of the pelvic sucker rim (the fish rests on it)
  if (!far) {
    // ---------------------------------------------------------------------------------------------- eyes
    log('eyes');
    const mEye = gb.addMaterial({
      name: `${P}_Eye`,
      pbrMetallicRoughness: { baseColorTexture: { index: tFinCol }, metallicFactor: 0, roughnessFactor: 0.4 },
      extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.03 }, KHR_materials_ior: { ior: 1.376 } },
      extras: { mahaze: { role: 'eye', ...eyeExtras } },
    });
    const meshEye = gb.addMesh('Eye', [gb.primitive({ position: eye.position, normal: eye.normal, uv: eyeUV, indices: compactIndices(eye.indices, eye.position.length / 3), material: mEye })]);
    for (const [side, name, jn] of [[1, 'Eye_L', 'J_eyeL'], [-1, 'Eye_R', 'J_eyeR']]) {
      const tr = E.eyeTransform(side);
      const node = gb.addNode({ name, mesh: meshEye, rotation: tr.rotation, ...(tr.offset ? { translation: tr.offset } : {}) });
      gb.json.nodes[jointNodes[keptIndex[jn]]].children.push(node);
    }

    // ---------------------------------------------------------------------------------------------- fins
    log('fins');
    const mFin = gb.addMaterial({
      name: `${P}_Fin`,
      pbrMetallicRoughness: { baseColorTexture: { index: tFinCol }, metallicFactor: 0, roughnessFactor: 0.38 },
      alphaMode: 'BLEND',
      doubleSided: true,
      extensions: { KHR_materials_ior: { ior: 1.36 } },
      extras: { mahaze: { role: 'fin', ...finMorph, ...(tier.cap ? { dataTexture: tFinData, normalTexture: tFinNrm } : {}) } },
    });
    for (const def of defs) {
      const SUB = tier.finSub, NT = def.name === 'Fin_Caudal' ? tier.finNTCaudal : tier.finNT;
      const m = F.buildFinMesh(def, SUB, NT);
      if (def.type === 'pelvic') { contactFishY = Infinity; for (let i = 1; i < m.fish.length; i += 3) contactFishY = Math.min(contactFishY, m.fish[i]); }
      const w = R.finWeights(def.name, m.fish, m.rayT, m.baseS);
      const names = FIN_TARGETS[def.name];
      const targets = F.buildFinTargets(def, SUB, NT, names);
      const prim = gb.primitive({
        position: m.position, normal: m.normal, tangent: tier.cap ? m.tangent : null, uv: m.uv,
        indices: compactIndices(m.indices, m.position.length / 3), material: mFin, extraAttributes: skinAttrs(w), targets,
      });
      const mesh = gb.addMesh(def.name, [prim], { targetNames: names });
      gb.json.meshes[mesh].weights = names.map(() => 0);
      finNodes[def.name] = gb.addNode({ name: def.name, mesh, skin, extras: { mahaze: { fin: def.name } } });
      skinned.push(finNodes[def.name]);
    }
  } else {
    // ---------------------------------------------------------------------------------------------- fins + eyes
    // one alpha-tested mesh, posed at rest: at 10–50 pixels the fins' motion does not show, the draw calls do
    log('fins and eyes (merged, at rest)');
    const mFins = gb.addMaterial({
      name: `${P}_Fins`,
      pbrMetallicRoughness: { baseColorTexture: { index: tFinCol }, metallicFactor: 0, roughnessFactor: 0.38 },
      alphaMode: 'MASK',
      alphaCutoff: 0.5,
      doubleSided: true,
      extensions: { KHR_materials_ior: { ior: 1.36 } },
      extras: { mahaze: { role: 'fin', merged: true, ...finMorph } },
    });
    const parts = [];
    const pec = { Fin_Pectoral_L: 'J_pecL', Fin_Pectoral_R: 'J_pecR' };
    for (const def of defs) {
      const SUB = tier.finSub, NT = def.name === 'Fin_Caudal' ? tier.finNTCaudal : tier.finNT;
      const m = F.buildFinMesh(def, SUB, NT);
      if (def.type === 'pelvic') { contactFishY = Infinity; for (let i = 1; i < m.fish.length; i += 3) contactFishY = Math.min(contactFishY, m.fish[i]); }
      const w = R.finWeights(def.name, m.fish, m.rayT, m.baseS);
      const names = FIN_TARGETS[def.name];
      const targets = F.buildFinTargets(def, SUB, NT, names);
      const jn = pec[def.name];
      const position = restFin(m, targets, R.REST_POSE.morph[def.name] || [], w,
        jn ? { index: J[jn], pivot: JOINTS[J[jn]].obj, q: R.REST_POSE.q[jn] } : null);
      const sk = remapSkin(w, remap);
      parts.push({ position, normal: vertexNormals(position, m.indices), uv: m.uv, indices: m.indices, joints: sk.joints, weights: sk.weights });
    }
    const head = keptIndex.J_head;
    for (const [side, jn] of [[1, 'J_eyeL'], [-1, 'J_eyeR']]) {
      const tr = E.eyeTransform(side);
      const pl = placeEye(eye, JOINTS[J[jn]].obj, tr.rotation, tr.offset);
      const n = pl.position.length / 3;
      const joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) { joints[i * 4] = head; weights[i * 4] = 255; }
      parts.push({ ...pl, uv: eyeUV, indices: eye.indices, joints, weights });
    }
    const merged = mergeParts(parts);
    const prim = gb.primitive({
      position: merged.position, normal: merged.normal, uv: merged.uv, indices: merged.indices, material: mFins,
      extraAttributes: skinAttrs(merged),
    });
    skinned.push(gb.addNode({ name: 'Fins', mesh: gb.addMesh('Fins', [prim]), skin, extras: { mahaze: { fin: 'merged' } } }));
    log(`  Fins: ${merged.position.length / 3} verts, ${merged.indices.length / 3} tris`);
  }

  // ------------------------------------------------------------------------------------------------ animations
  log('animations');
  for (const clip of R.buildClips()) {
    const channels = [];
    for (const c of clip.channels) {
      const name = JOINTS[c.joint].name;
      if (!(name in keptIndex)) continue; // a dropped joint (far level)
      channels.push({ node: jointNodes[keptIndex[name]], path: c.path, times: c.times, values: c.values });
    }
    if (!far) for (const wch of clip.weights) channels.push({ node: finNodes[wch.mesh], path: 'weights', times: wch.times, values: wch.values });
    gb.addAnimation({ name: clip.name, channels });
    log(`  ${clip.name}: ${clip.duration.toFixed(3)}s, ${channels.length} channels`);
  }

  // ------------------------------------------------------------------------------------------------ scene
  const rootNode = gb.addNode({
    name: S.rootName,
    children: [jointNodes[keptIndex.J_root]],
    extras: {
      species: S.scientific,
      commonName: S.commonName,
      ...(S.variant ? { variant: S.variant } : {}),
      ...(S.extras ?? {}),
      totalLength_mm: A.TL,
      standardLength_mm: A.SL,
      units: 'metres (+Y dorsal, +Z anterior)',
      animations: S.animations,
      // rig axes (object space, sign folded in) for procedural animation with the game's pose model
      mahazeRig: { axes: R.AXES, contactY: A.toObject([S.pelvicBaseS, contactFishY, 0])[1], tailContactY: A.toObject(S.tailContact)[1] },
      ...(S.viewer ? { viewer: S.viewer } : {}),
    },
  });
  // skinned meshes sit at the scene root (their node transforms are ignored; joints drive them)
  gb.addScene(P, [rootNode, ...skinned]);
  gb.json.asset.copyright = 'Procedurally generated model (no photographic textures).';

  const glb = gb.toBuffer();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, glb);
  log(`wrote ${path.relative(root, outFile)} (${(glb.length / 1e6).toFixed(2)} MB), body ${body.stats.vertices} verts / ${body.stats.triangles} tris`);
}

const sRGB8ToLin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const linToSRGB8 = (c) => {
  c = Math.min(1, Math.max(0, c));
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
};
function lab(r, g, b) {
  // linear sRGB → CIE L*a*b* (D65)
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/**
 * How close the morph layout comes to the colours it replaces: every pattern in every colour morph rebuilt from the
 * stored maps (8-bit, as written) and compared with the colour baked directly (shadeAt): PSNR of the sRGB colour,
 * mean / 99th-percentile / max colour difference (ΔE76) and the pigment's mean difference. Logged only.
 */
function validateMorphs(TS, table, rebuild, log) {
  const T0 = TS[0], n = T0.width * T0.height;
  const rows = [];
  TS.forEach((T, p) => {
    T.colors.forEach((CC) => {
      const c = CC.color - 1;
      let se = 0, dEsum = 0, pig = [0, 0, 0];
      const dEs = new Float32Array(n);
      for (let t = 0; t < n; t++) {
        const g = [sRGB8ToLin(T0.ground[t * 3]), sRGB8ToLin(T0.ground[t * 3 + 1]), sRGB8ToLin(T0.ground[t * 3 + 2])];
        const R = rebuild(g, T.raw.mel[t] / 255, T0.raw.iri[t] / 255, T0.raw.xan[t] / 255, T0.hn[t], table, c);
        const ref = [CC.albedo[t * 3], CC.albedo[t * 3 + 1], CC.albedo[t * 3 + 2]];
        const got = R.albedo.map(linToSRGB8);
        for (let k = 0; k < 3; k++) se += (got[k] - ref[k]) ** 2;
        const a = lab(...got.map(sRGB8ToLin)), b = lab(...ref.map(sRGB8ToLin));
        const dE = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        dEs[t] = dE; dEsum += dE;
        for (let k = 0; k < 3; k++) pig[k] += Math.abs(Math.round(R.pigment[k] * 255) - CC.pigment[t * 3 + k]) / 255;
      }
      const sorted = dEs.slice().sort();
      const psnr = 10 * Math.log10((255 * 255) / (se / (n * 3)));
      rows.push({ p: p + 1, c: table.colors[c].name, psnr, dE: dEsum / n, p99: sorted[Math.floor(n * 0.99)], max: sorted[n - 1], pig: pig.map((v) => v / n) });
    });
  });
  for (const r of rows) {
    log(`  morph check pattern ${r.p} ${r.c.padEnd(8)} PSNR ${r.psnr.toFixed(1)} dB, ΔE mean ${r.dE.toFixed(2)} p99 ${r.p99.toFixed(2)} max ${r.max.toFixed(1)}, pigment |Δ| mel ${r.pig[0].toFixed(4)} iri ${r.pig[1].toFixed(4)} xan ${r.pig[2].toFixed(4)}`);
  }
  return rows;
}
