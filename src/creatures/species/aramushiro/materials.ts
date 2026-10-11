import { Color, MeshPhysicalMaterial, Vector3, Vector4, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { MODEL_SH, PSI_CANAL, PSI_COVER, PSI_PERIPHERY, SECTION_LEN, SHELL } from './anatomy';
import { SOFT_VERTEX, SOFT_VERTEX_PARS } from './body';
import { LANDMARKS } from './shell';

const f = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : x.toFixed(5));

/**
 * The アラムシロ's materials: standard PBR (MeshPhysicalMaterial) extended through onBeforeCompile.
 *
 * Shell — calcite under a thin periostracum, wet: the sculpture's relief and the colour come from the same function as
 * the geometry (shell.ts `sculpt`), so the granules are white on top and the brown lies in the grooves between them
 * (as the species is described: white axial ribs cut by brown spiral grooves), with the individual's spiral bands,
 * axial flames, the eroded apex, the orange-pink protoconch, the brown-violet inside of the aperture where the bands
 * show through, the white glazed callus and lip. Living shells carry a film (diatoms, a little green alga) and silt
 * in the grooves; the wet film is a clearcoat in air, the water itself under water (where it hardly reflects).
 *
 * Soft parts — one material for the foot, the head, the tentacles, the siphon, the proboscis and the operculum: their
 * motion is in the vertex shader (body.ts), their skin translucent (light wrapped past the terminator, light through
 * the thin parts, the sole glowing a little where the sun comes through it), wet with mucus.
 *
 * Under water the indirect light is the light field of the shallows (Snell's window, the water's glow, the sunlit sand
 * below — close under a snail) and the ripples' caustics play over it.
 */

export const AM_UNIFORMS = {
  uAmTime: { value: 0 } as IUniform<number>,
  /** the glow of the water at full daylight */
  uAmWater: { value: new Color(0.085, 0.15, 0.145) } as IUniform<Color>,
  uAmSand: { value: new Color(0.36, 0.3, 0.2) } as IUniform<Color>,
  uAmSkyGain: { value: 0.35 } as IUniform<number>,
  uAmCaustic: { value: 0.55 } as IUniform<number>,
  /** 1: lit as a photograph in air (the reference viewer's studio, a snail held in the hand); 0 under water */
  uAmAir: { value: 0 } as IUniform<number>,
};

/** One individual's look (linear RGB). */
export interface Look {
  /** the shell's ground between the bands, the granules' white, the brown of the grooves and bands */
  ground: Color; pale: Color; brown: Color;
  /** inside the aperture; the protoconch */
  inside: Color; tip: Color;
  /** the soft parts: the skin's ground and its speckling */
  skin: Color; speck: Color;
  /** bands (0..1), axial flames, grooves' darkness, the film of diatoms and algae, silt in the grooves, erosion of the spire */
  bands: number; flames: number; grooves: number; film: number; silt: number; erosion: number;
  /** foot speckling 0..1, the siphon's dark rings 0..1 */
  mottle: number; rings: number;
  seed: number;
}

const c = (r: number, g: number, b: number) => new Color(r, g, b);
/** The colour forms of the photographs. */
export const MORPHS: readonly Omit<Look, 'seed'>[] = [
  // cream with chestnut bands and white granules (the commonest: photos 2, 6, 11, 23, 24, 49)
  { ground: c(0.5, 0.4, 0.25), pale: c(0.74, 0.68, 0.52), brown: c(0.08, 0.035, 0.016), inside: c(0.22, 0.1, 0.07), tip: c(0.5, 0.25, 0.16),
    skin: c(0.21, 0.2, 0.17), speck: c(0.03, 0.028, 0.026), bands: 0.85, flames: 0.25, grooves: 0.7, film: 0.15, silt: 0.3, erosion: 0.35, mottle: 0.55, rings: 0.4 },
  // yellow-olive, dark spire, bands faint (photos 9, 13, 38, 39)
  { ground: c(0.36, 0.33, 0.14), pale: c(0.64, 0.58, 0.3), brown: c(0.07, 0.05, 0.025), inside: c(0.2, 0.09, 0.05), tip: c(0.18, 0.12, 0.08),
    skin: c(0.22, 0.2, 0.14), speck: c(0.026, 0.026, 0.02), bands: 0.45, flames: 0.4, grooves: 0.8, film: 0.45, silt: 0.45, erosion: 0.6, mottle: 0.7, rings: 0.6 },
  // orange-buff, pale (photos 20, 21, 44, 45)
  { ground: c(0.68, 0.4, 0.2), pale: c(0.84, 0.7, 0.52), brown: c(0.3, 0.13, 0.06), inside: c(0.62, 0.36, 0.17), tip: c(0.58, 0.32, 0.2),
    skin: c(0.26, 0.23, 0.17), speck: c(0.045, 0.036, 0.03), bands: 0.25, flames: 0.15, grooves: 0.45, film: 0.08, silt: 0.2, erosion: 0.2, mottle: 0.35, rings: 0.25 },
  // grey-brown, dark banded, dusted (photos 15, 19, 34, 42, 43)
  { ground: c(0.36, 0.31, 0.25), pale: c(0.66, 0.63, 0.56), brown: c(0.05, 0.022, 0.016), inside: c(0.16, 0.08, 0.07), tip: c(0.32, 0.18, 0.13),
    skin: c(0.19, 0.18, 0.16), speck: c(0.022, 0.022, 0.022), bands: 1.0, flames: 0.6, grooves: 0.85, film: 0.25, silt: 0.55, erosion: 0.45, mottle: 0.8, rings: 0.7 },
  // green-filmed, dark (live snails under algae: photos 25, 31, 32)
  { ground: c(0.24, 0.27, 0.13), pale: c(0.52, 0.55, 0.3), brown: c(0.06, 0.05, 0.025), inside: c(0.2, 0.12, 0.06), tip: c(0.15, 0.13, 0.08),
    skin: c(0.23, 0.21, 0.14), speck: c(0.035, 0.032, 0.024), bands: 0.55, flames: 0.3, grooves: 0.8, film: 0.85, silt: 0.4, erosion: 0.7, mottle: 0.6, rings: 0.5 },
];

