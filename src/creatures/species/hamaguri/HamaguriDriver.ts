import { Group, MathUtils, Vector3, type Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../../drivers/Driver';
import type { PlaceholderModel } from '../../models/placeholders';
import { hashInts } from '../../../core/Rng';
import { createHamaguri, noise1, poseSiphon, PATTERN_VARIANTS, type HamaguriParts } from './HamaguriModel';

export type HamaguriState = 'BURIED' | 'FILTER_FEEDING' | 'SIPHON_EXTEND' | 'SIPHON_RETRACT' | 'BURROW' | 'CLOSE_SHELL';

/** life posture: posterior (siphons) tilted up ~65°, commissure vertical */
const TILT = 1.13;
/** shell top sits this far (× L) below the sand at feeding depth; deeper after an escape burrow */
const FEED_DEPTH = 0.06, ALARM_DEPTH = 0.55;
/** height of the shell's top above the root origin in life posture (× L) */
const TOP = 0.47;
const MAX_GAPE = 0.075; // rad, each valve ≈ 4.3° (feeding gape)

class Spring {
  v = 0;
  constructor(public x = 0) {}
  to(target: number, k: number, dt: number, zeta = 1): number {
    const c = 2 * zeta * Math.sqrt(k);
    this.v += (k * (target - this.x) - c * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

/** ハマグリ: buried filter feeder; siphons at the sand surface, foot-anchor burrowing, closes when disturbed. */
export class HamaguriDriver implements Driver {
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private m: HamaguriParts | null = null;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private scale = 0.06;
  state: HamaguriState = 'BURIED';
  private stateT = 0;
  private timer = 0;
  private seed = 0;
  private t = 0;
  // animated quantities
  private gape = new Spring();
  private siphon = new Spring();
  private aperture = new Spring();
  private foot = new Spring();
  private depth = new Spring(FEED_DEPTH);
  private rock = new Spring();
  private targetDepth = FEED_DEPTH;
  private strokes = 0;
  private strokeT = 0;
  private drift = new Vector3();
  private twitch = 0;
  private readonly tmp = new Vector3();
  busy = false;

  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'Hamaguri';
    return { root, parts: {}, length: 0.06 };
  }

  /** A feeding individual at the surface, siphons out and foot showing, for the 図鑑. */
  static makePreview(): Object3D {
    const m = createHamaguri(3);
    m.setDetail(0);
    m.left.rotation.x = -0.08; m.right.rotation.x = 0.08;
    poseSiphon(m.inhalant, m.inhalantTip, 0.7, 1);
    poseSiphon(m.exhalant, m.exhalantTip, 0.6, 0.8);
    m.foot.scale.setScalar(0.8);
    m.root.scale.setScalar(0.06);
    return m.root;
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    this.scale = individual.length_mm / 1000;
    this.seed = hashInts(Math.round(individual.pos.x * 1000), Math.round(individual.pos.z * 1000), individual.length_mm * 10);
    this.m = createHamaguri(this.seed % PATTERN_VARIANTS);
    // individual shape variation: a little more inflated or more triangular
    const s = this.m.life.scale;
    s.set(1, 1 + ((this.seed >>> 4) % 100 - 50) * 0.0008, 1 + ((this.seed >>> 11) % 100 - 50) * 0.0016);
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.add(this.m.root);
    this.m.root.scale.setScalar(this.scale);
    this.m.root.rotation.y = individual.heading;
    this.depth.x = FEED_DEPTH;
    this.targetDepth = FEED_DEPTH;
    this.setState('BURIED');
    this.timer = 1 + (this.seed % 30) / 10;
  }

  detach(): void {
    // geometry and materials are shared by every hamaguri
    this.m?.root.removeFromParent();
    this.m = null;
    this.root = null;
  }

  private setState(s: HamaguriState): void {
    if (s === this.state && this.stateT > 0) return;
    this.state = s;
    this.stateT = 0;
    const ev: Partial<Record<HamaguriState, string>> = { FILTER_FEEDING: 'filter_feeding', BURROW: 'burrow', CLOSE_SHELL: 'close_shell', SIPHON_EXTEND: 'siphon_extend' };
    if (ev[s]) this.emit(ev[s]!);
  }

  setIntent(intent: Intent): void {
    this.busy = true;
    this.timer = intent.seconds > 0 ? intent.seconds : 6;
    switch (intent.kind) {
      case 'flee':
        // shut first, then escape downward when badly frightened
        this.targetDepth = intent.urgency >= 0.8 ? ALARM_DEPTH : this.targetDepth;
        // the brain repeats flee while the player stays close: only the first one interrupts feeding
        if (this.state === 'FILTER_FEEDING' || this.state === 'SIPHON_EXTEND') this.setState('SIPHON_RETRACT');
        else if (this.state === 'BURIED' && this.depth.x < this.targetDepth - 0.05) this.setState('BURROW');
        this.timer = Math.max(this.timer, 4);
        break;
      case 'burrow': case 'wander': case 'moveTo':
        // reposition: re-dig a short way off (hamaguri creep with the foot)
        this.strokes = 3 + (this.seed % 3);
        this.targetDepth = FEED_DEPTH;
        if (intent.kind !== 'burrow') {
          const t = intent.target, ind = this.ind!;
          if (t) this.drift.set(t.x - ind.pos.x, 0, t.z - ind.pos.z).clampLength(0, 0.04 * this.strokes * this.scale / 0.06);
        }
        this.setState(this.state === 'BURIED' || this.state === 'CLOSE_SHELL' ? 'BURROW' : 'SIPHON_RETRACT');
        this.depth.x = Math.min(this.depth.x, 0.02);
        break;
      case 'display': case 'special':
        this.setState('CLOSE_SHELL');
        break;
      default: // rest / forage: feed at the surface
        this.targetDepth = FEED_DEPTH;
        if (this.state === 'BURIED' || this.state === 'CLOSE_SHELL') this.setState('SIPHON_EXTEND');
    }
  }

  update(dt: number, ctx: DriverContext): void {
    const m = this.m, ind = this.ind;
    if (!m || !ind) return;
    const sdt = Math.min(0.05, dt * ctx.simScale);
    this.t += sdt; this.stateT += sdt; this.timer -= sdt;
    const sandY = ctx.floor.heightAt(ind.pos.x, ind.pos.z);
    const dry = ctx.floor.waterAt(ind.pos.x, ind.pos.z) < sandY + 0.003;

    let gape = 0, siphon = 0, aperture = 0, foot = 0, rock = 0;
    const n = noise1(this.t * 0.7 + (this.seed % 97));
    switch (this.state) {
      case 'BURIED':
        // closed, siphons drawn in; wakes to feed when covered by water
        if (!dry && this.timer <= 0 && this.depth.x <= this.targetDepth + 0.02) this.setState('SIPHON_EXTEND');
        if (this.timer <= 0) this.busy = false;
        break;
      case 'SIPHON_EXTEND':
        gape = MAX_GAPE * 0.7; siphon = 0.85; aperture = 0.3;
        if (dry) this.setState('SIPHON_RETRACT');
        else if (this.stateT > 1.6) this.setState('FILTER_FEEDING');
        break;
      case 'FILTER_FEEDING': {
        // pumping: small slow length/aperture changes, the odd valve adduction ("cough") to clear the gills
        gape = MAX_GAPE * (0.85 + 0.15 * n);
        siphon = 0.78 + 0.14 * n + 0.04 * Math.sin(this.t * 2.1);
        aperture = 0.75 + 0.25 * noise1(this.t * 1.3 + 40);
        if (this.twitch <= 0 && noise1(this.t * 0.11 + 7) > 0.83) this.twitch = 0.9;
        if (this.twitch > 0) {
          this.twitch -= sdt;
          const k = Math.sin(Math.min(1, (0.9 - this.twitch) / 0.9) * Math.PI);
          gape *= 1 - 0.8 * k; siphon -= 0.35 * k; aperture *= 1 - k;
        }
        if (dry) this.setState('SIPHON_RETRACT');
        if (this.timer <= 0) this.busy = false;
        break;
      }
      case 'SIPHON_RETRACT':
        gape = MAX_GAPE * 0.5; siphon = 0; aperture = 0;
        if (this.stateT > 0.35) this.setState(this.strokes > 0 || this.targetDepth > this.depth.x + 0.05 ? 'BURROW' : 'CLOSE_SHELL');
        break;
      case 'CLOSE_SHELL':
        if (this.stateT > 0.6) { this.setState('BURIED'); this.timer = Math.max(this.timer, 3); }
        break;
      case 'BURROW': {
        // one stroke ≈ 1.4 s: foot probes → tip dilates (anchor) → foot retracts with adduction, pulling the shell down
        if (this.stateT < sdt * 1.5) this.strokeT = 0;
        this.strokeT += sdt;
        const p = this.strokeT / 1.4;
        if (p < 0.4) { foot = smooth01(p / 0.4); gape = MAX_GAPE * 0.6; rock = -0.05; }
        else if (p < 0.5) { foot = 1; gape = MAX_GAPE * 0.6; rock = -0.06; m.footMesh.scale.set(1, 1.25, 1.6); }
        else if (p < 0.8) {
          const k = (p - 0.5) / 0.3;
          foot = 1 - 0.75 * smooth01(k); gape = MAX_GAPE * 0.1; rock = 0.08 * Math.sin(k * Math.PI);
          // the pull: deepen toward the target and creep along the foot direction
          const want = this.strokes > 0 ? 0.035 : 0.06;
          this.depth.x += (this.targetDepth >= this.depth.x ? want : -want * 0.3) * sdt / 0.42;
          if (this.drift.lengthSq() > 0) { this.tmp.copy(this.drift).multiplyScalar(sdt / 0.42 / Math.max(1, this.strokes)); ind.pos.add(this.tmp); }
        } else { foot = 0.25; gape = MAX_GAPE * 0.3; m.footMesh.scale.set(1, 1, 1); }
        if (p >= 1) {
          this.strokeT = 0;
          this.strokes = Math.max(0, this.strokes - 1);
          const deepEnough = this.depth.x >= this.targetDepth - 0.02;
          if (this.strokes === 0 && deepEnough) {
            this.drift.set(0, 0, 0);
            this.setState('BURIED');
            this.timer = this.targetDepth > FEED_DEPTH ? 6 : 1.5;
            this.targetDepth = FEED_DEPTH; // creep back up slowly afterwards
          }
        }
        break;
      }
    }
    if (this.timer <= -8) this.busy = false;
    // slow rise back to feeding depth when not burrowing
    if (this.state !== 'BURROW' && this.depth.x > this.targetDepth) this.depth.x = Math.max(this.targetDepth, this.depth.x - 0.012 * sdt);

    // springs: fast adduction, slower opening, soft siphon tissue
    const gk = gape < this.gape.x ? 260 : 40;
    const g = this.gape.to(gape, gk, sdt);
    const s = this.siphon.to(siphon, siphon < this.siphon.x ? 140 : 9, sdt, 0.9);
    const a = this.aperture.to(aperture, aperture < this.aperture.x ? 200 : 14, sdt);
    const f = this.foot.to(foot, 60, sdt, 0.8);
    const r = this.rock.to(rock, 50, sdt, 0.7);

    // pose
    m.left.rotation.x = -Math.max(0, g);
    m.right.rotation.x = Math.max(0, g);
    poseSiphon(m.inhalant, m.inhalantTip, Math.max(0, s), Math.max(0, a));
    poseSiphon(m.exhalant, m.exhalantTip, Math.max(0, s) * 0.85, Math.max(0, a) * 0.8);
    m.foot.scale.setScalar(0.15 + 0.85 * Math.max(0, f));
    m.foot.visible = f > 0.05 && this.detail === 0;
    m.life.rotation.set(0, 0, TILT + r);
    // breathing of the siphons when open: tiny lateral sway
    m.inhalant.rotation.x = 0.04 * Math.sin(this.t * 0.9) * s;
    m.root.rotation.y = ind.heading;
    m.root.position.set(ind.pos.x, sandY - (TOP + this.depth.x) * this.scale, ind.pos.z);
    ind.pos.y = sandY;

    // LOD: buried shells are under opaque sand, so far away only the siphons matter (and not beyond ~10 m)
    const dist = ctx.player.distanceTo(m.root.position);
    const lvl = ctx.locked || ctx.bounds || dist < 3 ? 0 : dist < 10 ? 1 : 2;
    this.detail = lvl;
    m.setDetail(lvl);
    m.root.visible = lvl < 2 || this.state === 'BURROW';
  }

  private detail: 0 | 1 | 2 = 0;

  onEvent(cb: (e: BehaviorEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(behaviorId: string): void {
    if (!this.ind) return;
    const e: BehaviorEvent = { individualId: this.ind.id, behaviorId, t: performance.now() };
    for (const l of this.listeners) l(e);
  }

  /** the siphon openings at the sand surface (what the player actually sees) */
  anchor(): Vector3 {
    if (!this.m || !this.ind) return this.tmp.set(0, 0, 0);
    return this.tmp.copy(this.ind.pos).add(new Vector3(0, 0.004, 0));
  }

  dispose(): void {
    this.detach();
    this.listeners.clear();
  }
}

function smooth01(x: number): number { const t = MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); }
