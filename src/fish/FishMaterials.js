// Fish materials: three.js MeshPhysicalMaterial (PBR lights, shadows, PMREM
// environment, iridescence, clearcoat) patched with the rig deformation and
// the procedural goldfish shading. Matching depth materials keep shadows in
// sync with the deformed geometry.

import * as THREE from 'three';
import { U } from '../render/SharedUniforms.js';
import { head } from './morphology.js';
import { HEAD_RELIEF } from './BodyGeometry.js';
import { rigVertexCommon, noiseCommon, underwaterCommon } from './shaders/common.glsl.js';
import {
  bodyVertexPars,
  bodyFragmentPars,
  bodyFragmentColor,
  bodyFragmentNormal,
  bodyFragmentMaterial,
  bodyFragmentLightsEnd,
  bodyFragmentOutput,
  bodyFragmentShadowPars,
} from './shaders/body.glsl.js';
import {
  finVertexPars,
  finFragmentPars,
  finFragmentColor,
  finFragmentMaterial,
  finFragmentNormal,
  finFragmentLightsEnd,
  finFragmentOutput,
  finDebugHelpers,
} from './shaders/fin.glsl.js';
import { eyeVertexPars, eyeVertexMain, eyeFragmentPars, eyeFragmentNormal, eyeFragmentMaterial } from './shaders/eye.glsl.js';

function mustReplace(src, find, repl, label) {
  if (!src.includes(find)) throw new Error(`[FishMaterials] shader chunk not found (${label}): ${find}`);
  return src.replace(find, repl);
}

function attachUniforms(shader, names) {
  for (const n of names) shader.uniforms[n] = U[n];
}

const UW_UNIFORMS = ['uCaustics', 'uCausticParams', 'uCausticLightDir', 'uWaterMin', 'uWaterMax', 'uWaterAbsorb', 'uWaterScatter', 'uWaterDensity'];

