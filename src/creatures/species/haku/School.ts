import { Vector3 } from 'three';
import type { Rng } from '../../../core/Rng';
import { restPose, type SwimPose } from './swim';

/**
 * The ハク school: a light boids model (separation, alignment, cohesion over the nearest seven neighbours) under a
 * shared school state, with the kinematics of a 2–4 cm fish and its swimming pose.
 *
 * States
 *  IDLE          hovering in mid-water, facing into the current, pectorals sculling, short beat-and-coast bursts
 *  SCHOOL_SWIM   travelling as a polarised school a few centimetres under the surface
 *  FORAGE        a loose aggregation; each fish picks at the bottom film or at the surface by itself
 *  ESCAPE        a startle wave runs through the school from the fish that saw the threat: each fish C-starts away
 *                when the wave reaches it (2.5 m/s plus its own 10–50 ms latency), bursts at ~22 body lengths/s,
 *                then the school regroups tight and polarised and keeps going
 *  SURFACE_SWIM  the whole school just under the film, backs a few millimetres down, now and then a snout at the top
 *
 * The school's state is decided by its members' brains: the first intent after the state runs out sets the next
 * one, the rest follow. A flee from any member startles everyone.
 */

export type HakuState = 'IDLE' | 'SCHOOL_SWIM' | 'FORAGE' | 'ESCAPE' | 'SURFACE_SWIM';

export interface WaterQuery {
  heightAt(x: number, z: number): number;
  waterAt(x: number, z: number): number;
}

export interface FishEnv {
  floor: WaterQuery;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** least water the fish may be in (m) */
  minDepth: number;
}

/** startle wave speed through the school (m/s): the Trafalgar effect outruns any approaching threat */
export const STARTLE_WAVE = 2.5;
const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const damp = (cur: number, want: number, rate: number, dt: number) => want + (cur - want) * Math.exp(-rate * dt);

interface Personal {
  speed: number;
  latency: number;
  sep: number;
  depth: number;
  amp: number;
  rollPhase: number;
  wander: number;
  turn: number;
}

/** One ハク: position, heading and speed, its escape and foraging sub-states, and the pose they produce. */
export class HakuFish {
  readonly pos = new Vector3();
  heading = 0;
  /** swimming speed through the water (m/s) */
  speed = 0;
  vy = 0;
  pitch = 0;
  roll = 0;
  yawRate = 0;
  /** total length (m) */
  tl: number;
  time = 0;
  placed = false;
  readonly pose: SwimPose = restPose();
  readonly p: Personal;
  /** time the startle wave reaches this fish (−1 = none pending) and its escape stage clock */
  reactAt = -1;
  escT = -1;
  private escDir = 0;
  private escTurn = 0;
  private escSide = 1;
  private rollKick = 0;
  // breathing: phase of the buccal pump and how hard it works (resting ~0.3, 1 after an escape)
  private breathPh = 0;
  private effort = 0.3;
  // foraging
  private fgMode: 'seek' | 'peck' | 'pause' = 'pause';
  private fgT = 0;
  private readonly fgTarget = new Vector3();
  private fgBottom = false;
  private lastPeck = -10;
  private sipT = 0;
  private sipping = 0;
  private beatT = 0;
  private beating = true;
  private stateSeenAt = -1;
  private stuck = 0;
  /** behaviour events (idle, school_swim, forage, escape, surface_swim) */
  onEvent: ((id: string) => void) | null = null;
  private readonly tmp = new Vector3();

  constructor(tl: number, rng: Rng) {
    this.tl = tl;
    this.p = {
      speed: rng.range(0.88, 1.12), latency: rng.range(0.012, 0.05), sep: rng.range(0.9, 1.15), depth: rng.range(-1, 1),
      amp: rng.range(0.9, 1.1), rollPhase: rng.range(0, TAU), wander: rng.range(0, 1000), turn: rng.range(0.85, 1.15),
    };
    this.pose.phase = rng.range(0, TAU);
    this.sipT = rng.range(1, 5);
  }

