// The トビハゼ's skin colour (round T1, key `pattern`; reworked in round T2): the albedo of every skin texel as a
// function of its fish-frame position (bake.mjs: the bake is position based, so the charts' seams are continuous and
// every tier bakes the same fish from the same functions). behaviour.md §2.1–2.2 (body_fins_colour §3, §6.3–6.4;
// face_side_34 §3–4, face_front_top §5; anat_soft §1.1) give the layers and their places, the photos their look.
//
// Round T2 (the T1 review: colour 4/10 — an even leopard field of brown dots, a cream granule mosaic on the head, a plain
// pale lobe, the marks a saturated warm brown): the LARGE structure first, the fine layers under it. Calibrated under the
// tech key's canonical photo light (reference viewer LIGHT.photo: the game's AgX at the day exposure, a grey card 0.18 at
// sRGB 118) at the photos' own cameras, in the pattern's own frame (u, v), against independent photos — u1 (the owner's),
// B010 (A005 is the same fish at the same moment: counted once, not used), B067, A030, A070, B002 — scratchpad
// ref/work/t2_pattern (py/trunk.py: band contrast per scale, countershading, the hue of ground and marks, the dark marks'
// count and size; py/regions.py: region colours, ΔE2000). The layers, large to fine:
//   trunk  countershading (a darker olive-grey back, a grey-olive upper flank, a silvery-cream lower flank, a pale belly);
//          6 dorsal saddles (dark slate-brown, 70–90 %); 8 mid-lateral slate blotches (v ~0.4) merging into a dusky band
//          along v 0.26–0.54 (u1: its band at v 0.3–0.55 in the rectified photo); the barcode's vertical bars over the mid
//          and lower flank (A030, A070); u1's / B010's short white vertical dashes on the upper flank (v 0.05–0.46),
//          breaking into the band from above; then, subordinate, B010's dark-brown spot rows, the lower flank's rust spots
//          (u1, B010), a sparse fine pepper and a fine grain (the flank's texture between the marks)
//   head   a smooth olive ground with soft pale and darker clouds (u1), sparse fine dark flecks (denser behind and below
//          the eye and on the snout top), B010's fine pale stipple (~0.1 mm granules, low contrast), B050's bold
//          lengthwise vermiculation on the head top and nape, the post-orbital streak, the opercular bar and the axilla
//          mark (B067), the pale crescent under the eye, olive-tan lip pads — no granule mosaic
//   eyes   round each globe (part 'eyeSkin', and the head skin within ~1.3 globe radii of an eye's centre, so the cap
//          and its turret agree whichever part the bake passes): finer and smoother than the head — a finer stipple, no
//          vermiculation, no clouds, a little more olive
//   lobe   an ochre-tan wash (B010's warmth, part olive: u1) over the body's colour, speckled like the body (u1) with
//          B010's fine dark streaks along the limb, its outer face a little darker
// Measured (photo light, matched cameras, the pattern frame; the round's notes in t2_pattern): band contrast per scale,
// render ÷ photo median over u1, A030, A070, B067, B010 — large (2–8 % TL) 0.92, mid (0.8–2 %) 0.83, fine (0.3–0.8 %)
// 0.73 (T1 pattern on the same build: 0.44 / 0.69 / 0.65, the fine above the large: the leopard); the dark marks' count
// and median area against u1 0.88× / 1.36× (T1 3.38× / 0.12×); u1's lower flank 11.4 L* over its mid flank (photo 9.6,
// T1 0.4); region colours against the independent photos' median ΔE2000 (cheek 7.3, dorsum 4.9, flanks 2.4–3.7, head
// top 2.2, lobe 4.2; T1 2.4–20.1); the ground's chroma 4.5–4.9 (photos' median 2.1), the marks' 4.1–4.9 (T1 10.3–10.8);
// the lip pad at B010's camera L* 56.6 against the photo's 56.7, ΔE2000 3.8 (T1 12.4).
//
//
// Round T3 (the T2 colour review: 5.5 — the fish rendered neutral GREY, C 3.5–4.5, where u1, the owner's photo, is a warm
// olive / golden-olive, C 6–17 on the flank and 12 on the cheek; the head flat, cheek p90 − p10 13 L* against u1's 34; the
// band a uniform stripe; the rust dots salmon; the lobe a peach limb; the dashes decals): u1 FIRST. Calibrated under the
// canonical photo light at u1's camera with PER-PHOTO gates (no cross-photo median: the median of n = 2…5 photos of
// different fish under different light pulled the palette grey; the 'ground chroma 2.1' of T2's header was u1's sky
// sheen) — the median L*a*b* with the specular top 8 % of L* left out, ΔE2000 per photo-region pair (scratchpad
// ref/work/t3_pattern: py/gates.py, py/lumchroma.py the chroma by luminance quartile, py/marks.py, py/blobs.py,
// py/trunk.py, py/morphgate.py). The layers that changed:
//   palette  golden-olive grounds (flank lower C 14, belly C 15, cheek C 20, lip C 19), brown rust (h 74, not 62),
//            an olive-tan lobe (C 16, its chroma the cheek's), olive-brown flecks and collar
//   head     u1's structure: the flecks gathered into CLUSTERS (`clu`: olive-brown smudges behind and below the eye, on the
//            upper cheek and the snout) over a fine IRREGULAR MOTTLE of pale cream and dark flecks (microAt: thresholded
//            gradient noise, no cells — not T1's granule mosaic), the cream lower cheek, bold pale cheek dots (B006,
//            B010) varied in tone, the cup's dark collar under the globe (u1), the eye's turret stippled
//   trunk    the band = the blotches MERGED (its strength falls off between them), the blotches darker, ragged and grained
//            inside; the dashes denser, soft, warped and grained, each its own tone (aspect ~1.5 as u1's); the rust
//            dots soft-edged, grained, brown; B067's dense fine brown specks; the barcode irregular (widths, gaps) and
//            light in the bake (u1's) — the runtime's `bars` strengthens it: the barred morph (A030, A070)
//   output   `bars` (baseColor A) = the excitement crossbands AND the barcode's bars; `band` (the band's and blotches'
//            mask) for a band-strength morph if a runtime channel is given to it (RUNTIME_CONTRACT.md §7)
// Measured (final tiers; the t3_pattern notes): u1 ΔE2000 cheek 4.3, flank 4.5 / 1.5 / 2.4 (upper / mid / lower), belly
// 3.9, lobe 2.3, lip 3.7 (gate ≤ 6; T2 7.8 / 8.7 / 5.8 / 5.4 / 7.7 / 6.0 / 6.6); the cheek's chroma by luminance quartile
// 13.9 / 12.8 / 11.8 / 10.6 against u1's 14.3 / 13.4 / 12.0 / 9.7; head DoG IQR 0.21 (u1 0.30, T2 0.11), pale p95 − p5
// 0.61–0.67 (T2 0.30); the band varies along the body by 4.2 L* (u1 6.0, T2 1.4); the rust cores L 43 C 13 h 72 (u1
// 38 / 11 / 75, T2 50 / 16 / 62). The secondary photos are individuals of this one texture under the runtime's uniforms:
// A030 the grey-mud tint and bars, A070 bars 1 (lower-flank bars 0.98–1.14 × the photos'), B067 a darker tint, B010 a
// golden one (t3_pattern_morph.jpg).
//
// Use (the bake orchestrator, per tier): ctx = patternContext(fishSDFmm(HL), { texelMM }) once — texelMM the tier's
// skin texel (hero 2048: 0.031, lod1 1024: 0.062, lod2 256: 0.25), then per covered texel of the body atlas
// skinColour(p, n, CHART_PART[chart], ctx).rgb with p the texel's fish-frame point in mm (the bind pose; tiers.mjs's
// object frame back through anatomy.toObject) and n its normal (fish frame). The eyeSkin rect: p on the globe at rest
// (part 'eyeSkin' or 'head': the same colour near the cup's rim). The teeth swatch: part 'teeth'.
//
// Frames (HL units inside; the API takes fish mm):
//   body   u = s / TL (0 at the snout), v = 0 on the dorsal midline → 1 on the ventral one, by height in the section
//          (v = (yT − y) / (yT − yB), the top and bottom of the fish at z = 0 at that s: what a lateral photo measures);
//          the trunk's layers live in (u, v), domain-warped by 3D noise of the position so no edge is straight
//   head   its own places in HL (anatomy.mjs HEAD; head.mjs HEAD_SCULPT's pad, jaw, opercle and eye cup), the same v for
//          its tone bands; the head's layers fade into the trunk's behind the opercle's margin (its path from head.mjs)
//   lobe   the pectoral arm (body.mjs armField / lobeParam): on its surface past the shoulder's root pad
// Spots are jittered 3D lattices (the spot's visible disc is the slice of its ball the skin cuts: sizes vary
// naturally), lines are ridged noise, bands and blotches are shapes in (u, v) with fbm edges: nothing tiles.
// Tiers: patternContext(fish, { texelMM }) sets the texel size; a layer whose features fall under ~0.5–1.5 texels is
// replaced by its mean tone (the mip-average the hero's map has there; the 2D marks' and the rows' and bars' means by v,
// the vermiculation's measured), so the far tiers keep the hero's colour and drop only what they cannot hold — lod2 at
// 256 keeps the gradient, the saddles, blotches and band, and (round T2) the dashes, spot rows, bars and the head's
// vermiculation at about a texel (the bake's 2 × 2 supersample filters them): its detrended L* field against the
// hero's at the same camera correlates 0.89–0.91 side, 0.91–0.92 3/4 at 1200–140 px (0.74–0.79 from above; T1 pattern
// 0.67–0.94 side, 0.62–0.74 above); lod1 0.88–0.98 at every width down to 48 px.
//
// Output channels (for the material's runtime layers, contract §5): rgb (linear albedo), `bars` 0..1 the excitement
// crossbands' mask (behaviour §2.6: 5–7 dark bands from the occiput to the peduncle shown under disturbance; a uniform
// darkens rgb by bars × k — packed into the body colour's A). The barcode is baked (the A channel is the bars').
import { HL, TL, HEAD, EYE_MM } from './anatomy.mjs';
import { BODY_SCULPT, trunkProfile, lobeParam, armField } from './body.mjs';
import { HEAD_SCULPT } from './head.mjs';
import { sealedFishSDF } from './seal.mjs';
import { perlin3, hash3i } from '../../lib/noise.mjs';
import { granuleAt, GRANULE_PALE } from './surface.mjs';

