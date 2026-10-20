// The トビハゼ head as a signed-distance sculpt over its skeleton (skull.mjs), in head lengths (HL) of the fish frame
// (anatomy.mjs).
//
// The outer mass is a loft whose silhouettes are the measured outlines (the half-width seen from above, the dorsal and
// ventral profiles seen from the side, and per station the height of the widest point and the superellipse exponents
// of the section above and below it), with the snout bulb, the cheek balloons and the eye turret on it. The soft
// tissues that move are built on the bones they ride on:
//   upper lip   the lateral pads ride on the premaxillae's toothed arms and end over the maxillae's tips at the
//               rictus; across the front they are joined by a thin median lip (a moustache seen from the front); the
//               snout's skin sheath (fixed to the skull) overlies them along the labial groove
//   lower jaw   the lower lip and the chin wrap the dentaries; between the lips the gape is a real slit opening into
//               the mouth cavity, closed at the rictus by the rictal fold, so the jaw can open (Murdy 1989: the fold
//               covers the posterior jaws even agape)
//   eye         the dermal cup: a U-shaped rim hugging the globe just under the iris, low under the window and rising
//               behind it to the pupil's level, over a thick collar that flares into the head at the infraorbital
//               crease under the window and behind it; in front the head runs up onto the dome, and medially the cups
//               fill the domes out into two lobes pressed together in a V notch, each laid on its globe as a swelling
//               that leaves the eye's skin tangentially (the globe's own skin cap and clear window are on the eye
//               mesh, eye.mjs)
//   gill        the gill cover's margin a soft rounded rim standing 0.01–0.02 HL proud of the trunk from the cover's top
//               (y 0.50) round to the throat; the opercular membrane fused to the body except a short slit on the
//               opercle's posterior edge, in front of the upper pectoral base: there the rim is the free edge, a blunt
//               flap over a thin pocket whose mouth faces back under it, so the slit is shut at rest (Michel 2014: it
//               opens only after the opercles abduct) yet the flap and the body wall are separate surfaces
// Sources: research/anat_soft.md (measured on the photos), anat_osteo.md (the bones), anat_mech.md (the mechanism).
import { HEAD } from './anatomy.mjs';
import { lm } from './skull.mjs';
import { ellipsoid, sphere, smin, smax, ssub, tube, smoothPath, clamp, smoothstep } from './sdf.mjs';

const nrm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

