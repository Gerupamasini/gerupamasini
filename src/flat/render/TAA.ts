import { HalfFloatType, LinearFilter, Matrix4, RGBAFormat, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, type PerspectiveCamera, type Texture, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Temporal anti-aliasing: every frame the projection is jittered by a sub-pixel offset (Halton 2,3); the frame is
 * blended with the previous result reprojected through the depth buffer, and the history is clipped to the colour
 * range of the current pixel's neighbourhood (YCoCg) so moving water and the walker's own motion do not smear.
 * The procedural detail (ripple marks, grains, the glitter on the water) converges instead of shimmering.
 */
const halton = (i: number, b: number) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

export class TAA {
  private targets: [WebGLRenderTarget, WebGLRenderTarget];
  private readIdx = 0;
  private frame = 0;
  private readonly material: ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly prevViewProj = new Matrix4();
  private readonly viewProj = new Matrix4();
  private readonly invViewProj = new Matrix4();
  private valid = false;
  readonly jitter = new Vector2();

  constructor(private readonly renderer: WebGLRenderer, w: number, h: number) {
    this.targets = [this.make(w, h), this.make(w, h)];
    this.material = new ShaderMaterial({
      uniforms: {
        tCur: { value: null }, tHist: { value: null }, tDepth: { value: null },
        uInvViewProj: { value: new Matrix4() }, uPrevViewProj: { value: new Matrix4() }, uCamPos: { value: new Vector3() },
        uTexel: { value: new Vector2() }, uJitter: { value: new Vector2() }, uValid: { value: 0 }, uAlpha: { value: 0.1 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tCur, tHist;
        uniform highp sampler2D tDepth;
        uniform mat4 uInvViewProj, uPrevViewProj;
        uniform vec3 uCamPos;
        uniform vec2 uTexel, uJitter;
        uniform float uValid, uAlpha;
        varying vec2 vUv;
        vec3 toYCoCg(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
        vec3 fromYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
        // tone-mapped weights keep fireflies (sun glints) from dominating the blend
        vec3 tm(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
        vec3 itm(vec3 c) { return c / max(1.0 - max(c.r, max(c.g, c.b)), 1e-3); }
        void main() {
          vec3 cur = tm(texture2D(tCur, vUv).rgb);
          if (uValid < 0.5) { gl_FragColor = vec4(itm(cur), 1.0); return; }
          // neighbourhood: mean and deviation in YCoCg (variance clipping)
          vec3 m1 = vec3(0.0), m2 = vec3(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec3 c = toYCoCg(tm(texture2D(tCur, vUv + vec2(float(i), float(j)) * uTexel).rgb));
            m1 += c; m2 += c * c;
          }
          m1 /= 9.0; m2 /= 9.0;
          vec3 sd = sqrt(max(m2 - m1 * m1, 0.0));
          vec3 lo = m1 - sd * 1.25, hi = m1 + sd * 1.25;
          // reproject: the ground point under this pixel (or the sky direction) as the previous frame saw it
          float d = texture2D(tDepth, vUv).r;
          vec4 ndc = vec4(vUv * 2.0 - 1.0, (d >= 0.99999 ? 0.9999999 : d) * 2.0 - 1.0, 1.0);
          vec4 wp = uInvViewProj * ndc; wp /= wp.w;
          vec4 pc = uPrevViewProj * vec4(wp.xyz, 1.0);
          vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
          float off = any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0))) ? 1.0 : 0.0;
          vec3 hist = toYCoCg(tm(texture2D(tHist, puv).rgb));
          // clip toward the neighbourhood mean
          vec3 c = hist - m1;
          vec3 e = max(hi - m1, vec3(1e-4));
          vec3 u = abs(c / e);
          float mx = max(u.x, max(u.y, u.z));
          if (mx > 1.0) hist = m1 + c / mx;
          float a = mix(uAlpha, 1.0, off);
          vec3 outc = fromYCoCg(mix(hist, toYCoCg(cur), a));
          gl_FragColor = vec4(itm(max(outc, 0.0)), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  private make(w: number, h: number): WebGLRenderTarget {
    return new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
  }

  setSize(w: number, h: number): void {
    for (const t of this.targets) t.setSize(w, h);
    this.valid = false;
  }

  /** Jitter the camera for this frame (call before rendering the scene). */
  begin(camera: PerspectiveCamera, w: number, h: number): void {
    this.frame = (this.frame + 1) % 16;
    this.jitter.set(halton(this.frame + 1, 2) - 0.5, halton(this.frame + 1, 3) - 0.5);
    camera.setViewOffset(w, h, this.jitter.x, this.jitter.y, w, h);
    camera.updateMatrixWorld();
  }

  /** Resolve this frame against the history; returns the texture to show. */
  resolve(current: Texture, depth: Texture, camera: PerspectiveCamera): WebGLRenderTarget {
    const u = this.material.uniforms;
    const write = this.targets[1 - this.readIdx], read = this.targets[this.readIdx];
    // the jittered view-projection of this frame for the reconstruction
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.invViewProj.copy(this.viewProj).invert();
    u.tCur.value = current;
    u.tHist.value = read.texture;
    u.tDepth.value = depth;
    u.uInvViewProj.value.copy(this.invViewProj);
    u.uPrevViewProj.value.copy(this.prevViewProj);
    (u.uTexel.value as Vector2).set(1 / write.width, 1 / write.height);
    u.uValid.value = this.valid ? 1 : 0;
    this.renderer.setRenderTarget(write);
    this.quad.render(this.renderer);
    this.readIdx = 1 - this.readIdx;
    this.valid = true;
    // the next frame reprojects into this frame's unjittered view
    camera.clearViewOffset();
    camera.updateMatrixWorld();
    this.prevViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    return write;
  }

  /** Forget the history (a teleport, a change of time or tide). */
  reset(): void {
    this.valid = false;
  }
}
