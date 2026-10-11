import { GLSL_PARAMS } from './params';

/**
 * GLSL for the アマモ materials (injected into MeshStandardMaterial / MeshDepthMaterial with onBeforeCompile).
 *
 * The blade is not a bent card: every vertex integrates the leaf's centreline from the base, step by step, so the
 * length is preserved whatever the bend. The direction at each arc length s comes from a horizontal "lean" vector:
 *   lean(s) = shoot tilt + the leaf's own splay out of the fan + flow(s) × bend(s)  (+ flutter near the tip)
 * whose length sets the angle from vertical (saturating: buoyancy keeps a submerged blade off the bed) and whose
 * direction sets the azimuth, so the ribbon turns and twists with the flow by itself. The flow is the tidal current
 * (steady, meandering across the meadow) plus the orbital motion of three long-crested wave trains whose phase is
 * delayed toward the tip, so each sway runs up the blade from the base to the tip; the trains cross the meadow as
 * travelling bands (monami) and gusts drift downwind in groups. Then two constraints:
 *  - the water surface: what would rise above it floats along the surface (shallow water: tips lying on the top);
 *    on an open shore that surface is the surf's, read from the field the water pass draws (WaterPass.surfField), so
 *    the blades afloat ride the waves and nothing stands out of a trough. Water shallower than the sheath presses the
 *    whole shoot over from its base, so the sheath lies under the surface too.
 *  - the sand: what would sink into it lies along it (low water: the blades fallen flat, layered, seaward)
 * The tide state (how freely it sways, how much it stands, whether it has fallen) comes from the water depth over
 * the shoot's base relative to its length (params.postureState is the same function on the CPU).
 *
 * Defines: AM_PART (0 leaf, 1 sheath), AM_LOD (0..2), AM_NSEG (leaf segments), AM_ACROSS (2|3), AM_NRING (sheath),
 * AM_WIDEN (leaf width factor of a far tier).
 */