/** Every tunable of the sculpt (HL units), so a comparison round can change one number at a time. */
export const HEAD_SCULPT = {
  // stations s with, per station: half-width w (seen from above), top yT and bottom yB (seen from the side), the
  // height yW of the widest point, and the exponents of the section above (nU) and below (nL) that height. In front of
  // the rictus the face is narrow low down (the pads stand out from it) and widest under the eyes. Behind the eyes
  // (s 0.45–1.0) the section over the widest point is full (nU 2.1–2.4) and evenly so: from the front the
  // shoulders under the eyes reach 0.83 W at 0.40 H (B002: 0.85; face_front_top.md §1.1), and the upper flank runs
  // from the collars' backs to the gill margin as one smooth slope (B049–B051, B010: no bump behind the eye, no
  // valley behind the collar; at y 0.50/0.55 its peak stands ≤ 0.017 HL over its value at the margin); behind the
  // gill margin (s ≥ 1.0) the trunk is about as wide as the cheek's end at the margin, its belly rounder (nL 2.6),
  // and its sections at s 1.15–1.3 are close to body.mjs's trunk there (w 0.322/0.321, nU 1.95/1.85), so the whole
  // fish's morph from head to trunk adds no waist. (s 0.45: nU 2.05, w 0.337: at 2.10/0.336 the flank stood full
  // against the collar's back and the infraorbital crease ended there in a dark notch, macro e_q34 px < 60: 19, now 3;
  // the shoulders under the eyes 0.831 W at 0.40 H. The closed blink hood is sensitive to this station: 2.00/0.336–0.338
  // doubled its dark specks, 2.05/0.337 has fewer than 2.10/0.336)
  loft: {
    s:  [0.030, 0.038, 0.050, 0.070, 0.095, 0.125, 0.170, 0.250, 0.350, 0.450, 0.620, 0.800, 1.000, 1.150, 1.300],
    w:  [0.000, 0.060, 0.100, 0.138, 0.168, 0.200, 0.235, 0.278, 0.318, 0.337, 0.318, 0.300, 0.318, 0.322, 0.321],
    yT: [0.250, 0.300, 0.345, 0.392, 0.440, 0.482, 0.522, 0.560, 0.585, 0.603, 0.615, 0.620, 0.622, 0.625, 0.628],
    yB: [0.200, 0.170, 0.150, 0.128, 0.110, 0.095, 0.080, 0.060, 0.025, -0.005, -0.045, -0.045, -0.045, -0.035, -0.025],
    yW: [0.230, 0.235, 0.245, 0.260, 0.275, 0.290, 0.305, 0.310, 0.290, 0.250, 0.250, 0.240, 0.235, 0.240, 0.250],
    nU: [2.00, 2.05, 2.10, 2.10, 2.05, 1.95, 1.85, 1.80, 1.50, 2.05, 2.35, 2.40, 2.10, 1.95, 1.85],
    nL: [2.00, 1.90, 1.75, 1.60, 1.50, 1.50, 1.50, 1.55, 2.20, 3.40, 3.60, 3.60, 2.60, 2.50, 2.40],
  },
  // the near-vertical rounded front of the face, its most anterior point just above the pads' front ends
  snoutBulb: { c: [0.185, 0.240], r: [0.185, 0.185, 0.210] },
  cheekBalloon: { c: [0.73, 0.235], r: [0.62, 0.30, 0.35] },
  cheekRear: { c: [0.90, 0.235], r: [0.16, 0.235, 0.33], blend: 0.06 },
  // (fused: the clip's rounding below and above the gill slit, where the membrane is fused: a soft roll, not a ledge)
  cheekClip: { blend: 0.008, fused: 0.015 },
  // the block the eyes stand on, and its low front face (the "fleshy ridge anterior to the eyes", Murdy)
  turret: { c: [0.335, 0.525], r: [0.16, 0.12, 0.15] },
  // the window axis of the eye at rest (19° forward of lateral, 13° up: eye.mjs EYE_SCULPT.axis), for the charts of
  // the socket and the socket's carve round the window
  cup: {
    open: [-0.3192, 0.225, 0.9206],
    gap: 0.0015,
    // the rim: its height above the globe's centre against the azimuth about the vertical (Δ from the low point,
    // which lies under the window, `low` degrees forward of lateral): h = A − B cos Δ − C cos 2Δ − D sin²Δ (the last
    // forward of the low point only, fading out again over Dm toward the medial side); low under the window (−0.068),
    // behind it at the pupil's level (−0.006), medially just above the centre (+0.008), and in front lowered (−0.055
    // straight forward, was −0.039) so that there the head runs up onto the dome instead of standing round it as a lip
    // and collar (B002, u5: in front and medially the domes run into the forehead; the fold is under the window only)
    // (D 0.04 lowered the front further but drew 26% more triangles into folds in the blink blend shape)
    low: 25, A: -0.025, B: 0.039, C: 0.004, D: 0.02, Dm: [105, 140],
    // the bead tapers away from the window (a real lip only under it; front, back and medially the skin runs onto
    // the dome), sooner in front (from, to) than behind (back), and the head is filleted onto the globe front and back
    taper: { from: 45, to: 85, back: [60, 120], thickMin: 0.2, roundMax: 0.02 },
    fillet: { k: 0.03, from: 60, to: 110, inset: 0.008 },
    // the domes pressed together (u5, B002): each globe's medial face filled out into a lobe, a swelling laid on the
    // globe as a function of the medial component m of the direction from its centre (`dir`: [forward, up, medial]).
    // The head's skin crosses the eye's at m = `at` at only `angle` degrees (`angleLow` low on the dome, under `el`
    // [from, to] degrees of elevation from the globe's centre), so the two skins meet nearly tangent (n15's shifted
    // sphere met it at 13.5° in a seam across each dome; n16 at 12–24° low in front); lateral of the junction the head
    // curls under the eye's skin with a curvature radius `rho` [low, high] (HL), its depth x·tan(angle) + x²/(2 rho)
    // at the arc distance x, so it is 0.0005 HL deep 0.006 HL from the junction and ≥ 0.0012 from 0.009 on (n16's band
    // hugged the skin 0.0004 HL under it over 0.04 HL, and the hero eye's facets let it through in a dotted line; the
    // eye mesh's facets now straddle its sphere, eyeGlobe), and ends where it is `deep`
    // [low, high] under the skin (low on the dome at 0.0006, 3–4° from the junction, so the window turned 30° forward
    // and its fold never show it); the dome's top stays the globe's own round top (u5: no plateau); past the junction
    // it rises to `rise` at the medial pole (a power `risePow` of the way there), and the two lobes meet on the
    // midline in a V with one median crease (k), its floor 0.13 ED under the domes' tops at the eyes' centres (u5
    // ≈0.1–0.19, B002 ≈0.12, B070 ≈0.13), 0.28 ED wide at half depth; it is blended into the head over only `blend`
    // (0.01 lifted the curl toward the fillet's copy of the globe and steepened the crossing to 4.5°)
    // (neckLobe(NK, re, { closed: true }) gives each dome with its lobe as one star-shaped surface with no hidden band;
    // the blink (headrig.mjs blinkTargets) closes the lowered domes as its own convex surface, BLINK_CLOSE.convex)
    neck: { dir: [0, 0, 1], angle: 0.8, angleLow: 1.2, el: [8, 35], rho: [0.035, 0.04], deep: [0.0006, 0.012], at: 0.16, rise: 0.045, risePow: 2, k: 0.0015, blend: 0.004 },
    // the socket is carved round the globe only inside the cup (up to `carveTop` [from, to] above the rim) and round
    // the window's side (within `carveWin` [from, to] degrees of the window's axis, where the cornea lies under the
    // skin's level); elsewhere the head's surface runs into the globe, so the web, the fillets and the rim's ends meet
    // it in clean lines instead of paper-thin wedges of skin over it (which mesh ragged). The insets above keep the
    // head inside the globe deeper than the cornea's recess, so it never shows through the window when the eye turns
    // (carveWin to 70: the window's bound reaches 59° from its axis; to 78 the carve reached the lobe's junction in
    // front and steepened it)
    carveTop: [-0.014, 0.002], carveWin: [60, 70],
    // the bead of the rim: a shell `thick` proud of the globe, its edge rounded by `round`
    thick: 0.020, round: 0.010,
    // the collar: a fleshy ring round the lower globe, wider than the globe, sitting on the head; its underside curls
    // in to the infraorbital crease (y0: its centre, r: [behind, vertical, lateral] radii); laterally it stands no more
    // than 0.002 HL past the dome's outline (a fold under the window, not a roll flaring out under each dome in front
    // views: 0.006 in n15; slimmer, 0.103 laterally or 0.050 tall, it left back faces in its crease and the closed
    // blink hood short of the lowered window); in front and medially (rFront, rMedial) it keeps inside the dome's
    // outline, so it is a fold under the window and behind it, not a roll round the front of the dome (no turtleneck:
    // B002, u5)
    collar: { y0: 0.528, r: [0.124, 0.054, 0.106], blend: 0.030, rFront: 0.092, rMedial: 0.088 },
    // the infraorbital crease where the collar meets the head (k: its rounding; 0.012 rounded its lateral ends but
    // opened the blink: the closed hood left the lowered window showing at the lateral base), fading out behind the
    // globe (back: [from, to] behind its centre) before it would turn up the collar's back into the nape as a ragged
    // sliver, and in front of it too (front: [from, to] in front of the centre), so the collar's front-lateral foot
    // runs into the head without the dark slot its overhang made in front views (f_front: dark px under the
    // collar's lateral ends −24%; rounder (r 0.004 with the cups blended over 0.024) broke the crease into black
    // specks at the hero cell)
    crease: { r: 0.005, k: 0.008, back: [0.03, 0.08], front: [0.0, 0.04] },
  },
  // the skin between the two cups: the domes press together along the midline down to a shallow notch
  septum: { c: [0.33, 0.60], r: [0.10, 0.07, 0.045] },
  // ---- mouth
  // the gape: the closed mouth's line (y at the front, at the rictus), the slit's half-width (the gap is more than
  // two cells of the hero mesh, 0.075 mm, so the lips mesh as two clean edges and part cleanly when the jaw drops),
  // the rictus (where the upper head's cut ends), the slit's rounded end under the pad's rear end (slitEnd,
  // endRound), the rounding of the lower lip's edge (edge 0.008, round 5: at 0.011 the rounding cut the lower lip's
  // top back 0.003 under the median lip, a crescent seen from below and from low in front (z_low 1259 slot px, half of
  // them at the front); 0.008 halves the front's share, and the lips mesh with no more folds than at 0.011: none at
  // the posed grid, one sliver per side inside the slit's end at the clay grid; 0.009 leaves 64 slot px from below)
  // lean: the cut behind the rictus tilts back along the crease (no wall across the throat)
  // front: in front of s[0] the slit is narrower (half), easing to `half` by s[1], so from the front and from below the
  // closed mouth is a fine line under the median lip (0.008 HL: still 1.4 cells of the posed build's 0.09 mm, no
  // triangles bridge the lips at any grid offset); back: over s [0, 1] the slit widens toward its end under the pad's
  // rear end (half), a pocket a posed cell taller at the end (round 5: from s 0.265, nearer the end, where the pad's
  // rear end hides more of it; widened from 0.25 the pocket's floor showed from below as a dark slot behind a lit tab
  // at each corner (under 102 slot px, now 58), and widened later than 0.27, or not at all, the thin end of the lower
  // lip under it folds in the posed mesh) (headrig.mjs gapeSide must carve with the same width: gapeHalf)
  gape: { yFront: 0.100, yBack: 0.092, half: 0.005, rictus: 0.290, close: 0.050, lean: 1.3, slitEnd: 0.290, endRound: 0.010, edge: 0.008,
    front: { half: 0.004, s: [0.11, 0.15] }, back: { half: 0.0085, s: [0.265, 0.295] } },
  // the upper lip (left half, mirrored): a swept roll from the thin median lip at the front midline along the
  // premaxilla's arm to the pad's rounded rear end over the maxilla's tip; a little taller than wide in section, its
  // rear end the fattest part; it hangs over the lower jaw's side (Murdy 1989: the upper lip overlaps both jaws when
  // the mouth is closed), 0.06–0.20 HL in side view (0.6 ED tall, 1.2–1.25 ED long: B006, B008, B009, B067); it hangs
  // low, its lower edge near the jaw's own (B010, B064, u1: from the side the lower jaw is hidden under it)
  pad: {
    // the median lip: thin, from the front midline under the snout bulb to the pad's front end; it hangs over the
    // lower lip's front (Murdy 1989: the upper lip overlaps both jaws' teeth when the mouth is closed)
    // (blend: across the front it flows out of the snout without a crease, so the bulb's lower front runs on into it:
    // seen from the side the snout's outline runs on into the lip with no knob and no notch above it, B009, u1)
    // its lower edge reaches y 0.08; its front stays over the premaxilla's tip (0.046, 0.11) by 0.004 or more; toward
    // the pad's front end it stays low, so the upper lip's lower edge runs nearly level across the front (no arch at
    // the junction for the lower lip to follow up into a horn)
    median: { path: [[0.070, 0.100, 0.000], [0.071, 0.101, 0.040], [0.084, 0.104, 0.080], [0.104, 0.116, 0.118]], radius: [0.017, 0.017, 0.018, 0.022], blend: 0.045 },
    // the pad: a bean along the premaxilla's arm, its front end narrower and tucked under the bulb, its rear end the
    // fattest part, round, over the maxilla's tip at the rictus; sy: the section's vertical stretch
    // (side view 1.23 × 0.60 ED, aspect 2.0, widest at 0.57 of its length, its axis level, the front end 0.68 of the
    // height; from above it stays inside the snout's outline at every station, B050, B051)
    path: [[0.098, 0.114, 0.117], [0.140, 0.118, 0.140], [0.188, 0.122, 0.166], [0.240, 0.120, 0.189], [0.284, 0.118, 0.205]],
    radius: [0.030, 0.046, 0.058, 0.063, 0.061],
    sy: 1.06,
    samples: 64,
    // the snout's skin sheath over the pad: a roll along its top carrying the face's side down onto it (from the front
    // the face runs on into the pads without a waist, B001, u5); slim, so the face above it stays one convex slope down
    // to the groove, with no second fold over the pad (B064, B007)
    sheath: { path: [[0.120, 0.192, 0.145], [0.160, 0.200, 0.170], [0.200, 0.205, 0.186], [0.240, 0.205, 0.196], [0.288, 0.200, 0.202], [0.336, 0.192, 0.205]], radius: [0.022, 0.032, 0.036, 0.036, 0.033, 0.022], k: 0.03 },
    // the labial groove: the fine crease where the sheath meets the pad (along its top and round its rear end), from
    // z[0] outward (it fades in over z, so the median lip meets the pad's front end without a notch); a narrow cut (r)
    // with a tight rounding (k) along the pad's top, so it reads as a fine line (round 5: r 0.0045 / k 0.012 drew a
    // dark band 0.2 of the pad's height and folded the clay mesh at the pad's front-top), a little wider round the rear
    // end (rear), so the surface nets never fold its walls over there (meshed at the clay and the posed cells at four
    // grid offsets: no inside-out triangle along the groove; r 0.003 or k ≤ 0.0065 fold it); `out`: in front of the
    // rictus the groove keeps to the outside, from `out` under the gape's line up (inside the slit the same cut grooved
    // its roof where the pad's underside meets the palate: hidden at rest, but a crease in the opened mouth, and it
    // folded the lower lip's end under the slit's end in the posed mesh)
    seam: { r: 0.004, k: 0.007, z: [0.08, 0.13], out: 0.01, rear: { s: [0.216, 0.286], r: 0.005, k: 0.011 } },
    // at the foot of the rear end the groove fades into the rictal fold's web (the crease carries it on)
    web: { s: [0.276, 0.326], y: [0.052, 0.072], k: 0.03 },
  },
  // the lower jaw's tissue (left half): the mandible's flesh round the dentary rami, the floor between them, the
  // thin lower lip along the dentary's outer edge (just under the pads), and the narrow chin knob
  // (the lower jaw is set back under the upper lip: its front a round lobe 0.017 HL behind the median lip's lower front,
  // receding into the chin below, so from the side no lower lip juts out under the median lip and the outline has no
  // notch between the lips (B064, B007, u1: the upper lip overlaps the lower jaw); the chin 0.06–0.08 behind the
  // snout's front, anat_soft §1.2; the dentary's front stays 0.01 under its skin)
  // (fuse: the blend of the jaw's tissue into the cheek and throat behind the rictus; at 0.05 its swell reached the
  // labial groove round the pad's rear end and pinched its bottom into a cusp)
  // (optional, off: fold, the lower lip's fold under each pad, see headSDF)
  jaw: {
    ramus: { path: [[0.094, 0.100, 0.000], [0.103, 0.100, 0.040], [0.138, 0.098, 0.084], [0.200, 0.092, 0.126], [0.276, 0.087, 0.158], [0.340, 0.084, 0.182]], radius: [0.012, 0.013, 0.015, 0.018, 0.022, 0.028] },
    floor: { c: [0.34, 0.060], r: [0.25, 0.060, 0.15] },
    lip: { path: [[0.086, 0.093, 0.000], [0.090, 0.093, 0.040], [0.105, 0.095, 0.070], [0.140, 0.098, 0.094], [0.196, 0.097, 0.116], [0.255, 0.095, 0.136], [0.295, 0.092, 0.150]], radius: [0.011, 0.011, 0.008, 0.0055, 0.005, 0.0045, 0.004] },
    chin: { c: [0.126, 0.080], r: [0.030, 0.022, 0.034] },
    blend: 0.05, fuse: 0.04,
  },
  // the rictal fold: the web joining the pad's rear end to the lower lip at the corner, and its crease running on down
  // and back onto the cheek
  // (the web sits under the pad's rear end; the crease is the groove's continuation from the rear end's foot down to
  // the underside, B012, B013)
  // (the web fills the foot of the pad's rear end, so no second valley runs beside the crease there)
  // (the crease is a soft trough (soft: w wide, depth per path point) pressed into the skin itself (skin: snapped onto
  // the upper head fused with the jaw's tissue, which is the outer surface below the pad's rear end), laid along the
  // labial groove's own valley round the rear end: it deepens out of the groove and runs on down and back onto the
  // cheek, fading at both ends, so the groove and the crease are one hook with no ring, pit or knot where they meet
  // (u1, B009, B064); radius: the tube's, used only without soft)
  // (round 5: the web sits up in the foot of the rear end, medial of the pad's outline, so it fills the fold's corner
  // without hanging a lobe under the pad; at (0.310, 0.064, 0.198) with radii 0.028/0.020/0.022 it hung 0.014–0.018 HL
  // below the pad's own lower outline at s 0.30–0.31, a pendulous jowl from the side and a knob at each pad's end from
  // below)
  // (the crease leaves the labial groove from its floor (s 0.338 at y 0.09, 0.341 at y 0.08) and its trough is wide
  // (w 0.014) with its snapped line smoothed (smooth): starting on the groove's outer wall it cut a 0.005 HL cliff that
  // the key light caught as a bright streak down the rear end, and its zigzag line shaded as a stack of ridges)
  rictal: { c: [0.312, 0.076, 0.192], r: [0.022, 0.016, 0.018], blend: 0.030 },
  rictalCrease: { path: [[0.328, 0.124, 0.2423], [0.332, 0.112, 0.2376], [0.336, 0.100, 0.2326], [0.338, 0.090, 0.2320], [0.341, 0.080, 0.2282], [0.348, 0.070, 0.2237], [0.354, 0.060, 0.2141], [0.360, 0.052, 0.2033], [0.366, 0.046, 0.1906]],
    radius: [0.0015, 0.0020, 0.0025, 0.0028, 0.0030, 0.0030, 0.0030, 0.0028, 0.0025], skin: true, soft: { w: 0.014, depth: [0, 0.0015, 0.003, 0.004, 0.0045, 0.0045, 0.004, 0.002, 0], smooth: 8 } },
  // the mouth cavity behind the gape (left half of a symmetric volume): it reaches forward to the lips' inner faces,
  // up under the palate and back into the pharynx, between the jaws
  cavity: { front: { c: [0.122, 0.128, 0], r: [0.052, 0.020, 0.072] }, mid: { c: [0.235, 0.152, 0], r: [0.140, 0.045, 0.125] }, back: { c: [0.430, 0.172, 0], r: [0.150, 0.060, 0.135] }, blend: 0.03 },
  tongue: { c: [0.250, 0.120, 0], r: [0.085, 0.022, 0.050] },
  // the anterior nostril: a short tube on the front of the snout pointing forward and down (B012: y 0.35–0.40), its
  // base snapped onto the snout (base: the point it is snapped from, sunk `sink` into the skin, `len` long; standing
  // out of the skin at about 35° to the front so its opening faces forward and down, a spout with a dark hole from the
  // front rather than a ridge lying on the snout); the posterior nostril a small pore just in front of the eye
  nostril: { base: [0.050, 0.365, 0.074], dir: [-0.8, -0.55, 0.2], len: 0.012, sink: 0.002, r: [0.006, 0.0045], hole: 0.003 },
  nostrilPost: { c: [0.190, 0.500, 0.119], r: 0.0045 },
  // the opercle's margin: the skin edge just outside the opercular series' posterior margin (skull.mjs opPostDorsal
  // 0.99/0.46 … sopCurve), from the cover's top (y ≈ 0.50, where its dorsal edge turns forward under the nape) down and
  // round to the throat. The gill cover in front of it stands proud of the trunk behind (u1, B010, B012, A070: a soft
  // rounded rim with the body stepping in behind it): the surface is moved out by `cover.t` toward the margin (from
  // `cover.from` in front of it, full at `cover.full`) over the heights `cover.y`, the rim's edge a soft step `cover.edge`
  // wide across the margin; no bead (radius 0). Where the membrane is fused the rim is a narrow soft fold (B010: a soft
  // fold line, no broad shadow): edge 0.018 and cheekClip.fused 0.015 (0.030/0.025 shaded a band 0.03 HL wide below the
  // slit in side light, 13–17 px per row of c_side, now 8.5–11; narrower than 0.016 the fold's foot meshes as a
  // sawtooth). Its upper end fades into the nape over y 0.40–0.50 (B010, face_side_34 §3: no edge above y ≈ 0.4): the
  // rim's rise at y 0.45 from the cheek in front of it 0.0055 HL (0.012 with y[2..3] 0.43–0.52). Over the gill slit,
  // where the edge is free, the rim is the flap over the slit's pocket: `slitT` thick, its rear face steep (`slitEdge`),
  // easing into the fused rim from `slitIn` inside the slit's ends to `slitBlend − slitIn` beyond them. The step from
  // the rim to the trunk behind it is 0.018–0.020 HL from y 0.08 to 0.35 (t 0.010, slitT 0.011; research 0.01–0.02:
  // 0.024 with 0.012/0.0145). The trunk behind the margin is the loft's (s 1.0–1.3), as wide as the cheek's end at the
  // margin, so the rim is the cover's own step (no waist behind it: B047, 0.92 W at 1.3 HL)
  opercle: {
    path: [[0.996, 0.50, 0.25], [1.014, 0.44, 0.29], [1.032, 0.36, 0.325], [1.032, 0.26, 0.34], [1.007, 0.15, 0.33], [0.962, 0.06, 0.29], [0.912, 0.02, 0.24]],
    radius: [0, 0, 0, 0, 0, 0, 0],
    cover: { t: 0.010, from: 0.10, full: 0.04, y: [0.0, 0.07, 0.40, 0.50], edge: 0.018, slitT: 0.011, slitEdge: 0.006, slitBlend: 0.10, slitIn: 0.03 },
  },
  // the gill slit: the only part of the margin that opens, y 0.17–0.38 (Michel 2014 Fig. 1A; B010): a pocket `2 half`
  // (0.007 HL, 1.5 cells of the posed build) between the flap and the body wall, its floor `floor` under the mass's
  // skin, from `back` behind the margin (the floor rising out through the skin behind the mouth from `mouth`, so the
  // body wall dips softly under the flap's edge) to `reach` under the flap; rounded by `round`. `depth` is the rig's
  // split (headrig.mjs: skin deeper than −depth under the mass is the body wall's, the trunk's). Toward its ends the
  // pocket closes in all three ways at once: its roof and floor together over `taper` and `floorTaper` (0.05), and its
  // reach under the flap from `reach` down to `reachEnd` over `reachTaper`, so seen from the side its inside is a lens,
  // deepest (0.019) mid-slit; and the flap's steep free edge (cover.slitEdge) has already eased into the fused rim's
  // fold `cover.slitIn` inside the ends. (Round 5: the pocket's front wall, where its reach shortens toward the lower
  // end, faces back and up; seen through the mouth from behind or above it was the bright lump at the slit's lower end
  // (n16, half 0.005, reach 0.035 over 0.06: its excess over the 9-px median 30 levels from behind, 43 at vent). Thinner,
  // shorter and tapering over the whole slit it stays under the flap: ≤ 15 levels, no pixel above +25, at rest, gulp,
  // vent and from behind, and the slit still opens 0.02 HL at vent. Tested and worse: a half-disc end (cap 0.01–0.02,
  // 42 levels from behind), the floor's rise moved forward toward the ends to close the mouth first (38–94), the floor
  // held level to the ends (43–60, with or without the reach's taper))
  gillSlit: { y0: 0.175, y1: 0.375, half: 0.0035, depth: -0.002, floor: -0.0035, reach: 0.025, back: 0.04, mouth: -0.001, lift: 0.01, taper: 0.05, floorTaper: 0.05, reachEnd: -0.004, reachTaper: 0.14, round: 0.016 },
  // (gillChamber: an optional void behind the slit, {c, r}; off: the pocket never reached it, so it was a closed inner
  // surface no view showed, ~21 000 triangles of the pose build's 333 000)
  gillChamber: null,
  floorY: -0.010,
  cutS: 1.3,
  blend: { bulb: 0.03, cheek: 0.04, turret: 0.045, cups: 0.020, septum: 0.04, groove: 0.011, fold: 0.012, nostril: 0.006, socket: 0.006, floor: 0.04, cut: 0.02, cavity: 0.008, tongue: 0.02 },
};

