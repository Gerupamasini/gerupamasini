import { Vector3 } from 'three';
import type { Floor, Food, ScentProbe } from '../../drivers/Driver';
import type { Rng } from '../../../core/Rng';
import { HEAD, MODEL_SH } from './anatomy';
import { REST } from './body';
import { restPose, type AmPose } from './pose';

/**
 * What the アラムシロ does, and how its body moves while it does it. Six states:
 *
 *   IDLE           at rest on its foot: the siphon turns slowly, tasting the water; the tentacles twitch
 *   CRAWL          gliding on the foot: the front of the foot reaches out and lifts a little, the hind part hauls up
 *                  after it with the shell (the shell surges and sways with each haul), faint waves run along the
 *                  margin; the siphon held forward and up, swinging from side to side; the tentacles spread
 *   FORAGE         searching: short runs and stops, the siphon sweeping wide; on the scent of carrion it heads up the
 *                  plume toward it, casting from side to side and stopping now and then to sample
 *   FEED           at the carrion: the head down against it, the proboscis everted into the meat, pumping; the siphon
 *                  raised; it eats for a quarter of an hour or so and leaves
 *   BURROW         ploughing in nose first, the shell rocked from side to side, until only the siphon shows above the
 *                  sand; it comes out again when carrion is in the water or it has somewhere to go
 *   HIDE_IN_SHELL  the tentacles and siphon snap back, the head, then the foot folds into the aperture, the shell falls
 *                  onto its side and the operculum shuts; after a while it comes out again foot first
 *
 * From the literature (docs/models/aramushiro/README.md): detects carrion from 80 cm and more and turns toward it,
 * arriving within half an hour (crowds of forty at a bait); a meal lasts some 13 minutes; moving toward food at 1–3
 * cm/min net in its relatives; rests buried with only the siphon out and comes out at once to the smell of carrion.
 * The foot of nassariids glides on cilia (no strong pedal waves); the visible rhythm is the columellar muscle hauling
 * the shell forward behind the reaching propodium.
 */

export type AmState = 'IDLE' | 'CRAWL' | 'FORAGE' | 'FEED' | 'BURROW' | 'HIDE_IN_SHELL';

export type { Food, ScentProbe };

export interface SnailEnv {
  floor: Floor;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** soft ground to dig into */
  canBurrow: boolean;
  /** seconds (sim) */
  t: number;
  scent: ScentProbe | null;
  /** the water's drift (m/s, xz) carrying the smell */
  current: { x: number; y: number } | null;
  /** the water this animal must stay in (m) */
  minDepth?: number;
}

/** a mark the snail leaves in the sand (sand.ts draws them) */
export interface TrailMark { x: number; z: number; heading: number; len: number; t: number }

const TAU = Math.PI * 2;
export const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const ease = (cur: number, want: number, dt: number, tau: number): number => cur + (want - cur) * Math.min(1, dt / Math.max(1e-4, tau));
const smooth = (e0: number, e1: number, x: number): number => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
/** a smooth 0→1 over [a, b] of a clock */
const ramp = (t: number, a: number, b: number): number => smooth(a, b, t);

/** speeds in shell heights per second: wandering, toward food, after a fright (an instant glide, between stops) */
export const PACE = { crawl: 0.05, food: 0.075, away: 0.06 };
/** the scent: how far it carries down the current and in still water (m); the reading that turns a snail */
export const SCENT = { reach: 2.0, still: 0.9, threshold: 0.12 };
/** how deep a buried snail lies (shell heights, under the bed to the foot) */
export const BURY = 0.6;
/** a meal (s): 8–18 min */
export const MEAL = { min: 480, max: 1080 };
/** meat taken from a piece per second of feeding (share of the piece) */
const BITE = 9e-5;

export class Aramushiro {
  readonly pos = new Vector3();
  heading = 0;
  /** shell height (m) */
  readonly size: number;
  readonly scale: number;
  readonly id: string;
  state: AmState = 'IDLE';
  sub = '';
  readonly pose: AmPose = restPose();
  /** how deep the animal is in the sand (m, world) */
  sink = 0;
  /** nose-down while digging (rad) */
  dig = 0;
  /** the burrow's sand heaped round it (0..1), and a hole left by one that came out (0..1) */
  mound = 0;
  pit = 0;
  readonly pitAt = new Vector3();
  /** the food it is after or eating */
  food: Food | null = null;
  foodAngle = 0;
  /** what it has eaten lately (0 hungry … 1 full) */
  fullness = 0;
  /** the last scent reading (0..) and its bearing (world, rad) */
  smell = 0;
  smellDir = 0;
  done = true;
  onEvent: ((id: string) => void) | null = null;
  /** marks to lay in the sand */
  readonly marks: TrailMark[] = [];
  /** how long the siphon must be to reach a little above the sand from where it leaves the shell (share of its length; the driver measures it) */
  siphonReach = 1;
  /** level of detail of the drawing (0 near … 2 far): less of the body is worked out far off */
  lod: 0 | 1 | 2 = 0;

