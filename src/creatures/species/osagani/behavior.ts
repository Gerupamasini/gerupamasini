import { Vector3 } from 'three';
import type { LegId } from './anatomy';
import { MODEL_CW } from './anatomy';
import type { LegRig, RigDef } from './geometry';
import {
  CHELA_FOLDED, CHELA_RAISED, CHELA_STAND, CHELA_STAND_F, DACTYL_ANGLE, LIFT, blendLeg, isWalking, neutralFoot, type Partial4,
} from './poses';
import { bindLeg, copyLeg, emptyPose, legKey, planarOf, solveLeg, type DistalMode, type LegPose, type PlanarLeg, type Pose } from './rig';

/**
 * The ヤマトオサガニ's behaviour: what it is doing and how its body, legs, claws and eyestalks move, without any
 * rendering (the driver, the viewer and the unit tests use it alike). It lives round its burrow on the mud:
 *  - IDLE          standing still near the burrow, the eyestalks up and turning, the claws before the face; now and
 *                  then a leg shifts its footing; at the mouth it often rests with its rear in the hole
 *  - WALK          sideways, leading with one side, on the alternating gait of the walking legs (L2 R3 L4 R5 against
 *                  R2 L3 R4 L5): each foot lifts, swings, lands where the mud is and stays planted while the body
 *                  passes over it (IK onto the ground under it)
 *  - FORAGE        deposit feeding over the mud's surface: the claws scrape the surface film in turn and carry it to
 *                  the mouth, the third maxillipeds working; short sideways shuffles between patches
 *  - BURROW_ENTRY  back to the burrow (running when alarmed) and down it: sideways, the leading side first, sinking
 *                  to the eyestalks, then sliding down the slanting shaft with the legs drawn in, the eyestalks folded
 *                  last; it stays in until the brain sends it out
 *  - BURROW_EXIT   the eyestalks first: it rises until only they are out and looks about, then climbs out and plants
 *                  its legs on the mud by the mouth
 *  - DEFEND        it turns its front to the danger, rises on its legs and raises the claws, open, swaying
 *  - ESCAPE        a fast sideways run, to the burrow when it is near (and down it), otherwise away
 * Everything is in carapace widths (CW), so a 15 mm young and a 40 mm male move alike, faster in proportion.
 */

export const MODES = ['IDLE', 'WALK', 'FORAGE', 'BURROW_ENTRY', 'BURROW_EXIT', 'DEFEND', 'ESCAPE'] as const;
export type Mode = (typeof MODES)[number];

export interface CrabWorld {
  ground(x: number, z: number): number;
  waterY(x: number, z: number): number;
  /** the danger it watches (the observer, once noticed) */
  threat?(): { pos: Vector3 } | null;
  bounds?(): { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  /** false where there is nothing to dig a burrow in (a tank, the acrylic case) */
  canBurrow?(): boolean;
}

/** its burrow: the mouth (x, z) and the shaft's lean (the direction it slants down to, rad: as Burrows.js) */
export interface Burrow { x: number; z: number; az: number }

export interface CrabState {
  mode: Mode;
  phase: string;
  /** seconds in the mode and in the phase, the mode's planned length */
  t: number;
  pt: number;
  dur: number;
  /** the ground point under the body, the heading, the velocity (m/s) */
  pos: Vector3;
  heading: number;
  vel: Vector3;
  /** down the burrow (0 out … 0.35 only the eyestalks out … 1 gone), and where it is going */
  burrow: number;
  burrowGoal: number;
  /** mud clinging to the shell (0 … 1) */
  mudCoat: number;
  target: { x: number; z: number } | null;
  threat: Vector3 | null;
  /** +1 leading with its left side, −1 with its right */
  lead: number;
  /** the gait's phase (0 … 1) */
  gait: number;
  /** body height over the ground (mm at CW 35), pitch and roll (rad) */
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
  /** how far (mm) the leg fell short of its foot last frame: a stretched leg must step */
  miss: number;
}

export interface CrabOptions {
  world: CrabWorld;
  rng: () => number;
  rig: RigDef;
  /** the crab's carapace width (m) */
  scale: number;
  start: { x: number; z: number; heading: number };
  /** its burrow (none: it lives in a tank or the case) */
  burrow?: Burrow | null;
  /** how far it ranges from its burrow (m) */
  range?: number;
  /** the mature male's large claws (their poses differ) */
  maleChela?: boolean;
  /** pick its own actions when idle (the viewer's crabs); the game's brain drives it otherwise */
  autonomous?: boolean;
  startInBurrow?: boolean;
}

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a: number) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
/** move a toward b by a share that makes a rate of `k` per second frame-rate independent */
const ease = (a: number, b: number, dt: number, k: number) => a + (b - a) * (1 - Math.exp(-k * dt));

