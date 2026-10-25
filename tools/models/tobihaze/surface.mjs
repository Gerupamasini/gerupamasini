// The トビハゼ's skin surface for the textures rounds (T1, T2): the normal-map detail, the occlusion, the cavities and the
// roughness / wetness, as functions of the fish-frame position (anatomy.mjs: s back from the snout tip, y up from the
// head's floor, z to the fish's left; mm), so every chart and every tier bakes the same skin from the same functions
// (bake.mjs: a texel's value is a function of the place on the fish under it — seamless across the charts' edges).
//   surfaceContext(fish, o)   the precomputed tables for one tier's field: the body's section arcs (the scale rows run
//                             round the body by arc length), the pit organs placed on the skin, the lips', the lobes' and
//                             the gill cover's frames
//   skinDetail(p, n, part, ctx, fp)  per texel: the normal perturbation dn (the field's own normal where the tier mesh
//                             lost the sculpt's detail, plus the skin's relief and the water film's), the wet-state
//                             roughness, the occlusion, the cavity, the wet retention (`wet`: how long the place holds its
//                             water film), and (round T2) `albedo`: the colour's share of the occlusion (ALBEDO_AO)
//   aoField(fish, p, n)       the sculpt's occlusion from the field (7 taps along the normal; round T2: without the eye
//                             globes, which move)
//   papillaAt(p, n)           (round T2) the papilla under a point: the relief's granules for the pattern's pale granules
//   WET, wetShade(), specularOcclusion()  the runtime's wetness model (behaviour.md §2.5): wet / damp / dry / mud
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
//   head        granular papillae (PAPILLAE, round T2: one cap per cell along the skin's normal, ~25 a mm², most low under
//               the film, a share of steeper tubercles that catch the sun as B010's sparse glints), sparse pores; the
//               pit organs' papillae in Lee 1995 Fig. 4A's rows (111 papillae, digitised: the cheek's vertical rows, the
//               mandibular rows, the postorbital row onto the nape; "no open head pores"); the posterior nostril's slit
//   lips        the upper-lip pad and the median lip: a fine stipple and fine wrinkles across the pad (SOFT §1.1: "finely
//               stippled, glossy"; FST: "finely wrinkled")
//   lobe        the pectoral lobe: fine longitudinal striations over the radials, converging toward the junction
//   margins     fine wrinkles along the gill cover's margin (the eye's collar no relief folds since round fin_eye)
//   film        (round T2, FILM) the water film's own slow undulation: u1's sheet of sky breaks into lobes at its edges
// Every layer is band-limited for the map it is baked into (ctx.fpRef: ONE footprint for the whole map, the coarsest skin
// chart's, 0.032 mm a texel at 2048 — a per-texel footprint steps at every triangle and differs between two charts at a
// seam): a layer fades out where its features span under ~3–6 texels and no edge is sharper than 5 texels (the scales'
// free margins; the imbrication is painted posterior-first with soft coverage, so it has no step anywhere, the triple
// points included), and the field's own normal gives way to the mesh's where a crease is tighter than ~2 texels. What the
// band leaves out (the pits' cores, the pores, the nostril's lips) goes to the colour through `albedo` (round T2).
// Round T2 (key surface; the T1 reviews' surface findings and the eye finding's P1; scratchpad ref/work/t2_surface): the
// film's relief for glints (the normal map is the clearcoat's too: build.mjs clearcoatNormalTexture), the papillae as one
// field with the pigment (papillaAt), the fine cavities at the hero's texel and in the colour, the occlusion without the
// globes (no black slit at the collar, no holes in the blink) and in the colour (ALBEDO_AO) and the film
// (specularOcclusion), the drier dorsum (retention, roughness), WET's film whole and smooth (clearcoat 1 at 0.07),
// wetShade relative to the map's master wetness.
// Round T3 (key surface; the T2 surface finding, all of it; scratchpad ref/work/t3_surface; RUNTIME_CONTRACT.md §7): the
// film and the skin read ONE normal map (build.mjs clearcoatNormalTexture = the normal map at FILM_NORMAL_SCALE 0.35:
// tan θ_film = 0.35·tan θ_map), so the skin's own relief is low — the papillae 6–12°, the tubercles 11–15° (T2's 24–36°
// domed the diffuse and beaded the film: 'caviar'); the water's beads (PAPILLAE.bead: a steep meniscus on a share of the
// tubercles) built, measured and left off (no glint gained at 0.35 with a single-sample shader, the diffuse domed); the
// film's slow undulation ×2 (FILM); the crown's film smoother and kept longest (SHEET: u1's sheet of sky); the creases darker in the
// colour under the sun too (ALBEDO_AO: the crease term steeper, the field's tight creases, the head's relief creases); the
// eye's seat grey not black (EYE_SEAT: the cup's wall in the blink, the turret's foot); the collar's folds in the band and
// the meniscus at the turret's foot (HEAD_SKIN.collar); the eye cap's papillae ramped to the rim (CAP) and its film the
// turret's (WET.eye.skin); the scale pockets off the pale belly, the scales' relief up (SCALES.amp); the dorsum drying first
// (RETAIN, WET.wet.albedo / saturation); the seams' fade at the charts' edges (SEAM_FADE, with the bake's o.edge: a request);
// one granule field for the relief and the colour — the granules' own shade in the colour (ALBEDO_AO.gran: the furrows
// darker, the crowns paler, about the mean) and granuleAt for the pattern's pale granules and dark speckle (a request).
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
//   - the ORM (textures.mjs masterChannels; round T3 the glTF channels, the tech key's): R the occlusion (`ao`), G from
//     the WET state's roughness (`rough`), B 0, A the wet retention (`wet`); the colour × `albedo` where the pass has the
//     surface (round T2: in place of textures.mjs CAVITY_ALBEDO); lod2's lit colour: skinDetail with surfaceContext(fish,
//     { relief: false }) gives the sculpt's normal (n + dn) and the occlusion
//   - (round T3, a request) the texel's distance from its chart's edge as skinDetail's o.edge (textures.mjs runPass: a
//     chamfer from the uncovered texels; tested as ref/work/t3_surface/py/mklib.py), for SEAM_FADE
import { HL, TL, SL, HEAD, EYE_MM } from './anatomy.mjs';
import { HEAD_SCULPT, headSDF } from './head.mjs';
import { gapeSide } from './headrig.mjs';
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
  amp: 0.045,           // relief of a scale's exposed field (mm): embedded under the skin and a water film, so the
                        // free margins read in grazing light and in the sun's highlight (round T2: 0.016 → 0.024, slopes to
                        // ~9°: the film's highlight breaks into the scales' facets, A007) and the pigment (the pockets) does the rest
  edge: 0.035,          // the free margin's rounding (mm; at least 1.6 texels)
  rimTexels: 5,         // the free margin at least this many texels wide (level 0 at 2048: the Kaiser mip 1 keeps 6 % of
                        // its detail energy near its Nyquist with 5, 14 % with 3; the gates)
  jitter: 0.16,         // centre jitter (share of the pitch / row): "scale series irregular" (Lee 1995)
  warp: [0.3, 2.6],     // the lattice's slow wander (cells, over mm): the rows are not ruled lines
};
/**
 * The skin's papillae (round T2): ONE field for the relief and the pigment — the pattern key's pale granules are meant to
 * be these papillae (papillaAt), so the glints, the raised granules and the pale flecks coincide (B010: the glints sit on
 * the granular skin). 3-D jittered cells (no repeat, no seam), one papilla a cell standing along the skin's normal
 * (papillae(): ~25 a mm², 0.2 mm apart: u1 / B010's granules 0.09–0.14 mm across, 0.2–0.28 mm apart), each a smooth cap
 * (1 − d²/r²)²; most are low (slopes 6–12°: the granular skin under its film), a share `tall` are tubercles (T2: slopes
 * 24–36°, standing through the film for B010's sparse glints; round T3: 11–15° — the one map is the skin's relief too, and
 * at 24–36° every tubercle domed the diffuse into a glass bead, the T2 finding's 'caviar'). Measured on the photos at matched
 * scale (t2_surface photo_glints.sh,
 * strict glints: > 20 L* over their 9×9 neighbourhood and > 30 over the region's median): B010's cheek 0.16 glints a mm²,
 * 0.07 mm across (median; p90 0.17), its nape 0.11 a mm²; u1 (overcast) 0.04 a mm², its film a broad sheen instead.
 */
