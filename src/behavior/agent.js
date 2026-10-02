// Behaviour agent: L1 perception -> L2 needs -> L3 decision (interrupts, utility with momentum) -> L4 steering -> L5 (body intent). docs/yamame/spec/04.
// The body (Yamame wrapper or a test double) owns the integration of position / heading; the agent writes `intent` and the vertical position.
import { CFG, prov, capProb } from './config.js';
import { mulberry32 } from './rng.js';
import { Trace } from './trace.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const FIN = {
  hold:  { pecAbd: 0.07, pelAbd: 0.12, dorsalErect: 1.0, analErect: 0.8, caudalSpread: 0.5 },
  alert: { pecAbd: 0.07, pelAbd: 0.0, dorsalErect: 0.6, analErect: 0.5, caudalSpread: 0.5 },
  hide:  { pecAbd: 0.07, pelAbd: 0.0, dorsalErect: 0.3, analErect: 0.5, caudalSpread: 0.3 },
  strike: { pecAbd: 0.02, pelAbd: 0.0, dorsalErect: 0.9, analErect: 0.8, caudalSpread: 0.95 },
  brake: { pecAbd: 0.9, pelAbd: 0.5, dorsalErect: 1.0, analErect: 0.8, caudalSpread: 0.7 },
  flee:  { pecAbd: 0.02, pelAbd: 0.0, dorsalErect: 1.0, analErect: 1.0, caudalSpread: 1.0 },
};

export class YamameAgent {
  constructor({ body, world, cfg = CFG, seed = 1, SL = 0.19, focal = { x: 0, z: 0 }, id = 'yamame-1' } = {}) {
    Object.assign(this, { body, world, cfg, SL, id }); this.rng = mulberry32(seed * 7919 + 13);
    this.focal = { x: focal.x, z: focal.z }; this.trace = new Trace(id);
    this.needs = { F: 0, H: 0.35, T: 0, R: 0 };
    this.state = 'StationHolding'; this.stateT = 0; this.prevState = null; this.momentum = { prev: null, bonus: 0 };
    this.percept = { prey: [], threats: [], t: -1 }; this.perceptT = 0; this.decideT = 0;
    this.target = null; this.noise = 0; this.noiseTarget = 0; this.noiseT = 0;
    this.sub = null; this.lastDist = new Map(); this.fleeSide = 1; this.hideStart = 0; this.cover = null;
    this.sim = 0; this.stats = { eaten: 0, strikes: 0, rejected: 0, missed: 0, flees: 0 };
    body.pos.set(this.focal.x, this.heightFor('hold'), this.focal.z); body.heading = 0;
    this.enter('StationHolding', { trigger: 'timer', dist_m: 0, thresholdName: 'init', thresholdValue: 0 }, false, []);
  }

  heightFor(kind) {
    const BD = 0.043, half = 0.0211, base = this.world.bedY + half;
    const h = { hold: this.cfg.height_above_bed_BD.v, alert: 0.25, hide: 0.1 }[kind] ?? this.cfg.height_above_bed_BD.v;
    return base + h * BD;
  }
  get px() { return this.body.pos.x; } get pz() { return this.body.pos.z; }
  uLocal(x = this.px, z = this.pz, y = this.body.pos.y) { const f = this.world.flowAt(x, z, y); return Math.hypot(f[0], f[1]); }

