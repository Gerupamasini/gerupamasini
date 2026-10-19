import { DataTexture, FloatType, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, Vector2, Vector4, type IUniform } from 'three';
import type { SurfZone } from './SurfZone';

/** Waves breaking on an open shore (走水). A sheltered flat (葛西) has none. */
export interface SurfParams {
  /** significant wave height at the map's outer edge (m): the shore's usual sea (each day's varies about it) */
  height: number;
  /** mean wave period (s) */
  period: number;
  /** the beach slope used where the terrain gives none (rise per metre) */
  slope: number;
  /** the way out to sea (unit vector in world x, z) */
  seaward: readonly [number, number];
  /** the waves' mean approach off the shore's normal (rad; + comes from the +along-shore side, -z → +z) */
  angle?: number;
  /** how much the approach wanders from wave to wave (rad) */
  spread?: number;
}

/** The surf's uniforms, one set shared by the water, the sand, the spray and the breaking lips. */
export interface SurfUniforms {
  /** x: significant height at the outer edge (m), y: mean period (s), z: fallback slope, w: 1 on / 0 off */
  uSurf: IUniform<Vector4>;
  /** xy: seaward direction (world x, z); z: sine of the mean approach angle; w: its spread (sine) */
  uSurfDir: IUniform<Vector4>;
  /** the zone (SurfZone): ground, arrival times, slope; bar, shelter, impact; the level bracket */
  tSurfZone: IUniform<DataTexture>;
  tSurfAux: IUniform<DataTexture>;
  uSurfLv: IUniform<Vector4>;
  /** x: half the terrain's size (m), y: the zone's texels across */
  uSurfGrid: IUniform<Vector2>;
}

const blank = (v: [number, number, number, number]) => { const t = new DataTexture(new Float32Array(v), 1, 1, RGBAFormat, FloatType); t.needsUpdate = true; return t; };

export function surfUniforms(p: SurfParams | null): SurfUniforms {
  const a = p?.angle ?? 0, sp = p?.spread ?? 0.18;
  return {
    uSurf: { value: p ? new Vector4(p.height, p.period, p.slope, 1) : new Vector4(0.1, 4, 0.05, 0) },
    uSurfDir: { value: p ? new Vector4(p.seaward[0], p.seaward[1], Math.sin(a), Math.sin(sp)) : new Vector4(1, 0, 0, 0) },
    tSurfZone: { value: blank([0, 0, 0, 0.05]) },
    tSurfAux: { value: blank([-10, 1, 1, 0]) },
    uSurfLv: { value: new Vector4(0, 0.04, 5, 3) },
    uSurfGrid: { value: new Vector2(48, 1) },
  };
}

/** Point the surf's uniforms at the zone made for this terrain (and keep following it). */
export function bindSurfZone(u: SurfUniforms, zone: SurfZone): void {
  u.tSurfZone = zone.uniforms.tSurfZone;
  u.tSurfAux = zone.uniforms.tSurfAux;
  u.uSurfLv = zone.uniforms.uSurfLv;
  u.uSurfGrid.value.set(zone.half, zone.n);
}

/** The day's sea into the uniforms (height, period, approach). */
export function setSurfSea(u: SurfUniforms, sea: { height: number; period: number; angle: number; spread: number }): void {
  u.uSurf.value.x = sea.height;
  u.uSurf.value.y = sea.period;
  u.uSurfDir.value.z = Math.sin(sea.angle);
  u.uSurfDir.value.w = Math.sin(sea.spread);
}

