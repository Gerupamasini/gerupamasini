/**
 * Levels of detail and update rates for コメツキガニ. A crab is about a centimetre wide: at 2 m it is a few pixels,
 * at 8 m less than one. Distances are from the camera.
 *
 *   LOD0  close-up   ≤ 0.45 m or the observed crab: 94 k tris + setae, all micro-detail in the material
 *   LOD1  near       ≤ 2.5 m: 22 k tris, granules and glints fade with the pixel footprint
 *   LOD2  far        ≤ the view distance: 5.7 k tris, flat speckle, no glints
 *
 * Simulation tiers (update rate of behaviour + animator):
 *   full   every frame        LOD0 / LOD1, or anything doing something visible up close
 *   half   every 2nd frame    LOD2 within 6 m
 *   slow   every 4th frame    LOD2 beyond 6 m, or hidden deep in its burrow
 *   colony abstract (1 Hz)    no view: in/out of the burrow and pellet counts only (ScopimeraColony)
 */
export const LOD_DIST = [0.45, 2.5];
export const HYST = 0.15;

/** LOD for a camera distance with hysteresis around the current level */
export function lodFor(dist, current, locked = false) {
  if (locked) return 0;
  const up = (d) => d * (1 - HYST), down = (d) => d * (1 + HYST);
  if (current === 0) return dist > down(LOD_DIST[0]) ? (dist > LOD_DIST[1] ? 2 : 1) : 0;
  if (current === 1) return dist < up(LOD_DIST[0]) ? 0 : dist > down(LOD_DIST[1]) ? 2 : 1;
  return dist < up(LOD_DIST[0]) ? 0 : dist < up(LOD_DIST[1]) ? 1 : 2;
}

/** frames between updates for a crab at this LOD / distance / state */
export function updateEvery(lod, dist, hidden) {
  if (lod <= 1) return 1;
  if (hidden) return 4;
  return dist < 6 ? 2 : 4;
}