  // ---------------------------------------------------------------- L1 perception (15 Hz)
  perceive(dt) {
    const c = this.cfg, SL = this.SL, B = this.body, vis = c.visibility_m.v;
    const prey = [], threats = [];
    for (const p of this.world.prey) {
      const dx = p.x - this.px, dz = p.z - this.pz, dy = p.y - B.pos.y, d = Math.hypot(dx, dy, dz);
      if (d > vis) continue;
      const bearing = wrap(Math.atan2(-dz, dx) - B.heading);
      if (Math.abs(bearing) > Math.PI - (c.rear_blind_deg.v * Math.PI / 360)) continue;           // rear blind sector
      const size = p.size_BL, value = Math.exp(-(((size - 0.025) / 0.02) ** 2));                  // peaked at 0.025 BL (04 §4.6.4)
      prey.push({ id: p.id, ref: p, d, bearing, dx, dz, dy, value });
    }
    for (const th of this.world.threats) {
      const dx = th.pos[0] - this.px, dz = th.pos[2] - this.pz, dy = th.pos[1] - B.pos.y, d = Math.hypot(dx, dy, dz);
      const prev = this.lastDist.get(th.id); const vr = prev != null ? (prev - d) / Math.max(dt, 1e-3) : 0;    // closing speed
      this.lastDist.set(th.id, d);
      const bearing = wrap(Math.atan2(-dz, dx) - B.heading);
      const rear = Math.abs(bearing) > Math.PI * 0.75 ? c.rear_detect_factor.v : 1;
      threats.push({ id: th.id, d, bearing, vr: Math.max(0, vr), size: th.size ?? 1, shadow: !!th.shadow, effD: d / rear });
    }
    this.percept = { prey, threats, t: this.sim };
  }

  // ---------------------------------------------------------------- L2 needs (5 Hz)
  updateNeeds(dt) {
    const c = this.cfg, n = this.needs, SL = this.SL;
    n.H = clamp(n.H + dt / c.tau_H_s.v, 0, 1);
    let theta = 0;
    for (const th of this.percept.threats) {
      const alertD = c.alert_dist_BL.v * SL, fleeD = c.flee_dist_BL.v * SL * (1 + c.approach_speed_gain.v * th.vr);
      const fd = clamp((alertD - th.effD) / alertD, 0, 1), fs = clamp(0.4 + 0.3 * th.vr, 0, 1), fz = clamp(th.size, 0.2, 1), fsh = th.shadow ? 1 : 0.8;
      theta = Math.max(theta, fd * (0.5 + 0.5 * fs) * fz * fsh * (th.effD < fleeD ? 1.6 : 1));
    }
    n.F = Math.max(n.F * Math.exp(-dt / c.tau_F_s.v), clamp(theta, 0, 1));
    n.R = clamp((12 - this.world.temp_C) / 4, 0, 1) * (1 - this.world.daylight);
  }

  // ---------------------------------------------------------------- L3 decision (10 Hz)
  nearestThreat() { let b = null; for (const t of this.percept.threats) if (!b || t.effD < b.effD) b = t; return b; }
  coverDist() { const r = this.world.rock; return r ? Math.max(0, Math.hypot(this.px - r.x, this.pz - r.z) - r.r) : Infinity; }

