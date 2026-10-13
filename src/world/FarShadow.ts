import {
  DepthTexture, DoubleSide, FloatType, Matrix4, Mesh, MeshDepthMaterial, NearestFilter, Object3D, OrthographicCamera, Vector3, WebGLRenderTarget,
  type IUniform, type Material, type Scene, type Texture, type WebGLRenderer,
} from 'three';

/** re-drawn when the sun has moved by this much (radians), the player by this far (m, other levels of detail are
 * shown), or after this long (s) */
const SUN_STEP = 0.004;
const MOVE_STEP = 20;
const MAX_AGE = 30;

/**
 * The sun's shadow over the whole flat, coarse (15 to 30 cm a texel), for beyond the near shadow map: the mangroves,
 * the levees and the riprap shading the flat far off. Drawn into its own depth map when the sun has moved (or now and
 * then), from what casts shadows in the scene, each in its own depth form (alpha-cut leaves, skins, instances); the
 * terrain reads it where the near map does not reach.
 */
export class FarShadow {
  /** for the terrain shader: the depth map, world → map (UV and depth), and whether to use it */
  readonly uniforms: { uFarShadowMap: IUniform<Texture | null>; uFarShadowMatrix: IUniform<Matrix4>; uFarShadowOn: IUniform<number> };
  private target: WebGLRenderTarget | null = null;
  private size = 0;
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private readonly lastSun = new Vector3(0, -1, 0);
  private readonly lastAnchor = new Vector3(1e9, 0, 0);
  private age = Infinity;
  private dirty = true;
  private readonly depthMats = new WeakMap<Material, MeshDepthMaterial>();
  private readonly plain = new MeshDepthMaterial();
  private readonly tmp = new Vector3();

  /** `half`: half the flat's width (m); `yMin`, `yMax`: the heights casters stand between */
  constructor(private readonly half: number, private readonly yMin: number, private readonly yMax: number, private readonly exclude: Object3D[] = []) {
    this.uniforms = { uFarShadowMap: { value: null }, uFarShadowMatrix: { value: new Matrix4() }, uFarShadowOn: { value: 0 } };
  }

  /** The map's size in texels (0: off). Drawn again on the next update. */
  setSize(size: number): void {
    if (size === this.size) return;
    this.size = size;
    this.target?.dispose();
    this.target = null;
    this.uniforms.uFarShadowOn.value = 0;
    this.uniforms.uFarShadowMap.value = null;
    this.dirty = true;
  }

  /** Draw again on the next update (casters added or moved: a new map, the reef built). */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * Per frame: re-draws the map when the sun moved enough, the player (`anchor`) walked far enough, or every half
   * minute. `sunDir` points at the sun.
   */
  update(gl: WebGLRenderer, scene: Scene, sunDir: Vector3, dt: number, anchor: Vector3): void {
    if (!this.size) return;
    this.age += dt;
    // (below the horizon the light comes from a fixed high direction: Sky does the same)
    const dir = sunDir.y > -0.03 ? this.tmp.copy(sunDir) : this.tmp.set(0.3, 1, 0.2).normalize();
    if (!this.dirty && this.age < MAX_AGE && dir.angleTo(this.lastSun) < SUN_STEP && anchor.distanceTo(this.lastAnchor) < MOVE_STEP) return;
    this.lastSun.copy(dir);
    this.lastAnchor.copy(anchor);
    this.age = 0;
    this.dirty = false;
    this.draw(gl, scene, dir);
  }

  private draw(gl: WebGLRenderer, scene: Scene, dir: Vector3): void {
    if (!this.target) {
      this.target = new WebGLRenderTarget(this.size, this.size, { depthBuffer: true });
      const depth = new DepthTexture(this.size, this.size, FloatType);
      depth.minFilter = NearestFilter;
      depth.magFilter = NearestFilter;
      this.target.depthTexture = depth;
    }
    // the light's frame: looking along -dir at the flat's middle, the box fitted round the flat and its casters
    const cam = this.camera, h = this.half;
    const dist = 2 * h + 200;
    cam.position.copy(dir).multiplyScalar(dist);
    cam.up.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.999) cam.up.set(0, 0, 1);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const cx of [-h, h]) for (const cy of [this.yMin, this.yMax]) for (const cz of [-h, h]) {
      const p = this.tmp.set(cx, cy, cz).applyMatrix4(inv);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    cam.left = x0; cam.right = x1; cam.bottom = y0; cam.top = y1;
    cam.near = Math.max(0.1, -z1 - 1); cam.far = -z0 + 1;
    cam.updateProjectionMatrix();
    // what casts: each mesh with castShadow, in its own depth form; everything else hidden for the draw
    const hidden: Object3D[] = [], swapped: [Mesh, Material | Material[]][] = [];
    const skip = new Set(this.exclude);
    scene.traverseVisible((o) => {
      if (skip.has(o)) { hidden.push(o); return; }
      const m = o as Mesh;
      if (!m.isMesh) { if ((o as { isPoints?: boolean; isLine?: boolean; isSprite?: boolean }).isPoints || (o as { isLine?: boolean }).isLine || (o as { isSprite?: boolean }).isSprite) hidden.push(o); return; }
      // (castShadow, or marked to cast into this map only: the far levels of detail of the reef, the riprap, the trees)
      if (!m.castShadow && !m.userData.farShadow) { hidden.push(o); return; }
      if ((m as Mesh & { isInstancedMesh?: boolean; count?: number }).isInstancedMesh && (m as unknown as { count: number }).count === 0) { hidden.push(o); return; }
      swapped.push([m, m.material]);
      m.material = Array.isArray(m.material) ? m.material.map((x) => this.depthFor(m, x)) : this.depthFor(m, m.material);
    });
    // (a hidden parent hides its children: traverseVisible has already passed them, so only the outermost are hidden)
    for (const o of hidden) o.visible = false;
    const prev = gl.getRenderTarget(), bg = scene.background, fog = scene.fog, shadows = gl.shadowMap.autoUpdate;
    scene.background = null;
    scene.fog = null;
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(this.target);
    gl.clear(true, true, false);
    gl.render(scene, cam);
    gl.setRenderTarget(prev);
    gl.shadowMap.autoUpdate = shadows;
    scene.background = bg;
    scene.fog = fog;
    for (const o of hidden) o.visible = true;
    for (const [m, mat] of swapped) m.material = mat;
    // world → (u, v, depth), each 0..1
    this.uniforms.uFarShadowMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    this.uniforms.uFarShadowMap.value = this.target.depthTexture;
    this.uniforms.uFarShadowOn.value = 1;
  }

  /** The depth form of a caster's material: its own custom one, or a depth material keeping its cut-out and sides. */
  private depthFor(mesh: Mesh, mat: Material): Material {
    if (mesh.customDepthMaterial) return mesh.customDepthMaterial;
    const src = mat as Material & { map?: Texture | null; alphaMap?: Texture | null };
    if (!(src.alphaTest > 0) && src.side !== DoubleSide) return this.plain;
    let d = this.depthMats.get(mat);
    if (!d) {
      d = new MeshDepthMaterial({ map: src.alphaTest > 0 ? src.map ?? null : null, alphaMap: src.alphaTest > 0 ? src.alphaMap ?? null : null, alphaTest: src.alphaTest, side: src.side });
      this.depthMats.set(mat, d);
    }
    return d;
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
    this.plain.dispose();
  }
}
