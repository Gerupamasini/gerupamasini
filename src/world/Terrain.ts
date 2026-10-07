import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, Group, Mesh, MeshStandardMaterial, RedFormat, Vector2, Vector3,
  type IUniform, type Texture, LinearFilter, ClampToEdgeWrapping,
} from 'three';
import { makeSpillTexture } from './Water';
import { WAVES_GLSL, type WaveSet } from './Waves';
import type { MapDef, Substrate } from '../data/schemas';
import { pitMaskAt, pitShape, type FeedingPit } from './FeedingPits';
import { DATA_BASE } from '../data/loader';

export interface TerrainGrid {
  n: number;
  size: number;
  heights: Float32Array;
  substrate: Uint8Array;
  /** 0..1 per vertex: dug sediment (stingray pits) — darker, unrippled */
  pitMask?: Float32Array;
  /** the heights before the pits were pressed in (sampling adds the pits' exact shape) */
  baseHeights?: Float32Array;
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

// the neutral grey of the real flat in daylight (葛西 at low water, measured on the photo: dry sand a mid grey
// of sRGB ~128, the wet flat a touch bluer where it carries the sky); the mud and the creek beds darker
const SUBSTRATE_COLORS: Record<Substrate, [number, number, number]> = {
  sand: [0.37, 0.37, 0.355],
  muddy_sand: [0.29, 0.285, 0.27],
  mud: [0.19, 0.185, 0.17],
  gravel: [0.33, 0.305, 0.27],
  channel: [0.15, 0.145, 0.135],
};

export class Terrain {
  readonly n: number;
  readonly size: number;
  readonly half: number;
  readonly cell: number;
  readonly heights: Float32Array;
  readonly substrate: Uint8Array;
  readonly pitMask: Float32Array | null;
  /** undisturbed grid used by heightAt; the pits are added analytically */
  readonly base: Float32Array;
  readonly pits: FeedingPit[];
  /** pits by 8 m cell (a pit is listed in every cell its reach touches) */
  private readonly pitCells = new Map<number, FeedingPit[]>();
  private readonly pitCell = 8;
  private readonly patches: { mesh: Mesh; x: number; z: number }[] = [];
  readonly patchMaterial: MeshStandardMaterial;
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
  private readonly uSunDirT: IUniform<Vector3> = { value: new Vector3(0, 1, 0) };
  private readonly uCausticGain: IUniform<number> = { value: 2.6 };
  /** 1: grains, burrows and micro relief up close; 0: the cheap far-field shading only (low quality) */
  private readonly uDetail: IUniform<number> = { value: 1 };
  /** アマモ cover over the map (0..1), and the distance range over which the drawn blades hand over to a canopy tint */
  private readonly uMeadow: IUniform<Texture> = { value: new DataTexture(new Uint8Array(1), 1, 1, RedFormat) };
  private readonly uMeadowFar: IUniform<Vector2> = { value: new Vector2(1e4, 1e4 + 1) };
  /** the heights over which the ground turns to the land's grass and earth (the 葛西 bank by default) */
  private readonly uLand: IUniform<Vector2> = { value: new Vector2(3.1, 3.9) };
  /** the sand's colour relative to the 葛西 grey (another shore's sand is another colour) */
  private readonly uSandTint: IUniform<Vector3> = { value: new Vector3(1, 1, 1) };
  private waves: WaveSet | null = null;

  constructor(grid: TerrainGrid, palette: Substrate[], pits: FeedingPit[] = []) {
    this.n = grid.n;
    this.size = grid.size;
    this.half = grid.size / 2;
    this.cell = grid.size / (grid.n - 1);
    this.heights = grid.heights;
    this.substrate = grid.substrate;
    this.pitMask = grid.pitMask ?? null;
    this.base = grid.baseHeights ?? grid.heights;
    this.pits = pits;
    for (const pit of pits) {
      const c = this.pitCell, i0 = Math.floor((pit.x - pit.reach + this.half) / c), i1 = Math.floor((pit.x + pit.reach + this.half) / c);
      const j0 = Math.floor((pit.z - pit.reach + this.half) / c), j1 = Math.floor((pit.z + pit.reach + this.half) / c);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const key = j * 4096 + i;
        let list = this.pitCells.get(key);
        if (!list) { list = []; this.pitCells.set(key, list); }
        list.push(pit);
      }
    }
    this.palette = palette;

