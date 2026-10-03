import { Vector3 } from 'three';
import type { BTNode, BehaviorTreeDef, SpeciesDef, TidePhase } from '../../data/schemas';
import type { Individual } from '../Individual';
import type { Intent } from '../drivers/Driver';
import type { Habitat, HabitatSample } from '../../world/Habitat';
import type { TimeOfDay } from '../../world/Sun';
import type { Season } from '../../core/Time';

export interface PerceptionContext {
  ind: Individual;
  sample: HabitatSample;
  habitat: Habitat;
  tidePhase: TidePhase;
  tod: TimeOfDay;
  season: Season;
  playerPos: Vector3;
  playerDist: number;
  nowSec: number;
  aquatic: boolean;
  /** lives on the mud and in the water (mudskippers): targets favour wet ground near the water's edge */
  amphibious?: boolean;
}

type ArgVal = number | string | boolean | number[];
type Args = Record<string, ArgVal>;

const INTERRUPT_ONLY = 1, NORMAL = 0;

export interface TickResult {
  intent: Intent | null;
}

function resolveArgs(args: Args, params: Record<string, ArgVal>): Args {
  const out: Args = {};
  for (const [k, v] of Object.entries(args)) out[k] = typeof v === 'string' && v.startsWith('$') ? (params[v.slice(1)] ?? v) : v;
  return out;
}

function num(v: ArgVal | undefined, d: number): number {
  return typeof v === 'number' ? v : d;
}

function range(v: ArgVal | undefined, rng: { range(a: number, b: number): number }, d: number): number {
  if (Array.isArray(v) && v.length >= 2) return rng.range(v[0], v[1]);
  if (typeof v === 'number') return v;
  return d;
}

/** Runtime for the JSON behaviour trees. One instance per tree; per-individual state lives on the individual. */
export class BehaviorTree {
  private nextIntentId = 1;
  constructor(readonly def: BehaviorTreeDef, readonly species: SpeciesDef) {}

  /** Evaluate the tree. Returns a new intent when the brain decided to change behaviour. */
  tick(ctx: PerceptionContext): Intent | null {
    const b = ctx.ind.brain;
    const busy = !b.done && ctx.nowSec < b.busyUntil;
    const mode = busy ? INTERRUPT_ONLY : NORMAL;
    const r = this.evalNode(this.def.root, ctx, mode);
    return r ? r : null;
  }

  private evalNode(node: BTNode, ctx: PerceptionContext, mode: number): Intent | null | false {
    switch (node.type) {
      case 'selector':
        for (const c of node.children) {
          const r = this.evalNode(c, ctx, mode);
          if (r !== false) return r;
        }
        return false;
      case 'sequence': {
        let last: Intent | null | false = false;
        for (const c of node.children) {
          last = this.evalNode(c, ctx, mode);
          if (last === false) return false;
        }
        return last;
      }
      case 'random': {
        const w = node.weights ?? node.children.map(() => 1);
        const total = w.reduce((s, x) => s + x, 0);
        let r = ctx.ind.rng.next() * total;
        let pick = node.children[0];
        for (let i = 0; i < node.children.length; i++) { r -= w[i] ?? 0; if (r <= 0) { pick = node.children[i]; break; } }
        return this.evalNode(pick, ctx, mode);
      }
      case 'cooldown': {
        const key = JSON.stringify(node.child).slice(0, 40) + node.seconds;
        const until = ctx.ind.brain.cooldowns.get(key) ?? 0;
        if (ctx.nowSec < until) return false;
        const r = this.evalNode(node.child, ctx, mode);
        if (r) ctx.ind.brain.cooldowns.set(key, ctx.nowSec + node.seconds);
        return r;
      }
      case 'condition':
        return this.condition(node.name, resolveArgs(node.args, this.species.brain.params), ctx) ? null : false;
      case 'action':
        if (mode === INTERRUPT_ONLY && !node.interrupt) return false;
        if (mode === INTERRUPT_ONLY && ctx.ind.brain.lastIntentKind === node.name) return null; // already doing it
        return this.action(node.name, resolveArgs(node.args, this.species.brain.params), ctx);
    }
  }

