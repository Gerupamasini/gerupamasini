import {
  BoxGeometry, CanvasTexture, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera,
  PlaneGeometry, Plane, PMREMGenerator, Raycaster, Scene, SpotLight, Vector2, Vector3, type IUniform, type Material, type ShaderMaterial,
  type WebGLRenderer, SRGBColorSpace,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { IndividualRecord } from '../creatures/Individual';
import type { SpeciesDef } from '../data/schemas';
import type { Driver, Floor, DriverContext } from '../creatures/drivers/Driver';
import { DRIVERS } from '../creatures/drivers/index';
import { instantiateModel } from '../creatures/models/ModelLoader';
import { modelFor, variantOf } from '../creatures/models/choice';
import { generateIndividual, type Individual } from '../creatures/Individual';
import { hashInts } from '../core/Rng';
import type { BehaviorEvent } from '../creatures/drivers/Driver';
import type { LoadedModel } from '../creatures/models/ModelLoader';
import type { HeroInstance } from '../creatures/species/mahaze/hero/applyHero';
import type { HeroLighting } from '../render/HeroPipeline';
import { buildTankItem, defaultTankLayout, ITEM_RADIUS, TANK_MAX_ITEMS, type TankItem, type TankItemType, type TankLayout, type TankSubstrate } from './TankLayout';
import { Box3, Group } from 'three';
import { AquariumEquipment, STANDARD_TANK, type TankDimensions } from '../aquarium';
import { MAX_TANK_ANIMALS, animalSlotPosition } from '../aquarium/progression';
import { ToolShelf, type ShelfTool } from './ToolShelf';
import { QUALITY_PRESETS, type QualityPreset } from '../core/Settings';
import { TankWaterSim } from '../render/tank/TankWaterSim';
import { WaterPasses } from '../render/tank/WaterPasses';
import { createScreenUniforms, LAYER_OVER } from '../render/tank/TankRenderer';
import { Substrate, BED_H } from '../render/tank/Substrate';
import { Motes, RoomProbe, glassEdgeMaterial } from '../render/tank/TankFx';
import { cloneForTank, lightByCaustics } from '../render/tank/causticMaterial';
import { AnimalContacts } from '../creatures/physics/animals';
import type { ContactBody } from '../creatures/physics/contacts';

const UP = new Vector3(0, 1, 0);

export const TANK_W = 0.6, TANK_D = 0.3, TANK_H = 0.36, WATER_H = 0.3;
export const TANK_MAX_OCCUPANTS = MAX_TANK_ANIMALS;
/** The cabinet is 73 cm tall; keep aquarium coordinates local to its top. */
export const TANK_OFFSET_Y = 0.73;
/** mean depth of the sand bed (m) */
export const SAND_H = BED_H;

export interface Occupant {
  record: IndividualRecord;
  species: SpeciesDef;
  ind: Individual;
  driver: Driver;
  /** its body for the contacts between the tank's animals */
  body?: ContactBody;
  root: Object3D;
  unsub: () => void;
  hero: HeroInstance | null;
}

const TX = TANK_W / 2, TZ = TANK_D / 2, W_LEVEL = WATER_H;
/** absorption per metre: red goes first, so a long path looks blue-green; a little fine silt keeps it from being glass */
const W_ABSORB: [number, number, number] = [0.42, 0.085, 0.06];
const W_LAMP_Y = TANK_H + 0.063, W_LAMP_HALF = TANK_W / 2 - 0.02;
const LAMP_RGB: [number, number, number] = [0.87, 0.96, 1.0];

/**
 * The home showcase tank: an aquarium in a dark, quiet room under a cool LED bar. The water is drawn by the tank
 * renderer (render/tank): refraction through the glass and the moving surface, the underside of the surface as a
 * mirror, the side panes as mirrors at a slant, absorption and scattering, light shafts with the animals' shadows in
 * them. The bar's light reaches the sand and the animals through the moving surface as a caustic net. The bed is a
 * relief the animals stand on, cut against the glass. Several occupants can live in it; the player moves the view.
 */
export class TankScene {
  readonly scene = new Scene();
  readonly aquariumRoot = new Group();
  readonly camera: PerspectiveCamera;
  private controls: OrbitControls | null = null;
  private viewInputEnabled = true;
  /** the tool shelf on the wall, and the camera's move between the tank and it */
  readonly shelf = new ToolShelf();
  private view: 'tank' | 'shelf' = 'tank';
  private readonly camFrom = { p: new Vector3(), t: new Vector3() };
  private readonly camTo = { p: new Vector3(), t: new Vector3() };
  private readonly camCur = { t: new Vector3(0, TANK_OFFSET_Y + 0.12, 0) };
  private camT = 1;
  readonly occupants: Occupant[] = [];
  /** the tank's animals push each other aside instead of passing through */
  private readonly contacts = new AnimalContacts();
  /** mean top of the substrate: the decorations and the caustics sit on it; the animals stand on its relief */
  private sandTop = SAND_H;
  private readonly floor: Floor = { heightAt: (x, z) => this.substrate.heightAt(x, z), waterAt: () => this.dimensions.waterHeight };
  private readonly hitBox: Mesh;
  private readonly raycaster = new Raycaster();
  private readonly waterPlane = new Plane(new Vector3(0, 1, 0), -W_LEVEL - TANK_OFFSET_Y);
  private readonly floorPlane = new Plane(new Vector3(0, 1, 0), -TANK_OFFSET_Y - SAND_H);
  // layout: substrate and decorations
  private layout: TankLayout = defaultTankLayout();
  private readonly itemsRoot = new Group();
  private readonly nudgeV = new Vector3();
  private readonly nudgeV2 = new Vector3();
  private readonly nudgeV3 = new Vector3();
  private readonly itemObjects = new Map<string, Object3D>();
  private itemSeq = 0;
  /** the tank's shared uniform block: the water, the caustic light on the materials, the passes */
  readonly U: Record<string, IUniform>;
  readonly water: TankWaterSim;
  /** the water/glass and light-shaft passes the tank renderer draws over the scene */
  readonly passes: WaterPasses;
  readonly substrate: Substrate;
  private readonly motes: Motes;
  private readonly probe: RoomProbe;
  private readonly glassEdgeMat: ShaderMaterial;
  private preset = QUALITY_PRESETS.mid;
  private occupantGeneration = 0;
  private occupantRecords: IndividualRecord[] = [];
  private speciesLookup: ((id: string) => SpeciesDef | undefined) | null = null;
  waves_ = 0.8;
  turb = 0.5;
  dimensions: TankDimensions = { ...STANDARD_TANK };
  equipment = new AquariumEquipment(this.dimensions);
  private readonly lampLight: SpotLight;
  private readonly lampOffset = new Vector3(0, 0.035, 0);
  /** what the drivers are told each frame (one object, refilled) */
  private readonly driverCtx: DriverContext;
  private readonly bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  onBehavior: ((e: BehaviorEvent, record: IndividualRecord) => void) | null = null;
  heroApply: ((model: LoadedModel) => Promise<HeroInstance>) | null = null;
  readonly lighting: HeroLighting = {
    sunDir: new Vector3(0.12, 0.95, 0.2).normalize(), sunColor: new Color(0.9, 0.97, 1.0), sunIntensity: 2.4,
    skyColor: new Color(0.7, 0.82, 0.9), groundColor: new Color(0.22, 0.2, 0.18), ambientIntensity: 0.5,
    fogColor: new Color(0.1, 0.14, 0.16), fogDensity: 0.2, floorY: TANK_OFFSET_Y, underwater: true,
  };

  constructor(private readonly canvas: HTMLCanvasElement, aspect: number, private readonly gl: WebGLRenderer) {
    this.camera = new PerspectiveCamera(40, aspect, 0.003, 20);
    this.scene.background = new Color(0.028, 0.032, 0.036);
    this.aquariumRoot.name = 'raisedAquarium'; this.aquariumRoot.position.y = TANK_OFFSET_Y;
    this.scene.add(this.aquariumRoot);
    const pmrem = new PMREMGenerator(gl);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
    pmrem.dispose();
    // quiet dark room
    const hemi = new HemisphereLight(0x5a6a72, 0x1a1715, 0.3);
    const spot = new SpotLight(0xdff4ff, 1.8, 2.5, 0.75, 0.55, 1.2);
    spot.position.set(0.05, 0.95, 0.08);
    spot.target.position.set(0, 0, 0);
    this.lampLight = spot;
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.camera.near = 0.05;
    const fill = new DirectionalLight(0xffe9d6, 0.3);
    fill.position.set(0.9, 0.5, 0.8);
    const rim = new DirectionalLight(0x9fc8e8, 0.3);
    rim.position.set(-0.8, 0.4, -0.7);
    this.scene.add(hemi, spot, spot.target, fill, rim);
    const desk = new Mesh(new PlaneGeometry(6, 4), new MeshStandardMaterial({ color: 0x1b1715, roughness: 0.8, metalness: 0.05 }));
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = TANK_OFFSET_Y - 0.738; desk.name = 'roomFloor';
    desk.receiveShadow = true;
    this.scene.add(desk);
    const wall = new Mesh(new PlaneGeometry(6, 3), new MeshStandardMaterial({ color: 0x0f1214, roughness: 1 }));
    wall.position.set(0, 1.4, -1.4);
    this.scene.add(wall);
    this.aquariumRoot.add(this.equipment);
    this.equipment.onRipple = (x, z, strength) => this.addRipple(x, z, strength, 0.009);
    this.scene.add(this.shelf.group);
    // a window on the back wall, the bay at night outside
    const night = makeNightWindow();
    const win = new Mesh(new PlaneGeometry(1.05, 0.72), new MeshStandardMaterial({ map: night, emissive: new Color(0xffffff), emissiveMap: night, emissiveIntensity: 0.55, roughness: 1 }));
    win.position.set(1.05, 0.9, -1.39);
    this.scene.add(win);
    const frameMat = new MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.2 });
    for (const [w, h, x, y] of [[1.11, 0.03, 1.05, 1.275], [1.11, 0.03, 1.05, 0.525], [0.03, 0.78, 0.51, 0.9], [0.03, 0.78, 1.59, 0.9], [0.02, 0.72, 1.05, 0.9]] as [number, number, number, number][]) {
      const f = new Mesh(new BoxGeometry(w, h, 0.03), frameMat);
      f.position.set(x, y, -1.38);
      this.scene.add(f);
    }

    // ---- the water: the tank's shared uniforms, the surface simulation, the passes over the scene
    const floatRT = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
    this.probe = new RoomProbe(floatRT);
    this.U = {
      uTankHalf: { value: new Vector2(TX, TZ) }, uWaterLevel: { value: W_LEVEL }, uLampHalf: { value: W_LAMP_HALF }, uTankOrigin: { value: this.aquariumRoot.position },
      uLampPosition: { value: new Vector3(0, W_LAMP_Y, 0) }, uLampAxis: { value: new Vector3(1, 0, 0) },
      uLampCol: { value: new Color(...LAMP_RGB).multiplyScalar(3.0) }, uFloorY: { value: SAND_H }, uAbsorb: { value: new Vector3(...W_ABSORB) },
      uTime: { value: 0 }, uBounce: { value: 0.1 },
      uEnv: { value: this.probe.texture }, uEnvLod: { value: this.probe.maxLod }, uEnvGain: { value: 1.0 }, uLampRadiance: { value: 14 },
    };
    this.water = new TankWaterSim(gl, this.U);
    this.passes = new WaterPasses(this.U, createScreenUniforms(), this.aquariumRoot.position);
    this.passes.onBeforeRender = (camera) => this.beforePasses(camera);
    // the bed, lit by the caustics, and the specks in the water
    this.substrate = new Substrate(this.U);
    this.aquariumRoot.add(this.substrate.root);
    this.aquariumRoot.add(this.itemsRoot);
    this.motes = new Motes(this.U);
    this.aquariumRoot.add(this.motes);
    // the panes: their cut edges with the scene, their faces in the water pass
    this.glassEdgeMat = glassEdgeMaterial(this.U, { uTankTop: this.passes.P.uTankTop });
    this.equipment.onTankChanged = () => this.useGlassEdges();
    this.equipment.onTankChanged();
    this.hitBox = new Mesh(new BoxGeometry(TANK_W, TANK_H, TANK_D), new MeshStandardMaterial({ visible: false }));
    this.hitBox.position.y = TANK_H / 2;
    this.hitBox.name = 'tank-hit';
    this.aquariumRoot.add(this.hitBox);
    this.driverCtx = { floor: this.floor, player: new Vector3(0, 1, 2), simScale: 1, nowMs: 0, bounds: this.bounds, canBurrow: true };
    // picking sees every layer (the hero fish, the lid drawn over the water)
    this.raycaster.layers.enableAll();
    this.applyDimensions();
    this.applyPreset();
    this.frameTank();
  }

  /** The tank's glass panes: their cut edges in the scene, their faces in the water pass. */
  private useGlassEdges(): void {
    const glass = this.equipment.materials.glass;
    this.equipment.tank.traverse((o) => { if (o instanceof Mesh && o.material === glass) { o.material = this.glassEdgeMat; o.castShadow = false; } });
  }

  /**
   * Transparent equipment wholly above the water (a glass lid, the clear trims on the rims) is drawn after the water
   * pass, which would otherwise bend it like something seen through the water. Checked now and then: the equipment
   * changes in the editor.
   */
  private overlayAcc = 1;
  private readonly overlayBox = new Box3();
  private sortOverlay(dt: number): void {
    this.overlayAcc += dt;
    if (this.overlayAcc < 0.5) return;
    this.overlayAcc = 0;
    const top = this.aquariumRoot.position.y + this.dimensions.waterHeight + 0.002;
    let any = false;
    this.equipment.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some((m) => m.transparent)) { if (o.layers.isEnabled(LAYER_OVER)) o.layers.set(0); return; }
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const above = this.overlayBox.copy(o.geometry.boundingBox!).applyMatrix4(o.matrixWorld).min.y > top;
      if (above !== o.layers.isEnabled(LAYER_OVER)) o.layers.set(above ? LAYER_OVER : 0);
      any ||= above;
    });
    this.passes.hasOverlay = any;
  }

  /**
   * The bar's shadow map: the animals move slowly, so below the top tier it is drawn every other frame (the stones
   * and the equipment never move on their own; the editor redraws it on every change).
   */
  private shadowTick = 0;
  private stepShadows(): void {
    const s = this.lampLight.shadow;
    s.autoUpdate = false;
    if (this.preset.shadowMapSize >= 2048 || (this.shadowTick++ & 1) === 0) s.needsUpdate = true;
  }

  /** Per frame, before the passes over the tank: the shadow map for the shafts, the light in the water. */
  private beforePasses(camera: PerspectiveCamera): void {
    const P = this.passes.P, lamp = this.U.uLampCol.value as Color;
    this.passes.setVisible(this.aquariumRoot.visible);
    P.uShadowMap.value = this.lampLight.castShadow ? this.lampLight.shadow.map?.depthTexture ?? null : null;
    P.uShadowMatrix.value = this.lampLight.shadow.matrix;
    // the water's own glow (the bar's light scattered many times) and the light shafts follow the bar's brightness
    P.uScatterCol.value.setRGB(lamp.r * 0.011, lamp.g * 0.026, lamp.b * 0.03);
    P.uDeepCol.value.setRGB(lamp.r * 0.006, lamp.g * 0.016, lamp.b * 0.019);
    P.uMeniscusCol.value.copy(lamp).multiplyScalar(0.16);
    this.motes.setPixelScale(this.gl.getDrawingBufferSize(this.tmpV2).y / (2 * Math.tan((camera.fov * Math.PI) / 360)));
  }
  private readonly tmpV2 = new Vector2();

  private applyDimensions(): void {
    const { width: w, depth: d, height: h, waterHeight, glass } = this.dimensions;
    (this.U.uTankHalf.value as Vector2).set(w / 2, d / 2); this.U.uWaterLevel.value = waterHeight; this.U.uLampHalf.value = w / 2 - 0.02;
    this.waterPlane.constant = -waterHeight - TANK_OFFSET_Y;
    this.hitBox.geometry.dispose(); this.hitBox.geometry = new BoxGeometry(w, h, d); this.hitBox.position.y = h / 2;
    this.water.setDimensions(w, d);
    this.passes.setDimensions(w, d, h, glass);
    this.substrate.setDimensions(w, d);
    this.probe.markDirty();
  }

  /** Resize only the container and water. Animals and decorations keep their physical sizes. */
  setDimensions(dimensions: TankDimensions): void {
    if (this.dimensions.width === dimensions.width && this.dimensions.height === dimensions.height) return;
    this.clearOccupants(); this.dimensions = { ...dimensions };
    this.equipment.dispose(); this.equipment = new AquariumEquipment(this.dimensions);
    this.aquariumRoot.add(this.equipment);
    this.equipment.onRipple = (x, z, strength) => this.addRipple(x, z, strength, 0.009);
    this.equipment.onTankChanged = () => this.useGlassEdges();
    this.equipment.onTankChanged();
    this.applyDimensions();
    this.applySubstrate();
  }

  setRoomPosition(position: [number, number]): void {
    this.aquariumRoot.position.set(position[0], TANK_OFFSET_Y, position[1]);
    this.updateEquipmentLighting();
    this.probe.markDirty();
  }
  setPresent(on: boolean): void { this.aquariumRoot.visible = on; this.lampLight.visible = on; this.passes.setVisible(on); this.probe.markDirty(); }
  /** Something in the room changed (the other tanks, the shelf): the reflections are drawn again. */
  markRoomChanged(): void { this.probe.markDirty(); }

  frameRoom(): void {
    this.view = 'tank'; this.camT = 1;
    const hfov = 2 * Math.atan(Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect);
    const distance = Math.max(4.3, 5.7 / (0.85 * 2 * Math.tan(hfov / 2)));
    this.camera.far = 50; this.camera.updateProjectionMatrix();
    if (this.controls) this.controls.maxDistance = 30;
    this.camera.position.set(0, 2.3, distance); this.camCur.t.set(0, 0.6, 0.25);
    this.camera.lookAt(this.camCur.t);
    if (this.controls) { this.controls.target.copy(this.camCur.t); this.controls.update(); }
  }

  /** Default framing: the tank fills roughly two thirds of the width. */
  frameTank(fitHeight = false): void {
    if (this.controls) this.controls.maxDistance = Math.max(3.2, this.dimensions.width * 7);
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
    const widthDistance = (this.dimensions.width / 0.66) / (2 * Math.tan(hfov / 2));
    const heightDistance = fitHeight ? (this.dimensions.height + 0.16) / (0.8 * 2 * Math.tan(this.camera.fov * Math.PI / 360)) : 0;
    const dist = Math.max(widthDistance, heightDistance);
    if (fitHeight) { this.view = 'tank'; this.camT = 1; }
    this.camera.position.set(dist * 0.35 + this.aquariumRoot.position.x, TANK_OFFSET_Y + 0.16 + dist * 0.28, dist * 0.95 + this.aquariumRoot.position.z);
    this.camera.lookAt(this.aquariumRoot.position.x, TANK_OFFSET_Y + 0.12, this.aquariumRoot.position.z);
    if (this.controls) { this.controls.target.set(this.aquariumRoot.position.x, TANK_OFFSET_Y + 0.12, this.aquariumRoot.position.z); this.controls.update(); }
  }

  captureView() {
    return { position: this.camera.position.clone(), target: (this.camT < 1 || this.view === 'shelf' ? this.camCur.t : this.controls?.target ?? this.camCur.t).clone(), view: this.view };
  }

  restoreView(state: ReturnType<TankScene['captureView']>): void {
    this.view = state.view; this.camT = 1;
    this.camera.position.copy(state.position); this.camCur.t.copy(state.target);
    this.camera.lookAt(state.target);
    if (this.controls) { this.controls.target.copy(state.target); this.controls.update(); }
  }

  activate(autoRotate = false): void {
    if (!this.controls) {
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.target.set(this.aquariumRoot.position.x, TANK_OFFSET_Y + 0.12, this.aquariumRoot.position.z);
      // right up to the glass (the camera's near plane is 3 mm) and back to the far wall
      this.controls.minDistance = 0.012;
      this.controls.maxDistance = 3.2;
      this.controls.maxPolarAngle = Math.PI * 0.49;
      this.controls.enablePan = true;
      this.controls.panSpeed = 0.6;
      this.controls.screenSpacePanning = true;
      this.controls.zoomSpeed = 1.1;
      this.controls.update();
    }
    this.controls.autoRotate = autoRotate;
    this.controls.autoRotateSpeed = 0.22;
    // Home stops moving as soon as the player releases the mouse or a movement key.
    this.controls.enableDamping = autoRotate;
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

  // ------------------------------------------------------------------ layout: substrate and decorations
  get currentLayout(): TankLayout {
    return { substrate: this.layout.substrate, items: this.layout.items.map((i) => ({ ...i })), equipment: this.equipment.currentLayout };
  }

  setLayout(layout: TankLayout): void {
    this.layout = { substrate: layout.substrate, items: layout.items.map((i) => ({ ...i })) };
    this.equipment.setLayout(layout.equipment);
    this.equipment.applyPreset();
    if (!layout.equipment && layout.substrate === 'none') this.moveBottomEquipment(-SAND_H);
    this.applySubstrate();
    for (const o of this.itemObjects.values()) { this.disposeLitMaterials(o); o.traverse((m) => { if (m instanceof Mesh) m.geometry.dispose(); }); o.removeFromParent(); }
    this.itemObjects.clear();
    for (const it of this.layout.items) this.spawnItem(it);
  }

  setSubstrate(s: TankSubstrate): void {
    const previous = this.sandTop;
    this.layout.substrate = s;
    this.applySubstrate();
    this.moveBottomEquipment(this.sandTop - previous, previous);
  }

  /** Keep equipment resting on the bed when its thickness changes; retain manually raised placements. */
  private moveBottomEquipment(delta: number, previous = SAND_H): void {
    if (!delta) return;
    for (const r of this.equipment.currentLayout.devices) {
      if (!['airStone', 'spongeFilter', 'circulationPump'].includes(r.kind) || Math.abs(r.position[1] - previous) > 0.025) continue;
      const position = [...r.position] as [number, number, number]; position[1] = Math.max(0, position[1] + delta);
      this.equipment.changeDevice(r.id, { position });
    }
  }

  private applySubstrate(): void {
    this.substrate.setKind(this.layout.substrate);
    this.sandTop = this.substrate.mean;
    this.floorPlane.constant = -TANK_OFFSET_Y - this.sandTop;
    this.lighting.floorY = TANK_OFFSET_Y + this.sandTop;
    this.U.uFloorY.value = this.sandTop;
    for (const o of this.occupants) o.ind.pos.y = this.substrate.heightAt(o.ind.pos.x, o.ind.pos.z);
    for (const it of this.layout.items) this.itemObjects.get(it.id)?.position.set(it.x, this.itemY(it.x, it.z), it.z);
  }

  /** a decoration's foot: on the relief, sunk a couple of millimetres into it */
  private itemY(x: number, z: number): number {
    return this.layout.substrate === 'none' ? 0 : this.substrate.heightAt(x, z) - 0.002;
  }

  private spawnItem(it: TankItem): void {
    const seed = [...it.id].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);   // the same id always gives the same shape
    const obj = buildTankItem(it.type, seed);
    const meshes: Mesh[] = [];
    obj.traverse((o) => { if ((o as Mesh).isMesh) { const m = o as Mesh; m.castShadow = m.castShadow !== false && it.type !== 'plant'; m.receiveShadow = true; meshes.push(m); } });
    this.lightMeshesByCaustics(meshes, it.type === 'plant');
    obj.position.set(it.x, this.itemY(it.x, it.z), it.z);
    obj.rotation.y = it.rot;
    obj.userData.itemId = it.id;
    this.itemsRoot.add(obj);
    this.itemObjects.set(it.id, obj);
  }

  /** Add a decoration at a free spot; null when the tank is full. */
  addItem(type: TankItemType): TankItem | null {
    if (this.layout.items.length >= TANK_MAX_ITEMS) return null;
    const r = ITEM_RADIUS[type];
    let best: [number, number] = [0, 0], bestD = -1;
    for (let k = 0; k < 24; k++) {
      const x = (Math.random() * 2 - 1) * ((this.dimensions.width / 2) - r - 0.02), z = (Math.random() * 2 - 1) * ((this.dimensions.depth / 2) - r - 0.02);
      let d = 1;
      for (const o of this.layout.items) d = Math.min(d, Math.hypot(o.x - x, o.z - z) - ITEM_RADIUS[o.type] - r);
      if (d > bestD) { bestD = d; best = [x, z]; }
    }
    const it: TankItem = { id: `i${Date.now().toString(36)}${(this.itemSeq++).toString(36)}`, type, x: best[0], z: best[1], rot: Math.random() * Math.PI * 2 };
    this.layout.items.push(it);
    this.spawnItem(it);
    return it;
  }

  removeItem(id: string): void {
    const obj = this.itemObjects.get(id);
    if (obj) { this.disposeLitMaterials(obj); obj.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); }); obj.removeFromParent(); }
    this.itemObjects.delete(id);
    this.layout.items = this.layout.items.filter((i) => i.id !== id);
  }

  rotateItem(id: string, delta: number): void {
    const it = this.layout.items.find((i) => i.id === id), obj = this.itemObjects.get(id);
    if (!it || !obj) return;
    it.rot += delta;
    obj.rotation.y = it.rot;
  }

  /** The decoration under a canvas point (NDC), if any. */
  pickItem(ndcX: number, ndcY: number): string | null {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects(this.itemsRoot.children, true);
    for (const hit of hits) {
      let o: Object3D | null = hit.object;
      while (o && o.userData.itemId === undefined) o = o.parent;
      if (o) return o.userData.itemId as string;
    }
    return null;
  }

  /** Clicking a visible aquarium interior selects its item card. */
  pickEquipment(ndcX: number, ndcY: number): string | null {
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects([this.equipment.stand, ...this.equipment.devices.values()], true);
    for (const hit of hits) {
      let o: Object3D | null = hit.object;
      if (!(o instanceof Mesh) || !o.visible) continue;
      // Raycaster also visits hidden LOD children: only the currently drawn level is selectable.
      let visible = true;
      while (o && o !== this.equipment) { if (!o.visible) visible = false; if (o.userData.equipmentId) break; o = o.parent; }
      if (visible && o?.userData.equipmentId) return o.userData.equipmentId as string;
    }
    return this.raycaster.intersectObject(this.hitBox).length ? 'tank' : null;
  }

  /** Drag a decoration to where a canvas point (NDC) meets the sand, kept inside the tank. */
  moveItem(id: string, ndcX: number, ndcY: number): void {
    const it = this.layout.items.find((i) => i.id === id), obj = this.itemObjects.get(id);
    if (!it || !obj) return;
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const hit = new Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit)) return;
    const r = ITEM_RADIUS[it.type];
    hit.sub(this.aquariumRoot.position);
    it.x = Math.max(-(this.dimensions.width / 2) + r, Math.min((this.dimensions.width / 2) - r, hit.x));
    it.z = Math.max(-(this.dimensions.depth / 2) + r, Math.min((this.dimensions.depth / 2) - r, hit.z));
    obj.position.set(it.x, this.itemY(it.x, it.z), it.z);
  }

  setAutoRotate(on: boolean): void {
    if (this.controls) this.controls.autoRotate = on;
  }

  setControlsEnabled(on: boolean): void {
    if (this.controls) this.controls.enabled = on && this.viewInputEnabled;
  }

  /** Home can lock touch navigation even after a shelf/tank camera transition completes. */
  setViewInputEnabled(on: boolean): void {
    this.viewInputEnabled = on;
    this.setControlsEnabled(on);
  }

  /** A splash on the surface at (x, z): a ripple spreads from it. */
  addRipple(x: number, z: number, heightMm = 3, radius = 0.012): void {
    this.water.addRipple(x, z, heightMm, radius);
  }

  /** A click on the water surface (canvas point in NDC) makes a ripple; true when it hit the water. */
  pokeAt(ndcX: number, ndcY: number): boolean {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const hit = new Vector3();
    if (!this.raycaster.ray.intersectPlane(this.waterPlane, hit)) return false;
    hit.sub(this.aquariumRoot.position);
    if (Math.abs(hit.x) > (this.dimensions.width / 2) || Math.abs(hit.z) > (this.dimensions.depth / 2)) return false;
    this.addRipple(hit.x, hit.z, 4, 0.014);
    return true;
  }

  /** Make the tank hold exactly these records (adds and removes as needed). */
  setOccupants(records: IndividualRecord[], species: (id: string) => SpeciesDef | undefined): Promise<void> {
    this.occupantRecords = [...records]; this.speciesLookup = species;
    const generation = ++this.occupantGeneration;
    this.dropped.clear();
    const wanted = new Set(records.map((r) => r.id));
    for (const o of [...this.occupants]) if (!wanted.has(o.record.id)) this.removeOccupant(o.record.id);
    return this.queued(async () => {
      for (const rec of records.slice(0, TANK_MAX_OCCUPANTS)) {
        if (generation !== this.occupantGeneration) return;
        if (this.occupants.some((o) => o.record.id === rec.id) || this.dropped.has(rec.id)) continue;
        try { await this.addOccupant(rec, species(rec.speciesId), generation); }
        catch (e) { console.warn('[tank] model unavailable; retry when reopened', e); }
      }
    });
  }

  /** Rebuild the current desired occupants, including pending loads, when hero materials change. */
  refreshHero(): Promise<void> {
    const records = [...this.occupantRecords], lookup = this.speciesLookup;
    if (!lookup) return Promise.resolve();
    this.clearOccupants();
    return this.setOccupants(records, lookup);
  }

  private readonly dropped = new Set<string>();
  private occupantQueue: Promise<void> = Promise.resolve();

  private queued(job: () => Promise<void>): Promise<void> {
    const run = this.occupantQueue.then(job, job);
    this.occupantQueue = run.catch(() => undefined);
    return run;
  }

  private async addOccupant(record: IndividualRecord, species: SpeciesDef | undefined, generation: number): Promise<void> {
    if (!species) return;
    const entry = DRIVERS[species.model.driver ?? ''];
    if (!entry) return;
    const seed = hashInts(record.number, record.caughtAt % 100000);
    const ind = generateIndividual(species, seed, 0, 0, 0, 0, Date.now());
    ind.length_mm = record.length_mm; ind.weight_g = record.weight_g; ind.sex = record.sex; ind.stage = record.stage; ind.traits = [...record.traits]; ind.gravid = !!record.gravid; ind.dress = !!record.dress;
    const slot = this.occupants.length;
    const [x, z] = animalSlotPosition(slot, this.occupantRecords.length, this.dimensions.width, this.dimensions.depth);
    ind.pos.set(x, 0, z);
    ind.home.copy(ind.pos);
    let root: Object3D, bones: Record<string, Object3D> = {}, meshes: Object3D[] = [], extras: Record<string, unknown> = {};
    let hero: HeroInstance | null = null;
    const files = modelFor(species, ind.stage, ind.gravid, ind.dress);
    const useHero = this.preset.modelTier === 'hero' && !!this.heroApply && !!files.hero && !this.occupants.some((o) => o.hero);
    const rel = this.preset.modelTier === 'lod2' ? files.lod2 ?? (entry.placeholder ? undefined : files.lod1) : useHero ? files.hero : files.lod1 ?? files.lod2 ?? (entry.placeholder ? undefined : files.hero);
    if (rel) {
      const model = await instantiateModel(rel, variantOf(ind.id));
      root = model.root; bones = model.bones as Record<string, Object3D>; meshes = model.meshes; extras = model.extras;
      for (const m of meshes) m.castShadow = this.preset.shadows;
      if (useHero && this.heroApply) {
        try { hero = await this.heroApply(model); } catch (err) { console.warn('[hero] tank fallback', err); hero = null; }
        if (!this.heroApply) { hero?.dispose(); hero = null; }
      }
      if (!hero) this.lightMeshesByCaustics(meshes as Mesh[]);
    } else if (entry.placeholder) {
      const ph = entry.placeholder();
      ph.root.userData.placeholder = ph;
      // a clam set into the tank is seen whole first, then digs in (where there is something to dig into)
      ph.root.userData.startOnSurface = true;
      root = ph.root;
    } else return;
    if (generation !== this.occupantGeneration || this.dropped.has(record.id) || this.occupants.some((o) => o.record.id === record.id)) { hero?.dispose(); this.disposeLitMaterials(root); root.removeFromParent(); return; }
    const driver = entry.create();
    const unsub = driver.onEvent((e) => this.onBehavior?.(e, record));
    this.aquariumRoot.add(root);
    driver.attach(root, ind, extras, bones, meshes);
    if (!rel) {
      // procedural models are built by the driver in attach(); light them now
      const ms: Mesh[] = [];
      root.traverse((o) => { if ((o as Mesh).isMesh) ms.push(o as Mesh); });
      this.lightMeshesByCaustics(ms);
    }
    root.userData.occupantId = record.id;
    this.occupants.push({ record, species, ind, driver, root, unsub, hero });
  }

  /** Model materials are shared between instances, so the tank's copies get their own, lit by the caustics. */
  private readonly litMaterials = new WeakSet<Material>();
  private lightMeshesByCaustics(meshes: Mesh[], sway = false): void {
    for (const mesh of meshes) {
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
      const lit = mats.map((m) => {
        if (!(m as MeshStandardMaterial).isMeshStandardMaterial) return m;
        const c = cloneForTank(m as MeshStandardMaterial);
        // keep a model's own shader injection (e.g. the shrimp cuticle) and add the caustics after it
        const prev = m.onBeforeCompile, prevKey = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey() : c.type;
        lightByCaustics(c, this.U, `tank-${prevKey}`, { chain: prev, sway });
        this.litMaterials.add(c);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? lit : lit[0];
    }
  }

  private disposeLitMaterials(root: Object3D): void {
    const materials = new Set<Material>();
    root.traverse(o => { if (o instanceof Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (this.litMaterials.has(m)) materials.add(m); });
    materials.forEach(m => { m.dispose(); this.litMaterials.delete(m); });
  }

  removeOccupant(id: string): void {
    this.dropped.add(id);
    this.occupantRecords = this.occupantRecords.filter(record => record.id !== id);
    const i = this.occupants.findIndex((o) => o.record.id === id);
    if (i < 0) return;
    const o = this.occupants[i];
    o.hero?.dispose();
    this.disposeLitMaterials(o.root);
    o.unsub();
    o.driver.dispose();
    o.root.removeFromParent();
    this.occupants.splice(i, 1);
  }

  clearOccupants(): void {
    ++this.occupantGeneration;
    this.occupantRecords = [];
    for (const o of [...this.occupants]) this.removeOccupant(o.record.id);
  }

  setQuality(preset: QualityPreset): void {
    if (this.preset === preset) return;
    this.preset = preset;
    this.applyPreset();
    const records = this.occupantRecords, lookup = this.speciesLookup;
    this.clearOccupants();
    if (lookup) void this.setOccupants(records, lookup);
  }

  /** The tier's shadows, water rate, specks and passes (the occupants' model tiers are reloaded by setQuality). */
  private applyPreset(): void {
    const preset = this.preset;
    this.lampLight.castShadow = preset.shadows;
    this.lampLight.shadow.map?.dispose(); this.lampLight.shadow.map = null;
    this.lampLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    this.lampLight.shadow.needsUpdate = true;
    this.water.setRate(preset.tankWaterHz);
    this.motes.setCount(preset.tankMotes);
    this.applyPassOptions();
  }

  private applyPassOptions(): void {
    const p = this.preset, shafts = this.lite ? Math.ceil(p.tankShafts / 2) : p.tankShafts;
    this.passes.setOptions({ hitIter: p.tankHitIter, shaftSteps: shafts, shaftShadows: p.shadows && shafts > 0 });
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

  /** 超軽量: the ripples step at most twice a frame, the caustics are redrawn every other frame and the light
   * shafts take half the steps */
  private lite = false;
  setLite(on: boolean): void {
    this.lite = on;
    this.water.lite = on;
    this.applyPassOptions();
  }

  private updateEquipmentLighting(): void {
    const level = Math.min(1.5, this.equipment.lightLevel);
    (this.U.uLampCol.value as Color).setRGB(LAMP_RGB[0], LAMP_RGB[1], LAMP_RGB[2]).multiplyScalar(3 * level);
    let lamp: Object3D | null = null;
    for (const d of this.equipment.devices.values()) if ((d.kind === 'ledLight' || d.kind === 'lightFixture') && d.powered) { lamp = d; break; }
    if (lamp) {
      const lp = this.U.uLampPosition.value as Vector3;
      lamp.localToWorld(lp.set(0, -0.01, 0));
      this.aquariumRoot.worldToLocal(lp);
      (this.U.uLampAxis.value as Vector3).set(1, 0, 0).transformDirection(lamp.matrixWorld);
      this.lampLight.position.copy(lp).add(this.aquariumRoot.position).add(this.lampOffset);
      this.lampLight.target.position.set(this.aquariumRoot.position.x + lp.x, this.aquariumRoot.position.y, this.aquariumRoot.position.z + lp.z);
    }
    this.lampLight.intensity = 1.8 * level;
    this.lighting.sunIntensity = 2.4 * level;
  }

  /** Look at the service side without changing device placement. */
  focusEquipmentRear(): void {
    this.view = 'tank';
    const origin = this.aquariumRoot.position;
    this.startCamera(new Vector3(origin.x - this.dimensions.width * 1.1, TANK_OFFSET_Y + 0.32, origin.z - 1.05), new Vector3(origin.x, TANK_OFFSET_Y - 0.08, origin.z));
  }

  /**
   * The viewpoint itself moves (W/S along the way it looks, A/D sideways), the orbit centre coming along so the
   * angle is kept; up moves vertically. The pace scales with how far the centre is, so close up the steps are fine.
   * The camera stays above the room floor and short of the walls and ceiling.
   */
  panCamera(right: number, forward: number, dt: number, up = 0): void {
    const c = this.controls;
    if (!c || c.enabled === false || (right === 0 && forward === 0 && up === 0)) return;
    const dist = this.camera.position.distanceTo(c.target);
    const pace = (0.12 + 0.75 * dist) * dt;
    // along the floor: the way the camera looks, flattened (looking down, the move is still level)
    const fwd = this.nudgeV.copy(c.target).sub(this.camera.position);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const side = this.nudgeV2.crossVectors(fwd, UP).normalize();
    const move = this.nudgeV3.set(0, 0, 0).addScaledVector(fwd, forward * pace).addScaledVector(side, right * pace);
    // short of the walls: the centre stays within the room
    const lim = 2.4;
    const nx = c.target.x + move.x, nz = c.target.z + move.z;
    move.x = Math.max(-lim, Math.min(lim, nx)) - c.target.x;
    move.z = Math.max(-lim, Math.min(lim, nz)) - c.target.z;
    if (up > 0) move.y = Math.max(0, Math.min(up * pace, 2.8 - this.camera.position.y));
    else if (up < 0) move.y = Math.min(0, Math.max(up * pace, 0.02 - this.camera.position.y));
    this.camera.position.add(move);
    c.target.add(move);
    c.update();
  }

  /** Hang the tools on the shelf. */
  setShelfTools(list: ShelfTool[]): void {
    this.shelf.setTools(list);
    this.probe.markDirty();
  }

  pickTool(ndcX: number, ndcY: number): string | null {
    return this.shelf.pick(ndcX, ndcY, this.camera);
  }

  get viewing(): 'tank' | 'shelf' {
    return this.view;
  }

  /** Turn to the shelf: the camera glides over and the orbit lets go until it is back. */
  focusShelf(): void {
    if (this.view === 'shelf') return;
    this.view = 'shelf';
    const c = this.shelf.center, d = this.shelf.viewDistance;
    // far enough back to take in the whole rack (two and a half metres of nets when every one is owned)
    // a little to the right of the rack's middle, so the rack sits clear of the tools drawer on the right
    this.startCamera(new Vector3(c.x + 0.3, c.y + 0.1 + 0.05 * d, c.z + d), new Vector3(c.x + 0.3, c.y - 0.05, c.z));
  }

  /** Straight to the default tank view, no glide (coming home from the flat). */
  resetView(): void {
    this.view = 'tank';
    this.camT = 1;
    this.frameTank();
    this.camCur.t.set(this.aquariumRoot.position.x, TANK_OFFSET_Y + 0.12, this.aquariumRoot.position.z);
    if (this.controls) { this.controls.enabled = this.viewInputEnabled; this.controls.target.set(this.aquariumRoot.position.x, TANK_OFFSET_Y + 0.12, this.aquariumRoot.position.z); this.controls.update(); }
  }

  focusTank(): void {
    if (this.view === 'tank') return;
    this.view = 'tank';
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
    const dist = (this.dimensions.width / 0.66) / (2 * Math.tan(hfov / 2));
    this.startCamera(new Vector3(dist * 0.35, TANK_OFFSET_Y + 0.16 + dist * 0.28, dist * 0.95).add(new Vector3(this.aquariumRoot.position.x, 0, this.aquariumRoot.position.z)), this.aquariumRoot.position.clone().add(new Vector3(0, 0.12, 0)));
  }

  private startCamera(p: Vector3, t: Vector3): void {
    this.camFrom.p.copy(this.camera.position);
    this.camFrom.t.copy(this.controls ? this.controls.target : this.camCur.t);
    this.camTo.p.copy(p);
    this.camTo.t.copy(t);
    this.camT = 0;
    if (this.controls) this.controls.enabled = false;
  }

  /** The glide between the tank and the shelf; the orbit takes over again at the tank. */
  private stepCamera(dt: number): void {
    if (this.camT >= 1) return;
    this.camT = Math.min(1, this.camT + dt / 0.9);
    const u = this.camT, s = u * u * (3 - 2 * u);
    this.camera.position.lerpVectors(this.camFrom.p, this.camTo.p, s);
    this.camCur.t.lerpVectors(this.camFrom.t, this.camTo.t, s);
    this.camera.lookAt(this.camCur.t);
    if (this.camT >= 1 && this.view === 'tank' && this.controls) {
      this.controls.target.copy(this.camTo.t);
      this.controls.enabled = this.viewInputEnabled;
      this.controls.update();
    }
  }

  /** Everything stands still (the edit screen): only the camera moves. */
  updateFrozen(): void {
    if (!this.aquariumRoot.visible) return;
    this.equipment.updateFrozen(this.camera);
    this.updateEquipmentLighting();
    this.updateProbe(1 / 60);
    this.sortOverlay(1 / 60);
    this.lampLight.shadow.needsUpdate = true;
    if (this.camT < 1) this.stepCamera(1 / 60);
    else if (this.view === 'tank') this.controls?.update();
  }

  private updateProbe(dt: number): void {
    const o = this.aquariumRoot.position;
    this.probe.update(this.gl, this.scene, this.aquariumRoot, o.x, o.y + this.dimensions.waterHeight, o.z, dt);
  }

  update(dt: number, simScale: number): void {
    if (!this.aquariumRoot.visible) { this.controls?.update(); return; }
    if (this.camT < 1) this.stepCamera(dt);
    else if (this.view === 'shelf') this.camera.lookAt(this.camCur.t);
    else this.controls?.update();
    this.equipment.update(dt, this.camera, this.gl.domElement.height);
    this.updateEquipmentLighting();
    let flow = 0;
    for (const f of this.equipment.flows) flow += f.flowRate;
    this.turb = Math.min(1, 0.15 + flow / 1800);
    this.water.turb = this.turb; this.water.swell = this.waves_;
    this.water.step(dt, this.equipment.flows);
    this.updateProbe(dt);
    this.sortOverlay(dt);
    this.stepShadows();
    const now = Date.now(), ctx = this.driverCtx;
    ctx.simScale = simScale; ctx.nowMs = now; ctx.canBurrow = this.sandTop > 0;
    for (const o of this.occupants) {
      const d = o.driver;
      const S = o.ind.length_mm / 1000;
      if (!d.busy) {
        const r = o.ind.rng.next();
        if (r < 0.55) d.setIntent({ id: now, kind: 'rest', urgency: 0, seconds: 6 + o.ind.rng.next() * 20 });
        else if (r < 0.9) {
          const tx = (o.ind.rng.next() - 0.5) * (this.dimensions.width - 4 * S), tz = (o.ind.rng.next() - 0.5) * (this.dimensions.depth - 3 * S);
          d.setIntent({ id: now, kind: 'wander', urgency: 0.3, seconds: 8, target: new Vector3(tx, 0, tz) });
        } else d.setIntent({ id: now, kind: 'special', urgency: 0, seconds: 3, param: 'yawn' });
      }
      const hx = Math.max(0.015, this.dimensions.width / 2 - 0.01 - S * 0.55), hz = Math.max(0.015, this.dimensions.depth / 2 - 0.01 - S * 0.55);
      const b = this.bounds;
      b.minX = -hx; b.maxX = hx; b.minZ = -hz; b.maxZ = hz;
      (ctx.player as Vector3).set(0, 1, 2);
      d.update(dt, ctx);
      if (o.hero) o.hero.update(this.camera, d.openings ?? { mouth: 0, gill: 0 });
      o.ind.pos.x = Math.max(-hx, Math.min(hx, o.ind.pos.x));
      o.ind.pos.z = Math.max(-hz, Math.min(hz, o.ind.pos.z));
      o.root.position.x = Math.max(-hx, Math.min(hx, o.root.position.x));
      o.root.position.z = Math.max(-hz, Math.min(hz, o.root.position.z));
    }
    const hx = this.dimensions.width / 2 - 0.01, hz = this.dimensions.depth / 2 - 0.01;
    this.contacts.step(dt * simScale, this.occupants, { floor: this.floor, bounds: { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz } });
  }

  dispose(): void {
    this.equipment.dispose();
    this.deactivate();
    this.clearOccupants();
    this.water.dispose();
    this.passes.dispose();
    this.substrate.dispose();
    this.motes.dispose();
    this.probe.dispose();
    this.glassEdgeMat.dispose();
  }
}

/** The view out of the window: a night sky over the bay, a few lights on the far shore, a moon. */
function makeNightWindow(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 352;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 352);
  sky.addColorStop(0, '#0b1626'); sky.addColorStop(0.55, '#16304a'); sky.addColorStop(0.62, '#0f2436'); sky.addColorStop(1, '#071018');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 352);
  // stars
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 70; i++) { const x = (i * 97) % 512, y = (i * 61) % 180; g.fillRect(x, y, 1.2, 1.2); }
  // the moon
  g.fillStyle = '#f2ead6'; g.beginPath(); g.arc(400, 60, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#16304a'; g.beginPath(); g.arc(392, 56, 14, 0, Math.PI * 2); g.fill();
  // the far shore and its lights
  g.fillStyle = '#0a1620'; g.fillRect(0, 205, 512, 20);
  for (let i = 0; i < 40; i++) { const x = (i * 131 + 20) % 500, w = 2 + (i % 3); g.fillStyle = i % 4 === 0 ? 'rgba(255,200,120,0.9)' : 'rgba(255,230,180,0.6)'; g.fillRect(x, 212 + (i % 2) * 3, w, 2); }
  // the water with the lights' reflections
  const sea = g.createLinearGradient(0, 225, 0, 352);
  sea.addColorStop(0, '#0d2535'); sea.addColorStop(1, '#050b10');
  g.fillStyle = sea; g.fillRect(0, 225, 512, 127);
  for (let i = 0; i < 40; i++) { const x = (i * 131 + 20) % 500; g.fillStyle = 'rgba(255,220,160,0.12)'; for (let k = 0; k < 6; k++) g.fillRect(x - k, 228 + k * 9, 2 + k, 1.5); }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
