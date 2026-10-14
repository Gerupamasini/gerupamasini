import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  PlaneGeometry, Quaternion, Vector3, type IUniform, type WebGLProgramParametersWithUniforms,
} from 'three';
import { lightByCaustics } from './causticMaterial';

export type SubstrateKind = 'sand' | 'mud' | 'none';

/** mean depth of the bed (m): the animals, the decorations and the caustics sit on it */
export const BED_H = 0.05;

// ------------------------------------------------------------------ deterministic noise (the bed is the same every load)
function hash2(x: number, y: number, seed: number): number {
  let t = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x: number, y: number, seed: number, oct = 4): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * (vnoise(x * f, y * f, seed + i * 17) - 0.5); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The bed's relief (m, about the mean) and how much fine silt has settled there (0..1). Sand: broad undulations, a
 * field of small asymmetric ripple marks in patches (gentle on the side the current comes from, steep in its lee),
 * a few hollows where a fish has dug, the bed a little higher at the back, as it is raked; mud: smoother, with
 * worm burrows and their casts.
 */
function relief(kind: SubstrateKind, x: number, z: number, w: number, d: number, pits: [number, number, number, number][]): [number, number] {
  if (kind === 'none') return [0, 0];
  const edge = Math.min(w / 2 - Math.abs(x), d / 2 - Math.abs(z));
  const calm = Math.min(1, Math.max(0, edge / 0.012));
  let h = -z / d * 0.007, silt = 0;
  if (kind === 'sand') {
    h += fbm(x / 0.09, z / 0.09, 3) * 0.006 * (0.4 + 0.6 * calm);
    const a = 0.42, u = x * Math.cos(a) + z * Math.sin(a), v = -x * Math.sin(a) + z * Math.cos(a);
    const warp = fbm(v / 0.05, u / 0.07, 11) * 0.012;
    const ph = ((u + warp) / 0.021) % 1, p = ph < 0 ? ph + 1 : ph;
    const prof = p < 0.72 ? p / 0.72 : (1 - p) / 0.28;
    const patch = Math.max(0, Math.min(1, (vnoise(x / 0.07, z / 0.07, 29) - 0.38) * 3));
    const rip = (prof * prof * (3 - 2 * prof) - 0.5) * 0.0016 * patch * calm;
    h += rip;
    silt += Math.max(0, -rip / 0.0008) * 0.5;
  } else {
    h += fbm(x / 0.12, z / 0.12, 5) * 0.004 * (0.4 + 0.6 * calm);
    h += fbm(x / 0.02, z / 0.02, 7) * 0.0006;
  }
  for (const [px, pz, r, depth] of pits) {
    const q = ((x - px) ** 2 + (z - pz) ** 2) / (r * r);
    if (q < 4) {
      const g = Math.exp(-q * 1.6);
      h -= depth * g * calm;
      // the spoil ring round a hole
      h += depth * 0.35 * Math.exp(-((Math.sqrt(q) - 1.25) ** 2) * 6) * calm;
      silt += g * 0.8;
    }
  }
  silt += Math.max(0, -h / 0.004) * 0.35;
  return [h, Math.min(1, silt)];
}

