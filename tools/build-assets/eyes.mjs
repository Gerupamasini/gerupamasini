// Eye module (pure data, no three.js, browser-safe: imports nothing).
// Spec: docs/yamame/spec/02 §2.7/§2.3, 06 §6.6, 05 §5.6.3.   Contract: docs/yamame/impl/CONTRACT.md §1, §3, §5.3.
//
// buildEyes({ surface, params, genome, seed }) -> { left, right, textures, report }
//
// EyeAsset (see CONTRACT §5.3):
//   center  [x,y,z]  body-local position of the eyeball centre = the eye-bone pivot (right eye: +Z).
//   axis    [x,y,z]  gaze direction in body space (lateral + ~10 deg forward, horizontal).
//   radius           eyeball (sclera sphere) radius in metres.
//   parts.ball / cornea / orbit : { positions, normals, uvs, indices }  in EYE-LOCAL coordinates
//                    (origin = eyeball centre, +Z = gaze, +Y = up, +X = Y x Z; a proper rotation for both eyes).
//   Extras: side, outer_radius, aperture_radius, basis{x,y,z} (local axes in body space), quaternion [x,y,z,w],
//           matrix (column-major 4x4 local->body), orbit_normal (body space), bone, tris.
//   Left = exact mirror of right: left local geometry = right local geometry with x negated and the winding flipped,
//   so body = center + R_local->body * local holds for both with a plain rotation (no negative scale).
//
// textures: iris (albedo sRGB RGBA 512x512, disc mapping), iris_normal (linear, green = +Y/up, glTF), iris_orm
//   (linear: R = AO, G = roughness, B = metalness) and orbit (sRGB gradient strip for the orbit ring, u = around, v = inner->outer).
//
// Disc mapping of ball/cornea UV: uv = (0.5 + x/(2*Ro), 0.5 - y/(2*Ro)) with x,y the eye-local coordinates, Ro = outer radius
//   (glTF convention: v measured from the top row of the image, so use flipY = false in three.js).
//
// genome keys (all optional): eye_outer_d_over_sl, mt_eye_size (-1 adult .. +1 parr), iris_ring_d_over_outer, pupil_d_over_outer,
//   iris_L (22..61, brightness), iris_gold (0..1), sclera_bright (0..1), iris_sheen (0..1, blue-green sheen baked into the albedo),
//   eye_yaw_deg (10), head_rgb [r,g,b] sRGB (orbit ring outer colour), socket (object or null, see SOCKET_LOFT),
//   variation (0..1, default 1: seeded individual jitter of gold/L/pupil/ring; 0 = exact spec defaults), iris_tex_size (512).

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- small vector helpers ---------------------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Eye socket of loft.mjs (displacement(): pocket + raised orbital rim), in units of the eye OUTER RADIUS Ro.
// The orbit ring and the ball depth are fitted to the skin *including* this pocket. Pass genome.socket = null to fit to the
// bare surface, or an object with the same keys if loft.mjs changes.      [E: mirrors loft.mjs, 2026-10 version]
export const SOCKET_LOFT = { pocket_depth: 0.9, pocket_radius: 1.30, rim_height: 0.10, rim_radius: 1.18, rim_width: 0.22 };
function socketDisp(rr, Ro, sk) {
  if (!sk) return 0;
  let d = 0; const r0 = Ro * sk.pocket_radius;
  if (rr < r0) { const q = 1 - (rr / r0) ** 2; d -= sk.pocket_depth * Ro * q * q; }
  d += sk.rim_height * Ro * Math.exp(-(((rr - Ro * sk.rim_radius) / (Ro * sk.rim_width)) ** 2));
  return d;
}

