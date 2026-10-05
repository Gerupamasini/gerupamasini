import { DoubleSide, LOD, Mesh, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking, Vector3, type Material, type Object3D } from 'three';

/**
 * Runtime side of the hand-net GLBs (tools/models/nets): wet / mud shading, LOD set-up and the bag's
 * morph targets.
 *
 * Every net material carries `userData.higataNet.porosity` (from the glTF extras: 0 metal .. 1 cotton)
 * and every primitive a `_dirt` attribute (0..1, where mud collects: the bag bottom, the underside of
 * the frame, the joint). Wetness darkens porous materials and makes everything glossy; mud covers
 * the high-dirt areas with a noisy silt layer that also clogs the finer meshes. Below `waterline`
 * (world Y) the parts read as fully wet.
 */
export interface NetSurface {
  /** 0 dry .. 1 dripping */
  wet: number;
  /** 0 clean .. 1 caked */
  mud: number;
  /** world-space Y under which everything is soaked (e.g. the water surface while dipping); null = off */
  waterline: number | null;
}

/** bag morph target names, in the order of the GLB's morph targets */
export const BAG_TARGETS = ['Stream', 'Invert', 'Trail', 'Wet'] as const;
export type BagTarget = (typeof BAG_TARGETS)[number];

/** distances (m) at which lod1 / lod2 take over from hero */
export const NET_LOD_DISTANCES = { hero: 0, lod1: 2.5, lod2: 9 } as const;

interface Uniforms {
  uWet: { value: number };
  uMud: { value: number };
  uWaterline: { value: number };
  uMudColor: { value: Vector3 };
  uWaterColor: { value: Vector3 };
}

const GLSL_NOISE = /* glsl */ `
float hnHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hnNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hnHash(i), hnHash(i + vec3(1, 0, 0)), f.x), mix(hnHash(i + vec3(0, 1, 0)), hnHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hnHash(i + vec3(0, 0, 1)), hnHash(i + vec3(1, 0, 1)), f.x), mix(hnHash(i + vec3(0, 1, 1)), hnHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

function patchMaterial(mat: MeshStandardMaterial, u: Uniforms): void {
  const ud = (mat.userData.higataNet ?? {}) as { porosity?: number; role?: string };
  const porosity = ud.porosity ?? 0.3;
  const isNet = ud.role === 'net';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uPorosity: { value: porosity } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _dirt;\nvarying float vNetDirt;\nvarying vec3 vNetWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvNetDirt = _dirt;\nvNetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWet; uniform float uMud; uniform float uWaterline; uniform vec3 uMudColor; uniform vec3 uWaterColor; uniform float uPorosity;
varying float vNetDirt; varying vec3 vNetWorld;
float netMudMask; float netWetMask;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float n = hnNoise(vNetWorld * 38.0) * 0.6 + hnNoise(vNetWorld * 140.0) * 0.4;
  float cover = vNetDirt * 1.15 - (1.0 - uMud) * 1.2 - 0.22 + (n - 0.5) * 0.75;
  netMudMask = smoothstep(0.15, 0.45, cover) * step(0.001, uMud);
  float soaked = uWaterline > -1e4 ? 1.0 - smoothstep(uWaterline - 0.005, uWaterline + 0.03, vNetWorld.y) : 0.0;
  netWetMask = clamp(max(uWet, soaked), 0.0, 1.0);
  vec3 mud = uMudColor * (0.75 + 0.5 * n);
  diffuseColor.rgb = mix(diffuseColor.rgb, mud, netMudMask * 0.92);
  ${isNet ? 'diffuseColor.a = max(diffuseColor.a, netMudMask * smoothstep(0.55, 0.85, cover));' : ''}
  // water darkens what soaks it up (porous fabric, foam, wood, silt); metal only gets a film
  float soak = mix(uPorosity, 1.0, netMudMask);
  diffuseColor.rgb *= mix(1.0, 1.0 - 0.55 * soak, netWetMask);
  ${isNet ? `// the blended bag is drawn after the water surface: fade its submerged part into the water colour
  float under = uWaterline > -1e4 ? clamp((uWaterline - vNetWorld.y) * 4.0 + 0.25, 0.0, 0.6) * step(vNetWorld.y, uWaterline) : 0.0;
  diffuseColor.rgb = mix(diffuseColor.rgb, uWaterColor, under);
  diffuseColor.a *= 1.0 - 0.3 * under;` : ''}
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.93, netMudMask);
roughnessFactor = mix(roughnessFactor, mix(0.08, 0.28, netMudMask), netWetMask * 0.9);`);
  };
  mat.customProgramCacheKey = () => `higataNet:${isNet ? 1 : 0}`;
  mat.needsUpdate = true;
}