// ------------------------------------------------------------------ shading
const GRAIN_COMMON = /* glsl */ `
uniform vec3 uSandA, uSandB, uSandC, uSandD, uSandMean, uSiltCol;
uniform float uGrainScale, uMud, uBedTop, uGlintAmt;
vec2 sbHash22(vec2 p) { vec3 a = fract(p.xyx * vec3(123.34, 234.34, 345.65)); a += dot(a, a + 34.45); return fract(vec2(a.x * a.y, a.y * a.z)); }
float sbHash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float sbNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sbHash12(i), sbHash12(i + vec2(1.0, 0.0)), f.x), mix(sbHash12(i + vec2(0.0, 1.0)), sbHash12(i + vec2(1.0, 1.0)), f.x), f.y); }
// one grain's colour: mostly pale quartz and warm feldspar, some dark rock, a few white shell crumbs
vec3 sbGrainCol(float h) {
  return h < 0.46 ? uSandA : h < 0.8 ? uSandB : h < 0.93 ? uSandC : uSandD;
}
// the grains at p (in grain units): colour, how deep in a crevice between grains, the grain's id. Each grain is a
// little dome (lit on its upper side, shaded at its rim); the lattice is jittered and the grains vary in size
vec3 sbGrains(vec2 g, out float crev, out vec2 id) {
  vec2 ip = floor(g), fp = fract(g);
  float d1 = 8.0, d2 = 8.0;
  vec2 r1 = vec2(0.0);
  id = ip;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y)), h = sbHash22(ip + o), r = o + 0.1 + 0.8 * h - fp;
    // a grain's size scales its distance: big grains win more of the plane
    float dd = dot(r, r) / (0.55 + 0.9 * h.x * h.y);
    if (dd < d1) { d2 = d1; d1 = dd; id = ip + o; r1 = r; } else if (dd < d2) d2 = dd;
  }
  crev = 1.0 - smoothstep(0.0, 0.22, sqrt(d2) - sqrt(d1));
  float dome = clamp(1.0 - d1 * 1.6, 0.0, 1.0);
  float lit = 0.78 + 0.32 * dome + 0.12 * clamp(r1.y, -1.0, 1.0);
  return sbGrainCol(sbHash12(id)) * (0.85 + 0.3 * sbHash12(id + 17.0)) * lit;
}
// the top of the bed at p (tank-local xz, m) with silt settled there: grains up close (faded out as they shrink below
// a pixel), patches of slightly different sand and a fine mottle, silt; and the grain's glint
vec3 sbBedColor(vec2 p, float silt, out float glint, out vec3 glintW) {
  glint = 0.0;
  glintW = vec3(0.0, 1.0, 0.0);
  vec2 g = p * uGrainScale;
  float fw = length(fwidth(g));
  float near = (1.0 - smoothstep(0.3, 1.0, fw)) * (1.0 - uMud * 0.85);
  vec3 col = uSandMean;
  if (near > 0.0) {
    float crev; vec2 id;
    vec3 gc = sbGrains(g, crev, id);
    col = mix(uSandMean, gc * (1.0 - 0.5 * crev), near);
    glint = step(1.0 - uGlintAmt, sbHash12(id + 3.7)) * near * (1.0 - crev);
    glintW = normalize(vec3(sbHash12(id + 5.1) - 0.5, 1.2, sbHash12(id + 9.3) - 0.5));
  }
  float patchN = sbNoise(p * 24.0) * 0.55 + sbNoise(p * 90.0) * 0.45;
  col *= 0.86 + 0.28 * patchN;
  return mix(col, uSiltCol, clamp(silt, 0.0, 1.0) * 0.55);
}
`;

/** The bed's sand shading (uniforms and `sbBedColor`), for what is drawn as the bed: sand thrown over a buried animal. */
export const BED_SAND_GLSL = GRAIN_COMMON;

/** The top of the bed: grains up close (faded out as they shrink below a pixel), patches and silt from afar, glints. */
function topShader(U: Record<string, IUniform>) {
  return (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSilt;\nvarying float vSilt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSilt = aSilt;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vSilt;\n${GRAIN_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float sbGlint;
vec3 sbGlintW;
// (silt in the hollows and the troughs of the ripples)
diffuseColor.rgb = sbBedColor(vTankP.xz, vSilt, sbGlint, sbGlintW);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.16, sbGlint);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (sbGlint > 0.0) normal = normalize(mix(normal, (viewMatrix * vec4(sbGlintW, 0.0)).xyz, 0.75));');
  };
}