const TAU = 6.2831853;

// ------------------------------------------------------------------ GLSL shared by shell and soft parts

const HELPERS = /* glsl */ `
uniform float uAmTime;
uniform vec3 uAmWater;
uniform vec3 uAmSand;
uniform float uAmSkyGain;
uniform float uAmCaustic;
uniform float uAmAir;
uniform float uSandY;
varying vec3 vWPos;

float amHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float amNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(amHash(i), amHash(i + vec2(1.0, 0.0)), f.x), mix(amHash(i + vec2(0.0, 1.0)), amHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float amFbm(vec2 p) { return 0.55 * amNoise(p) + 0.3 * amNoise(p * 2.03 + 7.1) + 0.15 * amNoise(p * 4.1 + 3.3); }
float amSm(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float amBump(float x, float c, float w) { float d = (x - c) / w; return exp(-d * d); }

vec3 amSunDir() {
#if NUM_DIR_LIGHTS > 0
  return normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix));
#else
  return vec3(0.3, 0.9, 0.3);
#endif
}
vec3 amSunCol() {
#if NUM_DIR_LIGHTS > 0
  return directionalLights[0].color;
#else
  return vec3(1.0);
#endif
}
vec3 amSky() {
#if NUM_HEMI_LIGHTS > 0
  return hemisphereLights[0].skyColor;
#else
  return ambientLightColor;
#endif
}
vec3 amGround() {
#if NUM_HEMI_LIGHTS > 0
  return hemisphereLights[0].groundColor;
#else
  return ambientLightColor * 0.5;
#endif
}
vec3 amGlow() {
  float lum = dot(amSky(), vec3(0.2126, 0.7152, 0.0722));
  return uAmWater * (0.06 + 0.94 * clamp((lum - 0.042) / 0.158, 0.0, 1.25));
}
vec3 amWindow(vec3 d, float rough) {
  vec2 h = d.xz * 1.333;
  float hl = length(h);
  vec3 a = hl < 0.995 ? vec3(h.x, sqrt(1.0 - hl * hl), h.y) : normalize(vec3(h.x, 0.1, h.y));
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  return min(textureCubeUV(envMap, envMapRotation * a, max(rough, 0.04)).rgb, vec3(4.0)) * uAmSkyGain;
#else
  return amSky() * 2.2 + amSunCol() * 0.15;
#endif
}
// radiance from direction d at a snail on the bed: Snell's window over the glow of the water, the sunlit sand all
// round below (a snail sits on it: the lower half of its sky is sand)
vec3 amUnderwater(vec3 d, float rough) {
  vec3 glow = amGlow();
  float up = d.y;
  float w = smoothstep(0.6 - rough * 0.3, 0.74 + rough * 0.08, up);
  vec3 L = amSunDir();
  vec3 bed = uAmSand * (amSunCol() * max(L.y, 0.0) * 0.85 + amSky() * 0.6 + amGround() * 0.4) * RECIPROCAL_PI;
  vec3 c = mix(glow, glow * 1.15, smoothstep(0.05, 0.5, up));
  c = mix(c, mix(glow, bed, 0.8), smoothstep(0.05, -0.3, up));
  c = mix(c, amWindow(d, rough), w);
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  if (uAmAir > 0.0) c = mix(c, textureCubeUV(envMap, envMapRotation * d, max(rough, 0.04)).rgb * uAmSkyGain, uAmAir);
#endif
  return c;
}
float amCaustic(vec3 p) {
  vec2 q = p.xz * 22.0 + vec2(uAmTime * 0.21, -uAmTime * 0.13);
  float c = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    q = mat2(1.6, 1.2, -1.2, 1.6) * q + vec2(uAmTime * (0.35 + 0.2 * fi), uAmTime * 0.27);
    c += abs(sin(q.x + 1.7 * sin(q.y * 0.9 + uAmTime * 0.8)) * sin(q.y + 1.5 * sin(q.x * 1.1 - uAmTime * 0.6)));
  }
  c *= 0.5;
  return 0.62 + 1.25 * pow(1.0 - c, 4.0) * 1.6;
}
// a lattice of pigment cells: p in cells, density the share of cells holding one, radii in cells; where a cell is a
// pixel or less the dots give way to their mean cover (no sparkle at a distance)
float amDots(vec2 p, float density, float rMin, float rMax, float seed) {
  float rm = 0.5 * (rMin + rMax);
  float mean = density * 3.14159 * rm * rm * 0.6;
  float fw = length(fwidth(p));
  if (fw > 1.4) return mean;
  vec2 i = floor(p), fr = fract(p);
  float c = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 id = i + o + seed;
    if (amHash(id + 5.3) > density) continue;
    vec2 at = o + 0.1 + 0.8 * vec2(amHash(id), amHash(id + 17.1));
    float r = mix(rMin, rMax, amHash(id + 9.7));
    c = max(c, smoothstep(r, r * 0.35, length(fr - at)));
  }
  return mix(c, mean, smoothstep(0.5, 1.4, fw));
}
// bump from a height field h (metres) by screen-space derivatives (Mikkelsen)
vec3 amBumpN(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`;

