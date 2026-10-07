import {
  Color, DataTexture, MeshPhysicalMaterial, RGBAFormat, type IUniform, type Material, type Mesh, type Texture, type WebGLProgramParametersWithUniforms,
} from 'three';
import { WAVES_GLSL } from '../../../world/Waves';

/**
 * Wet skin for the トビハゼ. A mudskipper's skin is covered by a mucus film it must keep wet (it breathes through it:
 * capillaries lie within a few µm of the surface). In air the film is a clear, glossy layer over the skin; as it dries
 * the skin turns paler, greyer and matte, first on the top of the head, the eye turrets and the back; in the folds
 * and on the belly it stays wet longest. Under water there is no air–mucus interface, so the gloss disappears and the
 * colours deepen; just above the waterline the skin is always wet and beaded with drops. Mud cakes on the belly and
 * the lower flanks after crawling and washes off in water. Submerged parts get the same caustics as the bed.
 *
 * One set of materials per individual (the state is per animal); every instance shares the same shader programs.
 */
export interface SkinState {
  /** skin moisture 0 (dry) … 1 (fresh from the water) */
  wet: number;
  /** mud coat 0 … 1 */
  mud: number;
  /** water surface height under the animal (world y); far below the animal when it is on dry ground */
  waterY: number;
  /** colour of the mud it is crawling on (linear) */
  mudColor: Color;
}

/** Environment shared by every individual: the bed's caustic uniforms (set once the flat exists). */
const ENV: { caustics: Record<string, IUniform> | null } = { caustics: null };
export function setTobihazeEnvironment(caustics: Record<string, IUniform> | null): void {
  ENV.caustics = caustics;
}

let neutralData: DataTexture | null = null;
function neutral(): DataTexture {
  if (!neutralData) {
    neutralData = new DataTexture(new Uint8Array([110, 150, 110, 255]), 1, 1, RGBAFormat);
    neutralData.needsUpdate = true;
  }
  return neutralData;
}

const NOISE = /* glsl */ `
float tobiHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float tobiNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tobiHash(i), tobiHash(i + vec2(1, 0)), f.x), mix(tobiHash(i + vec2(0, 1)), tobiHash(i + vec2(1, 1)), f.x), f.y); }
// screen-space bump: perturb a view-space normal by a height field h (metres)
vec3 tobiBump(vec3 n, float h, vec3 pos) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - g);
}
`;

interface Uniforms {
  uWet: IUniform<number>;
  uMud: IUniform<number>;
  uWaterY: IUniform<number>;
  uMudColor: IUniform<Color>;
  uTobiData: IUniform<Texture>;
  uDropScale: IUniform<number>;
  uBodyU: IUniform<number>;
}

/**
 * The eye's sheen. Photographed live, a mudskipper's dark eye glows like a squid's: through the pupil an iridescent
 * layer deep in the eye (the lens and the reflective tissue round it) throws back the light of the sky in a band of
 * colour - teal and green seen head-on, through green-gold to copper at a slant, finely granular - that slides across
 * the pupil as the eye or the viewer moves: a crescent along its lower edge with the sky above (photograph 7), a patch
 * in the middle (photograph 3), a teal comma (photographs 1 and 8). It is modelled as a concave mirror behind the
 * pupil: the ray through each point of the pupil is reflected off the back of the globe, and the light arriving
 * along the reflected ray (the environment, the hemisphere, the sun) is returned in the layer's colour. The narrow
 * iris round the pupil has the same green-gold sheen, weaker, off its outer surface (photograph 10).
 */
