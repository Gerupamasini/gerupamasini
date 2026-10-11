/**
 * ミミイカ (Euprymna morsei, Sepiolidae): the body plan of the model, in millimetres, for an animal of 25 mm mantle
 * length (ML; the game's `length_mm` of a squid is its mantle length, as in the field guides).
 *
 * Measured on the 70 photographs of the reference sheet (side views 11, 12, 15, 19, 26, 29; dorsal 6, 7, 17, 66, 67;
 * frontal 9, 10, 47; swimming 52–56; burying 40–46; buried 16) and the literature on sepiolids:
 *  - mantle   a short, rounded muscular sac round the visceral mass (width ≈ 0.83 ML, depth ≈ 0.77 ML), blunt
 *             behind, the dorsal edge fused with the head (Euprymna), the sides and the belly free: a thick collar round
 *             the neck, the mantle cavity behind it with the gills, the funnel coming out of it
 *  - fins     two rounded, ear-like lobes ("ミミ") on the sides at mid-mantle: the base ≈ 0.42 ML long, the free lobe
 *             reaching ≈ 0.3 ML out and a little ahead of and behind its base; thin, clear, sparsely spotted
 *  - head     about as wide as the mantle, its sides taken up by the very large eyes (diameter ≈ 0.26 ML) under a
 *             transparent cornea, a silvery iris and a horizontal kidney-shaped pupil
 *  - arms     eight arms (0.45–0.67 ML), the third pair the longest, two rows of stalked suckers on the oral face
 *  - tentacles two long, thin tentacles with a small club, kept in the pockets between arms III and IV and shot out
 *             at prey (≈ 0.9 ML long out)
 *  - funnel   a short white cone under the head
 * Frame: x the animal's left, y dorsal, z forward (towards the arms). `z = 0` is the mantle's opening (the neck);
 * the model's origin (the root, near the centre of mass) is at Z_ROOT.
 */

export const ML_MM = 25;
/** the model's origin on the body axis (mm in the neck frame) */
export const Z_ROOT = -8;
/** posterior end of the mantle, front of the arm crown (the head's cap) */
export const Z_TIP = -ML_MM;
export const Z_FRONT = 8.9;

export interface ProfileKnot { z: number; w: number; h: number; c: number }

/**
 * The body's outline along its axis: half width w, half height h and the centre of the section c (mm). Mantle
 * (z < 0) and head (z > 0); the eye sockets are pushed out over it (socketPush).
 */
export const PROFILE: ProfileKnot[] = [
  { z: -25.0, w: 0.0, h: 0.0, c: 0.4 },
  { z: -24.6, w: 3.0, h: 3.0, c: 0.4 },
  { z: -23.4, w: 6.0, h: 5.9, c: 0.35 },
  { z: -21.0, w: 8.6, h: 8.2, c: 0.25 },
  { z: -17.0, w: 10.1, h: 9.6, c: 0.1 },
  { z: -12.5, w: 10.4, h: 9.8, c: 0.0 },
  { z: -7.5, w: 9.7, h: 9.0, c: 0.05 },
  { z: -3.5, w: 8.4, h: 7.6, c: 0.4 },
  { z: -0.8, w: 7.0, h: 6.2, c: 0.8 },
  { z: 0.6, w: 6.0, h: 5.4, c: 1.0 },
  { z: 2.4, w: 5.3, h: 5.1, c: 1.1 },
  { z: 4.4, w: 4.8, h: 4.5, c: 0.8 },
  { z: 6.2, w: 3.9, h: 3.7, c: 0.2 },
  { z: 7.6, w: 3.2, h: 3.0, c: -0.25 },
  { z: 8.4, w: 2.6, h: 2.4, c: -0.45 },
  { z: 8.9, w: 0.0, h: 0.0, c: -0.5 },
];

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

/**
 * The head and the visceral sac it continues into inside the mantle (the neck is narrower than the mantle's opening:
 * the gap between them is the mouth of the mantle cavity, with the funnel in it). From z = 0.6 forward it is the
 * same outline as PROFILE (where the mantle is fused to the head on the back the two surfaces meet).
 */
export const HEAD_PROFILE: ProfileKnot[] = [
  { z: -7.6, w: 0.0, h: 0.0, c: 0.5 },
  { z: -7.0, w: 3.4, h: 3.2, c: 0.5 },
  { z: -5.4, w: 4.7, h: 4.4, c: 0.7 },
  { z: -3.0, w: 5.8, h: 5.3, c: 0.85 },
  { z: -1.0, w: 6.2, h: 5.6, c: 0.95 },
  ...PROFILE.filter((k) => k.z >= 0.6),
];

