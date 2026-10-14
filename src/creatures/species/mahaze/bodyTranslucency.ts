import { DataTexture, NoColorSpace, RGBAFormat, SRGBColorSpace, Vector2, Vector3, Vector4, type IUniform, type Material, type MeshPhysicalMaterial, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { createProfileTexture } from './hero/BodyMaterial.js';

/**
 * The goby's translucent body on the flat and in the tank (every tier but the observed hero, which has the volumetric
 * ShaderMaterial of ./hero): the glTF's standard material keeps its colour, relief, wet gloss and lighting, and is
 * given the hero's light path through the tissue in a lighter form, worked in through onBeforeCompile.
 *
 * Per pixel, in the fish's rest frame (the analytic body volume that ships in the glTF extras, as in the hero):
 *  - the view ray enters the skin, is refracted (water → tissue) and runs to the far surface of the volume; along it
 *    the tissue's extinction, the denser head and jaws, the blood of the gills and the organs (vertebral column,
 *    liver, gut, the dark peritoneum, kidney, heart, brain, otoliths, as ellipsoid chords) take out the light from
 *    behind, and the chromatophores filter it where it enters and where it leaves the body
 *  - what is left is the background seen through the fish: the body is blended over the scene (no uniform opacity:
 *    thin tail and fin bases clear, head and belly milky, the melanophores and the organs dark against the light)
 *  - the sun (and in the tank its two lamps) behind the fish diffuses through the tissue on the light's path, so a
 *    fish against the light glows amber at its thin parts and shows its spine and viscera as shadows
 *  - the surroundings' light (the water's glow, the sky's window, the sand's bounce) arrives from every side, so it
 *    diffuses through from the far side too: seen from the sun's side the body is still faintly see-through
 *  - organs just under the skin darken its colour (the peritoneum through the belly wall), and the vertebral column
 *    scatters a little light back toward the eye
 * The near tiers march 12 + 6 steps per ray, the far tier (lod2) 6 + 3 and only the large organs. The body still writes
 * depth, so fins behind the thick parts do not show through; fins sort against the body by their own centres.
 */

/** organ template (from the マハゼ juvenile the hero's organs were placed in): position along the standard length, height
 * in the section's upper or lower half-height from its centre line, side in the half-width; radii in the same units;
 * absorption per mm (rgb). Mapped onto each GLB's own profile, so every growth form has its organs in place. */
const ORGANS: { s: number; y: number; z: number; rs: number; ry: number; rz: number; k: [number, number, number] }[] = [
  { s: 0.327, y: -0.551, z: 0.064, rs: 0.046, ry: 0.304, rz: 0.589, k: [1.3, 2.3, 2.9] },    // liver
  { s: 0.437, y: -0.604, z: -0.035, rs: 0.09, ry: 0.286, rz: 0.477, k: [1.0, 1.4, 2.3] },    // stomach + gut
  { s: 0.412, y: -0.224, z: 0, rs: 0.132, ry: 0.086, rz: 0.602, k: [3.8, 4.0, 4.2] },        // dark peritoneum roof
  { s: 0.41, y: -0.086, z: 0, rs: 0.141, ry: 0.063, rz: 0.11, k: [0.8, 2.6, 2.6] },          // kidney under the column
  { s: 0.249, y: -0.729, z: 0, rs: 0.017, ry: 0.151, rz: 0.181, k: [0.5, 4.0, 3.6] },        // heart
  { s: 0.166, y: 0.431, z: 0, rs: 0.059, ry: 0.25, rz: 0.249, k: [0.15, 0.2, 0.3] },         // brain
  { s: 0.202, y: 0.171, z: 0.234, rs: 0.008, ry: 0.063, rz: 0.033, k: [6, 6, 6] },           // otoliths
  { s: 0.202, y: 0.171, z: -0.234, rs: 0.008, ry: 0.063, rz: 0.033, k: [6, 6, 6] },
];
const N_ORGANS = ORGANS.length;
/** the standard length the hero's fixed millimetre figures (head, gills, column) were set for */
const REF_SL = 41;

type V3 = [number, number, number];
interface Profile { n: number; data: number[] }
interface Frame { S0: number; Y0: number; SL: number; SEND: number; jaws?: number[] }
/** the volumetric shader's anatomy as a species' build tool writes it into the body's extras (エドハゼ) */
interface ShippedAnatomy {
  sigS?: number; sigA?: V3; headWin?: [number, number]; gillWin?: [number, number, number, number]; gillK?: V3;
  gillHn?: [number, number, number, number]; spine?: V3; jaw?: [number, number, number, number];
  organs?: { name: string; c: V3; r: V3; k: V3 }[];
}
/** a goby GLB's packed maps and how its patterns and colour morphs are made from them (tools/lib/gobyLod.mjs) */
export interface GobyLodPacking {
  packing: 1;
  /** the individual's variant (any integer, taken modulo this): pattern ⌊i / colours⌋, colour i mod colours */
  variants: number;
  colours: number;
  /** patterns the melanin map holds (the far tier: only the first) */
  patternChannels: number;
  melRGB: V3;
  /** how the maps store the melanin: its density (the observed fish), or its darkening exp(-mel · melRGB.g) sRGB-encoded */
  melanin?: 'density' | 'darkening';
  /** マハゼ: the colour morphs (the first is the standard colour the albedo map is baked in) */
  morphs?: { name: string; base: V3; dors: V3; belly: V3; melK: number; melAdd: number; xanK: number; iriK: number; finTint: V3; finMelK: number }[];
  bellyRamp?: [number, number];
  /** the far tier's mean iridophores and xanthophores */
  far?: { iri: number; xan: number };
}
export interface GobyBodyExtras {
  role: string;
  pigmentTexture?: number;
  lod?: GobyLodPacking;
  profile?: Profile;
  fishFrame?: Frame;
  vertebrae?: { start: number; count: number };
  anatomy?: ShippedAnatomy;
}

export interface Organ { c: Vector3; r: Vector3; k: Vector3; /** scattering per mm: hides what is behind without darkening */ s: number }
/** what the shader needs of one body's tissue and organs (fish frame: s from the snout, y up, z to the left; mm) */
export interface GobyAnatomy {
  /** scattering (1/mm) and absorption (1/mm, rgb) of the tissue */
  sigS: number;
  sigA: V3;
  /** where the dense head (skull, brain case, jaws) fades out */
  head: [number, number];
  /** the gill filaments under the cover: s rise, rise, fall, fall; height in the section the same; absorption */
  gill: [number, number, number, number];
  gillHn: [number, number, number, number];
  gillK: V3;
  /** the vertebral column: first centrum, last; its radius is scaled by this */
  column: [number, number];
  columnScale: number;
  jaws: [number, number, number, number];
  organs: Organ[];
}

/** the profile's section (centre line, upper / lower half-height, half-width) at s mm from the snout */
function sectionAt(p: Profile, f: Frame, s: number): { yc: number; t: number; b: number; w: number } {
  const u = Math.min(Math.max(s / f.SEND, 0), 1) * (p.n - 1);
  const i = Math.min(Math.floor(u), p.n - 2), k = u - i;
  const r = (c: number) => p.data[i * 6 + c] * (1 - k) + p.data[(i + 1) * 6 + c] * k;
  return { yc: r(0), t: r(1), b: r(2), w: r(3) };
}

/** The マハゼ organs as ellipsoids in the fish frame of one body (its own profile). */
export function organsFor(p: Profile, f: Frame): Organ[] {
  return ORGANS.map((o) => {
    const s = o.s * f.SL;
    const q = sectionAt(p, f, s);
    const y = q.yc + o.y * (o.y > 0 ? q.t : q.b);
    return { c: new Vector3(s, y, o.z * q.w), r: new Vector3(o.rs * f.SL, o.ry * (q.t + q.b) * 0.5, o.rz * q.w), k: new Vector3(...o.k), s: 0 };
  });
}

const organ = (c: V3, r: V3, k: V3, s = 0): Organ => ({ c: new Vector3(...c), r: new Vector3(...r), k: new Vector3(...k), s });
/**
 * ヒメハゼ: its GLBs carry no anatomy; these are its build tool's (tools/models/himehaze: anatomy.mjs organs(),
 * fish-species.mjs TISSUE and LANDMARKS). Paler, clearer tissue than the マハゼ; the peritoneum is silvery white
 * (no gut outline in any photo): it hides the gut by scattering, it does not darken the belly.
 */
const HIMEHAZE = {
  sigS: 0.75, sigA: [0.016, 0.03, 0.07] as V3, head: [8.385, 10.75] as [number, number], gill: [6.665, 8.17, 9.46, 10.535] as [number, number, number, number],
  columnEnd: 42.57,
  organs: () => [
    organ([12.85, 1.82, 0.23], [1.8, 1.1, 2.4], [1.3, 2.3, 2.9]),          // liver
    organ([18.07, 1.82, -0.09], [3.77, 0.91, 1.57], [1.0, 1.4, 2.3]),      // gut
    organ([17.07, 2.98, 0], [5.6, 0.28, 2.14], [0.15, 0.15, 0.15], 9.0),   // white peritoneum
    organ([17.07, 3.42, 0], [6.0, 0.2, 0.39], [0.8, 2.6, 2.6]),            // kidney
    organ([8.85, 1.11, 0], [0.62, 0.45, 0.55], [0.5, 4.0, 3.6]),           // heart
    organ([5.87, 4.38, 0], [2.1, 0.68, 0.72], [0.15, 0.2, 0.3]),           // brain
    organ([7.17, 3.62, 0.72], [0.3, 0.19, 0.1], [6, 6, 6]),                // otoliths
    organ([7.17, 3.62, -0.72], [0.3, 0.19, 0.1], [6, 6, 6]),
  ],
};
const DEFAULT_JAWS: [number, number, number, number] = [3.0, 4.6, 2.4, 3.2];
/** the hero's gill blood (absorption at its default interior strength) and the height band it lies in */
const GILL_K: V3 = [0.0077, 0.1285, 0.109];
const GILL_HN: [number, number, number, number] = [-1.0, -0.6, -0.1, 0.45];

/** The tissue and organs of one goby body: its GLB's own anatomy where it ships one, else its species' or the マハゼ's. */
export function anatomyFor(name: string, x: GobyBodyExtras): GobyAnatomy {
  const f = x.fishFrame!, p = x.profile!, sc = f.SL / REF_SL;
  const vStart = x.vertebrae?.start ?? 0.266 * f.SL;
  const a = x.anatomy;
  if (a?.organs?.length) {
    return {
      sigS: a.sigS ?? 1.35, sigA: a.sigA ?? [0.02, 0.048, 0.12], head: a.headWin ?? [8.5 * sc, 11.5 * sc],
      gill: a.gillWin ?? [7.2 * sc, 8.6 * sc, 10.3 * sc, 11.3 * sc], gillHn: a.gillHn ?? GILL_HN, gillK: a.gillK ?? GILL_K,
      column: [vStart, a.spine?.[1] ?? 0.99 * f.SL], columnScale: sc, jaws: a.jaw ?? (f.jaws as typeof DEFAULT_JAWS | undefined) ?? DEFAULT_JAWS,
      organs: a.organs.slice(0, N_ORGANS).map((o) => organ(o.c, o.r, o.k)),
    };
  }
  if (/^Himehaze/i.test(name)) {
    return {
      sigS: HIMEHAZE.sigS, sigA: HIMEHAZE.sigA, head: HIMEHAZE.head, gill: HIMEHAZE.gill, gillHn: GILL_HN, gillK: GILL_K,
      column: [vStart, HIMEHAZE.columnEnd], columnScale: sc, jaws: DEFAULT_JAWS, organs: HIMEHAZE.organs(),
    };
  }
  return {
    sigS: 1.35, sigA: [0.02, 0.048, 0.12], head: [8.5 * sc, 11.5 * sc], gill: [7.2 * sc, 8.6 * sc, 10.3 * sc, 11.3 * sc], gillHn: GILL_HN, gillK: GILL_K,
    column: [vStart, 40.6 * sc], columnScale: sc, jaws: (f.jaws as typeof DEFAULT_JAWS | undefined) ?? DEFAULT_JAWS, organs: organsFor(p, f),
  };
}

const VERT_PARS = /* glsl */ `
varying vec3 vGbRest;
varying vec3 vGbWPos;
varying mat3 vGbToWorld;
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vGbRest;
varying vec3 vGbWPos;
varying mat3 vGbToWorld;
uniform sampler2D uGbProfile;
uniform sampler2D uGbPigment;
uniform vec4 uGbFrame;        // S0, Y0, SL, SEND (mm)
uniform vec4 uGbJaws;         // dense lip and jaw tissue: s ramp (x → y), height ramp (z → w)
uniform vec4 uGbColumn;       // vertebral column: first centrum, last (mm), radius scale, length of a vertebra (mm)
uniform vec3 uGbSigE;         // extinction of the background per mm: absorption + scattering out of the forward cone
uniform vec3 uGbSigL;         // diffusion attenuation of the light per mm
uniform vec2 uGbHead;         // the dense head fades out over s
uniform vec4 uGbGill;         // gill filaments under the cover: s rise, rise, fall, fall
uniform vec4 uGbGillHn;       // … and their height in the section
uniform vec3 uGbGillK;        // … and their blood's absorption per mm
uniform vec4 uGbOrgC[${N_ORGANS}];  // organ centre (mm), scattering per mm
uniform vec3 uGbOrgR[${N_ORGANS}];
uniform vec3 uGbOrgK[${N_ORGANS}];
uniform float uGbInterior;    // how much the organs and the column show
uniform float uGbBack;        // strength of the light diffused through from behind
uniform float uGbAmbient;     // strength of the surroundings' light diffused through from the far side
#ifdef GB_PACKED
uniform vec3 uGbPatSel;       // the individual's pattern: its channel of the melanin map
uniform vec3 uGbMelRGB;       // how the melanin darkens the albedo (exp(-mel · this), as the bake applies it)
uniform vec2 uGbFarPig;       // far tier: mean iridophores and xanthophores (it has no map for them)
#ifdef GB_MORPH
uniform vec3 uGbMorphC[3];    // the individual's colour morph: tissue of the flank, the back and the belly
uniform vec3 uGbStdC[3];      // … and of the standard colour, which the albedo map is baked in
uniform vec4 uGbMorphK;       // melanophore factor, dusky layer over the back, xanthophore and iridophore factors
uniform vec2 uGbBelly;        // the pale belly's height ramp
#endif
#endif
`;

const FUNCTIONS = /* glsl */ `
#ifdef GB_LOW
  #define GB_STEPS 6
  #define GB_BISECT 3
  #define GB_ORGANS 3
#else
  #define GB_STEPS 12
  #define GB_BISECT 6
  #define GB_ORGANS ${N_ORGANS}
#endif
#define GB_PROFILE_N 512.0
// the skin's UV: the base colour map's (always there on these bodies, and kept when a material is cloned, which
// resets the custom defines); USE_UV only for a body without one
#ifdef USE_MAP
  #define GB_UV vMapUv
#else
  #define GB_UV vUv
#endif
vec3 gbToFish(vec3 o) { return vec3(uGbFrame.x - o.z * 1000.0, o.y * 1000.0 + uGbFrame.y, o.x * 1000.0); }
vec3 gbDirToFish(vec3 o) { return vec3(-o.z, o.y, o.x); }
struct GbSec { float yc; float t; float b; float w; float nT; float nB; };
GbSec gbSection(float s) {
  float x = (clamp(s / uGbFrame.w, 0.0, 1.0) * (GB_PROFILE_N - 1.0) + 0.5) / GB_PROFILE_N;
  vec4 a = texture2D(uGbProfile, vec2(x, 0.25));
  vec4 c = texture2D(uGbProfile, vec2(x, 0.75));
  return GbSec(a.x, a.y, a.z, a.w, c.x, c.y);
}
// normalised superellipse radius (1: the body's surface)
float gbBodyR(vec3 p) {
  if (p.x <= 0.02 || p.x >= uGbFrame.w - 0.02) return 4.0;
  GbSec q = gbSection(p.x);
  float dy = p.y - q.yc;
  bool up = dy > 0.0;
  float n = up ? q.nT : q.nB;
  float a = pow(abs(p.z) / max(q.w, 1e-3), n) + pow(abs(dy) / max(up ? q.t : q.b, 1e-3), n);
  return pow(a, 1.0 / n);
}
float gbExit(vec3 p, vec3 d, float maxLen) {
  float stepL = maxLen / float(GB_STEPS);
  float lo = 0.0, hi = maxLen;
  bool found = false;
  for (int i = 1; i <= GB_STEPS; i++) {
    float t = stepL * float(i);
    if (gbBodyR(p + d * t) > 1.0) { hi = t; found = true; break; }
    lo = t;
  }
  if (!found) return maxLen;
  for (int i = 0; i < GB_BISECT; i++) {
    float m = 0.5 * (lo + hi);
    if (gbBodyR(p + d * m) > 1.0) hi = m; else lo = m;
  }
  return 0.5 * (lo + hi);
}
// skin UV of a point on the loft (inverse of its parameterisation)
vec2 gbFishUV(vec3 p) {
  GbSec q = gbSection(p.x);
  float dy = p.y - q.yc;
  bool up = dy > 0.0;
  float n = up ? q.nT : q.nB;
  float a = sign(p.z) * pow(abs(p.z) / max(q.w, 1e-3), n * 0.5);
  float c = -sign(dy) * pow(abs(dy) / max(up ? q.t : q.b, 1e-3), n * 0.5);
  float phi = atan(a, c);
  if (phi < 0.0) phi += 2.0 * PI;
  return vec2(clamp(p.x / uGbFrame.w, 0.0, 1.0), phi / (2.0 * PI));
}
// chromatophore filter of the skin (melanin, iridophores, xanthophores)
vec3 gbSkinT(vec3 pig) {
  return exp(-pig.r * vec3(3.4, 3.8, 4.3)) * exp(-pig.b * vec3(0.02, 0.12, 0.5)) * (1.0 - 0.45 * pig.g);
}
#ifdef GB_PACKED
// the packed maps (tools/lib/gobyLod.mjs): the albedo map holds the standard colour without the melanin (alpha: the
// xanthophores, on the far tier the melanin), the pigment map the melanin of every pattern (rgb) and the iridophores
// (alpha). The distance tiers store the melanin as the darkening it gives, exp(-mel · melRGB.g), sRGB-encoded (the
// pigment map is an sRGB texture: decoded before it is filtered, so the filter averages darkening; the far tier's alpha
// is decoded here), and gbMel takes the density back out. The observed fish's maps (GB_MEL_DENSITY) store the density,
// and its albedo averages the darkening over four finer taps (gbDark4). The individual's pattern picks its melanin; its
// colour morph scales the pigments as the bake does.
#ifdef GB_MEL_DENSITY
float gbMel(float m) { return m; }
#else
float gbMel(float dark) { return clamp(-log(max(dark, 0.002)) / uGbMelRGB.y, 0.0, 1.0); }
#endif
float gbSrgb(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float gbHn(vec3 p) {
  GbSec q = gbSection(clamp(p.x, 0.05, uGbFrame.w - 0.05));
  float dy = p.y - q.yc;
  return clamp(dy / max(dy > 0.0 ? q.t : q.b, 1e-3), -1.2, 1.2);
}
// raw densities (melanin, iridophores, xanthophores) from the albedo map's and the pigment map's texels
vec3 gbRawPig(vec4 A, vec4 B) {
#ifdef GB_LOW
  return vec3(gbMel(gbSrgb(A.a)), uGbFarPig.x, uGbFarPig.y);
#else
  return vec3(gbMel(dot(B.rgb, uGbPatSel)), B.a, A.a);
#endif
}
// … in the individual's colour morph (more melanophores and a dusky layer over the back, other yellows and silvers)
vec3 gbMorphPig(vec3 raw, float hn) {
#ifdef GB_MORPH
  float belly = smoothstep(uGbBelly.x, uGbBelly.y, hn);
  float mel = 1.0 - pow(1.0 - clamp(raw.x, 0.0, 1.0), uGbMorphK.x) * (1.0 - uGbMorphK.y * (1.0 - belly));
  return vec3(mel, clamp(raw.y * uGbMorphK.w, 0.0, 1.0), raw.z * uGbMorphK.z);
#else
  return raw;
#endif
}
#ifdef GB_MEL_DENSITY
// the albedo's darkening by the individual's melanin, averaged over four taps one mip finer: a texture filter averages
// the density, but the albedo averaged the darkening when the melanin was baked into it
vec3 gbDark4(vec2 uv, vec2 gdx, vec2 gdy, float hn) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i == 1 || i == 3 ? 0.25 : -0.25, i >= 2 ? 0.25 : -0.25);
    float m = dot(textureGrad(uGbPigment, uv + gdx * o.x + gdy * o.y, gdx * 0.5, gdy * 0.5).rgb, uGbPatSel);
    d += exp(-gbMorphPig(vec3(m, 0.0, 0.0), hn).x * uGbMelRGB);
  }
  return d * 0.25;
}
#endif
vec3 gbPigAt(vec3 p, vec2 uv, float lod) {
#ifdef GB_LOW
  vec4 B = vec4(0.0);
#else
  vec4 B = textureLod(uGbPigment, uv, lod);
#endif
  return gbMorphPig(gbRawPig(textureLod(map, uv, lod), B), gbHn(p));
}
#ifdef GB_MORPH
// the tissue's colour under the melanin: flank, darker back, milky belly, yellowed by the xanthophores and silvered
// by the iridophores (the bake's shading before the melanin darkens it)
vec3 gbTissue(vec3 flank, vec3 back, vec3 belly, float hn, float X, float I) {
  vec3 c = mix(mix(flank, back, smoothstep(-0.2, 0.8, hn) * 0.6), belly, smoothstep(uGbBelly.x, uGbBelly.y, hn));
  c *= mix(vec3(1.0), vec3(1.02, 0.9, 0.55), X * 0.6);
  return mix(c, vec3(0.78, 0.77, 0.7), I * 0.4);
}
#endif
#else
vec3 gbPigAt(vec3 p, vec2 uv, float lod) { return textureLod(uGbPigment, uv, lod).rgb; }
#endif
float gbErf(float x) { return tanh(1.2025 * x); }
// chord through a uniform ellipsoid, softened toward its rim
float gbEll(vec3 o, vec3 d, float L, vec3 c, vec3 r, inout float tFirst) {
  vec3 oo = (o - c) / r, dd = d / r;
  float a = dot(dd, dd), b = dot(oo, dd), cc = dot(oo, oo) - 1.0;
  float disc = b * b - a * cc;
  if (disc <= 0.0) return 0.0;
  float sq = sqrt(disc);
  float a0 = clamp((-b - sq) / a, 0.0, L), a1 = clamp((-b + sq) / a, 0.0, L);
  if (a1 <= a0) return 0.0;
  tFirst = min(tFirst, a0);
  float h2 = clamp(cc + 1.0 - b * b / a, 0.0, 1.0);
  return (a1 - a0) * sqrt(1.0 - h2);
}
// Gaussian tube along the vertebral column, denser at the centrum rims
float gbSpine(vec3 o, vec3 d, float L, inout float tFirst) {
  GbSec q = gbSection(clamp(o.x, uGbColumn.x, uGbColumn.y));
  float spineY = q.yc + 0.06 * q.t;
  vec2 dp = d.yz;
  float dd = max(dot(dp, dp), 0.02);
  float tc = 0.0, sc = 0.0;
  for (int k = 0; k < 2; k++) {
    tc = -dot(o.yz - vec2(spineY, 0.0), dp) / dd;
    sc = o.x + d.x * clamp(tc, 0.0, L);
    GbSec qs = gbSection(clamp(sc, uGbColumn.x, uGbColumn.y));
    spineY = qs.yc + 0.06 * qs.t;
  }
  vec2 cpt = o.yz - vec2(spineY, 0.0) + dp * tc;
  float u = clamp((sc - uGbColumn.x) / (uGbColumn.y - uGbColumn.x), 0.0, 1.0);
  float r = mix(0.34, 0.17, u) * uGbColumn.z;
  float sig = r / sqrt(dd);
  float g = exp(-dot(cpt, cpt) / (r * r)) * sig * 0.8862 * (gbErf((L - tc) / sig) - gbErf(-tc / sig));
  float win = smoothstep(uGbColumn.x - 0.4, uGbColumn.x + 0.4, sc) * (1.0 - smoothstep(uGbColumn.y - 0.4, uGbColumn.y + 0.4, sc));
  float rim = smoothstep(0.3, 0.48, abs(fract((sc - uGbColumn.x) / uGbColumn.w) - 0.5));
  if (g * win > 0.02) tFirst = min(tFirst, max(tc - sig, 0.0));
  return g * win * (0.7 + 0.6 * rim);
}
// absorption optical depth (rgb) of the column and the organs along o + d t, t in [0, L], and the scattering one of the
// pale organs (a silvery peritoneum hides what is behind it without darkening); tFirst: first organ hit
vec3 gbOrgans(vec3 o, vec3 d, float L, out float tFirst, out float spine, out float scat) {
  tFirst = 1e3;
  scat = 0.0;
  spine = gbSpine(o, d, L, tFirst);
  vec3 tau = spine * vec3(4.0, 4.4, 5.0);
  for (int i = 0; i < GB_ORGANS; i++) {
    float ch = gbEll(o, d, L, uGbOrgC[i].xyz, uGbOrgR[i], tFirst);
    tau += ch * uGbOrgK[i];
    scat += ch * uGbOrgC[i].w;
  }
  return tau;
}
float gbHG(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
// light from one direction (world, toward the light) diffused through the tissue to the point pIn
vec3 gbThrough(vec3 LW, vec3 col, mat3 w2o, vec3 pIn, vec3 NgF, vec3 VW, vec3 skinIn, float maxLen, float dense) {
  vec3 LF = normalize(gbDirToFish(w2o * LW));
  float backW = smoothstep(0.35, -0.2, dot(NgF, LF));
  if (backW < 0.001) return vec3(0.0);
  float dL = gbExit(pIn, LF, maxLen);
  // diffusion attenuation sqrt(3 sa (sa + ss (1 - g))) of the tissue per mm, more in the dense head and jaws
  vec3 tauL = uGbSigL * dL * (1.0 + dense);
  float tF, sp, scL;
  vec3 orgL = gbOrgans(pIn, LF, dL, tF, sp, scL);
  tauL += (orgL + scL * 0.3) * (0.5 + uGbInterior);
  vec3 skinL = gbSkinT(gbPigAt(pIn + LF * dL, gbFishUV(pIn + LF * dL), 2.0));
  float ph = mix(1.0, 4.0 * PI * gbHG(dot(-LW, -VW), 0.45), 0.55);
  return col * exp(-tauL) * skinIn * skinL * ph * backW * uGbBack;
}
`;

/** the light path through the body, after the normal maps (vNormal: the interpolated view-space normal) */
const THROUGH = /* glsl */ `
#include <emissivemap_fragment>
vec3 gbAdd = vec3(0.0);
float gbAlpha = 1.0;
{
  mat3 w2o = inverse(vGbToWorld);
  vec3 pF = gbToFish(vGbRest);
  vec3 NgW = normalize(inverseTransformDirection(normalize(vNormal), viewMatrix));
  vec3 VW = normalize(vGbWPos - cameraPosition);
  vec3 NgF = normalize(gbDirToFish(w2o * NgW));
  vec3 VF = normalize(gbDirToFish(w2o * VW));
  GbSec q0 = gbSection(clamp(pF.x, 0.05, uGbFrame.w - 0.05));
  float maxLen = clamp(max(2.0 * q0.w, q0.t + q0.b) * 2.2, 1.2, 16.0);
  vec3 pIn = pF - NgF * 0.015;
  // refracted into the tissue (relative index 1.04), kept from grazing straight back out at the outline
  vec3 R = refract(VF, NgF, 1.0 / 1.04);
  if (dot(R, R) < 0.5) R = VF;
  if (dot(R, NgF) > -0.25) R = normalize(R - NgF * (dot(R, NgF) + 0.25));
  float tExit = max(gbExit(pIn, R, maxLen), min(maxLen, 0.6));
  vec3 xE = pIn + R * tExit;
  float sMid = 0.5 * (pIn.x + xE.x);
  // the head is denser (skull, brain case, jaws); the gill filaments under the operculum are red with blood
  float head = 1.0 - smoothstep(uGbHead.x, uGbHead.y, sMid);
  float hn = (pF.y - q0.yc) / max(pF.y > q0.yc ? q0.t : q0.b, 1e-3);
  float gill = smoothstep(uGbGill.x, uGbGill.y, sMid) * (1.0 - smoothstep(uGbGill.z, uGbGill.w, sMid))
             * smoothstep(uGbGillHn.x, uGbGillHn.y, hn) * (1.0 - smoothstep(uGbGillHn.z, uGbGillHn.w, hn)) * smoothstep(0.25, 0.6, abs(pF.z) / max(q0.w, 1e-3));
  vec3 sigE = uGbSigE + head * vec3(0.278, 0.286, 0.3) + gill * uGbGillK;
  vec3 tau = sigE * tExit;
  float tOrg, spine, scat;
  vec3 tauOrg = gbOrgans(pIn, R, tExit, tOrg, spine, scat) * (0.5 + uGbInterior);
  tau += tauOrg + scat * 0.6;
  // sculpted parts outside the analytic volume (orbit rims, lips) and the lip rolls are solid tissue
  float outside = smoothstep(0.98, 1.1, gbBodyR(pIn));
  float jaws = (1.0 - smoothstep(uGbJaws.x, uGbJaws.y, pF.x)) * (1.0 - smoothstep(uGbJaws.z, uGbJaws.w, pF.y));
  outside = max(outside, 0.8 * jaws);
  tau += outside * 4.0 + jaws * vec3(6.0, 7.0, 7.5);
  // chromatophores where the light leaves the body and where it enters it (seam-free derivatives at the ventral wrap)
  vec2 uvA = GB_UV, uvB = vec2(GB_UV.x, fract(GB_UV.y + 0.5));
  vec2 dxA = dFdx(uvA), dyA = dFdy(uvA), dxB = dFdx(uvB), dyB = dFdy(uvB);
  vec2 gbDx = dot(dxA, dxA) < dot(dxB, dxB) ? dxA : dxB, gbDy = dot(dyA, dyA) < dot(dyB, dyB) ? dyA : dyB;
#ifdef GB_PACKED
#ifdef GB_LOW
  vec4 gbB = vec4(0.0);
#else
  vec4 gbB = textureGrad(uGbPigment, GB_UV, gbDx, gbDy);
#endif
  vec3 gbRaw = gbRawPig(sampledDiffuseColor, gbB);
  float hnS = clamp(hn, -1.2, 1.2);
  vec3 pig = gbMorphPig(gbRaw, hnS);
  // the albedo map is the standard colour without the melanin: the individual's colour morph, then its melanin
#ifdef GB_MORPH
  diffuseColor.rgb *= gbTissue(uGbMorphC[0], uGbMorphC[1], uGbMorphC[2], hnS, pig.b, pig.g)
                    / max(gbTissue(uGbStdC[0], uGbStdC[1], uGbStdC[2], hnS, gbRaw.z, gbRaw.y), vec3(1e-3));
#endif
#ifdef GB_MEL_DENSITY
  diffuseColor.rgb *= gbDark4(GB_UV, gbDx, gbDy, hnS);
#else
  diffuseColor.rgb *= exp(-pig.r * uGbMelRGB);
#endif
#else
  vec3 pig = textureGrad(uGbPigment, GB_UV, gbDx, gbDy).rgb;
#endif
  vec3 skinIn = gbSkinT(pig);
  vec3 skinOut = gbSkinT(gbPigAt(xE, gbFishUV(xE), 2.0));
  vec3 T = exp(-tau) * skinIn * skinOut;
  // the caudal blade thins to a film over the fin-ray bases
  float endFade = smoothstep(uGbFrame.w - 1.6, uGbFrame.w - 0.15, pF.x) * 0.92;
  T = mix(T, mix(vec3(1.0), skinIn, 0.6), endFade);
  gbAlpha = clamp(1.0 - dot(T, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  // organs close under the skin darken its colour (the dark peritoneum through the belly wall)
  vec3 tauNear = min(tauOrg, vec3(1.6)) * exp(-tOrg * 0.6) * 0.22;
  diffuseColor.rgb *= exp(-tauNear * 0.8);
  // the light that comes through the body from behind it
  float dense = head * 0.8 + outside * 6.0;
#if NUM_DIR_LIGHTS > 0
  gbAdd += gbThrough(normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix)), directionalLights[0].color, w2o, pIn, NgF, VW, skinIn, maxLen, dense);
#endif
#if NUM_DIR_LIGHTS > 1 && !defined(GB_LOW)
  gbAdd += gbThrough(normalize(inverseTransformDirection(directionalLights[1].direction, viewMatrix)), directionalLights[1].color, w2o, pIn, NgF, VW, skinIn, maxLen, dense);
#endif
  // the light of everything round the far side (the water's glow, the sky through the surface, the sand's bounce)
  // reaches the body from every direction and diffuses through it: whichever side the sun is on, the thin parts are
  // lit faintly from behind and the column and the viscera show in them as shadows
  vec3 gbFar = ambientLightColor;
#if NUM_HEMI_LIGHTS > 0
  gbFar += mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, 0.5 + 0.5 * VW.y);
#endif
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  gbFar += getIBLIrradiance(normalize(-vViewPosition));
#endif
#if NUM_DIR_LIGHTS > 0
  // the sunlit bed below (albedo ~0.25) throws its light up into a body seen from above
  vec3 gbSunW = normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix));
  gbFar += directionalLights[0].color * max(gbSunW.y, 0.0) * 0.25 * smoothstep(0.1, -0.5, VW.y);
#endif
  // (diffuse light crosses the tissue on longer, slanted paths than the straight view ray)
  vec3 tauFar = uGbSigL * tExit * (1.0 + dense) * 1.6 + tauOrg + scat * 0.3;
  gbAdd += gbFar * RECIPROCAL_PI * exp(-tauFar) * skinIn * skinOut * uGbAmbient;
  gbAdd *= 1.0 - 0.85 * outside;
  // the vertebral column scatters a little of the light it is bathed in back toward the eye (pale against the dark)
  vec3 gbE = ambientLightColor;
#if NUM_HEMI_LIGHTS > 0
  gbE += mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, 0.5 + 0.5 * NgW.y);
#endif
#if NUM_DIR_LIGHTS > 0
  gbE += directionalLights[0].color * (0.35 + 0.65 * clamp(dot(NgW, normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix))) * 0.5 + 0.5, 0.0, 1.0));
#endif
  gbAdd += min(spine, 2.0) * uGbInterior * 0.12 * gbE * RECIPROCAL_PI * vec3(1.0, 0.96, 0.88) * skinIn * (1.0 - outside);
}
`;

/**
 * Blending the tissue by its coverage would dim its highlights and the light coming through it with it: those are
 * laid over the blend instead. Into the HDR buffers of the field and the hero pipeline the blend is exact (the colour
 * is scaled up by the coverage, so the glow of a thin, back-lit tail comes on top of the sand seen through it); drawn
 * straight to the tone-mapped screen the colour must stay in range, so there the alpha is raised where they are bright
 * (as the ミミイカ's skin does).
 */
const COMPOSITE = /* glsl */ `
#include <opaque_fragment>
{
  vec3 spec = totalSpecular;
#ifdef USE_CLEARCOAT
  spec += (clearcoatSpecularDirect + clearcoatSpecularIndirect) * material.clearcoat;
#endif
  vec3 add = spec + gbAdd;
  vec3 base = max(outgoingLight - spec, 0.0);
#ifdef TONE_MAPPING
  float a1 = max(gbAlpha, clamp(max(add.r, max(add.g, add.b)) * 1.2, 0.0, 1.0));
#else
  float a1 = max(gbAlpha, 0.02);
#endif
  gl_FragColor = vec4((base * gbAlpha + add) / a1, a1);
}
`;

/** How strongly the light passes through every goby body (one set for all: the look of the species, not of a fish). */
export const GOBY_LIGHT = {
  /** how much the organs and the column show */
  uGbInterior: { value: 0.45 } as IUniform<number>,
  /** the light diffused through from behind (sun, lamps) */
  uGbBack: { value: 0.3 } as IUniform<number>,
  /** the surroundings' light diffused through from the far side. Under water the light comes from every side (the
   * water scatters the daylight into a glow all round), more than the flat's sky and ground lights give: ×5 makes a
   * fish seen from the sun's side faintly see-through (thin parts lit from behind, the column and viscera as shadows) */
  uGbAmbient: { value: 5.0 } as IUniform<number>,
};

let blackTex: DataTexture | null = null;
/** no pigment (until the GLB's pigment map is decoded) */
function noPigment(): DataTexture {
  if (!blackTex) {
    blackTex = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat);
    blackTex.colorSpace = NoColorSpace;
    blackTex.needsUpdate = true;
  }
  return blackTex;
}

