import {
  ClampToEdgeWrapping, Color, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial,
  MeshStandardMaterial, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector2,
  type IUniform, type Material, type Texture, type Wrapping,
} from 'three';
import { CAUSTIC_INJECT, ENV_INJECT, HAKU_UNIFORMS, HELPERS as UNDERWATER } from '../species/haku/materials';
import {
  BODY_AO_DIRECT, BODY_AO_INDIRECT, BODY_COLOR, BODY_FILM, BODY_FRAG_PARS, BODY_METAL, BODY_NORMAL, BODY_ROUGH, BODY_THROUGH,
  BODY_VERT_PARS, EYE_FRAG_PARS, EYE_GLINT, EYE_MAP, EYE_METAL, EYE_ROUGH, EYE_VERT, EYE_VERT_PARS, FIN_ALPHA, FIN_FRAG_PARS,
  FIN_NORMAL, FIN_VERT, FIN_VERT_PARS,
} from './shaders';
import { FIN_BAND_COUNT, type FishSpec } from './spec';
import { SIZES, paintBody, paintEye, paintFins, paintSkins, rayCounts, shrink, type SkinPaint, type SkinRequest } from './paint';

/**
 * 共通 PBR Material: what every fish is drawn with, painted per species once from its skin and fin functions.
 *
 *  body   MeshPhysicalMaterial: the colour with the metalness (the guanine silver) in its alpha; a surface map with the
 *         relief's normal (RG), the roughness (B) and the ambient occlusion (A); a clear coat for the mucus, its weight
 *         and the body's thinness (the light through it) in the vertex colour (shaders.ts)
 *  fins   thin translucent sheets: colour and alpha from the fin atlas (rays, membrane, margins worn and split, the
 *         fleshy base), the rays as ridges in the shader, lit from both sides; a flatfish's marginal fins ripple
 *  eyes   the cornea (a hard clear coat: the head's skin swelling over the eye) over the iris and pupil under it
 *
 * The textures are painted in paint.ts (in a worker, skin.worker.ts: a placeholder at the far tier's size first).
 *
 * The same programs for every species (only the textures and a few uniforms differ): one per kind and tier.
 */

