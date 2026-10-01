import {
  BufferAttribute, BufferGeometry, DataTexture, FloatType, Mesh, MeshStandardMaterial, RedFormat, Vector3,
  type IUniform, LinearFilter, ClampToEdgeWrapping,
} from 'three';
import type { MapDef, Substrate } from '../data/schemas';
import { DATA_BASE } from '../data/loader';

export interface TerrainGrid {
  n: number;
  size: number;
  heights: Float32Array;
  substrate: Uint8Array;
}

async function loadImageData(url: string): Promise<ImageData> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`地形画像を読み込めません: ${url}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Decode the baked PNGs into a height grid (T.P. metres) and substrate indices. */
export async function loadTerrainGrid(map: MapDef): Promise<TerrainGrid> {
  const [h, s] = await Promise.all([
    loadImageData(`${DATA_BASE}maps/${map.height.file}`),
    loadImageData(`${DATA_BASE}maps/${map.substrate.file}`),
  ]);
  const n = map.resolution;
  if (h.width !== n || h.height !== n) throw new Error(`height.png の解像度が地図定義と違います (${h.width} vs ${n})`);
  const heights = new Float32Array(n * n);
  const substrate = new Uint8Array(n * n);
  const { min_tp_m, max_tp_m } = map.height;
  for (let i = 0; i < n * n; i++) {
    const v = (h.data[i * 4] << 8) | h.data[i * 4 + 1];
    heights[i] = min_tp_m + (v / 65535) * (max_tp_m - min_tp_m);
    substrate[i] = s.data[i * 4];
  }
  return { n, size: map.size_m, heights, substrate };
}

const SUBSTRATE_COLORS: Record<Substrate, [number, number, number]> = {
  sand: [0.72, 0.64, 0.49],
  muddy_sand: [0.52, 0.46, 0.36],
  mud: [0.34, 0.3, 0.25],
  gravel: [0.58, 0.56, 0.52],
  channel: [0.26, 0.24, 0.2],
};

export class Terrain {
  readonly n: number;
  readonly size: number;
  readonly half: number;
  readonly cell: number;
  readonly heights: Float32Array;
  readonly substrate: Uint8Array;
  readonly palette: Substrate[];
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  readonly heightTexture: DataTexture;
  private readonly uWater: IUniform<number> = { value: -10 };
  private readonly uWet: IUniform<number> = { value: -10 };
  private readonly uTime: IUniform<number> = { value: 0 };
  private readonly uSunUp: IUniform<number> = { value: 1 };

  constructor(grid: TerrainGrid, palette: Substrate[]) {
    this.n = grid.n;
    this.size = grid.size;
    this.half = grid.size / 2;
    this.cell = grid.size / (grid.n - 1);
    this.heights = grid.heights;
    this.substrate = grid.substrate;
    this.palette = palette;

    this.heightTexture = new DataTexture(this.heights, this.n, this.n, RedFormat, FloatType);
    this.heightTexture.minFilter = LinearFilter;
    this.heightTexture.magFilter = LinearFilter;
    this.heightTexture.wrapS = ClampToEdgeWrapping;
    this.heightTexture.wrapT = ClampToEdgeWrapping;
    this.heightTexture.needsUpdate = true;

    const geo = this.buildGeometry();
    this.material = this.buildMaterial();
    this.mesh = new Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
  }

  private buildGeometry(): BufferGeometry {
    const n = this.n;
    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    const col = new Float32Array(n * n * 3);
    const sub = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        pos[k * 3] = -this.half + i * this.cell;
        pos[k * 3 + 1] = this.heights[k];
        pos[k * 3 + 2] = -this.half + j * this.cell;
        uv[k * 2] = i / (n - 1);
        uv[k * 2 + 1] = j / (n - 1);
        const s = this.palette[this.substrate[k]] ?? 'mud';
        const c = SUBSTRATE_COLORS[s];
        col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
        sub[k] = this.substrate[k];
      }
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let o = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = (j + 1) * n + i, c = j * n + i + 1, d = (j + 1) * n + i + 1;
        idx[o++] = a; idx[o++] = b; idx[o++] = c;
        idx[o++] = c; idx[o++] = b; idx[o++] = d;
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setAttribute('substrate', new BufferAttribute(sub, 1));
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  private buildMaterial(): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const uWater = this.uWater, uWet = this.uWet, uTime = this.uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterLevel = uWater;
      shader.uniforms.uWetLevel = uWet;
      shader.uniforms.uTime = uTime;
      shader.uniforms.uSunUp = this.uSunUp;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nattribute float substrate;\nvarying float vSubstrate;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSubstrate = substrate;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWorldPos;
varying float vSubstrate;
uniform float uWaterLevel;
uniform float uWetLevel;
uniform float uTime;
uniform float uSunUp;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  // surface detail: grain, patches and ripple shading, all procedural
  float grain = hash21(floor(vWorldPos.xz * 60.0)) - 0.5;
  float patchN = vnoise(vWorldPos.xz * 0.35) - 0.5;
  float ripple = vnoise(vWorldPos.xz * vec2(1.6, 0.25) + 3.7) - 0.5;
  float isSand = step(vSubstrate, 0.5);
  float detail = 1.0 + grain * (0.10 + 0.08 * isSand) + patchN * 0.18 + ripple * 0.06 * (1.0 - isSand);
  diffuseColor.rgb *= detail;
  // wet band: everything between the current water level and the recent high-water mark is darker
  float wet = 1.0 - smoothstep(uWaterLevel + 0.02, uWetLevel + 0.05, vWorldPos.y);
  wet = max(wet, 1.0 - smoothstep(uWaterLevel - 0.05, uWaterLevel + 0.12, vWorldPos.y));
  diffuseColor.rgb *= mix(1.0, 0.62, wet);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.85, 0.92, 1.0), 0.5 * wet);
  // sunlight caustics on the submerged bed: moving cell edges that fade with depth
  float depth = uWaterLevel - vWorldPos.y;
  float under = smoothstep(0.0, 0.04, depth) * exp(-depth * 0.9) * uSunUp;
  if (under > 0.001) {
    vec2 cp = vWorldPos.xz * 2.2;
    float n1 = vnoise(cp + vec2(uTime * 0.22, uTime * 0.17));
    float n2 = vnoise(cp * 1.31 + vec2(-uTime * 0.19, uTime * 0.13) + 5.7);
    float n3 = vnoise(cp * 0.7 + vec2(uTime * 0.08, -uTime * 0.1) + 11.3);
    float caustic = pow(1.0 - abs(n1 - n2), 9.0) * 1.6 + pow(1.0 - abs(n2 - n3), 12.0) * 0.8;
    diffuseColor.rgb *= 1.0 + caustic * under * 0.9;
  }
}`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
{
  // ripple marks on sand: crests roughly parallel to the shore, drifting with low-frequency noise
  float sandy = 1.0 - smoothstep(1.5, 2.5, vSubstrate);
  float strength = sandy * (0.15 + 0.85 * vnoise(vWorldPos.xz * 0.07)) * 0.3;
  float ph = vWorldPos.z * 83.0 + 3.0 * vnoise(vWorldPos.xz * 0.5) + 1.2 * vnoise(vWorldPos.xz * 2.6);
  float slope = cos(ph) * strength;
  // the lee side is steeper
  slope += cos(ph * 2.0 + 0.6) * strength * 0.35;
  vec3 worldPerturb = vec3(slope * 0.12, 0.0, slope);
  vec3 viewPerturb = (viewMatrix * vec4(worldPerturb, 0.0)).xyz;
  normal = normalize(normal + viewPerturb);
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{
  float wetR = 1.0 - smoothstep(uWaterLevel + 0.02, uWetLevel + 0.05, vWorldPos.y);
  wetR = max(wetR, 1.0 - smoothstep(uWaterLevel - 0.05, uWaterLevel + 0.12, vWorldPos.y));
  roughnessFactor = mix(roughnessFactor, 0.14, wetR);
}`);
    };
    mat.customProgramCacheKey = () => 'higata-terrain';
    return mat;
  }

  setWater(level: number, wetLevel: number, time: number, sunUp = 1): void {
    this.uWater.value = level;
    this.uWet.value = Math.max(level, wetLevel);
    this.uTime.value = time;
    this.uSunUp.value = sunUp;
  }

  private gridIndex(x: number, z: number): { i: number; j: number; fx: number; fz: number } {
    const gx = (x + this.half) / this.cell;
    const gz = (z + this.half) / this.cell;
    const i = Math.max(0, Math.min(this.n - 2, Math.floor(gx)));
    const j = Math.max(0, Math.min(this.n - 2, Math.floor(gz)));
    return { i, j, fx: Math.max(0, Math.min(1, gx - i)), fz: Math.max(0, Math.min(1, gz - j)) };
  }

  /** T.P. height at a world position (bilinear). */
  heightAt(x: number, z: number): number {
    const { i, j, fx, fz } = this.gridIndex(x, z);
    const n = this.n, h = this.heights;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  normalAt(x: number, z: number, out = new Vector3()): Vector3 {
    const e = this.cell;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  substrateIndexAt(x: number, z: number): number {
    const gx = Math.round((x + this.half) / this.cell);
    const gz = Math.round((z + this.half) / this.cell);
    const i = Math.max(0, Math.min(this.n - 1, gx)), j = Math.max(0, Math.min(this.n - 1, gz));
    return this.substrate[j * this.n + i];
  }

  substrateAt(x: number, z: number): Substrate {
    return this.palette[this.substrateIndexAt(x, z)] ?? 'mud';
  }

  inside(x: number, z: number, margin = 0): boolean {
    return x > -this.half + margin && x < this.half - margin && z > -this.half + margin && z < this.half - margin;
  }
}