export const PAPILLAE = {
  cell: 0.2,
  // radius (mm) and the cap's steepest slope (degrees; the height follows: amp = r·tan(slope)/1.54 for the (1 − d²/r²)²
  // cap): the low ones a texture the film smooths over, the tubercles the glints
  r: [0.05, 0.085], slope: [6, 12],
  tall: { share: 0.15, r: [0.08, 0.12], slope: [11, 15] },
  // (round T3) the water's beads: a share of the tubercles (`share`, of the tall ones) holds a bead of water, a steep
  // convex meniscus (`slope` its steepest, degrees, in the map: the film reads the map at build.mjs FILM_NORMAL_SCALE of
  // its slopes, tan θ_film = k·tan θ_map; `rough` the skin's G under a bead, its film × WET.wet.clearcoatRoughness/
  // WET.wet.roughness) — on the head and the nape only (skinDetail's wBead: not on the lobe's axilla, nor on the eye's
  // cap). OFF (share 0): measured at share 0.2 / 55–65° (and 0.12 / 72–80°), the beads added no glint at B010's or u1's
  // camera (B010 0.016 a mm² with and without; u1's rig 0.045 both: a bead's sun glint is a patch ~2° wide on a 0.1 mm
  // cap, under a pixel, which a single-sample shader without specular antialiasing misses), but they doubled the zooms'
  // highlight components (z_cheek 74 → 184, over the T2 gate's 3× the coat-on-vertex-normals 42) and domed the skin's
  // own diffuse (the base layer reads the same map at full slope: z_cheek relief ×1.09 → ×1.17). The sparse glints want
  // the renderer's help (the clearcoat's specular antialiasing or the sun's lobe: RUNTIME_CONTRACT §7.6)
  bead: { share: 0, r: [0.08, 0.11], slope: [55, 65], rough: 0.65 },
  seed: 1717,
};
/**
 * The water film's own relief (round T2): a thin film is not a level sheet — it thickens in the hollows and over the
 * papillae's feet and thins on the crests — so the sky it mirrors (u1: the bluish sheet over the head's top and the
 * nape) breaks up at its edges into lobes and islands rather than the clean band a smooth shell draws. Two octaves of
 * gradient noise (fish mm: wavelength, rms slope in degrees), on the skin everywhere but the slit's and the pockets'
 * walls; the slope is small enough to leave the diffuse shading as it was (≤ 2.5° rms).
 */
export const FILM = { octaves: [[1.3, 4.0], [0.5, 2.2]], seed: 911 };
/** The head's relief (mm). */
export const HEAD_SKIN = {
  // (the hero's 2048 map draws 0.024–0.032 mm a texel: a relief feature under ~0.1 mm cannot be in it without aliasing;
  // round T2: what is smaller than the band — the pits' cores, the pores, the nostril's lips, the lips' stipple — is in
  // the colour instead, through `albedo`: the unbanded cavity)
  granule: PAPILLAE,                                          // (round T1's name for the papillae)
  pore: { cell: 0.42, r: 0.07, depth: 0.005, share: 0.45 },  // sparse pores (cheek, snout): 0.14 mm, ≥ 4 texels at 2048
  pit: { r: 0.085, amp: 0.009, core: 0.06, coreDepth: 0.008 }, // the pit organs' papillae (Lee 1995 Fig. 4A), the neuromast's pit 0.12 mm
  nostril: { len: 0.32, wid: 0.13, depth: 0.025 },              // the posterior nostril's slit
  // (round mouthA, mouth: the mouth line's crease — where the upper lip's pad and median lip hang over the lower jaw —
  // a water-filled crease like the eye's meniscus, dark but not black (u1's line L* 14–27 under the pad, its band 25–33):
  // within `dp` [full, none] (HL) of the lips' tubes, under the pad's axis (`y` [full, none]) and in front of the rictus
  // (`s` [full, none]), the occlusion floored at `floor` and the colour's crease darkening (ALBEDO_AO crease, fold) eased
  // by `ease`)
  lip: { stipple: { cell: 0.15, r: 0.07, amp: 0.003 }, wrinkle: { period: 0.2, amp: 0.0018 }, mouth: { dp: [0.012, 0.03], y: [0.105, 0.125], s: [0.32, 0.36], floor: 0.5, ease: 0.6 } },
  lobe: { lines: 30, amp: 0.0042, ridges: 4, ridgeAmp: 0.009 },
  opercle: { period: 0.22, amp: 0.0018, band: 0.06 },           // gill cover margin wrinkles (band in HL)
  // eye collar folds: HL under the cup's rim, mm wide (round T2: four concentric folds, the eye finding's P9 — u1's
  // olive collar has three or four under the globe)
  // (round T3: rh the folds' radial window round the globe's axis, HL — [in from, in to, out from, out to]; the turret's
  // wall under the globe stands at ~0.1 HL, T2's window began at 0.08 and its 0.085 mm folds fell under the band (the
  // collar a smooth sleeve, the eye finding's P3); menisc: the water's fillet in the crease at the turret's foot, u1's
  // bright line under the folds — the sculpt's deep crease there (its occlusion under `ao`) within `eye` × R of the
  // globe's surface, `below` × R under its centre: the film smoother by `rough` and the water kept)
  // (round fin_eye: folds [] — was [0.022, 0.046, 0.07, 0.094]. The sculpt's collar is now one convex sleeve from the
  // cup's rim down to the crease at its foot (head.mjs HEAD_SCULPT.cup.collar), as u1's one cup rim and meniscus, B012,
  // B013; the four relief folds stacked rings under the globe in the normal map (no-albedo fold count under the globe at
  // u1 / B010 / B012: 3 / 2 / 4 with them, 1 / 1 / 2 without — B012's second the meniscus crease at the foot). The
  // meniscus stays)
  collar: { folds: [], width: 0.12, amp: 0.05, rh: [0.06, 0.09, 0.17, 0.21], menisc: { ao: [0.15, 0.5], eye: [0.35, 0.5, 0.95, 1.15], below: [0.9, 1.15], rough: 0.15, fill: 0.85 } },
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
  // (round T2: the film whole — clearcoat 1, u1's film is continuous, and the eye's cap at 1 meets it without a step —
  // and smooth: water is a mirror; 0.07 on a wet flank, the glints the sun's size (B010), the sky's edges crisp (u1). The
  // build's film roughness is the film map's G × clearcoatRoughness / roughness: 0.2, so the drying dorsum's rougher G
  // gives it a rougher, broken film (~0.10). skinSpecular: the skin's own specular under the film — water on skin is
  // nearly index-matched — the build's KHR_materials_specular, and the runtime's mix(1, skinSpecular, wl) as it dries)
  wet: { roughness: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.07, albedo: 0.75, saturation: 1.25, skinSpecular: 0.2 },
  damp: { roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.16 },
  dry: { roughness: 0.6 },
  mud: { roughness: 0.7, colour: '#8e8a82', wet: '#5f5a52', ventral: [0.15, 0.75] },
  // (the local wetness: w_l = clamp(wetness·(1 + γ) − γ·(1 − retain)); at wetness 1 every texel is wet, at 0 every texel
  // dry; round T3: the master is wet 1 (textures.mjs MASTER_WETNESS), and at a land state's ~0.65 the trunk's dorsal band
  // (RETAIN.dorsum 0.15) is at w_l ~0.41 — its film ~0.2, its skin rougher and paler —, the head (0.55) ~0.89, the crown
  // (SHEET.retain 0.8) 1, the flanks (0.65) ~1, the belly 1. Round T3: albedo 0.85 → 0.75 and saturation 1.1 → 1.25, the
  // surface finding's P3: drying 1 → 0 lifted L* only ~1 and the chroma rose as the veil left)
  gamma: 1.2,
  // the map's G about wet.roughness carries over to the dry state at this share (the lips stay smoother when dry too)
  carry: 0.5,
  // the eye (the window's G from the eye's own painting; the globe's skin cap always wet)
  eye: { clearcoat: 1, clearcoatRoughness: 0.03, window: 0.05, skin: 0.34 },
  // the maps hold the WET state's roughness and the retention (textures.mjs writes the ORM at its master wetness from
  // them) and the master's albedo (the pattern calibrated on wet fish): wetShade's albedo and saturation are relative to
  // the master (o.w0), 1 at it
  mapIsWet: true,
  // (round T3: the ORM's glTF channels — textures.mjs masterChannels; T2's film map had R the film and A the occlusion)
  channels: { occlusion: 'the ORM R (occlusionTexture: aoField with the eye\'s seat floored, the fins\' bases)', roughness: 'the ORM G (the master wetness\'s; skinDetail gives the WET state\'s)', metal: 'the ORM B, 0', retain: 'the ORM A (only the runtime\'s wetness rule reads it)', film: 'none: the clearcoat factor is the material\'s constant 1 at the master; the runtime rule moves it' },
};

