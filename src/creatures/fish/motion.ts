import { Vector3 } from 'three';
import { restPose, type SwimPose } from './rig';
import { profilesOf, type FishSpec } from './spec';

/**
 * 共通 Behavior: one fish's kinematics (heading, speed, height, pitch, roll) and the states every species has
 *
 *   IDLE     hovering, sculling with the pectorals, a slow drift of the heading (benthic species: lying on the bed)
 *   SWIM     cruising to a goal at the species' cruising speed and height in the water column
 *   TURN     turning on the spot toward a new heading, the body bent into a C
 *   FORAGE   the species' own way of feeding (spec.behavior.forage):
 *              hunt   (スズキ)      patrols, stalks a small fish slowly, then strikes with the gape wide (suction)
 *              pick   (メジナ)      nose down at the rock / bed, biting algae and small animals off it
 *              dig    (シロギス)    glides just above the sand, stops, tips head-down and plunges the snout in, sand
 *                                   puffing out of the gill slits
 *              ambush (マゴチ, ヒラメ) lies still (buried to the eyes) and lunges up at prey passing in front
 *              graze  (ボラ)       tips head-down to the bed, scraping the film with a twist of the body, silt puffing
 *              filter (サッパ, コノシロ) the school slows, gapes open and shut as it swims through the plankton
 *              peck   (イシモチ)    cruising slowly just off the bottom, dipping to pick at it
 *   ESCAPE   a C-start away from the threat, a burst and a coast (a flatfish: a burst along the bed, then settling
 *            and burying again)
 * and what some species add (spec.behavior.extras): REST on the bed, BURY in the sand, STRIKE, LEAP (the mullet's
 * jump), and a school's synchronised turn (FLASH, in School).
 *
 * Schooling species (School) take their heading and speed from their neighbours; the school decides the state.
 */

export type FishState = 'IDLE' | 'SWIM' | 'TURN' | 'FORAGE' | 'ESCAPE' | 'REST' | 'BURY' | 'STRIKE' | 'LEAP' | 'ALERT';

export interface FishFloor {
  heightAt(x: number, z: number): number;
  waterAt(x: number, z: number): number;
}

export interface FishEnv {
  floor: FishFloor;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** least water the fish may be in (m) */
  minDepth: number;
  /** false: no sediment to dig into (a tank, the case) */
  canBurrow: boolean;
}

export type DustKind = 'kick' | 'gill' | 'stream';

const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const damp = (cur: number, want: number, rate: number, dt: number) => want + (cur - want) * Math.exp(-rate * dt);

/** every fish agent alive, by the scene it is in (a predator looks for prey among them) */
const AGENTS = new Map<string, Set<FishAgent>>();

export class FishAgent {
  readonly pos = new Vector3();
  heading = 0;
  speed = 0;
  vy = 0;
  pitch = 0;
  roll = 0;
  yawRate = 0;
  time = 0;
  state: FishState = 'IDLE';
  stateT = 0;
  stateDur = 8;
  /** the goal of a SWIM, and the heading a TURN or a REST wants */
  readonly goal = new Vector3();
  hasGoal = false;
  wantHeading = 0;
  /** buried in the sand 0..1 (of the body's thickness) */
  buried = 0;
  /** the player's unease (the creature system's alert) */
  alarm = 0;
  /** 0 near … 2 far: detail of what is worth doing (the dust, the fin ripple) */
  detail: 0 | 1 | 2 = 0;
  readonly pose: SwimPose = restPose();
  school: import('./school').School | null = null;
  /** total length (m) */
  readonly tl: number;
  /** body depth and the belly / blind side under the axis, the back over it (m) */
  readonly half: { below: number; above: number };
  onEvent: ((id: string) => void) | null = null;
  onDust: ((kind: DustKind, at: Vector3, vel: Vector3, amount: number) => void) | null = null;
  scene = '';
  // feeding and escape sub-states
  private sub = 0;
  private subT = 0;
  private readonly aim = new Vector3();
  private prey: FishAgent | null = null;
  private escDir = 0;
  private wanderH = 0;
  private breath = 0;
  private effort = 0;
  private eyeT = 0;
  private eyeYawT = 0;
  private eyePitchT = 0;
  private tailPh = 0;
  private finPh = 0;
  private lastEvent = '';
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private seed: number;

