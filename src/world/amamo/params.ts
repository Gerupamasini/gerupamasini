/**
 * アマモ (Zostera marina): the numbers the model is built from. Each comes from the reference photos
 * (docs/models/amamo/README.md, 50 photos of meadows, single leaves on a ruler, tips, sheaths and rhizomes) and the
 * usual field descriptions of the species; the shader reads the same constants (GLSL_PARAMS) so the two never drift.
 */

/** Leaf blade. */
export const LEAF = {
  /** blade width: 3–6 mm is the common range in Japanese shallow beds, robust deep shoots reach 9–12 mm (ruler photos: 6–8 mm) */
  widthMin: 0.0035,
  widthMax: 0.0085,
  /** blade thickness ~0.2–0.3 mm: drawn as a ribbon of no thickness, with a shallow trough (the midrib) across it */
  thickness: 0.00025,
  /** the trough: edges raised by this fraction of the half width */
  cup: 0.22,
  /** parallel veins (3 prominent + finer ones between) */
  veinsMin: 5,
  veinsMax: 9,
  /** cross-veins over the air channels (the lattice seen against the light), spacing along the blade */
  crossVeinSpacing: 0.0035,
} as const;

/** Shoot (one sheath with its leaves). */
export const SHOOT = {
  /** leaves per shoot: 2–3 on a new shoot at a runner tip, 4–6 on a mature one, rarely 7 */
  leavesMin: 2,
  leavesMax: 7,
  /**
   * longest leaf by ground height (T.P. m): 40–60 cm at the spring low-water mark, longer below it (summer beds in Tokyo
   * Bay; a metre and more in deeper water)
   */
  lengthAt(groundTp: number): number {
    return Math.max(0.4, Math.min(1.0, 0.5 + 0.3 * (-groundTp - 0.6)));
  },
  /** the sheath that holds the leaves together: 5–20 cm, pale, flattened (leaves nested face to face inside) */
  sheathMin: 0.055,
  sheathMax: 0.17,
} as const;

/** Rhizome and roots. */
export const RHIZOME = {
  /** 2–5 mm thick, white-yellow when fresh, tan to brown with age (photos 035–037) */
  radiusMin: 0.0014,
  radiusMax: 0.0026,
  /** internode 1–3.5 cm; the runner turns a little at every node */
  internodeMin: 0.012,
  internodeMax: 0.034,
  /** two root bundles per node, roots 0.5–1 mm, 2–8 cm, brown */
  rootRadius: 0.00045,
  rootLenMin: 0.02,
  rootLenMax: 0.075,
} as const;

/** Where it grows on the flat (T.P. metres) and how the patches are made. */
export const ZONE = {
  /** upper limit: around the spring low-water mark (exposed for an hour or two on the big lows) */
  top: -0.55,
  /** lower limit on this map (the flat's seaward edge is ~-2.0 m) */
  bottom: -2.35,
  /** shoots per m² drawn in the game (real dense meadows hold 200–600 shoots of 3–6 leaves; a third of that reads as dense) */
  denseDensity: [80, 110] as const,
  sparseDensity: [18, 34] as const,
  pioneerDensity: [35, 55] as const,
} as const;

/** Motion and posture (see shader.ts for how they are used). */
export const MOTION = {
  /** bending per m/s of flow at full flexibility (rad); 0.2 m/s of current lays the blade over by ~55° */
  bendPerMps: 6.0,
  /** flexible length beyond the sheath over which the bend develops (m) */
  bendLength: 0.12,
  /** phase lag of the wave-driven sway from the base to the tip (rad): the bend travels up the blade */
  tipLag: 1.6,
  /** largest angle from vertical under water (buoyancy keeps the blade from going flat) */
  maxAngleWet: 1.42,
  /** out of the water nothing holds it up: past the sheath the blade drapes down to the sand (which then stops it) */
  maxAngleDry: 2.4,
  /** orbital speed of the wind waves over the meadow at full sway (m/s) */
  waveOrbital: 0.1,
  /** peak tidal current over the flat at mid-flood/mid-ebb on a spring tide (m/s) */
  tidalCurrent: 0.2,
  /** tide rate (m/h) that gives the peak current */
  tideRateAtPeak: 0.3,
  /** residual alongshore drift so slack water is not perfectly still (m/s) */
  residualCurrent: 0.025,
} as const;

