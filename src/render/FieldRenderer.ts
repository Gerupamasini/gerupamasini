import { DepthTexture, FloatType, HalfFloatType, LinearFilter, NearestFilter, RGBAFormat, Vector2, WebGLRenderTarget, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import type { WaterPass } from '../world/Water';

/** Renders the flat into an HDR buffer with depth, then composites the screen-space water onto the screen. */
export class FieldRenderer {
  private rt: WebGLRenderTarget | null = null;
  private readonly size = new Vector2();

  constructor(private readonly gl: WebGLRenderer) {}

  private target(): WebGLRenderTarget {
    const s = this.gl.getDrawingBufferSize(this.size);
    const w = Math.max(1, s.x), h = Math.max(1, s.y);
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.dispose();
      this.rt = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, samples: 4, depthBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false });
      const depth = new DepthTexture(w, h, FloatType);
      depth.minFilter = NearestFilter;
      depth.magFilter = NearestFilter;
      this.rt.depthTexture = depth;
    }
    return this.rt;
  }

  render(scene: Scene, camera: PerspectiveCamera, water: WaterPass): void {
    const gl = this.gl, rt = this.target();
    gl.setRenderTarget(rt);
    gl.render(scene, camera);
    water.render(gl, rt, null, camera);
    gl.setRenderTarget(null);
  }

  dispose(): void {
    this.rt?.dispose();
    this.rt = null;
  }
}
