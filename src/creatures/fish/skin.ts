import {
  ClampToEdgeWrapping, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial,
  MeshStandardMaterial, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector2,
  type IUniform, type Material, type Texture, type Wrapping,
} from 'three';
import { FIN_BAND_COUNT, profilesOf, sectionAt, sectionPoint, smooth, type FinId, type FinOut, type FishSpec, type SkinOut, type SkinSample } from './spec';

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

/** the body's albedo and roughness/metalness, painted at w × h (u along the body, v round it) */
function paintBody(spec: FishSpec, w: number, h: number): { albedo: Uint8Array; normal: Uint8Array } {
  const albedo = new Uint8Array(w * h * 4), rough = new Uint8Array(w * h), H = new Float32Array(w * h);
  const eyes = spec.eyes.flatMap((e) => (e.side ? [{ e, side: e.side }] : [{ e, side: 1 }, { e, side: -1 }]));
  const iris: number[] = [0, 0, 0];
  const out: SkinOut = { r: 0, g: 0, b: 0, rough: 0.5, metal: 0 };
  const p: SkinSample = { s: 0, phi: 0, side: 1, h: 0, x: 0, y: 0 };
  const pt: [number, number] = [0, 0];
  const len = spec.caudalBase + 0.03;
  const oper = spec.oper;
  const P = profilesOf(spec), gape = P.gape;
  for (let i = 0; i < w; i++) {
    const s = ((i + 0.5) / w) * len;
    const sec = sectionAt(spec, Math.min(s, spec.caudalBase));
    for (let j = 0; j < h; j++) {
      const phi = ((j + 0.5) / h) * 2 * Math.PI;
      sectionPoint(sec, phi, pt);
      p.s = s; p.phi = phi; p.side = Math.sin(phi) >= 0 ? 1 : -1; p.x = pt[0]; p.y = pt[1];
      p.h = pt[1] >= 0 ? pt[1] / sec.top : pt[1] / sec.bot;
      out.rough = 0.45; out.metal = 0;
      spec.skin(p, out);
      let hgt = 0;
      // the scales (behind the gill cover): a slight relief rising to each one's free margin, the margin a faint
      // darker arc, every scale its own small difference of tone and sheen (the flicker of a turning fish)
      // (the cheek's scales smaller and fainter, the snout and the crown bare)
      const fade = (0.35 + 0.65 * smooth(oper.s - 0.02, oper.s + 0.01, s)) * smooth(oper.s - 0.13, oper.s - 0.09, s) * (1 - smooth(spec.caudalBase - 0.01, spec.caudalBase + 0.02, s));
      if (fade > 0) {
        const sx = (s / spec.caudalBase) * spec.scales.along, sy = (phi / (2 * Math.PI)) * spec.scales.around;
        const row = Math.floor(sy), fx = sx + (row & 1 ? 0.5 : 0), col = Math.floor(fx);
        const cx = fx - col, cy = sy - row - 0.5;
        const d = Math.min(1, Math.hypot(cx + 0.15, cy * 1.2) / 0.85);
        const rnd = noise(col * 1.37, row * 2.11, 77);
        hgt += fade * spec.scales.depth * (d * d - (d > 0.97 ? 1 : 0));
        const k = 1 + fade * (-spec.scales.depth * 0.12 * (1 - smooth(0.02, 0.09, Math.abs(d - 0.9))) + 0.05 * (rnd - 0.5));
        out.r *= k; out.g *= k; out.b *= k;
        out.metal = Math.min(1, Math.max(0, out.metal + fade * 0.18 * (rnd - 0.5) * out.metal));
      }
      // the gill cover's free edge: the plate stands proud of the body, a soft shadow under it
      if (pt[1] < oper.top && pt[1] > -oper.bot) {
        const hh = pt[1] >= 0 ? sec.top : sec.bot;
        const edge = oper.s - oper.sweep * (pt[1] / hh) ** 2;
        const side = Math.sin(phi) ** 2;
        hgt += 0.5 * side * (1 - smooth(edge - 0.002, edge + 0.001, s)) * smooth(edge - 0.08, edge - 0.04, s);
        const k = 1 - 0.16 * (1 - smooth(0.001, 0.007, s - edge)) * (s > edge ? 1 : 0) * side;
        out.r *= k; out.g *= k; out.b *= k;
      }
      // the preopercle's margin: a fine line curving down and forward in front of the gill cover
      if (pt[1] < oper.top * 0.8 && pt[1] > -oper.bot) {
        const hh = pt[1] >= 0 ? sec.top : sec.bot, v = pt[1] / hh;
        const pre = oper.s - 0.055 - 0.035 * Math.max(0, -v) ** 2 + 0.01 * v;
        const line = (1 - smooth(0.0008, 0.003, Math.abs(s - pre))) * Math.sin(phi) ** 2;
        hgt += 0.25 * line * (s < pre ? 1 : -0.3);
        const k = 1 - 0.1 * line;
        out.r *= k; out.g *= k; out.b *= k;
      }
      // the mouth: the lips' meeting a fine dark line, the maxilla's hind edge a shallow groove above it
      const c = spec.mouth.corner;
      if (s < c + 0.01) {
        const g = gape(Math.min(s, c)) * (sec.top / Math.max(1e-4, P.top(Math.max(s, 0.6 * spec.snoutCap))));
        const side = smooth(0.2, 0.5, Math.sin(phi) ** 2);
        const lip = (1 - smooth(0.0008, 0.0028, Math.abs(pt[1] - g))) * side * smooth(0, 0.01, s) * (1 - smooth(c - 0.002, c + 0.006, s));
        const mx = g + 0.016 * Math.min(1, s / c), groove = (1 - smooth(0.0006, 0.002, Math.abs(pt[1] - mx))) * side * smooth(0.25 * c, 0.6 * c, s) * (1 - smooth(c, c + 0.008, s));
        hgt += 0.25 * lip - 0.2 * groove;
        const k = 1 - 0.35 * lip - 0.12 * groove;
        out.r *= k; out.g *= k; out.b *= k;
      }
      // the eyes: the iris and pupil painted on the skin under each eye (the eye's cornea maps onto it; the far tier,
      // which has no eyeballs, shows them flat)
      for (const { e, side } of eyes) {
        if (side !== p.side) continue;
        const dx = (s - e.s) / e.r, dy = (pt[1] - e.y) / e.r;
        if (dx * dx + dy * dy > 1.3) continue;
        eyeColour(spec, dx, dy, iris);
        const t = 1 - smooth(1.0, 1.14, Math.hypot(dx, dy));
        out.r += (iris[0] - out.r) * t; out.g += (iris[1] - out.g) * t; out.b += (iris[2] - out.b) * t;
        out.metal *= 1 - t; out.rough += (0.3 - out.rough) * t;
        hgt *= 1 - t;
      }
      H[j * w + i] = hgt;
      const o = (j * w + i) * 4;
      albedo[o] = to8(out.r); albedo[o + 1] = to8(out.g); albedo[o + 2] = to8(out.b); albedo[o + 3] = to8(out.metal);
      rough[j * w + i] = to8(out.rough);
    }
  }
  // the relief as a tangent-space normal map (u along the body, v round it)
  const normal = new Uint8Array(w * h * 4);
  const kx = 0.7, ky = 0.7;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const hx = H[j * w + Math.min(w - 1, i + 1)] - H[j * w + Math.max(0, i - 1)];
    const hy = H[((j + 1) % h) * w + i] - H[((j + h - 1) % h) * w + i];
    const nx = -hx * kx, ny = -hy * ky, l = Math.hypot(nx, ny, 1);
    const o = (j * w + i) * 4;
    normal[o] = to8(0.5 + 0.5 * nx / l); normal[o + 1] = to8(0.5 + 0.5 * ny / l); normal[o + 2] = to8(0.5 + 0.5 / l); normal[o + 3] = rough[j * w + i];
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

/** the eye's colour at (dx, dy) on its disc (radii): black pupil, a narrow fibrous metallic iris, a dark rim */
function eyeColour(spec: FishSpec, dx: number, dy: number, c: number[]): void {
  const e = spec.eyes[0];
  const i0 = hex(e.iris[0]), i1 = hex(e.iris[1]), rim = hex(e.rim ?? 0x1a1a18);
  const pupil = Math.max(e.pupil, 0.58);
  const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  if (r < pupil) {
    const k = 0.015 + 0.04 * (1 - smooth(0, pupil, r));
    c[0] = k * 0.8; c[1] = k * 0.95; c[2] = k * 1.2;
  } else if (r < 0.9) {
    const t = (r - pupil) / (0.9 - pupil);
    const fib = 0.78 + 0.35 * noise(a * 14, t * 3, 3);
    const ring = 1 - smooth(0, 0.25, t);
    for (let k = 0; k < 3; k++) c[k] = (i0[k] * (0.55 + 0.45 * ring) + (i1[k] - i0[k]) * smooth(0.3, 1, t) * 0.8) * fib * (1 - 0.35 * smooth(0.6, 1, t));
  } else {
    const t = smooth(0.9, 1.0, r);
    for (let k = 0; k < 3; k++) c[k] = i1[k] * 0.5 * (1 - t) + rim[k] * t;
  }
  if (e.lid) {
    // the clear fatty eyelid clouds the front and back of the eye a little
    const lid = e.lid * 0.6 * smooth(0.55, 0.95, Math.abs(dx));
    for (let k = 0; k < 3; k++) c[k] += (0.55 - c[k]) * lid;
  }
}

// ---------------------------------------------------------------------------------------------------- materials
/** the fins' ripple: shared time; per-object amplitude and phase written before each fin draw */
export const FIN_TIME: IUniform<number> = { value: 0 };

export interface FinRipple { amp: IUniform<number>; phase: IUniform<number> }

function finMaterial(map: Texture, ripple: FinRipple): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map, transparent: true, side: DoubleSide, depthWrite: false, alphaTest: 0.02, roughness: 0.42, metalness: 0 });
  m.name = 'fish-fin';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFinAmp = ripple.amp;
    sh.uniforms.uFinPhase = ripple.phase;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFin;\nuniform float uFinAmp;\nuniform float uFinPhase;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += objectNormal * (aFin.y * uFinAmp * sin(aFin.x * 28.0 - uFinPhase));');
  };
  m.customProgramCacheKey = () => 'fish-fin-v1';
  return m;
}