const ENV_INJECT = /* glsl */ `
#include <lights_fragment_maps>
{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 rW = reflect(vW, nW);
  // (scaled like the bed's own ambient: a snail on the sand is lit as the sand round it is)
  radiance += amUnderwater(rW, material.roughness) * amAO * 0.6;
  iblIrradiance += PI * amUnderwater(nW, 1.0) * 0.22 * amAO;
#ifdef USE_CLEARCOAT
  clearcoatRadiance += amUnderwater(reflect(vW, inverseTransformDirection(clearcoatNormal, viewMatrix)), material.clearcoatRoughness) * amAO;
#endif
}
`;
const CAUSTIC_INJECT = /* glsl */ `
#include <lights_fragment_begin>
{
  float upW = inverseTransformDirection(normal, viewMatrix).y;
  float cs = mix(1.0, amCaustic(vWPos), uAmCaustic * smoothstep(-0.3, 0.5, upW) * (1.0 - uAmAir));
  reflectedLight.directDiffuse *= cs;
  reflectedLight.directSpecular *= cs;
}
`;
/** under water the shell's and the mucus' reflection is that of a solid against water (weak); in air the wet film shines */
const WET = /* glsl */ `
{
  // (against water a shell or a mucous skin hardly reflects: F0 drops five-fold or more)
  float amWet = mix(0.18, 1.0, uAmAir);
  material.specularColor *= amWet;
  material.specularColorBlended = mix(material.specularColor, diffuseColor.rgb, metalnessFactor);
  material.specularF90 = mix(amWet, 1.0, metalnessFactor);
#ifdef USE_CLEARCOAT
  material.clearcoat = amCoat;
  material.clearcoatF90 = amWet;
#endif
}
`;

// ------------------------------------------------------------------ the shell

const A_COVER = PSI_COVER * SECTION_LEN, A_CANAL = PSI_CANAL * SECTION_LEN, A_PERI = PSI_PERIPHERY * SECTION_LEN;
const S = SHELL;

const SHELL_VERT_PARS = /* glsl */ `
attribute vec4 aShell;
varying vec4 vShell;
varying vec3 vWPos;
varying vec3 vObj;
`;

