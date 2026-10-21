// The トビハゼ's skin surface for the textures round (T1): the normal-map detail, the occlusion, the cavities and the
// roughness / wetness, as functions of the fish-frame position (anatomy.mjs: s back from the snout tip, y up from the
// head's floor, z to the fish's left; mm), so every chart and every tier bakes the same skin from the same functions
// (bake.mjs: a texel's value is a function of the place on the fish under it — seamless across the charts' edges).
//   surfaceContext(fish, o)   the precomputed tables for one tier's field: the body's section arcs (the scale rows run
//                             round the body by arc length), the pit organs placed on the skin, the lips', the lobes' and
//                             the gill cover's frames
//   skinDetail(p, n, part, ctx, fp)  per texel: the normal perturbation dn (the field's own normal where the tier mesh
//                             lost the sculpt's detail, plus the skin's relief), the wet-state roughness, the occlusion,
//                             the cavity, the wet retention (`wet`: how long the place holds its water film)
//   aoField(fish, p, n)       the sculpt's occlusion from the field (7 taps along the normal; the eye globes added)
//   WET, wetShade()           the runtime's wetness model (behaviour.md §2.5): wet / damp / dry / mud
// The relief (heights in mm, `detailHeight`), from the research (behaviour.md §2.5; research body_fins_colour §4,
// literature_morph §2–3, face_front_top §4, face_side_34, anat_soft §1, §4) and the photos (u1, B010, A007, B006):
//   scales      cycloid, imbricate, embedded (the wet skin over them): on the trunk behind the gill cover's margin and on
//               the nape (the predorsal scales up to behind the eyes), none on the snout, the interorbital, the cheek's
//               face and the isthmus; the rows run round the body by arc length, the transverse rows bent as the
//               myomeres (a chevron, its apex forward at the horizontal septum, v 0.45); the along-row pitch grows from
//               0.42 mm on the nape and 0.48 mm behind the head to 0.82 mm at the caudal base (literature: "largest
//               posteriorly"): 80.6 scales in the lateral series (s 1.0 HL → SL; Lee 1995 75–84, mean 79; Murdy 1989
//               75–100, mean 85.3), 34 predorsal (s 0.5 → 1.49 HL; Lee 35–40, Murdy 25–35), rows 0.75 of the pitch apart
//               (25 rows round the half girth at the anal fin's origin: TRB 24–26, Lee); A007 (the only photo that
//               resolves them: a dark fish in low sun) reads a 4.5–6 px period on a ~620 px TL, 0.6–0.8 mm
//   head        granular papillae (u1, B010: a fine granular skin, glints on the granules), sparse pores; the pit
//               organs' papillae in Lee 1995 Fig. 4A's rows (111 papillae, digitised: the cheek's vertical rows, the
//               mandibular rows, the postorbital row onto the nape; "no open head pores"); the posterior nostril's slit
//   lips        the upper-lip pad and the median lip: a fine stipple and fine wrinkles across the pad (SOFT §1.1: "finely
//               stippled, glossy"; FST: "finely wrinkled")
//   lobe        the pectoral lobe: fine longitudinal striations over the radials, converging toward the junction
//   margins     fine wrinkles along the gill cover's margin, two folds on the eye's collar under the cup's rim
// Every layer is band-limited for the map it is baked into (ctx.fpRef: ONE footprint for the whole map, the coarsest skin
// chart's, 0.032 mm a texel at 2048 — a per-texel footprint steps at every triangle and differs between two charts at a
// seam): a layer fades out where its features span under ~3–6 texels and no edge is sharper than 5 texels (the scales'
// free margins; the imbrication is painted posterior-first with soft coverage, so it has no step anywhere, the triple
// points included), and the field's own normal gives way to the mesh's where a crease is tighter than ~2 texels.
// For the bake (requests to the tech key, measured in round T1, scratchpad ref/work/t1_surface):
//   - n and dn are directions in the fish frame (anatomy.dirToObject's input); `part` only switches the eye's window, the
//     eye's skin cap and the teeth: every skin chart (head, body, lobe, lip, interior) runs the same rule, so the charts
//     agree at their seams; leave `fp` out (ctx.fpRef) or pass one value for the whole map
//   - rasterise with the triangles' attributes extrapolated 1.5 texels past their edges (the nearest triangle) and
//     dilate only beyond: the bilinear lookups along a seam then read evaluated texels (seams: median 0.42° → 0.25°,
//     p95 5.6° → 3.8°, the occlusion's p95 step 0.15 → 0.06)
//   - the hero's mips: bake each level with surfaceContext(fish, { size: level }) and pack those as the KTX2's mips
//     (detail energy within 0.35–0.5 cycles/texel: 4.1 % at 2048, 0.9 % at 1024, 3.1 % at 512); the packer's own
//     generated mips (Kaiser) of the 2048 level keep 14.5 % at mip 1, 18.7 % at mip 2 (the granules and the scales'
//     margins at 1.5–2.5 texels there); without custom mips, bake level 0 with { fp: 2 · fpRef } (mip 1 0.7 %, the
//     head's granules then off at level 0)
//   - the ORM: R occlusion (aoField, with the eye globes), G the WET state's roughness, B the wet retention (`wet`) with
//     metallicFactor 0 (three.js multiplies the B channel by it: no metalness); lod2's lit colour: skinDetail with
//     surfaceContext(fish, { relief: false }) gives the sculpt's normal (n + dn) and the occlusion
import { HL, TL, SL, HEAD, EYE_MM } from './anatomy.mjs';
import { HEAD_SCULPT } from './head.mjs';
import { BODY_SCULPT, trunkProfile, armField } from './body.mjs';
import { smoothPath, tube, smin } from './sdf.mjs';
import { perlin3 } from '../../lib/noise.mjs';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/** A 32-bit integer hash of a lattice cell (and a seed): the same as tools/lib/noise.mjs hash3i. */
function hash3i(x, y, z, seed = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647 + seed * 1274126177;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}
const u01 = (h, k) => ((h >>> (k * 8)) & 255) / 255;

/** Smooth gradient noise (tools/lib/noise.mjs perlin3, scaled to about [-1, 1]): the slow variation of the roughness,
 * the lattice's wander, the wrinkles' warps (value noise showed its grid as square blocks in the roughness). */
const vnoise = (x, y, z, seed) => 1.4 * perlin3(x, y, z, seed);

// ------------------------------------------------------------------------------------------------- parameters

