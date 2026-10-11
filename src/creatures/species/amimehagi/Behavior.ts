import { Vector2, Vector3 } from 'three';
import type { Rng } from '../../../core/Rng';
import type { Floor } from '../../drivers/Driver';
import { S_PIVOT } from './anatomy';
import { restPose, type FinPose } from './pose';
import type { SeagrassQuery, ShootRef } from './seagrass';

/**
 * How an アミメハギ lives in the eelgrass.
 *
 *  HOVER          holds its place by a leaf, head a little down, on the ripple of its dorsal and anal fins and the
 *                 flutter of its pectorals; turns slowly on the spot, its eyes roving each on its own
 *  SLOW_SWIM      moves from leaf to leaf through the bed at one or two body lengths a second, pausing by each, the
 *                 tail folded and steering (balistiform swimming: no tail beat)
 *  FORAGE         picks at the leaves' growth (and at small animals on the sand): edges up to a spot, eyes on it,
 *                 then a short darting peck with the mouth opening, a back-off and a chew, again or on to the next
 *  SEAGRASS_HIDE  goes to the nearest shoot, puts it between itself and the threat and hangs head-down along the
 *                 leaves, spine up, darkened and blotched; sidles round the leaves as the threat moves. At night it
 *                 sleeps so, its mouth on a leaf
 *  ESCAPE         turns away in a flash and bursts off with a few hard tail beats, spine up, then glides on its fins
 *                 into the thickest leaves nearby and hides there
 *
 * Units: metres and seconds; TL is the fish's total length. The fish's origin is its pivot (S_PIVOT of the length
 * behind the snout); heading 0 faces +z; pitch > 0 is nose up.
 */
export type AmhState = 'HOVER' | 'SLOW_SWIM' | 'FORAGE' | 'SEAGRASS_HIDE' | 'ESCAPE';

export interface FishEnv {
  floor: Floor;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  minDepth: number;
  grass: SeagrassQuery | null;
  /** where the threat is (the player), when the fish knows of one */
  threat: Vector3 | null;
}

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const wrap = (a: number) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const approach = (x: number, to: number, k: number) => x + (to - x) * k;

interface Gaze { yaw: number; pitch: number; tYaw: number; tPitch: number; next: number; locked: boolean }

/** what the fish is about to peck at */
interface PeckTarget { p: Vector3; leaf: boolean; n: number }

export class AmimehagiFish {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  heading = 0;
  pitch = 0;
  roll = 0;
  private yawRate = 0;
  /** total length (m) */
  readonly tl: number;
  state: AmhState = 'HOVER';
  /** seconds in the current state */
  stateT = 0;
  /** how long the current intent lasts (s); the state ends by itself after it */
  private stateFor = 10;
  time = 0;
  /** asleep among the leaves (a night-time SEAGRASS_HIDE) */
  sleeping = false;
  /** how roused the fish is (0 .. 1): darker skin, spine up, flap down */
  alarm = 0;
  readonly pose: FinPose = restPose();
  /** the colour the skin is turning to (0 calm .. 1 dark and blotched) */
  dark = 0;
  /** where a peck lands (for the debug view and the viewer) */
  readonly target = new Vector3();
  onEvent: ((behaviorId: string) => void) | null = null;