export interface FishLook {
  /** per tier */
  body: MeshPhysicalMaterial[];
  fins: MeshStandardMaterial[];
  eyes: MeshPhysicalMaterial[];
  ripple: FinRipple;
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
  const body: MeshPhysicalMaterial[] = [], fins: MeshStandardMaterial[] = [], eyes: MeshPhysicalMaterial[] = [];
  for (let t = 0; t < 3; t++) {
    const S = SIZES[t], f = S0.bw / S.bw, ff = S0.fw / S.fw;
    const map = dataTexture(f === 1 ? albedo : shrink(albedo, S0.bw, S0.bh, f), S.bw, S.bh, true, RepeatWrapping);
    const normal = dataTexture(f === 1 ? nrm : shrink(nrm, S0.bw, S0.bh, f), S.bw, S.bh, false, RepeatWrapping);
    const b = new MeshPhysicalMaterial({
      map, roughness: 1, metalness: 1,
      normalMap: normal, normalScale: new Vector2(1, 1),
      clearcoat: spec.wet, clearcoatRoughness: 0.22, vertexColors: true,
    });
    b.name = `fish-body-${spec.id}-${t}`;
    // roughness from the normal map's alpha, metalness (the silver) from the albedo's: three maps a tier in all
    b.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * texture2D( normalMap, vNormalMapUv ).a;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * texture2D( map, vMapUv ).a;');
    };
    b.customProgramCacheKey = () => 'fish-body-v1';
    body.push(b);
    const finT = dataTexture(ff === 1 ? fins0 : shrink(fins0, S0.fw, S0.fh * FIN_BAND_COUNT, ff), S.fw, S.fh * FIN_BAND_COUNT, true);
    fins.push(finMaterial(finT, ripple));
    textures.push(map, normal, finT);
    bytes.push((S.bw * S.bh * 8 + S.fw * S.fh * FIN_BAND_COUNT * 4) * 4 / 3);
    if (S.eye) {
      const e = new MeshPhysicalMaterial({ map, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });
      e.name = `fish-eye-${spec.id}-${t}`;
      eyes.push(e);
    }
  }
  const look: FishLook = {
    body, fins, eyes, ripple, textureBytes: bytes,
    dispose() {
      for (const m of [...body, ...fins, ...eyes] as Material[]) m.dispose();
      for (const t of textures) t.dispose();
      LOOKS.delete(spec.id);
    },
  };
  LOOKS.set(spec.id, look);
  return look;
}