  private condition(name: string, a: Args, ctx: PerceptionContext): boolean {
    const ind = ctx.ind;
    switch (name) {
      case 'player_within': return ctx.playerDist <= num(a.m, 2);
      case 'player_beyond': return ctx.playerDist > num(a.m, 2);
      case 'alert_above': return ind.alert > num(a.v, 0.5);
      case 'depth_below': return ctx.sample.depth < num(a.m, 0.05);
      case 'depth_above': return ctx.sample.depth > num(a.m, 0.5);
      case 'exposed': return ctx.sample.exposed;
      case 'submerged': return !ctx.sample.exposed;
      case 'time_is': return Array.isArray(a.v) ? false : String(a.v).split(',').includes(ctx.tod);
      case 'tide_is': return String(a.v) === 'any' || String(a.v) === ctx.tidePhase;
      case 'energy_below': return ind.energy < num(a.v, 0.3);
      case 'moisture_below': return (ind.moisture ?? 1) < num(a.v, 0.3);
      case 'season_is': return String(a.v).split(',').includes(ctx.season);
      // minutes since the ground here was last under water (mudskippers withdraw as the mud dries and warms)
      case 'exposed_minutes_above': {
        if (!ctx.sample.exposed) return false;
        const k = ctx.habitat.coarseIndex(ind.pos.x, ind.pos.z);
        return (ctx.nowSec * 1000 - ctx.habitat.lastWet[k]) / 60000 > num(a.m, 60);
      }
      case 'hidden': return !!ind.hidden;
      case 'random_chance': return ind.rng.chance(num(a.p, 0.5));
      case 'neighbor_within': return false; // reserved for interaction rules
      default: console.warn(`[bt] unknown condition ${name}`); return false;
    }
  }

  private action(name: string, a: Args, ctx: PerceptionContext): Intent | false {
    const ind = ctx.ind;
    const id = this.nextIntentId++;
    const mk = (kind: Intent['kind'], extra: Partial<Intent> = {}): Intent => ({ id, kind, urgency: num(a.urgency, 0.5), seconds: 0, ...extra });
    switch (name) {
      case 'rest': {
        const mean = num(a.seconds, 10);
        const secs = mean * (0.35 + 1.3 * ind.rng.next());
        return mk('rest', { seconds: secs });
      }
      case 'wander': {
        const dist = range(a.distance_m, ind.rng, 0.3);
        const stay = num(a.stayNearHome_m, 5);
        const target = this.pickTarget(ctx, dist, stay, !!a.alongWaterline);
        if (!target) return false;
        return mk('wander', { target, seconds: 12 });
      }
      case 'move_to_deeper': {
        const target = this.searchTarget(ctx, (s) => s.depth, num(a.minDepth_m, 0.15), 8, 1.5);
        if (!target) return false;
        return mk('moveTo', { target, seconds: 10 });
      }
      case 'move_to_waterline': {
        const target = this.searchTarget(ctx, (s) => (s.exposed && s.distToWater <= 5 ? 1 : -s.distToWater), 0.5, 12, num(a.distance_m, 10) / 4);
        if (!target) return false;
        return mk('moveTo', { target, seconds: 20 });
      }
      case 'flee': {
        const dist = num(a.distance_m, 1);
        const dir = new Vector3().subVectors(ind.pos, ctx.playerPos).setY(0);
        if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
        dir.normalize();
        // aquatic species flee into deeper water, birds away along the ground
        let target = ind.pos.clone().addScaledVector(dir, dist);
        if (ctx.aquatic) {
          const best = this.searchTarget(ctx, (s) => s.depth, 0.03, 8, dist / 2, dir);
          if (best) target = best;
        }
        ind.alert = 1;
        return mk('flee', { target, from: ctx.playerPos.clone(), seconds: 4, param: typeof a.param === 'string' ? a.param : undefined, urgency: num(a.urgency, 1) });
      }
      case 'forage': return mk('forage', { seconds: range(a.seconds, ind.rng, 4) });
      case 'display': return mk('display', { seconds: range(a.seconds, ind.rng, 4), param: typeof a.param === 'string' ? a.param : 'alert' });
      case 'burrow': return mk('burrow', { seconds: range(a.seconds, ind.rng, 10) });
      case 'special': return mk('special', { seconds: 3, param: typeof a.param === 'string' ? a.param : undefined });
      case 'move_to': return false;
      default: console.warn(`[bt] unknown action ${name}`); return false;
    }
  }