    this.heightTexture = new DataTexture(this.heights, this.n, this.n, RedFormat, FloatType);
    this.heightTexture.minFilter = LinearFilter;
    this.heightTexture.magFilter = LinearFilter;
    this.heightTexture.wrapS = ClampToEdgeWrapping;
    this.heightTexture.wrapT = ClampToEdgeWrapping;
    this.heightTexture.needsUpdate = true;
    this.spillTexture = makeSpillTexture(new Float32Array(this.n * this.n).fill(-1e3), this.n);
    this.uSpill = { value: this.spillTexture };

    this.material = this.buildMaterial(false);
    this.patchMaterial = this.buildMaterial(true);
    this.mesh.name = 'terrain';
    this.buildChunks();
    this.buildPitPatches();
  }

  /** Pits whose shape reaches a point. */
  private pitsNear(x: number, z: number): FeedingPit[] | undefined {
    const c = this.pitCell;
    return this.pitCells.get(Math.floor((z + this.half) / c) * 4096 + Math.floor((x + this.half) / c));
  }

  /** The pits' exact relief at a point (0 away from them). */
  pitReliefAt(x: number, z: number): number {
    const list = this.pitsNear(x, z);
    if (!list) return 0;
    let dh = 0;
    for (const pit of list) dh += pitShape(pit, x, z);
    return dh;
  }

  pitMaskAt(x: number, z: number): number {
    const list = this.pitsNear(x, z);
    if (!list) return 0;
    let m = 0;
    for (const pit of list) m = Math.max(m, pitMaskAt(pit, x, z));
    return m;
  }

