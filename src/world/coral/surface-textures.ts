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

/** Packed linear data: relief, cavity, pigment, raised septa; all maps are original procedural art.
 * Five atlas textures are shared across every kit/material/LOD. Keeping this bounded cache alive
 * avoids invalidating another world's material when one kit is disposed (~6.7 MiB incl. mips).
 */
export interface CoralSurfaceAtlas {
  texture: DataTexture;
  span: Vector2;
  relief: number;
}
const atlases = new Map<CoralSpecies, CoralSurfaceAtlas>();
const SIZE = 512;
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
    0.13 + 0.7 * h + 0.055 * striation * smooth(0.04, 0.21, h) * (1 - smooth(0.82, 1, h)) - 0.07 * mouths;
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
  const acropora = !porites && !foliose;
  // Growth rows bend and radial corallites differ in size: never a sheet of identical rings.
  const warpX = acropora ? (noise((x / SIZE) * 3, (y / SIZE) * 3, 3, 92) - 0.5) * 0.65 : 0;
  const warpY = acropora ? (noise((x / SIZE) * 3, (y / SIZE) * 3, 3, 96) - 0.5) * 0.55 : 0;
  const px = (x / SIZE) * cols + warpX,
    py = (y / SIZE) * rows + warpY;
  const baseY = Math.floor(py),
    baseX = Math.floor(px);
  let nearest = Infinity,
    dx = 0,
    dy = 0,
    individual = 0;
  for (let j = -1; j <= 1; j++) {
    const cy = baseY + j;
    for (let i = -1; i <= 1; i++) {
      const cx = baseX + i;
      const hx = hash(wrap(cx, cols), wrap(cy, rows), 11);
      const hy = hash(wrap(cx, cols), wrap(cy, rows), 19);
      const qx = px - (cx + 0.5 + (cy & 1) * 0.5 + (hx - 0.5) * (acropora ? 0.48 : 0.3));
      const qy = (py - (cy + 0.5 + (hy - 0.5) * (acropora ? 0.45 : 0.29))) * 0.8660254;
      const dist = qx * qx + qy * qy;
      if (dist < nearest) {
        nearest = dist;
        dx = qx;
        dy = qy;
        individual = hx;
      }
    }
  }
  const angle = Math.atan2(dy, dx);
  // Polygonal cups in Porites; slight asymmetry/upward-facing radial lips on Acropora.
  const radius = acropora
    ? Math.hypot(dx * 0.93, dy * 1.09) / (0.77 + individual * 0.48)
    : Math.sqrt(nearest) * (porites ? 1 + 0.075 * Math.cos(angle * 6 + individual) : 1);
  const rim = Math.exp(-Math.pow((radius - (acropora ? 0.3 : 0.37)) / (foliose ? 0.09 : 0.065), 2));
  const cavity = 1 - smooth(acropora ? 0.055 : 0.075, acropora || foliose ? 0.21 : 0.285, radius);
  const mouth = 1 - smooth(0.035, acropora || foliose ? 0.095 : 0.13, radius);
  const sep =
    Math.pow(0.5 + 0.5 * Math.cos(angle * (foliose ? 18 : 12) + individual * 2), 4) *
    smooth(0.06, 0.18, radius) *
    (1 - smooth(0.3, 0.43, radius));
  const grain = noise((x / SIZE) * 210, (y / SIZE) * 210, 210, 33);
  const tissue = noise((x / SIZE) * 18, (y / SIZE) * 18, 18, 44);
  const lip = acropora ? rim * (0.3 + 0.7 * smooth(-0.8, 0.85, Math.sin(angle))) : rim;
  const relief = 0.35 + lip * (foliose ? 0.2 : 0.37) - cavity * 0.22 + sep * 0.13 + (grain - 0.5) * 0.012;
  return [
    relief,
    cavity * (acropora ? 0.34 : 0.48) + mouth * (acropora ? 0.45 : 0.52),
    0.3 + individual * 0.24 + tissue * 0.33,
    rim * 0.62 + sep * 0.38,
  ];
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
      for (let c = 0; c < 4; c++) data[i + c] = Math.round(clamp(sample[c]) * 255);
    }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  texture.name = `${species}/authored-corallite-atlas`;
  texture.colorSpace = NoColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
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
