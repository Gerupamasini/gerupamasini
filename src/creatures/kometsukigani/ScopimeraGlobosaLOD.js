/**
 * Levels of detail and update rates for コメツキガニ. A crab is about a centimetre wide: at 0.35 m it is some 25 px
 * across, at 2.5 m four, at 8 m less than one (1080 lines, 70°). Distances are from the camera; the colony's
 * quality tier sets its own (ScopimeraColony QUALITY: 0.25–0.4 m and 1.4–2.5 m), the default below is the
 * viewer's and the tank's.
 *
 *   LOD0  close-up   ≤ 0.35 m or the observed crab: 47 k tris + setae, all micro-detail in the material
 *   LOD1  near       ≤ 2.5 m: 5.6 k tris, granules and glints fade with the pixel footprint
 *   LOD2  far        ≤ the view distance: 1.4 k tris (no mouthparts, abdomen or basal segments), flat speckle
 *
 * Simulation tiers (update rate of behaviour + animator; the bones' matrices only when it is updated):
 *   every frame        LOD0, and LOD1 within 1.2 m — or the observed crab
 *   every 2nd frame    LOD1 farther, a close-up crab down its burrow
 *   every 3rd / 4th    LOD2 within / beyond 6 m, and any crab down its burrow
 *   colony abstract (1 Hz)    no view: in/out of the burrow and pellet counts only (ScopimeraColony)
 */
export const LOD_DIST = [0.35, 2.5];
export const HYST = 0.15;

/** LOD for a camera distance with hysteresis around the current level (`dists`: the tier's LOD0 / LOD1 limits) */
export function lodFor(dist, current, locked = false, dists = LOD_DIST) {
  if (locked) return 0;
  const up = (d) => d * (1 - HYST), down = (d) => d * (1 + HYST);
  if (current === 0) return dist > down(dists[0]) ? (dist > dists[1] ? 2 : 1) : 0;
  if (current === 1) return dist < up(dists[0]) ? 0 : dist > down(dists[1]) ? 2 : 1;
  return dist < up(dists[0]) ? 0 : dist < up(dists[1]) ? 1 : 2;
}

/** frames between updates for a crab at this LOD / distance / state (hidden: down its burrow, at most its eyes out) */
export function updateEvery(lod, dist, hidden) {
  if (hidden) return lod === 0 ? 2 : 4;
  if (lod === 0) return 1;
  if (lod === 1) return dist < 1.2 ? 1 : 2;
  return dist < 6 ? 3 : 4;
}