// ---- skin patch around the eye: tabulated true skin (surface + socket) in the tangent plane --------------------------
function makeSkinPatch({ surface, P0, e1, e2, Ro, socket, extent = 2.2, N = 88 }) {
  const SL = surface.SL;
  function project(Q) { // body-space point (z >= 0) -> point of the bare surface in the same cross-section, plus its normal
    const s = Math.max(surface.xToS(Q[0]), 0);
    const cy = surface.section(s).c * SL;
    const target = Math.atan2(Q[2], Q[1] - cy);
    let lo = 0, hi = Math.PI;
    for (let it = 0; it < 30; it++) {
      const mid = 0.5 * (lo + hi); const p = surface.point(s, mid);
      if (Math.atan2(p[2], p[1] - cy) < target) lo = mid; else hi = mid;
    }
    const alpha = 0.5 * (lo + hi);
    return { S: surface.point(s, alpha), n: surface.normal(s, alpha) };
  }
  const M = N + 1; const pts = new Float64Array(M * M * 3);
  const half = extent * Ro;
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
    const u1 = (i / N * 2 - 1) * half, u2 = (j / N * 2 - 1) * half;
    const Q = add(P0, add(scl(e1, u1), scl(e2, u2)));
    const { S, n } = project(Q);
    const d = socketDisp(len(sub(S, P0)), Ro, socket);
    const o = (i * M + j) * 3; pts[o] = S[0] + n[0] * d; pts[o + 1] = S[1] + n[1] * d; pts[o + 2] = S[2] + n[2] * d;
  }
  function sample(u1, u2) { // bilinear
    const fx = clamp((u1 / half + 1) * 0.5 * N, 0, N - 1e-6), fy = clamp((u2 / half + 1) * 0.5 * N, 0, N - 1e-6);
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const p = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const a = pts[(i * M + j) * 3 + k], b = pts[((i + 1) * M + j) * 3 + k], c = pts[(i * M + j + 1) * 3 + k], d = pts[((i + 1) * M + j + 1) * 3 + k];
      p[k] = mix(mix(a, b, tx), mix(c, d, tx), ty);
    }
    return p;
  }
  function normalAt(u1, u2, nRef) { // outward normal of the (pocketed) skin from finite differences
    const h = 0.03 * Ro;
    const a = sub(sample(u1 + h, u2), sample(u1 - h, u2)), b = sub(sample(u1, u2 + h), sample(u1, u2 - h));
    let n = norm(cross(a, b)); if (dot(n, nRef) < 0) n = scl(n, -1); return n;
  }
  return { sample, normalAt, half };
}

// ---- revolved surface helper (rings of theta around +Z; first ring = pole vertex) --------------------------------------
function buildRevolved(fn, thetas, az, uvFn) {
  const pos = [], nor = [], uv = [], idx = []; const ringStart = [], ringCount = [];
  const h = 1e-4;
  for (const th of thetas) {
    ringStart.push(pos.length / 3);
    if (th <= 1e-9 || th >= Math.PI - 1e-9) {
      const p = fn(th, 0); pos.push(...p); nor.push(0, 0, th <= 1e-9 ? 1 : -1); uv.push(...uvFn(th, 0)); ringCount.push(1);
    } else {
      for (let j = 0; j < az; j++) {
        const ph = TAU * j / az; const p = fn(th, ph);
        const dth = sub(fn(th + h, ph), fn(th - h, ph)), dph = sub(fn(th, ph + h), fn(th, ph - h));
        const n = norm(cross(dth, dph));
        pos.push(...p); nor.push(...n); uv.push(...uvFn(th, ph));
      }
      ringCount.push(az);
    }
  }
  for (let k = 0; k < thetas.length - 1; k++) {
    const A = ringStart[k], B = ringStart[k + 1];
    for (let j = 0; j < az; j++) {
      const j1 = (j + 1) % az;
      if (ringCount[k] === 1) idx.push(A, B + j, B + j1);
      else if (ringCount[k + 1] === 1) idx.push(A + j, B, A + j1);
      else { const a = A + j, b = A + j1, c = B + j, d = B + j1; idx.push(a, c, b, b, c, d); }
    }
  }
  return geo(pos, nor, uv, idx);
}
function geo(pos, nor, uv, idx) {
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), uvs: Float32Array.from(uv), indices: Uint32Array.from(idx) };
}
function smoothNormals(positions, indices) {
  const n = new Float64Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { n[o] += nx; n[o + 1] += ny; n[o + 2] += nz; }
  }
  const out = new Float32Array(positions.length);
  for (let v = 0; v < out.length; v += 3) { const l = Math.hypot(n[v], n[v + 1], n[v + 2]) || 1; out[v] = n[v] / l; out[v + 1] = n[v + 1] / l; out[v + 2] = n[v + 2] / l; }
  return out;
}
function mirrorX(g) { // x -> -x with flipped winding (left eye = exact mirror of the right eye in local coordinates)
  const p = Float32Array.from(g.positions), n = Float32Array.from(g.normals), idx = Uint32Array.from(g.indices);
  for (let i = 0; i < p.length; i += 3) { p[i] = -p[i]; n[i] = -n[i]; }
  for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
  return { positions: p, normals: n, uvs: Float32Array.from(g.uvs), indices: idx };
}

