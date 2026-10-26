import {
  ClampToEdgeWrapping, Color, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial,
  MeshStandardMaterial, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector2,
  type IUniform, type Material, type Texture, type Wrapping,
} from 'three';
import { bodyS } from './body';
import { CAUSTIC_INJECT, ENV_INJECT, HAKU_UNIFORMS, HELPERS as UNDERWATER } from '../species/haku/materials';
import { headRelief, type Relief } from './relief';
import { FIN_BAND_COUNT, sectionAt, sectionPoint, smooth, type FinId, type FinOut, type FishSpec, type SkinOut, type SkinSample } from './spec';

/**
 * 共通 PBR Material: what every fish is drawn with, painted per species once from its skin and fin functions.
 *
 *  body   MeshPhysicalMaterial: albedo with the metalness (the guanine silver of the flanks) in its alpha, a normal map
 *         of the scales' relief, the gill cover's step and the lips with the roughness in its alpha, a clear coat for the
 *         wet skin, the mouth's lining by vertex colour; the eyes' irises are painted on the skin under the eyeballs
 *  fins   thin translucent sheets: colour and alpha from the fin atlas (rays, membrane, margins), lit from both sides;
 *         a flatfish's marginal fins ripple in the vertex shader
 *  eyes   a domed cornea (a hard clear coat) over the iris and pupil painted on the body's albedo
 *
 * The same programs for every species and every tier (only the textures shrink): three programs in all.
 */

// ---------------------------------------------------------------------------------------------------- noise
function hash(i: number, j: number, seed = 0): number {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** value noise in [0, 1] */
export function noise(x: number, y: number, seed = 0): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed = 0, oct = 3): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let k = 0; k < oct; k++) { s += a * noise(x * f, y * f, seed + k * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

/**
 * Spots: jittered points on a grid of `cell`, each a disc of radius `r` (in cells, jittered by `rj`): coverage 0..1
 * (soft edge). Coordinates in any unit; the grid is square in them.
 */
export function spots(x: number, y: number, cell: number, r: number, seed = 0, rj = 0.35, keep = 1): number {
  const gx = x / cell, gy = y / cell;
  const i0 = Math.floor(gx), j0 = Math.floor(gy);
  let best = 0;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const i = i0 + di, j = j0 + dj;
    if (hash(i, j, seed + 7) > keep) continue;
    const cx = i + 0.15 + 0.7 * hash(i, j, seed), cy = j + 0.15 + 0.7 * hash(i, j, seed + 1);
    const rr = r * (1 - rj + 2 * rj * hash(i, j, seed + 2));
    const d = Math.hypot(gx - cx, gy - cy);
    best = Math.max(best, 1 - smooth(rr * 0.75, rr, d));
  }
  return best;
}

/**
 * The imbricate scale lattice at (x along, y round; one scale a unit, rows staggered by half a scale): of the scales that
 * cover the point, the one whose centre is furthest forward lies on top (its exposed field overlaps the scale behind
 * it). `d` is how far the point is from that scale's centre toward its free margin (1 at the margin), `back` the
 * direction from the centre (1 straight back toward the free margin, −1 forward), r1 and r2 the scale's own random
 * numbers.
 */
export interface ScaleHit { d: number; r1: number; r2: number; back: number }
export const SC: ScaleHit = { d: 0, r1: 0, r2: 0, back: 0 };
export function scaleAt(x: number, y: number, out: ScaleHit): ScaleHit {
  const row0 = Math.floor(y);
  let best = Infinity;
  out.d = 1; out.r1 = 0.5; out.r2 = 0.5; out.back = 0;
  for (let rr = row0 - 1; rr <= row0 + 1; rr++) {
    const off = rr & 1 ? 0.5 : 0;
    const c0 = Math.floor(x - off);
    for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
      const cx = cc + off + 0.5, cy = rr + 0.5;
      // a scale reaches 0.95 back from its centre (where its margin lies) and less forward (into its pocket)
      const dx = x - cx, dy = y - cy;
      const ex = dx > 0 ? dx / 0.95 : dx / 0.6, d = Math.hypot(ex, dy / 0.78);
      if (d < 1 && cx < best) {
        best = cx; out.d = d; out.back = ex / Math.max(d, 1e-4);
        out.r1 = hash(cc, rr, 11); out.r2 = hash(cc, rr, 29);
      }
    }
  }
  return out;
}

