import { Vector3 } from 'three';
import type { Intent } from '../../drivers/Driver';
import type { HabitatSample } from '../../../world/Habitat';
import type { Burrow, BurrowField } from '../../../world/Burrows';
import type { Medium, Motor, MotorWorld } from './Motor';

/**
 * Behaviour of the トビハゼ on the flat. The brain (behaviour tree, data) hands down intents; this turns each into a
 * sequence of locomotor commands and decides on its own what only the animal can see from where it is: which way to
 * flee, where the prey is, where the water's edge and its burrow are, when its skin has dried.
 *
 * Grounded in field studies of P. modestus: at low tide it forages on the wet mud surface near the water's edge and
 * returns into its burrow as the time since exposure grows (heat, drying); as the tide rises it moves with the
 * water's edge and climbs out above it (Ikebe & Oishi 1996, 1997). It keeps its skin wet by returning to water and
 * rolling in puddles, more often in dry air (PLoS ONE 2022); after eating it soon goes into the water to drink. It
 * hides from birds and people in its burrow, or skips away across the mud and the water surface.
 */
export type TobiState = 'SWIM' | 'SHALLOW_WATER' | 'LAND_CRAWL' | 'LAND_HOP' | 'IDLE' | 'FORAGE' | 'BURROW' | 'ESCAPE' | 'WATER_ENTRY' | 'WATER_EXIT';

export interface MindWorld extends MotorWorld {
  sample(x: number, z: number): HabitatSample | null;
  burrows: BurrowField | null;
  player: Vector3;
  nowSec: number;
}

type Task =
  | { kind: 'rest'; until: number; posture: 'prop' | 'low' | 'alert' | 'display' }
  | { kind: 'travel'; target: Vector3; speed: number; urgency: number; hopFrom: number; until: number }
  | { kind: 'forage'; until: number; prey: Vector3 | null; step: 'look' | 'approach' | 'strike' | 'pause'; pauseUntil: number; bites: number; drink: boolean }
  | { kind: 'burrow'; burrow: Burrow | null; step: 'go' | 'align' | 'dive' | 'inside' | 'peek' | 'out'; until: number; insideFor: number; peekFor: number }
  | { kind: 'escape'; from: Vector3; plan: 'water' | 'burrow' | 'hops' | 'swim'; step: number; target: Vector3 | null; burrow: Burrow | null; until: number }
  | { kind: 'rewet'; target: Vector3 | null; step: 'go' | 'roll'; until: number }
  | { kind: 'edge'; target: Vector3; until: number };

const MEDIUM_RANK: Record<Medium, number> = { land: 0, shallow: 1, water: 2 };
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

export class Mind {
  state: TobiState = 'IDLE';
  private task: Task | null = null;
  private transitionUntil = 0;
  private transitionState: TobiState | null = null;
  private lastMedium: Medium;
  /** the animal's own burrow */
  home: Burrow | null = null;
  /** hunger and thirst: after a meal it goes to drink */
  private wantsDrink = 0;
  private exposedSince = -1;
  private readonly tmp = new Vector3();
  busy = false;
  onEvent: (id: string) => void = () => {};

  constructor(public m: Motor, private readonly owner: string, private readonly seed: number, private readonly rnd: () => number) {
    this.lastMedium = m.medium;
  }

