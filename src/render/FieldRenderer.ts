import { DepthTexture, FloatType, HalfFloatType, LinearFilter, NearestFilter, RGBAFormat, Vector2, WebGLRenderTarget, type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import type { WaterPass } from '../world/Water';

/** Renders the flat into an HDR buffer with depth, then composites the screen-space water onto the screen. */
export class FieldRenderer {
  private rt: WebGLRenderTarget | null = null;
  private readonly size = new Vector2();
  private samples = 4;
  /** draw calls and triangles of the last scene render (before the water composite) */
  readonly lastStats = { calls: 0, triangles: 0 };

  constructor(private readonly gl: WebGLRenderer) {}

  private target(): WebGLRenderTarget {
    const s = this.gl.getDrawingBufferSize(this.size);
    const w = Math.max(1, s.x), h = Math.max(1, s.y);
    if (!this.rt || this.rt.width !== w || this.rt.height !== h || this.rt.samples !== this.samples) {
      this.rt?.dispose();
      this.rt = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, samples: this.samples, depthBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false });
      const depth = new DepthTexture(w, h, FloatType);
      depth.minFilter = NearestFilter;
      depth.magFilter = NearestFilter;
      this.rt.depthTexture = depth;
    }
    return this.rt;
  }

  /** Multisampling of the HDR buffer (0: none). The buffer is rebuilt on the next frame. */
  setSamples(n: number): void {
    this.samples = Math.max(0, Math.round(n));
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
    const surf = water.surfCompileTarget();
    let surfReady: Promise<unknown> = Promise.resolve();
    if (surf) { gl.setRenderTarget(surf.target); surfReady = gl.compileAsync(surf.mesh, camera); }
    gl.setRenderTarget(prev);
    await Promise.all([sceneReady, waterReady, surfReady]);
  }

  /**
   * Compile the shaders of a tree that is not in the scene (the creatures' kept models) in the scene's own variant:
   * the HDR target bound, the scene's lights and fog. Called again when the preset changes what the variant is.
   */
  async compileKept(root: Object3D, camera: PerspectiveCamera, scene: Scene): Promise<void> {
    const gl = this.gl, prev = gl.getRenderTarget();
    camera.updateMatrixWorld();
    gl.setRenderTarget(this.target());
    const ready = gl.compileAsync(root, camera, scene);
    gl.setRenderTarget(prev);
    await ready;
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
