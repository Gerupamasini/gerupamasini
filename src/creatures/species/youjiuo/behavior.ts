import { Vector2, Vector3, Vector4 } from 'three';
import type { Rng } from '../../../core/Rng';
import type { Floor } from '../../drivers/Driver';
import type { AmamoUniforms } from '../../../world/amamo/kit';
import { shootFlow, shootLine, shootState, type ShootRef, type ShootState } from '../../../world/amamo/flow';
import { DORSAL_BONES, MODEL_TL, NSEG, PIVOT_K, STATIONS, S_HEAD, S_PIVOT, widthAt } from './anatomy';
import { chainFromBends, respace, restPose, type Pose } from './pose';

/**
 * ヨウジウオ behaviour: five states, the motion they make, and the pose for the rig.
 *
 *  IDLE_HOVER  in mid-water near the grass or the bed, inclined head-up; the dorsal fin buzzes in short bouts, the
 *              pectorals flutter, the body barely bends; carried to and fro by the waves, holding its place against
 *              the current
 *  SLOW_SWIM   gliding a few body lengths on the dorsal fin alone (13–26 Hz, a wave running back along it), the body
 *              nearly straight, turning by a gentle bend and the pectorals
 *  GRASS_HOLD  beside an eelgrass shoot, the body laid along the blade and swaying with it in step (the meadow's own
 *              motion, world/amamo/flow.ts: the same flow, the same lag up the blade), the tail tip hooked lightly
 *              round the sheath; fins all but still
 *  FORAGE      looking for small crustaceans with each eye on its own, stalking one slowly until it sits just above
 *              the snout's line, then the pivot strike: the head flicks up (~0.35 rad in ~10 ms), the snout widens and
 *              sucks the prey in, and the head settles back
 *  ESCAPE      a flinch, a turn away (a mild C-bend), a short burst with the body's own wave added to the fin, toward
 *              the densest grass near by, then into it to hold a blade and keep still; out in the open it drops low
 *              and keeps still instead
 */
export type YState = 'IDLE_HOVER' | 'SLOW_SWIM' | 'GRASS_HOLD' | 'FORAGE' | 'ESCAPE';

export interface FishEnv {
  floor: Floor;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** clock of the world (s), for still water without a meadow */
  t: number;
}

/** A small crustacean drifting near the fish (world space), the forage target. */
export interface Prey {
  pos: Vector3;
  alive: boolean;
  /** 0..1: being sucked in */
  taken: number;
  hopT: number;
  vel: Vector3;
}

interface Hold {
  ref: ShootRef;
  /** which flank faces the blade (±1) and which way the tail wraps */
  side: number;
  wrap: number;
  /** height along the blade where the tail hooks (m from the base) */
  anchor: number;
}

const tmp = new Vector3(), tmp2 = new Vector3(), tmp3 = new Vector3();
const v2 = new Vector2(), v2b = new Vector2();
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (x: number, target: number, rate: number, dt: number) => x + (target - x) * (1 - Math.exp(-rate * dt));

/** the strike's head lift (rad) and the head length (TL) */
const STRIKE = 0.36;
const HEAD_LEN = S_HEAD;
/** where the tail starts to wrap round the sheath (s) */
const S_CURL = 0.885;

/** Still water for a fish without a meadow (a tank, the viewer's studio): a slow swell, no current. */
function stillWater(): AmamoUniforms {
  return {
    uAmTime: { value: 0 }, uAmWater: { value: 0 }, uAmCurrent: { value: new Vector2() },
    uAmWave: { value: new Vector4(Math.cos(0.7), Math.sin(0.7), 0.035, 0.3) }, uAmSeaward: { value: new Vector2(0, 1) },
    uAmPush: { value: [] }, tAmSurf: { value: null }, uAmSurf: { value: new Vector2(1, 0) },
  };
}

export class Youjiuo {
  readonly tl: number;
  readonly scale: number;
  readonly rng: Rng;
  readonly pos = new Vector3();
  heading = 0;
  pitch = 0.2;
  speed = 0;
  yawRate = 0;
  state: YState = 'IDLE_HOVER';
  stateT = 0;
  sub = '';
  subT = 0;
  time = 0;
  /** seconds the current state should last (0: until done) */
  stateSecs = 0;
  done = true;
  alert = 0;
  placed = false;
  /** where to go (SLOW_SWIM) and from where the threat came (ESCAPE) */
  readonly goal = new Vector3();
  readonly threat = new Vector3();
  hold: Hold | null = null;
  holdW = 0;
  curl = 0;
  readonly prey: Prey = { pos: new Vector3(), alive: false, taken: 0, hopT: 0, vel: new Vector3() };
  /** the pose for the rig (model space) */
  readonly pose: Pose = restPose();
  onEvent: ((id: string) => void) | null = null;

  // the individual's way of holding itself
  private readonly bendSeed: number;
  /** its usual incline while hovering (rad, head up) */
  restPitch: number;
  // fins and body waves
  finHz = 0; finAmp = 0; private finPhase = 0;
  pecHz = 0; pecAmp = 0; private pecPhase = 0;
  private bodyPhase = 0; bodyAmp = 0; bodyHz = 0.4; bodyLambda = 0.9;
  private cBend = 0;
  private headPitchT = 0;
  private headYawT = 0;
  private boutT = 0;
  private boutOn = false;
  private readonly eyes = [{ fwd: 0, up: 0, tf: 0, tu: 0, next: 0 }, { fwd: 0, up: 0, tf: 0, tu: 0, next: 0 }];
  private readonly yawBend = new Float32Array(NSEG + 1);
  private readonly pitchBend = new Float32Array(NSEG + 1);
  private readonly freePts = Array.from({ length: NSEG + 1 }, () => new Vector3());
  private readonly holdPts = Array.from({ length: NSEG + 1 }, () => new Vector3());
  private readonly line = Array.from({ length: 64 }, () => new Vector3());
  private lineN = 0;
  private readonly freePos = new Vector3();
  private readonly holdPivot = new Vector3();
  private readonly holdUp = new Vector3();
  private readonly drift = new Vector3();
  private readonly still = stillWater();
  private readonly shoot: ShootState = { th: [0, 0, 0] } as unknown as ShootState;
  private readonly holdState: ShootState = { th: [0, 0, 0] } as unknown as ShootState;
  private readonly here: ShootRef;
  private hideAfter = false;
  /** the far tiers skip the fine parts of the pose */
  lod: 0 | 1 | 2 = 0;