  // -------------------------------------------------------------------------------------------- intents
  setIntent(intent: Intent, w: MindWorld): void {
    const now = w.nowSec;
    const secs = intent.seconds > 0 ? intent.seconds : 8;
    this.busy = true;
    // leaving the burrow first unless the intent is to stay in it
    switch (intent.kind) {
      case 'rest':
        this.task = { kind: 'rest', until: now + secs, posture: 'prop' };
        break;
      case 'display':
        this.task = { kind: 'rest', until: now + secs, posture: intent.param === 'display' ? 'display' : 'alert' };
        this.onEvent('display');
        break;
      case 'wander':
      case 'moveTo': {
        const t = intent.target ?? this.m.pos;
        const L = this.m.L;
        // the brain's target, nudged toward wet ground, the water's edge and away from deep water
        const target = intent.kind === 'wander' ? this.refineTarget(t, w) : t.clone();
        const dist = Math.hypot(target.x - this.m.pos.x, target.z - this.m.pos.z);
        this.task = { kind: 'travel', target, speed: (intent.urgency > 0.7 ? 3.5 : 1.2) * L, urgency: intent.urgency, hopFrom: dist > 6 * L ? 0.35 : 0, until: now + Math.max(secs, 25) };
        break;
      }
      case 'forage':
        this.task = { kind: 'forage', until: now + Math.max(4, secs), prey: null, step: 'look', pauseUntil: 0, bites: 0, drink: false };
        break;
      case 'burrow':
        this.task = { kind: 'burrow', burrow: null, step: 'go', until: now + 40, insideFor: Math.max(6, secs), peekFor: 4 + this.rnd() * 10 };
        break;
      case 'flee':
        this.startEscape(intent.from ?? w.player, w);
        break;
      case 'special':
        if (intent.param === 'rewet') this.task = { kind: 'rewet', target: null, step: 'go', until: now + 30 };
        else { this.task = { kind: 'rest', until: now + 3, posture: 'display' }; this.onEvent('display'); }
        break;
      default:
        this.task = { kind: 'rest', until: now + 2, posture: 'prop' };
    }
    // the new task takes over at once: a walk or swim under way turns to the new target, or stops
    const m = this.m, tk = this.task;
    if (m.gait === 'crawl' || (m.gait === 'swim' && !m.done)) {
      if (tk?.kind === 'travel') m.travel(tk.target, tk.speed, tk.urgency);
      else m.stand('prop');
    }
  }

  // -------------------------------------------------------------------------------------------- update
  update(dt: number, w: MindWorld): void {
    const m = this.m;
    const now = w.nowSec;
    // the medium changed under it: show the transition for a moment. Each step from the water toward the land
    // (swimming → propped in the shallows → out on the mud) is emergence, each step back is entry
    if (m.medium !== this.lastMedium && !m.inBurrow) {
      const out = MEDIUM_RANK[m.medium] < MEDIUM_RANK[this.lastMedium];
      this.transitionState = out ? 'WATER_EXIT' : 'WATER_ENTRY';
      this.transitionUntil = now + 1.4;
      this.onEvent(out ? 'water_exit' : 'water_entry');
      this.lastMedium = m.medium;
    }
    // how long the ground here has been out of the water
    if (m.medium === 'land') { if (this.exposedSince < 0) this.exposedSince = now; } else this.exposedSince = -1;
    this.react(w);
    this.runTask(dt, w);
    this.state = this.labelState(now);
    m.attend.player = w.player;
  }

  /** things the animal does whatever the brain said */
  private react(w: MindWorld): void {
    const m = this.m;
    const t = this.task;
    const now = w.nowSec;
    const urgent = t?.kind === 'escape' || t?.kind === 'burrow' && t.step !== 'go';
    // the skin is drying out: go and wet it
    if (!urgent && m.moisture < 0.15 && t?.kind !== 'rewet' && !m.inBurrow) { this.task = { kind: 'rewet', target: null, step: 'go', until: now + 30 }; this.busy = true; }
    // resting on the mud and the tide comes over it: move up with the water's edge (high tide behaviour)
    if (!urgent && (t?.kind === 'rest' || !t) && m.medium !== 'land' && m.depth > 0.9 * m.L * 0.145 && !m.inBurrow && m.gait !== 'swim') {
      const edge = this.findEdge(w);
      if (edge) { this.task = { kind: 'edge', target: edge, until: now + 20 }; this.busy = true; this.onEvent('follow_edge'); }
    }
  }

