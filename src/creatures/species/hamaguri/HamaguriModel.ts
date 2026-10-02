import {
  BufferGeometry, CatmullRomCurve3, Color, DataTexture, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, LatheGeometry,
  LinearMipmapLinearFilter, Matrix4, Mesh, MeshPhysicalMaterial, RepeatWrapping, RGBAFormat, SphereGeometry, ConeGeometry,
  SRGBColorSpace, Vector2, Vector3, type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../../core/Rng';

/**
 * ハマグリ Meretrix lusoria, built at shell length L = 1 (individuals scale the root).
 *
 * Shell frame: +X posterior, +Y dorsal (umbo), +Z left valve. Morphology [photo ref 001-064, Habe 1977, Okutani 2017]:
 *  - L : H : W ≈ 1 : 0.80 : 0.46, rounded-subtriangular, prosogyrate umbo at ~40 % of L from the anterior end,
 *    straight-ish dorsal slopes, evenly convex ventral margin, posterior end slightly more produced than the anterior.
 *  - smooth glossy periostracum ("lacquered") with fine commarginal growth lines and irregular growth checks;
 *    ground colour cream to grey-brown with chestnut concentric bands, 1–3 radial rays and fine zigzag tent marks,
 *    individually very variable; umbo often worn pale/violet; dark external ligament behind the umbo.
 *  - interior white porcelain, violet stain at the posterior margin, faint pallial line.
 *  - siphons short and fused at the base, brown-ringed papillate tips (inhalant ventral and larger); foot large, axe-shaped, pale peach.
 * Growth lines and micro-relief live in textures (bump + roughness), never in polygons.
 */

export const H_RATIO = 0.8;
const HALF_W = 0.23;
/** hinge line (valves rotate about X through this point) */
export const HINGE = new Vector3(-0.04, 0.37, 0);
/** radial centre of the valve surface: the umbo, set just inside the dorsal margin so the beak rounds over the hinge */
const UMBO = new Vector2(-0.1, 0.3);
/** commissure outline, starting at the umbo and running posterior → ventral → anterior */
const OUTLINE = [
  [-0.1, 0.4], [0.03, 0.38], [0.2, 0.293], [0.34, 0.184], [0.45, 0.064], [0.5, -0.045], [0.48, -0.152], [0.4, -0.258],
  [0.27, -0.346], [0.1, -0.396], [-0.08, -0.4], [-0.25, -0.358], [-0.39, -0.266], [-0.48, -0.138], [-0.5, 0.0], [-0.45, 0.122],
  [-0.35, 0.222], [-0.23, 0.31],
];
export const POSTERIOR_TIP = new Vector3(0.5, -0.045, 0);
export const ANTERIOR_VENTRAL = new Vector3(-0.3, -0.31, 0);

// ---------------------------------------------------------------- noise
function hash1(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise1(x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}
function noise2(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hash1(a * 57.0 + b * 131.0);
  return (h(i, j) * (1 - ux) + h(i + 1, j) * ux) * (1 - uy) + (h(i, j + 1) * (1 - ux) + h(i + 1, j + 1) * ux) * uy;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- shell geometry
let margin: Vector2[] | null = null;
function marginPoints(n: number): Vector2[] {
  const c = new CatmullRomCurve3(OUTLINE.map(([x, y]) => new Vector3(x, y, 0)), true, 'centripetal');
  return c.getSpacedPoints(n).map((p) => new Vector2(p.x, p.y));
}
/** outer surface height (toward the valve's own side) at outline parameter t, radial v (0 umbo .. 1 margin) */
function inflation(v: number, rayLen: number): number {
  // smooth dome over the umbo, steepening only toward the margin
  const g = Math.pow(Math.max(0, 1 - Math.pow(v, 2.4)), 0.62);
  // short dorsal rays (hinge slopes) are flatter; equal at the umbo so the beak stays closed
  const k = 0.55 + 0.45 * smooth(0.08, 0.6, rayLen);
  return HALF_W * g * (1 + (k - 1) * v);
}
function shellPoint(m: Vector2, v: number, out: Vector3, lift = 0, inset = 1): Vector3 {
  const vv = v * inset;
  const beak = Math.pow(1 - v, 3);
  const rayLen = m.distanceTo(UMBO);
  out.set(UMBO.x + (m.x - UMBO.x) * vv - 0.03 * beak, UMBO.y + (m.y - UMBO.y) * vv + 0.012 * beak, inflation(v, rayLen) - lift);
  return out;
}

/** One valve: outer periostracum (group 0), inner porcelain (group 1), margin bevel (group 0). side = +1 left, -1 right. */
export function buildValveGeometry(side: 1 | -1, nt: number, nv: number): BufferGeometry {
  const ring = marginPoints(nt);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const p = new Vector3();
  const grid = (lift: (v: number) => number, inset: number, rows: number) => {
    const base = pos.length / 3;
    for (let r = 0; r < rows; r++) {
      const v = Math.pow(r / (rows - 1), 1.15);
      for (let c = 0; c <= nt; c++) {
        shellPoint(ring[c % nt], v, p, lift(v), inset);
        pos.push(p.x, p.y, p.z * side);
        uv.push(c / nt, v * inset);
      }
    }
    return base;
  };
  const quads = (base: number, rows: number, flip: boolean) => {
    const w = nt + 1;
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < nt; c++) {
      const a = base + r * w + c, b = a + w, cc = b + 1, d = a + 1;
      // outer surface of the left valve faces +Z with (a, cc, b)
      if (flip !== (side < 0)) idx.push(a, b, cc, a, cc, d); else idx.push(a, cc, b, a, d, cc);
    }
  };
  const outer = grid(() => 0, 1, nv);
  quads(outer, nv, false);
  const outerCount = idx.length;
  const thick = (v: number) => 0.016 + 0.03 * (1 - v);
  const inner = grid(thick, 0.972, nv);
  quads(inner, nv, true);
  const innerCount = idx.length - outerCount;
  // bevel: outer margin row → inner margin row
  const w = nt + 1, rimBase = pos.length / 3;
  for (let c = 0; c <= nt; c++) {
    const o = (outer + (nv - 1) * w + c) * 3, i = (inner + (nv - 1) * w + c) * 3;
    pos.push(pos[o], pos[o + 1], pos[o + 2]); uv.push(c / nt, 1);
    pos.push(pos[i], pos[i + 1], pos[i + 2]); uv.push(c / nt, 0.995);
  }
  for (let c = 0; c < nt; c++) {
    const a = rimBase + c * 2, b = a + 1, d = a + 2, cc = a + 3;
    if (side > 0) idx.push(a, cc, b, a, d, cc); else idx.push(a, b, cc, a, cc, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, outerCount, 0);
  g.addGroup(outerCount, innerCount, 1);
  g.addGroup(outerCount + innerCount, idx.length - outerCount - innerCount, 0);
  g.computeVertexNormals();
  // weld the seam column and the degenerate umbo row
  const n = g.getAttribute('normal');
  for (const base of [outer, inner]) {
    for (let r = 0; r < nv; r++) {
      const a = base + r * w, b = a + nt;
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
    for (let c = 0; c <= nt; c++) n.setXYZ(base + c, 0, 0, (base === outer ? 1 : -1) * side);
  }
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- textures
const TW = 1024, TH = 512;
function tex(data: Uint8Array, w: number, h: number, srgb: boolean): DataTexture {
  const t = new DataTexture(data, w, h, RGBAFormat);
  t.wrapS = RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** growth-line height function shared by the bump map and the colour (lines catch a little pigment) */
function growth(u: number, v: number): number {
  // commarginal lines get denser toward the margin (slower growth with age); checks are irregular annual stops
  const ph = v * 150 + Math.pow(v, 2.2) * 120 + noise2(u * 9, v * 4) * 1.5;
  const fine = 0.5 + 0.5 * Math.sin(ph * Math.PI * 2);
  const check = Math.pow(noise1(v * 26 + noise1(u * 6) * 0.35), 7) * 2.2;
  return fine * 0.32 + check;
}

/** R: height (bump), G: roughness. Shared by every valve. */
let reliefTex: DataTexture | null = null;
function relief(): DataTexture {
  if (reliefTex) return reliefTex;
  const d = new Uint8Array(TW * TH * 4);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const u = x / TW, v = y / TH, i = (y * TW + x) * 4;
    const radial = 0.5 + 0.5 * Math.sin(u * 900 + noise1(v * 20) * 3);
    const micro = noise2(u * 420, v * 260);
    const h = growth(u, v) * 0.75 + radial * 0.04 * smooth(0.3, 1, v) + micro * 0.12;
    const worn = 1 - smooth(0.04, 0.2, v);
    d[i] = Math.min(255, h * 180 + worn * noise2(u * 60, v * 60) * 60);
    // glossy periostracum; growth checks and the worn umbo are duller
    d[i + 1] = Math.min(255, (0.22 + 0.16 * Math.min(1, growth(u, v) - 0.3) + worn * 0.35 + micro * 0.06) * 255);
    d[i + 2] = 0; d[i + 3] = 255;
  }
  return (reliefTex = tex(d, TW, TH, false));
}

const PALETTE = [
  [0.8, 0.69, 0.52], [0.66, 0.52, 0.36], [0.5, 0.43, 0.37], [0.56, 0.38, 0.24], [0.74, 0.66, 0.58], [0.42, 0.37, 0.34], [0.62, 0.5, 0.4],
];
export const PATTERN_VARIANTS = 10;
const colorTex: (DataTexture | null)[] = [];
/** Per-variant periostracum pattern: concentric bands, radial rays, tent zigzags, worn umbo. */
function patternTexture(variant: number): DataTexture {
  const cached = colorTex[variant];
  if (cached) return cached;
  const rng = new Rng(9173 + variant * 7919);
  const W = 512, H = 256, d = new Uint8Array(W * H * 4);
  const ground = new Color().fromArray(PALETTE[variant % PALETTE.length]).offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.05, 0.05), rng.range(-0.04, 0.04));
  const dark = new Color().setRGB(rng.range(0.22, 0.33), rng.range(0.13, 0.18), rng.range(0.07, 0.11));
  const bands = rng.range(0.1, 0.95), bandFreq = rng.range(2.5, 6), bandSeed = rng.range(0, 100);
  const nRays = rng.int(0, 3), rays = Array.from({ length: nRays }, () => [rng.range(0.15, 0.85), rng.range(0.012, 0.05), rng.range(0.4, 0.9)]);
  const zig = rng.chance(0.55) ? rng.range(0.35, 0.85) : 0, zigFreq = rng.int(5, 11), zigAmp = rng.range(0.25, 0.5), zigSeed = rng.range(0, 50);
  const umboTint = rng.range(0.15, 0.5);
  const c = new Color();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = (y * W + x) * 4;
    let m = 0;
    // broad irregular concentric zones: two octaves so spacing and strength vary like real growth seasons
    const bn = noise1(v * bandFreq * 3 + bandSeed + noise2(u * 3, v * 2) * 0.8) * 0.65 + noise1(v * bandFreq * 9 + bandSeed * 2) * 0.35;
    m = Math.max(m, bands * smooth(0.45, 0.72, bn) * (0.55 + 0.45 * noise2(u * 4 + bandSeed, v * 3)));
    for (const [t0, wdt, k] of rays) {
      const du = Math.min(Math.abs(u - t0), 1 - Math.abs(u - t0));
      m = Math.max(m, k * smooth(wdt, wdt * 0.4, du) * smooth(0.05, 0.3, v));
    }
    if (zig) {
      // fine brown tent (zigzag) lines, wobbly and broken, only in patches
      const uu = u * zigFreq + noise2(u * 20, v * 15) * 0.25;
      const tri = Math.abs((uu % 1) - 0.5) * 2;
      const z = (((v * 22 + zigSeed) + tri * zigAmp * 4) % 1 + 1) % 1;
      const line = smooth(0.09, 0.02, Math.abs(z - 0.5)) * smooth(0.4, 0.7, noise2(u * 5 + zigSeed, v * 4));
      m = Math.max(m, zig * line * smooth(0.08, 0.3, v));
    }
    m = Math.min(1, m + (growth(u, v) - 0.3) * 0.12);
    c.copy(ground).lerp(dark, m);
    // darker periostracum on the posterodorsal slope beside the ligament, pale violet-grey worn umbo
    const dorsal = smooth(0.12, 0.0, u) * smooth(0.2, 0.8, v) * 0.35;
    c.lerp(dark, dorsal);
    const worn = 1 - smooth(0.02, 0.16, v);
    c.lerp(new Color(0.6, 0.55, 0.56), worn * umboTint);
    const grain = 0.94 + noise2(u * 300, v * 180) * 0.12;
    d[i] = Math.min(255, c.r * grain * 255); d[i + 1] = Math.min(255, c.g * grain * 255); d[i + 2] = Math.min(255, c.b * grain * 255); d[i + 3] = 255;
  }
  return (colorTex[variant] = tex(d, W, H, true));
}

let innerTex: DataTexture | null = null;
function interiorTexture(): DataTexture {
  if (innerTex) return innerTex;
  const W = 256, H = 128, d = new Uint8Array(W * H * 4);
  const white = new Color(0.93, 0.92, 0.9), violet = new Color(0.42, 0.3, 0.46), c = new Color();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = (y * W + x) * 4;
    // violet stain along the posterior margin (u ≈ 0.05-0.4), fading inward; faint pallial line at v ≈ 0.86
    const post = smooth(0.5, 0.15, Math.abs(u - 0.2)) * smooth(0.55, 0.97, v);
    const pallial = smooth(0.012, 0, Math.abs(v - 0.86)) * 0.06;
    c.copy(white).lerp(violet, post * 0.75).offsetHSL(0, 0, -pallial - noise2(u * 40, v * 20) * 0.03);
    d[i] = c.r * 255; d[i + 1] = c.g * 255; d[i + 2] = c.b * 255; d[i + 3] = 255;
  }
  return (innerTex = tex(d, W, H, true));
}

/** soft tissue: pale peach with brown pigment rings toward siphon tips (v = along the tube) */
let siphonTex: DataTexture | null = null;
function siphonTexture(): DataTexture {
  if (siphonTex) return siphonTex;
  const W = 64, H = 128, d = new Uint8Array(W * H * 4), c = new Color();
  const flesh = new Color(0.78, 0.64, 0.52), brown = new Color(0.3, 0.19, 0.12);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = y / H, i = (y * W + x) * 4;
    const rings = smooth(0.35, 0.8, v) * (0.5 + 0.5 * Math.sin(v * 60)) * 0.75 + smooth(0.82, 0.95, v) * 0.85;
    c.copy(flesh).lerp(brown, Math.min(1, rings * (0.7 + 0.3 * noise2(x / 6, y / 4))));
    d[i] = c.r * 255; d[i + 1] = c.g * 255; d[i + 2] = c.b * 255; d[i + 3] = 255;
  }
  return (siphonTex = tex(d, W, H, true));
}

