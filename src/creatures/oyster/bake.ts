import {
  HalfFloatType, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat, RGFormat, ShaderMaterial, UnsignedByteType,
  Vector2, Vector4, WebGLRenderTarget, type Texture, type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GROWTH_VARIANTS } from './genome';
import { TILE_FLIP, type AtlasLayout } from './geometry';
import { growthVariant, LAM_W, MAX_K, type GrowthVariant } from './variants';

/**
 * The shell's surface, baked on the GPU into an atlas, in the (u, s) space of each valve (variants.ts):
 *
 *   mask    R lightness of the ground colour, G purple pigment (rays, bands, fresh edges, scar), B fresh / frill edge,
 *           A how readily this spot erodes to chalk (the material decides how far it has gone per individual)
 *   hr      R height (per mille of shell length; also the LOD0 displacement), G roughness — half float
 *   normal  RGB tangent-space normal from the height (x along u, y along s), A ambient occlusion from the relief
 *
 * Every growth variant gets a block of four tiles: lower exterior, upper exterior, lower interior, upper interior.
 * On the exterior: minor lamellae between the geometry's big ones (each a shingle that rises to a sharp free edge
 * and steps down), fine growth lines, radial striae, the prismatic grain, the pits of boring sponges and worms, and
 * the dark underside of every frill. Inside: porcelain with chalky blisters, the kidney-shaped adductor scar and the
 * dark band along the margin. A separate tiling detail normal adds the finest grain for macro views.
 *
 * Only the colour *masks* are baked, not colours: each oyster tints them with its own colour seed, mud, algae and
 * erosion in the material, so one atlas serves the whole reef without any two oysters looking alike.
 */