  constructor(tl: number, rng: Rng) {
    this.tl = tl;
    this.scale = tl / MODEL_TL;
    this.rng = rng;
    this.bendSeed = rng.next() * 100;
    this.restPitch = rng.range(0.1, 0.42);
    this.heading = rng.range(-Math.PI, Math.PI);
    this.here = { x: 0, y: 0, z: 0, fan: 0, length: 0.5, sheath: 0.09, seed: rng.next(), width: 0.005, pool: -1e3 };
    for (const e of this.eyes) e.next = rng.range(0, 1);
    // condition: some fish are slim, some well fed (and a brooding male's trunk is no different: his pouch is on the tail)
    this.pose.girth = rng.range(0.94, 1.16);
  }

  private emit(id: string): void { this.onEvent?.(id); }

  private uniforms(env: FishEnv): AmamoUniforms {
    const m = env.floor.meadow;
    if (m) return m.kit.uniforms;
    const u = this.still;
    u.uAmTime.value = env.t;
    u.uAmWater.value = env.floor.waterAt(this.pos.x, this.pos.z);
    return u;
  }

  /** The water's velocity where the fish is (m/s): its steady part (current) and the waves' to-and-fro. */
  private water(env: FishEnv, outSteady: Vector2, outWave: Vector2): void {
    const u = this.uniforms(env);
    const h = this.here;
    h.x = this.pos.x; h.z = this.pos.z; h.y = env.floor.heightAt(h.x, h.z);
    h.length = 0.5;
    shootState(u, h, this.shoot);
    outSteady.set(this.shoot.cx, this.shoot.cz);
    shootFlow(u, this.shoot, 0, outWave).sub(outSteady);
  }

  // ---------------------------------------------------------------- states

  setState(s: YState, secs: number, sub = ''): void {
    const changed = s !== this.state;
    this.state = s;
    this.stateT = 0;
    this.stateSecs = secs;
    this.sub = sub;
    this.subT = 0;
    this.done = false;
    if (changed || s === 'ESCAPE' || s === 'FORAGE') {
      const id = s === 'IDLE_HOVER' ? 'idle_hover' : s === 'SLOW_SWIM' ? 'slow_swim' : s === 'GRASS_HOLD' ? 'grass_hold' : s === 'FORAGE' ? 'forage' : 'escape';
      this.emit(id);
    }
  }

  private setSub(sub: string): void { this.sub = sub; this.subT = 0; }

  /** Hover in mid-water. */
  hover(secs: number): void {
    this.releaseHold();
    this.setState('IDLE_HOVER', secs);
  }

  /** Swim slowly to a point (world). */
  swimTo(target: Vector3, secs: number): void {
    this.releaseHold();
    this.goal.copy(target);
    this.setState('SLOW_SWIM', secs);
  }

  /** Find a shoot near by and hold it; false when there is no eelgrass here. */
  holdGrass(env: FishEnv, secs: number, quick = false, away?: Vector3): boolean {
    const m = env.floor.meadow;
    const p = this.pos;
    let ref: ShootRef | null = null;
    if (m) {
      const near = m.shootsNear(p.x, p.z, 0.8 * Math.max(1, this.scale), 16).filter((s) => s.length > this.tl * 1.05 && s.y + Math.max(0.04, 0.5 * s.sheath) < env.floor.waterAt(s.x, s.z) - 0.05);
      if (near.length) {
        // not the nearest every time; out of the threat's way when there is one
        let best = near[0], bestScore = -1e9;
        for (const s of near.slice(0, 10)) {
          let score = this.rng.next() * 0.5 - Math.hypot(s.x - p.x, s.z - p.z) * 2;
          if (away) score += Math.hypot(s.x - away.x, s.z - away.z) * 3;
          if (score > bestScore) { bestScore = score; best = s; }
        }
        ref = { x: best.x, y: best.y, z: best.z, fan: best.fan, length: best.length, sheath: best.sheath, seed: best.seed, width: best.width, pool: best.pool };
      } else if (m.coverAt(p.x, p.z) > 0.25) {
        ref = this.virtualShoot(env);
      }
    } else if (env.floor.sampleAt?.(p.x, p.z)?.tags.includes('eelgrass')) {
      ref = this.virtualShoot(env);
    }
    if (!ref) return false;
    const side = this.rng.chance(0.5) ? 1 : -1;
    const depth = env.floor.waterAt(ref.x, ref.z) - ref.y;
    this.hold = {
      ref, side, wrap: this.rng.chance(0.5) ? 1 : -1,
      anchor: clamp(0.55 * ref.sheath, 0.03, Math.min(0.09, depth * 0.35)),
    };
    if (away) this.sideAway(away);
    this.setState('GRASS_HOLD', secs, quick ? 'approach_fast' : 'approach');
    return true;
  }

  /** a shoot where the meadow is not grown (camera far) or not modelled: built from the fish's own place */
  private virtualShoot(env: FishEnv): ShootRef {
    const p = this.pos;
    const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(0.03, 0.12) * this.scale;
    const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
    const y = env.floor.heightAt(x, z);
    const depth = env.floor.waterAt(x, z) - y;
    return { x, y, z, fan: this.rng.range(0, Math.PI), length: clamp(depth * 0.9, this.tl * 1.2, 0.9), sheath: this.rng.range(0.06, 0.12), seed: this.rng.next(), width: this.rng.range(0.004, 0.007), pool: -1e3 };
  }

