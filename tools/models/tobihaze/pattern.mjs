// The トビハゼ's skin colour (round T1, key `pattern`): the albedo of every skin texel as a function of its fish-frame
// position (bake.mjs: the bake is position based, so the charts' seams are continuous and every tier bakes the same
// fish from the same functions). behaviour.md §2.1–2.2 (body_fins_colour §3, §6.3–6.4; face_side_34 §3–4,
// face_front_top §5; anat_soft §1.1) give the layers and their places, the photos (u1, B010, A005, B067, A030, A070,
// A036, B002, B006, B050, B064) their look; the palette is calibrated against the photos under the reference viewer's
// light (scratchpad ref/work/t1_pattern: region means, linear, ΔE2000).
//
// Use (the bake orchestrator, per tier): ctx = patternContext(fishSDFmm(HL), { texelMM }) once — texelMM the tier's
// skin texel (hero 2048: 0.031, lod1 1024: 0.062, lod2 256: 0.25), then per covered texel of the body atlas
// skinColour(p, n, CHART_PART[chart], ctx).rgb with p the texel's fish-frame point in mm (the bind pose; tiers.mjs's
// object frame back through anatomy.toObject) and n its normal (fish frame). The eyeSkin rect: p on the LEFT globe at
// rest (eyemesh: the two globes share the rect), part 'eyeSkin'. The teeth swatch: part 'teeth'. The iris rect is the
// eyefin key's (paintEye). ~15 µs a texel (2048²: about 40 s with the rasterization).
//
// Frames (HL units inside; the API takes fish mm):
//   body   u = s / TL (0 at the snout), v = 0 on the dorsal midline → 1 on the ventral one, by height in the section
//          (v = (yT − y) / (yT − yB), the top and bottom of the fish at z = 0 at that s: what a lateral photo measures);
//          the trunk's layers live in (u, v), domain-warped by 3D noise of the position so no edge is straight
//   head   its own places in HL (anatomy.mjs HEAD; head.mjs HEAD_SCULPT's pad, jaw, opercle and eye cup), the same v for
//          its tone bands; the head's layers fade into the trunk's behind the opercle's margin (its path from head.mjs)
//   lobe   the pectoral arm (body.mjs armField / lobeParam): on its surface past the shoulder's root pad
//   eye    the eye's skin cap (part 'eyeSkin'): the globe's surface at rest, coloured as the head skin round it
// Spots are jittered 3D lattices (the spot's visible disc is the slice of its ball the skin cuts: sizes vary
// naturally), lines are ridged noise, bands and blotches are shapes in (u, v) with fbm edges: nothing tiles.
// Tiers: patternContext(fish, { texelMM }) sets the texel size; a layer whose features fall under ~1.5 texels is
// replaced by its mean tone (the mip-average the hero's map has there), so the far tiers keep the hero's colour and
// drop only what they cannot hold (lod2 at 256: the gradient, the saddles and blotches; behaviour §2.2.9).
//
// Output channels (for the material's runtime layers, contract §5): rgb (linear albedo), `bars` 0..1 the excitement
// crossbands' mask (behaviour §2.6: 5–7 dark bands from the occiput to the peduncle shown under disturbance; a uniform
// darkens rgb by bars × k — pack into the body colour's A, which the opaque skin does not use) and `cavity` (none here:
// the surface key's).
import { HL, TL, HEAD } from './anatomy.mjs';
import { BODY_SCULPT, trunkProfile, lobeParam, armField } from './body.mjs';
import { HEAD_SCULPT } from './head.mjs';
import { sealedFishSDF } from './seal.mjs';
import { perlin3, hash3i } from '../../lib/noise.mjs';

/** TL in head lengths. */
const TLH = TL / HL;

/**
 * The palette (sRGB hex; texture albedo, the wet look comes from the material). The grounds (headTop, cheek, cheekOlive,
 * flankUpper, flankLower, belly; dorsum 0.6 of flankUpper) are the research values (behaviour §2.1) calibrated under
 * the reference viewer's light (round T1, roughness 0.8, no normal map): each region's rendered mean at the photos' own
 * cameras against the trusted photos' median, ΔE2000 headTop 0.2, cheek 7.3, flankUpper 3.1, flankLower 0.7, lobe 4.6
 * (trusted: head top B010, A005; cheek u1, B010, A005; upper flank B010, A005; lower flank u1, B067; lobe B010, A005 —
 * u1's top surfaces carry the sky's sheen, B067 is behind the aquarium's glass, B010 / A005's lower flank is lit from
 * the rock below). A ground is the skin BETWEEN the marks, so it is lighter than the research's samples, which are
 * means with the marks; the texture-space means come out at headTop #b0a293, cheek #b7a287, flankUpper #ab9f8c,
 * flankLower #c3b5a6, belly #dad9cc, lobe #d0b58e (the same within 0.03 in luminance at lod1 and lod2). The viewer's
 * studio light reads ~1.3× darker than the photos' exposure, so if the viewer gains an environment light the grounds
 * want the calibration re-run (they sit near the 0.7 linear cap now). The marks' colours are the research's, darkened
 * where the photos' marks read darker (speckle, brownSpot). `*Warm` / `*Cool` are the ends a layer's per-spot
 * variation runs between.
 */
