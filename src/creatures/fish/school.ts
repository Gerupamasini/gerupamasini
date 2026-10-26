import { Vector3 } from 'three';
import type { FishAgent, FishEnv, FishState } from './motion';

/**
 * The shared, light schooling of the群泳 species (ボラ, サッパ, コノシロ; loosely the shoals of メジナ and イシモチ): no
 * brain per fish, one school state per spawn group and three boids rules over the group (separation, alignment,
 * cohesion), weighted by the species' cohesion, plus the school's travel. The school's state is set by the first of its
 * members' intents after the last one ran out; a startle runs through the school as a wave (each fish C-starts when it
 * reaches it, with its own latency), and a school that flashes (コノシロ) turns as one in a wave from one fish.
 */

export type SchoolState = 'IDLE' | 'SWIM' | 'FORAGE' | 'ALERT' | 'ESCAPE';

/** startle wave speed through the school (m/s), and a flash turn's */
const STARTLE_WAVE = 2.5;
const TURN_WAVE = 1.4;
const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Member { reactAt: number; from: Vector3; turnAt: number; level: number; latency: number; want: { h: number; v: number; y: number } }

export class School {
  readonly members: FishAgent[] = [];
  private readonly m = new Map<FishAgent, Member>();
  state: SchoolState = 'SWIM';
  stateStart = 0;
  until = 0;
  time = 0;
  travel = Math.random() * TAU;
  /** the heading it turns to in a flash, and the members still on the old one */
  private nextTravel = 0;
  private prevTravel = 0;
  private flashAt = 8;
  private readonly goal = new Vector3();
  private hasGoal = false;
  private readonly c = new Vector3();
  private lastTick = -1;

  constructor(readonly key: string) {}

  add(a: FishAgent): void {
    if (this.m.has(a)) return;
    this.members.push(a);
    this.m.set(a, { reactAt: -1, from: new Vector3(), turnAt: -1, level: Math.random(), latency: 0.01 + 0.04 * Math.random(), want: { h: a.heading, v: 0, y: a.pos.y } });
    a.school = this;
  }

  remove(a: FishAgent): void {
    const i = this.members.indexOf(a);
    if (i >= 0) this.members.splice(i, 1);
    this.m.delete(a);
    if (a.school === this) a.school = null;
  }

  get expired(): boolean { return this.time >= this.until; }

  centre(out: Vector3): boolean {
    let n = 0;
    out.set(0, 0, 0);
    for (const a of this.members) { out.add(a.pos); n++; }
    if (!n) return false;
    out.multiplyScalar(1 / n);
    return true;
  }

  /** a state for the school (true when taken): the first intent after the last ran out, or an urgent one */
  request(state: SchoolState, seconds: number, goal: Vector3 | null, urgent = false): boolean {
    if (!this.expired && !urgent && this.state !== 'IDLE') return false;
    this.state = state;
    this.stateStart = this.time;
    this.until = this.time + Math.max(3, seconds);
    this.hasGoal = !!goal;
    if (goal) this.goal.copy(goal);
    return true;
  }

  /** a member saw a threat: the wave starts from it */
  startle(from: Vector3, seer: FishAgent): void {
    if (this.state === 'ESCAPE' && this.time - this.stateStart < 1) return;
    this.state = 'ESCAPE';
    this.stateStart = this.time;
    this.until = this.time + 2.5;
    for (const a of this.members) {
      const mm = this.m.get(a)!;
      mm.reactAt = this.time + a.pos.distanceTo(seer.pos) / STARTLE_WAVE + mm.latency;
      mm.from.copy(from);
    }
    // the school moves off away from it
    this.travel = Math.atan2(seer.pos.x - from.x, seer.pos.z - from.z);
    this.hasGoal = false;
  }

  /** once per simulation step (the first member to update steps the school) */
  private tick(t: number, env: FishEnv, a: FishAgent): void {
    if (t <= this.lastTick) return;
    const dt = this.lastTick < 0 ? 0 : Math.min(0.1, t - this.lastTick);
    this.lastTick = t;
    this.time = t;
    if (!this.centre(this.c)) return;
    const spec = a.spec, B = spec.behavior;
    if (this.hasGoal) {
      const dx = this.goal.x - this.c.x, dz = this.goal.z - this.c.z;
      if (Math.hypot(dx, dz) < 0.8 * a.tl + 0.2) this.hasGoal = false;
      else this.travel += wrap(Math.atan2(dx, dz) - this.travel) * Math.min(1, dt * 1.5);
    } else {
      this.travel += (Math.random() - 0.5) * 0.5 * dt;
    }
    // keep the school in water deep enough: probe ahead of its centre, turn toward the deeper side
    const look = 2.5 * a.tl + 0.3;
    const depth = (h: number) => {
      const x = this.c.x + Math.sin(h) * look, z = this.c.z + Math.cos(h) * look;
      return env.floor.waterAt(x, z) - env.floor.heightAt(x, z);
    };
    const need = Math.max(env.minDepth, 3 * a.half.below + 2 * a.half.above);
    if (depth(this.travel) < need) {
      const l = depth(this.travel + 0.9), r = depth(this.travel - 0.9);
      this.travel += (l > r ? 1 : -1) * Math.min(1, dt * 2.5);
      this.hasGoal = false;
    }
    const bd = env.bounds;
    if (bd && (this.c.x < bd.minX + 2 * a.tl || this.c.x > bd.maxX - 2 * a.tl || this.c.z < bd.minZ + 2 * a.tl || this.c.z > bd.maxZ - 2 * a.tl)) {
      this.travel += wrap(Math.atan2((bd.minX + bd.maxX) / 2 - this.c.x, (bd.minZ + bd.maxZ) / 2 - this.c.z) - this.travel) * Math.min(1, dt * 2);
    }
    // a flashing school turns as one: a wave from one fish through the rest
    if (B.extras.includes('flash') && (this.state === 'SWIM' || this.state === 'FORAGE')) {
      this.flashAt -= dt;
      if (this.flashAt <= 0 && this.members.length > 2) {
        this.flashAt = 6 + Math.random() * 9;
        const lead = this.members[Math.floor(Math.random() * this.members.length)];
        this.nextTravel = this.travel + (Math.random() < 0.5 ? -1 : 1) * (1.1 + Math.random() * 1.2);
        for (const o of this.members) {
          const mm = this.m.get(o)!;
          mm.turnAt = this.time + o.pos.distanceTo(lead.pos) / TURN_WAVE + mm.latency;
        }
        this.prevTravel = this.travel;
        this.travel = this.nextTravel;
        lead.onEvent?.('flash');
      }
    }
    if (this.state === 'ESCAPE' && this.expired) { this.state = 'SWIM'; this.until = this.time + 5; }
  }

