import {
  LinearFilter, RepeatWrapping, RGBAFormat, ShaderMaterial, UnsignedByteType, Vector2, Vector4, WebGLRenderTarget,
  type IUniform, type Texture, type Vector3, type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** the window moves in steps of this many texels (the strips it uncovers are baked; the rest stays) */
const STEP = 64;

/**
 * The texel (m) of each level for a window `n` texels across: the near one some nine to a ripple (a window of 22 m,
 * 16 m at 1024), the far one three (61 m, 36 m), beyond which a ripple is finer than a pixel.
 */
export function rippleMapTexel(n: number, level: 0 | 1): number {
  return level === 0 ? (n >= 2048 ? 0.011 : 0.016) : n >= 2048 ? 0.03 : 0.035;
}

/**
 * The storage rectangles (x, y, width, height) a window `n` texels across uncovers when its first texel moves from
 * (`ox`, `oz`) to (`tx`, `tz`) (global texel indices, less than `n` apart): the columns and the rows that come into it,
 * each band split where it wraps round the texture's edge.
 */
export function uncoveredStrips(ox: number, oz: number, tx: number, tz: number, n: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const mod = (v: number) => ((v % n) + n) % n;
  const band = (from: number, to: number, cols: boolean) => {
    let a = mod(from);
    let left = to - from;
    while (left > 0) {
      const w = Math.min(left, n - a);
      out.push(cols ? [a, 0, w, n] : [0, a, n, w]);
      left -= w;
      a = 0;
    }
  };
  if (tx > ox) band(ox + n, tx + n, true); else if (tx < ox) band(tx, ox, true);
  if (tz > oz) band(oz + n, tz + n, false); else if (tz < oz) band(tz, oz, false);
  return out;
}

/**
 * GLSL to read the ripple map's two levels: `rippleAt(xz)` gives the relief (x: -1 in a trough … +1 on a crest, scaled
 * by how well formed the ripples are there) and the slope the shading tilts the normal by (yz, world x and z), the near
 * level blending into the far one and the far one fading out toward its edge (w: 1 inside, 0 beyond). Read at the top
 * level, as the field was worked out per pixel (the anti-aliasing averages the shading, not the slopes).
 */
export const RIPPLE_MAP_GLSL = /* glsl */ `
uniform sampler2D uRippleMap0, uRippleMap1;
// each level's x: the texel (m), y: 1 / the window's width (m), zw: the window's centre (m)
uniform vec4 uRippleWin0, uRippleWin1;
uniform float uRippleOn;
float rippleWindow(vec2 xz, vec4 win) {
  vec2 d = abs(xz - win.zw);
  float hw = 0.5 / win.y;
  return 1.0 - smoothstep(0.7 * hw, 0.92 * hw, max(d.x, d.y));
}
vec4 rippleDecode(vec4 t) { return vec4((t.r - 0.5) * 4.0, (t.gb - 0.5) * 8.0, 1.0); }
vec4 rippleAt(vec2 xz) {
  if (uRippleOn < 0.5) return vec4(0.0);
  float w0 = rippleWindow(xz, uRippleWin0);
  if (w0 >= 1.0) return rippleDecode(textureLod(uRippleMap0, xz * uRippleWin0.y, 0.0));
  float w1 = rippleWindow(xz, uRippleWin1);
  if (w1 <= 0.0) return vec4(0.0);
  vec4 far = rippleDecode(textureLod(uRippleMap1, xz * uRippleWin1.y, 0.0)) * w1;
  return w0 <= 0.0 ? far : mix(far, rippleDecode(textureLod(uRippleMap0, xz * uRippleWin0.y, 0.0)), w0);
}
`;

/**
 * One level of the ripple field (Terrain's RIPPLE_GLSL: the warped crests, their forks and joins, where they are
 * formed and how lopsided) baked round the player into a texture, once, instead of worked out again for every pixel
 * of the flat every frame: the relief and the slope the shading uses. The window wraps (toroidally): as the player
 * walks it moves in steps, and only the strips it uncovers are baked, a little each frame. Terrain keeps two: a near
 * one at a centimetre and a far one at three.
 */
export class RippleMap {
  /** the texture, and the window (x: the texel, y: 1 / the width, zw: the centre, m) */
  readonly uniforms: { map: IUniform<Texture | null>; win: IUniform<Vector4> };
  private target: WebGLRenderTarget | null = null;
  private n = 0;
  private texel = 0.011;
  /** the global index of the window's first texel (x, z); NaN before the first bake */
  private readonly origin = new Vector2(Number.NaN, Number.NaN);
  /** storage rectangles still to bake: x, y, width, height */
  private queue: [number, number, number, number][] = [];
  private readonly material: ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(fieldGlsl: string, ripRot: IUniform<Vector2>, private readonly level: 0 | 1) {
    this.uniforms = { map: { value: null }, win: { value: new Vector4(0.011, 1, 0, 0) } };
    this.material = new ShaderMaterial({
      name: 'RippleMapBake',
      uniforms: { uRipRot: ripRot, uRippleGain: { value: 1 }, uOrigin: { value: new Vector2() }, uN: { value: 1 }, uTexel: { value: 0.011 } },
      vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec2 uRipRot;
        uniform float uRippleGain;
        uniform vec2 uOrigin;
        uniform float uN, uTexel;
        ${fieldGlsl}
        void main() {
          // this texel's place: the window's texel whose index is the same modulo the window's width
          vec2 s = floor(gl_FragCoord.xy);
          vec2 g = uOrigin + mod(s - mod(uOrigin, uN), uN);
          vec2 rq = rippleFrame((g + 0.5) * uTexel);
          vec4 dis = rippleDisloc(rq);
          float ph = rippleWarp(rq) * RIPPLE_K + dis.x;
          float amp = rippleAmp(rq), size = rippleSize(rq), skew = rippleSkew(rq);
          // the relief (-1 trough … +1 crest) where the ripples are fully formed, less so near a fork's core
          float h = rippleProfile(ph, skew) * amp * size * (1.0 - 0.8 * dis.w);
          // the crest line's direction from the phase gradient (warp and forks): where crests crowd the slope grows
          float e = 0.02;
          vec2 gph = vec2(rippleWarp(rq + vec2(e, 0.0)) - rippleWarp(rq - vec2(e, 0.0)), rippleWarp(rq + vec2(0.0, e)) - rippleWarp(rq - vec2(0.0, e))) / (2.0 * e) * RIPPLE_K + dis.yz;
          float kRel = clamp(length(gph) / RIPPLE_K, 0.4, 1.6);
          vec2 grad = rippleToWorld(normalize(gph + vec2(0.0, 1e-4)));
          // the slope of the profile (the lee side steeper by this stretch's skew), scaled like the relief
          float slope = (cos(ph) + 2.0 * skew * cos(ph * 2.0 + 0.6)) / (1.0 + skew) * amp * (1.0 - 0.85 * dis.w) * kRel * size;
          gl_FragColor = vec4(h * 0.25 + 0.5, grad * slope * 0.125 + 0.5, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** the window's size in texels (0: off) */
  get size(): number {
    return this.n;
  }

  /** The window's size in texels (0: off, as on a flat without ripples). Baked again in full on the next update. */
  setSize(n: number): void {
    if (n === this.n) return;
    this.n = n;
    this.texel = rippleMapTexel(n, this.level);
    this.target?.dispose();
    this.target = null;
    this.uniforms.map.value = null;
    this.invalidate();
  }

  /** Bake the whole window again on the next update (the field changed: another map, the crests turned). */
  invalidate(): void {
    this.origin.set(Number.NaN, Number.NaN);
    this.queue = [];
  }

  /**
   * Per frame: follows the player (`anchor`), baking the strips the window uncovers, at most `budget` texels a frame
   * (a whole new window, the first and after a jump across it, at once).
   */
  update(gl: WebGLRenderer, anchor: Vector3, budget = 1 << 20): void {
    const n = this.n;
    if (!n) return;
    if (!this.target) {
      this.target = new WebGLRenderTarget(n, n, { type: UnsignedByteType, format: RGBAFormat, depthBuffer: false, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter, wrapS: RepeatWrapping, wrapT: RepeatWrapping });
    }
    const tx = Math.round(anchor.x / this.texel) - n / 2, tz = Math.round(anchor.z / this.texel) - n / 2;
    const o = this.origin;
    let full = false;
    if (Number.isNaN(o.x) || Math.abs(tx - o.x) >= n || Math.abs(tz - o.y) >= n) {
      o.set(tx, tz);
      this.queue = [[0, 0, n, n]];
      full = true;
    } else if (Math.abs(tx - o.x) >= STEP || Math.abs(tz - o.y) >= STEP) {
      this.queue.push(...uncoveredStrips(o.x, o.y, tx, tz, n));
      o.set(tx, tz);
    }
    // (a whole new window, on entering the flat or after a jump, is baked at once)
    if (this.queue.length) this.bake(gl, full ? Infinity : budget);
    this.uniforms.win.value.set(this.texel, 1 / (this.texel * n), (o.x + n / 2) * this.texel, (o.y + n / 2) * this.texel);
    this.uniforms.map.value = this.target.texture;
  }

  private bake(gl: WebGLRenderer, budget: number): void {
    const t = this.target!, u = this.material.uniforms;
    u.uOrigin.value.copy(this.origin);
    u.uN.value = this.n;
    u.uTexel.value = this.texel;
    const prev = gl.getRenderTarget();
    t.viewport.set(0, 0, this.n, this.n);
    t.scissorTest = true;
    let left = budget;
    while (this.queue.length && left > 0) {
      const r = this.queue[0];
      // (a large rectangle is baked a band of rows at a time)
      const rows = Math.max(1, Math.min(r[3], Math.floor(left / r[2])));
      t.scissor.set(r[0], r[1], r[2], rows);
      gl.setRenderTarget(t);
      this.quad.render(gl);
      left -= r[2] * rows;
      if (rows >= r[3]) this.queue.shift(); else { r[1] += rows; r[3] -= rows; }
    }
    t.scissorTest = false;
    gl.setRenderTarget(prev);
  }

  dispose(): void {
    this.target?.dispose();
    this.quad.dispose();
    this.material.dispose();
  }
}
