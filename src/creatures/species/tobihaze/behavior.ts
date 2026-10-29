import type { HabitatSample } from '../../../world/Habitat';
import type { IntentKind } from '../../drivers/Driver';
import { holeAt, planBurrows, remember, type TobiBurrow } from './burrows';

/**
 * トビハゼ (Periophthalmus modestus): what it is doing and where its body goes, without any rendering. The driver
 * (TobihazeDriver), the pose module (pose.js: a TobiFrame → joint rotations and blend-shape weights per tier) and the
 * unit tests use it alike. The owner's eleven states (behaviour.md §3; the numbers are its §6 tuning block):
 *  - IDLE           propped on the planted pectorals with the front raised 10–25° (§3.6, the commonest posture),
 *                   breathing through the throat, blinking by the eye drop, the turret eyes looking about each on its
 *                   own and fixing on the observer; a display (cheeks inflated, the first dorsal raised) is an IDLE too.
 *                   Under water it lies on the bottom with the pectorals fanned, ventilating (the tank and the case,
 *                   which are always flooded, keep it there)
 *  - LAND_REST      prone: chin, belly and pelvic cup on the mud, the pectorals folded back (§3.6); when it dries it
 *                   rolls onto its side on wet mud now and then to wet its eyes and skin (§3.9)
 *  - LAND_CRAWL     crutching on both pectorals together (§3.1): a stance in which the furled fin tips stay where they
 *                   touched the mud while the body vaults one stride forward over them, then a recovery in which the
 *                   body rests on its pelvic cup and the fins swing forward; it turns only in the recovery, about the cup
 *  - LAND_HOP       the prone jump (§3.2): the tail coils into a J beside the still front, unfolds and throws the fish
 *                   on a ballistic arc of 1–3 body lengths; it lands on the pectorals and pelvics and plants again
 *  - FORAGE         scans the mud, then pivots forward over the planted pectorals with the jaws open onto the prey (a
 *                   strike), or pounces on prey a little farther off; swallows with throat pulses (§3.7)
 *  - BURROW         to its burrow (or a crab's) and in head first, out of sight; peeks out, comes out (§3.8)
 *  - ESCAPE         a chain of hops to water or to a burrow within reach (§3.10); skipping over the water or a burst of
 *                   swimming when it is in the water already
 *  - SWIM           submerged, carangiform at 1.5–2.3 BL/s (§3.3)
 *  - SHALLOW_WATER  at the water's edge with the eyes above the surface: on the bottom in the film, taxiing at the
 *                   surface, or crutching through it (§3.4)
 *  - WATER_ENTRY    a hop off the bank into the water, or crutching over the edge (§3.5)
 *  - WATER_EXIT     a hop out of the water onto the mud, the pectorals reaching for it, or crutching out (§3.5)
 * The brain's intents say what to do; the depth at the body (waterY − groundY against the body's height) and the tide's
 * trend say where it can be done.
 *
 * No contact the body stands on slides. The planner moves the model's root only by rotations about the contacts welded
 * at the time (the crawl's fin tips in the stance, the pelvic cup in the recovery, the planted soles in a prop or a
 * strike), by whole strides at the moment the crawl's cycle hands the body's weight back to the fins (the GLB's crawl
 * cycle carries J_root forward one stride, so the root takes the stride over as the cycle wraps), or through the air.
 * Where a contact is welded comes from the GLB's own crawl cycle and contacts (extras.tobihaze); TobiFrame.contacts
 * lists them every frame, and the unit tests check them against the rig's own forward kinematics.
 *
 * Every timing and decision is the same on every tier and device (behaviour.md §6, CLAUDE.md): only the geometry (where
 * the welds are, how high a pose stands) comes from the tier's own extras, sub-millimetre apart.
 *
 * Using it (TobihazeDriver): one behaviour per individual, kept across attach/detach (setRig(extras) on each attach,
 * serialize()/restore() where a view is rebuilt from scratch); setIntent() from the brain or the tank; every update
 * update(dt × simScale, env) with env from the DriverContext (groundY = floor.heightAt, waterY = floor.waterAt, sample
 * = floor.sampleAt, bounds, canBurrow, player, alert = Individual.alert). The frame's root is the model's root node as
 * it is (position, quat, scale); the joints come from the pose module: the frame's pose (or stateBlend) from the GLB
 * extras, J_root's own channels and t included (the crawl frames' t is the stride under way, the prop frames' t holds
 * the rear), then the eyes, the head, the fins, the hop's curl and the swim's wave on top. Its pos/heading go to the
 * Individual, its events to onEvent, hidden/catchable to hidden/canNetCapture, wantsEveryFrame to everyFrame, nudge and
 * place to nudge and holdAt.
 */

// ------------------------------------------------------------------------------------------------ types

export const STATES = [
  'IDLE', 'SWIM', 'SHALLOW_WATER', 'LAND_REST', 'LAND_CRAWL', 'LAND_HOP', 'FORAGE', 'BURROW', 'ESCAPE', 'WATER_ENTRY', 'WATER_EXIT',
] as const;
export type TobiState = (typeof STATES)[number];

/** the ids the behaviour emits: the species' encyclopedia.behaviors[].id (the driver passes them on as BehaviorEvents) */
export const EVENTS = [
  'rest', 'crawl', 'hop', 'swim', 'shallow', 'forage', 'burrow', 'escape', 'water_entry', 'water_exit', 'display', 'blink', 'eye_roll',
] as const;
export type TobiEvent = (typeof EVENTS)[number];

/** each state's id, emitted as it begins (and again now and then while a lasting one goes on) */
export const STATE_EVENT: Record<TobiState, TobiEvent> = {
  IDLE: 'rest', LAND_REST: 'rest', LAND_CRAWL: 'crawl', LAND_HOP: 'hop', SWIM: 'swim', SHALLOW_WATER: 'shallow', FORAGE: 'forage',
  BURROW: 'burrow', ESCAPE: 'escape', WATER_ENTRY: 'water_entry', WATER_EXIT: 'water_exit',
};

/**
 * The poses a frame is built from, the GLB's (extras.tobihaze): 'land', 'reach', 'rest', 'water', 'swim' are its
 * states; 'prop' is its prop at TobiFrame.prop.raise (the land state is the prop at 15°); 'crawl' its crawl cycle at
 * TobiFrame.crawl.phase.
 */
export type PoseRef = 'land' | 'reach' | 'rest' | 'water' | 'swim' | 'prop' | 'crawl';

export type Medium = 'land' | 'shallow' | 'water';

export type V3 = [number, number, number];
export type Q4 = [number, number, number, number];

/** What the behaviour reads of the world (the driver's DriverContext, or a test's). Heights in metres, world frame. */
export interface TobiEnv {
  groundY(x: number, z: number): number;
  waterY(x: number, z: number): number;
  /** the habitat at a point (the field only): wetness of the mud, the substrate */
  sample?(x: number, z: number): HabitatSample | null;
  /** keep inside this box (the home tank, the case) */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  /** false where there is nothing to dig into (the case, a bare tank) */
  canBurrow?: boolean;
  /** the observer (the camera / player), when there is one */
  player?: { x: number; y?: number; z: number } | null;
  /** the brain's alert of this animal (Individual.alert, 0..1) */
  alert?: number;
  /** game seconds (unused: the behaviour keeps its own clock from dt, so a paused game pauses it) */
  nowS?: number;
}

/** The brain's intent as the behaviour takes it (Driver.Intent without three's Vector3). */
export interface TobiIntent {
  kind: IntentKind;
  target?: { x: number; z: number } | null;
  from?: { x: number; z: number } | null;
  urgency?: number;
  param?: string;
  /** seconds the brain expects it to last (0: until the behaviour reports done) */
  seconds?: number;
}

export interface TobiContact {
  name: string;
  /** world position (m) */
  world: V3;
  /** standing on it this frame: it must not move while this stays true */
  welded: boolean;
}

/** One eye's gaze: degrees in the GLB's gaze channels (extras.tobihaze.eyes.L.gaze: yaw + forward, pitch + up), lift in m. */
export interface TobiEye {
  yaw: number;
  pitch: number;
  /** the eye's height on its turret (m at model scale, along J_eye's translate dir): rest 0.03 HL on land, up to liftM
   *  (0.08 HL, the alert periscope) — the blink's drop is apart, in blink */
  lift: number;
}

/**
 * What the pose module needs each frame. The root is final: the driver puts the model's root node there as it is (the
 * ground fit is done here, at moments no welded contact moves).
 */
export interface TobiFrame {
  state: TobiState;
  /** the state's step (debug, the pose's sub-mode): 'prop', 'stance', 'coil', 'air', 'strike', 'peek', … */
  phase: string;
  /** seconds in the state */
  t: number;
  /** the model's root node in the world: position (m), Euler 'YXZ' (heading about +Y, then pitch about the fish's left
   *  +X — nose down positive —, then roll about its forward +Z), and the same as a quaternion [x, y, z, w] */
  root: { x: number; y: number; z: number; heading: number; pitch: number; roll: number; quat: Q4 };
  /** the root's scale (the individual's TL over the model's) */
  scale: number;
  /** the pose the body is in (to when blending) */
  pose: PoseRef;
  /**
   * between two poses: e(u) = u²(3 − 2u) for every channel, plus sin(πu)·lift on the arms (J_pec depression −lift,
   * J_pecFin flexion +lift, each held in its range) — the extras' transitions rule; lift is the pair's from the extras
   * (deg), or this module's default where the GLB gives none
   */
  stateBlend: { from: PoseRef; to: PoseRef; u: number; lift: number } | null;
  /** crawling: the GLB crawl cycle's phase (0..1; its J_root t carries the stride, the root stays), its stride scale
   *  (always 1: the fins are solved for the GLB's stride), this cycle's turn (rad, about the cup), the cycle (s) */
  crawl: { phase: number; stride: number; turn: number; cycleS: number } | null;
  /** hopping: phase 0..1 over the whole hop; stage coil → push → air → land, u within it; curl −1..1 the J-curl (the
   *  extras' spine.curlBudget.jcurl × |curl|, + the tail to the fish's left); arch 0..1 (a display jump) */
  hop: { phase: number; stage: 'coil' | 'push' | 'air' | 'land'; u: number; curl: number; arch: number } | null;
  /** swimming: the travelling wave's phase (cycles), its amplitude 0..1, speed (BL/s), the turn rate (rad/s) */
  swim: { phase: number; amp: number; speed: number; turn: number } | null;
  /** the prop's raise (deg, 12.5–25), whenever the pose is 'prop' or blends with it (held through the blend) */
  prop: { raise: number } | null;
  eyes: { L: TobiEye; R: TobiEye; blink: { L: number; R: number }; /** 0 slit … 1 round and wide (water, dark) */ pupil: number };
  /** 0..1 each: the gape (gapeFull at 1), the buccal pump (throat), the cheeks (inflated at 1), the gill slits */
  head: { gape: number; gulp: number; inflate: number; vent: number };
  /** median fins 0 folded … 1 erect (d1: the first dorsal; median: the second dorsal and the anal), caudal 0 folded … 1
   *  spread; the paired fins' state as the pose's (it names the blade state for the tiers' cards) */
  fins: { d1: number; median: number; caudal: number; pect: 'plant' | 'furl' | 'spread' | 'fold'; pelvic: 'press' | 'fold' | 'spread' };
  /** the contacts the body stands on (welded) or rests on this frame */
  contacts: TobiContact[];
  /** encyclopedia ids emitted this frame */
  events: TobiEvent[];
  /** down its burrow: not pickable, not catchable */
  hidden: boolean;
  medium: Medium;
  /** water over the ground at the body (m; negative: exposed) */
  depth: number;
  /** for the materials: the skin's water film 0 dry … 1 just out of the water, the mud on it */
  skin: { wet: number; mud: number };
  /** colour states (behaviour §2.6): the excitement bars, the darkening of a fleeing fish */
  colour: { bars: number; dark: number };
}

export interface TobiOptions {
  rng: () => number;
  /** the individual's total length (m) */
  length: number;
  start: { x: number; z: number; heading: number };
  home?: { x: number; z: number };
  /** the GLB root extras (LoadedModel.extras); the hero's numbers when absent */
  extras?: Record<string, unknown> | null;
  /** choose its own intents when nothing drives it (the viewer, tests) */
  autonomous?: boolean;
}

export interface TobiApi {
  readonly state: TobiState;
  readonly busy: boolean;
  readonly hidden: boolean;
  /** a net takes it (not while it is in its burrow, peeking included) */
  readonly catchable: boolean;
  /** update every frame while near: its feet are welded and its hops in the air */
  readonly wantsEveryFrame: boolean;
  readonly frame: TobiFrame;
  /** the body's middle (the model's origin, world) and its heading */
  readonly pos: { x: number; y: number; z: number };
  readonly heading: number;
  readonly rig: TobiRig;
  /** the burrows it knows, each an opening in the mud (burrows.ts; the driver draws them where they are) */
  readonly burrows: readonly TobiBurrow[];
  setIntent(intent: TobiIntent): void;
  update(dt: number, env: TobiEnv): TobiFrame;
  /** a new tier's extras (attach): the geometry tables change, the state does not */
  setRig(extras?: Record<string, unknown> | null): void;
  /** put it at rest at (x, z) on the bed, facing heading (holdAt) */
  place(x: number, z: number, heading?: number): void;
  /** a push from another body: taken when nothing is welded (the next stride, a hop, the water) */
  nudge(dx: number, dz: number): void;
  serialize(): TobiSnapshot;
  restore(s: TobiSnapshot): void;
  debugLabel(): string;
}

// ------------------------------------------------------------------------------------------------ the numbers

/**
 * behaviour.md §6 (P. modestus where measured, congeners scaled to TL 80 mm, [D] the design values). Every individual
 * varies its timings by ±15 % (§6 variety).
 */
export const TOBI = {
  /** the prop's raise (deg): 12.5–25 (§3.6: 10–25°; the GLB's prop presses its pelvic cup on the mud from 12.5° up) */
  raiseDeg: [12.5, 25] as const,
  /** depth bands against the body's height H (footprint height × TL; ≈ 0.16 TL): land ≤ 0, shallow ≤ 1.2 H (runtime §10) */
  depth: { landH: 0.04, shallowH: 1.2, hysteresisH: 0.08, floatClear: 0.3 },
  crawl: { cycleS: [0.45, 0.55] as const, hurryCycleS: 0.4, waterCycleS: 0.36, maxTurnDeg: 32, bout: [2, 12] as const, pauseS: [0.4, 2.2] as const, softMud: 1.08, attitudeDeg: 25 },
  hop: {
    coilS: [0.09, 0.12] as const, pushS: [0.04, 0.05] as const, landS: 0.09, angleDeg: [30, 55] as const, rangeBL: [1, 2] as const, rangeMaxBL: 3,
    gapS: [0.1, 0.25] as const, escapeHops: [2, 8] as const, biasDeg: 9.9, airTurnDeg: 45, g: 9.81, juvenileMM: 40, apexBL: 0.5,
  },
  skip: { lenM: 0.21, heightM: 0.027, angleDeg: 30, taxiS: [0.05, 0.2] as const, hops: [2, 15] as const },
  swim: { cruiseBL: [1.5, 2.3] as const, strideBL: 0.65, burstMps: 1.0, taxiMps: 0.4, taxiS: 0.2, turnRate: 2.6 },
  strike: { maxBL: 0.25, pounceBL: [0.25, 1.1] as const, anticipateS: 0.08, downS: 0.14, openS: 0.093, holdS: 0.03, closeS: 0.036, upS: 0.2, chinClearM: 0.0004 },
  scanS: [1, 6] as const, swallowS: [1, 4] as const,
  eyes: {
    blinkS: 0.56, blinkSdS: 0.073, closeFrac: 0.35, medianS: 85, dryMedianS: 20, sigma: 0.9, bilateral: 0.5, settleED: 0.07,
    saccadeS: [0.5, 3] as const, saccadeDeg: [5, 30] as const, yaw: [-28, 92] as const, pitch: [-32, 48] as const,
    rest: { yaw: 16.7, pitch: 2.8 }, restOut: 71.7, restUp: 12.2, trackM: 8, blinkGazeDeg: 20,
  },
  roll: { medianS: 428, dryMedianS: 127, durS: 1.8, deg: 80 },
  breath: { throatS: [2, 6] as const, refreshS: [60, 300] as const, ventHz: [0.7, 1.5] as const },
  threat: { burrowM: 1, waterM: 4, alertM: 4 },
  /** re-emit a lasting state's id this often (s), so an observation that starts late still records it */
  reEmitS: 9,
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (a: number) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
/** move a toward b at a rate k per second, frame-rate independent */
const ease = (a: number, b: number, dt: number, k: number) => a + (b - a) * (1 - Math.exp(-k * dt));

// ------------------------------------------------------------------------------------------------ small maths (no three)

function qmul(a: Q4, b: Q4, o: Q4): Q4 {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by;
  o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw;
  o[3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
}
function qrot(q: Q4, v: V3, o: V3): V3 {
  const x = q[0], y = q[1], z = q[2], w = q[3], vx = v[0], vy = v[1], vz = v[2];
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  o[0] = ix * w + iw * -x + iy * -z - iz * -y;
  o[1] = iy * w + iw * -y + iz * -x - ix * -z;
  o[2] = iz * w + iw * -z + ix * -y - iy * -x;
  return o;
}
function qaxis(x: number, y: number, z: number, rad: number, o: Q4): Q4 {
  const l = Math.hypot(x, y, z) || 1, s = Math.sin(rad / 2) / l;
  o[0] = x * s; o[1] = y * s; o[2] = z * s; o[3] = Math.cos(rad / 2);
  return o;
}
function qnorm(q: Q4): Q4 { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l; return q; }
function qconj(q: Q4, o: Q4): Q4 { o[0] = -q[0]; o[1] = -q[1]; o[2] = -q[2]; o[3] = q[3]; return o; }
function qslerp(a: Q4, b: Q4, t: number, o: Q4): Q4 {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let k0 = 1 - t, k1 = t;
  if (d < 0.9995) { const th = Math.acos(d), s = Math.sin(th); k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s; }
  o[0] = k0 * a[0] + k1 * bx; o[1] = k0 * a[1] + k1 * by; o[2] = k0 * a[2] + k1 * bz; o[3] = k0 * a[3] + k1 * bw;
  return qnorm(o);
}
const _qa: Q4 = [0, 0, 0, 1], _qb: Q4 = [0, 0, 0, 1], _qc: Q4 = [0, 0, 0, 1];
/** Ry(heading) · Rx(pitch) · Rz(roll): three's Euler 'YXZ' */
function qYXZ(h: number, p: number, r: number, o: Q4): Q4 {
  qaxis(0, 1, 0, h, _qa); qaxis(1, 0, 0, p, _qb); qaxis(0, 0, 1, r, _qc);
  qmul(_qa, _qb, o);
  return qmul(o, _qc, o);
}
/** the Euler 'YXZ' angles of a rotation (as three's Euler.setFromRotationMatrix) */
function yxzOf(q: Q4, out: { heading: number; pitch: number; roll: number }) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const m13 = 2 * (x * z + y * w), m23 = 2 * (y * z - x * w), m33 = 1 - 2 * (x * x + y * y);
  const m21 = 2 * (x * y + z * w), m22 = 1 - 2 * (x * x + z * z), m31 = 2 * (x * z - y * w), m11 = 1 - 2 * (y * y + z * z);
  out.pitch = Math.asin(-clamp(m23, -1, 1));
  if (Math.abs(m23) < 0.9999999) { out.heading = Math.atan2(m13, m33); out.roll = Math.atan2(m21, m22); }
  else { out.heading = Math.atan2(-m31, m11); out.roll = 0; }
  return out;
}
const set3 = (o: V3, x: number, y: number, z: number): V3 => { o[0] = x; o[1] = y; o[2] = z; return o; };
const copy3 = (o: V3, a: V3): V3 => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; };
const copy4 = (o: Q4, a: Q4): Q4 => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; return o; };

