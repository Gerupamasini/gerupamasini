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
import { World } from './World';
import { TankScene } from './TankScene';
import { FPSController } from '../player/FPSController';
import { CreatureSystem } from '../creatures/CreatureSystem';
import type { Individual, IndividualRecord } from '../creatures/Individual';
import { Encyclopedia } from '../systems/Encyclopedia';
import { Observation } from '../systems/Observation';
import { Capture } from '../systems/Capture';
import { ui, t, toast, type Screen } from '../ui/store';
import { Root } from '../ui/Root';
import { HeroPipeline } from '../render/HeroPipeline';
import { HeroInstance } from '../creatures/species/mahaze/hero/applyHero';

const HUD_HZ = 4;
const AUTOSAVE_SEC = 60;
const CAPTURE_RANGE = 2.6;

export class App {
  readonly renderer: GameRenderer;
  readonly camera: PerspectiveCamera;
  readonly input: Input;
  readonly clock = new GameClock();
  readonly saveStore = new SaveStore();
  readonly removed = new Set<string>();
  settings: SettingsData = null!;
  data: GameData = null!;
  encyclopedia: Encyclopedia = null!;
  observation: Observation = null!;
  capture: Capture = new Capture();
  world: World | null = null;
  player: FPSController | null = null;
  creatures: CreatureSystem | null = null;
  tank: TankScene | null = null;
  hero: HeroPipeline | null = null;
  save: SaveV1 | null = null;
  target: Individual | null = null;
  lockedId: string | null = null;
  private raf = 0;
  frameCount = 0;
  private lastFrame = 0;
  private hudAcc = 0;
  private fpsAcc = 0;
  private fpsCount = 0;
  private saveAcc = 0;
  private saveTimer: number | null = null;
  private curveCacheMin = -1;
  private readonly anchor = new Vector3();

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

  private setMode(m: Screen): void {
    ui.screen.value = m;
    const overlay = m !== 'field' && m !== 'observe' && m !== 'capture' && m !== 'tank';
    this.input.blocked = overlay;
    if (m !== 'field' && m !== 'capture') this.input.exitPointerLock();
    if (this.player) this.player.enabled = m === 'field';
    this.clock.setPaused(!this.worldVisible());
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
    this.encyclopedia = new Encyclopedia(this.data);
    this.encyclopedia.onChanged = () => this.requestSave();
    const existing = await this.saveStore.load();
    ui.hasSave.value = !!existing;
    this.setMode('title');
  }

  async startNewGame(): Promise<void> {
    this.save = emptySave(this.data.manifest.defaultMap, Date.now());
    this.encyclopedia.applySave(this.save);
    this.removed.clear();
    await this.enterField();
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
    await this.enterField();
    this.player!.setPose(s.player.pos[0], s.player.pos[2], s.player.heading);
  }

  async enterField(): Promise<void> {
    if (!this.world) {
      this.setMode('boot');
      ui.loading.value = { frac: 0.35, label: t('loading.map') };
      const map = this.data.maps.get(this.data.manifest.defaultMap)!;
      const station = this.data.stations.get(map.station)!;
      this.world = await World.create(map, station, this.renderer.gl, this.renderer.preset, (label) => { ui.loading.value = { frac: 0.5, label }; });
      this.player = new FPSController(this.camera, this.world.terrain, this.world.habitat, this.input, map);
      ui.loading.value = { frac: 0.7, label: t('loading.models') };
      this.creatures = new CreatureSystem(this.world.scene, this.data, this.world.habitat, this.world.terrain, this.renderer.preset, map.id, this.removed);
      await this.creatures.preload();
      this.observation = new Observation(this.camera, this.canvas, this.creatures);
      this.observation.onBehavior = (speciesId, behaviorId) => { this.encyclopedia.onBehavior(speciesId, behaviorId, this.clock.nowGame()); };
      this.capture.onResolved = (ind, ok) => this.onCaptureResolved(ind, ok);
      this.tank = new TankScene(this.canvas, this.renderer.aspect);
      if (this.renderer.caps.floatRT) {
        this.hero = new HeroPipeline(this.renderer.gl);
        this.applyHeroSetting();
      }
      this.tank.onBehavior = (e) => { const rec = this.encyclopedia.tankItems.value[0]; if (rec) this.encyclopedia.onBehavior(rec.speciesId, e.behaviorId, this.clock.nowGame()); };
      ui.loading.value = { frac: 0.95, label: t('loading.models') };
      this.onResize();
    }
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
    const back: Screen = from === 'observe' || from === 'tank' ? from : this.world ? 'field' : 'title';
    this.setMode(back);
  }

