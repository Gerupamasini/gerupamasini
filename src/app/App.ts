import { PerspectiveCamera, Vector3, type Object3D } from 'three';
import { render, h } from 'preact';
import { GameRenderer } from '../render/Renderer';
import { Input } from '../core/Input';
import { GameClock, TICKET_RANGE_DAYS } from '../core/GameClock';
import { loadSettings, saveSettings, type SettingsData } from '../core/Settings';
import { formatJst } from '../core/Time';
import { SaveStore, emptySave, type SaveV1, DEFAULT_NET } from '../core/Save';
import { loadGameData, type GameData } from '../data/loader';
import type { TidePhase } from '../data/schemas';
import { TideModel } from '../tide/TideModel';
import { World } from './World';
import { TankScene, TANK_MAX_OCCUPANTS } from './TankScene';
import type { EquipmentKind, EquipmentRecord, ConnectionRecord } from '../aquarium';
import { defaultTankLayout, type TankItemType, type TankSubstrate } from './TankLayout';
import { FPSController } from '../player/FPSController';
import { NetView, NET_LAYER, REACH, preloadNet } from '../player/NetView';
import { ShovelView } from '../player/ShovelView';
import { BinocularView } from '../player/BinocularView';
import { ClamField } from '../world/ClamField';
import { MEADOW_QUALITY } from '../world/amamo';
import { generateIndividual } from '../creatures/Individual';
import { hashInts } from '../core/Rng';
import { instantiateModel, preloadModel } from '../creatures/models/ModelLoader';
import { modelFor, variantOf } from '../creatures/models/choice';
import { DRIVERS } from '../creatures/drivers';
import { OysterDriver } from '../creatures/oyster/OysterDriver';
import type { SpeciesDef, ToolDef } from '../data/schemas';
import { CreatureSystem, type SpawnEnv } from '../creatures/CreatureSystem';
import type { Individual, IndividualRecord } from '../creatures/Individual';
import { Encyclopedia } from '../systems/Encyclopedia';
import { Observation } from '../systems/Observation';
import { CAPTURE_PHASE_SEC, Capture } from '../systems/Capture';
import { skillKeyOf } from '../systems/Encyclopedia';
import { FieldCase, CASE_DRAFT } from './FieldCase';
import { ShopScene } from './ShopScene';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { minDepthFor } from '../creatures/Individual';
import { ui, t, toast, type Screen, type Marker, type ToolId } from '../ui/store';
import { checkForNewBuild } from '../core/Build';
import { Root } from '../ui/Root';
import { HeroPipeline, type HeroLighting } from '../render/HeroPipeline';
import { FieldRenderer } from '../render/FieldRenderer';
import { HeroInstance } from '../creatures/species/mahaze/hero/applyHero';

const HUD_HZ = 4;
const MARKER_HZ = 10;
const AUTOSAVE_SEC = 60;
/** drivers that build their own clam geometry in shell lengths (the scoop shows them at length / 1000) */
const CLAM_DRIVERS = new Set(['asari', 'hamaguri']);
/** scratch: the camera's forward direction for the reticle picks */
const reticleDir = new Vector3();

export type TeleportTarget = 'spawn' | 'waterline' | 'runnel' | 'creek' | 'pool' | 'clams' | 'oysters' | 'amamo';

