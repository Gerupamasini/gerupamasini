import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  type Vector3,
} from 'three';
import { brainField } from './surface-brain-field';
import { CORAL_INFO, type CoralSpecies } from './types';

/** Packed linear data: RG = 16-bit relief, B = cavity, A = pigment. Original procedural art.
 * Five atlas textures are shared across every kit/material/LOD. Keeping this bounded cache alive
 * avoids invalidating another world's material when one kit is disposed (~26.7 MiB GPU and CPU incl. precision-preserving mip levels).
 */
export interface CoralSurfaceAtlas {
  texture: DataTexture;
  span: Vector2;
  relief: number;
}
const atlases = new Map<CoralSpecies, CoralSurfaceAtlas>();
const SIZE = 1024;
const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wrap = (x: number, n: number): number => ((x % n) + n) % n;
function hash(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 69069);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = smooth(0, 1, x - ix),
    fy = smooth(0, 1, y - iy);
  const a = hash(wrap(ix, period), wrap(iy, period), seed);
  const b = hash(wrap(ix + 1, period), wrap(iy, period), seed);
  const c = hash(wrap(ix, period), wrap(iy + 1, period), seed);
  const d = hash(wrap(ix + 1, period), wrap(iy + 1, period), seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
function sampleField(x: number, y: number): number {
  const f = brainField(),
    n = 192;
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const a = f[wrap(iy, n) * n + wrap(ix, n)];
  const b = f[wrap(iy, n) * n + wrap(ix + 1, n)];
  const c = f[wrap(iy + 1, n) * n + wrap(ix, n)];
  const d = f[wrap(iy + 1, n) * n + wrap(ix + 1, n)];
  return ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy) / 255;
}
/** Macro displacement shares the same periodic field as the fragment surface atlas.
 * Sample local metres before instance transforms; no instance seed offset to preserve registration.
 */