/** Sample the loft's station tables into dense arrays (Catmull-Rom between stations). */
export function loftTables(L, n = 2048) {
  const keys = ['w', 'yT', 'yB', 'yW', 'nU', 'nL'];
  const sMax = L.s[L.s.length - 1];
  const out = Object.fromEntries(keys.map((k) => [k, new Float64Array(n + 1)]));
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * sMax;
    let j = 0;
    while (j < L.s.length - 2 && L.s[j + 1] < s) j++;
    const s1 = L.s[j], s2 = L.s[j + 1], t = clamp((s - s1) / (s2 - s1), 0, 1);
    for (const k of keys) {
      const a = L[k], m = a.length;
      const p0 = a[Math.max(0, j - 1)], p1 = a[j], p2 = a[j + 1], p3 = a[Math.min(m - 1, j + 2)];
      // monotone-ish Catmull-Rom (tangents scaled by the station spacing)
      const h0 = L.s[j] - L.s[Math.max(0, j - 1)] || s2 - s1, h2 = L.s[Math.min(m - 1, j + 2)] - L.s[j + 1] || s2 - s1;
      const dt = s2 - s1;
      const m1 = ((p2 - p0) / (dt + h0)) * dt, m2 = ((p3 - p1) / (dt + h2)) * dt;
      const t2 = t * t, t3 = t2 * t;
      out[k][i] = (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
    }
  }
  return { ...out, n, sMax, s0: L.s[0] };
}

