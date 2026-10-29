import {
  Color, Matrix4, MeshDepthMaterial, Quaternion, Vector3, Vector4,
  type Bone, type IUniform, type Material, type Mesh, type MeshStandardMaterial, type Object3D, type SkinnedMesh,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { Tier } from '../../models/ModelLoader';
import { variantOf } from '../../models/choice';

/**
 * The トビハゼ's materials at run time: the GLB's own materials (tools/models/tobihaze/build.mjs texturedMaterials) and
 * the rules their extras carry (extras.tobihaze.role / runtime on every material; the textures team's runtime contract),
 * worked into them here so the game draws what the textures were calibrated for.
 *
 * Read from the extras, never assumed: the role (body, eye, fin), the master wetness the maps hold, the packed map's
 * channels (round T2 `body_film_rough_retain_ao`: R the film, G the roughness, B the retention, A the occlusion; round T3
 * `body_occlusion_roughness_metal_retain`: R the occlusion, G the roughness, B the metal, A the retention — found by the
 * extras' channel notes, else by the map's name), the wet table, the fins' wetness rule and translucency, the pupil's
 * colours and the eye's rects. Every rule is the identity at its uniform's default, so a fish nobody drives draws the
 * static GLB as calibrated; the rules that change the static picture are the ones the contract asks the runtime for:
 *   fins     the blended membranes write depth (extras blend.depthWrite: their own layers in order, and the flat's
 *            screen-space water reads the fin's depth, not the ground's behind it — a fin above the surface stays dry,
 *            one below is under the water as deep as it is); they cast their shadow by their coverage (a depth material
 *            with the atlas and alphaHash, extras shadow); the sun shines through them (extras runtime.translucency,
 *            the eyefin key's rule, after three's lights)
 *   occlusion a T2 body's occlusion (the packed map's A) applied to the indirect light, as three applies an aoMap
 * and, the runtime's own, the body's shadow on its fins: the paired fins lie beside and under the trunk, and the
 * contract's translucency ignored shadows (they glowed inside the body's shadow; the creatures receive no shadow maps,
 * and the flat's map has 3–6 cm texels besides). The trunk is two ellipsoids riding J_root and J_sp4 (measured on the
 * hero's skin, BODY_SHADOW); the sun's direct light and its light through the membranes are tested against them per
 * fragment.
 *
 * Per individual (uniforms; one shader program per role and tier, shared by every fish): wetness (the water film: the
 * roughness, the clearcoat and its roughness, the skin's own specular, the albedo and saturation, per texel by the
 * map's retention), mud (by the downward normal), bars (the excitement crossbands in the baseColor's A), dark, the tint
 * (hue, saturation, value, contrast about the map's mean value, a lift toward a colour; the species' variation.tint
 * ranges by the individual's id), the pupil's colour (teal, the reddish-brown of B009/B010/B064, or black) and the water:
 * below the surface the film and the skin's specular go (water on wet skin is index-matched: F0 falls a hundredfold), so
 * a fish in the shallows glistens above the waterline only.
 *
 * Plumbing. ModelLoader readies the shared (cached) materials of a file (prepareTobihazeMaterials) and gives every
 * instance its own copies (instanceTobihaze): copies share the program (the same cache key) and the maps, and differ in
 * their uniforms, which three uploads whenever the material changes between draws — one fish's copies after another's
 * (three re-uploads a built-in material's uniforms only then: uniformsNeedUpdate is a ShaderMaterial's). A copy per
 * instance, not per tier or look, because the tank's lighting clones chain the material's own onBeforeCompile and would
 * otherwise carry one uniform set for every occupant. Copies are never disposed (they hold no GPU resource of their own;
 * disposing the last user would drop the program and stall the next fish's first frame), and are collected with their
 * instance. The driver hangs its individual's look on the model's meshes (mesh.userData.tobihazeLook, TobiLookState: the
 * behaviour's skin and colour, the water, the id) and keeps it current; each mesh's onBeforeRender carries it, and the
 * bones' places for the body's shadow, into the uniforms before the instance's first draw of a render.
 */

// ------------------------------------------------------------------------------------------------- the extras

type Channel = 'r' | 'g' | 'b' | 'a';
type Rgb = [number, number, number];
type Rect = [number, number, number, number];

interface WetTable {
  wet?: { roughness?: number; clearcoat?: number; clearcoatRoughness?: number; albedo?: number; saturation?: number; skinSpecular?: number };
  damp?: { roughness?: number; clearcoat?: number; clearcoatRoughness?: number };
  dry?: { roughness?: number };
  mud?: { roughness?: number; colour?: string; ventral?: [number, number] };
  gamma?: number;
  carry?: number;
}

interface FinRule { master?: number; wet?: number; dry?: number; albedo?: number }

interface Translucency { diffuse?: number; tintPower?: number; forward?: number; forwardPower?: number; environment?: number; stopAlpha?: [number, number] | null }

interface TobiMaterialExtras {
  role?: string;
  pass?: string;
  merged?: boolean;
  irisRect?: number[];
  skinRect?: number[];
  blend?: { depthWrite?: boolean };
  shadow?: { alphaHash?: boolean } | false;
  master?: { wetness?: number };
  maps?: Record<string, string> | string;
  runtime?: {
    ref?: string;
    master?: { wetness?: number };
    roughness?: { wet?: number; dry?: number };
    valueMean?: number;
    fin?: FinRule;
    wetness?: {
      default?: number;
      master?: { wetness?: number; map?: string };
      WET?: WetTable | null;
      fin?: FinRule;
      channels?: Partial<Record<'R' | 'G' | 'B' | 'A', string>>;
      specularOcclusion?: { min?: number; ao?: [number, number] };
    };
    tint?: { valueMean?: number };
    translucency?: Translucency;
    pupil?: { teal?: number[]; variants?: Record<string, number[]> };
  };
}

/** The wet table round T2 wrote (surface.mjs WET): the numbers a material's extras leave out (a lod2 file's rules
 * refer to the hero's). */
const WET_DEFAULT = {
  wet: { roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.07, albedo: 0.85, saturation: 1.1, skinSpecular: 0.2 },
  damp: { clearcoat: 0.2 },
  dry: { roughness: 0.6 },
  mud: { roughness: 0.7, colour: '#8e8a82', ventral: [0.15, 0.75] as [number, number] },
  gamma: 1.2,
  carry: 0.5,
};
const FIN_DEFAULT = { wet: 0.38, dry: 0.55, albedo: 0.85 };
/** the map's mean HSV value (linear) when the extras do not give it (round T3 measures it at the bake) */
const VALUE_MEAN = 0.35;
/** below the water a wet skin's and a cornea's reflectance against the water: ((1.37 − 1.333) / (1.37 + 1.333))² ≈ 2e-4
 * against 0.024 in air, about 1 % — the film and the skin's specular all but vanish under the surface */
const UNDERWATER_SPECULAR = 0.02;

/**
 * The trunk for the fins' shadow: two ellipsoids, each riding a joint (bind pose, the object frame, shares of TL).
 * Measured on the hero's skin meshes (Body, Head, Head_Mouth, Head_Orbit) every 4 mm along the 80 mm fish: the front
 * one from the snout to the anal fin (z −5…42 mm: 11.2 × 10.8 mm across at its middle, the head's and the trunk's
 * widest), the hind one the tail to the caudal base (z −30…2 mm, 6.6 × 7.2). The shadow is soft over the outer
 * 28 % of their radius, so the fins' roots (on the skin) are not cut sharp.
 */
const BODY_SHADOW: readonly { joint: string; centre: Rgb; semi: Rgb }[] = [
  { joint: 'J_root', centre: [0, -0.0021, -0.025], semi: [0.07, 0.0675, 0.294] },
  { joint: 'J_sp4', centre: [0, -0.0085, -0.094], semi: [0.041, 0.045, 0.2] },
];
/** the GLB's total length (m) at scale 1 (the build's TL; species model.modelLength_mm) */
const MODEL_TL_M = 0.08;

const xOf = (m: Material): TobiMaterialExtras | undefined => (m.userData as { tobihaze?: TobiMaterialExtras } | undefined)?.tobihaze;

/** Is this one of the トビハゼ GLBs' materials (extras.tobihaze.role)? */
export function isTobihazeMaterial(m: Material | null | undefined): boolean {
  const r = m ? xOf(m)?.role : undefined;
  return r === 'body' || r === 'eye' || r === 'fin';
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const linear = (hex: string | undefined, d: Rgb): Rgb => {
  if (!hex) return d;
  const c = new Color(hex).convertSRGBToLinear();
  return [c.r, c.g, c.b];
};

/**
 * The packed body map's channels from the extras: the channel notes (runtime.wetness.channels; each note's first
 * keyword names what it holds), else the map's name (`body_film_rough_retain_ao` → R film, G rough, B retain, A ao),
 * else round T2's layout.
 */
export function bodyChannels(x: TobiMaterialExtras | undefined): { retain: Channel; ao: Channel | null; film: Channel | null } {
  const KINDS: [string, RegExp][] = [['retain', /retention|retain/], ['ao', /occlusion|\bao\b/], ['film', /\bfilm\b|clearcoat/], ['rough', /rough/], ['metal', /metal/]];
  const kindOf = (text: string): string | null => {
    let best: string | null = null, at = Infinity;
    for (const [k, re] of KINDS) { const m = re.exec(text.toLowerCase()); if (m && m.index < at) { at = m.index; best = k; } }
    return best;
  };
  const found: Record<string, Channel> = {};
  const notes = x?.runtime?.wetness?.channels;
  if (notes) for (const [c, text] of Object.entries(notes)) { const k = typeof text === 'string' ? kindOf(text) : null; if (k && !found[k]) found[k] = c.toLowerCase() as Channel; }
  if (!found.retain) {
    const name = x?.runtime?.wetness?.master?.map ?? '';
    const tokens = name.replace(/^.*?body_/, '').split('_');
    if (tokens.length === 4) tokens.forEach((t, i) => { const k = kindOf(t === 'ao' ? 'occlusion' : t); if (k && !found[k]) found[k] = 'rgba'[i] as Channel; });
  }
  if (!found.retain) return { retain: 'b', ao: 'a', film: 'r' };
  return { retain: found.retain, ao: found.ao ?? null, film: found.film ?? null };
}

/** What one material does at run time, from its extras (shared by every copy of it; the program's cache key). */
interface Spec {
  role: 'body' | 'eye' | 'fin';
  tier: Tier;
  /** the wetness the maps (and the material's factors) hold */
  master: number;
  /** the hero's and lod1's skin: the packed map's channels and the wet table */
  wetMap: { retain: Channel; ao: Channel | null; so: { min: number; ao0: number; ao1: number } | null } | null;
  /** lod2's body: the roughness of the wet and the dry fish */
  farRough: { wet: number; dry: number } | null;
  fin: { wet: number; dry: number; albedo: number } | null;
  W: { gamma: number; carry: number; dK: number; wetCc: number; dampCc: number; albedo: number; saturation: number; skinSpecular: number };
  mud: { colour: Rgb; roughness: number; ventral: [number, number] };
  trans: { diffuse: number; tintPower: number; forward: number; forwardPower: number; environment: number; stop: [number, number] | null } | null;
  pupil: { teal: Rgb; rect: Rect; variants: Record<string, Rgb> } | null;
  /** the eye: tint and dark only on its skin caps */
  capRect: Rect | null;
  bars: boolean;
  valueMean: number;
  /** a fin: the body's shadow on it */
  occlusion: boolean;
  /** the blended fins write depth; their shadow by coverage */
  depthWrite: boolean;
  shadowHash: boolean;
  key: string;
}

const specs = new WeakMap<Material, Spec>();

function rectOf(r: number[] | undefined): Rect | null {
  return Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(v)) ? [r[0], r[1], r[2], r[3]] : null;
}

function hashOf(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

/**
 * What a file's materials say for all of them: a material whose rules refer to another's (round T2's FinOpaque: "as
 * Tobihaze_Fin"; lod2's "the hero file's") takes the numbers it leaves out from its siblings in the same file.
 */
interface FileRules { master?: number; WET?: WetTable; fin?: FinRule; valueMean?: number }

function fileRules(materials: readonly Material[]): FileRules {
  const out: FileRules = {};
  for (const m of materials) {
    const R = xOf(m)?.runtime;
    if (!R) continue;
    out.master ??= R.wetness?.master?.wetness ?? R.master?.wetness ?? (typeof R.wetness?.default === 'number' ? R.wetness.default : undefined);
    if (R.wetness?.WET && (R.wetness.WET as WetTable).wet) out.WET ??= R.wetness.WET;
    out.fin ??= R.wetness?.fin ?? R.fin;
    out.valueMean ??= R.tint?.valueMean ?? R.valueMean;
  }
  return out;
}

function specOf(m: MeshStandardMaterial, tier: Tier, file: FileRules): Spec | null {
  const x = xOf(m);
  const role = x?.role;
  if (role !== 'body' && role !== 'eye' && role !== 'fin') return null;
  const R = x?.runtime ?? {};
  const own = R.wetness?.WET as WetTable | undefined;
  const Wx: WetTable = own?.wet ? own : file.WET ?? {};
  const master = num(R.wetness?.master?.wetness ?? R.master?.wetness ?? R.wetness?.default ?? x?.master?.wetness ?? file.master, 1);
  const wet = { ...WET_DEFAULT.wet, ...Wx.wet }, dry = { ...WET_DEFAULT.dry, ...Wx.dry }, damp = { ...WET_DEFAULT.damp, ...Wx.damp }, mudX = { ...WET_DEFAULT.mud, ...Wx.mud };
  const gamma = num(Wx.gamma, WET_DEFAULT.gamma), carry = num(Wx.carry, WET_DEFAULT.carry);
  const W = {
    gamma, carry, dK: dry.roughness - wet.roughness * carry, wetCc: num(wet.clearcoat, 1), dampCc: num(damp.clearcoat, 0.2),
    albedo: num(wet.albedo, 0.85), saturation: num(wet.saturation, 1.1), skinSpecular: num(wet.skinSpecular, 0.2),
  };
  const mud = { colour: linear(mudX.colour, [0.27, 0.25, 0.22]), roughness: num(mudX.roughness, 0.7), ventral: (mudX.ventral ?? [0.15, 0.75]) as [number, number] };
  // (the hero's and lod1's skin read the packed map; lod2's has its colour only)
  const packed = role === 'body' && !!m.roughnessMap;
  let wetMap: Spec['wetMap'] = null;
  if (packed) {
    const ch = bodyChannels(x);
    const so = R.wetness?.specularOcclusion;
    wetMap = {
      retain: ch.retain,
      // (an occlusion the material does not apply itself: round T2's, in a channel three never reads)
      ao: ch.ao && !m.aoMap ? ch.ao : null,
      so: so && ch.ao && ch.film ? { min: num(so.min, 0.25), ao0: num(so.ao?.[0], 0.15), ao1: num(so.ao?.[1], 0.85) } : null,
    };
  }
  const farRough = role === 'body' && !packed ? { wet: num(R.roughness?.wet, wet.roughness), dry: num(R.roughness?.dry, dry.roughness) } : null;
  const F = R.wetness?.fin ?? R.fin ?? file.fin;
  const fin = role === 'fin' ? { wet: num(F?.wet, FIN_DEFAULT.wet), dry: num(F?.dry, FIN_DEFAULT.dry), albedo: num(F?.albedo, FIN_DEFAULT.albedo) } : null;
  const own0 = role === 'fin' ? num(F?.master, master) : master;
  const T = role === 'fin' ? R.translucency : undefined;
  const trans = T ? {
    diffuse: num(T.diffuse, 0.8), tintPower: num(T.tintPower, 0.8), forward: num(T.forward, 2), forwardPower: num(T.forwardPower, 4), environment: num(T.environment, 0),
    stop: Array.isArray(T.stopAlpha) && T.stopAlpha.length === 2 ? [T.stopAlpha[0], T.stopAlpha[1]] as [number, number] : null,
  } : null;
  const P = role === 'eye' ? R.pupil : undefined;
  const iris = rectOf(x?.irisRect);
  const rgb = (c: number[] | undefined): Rgb | null => (Array.isArray(c) && c.length >= 3 && c.every(Number.isFinite) ? [c[0], c[1], c[2]] : null);
  const teal = rgb(P?.teal);
  const variants = Object.fromEntries(Object.entries(P?.variants ?? {}).map(([k, c]) => [k, rgb(c)]).filter(([, c]) => c)) as Record<string, Rgb>;
  const pupil = teal && iris ? { teal, rect: iris, variants } : null;
  const capRect = role === 'eye' ? rectOf(x?.skinRect) : null;
  const valueMean = num(R.tint?.valueMean ?? R.valueMean ?? file.valueMean, VALUE_MEAN);
  const blended = role === 'fin' && m.transparent;
  const spec: Omit<Spec, 'key'> = {
    role, tier, master: own0, wetMap, farRough, fin, W, mud, trans, pupil, capRect, valueMean,
    bars: role === 'body',
    occlusion: role === 'fin',
    depthWrite: blended && x?.blend?.depthWrite !== false,
    shadowHash: blended && x?.shadow !== false && (x?.shadow === undefined || x.shadow.alphaHash !== false),
  };
  // (the key: the shader text's inputs — not the tier, so tiers whose rules agree may share a program)
  const { tier: _tier, ...text } = spec;
  return { ...spec, key: `tobihaze-${role}${packed ? '' : role === 'body' ? '-far' : ''}-v1-${hashOf(JSON.stringify(text))}` };
}

// --------------------------------------------------------------------------------------------------- the shader

const f = (v: number): string => {
  const s = (+v.toFixed(6)).toString();
  return /[.e]/.test(s) ? s : `${s}.0`;
};
const v3 = (c: readonly number[]): string => `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;
const v4 = (c: readonly number[]): string => `vec4(${f(c[0])}, ${f(c[1])}, ${f(c[2])}, ${f(c[3])})`;

const VERT_PARS = /* glsl */ `
varying vec3 vTbWorld;
`;
const VERT_WORLD = /* glsl */ `
#include <project_vertex>
// (after the skinning and the blend shapes: where the surface is, for the water's line and the body's shadow)
vTbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAG_PARS = /* glsl */ `
uniform vec4 uTbState;   // x wetness, y mud, z bars, w dark
uniform vec4 uTbTint;    // x hue (deg), y saturation x, z value x, w contrast
uniform vec4 uTbLift;    // rgb toward (linear), a amount
uniform vec4 uTbPupil;   // rgb the pupil's colour (linear), a 1 when it is not the map's own
uniform vec4 uTbFlags;   // x the tint or dark on, y the water's surface (world y), z 1 when there is water about, w the body's shadow on
uniform vec4 uTbRules;   // the rules that change the static picture, 1 on (debugging): x the T2 occlusion, y the fins' translucency, z the water, w the body's shadow
uniform mat4 uTbBodyA;   // world -> the front body's unit sphere
uniform mat4 uTbBodyB;   // world -> the hind body's
varying vec3 vTbWorld;
vec3 tbHsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 tbRgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
bool tbIn(vec2 uv, vec4 r) { return all(greaterThanEqual(uv, r.xy)) && all(lessThanEqual(uv, r.xy + r.zw)); }
// the 1 above the water's surface, 0 below (a few millimetres soft: the surface's own ripples)
float tbAir() { return uTbFlags.z * uTbRules.z > 0.5 ? smoothstep(-0.0015, 0.0015, vTbWorld.y - uTbFlags.y) : 1.0; }
// the light toward world direction d from the fragment, past one of the body's ellipsoids: 0 straight through it, 1 clear
float tbPast(mat4 inv, vec3 d) {
  vec3 o = (inv * vec4(vTbWorld, 1.0)).xyz, e = (inv * vec4(d, 0.0)).xyz;
  float t = -dot(o, e) / max(dot(e, e), 1e-12);
  return t <= 0.0 ? 1.0 : smoothstep(0.72, 1.0, length(o + e * t));
}
// the body's shadow on a fin for a light toward view-space direction l
float tbBodyLight(vec3 l) {
  if (uTbFlags.w * uTbRules.w < 0.5) return 1.0;
  vec3 d = inverseTransformDirection(l, viewMatrix);
  return tbPast(uTbBodyA, d) * tbPast(uTbBodyB, d);
}
`;

/** after three's map: the bars (the body's A), the pupil's colour (the eye's A in the iris rect), then the tint and dark */
function mapPart(s: Spec): string {
  const tint = /* glsl */ `
    vec3 h = tbHsv(max(diffuseColor.rgb, vec3(0.0)));
    h.x = fract(h.x + uTbTint.x / 360.0);
    h.y = clamp(h.y * uTbTint.y, 0.0, 1.0);
    h.z = max(0.0, ${f(s.valueMean)} + (h.z - ${f(s.valueMean)}) * uTbTint.w) * uTbTint.z * mix(1.0, 0.45, uTbState.w);
    diffuseColor.rgb = mix(tbRgb(h), uTbLift.rgb, clamp(uTbLift.a, 0.0, 1.0));`;
  return /* glsl */ `
#include <map_fragment>
{
#ifdef USE_MAP
  float tbA = sampledDiffuseColor.a;
${s.bars ? '  // (the excitement crossbands: the map\'s A is their mask, not an opacity)\n  diffuseColor.rgb *= 1.0 - 0.6 * uTbState.z * tbA;\n  diffuseColor.a = 1.0;' : ''}
${s.pupil ? `  // (the pupil's colour: the map's A in the iris rect is the glow's weight, the map holds the teal)
  if (uTbPupil.w > 0.5 && tbIn(vMapUv, ${v4(s.pupil.rect)})) diffuseColor.rgb = max(diffuseColor.rgb + tbA * (uTbPupil.rgb - ${v3(s.pupil.teal)}), vec3(0.0));
  diffuseColor.a = 1.0;` : ''}
#endif
  if (uTbFlags.x > 0.5) {
${s.capRect ? `#ifdef USE_MAP
    // (the eye: its skin caps only, the window never)
    if (tbIn(vMapUv, ${v4(s.capRect)})) {${tint}
    }
#endif` : tint}
  }
}`;
}

/** the skin of the hero and lod1 on the packed map: the wet rule per texel by the retention (extras runtime.wetness.rule) */
function wetPart(s: Spec): string {
  const M = s.wetMap!, W = s.W;
  const so = M.so && M.ao ? `mix(${f(M.so.min)}, 1.0, smoothstep(${f(M.so.ao0)}, ${f(M.so.ao1)}, texelRoughness.${M.ao}))` : '1.0';
  return /* glsl */ `
#include <metalnessmap_fragment>
float tbCc = 0.0, tbCc0 = 0.0, tbSo = 1.0, tbRr = roughnessFactor, tbE = 1.0, tbE0 = 1.0, tbMw = 0.0;
#ifdef USE_ROUGHNESSMAP
{
  float g = ${f(W.gamma)}, ret = texelRoughness.${M.retain};
  // the local wetness: the master's (what the maps hold) and the fish's
  float wl0 = clamp(${f(s.master)} * (1.0 + g) - g * (1.0 - ret), 0.0, 1.0);
  float wl = clamp(uTbState.x * (1.0 + g) - g * (1.0 - ret), 0.0, 1.0);
  // the wet state's roughness back from G (the map is the rule at wl0), then the rule at wl
  float wetR = (texelRoughness.g - (1.0 - wl0) * ${f(W.dK)}) / (wl0 + (1.0 - wl0) * ${f(W.carry)});
  tbRr = mix(${f(W.dK)} + wetR * ${f(W.carry)}, wetR, wl);
  float cw = smoothstep(0.35, 1.0, wl), cw0 = smoothstep(0.35, 1.0, wl0);
  tbCc = ${f(W.wetCc)} * cw + ${f(W.dampCc)} * (1.0 - cw) * smoothstep(0.15, 0.5, wl);
  tbCc0 = ${f(W.wetCc)} * cw0 + ${f(W.dampCc)} * (1.0 - cw0) * smoothstep(0.15, 0.5, wl0);
  tbSo = ${so};
  // the mud: settles by the downward normal, takes the film
  vec3 nW = inverseTransformDirection(normalize(vNormal), viewMatrix);
  tbMw = clamp(uTbState.y * (0.45 + 0.55 * smoothstep(${f(s.mud.ventral[0])}, ${f(s.mud.ventral[1])}, -nW.y)), 0.0, 1.0);
  roughnessFactor = mix(roughness * tbRr, ${f(s.mud.roughness)}, tbMw);
  tbE = wl * (1.0 - tbMw); tbE0 = wl0;
  float am = mix(${f(1 / W.albedo)}, 1.0, tbE) / mix(${f(1 / W.albedo)}, 1.0, tbE0);
  float sat = mix(${f(1 / W.saturation)}, 1.0, tbE) / mix(${f(1 / W.saturation)}, 1.0, tbE0);
  vec3 c = diffuseColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(max(mix(vec3(l), c, sat), vec3(0.0)) * am, ${v3(s.mud.colour)}, tbMw * 0.85);
}
#endif`;
}

