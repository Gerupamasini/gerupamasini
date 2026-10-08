import { isAquatic, type SpeciesDef, type SpawnRule, type TidePhase } from '../data/schemas';
import type { Habitat } from '../world/Habitat';
import type { TimeOfDay } from '../world/Sun';
import type { Season } from '../core/Time';
import { Rng, hashInts } from '../core/Rng';
import { generateIndividual, type Individual, minDepthFor } from './Individual';

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
  /** resident of this feeding pit */
  pitId?: number;
  lengthRange?: [number, number];
}

const SPAWN_RADIUS = 60;
const DESPAWN_RADIUS = 95;
const MIN_SPAWN_DIST = 10;

/** species the world lays itself (the clam field's アサリ, the reef's マガキ), not the spawner */
const FIELD_SPECIES = new Set(['ruditapes_philippinarum', 'crassostrea_gigas']);

/** Evaluates spawn rules on the habitat's coarse cells around the player and decides who appears and who leaves. */
export class Spawner {
  private speciesList: SpeciesDef[];
  /** species kept out for now (the debug chooser) */
  hidden: ReadonlySet<string> = new Set();
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
  plan(px: number, pz: number, env: SpawnEnv, live: Individual[], minDist: number = MIN_SPAWN_DIST): SpawnRequest[] {
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
          if (FIELD_SPECIES.has(sp.id) || this.hidden.has(sp.id)) continue;   // アサリ are laid by the clam field in their thousands, マガキ by the reef; other burrowers spawn here, sparsely
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
              // position inside the cell matching the depth requirement (small pools: straight into the pool)
              let x = cx, z = cz, ok = false;
              if (rule.tags.includes('small_pool')) {
                const p = h.randomPoolPoint(cell, () => rng.next());
                if (p) { x = p[0]; z = p[1]; ok = h.sample(x, z, env.gameMs).depth >= Math.max(rule.depth_m?.[0] ?? 0.03, minDepthFor(sp, rule.length_mm ? rule.length_mm[1] : sp.size.length_mm.mean)); }
              }
              for (let tries = 0; tries < 8 && !ok; tries++) {
                x = cx + rng.range(-cs / 2, cs / 2);
                z = cz + rng.range(-cs / 2, cs / 2);
                const s = h.sample(x, z, env.gameMs);
                const aquatic = isAquatic(sp);
                // aquatic animals need water over their backs: the rule's floor or the size-based minimum, whichever is more
                const need = aquatic ? Math.max(rule.depth_m?.[0] ?? 0, minDepthFor(sp, rule.length_mm ? rule.length_mm[1] : sp.size.length_mm.mean)) : 0;
                // (depth is negative on exposed ground: a burrower's or a sessile animal's range may start below zero)
                ok = rule.depth_m ? s.depth >= (aquatic ? Math.max(rule.depth_m[0], need) : rule.depth_m[0]) && s.depth <= rule.depth_m[1] : aquatic ? s.depth >= need : s.exposed;
              }
              if (!ok) continue;
              out.push({ species: sp, ruleIndex: ri, cell, seed: memberSeed, x, z, lengthRange: rule.length_mm });
              counts.set(sp.id, (counts.get(sp.id) ?? 0) + 1);
            }
            occupied.add(`${sp.id}:${cell}`);
            break;
          }
        }
      }
    }
    // stingray pits: about one in three holds something small left behind by the tide (deterministic per pit and day)
    for (const pit of h.pits) {
      const d = Math.hypot(pit.x - px, pit.z - pz);
      if (d > SPAWN_RADIUS || d < minDist) continue;
      if (live.some((i) => i.pitId === pit.id)) continue;
      const roll = hashInts(pit.id * 31 + 7, env.day, 977) % 1000;
      if (roll >= 330) continue;
      if (h.sample(pit.x, pit.z, env.gameMs).depth < 0.025) continue;
      const pick = roll % 9;
      const spId = pick < 3 ? 'acanthogobius_flavimanus' : pick < 5 ? 'exopalaemon_orientis' : pick < 7 ? 'gymnogobius_macrognathos' : 'favonigobius_gymnauchen';
      const sp = this.speciesList.find((q) => q.id === spId);
      // only animals that live on this flat at all, and that the debug chooser lets out
      if (!sp || this.hidden.has(sp.id) || !sp.spawn.some((r) => !r.maps || r.maps.includes(env.mapId))) continue;
      if ((counts.get(sp.id) ?? 0) >= 60) continue;
      const seed = hashInts(pit.id, env.day, 991);
      const id = `${sp.id}#${hashInts(seed, 7).toString(16).padStart(8, '0')}`;
      if (this.removed.has(id)) continue;
      out.push({ species: sp, ruleIndex: 0, cell: h.coarseIndex(pit.x, pit.z), seed, x: pit.x, z: pit.z, pitId: pit.id, lengthRange: pick < 3 ? [26, 40] : pick < 5 ? [26, 42] : [24, 36] });
      counts.set(sp.id, (counts.get(sp.id) ?? 0) + 1);
    }
    return out;
  }

  /** Individuals that should leave: far away, or whose rule no longer matches for a while. */
  cull(px: number, pz: number, env: SpawnEnv, live: Individual[]): Individual[] {
    const out: Individual[] = [];
    for (const ind of live) {
      const d = Math.hypot(ind.pos.x - px, ind.pos.z - pz);
      if (d > DESPAWN_RADIUS) { out.push(ind); continue; }
      if (ind.pitId !== undefined) continue;   // pit residents stay as long as the player is around
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
    const ind = generateIndividual(req.species, req.seed, req.x, req.z, req.cell, req.ruleIndex, nowMs, req.lengthRange);
    if (req.pitId !== undefined) ind.pitId = req.pitId;
    return ind;
  }
}