/** Distance to the loft (approximate: the section's superellipse distance, the front closed by its own shrinking). */
export function loftSDF(T) {
  const { n, sMax, s0 } = T;
  return (x, y, z) => {
    const sc = clamp(x, s0 + 2e-3, sMax);
    const f = (sc / sMax) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    const L = (a) => a[i] + (a[i + 1] - a[i]) * t;
    const w = Math.max(1e-4, L(T.w)), yT = L(T.yT), yB = L(T.yB), yW = L(T.yW);
    const up = y >= yW;
    const hh = Math.max(1e-4, up ? yT - yW : yW - yB);
    const u = Math.abs(z) / w, v = Math.abs(y - yW) / hh;
    // an upper exponent under 2 slopes the shoulders but would come to a point on the crest: near the midline it
    // eases back to a round 2.2, so the back is a rounded ridge, not a keel
    let nn = up ? L(T.nU) : L(T.nL);
    if (up && nn < 2.2) nn += (2.2 - nn) * (1 - smoothstep(0, 0.45, u));
    const r = Math.pow(Math.pow(u, nn) + Math.pow(v, nn), 1 / nn);
    let d;
    if (r < 1e-9) d = -Math.min(w, hh);
    else {
      // (r − 1) / |∇r|: the superellipse's own distance near its boundary
      const k = Math.pow(r, 1 - nn);
      const gz = (k * Math.pow(u, nn - 1)) / w, gy = (k * Math.pow(v, nn - 1)) / hh;
      d = (r - 1) / Math.max(1e-6, Math.hypot(gz, gy));
    }
    // ahead of the first station: the distance to its rim (a rounded end, not a cut plane)
    if (x < s0 + 2e-3) d = Math.hypot(Math.max(d, 0), s0 + 2e-3 - x);
    return d;
  };
}