  get forward(): Vector3 { return this.tmp.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  /** body depth (m) */
  get depthBody(): number { return this.tl * 0.18; }

  /** where the fish's centre may go at (x, z): between just off the bottom and just under the film */
  layer(env: FishEnv, x: number, z: number): { bottom: number; surface: number; lo: number; hi: number } {
    const bottom = env.floor.heightAt(x, z), surface = env.floor.waterAt(x, z);
    const lo = bottom + 0.6 * this.depthBody, hi = surface - 0.55 * this.depthBody - 0.0015;
    return { bottom, surface, lo, hi };
  }

  /** Begin the escape now: C-start toward `dir` (radians). */
  private cStart(dir: number): void {
    this.escT = 0;
    this.escDir = dir;
    this.escTurn = wrap(dir - this.heading);
    this.escSide = this.escTurn >= 0 ? 1 : -1;
    // the roll throws the flank up to the light: the flash of a startled school
    this.rollKick = -this.escSide * (0.45 + 0.25 * Math.random());
    this.reactAt = -1;
    this.onEvent?.('escape');
  }

  update(dt: number, school: School, env: FishEnv): void {
    if (dt <= 0) return;
    this.time += dt;
    school.tick(this.time, env);
    const tl = this.tl, st = school.state, p = this.p;
    if (school.stateStart !== this.stateSeenAt) {
      this.stateSeenAt = school.stateStart;
      if (st === 'SURFACE_SWIM') this.onEvent?.('surface_swim');
      else if (st === 'SCHOOL_SWIM') this.onEvent?.('school_swim');
      else if (st === 'IDLE') this.onEvent?.('idle');
      if (st !== 'FORAGE') { this.fgMode = 'pause'; this.fgT = 0; }
    }
    // the startle wave
    if (this.reactAt >= 0 && this.time >= this.reactAt) this.cStart(school.escapeHeadingFor(this, env));
    const escaping = this.escT >= 0;
    // until the wave reaches it, a fish carries on with what the school was doing
    const mode: HakuState = escaping ? 'ESCAPE' : st === 'ESCAPE' ? school.prevState : st;

    // ---------------------------------------------------------- neighbours
    const nb = school.neighbours(this, 7, 9 * tl);
    const sepR = tl * p.sep * (mode === 'ESCAPE' ? 0.85 : mode === 'FORAGE' ? 1.7 : mode === 'IDLE' ? 1.45 : 1.05) * (1 - 0.15 * school.alert);
    let sx = 0, sz = 0, ax = 0, az = 0, cx = 0, cz = 0, cy = 0, n = 0;
    for (const o of nb) {
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dy = this.pos.y - o.pos.y;
      const d = Math.hypot(dx, dz, dy * 1.5) || 1e-6;
      if (d < sepR) { const k = (1 - d / sepR); sx += (dx / d) * k * k; sz += (dz / d) * k * k; }
      ax += Math.sin(o.heading); az += Math.cos(o.heading);
      cx += o.pos.x; cz += o.pos.z; cy += o.pos.y; n++;
    }
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    // weights by state: [separation, alignment, cohesion, goal]
    const W: Record<HakuState, [number, number, number, number]> = {
      IDLE: [2.2, 0.35, 0.45, 0], SCHOOL_SWIM: [2.4, 1.1, 0.55, 0.7], SURFACE_SWIM: [2.4, 1.0, 0.6, 0.55], FORAGE: [1.8, 0.15, 0.3, 0], ESCAPE: [2.6, 1.7, 1.0, 0],
    };
    const [wS, wA, wC, wG] = W[mode];
    let dx = fx * 0.6, dz = fz * 0.6;   // inertia: keep going
    dx += sx * wS * 2; dz += sz * wS * 2;
    if (n) {
      const al = Math.hypot(ax, az) || 1;
      dx += (ax / al) * wA; dz += (az / al) * wA;
      const ccx = cx / n - this.pos.x, ccz = cz / n - this.pos.z, cl = Math.hypot(ccx, ccz);
      if (cl > tl * 0.3) { const k = wC * 1.4 * Math.min(1, cl / (2.5 * tl)); dx += (ccx / cl) * k; dz += (ccz / cl) * k; }
    }
    // no two fish hold quite the same line: each wanders a little about the school's heading
    if (mode !== 'ESCAPE') {
      const wob = (0.3 * Math.sin(this.time * (0.45 + 0.25 * p.turn) + p.wander) + 0.18 * Math.sin(this.time * 1.6 + p.wander * 2.3)) * (mode === 'IDLE' || mode === 'FORAGE' ? 0.9 : 0.45);
      const c = Math.cos(wob), s = Math.sin(wob);
      const rx = dx * c + dz * s, rz = -dx * s + dz * c;
      dx = rx; dz = rz;
    }
    // the school as a whole: stragglers are pulled back (and hurry), the front eases off
    const toC = this.tmp.set(school.center.x - this.pos.x, 0, school.center.z - this.pos.z);
    const cDist = toC.length(), rad = school.radius;
    if (cDist > rad) { const k = Math.min(2.5, (cDist - rad) / rad) * (mode === 'FORAGE' ? 0.9 : 1.4); dx += (toC.x / cDist) * k; dz += (toC.z / cDist) * k; }
    const along = cDist > 1e-4 ? (toC.x * fx + toC.z * fz) / Math.max(rad, 1e-3) : 0;

    let U = 0;   // desired speed (m/s)
    let turnMax = 5;
    let yTarget: number;
    const L = this.layer(env, this.pos.x, this.pos.z);
    const D = Math.max(0, L.surface - L.bottom);
    const bl = tl;   // one body length
    let peckPitch = 0;
    // breathing, the buccal pump: the mouth opens to draw water in while the gill covers are shut, then closes as they
    // swing open to drive it out over the gills; faster and wider after a burst
    this.effort = damp(this.effort, mode === 'ESCAPE' ? 1 : 0.3, mode === 'ESCAPE' ? 3 : 0.35, dt);
    this.breathPh += TAU * (2.2 + 1.8 * (this.effort - 0.3)) * dt;
    const br = this.breathPh + p.rollPhase;
    this.pose.jaw = damp(this.pose.jaw, (0.06 + 0.1 * this.effort) * (0.5 + 0.5 * Math.sin(br)), 12, dt);
    this.pose.oper = damp(this.pose.oper, this.effort * (0.5 + 0.5 * Math.sin(br - 2.3)), 12, dt);

    switch (mode) {
      case 'IDLE': {
        // station holding: face into the current and swim just hard enough to stay put
        const cur = school.current, cs = Math.hypot(cur.x, cur.z);
        if (cs > 0.003) { dx += (-cur.x / cs) * 1.1; dz += (-cur.z / cs) * 1.1; }
        else { const w = Math.sin(this.time * 0.35 + p.wander) * 0.8; dx += Math.sin(this.heading + w) * 0.4; dz += Math.cos(this.heading + w) * 0.4; }
        U = (0.45 * bl + cs * 0.95) * p.speed;
        turnMax = 2.6;
        yTarget = L.surface - clamp(0.4 * D, 0.015, 0.1) + p.depth * 0.25 * bl;
        break;
      }
      case 'SCHOOL_SWIM': case 'SURFACE_SWIM': {
        const g = school.goal;
        if (g) { const gx = g.x - this.pos.x, gz = g.z - this.pos.z, gl = Math.hypot(gx, gz) || 1; dx += (gx / gl) * wG; dz += (gz / gl) * wG; }
        const surf = mode === 'SURFACE_SWIM';
        U = (surf ? 2.8 : 3.6) * bl * p.speed * (1 + 0.6 * school.alert) * (1 + 0.35 * clamp(along, -1, 1)) * (1 + 0.12 * Math.sin(this.time * 0.8 + p.wander));
        turnMax = 4.5;
        yTarget = surf ? L.hi - 0.0006 * (1 + p.depth) : L.surface - clamp(0.3 * D, 0.012, 0.07) + p.depth * 0.3 * bl;
        if (surf) {
          // now and then a snout breaks the film
          this.sipT -= dt;
          if (this.sipT <= 0) { this.sipping = 0.3; this.sipT = 2 + Math.random() * 5; }
        }
        break;
      }
      case 'FORAGE': {
        const r = this.forage(dt, env, L, D);
        dx += r.dx; dz += r.dz; U = r.U; yTarget = r.y; peckPitch = r.pitch; turnMax = 4;
        break;
      }
      case 'ESCAPE': default: {
        const t = this.escT;
        this.escT += dt;
        const s = Math.pow(0.03 / Math.max(0.01, tl), 0.3);   // small fish are a little quicker
        const T1 = 0.05 * s, T2 = 0.065 * s, T3 = 0.32;
        // the escape heading, kept toward open water and away from the threat
        dx += Math.sin(this.escDir) * 2.4; dz += Math.cos(this.escDir) * 2.4;
        if (t < T1 + T2) {
          // stage 1: the C — the head whips round toward the escape, the body bent hard (72 % of the turn);
          // stage 2: the tail sweeps back through the other side and drives the fish off on its new heading
          const k = t < T1 ? t / T1 : 1;
          const rate = this.escTurn * (t < T1 ? 0.72 / T1 : 0.28 / T2);
          this.heading = wrap(this.heading + rate * dt);
          if (t + dt >= T1 + T2) this.heading = this.escDir;
          this.yawRate = rate;
          const cMax = 6.5 * Math.min(1, Math.abs(this.escTurn) / 1.4 + 0.35);
          this.pose.curv = t < T1 ? this.escSide * cMax * Math.sin((Math.PI / 2) * k) : this.escSide * cMax * (1 - 1.6 * ((t - T1) / T2));
          this.speed = t < T1 ? Math.max(this.speed, 4 * bl) : 22 * bl * p.speed * Math.min(1, (t - T1) / (0.4 * T2) + 0.3);
          this.pose.amp = 0.17;
          this.pose.phase += TAU * 30 * dt;
          this.pose.d1Fold = 1;
          this.pose.pecL = this.pose.pecR = 0;
          this.integrate(dt, school, env, L, L.surface - clamp(0.45 * D, 0.015, 0.15), 14);
          this.finishPose(dt, mode, 0, true);
          return;
        }
        // stage 3: burst and glide down to a fast school speed, then the school's tight regrouping flight
        const tb = t - T1 - T2;
        const burst = tb < T3 ? 1 - tb / T3 : 0;
        U = (9 + 13 * burst) * bl * p.speed * (school.state === 'ESCAPE' ? 1 : 0.7);
        turnMax = 9;
        yTarget = L.surface - clamp(0.45 * D, 0.015, 0.15) + p.depth * 0.3 * bl;
        if (school.state !== 'ESCAPE' && tb > T3) this.escT = -1;
        break;
      }
    }

    // ---------------------------------------------------------- the water's edge and the tank's glass
    const look = 0.04 + 0.35 * this.speed + 2 * bl;
    const need = Math.max(env.minDepth, 2.2 * this.depthBody);
    const depthAt = (x: number, z: number) => env.floor.waterAt(x, z) - env.floor.heightAt(x, z);
    const ahead = depthAt(this.pos.x + fx * look, this.pos.z + fz * look);
    if (ahead < need * 1.4) {
      const l = depthAt(this.pos.x + Math.sin(this.heading + 0.9) * look, this.pos.z + Math.cos(this.heading + 0.9) * look);
      const r = depthAt(this.pos.x + Math.sin(this.heading - 0.9) * look, this.pos.z + Math.cos(this.heading - 0.9) * look);
      const side = l >= r ? 1 : -1;
      const k = clamp((need * 1.4 - ahead) / need, 0.3, 2) * 2.5;
      dx += Math.sin(this.heading + side * 1.6) * k; dz += Math.cos(this.heading + side * 1.6) * k;
      U *= 0.75;
    }
    const b = env.bounds;
    if (b) {
      const m = 3 * bl;
      const px = this.pos.x, pz = this.pos.z;
      if (px > b.maxX - m) dx -= ((px - (b.maxX - m)) / m) * 4;
      if (px < b.minX + m) dx += (((b.minX + m) - px) / m) * 4;
      if (pz > b.maxZ - m) dz -= ((pz - (b.maxZ - m)) / m) * 4;
      if (pz < b.minZ + m) dz += (((b.minZ + m) - pz) / m) * 4;
    }

    // ---------------------------------------------------------- steering
    const want = Math.atan2(dx, dz);
    const turn = wrap(want - this.heading);
    const rateWant = clamp(turn * 7 * p.turn, -turnMax, turnMax);
    this.yawRate = damp(this.yawRate, rateWant, 14, dt);
    this.heading = wrap(this.heading + this.yawRate * dt);
    // a sharp turn costs speed
    U *= 1 - 0.35 * Math.min(1, Math.abs(turn) / 1.8);
    const accel = mode === 'ESCAPE' ? 2.5 : 0.9;   // m/s² (a 3 cm fish reaches cruise speed in a tenth of a second)
    this.speed = this.speed + clamp(U - this.speed, -accel * 1.5 * dt, accel * dt);
    this.integrate(dt, school, env, L, yTarget, mode === 'ESCAPE' ? 12 : 6);
    this.finishPose(dt, mode, peckPitch, false);
  }

  /** move: swimming plus the drift of the water, kept in the water and between bottom and surface */
  private integrate(dt: number, school: School, env: FishEnv, L: { lo: number; hi: number }, yTarget: number, w: number): void {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const cur = school.current;
    const cosP = Math.cos(this.pitch);
    let nx = this.pos.x + (fx * this.speed * cosP + cur.x) * dt;
    let nz = this.pos.z + (fz * this.speed * cosP + cur.z) * dt;
    const need = Math.max(env.minDepth, 1.6 * this.depthBody);
    const depthAt = (x: number, z: number) => env.floor.waterAt(x, z) - env.floor.heightAt(x, z);
    if (depthAt(nx, nz) < need && depthAt(this.pos.x, this.pos.z) >= need) {
      // slide along the edge rather than onto the sand, and turn away from it
      if (depthAt(nx, this.pos.z) >= need) nz = this.pos.z;
      else if (depthAt(this.pos.x, nz) >= need) nx = this.pos.x;
      else { nx = this.pos.x; nz = this.pos.z; }
      this.stuck += dt;
      this.yawRate += (this.stuck > 0.3 ? 9 : 4) * dt * 10 * (Math.sin(this.p.wander) > 0 ? 1 : -1);
      this.speed *= 0.6;
    } else this.stuck = 0;
    const b = env.bounds;
    if (b) { nx = clamp(nx, b.minX, b.maxX); nz = clamp(nz, b.minZ, b.maxZ); }
    this.pos.x = nx; this.pos.z = nz;
    // vertical: a critically damped spring toward the layer this state swims in
    const Lh = this.layer(env, nx, nz);
    const lo = Math.max(L.lo, Lh.lo) - (this.fgBottom && this.fgMode !== 'pause' ? 0.45 * this.depthBody : 0);
    const hi = Math.min(L.hi, Lh.hi) + (this.sipping > 0 ? 0.5 * this.depthBody : 0);
    const yt = lo > hi ? (lo + hi) / 2 : clamp(yTarget + (this.sipping > 0 ? 0.6 * this.depthBody : 0), lo, hi);
    // exact step of a critically damped spring: stable at any frame time
    const x0 = this.pos.y - yt, e = Math.exp(-w * dt), c = this.vy + w * x0;
    this.pos.y = yt + (x0 + c * dt) * e;
    this.vy = clamp((this.vy - w * c * dt) * e, -0.25, 0.25);
    const hardLo = Lh.bottom + 0.3 * this.depthBody, hardHi = Lh.surface - 0.25 * this.depthBody;
    if (hardLo < hardHi) this.pos.y = clamp(this.pos.y, hardLo, hardHi);
    else this.pos.y = (Lh.bottom + Lh.surface) / 2;
  }

  /** the foraging cycle: pick a spot on the bottom film or at the surface, ease up to it, peck, pause */
  private forage(dt: number, env: FishEnv, L: { bottom: number; surface: number }, D: number): { dx: number; dz: number; U: number; y: number; pitch: number } {
    const bl = this.tl;
    this.fgT -= dt;
    let dx = 0, dz = 0, U = 0.5 * bl, pitch = 0;
    let y = L.surface - clamp(0.35 * D, 0.015, 0.08);
    if (this.fgMode === 'pause') {
      U = 0.4 * bl;
      this.pose.pecL = this.pose.pecR = 0.6;
      if (this.fgT <= 0) {
        // the bottom's diatom film in shallow water, otherwise mostly what floats at the top
        this.fgBottom = Math.random() < (D < 0.25 ? 0.65 : 0.25);
        const a = this.heading + (Math.random() * 2 - 1) * 0.9, r = (2 + Math.random() * 3) * bl;
        const tx = this.pos.x + Math.sin(a) * r, tz = this.pos.z + Math.cos(a) * r;
        const Lt = this.layer(env, tx, tz);
        if (Lt.surface - Lt.bottom < 2 * this.depthBody) { this.fgT = 0.3; }
        else {
          this.fgTarget.set(tx, this.fgBottom ? Lt.bottom + 0.05 * bl : Lt.hi + 0.001, tz);
          this.fgMode = 'seek';
          this.fgT = 2.5;
        }
      }
      y = this.pos.y;
    } else if (this.fgMode === 'seek') {
      const gx = this.fgTarget.x - this.pos.x, gz = this.fgTarget.z - this.pos.z, gl = Math.hypot(gx, gz) || 1e-6;
      dx = (gx / gl) * 2.2; dz = (gz / gl) * 2.2;
      U = clamp(gl * 3, 0.6 * bl, 2 * bl);
      y = this.fgTarget.y + (this.fgBottom ? 0.35 * this.depthBody : 0);
      // the snout leads: the body tilts toward the spot as it closes in
      const dy = this.fgTarget.y - this.pos.y;
      pitch = clamp(Math.atan2(-dy, Math.max(gl, 0.3 * bl)) * 0.8, -0.75, 0.6);
      if ((gl < 0.45 * bl && Math.abs(dy) < 0.6 * bl) || this.fgT <= 0) { this.fgMode = 'peck'; this.fgT = 0.24; }
    } else {
      // the peck: a short lunge, mouth open, a twist that flashes the flank
      U = this.fgT > 0.12 ? 1.6 * bl : 0;
      y = this.fgTarget.y + (this.fgBottom ? 0.25 * this.depthBody : 0);
      pitch = this.fgBottom ? 0.55 : -0.35;
      this.pose.jaw = 1;
      if (this.fgT > 0.2) this.rollKick = (Math.random() < 0.5 ? -1 : 1) * 0.3;
      if (this.time - this.lastPeck > 1.5) { this.lastPeck = this.time; this.onEvent?.('forage'); }
      if (this.fgT <= 0) { this.fgMode = 'pause'; this.fgT = 0.3 + Math.random() * 0.9; }
    }
    return { dx, dz, U, y, pitch };
  }

  /** speed, turn and state into the swimming pose (wave, curvature, roll, fins) */
  private finishPose(dt: number, mode: HakuState, peckPitch: number, cstart: boolean): void {
    const pose = this.pose, bl = this.tl, ubl = this.speed / bl, p = this.p;
    this.sipping = Math.max(0, this.sipping - dt);
    // pitch: follow the climb or dive, the snout leading into a peck or up to the film
    const horiz = Math.max(this.speed, 0.6 * bl);
    let pitchWant = clamp(-Math.atan2(this.vy, horiz), -0.5, 0.5) + peckPitch;
    if (this.sipping > 0) { pitchWant -= 0.35; pose.jaw = Math.max(pose.jaw, 0.8); }
    this.pitch = damp(this.pitch, pitchWant, 8, dt);
    this.rollKick = damp(this.rollKick, 0, cstart ? 3 : 7, dt);
    const rollWant = clamp(-0.11 * this.yawRate, -0.45, 0.45) + 0.07 * Math.sin(this.time * 0.9 + p.rollPhase) + this.rollKick;
    this.roll = damp(this.roll, rollWant, 16, dt);
    if (cstart) return;
    // tail beat: frequency from speed (Bainbridge, U = L(0.75 f − 1)); at low speed, beat-and-coast
    const fWant = clamp((ubl + 1.2) / 0.75, 2.4, 30);
    let ampWant = clamp(0.055 + 0.0045 * ubl, 0.055, 0.15) * p.amp;
    const slow = mode === 'IDLE' || (mode === 'FORAGE' && this.fgMode !== 'seek');
    if (slow) {
      this.beatT -= dt;
      if (this.beatT <= 0) { this.beating = !this.beating; this.beatT = this.beating ? 0.25 + Math.random() * 0.35 : 0.35 + Math.random() * 0.8; }
      ampWant = this.beating ? 0.06 : 0.018;
    }
    pose.amp = damp(pose.amp, ampWant, 10, dt);
    pose.phase += TAU * fWant * dt;
    // the body follows the turn: path curvature × length, a little more since the head leads the turn
    const curvWant = clamp((1.7 * this.yawRate * bl) / Math.max(this.speed, 1.5 * bl), -3.2, 3.2);
    pose.curv = damp(pose.curv, curvWant, mode === 'ESCAPE' ? 25 : 12, dt);
    // fins: sculling pectorals at the hover, pressed to the flank at speed, spread to brake
    const braking = this.speed > 4 * bl && mode === 'IDLE';
    const pecWant = braking ? 0.95 : slow ? 0.55 : clamp(0.32 - 0.03 * ubl, 0.05, 0.3);
    pose.pecL = damp(pose.pecL, pecWant, 10, dt);
    pose.pecR = damp(pose.pecR, pecWant, 10, dt);
    pose.pecBeat = slow ? 0.35 * Math.sin(this.time * TAU * 4.2 + p.rollPhase) : 0.06 * Math.sin(pose.phase);
    pose.d1Fold = damp(pose.d1Fold, mode === 'ESCAPE' ? 1 : clamp((ubl - 3) / 6, 0, 1), 8, dt);
    pose.headBend = damp(pose.headBend, this.fgBottom && this.fgMode === 'peck' ? 0.2 : 0, 10, dt);
  }

  /** Startle: the wave reaches this fish `delay` seconds from now. */
  startle(delay: number): void {
    if (this.escT >= 0 && this.escT < 0.6) return;   // still in its own C-start
    const at = this.time + Math.max(0, delay);
    if (this.reactAt < 0 || at < this.reactAt) this.reactAt = at;
  }
}

/** A school of ハク: its members, its shared state, its goal and the water it is in. */
export class School {
  readonly members: HakuFish[] = [];
  state: HakuState = 'SCHOOL_SWIM';
  prevState: HakuState = 'SCHOOL_SWIM';
  stateStart = 0;
  stateEnd = 6;
  time = 0;
  goal: Vector3 | null = null;
  /** heading the school travels on (for the next goal) */
  travel = 0;
  readonly threat = new Vector3();
  readonly fleeTarget = new Vector3();
  hasFleeTarget = false;
  /** 0..1, raised by an escape: a tighter, faster school for a while */
  alert = 0;
  readonly center = new Vector3();
  radius = 0.05;
  readonly current = new Vector3();
  private readonly drift = new Vector3();
  private lastCenterAt = -1;
  private lastFlowAt = -1;
  private level = NaN;
  private levelRate = 0;
  /** flow speed per unit of tide rate (m/s per m/s) */
  static FLOW_GAIN = 360;
  private env: FishEnv | null = null;
  private readonly sorted: { f: HakuFish; d: number }[] = [];
  private readonly nb: HakuFish[] = [];