/** TL in head lengths. */
const TLH = TL / HL;

/**
 * The palette (sRGB hex; texture albedo, the wet look comes from the material). Round T2: calibrated under the canonical
 * photo light at the photos' cameras (the header): the grounds are the skin BETWEEN the marks, the marks the research's
 * (behaviour §2.1) moved toward the photos' slate and dark brown (u1's marks are slate, B010's dark brown at C ~10; T1's
 * warm C 11–14 browns were the 'leopard'), the grounds golden olive-tan / olive-grey at low chroma (an individual's
 * gold — B010 — or grey — A030 — is the runtime tint's). `*Warm` / `*Cool` are the ends a layer's variation runs between.
 */
export const PALETTE = {
  // ground (countershading, behaviour §2.2.1) — round T3: the warm olive / golden-olive of u1 (the owner's photo) and
  // B010, measured with the specular top 8 % of L* left out (u1 flank C 6–17, cheek 12, lip 18; B010 cheek 19); T2's
  // C ~5 grounds rendered a neutral grey (C 3.5–4.5) — the grey mud specimen (A030) is the runtime tint's grey morph
  dorsum: '#7b6e5c',        // the back and nape between the saddles: olive-brown-grey (research #8c7b66)
  headTop: '#827563',       // the head top between and behind the eyes (under the vermiculation)
  flankUpper: '#c5baab',    // the upper flank's ground between its marks, grey-olive (research #8a7c68 is a mean with them)
  flankLower: '#efddc6',    // golden cream (u1's lower flank C 9–13 h 80; research #cdc8b8)
  belly: '#e8d8be',         // warm cream (throat, chin, belly; u1's underside C 16 h 90 in shade; research #d6d8cd)
  cheek: '#9c8969',         // cheek and opercle: golden olive-tan (u1 L 67 C 12, B010 C 19; research #a08e74)
  cheekOlive: '#9d8f71',    // olive variant (B006, u1), mixed in by low-frequency noise
  cheekLow: '#cbb99a',      // the cheek's pale lower half (B006, B010, u1: cream-khaki)
  headCloud: '#d7c7ac',     // the cheek's soft pale clouds (u1: cream)
  // marks
  saddle: '#3a342b',        // saddles and blotches, the dark slate-brown end
  saddleCool: '#333537',    // slate end (u1's dark blotches read blue-grey)
  speckle: '#4e402c',       // fine peppering and the head's fine flecks: olive-brown (u1, B010)
  speckCluster: '#4f432d',  // the olive-brown smudge under u1's fleck clusters (behind and below the eye, the snout)
  brownSpot: '#544434',     // the upper flank's dark brown spot rows (B010) and the trunk's fine brown specks (B067)
  rustSpot: '#51391a',      // the lower flank's spots: brown (u1 cores L 38 C 11 h 75, B010 h 86, B067 h 71; T2's
                            // #9b6538 rendered salmon, h 62)
  barDark: '#403b33',       // barcode, dark phase (research #4a3e33)
  barPale: '#d0c6b2',       // the barcode's pale phase between the bars (research), through the band
  vermic: '#433a2f',        // head-top vermiculation (B050)
  headBlotch: '#524836',    // the head's darker clouds: olive-brown (u1)
  axilMark: '#3b342c',      // axilla, opercular-margin bar, post-orbital streak
  granPale: '#ded1b0',      // the head's fine pale stipple (B010)
  paleSpot: '#e2ded0',      // cool pale dots (cheek, head top)
  paleWarm: '#e8dcc0',      // warm cream dots
  dashPale: '#ebe5d6',      // the upper flank's white dashes (u1, B010)
  crescent: '#cfc6ab',      // the pale crescent under the eye
  collar: '#6e614e',        // the cup's rim under the globe: dark olive-brown (u1 L 32 C 13 h 92 rendered in shade)
  lip: '#968e73',           // lip pads: olive-tan (u1 L 49 C 18 h 92 in shade, B010); round M: u1's pad under the photo
                            // light L* 57.5 a −1.0 b 13.4 (T3 '#958465' rendered 52.8 / 2.1 / 15.3, ΔE2000 6.0: warmer)
  lipStipple: '#6c6352',    // the lip's fine dark stipple
  lipLine: '#6a604d',       // round M: the labial groove's fine line along the pad's top (u1 L* 27 in the photo)
  lipShade: '#766c59',      // round M: the mouth line — the lower jaw's skin under the overlapping upper lip, olive
  pectLobe: '#8e7c64',      // the pectoral lobe's olive-tan wash (u1 C 10 h 82, B010 golden; its chroma the cheek's, not
                            // T2's peach #977445, C 32)
  lobeDot: '#433b31',       // the lobe's dark speckles
  eyeCap: '#6e6650',        // the eye's skin cap: olive (u1, B002)
  mouth: '#c8ae9f',         // the mouth's lining
  mouthDeep: '#8e6f66',
  gill: '#7a5048',          // the gill pocket's walls
  socket: '#8f8a72',        // the eye cup's lining (translucent grey-olive)
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
  eyeSkin: 'eyeSkin', eyeSkinL: 'eyeSkin', eyeSkinR: 'eyeSkin', patch: null, iris: null,
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

/** The nearest point of a swept tube's axis (as tubeDist): { d (the distance to the tube), cy (the axis's height
 * there, HL), r (its radius there, × sy: the half-height of the section) } (round M, the lips). */
function tubeNear(q, path, radius, sy = 1) {
  let best = { d: Infinity, cy: 0, r: 0 };
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    const ab0 = b[0] - a[0], ab1 = (b[1] - a[1]) / sy, ab2 = b[2] - a[2];
    const ap0 = q[0] - a[0], ap1 = (q[1] - a[1]) / sy, ap2 = q[2] - a[2];
    const L2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2;
    const t = sat((ap0 * ab0 + ap1 * ab1 + ap2 * ab2) / L2), r = radius[i] + (radius[i + 1] - radius[i]) * t;
    const d = Math.hypot(ap0 - ab0 * t, ap1 - ab1 * t, ap2 - ab2 * t) - r;
    if (d < best.d) best = { d, cy: a[1] + (b[1] - a[1]) * t, r: r * sy };
  }
  return best;
}

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
 * spots in and out instead of cutting them). Returns the coverage (0..1) and, in `out.h`, the covering spot's hash (for
 * per-spot colour).
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

/** The spot layers (HL): cell, ball radius, its spread, softness, vertical stretch, seed. A ball of radius r cut by
 * the skin shows a disc of up to 2r across (on average 1.6r). */