/** GLSL twin of shell.ts (teleoconch, callusAt, sculpt): keep them in step */
const SHELL_FNS = /* glsl */ `
varying vec4 vShell;
varying vec3 vObj;
uniform vec3 uGround;
uniform vec3 uPale;
uniform vec3 uBrown;
uniform vec3 uInside;
uniform vec3 uTip;
uniform vec4 uPat;   // bands, flames, grooves, film
uniform vec4 uPat2;  // silt, erosion, seed, scale
uniform float uSandDust;

float amTeleo(float w) { return amSm(${f(S.whorls - S.protoconch + 0.05)}, ${f(S.whorls - S.protoconch - 0.4)}, w); }
float amCallus(float w, float a) {
  float x = ${f(TAU)} * (1.0 - w);
  float along = amSm(-1.1, -0.55, x) * (1.0 - amSm(0.85, 1.35, x));
  float across = amSm(${f(A_COVER - 0.04)}, ${f(A_COVER + 0.02)}, a);
  float col = w < 0.2 ? amSm(${f(A_CANAL - 0.02)}, ${f(A_CANAL + 0.06)}, a) * (1.0 - amSm(0.02, 0.2, w)) : 0.0;
  return max(along * across, col);
}
// the sculpture: x granules·cords·ribs (fine), y large forms; z the rib profile, w the cord profile (for the colour)
vec4 amSculpt(float w, float a) {
  float teleo = amTeleo(w);
  float lip = amSm(0.012, 0.075, w);
  float rp = w * ${f(S.ribs)} + 0.9 * a + 0.05 * sin(w * 7.3);
  float rib = pow(0.5 + 0.5 * cos(${f(TAU)} * rp), 1.15);
  float cp = (a - ${f(S.cord * 0.62)}) / ${f(S.cord)};
  float cord = (a > 0.012 && a < ${f(A_CANAL + 0.01)}) ? pow(0.5 + 0.5 * cos(${f(TAU)} * cp), 1.7) : 0.0;
  float first = cp < 0.5 ? 1.15 : 1.0;
  float beads = 1.0 - amSm(${f(A_PERI + 0.04)}, ${f(A_PERI + 0.2)}, a);
  float fine = ${f(S.bead)} * rib * cord * beads * first + ${f(S.cordH)} * cord * (0.35 + 0.65 * (1.0 - beads)) + ${f(S.ribH)} * rib * beads * 0.45;
  fine *= teleo * lip * (1.0 - amCallus(w, a));
  float outer = amSm(0.0, 0.05, a) * (1.0 - amSm(${f(A_CANAL - 0.1)}, ${f(A_CANAL - 0.01)}, a));
  float coarse = -0.01 * amBump(a, 0.0, 0.018) * teleo + ${f(S.varixH)} * amBump(w, ${f(S.varixAt)}, 0.028) * outer + 0.012 * amBump(w, 0.0, 0.02) * outer;
  return vec4(fine, coarse, rib * beads * teleo * lip, cord * teleo);
}
`;

/**
 * The shell's surface at the colour stage (read again at the roughness, normal and clearcoat stages). From the
 * photographs: granules white to cream on top (the ribs), the brown in the grooves between them and in the spiral
 * bands — one under the suture, a broad one at the periphery that runs up the spire just above each suture, one on
 * the base — darker and wider in some, nearly absent in others; axial flames on some; the spire's tip worn and often
 * darker, the protoconch smooth and orange-pink; a film of diatoms and green algae and silt in the grooves on living
 * shells; inside the aperture brown-violet with the bands showing through, white at the lip; the callus a white glaze.
 */