export class App {
  readonly renderer: GameRenderer;
  readonly camera: PerspectiveCamera;
  readonly input: Input;
  readonly clock = new GameClock();
  readonly saveStore = new SaveStore();
  readonly removed = new Set<string>();
  settings: SettingsData = null!;
  data: GameData = null!;
  tide: TideModel = null!;
  encyclopedia: Encyclopedia = null!;
  observation: Observation = null!;
  private leftFieldAt = 0;
  capture: Capture = new Capture();
  tank: TankScene = null!;
  hero: HeroPipeline | null = null;
  private field: FieldRenderer | null = null;
  /** the タモ in the player's hands */
  net: NetView | null = null;
  shovel: ShovelView | null = null;
  binoculars: BinocularView | null = null;
  /** the buried clams of the flat */
  clams: ClamField | null = null;
  /** the tool of the capture in progress (its proficiency grows with what it brings up) */
  private lastTool: ToolDef | null = null;
  /** the observation case set down on the flat, and the camera that looks into it */
  fieldCase: FieldCase | null = null;
  shop: ShopScene | null = null;
  private caseControls: OrbitControls | null = null;
  private caseSavedNear = 0.05;
  /** the clam the player is looking at (index into the field), or -1 */
  targetClam = -1;
  /** a clam built in full for observation */
  private watchedClam: { index: number; id: string } | null = null;
  /** the reef oyster the player is looking at (index into the reef), or -1 */
  targetOyster = -1;
  /** a reef oyster built in full for observation */
  private watchedOyster: { index: number; id: string } | null = null;
  world: World | null = null;
  player: FPSController | null = null;
  creatures: CreatureSystem | null = null;
  save: SaveV1 | null = null;
  target: Individual | null = null;
  lockedId: string | null = null;
  frameCount = 0;
  readonly tankMax = TANK_MAX_OCCUPANTS;
  private pointerDown: { x: number; y: number; t: number } | null = null;
  private pendingPose: { x: number; z: number; heading: number; map: string } | null = null;
  private raf = 0;
  private lastFrame = 0;
  private hudAcc = 0;
  private markerAcc = 0;
  private fpsAcc = 0;
  private fpsCount = 0;
  private saveAcc = 0;
  private saveTimer: number | null = null;
  private curveCacheMin = -1;
  private readonly anchor = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly tmp3 = new Vector3();
  private dragItem: string | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly uiRoot: HTMLElement) {
    this.renderer = new GameRenderer(canvas);
    this.camera = new PerspectiveCamera(70, this.renderer.aspect, 0.05, 2500);
    this.input = new Input(canvas);
    this.input.onLockError = (reason) => { console.warn('[input] pointer lock refused:', reason); toast(t('hud.lockFailed'), 'warn', 6000); };
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      this.clock.setPaused(document.hidden || !this.worldVisible());
      if (document.hidden) void this.writeSave();
    });
    window.addEventListener('beforeunload', () => { void this.writeSave(); });
    canvas.addEventListener('pointerdown', (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
      // in the layout editor a press on a decoration starts dragging it over the sand
      if (this.mode === 'tankEdit' && ui.tankTab.value === 'layout' && e.button === 0) {
        const [nx, ny] = this.ndcOf(e.clientX, e.clientY);
        const id = this.tank.pickItem(nx, ny);
        if (id) { this.dragItem = id; ui.tankSelected.value = id; this.tank.setControlsEnabled(false); canvas.setPointerCapture(e.pointerId); }
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragItem) return;
      const [nx, ny] = this.ndcOf(e.clientX, e.clientY);
      this.tank.moveItem(this.dragItem, nx, ny);
    });
    canvas.addEventListener('pointerup', (e) => {
      const d = this.pointerDown;
      this.pointerDown = null;
      if (this.dragItem) {
        this.dragItem = null;
        this.tank.setControlsEnabled(true);
        this.commitTankLayout();
        return;
      }
      if (!d || (this.mode !== 'home' && this.mode !== 'tankEdit' && this.mode !== 'shop')) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 350) return;
      if (this.mode === 'shop') this.onShopClick(e.clientX, e.clientY);
      else this.onHomeClick(e.clientX, e.clientY);
    });
    (window as unknown as { __higata: App }).__higata = this;
  }

  get mode(): Screen {
    return ui.screen.value;
  }

  get simScale(): number {
    return this.mode === 'observe' ? this.observation.speed : 1;
  }

  private worldVisible(): boolean {
    return this.mode === 'field' || this.mode === 'observe' || this.mode === 'capture' || this.mode === 'caseView';
  }

  /** true when the tank should be on screen (home, or an overlay opened from home) */
  private tankVisible(): boolean {
    const m = this.mode;
    if (m === 'home' || m === 'title' || m === 'tankEdit') return true;
    if (m === 'zukan' || m === 'menu' || m === 'ticket' || m === 'tidetable') return ui.overlayFrom.value === 'home' || ui.overlayFrom.value === 'tankEdit' || !this.world;
    return false;
  }

  private setMode(m: Screen): void {
    ui.screen.value = m;
    this.input.dragLook = m === 'field';
    const overlay = m !== 'field' && m !== 'observe' && m !== 'capture' && m !== 'home' && m !== 'tankEdit' && m !== 'caseView';
    this.input.blocked = overlay;
    if (m !== 'field' && m !== 'capture') this.input.exitPointerLock();
    if (this.player) this.player.enabled = m === 'field';
    this.clock.setPaused(!this.worldVisible() && m !== 'home');
  }

  // ------------------------------------------------------------------ boot
  async start(): Promise<void> {
    render(h(Root, { app: this }), this.uiRoot);
    this.settings = await loadSettings();
    ui.settings.value = this.settings;
    this.renderer.setQuality(this.settings.quality);
    if (!this.renderer.caps.webgl2) {
      ui.error.value = t('warn.webgl2', 'WebGL2 is required');
      ui.screen.value = 'error';
      return;
    }
    ui.loading.value = { frac: 0.02, label: 'データ' };
    this.data = await loadGameData((frac, label) => { ui.loading.value = { frac: 0.02 + frac * 0.3, label }; });
    ui.strings.value = this.data.strings;
    document.title = t('app.title');
    // a stale page (the host caches index.html for a while) learns about the newer deploy and offers a reload
    const poll = async () => { const nb = await checkForNewBuild(); if (nb) ui.newBuild.value = nb; };
    setTimeout(() => void poll(), 4000);
    setInterval(() => void poll(), 10 * 60000);
    const map = this.data.maps.get(this.data.manifest.defaultMap)!;
    this.tide = new TideModel(this.data.stations.get(map.station)!);
    this.encyclopedia = new Encyclopedia(this.data);
    this.encyclopedia.onChanged = () => this.requestSave();
    this.tank = new TankScene(this.canvas, this.renderer.aspect, this.renderer.gl);
    // what the animals do in the tank only counts as observed while the player is looking at the tank (home or its
    // edit screen), not from behind the 図鑑, the menu or the title
    this.tank.onBehavior = (e, rec) => { if (this.mode === 'home') this.encyclopedia.onBehavior(rec.speciesId, e.behaviorId, this.clock.nowGame()); };
    if (this.renderer.caps.floatRT) this.hero = new HeroPipeline(this.renderer.gl);
    if (this.renderer.caps.floatRT) this.field = new FieldRenderer(this.renderer.gl);
    this.applyHeroSetting();
    if (new URLSearchParams(location.search).has('debug')) ui.debug.value = true;
    const existing = await this.saveStore.load();
    ui.hasSave.value = !!existing;
    this.setMode('title');
    this.updateHud(this.clock.nowGame());
    // the title sits over the quiet tank, slowly turning
    this.tank.setAspect(this.renderer.aspect);
    this.tank.activate(true);
    this.tank.frameTank();
    this.tank.setLayout(existing?.tank.layout ?? defaultTankLayout());
    this.lastFrame = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  async startNewGame(): Promise<void> {
    this.save = emptySave(this.data.manifest.defaultMap, Date.now());
    this.encyclopedia.applySave(this.save);
    this.syncLoadout();
    this.removed.clear();
    this.pendingPose = null;
    this.enterHome();
    void this.writeSave();
  }

  async continueGame(): Promise<void> {
    const s = await this.saveStore.load();
    if (!s) return this.startNewGame();
    this.save = s;
    this.encyclopedia.applySave(s);
    this.syncLoadout();
    this.removed.clear();
    for (const id of s.removedIndividuals) this.removed.add(id);
    if (Date.now() < s.lastRealMs - 5 * 60 * 1000) {
      toast(t('warn.clock'), 'warn', 6000);
      s.ticket.active = null;
    }
    this.clock.restore(s.ticket.active);
    this.pendingPose = { x: s.player.pos[0], z: s.player.pos[2], heading: s.player.heading, map: s.player.map };
    this.enterHome();
  }

  /** Home: the tank fills the screen behind the menu. */
  enterHome(): void {
    if (this.mode === 'field' || this.mode === 'observe' || this.mode === 'capture') this.leftFieldAt = performance.now();
    this.player?.resetFov();
    this.setMode('home');
    // whatever was open when the player left (the tools rack, an animal's card), home opens on the tank
    ui.homePanel.value = 'none';
    ui.homeInfo.value = null;
    this.tank.setAspect(this.renderer.aspect);
    this.tank.activate(true);
    this.tank.resetView();
    void this.tank.setOccupants(this.encyclopedia.tankItems.value, (id) => this.data.species.get(id));
    this.tank.setLayout(this.save?.tank.layout ?? defaultTankLayout());
    this.syncShelf();
    this.lastFrame = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame((now) => this.frame(now));
    this.requestSave();
  }

  /** The map of the coast: pick where to go. */
  openSpots(): void {
    if (!ui.spot.value) ui.spot.value = this.data.spots.find((s) => s.map === (this.save?.player.map ?? this.data.manifest.defaultMap))?.id ?? this.data.spots[0]?.id ?? null;
    this.openOverlay('spots');
  }

  /** The map a spot opens; the default when the spot is not built yet. */
  private mapForSpot(spotId: string | null): string {
    const spot = spotId ? this.data.spots.find((s) => s.id === spotId) : undefined;
    return spot?.map ?? this.save?.player.map ?? this.data.manifest.defaultMap;
  }

  async enterField(spotId: string | null = ui.spot.value): Promise<void> {
    const mapId = this.data.maps.has(this.mapForSpot(spotId)) ? this.mapForSpot(spotId) : this.data.manifest.defaultMap;
    // another flat: the one built so far is taken down first (its animals, tools and the case with it)
    if (this.world && this.world.map.id !== mapId) this.leaveWorld();
    if (this.save) this.save.player.map = mapId;
    if (!this.world) {
      this.setMode('boot');
      ui.loading.value = { frac: 0.35, label: t('loading.map') };
      const map = this.data.maps.get(mapId)!;
      // the tide is the one of the flat's own station (the tide table and tickets follow it)
      if (this.tide.station.id !== map.station) { this.tide = new TideModel(this.data.stations.get(map.station)!); this.curveCacheMin = -1; }
      const dayNo = Math.floor((this.clock.nowGame() + 9 * 3600000) / 86400000);
      this.world = await World.create(map, this.tide, this.renderer.gl, this.renderer.preset, (label) => { ui.loading.value = { frac: 0.5, label }; }, dayNo);
      // the shaders compile behind the loading screen (in parallel where the browser can), before anything draws the
      // flat: otherwise the first frame stalls for as long as they take
      performance.mark('world:built');
      ui.loading.value = { frac: 0.6, label: t('loading.shaders') };
      await this.field?.compile(this.world.scene, this.camera, this.world.water);
      this.player = new FPSController(this.camera, this.world.terrain, this.world.habitat, this.input, map);
      this.player.eyeHeight = this.settings.eyeHeight;
      // the revetment's stones can be stood on
      this.player.groundBoost = (x, z) => this.world?.riprap?.heightBoost(x, z) ?? 0;
      performance.mark('world:created');
      ui.loading.value = { frac: 0.7, label: t('loading.models') };
      performance.mark('world:player');
      this.creatures = new CreatureSystem(this.world.scene, this.data, this.world.habitat, this.world.terrain, this.renderer.preset, map.id, this.removed, map.habitat?.minSpawnDist_m);
      performance.mark('world:creatureSystem');
      this.creatures.setMeadow(this.world.amamo);
      await this.creatures.preload();
      performance.mark('world:creatures');
      this.observation = new Observation(this.camera, this.canvas, this.creatures);
      this.observation.onBehavior = (speciesId, behaviorId) => { this.encyclopedia.onBehavior(speciesId, behaviorId, this.clock.nowGame()); };
      this.world.water.setPolarized(this.settings.sunglasses);
      this.net = new NetView(this.world.scene);
      void this.net.setTool(this.netDef() ?? null);
      for (const id of this.encyclopedia.loadout.value) { const td = this.data.tools.get(id); preloadNet(td); if (td?.model && td.type !== 'capture') void preloadModel(`${td.model}.hero.glb`).catch((e) => console.warn(e)); }
      this.shovel = new ShovelView(this.world.scene);
      this.binoculars = new BinocularView(this.world.scene);
      this.fieldCase = new FieldCase();
      this.world.scene.add(this.fieldCase.group);
      this.world.scene.add(this.fieldCase.animals);
      this.net.setHeld(this.toolType() === 'capture');
      this.shovel.setHeld(this.toolType() === 'dig');
      this.binoculars.setHeld(this.toolType() === 'optic');
      const first = this.toolDef();
      if (first?.type === 'dig') void this.shovel.setTool(first);
      if (first?.type === 'optic') void this.binoculars.setTool(first);
      const L = this.world.layout;
      this.clams = L ? new ClamField(this.world.terrain, hashInts(map.id.length * 31, 4242), L.clams.beds, L.clams.opts) : new ClamField(this.world.terrain, hashInts(map.id.length * 31, 4242));
      this.world.scene.add(this.clams.group);
      this.capture.onSwung = (caught) => this.onToolSwung(caught);
      this.capture.onResolved = (caught) => this.onCaptureResolved(caught);
      this.applyHeroSetting();
      if (this.pendingPose?.map === map.id) this.player.setPose(this.pendingPose.x, this.pendingPose.z, this.pendingPose.heading);
      this.pendingPose = null;
      ui.loading.value = { frac: 0.95, label: t('loading.models') };
      this.onResize();
      performance.mark('world:ready');
    }
    this.tank.deactivate();
    // away long enough for the tide to have moved: the population is rebuilt for the water as it is now
    if (this.leftFieldAt && performance.now() - this.leftFieldAt > 10 * 60000) this.creatures?.resetPopulation(null);
    this.leftFieldAt = 0;
    this.setMode('field');
    this.lastFrame = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  /** Take down the flat that is built (and everything that lives on it), to build another. */
  private leaveWorld(): void {
    if (this.observation?.active) this.observation.exit();
    this.lockedId = null;
    this.target = null;
    this.targetClam = -1;
    this.watchedClam = null;
    this.creatures?.dispose();
    this.creatures = null;
    this.clams?.dispose();
    this.clams = null;
    this.net?.dispose();
    this.net = null;
    this.shovel?.dispose();
    this.shovel = null;
    this.fieldCase?.dispose();
    this.fieldCase = null;
    this.world?.dispose();
    this.world = null;
    this.player = null;
  }

  focusGame(): void {
    if (this.mode === 'field' || this.mode === 'capture') this.input.requestPointerLock();
  }

  // ------------------------------------------------------------------ overlays
  openOverlay(screen: Screen): void {
    if (this.mode === screen) return;
    ui.overlayFrom.value = this.mode;
    this.setMode(screen);
  }

  closeOverlay(): void {
    const from = ui.overlayFrom.value;
    if (from === 'observe' || from === 'home' || from === 'field' || from === 'tankEdit' || from === 'caseView') this.setMode(from);
    else this.setMode(this.world ? 'field' : this.save ? 'home' : 'title');
  }

  async updateSettings(patch: Partial<SettingsData>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    ui.settings.value = this.settings;
    this.world?.water.setPolarized(this.settings.sunglasses);
    this.renderer.setQuality(this.settings.quality);
    this.world?.terrain.setDetail(this.renderer.preset.surfaceDetail > 0);
    this.world?.water.setMirror(this.renderer.preset.mirror);
    this.world?.water.setSurfSteps(this.renderer.preset.surfSteps);
    if (this.world?.amamo) {
      const q = MEADOW_QUALITY[this.renderer.preset.vegetation];
      this.world.amamo.setQuality(q);
      this.world.terrain.setMeadowCover(this.world.amamo.coverTexture, q.lod[2]);
    }
    if (this.player) this.player.eyeHeight = this.settings.eyeHeight;
    this.applyHeroSetting();
    await saveSettings(this.settings);
  }

  private applyHeroSetting(): void {
    const hero = this.hero;
    const fn = hero && this.settings.heroMaterials ? (model: Parameters<typeof HeroInstance.apply>[0]) => HeroInstance.apply(model, hero.shared) : null;
    if (this.creatures) this.creatures.heroApply = fn;
    if (this.tank) this.tank.heroApply = fn;
  }

  private heroLightingFromWorld(anchor: Vector3): HeroLighting {
    const w = this.world!;
    const depth = w.habitat.depthAt(anchor.x, anchor.z);
    return {
      sunDir: w.sunDir, sunColor: w.sky.sunLight.color, sunIntensity: w.sky.sunLight.intensity,
      skyColor: w.sky.hemi.color, groundColor: w.sky.hemi.groundColor, ambientIntensity: w.sky.hemi.intensity,
      fogColor: w.fog.color, fogDensity: 0.25, floorY: w.terrain.heightAt(anchor.x, anchor.z), underwater: depth > 0,
    };
  }

  // ------------------------------------------------------------------ ticket
  useTicket(targetGameMs: number): boolean {
    const now = this.clock.nowReal();
    if (Math.abs(targetGameMs - now) > TICKET_RANGE_DAYS * 86400000) return false;
    this.clock.useTicket(targetGameMs);
    this.creatures?.resetPopulation(this.lockedId);
    if (this.save) this.save.ticket.usedCount++;
    toast(`${t('ticket.active')}: ${formatJst(targetGameMs, { date: true })}`, 'info');
    this.requestSave();
    return true;
  }

  cancelTicket(): void {
    this.clock.cancelTicket();
    this.creatures?.resetPopulation(this.lockedId);
    this.requestSave();
  }

  // ------------------------------------------------------------------ debug
  /** The whole flat at a glance (M on the flat). */
  toggleMap(): void {
    ui.mapOpen.value = !ui.mapOpen.value;
    if (ui.mapOpen.value) this.input.exitPointerLock();
  }

  toggleDebug(): void {
    ui.debug.value = !ui.debug.value;
    if (!ui.debug.value) ui.markers.value = [];
  }

  setDebugTime(ms: number | null): void {
    this.clock.setDebugTime(ms);
    this.creatures?.resetPopulation(this.lockedId);
    ui.debugState.value = { ...ui.debugState.value, timeOverride: ms !== null };
    this.curveCacheMin = -1;
  }

  setTideOverride(level: number | null): void {
    if (this.world) this.world.tideOverride = level;
    this.creatures?.resetPopulation(this.lockedId);
    ui.debugState.value = { ...ui.debugState.value, tideOverride: level };
  }

  setOvercast(v: number): void {
    if (this.world) this.world.overcast = v;
    ui.debugState.value = { ...ui.debugState.value, overcast: v };
  }

  setMarkers(on: boolean): void {
    ui.debugState.value = { ...ui.debugState.value, markers: on };
    if (!on) ui.markers.value = [];
  }

  /** debug: which species appear (the clam field and the reef are shown or hidden as a whole) */
  setSpeciesShown(id: string, on: boolean): void {
    const hidden = new Set(ui.debugState.value.hidden);
    if (on) hidden.delete(id); else hidden.add(id);
    this.applyHiddenSpecies([...hidden]);
  }

  setAllSpeciesShown(on: boolean): void {
    this.applyHiddenSpecies(on ? [] : [...this.data.species.keys()]);
  }

  private applyHiddenSpecies(hidden: string[]): void {
    ui.debugState.value = { ...ui.debugState.value, hidden };
    const set = new Set(hidden);
    this.creatures?.setHiddenSpecies(set);
    if (this.clams) this.clams.group.visible = !set.has('ruditapes_philippinarum');
    if (this.world?.oysters) this.world.oysters.group.visible = !set.has('crassostrea_gigas');
  }

  private speciesHidden(id: string): boolean {
    return ui.debugState.value.hidden.includes(id);
  }

  teleport(target: TeleportTarget): void {
    const w = this.world, p = this.player;
    if (!w || !p) return;
    const map = w.map;
    let x = map.spawnStart.x, z = map.spawnStart.z, yaw = (map.spawnStart.heading * Math.PI) / 180, pitch = -0.15;
    switch (target) {
      case 'waterline': {
        if (w.layout && w.amamo) {
          // out from the beach toward the sea until the water is ankle deep
          const s = w.amamo.seaward;
          for (let t = 0; t < 60; t += 0.5) {
            const px = map.spawnStart.x + s.x * t, pz = map.spawnStart.z + s.y * t;
            if (w.habitat.depthAt(px, pz) >= 0.06) { x = px; z = pz; break; }
          }
          yaw = Math.atan2(-s.x, -s.y);
          break;
        }
        x = 0;
        // the first spot walking seaward that stands in ankle-deep water (the relief makes a fixed offset unreliable)
        for (let zz = -w.terrain.half + 5; zz < w.terrain.half - 5; zz += 0.5) {
          if (w.habitat.depthAt(0, zz) >= 0.06) { z = zz; break; }
        }
        break;
      }
      case 'runnel': case 'creek': {
        // the nearest creek cell to the map's middle (creek) or well up the flat (runnel): beside it, looking across
        const tr = w.terrain, chan = w.map.substrate.palette.indexOf('channel');
        const want = target === 'creek' ? { x: 0, z: 10 } : { x: 0, z: -60 };
        let best = -1, bestD = Infinity;
        for (let k = 0; k < tr.n * tr.n; k += 3) {
          if (tr.substrate[k] !== chan) continue;
          const cx = -tr.half + (k % tr.n) * tr.cell, cz = -tr.half + Math.floor(k / tr.n) * tr.cell;
          const d = Math.hypot(cx - want.x, cz - want.z);
          if (d < bestD) { bestD = d; best = k; }
        }
        if (best >= 0) { x = -tr.half + (best % tr.n) * tr.cell + 6; z = -tr.half + Math.floor(best / tr.n) * tr.cell; yaw = Math.PI / 2; }
        break;
      }
      case 'pool': { const pool = w.habitat.pools[0]; if (pool) { x = pool.cx + 6; z = pool.cz; yaw = Math.PI / 2; } break; }
      case 'oysters': {
        // beside the nearest big clump of the reef, crouched and looking at it
        const reef = w.oysters;
        const c = reef?.nearestClump(p.position.x, p.position.z);
        if (c) {
          // a stride away on the side toward the middle of the flat (the stones stand along its edges)
          const away = Math.hypot(c.centre.x, c.centre.z - 20) || 1;
          x = c.centre.x - (c.centre.x / away) * 0.9;
          z = c.centre.z - ((c.centre.z - 20) / away) * 0.9;
          yaw = Math.atan2(-(c.centre.x - x), -(c.centre.z - z));
          pitch = -0.45;
          p.lowView = true;
        }
        break;
      }
      case 'clams': {
        // the nearest clam bed, stood at its edge and looking down at the sand
        let best: { x: number; z: number } | null = null, bestD = Infinity;
        for (const b of this.clams?.beds ?? []) {
          const d = Math.hypot(b.x - p.position.x, b.z - p.position.z);
          if (d < bestD) { bestD = d; best = b; }
        }
        if (best) { x = best.x + 1.5; z = best.z; yaw = Math.PI / 2; pitch = -0.55; p.lowView = true; }
        break;
      }
      case 'amamo': {
        // the nearest dense アマモ bed, stood a little way off its landward side and looking out over it
        const bed = w.amamo?.nearest(p.position.x, p.position.z, 'dense');
        if (bed) {
          const s = w.amamo!.seaward;
          x = bed.x - s.x * (bed.r + 3); z = bed.z - s.y * (bed.r + 3);
          yaw = Math.atan2(-s.x, -s.y); pitch = -0.4; p.lowView = false;
        }
        break;
      }
      default: break;
    }
    p.setPose(x, z, yaw, pitch);
  }

  /** A short curtain over a change of screen: the word, the work, and a beat before it lifts. */
  async transition(label: string, work: () => Promise<void> | void): Promise<void> {
    ui.transition.value = label;
    await new Promise((r) => setTimeout(r, 320));
    try { await work(); } finally {
      await new Promise((r) => setTimeout(r, 240));
      ui.transition.value = null;
    }
  }

  /** The tank's edit screen: everything in the tank stands still while it is arranged. */
  openTankEdit(): void {
    if (this.mode === 'tankEdit') return;
    void this.transition(t('transition.tank'), () => {
      ui.homeInfo.value = null;
      ui.homePanel.value = 'tank';
      this.tank.setAutoRotate(false);
      this.setMode('tankEdit');
    });
  }

  closeTankEdit(): void {
    if (this.mode !== 'tankEdit') return;
    void this.transition(t('transition.home'), () => {
      ui.homePanel.value = 'none';
      ui.tankSelected.value = null;
      this.setMode('home');
    });
  }

  setHomePanel(panel: 'none' | 'tank'): void {
    if (panel === 'tank') { this.openTankEdit(); return; }
    ui.homePanel.value = panel;
  }

  forceSpawn(): void {
    const w = this.world, p = this.player, c = this.creatures;
    if (!w || !p || !c) return;
    const gameMs = this.clock.nowGame();
    const env: SpawnEnv = { tod: w.tod, season: w.season, tidePhase: this.tidePhase(), mapId: w.map.id, gameMs, day: Math.floor(gameMs / 86400000) };
    const n = c.forceSpawn(p.position, env);
    toast(`${n} 体をスポーン`, 'info');
  }

  // ------------------------------------------------------------------ observe / capture / tank
  enterObserve(ind: Individual): void {
    if (!this.creatures) return;
    this.lockedId = ind.id;
    this.observation.enter(ind);
    this.encyclopedia.onObserved(ind, this.clock.nowGame());
    this.setMode('observe');
  }

  exitObserve(): void {
    this.observation.exit();
    this.lockedId = null;
    if (this.watchedClam) {
      this.creatures?.despawn(this.watchedClam.id);
      this.clams?.setWatched(this.watchedClam.index, false);
      this.watchedClam = null;
    }
    if (this.watchedOyster) {
      this.creatures?.despawn(this.watchedOyster.id);
      this.world?.oysters?.setHidden(this.watchedOyster.index, false);
      this.watchedOyster = null;
    }
    this.setMode('field');
  }

  get tool(): ToolId {
    return ui.tool.value;
  }

  /** the definition of the tool in hand */
  toolDef(id: ToolId = this.tool): ToolDef | undefined {
    return this.data.tools.get(id);
  }

  toolType(id: ToolId = this.tool): ToolDef['type'] | undefined {
    return this.toolDef(id)?.type;
  }

  /** the net in hand, or the first net carried (the HUD and the reach are about the net even while digging) */
  netDef(): ToolDef | undefined {
    const cur = this.toolDef();
    if (cur?.type === 'capture') return cur;
    const id = this.encyclopedia.loadout.value.find((x) => this.toolType(x) === 'capture');
    return id ? this.toolDef(id) : this.data.tools.get(DEFAULT_NET);
  }

  /** The tools carried are on the number keys in loadout order; the hand starts on the first. */
  syncLoadout(): void {
    const carried = this.encyclopedia.loadout.value;
    if (!carried.includes(ui.tool.value)) this.setTool(carried[0] ?? DEFAULT_NET, true);
  }

  /** debug: CR by hand */
  addMoney(cr: number): void {
    this.encyclopedia.addMoney(cr);
    this.requestSave();
  }

  buyTool(id: ToolId): void {
    const tool = this.data.tools.get(id);
    if (!tool) return;
    if (!this.encyclopedia.buy(tool)) toast(t('tools.cannotBuy'), 'warn');
    this.syncShelf();
    this.stockShop();
    this.requestSave();
  }

  toggleCarry(id: ToolId): void {
    if (!this.encyclopedia.toggleCarry(id)) toast(t('tools.loadoutHint'), 'warn');
    this.syncLoadout();
    this.syncShelf();
    this.requestSave();
  }

  setTool(id: ToolId, force = false): void {
    if (ui.tool.value === id && !force) return;
    if (!this.data.tools.has(id)) return;
    ui.tool.value = id;
    const type = this.toolType(id);
    this.net?.setHeld(type === 'capture');
    this.shovel?.setHeld(type === 'dig');
    this.binoculars?.setHeld(type === 'optic');
    if (type === 'capture') void this.net?.setTool(this.data.tools.get(id) ?? null);
    if (type === 'dig') void this.shovel?.setTool(this.data.tools.get(id) ?? null);
    if (type === 'optic') void this.binoculars?.setTool(this.data.tools.get(id) ?? null);
  }

  /** [E] on the flat: use the tool in hand where the player is looking. */
  useTool(): void {
    const type = this.toolType();
    if (type === 'capture') this.swingNet();
    else if (type === 'dig') this.dig();
    // the binoculars are raised while the key is held (see the field update), not on a press
  }

  /**
   * Swing the net ahead. Like the real thing: whatever is where the hoop goes through the water ends up in the
   * bag unless it gets away — calm animals near the middle of the sweep are caught, wary ones and those at the
   * rim slip out, and everything nearby bolts.
   */
  /**
   * Catchable animals the net reaches from this view: inside the hoop's upright ellipse carried down the line of
   * sight (the reticle) out to the length of the handle. `edge` is how far out toward the rim each sits (0..1).
   */
  private netZoneHits(): { ind: Individual; edge: number }[] {
    const creatures = this.creatures, player = this.player;
    const out: { ind: Individual; edge: number }[] = [];
    if (!creatures || !player) return out;
    for (const ind of creatures.individuals) {
      if (!ind.species.collectable || ind.species.locomotion === 'burrow' || ind.species.taxon.group === 'bird') continue;
      if (ind.pos.distanceTo(player.position) > this.netReach() + 1.5) continue;
      // the hoop is judged against the body as drawn (the anchor) as well as the logical position, with the animal's own size as margin
      const margin = Math.max(0.06, ind.length_mm / 2000), scale = this.netZoneScale(), reach = this.netReach();
      let e = NetView.inZone(this.camera, ind.pos, margin, scale, reach);
      const anchor = creatures.anchorOf(ind.id);
      if (anchor) { const ea = NetView.inZone(this.camera, anchor, margin, scale, reach); if (ea >= 0 && (e < 0 || ea < e)) e = ea; }
      if (e >= 0) out.push({ ind, edge: e });
    }
    return out;
  }

  /** The hoop grows with the hand's proficiency (×1 untrained, ×1.6 at the top level) and with the net itself. */
  netZoneScale(): number {
    return (1 + 0.12 * this.encyclopedia.skillLevel('hand_net')) * (this.netDef()?.params.hoop ?? 1);
  }

  /**
   * How far down the line of sight the net reaches. The handle and the arm sweep a fixed distance over the ground
   * (`reach_m`, from the feet), so from a standing eye the same spot is further along the line of sight: looking down
   * steeply from 1.5 m up, the hoop still gets to the bed.
   */
  netReach(): number {
    return this.reachAlongSight(this.netDef()?.params.reach_m ?? 1.5);
  }

  /** A reach of `horiz` metres over the ground from the feet, as a distance down the line of sight. */
  private reachAlongSight(horiz: number): number {
    const p = this.player;
    if (!p) return horiz;
    const eyeUp = Math.max(0.3, this.camera.position.y - p.position.y);
    const cos = Math.max(0.08, Math.cos(p.pitch));
    const tMax = Math.sqrt(horiz * horiz + eyeUp * eyeUp) + 0.1;
    return Math.min(horiz / cos, tMax);
  }

  /** The spot the shovel would dig: the ground under the reticle, and whether the arm gets there. */
  /** the digging tool in hand, else the first carried, else the stock スコップ */
  digDef(): ToolDef | undefined {
    const cur = this.toolDef();
    if (cur?.type === 'dig') return cur;
    const id = this.encyclopedia.loadout.value.find((x) => this.toolType(x) === 'dig');
    return id ? this.toolDef(id) : this.data.tools.get('shovel');
  }

  digTarget(): { p: Vector3; far: boolean } | null {
    const reach = this.reachAlongSight(this.digDef()?.params.reach_m ?? 1.2);
    const p = this.groundUnderReticle(reach + 1.5);
    if (!p) return null;
    return { p: p.clone(), far: p.distanceTo(this.camera.position) > reach };
  }

  /** How much deep water slows the swing at the player's feet: 0 in the shallows, 1 at knee depth and beyond. */
  swingSlow(): number {
    return Math.max(0, Math.min(1, ((this.player?.depthHere ?? 0) - 0.15) / 0.45));
  }

  swingNet(): void {
    const tool = this.netDef();
    const creatures = this.creatures, player = this.player, world = this.world;
    if (!tool || !creatures || !player || !world || this.capture.active) return;
    const free = Math.max(0, this.encyclopedia.caseMax - this.encyclopedia.caseItems.value.length);
    const caught: Individual[] = [], startled: Individual[] = [];
    const hits = this.netZoneHits();
    // deep water drags on the net (less on a long handle), a practised hand is quicker, a standing swing bends down first
    const slow = this.swingSlow() * (tool.params.deep ?? 1), skill = this.encyclopedia.skillLevel('hand_net');
    const quiet = tool.params.quiet ?? 1, stand = player.crouching ? 1 : 1.15;
    const swingSec = CAPTURE_PHASE_SEC.swing * (tool.params.swing ?? 1) * stand * (1 + 1.2 * slow) * (1 - 0.05 * skill);
    for (const { ind, edge } of hits) {
      // an animal under the hoop is in the bag unless it was already alarmed enough to bolt in time: the odds of
      // getting away grow with the square of its alertness, a little at the rim of the hoop, and less from behind
      const cap = ind.species.capture;
      const dx = player.position.x - ind.pos.x, dz = player.position.z - ind.pos.z, len = Math.hypot(dx, dz) || 1;
      const facing = (Math.sin(ind.heading) * dx + Math.cos(ind.heading) * dz) / len;
      let escape = 0.6 * ind.alert * ind.alert * (0.5 + cap.alertPenalty) + 0.25 * edge * edge + 0.1 * cap.baseDifficulty + (facing > 0.3 ? 0.05 : facing < -0.3 ? -0.08 : 0);
      // a slow swing in deep water gives everything time to go; a practised hand gives less
      escape = (escape + 0.35 * slow * (0.5 + ind.alert)) * (1 - 0.1 * skill) * quiet;
      escape = Math.min(0.85, Math.max(0, escape));
      if (this.capture.forceCatch || (ind.rng.next() > escape && caught.length < free)) caught.push(ind);
    }
    for (const ind of creatures.individuals) {
      if (caught.includes(ind) || ind.species.locomotion === 'burrow' || ind.species.taxon.group === 'bird') continue;
      if (ind.pos.distanceTo(player.position) < 2.5) startled.push(ind);
    }
    for (const ind of startled) {
      const away = new Vector3().subVectors(ind.pos, player.position).setY(0).normalize().multiplyScalar(1.5);
      creatures.forceIntent(ind.id, { id: -1, kind: 'flee', urgency: 1, seconds: 4, target: ind.pos.clone().add(away), from: player.position.clone() });
    }
    if (caught.length === 0 && free === 0) toast(t('capture.caseFull'), 'warn');
    // oysters the hoop sweeps over snap shut
    const reef = world.oysters;
    if (reef) {
      const scale = this.netZoneScale(), reach = this.netReach();
      for (const i of reef.near(player.position.x, player.position.z, reach + 1.5)) {
        if (NetView.inZone(this.camera, reef.centreOf(i, this.tmp), 0.08, scale, reach) >= 0) reef.touchOne(i);
      }
    }
    this.lastTool = tool;
    this.capture.start(tool, caught, swingSec);
    this.net?.show();
    this.setMode('capture');
  }

  /**
   * Dig where the player is looking (the shovel). A clam whose siphon holes are under the blade comes up in the
   * scoop; the flat keeps the hole for a while.
   */
  dig(): void {
    const tool = this.digDef();
    const world = this.world, player = this.player, clams = this.clams;
    if (!tool || !world || !player || !clams || this.capture.active) return;
    const tg = this.digTarget();
    if (!tg || tg.far) { toast(t('hud.tooFar'), 'warn'); return; }
    const p = tg.p;
    if (world.habitat.depthAt(p.x, p.z) > 0.15) { toast(t('hud.tooDeepToDig'), 'warn'); return; }
    this.shovel?.setDigPoint(p, this.camera);
    const nowSec = this.clock.nowGame() / 1000;
    // a practised hand finds the clam under a wider blade
    const k = clams.dig(p.x, p.z, (tool.params.radius ?? 0.14) * (1 + 0.1 * this.encyclopedia.skillLevel('shovel')), nowSec);
    clams.startle(p.x, p.z, 1.5, nowSec);
    world.oysters?.touch(p, 0.35);
    const caught: Individual[] = [];
    const sp = this.data.species.get('ruditapes_philippinarum');
    const full = () => this.encyclopedia.caseItems.value.length + caught.length >= this.encyclopedia.caseMax;
    if (k >= 0 && sp) {
      if (full()) toast(t('capture.caseFull'), 'warn');
      else caught.push(generateIndividual(sp, clams.seed[k], clams.xs[k], clams.zs[k], -1, 0, this.clock.nowGame(), [clams.len[k], clams.len[k]]));
    }
    // the other burrowers (ハマグリ) live in the creature system: the nearest one under the blade comes up too
    if (this.creatures) {
      const r = (tool.params.radius ?? 0.14) * (1 + 0.1 * this.encyclopedia.skillLevel('shovel')) + 0.04;
      const buried = this.creatures.individuals.filter((i) => i.species.locomotion === 'burrow' && i.species.collectable && i.pitId !== -2 && Math.hypot(i.pos.x - p.x, i.pos.z - p.z) <= r);
      buried.sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
      const one = buried[0];
      if (one) {
        // a deep burrower needs a tool that digs deep enough (the rake only scrapes the top few centimetres)
        if ((one.species.digDepth_cm ?? 8) > (tool.params.depth_cm ?? 20)) toast(t('hud.tooShallow'), 'warn');
        else if (full()) toast(t('capture.caseFull'), 'warn');
        else { this.creatures.remove(one.id); caught.push(one); }
      }
    }
    this.lastTool = tool;
    this.capture.start(tool, caught);
    this.shovel?.show();
    this.setMode('capture');
  }

  /** Watch a buried clam: it is built in full (siphons, breathing, digging) just for the observation. */
  observeClam(index: number): void {
    const sp = this.data.species.get('ruditapes_philippinarum');
    const clams = this.clams, creatures = this.creatures;
    if (!sp || !clams || !creatures || index < 0 || clams.state[index] !== 0) return;
    const ind = generateIndividual(sp, clams.seed[index], clams.xs[index], clams.zs[index], -1, 0, this.clock.nowGame(), [clams.len[index], clams.len[index]]);
    ind.pitId = -2;   // not the spawner's to cull
    creatures.spawn(ind);
    clams.setWatched(index, true);
    this.watchedClam = { index, id: ind.id };
    this.enterObserve(ind);
  }

  /** Watch an oyster of the reef: it is built in full on its stone (hero shell, mantle, the five-state behaviour) just for the observation. */
  observeOyster(index: number): void {
    const sp = this.data.species.get('crassostrea_gigas');
    const reef = this.world?.oysters, creatures = this.creatures;
    if (!sp || !reef || !creatures || index < 0) return;
    const info = reef.infoOf(index);
    if (!info || info.dead) return;
    const c = reef.centreOf(index);
    const len = Math.round(info.length * 1000);
    const ind = generateIndividual(sp, info.seed, c.x, c.z, -1, 0, this.clock.nowGame(), [len, len]);
    ind.pitId = -2;   // not the spawner's to cull
    OysterDriver.pending.set(ind.id, info);
    creatures.spawn(ind);
    ind.pos.copy(c);   // on its stone (spawn() put it on the terrain under it)
    reef.setHidden(index, true);
    this.watchedOyster = { index, id: ind.id };
    this.enterObserve(ind);
  }

  /** The tool has gone through: the caught animals leave the world and the first shows in the net or on the scoop. */
  private onToolSwung(caught: Individual[]): void {
    if (!this.creatures || !this.player) return;
    this.player.applyKick(0.06);
    const shovel = this.toolType(this.capture.state.value?.toolId ?? '') === 'dig';
    if (!shovel) for (const ind of caught) this.creatures.remove(ind.id);
    const first = caught[0];
    if (first) void this.displayModelFor(first).then((obj) => {
      if (!obj || this.capture.catches[0] !== first) return;
      // the clam's shape is built in shell lengths; the others at their model length
      const scale = CLAM_DRIVERS.has(first.species.model.driver ?? '') ? first.length_mm / 1000 : first.length_mm / first.species.model.modelLength_mm;
      if (shovel) this.shovel?.setCatch(obj, scale); else this.net?.setCatch(obj, scale);
    });
  }

  /** A fresh model of the species to lie in the net (the detailed tier, or the driver's own geometry). */
  private async displayModelFor(ind: Individual): Promise<Object3D | null> {
    const sp = ind.species, m = modelFor(sp, ind.stage, ind.gravid, ind.dress);
    const rel = m.lod1 ?? m.hero ?? m.lod2;
    if (rel) {
      try { return (await instantiateModel(rel, variantOf(ind.id))).root; } catch (err) { console.warn(err); }
    }
    const entry = DRIVERS[sp.model.driver ?? ''];
    // drivers that build their own geometry: the preview shape (a clam lies closed in the scoop)
    if (entry?.preview) return entry.preview((variantOf(ind.id) & 0xffff) / 65536);
    return entry?.placeholder ? entry.placeholder().root : null;
  }

  private onCaptureResolved(caught: Individual[]): void {
    if (!this.creatures || !this.world) return;
    this.net?.hide();
    this.shovel?.hide();
    for (const ind of caught) this.encyclopedia.onCaptured(ind, this.clock.nowGame(), this.world.tideLevel);
    if (caught.length && this.lastTool) this.encyclopedia.addSkill(skillKeyOf(this.lastTool), this.lastTool.type === 'capture' ? t('tools.nets') : this.lastTool.ja, caught.length);
    this.setMode('field');
    this.requestSave();
  }

  async tankPut(rec: IndividualRecord): Promise<void> {
    if (this.encyclopedia.tankItems.value.length >= this.tankMax) return;
    // the animal's model loads behind a curtain rather than in a stutter
    await this.transition(t('transition.put'), async () => {
      this.encyclopedia.moveToTank(rec);
      await this.tank.setOccupants(this.encyclopedia.tankItems.value, (id) => this.data.species.get(id));
    });
  }

  /** debug: set a tool's catch count (its proficiency) by hand; nets share one */
  setSkill(toolId: ToolId, count: number): void {
    this.encyclopedia.setSkill(toolId, count, toolId === 'hand_net' ? t('tools.nets') : this.data.tools.get(toolId)?.ja);
  }

  /**
   * Let an animal in the case go. On the flat it goes back into the nearest water and bolts; at home it is simply
   * gone.
   */
  caseRelease(rec: IndividualRecord): void {
    this.encyclopedia.release(rec);
    const world = this.world, creatures = this.creatures, player = this.player;
    if (world && creatures && player && this.worldVisible()) {
      const sp = this.data.species.get(rec.speciesId);
      if (sp && sp.locomotion !== 'burrow') {
        const from = this.fieldCase?.visible ? this.fieldCase.group.position : player.position;
        const need = minDepthFor(sp, rec.length_mm) + 0.02;
        const wet = world.habitat.nearestWater(from.x, from.z, need, 10) ?? from;
        const seed = hashInts(rec.number, rec.caughtAt % 100000) ^ 0x5bd1e995;
        const ind = generateIndividual(sp, seed, wet.x, wet.z, world.habitat.coarseIndex(wet.x, wet.z), 0, this.clock.nowGame(), [rec.length_mm, rec.length_mm]);
        ind.alert = 0.8;
        creatures.spawn(ind);
        const away = new Vector3().subVectors(ind.pos, player.position).setY(0).normalize().multiplyScalar(1.5);
        creatures.forceIntent(ind.id, { id: -1, kind: 'flee', urgency: 1, seconds: 4, target: ind.pos.clone().add(away), from: player.position.clone() });
      }
    }
    this.refreshCase();
    this.requestSave();
  }

  caseToResearch(rec: IndividualRecord): void {
    this.encyclopedia.toResearch(rec);
    this.refreshCase();
    this.requestSave();
  }

  private refreshCase(): void {
    if (this.fieldCase?.visible) void this.fieldCase.setOccupants(this.encyclopedia.caseItems.value, (id) => this.data.species.get(id));
  }

  /** A dry enough spot for the case near the player, ahead if possible: the base must not float. */
  private caseSpot(): Vector3 {
    const world = this.world!, p = this.player!;
    const f = p.forward.clone();
    const ok = (x: number, z: number) => world.habitat.depthAt(x, z) < 0.02;
    const c = new Vector3();
    // standing in the water: the case floats right in front, on the surface
    if (p.depthHere > 0.03) {
      for (const d of [0.7, 0.55, 0.9]) {
        c.set(p.position.x + f.x * d, 0, p.position.z + f.z * d);
        if (world.habitat.depthAt(c.x, c.z) > 0.03) return c;
      }
    }
    for (const d of [0.75, 0.55, 0.95, 1.2, 0.4]) {
      c.set(p.position.x + f.x * d, 0, p.position.z + f.z * d);
      if (ok(c.x, c.z)) return c;
    }
    for (let ring = 1; ring <= 5; ring++) for (let k = 0; k < 10; k++) {
      const ang = p.yaw + Math.PI + (k / 10) * Math.PI * 2, r = ring * 0.6;
      c.set(p.position.x - Math.sin(ang) * r, 0, p.position.z - Math.cos(ang) * r);
      if (ok(c.x, c.z)) return c;
    }
    return c.set(p.position.x + f.x * 0.75, 0, p.position.z + f.z * 0.75);
  }

  /** debug: one animal of a species set down a few metres ahead (on the sand for a walker, in water for a swimmer). */
  debugSpawn(speciesId: string, dist = 4): boolean {
    const world = this.world, creatures = this.creatures, player = this.player, sp = this.data.species.get(speciesId);
    if (!world || !creatures || !player || !sp) return false;
    const f = player.forward;
    let x = player.position.x + f.x * dist, z = player.position.z + f.z * dist;
    if (sp.locomotion === 'swim') { const w = world.habitat.nearestWater(x, z, minDepthFor(sp, sp.size.length_mm.mean) + 0.02, 12); if (w) { x = w.x; z = w.z; } }
    const ind = generateIndividual(sp, Math.floor(Math.random() * 1e9), x, z, world.habitat.coarseIndex(x, z), 0, this.clock.nowGame());
    creatures.spawn(ind);
    return true;
  }

  /** Polarised sunglasses on or off: the water's glare, and a tint over the view. */
  toggleSunglasses(): void {
    const on = !this.settings.sunglasses;
    void this.updateSettings({ sunglasses: on });
    toast(t(on ? 'toast.sunglassesOn' : 'toast.sunglassesOff'), 'info', 2500);
  }

  /** Set the observation case down ahead and look into it. */
  openCase(): void {
    const world = this.world, player = this.player, fc = this.fieldCase;
    if (!world || !player || !fc || this.mode !== 'field') return;
    const spot = this.caseSpot();
    // on the sand, or, standing in the water, floated on the surface (resting on the bottom where it is too shallow)
    const ground = world.terrain.heightAt(spot.x, spot.z), depth = world.habitat.depthAt(spot.x, spot.z);
    const afloat = depth > 0.03;
    const y = afloat ? Math.max(ground, world.habitat.waterAt(spot.x, spot.z) - CASE_DRAFT) : ground;
    fc.place(spot.x, y, spot.z, player.yaw, afloat);
    void fc.setOccupants(this.encyclopedia.caseItems.value, (id) => this.data.species.get(id));
    const center = fc.center.clone();
    this.caseSavedNear = this.camera.near;
    this.camera.near = 0.01;
    this.camera.updateProjectionMatrix();
    const controls = new OrbitControls(this.camera, this.canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 0.18;
    controls.maxDistance = 1.6;
    // afloat, the view stays above the water: the orbit may not dip under the surface
    controls.maxPolarAngle = afloat ? Math.PI * 0.4 : Math.PI * 0.49;
    controls.enablePan = false;
    controls.zoomSpeed = 0.8;
    controls.target.copy(center);
    // from the player's side, a little above the water line, like kneeling in front of it
    const back = player.forward.clone().multiplyScalar(-0.66);
    this.camera.position.copy(center).add(back).add(new Vector3(0, afloat ? 0.36 : 0.3, 0));
    controls.update();
    this.caseControls = controls;
    this.setMode('caseView');
  }

  closeCase(): void {
    if (this.mode !== 'caseView') return;
    this.caseControls?.dispose();
    this.caseControls = null;
    this.camera.near = this.caseSavedNear;
    this.camera.updateProjectionMatrix();
    this.fieldCase?.takeUp();
    this.setMode('field');
    // straight back into the walk: the key or the click that closed the case is the gesture the lock needs
    this.focusGame();
  }

  /** The keys turn and close in on the case too (A/D around it, W/S nearer and further), for when the mouse will not. */
  private caseKeys(dt: number): void {
    const c = this.caseControls, i = this.input;
    if (!c) return;
    const orbit = (i.held('right') ? 1 : 0) - (i.held('left') ? 1 : 0);
    const dolly = (i.held('forward') ? 1 : 0) - (i.held('back') ? 1 : 0);
    if (orbit === 0 && dolly === 0) { c.update(); return; }
    const off = this.tmp2.copy(this.camera.position).sub(c.target);
    const r = Math.max(c.minDistance, Math.min(c.maxDistance, off.length() * Math.exp(-dolly * 1.2 * dt)));
    const ang = Math.atan2(off.x, off.z) - orbit * 1.6 * dt;
    const horiz = Math.hypot(off.x, off.z) / Math.max(1e-6, off.length()) * r;
    off.set(Math.sin(ang) * horiz, (off.y / Math.max(1e-6, off.length())) * r, Math.cos(ang) * horiz);
    this.camera.position.copy(c.target).add(off);
    c.update();
  }

  async tankRelease(rec: IndividualRecord): Promise<void> {
    if (!this.encyclopedia.moveToCase(rec)) { toast(t('capture.caseFull'), 'warn'); return; }
    this.tank.removeOccupant(rec.id);
  }

  /** The shop is a room of its own: a curtain, then the counter. */
  openShop(): void {
    if (this.mode !== 'home') return;
    ui.homeInfo.value = null;
    ui.homePanel.value = 'none';
    ui.shopSelected.value = null;
    void this.transition(t('transition.shop'), () => {
      if (!this.shop) this.shop = new ShopScene(this.renderer.aspect, (id) => t(`shop.item.${id}`));
      this.stockShop();
      this.openOverlay('shop');
    });
  }

  closeShop(): void {
    if (this.mode !== 'shop') return;
    ui.shopSelected.value = null;
    void this.transition(t('transition.home'), () => this.closeOverlay());
  }

  /** the shop's shelves: every net, priced, the owned ones lit */
  private stockShop(): void {
    this.shop?.setStock([...this.data.tools.values()].filter((x) => !!x.model), (id) => this.encyclopedia.owns(id));
  }

  /** A click in the shop: the net or parcel under the pointer opens its card. */
  private onShopClick(clientX: number, clientY: number): void {
    if (!this.shop) return;
    const [nx, ny] = this.ndcOf(clientX, clientY);
    const id = this.shop.pick(nx, ny);
    if (id) ui.shopSelected.value = id;
  }

  openGacha(): void {
    toast(`${t('home.gacha')}: ${t('home.soon')}`, 'info');
  }

  /** The shelf shows what is owned, with a lit tag and its key on what goes to the flat. */
  syncShelf(): void {
    const enc = this.encyclopedia;
    const list = enc.owned.value.map((id) => this.data.tools.get(id)).filter((x): x is ToolDef => !!x)
      .map((tool) => ({ tool, carried: enc.carries(tool.id), slot: enc.carries(tool.id) ? enc.loadout.value.indexOf(tool.id) : null }));
    this.tank.setShelfTools(list);
  }

  /** The tools: the camera turns to the shelf and the drawer lists what is carried. */
  openTools(): void {
    if (this.mode !== 'home') return;
    ui.homeInfo.value = null;
    if (ui.homePanel.value === 'tools') { this.closeTools(); return; }
    ui.homePanel.value = 'tools';
    this.syncShelf();
    this.tank.setAutoRotate(false);
    this.tank.focusShelf();
  }

  closeTools(): void {
    if (ui.homePanel.value === 'tools') ui.homePanel.value = 'none';
    this.tank.focusTank();
  }

  private ndcOf(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1)];
  }

  // ------------------------------------------------------------------ tank layout editor
  private commitTankLayout(): void {
    ui.tankLayoutVersion.value++;
    if (!this.save) return;
    this.save.tank.layout = this.tank.currentLayout;
    this.requestSave();
  }

  tankSetSubstrate(s: TankSubstrate): void {
    this.tank.setSubstrate(s);
    this.commitTankLayout();
  }

  tankAddItem(type: TankItemType): void {
    const it = this.tank.addItem(type);
    if (!it) { toast(t('tank.full'), 'warn'); return; }
    ui.tankSelected.value = it.id;
    this.commitTankLayout();
  }

  tankRemoveItem(id: string): void {
    this.tank.removeItem(id);
    if (ui.tankSelected.value === id) ui.tankSelected.value = null;
    this.commitTankLayout();
  }

  tankRotateItem(id: string, delta = Math.PI / 4): void {
    this.tank.rotateItem(id, delta);
    this.commitTankLayout();
  }

  tankAddEquipment(kind: EquipmentKind): void {
    if (!this.tank.equipment.addDevice(kind)) toast('設備の上限です（24個）', 'warn');
    this.commitTankLayout();
  }

  tankChangeEquipment(id: string, change: Partial<Pick<EquipmentRecord, 'position' | 'rotation' | 'enabled' | 'setting'>>): void {
    this.tank.equipment.changeDevice(id, change);
    this.commitTankLayout();
  }

  tankRemoveEquipment(id: string): void { this.tank.equipment.removeDevice(id); this.commitTankLayout(); }
  tankStand(finish: 'wood' | 'metal'): void { this.tank.equipment.setStand(finish); this.commitTankLayout(); }
  tankAutoConnect(): void { this.tank.equipment.autoConnect(); this.commitTankLayout(); }
  tankConnect(connection: ConnectionRecord): void {
    const error = this.tank.equipment.connect(connection);
    if (error) toast(error, 'warn'); else this.commitTankLayout();
  }
  tankDisconnect(id: string): void { this.tank.equipment.disconnect(id); this.commitTankLayout(); }

  private onHomeClick(clientX: number, clientY: number): void {
    if (this.mode === 'home' && ui.homePanel.value === 'tools') {
      const [nx, ny] = this.ndcOf(clientX, clientY);
      const id = this.tank.pickTool(nx, ny);
      if (id) this.toggleCarry(id);
      return;
    }
    const [nx, ny] = this.ndcOf(clientX, clientY);
    if (ui.homePanel.value === 'tank' && ui.tankTab.value === 'layout') {
      // in the editor a click selects a decoration (or clears the selection); the panel stays open
      ui.tankSelected.value = this.tank.pickItem(nx, ny);
      return;
    }
    const hit = this.tank.pick(nx, ny);
    if (hit?.kind === 'occupant') ui.homeInfo.value = hit.occupant.record;
    else if (hit?.kind === 'tank') { ui.homeInfo.value = null; if (this.mode === 'tankEdit') this.tank.pokeAt(nx, ny); else this.openTankEdit(); }
    else ui.homeInfo.value = null;
  }

  // ------------------------------------------------------------------ save
  requestSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => { this.saveTimer = null; void this.writeSave(); }, 1000);
  }

  async writeSave(): Promise<void> {
    const s = this.save;
    if (!s) return;
    s.updatedAt = Date.now();
    s.lastRealMs = Date.now();
    if (this.player && this.world) {
      s.player.pos = [this.player.position.x, this.player.position.y, this.player.position.z];
      s.player.heading = this.player.yaw;
      s.player.map = this.world.map.id;
    }
    s.ticket.active = this.clock.serialize();
    s.removedIndividuals = [...this.removed];
    s.tank.layout = this.tank.currentLayout;
    this.encyclopedia.writeSave(s);
    await this.saveStore.save(s);
    ui.hasSave.value = true;
  }

  exportSave(): string | null {
    return this.save ? this.saveStore.exportJson(this.save) : null;
  }

  async importSave(text: string): Promise<void> {
    const s = this.saveStore.importJson(text);
    await this.saveStore.save(s);
    ui.hasSave.value = true;
    toast(t('toast.saved'), 'success');
  }

  async resetSave(): Promise<void> {
    await this.saveStore.clear();
    ui.hasSave.value = false;
    location.reload();
  }

  // ------------------------------------------------------------------ loop
  private onResize(): void {
    this.renderer.resize();
    this.camera.aspect = this.renderer.aspect;
    this.camera.updateProjectionMatrix();
    this.tank?.setAspect(this.renderer.aspect);
    this.shop?.setAspect(this.renderer.aspect);
  }

  tidePhase(): TidePhase {
    const amp = this.tide.maxAmplitude();
    const level = this.world ? this.world.tideLevel : this.tide.level(this.clock.nowGame());
    const rate = this.world ? this.world.tideRate : this.tide.rate(this.clock.nowGame());
    if (level < -0.35 * amp) return 'low';
    if (level > 0.35 * amp) return 'high';
    return rate >= 0 ? 'rising' : 'falling';
  }

  private frame(now: number): void {
    this.raf = requestAnimationFrame((n) => this.frame(n));
    try {
      this.step(now);
    } catch (e) {
      // a frame that throws must not stop the game: say so once, keep going
      if (this.frameErrors++ < 3) console.error('[frame]', e);
      if (this.frameErrors === 1) toast(t('warn.frameError'), 'warn', 8000);
      this.lastFrame = now;
    }
  }

  private frameErrors = 0;

  private step(now: number): void {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.frameCount++;
    this.clock.update();
    const gameMs = this.clock.nowGame();
    const mode = this.mode;
    const world = this.world, player = this.player, creatures = this.creatures;

    if (this.input.pressed('debug')) this.toggleDebug();
    switch (mode) {
      case 'field':
        this.input.dragLook = true;
        if (!this.input.pointerLocked && (this.input.keyPressed('Enter') || this.input.keyPressed('Space'))) this.focusGame();
        if (this.input.pressed('menu')) { if (ui.mapOpen.value) ui.mapOpen.value = false; else this.openOverlay('menu'); }
        else if (this.input.pressed('map')) this.toggleMap();
        else if (this.input.pressed('zukan')) this.openOverlay('zukan');
        else if (this.input.pressed('ticket')) this.openOverlay('ticket');
        else if (this.input.pressed('home')) this.enterHome();
        else if (this.input.pressed('observe') && this.target) this.enterObserve(this.target);
        else if (this.input.pressed('observe') && this.targetClam >= 0) this.observeClam(this.targetClam);
        else if (this.input.pressed('observe') && this.targetOyster >= 0) this.observeOyster(this.targetOyster);
        else if (this.input.pressed('tool1') && this.encyclopedia.loadout.value[0]) this.setTool(this.encyclopedia.loadout.value[0]);
        else if (this.input.pressed('tool2') && this.encyclopedia.loadout.value[1]) this.setTool(this.encyclopedia.loadout.value[1]);
        else if (this.input.pressed('tool3') && this.encyclopedia.loadout.value[2]) this.setTool(this.encyclopedia.loadout.value[2]);
        else if (this.input.pressed('interact')) this.useTool();
        else if (this.input.pressed('caseView')) this.openCase();
        else if (this.input.pressed('sunglasses')) this.toggleSunglasses();
        break;
      case 'caseView':
        if (this.input.pressed('caseView') || this.input.pressed('menu')) this.closeCase();
        else if (this.input.pressed('zukan')) this.openOverlay('zukan');
        else this.caseKeys(dt);
        break;
      case 'observe':
        if (this.input.pressed('observe') || this.input.pressed('menu')) this.exitObserve();
        else if (this.input.pressed('speedUp')) this.observation.cycleSpeed(1);
        else if (this.input.pressed('speedDown')) this.observation.cycleSpeed(-1);
        else if (this.input.pressed('zukan')) this.openOverlay('zukan');
        else if (this.input.pressed('zoomIn')) this.observation.nudge(-1);
        else if (this.input.pressed('zoomOut')) this.observation.nudge(1);
        this.observation.zoom = this.input.mouseRightDown || this.input.held('zoom');
        this.observation.update(dt);
        break;
      case 'capture':
        // a tap moves on from the look into the net (an empty one is over in a blink anyway)
        if (this.input.pressed('interact') || this.input.mouseClicked) this.capture.skip();
        this.capture.update(dt);
        break;
      case 'home':
        this.tank.setAutoRotate(!this.tankKeys(dt));
        if (this.input.pressed('zukan')) this.openOverlay('zukan');
        else if (this.input.pressed('ticket')) this.openOverlay('ticket');
        else if (this.input.pressed('menu')) {
          if (ui.homePanel.value === 'tools') this.closeTools();
          else if (ui.homePanel.value !== 'none' || ui.homeInfo.value) { ui.homePanel.value = 'none'; ui.homeInfo.value = null; }
          else this.openOverlay('menu');
        }
        break;
      case 'tankEdit':
        this.tankKeys(dt);
        if (this.input.pressed('menu')) {
          if (ui.tankSelected.value) ui.tankSelected.value = null;
          else this.closeTankEdit();
        }
        break;
      case 'menu': case 'zukan': case 'ticket': case 'tidetable':
        if (this.input.pressed('menu') || (mode === 'zukan' && this.input.keyPressed('Tab'))) this.closeOverlay();
        break;
      case 'spots':
        if (this.input.pressed('menu')) this.closeOverlay();
        else if (this.input.keyPressed('Enter')) void this.enterField(ui.spot.value);
        break;
      case 'shop':
        if (this.input.pressed('menu')) this.closeShop();
        break;
      default: break;
    }

    if (world && player) {
      this.anchor.copy(player.position);
      world.update(gameMs, dt, this.anchor, this.camera);
    }
    this.renderer.gl.toneMappingExposure = this.tankVisible() ? 0.6 : (world?.exposure ?? 0.5);

    if (mode === 'shop' && this.shop) {
      this.shop.update(dt);
      this.renderer.gl.render(this.shop.scene, this.shop.camera);
    } else if (this.tankVisible()) {
      if (mode === 'tankEdit') this.tank.updateFrozen(); else this.tank.update(dt, 1);
      if (this.hero && this.tank.heroActive) {
        this.hero.setLighting(this.tank.lighting);
        this.hero.render(this.tank.scene, this.tank.camera, dt);
      } else this.renderer.gl.render(this.tank.scene, this.tank.camera);
    } else if (world && player && creatures) {
      if (mode === 'field') player.update(dt, this.settings.mouseSensitivity, this.settings.invertY);
      else if (mode === 'capture') player.idle(dt);
      this.fieldCase?.update(dt, player.position);
      const capTool = this.capture.state.value ? this.toolType(this.capture.state.value.toolId) : undefined;
      this.net?.update(this.camera, dt, mode === 'capture' && capTool === 'capture' ? this.capture.state.value : null, world.tideLevel, ui.debug.value && this.toolType() === 'capture' && (mode === 'field' || mode === 'capture'), this.netZoneScale(), this.netReach());
      this.shovel?.update(this.camera, dt, mode === 'capture' && capTool === 'dig' ? this.capture.state.value : null);
      // the binoculars: up while E or the right button is held, the view narrowed to their field
      if (this.binoculars && this.player) {
        const optic = this.toolType() === 'optic' ? this.toolDef() : undefined;
        const raise = !!optic && mode === 'field' && this.player.enabled && (this.input.held('interact') || this.input.mouseRightDown);
        this.binoculars.setRaised(raise);
        this.player.zoomFov = raise ? 70 / (optic?.params.magnification ?? 8) : null;
        this.binoculars.update(this.camera, dt);
      }
      this.clams?.update(player.position, this.worldVisible() ? dt : 0, gameMs / 1000, (x, z) => world.habitat.waterAt(x, z));
      // the oyster reef: open under the water, shut when the tide leaves or when footsteps come near
      world.oysters?.update(this.worldVisible() ? dt : 0, this.camera, world.tideLevel, { pos: player.position, speed: player.speedNow, running: player.running });
      creatures.update({
        dt: this.worldVisible() ? dt : 0, gameMs, playerPos: player.position, camera: this.camera, simScale: this.simScale,
        playerSpeed: player.speedNow, playerCrouched: player.crouching, playerRunning: player.running,
        tod: world.tod, season: world.season, tidePhase: this.tidePhase(), lockedId: this.lockedId,
      });
      if (mode === 'observe' && this.hero && creatures.heroActive(this.lockedId)) {
        const anchor = creatures.anchorOf(this.lockedId!) ?? player.position;
        this.hero.setLighting(this.heroLightingFromWorld(anchor));
        this.hero.render(world.scene, this.camera, dt, world.water);
      } else if (this.field) this.field.render(world.scene, this.camera, world.water);
      else this.renderer.gl.render(world.scene, this.camera);
      if ((this.net?.group.visible || this.shovel?.group.visible || this.binoculars?.group.visible) && (mode === 'capture' || mode === 'field')) this.renderNetOverlay(world.scene);
      if (ui.debug.value && ui.debugState.value.markers) {
        this.markerAcc += dt;
        if (this.markerAcc >= 1 / MARKER_HZ) { this.markerAcc = 0; this.updateMarkers(); }
      }
    }

    this.fpsAcc += dt; this.fpsCount++;
    this.hudAcc += dt;
    if (this.hudAcc >= 1 / HUD_HZ) { this.updateHud(gameMs); this.hudAcc = 0; }
    this.saveAcc += dt;
    if (this.saveAcc >= AUTOSAVE_SEC) { this.saveAcc = 0; void this.writeSave(); }
    if (this.save) this.save.stats.playSeconds += dt;
    this.input.endFrame();
  }

  /** The タモ over the finished frame: its own depth, no water on it, never cut by the ground. */
  private renderNetOverlay(scene: import('three').Scene): void {
    const gl = this.renderer.gl;
    const autoClear = gl.autoClear, shadows = gl.shadowMap.enabled;
    const background = scene.background;
    scene.background = null;   // a colour background would clear the frame
    gl.autoClear = false;
    gl.shadowMap.enabled = false;
    gl.clearDepth();
    this.camera.layers.set(NET_LAYER);
    gl.render(scene, this.camera);
    this.camera.layers.set(0);
    scene.background = background;
    gl.shadowMap.enabled = shadows;
    gl.autoClear = autoClear;
  }

  /** WASD in the room moves the viewpoint itself (the orbit centre comes along); the mouse turns and zooms. True while a key is held. */
  private tankKeys(dt: number): boolean {
    const i = this.input;
    const right = (i.held('right') ? 1 : 0) - (i.held('left') ? 1 : 0);
    const forward = (i.held('forward') ? 1 : 0) - (i.held('back') ? 1 : 0);
    this.tank.panCamera(right, forward, dt * (i.held('run') ? 2.2 : 1));
    return right !== 0 || forward !== 0;
  }

  /** Where the view's centre meets the ground within `maxDist` (marching the ray), or null. */
  private groundUnderReticle(maxDist: number): Vector3 | null {
    const world = this.world;
    if (!world) return null;
    const dir = this.camera.getWorldDirection(this.tmp2);
    const p = this.tmp3.copy(this.camera.position);
    const step = 0.08;
    for (let d = 0; d < maxDist; d += step) {
      p.addScaledVector(dir, step);
      if (p.y <= world.terrain.heightAt(p.x, p.z)) return p;
    }
    return null;
  }

  /** アマモ: patches drawn by tier and the leaf vertices they cost (debug panel). */
  private amamoStats(): string {
    const st = this.world?.amamo?.stats();
    if (!st) return '-';
    return `${st.visible}/${st.live}/${st.specs} 株 ${(st.shoots / 1000).toFixed(1)}k [${st.lod.join('/')}] 頂点 ${(st.vertices / 1e6).toFixed(2)}M`;
  }

  private updateMarkers(): void {
    const c = this.creatures, p = this.player;
    if (!c || !p) { ui.markers.value = []; return; }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const out: Marker[] = [];
    for (const ind of c.individuals) {
      const d = ind.pos.distanceTo(p.position);
      if (d > 80 || this.speciesHidden(ind.species.id)) continue;
      const a = c.anchorOf(ind.id) ?? ind.pos;
      this.tmp.copy(a).project(this.camera);
      if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.05 || Math.abs(this.tmp.y) > 1.05) continue;
      out.push({
        id: ind.id, x: ((this.tmp.x + 1) / 2) * w, y: ((1 - this.tmp.y) / 2) * h - 8,
        text: `${ind.species.names.ja} ${d.toFixed(1)}m L${ind.lod}${ind.sex === 'm' ? '♂' : '♀'} 警${ind.alert.toFixed(1)}/${ind.wariness.toFixed(1)}${d < 6 ? ' ' + (c.driverOf(ind.id)?.debugLabel?.() ?? '') : ''}`,
        kind: ind.species.taxon.group,
      });
      if (out.length >= 80) break;
    }
    // buried clams nearby: their spot on the sand (the siphon holes are too small to find in a screenshot)
    const clams = this.clams, world = this.world;
    if (clams && world && clams.group.visible) {
      let n = 0;
      const near = clams.nearIndices(p.position.x, p.position.z, 12)
        .map((k) => ({ k, d: Math.hypot(clams.xs[k] - p.position.x, clams.zs[k] - p.position.z) }))
        .sort((a, b) => a.d - b.d);
      for (const { k, d } of near) {
        const x = clams.xs[k], z = clams.zs[k];
        this.tmp.set(x, world.terrain.heightAt(x, z), z).project(this.camera);
        if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.05 || Math.abs(this.tmp.y) > 1.05) continue;
        out.push({
          id: `clam-${k}`, x: ((this.tmp.x + 1) / 2) * w, y: ((1 - this.tmp.y) / 2) * h - 8,
          text: `アサリ ${d.toFixed(1)}m${clams.state[k] === 1 ? ' 掘済' : ''}`, kind: 'mollusc',
        });
        if (++n >= 40) break;
      }
    }
    // the oyster reef: its clumps nearby
    const reef = this.world?.oysters;
    if (reef && reef.group.visible) {
      let n = 0;
      for (const i of reef.near(p.position.x, p.position.z, 10)) {
        reef.centreOf(i, this.tmp2);
        const d = this.tmp2.distanceTo(p.position);
        this.tmp.copy(this.tmp2).project(this.camera);
        if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.05 || Math.abs(this.tmp.y) > 1.05) continue;
        out.push({ id: `oyster-${i}`, x: ((this.tmp.x + 1) / 2) * w, y: ((1 - this.tmp.y) / 2) * h - 8, text: `マガキ ${d.toFixed(1)}m ${reef.stateOf(i)}`, kind: 'mollusc' });
        if (++n >= 30) break;
      }
    }
    ui.markers.value = out;
  }

  private updateHud(gameMs: number): void {
    const world = this.world, player = this.player;
    const hud = ui.hud.value;
    const minute = Math.floor(gameMs / 60000);
    let { extrema, tideCurve } = hud;
    if (minute !== this.curveCacheMin) {
      this.curveCacheMin = minute;
      extrema = this.tide.extrema(gameMs - 6 * 3600000, gameMs + 18 * 3600000);
      tideCurve = [];
      for (let i = -12; i <= 12; i++) {
        const tt = gameMs + (i / 2) * 3600000;
        tideCurve.push({ t: tt, level: this.tide.level(tt) });
      }
    }
    let prompt: string | null = null;
    if (this.mode === 'field' && this.creatures && player) {
      this.target = this.binoculars?.raised ? this.creatures.pickTarget(this.camera, this.toolDef()?.params.reach_m ?? 80, 1.2) : this.creatures.pickTarget(this.camera, 7);
      // the net: something catchable where the hoop would go through the water
      const netInHand = this.toolType() === 'capture';
      const inReach = netInHand && this.netZoneHits().length > 0;
      const deep = netInHand && this.swingSlow() * (this.netDef()?.params.deep ?? 1) >= 0.5 ? `　${t('hud.deepSlow')}` : '';
      // the net: a swing when something is under the hoop; "too far" when the animal looked at is beyond the handle
      const tooFarNet = netInHand && !inReach && !!this.target && this.target.species.collectable && this.target.pos.distanceTo(this.camera.position) > this.netReach() + 0.2;
      const dg = this.toolType() === 'dig' ? this.digTarget() : null;
      const toolHint = netInHand
        ? (inReach ? `[E] ${t('hud.swing')}${deep}` : tooFarNet ? t('hud.tooFar') : deep.trim())
        : (dg && !dg.far ? `[E] ${t('hud.dig')}` : t('hud.tooFar'));
      // a clam's siphon holes under the reticle
      this.targetClam = -1;
      if (this.clams && this.world && this.clams.group.visible) {
        const g = this.groundUnderReticle(3.5);
        if (g) this.targetClam = this.clams.nearest(g.x, g.z, 0.16);
      }
      const optic = this.toolType() === 'optic';
      // an oyster of the reef under the reticle (within arm's reach and a step)
      this.targetOyster = -1;
      if (!this.target && this.targetClam < 0 && !optic && this.world?.oysters?.group.visible) {
        this.targetOyster = this.world.oysters.pickRay(this.camera.position, this.camera.getWorldDirection(reticleDir), 2.6);
      }
      if (optic && !this.binoculars?.raised) {
        prompt = `[E] ${t('hud.raise')}`;
      } else if (optic && this.target) {
        prompt = `${this.target.species.names.ja}   [F] ${t('hud.observe')}`;
      } else if (optic) {
        prompt = '';
      } else if (this.target) {
        const sp = this.target.species;
        const digId = this.encyclopedia.loadout.value.find((x) => this.toolType(x) === 'dig');
        const shovelKey = digId ? this.encyclopedia.loadout.value.indexOf(digId) : -1;
        const digHint = this.toolType() === 'dig' ? toolHint : shovelKey >= 0 ? `[${shovelKey + 1}] ${this.toolDef(digId!)?.ja ?? ''}` : t('tools.noShovel');
        prompt = sp.locomotion === 'burrow'
          ? `${sp.names.ja}   [F] ${t('hud.observe')}   ${digHint}`
          : `${sp.names.ja}   [F] ${t('hud.observe')}${sp.collectable ? (toolHint ? `   ${toolHint}` : '') : `   ${t('hud.observeOnly')}`}`;
      } else if (this.targetClam >= 0) {
        const digId = this.encyclopedia.loadout.value.find((x) => this.toolType(x) === 'dig');
        const shovelKey = digId ? this.encyclopedia.loadout.value.indexOf(digId) : -1;
        prompt = `${t('clam.siphon')}   [F] ${t('hud.observe')}   ${this.toolType() === 'dig' ? toolHint : shovelKey >= 0 ? `[${shovelKey + 1}] ${this.toolDef(digId!)?.ja ?? ''}` : t('tools.noShovel')}`;
      } else if (this.targetOyster >= 0) {
        prompt = `${this.data.species.get('crassostrea_gigas')?.names.ja ?? 'マガキ'}   [F] ${t('hud.observe')}   ${t('hud.observeOnly')}`;
      } else if (toolHint) prompt = toolHint;
    }
    const fps = this.fpsCount / Math.max(1e-3, this.fpsAcc);
    this.fpsAcc = 0; this.fpsCount = 0;
    const tk = this.clock.ticket;
    const level = world ? world.tideLevel : this.tide.level(gameMs);
    const rate = world ? world.tideRate : this.tide.rate(gameMs);
    ui.hud.value = {
      ...hud,
      timeText: formatJst(gameMs),
      dateText: formatJst(gameMs, { date: true }).split(' ')[0],
      tideLevel: level,
      tideRate: rate,
      extrema, tideCurve,
      ticket: tk ? { remainingSec: Math.max(0, Math.round(tk.remainingSec)), phase: tk.phase, targetText: formatJst(tk.targetGameMs, { date: true }) } : null,
      caseCount: this.encyclopedia.caseItems.value.length,
      caseMax: this.encyclopedia.caseMax,
      prompt,
      tooDeep: player?.blockedByDepth ?? false,
      research: this.encyclopedia.research.value,
      money: this.encyclopedia.money.value,
      tod: world ? world.tod : hud.tod,
      season: world ? world.season : hud.season,
      fps: Math.round(fps),
      pointerLocked: this.input.pointerLocked,
    };
    if (ui.debug.value) {
      const info = (this.field?.lastStats ?? this.renderer.gl.info.render);
      const cs = this.creatures?.stats() ?? { total: 0, visible: 0, lod1: 0 };
      const clamsNear = this.clams && player ? this.clams.nearIndices(player.position.x, player.position.z, 12).length : 0;
      const reef = this.world?.oysters;
      ui.debugState.value = { ...ui.debugState.value, stats: { calls: info.calls, tris: info.triangles, creatures: cs.total, visible: cs.visible, lod1: cs.lod1, clamsNear, clamsTotal: this.clams?.count ?? 0, oysters: reef ? reef.drawn.join('/') : '-', oystersTotal: reef?.count ?? 0, amamo: this.amamoStats() } };
    }
  }
}