  /** put the blade between the fish and a threat */
  private sideAway(from: Vector3): void {
    const h = this.hold;
    if (!h) return;
    const nx = -Math.sin(h.ref.fan), nz = Math.cos(h.ref.fan);
    const s = (from.x - h.ref.x) * nx + (from.z - h.ref.z) * nz;
    h.side = s > 0 ? -1 : 1;
  }

  releaseHold(): void {
    if (!this.hold) return;
    if (this.holdW > 0.01) {
      // take over the held posture as the free one (no pop)
      this.freePos.copy(this.pos);
      const P = this.pose.pts;
      tmp.subVectors(P[PIVOT_K - 1], P[PIVOT_K + 1]).normalize();
      const c = Math.cos(this.heading), s = Math.sin(this.heading);
      const wx = c * tmp.x + s * tmp.z, wz = -s * tmp.x + c * tmp.z;
      this.pitch = clamp(Math.asin(clamp(tmp.y, -1, 1)), -0.6, 1.2);
      if (Math.hypot(wx, wz) > 0.2) this.heading = Math.atan2(wx, wz);
    }
    this.hold = null;
    this.holdW = 0;
    this.curl = 0;
  }

  forage(secs: number): void {
    this.releaseHold();
    this.prey.alive = false;
    this.setState('FORAGE', secs, 'search');
  }

  /** Startled from `from` (world). */
  escape(env: FishEnv, from: Vector3): void {
    this.threat.copy(from);
    this.alert = 1;
    this.prey.alive = false;
    const wasHolding = !!this.hold && this.holdW > 0.5;
    this.releaseHold();
    this.chooseEscape(env, from, wasHolding);
    this.setState('ESCAPE', 0, 'flinch');
  }

  /** where to go: away from the threat, toward the densest grass close by */
  private chooseEscape(env: FishEnv, from: Vector3, short: boolean): void {
    const p = this.pos;
    const away = Math.atan2(p.x - from.x, p.z - from.z);
    const m = env.floor.meadow;
    const reach = (short ? 0.3 : 0.55) * Math.max(0.8, this.scale);
    let best = away, bestScore = -1e9;
    for (let i = -4; i <= 4; i++) {
      const a = away + i * 0.42;
      const x = p.x + Math.sin(a) * reach, z = p.z + Math.cos(a) * reach;
      const depth = env.floor.waterAt(x, z) - env.floor.heightAt(x, z);
      if (depth < 0.06) continue;
      const cover = m ? m.coverAt(x, z) : env.floor.sampleAt?.(x, z)?.tags.includes('eelgrass') ? 0.8 : 0;
      const score = 1.4 * cover + 0.8 * Math.cos(a - away) + 0.1 * this.rng.next();
      if (score > bestScore) { bestScore = score; best = a; }
    }
    this.goal.set(p.x + Math.sin(best) * reach, p.y, p.z + Math.cos(best) * reach);
    const cover = m ? m.coverAt(this.goal.x, this.goal.z) : 0;
    this.hideAfter = cover > 0.2 || (!m && !!env.floor.sampleAt?.(this.goal.x, this.goal.z)?.tags.includes('eelgrass'));
  }

  /** uneasy: keep still in the grass with the blade between it and the threat, or slip into the grass */
  uneasy(env: FishEnv, from: Vector3, secs: number): void {
    this.threat.copy(from);
    this.alert = Math.max(this.alert, 0.6);
    if (this.state === 'GRASS_HOLD' && this.hold) {
      // still settling: come round to the far side of the blade; settled: freeze where it is
      if (this.holdW < 0.4) this.sideAway(from);
      this.stateSecs = Math.max(this.stateSecs - this.stateT, secs) + this.stateT;
      this.done = false;
      return;
    }
    if (!this.holdGrass(env, secs, true, from)) this.hover(secs);
  }

  // ---------------------------------------------------------------- update

  update(dt: number, env: FishEnv): void {
    if (dt <= 0) return;
    this.time += dt;
    this.stateT += dt;
    this.subT += dt;
    this.alert = Math.max(0, this.alert - dt * 0.05);
    if (!this.placed || Number.isNaN(this.pos.y)) {
      const g = env.floor.heightAt(this.pos.x, this.pos.z), w = env.floor.waterAt(this.pos.x, this.pos.z);
      this.pos.y = clamp(g + 0.12 * this.scale, g + 0.5 * (w - g) * 0.4, Math.max(g + 0.01, w - 0.05));
      this.freePos.copy(this.pos);
      this.placed = true;
    }
    const steady = v2, wave = v2b;
    this.water(env, steady, wave);
    switch (this.state) {
      case 'IDLE_HOVER': this.doHover(dt, env); break;
      case 'SLOW_SWIM': this.doSwim(dt, env); break;
      case 'GRASS_HOLD': this.doHold(dt, env); break;
      case 'FORAGE': this.doForage(dt, env); break;
      case 'ESCAPE': this.doEscape(dt, env); break;
    }
    if (this.stateSecs > 0 && this.stateT > this.stateSecs && this.state !== 'ESCAPE' && this.sub !== 'strike') this.done = true;
    this.move(dt, env, steady, wave);
    this.fins(dt);
    this.eyesUpdate(dt);
    this.buildPose(dt, env);
    this.updatePrey(dt, env, wave);
  }

  private doHover(dt: number, env: FishEnv): void {
    // a hover is held by the fins alone: bouts of the dorsal fin, the pectorals all the time
    this.speed = approach(this.speed, 0, 2.5, dt);
    this.yawRate = approach(this.yawRate, 0.12 * Math.sin(this.time * 0.21 + this.bendSeed), 1.5, dt);
    this.heading = wrapA(this.heading + this.yawRate * dt);
    this.pitch = approach(this.pitch, this.restPitch + 0.12 * Math.sin(this.time * 0.13 + this.bendSeed), 0.6, dt);
    this.finBouts(dt, 12, 0.22);
    this.pecHz = 18; this.pecAmp = 0.18;
    this.bodyAmp = approach(this.bodyAmp, 0.006, 2, dt); this.bodyHz = 0.35; this.bodyLambda = 1.1;
    this.headLook(dt, 0.12, 0.1);
    void env;
  }