const SHELL_SURFACE = /* glsl */ `
float amRough = 0.5, amCoat = 0.0, amAO = 1.0, amH = 0.0, amThin = 0.0;
{
  float w = vShell.x, a = vShell.y, cal = vShell.z;
  float part = mod(vShell.w, 8.0);
  bool geoFine = vShell.w < 7.5;
  float s = pow(${f(S.W)}, -w);
  float scale = uPat2.w * ${f(MODEL_SH)};
  vec4 sc = amSculpt(w, a);
  // how far the pattern's period is from the pixel: fade what cannot be drawn
  float fwW = fwidth(w * ${f(S.ribs)}), fwA = fwidth(a / ${f(S.cord)});
  float detail = 1.0 - amSm(0.25, 0.7, max(fwW, fwA));
  float crest = clamp(sc.x / ${f(S.bead * 0.75)}, 0.0, 1.0);
  crest = mix(0.42, crest, detail);
  float seed = uPat2.z;
  float teleo = amTeleo(w);
  // spiral bands (constant a: they run round every whorl, the peripheral one showing above each suture of the spire)
  // (the bands' places and widths differ a little from snail to snail)
  float j1 = 0.012 * sin(seed * 41.0), j2 = 0.015 * sin(seed * 23.0 + 1.0);
  float b1 = amSm(0.035, 0.0, abs(a - 0.1 - j1) - 0.018);
  float b2 = amSm(0.03, 0.0, abs(a - ${f(A_COVER - 0.025)} - j2) - 0.035);
  float b3 = amSm(0.03, 0.0, abs(a - ${f(A_PERI + 0.17)} + j1) - 0.03);
  float b4 = amSm(0.025, 0.0, abs(a - ${f(A_PERI + 0.32)}) - 0.02);
  float band = clamp((0.8 * b1 + b2 + 0.85 * b3 + 0.55 * b4) * uPat.x, 0.0, 1.0);
  band *= 0.75 + 0.45 * amNoise(vec2(w * 4.0, a * 10.0) + seed * 9.0);
  // axial flames between the ribs, irregular
  float fl = amSm(0.55, 0.85, amFbm(vec2(w * 9.0 + seed * 4.0, a * 2.5))) * uPat.y;
  vec3 col = uGround * (0.9 + 0.2 * amNoise(vec2(w * 20.0, a * 30.0) + seed));
  col = mix(col, uBrown, clamp(band + fl * 0.6, 0.0, 0.95));
  // the granules white over everything; the grooves brown
  // (a granule in a band is tan, not white: the band runs through it, paler)
  col = mix(col, mix(uPale, mix(uGround, uBrown, 0.35), band), crest * (0.8 - 0.3 * band));
  col = mix(col, uBrown * 0.8, (1.0 - crest) * uPat.z * 0.55 * teleo);
  // the spire's tip: worn and darker, the protoconch smooth, glassy orange-pink
  float tipK = amSm(${f(S.whorls - S.protoconch - 0.6)}, ${f(S.whorls - S.protoconch + 0.2)}, w);
  col = mix(col, uTip, tipK);
  float wear = amSm(${f(S.whorls - 3.5)}, ${f(S.whorls - 1.5)}, w) * uPat2.y;
  col = mix(col, col * vec3(0.55, 0.52, 0.5) + vec3(0.03), wear * (0.5 + 0.5 * amNoise(vec2(w * 6.0, a * 20.0) + seed * 3.0)));
  // the film of diatoms and a little green alga, thicker in the grooves and on the spire
  float film = uPat.w * (0.55 + 0.45 * (1.0 - crest)) * (0.7 + 0.6 * amFbm(vec2(w * 5.0, a * 12.0) + seed * 7.0));
  col = mix(col, vec3(0.1, 0.12, 0.05), clamp(film * 0.55, 0.0, 0.8));
  // silt in the grooves
  float silt = uPat2.x * (1.0 - crest) * amSm(0.35, 0.75, amNoise(vec2(w * 30.0, a * 60.0) + seed * 2.0));
  col = mix(col, uAmSand * 0.9, silt * 0.7);
  amRough = 0.42 + 0.18 * film + 0.25 * silt + 0.15 * wear;
  // fine relief: growth lines along the ribs, spiral threads in the grooves, the shell's grain
  // (growth lines are uneven: their spacing and strength wander)
  float gp = w * ${f(S.ribs * 6)} + 5.4 * a + 1.5 * amNoise(vec2(w * 40.0, a * 3.0) + seed * 11.0);
  float gl = (0.5 + 0.5 * amNoise(vec2(w * 90.0, a * 9.0))) * sin(${f(TAU)} * gp) * (1.0 - amSm(0.2, 0.5, fwidth(gp)));
  float tp = a / ${f(S.cord / 4)} + 0.6 * amNoise(vec2(w * 25.0, a * 15.0));
  float th = sin(${f(TAU)} * tp) * (1.0 - crest) * (1.0 - amSm(0.2, 0.5, fwidth(tp)));
  vec2 gq = vec2(w * 260.0, a * 700.0);
  float grain = (amNoise(gq) - 0.5) * (1.0 - amSm(0.3, 0.8, length(fwidth(gq))));
  float micro = (0.0004 * gl + 0.0004 * th + 0.0006 * grain * (1.0 + 2.0 * wear)) * teleo;
  amH = (micro + (geoFine ? 0.0 : sc.x * detail)) * s * scale;
  if (part > 2.5) {
    // the far tier's foot: the pale, speckled skin
    col = vec3(0.55, 0.53, 0.47);
    amRough = 0.5; amH = 0.0;
  } else if (part > 1.5) {
    // the lip's edge: white, glazed
    col = mix(uPale * 1.1, vec3(0.86, 0.83, 0.76), 0.6);
    amRough = 0.25; amH = 0.0;
  } else if (part > 0.5) {
    // inside the aperture: brown-violet porcelain, the outer bands showing through, white toward the lip; dark deep in
    vec3 ins = mix(uInside, uInside * 0.45, band);
    ins = mix(ins, vec3(0.8, 0.77, 0.7), amSm(0.06, 0.0, w) * 0.85);
    col = ins;
    amRough = 0.22;
    amAO = exp(-w * 7.0);
    amH = 0.0;
  } else {
    // the callus: a white glaze
    col = mix(col, mix(uPale, vec3(0.86, 0.82, 0.72), 0.5), cal * 0.92);
    amRough = mix(amRough, 0.2, cal);
    // seen through the aperture (behind the lip), the parietal wall falls into the shadow of the whorl
    float x = ${f(TAU)} * (1.0 - w);
    // (only the part the next whorl covers: what shows of each spire whorl stays lit)
    amAO = mix(1.0, exp(min(x, 0.0) * 2.2), amSm(${f(A_COVER)}, ${f(A_COVER + 0.03)}, a));
  }
  // dusted with sand where it meets the bed
  float dust = uSandDust * amSm(0.0025, 0.0, vWPos.y - uSandY) * (0.6 + 0.4 * amNoise(vObj.xz * 4000.0));
  col = mix(col, uAmSand * 1.1, dust);
  amRough = mix(amRough, 0.9, dust);
  amThin = (part > 1.5 && part < 2.5) ? 0.3 : 0.08;
  diffuseColor.rgb = col * amAO;
  amCoat = mix(0.06, 0.6, uAmAir) * (1.0 - 0.7 * silt) * (1.0 - dust);
}
`;