/** The scales (research above; mm unless noted). */
export const SCALES = {
  // along-row pitch: [s (HL), mm] at the nape's front end, behind the head (the lateral series' start) and at the
  // caudal base (SL); linear between, constant outside
  pitch: { nape: [0.50, 0.42], a: [1.00, 0.48], b: [SL / HL, 0.82] },
  rowRatio: 0.75,       // row spacing / along-row pitch (TRB 25 at the anal origin)
  septum: 0.55,         // the horizontal septum's arc share from the ventral midline (v 0.45)
  slant: { up: 0.42, down: 0.22 },  // the transverse rows' backward shift per row above / below the septum (scales)
  radius: [0.85, 0.95], // each scale's half-axes along the row and across it (× pitch, × row spacing): imbricate
  amp: 0.016,           // relief of a scale's exposed field (mm): embedded under the skin and a water film, so the
                        // free margins read in grazing light (slopes to ~6°) and the pigment (cavity's pockets) does the rest
  edge: 0.035,          // the free margin's rounding (mm; at least 1.6 texels)
  rimTexels: 5,         // the free margin at least this many texels wide (level 0 at 2048: the Kaiser mip 1 keeps 6 % of
                        // its detail energy near its Nyquist with 5, 14 % with 3; the gates)
  jitter: 0.16,         // centre jitter (share of the pitch / row): "scale series irregular" (Lee 1995)
  warp: [0.3, 2.6],     // the lattice's slow wander (cells, over mm): the rows are not ruled lines
};
/** The head's relief (mm). */
export const HEAD_SKIN = {
  // (the hero's 2048 map draws 0.024–0.032 mm a texel: a relief feature under ~0.1 mm cannot be in it without aliasing;
  // the finer pigment granules and pores are the colour's)
  granule: { cell: 0.2, r: [0.06, 0.09], amp: 0.006 },     // the granular papillae (u1, B010: pale granules 0.09–0.14 mm, 0.2–0.28 mm apart)
  pore: { cell: 0.42, r: 0.05, depth: 0.004, share: 0.45 },  // sparse pores (cheek, snout)
  pit: { r: 0.085, amp: 0.009, core: 0.035, coreDepth: 0.005 }, // the pit organs' papillae (Lee 1995 Fig. 4A)
  nostril: { len: 0.26, wid: 0.10, depth: 0.02 },               // the posterior nostril's slit
  lip: { stipple: { cell: 0.13, r: 0.05, amp: 0.0025 }, wrinkle: { period: 0.2, amp: 0.0018 } },
  lobe: { lines: 30, amp: 0.0042, ridges: 4, ridgeAmp: 0.009 },
  opercle: { period: 0.22, amp: 0.0018, band: 0.06 },           // gill cover margin wrinkles (band in HL)
  collar: { folds: [0.032, 0.068], width: 0.09, amp: 0.012 },   // eye collar folds: HL under the cup's rim, mm wide
};

/**
 * Pit organs of P. modestus (Lee, Choi & Ryu 1995, Fig. 4A, digitised: s back from the snout tip, height above the
 * head's lower outline, HL; the left side): the papillae rows on the snout, cheek, lower jaw, preopercle and opercle,
 * and the postorbital row onto the nape. Placed on the skin by a ray from the side at build time.
 */
export const PIT_ORGANS = [[0.022, 0.132], [0.085, 0.153], [0.087, 0.029], [0.106, 0.018], [0.108, 0.169], [0.118, 0.417], [0.127, 0.291], [0.13, 0.046], [0.156, 0.225], [0.158, 0.045], [0.159, 0.383], [0.162, 0.308], [0.164, 0.463], [0.169, 0.271], [0.175, 0.037], [0.186, 0.375], [0.194, 0.028], [0.197, 0.25], [0.203, 0.074], [0.21, 0.432], [0.225, 0.044], [0.23, 0.473], [0.237, 0.107], [0.248, 0.03], [0.259, 0.076], [0.262, 0.114], [0.262, 0.151], [0.262, 0.251], [0.282, 0.09], [0.295, 0.032], [0.297, 0.064], [0.301, 0.13], [0.303, 0.198], [0.314, 0.099], [0.324, 0.075], [0.327, 0.271], [0.328, 0.246], [0.334, 0.214], [0.335, 0.376], [0.339, 0.044], [0.351, 0.139], [0.361, 0.323], [0.365, 0.273], [0.379, 0.167], [0.38, 0.012], [0.384, 0.043], [0.401, 0.129], [0.414, 0.318], [0.414, 0.542], [0.415, 0.075], [0.416, 0.039], [0.418, 0.019], [0.419, 0.106], [0.428, 0.241], [0.433, 0.731], [0.438, 0.627], [0.441, 0.679], [0.442, 0.651], [0.45, 0.025], [0.45, 0.054], [0.455, 0.281], [0.457, 0.689], [0.465, 0.109], [0.48, 0.076], [0.483, 0.638], [0.488, 0.161], [0.514, 0.227], [0.517, 0.024], [0.52, 0.646], [0.526, 0.058], [0.544, 0.019], [0.552, 0.653], [0.561, 0.049], [0.562, 0.076], [0.571, 0.114], [0.575, 0.019], [0.576, 0.158], [0.581, 0.053], [0.586, 0.328], [0.595, 0.034], [0.6, 0.444], [0.618, 0.023], [0.653, 0.442], [0.66, 0.016], [0.661, 0.037], [0.661, 0.644], [0.666, 0.056], [0.668, 0.383], [0.674, 0.079], [0.674, 0.238], [0.676, 0.327], [0.679, 0.108], [0.679, 0.163], [0.679, 0.192], [0.679, 0.266], [0.683, 0.134], [0.721, 0.165], [0.725, 0.647], [0.761, 0.168], [0.795, 0.645], [0.803, 0.172], [0.847, 0.663], [0.863, 0.412], [0.876, 0.385], [0.896, 0.35], [0.918, 0.682], [0.924, 0.308], [0.932, 0.657], [0.998, 0.713], [1.01, 0.693], [1.034, 0.689]];

/**
 * The wetness model for the runtime (behaviour.md §2.5; the materials' extras tobihaze.wet): the maps hold the WET state
 * (ORM G: the roughness with the film on, 0.28–0.42 about `wet.roughness`) and the wet retention (`retain`, 0 the
 * dorsum and the head's top, which dry first and go matte and velvety — the skin has no mucous cells — 1 the lips, the
 * eye's collar, the cavities, the belly and the gill slit's surroundings, which keep their film longest); the runtime's
 * `wetness` uniform (1 out of the water or after rolling, falling as it dries) and `mud` (0..1, a mud coat) give each
 * texel its state through wetShade(): its local wetness, then the roughness, the clearcoat (the water film: neutral
 * near-white highlights), the albedo's darkening and saturation.
 */
export const WET = {
  wet: { roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.12, albedo: 0.85, saturation: 1.1 },
  damp: { roughness: 0.45, clearcoat: 0.18, clearcoatRoughness: 0.2 },
  dry: { roughness: 0.6 },
  mud: { roughness: 0.7, colour: '#8e8a82', wet: '#5f5a52', ventral: [0.15, 0.75] },
  // (the local wetness: w_l = clamp(wetness·(1 + γ) − γ·(1 − retain)); at wetness 1 every texel is wet, at 0 every texel
  // dry, at 0.5 the dorsum (retain 0.2) 0.14 and the belly (0.85) 0.92)
  gamma: 1.2,
  // the map's G about wet.roughness carries over to the dry state at this share (the lips stay smoother when dry too)
  carry: 0.5,
  // the eye (the window's G from the eye's own painting; the globe's skin cap always wet)
  eye: { clearcoat: 1, clearcoatRoughness: 0.03, window: 0.05, skin: 0.28 },
  channels: { roughness: 'ORM G (the wet state)', retain: 'ORM B (metallicFactor 0, so three.js reads no metalness from it)', occlusion: 'ORM R' },
};

/**
 * One texel's shading state for the runtime's wetness (a reference for the shader: GLSL is a line for line port).
 * @param rough  the map's roughness (ORM G, the wet state)
 * @param retain the map's wet retention (ORM B)
 * @param wetness the fish's wetness uniform, 0 dry … 1 wet
 * @param mud    the mud coat 0..1; ventral: the object-space normal's downward share (−n_y) for the mud's clumps
 * @returns { wl (local wetness), roughness, clearcoat, clearcoatRoughness, albedoMul, saturation, mud (the mud colour's
 *   blend weight) }
 */
