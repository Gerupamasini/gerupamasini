/**
 * three's ACES filmic curve (with its exposure, as three applies `toneMappingExposure`) and sRGB encoding, written
 * out for passes that draw into a target: three tone maps and encodes only what is drawn to the screen.
 */
export const TONE_MAP_GLSL = /* glsl */ `
  vec3 acesFilmicTM(vec3 color, float exposure) {
    const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color *= exposure / 0.6;
    color = ACESInputMat * color;
    vec3 a = color * (color + 0.0245786) - 0.000090537;
    vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
    color = ACESOutputMat * (a / b);
    return clamp(color, 0.0, 1.0);
  }
  vec3 srgbEncode(vec3 c) {
    return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
  }
`;
