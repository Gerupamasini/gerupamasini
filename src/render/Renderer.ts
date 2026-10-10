import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import { QUALITY_PRESETS, savedQualityHint, type Quality } from '../core/Settings';

export interface RendererCaps {
  webgl2: boolean;
  floatRT: boolean;
}

export class GameRenderer {
  readonly gl: WebGLRenderer;
  readonly caps: RendererCaps;
  /** whether the canvas was made multisampled (fixed for the page's life) */
  readonly canvasMsaa: boolean;
  /** the GPU as the browser names it ('' when it will not say) */
  readonly gpuName: string;
  /** an integrated, mobile or software GPU: the first run starts on 低 */
  readonly weakGpu: boolean;
  private _quality: Quality = 'mid';

  get quality(): Quality {
    return this._quality;
  }

  constructor(readonly canvas: HTMLCanvasElement) {
    // the canvas's multisampling is fixed at creation: the tiers without it (as saved on the last run) do without
    // it here too, so a switch across that line takes full effect on the next load
    const antialias = QUALITY_PRESETS[savedQualityHint()].msaa > 0;
    this.canvasMsaa = antialias;
    this.gl = new WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 0.5;
    this.gl.shadowMap.type = PCFSoftShadowMap;
    this.caps = { webgl2: this.gl.capabilities.isWebGL2, floatRT: this.gl.extensions.has('EXT_color_buffer_float') };
    let name = '';
    try {
      const ctx = this.gl.getContext();
      const dbg = ctx.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
      name = String(ctx.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : ctx.RENDERER) ?? '');
    } catch { /* no name: taken for a capable GPU */ }
    this.gpuName = name;
    // (integrated, mobile and software GPUs: an Intel or AMD laptop, a phone, a VM. 'Mesa' is a driver, not a GPU:
    // a desktop Radeon on Linux carries the name too)
    this.weakGpu = (/\b(Intel|UHD|Iris|HD Graphics|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|VMware|VirtualBox)\b/i.test(name)
      || /Radeon\(TM\) Graphics|Radeon Graphics|Vega \d/i.test(name)) && !/\bArc\b/i.test(name);
  }

  setQuality(q: Quality): void {
    this._quality = q;
    this.gl.shadowMap.enabled = QUALITY_PRESETS[q].shadows;
    this.resize();
  }

  get preset() {
    return QUALITY_PRESETS[this._quality];
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    // the drawing buffer: the device's pixels up to the tier's ratio, and within the tier's pixel budget (a big or
    // dense panel is drawn smaller and scaled up by the browser; the UI is HTML and stays sharp)
    const p = this.preset;
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, p.maxDpr, Math.sqrt(p.maxPixels / Math.max(1, w * h))));
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h, false);
  }

  get aspect(): number {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    return w / Math.max(1, h);
  }
}
