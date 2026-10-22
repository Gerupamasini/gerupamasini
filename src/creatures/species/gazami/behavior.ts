import { Vector3 } from 'three';
import type { LegId } from './anatomy';
import type { LegRig, RigDef } from './geometry';
import {
  CHELA_DEFEND, CHELA_FOLDED, CHELA_MOUTH, CHELA_PICK, CHELA_READY, CHELA_SWIM, DACTYL_ANGLE, LEG_SWIM, PADDLE_CARRY, PADDLE_REST, blendLeg,
  isWalking, neutralFoot,
} from './poses';
import { bindLeg, copyLeg, emptyPose, legKey, planarOf, solveLeg, type LegPose, type PlanarLeg, type Pose } from './rig';

/**
 * The ガザミ's behaviour: what it is doing and how its body, legs, claws and paddles move, without any rendering (the
 * driver, the viewer and the unit tests use it alike). Seven modes:
 *  - IDLE    resting low on the sand, the chelipeds folded in front (19, 55), the eyes up and looking about, the
 *            antennules flicking, the paddles laid flat; now and then a leg shifts its footing
 *  - WALK    sideways, leading with one side: three legs of the six walking legs swing while the other three stand
 *            (alternating: L2 R3 L4 against R2 L3 R4), the feet planted where they land, the leading legs reaching and
 *            pulling, the trailing ones pushing; the paddles held up behind (66), the chelipeds ready in front
 *  - FORAGE  short, slow moves over the sand, the chelipeds picking at it in turn and carrying to the mouth, the third
 *            maxillipeds working, the walking legs' dactyli probing; a puff of sediment at each pick
 *  - BURROW  a shallow burial backwards into the sand (13): the body tips up at the front, the paddles and the walking
 *            legs shovel sand out to the sides, it sinks until only the eyes and the front of the carapace show, the
 *            sand settling over its back; it bursts out again with a shower of sand
 *  - DEFEND  the threat display: it turns to face the danger, rises on its legs, raises and spreads the chelipeds with
 *            the fingers gaping (12, 47, 53, 58), sways, snaps and lunges
 *  - ESCAPE  a fast sideways run away from the danger; then, where the water is deep enough, it swims off, or digs in
 *  - SWIM    off the bottom on the paddles: the fifth legs scull in a figure of eight (the blade feathered on each
 *            stroke) a few times a second, the body travelling sideways, the walking legs folded up against it and the
 *            chelipeds tucked in front — never the walking gait in the water
 * The brain's intents choose the mode (GazamiDriver.setIntent); everything is in body-lengths (carapace widths, CW),
 * so a 3 cm juvenile and a 20 cm adult move alike, faster in proportion.
 */

export const MODES = ['IDLE', 'WALK', 'FORAGE', 'BURROW', 'DEFEND', 'ESCAPE', 'SWIM'] as const;
export type Mode = (typeof MODES)[number];

export interface CrabWorld {
  ground(x: number, z: number): number;
  waterY(x: number, z: number): number;
  /** the danger it watches (the observer, once noticed) */
  threat?(): { pos: Vector3 } | null;
  bounds?(): { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  canBurrow?(): boolean;
}

/** what it does to the sand and the water: puffs of sediment, the pit it digs (imprint, grown as it sinks) */
export interface CrabFx {
  kind: 'sand' | 'imprint' | 'grow';
  pos: Vector3;
  vel: Vector3;
  count: number;
  spread: number;
  size: number;
  life: number;
  alpha: number;
  heading?: number;
  strength?: number;
}

export interface CrabState {
  mode: Mode;
  phase: string;
  /** seconds in the mode and in the phase, the mode's planned length */
  t: number;
  pt: number;
  dur: number;
  /** the ground point under the body (y: the ground, plus the swimming height), the heading, the velocity (m/s) */
  pos: Vector3;
  heading: number;
  vel: Vector3;
  /** height of the swimming body over the bottom (m) */
  alt: number;
  /** buried (0 … 1), and where the burial is going; sand clinging to the shell */
  bury: number;
  buryGoal: number;
  sandCoat: number;
  /** where it is going (x, z), and from what it flees or which it faces */
  target: { x: number; z: number } | null;
  threat: Vector3 | null;
  /** +1 leading with its left side, −1 with its right */
  lead: number;
  /** the gait's phase (0 … 1) and the paddles' stroke phase (rad) */
  gait: number;
  stroke: number;
  /** body height over the sand (mm at CW 100), pitch and roll (rad) */
  lift: number;
  pitch: number;
  roll: number;
}

interface FootState {
  leg: LegRig;
  PL: PlanarLeg;
  /** where the foot stands (world), where a step started and is going, how far through it (1: planted) */
  planted: Vector3;
  from: Vector3;
  to: Vector3;
  u: number;
  /** the gait group (0 or 1) */
  group: number;
  /** how far (mm at CW 100) the leg fell short of its foot last frame: a stretched leg must step */
  miss: number;
}

export interface CrabOptions {
  world: CrabWorld;
  rng: () => number;
  rig: RigDef;
  /** the crab's carapace width (m) */
  scale: number;
  start: { x: number; z: number; heading: number };
  home?: { x: number; z: number };
  /** how far it ranges on its own (m) */
  range?: number;
  /** pick its own actions when idle (the viewer's crabs); the game's brain drives it otherwise */
  autonomous?: boolean;
  startBuried?: boolean;
}

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a: number) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
/** move a toward b by a share that makes a rate of `k` per second frame-rate independent */
const ease = (a: number, b: number, dt: number, k: number) => a + (b - a) * (1 - Math.exp(-k * dt));

/** the body's depth (mm at CW 100: sternum to the top of the dome) and the height that keeps it clear of the sand when swimming */
const BODY_DEPTH = 24.5;

export type CrabApi = ReturnType<typeof createCrabBehavior>;