/** lod2's body (its light baked in, no packed map): wetness moves the roughness — the extras' roughness rule as an
 * offset from the static factor, the identity at the master (round T3's contract: 0.45 + (0.6 − 0.35)·(1 − w)) — and
 * the mud as the skin's (the albedo follows the wetness too, relative to the master, so a fish does not change shade
 * at the lod1/lod2 switch) */
function farPart(s: Spec): string {
  const R = s.farRough!, W = s.W;
  return /* glsl */ `
#include <roughnessmap_fragment>
{
  float w = clamp(uTbState.x, 0.0, 1.0);
  vec3 nW = inverseTransformDirection(normalize(vNormal), viewMatrix);
  float mw = clamp(uTbState.y * (0.45 + 0.55 * smoothstep(${f(s.mud.ventral[0])}, ${f(s.mud.ventral[1])}, -nW.y)), 0.0, 1.0);
  roughnessFactor = mix(roughnessFactor + ${f(R.dry - R.wet)} * (${f(s.master)} - w), ${f(s.mud.roughness)}, mw);
  float e = w * (1.0 - mw);
  float am = mix(${f(1 / W.albedo)}, 1.0, e) / mix(${f(1 / W.albedo)}, 1.0, ${f(s.master)});
  diffuseColor.rgb = mix(diffuseColor.rgb * am, ${v3(s.mud.colour)}, mw * 0.85);
}`;
}