  /** dorsal-fin bouts: on for a while, off for a while (a hovering pipefish corrects its place in little buzzes) */
  private finBouts(dt: number, hz: number, amp: number): void {
    this.boutT -= dt;
    if (this.boutT <= 0) {
      this.boutOn = !this.boutOn;
      this.boutT = this.boutOn ? this.rng.range(0.4, 1.8) : this.rng.range(0.3, 1.4);
    }
    this.finHz = approach(this.finHz, this.boutOn ? hz : 0, 8, dt);
    this.finAmp = approach(this.finAmp, this.boutOn ? amp : 0.02, 8, dt);
  }

  private doSwim(dt: number, env: FishEnv): void {
    const p = this.pos;
    const dx = this.goal.x - p.x, dz = this.goal.z - p.z, dist = Math.hypot(dx, dz);
    const cruise = this.tl * clamp(0.35 + 0.35 * this.alert, 0.3, 0.8);
    const arrive = Math.max(0.03, this.tl * 0.3);
    const want = dist < arrive ? 0 : cruise * smooth(arrive, arrive + this.tl * 1.5, dist);
    this.speed = approach(this.speed, want, 1.2, dt);
    // turn toward the goal by a gentle bend (no faster than a slow pipefish can)
    const err = wrapA(Math.atan2(dx, dz) - this.heading);
    this.yawRate = approach(this.yawRate, clamp(err * 0.9, -0.7, 0.7), 3, dt);
    this.heading = wrapA(this.heading + this.yawRate * dt);
    // the body's incline follows the climb, mostly level while travelling
    const dy = this.goal.y - p.y;
    const climb = Math.atan2(dy, Math.max(dist, 0.05));
    this.pitch = approach(this.pitch, clamp(0.08 + 0.7 * climb, -0.35, 0.5), 1.0, dt);
    // the dorsal fin drives it: 13 Hz at a crawl to ~24 Hz at a body length a second
    const rel = this.speed / this.tl;
    this.finHz = approach(this.finHz, 13 + 11 * clamp(rel, 0, 1), 6, dt);
    this.finAmp = approach(this.finAmp, 0.3 + 0.12 * clamp(rel, 0, 1), 6, dt);
    this.pecHz = 20; this.pecAmp = 0.14 + 0.25 * Math.min(1, Math.abs(this.yawRate));
    this.bodyAmp = approach(this.bodyAmp, 0.01 + 0.006 * rel, 2, dt); this.bodyHz = 0.9 + 0.5 * rel; this.bodyLambda = 0.95;
    this.headLook(dt, 0.06, 0.05);
    if (dist < arrive && this.speed < this.tl * 0.05) this.done = true;
    void env;
  }

  private doHold(dt: number, env: FishEnv): void {
    const h = this.hold;
    if (!h) { this.hover(4); return; }
    // the target: the pivot's place on the blade, the posture along it
    this.computeHold(env);
    const p = this.pos;
    const fast = this.sub === 'approach_fast';
    if (this.sub === 'approach' || fast) {
      const dx = this.holdPivot.x - this.freePos.x, dy = this.holdPivot.y - this.freePos.y, dz = this.holdPivot.z - this.freePos.z;
      const dist = Math.hypot(dx, dy, dz);
      const near = Math.max(0.05, this.tl * 0.35);
      if (dist < near || this.subT > 12) { this.setSub(fast ? 'settle_fast' : 'settle'); }
      // swim there, taking on the blade's lean as it comes
      const want = this.tl * (fast ? 1.4 : 0.45) * smooth(0, near * 2, dist);
      this.speed = approach(this.speed, want, 2, dt);
      const err = wrapA(Math.atan2(dx, dz) - this.heading);
      this.yawRate = approach(this.yawRate, clamp(err * 1.2, -1.2, 1.2), 3, dt);
      this.heading = wrapA(this.heading + this.yawRate * dt);
      this.pitch = approach(this.pitch, clamp(Math.atan2(dy, Math.hypot(dx, dz)) * 0.6 + 0.3, -0.3, 0.8), 1.2, dt);
      this.finHz = approach(this.finHz, fast ? 24 : 18, 6, dt);
      this.finAmp = approach(this.finAmp, fast ? 0.42 : 0.3, 6, dt);
      this.pecHz = 20; this.pecAmp = 0.2;
      this.bodyAmp = approach(this.bodyAmp, fast ? 0.03 : 0.008, 3, dt); this.bodyHz = fast ? 3 : 0.9;
      this.headLook(dt, 0.05, 0.05);
      return;
    }
    if (this.sub === 'settle' || this.sub === 'settle_fast') {
      const rate = this.sub === 'settle_fast' ? 1.6 : 0.75;
      this.holdW = Math.min(1, this.holdW + dt * rate);
      if (this.holdW > 0.55) this.curl = Math.min(1, this.curl + dt * rate * 1.1);
      this.speed = approach(this.speed, 0, 3, dt);
      this.finHz = approach(this.finHz, 12, 4, dt);
      this.finAmp = approach(this.finAmp, 0.12, 3, dt);
      this.pecHz = 16; this.pecAmp = 0.16;
      if (this.holdW >= 1 && this.curl >= 1) this.setSub('hold');
    } else {
      // holding: still but for a little buzz now and then, the eyes busy
      this.speed = 0;
      this.finBouts(dt, 11, this.alert > 0.4 ? 0.02 : 0.08);
      if (this.alert > 0.4) { this.finAmp = approach(this.finAmp, 0, 6, dt); }
      this.pecHz = 14; this.pecAmp = this.alert > 0.4 ? 0.03 : 0.1;
      // creep up or down the blade now and then
      if (this.rng.chance(dt * 0.05)) h.anchor = clamp(h.anchor + this.rng.range(-0.02, 0.025), 0.025, Math.max(0.03, Math.min(0.12, (env.floor.waterAt(h.ref.x, h.ref.z) - h.ref.y) * 0.35)));
    }
    this.bodyAmp = approach(this.bodyAmp, 0, 2, dt);
    this.headLook(dt, 0.08, 0.12);
    p.copy(this.freePos).lerp(this.holdPivot, smooth(0, 1, this.holdW));
  }