const SPOTS = {
  // the trunk's sparse fine dark pepper, 0.2–0.3 % TL (behaviour §2.2.6; subordinate: B067's salt and pepper is a
  // texture, not a field of marks; round T3: smaller, r 0.009 → 0.006, the dense brown specks below carry the texture)
  pepper: { cell: 0.034, r: 0.006, rVar: 0.35, soft: 0.12, seed: 11 },
  // (round T3, the colour finding's P3: B067's and B010's dense fine dark-brown spotting over the upper and mid flank —
  // sizes varied, soft — in place of part of the round pepper)
  brownSpeck: { cell: 0.012, r: 0.003, rVar: 0.5, soft: 0.25, seed: 13 },
  // the head's fine dark flecks, 0.02–0.04 ED (face_front_top §5; u1, B010, B067; round T3: u1's flecks are 0.017 HL
  // across, T2's 0.013 — r 0.0044 → 0.006)
  speck: { cell: 0.016, r: 0.006, rVar: 0.45, soft: 0.16, seed: 23 },
  // the eye cap's finer stipple (B010, B049, B002 caps: finer and smoother than the head)
  speckFine: { cell: 0.0105, r: 0.0026, rVar: 0.4, soft: 0.12, seed: 29 },
  // the fine pale salt (trunk) and the head's fine pale stipple, ~0.1 mm (B010: 0.08–0.12 mm granules)
  salt: { cell: 0.018, r: 0.0045, rVar: 0.4, soft: 0.10, seed: 37 },
  gran: { cell: 0.019, r: 0.0075, rVar: 0.4, soft: 0.3, seed: 89 },
  // the cheek's and head top's pale spots (B006, B010, B064; u1's 0.029 HL across at ~250 / HL² — round T3: bolder and
  // denser, T2's were near absent: pale p95 − p5 0.30 against the photos' 0.92)
  pale: { cell: 0.045, r: 0.014, rVar: 0.45, soft: 0.4, seed: 41 },
  // the lobe's dark speckles (u1) and its larger spots
  lobeDot: { cell: 0.016, r: 0.0055, rVar: 0.45, soft: 0.14, seed: 79 },
  lobeSpot: { cell: 0.05, r: 0.011, rVar: 0.35, soft: 0.12, seed: 83 },
};

/** (round M, the lips' overlap) The upper lip's two lines (skinColour, the lips): the labial groove — a soft line `w` wide
 * (HL, gaussian) at `at` off the pad's tube, where the fillet onto the face lies, over the pad's top (`above`: from
 * [0] to [1] of the section's half-height above its axis) — and the mouth line: the skin under the upper lip's lowest
 * point (`below` [from, full] HL under it, fading out `reach` [full, none] further down, the face's olive to `jaw` —
 * where the skin faces down, only to `side`), `off` [from, full] off the lip and within `d` of it: the lower jaw's skin
 * the upper lip overlaps. */
export const LIP = { groove: { at: 0.005, w: 0.0035, above: [0.35, 0.7] }, mouth: { below: [-0.006, 0.002], off: [0.001, 0.004], reach: [0.008, 0.025], jaw: [0.05, 0.08], side: [0.03, 0.045], d: 0.07 } };

/** Each layer's opacity (0..1; the calibrated look: region contrast against the photos, see the header).
 * patternContext's `strength` multiplies them (tests, morphs). */
export const LAYERS = {
  // trunk, large → fine
  saddle: 0.95, blotch: 1.0, band: 0.55, barcode: 0.45, dash: 1.0, spotRow: 0.9, rust: 1.0, pepper: 0.4, brownSpeck: 0.7, trunkSalt: 0.3,
  // head
  mottle: 0.65, cloud: 0.75, patch: 0.85, speck: 0.95, cluster: 0.95, microDark: 0.7, microPale: 0.65, gran: 0.4, grain: 0.7, verm: 0.9, pale: 0.8, streak: 0.62, opBar: 0.75, axilla: 0.72,
  crescent: 0.25, collar: 0.6, lip: 0.9, lipStipple: 0.35, lipLine: 0.6, lipShade: 0.75, lipJaw: 0.85,
  // lobe, eye cap
  lobe: 0.95, lobeDot: 0.95, lobeSpot: 0.9, lobeStreak: 0.7, eyeCap: 0.35,
};

/**
 * The trunk's flank marks on a 2D jittered lattice in the flank's own surface frame (X = u·TL, Y = v·depth: HL along the
 * body and down the section, each side its own seed): every cell holds one mark of its full size (a 3D lattice cut by
 * the skin shows only the balls the skin passes through — a quarter of them at these cells — so the flank's sizes and
 * spacings are set here, not left to the cut). cell / cellY the spacing, rx / ry the mark's half-width and half-height
 * (± rVar), soft its edge (share of the radius), the mark's presence by `dens`.
 */
const MARKS2D = {
  // the upper flank's white vertical dashes (u1, B010): ~0.3 % TL wide, 1–1.5 % TL tall, 1.5–2.5 % TL apart (round T3,
  // the colour finding's P3: soft, irregular, varied inside — u1's are soft streaks of aspect ~1.4, T2's crisp slashes
  // of 2.0 read as decals: ry 0.04 → 0.032, soft 0.4 → 0.6, the outline warped, the inside grained)
  dash: { cell: 0.05, cellY: 0.17, rx: 0.0125, ry: 0.036, rVar: 0.45, soft: 0.6, warp: 0.32, wf: 70, grain: 0.45, gf: 110, seed: 53 },
  // the lower flank's spots (u1, B010: round, 0.5–0.8 % TL, 1.5–2.5 % TL apart in loose rows; round T3: soft-edged
  // pigment with a grain, not discs)
  rust: { cell: 0.05, cellY: 0.044, rx: 0.009, ry: 0.0085, rVar: 0.4, soft: 0.4, warp: 0.25, wf: 90, grain: 0.25, gf: 130, seed: 61 },
};
/**
 * A 2D mark layer's coverage at (X, Y) HL: the nearest marks of the jittered lattice, each an ellipse of its own size
 * whose outline is warped by noise (`warp`: share of the radius, `wf` its frequency per HL) and whose inside is grained
 * (`grain`: the share of coverage the pigment's grain takes away at most, `gf` per HL — faded out where the tier's texel
 * cannot hold it: aaHL is 0.7 texel), so no two marks are alike and none is a flat disc. Returns 0..1, the covering
 * mark's hash in out.h.
 */
function mark2D(X, Y, L, dens, aaHL, seed, out) {
  const gx = X / L.cell, gy = Y / L.cellY, ix = Math.floor(gx), iy = Math.floor(gy);
  let best = 0, bh = 0;
  const wn = L.warp ? perlin3(X * L.wf, Y * L.wf * 0.7, seed * 3.7, L.seed + 3) + 0.5 * perlin3(X * L.wf * 2.1, Y * L.wf * 1.5, seed * 3.7, L.seed + 4) : 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy;
      const h2 = hash3i(cx, cy, seed, L.seed + 7919);
      const e = (h2 & 65535) / 65536;
      const pres = sstep(e - 0.06, e + 0.06, dens);
      if (pres <= 0) continue;
      const h = hash3i(cx, cy, seed, L.seed);
      const px = cx + 0.12 + 0.76 * (h & 1023) / 1023, py = cy + 0.12 + 0.76 * ((h >>> 10) & 1023) / 1023;
      const s = 1 - L.rVar + 2 * L.rVar * ((h2 >>> 16) / 65536);
      const ex = ((gx - px) * L.cell) / (L.rx * s), ey = ((gy - py) * L.cellY) / (L.ry * s);
      const d = Math.sqrt(ex * ex + ey * ey) * (1 + (L.warp ?? 0) * wn), aa = Math.max(L.soft, aaHL / (L.rx * s));
      if (d > 1 + aa) continue;
      const cov = (1 - sstep(1 - aa, 1 + aa, d)) * pres;
      if (cov > best) { best = cov; bh = h; }
    }
  if (best > 0 && L.grain) {
    const ga = L.grain * sstep(2.0, 4.0, 1 / (L.gf * aaHL / 0.7));
    if (ga > 0) best *= 1 - ga * (0.5 + 0.5 * perlin3(X * L.gf, Y * L.gf * 0.75, (bh & 255) * 0.37, L.seed + 5));
  }
  if (out) out.h = bh;
  return best;
}

/** Each spot layer's mean coverage at density 1 (Monte-Carlo over space: a random plane cuts the balls as the skin
 * does; the 2D marks over their plane), the tone a texel too coarse for the spots takes. */
