import {
  AlwaysDepth, BufferGeometry, Color, DepthTexture, Float32BufferAttribute, FloatType, HalfFloatType, LinearFilter,
  LinearMipmapLinearFilter, Matrix4, Mesh, NoBlending, NoToneMapping, OrthographicCamera, RGBAFormat, Scene, ShaderMaterial,
  UnsignedByteType, Vector2, WebGLRenderTarget, type IUniform, type PerspectiveCamera, type Texture, type WebGLRenderer,
} from 'three';
import { LAYER_BEHIND, LAYER_FISH, type SharedUniforms } from '../HeroPipeline';
import type { QualityPreset } from '../../core/Settings';
import { TankPost } from './TankPost';

/** The screen-space uniforms of the passes drawn over the tank; the renderer fills them in each frame. */
export interface ScreenUniforms {
  uSceneColor: IUniform<Texture | null>;
  uSceneDepth: IUniform<Texture | null>;
  uVol: IUniform<Texture | null>;
  uRes: IUniform<Vector2>;
  uVolRes: IUniform<Vector2>;
  uInvProj: IUniform<Matrix4>;
  uProjM: IUniform<Matrix4>;
  uViewM: IUniform<Matrix4>;
  uCamWorld: IUniform<Matrix4>;
  /** the angle one pixel spans (radians): the meniscus and the blur stay a pixel or two wide at any distance */
  uPixAngle: IUniform<number>;
  /** blur of what is seen through the water, per metre of water, in source pixels */
  uBlurK: IUniform<number>;
}

export function createScreenUniforms(): ScreenUniforms {
  return {
    uSceneColor: { value: null }, uSceneDepth: { value: null }, uVol: { value: null },
    uRes: { value: new Vector2(1, 1) }, uVolRes: { value: new Vector2(1, 1) },
    uInvProj: { value: new Matrix4() }, uProjM: { value: new Matrix4() }, uViewM: { value: new Matrix4() }, uCamWorld: { value: new Matrix4() },
    uPixAngle: { value: 0.001 }, uBlurK: { value: 4 },
  };
}

/** Transparent things above the water (a glass lid, clear trims): drawn after the water, so it does not bend them. */
export const LAYER_OVER = 6;

/** What a tank hands the renderer: the water/glass pass, the light-shaft pass and their uniforms. */
export interface TankPasses {
  readonly water: Scene;
  /** null while the shafts are off */
  readonly shafts: Scene | null;
  readonly screen: ScreenUniforms;
  /** called once a frame before the passes are drawn (the camera is up to date) */
  beforeRender(camera: PerspectiveCamera): void;
  /** whether anything is on LAYER_OVER (the pass is skipped otherwise) */
  readonly hasOverlay?: boolean;
}

/** GPU time of the passes, from EXT_disjoint_timer_query_webgl2 where the browser offers it. */
class GpuTimer {
  private readonly free: WebGLQuery[] = [];
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  lastMs = -1;
  private constructor(private readonly gl: WebGL2RenderingContext, private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }) {}
  static create(gl: WebGL2RenderingContext): GpuTimer | null {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    return ext ? new GpuTimer(gl, ext) : null;
  }
  begin(): void {
    if (this.active || this.pending.length > 3) return;
    const q = this.free.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }
  end(): void {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }
  poll(): void {
    const gl = this.gl;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      if (!disjoint) this.lastMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      this.pending.shift();
      this.free.push(q);
    }
  }
  dispose(): void { for (const q of [...this.free, ...this.pending]) this.gl.deleteQuery(q); this.free.length = this.pending.length = 0; }
}

/**
 * The home tank's frame, all in linear HDR:
 *  1. the scene without the water, once, into a buffer with depth (mipmapped: what is seen through the water and
 *     through a fish's skin is sampled blurred);
 *  2. with a hero fish: the buffer copied (colour and depth), the fins drawn into the original (what the body sees
 *     through), then the fish into the copy;
 *  3. the light shafts in the water at half resolution;
 *  4. the water and the glass in one full-screen pass (the scene copied through outside the tank's box, the depth
 *     with it), then what is transparent above the water over that;
 *  5. bloom, tone mapping and the grade to the screen.
 * The internal resolution follows the GPU's time (or the frame time when the browser cannot measure it).
 */
export class TankRenderer {
  private rtScene: WebGLRenderTarget | null = null;
  private rtHero: WebGLRenderTarget | null = null;
  private rtVol: WebGLRenderTarget | null = null;
  private rtWater: WebGLRenderTarget | null = null;
  private readonly post: TankPost;
  private readonly copyScene = new Scene();
  private readonly copyCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly copyMat: ShaderMaterial;
  private readonly timer: GpuTimer | null;
  private readonly buf = new Vector2();
  private readonly prevClear = new Color();
  private samples = 4;
  private shaftScale = 0.5;
  private time = 0;
  /** the internal resolution as a fraction of the drawing buffer's, and its limits */
  scale = 1;
  minScale = 0.65;
  maxScale = 1;
  /** a fixed internal scale instead of the dynamic one (screenshots, comparisons) */
  fixedScale: number | null = null;
  private emaGpu = -1;
  private emaFrame = 1000 / 60;
  private sinceChange = 0;
  private goodFor = 0;
  /** what the debug panel shows */
  readonly stats = { width: 0, height: 0, scale: 1, gpuMs: -1, frameMs: 0 };