export const PALETTE = {
  // ground (countershading, behaviour §2.2.1)
  dorsum: '#aea18f',        // back and nape: 0.6 of flankUpper (linear), the countershading (research #8c7b66)
  headTop: '#dacec5',       // head top between and behind the eyes (under the vermiculation and the granules)
  flankUpper: '#dacab4',    // the ground between the upper flank's spots (research #8a7c68: a mean with its spots)
  flankLower: '#dacbbd',    // silvery cream (research #cdc8b8)
  belly: '#dad9cc',         // cool cream (throat, chin, belly; research #d6d8cd)
  cheek: '#dabb9d',         // cheek and opercle, under the reticulation (research #a08e74: a mean with its net)
  cheekOlive: '#daceb6',    // olive-grey variant (B006), mixed in by low-frequency noise
  cheekLow: '#c2b9a2',      // the cheek's pale lower half (B006, B010)
  // marks
  saddle: '#3a2c20',        // saddles and blotches
  saddleCool: '#33302c',    // slate end (u1's dark blotches read blue-grey)
  speckle: '#4c3d2e',       // fine peppering (research #5a4a39)
  brownSpot: '#4a3828',     // the flank's dark brown spot rows (B010: research #6e5640 reads too light)
  rustSpot: '#8f6845',      // the lower flank's rust dots (u1, B010: orange-brown on the cream)
  barDark: '#5a4c3e',       // barcode, dark phase
  vermic: '#4a3726',        // head-top vermiculation
  headBlotch: '#5f4b37',    // the cheek's and snout's brown blotches
  axilMark: '#3c2e22',      // axilla, opercular-margin bar, post-orbital streak
  netTint: '#8c7650',       // the head's reticulation: the matrix between the pale granules, a multiplier on the ground
                            // (its olive-brown deepening; B010, A008, B064)
  cellPale: '#d4c18c',      // the head's pale granules (cream-yellow)
  paleSpot: '#dfe0d2',      // cool dots
  paleWarm: '#e6d6b4',      // warm cream dots
  crescent: '#d3c9b0',      // the pale cream crescent under the eye
  lip: '#cdc0a6',           // lip pads, pale cream
  lipStipple: '#776654',    // the lip's fine dark stipple
  pectLobe: '#d3b78d',      // the pectoral lobe, warm ochre-tan (research #b0956a)
  lobeDot: '#6e5640',
  eyeCap: '#8c7f66',        // the eye's skin cap (olive-tan, stippled)
  mouth: '#c8ae9f',         // the mouth's lining
  mouthDeep: '#8e6f66',
  gill: '#7a5048',          // the gill pocket's walls
  socket: '#a49e88',        // the eye cup's lining (translucent pale grey-olive)
  teeth: '#ece2ca',
};

/** Which part a body-atlas chart's texels are (fishmesh.mjs BODY_LAYOUT; the orchestrator passes it to skinColour).
 * skinColour resolves head / body / lobe / lip itself from the position (they are one surface: the colour runs on
 * across the charts' seams); the part matters for the eye's skin cap, the inside of the mouth, the gill pockets and the
 * eye sockets, and the teeth. `patch` holds islands from anywhere: null = by position. */
export const CHART_PART = {
  bodyL: 'body', bodyR: 'body', tailCap: 'body', head: 'head', domeL: 'head', domeR: 'head', lobeL: 'lobe', lobeR: 'lobe',
  socketL: 'interior', socketR: 'interior', gillRoofL: 'interior', gillFloorL: 'interior', gillRoofR: 'interior',
  gillFloorR: 'interior', mouthRoof: 'interior', mouthFloor: 'interior', hidden: 'interior', teeth: 'teeth',
  eyeSkin: 'eyeSkin', patch: null, iris: null,
};

// ------------------------------------------------------------------------------------------------- small helpers
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** sRGB hex → linear [r, g, b]. */
export const hexToLinear = (h) => [1, 3, 5].map((i) => s2l(parseInt(h.slice(i, i + 2), 16) / 255));
/** c ← c + (k − c) · a, in place (linear). */
const blend = (c, k, a) => { if (a <= 0) return; if (a > 1) a = 1; c[0] += (k[0] - c[0]) * a; c[1] += (k[1] - c[1]) * a; c[2] += (k[2] - c[2]) * a; };
const lerp3 = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };
/** fbm of the library's Perlin noise, about [−1, 1]. */
function fbm(x, y, z, oct, seed) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * perlin3(x * f, y * f, z * f, seed + i * 31); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
const h01 = (a, b, c, seed) => hash3i(a, b, c, seed) / 4294967296;

/** Distance (HL) from q to a swept tube (polyline `path` with radii, y stretched by `sy` about the axis). */
function tubeDist(q, path, radius, sy = 1) {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    const ab0 = b[0] - a[0], ab1 = (b[1] - a[1]) / sy, ab2 = b[2] - a[2];
    const ap0 = q[0] - a[0], ap1 = (q[1] - a[1]) / sy, ap2 = q[2] - a[2];
    const L2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2;
    const t = sat((ap0 * ab0 + ap1 * ab1 + ap2 * ab2) / L2);
    const d = Math.hypot(ap0 - ab0 * t, ap1 - ab1 * t, ap2 - ab2 * t) - (radius[i] + (radius[i + 1] - radius[i]) * t);
    if (d < best) best = d;
  }
  return best;
}

// ------------------------------------------------------------------------------------------------- the fish's frame
/** The fish's top and bottom at z = 0 along s (HL), marched on the field in front of 1.4 HL (the head, with the eye
 * domes' web between the eyes as its top) and the trunk loft's behind (body.mjs trunkProfile), blended over 1.3–1.4. */
function buildProfile(f) {
  const s0 = -0.08, s1 = 4.6, ds = 0.004, n = Math.round((s1 - s0) / ds) + 1;
  const yT = new Float32Array(n), yB = new Float32Array(n);
  const TP = trunkProfile(BODY_SCULPT);
  const edge = (s, from, step) => {
    let y = from;
    while (Math.abs(y - from) < 1.6 && f(s, y, 0) > 0) y += step;
    let a = y - step, b = y; // f(a) > 0 ≥ f(b)
    for (let k = 0; k < 14; k++) { const m = (a + b) / 2; if (f(s, m, 0) > 0) a = m; else b = m; }
    return (a + b) / 2;
  };
  for (let i = 0; i < n; i++) {
    const s = s0 + i * ds, w = sstep(1.3, 1.4, s), t = TP.at(Math.max(s, 1.05));
    let top = t.yT, bot = t.yB;
    if (w < 1) {
      const sc = Math.max(s, 0.004);
      const mt = edge(sc, 1.1, -0.01), mb = edge(sc, -0.3, 0.01);
      top = mt + (top - mt) * w; bot = mb + (bot - mb) * w;
    }
    yT[i] = top; yB[i] = bot;
  }
  // the snout's tip (s ≤ 0) is a point: keep the section's height from 0.02 on, so v stays defined at the very front
  const k0 = Math.round((0.03 - s0) / ds);
  for (let i = 0; i < k0; i++) { yT[i] = Math.max(yT[i], yT[k0]); yB[i] = Math.min(yB[i], yB[k0]); }
  const at = (s, out) => {
    const fI = (Math.min(s1, Math.max(s0, s)) - s0) / ds, i = Math.min(n - 2, Math.floor(fI)), t = fI - i;
    out.yT = yT[i] + (yT[i + 1] - yT[i]) * t; out.yB = yB[i] + (yB[i + 1] - yB[i]) * t;
    return out;
  };
  return { at, yT, yB, s0, ds, n };
}

