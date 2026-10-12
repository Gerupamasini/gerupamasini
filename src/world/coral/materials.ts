import { MeshPhysicalMaterial, MeshStandardMaterial, Vector3, type IUniform } from 'three';
import { CORAL_IDS, type CoralSpecies, type CoralLod } from './types';
import { coralSurfaceAtlas } from './surface-textures';
import { WAVES_GLSL, type WaveSet } from '../Waves';
export interface CoralLight {
  water: IUniform<number>;
  time: IUniform<number>;
  sun: IUniform<Vector3>;
  waves: WaveSet['uniforms'];
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
  ${WAVES_GLSL}
#endif
float cHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float cNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(cHash(i),cHash(i+vec3(1,0,0)),f.x),mix(cHash(i+vec3(0,1,0)),cHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(cHash(i+vec3(0,0,1)),cHash(i+vec3(1,0,1)),f.x),mix(cHash(i+vec3(0,1,1)),cHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
#if CORAL_DETAIL == 1
vec4 cSurface(vec3 p,vec2 uv){
  vec4 packedSurface;
  #if CORAL_SPECIES == 0 || CORAL_SPECIES == 2 || CORAL_SPECIES == 3 || CORAL_SPECIES == 4
    // Local metre projection remains continuous through fused forks, steep foliose folds and poles.
    vec3 weight=pow(abs(normalize(vCoralN)),vec3(12.0));
    weight/=max(dot(weight,vec3(1.0)),0.0001);
    packedSurface=texture2D(uCoralSurface,p.zy/uCoralSurfaceSpan)*weight.x
      +texture2D(uCoralSurface,p.xz/uCoralSurfaceSpan)*weight.y
      +texture2D(uCoralSurface,p.xy/uCoralSurfaceSpan)*weight.z;
  #else
    packedSurface=texture2D(uCoralSurface,uv/uCoralSurfaceSpan);
  #endif
  // Decode the RG16 height after filtering; authored mips preserve the same linear precision.
  float surfaceHeight=dot(packedSurface.rg,vec2(256.0,1.0))/257.0;
  return vec4(surfaceHeight,packedSurface.b,packedSurface.a,smoothstep(.42,.63,surfaceHeight));
}
#endif
`;
/** Daytime mostly retracted polyps use authored packed relief/AO/septa maps, never separate meshes. */
export function coralMaterial(species: CoralSpecies, lod: CoralLod, light: CoralLight): MeshStandardMaterial {
  const m =
    lod === 2
      ? new MeshStandardMaterial({ roughness: 0.85 })
      : new MeshPhysicalMaterial({
          roughness: species === 'porites_lobata' ? 0.9 : species === 'platygyra_daedalea' ? 0.84 : 0.87,
          metalness: 0,
          ior: 1.34,
          specularIntensity: 0.25,
          clearcoat: 0,
          clearcoatRoughness: 0.7,
        });
  const atlas = lod < 2 ? coralSurfaceAtlas(species) : undefined;
  m.name = `${species}/LOD${lod}`;
  m.defines = { USE_UV: '', CORAL_SPECIES: CORAL_IDS.indexOf(species), CORAL_DETAIL: lod === 2 ? 0 : 1 };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uCoralWater: light.water, uCoralTime: light.time, uCoralSun: light.sun });
    if (atlas)
      Object.assign(s.uniforms, light.waves, {
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
        float pigmentation=smoothstep(.20,.80,coralPatch);
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
        #if CORAL_SPECIES == 0
          diffuseColor.rgb*=mix(vec3(.77,.73,.56),vec3(1.08,1.08,.91),pigmentation);
        #elif CORAL_SPECIES == 1
          // Warm brown/olive tissue remains visible between sparse pale growing ends.
          diffuseColor.rgb*=mix(vec3(.76,.76,.47),vec3(1.02,1.01,.73),pigmentation);
        #elif CORAL_SPECIES == 2
          diffuseColor.rgb*=mix(vec3(.89,.86,.72),vec3(1.08,1.06,.97),pigmentation);
        #elif CORAL_SPECIES == 3
          diffuseColor.rgb*=mix(vec3(.81,.72,.57),vec3(1.13,1.03,.88),pigmentation);
        #else
          diffuseColor.rgb*=mix(.82,1.08,pigmentation);
        #endif
        diffuseColor.rgb*=mix(.91,1.09,detail.b);
        #if CORAL_SPECIES == 4
          // Platygyra: olive/gold ridges, darker olive oral valleys; no fluorescent emission.
          diffuseColor.rgb*=mix(vec3(1.13,1.09,.87),vec3(.57,.69,.43),detail.g*.55);
          diffuseColor.rgb+=diffuseColor.rgb*detail.a*.065;
        #elif CORAL_SPECIES == 2
          diffuseColor.rgb*=mix(vec3(1.05,1.02,.94),vec3(.64,.61,.49),detail.g*.40);
        #else
          diffuseColor.rgb*=1.0-detail.g*.19+detail.a*.035;
        #endif
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.56,.53,.43),damage);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.10,.135,.065),algae*.78);
        #if CORAL_SPECIES < 2
          float growth=smoothstep(.62,.995,vCoralGrowth)*(1.0-damage);
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.94+vec3(.085,.080,.052),growth*.60);
        #elif CORAL_SPECIES == 3
          float growth=smoothstep(.58,.995,vCoralGrowth)*(1.0-damage);
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.95+vec3(.070,.057,.039),growth*.50);
        #endif
      `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(.5-detail.b)*.08+detail.g*.055-detail.a*.015+damage*.08+algae*.05,0.73,.98);`,
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
        reflectedLight.indirectDiffuse*=1.0-detail.g*.22;
        float tissue=(CORAL_SPECIES==3?0.009:0.006)*(1.0-damage);
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*tissue*(0.3+0.7*vCoralGrowth);
        #if CORAL_DETAIL == 1
          // The same wave Jacobian focuses sunlight on both reef and bed. Applying it to
          // direct terms only preserves shadowed crevices instead of painting light over them.
          float coralDepth=max(0.0,uCoralWater-vCoralW.y);
          if(coralDepth>.002 && uCoralSun.y>0.0){
            vec3 coralL=normalize(uCoralSun);
            float coralD=coralDepth/max(coralL.y,.2);
            float coralFp=length(fwidth(vCoralW));
            float coralFocus=waveCaustic(vCoralW.xz,coralL,coralD,uCoralTime,coralFp,.68);
            float coralCaustic=mix(1.0,coralFocus,.25*exp(-coralDepth*.18)*smoothstep(0.0,.015,coralDepth));
            reflectedLight.directDiffuse*=coralCaustic;
            reflectedLight.directSpecular*=coralCaustic;
          }
        #endif
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
        gl_FragColor.rgb*=sunTransmission;
      `,
      );
  };
  m.customProgramCacheKey = () => `okinawa-coral-${species}-${lod}-surface-atlas-9`;
  return m;
}