  async updateSettings(patch: Partial<SettingsData>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    this.renderer.setQuality(this.settings.quality);
    this.applyHeroSetting();
    await saveSettings(this.settings);
  }

  private applyHeroSetting(): void {
    const hero = this.hero;
    const fn = hero && this.settings.heroMaterials ? (model: Parameters<typeof HeroInstance.apply>[0]) => HeroInstance.apply(model, hero.shared) : null;
    if (this.creatures) this.creatures.heroApply = fn;
    if (this.tank) this.tank.heroApply = fn;
  }

  private heroLightingFromWorld(anchor: Vector3): import('../render/HeroPipeline').HeroLighting {
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

  enterTank(): void {
    if (!this.tank) return;
    this.setMode('tank');
    this.tank.setAspect(this.renderer.aspect);
    this.tank.activate();
    const rec = this.encyclopedia.tankItems.value[0];
    void this.tank.setOccupant(rec ?? null, rec ? this.data.species.get(rec.speciesId) : undefined);
  }

  leaveTank(): void {
    this.tank?.deactivate();
    this.tank?.clearOccupant();
    this.setMode('field');
    this.requestSave();
  }

  async tankPut(rec: IndividualRecord): Promise<void> {
    if (this.encyclopedia.tankItems.value.length > 0) return;
    this.encyclopedia.moveToTank(rec);
    await this.tank?.setOccupant(rec, this.data.species.get(rec.speciesId));
  }

  async tankRelease(rec: IndividualRecord): Promise<void> {
    if (!this.encyclopedia.moveToCase(rec)) { toast(t('capture.caseFull'), 'warn'); return; }
    this.tank?.clearOccupant();
  }

  // ------------------------------------------------------------------ save
  requestSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => { this.saveTimer = null; void this.writeSave(); }, 1000);
  }

  async writeSave(): Promise<void> {
    const s = this.save;
    if (!s || !this.player || !this.world) return;
    s.updatedAt = Date.now();
    s.lastRealMs = Date.now();
    s.player.pos = [this.player.position.x, this.player.position.y, this.player.position.z];
    s.player.heading = this.player.yaw;
    s.player.map = this.world.map.id;
    s.ticket.active = this.clock.serialize();
    s.removedIndividuals = [...this.removed];
    s.stats.playSeconds += 0;
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
    const w = this.world!;
    const amp = w.tide.maxAmplitude();
    if (w.tideLevel < -0.35 * amp) return 'low';
    if (w.tideLevel > 0.35 * amp) return 'high';
    return w.tideRate >= 0 ? 'rising' : 'falling';
  }

  private frame(now: number): void {
    this.raf = requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.frameCount++;
    const world = this.world, player = this.player, creatures = this.creatures;
    if (!world || !player || !creatures) return;
    this.clock.update();
    const gameMs = this.clock.nowGame();
    const mode = this.mode;
    this.anchor.copy(player.position);
    world.update(gameMs, dt, this.anchor, this.camera);

    switch (mode) {
      case 'field':
        if (this.input.pressed('menu')) this.openOverlay('menu');
        else if (this.input.pressed('zukan')) this.openOverlay('zukan');
        else if (this.input.pressed('ticket')) this.openOverlay('ticket');
        else if (this.input.pressed('home')) this.enterTank();
        else if (this.input.pressed('observe') && this.target) this.enterObserve(this.target);
        else if (this.input.pressed('interact') && this.target && this.target.species.collectable && this.target.pos.distanceTo(player.position) <= CAPTURE_RANGE) this.startCapture(this.target);
        break;
      case 'observe':
        if (this.input.pressed('observe') || this.input.pressed('menu')) this.exitObserve();
        else if (this.input.pressed('speedUp')) this.observation.cycleSpeed(1);
        else if (this.input.pressed('speedDown')) this.observation.cycleSpeed(-1);
        else if (this.input.pressed('zukan')) this.openOverlay('zukan');
        this.observation.update();
        break;
      case 'capture':
        if (this.input.mouseClicked || this.input.pressed('interact')) this.capture.attempt();
        if (this.input.pressed('menu')) { this.capture.cancel(); this.setMode('field'); }
        this.capture.update(dt);
        break;
      case 'tank':
        if (this.input.pressed('menu') || this.input.pressed('home')) this.leaveTank();
        else if (this.input.pressed('zukan')) this.openOverlay('zukan');
        break;
      case 'menu': case 'zukan': case 'ticket':
        if (this.input.pressed('menu') || (mode === 'zukan' && this.input.keyPressed('Tab'))) this.closeOverlay();
        break;
      default: break;
    }

    if (mode === 'tank' && this.tank) {
      this.tank.update(dt, 1);
      if (this.hero && this.tank.heroActive) {
        this.hero.setLighting(this.tank.lighting);
        this.hero.render(this.tank.scene, this.tank.camera, dt);
      } else this.renderer.gl.render(this.tank.scene, this.tank.camera);
    } else {
      if (mode === 'field') player.update(dt, this.settings.mouseSensitivity, this.settings.invertY);
      if (this.worldVisible() || mode === 'zukan' || mode === 'menu' || mode === 'ticket') {
        creatures.update({
          dt: this.worldVisible() ? dt : 0, gameMs, playerPos: player.position, camera: this.camera, simScale: this.simScale,
          tod: world.tod, season: world.season, tidePhase: this.tidePhase(), lockedId: this.lockedId,
        });
      }
      if (mode === 'observe' && this.hero && creatures.heroActive(this.lockedId)) {
        const anchor = creatures.anchorOf(this.lockedId!) ?? player.position;
        this.hero.setLighting(this.heroLightingFromWorld(anchor));
        this.hero.render(world.scene, this.camera, dt);
      } else this.renderer.gl.render(world.scene, this.camera);
    }

    this.fpsAcc += dt; this.fpsCount++;
    this.hudAcc += dt;
    if (this.hudAcc >= 1 / HUD_HZ) { this.updateHud(gameMs); this.hudAcc = 0; }
    this.saveAcc += dt;
    if (this.saveAcc >= AUTOSAVE_SEC) { this.saveAcc = 0; void this.writeSave(); }
    if (this.save) this.save.stats.playSeconds += dt;
    this.input.endFrame();
  }

  private updateHud(gameMs: number): void {
    const world = this.world!, player = this.player!;
    const hud = ui.hud.value;
    const minute = Math.floor(gameMs / 60000);
    let { extrema, tideCurve } = hud;
    if (minute !== this.curveCacheMin) {
      this.curveCacheMin = minute;
      extrema = world.tide.extrema(gameMs - 6 * 3600000, gameMs + 18 * 3600000);
      tideCurve = [];
      for (let i = -12; i <= 12; i++) {
        const tt = gameMs + (i / 2) * 3600000;
        tideCurve.push({ t: tt, level: world.tide.level(tt) });
      }
    }
    let prompt: string | null = null;
    if (this.mode === 'field' && this.creatures) {
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
    ui.hud.value = {
      ...hud,
      timeText: formatJst(gameMs),
      dateText: formatJst(gameMs, { date: true }).split(' ')[0],
      tideLevel: world.tideLevel,
      tideRate: world.tideRate,
      extrema, tideCurve,
      ticket: tk ? { remainingSec: Math.max(0, Math.round(tk.remainingSec)), phase: tk.phase, targetText: formatJst(tk.targetGameMs, { date: true }) } : null,
      caseCount: this.encyclopedia.caseItems.value.length,
      caseMax: this.encyclopedia.caseMax,
      prompt,
      tooDeep: player.blockedByDepth,
      research: this.encyclopedia.research.value,
      money: this.encyclopedia.money.value,
      tod: world.tod,
      season: world.season,
      fps: Math.round(fps),
      pointerLocked: this.input.pointerLocked,
    };
  }
}