/** The opercle's margin (head.mjs HEAD_SCULPT.opercle.path): its s at height y (HL), extended above and below. */
function marginS(y) {
  const P = HEAD_SCULPT.opercle.path; // y descending
  if (y >= P[0][1]) return P[0][0] + (y - P[0][1]) * 0.3;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1];
    if (y <= a[1] && y >= b[1]) { const t = (a[1] - y) / (a[1] - b[1]); return a[0] + (b[0] - a[0]) * t; }
  }
  return P[P.length - 1][0];
}

// ------------------------------------------------------------------------------------------------- spot lattices
/**
 * A spot layer's coverage at q (HL): a jittered 3D lattice (cell `cell`, vertical stretch `sy` for dashes), each point a
 * ball of radius r·(1 ± rVar), present where its hash is under the density `dens` (soft, so a density gradient fades
 * spots in and out instead of cutting them); `warp` the shared warp vector (lattice units are scaled by the layer).
 * Returns the coverage (0..1) and, in `out.h`, the covering spot's hash (for per-spot colour).
 */
function spotLayer(qx, qy, qz, L, dens, aaHL, out) {
  const c = L.cell, sy = L.sy ?? 1, X = qx / c, Y = qy / (c * sy), Z = qz / c;
  const ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z);
  const aa = Math.max(aaHL / c, L.soft ?? 0.05), r0 = L.r / c;
  let best = 0, bh = 0;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz;
        const h2 = hash3i(cx, cy, cz, L.seed + 7919);
        const e = (h2 & 65535) / 65536;
        const pres = sstep(e - 0.06, e + 0.06, dens);
        if (pres <= 0) continue;
        const h = hash3i(cx, cy, cz, L.seed);
        const px = cx + (h & 1023) / 1023, py = cy + ((h >>> 10) & 1023) / 1023, pz = cz + ((h >>> 20) & 1023) / 1023;
        const rr = r0 * (1 - L.rVar + 2 * L.rVar * ((h2 >>> 16) / 65536));
        const ddx = X - px, ddy = Y - py, ddz = Z - pz;
        const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        if (d > rr + aa) continue;
        const cov = (1 - sstep(rr - aa, rr + aa, d)) * pres;
        if (cov > best) { best = cov; bh = h; }
      }
  if (out) out.h = bh;
  return best;
}

/** 3D Worley noise (cell 1): the nearest and second-nearest jittered points' distances and the nearest one's hash. */
function worley3(X, Y, Z, seed, out) {
  const ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz, h = hash3i(cx, cy, cz, seed);
        const px = cx + 0.1 + 0.8 * (h & 1023) / 1023, py = cy + 0.1 + 0.8 * ((h >>> 10) & 1023) / 1023, pz = cz + 0.1 + 0.8 * ((h >>> 20) & 1023) / 1023;
        const d = (X - px) ** 2 + (Y - py) ** 2 + (Z - pz) ** 2;
        if (d < f1) { f2 = f1; f1 = d; id = h; } else if (d < f2) f2 = d;
      }
  out.f1 = Math.sqrt(f1); out.f2 = Math.sqrt(f2); out.id = id;
  return out;
}

/** The head's granules (the reticulation): in cell units, the granule's coverage at a point from its Worley sample
 * (`wo`), the head's cloud (0..1), the edge roughness and the anti-aliasing width; and the granule's tone from its hash
 * (−1 a dark granule, 0.35 mid-toned, 1 pale). */
function granule(wo, cloud, rough, aa) {
  const t2 = ((wo.id >>> 16) & 255) / 255;
  const r0 = (0.36 + 0.16 * t2) * (1 - 0.35 * cloud);
  return 1 - sstep(r0 - aa, r0 + aa, wo.f1 + rough);
}
const granTone = (id) => { const t = ((id >>> 8) & 255) / 255; return t < 0.1 ? -1 : t < 0.3 ? 0.35 : 1; };

/** The reticulation's means against the cloud (0, 0.25 … 1): the granules' coverage, the pale share (coverage × tone
 * where pale or mid) and the dark share — the tone a texel too coarse for the granules takes (lod1's face, lod2). */
function granuleMeans() {
  const wo = { f1: 0, f2: 0, id: 0 };
  return [0, 0.25, 0.5, 0.75, 1].map((cloud) => {
    let g = 0, pale = 0, dark = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const X = h01(i, 7, 1, 9) * 50, Y = h01(i, 7, 2, 9) * 50, Z = h01(i, 7, 3, 9) * 50;
      worley3(X, Y, Z, 201, wo);
      const rough = 0.12 * perlin3(X * 6, Y * 6, Z * 6, 203) + 0.06 * perlin3(X * 13.5, Y * 13.5, Z * 13.5, 204);
      const gr = granule(wo, cloud, rough, 0.06), tone = granTone(wo.id);
      g += gr; if (tone > 0) pale += gr * tone; else dark += gr;
    }
    return { g: g / N, pale: pale / N, dark: dark / N };
  });
}

/** The spot layers (HL): cell, ball radius, its spread, softness, vertical stretch, seed. A ball of radius r cut by
 * the skin shows a disc of up to 2r across (on average 1.6r). */
const SPOTS = {
  // fine dark peppering, 0.3–0.5 % TL across (behaviour §2.2.6: B067's salt and pepper)
  pepper: { cell: 0.021, r: 0.0082, rVar: 0.35, soft: 0.08, seed: 11 },
  // the head's tiny dark speckles, 0.02–0.04 ED (face_front_top §5), dense: the head's granular look (B010, u1)
  speck: { cell: 0.0145, r: 0.0048, rVar: 0.4, soft: 0.10, seed: 23 },
  // the head's fine pale "salt", 0.03–0.06 ED
  salt: { cell: 0.0165, r: 0.0055, rVar: 0.4, soft: 0.10, seed: 37 },
  // the conspicuous pale spots, 2–2.5 % HL across, 0.07–0.08 HL apart on the cheek (B006: 45 in 0.26 HL²)
  pale: { cell: 0.046, r: 0.0130, rVar: 0.3, soft: 0.12, seed: 41 },
  // the upper flank's pale vertical dashes, 1–2 % TL tall (stretched ×2.6)
  dash: { cell: 0.056, r: 0.0125, rVar: 0.3, soft: 0.12, sy: 2.6, seed: 53 },
  // the lower flank's small rust-brown spots in loose rows (u1, B010: orange-brown on the cream), 0.6–0.9 % TL
  rust: { cell: 0.060, r: 0.0150, rVar: 0.35, soft: 0.12, seed: 61 },
  // the lobe's fine dots
  lobeDot: { cell: 0.022, r: 0.0065, rVar: 0.4, soft: 0.1, seed: 79 },
};

