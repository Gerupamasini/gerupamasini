import { PerspectiveCamera, Vector3 } from 'three';
import { render, h } from 'preact';
import { GameRenderer } from '../render/Renderer';
import { Input } from '../core/Input';
import { GameClock, TICKET_RANGE_DAYS } from '../core/GameClock';
import { loadSettings, saveSettings, type SettingsData } from '../core/Settings';
import { formatJst } from '../core/Time';
import { SaveStore, emptySave, type SaveV1 } from '../core/Save';
import { loadGameData, type GameData } from '../data/loader';
import type { TidePhase } from '../data/schemas';
import { TideModel } from '../tide/TideModel';
import { World } from './World';
import { TankScene, TANK_MAX_OCCUPANTS } from './TankScene';
import { defaultTankLayout, type TankItemType, type TankSubstrate } from './TankLayout';
import { FPSController } from '../player/FPSController';
import { CreatureSystem, type SpawnEnv } from '../creatures/CreatureSystem';
import type { Individual, IndividualRecord } from '../creatures/Individual';
import { Encyclopedia } from '../systems/Encyclopedia';
import { Observation } from '../systems/Observation';
import { Capture } from '../systems/Capture';
import { ui, t, toast, type Screen, type Marker } from '../ui/store';
import { Root } from '../ui/Root';
import { HeroPipeline, type HeroLighting } from '../render/HeroPipeline';
import { FieldRenderer } from '../render/FieldRenderer';
import { HeroInstance } from '../creatures/species/mahaze/hero/applyHero';

const HUD_HZ = 4;
const MARKER_HZ = 10;
const AUTOSAVE_SEC = 60;
const CAPTURE_RANGE = 2.6;

