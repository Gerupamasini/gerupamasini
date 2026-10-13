import { LinearFilter, RedFormat, ShaderMaterial, UnsignedByteType, Vector3, WebGLRenderTarget, type DataTexture, type IUniform, type Texture, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** re-drawn when the sun has moved by this much (radians) */
const SUN_STEP = 0.003;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tHeight;
  uniform float uHalf, uTan, uSize;
  uniform vec2 uDir;
  void main() {
    vec2 uv = gl_FragCoord.xy / uSize;
    vec2 xz = uv * 2.0 * uHalf - uHalf;
    // (a few centimetres up: the ground's own bilinear wobble does not shade it)
    float h0 = texture2D(tHeight, uv).r + 0.04;
    float vis = 1.0, d = 0.5;
    // toward the sun in steps that lengthen with the distance (to about 500 m), the sun's disc (half a degree) as
    // the penumbra: lit while the ground ahead stays under the ray
    for (int k = 0; k < 80; k++) {
      d = d * 1.06 + 0.25;
      vec2 q = (xz + uDir * d + uHalf) / (2.0 * uHalf);
      if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) break;
      float margin = uTan - (texture2D(tHeight, q).r - h0) / d;
      vis = min(vis, clamp(margin / 0.0094 + 0.5, 0.0, 1.0));
      if (vis <= 0.0) break;
    }
    gl_FragColor = vec4(vis, vis, vis, 1.0);
  }
`;

/**
 * The flat's own relief in the sun: the banks, the levees and the sand ridges throw their shadows across the flat
 * when the sun is low (a 4.7 m bank at 5° reaches some 50 m). Marched over the height map toward the sun on the GPU
 * into a map of the flat (1 lit .. 0 shaded), when the sun has moved; the terrain shader reads it everywhere (the
 * ground casts into neither shadow map).
 */
export class TerrainShadow {
  readonly uniforms: { uTerrainSun: IUniform<Texture | null>; uTerrainSunOn: IUniform<number> };
  private target: WebGLRenderTarget | null = null;
  private readonly quad: FullScreenQuad;
  private readonly material: ShaderMaterial;
  private readonly lastSun = new Vector3(0, -1, 0);
  private on = false;
  private readonly dir = new Vector3();

  constructor(height: DataTexture, half: number, private readonly size = 512) {
    this.material = new ShaderMaterial({
      name: 'TerrainSunShadow',
      uniforms: { tHeight: { value: height }, uHalf: { value: half }, uTan: { value: 1 }, uSize: { value: size }, uDir: { value: { x: 0, y: 1 } } },
      vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.uniforms = { uTerrainSun: { value: null }, uTerrainSunOn: { value: 0 } };
  }

  /** On (the tiers with shadows) or off. */
  setEnabled(on: boolean): void {
    if (this.on === on) return;
    this.on = on;
    this.uniforms.uTerrainSunOn.value = 0;
    this.lastSun.set(0, -1, 0);
  }

  /** Per frame: re-draws the map when the sun has moved enough. `sunDir` points at the sun. */
  update(gl: WebGLRenderer, sunDir: Vector3): void {
    if (!this.on) return;
    // (below the horizon the light comes from a fixed high direction, as Sky has it)
    const dir = sunDir.y > -0.035 ? this.dir.copy(sunDir) : this.dir.set(0.3, 1, 0.2).normalize();
    if (this.uniforms.uTerrainSunOn.value && dir.angleTo(this.lastSun) < SUN_STEP) return;
    this.lastSun.copy(dir);
    if (!this.target) {
      this.target = new WebGLRenderTarget(this.size, this.size, { type: UnsignedByteType, format: RedFormat, depthBuffer: false, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
    }
    const h = Math.hypot(dir.x, dir.z);
    const u = this.material.uniforms;
    u.uDir.value = h > 1e-4 ? { x: dir.x / h, y: dir.z / h } : { x: 0, y: 1 };
    u.uTan.value = dir.y / Math.max(h, 1e-4);
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(this.target);
    this.quad.render(gl);
    gl.setRenderTarget(prev);
    this.uniforms.uTerrainSun.value = this.target.texture;
    this.uniforms.uTerrainSunOn.value = 1;
  }

  dispose(): void {
    this.target?.dispose();
    this.quad.dispose();
    this.material.dispose();
  }
}