// ---------------------------------------------------------------- materials (shared)
const shellMats: MeshPhysicalMaterial[] = [];
let mats: { inner: MeshPhysicalMaterial; flesh: MeshPhysicalMaterial; siphon: MeshPhysicalMaterial; ligament: MeshPhysicalMaterial } | null = null;
export function shellMaterial(variant: number): MeshPhysicalMaterial {
  return (shellMats[variant] ??= new MeshPhysicalMaterial({
    name: `hamaguri-shell-${variant}`,
    map: patternTexture(variant),
    bumpMap: relief(), bumpScale: 1.2,
    roughnessMap: relief(), roughness: 1,
    // a film of water over the lacquer-like periostracum
    clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.5, specularIntensity: 0.6,
  }));
}
export function sharedMaterials() {
  if (mats) return mats;
  const flesh = new MeshPhysicalMaterial({ name: 'hamaguri-flesh', color: 0xcfa486, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.15, sheenColor: new Color(0.95, 0.85, 0.8), side: DoubleSide });
  mats = {
    inner: new MeshPhysicalMaterial({ name: 'hamaguri-inner', map: interiorTexture(), roughness: 0.24, clearcoat: 0.7, clearcoatRoughness: 0.15, sheen: 0.25, sheenColor: new Color(0.85, 0.82, 0.95), iridescence: 0.12, iridescenceIOR: 1.5 }),
    flesh,
    siphon: new MeshPhysicalMaterial({ name: 'hamaguri-siphon', map: siphonTexture(), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.15, sheenColor: new Color(0.95, 0.85, 0.8), side: DoubleSide }),
    ligament: new MeshPhysicalMaterial({ name: 'hamaguri-ligament', color: 0x1d1612, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }),
  };
  return mats;
}

