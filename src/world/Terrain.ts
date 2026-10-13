import {
  BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FloatType, Group, Mesh, MeshLambertMaterial, MeshStandardMaterial, Matrix4, RedFormat, RGBAFormat, Vector2, Vector3,
  Vector4, type IUniform, type Texture, LinearFilter, ClampToEdgeWrapping,
} from 'three';
import { makeSpillTexture } from './Water';
import { WAVES_GLSL, type WaveSet } from './Waves';
import { surfUniforms, type SurfUniforms } from './Surf';
import { SURF_MEM_GLSL, type SurfMemoryUniforms } from './SurfMemory';
import type { MapDef, Substrate } from '../data/schemas';
import { pitMaskAt, pitShape, type FeedingPit } from './FeedingPits';
import { DATA_BASE } from '../data/loader';
import { WetDry } from './WetDry';

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
  rock: [0.3, 0.295, 0.28],
};

/** hash21 and vnoise of RIPPLE_GLSL on the CPU (the same integer mixing, so the same values) */
function terrainHash(ix: number, iz: number): number {
  let h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = (h ^ (h >>> 12)) >>> 0;
  h = Math.imul(h, 0x297a2d39) >>> 0; h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}
function terrainVnoise(x: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(z);
  let fx = x - i, fz = z - j;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = terrainHash(i, j), b = terrainHash(i + 1, j), c = terrainHash(i, j + 1), d = terrainHash(i + 1, j + 1);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

/** GLSL shared by the fragment stage (shading) and the ripple sheet's vertex stage (relief): hashes, value noise and
 * the ripple field. Needs `uRipRot` and `uRippleGain`. */
const RIPPLE_GLSL = /* glsl */ `
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
// Ripple marks as one continuous scalar field over the whole flat: shore-parallel crests (wavelength ~10 cm, as in the
// photos of the flat) whose
// line is bent by layers of noise displacement. Bending the phase instead of the direction keeps the local
// wavelength bounded, so the crests swerve without ever breaking, and chunks share the same field.
float rippleWarp(vec2 p) {
  float w = 2.2 * (vnoise(p * 0.04 + 1.7) - 0.5);          // broad swerves, tens of metres
  w += 0.55 * (vnoise(p * 0.125 - 3.1) - 0.5);            // metre-scale bends
  w += 0.2 * (vnoise(p * 0.65 + 8.9) - 0.5);              // crest waviness at the 1.5 m scale
  w += 0.16 * (vnoise(p * 1.7 - 5.3) - 0.5);              // 60 cm wiggles
  w += 0.07 * (vnoise(p * 4.6 + 2.2) - 0.5);              // 20 cm wiggles: the crests are sinuous, never ruled lines
  w += 0.018 * (vnoise(p * 12.0 - 7.7) - 0.5);            // and a little beaded at their own scale
  w += 7.0 * (vnoise(p * 0.035 - 6.1) - 0.5);             // the spacing itself wanders: ~7 cm crests here, ~10 cm there
  return p.y + w;
}
#define RIPPLE_K 63.0
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
  dipoleLayer(p, 1.0, 0.6, 0.14, 0.36, vec2(41.0, 23.0), acc);
  return acc;
}
// where the ripples are: patches of flat sand in between, crests fading in and out at the metre scale
float rippleAmp(vec2 p) { return smoothstep(0.3, 0.62, vnoise(p * 0.055 + 4.4)) * smoothstep(0.15, 0.6, vnoise(p * 0.9 + 2.9)) * (0.6 + 0.4 * vnoise(p * 0.2 + 7.1)); }
// the ripple field's own frame: the world turned so that the crests run along its x, parallel to this map's shore
vec2 rippleFrame(vec2 p) { return vec2(uRipRot.x * p.x + uRipRot.y * p.y, -uRipRot.y * p.x + uRipRot.x * p.y); }
vec2 rippleToWorld(vec2 g) { return vec2(uRipRot.x * g.x - uRipRot.y * g.y, uRipRot.y * g.x + uRipRot.x * g.y); }
// how lopsided the ripples are here (0.05 symmetric … 0.3 a steep lee face), and their height relative to the
// fully formed ones: both wander over the flat, so no two stretches of ripples look alike
float rippleSkew(vec2 p) { return 0.05 + 0.25 * vnoise(p * 0.15 + 9.7); }
float rippleSize(vec2 p) { return 0.55 + 0.6 * vnoise(p * 0.07 - 2.3) + 0.25 * (vnoise(p * 0.6 + 4.1) - 0.5); }
// the ripples' cross-section: a gentle stoss face and a steeper lee (up to the crest, then down), −1..1-ish
float rippleProfile(float ph, float skew) { return -(sin(ph) + skew * sin(2.0 * ph + 0.6)) / (1.0 + skew); }
// the ripples' crest-to-trough half height (m) where they are fully formed
#define RIPPLE_H 0.015
// the ripple relief (m) at a point, from the same field the shading uses (crest positive, trough negative)
float rippleHeight(vec2 xz, float sandy, float pit) {
  vec2 rq = rippleFrame(xz);
  vec4 dis = rippleDisloc(rq);
  float ph = rippleWarp(rq) * RIPPLE_K + dis.x;
  float amp = rippleAmp(rq) * (1.0 - 0.8 * dis.w) * (0.12 + 0.88 * sandy) * (1.0 - pit) * uRippleGain;
  return RIPPLE_H * amp * rippleSize(rq) * rippleProfile(ph, rippleSkew(rq));
}
`;


/** GLSL for the ripple sheet's vertex stage: the coarse mesh's own surface (its triangles, colours, normals) sampled at
 * any point from the grid textures, then the ripple field. */
const SHEET_VERTEX_GLSL = /* glsl */ `
uniform sampler2D uGridTex;
uniform sampler2D uNrmTex;
uniform float uGridN;
uniform float uCell;
uniform vec3 uSubCol[8];
float gSheetH = 0.0, gSheetSub = 0.0, gSheetPit = 0.0;
vec3 gSheetNrm = vec3(0.0, 1.0, 0.0), gSheetCol = vec3(0.0);
${RIPPLE_GLSL}
// the coarse mesh at a point: the grid cell's two triangles (split along the b–c diagonal, as the chunks are), with
// height, substrate, pit, normal and colour interpolated as the mesh's own vertices interpolate them
void sheetSample(vec2 xz) {
  vec2 g = (xz + uHalf) / uCell;
  vec2 i = clamp(floor(g), vec2(0.0), vec2(uGridN - 2.0));
  vec2 f = clamp(g - i, 0.0, 1.0);
  ivec2 ia = ivec2(i), ib = ia + ivec2(0, 1), ic = ia + ivec2(1, 0), id = ia + ivec2(1, 1);
  vec4 A = texelFetch(uGridTex, ia, 0), B = texelFetch(uGridTex, ib, 0), C = texelFetch(uGridTex, ic, 0), D = texelFetch(uGridTex, id, 0);
  vec4 w = f.x + f.y <= 1.0 ? vec4(1.0 - f.x - f.y, f.y, f.x, 0.0) : vec4(0.0, 1.0 - f.x, 1.0 - f.y, f.x + f.y - 1.0);
  vec4 s = w.x * A + w.y * B + w.z * C + w.w * D;
  gSheetH = s.r; gSheetSub = s.g; gSheetPit = s.b;
  gSheetNrm = normalize(w.x * texelFetch(uNrmTex, ia, 0).xyz + w.y * texelFetch(uNrmTex, ib, 0).xyz + w.z * texelFetch(uNrmTex, ic, 0).xyz + w.w * texelFetch(uNrmTex, id, 0).xyz);
  gSheetCol = w.x * uSubCol[int(A.g + 0.5)] + w.y * uSubCol[int(B.g + 0.5)] + w.z * uSubCol[int(C.g + 0.5)] + w.w * uSubCol[int(D.g + 0.5)];
}
`;

/** the ripple sheet's radius (m) per quality: none at the lightest (the ripples stay painted on the flat mesh) */
export const RIPPLE_SHEET_RADIUS: Record<'minimal' | 'low' | 'mid' | 'high', number> = { minimal: 0, low: 2, mid: 3, high: 4 };
/** the sheet's vertex spacing (m): eight to a ripple, so where the water's edge cuts the troughs it runs smooth */
const SHEET_STEP = 0.0125;
/** how far the coarse mesh steps down under the sheet (m): clear of the deepest trough */
const SHEET_DROP = 0.05;

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
  /** how long each height has been out of the water, as drying (WetDry): the sediment's film, darkness and gloss */
  readonly wetDry: WetDry;
  private readonly uWetDry: IUniform<DataTexture>;
  private readonly uWetDryRange: IUniform<Vector2>;
  /** the sun's shadow beyond the near map (FarShadow), and the near map's world → UV (to know where it reaches) */
  private farShadow: { uFarShadowMap: IUniform<Texture | null>; uFarShadowMatrix: IUniform<Matrix4>; uFarShadowOn: IUniform<number> } = {
    uFarShadowMap: { value: null }, uFarShadowMatrix: { value: new Matrix4() }, uFarShadowOn: { value: 0 },
  };
  private readonly uNearShadowMatrix: IUniform<Matrix4> = { value: new Matrix4() };
  /**
   * The wet ground's look, fitted to photographs (tools/grade/calibrate.mjs): how dark saturated sediment is (its
   * albedo's share), how far over the water the water table keeps films standing in the troughs and hollows (m), and
   * how rough a film gets far off (its ripples finer than a pixel).
   */
  readonly look = { wetDark: { value: 0.45 }, filmTable: { value: 0.5 }, filmFarRough: { value: 0.3 } };
  /** the relief's own shadow over the flat (TerrainShadow) */
  private terrainSun: { uTerrainSun: IUniform<Texture | null>; uTerrainSunOn: IUniform<number> } = { uTerrainSun: { value: null }, uTerrainSunOn: { value: 0 } };
  private readonly uTime: IUniform<number> = { value: 0 };
  private readonly uSunUp: IUniform<number> = { value: 1 };
  private readonly uSunDirT: IUniform<Vector3> = { value: new Vector3(0, 1, 0) };
  private readonly uCausticGain: IUniform<number> = { value: 2.6 };
  /** 1: grains, burrows and micro relief up close; 0: the cheap far-field shading only (low quality) */
  private readonly uDetail: IUniform<number> = { value: 1 };
  /** the ripple marks' strength (1: 葛西's sandy flat; 0: none, a lake's mud flat) */
  private readonly uRippleGain: IUniform<number> = { value: 1 };
  /** 0..1: how far the mud takes the look of a sheltered silt flat (after MahazeViewer's sediment): two-scale
   * mottling, stronger silt lumps, few sand grains, a glossier wet sheen */
  private readonly uMudLook: IUniform<number> = { value: 0 };
  /** the water's mirror of the land and sky (shared with the water pass, see shareMirror): the sheets of water on a
   * mud flat show it as the river does */
  private mirrorU: { tMirror: IUniform<unknown>; uMirrorMat: IUniform<Matrix4>; uMirrorOn: IUniform<number> } = {
    tMirror: { value: null }, uMirrorMat: { value: new Matrix4() }, uMirrorOn: { value: 0 },
  };
  /** アマモ cover over the map (0..1), and the distance range over which the drawn blades hand over to a canopy tint */
  private readonly uMeadow: IUniform<Texture> = { value: new DataTexture(new Uint8Array(1), 1, 1, RedFormat) };
  private readonly uMeadowFar: IUniform<Vector2> = { value: new Vector2(1e4, 1e4 + 1) };
  /** the heights over which the ground turns to the land's grass and earth (the 葛西 bank by default) */
  private readonly uLand: IUniform<Vector2> = { value: new Vector2(3.1, 3.9) };
  /** the sand's colour relative to the 葛西 grey (another shore's sand is another colour) */
  private readonly uSandTint: IUniform<Vector3> = { value: new Vector3(1, 1, 1) };
  /** the mud's (and creek beds') colour relative to the 葛西 grey: subtropical estuary mud is warmer */
  private readonly uMudTint: IUniform<Vector3> = { value: new Vector3(1, 1, 1) };
  /** (cos, sin) of the ripple marks' turn from 葛西's: their crests run along x there, parallel to that shore */
  private readonly uRipRot: IUniform<Vector2> = { value: new Vector2(1, 0) };
  /** the ripple sheet: its centre (snapped to its grid), radius and the coarse mesh's step down under it */
  private readonly uSheetC: IUniform<Vector2> = { value: new Vector2(0, 0) };
  private readonly uSheetR: IUniform<number> = { value: 0 };
  private readonly uSheetDrop: IUniform<number> = { value: 0 };
  /** the coarse grid for the sheet: height, substrate, pit (RGBA float) and the vertex normals */
  private readonly gridTexture: DataTexture;
  private readonly nrmTexture: DataTexture;
  private sheet: Mesh | null = null;
  /** the ripple sheet's radius the quality asks for (it stays away while the ripples' gain is 0) */
  private sheetWanted = 0;
  private sheetMaterial: MeshStandardMaterial | null = null;
  private waves: WaveSet | null = null;
  /** the surf on an open shore (shared with the water): the sand glistens where the swash has just been */
  private surf: SurfUniforms = surfUniforms(null);
  /** what the sand remembers of the swash (SurfMemory: film, saturation, foam, swash marks), when there is a memory */
  private readonly uSurfMem: IUniform<Texture | null> = { value: null };
  private readonly uMemBox: IUniform<Vector4> = { value: new Vector4(0, 0, 1, 0) };

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
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < this.heights.length; k++) { const y = this.heights[k]; if (y < lo) lo = y; if (y > hi) hi = y; }
    this.wetDry = new WetDry(lo - 0.05, hi + 0.05);
    this.uWetDry = { value: this.wetDry.texture };
    this.uWetDryRange = { value: this.wetDry.range };

    this.heightTexture = new DataTexture(this.heights, this.n, this.n, RedFormat, FloatType);
    this.heightTexture.minFilter = LinearFilter;
    this.heightTexture.magFilter = LinearFilter;
    this.heightTexture.wrapS = ClampToEdgeWrapping;
    this.heightTexture.wrapT = ClampToEdgeWrapping;
    this.heightTexture.needsUpdate = true;
    this.spillTexture = makeSpillTexture(new Float32Array(this.n * this.n).fill(-1e3), this.n);
    this.uSpill = { value: this.spillTexture };

    // (built before the materials: the sheet's vertex stage reads them)
    const n2 = this.n * this.n, gd = new Float32Array(n2 * 4);
    for (let k = 0; k < n2; k++) { gd[k * 4] = this.heights[k]; gd[k * 4 + 1] = this.substrate[k]; gd[k * 4 + 2] = this.pitMask ? this.pitMask[k] : 0; }
    this.gridTexture = new DataTexture(gd, this.n, this.n, RGBAFormat, FloatType);
    this.gridTexture.needsUpdate = true;
    this.nrmTexture = new DataTexture(new Float32Array(n2 * 4), this.n, this.n, RGBAFormat, FloatType);
    this.material = this.buildMaterial('terrain');
    this.patchMaterial = this.buildMaterial('patch');
    this.mesh.name = 'terrain';
    this.buildChunks();
    const nd = this.nrmTexture.image.data as Float32Array;
    for (let k = 0; k < n2; k++) { nd[k * 4] = this.nrm[k * 3]; nd[k * 4 + 1] = this.nrm[k * 3 + 1]; nd[k * 4 + 2] = this.nrm[k * 3 + 2]; }
    this.nrmTexture.needsUpdate = true;
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
    // the ripple sheet follows the player in whole grid steps, so its vertices stay put on the ground as it moves
    if (this.sheet) this.uSheetC.value.set(Math.round(px / SHEET_STEP) * SHEET_STEP, Math.round(pz / SHEET_STEP) * SHEET_STEP);
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

  private buildMaterial(kind: 'terrain' | 'patch' | 'sheet'): MeshStandardMaterial {
    // (a pit's patch lies on the coarse mesh's own surface and is drawn over it; the ripple sheet stands only where
    // the coarse mesh is stepped down out of its way, so it needs no offset — and the water pass, which tells from
    // the depth whether the ground is above the swash's sheet of a few millimetres, sees it where it is)
    const over = kind === 'patch';
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: DoubleSide, polygonOffset: over, polygonOffsetFactor: over ? -1 : 0, polygonOffsetUnits: over ? -2 : 0 });
    const uWater = this.uWater, uTime = this.uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterLevel = uWater;
      shader.uniforms.uWetDry = this.uWetDry;
      Object.assign(shader.uniforms, this.farShadow, this.terrainSun);
      shader.uniforms.uWetDark = this.look.wetDark;
      shader.uniforms.uFilmTable = this.look.filmTable;
      shader.uniforms.uFilmFarRough = this.look.filmFarRough;
      shader.uniforms.uNearShadowMatrix = this.uNearShadowMatrix;
      shader.uniforms.uWetDryRange = this.uWetDryRange;
      shader.uniforms.uTime = uTime;
      shader.uniforms.uSunUp = this.uSunUp;
      shader.uniforms.uSunDirT = this.uSunDirT;
      shader.uniforms.uCausticGain = this.uCausticGain;
      shader.uniforms.uDetail = this.uDetail;
      shader.uniforms.uRippleGain = this.uRippleGain;
      shader.uniforms.uMudLook = this.uMudLook;
      shader.uniforms.tMirror = this.mirrorU.tMirror;
      shader.uniforms.uMirrorMat = this.mirrorU.uMirrorMat;
      shader.uniforms.uMirrorOn = this.mirrorU.uMirrorOn;
      shader.uniforms.uMeadow = this.uMeadow;
      shader.uniforms.uMeadowFar = this.uMeadowFar;
      shader.uniforms.uLand = this.uLand;
      shader.uniforms.uSandTint = this.uSandTint;
      shader.uniforms.uMudTint = this.uMudTint;
      shader.uniforms.uRipRot = this.uRipRot;
      shader.uniforms.uSurf = this.surf.uSurf;
      shader.uniforms.tSurfZone = this.surf.tSurfZone;
      shader.uniforms.uSurfGrid = this.surf.uSurfGrid;
      shader.uniforms.tSurfMem = this.uSurfMem;
      shader.uniforms.uMemBox = this.uMemBox;
      if (this.waves) Object.assign(shader.uniforms, this.waves.uniforms);
      shader.uniforms.uSpillTex = this.uSpill;
      shader.uniforms.uHalf = { value: this.half };
      shader.uniforms.uSheetC = this.uSheetC;
      shader.uniforms.uSheetR = this.uSheetR;
      shader.uniforms.uSheetDrop = this.uSheetDrop;
      shader.uniforms.uGridTex = { value: this.gridTexture };
      shader.uniforms.uNrmTex = { value: this.nrmTexture };
      shader.uniforms.uGridN = { value: this.n };
      shader.uniforms.uCell = { value: this.cell };
      shader.uniforms.uSubCol = { value: this.palette.map((p) => new Vector3(...SUBSTRATE_COLORS[p])).concat(Array.from({ length: Math.max(0, 8 - this.palette.length) }, () => new Vector3())).slice(0, 8) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
varying vec3 vWorldPos;
attribute float substrate;
attribute float pit;
varying float vSubstrateV;
varying float vPit;
uniform vec2 uSheetC;
uniform float uSheetR;
uniform float uSheetDrop;
uniform vec2 uRipRot;
uniform float uRippleGain;
uniform float uHalf;
${kind === 'sheet' ? SHEET_VERTEX_GLSL : ''}`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
${kind === 'sheet' ? 'vSubstrateV = gSheetSub;\nvPit = gSheetPit;' : 'vSubstrateV = substrate;\nvPit = pit;'}`);
      if (kind === 'sheet') {
        // the ripple sheet: a fine grid that follows the player, standing on the coarse mesh's own triangles and
        // raised into the ripples' relief, so the troughs are real hollows the water can lie in
        shader.vertexShader = shader.vertexShader
          .replace('#include <color_vertex>', '#include <color_vertex>\nsheetSample(uSheetC + position.xz);\n#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\nvColor.rgb = gSheetCol;\n#endif')
          .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = gSheetNrm;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
          .replace('#include <begin_vertex>', `vec3 transformed = vec3(uSheetC.x + position.x, gSheetH, uSheetC.y + position.z);
{
  // the relief fades out toward the sheet's rim, where the coarse mesh takes over again
  float edge = 1.0 - smoothstep(uSheetR - 1.6, uSheetR - 0.5, length(position.xz));
  float sandy = 1.0 - smoothstep(1.5, 2.5, gSheetSub);
  transformed.y += rippleHeight(transformed.xz, sandy, gSheetPit) * edge;
}`);
      } else if (kind === 'terrain') {
        // under the ripple sheet the coarse mesh steps down out of the way (it comes back up before the sheet's rim)
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
if (uSheetDrop > 0.0) transformed.y -= uSheetDrop * (1.0 - smoothstep(uSheetR - 1.3, uSheetR - 0.3, length(transformed.xz - uSheetC)));`);
      }
      if (kind === 'sheet') {
        // the sheet stops where the coarse mesh comes back up to the same surface (that is the ground beyond)
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec2 uSheetC;\nuniform float uSheetR;')
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{ vec2 sd = vWorldPos.xz - uSheetC; if (dot(sd, sd) > (uSheetR - 0.32) * (uSheetR - 0.32)) discard; }`);
      }
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWorldPos;
varying float vSubstrateV;
// the substrate here: interpolated across the mesh's triangles, and on a silt flat (uMudLook) frayed with noise so
// the sand and the mud, and everything that follows them, meet along a ragged line and not along triangle edges
float vSubstrate;
varying float vPit;
uniform float uWaterLevel;
uniform sampler2D uWetDry;
uniform vec2 uWetDryRange;
uniform float uWetDark, uFilmTable, uFilmFarRough;
uniform sampler2D uFarShadowMap;
uniform mat4 uFarShadowMatrix;
uniform float uFarShadowOn;
uniform mat4 uNearShadowMatrix;
uniform sampler2D uTerrainSun;
uniform float uTerrainSunOn;
// the sun's shadow where the near map does not reach: the coarse map of the whole flat, 2×2 filtered (1 lit)
float farSunShadow(vec3 wp) {
  if (uFarShadowOn < 0.5) return 1.0;
  vec4 nc = uNearShadowMatrix * vec4(wp, 1.0);
  vec2 nuv = nc.xy / nc.w;
  float nearCover = smoothstep(0.0, 0.06, min(min(nuv.x, nuv.y), min(1.0 - nuv.x, 1.0 - nuv.y)));
  if (nearCover >= 1.0) return 1.0;
  vec4 c = uFarShadowMatrix * vec4(wp, 1.0);
  vec3 sc = c.xyz / c.w;
  if (any(lessThan(sc.xy, vec2(0.0))) || any(greaterThan(sc.xy, vec2(1.0)))) return 1.0;
  vec2 ts = vec2(textureSize(uFarShadowMap, 0));
  vec2 p = sc.xy * ts - 0.5, f = fract(p);
  vec2 b = (floor(p) + 0.5) / ts, o = 1.0 / ts;
  // (a texel is 15–30 cm: the bias keeps the ground from shadowing itself)
  float z = sc.z - 0.0008;
  float s00 = step(z, texture2D(uFarShadowMap, b).r), s10 = step(z, texture2D(uFarShadowMap, b + vec2(o.x, 0.0)).r);
  float s01 = step(z, texture2D(uFarShadowMap, b + vec2(0.0, o.y)).r), s11 = step(z, texture2D(uFarShadowMap, b + o).r);
  float lit = mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
  return mix(lit, 1.0, nearCover);
}
uniform float uTime;
uniform float uSunUp;
uniform vec3 uSunDirT;
uniform float uCausticGain;
uniform float uDetail;
uniform float uRippleGain;
uniform float uMudLook;
uniform sampler2D tMirror;
uniform mat4 uMirrorMat;
uniform float uMirrorOn;
uniform sampler2D uMeadow;
uniform vec2 uMeadowFar;
uniform vec2 uLand;
uniform vec3 uSandTint;
uniform vec3 uMudTint;
uniform vec2 uRipRot;
uniform sampler2D uSpillTex;
uniform float uHalf;
uniform vec4 uSurf;
uniform sampler2D tSurfZone;
uniform vec2 uSurfGrid;
uniform sampler2D tSurfMem;
uniform vec4 uMemBox;
${WAVES_GLSL}
${SURF_MEM_GLSL}
// the bed's slope toward the sea, from the surf's zone (SurfZone)
float surfSlopeAt(vec2 q) {
  vec2 pc = clamp(q, vec2(-uSurfGrid.x), vec2(uSurfGrid.x));
  return texture2D(tSurfZone, ((pc + uSurfGrid.x) / (2.0 * uSurfGrid.x) * (uSurfGrid.y - 1.0) + 0.5) / uSurfGrid.y).w;
}
// shared between the colour, normal and roughness stages (the colour stage runs first)
float gFilm = 0.0;
// a mud flat at low water (uMudLook): how saturated the silt is, and the thin sheets of water lying on it
float gMudWet = 0.0;
float gSheet = 0.0;
// the sheets' signed field (>0 inside), the dark glossy margin of saturated silt around them, and mud under the water
float gSheetField = -1.0;
float gHalo = 0.0;
float gSubm = 0.0;
float gSwash = 0.0;
// how wet the sediment is (0 dry .. 1 saturated), and the film of water standing on it (gloss, smoothed grains)
float gWet = 0.0;
float gWetFilm = 0.0;
// the pixel's footprint on the ground (mm): ripples finer than a few pixels become roughness rather than stripes
float gFootMm = 1.0;
float gSat = 0.0;
float gQuartz = 0.0;
vec2 gNrmAdd = vec2(0.0);
vec4 gDis = vec4(0.0);
float gRipple = 0.0;
// where a silt flat's own look (uMudLook) takes over the wetness's sheen and mirror
float gMudArea = 0.0;
${RIPPLE_GLSL}
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
float ripplePhase(vec2 p) { return rippleWarp(p) * RIPPLE_K + gDis.x; }
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
  diffuseColor.rgb *= mix(vec3(1.0), uMudTint, smoothstep(1.5, 2.5, vSubstrate) * (1.0 - smoothstep(2.5, 3.5, vSubstrate)) + smoothstep(3.5, 4.0, vSubstrate) * (1.0 - smoothstep(4.0, 4.5, vSubstrate)));
  vec2 rq = rippleFrame(vWorldPos.xz);
  gDis = rippleDisloc(rq);
  // ripple troughs hold a little more moisture and fines: faintly darker, following the same field as the normals
  // (-1 in a trough, +1 on a crest, scaled by how well formed the ripples are here)
  float ripple = rippleProfile(ripplePhase(rq), rippleSkew(rq)) * rippleAmp(rq) * rippleSize(rq) * (1.0 - 0.8 * gDis.w) * (0.3 + 0.7 * isSand) * (1.0 - vPit) * uRippleGain;
  gRipple = ripple;
  float detail = 1.0 + grain * (0.10 + 0.08 * isSand) + patchN * 0.18 + ripple * 0.1;
  diffuseColor.rgb *= detail;
  // a sheltered silt flat (MahazeViewer's mud): mottled at ~8 cm and ~2 cm, as fresh silt settles unevenly
  float mudL = uMudLook * (1.0 - isSand);
  if (mudL > 0.001) {
    float mott = vnoise(vWorldPos.xz * 12.0) * 0.55 + vnoise(vWorldPos.xz * 26.0 + 5.0) * 0.3 + vnoise(vWorldPos.xz * 61.0 - 2.0) * 0.15;
    float mott2 = vnoise(vWorldPos.xz * 55.0 + 3.0) * 0.6 + vnoise(vWorldPos.xz * 140.0 + 9.0) * 0.4;
    float near = 1.0 - smoothstep(0.4, 1.6, fw * 0.02);
    // (faint: the silt's own grain; its broader tone wanders over a metre or two and over tens of metres)
    float broad = (0.9 + 0.2 * vnoise(vWorldPos.xz * 0.6 + 13.0)) * (0.92 + 0.16 * vnoise(vWorldPos.xz * 0.08 - 5.0));
    diffuseColor.rgb *= mix(1.0, (0.96 + 0.08 * mott) * mix(1.0, 0.97 + 0.06 * mott2, near) * broad, mudL);
  }
  // the levee: a smooth face, zoned by the tide the way the photos show it — pale and dry above the spring high
  // water, an olive film of algae through the upper intertidal, dark and crusted with old oyster shell below mean
  // sea level; broad soft blotches keep it from reading as paint
  float rock = smoothstep(4.5, 5.0, vSubstrate);
  if (rock > 0.001) {
    float blot = vnoise(vWorldPos.xz * 0.35 + 7.0) * 0.6 + vnoise(vWorldPos.xz * 1.3 - 3.0) * 0.4;
    vec3 buff = vec3(0.43, 0.41, 0.37), grey = vec3(0.33, 0.325, 0.31), olive = vec3(0.24, 0.27, 0.15), crust = vec3(0.19, 0.18, 0.165);
    vec3 stone = mix(grey, buff, smoothstep(1.1, 1.7, vWorldPos.y));
    float alg = smoothstep(0.15, 0.45, vWorldPos.y) * (1.0 - smoothstep(0.9, 1.3, vWorldPos.y)) * smoothstep(0.3, 0.7, vnoise(vWorldPos.xz * 0.6));
    stone = mix(stone, olive, alg * 0.75);
    stone = mix(stone, crust, 1.0 - smoothstep(0.0, 0.4, vWorldPos.y));
    stone *= 0.88 + 0.24 * blot;
    diffuseColor.rgb = mix(diffuseColor.rgb, stone, rock);
  }
  // ---- up close: the grains themselves (after MahazeViewer's sediment). Medium quartz grains and coarser shell
  // bits sit on a silty base; each is a disc with a dark rim and a dome in the normal. Faded by pixel footprint.
  float det1 = (1.0 - smoothstep(0.1, 0.35, fw * 0.5 / 1.4)) * uDetail;
  float det2 = (1.0 - smoothstep(0.08, 0.3, fw * 0.5 / 3.4)) * uDetail;
  if (det2 > 0.001) {
    vec2 o1, o2;
    vec3 g1 = grains(mm / 1.4, o1);
    vec3 g2 = grains(mm / 3.4 + 17.0, o2);
    // (silt carries few sand grains: the mud look keeps a scatter of them, as the goby flat does)
    float grainy = (0.3 + 0.5 * isSand) * (1.0 - 0.5 * vPit) * (1.0 - 0.8 * uMudLook * (1.0 - isSand));
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
    // (on the silt flat they lie in clusters, where a crab or a goby has fed, and are barely darker than the silt)
    pel *= mix(1.0, smoothstep(0.45, 0.75, vnoise(vWorldPos.xz * 3.0 + 31.0)), mudL);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * mix(0.6, 0.78, mudL), pel * 0.8);
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
    // (silt ejecta is the silt itself, a shade wetter: no pale volcano)
    vec3 collarC = mix(mix(vec3(0.92, 0.9, 0.88), vec3(1.12, 1.08, 1.02), mound), vec3(0.94 + 0.04 * mound), mudL);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * collarC, collar * 0.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.048, 0.045), hole * 0.9);
    // the mound's slope: up toward the hole, then the funnel down into it
    vec2 away = -ob / max(gb.x, 1e-3);
    gNrmAdd += (away * (0.6 + 0.6 * mound) * collar - away * 1.2 * hole) * mix(1.0, 0.4, mudL);
  }
  // ---- micro relief: silt lumps at the millimetre and centimetre scale, faded with distance
  if (uDetail > 0.5) {
    vec3 nd = vnoiseD(mm * 0.35) * 0.5 + vnoiseD(mm * 1.1 + 7.0) * 0.25;
    float bump = (1.0 - smoothstep(0.1, 0.5, fw * 0.35)) * (0.09 + 0.08 * (1.0 - isSand));
    vec3 nd2 = vnoiseD(mm * 0.055 + 3.0);
    float bump2 = (1.0 - smoothstep(0.15, 0.8, fw * 0.055)) * (0.025 + 0.045 * (1.0 - isSand)) * (1.0 + 0.3 * mudL);
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
  // (on a lake's silt flat the film is olive, not golden, and there is little black mud at the surface)
  diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.78, 0.68, 0.42), vec3(0.86, 0.86, 0.7), mudL), filmP * 0.6);
  float reducedP = smoothstep(1.5, 2.5, vSubstrate) * smoothstep(0.55, 0.85, vnoise(vWorldPos.xz * 0.07 + 23.0)) * (1.0 - 0.8 * mudL);
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
  // how wet the sediment is. The CPU follows the tide back (WetDry): for this height, the drying since the water
  // left it (the sun dries faster than the night), as the film left on the surface and the pore water's darkness, on
  // sand and on mud. Sand drains in hours; mud holds its water through the low tide. Ripple troughs and shallow
  // hollows keep their film longest; just above the water the capillary fringe stays saturated, and a seepage film
  // shines along the water's edge.
  float wetHere = vWorldPos.y - lvl;
  vec4 wd = texture2D(uWetDry, vec2(clamp((vWorldPos.y - uWetDryRange.x) / (uWetDryRange.y - uWetDryRange.x), 0.0, 1.0), 0.5));
  float mudD = clamp(smoothstep(0.5, 2.0, vSubstrate) * (1.0 - smoothstep(2.5, 3.0, vSubstrate)) + smoothstep(3.5, 4.0, vSubstrate) * (1.0 - smoothstep(4.5, 5.0, vSubstrate)), 0.0, 1.0);
  // (the ripples are 8 cm: once a pixel covers more than a fifth of one, their troughs blend into their mean)
  float trough = mix(clamp(max(-gRipple, 0.0) * 1.6, 0.0, 1.0), 0.2, smoothstep(10.0, 30.0, fw));
  gFootMm = fw;
  float hollow = smoothstep(0.45, 0.8, vnoise(vWorldPos.xz * 0.6 + 13.0)) * 0.7 + smoothstep(0.5, 0.85, vnoise(vWorldPos.xz * 2.3 - 5.0)) * 0.5;
  float retain = 1.0 + 2.5 * trough * trough + 2.0 * hollow;
  float film = pow(max(mix(wd.r, wd.g, mudD), 1e-4), 1.0 / retain);
  float moist = pow(max(mix(wd.b, wd.a, mudD), 1e-4), 1.0 / (0.8 + 0.4 * retain));
  film = max(film, 1.0 - smoothstep(0.0, mix(0.025, 0.07, mudD), wetHere));
  // a low flat holds its water table at the surface: water stands in the troughs and hollows the whole low tide, up
  // to half the table's height over the water and thinning out above that; the sediment there stays saturated
  float table = (1.0 - smoothstep(0.5 * uFilmTable, max(uFilmTable, 1e-3), wetHere)) * step(1e-4, uFilmTable);
  film = max(film, clamp(1.6 * trough + hollow, 0.0, 1.0) * table);
  moist = max(moist, max(table, 1.0 - smoothstep(0.0, mix(0.08, 0.5, mudD), wetHere)));
  // (a silt flat's own look, below, lays its sheets of water and its sheen there instead)
  film *= 1.0 - uMudLook * smoothstep(1.5, 2.5, vSubstrate) * (1.0 - smoothstep(3.5, 4.5, vSubstrate));
  float wet = wetHere <= 0.0 ? 1.0 : max(moist, film);
  // an open shore's swash, as the sand remembers it (SurfMemory): saturated wherever the sheets have been lately
  // (drying over a minute or so), a glassy film just after one drains, foam and swash marks left on it. Away from the
  // viewer, where the memory fades out, the sand is as it usually is (the band the swash usually keeps wet, its lower
  // part glassy half the time): the same state the memory gives new ground, so the window never shows.
  float sandFoam = 0.0, mark = 0.0;
  if (uSurf.w > 0.0) {
    float e = vWorldPos.y - uWaterLevel;
    if (e > -0.4 && e < 0.8) {
      vec2 q = vWorldPos.xz;
      vec4 mem = vec4(surfMemUsual(q, e, surfSlopeAt(q)), 0.0, 0.0);
      if (uMemBox.w > 0.0) {
        vec2 muv = (q - uMemBox.xy) / uMemBox.z + 0.5;
        float inW = surfMemWeight(muv);
        if (inW > 0.0) mem = mix(mem, texture2D(tSurfMem, muv), inW);
      }
      // (the backwash lays bare sand below the still waterline too: it shines as much as the sand above it)
      gSwash = mem.r;
      gSat = mem.g;
      sandFoam = mem.b;
      mark = mem.a;
      wet = max(wet, gSat * 0.95);
      wet = max(wet, 1.0 - smoothstep(-0.02, 0.0, e));
    }
  }
  // a glassy film: darker still, a little cooler
  diffuseColor.rgb *= mix(1.0, 0.82, gSwash);
  diffuseColor.rgb *= mix(1.0, uWetDark, wet);
  // a standing film takes a little more of the light into the water
  diffuseColor.rgb *= mix(1.0, 0.92, film * step(0.0, wetHere));
  gWet = wet;
  // (the swash's own film gives back the sky as the sea does, below)
  gWetFilm = wetHere > 0.0 ? film : 0.0;
  // a mud flat at low water (user's photos): the silt stays saturated through the day and glistens, and thin
  // sheets of water lie in the hollows and along the water's edge, flat and glassy, mirroring the sky
  if (uMudLook > 0.001) {
    float mudW = uMudLook * smoothstep(1.5, 2.5, vSubstrate) * (1.0 - smoothstep(3.5, 4.5, vSubstrate));
    gMudArea = mudW;
    float aboveW = vWorldPos.y - lvl;
    // the sheets: water left in the flat's shallow hollows, in lobes and channels that join and part (a warped
    // field over tens of metres, with smaller bays at a metre), more of it on low ground near the water's edge
    // and only in the deeper hollows higher up; the edge is sharp, as a film's meniscus is, but anti-aliased
    vec2 q = vWorldPos.xz;
    vec2 wq = q * 0.06 + (vec2(vnoise(q * 0.045 + 3.1), vnoise(q * 0.045 - 7.7)) - 0.5) * 2.4;
    float sheetN = vnoise(wq) * 0.5 + vnoise(wq * 2.3 + 5.0) * 0.25 + vnoise(q * 0.9 + 1.0) * 0.15 + vnoise(q * 3.1 - 4.0) * 0.1;
    // (the waterline wanders with the silt's own small relief: never a ruled contour of the gentle lean)
    float aboveN = aboveW + 0.05 * (vnoise(q * 0.4 + 9.0) - 0.5) + 0.03 * (vnoise(q * 1.7 - 2.0) - 0.5);
    float nearW = 1.0 - smoothstep(0.0, 0.06, aboveN);
    gSheetField = sheetN + nearW * 0.15 - (0.55 + 0.04 * smoothstep(0.3, 1.0, aboveW));
    float sw = max(fwidth(gSheetField), 0.002) * 0.75;
    float above = smoothstep(-0.03, 0.0, aboveW);
    gSheet = mudW * smoothstep(-sw, sw, gSheetField) * (1.0 - smoothstep(0.9, 1.2, aboveW)) * above;
    // around each sheet the silt is saturated: a dark glossy margin a few centimetres to a decimetre wide
    gHalo = mudW * (1.0 - smoothstep(0.0, 0.05, -gSheetField)) * (1.0 - smoothstep(-sw, sw, gSheetField)) * above;
    // and so is the strip the water has just left
    gHalo = max(gHalo, mudW * (1.0 - smoothstep(0.0, 0.08, aboveN)) * above * (1.0 - gSheet));
    // the rest of the flat is wet through, a little less so on the crests between the sheets
    gMudWet = mudW * max(wet, 0.7) * mix(0.75, 1.0, smoothstep(-0.25, 0.0, gSheetField)) * above;
    // under the water it is the water that shines: the bed itself is dull
    gSubm = mudW * (1.0 - above);
    diffuseColor.rgb *= mix(1.0, 0.97, gMudWet) * mix(1.0, 0.78, gSheet) * mix(1.0, 0.8, gHalo);
  }
  // (the photos' wet flat is a neutral grey with the sky in it, whatever the colour of the dry sand)
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.84, 0.92, 1.06), 0.55 * wet);
  // foam left on the sand: clusters of fine bubbles (a few millimetres) that pop one by one, and the swash marks, thin
  // lines of bubbles and dark grit where the fronts stopped
  if (sandFoam + mark > 0.003) {
    vec2 ob;
    vec3 gb = grains(mm / 2.6 + 91.0, ob);
    float clus = smoothstep(0.25, 0.75, vnoise(vWorldPos.xz * 9.0 + 3.0) * 0.6 + vnoise(vWorldPos.xz * 31.0) * 0.4);
    float amt = clamp(sandFoam * (0.5 + 0.9 * clus) + mark * 0.6 * (0.6 + 0.4 * clus), 0.0, 1.0);
    float has = step(1.0 - amt * 0.95, gb.z);
    float rB = 0.28 + 0.16 * gb.y;
    float detB = 1.0 - smoothstep(0.2, 0.9, fw * 0.5 / 2.6);
    float disc = smoothstep(rB, rB - 0.08, gb.x) * has * detB;
    float rimB = (smoothstep(rB + 0.1, rB, gb.x) - smoothstep(rB, rB - 0.06, gb.x)) * has * detB;
    vec3 foamC = vec3(0.86, 0.88, 0.9);
    // (beyond the bubbles' size, the white they add up to)
    diffuseColor.rgb = mix(diffuseColor.rgb, foamC, mix(amt * 0.45, disc * 0.85, detB));
    diffuseColor.rgb *= 1.0 - 0.25 * rimB;
    gNrmAdd += (-ob / rB) * 0.8 * disc;
    diffuseColor.rgb *= 1.0 - 0.12 * mark * (1.0 - clus);
  }
  // above the bank: the park's land, dry grass and earth over the packed bank
  float land = smoothstep(uLand.x, uLand.y, vWorldPos.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.31, 0.32, 0.2) * (0.8 + 0.4 * vnoise(vWorldPos.xz * 0.9 + 3.0)), land);
  gWet *= 1.0 - land;
  gWetFilm *= 1.0 - land;
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
  vec2 rp = rippleFrame(vWorldPos.xz);
  float strength = (0.12 + 0.88 * sandy) * rippleAmp(rp) * 0.42 * (1.0 - vPit) * (1.0 - 0.85 * gDis.w) * uRippleGain;
  float ph = ripplePhase(rp);
  // the crest line's local direction comes from the phase gradient (warp plus dislocations), so the shading
  // follows the bends and the forks; where crests crowd the slope grows, where they spread it eases
  float e = 0.02;
  vec2 gph = vec2(rippleWarp(rp + vec2(e, 0.0)) - rippleWarp(rp - vec2(e, 0.0)), rippleWarp(rp + vec2(0.0, e)) - rippleWarp(rp - vec2(0.0, e))) / (2.0 * e) * RIPPLE_K + gDis.yz;
  float kRel = clamp(length(gph) / RIPPLE_K, 0.4, 1.6);
  vec2 grad = rippleToWorld(normalize(gph + vec2(0.0, 1e-4)));
  // the slope of rippleProfile (the lee side steeper by this stretch's skew), scaled like its height
  float skew = rippleSkew(rp);
  float slope = (cos(ph) + 2.0 * skew * cos(ph * 2.0 + 0.6)) / (1.0 + skew) * strength * kRel * rippleSize(rp);
  // a standing film fills in between the grains and over the lumps: the ripples still show through it
  vec2 nrmAdd = gNrmAdd * (1.0 - 0.8 * gWetFilm);
  vec3 worldPerturb = vec3(grad.x * slope + nrmAdd.x, 0.0, grad.y * slope + nrmAdd.y);
  // (a sheet of water lies flat over the silt's lumps; saturated silt is smoothed by its own film of water)
  worldPerturb *= (1.0 - 0.97 * gSheet) * (1.0 - 0.4 * gMudWet) * (1.0 - 0.5 * gHalo);
  vec3 viewPerturb = (viewMatrix * vec4(worldPerturb, 0.0)).xyz;
  normal = normalize(normal + viewPerturb);
}`)
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined( RE_IndirectSpecular )
  // the sky in the wet silt and the water sheets: the scene's environment is kept dim for the diffuse fill, so
  // the mirror-like wet mud takes its sky reflection at near full strength (Fresnel still applies in the BRDF)
  if (gSheet + gMudWet + gHalo > 0.0) {
    // a sheet is a mirror of the land, the town and the sky, the water's own mirror looked up along the reflected
    // ray (the sky cube, brightened, when the mirror is off); the silt's sheen and the margins catch the sky
    vec3 sheetEnv = radiance * 10.0;
    if (uMirrorOn > 0.5 && gSheet > 0.001) {
      vec3 Rw = reflect(normalize(vWorldPos - cameraPosition), vec3(0.0, 1.0, 0.0));
      Rw.y = max(Rw.y, 0.02);
      vec4 mc = uMirrorMat * vec4(vWorldPos + Rw * 300.0, 1.0);
      sheetEnv = texture2D(tMirror, clamp(mc.xy / mc.w, vec2(0.002), vec2(0.998))).rgb;
    }
    radiance = mix(radiance * (1.0 + 2.0 * gMudWet + 4.0 * gHalo), sheetEnv, gSheet);
  }
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  // a film of water on the sand gives back the sky like the sea does (the scene's environment is kept dim for the
  // matte ground; the film's reflection is the water's, so it is raised to the sea's)
  if (gSwash > 0.01) radiance += getIBLRadiance( geometryViewDir, geometryNormal, 0.06 ) * gSwash * 7.0;
#endif`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{
  roughnessFactor = mix(roughnessFactor, 0.58, gWet);   // damp sand is darker and only faintly satin
  roughnessFactor = mix(roughnessFactor, 0.5, gSat * (1.0 - gWet));                // sand the swash has soaked: damp, satin
  roughnessFactor = mix(roughnessFactor, 0.06, gSwash);                                // the film a sheet just left: a mirror
  roughnessFactor = mix(roughnessFactor, 0.62, gFilm * 0.5);   // the organic film has a wet sheen of its own
  roughnessFactor = mix(roughnessFactor, 0.42, gQuartz);       // quartz and shell grains glint a little
  // a film of water: a mirror of the sky, the sun's glint in it. Further off, the ripples under the film are finer than
  // a pixel and spread its mirror out (their slopes become roughness; otherwise the sky aliases into stripes)
  roughnessFactor = mix(roughnessFactor, mix(0.07, uFilmFarRough, smoothstep(6.0, 40.0, gFootMm)), gWetFilm);
  // wet silt is glossy (the shine of a mud flat at low water), damp silt satin
  float mudR = uMudLook * smoothstep(1.5, 2.5, vSubstrate) * (1.0 - smoothstep(3.5, 4.5, vSubstrate));
  roughnessFactor = mix(roughnessFactor, mix(0.7, 0.36, gWet), mudR);
  roughnessFactor = mix(roughnessFactor, 0.45, gMudWet);  // saturated silt: a satin sheen
  roughnessFactor = mix(roughnessFactor, 0.15, gHalo);    // the margins of the sheets: glossy
  roughnessFactor = mix(roughnessFactor, 0.04, gSheet);   // a film of water: a mirror
  roughnessFactor = mix(roughnessFactor, 0.85, gSubm);    // under the water: dull (the water pass draws the surface)
}`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    // beyond the near shadow map, the sun's light is shaded by the far one (the sun is the only directional light);
    // everywhere, by the relief's own shadow (the ground casts into neither map)
    float farS = farSunShadow(vWorldPos);
    if (uTerrainSunOn > 0.5) farS *= texture2D(uTerrainSun, (vWorldPos.xz + uHalf) / (2.0 * uHalf)).r;
    reflectedLight.directDiffuse *= farS;
    reflectedLight.directSpecular *= farS;
  }`)
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  // the sky's light comes in at a small share (scene.environmentIntensity, for the diffuse fill); what wet ground
  // mirrors of the sky is the sky itself, at full strength (a silt flat's own look raises its sheen and sheets itself)
  radiance *= mix(1.0, 1.0 / max(envMapIntensity, 1e-3), max(gWetFilm, 0.5 * gWet) * (1.0 - gMudArea));