/**
 * GLSL: the surf, shared by the water pass (the surface, its foam and the swash sheet), the sand's wetness, the
 * spray and the breaking lips. Everything is a function of a point, the water level and the time; nothing is
 * simulated, so it costs the same on a phone as on a desktop and never drifts.
 *
 * Where the waves are comes from the zone (SurfZone, made from the terrain and the tide): the arrival time T of the
 * waves at each point (they slow in the shallows, so the crests bunch up and refract), the bed's slope, the highest
 * ground crossed on the way in (bars), the shelter behind rocks and where the waves strike them.
 *
 * Irregular waves: the phase is the arrival time warped by a slow noise (each wave has its own period, 0.75–1.5
 * of the mean), turned by an approach angle that wanders from wave to wave (a crest that comes in at an angle sweeps
 * along the beach; Snell's law holds, the alongshore wavenumber being the same at every depth), and bent along its
 * length (long bends, crest-length bends and kinks). Each wave's height is Rayleigh-distributed about the day's Hs, in
 * groups of about six, and uneven along its crest (short-crested sections that break while the next still stands).
 *
 * Shoaling (Green's law) raises the waves; their shape follows the Ursell number (Ruessink et al. 2012) through
 * Abreu et al.'s waveform: sinusoidal offshore, Stokes-peaked crests and flat troughs (the Gerstner look) in
 * intermediate water, forward-leaning and steep-fronted near the break. A wave breaks where its height reaches γ
 * times the depth, γ after Weggel for the local slope (higher on the steep beach face), early over a bar; the
 * surf similarity number at the break makes it spill (a white crest running down a gentle front) or plunge (a glassy
 * front standing vertical, its lip thrown forward — the lip itself is drawn by SurfLip). Broken, it runs in as a bore
 * shrinking with the depth, a foaming roller on its front and lace behind.
 *
 * At the waterline each bore becomes a swash event (Shen & Meyer): a ballistic front up the beach, reaching the run-up
 * of that wave (Stockdon et al.'s for the day's sea, by the square root of each wave's height), stopping, and draining
 * back about 1.35 times slower; behind the front a thin lens of water h = (xs − x)² / (9 g t²) whose velocity grows
 * down the slope. The last three events are looked at, so a new uprush runs into the last backwash on a gentle
 * beach (a foaming collision), and the backwash draws the water below the still level before the next bore.
 */