function spotMeans() {
  const m = {};
  const N = 6000;
  for (const [k, L] of Object.entries(SPOTS)) {
    let s = 0;
    for (let i = 0; i < N; i++) s += spotLayer(h01(i, 1, 2, 5) * 40 * L.cell, h01(i, 3, 4, 5) * 40 * L.cell * (L.sy ?? 1), h01(i, 5, 6, 5) * 40 * L.cell, L, 1, 1e-6, null);
    m[k] = s / N;
  }
  // (the 2D marks' lattice is anchored at the dorsal midline, Y = 0, and the flank spans only a cell or two of it: their
  // mean coverage is a function of Y — a table over Y in 0.01 HL bins to 1 HL —, not one number)
  for (const [k, L] of Object.entries(MARKS2D)) {
    const T = new Float32Array(100);
    for (let b = 0; b < 100; b++) {
      let s = 0;
      for (let i = 0; i < 400; i++) s += mark2D(h01(i, b, 2, 6) * 40 * L.cell, (b + h01(i, b, 4, 6)) * 0.01, L, 1, 1e-6, 1, null);
      T[b] = s / 400;
    }
    m[k] = T;
  }
  return m;
}
/** A 2D mark layer at the tier's texel (as spotsAt: the marks where they are ≥ ~1.5 texels across, their mean where not). */
function marksAt(ctx, key, X, Y, dens, side, out) {
  const L = MARKS2D[key];
  const full = sstep(0.4, 0.9, (2 * L.rx) / ctx.texHL);
  const T = ctx.means[key], f = Math.min(98.999, Math.max(0, Y * 100 - 0.5)), i = Math.floor(f);
  const mean = (T[i] + (T[i + 1] - T[i]) * (f - i)) * dens;
  if (full <= 0) { if (out) out.h = 0; return mean; }
  const cov = mark2D(X, Y, L, dens, ctx.texHL * 0.7, side > 0 ? 1 : 2, out);
  return mean + (cov - mean) * full;
}

// ------------------------------------------------------------------------------------------------- placed features
/** The brown spot rows' coverage at (uw, v) (rows: patternContext), the anti-aliasing width aa (HL), section depth. */
function rowsCov(rows, uw, v, depth, aa, w0) {
  let sp = 0;
  for (const row of rows) {
    if (Math.abs(v - row.v) * depth > 0.08) continue;
    for (const s of row.spots) {
      const du = (uw - s.u) * TLH;
      if (du > 0.06) continue;
      if (du < -0.06) break;
      if (!s.on) continue;
      const dd = Math.hypot(du, (v - row.v - s.dv) * depth), r = s.r * TLH * 0.5;
      const k = (1 - sstep(r * 0.65 - aa, r * 1.25 + aa, dd + 0.15 * r * w0)) * row.k;
      if (k > sp) sp = k;
    }
  }
  return sp;
}
/** The barcode's coverage at (uw, v) before its band window (bars: patternContext). */
function barsCov(bars, uw, v) {
  let bc = 0;
  for (const b of bars) {
    const du = Math.abs(uw - b.u - 0.008 * (v - 0.55));
    if (du > 0.012) continue;
    const along = sstep(b.v0 - 0.04, b.v0 + 0.04, v) * (1 - sstep(b.v1 - 0.05, b.v1 + 0.03, v)) * (b.gl ? sstep(b.gl * 0.4, b.gl, Math.abs(v - b.gv)) : 1);
    bc = Math.max(bc, (1 - sstep(0.004 * b.w, 0.0095 * b.w, du)) * along * b.k);
  }
  return bc;
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
    u: u + (R(i, 1) - 0.5) * 0.012, hw: 0.022 + R(i, 2) * 0.008, slant: 0.05 + R(i, 3) * 0.03, vEnd: 0.34 + R(i, 4) * 0.1,
    k: 0.8 + R(i, 5) * 0.15,
  }));
  // the mid-lateral blotches (§2.2.3; u1: slate, at v 0.3–0.5, merging into a band): u, v, half-length (TL),
  // half-height (v), how far one reaches up into its saddle
  const blotches = [0.24, 0.31, 0.40, 0.47, 0.55, 0.66, 0.75, 0.82].map((u, i) => ({
    u: u + (R(i, 11) - 0.5) * 0.01, v: 0.42 + (R(i, 12) - 0.5) * 0.06, hu: 0.026 + R(i, 13) * 0.02, hv: 0.1 + R(i, 14) * 0.05,
    k: i === 7 ? 0.95 : 0.85 + R(i, 15) * 0.13, up: R(i, 16) > 0.4 ? 0.08 : 0.03, irr: 0.6 + R(i, 17) * 0.8, i,
  }));
  // the barcode (§2.2.4; A030, A070: from v ~0.3 down to the lower flank): 16–20 bars over u 0.30–0.82, period 0.027 TL
  const barcode = [];
  // (round T3: each bar its own width, 0.7–1.3, and most broken once — a gap of 0.03–0.08 v — so the barcode is never a
  // printed grating)
  for (let u = 0.30, i = 0; u <= 0.825; u += 0.027, i++) {
    const v0 = 0.30 + R(i, 22) * 0.08, v1 = 0.72 + R(i, 23) * 0.08;
    barcode.push({ u: u + (R(i, 21) - 0.5) * 0.008, v0, v1, k: 0.5 + R(i, 24) * 0.5, w: 0.7 + R(i, 25) * 0.6, gv: v0 + R(i, 26) * (v1 - v0), gl: R(i, 27) > 0.35 ? 0.03 + R(i, 28) * 0.05 : 0 });
  }
  // the brown spot rows (§2.2.5; B010: dark brown spots 0.7–1.1 % TL in loose rows on the upper flank, subordinate)
  const rows = [{ v: 0.12, k: 0.7 }, { v: 0.2, k: 0.85 }, { v: 0.29, k: 0.85 }, { v: 0.38, k: 0.7 }].map((r, i) => {
    const spots = [];
    for (let u = 0.215 + R(i, 31) * 0.01, j = 0; u < 0.86; j++) {
      spots.push({ u: u + (R(j, 40 + i) - 0.5) * 0.006, dv: (R(j, 50 + i) - 0.5) * 0.06, r: 0.006 + R(j, 60 + i) * 0.004, on: R(j, 70 + i) < 0.7 });
      u += 0.014 + R(j, 80 + i) * 0.01;
    }
    return { ...r, spots };
  });
  // the excitement crossbands (§2.6), for the `bars` mask
  const xbands = [0.22, 0.32, 0.43, 0.54, 0.65, 0.76].map((u, i) => ({ u: u + (R(i, 91) - 0.5) * 0.01, hw: 0.018 + R(i, 92) * 0.006 }));
  // (the rows' and the barcode's mean coverage by v: the tone a texel too coarse for them takes — lod2)
  const NVM = 48, rowMean = new Float32Array(NVM), barMean = new Float32Array(NVM);
  for (let i = 0; i < NVM; i++) {
    const v = (i + 0.5) / NVM;
    let sr = 0, sb = 0;
    const NU = 600;
    for (let j = 0; j < NU; j++) { const u = 0.3 + (0.5 * (j + 0.5)) / NU; sr += rowsCov(rows, u, v, 0.65, 1e-4, 0); sb += barsCov(barcode, u, v); }
    rowMean[i] = sr / NU; barMean[i] = sb / NU;
  }
  const means = spotMeans();
  const micro = microMeans(seed);
  // (the vermiculation's mean coverage: what a texel too coarse for its lines takes — lod2)
  let vermMean = 0;
  for (let i = 0; i < 4000; i++) {
    const x = 0.05 + 1.3 * h01(i, 3, 1, 9), y = 0.3 + 0.6 * h01(i, 3, 2, 9), z = -0.35 + 0.7 * h01(i, 3, 3, 9);
    vermMean += vermAt(x, y, z, perlin3(x * 28, y * 28, z * 28, seed + 101), perlin3(x * 28 + 7.1, y * 28, z * 28, seed + 102), seed);
  }
  vermMean /= 4000;
  // (the sealed head: the depth of the mouth's and the gill pockets' walls under the closed skin)
  const sealed = sealedFishSDF({ minimal: true });
  const alpha = Object.fromEntries(Object.entries(LAYERS).map(([k, a]) => [k, a * (o.strength?.[k] ?? 1)]));
  return { f, seed, texHL, pal, prof, arm, saddles, blotches, barcode, rows, xbands, rowMean, barMean, means, micro, vermMean, sealed, alpha, tmp: { yT: 0, yB: 0 } };
}
const tableAt = (T, v) => { const f = sat(v) * T.length - 0.5, i = Math.max(0, Math.min(T.length - 2, Math.floor(f))), t = sat(f - i); return T[i] + (T[i + 1] - T[i]) * t; };

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

/** The vermiculation's coverage at (x, y, z) HL (w0, w1 the shared warp there): bold lengthwise lines (B050), broken. */
function vermAt(x, y, z, w0, w1, seed) {
  const wx = x + 0.04 * fbm(x * 8, y * 8, z * 8, 2, seed + 6);
  const r = perlin3(wx * 4, y * 23 + 0.3 * w0, z * 23 + 0.3 * w1, seed + 7);
  const lw = 0.28; // the line's half-width in noise units (~0.025 HL: B050's streaks are bold)
  const line = 1 - sstep(lw * 0.45, lw * 1.7, Math.abs(r));
  return line * sstep(-0.35, 0.05, fbm(x * 14, y * 14, z * 14, 2, seed + 8));
}

