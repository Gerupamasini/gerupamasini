import {
  DepthTexture, LessEqualCompare, LinearFilter, Matrix4, MeshDepthMaterial, OrthographicCamera, UnsignedIntType, Vector3, WebGLRenderTarget,
  type IUniform, type Scene, type Texture, type WebGLRenderer,
} from 'three';

/**
 * Sun shadows of what lies on the flat near the walker (shells, pebbles, blocks, the poles and the wall when
 * close): one depth map from the sun over a square around the eye, snapped to its texels so the edges do not
 * crawl as one walks, sampled with a small PCF kernel. The ground itself casts none (on a flat it hardly would).
 */
export const SHADOW_LAYER = 1;

export const SHADOW_GLSL = /* glsl */ `
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uShadowVP;
uniform float uShadowOn;
uniform float uShadowTexel;
float sunShadow(vec3 p) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 c = uShadowVP * vec4(p, 1.0);
  vec3 s = c.xyz / c.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  float sum = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) sum += texture(uShadowMap, vec3(s.xy + vec2(float(i), float(j)) * uShadowTexel * 1.3, s.z - 0.00015));
  float edge = smoothstep(0.0, 0.08, min(min(s.x, 1.0 - s.x), min(s.y, 1.0 - s.y)));
  return mix(1.0, sum / 9.0, edge);
}
`;

export interface ShadowUniforms {
  uShadowMap: IUniform<Texture | null>;
  uShadowVP: IUniform<Matrix4>;
  uShadowOn: IUniform<number>;
  uShadowTexel: IUniform<number>;
}

export class SunShadow {
  readonly uniforms: ShadowUniforms;
  private readonly rt: WebGLRenderTarget;
  private readonly cam: OrthographicCamera;
  private readonly depthMat = new MeshDepthMaterial();
  private readonly center = new Vector3();

  constructor(private readonly renderer: WebGLRenderer, private readonly res = 2048, private readonly half = 16) {
    this.rt = new WebGLRenderTarget(res, res, { depthBuffer: true, stencilBuffer: false });
    const d = new DepthTexture(res, res, UnsignedIntType);
    d.compareFunction = LessEqualCompare;
    d.magFilter = d.minFilter = LinearFilter;
    this.rt.depthTexture = d;
    this.cam = new OrthographicCamera(-half, half, half, -half, 70, 130);
    this.cam.layers.set(SHADOW_LAYER);
    this.uniforms = {
      uShadowMap: { value: d },
      uShadowVP: { value: new Matrix4() },
      uShadowOn: { value: 1 },
      uShadowTexel: { value: 1 / res },
    };
  }

  /** Render the casters around `eye` for the sun direction `sun` (unit, toward the sun). */
  render(scene: Scene, eye: Vector3, sun: Vector3): void {
    if (sun.y < 0.05) { this.uniforms.uShadowOn.value = 0; return; }
    this.uniforms.uShadowOn.value = 1;
    // look down the sun's rays at a point a little ahead of nowhere in particular: the square around the eye
    this.center.set(eye.x, eye.y - 1.5, eye.z);
    const c = this.cam;
    c.position.copy(this.center).addScaledVector(sun, 100);
    c.up.set(0, 1, 0);
    c.lookAt(this.center);
    c.updateMatrixWorld();
    // snap to the shadow map's texels so the edges stay put while walking
    const texel = (2 * this.half) / this.res;
    const e = c.matrixWorld.elements;
    const right = new Vector3(e[0], e[1], e[2]), up = new Vector3(e[4], e[5], e[6]);
    const r = right.dot(this.center), u = up.dot(this.center);
    this.center.addScaledVector(right, Math.round(r / texel) * texel - r).addScaledVector(up, Math.round(u / texel) * texel - u);
    c.position.copy(this.center).addScaledVector(sun, 100);
    c.lookAt(this.center);
    c.updateMatrixWorld();
    c.updateProjectionMatrix();
    this.uniforms.uShadowVP.value.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    const gl = this.renderer, prev = gl.getRenderTarget(), prevOverride = scene.overrideMaterial, prevBg = scene.background;
    scene.overrideMaterial = this.depthMat;
    scene.background = null;
    gl.setRenderTarget(this.rt);
    gl.clear(true, true, false);
    gl.render(scene, c);
    gl.setRenderTarget(prev);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
  }
}