// ---------------------------------------------------------------------------
export function createBodyMaterial(layout, { lod = 0 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.0,
    // no clearcoat: the mucus film is index-matched to the surrounding water
    // (reflectance ~1e-4), so there is no separate lacquer highlight
    iridescence: 1.0,
    iridescenceIOR: 1.8, // guanine platelets n ≈ 1.83
    iridescenceThicknessRange: [250, 520],
    specularIntensity: 1.0,
    envMapIntensity: 1.0,
  });
  // head landmarks for the shading of the nares and lips (same as the geometry)
  m.defines = {
    RIG_MISC: layout.misc,
    FISH_LOD: lod,
    NARE_S: head.nareS.toFixed(4),
    NARE_Y: head.nareY.toFixed(4),
    NARE_FLAP_S: HEAD_RELIEF.nareFlapPos[0].toFixed(4),
    NARE_FLAP_Y: HEAD_RELIEF.nareFlapPos[1].toFixed(4),
    MOUTH_Y: head.mouthY.toFixed(4),
    MOUTH_DROOP: head.mouthClosedDroop.toFixed(4),
    MOUTH_RW: head.mouthClosedRW.toFixed(4),
  };
  m.onBeforeCompile = (shader) => {
    attachUniforms(shader, [
      'uRig', 'uDebugView', 'uColRed', 'uColOrange', 'uColYellow', 'uColWhite', 'uColGill',
      'uScaleIntensity', 'uRoughness', 'uGuanine', 'uIridescence', 'uSSS', 'uTranslucency',
      'uKeyShadowMatrix', 'uKeyShadowOn', ...UW_UNIFORMS,
    ]);
    let vs = shader.vertexShader;
    vs = mustReplace(vs, '#include <common>', '#include <common>\n' + rigVertexCommon + bodyVertexPars, 'common');
    vs = mustReplace(vs, '#include <beginnormal_vertex>', 'fishDeform();\nvec3 objectNormal = gFishNormal;', 'beginnormal');
    vs = mustReplace(vs, '#include <begin_vertex>', 'vec3 transformed = gFishPos;', 'begin_vertex');
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = mustReplace(fs, '#include <common>', '#include <common>\n' + noiseCommon + underwaterCommon + bodyFragmentPars, 'common');
    fs = mustReplace(fs, '#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + bodyFragmentShadowPars, 'shadow_pars');
    fs = mustReplace(fs, '#include <color_fragment>', '#include <color_fragment>\n' + bodyFragmentColor, 'color');
    fs = mustReplace(fs, '#include <roughnessmap_fragment>', 'float roughnessFactor = gFS.rough;', 'roughness');
    fs = mustReplace(fs, '#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;', 'metalness');
    fs = mustReplace(fs, '#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + bodyFragmentNormal, 'normal');
    fs = mustReplace(fs, '#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + bodyFragmentMaterial, 'lights_physical');
    fs = mustReplace(fs, '#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + bodyFragmentLightsEnd, 'lights_end');
    fs = mustReplace(fs, '#include <opaque_fragment>', bodyFragmentOutput + '\n#include <opaque_fragment>', 'opaque');
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'fish-body-' + lod;
  return m;
}

export function createBodyDepthMaterial(layout) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.defines = { RIG_MISC: layout.misc };
  m.onBeforeCompile = (shader) => {
    attachUniforms(shader, ['uRig']);
    let vs = shader.vertexShader;
    vs = mustReplace(vs, '#include <common>', '#include <common>\n#define DEPTH_ONLY\n' + rigVertexCommon + bodyVertexPars, 'depth-common');
    vs = mustReplace(vs, '#include <begin_vertex>', 'fishDeform();\nvec3 transformed = gFishPos;', 'depth-begin');
    shader.vertexShader = vs;
  };
  m.customProgramCacheKey = () => 'fish-body-depth';
  return m;
}

// ---------------------------------------------------------------------------
export function createFinMaterial(layout, { lod = 0 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.32,
    metalness: 0.0,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    side: THREE.FrontSide,
    specularIntensity: 1.0,
  });
  m.defines = { RIG_MISC: layout.misc, FISH_LOD: lod };
  m.onBeforeCompile = (shader) => {
    attachUniforms(shader, [
      'uRig', 'uDebugView', 'uColRed', 'uColOrange', 'uColYellow', 'uColWhite',
      'uFinOpacity', 'uFinTransmission', 'uFinRoughness', ...UW_UNIFORMS,
    ]);
    let vs = shader.vertexShader;
    vs = mustReplace(vs, '#include <common>', '#include <common>\n' + rigVertexCommon + noiseCommon + finVertexPars, 'common');
    vs = mustReplace(vs, '#include <beginnormal_vertex>', 'finDeform();\nvec3 objectNormal = gFishNormal;', 'beginnormal');
    vs = mustReplace(vs, '#include <begin_vertex>', 'vec3 transformed = gFishPos;', 'begin_vertex');
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = mustReplace(fs, '#include <common>', '#include <common>\n' + noiseCommon + underwaterCommon + finFragmentPars + finDebugHelpers, 'common');
    fs = mustReplace(fs, '#include <color_fragment>', '#include <color_fragment>\n' + finFragmentColor, 'color');
    fs = mustReplace(fs, '#include <roughnessmap_fragment>', 'float roughnessFactor = gFinRough;', 'roughness');
    fs = mustReplace(fs, '#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + finFragmentNormal, 'normal');
    fs = mustReplace(fs, '#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + finFragmentMaterial, 'lights_physical');
    fs = mustReplace(fs, '#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + finFragmentLightsEnd, 'lights_end');
    fs = mustReplace(fs, '#include <opaque_fragment>', finFragmentOutput + '\n#include <opaque_fragment>', 'opaque');
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'fish-fin-' + lod;
  return m;
}

export function createFinDepthMaterial(layout) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaHash: true });
  m.defines = { RIG_MISC: layout.misc };
  m.onBeforeCompile = (shader) => {
    attachUniforms(shader, ['uRig']);
    let vs = shader.vertexShader;
    vs = mustReplace(vs, '#include <common>', '#include <common>\n#define DEPTH_ONLY\n' + rigVertexCommon + finVertexPars, 'common');
    vs = mustReplace(vs, '#include <begin_vertex>', 'finDeform();\nvec3 transformed = gFishPos;', 'begin');
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    fs = mustReplace(fs, '#include <common>', '#include <common>\nin vec4 vFinCoord;', 'fcommon');
    fs = mustReplace(fs, '#include <alphahash_fragment>', 'diffuseColor.a = mix(0.95, 0.35, smoothstep(0.0, 0.25, vFinCoord.y));\n#include <alphahash_fragment>', 'alphahash');
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'fish-fin-depth';
  return m;
}

/**
 * Depth-only pass for the translucent fins, drawn after them: no colour, but
 * fin depth lands in the scene depth buffer so the lens (depth of field)
 * focuses on the fins instead of the background seen through them.
 */
export function createFinDepthWriteMaterial(layout) {
  const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true, side: THREE.DoubleSide });
  m.defines = { RIG_MISC: layout.misc };
  m.onBeforeCompile = (shader) => {
    attachUniforms(shader, ['uRig']);
    let vs = shader.vertexShader;
    vs = mustReplace(vs, '#include <common>', '#include <common>\n#define DEPTH_ONLY\n' + rigVertexCommon + finVertexPars, 'common');
    vs = mustReplace(vs, '#include <begin_vertex>', 'finDeform();\nvec3 transformed = gFishPos;', 'begin');
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    fs = mustReplace(fs, '#include <common>', '#include <common>\nin vec4 vFinCoord;', 'zw-common');
    fs = mustReplace(
      fs,
      'void main() {',
      `void main() {
  {
    // dense fin base writes depth; the thin distal membrane keeps the depth
    // of what lies behind it (4x4 ordered dither over the transition)
    float dense = 1.0 - smoothstep(0.22, 0.5, vFinCoord.y);
    ivec2 q = ivec2(gl_FragCoord.xy) & 3;
    const float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    if (dense * 16.0 <= B[q.x + q.y * 4] + 0.5) discard;
  }`,
      'zw-main',
    );
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'fish-fin-depthwrite';
  return m;
}

// ---------------------------------------------------------------------------
export function createEyeMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.0,
    // cornea: immersed (index ~1.37 against 1.33 water), so it reflects only
    // faintly; optically smooth, so the little it reflects stays crisp
    clearcoat: 0.12,
    clearcoatRoughness: 0.04,
    specularIntensity: 1.0,
  });
  m.onBeforeCompile = (shader) => {
    attachUniforms(shader, ['uIrisGold', 'uIrisRed', 'uIrisSilver', 'uPupil', 'uIrisMetal', ...UW_UNIFORMS]);
    let vs = shader.vertexShader;
    vs = mustReplace(vs, '#include <common>', '#include <common>\n' + eyeVertexPars, 'common');
    vs = mustReplace(vs, '#include <begin_vertex>', '#include <begin_vertex>\n' + eyeVertexMain, 'begin');
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    fs = mustReplace(fs, '#include <common>', '#include <common>\n' + noiseCommon + underwaterCommon + eyeFragmentPars, 'common');
    fs = mustReplace(fs, '#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = eyeColor();', 'color');
    fs = mustReplace(fs, '#include <roughnessmap_fragment>', 'float roughnessFactor = gEyeRough;', 'rough');
    fs = mustReplace(fs, '#include <metalnessmap_fragment>', 'float metalnessFactor = gEyeMetal;', 'metal');
    fs = mustReplace(fs, '#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + eyeFragmentNormal, 'normal');
    fs = mustReplace(fs, '#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + eyeFragmentMaterial, 'lights_physical');
    fs = mustReplace(fs, '#include <opaque_fragment>', 'outgoingLight = waterAttenuate(outgoingLight, vEyeWorld);\n#include <opaque_fragment>', 'opaque');
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'fish-eye';
  return m;
}