/** Each layer's opacity (0..1; the calibrated look: region contrast against the photos, see the round's notes).
 * patternContext's `strength` multiplies them (tests, morphs). */
export const LAYERS = {
  saddle: 0.5, blotch: 0.62, band: 0.18, barcode: 0.55, spotRow: 0.9, rust: 0.72, pepper: 0.62, speck: 0.3,
  salt: 0.42, pale: 0.6, dash: 0.7, mottle: 0.22, grain: 0.3, verm: 0.68, streak: 0.62, opBar: 0.75, axilla: 0.72,
  trunkSalt: 1.4, crescent: 0.55, lip: 0.92, lipStipple: 0.45, lobe: 1, lobeDot: 0.62, eyeCapOlive: 0.35, net: 0.82, cellPale: 0.62,
  cellDark: 0.55,
};

/** Each spot layer's mean coverage at density 1 (Monte-Carlo over space: a random plane cuts the balls as the skin
 * does), the tone a texel too coarse for the spots takes. */
function spotMeans() {
  const m = {};
  for (const [k, L] of Object.entries(SPOTS)) {
    let s = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) s += spotLayer(h01(i, 1, 2, 5) * 40 * L.cell, h01(i, 3, 4, 5) * 40 * L.cell * (L.sy ?? 1), h01(i, 5, 6, 5) * 40 * L.cell, L, 1, 1e-6, null);
    m[k] = s / N;
  }
  return m;
}

// ------------------------------------------------------------------------------------------------- the context
/**
 * Precomputes what skinColour needs: the fish's section profile, the arm's field, the pattern's placed features
 * (jittered per `seed`), the palette in linear, the spot layers' means for coarse texels.
 * @param fish  fishSDFmm (body.mjs; `.hl` is the field in HL) — or the HL field itself
 * @param o     { texelMM (the tier's texel on the skin: hero 0.031, lod1 0.062, lod2 0.25), seed, palette (hex
 *              overrides), strength ({ layer: k } multipliers of LAYERS, for tests and morphs) }
 */
export function patternContext(fish, o = {}) {
  const f = fish?.hl ?? fish;
  const seed = o.seed ?? 3;
  const texHL = (o.texelMM ?? 0.031) / HL;
  const pal = Object.fromEntries(Object.entries({ ...PALETTE, ...(o.palette ?? {}) }).map(([k, h]) => [k, hexToLinear(h)]));
  const prof = buildProfile(f);
  const arm = armField(BODY_SCULPT);
  const R = (i, j) => h01(i, j, 17, seed);
  // the dorsal saddles (behaviour §2.2.2): u at the midline, half-width (TL), forward slant (TL per unit v), lower end
  const saddles = [0.25, 0.35, 0.46, 0.57, 0.68, 0.79].map((u, i) => ({
    u: u + (R(i, 1) - 0.5) * 0.012, hw: 0.021 + R(i, 2) * 0.008, slant: 0.05 + R(i, 3) * 0.03, vEnd: 0.36 + R(i, 4) * 0.09,
    k: 0.75 + R(i, 5) * 0.2,
  }));
  // the mid-lateral blotches (§2.2.3): u, v, half-length (TL), half-height (v), whether it reaches up into its saddle
  const blotches = [0.24, 0.31, 0.40, 0.47, 0.55, 0.66, 0.75, 0.82].map((u, i) => ({
    u: u + (R(i, 11) - 0.5) * 0.01, v: 0.45 + (R(i, 12) - 0.5) * 0.06, hu: 0.020 + R(i, 13) * 0.014, hv: 0.13 + R(i, 14) * 0.07,
    k: i === 7 ? 0.95 : 0.7 + R(i, 15) * 0.25, up: R(i, 16) > 0.45 ? 0.14 : 0,
  }));
  // the lower flank's barcode (§2.2.4): 16–20 bars over u 0.30–0.82, period 0.027 TL
  const barcode = [];
  for (let u = 0.30, i = 0; u <= 0.825; u += 0.027, i++) barcode.push({ u: u + (R(i, 21) - 0.5) * 0.008, v0: 0.44 + R(i, 22) * 0.08, v1: 0.70 + R(i, 23) * 0.1, k: 0.55 + R(i, 24) * 0.45 });
  // the brown spot rows (§2.2.5): v, spacing, size (TL)
  // (B010, A005: the upper flank's most conspicuous mark, dense dark brown spots 0.6–1.2 % TL in loose rows)
  const rows = [{ v: 0.22, k: 0.8 }, { v: 0.31, k: 0.9 }, { v: 0.40, k: 0.85 }, { v: 0.50, k: 0.6 }].map((r, i) => {
    const spots = [];
    for (let u = 0.215 + R(i, 31) * 0.01, j = 0; u < 0.86; j++) {
      spots.push({ u: u + (R(j, 40 + i) - 0.5) * 0.005, dv: (R(j, 50 + i) - 0.5) * 0.07, r: 0.008 + R(j, 60 + i) * 0.004, on: R(j, 70 + i) < (i === 3 ? 0.6 : 0.82) });
      u += 0.015 + R(j, 80 + i) * 0.010;
    }
    return { ...r, spots };
  });
  // the excitement crossbands (§2.6), for the `bars` mask
  const xbands = [0.22, 0.32, 0.43, 0.54, 0.65, 0.76].map((u, i) => ({ u: u + (R(i, 91) - 0.5) * 0.01, hw: 0.018 + R(i, 92) * 0.006 }));
  const means = spotMeans(), granMeans = granuleMeans();
  // (the sealed head: the depth of the mouth's and the gill pockets' walls under the closed skin)
  const sealed = sealedFishSDF({ minimal: true });
  const alpha = Object.fromEntries(Object.entries(LAYERS).map(([k, a]) => [k, a * (o.strength?.[k] ?? 1)]));
  return { f, seed, texHL, pal, prof, arm, saddles, blotches, barcode, rows, xbands, means, granMeans, sealed, alpha, tmp: { yT: 0, yB: 0 } };
}