  private rng: Rng;
  private timer = 0;
  private clock = 0;
  private stateT = 0;
  private target: Vector3 | null = null;
  private pace = 0;
  speed = 0;
  private travel = 0;
  private phase = 0;
  private ripple = 0;
  private lastHeading = 0;
  private turnRate = 0;
  private lastMark = new Vector3(Number.NaN, 0, 0);
  private sniffAt = 0;
  private stopUntil = 0;
  private nextStop = 0;
  private castPhase = 0;
  private hideUntil = 0;
  private retractT = 0;
  private emergeT = -1;
  private mealEnd = 0;
  private feedT = 0;
  private digT = 0;
  private digFor = 30;
  private buriedFor = 0;
  private searchDir = 0;
  private tentT = [0, 0];
  /** carried pose targets (eased into `pose`) */
  private readonly want = restPose();
  private readonly seed: number;

  constructor(size: number, rng: Rng, id = 'aramushiro') {
    this.size = size;
    this.scale = size / MODEL_SH;
    this.rng = rng;
    this.id = id;
    this.seed = rng.next() * 100;
    this.lastHeading = this.heading;
    this.searchDir = rng.range(0, TAU);
    // a resting snail: half the time already down in the sand
    this.fullness = rng.range(0, 0.6);
  }

  private emit(id: string): void { this.onEvent?.(id); }

  private set(state: AmState, sub = ''): void {
    if (this.state !== state) this.stateT = 0;
    this.state = state;
    this.sub = sub;
  }

  // ---------------------------------------------------------------- commands (from the driver / the brain)

  rest(seconds: number): void {
    if (this.busyHiding() || this.state === 'FEED') return;
    if (this.state === 'BURROW' && this.sub === 'buried') { this.timer = seconds; this.done = false; return; }
    this.set('IDLE');
    this.target = null;
    this.timer = seconds;
    this.done = false;
  }

  crawlTo(target: Vector3, seconds: number, pace = PACE.crawl): void {
    if (this.busyHiding() || this.state === 'FEED') return;
    if (this.state === 'BURROW' && this.sub !== 'emerge') { this.emerge(); return; }
    this.set('CRAWL');
    this.target = target.clone();
    this.pace = pace * this.size;
    this.timer = seconds;
    this.done = false;
    this.emit('crawl');
  }

  forage(seconds: number): void {
    if (this.busyHiding() || this.state === 'FEED') return;
    if (this.state === 'BURROW' && this.sub !== 'emerge') { this.emerge(); return; }
    this.set('FORAGE', 'sample');
    this.timer = seconds;
    this.stopUntil = this.clock + this.rng.range(1.5, 3);
    this.target = null;
    this.done = false;
    this.emit('siphon_search');
  }

  burrow(seconds: number, env: SnailEnv): void {
    if (this.busyHiding() || this.state === 'FEED') return;
    if (!env.canBurrow || !this.softGround(env)) { this.rest(Math.min(seconds, 20)); return; }
    if (this.state === 'BURROW') { this.timer = Math.max(this.timer, seconds); this.done = false; return; }
    this.set('BURROW', 'dig');
    this.target = null;
    this.digT = 0;
    this.digFor = this.rng.range(28, 55);
    this.timer = this.digFor + seconds;
    this.done = false;
    this.emit('bury');
  }

  /** a threat: into the shell (or, buried, the siphon down into the sand) */
  hide(seconds: number): void {
    if (this.state === 'BURROW' && (this.sub === 'buried' || this.sub === 'dig')) {
      this.hideUntil = this.clock + seconds;
      this.done = false;
      if (this.pose.retractTubes < 0.5) this.emit('withdraw');
      return;
    }
    if (this.food && this.state === 'FEED') this.leaveFood();
    if (this.state !== 'HIDE_IN_SHELL' || this.sub === 'emerge') {
      this.set('HIDE_IN_SHELL', 'withdraw');
      this.retractT = 0;
      this.emit('withdraw');
    }
    this.hideUntil = this.clock + seconds;
    this.target = null;
    this.done = false;
  }

  /** go to the food now (a snail that was already there when the player came: it is found feeding) */
  startFeeding(food: Food, angle: number): void {
    this.food = food;
    this.foodAngle = angle;
    this.set('FEED', 'eat');
    this.feedT = 3;
    this.mealEnd = this.clock + this.rng.range(MEAL.min, MEAL.max) * this.rng.range(0.2, 1);
    this.done = false;
    this.sink = 0;
    this.mound = 0;
  }