const EYE_SHEEN_PARS = /* glsl */ `
float tobiEyeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tobiEyeNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tobiEyeHash(i), tobiEyeHash(i + vec2(1.0, 0.0)), f.x), mix(tobiEyeHash(i + vec2(0.0, 1.0)), tobiEyeHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// the layer's colour: t = 0 deep blue … teal … green … gold … 1 copper
vec3 tobiEyeFilm(float t) {
  vec3 c = mix(vec3(0.03, 0.12, 0.42), vec3(0.02, 0.46, 0.5), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(0.16, 0.62, 0.2), smoothstep(0.28, 0.55, t));
  c = mix(c, vec3(0.72, 0.62, 0.12), smoothstep(0.55, 0.8, t));
  return mix(c, vec3(0.75, 0.36, 0.14), smoothstep(0.82, 1.0, t));
}
// light arriving along the (view space) direction r: the bright sky above and the sun (the ground and the eye's own
// shadowed socket reflect next to nothing, so most of the pupil stays black)
vec3 tobiEyeLight(vec3 v, vec3 r, vec3 up) {
  // (the horizon edges the glow into a crescent or comma, softly: photographs 1, 7, 8; a bright light makes a
  // patch of its own, photograph 3)
  float sky = smoothstep(-0.35, 0.35, dot(r, up));
  vec3 l = vec3(0.0);
  #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
    l += getIBLRadiance(v, normalize(v + r), 0.45) * smoothstep(-0.4, 0.4, dot(r, up)) * 0.8;
  #endif
  #if NUM_HEMI_LIGHTS > 0
    for (int i = 0; i < NUM_HEMI_LIGHTS; i++) l += hemisphereLights[i].skyColor * sky * 0.45;
  #endif
  #if NUM_DIR_LIGHTS > 0
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) { float c = max(dot(r, directionalLights[i].direction), 0.0); l += directionalLights[i].color * (0.12 * pow(c, 3.0) + 0.45 * pow(c, 12.0)); }
  #endif
  return l;
}
`;
const EYE_SHEEN_MAIN = /* glsl */ `
{
  // the globe's polar texture: centre = optical axis, theta = |uv - 0.5| * 2 pi; the pupil a horizontal oval, the iris
  // a thin ring round it (half-angles as in tools/models/tobihaze/eye.mjs: PUPIL_H, PUPIL_V, limbAt)
  vec2 e = (vMapUv - 0.5) * 6.2831853;
  float pr = length(e / vec2(0.62, 0.46));
  float ir = length(e / vec2(0.82, 0.68));
  float pupil = 1.0 - smoothstep(0.9, 1.0, pr);
  float iris = smoothstep(0.95, 1.08, pr) * (1.0 - smoothstep(0.9, 1.0, ir));
  if (pupil + iris > 0.0) {
    vec3 v = geometryViewDir;
    vec3 n = geometryNormal;
    vec3 d = -v;
    float nd = dot(n, d);
    // the ray through the pupil meets the back of the globe where its normal is n - 2 (n.d) d; reflected there
    vec3 nq = n - 2.0 * nd * d;
    vec3 r = normalize(d - 2.0 * dot(d, nq) * nq);
    // fine granules over a larger mottling (photograph 3)
    vec2 g = vMapUv * 300.0;
    float gr = 0.4 * tobiEyeNoise(g) + 0.25 * tobiEyeNoise(g * 2.1 + 7.3) + 0.35 * tobiEyeNoise(vMapUv * 45.0 + 3.1);
    float low = clamp(e.y / 0.46, -1.0, 1.0);
    // (head-on green with teal and gold flecks, golder at a slant, bluer along its lower edge: photographs 3 and 7)
    float hue = tobiEyeNoise(vMapUv * 520.0 + 11.7) * 0.6 + tobiEyeNoise(vMapUv * 210.0 + 4.2) * 0.4;
    float t = clamp(1.45 - abs(nd) + 0.35 * (gr - 0.5) + 0.7 * (hue - 0.5) - 0.25 * low, 0.0, 1.0);
    vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 sheen = tobiEyeFilm(t) * tobiEyeLight(v, r, up) * (0.3 + 0.7 * gr) * 1.2;
    // the iris: the same colours, golder and much weaker, off its own outer face, mostly in its lower half
    vec3 ri = reflect(d, n);
    vec3 irisSheen = tobiEyeFilm(clamp(0.62 + 0.3 * (1.0 - abs(nd)) + 0.3 * (gr - 0.5), 0.0, 1.0)) * tobiEyeLight(v, ri, up) * gr * smoothstep(0.0, 0.9, low);
    reflectedLight.indirectSpecular += pupil * sheen + 0.05 * iris * irisSheen;
  }
}
`;

