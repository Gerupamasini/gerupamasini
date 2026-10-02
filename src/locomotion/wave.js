// Procedural body wave for the 24-segment spine (docs/yamame/spec/05 §5.2, §5.4). Pure math, no three.js.
// Coordinates (CONTRACT.md): +X forward, +Y up, +Z right; s = 0 snout .. 1 caudal base; lateral displacement is +Z.
// Tailward tangent at s is (-1, 0, y'(s)); its yaw about +Y is psi = atan(y'). Bone j gets the *relative* yaw psi_j - psi_{j-1}.

export const SPINE_COUNT = 24;
export const ENV = { knots_s: [0, 0.10, 0.20, 1.0], knots_rel: [0.20, 0.09, 0.10, 1.0] };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function envelope(s, A_tail, env = ENV) {
  const ks = env.knots_s, kr = env.knots_rel;
  if (s <= ks[0]) return A_tail * kr[0];
  for (let i = 1; i < ks.length; i++) if (s <= ks[i]) { const t = (s - ks[i - 1]) / (ks[i] - ks[i - 1]); return A_tail * (kr[i - 1] + (kr[i] - kr[i - 1]) * t); }
  return A_tail * kr[kr.length - 1];
}
function envelopeSlope(s, A_tail, env = ENV) {
  const ks = env.knots_s, kr = env.knots_rel;
  if (s < ks[0]) return 0;
  for (let i = 1; i < ks.length; i++) if (s <= ks[i]) return A_tail * (kr[i] - kr[i - 1]) / (ks[i] - ks[i - 1]);
  return 0;
}

/**
 * Spine yaw angles (rad) for one instant.
 * phase  : omega*t (rad). A_tail: half-amplitude of the caudal-peduncle wave (SL). lambda: wavelength (SL).
 * turn   : signed curvature kappa (1/SL), left = +. head_gain: scales head yaw (0..1.5).
 * Returns { psi: Float64Array(24) absolute segment yaw, rel: Float64Array(24) per-bone relative yaw, z: Float64Array(24) lateral position (SL), recoil: lateral root offset (SL) }.
 */
export function spineWave({ phase, A_tail, lambda = 0.9, turn = 0, eta = 1, head_gain = 1, env = ENV, bendMax = 0.45 }) {
  const n = SPINE_COUNT, k = 2 * Math.PI / lambda;
  const psi = new Float64Array(n), rel = new Float64Array(n), z = new Float64Array(n);
  let acc = 0;
  for (let j = 0; j < n; j++) {
    const s = (j + 0.5) / n;                      // segment midpoint
    const A = envelope(s, A_tail, env), Ap = envelopeSlope(s, A_tail, env);
    const arg = k * s - phase;
    let yp = Ap * Math.sin(arg) + A * k * Math.cos(arg);       // dy/ds in SL/SL
    if (j < 2) yp *= head_gain;
    let a = Math.atan(yp);
    const g = smooth(0, 0.15, s) * (1 - 0.5 * smooth(0.8, 1.0, s));
    a += -eta * turn * g * (1 / n) * (j + 1);                // integrate the curvature bias along the chain (left turn = tail to -Z)
    psi[j] = a;
  }
  let prev = 0;
  for (let j = 0; j < n; j++) {
    let d = psi[j] - prev; d = Math.max(-bendMax, Math.min(bendMax, d));   // per-joint clamp (spine_bend_max)
    rel[j] = d; prev = psi[j] = prev + d;
  }
  // integrate the centreline (segment length 1/24 SL) to get lateral positions, then remove the mean so the body recoils about its COM
  let zc = 0, zsum = 0; const ds = 1 / n;
  for (let j = 0; j < n; j++) { zc += Math.tan(psi[j]) * ds * Math.cos(psi[j]); z[j] = zc; zsum += zc; }
  const recoil = -zsum / n;
  return { psi, rel, z, recoil };
}

