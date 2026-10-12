import { Vector3, Vector4 } from 'three';
import type { Floor } from '../drivers/Driver';
import type { SurfUniforms } from '../../world/Surf';
import { smoothstep, surfEta } from '../../world/surfCpu';
import { waveOrbital } from '../../world/amamo/flow';
import type { AmamoUniforms } from '../../world/amamo/kit';

const G = 9.81;
/** the time step of the surf's rate of rise (s) */
const SURF_DT = 1 / 30;
/** below this the swell's to-and-fro is held by the bed (m of water) */
const SHALLOW = 0.1;

/** The water's motion at a point. */
export interface WaterSample {
  /** velocity (m/s) */
  ux: number;
  uy: number;
  uz: number;
  /** the bed under the point and the surface over it (the still level, the surf's rise and fall on it) (m) */
  bed: number;
  surface: number;
}

export interface WaterMotionOptions {
  /** the direction the waves travel (rad in the xz plane: (cos, sin)) */
  windDir: number;
  /** the swell's orbital speed at the surface (m/s, before gusts); 0: still water */
  swell: number;
  /** the surf of an open shore (null: a sheltered flat) */
  surf?: SurfUniforms | null;
}

/**
 * How the water moves under the waves, for what swims in it: the swell that sways the eelgrass (the same trains, the
 * same gusts — where there is a meadow its very clock, so a fish and the blades beside it go to and fro together) and, on an
 * open shore, the surf drawn by the water pass (surfCpu), each as a shallow-water wave: the water under a crest
 * moves with it at η·√(g/D), the rise and fall dies out toward the bed. Standing water above the tide (a pool) is calm.
 */
export class WaterMotion {
  /** the swell's clock, direction and strength (the eelgrass's uniforms' layout, so its flow code can read them) */
  private readonly swell = { uAmTime: { value: 0 }, uAmWave: { value: new Vector4(1, 0, 0, 0.6) } };
  /** the eelgrass's uniforms, on a flat that has a meadow: the swell keeps its clock and direction, in step with the blades */
  meadow: Pick<AmamoUniforms, 'uAmTime' | 'uAmWave'> | null = null;
  /** the water pass's clock (s): the surf's phase */
  time = 0;
  /** the tide's level (m): water standing above it is a pool, out of the waves' reach */
  still = -Infinity;
  private readonly tmp = new Vector3();

  constructor(private readonly opts: WaterMotionOptions) {
    this.swell.uAmWave.value.set(Math.cos(opts.windDir), Math.sin(opts.windDir), opts.swell, 0.6);
  }

  /** Advance the clocks: the water pass's time (s) and the tide's level (m); `gain` scales the swell (the breeze). */
  update(time: number, tideLevel: number, gain = 1, dt = 0): void {
    this.time = time;
    this.still = tideLevel;
    const w = this.swell.uAmWave.value, m = this.meadow;
    if (m) {
      this.swell.uAmTime.value = m.uAmTime.value;
      w.set(m.uAmWave.value.x, m.uAmWave.value.y, this.opts.swell * gain, m.uAmWave.value.w);
    } else {
      this.swell.uAmTime.value += dt;
      w.z = this.opts.swell * gain;
    }
  }

  /** The water's motion at (x, y, z) into `out` (all zero out of the water). */
  sample(floor: Floor, x: number, y: number, z: number, out: WaterSample): WaterSample {
    const bed = floor.heightAt(x, z), level = floor.waterAt(x, z), D = level - bed;
    out.ux = out.uy = out.uz = 0;
    out.bed = bed;
    out.surface = level;
    if (D <= 0) return out;
    // a pool left by the ebb lies still
    if (level > this.still + 0.005) return out;
    const h = Math.min(Math.max(y - bed, 0), D);
    const swell = this.swell;
    if (swell.uAmWave.value.z > 0) {
      const w = waveOrbital(swell, x, z, this.tmp);
      const held = Math.min(1, D / SHALLOW);
      out.ux += w.x * held;
      out.uz += w.y * held;
      out.uy -= h * w.z * held;
    }
    // (the surf is drawn out to the map's edge: it shoals from the open sea and breaks near the shore)
    const surf = this.opts.surf;
    if (surf && surf.uSurf.value.w > 0) {
      const t = this.time;
      const eta = surfEta(surf, x, z, level, t);
      const rate = (surfEta(surf, x, z, level, t + SURF_DT) - surfEta(surf, x, z, level, t - SURF_DT)) / (2 * SURF_DT);
      // under a crest the water runs shoreward, under a trough back out (and where the backwash has drained off the
      // sand there is no water left to carry anything)
      const wet = smoothstep(0.002, 0.01, D + eta);
      const c = wet * eta * Math.sqrt(G / Math.max(D, 0.05)), d = surf.uSurfDir.value;
      out.ux -= d.x * c;
      out.uz -= d.y * c;
      out.uy += wet * (h / D) * rate;
      out.surface = level + eta;
    }
    return out;
  }
}

/**
 * The share of the waves' motion a swimming animal follows: a fish holds its station against water moving at a few
 * of its lengths a second, so a 3 cm fry goes with the swell almost entirely and a 20 cm fish barely.
 */
export function carryFor(length_m: number): number {
  const r = length_m / 0.06;
  return 1 / (1 + r * r);
}

/** how fast a carried animal works its way back to its station near it (1/s), and how fast one that stops swimming settles */
const STATION = 0.6;
const SETTLE = 3;
/**
 * The rocking: the water's surges swing the apparent gravity and the body's keel hangs toward it (a fish's centre of
 * mass lies under its swim bladder). Shown larger than the bare physics (the fish's own steadying strokes make the
 * wobble read stronger), sprung and a little under-damped, and never past ~17°.
 */