  private busyHiding(): boolean { return this.state === 'HIDE_IN_SHELL' && this.sub !== 'emerge'; }

  private softGround(env: SnailEnv): boolean {
    const s = env.floor.sampleAt?.(this.pos.x, this.pos.z);
    return !s || s.substrate === 'sand' || s.substrate === 'muddy_sand' || s.substrate === 'mud';
  }

  private emerge(): void {
    this.set('BURROW', 'emerge');
    this.digT = 0;
    this.pitAt.copy(this.pos);
    this.done = false;
  }

  private leaveFood(): void {
    if (this.food) {
      this.lastFood = this.food;
      this.lastFoodAt = this.clock;
    }
    this.food = null;
  }
  private lastFood: Food | null = null;
  private lastFoodAt = -1e9;

  // ---------------------------------------------------------------- the scent

  /** the strongest smell of carrion here: its reading and the bearing to its source */
  private sniff(env: SnailEnv): Food | null {
    this.smell = 0;
    if (!env.scent) return null;
    const c = env.current;
    const cs = c ? Math.hypot(c.x, c.y) : 0;
    let best: Food | null = null, bestC = 0;
    for (const f of env.scent.sourcesNear(this.pos.x, this.pos.z, SCENT.reach)) {
      if (f.meat <= 0.02) continue;
      // a full snail is not drawn back to the meal it left
      if (f === this.lastFood && this.clock - this.lastFoodAt < 600) continue;
      const dx = this.pos.x - f.x, dz = this.pos.z - f.z;
      const d = Math.hypot(dx, dz);
      let conc: number;
      if (cs > 0.003 && c) {
        // a plume down the current: long downstream, short upstream, widening as it goes
        const ux = c.x / cs, uz = c.y / cs;
        const along = dx * ux + dz * uz, across = Math.abs(-dx * uz + dz * ux);
        const sigma = 0.06 + 0.22 * Math.max(0, along);
        const reach = SCENT.reach * Math.min(1, 0.6 + cs * 8);
        conc = along >= 0 ? Math.exp(-along / reach) * Math.exp(-(across * across) / (2 * sigma * sigma)) * 1.6 : Math.exp(along / 0.18) * Math.exp(-(across * across) / 0.02);
      } else conc = Math.exp(-d / (SCENT.still * 0.45));
      conc *= 0.5 + 0.5 * f.meat;
      if (conc > bestC) { bestC = conc; best = f; }
    }
    if (best) {
      this.smell = bestC;
      this.smellDir = Math.atan2(best.x - this.pos.x, best.z - this.pos.z);
    }
    return bestC > SCENT.threshold * (0.6 + 0.8 * this.fullness) ? best : null;
  }

  // ---------------------------------------------------------------- stepping

  update(dt: number, env: SnailEnv): void {
    this.clock += dt;
    this.stateT += dt;
    this.timer -= dt;
    this.marks.length = 0;
    this.fullness = Math.max(0, this.fullness - dt / 7200);
    // the nose: a few times a second
    let food: Food | null = null;
    if (this.clock >= this.sniffAt) {
      this.sniffAt = this.clock + 0.5 + 0.3 * this.rng.next();
      food = this.sniff(env);
      if (food && this.state !== 'FEED' && this.state !== 'HIDE_IN_SHELL' && !(this.state === 'BURROW' && this.sub === 'dig') && this.food !== food) {
        // carrion in the water: out of the sand, and off toward it
        if (this.state === 'BURROW' && this.sub === 'buried') this.emerge();
        else if (this.state !== 'BURROW') {
          this.food = food;
          this.set('FORAGE', 'approach');
          this.timer = 1800;
          this.nextStop = this.clock + this.rng.range(5, 12);
          this.done = false;
          this.emit('siphon_search');
        }
      }
    }
    switch (this.state) {
      case 'IDLE': this.idle(dt); break;
      case 'CRAWL': this.crawl(dt, env); break;
      case 'FORAGE': this.forageStep(dt, env); break;
      case 'FEED': this.feed(dt, env); break;
      case 'BURROW': this.burrowStep(dt, env); break;
      case 'HIDE_IN_SHELL': this.hideStep(dt); break;
    }
    this.move(dt, env);
    this.body(dt, env);
    // the hole left behind fills in again
    if (this.pit > 0 && this.state !== 'BURROW') this.pit = Math.max(0, this.pit - dt / 240);
  }

  private idle(_dt: number): void {
    this.pace = 0;
    if (this.timer <= 0) this.done = true;
  }

