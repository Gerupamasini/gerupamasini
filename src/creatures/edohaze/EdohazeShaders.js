import * as THREE from 'three';

// Uniforms shared by every Edohaze material. The host (water/lighting system)
// drives them once per frame via EdohazeShared.update().
export const EdohazeShared = {
  uniforms: {
    uTime: { value: 0 },
    uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uCaustic: { value: 0.8 },      // caustic contrast (0 disables)
    uCausticScale: { value: 7.0 },  // pattern frequency per metre
    uWaterY: { value: 1.0 },        // water surface height (m)
  },
  _v: new THREE.Vector3(),
  update({ time, camera, sunDirWorld, sunColor, caustic, waterY }) {
    const u = this.uniforms;
    if (time !== undefined) u.uTime.value = time;
    if (camera && sunDirWorld) u.uSunDirView.value.copy(sunDirWorld).transformDirection(camera.matrixWorldInverse);
    if (sunColor) u.uSunColor.value.copy(sunColor);
    if (caustic !== undefined) u.uCaustic.value = caustic;
    if (waterY !== undefined) u.uWaterY.value = waterY;
  },
};

// Procedural caustics: two warped interference layers, cheap enough per fragment.
// Output ~0..1.5, mean ~0.5. Depth attenuates contrast (defocus below surface).
export const causticsGLSL = /* glsl */`
float edoCausticLayer(vec2 p, float t){
  vec2 q = p;
  q += 0.35 * vec2(sin(p.y * 1.7 + t * 0.9), cos(p.x * 1.3 - t * 0.7));
  float a = sin(q.x * 2.1 + t) + sin(q.y * 2.3 - t * 1.1) + sin((q.x + q.y) * 1.6 + t * 0.6);
  return a / 3.0;
}
float edoCaustics(vec3 wp, float t, float scale, float waterY){
  vec2 p = wp.xz * scale;
  float c1 = edoCausticLayer(p, t * 0.8);
  float c2 = edoCausticLayer(p * 1.37 + 3.1, -t * 0.65);
  float c = 1.0 - abs(c1 + c2) * 0.9;
  c = pow(clamp(c, 0.0, 1.0), 5.0);
  float depth = max(waterY - wp.y, 0.0);
  return c * 2.2 * exp(-depth * 1.4);
}
`;

// Thin-tissue translucency (forward-scattered sunlight through fins/belly).
export const translucencyGLSL = /* glsl */`
vec3 edoTranslucency(vec3 N, vec3 V, vec3 L, vec3 albedo, vec3 tint, float thin){
  float back = pow(clamp(dot(V, -L), 0.0, 1.0), 4.0);
  float wrap = clamp(dot(-N, L) * 0.6 + 0.4, 0.0, 1.0);
  float rim = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.0);
  return albedo * tint * thin * (0.25 * wrap + 1.6 * back * (0.4 + rim));
}
`;
