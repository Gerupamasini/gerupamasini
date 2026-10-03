import { Group, Vector3 } from 'three';
import { CrabModel } from './ScopimeraGlobosaModel.js';
import { CrabAnimator } from './ScopimeraGlobosaAnimator.js';
import { CrabBehavior, STATE, breedingFactor, seasonalActivity } from './ScopimeraGlobosaBehavior.js';
import { CHELA_POSES } from './ScopimeraGlobosaRig.js';
import { STANCE } from './ScopimeraGlobosaMorphology.js';
import { lodFor, updateEvery } from './ScopimeraGlobosaLOD.js';
import { clamp, hashString, mulberry, rrange } from './util.js';

export { STATE };

const _v = new Vector3();

/**
 * One コメツキガニ: model + animator + behaviour, fed by a perception snapshot each frame.
 *
 * The world around it (burrow, tide, threats, neighbours, pellets) comes from the colony in the field, or from a
 * plain stand-in (the home tank, the dev viewer). The crab itself owns no world state except its own body.
 */
export class ScopimeraGlobosa {
  /**
   * @param o {{ seed: number, sex: 'm'|'f', cw_mm: number, resident?: boolean, juvenile?: number, ovigerous?: boolean }}
   */
  constructor({ seed, sex, cw_mm, resident = true, juvenile = 0, ovigerous = false }) {
    this.seed = seed >>> 0;
    this.sex = sex;
    this.cw_mm = cw_mm;
    this.cw = cw_mm / 1000;
    const rand = mulberry(this.seed ^ 0x51ab);
    this.model = new CrabModel({ sex, cw_m: this.cw, seed: this.seed, juvenile });
    this.behavior = new CrabBehavior({ rand, sex, cw_mm, resident, ovigerous });
    this.animator = new CrabAnimator(this.model, { rand, personality: { speed: rrange(rand, 0.85, 1.2) * this.behavior.p.feedSpeed, jitter: this.behavior.p.jitter } });
    this.root = this.model.root;
    this.lod = 1;
    this.frame = 0;
    this.acc = 0;
    this.listeners = [];
    this.onPellet = null;      // (worldPos, radius_m, kind 'feed'|'dig') → place it on the sand
    this.onScoop = null;       // (worldPos) → a scrape mark
    this.onFootfall = null;
    this.animator.on((type, info) => this.onAnim(type, info));
  }

  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }

  onAnim(type, info) {
    const b = this.behavior;
    if (type === 'deposit') b.onDeposit(this.animator);
    else if (type === 'pinch') b.onPinch(this.animator);
    else if (type === 'drop') {
      const r = info.kind === 'dig' ? this.cw * rrange(Math.random, 0.17, 0.3) : this.cw * this.model.pelletDiam * 0.5;
      this.onPellet?.(info.pos, r, info.kind === 'dig' ? 'dig' : 'feed');
    } else if (type === 'scoop') this.onScoop?.(info.pos);
    else if (type === 'footfall') this.onFootfall?.(info.pos, info.leg);
  }

  /** put the crab in its burrow (or on the sand if it has none) */
  placeAt(x, z, heading, probe, inBurrow) {
    this.animator.placeAt(x, z, heading, probe);
    const b = this.behavior;
    if (inBurrow) { b.state = STATE.IN_BURROW; b.d = 1.9; }
  }

  /**
   * @param dt seconds (already scaled by the observation speed)
   * @param env perception snapshot (see makeEnv)
   */
  update(dt, env) {
    this.frame++;
    const b = this.behavior, a = this.animator;
    b._probe = env.probe;
    b.update(dt, env, a);
    a.update(dt, env.probe);
    // surface state of the cuticle
    this.model.setSurface(b.wet, b.sandCoat, b.tipSand, b.mouthWet);
    // drawn at all? deep in the burrow nothing shows
    const hidden = b.exposure <= 0.001 && (b.state === STATE.IN_BURROW || b.state === STATE.HIDE);
    this.model.setVisible(!hidden);
    for (const id of b.takeEvents()) for (const l of this.listeners) l(id);
  }

  get state() { return this.behavior.state; }
  get hidden() { return this.behavior.exposure < 0.15; }
  get pos() { return this.animator.pos; }
  get heading() { return this.animator.heading; }

  anchor(out) {
    return this.animator.anchor(out);
  }

  setLod(lod) { this.lod = lod; this.model.setLod(lod); }

  dispose() { this.model.dispose(); this.listeners = []; }
}

