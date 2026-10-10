import { Color, Euler, Group, Matrix4, Object3D, Quaternion, Vector3, type SkinnedMesh } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Floor, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { Rng, hashInts } from '../../../core/Rng';
import { AkaeiModel, AkaeiPose, BELLY } from './AkaeiModel';
import { LATTICE_COLS, LATTICE_ROWS, TAIL_BONES, latticeU, latticeZ, tailAxisY, type Lod } from './geometry';
import { MORPH, halfWidth, tailSection, tailZ, ventralDepth } from './morphology';
import { SAND_COLOURS } from './material';
import { SandFX } from './SandFX';

/**
 * アカエイ: a benthic ray of the shallow sand. Five behaviours, each a sequence the driver runs on its own once the brain
 * has chosen it:
 *
 *   GLIDE_SWIM      lift off (shaking off any sand), glide low over the bottom on a travelling wave of the disc margins,
 *                   bank into turns with the outer fin beating harder, the tail trailing; slow and settle at the end.
 *   BOTTOM_REST     come down with a small flare, settle, let the margins drape onto the sand; breathe through the
 *                   spiracles; now and then a ripple runs round the margin.
 *   BURROW_IN_SAND  settle, then a few quick flaps of the margins with the head pumping: sand is thrown up from under the
 *                   disc over the back while the body works down into it, until only the eyes, spiracles and the hump of
 *                   the trunk show [PHOTO 009–011, 037; Shibuya et al. 2019 on stingray burying].
 *   FORAGE          cruise slowly with the head down over the bottom, stop on a spot, then pump: the head presses down,
 *                   the mouth (on the underside) sucks, the gills jet water out and sand blows from under the disc; a few
 *                   pulses, a short shift and again; it leaves a bowl of disturbed sand (the flat's 食痕).
 *   ESCAPE          from wherever it is (buried: in a burst of sand), a hard, fast beat of the whole disc, a sharp turn
 *                   away and a fast low glide, slowing to a cruise.
 *
 * The wave and the pose are in AkaeiPose/AkaeiModel; this class moves the animal over the ground and in the water.
 */
export type AkaeiState = 'GLIDE_SWIM' | 'BOTTOM_REST' | 'BURROW_IN_SAND' | 'FORAGE' | 'ESCAPE';

type Phase =
  | 'takeoff' | 'cruise' | 'arrive' // glide
  | 'land' | 'rest' // rest
  | 'dig' | 'buried' // burrow
  | 'search' | 'settle' | 'pulse' // forage
  | 'burst' | 'flee'; // escape

/** behaviour ids reported to the 図鑑 (species JSON encyclopedia.behaviors) */
export const AKAEI_EVENTS: Record<AkaeiState, string> = {
  GLIDE_SWIM: 'glide_swim', BOTTOM_REST: 'bottom_rest', BURROW_IN_SAND: 'burrow_in_sand', FORAGE: 'forage', ESCAPE: 'escape',
};

/** the model's total length at DW = 1 with an intact tail */
const TL_PER_DW = MORPH.zSnout - tailZ(1);
/** the model is built at DW = 1; the 図鑑 and the pick radius think of a 1 m animal */
export const MODEL_TL = 1;

const TWO_PI = Math.PI * 2;
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const approach = (cur: number, want: number, rate: number, dt: number): number => cur + (want - cur) * (1 - Math.exp(-rate * dt));
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** the individual's build: disc width, tail and look, from its id and length (deterministic) */
export function akaeiBuild(ind: Pick<Individual, 'id' | 'length_mm'>): { dw: number; aspect: number; tail: number; look: { tint: Color; dark: number; seed: number } } {
  const r = new Rng(hashString(ind.id) ^ 0x51ed27);
  // tails are often broken off short in the wild [PHOTO 021, 041]
  const tail = r.chance(0.14) ? r.range(0.5, 0.75) : r.range(0.88, 1.08);
  const dw = (ind.length_mm / 1000) / (MORPH.zSnout - MORPH.zEnd + MORPH.tailLength * tail);
  const dark = r.next();
  const v = r.range(0.9, 1.1);
  const tint = new Color(v * r.range(0.96, 1.05), v * r.range(0.97, 1.03), v * r.range(0.94, 1.04));
  return { dw, aspect: r.range(0.97, 1.03), tail, look: { tint, dark, seed: r.range(0, 40) } };
}

/** the world the tail and the disc touch */
interface Ground { (x: number, z: number): number }

export class AkaeiDriver implements Driver {
  private holder: Object3D | null = null;
  private ind: Individual | null = null;
  private model: AkaeiModel | null = null;
  private fx: SandFX | null = null;
  private readonly pose = new AkaeiPose();
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private floor: Floor | null = null;
  private readonly groundFn: Ground = (x, z) => (this.floor ? this.floor.heightAt(x, z) : this.fallbackY);
  private fallbackY = 0;

  // build
  private dw = 0.35;
  private aspect = 1;
  private tailK = 1;

  // behaviour
  state: AkaeiState = 'BOTTOM_REST';
  phase: Phase = 'rest';
  private phaseT = 0;
  private timer = 0;
  private target: Vector3 | null = null;
  private fleeFrom: Vector3 | null = null;
  private pulses = 0;
  private pulseT = 0;
  private spots = 0;
  private flaps = 0;
  private digStarted = false;
  private lastFlapCycle = 0;
  private nextRipple = 8;
  private alertK = 0;
  private wantState: AkaeiState | null = null;
  busy = false;

  // motion (world)
  readonly pos = new Vector3();
  heading = 0;
  private speed = 0;
  private vy = 0;
  private yawRate = 0;
  private pitch = 0;
  private roll = 0;
  /** 0 swimming … 1 lying on the bottom */
  grounded = 1;
  /** how far the body is worked into the sand (DW) */
  sink = 0;
  /** sand lying on the back and on the tail, 0..1 */
  sand = 0;
  private tailSand = 0;
  private groundMax = 0;
  private groundT = 0;
  private drapeT = 0;
  private time = 0;
  private breathT = 0;

  // wave state (smoothed toward the behaviour's wants)
  private amp = 0;
  private freq = 0.8;
  private waves = 1.05;
  private flapAmp = 0;
  private flapFreq = 2;
  private camber = 0;
  private frontLift = 0;
  private pump = 0;

