/**
 * The surf's physics as plain numbers, shared by the zone bake (SurfZone), the tests and the debug panel; the
 * shaders run the same formulas (Surf.ts). Sources (see docs/world/surf/README.md):
 *  - linear dispersion ω² = g k tanh(k D), solved with Eckart's (1952) explicit approximation
 *  - shoaling by Green's law, H ∝ D^-1/4, between the map's outer edge and the break
 *  - breaker index γ = Hb/Db after Weggel (1972): γ = b(m) − a(m) Hb/(g T²), a = 43.8 (1 − e^(−19 m)),
 *    b = 1.56 / (1 + e^(−19.5 m)), m the bed slope
 *  - breaker type from the surf similarity (Iribarren) number at the break, ξb = m / √(Hb/L0) (Battjes 1974):
 *    spilling < 0.4 < plunging < 2.0 < collapsing / surging
 *  - run-up after Stockdon et al. (2006): R2 = 1.1 (0.35 βf √(H0 L0) + ½ √(H0 L0 (0.563 βf² + 0.004))), and the
 *    dissipative form 0.043 √(H0 L0) for ξ0 < 0.3
 *  - swash after Shen & Meyer (1963): a ballistic front, the lens behind it h = (xs − x)² / (9 g t²), the velocity
 *    u = us + (2/3)(x − xs)/t; the backwash slowed by friction (it lasts about 1.35 times the uprush)
 *  - the wave shape over the shoaling bed from the Ursell number, Ur = (3/8) H k / (k D)³, with Ruessink et al.
 *    (2012): B = 0.857 / (1 + e^((−0.471 − log10 Ur) / 0.297)), ψ = −π/2 + π/2 tanh(0.815 / Ur^0.672), drawn with
 *    Abreu et al.'s (2010) waveform (r, φ = −π/2 − ψ)
 */
export const G = 9.81;

/** wavenumber (rad/m) of a wave of period T (s) in water of depth D (m): Eckart's approximation (within ~5 %) */
export function waveNumber(T: number, D: number): number {
  const w2g = (2 * Math.PI / T) ** 2 / G;
  return w2g / Math.sqrt(Math.tanh(w2g * Math.max(D, 1e-4)));
}

/** phase speed (m/s) of a wave of period T in depth D (√(g D) in the shallows, g T / 2π in deep water) */
export function phaseSpeed(T: number, D: number): number {
  return (2 * Math.PI / T) / waveNumber(T, D);
}

/** deep-water wavelength (m) */
export const deepLength = (T: number): number => (G * T * T) / (2 * Math.PI);

/** Weggel's breaker index Hb / Db for a wave of height H (m) and period T on a bed of slope m (rise per metre) */
export function breakerIndex(m: number, H: number, T: number): number {
  const s = Math.max(0.005, Math.min(0.2, m));
  const a = 43.8 * (1 - Math.exp(-19 * s)), b = 1.56 / (1 + Math.exp(-19.5 * s));
  return Math.max(0.6, Math.min(1.35, b - (a * H) / (G * T * T)));
}

/** surf similarity (Iribarren) number at the break */
export function iribarren(m: number, Hb: number, T: number): number {
  return m / Math.sqrt(Math.max(Hb, 1e-3) / deepLength(T));
}

export type BreakerType = 'spilling' | 'plunging' | 'collapsing';
export function breakerType(xi: number): BreakerType {
  return xi < 0.4 ? 'spilling' : xi < 2 ? 'plunging' : 'collapsing';
}

/** depth (m) at which a wave of height H0 at depth D0 breaks on a slope m: H0 (D0/Db)^¼ = γ Db, solved by iteration */
export function breakingDepth(H0: number, D0: number, m: number, T: number): number {
  let Db = H0 / 0.9;
  for (let i = 0; i < 8; i++) {
    const Hb = H0 * Math.pow(D0 / Math.max(Db, 1e-3), 0.25);
    Db = Hb / breakerIndex(m, Hb, T);
  }
  return Db;
}

/** Stockdon et al.'s 2 % run-up (m above the still level) for offshore height H0, period T and foreshore slope βf */
export function runup2(H0: number, T: number, beta: number): number {
  const HL = H0 * deepLength(T);
  const xi0 = beta / Math.sqrt(H0 / deepLength(T));
  if (xi0 < 0.3) return 0.043 * Math.sqrt(HL);
  return 1.1 * (0.35 * beta * Math.sqrt(HL) + 0.5 * Math.sqrt(HL * (0.563 * beta * beta + 0.004)));
}

