import { Euler, Quaternion, Vector3 } from 'three';
import { ARMS, ARM_BONES, ML_MM, TENTACLE, Z_ROOT, CROWN, EYE, FUNNEL, funnelSection } from './anatomy';
import { armTip, emptyPose, funnelPitchOf, funnelSwingQ, type Pose } from './rig';
import { Mysid } from './prey';

/**
 * Behaviour of one ミミイカ on the sandy shallows. The animal is nocturnal: by day it lies buried with only its eyes
 * out, at night it leaves the sand, hangs and hunts just over the bottom and settles again.
 *
 *  REST    sits on the sand on its belly and the curled ventral arms, the head up a little, the fins folded down
 *          along the mantle; it ventilates (the mantle swells and narrows ≈ 1.4 times a second), ripples a fin now
 *          and then, looks about. The skin settles to a mottled red-brown that follows the bottom's brightness.
 *  HOVER   hangs 1–2 mantle lengths over the sand on small, quick waves running back along both fins, the head
 *          a little down, the arms held together in a loose cone; corrects its station with soft funnel puffs; the
 *          skin goes glassy and pale, the chromatophores drawn into dots, the iridophores showing.
 *  SWIM    leaves the bottom with a puff of the funnel (and of sand), travels arms first on the fins' waves (2–4 waves
 *          a second, banking in turns, fins flapping a little), helps itself along with an occasional soft jet;
 *          slows, sinks and lands with a small cloud of silt.
 *  CRAWL   short moves on the bottom: the ventral arms reach and pull, the fins flutter, the body slides low.
 *  BURROW  the signature, in the two phases of the bobtail squids (Anderson et al. 2002; Boletzky & Boletzky 1970;
 *          Drerup 2019): it settles dark red-brown, the arms laid forward under the head; then it blows the sand out
 *          from under itself with jets of the funnel along its axis, the first backward and strong, then forward and
 *          backward in turn (4–7 jets), sinking a step with each (the tail tips down with a backward jet, the head with
 *          a forward one), the fins pressed flat, until it is three quarters in; then, after a short pause or none, the
 *          second arm pair alone, both arms in exact mirror sync, stretches out low over the sand to about twice its
 *          length (thin as a tentacle), scoops with the tip and is drawn back over the head, bowed into an arch, the
 *          grains trickling onto the head and the back as it goes (4–8 strokes, forward, 45°, sideways, back and out:
 *          the order of Sepiola), until only the eyes are out, the pupils turned up, the mantle still, the funnel laid
 *          to one side. The sand sticks to its mucus. It rises slowly with the coat on; at night it drops the coat on
 *          the bottom as a unit before it moves off (Shears 1988), by day it keeps it.
 *  HUNT    spots a mysid, turns to it and watches it with both eyes, the arms closed into a cone, the skin pale with
 *          a dark flicker; creeps up on the fins and, within reach, shoots the two tentacles out (≈ 0.1 s), catches
 *          the prey on the clubs, draws it into the arms and eats it (the arms wrapped round it). From the sand it
 *          ambushes: a mysid that drifts past is struck without the squid leaving its burrow.
 *  ESCAPE  a flash of dark, an ink puff, then strong jets mantle first, away from the danger (fins wrapped against the
 *          mantle, arms streamlined), a glide on the opened fins, a landing — and usually it buries at once.
 *
 * The behaviour writes a pose (rig.ts Pose: root transform, head, arms, tentacles, fins, mantle, funnel, eyes,
 * burial and sand, chromatophores) and visual events (sand and ink clouds) for the driver; it only needs `world` for
 * the ground, the water's surface and a threat, so it runs without any rendering (tests/unit/mimiika.test.ts).
 */

export const MODES = ['REST', 'HOVER', 'SWIM', 'CRAWL', 'BURROW', 'HUNT', 'ESCAPE'] as const;
export type Mode = (typeof MODES)[number];

