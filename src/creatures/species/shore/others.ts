import type { Object3D } from 'three';
import type { Individual } from '../../Individual';
import type { Intent } from '../../drivers/Driver';
import { hashInts } from '../../../core/Rng';
import { ShoreDriver, ease, seedOf } from './ShoreDriver';
import { makeFry, makeWorm, type ShoreModel } from './models';

// ------------------------------------------------------------------ ボラ (ハク)
/**
 * ボラの幼魚 (ハク): a school cruising just under the surface of the shallows. The fish of one school (the group the
 * spawner put in one cell) follow the same slow figure-of-eight around the cell, each at its own place in it, so they
 * move as one; at a threat each darts away and the school closes up again; they nibble at the surface film, and now
 * and then one leaps clear of the water as ボラ do.
 */
export class MulletDriver extends ShoreDriver {
  static readonly MODEL_MM = 40;
  static makeModel() { return ShoreDriver.holder(MulletDriver.MODEL_MM / 1000, 'Mullet'); }
  static makePreview(): Object3D {
    const m = makeFry(MulletDriver.MODEL_MM / 1000);
    m.root.position.y = MulletDriver.MODEL_MM / 1000 * 0.1;
    return m.root;
  }

  private ax = 0;
  private az = 0;
  private ox = 0;
  private oz = 0;
  private phase0 = 0;
  private dartLeft = 0;
  private beat = 0;
  private jumpY = 0;
  private jumpVy = 0;
  private jumping = false;

  constructor() {
    super();
    this.turnRate = 7;
    this.tilt = false;
    this.cruising = true;
  }

  protected build(ind: Individual): ShoreModel {
    this.size = ind.length_mm / 1000;
    this.school(ind.home.x, ind.home.z, ind.cell);
    return makeFry(this.size);
  }

  /** the school's centre (the cell's) and this fish's place in it */
  private school(x: number, z: number, cell: number): void {
    this.ax = Math.floor(x / 2) * 2 + 1;
    this.az = Math.floor(z / 2) * 2 + 1;
    const ind = this.ind;
    const h = ind ? seedOf(ind) : 1;
    const spread = 0.12 + this.size * 3;
    this.ox = ((h & 0xff) / 255 - 0.5) * 2 * spread;
    this.oz = (((h >>> 8) & 0xff) / 255 - 0.5) * 2 * spread;
    this.phase0 = (hashInts(cell, 77) % 6283) / 1000;
  }

  protected override held(): void {
    if (this.ind) this.school(this.ind.pos.x, this.ind.pos.z, this.ind.cell);
    this.jumping = false;
  }

  protected begin(intent: Intent): void {
    const s = this.size;
    switch (intent.kind) {
      case 'flee':
        this.mode = 'dart';
        this.go(intent.target, 0.3 + s * 14);
        this.dartLeft = 1.1;
        this.emit('scatter');
        break;
      case 'moveTo':
        // sent to deeper water: the school's ground moves with it
        if (intent.target && this.ind) this.school(intent.target.x, intent.target.z, this.ind.cell);
        this.mode = 'school';
        break;
      case 'forage': this.mode = 'nibble'; this.emit('surface_feed'); break;
      case 'special':
        if (!this.inTank && this.depth > 0.15 && !this.jumping) {
          this.jumping = true;
          this.mode = 'jump';
          this.jumpY = this.ind ? this.ind.pos.y : 0;
          this.jumpVy = 1.6 + 1.2 * (this.ind?.rng.next() ?? 0.5);
          this.timer = 2;
          this.emit('jump');
        }
        break;
      default:
        if (this.mode !== 'school' && intent.kind === 'wander') this.emit('school');
        this.mode = 'school';
    }
  }

  protected override steer(dt: number): void {
    const ind = this.ind, ctx = this.ctx;
    if (!ind || !ctx) return;
    if (this.jumping) {
      // a leap: up and over in a short arc, forward the way it faces
      this.jumpVy -= 9.8 * dt;
      this.jumpY += this.jumpVy * dt;
      ind.pos.x += Math.sin(ind.heading) * 0.6 * dt;
      ind.pos.z += Math.cos(ind.heading) * 0.6 * dt;
      this.target = null;
      if (this.jumpVy < 0 && this.jumpY < ctx.floor.waterAt(ind.pos.x, ind.pos.z) - 0.02) { this.jumping = false; this.mode = 'school'; this.emit('splash'); }
      return;
    }
    if (this.mode === 'dart') {
      this.dartLeft -= dt;
      if (this.dartLeft > 0 && this.target) return;
      this.mode = 'school';
    }
    // the school's path: a slow figure-of-eight over its ground, everyone at their own offset in it
    const b = ctx.bounds;
    const cruise = 0.04 + this.size * 3;
    let R = b ? Math.min(0.12, (b.maxX - b.minX) * 0.3, (b.maxZ - b.minZ) * 0.3) : 1.4;
    const cx = b ? (b.minX + b.maxX) / 2 : this.ax, cz = b ? (b.minZ + b.maxZ) / 2 : this.az;
    const k = b ? 0.3 : 1;
    const th = (ctx.nowMs / 1000) * (cruise / Math.max(0.3, R)) + this.phase0;
    const need = Math.max(0.06, ctx.minDepth ?? 0);
    let x = 0, z = 0;
    for (let tries = 0; tries < 3; tries++) {
      x = cx + R * Math.sin(th) + this.ox * k;
      z = cz + R * Math.sin(0.71 * th + 1.3) + this.oz * k;
      if (b || ctx.floor.waterAt(x, z) - ctx.floor.heightAt(x, z) >= need) break;
      R *= 0.45;
    }
    if (b) { x = Math.min(b.maxX, Math.max(b.minX, x)); z = Math.min(b.maxZ, Math.max(b.minZ, z)); }
    const d = Math.hypot(x - ind.pos.x, z - ind.pos.z);
    if (!this.target) this.target = ind.pos.clone();
    this.target.set(x, 0, z);
    this.pace = Math.min(cruise + 1.5 * d, 0.1 + this.size * 10);
  }

