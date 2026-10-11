import { Euler, Quaternion, Vector3 } from 'three';
import { ARMS, ARM_BONES, ML_MM, TENTACLE, Z_ROOT, CROWN, EYE, FUNNEL, funnelSection } from './anatomy';
import { emptyPose, funnelPitchOf, funnelSwingQ, type Pose } from './rig';
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
 *  BURROW  the signature: it settles, blows a pit under itself with strong jets of the funnel aimed down (sand flies
 *          out from under the mantle's rim), rocks and sinks into it, then sweeps sand over its back and head with
 *          the first and second arm pairs — they reach up and back over the head and throw (4–6 sweeps) — until
 *          only the eyes and the top of the head show. The sand sticks to its mucus and stays on it for a while after
 *          it leaves the sand with a jet.
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
const REST_GAZE = [new Vector3(EYE.gaze[0], EYE.gaze[1], EYE.gaze[2]).normalize(), new Vector3(-EYE.gaze[0], EYE.gaze[1], EYE.gaze[2]).normalize()];

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
  sweeps: number;
  pulses: number;
  settled: boolean;
  night: boolean;
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
    target: null, sweeps: 0, pulses: 0, settled: true, night: false,
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
    ch: { y: 0.7, r: 0.95, b: 0.25, mottle: 0.45, irid: 0.75, pale: 0 },
    chGoal: { y: 0.7, r: 0.95, b: 0.25, mottle: 0.45, irid: 0.75, pale: 0 },
    chRate: 2, flash: 0,
  };

  let prey: Mysid | null = null;
  let threatFrom: Vector3 | null = null;
  const fx: FxEvent[] = [];
  const P = emptyPose();
  const fwd = new Vector3(), right = new Vector3(), _v = new Vector3(), _w = new Vector3(), _q = new Quaternion(), _e = new Euler(0, 0, 0, 'YXZ');
  const _qh = new Quaternion(), _qh2 = new Quaternion(), _ax = new Vector3(1, 0, 0), _ay = new Vector3(0, 1, 0);

  const ground = (x: number, z: number) => world.ground(x, z);
  const canBurrow = () => world.canBurrow?.() !== false;
  const forward = (out: Vector3) => out.set(Math.sin(st.heading), 0, Math.cos(st.heading));

  /** a point in the animal's frame (mm, model) → world */
  function toWorld(local: Vector3, out: Vector3): Vector3 {
    _e.set(-st.pitch, st.heading, st.roll);
    _q.setFromEuler(_e);
    return out.copy(local).multiplyScalar(MM * K).applyQuaternion(_q).add(st.pos);
  }

  function sand(at: Vector3, vel: Vector3, count: number, spread: number, size: number, life: number, alpha = 0.45): void {
    if (!canBurrow()) return;
    fx.push({ kind: 'sand', pos: at.clone(), vel: vel.clone(), count, spread: spread * K, size: size * K, life, alpha });
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
    _e.set(-st.pitch, st.heading, st.roll);
    const v = dir.applyQuaternion(_q.setFromEuler(_e)).multiplyScalar(0.04 * K).add(new Vector3(0, 0.01 * K, 0));
    fx.push({ kind: 'ink', pos: at, vel: v, count: 14, spread: 0.004 * K, size: 0.007 * K, life: 4.5, alpha: 0.75 });
    fx.push({ kind: 'ink', pos: at.clone().addScaledVector(v, 0.15), vel: v.clone().multiplyScalar(0.5), count: 8, spread: 0.003 * K, size: 0.01 * K, life: 6, alpha: 0.55 });
  }

  function setMode(mode: Mode, phase: string, dur: number): void {
    const was = st.mode;
    st.mode = mode; st.phase = phase; st.t = 0; st.dur = dur; st.settled = false;
    if (was === 'BURROW' && mode !== 'BURROW' && st.bury > 0.3) emerge();
    if (mode !== 'HUNT' && prey && prey.state !== 'caught') prey = null;
  }
  function phase(p: string, dur: number): void { st.phase = p; st.t = 0; st.dur = dur; }

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
      setMode('REST', st.alt > 0.3 * ML ? 'descend' : 'sit', seconds);
    },
    /** hang over the sand on the fins */
    hover(seconds = rand(5, 14)) {
      setMode('HOVER', 'rise', seconds);
      st.altGoal = rand(0.45, 1.1) * ML;
    },
    /** swim to a point (or a short way) arms first on the fins */
    swim(target: { x: number; z: number } | null) {
      const t = target ? new Vector3(target.x, 0, target.z) : (() => { forward(_v); return st.pos.clone().addScaledVector(_v, rand(6, 14) * ML).add(new Vector3(rand(-1, 1) * 4 * ML, 0, rand(-1, 1) * 4 * ML)); })();
      st.target = limit(t);
      setMode('SWIM', st.alt < 0.3 * ML ? 'takeoff' : 'travel', 30);
    },
    /** a short shuffle on the bottom */
    crawl(target: { x: number; z: number } | null) {
      const t = target ? new Vector3(target.x, 0, target.z) : st.pos.clone().add(forward(_v).multiplyScalar(rand(1.5, 3) * ML));
      st.target = limit(t);
      setMode('CRAWL', st.alt > 0.3 * ML ? 'descend' : 'turn', 20);
    },
    /** dig in and cover itself (stays buried for `seconds`) */
    burrow(seconds = rand(30, 120)) {
      if (!canBurrow()) { api.rest(seconds); return; }
      if (st.mode === 'BURROW' && (st.phase === 'buried' || st.phase === 'sweep' || st.phase === 'blow' || st.phase === 'sink')) { st.dur = Math.max(st.dur, seconds); return; }
      setMode('BURROW', st.alt > 0.3 * ML ? 'descend' : 'settle', 0.7);
      burrowFor = seconds;
    },
    /** hunt a mysid (from the sand when buried: an ambush) */
    hunt() {
      const ambush = st.mode === 'BURROW' && st.bury > 0.6;
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
      setMode('ESCAPE', 'startle', buried ? 0.12 : 0.09);
      if (buried) { st.buryGoal = 0; sand(st.pos.clone().setY(ground(st.pos.x, st.pos.z) + 0.003 * K), new Vector3(0, 0.08 * K, 0).addScaledVector(away, 0.05 * K), 30, 0.014, 0.007, 3, 0.6); }
      an.chRate = 25;
      an.flash = 1;
    },
    /** press down and keep still, darkened (eyes on the threat) */
    freeze(seconds = 4) {
      if (st.mode === 'BURROW' && st.bury > 0.5) { st.dur = Math.max(st.dur, seconds); return; }
      setMode('REST', st.alt > 0.3 * ML ? 'descend' : 'freeze', seconds);
    },
    /** the bottom's brightness under it (0 light … 1 dark), and whether it is night */
    setSurroundings(bg: number, night: boolean) { st.bg = clamp(bg, 0, 1); st.night = night; },
    update,
  };

  let burrowFor = 60;
  /** this hunt began from the sand */
  let ambushing = false;
  const escDir = new Vector3();

  function limit(t: Vector3): Vector3 {
    const b = world.bounds?.();
    if (b) { const m = 2 * ML; t.x = clamp(t.x, b.minX + m, b.maxX - m); t.z = clamp(t.z, b.minZ + m, b.maxZ - m); }
    return t;
  }

  function spawnPrey(ambush: boolean): void {
    forward(fwd);
    right.set(fwd.z, 0, -fwd.x);
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

  function updateBurrow(dt: number): void {
    const g = ground(st.pos.x, st.pos.z);
    forward(fwd);
    right.set(fwd.z, 0, -fwd.x);
    switch (st.phase) {
      case 'descend':
        if (descend(dt)) phase('settle', 0.6);
        return;
      case 'settle':
        st.altGoal = 0;
        st.vel.multiplyScalar(Math.exp(-dt * 5));
        finSet(0.15, 2, -0.4, 0);
        arms(0.65, 0.1, 0.1, 0.2);
        chroma(0.75, 0.95, 0.55, 0.5, 0.6, 0, 2);
        if (st.t > st.dur) { phase('blow', rand(2.4, 3.6)); st.pulses = 0; }
        return;
      case 'blow': {
        // jets aimed down and forward blow the sand out from under the mantle: it sinks into the pit
        an.funnelPitch = damp(an.funnelPitch, -0.45, 6, dt);
        finSet(0.55, 5.5, -0.55, 0.2);
        arms(0.75, 0.0, 0.2, 0.3);
        const every = 0.38;
        if (Math.floor(st.t / every) > st.pulses) {
          st.pulses++;
          jet(0.12, 0.3);
          // the funnel swings to one side and the other with each jet (aimed down): the sand flies out on that side
          const side = st.pulses % 2 ? 1 : -1;
          an.funnelYawGoal = 0.5 * side;
          const s = -side;
          {
            const at = st.pos.clone().addScaledVector(right, s * 0.008 * K).addScaledVector(fwd, -0.002 * K).setY(g + 0.002 * K);
            sand(at, right.clone().multiplyScalar(s * 0.045 * K).addScaledVector(fwd, -0.02 * K).setY(0.03 * K), 11, 0.004, 0.0045, 2.2, 0.5);
          }
          sand(st.pos.clone().addScaledVector(fwd, 0.012 * K).setY(g + 0.002 * K), fwd.clone().multiplyScalar(0.05 * K).setY(0.025 * K), 6, 0.004, 0.004, 1.8, 0.45);
        }
        st.buryGoal = 0.55 * smooth(st.t / st.dur);
        st.roll = 0.06 * Math.sin(st.t * 9);
        if (st.t > st.dur) { phase('sweep', rand(3.2, 4.4)); st.sweeps = 0; }
        return;
      }
      case 'sweep': {
        // the first and second arm pairs reach up and back over the head and throw sand onto it (L, R, both …)
        an.funnelPitch = damp(an.funnelPitch, -0.2, 4, dt);
        finSet(0.3, 4, -0.8, 0.1);
        arms(0.9, 0.2, 0.05, 0.15);
        const n = 5;
        const per = st.dur / n;
        const k = Math.floor(st.t / per), u = (st.t % per) / per;
        const lr = k % 3 === 2 ? 2 : k % 2;   // left, right, both
        const lift = u < 0.55 ? smooth(u / 0.55) : 1 - smooth((u - 0.55) / 0.2);
        an.armRaise[0] = lr === 0 || lr === 2 ? lift : 0;
        an.armRaise[1] = lr === 1 || lr === 2 ? lift : 0;
        if (k > st.sweeps - 1 && u > 0.6 && k < n) {
          st.sweeps = k + 1;
          st.headCover = Math.min(1, st.headCover + 0.24);
          st.sandCoat = Math.min(1, st.sandCoat + 0.2);
          // the throw: grains fly up off the arm tips and rain onto the head and the back
          for (const s of lr === 2 ? [-1, 1] : [lr === 0 ? 1 : -1]) {
            const tip = st.pos.clone().addScaledVector(fwd, 0.012 * K).addScaledVector(right, -s * 0.004 * K).setY(g + 0.006 * K);
            sand(tip, fwd.clone().multiplyScalar(-0.035 * K).setY(0.05 * K), 9, 0.003, 0.0035, 1.6, 0.5);
          }
        }
        st.buryGoal = 0.55 + 0.4 * smooth(st.t / st.dur);
        st.roll = 0.03 * Math.sin(st.t * 6);
        if (st.t > st.dur) {
          an.armRaise[0] = an.armRaise[1] = 0;
          phase('buried', burrowFor);
          st.buryGoal = 1;
          st.headCover = Math.max(st.headCover, 0.85);
          st.sandCoat = Math.max(st.sandCoat, 0.9);
        }
        return;
      }
      case 'buried':
      default:
        st.buryGoal = 1;
        st.roll = damp(st.roll, 0, 3, dt);
        an.funnelPitch = damp(an.funnelPitch, 0, 2, dt);
        finSet(0.0, 1, -1.0, 0);
        arms(1.45, 0.4, 0.0, 0.04);
        chroma(0.7, 0.95, 0.35, 0.45, 0.5, 0, 0.6);
        if (st.t > st.dur) {
          st.settled = true;
          if (autonomous) choose();
          else { st.t = 0; st.dur = rand(20, 60); }
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
          if (ambushing) { prey = null; st.mode = 'BURROW'; st.phase = 'buried'; st.t = 0; st.dur = rand(20, 50); st.buryGoal = 1; st.settled = true; }
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
        else { st.buryGoal = damp(st.buryGoal, 0.95, 0.8, dt); chroma(0.7, 0.95, 0.35, 0.45, 0.5, 0, 1); }
        if (st.t > st.dur) {
          p.state = 'eaten';
          prey = null;
          st.settled = true;
          if (st.phase === 'aeating') { st.mode = 'BURROW'; st.phase = 'buried'; st.t = 0; st.dur = rand(20, 60); st.buryGoal = 1; }
          else if (autonomous) choose(); else setMode('HOVER', 'hang', rand(3, 8));
        }
        break;
      case 'ambush': {
        // buried, eyes on the passing mysid; it strikes when it comes within reach
        st.buryGoal = 1;
        finSet(0, 1, -1.0, 0);
        arms(1.45, 0.4, 0.0, 0.04);
        chroma(0.7, 0.95, 0.35, 0.45, 0.5, 0, 1);
        // the mysid drifts by
        if (p.state === 'drift') {
          forward(fwd);
          const aim = _v.copy(st.pos).addScaledVector(fwd, (CROWN_Z + 9) * MM * K);
          const want = Math.atan2(aim.x - p.pos.x, aim.z - p.pos.z);
          p.heading = p.heading + wrap(want - p.heading) * Math.min(1, dt * 1.5);
        }
        if (dist < reach() * 0.85 && Math.abs(wrap(Math.atan2(toP.x, toP.z) - st.heading)) < 0.9) phase('astrike', 0.1);
        else if (st.t > st.dur) { prey = null; st.mode = 'BURROW'; st.phase = 'buried'; st.t = 0; st.dur = rand(20, 50); st.settled = true; }
        break;
      }
    }
    if (ambush) { st.vel.multiplyScalar(Math.exp(-dt * 8)); st.altGoal = 0; }
  }

  function aimTentacles(target: Vector3): void {
    // the target in the animal's frame
    _e.set(-st.pitch, st.heading, st.roll);
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
          if (canBurrow() && rng() < 0.75) { setMode('BURROW', 'settle', 0.4); burrowFor = rand(40, 120); }
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
    an.chRate = Math.max(1, an.chRate * Math.exp(-dt * 3));
    an.armRaise[0] = damp(an.armRaise[0], 0, st.mode === 'BURROW' && st.phase === 'sweep' ? 0 : 6, dt);
    an.armRaise[1] = damp(an.armRaise[1], 0, st.mode === 'BURROW' && st.phase === 'sweep' ? 0 : 6, dt);
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
    } else {
      an.funnelSideGoal = 0;
      if (st.phase !== 'blow') { an.funnelYawGoal = 0; an.funnelPitch = damp(an.funnelPitch, -0.1, 2, dt); }
    }
    an.funnelSide = damp(an.funnelSide, an.funnelSideGoal, st.mode === 'ESCAPE' ? 12 : st.mode === 'REST' ? 1.6 : 3, dt);
    an.funnelYaw = damp(an.funnelYaw, clamp(an.funnelYawGoal, -0.6, 0.6), st.mode === 'BURROW' ? 14 : 1.2, dt);
    if (st.mode !== 'HOVER' && st.mode !== 'SWIM' && st.mode !== 'HUNT') an.headPitch = damp(an.headPitch, 0.05, 2, dt);
    an.crawl = st.mode === 'CRAWL' ? an.crawl : 0;
    an.tipCurl = damp(an.tipCurl, st.mode === 'REST' ? an.tipCurl : st.mode === 'HOVER' || st.mode === 'HUNT' ? 0.25 : st.mode === 'BURROW' ? 0.5 : 0.15, 2, dt);
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
    return writePose(dt);
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
    st.bury = damp(st.bury, st.buryGoal, st.buryGoal < st.bury ? 6 : 1.4, dt);
    // the sand on the skin comes off slowly, faster when it swims
    if (st.bury < 0.3) {
      const sp = Math.hypot(st.vel.x, st.vel.z) / ML;
      const k = dt * (0.02 + 0.06 * sp);
      st.sandCoat = Math.max(0, st.sandCoat - k);
      st.headCover = Math.max(0, st.headCover - k * 2.5);
    }
    const sit = SIT_Y + (BURIED_Y - SIT_Y) * st.bury;
    st.pos.y = g + st.alt + sit * MM * K;
    // attitude: on the bottom it follows the slope; in the water as the mode wants; banked in turns
    const e = 0.6 * ML;
    forward(fwd);
    right.set(fwd.z, 0, -fwd.x);
    const slopeF = (ground(st.pos.x + fwd.x * e, st.pos.z + fwd.z * e) - ground(st.pos.x - fwd.x * e, st.pos.z - fwd.z * e)) / (2 * e);
    const slopeR = (ground(st.pos.x + right.x * e, st.pos.z + right.z * e) - ground(st.pos.x - right.x * e, st.pos.z - right.z * e)) / (2 * e);
    const lifted = smooth(st.alt / (0.5 * ML));
    let pitchGoal = Math.atan(slopeF) * (1 - lifted) + 0.04 * (1 - lifted) + smooth(st.bury) * BURIED_PITCH;
    if (st.mode === 'HOVER' || (st.mode === 'HUNT' && st.phase !== 'ambush')) pitchGoal = -0.12 * lifted + pitchGoal * (1 - lifted);
    if (st.mode === 'ESCAPE' && st.phase === 'jet') pitchGoal = 0.12;
    st.pitch = damp(st.pitch, pitchGoal, 4, dt);
    const rollGoal = -Math.atan(slopeR) * (1 - lifted) - st.turn * 0.18 * lifted;
    if (!(st.mode === 'BURROW' && (st.phase === 'blow' || st.phase === 'sweep'))) st.roll = damp(st.roll, rollGoal, 4, dt);
  }

  function writePose(dt: number): Pose {
    // ---- mantle: ventilation, and the jet's contraction and refill
    an.breathPh += dt * 2 * Math.PI * (st.mode === 'ESCAPE' ? 2.4 : st.bury > 0.8 ? 0.9 : 1.4);
    let m = 1 + (st.bury > 0.8 ? 0.012 : 0.022) * Math.sin(an.breathPh);
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
    // ---- arms
    const t = st.t + pers.wave;
    ARMS.forEach((a, i) => {
      const ca = Math.cos(a.angle), sa = Math.sin(a.angle);
      const left = a.side > 0 ? 0 : 1;
      // arms I and II sweep up and back over the head when it buries
      const raise = a.pair <= 1 ? an.armRaise[left] * (a.pair === 0 ? 1 : 0.85) : 0;
      // the ventral arms walk when it crawls
      const cph = (an.crawlPh + (a.side > 0 ? 0 : 0.5) + a.pair * 0.12) % 1;
      const reachK = an.crawl * (a.pair >= 2 ? 1 : 0.3) * (cph < 0.45 ? Math.sin((cph / 0.45) * Math.PI) : -0.5 * Math.sin(((cph - 0.45) / 0.55) * Math.PI));
      for (let k = 0; k < ARM_BONES; k++) {
        const j = i * ARM_BONES + k, w = ARM_W[k];
        const wav = an.armWave * 0.35 * Math.sin(t * (1.1 + 0.13 * i) + k * 0.7 + i * 1.9) * (0.4 + k * 0.25);
        const keep = 1 - raise;
        let curl = (an.armDroop * ca * w * 2.2 + an.armClose * w * 2.2 - an.armSpread * w * 2 + wav * 0.6) * keep;
        let swing = (an.armDroop * sa * w * 2.2 + wav * 0.4 * a.side) * keep;
        // raised: the arm reaches up and back over the head, its tip curling down onto it
        curl += -raise * (k === 0 ? 0.75 : k < 3 ? 0.8 : 0.45);
        swing += -raise * 0.12 * a.side;
        curl += -reachK * 0.25 * ca;
        // the tips curl in (each arm a little differently): resting arms lie in loose coils on the sand
        curl += an.tipCurl * keep * (k >= 2 ? 0.28 * (k - 1) : 0) * (0.7 + 0.6 * ((i * 0.37 + pers.wave) % 1));
        P.armCurl[j] = curl;
        P.armSwing[j] = swing;
      }
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
    // ---- head, funnel
    P.headPitch = damp(P.headPitch, an.headPitch, 4, dt);
    P.headYaw = damp(P.headYaw, an.eyeLook ? 0 : 0.06 * Math.sin(t * 0.3), 2, dt);
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
    _e.set(-st.pitch, st.heading, st.roll);
    _q.setFromEuler(_e).multiply(_qh.setFromAxisAngle(_ax, -P.headPitch)).multiply(_qh2.setFromAxisAngle(_ay, P.headYaw)).invert();
    for (let i = 0; i < 2; i++) {
      const g = P.eyes[i];
      if (look) {
        const eyeW = toWorld(new Vector3(i === 0 ? EYE.x : -EYE.x, EYE.y, EYE.z - Z_ROOT), _v);
        g.copy(look).sub(eyeW).applyQuaternion(_q).normalize();
      } else g.copy(REST_GAZE[i]).add(an.eyeOff[i]).normalize();
    }
    // the pupil: a thin slit by day (a bar when it watches, nearly shut buried), a broad oval at night
    P.pupil = damp(P.pupil, st.night ? (st.mode === 'HUNT' ? 0.95 : 0.85) : st.bury > 0.6 ? 0.06 : st.mode === 'HUNT' ? 0.3 : 0.15, 1.5, dt);
    // the lids: half open resting by day and buried, opening as it hovers and hunts, wide open at night and in alarm (fast)
    // (buried, it watches with the lids half open: 16)
    const lidGoal = st.mode === 'ESCAPE' || st.fear > 0.2 ? 1 : st.night ? 0.85 : st.mode === 'HUNT' ? 0.75 : st.mode === 'HOVER' || st.mode === 'SWIM' ? 0.55 : st.bury > 0.6 ? 0.5 : 0.45;
    P.lid = damp(P.lid, lidGoal, lidGoal > P.lid + 0.3 ? 8 : 2.5, dt);
    // ---- burial, sand
    P.bury = st.bury;
    P.sandCoat = st.sandCoat;
    P.headCover = st.headCover * smooth((st.bury - 0.2) / 0.5) + st.headCover * 0.25 * (1 - smooth((st.bury - 0.2) / 0.5));
    // ---- chromatophores
    const c = an.ch, cg = an.chGoal, r = an.chRate;
    c.y = damp(c.y, cg.y, r, dt); c.r = damp(c.r, cg.r, r, dt); c.b = damp(c.b, cg.b, r, dt);
    c.mottle = damp(c.mottle, cg.mottle, r * 0.5, dt); c.irid = damp(c.irid, cg.irid, r * 0.5, dt); c.pale = damp(c.pale, cg.pale, r * 0.6, dt);
    Object.assign(P.chroma, c);
    // ---- root
    _e.set(-st.pitch, st.heading, st.roll);
    P.quat.setFromEuler(_e);
    P.pos.copy(st.pos);
    P.lift = st.alt;
    st.fear = Math.max(0, st.fear - dt * 0.05);
    return P;
  }

  return api;
}

export type SquidApi = ReturnType<typeof createSquidBehavior>;