/** The dermal cup of the left eye (z > 0) as a field, and the rim's height for an azimuth (exported for the rig). */
export function cupField(K = HEAD_SCULPT, eyeDy = 0) {
  const E = HEAD.eye, re = E.d / 2, C = K.cup, lo = (C.low * Math.PI) / 180;
  const c = [E.s, E.y + eyeDy, E.z];
  // azimuth about the vertical through the globe's centre: 0 lateral (+z), +90° forward (−s)
  // (D: the rim lowered in front of the window, by D·sin²Δ forward of its low point only, so in front the head runs
  // onto the dome instead of standing as a lip round it)
  const rimH = (px, pz) => {
    const D = Math.atan2(-px, pz) - lo, cD = Math.cos(D);
    // (Dm: [from, to] degrees from the low point over which the lowering fades out again toward the medial side)
    const sf = Math.max(0, Math.sin(D)) * (C.Dm ? 1 - smoothstep(Math.cos((C.Dm[0] * Math.PI) / 180), Math.cos((C.Dm[1] * Math.PI) / 180), cD) : 1);
    return C.A - C.B * cD - C.C * Math.cos(2 * D) - (C.D ?? 0) * sf * sf;
  };
  const col = C.collar;
  // (rFront, rMedial: the collar's radii in front of and medial to the globe's centre, where it fades into the
  // forehead and the notch instead of standing out as a roll; the radii switch at the centre's planes, so the surface
  // stays smooth)
  const collarE = col.rFront === undefined && col.rMedial === undefined
    ? ellipsoid([c[0], col.y0, c[2]], [col.r[0], col.r[1], col.r[2] ?? col.r[0]])
    : (x, y, z) => {
      const px = x - c[0], py = y - col.y0, pz = z - c[2];
      const rx = px < 0 ? col.rFront ?? col.r[0] : col.r[0], ry = col.r[1], rz = pz < 0 ? col.rMedial ?? (col.r[2] ?? col.r[0]) : col.r[2] ?? col.r[0];
      const k0 = Math.hypot(px / rx, py / ry, pz / rz), k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
      return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
    };
  return {
    rimH,
    field: (x, y, z) => {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const r = Math.hypot(px, py, pz), h = rimH(px, pz);
      // the bead: a shell hugging the globe, thinning away from the window
      const T = C.taper, aD = Math.atan2(-px, pz) - lo, cD = Math.cos(aD);
      // (taper.back: [from, to] behind the window's low point, where the rim rises to the back of the dome)
      const [tf, tt] = T && T.back && Math.sin(aD) < 0 ? T.back : T ? [T.from, T.to] : [0, 0];
      const tw = T ? smoothstep(Math.cos((tf * Math.PI) / 180), Math.cos((tt * Math.PI) / 180), cD) : 0;
      const thick = C.thick * (1 - (1 - (T ? T.thickMin : 1)) * tw), round = C.round + ((T ? T.roundMax : C.round) - C.round) * tw;
      const bead = r - (re + C.gap + thick);
      // the collar ring (an oblate ellipsoid about the globe's vertical axis)
      const ring = collarE(x, y, z);
      const body = smin(bead, ring, col.blend);
      // everything above the rim is cut away, the edge rounded into a lip
      return smax(body, py - h, round);
    },
  };
}