export interface NetHandle {
  readonly root: Object3D;
  readonly grip: Object3D | undefined;
  readonly support: Object3D | undefined;
  readonly mouth: Object3D | undefined;
  readonly pivot: Object3D | undefined;
  /** every Bag mesh (one per LOD level) */
  readonly bags: Mesh[];
  readonly surface: NetSurface;
  setSurface(s: Partial<NetSurface>): void;
  /** morph weights by name; unspecified targets keep their value */
  setBag(w: Partial<Record<BagTarget, number>>): void;
  /** water drains from the bag and the net dries over time (call per frame) */
  update(dt: number): void;
}

/**
 * Prepares a loaded net (a GLB scene, or a LOD built by createNetLOD) for the game: per-instance
 * materials with wet / mud shading, shadows, alpha-to-coverage for the alpha-cut mesh (needs an MSAA
 * render target or `antialias: true`).
 */
export function prepareNet(root: Object3D, opts: { alphaToCoverage?: boolean; mudColor?: [number, number, number]; waterColor?: [number, number, number] } = {}): NetHandle {
  const u: Uniforms = {
    uWet: { value: 0 },
    uMud: { value: 0 },
    uWaterline: { value: -1e5 },
    uMudColor: { value: new Vector3(...(opts.mudColor ?? [0.075, 0.06, 0.045])) },
    uWaterColor: { value: new Vector3(...(opts.waterColor ?? [0.03, 0.05, 0.045])) },
  };
  const bags: Mesh[] = [];
  const done = new Map<Material, Material>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    if (o.name === 'Bag' || o.parent?.name === 'Bag') bags.push(m);
    const swap = (mat: Material): Material => {
      if (done.has(mat)) return done.get(mat)!;
      const c = mat.clone() as MeshStandardMaterial;
      c.userData = { ...mat.userData };
      if (c.isMeshStandardMaterial) {
        if (c.alphaTest > 0 && opts.alphaToCoverage !== false) c.alphaToCoverage = true;
        patchMaterial(c, u);
      }
      done.set(mat, c);
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    // the blended mesh bag casts the shadow of its threads, not of a solid sheet
    const sm = m.material as MeshStandardMaterial;
    if (!Array.isArray(m.material) && sm.transparent && sm.map) {
      // three copies map / alphaTest from the material into the shadow pass, so the dither is hard-coded:
      // a thread-coverage dither that the soft shadow filter turns into a partial shadow
      const dm = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: sm.map, side: DoubleSide });
      dm.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace(
          '#include <alphatest_fragment>',
          'if ( diffuseColor.a < fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) ) discard;',
        );
      };
      m.customDepthMaterial = dm;
    }
  });
  const surface: NetSurface = { wet: 0, mud: 0, waterline: null };
  const find = (name: string) => root.getObjectByName(name);
  const weights: Record<BagTarget, number> = { Stream: 0, Invert: 0, Trail: 0, Wet: 0 };
  const applyBag = () => {
    for (const b of bags) {
      const dict = b.morphTargetDictionary;
      const inf = b.morphTargetInfluences;
      if (!dict || !inf) continue;
      for (const k of BAG_TARGETS) if (dict[k] !== undefined) inf[dict[k]] = weights[k];
    }
  };
  const handle: NetHandle = {
    root,
    grip: find('Grip_Main'),
    support: find('Grip_Support'),
    mouth: find('Mouth'),
    pivot: find('Frame_Pivot'),
    bags,
    surface,
    setSurface(s) {
      Object.assign(surface, s);
      u.uWet.value = surface.wet;
      u.uMud.value = surface.mud;
      u.uWaterline.value = surface.waterline ?? -1e5;
    },
    setBag(w) {
      Object.assign(weights, w);
      applyBag();
    },
    update(dt) {
      if (surface.wet > 0 && surface.waterline === null) {
        // a soaked net drips for ~20 s, then dries slowly
        surface.wet = Math.max(0, surface.wet - dt * (surface.wet > 0.6 ? 0.03 : 0.006));
        u.uWet.value = surface.wet;
        weights.Wet = Math.min(weights.Wet, surface.wet);
        applyBag();
      }
    },
  };
  return handle;
}

/** Group the three tiers of one net into a THREE.LOD (pass the loaded GLB scenes). */
export function createNetLOD(levels: { hero: Object3D; lod1?: Object3D; lod2?: Object3D }): LOD {
  const lod = new LOD();
  lod.name = levels.hero.name || 'net';
  lod.addLevel(levels.hero, NET_LOD_DISTANCES.hero);
  if (levels.lod1) lod.addLevel(levels.lod1, NET_LOD_DISTANCES.lod1);
  if (levels.lod2) lod.addLevel(levels.lod2, NET_LOD_DISTANCES.lod2);
  return lod;
}
