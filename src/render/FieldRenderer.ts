import { DepthTexture, FloatType, HalfFloatType, LinearFilter, NearestFilter, RGBAFormat, Vector2, WebGLRenderTarget, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import type { WaterPass } from '../world/Water';

/** Renders the flat into an HDR buffer with depth, then composites the screen-space water onto the screen. */
export class FieldRenderer {
  private rt: WebGLRenderTarget | null = null;
  private readonly size = new Vector2();
  /** draw calls and triangles of the last scene render (before the water composite) */
  readonly lastStats = { calls: 0, triangles: 0 };

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

  /**
   * Compile every shader the field needs before the first frame (in parallel where the browser offers
   * KHR_parallel_shader_compile), each in the variant it is drawn in: the scene into the HDR target, the water onto
   * the screen. Otherwise the first frame stalls for as long as the compiles take.
   */
  async compile(scene: Scene, camera: PerspectiveCamera, water: WaterPass): Promise<void> {
    const gl = this.gl, prev = gl.getRenderTarget();
    camera.updateMatrixWorld();
    gl.setRenderTarget(this.target());
    const sceneReady = gl.compileAsync(scene, camera);
    gl.setRenderTarget(null);
    const waterReady = gl.compileAsync(water.compileTarget(), camera);
    gl.setRenderTarget(prev);
    await Promise.all([sceneReady, waterReady]);
  }

  render(scene: Scene, camera: PerspectiveCamera, water: WaterPass): void {
    const gl = this.gl, rt = this.target();
    camera.updateMatrixWorld();
    water.prepare(gl, scene, camera);
    gl.setRenderTarget(rt);
    gl.render(scene, camera);
    this.lastStats.calls = gl.info.render.calls;
    this.lastStats.triangles = gl.info.render.triangles;
    water.render(gl, rt, null, camera);
    gl.setRenderTarget(null);
  }

  dispose(): void {
    this.rt?.dispose();
    this.rt = null;
  }
}