/** a log-normal draw with this median (σ in log units): the measured intervals are wide (blinks 129 ± 121 s) */
const logNormal = (rng: () => number, median: number, sigma: number) => {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return median * Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v));
};

// ------------------------------------------------------------------------------------------------ the rig (GLB extras)

/** a joint's channel values (deg) and its translation t ([ds, dy, dz] in HL, the fish frame), or a quaternion (lod2's arms) */
export type PoseEntry = { [channel: string]: number | number[] | undefined; t?: number[] } | number[];
export type RigPose = Record<string, PoseEntry>;

interface JointDef { name: string; parent: number; pivot: V3; order: string[]; axes: Record<string, V3>; ranges: Record<string, [number, number]> }
export interface RigContact { name: string; kind: string; bone: string; local: V3 }

/** Joint world transforms (model frame): rotation and the pivot's position. */
export interface RigWorld { q: Q4[]; p: V3[]; index: Record<string, number> }

export interface TobiRig {
  tier: string;
  /** the model's TL and HL (m) */
  tl: number;
  hl: number;
  /** footprint height and width (shares of TL) */
  height: number;
  width: number;
  /** parents first; empty without extras */
  joints: JointDef[];
  index: Record<string, number>;
  /** the GLB's states' poses (channel values, without the morphs) */
  states: Partial<Record<'land' | 'reach' | 'rest' | 'water' | 'swim', RigPose>>;
  contacts: Partial<Record<'land' | 'reach' | 'rest' | 'water' | 'swim', RigContact[]>>;
  /** the model-frame height of the ground under each pose (m) */
  ground: Record<PoseRef, number>;
  crawl: {
    /** m (model), s, shares of the cycle */
    stride: number; cycleS: number; duty: number; lift: number; setDown: number;
    /** where the crutches bear in the stance (model frame at the cycle's start): from this phase on, until the next */
    segs: { from: number; L: V3; R: V3; bone?: string; lL?: V3; lR?: V3 }[];
    /** the pelvic cup's contact in the recovery (the body still, one stride on) */
    cup: V3;
    frames: { phase: number; pose: RigPose }[];
  };
  prop: {
    raises: number[];
    poses: RigPose[];
    /** the planted soles' centres: the prop frames hold them where the land state put them, at every raise */
    soleL: V3; soleR: V3;
    /** per raise: the cup, the chin, the left eye's centre */
    cup: V3[]; chin: V3[]; eye: V3[];
    ground: number[];
  };
  /** the crawl pose's contacts: the land state's without the soles, with the crutches' bearing tips */
  crawlContacts: RigContact[];
  /** the cup in the prone rest; the chin in the water state (its strike on the bottom) */
  restCup: V3;
  waterChin: V3;
  /** the left eye's centre in each pose (model frame; prop and crawl at 15°) and its radius */
  eye: Record<PoseRef, V3>;
  eyeR: number;
  /** the arms' lift between two poses (deg; 'a>b') */
  lift: Record<string, number>;
  /** the height (m, model) a blend between two poses must add to keep every fin and the belly out of the ground, by
   *  u in 16 steps ('a>b'; b>a reads it backwards) */
  clear: Record<string, number[]>;
}

/** the arms' lift where the extras give none (deg) */
const DEFAULT_LIFT: Record<string, number> = { 'crawl>prop': 20, 'crawl>rest': 24, 'reach>water': 20, 'water>crawl': 20, 'swim>crawl': 20 };
/** the blends the behaviour uses on the ground most (measured with the rig; any other the first time it is used) */
const GROUND_PAIRS: [PoseRef, PoseRef][] = [
  ['prop', 'rest'], ['prop', 'reach'], ['prop', 'water'], ['rest', 'water'], ['water', 'swim'], ['crawl', 'prop'], ['crawl', 'rest'], ['reach', 'water'],
];
const CLEAR_STEPS = 16;
const TRANSITION_POSE: Record<string, PoseRef> = { land: 'prop', reach: 'reach', rest: 'rest', water: 'water', swim: 'swim' };

/** The hero's numbers (the tiers built 2026-10-21): the rig without a model (a placeholder), checked by the unit tests. */
const HERO = {
  tl: 0.08, hl: 0.0161345, height: 0.1598, width: 0.1412,
  ground: { land: -0.0081644, reach: -0.0073286, rest: -0.0055853, water: -0.0057246, swim: -0.0078573, prop: -0.0081567, crawl: -0.0081567 },
  crawl: { stride: 0.015, cycleS: 0.5, duty: 0.6, lift: 0.08, setDown: 0.52, cup: [0, -0.0080692, 0.0347005] as V3,
    segs: [{ from: 0, L: [0.0115749, -0.0081567, 0.0283758] as V3 }, { from: 0.375, L: [0.0117895, -0.0081567, 0.028892] as V3 }] },
  soleL: [0.0103453, -0.0081639, 0.0229766] as V3,
  prop: [
    // raise, cup y, cup z, chin y, chin z, eye y, eye z (m)
    [10, -0.0087806, 0.0191721, -0.0027535, 0.0367489, 0.0075289, 0.0335885],
    [15, -0.0080692, 0.0197005, -0.0005332, 0.0366851, 0.0094347, 0.0326406],
    [20, -0.0073756, 0.0201925, 0.001612, 0.0364556, 0.0111895, 0.0315577],
    [25, -0.0066381, 0.020636, 0.0037327, 0.0360539, 0.0128469, 0.0303399],
  ],
  restCup: [0, -0.0055289, 0.0168296] as V3,
  waterChin: [0, -0.0047075, 0.0359664] as V3,
  eye: { land: [0.00171, 0.0094347, 0.0326406], prop: [0.00171, 0.0094347, 0.0326406], crawl: [0.00171, 0.0094347, 0.0326406], reach: [0.00171, 0.0083405, 0.0334191],
    rest: [0.00171, 0.0050968, 0.0348213], water: [0.00171, 0.005486, 0.034676], swim: [0.00171, 0.005486, 0.034676] } as Record<PoseRef, V3>,
  eyeR: 0.0016699,
  lift: { 'prop>rest': 24, 'prop>reach': 32, 'prop>water': 36, 'rest>water': 9, 'water>swim': 5 } as Record<string, number>,
};

function heroRig(): TobiRig {
  const mirror = (v: V3): V3 => [-v[0], v[1], v[2]];
  const segs = HERO.crawl.segs.map((s) => ({ from: s.from, L: [...s.L] as V3, R: mirror(s.L) }));
  const P = HERO.prop;
  return {
    tier: 'default', tl: HERO.tl, hl: HERO.hl, height: HERO.height, width: HERO.width, joints: [], index: {}, states: {}, contacts: {},
    ground: { ...HERO.ground },
    crawl: { stride: HERO.crawl.stride, cycleS: HERO.crawl.cycleS, duty: HERO.crawl.duty, lift: HERO.crawl.lift, setDown: HERO.crawl.setDown, segs, cup: [...HERO.crawl.cup] as V3, frames: [] },
    prop: {
      raises: P.map((r) => r[0]), poses: [], soleL: [...HERO.soleL] as V3, soleR: mirror(HERO.soleL),
      cup: P.map((r) => [0, r[1], r[2]] as V3), chin: P.map((r) => [0, r[3], r[4]] as V3), eye: P.map((r) => [0.00171, r[5], r[6]] as V3), ground: P.map(() => HERO.ground.prop),
    },
    crawlContacts: [], restCup: [...HERO.restCup] as V3, waterChin: [...HERO.waterChin] as V3, eye: Object.fromEntries(Object.entries(HERO.eye).map(([k, v]) => [k, [...v]])) as Record<PoseRef, V3>, eyeR: HERO.eyeR,
    lift: { ...DEFAULT_LIFT, ...HERO.lift },
    clear: {},
  };
}

/** the rig's joints, parents first, from the extras' axes */
function jointsOf(axes: Record<string, unknown> | undefined): { joints: JointDef[]; index: Record<string, number> } {
  const J = (axes?.joints ?? {}) as Record<string, { parent?: string | null; pivotM?: number[]; order?: string[]; channels?: Record<string, { axis: number[]; range?: number[] }> }>;
  const joints: JointDef[] = [], index: Record<string, number> = {};
  const visit = (name: string) => {
    if (name in index) return;
    const a = J[name];
    if (a.parent && J[a.parent]) visit(a.parent);
    const axesOf: Record<string, V3> = {}, ranges: Record<string, [number, number]> = {};
    for (const [c, ch] of Object.entries(a.channels ?? {})) {
      axesOf[c] = [ch.axis[0], ch.axis[1], ch.axis[2]];
      ranges[c] = [ch.range?.[0] ?? -180, ch.range?.[1] ?? 180];
    }
    index[name] = joints.length;
    joints.push({ name, parent: a.parent && J[a.parent] ? index[a.parent] : -1, pivot: [a.pivotM?.[0] ?? 0, a.pivotM?.[1] ?? 0, a.pivotM?.[2] ?? 0], order: a.order ?? Object.keys(a.channels ?? {}), axes: axesOf, ranges });
  };
  for (const n of Object.keys(J)) visit(n);
  return { joints, index };
}

const _fq: Q4 = [0, 0, 0, 1], _fq2: Q4 = [0, 0, 0, 1], _fv: V3 = [0, 0, 0], _fv2: V3 = [0, 0, 0];

/**
 * The rig's forward kinematics in the model frame: each joint turns about its bind pivot by its channels in its AXES
 * order (R = R(order[0]) · R(order[1]) · …, the extras' composition), its t ([ds, dy, dz] HL, fish frame) in its parent's
 * frame; bind rotations are identity, so a bone-local point is an offset from the pivot in the model's axes.
 */
export function rigFK(rig: TobiRig, pose: RigPose, out?: RigWorld): RigWorld {
  const n = rig.joints.length;
  const W = out ?? { q: Array.from({ length: n }, () => [0, 0, 0, 1] as Q4), p: Array.from({ length: n }, () => [0, 0, 0] as V3), index: rig.index };
  const hl = rig.hl;
  for (let i = 0; i < n; i++) {
    const j = rig.joints[i], e = pose[j.name];
    const lq = _fq;
    lq[0] = 0; lq[1] = 0; lq[2] = 0; lq[3] = 1;
    let tx = 0, ty = 0, tz = 0;
    if (Array.isArray(e)) { copy4(lq, e as unknown as Q4); qnorm(lq); }
    else if (e) {
      for (const c of j.order) {
        const v = e[c];
        if (typeof v !== 'number' || !v || !j.axes[c]) continue;
        const ax = j.axes[c];
        qmul(lq, qaxis(ax[0], ax[1], ax[2], v * DEG, _fq2), lq);
      }
      const t = e.t;
      if (t) { tx = t[2] * hl; ty = t[1] * hl; tz = -t[0] * hl; }
    }
    const pq: Q4 = j.parent >= 0 ? W.q[j.parent] : [0, 0, 0, 1];
    const pp: V3 = j.parent >= 0 ? W.p[j.parent] : [0, 0, 0];
    const pv: V3 = j.parent >= 0 ? rig.joints[j.parent].pivot : [0, 0, 0];
    set3(_fv, j.pivot[0] - pv[0] + tx, j.pivot[1] - pv[1] + ty, j.pivot[2] - pv[2] + tz);
    qrot(pq, _fv, _fv2);
    set3(W.p[i], pp[0] + _fv2[0], pp[1] + _fv2[1], pp[2] + _fv2[2]);
    qmul(pq, lq, W.q[i]);
  }
  return W;
}

/** a bone-local point in the model frame under a pose's world transforms */
export function rigPoint(rig: TobiRig, W: RigWorld, bone: string, local: V3, out: V3 = [0, 0, 0]): V3 {
  const i = rig.index[bone];
  if (i === undefined) return set3(out, Number.NaN, Number.NaN, Number.NaN);
  qrot(W.q[i], local, out);
  return set3(out, out[0] + W.p[i][0], out[1] + W.p[i][1], out[2] + W.p[i][2]);
}

/** the bone-local point of a model-frame point under a pose (the inverse of rigPoint) */
function rigLocal(rig: TobiRig, W: RigWorld, bone: string, p: V3): V3 {
  const i = rig.index[bone];
  const d: V3 = [p[0] - W.p[i][0], p[1] - W.p[i][1], p[2] - W.p[i][2]];
  return qrot(qconj(W.q[i], [0, 0, 0, 1]), d, [0, 0, 0]);
}

const isArm = (name: string) => /^J_pec(Fin|Mid|Tip)?[LR]$/.test(name);

/**
 * Two poses blended by the extras' transitions rule: e(u) = u²(3 − 2u) on every channel and t; the arms (J_pec*) add
 * sin(πu)·lift (J_pec depression −lift, J_pecFin flexion +lift: up and in, clear of the mud), each channel held in its
 * range. Quaternion entries (lod2's arms) blend by nlerp, the lift as a turn about the depression axis.
 */
export function blendPoses(rig: TobiRig, a: RigPose, b: RigPose, u: number, lift: number): RigPose {
  const k = smooth(u), arc = Math.sin(Math.PI * clamp(u, 0, 1)) * lift;
  const out: RigPose = {};
  for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (name === 'morph') continue;
    const ea = a[name], eb = b[name];
    const j = rig.joints[rig.index[name]];
    if (Array.isArray(ea) || Array.isArray(eb)) {
      const qa = toQuat(rig, name, ea), qb = toQuat(rig, name, eb);
      const q = qslerp(qa, qb, k, [0, 0, 0, 1]);
      if (arc && j && /^J_pec[LR]$/.test(name)) {
        const ax = rig.joints[rig.index[name]]?.axes.depression;
        if (ax) qmul(q, qaxis(ax[0], ax[1], ax[2], -arc * DEG, _fq2), q);
      }
      out[name] = [...q];
      continue;
    }
    const o: { [c: string]: number | number[] } = {};
    const A = (ea ?? {}) as Record<string, number | number[] | undefined>, B = (eb ?? {}) as Record<string, number | number[] | undefined>;
    for (const c of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (c === 't') {
        const ta = (A.t as number[] | undefined) ?? [0, 0, 0], tb = (B.t as number[] | undefined) ?? [0, 0, 0];
        o.t = [lerp(ta[0], tb[0], k), lerp(ta[1], tb[1], k), lerp(ta[2], tb[2], k)];
        continue;
      }
      o[c] = lerp((A[c] as number | undefined) ?? 0, (B[c] as number | undefined) ?? 0, k);
    }
    if (arc && j && isArm(name)) {
      const ch = /^J_pec[LR]$/.test(name) ? 'depression' : /^J_pecFin[LR]$/.test(name) ? 'flexion' : null;
      if (ch && j.ranges[ch]) { const s = ch === 'depression' ? -1 : 1; o[ch] = clamp(((o[ch] as number | undefined) ?? 0) + s * arc, j.ranges[ch][0], j.ranges[ch][1]); }
    }
    out[name] = o;
  }
  return out;
}

function toQuat(rig: TobiRig, name: string, e: PoseEntry | undefined): Q4 {
  if (Array.isArray(e)) return qnorm([e[0], e[1], e[2], e[3]]);
  const j = rig.joints[rig.index[name]], q: Q4 = [0, 0, 0, 1];
  if (!j || !e) return q;
  for (const c of j.order) { const v = e[c]; if (typeof v === 'number' && v && j.axes[c]) qmul(q, qaxis(j.axes[c][0], j.axes[c][1], j.axes[c][2], v * DEG, _fq2), q); }
  return q;
}

/** a keyframed pose (crawl frames by phase, prop frames by raise) at a value, its channels interpolated linearly */
export function framePose(rig: TobiRig, frames: { at: number; pose: RigPose }[], at: number): RigPose {
  if (!frames.length) return {};
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1].at <= at) i++;
  const a = frames[i], b = frames[Math.min(frames.length - 1, i + 1)];
  const u = b.at > a.at ? clamp((at - a.at) / (b.at - a.at), 0, 1) : 0;
  // (a plain lerp, no ease: the frames are dense)
  const out: RigPose = {};
  for (const name of new Set([...Object.keys(a.pose), ...Object.keys(b.pose)])) {
    if (name === 'morph') continue;
    const ea = a.pose[name], eb = b.pose[name];
    if (Array.isArray(ea) || Array.isArray(eb)) { out[name] = [...qslerp(toQuat(rig, name, ea), toQuat(rig, name, eb), u, [0, 0, 0, 1])]; continue; }
    const A = (ea ?? {}) as Record<string, number | number[] | undefined>, B = (eb ?? {}) as Record<string, number | number[] | undefined>, o: { [c: string]: number | number[] } = {};
    for (const c of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (c === 't') { const ta = (A.t as number[] | undefined) ?? [0, 0, 0], tb = (B.t as number[] | undefined) ?? [0, 0, 0]; o.t = [lerp(ta[0], tb[0], u), lerp(ta[1], tb[1], u), lerp(ta[2], tb[2], u)]; }
      else o[c] = lerp((A[c] as number | undefined) ?? 0, (B[c] as number | undefined) ?? 0, u);
    }
    out[name] = o;
  }
  return out;
}

/** the crawl cycle's pose at a phase (0..1) */
export function crawlPose(rig: TobiRig, phase: number): RigPose {
  return framePose(rig, rig.crawl.frames.map((f) => ({ at: f.phase, pose: f.pose })), phase);
}
/** the prop's pose at a raise (deg) */
export function propPose(rig: TobiRig, raise: number): RigPose {
  return framePose(rig, rig.prop.raises.map((r, i) => ({ at: r, pose: rig.prop.poses[i] })), raise);
}
/** a named pose of the rig (the crawl at its phase 0, the prop at 15°) */
export function rigPose(rig: TobiRig, ref: PoseRef, at?: number): RigPose {
  if (ref === 'crawl') return crawlPose(rig, at ?? 0);
  if (ref === 'prop') return propPose(rig, at ?? 15);
  return rig.states[ref] ?? {};
}

/** The contacts a pose stands on: the extras' per state; the crawl's are the land state's with the crutches' tips. */
export function poseContacts(rig: TobiRig, ref: PoseRef): RigContact[] {
  if (ref === 'prop') return rig.contacts.land ?? [];
  if (ref === 'crawl') return rig.crawlContacts ?? [];
  return rig.contacts[ref] ?? [];
}

const sideOf = (n: string) => (/L(Front|Back)?$/.test(n) || /^(sole|blade|tip)L/.test(n) ? 'L' : /R(Front|Back)?$/.test(n) || /^(sole|blade|tip)R/.test(n) ? 'R' : '');
const isPec = (n: string) => /^(sole|blade|tip)/.test(n);

/**
 * The lowest point over a blend between two poses, as the ground offset it needs (m, model): the contacts of both ends
 * under the blended skeleton, those both ends share moved from one end's point to the other's with the blend (their
 * blend shapes do), the pectorals' from one end's sole to the other's blade.
 */
