import {
  BoxGeometry, Color, DirectionalLight, DoubleSide, EdgesGeometry, FrontSide, HemisphereLight, LineBasicMaterial, LineSegments, Mesh,
  MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Raycaster, Scene, SpotLight,
  Vector2, Vector3, type IUniform, type WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { IndividualRecord } from '../creatures/Individual';
import type { SpeciesDef } from '../data/schemas';
import type { Driver, Floor } from '../creatures/drivers/Driver';
import { DRIVERS } from '../creatures/drivers/index';
import { instantiateModel } from '../creatures/models/ModelLoader';
import { generateIndividual, type Individual } from '../creatures/Individual';
import { hashInts } from '../core/Rng';
import type { BehaviorEvent } from '../creatures/drivers/Driver';
import type { LoadedModel } from '../creatures/models/ModelLoader';
import type { HeroInstance } from '../creatures/species/mahaze/hero/applyHero';
import type { HeroLighting } from '../render/HeroPipeline';
import { makeRippleNormalMap, RIPPLE_NORMAL_GLSL } from '../world/Water';

export const TANK_W = 0.6, TANK_D = 0.3, TANK_H = 0.36, WATER_H = 0.3;
export const TANK_MAX_OCCUPANTS = 4;

export interface Occupant {
  record: IndividualRecord;
  ind: Individual;
  driver: Driver;
  root: Object3D;
  unsub: () => void;
  hero: HeroInstance | null;
}

const CAUSTIC_GLSL = `
float hashT(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoiseT(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashT(i), hashT(i + vec2(1, 0)), f.x), mix(hashT(i + vec2(0, 1)), hashT(i + vec2(1, 1)), f.x), f.y); }
float causticT(vec2 p, float t) {
  float n1 = vnoiseT(p + vec2(t * 0.22, t * 0.17));
  float n2 = vnoiseT(p * 1.31 + vec2(-t * 0.19, t * 0.13) + 5.7);
  float n3 = vnoiseT(p * 0.7 + vec2(t * 0.08, -t * 0.1) + 11.3);
  return pow(1.0 - abs(n1 - n2), 9.0) * 1.6 + pow(1.0 - abs(n2 - n3), 12.0) * 0.8;
}`;

/**
 * The home showcase tank: a 60 cm aquarium in a dark, quiet room under a cool aquarium light. Water is kept almost
 * clear so the animals read well; caustics play on the sand; the camera drifts slowly. Several occupants can live in it.
 */
export class TankScene {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private controls: OrbitControls | null = null;
  readonly occupants: Occupant[] = [];
  private readonly floor: Floor = { heightAt: () => 0, waterAt: () => WATER_H };
  private readonly uTime: IUniform<number> = { value: 0 };
  private readonly hitBox: Mesh;
  private readonly raycaster = new Raycaster();
  private drift = 0;
  onBehavior: ((e: BehaviorEvent, record: IndividualRecord) => void) | null = null;
  heroApply: ((model: LoadedModel) => Promise<HeroInstance>) | null = null;
  readonly lighting: HeroLighting = {
    sunDir: new Vector3(0.12, 0.95, 0.2).normalize(), sunColor: new Color(0.9, 0.97, 1.0), sunIntensity: 2.4,
    skyColor: new Color(0.7, 0.82, 0.9), groundColor: new Color(0.22, 0.2, 0.18), ambientIntensity: 0.5,
    fogColor: new Color(0.1, 0.14, 0.16), fogDensity: 0.2, floorY: 0, underwater: true,
  };

  constructor(private readonly canvas: HTMLCanvasElement, aspect: number, renderer: WebGLRenderer) {
    this.camera = new PerspectiveCamera(40, aspect, 0.003, 20);
    this.scene.background = new Color(0.028, 0.032, 0.036);
    const pmrem = new PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
    // quiet dark room
    const hemi = new HemisphereLight(0x5a6a72, 0x1a1715, 0.35);
    const spot = new SpotLight(0xdff4ff, 5.5, 2.5, 0.75, 0.55, 1.2);
    spot.position.set(0.05, 0.95, 0.08);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    const fill = new DirectionalLight(0xffe9d6, 0.35);
    fill.position.set(0.9, 0.5, 0.8);
    const rim = new DirectionalLight(0x9fc8e8, 0.3);
    rim.position.set(-0.8, 0.4, -0.7);
    this.scene.add(hemi, spot, spot.target, fill, rim);
    const desk = new Mesh(new PlaneGeometry(6, 4), new MeshStandardMaterial({ color: 0x1b1715, roughness: 0.8, metalness: 0.05 }));
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -0.022;
    desk.receiveShadow = true;
    this.scene.add(desk);
    const wall = new Mesh(new PlaneGeometry(6, 3), new MeshStandardMaterial({ color: 0x0f1214, roughness: 1 }));
    wall.position.set(0, 1.4, -1.4);
    this.scene.add(wall);
    const stand = new Mesh(new BoxGeometry(TANK_W + 0.06, 0.02, TANK_D + 0.06), new MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.2 }));
    stand.position.y = -0.011;
    stand.receiveShadow = true;
    this.scene.add(stand);
    // aquarium light bar
    const bar = new Mesh(new BoxGeometry(TANK_W + 0.02, 0.012, 0.05), new MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.4 }));
    bar.position.set(0, TANK_H + 0.07, 0);
    const lamp = new Mesh(new BoxGeometry(TANK_W - 0.02, 0.003, 0.03), new MeshStandardMaterial({ color: 0xffffff, emissive: new Color(0.8, 0.95, 1.0), emissiveIntensity: 3 }));
    lamp.position.set(0, TANK_H + 0.063, 0);
    this.scene.add(bar, lamp);

    // sand with caustics
    const sandMat = new MeshStandardMaterial({ color: 0xb8a98a, roughness: 0.95 });
    const uTime = this.uTime;
    sandMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosT;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPosT = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPosT;\nuniform float uTime;${CAUSTIC_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float grainT = hashT(floor(vWorldPosT.xz * 900.0)) - 0.5;
  float patchT = vnoiseT(vWorldPosT.xz * 14.0) - 0.5;
  diffuseColor.rgb *= 1.0 + grainT * 0.14 + patchT * 0.12;
  float c = causticT(vWorldPosT.xz * 9.0, uTime);
  diffuseColor.rgb *= 1.0 + c * 0.32;
}`);
    };
    sandMat.customProgramCacheKey = () => 'tank-sand';
    const sand = new Mesh(new PlaneGeometry(TANK_W, TANK_D, 1, 1), sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.receiveShadow = true;
    this.scene.add(sand);

    // water: almost clear so the animals read well; a faint tint and a rippled, reflective surface
    const body = new Mesh(new BoxGeometry(TANK_W - 0.004, WATER_H, TANK_D - 0.004), new MeshStandardMaterial({
      color: new Color(0.6, 0.88, 0.84), transparent: true, opacity: 0.05, roughness: 0.08, metalness: 0, side: FrontSide, depthWrite: false, envMapIntensity: 0.4,
    }));
    body.position.y = WATER_H / 2;
    body.renderOrder = 3;
    this.scene.add(body);
    const surfMat = new MeshStandardMaterial({
      color: new Color(0.7, 0.9, 0.88), transparent: true, opacity: 0.2, roughness: 0.03, metalness: 0, depthWrite: false,
      normalMap: makeRippleNormalMap(), normalScale: new Vector2(0.14, 0.14), envMapIntensity: 1.2,
    });
    surfMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uRippleScale = { value: new Vector3(2.0, 7.0, 19.0) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPosW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosW;\nuniform float uTime;\nuniform vec3 uRippleScale;')
        .replace('#include <normal_fragment_maps>', RIPPLE_NORMAL_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 V = normalize(vViewPosition);
  float NdV = clamp(dot(normalize(vNormal), V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  diffuseColor.a = mix(0.12, 0.85, F);
}`);
    };
    surfMat.customProgramCacheKey = () => 'tank-surface';
    const surface = new Mesh(new PlaneGeometry(TANK_W - 0.004, TANK_D - 0.004), surfMat);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = WATER_H;
    surface.renderOrder = 4;
    this.scene.add(surface);

    // glass panels, edges and an invisible hit box for picking
    const glassMat = new MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.0, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
      envMapIntensity: 1.5, side: DoubleSide, depthWrite: false,
    });
    const glassParts: [number, number, number, number, number, number][] = [
      [TANK_W, TANK_H, 0.002, 0, TANK_H / 2, TANK_D / 2], [TANK_W, TANK_H, 0.002, 0, TANK_H / 2, -TANK_D / 2],
      [0.002, TANK_H, TANK_D, TANK_W / 2, TANK_H / 2, 0], [0.002, TANK_H, TANK_D, -TANK_W / 2, TANK_H / 2, 0],
    ];
    for (const [w, h, d, x, y, z] of glassParts) {
      const g = new Mesh(new BoxGeometry(w, h, d), glassMat);
      g.position.set(x, y, z);
      g.renderOrder = 5;
      this.scene.add(g);
    }
    const edges = new LineSegments(new EdgesGeometry(new BoxGeometry(TANK_W, TANK_H, TANK_D)), new LineBasicMaterial({ color: 0x6f8a90, transparent: true, opacity: 0.5 }));
    edges.position.y = TANK_H / 2;
    this.scene.add(edges);
    this.hitBox = new Mesh(new BoxGeometry(TANK_W, TANK_H, TANK_D), new MeshStandardMaterial({ visible: false }));
    this.hitBox.position.y = TANK_H / 2;
    this.hitBox.name = 'tank-hit';
    this.scene.add(this.hitBox);
    this.frameTank();
  }

  /** Default framing: the tank fills roughly two thirds of the width. */
  frameTank(): void {
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
    const dist = (TANK_W / 0.66) / (2 * Math.tan(hfov / 2));
    this.camera.position.set(dist * 0.35, 0.16 + dist * 0.28, dist * 0.95);
    this.camera.lookAt(0, 0.12, 0);
    if (this.controls) { this.controls.target.set(0, 0.12, 0); this.controls.update(); }
  }

  activate(autoRotate = false): void {
    if (!this.controls) {
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.target.set(0, 0.12, 0);
      this.controls.minDistance = 0.05;
      this.controls.maxDistance = 2.2;
      this.controls.maxPolarAngle = Math.PI * 0.49;
      this.controls.enablePan = false;
      this.controls.update();
    }
    this.controls.autoRotate = autoRotate;
    this.controls.autoRotateSpeed = 0.22;
  }

  deactivate(): void {
    this.controls?.dispose();
    this.controls = null;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  get heroActive(): boolean {
    return this.occupants.some((o) => o.hero);
  }

  /** Make the tank hold exactly these records (adds and removes as needed). */
  async setOccupants(records: IndividualRecord[], species: (id: string) => SpeciesDef | undefined): Promise<void> {
    const wanted = new Set(records.map((r) => r.id));
    for (const o of [...this.occupants]) if (!wanted.has(o.record.id)) this.removeOccupant(o.record.id);
    for (const rec of records.slice(0, TANK_MAX_OCCUPANTS)) {
      if (this.occupants.some((o) => o.record.id === rec.id)) continue;
      await this.addOccupant(rec, species(rec.speciesId));
    }
  }

  private async addOccupant(record: IndividualRecord, species: SpeciesDef | undefined): Promise<void> {
    if (!species) return;
    const entry = DRIVERS[species.model.driver ?? ''];
    if (!entry) return;
    const seed = hashInts(record.number, record.caughtAt % 100000);
    const ind = generateIndividual(species, seed, 0, 0, 0, 0, Date.now());
    ind.length_mm = record.length_mm; ind.weight_g = record.weight_g; ind.sex = record.sex; ind.stage = record.stage; ind.traits = [...record.traits];
    const slot = this.occupants.length;
    ind.pos.set((slot % 2 === 0 ? -1 : 1) * 0.12 * Math.ceil(slot / 2), 0, (slot >= 2 ? 0.06 : -0.04));
    ind.home.copy(ind.pos);
    let root: Object3D, bones: Record<string, Object3D> = {}, meshes: Object3D[] = [], extras: Record<string, unknown> = {};
    let hero: HeroInstance | null = null;
    const useHero = !!this.heroApply && !!species.model.hero && !this.occupants.some((o) => o.hero);
    const rel = useHero ? species.model.hero : species.model.lod1 ?? species.model.hero ?? species.model.lod2;
    if (rel) {
      const model = await instantiateModel(rel);
      root = model.root; bones = model.bones as Record<string, Object3D>; meshes = model.meshes; extras = model.extras;
      for (const m of meshes) m.castShadow = true;
      if (useHero && this.heroApply) {
        try { hero = await this.heroApply(model); } catch (err) { console.warn('[hero] tank fallback', err); hero = null; }
      }
    } else if (entry.placeholder) {
      const ph = entry.placeholder();
      ph.root.userData.placeholder = ph;
      root = ph.root;
    } else return;
    if (this.occupants.some((o) => o.record.id === record.id)) { hero?.dispose(); root.removeFromParent(); return; }
    const driver = entry.create();
    const unsub = driver.onEvent((e) => this.onBehavior?.(e, record));
    this.scene.add(root);
    driver.attach(root, ind, extras, bones, meshes);
    root.userData.occupantId = record.id;
    this.occupants.push({ record, ind, driver, root, unsub, hero });
  }

  removeOccupant(id: string): void {
    const i = this.occupants.findIndex((o) => o.record.id === id);
    if (i < 0) return;
    const o = this.occupants[i];
    o.hero?.dispose();
    o.unsub();
    o.driver.dispose();
    o.root.removeFromParent();
    this.occupants.splice(i, 1);
  }

  clearOccupants(): void {
    for (const o of [...this.occupants]) this.removeOccupant(o.record.id);
  }

  /** Pick what is under a canvas point: an occupant, the tank, or nothing. */
  pick(ndcX: number, ndcY: number): { kind: 'occupant'; occupant: Occupant } | { kind: 'tank' } | null {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const roots = this.occupants.map((o) => o.root);
    const hits = this.raycaster.intersectObjects(roots, true);
    if (hits.length) {
      let obj: Object3D | null = hits[0].object;
      while (obj && obj.userData.occupantId === undefined) obj = obj.parent;
      const occ = obj ? this.occupants.find((o) => o.record.id === obj!.userData.occupantId) : undefined;
      if (occ) return { kind: 'occupant', occupant: occ };
    }
    if (this.raycaster.intersectObject(this.hitBox).length) return { kind: 'tank' };
    return null;
  }

  update(dt: number, simScale: number): void {
    this.uTime.value += dt;
    this.drift += dt;
    if (this.controls) {
      this.controls.update();
      // gentle vertical breathing of the view on top of the slow orbit
      this.controls.target.y = 0.12 + Math.sin(this.drift * 0.25) * 0.012;
    }
    for (const o of this.occupants) {
      const d = o.driver;
      if (!d.busy) {
        const r = o.ind.rng.next();
        const S = o.ind.length_mm / 1000;
        if (r < 0.55) d.setIntent({ id: Date.now(), kind: 'rest', urgency: 0, seconds: 6 + o.ind.rng.next() * 20 });
        else if (r < 0.9) {
          const tx = (o.ind.rng.next() - 0.5) * (TANK_W - 4 * S), tz = (o.ind.rng.next() - 0.5) * (TANK_D - 3 * S);
          d.setIntent({ id: Date.now(), kind: 'wander', urgency: 0.3, seconds: 8, target: new Vector3(tx, 0, tz) });
        } else d.setIntent({ id: Date.now(), kind: 'special', urgency: 0, seconds: 3, param: 'yawn' });
      }
      d.update(dt, { floor: this.floor, player: new Vector3(0, 1, 2), simScale, nowMs: Date.now() });
      if (o.hero) o.hero.update(this.camera, d.openings ?? { mouth: 0, gill: 0 });
      const hx = TANK_W / 2 - 0.02, hz = TANK_D / 2 - 0.02;
      o.ind.pos.x = Math.max(-hx, Math.min(hx, o.ind.pos.x));
      o.ind.pos.z = Math.max(-hz, Math.min(hz, o.ind.pos.z));
    }
  }

  dispose(): void {
    this.deactivate();
    this.clearOccupants();
  }
}