  decide(dt) {
    const c = this.cfg, SL = this.SL, n = this.needs, S = this.state, th = this.nearestThreat();
    const fleeD = th ? c.flee_dist_BL.v * SL * (1 + c.approach_speed_gain.v * th.vr) : 0;
    const dwell = this.stateT;
    // --- interrupts: CStartFlee > Hide > Alert (04 §4.3.2)
    if (th && th.effD < fleeD && S !== 'CStartFlee' && S !== 'Hide' && S !== 'FleeBurst') {
      this.fleeSide = th.bearing > 0 ? -1 : 1;                 // bend (and turn) away from the threat side
      this.stats.flees++;
      return this.enter('CStartFlee', { trigger: 'threat', targetId: th.id, dist_m: th.effD, thresholdName: 'flee_dist_BL', thresholdValue: fleeD }, true, [], ['flee_dist_BL', 'approach_speed_gain']);
    }
    if (S === 'CStartFlee') { if (!this.body.esc && dwell > 0.05) this.enter('FleeBurst', { trigger: 'timer', dist_m: 0, thresholdName: 'escape_stage12_done', thresholdValue: 0.088 }, false, []); return; }
    if (S === 'FleeBurst') { if (this.coverDist() < 0.5 * SL) this.enter('Hide', { trigger: 'threat', dist_m: this.coverDist(), thresholdName: 'cover_reached', thresholdValue: 0.5 * SL }, false, [], ['hide_dwell_s']); else if (dwell > 4) this.enter('Hide', { trigger: 'timer', dist_m: this.coverDist(), thresholdName: 'flee_timeout', thresholdValue: 4 }, false, []); return; }
    if (S === 'Hide') {
      const threatNear = th && th.effD < c.alert_dist_BL.v * SL;
      if (dwell > c.hide_dwell_s.v && n.F < c.F_resume.v && !threatNear) this.enter('ReturnToStation', { trigger: 'timer', dist_m: 0, thresholdName: 'hide_dwell_s', thresholdValue: c.hide_dwell_s.v }, false, [], ['hide_dwell_s', 'F_resume']);
      return;
    }
    const alertOn = n.F > c.F_alert.v || (th && th.effD < c.alert_dist_BL.v * SL * 0.5);
    if (S === 'Alert') { if (n.F < c.F_alert.v - 0.15 && !(th && th.effD < c.alert_dist_BL.v * SL * 0.5)) this.enter('StationHolding', { trigger: 'timer', dist_m: th ? th.effD : 0, thresholdName: 'F_alert-0.15', thresholdValue: c.F_alert.v - 0.15 }, false, [], ['F_alert']); return; }
    if (alertOn && S !== 'StrikeAttack') return this.enter('Alert', { trigger: 'threat', targetId: th?.id, dist_m: th ? th.effD : 0, thresholdName: 'F_alert', thresholdValue: c.F_alert.v }, true, [], ['F_alert', 'alert_dist_BL']);
    // --- timed states
    if (S === 'StrikeAttack') return this.stepStrike();
    if (S === 'RejectSpit') { if (dwell > 0.4) this.enter('ReturnToStation', { trigger: 'timer', dist_m: 0, thresholdName: 'spit_done', thresholdValue: 0.4 }, false, []); return; }
    if (S === 'ReturnToStation') { if (Math.hypot(this.px - this.focal.x, this.pz - this.focal.z) < c.arrive_radius_BL.v * SL) this.enter('StationHolding', { trigger: 'timer', dist_m: 0, thresholdName: 'arrive_radius_BL', thresholdValue: c.arrive_radius_BL.v }, false, [], ['arrive_radius_BL']); return; }
    // --- Station / DriftWatch: utility over {Strike, Hold}
    const react = c.reaction_dist_BL.v * SL; let best = null;
    for (const p of this.percept.prey) {
      if (p.d > react || Math.abs(p.bearing) > 100 * Math.PI / 180) continue;          // prey behind the beam would need a turn larger than the strike window allows (intercept cost) [E]
      const tInt = p.d / Math.max(0.2, c.v_strike_BL.v * SL), px = p.ref.x + this.world.flowAt(p.ref.x, p.ref.z, p.ref.y)[0] * tInt;
      if (Math.hypot(px - this.focal.x, p.ref.z - this.focal.z) > c.strike_dist_max_m.v) continue;          // would have to leave the station too far
      const cap = capProb(this.uLocal(p.ref.x, p.ref.z, p.ref.y), c), terms = { reaction: 1 - p.d / react + 0.15, hunger: 0.35 + 0.65 * n.H, benefit: cap * p.value, calm: 1 - n.F };
      const Sv = c.w_strike.v * terms.reaction * terms.hunger * terms.benefit * 2.2 * terms.calm;
      if (!best || Sv > best.S) best = { p, S: Sv, terms };
    }
    const hold = { state: 'Hold', S: c.w_hold.v * 1.0 }, strike = best ? { state: 'StrikeAttack', S: best.S, terms: best.terms } : null;
    let chosen = 'Hold'; const cur = S === 'DriftWatch' || S === 'StationHolding' ? 'Hold' : S;
    const cands = [{ state: 'Hold', S: hold.S * (cur === 'Hold' ? 1 + c.momentum_bonus.v : 1), momentumApplied: cur === 'Hold' }];
    if (strike) cands.push({ state: 'StrikeAttack', S: strike.S, momentumApplied: false, terms: strike.terms });
    if (strike && strike.S > cands[0].S * (1 + c.switch_margin.v) && dwell > c.min_dwell_s.v * 0.3) chosen = 'StrikeAttack';
    if (chosen === 'StrikeAttack') {
      this.target = best.p.ref; this.stats.strikes++;
      return this.enter('StrikeAttack', { trigger: 'prey', targetId: best.p.id, dist_m: best.p.d, thresholdName: 'reaction_dist_BL', thresholdValue: react }, false, cands, ['reaction_dist_BL', 'w_strike', 'w_hold', 'momentum_bonus', 'switch_margin', 'strike_dist_max_m', 'cap_p_max']);
    }
    // DriftWatch: something edible within 3 reaction distances ahead
    const watching = this.percept.prey.some((p) => p.d < 3 * react && Math.abs(p.bearing) < Math.PI / 2);
    const want = watching ? 'DriftWatch' : 'StationHolding';
    if (want !== S && S !== 'RejectSpit' && dwell > c.min_dwell_s.v) this.enter(want, { trigger: 'prey', dist_m: 0, thresholdName: '3x reaction_dist_BL', thresholdValue: 3 * react }, false, cands);
  }

