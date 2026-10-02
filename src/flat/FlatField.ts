import {
  ClampToEdgeWrapping, DataTexture, FloatType, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, NearestFilter, RedFormat, RGFormat, RGBAFormat,
  UnsignedByteType, type IUniform, type MagnificationTextureFilter, type MinificationTextureFilter, type Texture,
} from 'three';
import type { FlatData } from './gen/generate';
import { KIND_DRY, type WaterState, type WaterGrid } from './gen/water';

/** Uint16Array data is half floats */
function tex(data: Float32Array | Uint16Array | Uint8Array, n: number, format: typeof RedFormat | typeof RGFormat | typeof RGBAFormat, filter: 'nearest' | 'linear' | 'mip'): DataTexture {
  const t = new DataTexture(data, n, n, format, data instanceof Float32Array ? FloatType : data instanceof Uint16Array ? HalfFloatType : UnsignedByteType);
  const mag: MagnificationTextureFilter = filter === 'nearest' ? NearestFilter : LinearFilter;
  const min: MinificationTextureFilter = filter === 'nearest' ? NearestFilter : filter === 'mip' ? LinearMipmapLinearFilter : LinearFilter;
  t.magFilter = mag;
  t.minFilter = min;
  t.generateMipmaps = filter === 'mip';
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.flipY = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** Uniforms every flat shader shares: the ground, its materials and the water state. */
export interface FieldUniforms {
  tHFine: IUniform<Texture>;
  tHFar: IUniform<Texture>;
  tNFine: IUniform<Texture>;
  tNFar: IUniform<Texture>;
  tMFine: IUniform<Texture>;
  tMFar: IUniform<Texture>;
  tRip: IUniform<Texture>;
  tFlow: IUniform<Texture>;
  tLvFine: IUniform<Texture>;
  tLvFar: IUniform<Texture>;
  tInFine: IUniform<Texture>;
  tInFar: IUniform<Texture>;
  uFineO: IUniform<number>;
  uFineCell: IUniform<number>;
  uFineN: IUniform<number>;
  uFarO: IUniform<number>;
  uFarCell: IUniform<number>;
  uFarN: IUniform<number>;
  uTide: IUniform<number>;
}

/** GLSL for the shared field: heights (manual bilinear on float textures), normals, materials and water. */
export const FIELD_GLSL = /* glsl */ `
uniform highp sampler2D tHFine, tHFar, tLvFine, tLvFar;
uniform sampler2D tNFine, tNFar, tMFine, tMFar, tRip, tFlow, tInFine, tInFar;
uniform float uFineO, uFineCell, uFineN, uFarO, uFarCell, uFarN, uTide;
float hFetch(highp sampler2D t, vec2 g, float n) {
  g = clamp(g, vec2(0.0), vec2(n - 1.001));
  ivec2 i = ivec2(floor(g)); vec2 f = g - vec2(i);
  float a = texelFetch(t, i, 0).r, b = texelFetch(t, i + ivec2(1, 0), 0).r;
  float c = texelFetch(t, i + ivec2(0, 1), 0).r, d = texelFetch(t, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec2 fineGrid(vec2 xz) { return (xz - uFineO) / uFineCell; }
vec2 farGrid(vec2 xz) { return (xz - uFarO) / uFarCell; }
vec2 fineUV(vec2 xz) { return (fineGrid(xz) + 0.5) / uFineN; }
vec2 farUV(vec2 xz) { return (farGrid(xz) + 0.5) / uFarN; }
// weight of the fine grid: 1 inside, fading over its last 12 m
float fineW(vec2 xz) {
  float e = max(abs(xz.x), abs(xz.y)) - (-uFineO);
  return 1.0 - smoothstep(-14.0, -2.0, e);
}
float groundHeight(vec2 xz) {
  float w = fineW(xz);
  float hf = w < 1.0 ? hFetch(tHFar, farGrid(xz), uFarN) : 0.0;
  if (w <= 0.0) return hf;
  float hn = hFetch(tHFine, fineGrid(xz), uFineN);
  return mix(hf, hn, w);
}
// ground normal (baked, mip-filtered) and concavity
vec4 groundNormalC(vec2 xz, out float concav) {
  float w = fineW(xz);
  vec4 a = texture(tNFar, farUV(xz));
  if (w > 0.0) a = mix(a, texture(tNFine, fineUV(xz)), w);
  concav = a.b * 2.0 - 1.0;
  vec2 nxz = a.rg * 2.0 - 1.0;
  return vec4(normalize(vec3(nxz.x, sqrt(max(1.0 - dot(nxz, nxz), 0.04)), nxz.y)), a.a * 0.5);
}
// materials: mud, shell, ripple amplitude, ripple asymmetry
vec4 groundMat(vec2 xz) {
  float w = fineW(xz);
  vec4 m = texture(tMFar, farUV(xz));
  if (w > 0.0) m = mix(m, texture(tMFine, fineUV(xz)), w);
  return m;
}
// kind of the nearest water (1 pool, 2 sea, 3 creek), per-body variation, fetch (0…1), distance to water (m)
vec4 waterInfo(vec2 xz);
// The water level that applies here — the nearest water's own level, within a band around it (wide enough for the
// swash to run up the sand at the sea's edge), very low elsewhere — and the nearest water's level. The shore line
// itself is wherever the ground rises above this level, so it is as smooth as the ground.
vec2 waterLevels(vec2 xz) {
  float w = fineW(xz);
  vec2 lv = w > 0.5 ? texelFetch(tLvFine, ivec2(clamp(floor(fineGrid(xz) + 0.5), vec2(0.0), vec2(uFineN - 1.0))), 0).rg
                    : texelFetch(tLvFar, ivec2(clamp(floor(farGrid(xz) + 0.5), vec2(0.0), vec2(uFarN - 1.0))), 0).rg;
  vec4 wi = waterInfo(xz);
  float band = wi.x > 1.5 && wi.x < 2.5 ? 6.0 : 1.2;
  return vec2(wi.w < band ? lv.x : -100.0, lv.y);
}
vec4 waterInfo(vec2 xz) {
  float w = fineW(xz);
  vec4 r;
  if (w > 0.5) {
    vec4 a = texelFetch(tInFine, ivec2(clamp(floor(fineGrid(xz) + 0.5), vec2(0.0), vec2(uFineN - 1.0))), 0);
    vec4 s = texture(tInFine, fineUV(xz));
    r = vec4(a.r, a.r, s.g, s.b);
  } else {
    vec4 a = texelFetch(tInFar, ivec2(clamp(floor(farGrid(xz) + 0.5), vec2(0.0), vec2(uFarN - 1.0))), 0);
    vec4 s = texture(tInFar, farUV(xz));
    r = vec4(a.r, a.r, s.g, s.b);
  }
  float code = floor(r.r * 255.0 + 0.5);
  return vec4(floor(code / 64.0), mod(code, 64.0) / 63.0, r.z, r.w * 25.5);
}
`;

/** The flat on the main thread: GPU textures for the shaders and CPU queries for walking. */
export class FlatField {
  readonly uniforms: FieldUniforms;
  water: WaterState;

  constructor(readonly data: FlatData, normals: { fine: Uint8Array; far: Uint8Array }, water: WaterState) {
    const f = data.fine, g = data.far;
    this.water = water;
    this.uniforms = {
      tHFine: { value: tex(f.height, f.n, RedFormat, 'nearest') },
      tHFar: { value: tex(g.height, g.n, RedFormat, 'nearest') },
      tNFine: { value: tex(normals.fine, f.n, RGBAFormat, 'mip') },
      tNFar: { value: tex(normals.far, g.n, RGBAFormat, 'mip') },
      tMFine: { value: tex(f.mat, f.n, RGBAFormat, 'mip') },
      tMFar: { value: tex(g.mat, g.n, RGBAFormat, 'mip') },
      tRip: { value: tex(f.rip, f.n, RGBAFormat, 'linear') },
      tFlow: { value: tex(f.flow, f.n, RGBAFormat, 'linear') },
      tLvFine: { value: tex(water.fine.levels, water.fine.n, RGFormat, 'nearest') },
      tLvFar: { value: tex(water.far.levels, water.far.n, RGFormat, 'nearest') },
      tInFine: { value: tex(water.fine.info, water.fine.n, RGBAFormat, 'linear') },
      tInFar: { value: tex(water.far.info, water.far.n, RGBAFormat, 'linear') },
      uFineO: { value: f.origin },
      uFineCell: { value: f.cell },
      uFineN: { value: f.n },
      uFarO: { value: g.origin },
      uFarCell: { value: g.cell },
      uFarN: { value: g.n },
      uTide: { value: water.tide },
    };
  }

  setWater(w: WaterState): void {
    this.water = w;
    const u = this.uniforms;
    for (const [uni, grid, kind] of [[u.tLvFine, w.fine, 'lv'], [u.tLvFar, w.far, 'lv'], [u.tInFine, w.fine, 'in'], [u.tInFar, w.far, 'in']] as [IUniform<Texture>, WaterGrid, string][]) {
      const t = uni.value as DataTexture;
      t.image.data = kind === 'lv' ? grid.levels : grid.info;
      t.needsUpdate = true;
    }
    u.uTide.value = w.tide;
  }

  private sampleF(H: Float32Array, n: number, o: number, cell: number, x: number, z: number): number {
    const fx = Math.min(Math.max((x - o) / cell, 0), n - 1.001), fz = Math.min(Math.max((z - o) / cell, 0), n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * n + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + n] * (1 - u) + H[k + n + 1] * u) * v;
  }

  /** Ground height (T.P. m) at a world position. */
  heightAt(x: number, z: number): number {
    const f = this.data.fine, g = this.data.far;
    const e = Math.max(Math.abs(x), Math.abs(z)) + f.origin;
    const w = 1 - Math.min(1, Math.max(0, (e + 14) / 12));
    const hf = this.sampleF(g.height, g.n, g.origin, g.cell, x, z);
    if (w <= 0) return hf;
    const t = w * w * (3 - 2 * w);
    return hf + (this.sampleF(f.height, f.n, f.origin, f.cell, x, z) - hf) * t;
  }

  /** Water surface here, or null when the ground is dry. */
  waterLevelAt(x: number, z: number): number | null {
    const f = this.data.fine, w = this.water.fine;
    const i = Math.round((x - f.origin) / f.cell), j = Math.round((z - f.origin) / f.cell);
    if (i < 0 || j < 0 || i >= f.n || j >= f.n) return this.water.tide;
    const k = j * f.n + i;
    const dist = w.info[k * 4 + 2] * 0.1;
    if (dist > 1.2) return null;
    const lv = w.levels[k * 2];
    const h = this.heightAt(x, z);
    return lv > h ? lv : null;
  }

  depthAt(x: number, z: number): number {
    const l = this.waterLevelAt(x, z);
    return l === null ? 0 : Math.max(0, l - this.heightAt(x, z));
  }

  /** 0 sand … 1 mud */
  mudAt(x: number, z: number): number {
    const f = this.data.fine;
    const i = Math.round((x - f.origin) / f.cell), j = Math.round((z - f.origin) / f.cell);
    if (i < 0 || j < 0 || i >= f.n || j >= f.n) return 0;
    return f.mat[(j * f.n + i) * 4] / 255;
  }

  kindAt(x: number, z: number): number {
    const f = this.data.fine;
    const i = Math.round((x - f.origin) / f.cell), j = Math.round((z - f.origin) / f.cell);
    if (i < 0 || j < 0 || i >= f.n || j >= f.n) return KIND_DRY;
    return this.water.fine.info[(j * f.n + i) * 4] >> 6;
  }
}