// ---- seeded noise for the iris texture ---------------------------------------------------------------------------------
function makePeriodicNoise(rng, n) { // 1-D periodic value noise on n lattice points, returns f(phi) in [-1,1]
  const v = Array.from({ length: n }, () => rng() * 2 - 1);
  return (phi) => {
    const x = ((phi / TAU) % 1 + 1) % 1 * n; const i = Math.floor(x), f = x - i; const w = f * f * (3 - 2 * f);
    return mix(v[i % n], v[(i + 1) % n], w);
  };
}
function makeNoise2(rng) { // 2-D value noise, returns f(x,y) in [-1,1]
  const S = 64, tab = Float32Array.from({ length: S * S }, () => rng() * 2 - 1);
  return (x, y) => {
    const xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf; const wx = fx * fx * (3 - 2 * fx), wy = fy * fy * (3 - 2 * fy);
    const g = (i, j) => tab[(((j % S) + S) % S) * S + (((i % S) + S) % S)];
    return mix(mix(g(xf, yf), g(xf + 1, yf), wx), mix(g(xf, yf + 1), g(xf + 1, yf + 1), wx), wy);
  };
}

// ---- iris / pupil / sclera textures -----------------------------------------------------------------------------------
// Radial coordinate t = rho / Ro  (Ro = eye outer radius incl. orbit rim); image edge = t 1.   Pupil edge t = pupil_d/outer,
// gold ring outer edge t = iris_ring_d/outer (02 §2.7).
function makeIrisTextures(rng, P) {
  const W = P.size, H = P.size;
  const fib1 = makePeriodicNoise(rng, 54), fib2 = makePeriodicNoise(rng, 131), fib3 = makePeriodicNoise(rng, 320), wob = makePeriodicNoise(rng, 9);
  const col = makePeriodicNoise(rng, 17);
  const n2 = makeNoise2(rng);
  // dark pigment blotches in the outer iris margin (p067: black patches beside the gold ring)
  const blotches = [];
  const nb = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < nb; i++) blotches.push({ ph: rng() * TAU, t: P.ti + 0.04 + rng() * 0.10, r: 0.04 + rng() * 0.06, k: 0.6 + rng() * 0.4, el: 1 + rng() * 1.2 });
  const g = P.gold, Lf = Math.pow(clamp(P.irisL / 44, 0.45, 1.5), 0.8);
  const C = {
    rimPale: [214, 205, 178], rimGold: [248, 212, 112], midPale: [158, 146, 120], midGold: [204, 158, 56],
    outPale: [90, 82, 68], outGold: [124, 88, 34], limbus: [30, 25, 18], pupil: [15, 16, 20],
    sclDark: [52, 49, 40], sclBright: [140, 136, 118], vign: [22, 20, 17], sheen: [60, 118, 120],
  };
  const m3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  const rim = m3(C.rimPale, C.rimGold, g), mid = m3(C.midPale, C.midGold, g), out = m3(C.outPale, C.outGold, g);
  const sclera = m3(C.sclDark, C.sclBright, P.scleraBright);
  const edgeWob = makePeriodicNoise(rng, 23);

  const alb = new Float32Array(W * H * 3), rough = new Float32Array(W * H), metal = new Float32Array(W * H), ao = new Float32Array(W * H), height = new Float32Array(W * H);
  const aa = 1.0 / (W * 0.5); // 1 px in t units
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = (i + 0.5) / W * 2 - 1, y = 1 - (j + 0.5) / H * 2;
    const t = Math.hypot(x, y), ph = Math.atan2(y, x);
    const o = j * W + i;
    const tiW = P.ti + 0.008 * wob(ph) + 0.005 * edgeWob(ph);            // the outer edge of the gold ring is not a perfect circle
    // fibres: radial striations, slightly curved with radius
    const gg = clamp((t - P.tp) / (tiW - P.tp), 0, 1);
    const phc = ph + 0.18 * wob(ph * 1.0) * gg;
    const f1 = fib1(phc), f2 = fib2(phc), f3 = fib3(phc + 0.7 * gg);
    const fib = 0.20 * f1 + 0.13 * f2 + 0.08 * f3;
    // collarette: wavy bright line in the gold band
    const cw = 0.5 + 0.5 * Math.sin(ph * 17 + 2.4 * wob(ph));
    const gc = 0.40 + 0.07 * (cw - 0.5) * 2;
    const coll = Math.exp(-(((gg - gc) / 0.085) ** 2)) * (0.12 + 0.12 * cw);
    // --- gold ring ---
    const wRimMid = smoothstep(0.0, 0.26, gg), wMidOut = smoothstep(0.34, 1.0, gg);
    const ring = m3(m3(rim, mid, wRimMid), out, wMidOut);
    const ringL = (1 + (fib * (0.55 + 0.9 * smoothstep(0.05, 0.5, gg)) + coll)) * Lf;
    const ringC = [ring[0] * ringL, ring[1] * ringL, ring[2] * ringL];
    // --- outside the ring: dark limbus, then striated olive/silver iris-sclera, dark vignette at the orbit ---
    const tt = t - tiW;                                                  // distance outside the gold ring
    const sp = n2(x * 22 + 5, y * 22 + 9) * 0.6 + n2(x * 60, y * 60 + 3) * 0.4;
    const sRad = 0.55 + 0.45 * smoothstep(0.0, 0.14, tt);
    const sF = 1 + 0.30 * fib2(ph + 0.4 * tt) + 0.22 * fib1(ph) + 0.12 * fib3(ph - 0.5 * tt);
    const sL = (0.85 + 0.12 * sp) * sF * sRad;
    let scC = [sclera[0] * sL, sclera[1] * sL, sclera[2] * sL];
    const wLimbus = smoothstep(-0.012, 0.012, tt) * (1 - smoothstep(0.05, 0.10, tt));
    scC = m3(scC, C.limbus, wLimbus * (0.80 + 0.15 * f2));
    const vg = smoothstep(0.76, 0.97, t);
    scC = m3(scC, C.vign, vg * 0.9);
    // blue-green sheen on the upper outer iris / sclera (sky reflected in the guanine layer)
    const upper = clamp(0.5 + 0.9 * (y / Math.max(t, 1e-3)), 0, 1);
    const sheenMask = P.sheen * smoothstep(0.55, 1.0, upper) * smoothstep(0.05, 0.14, tt) * (1 - smoothstep(0.80, 0.95, t));
    scC = m3(scC, C.sheen, 0.5 * sheenMask * (0.6 + 0.4 * (0.5 + 0.5 * col(ph))));
    // assemble by radius
    const wP = 1 - smoothstep(P.tp - aa * 1.2, P.tp + aa * 1.2, t);          // pupil weight
    const wI = (1 - smoothstep(tiW - aa * 1.5, tiW + aa * 1.5, t));          // inside the gold ring's outer edge
    let c = m3(scC, ringC, wI);
    // blotches (soft irregular dark pigment patches)
    for (const b of blotches) {
      const dph = Math.atan2(Math.sin(ph - b.ph), Math.cos(ph - b.ph)) * Math.max(t, 0.3) / b.el;
      const warp = 1 + 0.35 * n2(x * 40 + b.ph * 10, y * 40);
      const d2 = (dph * dph + (t - b.t) ** 2) / (b.r * b.r) * warp;
      const bm = Math.exp(-d2 * d2 * 0.8) * b.k * (1 - wP) * (1 - 0.8 * wI);
      if (bm > 0.001) c = m3(c, [18, 16, 14], bm);
    }
    c = m3(c, C.pupil, wP);
    alb[o * 3] = c[0]; alb[o * 3 + 1] = c[1]; alb[o * 3 + 2] = c[2];
    // --- ORM ---
    const inGold = wI * (1 - wP);
    rough[o] = mix(mix(0.44 + 0.08 * sp + 0.18 * vg, 0.38 + 0.08 * fib, wI), 0.10, wP);
    rough[o] = mix(rough[o], 0.58, wLimbus * (1 - wI));
    metal[o] = mix(0.16 + 0.35 * P.scleraBright, 0.25 * (0.5 + g * 0.5), wI) * (1 - wP) * (1 - 0.8 * wLimbus * (1 - wI));
    const topBias = 0.65 + 0.35 * upper;
    ao[o] = 1 - 0.78 * smoothstep(0.62, 0.97, t) * topBias;
    // --- height (for the normal map) ---
    height[o] = inGold * (0.5 * fib + 0.6 * coll) * 0.5 + 0.9 * Math.exp(-(((t - P.tp) / 0.012) ** 2)) * wI * 0.6
      + 0.5 * Math.exp(-(((t - tiW) / 0.014) ** 2)) - 1.2 * wP + (0.15 * sp + 0.25 * (sF - 1)) * (1 - wI) * (1 - vg);
  }
  const albedo = new Uint8Array(W * H * 4), orm = new Uint8Array(W * H * 4), normal = new Uint8Array(W * H * 4);
  const q = (v) => Math.round(clamp(v, 0, 255));
  const hAt = (i, j) => height[clamp(j, 0, H - 1) * W + clamp(i, 0, W - 1)];
  const strength = 2.6;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const o = j * W + i, k = o * 4;
    albedo[k] = q(alb[o * 3]); albedo[k + 1] = q(alb[o * 3 + 1]); albedo[k + 2] = q(alb[o * 3 + 2]); albedo[k + 3] = 255;
    orm[k] = q(ao[o] * 255); orm[k + 1] = q(rough[o] * 255); orm[k + 2] = q(metal[o] * 255); orm[k + 3] = 255;
    const dx = (hAt(i + 1, j) - hAt(i - 1, j)) * 0.5, dyUp = (hAt(i, j - 1) - hAt(i, j + 1)) * 0.5; // image up = +Y of the tangent frame
    const nx = -dx * strength, ny = -dyUp * strength, nz = 1; const l = Math.hypot(nx, ny, nz);
    normal[k] = q((nx / l * 0.5 + 0.5) * 255); normal[k + 1] = q((ny / l * 0.5 + 0.5) * 255); normal[k + 2] = q((nz / l * 0.5 + 0.5) * 255); normal[k + 3] = 255;
  }
  return {
    iris: { width: W, height: H, data: albedo },
    iris_normal: { width: W, height: H, data: normal },
    iris_orm: { width: W, height: H, data: orm },
    blotches,
  };
}

