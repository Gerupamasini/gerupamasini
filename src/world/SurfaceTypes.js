// Surface (substrate) types of the tidal flat and how a Kentish Plover values them.
// docs/behavior.md §5 — preyProbability reflects S15/S16 (polychaetes & crabs on wet intertidal mud and
// sand), preferredDistance is metres from the water's edge, avoidance 0..1 (1 = never enter).
// These are designer-tunable data, not code constants.

export const SURFACE = {
  deepWater: { id: 0, walkable: false, walkCost: Infinity, preyProbability: 0, preferredDistance: null, avoidance: 1.0, label: 'deep water' },
  shallowWater: { id: 1, walkable: true, walkCost: 3.0, preyProbability: 0.25, preferredDistance: [0, 0.5], avoidance: 0.6, label: 'shallow water' },
  wetMud: { id: 2, walkable: true, walkCost: 1.3, preyProbability: 1.0, preferredDistance: [0, 6], avoidance: 0.0, label: 'wet mud' },
  mud: { id: 3, walkable: true, walkCost: 1.2, preyProbability: 0.55, preferredDistance: [3, 15], avoidance: 0.0, label: 'mud' },
  wetSand: { id: 4, walkable: true, walkCost: 1.0, preyProbability: 0.6, preferredDistance: [0, 5], avoidance: 0.0, label: 'wet sand' },
  sand: { id: 5, walkable: true, walkCost: 1.0, preyProbability: 0.25, preferredDistance: [5, 30], avoidance: 0.0, label: 'sand' },
  drySand: { id: 6, walkable: true, walkCost: 1.1, preyProbability: 0.1, preferredDistance: null, avoidance: 0.0, label: 'dry sand' },
  vegetation: { id: 7, walkable: true, walkCost: 2.2, preyProbability: 0.15, preferredDistance: null, avoidance: 0.4, label: 'vegetation' },
};

export const SURFACE_BY_ID = Object.fromEntries(Object.entries(SURFACE).map(([k, v]) => [v.id, k]));

// Thresholds used by Terrain.surfaceAt (metres / seconds of game time)
export const SURFACE_RULES = {
  deepWaterDepth: 0.035, // deeper than ~⅔ of the bare-leg height → not wadeable for this plover
  wetDuration: 2.5 * 3600, // substrate stays "wet" this long after emersion
  drySandDuration: 5 * 3600,
};

/** Relative prey availability as a function of time since emersion (S15: success rises after emersion). */
export function emersionPreyFactor(secondsExposed) {
  if (!(secondsExposed >= 0)) return 0;
  const h = secondsExposed / 3600;
  // rises over the first ~1.5 h, then declines slowly as the surface dries
  return Math.min(1, 0.35 + h / 1.5 * 0.65) * (h > 4 ? Math.max(0.35, 1 - (h - 4) * 0.2) : 1);
}
