import * as THREE from 'three';

// Global look controls shared by every shrimp material (UI slider / calibration).
export const LOOK = {
  pigment: { value: 1.0 }, // individual pigmentation 0 (pale, photo 011) .. 1.5 (dense, photo 007)
  milk: { value: 1.0 }, // tissue turbidity multiplier
};

const NOISE_GLSL = /* glsl */ `
float shHash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float shNoise(vec3 x){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(shHash(i+vec3(0,0,0)),shHash(i+vec3(1,0,0)),f.x),
                 mix(shHash(i+vec3(0,1,0)),shHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(shHash(i+vec3(0,0,1)),shHash(i+vec3(1,0,1)),f.x),
                 mix(shHash(i+vec3(0,1,1)),shHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
// Chromatophores: sparse round-to-stellate dots on a jittered lattice. keep = probability a
// cell holds a chromatophore, radius in cell units. Returns coverage 0..1.
float shChromato(vec3 p, float cellsPerMetre, float keep, float radius){
  vec3 c = p*cellsPerMetre; vec3 i=floor(c); vec3 f=fract(c);
  float cov = 0.0;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec3 g=vec3(x,y,z);
    vec3 h=i+g;
    if(shHash(h+5.3) > keep) continue;
    vec3 o=vec3(shHash(h),shHash(h+13.1),shHash(h+27.7));
    vec3 r=g+o-f;
    float d=length(r);
    float rr = radius*(0.6+0.8*shHash(h+41.3)*shHash(h+17.9)); // mostly punctate, a few expanded
    float star = 1.0 + 0.12*sin(atan(r.y,r.x)*5.0 + shHash(h+3.7)*6.28); // round to faintly stellate
    cov = max(cov, smoothstep(rr*star, rr*star*0.55, d));
  }
  return cov;
}
`;