export function blendClearance(rig: TobiRig, a: PoseRef, b: PoseRef, steps = CLEAR_STEPS, raiseA = 15, raiseB = 15): number[] {
  const CA = poseContacts(rig, a), CB = poseContacts(rig, b);
  const lift = liftOf(rig, a, b);
  const pa0 = rigPose(rig, a, a === 'prop' ? raiseA : undefined), pb0 = rigPose(rig, b, b === 'prop' ? raiseB : undefined);
  const ga = groundOf(rig, a, raiseA), gb = groundOf(rig, b, raiseB);
  const out: number[] = [];
  const W = rigFK(rig, {});
  const P: V3 = [0, 0, 0], Q: V3 = [0, 0, 0];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, k = smooth(u);
    rigFK(rig, blendPoses(rig, pa0, pb0, u, lift), W);
    const g = lerp(ga, gb, k);
    let low = 0;
    for (const c of CA) {
      if (rig.index[c.bone] === undefined) continue;
      rigPoint(rig, W, c.bone, c.local, P);
      let d = CB.find((x) => x.name === c.name);
      if (!d && isPec(c.name)) d = CB.find((x) => isPec(x.name) && sideOf(x.name) === sideOf(c.name));
      if (d && rig.index[d.bone] !== undefined) { rigPoint(rig, W, d.bone, d.local, Q); P[1] = lerp(P[1], Q[1], k); }
      low = Math.max(low, g - P[1]);
    }
    for (const c of CB) {
      if (CA.some((x) => x.name === c.name) || isPec(c.name) || rig.index[c.bone] === undefined) continue;
      rigPoint(rig, W, c.bone, c.local, P);
      low = Math.max(low, g - P[1]);
    }
    out.push(low);
  }
  return out;
}

function liftOf(rig: TobiRig, a: PoseRef, b: PoseRef): number {
  return rig.lift[`${a}>${b}`] ?? rig.lift[`${b}>${a}`] ?? 0;
}

const RIGS = new WeakMap<object, TobiRig>();
let HERO_RIG: TobiRig | null = null;

/**
 * The rig tables of a tier from its root extras (LoadedModel.extras: { tobihaze: { … } } or the tobihaze object itself);
 * the hero's numbers without extras. Cached per extras object.
 */
export function tobiRig(extras?: Record<string, unknown> | null): TobiRig {
  const X = (extras && ((extras.tobihaze as Record<string, unknown> | undefined) ?? (extras.axes ? extras : null))) as Record<string, unknown> | null;
  if (!X || !X.axes || !X.crawl) return HERO_RIG ?? (HERO_RIG = heroRig());
  const hit = RIGS.get(X);
  if (hit) return hit;
  const rig = heroRig();
  rig.tier = String(X.tier ?? 'hero');
  rig.tl = Number(X.tlMM ?? 80) / 1000;
  rig.hl = Number(X.hlMM ?? 16.1345) / 1000;
  const Y0 = 0.3 * rig.hl, S0 = rig.tl / 2;
  /** the rig's fish frame [s, y, z] (mm from the snout) to the model's object frame (m) */
  const toObj = (p: number[]): V3 => [p[2] / 1000, p[1] / 1000 - Y0, S0 - p[0] / 1000];
  const fp = X.footprint as { width?: number; height?: number } | undefined;
  if (fp?.height) rig.height = fp.height;
  if (fp?.width) rig.width = fp.width;
  const { joints, index } = jointsOf(X.axes as Record<string, unknown>);
  rig.joints = joints; rig.index = index;
  // the states
  const S = (X.states ?? {}) as Record<string, { pose?: RigPose; groundM?: number }>;
  for (const k of ['land', 'reach', 'rest', 'water', 'swim'] as const) {
    if (!S[k]) continue;
    rig.states[k] = S[k].pose ?? {};
    if (typeof S[k].groundM === 'number') rig.ground[k] = S[k].groundM as number;
  }
  const C = (X.contacts ?? {}) as Record<string, RigContact[]>;
  for (const k of ['land', 'reach', 'rest', 'water', 'swim'] as const) if (C[k]) rig.contacts[k] = C[k].map((c) => ({ ...c, local: [c.local[0], c.local[1], c.local[2]] as V3 }));
  // the crawl cycle
  const CR = X.crawl as { frames: { phase: number; pose: RigPose; contacts?: { weld?: { L: number[]; R: number[] } | null } }[]; common?: RigPose; strideMM?: number; cycleS?: number; duty?: number; groundMM?: number; schedule?: { lift?: number[]; setDown?: number[] } };
  const common = CR.common ?? {};
  rig.crawl.frames = CR.frames.map((f) => ({ phase: f.phase, pose: { ...common, ...f.pose } }));
  rig.crawl.stride = (CR.strideMM ?? 15) / 1000;
  rig.crawl.cycleS = CR.cycleS ?? 0.5;
  rig.crawl.duty = CR.duty ?? 0.6;
  if (CR.schedule?.lift) rig.crawl.lift = CR.schedule.lift[1];
  if (CR.schedule?.setDown) rig.crawl.setDown = CR.schedule.setDown[0];
  if (typeof CR.groundMM === 'number') rig.ground.crawl = toObj([0, CR.groundMM, 0])[1];
  const segs: TobiRig['crawl']['segs'] = [];
  for (const f of CR.frames) {
    const w = f.contacts?.weld;
    if (!w || f.phase >= rig.crawl.duty) continue;
    const L = toObj(w.L), R = toObj(w.R), last = segs[segs.length - 1];
    if (!last || Math.hypot(L[0] - last.L[0], L[1] - last.L[1], L[2] - last.L[2]) > 1e-7) segs.push({ from: f.phase, L, R });
  }
  if (segs.length) rig.crawl.segs = segs;
  // the prop
  const PR = X.prop as { frames?: { raise: number; pose: RigPose; groundMM?: number }[]; common?: RigPose } | undefined;
  if (PR?.frames?.length) {
    const pc = PR.common ?? {};
    rig.prop.raises = PR.frames.map((f) => f.raise);
    rig.prop.poses = PR.frames.map((f) => ({ ...pc, ...f.pose }));
    rig.prop.ground = PR.frames.map((f) => (typeof f.groundMM === 'number' ? toObj([0, f.groundMM, 0])[1] : rig.ground.prop));
  }
  // what the forward kinematics tells: the cup, the soles, the chin, the eyes
  const land = rig.contacts.land ?? [];
  const find = (set: RigContact[] | undefined, n: string) => set?.find((c) => c.name === n);
  const pel = find(land, 'pelvic'), chin = find(land, 'chin'), soleL = find(land, 'soleL'), soleR = find(land, 'soleR');
  const cupLocal = (c: RigContact | undefined): V3 | null => (c ? [0, c.local[1], c.local[2]] : null);
  const W = rigFK(rig, {});
  const pt = (bone: string, local: V3 | null, out: V3) => (local && index[bone] !== undefined ? rigPoint(rig, W, bone, local, out) : out);
  if (rig.crawl.frames.length) {
    // the cup through the recovery (the body still): its middle
    rigFK(rig, crawlPose(rig, (rig.crawl.duty + 1) / 2), W);
    pt(pel?.bone ?? 'J_pelvic', cupLocal(pel), rig.crawl.cup);
    // each bearing point as a bone-local point of the crutch's last joint (where it touches, at its segment's start:
    // the rolling tip passes the weight from one to the next), and the crawl pose's contacts with the first
    const tipBone = index.J_pecTipL !== undefined ? 'J_pecTipL' : index.J_pecMidL !== undefined ? 'J_pecMidL' : 'J_pecL';
    for (const seg of rig.crawl.segs) {
      rigFK(rig, crawlPose(rig, seg.from), W);
      seg.bone = tipBone;
      seg.lL = rigLocal(rig, W, tipBone, seg.L);
      seg.lR = rigLocal(rig, W, tipBone.replace(/L$/, 'R'), seg.R);
    }
    const s0 = rig.crawl.segs[0];
    rig.crawlContacts = land.filter((c) => !isPec(c.name));
    if (s0.lL && s0.lR) {
      rig.crawlContacts.push({ name: 'tipL', kind: 'fin', bone: tipBone, local: s0.lL });
      rig.crawlContacts.push({ name: 'tipR', kind: 'fin', bone: tipBone.replace(/L$/, 'R'), local: s0.lR });
    }
  }
  if (rig.prop.poses.length) {
    rig.prop.cup = []; rig.prop.chin = []; rig.prop.eye = [];
    rig.prop.poses.forEach((p, i) => {
      rigFK(rig, p, W);
      if (i === 0 || rig.prop.raises[i] === 15) {
        if (soleL) pt(soleL.bone, soleL.local, rig.prop.soleL);
        if (soleR) pt(soleR.bone, soleR.local, rig.prop.soleR);
      }
      rig.prop.cup.push(pt(pel?.bone ?? 'J_pelvic', cupLocal(pel), [0, 0, 0]));
      rig.prop.chin.push(pt(chin?.bone ?? 'J_jaw', chin?.local ?? null, [0, 0, 0]));
      rig.prop.eye.push(index.J_eyeL !== undefined ? copy3([0, 0, 0], W.p[index.J_eyeL]) : [...rig.eye.prop] as V3);
    });
    const at15 = rig.prop.raises.findIndex((r) => r === 15);
    if (at15 >= 0) {
      rigFK(rig, rig.prop.poses[at15], W);
      if (soleL) pt(soleL.bone, soleL.local, rig.prop.soleL);
      if (soleR) pt(soleR.bone, soleR.local, rig.prop.soleR);
    }
  }
  if (rig.contacts.rest) { const c = find(rig.contacts.rest, 'pelvic'); rigFK(rig, rig.states.rest ?? {}, W); pt(c?.bone ?? 'J_pelvic', cupLocal(c), rig.restCup); }
  if (rig.contacts.water) { rigFK(rig, rig.states.water ?? {}, W); const c = find(rig.contacts.water, 'chin'); if (c) pt(c.bone, c.local, rig.waterChin); }
  if (index.J_eyeL !== undefined) {
    for (const k of ['land', 'reach', 'rest', 'water', 'swim'] as const) { if (!rig.states[k]) continue; rigFK(rig, rig.states[k]!, W); copy3(rig.eye[k], W.p[index.J_eyeL]); }
    copy3(rig.eye.prop, rig.eye.land); copy3(rig.eye.crawl, rig.eye.land);
  }
  const EY = (X.eyes as { L?: { radiusMM?: number } } | undefined)?.L;
  if (EY?.radiusMM) rig.eyeR = EY.radiusMM / 1000;
  // the transitions' lifts, then what every blend on the ground needs to stay out of it
  const T = (X.transitions ?? {}) as Record<string, { from?: string; to?: string; lift?: Record<string, Record<string, number>> }>;
  for (const tr of Object.values(T)) {
    const a = TRANSITION_POSE[tr.from ?? ''], b = TRANSITION_POSE[tr.to ?? ''];
    const v = tr.lift?.J_pecFin?.flexion ?? -(tr.lift?.J_pec?.depression ?? 0);
    if (a && b) rig.lift[`${a}>${b}`] = v;
  }
  const has = (p: PoseRef) => (p === 'crawl' ? rig.crawl.frames.length > 0 : p === 'prop' ? rig.prop.poses.length > 0 : !!rig.states[p]);
  for (const [a, b] of GROUND_PAIRS) if (has(a) && has(b)) rig.clear[`${a}>${b}`] = blendClearance(rig, a, b);
  RIGS.set(X, rig);
  return rig;
}

/** the model-frame height of the ground under a pose (the prop's at its raise) */
export function groundOf(rig: TobiRig, ref: PoseRef, raise = 15): number {
  if (ref !== 'prop') return rig.ground[ref];
  const R = rig.prop.raises, G = rig.prop.ground;
  if (!G.length) return rig.ground.prop;
  for (let i = 0; i < R.length - 1; i++) if (raise <= R[i + 1]) return lerp(G[i], G[i + 1], clamp((raise - R[i]) / (R[i + 1] - R[i]), 0, 1));
  return G[G.length - 1];
}

/** a pose's key for the clearance tables: the prop with its raise (to half a degree) */
const poseKey = (ref: PoseRef, raise: number) => (ref === 'prop' ? `prop@${Math.round(raise * 2) / 2}` : ref);

/**
 * The clearance a blend needs at u (m, model): measured once per rig, pair (and the prop's raise), the first time it is
 * used; the pairs the behaviour blends on the ground most are measured with the rig.
 */
export function clearAt(rig: TobiRig, a: PoseRef, b: PoseRef, u: number, raiseA = 15, raiseB = 15): number {
  const ka = poseKey(a, raiseA), kb = poseKey(b, raiseB);
  let t = rig.clear[`${ka}>${kb}`] ?? (raiseA === 15 && raiseB === 15 ? rig.clear[`${a}>${b}`] : undefined), x = u;
  if (!t) { t = rig.clear[`${kb}>${ka}`] ?? (raiseA === 15 && raiseB === 15 ? rig.clear[`${b}>${a}`] : undefined); x = 1 - u; }
  if (!t && a !== b && rig.joints.length) { t = rig.clear[`${ka}>${kb}`] = blendClearance(rig, a, b, CLEAR_STEPS, Math.round(raiseA * 2) / 2, Math.round(raiseB * 2) / 2); x = u; }
  if (!t) return a === b ? 0 : 0.00008;
  const f = clamp(x, 0, 1) * (t.length - 1), i = Math.min(t.length - 2, Math.floor(f));
  // (a hair over the sampled curve: it is linear between samples)
  return Math.max(t[i], t[i + 1]) + 0.00002;
}

/** an interpolated row of a by-raise table */
function byRaise(rig: TobiRig, rows: V3[], raise: number, out: V3): V3 {
  const R = rig.prop.raises;
  if (!rows.length) return set3(out, 0, 0, 0);
  if (raise <= R[0]) return copy3(out, rows[0]);
  for (let i = 0; i < R.length - 1; i++) {
    if (raise <= R[i + 1]) {
      const u = (raise - R[i]) / (R[i + 1] - R[i]), a = rows[i], b = rows[i + 1];
      return set3(out, lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));
    }
  }
  return copy3(out, rows[rows.length - 1]);
}

// ------------------------------------------------------------------------------------------------ the state

type Activity = 'rest' | 'move' | 'flee' | 'forage' | 'burrow' | 'display';
type Loco = 'still' | 'crawl' | 'hop' | 'swim' | 'taxi' | 'strike' | 'burrowIn' | 'hidden' | 'peek' | 'emerge' | 'roll';
type Posture = 'prop' | 'rest' | 'water' | 'float';
type GoalKind = 'land' | 'water' | 'burrow' | 'prey' | 'any';

interface EyeState { yaw: number; pitch: number; gy: number; gp: number; hold: number; lift: number; liftGoal: number; settle: number; blink: number; bt: number; bdur: number; next: number; track: number }

interface HopPlan {
  kind: 'hop' | 'skip' | 'entry' | 'exit' | 'pounce' | 'display';
  stage: 0 | 1 | 2 | 3;
  t: number;
  tc: number; tp: number; ta: number; tl: number;
  /** the root at the take-off, at the end of the push (where the flight starts) and at the landing */
  P0: V3; P1: V3; P2: V3;
  Q0: Q4; Q2: Q4;
  /** the flight's velocity at its start (m/s) */
  V: V3;
  curl: number;
  /** the launch angle (rad) */
  angle: number;
  from: PoseRef; to: PoseRef;
  gape: boolean;
}

interface St {
  state: TobiState;
  phase: string;
  t: number;
  pt: number;
  clock: number;
  act: Activity;
  actT: number;
  actDur: number;
  busy: boolean;
  param: string;
  urgency: number;
  loco: Loco;
  lt: number;
  posture: Posture;
  pose: PoseRef;
  /** a blend between two poses (the prop's raise at either end held through it) */
  blend: { from: PoseRef; to: PoseRef; u: number; dur: number; lift: number; ra: number; rb: number } | null;
  raise: number;
  raiseGoal: number;
  /** the root (world): position, rotation */
  P: V3;
  Q: Q4;
  heading: number;
  medium: Medium;
  depth: number;
  goal: { x: number; z: number; kind: GoalKind; tol: number } | null;
  /** the way to the goal is shut (water it does not want ahead): it stops where it is */
  blocked: boolean;
  threat: { x: number; z: number } | null;
  /** the escape's legs: to the refuge, then on through the water */
  fleeLeg: number;
  /** the crawl: its phase, this individual's cycle, this cycle's turn, the stance segment, the welds (world), the cup
   *  (world, the recovery's pivot), the recovery's start and goal rotations, the cycles left in the bout */
  cPhase: number;
  cCycle: number;
  cTurn: number;
  cSeg: number;
  cWeldL: V3;
  cWeldR: V3;
  cCup: V3;
  cQ0: Q4;
  cQ1: Q4;
  cLeft: number;
  cStop: boolean;
  cWet: Medium;
  hop: HopPlan | null;
  hopsLeft: number;
  /** soles welded in a prop (world), and since when */
  soleL: V3;
  soleR: V3;
  planted: boolean;
  swimPhase: number;
  swimAmp: number;
  speed: number;
  turnRate: number;
  alt: number;
  /** a strike: its pivot axis (the soles' line), the angle to the chin on the mud, the root it started from */
  sAngle: number;
  sP0: V3;
  sQ0: Q4;
  sDone: number;
  prey: { x: number; z: number } | null;
  /** foraging: scanning for prey, or swallowing what it caught */
  fPhase: 'scan' | 'swallow';
  fed: number;
  /** burrows it knows (its own first: burrows.ts lays them out round the home on the first update) and the one it is
   *  using (one of them) */
  burrows: TobiBurrow[];
  burrow: TobiBurrow | null;
  hidden: boolean;
  rollSide: number;
  /** micro: eyes, breathing, fins, skin, colour */
  eyes: [EyeState, EyeState];
  gape: number;
  gapeGoal: number;
  gulp: number;
  gulpT: number;
  gulpAge: number;
  refreshT: number;
  inflate: number;
  inflateGoal: number;
  vent: number;
  ventPh: number;
  d1: number;
  d1Goal: number;
  median: number;
  medianGoal: number;
  caudal: number;
  wet: number;
  mud: number;
  bars: number;
  dark: number;
  alert: number;
  rollT: number;
  trend: number;
  lastWater: number;
  lastEvt: Record<string, number>;
  nudge: [number, number];
  /** pushes it could not take (welded): enough of them while it rests and it steps aside */
  pushed: [number, number];
  pause: number;
  quirk: { cycle: number; swim: number; raise: number; bold: number };
}

export type TobiSnapshot = St;

// ------------------------------------------------------------------------------------------------ the behaviour

