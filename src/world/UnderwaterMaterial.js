// Patches any three.js lit material (Standard / Physical) so it receives the
// shared underwater light transport: projected caustics on direct light and
// wavelength-dependent extinction + in-scattering along the in-water path.

import { U } from '../render/SharedUniforms.js';
import { underwaterCommon, noiseCommon } from '../fish/shaders/common.glsl.js';

const UW_UNIFORMS = ['uCaustics', 'uCausticParams', 'uCausticLightDir', 'uWaterMin', 'uWaterMax', 'uWaterAbsorb', 'uWaterScatter', 'uWaterDensity', 'uTime'];

// Options: caustics (projected caustic pattern on direct light), causticMix
// (pattern contrast, 1 = full), attenuation (in-water extinction along the view
// ray). Direct light always gets the hood-light depth falloff and indirect
// light the gentler ambient falloff. extraLights code runs after that and can
// use `uwDirect` (the direct-light modulation at this point).
export function patchUnderwater(material, { caustics = true, causticMix = 1, attenuation = true, extraVertex = null, extraVertexPars = '', extraFragmentPars = '', extraNormal = '', extraColor = '', extraLights = '', key = '' } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    for (const n of UW_UNIFORMS) shader.uniforms[n] = U[n];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nout vec3 vUwWorld;\nuniform float uTime;\n' + extraVertexPars)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (extraVertex || ''))
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 uwp = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            uwp = batchingMatrix * uwp;
          #endif
          #ifdef USE_INSTANCING
            uwp = instanceMatrix * uwp;
          #endif
          vUwWorld = (modelMatrix * uwp).xyz;
        }`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nin vec3 vUwWorld;\n' + noiseCommon + underwaterCommon + extraFragmentPars)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + extraColor)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + extraNormal)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        vec3 uwDirect = vec3(lightFalloff(vUwWorld));
        {
          ${caustics ? `vec3 cN = inverseTransformDirection(normal, viewMatrix);
          uwDirect *= mix(vec3(1.0), causticsPattern(vUwWorld, cN), ${causticMix.toFixed(3)});` : ''}
          reflectedLight.directDiffuse *= uwDirect;
          reflectedLight.directSpecular *= uwDirect;
          float uwAmb = ambientFalloff(vUwWorld);
          reflectedLight.indirectDiffuse *= uwAmb;
          reflectedLight.indirectSpecular *= uwAmb;
        }
        ${extraLights}`
      )
      .replace('#include <opaque_fragment>', `${attenuation ? 'outgoingLight = waterAttenuate(outgoingLight, vUwWorld);' : ''}\n#include <opaque_fragment>`);
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|uw' + (caustics ? 1 : 0) + (attenuation ? 1 : 0) + causticMix + key;
  return material;
}