const SHELL_BUMP = /* glsl */ `
normal = amBumpN(-vViewPosition, normal, amH);
`;
const COAT_NORMAL = /* glsl */ `
clearcoatNormal = normalize(mix(clearcoatNormal, normal, 0.6));
`;
/** calcite is a little translucent: light through the thin lip, and scattered just past the terminator */
const SHELL_LIGHT = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 L = amSunDir();
  float nl = dot(nW, L);
  float wrap = max(0.0, (nl + 0.35) / 1.35) - max(0.0, nl);
  totalEmissiveRadiance += diffuseColor.rgb * amSunCol() * wrap * 0.12 * RECIPROCAL_PI;
  float back = pow(clamp(dot(vW, L), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += amThin * diffuseColor.rgb * amSunCol() * back * 0.12;
}
`;

// ------------------------------------------------------------------ the soft parts

const SOFT_FRAG_PARS = /* glsl */ `
varying vec4 vSoft;
varying vec3 vObj;
uniform vec3 uSkin;
uniform vec3 uSpeck;
uniform vec4 uSkinPat;  // mottle, rings, seed, scale
uniform float uSandDust;
`;

/**
 * The skin: translucent grey-white to cream (yellowish in some), finely speckled with dark grey and black
 * melanophores, thicker on the foot's upper side and the siphon (dark rings and blotches on some), the sole paler; the
 * tentacles nearly clear with the black eye at the outer side of each base; the proboscis white to pink; the
 * operculum a thin amber horn plate with growth lines and a toothed edge. The mucus a thin wet gloss.
 */
const SOFT_SURFACE = /* glsl */ `
float amRough = 0.4, amCoat = 0.0, amAO = 1.0, amThin = 0.3, amSSS = 0.6, amH = 0.0, amAlpha = 1.0;
{
  float part = vSoft.x, u = vSoft.y, v = vSoft.z, thick = vSoft.w;
  float seed = uSkinPat.z;
  // skin coordinates in millimetres at the model size (the pigment cells are a tenth of a millimetre)
  vec2 q = vObj.xz * 1000.0;
  vec2 qs = vec2(vObj.x + vObj.y * 0.7, vObj.z - vObj.y * 0.5) * 1000.0;
  vec3 col = uSkin;
  float mel = 0.0, leu = 0.0;
  float tone = amFbm(q * 0.35 + seed * 5.0);
  if (part < 0.5) {
    // the foot: thin and milky at the margin (the sand shows through), denser and finely peppered over the back
    float top = amSm(0.1, 0.45, v);
    float rim = amSm(0.55, 0.95, thick);
    col = mix(uSkin * 1.05, uSkin * 0.92, top) * (0.92 + 0.16 * tone);
    mel = amDots(q * 3.2, 0.55 * uSkinPat.x * (0.25 + 0.75 * top) * (0.5 + tone), 0.18, 0.38, seed * 13.0);
    leu = amDots(q * 2.3 + 0.37, 0.25 * top, 0.15, 0.3, seed * 7.0 + 3.0);
    amThin = mix(0.85, 0.4, top) * (0.55 + 0.45 * rim);
    // clear as glass at the thin margin, milky over the middle
    amAlpha = mix(0.92, mix(0.38, 0.8, top), rim);
    // fine wrinkles break the mucus' highlights
    amH = (amNoise(q * 1.7) - 0.5) * 0.00002 + (amNoise(q * 5.0) - 0.5) * 0.000008;
  } else if (part < 1.5) {
    // the head and neck: grey-cream, peppered
    col *= 0.95 + 0.1 * tone;
    mel = amDots(qs * 3.0, 0.5 * uSkinPat.x, 0.18, 0.36, seed * 11.0);
    leu = amDots(qs * 2.0 + 0.5, 0.2, 0.15, 0.3, seed * 3.0);
    amThin = 0.45;
    amH = (amNoise(qs * 2.0) - 0.5) * 0.00001;
  } else if (part < 3.5) {
    // the tentacles: nearly clear, a little pepper toward the base; the eye
    col = uSkin * 1.1;
    mel = amDots(vec2(u * 50.0, v * 5.0), 0.45 * uSkinPat.x * amSm(0.7, 0.0, u), 0.2, 0.38, seed);
    amThin = 0.95;
    amAlpha = 0.85;
    if (thick < -0.5) { col = vec3(0.004, 0.004, 0.005); amThin = 0.0; amRough = 0.12; mel = 0.0; amAlpha = 1.0; }
  } else if (part < 4.5) {
    // the siphon: translucent grey, peppered, faintly ringed darker in some; the rim of its mouth pale
    float ring = amSm(0.6, 0.95, amNoise(vec2(u * 9.0, v * 1.5) + seed * 4.0)) * uSkinPat.y;
    col = uSkin * (0.88 + 0.12 * tone);
    col = mix(col, uSpeck * 2.5, ring * 0.3);
    mel = amDots(vec2(u * 120.0, v * 8.0), 0.55 * uSkinPat.x, 0.2, 0.4, seed * 3.0);
    leu = amDots(vec2(u * 80.0, v * 6.0) + 0.5, 0.2, 0.15, 0.3, seed * 5.0);
    col = mix(col, uSkin * 1.15, amSm(0.93, 1.0, u));
    amThin = 0.6;
  } else if (part < 5.5) {
    // the proboscis: white, a little pink where the blood shows
    col = mix(vec3(0.7, 0.6, 0.56), vec3(0.74, 0.5, 0.46), 0.35 + 0.3 * sin(u * 20.0 - uAmTime * 3.0));
    amThin = 0.7;
    amAlpha = 0.95;
  } else {
    // the operculum: thin amber horn, growth lines arcing round a nucleus near its front end, the toothed edge darker
    float r = length(vec2(u, v - 1.05));
    float lines = 0.5 + 0.5 * sin(r * 34.0 + amNoise(vec2(u, v) * 7.0) * 2.5);
    col = mix(vec3(0.15, 0.075, 0.02), vec3(0.22, 0.12, 0.035), lines * 0.6 + 0.2 * amNoise(vec2(u, v) * 20.0));
    col = mix(col, vec3(0.08, 0.04, 0.012), amSm(0.8, 1.05, length(vec2(u, v - 0.3))));
    amRough = 0.28; amThin = 0.35; amSSS = 0.2;
  }
  col = mix(col, uSpeck, clamp(mel, 0.0, 1.0) * 0.8);
  col = mix(col, vec3(0.62, 0.6, 0.55), clamp(leu, 0.0, 1.0) * 0.45);
  float dust = uSandDust * amSm(0.0025, 0.0, vWPos.y - uSandY);
  col = mix(col, uAmSand * 1.1, dust);
  amRough = mix(amRough, 0.9, dust);
  diffuseColor.rgb = col;
  diffuseColor.a = mix(amAlpha, 1.0, dust);
  amCoat = mix(0.04, 0.45, uAmAir) * (1.0 - dust);
}
`;

const SOFT_BUMP = /* glsl */ `
normal = amBumpN(-vViewPosition, normal, amH);
`;

/** living tissue: light scattered under the skin reaches past the terminator; thin parts glow with what is behind */
const SOFT_LIGHT = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 L = amSunDir();
  float nl = dot(nW, L);
  float wrap = max(0.0, (nl + 0.6) / 1.6) - max(0.0, nl);
  vec3 tissue = diffuseColor.rgb * vec3(1.0, 0.86, 0.72);
  totalEmissiveRadiance += tissue * amSunCol() * wrap * 0.3 * amSSS * RECIPROCAL_PI;
  totalEmissiveRadiance += tissue * amUnderwater(-nW, 1.0) * 0.05 * amSSS;
  // (what lies behind the thin tissue: under a foot seen from above, the sand)
  vec3 through = amUnderwater(-vW, 0.8);
  float back = pow(clamp(dot(-vW, L), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += amThin * mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.333))), 0.5) * (through * 0.45 + amSunCol() * back * 0.2);
}
`;

// ------------------------------------------------------------------ materials

export interface AmOwn {
  uGround: IUniform<Color>; uPale: IUniform<Color>; uBrown: IUniform<Color>; uInside: IUniform<Color>; uTip: IUniform<Color>;
  uPat: IUniform<Vector4>; uPat2: IUniform<Vector4>;
  uSkin: IUniform<Color>; uSpeck: IUniform<Color>; uSkinPat: IUniform<Vector4>;
  /** world height of the sand surface over a burrowing snail, and how much of it clings */
  uSandY: IUniform<number>; uSandDust: IUniform<number>;
}

/** the per-part pose of the soft parts (body.ts writes them every frame) */
export interface SoftPose {
  /** per part: a matrix (root frame) and four parameters (see body.ts) */
  uPartM: IUniform<import('three').Matrix4[]>;
  uPartP: IUniform<Vector4[]>;
  uFoot: IUniform<Vector4>;
  uFoot2: IUniform<Vector4>;
  uRetract: IUniform<Vector4>;
  uAperture: IUniform<Vector3>;
  uShellM: IUniform<import('three').Matrix4>;
  uTime: IUniform<number>;
}

export interface AramushiroMaterials {
  shell: MeshPhysicalMaterial;
  soft: MeshPhysicalMaterial;
  own: AmOwn;
  pose: SoftPose;
  dispose(): void;
}

function shellMaterial(own: AmOwn, pose: SoftPose): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.2 });
  m.name = 'AramushiroShell';
  m.envMapIntensity = 0.3;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AM_UNIFORMS, own, { uSkirt: pose.uRetract });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SHELL_VERT_PARS}\nuniform vec4 uSkirt;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vShell = aShell; vObj = position;
