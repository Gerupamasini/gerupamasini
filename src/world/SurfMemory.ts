import { HalfFloatType, LinearFilter, RGBAFormat, ShaderMaterial, Vector3, Vector4, WebGLRenderTarget, type IUniform, type PerspectiveCamera, type Texture, type WebGLRenderer } from 'three';
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
 * The swash's memory on the sand, in a window of the beach about the viewer (40 m across at 4 cm on 高, coarser on the
 * lighter tiers; a light tier updates it every other frame). Each frame, every texel looks at the surf at its point
 * (SURF_GLSL, the same swash the water draws) and at what it held a moment ago — fetched from where the sheet's
 * water came from, so the foam a sheet carries moves with it, up the beach and back down, drawn out by the backwash
 * as the flow below runs faster than the flow above:
 *  - the film: the water a drained sheet leaves on the sand, a mirror for a second or two before it soaks in;
 *  - saturation: the sand the swash has wet stays dark long after (a minute or so to dry at the top of the swash);
 *  - foam: laid by the climbing front and the collision of an uprush with the last backwash, carried by the sheet,
 *    left on the sand when it drains, its bubbles popping over several seconds;
 *  - swash marks: where a front stopped, a thin line of bubbles and grit that lasts much longer.
 * The window follows the viewer in whole texels (what it held is kept as it moves); new ground coming in starts from
 * the band the swash usually reaches.
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
        void main() {
          vec2 p = uBox.xy + (vUv - 0.5) * uBox.z;
          Surf sf = surfEval(p, uLevel, uTime, true);
          float water = sf.D + sf.eta;                       // the water over the sand here (m)
          float covered = smoothstep(0.0004, 0.0012, water);
          // where the sheet's water was a moment ago (it moves up and down the beach; the surf further out is left alone)
          vec2 vel = -uSurfDir.xy * sf.flow * covered * smoothstep(0.3, 0.8, sf.sw);
          vec2 q = p - vel * uDt;
          vec2 puv = (q - uPrevBox.xy) / uPrevBox.z + 0.5;
          vec4 prev;
          if (uFirst > 0.5 || any(lessThan(puv, vec2(0.002))) || any(greaterThan(puv, vec2(0.998)))) {
            // new ground: saturated where the swash usually reaches, nothing on it yet
            float Hs = uSurf.x, L0 = 1.5613 * uSurf.y * uSurf.y, b = clamp(surfZoneAt(p).w, 0.02, 0.2);
            float R2 = 1.1 * (0.35 * b * sqrt(Hs * L0) + 0.5 * sqrt(Hs * L0 * (0.563 * b * b + 0.004)));
            prev = vec4(0.0, 1.0 - smoothstep(0.55 * R2, 0.95 * R2, -sf.D), 0.0, 0.0);
          } else prev = texture2D(tPrev, puv);
          // the film: glassy while the sheet is on it and for a second or two after it drains
          float film = max(prev.r * exp(-uDt / 1.4), covered);
          // saturation: the sand dries over a minute or so once the swash stops coming
          float sat = max(prev.g * exp(-uDt / 70.0), covered);
          // foam: the climbing front's band, the collision of an uprush with the last backwash, the last of a bore's
          // roller as it reaches the waterline; carried by the sheet (lasting a few seconds), left on the sand when it
          // drains (its bubbles popping more slowly)
          float src = max(sf.front * mix(0.35, 0.9, sf.swUp), sf.collide * 0.85) * covered * sf.sw;
          src = max(src, sf.roller * (1.0 - smoothstep(0.02, 0.25, sf.D)) * 0.7);
          float foam = max(prev.b * exp(-uDt / mix(8.0, 3.2, covered)), src);
          // swash marks: where a front stops (its flow turning), a line of fine bubbles and grit
          float stop = (1.0 - sf.swUp) * sf.front * (1.0 - smoothstep(0.05, 0.35, abs(sf.flow))) * sf.sw;
          float mark = max(prev.a * exp(-uDt / mix(45.0, 6.0, covered * (1.0 - stop))), stop * 0.9);
          gl_FragColor = vec4(film, sat, clamp(foam, 0.0, 1.0), mark);
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
    // centred a little ahead of the viewer, on the ground they look at; in whole texels
    camera.getWorldDirection(this.fwd);
    const ahead = this.size * 0.22, tex = this.size / this.res;
    const cx = Math.round((camera.position.x + this.fwd.x * ahead) / tex) * tex, cz = Math.round((camera.position.z + this.fwd.z * ahead) / tex) * tex;
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