  /** Random reachable point at a distance, biased back toward home when far from it. */
  private pickTarget(ctx: PerceptionContext, dist: number, stayNear: number, alongWaterline: boolean): Vector3 | null {
    const ind = ctx.ind;
    const homeDist = ind.pos.distanceTo(ind.home);
    if (ctx.amphibious) return this.pickAmphibious(ctx, dist, stayNear, homeDist);
    for (let i = 0; i < 6; i++) {
      let ang: number;
      if (homeDist > stayNear && ind.rng.chance(0.7)) {
        ang = Math.atan2(ind.home.x - ind.pos.x, ind.home.z - ind.pos.z) + ind.rng.range(-0.6, 0.6);
      } else ang = ind.heading + ind.rng.range(-1.6, 1.6);
      const x = ind.pos.x + Math.sin(ang) * dist, z = ind.pos.z + Math.cos(ang) * dist;
      const s = ctx.habitat.sample(x, z, ctx.nowSec * 1000);
      if (ctx.aquatic ? s.depth >= 0.03 : s.exposed && (!alongWaterline || s.distToWater <= 10)) return new Vector3(x, 0, z);
    }
    return null;
  }

  /**
   * Amphibious target: of several candidates, the one with the best ground for a mudskipper — wet, soft mud near the
   * water's edge, shallow water at most, not too far from home.
   */
  private pickAmphibious(ctx: PerceptionContext, dist: number, stayNear: number, homeDist: number): Vector3 | null {
    const ind = ctx.ind;
    let best: Vector3 | null = null, bs = -Infinity;
    for (let i = 0; i < 9; i++) {
      const toHome = homeDist > stayNear && ind.rng.chance(0.6);
      const ang = toHome ? Math.atan2(ind.home.x - ind.pos.x, ind.home.z - ind.pos.z) + ind.rng.range(-0.7, 0.7) : ind.heading + ind.rng.range(-2.2, 2.2);
      const d = dist * ind.rng.range(0.6, 1.25);
      const x = ind.pos.x + Math.sin(ang) * d, z = ind.pos.z + Math.cos(ang) * d;
      if (!ctx.habitat.terrain.inside(x, z, 3)) continue;
      const s = ctx.habitat.sample(x, z, ctx.nowSec * 1000);
      if (s.depth > 0.15) continue;
      const sub = s.substrate === 'mud' ? 0.6 : s.substrate === 'muddy_sand' ? 0.45 : s.substrate === 'channel' ? 0.3 : s.substrate === 'sand' ? 0.1 : 0;
      const score = s.wetness * 1.2 + Math.exp(-s.distToWater / 3) * 0.8 + sub + (s.depth > 0 ? 0.3 : 0) - (toHome ? 0 : 0.002 * Math.hypot(x - ind.home.x, z - ind.home.z)) + ind.rng.range(0, 0.35);
      if (score > bs) { bs = score; best = new Vector3(x, 0, z); }
    }
    return best;
  }

  /** Sample points on rings around the individual and return the best scoring one above a threshold. */
  private searchTarget(ctx: PerceptionContext, score: (s: HabitatSample) => number, minScore: number, rays: number, step: number, bias?: Vector3): Vector3 | null {
    const ind = ctx.ind;
    let best: Vector3 | null = null, bestScore = -Infinity;
    for (let ring = 1; ring <= 3; ring++) {
      for (let r = 0; r < rays; r++) {
        const ang = (r / rays) * Math.PI * 2;
        const dx = Math.sin(ang), dz = Math.cos(ang);
        const x = ind.pos.x + dx * step * ring, z = ind.pos.z + dz * step * ring;
        const s = ctx.habitat.sample(x, z, ctx.nowSec * 1000);
        let sc = score(s);
        if (bias) sc += 0.2 * (dx * bias.x + dz * bias.z) * ring;
        if (sc > bestScore) { bestScore = sc; best = new Vector3(x, 0, z); }
      }
      if (bestScore >= minScore) return best;
    }
    return bestScore >= minScore ? best : null;
  }
}
