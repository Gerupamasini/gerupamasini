import { HalfFloatType, LinearFilter, RGBAFormat, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderTarget, type IUniform, type PerspectiveCamera, type Texture, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SURF_GLSL, type SurfUniforms } from './Surf';

/** What the sand remembers of the swash, for the water and the sand's shaders. */
export interface SurfMemoryUniforms {
  /** R: the water film left on the sand (glassy, gone in a second or two); G: how saturated the sand is (darker,
   * drying over a minute or so); B: foam carried by the sheet and left on the sand; A: the swash marks (lines of fine
   * bubbles and grit where the fronts stopped) */
  tSurfMem: IUniform<Texture | null>;
  /** xy: the window's centre (world x, z), z: its size (m), w: 1 when there is a memory */
  uMemBox: IUniform<Vector4>;
}

/**
 * GLSL shared by the memory and what reads it (the sand, the water; needs uSurf): how far the memory is trusted at a
 * point of its window, and the sand's usual state where there is no memory — beyond the window, and on ground the
 * window has just moved over — so the one fades into the other and the window never shows on the beach.
 */
export const SURF_MEM_GLSL = /* glsl */ `
// the memory's weight at a point of its window (muv: 0..1 across it): whole about the viewer, gone well inside the
// window's edge (round, so its square never shows; wide, so what the memory knows fades into what is usual)
float surfMemWeight(vec2 muv) { return 1.0 - smoothstep(0.55, 0.92, length(muv - 0.5) * 2.0); }
float swbHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float swbNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(swbHash(i), swbHash(i + vec2(1.0, 0.0)), f.x), mix(swbHash(i + vec2(0.0, 1.0)), swbHash(i + vec2(1.0)), f.x), f.y);
}
// the day's 2 % run-up (m over the still level) on a bed of slope beta (Stockdon et al., as the swash reckons it)
float surfRunup2(float beta) {
  float Hs = max(uSurf.x, 0.02), L0 = 1.5613 * uSurf.y * uSurf.y, HL = Hs * L0, b = clamp(beta, 0.02, 0.25);
  return b / sqrt(Hs / L0) < 0.3 ? 0.043 * sqrt(HL) : 1.1 * (0.35 * b * sqrt(HL) + 0.5 * sqrt(HL * (0.563 * b * b + 0.004)));
}
// the sand's usual state at q, e metres above the still level on a bed of slope beta, for the day's sea: x: the film
// (about the still waterline the sand is just drained of a sheet about half the time; below it, less and less often
// laid bare by the backwash), y: saturation (wet up to about the day's 2 % run-up on this slope; its top edge in lobes
// and tongues)
vec2 surfMemUsual(vec2 q, float e, float beta) {
  float R2 = surfRunup2(beta);
  float h = e + R2 * (0.22 * (swbNoise(q * 0.35 + 3.0) - 0.5) + 0.1 * (swbNoise(q * 1.3 - 1.0) - 0.5));
  float film = 0.55 * (1.0 - smoothstep(0.05 * R2, 0.45 * R2, h)) * (1.0 - smoothstep(0.0, 0.3 * R2 + 0.02, -h));
  return vec2(film, 1.0 - smoothstep(0.55 * R2, 0.95 * R2, h));
}
`;

/** how fast the window follows the viewer (m/s): faster than a run, but turning round slides it over instead of
 * dropping what it held at once */
const SLIDE = 8;

/**
 * The swash's memory on the sand, in a window of the beach about the viewer (40 m across at 4 cm on 高, coarser on the
 * lighter tiers; a light tier updates it every other frame). Each frame, every texel looks at the surf at its point
 * (SURF_GLSL, the same swash the water draws) and at what it held a moment ago — the sand's own state where it is,
 * the foam from where the sheet's water came from, so the foam a sheet carries moves with it, up the beach and back
 * down, drawn out by the backwash as the flow below runs faster than the flow above:
 *  - the film: the water a drained sheet leaves on the sand, a mirror for a second or two before it soaks in;
 *  - saturation: the sand the swash has wet stays dark long after (a minute or so to dry at the top of the swash);
 *  - foam: laid by the climbing front and the collision of an uprush with the last backwash, carried by the sheet,
 *    left on the sand when it drains, its bubbles popping over several seconds;
 *  - swash marks: where a front stopped, a thin line of bubbles and grit that lasts much longer.
 * The window follows the viewer in whole texels, sliding at most SLIDE m/s (what it held is kept as it moves); new
 * ground coming in starts from the sand's usual state (SURF_MEM_GLSL), which is also what the sand shows beyond it.
 */
