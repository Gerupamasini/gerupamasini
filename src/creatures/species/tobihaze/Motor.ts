import { Matrix4, Quaternion, Vector3, type Bone, type Mesh, type Object3D } from 'three';
import { computePose, defaultPose, swimMidline, bendFromMidline, SPINE, MORPHS, type Pose, type Quat } from './pose.js';
import type { MudFx } from '../../../world/MudFx';

/**
 * The トビハゼ's body: how it stands, crawls, hops, swims, strikes, dives into its burrow and rolls in a puddle, and how
 * its fins, trunk, tail and eyes move while it does. Everything is procedural; the numbers come from the literature:
 *
 * - Crutching (Harris 1960; Pace & Gibb 2009): both pectoral fins move together. They are planted ahead of the shoulder,
 *   then pushed back while the body is lifted and vaulted forward over them (push ≈ 45 % of the cycle); in the recovery
 *   the body rests on the pelvic fins and the belly while the pectorals swing forward again. ~2.1 strokes/s, each
 *   ≈ 27 % of the total length. The wrist joint opens from ~100° to ~167° during the push. The trunk is held stiff and
 *   the tail drags as a skid on level ground; on soft mud, slopes and when hurried the tail adds a lateral thrust at the
 *   end of the push (McInroe et al. 2016; very wet mud: tail thrusts).
 * - The escape jump (Swanson & Gibb 2004): the body curls into a J with the tail beside the head (sharpest bend two
 *   thirds down the body, ~60 ms on land), then straightens; the tail presses the ground and the fish leaves at
 *   27–59° roughly in the direction it faced. Field hops of P. modestus cover a few body lengths (Choi et al. 2025).
 * - Swimming: axial undulation; slow swimming adds pectoral paddling. At the surface the eyes stay above water.
 * - Feeding on land (Sponder & Lauder 1981; Michel et al. 2014, 2015): the head pivots down over the prey on the propped
 *   pectorals, the lower jaw swings wide open as the mouth meets the prey, then closes; the mouth water is pushed out
 *   and sucked back (cheeks pump).
 * - Blinking (Aiello et al. 2023): the eye is pulled down into the orbit while the dermal cup rises over it; ~0.56 s,
 *   the cup fully up at 35 % of the blink; more often when the air is drying.
 */
export interface TobiRig {
  tlMM: number;
  slMM: number;
  s0MM: number;
  spine: [string, number][];
  eyeRetract_m: number;
  eyeRadius_m: number;
  pec: { base: number[]; wrist: number[]; dir: number[]; width: number[]; normal: number[]; armLen_m: number; handLen_m: number };
  contacts: { pelvicY_m: number; bellyY: [string, number][] };
}

export interface MotorWorld {
  ground(x: number, z: number): number;
  water(x: number, z: number): number;
  fx: MudFx | null;
  /** wetness of the ground here 0..1 */
  wetGround: number;
  /** softness of the substrate 0..1 (mud 1, sand 0.3) */
  soft: number;
  sand: boolean;
  /** how strongly sun and air dry the skin 0..1 */
  drying: number;
  /** full detail: pectoral IK, eye tracking, prints in the mud */
  detail: boolean;
}

export type Medium = 'land' | 'shallow' | 'water';
export type Gait = 'stand' | 'crawl' | 'swim' | 'hop' | 'strike' | 'dive' | 'hidden' | 'emerge' | 'roll';
export type Posture = 'prop' | 'low' | 'alert' | 'display';

interface Fin {
  side: 1 | -1;
  planted: boolean;
  /** where the wrist is put down (on the mud) */
  contact: Vector3;
  from: Vector3;
  to: Vector3;
  /** heading (world yaw) of the web's middle ray, laid on the mud back and out from the wrist */
  yaw: number;
  yawFrom: number;
  yawTo: number;
  swing: number;
  swingDur: number;
  ik: number;
}

interface Eye {
  yaw: number;
  pitch: number;
  vy: number;
  vp: number;
  tYaw: number;
  tPitch: number;
  nextSac: number;
  scanYaw: number;
  scanPitch: number;
  retract: number;
  cup: number;
  blinkT: number;
  blinkDur: number;
}

