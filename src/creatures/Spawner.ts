import type { SpeciesDef, SpawnRule, TidePhase } from '../data/schemas';
import type { Habitat } from '../world/Habitat';
import type { TimeOfDay } from '../world/Sun';
import type { Season } from '../core/Time';
import { Rng, hashInts } from '../core/Rng';
import { generateIndividual, type Individual } from './Individual';

export interface SpawnEnv {
  tod: TimeOfDay;
  season: Season;
  tidePhase: TidePhase;
  mapId: string;
  gameMs: number;
  /** day number used to reseed cells daily */
  day: number;
}

export interface SpawnRequest {
  species: SpeciesDef;
  ruleIndex: number;
  cell: number;
  seed: number;
  x: number;
  z: number;
}

const SPAWN_RADIUS = 60;
const DESPAWN_RADIUS = 95;
const MIN_SPAWN_DIST = 10;

/** Evaluates spawn rules on the habitat's coarse cells around the player and decides who appears and who leaves. */
export class Spawner {
  private speciesList: SpeciesDef[];
  constructor(private readonly habitat: Habitat, species: Iterable<SpeciesDef>, private readonly removed: Set<string>) {
    this.speciesList = [...species];
  }

  ruleMatches(rule: SpawnRule, cellIndex: number, env: SpawnEnv): boolean {
    if (rule.maps && !rule.maps.includes(env.mapId)) return false;
    if (rule.time && !rule.time.includes(env.tod)) return false;
    if (rule.season && !rule.season.includes(env.season)) return false;
    if (rule.tide !== 'any' && rule.tide !== env.tidePhase) return false;
    const tags = this.habitat.tags[cellIndex];
    if (!rule.tags.some((t) => tags.includes(t))) return false;
    if (rule.substrate) {
      const sub = this.habitat.terrain.palette[this.habitat.coarseSubstrate[cellIndex]];
      if (!rule.substrate.includes(sub)) return false;
    }
    if (rule.depth_m) {
      const ground = this.habitat.coarseHeight[cellIndex];
      const spill = this.habitat.coarseSpill[cellIndex];
      const water = spill > this.habitat.tideLevel && spill > ground + 0.02 ? spill : this.habitat.tideLevel;
      const depth = water - ground;
      if (depth < rule.depth_m[0] || depth > rule.depth_m[1]) return false;
    }
    return true;
  }

  /** Decide spawns for the cells around (px, pz). `population` counts live individuals per species. */
  plan(px: number, pz: number, env: SpawnEnv, live: Individual[], minDist = MIN_SPAWN_DIST): SpawnRequest[] {
    const h = this.habitat;
    const cn = h.cn, cs = h.coarse;
    const counts = new Map<string, number>();
    const occupied = new Set<string>();
    for (const ind of live) {
      counts.set(ind.species.id, (counts.get(ind.species.id) ?? 0) + 1);
      occupied.add(`${ind.species.id}:${ind.cell}`);
    }
    const out: SpawnRequest[] = [];
    const ci = h.coarseIndex(px, pz);
    const ci0 = ci % cn, cj0 = (ci - ci0) / cn;
    const r = Math.ceil(SPAWN_RADIUS / cs);
    for (let cj = Math.max(0, cj0 - r); cj < Math.min(cn, cj0 + r + 1); cj++) {
      for (let ci1 = Math.max(0, ci0 - r); ci1 < Math.min(cn, ci0 + r + 1); ci1++) {
        const cell = cj * cn + ci1;
        const [cx, cz] = h.coarseCenter(ci1, cj);
        const d = Math.hypot(cx - px, cz - pz);
        if (d > SPAWN_RADIUS || d < minDist) continue;
        for (const sp of this.speciesList) {
          if (occupied.has(`${sp.id}:${cell}`)) continue;
          for (let ri = 0; ri < sp.spawn.length; ri++) {
            const rule = sp.spawn[ri];
            if ((counts.get(sp.id) ?? 0) >= rule.maxPopulation) continue;
            if (!this.ruleMatches(rule, cell, env)) continue;
            const seed = hashInts(cell, ri, env.day, sp.id.length * 131);
            const rng = new Rng(seed);
            const expected = (rule.density_per_100m2 * cs * cs) / 100;
            // deterministic per cell and day: does this cell host a group?
            const groupMean = (rule.group[0] + rule.group[1]) / 2;
            const pGroup = Math.min(1, expected / groupMean);
            if (!rng.chance(pGroup)) continue;
            const n = rng.int(rule.group[0], rule.group[1]);
            for (let k = 0; k < n; k++) {
              const memberSeed = hashInts(seed, k);
              const id = `${sp.id}#${hashInts(memberSeed, 7).toString(16).padStart(8, '0')}`;
              if (this.removed.has(id)) continue;
              if ((counts.get(sp.id) ?? 0) >= rule.maxPopulation) break;
              // position inside the cell matching the depth requirement
              let x = cx, z = cz, ok = false;
              for (let tries = 0; tries < 5 && !ok; tries++) {
                x = cx + rng.range(-cs / 2, cs / 2);
                z = cz + rng.range(-cs / 2, cs / 2);
                const s = h.sample(x, z, env.gameMs);
                const aquatic = sp.locomotion === 'swim' || sp.taxon.group === 'crustacean';
                ok = rule.depth_m ? s.depth >= rule.depth_m[0] && s.depth <= rule.depth_m[1] : aquatic ? s.depth > 0.03 : s.exposed;
              }
              if (!ok) continue;
              out.push({ species: sp, ruleIndex: ri, cell, seed: memberSeed, x, z });
              counts.set(sp.id, (counts.get(sp.id) ?? 0) + 1);
            }
            occupied.add(`${sp.id}:${cell}`);
            break;
          }
        }
      }
    }
    return out;
  }

  /** Individuals that should leave: far away, or whose rule no longer matches for a while. */
  cull(px: number, pz: number, env: SpawnEnv, live: Individual[]): Individual[] {
    const out: Individual[] = [];
    for (const ind of live) {
      const d = Math.hypot(ind.pos.x - px, ind.pos.z - pz);
      if (d > DESPAWN_RADIUS) { out.push(ind); continue; }
      const rule = ind.species.spawn[ind.ruleIndex];
      const cell = this.habitat.coarseIndex(ind.pos.x, ind.pos.z);
      const matches = rule ? this.ruleMatches(rule, cell, env) || ind.species.spawn.some((r) => this.ruleMatches(r, cell, env)) : true;
      if (matches) { ind.mismatchSince = 0; continue; }
      if (!ind.mismatchSince) ind.mismatchSince = env.gameMs;
      else if (env.gameMs - ind.mismatchSince > 30000 && d > 20) out.push(ind);
    }
    return out;
  }

  create(req: SpawnRequest, nowMs: number): Individual {
    return generateIndividual(req.species, req.seed, req.x, req.z, req.cell, req.ruleIndex, nowMs);
  }
}