  stepStrike() {
    const c = this.cfg, SL = this.SL, p = this.target, B = this.body;
    if (!p || !p.alive) return this.enter('ReturnToStation', { trigger: 'prey', dist_m: 0, thresholdName: 'target_lost', thresholdValue: 0 }, false, []);
    const d = Math.hypot(p.x - this.px, p.z - this.pz, p.y - B.pos.y);
    const off = Math.hypot(this.px - this.focal.x, this.pz - this.focal.z);
    if (off > c.strike_dist_max_m.v + 0.12) { this.stats.missed++; return this.enter('ReturnToStation', { trigger: 'prey', targetId: p.id, dist_m: off, thresholdName: 'strike_dist_max_m', thresholdValue: c.strike_dist_max_m.v }, false, [], ['strike_dist_max_m']); }
    if (d < 0.35 * SL && !this.biting) {
      this.biting = true; B.triggerStrike?.(0.12);
      const u = this.uLocal(p.x, p.z, p.y), pc = capProb(u, c), roll = this.rng();
      const ok = roll < pc; p.alive = false; this.target = null;
      this.pending = { ok, reject: ok && this.rng() < c.p_reject.v, roll, pc };
    }
    if (this.biting && this.stateT - this.biteT0 > 0.2) {
      const r = this.pending; this.biting = false;
      if (!r.ok) { this.stats.missed++; return this.enter('ReturnToStation', { trigger: 'prey', dist_m: 0, thresholdName: 'cap_prob', thresholdValue: r.pc, p_roll: r.roll }, false, [], ['cap_u_lo_ms', 'cap_u_hi_ms', 'cap_p_max', 'cap_p_min']); }
      if (r.reject) { this.stats.rejected++; return this.enter('RejectSpit', { trigger: 'prey', dist_m: 0, thresholdName: 'p_reject', thresholdValue: c.p_reject.v, p_roll: r.roll }, false, [], ['p_reject']); }
      this.stats.eaten++; this.needs.H = clamp(this.needs.H - 0.15, 0, 1);
      return this.enter('ReturnToStation', { trigger: 'prey', dist_m: 0, thresholdName: 'cap_prob', thresholdValue: r.pc, p_roll: r.roll }, false, [], ['cap_p_max']);
    }
    if (this.biting && this.biteT0 == null) this.biteT0 = this.stateT;
  }