  private runTask(dt: number, w: MindWorld): void {
    const m = this.m;
    const t = this.task;
    const now = w.nowSec;
    const L = m.L;
    if (!t) {
      if (m.done && m.gait !== 'hidden') m.stand('prop');
      this.busy = false;
      return;
    }
    switch (t.kind) {
      case 'rest': {
        if (m.inBurrow && m.gait === 'hidden') { this.finish(); return; }
        if (m.gait === 'swim' && m.medium === 'water') {
          // rest in water: drift at the surface toward the shallows
          if (m.done) { const e = this.findEdge(w); if (e && this.rnd() < 0.02) m.travel(e, 0.6 * L, 0.1); }
        } else if (m.done || m.gait === 'stand') m.stand(t.posture);
        if (t.posture === 'alert' || t.posture === 'display') { m.attend.alert = Math.max(m.attend.alert, 0.6); m.attend.threat = w.player; }
        if (!this.restReported && now > t.until - 1e9 && this.restSince < 0) this.restSince = now;
        if (!this.restReported && this.restSince >= 0 && now - this.restSince > 20) { this.restReported = true; this.onEvent('rest'); }
        if (now > t.until) this.finish();
        break;
      }
      case 'edge':
        if (m.done && (m.gait === 'stand' || m.gait === 'swim')) {
          if (Math.hypot(t.target.x - m.pos.x, t.target.z - m.pos.z) < 0.15 * L || now > t.until) { this.finish(); break; }
          m.travel(t.target, 1.2 * L, 0.3);
        }
        if (now > t.until) this.finish();
        break;
      case 'travel': {
        if (m.gait === 'hidden') { this.leaveBurrow(w); break; }
        const dist = Math.hypot(t.target.x - m.pos.x, t.target.z - m.pos.z);
        if (dist < 0.12 * L || now > t.until) { this.finish(); m.stand('prop'); break; }
        if (m.done || m.gait === 'stand') {
          // long trips over the mud are cut short by a hop now and then
          if (m.medium === 'land' && dist > 2.5 * L && this.rnd() < t.hopFrom) {
            const dir = Math.atan2(t.target.x - m.pos.x, t.target.z - m.pos.z);
            m.hopToward(dir + (this.rnd() - 0.5) * 0.3, Math.min(dist * 0.8, (2 + this.rnd() * 1.5) * L));
          } else m.travel(t.target, t.speed, t.urgency);
        }
        break;
      }
      case 'forage': this.runForage(t, w); break;
      case 'burrow': this.runBurrow(t, w); break;
      case 'escape': this.runEscape(t, w); break;
      case 'rewet': {
        if (m.gait === 'hidden') { this.leaveBurrow(w); break; }
        if (t.step === 'go') {
          if (!t.target) {
            t.target = this.findWet(w);
            if (!t.target) { t.step = 'roll'; m.rollOver(); break; }
            m.travel(t.target, 1.4 * L, 0.4);
          }
          const d = Math.hypot(t.target.x - m.pos.x, t.target.z - m.pos.z);
          if (d < 0.2 * L || m.depth > 0.002 || (m.done && m.gait === 'stand')) { t.step = 'roll'; m.rollOver(); }
        } else if (m.done) this.finish();
        if (now > t.until) this.finish();
        break;
      }
    }
  }

  private restSince = -1;
  private restReported = false;

  private finish(): void {
    if (this.task?.kind === 'rest') { this.restSince = -1; this.restReported = false; }
    this.task = null;
    this.busy = false;
    this.m.attend.prey = null;
  }