export type TeleportTarget = 'spawn' | 'waterline' | 'runnel' | 'creek' | 'pool';

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
  capture: Capture = new Capture();
  tank: TankScene = null!;
  hero: HeroPipeline | null = null;
  private field: FieldRenderer | null = null;
  world: World | null = null;
  player: FPSController | null = null;
  creatures: CreatureSystem | null = null;
  save: SaveV1 | null = null;
  target: Individual | null = null;
  lockedId: string | null = null;
  frameCount = 0;
  readonly tankMax = TANK_MAX_OCCUPANTS;
  private pointerDown: { x: number; y: number; t: number } | null = null;
  private pendingPose: { x: number; z: number; heading: number } | null = null;
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
  private dragItem: string | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly uiRoot: HTMLElement) {
    this.renderer = new GameRenderer(canvas);
    this.camera = new PerspectiveCamera(70, this.renderer.aspect, 0.05, 2500);
    this.input = new Input(canvas);
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      this.clock.setPaused(document.hidden || !this.worldVisible());
      if (document.hidden) void this.writeSave();
    });
    window.addEventListener('beforeunload', () => { void this.writeSave(); });
    canvas.addEventListener('pointerdown', (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
      // in the layout editor a press on a decoration starts dragging it over the sand
      if (this.mode === 'home' && ui.homePanel.value === 'tank' && ui.tankTab.value === 'layout' && e.button === 0) {
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
      if (!d || this.mode !== 'home') return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 350) return;
      this.onHomeClick(e.clientX, e.clientY);
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
    return this.mode === 'field' || this.mode === 'observe' || this.mode === 'capture';
  }

  /** true when the tank should be on screen (home, or an overlay opened from home) */
  private tankVisible(): boolean {
    const m = this.mode;
    if (m === 'home') return true;
    if (m === 'zukan' || m === 'menu' || m === 'ticket' || m === 'tidetable') return ui.overlayFrom.value === 'home' || !this.world;
    return false;
  }

  private setMode(m: Screen): void {
    ui.screen.value = m;
    const overlay = m !== 'field' && m !== 'observe' && m !== 'capture' && m !== 'home';
    this.input.blocked = overlay;
    if (m !== 'field' && m !== 'capture') this.input.exitPointerLock();
    if (this.player) this.player.enabled = m === 'field';
    this.clock.setPaused(!this.worldVisible() && m !== 'home');
  }

  // ------------------------------------------------------------------ boot
  async start(): Promise<void> {
    render(h(Root, { app: this }), this.uiRoot);
    this.settings = await loadSettings();
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
    const map = this.data.maps.get(this.data.manifest.defaultMap)!;
    this.tide = new TideModel(this.data.stations.get(map.station)!);
    this.encyclopedia = new Encyclopedia(this.data);
    this.encyclopedia.onChanged = () => this.requestSave();
    this.tank = new TankScene(this.canvas, this.renderer.aspect, this.renderer.gl);
    this.tank.onBehavior = (e, rec) => { this.encyclopedia.onBehavior(rec.speciesId, e.behaviorId, this.clock.nowGame()); };
    if (this.renderer.caps.floatRT) this.hero = new HeroPipeline(this.renderer.gl);
    if (this.renderer.caps.floatRT) this.field = new FieldRenderer(this.renderer.gl);
    this.applyHeroSetting();
    if (new URLSearchParams(location.search).has('debug')) ui.debug.value = true;
    const existing = await this.saveStore.load();
    ui.hasSave.value = !!existing;
    this.setMode('title');
    this.updateHud(this.clock.nowGame());
  }

  async startNewGame(): Promise<void> {
    this.save = emptySave(this.data.manifest.defaultMap, Date.now());
    this.encyclopedia.applySave(this.save);
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
    this.removed.clear();
    for (const id of s.removedIndividuals) this.removed.add(id);
    if (Date.now() < s.lastRealMs - 5 * 60 * 1000) {
      toast(t('warn.clock'), 'warn', 6000);
      s.ticket.active = null;
    }
    this.clock.restore(s.ticket.active);
    this.pendingPose = { x: s.player.pos[0], z: s.player.pos[2], heading: s.player.heading };
    this.enterHome();
  }

  /** Home: the tank fills the screen behind the menu. */
  enterHome(): void {
    this.player?.resetFov();
    this.setMode('home');
    ui.homePanel.value = 'none';
    this.tank.setAspect(this.renderer.aspect);
    this.tank.activate(true);
    this.tank.frameTank();
    void this.tank.setOccupants(this.encyclopedia.tankItems.value, (id) => this.data.species.get(id));
    this.tank.setLayout(this.save?.tank.layout ?? defaultTankLayout());
    this.lastFrame = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame((now) => this.frame(now));
    this.requestSave();
  }

  async enterField(): Promise<void> {
    if (!this.world) {
      this.setMode('boot');
      ui.loading.value = { frac: 0.35, label: t('loading.map') };
      const map = this.data.maps.get(this.data.manifest.defaultMap)!;
      this.world = await World.create(map, this.tide, this.renderer.gl, this.renderer.preset, (label) => { ui.loading.value = { frac: 0.5, label }; });
      this.player = new FPSController(this.camera, this.world.terrain, this.world.habitat, this.input, map);
      this.player.eyeHeight = this.settings.eyeHeight;
      ui.loading.value = { frac: 0.7, label: t('loading.models') };
      this.creatures = new CreatureSystem(this.world.scene, this.data, this.world.habitat, this.world.terrain, this.renderer.preset, map.id, this.removed);
      await this.creatures.preload();
      this.observation = new Observation(this.camera, this.canvas, this.creatures);
      this.observation.onBehavior = (speciesId, behaviorId) => { this.encyclopedia.onBehavior(speciesId, behaviorId, this.clock.nowGame()); };
      this.capture.onResolved = (ind, ok) => this.onCaptureResolved(ind, ok);
      this.applyHeroSetting();
      if (this.pendingPose) { this.player.setPose(this.pendingPose.x, this.pendingPose.z, this.pendingPose.heading); this.pendingPose = null; }
      ui.loading.value = { frac: 0.95, label: t('loading.models') };
      this.onResize();
    }
    this.tank.deactivate();
    this.setMode('field');
    this.lastFrame = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame((now) => this.frame(now));
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
    if (from === 'observe' || from === 'home' || from === 'field') this.setMode(from);
    else this.setMode(this.world ? 'field' : this.save ? 'home' : 'title');
  }

  async updateSettings(patch: Partial<SettingsData>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    this.renderer.setQuality(this.settings.quality);
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
    if (this.save) this.save.ticket.usedCount++;
    toast(`${t('ticket.active')}: ${formatJst(targetGameMs, { date: true })}`, 'info');
    this.requestSave();
    return true;
  }

  cancelTicket(): void {
    this.clock.cancelTicket();
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
    ui.debugState.value = { ...ui.debugState.value, timeOverride: ms !== null };
    this.curveCacheMin = -1;
  }

  setTideOverride(level: number | null): void {
    if (this.world) this.world.tideOverride = level;
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

  teleport(target: TeleportTarget): void {
    const w = this.world, p = this.player;
    if (!w || !p) return;
    const map = w.map;
    let x = map.spawnStart.x, z = map.spawnStart.z, yaw = Math.PI;
    switch (target) {
      case 'waterline': {
        x = 0;
        for (let zz = -w.terrain.half + 5; zz < w.terrain.half - 5; zz += 1) {
          if (w.habitat.depthAt(0, zz) >= 0.08) { z = zz - 4; break; }
        }
        break;
      }
      case 'runnel': x = 0; z = -8 + 8 * Math.sin(0); break;
      case 'creek': x = -70 + 25 * Math.sin(100 / 70) + 9; z = 0; yaw = Math.PI / 2; break;
      case 'pool': { const pool = w.habitat.pools[0]; if (pool) { x = pool.cx + 6; z = pool.cz; yaw = Math.PI / 2; } break; }
      default: break;
    }
    p.setPose(x, z, yaw, -0.15);
  }

  setHomePanel(panel: 'none' | 'tank'): void {
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
    this.setMode('field');
  }

  startCapture(ind: Individual): void {
    const tool = this.data.tools.get('hand_net');
    if (!tool || !ind.species.collectable) return;
    if (this.encyclopedia.caseItems.value.length >= this.encyclopedia.caseMax) { toast(t('capture.caseFull'), 'warn'); return; }
    this.capture.start(ind, tool);
    this.setMode('capture');
  }

  private onCaptureResolved(ind: Individual, ok: boolean): void {
    if (!this.creatures || !this.world) return;
    if (ok) {
      this.encyclopedia.onCaptured(ind, this.clock.nowGame(), this.world.tideLevel);
      this.creatures.remove(ind.id);
    } else {
      const away = new Vector3().subVectors(ind.pos, this.player!.position).setY(0).normalize().multiplyScalar(1.5);
      this.creatures.forceIntent(ind.id, { id: -1, kind: 'flee', urgency: 1, seconds: 4, target: ind.pos.clone().add(away), from: this.player!.position.clone() });
      toast(t('capture.fail'), 'warn');
    }
    this.setMode('field');
    this.requestSave();
  }

  async tankPut(rec: IndividualRecord): Promise<void> {
    if (this.encyclopedia.tankItems.value.length >= this.tankMax) return;
    this.encyclopedia.moveToTank(rec);
    await this.tank.setOccupants(this.encyclopedia.tankItems.value, (id) => this.data.species.get(id));
  }

  async tankRelease(rec: IndividualRecord): Promise<void> {
    if (!this.encyclopedia.moveToCase(rec)) { toast(t('capture.caseFull'), 'warn'); return; }
    this.tank.removeOccupant(rec.id);
  }

  openShop(): void {
    toast(`${t('home.shop')}: ${t('home.soon')}`, 'info');
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

  private onHomeClick(clientX: number, clientY: number): void {
    const [nx, ny] = this.ndcOf(clientX, clientY);
    if (ui.homePanel.value === 'tank' && ui.tankTab.value === 'layout') {
      // in the editor a click selects a decoration (or clears the selection); the panel stays open
      ui.tankSelected.value = this.tank.pickItem(nx, ny);
      return;
    }
    const hit = this.tank.pick(nx, ny);
    if (hit?.kind === 'occupant') ui.homeInfo.value = hit.occupant.record;
    else if (hit?.kind === 'tank') { ui.homeInfo.value = null; ui.homePanel.value = 'tank'; this.tank.pokeAt(nx, ny); }
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
        if (this.input.pressed('menu')) { if (ui.mapOpen.value) ui.mapOpen.value = false; else this.openOverlay('menu'); }
        else if (this.input.pressed('map')) this.toggleMap();
        else if (this.input.pressed('zukan')) this.openOverlay('zukan');
        else if (this.input.pressed('ticket')) this.openOverlay('ticket');
        else if (this.input.pressed('home')) this.enterHome();
        else if (this.input.pressed('observe') && this.target) this.enterObserve(this.target);
        else if (this.input.pressed('interact') && this.target && this.target.species.collectable && player && this.target.pos.distanceTo(player.position) <= CAPTURE_RANGE) this.startCapture(this.target);
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
        if (this.input.mouseClicked || this.input.pressed('interact')) this.capture.attempt();
        if (this.input.pressed('menu')) { this.capture.cancel(); this.setMode('field'); }
        this.capture.update(dt);
        break;
      case 'home':
        this.tank.setAutoRotate(ui.homePanel.value !== 'tank');
        if (this.input.pressed('zukan')) this.openOverlay('zukan');
        else if (this.input.pressed('ticket')) this.openOverlay('ticket');
        else if (this.input.pressed('menu')) {
          if (ui.homePanel.value !== 'none' || ui.homeInfo.value) { ui.homePanel.value = 'none'; ui.homeInfo.value = null; }
          else this.openOverlay('menu');
        }
        break;
      case 'menu': case 'zukan': case 'ticket': case 'tidetable':
        if (this.input.pressed('menu') || (mode === 'zukan' && this.input.keyPressed('Tab'))) this.closeOverlay();
        break;
      default: break;
    }

    if (world && player) {
      this.anchor.copy(player.position);
      world.update(gameMs, dt, this.anchor, this.camera);
    }
    this.renderer.gl.toneMappingExposure = this.tankVisible() ? 0.6 : (world?.exposure ?? 0.5);

    if (this.tankVisible()) {
      this.tank.update(dt, 1);
      if (this.hero && this.tank.heroActive) {
        this.hero.setLighting(this.tank.lighting);
        this.hero.render(this.tank.scene, this.tank.camera, dt);
      } else this.renderer.gl.render(this.tank.scene, this.tank.camera);
    } else if (world && player && creatures) {
      if (mode === 'field') player.update(dt, this.settings.mouseSensitivity, this.settings.invertY);
      creatures.update({
        dt: this.worldVisible() ? dt : 0, gameMs, playerPos: player.position, camera: this.camera, simScale: this.simScale,
        tod: world.tod, season: world.season, tidePhase: this.tidePhase(), lockedId: this.lockedId,
      });
      if (mode === 'observe' && this.hero && creatures.heroActive(this.lockedId)) {
        const anchor = creatures.anchorOf(this.lockedId!) ?? player.position;
        this.hero.setLighting(this.heroLightingFromWorld(anchor));
        this.hero.render(world.scene, this.camera, dt, world.water);
      } else if (this.field) this.field.render(world.scene, this.camera, world.water);
      else this.renderer.gl.render(world.scene, this.camera);
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

  private updateMarkers(): void {
    const c = this.creatures, p = this.player;
    if (!c || !p) { ui.markers.value = []; return; }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const out: Marker[] = [];
    for (const ind of c.individuals) {
      const d = ind.pos.distanceTo(p.position);
      if (d > 80) continue;
      const a = c.anchorOf(ind.id) ?? ind.pos;
      this.tmp.copy(a).project(this.camera);
      if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.05 || Math.abs(this.tmp.y) > 1.05) continue;
      out.push({
        id: ind.id, x: ((this.tmp.x + 1) / 2) * w, y: ((1 - this.tmp.y) / 2) * h - 8,
        text: `${ind.species.names.ja} ${d.toFixed(1)}m L${ind.lod}${ind.sex === 'm' ? '♂' : '♀'}${d < 6 ? ' ' + (c.driverOf(ind.id)?.debugLabel?.() ?? '') : ''}`,
        kind: ind.species.taxon.group,
      });
      if (out.length >= 80) break;
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
      this.target = this.creatures.pickTarget(this.camera, 7);
      if (this.target) {
        const sp = this.target.species;
        const near = this.target.pos.distanceTo(player.position) <= CAPTURE_RANGE;
        prompt = sp.collectable
          ? `${sp.names.ja}   [F] ${t('hud.observe')}   ${near ? `[E] ${t('hud.interact')}` : '（近づくと採集）'}`
          : `${sp.names.ja}   [F] ${t('hud.observe')}   ${t('hud.observeOnly')}`;
      }
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
      const info = this.renderer.gl.info.render;
      const cs = this.creatures?.stats() ?? { total: 0, visible: 0, lod1: 0 };
      ui.debugState.value = { ...ui.debugState.value, stats: { calls: info.calls, tris: info.triangles, creatures: cs.total, visible: cs.visible, lod1: cs.lod1 } };
    }
  }
}