class Spring {
  v = 0;
  constructor(public x = 0) {}
  to(target: number, omega: number, dt: number): number {
    const f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo;
    const inv = 1 / (f + hhoo);
    const x = (f * this.x + dt * this.v + hhoo * target) * inv;
    this.v = (this.v + hoo * (target - this.x)) * inv;
    this.x = x;
    return x;
  }
}

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a: number) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const ease = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const G = 9.81;
/** smooth 1D value noise in [-1, 1] (idle sway, gaze drift) */
function noise1(t: number, seed: number): number {
  const i = Math.floor(t), f = t - i;
  const h = (n: number) => { const x = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

/** posterior joints in chain order (each bends the body behind it) */
const CHAIN = SPINE.slice(1).map(([n]) => n);
/** J-curl profile of the escape jump: the sharpest bend two thirds down the body */
const CURL: Record<string, number> = { J_root: 0.1, J_sp1: 0.16, J_sp2: 0.22, J_sp3: 0.28, J_sp4: 0.34, J_sp5: 0.38, J_sp6: 0.36, J_sp7: 0.28, J_sp8: 0.18, J_caudal: 0.1, J_caudal2: 0.06 };

export class Motor {
  readonly L: number;
  readonly scale: number;
  readonly pos = new Vector3();
  heading = 0;
  pitch = 0;
  roll = 0;
  readonly vel = new Vector3();
  medium: Medium = 'land';
  groundY = 0;
  waterY = -100;
  depth = -1;
  gait: Gait = 'stand';
  gaitT = 0;
  /** the last command is finished */
  done = true;
  posture: Posture = 'prop';
  /** skin moisture 0..1 and mud coat 0..1 */
  moisture = 1;
  mud = 0;
  /** what the eyes attend to */
  readonly attend = { threat: null as Vector3 | null, prey: null as Vector3 | null, alert: 0, player: null as Vector3 | null };
  onEvent: (id: string) => void = () => {};
  /** hide while inside the burrow */
  hidden = false;

  private readonly rig: TobiRig;
  private readonly root: Object3D;
  private readonly bones: Record<string, Bone>;
  private readonly morphMeshes: { mesh: Mesh; names: string[] }[] = [];
  private readonly pose: Pose = defaultPose();
  private target: Vector3 | null = null;
  private speed = 0;
  urgency = 0;
  private phase = 0;
  private stroke: { p0: Vector3; h0: number; h1: number; len: number; tail: number; side: number; marked: boolean; settled: boolean; swingSet: boolean } | null = null;
  readonly fins: [Fin, Fin];
  private readonly lift = new Spring(0.003);
  private readonly pitchS = new Spring(0);
  private readonly rollS = new Spring(0);
  private readonly headPitch = new Spring(0.1);
  private readonly headYaw = new Spring(0);
  private readonly d1 = new Spring(0.85);
  private readonly d2 = new Spring(0.5);
  private readonly anal = new Spring(0.5);
  private readonly caud = new Spring(0.3);
  private readonly pelvic = new Spring(0.2);
  private readonly pelvicFold = new Spring(0);
  private readonly jaw = new Spring(0);
  private readonly breathe = new Spring(0);
  private readonly bend: Record<string, Spring> = {};
  private readonly finFold: [Spring, Spring] = [new Spring(0.3), new Spring(0.3)];
  private readonly ikW = new Spring(1);
  private bendT: Record<string, number> = {};
  private liftT = 0.003;
  private pitchT = 0;
  private rollT = 0;
  private headPitchT = 0.1;
  private headYawT = 0;
  private finMode: 'plant' | 'fold' | 'paddle' = 'plant';
  private swimPhase = 0;
  private swimY = new Spring(0);
  private rippleAcc = 0;
  private breathPhase = 0;
  private t = 0;
  // hop
  private hop = { stage: 'prep' as 'prep' | 'launch' | 'air' | 'land', t: 0, h0: 0, turn: 0, dist: 0, side: 1, prep: 0.09, skips: 0, angle: 0.75, carry: 0 };
  // strike
  private strike = { stage: 'aim' as 'aim' | 'lunge' | 'bite' | 'chew', t: 0, aim: 0.4, p: new Vector3(), p0: new Vector3(), len: 0, chew: 1, graze: 0 };
  // burrow path
  private path = { hole: new Vector3(), dir: 0, slope: 1.15, u: 0, u0: 0, u1: 0, t: 0, dur: 1, stage: 'go' as 'go' | 'peek' | 'out', out: false };
  // roll
  private rollSide = 1;
  // eyes
  readonly eyes: [Eye, Eye];
  private nextBlink = 3;
  private seed = 0;
  // geometry
  private readonly segLen: number[] = [];
  private readonly belly: number[] = [];
  private readonly distBack: number[] = [];
  private readonly rest: Record<string, Vector3> = {};
  private readonly eyeAxis: [Vector3, Vector3];
  private readonly H: number;
  /** water deeper than this (~0.26 TL) floats it: in a shallower puddle it sits propped on its fins, eyes out */
  private readonly Hswim: number;
  private readonly eyeTop: number;
  // scratch
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly v3 = new Vector3();
  private readonly q1 = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly m1 = new Matrix4();
  private readonly m2 = new Matrix4();

  constructor(root: Object3D, bones: Record<string, Bone>, meshes: Mesh[], rig: TobiRig, scale: number, heading: number, private readonly rnd: () => number = Math.random) {
    this.root = root;
    this.bones = bones;
    this.rig = rig;
    this.scale = scale;
    this.L = (rig.tlMM / 1000) * scale;
    this.H = 0.145 * this.L;
    this.Hswim = 0.19 * this.L;
    this.eyeTop = 0.17 * this.L;
    this.heading = heading;
    for (const [n] of SPINE) { this.bend[n] = new Spring(0); this.bendT[n] = 0; }
    for (const [name, b] of Object.entries(bones)) this.rest[name] = b.position.clone();
    // object-space rest positions (the root has an identity transform while the driver attaches)
    root.updateMatrixWorld(true);
    const restObj: Record<string, Vector3> = {};
    for (const [name, b] of Object.entries(bones)) restObj[name] = root.worldToLocal(b.getWorldPosition(new Vector3()));
    // body geometry along the chain (metres at this scale)
    const sOf = Object.fromEntries(rig.spine);
    const bellyOf = Object.fromEntries(rig.contacts.bellyY);
    let acc = 0;
    for (let k = 0; k < CHAIN.length; k++) {
      const n = CHAIN[k];
      const prev = k === 0 ? null : CHAIN[k - 1];
      const len = prev ? ((sOf[n] - sOf[prev]) / 1000) * scale : 0;
      acc += len;
      this.segLen.push(len);
      this.distBack.push(acc);
      const jy = restObj[n] ? restObj[n].y : 0;
      this.belly.push(Math.max(0, (jy - (bellyOf[n] ?? 0)) * scale));
    }
    for (const m of meshes) {
      if (!m.morphTargetDictionary) continue;
      const key = MORPHS[m.name] ? m.name : MORPHS[m.parent?.name ?? ''] ? m.parent!.name : null;
      if (key) this.morphMeshes.push({ mesh: m, names: MORPHS[key] });
    }
    const axis = (name: string) => {
      let eye: Object3D | undefined;
      bones[name]?.traverse((o) => { if (!eye && o !== bones[name] && (o as Mesh).isMesh) eye = o; });
      return new Vector3(0, 0, 1).applyQuaternion(eye ? eye.quaternion : new Quaternion());
    };
    this.eyeAxis = [axis('J_eyeL'), axis('J_eyeR')];
    const mkFin = (side: 1 | -1): Fin => ({ side, planted: false, contact: new Vector3(), from: new Vector3(), to: new Vector3(), yaw: 0, yawFrom: 0, yawTo: 0, swing: -1, swingDur: 0.25, ik: 1 });
    this.fins = [mkFin(1), mkFin(-1)];
    const mkEye = (): Eye => ({ yaw: 0, pitch: 0, vy: 0, vp: 0, tYaw: 0, tPitch: 0, nextSac: this.rnd() * 2, scanYaw: 0, scanPitch: 0, retract: 0, cup: 0, blinkT: -1, blinkDur: 0.56 });
    this.eyes = [mkEye(), mkEye()];
    this.seed = Math.floor(this.rnd() * 1000);
  }

  // ------------------------------------------------------------------------------------------------ commands
  place(x: number, z: number, heading: number, w: MotorWorld): void {
    this.pos.set(x, w.ground(x, z), z);
    this.heading = heading;
    this.sense(w);
    if (this.medium === 'water') { this.gait = 'swim'; this.target = null; this.speed = 0; this.swimY.x = this.swimTargetY(); this.pos.y = this.swimY.x; }
    else this.gait = 'stand';
    this.plantRest(true, w);
    this.done = true;
  }

  stand(posture: Posture = 'prop'): void {
    this.posture = posture;
    if (this.gait === 'hidden' || this.gait === 'dive' || this.gait === 'emerge') return;
    if (this.gait === 'swim' && this.medium === 'water') { this.target = null; this.speed = 0; this.done = true; return; }
    if (this.gait !== 'stand') this.setGait('stand');
    this.done = true;
  }

  /** travel toward a point: crawl on land and in shallow water, swim in deeper water */
  travel(target: Vector3, speed: number, urgency: number): void {
    this.target = (this.target ?? new Vector3()).copy(target);
    this.speed = speed;
    this.urgency = urgency;
    this.done = false;
    if (this.gait === 'hop' || this.gait === 'strike' || this.gait === 'dive' || this.gait === 'hidden' || this.gait === 'emerge' || this.gait === 'roll') return;
    this.chooseTravelGait();
  }

  hopToward(dir: number, dist: number, skips = 0): void {
    this.setGait('hop');
    const h = this.hop;
    h.stage = 'prep'; h.t = 0; h.h0 = this.heading; h.turn = wrap(dir - this.heading);
    h.dist = dist; h.skips = skips;
    h.side = Math.abs(h.turn) > 0.2 ? Math.sign(h.turn) : this.rnd() < 0.5 ? 1 : -1;
    h.prep = 0.07 + 0.08 * Math.abs(h.turn) / Math.PI;
    h.angle = 0.62 + this.rnd() * 0.25;
    this.done = false;
  }

  strikeAt(p: Vector3, graze = false): void {
    this.setGait('strike');
    const s = this.strike;
    s.stage = 'aim'; s.t = 0; s.p.copy(p); s.aim = 0.25 + this.rnd() * 0.7; s.chew = 0.6 + this.rnd() * 0.9; s.graze = graze ? 3 : 0;
    this.done = false;
  }

  /** dive head first into a burrow opening (the animal should stand just in front of it, facing it) */
  diveInto(hole: Vector3): void {
    this.setGait('dive');
    const P = this.path;
    P.hole.copy(hole);
    P.dir = Math.atan2(hole.x - this.pos.x, hole.z - this.pos.z);
    P.u0 = -Math.hypot(hole.x - this.pos.x, hole.z - this.pos.z);
    P.u1 = 0.82 * this.L + 0.01;
    P.u = P.u0; P.t = 0; P.dur = 0.75 + 0.4 * this.rnd(); P.out = false; P.stage = 'go';
    this.heading = P.dir;
    this.done = false;
  }

  /** come back up the burrow: first peek (head out, eyes above the rim), then optionally climb out */
  emergeFrom(hole: Vector3, dir: number, peekOnly: boolean): void {
    this.setGait('emerge');
    const P = this.path;
    P.hole.copy(hole); P.dir = dir; P.out = true;
    P.u0 = -0.95 * this.L; P.u1 = -0.07 * this.L; P.u = P.u0; P.t = 0; P.dur = 0.9; P.stage = 'go';
    this.heading = dir;
    this.hidden = false;
    this.pathPeekOnly = peekOnly;
    this.done = false;
  }
  private pathPeekOnly = false;

  /** leave the peek and climb out */
  climbOut(): void {
    if (this.gait !== 'emerge') return;
    const P = this.path;
    P.stage = 'out'; P.u0 = P.u; P.u1 = 0.3 * this.L; P.t = 0; P.dur = 0.5;
    this.pathPeekOnly = false;
    this.done = false;
  }

  /** roll onto the side and back in a puddle or shallow water to wet the skin */
  rollOver(): void {
    this.setGait('roll');
    this.rollSide = this.rnd() < 0.5 ? 1 : -1;
    this.done = false;
  }

  reflexBlink(): void {
    for (const e of this.eyes) if (e.blinkT < 0) { e.blinkT = 0; e.blinkDur = 0.36; }
  }

  get inBurrow(): boolean { return this.gait === 'hidden' || (this.gait === 'emerge' && this.path.u < 0) || this.gait === 'dive'; }
  get peeking(): boolean { return this.gait === 'emerge' && this.path.stage === 'peek'; }
  get mouthOpen(): number { return clamp(this.jaw.x / 0.9, 0, 1); }

  private setGait(g: Gait): void {
    if (g !== this.gait) {
      if (this.gait === 'roll') this.rollT = 0;   // a roll cut short: back onto the belly
      this.gait = g; this.gaitT = 0;
      if (g === 'crawl' || g === 'swim') this.onEvent(g);
    }
    if (g === 'crawl') { this.phase = 0.45; this.stroke = null; }
  }

  private chooseTravelGait(): void {
    if (this.medium === 'water') { if (this.gait !== 'swim') this.setGait('swim'); }
    else if (this.gait !== 'crawl') this.setGait('crawl');
  }

  // ------------------------------------------------------------------------------------------------ update
  update(dt: number, w: MotorWorld): void {
    dt = Math.min(dt, 0.25);
    if (dt <= 0) return;
    this.groundFn = w.ground;
    // far animals are updated every 2nd or 4th frame with a longer step: the gait runs in sub-steps of at most
    // 50 ms so they keep their real pace, the skeleton is posed once (its springs are implicit and stable)
    const n = Math.ceil(dt / 0.05 - 1e-6), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.t += h;
      this.gaitT += h;
      this.sense(w);
      for (const c of CHAIN) this.bendT[c] = 0;
      this.bendT.J_head = 0;
      switch (this.gait) {
        case 'stand': this.doStand(h, w); break;
        case 'crawl': this.doCrawl(h, w); break;
        case 'swim': this.doSwim(h, w); break;
        case 'hop': this.doHop(h, w); break;
        case 'strike': this.doStrike(h, w); break;
        case 'dive': case 'emerge': case 'hidden': this.doBurrow(h, w); break;
        case 'roll': this.doRoll(h, w); break;
      }
      this.doSkin(h, w);
      this.doBreath(h);
    }
    this.solve(dt, w);
  }

  private sense(w: MotorWorld): void {
    this.groundY = w.ground(this.pos.x, this.pos.z);
    this.waterY = w.water(this.pos.x, this.pos.z);
    this.depth = this.waterY - this.groundY;
    const H = this.H, Hs = this.Hswim;
    // hysteresis between the media so the gait does not flicker at the edge
    const d = this.depth;
    if (this.medium === 'land') { if (d > 0.35 * H) this.medium = d > 1.35 * Hs ? 'water' : 'shallow'; }
    else if (this.medium === 'shallow') { if (d < 0.2 * H) this.medium = 'land'; else if (d > 1.35 * Hs) this.medium = 'water'; }
    else if (d < 1.15 * Hs) this.medium = d < 0.2 * H ? 'land' : 'shallow';
  }

  private fwd(h = this.heading, out = this.v1): Vector3 { return out.set(Math.sin(h), 0, Math.cos(h)); }
  private left(h = this.heading, out = this.v2): Vector3 { return out.set(Math.cos(h), 0, -Math.sin(h)); }

  /** where a pectoral wrist is put down: ahead of / behind the shoulder (fraction of L) and out to the side */
  private plantPoint(side: number, fwdOff: number, latOff: number, out: Vector3, w: MotorWorld, h = this.heading): Vector3 {
    const L = this.L;
    const f = this.fwd(h, this.v1), l = this.left(h, this.v2);
    out.set(this.pos.x + f.x * fwdOff * L + l.x * side * latOff * L, 0, this.pos.z + f.z * fwdOff * L + l.z * side * latOff * L);
    out.y = w.ground(out.x, out.z);
    return out;
  }

  /**
   * world yaw of a planted web's middle ray: out to the side and swept back by `back` rad (the web lies on the mud
   * behind the wrist, its leading rays forward, its trailing rays along the flank)
   */
  private webYaw(side: number, back: number, h = this.heading): number {
    // heading h faces +Z at 0; the fish's left is h + π/2
    return h + side * (Math.PI / 2 + back);
  }

  /** the resting stance per posture: wrist position (forward, out; fractions of L) and the web's sweep */
  private stance(): { fwd: number; lat: number; back: number } {
    switch (this.posture) {
      case 'low': return { fwd: -0.015, lat: 0.085, back: 1.1 };
      case 'alert': return { fwd: 0.012, lat: 0.07, back: 0.95 };
      case 'display': return { fwd: 0.012, lat: 0.075, back: 0.9 };
      default: return { fwd: 0.0, lat: 0.075, back: 1.0 };
    }
  }

  private propHeight(): number {
    const L = this.L;
    // propped on the pectorals the chest rides well clear of the mud (photographs of resting and alert animals);
    // alert and displaying, it stands tall on near-vertical fins
    switch (this.posture) {
      case 'low': return 0.006 * L;
      case 'alert': return 0.085 * L;
      case 'display': return 0.09 * L;
      default: return 0.045 * L;
    }
  }

  /** pelvic disc angle (pose units, + down) that just reaches the mud from the root's height above it */
  private pelvicReach(lift: number): number {
    const len = 0.104 * this.L, base = 0.0003 * this.scale;
    return clamp(Math.asin(clamp((lift + base) / len, 0, 0.97)) - 0.31, -0.2, 1.05);
  }

  /** put both fins down at the resting stance (instantly, or as small steps) */
  private plantRest(instant: boolean, w: MotorWorld): void {
    const st = this.stance();
    for (const f of this.fins) {
      this.plantPoint(f.side, st.fwd, st.lat, this.v3, w);
      const yaw = this.webYaw(f.side, st.back);
      if (instant || !f.planted) { f.contact.copy(this.v3); f.yaw = yaw; f.planted = true; f.swing = -1; }
      else if ((f.contact.distanceTo(this.v3) > 0.03 * this.L || Math.abs(wrap(yaw - f.yaw)) > 0.35) && f.swing < 0) {
        f.from.copy(f.contact); f.to.copy(this.v3); f.yawFrom = f.yaw; f.yawTo = f.yaw + wrap(yaw - f.yaw);
        f.swing = 0; f.swingDur = 0.22 + this.rnd() * 0.1; f.planted = false;
      }
    }
  }

  private stepFins(dt: number, w: MotorWorld, lift: number): void {
    for (const f of this.fins) {
      if (f.swing < 0) continue;
      f.swing += dt / f.swingDur;
      const u = clamp(f.swing, 0, 1);
      f.contact.lerpVectors(f.from, f.to, ease(u));
      f.contact.y = w.ground(f.contact.x, f.contact.z) + lift * Math.sin(Math.PI * u);
      f.yaw = f.yawFrom + (f.yawTo - f.yawFrom) * ease(u);
      if (f.swing >= 1) { f.swing = -1; f.planted = true; this.printFin(f, w); }
    }
  }

  private printFin(f: Fin, w: MotorWorld): void {
    if (!w.fx || !w.detail || this.medium === 'water') return;
    const L = this.L;
    w.fx.mark('fin', f.contact.x, f.contact.y, f.contact.z, this.heading + f.side * 0.5, 0.075 * L, 0.06 * L, 0.55 + 0.45 * w.soft);
    if (w.soft > 0.5 && w.wetGround > 0.6 && this.rnd() < 0.5) w.fx.splash('mud', f.contact.x, f.contact.y, f.contact.z, 0.25, 2, 0, 0, 0.0008 * this.scale);
  }

  // ------------------------------------------------------------------------------------------------ gaits
  private doStand(dt: number, w: MotorWorld): void {
    if (this.medium === 'water') { this.setGait('swim'); this.target = null; this.speed = 0; return; }
    const shallow = this.medium === 'shallow';
    let lift = this.propHeight();
    let head = this.posture === 'alert' ? 0.24 : this.posture === 'display' ? 0.3 : this.posture === 'low' ? 0.03 : 0.12;
    if (shallow) {
      // periscope: hold the eyes above the surface as far as the fins allow
      const need = this.waterY + 0.012 * this.L - (this.groundY + this.eyeTop);
      lift = clamp(Math.max(lift, need), 0.004 * this.L, 0.09 * this.L);
      head = Math.max(head, clamp(need / this.L * 2.5, 0, 0.35));
    }
    // breathing sway and small adjustments of the weight between the fins
    lift += 0.0012 * this.L * (0.6 * Math.sin(this.t * 1.7) + 0.4 * noise1(this.t * 0.9, this.seed)) * (this.posture === 'low' ? 0.3 : 1);
    this.liftT = lift;
    this.headPitchT = head;
    this.pitchT = this.posture === 'low' ? 0.0 : 0.025 + (this.posture === 'alert' ? 0.06 : 0);
    this.headYawT = 0.07 * noise1(this.t * 0.35, this.seed + 1) + 0.03 * noise1(this.t * 1.3, this.seed + 2);
    this.headPitchT += 0.025 * noise1(this.t * 0.5, this.seed + 3);
    this.finMode = 'plant';
    this.plantRest(false, w);
    this.stepFins(dt, w, 0.03 * this.L);
    // the pelvic disc props the throat on the mud
    this.pelvic.to(this.posture === 'low' ? -0.1 : this.pelvicReach(lift), 10, dt);
    this.pelvicFold.to(0, 10, dt);
    const erect = this.posture === 'alert' ? 0.05 : this.posture === 'display' ? 0.5 + 0.5 * Math.cos(this.t * 5.5) : 0.85;
    this.d1.to(erect, 12, dt);
    this.d2.to(this.posture === 'alert' || this.posture === 'display' ? 0.1 : 0.55, 8, dt);
    this.anal.to(0.6, 6, dt);
    this.caud.to(this.posture === 'alert' ? 0.1 : 0.35, 6, dt);
    // the tail lies as a skid; a slow wag now and then
    const wag = 0.05 * noise1(this.t * 0.45, this.seed + 4);
    for (const n of ['J_sp6', 'J_sp7', 'J_sp8', 'J_caudal']) this.bendT[n] = wag;
    if (shallow) for (const n of ['J_sp6', 'J_sp7', 'J_sp8', 'J_caudal', 'J_caudal2']) this.bendT[n] += 0.06 * Math.sin(this.t * 6 + CHAIN.indexOf(n));
    this.jaw.to(0, 20, dt);
  }

  private doCrawl(dt: number, w: MotorWorld): void {
    const L = this.L;
    if (this.medium === 'water') { this.setGait('swim'); return; }
    const tgt = this.target;
    if (!tgt) { this.setGait('stand'); this.done = true; return; }
    const shallow = this.medium === 'shallow';
    const wetFrac = shallow ? clamp(this.depth / this.H, 0, 1.3) : 0;
    const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const err = wrap(Math.atan2(dx, dz) - this.heading);
    const f = (1.75 + 1.3 * this.urgency) * Math.pow(0.08 / L, 0.25) * (shallow ? 0.9 : 1);
    const PUSH = 0.45;
    const prevPhase = this.phase;
    this.phase += dt * f;
    if (this.phase >= 1 || !this.stroke) {
      this.phase = this.phase >= 1 ? this.phase - 1 : PUSH;
      if (this.stroke && dist < Math.max(0.1 * L, 0.4 * this.stroke.len)) { this.target = null; this.setGait('stand'); this.done = true; return; }
      const pivot = Math.abs(err) > 0.85;
      const maxTurn = pivot ? 0.6 : 0.3;
      const turn = clamp(err, -maxTurn, maxTurn);
      // steeper and softer ground, wetter mud and hurry all bring the tail in
      const slope = (w.ground(this.pos.x + Math.sin(this.heading) * L * 0.3, this.pos.z + Math.cos(this.heading) * L * 0.3) - this.groundY) / (0.3 * L);
      const tail = clamp(0.15 + 1.4 * Math.max(0, slope) + 0.35 * w.soft * w.wetGround + 0.6 * this.urgency + 0.8 * wetFrac, 0, 1);
      const len = Math.min(0.24 * L * (0.85 + 0.25 * this.urgency) * (1 - 0.25 * Math.max(0, slope * 3)), Math.max(0.05 * L, dist)) * (pivot ? 0.35 : 1);
      const side = this.stroke ? -this.stroke.side : 1;
      this.stroke = { p0: this.pos.clone(), h0: this.heading, h1: this.heading + turn, len, tail, side, marked: false, settled: false, swingSet: this.phase < PUSH };
      if (this.phase < PUSH) for (const fn of this.fins) { if (!fn.planted) { fn.contact.copy(fn.to); fn.yaw = fn.yawTo; fn.planted = true; fn.swing = -1; } }
    }
    const st = this.stroke!;
    const lift0 = this.propHeight() * (shallow ? 0.6 : 1);
    if (this.phase < PUSH) {
      const u = this.phase / PUSH;
      const e = ease(u);
      this.heading = st.h0 + (st.h1 - st.h0) * e;
      const hm = st.h0 + (st.h1 - st.h0) * 0.5;
      this.pos.x = st.p0.x + Math.sin(hm) * st.len * e;
      this.pos.z = st.p0.z + Math.cos(hm) * st.len * e;
      // the fins press down and lift the body, which vaults forward over them
      this.liftT = lift0 + 0.05 * L * Math.sin(Math.PI * u) * (shallow ? 0.45 : 1) * (0.7 + 0.3 * this.urgency);
      this.pitchT = 0.02 + 0.05 * Math.sin(Math.PI * u);
      this.headPitchT = 0.12 + 0.05 * Math.sin(Math.PI * u);
      // the pelvic disc lifts off the mud as the body vaults over the pectorals
      this.pelvic.to(0.0, 12, dt);
      this.pelvicFold.to(0.3, 12, dt);
      // the tail: a lateral push against the mud at the end of the stroke (recoil), then it follows as a skid. The
      // trunk stays stiff over the pectorals and the belly; the bend is in the rear third of the body, from above the
      // anal fin to the caudal peduncle
      const k = smooth(0.45, 1, u) * (1 - smooth(0.92, 1.0, u) * 0.5);
      const amp = (0.08 + 0.4 * st.tail) * st.side;
      CHAIN.forEach((n, i) => {
        const x = i / (CHAIN.length - 1);
        this.bendT[n] = amp * k * Math.sin(Math.PI * (x * 1.7 - 0.55 - (u - 0.45) * 1.4)) * smooth(0.48, 0.78, x);
      });
      this.bendT.J_head = -0.08 * st.side * k * st.tail;
      // shallow water: the body wave helps (swim-crutching)
      if (shallow) {
        this.swimPhase += dt * TAU * 3.2;
        const b = bendFromMidline((x) => swimMidline(x, this.swimPhase, 0.45 * clamp(wetFrac, 0, 1)));
        for (const n of CHAIN) this.bendT[n] += b[n] ?? 0;
      }
      if (!st.marked && u > 0.85) {
        st.marked = true;
        if (w.fx && w.detail && this.medium === 'land') {
          // the tail skid and the belly leave a smear behind the pelvic fins
          const f2 = this.fwd(this.heading, this.v3);
          const bx = this.pos.x - f2.x * 0.35 * L, bz = this.pos.z - f2.z * 0.35 * L;
          w.fx.mark('drag', bx, w.ground(bx, bz), bz, this.heading, 0.32 * L, 0.07 * L, 0.35 + 0.4 * w.soft);
          if (st.tail > 0.5) {
            const tx = this.pos.x - f2.x * 0.7 * L, tz = this.pos.z - f2.z * 0.7 * L;
            w.fx.mark('scuff', tx, w.ground(tx, tz), tz, this.heading, 0.09 * L, 0.06 * L, 0.5 * st.tail);
            if (w.soft > 0.5) w.fx.splash('mud', tx, w.ground(tx, tz), tz, 0.35, 3, -f2.x, -f2.z, 0.0009 * this.scale);
          }
        }
        if (this.medium === 'shallow' && w.fx) w.fx.ripple(this.pos.x, this.pos.z, 0.6);
      }
      for (const fn of this.fins) fn.planted = true;
      // planted, the web is pressed open on the mud (a little gathered on soft mud)
      this.finFold[0].to(w.sand ? 0.05 : 0.15, 12, dt); this.finFold[1].to(w.sand ? 0.05 : 0.15, 12, dt);
    } else {
      const v = (this.phase - PUSH) / (1 - PUSH);
      if (prevPhase < PUSH || prevPhase > this.phase || !st.swingSet) {
        st.swingSet = true;
        // recovery begins: the body settles on the pelvic fins; the pectorals swing forward to the next plant
        const nextTurn = clamp(err, -0.3, 0.3) * 0.5;
        for (const fn of this.fins) {
          fn.from.copy(fn.contact);
          // the wrist is put down ahead of the shoulder, the web laid back along the flank (it stays put while the
          // body vaults over it, the arm swinging from leaning forward to leaning back)
          this.plantPoint(fn.side, 0.065 + 0.02 * this.urgency, 0.075, fn.to, w, this.heading + nextTurn);
          fn.yawFrom = fn.yaw;
          fn.yawTo = fn.yaw + wrap(this.webYaw(fn.side, 0.8, this.heading + nextTurn) - fn.yaw);
          fn.planted = false; fn.swing = 0;
        }
      }
      this.liftT = lift0 * (1 - 0.45 * Math.sin(Math.PI * v));
      this.pitchT = 0.02;
      this.headPitchT = 0.12;
      // recovery: the body rests on the pelvic disc while the pectorals swing forward, half folded
      this.pelvic.to(this.pelvicReach(this.liftT), 12, dt);
      this.pelvicFold.to(0, 12, dt);
      for (const fn of this.fins) {
        fn.contact.lerpVectors(fn.from, fn.to, ease(v));
        fn.contact.y = w.ground(fn.contact.x, fn.contact.z) + 0.035 * L * Math.sin(Math.PI * v);
        fn.yaw = fn.yawFrom + (fn.yawTo - fn.yawFrom) * ease(v);
      }
      this.finFold[0].to(0.55 * Math.sin(Math.PI * v), 14, dt); this.finFold[1].to(0.55 * Math.sin(Math.PI * v), 14, dt);
      if (!st.settled && v > 0.06) { st.settled = true; if (w.fx && w.soft > 0.4 && w.wetGround > 0.7 && this.medium === 'land' && this.rnd() < 0.35) w.fx.splash('mud', this.pos.x, this.groundY, this.pos.z, 0.2, 2, 0, 0, 0.0008 * this.scale); }
      if (this.phase + dt * f >= 1) for (const fn of this.fins) { fn.contact.copy(fn.to); fn.yaw = fn.yawTo; fn.planted = true; this.printFin(fn, w); }
      if (shallow) {
        this.swimPhase += dt * TAU * 2.4;
        const b = bendFromMidline((x) => swimMidline(x, this.swimPhase, 0.3 * clamp(wetFrac, 0, 1)));
        for (const n of CHAIN) this.bendT[n] += b[n] ?? 0;
      }
    }
    this.finMode = 'plant';
    this.d1.to(this.urgency > 0.5 ? 0.95 : 0.7, 8, dt);
    this.d2.to(0.45, 6, dt);
    this.caud.to(0.25, 6, dt);
    this.headYawT = 0;
    this.jaw.to(0, 20, dt);
  }

  private swimTargetY(): number {
    const L = this.L;
    // at the surface with the eyes out of the water (or along the bottom where it is too shallow for that)
    const surf = this.waterY + 0.015 * L - this.eyeTop;
    return Math.max(this.groundY + 0.012 * L, surf);
  }

  private doSwim(dt: number, w: MotorWorld): void {
    const L = this.L;
    if (this.medium !== 'water' && this.target) { this.setGait('crawl'); this.doCrawl(dt, w); return; }
    if (this.medium !== 'water' && !this.target) { this.setGait('stand'); this.done = true; return; }
    let want = 0;
    if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const err = wrap(Math.atan2(dx, dz) - this.heading);
      const turnRate = 2.5 + 6 * this.urgency;
      this.heading += clamp(err, -turnRate * dt, turnRate * dt);
      want = this.speed * clamp(dist / (0.6 * L), 0, 1) * (Math.abs(err) > 1.2 ? 0.3 : 1);
      this.bendT.J_head = clamp(err, -0.5, 0.5) * 0.25;
      for (const n of CHAIN) this.bendT[n] += clamp(err, -0.6, 0.6) * 0.06;
      if (dist < 0.15 * L) { this.target = null; this.done = true; }
    }
    const cur = Math.hypot(this.vel.x, this.vel.z);
    const sp = cur + (want - cur) * clamp(dt * 3, 0, 1);
    const f = this.fwd(this.heading, this.v1);
    this.vel.set(f.x * sp, 0, f.z * sp);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // axial undulation; the frequency follows speed (≈ 2.5 Hz drifting, up to ~10 Hz in a burst)
    const freq = clamp(2.2 + 7 * (sp / L) / 3, 2.2, 10);
    const amp = clamp(0.35 + 0.22 * (sp / L), 0.25, 1.1);
    this.swimPhase += dt * TAU * freq;
    const b = bendFromMidline((x) => swimMidline(x, this.swimPhase, sp > 0.02 * L ? amp : 0.2));
    for (const n of CHAIN) this.bendT[n] += b[n] ?? 0;
    this.bendT.J_head += b.J_head ?? 0;
    this.pos.y = this.swimY.to(this.swimTargetY(), 6, dt);
    this.pitchT = 0.07;
    this.headPitchT = 0.08;
    this.finMode = sp > 0.6 * L ? 'fold' : 'paddle';
    this.pelvic.to(-0.3, 8, dt);
    this.pelvicFold.to(0.8, 8, dt);
    this.d1.to(1, 8, dt); this.d2.to(0.35, 8, dt); this.anal.to(0.35, 8, dt); this.caud.to(0, 8, dt);
    this.jaw.to(0, 20, dt);
    // rings where the head breaks the surface
    this.rippleAcc += dt * (0.35 + 6 * sp / L);
    if (this.rippleAcc > 1 && w.fx && this.pos.y + this.eyeTop > this.waterY - 0.002) {
      this.rippleAcc = 0;
      // a small fish makes small rings
      w.fx.ripple(this.pos.x + f.x * 0.15 * L, this.pos.z + f.z * 0.15 * L, (0.18 + 0.2 * sp / L) * Math.min(1.2, L / 0.08));
    }
  }

  private doHop(dt: number, w: MotorWorld): void {
    const L = this.L;
    const h = this.hop;
    h.t += dt;
    const f = this.fwd(this.heading, this.v1);
    this.finMode = h.stage === 'air' ? 'fold' : 'plant';
    if (h.stage === 'prep') {
      // the J-curl: the tail swings up beside the head while the fish pivots to face the jump
      const c = smooth(0, 1, h.t / h.prep);
      this.heading = h.h0 + h.turn * ease(c);
      for (const n of CHAIN) this.bendT[n] = (CURL[n] ?? 0) * h.side * c * 1.6;
      this.bendT.J_head = -0.3 * h.side * c;
      this.liftT = 0.012 * L;
      this.headPitchT = 0.18 * c;
      this.pitchT = 0.04;
      this.d1.to(1, 20, dt);
      if (h.t >= h.prep) { h.stage = 'launch'; h.t = 0; }
    } else if (h.stage === 'launch') {
      // the body straightens; the tail presses the ground and throws the fish forward and up
      const u = clamp(h.t / 0.05, 0, 1);
      for (const n of CHAIN) this.bendT[n] = (CURL[n] ?? 0) * h.side * (1.6 - 2.0 * u);
      this.bendT.J_head = 0.1 * h.side * u;
      this.liftT = 0.012 * L + 0.02 * L * u;
      this.headPitchT = 0.2;
      if (u >= 1) {
        const soft = w.soft * w.wetGround;
        const d = h.dist * (1 - 0.18 * soft);
        const v0 = Math.sqrt((d * G) / Math.sin(2 * h.angle));
        this.vel.set(f.x * v0 * Math.cos(h.angle), v0 * Math.sin(h.angle), f.z * v0 * Math.cos(h.angle));
        this.pos.y = this.groundY + this.lift.x;
        h.stage = 'air'; h.t = 0;
        this.onEvent('hop');
        if (w.fx) {
          const tx = this.pos.x - f.x * 0.6 * L, tz = this.pos.z - f.z * 0.6 * L;
          if (this.medium === 'land') {
            if (w.detail) w.fx.mark('imprint', this.pos.x - f.x * 0.25 * L, this.groundY, this.pos.z - f.z * 0.25 * L, this.heading, 0.8 * L, 0.16 * L, 0.6);
            w.fx.splash('mud', tx, w.ground(tx, tz), tz, 0.5 + 0.4 * soft, 5 + Math.round(6 * soft), -f.x, -f.z, 0.001 * this.scale);
          } else { w.fx.splash('water', tx, this.waterY, tz, 0.7, 10, -f.x, -f.z, 0.0012 * this.scale); w.fx.ripple(this.pos.x, this.pos.z, 1); }
        }
      }
    } else if (h.stage === 'air') {
      this.vel.y -= G * dt;
      this.pos.addScaledVector(this.vel, dt);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.pitchT = Math.atan2(this.vel.y, hs) * 0.55;
      this.headPitchT = 0.05;
      for (const n of CHAIN) this.bendT[n] = 0;
      this.d1.to(1, 25, dt); this.caud.to(0.15, 20, dt);
      this.pelvic.to(-0.3, 20, dt); this.pelvicFold.to(0.8, 20, dt);
      const g = w.ground(this.pos.x, this.pos.z);
      const wl = w.water(this.pos.x, this.pos.z);
      const surface = Math.max(g, wl - 0.35 * this.H);
      if (this.vel.y < 0 && this.pos.y <= surface) {
        const depth = wl - g;
        this.sense(w);
        if (depth > 0.6 * this.H) {
          // onto the water: skip on across the surface, or go in and swim
          if (w.fx) { w.fx.splash('water', this.pos.x, wl, this.pos.z, 0.6 + hs * 0.3, 12, f.x, f.z, 0.0012 * this.scale); w.fx.ripple(this.pos.x, this.pos.z, 1.2); }
          if (h.skips > 0 && hs > 0.45) {
            h.skips--;
            this.vel.set(this.vel.x * 0.7, Math.abs(this.vel.y) * 0.45 + 0.4, this.vel.z * 0.7);
            this.pos.y = surface + 0.001;
            this.onEvent('skip');
            return;
          }
          this.pos.y = Math.max(g + 0.01 * L, wl - this.eyeTop);
          this.swimY.x = this.pos.y; this.swimY.v = 0;
          this.vel.y = 0;
          this.setGait('swim');
          this.speed = Math.max(0.3 * L, hs * 0.6);
          this.onEvent('water_entry');
          this.done = !this.target;
          return;
        }
        this.pos.y = g;
        this.lift.x = -0.004 * L; this.lift.v = 0;
        h.stage = 'land'; h.t = 0;
        this.vel.set(0, 0, 0);
        for (const fn of this.fins) { this.plantPoint(fn.side, 0.02, 0.085, fn.contact, w); fn.yaw = this.webYaw(fn.side, 0.8); fn.planted = true; fn.swing = -1; }
        this.reflexBlink();
        if (w.fx) {
          const soft = w.soft * w.wetGround;
          if (depth > 0) { w.fx.splash('water', this.pos.x, wl, this.pos.z, 0.5, 8, f.x, f.z, 0.0011 * this.scale); w.fx.ripple(this.pos.x, this.pos.z, 0.9); }
          else {
            if (w.detail) w.fx.mark('imprint', this.pos.x - f.x * 0.25 * L, g, this.pos.z - f.z * 0.25 * L, this.heading, 0.85 * L, 0.17 * L, 0.7 + 0.3 * soft);
            w.fx.splash('mud', this.pos.x, g, this.pos.z, 0.35 + 0.5 * soft, 4 + Math.round(8 * soft), f.x, f.z, 0.0011 * this.scale);
          }
        }
        this.mud = clamp(this.mud + 0.12 * w.soft * w.wetGround, 0, 1);
      }
    } else {
      // landing: the body squashes onto the belly and the spread fins, then props up again
      const u = clamp(h.t / 0.26, 0, 1);
      this.liftT = this.propHeight() * smooth(0.3, 1, u);
      this.pitchT = 0.03;
      this.headPitchT = 0.08 + 0.06 * u;
      this.pelvic.to(this.pelvicReach(this.liftT), 12, dt); this.pelvicFold.to(0, 12, dt);
      this.d1.to(0.6, 6, dt);
      if (u >= 1) {
        this.setGait('stand');
        if (this.target) this.chooseTravelGait(); else this.done = true;
      }
    }
  }

  private doStrike(dt: number, w: MotorWorld): void {
    const L = this.L;
    const s = this.strike;
    s.t += dt;
    this.finMode = 'plant';
    const f = this.fwd(this.heading, this.v1);
    // the mouth sits ~21 % of the length ahead of the pectoral girdle
    const reach = 0.21 * L;
    if (s.stage === 'aim') {
      // still; eyes on the prey; the head lowers a little
      this.attend.prey = s.p;
      this.headPitchT = 0.0;
      this.liftT = this.propHeight();
      this.pitchT = 0.04;
      const err = wrap(Math.atan2(s.p.x - this.pos.x, s.p.z - this.pos.z) - this.heading);
      this.heading += clamp(err, -dt * 1.2, dt * 1.2);
      this.headYawT = clamp(err, -0.3, 0.3);
      this.stepFins(dt, w, 0.02 * L);
      if (s.t > s.aim) {
        s.stage = 'lunge'; s.t = 0; s.p0.copy(this.pos);
        s.len = Math.max(0, Math.hypot(s.p.x - this.pos.x, s.p.z - this.pos.z) - reach);
        this.onEvent('forage');
      }
    } else if (s.stage === 'lunge') {
      // a quick push forward; the head pivots down over the prey and the lower jaw swings open as it arrives
      const u = clamp(s.t / 0.14, 0, 1);
      const e = ease(u);
      this.pos.x = s.p0.x + f.x * s.len * e;
      this.pos.z = s.p0.z + f.z * s.len * e;
      this.headPitchT = -0.45 * e;
      this.pitchT = -0.06 * e;
      this.liftT = this.propHeight() * (1 - 0.4 * e);
      this.jaw.to(u > 0.55 ? 0.95 : 0.1, 60, dt);
      for (const fn of this.fins) fn.planted = true;
      if (u >= 1) { s.stage = 'bite'; s.t = 0; }
    } else if (s.stage === 'bite') {
      const u = clamp(s.t / 0.12, 0, 1);
      this.headPitchT = -0.5;
      this.jaw.to(u < 0.3 ? 0.95 : 0, 70, dt);
      if (u >= 1) {
        if (w.fx && this.medium !== 'water') {
          if (w.detail) w.fx.mark('bite', s.p.x, w.ground(s.p.x, s.p.z), s.p.z, this.heading, 0.06 * L, 0.06 * L, 0.8);
          w.fx.splash(this.medium === 'land' ? 'mud' : 'water', s.p.x, w.ground(s.p.x, s.p.z), s.p.z, 0.25, 3, f.x, f.z, 0.0007 * this.scale);
        }
        if (this.medium === 'shallow' && w.fx) w.fx.ripple(s.p.x, s.p.z, 0.5);
        if (s.graze > 0) { s.graze--; s.stage = 'aim'; s.t = 0; s.aim = 0.15 + this.rnd() * 0.25; s.p.addScaledVector(f, 0.03 * L).add(this.v2.set((this.rnd() - 0.5) * 0.04 * L, 0, (this.rnd() - 0.5) * 0.04 * L)); }
        else { s.stage = 'chew'; s.t = 0; }
      }
    } else {
      // chewing and pumping the mouth water ("hydrodynamic tongue")
      const u = clamp(s.t / s.chew, 0, 1);
      this.attend.prey = null;
      this.headPitchT = -0.3 * (1 - u) + 0.12 * u;
      this.liftT = this.propHeight() * (0.6 + 0.4 * u);
      this.jaw.to(0.07 * Math.max(0, Math.sin(s.t * 26)) * (1 - u), 40, dt);
      this.breatheBoost = 0.6 * (1 - u);
      if (u >= 1) { this.setGait('stand'); this.done = true; }
    }
    this.pelvic.to(this.pelvicReach(this.liftT), 10, dt);
    this.d1.to(0.8, 6, dt);
  }
  private breatheBoost = 0;

  /** dive into / climb out of the burrow along its tunnel (a slope of ~65° from the opening) */
  private doBurrow(dt: number, w: MotorWorld): void {
    const L = this.L;
    const P = this.path;
    this.finMode = 'fold';
    this.pelvic.to(-0.3, 10, dt); this.pelvicFold.to(0.9, 10, dt);
    this.d1.to(1, 10, dt); this.caud.to(0.4, 6, dt);
    if (this.gait === 'hidden') { this.hidden = true; return; }
    P.t += dt;
    const u = clamp(P.t / P.dur, 0, 1);
    if (P.stage !== 'peek') P.u = P.u0 + (P.u1 - P.u0) * ease(u);
    // tunnel elevation of the body axis (forward direction) at path coordinate x
    const A = P.slope;
    const elev = (x: number) => (P.out ? (x < 0 ? A : 0) : (x > 0 ? -A : 0));
    const at = (x: number, out: Vector3) => {
      const dir = P.dir;
      const hx = Math.sin(dir), hz = Math.cos(dir);
      if (P.out) {
        if (x >= 0) out.set(P.hole.x + hx * x, 0, P.hole.z + hz * x).setY(w.ground(out.x, out.z));
        else out.set(P.hole.x + hx * x * Math.cos(A), P.hole.y + x * Math.sin(A), P.hole.z + hz * x * Math.cos(A));
      } else {
        if (x <= 0) out.set(P.hole.x + hx * x, 0, P.hole.z + hz * x).setY(w.ground(out.x, out.z));
        else out.set(P.hole.x + hx * x * Math.cos(A), P.hole.y - x * Math.sin(A), P.hole.z + hz * x * Math.cos(A));
      }
      return out;
    };
    at(P.u, this.v3);
    this.pos.copy(this.v3);
    this.heading = P.dir;
    // the head leads into the tunnel (or out of it); while peeking it stays pointed up out of the hole
    const peek = P.out && (P.stage === 'peek' || (P.stage === 'go'));
    const eRoot = elev(P.u + 0.03 * L);
    const eHead = peek ? A : elev(P.u + 0.12 * L);
    this.pathPose = { root: eRoot, head: eHead, seg: (d: number) => (P.out ? elev(P.u - d) : elev(P.u - d)) };
    // a quick wriggle while squeezing through
    if (P.stage !== 'peek') for (let i = 0; i < CHAIN.length; i++) this.bendT[CHAIN[i]] = 0.22 * Math.sin(this.t * 22 - i * 0.9) * smooth(0.2, 0.6, i / CHAIN.length) * (1 - u * 0.5);
    if (P.stage === 'go' && u >= 1) {
      if (!P.out) {
        this.gait = 'hidden'; this.hidden = true; this.done = true;
        if (w.fx && w.detail) w.fx.mark('scuff', P.hole.x, P.hole.y, P.hole.z, P.dir, 0.12 * L, 0.1 * L, 0.6);
        this.onEvent('burrow');
      } else { P.stage = 'peek'; P.t = 0; this.done = this.pathPeekOnly; this.onEvent('peek'); }
    } else if (P.stage === 'out' && u >= 1) {
      this.pathPose = null;
      this.lift.x = 0.004 * L;
      this.setGait('stand');
      this.plantRest(true, w);
      this.done = true;
    }
    if (P.stage === 'peek') { this.headYawT = 0.25 * Math.sin(this.t * 0.6); this.posture = 'alert'; }
  }
  private pathPose: { root: number; head: number; seg: (d: number) => number } | null = null;

  /** start hidden inside a burrow (spawned at night, or after a reset) */
  setHidden(hole: Vector3, dir: number): void {
    this.path.hole.copy(hole); this.path.dir = dir; this.path.out = false;
    this.gait = 'hidden'; this.hidden = true; this.done = true;
    this.pos.copy(hole);
  }

  private doRoll(dt: number, w: MotorWorld): void {
    // a quick flip onto the side and back (~0.45 s), driven by a sharp C-bend of the body that throws the animal over
    const dur = 0.45;
    const u = clamp(this.gaitT / dur, 0, 1);
    this.rollT = this.rollSide * 2.4 * Math.pow(Math.sin(Math.PI * u), 0.8);
    this.liftT = 0.01 * this.L;
    this.finMode = 'fold';
    this.headPitchT = 0.02;
    const c = Math.sin(Math.PI * u);
    for (let i = 0; i < CHAIN.length; i++) this.bendT[CHAIN[i]] = this.rollSide * 0.3 * c * smooth(0.3, 0.8, i / CHAIN.length);
    if (this.gaitT < dt * 1.5 && w.fx) { w.fx.ripple(this.pos.x, this.pos.z, 0.8); if (this.depth > 0) w.fx.splash('water', this.pos.x, this.waterY, this.pos.z, 0.4, 8, 0, 0, 0.001 * this.scale); }
    if (this.depth > -0.004) { this.moisture = Math.min(1, this.moisture + dt * 1.2); this.mud = Math.max(0, this.mud - dt * 0.8); }
    else this.moisture = Math.min(1, this.moisture + dt * 0.35 * w.wetGround);
    if (u >= 1) { this.rollT = 0; this.setGait('stand'); this.done = true; this.onEvent('rewet'); }
  }

  // ------------------------------------------------------------------------------------------------ skin and breath
  private doSkin(dt: number, w: MotorWorld): void {
    const sub = this.pos.y + 0.6 * this.H < this.waterY;
    if (sub || this.gait === 'hidden') { this.moisture = Math.min(1, this.moisture + dt * 0.8); this.mud = Math.max(0, this.mud - dt * (sub ? 0.25 : 0.0)); return; }
    // the skin dries over minutes in air; much slower on wet mud in the shade, faster on dry sand in the sun
    const tau = 260 * (0.4 + 1.6 * w.wetGround) / (0.5 + w.drying);
    const touchingWater = this.depth > -0.003;
    this.moisture = touchingWater ? Math.min(1, this.moisture + dt * 0.25) : Math.max(0, this.moisture - dt / tau);
    if (this.gait === 'crawl' && this.medium === 'land') this.mud = Math.min(1, this.mud + dt * 0.012 * w.soft * (0.4 + w.wetGround));
  }

  private doBreath(dt: number): void {
    // on land the mouth and gill chambers are pumped (buccal pumping, cheeks and throat swell); in water the
    // opercular pumping is quicker and shallower
    const land = this.medium !== 'water';
    const rate = land ? 0.85 + 0.4 * this.attend.alert : 1.6;
    this.breathPhase += dt * TAU * rate * (0.9 + 0.2 * Math.sin(this.t * 0.31));
    const a = land ? 0.32 : 0.12;
    const b = 0.5 - 0.5 * Math.cos(this.breathPhase);
    this.breatheBoost = Math.max(0, this.breatheBoost - dt * 0.4);
    const pump = this.breatheBoost * (0.5 - 0.5 * Math.cos(this.t * TAU * 2.6));
    this.breathe.to(Math.min(1, a * b + pump + (this.gait === 'hidden' ? 0 : 0.05)), 18, dt);
  }

  // ------------------------------------------------------------------------------------------------ eyes
  private doEyes(dt: number, headQ: Quaternion, w: MotorWorld): void {
    const p = this.pose;
    const onLand = this.medium !== 'water' || this.pos.y + this.eyeTop > this.waterY;
    // spontaneous blinks: more often when the skin and air are drying (none under water)
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      if (onLand && !this.hidden) {
        const both = this.rnd() < 0.88;
        const k = this.rnd() < 0.5 ? 0 : 1;
        this.eyes.forEach((e, i) => { if (both || i === k) { e.blinkT = 0; e.blinkDur = 0.5 + this.rnd() * 0.14; } });
        this.onEvent('blink');
      }
      this.nextBlink = (3 + 14 * this.moisture) * (0.5 + this.rnd()) / (0.6 + 0.8 * w.drying);
    }
    for (let i = 0; i < 2; i++) {
      const e = this.eyes[i];
      if (e.blinkT >= 0) {
        e.blinkT += dt / e.blinkDur;
        const u = e.blinkT;
        e.retract = u < 0.3 ? smooth(0, 0.3, u) : u < 0.5 ? 1 : 1 - smooth(0.5, 1, u);
        e.cup = u < 0.35 ? smooth(0.06, 0.35, u) : u < 0.5 ? 1 : 1 - smooth(0.5, 0.95, u);
        if (u >= 1) { e.blinkT = -1; e.retract = 0; e.cup = 0; }
      }
    }
    if (!w.detail) {
      // far away: no tracking, a slow random drift
      for (const e of this.eyes) { e.yaw = 0.15 * Math.sin(this.t * 0.4 + e.nextSac); e.pitch = 0.05 * Math.sin(this.t * 0.3); }
    } else {
      const inv = this.q1.copy(headQ).invert();
      for (let i = 0; i < 2; i++) {
        const e = this.eyes[i];
        const side = i === 0 ? 1 : -1;
        const bone = this.bones[i === 0 ? 'J_eyeL' : 'J_eyeR'];
        const ax = this.eyeAxis[i];
        // attention: prey (both eyes converge), a threat (the eye on its side follows it), else scanning
        let tgt: Vector3 | null = null, gain = 0.5;
        if (this.attend.prey) { tgt = this.attend.prey; gain = 0.75; }
        else if (this.attend.threat && this.attend.alert > 0.15) { tgt = this.attend.threat; gain = 0.45 + 0.35 * this.attend.alert; }
        else if (this.attend.player) { tgt = this.attend.player; gain = 0.22; }
        e.nextSac -= dt;
        if (e.nextSac <= 0) {
          // a new fixation: mudskippers keep scanning the sky (birds) and the mud ahead (prey)
          const r = this.rnd();
          e.scanYaw = (this.rnd() - 0.5) * 0.9;
          e.scanPitch = r < 0.35 ? 0.25 + this.rnd() * 0.3 : r < 0.75 ? -0.2 - this.rnd() * 0.2 : (this.rnd() - 0.5) * 0.3;
          e.nextSac = 0.5 + this.rnd() * 2.2;
        }
        let ty = e.scanYaw, tp = e.scanPitch;
        if (tgt && bone) {
          const ep = bone.getWorldPosition(this.v3);
          const d = this.v2.subVectors(tgt, ep).normalize().applyQuaternion(inv);
          const inField = side * d.x > -0.35 || this.attend.prey;
          if (inField) {
            const yaw = Math.atan2(d.x, d.z) - Math.atan2(ax.x, ax.z);
            const pitch = Math.asin(clamp(d.y, -1, 1)) - Math.asin(clamp(ax.y, -1, 1));
            ty = ty * (1 - gain) + wrap(yaw) * gain;
            tp = tp * (1 - gain) + pitch * gain;
          }
        }
        // fixational drift: the eyes never sit perfectly still
        e.tYaw = clamp(ty + 0.015 * noise1(this.t * 2.3, this.seed + 7 + i), -0.7, 0.7);
        e.tPitch = clamp(tp + 0.012 * noise1(this.t * 2.1, this.seed + 9 + i), -0.55, 0.6);
        // saccade (fast) when far off target, otherwise slow pursuit
        const err = Math.hypot(e.tYaw - e.yaw, e.tPitch - e.pitch);
        const om = err > 0.12 ? 45 : 9;
        const sy = new Spring(e.yaw); sy.v = e.vy; e.yaw = sy.to(e.tYaw, om, dt); e.vy = sy.v;
        const spp = new Spring(e.pitch); spp.v = e.vp; e.pitch = spp.to(e.tPitch, om, dt); e.vp = spp.v;
      }
    }
    p.eyeL.yaw = this.eyes[0].yaw; p.eyeL.pitch = this.eyes[0].pitch; p.eyeL.retract = this.eyes[0].retract;
    p.eyeR.yaw = this.eyes[1].yaw; p.eyeR.pitch = this.eyes[1].pitch; p.eyeR.retract = this.eyes[1].retract;
    p.morph.blinkL = this.eyes[0].cup; p.morph.blinkR = this.eyes[1].cup;
  }

  // ------------------------------------------------------------------------------------------------ pose
  private solve(dt: number, w: MotorWorld): void {
    const L = this.L;
    const p = this.pose;
    const root = this.root;
    root.visible = !this.hidden;
    if (this.hidden) return;
    // springs toward the gait's targets
    const lift = this.lift.to(this.liftT, this.gait === 'hop' && this.hop.stage === 'land' ? 22 : 14, dt);
    const shapedPitch = this.pitchS.to(this.pitchT, 10, dt);
    const roll = this.rollS.to(this.rollT, this.gait === 'roll' ? 32 : 9, dt);
    const headPitch = this.headPitch.to(this.headPitchT, 12, dt);
    const headYaw = this.headYaw.to(this.headYawT, 8, dt);
    for (const [n] of SPINE) p.bend[n] = this.bend[n].to(this.bendT[n] ?? 0, this.gait === 'swim' || this.gait === 'hop' ? 60 : 22, dt);
    // terrain slope under the trunk
    const fw = this.fwd(this.heading, this.v1), lf = this.left(this.heading, this.v2);
    const gF = w.ground(this.pos.x + fw.x * 0.2 * L, this.pos.z + fw.z * 0.2 * L);
    const gB = w.ground(this.pos.x - fw.x * 0.25 * L, this.pos.z - fw.z * 0.25 * L);
    const gL = w.ground(this.pos.x + lf.x * 0.08 * L, this.pos.z + lf.z * 0.08 * L);
    const gR = w.ground(this.pos.x - lf.x * 0.08 * L, this.pos.z - lf.z * 0.08 * L);
    const onGround = this.gait !== 'swim' && !(this.gait === 'hop' && this.hop.stage === 'air') && !this.pathPose;
    const slopeP = onGround ? Math.atan2(gF - gB, 0.45 * L) : 0;
    const slopeR = onGround ? Math.atan2(gR - gL, 0.16 * L) * 0.7 : 0;
    let pitch = shapedPitch + slopeP;
    if (this.pathPose) pitch = this.pathPose.root;
    // root height: the ventral line under the girdle rides `lift` above the mud, unless swimming / flying / in the tunnel
    let y: number;
    if (this.gait === 'swim') y = this.pos.y;
    else if (this.gait === 'hop' && this.hop.stage === 'air') y = this.pos.y;
    else if (this.pathPose) y = this.pos.y;
    else { y = this.groundY + lift; this.pos.y = y; }
    this.pitch = pitch; this.roll = roll + slopeR;
    root.position.set(this.pos.x, y, this.pos.z);
    // roll about the body's centre, not its belly
    const hc = 0.07 * L;
    this.q1.setFromAxisAngle(this.v3.set(0, 1, 0), this.heading);
    this.q2.setFromAxisAngle(this.v3.set(1, 0, 0), -pitch);
    this.q1.multiply(this.q2);
    this.q2.setFromAxisAngle(this.v3.set(0, 0, 1), this.roll);
    this.q1.multiply(this.q2);
    root.quaternion.copy(this.q1);
    if (Math.abs(this.roll) > 1e-4) {
      // offset = R_yaw·R_pitch · ((0, hc, 0) − R_roll · (0, hc, 0)): the roll pivots on the body's centre line
      const sr = Math.sin(this.roll), cr = Math.cos(this.roll);
      this.v3.set(hc * sr, hc * (1 - cr), 0);
      this.q2.setFromAxisAngle(this.v2.set(0, 1, 0), this.heading).multiply(this.q1.setFromAxisAngle(this.v1.set(1, 0, 0), -pitch));
      root.position.add(this.v3.applyQuaternion(this.q2));
    }
    root.scale.setScalar(this.scale);

    // vertical shape of the chain: on the ground the trunk is stiff and the posterior drapes over the mud (the tail
    // is a skid); swimming and flying it is straight; in the tunnel it follows the tunnel
    const lifts = this.drape(pitch, y, onGround);
    let liftRoot = lifts[0];
    for (let k = 0; k < CHAIN.length; k++) p.lift[CHAIN[k]] = lifts[k];
    liftRoot = p.lift.J_root;
    // head relative to the trunk (J_root's rotation is compensated so the head keeps its own attitude)
    const headPath = this.pathPose ? this.pathPose.head - this.pathPose.root : 0;
    p.lift.J_head = headPitch + headPath + liftRoot;
    p.bend.J_head += headYaw;
    p.roll = 0;
    p.jaw = this.jaw.x;
    p.pelvic = this.pelvic.x;
    p.morph.breathe = this.breathe.x;
    p.morph.foldD1 = this.d1.x; p.morph.foldD2 = this.d2.x; p.morph.foldAnal = this.anal.x; p.morph.foldCaudal = this.caud.x;
    p.morph.foldPelvic = this.pelvicFold.x;
    // pectoral fins: FK for folded / paddling, IK when planted (blended to avoid pops)
    const ik = this.ikW.to(this.finMode === 'plant' && w.detail ? 1 : 0, 12, dt);
    this.fkFins(dt);
    p.pecL.q = null; p.pecL.wq = null; p.pecR.q = null; p.pecR.wq = null;
    this.applyPose();
    root.updateMatrixWorld(true);
    if (ik > 0.01) this.ikFins(ik, w);
    if (this.finMode === 'plant' && !w.detail) this.fkPlantedFins();
    // eyes last: they look from where the head is now
    const head = this.bones.J_head;
    if (head) {
      head.getWorldQuaternion(this.q2);
      this.doEyes(dt, this.q2, w);
      for (const [jn, key] of [['J_eyeL', 'eyeL'], ['J_eyeR', 'eyeR']] as const) {
        const b = this.bones[jn];
        if (!b) continue;
        const e = p[key];
        const q = this.qFrom(e.yaw, e.pitch);
        b.quaternion.copy(q);
        const r = this.rest[jn];
        const d = this.rig.eyeRetract_m * e.retract;
        const side = jn === 'J_eyeL' ? 1 : -1;
        b.position.set(r.x - side * 0.12 * d, r.y - d, r.z - 0.15 * d);
      }
    }
    for (const mm of this.morphMeshes) {
      const inf = mm.mesh.morphTargetInfluences;
      const dict = mm.mesh.morphTargetDictionary;
      if (!inf || !dict) continue;
      for (const n of mm.names) {
        const idx = dict[n];
        if (idx === undefined) continue;
        inf[idx] = this.morphValue(mm.mesh, n);
      }
    }
  }

  private qFrom(yaw: number, pitch: number): Quaternion {
    const a = this.q1.setFromAxisAngle(this.v3.set(0, 1, 0), yaw);
    const b = this.q2.setFromAxisAngle(this.v3.set(1, 0, 0), -pitch);
    return a.multiply(b);
  }

  private morphValue(mesh: Mesh, n: string): number {
    const m = this.pose.morph;
    const owner = MORPHS[mesh.name] ? mesh.name : mesh.parent?.name ?? '';
    switch (n) {
      case 'breathe': return m.breathe;
      case 'blinkL': return m.blinkL;
      case 'blinkR': return m.blinkR;
      case 'foldD1': return m.foldD1;
      case 'foldD2': return m.foldD2;
      case 'fold':
        if (owner === 'AnalFin') return m.foldAnal;
        if (owner === 'Tail') return m.foldCaudal;
        if (owner === 'PectoralFin_L') return m.foldPecL;
        if (owner === 'PectoralFin_R') return m.foldPecR;
        if (owner === 'PelvicFin') return m.foldPelvic;
        return 0;
      default: return 0;
    }
  }

  /** vertical bend per chain joint (local lift angles) */
  private drape(pitch: number, rootY: number, onGround: boolean): number[] {
    const n = CHAIN.length;
    const out = new Array<number>(n).fill(0);
    const L = this.L;
    if (this.pathPose) {
      // segment k (behind joint k) follows the tunnel elevation at its middle
      let prevE = this.pathPose.root;
      for (let k = 0; k < n; k++) {
        const dMid = (this.distBack[k] + (k + 1 < n ? this.distBack[k + 1] : this.distBack[k] + 0.08 * L)) / 2;
        const e = this.pathPose.seg(dMid);
        out[k] = -(e - prevE);
        prevE = e;
      }
      return out;
    }
    if (!onGround) {
      // in water / in the air: a slight sag of the tail, else straight
      for (let k = 2; k < n; k++) out[k] = this.gait === 'swim' ? 0.0 : -0.015;
      return out;
    }
    const f = this.fwd(this.heading, this.v1);
    const g = (d: number) => this.groundAt(this.pos.x - f.x * d, this.pos.z - f.z * d);
    // walk down the chain in 2D (distance back, height): the trunk keeps its direction; behind the girdle the body
    // sags until it rests on the mud, never through it
    const sagMax = 0.16, bendMax = 0.32;
    let beta = -pitch;          // elevation of the backward direction of the current segment
    let prevBeta = -pitch;
    let yPrev = rootY + this.belly[0] * Math.cos(pitch);
    const nextLen = (k: number) => (k + 1 < n ? this.segLen[k + 1] : 0.1 * L);
    for (let k = 0; k < n; k++) {
      const len = nextLen(k);
      const dEnd = this.distBack[k] + len;
      const floor = g(dEnd) + (k + 1 < n ? this.belly[k + 1] : this.belly[n - 1] * 0.6) * 0.92;
      let b = prevBeta;
      const yC = yPrev + len * Math.sin(b);
      const need = Math.asin(clamp((floor - yPrev) / len, -1, 1));
      if (yC < floor) b = need;
      else b = Math.max(b - sagMax, need);
      b = clamp(b, prevBeta - bendMax, prevBeta + bendMax);
      out[k] = b - prevBeta;
      yPrev += len * Math.sin(b);
      prevBeta = b;
      beta = b;
    }
    void beta;
    return out;
  }

  private groundAt(x: number, z: number): number { return this.groundFn ? this.groundFn(x, z) : 0; }
  groundFn: ((x: number, z: number) => number) | null = null;

  private fkFins(dt: number): void {
    const p = this.pose;
    const fold = this.finMode === 'fold';
    const paddle = this.finMode === 'paddle';
    const ph = this.t * TAU * (this.gait === 'roll' ? 4 : 1.6);
    for (const [i, key] of [[0, 'pecL'], [1, 'pecR']] as const) {
      const fp = p[key];
      if (fold) { fp.protract = -1.05; fp.depress = 0.22; fp.wrist = 0.05; fp.twist = 0; }
      else if (paddle) { fp.protract = -0.25 + 0.55 * Math.sin(ph + i * Math.PI * 0.15); fp.depress = 0.55; fp.wrist = 0.25 + 0.15 * Math.sin(ph + 0.6); fp.twist = 0.2 * Math.sin(ph); }
      else { fp.protract = 0.4; fp.depress = 1.0; fp.wrist = 0.5; fp.twist = 0; }
    }
    const want = fold ? 0.8 : paddle ? 0.15 : null;
    if (want !== null) { this.finFold[0].to(want, 10, dt); this.finFold[1].to(want, 10, dt); }
    else if (this.gait !== 'crawl') { this.finFold[0].to(0.12, 6, dt); this.finFold[1].to(0.12, 6, dt); }
    p.morph.foldPecL = this.finFold[0].x;
    p.morph.foldPecR = this.finFold[1].x;
  }

  /** without IK (far away): turn the fins toward their contact points with FK angles */
  private fkPlantedFins(): void {
    for (const f of this.fins) {
      const b = this.bones[f.side > 0 ? 'J_pecL' : 'J_pecR'];
      if (!b) continue;
      const fw = this.fwd(this.heading, this.v1);
      const along = ((f.contact.x - this.pos.x) * fw.x + (f.contact.z - this.pos.z) * fw.z) / this.L;
      const pose = this.pose[f.side > 0 ? 'pecL' : 'pecR'];
      pose.protract = clamp(-0.2 + along * 5, -0.8, 1.0);
      pose.depress = 1.0;
    }
    this.applyPose(true);
  }

  private applyPose(pecsOnly = false): void {
    const P = computePose(this.pose, this.rig);
    for (const [name, q] of Object.entries(P.q)) {
      if (pecsOnly && !name.startsWith('J_pec')) continue;
      if (name === 'J_eyeL' || name === 'J_eyeR') continue;
      const b = this.bones[name];
      if (b) b.quaternion.set(q[0], q[1], q[2], q[3]);
    }
  }

  /**
   * IK for the planted pectorals (Pace & Gibb 2009; photographs of propped animals): the muscular arm reaches from the
   * shoulder down to the wrist, put down on the mud beside the body; the fin web lies on the mud behind the wrist,
   * swept back and out, its leading rays forward, touching down toward its margin. While planted the wrist and the
   * web's heading stay put in the world, so the body vaults over the fin and the arm swings from leaning forward to
   * leaning back. Propped high the arm cannot reach the mud: it points at the wrist's spot and the web slopes down
   * from the wrist to the mud.
   */
  private ikFins(weight: number, w: MotorWorld): void {
    const rig = this.rig.pec;
    const s = this.scale;
    const a = rig.armLen_m * s, b = rig.handLen_m * s;
    const rootBone = this.bones.J_root;
    if (!rootBone) return;
    const hw = 0.0006 * s; // the wrist rests on the mud by half its thickness
    for (const f of this.fins) {
      const sh = this.bones[f.side > 0 ? 'J_pecL' : 'J_pecR'], wr = this.bones[f.side > 0 ? 'J_pecArmL' : 'J_pecArmR'];
      if (!sh || !wr) continue;
      const S = sh.getWorldPosition(new Vector3());
      const out = this.left(this.heading, new Vector3()).multiplyScalar(f.side);
      // the wrist: where it was put down if the arm reaches it there, else as close to it as the arm allows
      const Wd = f.contact.clone();
      Wd.y += hw;
      const D = new Vector3().subVectors(Wd, S);
      const d = D.length();
      const W = new Vector3();
      if (d >= a) W.copy(S).addScaledVector(D, a / Math.max(d, 1e-9));
      else {
        // the arm is longer than the way down: it splays out sideways (the wrist slides out along the mud)
        const dy = D.y;
        const r = Math.sqrt(Math.max(0, a * a - dy * dy));
        const hz = new Vector3(D.x, 0, D.z);
        if (hz.lengthSq() < 1e-12) hz.copy(out);
        hz.normalize();
        W.copy(S).addScaledVector(hz, r);
        W.y = S.y + dy;
      }
      const gW = w.ground(W.x, W.z);
      if (W.y < gW + hw) {
        // never through the mud: lift the wrist and keep the arm's length
        W.y = gW + hw;
        const v = new Vector3().subVectors(W, S);
        W.copy(S).addScaledVector(v, a / Math.max(v.length(), 1e-9));
      }
      // the web: its middle ray runs from the wrist along the planted heading and reaches the mud near its margin
      const hd = new Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      const lift = Math.max(0, W.y - gW - hw);
      // in the air (swinging forward) it is carried level with the wrist rather than dragged down to the mud
      const drop = Math.min(lift, f.planted || f.swing < 0 ? 0.7 * b : 0.25 * b);
      const horiz = Math.sqrt(Math.max(1e-12, b * b - drop * drop));
      const G = new Vector3(W.x + hd.x * horiz, 0, W.z + hd.z * horiz);
      G.y = Math.max(w.ground(G.x, G.z) + 0.0002 * s, W.y - drop);
      const dh = new Vector3().subVectors(G, W).normalize();
      // the web's plane lies on the mud (normal up, square to the middle ray), the leading edge a little raised
      const upv = new Vector3(0, 1, 0);
      let nh = upv.clone().sub(dh.clone().multiplyScalar(upv.dot(dh)));
      if (nh.lengthSq() < 1e-8) nh = out.clone();
      nh.normalize();
      const fwd = this.fwd(f.yaw - f.side * Math.PI / 2, new Vector3());
      let wh = new Vector3().crossVectors(nh, dh).normalize();
      if (wh.dot(fwd) < 0) { wh.negate(); nh.negate(); }
      // roll the leading edge up (the fin is pressed down along its trailing rays, its leading rays arched up), more on
      // soft mud where the fin is braced on its edge than on firm sand where it lies spread
      const nUp = nh.y >= 0 ? nh : nh.clone().negate();
      const roll = w.sand ? 0.3 : 0.75;
      wh.multiplyScalar(Math.cos(roll)).addScaledVector(nUp, Math.sin(roll)).normalize();
      // the arm's broad side faces out (its width runs fore and aft, the muscular paddle seen from the side); the hand
      // turns from it to the web's frame at the wrist
      const da = new Vector3().subVectors(W, S).normalize();
      const bodyFwd = this.fwd(this.heading, new Vector3());
      let wa = bodyFwd.clone().sub(da.clone().multiplyScalar(bodyFwd.dot(da)));
      if (wa.lengthSq() < 1e-8) wa = wh.clone().sub(da.clone().multiplyScalar(wh.dot(da)));
      wa.normalize();
      if (wa.dot(wh) < 0) wa.negate();
      // rest frame (object = J_root local at rest), mirrored for the right fin
      const sx = f.side;
      const D0 = new Vector3(rig.dir[0] * sx, rig.dir[1], rig.dir[2]);
      const W0 = new Vector3(rig.width[0] * sx, rig.width[1], rig.width[2]);
      const N0 = new Vector3().crossVectors(D0, W0).normalize();
      const restM = this.m1.makeBasis(D0, W0, N0);
      const restInv = this.m2.copy(restM).transpose();
      const toLocal = (parentQ: Quaternion, x: Vector3, y: Vector3, z: Vector3) => {
        const inv = parentQ.clone().invert();
        const lx = x.clone().applyQuaternion(inv), ly = y.clone().applyQuaternion(inv), lz = z.clone().applyQuaternion(inv);
        const m = new Matrix4().makeBasis(lx, ly, lz).multiply(restInv);
        return new Quaternion().setFromRotationMatrix(m);
      };
      // keep handedness: N must equal cross(D, W)
      const naR = new Vector3().crossVectors(da, wa);
      const nhR = new Vector3().crossVectors(dh, wh);
      const parentQ = rootBone.getWorldQuaternion(new Quaternion());
      const qArm = toLocal(parentQ, da, wa, naR);
      const armWorldQ = parentQ.clone().multiply(qArm);
      const qHand = toLocal(armWorldQ, dh, wh, nhR);
      // blend with the FK pose
      sh.quaternion.slerp(qArm, weight);
      sh.updateMatrixWorld(true);
      wr.quaternion.slerp(qHand, weight);
      wr.updateMatrixWorld(true);
    }
  }
}