  constructor(readonly spec: FishSpec, tl: number, private readonly rnd: () => number) {
    this.tl = tl;
    const P = profilesOf(spec);
    let below = 0, above = 0;
    for (let s = 0.05; s < spec.caudalBase; s += 0.02) {
      below = Math.max(below, spec.flat ? P.widthR(s) : P.bot(s));
      above = Math.max(above, spec.flat ? P.width(s) : P.top(s));
    }
    this.half = { below: below * tl, above: above * tl };
    this.seed = rnd() * 1000;
    this.wanderH = rnd() * TAU;
  }

  join(scene: string): void {
    this.leaveScene();
    this.scene = scene;
    let s = AGENTS.get(scene);
    if (!s) { s = new Set(); AGENTS.set(scene, s); }
    s.add(this);
  }

  leaveScene(): void {
    const s = AGENTS.get(this.scene);
    if (s) { s.delete(this); if (!s.size) AGENTS.delete(this.scene); }
    this.scene = '';
  }

  get benthic(): boolean {
    const h = this.spec.behavior.habit;
    return h === 'ambusher' || h === 'flatfish';
  }

  /** the water column here: bed, surface, and the band the fish's axis may be in */
  layer(env: FishEnv, x = this.pos.x, z = this.pos.z): { bottom: number; surface: number; lo: number; hi: number } {
    const bottom = env.floor.heightAt(x, z), surface = env.floor.waterAt(x, z);
    const lo = bottom + this.half.below * (1 - 0.92 * this.buried), hi = surface - this.half.above * 1.1 - 0.002;
    return { bottom, surface, lo, hi };
  }

  private emit(id: string): void {
    if (id === this.lastEvent) return;
    this.lastEvent = id;
    this.onEvent?.(id);
  }

  setState(st: FishState, dur: number): void {
    if (st !== this.state) { this.sub = 0; this.subT = 0; }
    this.state = st;
    this.stateT = 0;
    this.stateDur = dur;
    this.emit(st.toLowerCase());
  }

  /** a goal to swim to (m) */
  swimTo(x: number, z: number, dur: number): void {
    this.goal.set(x, 0, z);
    this.hasGoal = true;
    this.setState('SWIM', dur);
  }

  /** frightened from `from` (a predator, the player, the net) */
  startle(from: Vector3): void {
    if (this.state === 'ESCAPE' && this.stateT < 0.6) return;
    if (this.school) { this.school.startle(from, this); return; }
    this.escapeFrom(from);
  }

  escapeFrom(from: Vector3): void {
    const away = Math.atan2(this.pos.x - from.x, this.pos.z - from.z);
    this.escDir = away + (this.rnd() - 0.5) * 0.9;
    this.setState('ESCAPE', 0.9 + this.rnd() * 0.6);
    this.buried = Math.min(this.buried, 0.3);
    if (this.buried > 0 || this.benthic) this.dust('kick', 1.4);
  }

