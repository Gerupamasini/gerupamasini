import * as THREE from 'three';

// Shared GLSL: hash-based 3D noise + cellular dots for chromatophores.
const NOISE_GLSL = /* glsl */ `
float shHash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float shNoise(vec3 x){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(shHash(i+vec3(0,0,0)),shHash(i+vec3(1,0,0)),f.x),
                 mix(shHash(i+vec3(0,1,0)),shHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(shHash(i+vec3(0,0,1)),shHash(i+vec3(1,0,1)),f.x),
                 mix(shHash(i+vec3(0,1,1)),shHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
// Returns 0..1 chromatophore coverage. Star-ish dots with irregular expansion.
float shChromato(vec3 p, float density, float expand){
  vec3 c = p*density; vec3 i=floor(c); vec3 f=fract(c);
  float d=1e3;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec3 g=vec3(x,y,z); vec3 o=vec3(shHash(i+g),shHash(i+g+13.1),shHash(i+g+27.7));
    if(shHash(i+g+5.3)>0.3) continue; // sparse
    vec3 r=g+o-f; d=min(d,dot(r,r));
  }
  float dend = shNoise(p*density*6.0)*0.5; // dendritic edge
  return smoothstep(expand+0.02, expand*0.4, sqrt(d)-dend*expand);
}
`;

/**
 * Exoskeleton: MeshPhysicalMaterial (transmission/IOR/clearcoat/sheen) with
 * procedural chromatophores, joint-membrane density, micro-relief normals.
 * Geometry may provide attribute `aJoint` (0..1) marking arthrodial membranes.
 */
export function createShellMaterial(opts = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(opts.color ?? 0xf2f3ee),
    roughness: 0.22,
    metalness: 0,
    transmission: opts.transmission ?? 0.92,
    thickness: opts.thickness ?? 0.0025,
    ior: 1.43, // chitin-protein ~1.42-1.55
    attenuationColor: new THREE.Color(0xf0ebdf),
    attenuationDistance: 0.006,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    sheen: 0.35,
    sheenColor: new THREE.Color(0xdfe6ea),
    sheenRoughness: 0.5,
    specularIntensity: 0.9,
    side: opts.side ?? THREE.FrontSide,
  });
  const uniforms = {
    uChromaDensity: { value: opts.chromaDensity ?? 1300 },
    uChromaExpand: { value: opts.chromaExpand ?? 0.07 },
    uChromaColor: { value: new THREE.Color(opts.chromaColor ?? 0x7a3218) },
    uJointColor: { value: new THREE.Color(0xb8a58a) },
    uRelief: { value: opts.relief ?? 0.35 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aJoint;\nvarying float vJoint;\nvarying vec3 vObjPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvJoint = aJoint;\nvObjPos = position;`);

    const transmission = THREE.ShaderChunk.transmission_fragment.replace(
      'material.transmission = transmission;',
      'material.transmission = transmission * (1.0 - 0.75*shPig) * (1.0 - 0.35*vJoint);'
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${NOISE_GLSL}\nuniform float uChromaDensity; uniform float uChromaExpand; uniform vec3 uChromaColor; uniform vec3 uJointColor; uniform float uRelief;\nvarying float vJoint; varying vec3 vObjPos;\nfloat shPig;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        shPig = shChromato(vObjPos, uChromaDensity, uChromaExpand);
        float blotch = shNoise(vObjPos*180.0);
        diffuseColor.rgb *= mix(0.94, 1.03, blotch);             // subtle hue drift / grime
        diffuseColor.rgb = mix(diffuseColor.rgb, uJointColor, vJoint*0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, uChromaColor, shPig);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Procedural micro-relief: pits and fine ridges on the cuticle.
          vec3 q = vObjPos*2600.0;
          float e = 0.35;
          float n0 = shNoise(q);
          vec3 g = vec3(shNoise(q+vec3(e,0,0))-n0, shNoise(q+vec3(0,e,0))-n0, shNoise(q+vec3(0,0,e))-n0);
          normal = normalize(normal - uRelief * (g - dot(g,normal)*normal));
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + vJoint*0.35 + shPig*0.2, 0.04, 1.0);`
      )
      .replace('#include <transmission_fragment>', transmission);
  };
  mat.customProgramCacheKey = () => 'shrimpShell' + (opts.key ?? '');
  return mat;
}

/** Internal tissue: opaque so it lands in the transmission buffer and is seen through the shell. */
export function createTissueMaterial(color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.6,
    emissive: new THREE.Color(color).multiplyScalar(opts.glow ?? 0.08),
  });
  if (opts.striated) {
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Myomere chevrons: striated flexor/extensor bundles.
          float s = sin(vObjPos.x*2400.0 + abs(vObjPos.y)*1800.0);
          diffuseColor.rgb *= 0.86 + 0.14*smoothstep(-0.2,0.8,s);`
        );
    };
    mat.customProgramCacheKey = () => 'tissueStriated';
  }
  return mat;
}

export function createEyeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x0a0806,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 0.45, // ommatidial lattice shimmer
    iridescenceIOR: 1.6,
    sheen: 0.4,
    sheenColor: new THREE.Color(0x3a2e20),
  });
}

export function createAppendageMaterial() {
  // Thin appendages: transmission is wasteful at sub-pixel widths; use a translucent-looking opaque.
  return new THREE.MeshStandardMaterial({
    color: 0xd9d6cc,
    roughness: 0.35,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
}

export function createEggMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x5f7d2a,
    roughness: 0.25,
    transmission: 0.35,
    thickness: 0.0008,
    ior: 1.36,
    clearcoat: 0.6,
  });
}