/**
 * One texel's shading state for the runtime's wetness (a reference for the shader: build.mjs runtimeParams' rule and
 * reference/tobihaze-viewer patchRuntime are its ports).
 * @param rough  the WET state's roughness (skinDetail's `rough`; the runtime recovers it from the film map's G)
 * @param retain the wet retention (the film map's B)
 * @param wetness the fish's wetness uniform, 0 dry … 1 wet
 * @param mud    the mud coat 0..1; ventral: the object-space normal's downward share (−n_y) for the mud's clumps
 * @param o      { w0: the master wetness the baseColor holds (textures.mjs MASTER_WETNESS; default 1: the wet state) }
 * @returns { wl (local wetness), roughness, clearcoat, clearcoatRoughness, specular (the skin's own, under the film),
 *   albedoMul, saturation (both relative to the map: 1 at the master — round T2, the tech finding's (b): T1 darkened the
 *   wet look a second time), mud (the mud colour's blend weight) }
 */
export function wetShade(rough, retain, wetness, mud = 0, ventral = 0, o = {}) {
  const g = WET.gamma, local = (w) => clamp(w * (1 + g) - g * (1 - retain));
  const wl = local(wetness), wl0 = local(o.w0 ?? 1);
  const dry = WET.dry.roughness + (rough - WET.wet.roughness) * WET.carry;
  let roughness = mix(dry, rough, wl);
  const cw = sstep(0.35, 1, wl);
  const clearcoat = WET.wet.clearcoat * cw + WET.damp.clearcoat * (1 - cw) * sstep(0.15, 0.5, wl);
  const clearcoatRoughness = mix(WET.damp.clearcoatRoughness, WET.wet.clearcoatRoughness, cw);
  const mw = clamp(mud * (0.45 + 0.55 * sstep(WET.mud.ventral[0], WET.mud.ventral[1], ventral)));
  roughness = mix(roughness, WET.mud.roughness, mw);
  // (the map is the master's albedo: drying lightens and greys it, ×1/WET.wet.albedo at wl 0 against the wet state)
  const am = (w) => mix(1 / WET.wet.albedo, 1, w), sm = (w) => mix(1 / WET.wet.saturation, 1, w);
  return {
    wl, roughness, clearcoat: clearcoat * (1 - mw), clearcoatRoughness, specular: mix(1, WET.wet.skinSpecular, wl * (1 - mw)),
    albedoMul: am(wl * (1 - mw)) / am(wl0), saturation: sm(wl * (1 - mw)) / sm(wl0), mud: mw,
  };
}

/**
 * The film's specular occlusion from the baked occlusion (round T2): a crease mirrors its own walls, not the sky — the
 * film map's R (and the runtime's film) × this, so the water in the gill slit, the lips' groove and the collar's folds is
 * dark, not a lit sheet. 1 on open skin (ao ≥ 0.85), 0.25 at ao 0.
 */