  private doForage(dt: number, env: FishEnv): void {
    const prey = this.prey;
    const occ = this.occiput(tmp);
    switch (this.sub) {
      case 'search': {
        this.doHover(dt, env);
        if (this.subT > this.rng.range(0.8, 2.6) || this.subT > 2.6) {
          this.spawnPrey(env);
          this.setSub('stalk');
        }
        break;
      }
      case 'stalk': {
        if (!prey.alive) { this.setSub('search'); break; }
        // aim so the prey sits STRIKE above the snout's line, a head length from the occiput
        tmp2.subVectors(prey.pos, occ);
        const d = tmp2.length();
        const hd = Math.hypot(tmp2.x, tmp2.z);
        const yawTo = Math.atan2(tmp2.x, tmp2.z);
        const elev = Math.atan2(tmp2.y, hd);
        const err = wrapA(yawTo - this.heading);
        this.yawRate = approach(this.yawRate, clamp(err * 1.6, -0.6, 0.6), 4, dt);
        this.heading = wrapA(this.heading + this.yawRate * dt);
        this.pitch = approach(this.pitch, clamp(elev - STRIKE * 0.9, -0.5, 0.9), 1.6, dt);
        const reach = HEAD_LEN * MODEL_TL * this.scale * 1.08;
        const gap = d - reach;
        this.speed = approach(this.speed, clamp(gap * 1.2, -this.tl * 0.1, this.tl * 0.3), 3, dt);
        this.finHz = approach(this.finHz, 12 + 8 * smooth(0, this.tl * 0.3, gap), 5, dt);
        this.finAmp = approach(this.finAmp, 0.22, 5, dt);
        this.pecHz = 22; this.pecAmp = 0.22;
        this.bodyAmp = approach(this.bodyAmp, 0.002, 3, dt);
        this.headPitchT = 0; this.headYawT = 0;
        const aim = Math.abs(err) < 0.14 && Math.abs(elev - this.pitch - STRIKE) < 0.16;
        if ((Math.abs(gap) < reach * 0.25 && aim) || this.subT > 9) {
          this.setSub('strike');
          this.emit('strike');
          if (this.rng.chance(0.18)) {
            // the copepod's escape jump: away before the mouth arrives
            tmp2.set(this.rng.range(-1, 1), this.rng.range(0, 1), this.rng.range(-1, 1)).normalize().multiplyScalar(0.035 * Math.max(0.7, this.scale));
            prey.pos.add(tmp2);
          } else prey.taken = 0.0001;
        }
        break;
      }
      case 'strike': {
        // the pivot: ~10 ms up, the snout widened, the prey drawn in
        this.speed = 0;
        this.headPitchT = STRIKE;
        if (this.subT > 0.06) this.setSub('recover');
        break;
      }
      case 'recover': {
        this.headPitchT = 0;
        this.finHz = approach(this.finHz, 8, 4, dt);
        if (this.subT > 0.5) {
          if (this.stateSecs > 0 && this.stateT > this.stateSecs) { this.done = true; this.setSub('search'); }
          else this.setSub('search');
        }
        break;
      }
    }
  }

  private doEscape(dt: number, env: FishEnv): void {
    const p = this.pos;
    const dx = this.goal.x - p.x, dz = this.goal.z - p.z, dist = Math.hypot(dx, dz);
    const toGoal = Math.atan2(dx, dz);
    switch (this.sub) {
      case 'flinch':
        // a twitch: the fins stop, the body stiffens, the eyes snap toward the threat
        this.finAmp = approach(this.finAmp, 0, 30, dt);
        this.speed = approach(this.speed, 0, 6, dt);
        if (this.subT > 0.08) { this.setSub('turn'); this.cBend = Math.sign(wrapA(toGoal - this.heading)) || 1; }
        break;
      case 'turn': {
        // round toward the cover in a quarter of a second, the body in a shallow C, the snout dipping
        const err = wrapA(toGoal - this.heading);
        this.yawRate = clamp(err * 9, -9, 9);
        this.heading = wrapA(this.heading + this.yawRate * dt);
        this.pitch = approach(this.pitch, -0.12, 6, dt);
        this.speed = approach(this.speed, this.tl * 1.2, 6, dt);
        this.finHz = 26; this.finAmp = 0.45;
        if (this.subT > 0.24 || Math.abs(err) < 0.1) this.setSub('dart');
        break;
      }
      case 'dart': {
        // a short burst: the body's own wave added to the fin
        const err = wrapA(toGoal - this.heading);
        this.yawRate = approach(this.yawRate, clamp(err * 3, -3, 3), 8, dt);
        this.heading = wrapA(this.heading + this.yawRate * dt);
        this.speed = approach(this.speed, Math.min(0.55, this.tl * 3.2), 7, dt);
        this.pitch = approach(this.pitch, 0, 3, dt);
        this.finHz = 26; this.finAmp = 0.45;
        this.bodyAmp = approach(this.bodyAmp, 0.13, 10, dt); this.bodyHz = 6; this.bodyLambda = 0.75;
        if (dist < this.tl * 0.35 || this.subT > 1.1) this.setSub('glide');
        break;
      }
      case 'glide': {
        this.speed = approach(this.speed, 0, 3.5, dt);
        this.bodyAmp = approach(this.bodyAmp, 0.004, 5, dt); this.bodyHz = 1;
        this.finHz = approach(this.finHz, 10, 4, dt); this.finAmp = approach(this.finAmp, 0.1, 4, dt);
        this.yawRate = approach(this.yawRate, 0, 4, dt);
        this.heading = wrapA(this.heading + this.yawRate * dt);
        if (this.subT > 0.5) {
          // into the grass and hold still there; out in the open, low and still
          if (!(this.hideAfter && this.holdGrass(env, this.rng.range(12, 25), true, this.threat))) {
            this.setState('IDLE_HOVER', this.rng.range(6, 12));
            this.restLow = true;
          }
        }
        break;
      }
    }
    this.pecHz = 26; this.pecAmp = this.sub === 'dart' ? 0.05 : 0.2;
    this.headPitchT = 0;
  }
  private restLow = false;