/** The head's distance function in HL units (s, y, z); f.parts gives the parts (for the section plots and the rig). */
export function headSDF(K = HEAD_SCULPT, { cut = true, eyeDy = 0 } = {}) {
  const E = HEAD.eye, re = E.d / 2;
  const el = (p, zc = 0) => ellipsoid([p.c[0], p.c[1], zc], p.r);
  const loft = loftSDF(loftTables(K.loft));
  const bulb = el(K.snoutBulb), balloon = el(K.cheekBalloon), turret = el(K.turret);
  // the opercle's margin as s at height y (its path's own s, y), where the balloon ends in a rim
  const opP = K.opercle.path.map((p) => [p[0], p[1]]).sort((a, b) => a[1] - b[1]);
  // (a cubic Hermite through the path's points: the rim and the slit follow a smooth curve, not a polyline)
  const opT = opP.map((_, i) => {
    const a = opP[Math.max(0, i - 1)], c = opP[Math.min(opP.length - 1, i + 1)];
    return (c[0] - a[0]) / (c[1] - a[1]);
  });
  const sOp = (y) => {
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
  const rear = el(K.cheekRear);
  // the gill cover's rim over the slit (slitW: 1 over the slit's heights, fading over `slitBlend` beyond its ends, or
  // `slitIn` inside them): there the opercle's edge is free, elsewhere the membrane is fused
  const OC = K.opercle.cover;
  const GS0 = K.gillSlit, SB = OC?.slitBlend ?? 0.05, SI = OC?.slitIn ?? 0;
  const slitW = (y) => (OC?.slitEdge && GS0.edge === undefined ? smoothstep(GS0.y0 - SB + SI, GS0.y0 + SI, y) * (1 - smoothstep(GS0.y1 - SI, GS0.y1 + SB - SI, y)) : 0);
  // (cheekClip.fused: the clip's rounding where the membrane is fused, so the rim's rear face there is a soft roll)
  const CC = K.cheekClip, clipK = (y) => (CC.fused === undefined ? CC.blend : CC.fused + (CC.blend - CC.fused) * slitW(y));
  const cheek = (x, y, z) => smax(smin(balloon(x, y, z), rear(x, y, z), K.cheekRear.blend), (x - sOp(y)) * 0.9, clipK(y));
  // eyeDy: the globe moved along y (the blink's morph target is the head built round a retracted eye)
  const cup = cupField(K, eyeDy), cupL = cup.field;
  const eyeL = [E.s, E.y + eyeDy, E.z];
  const socketL = sphere(eyeL, re + K.cup.gap);
  const septum = el(K.septum);
  const b = K.blend;

  // ---- the outer mass (fixed to the skull, the cheeks and the gill covers): the loft and its swellings
  const mass = (x, y, z) => {
    const za = Math.abs(z);
    let d = loft(x, y, z);
    d = smin(d, bulb(x, y, z), b.bulb);
    d = smin(d, cheek(x, y, z), b.cheek);
    d = smin(d, turret(x, y, z), b.turret);
    d = smin(d, septum(x, y, z), b.septum);
    return d;
  };
  // the dermal cups with the infraorbital crease where each collar meets the head
  const withCups = (x, y, z, m) => {
    const za = Math.abs(z), c = cupL(x, y, za);
    const d = smin(m, c, b.cups);
    // the crease runs under the eye's lateral and front sides; medially and behind, the collar merges into the
    // turret and the nape
    // (crease.back [from, to]: behind the globe's centre it fades out before it turns up the collar's back into the
    // nape, where the two surfaces meet too flat for a clean groove)
    const CB = K.cup.crease.back;
    // (crease.front [from, to]: in front of the globe's centre it fades out too, so the collar's front-lateral foot
    // runs into the head without a dark slot under its overhang in front views)
    const CF = K.cup.crease.front;
    const cw = smoothstep(0.02, 0.07, za - E.z) * (CB ? 1 - smoothstep(E.s + CB[0], E.s + CB[1], x) : 1) * (CF ? smoothstep(E.s - CF[1], E.s - CF[0], x) : 1);
    return cw > 0 ? d + (ssub(d, Math.hypot(m, c) - K.cup.crease.r, K.cup.crease.k) - d) * cw : d;
  };

  // ---- mouth
  const G = K.gape, halfAt = gapeHalf(G);
  const gapeY = (x) => G.yFront + (G.yBack - G.yFront) * smoothstep(0.03, G.rictus, x);
  // in front of the rictus the outer mass ends at the gape: the lower jaw's own tissue is below it
  const front = (x, y = 1, lean = G.lean ?? 0) => 1 - smoothstep(G.rictus - G.close * 0.4, G.rictus + G.close * 0.6, x - lean * Math.max(0, gapeY(x) - y));
  const padP = smoothPath(K.pad.path, K.pad.radius, K.pad.samples), medP = smoothPath(K.pad.median.path, K.pad.median.radius, 24);
  const bean0 = tube(padP.points, padP.radii, 0.2), median = tube(medP.points, medP.radii, 0.2);
  // the pad's section is a little taller than wide (sy: the vertical stretch about the path's height)
  const psy = K.pad.sy ?? 1, pyc = K.pad.path.reduce((a, p) => a + p[1], 0) / K.pad.path.length;
  const bean = psy === 1 ? bean0 : (x, y, z) => bean0(x, pyc + (y - pyc) / psy, z) * Math.min(1, psy);
  const pad = (x, y, z) => smin(bean(x, y, z), median(x, y, z), 0.02);
  // the snout's skin sheath over the pad (Murdy 1989): a fleshy roll along the pad's top that carries the face's side
  // down onto the pad, so the face has no waist over the pad seen from the front; the labial groove is where it
  // meets the pad
  const SH = K.pad.sheath;
  const sheath = SH ? (() => { const q = smoothPath(SH.path, SH.radius, 40); return tube(q.points, q.radii, 0.2); })() : null;
  const J = K.jaw;
  const ramus = (() => { const q = smoothPath(J.ramus.path, J.ramus.radius, 40); return tube(q.points, q.radii, 0.2); })();
  const lowerLip = (() => { const q = smoothPath(J.lip.path, J.lip.radius, 48); return tube(q.points, q.radii, 0.2); })();
  const jawFloor = el(J.floor), chin = el(J.chin);
  // optional (off in HEAD_SCULPT): the lower lip's fold under the pads (Murdy 1989: the upper lip's fold joins a
  // similar fold of the lower lip at the rictus), a tube {path, radius, blend} the slit then cuts along the pads'
  // undersides, so the dropped jaw carries a lip out to the corners (round 3: 1.4× the hanging jaw's width at
  // gapeFull) at the cost of a lower-lip ledge under the pads and wings under the median lip seen from the front
  const lipFold = J.fold ? (() => { const q = smoothPath(J.fold.path, J.fold.radius, 40); return tube(q.points, q.radii, 0.2); })() : null;
  const rictal = ellipsoid(K.rictal.c, K.rictal.r);
  const jawTissue = (x, y, z) => {
    const za = Math.abs(z);
    let d = smin(ramus(x, y, za), jawFloor(x, y, z), J.blend);
    d = smin(d, chin(x, y, z), J.blend);
    d = smin(d, lowerLip(x, y, za), J.blend * 0.5);
    if (lipFold) d = smin(d, lipFold(x, y, za), J.fold.blend);
    return d;
  };
  const cav = K.cavity;
  const cavF = el(cav.front), cavM = el(cav.mid), cavB = el(cav.back), tongue = el(K.tongue);
  const cavity = (x, y, z) => ssub(smin(smin(cavF(x, y, z), cavM(x, y, z), cav.blend), cavB(x, y, z), cav.blend), tongue(x, y, z), b.tongue);

  // the upper head: the outer mass, cut at the gape in front of the rictus, with the upper lip on it (the labial
  // groove where they meet), and the rictal fold at the corner
  const upper = (x, y, z) => {
    const za = Math.abs(z), w = front(x, y);
    let m = mass(x, y, z);
    if (sheath) m = smin(m, sheath(x, y, za), SH.k);
    if (w > 0) m += (smax(m, gapeY(x) - y, 0.008) - m) * w;
    const p = pad(x, y, za);
    // the labial groove along the pad's top and round its rear end (across the front the median lip runs on into the
    // snout without it); below the middle of the rear end it fades, and the pad runs into the cheek through the
    // rictal fold, a soft web (web: the s and y ranges where it takes over, its blend)
    const RW = K.pad.web, rw = RW ? smoothstep(RW.s[0], RW.s[1], x) * (1 - smoothstep(RW.y[0], RW.y[1], y)) : 0;
    // across the front the median lip flows out of the snout (a soft blend, no crease: the sheath runs on into it)
    const mb = K.pad.median.blend ? K.pad.median.blend * (1 - smoothstep(0.04, 0.09, za)) : 0;
    let d = smin(m, p, Math.max(mb, 0.004 + (RW ? (RW.k - 0.004) * rw : 0)));
    const SZ = K.pad.seam.z ?? [0.05, 0.11];
    // (seam.out: in front of the rictus the groove stays on the outside, `out` over the gape's line and up; under it
    // the pad's underside meets the palate inside the slit, where the same cut grooved the slit's roof and folded the
    // posed mesh there)
    const SO = K.pad.seam.out, sw = smoothstep(SZ[0], SZ[1], za) * (1 - rw) * (SO ? 1 - w * (1 - smoothstep(gapeY(x) - SO, gapeY(x) + SO, y)) : 1);
    // (seam.rear {s: [from, to], r, k}: round the rear end the groove widens, so the skin's swell where the jaw's
    // tissue fuses into the cheek does not pinch its bottom into a cusp, and it stays two cells wide in the posed mesh)
    const SR = K.pad.seam.rear, rt = SR ? smoothstep(SR.s[0], SR.s[1], x) : 0;
    const sr = K.pad.seam.r + (SR ? (SR.r - K.pad.seam.r) * rt : 0), sk = K.pad.seam.k + (SR ? (SR.k - K.pad.seam.k) * rt : 0);
    if (sw > 0) d += (ssub(d, Math.hypot(m, p) - sr, sk) - d) * sw;
    return smin(d, rictal(x, y, za), K.rictal.blend);
  };

  // the cups, the crease behind the pad's rear end, the nostrils, the gill margin and slit: snapped onto the mass
  const snapped = (p) => { const q = smoothPath(snapToSurface(mass, p.path), p.radius, 40); return tube(snapToSurface(mass, q.points), q.radii); };
  const opercle = K.opercle.radius.some((r) => r > 0) ? snapped(K.opercle) : null;
  // the gill cover: the surface moved out toward the margin, a soft step across it
  // (over the gill slit, where the opercle's edge is free, the rim's rear face steepens to `slitEdge`: the flap's
  // blunt rounded edge over the slit's mouth; elsewhere the membrane is fused and the rim is a soft fold)
  // (full over the slit's heights, fading over `slitBlend` beyond its ends, so the rim's thickness changes smoothly)
  const coverT = OC ? (x, y) => {
    if (y <= OC.y[0] || y >= OC.y[3]) return 0;
    const a = sOp(y) - x, edge = OC.edge + ((OC.slitEdge ?? OC.edge) - OC.edge) * slitW(y);
    if (a <= -edge * 0.25 || a >= OC.from) return 0;
    const wy = smoothstep(OC.y[0], OC.y[1], y) * (1 - smoothstep(OC.y[2], OC.y[3], y));
    const t = OC.t + ((OC.slitT ?? OC.t) - OC.t) * slitW(y);
    return t * wy * (1 - smoothstep(OC.full, OC.from, a)) * smoothstep(-edge * 0.25, edge, a);
  } : null;
  // the head up to the fuse of the lower jaw's tissue (crease: the rictal crease's tube, carved into the upper head, or
  // with rictalCrease.skin into the fused skin)
  const creaseOnSkin = !!K.rictalCrease.skin;
  const core = (x, y, z, crease) => {
    const za = Math.abs(z), w = front(x, y);
    let u = withCups(x, y, z, upper(x, y, z));
    if (crease && !creaseOnSkin) u = CS ? u + crease(x, y, za) : ssub(u, crease(x, y, za), b.groove);
    // the lower jaw: its tissue below the gape, carved off the upper head by the slit's width in front of the rictus;
    // behind the rictus it fuses into the cheek and the throat
    let j = jawTissue(x, y, z);
    // the slit between the lips: full width (two hero cells and more) up to its rounded end under the pad's rear
    // end (slitEnd), so it never tapers into a sliver the mesh cannot resolve, and never opens on the cheek behind
    // the pad; without slitEnd it tapers shut over the rictus
    if (G.slitEnd !== undefined) {
      j = smax(j, smin(halfAt(x) * 2 - u, G.slitEnd - x, G.endRound ?? 0.01), G.edge ?? 0.002);
    } else {
      const wg = G.gapLean === undefined ? w : front(x, y, G.gapLean);
      if (wg > 0) j = smax(j, G.half * 2 * wg * wg * wg - u, G.edge ?? 0.002);
    }
    // behind the rictus, and everywhere low down on the throat, the jaw's tissue fuses into the head
    const kf = J.fuse * Math.max(1 - w, 1 - smoothstep(0.03, 0.06, y));
    let d = kf > 1e-4 ? smin(u, j, kf) : Math.min(u, j);
    if (crease && creaseOnSkin) d = CS ? d + crease(x, y, za) : ssub(d, crease(x, y, za), b.groove);
    return d;
  };
  // (skin: the crease is snapped onto the skin the eye sees, the upper head fused with the jaw's tissue, so below the
  // pad's rear end, where the jaw's tissue is the outer surface, it still runs on down and back onto the cheek)
  // (soft {w, depth}: the crease as a smooth trough pressed into the skin along the path, `depth` per path point and
  // `w` wide, instead of a tube cut: it runs out of the labial groove and fades on the cheek without a step at either end)
  const CS = K.rictalCrease.soft;
  const rictalCrease = (() => {
    const f0 = creaseOnSkin ? (x, y, z) => core(x, y, z, null) : (x, y, z) => upper(x, y, z);
    if (CS) {
      // (smooth: passes of a mean over each point's neighbours after the samples are snapped onto the skin: snapped
      // one by one across the groove's curved walls they zigzag by up to 0.4 rad, and the trough then shades as a
      // stack of ridges across the crease, the 'venetian blind' at the rear end)
      const q = smoothPath(snapToSurface(f0, K.rictalCrease.path), CS.depth, 40), D = q.radii;
      let P = snapToSurface(f0, q.points);
      for (let it = 0; it < (CS.smooth ?? 0); it++) P = P.map((p, i) => (i === 0 || i === P.length - 1 ? p : p.map((c, k) => 0.5 * c + 0.25 * (P[i - 1][k] + P[i + 1][k]))));
      const lo = [0, 1, 2].map((k) => Math.min(...P.map((p) => p[k])) - CS.w), hi = [0, 1, 2].map((k) => Math.max(...P.map((p) => p[k])) + CS.w);
      // the trough's depth at (x, y, z): >= 0, carved by adding it to the field
      return (x, y, z) => {
        if (x < lo[0] || x > hi[0] || y < lo[1] || y > hi[1] || z < lo[2] || z > hi[2]) return 0;
        let best = Infinity, dep = 0;
        for (let i = 0; i + 1 < P.length; i++) {
          const a = P[i], b = P[i + 1], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [x - a[0], y - a[1], z - a[2]];
          const t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1), 0, 1);
          const dd = Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
          if (dd < best) { best = dd; dep = D[i] + (D[i + 1] - D[i]) * t; }
        }
        if (best >= CS.w) return 0;
        const u = 1 - (best / CS.w) ** 2;
        return Math.max(0, dep) * u * u;
      };
    }
    const q = smoothPath(snapToSurface(f0, K.rictalCrease.path), K.rictalCrease.radius, 30);
    return tube(snapToSurface(f0, q.points), q.radii);
  })();
  // the anterior nostril grows out of the snout's skin: its base is snapped onto the outer mass (so it never floats
  // off a reshaped snout) and sunk a little into it, the tube running `len` along `dir` (forward and down)
  const NO = K.nostril;
  const nostrilAt = (() => {
    if (!NO.dir) return { base: NO.base, tip: NO.tip };
    const p = snapToSurface(mass, [NO.base])[0], dl = nrm(NO.dir);
    return { base: p.map((c, k) => c - dl[k] * NO.sink), tip: p.map((c, k) => c + dl[k] * NO.len) };
  })();
  const nostril = tube([nostrilAt.base, nostrilAt.tip], NO.r);
  const nostrilHole = sphere(nostrilAt.tip, NO.hole);
  const pore = sphere(K.nostrilPost.c, K.nostrilPost.r);
  const GS = K.gillSlit, chamber = K.gillChamber ? ellipsoid(K.gillChamber.c, K.gillChamber.r) : () => Infinity;
  // the slit: a thin pocket between the opercle's free edge (the flap of the proud rim) and the body wall under it,
  // centred `depth` under the mass's skin (a negative depth: over it, in the cover's raised rim), `half` either side,
  // from `back` behind the margin to `reach` in front of it. Its mouth is where the rim's rear face comes down through
  // the pocket's roof: under the rim's edge, facing back along the body wall, so at rest it is the rim's own undercut
  // (closed: no cut is seen from the side or from behind), and the flap and the body wall are separate surfaces the
  // rig parts when the gill covers abduct (Michel 2014: the slits open only after the opercles abduct). With `edge`
  // (the older form) a sheet across the rim at `edge` in front of the margin opens the slot to the outside instead.
  const slitTw = (y) => (GS.taper ? smoothstep(0, GS.taper, Math.min(y - GS.y0, GS.y1 - y)) : 1);
  const slitRound = (y) => GS.round * 0.5 * (GS.edge === undefined ? slitTw(y) : 1);
  // (reachEnd: the pocket's reach under the flap eases from `reach` to `reachEnd` over `reachTaper` toward the ends)
  const reachAt = (y) => (GS.reachEnd === undefined ? GS.reach : GS.reachEnd + (GS.reach - GS.reachEnd) * smoothstep(0, GS.reachTaper, Math.min(y - GS.y0, GS.y1 - y)));
  const gillSlit = (x, y, z, m) => {
    const sm = sOp(y), along = sm - x; // > 0 in front of the margin
    const inY = Math.max(GS.y0 - y, y - GS.y1);
    if (GS.edge === undefined) {
      // the pocket's floor (the body wall) rises out of it behind the mouth (from `mouth` to `back` behind the margin)
      // through the skin to `lift` over it, so the body wall runs on under the flap in a soft dip and the pocket's
      // rounding never grazes the skin there; at its ends the flap comes down onto the body wall (the membrane fused to
      // it): over `taper` the floor and the roof both ease to the skin's level and the rounding fades (slitRound), so
      // the mouth closes to nothing instead of ending in a wall
      const lift = GS.lift ?? 0.01, tw = slitTw(y);
      const twF = GS.floorTaper ? smoothstep(0, GS.floorTaper, Math.min(y - GS.y0, GS.y1 - y)) : tw;
      const fl = (GS.floor ?? -GS.depth - GS.half) * twF, rise = 1 - smoothstep(-GS.back, GS.mouth ?? 0.006, along);
      const floor = fl + (lift - fl) * rise, roof = fl + 2 * GS.half * tw;
      return Math.max(m - roof, floor - m, -along - GS.back, along - reachAt(y), inY);
    }
    const slot = Math.max(Math.abs(m + GS.depth) - GS.half, -along - (GS.back ?? 0.004), along - GS.reach, inY);
    // the opening: a sheet across the margin's rim from the outside down to the slot
    const open = Math.max(Math.abs(along - GS.edge) - GS.half, inY, -(m + GS.depth + GS.half));
    return Math.min(slot, open);
  };

  // the medial lobes of the domes (cup.neck with `rise`: neckLobe)
  const neckL = K.cup.neck && K.cup.neck.rise !== undefined ? neckLobe(K.cup.neck, re) : null;
  const f = (x, y, z) => {
    const za = Math.abs(z);
    const m0 = mass(x, y, z);
    let d = core(x, y, z, rictalCrease);
    // the mouth cavity, reached through the slit
    d = ssub(d, cavity(x, y, z), b.cavity);
    // the head filleted onto the globes front and back, and the neck between the two domes
    const C = K.cup, FL = C.fillet, NK = C.neck, epx = x - eyeL[0], epy = y - eyeL[1];
    if (FL) {
      const az = Math.atan2(-epx, za - eyeL[2]) - (C.low * Math.PI) / 180;
      const wf = smoothstep(Math.cos((FL.from * Math.PI) / 180), Math.cos((FL.to * Math.PI) / 180), Math.cos(az)) * smoothstep(0, 0.03, za - 0.02);
      if (wf > 0) d = smin(d, Math.hypot(epx, epy, za - eyeL[2]) - (re - FL.inset), FL.k * wf);
    }
    if (NK && NK.rise !== undefined) {
      // the two domes pressed together: each dome's medial face is filled out by the dermal cup's medial wall, a lobe
      // laid on the globe as a radial swelling g(m) of the medial component m (cup.neck): under the eye's skin
      // laterally, meeting it nearly tangent at m = `at`, rising medially; the two lobes meet on the midline in a V
      // with one median crease (k: its rounding)
      const lobe = (zz) => neckL(epx, epy, zz - eyeL[2]);
      // (blended into the head over `blend`; over the dome's top the head under the band is the fillet's copy of the
      // globe 0.008 inside it, which lifts the band by ≈0.0001: `inset` allows for it)
      d = smin(d, smin(lobe(z), lobe(-z), NK.k), NK.blend ?? 0.01);
    } else if (NK) {
      const dl = Math.hypot(epx, epy, z - eyeL[2]) - (re - NK.inset), dr = Math.hypot(epx, epy, z + eyeL[2]) - (re - NK.inset);
      d = smin(d, smax(smin(dl, dr, NK.k), y - NK.top, NK.cap), 0.01);
    }
    // the eye sockets (the globes sit in them)
    if (K.cup.carveTop) {
      // the socket is carved only round the lower globe, inside the cup: above the rim the head's surface simply runs
      // into the globe (no paper-thin wedge of skin over it, which meshes ragged), so the junction is a clean line
      // (and always round the window's side of the globe, where the cornea lies under the skin's level)
      const [m0, m1] = K.cup.carveTop, hr = cup.rimH(epx, za - eyeL[2]), O = K.cup.open, epz = za - eyeL[2];
      const cw = (O[0] * epx + O[1] * epy + O[2] * epz) / (Math.hypot(epx, epy, epz) || 1);
      const wc = Math.max(1 - smoothstep(hr + m0, hr + m1, epy), smoothstep(Math.cos((K.cup.carveWin[1] * Math.PI) / 180), Math.cos((K.cup.carveWin[0] * Math.PI) / 180), cw));
      if (wc > 0) d += (ssub(d, socketL(x, y, za), b.socket) - d) * wc;
    } else d = ssub(d, socketL(x, y, za), b.socket);
    // the gill margin's fold, the slit through it and the chamber behind
    if (coverT) d -= coverT(x, y);
    if (opercle) d = smin(d, opercle(x, y, za), b.fold);
    const slot = gillSlit(x, y, za, m0);
    d = smax(d, -Math.min(slot, chamber(x, y, za)), slitRound(y));
    // the nostrils
    d = smin(d, nostril(x, y, za), b.nostril);
    d = ssub(d, nostrilHole(x, y, za), 0.003);
    d = ssub(d, pore(x, y, za), 0.003);
    d = smax(d, K.floorY - y, b.floor);
    if (cut) d = smax(d, x - K.cutS, b.cut);
    return d;
  };
  f.parts = (x, y, z) => ({ f: upper(x, y, z), u: pad(x, y, Math.abs(z)), j: jawTissue(x, y, z) });
  f.cup = cup;
  return f;
}

