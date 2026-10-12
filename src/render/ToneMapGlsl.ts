import { ShaderChunk } from 'three';

/** The tone curves the game can draw with: three's ACES filmic, or AgX with the game's look. */
export type ToneCurve = 'aces' | 'agx';

/**
 * AgX's look, fitted to the tones the game was lit for under ACES (its greys within a few levels from the mid-tones
 * up, the deepest shadows not crushed): the mid-tones a touch brighter, the highlights rolling off more softly, and
 * bright saturated light (the setting sun, the sky by it) keeping its hue where ACES turns it yellow or purple.
 * `exposure` scales three's exposure (AgX takes it straight, ACES over 0.6); `power` and `saturation` are the ASC CDL
 * of Blender's AgX looks, applied after the sigmoid.
 */
export const AGX_LOOK = { exposure: 2.55, power: 1.6, saturation: 1.1 };

/** The curve in use: the default, or `?tone=aces|agx` on the page's address (compared by reloading). */
export const TONE_CURVE: ToneCurve = (() => {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('tone');
    if (q === 'aces' || q === 'agx') return q;
  } catch { /* no location (tests) */ }
  return 'agx';
})();

const f = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x));

/**
 * `higataToneMap(color, exposure)` (three's exposure, linear in, linear display-referred out) and `srgbEncode`.
 * Guarded so that a shader carrying it (the water, the hero pass) and three's own chunk can both include it.
 */
export const TONE_MAP_GLSL = /* glsl */ `
#ifndef HIGATA_TONE_MAP
#define HIGATA_TONE_MAP
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
  // three's AgX (after Filament and Blender, Rec. 2020 primaries), with the look applied after the sigmoid
  vec3 agxTM(vec3 color, float exposure) {
    const mat3 SRGB_TO_2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
    const mat3 R2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
    const mat3 Inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
    const mat3 Outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
    color *= exposure * ${f(AGX_LOOK.exposure)};
    color = Inset * (SRGB_TO_2020 * color);
    color = clamp((log2(max(color, 1e-10)) + 12.47393) / (4.026069 + 12.47393), 0.0, 1.0);
    vec3 x2 = color * color, x4 = x2 * x2;
    color = 15.5 * x4 * x2 - 40.14 * x4 * color + 31.96 * x4 - 6.868 * x2 * color + 0.4298 * x2 + 0.1191 * color - 0.00232;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = luma + ${f(AGX_LOOK.saturation)} * (pow(max(color, 0.0), vec3(${f(AGX_LOOK.power)})) - luma);
    color = pow(max(Outset * color, 0.0), vec3(2.2));
    return clamp(R2020_TO_SRGB * color, 0.0, 1.0);
  }
  vec3 higataToneMap(vec3 color, float exposure) {
    return ${TONE_CURVE === 'agx' ? 'agxTM' : 'acesFilmicTM'}(color, exposure);
  }
  vec3 srgbEncode(vec3 c) {
    return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
  }
#endif
`;

let installed = false;
/**
 * Puts the game's curve in three's CustomToneMapping, so whatever three tone maps (to the screen, with
 * `renderer.toneMapping = CustomToneMapping`) goes through the same curve as the passes that do it themselves.
 */
export function installToneMap(): void {
  if (installed) return;
  installed = true;
  const stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (!ShaderChunk.tonemapping_pars_fragment.includes(stub)) throw new Error('three: CustomToneMapping stub not found');
  ShaderChunk.tonemapping_pars_fragment = ShaderChunk.tonemapping_pars_fragment.replace(stub, `${TONE_MAP_GLSL}\nvec3 CustomToneMapping( vec3 color ) { return higataToneMap( color, toneMappingExposure ); }`);
}