export function wetShade(rough, retain, wetness, mud = 0, ventral = 0) {
  const g = WET.gamma, wl = clamp(wetness * (1 + g) - g * (1 - retain));
  const dry = WET.dry.roughness + (rough - WET.wet.roughness) * WET.carry;
  let roughness = mix(dry, rough, wl);
  const cw = sstep(0.35, 1, wl);
  const clearcoat = WET.wet.clearcoat * cw + WET.damp.clearcoat * (1 - cw) * sstep(0.15, 0.5, wl);
  const clearcoatRoughness = mix(WET.damp.clearcoatRoughness, WET.wet.clearcoatRoughness, cw);
  const mw = clamp(mud * (0.45 + 0.55 * sstep(WET.mud.ventral[0], WET.mud.ventral[1], ventral)));
  roughness = mix(roughness, WET.mud.roughness, mw);
  return { wl, roughness, clearcoat: clearcoat * (1 - mw), clearcoatRoughness, albedoMul: mix(1, WET.wet.albedo, wl * (1 - mw)), saturation: mix(1, WET.wet.saturation, wl * (1 - mw)), mud: mw };
}

// ------------------------------------------------------------------------------------------------- the context

/** The head's opercle margin as s (HL) at height y (HL): head.mjs's Hermite through K.opercle.path. */
function opercleMargin(K) {
  const opP = K.opercle.path.map((p) => [p[0], p[1]]).sort((a, b) => a[1] - b[1]);
  const opT = opP.map((_, i) => {
    const a = opP[Math.max(0, i - 1)], c = opP[Math.min(opP.length - 1, i + 1)];
    return (c[0] - a[0]) / (c[1] - a[1]);
  });
  return (y) => {
    if (y <= opP[0][1]) return opP[0][0];
    for (let i = 0; i + 1 < opP.length; i++) {
      const [s1, y1] = opP[i], [s2, y2] = opP[i + 1];
      if (y <= y2) {
        const h = y2 - y1, t = (y - y1) / h, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * s1 + (t3 - 2 * t2 + t) * h * opT[i] + (-2 * t3 + 3 * t2) * s2 + (t3 - t2) * h * opT[i + 1];
      }
    }
    return opP[opP.length - 1][0];
  };
}

/** The body's section arcs (fishmesh.mjs sectionArcs' rule, outer skin, the lobes left out): per station the share of
 * the arc from the ventral midline at each angle about the body's axis, and the half girth (mm). */
function sectionArcs(fishHL, axisY, { s0 = 0.30, s1 = 4.40, ds = 0.025, na = 48 } = {}) {
  const ns = Math.round((s1 - s0) / ds) + 1, tab = new Float32Array(ns * (na + 1)), girth = new Float32Array(ns);
  const noLobe = (x, y, z) => (x > 0.95 && x < 1.65 ? fishHL.parts(x, y, z).noLobe : fishHL(x, y, z));
  for (let i = 0; i < ns; i++) {
    const s = s0 + i * ds, yc = axisY(s);
    const pts = [];
    for (let j = 0; j <= na; j++) {
      const ph = (Math.PI * j) / na, dy = -Math.cos(ph), dz = Math.sin(ph), step = 0.012;
      let last = -1;
      for (let q = 0; q * step < 0.9; q++) if (noLobe(s, yc + dy * q * step, dz * q * step) < 0) last = q * step;
      if (last < 0) { pts.push([yc, 0]); continue; }
      let lo = last, hi = last + step;
      for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (noLobe(s, yc + dy * m, dz * m) < 0) lo = m; else hi = m; }
      pts.push([yc + dy * lo, dz * lo]);
    }
    let acc = 0;
    tab[i * (na + 1)] = 0;
    for (let j = 1; j <= na; j++) { acc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); tab[i * (na + 1) + j] = acc; }
    for (let j = 1; j <= na; j++) tab[i * (na + 1) + j] /= acc || 1;
    if (!(acc > 0)) for (let j = 0; j <= na; j++) tab[i * (na + 1) + j] = i > 0 ? tab[(i - 1) * (na + 1) + j] : j / na;
    girth[i] = (acc > 0 ? acc : i > 0 ? girth[i - 1] / HL : 0.1) * HL;
  }
  return { s0, s1, ds, na, ns, tab, girth };
}

/** The pitch along the rows (mm) and the scale count σ from s = SCALES.pitch.a (mm in, scales out). */
function pitchLaw(P = SCALES.pitch) {
  const sN = P.nape[0] * HL, pN = P.nape[1], sA = P.a[0] * HL, pA = P.a[1], sB = P.b[0] * HL, pB = P.b[1];
  const kN = (pA - pN) / (sA - sN), k = (pB - pA) / (sB - sA);
  const pitch = (s) => (s <= sN ? pN : s <= sA ? pN + kN * (s - sN) : s <= sB ? pA + k * (s - sA) : pB);
  const sigN = Math.log(pN / pA) / kN, sigB = Math.log(pB / pA) / k;
  const sigma = (s) => (s <= sN ? sigN + (s - sN) / pN : s <= sA ? Math.log(pitch(s) / pA) / kN : s <= sB ? Math.log(pitch(s) / pA) / k : sigB + (s - sB) / pB);
  return { pitch, sigma, lateral: sigB, predorsal: sigma(BODY_SCULPT.keels.d1.s[0] * HL) - sigma(0.5 * HL) };
}

/**
 * The precomputed tables for one tier's field.
 * @param fish  the tier's field in fish mm with .hl (body.fishSDFmm(HL) for the hero, fishmesh.tierField('lod1' |
 *              'lod2') for the sealed and far skins)
 * @param o     { size: the normal map's size (px; the default texel footprints when skinDetail gets none), K, H (body and
 *              head sculpts), arcs (a previous context's ctx.arcs, to skip the section scan), field: false (no
 *              field-normal term), tier: 'hero' | 'lod1' | 'lod2' (the field term's tolerance) }
 */