/** a ray pattern across a fin: 1 on a ray, 0 between (n rays over u ∈ [0, 1]) */
export function rays(u: number, n: number, width = 0.22): number {
  const f = u * (n - 1) + 0.5;
  const d = Math.abs(f - Math.round(f));
  return 1 - smooth(width * 0.5, width, d);
}

export const hex = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

/** linear interpolation of two hex colours into out (sRGB space) */
export function paint(out: SkinOut | FinOut, a: number, b: number, t: number): void {
  const A = hex(a), B = hex(b);
  out.r = A[0] + (B[0] - A[0]) * t; out.g = A[1] + (B[1] - A[1]) * t; out.b = A[2] + (B[2] - A[2]) * t;
}

/** multiply / blend toward a colour */
export function tint(out: SkinOut | FinOut, c: number, t: number): void {
  if (t <= 0) return;
  const C = hex(c);
  out.r += (C[0] - out.r) * t; out.g += (C[1] - out.g) * t; out.b += (C[2] - out.b) * t;
}

export function shade(out: SkinOut | FinOut, k: number): void { out.r *= k; out.g *= k; out.b *= k; }

/**
 * Countershading: back colour over the flank colour over the belly, the boundaries at h = `line` (back/flank) and
 * h = `belly` (flank/belly), each softened over `soft`.
 */
export function countershade(out: SkinOut, h: number, back: number, flank: number, belly: number, line: number, bellyAt: number, soft = 0.25): void {
  paint(out, flank, back, smooth(line - soft, line + soft, h));
  tint(out, belly, 1 - smooth(bellyAt - soft, bellyAt + soft, h));
}

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

/** box-filter a texture down by an integer factor */
function shrink(src: Uint8Array, w: number, h: number, f: number): Uint8Array {
  const W = w / f, H = h / f, out = new Uint8Array(W * H * 4), n = f * f;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += src[((y * f + dy) * w + x * f + dx) * 4 + c];
    out[(y * W + x) * 4 + c] = Math.round(s / n);
  }
  return out;
}

const to8 = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));

/**
 * The body's albedo (metalness in alpha) and normal map (roughness in alpha), painted at w × h: u along the body (the
 * head given more of it, bodyS), v round it. The relief is in TL units: the scales (each a little tilted its own way,
 * the glitter of a turning fish), the head's anatomy (relief.ts) and the creases' occlusion in the albedo.
 */
