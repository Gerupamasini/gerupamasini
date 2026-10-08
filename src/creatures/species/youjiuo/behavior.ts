import { Vector2, Vector3, Vector4 } from 'three';
import type { Rng } from '../../../core/Rng';
import type { Floor } from '../../drivers/Driver';
import type { AmamoUniforms } from '../../../world/amamo/kit';
import { shootFlow, shootLine, shootState, type ShootRef, type ShootState } from '../../../world/amamo/flow';
import { DORSAL_BONES, MODEL_TL, NSEG, PIVOT_K, STATIONS, S_CAUDAL, S_HEAD, S_PIVOT, depthAt, widthAt } from './anatomy';
import { SEG_LEN, chainFromBends, restPose, type Pose } from './pose';

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
  /** height along the shoot where the coil begins (m from the base), and how far it may creep */
  anchor: number;
  lo: number;
  hi: number;
  /** where it is creeping to along the shoot (m from the base) */
  goal: number;
  /**
   * How the tail holds: 'cling', pressed along the shoot and curled a little way round it, or 'hook', the rear of the
   * tail wound loosely round the sheath, half a turn to a turn. `wrapA`: how far round the shoot the tail goes (rad); `alpha`: the slope of
   * the wound tail from level (rad, a steep helix); `ease`: the length over which it leaves the body's line (m);
   * `sCurl`: where along the body the curl begins.
   */
  mode: 'cling' | 'hook';
  wrapA: number;
  alpha: number;
  ease: number;
  sCurl: number;
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
/**
 * Each part's share of a bend 0..1. The trunk's bony rings are wide, carry the gut and the dorsal fin's base, and its
 * front vertebrae are stiffened: it takes a little (0.15 behind the head to 0.35 at the vent). The tail takes the
 * most, evenly along its length (a pipefish's tail, unlike a seahorse's, is no more pliant at the tip).
 */
function flex(s: number): number {
  return s < 0.4 ? 0.15 + 0.2 * smooth(0.115, 0.4, s) : 0.35 + 0.65 * smooth(0.4, 0.52, s);
}
/** turning: the bend per unit turning rate (rad/TL per rad/s, as a fraction of KAPPA_MAX) — the tail ~40° at 40°/s */
const TURN_GAIN = 0.3;
/** the most a turn bends (fraction of KAPPA_MAX): the tail ~130° in the tightest slow turn */
const TURN_MAX = 0.7;
/**
 * The most a joint of the tail bends (rad per TL): the armoured tail of a pipefish takes ~300° bent all along its
 * length at most (Neutens et al. 2014), ~9 rad per TL; a little under that in life.
 */
const KAPPA_MAX = 6.5;
/** an escape's C-bend at its height (rad per TL, times the share): with the turn, 90–150° head to tail */
const C_BEND = 1.2;
/** spacing of the shoot's line points (m) */
const LINE_STEP = 0.01;
/** clearance between the tail and the sheath (m) */
const GAP = 0.0004;
/** the curl begins no further forward than this (s): it uses at most the rear half of the body */
const S_COIL_MIN = 0.45;
/** the tightest the tail curls, radius in TL (~300° over the whole tail at most) */
const R_MIN = 0.1;
/** how often a rest in the grass is a loose wind round the sheath rather than a cling (no data: a minority) */
const HOOK_SHARE = 0.3;

/**
 * The sheath as the shader draws it (AM_SHEATH_DEFORM): a flattened tube round the shoot's axis, half-axes `a` along
 * W (across the lean) and `b` across that, wider and fibrous at the foot, tapering a little to the mouth; above its
 * mouth, the blades. Its half-extent at a height (m from the base) toward a unit direction with cosine `cw` to W and
 * `cn` to the other axis.
 */
function sheathExtent(ref: ShootRef, len: number, cw: number, cn: number): number {
  const hs = ref.sheath;
  const foot = 1 - smooth(0, 0.025, len);
  const sv = Math.min(len, hs);
  const a = ref.width * (0.6 + 0.3 * foot) * (1 - (0.12 * sv) / hs);
  const b = 0.0016 + ref.width * (0.17 + 0.25 * foot);
  const e = 1 / Math.sqrt((cw / a) ** 2 + (cn / b) ** 2);
  const above = smooth(hs, hs + 0.012, len);
  return e * (1 - above) + 0.5 * ref.width * above;
}
/** the sheath's largest half-extent at a height (for planning) */
const sheathRadius = (ref: ShootRef, len: number): number => Math.max(sheathExtent(ref, len, 1, 0), sheathExtent(ref, len, 0, 1));

