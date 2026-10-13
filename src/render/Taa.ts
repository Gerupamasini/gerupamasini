import { HalfFloatType, LinearFilter, Matrix4, RGBAFormat, ShaderMaterial, Vector2, WebGLRenderTarget, type PerspectiveCamera, type Texture, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Halton (2, 3): the sub-pixel offsets, 16 of them, each in -0.5..0.5 */
function halton(i: number, b: number): number {
  let f = 1, r = 0;
  for (let n = i; n > 0; n = Math.floor(n / b)) { f /= b; r += f * (n % b); }
  return r;
}
const JITTER: [number, number][] = Array.from({ length: 16 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

const RESOLVE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tCurrent, tHistory, tDepth;
  uniform mat4 uInvViewProj, uPrevViewProj;
  uniform vec2 uRes;
  uniform float uBlend, uReset;

  // the neighbourhood is compared in YCoCg, where a box around the colours fits them tighter
  vec3 toYCoCg(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
  vec3 fromYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }

  // history read with a 5-tap Catmull-Rom (sharper than bilinear: no blur builds up frame after frame)
  vec3 historyAt(vec2 uv) {
    vec2 pos = uv * uRes, c = floor(pos - 0.5) + 0.5, f = pos - c;
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
    vec2 w12 = w1 + w2, t0 = (c - 1.0) / uRes, t3 = (c + 2.0) / uRes, t12 = (c + w2 / w12) / uRes;
    vec3 r = texture2D(tHistory, vec2(t12.x, t0.y)).rgb * w12.x * w0.y
      + texture2D(tHistory, vec2(t0.x, t12.y)).rgb * w0.x * w12.y
      + texture2D(tHistory, t12).rgb * w12.x * w12.y
      + texture2D(tHistory, vec2(t3.x, t12.y)).rgb * w3.x * w12.y
      + texture2D(tHistory, vec2(t12.x, t3.y)).rgb * w12.x * w3.y;
    float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
    return max(r / wsum, 0.0);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    ivec2 p = ivec2(gl_FragCoord.xy), hi = ivec2(uRes) - 1;
    vec3 cur = texelFetch(tCurrent, p, 0).rgb;
    // the colours around: their mean and spread (variance clipping), and the nearest depth (edges follow the
    // foreground, so a fish against the bed does not leave a trail)
    vec3 m1 = vec3(0.0), m2 = vec3(0.0);
    float dNear = 1.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      ivec2 q = clamp(p + ivec2(x, y), ivec2(0), hi);
      vec3 c = toYCoCg(texelFetch(tCurrent, q, 0).rgb);
      m1 += c; m2 += c * c;
      dNear = min(dNear, texelFetch(tDepth, q, 0).r);
    }
    m1 /= 9.0; m2 /= 9.0;
    vec3 sigma = sqrt(max(m2 - m1 * m1, 0.0));
    // where this pixel was on the last frame (the camera's motion; the animals' own is left to the clipping)
    vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, dNear * 2.0 - 1.0, 1.0);
    w /= w.w;
    vec4 pc = uPrevViewProj * w;
    vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
    bool off = any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0))) || pc.w <= 0.0;
    vec3 hist = toYCoCg(historyAt(puv));
    hist = clamp(hist, m1 - 1.25 * sigma, m1 + 1.25 * sigma);
    // (more of the new frame where it moved the history far: less smear when the camera turns fast)
    float speed = length((puv - uv) * uRes);
    float a = (off || uReset > 0.5) ? 1.0 : mix(uBlend, 0.5, clamp(speed / 40.0, 0.0, 1.0));
    gl_FragColor = vec4(fromYCoCg(mix(hist, toYCoCg(cur), a)), 1.0);
  }
`;

/**
 * Temporal anti-aliasing for the field: the camera is moved by a sub-pixel offset each frame (Halton 2, 3) and each
 * new frame is blended into the history, reprojected by the depth and the camera's motion and clipped to the new
 * frame's neighbourhood. Works on the finished (tone-mapped) picture at the size the view is drawn at, before FSR 1.
 */
export class Taa {
  private targets: [WebGLRenderTarget | null, WebGLRenderTarget | null] = [null, null];
  private cur = 0;
  private frame = 0;
  private reset = true;
  private readonly quad = new FullScreenQuad();
  private readonly material = new ShaderMaterial({
    name: 'TaaResolve',
    uniforms: {
      tCurrent: { value: null }, tHistory: { value: null }, tDepth: { value: null },
      uInvViewProj: { value: new Matrix4() }, uPrevViewProj: { value: new Matrix4() },
      uRes: { value: new Vector2(1, 1) }, uBlend: { value: 0.1 }, uReset: { value: 1 },
    },
    vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: RESOLVE_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly prevViewProj = new Matrix4();
  private readonly viewProj = new Matrix4();
  private readonly lastPos = new Vector2();
  private lastY = 0;

  constructor() {
    this.quad.material = this.material;
  }

  /** Forget the history (a cut: a teleport, another scene). */
  invalidate(): void {
    this.reset = true;
  }

  /**
   * Moves the camera's frustum by this frame's sub-pixel offset (`w` × `h`: the size the view is drawn at). Undone by
   * `unjitter` once the view is drawn.
   */
  jitter(camera: PerspectiveCamera, w: number, h: number): void {
    const [jx, jy] = JITTER[this.frame % JITTER.length];
    camera.setViewOffset(w, h, jx, jy, w, h);
  }

  unjitter(camera: PerspectiveCamera): void {
    camera.clearViewOffset();
  }

  /**
   * Blends `current` (the finished picture, `w` × `h`) into the history and returns the result. `depth` is the scene's
   * depth at the same size; the camera unjittered.
   */
  resolve(gl: WebGLRenderer, current: Texture, depth: Texture, camera: PerspectiveCamera, w: number, h: number): Texture {
    const out = this.target(1 - this.cur, w, h);
    const history = this.targets[this.cur];
    camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // a jump (a teleport): no history to speak of
    const p = camera.position;
    if (Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.y, p.y - this.lastY) > 3) this.reset = true;
    this.lastPos.set(p.x, p.z);
    this.lastY = p.y;
    const u = this.material.uniforms;
    u.tCurrent.value = current;
    u.tHistory.value = history ? history.texture : current;
    u.tDepth.value = depth;
    (u.uInvViewProj.value as Matrix4).copy(this.viewProj).invert();
    (u.uPrevViewProj.value as Matrix4).copy(this.reset ? this.viewProj : this.prevViewProj);
    (u.uRes.value as Vector2).set(w, h);
    u.uReset.value = this.reset || !history ? 1 : 0;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(out);
    this.quad.render(gl);
    gl.setRenderTarget(prev);
    this.prevViewProj.copy(this.viewProj);
    this.cur = 1 - this.cur;
    this.frame++;
    this.reset = false;
    return out.texture;
  }

  /** The history targets: one is read while the other is written; a new size makes a new one, the old still read. */
  private target(i: number, w: number, h: number): WebGLRenderTarget {
    let t = this.targets[i];
    if (!t || t.width !== w || t.height !== h) {
      t?.dispose();
      t = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
      this.targets[i] = t;
    }
    return t;
  }

  dispose(): void {
    for (const t of this.targets) t?.dispose();
    this.targets = [null, null];
    this.quad.dispose();
    this.material.dispose();
  }
}
