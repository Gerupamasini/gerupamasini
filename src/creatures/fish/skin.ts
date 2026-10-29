import {
  ClampToEdgeWrapping, Color, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial,
  MeshStandardMaterial, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector2,
  type IUniform, type Material, type Texture, type Wrapping,
} from 'three';
import { bodyS } from './body';
import { CAUSTIC_INJECT, ENV_INJECT, HAKU_UNIFORMS, HELPERS as UNDERWATER } from '../species/haku/materials';
import { headRelief, type Relief } from './relief';
import {
  BODY_AO_DIRECT, BODY_AO_INDIRECT, BODY_COLOR, BODY_FILM, BODY_FRAG_PARS, BODY_METAL, BODY_NORMAL, BODY_ROUGH, BODY_THROUGH,
  BODY_VERT_PARS, EYE_FRAG_PARS, EYE_GLINT, EYE_MAP, EYE_METAL, EYE_ROUGH, EYE_VERT, EYE_VERT_PARS, FIN_ALPHA, FIN_FRAG_PARS,
  FIN_NORMAL, FIN_VERT, FIN_VERT_PARS,
} from './shaders';
import {
  FIN_BAND_COUNT, mix, newSection, phiAtHeight, profilesOf, sectionAt, sectionPoint, smooth,
  type FinId, type FinOut, type FishSpec, type SkinOut, type SkinSample,
} from './spec';

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
 * The skin is painted in the body's own units (TL), not in texture units: the scales keep their size round the body,
 * are smaller on the cheek, along the back's and the belly's edges and on the peduncle, and every one is its own: a
 * shade apart in tone and in silver, tilted a little its own way, now and then lost; the lateral line's scales carry
 * their pores; the skin has its pigment cells, its wear and its scratches.
 *
 * The same programs for every species (only the textures and a few uniforms differ): one per kind and tier.
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
 * it). `d` is how far the point is from that scale's centre toward its free margin (1 at the margin), (`ex`, `ey`) the
 * point in the scale's own frame (its margin at 1), `back` the direction from the centre (1 straight back toward the
 * free margin, −1 forward), r1 … r3 the scale's own random numbers.
 */
