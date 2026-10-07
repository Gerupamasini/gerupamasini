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
 * height (in sets); it steepens, breaks where the depth is about its height (D ≈ H / 0.78), runs in as a bore that
 * shrinks with the depth, and ends as a thin swash sheet that climbs the beach, stops and drains back.
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
// passed (a gentle bend keeps the crests from lying exactly along the depth contours)
float surfPhase(vec2 p, float D, float t) {
  float travel = 2.0 * sqrt(max(D, 0.0)) / (uSurf.z * 3.1321);
  float bend = 0.10 * sin(p.x * 0.043 + p.y * 0.061) + 0.06 * sin(p.y * 0.137 - p.x * 0.05 + 1.3);
  return (t - travel) / uSurf.y + bend;
}
// wave n's height (m): random, in sets of about seven, and uneven along its crest
float surfHeight(float n, vec2 p) {
  return uSurf.x * (0.55 + 0.75 * surfHash(n * 1.37 + 0.5)) * (0.72 + 0.28 * sin(n * 0.9)) * (0.75 + 0.5 * surfNoise(p * 0.06 + n * 3.1));
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
// x: the surface relative to the still level (m), y: foam (0..1), z: the surface slope seaward (dη/ds),
// for a point of depth D on a bed of slope 'slope'
vec3 surfAt(vec2 p, float D, float t, float slope) {
  if (uSurf.w <= 0.0) return vec3(0.0);
  float ph = surfPhase(p, D, t);
  float n = floor(ph), tau = ph - n;
  float H = surfHeight(n, p);
  float Db = H / 0.78;
  float c = sqrt(9.81 * max(D, 0.02));
  float dtau = -slope / (uSurf.z * c * uSurf.y);   // dτ/ds
  float eta, deta, foam;
  if (D > Db) {
    // not yet broken: shoaling (Green's law, capped) and growing sharper in the crest as it nears breaking
    float A = 0.5 * H * min(pow(2.0 / max(D, 0.05), 0.25), 1.5);
    float sharp = 0.15 + 0.35 * smoothstep(3.0 * Db, Db, D);
    float a2 = 6.2831853 * tau;
    eta = A * (cos(a2) + sharp * (cos(2.0 * a2) - 0.0));
    deta = -A * 6.2831853 * (sin(a2) + 2.0 * sharp * sin(2.0 * a2));
    // the crest begins to spill just before it breaks
    foam = smoothstep(1.35 * Db, Db, D) * pow(max(cos(a2), 0.0), 10.0) * 0.8;
  } else {
    // broken: a bore, steep at the front and sloping away behind, shrinking with the depth
    float Hb = mix(0.5 * D, H, smoothstep(0.7 * Db, Db, D));
    float f = tau < 0.92 ? 1.0 - tau / 0.92 : (tau - 0.92) / 0.08;
    eta = Hb * (f - 0.4);
    deta = Hb * (tau < 0.92 ? -1.0 / 0.92 : 1.0 / 0.08);
    // the tumbling front, the bore's own froth behind it, then the lace it leaves, which lingers until the next one
    foam = smoothstep(0.88, 1.0, tau) + exp(-tau * 4.0) + 0.3 * exp(-tau * 1.2);
    // the bore spends itself in the last few centimetres: the swash's own froth takes over at the waterline
    foam *= smoothstep(0.0, 0.07, D);
  }
  vec3 r = vec3(eta, foam, deta * dtau);
  // the last of the bore becomes the swash: up the beach the surface is the swash sheet alone
  float sw = 1.0 - smoothstep(0.0, 0.6 * Db, D);
  if (sw > 0.0) {
    vec2 s = surfSwash(p, t);
    r.x = mix(r.x, s.x, sw);
    r.z *= 1.0 - sw;
    r.y = mix(r.y, 0.0, step(D, 0.0));
  }
  return r;
}
`;

/**
 * Tiling foam lace: the edges of Voronoi cells (F2 − F1), two cell sizes in R and G (after the reference coast's
 * foam map). Bubbles cluster along the cell walls, which reads as the net of foam a broken wave leaves.
 */
export function makeFoamTexture(S = 256): DataTexture {
  let a = 730 >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const cells = (n: number) => Array.from({ length: n * n }, () => [0.12 + rnd() * 0.76, 0.12 + rnd() * 0.76, rnd()]);
  const c1 = cells(12), c2 = cells(31);
  const edge = (u: number, v: number, n: number, c: number[][]) => {
    const x = u * n, y = v * n, ix = Math.floor(x), iy = Math.floor(y);
    let f1 = 9, f2 = 9, w = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy;
      const k = c[(((cy % n) + n) % n) * n + (((cx % n) + n) % n)];
      const d = (cx + k[0] - x) ** 2 + (cy + k[1] - y) ** 2;
      if (d < f1) { f2 = f1; f1 = d; w = k[2]; } else if (d < f2) f2 = d;
    }
    const t = Math.sqrt(f2) - Math.sqrt(f1);
    return Math.exp(-(t * t) / (0.004 + w * 0.003));
  };
  const data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S, o = (j * S + i) * 4;
    data[o] = Math.round(edge(u, v, 12, c1) * 255);
    data[o + 1] = Math.round(edge(u, v, 31, c2) * 255);
    data[o + 2] = 0;
    data[o + 3] = 255;
  }
  const t = new DataTexture(data, S, S, RGBAFormat);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
