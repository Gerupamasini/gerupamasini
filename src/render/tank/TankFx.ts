import {
  AdditiveBlending, BufferGeometry, CubeCamera, Float32BufferAttribute, HalfFloatType, LinearMipmapLinearFilter, Points,
  ShaderMaterial, UnsignedByteType, WebGLCubeRenderTarget, type IUniform, type Object3D, type Scene, type WebGLRenderer,
} from 'three';
import { TANK_COMMON } from './glsl';

/**
 * Specks drifting in the water (fine silt, bits of food, plankton): one draw, no per-frame work on the CPU. Each
 * moves on a slow swirl and settles, wrapping round the tank; each is lit by the bar through the caustic sheets at its
 * place, and glows when the eye looks toward the bar (they scatter forward). They are drawn with the scene, so the
 * water pass bends and tints them like everything else in it.
 */
export class Motes extends Points<BufferGeometry, ShaderMaterial> {
  constructor(U: Record<string, IUniform>, max = 1600) {
    const seeds = new Float32Array(max * 3);
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < max * 3; i++) seeds[i] = rnd();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(seeds, 3));
    super(geo, new ShaderMaterial({
      name: 'TankMotes', uniforms: { ...U, uPixScale: { value: 800 } }, transparent: true, depthWrite: false, blending: AdditiveBlending,
      vertexShader: TANK_COMMON + /* glsl */ `
        uniform float uPixScale;
        varying vec3 vCol;
        varying float vA;
        float h1(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          float seed = fract(position.x * 7.31 + position.y * 3.17 + position.z * 5.03);
          float t = uTime;
          vec3 box = vec3(2.0 * uTankHalf.x, uWaterLevel - uFloorY - 0.004, 2.0 * uTankHalf.y);
          vec3 p = position;
          // a slow swirl, a gentle settling, each speck at its own pace
          p.x += 0.012 * sin(t * 0.09 + seed * 40.0) / box.x + t * 0.002 * (seed - 0.5) / box.x;
          p.z += 0.01 * cos(t * 0.07 + seed * 23.0) / box.z;
          p.y += (0.006 * sin(t * 0.13 + seed * 17.0) - t * (0.0006 + 0.0012 * seed)) / box.y;
          p = fract(p);
          vec3 P = vec3((p.x - 0.5) * box.x, uFloorY + 0.002 + p.y * box.y, (p.z - 0.5) * box.z);
          vec4 mv = viewMatrix * vec4(P + uTankOrigin, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = max(-mv.z, 0.01);
          float r = (0.00012 + 0.00035 * h1(seed * 91.0)) * (h1(seed * 13.0) > 0.93 ? 2.6 : 1.0);
          float px = r * uPixScale / dist;
          gl_PointSize = max(px * 2.0, 1.5);
          // a speck smaller than a pixel keeps its light, spread over the pixel
          float cover = min(1.0, (px * 2.0) / 1.5);
          vec3 L; float e = lampAt(P, L);
          vec2 cuv = causUV(P.xz);
          float sharp = textureLod(uCaus, cuv, 0.0).g, soft = textureLod(uCaus, cuv, 4.0).g;
          float sheet = mix(1.0, clamp(sharp / max(soft, 1e-3), 0.0, 5.0), 0.6 * clamp((uWaterLevel - P.y) / box.y, 0.0, 1.0));
          vec3 V = normalize(cameraPosition - (P + uTankOrigin));
          float fwd = pow(max(dot(-V, -L), 0.0), 6.0);
          vCol = uLampCol * e * sheet * (0.3 + 1.6 * fwd) * mix(vec3(0.9, 0.85, 0.75), vec3(0.75, 0.9, 1.0), h1(seed * 5.0));
          vA = cover * cover * smoothstep(0.0, 0.03, dist) * (0.35 + 0.65 * h1(seed * 3.0));
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        varying float vA;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float a = exp(-dot(q, q) * 14.0) * vA;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
    }));
    this.frustumCulled = false;
    this.renderOrder = 3;
    this.name = 'tankMotes';
  }

  setCount(n: number): void {
    this.geometry.setDrawRange(0, n);
    this.visible = n > 0;
  }

  /** pixels per metre at one metre: the drawing buffer's height over the view's height there */
  setPixelScale(v: number): void { this.material.uniforms.uPixScale.value = v; }

  override dispose(): void { this.geometry.dispose(); this.material.dispose(); this.removeFromParent(); }
}

/**
 * The room round the tank in a small cube map, for what the glass and the water reflect (the window and the night
 * outside, the shelf, the lamp's glow on the wall). Drawn again only when the room changes, never per frame.
 */
export class RoomProbe {
  readonly target: WebGLCubeRenderTarget;
  private readonly camera: CubeCamera;
  private dirty = true;
  private wait = 0;

  constructor(floatRT: boolean) {
    this.target = new WebGLCubeRenderTarget(128, { type: floatRT ? HalfFloatType : UnsignedByteType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
    this.camera = new CubeCamera(0.05, 30, this.target);
  }

  get texture() { return this.target.texture; }
  /** log2 of the face size: the roughest reflection's mip */
  get maxLod(): number { return Math.log2(128); }
  markDirty(): void { this.dirty = true; }

  /** Redraw from the tank's middle with the tank itself hidden, at most twice a second. */
  update(gl: WebGLRenderer, scene: Scene, hide: Object3D, x: number, y: number, z: number, dt: number): void {
    this.wait -= dt;
    if (!this.dirty || this.wait > 0) return;
    this.dirty = false; this.wait = 0.5;
    const was = hide.visible, prevShadow = gl.shadowMap.autoUpdate;
    hide.visible = false;
    gl.shadowMap.autoUpdate = false;
    this.camera.position.set(x, y, z);
    this.camera.update(gl, scene);
    gl.shadowMap.autoUpdate = prevShadow;
    hide.visible = was;
  }

  dispose(): void { this.target.dispose(); }
}

/**
 * The panes' cut edges, drawn with the opaque scene (the broad faces are left to the water pass, which reflects the
 * room in them): the light the bar sends down inside each pane comes out of its cut face, green from the iron in
 * the glass, brightest near the top.
 */
export function glassEdgeMaterial(U: Record<string, IUniform>, extra: Record<string, IUniform>): ShaderMaterial {
  return new ShaderMaterial({
    name: 'TankGlassEdge', uniforms: { ...U, ...extra, uEdgeCol: { value: [0.42, 0.68, 0.6] } },
    vertexShader: /* glsl */ `
      uniform vec3 uTankOrigin;
      varying vec3 vP;
      varying vec3 vN;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xyz - uTankOrigin;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: TANK_COMMON + /* glsl */ `
      uniform float uTankTop;
      uniform vec3 uEdgeCol;
      varying vec3 vP;
      varying vec3 vN;
      void main() {
        vec3 n = normalize(vN), p = vP;
        const float e = 3e-4;
        bool broad = (abs(n.z) > 0.5 && abs(p.z) >= uTankHalf.y - e && abs(p.x) <= uTankHalf.x + e && p.y >= -e)
                  || (abs(n.x) > 0.5 && abs(p.x) >= uTankHalf.x - e && abs(p.z) <= uTankHalf.y + e && p.y >= -e)
                  || (abs(n.y) > 0.5 && abs(p.x) <= uTankHalf.x + e && abs(p.z) <= uTankHalf.y + e);
        if (broad) discard;
        vec3 V = normalize(cameraPosition - (p + uTankOrigin));
        vec3 L;
        float lit = lampAt(p, L);
        float pipe = 0.2 + 0.8 * smoothstep(0.0, uTankTop, p.y);
        vec3 col = uEdgeCol * uLampCol * (0.03 + 0.12 * pipe + 0.25 * lit * max(dot(n, L), 0.0));
        col += uLampCol * 0.5 * pow(max(dot(reflect(-L, n), V), 0.0), 60.0) * lit;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
