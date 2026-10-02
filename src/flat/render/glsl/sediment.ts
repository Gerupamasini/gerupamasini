/**
 * The sediment surface, procedurally, from the baked fields (see gen/generate.ts).
 *
 * Ripple marks are phasor noise (Tricard et al., "Procedural Phasor Noise", 2019): Gabor kernels scattered at
 * random, each oscillating along the local wave vector from the baked field (with a little jitter), summed as
 * complex phasors. The phase of the sum is a stripe field that bends with the field; where the kernels disagree its
 * amplitude vanishes and the phase is singular, which draws exactly the forks, terminations and crest joins of real
 * ripples — at random places, never in a repeating pattern. The profile turns the phase into height: trochoidal
 * wave ripples, current ripples with a steep lee face, aeolian ripples, crests planed flat by the last swash.
 * A second, finer set crosses the troughs in places (interference / ladder-back ripples), and megaripples carry
 * the whole field up close as real geometry.
 *
 * Up close the ripples get parallax and self-shadowing along the local ripple direction (the field is locally
 * one-dimensional, so both are a short march over the profile, not over the noise).
 */
export const SEDIMENT_GLSL = /* glsl */ `
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// Phasor noise: vec4(phase, dphase/dx, dphase/dz, normalised contrast 0…~1.5)
vec4 phasor(vec2 p, vec2 kdir, float lam, float cellK, float seed, float jitA, float jitF) {
  float kf = TAU / lam;
  float C = lam * cellK;
  float a2 = 3.0 / (C * C);
  vec2 cell = floor(p / C);
  vec2 S = vec2(0.0), dSx = vec2(0.0), dSz = vec2(0.0);
  float g2 = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j));
    for (int m = 0; m < 2; m++) {
      vec4 h = hash24(c + vec2(float(m) * 7919.0 + seed, seed * 3.0));
      vec2 xi = (c + h.xy) * C;
      vec2 d = p - xi;
      float g = exp(-a2 * dot(d, d));
      if (g < 0.003) continue;
      float an = (h.z - 0.5) * jitA;
      vec2 kd = vec2(kdir.x * cos(an) - kdir.y * sin(an), kdir.x * sin(an) + kdir.y * cos(an));
      vec2 kv = kd * kf * (1.0 + (h.w - 0.5) * jitF);
      float th = dot(kv, d) + h.w * 43.0;
      float cs = cos(th), sn = sin(th);
      S += g * vec2(cs, sn);
      vec2 gg = -2.0 * a2 * d * g;
      dSx += vec2(gg.x * cs - g * sn * kv.x, gg.x * sn + g * cs * kv.x);
      dSz += vec2(gg.y * cs - g * sn * kv.y, gg.y * sn + g * cs * kv.y);
      g2 += g * g;
    }
  }
  float m2 = dot(S, S) + 1e-12;
  vec2 dphi = vec2(S.x * dSx.y - S.y * dSx.x, S.x * dSz.y - S.y * dSz.x) / m2;
  return vec4(atan(S.y, S.x), dphi, sqrt(m2 / max(g2, 1e-9)));
}

// ripple profile for a phase: 1 at the crest, -1 in the trough. asym leans the crest downstream (steep lee face),
// sharp gives trochoidal crests and flat troughs, cap planes the crests off (late-stage drainage, swash)
float ripProfile(float ph, float asym, float sharp, float cap, out float dP) {
  float b = asym * 0.62;
  float u = ph + b * cos(ph);
  float du = 1.0 - b * sin(ph);
  float P = (cos(u) + sharp * cos(2.0 * u)) / (1.0 + sharp);
  dP = (-sin(u) - 2.0 * sharp * sin(2.0 * u)) * du / (1.0 + sharp);
  if (P > cap) {
    // smooth plateau
    float k = 0.12;
    float e = P - cap;
    float s = e / (e + k);
    P = cap + e * (1.0 - s) * 0.35;
    dP *= (1.0 - s) * 0.35 + 0.02;
  }
  return P;
}

struct Ripples {
  float h;        // height (m) about the mean surface
  vec2 grad;      // dh/dx, dh/dz
  float phase;
  vec2 gphi;      // phase gradient (local wave vector)
  float amp;      // half height (m)
  float asym, sharp, cap;
  float crest;    // 0 trough … 1 crest (for colour)
  float inter;    // interference set amount here
};

// the small ripple field at p; detail fades it out once a ripple is smaller than a few pixels
Ripples ripplesAt(vec2 p, vec2 kdir, float lam, float ampF, float asym, float lod) {
  Ripples r;
  r.h = 0.0; r.grad = vec2(0.0); r.phase = 0.0; r.gphi = kdir * TAU / lam; r.amp = 0.0; r.asym = asym; r.sharp = 0.2; r.cap = 1.0; r.crest = 0.5; r.inter = 0.0;
  if (ampF < 0.01 || lod <= 0.0) return r;
  vec4 nz = vnoise4(p * 0.31 + 41.0);
  vec4 nz2 = vnoise4(p * 1.7 - 13.0);
  // orientation jitter and defect density vary in patches: some ripple fields are straight and regular, some
  // wander and fork every few wavelengths
  float jit = mix(0.12, 0.55, smoothstep(0.3, 0.8, nz.x));
  vec4 R = phasor(p, kdir, lam, 2.4, 1.0, jit, 0.12 + 0.12 * nz.y);
  float contrast = smoothstep(0.08, 0.5, R.w);
  // ripple index (wavelength / height): wave ripples ~6–7, current ripples ~8–10, wind (dry) ripples ~18
  float index = mix(6.5, 9.5, asym);
  float A = ampF * lam / (2.0 * index) * contrast * (0.7 + 0.6 * nz.z) * lod;
  r.sharp = mix(0.1, 0.32, nz2.x);
  r.cap = mix(1.0, 0.25, smoothstep(0.6, 0.78, fbm(p * 0.24 + 61.0, 3)));
  float dP;
  float P = ripProfile(R.x, asym, r.sharp, r.cap, dP);
  r.h = A * P;
  r.grad = A * dP * R.yz;
  r.phase = R.x;
  r.gphi = R.yz;
  r.amp = A;
  r.crest = P * 0.5 + 0.5;
  // interference ripples: a finer set at a large angle, in the troughs only, in patches near standing water
  float inter = smoothstep(0.6, 0.76, fbm(p * 0.09 + 77.0, 3)) * (1.0 - asym * 0.7);
  if (inter > 0.01) {
    vec2 k2 = rot2(1.35 + 0.5 * (nz2.y - 0.5)) * kdir;
    vec4 R2 = phasor(p, k2, lam * 0.62, 2.0, 9.0, 0.25, 0.15);
    float dP2;
    float P2 = ripProfile(R2.x, 0.1, 0.15, 1.0, dP2);
    float inTrough = 1.0 - smoothstep(-0.55, 0.25, P);
    float A2 = A * 0.42 * inter * smoothstep(0.08, 0.5, R2.w);
    r.h += A2 * P2 * inTrough;
    r.grad += A2 * dP2 * R2.yz * inTrough;
    r.inter = inter * inTrough;
  }
  return r;
}

// megaripple amplitude: the creeks' and lower flat's sand waves (baked), and low, patchy ones on any sand
float megaAmpAt(vec2 p, float baked, float mud) {
  float low = (1.0 - smoothstep(0.25, 0.6, mud)) * 0.32 * smoothstep(0.42, 0.62, fbm(p * 0.03 + 31.0, 3));
  return max(baked, low);
}
// megaripples (sand waves, 0.6–1.5 m): (height, dh/dx, dh/dz)
vec3 megaAt(vec2 p, vec2 kdir, float amp) {
  if (amp < 0.01) return vec3(0.0);
  vec4 nn = vnoise4(p * 0.045 + 7.0);
  float lam = 0.65 + 0.75 * nn.x;
  vec2 kd = rot2((nn.y - 0.5) * 1.1) * kdir;
  vec4 R = phasor(p, kd, lam, 2.2, 19.0, 0.35, 0.18);
  float dP;
  float P = ripProfile(R.x, 0.55, 0.12, 1.0, dP);
  // linguoid: the height swells and fades along each crest
  float lobe = 0.55 + 0.45 * vnoise(p * (0.9 / lam) + 17.0);
  float A = amp * 0.028 * (0.6 + 0.8 * nn.z) * smoothstep(0.08, 0.5, R.w) * lobe;
  return vec3(A * P, A * dP * R.yz);
}

// Parallax along the local ripple direction: march the view ray down through the ripple layer and return the
// phase where it first meets the surface (V: unit vector toward the eye).
float ripplePOM(Ripples r, vec3 V, out float shiftS) {
  shiftS = 0.0;
  float km = length(r.gphi);
  if (r.amp < 1e-5 || km < 1e-3) return r.phase;
  vec2 kh = r.gphi / km;
  float vh = length(V.xz);
  if (vh < 1e-4) return r.phase;
  float tanE = max(V.y, 0.015) / vh;
  float vk = dot(V.xz, kh) / vh;          // phase advance per metre along the ray's horizontal track
  float sTop = r.amp / tanE;              // horizontal distance where the ray is at the crest height
  // never march more than ~2 ripples: by then the ray is far above the crests or in them
  float span = min(2.0 * sTop, 2.0 * TAU / max(km * abs(vk), 1e-3));
  float s0 = min(sTop, span * 0.5);
  float prevS = s0, prevD = 1.0;
  float dP;
  const int N = 14;
  for (int i = 0; i <= N; i++) {
    float s = s0 - span * float(i) / float(N);
    float yr = s * tanE;
    float ph = r.phase + km * vk * s;
    float hs = r.amp * ripProfile(ph, r.asym, r.sharp, r.cap, dP);
    float d = yr - hs;
    if (d <= 0.0) {
      // refine between the last two samples
      float a = prevS, b = s;
      for (int k = 0; k < 4; k++) {
        float m = 0.5 * (a + b);
        float hm = r.amp * ripProfile(r.phase + km * vk * m, r.asym, r.sharp, r.cap, dP);
        if (m * tanE - hm > 0.0) a = m; else b = m;
      }
      shiftS = 0.5 * (a + b);
      return r.phase + km * vk * shiftS;
    }
    prevS = s; prevD = d;
  }
  shiftS = s0 - span;
  return r.phase + km * vk * shiftS;
}

// sunlight reaching the visible point of the ripple (soft self-shadow from the next crest toward the sun)
float rippleShadow(Ripples r, float ph, float h0, vec3 L) {
  float km = length(r.gphi);
  if (r.amp < 1e-5 || km < 1e-3) return 1.0;
  vec2 kh = r.gphi / km;
  float lh = length(L.xz);
  if (lh < 1e-3) return 1.0;
  float tanL = L.y / lh;
  float lk = dot(L.xz, kh) / lh;
  float sMax = min((r.amp - h0) / max(tanL, 1e-3), 1.6 * TAU / max(km * abs(lk), 1e-3));
  if (sMax <= 0.0) return 1.0;
  float vis = 1.0;
  float dP;
  const int N = 8;
  for (int i = 1; i <= N; i++) {
    float s = sMax * float(i) / float(N);
    float hs = r.amp * ripProfile(ph + km * lk * s, r.asym, r.sharp, r.cap, dP);
    float above = h0 + s * tanL - hs;
    // penumbra: the sun is 0.53° wide and the light is softened by the haze and the thin clouds
    vis = min(vis, sat(above / (s * 0.06 + 0.0004) + 0.5));
  }
  return vis;
}

// Grains, shell hash and pebbles on the sand: Voronoi cells at several sizes, faded by the pixel footprint.
// Returns albedo multiplier/replacement in col (rgb) and coverage in col.a; nrm: added slope; spec: glint mask.
struct Grains { float cover; vec2 nrm; float glint; float occl; };
vec3 cellNearest(vec2 p, out vec2 off, out vec2 id) {
  vec2 ip = floor(p), fp = fract(p);
  float best = 9.0, second = 9.0;
  off = vec2(0.0); id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(ip + g);
    vec2 r = g + o * 0.85 + 0.075 - fp;
    float d = dot(r, r);
    if (d < best) { second = best; best = d; id = ip + g; off = r; }
    else if (d < second) second = d;
  }
  return vec3(sqrt(best), sqrt(second), 0.0);
}
// composites the grains over alb (in place)
Grains grainsAt(vec2 p, float fw, float shell, float sand, float trough, inout vec3 alb) {
  Grains G; G.cover = 0.0; G.nrm = vec2(0.0); G.glint = 0.0; G.occl = 0.0;
  // coarse sand / fine gravel, 2.5 mm cells
  float det1 = 1.0 - smoothstep(0.0006, 0.0016, fw);
  if (det1 > 0.0) {
    vec2 o, id;
    vec3 c = cellNearest(p / 0.0026, o, id);
    vec4 h = hash24(id + 71.0);
    float r = 0.24 + 0.16 * h.x;
    float has = step(0.55 - 0.25 * trough, h.y) * sand;
    float disc = smoothstep(r, r - 0.08, c.x) * has * det1;
    vec3 tone = h.z > 0.93 ? vec3(0.08, 0.08, 0.085) : h.z > 0.78 ? vec3(0.72, 0.7, 0.66) : h.z > 0.66 ? vec3(0.55, 0.42, 0.33) : alb * (0.75 + 0.5 * h.w);
    alb = mix(alb, tone, disc); G.cover = max(G.cover, disc);
    G.nrm += -o / r * 0.8 * disc;
    G.glint += disc * step(0.78, h.z) * step(h.z, 0.93);
    G.occl += (smoothstep(r + 0.12, r, c.x) - smoothstep(r, r - 0.08, c.x)) * has * det1 * 0.25;
  }
  // shell hash: broken shell flakes 4–14 mm, flat, pale, angular; thick in the troughs and the strand line
  float det2 = 1.0 - smoothstep(0.002, 0.006, fw);
  if (det2 > 0.0 && shell > 0.02) {
    vec2 o, id;
    vec3 c = cellNearest(p / 0.011, o, id);
    vec4 h = hash24(id + 913.0);
    float dens = shell * (0.35 + 0.65 * trough);
    float has = step(1.0 - dens * 0.8, h.x);
    // angular flake: distance to the cell edge (F2 - F1) makes polygonal shards
    float edge = c.y - c.x;
    float shard = smoothstep(0.05, 0.16, edge) * smoothstep(0.62, 0.45, c.x) * has * det2;
    vec3 sc = h.y > 0.8 ? vec3(0.26, 0.29, 0.34) : h.y > 0.6 ? vec3(0.6, 0.55, 0.47) : vec3(0.78, 0.76, 0.72);
    sc *= 0.8 + 0.3 * h.z;
    alb = mix(alb, sc, shard); G.cover = max(G.cover, shard);
    G.nrm += (h.zw - 0.5) * 0.5 * shard;
    G.glint += shard * 0.6;
    G.occl += smoothstep(0.0, 0.06, edge) * (1.0 - smoothstep(0.06, 0.12, edge)) * has * det2 * 0.25;
  }
  // pebbles 1–3 cm, sparse, rounded, dark grey and brown
  float det3 = 1.0 - smoothstep(0.006, 0.02, fw);
  if (det3 > 0.0) {
    vec2 o, id;
    vec3 c = cellNearest(p / 0.07, o, id);
    vec4 h = hash24(id + 3301.0);
    float has = step(0.985 - 0.03 * shell - 0.02 * trough, h.x) * sand;
    float r = 0.12 + 0.18 * h.y;
    float peb = smoothstep(r, r - 0.04, c.x) * has * det3;
    vec3 pc = h.z > 0.5 ? vec3(0.13, 0.125, 0.12) : vec3(0.22, 0.17, 0.13);
    pc *= 0.75 + 0.5 * h.w;
    alb = mix(alb, pc, peb); G.cover = max(G.cover, peb);
    G.nrm += -o / r * 1.1 * peb;
    G.occl += (smoothstep(r + 0.07, r, c.x) - smoothstep(r, r - 0.04, c.x)) * has * det3 * 0.45;
  }
  return G;
}
`;