export function createTobihaze(o: TobiOptions): TobiApi {
  const rng = o.rng;
  let rig = tobiRig(o.extras ?? null);
  const L = o.length;
  /** model m → world m */
  let s = L / rig.tl;
  const H = () => rig.height * L;
  const home = o.home ?? { x: o.start.x, z: o.start.z };
  const r = (a: number, b: number) => a + (b - a) * rng();
  const juvenile = clamp((50 - L * 1000) / 20, 0, 1);
  let E: TobiEnv = { groundY: () => 0, waterY: () => -1 };
  const events: TobiEvent[] = [];

  const st: St = {
    state: 'IDLE', phase: 'prop', t: 0, pt: 0, clock: 0, act: 'rest', actT: 0, actDur: 6 + 10 * rng(), busy: false, param: '', urgency: 0,
    loco: 'still', lt: 0, posture: 'prop', pose: 'prop', blend: null, raise: 15, raiseGoal: 15,
    P: [o.start.x, 0, o.start.z], Q: [0, 0, 0, 1], heading: o.start.heading, medium: 'land', depth: -1,
    goal: null, blocked: false, threat: null, fleeLeg: 0,
    cPhase: 0, cCycle: 0.5, cTurn: 0, cSeg: 0, cWeldL: [0, 0, 0], cWeldR: [0, 0, 0], cCup: [0, 0, 0], cQ0: [0, 0, 0, 1], cQ1: [0, 0, 0, 1], cLeft: 0, cStop: false, cWet: 'land',
    hop: null, hopsLeft: 0, soleL: [0, 0, 0], soleR: [0, 0, 0], planted: false,
    swimPhase: 0, swimAmp: 0, speed: 0, turnRate: 0, alt: 0,
    sAngle: 0, sP0: [0, 0, 0], sQ0: [0, 0, 0, 1], sDone: 0, prey: null, fPhase: 'scan', fed: 0,
    burrows: [], burrow: null, hidden: false, rollSide: 1,
    eyes: [newEye(), newEye()],
    gape: 0, gapeGoal: 0, gulp: 0, gulpT: r(2, 6), gulpAge: 9, refreshT: r(60, 300), inflate: 0.2, inflateGoal: 0.2, vent: 0, ventPh: 0,
    d1: 0, d1Goal: 0, median: 0.3, medianGoal: 0.3, caudal: 0, wet: 0.8, mud: 0.1, bars: 0, dark: 0, alert: 0,
    rollT: logNormal(rng, TOBI.roll.medianS, 0.6), trend: 0, lastWater: Number.NaN, lastEvt: {}, nudge: [0, 0], pushed: [0, 0], pause: 0,
    quirk: { cycle: r(0.9, 1.1), swim: r(0.9, 1.1), raise: r(-2, 2), bold: r(0.85, 1.15) },
  };
  st.cCycle = clamp(rig.crawl.cycleS * st.quirk.cycle, TOBI.crawl.cycleS[0], TOBI.crawl.cycleS[1]);
  function newEye(): EyeState {
    return { yaw: TOBI.eyes.rest.yaw, pitch: TOBI.eyes.rest.pitch, gy: TOBI.eyes.rest.yaw, gp: TOBI.eyes.rest.pitch, hold: r(0.2, 2), lift: 0, liftGoal: 0, settle: 0, blink: 0, bt: -1, bdur: TOBI.eyes.blinkS, next: logNormal(rng, TOBI.eyes.medianS, TOBI.eyes.sigma), track: 0 };
  }
  // its burrow (a Y with two openings) at or near its home, and a couple of crab burrows about (behaviour §3.8: it
  // hides in its own or a crab's): the spot's, laid out on the first update, where the ground can be asked (burrows.ts).
  // (the four draws they once took from the individual's stream are still taken: its every other choice stays as it was)
  for (let i = 0; i < 4; i++) rng();

  // ---------------------------------------------------------------------- frames of reference

  const _v: V3 = [0, 0, 0], _w: V3 = [0, 0, 0], _q: Q4 = [0, 0, 0, 1], _q2: Q4 = [0, 0, 0, 1];
  const euler = { heading: 0, pitch: 0, roll: 0 };
  /** a model-frame point (m, the model's own size) → world, under the root (P, Q) */
  function toWorld(m: V3, out: V3, P: V3 = st.P, Q: Q4 = st.Q): V3 {
    qrot(Q, set3(_w, m[0] * s, m[1] * s, m[2] * s), out);
    return set3(out, out[0] + P[0], out[1] + P[1], out[2] + P[2]);
  }
  const ground = (x: number, z: number) => E.groundY(x, z);
  const depthAt = (x: number, z: number) => E.waterY(x, z) - E.groundY(x, z);
  const fwdX = (h: number) => Math.sin(h), fwdZ = (h: number) => Math.cos(h);

  /** the attitude that lies the body on the bed here (pitch from the ground ahead and behind, roll from either side) */
  function bedQ(x: number, z: number, h: number, out: Q4): Q4 {
    const e = 0.3 * L, w = 0.09 * L;
    const fx = fwdX(h), fz = fwdZ(h), lx = Math.cos(h), lz = -Math.sin(h);
    const gF = ground(x + fx * e, z + fz * e), gB = ground(x - fx * e, z - fz * e);
    const gL = ground(x + lx * w, z + lz * w), gR = ground(x - lx * w, z - lz * w);
    return qYXZ(h, -Math.atan2(gF - gB, 2 * e), Math.atan2(gL - gR, 2 * w), out);
  }
  /**
   * The root at (x, z) whose pose's ground plane touches the bed: the point under the origin along the body's down
   * (on that plane) is put on the ground. Only the height changes, so it can be applied every frame.
   */
  function seatOn(x: number, z: number, Q: Q4, groundM: number, out: V3): V3 {
    qrot(Q, set3(_w, 0, groundM * s, 0), _sv);
    return set3(out, x, ground(x + _sv[0], z + _sv[2]) - _sv[1], z);
  }
  const _sv: V3 = [0, 0, 0];
  /** where the root floats with the eyes just out of the water (the upper part of each dome above the surface) */
  function floatY(x: number, z: number, ref: PoseRef): number {
    const e = rig.eye[ref];
    return E.waterY(x, z) - s * (e[1] - TOBI.depth.floatClear * rig.eyeR);
  }
  /** root height resting on the bottom in a pose */
  const bedY = (x: number, z: number, ref: PoseRef) => ground(x, z) - s * rig.ground[ref];

  // ---------------------------------------------------------------------- events, states

  function emit(id: TobiEvent): void {
    if (!events.includes(id)) events.push(id);
    st.lastEvt[id] = st.clock;
  }
  function setState(ns: TobiState, phase: string): void {
    st.phase = phase;
    if (ns === st.state) return;
    st.state = ns; st.t = 0;
    emit(STATE_EVENT[ns]);
  }

  // ---------------------------------------------------------------------- sensing

  function sense(dt: number): void {
    const x = st.P[0], z = st.P[2];
    const w = E.waterY(x, z), g = ground(x, z);
    st.depth = w - g;
    const h = H(), hy = TOBI.depth.hysteresisH * h;
    const d = st.depth;
    // the medium, with a little hysteresis at each edge
    let m = st.medium;
    if (m === 'land') { if (d > TOBI.depth.shallowH * h + hy) m = 'water'; else if (d > TOBI.depth.landH * h + hy) m = 'shallow'; }
    else if (m === 'shallow') { if (d > TOBI.depth.shallowH * h + hy) m = 'water'; else if (d < TOBI.depth.landH * h - hy * 0.5) m = 'land'; }
    else if (d < TOBI.depth.shallowH * h - hy) m = d < TOBI.depth.landH * h ? 'land' : 'shallow';
    st.medium = m;
    // the tide's trend from the water at the body (the habitat steps it every 2 game-seconds: smoothed over ~20 s)
    if (dt > 0 && Number.isFinite(st.lastWater)) st.trend = ease(st.trend, (w - st.lastWater) / dt, dt, 0.05);
    st.lastWater = w;
    // the observer
    const p = E.player;
    st.alert = E.alert !== undefined ? clamp(E.alert, 0, 1) : ease(st.alert, 0, dt, 0.15);
    if (p && Number.isFinite(p.x)) {
      const dd = Math.hypot(p.x - x, p.z - z);
      if (st.act !== 'flee' && dd < TOBI.threat.alertM * st.quirk.bold) st.alert = Math.max(st.alert, clamp(1 - dd / (TOBI.threat.alertM * st.quirk.bold), 0, 1) * 0.6);
    }
    // the skin: wet in the water, drying on land (faster on dry mud), muddy from the mud, washed in the water
    // (no mucous cells: the film is the water it picks up rolling and wiping, §2.5; on wet mud it keeps damp, on dry mud
    // it dries in a few minutes)
    const wetMud = E.sample?.(x, z)?.wetness ?? 0.6;
    if (m !== 'land') { st.wet = ease(st.wet, 1, dt, 3); st.mud = ease(st.mud, 0, dt, 0.08); }
    else { const eq = 0.2 + 0.55 * clamp(wetMud, 0, 1); st.wet = st.wet > eq ? ease(st.wet, eq, dt, 1 / 300) : ease(st.wet, eq, dt, 1 / 60); }
    st.bars = ease(st.bars, st.act === 'flee' || st.alert > 0.75 ? 1 : 0, dt, st.act === 'flee' ? 3 : 0.05);
    st.dark = ease(st.dark, st.act === 'flee' || (st.act === 'burrow' && st.urgency > 0.6) ? 0.7 : 0, dt, st.act === 'flee' ? 2 : 0.04);
  }
  /** how dry the eyes and skin are: 0 on wet mud (blinks ≈ 85 s apart), 1 on dry mud (≈ 20 s; Aiello 2023) */
  const dryness = () => clamp((0.75 - st.wet) / 0.55, 0, 1);

  // ---------------------------------------------------------------------- the intents

  function setIntent(i: TobiIntent): void {
    // (before the first update it does not know where it is: kept until then)
    if (!started) { early = i; st.busy = true; return; }
    const secs = i.seconds && i.seconds > 0 ? i.seconds : 0;
    st.urgency = clamp(i.urgency ?? 0, 0, 1);
    st.param = i.param ?? '';
    st.actT = 0;
    st.busy = true;
    const from = i.from ?? null;
    switch (i.kind) {
      case 'rest': beginRest(secs || r(6, 20)); break;
      case 'wander': case 'moveTo':
        if (!i.target) { beginRest(secs || 4); break; }
        beginMove(i.target.x, i.target.z, secs || 20);
        break;
      case 'flee': beginFlee(from ?? (E.player ? { x: E.player.x, z: E.player.z } : null), i.target ?? null); break;
      case 'forage': beginForage(secs || r(3, 8)); break;
      case 'display': beginDisplay(secs || r(2, 5)); break;
      case 'burrow': beginBurrow(secs || r(10, 30)); break;
      case 'special': {
        const p = i.param ?? '';
        if (p === 'water_entry' || p === 'water_exit') {
          const t = i.target ?? null;
          if (t) beginMove(t.x, t.z, secs || 12);
          else beginRest(secs || 3);
        } else if (p === 'roll') {
          // (a roll to wet itself: it lies down, then over on its side)
          beginRest(secs || 6); st.rollT = 0;
          if (st.medium === 'land' && st.loco === 'still' && st.pose !== 'rest') to('rest', 0.5);
        }
        // (the tank's yawn, a gulp or a cheek display: the same thing to a mudskipper)
        else beginDisplay(secs || 3, p === 'yawn' ? 'gulp' : p || 'inflate');
        break;
      }
      default: beginRest(6);
    }
  }

  function beginRest(secs: number): void {
    st.act = 'rest'; st.actDur = secs; st.goal = null; st.prey = null;
    if (st.loco === 'crawl') st.cStop = true;
    if (st.hidden || st.loco === 'peek') { emergeFromBurrow(); return; }
    if (st.loco === 'swim' || st.loco === 'taxi') settleDown();
    // propped and alert while something is about, prone when calm (§3.6)
    if (st.medium === 'land' && (st.loco === 'still' || st.loco === 'crawl')) {
      const calm = st.alert < 0.25 && rng() < 0.55;
      if (st.loco === 'still') to(calm ? 'rest' : 'prop', 0.5);
    }
  }
  function beginMove(x: number, z: number, secs: number): void {
    if (st.hidden || st.loco === 'peek') emergeFromBurrow();
    st.act = 'move'; st.actDur = secs; st.prey = null;
    const t = clampToBounds(x, z);
    const d = depthAt(t.x, t.z);
    setGoal(t.x, t.z, d > 0.3 * H() ? 'water' : 'land', 0.6 * rig.crawl.stride * s + 0.05 * L);
    st.cLeft = Math.round(r(TOBI.crawl.bout[0], TOBI.crawl.bout[1]));
  }
  function setGoal(x: number, z: number, kind: GoalKind, tol: number): void {
    st.goal = { x, z, kind, tol };
    st.blocked = false;
  }
  function beginFlee(from: { x: number; z: number } | null, brainTarget: { x: number; z: number } | null): void {
    if (st.hidden) { st.act = 'flee'; st.actDur = r(5, 15); st.urgency = 1; st.threat = from; return; }
    st.act = 'flee'; st.actDur = 12; st.urgency = 1; st.threat = from; st.fleeLeg = 0;
    st.prey = null;
    // (a touch-close danger on land: both eyes drop at once, the reflex blink — 28 ms latency, 93 ms down)
    if (st.medium === 'land') for (const e of st.eyes) if (e.bt < 0) { e.bt = 0; e.bdur = 0.3; }
    // (the escape is seen as it starts, even when the burrow it dives into is right there)
    emit('escape');
    if (st.loco === 'peek') { duckIn(); return; }
    const x = st.P[0], z = st.P[2];
    let ax = 0, az = 0;
    if (from) { ax = x - from.x; az = z - from.z; }
    else if (brainTarget) { ax = brainTarget.x - x; az = brainTarget.z - z; }
    else { ax = fwdX(st.heading); az = fwdZ(st.heading); }
    const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    if (st.medium === 'land') {
      // a burrow within reach (and not past the danger), else the water, else just away (§3.10)
      const canDig = E.canBurrow !== false;
      let best: TobiBurrow | null = null, bd = TOBI.threat.burrowM * st.quirk.bold;
      if (canDig) for (const b of st.burrows) {
        const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz);
        if (d < bd && (d < 0.05 || (dx * ax + dz * az) / d > -0.2) && depthAt(b.x, b.z) < 0.3 * H()) { bd = d; best = b; }
      }
      if (best) { st.burrow = best; setGoal(best.x, best.z, 'burrow', 0.35 * L); st.hopsLeft = 8; return; }
      const wtr = ringSearch(x, z, TOBI.threat.waterM, Math.max(0.12, 2.5 * L), (px, pz) => depthAt(px, pz) > 0.5 * H(), ax, az);
      if (wtr) { setGoal(wtr.x, wtr.z, 'water', 0.5 * L); st.hopsLeft = 12; return; }
      const n = Math.round(lerp(TOBI.hop.escapeHops[0], TOBI.hop.escapeHops[1], clamp(st.alert, 0, 1)));
      const dist = n * 1.6 * L;
      const t = clampToBounds(x + ax * dist, z + az * dist);
      setGoal(t.x, t.z, 'any', 0.8 * L); st.hopsLeft = n;
      return;
    }
    fleeThroughWater(ax, az);
  }
  /** away through the water: a burst of swimming, skipping over it where it is shallow (§3.4) */
  function fleeThroughWater(ax: number, az: number): void {
    // (on into deeper water, away from the danger as far as the water allows; straight away where it is all deep)
    const here = depthAt(st.P[0], st.P[2]), want = Math.max(here + 0.2 * H(), TOBI.depth.shallowH * H());
    const deeper = ringSearch(st.P[0], st.P[2], 1.2, Math.max(0.1, 2 * L), (x, z) => depthAt(x, z) > want, ax, az);
    const dist = r(0.5, 1.2);
    const t = deeper ?? clampToBounds(st.P[0] + ax * dist, st.P[2] + az * dist);
    setGoal(t.x, t.z, 'water', 0.5 * L);
    st.hopsLeft = Math.round(r(TOBI.skip.hops[0], 6));
    st.fleeLeg = 1;
  }
  function beginForage(secs: number): void {
    if (st.hidden || st.loco === 'peek') emergeFromBurrow();
    st.act = 'forage'; st.actDur = secs; st.goal = null; st.prey = null; st.sDone = 0; st.fed = 0;
    if (st.loco === 'crawl') st.cStop = true;
  }
  function beginDisplay(secs: number, param = st.param || 'alert'): void {
    if (st.hidden || st.loco === 'peek') emergeFromBurrow();
    st.act = 'display'; st.actDur = secs; st.param = param; st.goal = null;
    if (st.loco === 'crawl') st.cStop = true;
  }
  function beginBurrow(secs: number): void {
    st.act = 'burrow'; st.actDur = secs;
    if (st.hidden) return;
    if (E.canBurrow === false || st.medium !== 'land') { beginRest(secs); st.busy = true; return; }
    const x = st.P[0], z = st.P[2];
    let best: TobiBurrow | null = st.burrows[0] ?? null, bd = Infinity;
    for (const b of st.burrows) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd && depthAt(b.x, b.z) < 0.3 * H()) { bd = d; best = b; } }
    // more than a metre off, or under water: a crab's hole near where it is (they riddle the mud: 0.4–4 a m², §3.8),
    // on mud only; none: it rests where it is
    if (bd > 1) {
      best = null;
      for (let k = 0; k < 6 && !best; k++) {
        const a = st.heading + r(-0.8, 0.8), d = r(0.5, 3) * L;
        best = holeAt(x + Math.sin(a) * d, z + Math.cos(a) * d, E);
      }
      if (!best) { beginRest(secs); st.busy = true; return; }
      remember(st.burrows, best, st.burrow);
    }
    st.burrow = best;
    setGoal(best.x, best.z, 'burrow', 0.35 * L);
    st.cLeft = 12;
  }

  function clampToBounds(x: number, z: number): { x: number; z: number } {
    const b = E.bounds;
    if (!b) return { x, z };
    const m = 0.55 * L;
    return { x: clamp(x, b.minX + m, b.maxX - m), z: clamp(z, b.minZ + m, b.maxZ - m) };
  }

  /**
   * Rings round (x, z), nearest first, each a dozen rays (offset half a ray every other ring): the first ring with a
   * point that passes, the one most along (ax, az) when a direction is given.
   */
  function ringSearch(x: number, z: number, rMax: number, step: number, ok: (x: number, z: number) => boolean, ax = 0, az = 0): { x: number; z: number } | null {
    const rays = 12;
    for (let k = 1; k * step <= rMax + 1e-9; k++) {
      const rr = k * step;
      let best: { x: number; z: number } | null = null, bs = -Infinity;
      for (let i = 0; i < rays; i++) {
        const a = ((i + (k % 2) * 0.5) / rays) * TAU, dx = Math.sin(a), dz = Math.cos(a);
        const px = x + dx * rr, pz = z + dz * rr;
        const b = E.bounds;
        if (b && (px < b.minX || px > b.maxX || pz < b.minZ || pz > b.maxZ)) continue;
        if (!ok(px, pz)) continue;
        const sc = dx * ax + dz * az;
        if ((ax || az) && sc < -0.35) continue;
        if (sc > bs) { bs = sc; best = { x: px, z: pz }; }
      }
      if (best) return best;
    }
    return null;
  }

  // ---------------------------------------------------------------------- postures and blends

  /** blend from the current pose to another over dur (s); the root follows the two poses' ground and the clearance */
  function to(ref: PoseRef, dur: number): void {
    if (st.pose === ref && !st.blend) { st.posture = postureOf(ref, st.posture); return; }
    const from = st.blend ? st.blend.to : st.pose;
    if (from === ref) return;
    // (the prop a blend goes to is the transitions' prop at 15°, unseen at the blend's start; a prop it leaves keeps its
    // raise through the blend)
    if (ref === 'prop') st.raise = 15;
    st.blend = { from, to: ref, u: 0, dur: Math.max(0.05, dur), lift: liftOf(rig, from, ref), ra: st.raise, rb: st.raise };
    st.pose = ref;
    st.posture = postureOf(ref, st.posture);
    st.planted = false;
  }
  function postureOf(ref: PoseRef, p: Posture): Posture {
    return ref === 'prop' || ref === 'land' || ref === 'crawl' || ref === 'reach' ? 'prop' : ref === 'rest' ? 'rest' : ref === 'water' ? (p === 'float' ? 'float' : 'water') : p;
  }
  /** the ground offset of the current (blended) pose and the clearance it needs (m, model) */
  function poseGround(): number {
    const b = st.blend;
    if (!b) return groundOf(rig, st.pose, st.raise);
    return lerp(groundOf(rig, b.from, b.ra), groundOf(rig, b.to, b.rb), smooth(b.u)) - clearAt(rig, b.from, b.to, b.u, b.ra, b.rb);
  }

  // ---------------------------------------------------------------------- the step

  function step(dt: number): void {
    st.clock += dt; st.t += dt; st.pt += dt; st.lt += dt; st.actT += dt;
    sense(dt);
    if (st.blend) { st.blend.u += dt / st.blend.dur; if (st.blend.u >= 1) st.blend = null; }
    takeNudge();
    switch (st.act) {
      case 'rest': actRest(dt); break;
      case 'move': actMove(dt); break;
      case 'flee': actFlee(dt); break;
      case 'forage': actForage(); break;
      case 'burrow': actBurrow(dt); break;
      case 'display': actDisplay(dt); break;
    }
    locomote(dt);
    micro(dt);
    label();
    if (o.autonomous && !st.busy) think();
  }

  /** the brain's choices when there is no brain (the viewer's fish, tests) */
  function think(): void {
    const u = rng();
    const near = () => { const a = r(0, TAU), d = r(0.06, 0.4); return { x: st.P[0] + Math.sin(a) * d, z: st.P[2] + Math.cos(a) * d }; };
    if (u < 0.45) setIntent({ kind: 'rest', seconds: r(4, 15) });
    else if (u < 0.75) setIntent({ kind: 'wander', target: near(), seconds: 20 });
    else if (u < 0.9) setIntent({ kind: 'forage', seconds: r(3, 8) });
    else setIntent({ kind: 'display', seconds: r(2, 4), param: 'inflate' });
  }

  // ---------------------------------------------------------------------- activities

  /** done with the intent: the brain may choose again */
  function done(): void { st.busy = false; }

  /** a way it cannot finish: stop (swimming: settle; crawling: at the end of this cycle), then rest */
  function giveUp(): void {
    st.goal = null;
    if (st.loco === 'swim' || st.loco === 'taxi') settleDown();
    else if (st.loco === 'crawl') st.cStop = true;
    if (st.loco === 'still' && !st.blend) toRest(3);
  }
  /** the intent is done: it rests where it is until the brain says otherwise */
  function toRest(secs: number): void {
    done();
    st.act = 'rest'; st.actT = 0; st.actDur = secs; st.urgency = 0;
  }

  function actRest(dt: number): void {
    if (st.loco === 'swim' || st.loco === 'taxi') { settleDown(); return; }
    if (st.loco !== 'still') return;
    // (the way to dry mud it took from the flood is behind it)
    if (st.goal && !st.blend) st.goal = null;
    reactToWater();
    if (st.loco !== 'still') return;
    // the posture: the prop's raise follows the alert; now and then it lies down or props itself up again (§3.6)
    if (st.medium === 'land') {
      st.raiseGoal = clamp(13 + st.quirk.raise + 10 * st.alert, TOBI.raiseDeg[0], TOBI.raiseDeg[1]);
      if (!st.blend && st.pt > 4 && rng() < dt / 12) {
        if (st.pose === 'prop' && st.alert < 0.3) to('rest', 0.6);
        else if (st.pose === 'rest') to('prop', 0.5);
        st.pt = 0;
      }
      if (st.pose === 'rest' && st.alert > 0.45 && !st.blend) to('prop', 0.4);
      // drying: it rolls on wet mud to wet its eyes and skin, more often the drier it is (§3.9; never in the water)
      st.rollT -= dt * (1 + 2.5 * dryness());
      if (st.rollT <= 0 && st.pose === 'rest' && !st.blend && (E.sample?.(st.P[0], st.P[2])?.wetness ?? 0.6) > 0.25) startRoll();
    }
    if (st.actT >= st.actDur) done();
  }

  /** the water came up round a resting fish, or went away from under it */
  function reactToWater(): void {
    if (st.loco !== 'still' || st.blend) return;
    if (st.medium === 'land') {
      if (st.pose === 'water' || st.pose === 'swim') to('prop', 0.45);
      return;
    }
    // the flood: it keeps ahead of the water while there is dry mud near (TideWait, §3.6, §4.2)
    if (st.medium === 'shallow' && st.trend > 2e-5 && (st.act === 'rest' || st.act === 'display') && !st.goal) {
      const dry = ringSearch(st.P[0], st.P[2], 1.2, Math.max(0.06, 1.2 * L), (x, z) => depthAt(x, z) < -0.25 * H());
      if (dry) { setGoal(dry.x, dry.z, 'land', 0.6 * rig.crawl.stride * s); st.cLeft = 12; startCrawl(); return; }
    }
    if (st.pose !== 'water') to('water', 0.5);
  }

  function actMove(dt: number): void {
    if (navigate(dt)) {
      st.goal = null;
      if (st.loco === 'still' && !st.blend) {
        if (st.medium === 'land' && st.pose !== 'prop' && st.pose !== 'rest') to('prop', 0.3);
        toRest(r(2, 6));
      }
    }
    // (a way it cannot finish: it stops where it is)
    if (st.actT > st.actDur + 10) giveUp();
  }

  function actFlee(dt: number): void {
    if (st.hidden || st.loco === 'burrowIn' || st.loco === 'hidden') {
      if (st.hidden && st.loco === 'hidden' && st.actT > st.actDur) { st.act = 'burrow'; st.actDur = r(5, 15); st.actT = 0; done(); }
      return;
    }
    if (navigate(dt) && st.loco === 'still' && !st.blend && !st.hop) {
      // at the refuge: on through the water a little way once it is in it, then done
      if (st.medium !== 'land' && st.fleeLeg === 0) {
        const t = st.threat;
        let ax = fwdX(st.heading), az = fwdZ(st.heading);
        if (t) { const dx = st.P[0] - t.x, dz = st.P[2] - t.z, l = Math.hypot(dx, dz) || 1; ax = dx / l; az = dz / l; }
        fleeThroughWater(ax, az);
        return;
      }
      st.goal = null;
      toRest(r(3, 8));
    }
    if (st.actT > 30) giveUp();
  }

  /**
   * Toward st.goal by whatever suits where it is: crutching (short ways, the edge), hops (long or hurried ways), a hop
   * into or out of the water at the edge, swimming or taxiing in it. True once there (or stopped for good).
   */
  function navigate(dt: number): boolean {
    const g = st.goal;
    if (!g) return true;
    if (st.loco !== 'still' && st.loco !== 'swim' && st.loco !== 'taxi') return false;
    if (st.loco === 'still' && st.blend) return false;
    if (st.blocked) { if (st.loco !== 'still') settleDown(); return st.loco === 'still' && !st.blend; }
    if (st.pause > 0 && st.loco === 'still') { st.pause -= dt; return false; }
    const x = st.P[0], z = st.P[2];
    const dx = g.x - x, dz = g.z - z, d = Math.hypot(dx, dz);
    if (g.kind === 'burrow' && d < g.tol + 0.5 * L) {
      if (st.loco !== 'still') settleDown();
      else startBurrowIn();
      return false;
    }
    if (d < g.tol) { if (st.loco !== 'still') settleDown(); return st.loco === 'still' && !st.blend; }
    const hurry = st.act === 'flee' || st.urgency > 0.7;
    if (st.medium === 'land') {
      if (st.loco !== 'still') { settleDown(); return false; }
      // the edge: into the water on purpose with a hop, else never into it by accident
      const wantWater = g.kind === 'water' || depthAt(g.x, g.z) > 0.3 * H();
      if (wantWater) {
        const reach = Math.min(d, hopRange(hurry ? 2.5 : 1.6));
        const lx = x + (dx / d) * reach, lz = z + (dz / d) * reach;
        if (depthAt(lx, lz) > 0.3 * H()) { startHop('entry', lx, lz); return false; }
      }
      // long or hurried ways go by hops (it feeds 干潟を跳びはねながら: single hops among the crutching, §3.2)
      if (hurry || (d > 4 * L && rng() < 0.6)) {
        const reach = Math.min(d, hopRange(hurry ? 2.4 : 1.6));
        let lx = x + (dx / d) * reach, lz = z + (dz / d) * reach;
        if (!wantWater && depthAt(lx, lz) > 0.1 * H()) { const c = landShort(x, z, lx, lz); lx = c.x; lz = c.z; }
        if (Math.hypot(lx - x, lz - z) > 0.7 * L) { startHop('hop', lx, lz); return false; }
      }
      startCrawl();
      return false;
    }
    // in the water: out onto the mud with a hop at the edge (§3.5), else swim (deep) or taxi / crutch (shallow)
    if (g.kind !== 'water' && depthAt(g.x, g.z) <= 0.3 * H()) {
      const reach = Math.min(d, hopRange(1.3));
      const lx = x + (dx / d) * reach, lz = z + (dz / d) * reach;
      if (depthAt(lx, lz) <= 0.05 * H() && (st.medium === 'shallow' || d < 3 * L)) { startHop('exit', lx, lz); return false; }
    }
    if (st.medium === 'shallow') {
      if (hurry && st.hopsLeft > 0 && d > 1.5 * L && st.loco !== 'swim') {
        // (a skip lands in the water: no farther than the water goes)
        const reach = Math.min(d, TOBI.skip.lenM);
        let lx = x + (dx / d) * reach, lz = z + (dz / d) * reach;
        if (depthAt(lx, lz) < 0.3 * H()) { const c = waterShort(x, z, lx, lz); lx = c.x; lz = c.z; }
        if (Math.hypot(lx - x, lz - z) > 1.2 * L) { startHop('skip', lx, lz); return false; }
        st.hopsLeft = 0;
      }
      if (canFloat(x, z)) { if (st.loco !== 'taxi') startSwim('taxi'); }
      else if (st.loco === 'still') startCrawl();
      else settleDown();
      return false;
    }
    if (st.loco !== 'swim') startSwim('swim');
    return false;
  }

  /** the last point on the way from (x, z) to (lx, lz) still in water a third of the body deep */
  function waterShort(x: number, z: number, lx: number, lz: number): { x: number; z: number } {
    let a = 0, b = 1;
    for (let i = 0; i < 10; i++) { const m = (a + b) / 2; if (depthAt(lerp(x, lx, m), lerp(z, lz, m)) < 0.3 * H()) b = m; else a = m; }
    return { x: lerp(x, lx, a * 0.9), z: lerp(z, lz, a * 0.9) };
  }
  /** the last point on the way from (x, z) to (lx, lz) still on exposed ground */
  function landShort(x: number, z: number, lx: number, lz: number): { x: number; z: number } {
    let a = 0, b = 1;
    for (let i = 0; i < 10; i++) { const m = (a + b) / 2; if (depthAt(lerp(x, lx, m), lerp(z, lz, m)) > 0.05 * H()) b = m; else a = m; }
    return { x: lerp(x, lx, a * 0.9), z: lerp(z, lz, a * 0.9) };
  }

  /** a hop's reach (m): bl body lengths, more for a juvenile (≈ 5 BL under 40 mm, §3.4), never past 3 BL of an adult */
  function hopRange(bl: number): number {
    return Math.min(TOBI.hop.rangeMaxBL * (1 + 0.8 * juvenile), bl * (1 + 1.5 * juvenile)) * L;
  }
  function canFloat(x: number, z: number): boolean {
    return depthAt(x, z) > floatDepth();
  }
  /** the water it floats in with the eyes out (taxiing), ≈ its own height; shallower it stands and crutches */
  function floatDepth(): number {
    return s * (rig.eye.swim[1] - TOBI.depth.floatClear * rig.eyeR - rig.ground.swim) + 0.02 * H();
  }

  function actForage(): void {
    if (st.loco === 'swim' || st.loco === 'taxi') { settleDown(); return; }
    if (st.loco !== 'still' || st.blend) return;
    // (back from creeping closer: a short look before it decides again)
    if (st.goal) { st.goal = null; st.pt = 0; st.sDone = r(0.3, 1.2); }
    if (st.medium === 'land' && st.pose !== 'prop') { to('prop', 0.35); return; }
    if (st.medium !== 'land' && st.pose !== 'water') { to('water', 0.4); return; }
    if (st.actT >= st.actDur) { toRest(r(2, 5)); return; }
    // scan: still, the head toward the mud ahead, both eyes forward and down (§3.7: the sharpest vision is there)
    if (!st.prey) {
      const a = st.heading + r(-0.6, 0.6), d = (0.45 + r(0.1, 1.0)) * L;
      st.prey = { x: st.P[0] + Math.sin(a) * d, z: st.P[2] + Math.cos(a) * d };
      st.pt = 0; st.fPhase = 'scan';
      st.sDone = r(TOBI.scanS[0], TOBI.scanS[1]);
    }
    if (st.medium === 'land') st.raiseGoal = 20 + st.quirk.raise;
    if (st.pt <= st.sDone) return;
    if (st.fPhase === 'swallow') { st.prey = null; st.fPhase = 'scan'; return; }
    // then a strike (≤ 0.25 BL from the snout), a pounce (≤ 1.1 BL), or creep closer
    const p = st.prey, dx = p.x - st.P[0], dz = p.z - st.P[2], dist = Math.hypot(dx, dz) - 0.45 * L;
    const off = Math.abs(wrap(Math.atan2(dx, dz) - st.heading));
    if (dist <= TOBI.strike.maxBL * L && off < 0.6) startStrike();
    else if (st.medium === 'land' && dist > 0.4 * L && dist <= TOBI.strike.pounceBL[1] * L && off < 0.3 && rng() < 0.5) startHop('pounce', p.x - Math.sin(st.heading) * 0.45 * L, p.z - Math.cos(st.heading) * 0.45 * L);
    else if (st.medium === 'land') { setGoal(p.x, p.z, 'prey', 0.5 * L); st.cLeft = Math.ceil(dist / (rig.crawl.stride * s)) + 2; startCrawl(); }
    else st.prey = null;
  }

  function actDisplay(dt: number): void {
    if (st.loco === 'swim' || st.loco === 'taxi') settleDown();
    if (st.loco !== 'still') return;
    reactToWater();
    if (st.medium === 'land' && st.pose !== 'prop' && !st.blend) to('prop', 0.35);
    // D1 first, then the second dorsal and the anal, then the cheeks and the head up (§3.11)
    const k = st.actT, full = st.param !== 'gulp';
    st.d1Goal = full ? 1 : 0.4;
    st.medianGoal = full && k > 0.3 ? 1 : 0.3;
    if (k > 0.5) st.inflateGoal = full ? 1 : 0.5;
    if (st.medium === 'land') st.raiseGoal = 25;
    if (st.actT < dt * 1.5 || st.clock - (st.lastEvt.display ?? -1e9) > TOBI.reEmitS) emit('display');
    if (st.actT >= st.actDur) { st.d1Goal = 0; st.medianGoal = 0.3; st.inflateGoal = 0.2; toRest(r(2, 6)); }
  }

  function actBurrow(dt: number): void {
    if (st.loco === 'hidden') {
      // a look out first, longer while the observer is close (§3.8 peek)
      if (st.actT >= st.actDur) startPeek();
      return;
    }
    if (st.loco === 'peek') {
      const p = E.player, near = p ? Math.hypot(p.x - st.P[0], p.z - st.P[2]) < 1.5 : false;
      if (near && st.alert > 0.6 && st.lt > 0.5) { duckIn(); return; }
      if (st.lt > st.sDone) emergeFromBurrow();
      return;
    }
    if (st.loco === 'emerge' || st.loco === 'burrowIn') return;
    if (st.actT > 30 && st.goal && st.loco === 'still' && !st.blend) { st.goal = null; st.burrow = null; }
    if (navigate(dt) && st.loco === 'still' && !st.blend) {
      // (no way to its burrow: a crab's hole where it is, on mud; none, and it rests)
      if (st.blocked || !st.burrow) {
        st.blocked = false;
        const h = holeAt(st.P[0] + fwdX(st.heading) * 0.5 * L, st.P[2] + fwdZ(st.heading) * 0.5 * L, E);
        if (!h) { st.goal = null; st.burrow = null; toRest(r(2, 6)); return; }
        remember(st.burrows, h, st.burrow);
        st.burrow = h;
      }
      startBurrowIn();
    }
  }
  // ---------------------------------------------------------------------- locomotion

  function locomote(dt: number): void {
    switch (st.loco) {
      case 'still': still(dt); break;
      case 'crawl': crawl(dt); break;
      case 'hop': hop(dt); break;
      case 'swim': case 'taxi': swim(dt); break;
      case 'strike': strike(); break;
      case 'burrowIn': burrowIn(); break;
      case 'hidden': break;
      case 'peek': st.raiseGoal = 20; break;
      case 'emerge': emerge(); break;
      case 'roll': roll(); break;
    }
  }

  /**
   * Still. On land, once settled, nothing moves the root: the prop stands on its welded soles (its raise changes about
   * them: the GLB's prop frames hold them where they are), the prone rest on its cup. While a pose blends (a re-plant,
   * lying down, getting up) the body rests on its belly, its attitude easing onto the bed and its height following the
   * two poses' ground and the blend's clearance. In the water it lies on the bottom, or floats with the eyes out of a
   * film too deep to stand in.
   */
  function still(dt: number): void {
    // (the prop's raise eases to its goal, and holds through a blend with the prop)
    const b = st.blend;
    if (!b || (b.from !== 'prop' && b.to !== 'prop')) st.raise = ease(st.raise, clamp(st.raiseGoal, TOBI.raiseDeg[0], TOBI.raiseDeg[1]), dt, 2.5);
    const x = st.P[0], z = st.P[2];
    if (st.medium === 'land' || st.pose === 'prop' || st.pose === 'rest' || st.pose === 'crawl' || st.pose === 'reach') {
      if (st.blend) {
        st.planted = false;
        bedQ(x, z, st.heading, _q);
        qslerp(st.Q, _q, 1 - Math.exp(-dt * 8), st.Q);
        seatOn(x, z, st.Q, poseGround(), st.P);
        return;
      }
      if (st.planted) return;
      bedQ(x, z, st.heading, st.Q);
      seatOn(x, z, st.Q, poseGround(), st.P);
      if (st.pose === 'prop') plantSoles();
      else if (st.pose === 'rest') st.planted = true;
      return;
    }
    // in the water: the bottom (its blend's ground and clearance), or the film's surface with the eyes out
    st.planted = false;
    bedQ(x, z, st.heading, _q);
    qslerp(st.Q, _q, 1 - Math.exp(-dt * 6), st.Q);
    const bed = ground(x, z) - s * poseGround();
    const y = Math.max(bed, st.medium === 'shallow' ? floatY(x, z, st.pose === 'swim' ? 'swim' : 'water') : -Infinity);
    st.posture = y > bed + 1e-5 ? 'float' : 'water';
    st.P[1] = Math.max(bed, ease(st.P[1], y, dt, 6));
  }

  /** the prop's planted soles (world), welded until the body leaves the prop */
  function plantSoles(): void {
    toWorld(rig.prop.soleL, st.soleL);
    toWorld(rig.prop.soleR, st.soleR);
    st.planted = true;
  }

  // ---- crawling (§3.1)

  function startCrawl(): void {
    if (st.loco === 'crawl') return;
    st.loco = 'crawl'; st.lt = 0;
    st.cSeg = 0; st.cTurn = 0; st.cStop = false;
    const hurry = st.urgency > 0.7, wet = st.medium !== 'land';
    const soft = (E.sample?.(st.P[0], st.P[2])?.substrate ?? 'mud') === 'mud' ? TOBI.crawl.softMud : 1;
    st.cCycle = wet ? TOBI.crawl.waterCycleS * st.quirk.cycle : hurry ? TOBI.crawl.hurryCycleS : clamp(rig.crawl.cycleS * st.quirk.cycle * soft, TOBI.crawl.cycleS[0], TOBI.crawl.cycleS[1]);
    st.cWet = st.medium;
    if (st.cLeft <= 0) st.cLeft = Math.round(r(TOBI.crawl.bout[0], TOBI.crawl.bout[1]));
    // the first cycle starts once the fins are re-planted where the crawl's phase 0 has them
    st.cPhase = -1;
    if (st.pose !== 'crawl') to('crawl', st.pose === 'rest' ? 0.4 : 0.25);
    st.planted = false;
  }

  function plantCrutches(): void {
    const seg = rig.crawl.segs[st.cSeg];
    toWorld(seg.L, st.cWeldL); toWorld(seg.R, st.cWeldR);
  }

  function crawl(dt: number): void {
    if (st.cPhase < 0) {
      still(dt);
      if (!st.blend) { st.cPhase = 0; st.cSeg = 0; st.planted = false; plantCrutches(); }
      return;
    }
    const C = rig.crawl, D = C.duty;
    const was = st.cPhase;
    st.cPhase += dt / st.cCycle;
    // the bearing point passes to the next part of the crutch's tip as it rolls: a new weld, where that part touches
    while (st.cSeg + 1 < C.segs.length && was < D && Math.min(st.cPhase, D) >= C.segs[st.cSeg + 1].from) { st.cSeg++; plantCrutches(); }
    if (was < D && st.cPhase >= D) beginRecovery();
    if (st.cPhase >= D) {
      // the recovery: the body on its cup turns about the cup's contact (and settles onto the next touch-down's attitude)
      const u = clamp((Math.min(st.cPhase, 1) - D) / (1 - D), 0, 1);
      qslerp(st.cQ0, st.cQ1, smooth(u), st.Q);
      qrot(st.Q, set3(_w, C.cup[0] * s, C.cup[1] * s, C.cup[2] * s), _v);
      set3(st.P, st.cCup[0] - _v[0], st.cCup[1] - _v[1], st.cCup[2] - _v[2]);
      yxzOf(st.Q, euler); st.heading = euler.heading;
    }
    if (st.cPhase >= 1) {
      // the cycle is over: the root takes over the stride J_root carried; the fins have touched down again
      qrot(st.Q, set3(_w, 0, 0, C.stride * s), _v);
      set3(st.P, st.P[0] + _v[0], st.P[1] + _v[1], st.P[2] + _v[2]);
      st.cPhase = Math.min(st.cPhase - 1, 0.25);
      st.cSeg = 0;
      st.mud = Math.min(1, st.mud + 0.01);
      if (st.cStop) { stopCrawl(); return; }
      plantCrutches();
    }
  }

  /** the end of the stance (set down on the cup and the belly): plan the recovery's turn and the next touch-down */
  function beginRecovery(): void {
    const C = rig.crawl;
    copy4(st.cQ0, st.Q);
    toWorld(C.cup, st.cCup);
    const g = st.goal;
    const left = g ? Math.hypot(g.x - st.cCup[0], g.z - st.cCup[2]) : 0;
    const want = g && left > 0.3 * L ? wrap(Math.atan2(g.x - st.cCup[0], g.z - st.cCup[2]) - st.heading) : 0;
    const maxT = TOBI.crawl.maxTurnDeg * DEG;
    st.cTurn = clamp(want, -maxT, maxT);
    // is this cycle the last? (there, the bout over, no goal, the water ahead it does not want)
    st.cLeft--;
    const stride = C.stride * s;
    // (after prey it creeps until the cup is a third of a body length short of it: the snout within a strike)
    const there = !g || left <= stride * 1.15 + g.tol || (g.kind === 'prey' && left < 0.35 * L);
    let stop = st.cStop || there || st.cLeft <= 0;
    if (g && !stop) {
      const h = st.heading + st.cTurn, nx = st.cCup[0] + Math.sin(h) * stride * 1.6, nz = st.cCup[2] + Math.cos(h) * stride * 1.6;
      const deep = depthAt(nx, nz);
      const wantWater = g.kind === 'water' || depthAt(g.x, g.z) > 0.3 * H();
      // (it crutches through a film, never into water deep enough to taxi in, nor deeper into water it does not want)
      if (deep > floatDepth() || (!wantWater && deep > Math.max(0.3 * H(), st.depth + 0.1 * H()))) { stop = true; if (!wantWater) st.blocked = true; }
    }
    st.cStop = stop;
    solveTouchdown(st.heading + st.cTurn, stop, st.cQ1);
    if (stop && !there && st.cLeft <= 0) st.pause = r(TOBI.crawl.pauseS[0], TOBI.crawl.pauseS[1]);
  }

  /**
   * The rotation at the end of the recovery: heading h, and the pitch and roll about the cup that put the next cycle's
   * first bearing points on the mud (two heights, two angles: Newton, three rounds), within 25° of the bed's attitude.
   */
  function solveTouchdown(h: number, stop: boolean, out: Q4): void {
    const C = rig.crawl;
    bedQ(st.cCup[0], st.cCup[2], h, _q2);
    yxzOf(_q2, euler);
    let p = euler.pitch, rl = euler.roll;
    if (stop) { qYXZ(h, p, rl, out); return; }
    const seg = C.segs[0];
    set3(_tipL, seg.L[0] - C.cup[0], seg.L[1] - C.cup[1], seg.L[2] + C.stride - C.cup[2]);
    set3(_tipR, seg.R[0] - C.cup[0], seg.R[1] - C.cup[1], seg.R[2] + C.stride - C.cup[2]);
    const err = (pp: number, rr: number, e: [number, number]) => {
      qYXZ(h, pp, rr, _qa2);
      for (let k = 0; k < 2; k++) {
        const t = k === 0 ? _tipL : _tipR;
        qrot(_qa2, set3(_w, t[0] * s, t[1] * s, t[2] * s), _v);
        const x = st.cCup[0] + _v[0], y = st.cCup[1] + _v[1], z = st.cCup[2] + _v[2];
        e[k] = y - ground(x, z);
      }
      return e;
    };
    const lim = TOBI.crawl.attitudeDeg * DEG, p0 = p, r0 = rl, dd = 0.002;
    for (let it = 0; it < 3; it++) {
      err(p, rl, _e0);
      if (Math.abs(_e0[0]) + Math.abs(_e0[1]) < 1e-7) break;
      err(p + dd, rl, _e1); err(p, rl + dd, _e2);
      const a = (_e1[0] - _e0[0]) / dd, b = (_e2[0] - _e0[0]) / dd, c = (_e1[1] - _e0[1]) / dd, d = (_e2[1] - _e0[1]) / dd;
      const det = a * d - b * c;
      if (Math.abs(det) < 1e-14) break;
      p = clamp(p - (d * _e0[0] - b * _e0[1]) / det, p0 - lim, p0 + lim);
      rl = clamp(rl - (-c * _e0[0] + a * _e0[1]) / det, r0 - lim, r0 + lim);
    }
    qYXZ(h, p, rl, out);
  }
  const _qa2: Q4 = [0, 0, 0, 1], _tipL: V3 = [0, 0, 0], _tipR: V3 = [0, 0, 0];
  const _e0: [number, number] = [0, 0], _e1: [number, number] = [0, 0], _e2: [number, number] = [0, 0];

  function stopCrawl(): void {
    st.loco = 'still'; st.lt = 0;
    st.cPhase = 0;
    // out of the crawl's touch-down into the prop (prone when it means to rest; the water's pose in the water)
    const into: PoseRef = st.medium !== 'land' && st.act !== 'move' ? 'water' : st.medium === 'water' ? 'water' : st.act === 'rest' && st.alert < 0.25 && rng() < 0.4 ? 'rest' : 'prop';
    to(into, 0.3);
  }

  // ---- hopping (§3.2), skipping over the water (§3.4), into and out of it (§3.5)

  function startHop(kind: HopPlan['kind'], tx: number, tz: number): void {
    const x = st.P[0], z = st.P[2];
    const dx = tx - x, dz = tz - z, dist = Math.hypot(dx, dz);
    const water = kind === 'skip' || kind === 'exit';
    const aim = dist > 1e-6 ? Math.atan2(dx, dz) : st.heading;
    // the flight follows the heading the head had (± 9.9° by the side the tail pushes on), twisting toward the aim in
    // the air as far as it can; far round, it hops along its heading and comes nearer the aim the next time
    const off = wrap(aim - st.heading), bias = TOBI.hop.biasDeg * DEG, maxAir = TOBI.hop.airTurnDeg * DEG;
    const launchH = st.heading + clamp(off, -bias, bias);
    const reach = Math.abs(off) > maxAir + bias && kind !== 'skip' ? Math.min(dist, hopRange(1.2)) : Math.min(dist, kind === 'skip' ? TOBI.skip.lenM : hopRange(TOBI.hop.rangeMaxBL));
    tx = x + Math.sin(launchH) * reach; tz = z + Math.cos(launchH) * reach;
    if (kind !== 'entry' && kind !== 'skip' && depthAt(tx, tz) > 0.1 * H()) { const c = landShort(x, z, tx, tz); tx = c.x; tz = c.z; }
    const b = clampToBounds(tx, tz); tx = b.x; tz = b.z;
    const landH = st.heading + clamp(off, -maxAir, maxAir);
    // the take-off angle (27–59°, §3.2), no steeper than keeps the apex within half a body length (15–40 mm at TL 80)
    const R = Math.max(0.3 * L, Math.hypot(tx - x, tz - z));
    const steep = Math.atan((4 * TOBI.hop.apexBL * L) / R);
    const angle = kind === 'skip' ? TOBI.skip.angleDeg * DEG : kind === 'display' ? 60 * DEG
      : Math.max(TOBI.hop.angleDeg[0] * 0.9 * DEG, Math.min(steep, (kind === 'pounce' ? r(25, 35) : kind === 'exit' ? 40 : r(TOBI.hop.angleDeg[0], TOBI.hop.angleDeg[1])) * DEG));
    // where it lands: its pose's ground on the bed there (in the water: the bottom, or afloat with the eyes out)
    const to2: PoseRef = kind === 'entry' || kind === 'skip' ? 'water' : kind === 'exit' ? 'reach' : 'prop';
    const Q2: Q4 = [0, 0, 0, 1], P2: V3 = [0, 0, 0];
    if (to2 === 'water') { qYXZ(landH, 0, 0, Q2); set3(P2, tx, Math.max(bedY(tx, tz, 'water'), floatY(tx, tz, 'water')), tz); }
    else { bedQ(tx, tz, landH, Q2); seatOn(tx, tz, Q2, rig.ground[to2], P2); }
    const tc = water ? 0.05 : r(TOBI.hop.coilS[0], TOBI.hop.coilS[1]), tp = r(TOBI.hop.pushS[0], TOBI.hop.pushS[1]);
    st.hop = {
      kind, stage: 0, t: 0, tc, tp, ta: 0.1, tl: water ? 0.06 : TOBI.hop.landS,
      P0: [st.P[0], st.P[1], st.P[2]], P1: [0, 0, 0], P2, Q0: [st.Q[0], st.Q[1], st.Q[2], st.Q[3]], Q2, V: [0, 0, 0],
      // (the tail planted on the side away from the aim throws the fish toward it: §3.2, 9.9° a side)
      curl: (Math.abs(off) > 0.02 ? (off > 0 ? -1 : 1) : rng() < 0.5 ? 1 : -1) * (water ? 0.5 : 1), angle, from: st.pose, to: to2, gape: kind === 'pounce',
    };
    planFlight(st.hop);
    st.loco = 'hop'; st.lt = 0;
    // (out of the crawl or the prone rest it takes the prop's stance during the coil)
    if (st.pose === 'crawl' || st.pose === 'rest') to('prop', tc * 0.9);
  }

  /**
   * The flight: a push accelerating uniformly to v along the launch angle (the body moves ½·v·tp in it), then the
   * ballistic arc from there that ends on P2 (Newton on v, three rounds: the push depends on it).
   */
  function planFlight(h: HopPlan): void {
    // (flatter until the whole rise, the push's and the arc's, stays within half a body length: §3.2's 15–40 mm)
    const g = TOBI.hop.g, apexMax = TOBI.hop.apexBL * L, minAngle = 22 * DEG;
    for (let k = 0; k < 10; k++) {
      fitFlight(h);
      const apex = h.P1[1] - h.P0[1] + (h.V[1] * h.V[1]) / (2 * g);
      if (apex <= apexMax || h.angle <= minAngle || h.kind === 'display' || h.kind === 'skip') break;
      h.angle = Math.max(minAngle, h.angle - 3 * DEG);
    }
  }
  function fitFlight(h: HopPlan): void {
    const g = TOBI.hop.g, th = h.angle, ch = Math.cos(th), sh = Math.sin(th);
    const R0 = Math.hypot(h.P2[0] - h.P0[0], h.P2[2] - h.P0[2]);
    const hx = R0 > 1e-6 ? (h.P2[0] - h.P0[0]) / R0 : fwdX(st.heading), hz = R0 > 1e-6 ? (h.P2[2] - h.P0[2]) / R0 : fwdZ(st.heading);
    let v = Math.sqrt((g * Math.max(R0, 0.2 * L)) / Math.sin(2 * th));
    let Rr = R0;
    for (let it = 0; it < 4; it++) {
      const push = 0.5 * v * h.tp;
      set3(h.P1, h.P0[0] + hx * push * ch, h.P0[1] + push * sh, h.P0[2] + hz * push * ch);
      Rr = Math.max(0.05 * L, Math.hypot(h.P2[0] - h.P1[0], h.P2[2] - h.P1[2]));
      const dy = h.P2[1] - h.P1[1], den = Math.max(0.2 * Rr * Math.tan(th), Rr * Math.tan(th) - dy);
      v = clamp(Math.sqrt((g * Rr * Rr) / (2 * ch * ch * den)), 0.15, 2.6);
    }
    const vh = v * ch;
    h.ta = Math.max(0.04, Rr / vh);
    const ux = (h.P2[0] - h.P1[0]) / Rr, uz = (h.P2[2] - h.P1[2]) / Rr;
    set3(h.V, ux * vh, v * sh, uz * vh);
  }

  function hop(dt: number): void {
    const h = st.hop!;
    h.t += dt;
    if (h.stage === 0) {
      // the coil: the tail into a J beside the still front, the soles and the cup planted (§3.2)
      if (st.blend) { seatOn(st.P[0], st.P[2], st.Q, poseGround(), st.P); copy3(h.P0, st.P); st.planted = false; }
      else if (!st.planted && st.medium === 'land' && st.pose === 'prop') plantSoles();
      if (h.t < h.tc) return;
      h.stage = 1; h.t -= h.tc; st.planted = false;
      planFlight(h);
    }
    if (h.stage === 1) {
      // the push: the tail straightens; the fins leave the mud (pelvic, pectoral, then the caudal) as the body goes
      const u = clamp(h.t / h.tp, 0, 1);
      for (let k = 0; k < 3; k++) st.P[k] = lerp(h.P0[k], h.P1[k], u * u);
      if (h.t < h.tp) return;
      h.stage = 2; h.t -= h.tp;
      // the paired fins pressed flat in the air (the rest's arms), the water's or the swimming pose over the water
      to(h.to === 'prop' ? 'rest' : 'swim', h.ta * 0.4);
    }
    if (h.stage === 2) {
      // the flight: ballistic; the body's pitch follows its path, the heading turns toward the landing's
      const t = Math.min(h.t, h.ta), g = TOBI.hop.g, u = t / h.ta;
      set3(st.P, h.P1[0] + h.V[0] * t, h.P1[1] + h.V[1] * t - 0.5 * g * t * t, h.P1[2] + h.V[2] * t);
      // (the arc ends on the landing point exactly)
      const ex = h.P1[0] + h.V[0] * h.ta - h.P2[0], ey = h.P1[1] + h.V[1] * h.ta - 0.5 * g * h.ta * h.ta - h.P2[1], ez = h.P1[2] + h.V[2] * h.ta - h.P2[2];
      st.P[0] -= ex * u; st.P[1] -= ey * u; st.P[2] -= ez * u;
      const vy = h.V[1] - g * t, vh = Math.hypot(h.V[0], h.V[2]);
      yxzOf(h.Q0, euler); const h0 = euler.heading;
      yxzOf(h.Q2, euler);
      const hd = h0 + wrap(euler.heading - h0) * smooth(u);
      const pitch = lerp(-0.55 * Math.atan2(vy, vh), euler.pitch, smooth((u - 0.7) / 0.3));
      qYXZ(hd, pitch, euler.roll * smooth((u - 0.6) / 0.4), st.Q);
      st.heading = hd;
      if (u > 0.55 && st.pose !== h.to && (!st.blend || st.blend.to !== h.to)) to(h.to, Math.max(0.03, h.ta * 0.4));
      if (h.t < h.ta) return;
      h.stage = 3; h.t -= h.ta;
      land(h);
    }
    // the landing: on the pectorals and the pelvics, planted again; a short settle
    if (h.t >= h.tl) finishHop(h);
  }

  function land(h: HopPlan): void {
    copy3(st.P, h.P2);
    copy4(st.Q, h.Q2);
    yxzOf(st.Q, euler); st.heading = euler.heading;
    st.blend = null;
    st.pose = h.to;
    st.posture = postureOf(h.to, st.posture);
    sense(0);
    if (h.to === 'prop' && st.medium === 'land') { st.raise = 13; plantSoles(); st.mud = Math.min(1, st.mud + 0.05); }
    else st.planted = false;
  }

  function finishHop(h: HopPlan): void {
    st.hop = null;
    st.loco = 'still'; st.lt = 0;
    st.hopsLeft = Math.max(0, st.hopsLeft - 1);
    // out of the water: the reaching pectorals plant into the prop
    if (h.kind === 'exit') to(st.medium === 'land' ? 'prop' : 'water', 0.3);
    // a gap between chained hops (0.10–0.25 s), longer between the hops of an ordinary move
    if (st.act === 'flee' || st.urgency > 0.7) st.pause = r(TOBI.hop.gapS[0], TOBI.hop.gapS[1]);
    else if (st.act === 'move') st.pause = r(0.2, 0.8);
    if (h.kind === 'pounce') { st.fPhase = 'swallow'; st.pt = 0; st.sDone = r(TOBI.swallowS[0], TOBI.swallowS[1]); st.fed++; }
  }

  // ---- swimming (§3.3) and taxiing (§3.4)

  function startSwim(kind: 'swim' | 'taxi'): void {
    st.loco = kind; st.lt = 0; st.planted = false;
    if (st.pose !== 'swim') to('swim', 0.35);
    if (st.act === 'flee') st.speed = Math.max(st.speed, TOBI.swim.burstMps);
  }
  /** from swimming to resting on the bottom (or afloat with the eyes out), on the mud if it has run out of water */
  function settleDown(): void {
    if (st.loco !== 'swim' && st.loco !== 'taxi') return;
    st.loco = 'still'; st.lt = 0; st.speed = 0;
    to(st.medium === 'land' ? 'prop' : 'water', 0.45);
  }

  function swim(dt: number): void {
    const g = st.goal;
    const taxi = st.loco === 'taxi';
    const x = st.P[0], z = st.P[2];
    // heading and speed toward the goal: cruise 1.5–2.3 BL/s, a burst when fleeing, slow at the surface
    let want = 0;
    if (g) {
      const dx = g.x - x, dz = g.z - z, d = Math.hypot(dx, dz);
      const dh = wrap(Math.atan2(dx, dz) - st.heading);
      const tr = TOBI.swim.turnRate * (taxi ? 0.7 : 1);
      st.turnRate = clamp(dh * 4, -tr, tr);
      st.heading = wrap(st.heading + st.turnRate * dt);
      const cruise = lerp(TOBI.swim.cruiseBL[0], TOBI.swim.cruiseBL[1], clamp((st.quirk.swim - 0.9) / 0.2, 0, 1)) * L;
      want = taxi ? Math.min(TOBI.swim.taxiMps, cruise) : st.act === 'flee' ? Math.max(TOBI.swim.burstMps * 0.8, cruise * 1.3) : cruise;
      want *= clamp(d / (1.5 * L), 0.25, 1) * clamp(1 - Math.abs(dh) / 2.5, 0.3, 1);
    } else st.turnRate = 0;
    st.speed = ease(st.speed, want, dt, 3);
    let nx = x + Math.sin(st.heading) * st.speed * dt, nz = z + Math.cos(st.heading) * st.speed * dt;
    const b = E.bounds;
    if (b) { const m = 0.5 * L; nx = clamp(nx, b.minX + m, b.maxX - m); nz = clamp(nz, b.minZ + m, b.maxZ - m); }
    // up and down: a little over the bottom and under the surface (taxiing: at it, the eyes out); never below the
    // pose's ground (and its blend's clearance)
    const bed = ground(nx, nz) - s * poseGround();
    const surf = E.waterY(nx, nz) - s * (rig.eye.swim[1] + rig.eyeR) - 0.25 * H();
    const yWant = taxi ? Math.max(bed, floatY(nx, nz, 'swim')) : clamp(bed + 0.35 * H(), bed, Math.max(bed, surf));
    const y0 = st.P[1];
    st.P[0] = nx; st.P[2] = nz;
    st.P[1] = Math.max(bed, ease(st.P[1], yWant, dt, 4));
    const vy = dt > 0 ? (st.P[1] - y0) / dt : 0;
    qYXZ(st.heading, clamp(-Math.atan2(vy, Math.max(0.02 * L, st.speed)), -0.35, 0.35), clamp(-st.turnRate * 0.08, -0.25, 0.25), st.Q);
    // the travelling wave: one tail beat per ≈ 0.65 BL travelled, a slow scull at least
    const f = Math.max(taxi ? 1.2 : 0.8, st.speed / (TOBI.swim.strideBL * L));
    st.swimPhase = (st.swimPhase + f * dt) % 1;
    st.swimAmp = ease(st.swimAmp, clamp(0.25 + (st.speed / (2.3 * L)) * 0.75, 0.2, 1), dt, 4);
    // into water too shallow to swim in: taxi, or stand and crutch; out of the water: on the mud
    if (!taxi && st.medium !== 'water' && st.lt > 0.3) { if (canFloat(nx, nz)) st.loco = 'taxi'; else settleDown(); }
    else if (taxi && (st.medium === 'land' || !canFloat(nx, nz))) settleDown();
    else if (taxi && st.medium === 'water' && st.lt > 0.3) st.loco = 'swim';
  }

  // ---- the strike (§3.7)

  function startStrike(): void {
    st.loco = 'strike'; st.lt = 0;
    copy3(st.sP0, st.P); copy4(st.sQ0, st.Q);
    // the angle that brings the chin down onto the mud over the prey: about the planted soles' line on land, about
    // the bottom under the pectoral girdle in the water
    if (st.medium === 'land' && !st.planted) plantSoles();
    const chin = st.medium === 'land' ? byRaise(rig, rig.prop.chin, st.raise, _chin) : copy3(_chin, rig.waterChin);
    let a = 0, b = 60 * DEG;
    for (let i = 0; i < 14; i++) {
      const m = (a + b) / 2;
      strikePivot(m, _v, _qb2);
      toWorld(chin, _w2, _v, _qb2);
      if (_w2[1] - ground(_w2[0], _w2[2]) > TOBI.strike.chinClearM * s) a = m; else b = m;
    }
    st.sAngle = a;
  }
  const _w2: V3 = [0, 0, 0], _qb2: Q4 = [0, 0, 0, 1], _pa: V3 = [0, 0, 0], _qc2: Q4 = [0, 0, 0, 1], _chin: V3 = [0, 0, 0], _pv: V3 = [0, 0, 0];

  /** the root turned nose-down by angle about the strike's pivot line (the soles stay where they are) */
  function strikePivot(angle: number, P: V3, Q: Q4): void {
    // the line: through the two soles on land; across the body under the pectoral girdle in the water
    let ax: number, ay: number, az: number;
    if (st.medium === 'land') { ax = st.soleL[0] - st.soleR[0]; ay = st.soleL[1] - st.soleR[1]; az = st.soleL[2] - st.soleR[2]; copy3(_pv, st.soleR); }
    else { qrot(st.sQ0, set3(_pa, 1, 0, 0), _pa); ax = _pa[0]; ay = _pa[1]; az = _pa[2]; toWorld(set3(_pa, 0, rig.ground.water, 0.02), _pv, st.sP0, st.sQ0); }
    // (turned so that the line points to the fish's left: a right-hand turn about it puts the nose down)
    qrot(st.sQ0, set3(_pa, 1, 0, 0), _pa);
    if (ax * _pa[0] + ay * _pa[1] + az * _pa[2] < 0) { ax = -ax; ay = -ay; az = -az; }
    qaxis(ax, ay, az, angle, _qc2);
    qmul(_qc2, st.sQ0, Q);
    set3(_pa, st.sP0[0] - _pv[0], st.sP0[1] - _pv[1], st.sP0[2] - _pv[2]);
    qrot(_qc2, _pa, _pa);
    set3(P, _pv[0] + _pa[0], _pv[1] + _pa[1], _pv[2] + _pa[2]);
  }

  function strike(): void {
    const T = TOBI.strike, t = st.lt;
    const t1 = T.anticipateS, t2 = t1 + T.downS, t3 = t2 + T.openS, t4 = t3 + T.holdS, t5 = t4 + T.closeS, t6 = t5 + T.upS;
    // anticipation (the cheeks compress, the head lifts a hair), the pivot down, the jaws open onto the mud (62 ms ×
    // 1.5 for the eye) and snap shut (36 ms), the cheeks still puffed (§3.7); the head comes back up
    let k: number;
    if (t < t1) k = -0.04 * smooth(t / t1);
    else if (t < t2) k = -0.04 + 1.04 * smooth((t - t1) / T.downS);
    else if (t < t5) k = 1;
    else k = 1 - smooth((t - t5) / T.upS);
    const o0 = t2 - 0.03;
    st.gape = t >= o0 && t < t3 ? clamp((t - o0) / (T.openS + 0.03), 0, 1) : t >= t3 && t < t4 ? 1 : t >= t4 && t < t5 ? 1 - (t - t4) / T.closeS : 0;
    st.gapeGoal = 0;
    st.inflateGoal = t < t1 ? 0.12 : 0.35;
    strikePivot(k * st.sAngle, st.P, st.Q);
    if (t >= t2 && st.clock - (st.lastEvt.forage ?? -1e9) > 2) emit('forage');
    if (t >= t6) {
      copy3(st.P, st.sP0); copy4(st.Q, st.sQ0);
      st.loco = 'still'; st.lt = 0;
      const caught = rng() < 0.6;
      st.fPhase = 'swallow'; st.pt = 0;
      st.sDone = caught ? r(TOBI.swallowS[0], TOBI.swallowS[1]) : r(0.4, 1);
      if (caught) st.fed++;
    }
  }

  // ---- the burrow (§3.8)

  function startBurrowIn(): void {
    const b = st.burrow;
    if (!b) return;
    st.loco = 'burrowIn'; st.lt = 0;
    copy3(st.sP0, st.P);
    const d = Math.hypot(b.x - st.P[0], b.z - st.P[2]);
    if (d > 1e-4) st.heading = Math.atan2(b.x - st.P[0], b.z - st.P[2]);
    to('rest', 0.25);
    st.planted = false;
  }
  function burrowIn(): void {
    const b = st.burrow!;
    const dur = st.act === 'flee' ? 0.45 : 0.9;
    const u = clamp(st.lt / dur, 0, 1);
    // head first: pitched down into the hole and drawn in along its own axis, the tail last. The axis turns about a
    // point over the opening's middle that sinks from the body's height on the mud to the mud itself as it pitches, so
    // the body goes down through the middle of the opening (burrows.ts: the hole is drawn there), the tail lifting
    const k = smooth(u / 0.4), pitch = 50 * DEG * k;
    qYXZ(st.heading, pitch, 0, st.Q);
    const gy = ground(b.x, b.z), pivotY = gy - s * rig.ground.rest * (1 - k);
    const along = lerp(-0.5 * L, 0.75 * L, smooth(u));
    const fx = Math.sin(st.heading) * Math.cos(pitch) * along, fz = Math.cos(st.heading) * Math.cos(pitch) * along;
    // (from where it stopped by the hole: the first fifth of the way)
    const w = smooth(u / 0.2);
    set3(st.P, lerp(st.sP0[0], b.x + fx, w), lerp(st.sP0[1], pivotY - Math.sin(pitch) * along, w), lerp(st.sP0[2], b.z + fz, w));
    // (once all but the tail is in, out of sight: the rest of the way is under the mud)
    if (u > 0.65) downTheHole(b);
  }
  /** down the hole, out of sight: right under the opening (the individual's place, where it peeks out from) */
  function downTheHole(b: { x: number; z: number }): void {
    set3(st.P, b.x, ground(b.x, b.z) - 0.3 * L, b.z);
    st.hidden = true;
    st.loco = 'hidden'; st.lt = 0; st.actT = 0;
    if (st.act === 'flee') st.actDur = r(5, 15);
    else { st.act = 'burrow'; st.actDur = Math.max(st.actDur, 3); }
  }
  function startPeek(): void {
    const b = st.burrow ?? { x: st.P[0], z: st.P[2] };
    st.loco = 'peek'; st.lt = 0; st.hidden = false;
    // head and chest out at 60–80°, the rest down the hole (A046 → A047); a look of 3–10 s, longer with the observer near.
    // The body's axis through the middle of the opening at the mud (the root 0.12 L under it, a little behind)
    const PEEK = 70 * DEG, back = (0.12 * L) / Math.tan(PEEK);
    qYXZ(st.heading, -PEEK, 0, st.Q);
    set3(st.P, b.x - fwdX(st.heading) * back, ground(b.x, b.z) - 0.12 * L, b.z - fwdZ(st.heading) * back);
    // (seen from outside, the burrow's: an observation that starts while it hides records it as it looks out)
    emit('burrow');
    st.pose = 'rest'; st.blend = null;
    const p = E.player, near = p ? Math.hypot(p.x - b.x, p.z - b.z) < 1.5 : false;
    st.sDone = near ? r(8, 30) : r(3, 10);
  }
  /** a peeking head ducks back down in a flash (it is half in already) */
  function duckIn(): void {
    downTheHole(st.burrow ?? { x: st.P[0], z: st.P[2] });
  }
  function emergeFromBurrow(): void {
    if (!st.hidden && st.loco !== 'peek' && st.loco !== 'hidden') return;
    if (st.loco !== 'peek') startPeek();
    st.loco = 'emerge'; st.lt = 0; st.hidden = false;
    copy3(st.sP0, st.P); copy4(st.sQ0, st.Q);
  }
  function emerge(): void {
    const b = st.burrow ?? { x: st.sP0[0], z: st.sP0[2] };
    const u = clamp(st.lt / 0.9, 0, 1);
    // up and out along the body's axis, then down onto the mud half a body length from the hole
    const x = b.x + Math.sin(st.heading) * 0.6 * L * smooth(u), z = b.z + Math.cos(st.heading) * 0.6 * L * smooth(u);
    bedQ(x, z, st.heading, _q);
    qslerp(st.sQ0, _q, smooth(u), st.Q);
    const yEnd = seatOn(x, z, _q, rig.ground.rest, _v)[1];
    set3(st.P, x, lerp(st.sP0[1], yEnd, smooth(u)) + Math.sin(Math.PI * u) * 0.05 * L, z);
    if (u >= 1) {
      st.loco = 'still'; st.lt = 0; st.burrow = null;
      st.pose = 'rest'; st.blend = null; st.planted = false;
      to('prop', 0.35);
      if (st.act === 'burrow' || st.act === 'flee') toRest(r(2, 6));
    }
  }

  // ---- the roll that wets the eyes and the skin (§3.9)

  function startRoll(): void {
    st.loco = 'roll'; st.lt = 0;
    st.rollSide = rng() < 0.5 ? 1 : -1;
    copy3(st.sP0, st.P); copy4(st.sQ0, st.Q);
    emit('eye_roll');
  }
  function roll(): void {
    const u = clamp(st.lt / TOBI.roll.durS, 0, 1);
    // over onto its side about the lower edge of the flank it rolls to (that edge stays on the mud), the eyes drawn
    // in, and back
    const a = TOBI.roll.deg * DEG * Math.sin(Math.PI * smooth(u));
    const edge = toWorld(set3(_pa, st.rollSide * 0.4 * rig.width * rig.tl, rig.ground.rest, 0), _w2, st.sP0, st.sQ0);
    const fwd = qrot(st.sQ0, set3(_pv, 0, 0, 1), _pv);
    // (the left side down: a turn about the forward axis that takes +X down)
    qaxis(fwd[0], fwd[1], fwd[2], -st.rollSide * a, _qc2);
    qmul(_qc2, st.sQ0, st.Q);
    set3(_pa, st.sP0[0] - edge[0], st.sP0[1] - edge[1], st.sP0[2] - edge[2]);
    qrot(_qc2, _pa, _pa);
    set3(st.P, edge[0] + _pa[0], edge[1] + _pa[1], edge[2] + _pa[2]);
    if (u >= 1) {
      copy3(st.P, st.sP0); copy4(st.Q, st.sQ0);
      st.loco = 'still'; st.lt = 0;
      st.wet = Math.min(1, st.wet + 0.5); st.mud = Math.min(1, st.mud + 0.3);
      st.rollT = logNormal(rng, lerp(TOBI.roll.medianS, TOBI.roll.dryMedianS, dryness()), 0.6);
    }
  }
  // ---------------------------------------------------------------------- nudges

  function takeNudge(): void {
    const n = st.nudge, pu = st.pushed;
    if (!n[0] && !n[1]) { pu[0] *= 0.95; pu[1] *= 0.95; return; }
    // taken only while nothing is welded: swimming, afloat or lying in the water, in the air
    const free = st.loco === 'swim' || st.loco === 'taxi' || (st.loco === 'hop' && st.hop?.stage === 2) || (st.loco === 'still' && st.medium !== 'land' && !st.blend);
    if (free) {
      st.P[0] += n[0]; st.P[2] += n[1];
      if (st.hop) for (const p of [st.hop.P1, st.hop.P2]) { p[0] += n[0]; p[2] += n[1]; }
    } else {
      // standing on welded fins it does not slide: the other body gives way, and if the pushing goes on while it rests
      // it steps aside (a short crawl away)
      pu[0] += n[0]; pu[1] += n[1];
      if (st.loco === 'still' && !st.blend && st.medium === 'land' && st.act === 'rest' && Math.hypot(pu[0], pu[1]) > 0.25 * L) {
        const l = Math.hypot(pu[0], pu[1]);
        setGoal(st.P[0] + (pu[0] / l) * 0.6 * L, st.P[2] + (pu[1] / l) * 0.6 * L, 'land', 0.6 * rig.crawl.stride * s);
        st.cLeft = 3; st.act = 'move'; st.actT = 0; st.actDur = 4; st.busy = true;
        pu[0] = 0; pu[1] = 0;
      }
    }
    n[0] = 0; n[1] = 0;
  }
  // ---------------------------------------------------------------------- the face: eyes, breathing, fins

  function micro(dt: number): void {
    // out of the water (or with the eyes out of it): spontaneous blinks; never under it (§3.9)
    const eyesOut = st.medium === 'land' || (st.medium === 'shallow' && (st.posture === 'float' || st.depth < 0.6 * H()));
    const T = TOBI.eyes;
    // the observer in the head's frame: which eye can see it (each turret reaches −28…92° of its gaze yaw)
    const p = E.player;
    let tL = Number.NaN, tR = Number.NaN, tPitch = 0;
    if (p && Number.isFinite(p.x) && !st.hidden) {
      const dd = Math.hypot(p.x - st.P[0], p.z - st.P[2]);
      if (dd < T.trackM && (st.alert > 0.1 || dd < 3)) {
        set3(_v, p.x - st.P[0], (p.y ?? st.P[1] + 1.5) - st.P[1], p.z - st.P[2]);
        qrot(qconj(st.Q, _q), _v, _w);
        // (the head is raised by the prop's raise: J_root's pitch)
        const ra = (st.pose === 'prop' || st.pose === 'crawl' ? st.raise : 0) * DEG, cr = Math.cos(ra), sr = Math.sin(ra);
        const y = _w[1] * cr - _w[2] * sr, zz = _w[1] * sr + _w[2] * cr, xx = _w[0];
        const elev = Math.atan2(y, Math.hypot(xx, zz)) / DEG;
        const yawL = T.restOut - Math.atan2(xx, zz) / DEG, yawR = T.restOut - Math.atan2(-xx, zz) / DEG;
        if (yawL >= T.yaw[0] && yawL <= T.yaw[1]) tL = yawL;
        if (yawR >= T.yaw[0] && yawR <= T.yaw[1]) tR = yawR;
        tPitch = clamp(elev - T.restUp, T.pitch[0], T.pitch[1]);
      }
    }
    const scanning = st.act === 'forage' && st.loco !== 'swim' && st.fPhase === 'scan';
    for (let i = 0; i < 2; i++) {
      const e = st.eyes[i];
      // saccades: each eye on its own, a jump of 5–30° every 0.5–3 s (sooner when alert); the other now and then too
      e.hold -= dt * (1 + 1.5 * st.alert);
      if (e.hold <= 0) {
        e.hold = r(T.saccadeS[0], T.saccadeS[1]);
        const amp = r(T.saccadeDeg[0], T.saccadeDeg[1]) * (rng() < 0.5 ? -1 : 1);
        e.gy = clamp(T.rest.yaw + amp, T.yaw[0], T.yaw[1]);
        e.gp = clamp(T.rest.pitch + r(-12, 14), T.pitch[0], T.pitch[1]);
        if (i === 0 && rng() < 0.3) { const o2 = st.eyes[1]; o2.hold = e.hold; o2.gy = clamp(T.rest.yaw + amp * r(0.6, 1), T.yaw[0], T.yaw[1]); o2.gp = e.gp; }
      }
      let gy = e.gy, gp = e.gp;
      // fixed on the observer by whichever eye can see it; both forward and down on the prey (§3.7, §3.9)
      const tY = i === 0 ? tL : tR;
      if (!Number.isNaN(tY)) { gy = tY + (e.gy - T.rest.yaw) * 0.08; gp = tPitch; e.track = Math.min(1, e.track + dt * 4); }
      else e.track = Math.max(0, e.track - dt * 2);
      if (scanning) { gy = 62 + (e.gy - T.rest.yaw) * 0.1; gp = -20; }
      // the blink: the eye drops into its cup, 35 % of 0.56 s down, the rest up (Aiello 2023); unilateral or both
      e.next -= dt;
      if (e.bt < 0 && eyesOut && e.next <= 0 && st.loco !== 'roll') {
        startBlink(e);
        const o2 = st.eyes[1 - i];
        if (o2.bt < 0 && rng() < T.bilateral) startBlink(o2);
        if (st.clock - (st.lastEvt.blink ?? -1e9) > 1) emit('blink');
      }
      if (e.bt >= 0) {
        e.bt += dt;
        const u = e.bt / e.bdur;
        e.blink = u < T.closeFrac ? smooth(u / T.closeFrac) : 1 - smooth((u - T.closeFrac) / (1 - T.closeFrac));
        if (u >= 1) { e.bt = -1; e.blink = 0; e.settle = T.settleED; e.next = blinkInterval(); }
        // (the gaze eases to within 20° of its rest on the way down: the cup closes over the resting window)
        const k = clamp(u / T.closeFrac, 0, 1);
        gy = lerp(gy, clamp(gy, T.rest.yaw - T.blinkGazeDeg, T.rest.yaw + T.blinkGazeDeg), k);
        gp = lerp(gp, clamp(gp, T.rest.pitch - T.blinkGazeDeg, T.rest.pitch + T.blinkGazeDeg), k);
      } else e.blink = ease(e.blink, st.loco === 'roll' ? 1 : 0, dt, 18);
      // saccades are quick (30–60 ms), a fixation follows smoothly
      const k = e.track > 0.5 ? 14 : 45;
      e.yaw = ease(e.yaw, gy, dt, k); e.pitch = ease(e.pitch, gp, dt, k);
      // the turret: up at the surface, alert or peeking, down when dry and calm; a blink leaves it a little lower
      const up = st.medium === 'shallow' || st.act === 'display' ? 0.08 : st.alert > 0.5 || st.loco === 'peek' ? 0.06 : st.medium === 'water' ? 0 : st.pose === 'rest' ? 0.02 : 0.03 - 0.02 * dryness();
      e.settle = Math.max(0, e.settle - (dt * T.settleED) / 2.5);
      e.liftGoal = clamp(up - e.settle * 0.207, -0.1, 0.08) * rig.hl;
      e.lift = ease(e.lift, e.liftGoal, dt, 6);
    }
    // breathing: in the water the gill slits vent 0.7–1.5 times a second, the mouth a little; on land the buccal pump
    // every 2–6 s (mouth and slits shut, cheeks puffed), a refreshing gulp every 1–5 min (§3.12)
    const strike = st.loco === 'strike';
    if (st.medium === 'water' || (st.medium === 'shallow' && st.posture !== 'float' && st.depth > 0.8 * H())) {
      const hz = lerp(TOBI.breath.ventHz[0], TOBI.breath.ventHz[1], clamp(st.speed / (2 * L) + st.alert * 0.5, 0, 1));
      st.ventPh = (st.ventPh + hz * dt) % 1;
      st.vent = 0.5 - 0.5 * Math.cos(st.ventPh * TAU);
      if (!strike) st.gapeGoal = 0.05 * (0.5 + 0.5 * Math.cos(st.ventPh * TAU));
      if (st.act !== 'display' && !strike) st.inflateGoal = 0;
      st.gulp = ease(st.gulp, 0, dt, 6);
    } else {
      st.vent = ease(st.vent, 0, dt, 4);
      st.gulpT -= dt; st.gulpAge += dt;
      if (st.gulpT <= 0) { st.gulpT = r(TOBI.breath.throatS[0], TOBI.breath.throatS[1]); st.gulpAge = 0; }
      st.gulp = st.gulpAge < 0.4 ? Math.sin((Math.PI * st.gulpAge) / 0.4) : 0;
      st.refreshT -= dt;
      if (!strike) st.gapeGoal = st.refreshT < 0 ? 0.15 : 0;
      if (st.refreshT < -0.3) st.refreshT = r(TOBI.breath.refreshS[0], TOBI.breath.refreshS[1]);
      // the cheeks: puffed with the water it holds on land, flatter as it dries (§3.11)
      if (st.act !== 'display' && !strike) st.inflateGoal = clamp(0.22 - 0.06 * dryness(), 0, 1);
    }
    // a pounce: the mouth opens in the air
    if (st.hop?.gape && st.hop.stage === 2) st.gapeGoal = st.hop.t / st.hop.ta > 0.5 ? 1 : 0.3;
    if (!strike) st.gape = ease(st.gape, st.gapeGoal, dt, 18);
    st.inflate = ease(st.inflate, st.inflateGoal, dt, st.inflateGoal > st.inflate ? 2.5 : 1.5);
    // the median fins: folded in the water and in flight, the first dorsal half up when alert, all up in a display
    // (the first dorsal first)
    if (st.act !== 'display') {
      st.d1Goal = st.loco === 'swim' || st.loco === 'hop' || st.medium === 'water' ? 0 : st.alert > 0.5 ? 0.6 : 0;
      st.medianGoal = st.loco === 'swim' ? 0.5 : 0.3;
    }
    if (st.hop?.kind === 'display') { st.d1Goal = 1; st.medianGoal = 1; }
    st.d1 = ease(st.d1, st.d1Goal, dt, st.d1Goal > st.d1 ? 8 : 3);
    st.median = ease(st.median, st.medianGoal > st.median && st.d1 < 0.5 ? st.median : st.medianGoal, dt, 5);
    st.caudal = ease(st.caudal, st.loco === 'swim' || st.loco === 'taxi' ? 1 : 0, dt, 4);
  }

  function startBlink(e: EyeState): void {
    e.bt = 0;
    e.bdur = clamp(TOBI.eyes.blinkS + TOBI.eyes.blinkSdS * (rng() + rng() + rng() - 1.5) * 1.4, 0.48, 0.7);
  }
  /** per eye, the measured intervals: medians ≈ 85 s in room air, ≈ 20 s drying (Aiello 2023; behaviour §3.9, C1) */
  function blinkInterval(): number {
    return logNormal(rng, lerp(TOBI.eyes.medianS, TOBI.eyes.dryMedianS, dryness()), TOBI.eyes.sigma);
  }

  // ---------------------------------------------------------------------- the state's name

  const STAGES = ['coil', 'push', 'air', 'land'] as const;

  function label(): void {
    const m = st.medium, loco = st.loco, h = st.hop;
    let ns: TobiState, ph: string;
    if (loco === 'burrowIn' || loco === 'hidden' || loco === 'peek' || loco === 'emerge') { ns = 'BURROW'; ph = loco === 'burrowIn' ? 'enter' : loco; }
    else if (h && (h.kind === 'entry' || h.kind === 'exit')) { ns = h.kind === 'entry' ? 'WATER_ENTRY' : 'WATER_EXIT'; ph = STAGES[h.stage]; }
    else if (st.act === 'flee') { ns = 'ESCAPE'; ph = h ? STAGES[h.stage] : loco === 'still' ? 'gap' : loco; }
    else if (st.act === 'forage' && loco !== 'swim' && loco !== 'taxi') {
      ns = 'FORAGE';
      ph = loco === 'strike' ? 'strike' : h ? 'pounce' : loco === 'crawl' ? 'approach' : st.fPhase;
    } else if (h) { ns = h.kind === 'skip' ? 'SHALLOW_WATER' : 'LAND_HOP'; ph = STAGES[h.stage]; }
    else if (loco === 'crawl') {
      // crutching across the edge: out of the water or into it, for the cycle that crosses
      const crossing = (st.cWet === 'land') !== (m === 'land');
      if (crossing) { ns = m === 'land' ? 'WATER_EXIT' : 'WATER_ENTRY'; if (st.cPhase >= 0 && st.cPhase < 0.05) st.cWet = m; }
      else ns = m === 'land' ? 'LAND_CRAWL' : 'SHALLOW_WATER';
      ph = st.cPhase < 0 ? 'plant' : st.cPhase < rig.crawl.duty ? 'stance' : 'recovery';
    } else if (loco === 'swim') { ns = m === 'water' ? 'SWIM' : 'SHALLOW_WATER'; ph = 'swim'; }
    else if (loco === 'taxi') { ns = 'SHALLOW_WATER'; ph = 'taxi'; }
    else if (loco === 'roll') { ns = 'LAND_REST'; ph = 'roll'; }
    else if (m === 'shallow') { ns = 'SHALLOW_WATER'; ph = st.posture === 'float' ? 'float' : 'rest'; }
    else if (m === 'water') { ns = 'IDLE'; ph = st.act === 'display' ? 'display' : 'bottom'; }
    else if (st.pose === 'rest' && !st.blend) { ns = 'LAND_REST'; ph = 'prone'; }
    else { ns = 'IDLE'; ph = st.act === 'display' ? 'display' : st.blend ? 'settle' : 'prop'; }
    setState(ns, ph);
    // a lasting state's id again now and then (an observation that starts late still sees it)
    const id = STATE_EVENT[st.state];
    const lasting = st.state === 'IDLE' || st.state === 'LAND_REST' || st.state === 'SWIM' || st.state === 'SHALLOW_WATER' || st.state === 'LAND_CRAWL' || (st.state === 'BURROW' && st.phase === 'peek');
    if (lasting && st.t > 2.5 && st.clock - (st.lastEvt[id] ?? -1e9) > TOBI.reEmitS) emit(id);
  }
  // ---------------------------------------------------------------------- the frame

  const frame: TobiFrame = {
    state: 'IDLE', phase: 'prop', t: 0,
    root: { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, quat: [0, 0, 0, 1] }, scale: s,
    pose: 'prop', stateBlend: null, crawl: null, hop: null, swim: null, prop: { raise: 15 },
    eyes: { L: { yaw: 0, pitch: 0, lift: 0 }, R: { yaw: 0, pitch: 0, lift: 0 }, blink: { L: 0, R: 0 }, pupil: 0 },
    head: { gape: 0, gulp: 0, inflate: 0, vent: 0 },
    fins: { d1: 0, median: 0, caudal: 0, pect: 'plant', pelvic: 'press' },
    contacts: [], events: [], hidden: false, medium: 'land', depth: 0, skin: { wet: 1, mud: 0 }, colour: { bars: 0, dark: 0 },
  };
  const contactPool: TobiContact[] = Array.from({ length: 4 }, () => ({ name: '', world: [0, 0, 0] as V3, welded: false }));
  const crawlOut = { phase: 0, stride: 1, turn: 0, cycleS: 0.5 };
  const hopOut = { phase: 0, stage: 'coil' as 'coil' | 'push' | 'air' | 'land', u: 0, curl: 0, arch: 0 };
  const swimOut = { phase: 0, amp: 0, speed: 0, turn: 0 };
  const blendOut = { from: 'prop' as PoseRef, to: 'prop' as PoseRef, u: 0, lift: 0 };
  const propOut = { raise: 15 };

  function write(): TobiFrame {
    const f = frame;
    f.state = st.state; f.phase = st.phase; f.t = st.t;
    yxzOf(st.Q, euler);
    f.root.x = st.P[0]; f.root.y = st.P[1]; f.root.z = st.P[2];
    f.root.heading = euler.heading; f.root.pitch = euler.pitch; f.root.roll = euler.roll;
    copy4(f.root.quat, st.Q);
    f.scale = s;
    f.pose = st.pose;
    if (st.blend) { blendOut.from = st.blend.from; blendOut.to = st.blend.to; blendOut.u = clamp(st.blend.u, 0, 1); blendOut.lift = st.blend.lift; f.stateBlend = blendOut; }
    else f.stateBlend = null;
    // (a blend in or out of the crawl reads its touch-down, phase 0)
    const crawling = st.loco === 'crawl' || st.pose === 'crawl' || st.blend?.from === 'crawl' || st.blend?.to === 'crawl';
    if (crawling) {
      crawlOut.phase = st.loco === 'crawl' ? Math.max(0, st.cPhase) % 1 : 0; crawlOut.turn = st.cTurn; crawlOut.cycleS = st.cCycle;
      f.crawl = crawlOut;
    } else f.crawl = null;
    const h = st.hop;
    if (h) {
      const tot = h.tc + h.tp + h.ta + h.tl;
      const done2 = [0, h.tc, h.tc + h.tp, h.tc + h.tp + h.ta][h.stage] + h.t;
      hopOut.phase = clamp(done2 / tot, 0, 1);
      hopOut.stage = (['coil', 'push', 'air', 'land'] as const)[h.stage];
      hopOut.u = clamp(h.t / [h.tc, h.tp, h.ta, h.tl][h.stage], 0, 1);
      // the J-curl: up through the coil, straightened in the push, gone in the air
      hopOut.curl = h.curl * (h.stage === 0 ? smooth(hopOut.u) : h.stage === 1 ? 1 - smooth(hopOut.u) : 0);
      hopOut.arch = h.kind === 'display' && h.stage === 2 ? Math.sin(Math.PI * hopOut.u) : 0;
      f.hop = hopOut;
    } else f.hop = null;
    if (st.loco === 'swim' || st.loco === 'taxi') {
      swimOut.phase = st.swimPhase; swimOut.amp = st.swimAmp * (st.loco === 'taxi' ? 0.6 : 1); swimOut.speed = st.speed / L; swimOut.turn = st.turnRate;
      f.swim = swimOut;
    } else f.swim = null;
    propOut.raise = st.raise;
    f.prop = st.pose === 'prop' || st.blend?.from === 'prop' || st.blend?.to === 'prop' ? propOut : null;
    const [eL, eR] = st.eyes;
    f.eyes.L.yaw = eL.yaw; f.eyes.L.pitch = eL.pitch; f.eyes.L.lift = eL.lift;
    f.eyes.R.yaw = eR.yaw; f.eyes.R.pitch = eR.pitch; f.eyes.R.lift = eR.lift;
    f.eyes.blink.L = eL.blink; f.eyes.blink.R = eR.blink;
    f.eyes.pupil = st.medium === 'water' || st.hidden ? 1 : st.medium === 'shallow' ? 0.5 : 0;
    f.head.gape = st.gape; f.head.gulp = st.gulp; f.head.inflate = st.inflate; f.head.vent = st.vent;
    f.fins.d1 = st.d1; f.fins.median = st.median; f.fins.caudal = st.caudal;
    const pose = st.pose;
    f.fins.pect = pose === 'prop' || pose === 'land' ? 'plant' : pose === 'crawl' || pose === 'rest' ? 'furl' : pose === 'reach' ? 'spread' : pose === 'water' || pose === 'swim' ? 'spread' : 'fold';
    f.fins.pelvic = pose === 'prop' || pose === 'land' || pose === 'crawl' ? 'press' : 'fold';
    writeContacts(f);
    f.events = events;
    f.hidden = st.hidden;
    f.medium = st.medium;
    f.depth = st.depth;
    f.skin.wet = st.wet; f.skin.mud = st.mud;
    f.colour.bars = st.bars; f.colour.dark = st.dark;
    return f;
  }

  function writeContacts(f: TobiFrame): void {
    const c = f.contacts;
    c.length = 0;
    let n = 0;
    const put = (name: string, p: V3, welded: boolean) => { const k = contactPool[n++]; k.name = name; copy3(k.world, p); k.welded = welded; c.push(k); };
    // (a crutch's bearing point is a new contact each time the rolling tip passes the weight on: crutchL0, crutchL1)
    if (st.loco === 'crawl' && st.cPhase >= 0) {
      if (st.cPhase < rig.crawl.duty) { put(CRUTCH_L[st.cSeg] ?? 'crutchL', st.cWeldL, true); put(CRUTCH_R[st.cSeg] ?? 'crutchR', st.cWeldR, true); }
      else put('cup', st.cCup, true);
      return;
    }
    // (the soles are the prop's: the prone rest is seated too, on its cup, and its soles are the last prop's, left behind)
    if (st.planted && st.pose !== 'rest' && (st.loco === 'still' || st.loco === 'strike' || (st.loco === 'hop' && (st.hop?.stage === 0 || st.hop?.stage === 3)))) {
      put('soleL', st.soleL, true); put('soleR', st.soleR, true);
      // (the cup rests on the mud in a prop, held still by it only through a hop's coil)
      if (st.loco !== 'strike') { byRaise(rig, rig.prop.cup, st.raise, _w2); toWorld(_w2, _v); put('cup', _v, st.loco === 'hop' && st.hop?.stage === 0); }
      return;
    }
    if (st.loco === 'still' && st.pose === 'rest' && !st.blend && st.medium === 'land') { toWorld(rig.restCup, _v); put('cup', _v, true); }
  }
  const CRUTCH_L = ['crutchL0', 'crutchL1', 'crutchL2', 'crutchL3'], CRUTCH_R = ['crutchR0', 'crutchR1', 'crutchR2', 'crutchR3'];

  // ---------------------------------------------------------------------- the start

  /** on the bed at (x, z) in the pose that suits where it is: the prop on land, the bottom (or afloat) in the water */
  function seat(x: number, z: number, heading?: number): void {
    st.P[0] = x; st.P[2] = z;
    if (heading !== undefined) st.heading = heading;
    st.loco = 'still'; st.lt = 0; st.hop = null; st.blend = null; st.hidden = false; st.planted = false;
    sense(0);
    st.pose = st.medium === 'land' ? 'prop' : 'water';
    st.posture = st.pose === 'prop' ? 'prop' : 'water';
    bedQ(x, z, st.heading, st.Q);
    if (st.medium === 'land') seatOn(x, z, st.Q, poseGround(), st.P);
    else { qYXZ(st.heading, 0, 0, st.Q); st.P[1] = Math.max(bedY(x, z, 'water'), st.medium === 'shallow' ? floatY(x, z, 'water') : -Infinity); }
  }
  /** put it at rest there, dropping whatever it was doing (holdAt) */
  function place(x: number, z: number, heading?: number): void {
    seat(x, z, heading);
    st.goal = null; st.prey = null; st.burrow = null;
    st.act = 'rest'; st.actT = 0; st.actDur = r(2, 6); st.busy = false;
  }
  let started = false;
  /** an intent that came before the first update (before it knew where it is) */
  let early: TobiIntent | null = null;

  function update(dt: number, env: TobiEnv): TobiFrame {
    E = env;
    events.length = 0;
    if (!started) {
      started = true;
      if (!st.burrows.length) st.burrows = planBurrows(home, L, env);
      seat(st.P[0], st.P[2], st.heading);
      if (early) { const i = early; early = null; setIntent(i); }
    }
    let left = Math.min(Math.max(0, dt), 0.25);
    if (left === 0) step(0);
    while (left > 1e-9) { const h = Math.min(left, 1 / 30); step(h); left -= h; }
    return write();
  }
  const api: TobiApi = {
    get state() { return st.state; },
    get busy() { return st.busy; },
    get hidden() { return st.hidden; },
    get catchable() { return !st.hidden && st.loco !== 'peek' && st.loco !== 'burrowIn'; },
    get wantsEveryFrame() { return st.loco === 'crawl' || st.loco === 'hop' || st.loco === 'strike' || st.loco === 'roll' || !!st.blend; },
    frame,
    get pos() { return { x: st.P[0], y: st.P[1], z: st.P[2] }; },
    get heading() { return st.heading; },
    get rig() { return rig; },
    get burrows() { return st.burrows; },
    setIntent,
    update,
    setRig(extras?: Record<string, unknown> | null) { rig = tobiRig(extras ?? null); s = L / rig.tl; },
    place(x: number, z: number, h?: number) {
      if (started) { place(x, z, h); return; }
      st.P[0] = x; st.P[2] = z;
      if (h !== undefined) st.heading = h;
      early = null; st.busy = false;
    },
    nudge(dx: number, dz: number) { st.nudge[0] += dx; st.nudge[1] += dz; },
    serialize: () => JSON.parse(JSON.stringify(st)) as TobiSnapshot,
    restore(sn: TobiSnapshot) { Object.assign(st, JSON.parse(JSON.stringify(sn)) as St); started = true; },
    debugLabel: () => `${st.state}/${st.phase}${st.hidden ? ' (穴)' : ''}`,
  };
  return api;
}