  constructor(readonly key: string, private readonly seed: number) {
    this.travel = (seed % 628) / 100;
  }

  /** the state is over and the next member's intent may choose another */
  get expired(): boolean {
    return this.time >= this.stateEnd && this.state !== 'ESCAPE';
  }

  add(f: HakuFish): void {
    if (!this.members.includes(f)) this.members.push(f);
  }

  remove(f: HakuFish): void {
    const i = this.members.indexOf(f);
    if (i >= 0) this.members.splice(i, 1);
  }

  /** the placed members' centre (members that never had a view are not where the school is) */
  placedCenter(out: Vector3): boolean {
    let n = 0;
    out.set(0, 0, 0);
    for (const m of this.members) if (m.placed) { out.add(m.pos); n++; }
    if (!n) return false;
    out.divideScalar(n);
    return true;
  }

  /** Advance the school's clock to `now` (any member's time) and refresh what is shared. */
  tick(now: number, env: FishEnv): void {
    if (now > this.time) this.time = now;
    if (this.time - this.lastCenterAt > 0.05 || this.lastCenterAt < 0) {
      const dtc = this.lastCenterAt < 0 ? 0 : this.time - this.lastCenterAt;
      this.lastCenterAt = this.time;
      this.env = env;
      this.placedCenter(this.center);
      const n = Math.max(1, this.members.length);
      const tl = this.members[0]?.tl ?? 0.025;
      // a school's radius for its numbers: about one body length per fish of spacing in a flattish layer
      this.radius = Math.max(2 * tl, 1.05 * tl * Math.sqrt(n) * (this.state === 'FORAGE' ? 1.6 : this.state === 'IDLE' ? 1.25 : 1) * (1 - 0.2 * this.alert));
      this.alert = Math.max(0, this.alert - dtc * 0.15);
    }
    if (this.time - this.lastFlowAt > 0.5 || this.lastFlowAt < 0) this.updateFlow(env);
    // the state runs out
    if (this.time >= this.stateEnd) {
      if (this.state === 'ESCAPE') {
        // regroup and keep going the way the escape went: a fast, tight school
        this.setState('SCHOOL_SWIM', 5 + Math.random() * 3);
        this.goal = this.aheadGoal(env, this.travel, 1.2);
        this.alert = 1;
      } else if (this.time >= this.stateEnd + 1.5) {
        // nobody asked for anything else: carry on a while
        this.stateEnd = this.time + 4;
        if (this.state === 'SCHOOL_SWIM' || this.state === 'SURFACE_SWIM') this.goal = this.aheadGoal(env, this.travel, 1);
      }
    }
    // travelling: the next leg when the school gets to its goal
    if ((this.state === 'SCHOOL_SWIM' || this.state === 'SURFACE_SWIM') && this.goal) {
      const gd = Math.hypot(this.goal.x - this.center.x, this.goal.z - this.center.z);
      if (gd < Math.max(0.15, this.radius)) {
        this.travel += (Math.random() * 2 - 1) * 0.7;
        this.goal = this.aheadGoal(env, this.travel, 0.8 + Math.random() * 0.8);
      } else this.travel = Math.atan2(this.goal.x - this.center.x, this.goal.z - this.center.z);
    }
  }

