// Three.js-free locomotion core: body wave + world kinematics + escape + strike timing. Shared by the Yamame renderer wrapper and the Node tests.
import { SPINE_COUNT, spineWave, WaveDriver, cStartShape } from './wave.js';
import { strikePose } from '../yamame/modes.js';

export class Locomotion {
  constructor({ SL = 0.19, phase0 = 0, variation = {} } = {}) {
    this.SL = SL; this.wave = new WaveDriver({ phase0 });
    this.var = { A_scale: 1, lambda: 0.9, head_gain: 1, ...variation };
    this.pos = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
    this.heading = 0; this.pitch = 0; this.speed = 0; this.esc = null; this.strike = null; this.strikePose = null; this.time = 0;
  }
  triggerStrike(T = 0.12) { this.strike = { t: 0, T }; }
  /** C-start escape (05 §5.3.3). side: +1 = bend left. */
  triggerEscape(side = 1, opts = {}) { this.esc = { t: 0, side, T12: opts.T12 ?? 0.088, type: (opts.rng ? opts.rng() : Math.random()) < 0.7 ? 'C' : 'S', vPeak: opts.vPeak ?? 1.4 }; }

  /**
   * intent: { U_bl, turn, heading_target, rate_max, R_floor, boost, A_override, f_override, flow_bl (legacy), flowVec:[vx,vz] m/s }
   * Returns { res (spine wave result), w (wave driver) }.
   */
  update(dt, intent = {}) {
    dt = Math.min(dt, 1 / 20); this.time += dt;
    if (intent.mode && typeof intent.mode === 'object') intent = { ...intent.mode, ...intent };
    // heading steering: kappa = yawRate / U (05 §5.4.1), |kappa| <= 1/R_min, R_min = max(R_floor, U^2/25) SL (05 §5.4.2)
    let turnCmd = intent.turn ?? 0;
    if (intent.heading_target != null) {
      const err = Math.atan2(Math.sin(intent.heading_target - this.heading), Math.cos(intent.heading_target - this.heading));
      const Ub = Math.max(this.wave.U, 0.6), kmax = 1 / Math.max(intent.R_floor ?? 1.0, Ub * Ub / 25), rmax = intent.rate_max ?? 1.0;
      turnCmd = Math.max(-kmax, Math.min(kmax, Math.max(-rmax, Math.min(rmax, err * 3)) / Ub));
    }
    const w = this.wave.update(dt, { U_target: intent.U_bl ?? 1.0, turn: turnCmd, boost: intent.boost ?? 1, A_override: intent.A_override ?? null, f_override: intent.f_override ?? null, fast: !!intent.fast });
    let res = spineWave({ phase: w.phase, A_tail: w.A * this.var.A_scale, lambda: this.var.lambda, turn: w.turn, head_gain: this.var.head_gain });
    const flowVec = intent.flowVec || null;
    let U_ms = (w.U - (flowVec ? 0 : (intent.flow_bl ?? 0))) * this.SL, yawRate = w.U * w.turn;          // m/s (relative to water unless legacy flow_bl); rad/s = U[BL/s] * kappa[1/SL]
    if (this.esc) {
      const e = this.esc; e.t += dt;
      const sh = cStartShape(e.t, { T12: e.T12, side: e.side, type: e.type });
      const mix = e.t < e.T12 ? 0 : Math.min(1, (e.t - e.T12) / 0.15);                  // blend the swimming wave back in during stage 3
      const rel = new Float64Array(SPINE_COUNT); for (let j = 0; j < SPINE_COUNT; j++) rel[j] = sh.rel[j] * (1 - mix) + res.rel[j] * mix;
      res = { ...res, rel, recoil: res.recoil * mix };
      const T = e.T12, a = e.t < T ? 4 * (e.vPeak / T) * Math.sin(Math.PI * e.t / T) ** 2 / 2 : 0;       // sin^2 acceleration profile, integrates to ~vPeak
      this.speed = e.t < T ? Math.min(e.vPeak, this.speed + a * dt) : Math.max(w.U * this.SL, this.speed - 1.0 * dt);
      U_ms = this.speed;
      yawRate = e.t < 0.45 * e.T12 ? e.side * 0.87 / (0.45 * e.T12) : (e.t < e.T12 ? -e.side * 0.25 / (0.55 * e.T12) : 0);   // head turns ~50 deg toward the bend in stage 1, partly back in stage 2 [E]
      if (!sh.active) this.esc = null;
    } else this.speed = U_ms;
    this.strikePose = this.strike ? (this.strike.t += dt, strikePose(this.strike.t / this.strike.T)) : null;
    if (this.strike && this.strike.t > this.strike.T) this.strike = null;
    this.heading += yawRate * dt;
    this.pos.x += (Math.cos(this.heading) * U_ms + (flowVec ? flowVec[0] : 0)) * dt;
    this.pos.z += (-Math.sin(this.heading) * U_ms + (flowVec ? flowVec[1] : 0)) * dt;
    return { res, w };
  }
}