  private crawl(_dt: number, _env: SnailEnv): void {
    if (!this.target) { this.pace = 0; this.done = this.timer <= 0; return; }
    const d = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
    if (d < this.size * 0.3 || this.timer <= 0) {
      this.target = null;
      this.pace = 0;
      this.set('IDLE');
      this.timer = 0;
      this.done = true;
      return;
    }
    this.travel = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
  }

  private forageStep(dt: number, env: SnailEnv): void {
    const f = this.food;
    if (f && this.sub !== 'sample') {
      // up the plume toward the carrion: casting a little from side to side, stopping now and then to sample
      if (f.meat <= 0.02) { this.leaveFood(); this.set('FORAGE', 'sample'); this.stopUntil = this.clock + 2; return; }
      const d = Math.hypot(f.x - this.pos.x, f.z - this.pos.z);
      const reach = f.r + this.size * 0.75;
      if (d < reach + this.size * 1.2 && env.scent) {
        // close: take a place at it
        const want = Math.atan2(this.pos.x - f.x, this.pos.z - f.z);
        const a = env.scent.claim(f, this.id, want);
        if (a === null) {
          // crowded: wait at the edge of the crowd, siphon up
          this.pace = 0;
          this.sub = 'wait';
          if (this.timer <= 0) { this.leaveFood(); this.done = true; this.set('IDLE'); }
          return;
        }
        this.foodAngle = a;
        const tx = f.x + Math.sin(a) * reach, tz = f.z + Math.cos(a) * reach;
        const dd = Math.hypot(tx - this.pos.x, tz - this.pos.z);
        if (dd < this.size * 0.12) {
          this.set('FEED', 'reach');
          this.feedT = 0;
          this.mealEnd = this.clock + this.rng.range(MEAL.min, MEAL.max) * (1 - 0.5 * this.fullness);
          this.pace = 0;
          this.emit('feed');
          return;
        }
        this.sub = 'arrive';
        this.travel = Math.atan2(tx - this.pos.x, tz - this.pos.z);
        this.pace = PACE.food * this.size * Math.min(1, 0.4 + dd / (this.size * 1.5));
        return;
      }
      this.sub = 'approach';
      if (this.clock < this.stopUntil) { this.pace = 0; return; }
      if (this.clock > this.nextStop) {
        this.stopUntil = this.clock + this.rng.range(1.5, 3.5);
        this.nextStop = this.stopUntil + this.rng.range(6, 14);
        return;
      }
      this.castPhase += dt * TAU / 8;
      this.travel = Math.atan2(f.x - this.pos.x, f.z - this.pos.z) + 0.3 * Math.sin(this.castPhase);
      this.pace = PACE.food * this.size;
      if (this.timer <= 0) { this.leaveFood(); this.done = true; this.set('IDLE'); }
      return;
    }
    // searching: short runs, stops to sample with the siphon sweeping
    if (this.clock < this.stopUntil) {
      this.pace = 0;
      this.sub = 'sample';
    } else {
      this.sub = 'search';
      if (this.clock > this.nextStop) {
        this.stopUntil = this.clock + this.rng.range(2, 4);
        this.nextStop = this.stopUntil + this.rng.range(4, 10);
        this.searchDir += this.rng.range(-1.2, 1.2);
      }
      this.travel = this.searchDir;
      this.pace = PACE.crawl * this.size;
    }
    if (this.timer <= 0) { this.pace = 0; this.set('IDLE'); this.done = true; }
  }

  private feed(dt: number, env: SnailEnv): void {
    const f = this.food;
    this.pace = 0;
    if (!f) { this.set('IDLE'); this.done = true; return; }
    this.feedT += dt;
    // face the food
    this.travel = Math.atan2(f.x - this.pos.x, f.z - this.pos.z);
    if (this.sub === 'reach' && this.feedT > 3) this.sub = 'eat';
    if (this.sub === 'eat') {
      env.scent?.eat(f, BITE * dt);
      this.fullness = Math.min(1, this.fullness + dt / ((MEAL.min + MEAL.max) * 0.5));
      if (this.clock > this.mealEnd || f.meat <= 0.01) { this.sub = 'done'; this.feedT = 0; }
    }
    if (this.sub === 'done' && this.feedT > 3) {
      env.scent?.release(f, this.id);
      this.leaveFood();
      // full: off a little way, and (on soft ground) into the sand to digest
      const a = this.foodAngle + this.rng.range(-0.6, 0.6);
      const go = this.size * this.rng.range(4, 10);
      this.set('CRAWL', 'leave');
      this.target = new Vector3(this.pos.x + Math.sin(a) * go, 0, this.pos.z + Math.cos(a) * go);
      this.pace = PACE.crawl * this.size;
      this.timer = 120;
      this.done = false;
    }
  }

