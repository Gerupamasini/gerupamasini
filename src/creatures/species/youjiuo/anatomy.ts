/**
 * ヨウジウオ (Syngnathus schlegeli): the numbers the model is built from, in units of total length (TL) along the
 * snout–tail axis (s = 0 at the snout tip, 1 at the tip of the caudal fin). From the reference photographs (70 photos:
 * live fish in clear cases and on eelgrass, specimens on rulers, close-ups of the head, the eye and the tail) and the
 * usual descriptions of the species (trunk rings 18–20, tail rings 38–46, dorsal-fin rays 30–47, pectoral-fin rays
 * 12–13, snout length 1.6–2.0 in head length). See docs/models/youjiuo/README.md.
 *
 * Model frame (like the ハク's): metres, +Z forward (toward the snout), +Y up, +X the fish's left; origin on the axis
 * at S_PIVOT.
 */

/** the model is built at 20 cm and scaled to the individual */
export const MODEL_TL = 0.2;

/** snout tip, front of the orbit (snout base), eye centre, back of the head (the opercle's free edge, the occiput) */
export const S_MOUTH = 0.0;
export const S_SNOUT = 0.062;
export const S_EYE = 0.0745;
export const S_HEAD = 0.115;
/** trunk / tail boundary (the anus), base of the caudal fin */
export const S_TRUNK_END = 0.4;
export const S_CAUDAL = 0.976;
/** the rig's origin: the middle of the trunk */
export const S_PIVOT = 0.315;

export const TRUNK_RINGS = 19;
export const TAIL_RINGS = 41;

/** z of a point at s (TL units) */
export const zOf = (s: number): number => S_PIVOT - s;

/**
 * Continuous bony-ring coordinate: 0 at the back of the head, 19 at the anus, 60 at the caudal base; -1 on the head.
 * The trunk rings are all alike; the tail rings shorten toward the tip (the first ~1.5 × as long as the last).
 */
export function ringAt(s: number): number {
  if (s < S_HEAD) return -1;
  if (s <= S_TRUNK_END) return ((s - S_HEAD) / (S_TRUNK_END - S_HEAD)) * TRUNK_RINGS;
  const u = Math.min(1, (s - S_TRUNK_END) / (S_CAUDAL - S_TRUNK_END));
  return TRUNK_RINGS + TAIL_RINGS * (u - 0.2 * u * (1 - u));
}
/** inverse of ringAt on the body (r in 0..60) */
export function sOfRing(r: number): number {
  if (r <= TRUNK_RINGS) return S_HEAD + (r / TRUNK_RINGS) * (S_TRUNK_END - S_HEAD);
  const f = Math.min(1, (r - TRUNK_RINGS) / TAIL_RINGS);
  // u - 0.2u(1-u) = f  →  0.2u² + 0.8u - f = 0
  const u = (-0.8 + Math.sqrt(0.64 + 0.8 * f)) / 0.4;
  return S_TRUNK_END + u * (S_CAUDAL - S_TRUNK_END);
}

type Table = readonly (readonly [number, number])[];
function lerpTable(t: Table, x: number): number {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1], [x1, y1] = t[i];
      const u = (x - x0) / (x1 - x0);
      // smooth between the points (monotone enough for these profiles)
      const w = u * u * (3 - 2 * u);
      return y0 + (y1 - y0) * (0.35 * u + 0.65 * w);
    }
  }
  return t[t.length - 1][1];
}

/**
 * Full depth of the body (TL): the slightly flared mouth, the slender tube of the snout, the head deepening behind
 * the eye to the opercle, the deep heptagonal trunk, the long quadrangular tail tapering to the caudal base.
 */