export function surfaceContext(fish, o = {}) {
  const K = o.K ?? BODY_SCULPT, H = o.H ?? HEAD_SCULPT, size = o.size ?? 2048;
  const prof = trunkProfile(K);
  const axisY = (sh) => { const w = sstep(1.0, 1.4, sh); return w <= 0 ? 0.30 : (1 - w) * 0.30 + w * prof.at(Math.max(1.05, sh)).yc; };
  const arcs = o.arcs ?? sectionArcs(fish.hl, axisY);
  const law = pitchLaw();
  const sOp = opercleMargin(H);
  // the upper-lip pad (head.mjs: the bean and the median lip, HL; z ≥ 0)
  const padP = smoothPath(H.pad.path, H.pad.radius, H.pad.samples), medP = smoothPath(H.pad.median.path, H.pad.median.radius, 24);
  const bean0 = tube(padP.points, padP.radii, 0.2), median = tube(medP.points, medP.radii, 0.2);
  const psy = H.pad.sy ?? 1, pyc = H.pad.path.reduce((a, p) => a + p[1], 0) / H.pad.path.length;
  const bean = psy === 1 ? bean0 : (x, y, z) => bean0(x, pyc + (y - pyc) / psy, z) * Math.min(1, psy);
  const lowP = smoothPath(H.jaw.lip.path, H.jaw.lip.radius, 48), lowLip = tube(lowP.points, lowP.radii, 0.2);
  const pad = (x, y, z) => Math.min(smin(bean(x, y, z), median(x, y, z), 0.02), lowLip(x, y, z));
  // the arm (HL, z ≥ 0) and its frame
  const arm = armField(K), PC = K.pectoral;
  const au = norm3(sub3(PC.wrist, PC.shoulder)), aL = len3(sub3(PC.wrist, PC.shoulder));
  const an0 = PC.axes?.n ?? [0, 0, 1], an = norm3(sub3(an0, mul3(au, dot3(an0, au)))), aw = cross3(an, au);
  // pit organs on the skin (left side; mirrored by |z|): a ray from the side at each (s, y)
  const pits = [];
  for (const [s, y] of PIT_ORGANS) {
    const yy = Math.max(0.012, y);
    let z0 = -1;
    for (let z = 0.75; z >= 0; z -= 0.004) if (fish.hl(s, yy, z) < 0) { z0 = z; break; }
    if (z0 < 0) continue;
    let lo = z0, hi = z0 + 0.004;
    for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (fish.hl(s, yy, m) < 0) lo = m; else hi = m; }
    pits.push([s * HL, yy * HL, lo * HL]);
  }
  // the posterior nostril on the skin (head.mjs nostrilPost), and the slit's direction (along the snout's slope)
  const NP = H.nostrilPost.c;
  let nz = NP[2];
  for (let z = 0.4; z >= 0; z -= 0.002) if (fish.hl(NP[0], NP[1], z) < 0) { nz = z; break; }
  const nostril = [NP[0] * HL, NP[1] * HL, nz * HL];
  // a hash grid of the pit organs (cell 0.5 mm) for the per-texel lookup
  const grid = new Map(), gc = 0.5;
  const gkey = (a, b, c) => `${Math.floor(a / gc)},${Math.floor(b / gc)},${Math.floor(c / gc)}`;
  pits.forEach((q, i) => { const k = gkey(q[0], q[1], q[2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const eyeC = EYE_MM.center, eyeR = EYE_MM.radius;
  const keels = K.keels;
  return {
    fish, K, H, size, tier: o.tier ?? 'hero', field: o.field !== false, relief: o.relief !== false, arcs, axisY, law, sOp, pad, arm, armFrame: { au, an, aw, aL, shoulder: PC.shoulder, radius: PC.radius },
    pits, grid, gc, nostril, eyeC, eyeR, prof, keels, cup: H.cup,
    // the band limits' footprint (mm a texel), ONE value for the whole map so the charts agree at their seams: the
    // coarsest of the skin's charts (fishmesh.mjs BODY_LAYOUT sizes the body's for 0.0019 HL a texel at 2048, the face's
    // for 0.0015; measured on the hero at 2048: median 0.027 mm, p90 0.032) at this size; o.fp overrides it
    fpRef: o.fp ?? (0.032 * 2048) / size,
  };
}

// ------------------------------------------------------------------------------------------------- small vectors
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul3(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function len3(a) { return Math.hypot(a[0], a[1], a[2]); }
function norm3(a) { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
/** Two unit tangents square to n (a fixed rule from n alone: the same on both sides of a chart seam). */
function tangents(n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t1 = norm3(cross3(n, a)), t2 = cross3(n, t1);
  return [t1, t2];
}

// ------------------------------------------------------------------------------------------------- regions

/**
 * The region weights at a point (fish mm), all from the position (so the charts agree at their seams).
 * @returns { trunk (behind the gill cover's margin), nape, head (the head's naked skin), lip, lobe, v (0 the dorsal
 *   midline … 1 the ventral one), arc { a, girth } , sh, yh (HL) }
 */
export function arcAt(p, ctx) {
  const sh = p[0] / HL, yh = p[1] / HL, zh = Math.abs(p[2]) / HL;
  const A = ctx.arcs;
  // the section angle about the body's axis and its arc share from the ventral midline
  const yc = ctx.axisY(sh), ph = Math.atan2(zh, -(yh - yc));
  const fs = clamp((sh - A.s0) / A.ds, 0, A.ns - 1), i = Math.min(A.ns - 2, Math.floor(fs)), ts = fs - i;
  const fa = clamp((ph / Math.PI) * A.na, 0, A.na), j = Math.min(A.na - 1, Math.floor(fa)), ta = fa - j;
  const at = (ii) => A.tab[ii * (A.na + 1) + j] * (1 - ta) + A.tab[ii * (A.na + 1) + j + 1] * ta;
  return { a: at(i) * (1 - ts) + at(i + 1) * ts, girth: A.girth[i] * (1 - ts) + A.girth[i + 1] * ts };
}

export function regions(p, ctx, n = null) {
  const sh = p[0] / HL, yh = p[1] / HL, zh = Math.abs(p[2]) / HL;
  const { a, girth } = arcAt(p, ctx);
  // (v by the arc round the body's axis; on the face, where that axis runs out through the snout and the angle about it
  // turns round a point — a pinwheel at the snout's tip — by the normal's tilt instead (0 facing up, 1 facing down))
  const wn = n ? 1 - sstep(0.55, 0.9, sh) : 0;
  const v = wn > 0 ? mix(1 - a, 0.5 - 0.5 * n[1], wn) : 1 - a;
  // behind the gill cover's margin (the scaled trunk), the head's naked skin in front of it
  const dOp = sh - ctx.sOp(clamp(yh, 0.02, 0.5));
  // (above the opercle's path, y > 0.5, the margin's s at its top, 0.996, then the nape)
  const trunk = sstep(0.02, 0.10, dOp);
  // the nape: the predorsal scales from behind the eyes, above the opercle
  const nape = sstep(0.50, 0.66, sh) * sstep(0.47, 0.58, yh) * (1 - trunk);
  const head = clamp(1 - trunk - nape);
  // the lips: on the pad's (and the lower lip's) own surface
  const dp = ctx.pad(sh, yh, zh);
  const lip = (1 - sstep(0.003, 0.014, dp)) * (sh < 0.42 ? 1 : 0);
  // the pectoral lobe: on the arm's surface, from just past the shoulder
  let lobe = 0, lt = 0;
  if (sh > 0.95 && sh < 1.75 && zh > 0.15) {
    const da = ctx.arm(sh, yh, zh);
    if (da < 0.03) {
      const F = ctx.armFrame, q = [sh - F.shoulder[0], yh - F.shoulder[1], zh - F.shoulder[2]];
      lt = dot3(q, F.au) / F.aL;
      lobe = (1 - sstep(0.004, 0.02, da)) * sstep(0.08, 0.3, lt);
    }
  }
  return { trunk: trunk * (1 - lobe), nape: nape * (1 - lobe), head: head * (1 - lip) * (1 - lobe), lip: lip * (1 - lobe), lobe, lt, v, a, girth, sh, yh, zh, dOp };
}

// ------------------------------------------------------------------------------------------------- relief layers

/** Band limit: 0 where a feature of `lambda` mm spans fewer than lo texels, 1 above hi. */
const band = (lambda, fp, lo = 2.5, hi = 4.5) => sstep(lo, hi, lambda / Math.max(fp, 1e-6));

/** The scale relief at p (mm) for the trunk and the nape: { h (mm), pocket (0..1, the free margin's pocket) }. */
function scaleHeight(p, R, ctx, fp) {
  const S = SCALES, law = ctx.law, s = p[0];
  const pt = law.pitch(s), hr = S.rowRatio * pt;
  // rows round the body from the horizontal septum (mm of arc → rows; at this point, not the texel's centre: the
  // slope across the rows is the finite differences' too)
  const A = arcAt(p, ctx), Vs = (A.a - S.septum) * A.girth / hr;
  // the chevron: the transverse rows lean back above and below the septum (a rounded apex, one row wide)
  const absV = Math.sqrt(Vs * Vs + 1) - 1, chev = Vs > 0 ? S.slant.up * absV : S.slant.down * absV;
  const side = p[2] >= 0 ? 1 : 2;
  // (the lattice wanders slowly: the rows and the transverse rows are not ruled lines)
  const wa = S.warp[0], wl = S.warp[1];
  const U = law.sigma(s) - chev + wa * vnoise(p[0] / wl, p[1] / wl, p[2] / wl, 61 + side);
  const Vw = Vs + wa * vnoise(p[0] / wl, p[1] / wl, p[2] / wl, 67 + side);
  const jb = Math.round(Vw);
  const Ru = S.radius[0], Rv = S.radius[1];
  // the candidates (3 rows × 3 along the row about the point), each with its own centre, size and relief
  const cands = [];
  for (let dj = -1; dj <= 1; dj++) {
    const jr = jb + dj, off = (jr & 1) * 0.5;
    const ib = Math.round(U - off);
    for (let di = -1; di <= 1; di++) {
      const ir = ib + di, h = hash3i(ir, jr, side, 911);
      const cu = ir + off + (u01(h, 0) - 0.5) * 2 * S.jitter, cv = jr + (u01(h, 1) - 0.5) * 2 * S.jitter;
      const rs = 0.9 + 0.2 * u01(h, 2);
      const du = (U - cu) / (Ru * rs), dv = (Vw - cv) / (Rv * rs);
      const rho = Math.hypot(du, dv);
      if (rho >= 1) continue;
      cands.push({ cu, du, dv, rho, amp: 0.7 + 0.6 * u01(h, 3), id: h });
    }
  }
  // the exposed field rises toward the free (posterior) margin, a little lower at its sides, and a gentle dome (the
  // embedded scale's exposed field is a little convex)
  const prof = (c) => c.amp * (0.3 + 0.4 * (0.5 + 0.5 * c.du) * (1 - 0.25 * c.dv * c.dv) + 0.3 * (1 - c.rho * c.rho));
  // imbrication by painting: the posterior scales first, each anterior one laid over them with its rounded free
  // margin (coverage 1 inside, 0 at its rim, over `we`): continuous everywhere, the triple points too (a "most anterior
  // covering scale" pick jumps where a third scale's rim crosses the top one's margin)
  const we = Math.max(S.edge, S.rimTexels * fp) / (Ru * pt);
  cands.sort((a, b) => b.cu - a.cu);
  // (ro: each scale's own roughness offset, painted with its coverage too, so the roughness has no step at a margin)
  let h = 0.3, ro = 0, topC = null, topCov = 0;
  for (const c of cands) {
    const cov = sstep(1, 1 - we, c.rho);
    if (cov <= 0) continue;
    h = mix(h, prof(c), cov);
    ro = mix(ro, u01(c.id, 1) - 0.5, cov);
    topC = c; topCov = cov;
  }
  if (!topC) return { h: 0.3 * S.amp, pocket: 0, id: 0, ro: 0 };
  // the pocket: just behind the free margin, where the next scale comes out from under it
  const pocket = (1 - topCov) * sstep(0.2, 0.6, topC.du);
  return { h: S.amp * h, pocket, id: topC.id, ro };
}

/** The granular papillae, the pores (3-D jittered cells: no repeat, no seam) and their slope (analytic). */
function granules(p, cell, rr, amp, seed, fp, out) {
  const x = p[0] / cell, y = p[1] / cell, z = p[2] / cell;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let h = 0, gx = 0, gy = 0, gz = 0;
  const r0 = rr[0] / cell, r1 = rr[1] / cell;
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, cz = iz + k, hh = hash3i(cx, cy, cz, seed);
        const fx = cx + 0.1 + 0.8 * u01(hh, 0), fy = cy + 0.1 + 0.8 * u01(hh, 1), fz = cz + 0.1 + 0.8 * u01(hh, 2);
        const r = r0 + (r1 - r0) * u01(hh, 3);
        const dx = x - fx, dy = y - fy, dz = z - fz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        // a smooth cap (1 − d²/r²)², its gradient −4 (1 − d²/r²) d / r²
        const q = 1 - d2 / (r * r), a = amp * (0.7 + 0.6 * (((hh >>> 5) & 63) / 63));
        h += a * q * q;
        const g = (-4 * a * q) / (r * r);
        gx += g * dx; gy += g * dy; gz += g * dz;
      }
  // (the gradient in mm per mm: the cell coordinates are p / cell)
  const bl = band(rr[0] + rr[1], fp, 3, 5);
  out.h += h * bl; out.g[0] += (gx / cell) * bl; out.g[1] += (gy / cell) * bl; out.g[2] += (gz / cell) * bl;
  return bl;
}

/** The head's pores: sparse small pits (a share of the cells hold one). */
function pores(p, P, fp, out, w) {
  const x = p[0] / P.cell, y = p[1] / P.cell, z = p[2] / P.cell;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), r = P.r / P.cell;
  const bl = band(2 * P.r, fp, 3, 5) * w;
  if (bl <= 0) return 0;
  let cav = 0;
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, cz = iz + k, hh = hash3i(cx, cy, cz, 4242);
        if (u01(hh, 3) > P.share) continue;
        const fx = cx + 0.15 + 0.7 * u01(hh, 0), fy = cy + 0.15 + 0.7 * u01(hh, 1), fz = cz + 0.15 + 0.7 * u01(hh, 2);
        const dx = x - fx, dy = y - fy, dz = z - fz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const q = 1 - d2 / (r * r), a = -P.depth * bl;
        out.h += a * q * q;
        const g = (-4 * a * q) / (r * r);
        out.g[0] += (g * dx) / P.cell; out.g[1] += (g * dy) / P.cell; out.g[2] += (g * dz) / P.cell;
        cav = Math.max(cav, q * bl);
      }
  return cav;
}

/** The pit organs' papillae (Lee 1995 Fig. 4A): a low papilla with the neuromast's pit in its middle. */
function pitOrgans(p, ctx, fp, out, w) {
  const P = HEAD_SKIN.pit, q = [p[0], p[1], Math.abs(p[2])], sz = p[2] >= 0 ? 1 : -1;
  const bl = band(2 * P.r, fp, 3.5, 5.5) * w;
  if (bl <= 0) return 0;
  const gc = ctx.gc, cx = Math.floor(q[0] / gc), cy = Math.floor(q[1] / gc), cz = Math.floor(q[2] / gc);
  let cav = 0;
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const list = ctx.grid.get(`${cx + i},${cy + j},${cz + k}`);
        if (!list) continue;
        for (const id of list) {
          const c = ctx.pits[id], dx = q[0] - c[0], dy = q[1] - c[1], dz = q[2] - c[2], d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= P.r * P.r) continue;
          const t = 1 - d2 / (P.r * P.r), a = P.amp * bl;
          let h = a * t * t, g = (-4 * a * t) / (P.r * P.r);
          // the pit
          const rc = P.core, coreBl = band(2 * rc, fp, 3, 5);
          if (d2 < rc * rc && coreBl > 0) {
            const tc = 1 - d2 / (rc * rc), ac = -P.coreDepth * bl * coreBl;
            h += ac * tc * tc; g += (-4 * ac * tc) / (rc * rc);
            cav = Math.max(cav, tc * coreBl * bl);
          }
          out.h += h; out.g[0] += g * dx; out.g[1] += g * dy; out.g[2] += g * dz * sz;
        }
      }
  return cav;
}