/**
 * The head's fine irregular mottle (round T3, u1 close up: the cheek is a salt and pepper of IRREGULAR pale cream and
 * dark olive-brown flecks, 0.005–0.02 HL, merging and breaking — most of the skin is one or the other: the photo's dark
 * cover 0.29 and pale 0.43 at that scale, T2's round dots 0.14 / 0.2 on a clean ground). Two octaves of gradient noise,
 * thresholded both ways (no cells, so no mosaic), shifted toward dark by the clusters (`clu`): { dk, pk } coverages.
 * Where the tier's texel cannot hold the octaves they fade to their mean (MICRO_MEAN, by clu), so lod1 / lod2 keep the
 * hero's tone.
 */
const MICRO = { f1: 88, f2: 185, t0: 0.1, t1: 0.3, cluD: 0.3, cluP: 0.22, biasD: 0.1, biasP: 0.02 };
function microRaw(x, y, z, w2, clu, seed, a2) {
  const fm = perlin3(x * MICRO.f1, y * MICRO.f1, z * MICRO.f1, seed + 44) + 0.5 * a2 * perlin3(x * MICRO.f2 + 5.3, y * MICRO.f2, z * MICRO.f2, seed + 45) + 0.3 * w2;
  return [sstep(MICRO.t0, MICRO.t1, fm + MICRO.cluD * clu - MICRO.biasD), sstep(MICRO.t0, MICRO.t1, -fm - MICRO.cluP * clu - MICRO.biasP)];
}
function microMeans(seed) {
  const T = { dk: new Float32Array(11), pk: new Float32Array(11) };
  for (let k = 0; k <= 10; k++) {
    let sd = 0, sp = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const x = 40 * h01(i, k, 1, 12), y = 40 * h01(i, k, 2, 12), z = 40 * h01(i, k, 3, 12);
      const r = microRaw(x, y, z, perlin3(x * 28, y * 28 + 3.3, z * 28, seed + 103), k / 10, seed, 1);
      sd += r[0]; sp += r[1];
    }
    T.dk[k] = sd / N; T.pk[k] = sp / N;
  }
  return T;
}
function microAt(ctx, x, y, z, w2, clu) {
  const f1 = sstep(1.6, 3.2, 1 / (MICRO.f1 * ctx.texHL)), f2 = sstep(1.6, 3.2, 1 / (MICRO.f2 * ctx.texHL));
  const i = Math.min(9, Math.floor(clu * 10)), t = clu * 10 - i;
  const md = ctx.micro.dk[i] + (ctx.micro.dk[i + 1] - ctx.micro.dk[i]) * t, mp = ctx.micro.pk[i] + (ctx.micro.pk[i + 1] - ctx.micro.pk[i]) * t;
  if (f1 <= 0) return [md, mp];
  const r = microRaw(x, y, z, w2, clu, ctx.seed, f2);
  return [md + (r[0] - md) * f1, mp + (r[1] - mp) * f1];
}

/** The head's fine pale stipple at a fish-frame point (mm): its coverage 0..1 (exported for the surface key, so a relief
 * granule can sit on a pale one: round T2's request). */
export function headGranule(p, ctx) {
  const q = [p[0] / HL, p[1] / HL, p[2] / HL];
  return spotsAt(ctx, 'gran', q, [0, 0, 0], 0.55, null);
}

// ------------------------------------------------------------------------------------------------- skin colour
const _w = [0, 0, 0], _c = [0, 0, 0], _k = [0, 0, 0], _h = [0, 0, 0], _o = { h: 0 };
const EYE_R = EYE_MM.radius / HL, EYE_C = [HEAD.eye.s, HEAD.eye.y, HEAD.eye.z];

/**
 * The skin's albedo at a fish-frame point.
 * @param p     [s, y, z] fish mm (the bind pose; the eye cap's at rest)
 * @param n     the surface normal there (fish frame, unit) — used for the head's underside and the lobe's faces
 * @param part  'head' | 'body' | 'lobe' | 'lip' | 'eyeSkin' | 'interior' | 'teeth' | null (CHART_PART; head, body, lobe
 *              and lip are resolved from the position, so they and null are the same outer skin; null — the patch's
 *              islands — is lining where it lies inside the mouth or a gill pocket)
 * @returns { rgb: [r, g, b] linear, bars: 0..1 the excitement crossbands' mask }
 */