/** one swash event on a plane slope β: the front's reach up the beach (m, horizontal) and its timing (s) */
export interface Swash { reach: number; u0: number; tUp: number; tDown: number }
export function swashEvent(R: number, beta: number): Swash {
  const b = Math.max(0.01, beta);
  const reach = R / b;
  const u0 = Math.sqrt(2 * G * R);
  const tUp = u0 / (G * b);
  // the backwash, slowed by friction and infiltration, takes about 1.35 times as long
  return { reach, u0, tUp, tDown: tUp * 1.35 };
}

/** the front's horizontal position (m from the still waterline) at time t (s) since the bore reached it */
export function swashFront(s: Swash, t: number): number {
  if (t <= s.tUp) return s.u0 * t - 0.5 * (s.u0 / s.tUp) * t * t;
  const tb = Math.min(t - s.tUp, s.tDown * 1.25);
  return s.reach * (1 - (tb / s.tDown) ** 2);
}

/** Ruessink et al.'s nonlinearity (B, ψ) from the Ursell number, and the Abreu waveform's (r, φ) */
export function waveShape(H: number, T: number, D: number): { ur: number; B: number; psi: number; r: number; phi: number } {
  const k = waveNumber(T, D);
  const ur = (3 / 8) * H * k / Math.pow(k * Math.max(D, 0.02), 3);
  const B = 0.857 / (1 + Math.exp((-0.471 - Math.log10(Math.max(ur, 1e-6))) / 0.297));
  const psi = -Math.PI / 2 + (Math.PI / 2) * Math.tanh(0.815 / Math.pow(Math.max(ur, 1e-6), 0.672));
  // B = 3b / √(2 (1 − b²)) with b = r / (1 + √(1 − r²)) (checked numerically against the waveform)
  const b = (B * Math.SQRT2) / Math.sqrt(9 + 2 * B * B);
  return { ur, B, psi, r: (2 * b) / (1 + b * b), phi: -Math.PI / 2 - psi };
}

/** the Abreu waveform at phase θ, per unit crest-to-trough height (zero mean) */
export function abreu(theta: number, r: number, phi: number): number {
  const s = Math.sqrt(1 - r * r), c = (r * Math.sin(phi)) / (1 + s);
  const f = (Math.sin(theta) + c) / (1 - r * Math.cos(theta + phi));
  // its range does not depend on φ: that of the purely skewed form
  const c0 = -r / (1 + s);
  return f / ((1 + c0) / (1 - r) + (1 - c0) / (1 + r));
}

/** where a point of the shore lies for the waves of the day */
export type SurfZoneKind = 'land' | 'swash' | 'breaker' | 'shallow' | 'deep';

/**
 * Classify a point by its still-water depth D (negative up the beach), for a sea of significant height Hs (at the
 * map's outer depth D0) and period T on a local slope m: dry land above the run-up, the swash between the run-up
 * and the bores' collapse, the breaker zone from the outermost break of the bigger waves inward, the shoaling
 * shallows (depth under half a wavelength) and the deep water beyond.
 */
export function classifyDepth(D: number, Hs: number, T: number, D0: number, m: number, beta = m): SurfZoneKind {
  const R = runup2(Hs, T, Math.max(beta, 0.01));
  if (D < -R) return 'land';
  // (the biggest of the common waves, ~1.4 Hs, breaks furthest out)
  const DbMax = breakingDepth(1.4 * Hs, D0, Math.max(m, 0.01), T);
  if (D < 0.25 * DbMax) return 'swash';
  if (D < 1.15 * DbMax) return 'breaker';
  return D < deepLength(T) / 2 ? 'shallow' : 'deep';
}

/** a day's sea from the shore's usual one: deterministic in the seed (the day number), never wild */
export interface SeaState { height: number; period: number; angle: number; spread: number }
export function seaStateFor(base: { height: number; period: number; angle?: number; spread?: number }, seed: number): SeaState {
  let s = (seed ^ 0x5eaf00d) >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // heights spread about log-normally (most days near the usual, a few calm or lively ones), the period with them
  const z = (rnd() + rnd() + rnd() - 1.5) * 2;   // ~N(0, 1), bounded to ±3
  const hf = Math.exp(0.28 * z);
  return {
    height: base.height * hf,
    period: base.period * Math.pow(hf, 0.35) * (0.94 + 0.12 * rnd()),
    angle: (base.angle ?? 0) + (rnd() - 0.5) * 0.25,
    spread: base.spread ?? 0.18,
  };
}