export const AM_VERT_COMMON = /* glsl */ `
${GLSL_PARAMS}
uniform float uAmTime;
uniform float uAmWater;
uniform vec2 uAmCurrent;
uniform vec4 uAmWave;      // xy: direction the waves travel, z: orbital speed (m/s), w: gustiness 0..1
uniform vec2 uAmSeaward;
#define AM_PUSH 8
uniform vec4 uAmPush[AM_PUSH];  // xyz: an animal swimming in the leaves (world), w: how far it pushes them aside (m; 0: none)
vec3 gAmP = vec3(0.0);           // the centreline point the current step starts from (relative to the base)
uniform sampler2D tAmSurf;
uniform vec2 uAmSurf;      // x: half the terrain's size (m, the field's extent), y: 1 with surf / 0 without
attribute vec4 aShootA;    // x: fan azimuth, y: shoot length (longest leaf, m), z: leaf count, w: seed 0..1
attribute vec4 aShootB;    // x: leaf width (m), y: age 0..1, zw: ground slope (dh/dx, dh/dz)
attribute vec4 aShootC;    // x: tide-pool level over the shoot (-1e3: none), y: edge of the patch 0..1, z: sheath height (m), w: layer jitter
#if AM_PART == 0
attribute vec3 aLeaf;      // x: row along the blade (0..AM_NSEG), y: across (-1..1), z: leaf slot
#else
attribute vec3 aRing;      // x: ring (0..AM_NRING), y: angle round the sheath, z: unused
#endif
varying vec4 vAmA;         // x: u along the blade 0..1 (sheath: angle/2π), y: across -1..1, z: metres to the tip, w: metres from the base
varying vec4 vAmB;         // x: slot, y: leaf hash, z: age, w: half width (m)
varying vec4 vAmC;         // x: leaf length, y: sheath height, z: water level over the shoot, w: shoot seed
varying vec4 vAmD;         // x: fall (0 standing .. 1 lying), y: edge of the patch, z: height of the base (world y), w: unused
varying vec3 vAmW;

float amHash(float n) { return fract(sin(n * 0.1031 + 0.37) * 43758.5453); }
// the shoot-level randoms use a hash without sine: the same on every GPU and on the CPU (flow.ts moves animals with the
// shoot), where fract(sin(x)·43758) depends on each GPU's sin precision
float amHashS(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float amH2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float amNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(amH2(i), amH2(i + vec2(1.0, 0.0)), f.x), mix(amH2(i + vec2(0.0, 1.0)), amH2(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 amRot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

struct AmShoot {
  vec3 base;
  float L, depth, ceilY, hs, width, age, seed;
  float deep, sway, cur, fall, leanM;
  bool surf;
  vec2 grad, flowC, d0, d1, d2, fan, tilt, fallDir;
  vec3 ws, wc;
  float gust;
  float push;
};

// the surf's surface over the still level at an offset from the shoot's base (0 where there is no surf)
float amSurfEta(AmShoot S, vec2 off) {
  if (!S.surf) return 0.0;
  return texture2D(tAmSurf, (S.base.xz + off + uAmSurf.x) / (2.0 * uAmSurf.x)).r;
}

AmShoot amShoot() {
  AmShoot S;
  S.base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  S.L = aShootA.y;
  S.seed = aShootA.w;
  S.width = aShootB.x * AM_WIDEN;
  S.age = aShootB.y;
  S.grad = aShootB.zw;
  S.hs = aShootC.z;
  // the water over the shoot: the tide, or a tide pool's own level where the ground holds water above the tide
  float lvl = (aShootC.x > uAmWater + 0.01 && aShootC.x > S.base.y + 0.003) ? aShootC.x : uAmWater;
  S.depth = lvl - S.base.y;
  // on an open shore the surf lifts and drops the surface over the shallows (a pool stays calm): the ceiling follows
  // it, with more room for the field's 25 cm spacing (read linearly across a bore's steep front, it can stand ~3 cm
  // above the water's own surface at the front's foot)
  S.surf = uAmSurf.y > 0.0 && lvl == uAmWater && S.depth < 1.45;
  S.ceilY = S.depth - (S.surf ? 0.035 : 0.006);
  // tide state (params.postureState)
  float sub = S.depth / max(S.L, 0.05);
  S.deep = smoothstep(0.55, 1.5, sub);
  float wet = smoothstep(0.0, 0.1, S.depth);
  S.sway = (0.22 + 0.78 * S.deep) * wet;
  S.cur = (0.45 + 0.55 * S.deep) * wet;
  S.fall = 1.0 - smoothstep(0.005, 0.06, S.depth);
  // water shallower than the sheath is tall (or a trough passing over): the shoot is pressed over from its base, by
  // the angle that keeps the sheath's mouth under the surface; amTangent leans it along the fall direction
  float room = S.ceilY + amSurfEta(S, vec2(0.0));
  float lean = acos(clamp(room / (S.hs * 1.03), 0.0, 1.0));
  S.leanM = -AM_MAX_WET * log(1.0 - min(lean, 0.95 * AM_MAX_WET) / AM_MAX_WET);
  vec2 P = S.base.xz;
  float t = uAmTime;
  // the tidal current: streams that meander across the meadow, and each shoot jostled a little on its own
  vec2 C = uAmCurrent * (0.8 + 0.4 * amNoise(P * 0.05 + t * 0.01));
  C = amRot(C, 0.7 * (amNoise(P * 0.03 - t * 0.012) - 0.5));
  float jit = (length(uAmCurrent) + 0.3 * uAmWave.z) * 0.35;
  C += jit * vec2(sin(t * 0.9 + S.seed * 40.0 + P.x * 0.7), sin(t * 0.77 + S.seed * 23.0 + P.y * 0.6));
  S.flowC = C * S.cur;
  // the wind waves: three long-crested trains crossing the meadow, their crests bent by a slow phase wander
  S.d0 = uAmWave.xy;
  S.d1 = amRot(uAmWave.xy, AM_WAVE_TURN.y);
  S.d2 = amRot(uAmWave.xy, AM_WAVE_TURN.z);
  vec3 th = AM_WAVE_K * vec3(dot(S.d0, P), dot(S.d1, P), dot(S.d2, P)) - AM_WAVE_W * t + vec3(0.0, 2.1, 4.3);
  th += 1.6 * vec3(amNoise(P * 0.09), amNoise(P * 0.07 + 5.3), amNoise(P * 0.11 + 9.1));
  // no two shoots quite in step: each lags or leads the passing wave a little and takes it more or less strongly
  th += (vec3(amHashS(S.seed * 211.0), amHashS(S.seed * 223.0), amHashS(S.seed * 227.0)) - 0.5) * 1.3;
  S.ws = sin(th);
  S.wc = cos(th);
  // gusts: patches of stronger motion drifting downwind over the meadow
  S.gust = mix(1.0, 0.35 + 1.3 * smoothstep(0.2, 0.85, amNoise(P * 0.045 - uAmWave.xy * t * 0.7)), uAmWave.w);
  S.gust *= 0.75 + 0.5 * amHashS(S.seed * 233.0);
  float az = aShootA.x;
  S.fan = vec2(cos(az), sin(az));
  // each shoot leans a little, mostly within its fan (the sheath is flattened that way)
  S.tilt = S.fan * ((amHashS(S.seed * 91.0) - 0.5) * 0.26) + vec2(-S.fan.y, S.fan.x) * ((amHashS(S.seed * 17.0) - 0.5) * 0.08);
  // where it falls when the water goes: down the local slope and toward the sea, as the last of the ebb laid it
  vec2 fd = uAmSeaward - S.grad * 40.0;
  S.fallDir = normalize(amRot(fd, 0.6 * (amHashS(S.seed * 53.0) - 0.5)) + 1e-5);
  // is an animal in among this shoot's leaves? (only those shoots pay for the push below)
  S.push = 0.0;
#if AM_LOD < 2
  for (int i = 0; i < AM_PUSH; i++) {
    vec4 q = uAmPush[i];
    if (q.w > 0.0 && length(q.xz - P) < S.L + q.w && q.y > S.base.y - q.w) S.push = 1.0;
  }
#endif
  return S;
}

struct AmLeaf {
  float L, h, age, splayK, layer, meander, mPhase, fl;
  vec2 splay, fallDir, flDir;
};

AmLeaf amLeaf(AmShoot S, int slot) {
  AmLeaf B;
  B.h = amHash(S.seed * 131.0 + float(slot) * 7.13);
  float h2 = amHash(B.h * 77.0 + 1.3), h3 = amHash(B.h * 59.0 + 4.1);
  B.L = S.L * clamp(AM_REL[slot] + AM_REL_VAR[slot] * (B.h * 2.0 - 1.0), 0.25, 1.05);
  B.L = max(B.L, S.hs + 0.06);
  B.age = clamp(AM_AGE[slot] * 0.75 + S.age * 0.35 + (h2 - 0.5) * 0.2, 0.0, 1.0);
  float side = AM_SIDE[slot];
  // leaves alternate to either side of the flattened shoot (distichous), the outer ones splayed wider
  B.splay = S.fan * (side == 0.0 ? (h2 - 0.5) : side) + vec2(-S.fan.y, S.fan.x) * ((h3 - 0.5) * 1.1);
  B.splayK = AM_SPLAY[slot] * (0.7 + 0.6 * h2);
  // at low water the blades of a shoot lie combed the same way, fanned only a little
  B.fallDir = amRot(S.fallDir, side * (0.1 + AM_SPLAY[slot] * 0.5) + (h3 - 0.5) * 0.35);
  B.layer = 0.0012 + 0.0011 * float(slot) + 0.0025 * aShootC.w;
  B.meander = 0.1 + 0.22 * h3;
  B.mPhase = h2 * 6.2832;
  B.flDir = amRot(S.fan, 1.5708 + (h3 - 0.5));
  B.fl = 3.8 + 2.5 * h2;
  return B;
}

AmLeaf amSheathLeaf(AmShoot S) {
  AmLeaf B;
  B.L = S.L; B.h = 0.5; B.age = 0.0; B.splayK = 0.0; B.layer = 0.0; B.meander = 0.0; B.mPhase = 0.0; B.fl = 0.0;
  B.splay = vec2(0.0); B.fallDir = S.fallDir; B.flDir = vec2(0.0);
  return B;
}

// orbital velocity of the waves at the shoot, delayed by 'lag' (rad)
vec2 amWaveFlow(AmShoot S, float lag) {
  float c = cos(lag), s = sin(lag);
  vec3 v = S.ws * c - S.wc * s;
  vec2 u = S.d0 * (AM_WAVE_AMP.x * v.x) + S.d1 * (AM_WAVE_AMP.y * v.y);
#if AM_LOD < 2
  u += S.d2 * (AM_WAVE_AMP.z * v.z);
#endif
  return u * (uAmWave.z * S.gust * S.sway);
}

// the leaves swept aside by an animal swimming through them: a lean away from it wherever the blade passes within its
// reach (the step's start point is gAmP), so the blade bends round the body and goes on above it
vec2 amPush(AmShoot S) {
  vec3 c = S.base + gAmP;
  vec2 acc = vec2(0.0);
  for (int i = 0; i < AM_PUSH; i++) {
    vec4 q = uAmPush[i];
    if (q.w <= 0.0) continue;
    vec3 d = c - q.xyz;
    float w = 1.0 - smoothstep(0.35 * q.w, q.w, length(d));
    if (w <= 0.0) continue;
    vec2 h = d.xz + 1e-4 * S.fan;
    acc += normalize(h) * w * 1.6;
  }
  return acc;
}

// unit tangent of the centreline at arc length s (m); D: its horizontal direction; lw: 0 inside the sheath, 1 on the free blade
vec3 amTangent(AmShoot S, AmLeaf B, float s, float lw, out vec2 D) {
  float uL = s / B.L;
  // stiff in the sheath, then the flexible blade takes the bend over a short length beyond it
  float g = 0.22 * smoothstep(0.0, S.hs, s) + 0.78 * (1.0 - exp(-max(s - 0.6 * S.hs, 0.0) / AM_BEND_LEN));
  vec2 V = S.flowC + amWaveFlow(S, AM_TIP_LAG * s / S.L);
  // buoyant blades arch out of the fan; in shallow water they stand straighter
  float arch = smoothstep(S.hs * 0.8, B.L, s);
  vec2 H = S.tilt + B.splay * (B.splayK * (0.6 + 2.2 * arch) * (0.55 + 0.45 * S.deep) * lw) + V * (AM_BEND * g);
#if AM_LOD < 2
  if (S.push > 0.5) H += amPush(S) * lw;
#endif
  // pressed over by shallow water: the sheath (the free blade beyond it floats along the surface by itself)
  H += S.fallDir * (S.leanM * (1.0 - lw));
#if AM_LOD == 0
  // flutter: a quick ripple running down the free end
  H += B.flDir * (0.07 * uL * uL * sin(uAmTime * B.fl - 9.0 * uL + B.mPhase) * (S.sway + 0.12) * lw);
#endif
  float cap = AM_MAX_WET;
  if (S.fall > 0.001) {
    // the water has gone: the blade falls over and lies along the sand in loose S-bends
    vec2 fd = amRot(mix(S.fallDir, B.fallDir, lw), B.meander * sin(uL * 7.0 + B.mPhase) * lw);
    vec2 Hf = fd * (2.2 + 3.2 * smoothstep(S.hs * 0.3, S.hs * 1.2, s));
    H = mix(H, Hf, S.fall);
    cap = mix(AM_MAX_WET, AM_MAX_DRY, S.fall);
  }
  float m = length(H);
  D = m > 1e-4 ? H / m : S.fan;
  float th = cap * (1.0 - exp(-m / cap));
  return vec3(D.x * sin(th), cos(th), D.y * sin(th));
}

// one step of the centreline from p along T for 'len', held under the water surface and above the sand (the
// surface read where the step ends: a blade afloat rises and falls with the surf along its length)
vec3 amStep(AmShoot S, vec3 p, vec3 T, vec2 D, float len, float ceilY, bool wet, float layer, inout float flatF) {
  vec3 d = T * len;
  vec3 q = p + d;
  flatF = 0.0;
  float c = wet ? ceilY + amSurfEta(S, q.xz) : 1e3;
  if (q.y > c) {
    float a = d.y > 1e-6 ? clamp((c - p.y) / d.y, 0.0, 1.0) : 0.0;
    q = p + d * a;
    q.xz += D * (len * (1.0 - a));
    // (the surface where the step really ends, across a steep front too)
    q.y = ceilY + amSurfEta(S, q.xz);
    flatF = 1.0;
  }
  float fq = dot(S.grad, q.xz) + layer;
  if (q.y < fq) {
    float fp = dot(S.grad, p.xz) + layer;
    float above = max(p.y - fp, 0.0);
    float a = clamp(above / max(above + (fq - q.y), 1e-6), 0.0, 1.0);
    vec3 qa = p + (q - p) * a;
    qa.xz += D * (len * (1.0 - a));
    qa.y = dot(S.grad, qa.xz) + layer;
    q = qa;
    flatF = 1.0;
  }
  return q;
}
`;