// ---------------------------------------------------------------------------------------------------- textures
function dataTexture(data: Uint8Array, w: number, h: number, srgb: boolean, wrapT: Wrapping = ClampToEdgeWrapping): DataTexture {
  const t = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = wrapT;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------------- materials
/** the fins' ripple: shared time; per-object amplitude and phase written before each fin draw */
export const FIN_TIME: IUniform<number> = { value: 0 };

export interface FinRipple { amp: IUniform<number>; phase: IUniform<number> }

/**
 * A fin: a thin membrane between rays. The light that comes through it from behind (the sun over a fish seen from
 * below or against the light) is added to the side that faces the eye, coloured by the membrane: fins glow, as thin
 * tissue does, rather than going dark when the sun is behind them.
 */
function finMaterial(map: Texture, ripple: FinRipple, raysOf: number[], far: boolean): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map, transparent: true, side: DoubleSide, depthWrite: false, alphaTest: 0.02, roughness: 0.32, metalness: 0 });
  m.name = 'fish-fin';
  m.envMapIntensity = 0.25;
  if (far) m.defines = { FISH_FAR: '' };
  const rays = { value: raysOf };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HAKU_UNIFORMS);
    sh.uniforms.uFinAmp = ripple.amp;
    sh.uniforms.uFinPhase = ripple.phase;
    sh.uniforms.uRays = rays;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${FIN_VERT_PARS}`)
      .replace('#include <begin_vertex>', FIN_VERT)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FIN_FRAG_PARS}`)
      .replace('void main() {', `${UNDERWATER}\nvoid main() {`)
      .replace('#include <alphamap_fragment>', FIN_ALPHA)
      .replace('#include <normal_fragment_maps>', FIN_NORMAL)
      .replace('#include <lights_fragment_begin>', CAUSTIC_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // thin living tissue: it scatters the light it is bathed in, from in front and from behind (the sun through a fin
  // seen against it most of all), so a fin reads milky and glows rather than going dark
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  float back = pow(clamp(dot(vW, hkSunDir()), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * ((hkUnderwater(nW, 1.0) + hkUnderwater(-nW, 1.0)) * 0.22 + hkSunCol() * back * 0.25 * (1.0 - 0.5 * diffuseColor.a));
}`);
  };
  m.customProgramCacheKey = () => (far ? 'fish-fin-v5-far' : 'fish-fin-v5');
  return m;
}

/** a gill cover's opening (0 shut … 1 flared) and the gill chamber's colour, written per fish before each body draw */
export interface GillState { open: IUniform<number>; inside: IUniform<Color> }

function bodyMaterial(spec: FishSpec, map: Texture, surface: Texture, gill: GillState, t: number): MeshPhysicalMaterial {
  const far = t === 2;
  const b = new MeshPhysicalMaterial({
    map, roughness: 1, metalness: 1,
    normalMap: surface, normalScale: new Vector2(1, 1),
    // a film of water and mucus: a thin, sharp coat over the skin's own sheen (its weight per vertex, streaked)
    clearcoat: Math.min(1, 0.75 * spec.wet), clearcoatRoughness: 0.08, vertexColors: true,
    // both faces: where the skin opens (the gill covers, the mouth) the inside is drawn as the gill chamber
    side: DoubleSide,
    iridescence: spec.iridescence ?? 0, iridescenceIOR: 1.33, iridescenceThicknessRange: [180, 460],
    specularIntensity: 0.85,
  });
  b.name = `fish-body-${spec.id}-${t}`;
  if (far) b.defines = { FISH_FAR: '' };
  // under water the silver mirrors the water round it, the sunlit bed below and the sky only through Snell's window
  // (the ハク's light field), and the ripples' caustics play over the back
  b.envMapIntensity = 0.25;
  b.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HAKU_UNIFORMS);
    sh.uniforms.uGillOpen = gill.open;
    sh.uniforms.uInside = gill.inside;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${BODY_VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGill = aGill;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${BODY_FRAG_PARS}`)
      .replace('void main() {', `${UNDERWATER}\nvoid main() {`)
      .replace('#include <color_fragment>', BODY_COLOR)
      .replace('#include <roughnessmap_fragment>', BODY_ROUGH)
      .replace('#include <metalnessmap_fragment>', BODY_METAL)
      .replace('#include <normal_fragment_maps>', BODY_NORMAL)
      .replace('#include <emissivemap_fragment>', BODY_THROUGH)
      .replace('#include <lights_physical_fragment>', BODY_FILM)
      .replace('#include <lights_fragment_begin>', `${CAUSTIC_INJECT}\n${BODY_AO_DIRECT}`)
      .replace('#include <lights_fragment_maps>', `${ENV_INJECT}\n${BODY_AO_INDIRECT}`);
  };
  b.customProgramCacheKey = () => (far ? 'fish-body-v5-far' : 'fish-body-v5');
  return b;
}

/** the cornea (a hard clear coat, sharp reflections of the water round it) over the iris deep in the eye */
function eyeMaterial(spec: FishSpec, map: Texture, t: number, gaze: IUniform<Vector2>): MeshPhysicalMaterial {
  const e = new MeshPhysicalMaterial({ map, roughness: 0.42, metalness: 1, clearcoat: 0.75, clearcoatRoughness: 0.03 });
  e.name = `fish-eye-${spec.id}-${t}`;
  e.envMapIntensity = 0.25;
  const pupil = { value: spec.eyes[0].pupil };
  e.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HAKU_UNIFORMS);
    sh.uniforms.uPupil = pupil;
    sh.uniforms.uEyeShift = gaze;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${EYE_VERT_PARS}`)
      .replace('#include <skinnormal_vertex>', EYE_VERT)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${EYE_FRAG_PARS}`)
      .replace('void main() {', `${UNDERWATER}\nvoid main() {`)
      .replace('#include <map_fragment>', EYE_MAP)
      .replace('#include <roughnessmap_fragment>', EYE_ROUGH)
      .replace('#include <metalnessmap_fragment>', EYE_METAL)
      .replace('#include <emissivemap_fragment>', EYE_GLINT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT);
  };
  e.customProgramCacheKey = () => 'fish-eye-v2';
  return e;
}

