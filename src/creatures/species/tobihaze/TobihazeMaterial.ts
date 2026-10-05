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
uniform float uWet, uMud, uWaterY, uDropScale;
uniform vec3 uMudColor;
uniform sampler2D uTobiData;
${NOISE}
#ifdef TOBI_CAUSTICS
uniform float uTime, uSunUp, uCausticGain;
uniform vec3 uSunDirT;
${WAVES_GLSL}
#endif
float tobiWet, tobiSub, tobiMud, tobiAbove, tobiDrop;`)
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
    // (the arm and eye-dome strips of the skin texture are ~3-4x denser around than the body: drops stay round)
    float vs = tUv.x > 0.92 ? 0.34 : (tUv.x > 0.84 ? 0.26 : 1.0);
    vec2 g = tUv * vec2(56.0, 26.0 * vs) * uDropScale;
    float tipFade = smoothstep(0.03, 0.08, tUv.x);
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = tobiHash(cell);
    vec2 o = vec2(tobiHash(cell + 3.7), tobiHash(cell + 9.1)) - 0.5;
    float r = mix(0.1, 0.24, tobiHash(cell + 1.3));
    float d = length(f - o * 0.45) / r;
    // in air the mucus is a continuous film: only a few small beads (fresh out of the water); they cluster just above
    // the waterline
    float keep = step(h, mix(0.0, 0.035, smoothstep(0.8, 1.0, tobiWet)) + 0.3 * (1.0 - smoothstep(0.0, 0.008, tobiAbove)));
    tobiDrop = keep * tipFade * (1.0 - tobiSub) * sqrt(max(0.0, 1.0 - d * d));
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
  float tobiTip = smoothstep(0.004, 0.05, vMapUv.x);
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
    film = max(film, tobiDrop);
    material.clearcoat = film;
    // (the film follows the granular skin, so even fully wet its highlights are a little broken up)
    material.clearcoatRoughness = clamp(mix(0.34, 0.075, tobiWet) + 0.25 * tobiMud + geometryRoughness, 0.0525, 1.0);
    #ifndef TOBI_FIN
    // the papillose snout tip (and the uv pole there) never gives a mirror reflection: the film thins out over it
    // (a rough film there would smear the sky into a pale blob)
    material.clearcoat *= mix(0.15, 1.0, smoothstep(0.003, 0.05, vMapUv.x));
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