// ---------------------------------------------------------------- soft-part geometry (shared)
interface GeoSet { left: BufferGeometry; right: BufferGeometry }
const shellGeo: Record<'hi' | 'lo', GeoSet | null> = { hi: null, lo: null };
export function shellGeometries(lod: 'hi' | 'lo'): GeoSet {
  const [nt, nv] = lod === 'hi' ? [160, 56] : [40, 12];
  return (shellGeo[lod] ??= { left: buildValveGeometry(1, nt, nv), right: buildValveGeometry(-1, nt, nv) });
}

let soft: { body: BufferGeometry; foot: BufferGeometry; tube: [BufferGeometry, BufferGeometry]; papillae: [BufferGeometry, BufferGeometry]; ligament: BufferGeometry } | null = null;
function softGeometries() {
  if (soft) return soft;
  // foot: axe/tongue shape along +X from its base, laterally compressed, with a keel-like sole
  const foot = new SphereGeometry(1, 28, 18);
  const p = foot.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const s = (x + 1) / 2; // 0 base .. 1 tip
    const blade = 0.55 + 0.45 * Math.sin(Math.min(1, s * 1.2) * Math.PI * 0.9);
    y = y * 0.12 * blade - 0.05 * s * s;
    z = z * 0.06 * (1 - 0.4 * s);
    x = s * 0.42;
    p.setXYZ(i, x, y, z);
  }
  foot.computeVertexNormals();
  // visceral mass + mantle lobes, just filling the cavity
  const body = new SphereGeometry(1, 32, 20);
  body.scale(0.4, 0.29, 0.15);
  body.translate(0.0, -0.02, 0);
  // siphon tube: an open lathe that turns over at the lip into a dark lumen (v runs base → tip → inside)
  const tube = (r: number) => {
    const prof = [[1.15, 0], [1.05, 0.35], [0.95, 0.7], [0.94, 0.88], [1.0, 0.97], [0.9, 1.0], [0.68, 0.985], [0.55, 0.9], [0.45, 0.6]]
      .map(([a, b]) => new Vector2(a * r, b));
    const g = new LatheGeometry(prof, 28);
    const uv = g.getAttribute('uv');
    // remap v so the texture's tip rings land on the lip
    for (let i = 0; i < uv.count; i++) uv.setY(i, Math.min(1, uv.getY(i) * 1.6));
    return g;
  };
  const papillae = (r: number, n: number, len: number) => {
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, l = len * (0.7 + 0.6 * hash1(i * 3.1 + n));
      const c = new ConeGeometry(r * 0.2, l, 5, 1);
      c.translate(0, l / 2, 0);
      c.rotateX(0.55 + 0.3 * hash1(i)); // lean outward
      c.rotateY(-a + Math.PI / 2);
      c.translate(Math.cos(a) * r * 0.9, 0, Math.sin(a) * r * 0.9);
      parts.push(c.toNonIndexed());
    }
    const g = mergeGeometries(parts)!;
    g.computeVertexNormals();
    return g;
  };
  const lig = new SphereGeometry(1, 16, 8);
  lig.scale(0.12, 0.022, 0.03);
  soft = { body, foot, tube: [tube(0.036), tube(0.029)], papillae: [papillae(0.036, 20, 0.014), papillae(0.029, 12, 0.007)], ligament: lig };
  return soft;
}