export const DEPTH: Table = [
  [0.0, 0.0093], [0.004, 0.0089], [0.012, 0.0077], [0.03, 0.0079], [0.05, 0.009], [0.062, 0.0118], [0.0745, 0.0172],
  [0.09, 0.0214], [0.105, 0.0244], [0.115, 0.0256], [0.13, 0.0272], [0.18, 0.0302], [0.25, 0.0322], [0.33, 0.032],
  [0.38, 0.0298], [0.4, 0.0262], [0.45, 0.0228], [0.55, 0.0186], [0.65, 0.015], [0.75, 0.0118], [0.85, 0.0089],
  [0.93, 0.0069], [0.976, 0.0058], [1.0, 0.005],
];
/** full width (TL): compressed head and snout, the trunk nearly as wide as deep */
export const WIDTH: Table = [
  [0.0, 0.0071], [0.004, 0.0068], [0.012, 0.0057], [0.03, 0.0059], [0.05, 0.0067], [0.062, 0.0084], [0.0745, 0.0122],
  [0.09, 0.0158], [0.105, 0.0174], [0.115, 0.0186], [0.13, 0.0214], [0.18, 0.0244], [0.25, 0.0258], [0.33, 0.0248],
  [0.38, 0.0224], [0.4, 0.019], [0.45, 0.017], [0.55, 0.0145], [0.65, 0.012], [0.75, 0.0096], [0.85, 0.0074],
  [0.93, 0.0058], [0.976, 0.005], [1.0, 0.0042],
];
/** height of the section's centre above the axis: the snout runs a little low, its tip turned up to the mouth */
export const CENTRE: Table = [
  [0.0, -0.0006], [0.008, -0.0019], [0.03, -0.0022], [0.062, -0.0016], [0.09, 0.0], [1.0, 0.0],
];

export const depthAt = (s: number): number => lerpTable(DEPTH, s);
export const widthAt = (s: number): number => lerpTable(WIDTH, s);
export const centreAt = (s: number): number => lerpTable(CENTRE, s);

/**
 * The cross-section's eight key points (unit half-width / half-depth, the fish's left side; mirrored for the right),
 * in order from the dorsal midline down the left flank to the ventral midline:
 * dorsal midline, superior ridge, lateral ridge, inferior ridge, ventral midline.
 * Trunk: heptagonal (a narrow flat back between the superior ridges, the lateral ridge at the widest point, a ventral
 * keel). Tail: quadrangular (flat above and below, the lateral ridge gone).
 */
export const TRUNK_PTS = [[0, 0.93], [0.56, 0.92], [1.0, 0.04], [0.76, -0.63], [0, -1.0]] as const;
export const TAIL_PTS = [[0, 1.0], [0.95, 0.93], [0.97, 0.0], [0.95, -0.93], [0, -1.0]] as const;

/** 0 = trunk section, 1 = tail section */
export const tailness = (s: number): number => {
  const u = Math.min(1, Math.max(0, (s - 0.37) / 0.07));
  return u * u * (3 - 2 * u);
};
/** 0 = rounded head section, 1 = ridged body section */
export const ridgeness = (s: number): number => {
  const u = Math.min(1, Math.max(0, (s - 0.108) / 0.03));
  return u * u * (3 - 2 * u);
};

/** eye: centre (s, height above axis), radius of the eyeball (TL), how far its dome stands out of the skin */
export const EYE = { s: S_EYE, y: 0.0042, r: 0.0079, pupil: 0.42 } as const;

/** the dorsal fin: base from s0 to s1 on the back over the last trunk and first tail rings, 38 rays */
export const DORSAL = { s0: 0.372, s1: 0.488, rays: 38, height: 0.0175, lean: 1.0 } as const;
/** pectoral fin: a small fan just behind the gill cover, low on the flank, 12 rays */
export const PEC = { s: 0.119, y0: -0.0068, y1: 0.0016, rays: 12, len: 0.0118 } as const;
/** caudal fin: a small rounded fan of 10 rays */
export const CAUDAL = { s: S_CAUDAL, rays: 10, len: 0.027, spread: 0.68 } as const;
/** anal fin: two or three tiny rays just behind the anus */
export const ANAL = { s: 0.404, rays: 3, len: 0.0045 } as const;

/** stations of the body chain (s at each bone's front joint); the last segment runs to the tail tip */
export const BODY_STATIONS = [0.115, 0.165, 0.215, 0.265, 0.315, 0.36] as const;
export const TAIL_STATIONS = [0.405, 0.45, 0.495, 0.54, 0.585, 0.63, 0.67, 0.71, 0.745, 0.78, 0.81, 0.84, 0.865, 0.89, 0.915, 0.94, 0.96, 0.98] as const;
export const STATIONS: readonly number[] = [...BODY_STATIONS, ...TAIL_STATIONS, 1.0];
/** number of chain segments (bones) */
export const NSEG = STATIONS.length - 1;
/** the pivot's station index */
export const PIVOT_K = BODY_STATIONS.indexOf(S_PIVOT as (typeof BODY_STATIONS)[number]);
export const DORSAL_BONES = 8;