const PREPARED = Symbol('gobyTranslucent');
const pigmentReady = new WeakMap<Material, Promise<void>>();
/** Resolves once a goby body's pigment map is in its uniforms (the distance tiers draw their pattern from it). */
export function gobyBodyReady(m: Material): Promise<void> {
  return pigmentReady.get(m) ?? Promise.resolve();
}

/** Is this one of the goby GLBs' body materials (マハゼ, エドハゼ, ヒメハゼ)? */
export function isGobyBody(m: Material): boolean {
  const x = (m.userData as { mahaze?: GobyBodyExtras }).mahaze;
  return x?.role === 'body' && !!x.profile && !!x.fishFrame;
}

/**
 * Give a goby body material (shared by every instance of its GLB variant) the translucent tissue. Idempotent. The
 * glTF's own transmission (a second scene pass) is switched off: the light through the body is computed here.
 */
export function makeTranslucentBody(m: MeshPhysicalMaterial, tier: 'hero' | 'lod1' | 'lod2', parser?: GLTFParser): void {
  const ud = m.userData as { [PREPARED]?: boolean; mahaze?: GobyBodyExtras };
  if (ud[PREPARED]) return;
  const x = ud.mahaze!;
  ud[PREPARED] = true;
  const f = x.fishFrame!, prof = x.profile!;
  const low = tier === 'lod2';
  const an = anatomyFor(m.name, x);
  // the far tier keeps only the large organs (by their optical weight): put them first
  const weight = (o: Organ) => o.r.x * o.r.y * o.r.z * ((o.k.x + o.k.y + o.k.z) / 3 + o.s * 0.6);
  const organs = low ? [...an.organs].sort((a, b) => weight(b) - weight(a)) : an.organs;
  while (organs.length < N_ORGANS) organs.push(organ([0, -100, 0], [0.01, 0.01, 0.01], [0, 0, 0]));
  // extinction of the background (absorption + the scattering out of the forward cone, g 0.82) and the light's diffusion
  // attenuation sqrt(3 sa (sa + ss (1 - g))), g 0.78
  const sigE = new Vector3(...an.sigA.map((sa) => sa + an.sigS * 0.18));
  const sigL = new Vector3(...an.sigA.map((sa) => Math.sqrt(3 * sa * (sa + an.sigS * 0.22))));
  const uniforms = {
    uGbProfile: { value: createProfileTexture(prof) },
    uGbPigment: { value: noPigment() as Texture },
    uGbFrame: { value: new Vector4(f.S0, f.Y0, f.SL, f.SEND) },
    uGbJaws: { value: new Vector4(...an.jaws) },
    uGbColumn: { value: new Vector4(an.column[0], an.column[1], an.columnScale, (f.SL - an.column[0]) / (x.vertebrae?.count ?? 31)) },
    uGbSigE: { value: sigE },
    uGbSigL: { value: sigL },
    uGbHead: { value: new Vector2(...an.head) },
    uGbGill: { value: new Vector4(...an.gill) },
    uGbGillHn: { value: new Vector4(...an.gillHn) },
    uGbGillK: { value: new Vector3(...an.gillK) },
    uGbOrgC: { value: organs.map((o) => new Vector4(o.c.x, o.c.y, o.c.z, o.s)) },
    uGbOrgR: { value: organs.map((o) => o.r) },
    uGbOrgK: { value: organs.map((o) => o.k) },
    ...GOBY_LIGHT,
  };
  const lod = x.lod?.packing === 1 ? x.lod : null;
  const density = lod?.melanin === 'density' && !low;
  if (x.pigmentTexture !== undefined && parser) {
    pigmentReady.set(m, (parser.getDependency('texture', x.pigmentTexture) as Promise<Texture>).then((t) => {
      // (the distance tiers' melanin is an sRGB-encoded darkening, the observed fish's its density: see gbMel)
      t.colorSpace = lod && !density ? SRGBColorSpace : NoColorSpace;
      uniforms.uGbPigment.value = t;
    }).catch(() => { /* keeps the unpigmented filter */ }));
  }
  // the packed maps: the individual's pattern and colour morph (its variant, set on a derived material)
  const morph = !!lod?.morphs?.length;
  if (lod) {
    const i = (((ud as { gobyVariant?: number }).gobyVariant ?? 0) % lod.variants + lod.variants) % lod.variants;
    const pattern = Math.min(Math.floor(i / lod.colours), lod.patternChannels - 1);
    Object.assign(uniforms, {
      uGbPatSel: { value: new Vector3(pattern === 0 ? 1 : 0, pattern === 1 ? 1 : 0, pattern === 2 ? 1 : 0) },
      uGbMelRGB: { value: new Vector3(...lod.melRGB) },
      uGbFarPig: { value: new Vector2(lod.far?.iri ?? 0, lod.far?.xan ?? 0) },
    });
    if (morph) {
      const c = lod.morphs![i % lod.colours], std = lod.morphs![0];
      Object.assign(uniforms, {
        uGbMorphC: { value: [c.base, c.dors, c.belly].map((v) => new Vector3(...v)) },
        uGbStdC: { value: [std.base, std.dors, std.belly].map((v) => new Vector3(...v)) },
        uGbMorphK: { value: new Vector4(c.melK, c.melAdd, c.xanK, c.iriK) },
        uGbBelly: { value: new Vector2(...(lod.bellyRamp ?? [-0.4, -0.88])) },
      });
    }
  }
  m.transmission = 0;
  m.thickness = 0;
  m.transparent = true;
  m.depthWrite = true;
  m.defines = { ...(m.defines ?? {}), USE_UV: '', ...(low ? { GB_LOW: '' } : {}), ...(lod ? { GB_PACKED: '' } : {}), ...(morph ? { GB_MORPH: '' } : {}), ...(density ? { GB_MEL_DENSITY: '' } : {}) };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
vGbRest = position;
#ifdef USE_SKINNING
  vGbToWorld = mat3(modelMatrix) * mat3(skinMatrix);
#else
  vGbToWorld = mat3(modelMatrix);
#endif`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGbWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('void main() {', `${FUNCTIONS}\nvoid main() {`)
      .replace('#include <emissivemap_fragment>', THROUGH)
      .replace('#include <opaque_fragment>', COMPOSITE);
  };
  const key = `goby-body-translucent${low ? '-low' : ''}${lod ? '-packed' : ''}${morph ? '-morph' : ''}${density ? '-density' : ''}-v4`;
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
}