export const SURF_GLSL = /* glsl */ `
// (a shore without surf compiles it out: NO_SURF makes uSurf a constant zero, so every branch it guards is dropped and
// the shader is that much smaller; the water's composite costs a third of the frame less on 葛西 for it)
#ifdef NO_SURF
const vec4 uSurf = vec4(0.0);
#else
uniform vec4 uSurf;
#endif
uniform vec4 uSurfDir;
uniform vec4 uSurfLv;
uniform vec2 uSurfGrid;
uniform sampler2D tSurfZone, tSurfAux;
// (an arithmetic hash, no sine: cheaper, and the same on every GPU. It turns a difference in its input's last bit
// into a different number, so it is given only inputs exact in single precision — integers, eighths — that every GPU,
// fused multiply-add or not, and the CPU's copy of the surf (surfCpu) reckon alike)
float surfHash(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
// a wave's own offset into the noise fields, bounded however long the session runs (the wave count only grows)
float surfW(float n) { return fract(n * 0.6180339887) * 89.0; }
float surfNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 57.0;
  return mix(mix(surfHash(n), surfHash(n + 1.0), f.x), mix(surfHash(n + 57.0), surfHash(n + 58.0), f.x), f.y);
}
// where the swash has drained (or never reaches), the surface lies this far under the sand: clear of the ripples'
// troughs (the ripple sheet near the viewer has them as real hollows), which the beach's sand drains
const float SURF_DRY = 0.02;
float surfNoise1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(surfHash(i * 1.375 + 0.125), surfHash(i * 1.375 + 1.5), f); }
// a point in the shore's own frame: x seaward, y along the shore
vec2 surfFrame(vec2 p) { vec2 d = uSurfDir.xy; return vec2(dot(p, d), dot(p, vec2(-d.y, d.x))); }

// ---- the zone: (ground, arrival time at the bracket's two levels, slope) through a cubic B-spline (four bilinear
// lookups), smooth in its slope too, so the crests have no kinks from the 25 cm grid; beyond the map's seaward edge
// the arrival time runs on at the edge's speed
vec4 surfZoneAt(vec2 xz) {
  vec2 pc = clamp(xz, vec2(-uSurfGrid.x), vec2(uSurfGrid.x));
  float N = uSurfGrid.y;
  vec2 st = (pc + uSurfGrid.x) / (2.0 * uSurfGrid.x) * (N - 1.0), i = floor(st), f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0, w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0, w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / N, h1 = (i + 1.5 + w3 / g1) / N;
  vec4 z = g0.y * (g0.x * texture2D(tSurfZone, vec2(h0.x, h0.y)) + g1.x * texture2D(tSurfZone, vec2(h1.x, h0.y)))
         + g1.y * (g0.x * texture2D(tSurfZone, vec2(h0.x, h1.y)) + g1.x * texture2D(tSurfZone, vec2(h1.x, h1.y)));
  z.yz -= max(dot(xz - pc, uSurfDir.xy), 0.0) / max(uSurfLv.z, 0.5);
  return z;
}
vec4 surfAuxAt(vec2 xz) {
  vec2 pc = clamp(xz, vec2(-uSurfGrid.x), vec2(uSurfGrid.x));
  float N = uSurfGrid.y;
  return texture2D(tSurfAux, ((pc + uSurfGrid.x) / (2.0 * uSurfGrid.x) * (N - 1.0) + 0.5) / N);
}
// the level's place in the zone's bracket
float surfLvMix(float level) { return clamp((level - uSurfLv.x) / max(uSurfLv.y - uSurfLv.x, 1e-4), 0.0, 1.0); }

// ---- the waves' timing
// time warped by a slow noise: each wave has its own period (|warp'| < 0.33, so the waves never overtake)
float surfWarp(float ta) {
  float Tp = uSurf.y;
  return ta + Tp * (0.55 * (surfNoise1(ta / (Tp * 5.3)) - 0.5) + 0.2 * (surfNoise1(ta / (Tp * 1.7) + 7.1) - 0.5));
}
// the sine of the approach angle offshore, wandering from wave to wave
float surfSinA(float ta) { return clamp(uSurfDir.z + uSurfDir.w * 2.0 * (surfNoise1(ta / (uSurf.y * 6.1) + 3.7) - 0.5), -0.7, 0.7); }
// the crests' bends along their length (in periods: ±0.4 over ~70 m, ±0.2 over ~18 m, ±0.07 over ~5 m), drifting
float surfBend(float y, float ta) {
  return 0.8 * (surfNoise(vec2(y * 0.014 + ta * 0.004, 1.3)) - 0.5)
       + 0.4 * (surfNoise(vec2(y * 0.055, ta * 0.045 + 5.1)) - 0.5)
       + 0.14 * (surfNoise(vec2(y * 0.2, ta * 0.09 + 9.7)) - 0.5);
}
// waves at a point of arrival time T: the integer part numbers the wave, the fraction is the time since its crest
// passed (a crest coming in from the +y side reaches the +y end of the beach first)
float surfPhase(vec2 sy, float T, float t) {
  float ta = t - T;
  return surfWarp(ta + sy.y * surfSinA(ta) / max(uSurfLv.z, 0.5)) / uSurf.y + surfBend(sy.y, ta);
}
// wave n's height at the outer edge (m): Rayleigh-distributed about Hs (mean 0.63 Hs), in groups of about six, and
// uneven along its crest (sections of ten or twenty metres, and a few metres)
float surfWaveH(float n, vec2 sy) {
  float w = surfW(n);
  // (the group and the crest's unevenness widen the spread a little; the heights stay near Rayleigh's)
  float ray = clamp(0.706 * sqrt(-log(max(1.0 - 0.985 * surfHash(floor(w * 64.0) + 0.5), 1e-3))), 0.3, 1.5);
  float grp = 0.8 + 0.4 * surfNoise1(n * 0.16 + 4.3);
  float sect = 0.68 + 0.64 * smoothstep(0.12, 0.88, surfNoise(vec2(sy.y * 0.075, sy.x * 0.02) + w));
  float fine = 0.88 + 0.24 * surfNoise(vec2(sy.y * 0.32, sy.x * 0.05) - w * 1.3);
  return uSurf.x * ray * grp * sect * fine;
}

// ---- the wave's shape
// Abreu et al.'s waveform per unit crest-to-trough height: x: η, y: dη/dθ
vec2 surfAbreu(float th, float r, float phi) {
  float s = sqrt(1.0 - r * r), c = r * sin(phi) / (1.0 + s), c0 = -r / (1.0 + s);
  float range = (1.0 + c0) / (1.0 - r) + (1.0 - c0) / (1.0 + r);
  float N = sin(th) + c, Dn = 1.0 - r * cos(th + phi);
  return vec2(N / Dn, (cos(th) * Dn - N * r * sin(th + phi)) / (Dn * Dn)) / range;
}
// the wavenumber at depth D (Eckart)
float surfK(float D) { float w = 6.2831853 / uSurf.y, w2g = w * w / 9.81; return w2g / sqrt(tanh(w2g * max(D, 0.02))); }
// (r, φ) from the Ursell number (Ruessink et al.), Stokes-peaked in deeper water
vec2 surfShape(float H, float D, float k) {
  float kd = k * max(D, 0.02);
  float ur = max(0.375 * H * k / (kd * kd * kd), 1e-6);
  float B = 0.857 / (1.0 + exp((-0.471 - log(ur) * 0.4342945) / 0.297));
  float psi = -1.5707963 + 1.5707963 * tanh(0.815 / pow(ur, 0.672));
  float b = B * 1.41421356 / sqrt(9.0 + 2.0 * B * B);
  float r = 2.0 * b / (1.0 + b * b);
  return vec2(max(r, min(0.4, 0.45 * k * H)), -1.5707963 - psi);
}

// ---- the swash
// x: water depth (m), y: velocity up the beach (m/s), z: nearness of the front (0..1), w: time since this event's
// bore reached the waterline (s)
vec4 gSwash = vec4(0.0);
// a new uprush running over the last backwash (0..1); 1 while the event is running up; the event's number (bounded)
float gSwCollide = 0.0, gSwUp = 0.0, gSwN = 0.0;
// how far up the beach the event's front is from the point (m; 0 where no sheet lies)
float gSwDx = 0.0;
void surfSwashAt(vec2 sy, float D, float ph, float ta, float beta, float shelter, bool full) {
  float Tp = uSurf.y;
  float b = clamp(beta, 0.02, 0.25);
  float x = -D / b;
  float a0 = ta + sy.y * surfSinA(ta) / max(uSurfLv.z, 0.5);
  float Tl = Tp / max((surfWarp(a0 + 0.15) - surfWarp(a0 - 0.15)) / 0.3, 0.4);
  float n0 = floor(ph), tau0 = (ph - n0) * Tl;
  // run-up: Stockdon et al.'s 2 % value for the day's sea on this slope; the common wave reaches about 0.6 of it
  float Hs = max(uSurf.x, 0.02), L0 = 1.5613 * Tp * Tp, HL = Hs * L0;
  float R2 = b / sqrt(Hs / L0) < 0.3 ? 0.043 * sqrt(HL) : 1.1 * (0.35 * b * sqrt(HL) + 0.5 * sqrt(HL * (0.563 * b * b + 0.004)));
  float shel = pow(clamp(shelter, 0.0, 1.0), 0.8);
  vec4 best = vec4(0.0, 0.0, 0.0, 99.0);
  float bestN = 0.0, bestUp = 0.0, bestDx = 0.0, hPrev = 0.0, xsNew = -99.0, upNew = 0.0;
  for (int i = 0; i < 3; i++) {
    float n = n0 - float(i), tau = tau0 + float(i) * Tl, wn = surfW(n);
    float Hn = surfWaveH(n, sy) * shel;
    // (a few millimetres at least: a sheltered wave of next to nothing still reaches the waterline, and the timing below
    // never divides by zero)
    float R = max(0.62 * R2 * sqrt(max(Hn, 0.0) / Hs) * (0.75 + 0.5 * surfNoise(vec2(sy.y * 0.2, 1.7) + wn * 3.1)), 0.004);
    float Xr = R / b, U0 = sqrt(19.62 * R), tU = max(U0 / (9.81 * b), 0.05), tD = 1.35 * tU;
    float xs, us;
    if (tau < tU) { xs = U0 * tau - 4.905 * b * tau * tau; us = U0 - 9.81 * b * tau; }
    else { float tb = tau - tU; xs = Xr * (1.0 - (tb / tD) * (tb / tD)); us = -2.0 * Xr * tb / (tD * tD); }
    // (not far below the still waterline: there the next bore is already running in)
    xs = max(xs, -0.6 * Xr - 0.3);
    // a lacy, lobed front
    xs += (0.16 * (surfNoise(sy * vec2(0.9, 1.4) + wn * 5.3) - 0.5) + 0.06 * (surfNoise(sy * vec2(3.0, 4.5) - wn * 2.1) - 0.5)) * min(Xr, 1.6);
    float te = tau + 0.3, dx = xs - x;
    // the lens behind the front, and the front's own blunt nose (friction keeps the tip a few millimetres thick, a
    // centimetre or so while it climbs): a sheet that ends in a low step, not a feather edge
    float nose = (0.004 + 0.012 * smoothstep(0.0, 0.6, us) * min(Hn / 0.3, 1.5)) * smoothstep(0.0, 0.03, dx) * exp(-dx / 0.35);
    float h = dx > 0.0 ? min(max(dx * dx / (88.29 * te * te), nose), 0.5 * Hn) : 0.0;
    if (i == 0) { xsNew = xs; upNew = tau < tU ? 1.0 : 0.0; }
    if (i == 1) hPrev = h;
    if (h > best.x) {
      best = vec4(h, us + 0.6667 * (x - xs) / te, step(0.0, dx) * exp(-max(dx, 0.0) / (0.05 + 0.08 * min(Xr, 2.0))), tau);
      bestN = wn; bestUp = tau < tU ? 1.0 : 0.0; bestDx = dx;
    }
  }
  gSwash = best; gSwN = bestN; gSwUp = bestUp; gSwDx = bestDx;
  // the new uprush meeting the last backwash: a turbulent, foaming step where its front runs over the old sheet
  gSwCollide = full ? upNew * exp(-abs(x - xsNew) / 0.3) * smoothstep(0.002, 0.02, hPrev) : 0.0;
}

// ---- breaking: how a wave of height H0 (at the outer edge) stands at a point of depth D on slope m, a bar of top
// 'bar' seaward (the highest ground crossed)
struct SurfBrk {
  float Hw;      // its height here (shoaled, never much over the breaking height)
  float gam;     // the breaker index (Weggel)
  float Db;      // the depth it goes over in
  float Dctl;    // the depth that rules it (the bar's, until it re-forms in deeper water)
  float q;       // its height over the breaking height (1: breaking)
  float plunge;  // 0 spilling .. 1 plunging (the surf similarity at the break)
  float k;       // how far it has broken (0 whole .. 1 a bore)
};
SurfBrk surfBreak(float H0, float D, float m, float bar, float level) {
  SurfBrk b;
  float Tp = uSurf.y;
  float Dr = max(uSurfLv.w, 0.3), Dc = max(D, 0.02);
  float H = H0 * clamp(pow(Dr / max(Dc, 0.05), 0.25), 0.8, 2.2);
  b.gam = clamp(1.56 / (1.0 + exp(-19.5 * m)) - 43.8 * (1.0 - exp(-19.0 * m)) * H / (9.81 * Tp * Tp), 0.6, 1.3);
  // a bar seaward breaks it early; well past the bar, in deeper water, it re-forms. (Ground standing out of the water
  // is no bar: behind a rock the waves are sheltered, not broken.)
  float Dbar = level - bar;
  float barOn = smoothstep(0.03, 0.15, Dbar) * step(Dbar, Dc);
  b.Dctl = mix(Dc, mix(max(Dbar, 0.02), Dc, smoothstep(1.5, 2.6, Dc / max(Dbar, 0.02))), barOn);
  float Hr = H0 * pow(Dr, 0.25);
  b.Db = pow(Hr / b.gam, 0.8);                         // where this wave goes over on its way in
  b.q = Hr * pow(max(b.Dctl, 0.02), -1.25) / b.gam;    // its height over the breaking height here
  float xi = m / sqrt(max(Hr * pow(max(b.Db, 0.02), -0.25), 0.01) / (1.5613 * Tp * Tp));
  b.plunge = smoothstep(0.3, 0.6, xi);
  b.k = smoothstep(1.0, mix(1.9, 1.25, b.plunge), b.q);
  b.Hw = min(H, b.gam * b.Dctl * 1.05);
  return b;
}

// The stage of the wave nearest a point: x: the time since its crest passed (fraction of the period), y: q, z:
// plunge, w: its height there (m). (What the lips and the spray look for: a crest going over.)
vec4 surfStage(vec2 xz, float level, float t) {
  vec4 Z = surfZoneAt(xz);
  vec4 A = surfAuxAt(xz);
  float f = surfLvMix(level);
  vec2 sy = surfFrame(xz);
  float ph = surfPhase(sy, mix(Z.y, Z.z, f), t);
  float n = floor(ph), u = ph - n;
  float H0 = surfWaveH(u > 0.5 ? n + 1.0 : n, sy) * pow(clamp(mix(A.y, A.z, f), 0.0, 1.0), 0.8);
  SurfBrk b = surfBreak(H0, level - Z.x, clamp(Z.w, 0.005, 0.2), A.x, level);
  return vec4(u, b.q, b.plunge, b.Hw);
}

// The crest going over along the line at alongshore y (shore frame), between s0 (shoreward) and s1 (seaward), at time
// t: marched in from the sea in steps under half the crests' spacing; each crest crossed is placed between the
// samples where the phase wraps, and the first one that has reached its breaking height is the one. x: its s, y: q,
// z: plunge, w: its height; x < -1e3: none.
vec4 surfBreakingCrest(float y, float s0, float s1, float level, float t, int steps) {
  vec2 d = uSurfDir.xy, al = vec2(-d.y, d.x);
  float ds = (s1 - s0) / float(steps);
  vec4 prev = surfStage(d * s1 + al * y, level, t);
  for (int i = 1; i <= 48; i++) {
    if (i > steps) break;
    float s = s1 - ds * float(i);
    vec4 cur = surfStage(d * s + al * y, level, t);
    // (going in, the phase falls: the crest lies where it wraps from near 0 to near 1)
    if (cur.x - prev.x > 0.5) {
      float a = prev.x / max(prev.x + 1.0 - cur.x, 1e-3);
      float sc = s + ds * (1.0 - a);
      float q = mix(prev.y, cur.y, a);
      if (q > 0.9) return vec4(sc, q, mix(prev.z, cur.z, a), mix(prev.w, cur.w, a));
    }
    prev = cur;
  }
  return vec4(-1e4, 0.0, 0.0, 0.0);
}

// ---- the surf at a point
struct Surf {
  float eta;      // the surface above the still level (m)
  vec2 grad;      // its gradient (world x, z), from the waves alone (the swash's is measured by the water pass)
  float crest;    // whitecap on a crest as it tips over (0..1)
  float roller;   // the bore's foaming roller and the curtain of a plunging lip (0..1)
  float trail;    // the lace the bore leaves behind it (0..1)
  float lip;      // the thin top of a steep front that lets the light through (0..1)
  float face;     // a steep front turned toward the beach (0..1)
  float brk;      // how far it has broken (0 whole .. 1 a bore)
  float plunge;   // 0 spilling .. 1 plunging
  float n;        // the wave's number (bounded), so each wave's foam has its own pattern
  float age;      // time since the crest passed (s): the lace drifts and thins with it
  float sw;       // 0 in the surf .. 1 in the swash
  float film;     // the swash's water depth (m)
  float flow;     // the swash's velocity up the beach (m/s)
  float front;    // nearness of the swash's front (0..1)
  float swAge;    // time since the swash's bore reached the waterline (s)
  float swUp;     // 1 while it runs up
  float collide;  // a new uprush running into the last backwash (0..1)
  float murk;     // sand stirred into the water (0..1)
  float impact;   // waves striking a rock or a wall here (0..1)
  float D;        // the still water's depth (m; negative up the beach)
  float swDx;     // how far up the beach the swash's front is (m; 0 where no sheet lies): with swAge, where a parcel
                  // of the sheet sits (d / (t + 0.3)^(2/3) is the same parcel all along, Shen & Meyer's lens), so what
                  // is drawn on the sheet can ride it
};

// The surf at a point for the water level and time. 'full': the foam, the swash's foam and the flow too (the trace
// asks only for the height).
Surf surfEval(vec2 xz, float level, float t, bool full) {
  Surf S = Surf(0.0, vec2(0.0), 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 99.0, 0.0, 0.0, 0.0, 0.0, 1e3, 0.0);
  if (uSurf.w <= 0.0) return S;
  vec4 Z = surfZoneAt(xz);
  float D = level - Z.x;
  S.D = D;
  // high and dry, above any run-up: the ground itself
  if (D < -0.9 * uSurf.x - 0.12) { S.eta = -D - SURF_DRY; S.sw = 1.0; return S; }
  vec4 A = surfAuxAt(xz);
  float f = surfLvMix(level);
  float T = mix(Z.y, Z.z, f), shelter = mix(A.y, A.z, f);
  float m = clamp(Z.w, 0.005, 0.2);
  vec2 sy = surfFrame(xz);
  float Tp = uSurf.y, ta = t - T;
  float ph = surfPhase(sy, T, t);
  float n = floor(ph), u = ph - n;
  S.n = surfW(u > 0.5 ? n + 1.0 : n);
  float shel = pow(clamp(shelter, 0.0, 1.0), 0.8);
  // the heights at the outer edge, easing from one wave's to the next across the trough
  float H0 = mix(surfWaveH(n, sy), surfWaveH(n + 1.0, sy), smoothstep(0.3, 0.7, u)) * shel;
  float Dsw = clamp(0.35 * H0, 0.05, 0.2);
  float wsw = 1.0 - smoothstep(0.45 * Dsw, Dsw, D);
  float eta = 0.0;
  if (wsw < 1.0) {
    float Dc = max(D, 0.02);
    SurfBrk B = surfBreak(H0, D, m, A.x, level);
    float Dctl = B.Dctl, Db = B.Db, q = B.q, plunge = B.plunge, k = B.k, gam = B.gam, Hw = B.Hw;
    float kw = surfK(Dc), c = 6.2831853 / Tp / kw;
    float deta = 0.0;
    // whole: shoaled, peaked, then leaning forward as it nears the break
    float near = smoothstep(0.55, 1.0, q);
    if (k < 1.0) {
      vec2 sh = surfShape(Hw, Dc, kw);
      float r = mix(sh.x, mix(0.6, 0.86, plunge), near);
      float phi = mix(sh.y, mix(-0.55, 0.0, plunge), near);
      vec2 W = surfAbreu(6.2831853 * u + 1.5707963 - (phi + 1.5707963) * 0.73 * r, r, phi);
      eta = Hw * W.x; deta = Hw * W.y * 6.2831853;
      if (full) {
        float onFront = smoothstep(0.6, 0.8, u);
        float top = smoothstep(0.12, 0.45, W.x);
        S.lip = near * onFront * top;
        // a spilling crest turns white over the top and the white runs down its front; a plunging one stays glassy
        // until its lip is thrown
        S.crest = smoothstep(0.85, 1.05, q) * top * mix(1.0, 0.3, plunge) * (0.55 + 0.45 * onFront);
      }
    }
    // broken: a bore shrinking with the depth, its rolling front steep and white, its back sloping away
    if (k > 0.0) {
      float Hb = mix(0.55 * Dctl, 0.85 * Hw, smoothstep(0.75 * Db, Db, Dctl));
      Hb *= 0.5 + 0.7 * smoothstep(0.1, 0.9, surfNoise(vec2(sy.y * 0.3, sy.x * 0.05) + surfW(n) * 2.3));
      float fr = mix(0.1, 0.06, plunge), fb, dfb;
      if (u < 1.0 - fr) { fb = 1.0 - u / (1.0 - fr); dfb = -1.0 / (1.0 - fr); }
      else { float v = (u - (1.0 - fr)) / fr; fb = v * v * (3.0 - 2.0 * v); dfb = 6.0 * v * (1.0 - v) / fr; }
      eta = mix(eta, Hb * (fb - 0.42), k);
      deta = mix(deta, Hb * dfb, k);
      if (full) {
        float big = smoothstep(0.004, 0.06, Hb);
        float roll = smoothstep(1.0 - fr - 0.05, 1.0, u) * 0.85 + exp(-u * 8.0) * 0.9;
        // a plunging lip lands just ahead of the crest: a white curtain there while it goes over
        float curtain = plunge * smoothstep(0.0, 0.3, k) * (1.0 - smoothstep(0.55, 0.95, k)) * smoothstep(0.86, 0.97, u);
        S.roller = max(k * roll * big, curtain) * smoothstep(0.0, 0.04, Dc);
        // (the whitewater behind a bore: a sheet of foam that breaks into lace and thins over the period)
        S.trail = k * big * (0.75 * exp(-u * 1.7) + 0.22);
        S.crest *= 1.0 - k;
        S.lip *= 1.0 - k;
      }
    }
    // the slope along the waves' travel: du/ds = 1/(c T); the crests turned by Snell's law
    float sl = clamp(surfSinA(ta) * c / max(uSurfLv.z, 0.5), -0.9, 0.9);
    vec2 gsy = deta / (c * Tp) * vec2(sqrt(1.0 - sl * sl), sl);
    S.grad = (gsy.x * uSurfDir.xy + gsy.y * vec2(-uSurfDir.y, uSurfDir.x)) * (1.0 - wsw);
    if (full) {
      S.face = smoothstep(0.08, 0.5, gsy.x) * (1.0 - wsw);
      S.brk = k; S.plunge = plunge;
      S.age = u * Tp;
      S.murk = (1.0 - smoothstep(0.1, 1.2, D)) * max(k, near * 0.5);
      // waves striking a rock or a wall: white water all round it as each crest arrives, foam streaming off after
      S.impact = A.w * (exp(-u * 4.0) + smoothstep(0.85, 1.0, u)) * smoothstep(0.04, 0.15, H0);
      S.roller = max(S.roller, min(S.impact * 1.3, 1.0));
      S.trail = max(S.trail, A.w * 0.6 * smoothstep(0.04, 0.15, H0));
    }
  }
  // up the beach (and a little below the still waterline) the surface is the swash's
  if (wsw > 0.0) {
    surfSwashAt(sy, D, ph, ta, m, shelter, full);
    float esw = gSwash.x > 0.0 ? -D + gSwash.x : -D - SURF_DRY;
    eta = mix(eta, esw, wsw);
    S.sw = wsw;
    S.film = gSwash.x; S.flow = gSwash.y; S.front = gSwash.z * wsw; S.swAge = gSwash.w; S.swUp = gSwUp; S.swDx = gSwDx;
    S.collide = gSwCollide * wsw;
    if (wsw > 0.5) S.n = gSwN;
    S.roller *= 1.0 - wsw;
    S.trail *= 1.0 - wsw;
  }
  S.eta = eta;
  return S;
}

// the surface's height above the still level alone (the trace's call)
float surfEtaAt(vec2 xz, float level, float t) { return surfEval(xz, level, t, false).eta; }
`;