/** the eye's material: the sheen through the pupil (see EYE_SHEEN_PARS) */
function eyeShader(shader: WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${EYE_SHEEN_MAIN}`)
    .replace('#include <lights_pars_begin>', `#include <lights_pars_begin>\n${EYE_SHEEN_PARS}`);
}

export type TobiTier = 'hero' | 'lod1' | 'lod2';

function skinShader(u: Uniforms, tier: TobiTier, fin: boolean) {
  return (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, u);
    const caustics = tier !== 'lod2' && ENV.caustics;
    if (caustics) Object.assign(shader.uniforms, caustics);
    const drops = tier !== 'lod2' && !fin;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTobiWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTobiWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const defs = `${caustics ? '#define TOBI_CAUSTICS\n' : ''}${drops ? '#define TOBI_DROPS\n' : ''}${fin ? '#define TOBI_FIN\n' : ''}`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${defs}
varying vec3 vTobiWorld;
uniform float uWet, uMud, uWaterY, uDropScale, uBodyU;
uniform vec3 uMudColor;
uniform sampler2D uTobiData;
${NOISE}
#ifdef TOBI_CAUSTICS
uniform float uTime, uSunUp, uCausticGain;
uniform vec3 uSunDirT;
${WAVES_GLSL}
#endif
float tobiWet, tobiSub, tobiMud, tobiAbove, tobiDrop, tobiFilm;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  #ifdef TOBI_FIN
  vec3 tData = vec3(0.4, 0.6, 0.4);
  vec2 tUv = vec2(0.0);
  #else
  vec3 tData = texture2D(uTobiData, vMapUv).rgb;
  vec2 tUv = vMapUv;
  #endif
  tobiAbove = vTobiWorld.y - uWaterY;
  tobiSub = 1.0 - smoothstep(-0.0004, 0.0004, tobiAbove);
  // this patch's wetness: the animal's moisture, more in mucus-rich folds, less where sun and wind dry it first
  tobiWet = clamp(uWet + (tData.g - 0.55) * 0.4 - tData.b * (1.0 - uWet) * 0.6, 0.0, 1.0);
  // sand grains stuck in the film stand out of it, dry (the data texture's mucus channel is ~0 on them)
  tobiFilm = mix(0.2, 1.0, smoothstep(0.03, 0.16, tData.g));
  // water wicks a few millimetres up the skin from the surface, and splashes keep the lowest flanks wet
  tobiWet = max(tobiWet, 1.0 - smoothstep(0.0, 0.006, tobiAbove));
  tobiWet = max(tobiWet, tobiSub);
  // drying lightens and greys the skin; wet skin is darker and more saturated
  vec3 c = diffuseColor.rgb;
  vec3 dry = mix(c, vec3(dot(c, vec3(0.3333))), 0.3) * 1.25 + 0.012;
  diffuseColor.rgb = mix(dry, c * vec3(0.94, 0.95, 0.97), tobiWet);
  // mud: caked on the belly, the lower flanks and in the folds; patchy, washed off below the waterline
  float mn = tobiNoise(vTobiWorld.xz * 1100.0 + tUv * 37.0) * 0.6 + tobiNoise(vTobiWorld.xy * 2600.0) * 0.4;
  tobiMud = clamp(uMud * (tData.r * 1.6 - 0.2) + (mn - 0.5) * 0.7 * uMud, 0.0, 1.0) * (1.0 - 0.75 * tobiSub);
  #ifdef TOBI_FIN
  tobiMud *= 0.4;
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, uMudColor * mix(1.35, 0.8, tobiWet), tobiMud * 0.9);
  // drops beaded on the wet skin in air, densest just above the waterline
  tobiDrop = 0.0;
  #ifdef TOBI_DROPS
  {
    // (only on the body's own skin: the arm and eye-dome strips of the texture are laid out quite differently, and
    // drops there would come out drawn into streaks)
    vec2 g = tUv * vec2(56.0, 26.0) * uDropScale;
    float tipFade = smoothstep(0.03, 0.08, tUv.x);
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = tobiHash(cell);
    vec2 o = vec2(tobiHash(cell + 3.7), tobiHash(cell + 9.1)) - 0.5;
    float r = mix(0.1, 0.24, tobiHash(cell + 1.3));
    float d = length(f - o * 0.45) / r;
    // in air the mucus is a continuous film: only a few small beads (fresh out of the water); they cluster just above
    // the waterline
    float keep = step(h, mix(0.0, 0.012, smoothstep(0.8, 1.0, tobiWet)) + 0.3 * (1.0 - smoothstep(0.0, 0.008, tobiAbove)));
    tobiDrop = keep * tipFade * step(tUv.x, uBodyU - 0.005) * (1.0 - tobiSub) * sqrt(max(0.0, 1.0 - d * d));
  }
  #endif
  #ifdef TOBI_CAUSTICS
  if (tobiSub > 0.01 && uSunUp > 0.01) {
    vec3 L = normalize(uSunDirT);
    float D = max(-tobiAbove, 0.0) / max(L.y, 0.2);
    float fp = length(fwidth(vTobiWorld));
    float cst = waveCaustic(vTobiWorld.xz, L, D, uTime, fp, uCausticGain);
    diffuseColor.rgb *= mix(1.0, cst, tobiSub * uSunUp * 0.85);
  }
  #endif
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  // the skin under the mucus: a little rougher when dry; mud is matte when dry and slick when wet
  roughnessFactor = mix(clamp(roughnessFactor * 1.15 + 0.2, 0.0, 1.0), roughnessFactor * 0.9, tobiWet);
  roughnessFactor = mix(roughnessFactor, mix(0.92, 0.38, tobiWet), tobiMud);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifndef TOBI_FIN
  // the uv columns converge on the very tip of the snout, where the coarse mips of the normal map would streak:
  // geometry normal over the front of the snout (u grows with arc length from the tip)
  float tobiTip = smoothstep(0.001, 0.006, vMapUv.x);
  normal = normalize(mix(nonPerturbedNormal, normal, tobiTip));