  // -------------------------------------------------------------------------------------------- forage
  private runForage(t: Extract<Task, { kind: 'forage' }>, w: MindWorld): void {
    const m = this.m;
    const L = m.L;
    const now = w.nowSec;
    if (m.gait === 'hidden') { this.leaveBurrow(w); return; }
    if (m.medium === 'water' && t.step !== 'strike') {
      // nothing to pick from the surface out here: back to the shallows first
      const e = this.findEdge(w);
      if (e && m.done) m.travel(e, 1.0 * L, 0.2);
      if (now > t.until) this.finish();
      return;
    }
    switch (t.step) {
      case 'look': {
        // pick a small invertebrate on the wet mud ahead (amphipods, copepods, polychaetes)
        t.prey = this.pickPrey(w);
        if (!t.prey) { if (now > t.until) this.finish(); else m.stand('low'); return; }
        m.attend.prey = t.prey;
        t.step = 'approach';
        break;
      }
      case 'approach': {
        const p = t.prey!;
        const d = Math.hypot(p.x - m.pos.x, p.z - m.pos.z);
        const bearing = wrap(Math.atan2(p.x - m.pos.x, p.z - m.pos.z) - m.heading);
        m.attend.prey = p;
        if (d < 0.42 * L && Math.abs(bearing) < 0.45) { t.step = 'strike'; m.strikeAt(p, this.rnd() < 0.18); t.bites++; break; }
        if (m.done || m.gait === 'stand') {
          // approach to ~0.35 L, then strike
          const stop = this.tmp.set(p.x - Math.sin(Math.atan2(p.x - m.pos.x, p.z - m.pos.z)) * 0.32 * L, 0, p.z - Math.cos(Math.atan2(p.x - m.pos.x, p.z - m.pos.z)) * 0.32 * L);
          m.travel(stop, 1.0 * L, 0.15);
        }
        break;
      }
      case 'strike':
        if (m.done) {
          m.attend.prey = null;
          this.wantsDrink = Math.min(1, this.wantsDrink + 0.25);
          t.step = 'pause';
          t.pauseUntil = now + 0.6 + this.rnd() * 2.5;
          m.stand('prop');
        }
        break;
      case 'pause':
        if (now > t.pauseUntil) t.step = 'look';
        break;
    }
    if (now > t.until && t.step !== 'strike') {
      // after a meal it soon goes into the water to drink
      if (this.wantsDrink > 0.4 && this.rnd() < 0.6) {
        const water = this.findWet(w, true);
        this.wantsDrink = 0;
        if (water) { this.task = { kind: 'travel', target: water, speed: 1.3 * L, urgency: 0.3, hopFrom: 0, until: now + 20 }; return; }
      }
      this.finish();
    }
  }

  private pickPrey(w: MindWorld): Vector3 | null {
    const m = this.m;
    const L = m.L;
    for (let k = 0; k < 8; k++) {
      const a = m.heading + (this.rnd() - 0.5) * 2.4;
      const d = (0.35 + this.rnd() * 1.4) * L;
      const x = m.pos.x + Math.sin(a) * d, z = m.pos.z + Math.cos(a) * d;
      const depth = w.water(x, z) - w.ground(x, z);
      if (depth > 0.9 * 0.145 * L) continue;
      return new Vector3(x, w.ground(x, z), z);
    }
    return null;
  }

  // -------------------------------------------------------------------------------------------- burrow
  private ensureHome(w: MindWorld): Burrow | null {
    if (!this.home && w.burrows) this.home = w.burrows.homeFor(this.owner, this.m.pos.x, this.m.pos.z, this.seed);
    return this.home;
  }

  private runBurrow(t: Extract<Task, { kind: 'burrow' }>, w: MindWorld): void {
    const m = this.m;
    const L = m.L;
    const now = w.nowSec;
    if (!t.burrow) {
      t.burrow = this.ensureHome(w);
      if (!t.burrow) { this.task = { kind: 'rest', until: now + 6, posture: 'low' }; return; }
    }
    const b = t.burrow;
    const hole = this.tmp.set(b.x, b.y, b.z);
    switch (t.step) {
      case 'go': {
        if (m.gait === 'hidden') { t.step = 'inside'; t.until = now + t.insideFor; break; }
        const d = Math.hypot(b.x - m.pos.x, b.z - m.pos.z);
        // stand just in front of the opening, facing it
        if (d < 0.3 * L) { t.step = 'align'; break; }
        if (m.done || m.gait === 'stand') {
          const dir = Math.atan2(b.x - m.pos.x, b.z - m.pos.z);
          const stop = new Vector3(b.x - Math.sin(dir) * 0.24 * L, 0, b.z - Math.cos(dir) * 0.24 * L);
          if (m.medium === 'land' && d > 4 * L && this.rnd() < 0.25) m.hopToward(dir, Math.min(d - 0.4 * L, 2.5 * L));
          else m.travel(stop, 1.5 * L, 0.4);
        }
        if (now > t.until) this.finish();
        break;
      }
      case 'align':
        m.diveInto(hole.clone());
        t.step = 'dive';
        break;
      case 'dive':
        if (m.gait === 'hidden') { t.step = 'inside'; t.until = now + t.insideFor; }
        break;
      case 'inside':
        // stays down longer while someone is close
        if (now > t.until && w.player.distanceTo(m.pos) > 1.2) {
          const out = Math.atan2(w.player.x - b.x, w.player.z - b.z) + Math.PI + (this.rnd() - 0.5) * 2;
          m.emergeFrom(hole.clone(), out, true);
          t.step = 'peek';
          t.until = now + t.peekFor;
        }
        break;
      case 'peek':
        m.attend.alert = Math.max(m.attend.alert, 0.4);
        m.attend.threat = w.player;
        if (now > t.until) { m.climbOut(); t.step = 'out'; }
        break;
      case 'out':
        if (m.done && m.gait === 'stand') this.finish();
        break;
    }
  }