// orbit ring colour strip: u (x) = around the ring, v (y) = inner edge (dark rim) -> outer edge (head colour)
function makeOrbitTexture(rng, headRgb, w = 64, h = 64) {
  const data = new Uint8Array(w * h * 4); const nz = makePeriodicNoise(rng, 7);
  const dark = [46, 38, 31];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = (y + 0.5) / h, ph = (x + 0.5) / w * TAU;
    const up = 0.5 + 0.5 * Math.cos(ph - Math.PI / 2);                 // ring top (psi = 90 deg) a little darker (shadowed by the brow)
    const k = smoothstep(0.30, 0.97, v);
    const shade = mix(1 - 0.22 * up + 0.08 * nz(ph), 1, k);
    const o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) data[o + c] = Math.round(clamp(mix(dark[c], headRgb[c], k) * shade, 0, 255));
    data[o + 3] = 255;
  }
  return { width: w, height: h, data };
}

// ---- main -------------------------------------------------------------------------------------------------------------
export function buildEyes({ surface, params, genome = {}, seed = 1 }) {
  const SL = surface.SL;
  const E = params.eye;
  const rng = mulberry32((seed * 2654435761) ^ 0x45594553);
  // fixed draw order so that explicit genome values never shift the other seeded draws
  const draws = Array.from({ length: 10 }, () => rng());
  const gauss = (u1, u2) => Math.sqrt(-2 * Math.log(Math.max(u1, 1e-9))) * Math.cos(TAU * u2);
  const vr = clamp(genome.variation ?? 1, 0, 1);

  // size (02 §2.7, §2.3: eye_d/HL falls with growth; mt_eye_size -1 adult 0.046 .. +1 parr 0.058 [E: linear])
  const outerRatio = genome.eye_outer_d_over_sl ?? (genome.mt_eye_size != null ? 0.052 + 0.006 * clamp(genome.mt_eye_size, -1, 1) : E.outer_d_over_sl.v);
  const D = outerRatio * SL, Ro = D / 2;
  let ti = genome.iris_ring_d_over_outer ?? clamp(E.iris_ring_over_outer?.v ?? E.iris_ring_d_over_outer?.v ?? 0.64, 0.52, 0.9);
  let tp = genome.pupil_d_over_outer ?? (E.pupil_over_outer?.v ?? E.pupil_d_over_outer?.v ?? 0.50);
  if (genome.iris_ring_d_over_outer == null) ti = clamp(ti + vr * 0.03 * gauss(draws[0], draws[1]), 0.54, 0.80);
  if (genome.pupil_d_over_outer == null) tp = clamp(tp + vr * 0.03 * gauss(draws[2], draws[3]), 0.38, 0.62);
  const adjusted = [];
  if (tp > ti - 0.04) { tp = ti - 0.04; adjusted.push('pupil clamped to iris_ring - 0.04 (06 §6.6.1)'); }
  const irisL = genome.iris_L ?? clamp(44 + vr * 7 * gauss(draws[4], draws[5]), 26, 58);
  const gold = genome.iris_gold ?? clamp(0.62 + vr * 0.18 * gauss(draws[6], draws[7]), 0.2, 1);
  const scleraBright = genome.sclera_bright ?? clamp(0.25 + vr * 0.15 * gauss(draws[8], draws[9]), 0, 1);
  const sheen = genome.iris_sheen ?? 0.25;
  const yaw = (genome.eye_yaw_deg ?? 10) * Math.PI / 180;
  const headRgb = genome.head_rgb ?? [128, 112, 90];
  const socket = genome.socket === undefined ? SOCKET_LOFT : genome.socket;

  // ---- placement on the right flank (CONTRACT §1) ----
  const sE = genome.eye_center_s ?? E.center_s.v, hf = genome.eye_height_frac ?? E.center_height_frac_from_top.v;
  const sec = surface.section(sE);
  const yEye = (sec.c + sec.h * (1 - 2 * hf)) * SL;
  const alphaR = surface.alphaAtHeight(sE, yEye);
  const P0 = surface.point(sE, alphaR), n0 = norm(surface.normal(sE, alphaR));
  const axisR = [Math.sin(yaw), 0, Math.cos(yaw)];                  // lateral + yaw forward, horizontal
  const Zl = axisR, Yl = [0, 1, 0], Xl = cross(Yl, Zl);             // local frame (right eye): x = forward-ish, proper rotation
  let e1 = sub([1, 0, 0], scl(n0, n0[0])); e1 = norm(e1);            // tangent plane axes at the eye (e1 forward, e2 up)
  const e2 = norm(cross(n0, e1));
  const patch = makeSkinPatch({ surface, P0, e1, e2, Ro, socket });

  // ---- ball size & depth: sphere meets the (pocketed) skin at the aperture radius ----
  const Rb = 0.90 * Ro;                                              // [E] eyeball (sclera sphere) radius
  const apTarget = 0.80 * Ro;                                        // [E] visible aperture (dark iris margin + sclera rim) radius
  const NPSI = 72;
  const apertureAt = (C, psi) => {
    const f = (r) => len(sub(patch.sample(r * Math.cos(psi), r * Math.sin(psi)), C)) - Rb;
    let r0 = 0.15 * Ro; if (f(r0) >= 0) return r0;
    const step = 0.04 * Ro;
    for (let r = r0 + step; r <= patch.half * 0.98; r += step) {
      if (f(r) >= 0) { let a = r - step, b = r; for (let it = 0; it < 16; it++) { const m = 0.5 * (a + b); if (f(m) >= 0) b = m; else a = m; } return 0.5 * (a + b); }
    }
    return patch.half * 0.98;
  };
  const centerAtDepth = (depth) => sub(P0, scl(n0, depth));
  const meanAperture = (depth) => { const C = centerAtDepth(depth); let s = 0; const K = 12; for (let i = 0; i < K; i++) s += apertureAt(C, TAU * i / K); return s / K; };
  let lo = -0.5 * Ro, hi = 1.8 * Ro;                                  // larger depth -> smaller aperture
  for (let it = 0; it < 22; it++) { const mid = 0.5 * (lo + hi); if (meanAperture(mid) > apTarget) lo = mid; else hi = mid; }
  const depth = 0.5 * (lo + hi);
  const Cb = centerAtDepth(depth);
  const apert = Array.from({ length: NPSI }, (_, i) => apertureAt(Cb, TAU * i / NPSI));
  const apertureMean = apert.reduce((a, b) => a + b, 0) / NPSI;
  // smooth the aperture curve a little (box filter, circular)
  const apS = apert.map((_, i) => { let s = 0; for (let k = -2; k <= 2; k++) s += apert[(i + k + NPSI) % NPSI]; return s / 5; });

  // body-space -> eye-local
  const toLocal = (p) => { const d = sub(p, Cb); return [dot(d, Xl), dot(d, Yl), dot(d, Zl)]; };

  // ---- ball (sclera sphere with a recessed iris dish; dense in front) ----
  const recess = (E.iris_recess_over_outer?.v ?? 0.065) * D;           // [E] 06 §6.6.1: iris plane below the corneal apex
  const corneaGap = 0.35 * recess, dishDepth = recess - corneaGap, pupilExtra = 0.04 * Ro;
  const tLim = ti + 0.05;
  const dish = (rho) => {
    const t = rho / Ro; if (t > tLim + 0.06) return 0;
    return dishDepth * (1 - smoothstep(tLim - 0.05, tLim + 0.05, t)) + pupilExtra * (1 - smoothstep(tp - 0.03, tp + 0.01, t));
  };
  const thetas = [0];
  for (let d = 1; d <= 76; d++) thetas.push(d * Math.PI / 180);
  for (let d = 82; d <= 172; d += 6) thetas.push(d * Math.PI / 180);
  thetas.push(Math.PI);
  const ballFn = (th, ph) => {
    const rho = Rb * Math.sin(th); let z = Rb * Math.cos(th);
    if (th < Math.PI / 2) z -= dish(rho);
    return [rho * Math.cos(ph), rho * Math.sin(ph), z];
  };
  const uvFn = (th) => (ph) => { const rho = Rb * Math.sin(Math.min(th, Math.PI / 2)) / Ro; return [0.5 + 0.5 * rho * Math.cos(ph), 0.5 - 0.5 * rho * Math.sin(ph)]; };
  const ball = buildRevolved(ballFn, thetas, 96, (th, ph) => uvFn(th)(ph));

  // ---- cornea (thin transparent cap, front only; merges into the ball surface at its edge) ----
  const thC = Math.asin(Math.min(0.97, (apTarget + 0.12 * Ro) / Rb));
  const thCa = Math.asin(0.45 * Ro / Rb);
  const cthetas = []; for (let k = 0; k <= 56; k++) cthetas.push(thC * k / 56);
  const corFn = (th, ph) => {
    const gap = corneaGap * (mix(1, 0.18, smoothstep(thCa, thC, th)));
    const R = Rb + gap; return [R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph), R * Math.cos(th)];
  };
  const cornea = buildRevolved(corFn, cthetas, 96, (th, ph) => uvFn(th)(ph));

  // ---- orbit ring: swept lip that follows the true skin, covering the ball/skin junction ----
  const NW = 96;                                                       // around
  const topPts = 18, botPts = 8;
  const bump = (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 1.2);
  const Hc = 0.10 * Ro, Bd = 0.12 * Ro, sink = 0.02 * Ro, Dd = 0.12 * Ro;              // crest height above skin / buried depth / whole-ring sink
  const prof = []; // [u (radial position inner 0 -> outer 1), h (height above the skin), v (texture coordinate)]
  for (let i = 0; i <= topPts; i++) { const u = i / topPts; prof.push([u, Hc * bump(u) - Dd * smoothstep(0.62, 1.0, u), u]); }
  // buried underside: textured with the outer (head) colour so that a dip of the loft skin never exposes a dark band
  for (let i = 1; i <= botPts; i++) { const u = 1 - i / (botPts + 1); prof.push([u, -Bd * Math.sin(Math.PI * u) ** 0.8, 0.55 + 0.45 * u]); }
  const oPos = [], oUv = [];
  const lift = (psi, r) => patch.normalAt(r * Math.cos(psi), r * Math.sin(psi), n0);
  const apAt = (psi) => { const f = ((psi / TAU) % 1 + 1) % 1 * NPSI; const i = Math.floor(f), t = f - i; return mix(apS[i % NPSI], apS[(i + 1) % NPSI], t); };
  for (let i = 0; i <= NW; i++) {                                      // column NW duplicates column 0 (continuous UV across the seam)
    const psi = TAU * (i % NW) / NW; const a = apAt(psi);
    const rin = a - 0.10 * Ro, rout = Math.max(1.0 * Ro, a + 0.17 * Ro);
    for (const [u, h, v] of prof) {
      const r = mix(rin, rout, u);
      const base = patch.sample(r * Math.cos(psi), r * Math.sin(psi)); const n = lift(psi, r);
      const p = add(base, scl(n, h - sink));
      oPos.push(...toLocal(p)); oUv.push(i / NW, v);
    }
  }
  const NP = prof.length;
  const oIdx = [], oIdxWrap = [];
  for (let i = 0; i < NW; i++) for (let k = 0; k < NP; k++) {
    const k1 = (k + 1) % NP;
    const a = i * NP + k, b = (i + 1) * NP + k, c = i * NP + k1, d = (i + 1) * NP + k1;
    oIdx.push(a, b, c, b, d, c);
    const bw = ((i + 1) % NW) * NP + k, dw = ((i + 1) % NW) * NP + k1;
    oIdxWrap.push(a, bw, c, bw, dw, c);
  }
  // orient outward (crest normals should agree with the skin normal) and smooth the normals across the seam
  let flip = false;
  {
    const nn = smoothNormals(Float32Array.from(oPos), Uint32Array.from(oIdxWrap));
    const nl = [dot(n0, Xl), dot(n0, Yl), dot(n0, Zl)]; let votes = 0;
    for (let i = 0; i < NW; i++) { const v = (i * NP + Math.floor(topPts * 0.4)) * 3; votes += nn[v] * nl[0] + nn[v + 1] * nl[1] + nn[v + 2] * nl[2] > 0 ? 1 : -1; }
    flip = votes < 0;
  }
  if (flip) for (const arr of [oIdx, oIdxWrap]) for (let t = 0; t < arr.length; t += 3) { const q2 = arr[t + 1]; arr[t + 1] = arr[t + 2]; arr[t + 2] = q2; }
  const oNor = smoothNormals(Float32Array.from(oPos), Uint32Array.from(oIdxWrap));
  for (let k = 0; k < NP; k++) for (let c3 = 0; c3 < 3; c3++) oNor[(NW * NP + k) * 3 + c3] = oNor[k * 3 + c3];
  const orbit = geo(oPos, oNor, oUv, oIdx);

  // ---- textures ----
  const texRng = mulberry32((seed * 40503) ^ 0x1215);
  const tex = makeIrisTextures(texRng, { size: genome.iris_tex_size ?? 512, tp, ti, gold, irisL, scleraBright, sheen });
  const orbitTex = makeOrbitTexture(mulberry32((seed * 977) ^ 0x0AB17), headRgb);

  // ---- assemble the two assets ----
  const qFromBasis = (x, y, z) => { // rotation matrix columns x,y,z -> quaternion [x,y,z,w]
    const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2];
    const tr = m00 + m11 + m22; let qx, qy, qz, qw;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; qw = s / 4; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; qw = (m21 - m12) / s; qx = s / 4; qy = (m01 + m10) / s; qz = (m02 + m20) / s; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = s / 4; qz = (m12 + m21) / s; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = s / 4; }
    return [qx, qy, qz, qw];
  };
  const mk = (side) => {
    const L = side === 'L';
    const mz = (v) => (L ? [v[0], v[1], -v[2]] : v);
    const bz = mz(Zl), by = mz(Yl), bx = norm(cross(by, bz));
    const center = mz(Cb);
    const parts = L ? { ball: mirrorX(ball), cornea: mirrorX(cornea), orbit: mirrorX(orbit) } : { ball, cornea, orbit };
    const matrix = [bx[0], bx[1], bx[2], 0, by[0], by[1], by[2], 0, bz[0], bz[1], bz[2], 0, center[0], center[1], center[2], 1];
    return {
      side, bone: L ? 'eye_L' : 'eye_R', center, axis: bz, radius: Rb, outer_radius: Ro, aperture_radius: apertureMean,
      basis: { x: bx, y: by, z: bz }, quaternion: qFromBasis(bx, by, bz), matrix, orbit_normal: mz(n0), parts,
    };
  };
  const right = mk('R'), left = mk('L');
  const tris = (a) => ({ ball: a.parts.ball.indices.length / 3, cornea: a.parts.cornea.indices.length / 3, orbit: a.parts.orbit.indices.length / 3 });
  const report = {
    outer_d_m: D, outer_d_over_sl: outerRatio, outer_radius_m: Ro, ball_radius_m: Rb, ball_depth_below_skin_m: depth, aperture_mean_m: apertureMean,
    aperture_min_over_Ro: Math.min(...apert) / Ro, aperture_max_over_Ro: Math.max(...apert) / Ro,
    iris_ring_d_over_outer: ti, pupil_d_over_outer: tp, iris_L: irisL, iris_gold: gold, sclera_bright: scleraBright, sheen,
    yaw_deg: yaw * 180 / Math.PI, centre_right: right.center, centre_left: left.center, skin_point_right: P0, skin_normal_right: n0,
    cornea_gap_m: corneaGap, iris_recess_m: recess, socket, tris: tris(right), blotches: tex.blotches.length, adjusted,
  };
  return {
    left, right,
    textures: { iris: tex.iris, iris_normal: tex.iris_normal, iris_orm: tex.iris_orm, orbit: orbitTex },
    report,
  };
}