/** The bed's cut faces against the glass: grains pressed on the pane, layers, darker and greyer with depth, pebbles. */
function sideShader(U: Record<string, IUniform>) {
  return (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSbN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSbN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSbN;\n${GRAIN_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float sbLight;
{
  vec2 q = vec2(abs(vSbN.x) > 0.5 ? vTankP.z : vTankP.x, vTankP.y);
  float deep = clamp((uBedTop - q.y) / uBedTop, 0.0, 1.0);
  vec2 g = q * uGrainScale;
  float fw = length(fwidth(g));
  float near = (1.0 - smoothstep(0.3, 1.0, fw)) * (1.0 - uMud * 0.8);
  vec3 col = uSandMean;
  if (near > 0.0) {
    float crev; vec2 id;
    vec3 gc = sbGrains(g, crev, id);
    // against the glass the grains show whole; their colours a little closer together than on the top
    col = mix(uSandMean, mix(uSandMean, gc, 0.75) * (1.0 - 0.45 * crev), near);
  }
  // the layers laid down as the bed settled, wavy, with now and then a coarser band
  float band = sbNoise(vec2(q.x * 14.0, q.y * 160.0 + sbNoise(q * 30.0) * 3.0));
  col *= 0.82 + 0.3 * band;
  // now and then a pebble or a shell crumb pressed against the glass, of any size, anywhere in its cell
  vec2 pc = q * vec2(110.0, 130.0), pi = floor(pc);
  float ph = sbHash12(pi + 41.0);
  if (ph > 0.955) {
    vec2 pr = fract(pc) - 0.2 - 0.6 * sbHash22(pi + 7.0);
    float rad = 0.12 + 0.2 * sbHash12(pi + 3.0);
    float pd = length(pr * vec2(1.0, 1.25 + 0.5 * sbHash12(pi + 9.0))) / rad;
    float pm = smoothstep(1.0, 0.8, pd) * (1.0 - uMud * 0.6);
    vec3 pcCol = ph > 0.99 ? uSandD : mix(uSandC * 2.2, uSandB, sbHash12(pi + 5.0));
    col = mix(col, pcCol * (1.05 - 0.35 * pd * pd), pm);
  }
  // deeper down the sand is darker, and greyer (little oxygen); mud turns black below its brown skin
  col *= mix(1.0, 0.62 - 0.3 * uMud, smoothstep(0.0, 1.0, deep));
  col = mix(col, vec3(dot(col, vec3(0.33))) * vec3(0.9, 0.92, 0.95), deep * (0.35 + 0.4 * uMud));
  diffuseColor.rgb = col;
  // the light that soaks into the top centimetre of the bed from above
  sbLight = exp(-max(uBedTop - q.y, 0.0) * 160.0);
}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLampCol * (0.012 + 0.05 * sbLight);');
  };
}

/** sand: pale quartz, warm feldspar, dark rock, shell crumbs (linear colours); mud: a greyish brown silt */
const SAND = { a: [0.4, 0.34, 0.24], b: [0.36, 0.25, 0.14], c: [0.1, 0.09, 0.075], d: [0.6, 0.56, 0.47], silt: [0.2, 0.165, 0.12], w: [0.46, 0.34, 0.13, 0.07] };
const MUD = { a: [0.12, 0.095, 0.064], b: [0.1, 0.078, 0.05], c: [0.05, 0.043, 0.035], d: [0.3, 0.27, 0.22], silt: [0.075, 0.06, 0.04], w: [0.46, 0.34, 0.13, 0.07] };

/**
 * The tank's bed: a relief heightfield (shared by the mesh and by the animals, which stand on it), its cut faces
 * against the glass, and scattered pebbles and shell crumbs; or the bare bottom glass.
 */
export class Substrate {
  readonly root = new Group();
  private readonly top: Mesh;
  private readonly side: Mesh;
  private readonly bare: Mesh;
  private readonly pebbles: InstancedMesh;
  private readonly shells: InstancedMesh;
  private readonly topMat: MeshStandardMaterial;
  private readonly sideMat: MeshStandardMaterial;
  /** the bed's sand shading (BED_SAND_GLSL's uniforms) */
  readonly U: Record<string, IUniform>;
  private kind: SubstrateKind = 'sand';
  private w = 0.6;
  private d = 0.3;
  private nx = 1;
  private nz = 1;
  private heights = new Float32Array(4);
  private silt = new Float32Array(4);

  constructor(tankU: Record<string, IUniform>) {
    this.U = {
      uSandA: { value: new Color() }, uSandB: { value: new Color() }, uSandC: { value: new Color() }, uSandD: { value: new Color() },
      uSandMean: { value: new Color() }, uSiltCol: { value: new Color() },
      uGrainScale: { value: 1 / 0.0008 }, uMud: { value: 0 }, uBedTop: { value: BED_H }, uGlintAmt: { value: 0.035 },
    };
    this.topMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0 });
    lightByCaustics(this.topMat, tankU, 'tank-bed-top', { chain: topShader(this.U) });
    this.sideMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    lightByCaustics(this.sideMat, tankU, 'tank-bed-side', { chain: sideShader(this.U) });
    this.top = new Mesh(new BufferGeometry(), this.topMat);
    this.top.receiveShadow = true; this.top.name = 'tankBed';
    this.side = new Mesh(new BufferGeometry(), this.sideMat);
    this.side.receiveShadow = true;
    const bareMat = new MeshStandardMaterial({ color: 0x0c0f11, roughness: 0.14, metalness: 0.0 });
    lightByCaustics(bareMat, tankU, 'tank-bare');
    this.bare = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), bareMat);
    this.bare.receiveShadow = true; this.bare.position.y = 0.0005;
    // pebbles: rough, slightly flattened stones; shell crumbs: thin curved flakes
    const peb = new IcosahedronGeometry(1, 1);
    const pp = peb.attributes.position as BufferAttribute;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), k = 1 + (vnoise(x * 2.1 + 5, z * 2.1 + y * 1.3, 77) - 0.5) * 0.5;
      pp.setXYZ(i, x * k, y * k * 0.62, z * k * 0.9);
    }
    peb.computeVertexNormals();
    const pebMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 });
    lightByCaustics(pebMat, tankU, 'tank-pebble');
    this.pebbles = new InstancedMesh(peb, pebMat, 420);
    const shell = new PlaneGeometry(2, 1.4, 4, 3);
    const sp = shell.attributes.position as BufferAttribute;
    // a fragment of a cockle: a curved flake, ragged at the edge
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i), k = 1 - 0.25 * vnoise(x * 3 + 1, y * 3, 61); sp.setXYZ(i, x * k, y * k, -0.55 * (x * x + y * y)); }
    shell.rotateX(-Math.PI / 2).computeVertexNormals();
    const shellMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, side: DoubleSide });
    lightByCaustics(shellMat, tankU, 'tank-shellbit');
    this.shells = new InstancedMesh(shell, shellMat, 160);
    for (const m of [this.pebbles, this.shells]) { m.receiveShadow = true; m.castShadow = false; m.instanceMatrix.setUsage(DynamicDrawUsage); m.frustumCulled = false; }
    this.root.add(this.top, this.side, this.bare, this.pebbles, this.shells);
    this.setPalette();
  }

  private setPalette(): void {
    const p = this.kind === 'mud' ? MUD : SAND;
    const set = (c: IUniform, v: number[]) => (c.value as Color).setRGB(v[0], v[1], v[2]);
    set(this.U.uSandA, p.a); set(this.U.uSandB, p.b); set(this.U.uSandC, p.c); set(this.U.uSandD, p.d); set(this.U.uSiltCol, p.silt);
    const mean = [0, 1, 2].map((i) => p.a[i] * p.w[0] + p.b[i] * p.w[1] + p.c[i] * p.w[2] + p.d[i] * p.w[3]);
    set(this.U.uSandMean, mean.map((v) => v * 0.97));
    this.U.uMud.value = this.kind === 'mud' ? 1 : 0;
    this.U.uGlintAmt.value = this.kind === 'mud' ? 0.004 : 0.035;
    this.topMat.roughness = this.kind === 'mud' ? 0.62 : 0.88;
  }

  /** The bed's height (tank-local y) at (x, z); 0 on a bare bottom. */
  heightAt(x: number, z: number): number {
    if (this.kind === 'none') return 0;
    const fx = Math.min(this.nx, Math.max(0, (x / this.w + 0.5) * this.nx)), fz = Math.min(this.nz, Math.max(0, (z / this.d + 0.5) * this.nz));
    const ix = Math.min(this.nx - 1, Math.floor(fx)), iz = Math.min(this.nz - 1, Math.floor(fz)), u = fx - ix, v = fz - iz;
    const r = this.nx + 1, H = this.heights;
    const a = H[iz * r + ix], b = H[iz * r + ix + 1], c = H[(iz + 1) * r + ix], e = H[(iz + 1) * r + ix + 1];
    return BED_H + (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
  }

  /** The bed's colour as the top shader draws it at (x, z) (linear albedo; the grains and the mottle average out to
   *  the mean, silt settled in the hollows); null on a bare bottom. */
  colorAt(x: number, z: number, out: Color): Color | null {
    if (this.kind === 'none') return null;
    return out.copy(this.U.uSandMean.value as Color).lerp(this.U.uSiltCol.value as Color, this.siltAt(x, z) * 0.55);
  }

  /** How much fine silt has settled at (x, z) (0..1, as the top shader takes it); 0 on a bare bottom. */
  siltAt(x: number, z: number): number {
    if (this.kind === 'none') return 0;
    const fx = Math.min(this.nx, Math.max(0, (x / this.w + 0.5) * this.nx)), fz = Math.min(this.nz, Math.max(0, (z / this.d + 0.5) * this.nz));
    const ix = Math.min(this.nx - 1, Math.floor(fx)), iz = Math.min(this.nz - 1, Math.floor(fz)), u = fx - ix, v = fz - iz;
    const r = this.nx + 1, S = this.silt;
    const silt = (S[iz * r + ix] * (1 - u) + S[iz * r + ix + 1] * u) * (1 - v) + (S[(iz + 1) * r + ix] * (1 - u) + S[(iz + 1) * r + ix + 1] * u) * v;
    return Math.min(1, Math.max(0, silt));
  }

  get mean(): number { return this.kind === 'none' ? 0 : BED_H; }

  setKind(kind: SubstrateKind): void {
    if (kind === this.kind && this.heights.length > 4) return;
    this.kind = kind;
    this.build();
  }

  setDimensions(width: number, depth: number): void {
    if (width === this.w && depth === this.d && this.heights.length > 4) return;
    this.w = width; this.d = depth;
    this.build();
  }

  private build(): void {
    const kind = this.kind, w = this.w - 0.002, d = this.d - 0.002;
    this.setPalette();
    const bed = kind !== 'none';
    this.top.visible = this.side.visible = this.pebbles.visible = this.shells.visible = bed;
    this.bare.visible = !bed;
    this.bare.scale.set(this.w, 1, this.d);
    this.U.uBedTop.value = BED_H;
    const nx = this.nx = Math.min(320, Math.max(40, Math.round(w / 0.003))), nz = this.nz = Math.min(160, Math.max(20, Math.round(d / 0.003)));
    // a few dug hollows (sand) or burrows (mud), the same for a given tank size
    const rnd = mulberry(Math.round(w * 1000) * 7 + Math.round(d * 1000) + (kind === 'mud' ? 99 : 0));
    const pits: [number, number, number, number][] = [];
    const nPits = kind === 'mud' ? Math.round(30 * w * d / 0.18) : Math.round(4 * w * d / 0.18);
    for (let i = 0; i < nPits; i++) {
      const r = kind === 'mud' ? 0.0025 + rnd() * 0.002 : 0.018 + rnd() * 0.02;
      pits.push([(rnd() - 0.5) * (w - 0.06), (rnd() - 0.5) * (d - 0.06), r, kind === 'mud' ? 0.002 + rnd() * 0.002 : 0.003 + rnd() * 0.004]);
    }
    const r = nx + 1, H = this.heights = new Float32Array((nx + 1) * (nz + 1)), S = this.silt = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const [h, s] = relief(kind, (i / nx - 0.5) * w, (j / nz - 0.5) * d, w, d, pits);
      H[j * r + i] = h; S[j * r + i] = s;
    }
    // top: a grid on the heightfield, normals from its slopes
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), nrm = new Float32Array(pos.length);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const k = j * r + i, x = (i / nx - 0.5) * w, z = (j / nz - 0.5) * d;
      pos.set([x, BED_H + H[k], z], k * 3);
      const hx = (H[j * r + Math.min(nx, i + 1)] - H[j * r + Math.max(0, i - 1)]) / ((Math.min(nx, i + 1) - Math.max(0, i - 1)) * w / nx);
      const hz = (H[Math.min(nz, j + 1) * r + i] - H[Math.max(0, j - 1) * r + i]) / ((Math.min(nz, j + 1) - Math.max(0, j - 1)) * d / nz);
      const l = Math.hypot(hx, 1, hz);
      nrm.set([-hx / l, 1 / l, -hz / l], k * 3);
    }
    const idx = new Uint32Array(nx * nz * 6);
    let n = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * r + i, b = a + 1, c = a + r, e = c + 1;
      idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = e;
    }
    const topGeo = new BufferGeometry();
    topGeo.setAttribute('position', new BufferAttribute(pos, 3));
    topGeo.setAttribute('normal', new BufferAttribute(nrm, 3));
    topGeo.setAttribute('aSilt', new BufferAttribute(S, 1));
    topGeo.setIndex(new BufferAttribute(idx, 1));
    topGeo.computeBoundingSphere();
    this.top.geometry.dispose(); this.top.geometry = topGeo;
    // the cut faces: four walls from the floor up to the relief's edge
    const sp: number[] = [], sn: number[] = [], si: number[] = [];
    const wall = (pts: [number, number, number][], nrmv: [number, number, number]) => {
      const base = sp.length / 3;
      for (const [x, y, z] of pts) { sp.push(x, y, z, x, 0, z); sn.push(...nrmv, ...nrmv); }
      // wound so the face looks out along nrmv: (top_i, bottom_i, top_i+1) faces (top_i+1 - top_i) x down
      const [x0, , z0] = pts[0], [x1, , z1] = pts[1];
      const out = (z1 - z0) * nrmv[0] - (x1 - x0) * nrmv[2] < 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = base + i * 2, b = a + 1, c = a + 2, e = a + 3;
        if (out) si.push(a, b, c, c, b, e); else si.push(a, c, b, c, e, b);
      }
    };
    const edge = (fixed: 'x' | 'z', at: number): [number, number, number][] => {
      const out: [number, number, number][] = [];
      if (fixed === 'z') { const j = at > 0 ? nz : 0; for (let i = 0; i <= nx; i++) out.push([(i / nx - 0.5) * w, BED_H + H[j * r + i], at]); }
      else { const i = at > 0 ? nx : 0; for (let j = 0; j <= nz; j++) out.push([at, BED_H + H[j * r + i], (j / nz - 0.5) * d]); }
      return out;
    };
    wall(edge('z', d / 2), [0, 0, 1]);
    wall(edge('z', -d / 2), [0, 0, -1]);
    wall(edge('x', w / 2), [1, 0, 0]);
    wall(edge('x', -w / 2), [-1, 0, 0]);
    const sideGeo = new BufferGeometry();
    sideGeo.setAttribute('position', new BufferAttribute(new Float32Array(sp), 3));
    sideGeo.setAttribute('normal', new BufferAttribute(new Float32Array(sn), 3));
    sideGeo.setIndex(si);
    sideGeo.computeBoundingSphere();
    this.side.geometry.dispose(); this.side.geometry = sideGeo;
    this.scatter();
  }

  /** Pebbles half sunk in the sand and shell crumbs lying on it (fewer, darker, on mud). */
  private scatter(): void {
    const rnd = mulberry(Math.round(this.w * 1000) * 13 + Math.round(this.d * 1000) * 3);
    const area = this.w * this.d / 0.18, mud = this.kind === 'mud';
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3(), c = new Color(), e = new Vector3();
    const nP = Math.min(this.pebbles.instanceMatrix.count, Math.round((mud ? 30 : 110) * area));
    for (let i = 0; i < nP; i++) {
      // clustered: more along the front and in a few drifts
      let x = (rnd() - 0.5) * (this.w - 0.012), z = (rnd() - 0.5) * (this.d - 0.012);
      if (rnd() < 0.45) { const cx = (vnoise(i * 0.37, 3, 51) - 0.5) * this.w * 0.8; x = cx + (rnd() - 0.5) * 0.06; }
      x = Math.max(-this.w / 2 + 0.005, Math.min(this.w / 2 - 0.005, x));
      const big = rnd() < 0.1, r = big ? 0.0028 + rnd() * 0.003 : 0.0008 + rnd() * 0.0014;
      s.set(r * (0.8 + rnd() * 0.5), r, r * (0.8 + rnd() * 0.4));
      q.setFromAxisAngle(e.set(rnd() - 0.5, 1, rnd() - 0.5).normalize(), rnd() * Math.PI * 2);
      p.set(x, this.heightAt(x, z) - r * 0.25, z);
      m.compose(p, q, s);
      this.pebbles.setMatrixAt(i, m);
      const t = rnd();
      // grey rock, warm sandstone, dark basalt: earth colours, a little lighter or darker each
      const k = 0.75 + rnd() * 0.5;
      if (mud) c.setRGB(0.05 * k, 0.045 * k, 0.04 * k);
      else if (t < 0.4) c.setRGB(0.2 * k, 0.185 * k, 0.165 * k);
      else if (t < 0.75) c.setRGB(0.3 * k, 0.22 * k, 0.14 * k);
      else c.setRGB(0.06 * k, 0.058 * k, 0.055 * k);
      this.pebbles.setColorAt(i, c);
    }
    this.pebbles.count = nP;
    const nS = Math.min(this.shells.instanceMatrix.count, Math.round((mud ? 10 : 40) * area));
    for (let i = 0; i < nS; i++) {
      const x = (rnd() - 0.5) * (this.w - 0.012), z = (rnd() - 0.5) * (this.d - 0.012), r = 0.0012 + rnd() * 0.0022;
      s.set(r, r, r);
      q.setFromAxisAngle(e.set((rnd() - 0.5) * 0.5, 1, (rnd() - 0.5) * 0.5).normalize(), rnd() * Math.PI * 2);
      if (rnd() < 0.5) q.multiply(new Quaternion().setFromAxisAngle(e.set(1, 0, 0), Math.PI));
      p.set(x, this.heightAt(x, z) + r * 0.12, z);
      m.compose(p, q, s);
      this.shells.setMatrixAt(i, m);
      const t = 0.42 + rnd() * 0.2;
      c.setRGB(t, t * 0.93, t * (0.8 + rnd() * 0.08));
      if (mud) c.multiplyScalar(0.55);
      this.shells.setColorAt(i, c);
    }
    this.shells.count = nS;
    for (const im of [this.pebbles, this.shells]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }

  dispose(): void {
    for (const o of [this.top, this.side, this.bare]) { o.geometry.dispose(); (o.material as MeshStandardMaterial).dispose(); }
    for (const im of [this.pebbles, this.shells]) { im.geometry.dispose(); (im.material as MeshStandardMaterial).dispose(); im.dispose(); }
    this.root.removeFromParent();
  }
}