  /** a point `dist` ahead on heading `h` with water enough; turned toward the deeper side if not */
  aheadGoal(env: FishEnv, h: number, dist: number): Vector3 {
    let best: Vector3 | null = null, bestD = -1;
    for (const off of [0, 0.5, -0.5, 1.1, -1.1, 1.8, -1.8, Math.PI]) {
      const x = this.center.x + Math.sin(h + off) * dist, z = this.center.z + Math.cos(h + off) * dist;
      const d = env.floor.waterAt(x, z) - env.floor.heightAt(x, z);
      if (d >= 0.05) { best = new Vector3(x, 0, z); break; }
      if (d > bestD) { bestD = d; best = new Vector3(x, 0, z); }
    }
    const b = env.bounds;
    if (b && best) { best.x = clamp(best.x, b.minX, b.maxX); best.z = clamp(best.z, b.minZ, b.maxZ); }
    return best!;
  }

  /**
   * The water's slow movement: the tide's flow along the slope of the bed (in on the flood, out on the ebb, at a
   * speed from the rate the level is changing) plus a faint wind drift. Calm in tide pools and in tanks.
   */
  private updateFlow(env: FishEnv): void {
    const dtF = this.lastFlowAt < 0 ? 0 : this.time - this.lastFlowAt;
    this.lastFlowAt = this.time;
    const c = this.center, f = env.floor;
    const lvl = f.waterAt(c.x, c.z);
    if (Number.isFinite(this.level) && dtF > 0) {
      const dl = lvl - this.level;
      // a jump (a ticket, the debug clock) is not a current
      if (Math.abs(dl) > 0.02) this.levelRate = 0;
      else this.levelRate += (clamp(dl / dtF, -0.001, 0.001) - this.levelRate) * Math.min(1, dtF / 8);
    }
    this.level = lvl;
    const e = 0.5;
    const gx = (f.heightAt(c.x + e, c.z) - f.heightAt(c.x - e, c.z)) / (2 * e);
    const gz = (f.heightAt(c.x, c.z + e) - f.heightAt(c.x, c.z - e)) / (2 * e);
    const gl = Math.hypot(gx, gz);
    const depth = Math.max(0, lvl - f.heightAt(c.x, c.z));
    let sp = clamp(Math.abs(this.levelRate) * School.FLOW_GAIN, 0, 0.05) * clamp(depth / 0.3, 0.2, 1);
    if (env.bounds) sp = 0;
    // flood runs up the slope (shoreward), ebb down it
    const sgn = Math.sign(this.levelRate);
    const tx = gl > 1e-4 ? (gx / gl) * sgn * sp : 0, tz = gl > 1e-4 ? (gz / gl) * sgn * sp : 0;
    const wa = this.time * 0.013 + this.seed * 0.001;
    const ws = env.bounds ? 0.0015 : 0.004;
    this.drift.set(Math.sin(wa) * ws, 0, Math.cos(wa * 0.7) * ws);
    this.current.set(tx + this.drift.x, 0, tz + this.drift.z);
  }