/** A spot layer at the tier's texel: the spots where they are ≥ 1.5 texels across, their mean tone where they are not. */
function spotsAt(ctx, key, q, w, dens, out) {
  const L = SPOTS[key];
  const k = (2 * L.r) / ctx.texHL;
  const full = sstep(1.0, 2.2, k);
  const mean = ctx.means[key] * dens;
  if (full <= 0) { if (out) out.h = 0; return mean; }
  const a = L.r * 0.35 / L.cell;
  const cov = spotLayer(q[0] + w[0] * L.cell * a, q[1] + w[1] * L.cell * a, q[2] + w[2] * L.cell * a, L, dens, ctx.texHL * 0.7, out);
  return mean + (cov - mean) * full;
}

// ------------------------------------------------------------------------------------------------- skin colour
const _w = [0, 0, 0], _c = [0, 0, 0], _k = [0, 0, 0], _h = [0, 0, 0], _o = { h: 0 }, _wo = { f1: 0, f2: 0, id: 0 };

/**
 * The skin's albedo at a fish-frame point.
 * @param p     [s, y, z] fish mm (the bind pose; the eye cap's at rest)
 * @param n     the surface normal there (fish frame, unit) — used for the head's underside
 * @param part  'head' | 'body' | 'lobe' | 'lip' | 'eyeSkin' | 'interior' | 'teeth' | null (CHART_PART; head, body, lobe
 *              and lip are resolved from the position, so they and null are the same outer skin; null — the patch's
 *              islands — is lining where it lies inside the mouth or a gill pocket)
 * @returns { rgb: [r, g, b] linear, bars: 0..1 the excitement crossbands' mask }
 */