const lodDerived = new WeakMap<Material, Map<number, Material>>();
/**
 * The material of a goby distance tier for one individual: those tiers carry one body and one fin material for all the
 * patterns and colour morphs (packed maps, tools/lib/gobyLod.mjs); each variant gets its own copy of it, made once per
 * asset and shared by every fish of that variant, which differs only in its uniforms (the body: pattern and colour
 * morph) or its colour (the fins: the morph's tint). The shader program is the same for all. `prepare` readies a new
 * copy as the loader readies the asset's own materials. null: the asset's own material serves (variant 0, or none).
 */
export function gobyLodVariant(base: Material, meshName: string, variant: number, prepare: (m: Material) => void): Material | null {
  // (a mesh with several materials has none of these)
  const x = (base.userData as { mahaze?: GobyBodyExtras & { lodTints?: V3[] } } | undefined)?.mahaze;
  if (!x) return null;
  let n = 0;
  let apply: ((m: Material, i: number) => void) | null = null;
  if (x.role === 'body' && x.lod?.packing === 1 && x.lod.variants > 1) {
    n = x.lod.variants;
    apply = (m, i) => { (m.userData as { gobyVariant?: number }).gobyVariant = i; };
  } else if (x.role === 'fin' && (x.lodTints?.length ?? 0) > 1 && !meshName.startsWith('Eye')) {
    // (the far tier's eyes share the fins' material: they keep their own colour)
    const tints = x.lodTints!;
    n = tints.length;
    apply = (m, i) => { (m as MeshPhysicalMaterial).color.fromArray(tints[i]); };
  }
  if (!apply) return null;
  const i = ((Math.floor(variant) % n) + n) % n;
  if (i === 0) return null;
  let byIndex = lodDerived.get(base);
  if (!byIndex) lodDerived.set(base, (byIndex = new Map()));
  let m = byIndex.get(i);
  if (!m) {
    m = base.clone();
    apply(m, i);
    prepare(m);
    byIndex.set(i, m);
  }
  return m;
}