  private burrowStep(dt: number, env: SnailEnv): void {
    this.pace = 0;
    // (just under the surface: the shell's top a millimetre or two down)
    const depth = BURY * this.size;
    if (this.sub === 'dig') {
      this.digT += dt;
      // ploughing in, a burst of rocking at a time
      const k = clamp01(this.digT / this.digFor);
      const burst = 0.5 + 0.5 * Math.sin(this.digT * 1.3);
      this.sink = Math.min(depth, Math.max(this.sink, depth * Math.pow(k, 0.8) * (0.85 + 0.15 * burst)));
      this.mound = Math.min(1, Math.max(this.mound, k * 1.1));
      // a little forward as it goes down
      this.travel = this.heading;
      this.pace = this.size * 0.012 * (1 - k);
      if (k >= 1) { this.sub = 'buried'; this.buriedFor = 0; this.emit('bury'); }
    } else if (this.sub === 'buried') {
      this.buriedFor += dt;
      this.sink = depth;
      this.mound = Math.max(0.55, this.mound - dt / 300);
      if (this.timer <= 0 && this.buriedFor > 10) this.done = true;
    } else if (this.sub === 'emerge') {
      this.digT += dt;
      const k = clamp01(this.digT / 9);
      this.sink = depth * (1 - smooth(0, 1, k));
      this.mound = Math.max(0, this.mound - dt / 6);
      this.pit = Math.max(this.pit, smooth(0.3, 1, k));
      this.travel = this.heading;
      this.pace = this.size * 0.02 * k;
      if (k >= 1) {
        this.sink = 0;
        this.mound = 0;
        this.set('IDLE');
        this.timer = 1;
        this.done = this.food === null;
        this.emit('emerge');
      }
    }
    void env;
  }

  private hideStep(dt: number): void {
    this.pace = 0;
    if (this.sub === 'withdraw') {
      this.retractT += dt;
      if (this.retractT > 1.6) this.sub = 'hidden';
    } else if (this.sub === 'hidden') {
      if (this.clock > this.hideUntil) { this.sub = 'emerge'; this.emergeT = 0; }
    } else if (this.sub === 'emerge') {
      this.emergeT += dt;
      if (this.emergeT > 3.6) { this.set('IDLE'); this.timer = 2; this.done = true; this.emit('emerge'); }
    }
  }

  /** the glide: speed eased toward the pace, heading turned toward the travel, steps kept in the water and the walls */
  private move(dt: number, env: SnailEnv): void {
    const s = this.size;
    // the gait's rhythm: reach and haul (one cycle per ~0.09 shell heights of travel), pulsing the speed
    const want = this.pace;
    this.speed = ease(this.speed, want, dt, 0.8);
    const f = this.speed > 1e-6 ? Math.max(0.3, Math.min(1.2, this.speed / (0.09 * s))) : 0;
    this.phase += f * dt;
    const ph = this.phase % 1;
    const haul = Math.pow(Math.sin(Math.PI * clamp01((ph - 0.4) / 0.6)), 2);
    const pulse = (0.6 + 0.8 * haul) / 0.84;
    // turning: slowly, faster on the spot
    const turnMax = (0.25 + 0.5 * Math.min(1, this.speed / (0.05 * s))) * dt;
    if (this.speed > 1e-6 || this.state === 'FEED' || this.sub === 'arrive') {
      const d = wrap(this.travel - this.heading);
      this.heading = wrap(this.heading + Math.max(-turnMax, Math.min(turnMax, d)));
    }
    this.turnRate = ease(this.turnRate, wrap(this.heading - this.lastHeading) / Math.max(dt, 1e-4), dt, 0.5);
    this.lastHeading = this.heading;
    const align = Math.max(0, Math.cos(wrap(this.travel - this.heading)));
    const step = this.speed * pulse * dt * (0.25 + 0.75 * align);
    if (step > 0) {
      const nx = this.pos.x + Math.sin(this.heading) * step, nz = this.pos.z + Math.cos(this.heading) * step;
      if (this.canStep(nx, nz, env)) { this.pos.x = nx; this.pos.z = nz; }
      else {
        // the water's edge or a wall: turn away along it
        this.speed = 0;
        this.travel = this.heading + (this.rng.next() < 0.5 ? 1.2 : -1.2);
        if (this.target) this.target = null;
        this.searchDir = this.travel;
      }
    }
    // the trail: a furrow in soft sand behind the foot
    if (this.speed > 1e-6 && this.sink < 0.3 * s) {
      if (Number.isNaN(this.lastMark.x)) this.lastMark.copy(this.pos);
      const dm = Math.hypot(this.pos.x - this.lastMark.x, this.pos.z - this.lastMark.z);
      if (dm > 0.22 * s) {
        this.marks.push({ x: (this.pos.x + this.lastMark.x) / 2, z: (this.pos.z + this.lastMark.z) / 2, heading: Math.atan2(this.pos.x - this.lastMark.x, this.pos.z - this.lastMark.z), len: dm, t: env.t });
        this.lastMark.copy(this.pos);
      }
    } else if (this.speed < 1e-6) this.lastMark.set(Number.NaN, 0, 0);
  }