/**
 * Bones. The chain is Body … Body_5 (trunk) and Tail … Tail_17 (tail); Head, Snout (with Jaw at its tip), the eyes,
 * the pectoral fins and the dorsal fin's eight ray bones are placed from it. All are children of YoujiuoRoot (the rig
 * is driven in the root's space, see pose.ts).
 */
export const CHAIN_BONES: readonly string[] = [
  'Body', ...[1, 2, 3, 4, 5].map((i) => `Body_${i}`), 'Tail', ...Array.from({ length: TAIL_STATIONS.length - 1 }, (_, i) => `Tail_${i + 1}`),
];
export const BONES: readonly string[] = [
  ...CHAIN_BONES, 'Head', 'Snout', 'Jaw', 'Eye_L', 'Eye_R', 'PectoralFin_L', 'PectoralFin_R',
  'DorsalFin', ...Array.from({ length: DORSAL_BONES - 1 }, (_, i) => `DorsalFin_${i + 1}`),
];
export const boneIndex = (name: string): number => {
  const i = BONES.indexOf(name);
  if (i < 0) throw new Error(`no bone ${name}`);
  return i;
};
export const B_HEAD = BONES.indexOf('Head');
export const B_SNOUT = BONES.indexOf('Snout');
export const B_JAW = BONES.indexOf('Jaw');
export const B_EYE_L = BONES.indexOf('Eye_L');
export const B_EYE_R = BONES.indexOf('Eye_R');
export const B_PEC_L = BONES.indexOf('PectoralFin_L');
export const B_PEC_R = BONES.indexOf('PectoralFin_R');
export const B_DORSAL = BONES.indexOf('DorsalFin');

/** rest pivots of the non-chain bones (TL units: x, y, s) */
export const JAW_PIVOT = { s: 0.007, y: -0.0036 } as const;
export const dorsalBoneS = (b: number): number => DORSAL.s0 + ((DORSAL.s1 - DORSAL.s0) * b) / (DORSAL_BONES - 1);

/** index of the chain segment that holds s */
export function segmentOf(s: number): number {
  for (let k = NSEG - 1; k >= 0; k--) if (s >= STATIONS[k]) return k;
  return 0;
}

/**
 * Chain bones and weights for a body point at s ≥ S_HEAD: rigid in each segment's middle, blended 50/50 at a joint
 * (the joints of a pipefish's armour bend a little each; the blend keeps the skin smooth over them).
 */
export function chainWeights(s: number): [number, number][] {
  const k = segmentOf(s);
  const s0 = STATIONS[k], s1 = STATIONS[k + 1];
  const t = Math.min(1, Math.max(0, (s - s0) / (s1 - s0)));
  const ss = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  const wPrev = k > 0 ? 0.5 * (1 - ss(0, 0.5, t)) : 0;
  const wNext = k < NSEG - 1 ? 0.5 * ss(0.5, 1, t) : 0;
  const out: [number, number][] = [[k, 1 - wPrev - wNext]];
  if (wPrev > 1e-4) out.push([k - 1, wPrev]);
  if (wNext > 1e-4) out.push([k + 1, wNext]);
  return out;
}

/** body weights for any s: snout, head, chain (with soft hand-overs at the snout base and the occiput) */
export function bodyWeights(s: number, y: number): [number, number][] {
  const ss = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  if (s < S_SNOUT + 0.008) {
    const h = ss(S_SNOUT - 0.01, S_SNOUT + 0.008, s);
    // the lower jaw: the tip of the snout below the mouth
    const j = (1 - ss(0.004, 0.012, s)) * ss(0.0, -0.003, y - centreAt(s));
    const out: [number, number][] = [];
    if (j > 1e-3) out.push([B_JAW, j * (1 - h)]);
    out.push([B_SNOUT, (1 - j) * (1 - h)]);
    if (h > 1e-3) out.push([B_HEAD, h]);
    return out.filter((w) => w[1] > 1e-4);
  }
  if (s < S_HEAD - 0.006) return [[B_HEAD, 1]];
  const h = 1 - ss(S_HEAD - 0.006, S_HEAD + 0.01, s);
  const out = chainWeights(Math.max(s, S_HEAD)).map(([k, w]) => [k, w * (1 - h)] as [number, number]);
  if (h > 1e-3) out.push([B_HEAD, h]);
  return out.filter((w) => w[1] > 1e-4);
}