// Species stripe patterns (イソスジエビ), drawn per pixel from parametric coordinates the model writes into
// aPat/aPatW, so the lines stay sharp at macro distance whatever the mesh density. Compiled in only when a
// material sets o.pattern (PAT_MODE 1 body stripes, 2 leg rings, 3 uropod ocellus); the シラタエビ shaders
// are unchanged.
const PATTERN_GLSL = /* glsl */ `
#if PAT_MODE == 1
{
  // vPat.x: across-stripe phase (lines at integers), vPat.y: along-stripe coordinate (dot rows),
  // vPat.z: second line family, vPat.w: dot colour (0 pale, 1 yellow). vPatW: weights (A, B, dots).
  float wob = (shNoise(vObjPos*1700.0)-0.5)*0.14 + (shNoise(vObjPos*520.0)-0.5)*0.22;
  float pa = vPat.x + wob;
  float fa = fwidth(vPat.x) + 1e-4;
  float da = abs(fract(pa + 0.5) - 0.5);
  float ia = floor(pa + 0.5);
  float wA = uLineW * (0.7 + 0.6*shNoise(vObjPos*800.0 + ia*3.1)) * (mod(ia, 2.0) > 0.5 ? uLineBold : 1.0);
  float lineA = (1.0 - smoothstep(wA - fa, wA + fa, da)) * vPatW.x;
  float pb = vPat.z + wob*0.7;
  float fb = fwidth(vPat.z) + 1e-4;
  float db = abs(fract(pb + 0.5) - 0.5);
  float wB = uLineW * 0.75 * (0.7 + 0.6*shNoise(vObjPos*700.0 + 9.0));
  float lineB = (1.0 - smoothstep(wB - fb, wB + fb, db)) * vPatW.y;
  float line = clamp(max(lineA, lineB) * min(uPigment, 1.2), 0.0, 1.0);
  vec2 cell = vec2(floor(vPat.x), floor(vPat.y));
  vec2 dc = vec2(fract(vPat.x) - 0.5, fract(vPat.y) - 0.5) + (vec2(shHash(vec3(cell, 3.0)), shHash(vec3(cell, 5.0))) - 0.5)*0.35;
  float keepDot = step(0.42, shHash(vec3(cell, 7.0)));
  float fd = fwidth(vPat.x) + fwidth(vPat.y) + 1e-4;
  float rD = 0.085 * (0.7 + 0.6*shHash(vec3(cell, 11.0)));
  float dotv = (1.0 - smoothstep(rD - fd, rD + fd, length(dc))) * keepDot * vPatW.z * (1.0 - line);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(uDotColor, uDotColor2, vPat.w), dotv*0.9);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(uLineEdge, uLineColor, smoothstep(0.35, 0.95, line)), line);
  a = max(a, line*0.96);
  a = max(a, dotv*0.75);
  shPig = max(shPig, line);
}
#elif PAT_MODE == 2
{
  // Leg rings: vPat.x position along the podomere (0..1); y orange, z black, w proximal orange centres (<0 = none).
  float t = vPat.x;
  float ft = fwidth(t) + 1e-4;
  float w = uBandW * (0.85 + 0.3*shNoise(vObjPos*3000.0));
  float orA = vPat.y >= 0.0 ? 1.0 - smoothstep(w - ft, w + ft, abs(t - vPat.y)) : 0.0;
  float blk = vPat.z >= 0.0 ? 1.0 - smoothstep(w*0.9 - ft, w*0.9 + ft, abs(t - vPat.z)) : 0.0;
  float orB = vPat.w >= 0.0 ? 1.0 - smoothstep(w*0.7 - ft, w*0.7 + ft, abs(t - vPat.w)) : 0.0;
  float orng = max(orA, orB*0.85) * vPatW.x;
  blk *= vPatW.x;
  diffuseColor.rgb = mix(diffuseColor.rgb, uBandColor, orng);
  diffuseColor.rgb = mix(diffuseColor.rgb, uBandDark, blk);
  a = max(a, max(orng*0.85, blk*0.95));
  shPig = max(shPig, blk);
}
#elif PAT_MODE == 3
{
  // Uropod ocellus: vPat.xy point on the ramus, vPat.zw spot centre, vPatW.y radius (TL units), vPatW.x weight.
  float d = length(vPat.xy - vPat.zw);
  float r = max(vPatW.y, 1e-4);
  float fd = fwidth(d) + 1e-5;
  float core = 1.0 - smoothstep(r*0.58 - fd, r*0.58 + fd, d);
  float ring = (1.0 - smoothstep(r - fd, r + fd, d)) - core;
  core *= vPatW.x; ring *= vPatW.x;
  diffuseColor.rgb = mix(diffuseColor.rgb, uBandColor, core);
  diffuseColor.rgb = mix(diffuseColor.rgb, uBandDark, ring);
  a = max(a, max(core*0.9, ring*0.95));
  shPig = max(shPig, ring);
}
#endif
`;

/**
 * Cuticle + underlying tissue as one translucent layer.
 * Geometry attributes (from loft.js): aJoint (arthrodial membrane), aPig (chromatophore
 * density map), aThick (tissue thickness proxy -> turbidity / attenuation).
 */