/** the outline at z: Catmull-Rom through the knots (the ends are rounded caps) */
export function profileAt(z: number, K: ProfileKnot[] = PROFILE): { w: number; h: number; c: number } {
  const zc = Math.min(K[K.length - 1].z, Math.max(K[0].z, z));
  let i = 0;
  while (i < K.length - 2 && K[i + 1].z < zc) i++;
  const a = K[Math.max(0, i - 1)], b = K[i], c = K[i + 1], d = K[Math.min(K.length - 1, i + 2)];
  const t = (zc - b.z) / Math.max(1e-6, c.z - b.z);
  // the caps: a sphere-like end instead of a cone into the last knot
  const nearStart = (zc - K[0].z) < 1.6 && K[0].w === 0, nearEnd = (K[K.length - 1].z - zc) < 0.8 && K[K.length - 1].w === 0;
  const cap = nearStart ? Math.sqrt(Math.max(0, (zc - K[0].z) / 1.6)) : nearEnd ? Math.sqrt(Math.max(0, (K[K.length - 1].z - zc) / 0.8)) : -1;
  let w = Math.max(0, catmull(a.w, b.w, c.w, d.w, t));
  let h = Math.max(0, catmull(a.h, b.h, c.h, d.h, t));
  if (cap >= 0) {
    const k = nearStart ? profileAt(K[0].z + 1.6 + 1e-6, K) : profileAt(K[K.length - 1].z - 0.8 - 1e-6, K);
    w = k.w * cap; h = k.h * cap;
  }
  return { w, h, c: catmull(a.c, b.c, c.c, d.c, t) };
}

/**
 * The mantle's free edge (the collar): on the back the mantle is fused with the head (Euprymna) and its edge runs
 * forward onto the head; on the sides and under the belly it is free, a little behind the neck, and the opening of
 * the mantle cavity lies between it and the head. z of the edge at angle θ from the dorsal line, and the share fused.
 */
export function mantleRim(theta: number): { z: number; fused: number; thick: number } {
  const c = Math.cos(theta);
  const t = Math.min(1, Math.max(0, (c - 0.1) / 0.65));
  const fused = t * t * (3 - 2 * t);
  return { z: -0.9 + 2.0 * fused, fused, thick: 0.02 + 0.7 * (1 - fused) };
}
/** how far back the mantle cavity reaches inside (mm, neck frame) */
export const CAVITY_Z = -6.2;

/** the eyes: centre (mm, the left one; the right mirrors x), radius, and the resting gaze */
export const EYE = {
  z: 2.6,
  x: 4.85,
  y: 1.7,
  r: 3.3,
  /** the socket's skin round the ball (mm beyond its radius), the half angle of the corneal window (rad) */
  socket: 0.3,
  window: 0.8,
  /** outward, a little forward and up */
  gaze: [0.93, 0.2, 0.3] as [number, number, number],
};

/**
 * The eye sockets: near an eye the head's surface is pushed out onto a sphere just round the ball (a smooth maximum,
 * so the bulge grows out of the head without a crease); the skin's window over the cornea is cut in the shader.
 */
export function socketPush(p: [number, number, number]): [number, number, number] {
  const sx = p[0] >= 0 ? 1 : -1;
  const dx = p[0] - EYE.x * sx, dy = p[1] - EYE.y, dz = p[2] - EYE.z;
  const L = Math.hypot(dx, dy, dz) || 1e-6;
  const R = EYE.r + EYE.socket, k = 1.6;
  if (L > R + 3 * k) return p;
  const Ls = (L + R + Math.sqrt((L - R) * (L - R) + k * k)) / 2;
  const s = Ls / L;
  return [EYE.x * sx + dx * s, EYE.y + dy * s, EYE.z + dz * s];
}

/** the section's flattening: the belly is a little flatter than the back */
export const BELLY_FLAT = 0.95;

/** a point of the body surface at z and angle θ from the dorsal midline (θ > 0 the left side) */
export function surfacePoint(z: number, theta: number, K: ProfileKnot[] = PROFILE): [number, number, number] {
  const p = profileAt(z, K);
  const s = Math.sin(theta), c = Math.cos(theta);
  // a superellipse a little fuller than an ellipse
  const e = 2.3;
  const se = Math.sign(s) * Math.pow(Math.abs(s), 2 / e), ce = Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
  let x = p.w * se, y = p.h * ce * (c < 0 ? BELLY_FLAT : 1);
  return z > -2.5 ? socketPush([x, p.c + y, z]) : [x, p.c + y, z];
}

export const ARM_NAMES = ['I', 'II', 'III', 'IV'] as const;

export interface ArmDef {
  name: string;
  /** +1 left, −1 right */
  side: 1 | -1;
  pair: 0 | 1 | 2 | 3;
  /** angle round the crown from the dorsal line (rad, > 0 left) */
  angle: number;
  length: number;
  rBase: number;
  /** how far out from the crown's axis the arm leans (rad) */
  spread: number;
}

/** the arm crown: centre and radii of the ring the arms leave the head on */
export const CROWN = { z: 7.4, y: -0.55, rx: 2.55, ry: 2.15 };