/** One dome's medial lobe (HEAD_SCULPT.cup.neck with `rise`): its field at (epx, epy, qz) from the globe's centre
 * (qz toward the fish's left; the other dome's lobe is the mirror, qz = −z − its centre's z), re the globe's radius.
 * headSDF unites the two lobes with the head (headrig.mjs blinkTargets lays them on the lowered globes only without
 * its own closed surface, BLINK_CLOSE.convex).
 * { closed: true } (with `rho`): the globe and its lobe as one star-shaped surface about the globe's centre, the lobe
 * where it stands out and the globe's sphere elsewhere (no band under the skin, no cut): for laying on a moved globe,
 * smin(closedL(dx, dy, z − E.z) − shell, closedL(dx, dy, −z − E.z) − shell, NK.k) is both domes with their V. */
export function neckLobe(NK, re, { closed = false } = {}) {
  const dn = Math.hypot(...NK.dir), ax = [-NK.dir[0] / dn, NK.dir[1] / dn, -NK.dir[2] / dn];
  const tanA = Math.tan((NK.angle * Math.PI) / 180), tanL = Math.tan(((NK.angleLow ?? NK.angle) * Math.PI) / 180);
  const sE0 = Math.sin(((NK.el?.[0] ?? -90) * Math.PI) / 180), sE1 = Math.sin(((NK.el?.[1] ?? -90) * Math.PI) / 180);
  // the medial rise past the junction (the same in both forms)
  const riseAt = (m) => NK.rise * Math.pow(Math.max(0, m - NK.at) / (1 - NK.at), NK.risePow);
  if (NK.rho !== undefined) {
    // (rho: the hidden side curls under the eye's skin with a curvature radius `rho` [low, high] (HL) from the
    // junction, where the head's surface crosses the skin at `angle` (`angleLow` low on the dome): its depth under the
    // skin x·tan(angle) + x²/(2 rho) at the arc distance x lateral of the junction, so it is ≥ 0.0012 HL deep a few
    // cells from the junction (no wide band hugging the skin for a coarser eye mesh to let through in specks) and,
    // low on the dome, deeper than the cornea's recess where the turned window comes (yaw ±30°); the band ends
    // `deep` under the skin. Past the junction the start runs on at its slope, easing off over 0.1 of m, into the rise.
    // closed: the dome and its lobe as one star-shaped surface about the globe's centre (the eye's skin where the
    // lobe is under it): no hidden band, for a rig that lays the lobes on a moved globe (headrig.mjs blinkTargets))
    const deep = NK.deep ?? 0.012;
    return (epx, epy, qz) => {
      const l = Math.hypot(epx, epy, qz) || 1e-9;
      const m = (epx * ax[0] + epy * ax[1] + qz * ax[2]) / l, w = smoothstep(sE0, sE1, epy / l);
      const t = re * (tanL + (tanA - tanL) * w), rho = NK.rho[0] + (NK.rho[1] - NK.rho[0]) * w;
      // (atLow: low on the dome the junction lies further medially, `atLow`, so the band has room to dive under the
      // window's reach when the eye turns forward)
      const at = NK.atLow === undefined ? NK.at : NK.atLow + (NK.at - NK.atLow) * w;
      let g;
      if (m <= at) { const x = re * (at - m); g = -((x * t) / re + (x * x) / (2 * rho)); }
      else g = t * 0.1 * (1 - Math.exp(-(m - at) / 0.1)) + NK.rise * Math.pow(Math.max(0, m - at) / (1 - at), NK.risePow);
      if (closed) { const k = NK.closedK ?? 0.002, gp = g > 0 ? g + k * Math.log1p(Math.exp(-g / k)) : k * Math.log1p(Math.exp(g / k)); return l - (re + gp); }
      // the band's lateral end: where it is `deep` under the skin (x² / 2rho + x tan = deep)
      const dp = Array.isArray(deep) ? deep[0] + (deep[1] - deep[0]) * w : deep;
      const xe = rho * (-t / re + Math.sqrt((t / re) ** 2 + (2 * dp) / rho));
      return Math.max(l - (re + g), (at - xe / re - m) * l);
    };
  }
  // g(m): −inset, then a start of power `pow` that reaches the globe's skin at m = `at` with the slope of `angle`
  // degrees, then the rise proper, `rise` at the medial pole (a power `risePow` of the way there from `at`)
  // (low down, under `el` [from, to] degrees of elevation from the globe's centre, the junction steepens to
  // `angleLow` and the band under the skin narrows with it, out of the way of the window when the eye turns
  // forward)
  return (epx, epy, qz) => {
    const l = Math.hypot(epx, epy, qz) || 1e-9;
    const m = (epx * ax[0] + epy * ax[1] + qz * ax[2]) / l, w = smoothstep(sE0, sE1, epy / l);
    const Dl = (NK.pow * NK.inset) / (re * (tanL + (tanA - tanL) * w)), m0 = NK.at - Dl;
    // (past `at` the start runs on at its slope there, easing off over 0.1 of m, so a steep start low down does
    // not swell the lobe)
    const sl = (NK.pow * NK.inset) / Dl, start = m <= NK.at ? NK.inset * Math.pow(Math.max(0, m - m0) / Dl, NK.pow) : NK.inset + sl * 0.1 * (1 - Math.exp(-(m - NK.at) / 0.1));
    // (lateral of the start the band dives away under the skin, `dive`·(m0 − m)² high on the dome, so its cut lies
    // well inside the globe)
    const g = -NK.inset + start + riseAt(m) - (NK.dive ?? 0) * w * Math.max(0, m0 - m) ** 2;
    return Math.max(l - (re + g), (m0 - NK.cut - m) * l);
  };
}