/** Leaf blade: position and normal of this vertex (relative to the shoot's base, world-aligned). */
export const AM_LEAF_DEFORM = /* glsl */ `
void amDeform(out vec3 amPos, out vec3 amNrm) {
  AmShoot S = amShoot();
  int slot = int(aLeaf.z + 0.5);
  int kv = int(aLeaf.x + 0.5);
  float v = aLeaf.y;
  vAmD = vec4(S.fall, aShootC.y, S.base.y, 0.0);
  if (float(slot) > aShootA.z - 0.5) {
    // this shoot has fewer leaves: fold the slot away
    amPos = vec3(0.0, -0.05, 0.0); amNrm = vec3(0.0, 1.0, 0.0);
    vAmA = vec4(0.0); vAmB = vec4(0.0); vAmC = vec4(1.0, 0.1, -10.0, 0.0);
    return;
  }
  AmLeaf B = amLeaf(S, slot);
  // the blade starts at the mouth of the sheath (far tiers have no sheath: from the sand)
#if AM_LOD < 2
  float s0 = 0.85 * S.hs;
#else
  float s0 = 0.0;
#endif
  float ds = (B.L - s0) / float(AM_NSEG);
  bool wet = S.depth > 0.01;
  float ceilY = S.ceilY - 0.0015 * B.h;
  vec3 p = vec3(0.0);
  vec2 D;
  float flatF = 0.0;
  for (int k = 0; k <= AM_NSEG; k++) {
    if (k > kv) break;
    float sa = k == 0 ? 0.0 : s0 + float(k - 1) * ds;
    float len = k == 0 ? s0 : ds;
    if (len <= 0.0) continue;
    float sm = sa + 0.5 * len;
    float lw = smoothstep(S.hs * 0.7, S.hs * 1.3, sm);
    gAmP = p;
    vec3 T = amTangent(S, B, sm, lw, D);
    p = amStep(S, p, T, D, len, ceilY, wet, B.layer * lw, flatF);
  }
  float sv = s0 + float(kv) * ds;
  float lwv = smoothstep(S.hs * 0.7, S.hs * 1.3, sv);
  vec2 Dv;
  gAmP = p;
  vec3 Tv = amTangent(S, B, sv, lwv, Dv);
  if (flatF > 0.5) Tv = normalize(vec3(Dv.x, dot(S.grad, Dv), Dv.y));
  // the ribbon's width lies across the bend (its easy way), turned a little round the centreline: blades twist
  vec3 W0 = vec3(-Dv.y, 0.0, Dv.x);
  float uB = float(kv) / float(AM_NSEG);
  float roll = (B.h - 0.5) * 1.4 * sin(uB * 3.9 + B.mPhase) * (1.0 - 0.85 * flatF);
#if AM_LOD == 0
  roll += 0.25 * sin(uAmTime * 1.7 + uB * 5.0 + B.mPhase) * S.sway * (1.0 - flatF);
#endif
  vec3 W = W0 * cos(roll) + cross(Tv, W0) * sin(roll);
  vec3 Nf = normalize(cross(W, Tv));
  float hw = 0.5 * S.width * (0.85 + 0.3 * B.h) * (slot == 3 ? 0.8 : 1.0);
#if AM_ACROSS == 3
  float cup = AM_CUP * (1.0 - 0.8 * flatF);
#else
  float cup = 0.0;
#endif
  amPos = p + W * (v * hw) + Nf * (cup * (v * v - 0.33) * hw);
  amNrm = normalize(Nf - W * (2.0 * cup * v));
  vAmA = vec4(uB, v, B.L - sv, sv);
  vAmB = vec4(float(slot), B.h, B.age, hw);
  vAmC = vec4(B.L, S.hs, S.depth + S.base.y + amSurfEta(S, p.xz), S.seed);
}
`;