export function specularOcclusion(ao) {
  return 0.25 + 0.75 * sstep(0.15, 0.85, ao);
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
  // (round mouthB) the lower jaw's skin hidden at rest (JAW_HIDDEN): on the lower side of the gape (headrig.mjs gapeSide,
  // the slit's own carve) within d [full, none] of the upper head — the jaw's edge tucked under the pads — on the jaw's
  // own outer skin (its tissue's distance over j [none, full]: the slit's carved floor, the mouth's floor seen when it
  // opens, keeps its shade); and, when JAW_HIDDEN has `under`, its underside (past f [none, full] of the upper head — ff
  // at the front, before sf [ff, f] — facing down by −n.y [none, full], in front of s [full, none]; mouthB's, not taken:
  // the shipped mouth is mouthA's, whose jaw.under and lowered pad leave no V on the chin), 0..1
  const JH = JAW_HIDDEN, hParts = JH ? headSDF(H).parts : null, isLower = JH ? gapeSide(H, 0.33) : null;
  const jawHidden = JH ? (x, y, z, ny = 0) => {
    if (x > JH.box[0] || y > JH.box[1]) return 0;
    const pp = hParts(x, y, z);
    if (!isLower(x, y, pp)) return 0;
    const U = JH.under, fr = U ? sstep(U.sf[0], U.sf[1], x) : 0, f0 = U ? U.ff[0] + (U.f[0] - U.ff[0]) * fr : 0, f1 = U ? U.ff[1] + (U.f[1] - U.ff[1]) * fr : 0;
    const und = U ? sstep(f0, f1, pp.f) * sstep(U.n[0], U.n[1], -ny) * (1 - sstep(U.s[0], U.s[1], x)) : 0;
    return Math.max((1 - sstep(JH.d[0], JH.d[1], pp.f)) * sstep(JH.j[0], JH.j[1], pp.j), und);
  } : null;
  return {
    fish, K, H, size, tier: o.tier ?? 'hero', field: o.field !== false, relief: o.relief !== false, arcs, axisY, law, sOp, pad, arm, armFrame: { au, an, aw, aL, shoulder: PC.shoulder, radius: PC.radius }, jawHidden,
    pits, grid, gc, nostril, eyeC, eyeR, prof, keels, cup: H.cup, cupOpen: norm3(H.cup.open ?? [0, 0, 1]),
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

/** One papilla cell's papilla (PAPILLAE): centre (cell units), radius and height (mm), tubercle or not, tone. */
function papillaOf(cx, cy, cz, P, wb = 0) {
  const hh = hash3i(cx, cy, cz, P.seed);
  const h7 = hash3i(cx, cy, cz, P.seed + 7);
  const tall = u01(h7, 0) < P.tall.share;
  // (round T3: a bead of water on a share of the tubercles, where the texel's bead weight wb allows it — its own hash
  // byte, so the beads are a fixed subset of the tubercles and the pigment's pale granules can find them: granuleAt)
  const beadQ = u01(h7, 2), bead = tall && P.bead && wb > 0 && beadQ < P.bead.share * wb;
  const t = u01(hh, 3), ta = ((hh >>> 5) & 63) / 63;
  const r = bead ? mix(P.bead.r[0], P.bead.r[1], t) : tall ? mix(P.tall.r[0], P.tall.r[1], t) : mix(P.r[0], P.r[1], t);
  const deg = bead ? mix(P.bead.slope[0], P.bead.slope[1], ta) : tall ? mix(P.tall.slope[0], P.tall.slope[1], ta) : mix(P.slope[0], P.slope[1], ta);
  const amp = (r * Math.tan((deg * Math.PI) / 180)) / 1.54;
  return { fx: cx + 0.1 + 0.8 * u01(hh, 0), fy: cy + 0.1 + 0.8 * u01(hh, 1), fz: cz + 0.1 + 0.8 * u01(hh, 2), r, amp, tall, bead, beadQ: tall ? beadQ : 1, tone: u01(hash3i(cx, cy, cz, P.seed + 13), 1), id: hh };
}

/**
 * The papillae at p (mm; PAPILLAE: the skin's granules, the relief and the pigment's one field) on the skin whose normal
 * is n: each cell's papilla is a column along the skin's normal — the distance is taken in the tangent plane, within a
 * slab one cell thick about the skin (round T2: T1's 3-D spheres cut by the skin left most caps as small slivers, ~7 a mm²
 * of visible granules; the columns give every cell its full cap, ~25 a mm², the photos' 0.2–0.28 mm spacing). Their height
 * and slope (analytic, added to `out` × w, each papilla band-limited by its own diameter for the footprint fp), and the
 * papilla the point is on: { cover (0..1: 1 on its cap, falling to 0 at its rim), q (1 − d²/r²), tall, tone (0..1, a hash
 * of the papilla), id }.
 */
function papillae(p, n, P, fp, out, w = 1, wb = 0) {
  const c = P.cell, x = p[0] / c, y = p[1] / c, z = p[2] / c;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let best = null, bq = 0;
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const pa = papillaOf(ix + i, iy + j, iz + k, P, wb);
        // (mm) the offset from the papilla's centre, its part along the normal and in the tangent plane
        const dx = (x - pa.fx) * c, dy = (y - pa.fy) * c, dz = (z - pa.fz) * c;
        const dn = dx * n[0] + dy * n[1] + dz * n[2];
        // (the slab: a centre within half a cell of the skin counts whole, fading over the next tenth of a cell)
        const ws = 1 - sstep(0.4 * c, 0.5 * c, Math.abs(dn));
        if (ws <= 0) continue;
        const tx = dx - dn * n[0], ty = dy - dn * n[1], tz = dz - dn * n[2], d2 = tx * tx + ty * ty + tz * tz, r2 = pa.r * pa.r;
        if (d2 >= r2) continue;
        const q = 1 - d2 / r2;
        if (q * ws > bq) { bq = q * ws; best = pa; }
        if (!out) continue;
        // a smooth cap (1 − d²/r²)², its slope −4 (1 − d²/r²) t / r² (mm per mm) in the tangent plane
        // (a bead stands whole where it is: its presence is the bead weight's, papillaOf)
        const bl = band(2 * pa.r, fp, 2.5, 4) * (pa.bead ? 1 : w) * ws;
        if (bl <= 0) continue;
        const a = pa.amp * bl;
        out.h += a * q * q;
        const g = (-4 * a * q) / r2;
        out.g[0] += g * tx; out.g[1] += g * ty; out.g[2] += g * tz;
      }
  return best ? { cover: sstep(0.0, 0.35, bq), q: bq, tall: best.tall, bead: best.bead, beadQ: best.beadQ, tone: best.tone, id: best.id } : { cover: 0, q: 0, tall: false, bead: false, beadQ: 1, tone: 0, id: 0 };
}

/**
 * The papilla under a fish-frame point (mm) of the skin with the normal n, for the pattern key's pale granules (round
 * T2: one field for the relief and the pigment, so a pale granule is a raised papilla and catches the glint): { cover 0..1
 * (its cap, soft-edged), q, tall (a tubercle), tone 0..1 (per papilla: pick the pale ones by tone), id }. A pure function
 * of the position and the normal (no context): import it from './surface.mjs'. The surface draws papillae on the head,
 * the nape (0.6), the lobe (0.5) and the eye's cap (0.35) by its regions; the pattern may restrict its pale ones further.
 */
export function papillaAt(p, n) {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return papillae(p, [n[0] / l, n[1] / l, n[2] / l], PAPILLAE, 0, null);
}

/**
 * The pale granules for the pattern (round T3, the surface finding's P3: one field for the relief and the pigment — T2's
 * corr(the relief's convexity, the albedo's band-pass) on the head chart 0.001, the pattern's pale stipple a lattice of its
 * own): the papilla under the point (papillaAt) as a pale granule's coverage, `pale` 0..1 — every tubercle (the raised
 * granules the sun glints on, B010), the water's bead sites among them, and the low papillae whose tone is in the top
 * GRANULE_PALE.low share — soft-edged over the cap (cover). A pure function of the position (fish mm, the bind pose; the
 * eye's cap at rest) and the skin's normal (the papillae are columns along it), no context: the pattern key's skinColour
 * calls it where it paints its pale stipple ('gran'), in place of its own spots, so the pale granules are the surface's
 * raised ones. The granules are 0.10–0.24 mm across (3–8 texels of the hero's 2048 colour): where the colour's texel is
 * coarser than ~0.06 mm (lod1's 1024 at 0.062: the edge; lod2) take GRANULE_PALE.mean (the field's mean `pale` over the
 * skin, measured) instead. { pale, cover, gap (0..1: 1 in the matrix between the granules, 0 on a granule's cap past
 * q = GRANULE_PALE.gap — where the pattern's fine dark speckle belongs, so the melanophores sit in the furrows, not on the
 * crowns: the albedo's fine band and the relief then share one field, P3's corr), tall, site (a bead site: the surface
 * draws a water bead there where the film is whole, PAPILLAE.bead), tone, id }
 */
export const GRANULE_PALE = { low: 0.15, gap: 0.3, mean: 0.118 };
export function granuleAt(p, n) {
  const pa = papillaAt(p, n);
  if (!pa.cover) return { pale: 0, cover: 0, gap: 1, tall: false, site: false, tone: 0, id: 0 };
  const lowPale = sstep(1 - GRANULE_PALE.low - 0.03, 1 - GRANULE_PALE.low + 0.03, pa.tone);
  const site = pa.tall && PAPILLAE.bead && pa.beadQ < PAPILLAE.bead.share;
  return { pale: pa.cover * (pa.tall ? 1 : lowPale), cover: pa.cover, gap: 1 - sstep(0, GRANULE_PALE.gap, pa.q), tall: pa.tall, site, tone: pa.tone, id: pa.id };
}

/** The water film's own relief (FILM): its height (mm) at p, smooth gradient noise, each octave band-limited for the
 * footprint fp (lod1's 512 map draws only the long one). */
function filmHeight(p, fp) {
  let h = 0;
  for (const [lam, deg] of FILM.octaves) {
    const bl = band(lam, fp, 5, 9);
    if (bl <= 0) continue;
    // (rms in-plane slope of 1.4·perlin3 at unit wavelength: 1.342 — measured)
    const A = ((deg * Math.PI) / 180) * lam / 1.342;
    h += bl * A * vnoise(p[0] / lam, p[1] / lam, p[2] / lam, FILM.seed + Math.round(lam * 10));
  }
  return h;
}

/** The head's pores: sparse small pits (a share of the cells hold one). Returns { cav: the relief's cavity (banded), fine:
 * the pit's coverage unbanded (round T2: for the colour, where the normal map cannot draw it) }. */
function pores(p, P, fp, out, w) {
  const x = p[0] / P.cell, y = p[1] / P.cell, z = p[2] / P.cell;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), r = P.r / P.cell;
  const bl = band(2 * P.r, fp, 2.5, 4) * w;
  let cav = 0, fine = 0;
  if (w <= 0) return { cav, fine };
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, cz = iz + k, hh = hash3i(cx, cy, cz, 4242);
        if (u01(hh, 3) > P.share) continue;
        const fx = cx + 0.15 + 0.7 * u01(hh, 0), fy = cy + 0.15 + 0.7 * u01(hh, 1), fz = cz + 0.15 + 0.7 * u01(hh, 2);
        const dx = x - fx, dy = y - fy, dz = z - fz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const q = 1 - d2 / (r * r), a = -P.depth * bl;
        fine = Math.max(fine, sstep(0.0, 0.6, q) * w);
        if (bl <= 0) continue;
        out.h += a * q * q;
        const g = (-4 * a * q) / (r * r);
        out.g[0] += (g * dx) / P.cell; out.g[1] += (g * dy) / P.cell; out.g[2] += (g * dz) / P.cell;
        cav = Math.max(cav, q * bl);
      }
  return { cav, fine };
}