const ROCK_GAIN = 3;
const ROCK_MAX = 0.3;
const ROCK_W = 7;
const ROCK_Z = 0.4;

/**
 * One swimming animal's ride on the water: each step the water at its place carries it by its share (carryFor), less
 * what it swims back toward its station, and the surges rock it. The driver adds `vel × dt` to the animal's position
 * (so the shadow, the camera and the net all follow) and `tiltX`, `tiltZ` to its attitude (YXZ Euler: X leans its
 * back forward, Z to its right).
 */
export class WaterRider {
  /** how far the water has carried it from where its own swimming would have put it (m) */
  readonly drift = new Vector3();
  /** this step's velocity from the water (m/s) */
  readonly vel = new Vector3();
  tiltX = 0;
  tiltZ = 0;
  /** the lean of its up vector toward world x and z, and the rates */
  private lx = 0;
  private lz = 0;
  private vlx = 0;
  private vlz = 0;
  private pux = 0;
  private puz = 0;
  private primed = false;
  private readonly s: WaterSample = { ux: 0, uy: 0, uz: 0, bed: 0, surface: 0 };

  /** back to rest (the animal was put somewhere new) */
  reset(): void {
    this.drift.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.lx = this.lz = this.vlx = this.vlz = 0;
    this.tiltX = this.tiltZ = 0;
    this.primed = false;
  }

  /**
   * One step for an animal of length `length` (m) at (x, y, z) facing `heading`. `share` scales its carry (0: holding on
   * to the bed, in the sand, out of the water: it settles back to its station and stops rocking); `minDepth` holds back
   * a carry toward water too shallow for it.
   */
  step(dt: number, water: WaterMotion | null | undefined, floor: Floor, x: number, y: number, z: number, heading: number, length: number, share = 1, minDepth = 0): this {
    const v = this.vel, d = this.drift;
    if (dt <= 0) { v.set(0, 0, 0); return this; }
    const carry = water && share > 0 ? share * carryFor(length) : 0;
    // how far it lets the water take it: a few of its lengths, and it swims back the harder the further it is taken,
    // so in the surf it is thrown to and fro but never jerked to a stop
    const reach = Math.min(0.2, 3 * length), ry = Math.min(0.1, 1.5 * length);
    let ux = 0, uy = 0, uz = 0;
    if (carry > 0 && water) {
      water.sample(floor, x, y, z, this.s);
      ux = carry * this.s.ux; uy = carry * this.s.uy; uz = carry * this.s.uz;
      const rh = Math.hypot(d.x, d.z) / reach, rv = d.y / ry;
      const kh = STATION * (1 + 12 * rh * rh), kv = STATION * (1 + 12 * rv * rv);
      v.set(ux - kh * d.x, uy - kv * d.y, uz - kh * d.z);
    } else {
      const k = Math.min(1 / dt, SETTLE);
      v.set(-k * d.x, -k * d.y, -k * d.z);
    }
    // (and never past a third more than that, however hard the surge)
    const nx = d.x + v.x * dt, nz = d.z + v.z * dt, r = Math.hypot(nx, nz), cap = 1.3 * reach;
    if (r > cap) { v.x = (nx * (cap / r) - d.x) / dt; v.z = (nz * (cap / r) - d.z) / dt; }
    const ny = d.y + v.y * dt;
    if (Math.abs(ny) > 1.3 * ry) v.y = (Math.sign(ny) * 1.3 * ry - d.y) / dt;
    // not carried onto water too shallow for it (it holds there against the flow)
    if (minDepth > 0 && (v.x !== 0 || v.z !== 0)) {
      const px = x + v.x * dt, pz = z + v.z * dt;
      const there = floor.waterAt(px, pz) - floor.heightAt(px, pz);
      if (there < minDepth && there < floor.waterAt(x, z) - floor.heightAt(x, z)) { v.x = 0; v.z = 0; }
    }
    d.addScaledVector(v, dt);
    // the surges: the acceleration of the water that carries it
    let ax = 0, az = 0;
    if (carry > 0 && this.primed) { ax = (ux - this.pux) / dt; az = (uz - this.puz) / dt; }
    this.pux = ux; this.puz = uz; this.primed = carry > 0;
    const tx = Math.max(-ROCK_MAX, Math.min(ROCK_MAX, (ax * ROCK_GAIN) / 9.81));
    const tz = Math.max(-ROCK_MAX, Math.min(ROCK_MAX, (az * ROCK_GAIN) / 9.81));
    const h = 1 / 60;
    for (let t = 0; t < dt - 1e-9; t += h) {
      const st = Math.min(h, dt - t);
      this.vlx += (ROCK_W * ROCK_W * (tx - this.lx) - 2 * ROCK_Z * ROCK_W * this.vlx) * st;
      this.vlz += (ROCK_W * ROCK_W * (tz - this.lz) - 2 * ROCK_Z * ROCK_W * this.vlz) * st;
      this.lx += this.vlx * st;
      this.lz += this.vlz * st;
    }
    // into the animal's frame: forward (sin h, cos h), its right (−cos h, sin h)
    const sh = Math.sin(heading), ch = Math.cos(heading);
    this.tiltX = this.lx * sh + this.lz * ch;
    this.tiltZ = -this.lx * ch + this.lz * sh;
    return this;
  }
}
