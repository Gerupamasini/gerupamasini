import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, Vector4 } from 'three';

/** Small waves breaking on an open shore (走水). A sheltered flat (葛西) has none. */
export interface SurfParams {
  /** wave height arriving at the shore (m) */
  height: number;
  /** wave period (s) */
  period: number;
  /** the beach slope the crests' timing is reckoned on (rise per metre) */
  slope: number;
}

/** x: height (m), y: period (s), z: slope, w: 1 on / 0 off (one object shared by the water and the sand). */
export function surfUniform(p: SurfParams | null): { value: Vector4 } {
  return { value: p ? new Vector4(p.height, p.period, p.slope, 1) : new Vector4(0.1, 4, 0.05, 0) };
}

/**
 * GLSL: the surf as a function of the still-water depth D at a point (negative up the beach) and time, shared by the
 * water pass (the surface, its foam and the swash sheet) and the sand (wet where the swash has just been).
 *
 * After the reference coast scene: the crests travel at √(gD) over the shallows, so over a plane slope b a crest
 * needs 2√D / (b√g) to reach the waterline — they slow down and bunch up as the water shoals. Each wave has its own
 * height (in sets, uneven along the crest). Shoaling, it turns cnoidal (peaked crest, flat trough) and leans forward
 * until the front stands steep and its thin top lets the light through; it goes over where the depth is about its
 * height (breaker index ~1.05 for this slope and period), its top turning white, runs in as a small bore with a
 * foaming roller that shrinks with the depth, and ends as a thin swash sheet that climbs the beach, stops and drains
 * back. The water pass traces the view ray through this surface near the viewer, so the waves have real relief.
 */
