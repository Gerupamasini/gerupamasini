import { DataTexture, NoColorSpace, RGBAFormat, Vector2, Vector3, Vector4, type IUniform, type Material, type MeshPhysicalMaterial, type MeshStandardMaterial, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { createProfileTexture } from './hero/BodyMaterial.js';
import { morphGLSL, morphUniforms, type MorphPick, type MorphTable } from './colourMorph.js';
import { COLUMN, COLUMN_GLSL, COLUMN_PLAIN, columnHn } from './skeleton.js';

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
/** the マハゼ's vent (the body cavity's hind end): tools/models/mahaze/anatomy.mjs anus, at its 41 mm SL */
const MAHAZE_VENT = 22.45 / 41;

type V3 = [number, number, number];
interface Profile { n: number; data: number[] }
interface Frame { S0: number; Y0: number; SL: number; SEND: number; jaws?: number[] }
/** the volumetric shader's anatomy as a species' build tool writes it into the body's extras (エドハゼ) */
interface ShippedAnatomy {
  sigS?: number; sigA?: V3; headWin?: [number, number]; gillWin?: [number, number, number, number]; gillK?: V3;
  gillHn?: [number, number, number, number]; spine?: V3; jaw?: [number, number, number, number];
  organs?: { name: string; c: V3; r: V3; k: V3 }[];
}
/**
 * What the body maps' spare channels hold (the budget-sized GLBs, docs/quality/model-budget.md §5): the near levels' colour
 * map carries the ambient occlusion in its alpha and the pigment map the roughness, so they need no ORM map; the far
 * level has no pigment map, its colour map carries the melanophores in its alpha. Absent: the older layout (an ORM map in
 * the standard slots, the pigment map's RGB).
 * The マハゼ's morph layout (its nine looks from one set of maps, ./colourMorph.js): the colour map is the standard's
 * ground with the xanthophores in its alpha, the pigment map every pattern's melanophores and the iridophores, the near
 * levels' normal map the normal's x and y, the ambient occlusion and the roughness.
 */
export interface GobyChannels {
  mapAlpha?: 'ao' | 'melanin' | 'xanthophores'; aoStrength?: number; pigmentAlpha?: 'roughness';
  /** the far level with only the melanophores: its mean iridophores and xanthophores */
  pigmentFill?: [number, number];
  pigment?: 'melanin3+iridophores'; normal?: 'xy+ao+roughness';
}
export interface GobyBodyExtras {
  role: string;
  pigmentTexture?: number;
  channels?: GobyChannels;
  /** the looks the file holds (morph layout), and the one this material wears (absent: the first) */
  morphs?: MorphTable;
  morph?: MorphPick;
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
  /** its shape (./skeleton.js): height in the section along it, radius at its ends, the vent where the cavity ends; ct:
   * the マハゼ's, from a goby skeleton's CT (high over the cavity, haemal spines behind the vent, ribs) */
  skeleton: { hn: [number, number, number, number]; radius: [number, number]; vent: number; ct: boolean };
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

/** the column's height (./skeleton.js) and radius at s mm in one body */
export function columnAt(an: GobyAnatomy, p: Profile, f: Frame, s: number): { y: number; r: number } {
  const q = sectionAt(p, f, s);
  const k = an.skeleton, u = Math.min(Math.max((s - an.column[0]) / (an.column[1] - an.column[0]), 0), 1);
  return { y: q.yc + columnHn(s, an.column[0], k.vent, f.SL, k.hn) * q.t, r: (k.radius[0] + (k.radius[1] - k.radius[0]) * u) * an.columnScale };
}
/** the earlier column of the other gobies (level, thinning to the tail; the vent only shapes the マハゼ's) */
const plainSkeleton = (f: Frame): GobyAnatomy['skeleton'] => ({ hn: [...COLUMN_PLAIN.hn], radius: [...COLUMN_PLAIN.radius], vent: 0.55 * f.SL, ct: false });

/** The tissue and organs of one goby body: its GLB's own anatomy where it ships one, else its species' or the マハゼ's. */
export function anatomyFor(name: string, x: GobyBodyExtras): GobyAnatomy {
  const f = x.fishFrame!, p = x.profile!, sc = f.SL / REF_SL;
  const vStart = x.vertebrae?.start ?? 0.266 * f.SL;
  const a = x.anatomy;
  if (a?.organs?.length) {
    return {
      skeleton: plainSkeleton(f),
      sigS: a.sigS ?? 1.35, sigA: a.sigA ?? [0.02, 0.048, 0.12], head: a.headWin ?? [8.5 * sc, 11.5 * sc],
      gill: a.gillWin ?? [7.2 * sc, 8.6 * sc, 10.3 * sc, 11.3 * sc], gillHn: a.gillHn ?? GILL_HN, gillK: a.gillK ?? GILL_K,
      column: [vStart, a.spine?.[1] ?? 0.99 * f.SL], columnScale: sc, jaws: a.jaw ?? (f.jaws as typeof DEFAULT_JAWS | undefined) ?? DEFAULT_JAWS,
      organs: a.organs.slice(0, N_ORGANS).map((o) => organ(o.c, o.r, o.k)),
    };
  }
  if (/^Himehaze/i.test(name)) {
    return {
      skeleton: plainSkeleton(f),
      sigS: HIMEHAZE.sigS, sigA: HIMEHAZE.sigA, head: HIMEHAZE.head, gill: HIMEHAZE.gill, gillHn: GILL_HN, gillK: GILL_K,
      column: [vStart, HIMEHAZE.columnEnd], columnScale: sc, jaws: DEFAULT_JAWS, organs: HIMEHAZE.organs(),
    };
  }
  const an: GobyAnatomy = {
    sigS: 1.35, sigA: [0.02, 0.048, 0.12], head: [8.5 * sc, 11.5 * sc], gill: [7.2 * sc, 8.6 * sc, 10.3 * sc, 11.3 * sc], gillHn: GILL_HN, gillK: GILL_K,
    column: [vStart, 40.6 * sc], columnScale: sc, jaws: (f.jaws as typeof DEFAULT_JAWS | undefined) ?? DEFAULT_JAWS, organs: organsFor(p, f),
    skeleton: { hn: [...COLUMN.hn], radius: [...COLUMN.radius], vent: MAHAZE_VENT * f.SL, ct: true },
  };
  // the kidney and the peritoneum on the cavity's roof lie right under the column, high over the cavity (./skeleton.js)
  const roof = an.organs[2], kidney = an.organs[3];
  const col = columnAt(an, p, f, kidney.c.x);
  kidney.c.y = col.y - col.r - kidney.r.y;
  roof.c.y = kidney.c.y - kidney.r.y - 0.6 * roof.r.y;
  return an;
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
uniform vec4 uGbColHn;        // … its height in the section: first centrum, over the cavity, at the vent, caudal base
uniform vec3 uGbColShape;     // … the vent (mm), its radius at the first centrum and the last (mm at 41 mm SL)
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
uniform vec2 uGbPigFill;      // iridophores, xanthophores where only the melanophores ship (the far level)
uniform float uGbAoStrength;  // ambient occlusion from the colour map's (or the packed normal map's) channel
#ifdef GB_MORPH
${morphGLSL}
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
// the skin's pigment (melanophores, iridophores, xanthophores): the pigment map's, or on the far level the melanophores
// alone, from the colour map's alpha; the マハゼ's, its look's (the pattern's melanophores, scaled by the colour morph)
#if defined(GB_MORPH)
vec3 gbPigLod(vec2 uv, float lod, float hn) {
  vec4 m = textureLod(uGbPigment, uv, lod);
  return gbMorphPig(m.rgb, m.a, textureLod(map, uv, lod).a, hn);
}
#elif defined(GB_MAP_A_MEL)
vec3 gbPigLod(vec2 uv, float lod, float hn) { return vec3(textureLod(map, uv, lod).a, uGbPigFill); }
vec4 gbPigGrad(vec2 uv, vec2 dx, vec2 dy) { return vec4(textureGrad(map, uv, dx, dy).a, uGbPigFill, 1.0); }
#else
vec3 gbPigLod(vec2 uv, float lod, float hn) { return textureLod(uGbPigment, uv, lod).rgb; }
vec4 gbPigGrad(vec2 uv, vec2 dx, vec2 dy) { return textureGrad(uGbPigment, uv, dx, dy); }
#endif
// height in the section (−1 the keel, 1 the back) of a point in the fish frame
float gbHn(vec3 p) {
  GbSec q = gbSection(clamp(p.x, 0.05, uGbFrame.w - 0.05));
  return (p.y - q.yc) / max(p.y > q.yc ? q.t : q.b, 1e-3);
}
// the pigment where the light leaves or enters the body at the point p (fish frame), from a coarse mip
vec3 gbPigAt(vec3 p, float lod) { return gbPigLod(gbFishUV(p), lod, gbHn(p)); }
// chromatophore filter of the skin (melanin, iridophores, xanthophores)
vec3 gbSkinT(vec3 pig) {
  return exp(-pig.r * vec3(3.4, 3.8, 4.3)) * exp(-pig.b * vec3(0.02, 0.12, 0.5)) * (1.0 - 0.45 * pig.g);
}
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
${COLUMN_GLSL}
// the column's height at s mm (./skeleton.js)
float gbColumnY(float s) {
  GbSec q = gbSection(s);
  return q.yc + gobyColumnHn(s, uGbColumn.x, uGbColShape.x, uGbFrame.z, uGbColHn) * q.t;
}
// Gaussian tube along the vertebral column, denser at the centrum rims
float gbSpine(vec3 o, vec3 d, float L, inout float tFirst) {
  float spineY = gbColumnY(clamp(o.x, uGbColumn.x, uGbColumn.y));
  vec2 dp = d.yz;
  float dd = max(dot(dp, dp), 0.02);
  float tc = 0.0, sc = 0.0;
  for (int k = 0; k < 2; k++) {
    tc = -dot(o.yz - vec2(spineY, 0.0), dp) / dd;
    sc = o.x + d.x * clamp(tc, 0.0, L);
    spineY = gbColumnY(clamp(sc, uGbColumn.x, uGbColumn.y));
  }
  vec2 cpt = o.yz - vec2(spineY, 0.0) + dp * tc;
  float u = clamp((sc - uGbColumn.x) / (uGbColumn.y - uGbColumn.x), 0.0, 1.0);
  float r = mix(uGbColShape.y, uGbColShape.z, u) * uGbColumn.z;
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
  vec3 skinL = gbSkinT(gbPigAt(pIn + LF * dL, 2.0));
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
  float hn = gbHn(pF);
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
#ifdef GB_MORPH
  // (the look's pigment, taken with its colour)
  vec4 pig4 = vec4(gbMorphPig4, 1.0);
#else
  vec2 uvA = GB_UV, uvB = vec2(GB_UV.x, fract(GB_UV.y + 0.5));
  vec2 dxA = dFdx(uvA), dyA = dFdy(uvA), dxB = dFdx(uvB), dyB = dFdy(uvB);
  vec4 pig4 = gbPigGrad(GB_UV, dot(dxA, dxA) < dot(dxB, dxB) ? dxA : dxB, dot(dyA, dyA) < dot(dyB, dyB) ? dyA : dyB);
#endif
#ifdef GB_PIG_A_ROUGH
  // the skin's roughness ships in the pigment map's alpha (read before the lights take material.roughness)
  roughnessFactor = pig4.a;
#endif
  vec3 skinIn = gbSkinT(pig4.rgb);
  vec3 skinOut = gbSkinT(gbPigAt(xE, 2.0));
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
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_PMREM )
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
 * The マハゼ's look (morph layout): its colour rebuilt from the standard's ground, its pattern's melanophores and the
 * colour morph (./colourMorph.js), in place of three's map_fragment; the maps are read with derivatives that do not
 * jump at the ventral wrap of the skin's UV (the coarse mip would draw a line under the chin).
 */
const MORPH_MAP = /* glsl */ `
#if defined(GB_MORPH) || defined(GB_NRM_PACKED)
vec2 gbUvB = vec2(GB_UV.x, fract(GB_UV.y + 0.5));
vec2 gbDxA = dFdx(GB_UV), gbDyA = dFdy(GB_UV), gbDxB = dFdx(gbUvB), gbDyB = dFdy(gbUvB);
vec2 gbDx = dot(gbDxA, gbDxA) < dot(gbDxB, gbDxB) ? gbDxA : gbDxB;
vec2 gbDy = dot(gbDyA, gbDyA) < dot(gbDyB, gbDyB) ? gbDyA : gbDyB;
#endif
#ifdef GB_MORPH
vec4 sampledDiffuseColor = textureGrad(map, vMapUv, gbDx, gbDy);
vec3 gbMorphPig4;
{
  vec4 m4 = textureGrad(uGbPigment, GB_UV, gbDx, gbDy);
  float hn = gbHn(gbToFish(vGbRest));
  diffuseColor.rgb *= gbMorphAlbedo(sampledDiffuseColor.rgb, m4.rgb, m4.a, sampledDiffuseColor.a, hn);
  gbMorphPig4 = gbMorphPig(m4.rgb, m4.a, sampledDiffuseColor.a, hn);
}
#else
#include <map_fragment>
#endif
`;

/**
 * The morph layout's normal map: the normal's x and y (z rebuilt), the ambient occlusion and the roughness (read here,
 * before the lights take material.roughness). Same derivatives as the colour.
 */
const PACKED_NORMAL = /* glsl */ `
#if defined(GB_NRM_PACKED) && defined(USE_NORMALMAP_TANGENTSPACE)
vec4 gbN4 = textureGrad(normalMap, vNormalMapUv, gbDx, gbDy);
{
  vec3 mapN = vec3(gbN4.xy * 2.0 - 1.0, 0.0);
  mapN.z = sqrt(saturate(1.0 - dot(mapN.xy, mapN.xy)));
  mapN.xy *= normalScale;
  normal = normalize(tbn * mapN);
  roughnessFactor = gbN4.a;
}
#else
#include <normal_fragment_maps>
#endif
`;

/** ambient occlusion from the colour map's alpha or the packed normal map's blue (three's aomap_fragment, for a map in another slot) */
const AO = /* glsl */ `
#if defined(GB_MAP_A_AO) || (defined(GB_NRM_PACKED) && defined(USE_NORMALMAP_TANGENTSPACE))
{
#ifdef GB_MAP_A_AO
  float ambientOcclusion = (sampledDiffuseColor.a - 1.0) * uGbAoStrength + 1.0;
#else
  float ambientOcclusion = (gbN4.b - 1.0) * uGbAoStrength + 1.0;
#endif
  reflectedLight.indirectDiffuse *= ambientOcclusion;
#if defined( USE_CLEARCOAT )
  clearcoatSpecularIndirect *= ambientOcclusion;
#endif
#if defined( USE_SHEEN )
  sheenSpecularIndirect *= ambientOcclusion;
#endif
#if defined( USE_ENVMAP ) && defined( STANDARD )
  float dotNV = saturate(dot(geometryNormal, geometryViewDir));
  reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNV, ambientOcclusion, material.roughness);
#endif
}
#else
#include <aomap_fragment>
#endif
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
    // (alpha: a mid roughness, for the near levels whose roughness is in the pigment map's alpha)
    blackTex = new DataTexture(new Uint8Array([0, 0, 0, 84]), 1, 1, RGBAFormat);
    blackTex.colorSpace = NoColorSpace;
    blackTex.needsUpdate = true;
  }
  return blackTex;
}

const PREPARED = Symbol('gobyTranslucent');

/** Is this one of the goby GLBs' body materials (マハゼ, エドハゼ, ヒメハゼ)? */
export function isGobyBody(m: Material): boolean {
  const x = (m.userData as { mahaze?: GobyBodyExtras }).mahaze;
  return x?.role === 'body' && !!x.profile && !!x.fishFrame;
}

/**
 * Give a goby body material (shared by every instance of its GLB and look) the translucent tissue. Idempotent. The
 * glTF's own transmission (a second scene pass) is switched off: the light through the body is computed here.
 * Resolves when the pigment map is in place (the マハゼ's pattern is in it: a fish drawn before would show none).
 */
export function makeTranslucentBody(m: MeshPhysicalMaterial, tier: 'hero' | 'lod1' | 'lod2', parser?: GLTFParser): Promise<void> {
  const ud = m.userData as { [PREPARED]?: boolean; mahaze?: GobyBodyExtras };
  if (ud[PREPARED]) return Promise.resolve();
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
    uGbColHn: { value: new Vector4(...an.skeleton.hn) },
    uGbColShape: { value: new Vector3(an.skeleton.vent, ...an.skeleton.radius) },
    uGbSigE: { value: sigE },
    uGbSigL: { value: sigL },
    uGbHead: { value: new Vector2(...an.head) },
    uGbGill: { value: new Vector4(...an.gill) },
    uGbGillHn: { value: new Vector4(...an.gillHn) },
    uGbGillK: { value: new Vector3(...an.gillK) },
    uGbOrgC: { value: organs.map((o) => new Vector4(o.c.x, o.c.y, o.c.z, o.s)) },
    uGbOrgR: { value: organs.map((o) => o.r) },
    uGbOrgK: { value: organs.map((o) => o.k) },
    uGbPigFill: { value: new Vector2(...(x.channels?.pigmentFill ?? [0.25, 0.3])) },
    uGbAoStrength: { value: x.channels?.aoStrength ?? 0.85 },
    ...(x.morphs ? morphUniforms(x.morphs, x.morph) : {}),
    ...GOBY_LIGHT,
  };
  const pigment = x.pigmentTexture !== undefined && parser
    ? (parser.getDependency('texture', x.pigmentTexture) as Promise<Texture>).then((t) => {
      t.colorSpace = NoColorSpace;
      uniforms.uGbPigment.value = t;
    }).catch(() => { /* keeps the unpigmented filter */ })
    : Promise.resolve();
  m.transmission = 0;
  m.thickness = 0;
  m.transparent = true;
  m.depthWrite = true;
  const ch = x.channels ?? {};
  const layout = {
    ...(ch.mapAlpha === 'ao' ? { GB_MAP_A_AO: '' } : {}),
    ...(ch.mapAlpha === 'melanin' ? { GB_MAP_A_MEL: '' } : {}),
    ...(ch.pigmentAlpha === 'roughness' ? { GB_PIG_A_ROUGH: '' } : {}),
    ...(x.morphs && ch.pigment === 'melanin3+iridophores' ? { GB_MORPH: '' } : {}),
    ...(ch.normal === 'xy+ao+roughness' ? { GB_NRM_PACKED: '' } : {}),
  };
  m.defines = { ...(m.defines ?? {}), USE_UV: '', ...(low ? { GB_LOW: '' } : {}), ...layout };
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
      .replace('#include <map_fragment>', MORPH_MAP)
      .replace('#include <normal_fragment_maps>', PACKED_NORMAL)
      .replace('#include <emissivemap_fragment>', THROUGH)
      .replace('#include <aomap_fragment>', AO)
      .replace('#include <opaque_fragment>', COMPOSITE);
  };
  const key = `goby-body-translucent${low ? '-low' : ''}-v4${Object.keys(layout).map((d) => `-${d}`).join('')}`;
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
  return pigment;
}

const EYES_KEEP_COLOUR = /* glsl */ `
#include <map_fragment>
// the eyes share the merged fins' material: their texels (the iris in the atlas' corner) keep their own colour, not
// the colour morph's fin tint
if (all(greaterThanEqual(vMapUv, uGbIris.xy)) && all(lessThanEqual(vMapUv, uGbIris.xy + uGbIris.zw))) diffuseColor.rgb = sampledDiffuseColor.rgb;
`;

/** Is this the far level's one mesh of the fins and the eyes (its material carries the iris rectangle)? */
export function isMergedGobyFins(m: Material): boolean {
  const x = (m.userData as { mahaze?: { role?: string; merged?: boolean; irisRect?: number[] } }).mahaze;
  return x?.role === 'fin' && !!x.merged && x.irisRect?.length === 4;
}

/**
 * The far level's merged fins and eyes (tools/lib/gobyBuild.mjs): the eyes keep their colour when a look tints the
 * fins (gobyLook). Every copy of the material, the asset's own too, gets it, so they share one program. Idempotent.
 */
export function keepGobyEyeColour(m: MeshStandardMaterial): void {
  const ud = m.userData as { [PREPARED]?: boolean; mahaze: { irisRect: number[] } };
  if (ud[PREPARED]) return;
  ud[PREPARED] = true;
  const rect = ud.mahaze.irisRect;
  const uGbIris = { value: new Vector4(rect[0], rect[1], rect[2], rect[3]) };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uGbIris = uGbIris;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uGbIris;')
      .replace('#include <map_fragment>', EYES_KEEP_COLOUR);
  };
  m.customProgramCacheKey = () => 'goby-fins-merged-eyes-v1';
  m.needsUpdate = true;
}

/** the looks made of each asset material (shared by every fish that wears one), and when each is ready */
const looks = new WeakMap<Material, Map<string, Material>>();
const lookReady = new WeakMap<Material, Promise<void>>();

/**
 * A goby asset's body or fin material in one look (the マハゼ's patterns × colour morphs, ./colourMorph.js): a copy,
 * made once per material and look and shared, that differs only in its uniforms (the body: its pattern's melanophores
 * and its colour morph) or its colour (the fins: the morph's tint, and its melanophore factor for the hero). Maps and
 * shader program are the asset's own. The first pattern in the standard colour is the asset's material itself, as is
 * any material that is neither (the eyes; on the far level they share the fins' material, and their texels there
 * keep their colour: keepGobyEyeColour). `prepare` readies a new copy as the loader readies the asset's own materials.
 */
export function gobyLook(base: Material, morphs: MorphTable, pick: MorphPick, prepare: (m: Material) => Promise<void>): Material {
  const x = (base.userData as { mahaze?: { role?: string } } | undefined)?.mahaze;
  const body = x?.role === 'body', fin = x?.role === 'fin';
  if ((!body && !fin) || pick.color === 0 && (fin || pick.pattern === 0)) return base;
  let byLook = looks.get(base);
  if (!byLook) looks.set(base, (byLook = new Map()));
  const key = `${body ? pick.pattern : 0}:${pick.color}`;
  let m = byLook.get(key);
  if (!m) {
    // (a copy carries the maps, the flags and a deep copy of the extras; the translucent tissue is worked in again)
    m = base.clone();
    const mx = (m.userData as { mahaze: GobyBodyExtras & { tint?: number[]; melK?: number } }).mahaze;
    const colour = morphs.colors[pick.color];
    if (body) mx.morph = pick;
    else {
      (m as MeshStandardMaterial).color.setRGB(colour.fin.tint[0], colour.fin.tint[1], colour.fin.tint[2]);
      mx.tint = colour.fin.tint;
      mx.melK = colour.fin.melK;
    }
    m.name = `${base.name}_${body ? `p${pick.pattern + 1}_` : ''}${colour.name}`;
    lookReady.set(m, prepare(m));
    byLook.set(key, m);
  }
  return m;
}

/** Resolves once a look's material is ready to draw (a goby body's pigment map is in its uniforms). */
export function gobyLookReady(m: Material): Promise<void> {
  return lookReady.get(m) ?? Promise.resolve();
}