export interface FishLook {
  /** per tier */
  body: MeshPhysicalMaterial[];
  fins: MeshStandardMaterial[];
  eyes: MeshPhysicalMaterial[];
  ripple: FinRipple;
  gill: GillState;
  /** where the eyes look (the iris's shift in the cornea, texture units), written per fish before each eye draw */
  gaze: IUniform<Vector2>;
  textureBytes: number[];
  dispose(): void;
}

const LOOKS = new Map<string, FishLook>();

/**
 * The specimens' photographs (src/assets/fish: the body, the fin atlas and the eye, in their textures' layouts; their
 * sources in the README there), read with the species' skin in the worker and painted into its near tiers. The far
 * tier keeps the procedural skin (nothing to download for it).
 */
const PHOTO_URLS = import.meta.glob('../../assets/fish/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const photoUrl = (id: string, part: 'body' | 'fins' | 'eye'): string | undefined => PHOTO_URLS[`../../assets/fish/${id}.${part}.jpg`];
export function fishPhotoUrls(id: string): SkinRequest['urls'] {
  const b = photoUrl(id, 'body'), f = photoUrl(id, 'fins');
  return b && f ? [b, f, photoUrl(id, 'eye') ?? null] : null;
}

/** the skins being painted (a render waits for them) */
const PENDING = new Set<Promise<void>>();
export function fishSkinsReady(): Promise<void> { return Promise.all([...PENDING]).then(() => undefined); }

// two painters, the species handed to them in turn
let workers: Worker[] | undefined, turn = 0;
const WAITING = new Map<string, (p: SkinPaint | null) => void>();
function skinWorker(): Worker | null {
  if (!workers) {
    workers = [];
    if (typeof Worker !== 'undefined' && typeof document !== 'undefined') {
      const n = Math.max(1, Math.min(2, (navigator.hardwareConcurrency ?? 2) - 1));
      for (let i = 0; i < n; i++) {
        try {
          const w = new Worker(new URL('./skin.worker.ts', import.meta.url), { type: 'module' });
          w.onmessage = (e: MessageEvent<SkinPaint & { id: string }>) => { WAITING.get(e.data.id)?.(e.data); WAITING.delete(e.data.id); };
          w.onerror = () => { for (const f of WAITING.values()) f(null); WAITING.clear(); };
          workers.push(w);
        } catch { /* none: painted at once */ }
      }
    }
  }
  return workers.length ? workers[turn++ % workers.length] : null;
}

/** a texture's pixels replaced (same size and format) */
function repaint(t: Texture, data: Uint8Array): void {
  (t.image as { data: Uint8Array }).data = data;
  t.needsUpdate = true;
}

/** a texture's pixels scaled up by an integer factor (bilinear): the placeholder's, at a near tier's size */
function grow(src: Uint8Array, w: number, h: number, f: number, wrapY: boolean): Uint8Array {
  if (f === 1) return src;
  const W = w * f, H = h * f, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / f - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    const ya = wrapY ? (y0 + h) % h : Math.max(0, y0), yb = wrapY ? (y0 + 1) % h : Math.min(h - 1, y0 + 1);
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / f - 0.5)), x0 = Math.floor(fx), tx = fx - x0, x1 = Math.min(w - 1, x0 + 1);
      for (let c = 0; c < 4; c++) {
        const a = src[(ya * w + x0) * 4 + c] * (1 - tx) + src[(ya * w + x1) * 4 + c] * tx;
        const b = src[(yb * w + x0) * 4 + c] * (1 - tx) + src[(yb * w + x1) * 4 + c] * tx;
        out[(y * W + x) * 4 + c] = Math.round(a + (b - a) * ty);
      }
    }
  }
  return out;
}