  /** inside its burrow and asked to do something else: peek, then come out */
  private leaveBurrow(w: MindWorld): void {
    const m = this.m;
    const b = this.home;
    if (!b) { m.place(m.pos.x, m.pos.z, m.heading, w); return; }
    m.emergeFrom(new Vector3(b.x, b.y, b.z), m.heading + Math.PI * (this.rnd() - 0.5), false);
  }

  // -------------------------------------------------------------------------------------------- escape
  private startEscape(from: Vector3, w: MindWorld): void {
    const m = this.m;
    const L = m.L;
    const now = w.nowSec;
    this.onEvent('flee');
    m.attend.threat = from.clone();
    m.attend.alert = 1;
    m.reflexBlink();
    if (m.inBurrow) {
      // already safe: stay down
      this.task = { kind: 'burrow', burrow: this.home, step: m.gait === 'hidden' ? 'inside' : 'dive', until: now + 20, insideFor: 10 + this.rnd() * 20, peekFor: 3 + this.rnd() * 6 };
      if (m.peeking && this.home) { m.diveInto(new Vector3(this.home.x, this.home.y, this.home.z)); }
      return;
    }
    const away = this.tmp.set(m.pos.x - from.x, 0, m.pos.z - from.z);
    if (away.lengthSq() < 1e-8) away.set(Math.sin(m.heading), 0, Math.cos(m.heading));
    away.normalize();
    if (m.medium === 'water') {
      const target = new Vector3(m.pos.x + away.x * 1.2, 0, m.pos.z + away.z * 1.2);
      this.task = { kind: 'escape', from: from.clone(), plan: 'swim', step: 0, target, burrow: null, until: now + 6 };
      return;
    }
    // options: the water (skip into it), the burrow (dive in), or a few hops away over the mud
    const water = this.scanWater(w, away);
    const home = this.ensureHome(w);
    let plan: 'water' | 'burrow' | 'hops' = 'hops';
    if (water && water.d < 2.5 && water.dot > -0.25) plan = 'water';
    if (home) {
      const hd = Math.hypot(home.x - m.pos.x, home.z - m.pos.z);
      const hdot = ((home.x - m.pos.x) * away.x + (home.z - m.pos.z) * away.z) / Math.max(hd, 1e-6);
      const burrowScore = hd < 1.6 && hdot > -0.4 ? 2.2 - hd : -1;
      const waterScore = plan === 'water' ? 2.5 - water!.d + water!.dot * 0.5 : -1;
      if (burrowScore > waterScore) plan = 'burrow';
    }
    this.task = { kind: 'escape', from: from.clone(), plan, step: 0, target: plan === 'water' ? water!.p : null, burrow: plan === 'burrow' ? home : null, until: now + 10 };
    void L;
  }

