import {
  BufferGeometry, CustomBlending, Float32BufferAttribute, HalfFloatType, LinearFilter, Mesh, NoBlending, OneFactor, OrthographicCamera,
  RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget, type Texture, type WebGLRenderer,
} from 'three';

const TRI_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** The finished HDR frame (the scene with the water and the glass drawn in). */
const MERGE = /* glsl */ `
uniform sampler2D uScene;
vec3 merged(vec2 uv) { return texture2D(uScene, uv).rgb; }
`;

/**
 * Bloom (a mip chain down and back up, after Jimenez's Call of Duty filters), then the frame: the merged image,
 * sharpened when it was drawn smaller than the screen, the bloom, exposure and ACES, a light grade, a vignette, sRGB,
 * a little film grain that also dithers the gradients of the dark room.
 */
export class TankPost {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mesh: Mesh;
  private readonly prefilter: ShaderMaterial;
  private readonly down: ShaderMaterial;
  private readonly up: ShaderMaterial;
  readonly final: ShaderMaterial;
  private levels: WebGLRenderTarget[] = [];
  private readonly size = new Vector2(-1, -1);
  bloom = true;

  constructor(private readonly floatRT: boolean) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const texel = { value: new Vector2(1, 1) };
    this.prefilter = new ShaderMaterial({
      name: 'TankBloomPrefilter', vertexShader: TRI_VERT, depthTest: false, depthWrite: false, blending: NoBlending,
      uniforms: { uScene: { value: null }, uTexel: { value: new Vector2() }, uThreshold: { value: 1.1 }, uKnee: { value: 0.6 } },
      fragmentShader: MERGE + /* glsl */ `
        uniform vec2 uTexel;
        uniform float uThreshold, uKnee;
        varying vec2 vUv;
        vec3 karis(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
        void main() {
          // four bilinear taps cover the 4x4 source texels; each weighted down by its brightness so a lone glint
          // does not flicker as a big blob
          vec3 a = merged(vUv + uTexel * vec2(-1.0, -1.0)), b = merged(vUv + uTexel * vec2(1.0, -1.0));
          vec3 c = merged(vUv + uTexel * vec2(-1.0, 1.0)), d = merged(vUv + uTexel * vec2(1.0, 1.0));
          float wa = 1.0 / (1.0 + max(a.r, max(a.g, a.b))), wb = 1.0 / (1.0 + max(b.r, max(b.g, b.b)));
          float wc = 1.0 / (1.0 + max(c.r, max(c.g, c.b))), wd = 1.0 / (1.0 + max(d.r, max(d.g, d.b)));
          vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
          float br = max(col.r, max(col.g, col.b));
          float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
          soft = soft * soft / (4.0 * uKnee + 1e-4);
          col *= max(soft, br - uThreshold) / max(br, 1e-4);
          gl_FragColor = vec4(max(col, 0.0), 1.0);
        }`,
    });
    this.down = new ShaderMaterial({
      name: 'TankBloomDown', vertexShader: TRI_VERT, depthTest: false, depthWrite: false, blending: NoBlending,
      uniforms: { uTex: { value: null }, uTexel: texel },
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform vec2 uTexel;
        varying vec2 vUv;
        vec3 s(vec2 o) { return texture2D(uTex, vUv + o * uTexel).rgb; }
        void main() {
          vec3 c = s(vec2(0.0)) * 0.125;
          c += (s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0))) * 0.125;
          c += (s(vec2(-2.0, 0.0)) + s(vec2(2.0, 0.0)) + s(vec2(0.0, -2.0)) + s(vec2(0.0, 2.0))) * 0.0625;
          c += (s(vec2(-2.0, -2.0)) + s(vec2(2.0, -2.0)) + s(vec2(-2.0, 2.0)) + s(vec2(2.0, 2.0))) * 0.03125;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.up = new ShaderMaterial({
      name: 'TankBloomUp', vertexShader: TRI_VERT, depthTest: false, depthWrite: false,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor,
      uniforms: { uTex: { value: null }, uTexel: { value: new Vector2() }, uWeight: { value: 1 } },
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform vec2 uTexel;
        uniform float uWeight;
        varying vec2 vUv;
        vec3 s(vec2 o) { return texture2D(uTex, vUv + o * uTexel).rgb; }
        void main() {
          vec3 c = s(vec2(0.0)) * 4.0;
          c += (s(vec2(-1.0, 0.0)) + s(vec2(1.0, 0.0)) + s(vec2(0.0, -1.0)) + s(vec2(0.0, 1.0))) * 2.0;
          c += s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0));
          gl_FragColor = vec4(c / 16.0 * uWeight, 1.0);
        }`,
    });
    this.final = new ShaderMaterial({
      name: 'TankFinal', vertexShader: TRI_VERT, depthTest: false, depthWrite: false, blending: NoBlending,
      defines: { BLOOM: 1 },
      uniforms: {
        uScene: { value: null }, uBloom: { value: null }, uTexel: { value: new Vector2() },
        uBloomK: { value: 0.12 }, uExposure: { value: 1 }, uSharpen: { value: 0 }, uGrain: { value: 0.012 }, uTime: { value: 0 },
        uAspect: { value: 1 }, uVignette: { value: 0.32 },
      },
      fragmentShader: MERGE + /* glsl */ `
        uniform sampler2D uBloom;
        uniform vec2 uTexel;
        uniform float uBloomK, uExposure, uSharpen, uGrain, uTime, uAspect, uVignette;
        varying vec2 vUv;
        vec3 rrtOdt(vec3 v) { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
        vec3 aces(vec3 c) {
          const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
          const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
          return clamp(outM * rrtOdt(inM * c), 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        void main() {
          vec3 c = merged(vUv);
          if (uSharpen > 0.0) {
            // contrast-adaptive sharpening of the upscaled frame, kept within the neighbours' range (no halos)
            vec3 n = merged(vUv + vec2(0.0, uTexel.y)), s = merged(vUv - vec2(0.0, uTexel.y));
            vec3 e = merged(vUv + vec2(uTexel.x, 0.0)), w = merged(vUv - vec2(uTexel.x, 0.0));
            vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
            c = clamp(c + (4.0 * c - n - s - e - w) * 0.25 * uSharpen, mn, mx);
          }
          #if BLOOM
          c += texture2D(uBloom, vUv).rgb * uBloomK;
          #endif
          c = aces(c * uExposure);
          // the grade: the deep shadows of the night room lean a touch to teal, the mid tones keep their colour
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(c, c * vec3(0.92, 1.0, 1.06), (1.0 - smoothstep(0.0, 0.35, l)) * 0.6);
          c = mix(vec3(l), c, 1.06);
          vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
          c *= mix(1.0 - uVignette, 1.0, smoothstep(1.2, 0.35, length(q)));
          c = toSRGB(max(c, 0.0));
          float g = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5;
          c += g * (uGrain * (1.0 - l * 0.6) + 1.0 / 255.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mesh = new Mesh(geo, this.final);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  private resize(w: number, h: number): void {
    if (this.size.x === w && this.size.y === h) return;
    this.size.set(w, h);
    for (const rt of this.levels) rt.dispose();
    this.levels = [];
    let lw = Math.max(1, w >> 1), lh = Math.max(1, h >> 1);
    for (let i = 0; i < 6 && lw >= 4 && lh >= 4; i++) {
      this.levels.push(new WebGLRenderTarget(lw, lh, { type: this.floatRT ? HalfFloatType : UnsignedByteType, format: RGBAFormat, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false }));
      lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1);
    }
  }

  private draw(gl: WebGLRenderer, m: ShaderMaterial, target: WebGLRenderTarget | null): void {
    this.mesh.material = m;
    gl.setRenderTarget(target);
    gl.render(this.scene, this.camera);
  }

  /** The frame to the screen from the HDR frame at the internal resolution. */
  render(gl: WebGLRenderer, scene: Texture, w: number, h: number, opts: { exposure: number; sharpen: number; time: number; aspect: number }): void {
    const f = this.final.uniforms;
    if (this.bloom) {
      this.resize(w, h);
      const p = this.prefilter.uniforms;
      p.uScene.value = scene; p.uTexel.value.set(1 / w, 1 / h);
      this.draw(gl, this.prefilter, this.levels[0]);
      for (let i = 1; i < this.levels.length; i++) {
        const src = this.levels[i - 1];
        this.down.uniforms.uTex.value = src.texture;
        this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.draw(gl, this.down, this.levels[i]);
      }
      for (let i = this.levels.length - 1; i > 0; i--) {
        const src = this.levels[i];
        this.up.uniforms.uTex.value = src.texture;
        this.up.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.up.uniforms.uWeight.value = 0.85;
        this.draw(gl, this.up, this.levels[i - 1]);
      }
      f.uBloom.value = this.levels[0].texture;
    }
    if ((this.final.defines.BLOOM === 1) !== this.bloom) { this.final.defines.BLOOM = this.bloom ? 1 : 0; this.final.needsUpdate = true; }
    f.uScene.value = scene;
    f.uTexel.value.set(1 / w, 1 / h);
    f.uExposure.value = opts.exposure; f.uSharpen.value = opts.sharpen; f.uTime.value = opts.time; f.uAspect.value = opts.aspect;
    this.draw(gl, this.final, null);
  }

  dispose(): void {
    for (const rt of this.levels) rt.dispose();
    this.levels = [];
    for (const m of [this.prefilter, this.down, this.up, this.final]) m.dispose();
    this.mesh.geometry.dispose();
  }
}