const ARM_PAIRS = [
  { angle: 0.36, length: 11.4, rBase: 1.12, spread: 0.3 },
  { angle: 1.1, length: 14.6, rBase: 1.32, spread: 0.36 },
  { angle: 1.92, length: 16.8, rBase: 1.42, spread: 0.34 },
  { angle: 2.62, length: 13.8, rBase: 1.25, spread: 0.26 },
];

export const ARMS: ArmDef[] = [];
for (const side of [1, -1] as const) {
  ARM_PAIRS.forEach((p, i) => ARMS.push({ name: `${ARM_NAMES[i]}${side > 0 ? 'L' : 'R'}`, side, pair: i as 0 | 1 | 2 | 3, angle: side * p.angle, length: p.length, rBase: p.rBase, spread: p.spread }));
}
export const ARM_BONES = 5;

/** where an arm leaves the crown and the direction it points to at rest (neck frame, mm) */
export function armBase(a: ArmDef): { pos: [number, number, number]; dir: [number, number, number]; out: [number, number, number] } {
  const ox = Math.sin(a.angle), oy = Math.cos(a.angle);
  const pos: [number, number, number] = [CROWN.rx * ox * 0.92, CROWN.y + CROWN.ry * oy * 0.92, CROWN.z - 0.6];
  const s = Math.sin(a.spread), c = Math.cos(a.spread);
  // forward, leaning out from the crown's axis (and the whole crown a little down: the arms hang in front of the face)
  const dir: [number, number, number] = [ox * s, oy * s - 0.12, c];
  const n = Math.hypot(...dir);
  return { pos, dir: [dir[0] / n, dir[1] / n, dir[2] / n], out: [ox, oy, 0] };
}

/** the tentacles: between arms III and IV, thin stalks with a club, at full length (they are kept retracted) */
export const TENTACLE = { angle: 2.3, length: 21, rStalk: 0.36, rClub: 0.68, club0: 0.74, spread: 0.12 };
export const TENTACLE_BONES = 6;

export function tentacleBase(side: 1 | -1): { pos: [number, number, number]; dir: [number, number, number] } {
  const a = side * TENTACLE.angle, ox = Math.sin(a), oy = Math.cos(a);
  const pos: [number, number, number] = [CROWN.rx * ox * 0.55, CROWN.y + CROWN.ry * oy * 0.55, CROWN.z - 0.8];
  const s = Math.sin(TENTACLE.spread), c = Math.cos(TENTACLE.spread);
  const dir: [number, number, number] = [ox * s, oy * s - 0.05, c];
  const n = Math.hypot(...dir);
  return { pos, dir: [dir[0] / n, dir[1] / n, dir[2] / n] };
}

/**
 * The fins: base along the side of the mantle (z from FIN.z0 in front to FIN.z1 behind) at the height of the widest
 * section, the free lobe a rounded ear held out sideways and a little up.
 */
export const FIN = { z0: -8.2, z1: -19.2, span: 8.2, reach: 7.2, lobe: 1.0, tilt: 0.3, y: 1.6 };

/** the outer edge of the fin at u (0 front … 1 back): along the body (z, mm) and out from the base (span, mm) */
export function finEdge(u: number): { z: number; span: number } {
  const zc = (FIN.z0 + FIN.z1) / 2;
  const a = Math.PI * u;
  return {
    z: zc + FIN.lobe + FIN.reach * Math.cos(a),
    span: FIN.span * Math.pow(Math.sin(a), 0.72) * (1 + 0.14 * Math.cos(a)),
  };
}

/** a point of the fin's base line at u (on the mantle's side; left fin) */
export function finBase(u: number): [number, number, number] {
  const z = FIN.z0 + (FIN.z1 - FIN.z0) * u;
  // the base follows the mantle's side at the fin's height
  const p = profileAt(z);
  const yy = Math.min(0.95, (FIN.y - p.c) / Math.max(p.h, 0.1));
  const x = p.w * Math.pow(Math.max(0, 1 - Math.abs(yy) ** 2.3), 1 / 2.3) - 0.35;
  return [x, FIN.y, z];
}

/** the funnel: under the head, from inside the mantle's collar to its opening */
export const FUNNEL = { z0: -1.6, z1: 3.0, y: -3.55, r0: 1.2, r1: 0.62 };

/** neck-frame millimetres → model metres */
export function toModel(p: [number, number, number]): [number, number, number] {
  return [p[0] / 1000, p[1] / 1000, (p[2] - Z_ROOT) / 1000];
}

/** the lowest point of the body under the root at rest (mm, negative): what rests on the sand */
export function bellyDepth(): number {
  let lo = 0;
  for (let z = -22; z <= 6; z += 0.5) lo = Math.min(lo, surfacePoint(z, Math.PI)[1]);
  return lo;
}