/** The pit organs' papillae (Lee 1995 Fig. 4A): a low papilla with the neuromast's pit in its middle. Returns { cav, fine }
 * as pores(): fine the pit's coverage unbanded. */
function pitOrgans(p, ctx, fp, out, w) {
  const P = HEAD_SKIN.pit, q = [p[0], p[1], Math.abs(p[2])], sz = p[2] >= 0 ? 1 : -1;
  const bl = band(2 * P.r, fp, 3.5, 5.5) * w;
  let cav = 0, fine = 0;
  if (w <= 0) return { cav, fine };
  const gc = ctx.gc, cx = Math.floor(q[0] / gc), cy = Math.floor(q[1] / gc), cz = Math.floor(q[2] / gc);
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
          const rc = P.core, coreBl = band(2 * rc, fp, 2.5, 4);
          if (d2 < rc * rc) {
            const tc = 1 - d2 / (rc * rc), ac = -P.coreDepth * bl * coreBl;
            fine = Math.max(fine, sstep(0.0, 0.5, tc) * w);
            h += ac * tc * tc; g += (-4 * ac * tc) / (rc * rc);
            cav = Math.max(cav, tc * coreBl * bl);
          }
          out.h += h; out.g[0] += g * dx; out.g[1] += g * dy; out.g[2] += g * dz * sz;
        }
      }
  return { cav, fine };
}

/** The posterior nostril's slit (a shallow elliptic pit along the snout's slope, in front of the eye). */
function nostrilSlit(p, ctx, fp, out) {
  const N = HEAD_SKIN.nostril, c = ctx.nostril, q = [p[0] - c[0], p[1] - c[1], Math.abs(p[2]) - c[2]];
  const L = N.len / 2, Wd = N.wid / 2;
  if (Math.abs(q[0]) > 2 * L || Math.abs(q[1]) > 2 * L || Math.abs(q[2]) > 2 * L) return { cav: 0, fine: 0 };
  // the slit's long axis: up and back along the face (≈ 35° above the s axis), its width across
  const ax = norm3([0.82, 0.57, 0]), d1 = dot3(q, ax), rest = sub3(q, mul3(ax, d1)), d2 = len3(rest);
  const e = (d1 / L) ** 2 + (d2 / Wd) ** 2;
  if (e >= 1) return { cav: 0, fine: 0 };
  const bl = band(N.wid, fp, 2.5, 4);
  const t = 1 - e, a = -N.depth * bl;
  out.h += a * t * t;
  // (gradient of e: 2 d1 / L² ax + 2 rest / Wd²)
  const g = -2 * a * t, sz = p[2] >= 0 ? 1 : -1;
  const ge = [(2 * d1 * ax[0]) / (L * L) + (2 * rest[0]) / (Wd * Wd), (2 * d1 * ax[1]) / (L * L) + (2 * rest[1]) / (Wd * Wd), ((2 * d1 * ax[2]) / (L * L) + (2 * rest[2]) / (Wd * Wd)) * sz];
  out.g[0] += g * ge[0]; out.g[1] += g * ge[1]; out.g[2] += g * ge[2];
  return { cav: t * bl, fine: sstep(0.0, 0.4, t) };
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
  // the eye's collar: folds following the cup's rim under the globe (none since round fin_eye: HEAD_SKIN.collar.folds)
  const C = HEAD_SKIN.collar, e = ctx.eyeC;
  const px = (p[0] - e[0]) / HL, py = (p[1] - e[1]) / HL, pz = (Math.abs(p[2]) - e[2]) / HL;
  const rh = Math.hypot(px, pz);
  if (rh < 0.2 && py < 0.02 && py > -0.2) {
    const cupC = ctx.cup, lo = (cupC.low * Math.PI) / 180, D = Math.atan2(-px, pz) - lo, cD = Math.cos(D);
    const rim = cupC.A - cupC.B * cD - cupC.C * Math.cos(2 * D);
    const below = rim - py, bl = band(C.width * 2, fp, 4, 6);
    // lateral and front-lateral only (the folds die out medially and behind)
    const lat = sstep(-0.2, 0.5, cD) * sstep(C.rh[0], C.rh[1], rh) * (1 - sstep(C.rh[2], C.rh[3], rh));
    if (lat > 0 && bl > 0) for (const f of C.folds) h += -C.amp * Math.exp(-((((below - f) * HL) / C.width) ** 2)) * lat * bl * (R.head + R.nape);
  }
  return h;
}

// ------------------------------------------------------------------------------------------------- occlusion

/**
 * The sculpt's occlusion at p (mm) with the outward normal n: 7 taps along n (0.08–1.6 mm), the field's shortfall from
 * the tap's distance weighed down with distance. 1 open … 0 shut.
 * Round T2: the eye globes are NOT in it (o.globe: true adds them as spheres at rest, T1's rule). A globe moves — the
 * land state's lift, the gaze, the blink's drop into the cup — so the skin it shades at rest is uncovered in motion: baked,
 * its shadow was the black slit at the collar's base and the holes in the blink (the eye finding's P1). The cup's seat is
 * the cup's own field (the head's socket and rim are in the sculpt); the globe's contact shade is the runtime's.
 */