  // ---------------------------------------------------------------- motion

  private move(dt: number, env: FishEnv, steady: Vector2, wave: Vector2): void {
    const p = this.pos;
    const holding = this.state === 'GRASS_HOLD' && this.sub !== 'approach' && this.sub !== 'approach_fast';
    if (!holding) {
      const cp = Math.cos(this.pitch);
      p.x += Math.sin(this.heading) * cp * this.speed * dt;
      p.z += Math.cos(this.heading) * cp * this.speed * dt;
      p.y += Math.sin(this.pitch) * this.speed * dt;
      // the waves carry it to and fro; against the current it holds its ground (only part of it shows)
      const carry = this.state === 'ESCAPE' ? 0.4 : 0.85;
      this.drift.set(wave.x * carry + steady.x * 0.12, 0, wave.y * carry + steady.y * 0.12);
      p.addScaledVector(this.drift, dt);
      // in the water: under the surface, off the bed (the posture decides how much room the body needs)
      const ground = env.floor.heightAt(p.x, p.z), surface = env.floor.waterAt(p.x, p.z);
      const depth = surface - ground;
      const reach = 0.42 * this.tl;
      const maxPitch = Math.asin(clamp((depth - 0.03) / Math.max(reach * 2, 1e-3), 0, 1));
      this.pitch = clamp(this.pitch, -maxPitch, maxPitch);
      const up = Math.sin(this.pitch) * (S_PIVOT * this.tl) + 0.012 * this.scale;
      const down = Math.sin(this.pitch) * ((1 - S_PIVOT) * this.tl);
      const lowest = this.restLow && this.state === 'IDLE_HOVER' ? 0.02 * this.scale : 0.035 * this.scale;
      const lo = ground + Math.max(lowest, down + 0.01 * this.scale);
      const hi = surface - Math.max(0.012, up);
      if (!this.placed || Number.isNaN(p.y)) { p.y = lo + (hi - lo) * 0.35; this.placed = true; }
      // the band it likes: among the lower blades, a hand above the bed
      if (this.state === 'IDLE_HOVER' || this.state === 'SLOW_SWIM' || this.state === 'FORAGE') {
        const pref = clamp(ground + (this.restLow ? 0.04 : 0.12) * Math.max(1, this.scale), lo, hi);
        p.y = approach(p.y, pref, this.state === 'SLOW_SWIM' ? 0.2 : 0.35, dt);
      }
      p.y = hi < lo ? 0.5 * (lo + hi) : clamp(p.y, lo, hi);
      if (env.bounds) {
        const b = env.bounds, mx = 0.3 * this.tl;
        p.x = clamp(p.x, b.minX + mx, b.maxX - mx);
        p.z = clamp(p.z, b.minZ + mx, b.maxZ - mx);
      }
      this.freePos.copy(p);
    }
    if (this.state !== 'IDLE_HOVER') this.restLow = false;
  }

  /** the occiput's world position (the head's pivot) */
  occiput(out: Vector3): Vector3 {
    const d = (S_PIVOT - S_HEAD) * this.tl;
    const cp = Math.cos(this.pitch);
    return out.set(this.pos.x + Math.sin(this.heading) * cp * d, this.pos.y + Math.sin(this.pitch) * d, this.pos.z + Math.cos(this.heading) * cp * d);
  }
  /** the snout tip's world position (from the pose) */
  snoutTip(out: Vector3): Vector3 {
    const P = this.pose.pts;
    tmp3.subVectors(P[0], P[1]).normalize();
    const hp = this.pose.headPitch;
    // the head's line, lifted by the head's own pitch
    tmp2.copy(this.pose.up).addScaledVector(tmp3, -this.pose.up.dot(tmp3)).normalize();
    out.copy(tmp3).multiplyScalar(Math.cos(hp)).addScaledVector(tmp2, Math.sin(hp)).multiplyScalar(HEAD_LEN * MODEL_TL).add(P[0]);
    return this.toWorld(out);
  }
  /** model → world */
  toWorld(v: Vector3): Vector3 {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const x = v.x * this.scale, z = v.z * this.scale;
    return v.set(this.pos.x + c * x + s * z, this.pos.y + v.y * this.scale, this.pos.z - s * x + c * z);
  }
  /** world → model */
  toModel(v: Vector3): Vector3 {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const x = v.x - this.pos.x, z = v.z - this.pos.z;
    return v.set((c * x - s * z) / this.scale, (v.y - this.pos.y) / this.scale, (s * x + c * z) / this.scale);
  }

  private headLook(dt: number, yaw: number, pitch: number): void {
    if (this.rng.chance(dt * 0.4)) { this.headYawT = this.rng.range(-yaw, yaw); this.headPitchT = this.rng.range(-pitch * 0.3, pitch); }
  }

  // ---------------------------------------------------------------- fins and eyes