function paintBody(spec: FishSpec, w: number, h: number): { albedo: Uint8Array; normal: Uint8Array } {
  const albedo = new Uint8Array(w * h * 4), rough = new Uint8Array(w * h);
  const H = new Float32Array(w * h), TX = new Float32Array(w * h), TY = new Float32Array(w * h);
  const X = new Float32Array(w * h), Y = new Float32Array(w * h), Sx = new Float32Array(w);
  const eyes = spec.eyes.flatMap((e) => (e.side ? [{ e, side: e.side }] : [{ e, side: 1 }, { e, side: -1 }]));
  const iris: number[] = [0, 0, 0];
  const out: SkinOut = { r: 0, g: 0, b: 0, rough: 0.5, metal: 0 };
  const p: SkinSample = { s: 0, phi: 0, side: 1, h: 0, x: 0, y: 0 };
  const pt: [number, number] = [0, 0];
  const rel: Relief = { h: 0, ao: 1 };
  const oper = spec.oper, cb = spec.caudalBase;
  for (let i = 0; i < w; i++) {
    const s = bodyS(spec, (i + 0.5) / w);
    Sx[i] = s;
    const sec = sectionAt(spec, Math.min(s, cb));
    for (let j = 0; j < h; j++) {
      const phi = ((j + 0.5) / h) * 2 * Math.PI;
      sectionPoint(sec, phi, pt);
      const o1 = j * w + i;
      X[o1] = pt[0]; Y[o1] = pt[1];
      p.s = s; p.phi = phi; p.side = Math.sin(phi) >= 0 ? 1 : -1; p.x = pt[0]; p.y = pt[1];
      p.h = pt[1] >= 0 ? pt[1] / sec.top : pt[1] / sec.bot;
      out.rough = 0.45; out.metal = 0;
      spec.skin(p, out);
      let hgt = 0;
      // the scales (behind the gill cover, smaller and fainter on the cheek; the snout and the crown bare): a low relief
      // rising to each one's free margin, the margin a faint darker arc, and every scale tilted a little its own way and
      // a shade apart in tone and silver
      const fade = (0.35 + 0.65 * smooth(oper.s - 0.02, oper.s + 0.01, s)) * smooth(oper.s - 0.13, oper.s - 0.09, s) * (1 - smooth(cb - 0.01, cb + 0.02, s));
      if (fade > 0) {
        // (the rows wander a little: no lattice is that regular on a fish)
        const sx = (s / cb) * spec.scales.along, sy = (phi / (2 * Math.PI)) * spec.scales.around;
        const sc = scaleAt(sx + 0.3 * (noise(sx * 0.15, sy * 0.3, 41) - 0.5), sy + 0.25 * (noise(sx * 0.2, sy * 0.15, 43) - 0.5), SC);
        const d = sc.d, inner = 1 - d * d, post = smooth(-0.4, 0.6, sc.back);
        const size = 1 / spec.scales.along;
        // the exposed field rises a little to the free margin, which steps down onto the scale behind (most at its hind arc)
        hgt += fade * spec.scales.depth * 0.06 * size * (d * d - (0.4 + 0.6 * post) * smooth(0.9, 1.0, d));
        // each scale tilted a little its own way (the glitter of a turning fish), most in its middle; less on a mirror
        // silver flank, where the least tilt already throws a scale from bright to dark
        const tilt = 0.13 * (1 - 0.7 * out.metal) * inner * fade;
        TX[o1] = tilt * (sc.r1 - 0.5);
        TY[o1] = tilt * (sc.r2 - 0.5);
        // the margin's pigmented pocket, dark on the back, faint on the silver flank, darkest along the hind arc; each
        // scale's own shade of tone and silver
        const pig = (spec.scales.pigment ?? 0.3) * (0.25 + 0.75 * smooth(-0.3, 0.6, p.h));
        const margin = (0.35 + 0.65 * post) * smooth(0.74, 0.94, d) * (1 - smooth(0.97, 1.0, d));
        const k = 1 + fade * (-pig * margin + 0.06 * (sc.r1 - 0.5));
        out.r *= k; out.g *= k; out.b *= k;
        out.metal = Math.min(1, Math.max(0, out.metal * (1 + fade * (0.15 * (sc.r2 - 0.5) - 0.25 * margin))));
        out.rough += fade * 0.08 * margin;
      }
      // living skin is never one flat tone: a fine mottle of pigment over it
      const mot = 0.93 + 0.14 * fbm(s * 260, phi * 26, 13, 3);
      out.r *= mot; out.g *= mot; out.b *= mot;
      // the head's anatomy and the creases' shadows
      headRelief(spec, s, pt[1], phi, sec, rel);
      hgt += rel.h;
      out.r *= rel.ao; out.g *= rel.ao; out.b *= rel.ao;
      // the eyes: the iris and pupil painted on the skin under each eye (the eye's cornea maps onto it; the far tier,
      // which has no eyeballs, shows them flat)
      for (const { e, side } of eyes) {
        if (side !== p.side) continue;
        const dx = (s - e.s) / e.r, dy = (pt[1] - e.y) / e.r;
        if (dx * dx + dy * dy > 1.22) continue;
        eyeColour(spec, dx, dy, iris);
        const t = 1 - smooth(0.96, 1.1, Math.hypot(dx, dy));
        out.r += (iris[0] - out.r) * t; out.g += (iris[1] - out.g) * t; out.b += (iris[2] - out.b) * t;
        out.metal *= 1 - t; out.rough += (0.3 - out.rough) * t;
        hgt *= 1 - t; TX[o1] *= 1 - t; TY[o1] *= 1 - t;
      }
      H[o1] = hgt;
      albedo[o1 * 4] = to8(out.r); albedo[o1 * 4 + 1] = to8(out.g); albedo[o1 * 4 + 2] = to8(out.b); albedo[o1 * 4 + 3] = to8(out.metal);
      rough[o1] = to8(out.rough);
    }
  }
  // the relief as a tangent-space normal map: slopes over the real distances between texels (TL)
  const normal = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const o1 = j * w + i;
    const i0 = Math.max(0, i - 1), i1 = Math.min(w - 1, i + 1), j0 = (j + h - 1) % h, j1 = (j + 1) % h;
    const du = Math.max(1e-5, Sx[i1] - Sx[i0]);
    const dv = Math.max(1e-5, Math.hypot(X[j1 * w + i] - X[j0 * w + i], Y[j1 * w + i] - Y[j0 * w + i]));
    const nx = -(H[j * w + i1] - H[j * w + i0]) / du + TX[o1], ny = -(H[j1 * w + i] - H[j0 * w + i]) / dv + TY[o1];
    const l = Math.hypot(nx, ny, 1);
    normal[o1 * 4] = to8(0.5 + 0.5 * nx / l); normal[o1 * 4 + 1] = to8(0.5 + 0.5 * ny / l); normal[o1 * 4 + 2] = to8(0.5 + 0.5 / l); normal[o1 * 4 + 3] = rough[o1];
  }
  return { albedo, normal };
}