export function createCrabBehavior(o: CrabOptions) {
  const W = o.world, rng = o.rng, rig = o.rig;
  const CW = o.scale;
  /** model mm → world m */
  const MM = (CW / 0.1) * 0.001;
  const home = o.home ?? { x: o.start.x, z: o.start.z };
  const range = o.range ?? CW * 30;
  const P: Pose = emptyPose();
  const fx: CrabFx[] = [];
  const st: CrabState = {
    mode: 'IDLE', phase: 'rest', t: 0, pt: 0, dur: 8,
    pos: new Vector3(o.start.x, W.ground(o.start.x, o.start.z), o.start.z), heading: o.start.heading, vel: new Vector3(), alt: 0,
    bury: 0, buryGoal: 0, sandCoat: 0, target: null, threat: null, lead: 1, gait: 0, stroke: 0, lift: 4.5, pitch: 0, roll: 0,
  };
  let settled = true;
  let speedGoal = 0;
  /** the legs' poses blended towards each frame's goals */
  const goal: Record<string, LegPose> = {};
  for (const leg of rig.legs) goal[legKey(leg.id, leg.side)] = bindLeg(leg.id);
  const feet: FootState[] = rig.legs.filter((l) => isWalking(l.id)).map((leg) => ({
    leg, PL: planarOf(leg), planted: new Vector3(), from: new Vector3(), to: new Vector3(), u: 1,
    // alternating: L2 R3 L4 against R2 L3 R4
    group: ((leg.id === 'P3' ? 1 : 0) + (leg.side === 'L' ? 0 : 1)) % 2, miss: 0,
  }));
  // per-crab quirks: how it holds itself, how quick it is (never two alike)
  const quirk = { spread: 0.95 + 0.12 * rng(), lift: 0.9 + 0.2 * rng(), pace: 0.9 + 0.2 * rng(), flick: 0.7 + 0.6 * rng() };
  let flickT = 0, shuffleT = 4 + 6 * rng(), snapT = 0, lungeT = 0, pickT = 0, pickSide = 0, puffT = 0, breathT = 2;
  // the eyes: each holds a gaze, then jumps to the next; ducks into the orbit at a sudden danger; now and then wiped
  const eyeHold = [0.3, 0.9], eyeGoal = [0, 0], eyeTilt = [0, 0], eyeWipe = [0, 0];
  let duckT = 0, hadThreat = false;
  const tmp = new Vector3(), tmp2 = new Vector3(), tmp3 = new Vector3();

  // ------------------------------------------------------------ frames

  /** the body's frame: world point → body mm (the pose's root, heading, lift, pitch, roll) */
  function worldToBody(p: Vector3, out: Vector3): Vector3 {
    const ch = Math.cos(st.heading), sh = Math.sin(st.heading);
    const dx = (p.x - st.pos.x) / MM, dy = (p.y - st.pos.y) / MM - st.lift, dz = (p.z - st.pos.z) / MM;
    // undo the heading (root's rotation about y by heading)
    let x = dx * ch - dz * sh, y = dy, z = dx * sh + dz * ch;
    // undo the roll (about z), then the pitch (about x: the body is turned by −pitch)
    const cr = Math.cos(-st.roll), sr = Math.sin(-st.roll);
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
    x = x1; y = y1;
    const cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    const y2 = y * cp - z * sp, z2 = y * sp + z * cp;
    return out.set(x, y2, z2);
  }
  /** body mm → world (the inverse of worldToBody) */
  function bodyToWorld(b: Vector3, out: Vector3): Vector3 {
    const cp = Math.cos(-st.pitch), sp = Math.sin(-st.pitch);
    let x = b.x, y = b.y * cp - b.z * sp, z = b.y * sp + b.z * cp;
    const cr = Math.cos(st.roll), sr = Math.sin(st.roll);
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
    x = x1; y = y1 + st.lift;
    const ch = Math.cos(st.heading), sh = Math.sin(st.heading);
    return out.set(st.pos.x + (x * ch + z * sh) * MM, st.pos.y + y * MM, st.pos.z + (-x * sh + z * ch) * MM);
  }
  /** the crab's left (+x) in the world, for a heading */
  const leftOf = (h: number, out: Vector3) => out.set(Math.cos(h), 0, -Math.sin(h));
  const fwdOf = (h: number, out: Vector3) => out.set(Math.sin(h), 0, Math.cos(h));

  const depthAt = (x: number, z: number) => W.waterY(x, z) - W.ground(x, z);
  /** water deep enough to swim in: room for the body over the bottom and under the surface */
  const canSwim = (x: number, z: number) => depthAt(x, z) > CW * 0.75;

  function enter(mode: Mode, phase: string, dur: number): void {
    // (startled into a display or a run: the eyes duck into their orbits first)
    if ((mode === 'DEFEND' || mode === 'ESCAPE') && st.mode !== mode) duckT = Math.max(duckT, 0.25 + 0.15 * rng());
    st.mode = mode; st.phase = phase; st.t = 0; st.pt = 0; st.dur = dur;
    settled = false;
  }
  function phase(p: string): void { st.phase = p; st.pt = 0; }

  /** turn to travel along (dx, dz) sideways: the side that needs the smaller turn leads */
  function sidewaysHeading(dx: number, dz: number): number {
    const hL = Math.atan2(-dz, dx), hR = Math.atan2(dz, -dx);
    const useL = Math.abs(wrap(hL - st.heading)) <= Math.abs(wrap(hR - st.heading));
    st.lead = useL ? 1 : -1;
    return useL ? hL : hR;
  }

  function plantAll(): void {
    for (const f of feet) {
      neutralFoot(f.leg, st.lift, quirk.spread, tmp);
      bodyToWorld(tmp, f.planted);
      f.planted.y = W.ground(f.planted.x, f.planted.z);
      f.from.copy(f.planted); f.to.copy(f.planted); f.u = 1;
    }
  }

  // ------------------------------------------------------------ commands

  const api = {
    state: st,
    pose: P,
    fx,
    get settled() { return settled; },
    get pos() { return st.pos; },

    idle(secs = 10): void {
      if (st.mode === 'BURROW' && st.bury > 0.4) { emerge(); }
      enter('IDLE', 'rest', secs);
      st.target = null; speedGoal = 0;
    },

    walk(target: { x: number; z: number }, run = false): void {
      if (st.bury > 0.4) emerge();
      enter('WALK', run ? 'run' : 'walk', 30);
      st.target = clampTarget(target);
      speedGoal = (run ? 5.5 : 1.3) * quirk.pace;
    },

    forage(secs = 10): void {
      if (st.bury > 0.4) emerge();
      enter('FORAGE', 'look', secs);
      st.target = null; speedGoal = 0;
      pickT = 0;
    },

    burrow(secs = 40): void {
      if (W.canBurrow && !W.canBurrow()) { api.idle(secs); return; }
      if (st.mode === 'BURROW' && st.bury > 0.5) { st.dur = Math.max(st.dur, st.t + secs); return; }
      enter('BURROW', 'settle', secs);
      st.target = null; speedGoal = 0;
    },

    defend(from: Vector3 | null, secs = 4): void {
      if (st.bury > 0.4) emerge();
      enter('DEFEND', 'rise', secs);
      st.threat = from ? from.clone() : st.threat;
      speedGoal = 0;
      snapT = 0.8 + rng();
    },

    escape(from: Vector3 | null, to: { x: number; z: number } | null = null): void {
      const wasBuried = st.bury > 0.4;
      enter('ESCAPE', wasBuried ? 'burst' : 'run', 6);
      st.threat = from ? from.clone() : st.threat;
      let dx: number, dz: number;
      if (to) { dx = to.x - st.pos.x; dz = to.z - st.pos.z; } else if (st.threat) { dx = st.pos.x - st.threat.x; dz = st.pos.z - st.threat.z; } else { const a = rng() * TAU; dx = Math.cos(a); dz = Math.sin(a); }
      const l = Math.hypot(dx, dz) || 1;
      const dist = to ? l : CW * (7 + 5 * rng());
      st.target = clampTarget({ x: st.pos.x + (dx / l) * dist, z: st.pos.z + (dz / l) * dist });
      if (wasBuried) { burstOut(); }
      speedGoal = 7 * quirk.pace;
    },

    swim(target: { x: number; z: number }, fast = false): void {
      if (!canSwim(st.pos.x, st.pos.z)) { api.walk(target, fast); return; }
      if (st.bury > 0.4) burstOut();
      enter('SWIM', st.alt > CW * 0.2 ? 'cruise' : 'takeoff', 20);
      st.target = clampTarget(target);
      speedGoal = (fast ? 5 : 2.6) * quirk.pace;
    },

    /** the behaviour's own choices (the viewer's crabs); the game's brain chooses through the driver */
    think(): void {
      if (!settled) return;
      const u = rng();
      const near = () => { const a = rng() * TAU, r = CW * (2 + 6 * rng()); return { x: st.pos.x + Math.cos(a) * r, z: st.pos.z + Math.sin(a) * r }; };
      if (u < 0.25) api.idle(4 + 8 * rng());
      else if (u < 0.5) api.walk(near());
      else if (u < 0.7) api.forage(6 + 8 * rng());
      else if (u < 0.85) api.burrow(10 + 20 * rng());
      else api.swim(near());
    },

    update,
  };

  function clampTarget(t: { x: number; z: number }): { x: number; z: number } {
    let { x, z } = t;
    const b = W.bounds?.();
    if (b) { const m = CW * 0.7; x = clamp(x, b.minX + m, b.maxX - m); z = clamp(z, b.minZ + m, b.maxZ - m); }
    // within its range of home
    const dx = x - home.x, dz = z - home.z, d = Math.hypot(dx, dz);
    if (d > range) { x = home.x + (dx / d) * range; z = home.z + (dz / d) * range; }
    return { x, z };
  }

  function emerge(): void {
    st.buryGoal = 0;
    // most of the sand falls off as it comes out; grains stay in the crevices a while
    st.sandCoat = Math.min(st.sandCoat, 0.45);
    puff(tmp.set(st.pos.x, st.pos.y, st.pos.z), CW * 0.25, 10, 0.5);
  }
  function burstOut(): void {
    st.buryGoal = 0;
    st.sandCoat = Math.min(st.sandCoat, 0.35);
    st.bury = Math.min(st.bury, 0.35);
    puff(tmp.set(st.pos.x, st.pos.y, st.pos.z), CW * 0.45, 22, 0.8);
  }

  /** a puff of sediment at p (world) */
  function puff(p: Vector3, spread: number, count: number, strength: number, vel?: Vector3): void {
    fx.push({ kind: 'sand', pos: p.clone(), vel: vel ? vel.clone() : new Vector3(0, CW * 0.6 * strength, 0), count, spread, size: CW * (0.25 + 0.2 * strength), life: 1.6 + 1.6 * strength, alpha: 0.35 + 0.3 * strength });
  }

  // ------------------------------------------------------------ the frame

  function update(dt: number, lowDetail = false): Pose {
    st.t += dt; st.pt += dt;
    const threat = W.threat?.()?.pos ?? null;
    if (threat) st.threat = threat.clone();
    // a danger newly seen: the eyes duck
    if (threat && !hadThreat) duckT = Math.max(duckT, 0.3 + 0.25 * rng());
    hadThreat = !!threat;
    switch (st.mode) {
      case 'IDLE': modeIdle(dt); break;
      case 'WALK': modeWalk(dt); break;
      case 'FORAGE': modeForage(dt); break;
      case 'BURROW': modeBurrow(dt); break;
      case 'DEFEND': modeDefend(dt); break;
      case 'ESCAPE': modeEscape(dt); break;
      case 'SWIM': modeSwim(dt); break;
    }
    // burial and sand on the shell
    st.bury = ease(st.bury, st.buryGoal, dt, st.buryGoal > st.bury ? 0.55 : 3.2);
    // (buried, the sand settles over its back; the part of the shell left out shows through a thin cover, 13)
    if (st.bury > 0.5) st.sandCoat = Math.min(0.7, st.sandCoat + dt * 0.35);
    else st.sandCoat = Math.max(0, st.sandCoat - dt * (st.mode === 'SWIM' ? 0.15 : st.vel.lengthSq() > 0 ? 0.05 : 0.025));
    integrate(dt);
    legs(dt, lowDetail);
    writePose(dt);
    if (o.autonomous) api.think();
    return P;
  }

  /** speed and steering on the bottom towards st.target (sideways), or holding still */
  function steerOnBottom(dt: number, speedCW: number, turnRate: number): boolean {
    const tgt = st.target;
    let arrived = true;
    if (tgt) {
      const dx = tgt.x - st.pos.x, dz = tgt.z - st.pos.z, d = Math.hypot(dx, dz);
      arrived = d < CW * 0.25;
      if (!arrived) {
        const h = sidewaysHeading(dx, dz);
        st.heading += clamp(wrap(h - st.heading), -turnRate * dt, turnRate * dt);
        // speed: slows over the last body-lengths, the step's own pulse (the stance legs push, the swing legs do not)
        const want = speedCW * CW * clamp(d / (CW * 1.2), 0.25, 1);
        const sp = st.vel.length();
        const ns = ease(sp, want, dt, speedCW > 3 ? 6 : 3.5);
        // travel along the crab's own side (its sideways axis), drifting towards the target as it turns
        leftOf(st.heading, tmp).multiplyScalar(st.lead);
        tmp2.set(dx / d, 0, dz / d);
        tmp.lerp(tmp2, 0.35).normalize();
        st.vel.copy(tmp).multiplyScalar(ns);
      }
    }
    if (arrived) { st.vel.multiplyScalar(Math.exp(-dt * 8)); }
    return arrived;
  }

  function modeIdle(dt: number): void {
    steerOnBottom(dt, 0, 2);
    st.lift = ease(st.lift, 4.2 * quirk.lift, dt, 2);
    if (st.t > st.dur) settled = true;
    // a leg now and then shifts its footing
    shuffleT -= dt;
    if (shuffleT <= 0) { shuffleT = 4 + 8 * rng(); const f = feet[Math.floor(rng() * feet.length)]; f.u = 0.0001; f.from.copy(f.planted); neutralFoot(f.leg, st.lift, quirk.spread * 1.12, tmp); bodyToWorld(tmp, f.to); f.to.y = W.ground(f.to.x, f.to.z); }
  }

  function modeWalk(dt: number): void {
    const run = st.phase === 'run';
    const arrived = steerOnBottom(dt, speedGoal, run ? 7 : 3.2);
    st.lift = ease(st.lift, (run ? 10.5 : 9) * quirk.lift, dt, 4);
    if (arrived && st.vel.length() < CW * 0.1) { settled = true; enter('IDLE', 'rest', 6); settled = true; }
    if (st.t > st.dur) { settled = true; st.target = null; }
  }

  function modeForage(dt: number): void {
    // short moves, then picking in place
    if (st.phase === 'look' || st.phase === 'pick') {
      st.vel.multiplyScalar(Math.exp(-dt * 6));
      st.lift = ease(st.lift, 6 * quirk.lift, dt, 2.5);
      if (st.pt > (st.phase === 'pick' ? 3 + 3 * rng() * 0.2 : 0.8)) {
        if (st.phase === 'look') { phase('pick'); pickT = 0; } else if (rng() < 0.5) {
          const a = st.heading + (rng() < 0.5 ? 1 : -1) * Math.PI / 2 + (rng() - 0.5);
          st.target = clampTarget({ x: st.pos.x + Math.sin(a) * CW * (0.5 + rng()), z: st.pos.z + Math.cos(a) * CW * (0.5 + rng()) });
          phase('move');
        } else phase('pick');
      }
    } else {
      const arrived = steerOnBottom(dt, 0.8 * quirk.pace, 2.5);
      st.lift = ease(st.lift, 7.5 * quirk.lift, dt, 3);
      if (arrived || st.pt > 4) { st.target = null; phase('pick'); pickT = 0; }
    }
    if (st.t > st.dur) settled = true;
  }

  function modeBurrow(dt: number): void {
    st.vel.multiplyScalar(Math.exp(-dt * 6));
    switch (st.phase) {
      case 'settle':
        st.lift = ease(st.lift, 3, dt, 3);
        if (st.pt > 0.6) {
          phase('dig');
          fx.push({ kind: 'imprint', pos: st.pos.clone(), vel: new Vector3(), count: 0, spread: 0, size: 0, life: 240, alpha: 0, heading: st.heading, strength: 0.15 });
        }
        break;
      case 'dig': {
        // sinking backwards: the strokes of the paddles and the walking legs throw sand out at the sides and behind
        st.buryGoal = 0.9;
        puffT -= dt;
        if (puffT <= 0) {
          puffT = 0.32 + 0.1 * rng();
          const side = rng() < 0.5 ? 1 : -1;
          leftOf(st.heading, tmp).multiplyScalar(side * CW * 0.45);
          fwdOf(st.heading, tmp2).multiplyScalar(-CW * (0.15 + 0.2 * rng()));
          tmp3.copy(st.pos).add(tmp).add(tmp2);
          tmp3.y = W.ground(tmp3.x, tmp3.z);
          const v = tmp.clone().normalize().multiplyScalar(CW * 1.2).add(new Vector3(0, CW * 1.4, 0));
          puff(tmp3, CW * 0.18, 7, 0.6, v);
          fx.push({ kind: 'grow', pos: st.pos.clone(), vel: new Vector3(), count: 0, spread: 0, size: 0, life: 0, alpha: 0, strength: 0.25 + 0.75 * st.bury });
        }
        if (st.bury > 0.84) phase('buried');
        break;
      }
      case 'buried':
        st.buryGoal = 0.9;
        // the exhalant current from the front stirs the fine sediment now and then
        breathT -= dt;
        if (breathT <= 0) {
          breathT = 3 + 4 * rng();
          fwdOf(st.heading, tmp).multiplyScalar(CW * 0.32);
          tmp2.copy(st.pos).add(tmp); tmp2.y = W.ground(tmp2.x, tmp2.z);
          puff(tmp2, CW * 0.06, 3, 0.15, fwdOf(st.heading, tmp3).multiplyScalar(CW * 0.5).add(new Vector3(0, CW * 0.3, 0)));
        }
        if (st.t > st.dur) settled = true;
        break;
    }
  }

  function modeDefend(dt: number): void {
    st.vel.multiplyScalar(Math.exp(-dt * 8));
    // face the danger
    if (st.threat) {
      const h = Math.atan2(st.threat.x - st.pos.x, st.threat.z - st.pos.z);
      st.heading += clamp(wrap(h - st.heading), -3.5 * dt, 3.5 * dt);
    }
    st.lift = ease(st.lift, 16 * quirk.lift, dt, 5);
    if (st.phase === 'rise' && st.pt > 0.4) phase('display');
    // snaps and lunges at a near danger
    snapT -= dt;
    if (snapT <= 0) { snapT = 1.2 + 1.8 * rng(); lungeT = 0.35; }
    if (lungeT > 0) {
      lungeT -= dt;
      fwdOf(st.heading, tmp).multiplyScalar(Math.sin((lungeT / 0.35) * Math.PI) * CW * 0.7);
      st.vel.add(tmp.multiplyScalar(dt * 8));
    }
    if (st.t > st.dur) settled = true;
  }

  function modeEscape(dt: number): void {
    if (st.phase === 'burst') { st.lift = ease(st.lift, 9, dt, 6); if (st.pt > 0.35) phase('run'); return; }
    const arrived = steerOnBottom(dt, speedGoal, 9);
    st.lift = ease(st.lift, 11 * quirk.lift, dt, 6);
    // the danger close behind and room to swim: off the bottom
    if (st.t > 0.5 && canSwim(st.pos.x, st.pos.z) && st.threat && st.pos.distanceTo(st.threat) < CW * 8 && rng() < dt * 0.8 && st.target) {
      const tg = st.target;
      api.swim(tg, true);
      return;
    }
    if (arrived || st.t > 4) {
      // done running: dig in where it can, else keep still
      if ((!W.canBurrow || W.canBurrow()) && rng() < 0.7) api.burrow(20 + 20 * rng());
      else api.idle(4 + 4 * rng());
      settled = true;
    }
  }

  function modeSwim(dt: number): void {
    const tgt = st.target;
    const depth = depthAt(st.pos.x, st.pos.z);
    const maxAlt = Math.max(0, depth - CW * 0.4);
    let want = 0;
    if (st.phase === 'takeoff') {
      want = Math.min(maxAlt, CW * 0.7);
      if (st.pt > 0.35) phase('cruise');
      if (st.pt < 0.05) puff(tmp.copy(st.pos).setY(W.ground(st.pos.x, st.pos.z)), CW * 0.35, 12, 0.7);
    } else if (st.phase === 'cruise') {
      want = Math.min(maxAlt, CW * (0.8 + 0.25 * Math.sin(st.t * 0.9)));
      if (!tgt || Math.hypot(tgt.x - st.pos.x, tgt.z - st.pos.z) < CW * 0.8 || st.t > st.dur || maxAlt < CW * 0.15) phase('land');
    } else {
      want = 0;
      if (st.alt < CW * 0.03) {
        puff(tmp.copy(st.pos).setY(W.ground(st.pos.x, st.pos.z)), CW * 0.3, 10, 0.55);
        st.alt = 0;
        plantAll();
        enter('IDLE', 'rest', 4 + 4 * rng());
        settled = true;
        return;
      }
    }
    st.alt = ease(st.alt, want, dt, st.phase === 'land' ? 1.6 : 2.2);
    st.lift = ease(st.lift, 6, dt, 3);
    // thrust from the strokes: sideways towards the leading side, pulsing with the beat
    const beat = st.phase === 'land' ? 2.2 : 3.2 + 1.6 * clamp(speedGoal / 5, 0, 1);
    st.stroke += beat * TAU * dt;
    if (tgt && st.phase !== 'land') {
      const dx = tgt.x - st.pos.x, dz = tgt.z - st.pos.z, d = Math.hypot(dx, dz) || 1;
      const h = sidewaysHeading(dx, dz);
      st.heading += clamp(wrap(h - st.heading), -2.5 * dt, 2.5 * dt);
      const pulse = 0.75 + 0.25 * Math.cos(st.stroke * 2);
      const want2 = speedGoal * CW * pulse * clamp(d / (CW * 2), 0.35, 1);
      leftOf(st.heading, tmp).multiplyScalar(st.lead);
      tmp.lerp(tmp2.set(dx / d, 0, dz / d), 0.3).normalize();
      st.vel.lerp(tmp.multiplyScalar(want2), 1 - Math.exp(-dt * 2.5));
    } else st.vel.multiplyScalar(Math.exp(-dt * 1.2));
  }

  /** move the body: on the bottom along the ground, swimming at its height; kept in bounds and in the water */
  function integrate(dt: number): void {
    st.pos.x += st.vel.x * dt;
    st.pos.z += st.vel.z * dt;
    const b = W.bounds?.();
    if (b) { const m = CW * 0.6; st.pos.x = clamp(st.pos.x, b.minX + m, b.maxX - m); st.pos.z = clamp(st.pos.z, b.minZ + m, b.maxZ - m); }
    const g = W.ground(st.pos.x, st.pos.z);
    // off the paddles it sinks back to the bottom
    if (st.mode !== 'SWIM') st.alt = st.alt > 1e-4 ? ease(st.alt, 0, dt, 2.5) : 0;
    st.pos.y = g + st.alt;
    // the body follows the ground's slope on its legs (and tips up at the front to dig in, or rears to defend)
    const e = CW * 0.35;
    const fx2 = fwdOf(st.heading, tmp), lx = leftOf(st.heading, tmp2);
    const gF = W.ground(st.pos.x + fx2.x * e, st.pos.z + fx2.z * e), gB = W.ground(st.pos.x - fx2.x * e, st.pos.z - fx2.z * e);
    const gL = W.ground(st.pos.x + lx.x * e, st.pos.z + lx.z * e), gR = W.ground(st.pos.x - lx.x * e, st.pos.z - lx.z * e);
    const swimming = st.mode === 'SWIM';
    let pitch = swimming ? -0.04 : Math.atan2(gF - gB, 2 * e);
    let roll = swimming ? 0.08 * st.lead + 0.04 * Math.sin(st.stroke) : Math.atan2(gL - gR, 2 * e);
    if (st.mode === 'BURROW') pitch += 0.34 * smooth(st.bury / 0.6);
    if (st.mode === 'DEFEND') pitch += 0.24;
    if (st.mode === 'WALK' || st.mode === 'ESCAPE') roll += 0.05 * st.lead * clamp(st.vel.length() / (CW * 3), 0, 1);
    st.pitch = ease(st.pitch, pitch, dt, 5);
    st.roll = ease(st.roll, roll, dt, 5);
  }

  // ------------------------------------------------------------ legs

  const _b = new Vector3(), _w = new Vector3();
  function legs(dt: number, lowDetail: boolean): void {
    const onBottom = st.mode !== 'SWIM' || st.alt < CW * 0.05;
    const buried = st.bury > 0.25;
    const sp = st.vel.length() / CW;   // CW/s
    // the gait: one stride per ≈ 0.3 CW (longer when running); the phase also turns slowly to reposition feet
    if (onBottom && !buried) {
      const stride = 0.26 + 0.1 * clamp(sp / 4, 0, 1);
      const f = clamp(sp / stride, 0, 7);
      let need = 0;
      for (const ft of feet) {
        neutralFoot(ft.leg, st.lift, quirk.spread, _b);
        bodyToWorld(_b, _w);
        need = Math.max(need, Math.hypot(_w.x - ft.planted.x, _w.z - ft.planted.z) / CW, ft.miss > 1.2 ? 1 : 0);
      }
      const shuffle = need > 0.12 ? 2.2 : 0;
      st.gait = (st.gait + dt * Math.max(f, shuffle)) % 1;
      const duty = sp > 3 ? 0.5 : 0.62;
      const swing = 1 - duty;
      for (const ft of feet) {
        // the group's swing window: group 0 starts at 0, group 1 half a cycle later
        const ph = (st.gait - ft.group * 0.5 + 1) % 1;
        const inSwing = ph < swing && (f > 0.05 || shuffle > 0);
        if (inSwing && ft.u >= 1) {
          // lift off: aim where the neutral foot will be half a stance from now (Raibert)
          ft.from.copy(ft.planted);
          neutralFoot(ft.leg, st.lift, quirk.spread, _b);
          bodyToWorld(_b, ft.to);
          const ahead = (duty / Math.max(0.3, f)) * 0.5 + swing / Math.max(0.3, f);
          ft.to.addScaledVector(st.vel, Math.min(ahead, 0.6));
          ft.to.y = W.ground(ft.to.x, ft.to.z);
          ft.u = 0;
        }
        if (ft.u < 1) {
          const rate = f > 0.05 ? f / swing : 2.5;
          ft.u = Math.min(1, ft.u + dt * Math.max(rate, 1.2));
          const k = smooth(ft.u);
          ft.planted.lerpVectors(ft.from, ft.to, k);
          ft.planted.y = W.ground(ft.planted.x, ft.planted.z) + Math.sin(Math.PI * ft.u) * CW * (0.06 + 0.04 * clamp(sp / 4, 0, 1));
          if (ft.u >= 1) {
            ft.planted.copy(ft.to);
            // a little sand kicked up by a running foot
            if (sp > 2.5 && rng() < 0.5) puff(ft.planted, CW * 0.05, 2, 0.2);
          }
        }
      }
    } else if (!onBottom) {
      // keep the feet "planted" under the body for the landing
      for (const ft of feet) { neutralFoot(ft.leg, st.lift, quirk.spread, _b); bodyToWorld(_b, ft.planted); ft.planted.y = W.ground(ft.planted.x, ft.planted.z); ft.u = 1; }
    }
    // the joint goals per leg
    for (const leg of rig.legs) {
      const key = legKey(leg.id, leg.side);
      const G = goal[key];
      const cur = P.legs[key];
      if (isWalking(leg.id)) {
        if (!onBottom) {
          copyLeg(cur, G);
          blendLeg(G, LEG_SWIM[leg.id], 1, G);
          // held out level as planes; a passive flutter with the strokes, the bundle trimming with the body's roll
          G.lev += 0.05 * Math.sin(st.stroke + (leg.id === 'P3' ? 1 : leg.id === 'P4' ? 2 : 0)) - 0.15 * st.roll * leg.sg;
          G.pd += 0.08 * Math.sin(st.stroke * 1.0 + 0.7);
        } else if (buried) {
          // folded under, pressed into the sand
          copyLeg(cur, G);
          blendLeg(G, { promo: 0, lev: -0.1, mc: -1.6, cp: -0.4, pd: -0.6 }, 1, G);
        } else if (!lowDetail) {
          const ft = feet.find((f) => f.leg === leg)!;
          worldToBody(ft.planted, _b);
          copyLeg(cur, G);
          ft.miss = solveLeg(leg, ft.PL, _b, DACTYL_ANGLE + (st.mode === 'FORAGE' ? 0.12 * Math.sin(st.t * 7 + (leg.id === 'P2' ? 0 : 2)) : 0), G);
        } else {
          // far away: the neutral stance with the gait's swing drawn on it (no IK)
          neutralFoot(leg, st.lift, quirk.spread, _b);
          copyLeg(cur, G);
          solveLeg(leg, planarOf(leg), _b, DACTYL_ANGLE, G);
          const ft = feet.find((f) => f.leg === leg)!;
          const ph = (st.gait - ft.group * 0.5 + 1) % 1;
          const up = ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI) : 0;
          G.lev += 0.25 * up * clamp(sp, 0, 1);
          G.promo += 0.15 * Math.cos(ph * TAU) * clamp(sp, 0, 1) * leg.sg * st.lead;
        }
      } else if (leg.id === 'P5') paddle(leg, G, cur, onBottom, buried);
      else cheliped(leg, G, cur, dt);
    }
    // blend the legs towards their goals (fast when alarmed; IK'd walking legs follow their feet directly)
    const k = st.mode === 'ESCAPE' || st.mode === 'DEFEND' ? 14 : 7;
    for (const leg of rig.legs) {
      const key = legKey(leg.id, leg.side);
      const G = goal[key], cur = P.legs[key];
      const direct = isWalking(leg.id) && onBottom && !buried && !lowDetail;
      const kk = direct ? 40 : leg.id === 'P5' && st.mode === 'SWIM' ? 30 : leg.id === 'P1' && (st.mode === 'DEFEND' || st.mode === 'FORAGE') ? 18 : k;
      for (const j of ['promo', 'pitch', 'lev', 'roll', 'meYaw', 'mcYaw', 'mc', 'cp', 'cpRoll', 'cpYaw', 'pd'] as const) cur[j] = ease(cur[j], G[j], dt, kk);
    }
  }

  /** the swimming legs: carried up behind when walking, flat at rest, shovelling when digging, sculling when swimming */
  function paddle(leg: LegRig, G: LegPose, cur: LegPose, onBottom: boolean, buried: boolean): void {
    copyLeg(cur, G);
    const sg = leg.sg;
    if (st.mode === 'SWIM' && !onBottom || st.mode === 'SWIM' && st.phase === 'takeoff') {
      // the figure of eight: the paddle swings forward and back over the body while its blade turns (feathering) a
      // quarter cycle ahead, so it pushes water on both strokes; left and right half a cycle apart (alternating)
      const ph = st.stroke + (sg > 0 ? 0 : Math.PI);
      const amp = st.phase === 'land' ? 0.6 : 1;
      // (swinging between out to the side and back, over the rear corners: 6)
      G.promo = 0.15 + 0.5 * amp * Math.sin(ph);
      G.lev = 0.62 + 0.22 * amp * Math.cos(ph);
      G.mc = -0.25 + 0.18 * Math.sin(ph + 0.6);
      G.cp = -0.1 + 0.15 * Math.cos(ph);
      G.cpRoll = 1.05 * amp * Math.cos(ph);
      G.pd = -0.15 + 0.38 * amp * Math.sin(ph + 0.9);
      G.roll = 0;
      return;
    }
    if (st.mode === 'BURROW' && st.phase === 'dig') {
      // shovelling: sweeps out sideways and up, the blade flat against the sand
      const ph = st.t * 3.1 * TAU / 2 + (sg > 0 ? 0 : Math.PI);
      blendLeg(G, { promo: -0.2 + 0.45 * Math.sin(ph), lev: 0.05 + 0.25 * Math.max(0, Math.cos(ph)), mc: -0.25, cp: -0.1, cpRoll: 0.35 * Math.sin(ph), pd: -0.2 + 0.2 * Math.cos(ph) }, 1, G);
      return;
    }
    if (buried) { blendLeg(G, { promo: -0.3, lev: -0.15, mc: -0.4, cp: -0.1, cpRoll: 0, pd: -0.2 }, 1, G); return; }
    const carry = st.mode === 'WALK' || st.mode === 'ESCAPE' || st.mode === 'DEFEND' || st.mode === 'FORAGE' && st.phase === 'move';
    blendLeg(G, carry ? PADDLE_CARRY : PADDLE_REST, 1, G);
    if (carry) { G.cpRoll = 0.12 * Math.sin(st.t * 2.3 + sg); G.lev += st.mode === 'DEFEND' ? 0.3 : 0; }
  }

  /** the chelipeds: folded at rest, ready when walking, picking when foraging, raised in display, tucked swimming */
  function cheliped(leg: LegRig, G: LegPose, cur: LegPose, dt: number): void {
    copyLeg(cur, G);
    const i = leg.side === 'L' ? 0 : 1;
    switch (st.mode) {
      case 'IDLE': blendLeg(G, CHELA_FOLDED, 1, G); break;
      case 'WALK': blendLeg(G, st.phase === 'run' ? CHELA_SWIM : CHELA_READY, 1, G); break;
      case 'ESCAPE': blendLeg(G, CHELA_SWIM, 1, G); G.lev += 0.15; break;
      // (the left claw a little over the right, so that the fingertips lie one on the other)
      case 'SWIM': blendLeg(G, CHELA_SWIM, 1, G); G.lev += i === 0 ? 0.07 : -0.07; break;
      case 'BURROW': blendLeg(G, CHELA_FOLDED, 1, G); G.lev -= 0.1 * smooth(st.bury); break;
      case 'DEFEND': {
        blendLeg(G, CHELA_DEFEND, 1, G);
        // swaying, the gape pulsing; a snap: shut in a flash and open again
        G.promo += 0.07 * Math.sin(st.t * 2.4 + i * 1.3);
        G.lev += 0.05 * Math.sin(st.t * 1.7 + i);
        const snap = lungeT > 0 ? Math.sin((lungeT / 0.35) * Math.PI) : 0;
        G.pd = 0.45 * (1 - snap) + 0.06 * Math.sin(st.t * 5 + i);
        G.lev += 0.2 * snap;
        break;
      }
      case 'FORAGE': {
        if (st.phase === 'pick') {
          // the claws take turns: reach down, pinch, carry to the mouth
          pickT += dt;
          const cyc = 1.25, ph = (pickT / cyc) % 1;
          const active = Math.floor(pickT / cyc) % 2 === i;
          if (active) {
            const down = ph < 0.35 ? smooth(ph / 0.35) : ph < 0.5 ? 1 : 1 - smooth((ph - 0.5) / 0.3);
            const toMouth = ph > 0.55 ? smooth((ph - 0.55) / 0.3) : 0;
            blendLeg(G, CHELA_READY, 1, G);
            blendLeg(G, CHELA_PICK, down, G);
            blendLeg(G, CHELA_MOUTH, toMouth, G);
            G.pd = ph < 0.3 ? 0.35 : ph < 0.45 ? 0.02 : 0.05;
            // a little sediment where the claw pinches
            if (ph > 0.33 && ph < 0.36 && pickSide !== Math.floor(pickT / cyc)) {
              pickSide = Math.floor(pickT / cyc);
              fwdOf(st.heading, tmp).multiplyScalar(CW * 0.55);
              leftOf(st.heading, tmp2).multiplyScalar((i === 0 ? 1 : -1) * CW * 0.12);
              tmp3.copy(st.pos).add(tmp).add(tmp2); tmp3.y = W.ground(tmp3.x, tmp3.z);
              puff(tmp3, CW * 0.05, 3, 0.25);
            }
          } else blendLeg(G, CHELA_READY, 1, G);
        } else blendLeg(G, CHELA_READY, 1, G);
        break;
      }
    }
  }

  // ------------------------------------------------------------ the pose

  function writePose(dt: number): void {
    P.pos.copy(st.pos);
    P.heading = st.heading;
    // buried: sunk into the sand, the front (eyes, frontal margin) left out
    const sink = -BODY_DEPTH * 0.82 * smooth(st.bury);
    P.lift = st.lift + sink;
    P.pitch = st.pitch;
    P.roll = st.roll;
    // the bob of the gait (the body rises a little as each group takes the weight)
    if (st.mode === 'WALK' || st.mode === 'ESCAPE' || (st.mode === 'FORAGE' && st.phase === 'move')) P.lift += 0.6 * Math.cos(st.gait * TAU * 2);
    if (st.mode === 'SWIM') P.lift += 0.8 * Math.sin(st.stroke * 2);
    // eyes: up and looking about in quick jumps between held gazes (an eyestalk does not glide), each eye its own, at
    // the danger when there is one; at a sudden danger both duck into the orbits for a moment and come up again
    // slowly; now and then one is drawn down into its orbit, whose setae wipe the cornea; folded while digging in
    duckT = Math.max(0, duckT - dt);
    const alert = st.threat ? 1 : 0;
    const base = st.mode === 'BURROW' && st.phase === 'dig' ? 0.35 : st.mode === 'ESCAPE' && st.phase === 'burst' ? 0.2 : 1;
    for (let i = 0; i < 2; i++) {
      eyeHold[i] -= dt;
      if (eyeHold[i] <= 0) {
        eyeHold[i] = (0.35 + 2.2 * rng()) * (alert ? 0.5 : 1);
        eyeGoal[i] = (rng() - 0.5) * 0.7;
        eyeTilt[i] = (rng() - 0.5) * 0.14;
        // (the two often jump together)
        if (i === 0 && rng() < 0.45) { eyeHold[1] = eyeHold[0]; eyeGoal[1] = -eyeGoal[0] + (rng() - 0.5) * 0.15; eyeTilt[1] = eyeTilt[0]; }
      }
      const calm = st.mode === 'IDLE' || st.mode === 'FORAGE' || (st.mode === 'BURROW' && st.phase === 'buried');
      if (eyeWipe[i] <= 0 && calm && duckT <= 0 && rng() < dt / 28) eyeWipe[i] = 0.5 + 0.3 * rng();
      eyeWipe[i] = Math.max(0, eyeWipe[i] - dt);
      const raise = (duckT > 0 || eyeWipe[i] > 0.2 ? 0.04 : base) + (base > 0.9 ? eyeTilt[i] * 0.5 : 0);
      // down fast, up slowly
      P.eyeRaise[i] = ease(P.eyeRaise[i], raise, dt, raise < P.eyeRaise[i] ? 30 : 4.5);
      let yaw = eyeGoal[i];
      if (st.threat && (st.mode === 'DEFEND' || st.mode === 'IDLE')) {
        const h = Math.atan2(st.threat.x - st.pos.x, st.threat.z - st.pos.z);
        yaw = clamp(wrap(h - st.heading) * 0.5, -0.5, 0.5) * (i === 0 ? 1 : -1) + eyeGoal[i] * 0.15;
      }
      P.eyeYaw[i] = ease(P.eyeYaw[i], yaw, dt, 24);
    }
    // antennules: bursts of flicking (sampling the water's scent) at rest, foraging and buried
    flickT -= dt;
    if (flickT < -1.2) flickT = (1.5 + 3 * rng()) / quirk.flick;
    const flicking = flickT < 0 && st.mode !== 'ESCAPE' && st.mode !== 'SWIM';
    for (let i = 0; i < 2; i++) {
      P.a1[i] = flicking ? 0.5 + 0.5 * Math.sin(st.t * 19 + i * 1.7) : ease(P.a1[i], 0, dt, 6);
      P.a2[i] = 0.15 * Math.sin(st.t * 0.9 + i * 2.1) + (st.mode === 'SWIM' ? -0.2 : 0);
    }
    // the third maxillipeds: working while it eats, a slow flutter otherwise
    const eating = st.mode === 'FORAGE' && st.phase === 'pick' && ((pickT / 1.25) % 1) > 0.7;
    P.mxp = eating ? 0.5 + 0.5 * Math.sin(st.t * 14) : 0.06 + 0.04 * Math.sin(st.t * 3.1);
    P.bury = st.bury;
    P.sandCoat = st.sandCoat;
  }

  if (o.startBuried) {
    st.mode = 'BURROW'; st.phase = 'buried'; st.bury = st.buryGoal = 0.9; st.sandCoat = 1; st.dur = 30 + 60 * rng();
    st.lift = 3;
  }
  plantAll();
  // settle the legs on the ground at once
  for (let i = 0; i < 30; i++) update(1 / 30);
  fx.length = 0;
  return api;
}

export type { LegId };