  private fins(dt: number): void {
    const pose = this.pose;
    // the dorsal fin's wave: shown at up to ~12 Hz (the fin's real 13–26 Hz would strobe at the frame rate; the
    // amplitude carries the rest), running back along the fin about 1.4 waves to its length
    const cap = this.lod === 0 ? 12.5 : 7;
    const vis = Math.min(this.finHz, cap);
    this.finPhase = (this.finPhase + 2 * Math.PI * vis * dt) % (Math.PI * 200);
    for (let i = 0; i < DORSAL_BONES; i++) {
      const u = i / (DORSAL_BONES - 1);
      const env = Math.pow(Math.sin(Math.PI * (0.12 + 0.76 * u)), 0.6);
      pose.dorsal[i] = this.finAmp * env * Math.sin(this.finPhase - 2 * Math.PI * 1.4 * u);
    }
    pose.dorsalRaise = approach(pose.dorsalRaise, this.state === 'ESCAPE' && this.sub === 'flinch' ? 0.6 : this.finAmp < 0.05 && this.state === 'GRASS_HOLD' ? 0.82 : 1, 6, dt);
    const pv = Math.min(this.pecHz, this.lod === 0 ? 11 : 6);
    this.pecPhase = (this.pecPhase + 2 * Math.PI * pv * dt) % (Math.PI * 200);
    const fold = this.state === 'ESCAPE' && this.sub === 'dart' ? 0.12 : 0.5;
    pose.pecL = approach(pose.pecL, fold + this.pecAmp * Math.sin(this.pecPhase), 25, dt);
    pose.pecR = approach(pose.pecR, fold + this.pecAmp * Math.sin(this.pecPhase + 2.2), 25, dt);
    pose.caudal = approach(pose.caudal, this.state === 'GRASS_HOLD' && this.curl > 0.5 ? 0.78 : this.state === 'ESCAPE' ? 1.05 : 1, 3, dt);
  }