/** Sheath (Base): a flattened tube round the shoot's axis, from just under the sand to the mouth the blades leave. */
export const AM_SHEATH_DEFORM = /* glsl */ `
void amDeform(out vec3 amPos, out vec3 amNrm) {
  AmShoot S = amShoot();
  AmLeaf B = amSheathLeaf(S);
  int kv = int(aRing.x + 0.5);
  float ang = aRing.y;
  float ds = S.hs / float(AM_NRING);
  vec3 p = vec3(0.0);
  vec2 D;
  float flatF = 0.0;
  for (int k = 0; k < AM_NRING; k++) {
    if (k >= kv) break;
    float sm = (float(k) + 0.5) * ds;
    vec3 T = amTangent(S, B, sm, 0.0, D);
    p = amStep(S, p, T, D, ds, S.ceilY, S.depth > 0.01, 0.0, flatF);
  }
  float sv = float(kv) * ds;
  vec2 Dv;
  vec3 Tv = amTangent(S, B, sv, 0.0, Dv);
  if (flatF > 0.5) Tv = normalize(vec3(Dv.x, dot(S.grad, Dv), Dv.y));
  vec3 W = vec3(-Dv.y, 0.0, Dv.x);
  vec3 Nf = normalize(cross(W, Tv));
  // flared and fibrous at the foot (old sheaths decaying), tapering a little to the mouth
  float foot = 1.0 - smoothstep(0.0, 0.025, sv);
  float A = S.width * (0.6 + 0.3 * foot) * (1.0 - 0.12 * sv / S.hs);
  float Bm = 0.0016 + S.width * (0.17 + 0.25 * foot);
  amPos = p + W * (cos(ang) * A) + Nf * (sin(ang) * Bm);
  if (kv == 0) amPos.y -= 0.015;
  amNrm = normalize(W * (cos(ang) / A) + Nf * (sin(ang) / Bm));
  vAmA = vec4(ang / 6.2832, cos(ang), S.hs - sv, sv);
  vAmB = vec4(-1.0, S.seed, S.age, A);
  vAmC = vec4(S.hs, S.hs, S.depth + S.base.y + amSurfEta(S, p.xz), S.seed);
  vAmD = vec4(S.fall, aShootC.y, S.base.y, 0.0);
}
`;