export class SurfMemory {
  readonly uniforms: SurfMemoryUniforms;
  private readonly targets: [WebGLRenderTarget, WebGLRenderTarget];
  private readonly quad: FullScreenQuad;
  private readonly material: ShaderMaterial;
  private cur = 0;
  private readonly box = new Vector4(0, 0, 40, 0);
  private readonly prevBox = new Vector4(0, 0, 40, 0);
  private acc = 0;
  private frame = 0;
  private readonly fwd = new Vector3();
  /** the window's centre before it is put on whole texels */
  private readonly at = new Vector2();
  private first = true;

  /** `res`: texels across; `size`: metres across; `every`: update every n-th frame */
  constructor(surf: SurfUniforms, readonly res: number, readonly size: number, private every = 1) {
    const mk = () => new WebGLRenderTarget(res, res, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false });
    this.targets = [mk(), mk()];
    this.box.z = this.prevBox.z = size;
    this.uniforms = { tSurfMem: { value: null }, uMemBox: { value: new Vector4(0, 0, size, 0) } };
    this.material = new ShaderMaterial({
      uniforms: {
        tPrev: { value: null as Texture | null }, uBox: { value: this.box }, uPrevBox: { value: this.prevBox },
        uDt: { value: 0 }, uLevel: { value: 0 }, uTime: { value: 0 }, uFirst: { value: 1 },
        uSurf: surf.uSurf, uSurfDir: surf.uSurfDir, tSurfZone: surf.tSurfZone, tSurfAux: surf.tSurfAux, uSurfLv: surf.uSurfLv, uSurfGrid: surf.uSurfGrid,
      },
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tPrev;
        uniform vec4 uBox, uPrevBox;
        uniform float uDt, uLevel, uTime, uFirst;
        varying vec2 vUv;
        ${SURF_GLSL}
        ${SURF_MEM_GLSL}
        void main() {
          vec2 p = uBox.xy + (vUv - 0.5) * uBox.z;
          Surf sf = surfEval(p, uLevel, uTime, true);
          float water = sf.D + sf.eta;                       // the water over the sand here (m)
          float covered = smoothstep(0.0004, 0.0012, water);
          // what the sand held here a moment ago (the window moves; the sand does not)
          vec2 here = (p - uPrevBox.xy) / uPrevBox.z + 0.5;
          bool fresh = uFirst > 0.5 || any(lessThan(here, vec2(0.002))) || any(greaterThan(here, vec2(0.998)));
          // new ground: as the sand usually is (as it is drawn beyond the window), no foam on it yet
          vec4 prev = fresh ? vec4(surfMemUsual(p, -sf.D, surfZoneAt(p).w), 0.0, 0.0) : texture2D(tPrev, here);
          // the foam floats: it is fetched from where the sheet's water was a moment ago (moving up and down the beach
          // with it; the surf further out is left alone). The film, the wet and the swash marks are the sand's own.
          vec2 vel = -uSurfDir.xy * sf.flow * covered * smoothstep(0.3, 0.8, sf.sw);
          vec2 from = (p - vel * uDt - uPrevBox.xy) / uPrevBox.z + 0.5;
          float prevFoam = fresh || any(lessThan(from, vec2(0.002))) || any(greaterThan(from, vec2(0.998))) ? 0.0 : texture2D(tPrev, from).b;
          // (whatever went wrong once must not stay in the memory for good)
          if (any(isnan(prev)) || any(isinf(prev))) prev = vec4(0.0);
          if (isnan(prevFoam) || isinf(prevFoam)) prevFoam = 0.0;
          // the film: the gloss of sand a sheet has just drained from, for a second or two (under deeper water the
          // sand has none of its own: the water's surface is the mirror there)
          float film = max(prev.r * exp(-uDt / 1.4), covered * (1.0 - smoothstep(0.004, 0.02, water)));
          // saturation: the sand dries over a minute or so once the swash stops coming
          float sat = max(prev.g * exp(-uDt / 70.0), covered);
          // foam: the climbing front's band, the collision of an uprush with the last backwash, the last of a bore's
          // roller as it reaches the waterline; carried by the sheet (lasting a few seconds), left on the sand when it
          // drains (its bubbles popping more slowly)
          float src = max(sf.front * mix(0.35, 0.9, sf.swUp), sf.collide * 0.85) * covered * sf.sw;
          src = max(src, sf.roller * (1.0 - smoothstep(0.02, 0.25, sf.D)) * 0.7);
          float foam = max(prevFoam * exp(-uDt / mix(8.0, 3.2, covered)), src);
          // swash marks: where a front stops (its flow turning), a line of fine bubbles and grit
          float stop = (1.0 - sf.swUp) * sf.front * (1.0 - smoothstep(0.05, 0.35, abs(sf.flow))) * sf.sw;
          float mark = max(prev.a * exp(-uDt / mix(45.0, 6.0, covered * (1.0 - stop))), stop * 0.9);
          vec4 m = vec4(film, sat, clamp(foam, 0.0, 1.0), mark);
          gl_FragColor = any(isnan(m)) ? vec4(0.0) : clamp(m, 0.0, 1.0);
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** The update pass's mesh and a target, to compile ahead of the first frame. */
  compileTarget(): { mesh: import('three').Object3D; target: WebGLRenderTarget } {
    return { mesh: (this.quad as unknown as { _mesh: import('three').Object3D })._mesh, target: this.targets[0] };
  }

  /** Move the window with the viewer and advance the memory (call once a frame, before the scene is drawn). */
  update(gl: WebGLRenderer, camera: PerspectiveCamera, level: number, time: number, dt: number): void {
    this.acc += dt;
    if (++this.frame % this.every !== 0 && !this.first) return;
    const step = Math.min(this.acc, 0.1);
    this.acc = 0;
    // centred a little ahead of the viewer, on the ground they look at, gliding there (jumping only on a move far
    // beyond the window, where nothing it held is still in view); in whole texels
    camera.getWorldDirection(this.fwd);
    const ahead = this.size * 0.22, tex = this.size / this.res;
    const tx = camera.position.x + this.fwd.x * ahead, tz = camera.position.z + this.fwd.z * ahead;
    const far = Math.hypot(tx - this.at.x, tz - this.at.y);
    if (this.first || far > this.size) this.at.set(tx, tz);
    else if (far > 0) { const k = Math.min(1, (SLIDE * step) / far); this.at.x += (tx - this.at.x) * k; this.at.y += (tz - this.at.y) * k; }
    const cx = Math.round(this.at.x / tex) * tex, cz = Math.round(this.at.y / tex) * tex;
    this.prevBox.copy(this.box);
    this.box.set(cx, cz, this.size, 1);
    const u = this.material.uniforms;
    u.tPrev.value = this.targets[this.cur].texture;
    u.uDt.value = step;
    u.uLevel.value = level;
    u.uTime.value = time;
    u.uFirst.value = this.first ? 1 : 0;
    const next = 1 - this.cur;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(this.targets[next]);
    this.quad.render(gl);
    gl.setRenderTarget(prev);
    this.cur = next;
    this.first = false;
    this.uniforms.tSurfMem.value = this.targets[this.cur].texture;
    this.uniforms.uMemBox.value.copy(this.box);
  }

  dispose(): void {
    this.targets[0].dispose();
    this.targets[1].dispose();
    this.quad.dispose();
    this.material.dispose();
  }
}