const COMMON = /* glsl */ `
varying vec2 vUv;
float h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.97; }
float fbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vn(p); p = p * 2.07 + 9.3; a *= 0.5; } return s / 0.875; }
float sstep(float a, float b, float x) { return a < b ? smoothstep(a, b, x) : 1.0 - smoothstep(b, a, x); }
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const SURFACE_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uLam;
uniform int uValve;      // 0 lower, 1 upper
uniform int uK;
uniform int uTile;       // 0 exterior, 1 interior
uniform int uOut;        // 0 masks, 1 height + roughness
uniform vec4 uPlic;
uniform vec4 uDet;       // minor lamellae per unit s, striae, rays, pit density
uniform vec4 uScar;
uniform float uSeed;
uniform vec2 uSpan;      // shell lengths per unit u and per unit s
uniform float uFlip;     // 1: this tile runs s downward

vec4 lamAt(int k, float u) {
  float x = clamp(u, 0.0, 1.0) * float(${LAM_W - 1});
  int i = int(min(float(${LAM_W - 2}), floor(x)));
  float f = x - float(i);
  int row = uValve * ${MAX_K} + k;
  return mix(texelFetch(uLam, ivec2(i, row), 0), texelFetch(uLam, ivec2(i + 1, row), 0), f);
}
float plic(float u) {
  float env = smoothstep(0.04, 0.22, u) * (1.0 - smoothstep(0.78, 0.96, u));
  return cos(6.2831853 * (u * uPlic.x + uPlic.y) + uPlic.z * sin(6.2831853 * u * 1.37 + uPlic.w) + 0.6 * uPlic.z * sin(6.2831853 * u * 3.1 + uPlic.w * 1.7)) * env;
}

void exterior(vec2 uv, out float height, out vec4 mask, out float rough) {
  float u = uv.x, s = uv.y;
  float up = float(uValve);
  // which layer: between the previous lamella's frill and the next one's
  float sPrev = 0.0, sNext = 1.0, lipPrev = -1.0;
  int kk = uK;
  for (int k = 0; k < ${MAX_K}; k++) {
    if (k >= uK) break;
    vec4 L = lamAt(k, u);
    if (s < L.x) { sNext = L.x; kk = k; break; }
    sPrev = L.x + L.w * 0.3 + 0.002;
    lipPrev = L.x;
  }
  float span = max(0.012, sNext - sPrev);
  float t = clamp((s - sPrev) / span, 0.0, 1.0);
  float seedK = float(kk) * 7.31 + uSeed;
  float pl = plic(u);
  // minor lamellae: each rises to a free edge and steps down onto the next (younger) one. Their edges wander
  // along the margin, break off and start again, so no two run parallel for long.
  float nMinor = max(1.0, floor(span * uDet.x * mix(1.0, 1.4, up) + 0.5));
  float gm0 = t * nMinor + (fbm3(vec2(u * 7.0, seedK)) - 0.5) * 1.1 + pl * 0.3 + (fbm3(vec2(u * 31.0, seedK + 3.0)) - 0.5) * 0.35;
  float id0 = floor(gm0);
  // ragged free edges: torn at a few scales along the margin, differently for every lamella
  float gm = gm0 + (vn(vec2(u * 140.0, id0 * 1.7 + seedK)) - 0.5) * 0.3 + (vn(vec2(u * 520.0, id0 * 2.3 + seedK)) - 0.5) * 0.1;
  float fr = fract(gm), id = floor(gm);
  float amp = (0.35 + 0.9 * h2(vec2(id, seedK))) * smoothstep(0.25, 0.6, vn(vec2(u * 9.0 + id * 3.7, id + seedK)) + 0.15);
  // a few minor edges are lifted into little frills of their own
  float frillet = step(0.62, h2(vec2(id * 3.1, seedK + 5.0))) * smoothstep(0.3, 0.9, 0.5 + 0.5 * pl + 0.3 * (vn(vec2(u * 40.0, id)) - 0.5));
  float minor = pow(fr, 2.6) * amp * (1.0 + 1.6 * frillet);
  // fine growth lines: faint, broken
  float fine = (0.5 + 0.5 * sin(6.2831853 * gm * 4.0 + (fbm3(vec2(u * 30.0, s * 20.0)) - 0.5) * 5.0)) * vn(vec2(u * 50.0, s * 40.0));
  // radial striae, weak and wandering
  float rp = u * uDet.y + (fbm3(vec2(u * 4.0, s * 3.0 + uSeed)) - 0.5) * 3.0;
  float rad = pow(0.5 + 0.5 * cos(6.2831853 * rp), 4.0) * smoothstep(0.08, 0.5, s) * vn(vec2(u * 20.0, s * 8.0) + uSeed);
  // prismatic grain
  vec2 phys = vec2(u * uSpan.x * max(s, 0.08), s * uSpan.y);
  float grain = fbm(phys * 240.0 + uSeed);
  float grain2 = vn(phys * 900.0 + uSeed * 1.7);
  // flakes: patches where the outermost sheet has peeled off, leaving a sharp-edged step down onto the layer below
  float fl = fbm(phys * vec2(18.0, 26.0) + uSeed * 4.3 + id * 0.7);
  float flake = smoothstep(0.58, 0.61, fl) * smoothstep(0.1, 0.4, s);
  // pits of boring sponges and spionid worms (dark holes, often in pairs)
  vec2 cp = phys * 42.0;
  vec2 ci = floor(cp), cf = fract(cp) - 0.5;
  float hc = h2(ci + uSeed * 3.1);
  vec2 off = vec2(h2(ci + 1.7), h2(ci + 9.2)) - 0.5;
  float pr = 0.07 + 0.12 * h2(ci + 4.4);
  float pit = hc < uDet.w * 0.16 ? 1.0 - smoothstep(pr * 0.55, pr, length(cf - off * 0.6)) : 0.0;
  pit = max(pit, hc < uDet.w * 0.05 ? 1.0 - smoothstep(pr * 0.4, pr * 0.8, length(cf - off * 0.6 - vec2(pr * 1.6, 0.0))) : 0.0);
  pit *= smoothstep(0.1, 0.3, s);
  // the dark underside of the previous frill and the freshly exposed younger layer below it
  float edge = lipPrev >= 0.0 ? 1.0 - smoothstep(0.0, 0.02, s - lipPrev) : 0.0;
  float margin = smoothstep(0.935, 0.995, s);
  float relief = mix(1.0, 0.85, up);
  height = (minor * 4.6 * relief + fine * 0.25 + rad * mix(0.5, 0.35, up) + (grain - 0.5) * 0.9 + (grain2 - 0.5) * 0.25 - pit * 3.2 - flake * 1.6);
  height *= 1.0 - 0.3 * margin;
  height *= smoothstep(0.0, 0.06, s);
  // colour masks
  // tops of the scales bleach pale; the foot of each step, where silt and film collect, stays dark
  float light = 0.62 + 0.35 * (grain - 0.5) + 0.32 * pow(fr, 1.5) * amp - 0.22 * (1.0 - smoothstep(0.0, 0.25, fr)) * amp + 0.1 * (1.0 - s) - 0.28 * edge - 0.45 * pit + 0.12 * flake;
  light += 0.08 * (vn(vec2(u * 12.0, s * 9.0) + uSeed) - 0.5);
  float rays = smoothstep(0.45, 0.95, 0.5 + 0.5 * cos(6.2831853 * (u * uDet.z + (fbm3(vec2(u * 5.0, s * 2.0 + uSeed)) - 0.5) * 2.2)));
  rays *= smoothstep(0.3, 0.75, fbm3(vec2(u * 14.0, s * 5.0) + uSeed)) * smoothstep(0.08, 0.7, s) * mix(0.75, 1.15, up);
  float band = smoothstep(0.55, 0.85, h2(vec2(id, seedK * 1.3))) * 0.55 * smoothstep(0.2, 0.6, s);
  float pig = clamp(max(rays, band) * (1.0 - 0.6 * flake) + edge * 0.55 + margin * 0.5 + frillet * fr * 0.3, 0.0, 1.0);
  float fresh = max(edge, margin * 0.85);
  float ero = clamp((1.0 - smoothstep(0.04, 0.45, s)) * 0.6 + (fbm(vec2(u * 6.0, s * 5.0) + uSeed * 2.0) - 0.5) * 1.1 + fr * 0.15 + up * 0.08 + flake * 0.3, 0.0, 1.0);
  mask = vec4(clamp(light, 0.0, 1.0), pig, fresh, ero);
  rough = 0.66 + 0.18 * (grain - 0.5) - 0.14 * edge - 0.12 * margin + 0.22 * pit;
}

void interior(vec2 uv, out float height, out vec4 mask, out float rough) {
  float u = uv.x, s = uv.y;
  vec2 phys = vec2(u * uSpan.x * max(s, 0.08), s * uSpan.y);
  // chalky deposits (chalk lenses) under the porcelain: soft, matte blisters
  float ch = smoothstep(0.56, 0.8, fbm(phys * 6.0 + uSeed * 1.7)) * smoothstep(0.12, 0.35, s) * (1.0 - smoothstep(0.82, 0.95, s));
  // the adductor scar: a kidney, curved toward the hinge, with its own growth lines
  vec2 d = vec2((u - uScar.x) / uScar.z, (s - uScar.y) / uScar.w);
  d.x += 0.35 * d.y * d.y;
  float r = length(d);
  float scar = 1.0 - smoothstep(0.88, 1.0, r);
  float scarLines = 0.5 + 0.5 * sin(r * 36.0 + vn(vec2(u, s) * 50.0) * 2.0);
  // the dark band along the inner margin, irregular width
  float mb = smoothstep(0.84 + 0.05 * (fbm3(vec2(u * 12.0, uSeed)) - 0.5) * 2.0, 0.965, s);
  float growth = 0.5 + 0.5 * sin(6.2831853 * s * 44.0 + (fbm3(vec2(u * 8.0, s * 4.0)) - 0.5) * 4.0);
  float grain = vn(phys * 600.0 + uSeed);
  height = ch * 2.2 + growth * 0.35 * mb - scar * 0.9 + scar * scarLines * 0.25 + (grain - 0.5) * 0.12;
  height *= smoothstep(0.0, 0.05, s);
  float hingeStain = (1.0 - smoothstep(0.0, 0.2, s)) * 0.55;
  float light = 0.9 - 0.08 * fbm3(phys * 3.0) + ch * 0.07 - mb * 0.2;
  float pig = clamp(max(max(scar * (0.55 + 0.45 * vn(vec2(u, s) * 30.0)), mb * (0.75 + 0.25 * grain)), hingeStain * fbm3(phys * 4.0)), 0.0, 1.0);
  mask = vec4(light, pig, mb, ch);
  rough = 0.2 + ch * 0.55 + scar * 0.12 + mb * 0.06 + (grain - 0.5) * 0.04;
}

void main() {
  float height; vec4 mask; float rough;
  vec2 st = vec2(vUv.x, uFlip > 0.5 ? 1.0 - vUv.y : vUv.y);
  if (uTile == 0) exterior(st, height, mask, rough); else interior(st, height, mask, rough);
  if (uOut == 0) gl_FragColor = mask;
  else gl_FragColor = vec4(height, clamp(rough, 0.04, 1.0), 0.0, 1.0);
}
`;