export function skinColour(p, n, part, ctx) {
  const P = ctx.pal, A = ctx.alpha;
  const q = [p[0] / HL, p[1] / HL, p[2] / HL];
  const x = q[0], y = q[1], z = q[2], az = Math.abs(z), side = z >= 0 ? 1 : -1;
  if (part === 'teeth') return { rgb: P.teeth.slice(), bars: 0 };
  // the shared warp (wavelength ~0.035 HL) the spots and edges are displaced by
  _w[0] = perlin3(x * 28, y * 28, z * 28, ctx.seed + 101); _w[1] = perlin3(x * 28 + 7.1, y * 28, z * 28, ctx.seed + 102); _w[2] = perlin3(x * 28, y * 28 + 3.3, z * 28, ctx.seed + 103);
  // the inside of the mouth, the gill pockets and the eye sockets: the skin's own colour at their rims (the lips'
  // margins, the gill flap's edge, the cup's rim are the charts' seams with the outer skin), the lining's deeper in; a
  // patch island (part null) inside the mouth or a gill pocket is lining too, by the same depth
  if (part === 'interior' || ((part === null || part === undefined) && ((x < 0.5 && y < 0.26) || (x > 0.7 && x < 1.12 && y > 0.1 && y < 0.45)))) {
    const [ic, w] = interiorColour(q, ctx, part === 'interior');
    if (w > 0) {
      const ext = skinColour(p, n, 'skin', ctx).rgb;
      return { rgb: ext.map((e, i) => e + (ic[i] - e) * w), bars: 0 };
    }
  }

  // ---- the section frame: u along TL, v by height in the section; both warped by low-frequency noise so no band's
  // edge is a straight line
  const pr = ctx.prof.at(x, ctx.tmp), depth = Math.max(0.02, pr.yT - pr.yB);
  const v0 = (pr.yT - y) / depth, u = x / TLH;
  const lf1 = fbm(x * 3.1, y * 3.1, z * 3.1, 3, ctx.seed + 1), lf2 = fbm(x * 9, y * 9, z * 9, 3, ctx.seed + 2);
  const v = v0 + 0.035 * lf1 + 0.02 * lf2, vC = sat(v);
  const uw = u + 0.006 * fbm(x * 7, y * 7, z * 7, 2, ctx.seed + 3) + 0.003 * lf2;

  // ---- where: the head (in front of the opercle's margin, with its ragged edge), the nape (the head top's marks run
  // on to 1.5 HL), the trunk, the eye's cap
  const sm = marginS(y);
  const head = 1 - sstep(sm - 0.02, sm + 0.07, x + 0.02 * lf2);
  const trunk = 1 - head;
  const nape = 1 - sstep(1.0, 1.5, x);
  const eyeCap = part === 'eyeSkin' ? 1 : 0;
  const headish = Math.max(head, eyeCap);

  // ---- ground: the trunk's countershading (§2.2.1) and the head's tone bands
  const c = _c;
  lerp3(P.dorsum, P.flankUpper, sstep(0.14, 0.38, v), c);
  blend(c, P.flankLower, sstep(0.48, 0.60, v));
  blend(c, P.belly, sstep(0.76, 0.90, v));
  if (head > 0) {
    // head: top → cheek (0.24–0.42) → the cheek's pale lower half (0.58–0.80) → the throat (0.84–0.97)
    const h = lerp3(P.headTop, P.cheek, sstep(0.24, 0.42, v), _h);
    blend(h, P.cheekOlive, sat(0.5 + 0.9 * lf1) * 0.45 * sstep(0.25, 0.4, v));
    blend(h, P.cheekLow, sstep(0.58, 0.80, v));
    blend(h, P.belly, sstep(0.84, 0.97, v));
    // the head's underside (the flat throat facing down): the throat's cream
    if (n) blend(h, P.belly, sstep(-0.35, -0.75, n[1]) * sstep(0.55, 0.75, v));
    blend(c, h, head);
  }
  // a low-frequency mottle in value and warmth (±6 %): the ground is never flat
  {
    const m = 1 + 0.06 * lf1 + 0.04 * lf2;
    c[0] *= m * (1 + 0.02 * lf2); c[1] *= m; c[2] *= m * (1 - 0.03 * lf2);
  }

  // ---- the head's medium mottling: darker clouds 0.05–0.1 HL across on the head top, snout and cheek (B002, B010)
  if (headish > 0 || nape > 0) {
    const mt = sstep(0.05, 0.45, fbm(x * 11, y * 11, z * 11, 3, ctx.seed + 13) + 0.25 * _w[0]);
    blend(c, P.headBlotch, mt * A.mottle * Math.max(headish, nape * 0.7) * (1 - sstep(0.7, 0.88, v)));
  }

  // ---- the head's reticulation (B010, B064, A008: "pale dots on a dark net"): the cheek's, snout's, opercle's and
  // the eye turret's skin a mosaic of rounded pale cream granules ~0.012 HL in radius (0.03 HL apart) set in a darker
  // olive-brown matrix; in the head's darker clouds the granules shrink and the matrix darkens (the clouds are the
  // granules' density, not paint over them); a few granules dark (melanophore clusters) or mid-toned; finer on the
  // eye's cap (its stipple). Edges roughened by fine noise: blobs, not tiles
  if (headish > 0 || nape > 0) {
    const cs = eyeCap ? 0.018 : 0.03;
    const wr = Math.max(headish, nape * 0.6) * (1 - sstep(0.8, 0.93, v)) * (eyeCap ? 0.75 : 1);
    const full = sstep(1.5, 3.5, (0.4 * cs) / ctx.texHL);
    if (wr > 0) {
      worley3((x + 0.45 * cs * _w[0]) / cs, (y + 0.45 * cs * _w[1]) / cs, (z + 0.45 * cs * _w[2]) / cs, ctx.seed + 201, _wo);
      const cloud = sstep(-0.1, 0.45, fbm(x * 9, y * 9, z * 9, 3, ctx.seed + 202));
      const rough = 0.12 * perlin3(x * 200, y * 200, z * 200, ctx.seed + 203) + 0.06 * perlin3(x * 450, y * 450, z * 450, ctx.seed + 204);
      const gran = granule(_wo, cloud, rough, (0.7 * ctx.texHL) / cs + 0.06), tone = granTone(_wo.id);
      // (where the granules are under ~3 texels, their means at this cloud (granuleMeans): the coverage, the pale and
      // the dark shares; the matrix darkens the ground by the net's tint, so it stays the ground's own hue, deeper and
      // more saturated)
      const M = ctx.granMeans, fi = cloud * 4, i0 = Math.min(3, Math.floor(fi)), ft = fi - i0;
      const mg = M[i0].g + (M[i0 + 1].g - M[i0].g) * ft, mp = M[i0].pale + (M[i0 + 1].pale - M[i0].pale) * ft, md = M[i0].dark + (M[i0 + 1].dark - M[i0].dark) * ft;
      const g = mg + (gran - mg) * full, gp = mp + ((tone > 0 ? gran * tone : 0) - mp) * full, gd = md + ((tone < 0 ? gran : 0) - md) * full;
      _k[0] = c[0] * P.netTint[0]; _k[1] = c[1] * P.netTint[1]; _k[2] = c[2] * P.netTint[2];
      blend(c, _k, (1 - g) * A.net * wr * (0.55 + 0.6 * cloud));
      // (the pale granule: the ground lifted toward cream, so the head's calibrated ground carries its granules along)
      _k[0] = Math.min(c[0] * 1.5, 0.5 * (c[0] * 1.5) + 0.5 * P.cellPale[0]); _k[1] = Math.min(c[1] * 1.5, 0.5 * (c[1] * 1.5) + 0.5 * P.cellPale[1]); _k[2] = Math.min(c[2] * 1.5, 0.5 * (c[2] * 1.5) + 0.5 * P.cellPale[2]);
      blend(c, _k, gp * A.cellPale * wr);
      blend(c, P.speckle, gd * A.cellDark * wr * 0.7);
    }
  }

  // ---- the skin's fine granular mottle (B010, u1, B002: the head's skin reads as tan grain, not as dots on a plain
  // ground): two octaves of noise at ~0.004 HL, dark where high and pale where low, strongest on the head, faint on the
  // trunk; its mean is neutral, so a texel too coarse for it simply leaves it out
  {
    const full = sstep(1.2, 2.4, 0.0036 / ctx.texHL);
    if (full > 0) {
      const g = perlin3(x * 140, y * 140, z * 140, ctx.seed + 15) + 0.5 * perlin3(x * 295, y * 295, z * 295, ctx.seed + 16);
      const w = A.grain * full * (0.55 + 0.45 * headish) * (1 - sstep(0.8, 0.95, v));
      blend(c, P.speckle, sstep(0.16, 0.5, g) * w);
      blend(c, P.paleWarm, sstep(-0.16, -0.5, g) * w * 0.8);
    }
  }

  // ---- dark marks on the trunk and nape: the dusky band, the saddles, the blotches (§2.2.2–3), each broken into
  // sub-blotches by a mid-frequency noise and ragged at the edge by a fine one
  let dark = 0;
  if (trunk > 0) {
    const brk = 0.5 * fbm(x * 20, y * 20, z * 20, 3, ctx.seed + 4) + 0.28 * fbm(x * 55, y * 55, z * 55, 2, ctx.seed + 5);
    // (a saddle is a cluster of sub-blotches, not a painted band: its opacity broken by a mid-frequency mask)
    const patch = sstep(0.2, 0.62, 0.5 + 0.7 * fbm(x * 26, y * 26, z * 26, 2, ctx.seed + 14) + 0.3 * _w[1]);
    for (const s of ctx.saddles) {
      const uc = s.u - s.slant * vC, hw = s.hw * (1 - 0.45 * sat(vC / s.vEnd));
      const du = (uw - uc) / hw;
      if (Math.abs(du) > 2.2) continue;
      const shape = Math.min(1 - Math.abs(du), (s.vEnd - v) / 0.08) + brk;
      dark = Math.max(dark, sstep(0.05, 0.4, shape) * s.k * A.saddle * (1 - 0.6 * sstep(0.05, s.vEnd, vC)) * patch);
    }
    for (const b of ctx.blotches) {
      const du = (uw - b.u) / b.hu;
      if (Math.abs(du) > 2.5) continue;
      const dvv = v < b.v ? (v - b.v) / (b.hv + b.up) : (v - b.v) / b.hv;
      const shape = 1 - Math.sqrt(du * du + dvv * dvv) + brk;
      dark = Math.max(dark, sstep(0.05, 0.38, shape) * b.k * A.blotch);
    }
    // the dusky band along v 0.40–0.55, over the blotch series
    const band = sstep(0.33, 0.43, v) * (1 - sstep(0.52, 0.62, v)) * sstep(0.21, 0.26, u) * (1 - sstep(0.82, 0.87, u));
    dark = Math.max(dark, band * A.band * (1 + 0.5 * lf2));
    dark *= trunk;
    blend(c, lerp3(P.saddle, P.saddleCool, sat(0.5 + lf2), _k), dark);
  }

  // ---- the head's marks: vermiculation, the post-orbital streak
  if (headish > 0 || nape > 0) {
    // vermiculation: worm-like dark lines running lengthways on the head top, the snout and the nape (B050, A040)
    const topW = sstep(0.32, 0.16, v) * (1 - sstep(1.25, 1.6, x));
    const snoutW = sstep(0.22, 0.12, x) * sstep(0.75, 0.45, v);
    const vw = Math.max(topW, snoutW) * (1 - 0.5 * eyeCap);
    if (vw > 0) {
      const wx = x + 0.04 * fbm(x * 8, y * 8, z * 8, 2, ctx.seed + 6);
      const r = perlin3(wx * 9, y * 26 + 0.3 * _w[0], z * 26 + 0.3 * _w[1], ctx.seed + 7);
      const lw = 0.075; // the line's half-width in noise units (~0.01 HL)
      const line = 1 - sstep(lw * 0.5, lw * 1.6, Math.abs(r));
      const brk = sstep(-0.15, 0.25, fbm(x * 14, y * 14, z * 14, 2, ctx.seed + 8));
      const full = sstep(1.0, 2.5, 0.016 / ctx.texHL);
      blend(c, P.vermic, vw * A.verm * (0.15 + (line * brk - 0.15) * full));
    }
    if (head > 0) {
      // the post-orbital streak: from behind the eye down and back over the upper opercle (A052/B064, A007)
      const a0 = 0.47, a1 = 0.57, b0 = 0.92, b1 = 0.36;
      const abx = b0 - a0, aby = b1 - a1, t = sat(((x - a0) * abx + (y - a1) * aby) / (abx * abx + aby * aby));
      const d = Math.hypot(x - a0 - abx * t, y - a1 - aby * t), wdt = 0.040 + 0.02 * t;
      const st = (1 - sstep(wdt * 0.5, wdt * 1.4, d + 0.012 * lf2)) * sstep(0.0, 0.12, t) * (1 - sstep(0.85, 1.0, t)) * sstep(0.12, 0.2, az);
      blend(c, P.axilMark, st * A.streak * (0.8 + 0.4 * fbm(x * 30, y * 30, z * 30, 2, ctx.seed + 9)) * head);
    }
  }
  // the opercular-margin bar (B067) and the axilla mark at the pectoral base (B067, A052): just behind the margin, from
  // the cover's top down to the fin's base, merging below into the axilla's dark patch
  {
    let bar = 0;
    const dm = x - (sm + 0.035);
    if (Math.abs(dm) < 0.15 && y > 0.06 && y < 0.6) {
      const wv = 0.03 + 0.008 * fbm(x * 20, y * 20, z * 20, 2, ctx.seed + 10);
      bar = (1 - sstep(wv * 0.6, wv * 1.6, Math.abs(dm + 0.01 * lf2))) * sstep(0.10, 0.2, y) * (1 - sstep(0.47, 0.56, y)) * sstep(0.15, 0.22, az) * A.opBar;
    }
    const ax = Math.hypot((x - 1.155) / 0.08, (y - 0.33) / 0.09);
    bar = Math.max(bar, (1 - sstep(0.6, 1.25, ax + 0.25 * lf2)) * sstep(0.18, 0.24, az) * A.axilla);
    blend(c, P.axilMark, bar * (1 - eyeCap));
  }

  // ---- the barcode on the lower flank (§2.2.4): narrow vertical bars, period 0.027 TL
  if (trunk > 0 && u > 0.27 && u < 0.86 && v > 0.38 && v < 0.9) {
    let bc = 0;
    const wig = 0.004 * fbm(x * 18, y * 18, z * 18, 2, ctx.seed + 12);
    for (const b of ctx.barcode) {
      const du = Math.abs(uw + wig - b.u);
      if (du > 0.012) continue;
      const along = sstep(b.v0 - 0.03, b.v0 + 0.03, v) * (1 - sstep(b.v1 - 0.04, b.v1 + 0.03, v));
      bc = Math.max(bc, (1 - sstep(0.003, 0.0075, du)) * along * b.k);
    }
    const full = sstep(3.0, 6.0, (0.011 * TLH) / ctx.texHL);
    bc = 0.19 + (bc - 0.19) * full; // (the mean where the bars are under ~4 texels: lod2)
    blend(c, P.barDark, bc * A.barcode * trunk * sstep(0.27, 0.31, u) * (1 - sstep(0.82, 0.86, u)) * sstep(0.38, 0.45, v) * (1 - sstep(0.8, 0.9, v)));
  }

  // ---- the dark brown spot rows on the upper and middle flank (§2.2.5: v 0.25, 0.35, 0.5)
  if (trunk > 0 && u > 0.2 && u < 0.88 && v < 0.66) {
    let sp = 0;
    for (const row of ctx.rows) {
      if (Math.abs(v - row.v) * depth > 0.08) continue;
      for (const s of row.spots) {
        const du = (uw - s.u) * TLH;
        if (du > 0.06) continue;
        if (du < -0.06) break;
        if (!s.on) continue;
        const dd = Math.hypot(du, (v - row.v - s.dv) * depth), r = s.r * TLH * 0.5, aa = 0.7 * ctx.texHL;
        const k = (1 - sstep(r * 0.65 - aa, r * 1.25 + aa, dd + 0.15 * r * _w[0])) * row.k;
        if (k > sp) sp = k;
      }
    }
    const full = sstep(2.5, 4.5, (0.010 * TLH) / ctx.texHL);
    sp = 0.16 + (sp - 0.16) * full; // (the rows' mean coverage where a spot is under ~3 texels: lod2)
    blend(c, P.brownSpot, sp * A.spotRow * trunk * sstep(0.2, 0.24, u) * (1 - sstep(0.84, 0.88, u)));
  }
  // ---- the lower flank's rust-brown dots in loose rows (v 0.5–0.75)
  if (trunk > 0 && v > 0.42 && v < 0.82) {
    const dens = sstep(0.44, 0.52, v) * (1 - sstep(0.74, 0.84, v)) * sstep(0.21, 0.26, u) * (1 - sstep(0.8, 0.86, u)) * 0.85;
    const rs = spotsAt(ctx, 'rust', q, _w, dens, null);
    blend(c, P.rustSpot, rs * A.rust * trunk);
  }

  // ---- fine peppering over v 0–0.7 (fading by 0.8; §2.2.6) and the head's speckles
  {
    const dens = (1 - sstep(0.62, 0.86, v) * 0.6 - sstep(0.8, 0.9, v) * 0.4) * (0.62 + 0.3 * sat(0.5 + lf2)) * (1 - 0.5 * headish);
    blend(c, P.speckle, spotsAt(ctx, 'pepper', q, _w, dens, null) * A.pepper);
    if (headish > 0) blend(c, P.speckle, spotsAt(ctx, 'speck', q, _w, (1 - sstep(0.75, 0.92, v)) * 0.6, null) * A.speck * headish);
  }

  // ---- pale spots (§2.2.7): dense on the cheek and opercle, medium on the head top and nape, dashes on the upper
  // flank; the fine pale salt over the whole head
  {
    const cheekW = head * sstep(0.18, 0.32, v) * (1 - sstep(0.62, 0.78, v)) * sstep(0.35, 0.5, x);
    const topW = head * sstep(0.35, 0.18, v) * 0.3 + nape * trunk * sstep(0.35, 0.18, v) * 0.25;
    const dens = Math.min(1, cheekW * 0.62 + topW);
    if (dens > 0) {
      const pv = spotsAt(ctx, 'pale', q, _w, dens, _o);
      blend(c, lerp3(P.paleSpot, P.paleWarm, (_o.h & 255) / 255, _k), pv * A.pale);
    }
    const dashW = trunk * sstep(0.12, 0.2, v) * (1 - sstep(0.42, 0.5, v)) * sstep(0.22, 0.27, u) * (1 - sstep(0.55, 0.66, u));
    if (dashW > 0) {
      const dv = spotsAt(ctx, 'dash', q, _w, dashW * 0.75, _o);
      blend(c, lerp3(P.paleSpot, P.paleWarm, ((_o.h & 255) / 255) * 0.6, _k), dv * A.dash);
    }
    {
      // the fine pale salt: over the whole head, and on the trunk's back and flanks (B067, A030, B010: the flank's
      // texture runs both ways from a mid-tone ground, pale flecks among the pepper)
      const dens = (0.4 + 0.35 * sat(0.5 + lf1)) * (1 - sstep(0.8, 0.95, v)) * Math.max(headish, trunk * A.trunkSalt * (1 - sstep(0.62, 0.8, v)));
      if (dens > 0) {
        const sl = spotsAt(ctx, 'salt', q, _w, dens, _o);
        blend(c, lerp3(P.paleSpot, P.paleWarm, (_o.h & 255) / 255, _k), sl * A.salt);
      }
    }
  }

  // ---- the pale cream crescent under the eye (the collar under the window, FST §4, FFT §2.3)
  if (head > 0 && x > 0.15 && x < 0.55 && y > 0.4 && y < 0.66 && az > 0.06) {
    const er = Math.hypot((x - HEAD.eye.s) / 0.13, (y - 0.535) / 0.05);
    const cr = (1 - sstep(0.75, 1.25, er + 0.15 * lf2)) * sstep(0.12, 0.2, az);
    blend(c, P.crescent, cr * A.crescent);
  }

  // ---- the lips: the pads pale cream and finely stippled, the median lip and the lower lip's thin pale line
  if (x < 0.42 && y < 0.24) {
    const PD = HEAD_SCULPT.pad, J = HEAD_SCULPT.jaw, qa = [x, y, az];
    const dPad = Math.min(tubeDist(qa, PD.path, PD.radius, PD.sy), tubeDist(qa, PD.median.path, PD.median.radius));
    const dLow = tubeDist(qa, J.lip.path, J.lip.radius);
    const wl = Math.max(1 - sstep(0.003, 0.012, dPad), (1 - sstep(0.002, 0.008, dLow)) * 0.85) * A.lip;
    if (wl > 0) {
      blend(c, lerp3(P.lip, P.cheekLow, 0.3 * sat(0.5 + lf2), _k), wl);
      const st = spotsAt(ctx, 'speck', [x * 1.25, y * 1.25, z * 1.25], _w, 0.55, null);
      blend(c, P.lipStipple, st * A.lipStipple * wl);
    }
  }

  // ---- the pectoral lobe: ochre-tan, opaque, finely dotted (past the root pad, where the axilla mark stays)
  {
    const lp = lobeParam(q, side);
    if (lp.t > 0.05 && lp.r < 0.16) {
      const dArm = ctx.arm(x, y, az);
      const wlb = (1 - sstep(0.004, 0.022, dArm)) * sstep(0.12, 0.42, lp.t) * A.lobe;
      if (wlb > 0) {
        blend(c, lerp3(P.pectLobe, P.flankLower, 0.12 * sat(0.5 + lf2), _k), wlb);
        blend(c, P.lobeDot, spotsAt(ctx, 'lobeDot', q, _w, 0.5, null) * A.lobeDot * wlb);
      }
    }
  }

  // ---- the eye's skin cap: the head's skin round it, a little more olive
  if (eyeCap) blend(c, P.eyeCap, A.eyeCapOlive);

  // ---- the excitement crossbands' mask (§2.6)
  let xb = 0;
  if (u > 0.18 && u < 0.84 && !eyeCap) {
    for (const b of ctx.xbands) {
      const du = Math.abs(uw - (b.u - 0.03 * vC)) / b.hw;
      xb = Math.max(xb, (1 - sstep(0.6, 1.3, du + 0.4 * lf2)) * (1 - sstep(0.75, 0.92, v)));
    }
  }
  return { rgb: [Math.max(0, c[0]), Math.max(0, c[1]), Math.max(0, c[2])], bars: xb };
}