/**
 * Tiling foam (after the reference coast's foam map, made less regular). R and G: the walls of Voronoi cells (F2 − F1)
 * at two sizes, the cells warped by a smooth noise and the walls broken in places, so the lace never reads as a net;
 * B: bubble rims of many sizes, 3 to 40 mm across at the scale the water uses. Everything is periodic, so it tiles.
 */
const foamCache = new Map<number, Uint8Array>();
export function makeFoamTexture(S = 512): DataTexture {
  // (the lace takes a quarter of a second to make: made once a session, then each flat gets its own texture of it)
  const cached = foamCache.get(S);
  if (cached) return foamTexture(cached.slice(), S);
  let a = 730 >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // periodic value noise on a P×P lattice (it tiles with the texture)
  const lattice = (P: number) => Float32Array.from({ length: P * P }, () => rnd());
  const L = [4, 8, 16, 32].map((P) => ({ P, v: lattice(P) }));
  const vn = (u: number, v: number, k: number) => {
    const { P, v: g } = L[k];
    const x = u * P, y = v * P, ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const at = (i: number, j: number) => g[(((j % P) + P) % P) * P + (((i % P) + P) % P)];
    return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
  };
  const fbm = (u: number, v: number) => vn(u, v, 0) * 0.45 + vn(u, v, 1) * 0.3 + vn(u, v, 2) * 0.17 + vn(u, v, 3) * 0.08;
  const cells = (n: number) => Array.from({ length: n * n }, () => [0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8, rnd()]);
  const c1 = cells(12), c2 = cells(31);
  const edge = (u: number, v: number, n: number, c: number[][], width: number) => {
    const x = u * n, y = v * n, ix = Math.floor(x), iy = Math.floor(y);
    let f1 = 9, f2 = 9, w = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy;
      const k = c[(((cy % n) + n) % n) * n + (((cx % n) + n) % n)];
      const d = (cx + k[0] - x) ** 2 + (cy + k[1] - y) ** 2;
      if (d < f1) { f2 = f1; f1 = d; w = k[2]; } else if (d < f2) f2 = d;
    }
    const t = Math.sqrt(f2) - Math.sqrt(f1);
    return Math.exp(-(t * t) / ((0.003 + w * 0.003) * width));
  };
  const lace = new Float32Array(S * S * 2);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S;
    // the cells bent by a smooth warp; the walls thicker and thinner along their length, and gone in places
    const wu = u + (fbm(u, v) - 0.5) * 0.09, wv = v + (fbm(u + 0.37, v + 0.71) - 0.5) * 0.09;
    const m1 = fbm(u + 0.13, v + 0.52), m2 = fbm(u + 0.61, v + 0.29);
    const m3 = vn(u + 0.29, v + 0.61, 3) * 0.6 + vn(u + 0.83, v + 0.17, 2) * 0.4;
    const gap = (m: number, at: number) => Math.min(1, Math.max(0, (m - at) / 0.14));
    lace[(j * S + i) * 2] = edge(wu, wv, 12, c1, 0.5 + 1.2 * m2) * gap(m1, 0.4);
    lace[(j * S + i) * 2 + 1] = edge(wu + 0.5, wv + 0.5, 31, c2, 0.6 + m1) * (0.15 + 0.85 * gap(m3, 0.38));
  }
  // bubbles: rims of circles, many small and few large (sizes log-uniform), wrapped around the edges
  const bub = new Float32Array(S * S);
  const nb = Math.round(1800 * (S / 512) ** 2);
  for (let b = 0; b < nb; b++) {
    const cx = rnd() * S, cy = rnd() * S, r = (1.5 * Math.pow(6, rnd())) * (S / 512), wdt = 0.35 + 0.18 * r, k = 0.6 + 0.4 * rnd();
    const R = Math.ceil(r + 3 * wdt);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x + (cx % 1), y + (cy % 1));
      const val = k * Math.exp(-(((d - r) / wdt) ** 2));
      if (val < 0.02) continue;
      const px = (((Math.floor(cx) + x) % S) + S) % S, py = (((Math.floor(cy) + y) % S) + S) % S;
      const o = py * S + px;
      if (val > bub[o]) bub[o] = val;
    }
  }
  const data = new Uint8Array(S * S * 4);
  for (let k = 0; k < S * S; k++) {
    data[k * 4] = Math.round(Math.min(1, lace[k * 2]) * 255);
    data[k * 4 + 1] = Math.round(Math.min(1, lace[k * 2 + 1]) * 255);
    data[k * 4 + 2] = Math.round(Math.min(1, bub[k]) * 255);
    data[k * 4 + 3] = 255;
  }
  foamCache.set(S, data);
  return foamTexture(data.slice(), S);
}

function foamTexture(data: Uint8Array, S: number): DataTexture {
  const t = new DataTexture(data, S, S, RGBAFormat);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
