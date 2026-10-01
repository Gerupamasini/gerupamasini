import {
  AnimationMixer, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry,
  PMREMGenerator, Scene, Vector3, WebGLRenderer, ACESFilmicToneMapping, SRGBColorSpace, Box3,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { SpeciesDef } from '../../data/schemas';
import { instantiateModel } from '../../creatures/models/ModelLoader';
import { DRIVERS } from '../../creatures/drivers/index';

/** Small turntable viewer for the species' best model in the 図鑑. Owns its own renderer and canvas. */
export class ModelPreview {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private controls: OrbitControls;
  private mixer: AnimationMixer | null = null;
  private root: Object3D | null = null;
  private raf = 0;
  private last = 0;
  private disposed = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.camera = new PerspectiveCamera(35, 1, 0.002, 20);
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.7;
    this.scene.add(new HemisphereLight(0xdfe9ec, 0x6b5e4e, 0.8));
    const key = new DirectionalLight(0xfff4e8, 1.6);
    key.position.set(0.4, 1.0, 0.6);
    this.scene.add(key);
    const floor = new Mesh(new PlaneGeometry(2, 2), new MeshStandardMaterial({ color: new Color(0.62, 0.56, 0.44), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.2;
    this.controls.enablePan = false;
    this.resize();
    this.loop(performance.now());
  }

  resize(): void {
    const w = this.canvas.clientWidth || 320, h = this.canvas.clientHeight || 240;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async show(species: SpeciesDef, idleClip = 'Idle'): Promise<void> {
    this.clear();
    const rel = species.model.hero ?? species.model.lod1 ?? species.model.lod2;
    let root: Object3D;
    if (rel) {
      const model = await instantiateModel(rel);
      if (this.disposed) { model.root.removeFromParent(); return; }
      root = model.root;
      for (const m of model.meshes) { m.frustumCulled = false; m.layers.set(0); }
      const clip = model.clips.find((c) => c.name === idleClip) ?? model.clips[0];
      if (clip) {
        this.mixer = new AnimationMixer(root);
        this.mixer.clipAction(clip).play();
      }
    } else {
      const entry = DRIVERS[species.model.driver ?? ''];
      if (!entry?.placeholder) return;
      root = entry.placeholder().root;
    }
    this.root = root;
    this.scene.add(root);
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    const size = new Vector3(); box.getSize(size);
    const center = new Vector3(); box.getCenter(center);
    root.position.y -= box.min.y;
    center.y -= box.min.y;
    const radius = Math.max(size.x, size.y, size.z) * 0.6 || 0.05;
    this.controls.target.copy(center);
    this.controls.minDistance = radius * 0.6;
    this.controls.maxDistance = radius * 8;
    this.camera.position.set(center.x + radius * 1.6, center.y + radius * 1.1, center.z + radius * 2.2);
    this.controls.update();
  }

  clear(): void {
    if (this.root) { this.root.removeFromParent(); this.root = null; }
    this.mixer = null;
  }

  private loop(now: number): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame((n) => this.loop(n));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.mixer?.update(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