/** The inside of the mouth, the gill pockets and the eye sockets (part 'interior'), by position: the lining's colour
 * and its weight against the outer skin's. The mouth and the gill pockets weigh in by their depth inside the sealed
 * head (seal.mjs: no slit, no pocket; the lips' margins and the flap's edge lie on it, so they keep the skin's colour
 * and the lining fades in over 0.004–0.02 HL inside); the eye's socket (the cup's lining facing the globe, seen only
 * as a sliver when the eye turns or blinks) a translucent grey-olive over the head's skin. */
function interiorColour(q, ctx, socket = true) {
  const P = ctx.pal, x = q[0], y = q[1], az = Math.abs(q[2]);
  const de = Math.hypot(x - HEAD.eye.s, y - HEAD.eye.y, az - HEAD.eye.z);
  if (de < 0.2) return [P.socket, socket ? 0.35 : 0];
  const depth = -ctx.sealed(x, y, q[2]);
  const w = sstep(0.004, 0.02, depth);
  if (x > 0.62) return [lerp3(P.gill, P.cheekLow, 0.15 * sat(0.5 + _w[0]), [0, 0, 0]), w];
  // (deeper in, toward the pharynx, the lining darkens)
  return [lerp3(P.mouth, P.mouthDeep, sstep(0.24, 0.46, x), [0, 0, 0]), w];
}