  /**
   * A member's brain asks for a behaviour. The school takes it up only when its current state has run out (the first
   * to ask leads, the rest follow), or when `force`d (back to water that is deep enough, an alarmed school moving
   * off). Nothing but a new threat interrupts an escape.
   */
  request(state: HakuState, seconds: number, goal: Vector3 | null, force = false): boolean {
    if (this.state === 'ESCAPE' && this.time < this.stateEnd) { if (force && goal) this.goal = goal.clone(); return false; }
    if (!force && !this.expired) return false;
    const range: Record<HakuState, [number, number]> = { IDLE: [5, 20], SCHOOL_SWIM: [6, 18], FORAGE: [6, 16], SURFACE_SWIM: [6, 16], ESCAPE: [2.5, 4] };
    const [lo, hi] = range[state];
    this.setState(state, clamp(seconds > 0 ? seconds : (lo + hi) / 2, lo, hi));
    if (goal) { this.goal = goal.clone(); this.travel = Math.atan2(goal.x - this.center.x, goal.z - this.center.z); }
    else if ((state === 'SCHOOL_SWIM' || state === 'SURFACE_SWIM') && this.env) this.goal = this.aheadGoal(this.env, this.travel + (Math.random() * 2 - 1) * 0.8, 0.8 + Math.random());
    return true;
  }