// ---------------------------------------------------------------- model
export interface HamaguriParts {
  root: Group;
  /** posture frame (life orientation + rocking) */
  life: Group;
  left: Group; right: Group;
  leftMesh: Mesh; rightMesh: Mesh;
  softBody: Mesh; foot: Group; footMesh: Mesh;
  inhalant: Group; exhalant: Group; inhalantTip: Mesh; exhalantTip: Mesh;
  /** high / low detail switch */
  setDetail(level: 0 | 1 | 2): void;
}

/** Builds the named hierarchy HamaguriRoot ▸ LeftShell / RightShell / SoftBody / Foot / InhalantSiphon / ExhalantSiphon. */
export function createHamaguri(variant: number): HamaguriParts {
  const m = sharedMaterials(), g = softGeometries(), hi = shellGeometries('hi'), lo = shellGeometries('lo');
  const shell = shellMaterial(variant % PATTERN_VARIANTS);
  const valveMats: Material[] = [shell, m.inner];
  const root = new Group(); root.name = 'HamaguriRoot';
  const life = new Group(); life.name = 'HamaguriLife'; root.add(life);
  const valve = (name: string, geo: BufferGeometry) => {
    const pivot = new Group(); pivot.name = name; pivot.position.copy(HINGE);
    const mesh = new Mesh(geo, valveMats); mesh.name = `${name}Mesh`; mesh.position.copy(HINGE).negate();
    mesh.castShadow = mesh.receiveShadow = true;
    pivot.add(mesh); life.add(pivot);
    return { pivot, mesh };
  };
  const L = valve('LeftShell', hi.left), R = valve('RightShell', hi.right);
  const lig = new Mesh(g.ligament, m.ligament); lig.name = 'Ligament'; lig.position.set(0.07, 0.355, 0); lig.rotation.z = -0.32; life.add(lig);
  const softBody = new Mesh(g.body, m.flesh); softBody.name = 'SoftBody'; life.add(softBody);
  const foot = new Group(); foot.name = 'Foot'; foot.position.copy(ANTERIOR_VENTRAL).multiplyScalar(0.7);
  foot.rotation.z = Math.PI + 0.75; // points anteroventrally (down into the sand in life position)
  const footMesh = new Mesh(g.foot, m.flesh); footMesh.name = 'FootMesh'; foot.add(footMesh); life.add(foot);
  const siphon = (name: string, i: 0 | 1, y: number) => {
    const grp = new Group(); grp.name = name;
    grp.position.set(POSTERIOR_TIP.x - 0.05, y, 0);
    grp.rotation.z = -Math.PI / 2 + (i === 0 ? -0.08 : 0.1);
    const tube = new Mesh(g.tube[i], m.siphon); tube.name = `${name}Tube`; tube.scale.y = 0.2; grp.add(tube);
    const tip = new Mesh(g.papillae[i], m.siphon); tip.name = `${name}Tip`; tip.position.y = 0.2; grp.add(tip);
    life.add(grp);
    return { grp, tube, tip };
  };
  const inh = siphon('InhalantSiphon', 0, POSTERIOR_TIP.y - 0.045);
  const exh = siphon('ExhalantSiphon', 1, POSTERIOR_TIP.y + 0.045);
  // parts the driver reads: siphon tube scale.y = extension, tip follows
  inh.grp.userData.tube = inh.tube; exh.grp.userData.tube = exh.tube;
  let level = -1;
  return {
    root, life, left: L.pivot, right: R.pivot, leftMesh: L.mesh, rightMesh: R.mesh, softBody, foot, footMesh,
    inhalant: inh.grp, exhalant: exh.grp, inhalantTip: inh.tip, exhalantTip: exh.tip,
    setDetail(l) {
      if (l === level) return;
      level = l;
      L.mesh.geometry = l === 0 ? hi.left : lo.left;
      R.mesh.geometry = l === 0 ? hi.right : lo.right;
      softBody.visible = foot.visible = l === 0;
      inh.tip.visible = exh.tip.visible = l === 0;
      L.mesh.castShadow = R.mesh.castShadow = l < 2;
    },
  };
}