export function skinColour(p, n, part, ctx) {
  const P = ctx.pal, A = ctx.alpha;
  let bandMask = 0, barMask = 0;
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
  // on to 1.5 HL), the trunk, the eye's zone (the cap and the turret's skin round the globe's rim)
  const sm = marginS(y);
  const head = 1 - sstep(sm - 0.02, sm + 0.07, x + 0.02 * lf2);
  const trunk = 1 - head;
  const nape = 1 - sstep(1.0, 1.5, x);
  const dEye = Math.hypot(x - EYE_C[0], y - EYE_C[1], az - EYE_C[2]) / EYE_R;
  const eyeZ = part === 'eyeSkin' ? 1 : (1 - sstep(1.08, 1.4, dEye)) * head;
  const headish = Math.max(head, eyeZ);
  // (round T3, u1: the head's speckle gathers into CLUSTERS — olive-brown smudges thick with fine dark flecks, 0.03–0.08
  // HL across — behind and below the eye, on the upper cheek, the snout and above the lip, with the cheek clean between
  // them and its lower half pale cream: the head's mid-scale contrast; T2's even pepper read flat, DoG IQR 0.11 against
  // u1's 0.30. clu 0..1, used by the clouds, the flecks and the pale dots)
  let clu = 0;
  if (headish > 0 || nape > 0) {
    const po = Math.exp(-(((x - 0.6) / 0.22) ** 2) - (((y - 0.5) / 0.14) ** 2));
    const sn = Math.exp(-(((x - 0.1) / 0.12) ** 2) - (((y - 0.42) / 0.16) ** 2));
    const cm = Math.exp(-(((x - 0.72) / 0.26) ** 2) - (((y - 0.4) / 0.11) ** 2));
    const cn = 0.75 * fbm(x * 6, y * 6, z * 6, 3, ctx.seed + 42) + 0.35 * fbm(x * 17, y * 17, z * 17, 2, ctx.seed + 43) + 0.15 * _w[1]
      + 0.45 * po + 0.35 * cm + 0.35 * sn - 0.14 - 0.25 * sstep(0.3, 0.1, v) - 0.5 * sstep(0.62, 0.85, v);
    clu = sstep(0.0, 0.25, cn) * (1 - sstep(0.85, 0.95, v));
  }

  // ---- ground: the trunk's countershading (§2.2.1) and the head's tone bands
  const c = _c;
  lerp3(P.dorsum, P.flankUpper, sstep(0.10, 0.32, v), c);
  blend(c, P.flankLower, sstep(0.46, 0.62, v));
  blend(c, P.belly, sstep(0.78, 0.92, v));
  if (head > 0) {
    // head: top → cheek (0.24–0.42) → the cheek's pale lower half (0.58–0.80) → the throat (0.84–0.97)
    const h = lerp3(P.headTop, P.cheek, sstep(0.24, 0.42, v), _h);
    blend(h, P.cheekOlive, sat(0.5 + 0.9 * lf1) * 0.5 * sstep(0.2, 0.4, v));
    blend(h, P.cheekLow, sstep(0.58, 0.80, v));
    blend(h, P.belly, sstep(0.84, 0.97, v));
    // the head's underside (the flat throat facing down): the throat's cream
    if (n) blend(h, P.belly, sstep(-0.35, -0.75, n[1]) * sstep(0.55, 0.75, v));
    blend(c, h, head);
  }
  // a low-frequency mottle in value and warmth (±6 %): the ground is never flat; round T3: its chroma too — golden
  // patches and greyer ones (u1: the lower flank and cheek golden, the band's neighbourhood greyer), ±25 % about the
  // palette's
  {
    const m = 1 + 0.06 * lf1 + 0.04 * lf2;
    c[0] *= m * (1 + 0.02 * lf2); c[1] *= m; c[2] *= m * (1 - 0.03 * lf2);
    const kc = 1 + 0.25 * fbm(x * 4.5 + 3.1, y * 4.5, z * 4.5, 2, ctx.seed + 21), lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    c[0] = lum + (c[0] - lum) * kc; c[1] = lum + (c[1] - lum) * kc; c[2] = lum + (c[2] - lum) * kc;
  }
  // the skin's fine grain (B067, A030, u1: the flank's texture between the marks is granular, never flat): two octaves of
  // noise at ~0.02 HL (0.4 % TL) in value, ±; its mean is neutral, so a texel too coarse for it leaves it out
  {
    const full = sstep(1.2, 2.6, 0.012 / ctx.texHL);
    if (full > 0) {
      const g = perlin3(x * 48, y * 48, z * 48, ctx.seed + 15) + 0.5 * perlin3(x * 101, y * 101, z * 101, ctx.seed + 16);
      const k = 1 + A.grain * 0.22 * g * full * (1 - 0.5 * eyeZ) * (1 - sstep(0.8, 0.95, v));
      c[0] *= k; c[1] *= k; c[2] *= k;
    }
  }

  // ---- the head: soft clouds — darker ones (0.05–0.1 HL) on the head top, snout and upper cheek, paler ones on the cheek
  // (u1's smooth olive skin with cream clouds) — faint on the eye's cap
  if (headish > 0 || nape > 0) {
    const hw = Math.max(headish, nape * 0.7) * (1 - 0.45 * eyeZ);
    // (u1: a darker zone on the upper cheek behind and below the eye, broken up; round T3: darker olive-brown clouds on
    // the upper head — u1's cheek p90 − p10 is 34 L*, T2's 13 — and the cream lower cheek below them)
    const po = head * Math.exp(-(((x - 0.62) / 0.24) ** 2) - (((y - 0.5) / 0.13) ** 2));
    const mt = sstep(0.05, 0.45, fbm(x * 11, y * 11, z * 11, 3, ctx.seed + 13) + 0.25 * _w[0] + 0.35 * po);
    blend(c, P.headBlotch, mt * A.mottle * hw * (1 - sstep(0.48, 0.66, v)));
    const cl = sstep(0.0, 0.45, fbm(x * 7.5, y * 7.5, z * 7.5, 3, ctx.seed + 17) + 0.2 * _w[1] + 0.25);
    blend(c, P.headCloud, cl * A.cloud * head * (1 - eyeZ) * sstep(0.42, 0.6, v) * (1 - sstep(0.82, 0.93, v)));
    // (u1 close up: irregular cream patches 0.02–0.06 HL across on the cheek and the opercle, the speckle gathered at
    // their edges — a mottle, not a mosaic: noise, no cells)
    const pm = sstep(0.24, 0.4, fbm(x * 21, y * 21, z * 21, 3, ctx.seed + 18) + 0.22 * _w[0]);
    blend(c, P.headCloud, pm * A.patch * head * (1 - eyeZ) * (1 - 0.75 * clu) * sstep(0.22, 0.4, v) * (1 - sstep(0.78, 0.9, v)));
  }

  // ---- dark marks on the trunk and nape: the saddles, the slate blotches and the dusky band (§2.2.2–3; u1), each broken
  // into sub-blotches by a mid-frequency noise and ragged at the edge by a fine one
  if (trunk > 0) {
    let dark = 0, bandW = 0;
    const brk = 0.36 * fbm(x * 20, y * 20, z * 20, 3, ctx.seed + 4) + 0.3 * fbm(x * 55, y * 55, z * 55, 2, ctx.seed + 5);
    // (a saddle is a cluster of sub-blotches, not a painted band: its opacity broken by a mid-frequency mask, floored so
    // it reads as one mark)
    const patch = 0.7 + 0.3 * sstep(0.2, 0.62, 0.5 + 0.7 * fbm(x * 26, y * 26, z * 26, 2, ctx.seed + 14) + 0.3 * _w[1]);
    for (const s of ctx.saddles) {
      const uc = s.u - s.slant * vC, hw = s.hw * (1 - 0.35 * sat(vC / s.vEnd));
      const du = (uw - uc) / hw;
      if (Math.abs(du) > 2.2) continue;
      const shape = Math.min(1 - Math.abs(du), (s.vEnd - v) / 0.08) + brk;
      dark = Math.max(dark, sstep(0.05, 0.4, shape) * s.k * A.saddle * (1 - 0.3 * sstep(0.05, s.vEnd, vC)) * patch);
    }
    // (round T3, the colour finding's P2: the band is the blotches MERGED — u1's band varies along its length by 6 L* at
    // the blotches' scale, T2's by 1.4: a uniform stripe. The blotches carry the contrast, darker cores, each with its
    // own ragged outline; the band only bridges them where they come close: its strength falls off with the distance to
    // the nearest blotch along the body)
    let nb = 0;
    for (const b of ctx.blotches) {
      const du = (uw - b.u) / b.hu;
      nb = Math.max(nb, Math.exp(-0.5 * (du / 0.85) ** 2));
      if (Math.abs(du) > 2.5) continue;
      const dvv = v < b.v ? (v - b.v) / (b.hv + b.up) : (v - b.v) / b.hv;
      const shape = 1 - Math.sqrt(du * du + dvv * dvv) * (1 + 0.22 * b.irr * fbm(x * 30, y * 30, z * 30, 2, ctx.seed + 23 + b.i)) + brk;
      const k = sstep(0.1, 0.24, shape) * (0.85 + 0.15 * sstep(0.3, 0.7, shape)) * b.k * A.blotch;
      if (k > dark) dark = k;
      bandW = Math.max(bandW, k);
    }
    // the dusky band along v 0.28–0.54 that the blotches merge into (u1), its tone varying along
    const band = sstep(0.29, 0.36, v) * (1 - sstep(0.5, 0.57, v)) * sstep(0.21, 0.26, u) * (1 - sstep(0.84, 0.88, u));
    const bk = band * A.band * (0.22 + 0.78 * nb) * (0.75 + 0.5 * sat(0.5 + 0.8 * fbm(x * 6, y * 6, z * 6, 2, ctx.seed + 19)));
    bandMask = Math.max(bk, bandW) * trunk;
    if (bk > dark) dark = bk;
    // (inside a mark the pigment varies: a cloudy fine-scale density, not a flat fill)
    dark *= 0.88 + 0.24 * sat(0.5 + 0.9 * fbm(x * 42, y * 42, z * 42, 2, ctx.seed + 24));
    dark *= trunk;
    // (slate in the band and the blotches, a browner slate on the back)
    const cool = sat(0.4 + 0.4 * sstep(0.12, 0.3, v) + 0.25 * lf2);
    blend(c, lerp3(P.saddle, P.saddleCool, cool, _k), dark);
  }

  // ---- the barcode on the mid and lower flank (§2.2.4; A030, A070): narrow vertical bars, period 0.027 TL
  if (trunk > 0 && u > 0.27 && u < 0.86 && v > 0.24 && v < 0.9) {
    const wig = 0.004 * fbm(x * 18, y * 18, z * 18, 2, ctx.seed + 12);
    const full = sstep(1.4, 2.6, (0.011 * TLH) / ctx.texHL);
    let bc = full > 0 ? barsCov(ctx.barcode, uw + wig, v) : 0;
    bc = tableAt(ctx.barMean, v) + (bc - tableAt(ctx.barMean, v)) * full; // (the mean where the bars are under ~4 texels: lod2)
    const win = trunk * sstep(0.27, 0.31, u) * (1 - sstep(0.82, 0.86, u));
    // (round T3, the colour finding's P2: through the band the bars' pale phase lifts the skin between them, so the
    // barcode reads through the stripe instead of vanishing under a dark of its own tone; the bars stronger, 0.55 → 0.85)
    if (bandMask > 0) blend(c, P.barPale, 0.1 * (1 - sat(bc * 1.6)) * bandMask * win * (1 - tableAt(ctx.barMean, v) * (1 - full)));
    blend(c, P.barDark, bc * A.barcode * win);
    // (the bars' mask for the runtime's `bars` uniform — the barred morph, A030 / A070, and the excitement state: behaviour
    // §2.2.4 'paint at 30–60 % so a uniform can strengthen it')
    barMask = bc * win;
  }

  // ---- the dark brown spot rows on the upper flank (§2.2.5; B010), subordinate to the blotches
  if (trunk > 0 && u > 0.2 && u < 0.88 && v < 0.52) {
    const full = sstep(1.0, 2.0, (0.009 * TLH) / ctx.texHL);
    let sp = full > 0 ? rowsCov(ctx.rows, uw, v, depth, 0.7 * ctx.texHL, _w[0]) : 0;
    sp = tableAt(ctx.rowMean, v) + (sp - tableAt(ctx.rowMean, v)) * full;
    blend(c, P.brownSpot, sp * A.spotRow * trunk * sstep(0.2, 0.24, u) * (1 - sstep(0.84, 0.88, u)));
  }
  // ---- the lower flank's rust spots in loose rows (v 0.46–0.8; u1, B010)
  if (trunk > 0 && v > 0.4 && v < 0.86) {
    const dens = sstep(0.46, 0.54, v) * (1 - sstep(0.76, 0.86, v)) * sstep(0.21, 0.26, u) * (1 - sstep(0.8, 0.86, u)) * 0.9;
    const rs = marksAt(ctx, 'rust', uw * TLH + 0.01 * _w[0], v * depth + 0.01 * _w[1], dens, side, null);
    blend(c, P.rustSpot, rs * A.rust * trunk);
  }
  // ---- the trunk's sparse fine pepper (v 0–0.6, fading by 0.75; §2.2.6)
  if (trunk > 0) {
    const dens = (1 - 0.85 * sstep(0.45, 0.72, v)) * (0.45 + 0.4 * sat(0.5 + lf2));
    blend(c, P.speckle, spotsAt(ctx, 'pepper', q, _w, dens, null) * A.pepper * trunk);
    // (round T3: B067's and B010's dense fine dark-brown specks over the upper and mid flank, gathered in drifts — the
    // flank's texture between the marks; sizes and densities vary, no two alike)
    const dB = sstep(0.04, 0.1, v) * (1 - sstep(0.52, 0.66, v)) * (0.35 + 0.65 * sat(0.5 + 0.9 * fbm(x * 9, y * 9, z * 9, 2, ctx.seed + 26))) * sstep(0.2, 0.26, u);
    if (dB > 0) blend(c, P.brownSpot, spotsAt(ctx, 'brownSpeck', q, _w, dB, null) * A.brownSpeck * trunk);
  }

  // ---- the head's skin texture (B010 close up: soft pale cream flecks 0.15–0.3 mm, low in contrast, among a dense fine
  // dark speckle 0.05–0.1 mm; u1: the speckle gathered behind and below the eye and on the snout top, the lower cheek
  // smooth): first the pale flecks (the ground lifted toward cream), then the dark speckle in the matrix between them,
  // the coarser flecks sparse; on the eye's cap only the fine speckle, sparser
  if (headish > 0 || nape > 0) {
    // (u1: the speckle gathers on the upper cheek behind and below the eye, the nape and the snout top; round T3: into
    // CLUSTERS — olive-brown smudges thick with dark flecks, 0.03–0.08 HL across — with the cheek clean between them and
    // its lower half pale: the head's mid-scale contrast, T2's even pepper read flat, DoG IQR 0.11 against u1's 0.30)
    const wHead = Math.max(head, nape * 0.6 * trunk) * (1 - eyeZ);
    if (wHead > 0) blend(c, P.speckCluster, clu * A.cluster * wHead * (0.65 + 0.35 * sat(0.5 + lf2)));
    const reg = Math.min(1, 0.18 + 0.95 * clu) * (1 - sstep(0.85, 0.95, v));
    // (round T3 integrator, the surface key's request: the pale granules ARE the relief's — surface.granuleAt(p, n).pale at
    // the hero's 2048, GRANULE_PALE.mean where the texel is coarser than ~0.07 mm — and the fine dark speckle sits in the
    // furrows between them, × min(1, 1.3·gap): head corr(relief convexity, albedo band-pass) 0.076 → 0.101, u1's gates
    // unchanged within 0.3 ΔE)
    const G = ctx.texHL * HL < 0.07 ? granuleAt(p, n) : null;
    const g = (G ? G.pale : (GRANULE_PALE.mean ?? 0.12)) * (1 - sstep(0.8, 0.93, v)) * A.gran * headish * (1 - 0.35 * eyeZ) * (1 - 0.5 * clu);
    if (g > 0) {
      _k[0] = Math.min(c[0] * 1.45, 0.4 * c[0] * 1.45 + 0.6 * P.granPale[0]); _k[1] = Math.min(c[1] * 1.45, 0.4 * c[1] * 1.45 + 0.6 * P.granPale[1]); _k[2] = Math.min(c[2] * 1.45, 0.4 * c[2] * 1.45 + 0.6 * P.granPale[2]);
      blend(c, _k, g);
    }
    if (wHead > 0) {
      blend(c, P.speckle, spotsAt(ctx, 'speckFine', q, _w, Math.min(1, 1.0 * reg), null) * A.speck * 0.9 * wHead * (G ? Math.min(1, 1.3 * G.gap) : 1));
      blend(c, P.speckle, spotsAt(ctx, 'speck', q, _w, 0.35 * reg, null) * A.speck * wHead);
    }
    // (round T3: the fine irregular mottle — u1's salt and pepper of pale cream and dark olive-brown flecks — over the
    // head and the nape, smoother on the lower cheek and the throat, finer and fainter on the eye's turret)
    const wM = Math.max(head, nape * 0.6 * trunk) * (1 - 0.55 * eyeZ) * (1 - 0.65 * sstep(0.66, 0.86, v)) * (1 - sstep(0.88, 0.97, v));
    if (wM > 0) {
      const [dk, pk] = microAt(ctx, x, y, z, _w[2], clu);
      blend(c, P.speckle, dk * A.microDark * wM);
      blend(c, P.granPale, pk * A.microPale * wM * (1 - 0.4 * clu));
    }
    // (the eye's cap and turret: the head's stipple, finer — round T3, the eye finding's P4: the cap under-textured)
    if (eyeZ > 0) {
      blend(c, P.speckle, spotsAt(ctx, 'speckFine', q, _w, 0.95, null) * A.speck * eyeZ);
      blend(c, P.speckle, spotsAt(ctx, 'speck', q, _w, 0.3, null) * A.speck * 0.8 * eyeZ);
    }
  }

  // ---- the head's marks: vermiculation, the post-orbital streak
  if (headish > 0 || nape > 0) {
    // vermiculation: bold worm-like dark lines running lengthways on the head top, the snout and the nape (B050, A040)
    const topW = sstep(0.42, 0.2, v) * (1 - sstep(1.25, 1.6, x));
    const snoutW = sstep(0.22, 0.12, x) * sstep(0.75, 0.45, v) * 0.55;
    const vw = Math.max(topW, snoutW) * (1 - eyeZ);
    if (vw > 0) {
      const full = sstep(0.5, 1.1, 0.022 / ctx.texHL);
      const vm = full > 0 ? vermAt(x, y, z, _w[0], _w[1], ctx.seed) : 0;
      blend(c, P.vermic, vw * A.verm * (ctx.vermMean + (vm - ctx.vermMean) * full));
    }
    if (head > 0) {
      // the post-orbital streak: from behind the eye down and back over the upper opercle (A052/B064, A007)
      const a0 = 0.47, a1 = 0.57, b0 = 0.92, b1 = 0.36;
      const abx = b0 - a0, aby = b1 - a1, t = sat(((x - a0) * abx + (y - a1) * aby) / (abx * abx + aby * aby));
      const d = Math.hypot(x - a0 - abx * t, y - a1 - aby * t), wdt = 0.040 + 0.02 * t;
      const st = (1 - sstep(wdt * 0.5, wdt * 1.4, d + 0.012 * lf2)) * sstep(0.0, 0.12, t) * (1 - sstep(0.85, 1.0, t)) * sstep(0.12, 0.2, az);
      blend(c, P.axilMark, st * A.streak * (0.8 + 0.4 * fbm(x * 30, y * 30, z * 30, 2, ctx.seed + 9)) * head * (1 - eyeZ));
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
    blend(c, P.axilMark, bar * (1 - eyeZ));
  }

  // ---- pale marks: the cheek's and head top's pale spots (subtle), the upper flank's white dashes (u1, B010: short
  // vertical dashes breaking the dark band from above), the trunk's sparse pale salt
  {
    // (round T3: B006's, B010's and B064's pale cheek dots bold and dense — LAYERS.pale 0.45 → 0.8, density ×1.8 — each
    // its own tone, from cool to warm cream and part-way to the ground)
    const cheekW = head * sstep(0.18, 0.32, v) * (1 - sstep(0.66, 0.8, v)) * sstep(0.33, 0.48, x);
    const topW = head * sstep(0.35, 0.18, v) * 0.12;
    const dens = Math.min(1, cheekW * 0.9 + topW) * (1 - eyeZ) * (1 - 0.55 * clu);
    if (dens > 0) {
      const pv = spotsAt(ctx, 'pale', q, _w, dens, _o);
      if (pv > 0) {
        const hh = (_o.h & 255) / 255;
        lerp3(P.paleSpot, P.paleWarm, hh, _k); blend(_k, P.headCloud, 0.35); blend(_k, c, 0.3 * (((_o.h >>> 8) & 255) / 255));
        blend(c, _k, pv * A.pale);
      }
    }
    const dashW = trunk * sstep(0.05, 0.11, v) * (1 - sstep(0.36, 0.46, v)) * sstep(0.22, 0.26, u) * (1 - sstep(0.66, 0.76, u)) * (1 - 0.75 * bandMask);
    if (dashW > 0) {
      const dv = marksAt(ctx, 'dash', uw * TLH + 0.006 * _w[0] + 0.005 * perlin3(x * 9, y * 60, z * 9, ctx.seed + 57), v * depth + 0.012 * _w[1], dashW * 0.9, side, _o);
      if (dv > 0) {
        // (each dash its own tone: white to warm cream, some part-way to the ground — u1's are never one flat white)
        lerp3(P.dashPale, P.paleWarm, ((_o.h & 255) / 255) * 0.5, _k); blend(_k, c, 0.35 * (((_o.h >>> 8) & 255) / 255));
        blend(c, _k, dv * A.dash);
      }
    }
    const sw = trunk * (1 - sstep(0.62, 0.8, v)) * (0.4 + 0.35 * sat(0.5 + lf1)) * (1 - 0.6 * bandMask);
    if (sw > 0) {
      const sl = spotsAt(ctx, 'salt', q, _w, sw, _o);
      blend(c, lerp3(P.paleSpot, P.paleWarm, (_o.h & 255) / 255, _k), sl * A.trunkSalt);
    }
  }

  // ---- the pale cream crescent under the eye (the collar under the window, FST §4, FFT §2.3)
  // round T3 (the eye finding's P9, u1): under it the cup's collar — dark olive-brown, speckled (u1's collar L* 32 in
  // shade; T2's pale smooth sleeve 51–53) — the crescent only a thin line at the rim
  if (head > 0 && x > 0.1 && x < 0.62 && y > 0.36 && y < 0.7 && az > 0.04) {
    const below = sstep(-0.15, -0.5, (y - EYE_C[1]) / EYE_R);
    const cw = (1 - sstep(1.25, 1.8, dEye + 0.15 * lf2)) * sstep(0.95, 1.05, dEye) * below * sstep(0.1, 0.16, az);
    if (cw > 0) blend(c, P.collar, cw * A.collar * (0.8 + 0.4 * sat(0.5 + fbm(x * 24, y * 24, z * 24, 2, ctx.seed + 27))));
    const er = Math.hypot((x - HEAD.eye.s) / 0.13, (y - 0.535) / 0.05);
    const cr = (1 - sstep(0.75, 1.25, er + 0.15 * lf2)) * sstep(0.12, 0.2, az) * (1 - sstep(1.08, 1.22, dEye));
    blend(c, P.crescent, cr * A.crescent);
  }

  // ---- the lips: olive-tan pads a little paler than the cheek, finely stippled; the lower lip's thin pale line
  if (x < 0.42 && y < 0.24) {
    const PD = HEAD_SCULPT.pad, J = HEAD_SCULPT.jaw, qa = [x, y, az];
    const dPad = Math.min(tubeDist(qa, PD.path, PD.radius, PD.sy), tubeDist(qa, PD.median.path, PD.median.radius));
    const dLow = tubeDist(qa, J.lip.path, J.lip.radius);
    const wl = Math.max(1 - sstep(0.005, 0.02, dPad), (1 - sstep(0.002, 0.008, dLow)) * 0.85) * A.lip;
    if (wl > 0) {
      blend(c, lerp3(P.lip, P.cheekLow, 0.15 * sat(0.5 + lf2), _k), wl);
      const st = spotsAt(ctx, 'speck', [x * 1.25, y * 1.25, z * 1.25], _w, 0.5, null);
      blend(c, P.lipStipple, st * A.lipStipple * wl);
    }
    // (round M, the lips' overlap) where the upper lip meets the face and where it overlaps the lower jaw — the labial
    // groove a fine soft line along the pad's top (u1: L* 27 against the pad's 45 and the face's 49 over 0.1 of the pad's
    // height; B010 a soft valley, 40 against 54–60), and the mouth line under the pad and the median lip: the lower jaw's
    // skin the upper lip overlaps in its shade, olive (u1: L* 28–35 under the pad; B010, B009 dark), not the throat's cream
    const nb = tubeNear(qa, PD.path, PD.radius, PD.sy), nm = tubeNear(qa, PD.median.path, PD.median.radius, 1);
    const n0 = nb.d <= nm.d ? nb : nm;
    const wg = Math.exp(-(((nb.d - LIP.groove.at) / LIP.groove.w) ** 2)) * sstep(LIP.groove.above[0], LIP.groove.above[1], (y - nb.cy) / Math.max(1e-4, nb.r));
    if (wg > 0.01) blend(c, P.lipLine, wg * A.lipLine * (0.85 + 0.3 * sat(0.5 + lf2)));
    // (the mouth line: below the upper lip's lowest point there — the nearest section of the pad or the median lip —
    // `below` [from, full] HL under it, fading by `reach` [full, none] further down; off the lip itself, and within `d`
    // of it, so it stops at the rictus; and the lower jaw's skin under it, to `jaw` [full, none] below the line, the
    // face's olive like the upper lip's — B012, B013, u5: the lower lip is the face's colour — not the throat's cream,
    // which framed by the pads read as a big pale lower lip from the front)
    const dy = n0.cy - n0.r - y, LM = LIP.mouth;
    const wo = sstep(LM.below[0], LM.below[1], dy) * sstep(LM.off[0], LM.off[1], dPad) * (1 - sstep(LM.d * 0.6, LM.d, dPad));
    // (the jaw's colour on its front and sides only: past the mouth line, where the skin turns to face down — the chin's
    // underside, the throat — the throat's cream stays; under the pad, where the jaw's side faces down too, it is kept
    // to `side` [from, to] below the line: the band a side view sees under the pad, u1 L* 28–35)
    const down = n ? sstep(-0.3, -0.7, n[1]) * sstep(LM.side[0], LM.side[1], dy) : 0;
    const wj = wo * (1 - sstep(LM.jaw[0], LM.jaw[1], dy)) * (1 - down), wm = wo * (1 - sstep(LM.reach[0], LM.reach[1], dy));
    if (wj > 0.01) blend(c, P.cheek, wj * A.lipJaw);
    if (wm > 0.01) blend(c, P.lipShade, wm * A.lipShade);
  }

  // ---- the pectoral lobe (past the root pad, where the axilla mark stays): the body's ground and marks under an ochre-
  // tan wash (B010's warmth), speckled like the body (u1): fine dark dots and a few larger spots; its upper / outer face
  // a little darker
  {
    const lp = lobeParam(q, side);
    if (lp.t > 0.05 && lp.r < 0.16) {
      const dArm = ctx.arm(x, y, az);
      const wl = (1 - sstep(0.004, 0.022, dArm)) * sstep(0.22, 0.55, lp.t);
      if (wl > 0) {
        blend(c, lerp3(P.pectLobe, P.cheekOlive, 0.35 * sat(0.5 + 1.2 * lf1), _k), wl * A.lobe);
        if (n && n[2] * side + 0.3 * n[1] > 0.2) { const f = 1 - 0.18 * wl * sstep(0.2, 0.7, n[2] * side + 0.3 * n[1]); c[0] *= f; c[1] *= f; c[2] *= f; }
        // (B010: fine dark streaks along the limb; u1: dense dark speckle and a few blotches)
        const S = BODY_SCULPT.pectoral, ax = S.wrist[0] - S.shoulder[0], ay = S.wrist[1] - S.shoulder[1], azz = S.wrist[2] - S.shoulder[2], al = Math.hypot(ax, ay, azz);
        const qx = x - S.shoulder[0], qy = y - S.shoulder[1], qz = az - S.shoulder[2], along = (qx * ax + qy * ay + qz * azz) / al;
        const px = qx - (along * ax) / al, py = qy - (along * ay) / al, pz = qz - (along * azz) / al;
        const fullS = sstep(1.0, 2.0, 0.008 / ctx.texHL);
        const sk = fullS > 0 ? sstep(0.25, 0.55, perlin3(along * 7, px * 75, pz * 75 + py * 75, ctx.seed + 71)) * sstep(-0.2, 0.3, fbm(x * 12, y * 12, z * 12, 2, ctx.seed + 72)) : 0;
        blend(c, P.lobeDot, (0.12 + (sk - 0.12) * fullS) * A.lobeStreak * wl);
        blend(c, P.lobeDot, spotsAt(ctx, 'lobeDot', q, _w, 0.9, null) * A.lobeDot * wl);
        blend(c, P.lobeDot, spotsAt(ctx, 'lobeSpot', q, _w, 0.45, null) * A.lobeSpot * wl);
      }
    }
  }

  // ---- the eye's skin cap and the turret's rim: a little more olive and darker (u1, B002)
  if (eyeZ > 0) blend(c, P.eyeCap, A.eyeCap * eyeZ);

  // ---- the excitement crossbands' mask (§2.6)
  let xb = 0;
  if (u > 0.18 && u < 0.84 && part !== 'eyeSkin') {
    for (const b of ctx.xbands) {
      const du = Math.abs(uw - (b.u - 0.03 * vC)) / b.hw;
      xb = Math.max(xb, (1 - sstep(0.6, 1.3, du + 0.4 * lf2)) * (1 - sstep(0.75, 0.92, v)));
    }
  }
  // (round T3: the bars' mask is the excitement crossbands and the barcode's bars together — the runtime's `bars`
  // uniform darkens both: behaviour §2.2.4's barcode 'painted at 30–60 % so a uniform can strengthen it', the barred
  // morph of A030 / A070; `band` the mid-flank band's and blotches' mask, for a band-strength morph uniform if a runtime
  // channel is given to it — unused by the bake today: RUNTIME_CONTRACT.md)
  return { rgb: [Math.max(0, c[0]), Math.max(0, c[1]), Math.max(0, c[2])], bars: Math.max(xb, barMask), band: bandMask };
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
