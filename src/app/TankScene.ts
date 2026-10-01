import {
  BoxGeometry, Color, DirectionalLight, EdgesGeometry, HemisphereLight, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PlaneGeometry, Scene, Vector3,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { IndividualRecord } from '../creatures/Individual';
import type { SpeciesDef } from '../data/schemas';
import type { Driver, Floor } from '../creatures/drivers/Driver';
import { DRIVERS } from '../creatures/drivers/index';
import { instantiateModel } from '../creatures/models/ModelLoader';
import { generateIndividual, type Individual } from '../creatures/Individual';
import { hashInts } from '../core/Rng';
import type { BehaviorEvent } from '../creatures/drivers/Driver';

const TANK_W = 0.6, TANK_D = 0.3, TANK_H = 0.36, WATER_H = 0.3;

interface Occupant {
  record: IndividualRecord;
  ind: Individual;
  driver: Driver;
  root: Object3D;
  unsub: () => void;
}

/** 自宅の水槽: a bright 60 cm tank with a sand floor, one occupant and an orbit camera. */
export class TankScene {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private controls: OrbitControls | null = null;
  private occupant: Occupant | null = null;
  private readonly floor: Floor = { heightAt: () => 0, waterAt: () => WATER_H };
  private autoTimer = 0;
  onBehavior: ((e: BehaviorEvent) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, aspect: number) {
    this.camera = new PerspectiveCamera(45, aspect, 0.003, 20);
    this.camera.position.set(0.55, 0.32, 0.6);
    this.scene.background = new Color(0.86, 0.9, 0.9);
    const hemi = new HemisphereLight(0xdfe9ec, 0x8a7a63, 1.1);
    const key = new DirectionalLight(0xfff6ea, 2.0);
    key.position.set(0.3, 1.2, 0.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -0.5; key.shadow.camera.right = 0.5; key.shadow.camera.top = 0.5; key.shadow.camera.bottom = -0.5;
    key.shadow.camera.near = 0.1; key.shadow.camera.far = 4;
    this.scene.add(hemi, key);
    const sand = new Mesh(new PlaneGeometry(TANK_W, TANK_D, 1, 1), new MeshStandardMaterial({ color: 0xcdbf9f, roughness: 0.95 }));
    sand.rotation.x = -Math.PI / 2;
    sand.receiveShadow = true;
    this.scene.add(sand);
    const stand = new Mesh(new BoxGeometry(TANK_W + 0.06, 0.02, TANK_D + 0.06), new MeshStandardMaterial({ color: 0x3a3330, roughness: 0.6 }));
    stand.position.y = -0.011;
    this.scene.add(stand);
    const glass = new LineSegments(new EdgesGeometry(new BoxGeometry(TANK_W, TANK_H, TANK_D)), new LineBasicMaterial({ color: 0x9fb8bd, transparent: true, opacity: 0.6 }));
    glass.position.y = TANK_H / 2;
    this.scene.add(glass);
    const water = new Mesh(new PlaneGeometry(TANK_W, TANK_D), new MeshStandardMaterial({ color: 0x9fd0d8, transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_H;
    this.scene.add(water);
  }

  activate(): void {
    if (this.controls) return;
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.06, 0);
    this.controls.minDistance = 0.03;
    this.controls.maxDistance = 2.5;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.update();
  }

  deactivate(): void {
    this.controls?.dispose();
    this.controls = null;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  get occupantId(): string | null {
    return this.occupant?.record.id ?? null;
  }

  async setOccupant(record: IndividualRecord | null, species: SpeciesDef | undefined): Promise<void> {
    this.clearOccupant();
    if (!record || !species) return;
    const entry = DRIVERS[species.model.driver ?? ''];
    if (!entry) return;
    const seed = hashInts(record.number, record.caughtAt % 100000);
    const ind = generateIndividual(species, seed, 0, 0, 0, 0, Date.now());
    ind.length_mm = record.length_mm; ind.weight_g = record.weight_g; ind.sex = record.sex; ind.stage = record.stage; ind.traits = [...record.traits];
    ind.pos.set(0, 0, 0);
    ind.home.set(0, 0, 0);
    let root: Object3D, bones: Record<string, Object3D> = {}, meshes: Object3D[] = [], extras: Record<string, unknown> = {};
    const rel = species.model.lod1 ?? species.model.hero ?? species.model.lod2;
    if (rel) {
      const model = await instantiateModel(rel);
      root = model.root; bones = model.bones as Record<string, Object3D>; meshes = model.meshes; extras = model.extras;
      for (const m of meshes) m.castShadow = true;
    } else if (entry.placeholder) {
      const ph = entry.placeholder();
      ph.root.userData.placeholder = ph;
      root = ph.root;
    } else return;
    if (this.occupant) { root.removeFromParent(); return; }
    const driver = entry.create();
    const unsub = driver.onEvent((e) => this.onBehavior?.(e));
    this.scene.add(root);
    driver.attach(root, ind, extras, bones, meshes);
    this.occupant = { record, ind, driver, root, unsub };
    this.autoTimer = 1;
    const anchor = driver.anchor();
    this.controls?.target.copy(anchor);
    const dist = Math.max(0.2, (ind.length_mm / 1000) * 3.5);
    this.camera.position.set(anchor.x + dist * 0.7, anchor.y + dist * 0.55, anchor.z + dist * 0.8);
    this.controls?.update();
  }

  clearOccupant(): void {
    if (!this.occupant) return;
    this.occupant.unsub();
    this.occupant.driver.dispose();
    this.occupant.root.removeFromParent();
    this.occupant = null;
  }

  update(dt: number, simScale: number): void {
    this.controls?.update();
    const o = this.occupant;
    if (!o) return;
    // simple autonomy: rest, wander inside the tank, occasional yawn
    this.autoTimer -= dt * simScale;
    if (!o.driver.busy && this.autoTimer <= 0) {
      const r = o.ind.rng.next();
      const S = o.ind.length_mm / 1000;
      if (r < 0.55) o.driver.setIntent({ id: Date.now(), kind: 'rest', urgency: 0, seconds: 6 + o.ind.rng.next() * 20 });
      else if (r < 0.9) {
        const tx = (o.ind.rng.next() - 0.5) * (TANK_W - 4 * S), tz = (o.ind.rng.next() - 0.5) * (TANK_D - 3 * S);
        o.driver.setIntent({ id: Date.now(), kind: 'wander', urgency: 0.3, seconds: 8, target: new Vector3(tx, 0, tz) });
      } else o.driver.setIntent({ id: Date.now(), kind: 'special', urgency: 0, seconds: 3, param: 'yawn' });
      this.autoTimer = 0.5;
    }
    o.driver.update(dt, { floor: this.floor, player: new Vector3(0, 1, 2), simScale, nowMs: Date.now() });
    // keep inside the glass
    const half = new Vector3(TANK_W / 2 - 0.02, 0, TANK_D / 2 - 0.02);
    o.ind.pos.x = Math.max(-half.x, Math.min(half.x, o.ind.pos.x));
    o.ind.pos.z = Math.max(-half.z, Math.min(half.z, o.ind.pos.z));
  }

  dispose(): void {
    this.deactivate();
    this.clearOccupant();
  }
}