export interface ScaleHit { d: number; ex: number; ey: number; r1: number; r2: number; r3: number; back: number }
export const SC: ScaleHit = { d: 0, ex: 0, ey: 0, r1: 0, r2: 0, r3: 0, back: 0 };
export function scaleAt(x: number, y: number, out: ScaleHit): ScaleHit {
  const row0 = Math.floor(y);
  let best = Infinity;
  out.d = 1; out.ex = 1; out.ey = 0; out.r1 = 0.5; out.r2 = 0.5; out.r3 = 0.5; out.back = 0;
  for (let rr = row0 - 1; rr <= row0 + 1; rr++) {
    const off = rr & 1 ? 0.5 : 0;
    const c0 = Math.floor(x - off);
    for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
      // (each scale a little off the lattice and a little its own size)
      const j1 = hash(cc, rr, 5), j2 = hash(cc, rr, 6), k = 0.9 + 0.2 * hash(cc, rr, 8);
      const cx = cc + off + 0.5 + 0.12 * (j1 - 0.5), cy = rr + 0.5 + 0.1 * (j2 - 0.5);
      // a scale reaches 0.95 back from its centre (where its margin lies) and less forward (into its pocket)
      const dx = (x - cx) / k, dy = (y - cy) / k;
      const ex = dx > 0 ? dx / 0.95 : dx / 0.6, ey = dy / 0.78, d = Math.hypot(ex, ey);
      if (d < 1 && cx < best) {
        best = cx; out.d = d; out.ex = ex; out.ey = ey; out.back = ex / Math.max(d, 1e-4);
        out.r1 = hash(cc, rr, 11); out.r2 = hash(cc, rr, 29); out.r3 = hash(cc, rr, 47);
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

const g2 = (x: number, w: number) => Math.exp(-((x / w) ** 2));

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

/** a scratch across the skin: from (s, arc) along a direction, TL; how deep */
interface Scratch { s: number; a: number; ds: number; da: number; len: number; k: number }

function scratches(spec: FishSpec, side: number, n: number, half: number): Scratch[] {
  const out: Scratch[] = [];
  for (let k = 0; k < n; k++) {
    const r = (q: number) => hash(k, side > 0 ? 1 : 2, 300 + q + spec.id.length * 13);
    const ang = (r(1) - 0.5) * 1.3 + (r(2) < 0.3 ? Math.PI / 2 : 0);
    out.push({ s: mix(0.16, 0.72, r(3)), a: mix(0.15, 0.85, r(4)) * half, ds: Math.cos(ang), da: Math.sin(ang), len: mix(0.012, 0.06, r(5)), k: mix(0.4, 1, r(6)) });
  }
  return out;
}

/**
 * The body's colour (metalness in alpha) and surface (normal xy, roughness, occlusion), painted at w × h: u along the
 * body (the head given more of it, bodyS), v round it (φ). The relief is in TL units: the scales, the head's anatomy
 * (relief.ts), the wear; the creases' occlusion goes to the occlusion channel.
 */
function paintBody(spec: FishSpec, w: number, h: number): { albedo: Uint8Array; surface: Uint8Array } {
  const N = w * h;
  const albedo = new Uint8Array(N * 4), rough = new Float32Array(N), occ = new Float32Array(N);
  const H = new Float32Array(N), TX = new Float32Array(N), TY = new Float32Array(N);
  const X = new Float32Array(N), Y = new Float32Array(N), ARC = new Float32Array(N), LY = new Float32Array(N), HH = new Float32Array(N);
  const Sx = new Float32Array(w), LX = new Float32Array(w), HALF = new Float32Array(w);
  const eyes = spec.eyes.flatMap((e) => (e.side ? [{ e, side: e.side }] : [{ e, side: 1 }, { e, side: -1 }]));
  const iris: number[] = [0, 0, 0, 0];
  const out: SkinOut = { r: 0, g: 0, b: 0, rough: 0.5, metal: 0 };
  const p: SkinSample = { s: 0, phi: 0, side: 1, h: 0, x: 0, y: 0 };
  const pt: [number, number] = [0, 0], prev: [number, number] = [0, 0];
  const rel: Relief = { h: 0, ao: 1, plate: 0 };
  const sec = newSection();
  const oper = spec.oper, cb = spec.caudalBase, sc = spec.scales;
  // the scales' size: mid-flank one scale of the lateral line's count, smaller on the cheek and toward the peduncle
  const L0 = cb / sc.along, H0 = L0 * (sc.aspect ?? 0.82);
  const kx = (s: number) => mix(0.5, 1, smooth(oper.s - 0.05, oper.s + 0.08, s)) * mix(1, 0.78, smooth(0.6, cb, s));
  const ky = (s: number, hh: number) => kx(s) * (1 - 0.3 * smooth(0.55, 0.95, Math.abs(hh))) * (1 - 0.1 * smooth(-0.3, -0.75, hh));
  // pass 1: where every texel lies on the body, its arc from the dorsal midline, the scale lattice
  for (let i = 0; i < w; i++) {
    const s = bodyS(spec, (i + 0.5) / w);
    Sx[i] = s;
    LX[i] = (i > 0 ? LX[i - 1] : 0) + (s - (i > 0 ? Sx[i - 1] : 0)) / (L0 * kx(s));
    sectionAt(spec, Math.min(s, cb), sec);
    for (let j = 0; j < h; j++) {
      sectionPoint(sec, ((j + 0.5) / h) * 2 * Math.PI, pt);
      const o = j * w + i;
      X[o] = pt[0]; Y[o] = pt[1];
      HH[o] = pt[1] >= 0 ? pt[1] / sec.top : pt[1] / sec.bot;
    }
    // the arcs: down the left flank from the back, and down the right
    for (const [j0, j1, dj] of [[0, h / 2, 1], [h - 1, h / 2 - 1, -1]] as const) {
      sectionPoint(sec, 0, prev);
      let a = 0, ly = 0;
      for (let j = j0; j !== j1; j += dj) {
        const o = j * w + i;
        const d = Math.hypot(X[o] - prev[0], Y[o] - prev[1]);
        a += d; ly += d / (H0 * ky(s, HH[o]));
        ARC[o] = a; LY[o] = ly;
        prev[0] = X[o]; prev[1] = Y[o];
      }
      HALF[i] = a;
    }
  }
  // each eye's centre height as an arc on the skin, column by column (the eyes are laid out along the skin: body.ts eyeDisc)
  const EARC = eyes.map(({ e, side }) => {
    const out = new Float32Array(w);
    for (let i = 0; i < w; i++) {
      if (e.across !== undefined) { out[i] = e.across; continue; }
      const jl = (phiAtHeight(sectionAt(spec, Math.min(Sx[i], cb), sec), e.y) / (2 * Math.PI)) * h - 0.5;
      const jf = side > 0 ? jl : h - 1 - jl, j0 = Math.max(0, Math.min(h - 1, Math.floor(jf))), j1 = Math.min(h - 1, j0 + 1), t = jf - j0;
      out[i] = ARC[j0 * w + i] * (1 - t) + ARC[j1 * w + i] * t;
    }
    return out;
  });
  const scr = [scratches(spec, 1, 9, 0.12), scratches(spec, -1, 9, 0.12)];
  const headS = sc.head ?? oper.s - 0.11;
  const ctenoid = sc.type === 'ctenoid', loss = sc.loss ?? 0.01, depth = sc.depth;
  const pec = spec.fins.pectoral, pel = spec.fins.pelvic, lat = spec.lateral;
  for (let i = 0; i < w; i++) {
    const s = Sx[i];
    sectionAt(spec, Math.min(s, cb), sec);
    for (let j = 0; j < h; j++) {
      const o1 = j * w + i;
      const phi = ((j + 0.5) / h) * 2 * Math.PI;
      const side = phi < Math.PI ? 1 : -1;
      const arc = ARC[o1], hh = HH[o1];
      p.s = s; p.phi = phi; p.side = side; p.x = X[o1]; p.y = Y[o1]; p.h = hh;
      out.rough = 0.45; out.metal = 0;
      spec.skin(p, out);
      let hgt = 0, ao = 1, tx = 0, ty = 0;
      // living skin is never one flat tone: blotches and a fine mottle of pigment, the hue drifting a little
      const m1 = fbm(s * 18, arc * 18, 13, 3), m2 = fbm(s * 70, arc * 70, 21, 2), m3 = noise(s * 260, arc * 260, 7);
      const val = 0.9 + 0.2 * m1;
      out.r *= val * (1 + 0.05 * (m2 - 0.5)); out.g *= val; out.b *= val * (1 - 0.05 * (m2 - 0.5));
      shade(out, 0.96 + 0.08 * m3);
      // the pigment cells: fine dark dots crowding the back, thinning down the flank
      const mel = spots(s, arc, 0.0032, 0.28, 31 + side, 0.45, 0.25 + 0.6 * smooth(-0.3, 0.8, hh));
      shade(out, 1 - 0.28 * mel * smooth(-0.5, 0.6, hh) * (1 - 0.6 * out.metal));
      // the scales (from the cheek back; the snout and the jaws bare)
      const fade = smooth(headS - 0.01, headS + 0.025, s) * (1 - smooth(cb - 0.01, cb + 0.02, s));
      if (fade > 0) {
        const lx = LX[i] + (side < 0 ? 0.37 : 0), lyy = LY[o1];
        const SCH = scaleAt(lx + 0.3 * (noise(lx * 0.15, lyy * 0.3, 41) - 0.5), lyy + 0.25 * (noise(lx * 0.2, lyy * 0.15, 43) - 0.5), SC);
        const d = SCH.d, inner = 1 - d * d, post = smooth(-0.4, 0.6, SCH.back);
        const size = kx(s) / sc.along;
        // (on a mirror-silver flank the scales hardly show: the silver lies under them, continuous)
        const show = 1 - 0.65 * smooth(0.3, 0.8, out.metal);
        const lost = SCH.r3 < loss;
        // the exposed field rises a little to the free margin, which steps down onto the scale behind (most at its hind arc)
        hgt += fade * show * depth * 0.06 * size * (d * d - (0.4 + 0.6 * post) * smooth(0.9, 1.0, d)) * (lost ? 0.2 : 1);
        // a ctenoid scale's margin: a fringe of tiny spines (rough, a fine ripple)
        if (ctenoid) {
          const fr = smooth(0.82, 0.97, d) * post;
          hgt += fade * depth * 0.012 * size * fr * Math.sin(Math.atan2(SCH.ey, SCH.ex) * 46);
          out.rough += 0.1 * fr * fade;
        }
        // each scale tilted a little its own way (the glitter of a turning fish), less on a mirror-silver flank, where
        // the least tilt already throws a scale from bright to dark
        const tilt = 0.12 * (1 - 0.75 * out.metal) * inner * fade;
        tx += tilt * (SCH.r1 - 0.5); ty += tilt * (SCH.r2 - 0.5);
        // the margin's pigmented pocket, dark on the back, faint on the silver flank, darkest along the hind arc; each
        // scale's own shade of tone and silver
        const pig = (sc.pigment ?? 0.3) * (0.25 + 0.75 * smooth(-0.3, 0.6, hh));
        const margin = (0.35 + 0.65 * post) * smooth(0.74, 0.94, d) * (1 - smooth(0.97, 1.0, d));
        shade(out, 1 + fade * show * (-pig * margin + 0.07 * (SCH.r1 - 0.5)));
        out.metal = Math.min(1, Math.max(0, out.metal * (1 + fade * show * (0.18 * (SCH.r2 - 0.5) - 0.25 * margin))));
        out.rough += fade * show * (0.08 * margin + 0.05 * (SCH.r3 - 0.5));
        ao *= 1 - 0.12 * margin * fade * show;
        if (lost) {
          // a lost scale: the bare pocket, grey and dull where the silver came away with it
          const k = fade * (1 - smooth(0.85, 1, d));
          shade(out, 1 - 0.25 * k); out.metal *= 1 - 0.7 * k; out.rough += 0.25 * k; ao *= 1 - 0.15 * k;
        }
        // the lateral line: its scales each carry a tube along their middle, opening in a pore near the free margin
        if (lat && s > oper.s && s < cb - 0.02) {
          const target = lat.h + lat.arch * Math.exp(-(((s - 0.3) / 0.18) ** 2));
          const band = (H0 * ky(s, hh)) / Math.max(1e-4, hh >= 0 ? sec.top : sec.bot);
          const on = 1 - smooth(0.25 * band, 0.6 * band, Math.abs(hh - target));
          if (on > 0) {
            const tube = g2(SCH.ey, 0.22) * smooth(-0.7, -0.3, SCH.ex) * (1 - smooth(0.55, 0.75, SCH.ex));
            const pore = g2(SCH.ex - 0.66, 0.1) * g2(SCH.ey, 0.12);
            hgt += on * fade * size * (0.006 * tube - 0.01 * pore);
            shade(out, 1 - 0.3 * on * pore);
            ao *= 1 - 0.3 * on * pore;
          }
        }
      }
      // wear: a few fine scratches across the skin, dull and rough
      for (const q of scr[side > 0 ? 0 : 1]) {
        const ds = s - q.s, da = arc - q.a;
        const t = ds * q.ds + da * q.da;
        if (t < 0 || t > q.len) continue;
        const n = Math.abs(-ds * q.da + da * q.ds);
        const k = q.k * g2(n, 0.0006) * smooth(0, 0.2 * q.len, t) * (1 - smooth(0.8 * q.len, q.len, t));
        if (k < 0.01) continue;
        hgt -= 0.00015 * k; out.rough += 0.3 * k; out.metal *= 1 - 0.5 * k; shade(out, 1 + (out.metal > 0.4 ? -0.15 : 0.12) * k);
      }
      // the silver's colour drifts round the body (blue over the back, gold and violet low on the head and the cheek)
      if (out.metal > 0.2) {
        const a = 0.06 + 0.25 * (spec.iridescence ?? 0);
        out.r *= 1 + a * (fbm(s * 7, arc * 7, 51) - 0.5) + 0.04 * (1 - smooth(oper.s - 0.04, oper.s + 0.06, s));
        out.g *= 1 + a * (fbm(s * 7, arc * 7, 57) - 0.5);
        out.b *= 1 + a * (fbm(s * 7, arc * 7, 63) - 0.5) + 0.05 * smooth(0.1, 0.6, hh);
      }
      // the upper jaw and the snout carry the head's pigment; the lower jaw stays pale
      {
        const m = spec.mouth, P = profilesOf(spec);
        if (s < m.corner + 0.02) {
          const g = P.gape(Math.min(s, m.corner)) * (sec.top / Math.max(1e-4, P.top(Math.max(s, 0.6 * spec.snoutCap))));
          const up = smooth(g - 0.002, g + 0.004, Y[o1]) * (1 - smooth(m.corner - 0.005, m.corner + 0.02, s)) * (1 - smooth(0.3, 0.7, hh));
          shade(out, 1 - 0.22 * up);
        }
      }
      // the head: skin over bone, glossy; the gill cover's plate the glossiest
      headRelief(spec, s, Y[o1], phi, sec, rel);
      hgt += rel.h;
      ao *= rel.ao;
      if (s < oper.s + 0.005) out.rough *= 0.8;
      out.rough *= 1 - 0.35 * rel.plate;
      out.metal = Math.min(1, out.metal + 0.1 * rel.plate * out.metal);
      // the creases round the fins: the pectoral's axil, the pelvics' base, the dorsal and anal fins' grooves, the tail's
      {
        const bx = pec.s + 0.125 * pec.base, by = pec.y - 0.5 * pec.base;
        const d = Math.hypot((s - bx) * 1.4, Y[o1] - by) - 0.5 * pec.base;
        ao *= 1 - 0.3 * g2(Math.max(0, d), 0.008) * smooth(-0.6, 0.4, Math.sin(phi) ** 2 * 2 - 1);
        if (hh < -0.82 && s > pel.s - 0.01 && s < pel.s + 0.3 * pel.base + 0.02) ao *= 1 - 0.25 * smooth(-0.82, -0.97, hh);
        for (const f of spec.fins.median) {
          if (s < f.s0 - 0.005 || s > f.s1 + 0.01) continue;
          ao *= 1 - 0.22 * (f.id === 'a' ? smooth(-0.9, -0.99, hh) : smooth(0.9, 0.99, hh));
        }
        ao *= 1 - 0.18 * g2(s - cb, 0.012);
      }
      // the eyes: the iris and pupil painted on the skin under each eye (the far tier has no eyeballs and shows them
      // flat; the near tiers' corneas sit over them, and the orbit round them shows)
      for (let q = 0; q < eyes.length; q++) {
        const { e, side: es } = eyes[q];
        if (es !== side) continue;
        const dx = (s - e.s) / e.r, dy = (EARC[q][i] - arc) / e.r;
        if (dx * dx + dy * dy > 1.22) continue;
        eyeColour(spec, dx, dy, iris);
        const t = 1 - smooth(0.96, 1.1, Math.hypot(dx, dy));
        out.r += (iris[0] - out.r) * t; out.g += (iris[1] - out.g) * t; out.b += (iris[2] - out.b) * t;
        out.metal += (iris[3] - out.metal) * t; out.rough += (0.3 - out.rough) * t;
        hgt *= 1 - t; tx *= 1 - t; ty *= 1 - t; ao += (1 - ao) * t;
      }
      H[o1] = hgt; TX[o1] = tx; TY[o1] = ty;
      albedo[o1 * 4] = to8(out.r); albedo[o1 * 4 + 1] = to8(out.g); albedo[o1 * 4 + 2] = to8(out.b); albedo[o1 * 4 + 3] = to8(out.metal);
      rough[o1] = Math.min(1, Math.max(0.05, out.rough));
      occ[o1] = Math.max(0, Math.min(1, ao));
    }
  }
  // the relief as a tangent-space normal (xy; z is rebuilt): slopes over the real distances between texels (TL)
  const surface = new Uint8Array(N * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const o1 = j * w + i;
    const i0 = Math.max(0, i - 1), i1 = Math.min(w - 1, i + 1), j0 = (j + h - 1) % h, j1 = (j + 1) % h;
    const du = Math.max(1e-5, Sx[i1] - Sx[i0]);
    const dv = Math.max(1e-5, Math.hypot(X[j1 * w + i] - X[j0 * w + i], Y[j1 * w + i] - Y[j0 * w + i]));
    const nx = -(H[j * w + i1] - H[j * w + i0]) / du + TX[o1], ny = -(H[j1 * w + i] - H[j0 * w + i]) / dv + TY[o1];
    const l = Math.hypot(nx, ny, 1);
    surface[o1 * 4] = to8(0.5 + 0.5 * nx / l); surface[o1 * 4 + 1] = to8(0.5 + 0.5 * ny / l);
    surface[o1 * 4 + 2] = to8(rough[o1]); surface[o1 * 4 + 3] = to8(occ[o1]);
  }
  return { albedo, surface };
}

/** the fins' ray counts by atlas band (d1, d2, a, c, p, v) */
function rayCounts(spec: FishSpec): number[] {
  const n = [8, 8, 8, spec.fins.caudal.rays, spec.fins.pectoral.rays, spec.fins.pelvic.rays];
  for (const f of spec.fins.median) n[f.id === 'd1' ? 0 : f.id === 'd2' ? 1 : 2] = f.rays;
  return n;
}

/**
 * The fin atlas: the species' fin painter, then what every real fin has: the rays branching toward the margin and
 * jointed along their length, the membrane thinning out to the edge and drawn back between the ray tips, the rays of
 * uneven length, a split or two, and a fleshy, opaque base where the fin meets the body.
 */
function paintFins(spec: FishSpec, w: number, bandH: number): Uint8Array {
  const h = bandH * FIN_BAND_COUNT;
  const data = new Uint8Array(w * h * 4);
  const out: FinOut = { r: 0, g: 0, b: 0, a: 0 };
  const ids: FinId[] = ['d1', 'd2', 'a', 'c', 'p', 'v'];
  const counts = rayCounts(spec);
  const spinesOf = (id: FinId) => spec.fins.median.find((f) => f.id === id)?.spines ?? 0;
  // the body's own colour where a fin grows out of it: the tail's root under the last scales, the median fins' bases
  const skinAt = (id: FinId, u: number): [number, number, number] => {
    const q: SkinOut = { r: 0, g: 0, b: 0, rough: 0.5, metal: 0 };
    const f = spec.fins.median.find((m) => m.id === id);
    const s = id === 'c' ? spec.caudalBase - 0.01 : f ? mix(f.s0, f.s1, u) : spec.fins.pectoral.s;
    const hh = id === 'c' ? 2 * u - 1 : id === 'a' ? -0.95 : id === 'p' ? 0 : id === 'v' ? -0.95 : 0.95;
    spec.skin({ s, phi: hh >= 0 ? Math.acos(Math.min(1, hh)) : Math.PI - Math.acos(Math.min(1, -hh)), side: 1, h: hh, x: 0, y: 0 }, q);
    return [q.r, q.g, q.b];
  };
  for (let band = 0; band < FIN_BAND_COUNT; band++) {
    const id = ids[band], n = counts[band], spines = spinesOf(id);
    // one or two splits in the soft membrane, from the margin inward
    const tears = [0, 1].map((k) => ({ at: Math.floor(spines + (n - spines - 1) * hash(band, k, 71 + spec.id.length)), len: mix(0.12, 0.32, hash(band, k, 73)), on: hash(band, k, 79) < 0.65 }));
    for (let j = 0; j < bandH; j++) {
      const v = Math.min(1, Math.max(0, ((j + 0.5) / bandH - 0.03) / 0.94));
      for (let i = 0; i < w; i++) {
        const u = (i + 0.5) / w;
        out.r = out.g = out.b = 0.6; out.a = 0.6;
        spec.fin(id, u, v, out);
        const f = u * (n - 1), k = Math.round(f), between = Math.abs(f - k);
        const soft = k >= spines;
        // rays: branched in two beyond the middle of the fin, jointed along their length
        const split = soft ? smooth(0.55, 0.7, v) : 0, dlt = 0.22 * smooth(0.55, 0.95, v);
        const ray = 1 - smooth(0.08, 0.2, between), branch = 1 - smooth(0.05, 0.12, Math.abs(between - dlt));
        const rayK = ray * (1 - split) + branch * split;
        const joint = soft && rayK > 0.3 ? 1 - 0.18 * g2(((v * 14 + hash(k, band, 3)) % 1) - 0.5, 0.08) : 1;
        shade(out, joint);
        // each ray its own length, the membrane drawn back between the tips, thinning out to the edge
        if (soft) {
          const end = 1 - 0.09 * hash(k, band, 91) - 0.035 * noise(u * n * 0.8, band, 93);
          const edge = end - 0.06 * smooth(0.1, 0.5, between);
          out.a *= 1 - smooth(edge - 0.03, edge, v);
          for (const t of tears) {
            if (!t.on || t.at !== Math.floor(f)) continue;
            const gap = 1 - smooth(0.03, 0.09, Math.abs(f - Math.floor(f) - 0.5));
            out.a *= 1 - gap * smooth(1 - t.len - 0.03, 1 - t.len, v);
          }
        }
        out.a *= (1 - 0.45 * smooth(0.5, 1, v) * (1 - rayK));
        // the fleshy base: thick, opaque, coloured like the body it grows from (the tail's root scaled over)
        const base = 1 - smooth(0.0, id === 'p' || id === 'v' ? 0.1 : id === 'c' ? 0.2 : 0.14, v);
        out.a = out.a + (Math.max(out.a, 0.92) - out.a) * base;
        if (id === 'c' || id === 'd1' || id === 'd2' || id === 'a') {
          const sk = skinAt(id, u), k = (id === 'c' ? 0.85 : 0.5) * base;
          out.r += (sk[0] - out.r) * k; out.g += (sk[1] - out.g) * k; out.b += (sk[2] - out.b) * k;
        }
        const a = Math.min(0.97, out.a);
        const o = ((band * bandH + j) * w + i) * 4;
        data[o] = to8(out.r); data[o + 1] = to8(out.g); data[o + 2] = to8(out.b); data[o + 3] = to8(a);
      }
    }
  }
  return data;
}

/**
 * The eye's colour at (dx, dy) on its disc (radii, +x back, +y up) into c (r, g, b, metalness): a black pupil reaching a
 * little forward (the aphakic gap in front of the lens), the iris a band of guanine silver or gold, fibrous and
 * flecked, carrying the back's pigment over its upper part as most fishes' eyes do, darker toward its edge where the
 * skin of the orbit closes over it, then the orbit's own dark skin.
 */
function eyeColour(spec: FishSpec, dx: number, dy: number, c: number[]): void {
  const e = spec.eyes[0];
  const i0 = hex(e.iris[0]), i1 = hex(e.iris[1]), rim = hex(e.rim ?? 0x1a1a18);
  const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const fwd = Math.max(0, -dx / Math.max(r, 1e-4));
  let pupil = e.pupil * (1 + 0.16 * fwd ** 3);
  // a flathead's or a flounder's iris lappet: a fringed flap hanging over the top of the pupil
  if (e.lappet) pupil *= 1 - e.lappet * smooth(0.3, 0.9, dy / Math.max(r, 1e-4)) * (0.75 + 0.25 * Math.sin(a * 9));
  if (r < pupil) {
    // the lens's depth: a faint cold glint deep in the black
    const k = 0.012 + 0.022 * (1 - smooth(0, pupil, r));
    c[0] = k * 0.7; c[1] = k * 0.95; c[2] = k * 1.15; c[3] = 0;
    return;
  }
  if (r > 1.0) {
    // the orbit under the clear skin: the iris's darkest tone into the head's
    const t = smooth(1.0, 1.35, r);
    for (let k = 0; k < 3; k++) c[k] = (i1[k] * 0.35 + rim[k] * 0.65) * (1 - 0.3 * t) + rim[k] * 0.3 * t;
    c[3] = 0.15;
    return;
  }
  const t = Math.min(1, (r - pupil) / (1 - pupil));
  const fib = 0.78 + 0.3 * noise(a * 18, t * 4, 3) + 0.1 * noise(a * 64, t * 3, 5);
  const fleck = smooth(0.62, 0.8, noise(a * 30, t * 9, 7)) * 0.25;
  for (let k = 0; k < 3; k++) c[k] = (i0[k] + (i1[k] - i0[k]) * smooth(0.1, 1, t)) * (fib + fleck) * 0.72;
  // the upper iris pigmented like the back, the periphery dark, the pupil's margin a thin dark line
  const top = 0.85 * smooth(-0.1, 0.8, dy / Math.max(r, 1e-4)) * smooth(0.2, 0.7, t + 0.25);
  const per = 1 - 0.45 * smooth(0.72, 1, t);
  const edge = 1 - 0.5 * (1 - smooth(0, 0.1, t));
  for (let k = 0; k < 3; k++) c[k] = (c[k] + (rim[k] * 1.6 - c[k]) * top) * per * edge;
  c[3] = 0.55 * (1 - top) * (1 - 0.5 * smooth(0.8, 1, t));
  if (e.lid) {
    // the clear fatty eyelid clouds the front and back of the eye a little
    const lid = e.lid * 0.5 * smooth(0.55, 0.95, Math.abs(dx));
    for (let k = 0; k < 3; k++) c[k] += (0.45 - c[k]) * lid;
  }
}

/** the eye texture (n × n): the eye's disc over 0.5 ± 0.5, metalness in alpha */
export function paintEye(spec: FishSpec, n: number): Uint8Array {
  const data = new Uint8Array(n * n * 4), c = [0, 0, 0, 0];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    eyeColour(spec, ((i + 0.5) / n - 0.5) * 2, ((j + 0.5) / n - 0.5) * 2, c);
    const o = (j * n + i) * 4;
    data[o] = to8(c[0]); data[o + 1] = to8(c[1]); data[o + 2] = to8(c[2]); data[o + 3] = to8(c[3]);
  }
  return data;
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

/** texture sizes per tier: body w × h, fin band width × height, eye */
const SIZES = [
  { bw: 1024, bh: 512, fw: 256, fh: 64, eye: 128 },
  { bw: 512, bh: 256, fw: 128, fh: 32, eye: 64 },
  { bw: 128, bh: 64, fw: 64, fh: 16, eye: 0 },
] as const;

/** the species' materials for the three tiers, painted once */
export function fishLook(spec: FishSpec): FishLook {
  const hit = LOOKS.get(spec.id);
  if (hit) return hit;
  const S0 = SIZES[0];
  const { albedo, surface: srf } = paintBody(spec, S0.bw, S0.bh);
  const fins0 = paintFins(spec, S0.fw, S0.fh);
  const eye0 = paintEye(spec, S0.eye);
  const rays = rayCounts(spec);
  const textures: Texture[] = [];
  const bytes: number[] = [];
  const ripple: FinRipple = { amp: { value: 0 }, phase: { value: 0 } };
  const gill: GillState = { open: { value: 0 }, inside: { value: new Color(spec.inside ?? 0x5a1414) } };
  const gaze: IUniform<Vector2> = { value: new Vector2() };
  const body: MeshPhysicalMaterial[] = [], fins: MeshStandardMaterial[] = [], eyes: MeshPhysicalMaterial[] = [];
  for (let t = 0; t < 3; t++) {
    const S = SIZES[t], f = S0.bw / S.bw, ff = S0.fw / S.fw;
    const map = dataTexture(f === 1 ? albedo : shrink(albedo, S0.bw, S0.bh, f), S.bw, S.bh, true, RepeatWrapping);
    const surface = dataTexture(f === 1 ? srf : shrink(srf, S0.bw, S0.bh, f), S.bw, S.bh, false, RepeatWrapping);
    body.push(bodyMaterial(spec, map, surface, gill, t));
    const finT = dataTexture(ff === 1 ? fins0 : shrink(fins0, S0.fw, S0.fh * FIN_BAND_COUNT, ff), S.fw, S.fh * FIN_BAND_COUNT, true);
    fins.push(finMaterial(finT, ripple, rays, t === 2));
    textures.push(map, surface, finT);
    let eyeBytes = 0;
    if (S.eye) {
      const fe = S0.eye / S.eye;
      const eyeT = dataTexture(fe === 1 ? eye0 : shrink(eye0, S0.eye, S0.eye, fe), S.eye, S.eye, true);
      eyes.push(eyeMaterial(spec, eyeT, t, gaze));
      textures.push(eyeT);
      eyeBytes = S.eye * S.eye * 4;
    }
    bytes.push(((S.bw * S.bh * 8 + S.fw * S.fh * FIN_BAND_COUNT * 4) + eyeBytes) * 4 / 3);
  }
  const look: FishLook = {
    body, fins, eyes, ripple, gill, gaze, textureBytes: bytes,
    dispose() {
      for (const m of [...body, ...fins, ...eyes] as Material[]) m.dispose();
      for (const t of textures) t.dispose();
      LOOKS.delete(spec.id);
    },
  };
  LOOKS.set(spec.id, look);
  return look;
}
