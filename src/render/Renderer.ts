import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import { QUALITY_PRESETS, type Quality } from '../core/Settings';

export interface RendererCaps {
  webgl2: boolean;
  floatRT: boolean;
}

export class GameRenderer {
  readonly gl: WebGLRenderer;
  readonly caps: RendererCaps;
  private quality: Quality = 'mid';

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 0.5;
    this.gl.shadowMap.type = PCFSoftShadowMap;
    this.caps = { webgl2: this.gl.capabilities.isWebGL2, floatRT: this.gl.extensions.has('EXT_color_buffer_float') };
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const p = QUALITY_PRESETS[q];
    this.gl.shadowMap.enabled = p.shadows;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.maxDpr));
    this.resize();
  }

  get preset() {
    return QUALITY_PRESETS[this.quality];
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.gl.setSize(w, h, false);
  }

  get aspect(): number {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    return w / Math.max(1, h);
  }
}