  enter(to, why, interrupt, cands, names = []) {
    const from = this.state; const dwell = this.stateT;
    this.state = to; this.stateT = 0; this.biting = false; this.biteT0 = null;
    if (to === 'CStartFlee') { this.body.triggerEscape?.(this.fleeSide); }
    if (to === 'StrikeAttack') { this.biteT0 = null; }
    if (to === 'Hide' && this.world.rock) { const r = this.world.rock; this.cover = { x: r.x - r.r - 0.1, z: r.z }; }
    const u = this.uLocal();
    this.trace.add({
      t: this.sim, layer: 'L3', event: `${from}->${to}`, state: { from, to, interrupt, dwell_s: dwell }, candidates: cands || [], needs: { ...this.needs },
      why_here: { focalId: 'F0', u_cms: u * 100, depth_m: 0.4, heightBD: (this.body.pos.y - this.world.bedY - 0.0211) / 0.043, coverDist_m: this.coverDist(), scoreTerms: {}, rejectedAlt: [] },
      why_heading: { source: to === 'Alert' || to === 'CStartFlee' ? 'threat' : to === 'StrikeAttack' ? 'prey' : to === 'Hide' || to === 'FleeBurst' ? 'cover' : 'rheotaxis', flowDir: [-1, 0, 0], headingErr_deg: Math.abs(wrap(this.body.heading)) * 57.3 },
      why_now: why, paramsUsed: prov(names), env: { temp_C: this.world.temp_C, light_lx: 10000 * this.world.daylight, visibility_m: this.cfg.visibility_m.v, u_local: u },
    });
  }