export function aoField(fish, p, n, o = {}) {
  const taps = o.taps ?? [0.08, 0.18, 0.32, 0.5, 0.75, 1.1, 1.6], k = o.k ?? 1.35;
  const e = EYE_MM.center, R = EYE_MM.radius;
  let occ = 0, wsum = 0;
  for (let i = 0; i < taps.length; i++) {
    const d = taps[i], x = p[0] + n[0] * d, y = p[1] + n[1] * d, z = p[2] + n[2] * d;
    let f = fish(x, y, z);
    if (o.globe) { const g = Math.hypot(x - e[0], y - e[1], Math.abs(z) - e[2]) - R; if (g < f) f = g; }
    const w = 1 / (1 + 1.6 * i);
    occ += w * clamp((d - f) / d, 0, 1);
    wsum += w;
  }
  return clamp(1 - (k * occ) / wsum);
}

/**
 * The colour's share of the occlusion (round T2; skinDetail's `albedo`, a multiplier the bake puts into the baseColor):
 * the occlusion reaches only the indirect light in the runtime, but under the sun a crease is in its walls' shade too —
 * the gill slit, the lips' groove, the collar's folds, the axilla, the fins' bases darken under direct light as in the
 * photos; and the features under the normal map's band (the pit organs' pits, the pores, the posterior nostril) are
 * drawn here instead. Open skin (ao ≥ 0.95) is left as it is: the pattern's calibration holds (the trunk's pockets are
 * centred on their measured mean: the build report's trunkCavity.meanClamped0.5, 0.194).
 *   crease   1 − ALBEDO_AO.crease · smoothstep(creaseAt, 1 − ao) (the occlusion without the relief's own cavities)
 *   fine     1 − ALBEDO_AO.fine · fine (the unbanded pits, pores, nostril: 0..1 coverage)
 *   pockets  the trunk's scale pockets about their mean, by position behind the head (T1's CAVITY_ALBEDO, textures.mjs,
 *            moved here so the colour's every cavity has one rule and the creases are not darkened twice)
 *   gran     (round T3) 1 + k · (the papilla's cover − its mean over the head, palemean 0.30) where the papillae are (the
 *            head 1, the nape 0.6, the lobe 0.5, the cap's ramp) and the colour's texel draws `size` mm (the hero's 2048),
 *            faded out over the pale underside (v `pale`)
 */
/** (round mouthB, grafted onto mouthA's mouth) The lower jaw's skin hidden at rest (surfaceContext's jawHidden): within
 * `box` [s, y] (HL), on the gape's lower side within d [full, none] HL of the upper head and on the jaw tissue's outer skin
 * (its distance j [none, full] HL) — the dropped jaw's rim when the mouth opens — its colour's crease shade lifted to
 * `ao`. (An optional `under` {f, ff, sf, n, s} would add the jaw's down-facing underside: not set.) */
export const JAW_HIDDEN = { box: [0.36, 0.13], d: [0.014, 0.022], j: [-0.006, -0.002], ao: 0.9 };
export const ALBEDO_AO = { crease: 0.6, creaseAt: [0.05, 0.6], fine: 0.32, pockets: { k: 0.35, max: 0.5, mean: 0.194, ramp: [0.95, 1.15], belly: [0.55, 0.8] }, fold: { k: 0.3, at: [0.12, 0.5] }, relief: { k: 0.25, at: [1, 6] }, gran: { k: 0.2, mean: 0.3, size: 0.14, pale: [0.55, 0.8] } };
/** The wet retention (the ORM's A: where the film lasts as the fish dries; the runtime's wetness rule) by region: the
 * trunk's dorsal band, the head (its top too), the flanks, the belly (round T2: 0.3 / 0.55 / 0.65 / 0.88). */
export const RETAIN = { dorsum: 0.15, head: 0.55, flank: 0.65, belly: 0.88 };
/** (round T3) u1's sheet of sky over the head (the owner's photo: the film over the crown, the head's upper sides behind and
 * below the eye and the nape mirrors the overcast sky whole, its lower edge broken into lobes; the cheek below shows its
 * granules): where the head and the nape face up (v under `at`, by the skin's normal) the film is smoother by `crown` (the
 * roughness taken off: the film's is 0.2 of it) and keeps its water longest (`retain`: the fish wets its head by rolling and
 * wiping); `headBack` the share of the dorsum's drier roughness the head keeps (T2 0.5). */
export const SHEET = { crown: 0.06, at: [0.2, 0.45], retain: 0.8, headBack: 0 };
/** (round T3) The eye cap's papillae (the eye finding's P4: the cap under-textured against its turret): the head's field
 * on the globe at `rim` near the cup's rim, at `window` by the window (the angle from the cup's open direction, degrees,
 * at rest: the window spans 0–53°, the cap 21–180°). */
export const CAP = { window: 0.45, rim: 0.8, at: [45, 95] };
/** (round T3) The skin round the globe (the tech's open item, RUNTIME_CONTRACT §5.2: the cup's inner wall under the globe a
 * near-black crescent in the blink, a black slit under the globe at rest): the occlusion floored at `floor` within
 * `inner` × R of the globe's surface, fading out by `outer` × R. The globe moves (the gaze, the lift, the blink's drop), so
 * the seat's occlusion is the cup's walls' alone, and grey at the deepest. */
export const EYE_SEAT = { floor: 0.8, inner: 0.6, outer: 1.0 };
/** (round T3) The relief's fade at a chart's edge (skinDetail's o.edge: texels from the edge; the bake's, a request to the
 * tech key): 0 at SEAM_FADE[0], whole from SEAM_FADE[1]. */
