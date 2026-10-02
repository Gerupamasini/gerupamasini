// Behaviour parameters with provenance (docs/yamame/spec/04 §4.1.3). prov: A/B/C/M/P = evidence rank, E = engineering value (no source), proxy = other species.
// Every entry used in a decision is copied into the ExplainTrace `paramsUsed` so E / PROXY dependence is visible (04 §4.7).
const P = (v, unit, prov, src, proxy = null) => ({ v, unit, prov, proxy, src });

export const CFG = {
  // perception (04 §4.5)
  reaction_dist_BL:   P(1.5, 'BL', 'E', '04 §4.5.1 (PROXY range 0.33-1.87 m, no Yamame value)', 'Chinook/cutthroat'),
  fov_horizontal_deg: P(330, 'deg', 'C', '04 §4.5.1 (behaviour layer only)'),
  rear_blind_deg:     P(30, 'deg', 'C', '04 §4.5.1'),
  alert_dist_BL:      P(25, 'BL', 'E', '04 §4.5.2'),
  flee_dist_BL:       P(8, 'BL', 'E', '04 §4.5.2 (FID grows with body size: r13 F-39 C / r12 F-42 A)'),
  approach_speed_gain: P(0.5, '1/(m/s)', 'E', '04 §4.5.2'),
  rear_detect_factor: P(0.7, '-', 'E', '04 §4.5.2'),
  visibility_m:       P(8, 'm', 'E', '04 §4.4.4 scene setting'),
  // needs (04 §4.3.3)
  tau_H_s:            P(300, 's', 'E', '04 §4.3.3'),
  tau_F_s:            P(20, 's', 'E', '04 §4.3.3'),
  F_alert:            P(0.35, '-', 'E', '04 §4.3.1'),
  F_resume:           P(0.2, '-', 'E', '04 §4.6.5'),
  // utility (04 §4.3.2)
  w_strike:           P(1.0, '-', 'E', '04 §4.3.2'),
  w_hold:             P(0.3, '-', 'E', '04 §4.3.2'),
  momentum_bonus:     P(0.25, '-', 'E', '04 §4.3.2'),
  switch_margin:      P(0.10, '-', 'E', '04 §4.3.2'),
  min_dwell_s:        P(1.0, 's', 'E', '04 §4.3.2'),
  // steering (04 §4.6)
  heading_noise_deg:  P(5, 'deg', 'E', '04 §4.6.2'),
  heading_rate_hold:  P(60, 'deg/s', 'E', '04 §4.6.2'),
  station_tol_BL:     P(0.3, 'BL', 'E', '04 §4.6.2'),
  arrive_radius_BL:   P(0.3, 'BL', 'E', '04 §4.6.3'),
  v_strike_BL:        P(6.0, 'BL/s', 'B', '04 §4.6.2 (r09 v:V08 sustained burst range 5.7-9.3)'),
  v_return_BL:        P(1.5, 'BL/s', 'E', '05 §5.3.1 ReturnToPosition'),
  v_flee_BL:          P(8.0, 'BL/s', 'B', '04 §4.6.2 (upper end of FastSwim range)'),
  strike_dist_max_m:  P(0.30, 'm', 'C', '04 §4.6.4 (r12 F-19)'),
  p_reject:           P(0.2, '-', 'E', '04 §4.6.4 (PROXY Chinook 0.52 not used)', 'Chinook'),
  cap_u_hi_ms:        P(0.61, 'm/s', 'A', '04 §4.6.4 endpoints only', 'coho/steelhead'),
  cap_u_lo_ms:        P(0.29, 'm/s', 'A', '04 §4.6.4 endpoints only', 'coho/steelhead'),
  cap_p_max:          P(0.65, '-', 'A', '04 §4.6.4', 'coho/steelhead'),
  cap_p_min:          P(0.10, '-', 'A', '04 §4.6.4', 'coho/steelhead'),
  hide_dwell_s:       P(60, 's', 'E', '04 §4.6.5 (no data on re-emergence time)'),
  height_above_bed_BD: P(0.8, 'body depths', 'P', '04 §4.2.1 (n=5, range 0.25-1)'),
};

export const prov = (names) => names.map((n) => ({ name: n, value: CFG[n].v, prov: CFG[n].prov, proxy: CFG[n].proxy }));

/** cap_prob(u): linear between the two published endpoints, clamped (no extrapolation: 04 §4.6.4). */
export function capProb(u, c = CFG) {
  const lo = c.cap_u_lo_ms.v, hi = c.cap_u_hi_ms.v;
  if (u <= lo) return c.cap_p_max.v; if (u >= hi) return c.cap_p_min.v;
  return c.cap_p_max.v + (c.cap_p_min.v - c.cap_p_max.v) * (u - lo) / (hi - lo);
}