// per-joint constants (k = 1 … NSEG-1): each joint's share of the length, its pliancy, the turning spring's frequency,
// the body wave's weight, the hanging tail's sag; per station: the half-width and half-depth (TL)
const DS = Float32Array.from(STATIONS, (_, k) => (k > 0 && k < NSEG ? 0.5 * (STATIONS[k + 1] - STATIONS[k - 1]) : 0));
const FLEX = Float32Array.from(STATIONS, (s) => flex(s));
const W0 = Float32Array.from(STATIONS, (s) => 18 - 13.5 * smooth(0.3, 1.0, s));
const WAVE = Float32Array.from(STATIONS, (s) => 0.1 + 1.7 * smooth(0.38, 0.7, s));
const SAG = Float32Array.from(STATIONS, (s) => smooth(0.5, 0.95, s));
const HALF_W = Float32Array.from(STATIONS, (s) => 0.5 * widthAt(Math.min(s, S_CAUDAL)));
const HALF_D = Float32Array.from(STATIONS, (s) => 0.5 * depthAt(Math.min(s, S_CAUDAL)));

const segDirs = Array.from({ length: NSEG }, () => new Vector3());
const sa = new Vector3(), sb = new Vector3(), sc = new Vector3();
/** unit direction from a to b by t along the great circle (b may be opposite a) */
function slerpDir(a: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const d = clamp(a.dot(b), -1, 1);
  if (d > 0.9995) return out.copy(a).lerp(b, t).normalize();
  const th = Math.acos(d), st = Math.sin(th);
  if (st < 1e-4) {
    // opposite: turn about any axis across a
    sc.set(1, 0, 0).cross(a);
    if (sc.lengthSq() < 1e-6) sc.set(0, 1, 0).cross(a);
    sc.normalize();
    return out.copy(a).applyAxisAngle(sc, Math.PI * t);
  }
  const ka = Math.sin((1 - t) * th) / st, kb = Math.sin(t * th) / st;
  return out.copy(a).multiplyScalar(ka).addScaledVector(b, kb).normalize();
}
/**
 * Blend two centrelines (both with the pivot at the origin) segment by segment by direction, toward `b` by the weight
 * at each station, and lay the result out from the pivot at the segments' lengths. (Blending positions and then
 * re-spacing shortens the chords where the two differ much, and the re-spacing can then fold a segment back.)
 */
function blendChains(out: Vector3[], a: Vector3[], b: Vector3[], w: Float32Array | number): void {
  for (let k = 0; k < NSEG; k++) {
    const t = typeof w === 'number' ? w : 0.5 * (w[k] + w[k + 1]);
    sa.subVectors(a[k], a[k + 1]).normalize();
    sb.subVectors(b[k], b[k + 1]).normalize();
    slerpDir(sa, sb, t, segDirs[k]);
  }
  out[PIVOT_K].set(0, 0, 0);
  for (let k = PIVOT_K - 1; k >= 0; k--) out[k].copy(out[k + 1]).addScaledVector(segDirs[k], SEG_LEN[k]);
  for (let k = PIVOT_K; k < NSEG; k++) out[k + 1].copy(out[k]).addScaledVector(segDirs[k], -SEG_LEN[k]);
}
/** carry a vector across from one segment direction to another by the least turn between them (parallel transport) */
function transport(v: Vector3, from: Vector3, to: Vector3, out: Vector3): Vector3 {
  sc.crossVectors(from, to);
  const sn = sc.length(), cs = from.dot(to);
  out.copy(v);
  if (sn < 1e-6) return cs > 0 ? out : out.negate();
  return out.applyAxisAngle(sc.divideScalar(sn), Math.atan2(sn, cs));
}
/**
 * The back's direction across the segment `d`, turned from `a` toward `b` by t about d (a roll, never through a
 * back that points nowhere, as a straight blend of two near-opposite vectors would).
 */