function paintFins(spec: FishSpec, w: number, bandH: number): Uint8Array {
  const h = bandH * FIN_BAND_COUNT;
  const data = new Uint8Array(w * h * 4);
  const out: FinOut = { r: 0, g: 0, b: 0, a: 0 };
  const ids: FinId[] = ['d1', 'd2', 'a', 'c', 'p', 'v'];
  for (let band = 0; band < FIN_BAND_COUNT; band++) {
    for (let j = 0; j < bandH; j++) {
      const v = Math.min(1, Math.max(0, ((j + 0.5) / bandH - 0.03) / 0.94));
      for (let i = 0; i < w; i++) {
        const u = (i + 0.5) / w;
        out.r = out.g = out.b = 0.6; out.a = 0.6;
        spec.fin(ids[band], u, v, out);
        const o = ((band * bandH + j) * w + i) * 4;
        data[o] = to8(out.r); data[o + 1] = to8(out.g); data[o + 2] = to8(out.b); data[o + 3] = to8(out.a);
      }
    }
  }
  return data;
}

/**
 * The eye's colour at (dx, dy) on its disc (radii): a black pupil reaching a little forward (the aphakic gap in front
 * of the lens), the iris a band of guanine silver or gold, fibrous and flecked, carrying the back's pigment over its
 * upper part as most fishes' eyes do, darker at its periphery where the skin of the orbit closes over it; no bright
 * ring and no drawn outline (paintBody blends it into the skin round it).
 */
