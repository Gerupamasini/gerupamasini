import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, Group, Mesh, MeshStandardMaterial, RedFormat, Vector3,
  type IUniform, LinearFilter, ClampToEdgeWrapping,
} from 'three';
import { makeSpillTexture } from './Water';
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

/** chunk edge in grid cells (≈25 m), vertex step per level of detail, and the distances where the detail drops */
const CHUNK = 48;
const LOD_STEP = [1, 2, 4];
const LOD_DIST = [60, 130];
const SKIRT = 0.35;

const SUBSTRATE_COLORS: Record<Substrate, [number, number, number]> = {
  sand: [0.63, 0.54, 0.36],
  muddy_sand: [0.45, 0.37, 0.26],
  mud: [0.28, 0.24, 0.19],
  gravel: [0.48, 0.46, 0.42],
  channel: [0.22, 0.2, 0.16],
};

export class Terrain {
  readonly n: number;
  readonly size: number;
  readonly half: number;
  readonly cell: number;
  readonly heights: Float32Array;
  readonly substrate: Uint8Array;
  readonly palette: Substrate[];
  /** the flat as chunks (frustum-culled, three levels of detail by distance) */
  readonly mesh = new Group();
  readonly material: MeshStandardMaterial;
  private readonly chunks: { mesh: Mesh; lods: (BufferGeometry | null)[]; cx: number; cz: number; lod: number; i0: number; j0: number; i1: number; j1: number }[] = [];
  private nrm = new Float32Array(0);
  readonly heightTexture: DataTexture;
  /** spill level per cell (tide pools keep water up to this height); set once the habitat is known */
  spillTexture: DataTexture;
  private readonly uSpill: IUniform<DataTexture>;
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
    this.spillTexture = makeSpillTexture(new Float32Array(this.n * this.n).fill(-1e3), this.n);
    this.uSpill = { value: this.spillTexture };

