import { LinearFilter, NearestFilter, RGBAFormat, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget, type Texture, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { createEasuMaterial, createRcasMaterial } from './Fsr';

/** The plain scaling up FSR replaces (the browser's own, in effect), for comparisons. */
function createBilinearMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'UpscaleBilinear',
    uniforms: { tInput: { value: null }, uOutSize: { value: new Vector2(1, 1) } },
    vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tInput;
      uniform vec2 uOutSize;
      void main() { gl_FragColor = vec4(texture2D(tInput, gl_FragCoord.xy / uOutSize).rgb, 1.0); }
    `,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

const ldr = (w: number, h: number, filter: typeof LinearFilter | typeof NearestFilter) =>
  new WebGLRenderTarget(w, h, { type: UnsignedByteType, format: RGBAFormat, depthBuffer: false, generateMipmaps: false, minFilter: filter, magFilter: filter });

/**
 * The end of the field's picture when it is drawn smaller than the screen: the water composite writes the finished
 * picture (tone mapped, sRGB-encoded) into `input()` at the view's size; EASU scales it up to the drawing buffer and
 * RCAS sharpens it onto the screen. FSR 1 works on such perceptual colour.
 */
export class Upscaler {
  private src: WebGLRenderTarget | null = null;
  private up: WebGLRenderTarget | null = null;
  private readonly quad = new FullScreenQuad();
  private readonly easu = createEasuMaterial();
  private readonly rcas = createRcasMaterial(0.25);
  private readonly bilinear = createBilinearMaterial();
  private readonly out = new Vector2();
  /** 'bilinear': the plain scaling up instead of FSR (to compare) */
  mode: 'fsr' | 'bilinear' = 'fsr';

  /** How much RCAS sharpens, in stops: 0 the strongest, 2 mild. */
  setSharpness(stops: number): void {
    this.rcas.setSharpness(stops);
  }

  /** The target (8-bit, no depth) the water composite draws the finished picture into, at the view's size. */
  input(w: number, h: number): WebGLRenderTarget {
    if (!this.src || this.src.width !== w || this.src.height !== h) {
      this.src?.dispose();
      // (linear filtering for the bilinear comparison; EASU reads whole texels)
      this.src = ldr(w, h, LinearFilter);
    }
    return this.src;
  }

  /**
   * Scale what was drawn into `input()` (or `src`, `w` × `h`: the TAA's history) up to the drawing buffer and sharpen it,
   * onto the screen. At the screen's own size it is only sharpened (TAA softens a little).
   */
  present(gl: WebGLRenderer, src: Texture | null = null, w = this.src?.width ?? 1, h = this.src?.height ?? 1): void {
    const tex = src ?? this.src?.texture;
    if (!tex) return;
    const prev = gl.getRenderTarget();
    const out = gl.getDrawingBufferSize(this.out);
    const same = w === out.x && h === out.y;
    if (this.mode === 'bilinear' && !same) {
      this.bilinear.uniforms.tInput.value = tex;
      (this.bilinear.uniforms.uOutSize.value as Vector2).copy(out);
      this.quad.material = this.bilinear;
      gl.setRenderTarget(null);
      this.quad.render(gl);
      gl.setRenderTarget(prev);
      return;
    }
    let sharpenFrom = tex;
    if (!same) {
      if (!this.up || this.up.width !== out.x || this.up.height !== out.y) {
        this.up?.dispose();
        this.up = ldr(out.x, out.y, NearestFilter);
      }
      this.easu.setInput(tex, w, h, out.x, out.y);
      this.quad.material = this.easu;
      gl.setRenderTarget(this.up);
      this.quad.render(gl);
      sharpenFrom = this.up.texture;
    }
    // (scaled up: FSR's usual 0.25 stops; at the same size, after TAA, milder)
    this.rcas.setSharpness(same ? 0.6 : 0.25);
    this.rcas.uniforms.tInput.value = sharpenFrom;
    this.quad.material = this.rcas;
    gl.setRenderTarget(null);
    this.quad.render(gl);
    gl.setRenderTarget(prev);
  }

  dispose(): void {
    this.src?.dispose();
    this.up?.dispose();
    this.src = this.up = null;
    this.quad.dispose();
    this.easu.dispose();
    this.rcas.dispose();
    this.bilinear.dispose();
  }
}
