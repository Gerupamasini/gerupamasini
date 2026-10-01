import { Group, Vector3, type Object3D } from 'three';
import type { Individual } from '../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../drivers/Driver';
import type { PlaceholderModel } from '../models/placeholders';
import { HermitCrab, PagurusWorld, createPreviewCrab, type CrabState } from './PagurusMinutus.js';
import { MORPH, slFromLength } from './PagurusMinutusMorphology.js';
import { sunPosition } from '../../world/Sun';
import { seasonOf } from '../../core/Time';
import { ui } from '../../ui/store';

/** map origin of kasai_west (sun position for the activity model) */
const ORIGIN = { lat: 35.636, lon: 139.858 };
/** shield length of the preview individual (zukan / placeholder) */
const PREVIEW_SL = 4.6;

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h || 1;
}

/**
 * ユビナガホンヤドカリ driver. The crab runs its own behaviour model (PagurusMinutusBehavior); intents from
 * the game's behaviour tree are passed in as suggestions (rest / wander / forage) or stimuli (flee).
 * The procedural model is rebuilt for the individual on every attach (the placeholder only carries a
 * posed preview crab for the zukan); persistent state (position, drives, shell) survives re-attach.
 */
export class PagurusMinutusDriver implements Driver {
  private crab: HermitCrab | null = null;
  private ind: Individual | null = null;
  private wrapper: Object3D | null = null;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private saved: CrabState | null = null;
  private unsubCrab: (() => void) | null = null;
  private intentUntil = 0;
  private time = 0;
  private sunTimer = 0;
  private sunElevation = 30;
  private season = 'summer';
  private sampleTimer = 0;
  private sample: ReturnType<NonNullable<DriverContext['floor']['sampleAt']>> | null = null;
  private readonly tmp = new Vector3();
  busy = false;

  /** posed preview crab inside a wrapper group (the zukan shows it as is) */
  static makeModel(): PlaceholderModel {
    const crab = createPreviewCrab({ shieldLength_mm: PREVIEW_SL });
    const root = new Group();
    root.name = 'PagurusMinutus_Placeholder';
    root.add(crab.root);
    root.userData.pagurusPreview = crab;
    return { root, parts: {}, length: (MORPH.totalLengthPerSL * PREVIEW_SL) / 1000 };
  }

  attach(root: Object3D, individual: Individual): void {
    this.ind = individual;
    this.wrapper = root;
    const preview = root.userData.pagurusPreview as HermitCrab | undefined;
    const seed = hashString(individual.id);
    const crab = new HermitCrab({
      id: individual.id, seed, sex: individual.sex === 'm' ? 'm' : 'f',
      shieldLength_mm: slFromLength(individual.length_mm), shell: this.saved?.shell ?? undefined, lod: 1,
    });
    if (preview) {
      // host scenes (the tank) re-light the placeholder's materials: carry that over to the real crab
      crab.chainForeignMaterials(preview);
      preview.dispose();
      root.userData.pagurusPreview = null;
    }
    root.add(crab.root);
    crab.world = PagurusWorld.of(root);
    crab.world.register(crab);
    const groundAt = () => individual.pos.y;
    if (this.saved) crab.restoreState(this.saved, { groundAt });
    else crab.placeAt(new Vector3(individual.pos.x, individual.pos.y, individual.pos.z), individual.heading, { groundAt });
    // feet are re-planted on the real substrate at the first update
    crab.loco.initialised = false;
    this.unsubCrab = crab.onEvent((id) => this.emit(id));
    this.crab = crab;
  }

  detach(): void {
    if (this.crab) {
      this.saved = this.crab.saveState();
      this.unsubCrab?.();
      this.crab.dispose();
    }
    this.crab = null;
    this.wrapper = null;
  }

  setIntent(intent: Intent): void {
    this.busy = true;
    this.intentUntil = this.time + (intent.seconds > 0 ? intent.seconds : 6);
    this.crab?.behavior.suggest(intent, this.ind?.pos);
  }

  update(dt: number, ctx: DriverContext): void {
    const crab = this.crab, ind = this.ind;
    if (!crab || !ind) return;
    const sdt = dt * ctx.simScale;
    this.time += sdt;
    // slow environment inputs: sun elevation and season (activity model), habitat sample (substrate, pools)
    this.sunTimer -= dt;
    if (this.sunTimer <= 0) {
      this.sunTimer = 5;
      this.sunElevation = sunPosition(ctx.nowMs, ORIGIN.lat, ORIGIN.lon).elevation;
      this.season = seasonOf(ctx.nowMs);
    }
    this.sampleTimer -= dt;
    if (this.sampleTimer <= 0 && ctx.floor.sampleAt) {
      this.sampleTimer = 0.5;
      this.sample = ctx.floor.sampleAt(crab.loco.position.x, crab.loco.position.z);
    }
    // the tank (and other hosts) may clamp the individual's position: follow it
    const lp = crab.loco.position;
    if (Math.hypot(ind.pos.x - lp.x, ind.pos.z - lp.z) > 2 * crab.SL) { lp.x = ind.pos.x; lp.z = ind.pos.z; }
    const inTank = ind.lod === 3; // field individuals are only updated while visible (lod 0–2)
    const debug = ui.debug.value && ui.debugState.value.markers;
    const dist = ind.pos.distanceTo(ctx.player);
    crab.debugEnabled = debug && dist < 3;
    crab.update(sdt, {
      groundAt: (x: number, z: number) => ctx.floor.heightAt(x, z),
      waterAt: (x: number, z: number) => ctx.floor.waterAt(x, z),
      sample: this.sample,
      player: ctx.player,
      alert: ind.alert,
      tank: inTank,
      sunElevation: this.sunElevation,
      season: this.season,
      frame: ctx.nowMs,
      lodDistance: dist,
      locked: ind.lod === 0,
      closeup: inTank,
    });
    ind.pos.copy(crab.loco.position);
    ind.heading = crab.loco.heading;
    if (this.busy && this.time > this.intentUntil) this.busy = false;
  }

  onEvent(cb: (e: BehaviorEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(behaviorId: string): void {
    if (!this.ind) return;
    const e: BehaviorEvent = { individualId: this.ind.id, behaviorId, t: performance.now() };
    for (const l of this.listeners) l(e);
  }

  /** camera anchor: the cephalothorax */
  anchor(): Vector3 {
    if (this.crab) return this.tmp.setFromMatrixPosition(this.crab.rig.root.matrixWorld);
    return this.ind ? this.tmp.copy(this.ind.pos) : this.tmp.set(0, 0, 0);
  }

  /** state, drives and shell for debug markers */
  debugLabel(): string {
    const c = this.crab;
    if (!c) return '';
    const s = c.behavior.internal;
    return `${c.behavior.state}${c.behavior.sub ? '·' + c.behavior.sub : ''} 怖${s.fear.toFixed(2)} 空${s.hunger.toFixed(2)} 殻${s.shellSatisfaction.toFixed(2)} ${c.shell?.props.ja ?? ''}`;
  }

  dispose(): void {
    this.detach();
    this.saved = null;
    this.listeners.clear();
  }
}
