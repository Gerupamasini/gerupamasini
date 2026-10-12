import { MeshPhysicalMaterial, MeshStandardMaterial, Vector3, type IUniform } from 'three';
import { CORAL_IDS, type CoralSpecies, type CoralLod } from './types';
import { coralSurfaceAtlas } from './surface-textures';
export interface CoralLight {
  water: IUniform<number>;
  time: IUniform<number>;
  sun: IUniform<Vector3>;
}
const helpers = /* glsl */ `
varying vec3 vCoralP, vCoralW, vCoralN;
varying vec4 vCoralLook;
varying float vCoralGrowth;
#if CORAL_SPECIES == 0 && CORAL_DETAIL == 1
  varying float vCoralOcclusion;
#endif
uniform float uCoralWater, uCoralTime;
uniform vec3 uCoralSun;
#if CORAL_DETAIL == 1
  uniform sampler2D uCoralSurface;
  uniform vec2 uCoralSurfaceSpan;
  uniform float uCoralRelief;
#endif
float cHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float cNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(cHash(i),cHash(i+vec3(1,0,0)),f.x),mix(cHash(i+vec3(0,1,0)),cHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(cHash(i+vec3(0,0,1)),cHash(i+vec3(1,0,1)),f.x),mix(cHash(i+vec3(0,1,1)),cHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
#if CORAL_DETAIL == 1
vec4 cSurface(vec3 p,vec2 uv){
  #if CORAL_SPECIES == 0 || CORAL_SPECIES == 2 || CORAL_SPECIES == 4
    // Triplanar in physical local metres. Fused Acropora forks and massive colonies
    // keep continuous corallites without branch-UV rings or spherical-pole stretching.
    vec3 weight=pow(abs(normalize(vCoralN)),vec3(12.0));
    weight/=max(dot(weight,vec3(1.0)),0.0001);
    return texture2D(uCoralSurface,p.zy/uCoralSurfaceSpan)*weight.x
      +texture2D(uCoralSurface,p.xz/uCoralSurfaceSpan)*weight.y
      +texture2D(uCoralSurface,p.xy/uCoralSurfaceSpan)*weight.z;
  #else
    return texture2D(uCoralSurface,uv/uCoralSurfaceSpan);
  #endif
}
#endif
`;
/** Daytime mostly retracted polyps use authored packed relief/AO/septa maps, never separate meshes. */
export function coralMaterial(species: CoralSpecies, lod: CoralLod, light: CoralLight): MeshStandardMaterial {
  const m =
    lod === 2
      ? new MeshStandardMaterial({ roughness: 0.85 })
      : new MeshPhysicalMaterial({
          roughness: species === 'porites_lobata' ? 0.83 : species === 'platygyra_daedalea' ? 0.7 : 0.77,
          metalness: 0,
          ior: 1.38,
          specularIntensity: 0.4,
          clearcoat: 0.025,
          clearcoatRoughness: 0.7,
        });
  const atlas = lod < 2 ? coralSurfaceAtlas(species) : undefined;
  m.name = `${species}/LOD${lod}`;
  m.defines = { USE_UV: '', CORAL_SPECIES: CORAL_IDS.indexOf(species), CORAL_DETAIL: lod === 2 ? 0 : 1 };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uCoralWater: light.water, uCoralTime: light.time, uCoralSun: light.sun });
    if (atlas)
      Object.assign(s.uniforms, {
        uCoralSurface: { value: atlas.texture },
        uCoralSurfaceSpan: { value: atlas.span },
        uCoralRelief: { value: atlas.relief },
      });
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec4 aCoralLook;\nattribute float aGrowth;\nvarying vec3 vCoralP,vCoralW,vCoralN;\nvarying vec4 vCoralLook;\nvarying float vCoralGrowth;\n#if CORAL_SPECIES == 0 && CORAL_DETAIL == 1\nattribute float aOcclusion;\nvarying float vCoralOcclusion;\n#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvCoralP=position;vCoralN=normal;vCoralGrowth=aGrowth;vCoralLook=aCoralLook;vCoralW=(modelMatrix*instanceMatrix*vec4(position,1.0)).xyz;\n#if CORAL_SPECIES == 0 && CORAL_DETAIL == 1\nvCoralOcclusion=aOcclusion;\n#endif`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${helpers}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float coralPatch=cNoise(vCoralP*8.0+vCoralLook.x*100.0);
        float damage=smoothstep(.82-vCoralLook.y*1.4,.98-vCoralLook.y*1.2,coralPatch)*smoothstep(.005,.06,vCoralLook.y);
        float algae=smoothstep(.80-vCoralLook.z*1.5, .94-vCoralLook.z*1.5,cNoise(vCoralP*11.0+vec3(5.0,vCoralLook.x*17.0,3.0))) * smoothstep(.005,.055,vCoralLook.z) * (1.0-smoothstep(0.25,0.8,vCoralP.y));
        vec4 detail=vec4(.5,0.0,.5,0.0);
        float mesoRelief=0.0;
        float pigmentation=smoothstep(.26,.73,coralPatch);
        #if CORAL_DETAIL == 1
          // Young and old colonies retain the same species-scale corallites.
          float surfaceScale=max(vCoralLook.w,.0001);
          vec3 surfaceP=vCoralP*surfaceScale;
          detail=cSurface(surfaceP,vUv*surfaceScale);
          float texelWorld=max(length(dFdx(surfaceP)),length(dFdy(surfaceP)));
          #if CORAL_SPECIES != 4
            float cupSpacing=CORAL_SPECIES==2?.0015:CORAL_SPECIES==3?.001:CORAL_SPECIES==1?.003:.0038;
            float resolved=smoothstep(.9,2.7,cupSpacing/max(texelWorld,.00001));
            detail=mix(vec4(.44,.18,.57,.2),detail,resolved);
          #endif
          #if CORAL_SPECIES == 2 || CORAL_SPECIES == 3
            float meso=cNoise(surfaceP*75.0+vec3(vCoralLook.x*21.0));
            mesoRelief=(meso-.5)*(CORAL_SPECIES==2?.00125:.00075);
            diffuseColor.rgb*=mix(.88,1.10,smoothstep(.2,.8,meso));
          #endif
        #endif
        #if CORAL_SPECIES == 2
          diffuseColor.rgb*=mix(vec3(.77,.67,.47),vec3(1.17,1.13,.96),pigmentation);
        #elif CORAL_SPECIES == 3
          diffuseColor.rgb*=mix(vec3(.78,.64,.51),vec3(1.16,1.07,.93),pigmentation);
        #else
          diffuseColor.rgb*=mix(.68,1.17,pigmentation);
        #endif
        diffuseColor.rgb*=mix(.88,1.12,detail.b);
        #if CORAL_SPECIES == 4
          // Platygyra: olive/gold ridges, darker olive oral valleys; no fluorescent emission.
          diffuseColor.rgb*=mix(vec3(1.13,1.09,.87),vec3(.57,.69,.43),detail.g*.83);
          diffuseColor.rgb+=diffuseColor.rgb*detail.a*.14;
        #elif CORAL_SPECIES == 2
          diffuseColor.rgb*=mix(vec3(1.05,1.02,.94),vec3(.64,.61,.49),detail.g*.61);
        #else
          diffuseColor.rgb*=1.0-detail.g*.32+detail.a*.075;
        #endif
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.56,.53,.43),damage);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.10,.135,.065),algae*.78);
        #if CORAL_SPECIES < 2
          float growth=smoothstep(.15,.95,vCoralGrowth)*(1.0-damage);
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.10+vec3(.13,.12,.085),growth*.78);
        #elif CORAL_SPECIES == 3
          float growth=smoothstep(.12,.92,vCoralGrowth)*(1.0-damage);
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.83+vec3(.19,.15,.095),growth*.70);
        #endif
      `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+detail.g*.10-detail.a*.035+damage*.12+algae*.08,0.62,1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        #if CORAL_DETAIL == 1
          // A filtered physical-height field, not a tangent-normal stamped across stretched UVs.
          // Its derivatives share the geometric surface frame and mips remove subpixel septa.
          float h=detail.r*uCoralRelief+mesoRelief;
          vec3 qx=dFdx(-vViewPosition),qy=dFdy(-vViewPosition);
          vec3 rx=cross(qy,normal),ry=cross(normal,qx);float det=dot(qx,rx);
          vec3 grad=sign(det)*(dFdx(h)*rx+dFdy(h)*ry);
          normal=normalize(abs(det)*normal-grad);
        #endif
      `,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Microcavities occlude indirect light; restrained tissue scattering softens growing edges.
        reflectedLight.indirectDiffuse*=1.0-detail.g*.30;
        float tissue=(CORAL_SPECIES==3?0.024:0.008)*(1.0-damage);
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*tissue*(0.3+0.7*vCoralGrowth);
        #if CORAL_SPECIES == 0 && CORAL_DETAIL == 1
          // Baked SDF openness: 0 is enclosed, 1 is open. Sunlight keeps its shadow-map lighting.
          reflectedLight.indirectDiffuse*=mix(.45,1.0,clamp(vCoralOcclusion,0.0,1.0));
        #endif
      `,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        // Sun's water path only; WaterPass handles the camera path exactly once.
        float depth=max(0.0,uCoralWater-vCoralW.y);
        vec3 sunTransmission=exp(-vec3(.10,.025,.012)*depth/max(uCoralSun.y,.35));
        float lightCaustic=pow(max(0.0,.5+.5*sin(vCoralW.x*10.0+sin(vCoralW.z*8.0)+uCoralTime*.8)),10.0);
        gl_FragColor.rgb*=sunTransmission*(1.0+.055*lightCaustic*exp(-depth*.3));
      `,
      );
  };
  m.customProgramCacheKey = () => `okinawa-coral-${species}-${lod}-surface-atlas-7`;
  return m;
}