function eyeColour(spec: FishSpec, dx: number, dy: number, c: number[]): void {
  const e = spec.eyes[0];
  const i0 = hex(e.iris[0]), i1 = hex(e.iris[1]), rim = hex(e.rim ?? 0x1a1a18);
  const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const fwd = Math.max(0, -dx / Math.max(r, 1e-4));
  const pupil = Math.max(e.pupil, 0.6) * (1 + 0.16 * fwd ** 3);
  if (r < pupil) {
    // the lens's depth: a faint cold glint deep in the black
    const k = 0.012 + 0.025 * (1 - smooth(0, pupil, r));
    c[0] = k * 0.75; c[1] = k * 0.95; c[2] = k * 1.2;
    return;
  }
  const t = Math.min(1, (r - pupil) / (1 - pupil));
  const fib = 0.78 + 0.3 * noise(a * 18, t * 4, 3) + 0.1 * noise(a * 64, t * 3, 5);
  const fleck = smooth(0.62, 0.8, noise(a * 30, t * 9, 7)) * 0.25;
  for (let k = 0; k < 3; k++) c[k] = (i0[k] + (i1[k] - i0[k]) * smooth(0.1, 1, t)) * (fib + fleck) * 0.6;
  // the upper iris pigmented like the back, the periphery dark, the pupil's margin a thin dark line
  const top = 0.85 * smooth(-0.1, 0.8, dy / Math.max(r, 1e-4)) * smooth(0.2, 0.7, t + 0.25);
  const per = 1 - 0.45 * smooth(0.72, 1, t);
  const edge = 1 - 0.5 * (1 - smooth(0, 0.1, t));
  for (let k = 0; k < 3; k++) c[k] = (c[k] + (rim[k] * 1.6 - c[k]) * top) * per * edge;
  if (e.lid) {
    // the clear fatty eyelid clouds the front and back of the eye a little
    const lid = e.lid * 0.5 * smooth(0.55, 0.95, Math.abs(dx));
    for (let k = 0; k < 3; k++) c[k] += (0.45 - c[k]) * lid;
  }
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
function finMaterial(map: Texture, ripple: FinRipple): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map, transparent: true, side: DoubleSide, depthWrite: false, alphaTest: 0.02, roughness: 0.34, metalness: 0 });
  m.name = 'fish-fin';
  m.envMapIntensity = 0.25;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HAKU_UNIFORMS);
    sh.uniforms.uFinAmp = ripple.amp;
    sh.uniforms.uFinPhase = ripple.phase;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFin;\nuniform float uFinAmp;\nuniform float uFinPhase;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += objectNormal * (aFin.y * uFinAmp * sin(aFin.x * 28.0 - uFinPhase));')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `${UNDERWATER}\nvoid main() {`)
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
  m.customProgramCacheKey = () => 'fish-fin-v3';
  return m;
}

/** a gill cover's opening (0 shut … 1 flared) and the gill chamber's colour, written per fish before each body draw */
export interface GillState { open: IUniform<number>; inside: IUniform<Color> }

export interface FishLook {
  /** per tier */
  body: MeshPhysicalMaterial[];
  fins: MeshStandardMaterial[];
  eyes: MeshPhysicalMaterial[];
  ripple: FinRipple;
  gill: GillState;
  textureBytes: number[];
  dispose(): void;
}

const LOOKS = new Map<string, FishLook>();

/** texture sizes per tier: body w × h, fin band width × height, eye */
const SIZES = [
  { bw: 1024, bh: 512, fw: 256, fh: 64, eye: 64 },
  { bw: 512, bh: 256, fw: 128, fh: 32, eye: 32 },
  { bw: 128, bh: 64, fw: 64, fh: 16, eye: 0 },
] as const;