/** the shaft's slant from the vertical (rad: Burrows.js SHAFT_TILTS[1]) and how deep the crab goes down it (mm at CW 35) */
export const SHAFT_TILT = 0.6;
const DEPTH = 62;
/** the share of the burrow value at which only the eyestalks are out (the peek), and the sternum's depth there (mm) */
export const PEEK = 0.35;
const PEEK_LIFT = -16.5;
/** the mouth's radius (m per m of CW) */
export const MOUTH_R = 0.5;

export type CrabApi = ReturnType<typeof createCrabBehavior>;

export function createCrabBehavior(o: CrabOptions) {
  const W = o.world, rng = o.rng, rig = o.rig;
  const CW = o.scale;
  /** model mm → world m */
  const MM = (CW / MODEL_CW) * 0.001;
  const burrow = o.burrow ?? null;
  const home = burrow ? { x: burrow.x, z: burrow.z } : { x: o.start.x, z: o.start.z };
  const range = o.range ?? CW * 30;
  const male = o.maleChela ?? true;
  const P: Pose = emptyPose();
  const st: CrabState = {
    mode: 'IDLE', phase: 'stand', t: 0, pt: 0, dur: 8,
    pos: new Vector3(o.start.x, W.ground(o.start.x, o.start.z), o.start.z), heading: o.start.heading, vel: new Vector3(),
    burrow: 0, burrowGoal: 0, mudCoat: 0.1, target: null, threat: null, lead: 1, gait: 0, lift: LIFT.stand, pitch: 0, roll: 0,
  };
  let settled = true;
  let speedGoal = 0;
  /** after the slide in: whether it goes on to stay in, or straight out again (the brain decides) */
  let afterIn: 'stay' | 'exit' = 'stay';
  const goal: Record<string, LegPose> = {};
  for (const leg of rig.legs) goal[legKey(leg.id, leg.side)] = bindLeg(leg.id);
  const order: LegId[] = ['P2', 'P3', 'P4', 'P5'];
  const feet: FootState[] = rig.legs.filter((l) => isWalking(l.id)).map((leg) => ({
    leg, PL: planarOf(leg), planted: new Vector3(), from: new Vector3(), to: new Vector3(), u: 1,
    // the alternating gait: L2 R3 L4 R5 against R2 L3 R4 L5
    group: (order.indexOf(leg.id) + (leg.side === 'L' ? 0 : 1)) % 2, miss: 0,
  }));
  // per-crab quirks: how it holds itself, how quick it is (never two alike)
  const quirk = { spread: 0.95 + 0.1 * rng(), lift: 0.92 + 0.16 * rng(), pace: 0.88 + 0.24 * rng() };
  let shuffleT = 3 + 5 * rng(), scoopT = 0, waveT = 0;
  /** seconds the walking legs have been out on the mud (they blend in from the folded pose, then follow their feet) */
  let onMud = 1;
  const eyeHold = [0.3, 0.9], eyeGoal = [0, 0];
  const tmp = new Vector3(), tmp2 = new Vector3();

  // ------------------------------------------------------------ frames

  /** the body's frame: world point → body mm (the pose's root, heading, lift, pitch, roll) */
  function worldToBody(p: Vector3, out: Vector3): Vector3 {
    const ch = Math.cos(st.heading), sh = Math.sin(st.heading);
    const dx = (p.x - st.pos.x) / MM, dy = (p.y - st.pos.y) / MM - st.lift, dz = (p.z - st.pos.z) / MM;
    let x = dx * ch - dz * sh, y = dy;
    const z = dx * sh + dz * ch;
    const cr = Math.cos(-st.roll), sr = Math.sin(-st.roll);
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
    x = x1; y = y1;
    const cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    return out.set(x, y * cp - z * sp, y * sp + z * cp);
  }
  /** body mm → world (the inverse of worldToBody) */
  function bodyToWorld(b: Vector3, out: Vector3): Vector3 {
    const cp = Math.cos(-st.pitch), sp = Math.sin(-st.pitch);
    let x = b.x, y = b.y * cp - b.z * sp;
    const z = b.y * sp + b.z * cp;
    const cr = Math.cos(st.roll), sr = Math.sin(st.roll);
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
    x = x1; y = y1 + st.lift;
    const ch = Math.cos(st.heading), sh = Math.sin(st.heading);
    return out.set(st.pos.x + (x * ch + z * sh) * MM, st.pos.y + y * MM, st.pos.z + (-x * sh + z * ch) * MM);
  }
  const leftOf = (h: number, out: Vector3) => out.set(Math.cos(h), 0, -Math.sin(h));
  const fwdOf = (h: number, out: Vector3) => out.set(Math.sin(h), 0, Math.cos(h));
  const canBurrow = () => !!burrow && (!W.canBurrow || W.canBurrow());

  function enter(mode: Mode, phase: string, dur: number): void {
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

  /** within the tank's walls (when it is in one) and, unless it is running for its life, its range round the burrow */
  function clampTarget(t: { x: number; z: number }, roam = true): { x: number; z: number } {
    let { x, z } = t;
    const b = W.bounds?.();
    if (b) { const m = CW * 0.8; x = clamp(x, b.minX + m, b.maxX - m); z = clamp(z, b.minZ + m, b.maxZ - m); }
    if (!roam) return { x, z };
    const dx = x - home.x, dz = z - home.z, d = Math.hypot(dx, dz);
    if (d > range) { x = home.x + (dx / d) * range; z = home.z + (dz / d) * range; }
    return { x, z };
  }

  /** out of the burrow first (the eyestalks, then the rest) before doing anything else on the mud */
  function needsOut(): boolean {
    if (st.burrow < 0.05) return false;
    if (st.mode !== 'BURROW_EXIT') api.exitBurrow(0.3);
    return true;
  }

  // ------------------------------------------------------------ commands

  const api = {
    state: st,
    pose: P,
    get settled() { return settled; },
    get pos() { return st.pos; },
    get burrow() { return burrow; },
    /** down its burrow, out of sight */
    get hidden() { return st.burrow > 0.92; },

    idle(secs = 10): void {
      if (needsOut()) { queued = { kind: 'idle', secs }; return; }
      enter('IDLE', burrow && Math.hypot(st.pos.x - burrow.x, st.pos.z - burrow.z) < CW * 1.2 ? 'mouth' : 'stand', secs);
      st.target = null; speedGoal = 0;
    },

    walk(target: { x: number; z: number }, run = false): void {
      if (needsOut()) { queued = { kind: 'walk', target, run }; return; }
      enter('WALK', run ? 'run' : 'walk', 30);
      st.target = clampTarget(target);
      speedGoal = (run ? 7 : 1.6) * quirk.pace;
    },

    forage(secs = 10): void {
      if (needsOut()) { queued = { kind: 'forage', secs }; return; }
      enter('FORAGE', 'scoop', secs);
      st.target = null; speedGoal = 0; scoopT = 0;
    },

    /** back to the burrow and down it; it stays in `secs` (the brain's own time) */
    enterBurrow(secs = 30, run = false): void {
      if (!canBurrow()) { api.idle(secs); return; }
      if (st.mode === 'BURROW_ENTRY' && st.burrow > 0.9) { st.dur = Math.max(st.dur, st.t + secs); afterIn = 'stay'; return; }
      enter('BURROW_ENTRY', 'approach', secs);
      afterIn = 'stay';
      st.target = { x: burrow!.x, z: burrow!.z };
      speedGoal = (run ? 8 : 1.8) * quirk.pace;
    },

    /** up out of the burrow: the eyestalks first, a look round (`peek` s), then the rest */
    exitBurrow(peek = 1.5 + 2 * rng()): void {
      if (st.burrow < 0.05) { api.idle(4); return; }
      enter('BURROW_EXIT', 'rise', peek);
      st.burrowGoal = PEEK;
    },

    defend(from: Vector3 | null, secs = 4): void {
      if (st.burrow > 0.5) { st.threat = from ? from.clone() : st.threat; return; }
      enter('DEFEND', 'rise', secs);
      st.threat = from ? from.clone() : st.threat;
      speedGoal = 0;
      waveT = 0.4;
    },

    /** away from the danger: down the burrow when it is near enough to reach, otherwise a run away */
    escape(from: Vector3 | null): void {
      st.threat = from ? from.clone() : st.threat;
      if (st.burrow > 0.3) { api.enterBurrow(20 + 20 * rng(), true); return; }
      const toBurrow = burrow && canBurrow() ? Math.hypot(burrow.x - st.pos.x, burrow.z - st.pos.z) : Infinity;
      if (toBurrow < CW * 70) {
        // home: a dash to the mouth, then straight down (BURROW_ENTRY from its turn)
        enter('ESCAPE', 'home', 20 + 25 * rng());
        st.target = { x: burrow!.x, z: burrow!.z };
        speedGoal = 8.5 * quirk.pace;
        return;
      }
      enter('ESCAPE', 'run', 5);
      let dx: number, dz: number;
      if (st.threat) { dx = st.pos.x - st.threat.x; dz = st.pos.z - st.threat.z; } else { const a = rng() * TAU; dx = Math.cos(a); dz = Math.sin(a); }
      const l = Math.hypot(dx, dz) || 1;
      const dist = CW * (12 + 8 * rng());
      st.target = clampTarget({ x: st.pos.x + (dx / l) * dist, z: st.pos.z + (dz / l) * dist }, false);
      speedGoal = 8.5 * quirk.pace;
    },

    /** the behaviour's own choices (the viewer's crabs); the game's brain chooses through the driver */
    think(): void {
      if (!settled) return;
      const u = rng();
      const near = () => { const a = rng() * TAU, r = CW * (2 + 8 * rng()); return { x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r }; };
      if (st.burrow > 0.5) { if (u < 0.7) api.exitBurrow(); else api.enterBurrow(5 + 10 * rng()); return; }
      if (u < 0.25) api.idle(3 + 6 * rng());
      else if (u < 0.5) api.walk(near());
      else if (u < 0.8) api.forage(6 + 8 * rng());
      else api.enterBurrow(6 + 12 * rng());
    },

    update,
  };
  /** what it was asked to do while it was still coming out of its burrow */
  let queued: { kind: 'idle' | 'walk' | 'forage'; secs?: number; target?: { x: number; z: number }; run?: boolean } | null = null;

  // ------------------------------------------------------------ the frame

  /** `tier`: the model's tier drawn (0 hero, 1 lod1: the propodus held at rest, 2 lod2: no IK) */
  function update(dt: number, tier: 0 | 1 | 2 = 0): Pose {
    st.t += dt; st.pt += dt;
    const threat = W.threat?.()?.pos ?? null;
    if (threat) st.threat = threat.clone();
    switch (st.mode) {
      case 'IDLE': modeIdle(dt); break;
      case 'WALK': modeWalk(dt); break;
      case 'FORAGE': modeForage(dt); break;
      case 'BURROW_ENTRY': modeEntry(dt); break;
      case 'BURROW_EXIT': modeExit(dt); break;
      case 'DEFEND': modeDefend(dt); break;
      case 'ESCAPE': modeEscape(dt); break;
    }
    // the burrow: down fast, up more slowly; mud gathers on the shell down there and dries off outside
    const rate = st.burrowGoal > st.burrow ? (speedGoal > 4 ? 3.2 : 1.6) : 1.1;
    st.burrow = st.burrow + clamp(st.burrowGoal - st.burrow, -rate * dt, rate * dt);
    if (st.burrow > 0.5) st.mudCoat = Math.min(0.75, st.mudCoat + dt * 0.04);
    else st.mudCoat = Math.max(0.08, st.mudCoat - dt * 0.004);
    integrate(dt);
    legs(dt, tier);
    writePose(dt);
    if (o.autonomous) api.think();
    return P;
  }

  /** speed and steering on the mud towards st.target (sideways), or holding still; true when there */
  function steer(dt: number, speedCW: number, turnRate: number, reach = 0.25): boolean {
    const tgt = st.target;
    let arrived = true;
    if (tgt) {
      const dx = tgt.x - st.pos.x, dz = tgt.z - st.pos.z, d = Math.hypot(dx, dz);
      arrived = d < CW * reach;
      if (!arrived) {
        const h = sidewaysHeading(dx, dz);
        st.heading += clamp(wrap(h - st.heading), -turnRate * dt, turnRate * dt);
        const want = speedCW * CW * clamp(d / (CW * 1.2), 0.3, 1);
        const sp = st.vel.length();
        const ns = ease(sp, want, dt, speedCW > 3 ? 8 : 4);
        // travel along the crab's own side, drifting towards the target as it turns
        leftOf(st.heading, tmp).multiplyScalar(st.lead);
        tmp2.set(dx / d, 0, dz / d);
        tmp.lerp(tmp2, 0.35).normalize();
        st.vel.copy(tmp).multiplyScalar(ns);
      }
    }
    if (arrived) st.vel.multiplyScalar(Math.exp(-dt * 10));
    return arrived;
  }

  function modeIdle(dt: number): void {
    steer(dt, 0, 2);
    // at the mouth it settles low beside the hole (B13, B18, A39)
    const mouth = st.phase === 'mouth';
    st.burrowGoal = 0;
    st.lift = ease(st.lift, (mouth ? LIFT.rest + 1 : LIFT.stand) * quirk.lift, dt, 2);
    if (st.t > st.dur) settled = true;
    // a leg now and then shifts its footing
    shuffleT -= dt;
    if (shuffleT <= 0) {
      shuffleT = 3 + 6 * rng();
      const f = feet[Math.floor(rng() * feet.length)];
      f.u = 0.0001; f.from.copy(f.planted);
      neutralFoot(f.leg, st.lift, quirk.spread * (0.95 + 0.1 * rng()), tmp); bodyToWorld(tmp, f.to); f.to.y = W.ground(f.to.x, f.to.z);
    }
  }

  function modeWalk(dt: number): void {
    const run = st.phase === 'run';
    const arrived = steer(dt, speedGoal, run ? 8 : 3.5);
    st.lift = ease(st.lift, (run ? LIFT.tall - 1 : LIFT.stand) * quirk.lift, dt, 4);
    if (arrived && st.vel.length() < CW * 0.1) { enter('IDLE', 'stand', 5); settled = true; }
    if (st.t > st.dur) { settled = true; st.target = null; }
  }

  function modeForage(dt: number): void {
    // scraping in place, then a short shuffle to the next patch of the surface film
    if (st.phase === 'scoop') {
      st.vel.multiplyScalar(Math.exp(-dt * 8));
      st.lift = ease(st.lift, (LIFT.stand - 1.5) * quirk.lift, dt, 2.5);
      scoopT += dt;
      if (st.pt > 2.5 + 3 * rng() * 0.3 && rng() < dt * 0.6) {
        const a = st.heading + (rng() < 0.5 ? 1 : -1) * Math.PI / 2 + (rng() - 0.5) * 0.6;
        st.target = clampTarget({ x: st.pos.x + Math.sin(a) * CW * (0.6 + rng()), z: st.pos.z + Math.cos(a) * CW * (0.6 + rng()) });
        phase('move');
      }
    } else {
      const arrived = steer(dt, 1.0 * quirk.pace, 2.5);
      st.lift = ease(st.lift, LIFT.stand * quirk.lift, dt, 3);
      if (arrived || st.pt > 3) { st.target = null; phase('scoop'); }
    }
    if (st.t > st.dur) settled = true;
  }

  function modeEntry(dt: number): void {
    if (!burrow) { api.idle(4); return; }
    switch (st.phase) {
      case 'approach': {
        st.burrowGoal = 0;
        const arrived = steer(dt, speedGoal, speedGoal > 4 ? 9 : 4, 0.15);
        st.lift = ease(st.lift, (speedGoal > 4 ? LIFT.tall - 1 : LIFT.stand) * quirk.lift, dt, 4);
        if (arrived || Math.hypot(burrow.x - st.pos.x, burrow.z - st.pos.z) < CW * 0.2) {
          // over the mouth: turn the leading side to the shaft's lean (it goes in sideways, B18, B45)
          phase('turn');
        }
        if (st.pt > 12) phase('turn');
        break;
      }
      case 'turn': {
        st.vel.multiplyScalar(Math.exp(-dt * 12));
        st.pos.x = ease(st.pos.x, burrow.x, dt, 6); st.pos.z = ease(st.pos.z, burrow.z, dt, 6);
        const hL = Math.atan2(Math.cos(burrow.az), -Math.sin(burrow.az));
        const h = Math.abs(wrap(hL - st.heading)) <= Math.PI / 2 ? hL : hL + Math.PI;
        st.lead = h === hL ? 1 : -1;
        st.heading += clamp(wrap(h - st.heading), -6 * dt, 6 * dt);
        if (Math.abs(wrap(h - st.heading)) < 0.15 || st.pt > 0.8) { phase('slide'); }
        break;
      }
      case 'slide':
        st.vel.set(0, 0, 0);
        st.burrowGoal = 1;
        if (st.burrow > 0.97) phase('in');
        break;
      case 'in':
        st.burrowGoal = 1;
        if (afterIn === 'exit' || st.t > st.dur) settled = true;
        break;
    }
  }

  function modeExit(dt: number): void {
    st.vel.set(0, 0, 0);
    switch (st.phase) {
      case 'rise':
        st.burrowGoal = PEEK;
        if (Math.abs(st.burrow - PEEK) < 0.02) phase('peek');
        break;
      case 'peek':
        // only the eyestalks out, turning; at a danger it drops back in
        st.burrowGoal = PEEK;
        if (st.threat && W.threat?.()) { api.enterBurrow(15 + 15 * rng(), true); return; }
        if (st.pt > st.dur) { phase('climb'); st.burrowGoal = 0; }
        break;
      case 'climb':
        st.burrowGoal = 0;
        st.lift = ease(st.lift, LIFT.stand * quirk.lift, dt, 3);
        if (st.burrow < 0.02) {
          plantAll();
          const q = queued;
          queued = null;
          if (q?.kind === 'walk' && q.target) api.walk(q.target, q.run);
          else if (q?.kind === 'forage') api.forage(q.secs);
          else { enter('IDLE', 'mouth', q?.secs ?? 3 + 3 * rng()); }
          settled = !q;
        }
        break;
    }
  }

  function modeDefend(dt: number): void {
    st.vel.multiplyScalar(Math.exp(-dt * 10));
    if (st.threat) {
      const h = Math.atan2(st.threat.x - st.pos.x, st.threat.z - st.pos.z);
      st.heading += clamp(wrap(h - st.heading), -4 * dt, 4 * dt);
    }
    st.lift = ease(st.lift, LIFT.tall * quirk.lift, dt, 5);
    if (st.phase === 'rise' && st.pt > 0.4) phase('display');
    waveT -= dt;
    if (waveT <= 0) waveT = 1.0 + 1.5 * rng();
    if (st.t > st.dur) settled = true;
  }

  function modeEscape(dt: number): void {
    const home2 = st.phase === 'home';
    const arrived = steer(dt, speedGoal, 9, home2 ? 0.15 : 0.25);
    st.lift = ease(st.lift, (LIFT.tall - 1) * quirk.lift, dt, 6);
    if (home2 && burrow) {
      if (arrived || Math.hypot(burrow.x - st.pos.x, burrow.z - st.pos.z) < CW * 0.25 || st.t > 8) {
        const stay = st.dur;
        enter('BURROW_ENTRY', 'turn', stay);
        afterIn = 'stay';
      }
      return;
    }
    if (arrived || st.t > st.dur) {
      api.idle(3 + 4 * rng());
      settled = true;
    }
  }

  /** move the body along the mud; at and in the burrow it is held at the mouth */
  function integrate(dt: number): void {
    if (st.burrow > 0.02 && burrow) {
      st.pos.x = ease(st.pos.x, burrow.x, dt, 8); st.pos.z = ease(st.pos.z, burrow.z, dt, 8);
      st.vel.set(0, 0, 0);
    } else {
      st.pos.x += st.vel.x * dt;
      st.pos.z += st.vel.z * dt;
    }
    const b = W.bounds?.();
    if (b) { const m = CW * 0.7; st.pos.x = clamp(st.pos.x, b.minX + m, b.maxX - m); st.pos.z = clamp(st.pos.z, b.minZ + m, b.maxZ - m); }
    st.pos.y = W.ground(st.pos.x, st.pos.z);
    // the body follows the mud's slope on its legs (and rears to defend)
    const e = CW * 0.5;
    const f = fwdOf(st.heading, tmp), l = leftOf(st.heading, tmp2);
    const gF = W.ground(st.pos.x + f.x * e, st.pos.z + f.z * e), gB = W.ground(st.pos.x - f.x * e, st.pos.z - f.z * e);
    const gL = W.ground(st.pos.x + l.x * e, st.pos.z + l.z * e), gR = W.ground(st.pos.x - l.x * e, st.pos.z - l.z * e);
    let pitch = Math.atan2(gF - gB, 2 * e);
    let roll = Math.atan2(gL - gR, 2 * e);
    if (st.mode === 'DEFEND') pitch += 0.14;
    if (st.mode === 'WALK' || st.mode === 'ESCAPE' || (st.mode === 'BURROW_ENTRY' && st.phase === 'approach')) roll += 0.06 * st.lead * clamp(st.vel.length() / (CW * 4), 0, 1);
    st.pitch = ease(st.pitch, pitch, dt, 5);
    st.roll = ease(st.roll, roll, dt, 5);
  }

  // ------------------------------------------------------------ legs

  const _b = new Vector3(), _w = new Vector3();
  function legs(dt: number, tier: 0 | 1 | 2): void {
    const inHole = st.burrow > 0.05;
    onMud = inHole ? 0 : onMud + dt;
    const sp = st.vel.length() / CW;   // CW/s
    const lowDetail = tier === 2;
    if (!inHole) {
      // the gait: a stride per ≈ 0.35 CW (longer running); the phase also turns slowly to bring a stretched leg in
      const stride = 0.24 + 0.2 * clamp(sp / 5, 0, 1);
      const freq = clamp(sp / stride, 0, 9);
      let need = 0;
      for (const ft of feet) {
        neutralFoot(ft.leg, st.lift, quirk.spread, _b);
        bodyToWorld(_b, _w);
        need = Math.max(need, Math.hypot(_w.x - ft.planted.x, _w.z - ft.planted.z) / CW, ft.miss > 1.5 ? 1 : 0);
      }
      const shuffle = need > 0.14 ? 2.4 : 0;
      st.gait = (st.gait + dt * Math.max(freq, shuffle)) % 1;
      const duty = sp > 3 ? 0.5 : 0.62;
      const swing = 1 - duty;
      for (const ft of feet) {
        // the group's swing window: group 0 starts at 0, group 1 half a cycle later
        const ph = (st.gait - ft.group * 0.5 + 1) % 1;
        const inSwing = ph < swing && (freq > 0.05 || shuffle > 0);
        // (a leg stretched past its reach steps at once, whatever the gait's window: it never drags or digs in)
        if ((inSwing || ft.miss > 0.8) && ft.u >= 1) {
          // lift off: aim where the neutral foot will be half a stance from now
          ft.from.copy(ft.planted);
          neutralFoot(ft.leg, st.lift, quirk.spread, _b);
          bodyToWorld(_b, ft.to);
          const ahead = (duty / Math.max(0.3, freq)) * 0.5 + swing / Math.max(0.3, freq);
          ft.to.addScaledVector(st.vel, Math.min(ahead, 0.5));
          ft.to.y = W.ground(ft.to.x, ft.to.z);
          ft.u = 0;
        }
        if (ft.u < 1) {
          const rate = freq > 0.05 ? freq / swing : 2.8;
          ft.u = Math.min(1, ft.u + dt * Math.max(rate, 1.4));
          const k = smooth(ft.u);
          ft.planted.lerpVectors(ft.from, ft.to, k);
          // the foot follows the mud under it and clears it by an arc
          ft.planted.y = W.ground(ft.planted.x, ft.planted.z) + Math.sin(Math.PI * ft.u) * CW * (0.1 + 0.06 * clamp(sp / 4, 0, 1));
          if (ft.u >= 1) { ft.planted.copy(ft.to); ft.planted.y = W.ground(ft.to.x, ft.to.z); }
        }
      }
    }
    const mode: DistalMode = tier === 0 ? 'full' : 'lod1';
    for (const leg of rig.legs) {
      const key = legKey(leg.id, leg.side);
      const G = goal[key];
      const cur = P.legs[key];
      if (isWalking(leg.id)) {
        if (inHole) {
          // drawn in against the body (the slide down the shaft), the dactyli gripping the walls
          copyLeg(cur, G);
          const k = smooth((st.burrow - 0.05) / 0.4);
          blendLeg(G, { promo: 0, lev: 0.95, mcYaw: 0, mc: -2.1, cp: -0.45, pd: -0.7 }, k, G);
        } else if (!lowDetail) {
          const ft = feet.find((f) => f.leg === leg)!;
          worldToBody(ft.planted, _b);
          copyLeg(cur, G);
          ft.miss = solveLeg(leg, ft.PL, _b, DACTYL_ANGLE, G, tier === 1 && leg.id === 'P5' ? 'stiff' : mode);
        } else {
          // far away: the neutral stance with the gait's swing drawn on it (no IK)
          neutralFoot(leg, st.lift, quirk.spread, _b);
          copyLeg(cur, G);
          solveLeg(leg, planarOf(leg), _b, DACTYL_ANGLE, G, 'lod1');
          const ft = feet.find((f) => f.leg === leg)!;
          const ph = (st.gait - ft.group * 0.5 + 1) % 1;
          const up = ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI) : 0;
          G.lev += 0.3 * up * clamp(sp, 0, 1);
          G.promo += 0.18 * Math.cos(ph * TAU) * clamp(sp, 0, 1) * leg.sg * st.lead;
        }
      } else cheliped(leg, G, cur);
    }
    // blend the legs towards their goals (IK'd walking legs follow their feet directly)
    const k = st.mode === 'ESCAPE' || st.mode === 'DEFEND' || st.burrowGoal > st.burrow + 0.1 ? 16 : 8;
    for (const leg of rig.legs) {
      const key = legKey(leg.id, leg.side);
      const G = goal[key], cur = P.legs[key];
      // (IK'd legs on the mud follow their feet exactly, once they have blended in from the folded pose)
      const direct = isWalking(leg.id) && !inHole && !lowDetail;
      if (direct && onMud > 0.4) { copyLeg(G, cur); continue; }
      const kk = direct ? 12 : leg.id === 'P1' && (st.mode === 'DEFEND' || st.mode === 'FORAGE') ? 14 : k;
      for (const j of ['promo', 'pitch', 'lev', 'roll', 'meYaw', 'mcYaw', 'mc', 'cp', 'cpRoll', 'cpYaw', 'pd'] as const) cur[j] = ease(cur[j], G[j], dt, kk);
    }
  }

  const STAND = male ? CHELA_STAND : CHELA_STAND_F;
  const REST = male ? CHELA_STAND : CHELA_FOLDED;
  /** the claws: before the face standing, scraping the mud's film feeding, raised and open in display, tucked to go down the burrow */
  function cheliped(leg: LegRig, G: LegPose, cur: LegPose): void {
    copyLeg(cur, G);
    const i = leg.side === 'L' ? 0 : 1;
    const add = (d: Partial4) => { for (const k of Object.keys(d) as (keyof LegPose)[]) G[k] += d[k]!; };
    switch (st.mode) {
      case 'IDLE': blendLeg(G, st.phase === 'mouth' ? REST : STAND, 1, G); break;
      case 'WALK': case 'ESCAPE':
        blendLeg(G, STAND, 1, G);
        // carried clear of the mud while it runs
        add({ lev: 0.12, mc: 0.08 });
        break;
      case 'BURROW_ENTRY': case 'BURROW_EXIT': {
        blendLeg(G, STAND, 1, G);
        const k = smooth((st.burrow - 0.3) / 0.4);
        // drawn up against the front as it goes down (the arms fold, the claws close)
        add({ lev: 0.3 * k, mc: 0.3 * k, promo: -0.3 * k });
        if (st.mode === 'BURROW_ENTRY' && st.phase === 'approach') add({ lev: 0.12 * clamp(speedGoal / 4, 0, 1) });
        break;
      }
      case 'DEFEND': {
        blendLeg(G, CHELA_RAISED, smooth(st.phase === 'rise' ? st.pt / 0.4 : 1), G);
        G.promo += 0.07 * Math.sin(st.t * 2.4 + i * 1.3);
        G.lev += 0.06 * Math.sin(st.t * 1.7 + i);
        // the claws' up-and-down jerks at the danger
        const jerk = waveT < 0.3 ? Math.sin((waveT / 0.3) * Math.PI) : 0;
        G.lev += 0.25 * jerk;
        G.pd = 0.38 + 0.05 * Math.sin(st.t * 5 + i);
        break;
      }
      case 'FORAGE': {
        blendLeg(G, STAND, 1, G);
        if (st.phase === 'scoop') {
          // the claws take turns: down and open on the mud, close on the film, up to the mouth
          const cyc = male ? 1.4 : 1.0, ph = (scoopT / cyc) % 1;
          const active = Math.floor(scoopT / cyc) % 2 === i;
          if (active) {
            const down = ph < 0.35 ? smooth(ph / 0.35) : ph < 0.5 ? 1 : 1 - smooth((ph - 0.5) / 0.3);
            const up = ph > 0.55 ? Math.sin(((ph - 0.55) / 0.45) * Math.PI) : 0;
            add({ lev: -0.12 * down + 0.3 * up, mc: -0.12 * down + 0.25 * up, promo: 0.12 * down + 0.15 * up, cpYaw: 0.25 * up });
            G.pd = ph < 0.3 ? 0.3 : ph < 0.45 ? 0.02 : 0.04;
          }
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------ the pose

  const _ax = new Vector3();
  /** the shaft's axis (down, world) for the burrow's lean */
  function shaftDir(out: Vector3): Vector3 {
    const s = Math.sin(SHAFT_TILT), c = Math.cos(SHAFT_TILT);
    return out.set(-s * Math.sin(burrow!.az), -c, -s * Math.cos(burrow!.az));
  }

  function writePose(dt: number): void {
    P.pos.copy(st.pos);
    P.heading = st.heading;
    P.lift = st.lift;
    P.pitch = st.pitch;
    P.roll = st.roll;
    const b = st.burrow;
    if (b > 0.001 && burrow) {
      // sinking at the mouth until only the eyestalks are out, then sliding down the slanting shaft with the leading
      // side first (the body rolled onto its side along the shaft)
      const k1 = smooth(b / PEEK), k2 = smooth((b - PEEK) / (1 - PEEK));
      P.lift = st.lift + (PEEK_LIFT - st.lift) * k1;
      P.pos.y = W.ground(burrow.x, burrow.z);
      if (k2 > 0) P.pos.addScaledVector(shaftDir(_ax), DEPTH * MM * k2);
      P.roll = st.roll * (1 - k1) - st.lead * (Math.PI / 2 - SHAFT_TILT) * 0.85 * k2;
      P.pitch = st.pitch * (1 - k1);
    }
    // the bob of the gait (the body rises a little as each group takes the weight)
    if (b < 0.05 && (st.mode === 'WALK' || st.mode === 'ESCAPE' || (st.mode === 'FORAGE' && st.phase === 'move') || (st.mode === 'BURROW_ENTRY' && st.phase === 'approach'))) {
      P.lift += 0.45 * Math.cos(st.gait * TAU * 2);
    }
    // the eyestalks: upright and turning in quick jumps between held gazes (each its own), towards the danger when
    // there is one; folded into the orbits only once the body is going down the shaft (they are the last thing in
    // and the first out), and when it is grabbed or rearing they stay up
    for (let i = 0; i < 2; i++) {
      eyeHold[i] -= dt;
      if (eyeHold[i] <= 0) {
        eyeHold[i] = (0.4 + 2.0 * rng()) * (st.threat ? 0.5 : 1);
        eyeGoal[i] = (rng() - 0.5) * 0.35;
        if (i === 0 && rng() < 0.5) { eyeHold[1] = eyeHold[0]; eyeGoal[1] = -eyeGoal[0] + (rng() - 0.5) * 0.1; }
      }
      const fold = smooth((b - PEEK - 0.25) / 0.3);
      P.eyeRaise[i] = ease(P.eyeRaise[i], 1 - fold, dt, 12);
      let lean = eyeGoal[i];
      if (st.threat && b < 0.6) {
        const h = Math.atan2(st.threat.x - st.pos.x, st.threat.z - st.pos.z);
        lean = clamp(wrap(h - st.heading), -1, 1) * 0.15 * (i === 0 ? 1 : -1);
      }
      P.eyeLean[i] = ease(P.eyeLean[i], lean, dt, 20);
    }
    // the third maxillipeds: sorting the mud while it feeds, a slow flutter otherwise
    const eating = st.mode === 'FORAGE' && st.phase === 'scoop';
    P.mxp = eating ? 0.5 + 0.5 * Math.sin(st.t * 13) : 0.05 + 0.04 * Math.sin(st.t * 2.7);
    P.burrow = st.burrow;
    P.mudCoat = st.mudCoat;
  }

  if (o.startInBurrow && burrow) {
    st.mode = 'BURROW_ENTRY'; st.phase = 'in'; st.burrow = st.burrowGoal = 1; st.dur = 10 + 30 * rng(); st.mudCoat = 0.5;
    st.pos.set(burrow.x, W.ground(burrow.x, burrow.z), burrow.z);
    st.heading = Math.atan2(Math.cos(burrow.az), -Math.sin(burrow.az));
  }
  plantAll();
  // settle the legs on the ground at once
  for (let i = 0; i < 30; i++) update(1 / 30);
  return api;
}

export type { LegId };
