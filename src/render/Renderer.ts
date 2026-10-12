import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, Vector2, WebGLRenderer } from 'three';
import { QUALITY_PRESETS, savedQualityHint, type Quality } from '../core/Settings';
import { DynamicResolution, type DynResConfig } from './DynamicResolution';
import { GpuTimer } from './GpuTimer';
import { setRenderSize } from './RenderSize';

/** the drawing buffer at most when the 3D view is scaled up to it (about 4K: the UI is HTML and stays sharp anyway) */
const MAX_OUTPUT_PIXELS = 8.3e6;
/** the smallest share of the screen's width and height the dynamic resolution draws the view at */
const MIN_SCALE = 0.5;

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
  private _quality: Quality | null = null;
  /** the GPU's time per frame, where the browser measures it (the debug panel, the dynamic resolution) */
  readonly gpuTimer: GpuTimer;
  /** the size the 3D view is drawn at: the drawing buffer's, or smaller when it is scaled up (setUpscaling) */
  readonly renderSize = new Vector2(1, 1);
  private upscaling = false;
  /** the tier's own share of the screen's width and height when scaled up */
  private budget = 1;
  private readonly dynRes: DynamicResolution;
  private readonly tmp = new Vector2();
  /** a scale set by hand (the debug panel, the tests) in place of the dynamic one; null: dynamic */
  private fixedScale: number | null = null;

  get quality(): Quality {
    return this._quality ?? 'mid';
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
    this.gpuTimer = new GpuTimer(this.gl);
    this.dynRes = new DynamicResolution(this.dynConfig());
  }

  private dynConfig(): DynResConfig {
    return { targetMs: 1000 / this.preset.targetFps, max: this.budget, min: Math.min(this.budget, MIN_SCALE) };
  }

  /**
   * The 3D view drawn smaller than the screen and scaled up by FSR 1 (the field on a PC): the drawing buffer then has
   * the screen's own pixels, the view the tier's share of them, less when the GPU falls behind (dynamic resolution).
   * Off, the drawing buffer itself is the tier's size and the browser scales it up, as on phones.
   */
  setUpscaling(on: boolean): void {
    if (this.upscaling === on) return;
    this.upscaling = on;
    this.resize();
    this.dynRes.reset(this.dynConfig());
    this.applyScale();
  }

  /** Whether the field's view is set to be scaled up (a PC in the flat). */
  get upscalingOn(): boolean {
    return this.upscaling;
  }

  /** The tier's own share of the screen's width and height when scaled up (before the dynamic resolution). */
  get tierScale(): number {
    return this.budget;
  }

  /** Whether the view is drawn smaller than the drawing buffer just now. */
  get upscaled(): boolean {
    const out = this.gl.getDrawingBufferSize(this.tmp);
    return this.upscaling && (this.renderSize.x < out.x || this.renderSize.y < out.y);
  }

  /** The share of the screen's width and height the view is drawn at (1 when not scaled up). */
  get renderScale(): number {
    return this.upscaling ? this.fixedScale ?? this.dynRes.scale : 1;
  }

  /** Draws the view at this share of the screen while scaled up, instead of the dynamic one (null: dynamic again). */
  setFixedScale(scale: number | null): void {
    this.fixedScale = scale === null ? null : Math.min(1, Math.max(0.25, scale));
    this.applyScale();
  }

  /**
   * After each frame: reads the GPU timer back and lets the dynamic resolution resize the view, on what was measured
   * of the view (`drewView`: the view was drawn this frame; a menu over it is not). `dt` in seconds.
   */
  afterFrame(dt: number, drewView: boolean): void {
    const fresh = this.gpuTimer.poll();
    if (!this.upscaling || this.fixedScale !== null) return;
    // with a timer, each answer that comes back (they come a few frames late); without, each frame of the view
    const changed = this.gpuTimer.available ? fresh && this.dynRes.update(dt, this.gpuTimer.ms) : drewView && this.dynRes.update(dt, Number.NaN);
    if (changed) this.applyScale();
  }

  private applyScale(): void {
    const out = this.gl.getDrawingBufferSize(this.tmp);
    if (!this.upscaling) {
      this.renderSize.copy(out);
      setRenderSize(this.gl, null);
      return;
    }
    const s = this.fixedScale ?? this.dynRes.scale;
    this.renderSize.set(Math.max(1, Math.round(out.x * s)), Math.max(1, Math.round(out.y * s)));
    setRenderSize(this.gl, this.renderSize);
  }

  setQuality(q: Quality): void {
    if (this._quality === q) return;
    this._quality = q;
    this.gl.shadowMap.enabled = QUALITY_PRESETS[q].shadows;
    this.resize();
    this.dynRes.reset(this.dynConfig());
    this.applyScale();
  }

  get preset() {
    return QUALITY_PRESETS[this.quality];
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const p = this.preset;
    const deviceDpr = window.devicePixelRatio || 1;
    // the tier's size: the device's pixels up to its ratio, and within its pixel budget
    const tierDpr = Math.max(0.5, Math.min(deviceDpr, p.maxDpr, Math.sqrt(p.maxPixels / Math.max(1, w * h))));
    if (!this.upscaling) {
      // the drawing buffer is the tier's size (a big or dense panel is drawn smaller and scaled up by the browser; the
      // UI is HTML and stays sharp)
      this.gl.setPixelRatio(tierDpr);
      this.gl.setSize(w, h, false);
      this.applyScale();
      return;
    }
    // scaled up: the drawing buffer has the screen's pixels (up to about 4K), the view the tier's share of them
    const outDpr = Math.max(0.5, Math.min(deviceDpr, 2, Math.sqrt(MAX_OUTPUT_PIXELS / Math.max(1, w * h))));
    this.gl.setPixelRatio(outDpr);
    this.gl.setSize(w, h, false);
    this.budget = Math.min(1, tierDpr / outDpr);
    this.dynRes.configure(this.dynConfig());
    this.applyScale();
  }

  get aspect(): number {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    return w / Math.max(1, h);
  }
}