const NORMAL_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D tHR;
uniform vec4 uRect;      // the tile in atlas uv (x, y, w, h)
uniform vec2 uTexel;     // atlas texel size
uniform vec2 uSpan;
uniform float uStrength;
uniform float uFlip;
float H(vec2 p) { p = clamp(p, uRect.xy + uTexel * 0.5, uRect.xy + uRect.zw - uTexel * 0.5); return texture2D(tHR, p).r; }
void main() {
  vec2 at = uRect.xy + vUv * uRect.zw;
  float s = uFlip > 0.5 ? 1.0 - vUv.y : vUv.y;
  float hl = H(at - vec2(uTexel.x, 0.0)), hr = H(at + vec2(uTexel.x, 0.0));
  float hd = H(at - vec2(0.0, uTexel.y)), hu = H(at + vec2(0.0, uTexel.y));
  // height is per mille of shell length; the tile spans uSpan shell lengths (u shrinks toward the beak)
  float du = (uTexel.x / uRect.z) * uSpan.x * max(s, 0.06);
  float ds = (uTexel.y / uRect.w) * uSpan.y;
  float gx = (hr - hl) * 0.001 / (2.0 * du);
  float gy = (hu - hd) * 0.001 / (2.0 * ds);
  vec3 n = normalize(vec3(-gx * uStrength, -gy * uStrength, 1.0));
  // occlusion: how much of the neighbourhood stands above this point
  float hc = H(at), occ = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.39;
    vec2 dir = vec2(cos(a), sin(a));
    for (int j = 1; j <= 3; j++) {
      float rr = float(j * j) * 1.5;
      float dh = H(at + dir * uTexel * rr) - hc;
      float dist = rr * 0.5 * (du + ds) * 1000.0;
      occ += clamp(dh / max(dist, 1e-3) * 0.6, 0.0, 1.0) / float(j);
    }
  }
  float ao = clamp(1.0 - occ / 8.0 * 0.9, 0.25, 1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, ao);
}
`;

const DETAIL_FRAG = /* glsl */ `
${COMMON}
const float P = 16.0;
float vnp(vec2 p, float per) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, per), i1 = mod(i + 1.0, per);
  return mix(mix(h2(i0), h2(vec2(i1.x, i0.y)), f.x), mix(h2(vec2(i0.x, i1.y)), h2(i1), f.x), f.y); }