  private runEscape(t: Extract<Task, { kind: 'escape' }>, w: MindWorld): void {
    const m = this.m;
    const L = m.L;
    const now = w.nowSec;
    m.attend.threat = t.from;
    m.attend.alert = 1;
    const away = Math.atan2(m.pos.x - t.from.x, m.pos.z - t.from.z);
    switch (t.plan) {
      case 'swim':
        if (t.step === 0) { m.travel(t.target!, 5 * L, 1); t.step = 1; }
        else if (m.done || now > t.until) this.endEscape(w);
        break;
      case 'water': {
        // hop toward the water; once over it, skip on across the surface and swim off
        if (m.medium === 'water' || m.gait === 'swim') {
          if (t.step < 100) { const tg = new Vector3(m.pos.x + Math.sin(away) * 1.0, 0, m.pos.z + Math.cos(away) * 1.0); m.travel(tg, 4.5 * L, 1); t.step = 100; }
          else if (m.done || now > t.until) this.endEscape(w);
          break;
        }
        if (m.done || m.gait === 'stand') {
          const tg = t.target!;
          const d = Math.hypot(tg.x - m.pos.x, tg.z - m.pos.z);
          const dir = Math.atan2(tg.x - m.pos.x, tg.z - m.pos.z);
          if (t.step > 5) { this.endEscape(w); break; }
          m.hopToward(dir, clamp(d + 0.6 * L, 1.5 * L, 3.2 * L), 2);
          t.step++;
        }
        break;
      }
      case 'burrow': {
        const b = t.burrow!;
        if (m.gait === 'hidden') { this.task = { kind: 'burrow', burrow: b, step: 'inside', until: now + 15 + this.rnd() * 25, insideFor: 0, peekFor: 3 + this.rnd() * 8 }; (this.task as { until: number }).until = now + 12 + this.rnd() * 20; break; }
        if (m.gait === 'dive') break;
        const d = Math.hypot(b.x - m.pos.x, b.z - m.pos.z);
        const dir = Math.atan2(b.x - m.pos.x, b.z - m.pos.z);
        if (m.done || m.gait === 'stand') {
          if (d < 0.32 * L) { m.diveInto(new Vector3(b.x, b.y, b.z)); break; }
          if (d > 1.6 * L && t.step < 4) { m.hopToward(dir, Math.max(0.6 * L, d - 0.28 * L)); t.step++; }
          else m.travel(new Vector3(b.x - Math.sin(dir) * 0.24 * L, 0, b.z - Math.cos(dir) * 0.24 * L), 3 * L, 1);
        }
        if (now > t.until) this.endEscape(w);
        break;
      }
      default: {
        // 1–3 hops away from the threat, bending a little each time
        if (m.done || m.gait === 'stand') {
          const dist = t.from.distanceTo(m.pos);
          if (t.step >= 3 || (t.step >= 1 && dist > 2.2)) { this.endEscape(w); break; }
          m.hopToward(away + (this.rnd() - 0.5) * 0.7, (2 + this.rnd() * 1.4) * L, 1);
          t.step++;
        }
      }
    }
  }

  private endEscape(w: MindWorld): void {
    // freeze and watch: dorsal fin up, eyes on the threat
    this.task = { kind: 'rest', until: w.nowSec + 3 + this.rnd() * 6, posture: 'alert' };
  }

  // -------------------------------------------------------------------------------------------- places
  /** nearest water deep enough to swim in, along rays around the animal: distance (m), alignment with `away` */
  private scanWater(w: MindWorld, away: Vector3): { p: Vector3; d: number; dot: number } | null {
    const m = this.m;
    const need = 0.9 * 0.145 * m.L;
    let best: { p: Vector3; d: number; dot: number } | null = null;
    for (let r = 0; r < 12; r++) {
      const a = (r / 12) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      for (const d of [0.25, 0.5, 0.8, 1.2, 1.7, 2.4]) {
        const x = m.pos.x + dx * d, z = m.pos.z + dz * d;
        if (w.water(x, z) - w.ground(x, z) >= need) {
          const dot = dx * away.x + dz * away.z;
          if (!best || d - dot * 0.6 < best.d - best.dot * 0.6) best = { p: new Vector3(x + dx * 0.15, 0, z + dz * 0.15), d, dot };
          break;
        }
      }
    }
    return best;
  }