/** The posterior nostril's slit (a shallow elliptic pit along the snout's slope, in front of the eye). */
function nostrilSlit(p, ctx, fp, out) {
  const N = HEAD_SKIN.nostril, c = ctx.nostril, q = [p[0] - c[0], p[1] - c[1], Math.abs(p[2]) - c[2]];
  const L = N.len / 2, Wd = N.wid / 2;
  if (Math.abs(q[0]) > 2 * L || Math.abs(q[1]) > 2 * L || Math.abs(q[2]) > 2 * L) return 0;
  // the slit's long axis: up and back along the face (≈ 35° above the s axis), its width across
  const ax = norm3([0.82, 0.57, 0]), d1 = dot3(q, ax), rest = sub3(q, mul3(ax, d1)), d2 = len3(rest);
  const e = (d1 / L) ** 2 + (d2 / Wd) ** 2;
  if (e >= 1) return 0;
  const bl = band(N.wid, fp, 3, 5);
  const t = 1 - e, a = -N.depth * bl;
  out.h += a * t * t;
  // (gradient of e: 2 d1 / L² ax + 2 rest / Wd²)
  const g = -2 * a * t, sz = p[2] >= 0 ? 1 : -1;
  const ge = [(2 * d1 * ax[0]) / (L * L) + (2 * rest[0]) / (Wd * Wd), (2 * d1 * ax[1]) / (L * L) + (2 * rest[1]) / (Wd * Wd), ((2 * d1 * ax[2]) / (L * L) + (2 * rest[2]) / (Wd * Wd)) * sz];
  out.g[0] += g * ge[0]; out.g[1] += g * ge[1]; out.g[2] += g * ge[2];
  return t * bl;
}