/** the fins' own wet rule (no packed map): the roughness and the albedo relative to the master, the mud toward its colour */
function finPart(s: Spec): string {
  const F = s.fin!;
  return /* glsl */ `
#include <roughnessmap_fragment>
{
  float w = clamp(uTbState.x, 0.0, 1.0);
  roughnessFactor *= mix(${f(F.dry)}, ${f(F.wet)}, w) / ${f(F.dry + (F.wet - F.dry) * s.master)};
  float am = mix(${f(1 / F.albedo)}, 1.0, w) / mix(${f(1 / F.albedo)}, 1.0, ${f(s.master)});
  diffuseColor.rgb = mix(diffuseColor.rgb * am, ${v3(s.mud.colour)}, clamp(uTbState.y, 0.0, 1.0) * 0.6);
}`;
}

/** after three sets the material up: the film and its roughness (the skin), the skin's own specular, the water */
function physicalPart(s: Spec): string {
  const skin = s.wetMap ? /* glsl */ `
#ifdef USE_CLEARCOAT
  // the film: the static coverage moved by the rule's change from the master (round T2's map holds the master's film
  // with its occlusion; round T3's is a constant 1 at a wet master), gone under the mud; its roughness the skin's x the
  // material's factor (the static is G x the factor: the rule at the master)
  material.clearcoat = saturate(material.clearcoat + (tbCc - tbCc0) * tbSo) * (1.0 - tbMw);
  material.clearcoatRoughness = min(max(tbRr * clearcoatRoughness, 0.0525) + geometryRoughness, 1.0);
#endif
  {
    // the skin's own specular rises as the film leaves it (velvety, not satin), at most to 1
#ifdef USE_SPECULAR
    float cap = 1.0 / max(specularIntensity, 1e-3);
#else
    float cap = 1.0;
#endif
    float k = min(cap, mix(1.0, ${f(s.W.skinSpecular)}, tbE) / mix(1.0, ${f(s.W.skinSpecular)}, tbE0));
    material.specularColor *= k; material.specularColorBlended *= k; material.specularF90 = min(material.specularF90 * k, 1.0);
  }` : '';
  return /* glsl */ `
#include <lights_physical_fragment>
${skin}
  {
    // under the water the film and the skin's specular all but vanish (index-matched)
    float air = tbAir(), k = mix(${f(UNDERWATER_SPECULAR)}, 1.0, air);
    material.specularColor *= k; material.specularColorBlended *= k; material.specularF90 *= k;
#ifdef USE_CLEARCOAT
    material.clearcoat *= air;
#endif
  }`;
}