#endif
#ifdef TOBI_DROPS
  if (tobiDrop > 0.0) normal = tobiBump(normal, tobiDrop * 0.00028, -vViewPosition);
#endif`)
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>
#ifndef TOBI_FIN
  clearcoatNormal = normalize(mix(nonPerturbedNormal, clearcoatNormal, tobiTip));
#endif
#ifdef TOBI_DROPS
  if (tobiDrop > 0.0) clearcoatNormal = tobiBump(clearcoatNormal, tobiDrop * 0.00028, -vViewPosition);
#endif`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  // the air–mucus interface: a clear film while wet and in air; none under water, broken up by mud
  {
    float film = tobiWet * (1.0 - tobiSub) * (1.0 - 0.75 * tobiMud);
    film *= tobiFilm;
    film = max(film, tobiDrop);
    material.clearcoat = film * 0.85;
    // (the film follows the granular skin, so even fully wet its highlights are a little broken up)
    material.clearcoatRoughness = clamp(mix(0.38, 0.15, tobiWet) + 0.25 * tobiMud + geometryRoughness, 0.0525, 1.0);
    #ifndef TOBI_FIN
    // the papillose snout tip (and the uv pole there) never gives a mirror reflection: the film thins out over it
    // (a rough film there would smear the sky into a pale blob)
    material.clearcoat *= mix(0.45, 1.0, smoothstep(0.001, 0.006, vMapUv.x));
    #endif
  }