  // goals
  private readonly goal = new Vector3();
  private goalFace: number | null = null;
  private goalPitch = 0;
  private readonly travel = new Vector3();
  private waypointT = 0;
  private pause = 0;
  private hideShoot: ShootRef | null = null;
  private hideH = 0;
  private peck: PeckTarget | null = null;
  private peckPhase: 'approach' | 'aim' | 'lunge' | 'back' | 'chew' = 'approach';
  private peckT = 0;
  private escT = -1;
  private readonly escDir = new Vector3();
  private readonly gazeL: Gaze = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, next: 0, locked: false };
  private readonly gazeR: Gaze = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, next: 0, locked: false };
  private readonly shoots: ShootRef[] = [];
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly flow = new Vector2();
  // individual character
  private readonly calm: number;
  private readonly hoverH: number;
  private readonly medHz: number;
  private readonly pecHz: number;
  private readonly spineRest: number;
  private spineDrift = 0;
  private phaseMed = 0;
  private phasePec = 0;
  private phaseTail = 0;
  private tailAmp = 0;

  constructor(tl: number, private readonly rng: Rng) {
    this.tl = tl;
    this.calm = rng.range(0.7, 1.3);
    this.hoverH = rng.range(0.12, 0.3);
    this.medHz = rng.range(2.4, 3.4);
    this.pecHz = rng.range(5.5, 7.5);
    this.spineRest = rng.range(0.45, 0.8);
    this.gazeL.next = rng.range(0, 1);
    this.gazeR.next = rng.range(0, 1);
  }

  /** where the snout is (world) */
  snout(out: Vector3): Vector3 {
    const d = S_PIVOT * this.tl;
    const cp = Math.cos(this.pitch);
    return out.set(this.pos.x + Math.sin(this.heading) * cp * d, this.pos.y + Math.sin(this.pitch) * d, this.pos.z + Math.cos(this.heading) * cp * d);
  }

  forward(out: Vector3): Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.heading) * cp, Math.sin(this.pitch), Math.cos(this.heading) * cp);
  }

  // ------------------------------------------------------------------ intents

  enter(state: AmhState, seconds: number, env: FishEnv, opts: { target?: Vector3 | null; sleep?: boolean; from?: Vector3 | null } = {}): void {
    if (this.state === 'ESCAPE' && state !== 'ESCAPE' && this.escT >= 0 && this.escT < 0.7) return;
    const prev = this.state;
    this.state = state;
    this.stateT = 0;
    this.stateFor = seconds;
    this.sleeping = !!opts.sleep;
    this.peck = null;
    this.pause = 0;
    this.goalFace = null;
    switch (state) {
      case 'HOVER':
        this.pickHoverSpot(env);
        this.emit('hover');
        break;
      case 'SLOW_SWIM':
        if (opts.target) this.travel.copy(opts.target);
        else this.travel.set(this.pos.x + this.rng.range(-0.6, 0.6), this.pos.y, this.pos.z + this.rng.range(-0.6, 0.6));
        this.nextWaypoint(env);
        this.emit('slow_swim');
        break;
      case 'FORAGE':
        this.peck = this.pickPeck(env);
        this.peckPhase = 'approach';
        this.peckT = 0;
        this.emit('forage');
        break;
      case 'SEAGRASS_HIDE':
        this.pickHide(env, opts.from ?? env.threat);
        this.alarm = Math.max(this.alarm, this.sleeping ? 0 : 0.6);
        this.emit(this.sleeping ? 'sleep' : 'seagrass_hide');
        break;
      case 'ESCAPE': {
        const from = opts.from ?? env.threat;
        const away = this.escDir.set(0, 0, 0);
        if (from) away.set(this.pos.x - from.x, 0, this.pos.z - from.z);
        if (away.lengthSq() < 1e-8) away.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
        away.normalize();
        // into the thickest leaves on the far side when there are some within a dash
        const cover = this.denseCover(env, away, 0.9);
        if (cover) away.copy(cover).sub(this.pos).setY(0).normalize();
        this.escT = 0;
        this.alarm = 1;
        if (prev !== 'ESCAPE') this.emit('escape');
        break;
      }
    }
  }

  private emit(id: string): void { this.onEvent?.(id); }

  /** the state has run its time (the driver asks the brain for the next) */
  get expired(): boolean {
    if (this.state === 'ESCAPE') return this.escT < 0;
    return this.stateT >= this.stateFor;
  }

  // ------------------------------------------------------------------ choosing places

  /** heights the fish keeps between at (x, z): off the sand, under the surface */
  layer(env: FishEnv, x: number, z: number): { lo: number; hi: number; bottom: number; surface: number } {
    const bottom = env.floor.heightAt(x, z), surface = env.floor.waterAt(x, z);
    const lo = bottom + 0.45 * this.tl, hi = Math.max(lo, surface - 0.45 * this.tl);
    return { lo, hi, bottom, surface };
  }

  private nearShoots(env: FishEnv, x: number, z: number, r: number, max = 24): number {
    return env.grass ? env.grass.near(x, z, r, this.shoots, max) : 0;
  }

  /** a place to hold by: beside a leaf if there are leaves within reach, else where it is */
  private pickHoverSpot(env: FishEnv): void {
    const L = this.layer(env, this.pos.x, this.pos.z);
    const n = this.nearShoots(env, this.pos.x, this.pos.z, 0.25, 12);
    if (n > 0) {
      const s = this.shoots[Math.floor(this.rng.next() * Math.min(n, 4))];
      const h = clamp(this.pos.y - s.y, 0.06, Math.max(0.06, Math.min(s.len * 0.75, L.hi - s.y)));
      this.besideLeaf(env, s, h, null, 0.6 + 0.4 * this.rng.next(), this.goal);
      this.goalPitch = -this.rng.range(0.15, 0.45);
    } else {
      this.goal.copy(this.pos);
      this.goal.y = clamp(Math.max(this.pos.y, L.bottom + this.hoverH * (L.surface - L.bottom)), L.lo, L.hi);
      this.goalPitch = -this.rng.range(0.05, 0.3);
    }
  }

  /**
   * A point by the shoot at height h: `clear` body-widths out from its leaves, on the side away from `from` (or the
   * side the fish is on).
   */
  private besideLeaf(env: FishEnv, s: ShootRef, h: number, from: Vector3 | null, clear: number, out: Vector3): Vector3 {
    const g = env.grass!;
    const b = g.bladeAt(s, h, this.tmp2);
    let dx = this.pos.x - b.x, dz = this.pos.z - b.z;
    if (from) { dx = b.x - from.x; dz = b.z - from.z; }
    const l = Math.hypot(dx, dz);
    if (l < 1e-5) { dx = Math.sin(this.heading); dz = Math.cos(this.heading); } else { dx /= l; dz /= l; }
    // the leaves fan a few centimetres round the shoot's axis
    const r = 0.018 + clear * 0.5 * this.tl;
    out.set(b.x + dx * r, b.y, b.z + dz * r);
    const L = this.layer(env, out.x, out.z);
    out.y = clamp(out.y, L.lo, L.hi);
    return out;
  }

  /** the next leg of a slow swim: a shoot a little way on toward the travel goal, or a short hop without leaves */
  private nextWaypoint(env: FishEnv): void {
    const to = this.tmp.copy(this.travel).sub(this.pos).setY(0);
    const dist = to.length();
    if (dist > 1e-4) to.divideScalar(dist); else to.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const leg = Math.min(dist, this.rng.range(0.1, 0.28));
    const n = this.nearShoots(env, this.pos.x + to.x * leg, this.pos.z + to.z * leg, 0.16, 10);
    let best: ShootRef | null = null, bestScore = -1e9;
    for (let i = 0; i < n; i++) {
      const s = this.shoots[i];
      const ax = s.x - this.pos.x, az = s.z - this.pos.z;
      const along = ax * to.x + az * to.z;
      const score = along - 0.6 * Math.abs(-ax * to.z + az * to.x) + 0.05 * this.rng.next();
      if (along > 0.03 && score > bestScore) { bestScore = score; best = s; }
    }
    const L = this.layer(env, this.pos.x, this.pos.z);
    // wander a little in height through the canopy
    const wantY = clamp(this.pos.y + this.rng.range(-0.04, 0.04), L.lo, L.hi);
    if (best) {
      this.besideLeaf(env, best, clamp(wantY - best.y, 0.05, Math.max(0.05, best.len * 0.8)), null, 0.8, this.goal);
    } else {
      this.goal.set(this.pos.x + to.x * leg + this.rng.range(-0.03, 0.03), wantY, this.pos.z + to.z * leg + this.rng.range(-0.03, 0.03));
    }
    this.waypointT = 0;
  }

  /** a spot to pick at: a leaf's surface (its growth of diatoms and tiny animals) or a speck on the sand */
  private pickPeck(env: FishEnv): PeckTarget | null {
    const n = this.nearShoots(env, this.pos.x, this.pos.z, 0.3, 10);
    const L = this.layer(env, this.pos.x, this.pos.z);
    if (n > 0 && this.rng.next() < 0.75) {
      const s = this.shoots[Math.floor(this.rng.next() * n)];
      const h = this.rng.range(0.04, Math.max(0.05, Math.min(s.len * 0.7, L.surface - s.y - 0.03)));
      const p = env.grass!.bladeAt(s, h, new Vector3());
      // on the leaf's face: a little off the shoot's axis, on the near side
      const dx = this.pos.x - p.x, dz = this.pos.z - p.z, l = Math.hypot(dx, dz) || 1;
      p.x += (dx / l) * 0.008; p.z += (dz / l) * 0.008;
      return { p, leaf: true, n: 1 + Math.floor(this.rng.next() * 3) };
    }
    const a = this.rng.range(0, TAU), r = this.rng.range(0.04, 0.2);
    const x = this.pos.x + Math.sin(a) * r, z = this.pos.z + Math.cos(a) * r;
    return { p: new Vector3(x, env.floor.heightAt(x, z) + 0.002, z), leaf: false, n: 1 + Math.floor(this.rng.next() * 2) };
  }

  /** the nearest good shoot to hide by, on the far side of it from the threat */
  private pickHide(env: FishEnv, from: Vector3 | null): void {
    const n = this.nearShoots(env, this.pos.x, this.pos.z, 0.6, 16);
    let best: ShootRef | null = null, bestScore = -1e9;
    for (let i = 0; i < n; i++) {
      const s = this.shoots[i];
      const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
      let score = -d + 0.25 * (env.grass?.cover(s.x, s.z) ?? 0) + 0.15 * Math.min(1, s.len / 0.6);
      if (from) {
        // a shoot that is not between the fish and the threat is no use; one farther from the threat is better
        const tx = s.x - from.x, tz = s.z - from.z;
        score += 0.1 * Math.min(1, Math.hypot(tx, tz) / 2);
      }
      if (score > bestScore) { bestScore = score; best = s; }
    }
    // (a copy: the query's result objects are reused by the next query)
    this.hideShoot = best ? { ...best } : null;
    const L = this.layer(env, this.pos.x, this.pos.z);
    if (best) {
      this.hideH = clamp(this.pos.y - best.y, 0.06, Math.max(0.06, Math.min(best.len * 0.6, L.hi - best.y)));
      if (this.sleeping) this.hideH = clamp(best.len * this.rng.range(0.25, 0.45), 0.05, Math.max(0.05, L.hi - best.y));
    } else {
      // no leaves: down by the sand, still
      this.goal.set(this.pos.x, L.lo + 0.02, this.pos.z);
    }
  }

  /** a point of thick cover roughly along `dir` within `reach`, or null */
  private denseCover(env: FishEnv, dir: Vector3, reach: number): Vector3 | null {
    if (!env.grass) return null;
    let best: Vector3 | null = null, bestC = 0.25;
    for (let k = 0; k < 9; k++) {
      const a = Math.atan2(dir.x, dir.z) + (k - 4) * 0.22;
      for (const r of [0.35, 0.6, reach]) {
        const x = this.pos.x + Math.sin(a) * r, z = this.pos.z + Math.cos(a) * r;
        const c = env.grass.cover(x, z) - 0.15 * Math.abs(k - 4) / 4;
        if (c > bestC) { bestC = c; best = (best ?? new Vector3()).set(x, this.pos.y, z); }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ the step

  update(dt: number, env: FishEnv): void {
    if (dt <= 0) return;
    this.time += dt;
    this.stateT += dt;
    const tl = this.tl;
    let turnRate = 1.6, faceMove = false;
    let wantPitch = this.goalPitch;
    let spine = this.spineRest, flap = 0.12, caudal = 0.35, jaw = 0, burst = 0, darkTo = 0.12;
    let holdK = 2.2;
    switch (this.state) {
      case 'HOVER': {
        // drift round the spot, and every so often turn to look elsewhere
        const wob = this.tmp.set(Math.sin(this.time * 0.37 + this.calm) * 0.15, Math.sin(this.time * 0.29) * 0.1, Math.cos(this.time * 0.33) * 0.15).multiplyScalar(tl);
        this.tmp2.copy(this.goal).add(wob);
        this.steer(this.tmp2, dt, holdK, 0.5 * tl, 0.8 * tl);
        if (this.goalFace === null || this.rng.next() < dt * 0.12 * this.calm) this.goalFace = this.heading + this.rng.range(-0.9, 0.9);
        spine = this.spineRest + 0.15 * Math.sin(this.time * 0.21 + this.spineDrift);
        caudal = 0.3 + 0.15 * Math.sin(this.time * 0.4 + this.calm * 3);
        turnRate = 0.9;
        break;
      }
      case 'SLOW_SWIM': {
        this.waypointT += dt;
        const d = this.tmp.copy(this.goal).sub(this.pos);
        const there = d.length() < 0.25 * tl;
        if (there && this.pause <= 0) this.pause = this.rng.range(0.3, 1.4) * this.calm;
        if (this.pause > 0) {
          this.pause -= dt;
          this.steer(this.goal, dt, holdK, 0.5 * tl, 0.8 * tl);
          if (this.pause <= 0) this.nextWaypoint(env);
          wantPitch = -0.2;
        } else {
          if (this.waypointT > 8) this.nextWaypoint(env);
          this.steer(this.goal, dt, 1.2, (0.8 + 0.6 * this.calm) * tl, 1.2 * tl);
          faceMove = true;
          wantPitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z) + 1e-4), -0.5, 0.5) * 0.7 - 0.08;
        }
        spine = 0.4 + 0.2 * this.spineRest;
        caudal = 0.25;
        turnRate = 1.8;
        break;
      }
      case 'FORAGE': {
        const r = this.updatePeck(dt, env);
        jaw = r.jaw; wantPitch = r.pitch;
        spine = 0.55;
        caudal = 0.3;
        turnRate = 2.2;
        break;
      }
      case 'SEAGRASS_HIDE': {
        const r = this.updateHide(dt, env);
        wantPitch = r.pitch;
        spine = this.sleeping ? 0.85 : 1;
        flap = this.sleeping ? 0.3 : 0.75;
        caudal = 0.15;
        darkTo = this.sleeping ? 0.85 : 0.6;
        turnRate = 1.2;
        holdK = 3;
        break;
      }
      case 'ESCAPE': {
        const r = this.updateEscape(dt, env);
        burst = r.burst;
        turnRate = r.turnRate;
        wantPitch = r.pitch;
        spine = 1; flap = 0.6; caudal = r.caudal; darkTo = 0.45;
        faceMove = r.faceMove;
        break;
      }
    }
    this.alarm = Math.max(this.state === 'SEAGRASS_HIDE' && !this.sleeping ? 0.6 : 0, this.alarm - dt * 0.12);
    darkTo = Math.max(darkTo, this.alarm * 0.5);

    // keep in the water column, and out of the leaves' axes
    this.avoid(env, dt);
    this.fence(env);

    // turning: toward the way it moves when swimming, else toward the goal heading
    const sp = Math.hypot(this.vel.x, this.vel.z);
    let wantYaw = this.goalFace ?? this.heading;
    if (faceMove && sp > 0.3 * tl) wantYaw = Math.atan2(this.vel.x, this.vel.z);
    const dy = wrap(wantYaw - this.heading);
    const yr = clamp(dy * 3.2, -turnRate, turnRate);
    this.yawRate = approach(this.yawRate, yr, 1 - Math.exp(-dt * 10));
    this.heading = wrap(this.heading + this.yawRate * dt);
    this.pitch = approach(this.pitch, clamp(wantPitch, -1.35, 1.0), 1 - Math.exp(-dt * (this.state === 'ESCAPE' ? 8 : 2.2)));
    this.roll = approach(this.roll, clamp(-this.yawRate * 0.08, -0.3, 0.3) + 0.03 * Math.sin(this.time * 0.9 + this.calm), 1 - Math.exp(-dt * 4));

    // the skin's colour follows the mood within a second or two
    this.dark = approach(this.dark, darkTo, 1 - Math.exp(-dt * (darkTo > this.dark ? 2.5 : 0.6)));
    this.updatePose(dt, burst, spine, flap, caudal, jaw);
    this.updateEyes(dt, env);
  }

  /** move toward `to`: a critically damped pull, speed- and acceleration-limited, drifting a little with the current */
  private steer(to: Vector3, dt: number, k: number, vmax: number, amax: number): void {
    const want = this.tmp2.copy(to).sub(this.pos).multiplyScalar(k);
    const l = want.length();
    if (l > vmax) want.multiplyScalar(vmax / l);
    const dv = want.sub(this.vel);
    const a = dv.length() / dt;
    if (a > amax) dv.multiplyScalar(amax / a);
    this.vel.add(dv);
    this.pos.addScaledVector(this.vel, dt);
  }

  private updatePeck(dt: number, env: FishEnv): { jaw: number; pitch: number } {
    const pk = this.peck;
    if (!pk) { this.steer(this.goal, dt, 2, 0.5 * this.tl, 0.8 * this.tl); return { jaw: 0, pitch: -0.2 }; }
    this.target.copy(pk.p);
    this.peckT += dt;
    // face the spot: yaw toward it, pitch to it
    const to = this.tmp.copy(pk.p).sub(this.pos);
    const hd = Math.hypot(to.x, to.z);
    this.goalFace = Math.atan2(to.x, to.z);
    const pitch = clamp(Math.atan2(to.y, Math.max(hd, 1e-4)), -1.1, 0.8);
    // the pivot sits behind the snout: hold it so the snout is just short of the spot
    const reach = S_PIVOT * this.tl;
    const dir = to.clone().normalize();
    const stand = (gap: number) => this.tmp2.copy(pk.p).addScaledVector(dir, -(reach + gap));
    let jaw = 0;
    switch (this.peckPhase) {
      case 'approach': {
        const goal = stand(0.35 * this.tl).clone();
        this.steer(goal, dt, 1.6, 0.9 * this.tl, 1.2 * this.tl);
        if (goal.distanceTo(this.pos) < 0.12 * this.tl && Math.abs(wrap(this.goalFace - this.heading)) < 0.25) { this.peckPhase = 'aim'; this.peckT = 0; }
        if (this.peckT > 6) { this.peck = this.pickPeck(env); this.peckPhase = 'approach'; this.peckT = 0; }
        break;
      }
      case 'aim': {
        // a still moment, both eyes on the spot
        this.steer(stand(0.32 * this.tl).clone(), dt, 3, 0.4 * this.tl, 1 * this.tl);
        if (this.peckT > this.rng.range(0.25, 0.9)) { this.peckPhase = 'lunge'; this.peckT = 0; }
        break;
      }
      case 'lunge': {
        // a quick dart in, the mouth opening as it arrives (suction)
        const u = this.peckT / 0.11;
        this.steer(stand(0.02 * this.tl).clone(), dt, 30, 4 * this.tl, 60 * this.tl);
        jaw = Math.sin(Math.min(1, u) * Math.PI * 0.5);
        if (u >= 1) { this.peckPhase = 'back'; this.peckT = 0; this.emit('forage'); }
        break;
      }
      case 'back': {
        const u = this.peckT / 0.22;
        this.steer(stand(0.3 * this.tl).clone(), dt, 10, 1.5 * this.tl, 12 * this.tl);
        jaw = 1 - Math.min(1, u);
        if (u >= 1) { this.peckPhase = 'chew'; this.peckT = 0; }
        break;
      }
      case 'chew': {
        this.steer(stand(0.32 * this.tl).clone(), dt, 3, 0.4 * this.tl, 1 * this.tl);
        jaw = 0.18 * Math.max(0, Math.sin(this.peckT * TAU * 5));
        if (this.peckT > 0.5) {
          pk.n--;
          if (pk.n > 0) { this.peckPhase = 'aim'; this.peckT = 0; } else { this.peck = this.pickPeck(env); this.peckPhase = 'approach'; this.peckT = 0; }
        }
        break;
      }
    }
    return { jaw, pitch };
  }

  private updateHide(dt: number, env: FishEnv): { pitch: number } {
    const s = this.hideShoot;
    if (!s || !env.grass) {
      this.steer(this.goal, dt, 2, 0.6 * this.tl, 1 * this.tl);
      return { pitch: -0.6 };
    }
    // keep the shoot between the fish and the threat; sidle round it as the threat moves
    const from = this.sleeping ? null : env.threat;
    const spot = this.besideLeaf(env, s, this.hideH, from, this.sleeping ? 0.15 : 0.45, this.tmp.set(0, 0, 0));
    if (this.sleeping) {
      // its mouth on the leaf: the snout at the spot, the body hanging off it
      const b = env.grass.bladeAt(s, this.hideH, this.tmp2);
      this.goalFace = Math.atan2(b.x - this.pos.x, b.z - this.pos.z);
      const back = this.forward(new Vector3()).multiplyScalar(-S_PIVOT * this.tl * 0.95);
      spot.copy(b).add(back);
    } else {
      // side-on to the threat, the broad flank hidden behind the leaves, the head down along them
      const tx = s.x - (from?.x ?? this.pos.x - Math.sin(this.heading)), tz = s.z - (from?.z ?? this.pos.z - Math.cos(this.heading));
      const side = Math.atan2(tx, tz) + Math.PI / 2;
      const alt = side + Math.PI;
      this.goalFace = Math.abs(wrap(side - this.heading)) < Math.abs(wrap(alt - this.heading)) ? side : alt;
    }
    this.steer(spot, dt, this.stateT < 1.2 ? 1.8 : 2.6, (this.stateT < 1.2 ? 1.6 : 0.6) * this.tl, 1.6 * this.tl);
    return { pitch: this.sleeping ? -0.45 : -1.05 + 0.08 * Math.sin(this.time * 0.5) };
  }

  private updateEscape(dt: number, env: FishEnv): { burst: number; turnRate: number; pitch: number; caudal: number; faceMove: boolean } {
    this.escT += dt;
    const t = this.escT, tl = this.tl;
    const want = Math.atan2(this.escDir.x, this.escDir.z);
    this.goalFace = want;
    const fwd = this.forward(this.tmp);
    if (t < 0.12) {
      // the turn: fins in, the tail bent hard, hardly any way yet
      this.vel.multiplyScalar(Math.exp(-dt * 6));
      this.pos.addScaledVector(this.vel, dt);
      return { burst: 0.6, turnRate: 26, pitch: 0.05, caudal: 0.9, faceMove: false };
    }
    if (t < 0.7) {
      // three or four hard tail beats: up to ~10 body lengths a second
      const target = fwd.multiplyScalar(10 * tl);
      const dv = target.sub(this.vel);
      const a = Math.min(dv.length() / dt, 90 * tl);
      if (dv.lengthSq() > 0) this.vel.addScaledVector(dv.normalize(), a * dt);
      this.pos.addScaledVector(this.vel, dt);
      return { burst: 1, turnRate: 6, pitch: 0, caudal: 1, faceMove: false };
    }
    // the glide: fins take over, it slows into the leaves, then hides
    this.vel.multiplyScalar(Math.exp(-dt * 2.6));
    this.pos.addScaledVector(this.vel, dt);
    const sp = this.vel.length();
    if (t > 1.6 || sp < 1.2 * tl) {
      this.escT = -1;
      const left = Math.max(2, this.stateFor - t);
      this.enter('SEAGRASS_HIDE', left + 4, env, { from: env.threat });
      this.alarm = 1;
    }
    return { burst: 0.15, turnRate: 3, pitch: 0, caudal: 0.6, faceMove: true };
  }

  /** shoots' axes push the fish off (it weaves between them), the water's flow drifts it a little */
  private avoid(env: FishEnv, dt: number): void {
    if (env.grass) {
      const n = this.nearShoots(env, this.pos.x, this.pos.z, 0.06 + 0.5 * this.tl, 8);
      for (let i = 0; i < n; i++) {
        const s = this.shoots[i];
        const h = this.pos.y - s.y;
        if (h < 0 || h > s.len * 0.9) continue;
        const b = env.grass.bladeAt(s, h, this.tmp2);
        const dx = this.pos.x - b.x, dz = this.pos.z - b.z, d = Math.hypot(dx, dz);
        const R = 0.012 + 0.22 * this.tl;
        if (d < R && d > 1e-5) {
          const k = (R - d) / R;
          this.pos.x += (dx / d) * k * R * Math.min(1, dt * 8);
          this.pos.z += (dz / d) * k * R * Math.min(1, dt * 8);
        }
      }
      const c = env.grass.current(this.flow);
      // a fish holding station works against the current; a little of it still carries it
      this.pos.x += c.x * 0.12 * dt;
      this.pos.z += c.y * 0.12 * dt;
    }
  }

  /** keep the whole fish in the water column (snout and tail too when it hangs head-down) and in the tank */
  private fence(env: FishEnv): void {
    const L = this.layer(env, this.pos.x, this.pos.z);
    const reach = Math.abs(Math.sin(this.pitch)) * (1 - S_PIVOT) * this.tl;
    const lo = L.lo + (this.pitch < 0 ? Math.sin(-this.pitch) * S_PIVOT * this.tl : 0);
    const hi = L.hi - (this.pitch > 0 ? Math.sin(this.pitch) * S_PIVOT * this.tl : reach * 0.5);
    if (this.pos.y < lo) { this.pos.y = lo; if (this.vel.y < 0) this.vel.y = 0; }
    if (this.pos.y > Math.max(lo, hi)) { this.pos.y = Math.max(lo, hi); if (this.vel.y > 0) this.vel.y = 0; }
    const b = env.bounds;
    if (b) {
      const m = 0.6 * this.tl;
      if (this.pos.x < b.minX + m) { this.pos.x = b.minX + m; this.vel.x = Math.max(0, this.vel.x); }
      if (this.pos.x > b.maxX - m) { this.pos.x = b.maxX - m; this.vel.x = Math.min(0, this.vel.x); }
      if (this.pos.z < b.minZ + m) { this.pos.z = b.minZ + m; this.vel.z = Math.max(0, this.vel.z); }
      if (this.pos.z > b.maxZ - m) { this.pos.z = b.maxZ - m; this.vel.z = Math.min(0, this.vel.z); }
    }
  }

  // ------------------------------------------------------------------ fins and eyes

  /**
   * The fins from the motion: the median fins' wave carries the fish (faster and fuller with speed and with any push
   * it needs, reversed when it backs), the pectorals flutter all the time and row harder on the outside of a turn, the
   * folded tail steers; only a burst beats the tail.
   */
  private updatePose(dt: number, burst: number, spine: number, flap: number, caudal: number, jaw: number): void {
    const p = this.pose, tl = this.tl;
    const fwd = this.forward(this.tmp);
    const uf = this.vel.dot(fwd) / tl;                 // body lengths a second, forward
    const ul = Math.hypot(this.vel.x - fwd.x * uf * tl, this.vel.z - fwd.z * uf * tl) / tl;
    const effort = clamp(Math.abs(uf) / 2.2 + 0.35 * ul + 0.25 * Math.abs(this.yawRate), 0, 1);
    const medHz = this.medHz * (1 + 1.6 * effort) * (this.sleeping ? 0.4 : 1);
    this.phaseMed += TAU * medHz * dt;
    p.medPhase = this.phaseMed;
    p.medDir = uf < -0.05 ? -1 : 1;
    p.medAmp = approach(p.medAmp, (this.sleeping ? 0.05 : 0.11) + 0.42 * effort - 0.08 * burst, 1 - Math.exp(-dt * 6));
    p.medWaves = 1.1 + 0.3 * effort;
    p.medBias = approach(p.medBias, clamp(this.yawRate * 0.12, -0.25, 0.25), 1 - Math.exp(-dt * 5));
    // pectorals: a constant flutter (the fish's way of holding still), harder on the turn's outside
    const pecHz = this.pecHz * (1 + 0.6 * effort) * (this.sleeping ? 0.5 : 1);
    this.phasePec += TAU * pecHz * dt;
    const turn = clamp(this.yawRate / 1.5, -1, 1);
    const base = (this.sleeping ? 0.12 : 0.22) + 0.25 * effort;
    p.pecPhaseL = this.phasePec;
    p.pecPhaseR = this.phasePec + Math.PI * (0.8 + 0.2 * Math.sin(this.time * 0.3));
    p.pecAmpL = approach(p.pecAmpL, base * (1 - 0.6 * turn) * (1 - burst), 1 - Math.exp(-dt * 8));
    p.pecAmpR = approach(p.pecAmpR, base * (1 + 0.6 * turn) * (1 - burst), 1 - Math.exp(-dt * 8));
    const open = (0.3 + 0.25 * effort) * (1 - 0.9 * burst);
    p.pecOpenL = approach(p.pecOpenL, open, 1 - Math.exp(-dt * 10));
    p.pecOpenR = approach(p.pecOpenR, open, 1 - Math.exp(-dt * 10));
    // the tail: a rudder at rest, beating hard in a burst
    const tailHz = 11 + 3 * burst;
    this.phaseTail += TAU * tailHz * dt * (burst > 0.05 ? 1 : 0.3);
    this.tailAmp = approach(this.tailAmp, 0.55 * burst, 1 - Math.exp(-dt * 14));
    p.tailPhase = this.phaseTail;
    p.tailAmp = this.tailAmp;
    p.rudder = approach(p.rudder, clamp(-this.yawRate * 0.1, -0.35, 0.35) * (1 - burst), 1 - Math.exp(-dt * 6));
    // the C of the escape turn
    p.curv = approach(p.curv, this.state === 'ESCAPE' && this.escT >= 0 && this.escT < 0.12 ? clamp(this.yawRate * 0.05, -0.9, 0.9) : 0, 1 - Math.exp(-dt * 20));
    p.caudalSpread = approach(p.caudalSpread, Math.max(caudal, burst), 1 - Math.exp(-dt * 5));
    this.spineDrift += dt * 0.1;
    p.spine = approach(p.spine, clamp(Math.max(spine, this.alarm), 0, 1), 1 - Math.exp(-dt * (spine > p.spine ? 9 : 1.5)));
    p.flap = approach(p.flap, Math.max(flap, 0.7 * this.alarm), 1 - Math.exp(-dt * 4));
    p.jaw = approach(p.jaw, jaw, 1 - Math.exp(-dt * 30));
  }

  /**
   * The eyes move each on its own (as in all the puffer-like fishes): quick saccades between fixations, now the
   * threat, now the spot it means to peck (both eyes on it), now somewhere around, each within its own field.
   */
  private updateEyes(dt: number, env: FishEnv): void {
    const look = (g: Gaze, side: 1 | -1) => {
      g.next -= dt;
      const focus = this.state === 'FORAGE' && this.peck ? this.peck.p : this.state === 'SEAGRASS_HIDE' || this.alarm > 0.3 ? env.threat : null;
      if (focus && (g.locked || g.next <= 0)) {
        // aim at a point: its direction in the fish's frame
        const d = this.tmp2.copy(focus).sub(this.pos);
        const h = this.heading, cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
        const fx = Math.sin(h) * cp, fy = sp, fz = Math.cos(h) * cp;
        const lx = Math.cos(h), lz = -Math.sin(h);                 // the fish's left (+x of its frame)
        const ux = -Math.sin(h) * sp, uy = cp, uz = -Math.cos(h) * sp;
        const f = d.x * fx + d.y * fy + d.z * fz, l = d.x * lx + d.z * lz, u = d.x * ux + d.y * uy + d.z * uz;
        // each eye looks out its own side: forward of its axis is +yaw
        const out = side * l;
        if (out > -0.2 * Math.hypot(f, l)) {
          g.tYaw = clamp(Math.atan2(f, Math.max(out, 1e-4)) - 0.2, -0.5, 0.55);
          g.tPitch = clamp(Math.atan2(u, Math.hypot(f, out)), -0.4, 0.4);
          g.locked = true;
          g.next = this.rng.range(0.2, 0.6);
        } else g.locked = false;
      }
      if (!g.locked && g.next <= 0) {
        g.tYaw = this.rng.range(-0.4, 0.45);
        g.tPitch = this.rng.range(-0.3, 0.3);
        g.next = this.rng.range(0.35, 1.8) * (this.sleeping ? 4 : 1);
      }
      if (!focus) g.locked = false;
      // a saccade is fast (tens of ms); between them the eye holds
      const k = 1 - Math.exp(-dt * (this.sleeping ? 4 : 28));
      g.yaw = approach(g.yaw, g.tYaw, k);
      g.pitch = approach(g.pitch, g.tPitch, k);
    };
    look(this.gazeL, 1);
    look(this.gazeR, -1);
    this.pose.eyeL.yaw = this.gazeL.yaw; this.pose.eyeL.pitch = this.gazeL.pitch;
    this.pose.eyeR.yaw = this.gazeR.yaw; this.pose.eyeR.pitch = this.gazeR.pitch;
  }
}