/** the fins' diffuse transmission (extras runtime.translucency, finatlas.mjs FIN_TRANSLUCENCY) with the body's shadow */
function transPart(s: Spec): string {
  const T = s.trans!;
  const stop = T.stop ? `(1.0 - smoothstep(${f(T.stop[0])}, ${f(T.stop[1])}, diffuseColor.a))` : '1.0';
  return /* glsl */ `
#include <lights_fragment_end>
{
  vec3 tint = ${f(T.diffuse)} * ${stop} * pow(max(material.diffuseColor, vec3(1e-4)), vec3(${f(T.tintPower)}));
  vec3 e = vec3(0.0);
#if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    vec3 l = directionalLights[i].direction;
    float through = saturate(dot(-normal, l));
    float fw = pow(saturate(dot(geometryViewDir, -l)), ${f(T.forwardPower)});
    e += directionalLights[i].color * (through + ${f(T.forward)} * fw * step(0.0, -dot(normal, l))) * tbBodyLight(l);
  }
#endif
${T.environment ? `#if defined(USE_ENVMAP) && defined(STANDARD)\n  e += ${f(T.environment)} * getIBLIrradiance(-normal);\n#endif` : ''}
  reflectedLight.directDiffuse += tint * e * RECIPROCAL_PI * uTbRules.y;
}`;
}

/** the body's shadow on a fin's direct light (three's direct lighting runs through RE_Direct) */
const OCCLUDED_DIRECT = /* glsl */ `
#include <lights_physical_pars_fragment>
void RE_Direct_Tobihaze(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  IncidentLight l = directLight;
  l.color *= tbBodyLight(directLight.direction);
  RE_Direct_Physical(l, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Tobihaze
`;

/** a T2 body's occlusion (the packed map's channel nothing else reads), as three's aoMap does (not the film's: the
 * film's coverage already holds its specular occlusion) */
function aoPart(s: Spec): string {
  return /* glsl */ `
#include <aomap_fragment>
#if defined(USE_ROUGHNESSMAP) && !defined(USE_AOMAP)
{
  float ao = mix(1.0, texelRoughness.${s.wetMap!.ao}, uTbRules.x);
  reflectedLight.indirectDiffuse *= ao;
#if defined(USE_ENVMAP) && defined(STANDARD)
  reflectedLight.indirectSpecular *= computeSpecularOcclusion(saturate(dot(geometryNormal, geometryViewDir)), ao, material.roughness);
#endif
}
#endif`;
}

/** the uniforms an instance (one fish's model) shares between its materials */
export interface TobiUniforms {
  [name: string]: IUniform;
  uTbState: IUniform<Vector4>;
  uTbTint: IUniform<Vector4>;
  uTbLift: IUniform<Vector4>;
  uTbPupil: IUniform<Vector4>;
  uTbFlags: IUniform<Vector4>;
  uTbRules: IUniform<Vector4>;
  uTbBodyA: IUniform<Matrix4>;
  uTbBodyB: IUniform<Matrix4>;
}

function makeUniforms(master: number): TobiUniforms {
  return {
    uTbState: { value: new Vector4(master, 0, 0, 0) },
    uTbTint: { value: new Vector4(0, 1, 1, 1) },
    uTbLift: { value: new Vector4(0.27, 0.27, 0.27, 0) },
    uTbPupil: { value: new Vector4(0, 0, 0, 0) },
    uTbFlags: { value: new Vector4(0, -1e4, 0, 0) },
    uTbRules: { value: new Vector4(1, 1, 1, 1) },
    uTbBodyA: { value: new Matrix4() },
    uTbBodyB: { value: new Matrix4() },
  };
}

/** The shader hook for a material of this spec, binding these uniforms (every copy: the same text, its own uniforms). */
function hookFor(s: Spec, U: TobiUniforms): (shader: WebGLProgramParametersWithUniforms) => void {
  return (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <project_vertex>', VERT_WORLD);
    let fs = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <map_fragment>', mapPart(s))
      .replace('#include <lights_physical_fragment>', physicalPart(s));
    if (s.wetMap) fs = fs.replace('#include <metalnessmap_fragment>', wetPart(s));
    if (s.wetMap?.ao) fs = fs.replace('#include <aomap_fragment>', aoPart(s));
    if (s.farRough) fs = fs.replace('#include <roughnessmap_fragment>', farPart(s));
    if (s.fin) fs = fs.replace('#include <roughnessmap_fragment>', finPart(s));
    if (s.occlusion) fs = fs.replace('#include <lights_physical_pars_fragment>', OCCLUDED_DIRECT);
    if (s.trans) fs = fs.replace('#include <lights_fragment_end>', transPart(s));
    shader.fragmentShader = fs;
  };
}

// ------------------------------------------------------------------------------------------- shared materials

/** the blended fins' depth materials (by coverage), one per fin material (its atlas): three hands each the mesh's map */
const depthMaterials = new WeakMap<Material, MeshDepthMaterial>();
function depthFor(m: MeshStandardMaterial, hash: boolean): MeshDepthMaterial {
  let d = depthMaterials.get(m);
  if (!d) {
    // (the shadow pass copies the mesh material's map and alphaTest onto it: hashed by the membrane's coverage, or cut
    // at the masked fins' own 0.5)
    d = new MeshDepthMaterial({ map: m.map, alphaHash: hash });
    d.name = `${m.name}_depth`;
    depthMaterials.set(m, d);
  }
  return d;
}

/**
 * Readies the トビハゼ's shared (cached) materials of one loaded file (ModelLoader.prepareMaterials, after its own tier
 * rules): the contract's flags (the blended fins write depth) and the shader at the uniforms' defaults (the static GLB),
 * for anything that draws a shared material itself. Any other file's materials are left alone. Idempotent.
 */
export function prepareTobihazeMaterials(materials: readonly Material[], tier: Tier): void {
  const ours = materials.filter((m) => isTobihazeMaterial(m) && (m as MeshStandardMaterial).isMeshStandardMaterial && !specs.has(m));
  if (!ours.length) return;
  const file = fileRules(ours);
  for (const m of ours) {
    const sm = m as MeshStandardMaterial;
    const s = specOf(sm, tier, file);
    if (!s) continue;
    specs.set(m, s);
    if (s.depthWrite) sm.depthWrite = true;
    sm.onBeforeCompile = hookFor(s, makeUniforms(s.master));
    sm.customProgramCacheKey = () => s.key;
    sm.needsUpdate = true;
  }
}

// ----------------------------------------------------------------------------------------------- the individual

/** the species' variation of its individuals (species JSON variation.tint: ranges or values) */
export interface TobiVariation { tint?: { hueDeg?: Range; sat?: Range; val?: Range } }
type Range = [number, number] | number | undefined;

/** An individual's own colours: its tint (behaviour §2.5's morph uniforms) and its pupil's colour. */
export interface TobiLookTraits {
  tint: { hueDeg: number; sat: number; val: number; contrast: number; lift: { colour: Rgb; amount: number } };
  pupil: 'teal' | 'red' | 'black';
}

/**
 * One fish's look as its driver keeps it: the same object on every mesh of its model (mesh.userData.tobihazeLook, set
 * in Driver.attach), changed in place as the behaviour runs; the materials read it as they draw, so the driver calls
 * nothing here. Every field is optional, and a model without the object draws the static GLB.
 */
export interface TobiLookState {
  /** the water film: 0 dry … 1 just out of the water (behaviour TobiFrame.skin.wet) */
  wet?: number;
  /** the mud on the skin 0..1 (TobiFrame.skin.mud) */
  mud?: number;
  /** the excitement bars and the darkening 0..1 (TobiFrame.colour) */
  bars?: number;
  dark?: number;
  /** the water's surface at the fish (m), in the frame the model's root sits in (DriverContext.floor.waterAt) */
  waterY?: number;
  /** under water, when waterY is not given: no film and no specular anywhere */
  submerged?: boolean;
  /** the individual's id: its tint and pupil's colour (the same fish in the flat, the net, the case and the tank) */
  id?: string;
  /** the species' variation, for the tint's ranges */
  variation?: TobiVariation;
  /** the individual's colours given outright (previews, the photo studio), over the ones drawn by its id */
  traits?: TobiLookTraits;
}

/** the share of fish with the reddish-brown pupil (B009, B010, B064 against u1, B002, B067 and others: teal, the map's
 * own, is the commoner in the references) */
const RED_PUPIL_SHARE = 0.35;

/** the pupil's colours (linear) when the eye's extras have none (round T2's iris.mjs EYE_MATERIAL runtime.pupil) */
const PUPILS: Record<'teal' | 'red' | 'black', Rgb> = {
  teal: [0.02843, 0.11193, 0.11697],
  red: [0.14413, 0.0356, 0.01938],
  black: [0.00335, 0.007, 0.007],
};

/** A stable number in [0, 1) from an id and a salt. */
function unit(id: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

const pick = (r: Range, u: number, d: number): number => (Array.isArray(r) ? r[0] + (r[1] - r[0]) * u : typeof r === 'number' ? r : d);

/**
 * An individual's colours from its id (or its variant: variantOf(id), the number the loader gets with its model, so
 * the fish in the net or the case wears the pupil it wore on the flat) and the species' variation (variation.tint:
 * hueDeg, sat, val; without it no tint).
 */
export function tobihazeTraits(id: string | number, variation?: TobiVariation): TobiLookTraits {
  const seed = `#${typeof id === 'number' ? id >>> 0 : variantOf(id)}`, t = variation?.tint;
  return {
    tint: {
      hueDeg: pick(t?.hueDeg, unit(seed, 1), 0), sat: pick(t?.sat, unit(seed, 2), 1), val: pick(t?.val, unit(seed, 3), 1),
      contrast: 1, lift: { colour: [0.27, 0.27, 0.27], amount: 0 },
    },
    pupil: unit(seed, 4) < RED_PUPIL_SHARE ? 'red' : 'teal',
  };
}

/** a look without an id: colours drawn once per look object (stable across its tiers) */
const anonymous = new WeakMap<object, TobiLookTraits>();
let anonymousCount = 0;

const clamp01 = (v: number | undefined, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

// ------------------------------------------------------------------------------------------------- instances

/** one model instance: its uniforms, the look it draws, the bones its body's shadow rides */
class Instance {
  readonly uniforms: TobiUniforms;
  /** the pupil's colours the eye's extras give (linear), by name */
  pupils: Record<string, Rgb> = {};
  private readonly joints: (Bone | null)[];
  private readonly frames: Matrix4[];
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private lastFrame = -1;
  private lookId: string | undefined;
  private traits: TobiLookTraits | null = null;

  constructor(
    readonly master: number, bones: Record<string, Bone>, tlM: number,
    private readonly root: Object3D, private readonly meshes: readonly Mesh[], fins: boolean,
    /** the model's variant (ModelLoader's: variantOf the individual's id), its colours without a look */
    private readonly variant?: number,
  ) {
    this.uniforms = makeUniforms(master);
    this.joints = BODY_SHADOW.map((b) => bones[b.joint] ?? null);
    this.frames = BODY_SHADOW.map((b) => new Matrix4().compose(
      new Vector3(b.centre[0] * tlM, b.centre[1] * tlM, b.centre[2] * tlM),
      new Quaternion(),
      new Vector3(b.semi[0] * tlM, b.semi[1] * tlM, b.semi[2] * tlM),
    ));
    this.uniforms.uTbFlags.value.w = fins && this.joints.every((j) => j) ? 1 : 0;
  }

  /** the look the driver hung on the meshes (one object for all of them) */
  look(): TobiLookState | null {
    for (const m of this.meshes) { const l = m.userData.tobihazeLook as TobiLookState | undefined; if (l) return l; }
    return null;
  }

  /**
   * The uniforms from the look and the bones, once per render call, before the instance's first draw in it (every
   * mesh's onBeforeRender: three uploads a material's uniforms at its first draw in a call, and the instance's materials
   * are its own). A few numbers and two matrix products: about a microsecond.
   */
  readonly sync = (renderer: { info: { render: { frame: number } } }): void => {
    const frame = renderer.info.render.frame;
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    const U = this.uniforms, L = this.look();
    if (L) {
      U.uTbState.value.set(clamp01(L.wet, this.master), clamp01(L.mud, 0), clamp01(L.bars, 0), clamp01(L.dark, 0));
      if (typeof L.waterY === 'number' && Number.isFinite(L.waterY)) {
        // (to the world: the water is level in the frame the root sits in)
        this.p.set(this.root.position.x, L.waterY, this.root.position.z);
        if (this.root.parent) this.root.parent.localToWorld(this.p);
        U.uTbFlags.value.y = this.p.y;
        U.uTbFlags.value.z = 1;
      } else if (L.submerged) { U.uTbFlags.value.y = 1e4; U.uTbFlags.value.z = 1; } else U.uTbFlags.value.z = 0;
      this.applyTraits(L);
    } else if (this.variant !== undefined && !this.traits) this.applyTraits({});
    if (U.uTbFlags.value.w > 0.5) {
      const [a, b] = this.joints;
      U.uTbBodyA.value.copy(this.m.multiplyMatrices(a!.matrixWorld, this.frames[0]).invert());
      U.uTbBodyB.value.copy(this.m.multiplyMatrices(b!.matrixWorld, this.frames[1]).invert());
    }
  };

  private applyTraits(L: TobiLookState): void {
    if (L.traits) this.traits = L.traits;
    else if (!this.traits || L.id !== this.lookId) {
      this.lookId = L.id;
      // (by the id; without one by the model's variant; without either, once per look object)
      let t = L.id || this.variant !== undefined ? null : anonymous.get(L) ?? null;
      if (!t) {
        t = tobihazeTraits(L.id ?? this.variant ?? `look#${++anonymousCount}`, L.variation);
        if (!L.id && this.variant === undefined) anonymous.set(L, t);
      }
      this.traits = t;
    }
    const U = this.uniforms, T = this.traits.tint;
    U.uTbTint.value.set(T.hueDeg, T.sat, T.val, T.contrast);
    U.uTbLift.value.set(T.lift.colour[0], T.lift.colour[1], T.lift.colour[2], T.lift.amount);
    // (the eye's own colours from its extras; these the fallback)
    const p = this.pupils[this.traits.pupil] ?? PUPILS[this.traits.pupil];
    U.uTbPupil.value.set(p[0], p[1], p[2], this.traits.pupil === 'teal' ? 0 : 1);
    const t = U.uTbTint.value;
    U.uTbFlags.value.x = t.x !== 0 || t.y !== 1 || t.z !== 1 || t.w !== 1 || U.uTbLift.value.w > 0 || U.uTbState.value.w > 0 ? 1 : 0;
  }
}

/** the instance each mesh belongs to */
const instances = new WeakMap<Object3D, Instance>();

/**
 * Gives a freshly instantiated トビハゼ model (ModelLoader.instantiateModel) its own copies of the shared materials, one
 * uniform set for all of them, the fins' depth materials (the shadow by coverage), and the hook that reads the
 * individual's look and the body's place before each draw. A no-op for any other model. `tlMM`: the GLB's total length
 * (root extras tobihaze.tlMM); `variant`: the individual's (variantOf its id), for its colours when no look is hung.
 */
export function instanceTobihaze(meshes: readonly Mesh[], tlMM?: number, variant?: number): void {
  const specOfMesh = (o: Mesh): Spec | undefined => (Array.isArray(o.material) ? undefined : specs.get(o.material as Material));
  const ours = meshes.map(specOfMesh).filter((s): s is Spec => !!s);
  if (!ours.length) return;
  // (the fish's wetness at rest is the skin's master: the static GLB until a driver says otherwise)
  const master = (ours.find((s) => s.role === 'body') ?? ours[0]).master;
  const bones: Record<string, Bone> = {};
  for (const o of meshes) for (const b of (o as SkinnedMesh).skeleton?.bones ?? []) bones[b.name] = b;
  let root: Object3D = meshes[0];
  while (root.parent) root = root.parent;
  const inst = new Instance(master, bones, (tlMM ?? MODEL_TL_M * 1000) / 1000, root, meshes, ours.some((s) => s.occlusion), variant);
  const eye = ours.find((s) => s.pupil)?.pupil;
  if (eye) inst.pupils = { teal: eye.teal, ...eye.variants };
  for (const mesh of meshes) {
    const base = mesh.material as Material;
    const s = specOfMesh(mesh);
    if (!s) continue;
    const c = (base as MeshStandardMaterial).clone();
    // (the extras as they are, not a deep copy per instance; the defines a clone keeps)
    c.userData = base.userData;
    c.onBeforeCompile = hookFor(s, inst.uniforms);
    c.customProgramCacheKey = () => s.key;
    specs.set(c, s);
    // (the instance's uniforms where a debugger or the smoke test can read them; not copied by clone or toJSON)
    Object.defineProperty(c, 'tobihazeUniforms', { value: inst.uniforms });
    mesh.material = c;
    mesh.onBeforeRender = inst.sync;
    instances.set(mesh, inst);
    if (s.role === 'fin') mesh.customDepthMaterial = depthFor(base as MeshStandardMaterial, s.shadowHash);
  }
}

/** The uniforms of the instance a mesh belongs to (debugging, tests). */
export function tobihazeUniformsOf(mesh: Object3D): TobiUniforms | null {
  return instances.get(mesh)?.uniforms ?? null;
}

/** What a frame of the behaviour gives the look (TobiFrame's fields, by shape). */
export interface TobiLookFrame {
  skin?: { wet: number; mud: number };
  colour?: { bars: number; dark: number };
}

/**
 * A driver's helper for the look: the object (state) hung on the model's meshes at attach, filled from the behaviour's
 * frame and the floor at each update. A driver may as well keep its own object of TobiLookState's shape.
 */
export class TobihazeLook {
  readonly state: TobiLookState;

  constructor(id?: string, variation?: TobiVariation) {
    this.state = { id, variation };
  }

  /** Hang the look on a model's meshes (Driver.attach's). */
  attach(meshes: readonly Object3D[]): void {
    for (const m of meshes) m.userData.tobihazeLook = this.state;
  }

  /** The behaviour's frame and the water at the model's root (its floor: the flat's, the tank's or the case's). */
  update(frame: TobiLookFrame, floor?: { waterAt(x: number, z: number): number }, root?: Object3D | null): void {
    const s = this.state;
    if (frame.skin) { s.wet = frame.skin.wet; s.mud = frame.skin.mud; }
    if (frame.colour) { s.bars = frame.colour.bars; s.dark = frame.colour.dark; }
    if (floor && root) s.waterY = floor.waterAt(root.position.x, root.position.z);
  }
}