  /** the eyes and the small fins are not worth their draw calls from a few metres */
  protected override detailChanged(level: number): void {
    this.model?.root.traverse((o) => { if (o.name === 'eye' || o.name === 'pupil' || o.name === 'fin' || o.name === 'pectoral') o.visible = level === 0; });
  }

  protected override arriveDist(): number { return 0.004; }
  protected override arrived(): void { /* the path moves on: keep following it */ }

  protected override rideHeight(g: number, w: number): number {
    if (this.jumping) return this.jumpY - g;
    const water = w - g;
    if (water <= 0) return 0;
    // just under the surface; right at it when nibbling the film
    const under = this.mode === 'nibble' ? this.size * 0.12 : Math.min(0.06 + this.size, water * 0.45);
    return Math.max(this.size * 0.25, water - under);
  }

  protected pose(dt: number): void {
    const p = this.parts, s = this.size;
    const effort = Math.min(1, this.speed / (s * 8));
    // the tail beats faster the faster it swims; a little counter-sway of the head
    this.beat += dt * Math.PI * 2 * (2.2 + (this.speed / s) * 0.9);
    const amp = 0.22 + 0.4 * effort;
    p.tail.rotation.y = amp * Math.sin(this.beat);
    p.body.rotation.y = -0.18 * amp * Math.sin(this.beat - 0.6);
    p.body.rotation.x = this.jumping ? Math.max(-0.9, Math.min(0.9, -this.jumpVy * 0.35)) : this.mode === 'nibble' ? -0.25 : 0;
    if (this.detail > 0) return;
    const fl = 0.25 * Math.sin(this.t * 9);
    p.pectoralL.rotation.y = fl;
    p.pectoralR.rotation.y = -fl;
  }

  protected override anchorHeight(): number { return this.size * 0.05; }
}

// ------------------------------------------------------------------ ミズヒキゴカイ
/**
 * ミズヒキゴカイ: in the flat it stays down its burrow and spreads its blood-red threads over the sand around the hole
 * (they stay out on wet sand at low water), drawing them in at once when something comes close and putting them out
 * again a while later. Dug up, in the case or the tank, it lies writhing on the bottom and crawls slowly.
 */
export class WormDriver extends ShoreDriver {
  static readonly MODEL_MM = 90;
  static makeModel() { return ShoreDriver.holder(WormDriver.MODEL_MM / 1000, 'Worm'); }
  static makePreview(seed = 0.3): Object3D {
    const m = makeWorm(WormDriver.MODEL_MM / 1000, Math.floor(seed * 1e6) + 1);
    m.parts.tuft.visible = false;
    m.root.userData.disposable = true;
    return m.root;
  }

  private spread = 0;
  private retractUntil = 0;
  private writhe = 0;

  constructor() {
    super();
    this.turnRate = 0.8;
  }

  protected build(ind: Individual): ShoreModel {
    this.size = ind.length_mm / 1000;
    const m = makeWorm(this.size, seedOf(ind));
    m.parts.tuft.rotation.y = (seedOf(ind) % 628) / 100;
    // found as it was before anyone came: threads out
    this.spread = 1;
    return m;
  }

  protected begin(intent: Intent): void {
    switch (intent.kind) {
      case 'flee': case 'display': case 'burrow':
        if (this.mode !== 'retracted') this.emit('retract');
        this.mode = 'retracted';
        this.target = null;
        this.retractUntil = this.t + 8 + 12 * (this.ind?.rng.next() ?? 0.5);
        this.timer = Math.max(this.timer, this.retractUntil - this.t);
        break;
      case 'wander': case 'moveTo':
        if (this.inTank) { this.mode = 'crawl'; this.go(intent.target, this.size * 0.06); this.emit('crawl'); break; }
        this.mode = 'rest';
        break;
      default:
        if (this.t < this.retractUntil) { this.timer = this.retractUntil - this.t; break; }
        if (this.mode === 'retracted' || this.spread < 0.5) this.emit('spread_gills');
        this.mode = 'rest';
        this.target = null;
    }
  }

  protected pose(dt: number): void {
    const p = this.parts;
    const out = this.inTank;
    p.body.visible = out;
    p.tuft.visible = !out && this.spread > 0.02;
    if (out) {
      // writhing: a slow wave down the body, stronger as it crawls
      this.writhe = ease(this.writhe, this.speed > 1e-4 ? 1 : 0.4, dt, 0.8);
      for (let i = 0; i < 14; i++) {
        const sg = p[`seg${i}`];
        if (!sg || i === 0) continue;
        sg.rotation.y = 0.2 * this.writhe * Math.sin(this.t * 1.6 - i * 0.6);
        sg.rotation.x = 0.04 * Math.sin(this.t * 1.1 - i * 0.4);
      }
      return;
    }
    // the threads: put out slowly, pulled in fast; a little shorter on bare wet sand
    const want = this.mode === 'retracted' ? 0 : this.depth > 0.005 ? 1 : 0.65;
    this.spread = ease(this.spread, want, dt, want > this.spread ? 3 : 0.12);
    p.tuft.scale.set(0.12 + 0.88 * this.spread, 1, 0.12 + 0.88 * this.spread);
    if (this.detail === 0) p.tuft.rotation.y += 0.02 * Math.sin(this.t * 0.35) * dt;
  }

  protected override anchorHeight(): number { return this.inTank ? this.size * 0.03 : 0.004; }
}