function rollBlend(a: Vector3, b: Vector3, t: number, d: Vector3, out: Vector3, memo: { th: number }): Vector3 {
  sa.copy(a).addScaledVector(d, -a.dot(d));
  sb.copy(b).addScaledVector(d, -b.dot(d));
  if (sb.lengthSq() < 1e-8) return out.copy(sa).normalize();
  if (sa.lengthSq() < 1e-8) return out.copy(sb).normalize();
  sa.normalize(); sb.normalize();
  // the angle between the two backs, taken the same way round as last frame (near half a turn apart, the shorter
  // way flips from one side to the other)
  let th = Math.atan2(sc.crossVectors(sa, sb).dot(d), sa.dot(sb));
  if (Number.isFinite(memo.th)) th += 2 * Math.PI * Math.round((memo.th - th) / (2 * Math.PI));
  memo.th = th;
  th *= t;
  return out.copy(sa).multiplyScalar(Math.cos(th)).addScaledVector(sc.crossVectors(d, sa), Math.sin(th));
}

/** Still water for a fish without a meadow (a tank, the viewer's studio): a slow swell, no current. */
function stillWater(): AmamoUniforms {
  return {
    uAmTime: { value: 0 }, uAmWater: { value: 0 }, uAmCurrent: { value: new Vector2() },
    uAmWave: { value: new Vector4(Math.cos(0.7), Math.sin(0.7), 0.035, 0.3) }, uAmSeaward: { value: new Vector2(0, 1) },
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
  /** the turn's bend at each joint (rad) and its rate: each joint a damped spring, stiff in the trunk, slow at the tail tip */
  private readonly turnY = new Float32Array(NSEG + 1);
  private readonly turnYV = new Float32Array(NSEG + 1);
  private readonly turnP = new Float32Array(NSEG + 1);
  private readonly turnPV = new Float32Array(NSEG + 1);
  private lastPitch = Number.NaN;
  private pitchRate = 0;
  /** a held posture being let go of (model space, the pivot at the origin), and seconds since (-1: none) */
  private readonly relPts = Array.from({ length: NSEG + 1 }, () => new Vector3());
  private readonly relUp = new Vector3(0, 1, 0);
  private readonly relW = new Float32Array(NSEG + 1);
  private readonly rollRel = { th: Number.NaN };
  private readonly dFree = new Vector3();
  private readonly upFree = new Vector3();
  private readonly upHold = new Vector3();
  private readonly rollHold = { th: Number.NaN };
  private readonly holdModel = Array.from({ length: NSEG + 1 }, () => new Vector3());
  private relT = -1;
  private relFast = false;
  private readonly freePts = Array.from({ length: NSEG + 1 }, () => new Vector3());
  private readonly holdPts = Array.from({ length: NSEG + 1 }, () => new Vector3());
  private readonly line = Array.from({ length: 64 }, () => new Vector3());
  private lineN = 0;
  private readonly freePos = new Vector3();
  private readonly lineT = Array.from({ length: 64 }, () => new Vector3());
  private readonly fC = new Vector3();
  private readonly fT = new Vector3();
  private readonly fN = new Vector3();
  private readonly fB = new Vector3();
  private readonly fU = new Vector3();
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
  holdGrass(env: FishEnv, secs: number, quick = false, away?: Vector3, grip?: 'cling' | 'hook'): boolean {
    if (this.state === 'GRASS_HOLD' && this.hold && this.holdW > 0.5 && !away && !grip) {
      // already resting on a shoot: a fresh rest is the same rest
      this.stateSecs = Math.max(this.stateSecs - this.stateT, secs) + this.stateT;
      this.done = false;
      return true;
    }
    const m = env.floor.meadow;
    const p = this.pos;
    // standing along a shoot needs the fish's length of water over the sand
    const stand = (x: number, y: number, z: number) => env.floor.waterAt(x, z) - y > S_CAUDAL * this.tl + 0.035;
    let ref: ShootRef | null = null;
    if (m) {
      const near = m.shootsNear(p.x, p.z, 0.8 * Math.max(1, this.scale), 16).filter((s) => s.length > this.tl * 1.05 && s.y + Math.max(0.04, 0.5 * s.sheath) < env.floor.waterAt(s.x, s.z) - 0.05 && stand(s.x, s.y, s.z));
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
    if (!ref || !stand(ref.x, ref.y, ref.z)) return false;
    // letting go of a shoot it held: unwind from it (the tail last) on the way to the next
    this.releaseHold(quick);
    const side = this.rng.chance(0.5) ? 1 : -1;
    const depth = env.floor.waterAt(ref.x, ref.z) - ref.y;
    this.hold = this.planCoil(ref, side, depth, grip);
    if (away) this.sideAway(away);
    this.setState('GRASS_HOLD', secs, quick ? 'approach_fast' : 'approach');
    return true;
  }

  /**
   * How the tail will hold this shoot. A ヨウジウオ's tail is armoured and fairly stiff: pipefishes of this genus have
   * no prehensile tail, and bent by hand the whole tail of a pipefish takes ~300° (a seahorse's ~800°), evenly along
   * its length, so it curls no tighter than a radius of ~0.1 TL (Neutens et al. 2014). Mostly it rests along the
   * shoot with the end of the tail pressed against it and curled a little way round (cling); in a minority of rests
   * (no more in a current: a Syngnathus held on no more often as the flow rose, Castejón-Silvo et al. 2021) the rear
   * of the tail is wound loosely round the sheath, half a turn to a turn, in a steep helix crossing the shoot at
   * ~25–35° (hook; as in a photograph of a bay pipefish wound round a blade). The slope is set so that the helix's
   * radius of curvature, r / cos²α, is no tighter than the tail allows. The caudal fan is left free.
   */
  private planCoil(ref: ShootRef, side: number, depth: number, grip?: 'cling' | 'hook'): Hold {
    const tl = this.tl;
    const rng = this.rng;
    let hook = grip ? grip === 'hook' : rng.chance(HOOK_SHARE);
    const r = sheathRadius(ref, 0.6 * ref.sheath) + 0.5 * depthAt(0.8) * tl + GAP;
    // the shallowest slope (from level) at which the helix is no tighter than the tail can bend
    const aMin = Math.acos(Math.sqrt(Math.min(1, r / (R_MIN * tl))));
    // high enough on the sheath that the tail, still straight down as it first takes hold, clears the sand
    const hi = Math.max(0.012, Math.min(ref.sheath - 0.005, 0.15));
    const room = Math.min(hi - 0.018, (S_CAUDAL - S_COIL_MIN) * tl);
    const plan = (wrapA: number, alpha: number) => {
      // long enough that leaving the body's line bends the tail no more than ~6 rad per TL
      const ease = Math.max(clamp((0.25 * (wrapA * r)) / Math.cos(alpha), 0.06 * tl, 0.035 * Math.max(1, tl / 0.2)), ((0.5 * Math.PI - alpha) * tl) / 6);
      let phiE = 0;
      for (let i = 0; i < 16; i++) {
        const x = ((i + 0.5) / 16) * ease;
        phiE += (Math.cos(alpha + (0.5 * Math.PI - alpha) * (1 - smooth(0, ease, x))) * (ease / 16)) / r;
      }
      return { ease, phiE, len: ease + (Math.max(0, wrapA - phiE) * r) / Math.cos(alpha) };
    };
    let alpha = hook ? aMin + rng.range(0, 0.08) : Math.max(aMin, rng.range(1.1, 1.25));
    let wrapA = hook ? rng.range(Math.PI, 2 * Math.PI) : rng.range(0.35, 1.0);
    let p = plan(wrapA, alpha);
    if (p.len > room) {
      // a short sheath or a shallow shoot: wind less (and only cling if not even half a turn fits)
      wrapA = Math.max(0.2, p.phiE + ((room - p.ease) * Math.cos(alpha)) / r);
      if (hook && wrapA < 0.5 * Math.PI) { hook = false; alpha = Math.max(aMin, 1.15); wrapA = Math.min(wrapA, 0.8); }
      p = plan(wrapA, alpha);
    }
    const sCurl = Math.max(S_COIL_MIN, S_CAUDAL - p.len / tl);
    // and low enough that the body above it, up to the snout, stays under the surface (the shoot's line runs along the
    // surface past it, and the body would fold there); holdGrass only takes shoots in water deep enough for both
    const top = Math.max(0.012, Math.min(hi, depth - 0.015 - sCurl * tl));
    const lo = Math.min(top, 0.018 + (S_CAUDAL - sCurl) * tl);
    const anchor = clamp(rng.range(0.55, 0.9) * ref.sheath, lo, top);
    return { ref, side, wrap: rng.chance(0.5) ? 1 : -1, anchor, lo, hi: top, goal: anchor, mode: hook ? 'hook' : 'cling', wrapA, alpha, ease: p.ease, sCurl };
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

  releaseHold(fast = false): void {
    if (!this.hold) return;
    if (this.holdW > 0.01) {
      // take over the held posture as the free one (no pop): the pivot's line becomes heading and pitch, and the whole
      // held shape is kept to unwind from (the tail lets go of the sheath last)
      this.freePos.copy(this.pos);
      const P = this.pose.pts;
      tmp.subVectors(P[PIVOT_K - 1], P[PIVOT_K + 1]).normalize();
      const h0 = this.heading;
      const c = Math.cos(h0), s = Math.sin(h0);
      const wx = c * tmp.x + s * tmp.z, wz = -s * tmp.x + c * tmp.z;
      this.pitch = clamp(Math.asin(clamp(tmp.y, -1, 1)), -0.6, 1.2);
      if (Math.hypot(wx, wz) > 0.2) this.heading = Math.atan2(wx, wz);
      // model space at the old heading → world orientation → model space at the new one
      const d = this.heading - h0, cd = Math.cos(d), sd = Math.sin(d);
      const turn = (from: Vector3, to: Vector3) => to.set(cd * from.x - sd * from.z, from.y, sd * from.x + cd * from.z);
      for (let k = 0; k <= NSEG; k++) turn(P[k], this.relPts[k]);
      turn(this.pose.up, this.relUp);
      this.relT = 0;
      this.relFast = fast;
      this.lastPitch = this.pitch;
      this.yawRate = 0;
      this.turnY.fill(0); this.turnYV.fill(0); this.turnP.fill(0); this.turnPV.fill(0);
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
    this.releaseHold(true);
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
    this.computeHold(env, dt);
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
    // on the shoot it no longer turns of itself (the shoot turns it)
    this.yawRate = approach(this.yawRate, 0, 4, dt);
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
      // creep up or down the shoot now and then, slowly, the curl sliding with it (not while it hides)
      if (this.alert > 0.4) h.goal = h.anchor;
      else if (this.rng.chance(dt * 0.05)) h.goal = clamp(h.anchor + this.rng.range(-0.012, 0.012), h.lo, h.hi);
      const creep = clamp(h.goal - h.anchor, -0.004 * dt, 0.004 * dt);
      h.anchor += creep;
      if (Math.abs(creep) > 1e-6) { this.pecAmp = 0.18; this.finAmp = Math.max(this.finAmp, 0.1); }
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
      // just let go of a shoot: the held pivot may lie outside the band a straight body needs; ease into it
      const easing = this.relT >= 0;
      // the band it likes: among the lower blades, a hand above the bed
      if (this.state === 'IDLE_HOVER' || this.state === 'SLOW_SWIM' || this.state === 'FORAGE') {
        const pref = clamp(ground + (this.restLow ? 0.04 : 0.12) * Math.max(1, this.scale), lo, hi);
        p.y = approach(p.y, pref, this.state === 'SLOW_SWIM' ? 0.2 : 0.35, dt);
      }
      const band = hi < lo ? 0.5 * (lo + hi) : clamp(p.y, lo, hi);
      p.y = easing ? approach(p.y, band, 9, dt) : band;
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

  /**
   * The turn's bend. A pipefish's trunk is a box of bony rings and barely bends; the long tail is far more pliant.
   * Turning, the fish swings the head and trunk round and the tail follows behind, bending into the turn (head and tail
   * both toward its inside), more toward the tip and later the further back. Each joint is a damped spring pulled
   * toward a bend set by the turning rate and the joint's pliancy, quick in the trunk, slow at the tail's end; as the
   * turn eases the tail swings straight again with a little overshoot. The same for climbing and diving.
   */
  private turning(dt: number): void {
    if (Number.isNaN(this.lastPitch)) this.lastPitch = this.pitch;
    const pr = clamp((this.pitch - this.lastPitch) / Math.max(dt, 1e-4), -6, 6);
    this.lastPitch = this.pitch;
    this.pitchRate = approach(this.pitchRate, pr, 12, dt);
    const yr = this.yawRate, pr2 = this.pitchRate;
    // held fast to the shoot, the free posture does not matter; keep it relaxed
    const holding = this.state === 'GRASS_HOLD' && this.holdW > 0.98;
    const h = Math.min(dt, 1 / 30);
    const gy = holding ? 0 : clamp(TURN_GAIN * yr, -TURN_MAX, TURN_MAX) * KAPPA_MAX;
    const gp = holding ? 0 : clamp(TURN_GAIN * 0.6 * pr2, -TURN_MAX, TURN_MAX) * KAPPA_MAX * 0.6;
    for (let k = 1; k < NSEG; k++) {
      const ds = DS[k], f = FLEX[k];
      const cap = (0.6 + KAPPA_MAX * f) * ds;
      const ty = f * gy * ds, tp = f * gp * ds;
      // natural frequency: ~18 rad/s in the trunk, ~4.5 at the tail tip, so the bend reaches the tail's end a few
      // tenths of a second after it shows behind the vent, and leaves it last; semi-implicit Euler (stable here)
      const w0 = W0[k], z = 0.72;
      this.turnYV[k] += (w0 * w0 * (ty - this.turnY[k]) - 2 * z * w0 * this.turnYV[k]) * h;
      this.turnY[k] = clamp(this.turnY[k] + this.turnYV[k] * h, -cap, cap);
      this.turnPV[k] += (w0 * w0 * (tp - this.turnP[k]) - 2 * z * w0 * this.turnPV[k]) * h;
      this.turnP[k] = clamp(this.turnP[k] + this.turnPV[k] * h, -cap * 0.6, cap * 0.6);
    }
  }

  private buildPose(dt: number, env: FishEnv): void {
    const pose = this.pose;
    const t = this.time;
    // body bends, as curvature (rad per TL) times each joint's share of the length: a slow, small wave (a pipefish's
    // trunk is armoured: it barely bends while the fin drives it), the individual's own gentle curve, the turn (below),
    // and in an escape the C-bend and the swimming wave
    this.bodyPhase = (this.bodyPhase + 2 * Math.PI * this.bodyHz * dt) % (Math.PI * 200);
    const cOn = this.state === 'ESCAPE' && this.sub === 'turn' ? Math.sin(Math.PI * clamp(this.subT / 0.24, 0, 1)) : 0;
    this.turning(dt);
    const ownK = this.state === 'ESCAPE' ? 0.3 : 1;
    const sag = this.state === 'IDLE_HOVER' ? -0.22 : -0.066;
    const ownPh = this.bendSeed + 0.25 * Math.sin(t * 0.17 + this.bendSeed);
    for (let k = 1; k < NSEG; k++) {
      const s = STATIONS[k], ds = DS[k];
      // the body's own wave lives in the tail (the escape's strokes are the tail's)
      const wave = this.bodyAmp * WAVE[k] * Math.sin(this.bodyPhase - (2 * Math.PI * s) / this.bodyLambda) * ds * 16;
      const own = 0.27 * Math.sin(ownPh + s * 7.5) * ownK * ds;
      // the C: the stiff trunk hardly takes it, the tail most
      const c = cOn * this.cBend * C_BEND * FLEX[k] * ds;
      this.yawBend[k] = wave + own + c + this.turnY[k];
      // a hovering pipefish lets the rear of the tail hang a little; when travelling it is straight
      this.pitchBend[k] = sag * SAG[k] * ds + this.turnP[k];
    }
    chainFromBends(this.freePts, this.pitch, 0, this.yawBend, this.pitchBend);
    // the free back: upright across the free pivot's segment (never on end: the free pitch stays under ~70°)
    const dF = this.dFree.subVectors(this.freePts[PIVOT_K], this.freePts[PIVOT_K + 1]).normalize();
    this.upFree.set(0, 1, 0).addScaledVector(dF, -dF.y).normalize();
    // a held posture let go of: the free posture takes over from the head back, the tail unwinding last
    let relK = 0;
    if (this.relT >= 0) {
      this.relT += dt;
      const lag = this.relFast ? 0.05 : 0.25, dur = this.relFast ? 0.2 : 0.5;
      let any = false;
      for (let k = 0; k <= NSEG; k++) {
        const d0 = lag * clamp((STATIONS[k] - 0.3) / 0.7, 0, 1);
        const r = 1 - smooth(d0, d0 + dur, this.relT);
        this.relW[k] = r;
        if (r > 0) any = true;
      }
      relK = this.relW[PIVOT_K];
      if (any) blendChains(this.freePts, this.freePts, this.relPts, this.relW);
      else this.relT = -1;
    }
    const P = pose.pts;
    const w = this.state === 'GRASS_HOLD' && this.hold ? smooth(0, 1, this.holdW) : 0;
    if (w > 0) {
      // the held posture in model space, its pivot at the root, blended in by direction
      const H = this.holdModel;
      for (let k = 0; k <= NSEG; k++) this.toModel(H[k].copy(this.holdPts[k]));
      tmp.copy(H[PIVOT_K]);
      for (const q of H) q.sub(tmp);
      blendChains(P, this.freePts, H, w);
    } else {
      for (let k = 0; k <= NSEG; k++) P[k].copy(this.freePts[k]);
    }
    // the back: upright when free, along the blade's width when held, and between the two as it lets go or takes
    // hold, turned as a roll: each back is carried onto the posture's pivot segment by the least turn, then rolled
    const d = tmp2.subVectors(P[PIVOT_K], P[PIVOT_K + 1]).normalize();
    transport(this.upFree, dF, d, pose.up);
    if (relK > 0) {
      const dR = tmp.subVectors(this.relPts[PIVOT_K], this.relPts[PIVOT_K + 1]).normalize();
      transport(this.relUp, dR, d, tmp3);
      rollBlend(tmp3, tmp.copy(pose.up), 1 - relK, d, pose.up, this.rollRel);
    } else this.rollRel.th = Number.NaN;
    if (w > 0) {
      const c = Math.cos(this.heading), sn = Math.sin(this.heading), U = this.holdUp;
      const H = this.holdModel;
      const dH = tmp.subVectors(H[PIVOT_K], H[PIVOT_K + 1]).normalize();
      tmp3.set(c * U.x - sn * U.z, U.y, sn * U.x + c * U.z);
      tmp3.addScaledVector(dH, -tmp3.dot(dH)).normalize();
      transport(tmp3, dH, d, this.upHold);
      rollBlend(this.upHold, tmp.copy(pose.up), 1 - w, d, pose.up, this.rollHold);
    } else this.rollHold.th = Number.NaN;
    // the head: looking about, the strike's flick (instant up, eased back), the suction
    const striking = this.state === 'FORAGE' && this.sub === 'strike';
    pose.headPitch = striking ? approach(pose.headPitch, this.headPitchT, 400, dt) : approach(pose.headPitch, this.headPitchT, 7, dt);
    // the head leads a turn a little (a few degrees; its joint is a hinge for the strike, not for steering)
    pose.headYaw = approach(pose.headYaw, this.headYawT + clamp(0.1 * this.yawRate, -0.14, 0.14), 3, dt);
    pose.snout = striking ? Math.min(1, pose.snout + dt * 60) : approach(pose.snout, 0, 9, dt);
    pose.jaw = striking ? Math.min(1, pose.jaw + dt * 80) : approach(pose.jaw, 0, 12, dt);
  }

  /**
   * The held posture in world space: the body laid along the shoot, the end of the tail curled round it (see planCoil)
   * in a steep helix that follows the shoot as it sways, the caudal fan left free. `curl` takes hold: the tip curls
   * round first and the curl rolls forward up the tail.
   */
  private computeHold(env: FishEnv, dt: number): void {
    const h = this.hold!;
    const u = this.uniforms(env);
    const ref = h.ref;
    const S = shootState(u, ref, this.holdState);
    const tl = this.tl;
    const need = h.anchor + (h.sCurl - STATIONS[0]) * tl + 0.02;
    this.lineN = shootLine(u, ref, S, LINE_STEP, Math.min(need, LINE_STEP * (this.line.length - 2)), this.line);
    // tangents at the line's points (so the frame turns smoothly along it, not segment by segment)
    const L = this.line, n = this.lineN, LT = this.lineT;
    for (let i = 0; i < n; i++) LT[i].subVectors(L[Math.min(i + 1, n - 1)], L[Math.max(i - 1, 0)]).normalize();
    const C = this.fC, N = this.fN, B = this.fB;
    let k = 0;
    // the body: laid along the shoot above the curl, the flank against it
    for (; k <= NSEG && STATIONS[k] <= h.sCurl; k++) {
      const len = h.anchor + (h.sCurl - STATIONS[k]) * tl;
      this.axisAt(len);
      this.holdPts[k].copy(C).addScaledVector(N, this.extentAt(len, N) + this.halfAt(k) + GAP);
    }
    // the curl: marched along the tail in short steps (an unrolled helix: round by cos α, down by sin α), leaving the
    // body's line straight down and turning into the helix over `ease`; each part winds as `curl` reaches it, the tip
    // first. Where the sand stops it going down, it goes round.
    const total = Math.max(1e-4, (S_CAUDAL - h.sCurl) * tl);
    let len = h.anchor, phi = 0, sAt = h.sCurl;
    const U = this.fU;
    for (; k <= NSEG; k++) {
      const sk = STATIONS[k];
      if (k === NSEG) {
        // the caudal fan: on along the tail's last direction, turned a little away from the shoot so it stands free
        const prev = this.holdPts[k - 1];
        tmp.subVectors(prev, this.holdPts[k - 2]).normalize().addScaledVector(U, 0.3).normalize();
        this.holdPts[k].copy(prev).addScaledVector(tmp, (sk - STATIONS[k - 1]) * tl);
        continue;
      }
      const steps = Math.max(1, Math.ceil(((sk - sAt) * tl) / 0.0025));
      const ds = ((sk - sAt) * tl) / steps;
      const half = this.halfAt(k);
      for (let j = 0; j < steps; j++) {
        const x = (sAt - h.sCurl) * tl + (j + 0.5) * ds;
        const w = smooth(0, 1, this.curl * 1.6 - 0.6 * (1 - x / total));
        const a = 0.5 * Math.PI + (h.alpha - 0.5 * Math.PI) * w * smooth(0, h.ease, x);
        this.axisAt(len);
        U.copy(N).multiplyScalar(Math.cos(phi)).addScaledVector(B, Math.sin(phi));
        const r = this.extentAt(len, U) + half + GAP;
        // (easing to level as it nears the sand, so it does not kink there)
        const down = Math.min(Math.sin(a) * ds * smooth(0.004, 0.016, len), Math.max(0, len - 0.004));
        phi += (h.wrap * Math.sqrt(Math.max(0, ds * ds - down * down))) / r;
        len -= down;
      }
      sAt = sk;
      this.axisAt(len);
      U.copy(N).multiplyScalar(Math.cos(phi)).addScaledVector(B, Math.sin(phi));
      this.holdPts[k].copy(C).addScaledVector(U, this.extentAt(len, U) + half + GAP);
    }
    this.holdPivot.copy(this.holdPts[PIVOT_K]);
    // the back faces along the blade's width (the flank lies against the blade's face, as a blade's own profile)
    this.holdUp.set(Math.cos(ref.fan) * h.side, 0.05, Math.sin(ref.fan) * h.side);
    // (the approach heads for the pivot, then the root rides there; the free posture blends into the held one by
    // direction, whatever the heading, so the heading is left as the approach left it)
    void dt;
  }

  /**
   * The shoot's axis at a height (m along it from the base) into fC, its tangent fT, and a frame round it: fN toward
   * the flank's side of the shoot (from its fan), fB across.
   */
  private axisAt(len: number): void {
    const h = this.hold!, L = this.line, LT = this.lineT, n = this.lineN;
    const f = clamp(len / LINE_STEP, 0, n - 1.0001), i = Math.floor(f), r = f - i;
    this.fC.copy(L[i]).lerp(L[i + 1], r);
    const T = this.fT.copy(LT[i]).lerp(LT[i + 1], r).normalize();
    const fx = Math.cos(h.ref.fan) * h.side, fz = Math.sin(h.ref.fan) * h.side;
    this.fN.set(-fz, 0, fx).addScaledVector(T, -(-fz * T.x + fx * T.z)).normalize();
    this.fB.crossVectors(T, this.fN);
  }
  /**
   * How far from the shoot's axis the tail lies (toward u, across the axis) at a height: round the drawn sheath's
   * widest extent. A stiff tail bridges the flat sides of a flattened sheath rather than following them into its
   * narrow edges (and the sheath's flattening turns with the shoot's lean, which would twist the tail with it).
   */
  private extentAt(len: number, u: Vector3): number {
    void u;
    return sheathRadius(this.hold!.ref, len);
  }
  /** the half-thickness that meets the shoot at station k: the flank along the body, the tail's depth where it curls */
  private halfAt(k: number): number {
    const sc0 = this.hold!.sCurl;
    const m = smooth(sc0 - 0.04, sc0, STATIONS[k]);
    return this.tl * ((1 - m) * HALF_W[k] + m * HALF_D[k]);
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