float hgt(vec2 uv) {
  // tiling: grain at three scales and faint growth threads along u
  float g = 0.5 * vnp(uv * P, P) + 0.3 * vnp(uv * P * 2.0, P * 2.0) + 0.2 * vnp(uv * P * 4.0, P * 4.0);
  float threads = 0.5 + 0.5 * sin(6.2831853 * (uv.y * 24.0 + (vnp(uv * 4.0, 4.0) - 0.5) * 1.2));
  float pores = smoothstep(0.78, 0.95, vnp(uv * P * 8.0, P * 8.0));
  return g * 0.6 + threads * 0.3 - pores * 0.5;
}
void main() {
  float e = 1.0 / 512.0;
  float hx = hgt(vUv + vec2(e, 0.0)) - hgt(vUv - vec2(e, 0.0));
  float hy = hgt(vUv + vec2(0.0, e)) - hgt(vUv - vec2(0.0, e));
  vec3 n = normalize(vec3(-hx * 18.0, -hy * 18.0, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
`;

/** Tile height fractions inside a variant block: exteriors get more texels than interiors. */
const TILE_FRAC = [0.3125, 0.3125, 0.1875, 0.1875] as const;

export interface AtlasOptions {
  /** texels across one block (u) and down one block (all four tiles) */
  blockW: number;
  blockH: number;
  /** growth variants to bake, in block order */
  variants: number[];
  cols: number;
}

function makeTarget(w: number, h: number, half: boolean, rg = false): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(w, h, {
    type: half ? HalfFloatType : UnsignedByteType,
    format: rg ? RGFormat : RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
  });
  rt.texture.colorSpace = NoColorSpace;
  rt.texture.anisotropy = 4;
  return rt;
}

/** A baked set of oyster surface textures and the layout geometry needs to address them. */
export class OysterAtlas {
  readonly layout: AtlasLayout;
  readonly mask: Texture;
  readonly hr: Texture;
  readonly normal: Texture;
  readonly detail: Texture;
  /** detail normal repeats per unit atlas uv */
  readonly detailRep: Vector2;
  readonly width: number;
  readonly height: number;
  private readonly targets: WebGLRenderTarget[];

  private constructor(renderer: WebGLRenderer, opts: AtlasOptions) {
    const rows = Math.ceil(opts.variants.length / opts.cols);
    const W = opts.blockW * opts.cols, H = opts.blockH * rows;
    this.width = W;
    this.height = H;
    const blocks: Record<number, number> = {};
    opts.variants.forEach((v, i) => { blocks[v] = i; });
    this.layout = { cols: opts.cols, rows, tileFrac: TILE_FRAC, padU: 1.5 / opts.blockW, padV: 1.5 / (opts.blockH * TILE_FRAC[2]), blocks };
    const rtMask = makeTarget(W, H, false), rtHR = makeTarget(W, H, true, true), rtN = makeTarget(W, H, false), rtD = makeTarget(512, 512, false);
    rtD.texture.wrapS = rtD.texture.wrapT = RepeatWrapping;
    this.targets = [rtMask, rtHR, rtN, rtD];
    this.mask = rtMask.texture;
    this.hr = rtHR.texture;
    this.normal = rtN.texture;
    this.detail = rtD.texture;
    // a detail period of ~4 % of the shell along s, ~1.6 % of the margin along u
    const tileH = TILE_FRAC[0] / rows, tileW = 1 / opts.cols;
    this.detailRep = new Vector2(1 / (0.016 * tileW), 1 / (0.04 * tileH));
    this.bake(renderer, opts, rtMask, rtHR, rtN, rtD);
  }

  private bake(renderer: WebGLRenderer, opts: AtlasOptions, rtMask: WebGLRenderTarget, rtHR: WebGLRenderTarget, rtN: WebGLRenderTarget, rtD: WebGLRenderTarget): void {
    const surf = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: SURFACE_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        uLam: { value: null }, uValve: { value: 0 }, uK: { value: 0 }, uTile: { value: 0 }, uOut: { value: 0 },
        uPlic: { value: new Vector4() }, uDet: { value: new Vector4() }, uScar: { value: new Vector4() }, uSeed: { value: 0 }, uSpan: { value: new Vector2(2.4, 1) }, uFlip: { value: 0 },
      },
    });
    const norm = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: NORMAL_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tHR: { value: rtHR.texture }, uRect: { value: new Vector4() }, uTexel: { value: new Vector2(1 / rtHR.width, 1 / rtHR.height) }, uSpan: { value: new Vector2(2.4, 1) }, uStrength: { value: 1 }, uFlip: { value: 0 } },
    });
    const det = new ShaderMaterial({ vertexShader: VERT, fragmentShader: DETAIL_FRAG, depthTest: false, depthWrite: false });
    const quad = new FullScreenQuad(surf);
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    const rect = (block: number, tile: number) => {
      const col = block % opts.cols, row = Math.floor(block / opts.cols);
      let t0 = 0;
      for (let i = 0; i < tile; i++) t0 += TILE_FRAC[i];
      const x = col * opts.blockW, y = Math.round((row + 0) * opts.blockH + t0 * opts.blockH);
      const h = Math.round(TILE_FRAC[tile] * opts.blockH);
      return { x, y, w: opts.blockW, h };
    };
    const setRect = (rt: WebGLRenderTarget, r: { x: number; y: number; w: number; h: number }) => {
      rt.viewport.set(r.x, r.y, r.w, r.h);
      rt.scissor.set(r.x, r.y, r.w, r.h);
      rt.scissorTest = true;
    };
    const variants: GrowthVariant[] = opts.variants.map((v) => growthVariant(v));
    for (let b = 0; b < variants.length; b++) {
      const v = variants[b];
      const u = surf.uniforms;
      u.uLam.value = v.texture;
      u.uPlic.value.set(...v.plic);
      u.uDet.value.set(...v.detail);
      u.uScar.value.set(...v.scar);
      u.uSeed.value = (v.seed % 9973) / 97.3;
      for (let tile = 0; tile < 4; tile++) {
        const upper = tile === 1 || tile === 3;
        u.uValve.value = upper ? 1 : 0;
        u.uK.value = upper ? v.upper.K : v.lower.K;
        u.uTile.value = tile < 2 ? 0 : 1;
        u.uFlip.value = TILE_FLIP[tile] ? 1 : 0;
        const r = rect(b, tile);
        for (const [rt, out] of [[rtMask, 0], [rtHR, 1]] as const) {
          setRect(rt, r);
          u.uOut.value = out;
          quad.material = surf;
          renderer.setRenderTarget(rt);
          quad.render(renderer);
        }
      }
    }
    // normals and occlusion from the height, tile by tile (sampling clamped to the tile)
    quad.material = norm;
    for (let b = 0; b < variants.length; b++) for (let tile = 0; tile < 4; tile++) {
      const r = rect(b, tile);
      norm.uniforms.uRect.value.set(r.x / rtHR.width, r.y / rtHR.height, r.w / rtHR.width, r.h / rtHR.height);
      norm.uniforms.uFlip.value = TILE_FLIP[tile] ? 1 : 0;
      setRect(rtN, r);
      renderer.setRenderTarget(rtN);
      quad.render(renderer);
    }
    quad.material = det;
    rtD.scissorTest = false;
    renderer.setRenderTarget(rtD);
    quad.render(renderer);
    for (const rt of [rtMask, rtHR, rtN]) { rt.scissorTest = false; rt.viewport.set(0, 0, rt.width, rt.height); }
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAuto;
    quad.dispose();
    surf.dispose();
    norm.dispose();
    det.dispose();
  }

  /** The atlas every reef and cluster oyster shares: all growth variants at a moderate resolution. */
  static shared(renderer: WebGLRenderer, quality: 'low' | 'mid' | 'high' = 'mid'): OysterAtlas {
    let map = sharedCache.get(renderer);
    if (!map) { map = new Map(); sharedCache.set(renderer, map); }
    const hit = map.get(quality);
    if (hit) return hit;
    const k = quality === 'low' ? 0.5 : 1;
    const a = new OysterAtlas(renderer, { blockW: 512 * k, blockH: 1024 * k, variants: [...Array(GROWTH_VARIANTS).keys()], cols: 3 });
    a.cache = map;
    map.set(quality, a);
    return a;
  }

  /** A close-up atlas for one growth variant (the hero individual): the same pattern, four times the texels. */
  static hero(renderer: WebGLRenderer, variant: number, quality: 'low' | 'mid' | 'high' = 'high'): OysterAtlas {
    const k = quality === 'low' ? 0.5 : quality === 'mid' ? 0.75 : 1;
    return new OysterAtlas(renderer, { blockW: Math.round(2048 * k), blockH: Math.round(2048 * k), variants: [variant], cols: 1 });
  }

  /** the shared-atlas cache this one sits in (removed from it on dispose) */
  private cache: Map<string, OysterAtlas> | null = null;

  dispose(): void {
    for (const rt of this.targets) rt.dispose();
    if (this.cache) for (const [k, v] of this.cache) if (v === this) this.cache.delete(k);
  }
}

const sharedCache = new WeakMap<WebGLRenderer, Map<string, OysterAtlas>>();