/** the species' materials for the three tiers */
export function fishLook(spec: FishSpec): FishLook {
  const hit = LOOKS.get(spec.id);
  if (hit) return hit;
  const S0 = SIZES[0], S2 = SIZES[2];
  // with a worker, a placeholder painted at the far tier's size now and the skins in full when the worker has them;
  // without one (the tests, the tools), the skins in full at once (procedural)
  const w = skinWorker();
  const now: SkinPaint = w
    ? { ...paintBody(spec, S2.bw, S2.bh), fins: paintFins(spec, S2.fw, S2.fh), eye: paintEye(spec, S0.eye), far: null }
    : paintSkins(spec, null);
  const at = w ? 2 : 0;
  const rays = rayCounts(spec);
  const textures: Texture[] = [];
  const bytes: number[] = [];
  const ripple: FinRipple = { amp: { value: 0 }, phase: { value: 0 } };
  const gill: GillState = { open: { value: 0 }, inside: { value: new Color(spec.inside ?? 0x5a1414) } };
  const gaze: IUniform<Vector2> = { value: new Vector2() };
  const body: MeshPhysicalMaterial[] = [], fins: MeshStandardMaterial[] = [], eyes: MeshPhysicalMaterial[] = [];
  const tiers: { map: Texture; surface: Texture; fins: Texture; eye?: Texture }[] = [];
  /** the painted skin (at tier `from`'s size) at tier t's */
  const fit = (p: SkinPaint, from: number, t: number) => {
    const A = SIZES[from], S = SIZES[t];
    const fb = A.bw / S.bw, ff = A.fw / S.fw;
    const sz = (src: Uint8Array, w0: number, h0: number, f: number, wrap: boolean) => (f >= 1 ? (f === 1 ? src : shrink(src, w0, h0, f)) : grow(src, w0, h0, 1 / f, wrap));
    return {
      albedo: sz(p.albedo, A.bw, A.bh, fb, true), surface: sz(p.surface, A.bw, A.bh, fb, true),
      fins: sz(p.fins, A.fw, A.fh * FIN_BAND_COUNT, ff, false),
      eye: S.eye ? (S0.eye === S.eye ? p.eye : shrink(p.eye, S0.eye, S0.eye, S0.eye / S.eye)) : null,
    };
  };
  for (let t = 0; t < 3; t++) {
    const S = SIZES[t], d = fit(now, at, t);
    const map = dataTexture(d.albedo, S.bw, S.bh, true, RepeatWrapping);
    const surface = dataTexture(d.surface, S.bw, S.bh, false, RepeatWrapping);
    body.push(bodyMaterial(spec, map, surface, gill, t));
    const finT = dataTexture(d.fins, S.fw, S.fh * FIN_BAND_COUNT, true);
    fins.push(finMaterial(finT, ripple, rays, t === 2));
    textures.push(map, surface, finT);
    let eyeBytes = 0, eyeT: Texture | undefined;
    if (S.eye && d.eye) {
      eyeT = dataTexture(d.eye, S.eye, S.eye, true);
      eyes.push(eyeMaterial(spec, eyeT, t, gaze));
      textures.push(eyeT);
      eyeBytes = S.eye * S.eye * 4;
    }
    tiers.push({ map, surface, fins: finT, eye: eyeT });
    bytes.push(((S.bw * S.bh * 8 + S.fw * S.fh * FIN_BAND_COUNT * 4) + eyeBytes) * 4 / 3);
  }
  let disposed = false;
  const look: FishLook = {
    body, fins, eyes, ripple, gill, gaze, textureBytes: bytes,
    dispose() {
      disposed = true;
      for (const m of [...body, ...fins, ...eyes] as Material[]) m.dispose();
      for (const t of textures) t.dispose();
      LOOKS.delete(spec.id);
    },
  };
  LOOKS.set(spec.id, look);
  if (w) {
    const job = new Promise<void>((resolve) => {
      WAITING.set(spec.id, (p) => {
        if (p && !disposed) {
          for (let t = 0; t < 3; t++) {
            // (the far tier from its own procedural paint when the near ones carry the photographs)
            const d = t === 2 && p.far ? fit({ ...p.far, eye: p.eye, far: null }, 2, 2) : fit(p, 0, t), T = tiers[t];
            repaint(T.map, d.albedo); repaint(T.surface, d.surface); repaint(T.fins, d.fins);
            if (T.eye && d.eye) repaint(T.eye, d.eye);
          }
        }
        resolve();
      });
      const req: SkinRequest = { id: spec.id, urls: fishPhotoUrls(spec.id) };
      w.postMessage(req);
    });
    PENDING.add(job);
    void job.finally(() => PENDING.delete(job));
  }
  return look;
}