  /** a spot on the water's edge: exposed or barely covered ground next to the water, uphill if the tide is over us */
  private findEdge(w: MindWorld): Vector3 | null {
    const m = this.m;
    const H = 0.145 * m.L;
    let best: Vector3 | null = null, bs = -Infinity;
    for (let r = 0; r < 16; r++) {
      const a = (r / 16) * Math.PI * 2;
      for (const d of [0.15, 0.3, 0.5, 0.8, 1.2, 1.8, 2.6]) {
        const x = m.pos.x + Math.sin(a) * d, z = m.pos.z + Math.cos(a) * d;
        const depth = w.water(x, z) - w.ground(x, z);
        if (depth > 0.5 * H || depth < -0.03) continue;
        const s = -d - Math.abs(depth - 0.1 * H) * 20;
        if (s > bs) { bs = s; best = new Vector3(x, 0, z); }
        break;
      }
    }
    return best;
  }

  /** water or a puddle to wet the skin in (or to drink): the nearest spot with a little water over it */
  private findWet(w: MindWorld, deeper = false): Vector3 | null {
    const m = this.m;
    const need = deeper ? 0.6 * 0.145 * m.L : 0.002;
    let best: Vector3 | null = null, bd = Infinity;
    for (let r = 0; r < 16; r++) {
      const a = (r / 16) * Math.PI * 2;
      for (const d of [0.1, 0.25, 0.45, 0.7, 1.0, 1.5, 2.2, 3.0]) {
        const x = m.pos.x + Math.sin(a) * d, z = m.pos.z + Math.cos(a) * d;
        if (w.water(x, z) - w.ground(x, z) >= need) { if (d < bd) { bd = d; best = new Vector3(x, 0, z); } break; }
      }
    }
    return best;
  }

  /**
   * Nudge a travel target toward where a mudskipper would want to be: wet ground near the water's edge, soft mud,
   * near its burrow, not on dry sand and not out in deep water.
   */
  private refineTarget(t: Vector3, w: MindWorld): Vector3 {
    const m = this.m;
    const L = m.L;
    let best = t.clone(), bs = this.placeScore(t.x, t.z, w);
    for (let k = 0; k < 6; k++) {
      const x = t.x + (this.rnd() - 0.5) * 12 * L, z = t.z + (this.rnd() - 0.5) * 12 * L;
      const s = this.placeScore(x, z, w) - Math.hypot(x - t.x, z - t.z) / L * 0.05;
      if (s > bs) { bs = s; best = new Vector3(x, 0, z); }
    }
    return best;
  }

  placeScore(x: number, z: number, w: MindWorld): number {
    const H = 0.145 * this.m.L;
    const depth = w.water(x, z) - w.ground(x, z);
    const s = w.sample(x, z);
    let score = 0;
    // at low water they sit mostly on the wet mud at the edge, half in a film of water at most (not swimming)
    if (depth > 2 * H) score -= 1.5;
    else if (depth > H) score -= 0.3;
    else if (depth > 0) score += 0.1;
    if (s) {
      score += (depth > 0 ? 0.7 : s.wetness) * 1.2;
      score += Math.exp(-s.distToWater / 3) * 0.8;
      score += s.substrate === 'mud' ? 0.6 : s.substrate === 'muddy_sand' ? 0.45 : s.substrate === 'sand' ? 0.1 : 0;
    }
    if (this.home) score += Math.exp(-Math.hypot(this.home.x - x, this.home.z - z) / 2) * 0.4;
    return score;
  }

  // -------------------------------------------------------------------------------------------- state label
  private labelState(now: number): TobiState {
    const m = this.m;
    const t = this.task;
    if (t?.kind === 'escape') return 'ESCAPE';
    if (t?.kind === 'burrow' || m.inBurrow) return 'BURROW';
    if (this.transitionState && now < this.transitionUntil) return this.transitionState;
    this.transitionState = null;
    if (t?.kind === 'forage') return 'FORAGE';
    if (m.gait === 'hop') return 'LAND_HOP';
    if (m.gait === 'swim') return 'SWIM';
    if (m.medium === 'shallow') return 'SHALLOW_WATER';
    if (m.gait === 'crawl') return 'LAND_CRAWL';
    return 'IDLE';
  }

  get taskKind(): string { return this.task?.kind ?? 'none'; }
}
