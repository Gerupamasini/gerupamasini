import {
  ACESFilmicToneMapping, Color, DepthTexture, FloatType, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, NearestFilter,
  NoToneMapping, PerspectiveCamera, RGBAFormat, Scene, Vector2, Vector3, WebGLRenderTarget, type IUniform, type WebGLRenderer,
} from 'three';
import { createPost } from './HeroPost.js';
import type { WaterPass } from '../world/Water';

export const LAYER_FISH = 2;
export const LAYER_BEHIND = 3;

export interface SharedUniforms {
  uLightDir: IUniform<Vector3>;
  uLightColor: IUniform<Vector3>;
  uWaterDeep: IUniform<Vector3>;
  uWaterUp: IUniform<Vector3>;
  uSurfaceGlow: IUniform<Vector3>;
  uAmbUp: IUniform<Vector3>;
  uAmbDown: IUniform<Vector3>;
  uFogColor: IUniform<Vector3>;
  uFogDensity: IUniform<number>;
  uTime: IUniform<number>;
  uScatter: IUniform<number>;
  uInterior: IUniform<number>;
  uCausticAmt: IUniform<number>;
  uFinDensity: IUniform<number>;
  uDebug: IUniform<number>;
  uFloorY: IUniform<number>;
  uBg: IUniform<unknown>;
  uBgDepth: IUniform<unknown>;
  uCamNearFar: IUniform<Vector2>;
  uResolution: IUniform<Vector2>;
}

export interface HeroLighting {
  sunDir: Vector3;
  sunColor: Color;
  sunIntensity: number;
  skyColor: Color;
  groundColor: Color;
  ambientIntensity: number;
  fogColor: Color;
  fogDensity: number;
  floorY: number;
  underwater: boolean;
}

/**
 * Three-pass renderer for the volumetric hero materials: opaque scene (+ fins behind the body) into an HDR buffer with
 * depth, the full scene with the hero on top into an MSAA HDR buffer, then bloom + ACES + sRGB to the screen.
 */
export class HeroPipeline {
  readonly shared: SharedUniforms;
  private readonly envRT: WebGLRenderTarget;
  private readonly mainRT: WebGLRenderTarget;
  private readonly compRT: WebGLRenderTarget;
  private readonly post = createPost();
  private width = 1;
  private height = 1;

  constructor(private readonly renderer: WebGLRenderer) {
    const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);
    this.shared = {
      uLightDir: { value: v3(0.3, 0.8, 0.5).normalize() },
      uLightColor: { value: v3(3.2, 3.05, 2.8) },
      uWaterDeep: { value: v3(0.004, 0.017, 0.021) },
      uWaterUp: { value: v3(0.03, 0.085, 0.095) },
      uSurfaceGlow: { value: v3(0.22, 0.38, 0.38) },
      uAmbUp: { value: v3(0.11, 0.2, 0.21) },
      uAmbDown: { value: v3(0.022, 0.045, 0.05) },
      uFogColor: { value: v3(0.012, 0.038, 0.044) },
      uFogDensity: { value: 0.3 },
      uTime: { value: 0 },
      uScatter: { value: 1.0 },
      uInterior: { value: 0.45 },
      uCausticAmt: { value: 0.15 },
      uFinDensity: { value: 1.0 },
      uDebug: { value: 0 },
      uFloorY: { value: -1e3 },
      uBg: { value: null },
      uBgDepth: { value: null },
      uCamNearFar: { value: new Vector2(0.05, 100) },
      uResolution: { value: new Vector2(1, 1) },
    };
    const rtOpts = { type: HalfFloatType, format: RGBAFormat, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, depthBuffer: true };
    this.envRT = new WebGLRenderTarget(4, 4, rtOpts);
    const depth = new DepthTexture(4, 4, FloatType);
    depth.minFilter = NearestFilter;
    depth.magFilter = NearestFilter;
    this.envRT.depthTexture = depth;
    this.mainRT = new WebGLRenderTarget(4, 4, { ...rtOpts, samples: 4 });
    const mainDepth = new DepthTexture(4, 4, FloatType);
    mainDepth.minFilter = NearestFilter;
    mainDepth.magFilter = NearestFilter;
    this.mainRT.depthTexture = mainDepth;
    this.compRT = new WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: false });
    this.shared.uBg.value = this.envRT.texture;
    this.shared.uBgDepth.value = depth;
    this.post.material.uniforms.uTex.value = this.mainRT.texture;
    this.post.material.uniforms.uBloom.value = 0.18;
    this.post.material.uniforms.uExposure.value = 1.0;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.envRT.setSize(width, height);
    this.mainRT.setSize(width, height);
    this.compRT.setSize(width, height);
    this.shared.uResolution.value.set(width, height);
    this.post.material.uniforms.uRes.value.set(width, height);
  }

  /** Map the game's lighting onto the viewer's underwater lighting model. */
  setLighting(l: HeroLighting): void {
    const s = this.shared;
    s.uLightDir.value.copy(l.sunDir);
    s.uLightColor.value.set(l.sunColor.r, l.sunColor.g, l.sunColor.b).multiplyScalar(l.sunIntensity * 1.3);
    const sky = new Vector3(l.skyColor.r, l.skyColor.g, l.skyColor.b).multiplyScalar(l.ambientIntensity);
    const ground = new Vector3(l.groundColor.r, l.groundColor.g, l.groundColor.b).multiplyScalar(l.ambientIntensity);
    s.uAmbUp.value.copy(sky).multiplyScalar(0.9);
    s.uAmbDown.value.copy(ground).multiplyScalar(0.6);
    s.uWaterUp.value.copy(sky).multiplyScalar(0.5);
    s.uWaterDeep.value.copy(ground).multiplyScalar(0.25);
    s.uSurfaceGlow.value.copy(sky).multiplyScalar(0.45);
    s.uFogColor.value.set(l.fogColor.r, l.fogColor.g, l.fogColor.b).multiplyScalar(0.3);
    s.uFogDensity.value = l.fogDensity;
    s.uFloorY.value = l.floorY;
    s.uCausticAmt.value = l.underwater ? 0.15 : 0.0;
  }

  render(scene: Scene, camera: PerspectiveCamera, dt: number, water: WaterPass | null = null): void {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new Vector2());
    this.resize(Math.max(1, size.x), Math.max(1, size.y));
    this.shared.uTime.value += dt;
    this.shared.uCamNearFar.value.set(camera.near, camera.far);
    const prevTone = r.toneMapping;
    const prevBg = scene.background;
    r.toneMapping = NoToneMapping;
    // 1. opaque scene plus the fins that must show through the thin body
    camera.layers.set(0);
    camera.layers.enable(LAYER_BEHIND);
    r.setRenderTarget(this.envRT);
    r.render(scene, camera);
    // 2. everything including the hero
    camera.layers.set(0);
    camera.layers.enable(LAYER_FISH);
    r.setRenderTarget(this.mainRT);
    r.render(scene, camera);
    // 2b. the water, composited over everything underwater (the hero included)
    if (water) {
      water.render(r, this.mainRT, this.compRT, camera);
      this.post.material.uniforms.uTex.value = this.compRT.texture;
    } else this.post.material.uniforms.uTex.value = this.mainRT.texture;
    // 3. tone map to the screen
    r.setRenderTarget(null);
    r.render(this.post.scene, this.post.camera);
    r.toneMapping = prevTone === NoToneMapping ? ACESFilmicToneMapping : prevTone;
    scene.background = prevBg;
    camera.layers.set(0);
  }

  dispose(): void {
    this.envRT.dispose();
    this.mainRT.dispose();
    this.compRT.dispose();
  }
}