/**
 * The relief at p (mm) for the slope by finite differences (the layers whose analytic slope is long-winded: the scale
 * lattice, the lips' wrinkles, the lobe's striations, the gill cover's and the collar's folds), with the region weights
 * of the texel's centre `R` (not re-evaluated at the offsets: a region's edge adds no slope).
 */
function latticeHeight(p, R, ctx, fp, aux) {
  let h = 0;
  const wS = R.trunk + 0.6 * R.nape;
  if (wS > 0.001) {
    const pt = ctx.law.pitch(p[0]);
    // (fades where a scale spans fewer than 3–6 texels; on the belly (v > 0.75) and the dorsal midline (v < 0.03,
    // where the two sides' lattices meet) it fades too: "very small on the ventrum")
    const bl = band(pt, fp, 6, 10) * (1 - 0.7 * sstep(0.72, 0.95, R.v)) * sstep(0.0, 0.03, R.v);
    if (bl > 0) {
      const sc = scaleHeight(p, R, ctx, fp);
      h += sc.h * wS * bl;
      if (aux) { aux.pocket = sc.pocket * wS * bl; aux.id = sc.id; aux.ro = sc.ro; aux.wS = wS * bl; }
    }
  }
  if (R.lip > 0.001) {
    const W = HEAD_SKIN.lip.wrinkle, bl = band(W.period, fp, 5, 7);
    if (bl > 0) {
      // fine wrinkles across the pad (along its length, s), warped a little
      // (warped, of uneven depth and broken along their length: fine creases, not ribs)
      const warp = 0.6 * vnoise(p[0] / 0.25, p[1] / 0.25, p[2] / 0.25, 77);
      const ph = p[0] / W.period + warp, brk = sstep(-0.2, 0.5, vnoise(p[0] / 0.18, p[1] / 0.18, p[2] / 0.18, 79));
      h += -W.amp * Math.pow(0.5 + 0.5 * Math.cos(TAU * ph), 2) * brk * R.lip * bl;
    }
  }
  if (R.lobe > 0.001) {
    const L = HEAD_SKIN.lobe, F = ctx.armFrame;
    const q = [p[0] / HL - F.shoulder[0], p[1] / HL - F.shoulder[1], Math.abs(p[2]) / HL - F.shoulder[2]];
    const qw = dot3(q, F.aw), qn = dot3(q, F.an), th = Math.atan2(qn / 0.5, qw);
    const rMM = (F.radius[1] ?? 0.07) * HL, lam = (TAU * rMM) / L.lines;
    const bl = band(lam, fp, 5, 7), bl2 = band((TAU * rMM) / L.ridges / 2, fp, 5, 7);
    const warp = 0.25 * vnoise(p[0] / 0.6, p[1] / 0.6, p[2] / 0.6, 31);
    h += L.amp * Math.pow(0.5 + 0.5 * Math.cos(L.lines * th + TAU * warp), 2) * bl * R.lobe;
    // the radials' low ridges across the broad face
    h += L.ridgeAmp * (0.5 + 0.5 * Math.cos(L.ridges * th)) * Math.abs(Math.cos(th)) * bl2 * R.lobe;
  }
  // the gill cover's margin: fine wrinkles parallel to it, in front of it, on the side
  const O = HEAD_SKIN.opercle;
  if (R.dOp > -O.band - 0.02 && R.dOp < 0.01 && R.yh > 0.03 && R.yh < 0.55 && R.zh > 0.2) {
    const bl = band(O.period, fp, 5, 7);
    if (bl > 0) {
      const w = sstep(-O.band - 0.02, -O.band + 0.02, R.dOp) * (1 - sstep(-0.012, 0.004, R.dOp)) * sstep(0.2, 0.3, R.zh);
      // (the distance to the margin in mm, from this point's own s and the margin at its height)
      const dmm = (p[0] / HL - ctx.sOp(clamp(p[1] / HL, 0.02, 0.5))) * HL;
      // (wavy, broken and of uneven depth)
      const wv = 0.5 * vnoise(p[0] / 0.4, p[1] / 0.4, p[2] / 0.4, 83), brk = sstep(-0.1, 0.6, vnoise(p[0] / 0.35, p[1] / 0.5, p[2] / 0.35, 85));
      h += -O.amp * Math.pow(0.5 + 0.5 * Math.cos(TAU * (dmm / O.period + wv)), 2) * brk * w * bl;
    }
  }
  // the eye's collar: two folds following the cup's rim under the globe
  const C = HEAD_SKIN.collar, e = ctx.eyeC;
  const px = (p[0] - e[0]) / HL, py = (p[1] - e[1]) / HL, pz = (Math.abs(p[2]) - e[2]) / HL;
  const rh = Math.hypot(px, pz);
  if (rh < 0.2 && py < 0.02 && py > -0.2) {
    const cupC = ctx.cup, lo = (cupC.low * Math.PI) / 180, D = Math.atan2(-px, pz) - lo, cD = Math.cos(D);
    const rim = cupC.A - cupC.B * cD - cupC.C * Math.cos(2 * D);
    const below = rim - py, bl = band(C.width * 2, fp, 4, 6);
    // lateral and front-lateral only (the folds die out medially and behind)
    const lat = sstep(-0.2, 0.5, cD) * sstep(0.08, 0.13, rh) * (1 - sstep(0.16, 0.2, rh));
    if (lat > 0 && bl > 0) for (const f of C.folds) h += -C.amp * Math.exp(-((((below - f) * HL) / C.width) ** 2)) * lat * bl * (R.head + R.nape);
  }
  return h;
}