  // tail chain (world)
  private readonly tailP = new Float32Array(TAIL_BONES * 3);
  private tailInit = false;
  private readonly tailModel = new Float32Array(TAIL_BONES * 3);

  // detail
  lod: Lod = 0;
  /** pin the detail level (viewers); null = by distance */
  forceLod: Lod | null = null;
  private fxOn = true;
  private sandColTimer = 0;

  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly mtx = new Matrix4();
  private readonly inv = new Matrix4();
  private readonly quat = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly scaleV = new Vector3();
  private readonly anchorV = new Vector3();

  /** the real model is built in attach() once the individual is known; this is only the holder */
  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'Akaei';
    return { root, parts: {}, length: MODEL_TL * 0.6 };
  }

  /** a mid-sized ray at rest, for the 図鑑 (1 m total length at the model scale, as the preview expects) */
  static makePreview(seed = 0.3): Object3D {
    const holder = new Group();
    holder.name = 'AkaeiPreview';
    const b = akaeiBuild({ id: `preview#${Math.floor(seed * 1000)}`, length_mm: 1000 });
    const model = new AkaeiModel(b.look, 0);
    model.root.scale.set(b.dw, b.dw, b.dw * b.aspect);
    const p = new AkaeiPose();
    p.camber = -0.004;
    p.amp = 0.03;
    p.phase = 1.2;
    model.pose(p);
    model.root.position.y = (BELLY + 0.002) * b.dw;
    // the 図鑑 disposes a preview's geometry when it closes: give it copies, not the shared LOD geometry
    model.root.traverse((o) => { const m = o as SkinnedMesh; if (m.isSkinnedMesh) m.geometry = m.geometry.clone(); });
    holder.add(model.root);
    holder.userData.disposable = true;
    return holder;
  }

  attach(root: Object3D, individual: Individual): void {
    this.holder = root;
    this.ind = individual;
    const b = akaeiBuild(individual);
    this.dw = b.dw;
    this.aspect = b.aspect;
    this.tailK = b.tail;
    this.model = new AkaeiModel(b.look, this.lod);
    this.model.root.scale.set(this.dw, this.dw, this.dw * this.aspect);
    root.add(this.model.root);
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    this.fx = new SandFX(root.parent ?? root);
    this.pos.copy(individual.pos);
    this.heading = individual.heading;
    this.fallbackY = individual.pos.y;
    this.tailInit = false;
    this.speed = 0; this.vy = 0; this.yawRate = 0;
    // most are found lying still on the bottom, many of them under the sand
    if (!this.attachedOnce) {
      this.attachedOnce = true;
      const buried = this.initial === 'auto' ? individual.rng.chance(0.45) : this.initial === 'buried';
      this.enter(buried ? 'BURROW_IN_SAND' : 'BOTTOM_REST', buried ? 'buried' : 'rest');
      this.grounded = 1;
      this.sink = buried ? this.sinkMax : 0;
      this.sand = buried ? 0.9 : individual.rng.range(0, 0.12);
      this.tailSand = buried ? 0.55 : 0;
      this.timer = individual.rng.range(5, 30);
    }
    this.settled = false;
    this.busy = this.timer > 0;
  }
  private attachedOnce = false;
  /** how a newly attached ray is found: at random (the field), or as asked (viewers, tests) */
  initial: 'auto' | 'rest' | 'buried' = 'auto';
  private settled = false;

  private get sinkMax(): number { return BELLY + 0.006; }

  detach(): void {
    this.model?.dispose();
    this.fx?.dispose();
    this.model = null;
    this.fx = null;
    this.holder = null;
  }

  // ------------------------------------------------------------------ intents

  setIntent(intent: Intent): void {
    const ind = this.ind;
    if (!ind) return;
    this.busy = true;
    this.timer = intent.seconds > 0 ? intent.seconds : 8;
    switch (intent.kind) {
      case 'flee': {
        this.fleeFrom = intent.from ? intent.from.clone() : null;
        this.target = intent.target ? intent.target.clone() : null;
        this.timer = Math.max(this.timer, 4);
        this.enter('ESCAPE', 'burst');
        break;
      }
      case 'wander': case 'moveTo': {
        this.target = intent.target ? intent.target.clone() : null;
        this.timer = Math.max(this.timer, 15);
        this.enter('GLIDE_SWIM', this.grounded > 0.5 ? 'takeoff' : 'cruise');
        break;
      }
      case 'forage': {
        this.spots = 0;
        this.timer = Math.max(this.timer, 8);
        this.enter('FORAGE', this.grounded > 0.5 ? 'takeoff' : 'search');
        this.pickForageSpot();
        break;
      }
      case 'burrow': {
        if (this.state === 'BURROW_IN_SAND' && this.phase === 'buried') break;
        this.target = null;
        this.enter('BURROW_IN_SAND', this.grounded > 0.95 ? 'dig' : 'land');
        break;
      }
      case 'display': {
        // alarm: a ray on the bottom freezes, pressed flat; one swimming keeps on
        this.alertK = 1;
        if (this.state === 'GLIDE_SWIM' || this.state === 'ESCAPE') { this.timer = Math.min(this.timer, 3); break; }
        if (this.state !== 'BURROW_IN_SAND') this.enter('BOTTOM_REST', this.grounded > 0.95 ? 'rest' : 'land');
        break;
      }
      default: {
        // rest (and anything else): stay put; under the sand it stays buried
        this.target = null;
        if (this.state === 'BURROW_IN_SAND' && this.phase === 'buried') break;
        this.enter('BOTTOM_REST', this.grounded > 0.95 ? 'rest' : 'land');
      }
    }
  }

  private enter(state: AkaeiState, phase: Phase): void {
    const changed = state !== this.state;
    this.state = state;
    this.phase = phase;
    this.phaseT = 0;
    this.pulses = 0;
    this.flaps = 0;
    this.lastFlapCycle = 0;
    this.digStarted = false;
    if (changed && (state !== 'BOTTOM_REST' || phase === 'rest') && state !== 'FORAGE') this.emit(AKAEI_EVENTS[state]);
    if (state !== 'BOTTOM_REST') this.alertK = 0;
  }

  private setPhase(p: Phase): void { this.phase = p; this.phaseT = 0; }

  /** a spot ahead on the bottom, in water deep enough */
  private pickForageSpot(): void {
    const ind = this.ind!;
    const f = this.floor;
    for (let k = 0; k < 6; k++) {
      const a = this.heading + ind.rng.range(-0.8, 0.8), d = ind.rng.range(0.4, 1.6) * Math.max(0.6, this.dw / 0.35);
      const x = this.pos.x + Math.sin(a) * d, z = this.pos.z + Math.cos(a) * d;
      if (!f || f.waterAt(x, z) - f.heightAt(x, z) > this.minDepth) { this.target = new Vector3(x, 0, z); return; }
    }
    this.target = new Vector3(this.pos.x + Math.sin(this.heading) * 0.3, 0, this.pos.z + Math.cos(this.heading) * 0.3);
  }

  private minDepth = 0.05;

  // ------------------------------------------------------------------ update

  update(dtIn: number, ctx: DriverContext): void {
    const ind = this.ind, model = this.model, holder = this.holder;
    if (!ind || !model || !holder) return;
    this.floor = ctx.floor;
    this.minDepth = ctx.minDepth ?? 0.05;
    const dt = Math.min(0.05, dtIn * ctx.simScale);
    if (dt <= 0) return;
    this.time += dt;
    this.phaseT += dt;
    this.timer -= dt;
    const dw = this.dw;

    // detail by distance to the player (with a little hysteresis)
    const dist = ctx.player.distanceTo(this.pos);
    const byDistance: Lod = ctx.locked || ctx.bounds ? 0 : dist < (this.lod === 0 ? 8 : 7) ? 0 : dist < (this.lod <= 1 ? 22 : 20) ? 1 : 2;
    const want = this.forceLod ?? byDistance;
    if (want !== this.lod) { this.lod = want; model.setLod(want); }
    this.fxOn = this.lod <= 1;

    if (!this.settled) {
      this.settled = true;
      const g = this.groundFn(this.pos.x, this.pos.z);
      this.pos.y = this.grounded > 0.5 ? g + (BELLY - this.sink) * dw : g + (BELLY + 0.15) * dw;
      this.groundMax = g;
    }

    // ground and water around the disc
    const g0 = this.groundFn(this.pos.x, this.pos.z);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
    const r = 0.36 * dw;
    const hF = this.groundFn(this.pos.x + fx * r, this.pos.z + fz * r), hB = this.groundFn(this.pos.x - fx * r, this.pos.z - fz * r);
    const hL = this.groundFn(this.pos.x + lx * r, this.pos.z + lz * r), hR = this.groundFn(this.pos.x - lx * r, this.pos.z - lz * r);
    this.groundT -= dt;
    const gMaxNow = Math.max(g0, hF, hB, hL, hR);
    this.groundMax = this.groundT <= 0 ? gMaxNow : Math.max(gMaxNow, this.groundMax - dt * 0.05);
    if (this.groundT <= 0) this.groundT = 0.15;
    const water = ctx.floor.waterAt(this.pos.x, this.pos.z);
    const lieY = Math.max(g0, 0.5 * (hF + hB), 0.5 * (hL + hR)) + (BELLY - this.sink) * dw;
    const ceiling = water - 0.075 * dw - 0.008;

    // the behaviour sets what it wants this frame
    const w = this.wants;
    w.speed = 0; w.clear = -1; w.amp = 0; w.freq = 0.8; w.waves = 1.05; w.flap = 0; w.flapFreq = 2; w.camber = 0; w.front = 0; w.pump = 0;
    w.yawMax = 1.4; w.accel = 0.9; w.face = null;
    this.behave(dt, ind, ctx);

    // steering and speed
    const tgt = this.target;
    let wantHeading = this.heading;
    if (w.face !== null) wantHeading = w.face;
    else if (tgt && w.speed > 0) wantHeading = Math.atan2(tgt.x - this.pos.x, tgt.z - this.pos.z);
    const dh = wrap(wantHeading - this.heading);
    // a ray turns by banking: quicker the faster it goes, but it can pivot slowly on the spot
    const yawMax = w.yawMax * (0.35 + 0.65 * Math.min(1, (this.speed / dw) / 1.2));
    const wantYaw = Math.max(-yawMax, Math.min(yawMax, dh * 2.4));
    this.yawRate = approach(this.yawRate, this.grounded > 0.9 ? 0 : wantYaw, 5, dt);
    this.heading = wrap(this.heading + this.yawRate * dt);
    // slow for sharp turns
    const turnSlow = 1 - 0.5 * Math.min(1, Math.abs(dh) / 1.6);
    const wantV = w.speed * dw * (w.yawMax > 3 ? 1 : turnSlow);
    const a = wantV > this.speed ? w.accel * dw : 1.6 * dw;
    this.speed += Math.max(-a * dt, Math.min(a * dt, wantV - this.speed));
    if (this.grounded > 0.9 && w.speed === 0) this.speed = approach(this.speed, 0, 6, dt);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    const b = ctx.bounds;
    if (b) {
      this.pos.x = Math.max(b.minX + 0.5 * dw, Math.min(b.maxX - 0.5 * dw, this.pos.x));
      this.pos.z = Math.max(b.minZ + 0.5 * dw, Math.min(b.maxZ - 0.5 * dw, this.pos.z));
    }

    // height: lie on the bottom, or swim at a clearance (never through the surface)
    const groundedWant = w.clear < 0 ? 1 : 0;
    this.grounded = approach(this.grounded, groundedWant, groundedWant > this.grounded ? 3.5 : 6, dt);
    if (groundedWant === 1 && Math.abs(this.pos.y - lieY) < 0.004 * dw + 0.002) this.grounded = Math.max(this.grounded, 0.97);
    let yWant: number;
    if (w.clear < 0) yWant = lieY;
    else yWant = Math.max(lieY + 0.004, Math.min(ceiling, this.groundMax + BELLY * dw + w.clear));
    yWant = Math.max(yWant, lieY - 0.0005);
    const vyWant = Math.max(-0.35, Math.min(0.5, (yWant - this.pos.y) * 3.2));
    this.vy = approach(this.vy, vyWant, 6, dt);
    this.pos.y += this.vy * dt;
    if (this.pos.y < lieY - 0.002) { this.pos.y = lieY - 0.002; this.vy = Math.max(0, this.vy); }

    // attitude: on the bottom it follows the ground; swimming it pitches with its climb and banks into turns
    const pitchGround = Math.atan2(hF - hB, 2 * r), rollGround = Math.atan2(hL - hR, 2 * r);
    const pitchSwim = Math.atan2(this.vy, Math.max(0.05, this.speed)) * 0.55 + w.front * 2.5;
    const rollSwim = -Math.max(-0.45, Math.min(0.45, this.yawRate * (this.speed / dw) * 0.22));
    const gk = smooth(0.3, 0.95, this.grounded);
    this.pitch = approach(this.pitch, pitchGround * gk + pitchSwim * (1 - gk), 4, dt);
    this.roll = approach(this.roll, rollGround * gk + rollSwim * (1 - gk), 4, dt);

    // the wave and the rest of the pose
    const sizeK = Math.pow(0.35 / dw, 0.3);
    const fast = this.state === 'ESCAPE' && this.phase === 'burst';
    const k = fast ? 12 : 3;
    this.amp = approach(this.amp, w.amp, k, dt);
    this.freq = approach(this.freq, w.freq * sizeK, k, dt);
    this.waves = approach(this.waves, w.waves, 2, dt);
    this.flapAmp = approach(this.flapAmp, w.flap, 9, dt);
    this.flapFreq = w.flapFreq;
    this.camber = approach(this.camber, w.camber, 3, dt);
    this.frontLift = approach(this.frontLift, w.front, 4, dt);
    this.pump = approach(this.pump, w.pump, 14, dt);
    const p = this.pose;
    p.phase = (p.phase + TWO_PI * this.freq * dt) % (TWO_PI * 1000);
    p.flapPhase = (p.flapPhase + TWO_PI * this.flapFreq * dt) % (TWO_PI * 1000);
    p.amp = this.amp;
    p.waves = this.waves;
    p.turn = Math.max(-1, Math.min(1, this.yawRate / 1.6));
    p.flapAmp = this.flapAmp;
    p.camber = this.camber;
    p.frontLift = this.frontLift;
    p.pump = this.pump;
    // breathing through the spiracles: ~ 35 a minute at rest, the valves shut as the gills blow
    this.breathT += dt * (this.alertK > 0.5 ? 0.35 : this.grounded > 0.5 ? 0.6 : 0.8);
    const br = 0.5 + 0.5 * Math.sin(this.breathT * TWO_PI);
    p.breath = br * (0.4 + 0.6 * this.grounded);
    // the valve stays shut but for a dark slit, and opens only briefly at the top of each breath [PHOTO 011, 027]
    p.spiracle = smooth(0.55, 1, br) * 0.75 * (this.alertK > 0.5 ? 0.3 : 1);
    p.gills = (1 - br) * 0.35;
    this.applyFeedingOpenings(p);
    p.drapeK = smooth(0.5, 1, this.grounded);
    this.alertK = Math.max(0, this.alertK - dt * 0.08);

    // place the holder, then everything that hangs off the body's frame
    this.euler.set(-this.pitch, this.heading, this.roll);
    this.quat.setFromEuler(this.euler);
    holder.position.copy(this.pos);
    holder.quaternion.copy(this.quat);
    this.scaleV.set(dw, dw, dw * this.aspect);
    this.mtx.compose(this.pos, this.quat, this.scaleV);
    this.inv.copy(this.mtx).invert();
    this.posed = true;
    if (p.drapeK > 0.01) this.updateDrape(dt);
    this.updateTail(dt);
    p.tail = this.tailModel;
    model.pose(p);
    const U = model.uniforms.uAkSand.value;
    U.set(this.sand, this.tailSand, this.sink / this.sinkMax, this.grounded * smooth(0.2, 1, this.sand));

    // the sand under it
    const fxs = this.fx!;
    this.sandColTimer -= dt;
    if (this.sandColTimer <= 0 && ctx.floor.sampleAt) {
      this.sandColTimer = 2;
      const s = ctx.floor.sampleAt(this.pos.x, this.pos.z);
      const c = SAND_COLOURS[s?.substrate ?? 'sand'] ?? SAND_COLOURS.sand;
      fxs.setSandColour(c);
      model.uniforms.uAkSandCol.value.setRGB(c.x, c.y, c.z);
    }
    const clearance = this.pos.y - (BELLY - this.sink) * dw - g0;
    const contact = 1 - smooth(0.0, 0.18 + 0.5 * dw, clearance);
    const buriedK = 1 - 0.85 * Math.min(1, this.sink / this.sinkMax);
    fxs.updateShadow(dt, this.pos.x, this.pos.z, this.heading, 0.5 * dw, 0.43 * dw * this.aspect, contact * buriedK, this.groundFn, this.speed > 0.02 || Math.abs(this.vy) > 0.01);
    fxs.update(dt, this.groundFn);

    ind.pos.copy(this.pos);
    ind.heading = this.heading;
    if (this.timer <= 0 && this.busyDone()) this.busy = false;
  }

  /** whether the current behaviour may hand control back when its time is up */
  private busyDone(): boolean {
    if (this.state === 'BURROW_IN_SAND') return this.phase === 'buried';
    if (this.state === 'BOTTOM_REST') return this.phase === 'rest';
    if (this.state === 'FORAGE') return this.phase !== 'pulse';
    if (this.state === 'ESCAPE') return this.phase !== 'burst';
    return true;
  }

  private readonly wants = {
    speed: 0, clear: -1, amp: 0, freq: 0.8, waves: 1.05, flap: 0, flapFreq: 2, camber: 0, front: 0, pump: 0, yawMax: 1.4, accel: 0.9,
    face: null as number | null,
  };
  private mouthOpen = 0;
  private gillJet = 0;

  private applyFeedingOpenings(p: AkaeiPose): void {
    p.mouth = this.mouthOpen;
    p.gills = Math.max(p.gills, this.gillJet);
  }

  /** the behaviour's sequence: fills `wants`, moves between phases, throws sand */
  private behave(dt: number, ind: Individual, ctx: DriverContext): void {
    const w = this.wants;
    const dw = this.dw;
    this.mouthOpen = approach(this.mouthOpen, 0, 4, dt);
    this.gillJet = approach(this.gillJet, 0, 3, dt);
    // sand falls off a ray that is moving; it stays on one lying still
    if (this.grounded < 0.8 || this.speed > 0.05 * dw) {
      const before = this.sand;
      this.sand = Math.max(0, this.sand - dt * (this.state === 'ESCAPE' ? 2.5 : 0.9));
      this.tailSand = Math.max(0, this.tailSand - dt * 0.8);
      if (this.fxOn && before - this.sand > 0.004) this.shedSand(before - this.sand);
    }
    if (this.state !== 'BURROW_IN_SAND') this.sink = Math.max(0, this.sink - dt * (this.state === 'ESCAPE' ? 0.4 : 0.06));

    const dist = this.target ? Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) : 0;
    switch (this.state) {
      case 'GLIDE_SWIM': {
        if (this.phase === 'takeoff') {
          this.takeoff(w, dt);
          if (this.phaseT > 0.7) this.setPhase('cruise');
          break;
        }
        const cruiseV = 0.95 + 0.25 * Math.sin(this.time * 0.37 + this.dw * 10);
        w.clear = Math.max(0.03, 0.06 + 0.28 * dw);
        w.speed = this.phase === 'arrive' ? 0 : cruiseV * Math.min(1, dist / (0.8 * dw) + 0.25);
        this.cruiseWave(w);
        w.camber = 0.006;
        if (this.phase === 'cruise' && (!this.target || dist < 0.15 * dw + 0.05)) { this.setPhase('arrive'); }
        if (this.phase === 'arrive') {
          w.speed = 0;
          w.clear = 0.04 + 0.12 * dw;
          w.amp = 0.02; w.freq = 0.7;
          if (this.phaseT > 1.2) { this.busy = false; this.timer = 0; }
        }
        break;
      }
      case 'BOTTOM_REST': {
        if (this.phase === 'land') {
          this.land(w, dt);
          if (this.grounded > 0.95) { this.setPhase('rest'); this.touchdown(); this.emit(AKAEI_EVENTS.BOTTOM_REST); }
          break;
        }
        w.clear = -1;
        w.camber = this.alertK > 0.5 ? -0.012 : -0.007;
        // now and then a ripple runs round the margin
        this.nextRipple -= dt;
        if (this.nextRipple < 1.5 && this.nextRipple > 0) { w.amp = 0.012 * Math.sin(Math.PI * (1.5 - this.nextRipple) / 1.5); w.freq = 1.1; w.waves = 1.3; }
        if (this.nextRipple <= 0) this.nextRipple = ind.rng.range(8, 22);
        break;
      }
      case 'BURROW_IN_SAND': {
        if (this.phase === 'land') {
          this.land(w, dt);
          if (this.grounded > 0.95) { this.setPhase('dig'); this.touchdown(); }
          break;
        }
        w.clear = -1;
        if (this.phase === 'dig') {
          // a moment pressed flat, then 4–6 quick flaps with the head pumping; each throws sand up from under the margins
          // and over the back while the body works itself down [Shibuya et al. 2019: 60–97 % of the back covered]
          const nFlaps = 4 + (hashInts(this.dw * 1e4, 3) % 3);
          w.flapFreq = 1.9;
          const cycle = Math.floor(this.pose.flapPhase / TWO_PI);
          if (!this.digStarted) { this.digStarted = true; this.lastFlapCycle = cycle; this.digImprint(); }
          w.flap = 0.05 * smooth(0.25, 0.45, this.phaseT);
          w.pump = 0.006 * (0.5 + 0.5 * Math.sin(this.pose.flapPhase + Math.PI / 2));
          w.camber = -0.004;
          if (this.phaseT < 0.45) this.lastFlapCycle = cycle;
          else if (cycle !== this.lastFlapCycle) {
            this.lastFlapCycle = cycle;
            this.flaps++;
            this.sand = Math.min(0.94, this.sand + 0.19);
            this.tailSand = Math.min(0.55, this.tailSand + 0.14);
            if (this.fxOn) this.throwSandOverBack(1);
            this.fx?.growImprint(Math.min(1, this.flaps / nFlaps));
          }
          if (this.phaseT > 0.4) this.sink = Math.min(this.sinkMax, this.sink + dt * this.sinkMax / (nFlaps / 1.9 + 0.3));
          if (this.flaps >= nFlaps) this.setPhase('buried');
          break;
        }
        // buried: quite still; only the spiracles work, and the last of the thrown sand settles on the back
        w.camber = -0.006;
        this.sand = approach(this.sand, 0.92, 0.5, dt);
        this.sink = approach(this.sink, this.sinkMax, 2, dt);
        break;
      }
      case 'FORAGE': {
        if (this.phase === 'takeoff') {
          this.takeoff(w, dt);
          if (this.phaseT > 0.6) this.setPhase('search');
          break;
        }
        if (this.phase === 'search') {
          // slow, low, head down over the bottom
          w.speed = 0.5 * Math.min(1, dist / (0.4 * dw) + 0.2);
          w.clear = 0.012 + 0.02 * dw;
          w.amp = 0.055; w.freq = 0.9; w.waves = 1.25;
          w.front = -0.004;
          w.camber = 0.002;
          if (!this.target || dist < 0.05 + 0.08 * dw || this.phaseT > 12) this.setPhase('settle');
          break;
        }
        if (this.phase === 'settle') {
          w.speed = 0;
          w.clear = -1;
          w.amp = 0.015; w.freq = 0.9;
          w.front = -0.003;
          if (this.grounded > 0.85 || this.phaseT > 1.4) {
            this.setPhase('pulse');
            this.pulses = 0;
            this.pulseT = 0;
            this.fx?.imprint(this.pos.x + Math.sin(this.heading) * 0.12 * dw, this.pos.z + Math.cos(this.heading) * 0.12 * dw, this.heading, 0.42 * dw, 0.36 * dw, this.groundFn, 0.2);
            if (this.spots === 0) this.emit(AKAEI_EVENTS.FORAGE);
          }
          break;
        }
        // pulse: the head presses down, the mouth sucks, the gills jet, sand blows from under the disc
        w.clear = -1;
        w.camber = 0.004;
        const T = 1.15;
        this.pulseT += dt;
        const ph = this.pulseT / T;
        const press = ph < 0.25 ? smooth(0, 0.25, ph) : 1 - smooth(0.25, 1, ph);
        w.pump = 0.013 * press;
        w.front = -0.002 - 0.006 * press;
        w.flap = 0.012;
        w.flapFreq = 3.2;
        this.mouthOpen = Math.max(this.mouthOpen, press);
        if (ph > 0.3) this.gillJet = Math.max(this.gillJet, smooth(0.3, 0.45, ph) * (1 - smooth(0.6, 0.95, ph)));
        if (ph >= 0.25 && ph - dt / T < 0.25 && this.fxOn) this.feedingPuff();
        // a small shift between pulses: the head swings to a fresh patch
        if (ph > 0.6) w.face = this.heading + Math.sin(this.pulses * 2.1 + this.dw * 7) * 0.5;
        w.yawMax = 0.4;
        if (ph >= 1) {
          this.pulseT = 0;
          this.pulses++;
          this.fx?.growImprint(Math.min(1, 0.35 + this.pulses * 0.15));
          const n = 3 + (hashInts(this.dw * 1e4, this.spots, 5) % 4);
          if (this.pulses >= n) {
            this.spots++;
            if (this.timer > 3 && this.spots < 3) { this.pickForageSpot(); this.setPhase('search'); }
            else { this.target = null; this.enter('BOTTOM_REST', 'rest'); this.busy = false; this.timer = 0; }
          }
        }
        break;
      }
      case 'ESCAPE': {
        if (this.phase === 'burst') {
          if (this.phaseT < dt * 1.5 && this.fxOn && (this.grounded > 0.6 || this.sand > 0.2)) this.burstPuff();
          // away from the threat, at once
          // toward the flight target (already bent along the water), else straight away from the threat
          const away = this.target && Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) > 0.2 ? Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z)
            : this.fleeFrom ? Math.atan2(this.pos.x - this.fleeFrom.x, this.pos.z - this.fleeFrom.z) : this.heading;
          w.face = away;
          w.yawMax = 5.5;
          w.speed = 4.2;
          w.accel = 9;
          w.clear = 0.06 + 0.3 * dw;
          w.amp = 0.2; w.freq = 2.8; w.waves = 0.82;
          w.flap = this.phaseT < 0.35 ? 0.05 : 0;
          w.flapFreq = 3;
          w.camber = 0.004;
          if (this.phaseT > 1.25) this.setPhase('flee');
          break;
        }
        // keep going, easing to a cruise
        const k = smooth(0, 2.5, this.phaseT);
        w.speed = 4.2 * (1 - k) + 1.2 * k;
        w.clear = 0.06 + 0.3 * dw;
        if (this.target && Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 0.3) this.target = null;
        if (!this.target) w.face = this.heading;
        this.cruiseWave(w);
        w.amp = Math.max(w.amp, 0.2 * (1 - k));
        w.freq = Math.max(w.freq, 2.8 * (1 - k));
        w.camber = 0.006;
        break;
      }
    }
    void ctx;
  }

  /** the swimming wave for the current speed */
  private cruiseWave(w: AkaeiDriver['wants']): void {
    const v = this.speed / this.dw;
    // a deep wave: the margins rise and fall by 0.1–0.17 DW [PHOTO 004, 008, 018, 069]
    w.amp = Math.min(0.155, 0.08 + 0.05 * v);
    w.freq = Math.min(2.1, 0.6 + 0.75 * v);
    w.waves = 1.05;
  }

  /** leaving the bottom: a strong first beat, the snout up, sand lifted with it */
  private takeoff(w: AkaeiDriver['wants'], _dt: number): void {
    w.clear = 0.04 + 0.2 * this.dw;
    w.speed = 0.6;
    w.flap = this.phaseT < 0.45 ? 0.045 : 0;
    w.flapFreq = 2.4;
    w.amp = 0.08; w.freq = 1.4;
    w.front = 0.006;
    if (this.phaseT < 0.05 && this.fxOn && this.grounded > 0.6) this.ringPuff(10, 0.12, 0.35);
  }

  /** coming down: slow, a small flare of the front, margins reaching for the sand */
  private land(w: AkaeiDriver['wants'], _dt: number): void {
    w.clear = this.phaseT < 0.8 ? 0.02 : -1;
    w.speed = Math.max(0, 0.4 - this.phaseT * 0.4);
    w.amp = 0.02; w.freq = 0.8;
    w.front = 0.004 * smooth(0.2, 0.7, this.phaseT) * (1 - smooth(0.9, 1.3, this.phaseT));
    w.camber = -0.004;
  }

  private touchdown(): void {
    if (this.fxOn) this.ringPuff(8, 0.08, 0.3);
  }

  private digImprint(): void {
    this.fx?.imprint(this.pos.x, this.pos.z, this.heading, 0.62 * this.dw, 0.55 * this.dw * this.aspect, this.groundFn, 0.15);
  }

  // ------------------------------------------------------------------ sand thrown about

  /** a world point on the margin at across fraction u (±1) and station z (bind, DW units) */
  private marginPoint(u: number, z: number, out: Vector3): Vector3 {
    out.set(u * halfWidth(z), -ventralDepth(u * halfWidth(z) * 0.9, z) * 0.5, z);
    return out.applyMatrix4(this.mtx);
  }

  /** sediment kicked out all round the rim (landing, lifting off) */
  private ringPuff(n: number, speed: number, alpha: number): void {
    const fx = this.fx, rnd = () => this.ind!.rng.next();
    if (!fx) return;
    const size = 0.05 + 0.12 * this.dw;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const z = MORPH.zSnout - 0.04 - t * (MORPH.zSnout - MORPH.zRear - 0.06);
      const side = i % 2 ? 1 : -1;
      this.marginPoint(side * 0.95, z, this.tmp);
      this.tmp2.set(this.tmp.x - this.pos.x, 0, this.tmp.z - this.pos.z).normalize().multiplyScalar(speed);
      this.tmp2.y = speed * 0.6;
      fx.emit(this.tmp, this.tmp2, 2, 0.02 * this.dw / 0.35, size, 2.6, alpha, rnd);
    }
  }

  /** a burrowing flap: sand fluidised under the margins thrown up and over the back */
  private throwSandOverBack(k: number): void {
    const fx = this.fx, rnd = () => this.ind!.rng.next();
    if (!fx) return;
    const size = 0.04 + 0.1 * this.dw;
    for (let i = 0; i < 12; i++) {
      const t = (i >> 1) / 6;
      const z = MORPH.zSnout - 0.08 - t * (MORPH.zSnout - MORPH.zRear - 0.1);
      const side = i % 2 ? 1 : -1;
      this.marginPoint(side * 0.92, z, this.tmp);
      // inward and up, over the disc
      this.tmp2.set(this.pos.x - this.tmp.x, 0, this.pos.z - this.tmp.z).normalize().multiplyScalar(0.09 * k);
      this.tmp2.y = 0.16 * k;
      fx.emit(this.tmp, this.tmp2, 2, 0.015, size, 2.2, 0.45, rnd);
    }
  }

  /** a feeding pulse: a cloud from under the head and jets out from under the sides behind it */
  private feedingPuff(): void {
    const fx = this.fx, rnd = () => this.ind!.rng.next();
    if (!fx) return;
    const size = 0.04 + 0.1 * this.dw;
    this.tmp.set(0, -BELLY, MORPH.mouth.z + 0.1).applyMatrix4(this.mtx);
    this.tmp2.set(Math.sin(this.heading) * 0.1, 0.12, Math.cos(this.heading) * 0.1);
    fx.emit(this.tmp, this.tmp2, 6, 0.03 * this.dw / 0.35, size, 2.4, 0.4, rnd);
    for (const side of [-1, 1]) {
      this.marginPoint(side * 0.97, 0.12, this.tmp);
      this.tmp2.set(this.tmp.x - this.pos.x, 0, this.tmp.z - this.pos.z).normalize().multiplyScalar(0.16);
      this.tmp2.y = 0.06;
      fx.emit(this.tmp, this.tmp2, 4, 0.015, size * 0.8, 1.8, 0.35, rnd);
    }
  }

  /** bursting out of cover: the whole disc throws its sand */
  private burstPuff(): void {
    const fx = this.fx, rnd = () => this.ind!.rng.next();
    if (!fx) return;
    const size = 0.06 + 0.14 * this.dw;
    for (let i = 0; i < 14; i++) {
      const t = (i >> 1) / 7;
      const z = MORPH.zSnout - 0.05 - t * (MORPH.zSnout - MORPH.zRear - 0.08);
      const side = i % 2 ? 1 : -1;
      this.marginPoint(side * 0.9, z, this.tmp);
      this.tmp2.set(this.tmp.x - this.pos.x, 0, this.tmp.z - this.pos.z).normalize().multiplyScalar(0.3);
      this.tmp2.y = 0.28;
      fx.emit(this.tmp, this.tmp2, 3, 0.03 * this.dw / 0.35, size, 3.2, 0.55, rnd);
    }
  }

  /** sand sliding off the back as the ray gets moving */
  private shedSand(amount: number): void {
    const fx = this.fx, rnd = () => this.ind!.rng.next();
    if (!fx) return;
    const n = Math.min(6, Math.ceil(amount * 40));
    for (let i = 0; i < n; i++) {
      const u = (rnd() * 2 - 1) * 0.8, z = MORPH.zSnout - 0.1 - rnd() * 0.6;
      this.tmp.set(u * halfWidth(z), 0.03, z).applyMatrix4(this.mtx);
      this.tmp2.set(-Math.sin(this.heading) * this.speed * 0.6, 0.02, -Math.cos(this.heading) * this.speed * 0.6);
      fx.emit(this.tmp, this.tmp2, 1, 0.02, 0.04 + 0.08 * this.dw, 2.0, 0.35, rnd);
    }
  }

  // ------------------------------------------------------------------ drape and tail

  /** how the margins meet uneven ground: per lattice node, the ground relative to the belly line (model units) */
  private updateDrape(dt: number): void {
    this.drapeT -= dt;
    if (this.drapeT > 0) return;
    this.drapeT = this.speed > 0.01 ? 0.1 : 0.5;
    const p = this.pose, dw = this.dw;
    const C = LATTICE_COLS;
    for (let r = 0; r < LATTICE_ROWS; r++) {
      const z = latticeZ(r), wz = halfWidth(z);
      for (let c = 0; c < C; c++) {
        const x = latticeU(c) * wz;
        const vd = ventralDepth(x, z);
        this.tmp.set(x, -vd, z).applyMatrix4(this.mtx);
        // the highest sand around the node: the skin between nodes must clear the ripple crests too
        const rr = 0.045 * dw;
        let g = this.groundFn(this.tmp.x, this.tmp.z);
        for (let q = 0; q < 4; q++) g = Math.max(g, this.groundFn(this.tmp.x + (q === 0 ? rr : q === 1 ? -rr : 0), this.tmp.z + (q === 2 ? rr : q === 3 ? -rr : 0)));
        // the underside of the fin rests on the sand; buried, the trunk is down in it and the fins lie level with its
        // surface under their coat of sand, so the whole outline still shows as a low relief [PHOTO 009–011]
        const under = this.sink > 0.002 ? 0.0012 * Math.abs(latticeU(c)) : -0.0015;
        const d = (g - this.tmp.y) / dw - under;
        p.drape[r * C + c] = Math.max(-0.035, Math.min(0.035, d));
      }
    }
  }

  /**
   * The tail is not a propeller: it trails behind on a follow chain, a little heavier than the water, stiff at the base
   * and the sting, a free whip at the end. It lags into curves on a turn, lies on the sand when the ray rests and
   * never goes through the bottom.
   */
  private updateTail(dt: number): void {
    const P = this.tailP, dw = this.dw;
    const seg = (MORPH.tailLength * this.tailK / (TAIL_BONES - 1)) * dw;
    const ys = this.model!.ys;
    const baseYModel = ys[(LATTICE_ROWS - 1) * LATTICE_COLS + (LATTICE_COLS - 1) / 2];
    const base = this.tmp.set(0, tailAxisY(0) + baseYModel, MORPH.zEnd).applyMatrix4(this.mtx);
    // the tail leaves the trunk along the body, but trails level in the water (it does not tilt up with a nose-down body)
    const back = this.tmp2.set(0, 0, -1).applyQuaternion(this.quat);
    back.y *= 0.35;
    back.normalize();
    if (!this.tailInit) {
      this.tailInit = true;
      for (let j = 0; j < TAIL_BONES; j++) {
        const x = base.x + back.x * seg * j, z = base.z + back.z * seg * j;
        const y = Math.max(base.y + back.y * seg * j, this.groundFn(x, z) + tailSection(j / (TAIL_BONES - 1)).c * dw);
        P[j * 3] = x; P[j * 3 + 1] = y; P[j * 3 + 2] = z;
      }
    }
    // A firm rod, not a string [PHOTO 004, 014, 032, 059, 065, 066: held straight behind the swimming ray]. Each segment
    // keeps its length and is pulled hard into line with the one before it (very stiff over the base and the sting,
    // softer only in the last fifth, the whip), eased back toward the body's own axis, and never bent more than a few
    // degrees at any joint. Its last position gives it inertia, so it trails into a turn as a smooth arc and straightens.
    // A little heavier than the water: on the bottom it settles onto the sand; swimming it barely sags.
    const drop = dt * (0.04 + 0.6 * this.grounded);
    const restK = 1 - Math.exp(-dt * 3);
    P[0] = base.x; P[1] = base.y; P[2] = base.z;
    P[3] = P[0] + back.x * seg; P[4] = P[1] + back.y * seg; P[5] = P[2] + back.z * seg;
    let px = back.x, py = back.y, pz = back.z;
    for (let j = 2; j < TAIL_BONES; j++) {
      const i = j * 3;
      const s = j / (TAIL_BONES - 1);
      const whip = smooth(0.72, 1, s);
      // how strongly this segment lines up with the previous one per second
      const kb = 1 - Math.exp(-dt * (70 * (1 - whip) + 9 * whip));
      let dx = P[i] - P[i - 3], dy = P[i + 1] - P[i - 2], dz = P[i + 2] - P[i - 1];
      let L = Math.hypot(dx, dy, dz) || 1e-6;
      dx /= L; dy = dy / L - drop; dz /= L;
      dx += (px - dx) * kb; dy += (py - dy) * kb; dz += (pz - dz) * kb;
      // and back toward the body's line (the tail's own shape)
      dx += (back.x - dx) * restK; dz += (back.z - dz) * restK;
      L = Math.hypot(dx, dy, dz) || 1e-6;
      dx /= L; dy /= L; dz /= L;
      // the joint can bend only so far: ~2.5° near the base, ~9° in the whip
      const maxA = 0.045 + 0.11 * whip;
      const c = Math.max(-1, Math.min(1, dx * px + dy * py + dz * pz));
      const ang = Math.acos(c);
      if (ang > maxA) {
        const t = maxA / ang, so = Math.sin(ang);
        const k0 = Math.sin((1 - t) * ang) / so, k1 = Math.sin(t * ang) / so;
        dx = px * k0 + dx * k1; dy = py * k0 + dy * k1; dz = pz * k0 + dz * k1;
        L = Math.hypot(dx, dy, dz) || 1e-6;
        dx /= L; dy /= L; dz /= L;
      }
      P[i] = P[i - 3] + dx * seg; P[i + 1] = P[i - 2] + dy * seg; P[i + 2] = P[i - 1] + dz * seg;
      px = dx; py = dy; pz = dz;
    }
    // the bottom
    for (let j = 1; j < TAIL_BONES; j++) {
      const i = j * 3;
      const rad = tailSection(j / (TAIL_BONES - 1)).c * dw * 0.9 - (this.tailSand > 0.2 ? 0.25 * this.tailSand * tailSection(j / (TAIL_BONES - 1)).c * dw : 0);
      const g = this.groundFn(P[i], P[i + 2]) + rad;
      if (P[i + 1] < g) P[i + 1] = g;
    }
    // into the model's frame for the bones (tail bones spread over the individual's own tail length)
    const T = this.tailModel;
    const inv = this.inv;
    for (let j = 0; j < TAIL_BONES; j++) {
      this.tmp.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]).applyMatrix4(inv);
      T[j * 3] = this.tmp.x; T[j * 3 + 1] = this.tmp.y; T[j * 3 + 2] = this.tmp.z;
    }
  }

  // ------------------------------------------------------------------ the rest of the driver contract

  holdAt(x: number, z: number, heading?: number): void {
    if (!this.ind) return;
    this.pos.set(x, this.groundFn(x, z) + BELLY * this.dw, z);
    if (heading !== undefined) this.heading = heading;
    this.speed = 0; this.vy = 0; this.yawRate = 0;
    this.grounded = 1;
    this.target = null;
    this.tailInit = false;
    this.enter('BOTTOM_REST', 'rest');
    this.busy = false;
    this.ind.pos.copy(this.pos);
    this.ind.heading = this.heading;
  }

  onEvent(cb: (e: BehaviorEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(behaviorId: string): void {
    if (!this.ind) return;
    const e: BehaviorEvent = { individualId: this.ind.id, behaviorId, t: performance.now() };
    for (const l of this.listeners) l(e);
  }

  anchor(): Vector3 {
    // the top of the trunk (before the first update the frame is built from the spawn position)
    if (!this.posed) { this.quat.setFromEuler(this.euler.set(0, this.heading, 0)); this.mtx.compose(this.pos, this.quat, this.scaleV.set(this.dw, this.dw, this.dw)); }
    return this.anchorV.set(0, 0.04, 0.02).applyMatrix4(this.mtx);
  }
  private posed = false;

  get openings(): { mouth: number; gill: number } { return { mouth: this.pose.mouth, gill: this.pose.gills }; }

  /** the disc width of the attached individual (m) */
  get discWidth(): number { return this.dw; }

  /** the tail chain in world space (x, y, z per bone), for viewers and tests */
  get tailPoints(): Float32Array { return this.tailP; }

  /** the rig, for viewers and tests */
  get rig(): AkaeiModel | null { return this.model; }

  dispose(): void {
    this.detach();
    this.listeners.clear();
  }
}

export { TL_PER_DW };