  /**
   * One fine mesh per pit (4 cm steps) carrying its true shape, laid over the coarse mesh, which was pressed a
   * little deeper so it never shows through. The border follows the coarse triangles exactly, and the patch is
   * drawn with a polygon offset so it wins where the two coincide.
   */
  private buildPitPatches(): void {
    const M = 60;
    for (const pit of this.pits) {
      const R = pit.reach, step = (2 * R) / M, count = (M + 1) * (M + 1);
      const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
      const col = new Float32Array(count * 3), sub = new Float32Array(count), pm = new Float32Array(count);
      for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) {
        const x = pit.x - R + i * step, z = pit.z - R + j * step, v = j * (M + 1) + i;
        const edge = Math.max(Math.abs(x - pit.x), Math.abs(z - pit.z)) / R;
        const blend = Math.min(1, Math.max(0, (edge - 0.86) / 0.14));
        const y = blend >= 1 ? this.coarseMeshHeight(x, z) : blend <= 0 ? this.heightAt(x, z) : this.heightAt(x, z) * (1 - blend) + this.coarseMeshHeight(x, z) * blend;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        const e = 0.03;
        const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z), hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
        const len = Math.hypot(hx, 2 * e, hz);
        nor[v * 3] = -hx / len; nor[v * 3 + 1] = (2 * e) / len; nor[v * 3 + 2] = -hz / len;
        uv[v * 2] = (x + this.half) / this.size; uv[v * 2 + 1] = (z + this.half) / this.size;
        const si = this.substrateIndexAt(x, z), c = SUBSTRATE_COLORS[this.palette[si] ?? 'mud'];
        col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2];
        sub[v] = si;
        pm[v] = this.pitMaskAt(x, z);
      }
      const idx: number[] = [];
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        const a = j * (M + 1) + i, b = a + M + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(pos, 3));
      geo.setAttribute('normal', new BufferAttribute(nor, 3));
      geo.setAttribute('uv', new BufferAttribute(uv, 2));
      geo.setAttribute('color', new BufferAttribute(col, 3));
      geo.setAttribute('substrate', new BufferAttribute(sub, 1));
      geo.setAttribute('pit', new BufferAttribute(pm, 1));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new Mesh(geo, this.patchMaterial);
      mesh.receiveShadow = true;
      mesh.name = `pit-${pit.id}`;
      mesh.visible = false;
      this.mesh.add(mesh);
      this.patches.push({ mesh, x: pit.x, z: pit.z });
    }
  }

  /** Height of the coarse chunk mesh (its triangles, not the bilinear surface) at a point. */
  private coarseMeshHeight(x: number, z: number): number {
    const { i, j, fx, fz } = this.gridIndex(x, z);
    const n = this.n, h = this.heights;
    const a = h[j * n + i], b = h[(j + 1) * n + i], c = h[j * n + i + 1], d = h[(j + 1) * n + i + 1];
    return fx + fz <= 1 ? a + (c - a) * fx + (b - a) * fz : d + (b - d) * (1 - fx) + (c - d) * (1 - fz);
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
    // the pits' fine patches only matter up close; the coarse hollow stands in beyond that
    for (const p of this.patches) p.mesh.visible = Math.hypot(p.x - px, p.z - pz) < 70;
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
    const col = new Float32Array(count * 3), sub = new Float32Array(count), pit = new Float32Array(count);
    const put = (v: number, i: number, j: number, drop: number) => {
      const k = j * n + i;
      pos[v * 3] = -this.half + i * this.cell; pos[v * 3 + 1] = this.heights[k] - drop; pos[v * 3 + 2] = -this.half + j * this.cell;
      nor[v * 3] = nrm[k * 3]; nor[v * 3 + 1] = nrm[k * 3 + 1]; nor[v * 3 + 2] = nrm[k * 3 + 2];
      uv[v * 2] = i / (n - 1); uv[v * 2 + 1] = j / (n - 1);
      const c = SUBSTRATE_COLORS[this.palette[this.substrate[k]] ?? 'mud'];
      col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2];
      sub[v] = this.substrate[k];
      pit[v] = this.pitMask ? this.pitMask[k] : 0;
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
    geo.setAttribute('pit', new BufferAttribute(pit, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }

  private buildMaterial(patch: boolean): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: DoubleSide, polygonOffset: patch, polygonOffsetFactor: patch ? -1 : 0, polygonOffsetUnits: patch ? -2 : 0 });
    const uWater = this.uWater, uWet = this.uWet, uTime = this.uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterLevel = uWater;
      shader.uniforms.uWetLevel = uWet;
      shader.uniforms.uTime = uTime;
      shader.uniforms.uSunUp = this.uSunUp;
      shader.uniforms.uSunDirT = this.uSunDirT;
      shader.uniforms.uCausticGain = this.uCausticGain;
      shader.uniforms.uDetail = this.uDetail;
      shader.uniforms.uMeadow = this.uMeadow;
      shader.uniforms.uMeadowFar = this.uMeadowFar;
      shader.uniforms.uLand = this.uLand;
      shader.uniforms.uSandTint = this.uSandTint;
      if (this.waves) Object.assign(shader.uniforms, this.waves.uniforms);
      shader.uniforms.uSpillTex = this.uSpill;
      shader.uniforms.uHalf = { value: this.half };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nattribute float substrate;\nattribute float pit;\nvarying float vSubstrate;\nvarying float vPit;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSubstrate = substrate;\nvPit = pit;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWorldPos;