  setState(s: HakuState, seconds: number): void {
    if (s !== this.state) this.prevState = this.state === 'ESCAPE' ? 'SCHOOL_SWIM' : this.state;
    this.state = s;
    this.stateStart = this.time;
    this.stateEnd = this.time + seconds;
  }

  /** The nearest `k` placed members within `r` of `f` (a fresh array view; do not keep it). */
  neighbours(f: HakuFish, k: number, r: number): HakuFish[] {
    const s = this.sorted;
    s.length = 0;
    const r2 = r * r;
    for (const m of this.members) {
      if (m === f || !m.placed) continue;
      const dx = m.pos.x - f.pos.x, dz = m.pos.z - f.pos.z, dy = m.pos.y - f.pos.y;
      const d = dx * dx + dz * dz + dy * dy;
      if (d > r2) continue;
      if (s.length < k) { s.push({ f: m, d }); s.sort((a, b) => a.d - b.d); }
      else if (d < s[k - 1].d) { s[k - 1] = { f: m, d }; s.sort((a, b) => a.d - b.d); }
    }
    this.nb.length = 0;
    for (const e of s) this.nb.push(e.f);
    return this.nb;
  }

  /**
   * A threat: the startle runs through the school from `origin` (the fish that reacted first) at STARTLE_WAVE, each
   * fish adding its own latency, and the school flees from `from` (toward `target` when the brain gave one).
   */
  startle(from: Vector3, origin: Vector3, target?: Vector3): void {
    this.threat.copy(from);
    if (target) { this.fleeTarget.copy(target); this.hasFleeTarget = true; } else this.hasFleeTarget = false;
    const wasEscaping = this.state === 'ESCAPE';
    if (!wasEscaping) this.setState('ESCAPE', 2.6 + Math.random() * 0.9);
    else this.stateEnd = Math.max(this.stateEnd, this.time + 2.2);
    this.alert = 1;
    // the school's new travel heading: away from the threat
    this.travel = Math.atan2(this.center.x - from.x, this.center.z - from.z);
    for (const m of this.members) {
      const d = Math.hypot(m.pos.x - origin.x, m.pos.z - origin.z);
      m.startle(m.p.latency + d / STARTLE_WAVE);
    }
  }

