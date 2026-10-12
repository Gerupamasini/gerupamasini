import {
  DepthTexture, FloatType, HalfFloatType, LinearFilter, Matrix4, NearestFilter, Object3D, PerspectiveCamera, Plane, RGBAFormat, Vector2, Vector3, Vector4, WebGLRenderTarget,
  type Scene, type WebGLRenderer,
} from 'three';

/** Objects on this layer show in the sea's mirror (the sky, the land, the far skyline, the seawall). */
export const LAYER_MIRROR = 4;

/** Put an object (and everything under it) into the sea's mirror. */
export function reflectInWater<T extends Object3D>(o: T): T {
  o.traverse((c) => c.layers.enable(LAYER_MIRROR));
  return o;
}

/**
 * The calm sea as a mirror (after three's Reflector): the camera reflected in the water plane renders what stands
 * above it into a small target, its near plane tilted onto the water (an oblique projection). Optional underwater
 * mode reverses the clip plane to retain the submerged reef. Only LAYER_MIRROR is drawn.
 * The water pass looks the reflection up through `textureMatrix`, bent by its ripples.
 */
export class MirrorView {
  readonly target: WebGLRenderTarget;
  /** world → mirror-texture coordinates (projective) */
  readonly textureMatrix = new Matrix4();
  /** Mirror UV + depth → world, for the length of an underwater reflected ray. */
  readonly textureMatrixInverse = new Matrix4();
  /** False when disabled or the eye is on the wrong side of the requested reflecting surface. */
  valid = false;
  readonly stats = { calls: 0, triangles: 0 };
  private readonly cam = new PerspectiveCamera();
  private readonly size = new Vector2();
  private readonly plane = new Plane();
  private readonly clip = new Vector4();
  private readonly q = new Vector4();
  private readonly v = new Vector3();
  private readonly look = new Vector3();
  private readonly eye = new Vector3();
  private readonly rot = new Matrix4();
  private readonly normal = new Vector3(0, 1, 0);

  constructor(public scale: number) {
    this.target = new WebGLRenderTarget(4, 4, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false, depthBuffer: true });
    this.cam.layers.set(LAYER_MIRROR);
  }

  /** Render the reflection in the plane y = level as seen from `camera`. */
  render(gl: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, level: number, below = false): void {
    this.valid = false;
    this.stats.calls = this.stats.triangles = 0;
    if (this.scale <= 0) return;
    const eye = this.eye.setFromMatrixPosition(camera.matrixWorld);
    if (below ? eye.y >= level - 0.02 : eye.y <= level + 0.02) return;
    if (below) {
      // A downward-facing underwater view cannot see the surface. Avoid a second reef render.
      let seesSurface = false;
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        this.v.set(x, y, 0.5).unproject(camera).sub(eye);
        if (this.v.y > 0) seesSurface = true;
      }
      if (!seesSurface) return;
    }
    gl.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.round(this.size.x * this.scale)), h = Math.max(1, Math.round(this.size.y * this.scale));
    if (below && !this.target.depthTexture) {
      // Legacy above-water mirrors need no sampled depth attachment.
      this.target.dispose();
      const depth = new DepthTexture(w, h, FloatType);
      depth.minFilter = depth.magFilter = NearestFilter;
      this.target.depthTexture = depth;
      this.target.samples = 4;
    }
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);

    // the eye and its line of sight, reflected in the plane (through the point of the plane under the eye)
    const n = this.normal.set(0, below ? -1 : 1, 0), o = this.v.set(eye.x, level, eye.z);
    const cam = this.cam;
    cam.position.set(eye.x, 2 * level - eye.y, eye.z);
    this.rot.extractRotation(camera.matrixWorld);
    this.look.set(0, 0, -1).applyMatrix4(this.rot).add(eye);
    this.look.y = 2 * level - this.look.y;
    cam.up.set(0, 1, 0).applyMatrix4(this.rot).reflect(n);
    cam.lookAt(this.look);
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);

    // oblique near plane on the water (Lengyel), so the bed and anything under the surface is clipped away
    this.plane.setFromNormalAndCoplanarPoint(n, o).applyMatrix4(cam.matrixWorldInverse);
    const p = this.plane, e = cam.projectionMatrix.elements, c = this.clip.set(p.normal.x, p.normal.y, p.normal.z, p.constant);
    this.q.set((Math.sign(c.x) + e[8]) / e[0], (Math.sign(c.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    c.multiplyScalar(2 / c.dot(this.q));
    e[2] = c.x; e[6] = c.y; e[10] = c.z + 1 - 0.003; e[14] = c.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    this.textureMatrixInverse.copy(this.textureMatrix).invert();

    const prevTarget = gl.getRenderTarget(), autoShadow = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;   // the shadows of this frame come with the main render
    gl.setRenderTarget(this.target);
    gl.clear();
    gl.render(scene, cam);
    this.stats.calls = gl.info.render.calls;
    this.stats.triangles = gl.info.render.triangles;
    gl.setRenderTarget(prevTarget);
    gl.shadowMap.autoUpdate = autoShadow;
    this.valid = true;
  }

  dispose(): void {
    this.target.dispose();
  }
}
