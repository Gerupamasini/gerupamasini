import * as THREE from 'three';
import { EdohazeShared, causticsGLSL, translucencyGLSL } from './EdohazeShaders.js';
import { getSkinMaps, makeIrisTexture } from './EdohazeTextures.js';

// ---------------------------------------------------------------------------
// Body: MeshPhysicalMaterial (PBR, wet clearcoat mucus layer, faint guanine
// iridescence) + injected thin-tissue translucency, caustics and per-individual
// chromatophore state (background adaptation / stress paling).
// ---------------------------------------------------------------------------
export function createBodyMaterial(maps, lod, perFish) {
  const m = new THREE.MeshPhysicalMaterial({
    map: maps.map,
    normalMap: lod < 2 ? maps.normalMap : null,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: maps.ormMap, roughness: 1.0,
    metalness: 0.0,
    clearcoat: lod < 2 ? 0.55 : 0.0, clearcoatRoughness: 0.14,   // mucus film
    specularIntensity: 0.55, ior: 1.36,
    iridescence: lod === 0 ? 0.18 : 0.0, iridescenceIOR: 1.55, iridescenceThicknessRange: [220, 480],
    iridescenceMap: lod === 0 ? maps.ormMap : null, // three samples .r (translucency ≈ belly/thin tissue) as the guanine mask
    sheen: 0.0,
  });
  m.userData.perFish = perFish;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, EdohazeShared.uniforms, perFish);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aThin;\nattribute float aInner;\nvarying float vThin;\nvarying float vInner;\nvarying vec3 vEdoWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvThin = aThin;\nvInner = aInner;\nvEdoWorld = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vThin; varying float vInner; varying vec3 vEdoWorld;
uniform float uTime; uniform vec3 uSunDirView; uniform vec3 uSunColor; uniform float uCaustic; uniform float uCausticScale; uniform float uWaterY;
uniform vec3 uTint; uniform float uPale; uniform float uDarken;
${causticsGLSL}
${translucencyGLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  // chromatophore state: stress paling (aggregated melanophores) vs dark background adaptation
  { vec3 c = diffuseColor.rgb; float lum = dot(c, vec3(0.3,0.59,0.11));
    float darkPix = 1.0 - smoothstep(0.05, 0.35, lum);
    c = mix(c, c * 1.5 + 0.06, uPale * darkPix);
    c *= mix(1.0, 0.82, uDarken);
    diffuseColor.rgb = c * uTint;
    // buccal lining (inside the lips): dark, fleshy
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.075, 0.065), smoothstep(0.2, 0.9, vInner)); }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { vec3 V = normalize(vViewPosition);
    float thin = clamp(vThin * 0.8 + texture2D(roughnessMap, vRoughnessMapUv).r * 0.6, 0.0, 1.0);
    reflectedLight.directDiffuse += edoTranslucency(normal, V, uSunDirView, diffuseColor.rgb, vec3(1.0,0.86,0.66), thin) * uSunColor * 0.55;
    float sunFacing = clamp(dot(normal, uSunDirView), 0.0, 1.0);
    float c = edoCaustics(vEdoWorld, uTime, uCausticScale, uWaterY);
    reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * c * uCaustic * sunFacing * 0.35; }`);
  };
  m.customProgramCacheKey = () => 'edohaze-body-' + lod;
  return m;
}

// ---------------------------------------------------------------------------
// Fins: vertex shader rebuilds every vertex from (base, ray angle, ray length,
// u, v) so each fin folds / spreads / cups / undulates independently; the ray
// pattern (rays, segmentation, distal branching, melanophore dot rows) and the
// scalloped membrane margin are drawn per fragment.
// ---------------------------------------------------------------------------
const finVertexHead = /* glsl */`
attribute vec3 aBase; attribute vec3 aFin; attribute float aAng;
uniform vec3 uRef; uniform vec3 uPerp; uniform vec3 uN;
uniform float uErect; uniform float uSpread; uniform float uFold; uniform float uAMid; uniform float uARange;
uniform float uBend; uniform float uWaveAmp; uniform float uWavePhase; uniform float uWaveK; uniform float uCup; uniform float uTwist;
varying vec3 vFin; varying vec3 vEdoWorld;
vec3 edoFinPos(float u, float v, vec3 base, float L, float ang, out vec3 dir){
  float aOpen = uAMid + (ang - uAMid) * uSpread;
  float aFold = uFold + (ang - uAMid) * 0.10;
  float a = mix(aFold, aOpen, uErect);
  dir = cos(a) * uRef + sin(a) * uPerp;
  float off = (uBend + uWaveAmp * sin(uWavePhase - u * uWaveK - v * 1.2)) * v * v
            + uCup * ((u - 0.5) * (u - 0.5) * 4.0 - 0.35) * v * v
            + uTwist * (u - 0.5) * v;
  return base + dir * (L * v) + uN * (L * off);
}
`;

function makeFinMaterialBase(def, info, lod, perFish) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.80, 0.77, 0.66), transparent: true, side: THREE.DoubleSide,
    roughness: 0.32, metalness: 0, clearcoat: lod === 0 ? 0.35 : 0, clearcoatRoughness: 0.2,
    specularIntensity: 0.5, depthWrite: false,
  });
  const uniforms = {
    uRef: { value: info.ref.clone() }, uPerp: { value: info.perp.clone() }, uN: { value: info.n.clone() },
    uErect: { value: 1 }, uSpread: { value: 1 }, uFold: { value: info.fold }, uAMid: { value: info.aMid }, uARange: { value: info.aRange },
    uBend: { value: 0 }, uWaveAmp: { value: 0 }, uWavePhase: { value: 0 }, uWaveK: { value: 3.0 }, uCup: { value: 0 }, uTwist: { value: 0 },
    uRays: { value: def.rays }, uSpines: { value: def.spines }, uScallop: { value: def.scallop },
    uDots: { value: def.dots }, uDotLimit: { value: def.dotLimit }, uDisc: { value: def.disc || 0 }, uFinOpacity: { value: 1 },
  };
  m.userData.fin = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, EdohazeShared.uniforms, uniforms, perFish);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + finVertexHead)
      .replace('#include <beginnormal_vertex>', `
  vec3 edoDir;
  vec3 edoP = edoFinPos(aFin.x, aFin.y, aBase, aFin.z, aAng, edoDir);
  // analytic normal: plane normal tilted by the out-of-plane slope along the ray
  float edoPh = uWavePhase - aFin.x * uWaveK - aFin.y * 1.2;
  float slopeV = 2.0 * (uBend + uWaveAmp * sin(edoPh)) * aFin.y - 1.2 * uWaveAmp * cos(edoPh) * aFin.y * aFin.y
               + 2.0 * uCup * ((aFin.x - 0.5) * (aFin.x - 0.5) * 4.0 - 0.35) * aFin.y + uTwist * (aFin.x - 0.5);
  vec3 objectNormal = normalize(uN - edoDir * slopeV);
  #ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
  #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = edoP; vFin = aFin;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvEdoWorld = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFin; varying vec3 vEdoWorld;