/** Siphon extension 0..1 (and tip aperture 0..1) applied to a siphon group. */
export function poseSiphon(grp: Group, tip: Mesh, ext: number, aperture: number): void {
  const len = 0.04 + 0.24 * ext;
  const tube = grp.userData.tube as Mesh;
  tube.scale.set(0.85 + 0.15 * aperture, len, 0.85 + 0.15 * aperture);
  tip.position.y = len * 0.98;
  const a = 0.45 + 0.65 * aperture;
  tip.scale.set(a, 0.3 + 0.7 * aperture, a);
}

/**
 * Many closed shells in one draw call (dead shells on the surface, far beds): low-detail valves of one pattern variant
 * merged into an InstancedMesh. `place(i, matrix)` fills each instance; the shell is in life orientation lying flat.
 */
export function createHamaguriInstances(count: number, variant: number, place: (i: number, m: Matrix4) => void): InstancedMesh {
  const lo = shellGeometries('lo');
  const geo = mergeGeometries([lo.left, lo.right], true)!;
  // merged groups: [left outer, left inner, left rim, right ...] → shell / inner
  const shell = shellMaterial(variant % PATTERN_VARIANTS), inner = sharedMaterials().inner;
  geo.groups.forEach((gr, i) => { gr.materialIndex = i % 3 === 1 ? 1 : 0; });
  const im = new InstancedMesh(geo, [shell, inner], count);
  im.name = 'HamaguriInstances';
  const mtx = new Matrix4();
  for (let i = 0; i < count; i++) { place(i, mtx); im.setMatrixAt(i, mtx); }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = im.receiveShadow = true;
  return im;
}