/**
 * @typedef {{ heightAt: (x: number, z: number) => number }} GroundProbe
 * @typedef {{ e: import('three').Vector3, axis: import('three').Vector3, r: number, az: number }} BurrowRef
 * @typedef {{ pos: import('three').Vector3, level: number, kind: string }} Threat
 * @typedef {{ pos: import('three').Vector3, dist: number, female?: boolean, waving?: boolean } | null} Neighbour
 * @typedef {{
 *   probe: GroundProbe, exposed: boolean, submerged: boolean, floodSoon: boolean, sinceExposed: number,
 *   light: number, season: { activity: number, breeding: number, doy: number }, threat: Threat | null,
 *   nearest: Neighbour, nearestFemale: Neighbour, neighborWaving: boolean, burrow: BurrowRef | null,
 *   observedCalm: boolean, onExcavate: ((pos: import('three').Vector3) => void) | null,
 * }} CrabEnv
 */

/**
 * A perception snapshot with neutral defaults: a dry, sunny, calm day in July, no burrow, nothing around.
 * The colony fills one per crab per tick; the tank and the viewer fill their own.
 * @param {GroundProbe} probe
 * @returns {CrabEnv}
 */
export function makeEnv(probe) {
  return {
    probe,
    exposed: true, submerged: false, floodSoon: false, sinceExposed: 3600,
    light: 1,
    season: { activity: 1, breeding: 0.8, doy: 190 },
    threat: null,
    nearest: null, nearestFemale: null, neighborWaving: false,
    burrow: null,
    observedCalm: false,
    onExcavate: null,
  };
}

export function seasonFor(doy) {
  return { activity: Math.max(0.05, seasonalActivity(doy)), breeding: breedingFactor(doy), doy };
}

// ============================================================================================ driver

/** a flat probe at a given height (tank floor) */
export function flatProbe(h = 0) {
  return { heightAt: () => h };
}

/**
 * CreatureSystem driver. In the field the colony owns the crab (it outlives the view: burrow, state, pellets) and
 * this adapter only hands it to the creature system; in the home tank (no colony) the driver owns a crab of its own.
 */
export class ScopimeraDriver {
  constructor() {
    this.root = null;
    this.ind = null;
    this.crab = null;
    this.owned = false;
    this.listeners = new Set();
    this.busy = false;
    this.unsub = null;
    this.tmp = new Vector3();
    this.tankEnv = null;
    this.goal = null;
    this.everyFrame = true;
  }

  static colony = null;

  static makeModel() {
    const root = new Group();
    root.name = 'ScopimeraGlobosa';
    return { root, parts: {}, length: 0.01 };
  }

  /** the 図鑑 / net preview: a male at modelLength (10 mm), standing, chelae folded */
  static makePreview() {
    const crab = new ScopimeraGlobosa({ seed: 20261003, sex: 'm', cw_mm: 10 });
    crab.setLod(0);
    crab.model.setShadows(false);
    poseStanding(crab);
    crab.model.setSurface(0.5, 0.3, 0.2, 0.5);
    const g = crab.root;
    g.userData.disposable = true;
    g.userData.crab = crab;
    return g;
  }

  attach(root, ind) {
    this.root = root;
    this.ind = ind;
    const colony = ScopimeraDriver.colony;
    const rec = ind.colonyRef !== undefined && colony ? colony.crabForIndividual(ind) : null;
    if (rec) {
      // the colony keeps the crab in its own group; nothing to re-parent
      this.crab = rec;
      this.owned = false;
      this.unsub = this.crab.on((id) => this.emit(id));
      return;
    } else {
      const seed = hashString(ind.id);
      this.crab = new ScopimeraGlobosa({ seed, sex: ind.sex === 'm' ? 'm' : 'f', cw_mm: ind.length_mm, resident: false });
      this.owned = true;
      this.crab.behavior.state = STATE.IDLE;
      this.crab.behavior.idleFor = 1;
    }
    root.add(this.crab.root);
    this.unsub = this.crab.on((id) => this.emit(id));
  }