export const AM_FRAG_COMMON = /* glsl */ `
${GLSL_PARAMS}
varying vec4 vAmA;
varying vec4 vAmB;
varying vec4 vAmC;
varying vec4 vAmD;
varying vec3 vAmW;
vec3 gAmTrans = vec3(0.0);
float gAmRough = 0.5;
float amHashF(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float amNoiseF(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(amHashF(i), amHashF(i + vec2(1.0, 0.0)), f.x), mix(amHashF(i + vec2(0.0, 1.0)), amHashF(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/** Leaf surface: colour, outline (rounded or broken tip, nibbled edges), translucency and wetness. */
export const AM_LEAF_COLOR = /* glsl */ `
{
  float amU = vAmA.x, amV = vAmA.y, amTip = vAmA.z, amS = vAmA.w;
  float amHw = vAmB.w, amH = vAmB.y, amAge = vAmB.z;
  float h2 = fract(amH * 13.7), h3 = fract(amH * 71.3), h4 = fract(amH * 37.9);
  float fwS = fwidth(amS) + 1e-6;
  float fwV = fwidth(amV) + 1e-6;
  // young blades a bright yellow-green, mature ones deep green, the oldest olive (linear sRGB)
  vec3 col = mix(vec3(0.21, 0.38, 0.045), vec3(0.085, 0.2, 0.03), smoothstep(0.05, 0.5, amAge));
  col = mix(col, vec3(0.095, 0.12, 0.032), smoothstep(0.6, 1.0, amAge));
  // shoot to shoot: lighter or darker, yellower or bluer
  float sv = fract(vAmC.w * 17.3);
  col *= 0.8 + 0.4 * sv;
  col.r *= 0.82 + 0.36 * fract(vAmC.w * 7.1);
  col *= 0.9 + 0.2 * amNoiseF(vec2(amS * 3.0, amH * 10.0));
  // just out of the sheath the tissue is young and pale
  float baseZone = 1.0 - smoothstep(0.0, 0.07 + 0.05 * h2, amS - vAmC.y);
  col = mix(col, vec3(0.27, 0.3, 0.12), baseZone * 0.65);
  float lattice = 0.0;
#if AM_LOD < 2
  // parallel veins and the paler midrib
  float nv = 5.0 + 2.0 * floor(h3 * 3.0);
  float vp = (amV * 0.5 + 0.5) * (nv - 1.0);
  float veinFade = 1.0 - smoothstep(0.25, 0.6, fwV * (nv - 1.0));
  float vein = 1.0 - smoothstep(0.0, 0.18, abs(fract(vp + 0.5) - 0.5));
  col *= 1.0 - 0.12 * vein * veinFade;
  col = mix(col, col * 1.3 + vec3(0.01, 0.012, 0.0), (1.0 - smoothstep(0.0, 0.12, abs(amV))) * 0.35 * veinFade);
#endif
#if AM_LOD == 0
  // cross-veins over the air channels: short bars, offset channel to channel (the lattice seen against the light)
  float row = amS / AM_XVEIN + fract(floor(vp) * 0.618 + amH * 3.1);
  float rowD = abs(fract(row + 0.5) - 0.5);
  float fwR = fwS / AM_XVEIN;
  lattice = (1.0 - smoothstep(0.04, 0.04 + fwR, rowD)) * (1.0 - smoothstep(0.15, 0.4, fwR));
  col *= 1.0 - 0.08 * lattice;
#endif
  // epiphytes: a dusting of diatoms and silt, patchy, thicker toward the tip and on old blades
  float epiN = amNoiseF(vec2(amS * 9.0 + h2 * 20.0, amV * 1.3 + amH * 7.0));
  float epi = smoothstep(0.35, 0.95, amU * 0.8 + amAge * 0.55 - 0.35 + (epiN - 0.5) * 0.7) * (0.2 + 0.8 * amAge);
  col = mix(col, vec3(0.095, 0.08, 0.04), epi * 0.6);
#if AM_LOD == 0
  float speck = step(0.93, amHashF(floor(vec2(amS * 900.0, amV * amHw * 900.0)))) * epi * (1.0 - smoothstep(0.0003, 0.0009, fwS));
  col = mix(col, vec3(0.16, 0.13, 0.08), speck * 0.6);
#endif
  // the tip dies back first: brown and bleached on older blades
  float tipLen = (0.01 + 0.2 * amAge * amAge) * (0.5 + h4);
  float senN = amNoiseF(vec2(amV * 2.0 + amH * 30.0, amS * 25.0)) - 0.5;
  float sen = (1.0 - smoothstep(tipLen * 0.5, tipLen * 1.3, amTip + senN * 0.03)) * step(0.3, amAge);
  vec3 brown = mix(vec3(0.15, 0.1, 0.035), vec3(0.05, 0.032, 0.014), smoothstep(0.3, 0.8, amNoiseF(vec2(amS * 14.0, h2 * 9.0))));
  col = mix(col, brown, sen);
  float lesion = 0.0;
#if AM_LOD < 2
  // dark lesions stretched along the blade (wasting disease), on older leaves
  float cellS = 0.035;
  float ci = floor(amS / cellS);
  if (amHashF(vec2(ci, amH * 97.0)) < 0.3 * amAge * amAge * amAge * step(0.5, h4)) {
    float lc = (ci + 0.2 + 0.6 * amHashF(vec2(ci, amH * 13.0))) * cellS;
    float lv = (amHashF(vec2(ci, amH * 29.0)) - 0.5) * 1.4;
    float ll = cellS * (0.15 + 0.5 * amHashF(vec2(ci, amH * 41.0)));
    float lwd = 0.15 + 0.35 * amHashF(vec2(ci, amH * 53.0));
    float e = length(vec2((amS - lc) / ll, (amV - lv) / lwd));
    lesion = 1.0 - smoothstep(0.7, 1.0, e + (amNoiseF(vec2(amS * 300.0, amV * 6.0)) - 0.5) * 0.3);
    col = mix(col, vec3(0.022, 0.016, 0.009), lesion * 0.9);
  }
  // pale flecks where the tissue is bleached (rare)
  float fl = amNoiseF(vec2(amS * 60.0 + amH * 9.0, amV * 2.5));
  col = mix(col, vec3(0.3, 0.32, 0.16), smoothstep(0.86, 0.95, fl) * step(0.7, h3) * 0.6);
#endif
  // the outline: an obtuse rounded tip; old blades often broken off square and ragged, with nibbled edges
  float across = abs(amV) * amHw;
  float broken = step(0.5, amAge) * step(0.45, h2);
  float sd = amHw - length(vec2(across, max(amHw - amTip, 0.0)));
  float rag = (amNoiseF(vec2(amV * 4.0 + amH * 40.0, 0.5)) - 0.5) * amHw * 1.5 + (amNoiseF(vec2(amV * 17.0, h3 * 30.0)) - 0.5) * amHw * 0.6;
  float cut = amTip - amHw * 0.8 + rag;
  sd = mix(sd, cut, broken);
  col = mix(col, brown * 0.8, broken * (1.0 - smoothstep(0.0, 0.008, cut)));
#if AM_LOD < 2
  if (amAge > 0.6) {
    float ns = 0.012;
    float nc = floor(amS / ns);
    float nh = amHashF(vec2(nc, amH * 11.0 + sign(amV)));
    float dn = step(0.8, nh) * amHw * (0.25 + 0.5 * fract(nh * 9.1)) * smoothstep(0.6, 1.0, amAge);
    if (dn > 0.0) {
      float nd = length(vec2((amS - (nc + 0.5) * ns) / (ns * 0.35), (amHw - across) / dn));
      sd = min(sd, (nd - 1.0) * min(dn, ns * 0.35));
    }
  }
#endif
  diffuseColor.a = clamp(0.5 + sd / (fwidth(sd) + 1e-7), 0.0, 1.0);
  // light coming through the blade: yellow-green, dimmed by the film, the dead tip and the lesions; the air
  // channels' cross-walls show as a fine lattice against the light
  vec3 trans = vec3(0.3, 0.52, 0.06) * (0.75 + 0.5 * sv);
  trans = mix(trans, vec3(0.34, 0.4, 0.1), baseZone * 0.5);
  trans *= (1.0 - 0.6 * epi) * (1.0 - 0.85 * sen) * (1.0 - lesion) * (1.0 - 0.35 * lattice);
  gAmTrans = trans * 0.55;
  // deep in a dense clump, near the sand, less light gets in
  float above = vAmW.y - vAmD.z;
  float ao = mix(mix(0.5, 0.72, vAmD.y), 1.0, smoothstep(0.0, 0.25, above));
  ao = mix(ao, 1.0, vAmD.x);
  // out of the water it is still wet: darker, glossy, a little silt where it lies on the sand
  float dry = smoothstep(vAmC.z + 0.001, vAmC.z + 0.006, vAmW.y);
  float silt = dry * vAmD.x * smoothstep(0.55, 0.8, amNoiseF(vec2(amS * 7.0, amH * 20.0 + amV)));
  col = mix(col, vec3(0.12, 0.1, 0.075), silt * 0.25);
  col *= mix(1.0, 0.86, dry);
  diffuseColor.rgb = col * ao;
  gAmTrans *= ao;
  gAmRough = mix(0.5, 0.34 + 0.12 * amNoiseF(vec2(amS * 20.0, amV + amH * 5.0)), dry);
}
`;

/** Sheath surface: pale, striated, with the brown fibres of old sheaths at the foot. */
export const AM_SHEATH_COLOR = /* glsl */ `
{
  float t = vAmA.w / max(vAmC.y, 1e-3);
  float fib = amNoiseF(vec2(vAmA.x * 60.0, vAmA.w * 40.0));
  float stri = amNoiseF(vec2(vAmA.x * 90.0, vAmC.w * 50.0));
  vec3 col = mix(vec3(0.36, 0.35, 0.23), vec3(0.24, 0.3, 0.12), smoothstep(0.15, 0.6, t));
  col = mix(col, vec3(0.13, 0.24, 0.05), smoothstep(0.55, 1.0, t));
  // the frayed brown remains of old sheaths, in patches round the foot
  float dead = (1.0 - smoothstep(0.08, 0.35, t + (fib - 0.5) * 0.25)) * smoothstep(0.45, 0.7, amNoiseF(vec2(vAmA.x * 7.0, vAmC.w * 31.0)));
  col = mix(col, vec3(0.16, 0.11, 0.055) * (0.7 + 0.6 * fib), dead);
  col *= 0.88 + 0.24 * stri;
  float dry = smoothstep(vAmC.z + 0.001, vAmC.z + 0.006, vAmW.y);
  // out of the water the foot is smeared with silt
  col = mix(col, vec3(0.2, 0.18, 0.14), dry * (1.0 - smoothstep(0.2, 0.7, t)) * 0.5);
  col *= mix(1.0, 0.85, dry);
  float ao = mix(mix(0.7, 0.85, vAmD.y), 1.0, smoothstep(0.0, 0.1, vAmW.y - vAmD.z));
  diffuseColor.rgb = col * ao;
  gAmTrans = vec3(0.22, 0.28, 0.1) * 0.35 * ao * smoothstep(0.15, 0.5, t);
  gAmRough = mix(0.55, 0.3, dry);
}
`;

/** Thin-leaf transmission: the light reaching the far face comes through, so backlit blades glow. */
export const AM_LIGHT_PARS = /* glsl */ `
void RE_Direct_Amamo(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  float back = saturate(-dot(geometryNormal, directLight.direction));
  // forward scattering: looking toward the light through the blade
  float fwd = pow(saturate(dot(-geometryViewDir, directLight.direction)), 4.0);
  reflectedLight.directDiffuse += directLight.color * gAmTrans * (back * (0.7 + 1.3 * fwd));
}
#undef RE_Direct
#define RE_Direct RE_Direct_Amamo
`;

export const AM_LIGHT_END = /* glsl */ `
#if NUM_HEMI_LIGHTS > 0
for (int i = 0; i < NUM_HEMI_LIGHTS; i++) reflectedLight.indirectDiffuse += gAmTrans * 0.5 * getHemisphereLightIrradiance(hemisphereLights[i], -geometryNormal);
#endif
`;