  /** Where one fish darts: away from the threat, fanned out from the school's middle, toward deeper water. */
  escapeHeadingFor(f: HakuFish, env: FishEnv): number {
    let ax = f.pos.x - this.threat.x, az = f.pos.z - this.threat.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al; az /= al;
    let dx = ax * 1.6, dz = az * 1.6;
    if (this.hasFleeTarget) {
      const tx = this.fleeTarget.x - f.pos.x, tz = this.fleeTarget.z - f.pos.z, tlen = Math.hypot(tx, tz) || 1;
      dx += (tx / tlen) * 0.8; dz += (tz / tlen) * 0.8;
    }
    // flash expansion: each fish also bursts outward from the school's middle
    const rx = f.pos.x - this.center.x, rz = f.pos.z - this.center.z, rl = Math.hypot(rx, rz);
    if (rl > 1e-4) { dx += (rx / rl) * 0.55; dz += (rz / rl) * 0.55; }
    let h = Math.atan2(dx, dz) + (Math.random() * 2 - 1) * 0.45;
    // not onto the sand
    const look = 0.25;
    const depth = (a: number) => env.floor.waterAt(f.pos.x + Math.sin(a) * look, f.pos.z + Math.cos(a) * look) - env.floor.heightAt(f.pos.x + Math.sin(a) * look, f.pos.z + Math.cos(a) * look);
    if (depth(h) < 0.03) {
      let best = h, bestD = depth(h);
      for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) { const d = depth(h + off); if (d > bestD + 0.005) { bestD = d; best = h + off; } }
      h = best;
    }
    const b = env.bounds;
    if (b) {
      // in a tank: away from the glass the fish is facing
      const nx = f.pos.x + Math.sin(h) * 0.05, nz = f.pos.z + Math.cos(h) * 0.05;
      if (nx < b.minX || nx > b.maxX || nz < b.minZ || nz > b.maxZ) h = Math.atan2((b.minX + b.maxX) / 2 - f.pos.x, (b.minZ + b.maxZ) / 2 - f.pos.z) + (Math.random() - 0.5);
    }
    return h;
  }
}

/** Live schools by key (one per spawn group, per scene). */
const schools = new Map<string, School>();

export function schoolFor(key: string, seed: number): School {
  let s = schools.get(key);
  if (!s) { s = new School(key, seed); schools.set(key, s); }
  return s;
}

export function releaseSchool(s: School): void {
  if (s.members.length === 0) schools.delete(s.key);
}

/** debug / tests */
export function liveSchools(): School[] {
  return [...schools.values()];
}