varying float vSubstrate;
varying float vPit;
uniform float uWaterLevel;
uniform float uWetLevel;
uniform float uTime;
uniform float uSunUp;
uniform vec3 uSunDirT;
uniform float uCausticGain;
uniform float uDetail;
uniform sampler2D uMeadow;
uniform vec2 uMeadowFar;
uniform vec2 uLand;
uniform vec3 uSandTint;
uniform sampler2D uSpillTex;
uniform float uHalf;
${WAVES_GLSL}
// shared between the colour, normal and roughness stages (the colour stage runs first)
float gFilm = 0.0;
float gQuartz = 0.0;
vec2 gNrmAdd = vec2(0.0);
vec4 gDis = vec4(0.0);
// integer hash: the flat is 320 m wide and the grains are a millimetre, so cell ids run into the hundreds of
// thousands — float tricks fall apart there, integer mixing does not
float hash21(vec2 p) {
  uvec2 v = uvec2(ivec2(floor(p + 0.5)));
  uint h = v.x * 0x27d4eb2du ^ v.y * 0x165667b1u;
  h = (h ^ (h >> 15u)) * 0x2c1b3c6du; h ^= h >> 12u; h *= 0x297a2d39u; h ^= h >> 15u;
  return float(h) * (1.0 / 4294967296.0);
}
vec2 hash22(vec2 p) { return vec2(hash21(p), hash21(p + vec2(1013.0, 7177.0))); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }
// value noise with its derivative (quintic), for micro relief
vec3 vnoiseD(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0), du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hash21(i), b = hash21(i + vec2(1, 0)), c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  float k1 = b - a, k2 = c - a, k3 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k3 * u.x * u.y, du * vec2(k1 + k3 * u.y, k2 + k3 * u.x));
}
// grain field (after MahazeViewer): distance to the nearest grain centre in cell units, two ids, and the offset to it
vec3 grains(vec2 p, out vec2 off) {
  vec2 ip = floor(p), fp = fract(p);
  float best = 9.0; vec2 id = vec2(0.0); off = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(ip + g);
    vec2 r = g + o * 0.8 + 0.1 - fp;
    float d = dot(r, r);
    if (d < best) { best = d; id = ip + g; off = r; }
  }
  return vec3(sqrt(best), hash21(id + vec2(31.0, 17.0)), hash21(id + vec2(59.0, 3.0)));
}
// Ripple marks as one continuous scalar field over the whole flat: shore-parallel crests (wavelength ~8 cm) whose
// line is bent by layers of noise displacement. Bending the phase instead of the direction keeps the local
// wavelength bounded, so the crests swerve without ever breaking, and chunks share the same field.
float rippleWarp(vec2 p) {
  float w = 2.2 * (vnoise(p * 0.04 + 1.7) - 0.5);          // broad swerves, tens of metres
  w += 0.55 * (vnoise(p * 0.125 - 3.1) - 0.5);            // metre-scale bends
  w += 0.2 * (vnoise(p * 0.65 + 8.9) - 0.5);              // crest waviness at the 1.5 m scale
  w += 0.09 * (vnoise(p * 1.7 - 5.3) - 0.5);              // 60 cm wiggles
  w += 0.03 * (vnoise(p * 4.6 + 2.2) - 0.5);              // 20 cm wiggles
  return p.y + w;
}
#define RIPPLE_K 78.5
// Crests that split and merge. Real wave ripples are full of Y-junctions: a crest forks, or two run together.
// In a phase field that is a pair of dislocations — one extra crest inserted between two cores, a fork at each
// end. Pairs are laid along the crest direction in cells of a few metres; the far field of a pair cancels, so
// each is windowed to its cell without a seam (the 2π step between the cores lies where the window is still
// exactly 1). Two layers: long inserted crests every few metres, and short ones in between.
// Accumulates (phase, d/dx, d/dy, nearness to a core) — the cores get a smooth saddle instead of a vanishing wavelength.
void dipoleLayer(vec2 p, float cell, float prob, float sepMin, float sepMax, vec2 seed, inout vec4 acc) {
  vec2 cellF = floor(p / cell);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cellF + vec2(float(i), float(j));
    if (hash21(c + seed) > prob) continue;
    vec2 ctr = (c + 0.15 + 0.7 * hash22(c + seed + vec2(21.0, 5.0))) * cell;
    float sep = mix(sepMin, sepMax, hash21(c + seed + vec2(13.0, 1.0)));
    float sgn = hash21(c + seed + vec2(2.0, 27.0)) < 0.5 ? 1.0 : -1.0;
    float R = min(cell * 0.95, 1.6 * sep + 0.3);
    vec2 d = p - ctr;
    float r = length(d);
    if (r > R) continue;
    vec2 da = d - vec2(sep * 0.5, 0.0), db = d + vec2(sep * 0.5, 0.0);
    float ra2 = max(dot(da, da), 1e-6), rb2 = max(dot(db, db), 1e-6);
    // principal value of the angle difference: its only 2π step is on the segment between the cores
    vec2 q = vec2(da.x * db.x + da.y * db.y, da.y * db.x - da.x * db.y);
    float pv = atan(q.y, q.x);
    vec2 gpv = vec2(-da.y, da.x) / ra2 - vec2(-db.y, db.x) / rb2;
    float t = clamp((r - 0.5 * R) / (0.5 * R), 0.0, 1.0);
    float w = 1.0 - t * t * (3.0 - 2.0 * t);
    vec2 gw = -(6.0 * t * (1.0 - t) / (0.5 * R)) * d / max(r, 1e-4);
    acc.x += sgn * w * pv;
    acc.yz += sgn * (w * gpv + pv * gw);
    acc.w = max(acc.w, max(exp(-ra2 / 0.0016), exp(-rb2 / 0.0016)));
  }
}
vec4 rippleDisloc(vec2 p) {
  vec4 acc = vec4(0.0);
  dipoleLayer(p, 2.0, 0.8, 0.5, 1.3, vec2(3.0, 9.0), acc);
  dipoleLayer(p, 1.0, 0.3, 0.14, 0.36, vec2(41.0, 23.0), acc);
  return acc;
}
float ripplePhase(vec2 p) { return rippleWarp(p) * RIPPLE_K + gDis.x; }
// where the ripples are: patches of flat sand in between, crests fading in and out at the metre scale
float rippleAmp(vec2 p) { return smoothstep(0.3, 0.62, vnoise(p * 0.055 + 4.4)) * smoothstep(0.15, 0.6, vnoise(p * 0.9 + 2.9)) * (0.6 + 0.4 * vnoise(p * 0.2 + 7.1)); }
`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  // surface detail: grain, patches and ripple shading, all procedural
  vec2 mm = vWorldPos.xz * 1000.0;
  float fw = max(length(fwidth(mm)), 1e-4);   // pixel footprint in millimetres
  float grain = (hash21(floor(vWorldPos.xz * 450.0)) - 0.5) * 0.5 + (vnoise(vWorldPos.xz * 35.0) - 0.5) * 0.8;
  float patchN = vnoise(vWorldPos.xz * 0.35) - 0.5;
  float isSand = 1.0 - smoothstep(0.5, 1.5, vSubstrate);
  float muddy = smoothstep(0.5, 1.5, vSubstrate) * (1.0 - smoothstep(2.5, 3.5, vSubstrate));
  diffuseColor.rgb *= mix(vec3(1.0), uSandTint, 1.0 - smoothstep(1.5, 2.5, vSubstrate));
  gDis = rippleDisloc(vWorldPos.xz);
  // ripple troughs hold a little more moisture and fines: faintly darker, following the same field as the normals
  float ripple = cos(ripplePhase(vWorldPos.xz)) * rippleAmp(vWorldPos.xz) * (1.0 - 0.8 * gDis.w) * (0.3 + 0.7 * isSand) * (1.0 - vPit);
  float detail = 1.0 + grain * (0.10 + 0.08 * isSand) + patchN * 0.18 - ripple * 0.05;
  diffuseColor.rgb *= detail;
  // ---- up close: the grains themselves (after MahazeViewer's sediment). Medium quartz grains and coarser shell
  // bits sit on a silty base; each is a disc with a dark rim and a dome in the normal. Faded by pixel footprint.
  float det1 = (1.0 - smoothstep(0.1, 0.35, fw * 0.5 / 1.4)) * uDetail;
  float det2 = (1.0 - smoothstep(0.08, 0.3, fw * 0.5 / 3.4)) * uDetail;
  if (det2 > 0.001) {
    vec2 o1, o2;
    vec3 g1 = grains(mm / 1.4, o1);
    vec3 g2 = grains(mm / 3.4 + 17.0, o2);
    float grainy = (0.3 + 0.5 * isSand) * (1.0 - 0.5 * vPit);
    vec3 alb = diffuseColor.rgb;
    vec3 quartz = alb * 1.3 + vec3(0.06), shell = alb * 1.15 + vec3(0.05, 0.04, 0.03), black = alb * 0.4;
    vec3 c1 = alb * (0.8 + 0.5 * g1.y);
    c1 = g1.z > 0.982 ? black : (g1.z > 0.9 ? quartz : (g1.z > 0.85 ? shell : c1));
    vec3 c2 = alb * (0.75 + 0.6 * g2.y);
    c2 = g2.z > 0.975 ? black : (g2.z > 0.88 ? quartz : (g2.z > 0.82 ? shell : c2));
    float r1 = 0.3 + 0.17 * fract(g1.y * 7.3), r2 = 0.24 + 0.2 * fract(g2.y * 5.1);
    float has1 = step(0.3, fract(g1.z * 3.7)) * grainy, has2 = step(0.68, fract(g2.z * 2.9)) * grainy;
    float disc1 = smoothstep(r1, r1 - 0.07, g1.x) * det1 * has1;
    float disc2 = smoothstep(r2, r2 - 0.05, g2.x) * det2 * has2;
    float ring1 = (smoothstep(r1 + 0.14, r1, g1.x) - smoothstep(r1, r1 - 0.07, g1.x)) * det1 * has1;
    float ring2 = (smoothstep(r2 + 0.12, r2, g2.x) - smoothstep(r2, r2 - 0.05, g2.x)) * det2 * has2;
    alb *= 1.0 - 0.1 * max(ring1, 0.0) - 0.14 * max(ring2, 0.0);
    alb = mix(alb, c1, disc1);
    alb = mix(alb, c2, disc2);
    diffuseColor.rgb = alb;
    gNrmAdd += (-o1 / r1) * 0.9 * disc1 * (1.0 - disc2) + (-o2 / r2) * disc2;
    gQuartz = disc1 * step(0.85, g1.z) * step(g1.z, 0.95) + disc2 * step(0.82, g2.z) * step(g2.z, 0.93);
  }
  // mud: faecal pellets (small dark ovals) on the smooth silt
  float det4 = (1.0 - smoothstep(0.1, 0.4, fw * 0.5 / 5.0)) * uDetail;
  if (det4 > 0.001 && isSand < 0.999) {
    vec2 o4;
    vec3 g4 = grains(mm / 5.0 + 41.0, o4);
    float pel = smoothstep(0.3, 0.2, length(o4 * vec2(1.0, 1.9))) * step(0.72, g4.z) * (1.0 - isSand) * det4;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.6, pel * 0.8);
    gNrmAdd += -o4 * 1.4 * pel;
  }
  // ---- burrow openings: the holes of アナジャコ, スナモグリ and worms, dark with a low collar or a mound of
  // ejected sand; thick on muddy sand, a few on clean sand, none in a pit
  if (uDetail > 0.5) {
    vec2 ob;
    vec3 gb = grains(vWorldPos.xz / 0.3 + 3.0, ob);
    float holeP = mix(0.1, 0.7, muddy) * (1.0 - vPit) * (1.0 - 0.5 * smoothstep(2.5, 3.5, vSubstrate));
    float hasHole = step(gb.z, holeP);
    float mound = step(0.5, gb.y);                       // half the holes sit on a volcano of ejecta
    float holeR = (0.0045 + 0.0045 * fract(gb.y * 3.1)) / 0.3;
    float detH = 1.0 - smoothstep(0.3, 1.0, fw * 0.5 / (holeR * 300.0));
    float detM = 1.0 - smoothstep(0.3, 1.0, fw * 0.5 / 20.0);
    float hole = smoothstep(holeR, holeR * 0.6, gb.x) * hasHole * detH;
    float collarR = holeR * mix(2.2, 4.5, mound);
    float collar = (smoothstep(collarR, holeR * 1.1, gb.x) - smoothstep(holeR * 1.1, holeR * 0.7, gb.x)) * hasHole * detM;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * mix(vec3(0.92, 0.9, 0.88), vec3(1.12, 1.08, 1.02), mound), collar * 0.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.048, 0.045), hole * 0.9);
    // the mound's slope: up toward the hole, then the funnel down into it
    vec2 away = -ob / max(gb.x, 1e-3);
    gNrmAdd += away * (0.6 + 0.6 * mound) * collar - away * 1.2 * hole;
  }
  // ---- micro relief: silt lumps at the millimetre and centimetre scale, faded with distance
  if (uDetail > 0.5) {
    vec3 nd = vnoiseD(mm * 0.35) * 0.5 + vnoiseD(mm * 1.1 + 7.0) * 0.25;
    float bump = (1.0 - smoothstep(0.1, 0.5, fw * 0.35)) * (0.09 + 0.08 * (1.0 - isSand));
    vec3 nd2 = vnoiseD(mm * 0.055 + 3.0);
    float bump2 = (1.0 - smoothstep(0.15, 0.8, fw * 0.055)) * (0.025 + 0.045 * (1.0 - isSand));
    gNrmAdd += nd.yz * bump + nd2.yz * bump2;
  }
  // a stingray's pit: the ray blew the oxidised skin off, so the bowl shows the darker, wetter sand beneath,
  // strewn with the chalky grit of the clams it crushed
  if (vPit > 0.001) {
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.235, 0.21), vPit * 0.4);
    // (rounded flecks of two sizes, each in its own spot of a 4 mm cell, rather than square confetti)
    vec2 gp = vWorldPos.xz * 260.0 + 3.1;
    vec2 gc = floor(gp);
    vec2 go = vec2(hash21(gc + 7.7), hash21(gc + 9.3)) * 0.5 - 0.25;
    float gr = 0.16 + 0.2 * hash21(gc + 2.2);
    float fleck = step(0.9, hash21(gc)) * (1.0 - smoothstep(gr - 0.08, gr + 0.08, length(fract(gp) - 0.5 - go)));
    float grit = fleck * smoothstep(0.3, 0.9, vPit);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.86, 0.82) * (0.78 + 0.22 * hash21(gc + 1.3)), grit * 0.7);
  }
  // diatom film: a patchy golden-brown bloom on undisturbed mud and muddy sand; reduced (black) mud in the
  // lowest, longest-wet hollows (after MahazeViewer's sediment)
  float filmP = muddy * smoothstep(0.35, 0.75, vnoise(vWorldPos.xz * 0.11 - 11.0)) * smoothstep(0.3, 0.7, vnoise(vWorldPos.xz * 0.9 + 4.0));
  gFilm = filmP;
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.78, 0.68, 0.42), filmP * 0.6);
  float reducedP = smoothstep(1.5, 2.5, vSubstrate) * smoothstep(0.55, 0.85, vnoise(vWorldPos.xz * 0.07 + 23.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.058, 0.056, 0.052), reducedP * 0.7);
  // under an アマモ bed the sediment is finer, darker and richer (trapped silt, detritus, the canopy's shade); past the
  // distance where the blades are drawn, the canopy itself stands in (lying mats at low water, dark green under it)
  float meadow = texture2D(uMeadow, (vWorldPos.xz + uHalf) / (2.0 * uHalf)).r;
  if (meadow > 0.002) {
    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.66, 0.68, 0.6), meadow);
    float farM = smoothstep(uMeadowFar.x, uMeadowFar.y, distance(cameraPosition.xz, vWorldPos.xz));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.09, 0.028), farM * meadow * 0.85);
  }
  // the water level here: the tide, or a tide pool's own level above it
  float spillH = texture2D(uSpillTex, (vWorldPos.xz + uHalf) / (2.0 * uHalf)).r;
  float lvl = (spillH > uWaterLevel + 0.01 && spillH > vWorldPos.y + 0.003) ? spillH : uWaterLevel;
  // wet band: everything between the current water level and the recent high-water mark is darker
  float wet = 1.0 - smoothstep(lvl + 0.02, max(lvl, uWetLevel) + 0.05, vWorldPos.y);
  wet = max(wet, 1.0 - smoothstep(lvl - 0.05, lvl + 0.12, vWorldPos.y));
  diffuseColor.rgb *= mix(1.0, 0.76, wet);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.93, 1.04), 0.45 * wet);
  // above the bank: the park's land, dry grass and earth over the packed bank
  float land = smoothstep(uLand.x, uLand.y, vWorldPos.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.31, 0.32, 0.2) * (0.8 + 0.4 * vnoise(vWorldPos.xz * 0.9 + 3.0)), land);
  // sunlight caustics on the submerged bed, focused by the same ripples that bend the view of it: the inverse
  // Jacobian of the refraction map from the wave field's curvature (pools are calm: broad, slow, soft bands)
  float depth = lvl - vWorldPos.y;
  float under = smoothstep(0.0, 0.006, depth) * uSunUp;
  if (under > 0.001) {
    float calmC = (spillH > uWaterLevel + 0.01 && spillH > vWorldPos.y + 0.003) ? 1.0 : 0.0;
    vec3 L = normalize(uSunDirT);
    float D = depth / max(L.y, 0.2);
    float fp = length(fwidth(vWorldPos));
    float caustic = waveCaustic(vWorldPos.xz, L, D, uTime, fp, uCausticGain * mix(1.0, 0.35, calmC));
    // the silt dims the light on its way down; what is left arrives focused
    float reach = exp(-D * mix(1.1, 0.6, calmC));
    diffuseColor.rgb *= mix(1.0, caustic, under * (0.35 + 0.65 * reach));
  }
}`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
{
  // ripple marks: one continuous warped field (see rippleWarp) with its dislocations; sand carries them, mud faintly
  float sandy = 1.0 - smoothstep(1.5, 2.5, vSubstrate);
  float strength = (0.12 + 0.88 * sandy) * rippleAmp(vWorldPos.xz) * 0.26 * (1.0 - vPit) * (1.0 - 0.85 * gDis.w);
  vec2 rp = vWorldPos.xz;
  float ph = ripplePhase(rp);
  // the crest line's local direction comes from the phase gradient (warp plus dislocations), so the shading
  // follows the bends and the forks; where crests crowd the slope grows, where they spread it eases
  float e = 0.02;
  vec2 gph = vec2(rippleWarp(rp + vec2(e, 0.0)) - rippleWarp(rp - vec2(e, 0.0)), rippleWarp(rp + vec2(0.0, e)) - rippleWarp(rp - vec2(0.0, e))) / (2.0 * e) * RIPPLE_K + gDis.yz;
  float kRel = clamp(length(gph) / RIPPLE_K, 0.4, 1.6);
  vec2 grad = normalize(gph + vec2(0.0, 1e-4));
  float slope = cos(ph) * strength * kRel;
  // the lee side is steeper
  slope += cos(ph * 2.0 + 0.6) * strength * 0.35;
  vec3 worldPerturb = vec3(grad.x * slope + gNrmAdd.x, 0.0, grad.y * slope + gNrmAdd.y);
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
  roughnessFactor = mix(roughnessFactor, 0.5, gFilm * 0.5);   // the organic film has a wet sheen of its own
  roughnessFactor = mix(roughnessFactor, 0.28, gQuartz);      // quartz and shell grains glint
}`);
    };
    mat.customProgramCacheKey = () => 'higata-terrain';
    return mat;
  }

  /** Free the chunks, the pit patches, the materials and the data textures (leaving the map). */
  dispose(): void {
    for (const c of this.chunks) for (const g of c.lods) g?.dispose();
    for (const p of this.patches) p.mesh.geometry.dispose();
    this.material.dispose();
    this.patchMaterial.dispose();
    this.heightTexture.dispose();
    this.spillTexture.dispose();
    this.mesh.removeFromParent();
  }

  /** Give the terrain the habitat's spill levels (tide pools). */
  setSpill(spill: Float32Array): void {
    this.spillTexture.dispose();
    this.spillTexture = makeSpillTexture(spill, this.n);
    this.uSpill.value = this.spillTexture;
  }

  setWater(level: number, wetLevel: number, time: number, sunUp = 1, sunDir?: Vector3): void {
    this.uWater.value = level;
    this.uWet.value = Math.max(level, wetLevel);
    this.uTime.value = time;
    this.uSunUp.value = sunUp;
    if (sunDir) this.uSunDirT.value.copy(sunDir);
  }

  /**
   * The アマモ beds' cover (R, 0..1 over the map): darker sediment under them, and their canopy tint beyond `drawnTo`
   * metres, where the drawn blades end.
   */
  setMeadowCover(cover: Texture, drawnTo: number): void {
    this.uMeadow.value = cover;
    this.uMeadowFar.value.set(drawnTo * 0.6, drawnTo);
  }

  /** The heights (T.P. m) over which the ground becomes the land behind the shore: grass and earth. */
  setLandLevel(from: number, to: number): void {
    this.uLand.value.set(from, to);
  }

  /** Tint the sand and muddy sand (multiplies the 葛西 grey). */
  setSandTint(r: number, g: number, b: number): void {
    this.uSandTint.value.set(r, g, b);
  }

  /** Close-up surface detail on or off (quality preset). */
  setDetail(on: boolean): void {
    this.uDetail.value = on ? 1 : 0;
  }

  /** Share the water's wave set so the caustics follow the ripples (call before the first frame). */
  setWaves(waves: WaveSet): void {
    this.waves = waves;
  }

  private gridIndex(x: number, z: number): { i: number; j: number; fx: number; fz: number } {
    const gx = (x + this.half) / this.cell;
    const gz = (z + this.half) / this.cell;
    const i = Math.max(0, Math.min(this.n - 2, Math.floor(gx)));
    const j = Math.max(0, Math.min(this.n - 2, Math.floor(gz)));
    return { i, j, fx: Math.max(0, Math.min(1, gx - i)), fz: Math.max(0, Math.min(1, gz - j)) };
  }

  /** T.P. height at a world position: the undisturbed grid (bilinear) plus the pits' exact shape. */
  heightAt(x: number, z: number): number {
    const { i, j, fx, fz } = this.gridIndex(x, z);
    const n = this.n, h = this.base;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz + this.pitReliefAt(x, z);
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
