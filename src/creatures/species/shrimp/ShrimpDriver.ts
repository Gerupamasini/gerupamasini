import { MathUtils, Object3D, Vector3 } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../../drivers/Driver';
import { makeShrimp, type PlaceholderModel } from '../../models/placeholders';

type Mode = 'idle' | 'walk' | 'swim' | 'forage' | 'flip';

/** シラタエビ placeholder driver: walking, slow swimming, foraging and the backward tail-flip escape. */
export class ShrimpDriver implements Driver {
  private model: PlaceholderModel | null = null;
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private mode: Mode = 'idle';
  private target = new Vector3();
  private timer = 0;
  private phase = 0;
  private flipT = 0;
  private flips = 0;
  private curl = 0;
  private idleFor = 0;
  private restSent = false;
  private forageStep = 0;
  private scale = 1;
  private readonly tmp = new Vector3();
  busy = false;

  static makeModel(): PlaceholderModel {
    return makeShrimp();
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    this.model = (root.userData.placeholder as PlaceholderModel) ?? null;
    this.scale = individual.length_mm / individual.species.model.modelLength_mm;
    root.scale.setScalar(this.scale);
    root.position.set(individual.pos.x, individual.pos.y, individual.pos.z);
    root.rotation.set(0, individual.heading, 0);
  }

  detach(): void {
    this.root = null;
    this.model = null;
  }

  setIntent(intent: Intent): void {
    this.busy = true;
    this.timer = intent.seconds > 0 ? intent.seconds : 6;
    switch (intent.kind) {
      case 'rest': this.mode = 'idle'; break;
      case 'wander': case 'moveTo':
        this.mode = 'walk';
        this.target.copy(intent.target ?? this.ind!.pos);
        this.emit('walk');
        break;
      case 'flee':
        this.mode = 'flip';
        this.flips = 3;
        this.flipT = 0;
        this.target.copy(intent.target ?? this.ind!.pos);
        this.emit('tail_flip_escape');
        break;
      case 'forage':
        this.mode = 'forage';
        this.forageStep = 0;
        this.emit('forage');
        break;
      default: this.mode = 'idle';
    }
    if (this.mode !== 'idle') { this.idleFor = 0; this.restSent = false; }
  }

  update(dt: number, ctx: DriverContext): void {
    const root = this.root, ind = this.ind, m = this.model;
    if (!root || !ind) return;
    const sdt = dt * ctx.simScale;
    const S = this.scale;
    this.timer -= sdt;
    let speed = 0;
    switch (this.mode) {
      case 'walk': case 'forage': {
        if (this.mode === 'forage') {
          // stop-and-go: short steps between pauses
          this.forageStep -= sdt;
          if (this.forageStep <= 0) {
            this.forageStep = ind.rng.range(0.8, 2.2);
            const ang = ind.heading + ind.rng.range(-1.2, 1.2);
            this.target.set(ind.pos.x + Math.sin(ang) * 0.12 * S * 2, 0, ind.pos.z + Math.cos(ang) * 0.12 * S * 2);
          }
        }
        const dx = this.target.x - ind.pos.x, dz = this.target.z - ind.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.01) {
          const want = Math.atan2(dx, dz);
          ind.heading = turnToward(ind.heading, want, 4 * sdt);
          speed = (this.mode === 'walk' ? 0.05 : 0.03) * S * 1.5;
          const step = Math.min(dist, speed * sdt);
          const nx = ind.pos.x + Math.sin(ind.heading) * step, nz = ind.pos.z + Math.cos(ind.heading) * step;
          if (ctx.floor.waterAt(nx, nz) - ctx.floor.heightAt(nx, nz) > 0.015) { ind.pos.x = nx; ind.pos.z = nz; }
          else { this.target.copy(ind.pos); }
        } else if (this.mode === 'walk') this.busy = false;
        break;
      }
      case 'flip': {
        this.flipT += sdt;
        const T = 0.45;
        const u = this.flipT / T;
        // quick curl and backward jump, then slow uncurl
        this.curl = u < 0.25 ? u / 0.25 : Math.max(0, 1 - (u - 0.25) / 0.75);
        if (u < 0.3) {
          const jump = (0.35 * S * 2) * sdt / (0.3 * T);
          const nx = ind.pos.x - Math.sin(ind.heading) * jump, nz = ind.pos.z - Math.cos(ind.heading) * jump;
          if (ctx.floor.waterAt(nx, nz) - ctx.floor.heightAt(nx, nz) > 0.01) { ind.pos.x = nx; ind.pos.z = nz; }
        }
        if (u >= 1) {
          this.flipT = 0;
          this.flips--;
          // turn away from the threat between jumps
          const want = Math.atan2(this.target.x - ind.pos.x, this.target.z - ind.pos.z) + Math.PI;
          ind.heading = turnToward(ind.heading, want, 1.2);
          if (this.flips <= 0) { this.mode = 'idle'; this.busy = false; }
        }
        break;
      }
      case 'idle':
      default:
        this.curl = MathUtils.damp(this.curl, 0, 4, sdt);
        this.idleFor += sdt;
        if (this.idleFor > 10 && !this.restSent) { this.restSent = true; this.emit('rest'); }
        break;
    }
    if (this.timer <= 0 && this.mode !== 'flip') this.busy = false;
    if (!this.busy && this.mode !== 'idle') this.mode = 'idle';
    // pose
    const ground = ctx.floor.heightAt(ind.pos.x, ind.pos.z);
    ind.pos.y = ground;
    root.position.set(ind.pos.x, ground, ind.pos.z);
    root.rotation.set(0, ind.heading, 0);
    this.phase += sdt * (speed > 0 ? 14 : 2);
    if (m) {
      const walking = speed > 0;
      for (let i = 0; i < 3; i++) for (const side of ['L', 'R'] as const) {
        const leg = m.parts[`leg${i}${side}`];
        if (!leg) continue;
        const ph = this.phase + i * 1.1 + (side === 'L' ? 0 : Math.PI);
        leg.rotation.x = walking ? Math.sin(ph) * 0.5 : Math.sin(ph * 0.3 + i) * 0.04;
      }
      for (let i = 0; i < 4; i++) {
        const seg = m.parts[`abd${i}`];
        if (!seg) continue;
        const base = -0.16 - 0.06 * i;
        seg.rotation.x = base * (1 - this.curl) + (-0.55) * this.curl + Math.sin(this.phase * 0.5 + i) * 0.015;
      }
      const antL = m.parts.antennaL, antR = m.parts.antennaR;
      if (antL && antR) {
        antL.rotation.z = 0.25 + Math.sin(this.phase * 0.7) * 0.12;
        antR.rotation.z = -0.25 - Math.sin(this.phase * 0.7 + 1.3) * 0.12;
      }
    }
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
    return this.root ? this.tmp.copy(this.root.position).add(new Vector3(0, 0.008 * this.scale, 0)) : this.tmp.set(0, 0, 0);
  }

  dispose(): void {
    this.detach();
    this.listeners.clear();
  }
}

export function turnToward(cur: number, want: number, maxStep: number): number {
  let d = want - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + MathUtils.clamp(d, -maxStep, maxStep);
}