uniform float uTime; uniform vec3 uSunDirView; uniform vec3 uSunColor; uniform float uCaustic; uniform float uCausticScale; uniform float uWaterY;
uniform float uRays; uniform float uSpines; uniform float uScallop; uniform float uDots; uniform float uDotLimit; uniform float uDisc; uniform float uFinOpacity;
uniform vec3 uTint; uniform float uPale; uniform float uDarken;
${causticsGLSL}
${translucencyGLSL}
float edoHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float u = vFin.x, v = vFin.y;
  float rc = u * (uRays - 1.0);
  float ri = floor(rc + 0.5);
  float rd = abs(rc - ri);                         // 0 on ray centre
  bool isSpine = ri < uSpines;
  // distal branching of soft rays (dichotomous split beyond ~60% length)
  float branch = (!isSpine && v > 0.6 && ri > 0.0 && ri < uRays - 1.0) ? 1.0 : 0.0;
  float rdB = mix(rd, abs(rd - 0.12 * smoothstep(0.6, 1.0, v)), branch);
  float rayW = mix(0.16, 0.07, v) * (isSpine ? 1.35 : 1.0);
  float ray = 1.0 - smoothstep(rayW * 0.6, rayW, rdB);
  // segmentation joints on soft rays
  float seg = (!isSpine) ? smoothstep(0.9, 1.0, abs(sin(v * (30.0 + 9.0 * edoHash(vec2(ri, 1.0))) + ri * 1.7))) * ray * step(0.2, v) * 0.6 : 0.0;
  // scalloped margin: membrane recedes between ray tips
  float edge = 1.0 - uScallop * (1.0 - ray) * smoothstep(0.55, 1.0, v) * (0.6 + 0.4 * sin(3.14159 * fract(rc + 0.5)));
  float marginFade = 1.0 - smoothstep(edge - 0.06, edge, v);
  if (marginFade < 0.01) discard;
  // melanophore dot rows along rays (dorsal/caudal); caudal rows stop above lower part
  float rowOk = step(u, uDotLimit);
  float dots = 0.0;
  if (uDots > 0.0) {
    float cell = floor(v * 6.5 + edoHash(vec2(ri, 3.0)));
    float dv = fract(v * 6.5 + edoHash(vec2(ri, 3.0)));
    float keep = step(0.3, edoHash(vec2(ri, cell)));            // irregular: some spots missing
    float rad = mix(0.14, 0.24, edoHash(vec2(cell, ri + 5.0)));
    dots = (1.0 - smoothstep(rad * 0.5, rad, length(vec2(rd * 2.2, dv - 0.5)))) * rowOk * uDots * step(0.12, v) * keep;
  }
  vec3 membrane = vec3(0.70, 0.68, 0.60);
  vec3 rayCol = vec3(0.66, 0.60, 0.46);
  vec3 c = mix(membrane, rayCol, ray);
  c = mix(c, vec3(0.20, 0.15, 0.11), clamp(dots * 0.85 + seg * 0.25, 0.0, 1.0));
  // pelvic disc: whitish, more opaque, fleshy
  c = mix(c, vec3(0.86, 0.83, 0.76), uDisc * 0.5);
  diffuseColor.rgb = c * uTint;
  float alpha = mix(0.26, 0.5, ray) + dots * 0.5 + uDisc * 0.25 + smoothstep(0.0, 0.15, 0.15 - v) * 0.35;
  diffuseColor.a = clamp(alpha, 0.0, 0.95) * marginFade * uFinOpacity;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { vec3 V = normalize(vViewPosition);
    reflectedLight.directDiffuse += edoTranslucency(normal, V, uSunDirView, diffuseColor.rgb, vec3(1.0,0.9,0.7), 0.55) * uSunColor;
    float cc = edoCaustics(vEdoWorld, uTime, uCausticScale, uWaterY);
    reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * cc * uCaustic * 0.25; }`);
  };
  m.customProgramCacheKey = () => 'edohaze-fin-' + lod;
  return m;
}

// ---------------------------------------------------------------------------
// Eyes
// ---------------------------------------------------------------------------
function createEyeMaterials(seed) {
  const iris = new THREE.MeshPhysicalMaterial({
    map: makeIrisTexture(seed), roughness: 0.38, metalness: 0.25,
    iridescence: 0.35, iridescenceIOR: 1.8, clearcoat: 0, side: THREE.FrontSide,
  });
  return {
    sclera: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.03, 0.03, 0.032), roughness: 0.5, metalness: 0.1, iridescence: 0.25, iridescenceIOR: 1.7 }),
    iris,
    pupil: new THREE.MeshBasicMaterial({ color: 0x010101 }),
    lens: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.015, 0.015, 0.02), roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1 }),
    cornea: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.02, envMapIntensity: 0.6, roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.01, specularIntensity: 1, ior: 1.37, depthWrite: false }),
    farEye: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.14, 0.11, 0.06), roughness: 0.25, metalness: 0.3 }),
  };
}

export function createMouthMaterials() {
  return {
    mouth: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.22, 0.12, 0.11), roughness: 0.55, side: THREE.BackSide }),
    gill: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.35, 0.07, 0.07), roughness: 0.6, side: THREE.DoubleSide }),
    lining: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.11, 0.06, 0.055), roughness: 0.5, side: THREE.DoubleSide }),
  };
}

export class EdohazeMaterialSet {
  constructor({ variantSeed, sex, slMm, seed }) {
    this.perFish = {
      uTint: { value: new THREE.Color(1, 1, 1) },
      uPale: { value: 0 },
      uDarken: { value: 0 },
    };
    const maps = getSkinMaps(variantSeed, sex, slMm);
    this.maps = maps;
    this.body = [0, 1, 2].map((l) => createBodyMaterial(maps, l, this.perFish));
    this.eye = createEyeMaterials(seed);
    Object.assign(this, createMouthMaterials());
    this.fins = [[], [], []];
  }
  makeFin(key, def, info, lod) {
    const m = makeFinMaterialBase(def, info, lod, this.perFish);
    m.name = key; this.fins[lod].push(m);
    return m;
  }
  dispose() {
    for (const m of [...this.body, ...this.fins.flat(), ...Object.values(this.eye)]) m.dispose();
  }
}
