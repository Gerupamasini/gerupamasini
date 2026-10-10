/**
 * A 120 m gameplay interpretation of Manko's sheltered estuary (100 m × 100 m walkable), not a surveyed
 * reconstruction. From the user's photos: a limestone-rubble entry bank, an open, hummocky mud flat with
 * scattered Rhizophora seedlings, meandering creeks draining to the open water of the lake on the east,
 * dense mangrove belts on raised mud along the west and south and a mangrove island on the flat.
 * Axes: +x east, +z south. Heights in metres in the map datum (simulated tide ±0.85 m).
 */
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (d: number, w: number) => Math.exp(-((d / w) ** 2));

/** The main creek: enters from the west mangroves and meanders east into the lake. */
export function creekZ(x: number): number { return 6 + 7 * Math.sin(x * 0.06 + 0.4) + 2.4 * Math.sin(x * 0.17); }
/** A tributary draining the centre of the flat, from below the entry bank into the main creek. */
export function tributaryX(z: number): number { return -8 + 4 * Math.sin(z * 0.12) + 1.2 * Math.sin(z * 0.31); }
export const LAKE_X = 44;
export const ISLAND = { x: 14, z: -20, r: 7 };

/** Raised mangrove ground: belts on the west and south edges, the island, a spit at the creek mouth. */
export function forestMask(x: number, z: number): number {
  const west = smooth(-30, -38, x), south = smooth(34, 42, z) * smooth(LAKE_X + 6, LAKE_X - 2, x);
  const island = bump(Math.hypot(x - ISLAND.x, (z - ISLAND.z) * 1.3), ISLAND.r);
  const spit = bump(Math.hypot(x - 28, z - 27), 6);
  return Math.min(1, west + south + island + spit);
}

export function heightAt(x: number, z: number): number {
  // Entry bank of limestone rubble to the north, falling onto the flat.
  const bank = 1.75 * smooth(-44, -53, z);
  // The flat drains gently towards the lake; the lake bed falls away beyond its muddy shore.
  const flat = 0.28 - (x + 50) * 0.0028 - z * 0.0012;
  const lake = -1.0 * smooth(LAKE_X - 4, LAKE_X + 10, x) * (1 - smooth(-48, -56, z) * 0.6);
  // Hummocks, low benches and puddled hollows: the trampled, uneven mud of photo 2.
  const hummocks = 0.05 * Math.sin(x * 0.41 + Math.sin(z * 0.23)) * Math.cos(z * 0.33)
    + 0.06 * Math.sin(x * 0.11 + z * 0.17) + 0.03 * Math.sin(x * 0.9 - z * 0.7) * Math.sin(z * 0.8);
  const benches = 0.08 * smooth(0.55, 0.9, Math.sin(x * 0.07 - 1.1) * Math.sin(z * 0.09 + 0.5));
  const raised = 0.22 * forestMask(x, z);
  const mouth = smooth(LAKE_X - 16, LAKE_X, x);
  const creek = (0.48 + 0.2 * mouth) * bump(z - creekZ(x), 2.2 + 2.6 * mouth) * smooth(-58, -52, x) * (1 - smooth(LAKE_X, LAKE_X + 8, x));
  const tributary = 0.24 * bump(x - tributaryX(z), 1.2) * smooth(-44, -38, z) * smooth(creekZ(tributaryX(z)) + 2, creekZ(tributaryX(z)) - 6, z);
  return bank + flat + lake + (hummocks + benches) * (1 - smooth(-44, -50, z)) + raised - creek - tributary;
}

/** Palette: 0 sand, 1 muddy_sand, 2 mud, 3 gravel, 4 channel. */
export function substrateAt(x: number, z: number): number {
  if (z < -48) return 3;                                          // limestone rubble bank
  if (z < -44) return 1;                                          // its sandy, shelly foot
  if (Math.abs(z - creekZ(x)) < 1.4 + 1.8 * smooth(LAKE_X - 16, LAKE_X, x)) return 4;
  if (x > LAKE_X + 4) return 4;                                   // lake bed
  if (Math.abs(x - tributaryX(z)) < 0.7 && z > -40 && z < creekZ(x)) return 4;
  return 2;
}
