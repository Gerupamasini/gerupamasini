// Patches any three.js lit material (Standard / Physical) so it receives the
// shared underwater light transport: projected caustics on direct light and
// wavelength-dependent extinction + in-scattering along the in-water path.

import { U } from '../render/SharedUniforms.js';
import { underwaterCommon, noiseCommon } from '../fish/shaders/common.glsl.js';

const UW_UNIFORMS = ['uCaustics', 'uCausticParams', 'uCausticLightDir', 'uWaterMin', 'uWaterMax', 'uWaterAbsorb', 'uWaterScatter', 'uWaterDensity', 'uTime'];

export function patchUnderwater(material, { caustics = true, attenuation = true, extraVertex = null, extraVertexPars = '', extraFragmentPars = '', key = '' } = {}) {
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
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        ${caustics ? `{
          vec3 cN = inverseTransformDirection(normal, viewMatrix);
          vec3 cc = causticsRGB(vUwWorld, cN);
          reflectedLight.directDiffuse *= cc;
          reflectedLight.directSpecular *= cc;
        }` : ''}`
      )
      .replace('#include <opaque_fragment>', `${attenuation ? 'outgoingLight = waterAttenuate(outgoingLight, vUwWorld);' : ''}\n#include <opaque_fragment>`);
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|uw' + (caustics ? 1 : 0) + (attenuation ? 1 : 0) + key;
  return material;
}
