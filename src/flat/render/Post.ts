import {
  HalfFloatType, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, Vector2, AdditiveBlending,
  WebGLRenderTarget, type Texture, type WebGLRenderer,
} from 'three';

/**
 * HDR → screen: dual-filter bloom (after hai-no-michi's post.js), exposure, a filmic curve (AgX, with a little
 * contrast and saturation back, the way a phone camera renders a bright beach), a light grade (cool shadows,
 * warm highlights), lens vignette and fine grain with dither. Without any of these the frame looks like CG.
 */
const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function target(w: number, h: number): WebGLRenderTarget {
  return new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
}

export interface PostParams {
  exposure: number;
  bloom: number;
  time: number;
  /** 0 AgX-based (default), 1 ACES fitted */
  curve: number;
}

export class Post {
  private readonly quad = new Mesh(new PlaneGeometry(2, 2));
  private readonly scene = new Scene();
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private chain: WebGLRenderTarget[] = [];
  private readonly down: ShaderMaterial;
  private readonly up: ShaderMaterial;
  private readonly final: ShaderMaterial;

  constructor(private readonly renderer: WebGLRenderer, private readonly levels = 6) {
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.down = new ShaderMaterial({
      vertexShader: VERT, depthTest: false, depthWrite: false,
      uniforms: { uTex: { value: null }, uTexel: { value: new Vector2() }, uThresh: { value: 1.0 }, uFirst: { value: 0 } },
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThresh; uniform float uFirst; varying vec2 vUv;
        vec3 tap(vec2 o) {
          vec3 c = min(texture2D(uTex, vUv + o * uTexel).rgb, vec3(400.0));
          if (uFirst > 0.5) { float l = max(c.r, max(c.g, c.b)); c *= max(l - uThresh, 0.0) / max(l, 1e-4); }
          return c;
        }
        void main() {
          vec3 c = tap(vec2(0.0)) * 4.0 + tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
          gl_FragColor = vec4(c / 8.0, 1.0);
        }`,
    });
    this.up = new ShaderMaterial({
      vertexShader: VERT, depthTest: false, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTex: { value: null }, uTexel: { value: new Vector2() } },
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(uTex, vUv + vec2(-2.0, 0.0) * uTexel).rgb + texture2D(uTex, vUv + vec2(2.0, 0.0) * uTexel).rgb
                 + texture2D(uTex, vUv + vec2(0.0, -2.0) * uTexel).rgb + texture2D(uTex, vUv + vec2(0.0, 2.0) * uTexel).rgb;
          c += (texture2D(uTex, vUv + vec2(-1.0, -1.0) * uTexel).rgb + texture2D(uTex, vUv + vec2(1.0, -1.0) * uTexel).rgb
              + texture2D(uTex, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture2D(uTex, vUv + vec2(1.0, 1.0) * uTexel).rgb) * 2.0;
          gl_FragColor = vec4(c / 12.0, 1.0);
        }`,
    });
    this.final = new ShaderMaterial({
      vertexShader: VERT, depthTest: false, depthWrite: false,
      uniforms: {
        uTex: { value: null }, uBloom: { value: null }, uExposure: { value: 1 }, uBloomK: { value: 0.06 }, uTime: { value: 0 },
        uRes: { value: new Vector2(1, 1) }, uCurve: { value: 0 },
      },
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex, uBloom; uniform float uExposure, uBloomK, uTime, uCurve; uniform vec2 uRes; varying vec2 vUv;
        const mat3 SRGB_TO_2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
        const mat3 R2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
        vec3 agxContrast(vec3 x) { vec3 x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
        vec3 agx(vec3 c) {
          const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
          const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
          c = inset * (SRGB_TO_2020 * c);
          c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.500999, 0.0, 1.0);
          c = agxContrast(c);
          c = outset * c;
          c = pow(max(c, 0.0), vec3(2.2));
          return clamp(R2020_TO_SRGB * c, 0.0, 1.0);
        }
        vec3 aces(vec3 c) {
          const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
          const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
          vec3 v = inM * c;
          vec3 a = v * (v + 0.0245786) - 0.000090537, b = v * (0.983729 * v + 0.4329510) + 0.238081;
          return clamp(outM * (a / b), 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() {
          vec3 c = texture2D(uTex, vUv).rgb;
          c += texture2D(uBloom, vUv).rgb * uBloomK;
          c *= uExposure;
          // lens vignette (natural cos^4 falloff, softened)
          vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
          c *= mix(1.0, 0.82, smoothstep(0.25, 1.05, dot(q, q) * 1.6));
          vec3 m = uCurve < 0.5 ? agx(c) : aces(c);
          // a phone camera's rendering: contrast and saturation lifted a little, cool shadows, warm highlights
          float l = dot(m, vec3(0.2126, 0.7152, 0.0722));
          m = mix(vec3(l), m, uCurve < 0.5 ? 1.12 : 0.94);
          m = mix(m * vec3(0.97, 1.0, 1.035), m * vec3(1.02, 1.0, 0.975), smoothstep(0.15, 0.75, l));
          m = clamp(m, 0.0, 1.0);
          vec3 s = toSRGB(m);
          s = (s - 0.5) * 1.06 + 0.5;
          // grain and dither
          float g = h12(gl_FragCoord.xy + fract(uTime * 13.0) * 97.0) - 0.5;
          s += g * (0.012 + 0.01 * (1.0 - l));
          gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
        }`,
    });
  }

  setSize(w: number, h: number): void {
    for (const t of this.chain) t.dispose();
    this.chain = [];
    let cw = w, ch = h;
    for (let i = 0; i < this.levels; i++) {
      cw = Math.max(2, cw >> 1);
      ch = Math.max(2, ch >> 1);
      this.chain.push(target(cw, ch));
    }
    (this.final.uniforms.uRes.value as Vector2).set(w, h);
  }

  private pass(mat: ShaderMaterial, src: Texture, dst: WebGLRenderTarget | null): void {
    mat.uniforms.uTex.value = src;
    this.quad.material = mat;
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.scene, this.cam);
  }

  render(input: WebGLRenderTarget, p: PostParams): void {
    // (input may be any HDR target: the water composite or the TAA history)
    const r = this.renderer;
    let src: WebGLRenderTarget = input;
    for (let i = 0; i < this.chain.length; i++) {
      const d = this.chain[i];
      (this.down.uniforms.uTexel.value as Vector2).set(1 / src.width, 1 / src.height);
      this.down.uniforms.uFirst.value = i === 0 ? 1 : 0;
      this.down.uniforms.uThresh.value = 1.6 / Math.max(p.exposure, 1e-3);
      this.pass(this.down, src.texture, d);
      src = d;
    }
    const ac = r.autoClear;
    r.autoClear = false;
    for (let i = this.chain.length - 1; i > 0; i--) {
      (this.up.uniforms.uTexel.value as Vector2).set(1 / this.chain[i].width, 1 / this.chain[i].height);
      this.pass(this.up, this.chain[i].texture, this.chain[i - 1]);
    }
    r.autoClear = ac;
    const f = this.final.uniforms;
    f.uBloom.value = this.chain[0]?.texture ?? null;
    f.uExposure.value = p.exposure;
    f.uBloomK.value = p.bloom;
    f.uTime.value = p.time;
    f.uCurve.value = p.curve;
    this.pass(this.final, input.texture, null);
  }
}