/** the species' materials for the three tiers, painted once */
export function fishLook(spec: FishSpec): FishLook {
  const hit = LOOKS.get(spec.id);
  if (hit) return hit;
  const S0 = SIZES[0];
  const { albedo, normal: nrm } = paintBody(spec, S0.bw, S0.bh);
  const fins0 = paintFins(spec, S0.fw, S0.fh);
  const textures: Texture[] = [];
  const bytes: number[] = [];
  const ripple: FinRipple = { amp: { value: 0 }, phase: { value: 0 } };
  const gill: GillState = { open: { value: 0 }, inside: { value: new Color(spec.inside ?? 0x5a1414) } };
  const body: MeshPhysicalMaterial[] = [], fins: MeshStandardMaterial[] = [], eyes: MeshPhysicalMaterial[] = [];
  for (let t = 0; t < 3; t++) {
    const S = SIZES[t], f = S0.bw / S.bw, ff = S0.fw / S.fw;
    const map = dataTexture(f === 1 ? albedo : shrink(albedo, S0.bw, S0.bh, f), S.bw, S.bh, true, RepeatWrapping);
    const normal = dataTexture(f === 1 ? nrm : shrink(nrm, S0.bw, S0.bh, f), S.bw, S.bh, false, RepeatWrapping);
    const b = new MeshPhysicalMaterial({
      map, roughness: 1, metalness: 1,
      normalMap: normal, normalScale: new Vector2(1, 1),
      // a film of water and mucus: a thin, sharp coat over the skin's own sheen
      clearcoat: 0.45 * spec.wet, clearcoatRoughness: 0.1, vertexColors: true,
      // both faces: where the skin opens (the gill covers, the mouth) the inside is drawn as the gill chamber
      side: DoubleSide,
      iridescence: spec.iridescence ?? 0, iridescenceIOR: 1.33, iridescenceThicknessRange: [180, 460],
      specularIntensity: 0.8,
    });
    b.name = `fish-body-${spec.id}-${t}`;
    // roughness from the normal map's alpha, metalness (the silver) from the albedo's: three maps a tier in all
    // under water the silver mirrors the water round it, the sunlit bed below and the sky only through Snell's window
    // (the ハク's light field), and the ripples' caustics play over the back
    b.envMapIntensity = 0.25;
    b.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, HAKU_UNIFORMS);
      sh.uniforms.uGillOpen = gill.open;
      sh.uniforms.uInside = gill.inside;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGill;\nvarying float vGill;\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGill = aGill;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGillOpen;\nuniform vec3 uInside;\nvarying float vGill;')
        .replace('void main() {', `${UNDERWATER}\nvoid main() {`)
        .replace('#include <lights_fragment_begin>', CAUSTIC_INJECT)
        .replace('#include <lights_fragment_maps>', ENV_INJECT)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * texture2D( normalMap, vNormalMapUv ).a;')
        .replace('#include <metalnessmap_fragment>', `float metalnessFactor = metalness * texture2D( map, vMapUv ).a;
  // the gill chamber: seen through the skin's open edges (back faces), and in the slit behind a flared gill cover;
  // the mouth's lining (aGill 2) pinkish grey, darkening into the throat (its vertex colour)
  float chamber = vGill > 1.0 ? vGill - 1.0 : gl_FrontFacing ? clamp(vGill * uGillOpen * 1.6, 0.0, 1.0) : 1.0;
  vec3 inside = vGill > 1.0 ? mix(uInside, vec3(0.32, 0.26, 0.25), 0.6) * (0.15 + vColor.r) : uInside;
  diffuseColor.rgb = mix(diffuseColor.rgb, inside, chamber);
  metalnessFactor *= 1.0 - chamber;
  roughnessFactor = mix(roughnessFactor, 0.55, chamber);`)
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n  material.clearcoat *= 1.0 - chamber;');
    };
    b.customProgramCacheKey = () => 'fish-body-v4';
    body.push(b);
    const finT = dataTexture(ff === 1 ? fins0 : shrink(fins0, S0.fw, S0.fh * FIN_BAND_COUNT, ff), S.fw, S.fh * FIN_BAND_COUNT, true);
    fins.push(finMaterial(finT, ripple));
    textures.push(map, normal, finT);
    bytes.push((S.bw * S.bh * 8 + S.fw * S.fh * FIN_BAND_COUNT * 4) * 4 / 3);
    if (S.eye) {
      // the iris is guanine silver like the flank: it mirrors the water round the fish under the glossy cornea
      const e = new MeshPhysicalMaterial({ map, roughness: 0.38, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.03 });
      e.name = `fish-eye-${spec.id}-${t}`;
      e.envMapIntensity = 0.25;
      e.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, HAKU_UNIFORMS);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('void main() {', `${UNDERWATER}\nvoid main() {`)
          .replace('#include <lights_fragment_maps>', ENV_INJECT);
      };
      e.customProgramCacheKey = () => 'fish-eye-v1';
      eyes.push(e);
    }
  }
  const look: FishLook = {
    body, fins, eyes, ripple, gill, textureBytes: bytes,
    dispose() {
      for (const m of [...body, ...fins, ...eyes] as Material[]) m.dispose();
      for (const t of textures) t.dispose();
      LOOKS.delete(spec.id);
    },
  };
  LOOKS.set(spec.id, look);
  return look;
}