#endif`);
      // (the vnoise above is declared with the common chunk; main() starts with the clipping planes)
      if (!shader.fragmentShader.includes('#include <clipping_planes_fragment>')) throw new Error('Terrain: clipping_planes_fragment not found');
      // (on a silt flat the substrate's colour follows the frayed substrate too, not the vertices' palette colours)
      if (!shader.fragmentShader.includes('#include <color_fragment>')) throw new Error('Terrain: color_fragment not found');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSubCol[8];')
        .replace('#include <color_fragment>', `#include <color_fragment>
#if defined( USE_COLOR )
if (uMudLook > 0.001) {
  float si = clamp(vSubstrate, 0.0, 7.0), i0 = floor(si);
  vec3 subC = mix(uSubCol[int(i0)], uSubCol[int(min(i0 + 1.0, 7.0))], smoothstep(0.3, 0.7, si - i0));
  diffuseColor.rgb *= subC / max(vColor.rgb, vec3(1e-3));
}
#endif`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `vSubstrate = vSubstrateV;
if (uMudLook > 0.001) vSubstrate += uMudLook * ((vnoise(vWorldPos.xz * 0.7 + 21.0) - 0.5) * 0.9 + (vnoise(vWorldPos.xz * 3.0 - 5.0) - 0.5) * 0.3);
#include <clipping_planes_fragment>`);
    };
    mat.customProgramCacheKey = () => 'higata-terrain-v12';
    return mat;
  }

  /**
   * The flat as the sea's mirror sees it: one coarse mesh (1 m), plainly lit in the substrate colours and the sand's
   * tint, on the mirror's layer only. Without it the reflection of the beach would be a hole showing the haze
   * behind, which at grazing angles along the shore reads as a bright band.
   */
  mirrorProxy(layer: number): Mesh {
    if (this.proxy) return this.proxy;
    const geo = this.buildChunkGeometry(0, 0, this.n - 1, this.n - 1, 4, this.nrm!);
    const t = this.uSandTint.value;
    const mesh = new Mesh(geo, new MeshLambertMaterial({ vertexColors: true, color: new Color(t.x, t.y, t.z) }));
    mesh.layers.set(layer);
    mesh.name = 'terrain-mirror';
    this.proxy = mesh;
    return mesh;
  }

  private proxy: Mesh | null = null;

  /** Free the chunks, the pit patches, the materials and the data textures (leaving the map). */
  dispose(): void {
    if (this.proxy) { this.proxy.geometry.dispose(); (this.proxy.material as MeshLambertMaterial).dispose(); this.proxy.removeFromParent(); this.proxy = null; }
    for (const c of this.chunks) for (const g of c.lods) g?.dispose();
    for (const p of this.patches) p.mesh.geometry.dispose();
    this.material.dispose();
    this.patchMaterial.dispose();
    if (this.sheet) this.sheet.geometry.dispose();
    this.sheetMaterial?.dispose();
    this.gridTexture.dispose();
    this.nrmTexture.dispose();
    this.heightTexture.dispose();
    this.spillTexture.dispose();
    this.wetDry.dispose();
    this.mesh.removeFromParent();
  }

  /** Give the terrain the habitat's spill levels (tide pools). */
  setSpill(spill: Float32Array): void {
    this.spillTexture.dispose();
    this.spillTexture = makeSpillTexture(spill, this.n);
    this.uSpill.value = this.spillTexture;
  }

  /**
   * The far shadow's uniforms (FarShadow), the near map's matrix (the sun light's shadow.matrix, which three keeps
   * up to date in place) and the relief's own shadow (TerrainShadow): call before the first frame.
   */
  setShadows(far: Terrain['farShadow'], nearMatrix: Matrix4, terrainSun: Terrain['terrainSun']): void {
    this.farShadow = far;
    this.terrainSun = terrainSun;
    this.uNearShadowMatrix.value = nearMatrix;
  }

  setWater(level: number, time: number, sunUp = 1, sunDir?: Vector3): void {
    this.uWater.value = level;
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

  /** Turn the ripple marks by `angle` (radians) from 葛西's, whose crests run along x (parallel to its shore). */
  setRippleAngle(angle: number): void {
    this.uRipRot.value.set(Math.cos(angle), Math.sin(angle));
  }

  /** The ripple marks' strength (0: a lake's mud flat has none) and the silt-flat look of the mud (0..1). */
  setSediment(rippleGain: number, mudLook: number): void {
    this.uRippleGain.value = rippleGain;
    this.uMudLook.value = mudLook;
    this.setRippleSheet(this.sheetWanted);
  }


  /** Share the water's mirror (its uniforms, before the terrain's programs are built): the sheets on the mud show it. */
  shareMirror(u: { tMirror: IUniform<unknown>; uMirrorMat: IUniform<Matrix4>; uMirrorOn: IUniform<number> }): void {
    this.mirrorU = { tMirror: u.tMirror, uMirrorMat: u.uMirrorMat, uMirrorOn: u.uMirrorOn };
  }

  /** Tint the mud and creek beds (multiplies the 葛西 grey). */
  setMudTint(r: number, g: number, b: number): void {
    this.uMudTint.value.set(r, g, b);
  }
  /** Tint the sand and muddy sand (multiplies the 葛西 grey). */
  setSandTint(r: number, g: number, b: number): void {
    this.uSandTint.value.set(r, g, b);
  }

  /**
   * The ripple sheet (quality preset): a fine grid of `radius` m round the player raised into the ripples' relief, so
   * their troughs are real hollows — the water stands in them and they hide behind the crests. 0 takes it away (the
   * ripples are then only painted on the coarse mesh).
   */
  setRippleSheet(radius: number): void {
    // (a flat without ripple marks, a lake's mud, has nothing for it to raise: only the coarse mesh's facets)
    this.sheetWanted = radius;
    if (this.uRippleGain.value <= 0) radius = 0;
    if (radius === this.uSheetR.value && (radius > 0) === !!this.sheet) return;
    if (this.sheet) { this.sheet.geometry.dispose(); this.sheet.removeFromParent(); this.sheet = null; }
    this.uSheetR.value = radius;
    this.uSheetDrop.value = radius > 0 ? SHEET_DROP : 0;
    if (radius <= 0) return;
    // a square a little wider than the circle, so every bit of the stepped-down mesh lies under it
    const M = Math.ceil((radius + 0.6) / SHEET_STEP), side = 2 * M + 1;
    const pos = new Float32Array(side * side * 3);
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) { const v = (j * side + i) * 3; pos[v] = (i - M) * SHEET_STEP; pos[v + 2] = (j - M) * SHEET_STEP; }
    const idx = new Uint32Array((side - 1) * (side - 1) * 6);
    let q = 0;
    for (let j = 0; j < side - 1; j++) for (let i = 0; i < side - 1; i++) {
      const a = j * side + i, b = a + side;
      idx[q++] = a; idx[q++] = b; idx[q++] = a + 1; idx[q++] = a + 1; idx[q++] = b; idx[q++] = b + 1;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setIndex(new BufferAttribute(idx, 1));
    this.sheetMaterial ??= this.buildMaterial('sheet');
    const mesh = new Mesh(geo, this.sheetMaterial);
    mesh.frustumCulled = false;   // (its vertices are placed in the shader)
    mesh.receiveShadow = true;
    mesh.name = 'ripple-sheet';
    this.mesh.add(mesh);
    this.sheet = mesh;
  }

  /** Close-up surface detail on or off (quality preset). */
  setDetail(on: boolean): void {
    this.uDetail.value = on ? 1 : 0;
  }

  /** The lighter caustics (超軽量): every other wave component in the focusing sum (the programs are rebuilt once). */
  setLite(on: boolean): void {
    for (const m of [this.material, this.patchMaterial, ...(this.sheetMaterial ? [this.sheetMaterial] : [])]) {
      const d = m.defines as Record<string, number | string>;
      if (('WAVE_STRIDE' in d) === on) continue;
      if (on) { d.WAVE_STRIDE = 2; d.WAVE_AMP = '1.4'; } else { delete d.WAVE_STRIDE; delete d.WAVE_AMP; }
      m.needsUpdate = true;
    }
  }

  /** Share the surf's uniforms with the water (call before the first frame). */
  setSurf(surf: SurfUniforms): void {
    this.surf = surf;
  }

  /** What the sand remembers of the swash (null: no memory, the sand stays as it usually is). */
  setSurfMemory(mem: SurfMemoryUniforms | null): void {
    if (mem) { this.uSurfMem.value = mem.tSurfMem.value; this.uMemBox.value.copy(mem.uMemBox.value); }
    else this.uMemBox.value.w = 0;
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

  /**
   * The sediment's colour as the shader draws it here (linear albedo, before the light): the substrates' colours and
   * the map's tints blended as the vertices blend them, the broad patches, and the darkening and blue cast of the wet
   * flat under the water. The fine grain, the ripple shading and the scattered marks (film, pellets, holes) average
   * out and are left aside. For what lies on the bottom and should take its colour (sand thrown over a flatfish).
   */
  colorAt(x: number, z: number, out = new Color()): Color {
    const { i, j, fx, fz } = this.gridIndex(x, z);
    const n = this.n, S = this.substrate;
    let r = 0, g = 0, b = 0, s = 0;
    const corner = (k: number, w: number) => {
      const c = SUBSTRATE_COLORS[this.palette[S[k]] ?? 'mud'];
      r += c[0] * w; g += c[1] * w; b += c[2] * w; s += S[k] * w;
    };
    corner(j * n + i, (1 - fx) * (1 - fz)); corner(j * n + i + 1, fx * (1 - fz));
    corner((j + 1) * n + i, (1 - fx) * fz); corner((j + 1) * n + i + 1, fx * fz);
    const ss = (e0: number, e1: number, v: number) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const sandW = 1 - ss(1.5, 2.5, s);
    const mudW = ss(1.5, 2.5, s) * (1 - ss(2.5, 3.5, s)) + ss(3.5, 4.0, s) * (1 - ss(4.0, 4.5, s));
    const st = this.uSandTint.value, mt = this.uMudTint.value;
    r *= (1 + (st.x - 1) * sandW) * (1 + (mt.x - 1) * mudW);
    g *= (1 + (st.y - 1) * sandW) * (1 + (mt.y - 1) * mudW);
    b *= (1 + (st.z - 1) * sandW) * (1 + (mt.z - 1) * mudW);
    // the patches (vnoise(p · 0.35), as in the shader)
    const d = 1 + (terrainVnoise(x * 0.35, z * 0.35) - 0.5) * 0.18;
    // wet below the water: darker, and the neutral grey takes the sky's blue
    const y = this.heightAt(x, z), lvl = this.uWater.value;
    const wet = 1 - ss(lvl - 0.05, lvl + 0.12, y);
    const k = d * (1 - 0.24 * wet);
    return out.setRGB(r * k * (1 - 0.15 * wet), g * k * (1 - 0.075 * wet), b * k * (1 + 0.06 * wet));
  }

  inside(x: number, z: number, margin = 0): boolean {
    return x > -this.half + margin && x < this.half - margin && z > -this.half + margin && z < this.half - margin;
  }
}