  /** prey for a predator: a fish of under 40 % of its length, near and not buried */
  private findPrey(range: number): FishAgent | null {
    const set = AGENTS.get(this.scene);
    if (!set) return null;
    let best: FishAgent | null = null, bd = range;
    for (const a of set) {
      if (a === this || a.tl > 0.4 * this.tl || a.buried > 0.5) continue;
      const d = a.pos.distanceTo(this.pos);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  private dust(kind: DustKind, amount: number, at?: Vector3): void {
    if (!this.onDust || this.detail > 1) return;
    const p = at ?? this.tmp.set(this.pos.x, this.pos.y - this.half.below, this.pos.z);
    const v = this.tmp2.set(Math.sin(this.heading) * -0.05, 0.04, Math.cos(this.heading) * -0.05);
    this.onDust(kind, p, v, amount);
  }

  /** a point along the body (s) in the world, at the axis */
  pointAt(s: number, out: Vector3): Vector3 {
    const d = (this.spec.pivot - s) * this.tl;
    return out.set(this.pos.x + Math.sin(this.heading) * Math.cos(this.pitch) * d, this.pos.y - Math.sin(this.pitch) * d, this.pos.z + Math.cos(this.heading) * Math.cos(this.pitch) * d);
  }

  update(dt: number, env: FishEnv): void {
    if (dt <= 0) return;
    this.time += dt;
    this.stateT += dt;
    const B = this.spec.behavior, tl = this.tl;
    const L = this.layer(env);
    const D = Math.max(0, L.surface - L.bottom);
    // what each state wants
    let wantSpeed = 0, wantY = L.bottom + Math.max(B.minLift * tl, B.level * D) + this.half.below;
    let wantH = this.heading, turnK = 3, maxYaw = 3.5;
    let wantPitch = 0, headBend = 0, jaw = 0.05, pec = 0.35, pecBeat = 0, extraAmp = 0, ripple = 0, wantRoll = 0;
    let curvKick = 0;
    const school = this.school;
    if (school) school.steer(this, env);
    const st = this.state;
    switch (st) {
      case 'IDLE': {
        if (this.benthic) { this.setState('REST', this.stateDur - this.stateT); break; }
        // hovering into the current, a slow drift of the heading, pectorals sculling
        this.wanderH += (this.rnd() - 0.5) * 0.6 * dt;
        wantH = school ? school.wantHeading(this) : this.heading + wrap(this.wanderH - this.heading) * 0.2;
        wantSpeed = (school ? school.wantSpeed(this) : 0.12 * tl);
        pec = 0.55; pecBeat = Math.sin(this.time * 5.2 + this.seed) * 0.5;
        if (this.stateT > this.stateDur && !school) this.wanderGoal(env);
        break;
      }
      case 'REST': {
        // on the bed: still, breathing, the pectorals propping (a flathead), a flatfish flat on its blind side
        wantSpeed = 0;
        wantY = L.lo;
        pec = this.spec.flat ? 0.1 : 0.7;
        wantH = this.wantHeading;
        turnK = 0.6;
        if (this.stateT > this.stateDur) this.afterRest(env);
        break;
      }
      case 'SWIM': {
        if (school) { wantH = school.wantHeading(this); wantSpeed = school.wantSpeed(this); wantY = school.wantY(this, L, wantY); break; }
        const dx = this.goal.x - this.pos.x, dz = this.goal.z - this.pos.z, d = Math.hypot(dx, dz);
        wantH = Math.atan2(dx, dz);
        wantSpeed = B.cruise * tl * clamp(d / (1.5 * tl), 0.3, 1);
        if (this.benthic) { wantY = L.lo + 0.15 * tl; ripple = 1; }
        if (d < 0.6 * tl || this.stateT > this.stateDur) {
          this.hasGoal = false;
          if (this.benthic) { this.wantHeading = this.heading; this.setState('REST', 6 + this.rnd() * 10); } else this.setState('IDLE', 3 + this.rnd() * 6);
        }
        break;
      }
      case 'TURN': {
        wantH = this.wantHeading;
        wantSpeed = 0.15 * tl;
        turnK = 6; maxYaw = 4;
        if (Math.abs(wrap(wantH - this.heading)) < 0.15) this.setState(this.hasGoal ? 'SWIM' : 'IDLE', this.hasGoal ? 10 : 4);
        break;
      }
      case 'ALERT': {
        // a benthic fish freezes; a swimmer holds still, fins spread, ready
        wantSpeed = this.benthic ? 0 : 0.05 * tl;
        wantY = this.benthic ? L.lo : wantY;
        pec = 0.9; jaw = 0;
        if (school) { wantH = school.wantHeading(this); wantSpeed = school.wantSpeed(this); }
        if (this.stateT > this.stateDur) this.setState(this.benthic ? 'REST' : 'IDLE', 4);
        break;
      }
      case 'ESCAPE': {
        const t = this.stateT;
        wantH = this.escDir;
        turnK = 30; maxYaw = 22;
        // the C-start: the body snaps into a C toward the new heading in the first ~60 ms, then the burst
        if (t < 0.08) curvKick = Math.sign(wrap(this.escDir - this.heading)) * 6 * Math.sin((t / 0.08) * Math.PI);
        wantSpeed = (t < 0.5 ? B.burst : B.burst * Math.max(0.25, 1 - (t - 0.5) * 1.6)) * tl;
        extraAmp = t < 0.5 ? 0.08 : 0.02;
        if (this.benthic) { wantY = L.lo + 0.3 * tl * Math.max(0, 1 - t); ripple = 1; }
        if (t > this.stateDur) {
          if (this.benthic || (B.extras.includes('bury') && env.canBurrow && this.rnd() < 0.5)) { this.wantHeading = this.heading; this.setState(B.extras.includes('bury') && env.canBurrow ? 'BURY' : 'REST', 1.4); }
          else this.setState(school ? 'SWIM' : 'IDLE', 4);
        }
        break;
      }
      case 'BURY': {
        // shuffling into the sand: the body beats fast on the spot, sand thrown over the back (on sand only)
        if (!env.canBurrow) { this.setState('REST', 10); break; }
        wantSpeed = 0;
        wantY = L.lo;
        wantH = this.wantHeading;
        extraAmp = 0.06;
        ripple = 1;
        this.buried = Math.min(this.spec.flat ? 0.85 : 0.6, this.buried + dt * 0.7);
        if ((this.stateT % 0.35) < dt) this.dust('kick', 0.7);
        if (this.stateT > this.stateDur) { this.emit('buried'); this.setState('REST', 20 + this.rnd() * 40); }
        break;
      }
      case 'STRIKE': {
        // the lunge: a burst along the aim, the gape opening wide in the first 60 ms (suction), then closing
        const t = this.stateT;
        const dx = this.aim.x - this.pos.x, dz = this.aim.z - this.pos.z;
        wantH = Math.atan2(dx, dz);
        turnK = 12; maxYaw = 10;
        wantSpeed = (t < 0.18 ? B.burst : 0.2 * B.cruise) * tl;
        wantY = this.benthic ? Math.max(L.lo, this.aim.y) : this.aim.y;
        jaw = t < 0.06 ? t / 0.06 : t < 0.2 ? 1 : Math.max(0, 1 - (t - 0.2) * 5);
        extraAmp = t < 0.18 ? 0.07 : 0;
        if (t > 0.1 && this.prey) { this.prey.startle(this.pos); this.prey = null; }
        if (t > 0.65) {
          if (this.benthic) { this.wantHeading = this.heading; this.setState(this.buried > 0 || this.spec.flat ? 'BURY' : 'REST', 1.2); }
          else this.setState('FORAGE', Math.max(2, this.stateDur));
        }
        break;
      }
      case 'LEAP': {
        // the mullet's jump: up and out at a slant, a ballistic arc, back in head first
        const t = this.stateT;
        if (this.sub === 0) { this.vy = 2.6 + this.rnd() * 0.8; this.speed = 1.6; this.sub = 1; this.emit('leap'); }
        wantSpeed = this.speed;
        wantH = this.heading;
        extraAmp = t < 0.25 ? 0.12 : 0.02;
        if (t > 0.12 && this.pos.y < L.surface - this.half.above * 2 && this.vy < 0) this.setState(school ? 'SWIM' : 'IDLE', 4);
        break;
      }
      case 'FORAGE': {
        const r = this.forage(dt, env, L, D);
        wantSpeed = r.speed; wantH = r.heading; wantY = r.y; wantPitch = r.pitch; headBend = r.headBend; jaw = r.jaw; pec = r.pec;
        pecBeat = r.pecBeat; wantRoll = r.roll; ripple = this.benthic ? 0.3 : 0;
        if (this.stateT > this.stateDur && this.state === 'FORAGE') {
          if (school) this.setState('SWIM', 6);
          else if (this.benthic) { this.wantHeading = this.heading; this.setState('REST', 8); } else this.setState('IDLE', 3 + this.rnd() * 4);
        }
        break;
      }
    }
    // a big turn from slow swimming is done on the spot (TURN), not as a wide arc
    const err = wrap(wantH - this.heading);
    if ((st === 'SWIM' || st === 'IDLE') && !school && Math.abs(err) > 1.5 && this.speed < 0.8 * B.cruise * tl && !this.benthic) {
      this.wantHeading = wantH;
      this.setState('TURN', 3);
    }
    // keep off the shallows and inside the tank: steer to the deeper side
    const ahead = 1.2 * tl + 0.1;
    const ax = this.pos.x + Math.sin(this.heading) * ahead, az = this.pos.z + Math.cos(this.heading) * ahead;
    const dAhead = env.floor.waterAt(ax, az) - env.floor.heightAt(ax, az);
    if (dAhead < Math.max(env.minDepth, 2.2 * (this.half.above + this.half.below)) && st !== 'LEAP') {
      const l = this.depthAt(env, this.heading + 0.8, ahead), r = this.depthAt(env, this.heading - 0.8, ahead);
      wantH = this.heading + (l > r ? 1.2 : -1.2);
      wantSpeed = Math.min(wantSpeed, 0.5 * B.cruise * tl);
      turnK = Math.max(turnK, 4);
    }
    const bd = env.bounds;
    if (bd) {
      const m = 0.6 * tl;
      if (this.pos.x < bd.minX + m || this.pos.x > bd.maxX - m || this.pos.z < bd.minZ + m || this.pos.z > bd.maxZ - m) {
        wantH = Math.atan2((bd.minX + bd.maxX) / 2 - this.pos.x, (bd.minZ + bd.maxZ) / 2 - this.pos.z);
        turnK = Math.max(turnK, 5);
      }
    }
    // kinematics: heading by a rate limited with speed, speed by the burst's acceleration or the glide's drag
    const e = wrap(wantH - this.heading);
    const yaw = clamp(e * turnK, -maxYaw, maxYaw);
    this.yawRate = damp(this.yawRate, yaw, st === 'ESCAPE' || st === 'STRIKE' ? 40 : 8, dt);
    this.heading = wrap(this.heading + this.yawRate * dt);
    const accel = wantSpeed > this.speed ? (st === 'ESCAPE' || st === 'STRIKE' ? 14 : 2.2) : 1.4;
    this.speed = damp(this.speed, wantSpeed, accel, dt);
    if (st === 'LEAP') {
      this.vy -= 9.8 * dt;
    } else {
      const above = this.pos.y > L.surface;
      if (above) this.vy -= 9.8 * dt;
      else this.vy = damp(this.vy, clamp((clamp(wantY, L.lo, Math.max(L.lo, L.hi)) - this.pos.y) * 3, -0.6 * B.burst * tl, 0.6 * B.burst * tl), 4, dt);
    }
    const ch = Math.cos(this.pitch);
    this.pos.x += Math.sin(this.heading) * this.speed * ch * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * ch * dt;
    this.pos.y += this.vy * dt;
    if (st !== 'LEAP' && this.pos.y <= L.surface) this.pos.y = clamp(this.pos.y, L.lo, Math.max(L.lo, Math.max(L.hi, this.pos.y - 0.2 * dt)));
    if (this.pos.y < L.lo) { this.pos.y = L.lo; this.vy = Math.max(0, this.vy); }
    // attitude: pitched along the climb, banked into turns, the forage's own tilt
    const climb = Math.atan2(this.vy, Math.max(this.speed, 0.05 * tl));
    // (+ = snout down, as the root's rotation.x)
    this.pitch = damp(this.pitch, clamp(wantPitch !== 0 ? wantPitch : -climb * (st === 'LEAP' ? 1 : 0.6), -1.3, 1.3), st === 'LEAP' ? 12 : 4, dt);
    if (this.benthic && (st === 'REST' || st === 'BURY')) this.pitch = damp(this.pitch, 0, 3, dt);
    this.roll = damp(this.roll, clamp(-this.yawRate * 0.06 + wantRoll + (this.school ? this.school.rollOf(this) : 0), -0.9, 0.9), 6, dt);
    if (st !== 'BURY' && st !== 'REST' && this.buried > 0) {
      this.buried = Math.max(0, this.buried - dt * 3);
      if (this.buried > 0.2) this.dust('stream', 0.6);
    }
    this.animate(dt, curvKick, extraAmp, headBend, jaw, pec, pecBeat, ripple);
  }

  private depthAt(env: FishEnv, h: number, d: number): number {
    const x = this.pos.x + Math.sin(h) * d, z = this.pos.z + Math.cos(h) * d;
    return env.floor.waterAt(x, z) - env.floor.heightAt(x, z);
  }

  /** the tail beat and fins from the motion */
  private animate(dt: number, curvKick: number, extraAmp: number, headBend: number, jaw: number, pec: number, pecBeat: number, ripple: number): void {
    const p = this.pose, sw = this.spec.swim, B = this.spec.behavior, tl = this.tl;
    const rel = this.speed / tl;
    // tail-beat frequency from the stride (body lengths per beat), a slow beat while hovering
    const f = Math.max(this.benthic && this.state === 'REST' ? 0 : 0.9, rel / sw.stride + (extraAmp > 0.05 ? 6 : 0));
    this.tailPh += TAU * f * dt;
    p.phase = this.tailPh;
    const k = clamp(rel / B.cruise, 0, 1.4);
    const ampW = (this.state === 'REST' ? 0.004 : 0.018 + (sw.amp - 0.018) * Math.min(1, k)) + extraAmp;
    p.amp = damp(p.amp, ampW, 8, dt);
    // the body bends into the turn: curvature from the yaw rate over the speed
    const turn = clamp(this.yawRate / Math.max(rel, 1.2), -5, 5) * 0.8;
    p.curv = damp(p.curv, turn + curvKick, curvKick !== 0 ? 60 : 10, dt);
    p.headBend = damp(p.headBend, headBend, 6, dt);
    // breathing, the buccal pump: the mouth opens to draw water in while the gill covers are shut, then closes as they
    // swing out to drive it over the gills; faster and deeper after a burst, slower with size
    this.effort = damp(this.effort, this.state === 'ESCAPE' || this.state === 'STRIKE' ? 1 : this.speed / (tl * B.burst), this.state === 'ESCAPE' ? 3 : 0.25, dt);
    this.breath += TAU * (1.1 + 1.6 * this.effort) * Math.pow(0.2 / Math.max(0.05, tl), 0.3) * dt;
    const bj = (0.05 + 0.12 * this.effort) * (0.5 + 0.5 * Math.sin(this.breath));
    p.jaw = damp(p.jaw, Math.max(jaw, bj), jaw > 0.3 ? 30 : 10, dt);
    p.oper = damp(p.oper, (0.25 + 0.75 * this.effort) * Math.max(0, Math.sin(this.breath - 2.2)), 14, dt);
    // the eyes: small saccades now and then, a held gaze between; toward the strike's aim
    this.eyeT -= dt;
    if (this.eyeT <= 0) {
      this.eyeT = 0.6 + this.rnd() * 2.2;
      this.eyeYawT = (this.rnd() - 0.5) * 0.35; this.eyePitchT = (this.rnd() - 0.5) * 0.2;
    }
    p.eyeYaw = damp(p.eyeYaw, this.state === 'STRIKE' ? 0.25 : this.eyeYawT, 25, dt);
    p.eyePitch = damp(p.eyePitch, this.eyePitchT, 25, dt);
    // pectorals: spread when hovering or braking, pressed flat at speed
    const press = clamp(k - 0.8, 0, 1);
    const pw = pec * (1 - 0.8 * press);
    p.pecL = damp(p.pecL, pw, 6, dt);
    p.pecR = damp(p.pecR, pw, 6, dt);
    p.pecBeat = damp(p.pecBeat, pecBeat, 8, dt);
    // a flatfish's marginal fins: waves running back along them when it moves or shuffles
    this.finPh += TAU * (1.2 + 2.5 * ripple) * dt;
    p.ripplePhase = this.finPh;
    p.ripple = damp(p.ripple, this.spec.flat ? Math.max(0.15, ripple) : 0.15 * ripple, 4, dt);
  }

  private wanderGoal(env: FishEnv): void {
    const r = (1.5 + this.rnd() * 3) * this.tl;
    const a = this.heading + (this.rnd() - 0.5) * 2.4;
    this.swimTo(this.pos.x + Math.sin(a) * r, this.pos.z + Math.cos(a) * r, 12);
    void env;
  }

  private afterRest(env: FishEnv): void {
    if (this.spec.behavior.forage === 'ambush') this.setState('FORAGE', 15 + this.rnd() * 20);
    else this.wanderGoal(env);
  }

  /** the species' feeding, step by step */
  private forage(dt: number, env: FishEnv, L: { bottom: number; surface: number; lo: number; hi: number }, D: number): { speed: number; heading: number; y: number; pitch: number; headBend: number; jaw: number; pec: number; pecBeat: number; roll: number } {
    const B = this.spec.behavior, tl = this.tl;
    const o = { speed: 0.3 * B.cruise * tl, heading: this.heading, y: L.bottom + Math.max(B.minLift * tl, B.level * D) + this.half.below, pitch: 0, headBend: 0, jaw: 0, pec: 0.5, pecBeat: 0, roll: 0 };
    this.subT += dt;
    const t = this.subT;
    const near = L.lo + 0.25 * tl;
    switch (B.forage) {
      case 'hunt': {
        // look for a small fish every half second; stalk it slowly from behind and below, then strike
        if (this.sub === 0 || (this.sub === 1 && t > 0.5)) {
          this.prey = this.findPrey(8 * tl);
          this.sub = 1; this.subT = 0;
        }
        const p = this.prey;
        if (p) {
          const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
          o.heading = Math.atan2(dx, dz);
          o.speed = (d > 3 * tl ? 0.8 : 0.35) * B.cruise * tl;
          o.y = p.pos.y - 0.2 * tl;
          o.pec = 0.6;
          if (d < 1.3 * tl && Math.abs(wrap(o.heading - this.heading)) < 0.5) {
            this.aim.copy(p.pos);
            this.setState('STRIKE', this.stateDur - this.stateT);
          }
        } else {
          // patrolling the channel edge low, now and then a dart at something in the sand
          this.wanderH += (this.rnd() - 0.5) * 1.2 * dt;
          o.heading = this.heading + wrap(this.wanderH - this.heading) * 0.5;
          o.speed = 0.6 * B.cruise * tl;
          o.y = L.lo + 0.6 * tl;
          if (t > 5 + this.rnd() * 6) {
            this.aim.set(this.pos.x + Math.sin(this.heading) * tl, L.lo + 0.2 * tl, this.pos.z + Math.cos(this.heading) * tl);
            this.subT = 0;
            this.setState('STRIKE', this.stateDur - this.stateT);
          }
        }
        break;
      }
      case 'pick':
      case 'peck': {
        // nose down to the bed, a bite, a pause; every few bites a short move to the next patch
        const pick = B.forage === 'pick';
        o.y = near + (pick ? 0.1 : 0.3) * tl;
        o.speed = this.sub % 4 === 3 ? 0.5 * B.cruise * tl : 0.05 * tl;
        o.pitch = (pick ? 0.55 : 0.35) * (this.sub % 4 === 3 ? 0.2 : 1);
        o.headBend = pick ? 0.12 : 0.08;
        o.pec = 0.8; o.pecBeat = Math.sin(this.time * 6) * 0.6;
        o.roll = pick ? 0.25 * Math.sin(this.sub * 1.7) : 0;
        const cyc = pick ? 0.7 : 1.1;
        const ph = (t % cyc) / cyc;
        o.jaw = this.sub % 4 === 3 ? 0 : ph < 0.25 ? ph / 0.25 : Math.max(0, 1 - (ph - 0.25) * 4);
        if (t > cyc * (this.sub + 1)) { this.sub++; if (this.sub % 4 === 0) this.wanderH = this.heading + (this.rnd() - 0.5) * 1.5; if (!pick && this.sub % 4 === 1) this.dust('gill', 0.4); }
        o.heading = this.sub % 4 === 3 ? this.wanderH : this.heading;
        break;
      }
      case 'dig': {
        // glide low → stop → tip head-down → plunge the snout into the sand → sand out of the gills → lift
        const phases = [1.2 + this.rnd() * 0.05, 0.35, 0.35, 0.45, 0.4];
        const step = this.sub % 5;
        o.heading = this.heading + wrap(this.wanderH - this.heading) * 0.4;
        o.y = near;
        if (step === 0) { o.speed = 0.7 * B.cruise * tl; this.wanderH += (this.rnd() - 0.5) * 0.8 * dt; }
        if (step === 1) { o.speed = 0; o.pec = 0.9; o.pitch = 0.5 * (t / phases[1]); }
        if (step === 2) { o.speed = 0.15 * tl; o.pitch = 0.75; o.y = L.lo - 0.05 * tl; o.jaw = 1; o.headBend = 0.15; }
        if (step === 3) { o.speed = 0; o.pitch = 0.6; o.y = L.lo; o.jaw = 0.2; if (t < dt * 1.5) this.dust('gill', 0.8, this.pointAt(this.spec.oper.s, this.tmp)); }
        if (step === 4) { o.speed = 0.2 * tl; o.pitch = 0.1; }
        if (t > phases[step]) { this.sub++; this.subT = 0; if (step === 2) this.emit('dig'); }
        break;
      }
      case 'ambush': {
        // lying in wait (buried to the eyes): strikes at prey passing close in front
        o.speed = 0; o.y = L.lo; o.heading = this.heading; o.pec = this.spec.flat ? 0.1 : 0.7;
        if (this.buried < 0.3 && env.canBurrow && this.stateT < 0.1 && this.spec.behavior.extras.includes('bury')) { this.wantHeading = this.heading; this.setState('BURY', 1.3); break; }
        if (t > 0.4) {
          this.subT = 0;
          const p = this.findPrey(1.6 * this.tl);
          if (p) {
            const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
            if (Math.abs(wrap(Math.atan2(dx, dz) - this.heading)) < 1.0) { this.prey = p; this.aim.copy(p.pos); this.setState('STRIKE', this.stateDur - this.stateT); break; }
          }
          // nothing passed: once in a long while a lunge at something small (a shrimp, a goby)
          if (this.rnd() < 0.012) {
            this.aim.set(this.pos.x + Math.sin(this.heading) * 0.8 * tl, L.lo + 0.35 * tl, this.pos.z + Math.cos(this.heading) * 0.8 * tl);
            this.setState('STRIKE', this.stateDur - this.stateT);
          }
        }
        break;
      }
      case 'graze': {
        // head-down at the bed, the body twisting as it scrapes; silt out of the gills, then up and on
        const step = this.sub % 3;
        o.y = step === 1 ? L.lo + 0.15 * tl : near + 0.4 * tl;
        o.speed = step === 1 ? 0.12 * tl : 0.45 * B.cruise * tl;
        o.pitch = step === 1 ? 0.7 : step === 0 ? 0.3 : -0.1;
        o.roll = step === 1 ? 0.35 * Math.sin(this.time * 3 + this.seed) : 0;
        o.jaw = step === 1 ? 0.5 + 0.5 * Math.sin(this.time * 9) : 0;
        if (this.school) { o.heading = this.school.wantHeading(this); o.speed = Math.min(o.speed, this.school.wantSpeed(this)); }
        if (step === 1 && (t % 0.8) < dt) this.dust('gill', 0.6, this.pointAt(this.spec.oper.s, this.tmp));
        if (t > [1.4, 2.4, 1.6][step]) { this.sub++; this.subT = 0; }
        break;
      }
      case 'filter': {
        // the school slows and the mouths gape open and shut through the plankton; now and then a dip to the bed
        o.speed = 0.6 * B.cruise * tl;
        o.jaw = 0.5 + 0.5 * Math.sin(this.time * 7 + this.seed);
        o.pec = 0.4;
        if (this.school) { o.heading = this.school.wantHeading(this); o.speed = Math.min(o.speed, this.school.wantSpeed(this)); o.y = this.school.wantY(this, L, o.y); }
        break;
      }
    }
    return o;
  }

  /** the intents of the brain */
  request(kind: string, seconds: number, target: Vector3 | null, param?: string, from?: Vector3 | null): void {
    const B = this.spec.behavior;
    if (this.state === 'STRIKE' || this.state === 'LEAP') return;
    switch (kind) {
      case 'flee': this.startle(from ?? (target ? this.tmp.set(2 * this.pos.x - target.x, this.pos.y, 2 * this.pos.z - target.z) : this.tmp.set(this.pos.x, this.pos.y, this.pos.z - 1))); break;
      case 'rest':
        if (this.benthic || B.habit === 'sandForager' && B.extras.includes('rest')) { this.wantHeading = this.heading; this.setState('REST', seconds || 10); } else this.setState('IDLE', seconds || 8);
        break;
      case 'burrow':
        if (B.extras.includes('bury')) { this.wantHeading = this.heading; this.setState('BURY', 1.3 + this.rnd() * 0.6); } else this.setState(this.benthic ? 'REST' : 'IDLE', seconds || 8);
        break;
      case 'wander': case 'moveTo':
        if (target) this.swimTo(target.x, target.z, Math.max(seconds, 8)); else this.setState('SWIM', seconds || 8);
        break;
      case 'forage': this.setState('FORAGE', Math.max(seconds, B.forage === 'ambush' ? 15 : 6)); break;
      case 'display': this.setState('ALERT', seconds || 4); break;
      case 'special':
        if (B.extras.includes('leap') && param === 'surface') this.setState('LEAP', 2);
        else if (B.extras.includes('strike')) this.setState('FORAGE', 8);
        else this.setState('IDLE', 5);
        break;
      default: this.setState('IDLE', 5);
    }
  }
}