#endif`);
  };
}

/** Per-individual materials built from the model's own (glTF) materials. */
export class TobihazeMaterials {
  readonly uniforms: Uniforms = {
    uWet: { value: 1 },
    uMud: { value: 0 },
    uWaterY: { value: -100 },
    uMudColor: { value: new Color(0.24, 0.205, 0.165) },
    uTobiData: { value: neutral() },
    uDropScale: { value: 1 },
    uBodyU: { value: 0.8 },
  };
  private readonly made: Material[] = [];
  private readonly originals = new Map<Mesh, Material | Material[]>();

  constructor(private readonly tier: TobiTier) {}

  /** Swap the materials of the model's meshes (skin parts, fins, eyes) for per-individual wet-skin materials. */
  apply(meshes: Mesh[], dataTexture: Promise<Texture | null> | null): void {
    const cache = new Map<Material, Material>();
    const make = (src: Material): Material => {
      const hit = cache.get(src);
      if (hit) return hit;
      const role = (src.userData?.tobihaze as { role?: string } | undefined)?.role;
      let out: Material = src;
      if (role === 'skin' || role === 'fin') {
        const bodyU = (src.userData?.tobihaze as { bodyU?: number } | undefined)?.bodyU;
        if (role === 'skin' && typeof bodyU === 'number') this.uniforms.uBodyU.value = bodyU;
        const m = (src as MeshPhysicalMaterial).clone();
        m.clearcoat = 1;
        m.clearcoatRoughness = 0.04;
        // the mucus film follows the skin's relief (scales, papillae, folds): no glassy shell over it
        if (m.normalMap) { m.clearcoatNormalMap = m.normalMap; m.clearcoatNormalScale.set(1.1, 1.1); m.normalScale.set(1.6, 1.6); }
        m.onBeforeCompile = skinShader(this.uniforms, this.tier, role === 'fin');
        m.customProgramCacheKey = () => `tobihaze-${role}-${this.tier}-${ENV.caustics ? 1 : 0}`;
        if (role === 'fin') { m.depthWrite = this.tier === 'lod2'; }
        out = m;
      } else if (role === 'eye') {
        const m = (src as MeshPhysicalMaterial).clone();
        // the cornea is kept wet by blinking: always a sharp, bright reflection
        m.clearcoat = 1;
        m.clearcoatRoughness = 0.015;
        // the baked metallic-roughness map carries the copper ring and the glossy pupil
        if (!m.roughnessMap) m.roughness = 0.32;
        // (one sharp reflection, the wet cornea's: the layer under it reflects little, or the dark pupil mirrors its
        // surroundings like a glass marble)
        m.specularIntensity = 0.35;
        if (m.map) {
          m.onBeforeCompile = eyeShader;
          m.customProgramCacheKey = () => 'tobihaze-eye';
        }
        out = m;
      }
      if (out !== src) this.made.push(out);
      cache.set(src, out);
      return out;
    };
    for (const mesh of meshes) {
      this.originals.set(mesh, mesh.material);
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(make) : make(mesh.material);
    }
    if (dataTexture) void dataTexture.then((t) => { if (t) this.uniforms.uTobiData.value = t; }).catch(() => { /* keep the neutral data */ });
  }

  update(s: SkinState): void {
    const u = this.uniforms;
    u.uWet.value = s.wet;
    u.uMud.value = s.mud;
    u.uWaterY.value = s.waterY;
    u.uMudColor.value.copy(s.mudColor);
  }

  /** put the glTF materials back and free the per-individual ones */
  dispose(): void {
    for (const [mesh, mat] of this.originals) mesh.material = mat;
    this.originals.clear();
    for (const m of this.made) m.dispose();
    this.made.length = 0;
  }
}