export interface SquidWorld {
  ground(x: number, z: number): number;
  waterY(x: number, z: number): number;
  threat?(): { pos: Vector3; vel?: Vector3 } | null;
  bounds?(): { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  /** false where there is no sand to dig into */
  canBurrow?(): boolean;
}

export interface FxEvent {
  kind: 'sand' | 'ink';
  pos: Vector3;
  vel: Vector3;
  count: number;
  spread: number;
  size: number;
  life: number;
  alpha: number;
  /** single grains: they swell only this much (× their start size) … */
  grow?: number;
  /** … and are gone where they reach the sand */
  kill?: boolean;
  /** × the sand's colour (the coat's wet, mucus-bound grains: darker than the bed) */
  shade?: number;
}
/**
 * the pit it blows as it buries (m): laid once, then deepened with each jet; gone in `life` s, or filled in `fill` s
 * from now (the strokes have swept it in once it lies buried)
 */
export interface PitEvent { kind: 'pit'; pos: Vector3; heading: number; halfW: number; halfL: number; strength: number; deepen?: boolean; life?: number; fill?: number }

export type JetDir = 'B' | 'F';
/** arm II's strokes, from the crown: forward, 45° out, sideways, back and out (Sepiola: Drerup 2019) */
export type StrokeDir = 'F' | 'FL' | 'L' | 'BL';
export const STROKE_DIRS: readonly StrokeDir[] = ['F', 'FL', 'L', 'BL'];
/** a burial's random draws, made as it starts to blow (tests and the viewer read them) */
export interface BurrowPlan {
  /** the funnel's jets (J1 backward and strong), when each fires (s into blow) and when blow ends */
  jets: JetDir[];
  jetT: number[];
  blow: number;
  /** the pause before the arms (often none), arm II's strokes and how long each takes (s) */
  gap: number;
  strokes: number;
  strokeT: number[];
  /** the side the funnel is laid to once buried */
  buriedSide: 1 | -1;
}

export interface SquidOptions {
  world: SquidWorld;
  rng?: () => number;
  /** individual mantle length / model mantle length */
  scale?: number;
  start: { x: number; z: number; heading?: number };
  home?: { x: number; z: number };
  /** in the game the brain chooses (intents); alone (tests, viewer) the animal decides itself */
  autonomous?: boolean;
  startBuried?: boolean;
  range?: number;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur: number, goal: number, rate: number, dt: number) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const MM = 0.001;
/** the belly's depth under the root and the body's top over it (mm, model) */
const BELLY = 9.35;
const TOP = 9.9;
/** the root over the sand when it sits (mm) and when it is fully buried */
const SIT_Y = BELLY - 0.6;
const BURIED_Y = -7.0;
/** buried, the head is raised so that the eyes clear the sand while the taller mantle is under it (rad) */
const BURIED_PITCH = 0.32;
/** where the arm crown and the funnel's tip are, ahead of the root (mm) */
const CROWN_Z = CROWN.z - Z_ROOT;
const FUNNEL_TIP = new Vector3(0, funnelSection(FUNNEL.z1).yc, FUNNEL.z1 + FUNNEL.lip - Z_ROOT);
/** the funnel's joint (where it leaves the mantle) and the head's, model mm */
const FUNNEL_PIVOT = new Vector3(0, funnelSection(FUNNEL.pz).yc - FUNNEL.py * funnelSection(FUNNEL.pz).b, FUNNEL.pz - Z_ROOT);
const SWING_PIVOT = new Vector3(0, funnelSection(FUNNEL.swingZ).yc, FUNNEL.swingZ - Z_ROOT);
const HEAD_PIVOT = new Vector3(0, 0.8, 1.2 - Z_ROOT);
const ARM_W = [0.55, 0.8, 1.0, 1.2, 1.45].map((w) => w / 5);
/** the arms of the second pair, which bury it (ARMS order) */
const ARM_II = ARMS.flatMap((a, i) => (a.pair === 1 ? [i] : []));
const REST_GAZE = [new Vector3(EYE.gaze[0], EYE.gaze[1], EYE.gaze[2]).normalize(), new Vector3(-EYE.gaze[0], EYE.gaze[1], EYE.gaze[2]).normalize()];

// ---- burying
/** how deep the jets sink it (bury at the end of blow: the eyes, the top of the head and the back's ridge out, 41–42) */
const BLOW_BURY = 0.75;
/** each jet's share of the sinking: J1 strong and backward, the other backward jets, the forward ones */
const JET_W = { J1: 1.9, B: 1.4, F: 1.0 };
/** arm II rises from the blow pose before its first stroke (s) */
const LEAD = 0.3;
/** the stroke's sand: the tip scoops, then the grains go back over the head while it is drawn in */
const SCOOP_U = 0.36, THROW_U = 0.66, DEPOSIT: readonly [number, number] = [0.58, 0.92], POUR_U = [0.72, 0.78, 0.84];
/** the pitch kick of a jet: a quick rise and a slower decay (rates /s), normalised so that its peak is the amount */
const KICK_RISE = 18, KICK_FALL = 3, KICK_N = 0.582;

/**
 * A key of arm II's burying stroke: where its first bone points (ψ from forward towards its own side, ε up; rad), the
 * side it bends to and its suckers face, each joint's curl and swing (× side), its length × rest. Directions in the
 * level frame: x the arm's own side out, y up, z the heading (writePose turns them into the head's frame).
 */
export interface ArmKey { psi: number; elev: number; bend: Vector3; curl: number[]; swing: number[]; ext: number }
const key = (psi: number, elev: number, bend: [number, number, number], curl: number[], swing: number[], ext: number): ArmKey =>
  ({ psi, elev, bend: new Vector3(...bend).normalize(), curl, swing, ext });
const NO_SWING = [0, 0, 0, 0, 0];
/** standing up beside its eye, out of the sand just outside it (Fig. 13D): before the first stroke and after each */
const UP = key(1.84, -0.12, [-0.22, 0.33, -0.92], [0, 0.55, 0.27, -0.01, 0.02], [0, 0.2, 0.87, 0.16, 0.07], 1.36);
/** stretched out low over the sand, suckers down, to about twice its length; ψ and the swing along it per direction */
const REACH_PSI: Record<StrokeDir, number> = { F: 0.35, FL: 1.05, L: 1.6, BL: 1.7 };
const REACH_SWING: Record<StrokeDir, number> = { F: 0, FL: 0, L: 0.1, BL: 0.85 };
/** the reach's horizontal curve per joint (× side; − bends towards the midline): a slight outward bow, the distal third hooked in */
const REACH_HOOK: Record<StrokeDir, number[]> = { F: [0, 0.1, -0.1, -0.45, -0.75], FL: [0, 0.1, -0.1, -0.45, -0.75], L: [0, 0.1, -0.05, -0.35, -0.6], BL: [0, 0, 0, 0, 0] };
/**
 * drawn back into a round loop over its own eye (Fig. 13E): out along the sand in front of the eye, up outside it, over
 * its top about an eye's height above it and in again, the tip curling down between the eyes; onto the head, or
 * further back, lower, onto the front of the back
 */
const ARCH_H = key(1.76, -0.19, [0.02, 0.74, -0.68], [0, 1.1, 0.67, 0.59, 1.65], [0, 0.01, 0.58, -0.19, -0.53], 1.74);
const ARCH_B = key(1.82, -0.22, [-0.05, 0.64, -0.77], [0, 0.91, 0.67, 0.59, 0.99], [0, 0.05, 0.61, -0.36, -0.67], 1.59);
/** arm II's standing and looped keys (the tests check the rig keeps them clear of the eyes) */
export const ARM_II_KEYS: Readonly<Record<'up' | 'archHead' | 'archBack', Readonly<ArmKey>>> = { up: UP, archHead: ARCH_H, archBack: ARCH_B };
const headStroke = (d: StrokeDir) => d === 'F' || d === 'FL';
function reachKey(d: StrokeDir, elev: number, out: ArmKey): ArmKey {
  const s = REACH_SWING[d];
  // (swung back along its length the arm rises a little off the sand: aimed that much lower)
  out.psi = REACH_PSI[d]; out.elev = elev - 0.05 * s; out.bend.set(0, -1, 0); out.ext = 2.05;
  // (the distal third laid down onto the sand and hooked in: a curved arm along the sand, not a rod, 44)
  const hk = REACH_HOOK[d];
  out.curl = d === 'BL' ? [0, 0.02, 0.04, 0.08, 0.15] : [0, 0.02, 0.04, 0.12, 0.28];
  out.swing = [0, 0.26 * s + hk[1], 0.3 * s + hk[2], 0.26 * s + hk[3], 0.18 * s + hk[4]];
  return out;
}
/** at full stretch the distal tip digs in and hooks towards the body, its suckers turned in (the last 15 %: Anderson) */
function scoopKey(d: StrokeDir, elev: number, out: ArmKey): ArmKey {
  reachKey(d, elev, out);
  out.curl[4] += 0.3;
  out.swing[4] += d === 'BL' ? 0.5 : -0.35;
  return out;
}
/** lifted off the sand from the scoop, the hook let go */
function drawKey(d: StrokeDir, elev: number, out: ArmKey): ArmKey {
  reachKey(d, elev + 0.25, out);
  out.psi += 0.3 * ((headStroke(d) ? ARCH_H : ARCH_B).psi - out.psi);
  out.curl = [0, 0.02, 0.04, 0.06, 0.08]; out.swing = NO_SWING.slice(); out.ext = 1.95;
  return out;
}
/** the loop it is drawn back into, rolled up by `roll` (0 straight … 1), turned `toReach` of the way back to its reach */
function rollKey(d: StrokeDir, roll: number, toReach: number, elev: number, ext: number, out: ArmKey): ArmKey {
  const a = headStroke(d) ? ARCH_H : ARCH_B;
  copyKey(a, out);
  out.psi = a.psi + toReach * (REACH_PSI[d] - a.psi); out.elev = a.elev + elev;
  out.curl = a.curl.map((c) => roll * c); out.swing = a.swing.map((c) => roll * c); out.ext = ext;
  return out;
}
const blankKey = (): ArmKey => key(0, 0, [0, -1, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], 1);
function copyKey(a: ArmKey, out: ArmKey): ArmKey {
  out.psi = a.psi; out.elev = a.elev; out.bend.copy(a.bend); out.curl = a.curl.slice(); out.swing = a.swing.slice(); out.ext = a.ext;
  return out;
}
function mixKey(a: ArmKey, b: ArmKey, t: number, out: ArmKey): ArmKey {
  const l = (x: number, y: number) => x + (y - x) * t;
  out.psi = l(a.psi, b.psi); out.elev = l(a.elev, b.elev); out.ext = l(a.ext, b.ext);
  out.bend.copy(a.bend).lerp(b.bend, t).normalize();
  out.curl = a.curl.map((c, k) => l(c, b.curl[k])); out.swing = a.swing.map((c, k) => l(c, b.swing[k]));
  return out;
}
/** through keys K at u = U without stopping at the inner ones (cubic Hermite, Catmull-Rom tangents, at rest at the ends) */
function splineKey(K: ArmKey[], U: number[], u: number, out: ArmKey): ArmKey {
  let i = 0;
  while (i < K.length - 2 && u > U[i + 1]) i++;
  const h = U[i + 1] - U[i], s = Math.min(1, Math.max(0, (u - U[i]) / h));
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const tan = (j: number, f: (k: ArmKey) => number) => (j <= 0 || j >= K.length - 1 ? 0 : (f(K[j + 1]) - f(K[j - 1])) / (U[j + 1] - U[j - 1]));
  const at = (f: (k: ArmKey) => number) => h00 * f(K[i]) + h10 * h * tan(i, f) + h01 * f(K[i + 1]) + h11 * h * tan(i + 1, f);
  out.psi = at((k) => k.psi); out.elev = at((k) => k.elev); out.ext = at((k) => k.ext);
  out.bend.set(at((k) => k.bend.x), at((k) => k.bend.y), at((k) => k.bend.z)).normalize();
  out.curl = [0, 1, 2, 3, 4].map((j) => at((k) => k.curl[j]));
  out.swing = [0, 1, 2, 3, 4].map((j) => at((k) => k.swing[j]));
  return out;
}
/** the crown's sides (root frame, model mm): ε of the reach keeps the stretched arm's tip on the sand as the body sinks */
const CROWN_SIDE = new Vector3(2.1, 0.35, 14.8);

export interface SquidState {
  mode: Mode;
  phase: string;
  t: number;
  dur: number;
  pos: Vector3;
  vel: Vector3;
  heading: number;
  pitch: number;
  roll: number;
  turn: number;
  /** belly's height over the sand (m), its goal */
  alt: number;
  altGoal: number;
  altVel: number;
  bury: number;
  buryGoal: number;
  sandCoat: number;
  headCover: number;
  /** the brightness of the bottom it matches (0 light sand … 1 dark mud) */
  bg: number;
  fear: number;
  target: Vector3 | null;
  pulses: number;
  settled: boolean;
  night: boolean;
  /** seconds since it was made */
  clock: number;
  /** a jet's quick tip of the body over its damped pitch (rad, + tail down): the pose and toWorld add it */
  pitchKick: number;
  /** the burial's draws (null for one born buried or back in the sand after an ambush) */
  plan: BurrowPlan | null;
  /** arm II's stroke in sweep: which, how far into it (0 … 1), its direction */
  stroke: { k: number; u: number; dir: StrokeDir } | null;
  /** when (clock) it last dropped its sand coat, −1 never */
  shedAt: number;
}

export function createSquidBehavior(opts: SquidOptions) {
  const { world } = opts;
  const rng = opts.rng ?? Math.random;
  const rand = (a: number, b: number) => a + rng() * (b - a);
  const K = opts.scale ?? 1;
  const ML = ML_MM * MM * K;
  const home = opts.home ?? { x: opts.start.x, z: opts.start.z };
  const autonomous = opts.autonomous ?? true;
  const range = opts.range ?? 0.25;
  const pers = { bold: rand(0.85, 1.2), dark: rand(0.85, 1.15), wave: rand(0, 6.28) };

  const st: SquidState = {
    mode: 'REST', phase: 'sit', t: 0, dur: rand(4, 9),
    pos: new Vector3(opts.start.x, 0, opts.start.z), vel: new Vector3(),
    heading: opts.start.heading ?? 0, pitch: 0, roll: 0, turn: 0,
    alt: 0, altGoal: 0, altVel: 0,
    bury: 0, buryGoal: 0, sandCoat: 0, headCover: 0, bg: 0.3, fear: 0,
    target: null, pulses: 0, settled: true, night: false,
    clock: 0, pitchKick: 0, plan: null, stroke: null, shedAt: -1,
  };
  if (opts.startBuried) { st.mode = 'BURROW'; st.phase = 'buried'; st.dur = rand(20, 80); st.bury = st.buryGoal = 1; st.sandCoat = 0.9; st.headCover = 0.85; st.settled = true; }
  st.pos.y = world.ground(st.pos.x, st.pos.z) + (SIT_Y + (BURIED_Y - SIT_Y) * st.bury) * MM * K;

  // ---- animated quantities
  const an = {
    breathPh: rand(0, 6.28), mantle: 1, jetT: -1, jetDur: 0.2, jetDepth: 0.16,
    finPh: [rand(0, 6), rand(0, 6)] as [number, number], finFreq: 1.2, finAmp: 0.08, finAmpGoal: 0.08, finFold: -0.35, finFoldGoal: -0.35, finK: 0.9, finDir: 1, flap: 0, flapGoal: 0,
    armDroop: 0.55, armClose: 0.1, armSpread: 0.0, armWave: 0.4, armRaise: [0, 0] as [number, number], tipCurl: 0.3,
    crawlPh: 0, crawl: 0,
    headPitch: 0.06, headYaw: 0, funnelPitch: 0, funnelYaw: 0, funnelYawGoal: 0, funnelT: rand(4, 10), funnelSide: 0, funnelSideGoal: 0,
    ten: [0, 0], tenGoal: 0, tenAim: new Vector3(0, -0.1, 1).normalize(), tenAimW: 0,
    eyeT: rand(0.5, 2), eyeOff: [new Vector3(), new Vector3()], eyeLook: null as Vector3 | null,
    pupil: 0.45,
    // burying: the jets fired, the pitch kick's two parts, arm II's stroke (its weight, ramped in and out, and its key)
    jetsDone: 0, kickRise: 0, kickFall: 0, strokeW: 0, key: copyKey(UP, blankKey()), strokeK: -1, strokeU: 0,
    /** the coat's sand shows on the head as it rises out of the sand (held at 1 while it emerges) */
    coverHold: 0,
    /** buried, the pupils turned up (0 … 1); arm II's pair in sync (1 while it buries) */
    eyeUp: 0, sync: 0,
    ch: { y: 0.7, r: 0.95, b: 0.25, mottle: 0.45, irid: 0.75, pale: 0 },
    chGoal: { y: 0.7, r: 0.95, b: 0.25, mottle: 0.45, irid: 0.75, pale: 0 },
    chRate: 2, flash: 0,
  };

  let prey: Mysid | null = null;
  let threatFrom: Vector3 | null = null;
  const fx: (FxEvent | PitEvent)[] = [];
  const P = emptyPose();
  const fwd = new Vector3(), right = new Vector3(), _v = new Vector3(), _w = new Vector3(), _q = new Quaternion(), _e = new Euler(0, 0, 0, 'YXZ');
  const _qh = new Quaternion(), _qh2 = new Quaternion(), _qa = new Quaternion(), _ax = new Vector3(1, 0, 0), _ay = new Vector3(0, 1, 0);

  const ground = (x: number, z: number) => world.ground(x, z);
  const canBurrow = () => world.canBurrow?.() !== false;
  const forward = (out: Vector3) => out.set(Math.sin(st.heading), 0, Math.cos(st.heading));

  /** a point in the animal's frame (mm, model) → world */
  function toWorld(local: Vector3, out: Vector3): Vector3 {
    _e.set(-(st.pitch + st.pitchKick), st.heading, st.roll);
    _q.setFromEuler(_e);
    return out.copy(local).multiplyScalar(MM * K).applyQuaternion(_q).add(st.pos);
  }

  function sand(at: Vector3, vel: Vector3, count: number, spread: number, size: number, life: number, alpha = 0.45, grow?: number, kill?: boolean, shade?: number): void {
    if (!canBurrow()) return;
    fx.push({ kind: 'sand', pos: at.clone(), vel: vel.clone(), count, spread: spread * K, size: size * K, life, alpha, grow, kill, shade });
  }
  /** a puff in the heading frame: offset (side: + the animal's left, forward; model mm), height over the sand (mm), velocity (side, up, forward; mm/s) */
  function puff(side: number, ahead: number, up: number, vs: number, vu: number, vf: number, count: number, spread: number, size: number, life: number, alpha: number): void {
    const at = st.pos.clone().addScaledVector(right, -side * MM * K).addScaledVector(fwd, ahead * MM * K);
    at.y = ground(at.x, at.z) + up * MM * K;
    const v = right.clone().multiplyScalar(-vs * MM * K).addScaledVector(fwd, vf * MM * K).setY(vu * MM * K);
    sand(at, v, count, spread * MM, size * MM, life, alpha);
  }
  const _tq = new Quaternion(), _tq2 = new Quaternion(), _tv = new Vector3(), _tx = new Vector3(1, 0, 0), _ty = new Vector3(0, 1, 0);
  /** where the funnel's mouth is now and which way it points (model frame; the funnel turned on its joint, the head on the neck) */
  function funnelMouth(at: Vector3, dir: Vector3): void {
    _tq.setFromAxisAngle(_tx, -P.headPitch).multiply(_tq2.setFromAxisAngle(_ty, P.headYaw));
    const qf = new Quaternion().setFromAxisAngle(_tx, -funnelPitchOf(P)).multiply(_tq2.setFromAxisAngle(_ty, P.funnelYaw));
    const qs = funnelSwingQ(P.funnelSide, new Quaternion());
    at.copy(FUNNEL_TIP).sub(FUNNEL_PIVOT).applyQuaternion(qf).add(FUNNEL_PIVOT)
      .sub(SWING_PIVOT).applyQuaternion(qs).add(SWING_PIVOT)
      .sub(HEAD_PIVOT).applyQuaternion(_tq).add(HEAD_PIVOT);
    dir.set(0, -0.04, 1).applyQuaternion(_tq2.setFromAxisAngle(_tx, 0.5 * Math.abs(P.funnelSide))).applyQuaternion(qf).applyQuaternion(qs).applyQuaternion(_tq).normalize();
  }
  function ink(): void {
    const dir = new Vector3();
    funnelMouth(_tv, dir);
    const at = toWorld(_tv, new Vector3());
    // (out of the funnel's mouth, the way it points)
    _e.set(-(st.pitch + st.pitchKick), st.heading, st.roll);
    const v = dir.applyQuaternion(_q.setFromEuler(_e)).multiplyScalar(0.04 * K).add(new Vector3(0, 0.01 * K, 0));
    fx.push({ kind: 'ink', pos: at, vel: v, count: 14, spread: 0.004 * K, size: 0.007 * K, life: 4.5, alpha: 0.75 });
    fx.push({ kind: 'ink', pos: at.clone().addScaledVector(v, 0.15), vel: v.clone().multiplyScalar(0.5), count: 8, spread: 0.003 * K, size: 0.01 * K, life: 6, alpha: 0.55 });
  }

  function setMode(mode: Mode, phase: string, dur: number): void {
    const was = st.mode, inSand = was === 'BURROW' || (was === 'HUNT' && ambushing);
    st.mode = mode; st.phase = phase; st.t = 0; st.dur = dur; st.settled = false;
    queued = null;
    if (mode === 'BURROW') shedding = false;
    else {
      // out of the sand, however deep it was: no other mode holds it down (a burst only from deep in, and the escape
      // from the sand makes its own)
      if (inSand && mode !== 'ESCAPE' && st.bury > 0.3) emerge();
      st.buryGoal = 0;
    }
    if (mode !== 'HUNT') dropPrey();
  }
  /** the hunt is over: a mysid already in its arms is eaten (cut short, it is not let go to swim off), any other forgotten */
  function dropPrey(): void {
    if (prey?.state === 'caught') { prey.state = 'eaten'; prey.remains = 0; }
    prey = null;
  }
  function phase(p: string, dur: number): void { st.phase = p; st.t = 0; st.dur = dur; }

  /** lie buried for `dur` (after the strokes, an ambush, or a rise called off); its coat is made up over 1.5 s */
  function toBuried(dur: number): void {
    st.mode = 'BURROW'; st.phase = 'buried'; st.t = 0; st.dur = dur; st.buryGoal = 1; st.stroke = null;
    shedding = false;
    coatFrom.hc = st.headCover; coatFrom.sc = st.sandCoat;
  }

  /**
   * The sand coat dropped as a unit, a sinking decoy (Shears 1988, von Byern et al. 2017): the coat goes (at once, or
   * in ≈ 0.15 s as it lies on the bottom), one clump of sand falls off its back.
   */
  function shedCoat(now: boolean): void {
    if (now) st.sandCoat = st.headCover = 0;
    coatRamps.length = 0;
    st.shedAt = st.clock;
    shedding = true;
    keepCoat = false;
    forward(fwd);
    // (the coat slides off as a unit: one clump off the back that falls behind it onto the sand, and single grains
    // sprayed off the head and the back, 67; the sprays stay under 12 grains each, only the clump is "the" shed. Wet
    // and bound in mucus, the coat's grains are darker than the bed: the clump and the grains show against it)
    const c = toWorld(_tv.set(0, 10.5, -6), new Vector3());
    sand(c, fwd.clone().multiplyScalar(-0.01 * K).setY(-0.004 * K), 24, 0.009, 0.0035, 2.8, 0.85, 1.25, false, 0.62);
    for (const [z, y] of [[-12, 10.5], [-4, 11], [3, 9], [10, 7.5]] as const) {
      sand(toWorld(_tv.set(0, y, z), new Vector3()), new Vector3(0, 0.012 * K, 0), 10, 0.012, 0.0009, 2.6, 0.95, 1.0, true, 0.5);
    }
  }

  /** a calm way out: it rises slowly out of the sand with its coat on, then does what it was asked (`queued`) */
  function startEmerge(): void {
    phase('emerge', rand(1.4, 2.4));
    st.settled = false;
    emergeFrom = st.bury;
    shedding = false;
    pauseT = -1;
  }
  /** ambushing from the sand: in it all the time (the strike only lifts it to 0.6) */
  const sandAmbush = () => st.mode === 'HUNT' && ambushing && st.bury > 0.5;
  /** hover, swim and crawl from the sand (an ambush's too) wait for it to rise; called again, only the command waiting changes */
  function viaEmerge(cmd: () => void): boolean {
    if (sandAmbush()) { dropPrey(); toBuried(0); }
    if (st.mode !== 'BURROW' || !(st.phase === 'emerge' || st.bury > 0.6)) return false;
    if (st.phase !== 'emerge') startEmerge();
    queued = cmd;
    return true;
  }

  /** leaving the sand: a jet upward, sand sliding off */
  function emerge(): void {
    const c = st.pos.clone();
    sand(c.setY(ground(c.x, c.z) + 0.002 * K), new Vector3(0, 0.05 * K, 0), 22, 0.012, 0.006, 2.4, 0.55);
    st.buryGoal = 0;
    jet(0.12, 0.18);
  }

  /** one jet: the mantle contracts fast and refills */
  function jet(depth: number, dur: number): void {
    an.jetT = 0; an.jetDur = dur; an.jetDepth = depth;
  }

  // ------------------------------------------------------------------ commands (the brain's intents)

  const api = {
    state: st,
    pose: P,
    fx,
    get prey() { return prey; },
    get settled() { return st.settled; },
    get pos() { return st.pos; },
    /** sit on the sand (or come down to it) */
    rest(seconds = rand(6, 20)) {
      if (st.mode === 'BURROW' && st.phase === 'buried') { st.dur = Math.max(st.dur - st.t, seconds); st.t = 0; return; }
      if (stayInSand(seconds)) return;
      setMode('REST', st.alt > 0.3 * ML ? 'descend' : 'sit', seconds);
    },
    /** hang over the sand on the fins */
    hover(seconds = rand(5, 14)) {
      if (viaEmerge(() => api.hover(seconds))) return;
      setMode('HOVER', 'rise', seconds);
      st.altGoal = rand(0.45, 1.1) * ML;
    },
    /** swim to a point (or a short way) arms first on the fins */
    swim(target: { x: number; z: number } | null) {
      if (viaEmerge(() => api.swim(target))) return;
      const t = target ? new Vector3(target.x, 0, target.z) : (() => { forward(_v); return st.pos.clone().addScaledVector(_v, rand(6, 14) * ML).add(new Vector3(rand(-1, 1) * 4 * ML, 0, rand(-1, 1) * 4 * ML)); })();
      st.target = limit(t);
      setMode('SWIM', st.alt < 0.3 * ML ? 'takeoff' : 'travel', 30);
    },
    /** a short shuffle on the bottom */
    crawl(target: { x: number; z: number } | null) {
      if (viaEmerge(() => api.crawl(target))) return;
      const t = target ? new Vector3(target.x, 0, target.z) : st.pos.clone().add(forward(_v).multiplyScalar(rand(1.5, 3) * ML));
      st.target = limit(t);
      setMode('CRAWL', st.alt > 0.3 * ML ? 'descend' : 'turn', 20);
    },
    /** dig in and cover itself (stays buried for `seconds`) */
    burrow(seconds = rand(30, 120)) {
      if (!canBurrow()) { api.rest(seconds); return; }
      if (stayInSand(seconds)) return;
      if (st.mode === 'BURROW') {
        // buried it stays longer; on the way in, the burial it is heading for does (the phase keeps its own time)
        if (st.phase === 'buried') { st.dur = Math.max(st.dur, st.t + seconds); return; }
        if (st.phase !== 'emerge') { burrowFor = Math.max(burrowFor, seconds); return; }
        // rising: with the coat still on it sinks back; once the coat is off it starts again
        if (!shedding) { queued = null; toBuried(seconds); return; }
      }
      setMode('BURROW', st.alt > 0.3 * ML ? 'descend' : 'settle', rand(1.0, 2.5));
      burrowFor = seconds;
    },
    /** hunt a mysid (from the sand when buried: an ambush) */
    hunt() {
      // (hunting from the sand already: that hunt goes on)
      if (sandAmbush()) return;
      const ambush = st.mode === 'BURROW' && st.bury > 0.6;
      afterAmbush = 0;
      spawnPrey(ambush);
      if (ambush) { st.mode = 'HUNT'; st.phase = 'ambush'; st.t = 0; st.dur = rand(6, 14); st.settled = false; }
      else { setMode('HUNT', 'search', rand(0.6, 1.6)); st.altGoal = rand(0.35, 0.7) * ML; st.pulses = 0; }
    },
    /** flee from a point: ink, jets mantle first, glide, land */
    escape(from: Vector3 | null, to: Vector3 | null = null) {
      if (st.mode === 'ESCAPE' && st.phase !== 'land') return;
      threatFrom = from ? from.clone() : null;
      const away = new Vector3();
      if (to) away.subVectors(to, st.pos);
      else if (from) away.subVectors(st.pos, from);
      else forward(away).negate();
      away.y = 0;
      if (away.lengthSq() < 1e-10) forward(away).negate();
      away.normalize();
      escDir.copy(away);
      const buried = st.bury > 0.4;
      // out of the sand at once, the coat dropped, one burst of sand (inferred: threatened in the sand, E. scolopes
      // stays in it and blows sand or ink, Anderson et al. 2002; this is the flight once it is touched)
      if (buried) shedCoat(true);
      // (setMode lets it out of the sand however deep it was)
      setMode('ESCAPE', 'startle', buried ? 0.12 : 0.09);
      if (buried) { sand(st.pos.clone().setY(ground(st.pos.x, st.pos.z) + 0.003 * K), new Vector3(0, 0.08 * K, 0).addScaledVector(away, 0.05 * K), 30, 0.014, 0.007, 3, 0.6); }
      an.chRate = 25;
      an.flash = 1;
    },
    /** press down and keep still, darkened (eyes on the threat) */
    freeze(seconds = 4) {
      if (st.mode === 'BURROW' && st.bury > 0.5) {
        if (st.phase === 'buried') st.dur = Math.max(st.dur, st.t + seconds);
        else if (st.phase !== 'emerge') burrowFor = Math.max(burrowFor, seconds);
        else if (!shedding) { queued = null; toBuried(seconds); }
        return;
      }
      if (stayInSand(seconds)) return;
      setMode('REST', st.alt > 0.3 * ML ? 'descend' : 'freeze', seconds);
    },
    /** the bottom's brightness under it (0 light … 1 dark), and whether it is night */
    setSurroundings(bg: number, night: boolean) { st.bg = clamp(bg, 0, 1); st.night = night; },
    update,
  };

  let burrowFor = 60;
  /** this hunt began from the sand */
  let ambushing = false;
  /** emerging: the command it carries out once out, the burial it rose from, the coat dropped and when, the pause after */
  let queued: (() => void) | null = null;
  let emergeFrom = 1, shedding = false, pauseT = -1, pauseFor = 0;
  /** by day it came out with its coat on and keeps it while it stays near the bottom (Shears 1988: by day, coat on, it
   * keeps within 2 body lengths of the bottom) */
  let keepCoat = false;
  /** asked to stay in the sand (burrow, rest, freeze) while it ambushes from it: how long it lies buried after the hunt */
  let afterAmbush = 0;
  function stayInSand(seconds: number): boolean {
    if (!sandAmbush()) return false;
    afterAmbush = Math.max(afterAmbush, seconds);
    return true;
  }
  /** the ambush over, it lies buried again (as long as it was asked to meanwhile: that request is still running) */
  function backToSand(dur: number): void {
    dropPrey();
    toBuried(Math.max(dur, afterAmbush));
    st.settled = afterAmbush <= 0;
    afterAmbush = 0;
  }
  /** the coat as it went into 'buried' (it is made up from there), and the grains of each backward jet settling onto it */
  const coatFrom = { hc: 0, sc: 0 };
  const coatRamps: { t0: number; dur: number; sc: number; done: number }[] = [];
  /** arm II's tips' sand due this frame (after the pose: at the FK tips) */
  const tipFx = { scoop: false, throw: false, pour: false };
  const escDir = new Vector3();

  function limit(t: Vector3): Vector3 {
    const b = world.bounds?.();
    if (b) { const m = 2 * ML; t.x = clamp(t.x, b.minX + m, b.maxX - m); t.z = clamp(t.z, b.minZ + m, b.maxZ - m); }
    return t;
  }

  function spawnPrey(ambush: boolean): void {
    forward(fwd);
    right.set(-fwd.z, 0, fwd.x);
    const d = (ambush ? rand(1.6, 2.2) : rand(2, 3.5)) * ML;
    const side = rand(-0.9, 0.9);
    const x = st.pos.x + fwd.x * d * Math.cos(side) + right.x * d * Math.sin(side);
    const z = st.pos.z + fwd.z * d * Math.cos(side) + right.z * d * Math.sin(side);
    const len = ML * rand(0.28, 0.36);
    const head = ambush ? Math.atan2(st.pos.x - x, st.pos.z - z) + rand(-0.5, 0.5) : rng() * Math.PI * 2;
    prey = new Mysid(x, ground(x, z) + len * 2, z, len, rng, head);
    if (ambush) prey.pace = 2.2;
    ambushing = ambush;
  }

  // ------------------------------------------------------------------ per mode

  function steerTo(target: Vector3, rate: number, dt: number): number {
    const want = Math.atan2(target.x - st.pos.x, target.z - st.pos.z);
    const d = wrap(want - st.heading);
    const turn = clamp(d * 3, -rate, rate);
    st.turn = damp(st.turn, turn, 6, dt);
    st.heading = wrap(st.heading + st.turn * dt);
    return Math.abs(d);
  }

  function chroma(y: number, r: number, b: number, mottle: number, irid: number, pale: number, rate = 2): void {
    const g = an.chGoal;
    g.y = y; g.r = r; g.b = b * pers.dark * (0.8 + 0.4 * st.bg); g.mottle = mottle; g.irid = irid; g.pale = pale;
    an.chRate = Math.max(rate, an.chRate * 0.9);
  }

  function finSet(amp: number, freq: number, fold: number, flap = 0, dir = 1, k = 0.9): void {
    an.finAmpGoal = amp; an.finFreq = freq; an.finFoldGoal = fold; an.flapGoal = flap; an.finDir = dir; an.finK = k;
  }
  function arms(droop: number, close: number, spread: number, wave: number): void {
    an.armDroop = droop; an.armClose = close; an.armSpread = spread; an.armWave = wave;
  }

  function onBottom(): boolean { return st.alt < 0.15 * ML; }

  /** sink to the sand (fins slowing it), a little cloud when it touches */
  function descend(dt: number): boolean {
    st.altGoal = 0;
    finSet(0.35, 2.2, 0.05, 0.1);
    st.vel.multiplyScalar(Math.exp(-dt * 2));
    if (st.alt < 0.04 * ML) {
      sand(st.pos.clone().setY(ground(st.pos.x, st.pos.z) + 0.001 * K), new Vector3(0, 0.012 * K, 0), 8, 0.006, 0.004, 1.6, 0.3);
      return true;
    }
    return false;
  }

  function updateRest(dt: number): void {
    if (st.phase === 'descend') { if (descend(dt)) phase(st.dur > 0 ? 'sit' : 'sit', st.dur); return; }
    st.altGoal = 0;
    st.vel.multiplyScalar(Math.exp(-dt * 4));
    const freeze = st.phase === 'freeze';
    finSet(freeze ? 0.02 : 0.06 + 0.12 * Math.max(0, Math.sin(st.t * 0.7 + pers.wave)) ** 8, 1.4, -0.35, 0);
    arms(0.7, 0.0, 0.28, freeze ? 0.05 : 0.35);
    an.tipCurl = freeze ? 0.6 : 0.85;
    an.headPitch = freeze ? 0.0 : 0.07;
    if (freeze) chroma(0.8, 1.0, 0.6, 0.8, 0.4, 0, 4);
    else chroma(0.7, 0.95, 0.25, 0.45, 0.75, 0, 1.5);
    if (st.t > st.dur) {
      st.settled = true;
      if (autonomous) choose();
    }
  }

  function updateHover(dt: number): void {
    // station keeping on the fins: small waves, a soft puff of the funnel now and then
    finSet(0.32, rand(2.4, 2.6), 0.18, 0.12);
    arms(0.25, 0.3, 0.0, 0.7);
    an.headPitch = -0.08;
    // the hovering dress (photographs 17, 34): yellow-orange ground, red-brown dots, glassy
    chroma(0.95, 0.4, 0.12, 0.3, 0.8, 0.45, 1.2);
    st.vel.multiplyScalar(Math.exp(-dt * 1.5));
    // a slow drift and a lazy turn
    st.vel.x += Math.sin(st.t * 0.37 + pers.wave) * 0.02 * ML * dt;
    st.vel.z += Math.cos(st.t * 0.31 + pers.wave) * 0.02 * ML * dt;
    st.turn = damp(st.turn, 0.25 * Math.sin(st.t * 0.21 + pers.wave), 1, dt);
    st.heading = wrap(st.heading + st.turn * dt);
    if (st.phase === 'rise' && Math.abs(st.alt - st.altGoal) < 0.15 * ML) phase('hang', st.dur);
    if (st.phase === 'rise' && st.t < 0.05 && onBottom()) {
      sand(st.pos.clone().setY(ground(st.pos.x, st.pos.z) + 0.001 * K), new Vector3(0, 0.02 * K, 0), 10, 0.006, 0.004, 1.8, 0.3);
      jet(0.07, 0.25);
    }
    if (st.phase === 'hang' && rng() < dt * 0.3) jet(0.04, 0.3);
    if (st.phase === 'hang' && st.t > st.dur) {
      st.settled = true;
      if (autonomous) choose(); else { setMode('REST', 'descend', rand(6, 14)); }
    }
  }

  function updateSwim(dt: number): void {
    const tgt = st.target ?? st.pos;
    const dist = Math.hypot(tgt.x - st.pos.x, tgt.z - st.pos.z);
    if (st.phase === 'takeoff') {
      st.altGoal = rand(0.6, 1.0) * ML;
      if (st.t < dt * 1.5) {
        jet(0.1, 0.22);
        sand(st.pos.clone().setY(ground(st.pos.x, st.pos.z) + 0.001 * K), new Vector3(0, 0.03 * K, 0), 12, 0.007, 0.005, 2, 0.35);
      }
      finSet(0.5, 3.2, 0.12, 0.25);
      if (st.t > 0.45) phase('travel', 30);
    } else if (st.phase === 'travel') {
      const err = steerTo(tgt, 1.8, dt);
      const sp = clamp(dist / ML * 0.5, 0.4, 1.6) * ML * (err > 1.2 ? 0.3 : 1);
      forward(fwd);
      st.vel.x = damp(st.vel.x, fwd.x * sp, 2, dt);
      st.vel.z = damp(st.vel.z, fwd.z * sp, 2, dt);
      st.altGoal = clamp(st.altGoal, 0.5 * ML, 1.4 * ML);
      // waves faster the faster it goes, a slight flap; now and then a soft jet adds to the fins
      finSet(0.45 + 0.25 * (sp / ML / 1.6), 2.6 + 1.6 * (sp / ML / 1.6), 0.1, 0.2 + 0.15 * (sp / ML / 1.6));
      if (rng() < dt * 0.35 && an.jetT < 0) { jet(0.06, 0.28); st.vel.addScaledVector(fwd, 0.25 * ML); }
      arms(0.15, 0.2, 0.0, 0.5);
      an.headPitch = -0.04;
      chroma(0.85, 0.5, 0.18, 0.35, 0.8, 0.3, 1.5);
      if (dist < 0.8 * ML) phase('arrive', 1.5);
    } else if (st.phase === 'arrive') {
      st.vel.multiplyScalar(Math.exp(-dt * 2.5));
      finSet(0.4, 2.2, 0.15, 0.1, -0.6);
      if (descend(dt) || st.t > 3) {
        st.target = null;
        st.settled = true;
        if (autonomous) choose(); else setMode('REST', 'sit', rand(6, 14));
      }
    }
  }

  function updateCrawl(dt: number): void {
    const tgt = st.target ?? st.pos;
    if (st.phase === 'descend') { if (descend(dt)) phase('turn', 2); return; }
    st.altGoal = 0;
    finSet(0.22, 3.0, -0.15, 0.05);
    chroma(0.7, 0.95, 0.25, 0.45, 0.75, 0, 1.5);
    if (st.phase === 'turn') {
      const err = steerTo(tgt, 0.9, dt);
      st.vel.multiplyScalar(Math.exp(-dt * 4));
      if (err < 0.2 || st.t > 2.5) phase('crawl', 12);
      arms(0.6, 0.1, 0.05, 0.3);
      return;
    }
    steerTo(tgt, 0.6, dt);
    const dist = Math.hypot(tgt.x - st.pos.x, tgt.z - st.pos.z);
    // a reach-and-pull cycle of the ventral arms (0.9 s); the body moves on the pull
    an.crawlPh += dt / 0.9;
    const ph = an.crawlPh % 1;
    an.crawl = 1;
    const pull = ph > 0.45 ? Math.sin(((ph - 0.45) / 0.55) * Math.PI) : 0;
    forward(fwd);
    const sp = pull * 0.55 * ML;
    st.vel.x = damp(st.vel.x, fwd.x * sp, 8, dt);
    st.vel.z = damp(st.vel.z, fwd.z * sp, 8, dt);
    arms(0.55, 0.05, 0.1, 0.2);
    if (dist < 0.3 * ML || st.t > st.dur) {
      an.crawl = 0;
      st.target = null;
      st.settled = true;
      if (autonomous) choose(); else setMode('REST', 'sit', rand(5, 12));
    }
  }

  /** the burial's random draws, made as it starts to blow */
  function makePlan(): BurrowPlan {
    // J1 backward and strong, a pause, then one of the runs seen (Anderson 2002: 1–3 jets each way, a posterior run
    // allowed; Drerup 2019: even counts in Sepiola)
    const r = rng();
    const tail: JetDir[] = r < 0.35 ? ['F', 'B', 'F', 'B'] : r < 0.6 ? ['B', 'F', 'B'] : r < 0.8 ? ['F', 'B', 'F', 'B', 'F', 'B'] : ['F', 'B', 'B', 'F', 'B'];
    const jets: JetDir[] = ['B', ...tail];
    // (S. parva ≈ 1.3 s a jet)
    const jetT = [0.15, 0.15 + rand(0.8, 1.3)];
    while (jetT.length < jets.length) jetT.push(jetT[jetT.length - 1] + rand(0.9, 1.4));
    // most go straight on to the arms (S. parva: 63 %)
    const gap = rng() < 0.6 ? 0 : rand(0.2, 1.0);
    // 「数回」 (Kaiyukan); S. atlantica 6.0 ± 0.8 strokes of ≈ 1.1–1.7 s
    const rs = rng();
    const strokes = rs < 0.3 ? 4 : rs < 0.75 ? 6 : 8;
    const strokeT = Array.from({ length: strokes }, () => rand(1.1, 1.6));
    return { jets, jetT, blow: jetT[jetT.length - 1] + 0.7, gap, strokes, strokeT, buriedSide: rng() < 0.5 ? 1 : -1 };
  }

  /** how far the jets have sunk it by t into blow: each jet's step ramps in over 0.25 s */
  function blowBury(pl: BurrowPlan, t: number): number {
    let sum = 0, got = 0;
    pl.jets.forEach((d, j) => { const w = j === 0 ? JET_W.J1 : JET_W[d]; sum += w; got += w * smooth((t - pl.jetT[j]) / 0.25); });
    return (BLOW_BURY * got) / sum;
  }

  function fireJet(pl: BurrowPlan, j: number): void {
    const d = pl.jets[j], first = j === 0;
    if (first) jet(0.17, 0.34);
    else if (d === 'B') jet(0.14, 0.32);
    else jet(0.08, 0.26);
    // the body tips with the jet (over the damped pitch): the tail down with a backward one, the head with a forward one
    const kick = d === 'B' ? (first ? 0.09 : 0.08) : -0.06;
    an.kickRise += kick / KICK_N; an.kickFall += kick / KICK_N;
    if (d === 'B') {
      // the water runs back under the belly: a cloud out behind and under the mantle and at its flanks, billowing low
      // along the sand (up about half a mantle length behind it, hardly at all at the flanks)
      const n = first ? 1.4 : 1, v = first ? 1.3 : 1;
      puff(0, -19, 2.5, 0, 22 * v, -60 * v, Math.round(12 * n), 4.5, 5.5, 2.6, 0.7);
      for (const sd of [1, -1]) puff(11 * sd, -8, 2.0, 42 * v * sd, 10 * v, -22 * v, Math.round(6 * n), 3.5, 4.8, 2.4, 0.55);
      // and falls back, partly onto the back (Boletzky)
      coatRamps.push({ t0: st.clock + 0.35, dur: 0.5, sc: 0.07, done: 0 });
    } else {
      // forward along the sand: a puff out in front of the arm crown (ahead of the arms, not hidden under them),
      // spreading low to both sides
      puff(0, 25, 2.5, 0, 18, 50, 10, 4.0, 5.0, 2.2, 0.65);
      for (const sd of [1, -1]) puff(8 * sd, 22, 2.0, 30 * sd, 10, 35, 4, 3.5, 4.5, 2.0, 0.55);
    }
    // the hollow it blows round itself, ringed with thrown-out sand (42, 44–46), darker with each jet; it stays open
    // through the strokes and is filled in once it lies buried
    if (canBurrow()) fx.push({ kind: 'pit', pos: st.pos.clone().addScaledVector(fwd, -0.1 * ML), heading: st.heading, halfW: 0.95 * ML, halfL: 1.25 * ML, strength: 0.35 + (0.65 * j) / Math.max(1, pl.jets.length - 1), deepen: !first, life: 60 });
  }

  /** the reach's elevation: the stretched arm's tip lowered onto the sand from the crown, however deep it lies */
  function reachElev(): number {
    // (the crown turned with the head on the neck: bent down as it strokes)
    const c = toWorld(_v.copy(CROWN_SIDE).sub(HEAD_PIVOT).applyAxisAngle(_ax, -P.headPitch).add(HEAD_PIVOT), _w);
    const h = (c.y - ground(c.x, c.z)) / (MM * K);
    return 0.1 + Math.asin(clamp(-h / (14.6 * 2.0), -0.3, 0.3));
  }
  const _k1 = blankKey(), _k2 = blankKey(), _k3 = blankKey(), _k4 = blankKey(), _k5 = blankKey();
  /**
   * Arm II at u (0 … 1) of a stroke towards d: out low over the sand from in front of the eyes, stretched to twice its
   * length (u 0–0.32); a moment at full stretch while the tip digs in and hooks (0.32–0.40); then drawn back without
   * a stop, up off the sand, its middle bowed into an arch over the head (the grains trickling off the tips: 0.58–0.92),
   * raised in front of the eyes again for the next one.
   */
  function strokeKey(d: StrokeDir, u: number, out: ArmKey): ArmKey {
    const er = reachElev();
    const reach = reachKey(d, er, _k1), scoop = scoopKey(d, er, _k2);
    if (u < 0.32) return mixKey(UP, reach, smooth(u / 0.32), out);
    if (u < 0.4) return mixKey(reach, scoop, smooth((u - 0.32) / 0.08), out);
    // (drawn off the sand straightened, then its suckers turn up and in and it rolls up into the loop)
    const turned = rollKey(d, 0, 0.6, 0.4, 1.92, _k5);
    return splineKey([scoop, drawKey(d, er, _k3), turned, rollKey(d, 0.45, 0.25, 0.25, 1.85, _k4), headStroke(d) ? ARCH_H : ARCH_B, UP], [0.4, 0.45, 0.5, 0.6, 0.76, 1], u, out);
  }

  /** keeps its place on the sand */
  function holdStill(dt: number): void {
    st.altGoal = 0;
    st.vel.multiplyScalar(Math.exp(-dt * 5));
  }
  /** dark red-brown from settling until it is covered (Anderson 2002) */
  const burrowDress = () => chroma(0.8, 1.0, 0.7, 0.55, 0.45, 0, 2.5);

  function startSweep(pl: BurrowPlan): void {
    phase('sweep', LEAD + pl.strokeT.reduce((a, b) => a + b, 0));
    an.strokeK = -1;
  }

  /** out of the sand: it does what it was asked to (by day it keeps low, its coat on: Shears 1988) */
  function leaveSand(): void {
    const q = queued;
    queued = null;
    st.phase = 'out';
    st.buryGoal = 0;
    if (q) q(); else setMode('REST', 'sit', rand(5, 12));
    // (by day it came out with its coat on: it stays low, and the sand comes off it only slowly)
    keepCoat = !shedding && st.sandCoat > 0.05;
    if (!st.night && st.mode === 'HOVER') st.altGoal = Math.min(st.altGoal, 0.6 * ML);
  }

  function updateBurrow(dt: number): void {
    forward(fwd);
    right.set(-fwd.z, 0, fwd.x);
    // (along its axis throughout: no jet to the sides)
    an.funnelYawGoal = 0;
    if (st.phase !== 'buried') an.funnelSideGoal = 0;
    switch (st.phase) {
      case 'descend':
        if (descend(dt)) phase('settle', rand(1.0, 2.5));
        return;
      case 'settle':
        // landed, it pauses: the arms laid forward under the head (Boletzky 1970), folded down in front of it, the tips
        // curled in on the sand, the head a little down (40)
        holdStill(dt);
        st.buryGoal = 0;
        finSet(0.1, 1.6, -0.55, 0);
        arms(1.0, 0.25, 0.0, 0.04);
        an.tipCurl = damp(an.tipCurl, 0.7, 2, dt);
        an.headPitch = -0.08;
        an.funnelPitch = damp(an.funnelPitch, -0.15, 3, dt);
        burrowDress();
        if (st.t > st.dur) { st.plan = makePlan(); st.stroke = null; an.jetsDone = 0; phase('blow', st.plan.blow); }
        return;
      case 'blow': {
        const pl = st.plan ?? (st.plan = makePlan());
        while (an.jetsDone < pl.jets.length && st.t >= pl.jetT[an.jetsDone]) fireJet(pl, an.jetsDone++);
        const j = an.jetsDone - 1, since = j >= 0 ? st.t - pl.jetT[j] : 9;
        // the funnel into the sand for a backward jet (the water runs back under the belly), along it for a forward one
        // (the rig's funnel cannot bend back: the sand and the kick show the jet's way)
        an.funnelPitch = damp(an.funnelPitch, since < 0.35 ? (pl.jets[j] === 'B' ? -0.6 : -0.25) : -0.35, 14, dt);
        st.buryGoal = blowBury(pl, st.t);
        // the fins laid against the mantle; a mild beat against J1's push only, before there is a hollow (Boletzky)
        if (j === 0 && since < 0.4) finSet(0.2, 4.0, -0.55, 0.04, -1);
        else finSet(0.02, 1.0, -0.95, 0);
        // the arms pressed down and folded under the front of the head, a brace against the backward jets (Anderson
        // 2002), not fanned up off the sand; the head bent belly-down as it dips in (Boletzky), the crown on the sand (40–42)
        arms(1.15, 0.3, 0.0, 0.02);
        an.tipCurl = damp(an.tipCurl, 0.75, 3, dt);
        an.headPitch = -0.14;
        holdStill(dt);
        burrowDress();
        if (st.t > pl.blow) { if (pl.gap > 0) phase('gap', pl.gap); else startSweep(pl); }
        return;
      }
      case 'gap':
        // (held as the jets left it: sunk, the arms folded under the head)
        st.buryGoal = BLOW_BURY;
        an.funnelPitch = damp(an.funnelPitch, -0.35, 14, dt);
        finSet(0.02, 1.0, -0.95, 0);
        arms(1.15, 0.3, 0.0, 0.02);
        an.tipCurl = damp(an.tipCurl, 0.75, 3, dt);
        an.headPitch = -0.14;
        holdStill(dt);
        burrowDress();
        if (st.t > st.dur) startSweep(st.plan ?? (st.plan = makePlan()));
        return;
      case 'sweep': {
        const pl = st.plan ?? (st.plan = makePlan());
        holdStill(dt);
        finSet(0, 1, -1.0, 0);
        an.funnelPitch = damp(an.funnelPitch, -0.2, 4, dt);
        // only arm II strokes; the other pairs stay sunk in front of the head, bracing (on sand: Anderson 2002, Boletzky),
        // folded down so that arms I do not stand up between the eyes (16, Fig. 1E)
        arms(1.3, 0.35, 0.0, 0.02);
        an.tipCurl = damp(an.tipCurl, 0.6, 2, dt);
        an.headPitch = -0.3;
        burrowDress();
        an.strokeW = Math.min(1, an.strokeW + dt / LEAD);
        const s = st.t - LEAD;
        if (s < 0) { copyKey(UP, an.key); st.buryGoal = BLOW_BURY; }
        else {
          let k = 0, t0 = 0;
          while (k < pl.strokes - 1 && s >= t0 + pl.strokeT[k]) t0 += pl.strokeT[k++];
          const u = Math.min(1, (s - t0) / pl.strokeT[k]), dir = STROKE_DIRS[k % 4];
          const u0 = k === an.strokeK ? an.strokeU : 0;
          if (k !== an.strokeK || !st.stroke) st.stroke = { k, u, dir };
          else st.stroke.u = u;
          an.strokeK = k; an.strokeU = u;
          strokeKey(dir, u, an.key);
          // the tips scoop (the fan of tracks round the head: Boletzky), then grains trickle off them as they come back
          if (u0 < SCOOP_U && u >= SCOOP_U) tipFx.scoop = true;
          if (u0 < THROW_U && u >= THROW_U) tipFx.throw = true;
          if (POUR_U.some((x) => u0 < x && u >= x)) tipFx.pour = true;
          // the coat grows as the grains land, on the head from the forward strokes, on the back from the others
          // (× 8 / n: as much in the end however many strokes)
          const dep = (x: number) => smooth((x - DEPOSIT[0]) / (DEPOSIT[1] - DEPOSIT[0]));
          const g = (dep(u) - dep(u0)) * (8 / pl.strokes), head = headStroke(dir);
          st.headCover = Math.min(1, st.headCover + g * (head ? 0.16 : 0.05));
          st.sandCoat = Math.min(1, st.sandCoat + g * (head ? 0.05 : 0.15));
          st.buryGoal = BLOW_BURY + ((1 - BLOW_BURY) * (k + u)) / pl.strokes;
        }
        if (st.t >= st.dur) {
          toBuried(burrowFor);
          if (canBurrow()) fx.push({ kind: 'pit', pos: st.pos.clone(), heading: st.heading, halfW: 0, halfL: 0, strength: 0, fill: 2.5 });
        }
        return;
      }
      case 'emerge': {
        // it comes out very slowly, the coat on (Shears 1988); (the ramp runs on while it sheds: right out of the sand)
        st.buryGoal = emergeFrom * (1 - smooth(st.t / st.dur));
        holdStill(dt);
        arms(0.5, 0.05, 0.25, 0.1);
        an.tipCurl = damp(an.tipCurl, 0.6, 2, dt);
        an.headPitch = 0.05;
        finSet(0.15, 2.0, -0.45, 0.05);
        an.funnelPitch = damp(an.funnelPitch, -0.15, 3, dt);
        chroma(0.7, 0.95, 0.25, 0.45, 0.75, 0, 1.5);
        an.coverHold = 1;
        if (st.night) {
          // at night it drops the coat on the bottom, then waits a moment before it moves off
          if (!shedding && st.bury < 0.08) { shedCoat(false); jet(0.07, 0.25); pauseT = st.t; pauseFor = rand(0.3, 0.6); }
          if (shedding) { st.sandCoat = damp(st.sandCoat, 0, 20, dt); st.headCover = damp(st.headCover, 0, 20, dt); if (st.t > pauseT + pauseFor) leaveSand(); }
        } else if (st.t >= st.dur && st.bury < 0.08) leaveSand();
        return;
      }
      case 'buried':
      default: {
        st.buryGoal = 1;
        holdStill(dt);
        // it breathes by the funnel alone, laid to one side (S. parva: Drerup 2019); the mantle is still (Boletzky)
        an.funnelSideGoal = st.plan?.buriedSide ?? (pers.wave > 3.14 ? 1 : -1);
        an.funnelPitch = damp(an.funnelPitch, 0.08 * Math.sin(an.breathPh), 3, dt);
        finSet(0.0, 1, -1.0, 0);
        arms(1.45, 0.4, 0.0, 0.04);
        an.tipCurl = damp(an.tipCurl, 0.5, 2, dt);
        // (the head bent down: the crown and the arms' bases under the sand, the eyes still out: 16)
        an.headPitch = -0.2;
        chroma(0.7, 0.95, 0.35, 0.45, 0.2, 0, 0.6);
        // the coat made up as the last grains settle: ≥ 0.85 on the head and 0.9 on the back by 1.5 s
        const c = smooth(st.t / 1.5);
        st.headCover = Math.max(st.headCover, coatFrom.hc + (Math.max(coatFrom.hc, 0.85) - coatFrom.hc) * c);
        st.sandCoat = Math.max(st.sandCoat, coatFrom.sc + (Math.max(coatFrom.sc, 0.9) - coatFrom.sc) * c);
        if (st.t > st.dur) {
          st.settled = true;
          if (autonomous) choose();
          else { st.t = 0; st.dur = rand(20, 60); }
        }
      }
    }
  }

  /** how far the tentacles reach from the arm crown (m) */
const reach = () => TENTACLE.length * 0.9 * MM * K;

  function updateHunt(dt: number): void {
    const p = prey;
    if (!p) { st.settled = true; if (autonomous) choose(); else setMode('HOVER', 'hang', 3); return; }
    const head = toWorld(new Vector3(0, 0, CROWN_Z), new Vector3());
    const toP = _w.subVectors(p.pos, head);
    const dist = toP.length();
    an.eyeLook = p.pos;
    const ambush = st.phase === 'ambush' || st.phase === 'astrike' || st.phase === 'aeat';
    switch (st.phase) {
      case 'search':
        finSet(0.32, 2.5, 0.18, 0.1);
        arms(0.4, 0.2, 0, 0.6);
        chroma(0.9, 0.45, 0.14, 0.35, 0.85, 0.45, 1.5);
        st.vel.multiplyScalar(Math.exp(-dt * 2));
        st.turn = damp(st.turn, 0.6 * Math.sin(st.t * 1.3), 2, dt);
        st.heading = wrap(st.heading + st.turn * dt);
        an.eyeLook = st.t > st.dur * 0.5 ? p.pos : null;
        if (st.t > st.dur) phase('orient', 1.2);
        break;
      case 'orient': {
        const err = steerTo(p.pos, 1.6, dt);
        finSet(0.3, 2.8, 0.2, 0.05);
        arms(0.2, 0.42, 0, 0.15);
        an.headPitch = clamp(Math.atan2(-(toP.y), Math.hypot(toP.x, toP.z)) * 0.5, -0.25, 0.25) * -1;
        st.altGoal = clamp(p.pos.y - ground(p.pos.x, p.pos.z) - 0.2 * ML, 0.25 * ML, 1.5 * ML);
        // attention: paler, the chromatophores flickering over the back
        chroma(0.85, 0.4 + 0.3 * Math.max(0, Math.sin(st.t * 7)), 0.2, 0.6, 0.95, 0.45, 4);
        if (err < 0.12 && st.t > 0.5) phase('approach', 9);
        break;
      }
      case 'approach': {
        steerTo(p.pos, 1.2, dt);
        forward(fwd);
        const gap = dist - reach() * 0.5;
        const sp = clamp(gap / ML * 1.2, 0.25, 1.1) * ML;
        st.vel.x = damp(st.vel.x, fwd.x * sp, 3, dt);
        st.vel.z = damp(st.vel.z, fwd.z * sp, 3, dt);
        st.altGoal = clamp(p.pos.y - ground(p.pos.x, p.pos.z) - 0.25 * ML, 0.2 * ML, 1.5 * ML);
        finSet(0.26, 3.2, 0.2, 0.04);
        arms(0.15, 0.48, 0, 0.08);
        an.armRaise[0] = an.armRaise[1] = 0.12;
        chroma(0.85, 0.4, 0.18, 0.5, 1.0, 0.48, 3);
        // the prey notices a fast approach now and then
        if (dist < reach() * 0.85) phase('strike', 0.11);
        else if (st.t > st.dur) { prey = null; phase('search', 0.5); }
        break;
      }
      case 'strike':
      case 'astrike': {
        // the tentacles shoot out at the prey (≈ 0.1 s), the arms open, a small lunge
        aimTentacles(p.pos);
        an.tenGoal = clamp(dist / (TENTACLE.length * MM * K), 0.4, 1);
        an.ten[0] = an.ten[1] = Math.min(an.tenGoal, an.ten[0] + dt / 0.07);
        arms(0.1, -0.1, 0.35, 0);
        an.armRaise[0] = an.armRaise[1] = 0.25;
        forward(fwd);
        if (!ambush) st.vel.addScaledVector(fwd, 2.0 * ML * dt / 0.11);
        chroma(0.6, 0.8, 0.5, 0.3, 0.7, 0.1, 15);
        if (ambush) { st.buryGoal = 0.6; if (st.t < dt * 1.5) sand(st.pos.clone().setY(ground(st.pos.x, st.pos.z) + 0.003 * K), new Vector3(0, 0.04 * K, 0).addScaledVector(fwd, 0.03 * K), 14, 0.008, 0.005, 2, 0.45); }
        if (st.t > st.dur) {
          if (rng() < 0.8 && dist < reach() * 1.3) { p.state = 'caught'; phase(ambush ? 'aeat' : 'capture', 0.35); }
          else { p.dart(head); phase('miss', 0.4); }
        }
        break;
      }
      case 'miss':
        an.ten[0] = an.ten[1] = Math.max(0, an.ten[0] - dt / 0.3);
        arms(0.3, 0.3, 0, 0.3);
        st.vel.multiplyScalar(Math.exp(-dt * 4));
        if (ambushing) { st.buryGoal = 1; st.altGoal = 0; }
        // the mysid flicked away: one more try if it is still in sight
        if (st.t > st.dur) {
          if (ambushing) backToSand(rand(20, 50));
          else if (st.pulses < 1 && dist < 6 * ML) { st.pulses = 1; phase('orient', 1.2); }
          else { prey = null; st.settled = true; if (autonomous) choose(); else setMode('HOVER', 'hang', rand(2, 5)); }
        }
        break;
      case 'capture':
      case 'aeat':
        // drawn in: the club brings the prey to the arms, which close round it
        an.ten[0] = an.ten[1] = Math.max(0.08, an.ten[0] - dt / 0.3);
        aimTentacles(p.pos);
        p.pos.lerp(toWorld(new Vector3(0, -0.6, CROWN_Z + 2.5 + 12 * an.ten[0]), _v), 0.6);
        arms(0.25, 0.25 + 0.3 * (1 - an.ten[0]), 0, 0.1);
        st.vel.multiplyScalar(Math.exp(-dt * 5));
        if (st.t > st.dur) phase(st.phase === 'aeat' ? 'aeating' : 'eat', rand(3, 6));
        break;
      case 'eat':
      case 'aeating':
        // the arms wrapped round the prey; the beak works (small pulses), the prey disappears
        an.ten[0] = an.ten[1] = 0;
        p.pos.copy(toWorld(new Vector3(0, -0.6, CROWN_Z + 3.2), _v));
        p.remains = Math.max(0, 1 - st.t / st.dur);
        arms(0.45, 0.62 + 0.06 * Math.sin(st.t * 9), 0, 0.05);
        if (st.phase === 'eat') { finSet(0.28, 2.4, 0.15, 0.05); st.altGoal = Math.max(st.altGoal * 0.995, 0.3 * ML); chroma(0.7, 0.9, 0.5, 0.45, 0.75, 0.1, 1.5); }
        else { st.buryGoal = damp(st.buryGoal, 0.95, 0.8, dt); chroma(0.7, 0.95, 0.35, 0.45, 0.2, 0, 1); }
        if (st.t > st.dur) {
          p.state = 'eaten';
          prey = null;
          st.settled = true;
          if (st.phase === 'aeating') backToSand(rand(20, 60));
          else if (autonomous) choose(); else setMode('HOVER', 'hang', rand(3, 8));
        }
        break;
      case 'ambush': {
        // buried, eyes on the passing mysid; it strikes when it comes within reach
        st.buryGoal = 1;
        finSet(0, 1, -1.0, 0);
        arms(1.45, 0.4, 0.0, 0.04);
        chroma(0.7, 0.95, 0.35, 0.45, 0.2, 0, 1);
        // the mysid drifts by
        if (p.state === 'drift') {
          forward(fwd);
          const aim = _v.copy(st.pos).addScaledVector(fwd, (CROWN_Z + 9) * MM * K);
          const want = Math.atan2(aim.x - p.pos.x, aim.z - p.pos.z);
          p.heading = p.heading + wrap(want - p.heading) * Math.min(1, dt * 1.5);
        }
        if (dist < reach() * 0.85 && Math.abs(wrap(Math.atan2(toP.x, toP.z) - st.heading)) < 0.9) phase('astrike', 0.1);
        else if (st.t > st.dur) backToSand(rand(20, 50));
        break;
      }
    }
    if (ambush) { st.vel.multiplyScalar(Math.exp(-dt * 8)); st.altGoal = 0; }
  }

  function aimTentacles(target: Vector3): void {
    // the target in the animal's frame
    _e.set(-(st.pitch + st.pitchKick), st.heading, st.roll);
    _q.setFromEuler(_e).invert();
    const l = _v.copy(target).sub(st.pos).applyQuaternion(_q);
    l.z -= CROWN_Z * MM * K;
    l.y += 0.0008 * K;
    if (l.z < 1e-4) l.z = 1e-4;
    an.tenAim.copy(l).normalize();
    an.tenAimW = 1;
  }

  function updateEscape(dt: number): void {
    forward(fwd);
    // the arms point at the danger and the mantle leads away: face against the way it flees
    const face = Math.atan2(-escDir.x, -escDir.z);
    st.turn = 0;
    st.heading = wrap(st.heading + clamp(wrap(face - st.heading), -7 * dt, 7 * dt));
    switch (st.phase) {
      case 'startle':
        finSet(0.0, 1, -1.15, 0);
        arms(0.0, 0.25, 0, 0);
        chroma(0.9, 1.05, 1.15, 0.2, 0.3, 0, 30);
        an.mantle = damp(an.mantle, 1.09, 20, dt);
        if (st.t > st.dur) { phase('jet', 0.62); st.pulses = 0; ink(); chroma(0.25, 0.15, 0.05, 0.1, 0.5, 0.8, 12); }
        break;
      case 'jet': {
        // three pulses, each weaker; the jet aimed at the danger drives it mantle first, away and up
        const per = 0.2;
        const k = Math.floor(st.t / per);
        if (k >= st.pulses && k < 3) {
          st.pulses = k + 1;
          jet(0.2 - 0.03 * k, 0.19);
          const imp = [15, 10, 6.5][k] * ML * pers.bold;
          st.vel.addScaledVector(escDir, imp);
          st.altGoal = Math.min(st.altGoal + 0.9 * ML, 3 * ML);
          st.altVel += 1.5 * ML;
        }
        finSet(0.0, 1, -1.1, 0);
        arms(-0.05, 0.3, 0, 0);
        st.vel.multiplyScalar(Math.exp(-dt * 2.4));
        if (st.t > st.dur) phase('glide', rand(0.7, 1.2));
        break;
      }
      case 'glide':
        st.vel.multiplyScalar(Math.exp(-dt * 2.8));
        finSet(0.55, 3.6, 0.15, 0.3, -1);
        arms(0.2, 0.2, 0, 0.3);
        st.altGoal = Math.max(0.5 * ML, st.altGoal * Math.exp(-dt));
        if (st.t > st.dur) phase('land', 3);
        break;
      case 'land':
      default:
        chroma(0.7, 0.9, 0.5, 0.5, 0.65, 0.05, 2);
        if (descend(dt) || st.t > st.dur) {
          st.fear = 0.5;
          st.settled = true;
          // usually it buries straight away where it lands
          if (canBurrow() && rng() < 0.75) { setMode('BURROW', 'settle', rand(1.0, 2.5)); burrowFor = rand(40, 120); }
          else setMode('REST', 'freeze', rand(4, 8));
        }
    }
  }

  // ------------------------------------------------------------------ autonomous choice (viewer, tests)

  function choose(): void {
    const near = Math.hypot(st.pos.x - home.x, st.pos.z - home.z);
    const back = near > range ? { x: home.x + rand(-0.3, 0.3) * range, z: home.z + rand(-0.3, 0.3) * range } : null;
    const u = rng();
    if (st.mode === 'BURROW' && st.bury > 0.5 && u < 0.3) { api.hunt(); return; }
    if (u < 0.2) api.rest(rand(5, 12));
    else if (u < 0.4) api.hover(rand(5, 10));
    else if (u < 0.6) api.swim(back);
    else if (u < 0.68) api.crawl(null);
    else if (u < 0.86) api.hunt();
    else api.burrow(rand(15, 40));
  }

  // ------------------------------------------------------------------ the step

  function update(dt: number): Pose {
    st.t += dt;
    st.clock += dt;
    an.chRate = Math.max(1, an.chRate * Math.exp(-dt * 3));
    // (the hunt's slight raise of arms I and II)
    an.armRaise[0] = damp(an.armRaise[0], 0, 6, dt);
    an.armRaise[1] = damp(an.armRaise[1], 0, 6, dt);
    // arm II's burying stroke: in only while it strokes, otherwise it blends back (whatever cut the burial short)
    if (!(st.mode === 'BURROW' && st.phase === 'sweep')) an.strokeW = damp(an.strokeW, 0, 6, dt);
    if (!(st.mode === 'BURROW' && st.phase === 'emerge') && !keepCoat) an.coverHold = damp(an.coverHold, 0, 2, dt);
    an.sync = damp(an.sync, st.mode === 'BURROW' ? 1 : 0, st.mode === 'BURROW' ? 6 : 1, dt);
    // a jet's kick: a quick tip, a slower return
    an.kickRise *= Math.exp(-KICK_RISE * dt);
    an.kickFall *= Math.exp(-KICK_FALL * dt);
    st.pitchKick = an.kickFall - an.kickRise;
    // the grains of a backward jet settling onto the back
    for (let i = coatRamps.length - 1; i >= 0; i--) {
      const r = coatRamps[i], p = smooth((st.clock - r.t0) / r.dur);
      st.sandCoat = Math.min(1, st.sandCoat + (p - r.done) * r.sc);
      r.done = p;
      if (p >= 1) coatRamps.splice(i, 1);
    }
    if (st.mode !== 'HUNT') { an.eyeLook = null; an.ten[0] = an.ten[1] = damp(an.ten[0], 0, 8, dt); }
    // the funnel's aim: a little down at rest, more as it hovers and swims, forward in the escape (the jet drives it
    // mantle first); at rest it swings aside now and then (the opening seen sideways under the eye: 20, 29)
    if (st.mode !== 'BURROW') {
      const pg = st.mode === 'REST' ? -0.15 : st.mode === 'HOVER' ? -0.25 : st.mode === 'SWIM' ? -0.35 : st.mode === 'HUNT' ? -0.2 : st.mode === 'ESCAPE' ? -0.05 : -0.1;
      an.funnelPitch = damp(an.funnelPitch, pg, 3, dt);
      if (st.mode === 'REST') {
        // resting and ventilating it swings the funnel far to one side or the other, its mouth up on the flank under
        // the back of the eye (20, 29), and now and then forward under the head (26)
        an.funnelT -= dt;
        if (an.funnelT <= 0) {
          const r = rng();
          an.funnelSideGoal = r < 0.3 ? 0 : an.funnelSideGoal !== 0 && r < 0.79 ? -Math.sign(an.funnelSideGoal) : rng() < 0.5 ? 1 : -1;
          an.funnelT = an.funnelSideGoal === 0 ? rand(4, 10) : rand(8, 25);
        }
        an.funnelYawGoal = 0;
      } else {
        an.funnelSideGoal = 0;
        if (st.mode === 'HOVER' || st.mode === 'SWIM') an.funnelYawGoal = clamp(-0.8 * st.turn + (st.mode === 'HOVER' ? 0.12 * Math.sin(st.t * 0.7) : 0), -0.6, 0.6);
        else an.funnelYawGoal = 0;
      }
      if (Math.abs(an.funnelSide) > 0.1) an.funnelPitch = damp(an.funnelPitch, -0.2, 3, dt);
    }
    // (BURROW sets its own funnel, head and arm tips per phase: nothing here pulls them elsewhere)
    an.funnelSide = damp(an.funnelSide, an.funnelSideGoal, st.mode === 'ESCAPE' ? 12 : st.mode === 'REST' ? 1.6 : 3, dt);
    an.funnelYaw = damp(an.funnelYaw, clamp(an.funnelYawGoal, -0.6, 0.6), st.mode === 'BURROW' ? 14 : 1.2, dt);
    if (st.mode !== 'HOVER' && st.mode !== 'SWIM' && st.mode !== 'HUNT' && st.mode !== 'BURROW') an.headPitch = damp(an.headPitch, 0.05, 2, dt);
    an.crawl = st.mode === 'CRAWL' ? an.crawl : 0;
    if (st.mode !== 'BURROW') an.tipCurl = damp(an.tipCurl, st.mode === 'REST' ? an.tipCurl : st.mode === 'HOVER' || st.mode === 'HUNT' ? 0.25 : 0.15, 2, dt);
    switch (st.mode) {
      case 'REST': updateRest(dt); break;
      case 'HOVER': updateHover(dt); break;
      case 'SWIM': updateSwim(dt); break;
      case 'CRAWL': updateCrawl(dt); break;
      case 'BURROW': updateBurrow(dt); break;
      case 'HUNT': updateHunt(dt); break;
      case 'ESCAPE': updateEscape(dt); break;
    }
    // a threat close by: escape (autonomous only: in the game the brain sends the intent)
    const th = world.threat?.();
    if (autonomous && th && st.mode !== 'ESCAPE') {
      const d = th.pos.distanceTo(st.pos);
      if (d < 6 * ML * pers.bold) api.escape(th.pos);
    }
    integrate(dt);
    if (prey) prey.update(dt, ground, world.waterY(prey.pos.x, prey.pos.z));
    writePose(dt);
    armTipFx();
    return P;
  }

  const _tip = new Vector3(), _tipW = new Vector3();
  /** the sand of arm II's stroke, at its tips as posed (FK: the mesh's tips) */
  function armTipFx(): void {
    if (!tipFx.scoop && !tipFx.throw && !tipFx.pour) return;
    forward(fwd);
    for (const i of ARM_II) {
      toWorld(armTip(P, i, _tip), _tipW);
      const g = ground(_tipW.x, _tipW.z);
      // (a low puff where the tip digs in: the fan of tracks round the head)
      if (tipFx.scoop) sand(_tipW.clone().setY(Math.max(_tipW.y, g + 0.0003 * K)), new Vector3(0, 0.005 * K, 0), 3, 0.0015, 0.0025, 1.0, 0.35);
      // single grains: thrown up off the tips as they rise over the head (Fig. 1E), then trickling down onto it and the
      // back (they vanish into it, or into the sand)
      if (tipFx.throw) {
        const medial = _w.set(-ARMS[i].side, 0, 0).applyQuaternion(_q).setY(0).normalize();
        sand(_tipW, medial.multiplyScalar(0.01 * K).addScaledVector(fwd, -0.008 * K).setY(0.015 * K), 3, 0.0012, 0.0015, 1.0, 0.5, 1.1, true);
      }
      if (tipFx.pour) sand(_tipW, new Vector3(0, -0.012 * K, 0), 6, 0.0015, 0.0014, 0.9, 0.7, 1.1, true);
    }
    tipFx.scoop = tipFx.throw = tipFx.pour = false;
  }

  function integrate(dt: number): void {
    // horizontal
    st.pos.x += st.vel.x * dt;
    st.pos.z += st.vel.z * dt;
    const b = world.bounds?.();
    if (b) {
      const m = 1.2 * ML;
      if (st.pos.x < b.minX + m) { st.pos.x = b.minX + m; st.vel.x = Math.abs(st.vel.x) * 0.2; }
      if (st.pos.x > b.maxX - m) { st.pos.x = b.maxX - m; st.vel.x = -Math.abs(st.vel.x) * 0.2; }
      if (st.pos.z < b.minZ + m) { st.pos.z = b.minZ + m; st.vel.z = Math.abs(st.vel.z) * 0.2; }
      if (st.pos.z > b.maxZ - m) { st.pos.z = b.maxZ - m; st.vel.z = -Math.abs(st.vel.z) * 0.2; }
    }
    // vertical: a damped spring on the belly's height; never above the water (keeping the body under it)
    const g = ground(st.pos.x, st.pos.z);
    const water = world.waterY(st.pos.x, st.pos.z);
    const ceiling = Math.max(0, water - g - (TOP + BELLY + 2) * MM * K);
    const goal = Math.min(st.altGoal, ceiling);
    const acc = (goal - st.alt) * 18 - st.altVel * 7;
    st.altVel += acc * dt;
    st.alt += st.altVel * dt;
    if (st.alt < 0) { st.alt = 0; st.altVel = Math.max(0, st.altVel); }
    if (st.alt > ceiling) { st.alt = ceiling; st.altVel = Math.min(0, st.altVel); }
    const burrowing = st.mode === 'BURROW';
    // (each jet a visible step down: 90 % in 0.46 s)
    st.bury = damp(st.bury, st.buryGoal, st.buryGoal < st.bury ? 6 : burrowing && st.phase === 'blow' ? 5 : 1.4, dt);
    // the sand on the skin comes off slowly, faster when it swims (not while it rises out of the sand with it)
    if (keepCoat && (burrowing || st.sandCoat < 0.01)) keepCoat = false;
    if (st.bury < 0.3 && !(burrowing && st.phase === 'emerge')) {
      const sp = Math.hypot(st.vel.x, st.vel.z) / ML;
      // (off the bottom the coat soon washes off: hovering animals carry no sand, 17, 24, 34, 62; one that came out by
      // day with its coat keeps it as long as it stays within a mantle length of the bottom: keepCoat)
      const k = dt * (st.alt > (keepCoat ? 1.0 : 0.15) * ML ? 0.35 : 0.02 + 0.06 * sp);
      st.sandCoat = Math.max(0, st.sandCoat - k);
      st.headCover = Math.max(0, st.headCover - k * 2.5);
    }
    const sit = SIT_Y + (BURIED_Y - SIT_Y) * st.bury;
    st.pos.y = g + st.alt + sit * MM * K;
    // attitude: on the bottom it follows the slope; in the water as the mode wants; banked in turns
    const e = 0.6 * ML;
    forward(fwd);
    right.set(-fwd.z, 0, fwd.x);
    const slopeF = (ground(st.pos.x + fwd.x * e, st.pos.z + fwd.z * e) - ground(st.pos.x - fwd.x * e, st.pos.z - fwd.z * e)) / (2 * e);
    const slopeR = (ground(st.pos.x + right.x * e, st.pos.z + right.z * e) - ground(st.pos.x - right.x * e, st.pos.z - right.z * e)) / (2 * e);
    const lifted = smooth(st.alt / (0.5 * ML));
    // (the head comes up as the body goes in: low and level as the jets start, each jet's tip shown by its kick)
    let pitchGoal = Math.atan(slopeF) * (1 - lifted) + 0.04 * (1 - lifted) + smooth(st.bury) * BURIED_PITCH;
    if (st.mode === 'HOVER' || (st.mode === 'HUNT' && st.phase !== 'ambush')) pitchGoal = -0.12 * lifted + pitchGoal * (1 - lifted);
    if (st.mode === 'ESCAPE' && st.phase === 'jet') pitchGoal = 0.12;
    st.pitch = damp(st.pitch, pitchGoal, 4, dt);
    const rollGoal = -Math.atan(slopeR) * (1 - lifted) - st.turn * 0.18 * lifted;
    st.roll = damp(st.roll, rollGoal, 4, dt);
  }

  function writePose(dt: number): Pose {
    // ---- mantle: ventilation, and the jet's contraction and refill
    an.breathPh += dt * 2 * Math.PI * (st.mode === 'ESCAPE' ? 2.4 : st.bury > 0.8 ? 0.9 : 1.4);
    // (buried, ambushing too, it breathes by the funnel: the mantle all but still, Boletzky)
    let m = 1 + (0.022 - 0.0205 * smooth((st.bury - 0.7) / 0.2)) * Math.sin(an.breathPh);
    if (an.jetT >= 0) {
      an.jetT += dt;
      const u = an.jetT / an.jetDur;
      if (u >= 1) an.jetT = -1;
      else m = u < 0.32 ? 1 + 0.04 - (an.jetDepth + 0.04) * smooth(u / 0.32) : 1 - an.jetDepth + (an.jetDepth + 0.03) * smooth((u - 0.32) / 0.68);
    }
    if (st.mode === 'ESCAPE' && st.phase === 'startle') m = Math.max(m, an.mantle);
    an.mantle = m;
    P.mantle = m;
    // ---- fins: the travelling wave and the flap
    an.finAmp = damp(an.finAmp, an.finAmpGoal, 5, dt);
    an.finFold = damp(an.finFold, an.finFoldGoal, st.mode === 'ESCAPE' ? 14 : 4, dt);
    an.flap = damp(an.flap, an.flapGoal, 4, dt);
    for (let i = 0; i < 2; i++) {
      // in turns the outer fin works harder
      const sideK = 1 + (i === 0 ? 1 : -1) * clamp(-st.turn * 0.4, -0.5, 0.5);
      an.finPh[i] += dt * 2 * Math.PI * an.finFreq * an.finDir;
      P.finAmp[i] = an.finAmp * sideK;
      P.finPh[i] = an.finPh[i];
      P.finFold[i] = an.finFold + an.flap * Math.sin(an.finPh[i] - 0.6);
    }
    P.finK = an.finK;
    // ---- head (before the arms: arm II's stroke is aimed in the head's frame); burying, the head is held square (it
    // turns straight as it settles, then is kept so: the pair of arms in exact mirror sync)
    const t = st.t + pers.wave;
    P.headPitch = damp(P.headPitch, an.headPitch, 4, dt);
    const squaring = st.mode === 'BURROW' && (st.phase === 'settle' || st.phase === 'descend');
    P.headYaw = st.mode !== 'BURROW' ? damp(P.headYaw, an.eyeLook ? 0 : 0.06 * Math.sin(t * 0.3), 2, dt) : squaring ? damp(P.headYaw, 0, 6, dt) : 0;
    // ---- arms
    // arm II's stroke: its key from the level frame (x its own side out, y up, z the heading) into the head's
    const sw = smooth(an.strokeW), K2 = an.key;
    if (sw > 0) _qa.setFromEuler(_e.set(-(st.pitch + st.pitchKick), 0, st.roll)).multiply(_qh.setFromAxisAngle(_ax, -P.headPitch)).multiply(_qh2.setFromAxisAngle(_ay, P.headYaw)).invert();
    ARMS.forEach((a, i) => {
      const ca = Math.cos(a.angle), sa = Math.sin(a.angle);
      const left = a.side > 0 ? 0 : 1;
      // arms I and II rise a little as it closes on a mysid
      const raise = a.pair <= 1 ? an.armRaise[left] * (a.pair === 0 ? 1 : 0.85) : 0;
      const stroke = a.pair === 1 && sw > 0;
      // (burying, arm IIR takes IIL's own small motions, mirrored: the pair moves in exact sync)
      const twin = a.pair === 1 && a.side < 0 ? an.sync : 0, iL = ARM_II[0];
      // the ventral arms walk when it crawls
      const cph = (an.crawlPh + (a.side > 0 ? 0 : 0.5) + a.pair * 0.12) % 1;
      const reachK = an.crawl * (a.pair >= 2 ? 1 : 0.3) * (cph < 0.45 ? Math.sin((cph / 0.45) * Math.PI) : -0.5 * Math.sin(((cph - 0.45) / 0.55) * Math.PI));
      for (let k = 0; k < ARM_BONES; k++) {
        const j = i * ARM_BONES + k, w = ARM_W[k];
        const wave = (n: number) => Math.sin(t * (1.1 + 0.13 * n) + k * 0.7 + n * 1.9);
        const wav = an.armWave * 0.35 * (twin > 0 ? wave(i) + (wave(iL) - wave(i)) * twin : wave(i)) * (0.4 + k * 0.25);
        const own = (n: number) => 0.7 + 0.6 * ((n * 0.37 + pers.wave) % 1);
        const keep = 1 - raise;
        let curl = (an.armDroop * ca * w * 2.2 + an.armClose * w * 2.2 - an.armSpread * w * 2 + wav * 0.6) * keep;
        let swing = (an.armDroop * sa * w * 2.2 + wav * 0.4 * a.side) * keep;
        // raised: the arm reaches up and back over the head, its tip curling down onto it
        curl += -raise * (k === 0 ? 0.75 : k < 3 ? 0.8 : 0.45);
        swing += -raise * 0.12 * a.side;
        curl += -reachK * 0.25 * ca;
        // the tips curl in (each arm a little differently): resting arms lie in loose coils on the sand
        curl += an.tipCurl * keep * (k >= 2 ? 0.28 * (k - 1) : 0) * (own(i) + (own(iL) - own(i)) * twin);
        // the burying stroke takes arm II over (L and R mirrored: in exact sync)
        if (stroke) { curl += (K2.curl[k] - curl) * sw; swing += (K2.swing[k] * a.side - swing) * sw; }
        P.armCurl[j] = curl;
        P.armSwing[j] = swing;
      }
      if (stroke) {
        const ce = Math.cos(K2.elev);
        P.armAim[i].set(Math.sin(K2.psi) * ce * a.side, Math.sin(K2.elev), Math.cos(K2.psi) * ce).applyQuaternion(_qa);
        P.armBend[i].set(K2.bend.x * a.side, K2.bend.y, K2.bend.z).applyQuaternion(_qa);
        P.armAimW[i] = sw;
        P.armExt[i] = 1 + (K2.ext - 1) * sw;
      } else { P.armAimW[i] = 0; P.armExt[i] = 1; }
    });
    // ---- tentacles
    if (st.mode !== 'HUNT') an.tenAimW = damp(an.tenAimW, 0, 4, dt);
    for (let i = 0; i < 2; i++) {
      const T = P.ten[i];
      T.ext = an.ten[i];
      T.aim.copy(an.tenAim);
      T.aimW = an.tenAimW;
      T.curl = 0.06 * Math.sin(t * 2 + i) * (1 - T.ext);
    }
    // ---- funnel
    P.funnelPitch = an.funnelPitch;
    P.funnelYaw = an.funnelYaw;
    P.funnelSide = an.funnelSide;
    // ---- eyes: on the prey or the threat, else wandering saccades round the resting gaze
    an.eyeT -= dt;
    if (an.eyeT <= 0) {
      an.eyeT = rand(0.6, 2.5);
      // (small saccades: the lids' opening is low)
      for (const o of an.eyeOff) o.set(rand(-0.12, 0.12), rand(-0.04, 0.05), rand(-0.12, 0.12));
    }
    const th = world.threat?.();
    const look = an.eyeLook ?? (th && (st.mode === 'ESCAPE' || st.fear > 0.2 || (st.mode === 'REST' && st.phase === 'freeze')) ? th.pos : null);
    // (into the head's frame: the body's turn, then the head's own on the neck)
    _e.set(-(st.pitch + st.pitchKick), st.heading, st.roll);
    _q.setFromEuler(_e).multiply(_qh.setFromAxisAngle(_ax, -P.headPitch)).multiply(_qh2.setFromAxisAngle(_ay, P.headYaw)).invert();
    for (let i = 0; i < 2; i++) {
      const g = P.eyes[i];
      if (look) {
        const eyeW = toWorld(new Vector3(i === 0 ? EYE.x : -EYE.x, EYE.y, EYE.z - Z_ROOT), _v);
        g.copy(look).sub(eyeW).applyQuaternion(_q).normalize();
      } else g.copy(REST_GAZE[i]).add(an.eyeOff[i]).normalize();
    }
    // buried, the pupils turn up (Boletzky 1970): the gaze may rise further than the lids' low opening otherwise allows
    const up = st.mode === 'BURROW' || (st.mode === 'HUNT' && st.phase === 'ambush') ? smooth((st.bury - 0.8) / 0.2) : 0;
    an.eyeUp = damp(an.eyeUp, up, 2, dt);
    P.gazeUp = 0.1 + 0.3 * an.eyeUp;
    if (!look) for (const g of P.eyes) { g.y += 0.32 * an.eyeUp; g.normalize(); }
    // the pupil: a thin slit by day (a bar when it watches, nearly shut buried), a broad oval at night
    P.pupil = damp(P.pupil, st.night ? (st.mode === 'HUNT' ? 0.95 : 0.85) : st.bury > 0.6 ? 0.06 : st.mode === 'HUNT' ? 0.3 : 0.15, 1.5, dt);
    // the lids: half open resting by day and buried, opening as it hovers and hunts, wide open at night and in alarm (fast)
    // (buried, it watches with the lids half open: 16)
    const lidGoal = st.mode === 'ESCAPE' || st.fear > 0.2 ? 1 : st.night ? 0.85 : st.mode === 'HUNT' ? 0.75 : st.mode === 'HOVER' || st.mode === 'SWIM' ? 0.55 : st.bury > 0.6 ? 0.5 : 0.45;
    P.lid = damp(P.lid, lidGoal, lidGoal > P.lid + 0.3 ? 8 : 2.5, dt);
    // ---- burial, sand
    P.bury = st.bury;
    P.sandCoat = st.sandCoat;
    // (the head's share shows as it lies in the sand; held while it rises out with the coat on)
    const hs = Math.max(smooth((st.bury - 0.2) / 0.5), an.coverHold);
    P.headCover = st.headCover * hs + st.headCover * 0.25 * (1 - hs);
    // ---- chromatophores
    const c = an.ch, cg = an.chGoal, r = an.chRate;
    c.y = damp(c.y, cg.y, r, dt); c.r = damp(c.r, cg.r, r, dt); c.b = damp(c.b, cg.b, r, dt);
    c.mottle = damp(c.mottle, cg.mottle, r * 0.5, dt); c.irid = damp(c.irid, cg.irid, r * 0.5, dt); c.pale = damp(c.pale, cg.pale, r * 0.6, dt);
    Object.assign(P.chroma, c);
    // ---- root
    _e.set(-(st.pitch + st.pitchKick), st.heading, st.roll);
    P.quat.setFromEuler(_e);
    P.pos.copy(st.pos);
    P.lift = st.alt;
    st.fear = Math.max(0, st.fear - dt * 0.05);
    return P;
  }

  return api;
}

export type SquidApi = ReturnType<typeof createSquidBehavior>;