export function brainReliefAt(p: Vector3, normal: Vector3): number {
  const wx = Math.pow(Math.abs(normal.x), 12),
    wy = Math.pow(Math.abs(normal.y), 12),
    wz = Math.pow(Math.abs(normal.z), 12);
  const sum = wx + wy + wz || 1;
  const scale = 192 / 0.24;
  return (
    ((sampleField(p.z * scale, p.y * scale) * wx +
      sampleField(p.x * scale, p.z * scale) * wy +
      sampleField(p.x * scale, p.y * scale) * wz) /
      sum -
      0.5) *
    0.0032
  );
}
function brainTexel(x: number, y: number): readonly number[] {
  const px = (x / SIZE) * 192,
    py = (y / SIZE) * 192;
  const h = sampleField(px, py);
  const gx = sampleField(px + 0.7, py) - sampleField(px - 0.7, py);
  const gy = sampleField(px, py + 0.7) - sampleField(px, py - 0.7);
  const len = Math.hypot(gx, gy) || 1,
    nx = gx / len,
    ny = gy / len;
  // Filter high-frequency tissue grain along the wall normal: septa radiate across a wall,
  // rather than a globally oriented sine stripe running through every valley.
  let striation = 0;
  for (let i = -3; i <= 3; i++) {
    striation += noise((x / SIZE) * 358 + nx * i * 0.85, (y / SIZE) * 358 + ny * i * 0.85, 358, 48);
  }
  striation = smooth(0.37, 0.65, striation / 7);
  const wall = smooth(0.14, 0.74, h);
  const valley = 1 - smooth(0.025, 0.23, h);
  const mouths = valley * smooth(0.48, 0.71, noise((x / SIZE) * 85, (y / SIZE) * 85, 85, 79));
  const tissue = noise((x / SIZE) * 21, (y / SIZE) * 21, 21, 23);
  const relief =
    0.13 +
    0.7 * h * (0.9 + 0.2 * tissue) +
    0.055 * striation * smooth(0.04, 0.21, h) * (1 - smooth(0.82, 1, h)) -
    0.07 * mouths;
  return [
    relief,
    clamp((1 - wall) * 0.53 + mouths * 0.47),
    0.24 + tissue * 0.49 + wall * 0.2,
    striation * wall,
  ];
}
function cupTexel(x: number, y: number, species: CoralSpecies): readonly number[] {
  const cols = 24,
    rows = 28;
  const porites = species === 'porites_lobata';
  const foliose = species === 'montipora_foliosa';
  // Cell centres follow irregular growth, with a periodic, slowly bending lattice underneath.
  const warpX = (noise((x / SIZE) * 4, (y / SIZE) * 4, 4, 92) - 0.5) * 0.85;
  const warpY = (noise((x / SIZE) * 4, (y / SIZE) * 4, 4, 96) - 0.5) * 0.75;
  const px = (x / SIZE) * cols + warpX,
    py = (y / SIZE) * rows + warpY;
  const baseY = Math.floor(py),
    baseX = Math.floor(px);
  let nearest = Infinity,
    second = Infinity,
    dx = 0,
    dy = 0,
    individual = 0,
    maturity = 0;
  for (let j = -1; j <= 1; j++) {
    const cy = baseY + j;
    for (let i = -1; i <= 1; i++) {
      const cx = baseX + i;
      const hx = hash(wrap(cx, cols), wrap(cy, rows), 11);
      const hy = hash(wrap(cx, cols), wrap(cy, rows), 19);
      const qx = px - (cx + 0.5 + (cy & 1) * 0.5 + (hx - 0.5) * 0.78);
      const qy = (py - (cy + 0.5 + (hy - 0.5) * 0.75)) * 0.8660254;
      const distance = qx * qx + qy * qy;
      if (distance < nearest) {
        second = nearest;
        nearest = distance;
        dx = qx;
        dy = qy;
        individual = hx;
        maturity = hash(wrap(cx, cols), wrap(cy, rows), 31);
      } else if (distance < second) second = distance;
    }
  }
  const grain = noise((x / SIZE) * 180, (y / SIZE) * 180, 180, 33);
  const tissue = noise((x / SIZE) * 19, (y / SIZE) * 19, 19, 44);
  const fineGrain = noise((x / SIZE) * 350, (y / SIZE) * 350, 350, 75);
  const pigment = 0.3 + individual * 0.2 + tissue * 0.32 + (grain - 0.5) * 0.12;
  const angle = Math.atan2(dy, dx),
    distance = Math.sqrt(nearest);
  if (porites) {
    // Rounded angular calices share soft walls. Radial septa cross the shallow cups;
    // a narrow Voronoi edge alone incorrectly resembles cracked clay or leather.
    const border = (Math.sqrt(second) - distance) * 0.5;
    const calyx = distance / Math.max(distance + border * 2, 0.001);
    const wall = smooth(0.56, 1.0, calyx);
    const cup = 1 - smooth(0.1, 0.56, calyx);
    const mouth = 1 - smooth(0.055, 0.2, calyx);
    const septa =
      Math.pow(0.5 + 0.5 * Math.cos(angle * 12 + individual * 0.9), 3) *
      smooth(0.12, 0.32, calyx) *
      (1 - smooth(0.82, 1, calyx));
    const relief =
      0.35 + wall * 0.17 - cup * 0.1 + septa * 0.12 + (grain - 0.5) * 0.046 + (fineGrain - 0.5) * 0.012;
    return [relief, cup * 0.24 + mouth * 0.36, pigment, wall * 0.25 + septa * 0.38];
  }
  if (foliose) {
    // Montipora polyps sit in a granular coenosteum, with low papillae between the minute mouths.
    const size = 0.76 + individual * 0.45;
    const cup = 1 - smooth(0.035, 0.155 * size, distance);
    const mouth = 1 - smooth(0.018, 0.07 * size, distance);
    const papillae = smooth(0.37, 0.77, grain) * (1 - cup);
    const lip = Math.exp(-Math.pow((distance - 0.18 * size) / 0.09, 2)) * (0.4 + maturity * 0.6);
    const relief = 0.38 + papillae * 0.17 + lip * 0.075 - cup * 0.13 + (fineGrain - 0.5) * 0.037;
    return [relief, cup * 0.22 + mouth * 0.39, pigment, papillae * 0.28 + lip * 0.18];
  }
  // Radial Acropora corallites have a fleshy, upward facing pocket. A broad lower shoulder
  // merges into the tissue; only part of the lip stands above it, rather than a black annulus.
  const tilt = (individual - 0.5) * 0.75;
  const xx = dx * Math.cos(tilt) + dy * Math.sin(tilt);
  const yy = -dx * Math.sin(tilt) + dy * Math.cos(tilt);
  const size = 0.62 + individual * 0.66;
  const r = Math.hypot(xx * 1.03, (yy - 0.045) * 1.19) / size;
  const development = 0.45 + 0.55 * smooth(0.1, 0.8, maturity);
  const shoulder = Math.exp(
    -((xx * xx) / (0.32 * 0.32) + ((yy + 0.1) * (yy + 0.1)) / (0.43 * 0.43)) / (size * size),
  );
  const lip = Math.exp(-Math.pow((r - 0.235) / 0.09, 2)) * smooth(-0.85, 0.8, yy / Math.max(distance, 0.001));
  const cup = 1 - smooth(0.035, 0.145, r);
  const mouth = 1 - smooth(0.02, 0.065, r);
  const septa =
    Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(yy, xx) * 12 + maturity), 5) *
    smooth(0.055, 0.105, r) *
    (1 - smooth(0.19, 0.27, r));
  const relief =
    0.32 +
    shoulder * 0.17 +
    lip * 0.19 * development -
    cup * 0.17 * development +
    septa * 0.045 +
    (grain - 0.5) * 0.04 +
    (fineGrain - 0.5) * 0.012;
  return [relief, (cup * 0.29 + mouth * 0.39) * development, pigment, lip * 0.37 + shoulder * 0.13];
}
/** RG encodes a single linear height; averaging the bytes independently would lose precision.
 * Author the complete mip chain by averaging decoded heights, then packing each level again.
 */