  // ---------------------------------------------------------------- L4 steering -> intent for the body
  steer(dt) {
    const c = this.cfg, SL = this.SL, B = this.body, S = this.state;
    // slow heading noise (rheotaxis jitter)
    this.noiseT -= dt; if (this.noiseT <= 0) { this.noiseT = 1 + this.rng() * 2; this.noiseTarget = (this.rng() * 2 - 1) * c.heading_noise_deg.v * Math.PI / 180; }
    this.noise += (this.noiseTarget - this.noise) * (1 - Math.exp(-dt / 0.8));
    const flow = this.world.flowAt(this.px, this.pz, B.pos.y);
    let goal = this.focal, gSpeed = 0, kind = 'hold', fins = FIN.hold, mode = 'hold', headingOverride = null, jaw = 0, opercle = 0, vTargetY = this.heightFor('hold');
    switch (S) {
      case 'StationHolding': case 'DriftWatch': break;
      case 'StrikeAttack': {
        const p = this.target; mode = 'strike'; fins = FIN.strike; kind = 'strike';
        if (p) { const tInt = Math.hypot(p.x - this.px, p.z - this.pz) / (c.v_strike_BL.v * SL); const f2 = this.world.flowAt(p.x, p.z, p.y); goal = { x: p.x + f2[0] * tInt, z: p.z + f2[1] * tInt }; vTargetY = p.y; }
        gSpeed = 99; break;                                                                     // swim at v_strike relative to water toward the intercept point
      }
      case 'RejectSpit': fins = FIN.brake; jaw = 18; opercle = 20; goal = { x: this.px, z: this.pz }; break;
      case 'ReturnToStation': gSpeed = c.v_return_BL.v * SL; break;
      case 'Alert': { fins = FIN.alert; vTargetY = this.heightFor('alert'); const th = this.nearestThreat(); if (th) headingOverride = clamp(wrap(B.heading + th.bearing), -0.7, 0.7); break; }
      case 'CStartFlee': mode = 'escape'; fins = FIN.flee; break;
      case 'FleeBurst': { mode = 'flee'; fins = FIN.flee; const r = this.world.rock; goal = { x: r.x - r.r - 0.1, z: r.z }; gSpeed = c.v_flee_BL.v * SL; break; }
      case 'Hide': { fins = FIN.hide; vTargetY = this.heightFor('hide'); goal = this.cover || this.focal; break; }
    }
    // desired ground velocity toward the goal, then the water-relative swim vector w = v_ground - flow
    const ex = goal.x - this.px, ez = goal.z - this.pz, dist = Math.hypot(ex, ez);
    let vgx = 0, vgz = 0;
    if (mode === 'strike' || mode === 'flee') { vgx = 0; vgz = 0; }
    else if (S === 'ReturnToStation') { const s = Math.min(gSpeed, dist * 3); if (dist > 1e-4) { vgx = ex / dist * s; vgz = ez / dist * s; } }
    else { const k = 2.0, s = Math.min(0.5, dist * k); if (dist > 1e-4) { vgx = ex / dist * s; vgz = ez / dist * s; } }
    // water-relative swim vector; a trout cannot swim backwards, so a demand to move downstream faster than the current is met by minimal thrust
    // while still facing upstream (rheotaxis): wx is floored at a small positive value and the heading excursion is limited to +-70 deg
    let wx = Math.max(vgx - flow[0], 0.05), wz = vgz - flow[1];
    let heading = clamp(Math.atan2(-wz, wx), -1.2, 1.2), Urel = Math.hypot(wx, wz);
    let rFloor = mode === 'flee' ? 0.5 : 1.0, rateMax = c.heading_rate_hold.v * Math.PI / 180;
    if (mode === 'hold') {
      // after a strike the fish is facing the wrong way: slow down, turn sharply (SharpTurn: R_floor 0.6 SL, 05 §5.3.1), then re-accelerate once aligned
      const errH = Math.abs(wrap(heading - B.heading)), al = 1 - clamp((errH - 25 * Math.PI / 180) / (60 * Math.PI / 180), 0, 1);
      if (errH > 25 * Math.PI / 180) { rFloor = 0.6; rateMax = 170 * Math.PI / 180; }
      Urel = Math.max(0.8 * SL, Urel * (0.3 + 0.7 * al));
    }
    if (mode === 'strike' || mode === 'flee') {
      heading = Math.atan2(-ez, ex); const vmax = (mode === 'strike' ? c.v_strike_BL.v : c.v_flee_BL.v);
      // orient first, then lunge (slow down and align before accelerating: 05 §5.3.1 SharpTurn, r13 F-09): speed ramps with alignment error
      const err = Math.abs(wrap(heading - B.heading)), align = 1 - Math.min(1, Math.max(0, (err - 15 * Math.PI / 180) / (50 * Math.PI / 180)));
      Urel = (1.5 + (vmax - 1.5) * align * align) * SL; rFloor = 0.35;
      if (mode === 'flee') Urel = Math.min(Urel, (1.5 + 1.6 * dist / SL) * SL);                  // arrive: brake before the cover (arrival behaviour, 04 §4.6.3)                               // R_floor between SharpTurn (0.5) and CStart (0.18) SL [E]
    }
    if (headingOverride != null) heading = headingOverride;
    if (S === 'Hide' && dist < 0.5 * SL) { heading = 0; }                                       // face upstream, i.e. out of the cover
    heading += this.noise * (mode === 'hold' ? 1 : 0.3);
    // vertical: relax toward the target height (limited climb rate), pitch follows
    const vy = clamp((vTargetY - B.pos.y) * 2, -0.25, 0.25); B.pos.y += vy * dt;
    B.pitch = clamp(Math.atan2(vy, Math.max(0.15, Urel)), -0.6, 0.6);
    const U_bl = Math.max(0.45, Urel / SL);
    return { mode, U_bl, heading_target: heading, flowVec: [flow[0], flow[1]], rate_max: mode === 'strike' || mode === 'flee' ? 6 * rateMax : rateMax, fins, jawOpen: jaw, opercle, R_floor: rFloor, boost: mode === 'strike' ? 1.25 : 1, fast: mode === 'strike' || mode === 'flee' };
  }

  // ---------------------------------------------------------------- frame update
  update(dt) {
    this.sim += dt; this.stateT += dt; this.world.update(dt);
    this.perceptT += dt; if (this.perceptT >= 1 / 15) { this.perceive(this.perceptT); this.perceptT = 0; }
    this.needsT = (this.needsT ?? 0) + dt; if (this.needsT >= 0.2) { this.updateNeeds(this.needsT); this.needsT = 0; }
    this.decideT += dt; if (this.decideT >= 0.1) { this.decide(this.decideT); this.decideT = 0; }
    const intent = this.state === 'CStartFlee' ? { mode: 'escape', U_bl: 6, flowVec: this.world.flowAt(this.px, this.pz, this.body.pos.y), fins: FIN.flee } : this.steer(dt);
    this.body.update(dt, intent);
    return intent;
  }
}