    this.material = this.buildMaterial();
    this.mesh.name = 'terrain';
    this.buildChunks();
  }

  /** Pick each chunk's level of detail from its distance to the player. Cheap; call every frame. */
  updateLod(px: number, pz: number): void {
    for (const c of this.chunks) {
      const d = Math.hypot(c.cx - px, c.cz - pz);
      const lod = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : 2;
      if (lod !== c.lod) {
        c.lod = lod;
        // detailed meshes are built the first time a chunk comes close (like loading a chunk)
        c.lods[lod] ??= this.buildChunkGeometry(c.i0, c.j0, c.i1, c.j1, LOD_STEP[lod], this.nrm);
        c.mesh.geometry = c.lods[lod]!;
      }
      // and freed again once the chunk is well out of range
      if (d > LOD_DIST[1] + 40) for (const l of [0, 1]) { const g = c.lods[l]; if (g) { g.dispose(); c.lods[l] = null; } }
    }
  }

  get chunkStats(): { chunks: number; lod0: number; lod1: number; lod2: number } {
    const s = { chunks: this.chunks.length, lod0: 0, lod1: 0, lod2: 0 };
    for (const c of this.chunks) { if (c.lod === 0) s.lod0++; else if (c.lod === 1) s.lod1++; else s.lod2++; }
    return s;
  }

  private buildChunks(): void {
    const n = this.n, nc = Math.ceil((n - 1) / CHUNK);
    // one normal per grid vertex (central differences) so every level of detail and the skirts shade alike
    const nrm = new Float32Array(n * n * 3);
    this.nrm = nrm;
    const h = this.heights, e2 = 2 * this.cell;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const l = h[j * n + Math.max(0, i - 1)], r = h[j * n + Math.min(n - 1, i + 1)];
      const d = h[Math.max(0, j - 1) * n + i], u = h[Math.min(n - 1, j + 1) * n + i];
      const nx = l - r, nz = d - u, len = Math.hypot(nx, e2, nz);
      const o = (j * n + i) * 3;
      nrm[o] = nx / len; nrm[o + 1] = e2 / len; nrm[o + 2] = nz / len;
    }
    for (let cj = 0; cj < nc; cj++) for (let ci = 0; ci < nc; ci++) {
      const i0 = ci * CHUNK, j0 = cj * CHUNK, i1 = Math.min(n - 1, i0 + CHUNK), j1 = Math.min(n - 1, j0 + CHUNK);
      if (i1 <= i0 || j1 <= j0) continue;
      // only the coarse level is built up front; the finer ones come when the player approaches
      const coarse = this.buildChunkGeometry(i0, j0, i1, j1, LOD_STEP[2], nrm);
      const mesh = new Mesh(coarse, this.material);
      mesh.receiveShadow = true;
      mesh.name = `terrain-${ci}-${cj}`;
      this.mesh.add(mesh);
      this.chunks.push({ mesh, lods: [null, null, coarse], cx: -this.half + ((i0 + i1) / 2) * this.cell, cz: -this.half + ((j0 + j1) / 2) * this.cell, lod: 2, i0, j0, i1, j1 });
    }
  }

  /** One chunk at a vertex step, with a skirt hanging down its border so coarser neighbours leave no cracks. */
  private buildChunkGeometry(i0: number, j0: number, i1: number, j1: number, step: number, nrm: Float32Array): BufferGeometry {
    const n = this.n;
    const axis = (a: number, b: number) => { const out: number[] = []; for (let v = a; v < b; v += step) out.push(v); out.push(b); return out; };
    const is = axis(i0, i1), js = axis(j0, j1);
    const cols = is.length, rows = js.length;
    const ring: [number, number][] = [];
    for (let c = 0; c < cols; c++) ring.push([c, 0]);
    for (let r = 1; r < rows; r++) ring.push([cols - 1, r]);
    for (let c = cols - 2; c >= 0; c--) ring.push([c, rows - 1]);
    for (let r = rows - 2; r >= 1; r--) ring.push([0, r]);
    const count = cols * rows + ring.length;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
    const col = new Float32Array(count * 3), sub = new Float32Array(count);
    const put = (v: number, i: number, j: number, drop: number) => {
      const k = j * n + i;
      pos[v * 3] = -this.half + i * this.cell; pos[v * 3 + 1] = this.heights[k] - drop; pos[v * 3 + 2] = -this.half + j * this.cell;
      nor[v * 3] = nrm[k * 3]; nor[v * 3 + 1] = nrm[k * 3 + 1]; nor[v * 3 + 2] = nrm[k * 3 + 2];
      uv[v * 2] = i / (n - 1); uv[v * 2 + 1] = j / (n - 1);
      const c = SUBSTRATE_COLORS[this.palette[this.substrate[k]] ?? 'mud'];
      col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2];
      sub[v] = this.substrate[k];
    };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) put(r * cols + c, is[c], js[r], 0);
    ring.forEach(([c, r], q) => put(cols * rows + q, is[c], js[r], SKIRT));
    const idx: number[] = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = (r + 1) * cols + c, cc = r * cols + c + 1, d = (r + 1) * cols + c + 1;
      idx.push(a, b, cc, cc, b, d);
    }
    for (let q = 0; q < ring.length; q++) {
      const [c0, r0] = ring[q], [c1, r1] = ring[(q + 1) % ring.length];
      const top0 = r0 * cols + c0, top1 = r1 * cols + c1, sk0 = cols * rows + q, sk1 = cols * rows + ((q + 1) % ring.length);
      idx.push(top0, sk0, top1, top1, sk0, sk1);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('normal', new BufferAttribute(nor, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setAttribute('substrate', new BufferAttribute(sub, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }

  private buildMaterial(): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.3, side: DoubleSide });
    const uWater = this.uWater, uWet = this.uWet, uTime = this.uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterLevel = uWater;
      shader.uniforms.uWetLevel = uWet;
      shader.uniforms.uTime = uTime;
      shader.uniforms.uSunUp = this.uSunUp;
      shader.uniforms.uSpillTex = this.uSpill;
      shader.uniforms.uHalf = { value: this.half };
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
uniform sampler2D uSpillTex;
uniform float uHalf;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }
// Ripple marks as one continuous scalar field over the whole flat: shore-parallel crests (wavelength ~8 cm) whose
// line is bent by three layers of noise displacement. Bending the phase instead of the direction keeps the local
// wavelength bounded, so the crests swerve, split and merge without ever breaking, and chunks share the same field.
float rippleWarp(vec2 p) {
  float w = 2.2 * (vnoise(p * 0.04 + 1.7) - 0.5);          // broad swerves, tens of metres
  w += 0.55 * (vnoise(p * 0.125 - 3.1) - 0.5);            // metre-scale bends
  w += 0.2 * (vnoise(p * 0.65 + 8.9) - 0.5);              // crest waviness at the 1.5 m scale
  w += 0.09 * (vnoise(p * 1.7 - 5.3) - 0.5);              // 60 cm: crests split and merge
  w += 0.03 * (vnoise(p * 4.6 + 2.2) - 0.5);              // 20 cm wiggles
  return p.y + w;
}
float ripplePhase(vec2 p) { return rippleWarp(p) * 78.5; }
// where the ripples are: patches of flat sand in between, crests fading in and out at the metre scale
float rippleAmp(vec2 p) { return smoothstep(0.3, 0.62, vnoise(p * 0.055 + 4.4)) * smoothstep(0.15, 0.6, vnoise(p * 0.9 + 2.9)) * (0.6 + 0.4 * vnoise(p * 0.2 + 7.1)); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  // surface detail: grain, patches and ripple shading, all procedural
  // grain: millimetre speckle plus centimetre mottling (the old 1.7 cm cells read as a checkerboard up close)
  float grain = (hash21(floor(vWorldPos.xz * 450.0)) - 0.5) * 0.6 + (vnoise(vWorldPos.xz * 35.0) - 0.5) * 0.8;
  float patchN = vnoise(vWorldPos.xz * 0.35) - 0.5;
  float isSand = 1.0 - smoothstep(0.5, 1.5, vSubstrate);
  // ripple troughs hold a little more moisture and fines: faintly darker, following the same field as the normals
  float ripple = cos(ripplePhase(vWorldPos.xz)) * rippleAmp(vWorldPos.xz) * (0.3 + 0.7 * isSand);
  float detail = 1.0 + grain * (0.10 + 0.08 * isSand) + patchN * 0.18 - ripple * 0.05;
  diffuseColor.rgb *= detail;
  // the water level here: the tide, or a tide pool's own level above it
  float spillH = texture2D(uSpillTex, (vWorldPos.xz + uHalf) / (2.0 * uHalf)).r;
  float lvl = (spillH > uWaterLevel + 0.01 && spillH > vWorldPos.y + 0.003) ? spillH : uWaterLevel;
  // wet band: everything between the current water level and the recent high-water mark is darker
  float wet = 1.0 - smoothstep(lvl + 0.02, max(lvl, uWetLevel) + 0.05, vWorldPos.y);
  wet = max(wet, 1.0 - smoothstep(lvl - 0.05, lvl + 0.12, vWorldPos.y));
  diffuseColor.rgb *= mix(1.0, 0.68, wet);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.88, 0.93, 1.0), 0.3 * wet);
  // sunlight caustics on the submerged bed: moving cell edges that fade with depth
  float depth = lvl - vWorldPos.y;
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
  // ripple marks: one continuous warped field (see rippleWarp); sand carries them, mud only faintly
  float sandy = 1.0 - smoothstep(1.5, 2.5, vSubstrate);
  float strength = (0.12 + 0.88 * sandy) * rippleAmp(vWorldPos.xz) * 0.26;
  vec2 rp = vWorldPos.xz;
  float ph = ripplePhase(rp);
  // the crest line's local direction comes from the warp gradient, so the shading follows the bends
  float e = 0.02;
  vec2 grad = vec2(rippleWarp(rp + vec2(e, 0.0)) - rippleWarp(rp - vec2(e, 0.0)), rippleWarp(rp + vec2(0.0, e)) - rippleWarp(rp - vec2(0.0, e))) / (2.0 * e);
  grad = normalize(grad + vec2(0.0, 1e-4));
  float slope = cos(ph) * strength;
  // the lee side is steeper
  slope += cos(ph * 2.0 + 0.6) * strength * 0.35;
  vec3 worldPerturb = vec3(grad.x * slope, 0.0, grad.y * slope);
  vec3 viewPerturb = (viewMatrix * vec4(worldPerturb, 0.0)).xyz;
  normal = normalize(normal + viewPerturb);
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{
  float spillR = texture2D(uSpillTex, (vWorldPos.xz + uHalf) / (2.0 * uHalf)).r;
  float lvlR = (spillR > uWaterLevel + 0.01 && spillR > vWorldPos.y + 0.003) ? spillR : uWaterLevel;
  float wetR = 1.0 - smoothstep(lvlR + 0.02, max(lvlR, uWetLevel) + 0.05, vWorldPos.y);
  wetR = max(wetR, 1.0 - smoothstep(lvlR - 0.05, lvlR + 0.12, vWorldPos.y));
  roughnessFactor = mix(roughnessFactor, 0.42, wetR);   // damp sand has a soft sheen, not a mirror
}`);
    };
    mat.customProgramCacheKey = () => 'higata-terrain';
    return mat;
  }

  /** Give the terrain the habitat's spill levels (tide pools). */
  setSpill(spill: Float32Array): void {
    this.spillTexture.dispose();
    this.spillTexture = makeSpillTexture(spill, this.n);
    this.uSpill.value = this.spillTexture;
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