export const SEAM_FADE = [0.5, 3];

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
 * @param o     (round T3) { edge: the texel's distance from its chart's edge in texels (the bake's: a request to the tech
 *              key — textures.mjs runPass); within SEAM_FADE of the edge the skin's relief fades out, so both charts at a
 *              seam hold the field's own normal there }
 * @returns { dn: [x, y, z] (n + dn is unit: the detailed normal), rough (the WET state's roughness), ao, cavity, wet (the
 *   retention, WET), albedo (round T2: the colour's multiplier, ALBEDO_AO), h (the relief, mm), field (the field-normal
 *   term's weight), pocket (the scale pockets' cavity as the albedo reads it: the bake's statistics), papilla (papillae()'s
 *   papilla under the texel, or null off the papillate skin) }
 */
export function skinDetail(p, n, part, ctx, fp, o = {}) {
  let nl = len3(n) || 1;
  const n0 = [n[0] / nl, n[1] / nl, n[2] / nl];
  // (one footprint for the whole map, not the texel's own: a per-triangle footprint steps at every triangle's edge and
  // the band limits with it, a mosaic in the relief, and it differs between two charts at their seam)
  if (fp === undefined) fp = ctx.fpRef;
  if (part === 'teeth') return { dn: [0, 0, 0], rough: 0.3, ao: 1, cavity: 0, wet: 1, albedo: 1, h: 0, field: 0 };
  if (part === 'iris') return { dn: [0, 0, 0], rough: WET.eye.window, ao: 1, cavity: 0, wet: 1, albedo: 1, h: 0, field: 0 };
  const fish = ctx.fish;
  // (round T3: the seam fade's weight, o.edge — SEAM_FADE; 1 off the edges or without the bake's edge distance)
  const eW = o.edge !== undefined && SEAM_FADE ? sstep(SEAM_FADE[0], SEAM_FADE[1], o.edge) : 1;
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
    // (and at a chart's edge the mesh's own normal, which both charts at a seam share: eW)
    wF = ctx.field ? (1 - sstep(tol, 2.5 * tol, Math.abs(f0))) * sstep(0.45, 0.7, cosA) * sstep(1.5 * fp, 3 * fp, rC) * eW : 0;
    if (wF > 0) nF = norm3([n0[0] + (g[0] - n0[0]) * wF, n0[1] + (g[1] - n0[1]) * wF, n0[2] + (g[2] - n0[2]) * wF]);
  }
  // ---- the regions and the relief
  const R = part === 'eyeSkin' ? { trunk: 0, nape: 0, head: 1, lip: 0, lobe: 0, v: 0.2, a: 0.8, girth: 1, sh: p[0] / HL, yh: p[1] / HL, zh: Math.abs(p[2]) / HL, dOp: -1, eye: true } : regions(q, ctx, nF);
  const interior = ctx.relief === false;
  const out = { h: 0, g: [0, 0, 0] };
  let cavD = 0, fine = 0;
  // the papillae (PAPILLAE: the head's granular skin, thinning onto the nape and the lobe — u1's lobe is granular and
  // glinting like the body; the eye's cap smoother — the eye finding's P5: the head's field on the globe at rest at 0.35)
  // (round T3: on the cap ramped from the cup's rim to the window, CAP; the water's beads on the head and the nape —
  // where the film is whole — not on the lobe's axilla, nor on the cap, whose film is the turret's sheet)
  let wGran = interior ? 0 : R.head + 0.6 * R.nape + 0.5 * R.lobe, wBead = interior ? 0 : R.head + 0.6 * R.nape;
  if (part === 'eyeSkin' && !interior) {
    const e = [p[0] - ctx.eyeC[0], p[1] - ctx.eyeC[1], Math.abs(p[2]) - ctx.eyeC[2]], el = len3(e) || 1;
    const ang = (Math.acos(clamp(dot3(e, ctx.cupOpen) / el, -1, 1)) * 180) / Math.PI;
    wGran = mix(CAP.window, CAP.rim, sstep(CAP.at[0], CAP.at[1], ang)); wBead = 0;
  }
  let pap = null;
  if (wGran > 0.001) pap = papillae(q, nF, PAPILLAE, fp, out, wGran, wBead);
  if (R.lip > 0.001 && !interior) {
    const L = HEAD_SKIN.lip.stipple, o2 = { h: 0, g: [0, 0, 0] };
    granules(q, L.cell, [L.r * 0.8, L.r * 1.2], L.amp, 2323, fp, o2);
    out.h += o2.h * R.lip; for (let k = 0; k < 3; k++) out.g[k] += o2.g[k] * R.lip;
  }
  if (!interior && part !== 'eyeSkin') {
    const po = pores(q, HEAD_SKIN.pore, fp, out, R.head * sstep(0.0, 0.1, R.yh));
    cavD = Math.max(cavD, po.cav); fine = Math.max(fine, po.fine);
    if (R.head + R.nape > 0.01) { const pi = pitOrgans(q, ctx, fp, out, R.head + R.nape); cavD = Math.max(cavD, pi.cav); fine = Math.max(fine, pi.fine); }
    if (R.sh < 0.4 && R.yh > 0.35) { const ns = nostrilSlit(q, ctx, fp, out); cavD = Math.max(cavD, ns.cav); fine = Math.max(fine, ns.fine); }
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
  // (round T3, the surface finding's P3 (seams): near a chart's edge — o.edge, the texel's distance in texels from its
  // chart's edge, when the bake gives it — the skin's relief fades out, so the two charts at a seam both hold the
  // field's own normal there, not the near-Nyquist granules each samples on its own grid; SEAM_FADE)
  g1 *= eW; g2 *= eW;
  // the water film's own relief (FILM: smooth, by central differences over 0.05 mm; long, so no seam fade)
  if (!interior) {
    const ef = 0.05, fat = (a, b) => filmHeight([q[0] + t1[0] * a + t2[0] * b, q[1] + t1[1] * a + t2[1] * b, q[2] + t1[2] * a + t2[2] * b], fp);
    g1 += (fat(ef, 0) - fat(-ef, 0)) / (2 * ef); g2 += (fat(0, ef) - fat(0, -ef)) / (2 * ef);
  }
  const nH = norm3([nF[0] - g1 * t1[0] - g2 * t2[0], nF[1] - g1 * t1[1] - g2 * t2[1], nF[2] - g1 * t1[2] - g2 * t2[2]]);
  const dn = [nH[0] - n0[0], nH[1] - n0[1], nH[2] - n0[2]];
  // ---- occlusion and cavity
  // (the sculpt's, without the globes: aoField. The globe's skin cap turns and rises with the eye: its occlusion from the
  // cup only half. Round T2, the eye finding's P1: the skin round the globe — the dome, the socket, the collar, which the
  // lift, the gaze and the blink uncover — floored at 0.5 within 0.3 R of the globe, so a crease there is grey, never black)
  const eyeD = Math.hypot(p[0] - ctx.eyeC[0], p[1] - ctx.eyeC[1], Math.abs(p[2]) - ctx.eyeC[2]) - ctx.eyeR;
  let ao0 = part === 'eyeSkin' ? 0.55 + 0.45 * aoField(fish, p, n0) : aoField(fish, q, nF);
  const aoRaw = ao0;
  if (part !== 'eyeSkin') ao0 = Math.max(ao0, EYE_SEAT.floor * (1 - sstep(EYE_SEAT.inner * ctx.eyeR, EYE_SEAT.outer * ctx.eyeR, eyeD)));
  // the field's concavity (1/mm: a crease of radius r reads −1/r) and the relief's (the scales' pockets, the pits)
  const cavField = clamp(-lapF * 0.08);
  const cavPocket = clamp(Math.max(aux.pocket * 0.35, -lapH * 1.2));
  const cavRelief = clamp(Math.max(cavD, cavPocket));
  const cavity = clamp(Math.max(cavField, cavRelief));
  // (round T3: the meniscus at the turret's foot, HEAD_SKIN.collar.menisc)
  const MN = HEAD_SKIN.collar.menisc;
  // (the turret's foot: a deep crease — the sculpt's occlusion under MN.ao — within MN.eye × R of the globe's surface
  // ([from, full, full to, out]) and below the globe's centre by MN.below × R)
  const menisc = MN && part !== 'eyeSkin' ? (1 - sstep(MN.ao[0], MN.ao[1], aoRaw)) * sstep(MN.eye[0] * ctx.eyeR, MN.eye[1] * ctx.eyeR, eyeD) * (1 - sstep(MN.eye[2] * ctx.eyeR, MN.eye[3] * ctx.eyeR, eyeD)) * sstep(MN.below[0], MN.below[1], (ctx.eyeC[1] - p[1]) / ctx.eyeR) : 0;
  // (the water fills the crease: what shows is the fillet's open surface, not the crease's walls — its occlusion lifted)
  if (menisc > 0) ao0 = Math.max(ao0, MN.fill * menisc);
  // (round mouthA: the mouth line's crease under the upper lip, HEAD_SKIN.lip.mouth: the occlusion floored, the colour's
  // crease darkening eased below)
  const LMO = HEAD_SKIN.lip.mouth;
  const mouthW = LMO && part !== 'eyeSkin' && R.sh < LMO.s[1] && R.yh < LMO.y[1] ? (1 - sstep(LMO.dp[0], LMO.dp[1], ctx.pad(R.sh, R.yh, R.zh))) * (1 - sstep(LMO.y[0], LMO.y[1], R.yh)) * (1 - sstep(LMO.s[0], LMO.s[1], R.sh)) : 0;
  if (mouthW > 0) ao0 = Math.max(ao0, LMO.floor * mouthW);
  // the fins' bases (their membranes are not in the field): a narrow contact shade along the keels' lines
  const finAO = finBaseShade(q, R, ctx);
  // (the relief's own cavities stay out of the occlusion: the normal map shades them; `cavity` carries them)
  const ao = clamp(ao0 * (1 - 0.1 * cavD) * finAO);
  // the colour's share (ALBEDO_AO): the creases (the macro occlusion with the fins' bases), the unbanded fine cavities,
  // the trunk's scale pockets about their mean
  const A = ALBEDO_AO, PK = A.pockets;
  let aoC = part === 'eyeSkin' ? 1 : clamp(ao0 * finAO);
  // (round mouthB: the lower jaw's skin hidden at rest in the slit and under the pads' overhang is the dropped jaw's rim
  // and edges when the mouth opens: no crease shade in its colour there (JAW_HIDDEN.ao) — it drew a dark U round the
  // dropped jaw seen from below, 9977d95 and T3 alike; B054's rim is the skin's colour; the outer skin only: the
  // cavity's floor keeps its shade)
  if (ctx.jawHidden && !interior && part !== 'eyeSkin' && R.sh < JAW_HIDDEN.box[0] && R.yh < JAW_HIDDEN.box[1]) {
    const jh = ctx.jawHidden(R.sh, R.yh, R.zh, n[1]);
    if (jh > 0) aoC += (Math.max(aoC, JAW_HIDDEN.ao) - aoC) * jh;
  }
  // (round T3, the surface finding's P4: the pockets fade out over the pale belly — they printed a fine dark net there —
  // so the scales read where the pigment is: the dorsum, the flanks; PK.belly the v ramp)
  const pw = part === 'eyeSkin' ? 0 : sstep(PK.ramp[0] * HL, PK.ramp[1] * HL, q[0]) * (PK.belly ? 1 - sstep(PK.belly[0], PK.belly[1], R.v) : 1);
  // (round T3, the surface finding's P1 (creases): the field's own tight creases — the gill slit under the cover's margin,
  // the axilla, the rictus, the collar's folds — whose walls shade them under the sun too; the macro occlusion alone is
  // shallow there: A.fold the concavity's share)
  const fold = A.fold && part !== 'eyeSkin' ? A.fold.k * sstep(A.fold.at[0], A.fold.at[1], cavField) : 0;
  // (and the head's relief creases — the collar's folds, the gill cover's margin wrinkles, the lips' — darker in their
  // valleys: A.relief, the relief's own concavity off the scaled trunk)
  const rcr = A.relief && part !== 'eyeSkin' ? A.relief.k * sstep(A.relief.at[0], A.relief.at[1], -lapH) * (1 - pw) : 0;
  // (round T3, the surface finding's P3: the granules' own shade in the colour — the furrows between the papillae a
  // little darker, their crowns a little paler, about the field's mean cover so the head's calibrated colour holds: the
  // micro-occlusion the 2048 occlusion cannot carry, and the colour's fine band then shares the relief's field (B010: the
  // pale granules on a darker ground); band-limited like the papillae, off where the colour's texel cannot draw them, and
  // faded over the pale throat and belly as the pockets are (GA.pale: B067's smooth pale underside, the T2 belly net)
  const GA = A.gran, gr = GA && pap ? GA.k * Math.min(1, wGran) * band(GA.size, fp, 2.5, 4) * (pap.cover - GA.mean) * (1 - sstep(GA.pale[0], GA.pale[1], R.v)) : 0;
  const easeM = mouthW > 0 ? 1 - LMO.ease * mouthW : 1;
  const albedo = (1 - A.crease * easeM * sstep(A.creaseAt[0], A.creaseAt[1], 1 - aoC)) * (1 - fold * easeM) * (1 - rcr) * (1 - A.fine * fine) * (1 - pw * PK.k * (Math.min(cavPocket, PK.max) - PK.mean)) * (1 + gr);
  // ---- roughness (the wet state) and the wet retention
  const dors = 1 - sstep(0.18, 0.4, R.v), belly = sstep(0.62, 0.85, R.v);
  const collar = part === 'eyeSkin' ? 0 : 1 - sstep(0.25, 0.8, eyeD);
  const gill = R.dOp > -0.08 && R.dOp < 0.15 ? (1 - sstep(0.04, 0.15, Math.abs(R.dOp))) * sstep(0.12, 0.2, R.yh) * (1 - sstep(0.38, 0.48, R.yh)) : 0;
  const slow = 0.02 * vnoise(q[0] / 0.9, q[1] / 0.9, q[2] / 0.9, 515);
  // (each scale's exposed field a little smoother or rougher than its neighbours: the highlight breaks up by scale)
  const perScale = aux.wS > 0 ? 0.03 * (aux.ro ?? 0) * aux.wS : 0;
  // (round T2: the dorsum's drying skin rougher, +0.10 — its film too, through G — the surface finding's P3; the trunk's
  // back more than the head's top, which the fish keeps wet by rolling and wiping: u1's sheet of sky on the crown)
  const back = dors * (1 - SHEET.headBack * (R.head + R.lip));
  // (round T3: u1's sheet of sky — the film over the crown, the head's upper sides and the nape smoother, SHEET)
  const crown = (R.head + R.nape) * (1 - sstep(SHEET.at[0], SHEET.at[1], R.v));
  let rough = WET.wet.roughness + 0.10 * back * (1 - R.lip) - 0.025 * belly - 0.06 * R.lip - 0.05 * cavity - 0.02 * collar + slow + perScale;
  // (round T3: the meniscus at the turret's foot smoother, HEAD_SKIN.collar.menisc)
  if (MN) rough -= MN.rough * menisc;
  rough -= SHEET.crown * crown;
  // (round T3: a water bead's film a little rougher — PAPILLAE.bead.rough: the map's texel stands for the bead's many small
  // menisci, and a mirror-sharp lobe on a bead 4–6 texels wide misses the screen's pixels: the sun's glint on it would
  // flicker in and out with the view instead of sitting on the bead)
  if (pap?.bead && PAPILLAE.bead.rough) rough = mix(rough, PAPILLAE.bead.rough, sstep(0.0, 0.5, pap.q));
  // the retention (round T2): the trunk's dorsal band 0.3, the head 0.55, the flanks 0.65, the belly 0.88 — at the build's
  // master wetness 0.65 (textures.mjs) the back behind the head drier: its film ~0.45, broken by the scale pockets' water
  // (+0.35·cavity) and rougher (G +0.10: the film ~0.10); the head — the crown too, which the fish keeps wet by rolling
  // and wiping: u1's sheet of sky — the flanks and the belly filmed whole; drying (wetness 0.5) the back goes matte
  // first (film ~0.15), the head and the flanks follow
  let wet = mix(mix(mix(RETAIN.dorsum, RETAIN.head, R.head + R.lip), RETAIN.flank, sstep(0.15, 0.4, R.v)), RETAIN.belly, belly);
  wet = Math.max(wet, 0.92 * R.lip, 0.9 * collar, 0.85 * gill, 0.7 * R.lobe, SHEET.retain * crown, menisc);
  // (the cavities and what the sculpt shuts in — the mouth's slit, the gill pocket, the socket — keep their water: the
  // buccal water, the gill slit's leak)
  wet = clamp(Math.max(wet + 0.35 * cavity, sstep(0.25, 0.7, 1 - ao0)));
  if (part === 'eyeSkin') { rough = WET.eye.skin; wet = 1; }
  return { dn, rough: clamp(rough, 0.05, 0.95), ao, cavity, wet, albedo, h: hc + out.h, field: wF, pocket: cavPocket * pw, papilla: pap };
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