/** Wave frequency / amplitude from speed (5.2.4). U_bl in body lengths per second. */
export function freqFromSpeed(U_bl, { f_idle = 0.6, S_L = 0.70 } = {}) {
  const f = U_bl / S_L;                                    // stride-length relation
  return Math.max(f_idle, f);                              // soft floor handled by caller smoothing
}
export function ampFromSpeed(U_bl) { return 0.10 * (0.55 + 0.45 * smooth(0, 1.0, U_bl)); }

/** First-order lag. */
export const lag = (x, target, dt, tau) => x + (target - x) * (1 - Math.exp(-dt / Math.max(1e-4, tau)));

/** Stateful driver: feed target speed (BL/s) and turn curvature; read phase / amplitude / frequency. */
export class WaveDriver {
  constructor(opts = {}) {
    this.f = 0.6; this.A = 0.055; this.U = 0; this.phase = opts.phase0 ?? 0; this.accel = 0; this.turn = 0;
    this.opts = { tauF: 0.25, tauA: 0.30, tauU: 0.5, fDispMax: 20, lambda: 0.9, ...opts };
  }
  update(dt, { U_target = 1.0, turn = 0, boost = 1, A_override = null, f_override = null, fast = false } = {}) {
    const o = fast ? { ...this.opts, tauU: 0.12, tauF: 0.10, tauA: 0.12 } : this.opts;      // fast: strike / flee onset (acceleration ~10 BL/s^2 or more, 05 §5.3.1)
    const Uprev = this.U; this.U = lag(this.U, U_target, dt, o.tauU); this.accel = (this.U - Uprev) / Math.max(dt, 1e-4);
    const fT = f_override ?? freqFromSpeed(this.U);
    const aT = (A_override ?? ampFromSpeed(this.U)) * boost;
    this.f = lag(this.f, fT, dt, o.tauF); this.A = lag(this.A, aT, dt, o.tauA);
    this.turn = lag(this.turn, turn, dt, fast ? 0.07 : 0.2);
    const fDisp = Math.min(this.f, o.fDispMax);
    this.phase += 2 * Math.PI * fDisp * Math.min(dt, 0.05);
    return this;
  }
}

/**
 * C-start escape body shape (spec 5.3.3; all PROXY rainbow trout, bend angle [E]).
 * t: seconds since onset, T12: stage1+2 duration (s), side: +1 = bend to the left (tail goes -Z), bendDeg: head-tail angle at end of stage 1.
 * Returns per-bone relative yaw (rad, same convention as spineWave.rel) and the net head yaw (rad) so a caller can reorient the body.
 */
export function cStartShape(t, { T12 = 0.088, side = 1, bendDeg = 100, type = 'C', counter = 0.55, settle = 0.15 } = {}) {
  const n = SPINE_COUNT, T1 = 0.45 * T12;
  let amp;                                                      // fraction of bendDeg (signed, + = bend to `side`)
  if (t <= 0) amp = 0;
  else if (t < T1) amp = Math.sin((t / T1) * Math.PI / 2);                                            // stage 1: bend into the C
  else if (t < T12) { const u = (t - T1) / (T12 - T1); amp = 1 - (1 + (type === 'S' ? 0.2 : counter)) * (0.5 - 0.5 * Math.cos(Math.PI * u)); }   // stage 2: flip through straight to the counter-bend
  else { const u = Math.min(1, (t - T12) / settle); amp = -counter * (1 - (0.5 - 0.5 * Math.cos(Math.PI * u))); }                                  // stage 3: relax to straight
  const total = amp * bendDeg * Math.PI / 180 * -side;          // negative angle = tail toward -Z (left)
  // curvature weights: stiff head (first 15 %), bending mostly in the trunk, softer at the peduncle
  const w = new Float64Array(n); let sw = 0;
  for (let j = 0; j < n; j++) { const s = (j + 0.5) / n; w[j] = smooth(0.08, 0.30, s) * (1 - 0.35 * smooth(0.85, 1.0, s)); sw += w[j]; }
  const rel = new Float64Array(n); for (let j = 0; j < n; j++) rel[j] = total * w[j] / sw;
  return { rel, total, active: t < T12 + settle };
}