export const SURF_GLSL = /* glsl */ `
uniform vec4 uSurf;
float surfHash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
float surfNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 57.0;
  return mix(mix(surfHash(n), surfHash(n + 1.0), f.x), mix(surfHash(n + 57.0), surfHash(n + 58.0), f.x), f.y);
}
// the wave phase in periods at depth D: the integer part numbers the wave, the fraction is the time since its crest
// passed. A crest reaches the waterline a travel time after it passes depth D, so further out it passes earlier (a gentle
// bend keeps the crests from lying exactly along the depth contours)
float surfPhase(vec2 p, float D, float t) {
  float travel = 2.0 * sqrt(max(D, 0.0)) / (uSurf.z * 3.1321);
  float bend = 0.10 * sin(p.x * 0.043 + p.y * 0.061) + 0.06 * sin(p.y * 0.137 - p.x * 0.05 + 1.3);
  return (t + travel) / uSurf.y + bend;
}
// wave n's height (m): random, in sets of about seven, and uneven along its crest — over tens of metres and over a few,
// so one stretch of a crest goes over while the next still stands
float surfHeight(float n, vec2 p) {
  return uSurf.x * (0.55 + 0.75 * surfHash(n * 1.37 + 0.5)) * (0.72 + 0.28 * sin(n * 0.9))
    * (0.75 + 0.5 * surfNoise(p * 0.06 + n * 3.1)) * (0.78 + 0.44 * surfNoise(p * 0.27 + n * 5.7));
}
// the swash front's height above the still water (m) at a point of the beach: it climbs fast, stops, drains back
// slower and draws down a little below the still level before the next bore comes in. y: 1 while climbing.
vec2 surfSwash(vec2 p, float t) {
  float ph = surfPhase(p, 0.0, t);
  float n = floor(ph), tau = ph - n;
  float R = 0.5 * surfHeight(n, p) * (0.45 + 1.1 * surfNoise(p * 0.22 + n * 1.7));
  float u = tau / 0.8;
  float shape = u < 0.35 ? sin(u / 0.35 * 1.5707963) : u < 1.0 ? 1.0 - pow((u - 0.35) / 0.65, 1.6) : 0.0;
  // a lacy front: the sheet runs further in some places than others
  float lace = (surfNoise(p * 1.3 + n * 5.3) - 0.5) * 0.5 + (surfNoise(p * 4.1 - n * 2.1) - 0.5) * 0.2;
  // and the sheet is never flat: a few millimetres of its own ripple, so where it thins the sand breaks through in patches
  float skin = 0.004 * (surfNoise(p * 9.0 + vec2(t * 0.6, n)) - 0.5);
  return vec2(R * (shape - 0.25 + lace * shape) + skin * shape, step(u, 0.35));
}
// The profile of a shoaling wave over one period, u = time since its crest passed (crest at 0 and 1). Waves over the
// shallows are cnoidal — narrow, peaked crests and long flat troughs (q) — and lean forward as they near breaking: the
// rise (u > b) takes a shrinking share of the period until the front stands steep. x: height about the period's mean,
// per unit crest-to-trough height; y: d/du; z: 0 in the trough .. 1 at the crest.
vec3 surfProfile(float u, float lean, float q) {
  float b = mix(0.5, 0.92, lean);
  float th = u < b ? 3.14159265 * u / b : 3.14159265 * (1.0 + (u - b) / (1.0 - b));
  float dth = u < b ? 3.14159265 / b : 3.14159265 / (1.0 - b);
  float c = 0.5 + 0.5 * cos(th);
  float cq = pow(c, q);
  float dcq = q * pow(max(c, 1e-4), q - 1.0) * (-0.5 * sin(th) * dth);
  return vec3(cq - 0.56 / sqrt(q + 0.25), dcq, cq);
}
// the number of the wave surfAt last looked at (so the foam's lace differs from one wave to the next)
float gSurfN = 0.0;
// x: the surface relative to the still level (m); y: foam (0..1); z: the surface slope seaward (dη/ds); w: the lip —
// the thin top of a steepening front, where the light comes through. For a point of depth D on a bed of slope 'slope'.
vec4 surfAt(vec2 p, float D, float t, float slope) {
  if (uSurf.w <= 0.0) return vec4(0.0);
  float ph = surfPhase(p, D, t);
  float n = floor(ph), u = ph - n;
  // the wave whose crest is nearest: the front face (late in the period) belongs to the crest coming next; across the
  // flat trough its height eases from one wave's to the next
  float nn = u > 0.5 ? n + 1.0 : n;
  gSurfN = nn;
  float H = mix(surfHeight(n, p), surfHeight(n + 1.0, p), smoothstep(0.35, 0.65, u));
  // it breaks where the depth is about its height: on a 1:20 beach with waves of a few seconds the breaker index is
  // near 1.05 (Weggel), well over the flat-bed 0.78, so these break close in, a few metres off the waterline
  float Db = H / 1.05;
  float c = sqrt(9.81 * max(D, 0.02));
  float du = slope / (uSurf.z * c * uSurf.y);   // du/ds: further out the crest passed longer ago
  // how far it has gone: 0 still whole, 1 broken (over a short stretch, so the collapse has no seam)
  float k = smoothstep(Db, 0.78 * Db, D);
  float eta = 0.0, deta = 0.0, foam = 0.0, lip = 0.0;
  if (k < 1.0) {
    // whole: shoaling (Green's law, bounded), the crest narrowing and the front steepening toward the break
    float near = smoothstep(3.0 * Db, Db, D);
    float A = H * clamp(pow(0.8 / max(D, 0.05), 0.25), 0.8, 1.25);
    vec3 pr = surfProfile(u, near, 1.0 + 1.2 * near);
    eta = A * pr.x; deta = A * pr.y;
    float onFront = step(mix(0.5, 0.92, near), u);
    lip = near * onFront * smoothstep(0.45, 0.95, pr.z);
    // as it tips over, the top turns white and the white spills a little way down the front: a narrow band, these
    // being small waves
    foam = smoothstep(1.2 * Db, Db, D) * smoothstep(mix(0.85, 0.55, onFront), 0.98, pr.z) * 0.95;
  }
  if (k > 0.0) {
    // broken: a small bore, its rolling front steep and white, its back sloping away, shrinking with the depth
    float Hb = mix(0.55 * max(D, 0.0), 0.85 * H, smoothstep(0.75 * Db, Db, D));
    float fr = 0.08, f, df;
    if (u < 1.0 - fr) { f = 1.0 - u / (1.0 - fr); df = -1.0 / (1.0 - fr); }
    else { float v = (u - (1.0 - fr)) / fr; f = v * v * (3.0 - 2.0 * v); df = 6.0 * v * (1.0 - v) / fr; }
    // the roller on the front and just behind it, then a thin trail of lace — a little foam, not a white sheet
    float bf = smoothstep(1.0 - fr - 0.03, 1.0, u) * 0.65 + exp(-u * 9.0) * 0.75 + 0.15 * exp(-u * 2.0);
    bf *= smoothstep(0.0, 0.05, D);
    eta = mix(eta, Hb * (f - 0.42), k);
    deta = mix(deta, Hb * df, k);
    foam = mix(foam, bf, k);
    lip *= 1.0 - k;
  }
  vec4 r = vec4(eta, foam, deta * du, lip);
  // the last of the bore becomes the swash: up the beach the surface is the swash sheet alone
  float sw = 1.0 - smoothstep(0.0, 0.6 * Db, D);
  if (sw > 0.0) {
    vec2 s = surfSwash(p, t);
    r.x = mix(r.x, s.x, sw);
    r.z *= 1.0 - sw;
    r.w *= 1.0 - sw;
    r.y = mix(r.y, 0.0, step(D, 0.0));
  }
  return r;
}
`;

/**
 * Tiling foam (after the reference coast's foam map, made less regular). R and G: the walls of Voronoi cells (F2 − F1)
 * at two sizes, the cells warped by a smooth noise and the walls broken in places, so the lace never reads as a net;
 * B: bubble rims of many sizes, 3 to 40 mm across at the scale the water uses. Everything is periodic, so it tiles.
 */
export function makeFoamTexture(S = 512): DataTexture {
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
  const t = new DataTexture(data, S, S, RGBAFormat);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