// ------------------------------------------------------------------------------------------------- occlusion

/**
 * The sculpt's occlusion at p (mm) with the outward normal n: 7 taps along n (0.08–1.6 mm), the field's shortfall from
 * the tap's distance weighed down with distance, with the eye globes (separate meshes, not in the field) added as
 * spheres. 1 open … 0 shut.
 */
export function aoField(fish, p, n, o = {}) {
  const taps = o.taps ?? [0.08, 0.18, 0.32, 0.5, 0.75, 1.1, 1.6], k = o.k ?? 1.35;
  const e = EYE_MM.center, R = EYE_MM.radius;
  let occ = 0, wsum = 0;
  for (let i = 0; i < taps.length; i++) {
    const d = taps[i], x = p[0] + n[0] * d, y = p[1] + n[1] * d, z = p[2] + n[2] * d;
    let f = fish(x, y, z);
    const g = Math.hypot(x - e[0], y - e[1], Math.abs(z) - e[2]) - R;
    if (g < f) f = g;
    const w = 1 / (1 + 1.6 * i);
    occ += w * clamp((d - f) / d, 0, 1);
    wsum += w;
  }
  return clamp(1 - (k * occ) / wsum);
}

// ------------------------------------------------------------------------------------------------- per texel

/**
 * One texel's surface.
 * @param p     fish mm (the tier mesh's interpolated position)
 * @param n     the tier mesh's interpolated normal (fish frame, unit or near)
 * @param part  'head' | 'body' | 'lobe' | 'lip' (the skin: all the same here, the regions come from the position) |
 *              'interior' (the slit's walls, the gill pockets, the socket's lining: the skin's rule too, so the charts
 *              agree where they meet; the occlusion and the cavity make them wet and dark) | 'eyeSkin' | 'iris' | 'teeth'
 * @param ctx   surfaceContext()
 * @param fp    the band limits' footprint in mm: leave it out (ctx.fpRef, from the map's size) or pass ONE value for the
 *              whole map (not the texel's own: the charts would disagree at their seams, the triangles show as a mosaic)
 * @returns { dn: [x, y, z] (n + dn is unit: the detailed normal), rough (the WET state's roughness), ao, cavity, wet (the
 *   retention, WET), h (the relief, mm), field (the field-normal term's weight) }
 */