  detach() {
    this.unsub?.();
    this.unsub = null;
    if (this.crab && this.owned) {
      this.crab.root.removeFromParent();
      this.crab.dispose();
    }
    this.crab = null;
    this.root = null;
  }

  setIntent(intent) {
    const crab = this.crab;
    if (!crab) return;
    const b = crab.behavior;
    if (intent.kind === 'flee') {
      // a net swung at it, or the brain's panic: a full startle from where the threat is
      b.threat = { pos: (intent.from ?? intent.target ?? crab.pos).clone(), level: 1, kind: 'startle' };
      b.fear = 1;
      ScopimeraDriver.colony?.startle(crab, intent.from ?? null, 1);
    } else if ((intent.kind === 'wander' || intent.kind === 'moveTo') && intent.target && this.owned) {
      this.goal = intent.target.clone();
    }
  }

  update(dt, ctx) {
    const crab = this.crab, ind = this.ind;
    if (!crab || !ind) return;
    const sdt = Math.min(0.05, dt * ctx.simScale);
    // a colony crab is updated by its colony (it lives on when the creature system drops its view)
    if (this.owned) this.updateOwned(sdt, ctx);
    ind.pos.copy(crab.pos);
    ind.heading = crab.heading;
  }

  /** the tank: always under water — the crab walks the sand, digs in, sits with its eyes up */
  updateOwned(dt, ctx) {
    const crab = this.crab;
    if (!this.tankEnv) {
      const h = ctx.floor.heightAt(this.ind.pos.x, this.ind.pos.z);
      this.tankEnv = makeEnv({ heightAt: (x, z) => ctx.floor.heightAt(x, z) });
      this.tankEnv.exposed = false;
      this.tankEnv.submerged = true;
      crab.placeAt(this.ind.pos.x, this.ind.pos.z, this.ind.heading, this.tankEnv.probe, false);
      crab.animator.pos.y = h;
    }
    const env = this.tankEnv;
    const b = crab.behavior;
    // under water a sand-bubbler does not feed; it rests, shifts about, buries itself
    if (b.state === STATE.FEED || b.state === STATE.WAVE || b.state === STATE.DIG) b.setState(STATE.IDLE);
    if (this.goal && b.state === STATE.IDLE) {
      b.goal = this.goal; b.afterWalk = 'idle'; b.walkSpeed = 1.5; b.setState(STATE.WALK); this.goal = null;
    }
    env.exposed = true;           // let the behaviour move; the tank never floods it out
    env.floodSoon = false;
    env.sinceExposed = 9999;
    env.season = seasonFor(190);
    env.light = 0.8;
    crab.update(dt, env);
    if (ctx.bounds) {
      const p = crab.animator.pos, B = ctx.bounds;
      p.x = Math.min(B.maxX, Math.max(B.minX, p.x));
      p.z = Math.min(B.maxZ, Math.max(B.minZ, p.z));
    }
    crab.setLod(ctx.locked ? 0 : 1);
  }

  onEvent(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(behaviorId) {
    if (!this.ind) return;
    const e = { individualId: this.ind.id, behaviorId, t: performance.now() };
    for (const l of this.listeners) l(e);
  }

  /** inside its burrow the crab cannot be seen, aimed at or netted */
  get hidden() { return this.crab ? this.crab.hidden : false; }

  /** debug marker text */
  get debugText() { return this.crab ? this.crab.behavior.debug : ''; }

  anchor() {
    if (!this.crab) return this.tmp.set(0, 0, 0);
    return this.crab.anchor(this.tmp);
  }

  dispose() {
    this.detach();
    this.listeners.clear();
  }
}

/** a standing pose (preview, tests): feet on the ground under the stance, chelae folded, eyes up */
export function poseStanding(crab) {
  const a = crab.animator;
  a.placeAt(0, 0, 0, flatProbe(0));
  a.cmd.height = STANCE.bodyHeight.calm;
  for (let i = 0; i < 20; i++) a.update(1 / 30, flatProbe(0));
  for (const c of crab.model.rig.chelae) c.setPose(CHELA_POSES.fold);
  crab.root.position.set(0, 0, 0);
  crab.root.rotation.set(0, 0, 0);
  crab.root.updateMatrixWorld(true);
}

export { clamp, lodFor, updateEvery };