export function createCuticleMaterial(o = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(o.color ?? 0xb9beb6),
    roughness: o.roughness ?? 0.3,
    metalness: 0,
    transmission: o.transmission ?? 0.8,
    thickness: o.thickness ?? 0.003,
    ior: 1.43,
    attenuationColor: new THREE.Color(o.attenuationColor ?? 0xd9c58e),
    attenuationDistance: o.attenuationDistance ?? 0.006,
    clearcoat: o.clearcoat ?? 0.85,
    clearcoatRoughness: 0.08,
    sheen: o.sheen ?? 0.25,
    sheenColor: new THREE.Color(0xd6dcd8),
    sheenRoughness: 0.6,
    specularIntensity: 0.8,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.glass) {
    // Thin cuticle is nearly clear face-on and densest at grazing angles; the milkiness comes
    // from tissue underneath (separate translucent muscle meshes), so the shell stays glassy.
    mat.transmission = 0;
    mat.transparent = true;
    mat.depthWrite = false;
  }
  const u = {
    uAlpha: { value: o.alpha ?? 0.12 },
    uRimAlpha: { value: o.rimAlpha ?? 0.75 },
    uPigment: LOOK.pigment,
    uMilk: LOOK.milk,
    uMilkBase: { value: o.milk ?? 0.35 }, // fraction of transmission lost to scattering at aThick = 1
    uCells: { value: o.cells ?? 2400 }, // chromatophore lattice cells per metre (~0.42 mm)
    uKeep: { value: o.keep ?? 0.85 },
    uDotR: { value: o.dotR ?? 0.22 },
    uChromaColor: { value: new THREE.Color(o.chroma ?? 0x6a4a2a) },
    uChromaCore: { value: new THREE.Color(o.chromaCore ?? 0x3a2410) },
    uJointColor: { value: new THREE.Color(o.jointColor ?? 0xa89a80) },
    uRelief: { value: o.relief ?? 0.12 },
  };
  const pat = o.pattern;
  if (pat) {
    mat.defines = { ...(mat.defines ?? {}), PAT_MODE: pat.mode };
    Object.assign(u, {
      uLineColor: { value: new THREE.Color(pat.lineColor ?? 0x1e130b) },
      uLineEdge: { value: new THREE.Color(pat.lineEdge ?? 0x6e3a18) },
      uDotColor: { value: new THREE.Color(pat.dotColor ?? 0xf3eedb) },
      uDotColor2: { value: new THREE.Color(pat.dotColor2 ?? 0xf2c234) },
      uLineW: { value: pat.lineW ?? 0.08 },
      uLineBold: { value: pat.lineBold ?? 1.5 },
      uBandColor: { value: new THREE.Color(pat.bandColor ?? 0xf2a41c) },
      uBandDark: { value: new THREE.Color(pat.bandDark ?? 0x16100c) },
      uBandW: { value: pat.bandW ?? 0.055 },
    });
  }
  const patDecl = pat
    ? `attribute vec4 aPat; attribute vec4 aPatW; varying vec4 vPat; varying vec4 vPatW;`
    : '';
  const patFrag = pat
    ? `varying vec4 vPat; varying vec4 vPatW;
        uniform vec3 uLineColor; uniform vec3 uLineEdge; uniform vec3 uDotColor; uniform vec3 uDotColor2;
        uniform float uLineW; uniform float uLineBold; uniform vec3 uBandColor; uniform vec3 uBandDark; uniform float uBandW;`
    : '';
  mat.userData.uniforms = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aJoint; attribute float aPig; attribute float aThick;
        varying float vJoint; varying float vPigD; varying float vThick; varying vec3 vObjPos;
        ${patDecl}`
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvJoint = aJoint; vPigD = aPig; vThick = aThick; vObjPos = position;${pat ? ' vPat = aPat; vPatW = aPatW;' : ''}`);
    const transmission = THREE.ShaderChunk.transmission_fragment
      .replace(
        'material.transmission = transmission;',
        `material.transmission = transmission * (1.0 - clamp(uMilkBase*uMilk*vThick, 0.0, 0.95)) * (1.0 - 0.85*shPig) * (1.0 - 0.3*vJoint);`
      )
      .replace('material.thickness = thickness;', 'material.thickness = thickness * (0.25 + vThick);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${NOISE_GLSL}
        uniform float uAlpha; uniform float uRimAlpha; uniform float uPigment; uniform float uMilk; uniform float uMilkBase; uniform float uCells; uniform float uKeep; uniform float uDotR;
        uniform vec3 uChromaColor; uniform vec3 uChromaCore; uniform vec3 uJointColor; uniform float uRelief;
        varying float vJoint; varying float vPigD; varying float vThick; varying vec3 vObjPos;
        ${patFrag}
        float shPig;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float dens = clamp(vPigD*uPigment, 0.0, 1.6);
          float cov = shChromato(vObjPos, uCells, uKeep*min(dens,1.0), uDotR*(0.7+0.3*min(dens,1.2)));
          // Very dense regions (eyestalks, scaphocerite rim) merge into continuous pigment.
          cov = max(cov, smoothstep(1.05, 1.5, dens) * (0.55 + 0.45*shNoise(vObjPos*9000.0)));
          shPig = cov;
          float grime = shNoise(vObjPos*1500.0);
          diffuseColor.rgb *= mix(0.95, 1.03, grime);
          diffuseColor.rgb = mix(diffuseColor.rgb, uJointColor, vJoint*0.45);
          vec3 pc = mix(uChromaColor, uChromaCore, smoothstep(0.6, 1.0, cov));
          diffuseColor.rgb = mix(diffuseColor.rgb, pc, cov);
          vec3 vd = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
          float fres = 1.0 - abs(dot(normalize(vNormal), vd));
          float a = mix(uAlpha, uRimAlpha, pow(fres, 2.2));
          a = max(a, cov * 0.92);
          a = max(a, uAlpha + vJoint * 0.04);
          ${pat ? PATTERN_GLSL : ''}
          diffuseColor.a = clamp(a, 0.0, 1.0);
        }`
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        // keep specular glints on the wet cuticle bright even where the shell is clear
        gl_FragColor.a = max(gl_FragColor.a, clamp((max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b)) - 0.95) * 5.0, 0.0, 0.8));`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 q = vObjPos*9000.0;
          float e = 0.35;
          float n0 = shNoise(q);
          vec3 g = vec3(shNoise(q+vec3(e,0,0))-n0, shNoise(q+vec3(0,e,0))-n0, shNoise(q+vec3(0,0,e))-n0);
          normal = normalize(normal - uRelief * (g - dot(g,normal)*normal));
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + vJoint*0.3 + shPig*0.25, 0.04, 1.0);`
      )
      .replace('#include <transmission_fragment>', transmission);
  };
  mat.customProgramCacheKey = () => 'cuticle-v3-' + (o.key ?? '') + (pat ? '-pat' + pat.mode : '');
  return mat;
}

/** Internal organs: opaque, so they are captured in the transmission buffer and seen through the cuticle. */
export function createTissueMaterial(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.roughness ?? 0.55,
    emissive: new THREE.Color(color).multiplyScalar(o.glow ?? 0.05),
  });
}

/**
 * Compound eye as seen live [PHOTO 001, 002, 005, 007, 043]: dark screening pigment with a
 * pseudopupil (darkest where ommatidia face the viewer), brownish-grey periphery, and a pale
 * translucent corneal rim at grazing angles; wet clear-coat highlight on top.
 */
export function createEyeMaterial(o = {}) {
  const v3 = (c, d) => `vec3(${(c ?? d).map((x) => x.toFixed(4)).join(', ')})`;
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x141010,
    roughness: 0.45,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    specularIntensity: 0.6,
  });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec3 vd = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
        float facing = clamp(dot(normalize(vNormal), vd), 0.0, 1.0);
        vec3 pupil = ${v3(o.pupil, [0.012, 0.01, 0.009])};
        vec3 periph = ${v3(o.periph, [0.3, 0.25, 0.23])};
        vec3 rim = ${v3(o.rim, [0.62, 0.6, 0.55])};
        vec3 c = mix(periph, pupil, smoothstep(0.82, 0.97, facing));
        c = mix(rim, c, smoothstep(0.1, 0.45, facing));
        diffuseColor.rgb = c;
      }`
    );
  };
  mat.customProgramCacheKey = () => 'eye-v3' + (o.key ? '-' + o.key : '');
  return mat;
}

export function createFlagellumMaterial(tint, opacity = 0.32) {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.3,
    transparent: true,
    opacity, // シラタエビ 0.32: near-invisible in water, catching light only along its length
    depthWrite: false,
    clearcoat: 0.5,
  });
}

export function createEggMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x736c4a, // [PHOTO 048] olive egg mass
    roughness: 0.25,
    transmission: 0, // no transmission pass in the game (many individuals)
    thickness: 0.0008,
    ior: 1.36,
    clearcoat: 0.6,
  });
}