/** Wave components that drive the canopy waving (monami): long-crested, crossing a little. */
export const SWAY_WAVES = [
  { lambda: 7.2, turn: 0.0, amp: 0.55 },
  { lambda: 4.6, turn: 0.42, amp: 0.3 },
  { lambda: 10.5, turn: -0.33, amp: 0.25 },
] as const;

/**
 * The tide states of a shoot, as the shader blends them, from the water depth over its base and its longest leaf.
 * - sway: how freely the canopy waves (1 = full, high water; ~0.2 = shallow, tips held by the surface; 0 = exposed)
 * - current: how far the tidal current lays it over (shallow water: the blade stands more)
 * - fall: 0 = afloat or standing, 1 = lying on the sand (the water has gone)
 */
export function postureState(depth: number, length: number): { sway: number; current: number; fall: number; submergence: number } {
  const sub = depth / Math.max(length, 0.05);
  const deep = smoothstep(0.55, 1.5, sub);
  const wet = smoothstep(0.0, 0.1, depth);
  return {
    sway: (0.22 + 0.78 * deep) * wet,
    current: (0.45 + 0.55 * deep) * wet,
    fall: 1 - smoothstep(0.005, 0.06, depth),
    submergence: sub,
  };
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Leaf slots of a shoot (geometry order = order of importance, so a lower LOD simply drops the last slots). */
export const LEAF_SLOTS = [
  // rel: length relative to the shoot; side: which side of the fan (distichous); splay: lean out of the fan (rad); age: 0 young .. 1 oldest
  { rel: 0.97, relVar: 0.05, side: 1, splay: 0.22, age: 0.45 },
  { rel: 0.92, relVar: 0.08, side: -1, splay: 0.26, age: 0.5 },
  { rel: 0.78, relVar: 0.12, side: 1, splay: 0.12, age: 0.25 },
  { rel: 0.45, relVar: 0.12, side: 0, splay: 0.05, age: 0.0 },
  { rel: 0.85, relVar: 0.25, side: -1, splay: 0.38, age: 0.95 },
  { rel: 0.93, relVar: 0.08, side: 1, splay: 0.3, age: 0.7 },
  { rel: 0.72, relVar: 0.25, side: -1, splay: 0.45, age: 1.0 },
] as const;

const f = (x: number) => (Number.isInteger(x) ? `${x}.0` : `${x}`);
const arr = (k: 'rel' | 'relVar' | 'side' | 'splay' | 'age') => `float[7](${LEAF_SLOTS.map((s) => f(s[k])).join(', ')})`;

/** The same constants for the shaders. */
export const GLSL_PARAMS = /* glsl */ `
const float AM_REL[7] = ${arr('rel')};
const float AM_REL_VAR[7] = ${arr('relVar')};
const float AM_SIDE[7] = ${arr('side')};
const float AM_SPLAY[7] = ${arr('splay')};
const float AM_AGE[7] = ${arr('age')};
#define AM_BEND ${f(MOTION.bendPerMps)}
#define AM_BEND_LEN ${f(MOTION.bendLength)}
#define AM_TIP_LAG ${f(MOTION.tipLag)}
#define AM_MAX_WET ${f(MOTION.maxAngleWet)}
#define AM_MAX_DRY ${f(MOTION.maxAngleDry)}
#define AM_CUP ${f(LEAF.cup)}
#define AM_XVEIN ${f(LEAF.crossVeinSpacing)}
const vec3 AM_WAVE_K = vec3(${SWAY_WAVES.map((w) => f(+((2 * Math.PI) / w.lambda).toFixed(5))).join(', ')});
const vec3 AM_WAVE_TURN = vec3(${SWAY_WAVES.map((w) => f(w.turn)).join(', ')});
const vec3 AM_WAVE_AMP = vec3(${SWAY_WAVES.map((w) => f(w.amp)).join(', ')});
// angular frequency from the dispersion relation at ~1.2 m of water
const vec3 AM_WAVE_W = vec3(${SWAY_WAVES.map((w) => { const k = (2 * Math.PI) / w.lambda; return f(+Math.sqrt(9.81 * k * Math.tanh(k * 1.2)).toFixed(5)); }).join(', ')});
`;