/** The slit's half-width along s: `half`, narrower in front (gape.front: front.half up to front.s[0], easing to `half`
 * by front.s[1]) and wider toward its end (gape.back: easing from `half` at back.s[0] to back.half at back.s[1]). The
 * rig's gapeSide must carve with the same width to tell the lips apart. */
export function gapeHalf(G) {
  const F = G.front, B = G.back;
  if (!F && !B) return () => G.half;
  return (x) => {
    let h = F ? F.half + (G.half - F.half) * smoothstep(F.s[0], F.s[1], x) : G.half;
    if (B) h += (B.half - G.half) * smoothstep(B.s[0], B.s[1], x);
    return h;
  };
}

/** Move points onto the zero set of f (Newton steps along its gradient). */
export function snapToSurface(f, points, steps = 12) {
  return points.map(([x, y, z]) => {
    for (let i = 0; i < steps; i++) {
      const d = f(x, y, z), e = 1e-4;
      const gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e), gy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e), gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
      const gg = gx * gx + gy * gy + gz * gz || 1;
      x -= (d * gx) / gg; y -= (d * gy) / gg; z -= (d * gz) / gg;
      if (Math.abs(d) < 1e-6) break;
    }
    return [x, y, z];
  });
}

/** The head's distance in mm (fish frame) for a head length of HLmm. */
export function headSDFmm(HLmm, K = HEAD_SCULPT, o) {
  const f = headSDF(K, o), k = 1 / HLmm;
  return (x, y, z) => f(x * k, y * k, z * k) * HLmm;
}