  private mapped(): FishState {
    return this.state === 'ESCAPE' ? 'SWIM' : this.state === 'ALERT' ? 'SWIM' : this.state;
  }

  /** a member's wants for this step: the school state, its escape, its heading and speed from the neighbours */
  steer(a: FishAgent, env: FishEnv): void {
    this.tick(a.time, env, a);
    const mm = this.m.get(a);
    if (!mm) return;
    const B = a.spec.behavior, tl = a.tl;
    if (mm.reactAt >= 0 && this.time >= mm.reactAt) {
      mm.reactAt = -1;
      a.escapeFrom(mm.from);
    }
    const busy = a.state === 'ESCAPE' || a.state === 'STRIKE' || a.state === 'LEAP' || a.state === 'TURN';
    const want = this.mapped();
    if (!busy && a.state !== want) a.setState(want, Math.max(1, this.until - this.time));
    // the boids: separation inside the spacing, alignment and cohesion over the neighbours
    const sp = B.spacing * tl * (this.state === 'ALERT' || this.state === 'ESCAPE' ? 0.7 : 1);
    let sx = 0, sz = 0, ax = 0, az = 0, cx = 0, cz = 0, n = 0;
    for (const o of this.members) {
      if (o === a) continue;
      const dx = o.pos.x - a.pos.x, dz = o.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d > 10 * sp) continue;
      if (d < sp && d > 1e-5) { const k = (1 - d / sp) / d; sx -= dx * k; sz -= dz * k; }
      ax += Math.sin(o.heading); az += Math.cos(o.heading);
      cx += dx; cz += dz; n++;
    }
    let travel = this.travel;
    if (mm.turnAt >= 0 && this.time < mm.turnAt) travel = this.prevTravel;
    const coh = B.school;
    let hx = Math.sin(travel) * (this.state === 'IDLE' ? 0.25 : 1), hz = Math.cos(travel) * (this.state === 'IDLE' ? 0.25 : 1);
    if (n) {
      const al = Math.hypot(ax, az) || 1;
      hx += (ax / al) * 1.2 * coh; hz += (az / al) * 1.2 * coh;
      const cl = Math.hypot(cx, cz);
      if (cl > 2 * sp) { hx += (cx / cl) * 0.8 * coh; hz += (cz / cl) * 0.8 * coh; }
      hx += sx * 1.6; hz += sz * 1.6;
    }
    mm.want.h = Math.atan2(hx, hz);
    // speed: the state's, a fish behind the school catches up, one ahead eases off
    const base = this.state === 'IDLE' ? 0.25 : this.state === 'FORAGE' ? 0.6 : this.state === 'ALERT' ? 1.2 : this.state === 'ESCAPE' ? 1.5 : 1;
    let catchUp = 0;
    if (n) catchUp = Math.max(-0.4, Math.min(0.6, ((cx * Math.sin(travel) + cz * Math.cos(travel)) / n) / (3 * sp)));
    mm.want.v = B.cruise * tl * base * (1 + catchUp);
    if (this.hasGoal && this.state === 'SWIM') mm.want.v *= 1.1;
  }

  wantHeading(a: FishAgent): number { return this.m.get(a)?.want.h ?? a.heading; }
  wantSpeed(a: FishAgent): number { return this.m.get(a)?.want.v ?? 0; }

  /** the height a member keeps: the school's layer, each fish a little above or below the others */
  wantY(a: FishAgent, L: { bottom: number; surface: number; lo: number; hi: number }, def: number): number {
    const mm = this.m.get(a);
    const spread = (mm ? mm.level - 0.5 : 0) * 1.4 * (a.half.above + a.half.below);
    return Math.min(L.hi, Math.max(L.lo, def + spread));
  }

  /** a fish rolls its flank up to the light as it turns with a flash: the silver flicker of a turning school */
  rollOf(a: FishAgent): number {
    const mm = this.m.get(a);
    if (!mm || mm.turnAt < 0) return 0;
    const t = this.time - mm.turnAt;
    if (t < 0 || t > 0.6) return 0;
    return 0.55 * Math.sin((t / 0.6) * Math.PI) * Math.sign(wrap(this.travel - a.heading) || 1);
  }

}

const SCHOOLS = new Map<string, School>();

export function schoolFor(key: string): School {
  let s = SCHOOLS.get(key);
  if (!s) { s = new School(key); SCHOOLS.set(key, s); }
  return s;
}

export function releaseSchool(s: School): void {
  if (s.members.length === 0) SCHOOLS.delete(s.key);
}
