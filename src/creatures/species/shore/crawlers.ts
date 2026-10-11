import type { Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { Intent } from '../../drivers/Driver';
import { ShoreDriver, ease, seedOf } from './ShoreDriver';
import { makeCrab, makeHermit, type ShoreModel } from './models';

/** the rest rotations of the parts a driver swings about, so the swing is added to them */
function restOf(parts: Record<string, Object3D>): Record<string, { x: number; y: number; z: number; py: number; pz: number }> {
  const out: Record<string, { x: number; y: number; z: number; py: number; pz: number }> = {};
  for (const [k, o] of Object.entries(parts)) out[k] = { x: o.rotation.x, y: o.rotation.y, z: o.rotation.z, py: o.position.y, pz: o.position.z };
  return out;
}

// ------------------------------------------------------------------ ケフサイソガニ
/**
 * ケフサイソガニ: walks sideways on its four pairs of legs in an alternating gait, picks at the bed with both claws in
 * turn, raises and opens them at an approach it does not like, and at a closer one scuttles off fast and flattens
 * itself against the bottom (under a stone, if there is one). `length_mm` is the carapace width.
 */
export class CrabDriver extends ShoreDriver {
  private rest: ReturnType<typeof restOf> = {};
  private phase = 0;
  private crouch = 0;
  private threat = 0;
  private pick = 0;

  static readonly MODEL_MM = 25;
  static makeModel() { return ShoreDriver.holder(CrabDriver.MODEL_MM / 1000, 'Crab'); }
  static makePreview(seed = 0.3): Object3D {
    const m = makeCrab(CrabDriver.MODEL_MM / 1000, seed < 0.55, Math.floor(seed * 1e6) + 1);
    m.root.userData.disposable = true;
    return m.root;
  }

  constructor() {
    super();
    this.sideways = true;
    this.turnRate = 5;
  }

  protected build(ind: Individual): ShoreModel {
    this.size = ind.length_mm / 1000;
    const m = makeCrab(this.size, ind.sex === 'm', seedOf(ind));
    this.rest = restOf(m.parts);
    this.bakeParts = [m.parts.body];
    return m;
  }

  protected begin(intent: Intent): void {
    const s = this.size;
    switch (intent.kind) {
      case 'rest': this.mode = 'rest'; this.target = null; break;
      case 'wander': case 'moveTo': {
        // a quick dash when sent back to the water, an amble otherwise
        const run = intent.kind === 'moveTo' && intent.urgency > 0.8;
        this.mode = run ? 'run' : 'walk';
        this.go(intent.target, run ? s * 10 : s * 1.6);
        this.emit(run ? 'scuttle' : 'walk');
        break;
      }
      case 'flee':
        this.mode = 'flee';
        this.go(intent.target, s * 12);
        this.timer = Math.max(this.timer, 2.5);
        this.emit('scuttle');
        break;
      case 'forage': this.mode = 'forage'; this.target = null; this.emit('forage'); break;
      case 'display': this.mode = 'display'; this.target = null; this.emit('claw_display'); break;
      case 'burrow': case 'special': this.mode = 'hide'; this.target = null; this.emit('hide'); break;
      default: this.mode = 'idle'; this.target = null;
    }
  }

  protected override arrived(): void {
    super.arrived();
    // at the end of a flight: flat against the bottom for a while
    if (this.mode === 'flee' || this.mode === 'run') { this.mode = 'hide'; this.timer = 4 + 6 * (this.ind?.rng.next() ?? 0.5); this.emit('hide'); }
  }

  protected pose(dt: number): void {
    const p = this.parts, r = this.rest, s = this.size;
    const moving = Math.min(1, this.speed / (s * 1.2));
    // the gait: one stride per ~0.6 body widths travelled
    this.phase += (this.speed / (s * 0.6)) * Math.PI * dt;
    this.crouch = ease(this.crouch, this.mode === 'hide' ? 1 : 0, dt, 0.2);
    this.threat = ease(this.threat, this.mode === 'display' ? 1 : 0, dt, 0.25);
    this.pick = ease(this.pick, this.mode === 'forage' ? 1 : 0, dt, 0.3);
    p.body.position.y = r.body.py * (1 - 0.45 * this.crouch) + s * 0.03 * moving * Math.abs(Math.sin(this.phase * 2));
    p.body.rotation.x = -0.25 * this.threat;
    if (this.detail > 0) return;
    for (let k = 0; k < 4; k++) for (const side of ['L', 'R'] as const) {
      const hk = `leg${k}${side}`, hip = p[hk], knee = p[`knee${k}${side}`];
      const sg = side === 'L' ? 1 : -1;
      // alternating tetrapod: legs 0 and 2 of one side step with 1 and 3 of the other
      const ph = this.phase + ((k + (side === 'L' ? 0 : 1)) % 2) * Math.PI;
      const lift = Math.max(0, Math.sin(ph)) * 0.45 * moving;
      hip.rotation.x = r[hk].x - lift + 0.35 * this.crouch;
      hip.rotation.y = r[hk].y + sg * Math.cos(ph) * 0.16 * moving;
      knee.rotation.x = 0.3 * lift - 0.25 * this.crouch;
    }
    for (const side of ['L', 'R'] as const) {
      const ck = `claw${side}`, sh = p[ck], fi = p[`finger${side}`], sg = side === 'L' ? 1 : -1;
      // display: arms up and apart, the fingers gaping; forage: each claw in turn down to the bed and up to the mouth
      const dip = this.pick * Math.max(0, Math.sin(this.t * 4.2 + (side === 'L' ? 0 : Math.PI)));
      sh.rotation.x = r[ck].x - 0.9 * this.threat + 0.45 * dip - 0.2 * this.pick;
      sh.rotation.y = r[ck].y + sg * (0.55 * this.threat - 0.3 * this.crouch);
      fi.rotation.y = sg * (0.5 * this.threat * (0.6 + 0.4 * Math.sin(this.t * 3)) + 0.3 * dip);
    }
  }

  protected override anchorHeight(): number { return this.size * 0.2; }
}

// ------------------------------------------------------------------ ユビナガホンヤドカリ
/**
 * ユビナガホンヤドカリ: plods forward under its borrowed shell, which rocks from side to side with each step, antennae
 * waving and the claws picking at the bed; at a threat it pulls back into the shell, lies still a while, and comes
 * out again eyes first. `length_mm` is the length of the shell it carries.
 */
export class HermitDriver extends ShoreDriver {
  private rest: ReturnType<typeof restOf> = {};
  private phase = 0;
  private withdraw = 0;
  private hideUntil = 0;
  private pick = 0;

  static readonly MODEL_MM = 18;
  static makeModel() { return ShoreDriver.holder(HermitDriver.MODEL_MM / 1000, 'Hermit'); }
  static makePreview(seed = 0.3): Object3D {
    const m = makeHermit(HermitDriver.MODEL_MM / 1000, Math.floor(seed * 1e6) + 1);
    m.root.userData.disposable = true;
    return m.root;
  }

  constructor() {
    super();
    this.turnRate = 2.2;
  }

  protected build(ind: Individual): ShoreModel {
    this.size = ind.length_mm / 1000;
    const m = makeHermit(this.size, seedOf(ind));
    this.rest = restOf(m.parts);
    this.bakeParts = [m.parts.shell];
    return m;
  }

  protected begin(intent: Intent): void {
    const s = this.size;
    if (this.mode === 'withdrawn' && this.t < this.hideUntil && intent.kind !== 'flee') { this.timer = this.hideUntil - this.t; return; }
    switch (intent.kind) {
      case 'rest': this.mode = 'rest'; this.target = null; break;
      case 'wander': case 'moveTo':
        this.mode = 'walk';
        this.go(intent.target, s * (intent.kind === 'moveTo' && intent.urgency > 0.8 ? 1.6 : 0.7));
        this.emit('walk');
        break;
      case 'flee': case 'burrow': case 'display':
        // into the shell, still for a few seconds
        this.mode = 'withdrawn';
        this.target = null;
        this.hideUntil = this.t + 3 + 5 * (this.ind?.rng.next() ?? 0.5);
        this.timer = this.hideUntil - this.t;
        this.emit('withdraw');
        break;
      case 'forage': this.mode = 'forage'; this.target = null; this.emit('forage'); break;
      case 'special': this.mode = 'idle'; this.target = null; this.emit('antenna_flick'); break;
      default: this.mode = 'idle'; this.target = null;
    }
  }

  protected pose(dt: number): void {
    const p = this.parts, r = this.rest, s = this.size;
    const moving = Math.min(1, this.speed / (s * 0.5));
    this.phase += (this.speed / (s * 0.35)) * Math.PI * dt;
    const was = this.withdraw;
    // in fast, out slowly (and only once the danger has passed)
    this.withdraw = this.mode === 'withdrawn' ? ease(this.withdraw, 1, dt, 0.06) : ease(this.withdraw, 0, dt, 0.8);
    if (was > 0.5 && this.withdraw <= 0.5) this.emit('emerge');
    this.pick = ease(this.pick, this.mode === 'forage' ? 1 : 0, dt, 0.3);
    const w = this.withdraw;
    p.animal.position.z = r.animal.pz - s * 0.3 * w;
    p.animal.scale.setScalar(Math.max(0.05, 1 - 0.85 * w));
    // the shell rocks with the steps and settles when the animal lets go of the ground
    p.shell.rotation.z = Math.sin(this.phase) * 0.09 * moving * (1 - w) + 0.25 * w;
    p.shell.position.y = r.shell.py - s * 0.06 * w;
    if (this.detail > 0) return;
    for (let k = 0; k < 2; k++) for (const side of ['L', 'R'] as const) {
      const hk = `leg${k}${side}`, hip = p[hk];
      const ph = this.phase + ((k + (side === 'L' ? 0 : 1)) % 2) * Math.PI;
      hip.rotation.x = r[hk].x - Math.max(0, Math.sin(ph)) * 0.5 * moving;
      hip.rotation.y = r[hk].y + (side === 'L' ? 1 : -1) * Math.cos(ph) * 0.25 * moving;
    }
    for (const side of ['L', 'R'] as const) {
      const ck = `claw${side}`, ak = `antenna${side}`, c = p[ck], a = p[ak], ph = side === 'L' ? 0 : 1.7;
      c.rotation.x = r[ck].x + this.pick * 0.4 * Math.max(0, Math.sin(this.t * 5 + ph));
      a.rotation.y = r[ak].y + 0.3 * Math.sin(this.t * 2.1 + ph) + (this.mode === 'idle' ? 0.2 * Math.sin(this.t * 9) * Math.max(0, Math.sin(this.t * 0.7)) : 0);
      a.rotation.x = r[ak].x + 0.15 * Math.sin(this.t * 1.3 + ph);
    }
  }
}