  private eyesUpdate(dt: number): void {
    const pose = this.pose;
    const fix = this.state === 'FORAGE' && (this.sub === 'stalk' || this.sub === 'strike') && this.prey.alive;
    const threat = this.state === 'ESCAPE' && this.sub === 'flinch';
    for (let i = 0; i < 2; i++) {
      const e = this.eyes[i];
      e.next -= dt;
      if (fix) {
        // both eyes on the prey: forward and up toward it
        tmp.subVectors(this.prey.pos, this.occiput(tmp2));
        const elev = Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)) - this.pitch;
        e.tf = 0.62; e.tu = clamp(elev * 0.8, -0.2, 0.45);
      } else if (threat) {
        e.tf = 0.1; e.tu = 0.15;
      } else if (e.next <= 0) {
        // each eye on its own: a new look every half second to few seconds
        e.next = this.rng.range(0.35, 2.6);
        e.tf = this.rng.range(-0.35, 0.55);
        e.tu = this.rng.range(-0.15, 0.32);
      }
      // saccades are quick
      e.fwd = approach(e.fwd, e.tf, 28, dt);
      e.up = approach(e.up, e.tu, 28, dt);
    }
    pose.eyeL[0] = this.eyes[0].fwd; pose.eyeL[1] = this.eyes[0].up;
    pose.eyeR[0] = this.eyes[1].fwd; pose.eyeR[1] = this.eyes[1].up;
  }

  // ---------------------------------------------------------------- pose

  private buildPose(dt: number, env: FishEnv): void {
    const pose = this.pose;
    const t = this.time;
    // body bends: a slow, small wave (a pipefish's trunk is armoured: it barely bends while the fin drives it), the
    // turn, the individual's own gentle curve, and in an escape the C-bend and the swimming wave
    this.bodyPhase = (this.bodyPhase + 2 * Math.PI * this.bodyHz * dt) % (Math.PI * 200);
    const turnBend = clamp(this.yawRate * 0.012, -0.05, 0.05);
    const cOn = this.state === 'ESCAPE' && this.sub === 'turn' ? Math.sin(Math.PI * clamp(this.subT / 0.24, 0, 1)) : 0;
    for (let k = 1; k < NSEG; k++) {
      const s = STATIONS[k];
      const tailE = Math.pow(clamp((s - 0.2) / 0.8, 0, 1), 1.3);
      const wave = this.bodyAmp * (0.25 + 1.6 * tailE) * Math.sin(this.bodyPhase - (2 * Math.PI * s) / this.bodyLambda) * (STATIONS[k + 1] - STATIONS[k - 1]) * 8;
      const own = 0.012 * Math.sin(this.bendSeed + s * 7.5 + 0.25 * Math.sin(t * 0.17 + this.bendSeed)) * (this.state === 'ESCAPE' ? 0.3 : 1);
      const c = cOn * this.cBend * 0.11 * Math.exp(-Math.pow((s - 0.45) / 0.3, 2));
      this.yawBend[k] = wave + turnBend + own + c;
      // a hovering pipefish lets the rear of the tail hang a little; when travelling it is straight
      this.pitchBend[k] = (this.state === 'IDLE_HOVER' ? -0.01 : -0.003) * smooth(0.5, 0.95, s);
    }
    chainFromBends(this.freePts, this.pitch, 0, this.yawBend, this.pitchBend);
    const P = pose.pts;
    const w = this.state === 'GRASS_HOLD' ? smooth(0, 1, this.holdW) : 0;
    if (w > 0 && this.hold) {
      for (let k = 0; k <= NSEG; k++) {
        tmp.copy(this.holdPts[k]);
        this.toModel(tmp);
        P[k].copy(this.freePts[k]).lerp(tmp, w);
      }
      // keep the pivot at the root (the root is the pivot)
      tmp.copy(P[PIVOT_K]);
      for (const q of P) q.sub(tmp);
      respace(P);
      tmp.copy(this.holdUp);
      const c = Math.cos(this.heading), s = Math.sin(this.heading);
      const ux = c * tmp.x - s * tmp.z, uz = s * tmp.x + c * tmp.z;
      pose.up.set(ux * w, tmp.y * w + (1 - w), uz * w);
    } else {
      for (let k = 0; k <= NSEG; k++) P[k].copy(this.freePts[k]);
      pose.up.set(0, 1, 0);
    }
    // the head: looking about, the strike's flick (instant up, eased back), the suction
    const striking = this.state === 'FORAGE' && this.sub === 'strike';
    pose.headPitch = striking ? approach(pose.headPitch, this.headPitchT, 400, dt) : approach(pose.headPitch, this.headPitchT, 7, dt);
    pose.headYaw = approach(pose.headYaw, this.headYawT, 3, dt);
    pose.snout = striking ? Math.min(1, pose.snout + dt * 60) : approach(pose.snout, 0, 9, dt);
    pose.jaw = striking ? Math.min(1, pose.jaw + dt * 80) : approach(pose.jaw, 0, 12, dt);
  }

  /** The held posture in world space: the body laid along the blade, the tail tip hooked round the sheath. */
  private computeHold(env: FishEnv): void {
    const h = this.hold!;
    const u = this.uniforms(env);
    const ref = h.ref;
    const S = shootState(u, ref, this.holdState);
    const tl = this.tl;
    const need = h.anchor + (S_CURL - STATIONS[0]) * tl + 0.02;
    const step = 0.01;
    this.lineN = shootLine(u, ref, S, step, Math.min(need, step * (this.line.length - 2)), this.line);
    const L = this.line, n = this.lineN;
    const fx = Math.cos(ref.fan), fz = Math.sin(ref.fan);
    const at = (len: number, out: Vector3, tan: Vector3) => {
      const f = clamp(len / step, 0, n - 1.0001), i = Math.floor(f), r = f - i;
      out.copy(L[i]).lerp(L[i + 1], r);
      tan.subVectors(L[i + 1], L[i]).normalize();
      return out;
    };
    const N = tmp3;
    for (let k = 0; k <= NSEG; k++) {
      const s = STATIONS[k];
      const q = this.holdPts[k];
      const half = 0.5 * widthAt(s) * tl;
      if (s <= S_CURL) {
        at(h.anchor + (S_CURL - s) * tl, q, tmp2);
        // offset across the blade's face, perpendicular to it
        N.set(-fz * h.side, 0, fx * h.side).addScaledVector(tmp2, -(-fz * h.side * tmp2.x + fx * h.side * tmp2.z)).normalize();
        q.addScaledVector(N, 0.5 * ref.width + half + 0.0006);
      } else {
        // the hook: round the sheath, sinking a little so it does not meet itself
        const arc = (s - S_CURL) * tl;
        const rc = 0.65 * ref.width + half + 0.0008;
        const drop = arc * (1 - 0.86 * this.curl);
        at(Math.max(0.004, h.anchor - drop), q, tmp2);
        const phi = this.curl * (arc / rc) * h.wrap * 0.92;
        const nx = -fz * h.side, nz = fx * h.side;
        const bx = fx * h.side, bz = fz * h.side;
        q.x += rc * (Math.cos(phi) * nx + Math.sin(phi) * bx);
        q.z += rc * (Math.cos(phi) * nz + Math.sin(phi) * bz);
      }
    }
    this.holdPivot.copy(this.holdPts[PIVOT_K]);
    // the back faces along the blade's width (the flank lies against the blade's face, as a blade's own profile)
    this.holdUp.set(fx * h.side, 0.05, fz * h.side);
    // the approach heads for the pivot, then the root rides there
    if (this.sub !== 'approach' && this.sub !== 'approach_fast') {
      tmp.subVectors(this.holdPts[PIVOT_K - 1], this.holdPts[PIVOT_K + 1]);
      if (Math.hypot(tmp.x, tmp.z) > 0.02 * tl && this.holdW < 0.2) this.heading = Math.atan2(tmp.x, tmp.z);
    }
  }

  // ---------------------------------------------------------------- prey

  private spawnPrey(env: FishEnv): void {
    const prey = this.prey;
    const tip = this.snoutTip(tmp);
    const a = this.heading + this.rng.range(-0.6, 0.6);
    const d = this.rng.range(0.045, 0.09) * Math.max(0.8, this.scale);
    prey.pos.set(tip.x + Math.sin(a) * d, tip.y + this.rng.range(0.0, 0.035) * this.scale, tip.z + Math.cos(a) * d);
    const ground = env.floor.heightAt(prey.pos.x, prey.pos.z), surface = env.floor.waterAt(prey.pos.x, prey.pos.z);
    prey.pos.y = clamp(prey.pos.y, ground + 0.02, surface - 0.02);
    prey.alive = true;
    prey.taken = 0;
    prey.hopT = this.rng.range(0.3, 1.2);
    prey.vel.set(0, 0, 0);
  }

  private updatePrey(dt: number, env: FishEnv, wave: Vector2): void {
    const prey = this.prey;
    if (!prey.alive) return;
    if (prey.taken > 0) {
      // drawn into the mouth in a few milliseconds
      prey.taken += dt / 0.02;
      const tip = this.snoutTip(tmp);
      prey.pos.lerp(tip, clamp(prey.taken, 0, 1));
      if (prey.taken >= 1) { prey.alive = false; this.emit('swallow'); }
      return;
    }
    // a copepod: sinks, drifts with the water, hops now and then
    prey.hopT -= dt;
    if (prey.hopT <= 0) {
      prey.hopT = this.rng.range(0.4, 1.6);
      prey.vel.set(this.rng.range(-1, 1), this.rng.range(-0.3, 1), this.rng.range(-1, 1)).normalize().multiplyScalar(0.05);
    }
    prey.vel.multiplyScalar(Math.exp(-dt * 9));
    prey.pos.x += (prey.vel.x + wave.x * 0.9) * dt;
    prey.pos.z += (prey.vel.z + wave.y * 0.9) * dt;
    prey.pos.y += (prey.vel.y - 0.002) * dt;
    const ground = env.floor.heightAt(prey.pos.x, prey.pos.z);
    if (prey.pos.y < ground + 0.01) prey.pos.y = ground + 0.01;
  }
}