export function skinDetail(p, n, part, ctx, fp) {
  let nl = len3(n) || 1;
  const n0 = [n[0] / nl, n[1] / nl, n[2] / nl];
  // (one footprint for the whole map, not the texel's own: a per-triangle footprint steps at every triangle's edge and
  // the band limits with it, a mosaic in the relief, and it differs between two charts at their seam)
  if (fp === undefined) fp = ctx.fpRef;
  if (part === 'teeth') return { dn: [0, 0, 0], rough: 0.3, ao: 1, cavity: 0, wet: 1, h: 0, field: 0 };
  if (part === 'iris') return { dn: [0, 0, 0], rough: WET.eye.window, ao: 1, cavity: 0, wet: 1, h: 0, field: 0 };
  const fish = ctx.fish;
  // ---- the field's own normal (the sculpt's detail the tier mesh lost), at the texel moved onto the field's surface
  let nF = n0, q = p, wF = 0, lapF = 0;
  if (part !== 'eyeSkin') {
    const f0 = fish(p[0], p[1], p[2]);
    q = [p[0] - n0[0] * f0, p[1] - n0[1] * f0, p[2] - n0[2] * f0];
    const d = Math.max(0.03, 0.75 * fp);
    const fq = fish(q[0], q[1], q[2]);
    const fx1 = fish(q[0] + d, q[1], q[2]), fx0 = fish(q[0] - d, q[1], q[2]);
    const fy1 = fish(q[0], q[1] + d, q[2]), fy0 = fish(q[0], q[1] - d, q[2]);
    const fz1 = fish(q[0], q[1], q[2] + d), fz0 = fish(q[0], q[1], q[2] - d);
    const g = norm3([fx1 - fx0, fy1 - fy0, fz1 - fz0]);
    lapF = (fx1 + fx0 + fy1 + fy0 + fz1 + fz0 - 6 * fq) / (d * d);
    const cosA = dot3(g, n0), tol = ctx.tier === 'lod2' ? 0.8 : ctx.tier === 'lod1' ? 0.3 : 0.12;
    // (trusted where the mesh lies on the field's surface and the two normals agree within ~55°)
    // (and where the crease is tighter than the texel can draw — its radius under ~2 texels, from the field's
    // Laplacian — the mesh's own smooth normal: a sub-texel crease's normal is the mips' and the seams' noise)
    const rC = 1.5 / Math.max(1e-6, Math.abs(lapF));
    wF = ctx.field ? (1 - sstep(tol, 2.5 * tol, Math.abs(f0))) * sstep(0.45, 0.7, cosA) * sstep(1.5 * fp, 3 * fp, rC) : 0;
    if (wF > 0) nF = norm3([n0[0] + (g[0] - n0[0]) * wF, n0[1] + (g[1] - n0[1]) * wF, n0[2] + (g[2] - n0[2]) * wF]);
  }
  // ---- the regions and the relief
  const R = part === 'eyeSkin' ? { trunk: 0, nape: 0, head: 1, lip: 0, lobe: 0, v: 0.2, a: 0.8, girth: 1, sh: p[0] / HL, yh: p[1] / HL, zh: Math.abs(p[2]) / HL, dOp: -1, eye: true } : regions(q, ctx, nF);
  const interior = ctx.relief === false;
  const out = { h: 0, g: [0, 0, 0] };
  let cavD = 0;
  const G = HEAD_SKIN.granule;
  const wGran = interior ? 0 : part === 'eyeSkin' ? 0.8 : R.head + 0.35 * R.nape + 0.25 * R.lobe;
  if (wGran > 0.001) {
    const o2 = { h: 0, g: [0, 0, 0] };
    granules(q, G.cell, G.r, G.amp, 1717, fp, o2);
    out.h += o2.h * wGran; for (let k = 0; k < 3; k++) out.g[k] += o2.g[k] * wGran;
  }
  if (R.lip > 0.001 && !interior) {
    const L = HEAD_SKIN.lip.stipple, o2 = { h: 0, g: [0, 0, 0] };
    granules(q, L.cell, [L.r * 0.8, L.r * 1.2], L.amp, 2323, fp, o2);
    out.h += o2.h * R.lip; for (let k = 0; k < 3; k++) out.g[k] += o2.g[k] * R.lip;
  }
  if (!interior && part !== 'eyeSkin') {
    cavD = Math.max(cavD, pores(q, HEAD_SKIN.pore, fp, out, R.head * sstep(0.0, 0.1, R.yh)));
    if (R.head + R.nape > 0.01) cavD = Math.max(cavD, pitOrgans(q, ctx, fp, out, R.head + R.nape));
    if (R.sh < 0.4 && R.yh > 0.35) cavD = Math.max(cavD, nostrilSlit(q, ctx, fp, out));
  }
  // the lattice layers by central differences in the tangent plane of nF (step: half a texel, ≥ 6 µm)
  const [t1, t2] = tangents(nF), e = Math.max(0.5 * fp, 0.006);
  const aux = { pocket: 0, id: 0, wS: 0 };
  const hc = interior || R.eye ? 0 : latticeHeight(q, R, ctx, fp, aux);
  let g1 = 0, g2 = 0, lapH = 0;
  if (!interior && !R.eye && (R.trunk + R.nape + R.lip + R.lobe > 0.001 || (R.dOp > -0.12 && R.dOp < 0.02) || (R.sh > 0.15 && R.sh < 0.55 && R.yh > 0.35))) {
    const at = (a, b) => latticeHeight([q[0] + t1[0] * a + t2[0] * b, q[1] + t1[1] * a + t2[1] * b, q[2] + t1[2] * a + t2[2] * b], R, ctx, fp, null);
    const h1 = at(e, 0), h0 = at(-e, 0), h3 = at(0, e), h2 = at(0, -e);
    g1 = (h1 - h0) / (2 * e); g2 = (h3 - h2) / (2 * e);
    lapH = (h1 + h0 + h3 + h2 - 4 * hc) / (e * e);
  }
  // the analytic layers' slope in the tangent plane
  g1 += dot3(out.g, t1); g2 += dot3(out.g, t2);
  const nH = norm3([nF[0] - g1 * t1[0] - g2 * t2[0], nF[1] - g1 * t1[1] - g2 * t2[1], nF[2] - g1 * t1[2] - g2 * t2[2]]);
  const dn = [nH[0] - n0[0], nH[1] - n0[1], nH[2] - n0[2]];
  // ---- occlusion and cavity
  // (the globe's skin cap turns and rises with the eye: its occlusion from the cup only half)
  const ao0 = part === 'eyeSkin' ? 0.55 + 0.45 * aoField(fish, p, n0) : aoField(fish, q, nF);
  // the field's concavity (1/mm: a crease of radius r reads −1/r) and the relief's (the scales' pockets, the pits)
  const cavField = clamp(-lapF * 0.08);
  const cavRelief = clamp(Math.max(cavD, aux.pocket * 0.35, -lapH * 1.2));
  const cavity = clamp(Math.max(cavField, cavRelief));
  // the fins' bases (their membranes are not in the field): a narrow contact shade along the keels' lines
  const finAO = finBaseShade(q, R, ctx);
  // (the relief's own cavities stay out of the occlusion: the normal map shades them; `cavity` carries them)
  const ao = clamp(ao0 * (1 - 0.1 * cavD) * finAO);
  // ---- roughness (the wet state) and the wet retention
  const dors = 1 - sstep(0.18, 0.4, R.v), belly = sstep(0.62, 0.85, R.v);
  const eyeD = Math.hypot(p[0] - ctx.eyeC[0], p[1] - ctx.eyeC[1], Math.abs(p[2]) - ctx.eyeC[2]) - ctx.eyeR;
  const collar = part === 'eyeSkin' ? 0 : 1 - sstep(0.25, 0.8, eyeD);
  const gill = R.dOp > -0.08 && R.dOp < 0.15 ? (1 - sstep(0.04, 0.15, Math.abs(R.dOp))) * sstep(0.12, 0.2, R.yh) * (1 - sstep(0.38, 0.48, R.yh)) : 0;
  const slow = 0.02 * vnoise(q[0] / 0.9, q[1] / 0.9, q[2] / 0.9, 515);
  // (each scale's exposed field a little smoother or rougher than its neighbours: the highlight breaks up by scale)
  const perScale = aux.wS > 0 ? 0.03 * (aux.ro ?? 0) * aux.wS : 0;
  let rough = WET.wet.roughness + 0.04 * dors * (1 - R.lip) - 0.025 * belly - 0.06 * R.lip - 0.05 * cavity - 0.02 * collar + slow + perScale;
  let wet = mix(mix(0.22, 0.55, sstep(0.2, 0.5, R.v)), 0.88, belly);
  wet = Math.max(wet, 0.92 * R.lip, 0.9 * collar, 0.85 * gill, 0.7 * R.lobe);
  // (the cavities and what the sculpt shuts in — the mouth's slit, the gill pocket, the socket under the globe — keep
  // their water: the buccal water, the gill slit's leak)
  wet = clamp(Math.max(wet + 0.35 * cavity, sstep(0.25, 0.7, 1 - ao0)));
  if (part === 'eyeSkin') { rough = WET.eye.skin; wet = 1; }
  return { dn, rough: clamp(rough, 0.05, 0.95), ao, cavity, wet, h: hc + out.h, field: wF };
}

/** A narrow contact shade (0.75 at the line) along the fins' bases: the median fins on their keels, the caudal's base. */
function finBaseShade(q, R, ctx) {
  const sh = q[0] / HL, w = 0.018;
  let shade = 1;
  const K = ctx.keels, mid = (spec, top) => {
    if (sh < spec.s[0] - 0.02 || sh > spec.s[1] + 0.02) return;
    const P = ctx.prof.at(sh), y = top ? P.yT - spec.inset : P.yB + spec.inset;
    const d = Math.hypot((q[1] / HL - y) * 0.7, q[2] / HL);
    const along = sstep(spec.s[0] - 0.02, spec.s[0] + 0.03, sh) * (1 - sstep(spec.s[1] - 0.03, spec.s[1] + 0.02, sh));
    shade *= 1 - 0.22 * along * (1 - sstep(w * 0.4, w * 2.2, d - spec.radius));
  };
  mid(K.d1, true); mid(K.d2, true); mid(K.anal, false);
  return shade;
}

/** The scale lattice's coordinates at p (mm): U along the rows (scales), V round the body (rows from the septum). */
export function scaleLattice(p, ctx) {
  const S = SCALES, law = ctx.law, s = p[0], pt = law.pitch(s), hr = S.rowRatio * pt;
  const A = arcAt(p, ctx), Vs = (A.a - S.septum) * A.girth / hr;
  const absV = Math.sqrt(Vs * Vs + 1) - 1, chev = Vs > 0 ? S.slant.up * absV : S.slant.down * absV;
  return { U: law.sigma(s) - chev, V: Vs, pitch: pt, rowMM: hr, sigma: law.sigma(s) };
}

/** The visible scale at p (mm) as the relief draws it: its id (0 off the scaled skin) and the relief (the gates). */
export function scaleAt(p, ctx, fp = ctx.fpRef) {
  const R = regions(p, ctx);
  if (R.trunk + R.nape < 0.5) return { id: 0, h: 0 };
  const r = scaleHeight(p, R, ctx, fp);
  return { id: r.id, h: r.h };
}

/** Diagnostics for the record: the scale counts the pitch law gives. */
export function scaleCounts() {
  const law = pitchLaw();
  return { lateral: law.lateral, predorsal: law.predorsal, pitchMM: SCALES.pitch, rowRatio: SCALES.rowRatio };
}

/** The relief height alone at p (mm), for the tests (the field term and the occlusion left out). */
export function detailHeight(p, n, part, ctx, fp) {
  return skinDetail(p, n, part, { ...ctx, field: false }, fp).h;
}
