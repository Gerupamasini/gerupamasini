import { hashInts, Rng } from '../../../core/Rng';
import type { Substrate } from '../../../data/schemas';

/**
 * Where トビハゼ's burrows are: one place for the behaviour (behavior.ts walks, hops and dives to them, peeks out of
 * them, escapes into them) and the drawing (burrowLayer.ts puts the opening in the mud exactly there).
 *
 * The burrows belong to the spot, not to the fish: they are laid out from the home's position alone (a hash of it), so
 * the same fish spawned again the same day (the spawner's seed gives it the same home), or any fish homed on the same
 * spot, finds the very same holes. They live in the behaviour's state (TobiApi.burrows; serialize/restore carry them)
 * and are drawn while the fish is part of the flat's population; when it despawns they go with it (by then the
 * player is far off, or the flat is dark), and come back exactly where they were with it.
 *
 * The layout (behaviour.md §3.8; Ishimatsu et al. on P. modestus burrows; the field's crab holes, 0.4–4 a m²):
 *   own    its own burrow: a Y in the mud, the main opening (2–3 cm across for an 8 cm fish) at or near the home
 *   own2   the Y's second opening, 8–18 cm from the first (the same burrow: the fish dives into either)
 *   crab   a crab's hole about (0.5–1.8 m off; mudskippers take refuge in them), and those it finds on its way
 * Every opening is on mud: the species' substrates (data/species/periophthalmus_modestus.json, its exposed-mud spawn
 * rows: mud, muddy_sand, channel), never on sand, gravel or rock; where the home is not mud (a fish of the waterline
 * rows, on the stones) its own burrow is the nearest mud within 1.6 m, or there is none.
 */

/** where a mudskipper can dig (or find a crab's hole): the species' exposed-mud substrates */
export const BURROW_SUBSTRATES: ReadonlySet<Substrate> = new Set<Substrate>(['mud', 'muddy_sand', 'channel']);

export type BurrowKind = 'own' | 'own2' | 'crab';

export interface TobiBurrow {
  x: number;
  z: number;
  kind: BurrowKind;
  /** the opening's radius (m) */
  r: number;
  /** the azimuth the shaft goes down toward (rad; forward = (sin, cos)) */
  az: number;
  /** 0..1, the drawing's own variety (lumps, pellets, a puddle) */
  seed: number;
  /** found on the way (a crab's hole it came across), not one of the spot's: the first to be forgotten */
  made?: boolean;
}

/** What the layout reads of the world (TobiEnv's part of it). */
export interface BurrowGround {
  sample?(x: number, z: number): { substrate: Substrate } | null;
  canBurrow?: boolean;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
}

/** at most this many burrows known at once (the spot's four, and a few it found) */
export const MAX_BURROWS = 8;

/** a hole can be here: something to dig into, and mud (no habitat to ask, a tank's bed: yes) */
export function diggable(env: BurrowGround, x: number, z: number): boolean {
  if (env.canBurrow === false) return false;
  const b = env.bounds;
  if (b && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) return false;
  const s = env.sample?.(x, z);
  return !s || BURROW_SUBSTRATES.has(s.substrate);
}

/** the spot's own random stream: its position to the half centimetre */
export function burrowSeed(x: number, z: number): number {
  return hashInts(Math.round(x * 200), Math.round(z * 200), 0x7083);
}

/** the main opening's radius for a fish of total length L (m): 2.4–3.2 cm across an adult's, never under 2 cm */
export function ownRadius(L: number): number {
  return Math.min(0.02, Math.max(0.01, 0.17 * L));
}

const TAU = Math.PI * 2;

/**
 * The spot's burrows round a home (deterministic: the home's position alone, and the ground). Its own first (when
 * there is mud for it), then the Y's second opening, then two crab holes.
 */
export function planBurrows(home: { x: number; z: number }, L: number, env: BurrowGround): TobiBurrow[] {
  const out: TobiBurrow[] = [];
  if (env.canBurrow === false) return out;
  const rng = new Rng(burrowSeed(home.x, home.z));
  const r = (a: number, b: number) => rng.range(a, b);
  // its own: the home, else the nearest mud on rings round it (to 1.6 m)
  const a0 = r(0, TAU);
  let own: { x: number; z: number } | null = diggable(env, home.x, home.z) ? { x: home.x, z: home.z } : null;
  for (const d of [0.1, 0.25, 0.5, 0.8, 1.2, 1.6]) {
    if (own) break;
    for (let k = 0; k < 8 && !own; k++) {
      const a = a0 + (k * TAU) / 8, x = home.x + Math.sin(a) * d, z = home.z + Math.cos(a) * d;
      if (diggable(env, x, z)) own = { x, z };
    }
  }
  const ro = ownRadius(L);
  const az = r(0, TAU), sep = r(0.08, 0.18), s1 = rng.next(), s2 = rng.next();
  if (own) {
    // the shaft goes down toward the second opening (the Y's arms meet below)
    out.push({ x: own.x, z: own.z, kind: 'own', r: ro, az, seed: s1 });
    const x2 = own.x + Math.sin(az) * sep, z2 = own.z + Math.cos(az) * sep;
    if (diggable(env, x2, z2)) out.push({ x: x2, z: z2, kind: 'own2', r: ro * r(0.75, 0.9), az: az + Math.PI, seed: s2 });
  }
  // two crabs' holes about
  for (let i = 0; i < 2; i++) {
    for (let t = 0; t < 6; t++) {
      const a = r(0, TAU), d = r(0.5, 1.8), x = home.x + Math.sin(a) * d, z = home.z + Math.cos(a) * d;
      const rc = r(0.009, 0.013), azc = r(0, TAU), sc = rng.next();
      if (!diggable(env, x, z)) continue;
      out.push({ x, z, kind: 'crab', r: rc, az: azc, seed: sc });
      break;
    }
  }
  return out;
}

/** a crab's hole at (x, z), found on the way (null where there is no mud) */
export function holeAt(x: number, z: number, env: BurrowGround): TobiBurrow | null {
  if (!diggable(env, x, z)) return null;
  const h = burrowSeed(x, z);
  const u = (k: number) => (hashInts(h, k) % 10007) / 10007;
  return { x, z, kind: 'crab', r: 0.009 + 0.004 * u(1), az: u(2) * TAU, seed: u(3), made: true };
}

/** add a found hole to those known, forgetting the oldest found one (not the one in use) past MAX_BURROWS */
export function remember(list: TobiBurrow[], b: TobiBurrow, inUse: { x: number; z: number } | null): void {
  list.push(b);
  while (list.length > MAX_BURROWS) {
    const i = list.findIndex((o) => o.made && o !== inUse && o !== b);
    if (i < 0) break;
    list.splice(i, 1);
  }
}
