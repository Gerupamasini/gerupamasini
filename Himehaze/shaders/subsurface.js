// Cheap pseudo-subsurface scattering for thin fish tissue.
// Adds (a) wrap diffuse and (b) view-dependent back-scatter (light shining through thin parts toward
// the camera) for each directional light, scaled by a "thinness" estimate. Works with skinning.
import * as THREE from 'three';

export function patchSubsurface(material, { color, strength = 0.3, thin = false }) {
  material.userData.sss = { color, strength };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sssColor = { value: color };
    shader.uniforms.sssStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 sssColor;
uniform float sssStrength;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
{
  vec3 sssAcc = vec3(0.0);
  vec3 V = normalize(vViewPosition);
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    vec3 L = directionalLights[i].direction;
    float wrap = max(0.0, (dot(normal, L) + 0.5) / 1.5) - max(0.0, dot(normal, L));
    ${thin
      ? 'float back = pow(clamp(dot(V, -L), 0.0, 1.0), 3.0);'
      : 'float back = pow(clamp(dot(V, -L), 0.0, 1.0), 4.0) * (1.0 - abs(dot(normal, V)));'}
    sssAcc += directionalLights[i].color * (wrap * 0.6 + back);
  }
  reflectedLight.directDiffuse += sssAcc * sssColor * diffuseColor.rgb * sssStrength;
}
#endif`);
  };
  material.customProgramCacheKey = () => `sss-${thin ? 1 : 0}`;
}