function heightMipmaps(
  data: Uint8Array,
  size: number,
): Array<{ data: Uint8Array; width: number; height: number }> {
  const levels = [{ data, width: size, height: size }];
  let previous = data;
  for (let width = size / 2; width >= 1; width /= 2) {
    const next = new Uint8Array(width * width * 4),
      stride = width * 2;
    for (let y = 0; y < width; y++)
      for (let x = 0; x < width; x++) {
        const a = (y * 2 * stride + x * 2) * 4;
        const b = a + 4,
          c = a + stride * 4,
          d = c + 4;
        const height = Math.round(
          (previous[a] * 256 +
            previous[a + 1] +
            (previous[b] * 256 + previous[b + 1]) +
            (previous[c] * 256 + previous[c + 1]) +
            (previous[d] * 256 + previous[d + 1])) /
            4,
        );
        const i = (y * width + x) * 4;
        next[i] = height >>> 8;
        next[i + 1] = height & 255;
        next[i + 2] = Math.round((previous[a + 2] + previous[b + 2] + previous[c + 2] + previous[d + 2]) / 4);
        next[i + 3] = Math.round((previous[a + 3] + previous[b + 3] + previous[c + 3] + previous[d + 3]) / 4);
      }
    levels.push({ data: next, width, height: width });
    previous = next;
  }
  return levels;
}
export function coralSurfaceAtlas(species: CoralSpecies): CoralSurfaceAtlas {
  const previous = atlases.get(species);
  if (previous) return previous;
  const brain = species === 'platygyra_daedalea';
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const sample = brain ? brainTexel(x, y) : cupTexel(x, y, species);
      const i = (y * SIZE + x) * 4;
      const height = Math.round(clamp(sample[0]) * 65535);
      data[i] = height >>> 8;
      data[i + 1] = height & 255;
      data[i + 2] = Math.round(clamp(sample[1]) * 255);
      data[i + 3] = Math.round(clamp(sample[2]) * 255);
    }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  texture.name = `${species}/authored-corallite-atlas`;
  texture.colorSpace = NoColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.mipmaps = heightMipmaps(data, SIZE);
  texture.generateMipmaps = false;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const spacing = CORAL_INFO[species].polypSpacing;
  const atlas = {
    texture,
    span: brain ? new Vector2(0.24, 0.24) : new Vector2(spacing * 24, spacing * 0.8660254 * 28),
    relief: brain
      ? 0.0048
      : species === 'montipora_foliosa'
        ? 0.0008
        : species === 'porites_lobata'
          ? 0.0009
          : 0.0017,
  };
  atlases.set(species, atlas);
  return atlas;
}