// the far tier's stand-in foot draws in with the animal
if (aShell.w > 10.5) transformed = mix(transformed, vec3(${f(LANDMARKS.aperture.x)}, ${f(LANDMARKS.aperture.y)}, ${f(LANDMARKS.aperture.z)}), uSkirt.z);`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>')
      .replace('void main() {', `${HELPERS}\n${SHELL_FNS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SHELL_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(amRough, 0.06, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${SHELL_BUMP}`)
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>\n${COAT_NORMAL}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${WET}`)
      .replace('#include <lights_fragment_begin>', CAUSTIC_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', SHELL_LIGHT);
  };
  m.customProgramCacheKey = () => 'aramushiro-shell-v1';
  return m;
}

function softMaterial(own: AmOwn, pose: SoftPose): MeshPhysicalMaterial {
  // (transparent: the foot's thin margin and the tentacles let the sand through)
  const m = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.22, specularIntensity: 0.5, transparent: true });
  m.name = 'AramushiroSoft';
  m.envMapIntensity = 0.2;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AM_UNIFORMS, own, pose);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SOFT_VERTEX_PARS}\nvarying vec3 vWPos;\nvarying vec3 vObj;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${SOFT_VERTEX}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = amPos; vObj = position;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SOFT_FRAG_PARS}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SOFT_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(amRough, 0.06, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${SOFT_BUMP}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${WET}`)
      .replace('#include <lights_fragment_begin>', CAUSTIC_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', SOFT_LIGHT);
  };
  m.customProgramCacheKey = () => 'aramushiro-soft-v1';
  return m;
}

/** An individual's materials: its own colours and pose uniforms; programs shared with every other snail. */
export function aramushiroMaterials(look: Look, scale: number, pose: SoftPose): AramushiroMaterials {
  const own: AmOwn = {
    uGround: { value: look.ground.clone() }, uPale: { value: look.pale.clone() }, uBrown: { value: look.brown.clone() },
    uInside: { value: look.inside.clone() }, uTip: { value: look.tip.clone() },
    uPat: { value: new Vector4(look.bands, look.flames, look.grooves, look.film) },
    uPat2: { value: new Vector4(look.silt, look.erosion, look.seed, scale) },
    uSkin: { value: look.skin.clone() }, uSpeck: { value: look.speck.clone() },
    uSkinPat: { value: new Vector4(look.mottle, look.rings, look.seed, scale) },
    uSandY: { value: -1e4 }, uSandDust: { value: 0 },
  };
  const shell = shellMaterial(own, pose), soft = softMaterial(own, pose);
  return { shell, soft, own, pose, dispose: () => { shell.dispose(); soft.dispose(); } };
}

/** A look from a colour form, varied a little by the seed. */
export function lookFor(morph: number, seed: number): Look {
  const m = MORPHS[((morph % MORPHS.length) + MORPHS.length) % MORPHS.length];
  const v = (col: Color, i: number, k = 0.12) => col.clone().multiplyScalar(1 + k * Math.sin(seed * 91.7 + i * 2.3));
  const j = (x: number, i: number) => Math.max(0, Math.min(1, x + 0.15 * Math.sin(seed * 57.3 + i * 1.7)));
  return {
    ground: v(m.ground, 1), pale: v(m.pale, 2, 0.06), brown: v(m.brown, 3, 0.2), inside: v(m.inside, 4), tip: v(m.tip, 5),
    skin: v(m.skin, 6, 0.08), speck: m.speck.clone(),
    bands: j(m.bands, 1), flames: j(m.flames, 2), grooves: j(m.grooves, 3), film: j(m.film, 4), silt: j(m.silt, 5), erosion: j(m.erosion, 6),
    mottle: j(m.mottle, 7), rings: j(m.rings, 8), seed: seed % 1,
  };
}

let lastTick = -1;
/** advance the shared clock (caustics, the proboscis' pulse) */
export function tickAramushiroMaterials(seconds: number): void {
  if (seconds === lastTick) return;
  lastTick = seconds;
  AM_UNIFORMS.uAmTime.value = seconds % 3600;
}