  private canStep(x: number, z: number, env: SnailEnv): boolean {
    const b = env.bounds;
    if (b && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) return false;
    const need = env.minDepth ?? 0;
    if (need > 0) {
      const f = env.floor;
      const here = f.waterAt(this.pos.x, this.pos.z) - f.heightAt(this.pos.x, this.pos.z);
      // (an animal already out of its depth may still crawl back in)
      if (here >= need && f.waterAt(x, z) - f.heightAt(x, z) < need) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- the body

  /** work out the pose's targets for the state and ease the pose toward them */
  private body(dt: number, env: SnailEnv): void {
    const w = this.want, p = this.pose, t = this.clock, sd = this.seed;
    const SHm = MODEL_SH;
    const moving = clamp01(this.speed / (0.04 * this.size));
    const ph = this.phase % 1;
    const reach = Math.pow(Math.sin(Math.PI * clamp01(ph / 0.55)), 2) * moving;
    const haul = Math.pow(Math.sin(Math.PI * clamp01((ph - 0.4) / 0.6)), 2) * moving;
    // ---- defaults: out on the foot
    w.retractTubes = 0; w.retractHead = 0; w.retractFoot = 0; w.shut = 0; w.shellFall = 0;
    w.reach = reach; w.haul = haul; w.crawl = moving;
    // the foot spread wide to glide, drawn in a little standing still
    w.dig = 0; w.lift = 0.05 * SHm; w.width = 0.86 + 0.14 * moving;
    w.shellSurge = 0.022 * SHm * (haul - 0.3 * moving);
    w.shellLift = 0.012 * SHm * haul;
    w.shellYaw = 0.05 * moving * Math.sin(Math.PI * this.phase) + 0.015 * Math.sin(t * 0.21 + sd);
    w.shellRoll = 0.035 * moving * Math.sin(Math.PI * this.phase + 1.1);
    w.shellPitch = 0.02 * Math.sin(t * 0.17 + sd);
    w.headExt = (0.02 + 0.03 * reach) * SHm; w.headYaw = 0.12 * Math.sin(t * 0.3 + sd) * (1 - 0.5 * moving); w.headPitch = 0;
    // tentacles: spread forward, waving a little each on its own
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      this.tentT[i] += dt * (0.6 + 0.3 * Math.sin(t * 0.13 + i * 2 + sd));
      w.tentExt[i] = 1;
      w.tentYaw[i] = REST.tentacle[i].yaw + side * 0.12 * Math.sin(this.tentT[i] * 1.3 + i);
      w.tentPitch[i] = REST.tentacle[i].pitch + 0.1 * Math.sin(this.tentT[i] * 0.9 + 2 * i);
      w.tentBend[i] = 0.3 + 0.15 * Math.sin(this.tentT[i] * 0.7);
      w.tentPlane[i] = side > 0 ? 0.3 : Math.PI - 0.3;
      w.tentWob[i] = 0.18;
    }
    // the siphon: forward and up, swinging; it tastes the water all the time
    w.siphonExt = 1;
    w.siphonPitch = REST.siphonPitch + 0.1 * Math.sin(t * 0.37 + sd);
    w.siphonYaw = REST.siphonYaw + (0.25 + 0.15 * moving) * Math.sin(t * TAU * 0.13 + sd);
    // (curving up toward its mouth)
    w.siphonBend = 0.35; w.siphonPlane = Math.PI / 2; w.siphonWob = 0.1;
    w.probExt = 0; w.probYaw = 0; w.probPitch = -0.4; w.probBend = 0; w.probPlane = 0;
    w.turn = this.speed > 1e-6 ? Math.max(-40, Math.min(40, (this.turnRate / Math.max(this.speed, 1e-5)) * this.scale)) : 0;
    let tauTubes = 0.4, tauFoot = 0.6, tauShell = 0.5;
    switch (this.state) {
      case 'IDLE':
        // now and then the siphon goes up high and turns round; a tentacle flicks
        w.siphonPitch += 0.25 * smooth(0.6, 0.9, Math.sin(t * 0.11 + sd * 3));
        w.siphonYaw = REST.siphonYaw + 0.45 * Math.sin(t * TAU * 0.06 + sd);
        break;
      case 'FORAGE': {
        // sweeping wide while it samples; pointing up the scent while it follows it
        const sampling = this.sub === 'sample' || this.speed < 0.2 * PACE.food * this.size;
        const toward = this.smell > 0 ? wrap(this.smellDir - this.heading) : 0;
        w.siphonYaw = sampling ? 0.75 * Math.sin(t * TAU * 0.35 + sd) : Math.max(-0.6, Math.min(0.6, toward)) + 0.2 * Math.sin(t * TAU * 0.4 + sd);
        w.siphonPitch = REST.siphonPitch + (sampling ? 0.25 : 0.05) + 0.1 * Math.sin(t * 1.7);
        w.siphonWob = 0.2;
        w.headYaw = 0.25 * Math.sin(t * 0.8 + sd);
        for (let i = 0; i < 2; i++) w.tentWob[i] = 0.3;
        break;
      }
      case 'FEED': {
        const f = this.food;
        // the head down to the food, the proboscis in it, pumping
        w.headPitch = -0.2; w.headExt = 0.06 * SHm; w.width = 0.8;
        w.siphonPitch = REST.siphonPitch + 0.35; w.siphonYaw = REST.siphonYaw + 0.15 * Math.sin(t * 0.4 + sd);
        for (let i = 0; i < 2; i++) { w.tentYaw[i] = REST.tentacle[i].yaw * 1.25; w.tentPitch[i] = -0.05; w.tentBend[i] = 0.5; }
        w.shellYaw = 0.03 * Math.sin(t * 0.5 + sd);
        if (f) {
          // the food in the animal's frame (model units)
          const dx = f.x - this.pos.x, dz = f.z - this.pos.z;
          const c = Math.cos(this.heading), s = Math.sin(this.heading);
          const lx = (dx * c - dz * s) / this.scale, lz = (dx * s + dz * c) / this.scale;
          const ly = 0.006 * this.size / this.scale;
          const mx = lx - REST.mouth.x, mz = lz - REST.mouth.z, my = ly - REST.mouth.y;
          const dist = Math.hypot(mx, my, mz);
          w.probYaw = Math.atan2(mx, mz);
          w.probPitch = Math.atan2(my, Math.hypot(mx, mz));
          const L0 = HEAD.proboscis * SHm;
          const out = this.sub === 'reach' ? smooth(0, 3, this.feedT) : this.sub === 'done' ? 1 - smooth(0, 3, this.feedT) : 1;
          w.probExt = Math.min(1, (dist + 0.25 * SHm) / L0) * out;
          w.probBend = 0.25 + 0.15 * Math.sin(t * 1.9);
          w.probPlane = -Math.PI / 2;
        }
        tauTubes = 0.8;
        break;
      }
      case 'BURROW': {
        const k = this.sink / (BURY * this.size);
        const digging = this.sub === 'dig' || this.sub === 'emerge';
        const rock = digging ? Math.sin(this.digT * 5.2) * (0.5 + 0.5 * Math.sin(this.digT * 1.3)) : 0;
        w.dig = this.sub === 'buried' ? 1 : digging ? 0.6 + 0.4 * Math.max(0, Math.sin(this.digT * 1.3)) : 0;
        w.shellRoll = 0.2 * rock;
        w.shellYaw = 0.06 * rock;
        w.shellPitch = 0.1 * k;
        w.reach = digging ? Math.max(0, Math.sin(this.digT * 2.6)) : 0;
        w.haul = digging ? Math.max(0, -Math.sin(this.digT * 2.6)) : 0;
        w.crawl = digging ? 1 : 0;
        // the siphon straight up through the sand, the tentacles drawn in against the sand
        w.siphonPitch = REST.siphonPitch + (1.45 - REST.siphonPitch) * smooth(0.1, 0.6, k);
        w.siphonYaw = REST.siphonYaw + 0.2 * Math.sin(t * TAU * 0.05 + sd);
        w.siphonBend = 0.1;
        // stretched up through the sand: only its mouth shows above it
        w.siphonExt = Math.max(1, Math.min(1.7, this.siphonReach)) * smooth(0.0, 0.5, k) + (1 - smooth(0.0, 0.5, k));
        for (let i = 0; i < 2; i++) { w.tentExt[i] = 1 - 0.6 * smooth(0, 0.5, k); w.tentPitch[i] = -0.1; }
        w.retractHead = 0.6 * smooth(0.3, 0.9, k);
        if (this.clock < this.hideUntil) { w.retractTubes = 1; w.siphonExt = 0.15; }
        break;
      }
      case 'HIDE_IN_SHELL': {
        const r = this.retractT;
        if (this.sub === 'emerge') {
          const e = this.emergeT;
          w.shut = 1 - ramp(e, 0, 0.5);
          w.retractFoot = 1 - ramp(e, 0.3, 2.0);
          w.shellFall = 1 - ramp(e, 1.0, 2.4);
          w.retractHead = 1 - ramp(e, 1.6, 2.8);
          w.retractTubes = 1 - ramp(e, 2.2, 3.5);
          tauTubes = tauFoot = tauShell = 0.08;
        } else {
          // tubes in at once, the head after, the foot folding in, the shell falling, the operculum last
          w.retractTubes = ramp(r, 0, 0.25);
          w.retractHead = ramp(r, 0.15, 0.6);
          w.retractFoot = ramp(r, 0.35, 1.25);
          w.shellFall = ramp(r, 0.55, 1.3);
          w.shut = ramp(r, 1.0, 1.5);
          tauTubes = tauFoot = tauShell = 0.04;
        }
        w.siphonExt = 1 - w.retractTubes * 0.85;
        w.tentExt = [1 - w.retractTubes * 0.85, 1 - w.retractTubes * 0.85];
        w.crawl = 0; w.reach = 0; w.haul = 0;
        break;
      }
      default: break;
    }
    // ---- ease
    const k = (tau: number) => Math.min(1, dt / tau);
    const kt = k(tauTubes), kf = k(tauFoot), ks = k(tauShell);
    p.retractTubes += (w.retractTubes - p.retractTubes) * Math.min(1, dt / (this.state === 'HIDE_IN_SHELL' ? 0.04 : 0.6));
    p.retractHead += (w.retractHead - p.retractHead) * Math.min(1, dt / (this.state === 'HIDE_IN_SHELL' ? 0.04 : 0.8));
    p.retractFoot += (w.retractFoot - p.retractFoot) * Math.min(1, dt / (this.state === 'HIDE_IN_SHELL' ? 0.04 : 0.8));
    p.shut += (w.shut - p.shut) * Math.min(1, dt / 0.06);
    p.shellFall += (w.shellFall - p.shellFall) * ks;
    p.reach = w.reach; p.haul = w.haul; p.ripple = (this.ripple += dt * (0.4 + 1.6 * moving)); p.crawl += (w.crawl - p.crawl) * kf;
    p.turn += (w.turn - p.turn) * kf; p.dig += (w.dig - p.dig) * k(1.2); p.lift = w.lift; p.width += (w.width - p.width) * k(1.5);
    p.shellSurge += (w.shellSurge - p.shellSurge) * k(0.15); p.shellLift += (w.shellLift - p.shellLift) * k(0.15);
    p.shellYaw += (w.shellYaw - p.shellYaw) * ks; p.shellRoll += (w.shellRoll - p.shellRoll) * ks; p.shellPitch += (w.shellPitch - p.shellPitch) * ks;
    p.headExt += (w.headExt - p.headExt) * k(0.5); p.headYaw += (w.headYaw - p.headYaw) * k(0.6); p.headPitch += (w.headPitch - p.headPitch) * k(0.6);
    for (let i = 0; i < 2; i++) {
      p.tentExt[i] += (w.tentExt[i] - p.tentExt[i]) * kt;
      p.tentYaw[i] += (w.tentYaw[i] - p.tentYaw[i]) * k(0.5);
      p.tentPitch[i] += (w.tentPitch[i] - p.tentPitch[i]) * k(0.5);
      p.tentBend[i] += (w.tentBend[i] - p.tentBend[i]) * k(0.5);
      p.tentPlane[i] = w.tentPlane[i];
      p.tentWob[i] += (w.tentWob[i] - p.tentWob[i]) * k(1);
    }
    p.siphonExt += (w.siphonExt - p.siphonExt) * kt;
    p.siphonYaw += (w.siphonYaw - p.siphonYaw) * k(0.7);
    p.siphonPitch += (w.siphonPitch - p.siphonPitch) * k(0.7);
    p.siphonBend += (w.siphonBend - p.siphonBend) * k(0.7);
    p.siphonPlane = w.siphonPlane;
    p.siphonWob += (w.siphonWob - p.siphonWob) * k(1);
    p.probExt += (w.probExt - p.probExt) * k(0.4);
    p.probYaw += (w.probYaw - p.probYaw) * k(0.4);
    p.probPitch += (w.probPitch - p.probPitch) * k(0.4);
    p.probBend += (w.probBend - p.probBend) * k(0.4);
    p.probPlane = w.probPlane;
    // the body goes nose-down into the sand as it digs
    this.dig += ((this.state === 'BURROW' ? 0.22 * smooth(0, 0.4, this.sink / (BURY * this.size)) : 0) - this.dig) * k(1.5);
    void env;
  }
}
