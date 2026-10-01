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
  mat.userData.uniforms = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aJoint; attribute float aPig; attribute float aThick;
        varying float vJoint; varying float vPigD; varying float vThick; varying vec3 vObjPos;`
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvJoint = aJoint; vPigD = aPig; vThick = aThick; vObjPos = position;`);
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
  mat.customProgramCacheKey = () => 'cuticle-v3-' + (o.key ?? '');
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
export function createEyeMaterial() {
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
        vec3 pupil = vec3(0.012, 0.010, 0.009);
        vec3 periph = vec3(0.30, 0.25, 0.23);
        vec3 rim = vec3(0.62, 0.60, 0.55);
        vec3 c = mix(periph, pupil, smoothstep(0.82, 0.97, facing));
        c = mix(rim, c, smoothstep(0.1, 0.45, facing));
        diffuseColor.rgb = c;
      }`
    );
  };
  mat.customProgramCacheKey = () => 'eye-v3';
  return mat;
}

export function createFlagellumMaterial(tint) {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.3,
    transparent: true,
    opacity: 0.32, // near-invisible in water, catching light only along its length
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