  constructor(private readonly gl: WebGLRenderer, private readonly floatRT: boolean) {
    this.post = new TankPost(floatRT);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.copyMat = new ShaderMaterial({
      name: 'TankCopyColorDepth', depthTest: true, depthWrite: true, depthFunc: AlwaysDepth, blending: NoBlending,
      uniforms: { uColor: { value: null }, uDepth: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D uColor, uDepth; varying vec2 vUv; void main() { gl_FragColor = texture2D(uColor, vUv); gl_FragDepth = texture2D(uDepth, vUv).r; }',
    });
    const tri = new Mesh(geo, this.copyMat);
    tri.frustumCulled = false;
    this.copyScene.add(tri);
    this.timer = GpuTimer.create(gl.getContext() as WebGL2RenderingContext);
  }

  setQuality(p: QualityPreset): void {
    if (this.samples !== p.msaa) {
      this.samples = p.msaa;
      this.rtScene?.dispose(); this.rtScene = null;
      this.rtHero?.dispose(); this.rtHero = null;
    }
    this.post.bloom = p.tankBloom;
    this.minScale = p.tankMinScale;
    this.scale = Math.min(Math.max(this.scale, this.minScale), this.maxScale);
  }

  private makeTarget(w: number, h: number, samples: number, depth: boolean, mips: boolean): WebGLRenderTarget {
    const rt = new WebGLRenderTarget(w, h, {
      type: this.floatRT ? HalfFloatType : UnsignedByteType, format: RGBAFormat, samples, depthBuffer: depth,
      minFilter: mips ? LinearMipmapLinearFilter : LinearFilter, magFilter: LinearFilter, generateMipmaps: mips,
    });
    if (depth) {
      const d = new DepthTexture(w, h, FloatType);
      rt.depthTexture = d;
    }
    return rt;
  }

  private ensure(w: number, h: number, hero: boolean, shafts: boolean): void {
    const fit = (rt: WebGLRenderTarget | null, rw: number, rh: number) => { if (rt && (rt.width !== rw || rt.height !== rh)) rt.setSize(rw, rh); };
    if (!this.rtScene) this.rtScene = this.makeTarget(w, h, this.samples, true, true);
    fit(this.rtScene, w, h);
    if (hero) {
      if (!this.rtHero) this.rtHero = this.makeTarget(w, h, this.samples, true, true);
      fit(this.rtHero, w, h);
    }
    if (!this.rtWater) { this.rtWater = this.makeTarget(w, h, 0, false, false); this.rtWater.depthBuffer = true; }
    fit(this.rtWater, w, h);
    const vw = Math.max(1, Math.round(w * this.shaftScale)), vh = Math.max(1, Math.round(h * this.shaftScale));
    if (shafts) {
      if (!this.rtVol) this.rtVol = this.makeTarget(vw, vh, 0, false, false);
      fit(this.rtVol, vw, vh);
    }
  }

  /** Dynamic resolution: the pixel count follows the time the GPU takes, within the tier's limits. */
  private updateScale(dt: number): void {
    this.timer?.poll();
    const gpu = this.timer?.lastMs ?? -1;
    if (gpu > 0) this.emaGpu = this.emaGpu < 0 ? gpu : this.emaGpu * 0.9 + gpu * 0.1;
    if (dt > 0) this.emaFrame = this.emaFrame * 0.92 + Math.min(dt * 1000, 100) * 0.08;
    this.sinceChange += dt;
    this.stats.gpuMs = this.emaGpu; this.stats.frameMs = this.emaFrame;
    if (this.fixedScale !== null) { this.scale = this.fixedScale; return; }
    if (this.sinceChange < 0.75) return;
    const step = this.sinceChange;
    this.sinceChange = 0;
    let next = this.scale;
    if (this.emaGpu > 0) {
      // the pixel work goes with the square of the scale; aim at 10 ms of GPU time, a 60 Hz frame with room to spare
      next = this.scale * Math.sqrt(10 / Math.max(this.emaGpu, 0.5));
      next = Math.min(this.scale * 1.08, Math.max(this.scale * 0.85, next));
    } else if (this.emaFrame > 19.5) {
      // no timer: the frame time is all there is; a vsynced frame cannot say how much room is left, so the way back
      // up is slow and stops as soon as the frames slow down again
      next = this.scale - 0.05; this.goodFor = 0;
    } else if (this.emaFrame < 17.4) {
      this.goodFor += step;
      if (this.goodFor >= 4) { next = this.scale + 0.05; this.goodFor = 0; }
    } else this.goodFor = 0;
    this.scale = Math.round(Math.min(this.maxScale, Math.max(this.minScale, next)) * 20) / 20;
  }

  /** Draw the tank's frame to the screen. `hero` is the hero materials' shared uniforms while a hero fish is in the tank. */
  render(scene: Scene, camera: PerspectiveCamera, passes: TankPasses, dt: number, hero: SharedUniforms | null): void {
    const gl = this.gl;
    this.time += dt;
    this.updateScale(dt);
    gl.getDrawingBufferSize(this.buf);
    const w = Math.max(1, Math.round(this.buf.x * this.scale)), h = Math.max(1, Math.round(this.buf.y * this.scale));
    const shafts = passes.shafts;
    this.ensure(w, h, !!hero, !!shafts);
    const rtScene = this.rtScene!, rtWater = this.rtWater!;
    Object.assign(this.stats, { width: w, height: h, scale: this.scale });

    const prevAuto = gl.autoClear, prevTone = gl.toneMapping, prevShadow = gl.shadowMap.autoUpdate, prevAlpha = gl.getClearAlpha();
    gl.getClearColor(this.prevClear);
    gl.autoClear = false;
    gl.toneMapping = NoToneMapping;
    this.timer?.begin();

    camera.updateMatrixWorld();
    // 1. the scene without the water (the scene's background colour clears it)
    camera.layers.set(0);
    gl.setRenderTarget(rtScene);
    gl.setClearColor(0x000000, 1);
    gl.clear(true, true, false);
    gl.render(scene, camera);
    let src = rtScene;

    // 2. the hero fish over a copy; its fins into the original, behind the body
    if (hero && this.rtHero) {
      const rtHero = this.rtHero;
      this.copyMat.uniforms.uColor.value = rtScene.texture;
      this.copyMat.uniforms.uDepth.value = rtScene.depthTexture;
      gl.setRenderTarget(rtHero);
      gl.render(this.copyScene, this.copyCam);
      const bg = scene.background;
      scene.background = null;
      gl.shadowMap.autoUpdate = false;
      camera.layers.set(LAYER_BEHIND);
      gl.setRenderTarget(rtScene);
      gl.render(scene, camera);
      hero.uBg.value = rtScene.texture;
      hero.uBgDepth.value = rtScene.depthTexture;
      hero.uCamNearFar.value.set(camera.near, camera.far);
      hero.uResolution.value.set(w, h);
      hero.uTime.value += dt;
      camera.layers.set(LAYER_FISH);
      gl.setRenderTarget(rtHero);
      gl.render(scene, camera);
      scene.background = bg;
      camera.layers.set(0);
      src = rtHero;
    }
    gl.shadowMap.autoUpdate = false;

    // the passes over the tank read the scene through these
    const S = passes.screen;
    S.uSceneColor.value = src.texture;
    S.uSceneDepth.value = src.depthTexture;
    S.uRes.value.set(w, h);
    S.uInvProj.value.copy(camera.projectionMatrixInverse);
    S.uProjM.value.copy(camera.projectionMatrix);
    S.uViewM.value.copy(camera.matrixWorldInverse);
    S.uCamWorld.value.copy(camera.matrixWorld);
    S.uPixAngle.value = 2 * Math.tan((camera.fov * Math.PI) / 360) / (h * camera.zoom);
    S.uBlurK.value = 1.2 * (h / 1080);
    passes.beforeRender(camera);

    // 3. the light shafts, at half resolution
    if (shafts && this.rtVol) {
      S.uVolRes.value.set(this.rtVol.width, this.rtVol.height);
      gl.setRenderTarget(this.rtVol);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
      gl.render(shafts, camera);
      S.uVol.value = this.rtVol.texture;
    }

    // 4. the water and the glass over the whole frame (it writes every pixel and its depth), then the transparent
    // things above the water
    gl.setRenderTarget(rtWater);
    gl.render(passes.water, camera);
    if (passes.hasOverlay !== false) {
      const bg = scene.background;
      scene.background = null;
      camera.layers.set(LAYER_OVER);
      gl.render(scene, camera);
      camera.layers.set(0);
      scene.background = bg;
    }

    // 5. to the screen
    // (gentle: a strong sharpen on an upscaled frame turns the bilinear steps into blocks)
    const sharpen = this.scale < 0.97 ? Math.min(0.45, (1 - this.scale) * 1.1) : 0;
    this.post.render(gl, rtWater.texture, w, h, { exposure: prevTone === NoToneMapping ? 1 : gl.toneMappingExposure / 0.6, sharpen, time: this.time, aspect: this.buf.x / Math.max(1, this.buf.y) });

    this.timer?.end();
    gl.shadowMap.autoUpdate = prevShadow;
    gl.autoClear = prevAuto;
    gl.toneMapping = prevTone;
    gl.setClearColor(this.prevClear, prevAlpha);
  }

  dispose(): void {
    for (const rt of [this.rtScene, this.rtHero, this.rtVol, this.rtWater]) rt?.dispose();
    this.rtScene = this.rtHero = this.rtVol = this.rtWater = null;
    this.post.dispose();
    this.copyMat.dispose();
    this.timer?.dispose();
  }
}
