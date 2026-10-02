// Procedural locomotion modes (docs/yamame/spec/05 §5.3.1/§5.3.2). A mode is a pure description; Yamame.update() consumes the resulting intent.
// U_bl = speed relative to water (BL/s); flow_bl = water velocity (BL/s) subtracted to get ground speed; turn = curvature (1/SL, left +).
export const MODES = {
  Idle:            { U_bl: 1.0, flow_bl: 1.0, turn: 0,    fins: { pecAbd: 0.08, pelAbd: 0.15, dorsalErect: 1.0, analErect: 0.8, caudalSpread: 0.5 }, label: 'Idle / StationHolding' },
  SlowSwim:        { U_bl: 1.0, flow_bl: 0,   turn: 0,    fins: { pecAbd: 0.06, pelAbd: 0.15, dorsalErect: 1.0, analErect: 0.8, caudalSpread: 0.7 }, label: 'SlowSwim' },
  Cruise:          { U_bl: 2.5, flow_bl: 0,   turn: 0,    fins: { pecAbd: 0.04, pelAbd: 0.05, dorsalErect: 0.95, analErect: 0.8, caudalSpread: 0.85 }, label: 'Cruise' },
  FastSwim:        { U_bl: 6.0, flow_bl: 0,   turn: 0,    fins: { pecAbd: 0.02, pelAbd: 0.0, dorsalErect: 0.7, analErect: 0.7, caudalSpread: 0.95 }, label: 'FastSwim' },
  Acceleration:    { U_bl: 6.0, flow_bl: 0,   turn: 0,    boost: 1.25, fins: { pecAbd: 0.02, pelAbd: 0.0, dorsalErect: 1.0, analErect: 1.0, caudalSpread: 0.98 }, label: 'Acceleration' },
  Deceleration:    { U_bl: 0.5, flow_bl: 0,   turn: 0,    fins: { pecAbd: 0.9, pelAbd: 0.9, dorsalErect: 1.0, analErect: 0.8, caudalSpread: 0.7 }, label: 'Deceleration' },
  TurnLeft:        { U_bl: 1.5, flow_bl: 0,   turn: 0.5,  fins: { pecAbd: 0.3, pelAbd: 0.3, dorsalErect: 1.0, analErect: 0.8, caudalSpread: 0.8 }, label: 'TurnLeft  (R=2 SL)' },
  TurnRight:       { U_bl: 1.5, flow_bl: 0,   turn: -0.5, fins: { pecAbd: 0.3, pelAbd: 0.3, dorsalErect: 1.0, analErect: 0.8, caudalSpread: 0.8 }, label: 'TurnRight (R=2 SL)' },
  SharpTurn:       { U_bl: 2.5, flow_bl: 0,   turn: 1.7,  boost: 1.1, fins: { pecAbd: 0.55, pelAbd: 0.4, dorsalErect: 1.0, analErect: 0.9, caudalSpread: 0.9 }, label: 'SharpTurn (R=0.6 SL)' },
  ReturnToPosition:{ U_bl: 1.5, flow_bl: 0,   turn: 0,    fins: { pecAbd: 0.06, pelAbd: 0.15, dorsalErect: 1.0, analErect: 0.8, caudalSpread: 0.7 }, label: 'ReturnToPosition' },
  Rest:            { U_bl: 0.4, flow_bl: 0.4, turn: 0,    A_override: 0.055, f_override: 0.6, fins: { pecAbd: 0.05, pelAbd: 0.1, dorsalErect: 0.7, analErect: 0.7, caudalSpread: 0.5 }, label: 'Rest' },
};

/** Feeding strike (5.6.2): all values in degrees / normalised time, T_strike = 120 ms by default. Returns jaw, hyoid and opercle angles. */
export function strikePose(tn) {
  const bump = (t, t0, tp, t1) => t <= t0 ? 0 : t < tp ? Math.sin((t - t0) / (tp - t0) * Math.PI / 2) : t < t1 ? Math.cos((t - tp) / (t1 - tp) * Math.PI / 2) : 0;
  return {
    jaw: 18 * bump(tn, 0, 0.33, 1.0), hyoid: 12 * bump(tn, 0.05, 0.45, 1.0), opercle: 15 * bump(tn, 0.10, 0.55, 1.0), cranial: 8 * bump(tn, 0, 0.30, 1.0),
  };
}
