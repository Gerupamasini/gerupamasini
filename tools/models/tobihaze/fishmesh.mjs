// The whole fish's skin as a render mesh per tier: the sculpt meshed at the tier's cell size (one closed manifold
// skin: fishDense), split into UV charts (charts.mjs) and simplified region by region to the tier's triangle targets
// (tiers.mjs). Every tier vertex is a vertex of the tier's dense mesh (`source`), so the rig and the morphs computed
// on the dense mesh carry over exactly.
//
// Tiers (TIERS): hero  the full sculpt at h 0.09 mm (the cell the head rig was validated at), head 45 000 + trunk
//                      31 000 triangles, the slit's lips, the gill flap/wall split and the cup–globe junction locked
//                lod1  the sealed sculpt (seal.mjs: no slit, no gill pocket, no nostril holes; the hero's eye cup and
//                      lining under the window) at h 0.16 mm, head 5 000 + trunk 3 900, the lining's rings and the
//                      junction locked, the blinks weighed 2 as simplifier attributes (tierMorphAttrs)
//                lod2  the far sculpt at h 0.40 mm, simplified first to 1 000 triangles with the axial chain's hat
//                      functions as attributes (a ring of vertices at every joint and knot: no edge spans more than
//                      0.56 of a joint interval), the caps inside the globes refilled as one fan each, then charted
// The head region is every triangle in front of s 1.32 HL but the pectoral lobes'; the trunk the rest. Their border is
// locked, so they meet without a crack.
//
// The body texture is square (2048² hero, 1024² lod1, 256² lod2); BODY_LAYOUT ([x0, y0, x1, y1], v down) sizes each
// chart for about 0.0019 HL (0.031 mm) of skin per texel at 2048 on the body and 0.0015 on the face (shots-uv.mjs
// tiers reports it per chart); lod2 bakes its own, BODY_LAYOUT_LOD2 (round B4: only the rects it fills, TIERS.lod2.layout;
// a chart the layout leaves out is not made):
//   bodyL, bodyR   one side each of the body from s 0.43 HL to the tail's end (round B3: to the end of the caudal's
//                  fleshy base, body.mjs tailEnd, the seam along its rounded edge), round from the ventral midline to
//                  the dorsal one by arc length (half cylinders, no wrap: the seams lie on the midlines, under the keels
//                  and fins)
//   head           the face, snout and the front of the eye turret, azimuthal about the forward axis
//   domeL, domeR   the skin round each eye globe facing away from its centre within 0.1 HL of the globe (the domes,
//                  their backs and medial lobes, the cup's outside, the collar down into the infraorbital crease:
//                  all of which fold in the head's chart), azimuthal from the globe's centre about the up-and-out axis
//   socketL, socketR  the cup's lining, facing the globe (it would overlap the cup's outside)
//   lobeL, lobeR   each pectoral arm (the fish field's lobe part, from the shoulder on, within 1.25× of the arm's
//                  half-width of its axis), a tube about the smoothed shoulder → elbow → wrist curve (read from
//                  BODY_SCULPT at build time: the bent arm) with a parallel-transported reference (seam medial),
//                  running from just inside the shoulder to just past the wrist's end cap
//   tailCap        (B2: the peduncle's end plate, azimuthal about +s; unused since the body halves run to the tail's
//                  end, round B3: a spare rect for the patch)
//   mouthRoof, mouthFloor   the gape slit's walls (hero) and the lips' margins facing down / up onto the slit's plane
//                  (the upper lip's underside, the lower lip's top within LIP.band of the mouth's line), flat on the
//                  closed mouth's plane
//   gillRoofL/R, gillFloorL/R  (hero) each gill pocket's two walls, flat on the flank
//   patch          what no projection maps without a fold or an overlap (a pad's underside behind the lip, a pocket's
//                  rounded end, the pelvic base's front), as few islands as it can (charts.repairFolds: bad triangles
//                  first tried in a neighbour's chart, small groups — and small pieces of the patch — mended inside
//                  the chart round them, the rest closed over 6 rings at hero (3 at lod1), each island grown to 48+
//                  triangles at hero (4+ at lod1, 2+ at lod2: their whole skin is 8.9k and 1k triangles) where the
//                  hidden walls let it, laid by a conformal map (cut open into a disc where it is none) or unfolded, 4 texels
//                  apart at the body's density, in the patch rect and any rect the tier leaves empty: SPARE_CHARTS)
//   iris, eyeSkin  the eye meshes' window and skin (eyeAtlasUV): the eye is a separate mesh on the same texture; round T3
//                  the skin of each globe in its own rect, eyeSkinL / eyeSkinR (eyemesh eyePartUV by side)
//   teeth          a swatch for the teeth's constant UV
//   hidden         one texel for the cap that closes the skin inside each globe (never seen)
// The charts are assigned per vertex, then a depth test in UV space from each projection's viewpoint moves what a
// chart sees behind another of its own surfaces to its fallback chart (charts.chartResolve: the face's, the body's and
// the tail's charts, projected from inside, keep their outermost skin and give up what lies under it), and repairFolds
// lays flat whatever still folds, before and after the simplification. Tangents are per vertex (tiers.vertexTangents).
import { HL, HEAD, EYE_MM } from './anatomy.mjs';
import { HEAD_SCULPT, cupField } from './head.mjs';
import { BODY_SCULPT, fishSDFmm, trunkProfile } from './body.mjs';
import { azimuthal, halfCylinder, limbPath, planar, pointChart, vec } from './charts.mjs';
import { tierMesh, ready as tiersReady, meshTopology } from './tiers.mjs';
import { surfaceNets } from './mesher.mjs';
import { fixWinding, gapeSide, marginCurve } from './headrig.mjs';
import { smoothstep } from './sdf.mjs';
import { sealedFishSDFmm } from './seal.mjs';

export { meshTopology };

/** The axial chain's stations (HL) from rig.mjs, loaded lazily (rig.mjs imports this module): the joints' pivots and
 * the knots between them, where lod2 keeps a ring of vertices (axialRings). Callers await `ready` before meshing. */
let AXIAL = null;
const axialReady = import('./rig.mjs').then((R) => {
  const chain = ['J_root', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'];
  AXIAL = { pivots: chain.map((n) => R.JOINTS.find((j) => j.name === n).at[0] / HL), knots: R.AXIAL_KNOTS.map(([, k]) => k) };
}).catch(() => { AXIAL = null; });
export const ready = Promise.all([tiersReady, axialReady]);

/** The meshing box (fish mm): snout to the peduncle's end, the pectoral lobes and the eye domes inside (round B3: the
 * peduncle runs on past the caudal base as the fin's fleshy base, its bowed end at s 4.49 HL: the box to 4.56). */
export const BODY_BOX = { min: [-0.08 * HL, -0.16 * HL, -0.62 * HL], max: [4.56 * HL, 0.85 * HL, 0.62 * HL] };

/** Atlas rectangles [x0, y0, x1, y1] (share of the square body texture, v down); gutters ≥ 0.01 between them. Each
 * chart's rect is sized for 0.0019 HL (0.031 mm) of surface per texel at 2048 over the part of its projection the skin
 * uses (CHART_CROP), measured on the hero's dense charted mesh (shots-uv.mjs --tier hero reports the density). */
export const BODY_LAYOUT = {
  bodyL: [0, 0, 1, 0.265],
  bodyR: [0, 0.275, 1, 0.54],
  head: [0, 0.55, 0.40, 0.95],
  domeL: [0.41, 0.55, 0.552, 0.689],
  domeR: [0.562, 0.55, 0.704, 0.689],
  socketL: [0.714, 0.55, 0.819, 0.633],
  socketR: [0.829, 0.55, 0.934, 0.633],
  gillRoofL: [0.944, 0.55, 0.99, 0.585],
  gillFloorL: [0.944, 0.595, 0.99, 0.63],
  gillRoofR: [0.944, 0.64, 0.99, 0.675],
  gillFloorR: [0.944, 0.685, 0.99, 0.72],
  tailCap: [0.796, 0.643, 0.874, 0.736],
  teeth: [0.884, 0.643, 0.904, 0.663],
  hidden: [0.914, 0.643, 0.919, 0.648],
  lobeL: [0.41, 0.70, 0.52, 0.819],
  lobeR: [0.53, 0.70, 0.64, 0.819],
  mouthRoof: [0.65, 0.70, 0.786, 0.777],
  mouthFloor: [0.65, 0.787, 0.786, 0.864],
  // (round T3: the eye's block re-cut — the window's rect 0.08 tall (T2 0.12: 0.0055 mm a texel over the window's radius
  // at 2048, still far under a screen pixel) and each eye's skin cap its own rect, eyeSkinL and eyeSkinR (eyemesh by the
  // globe's side; T2's caps shared one, the right the left's mirror clone), 0.075 tall: the cap's polar run from the
  // window's edge to the back pole, 3.7–4.6 mm of skin over 154 texels at 2048, ≤ 0.030 mm a texel along it (T2 0.019)
  // and 0.034 round it at the globe's equator, the head's 0.024–0.032; `eyeSkin` the two caps' union, the Eye
  // material's skinRect; the gutters 0.01)
  iris: [0.796, 0.746, 0.946, 0.826],
  eyeSkin: [0.796, 0.836, 0.946, 0.996],
  eyeSkinL: [0.796, 0.836, 0.946, 0.911],
  eyeSkinR: [0.796, 0.921, 0.946, 0.996],
  patch: [0.41, 0.874, 0.786, 0.99],
};

/** lod2's atlas (round B4, tech P4: B3's lod2 baked BODY_LAYOUT, 9.2 % of whose 256² went to rects the far skin never uses
 * — the domes (its dome skin charts into the head's), the sockets, the gill pockets, the slit's walls, the tail cap and
 * the teeth): only the rects lod2 fills, at BODY_LAYOUT's places but the body halves 6 % taller (texels round the body)
 * and the head 5 % larger, the lobes and the patch moved clear of it (larger lobes or a moved patch changed which few
 * far triangles the folds' repair lays in the patch: 7.3 mm² of it visible against B3's 5.1, this one 4.7). The atlas
 * is baked per tier. */
export const BODY_LAYOUT_LOD2 = {
  bodyL: [0, 0, 1, 0.28],
  bodyR: [0, 0.29, 1, 0.57],
  head: [0, 0.58, 0.42, 1],
  lobeL: [0.43, 0.70, 0.54, 0.819],
  lobeR: [0.55, 0.70, 0.66, 0.819],
  iris: [0.796, 0.746, 0.946, 0.826],
  eyeSkin: [0.796, 0.836, 0.946, 0.996],
  eyeSkinL: [0.796, 0.836, 0.946, 0.911],
  eyeSkinR: [0.796, 0.921, 0.946, 0.996],
  hidden: [0.914, 0.643, 0.919, 0.648],
  patch: [0.43, 0.874, 0.786, 0.99],
};

/** The part [a0, b0, a1, b1] of each projection's unit square its rect holds (the rest is never used: the eye's
 * charts are discs the skin fills only part of, the lobe's runs past both ends of the arm). */
export const CHART_CROP = {
  socketL: [0.15, 0.42, 0.88, 1.0],
  socketR: [0.14, 0.0, 0.87, 0.58],
  domeL: [0.11, 0.20, 0.95, 0.97],
  domeR: [0.11, 0.03, 0.95, 0.80],
  tailCap: [0.10, 0.18, 0.90, 0.82],
  // (the slit's walls and, since B2, the lips' margins: the upper lip's reaches further out and forward)
  mouthRoof: [0.10, 0.03, 0.90, 0.97],
  mouthFloor: [0.19, 0.21, 0.73, 0.79],
  gillRoofL: [0.24, 0.55, 0.76, 0.82],
  gillFloorL: [0.24, 0.55, 0.76, 0.82],
  gillRoofR: [0.24, 0.55, 0.76, 0.82],
  gillFloorR: [0.24, 0.55, 0.76, 0.82],
};

/** The rects the patch may also fill at a tier that leaves them empty (lod2 has no slit, pockets or lining, lod1 no
 * slit or pockets): the atlas is baked per tier from the position under each texel, so any free rect serves. */
export const SPARE_CHARTS = ['mouthRoof', 'mouthFloor', 'gillRoofL', 'gillFloorL', 'gillRoofR', 'gillFloorR', 'socketL', 'socketR', 'tailCap'];

/** The lips' margins (hero): the band about the closed mouth's line (HL) whose down / up-facing skin (|n_y| > ny)
 * goes with the slit's walls (bodyCharts), in front of s. */
export const LIP = { s: 0.36, band: 0.05, ny: 0.55 };

/** The tiers' meshing and simplification. */
export const TIERS = {
  hero: { h: 0.09, field: 'full', regions: { head: 45000, trunk: 31000 }, locks: ['lips', 'gill', 'cup'], tex: 2048, minIsland: 48 },
  lod1: { h: 0.16, field: 'sealed', regions: { head: 5000, trunk: 3900 }, locks: ['cupRing', 'lining'], morphWeights: { blinkL: 2, blinkR: 2, inflate: 0.25 }, tex: 1024, repairClose: 3 },
  // (lod2's body halves reach 0.85 rad over the ventral midline, where its long triangles span the broad flat throat
  // (round B3: with B2's 0.35 a 7–18-triangle island of 50–85 mm² under the throat went to the patch), 0.25 over the
  // dorsal one: the halves' texels 5 % coarser round the body); its lobes' turn takes 0.75 of their rect's height (its
  // few long triangles round the arm cross the seam by more than the hero's 0.14: 7 went outside, to the patch); round
  // B4: its patch islands 4 texels apart (B3 1: five pairs of islands from places 4–52 mm apart on the fish 1–2 texels
  // apart in the atlas, which a bake's dilation and mipmaps bleed into each other; the patch rect has the room)
  lod2: { h: 0.40, field: 'far', target: 1000, simplifyFirst: true, axialAttrs: 1, tex: 256, pad: 4, repairClose: 1, minIsland: 2, margin: [0.85, 0.25], lobeShare: 0.75, layout: BODY_LAYOUT_LOD2 },
};

/** The tier's field (fish mm, .hl in HL with .head / .parts / .cup). */
export function tierField(name, K = BODY_SCULPT) {
  const T = typeof name === 'object' ? name : TIERS[name], f = T?.field ?? name;
  // (T.seal: seal.mjs options for the sealed and far fields, e.g. { lining: null } for B1's lod1 cup)
  return f === 'full' ? fishSDFmm(HL, K) : sealedFishSDFmm(HL, { K, far: f === 'far', ...(T?.seal ?? {}) });
}

const S_HEAD = 1.32, S_CHART = 0.45;
const memo = new Map();

/** The body halves' arc-length tables: per station s (HL) the share of the section's arc from the ventral midline up
 * to each angle, measured on the field along rays from the body's axis: to where they last leave the skin (`outer`,
 * round B3: the outer skin the halves keep, so a cavity or a pocket the ray crosses first — the throat's at s 0.45–0.6,
 * whose first exit lies 0.13 HL inside the floor, the gill pocket under the opercle's flap — no longer bends the
 * table: B2's first exit there squeezed the cheek's underside into a sliver of v, 2 islands of 340 and 270 triangles
 * to the patch) or where they first leave it (B2). */
function sectionArcs(field, axisY, { s0 = 0.40, s1 = 4.30, ds = 0.05, na = 48, outer = false } = {}) {
  const ns = Math.round((s1 - s0) / ds) + 1, tab = new Float32Array(ns * (na + 1));
  for (let i = 0; i < ns; i++) {
    const s = (s0 + i * ds) * HL, yc = axisY(s);
    const pts = [];
    for (let j = 0; j <= na; j++) {
      const ph = (Math.PI * j) / na, dy = -Math.cos(ph), dz = Math.sin(ph);
      let r = 0, step = 0.012 * HL, inside = field(s, yc, 0) < 0;
      if (outer) {
        // (the last sample inside along the ray, out to 0.9 HL)
        let last = -1;
        for (let q = 0; q * step < 0.9 * HL; q++) if (field(s, yc + dy * q * step, dz * q * step) < 0) last = q * step;
        if (last < 0) { pts.push([yc, 0]); continue; }
        r = last; inside = true;
      }
      if (!inside) { pts.push([yc, 0]); continue; }
      if (!outer) while (r < HL && field(s, yc + dy * (r + step), dz * (r + step)) < 0) r += step;
      let lo = r, hi = r + step;
      for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (field(s, yc + dy * m, dz * m) < 0) lo = m; else hi = m; }
      pts.push([yc + dy * lo, dz * lo]);
    }
    let acc = 0;
    tab[i * (na + 1)] = 0;
    for (let j = 1; j <= na; j++) { acc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); tab[i * (na + 1) + j] = acc; }
    for (let j = 1; j <= na; j++) tab[i * (na + 1) + j] /= acc || 1;
    // (past the tail's end the axis is outside the skin: the station takes the last one's table, or the angle's share)
    if (!(acc > 0)) for (let j = 0; j <= na; j++) tab[i * (na + 1) + j] = i > 0 ? tab[(i - 1) * (na + 1) + j] : j / na;
  }
  return (sMM, ph) => {
    const fs = Math.max(0, Math.min(ns - 1, (sMM / HL - s0) / ds)), i = Math.min(ns - 2, Math.floor(fs)), ts = fs - i;
    const fa = Math.max(0, Math.min(na, (ph / Math.PI) * na)), j = Math.min(na - 1, Math.floor(fa)), ta = fa - j;
    const at = (ii) => tab[ii * (na + 1) + j] * (1 - ta) + tab[ii * (na + 1) + j + 1] * ta;
    return at(i) * (1 - ts) + at(i + 1) * ts;
  };
}

/**
 * The charts (fish mm) and the per-vertex chart choice.
 * @param K  body sculpt
 * @param o  { layout (BODY_LAYOUT), margin (radians the halves reach over the midlines), interior: { mouth, gill }
 *           (per-vertex flags of the mesh being charted: on the slit's walls, in a gill pocket), lobeShare (the lobe
 *           chart's v share of one turn) }
 * @returns { charts, prefer(p, n, v), index (name → chart index), forceTri(centroid) → chart index or −1, axisY }
 */
export function bodyCharts(K = BODY_SCULPT, o = {}) {
  const L = o.layout ?? BODY_LAYOUT;
  const prof = trunkProfile(K);
  const sC = S_CHART * HL, yC = 0.30 * HL;
  // the body's axis: the head's centre line ahead of the gill opening, the trunk's mid-height behind it
  const axisY = (s) => {
    const sh = s / HL, w = smoothstep(1.0, 1.4, sh);
    return w <= 0 ? yC : (1 - w) * yC + w * prof.at(Math.max(1.05, sh)).yc * HL;
  };
  // (round B3: the body halves run to the tail's very end: the peduncle goes on past the caudal base as the fin's thin
  // fleshy base (body.mjs tailEnd, bowed back `bulge` at mid-depth), whose two faces the halves map round from the
  // ventral midline to the dorsal one as they do the trunk's, the seam along the end's rounded edge; B2's tailCap, an
  // azimuthal view from s 4.10 along +s, saw that tongue edge-on: 2,519 dense triangles to the patch)
  const sEnd = (K.tailEnd?.s ?? 4.24) + (K.tailEnd?.bulge ?? 0) + 0.03;
  const key = JSON.stringify(K);
  if (!memo.has(key)) {
    // (the outer skin without the pectoral lobes, which have their own charts)
    const FH = fishSDFmm(HL, K).hl, noLobe = (x, y, z) => FH.parts(x / HL, y / HL, z / HL).noLobe * HL;
    memo.set(key, sectionArcs(noLobe, axisY, { s1: Math.max(4.30, Math.ceil(sEnd / 0.05) * 0.05), outer: true }));
  }
  const arc = memo.get(key);
  const E = HEAD.eye, re = E.d / 2, g = vec.norm(HEAD_SCULPT.cup.open);
  const P = K.pectoral, mm = (v) => v.map((c) => c * HL);
  const side3 = (v, s) => [v[0], v[1], v[2] * s];
  const lobePts = (s) => [mm(side3(P.shoulder, s)), mm(side3(P.elbow, s)), mm(side3(P.wrist, s))];
  const segL = (a, b) => Math.hypot(...vec.sub(b, a));
  const lobeLen = segL(P.shoulder, P.elbow) + segL(P.elbow, P.wrist);
  // (the tube runs from just inside the shoulder (lobeT0) to just past the wrist's end cap, whose reach along the arm is
  // capWrist × the end's thickness: B2's spatulate wrist ends 0.008 HL past the wrist point, B1's round one 0.03)
  const lobeT1 = 1 + (P.radius[2] * (P.capWrist ?? 1) * (P.fl?.[2] ?? 1) + 0.04) / lobeLen, lobeT0 = 0.08, lobeTmin = -0.05;
  const margin = o.margin ?? 0.12;
  const cup = cupField(HEAD_SCULPT);
  const charts = [];
  // (round B4: a chart whose rect the layout leaves out — lod2's BODY_LAYOUT_LOD2 — is not made (−1): its skin goes where
  // its fallback would, the sockets' to the domes', the domes' to the head's or the body's)
  const add = (name, c) => { if (!L[name]) return -1; charts.push({ name, rect: L[name], ...(CHART_CROP[name] && !o.noCrop ? { crop: CHART_CROP[name] } : {}), ...c }); return charts.length - 1; };
  const cHead = add('head', { keep: 'outer', project: azimuthal([sC, yC, 0], [-1, 0, 0], [0, 1, 0], Math.PI * 0.56) });
  const sB1 = Math.max(4.25, sEnd) * HL;
  const cBodyL = add('bodyL', { keep: 'outer', project: halfCylinder(0.43 * HL, sB1, axisY, 1, { margin, arc }) });
  const cBodyR = add('bodyR', { keep: 'outer', project: halfCylinder(0.43 * HL, sB1, axisY, -1, { margin, arc }) });
  const ec = (s) => [E.s * HL, E.y * HL, E.z * HL * s];
  const cSockL = add('socketL', { project: azimuthal(ec(1), [-g[0], -g[1], -g[2]], [1, 0, 0], Math.PI * 0.75) });
  const cSockR = add('socketR', { project: azimuthal(ec(-1), [-g[0], -g[1], g[2]], [1, 0, 0], Math.PI * 0.75) });
  const domeMax = o.domeMax ?? 0.85;
  const cDomeL = add('domeL', { project: azimuthal(ec(1), [0, 1, 0.35], [-1, 0, 0], Math.PI * domeMax) });
  const cDomeR = add('domeR', { project: azimuthal(ec(-1), [0, 1, -0.35], [-1, 0, 0], Math.PI * domeMax) });
  const ls = o.lobeShare ?? 0.86;
  const cLobeL = add('lobeL', { wrapV: true, wrapShare: ls, project: limbPath(lobePts(1), [0, 0, 1], -lobeT0, lobeT1) });
  const cLobeR = add('lobeR', { wrapV: true, wrapShare: ls, project: limbPath(lobePts(-1), [0, 0, -1], -lobeT0, lobeT1) });
  // (B2's tail-end chart: no skin prefers it since round B3; its rect is a spare for the patch)
  add('tailCap', { keep: 'outer', project: azimuthal([4.10 * HL, axisY(4.10 * HL), 0], [1, 0, 0], [0, 1, 0], Math.PI * 0.55) });
  // the slit's walls flat on the plane of the closed mouth (s, z): the roof (facing down) and the floor (facing up)
  const gY = HEAD_SCULPT.gape.yFront * HL;
  const mouthF = { o: [0.20 * HL, gY, 0], e0: [1, 0, 0], e1: [0, 0, 1], out: [0, 1, 0] };
  const cMouthRoof = add('mouthRoof', { project: planar(mouthF, 0.42 * HL, 0.56 * HL) });
  const cMouthFloor = add('mouthFloor', { project: planar(mouthF, 0.42 * HL, 0.56 * HL) });
  // the gill pockets' walls flat on the flank (along y, along s): the flap's underside (facing in) and the body wall
  const sOp = marginCurve(HEAD_SCULPT.opercle.path);
  const gillF = (s) => ({ o: [1.0 * HL, 0.275 * HL, 0.33 * HL * s], e0: [0, 1, 0], e1: [1, 0, 0], out: [0, 0, s] });
  const cGillRoofL = add('gillRoofL', { project: planar(gillF(1), 0.30 * HL, 0.16 * HL) });
  const cGillFloorL = add('gillFloorL', { project: planar(gillF(1), 0.30 * HL, 0.16 * HL) });
  const cGillRoofR = add('gillRoofR', { project: planar(gillF(-1), 0.30 * HL, 0.16 * HL) });
  const cGillFloorR = add('gillFloorR', { project: planar(gillF(-1), 0.30 * HL, 0.16 * HL) });
  const cPatch = add('patch', { relay: true, project: pointChart(0, 0) });
  const cHidden = add('hidden', { hidden: true, project: pointChart(0.5, 0.5) });
  const index = Object.fromEntries(charts.map((c, i) => [c.name, i]));
  // where a chart's occluded triangles go (chartResolve): the eye's skin to the face's or the body's chart, the
  // socket's to the dome's, the lobe's to the body's; what the base charts cannot see to the patch
  const base = (cm) => (cm[0] < sC ? cHead : cm[2] >= 0 ? cBodyL : cBodyR);
  const fallback = (c, cm) => {
    if (c === cDomeL || c === cDomeR) return base(cm);
    if (c === cSockL) return cDomeL >= 0 ? cDomeL : base(cm);
    if (c === cSockR) return cDomeR >= 0 ? cDomeR : base(cm);
    // (the arm's own skin hidden behind more of it in its tube — the wrist's end, seen edge-on — to the patch: on the
    // body's chart, which keeps its outermost skin, it would stand over the flank and send the flank to the patch)
    if (c === cHidden) return cHidden;
    return cPatch;
  };

  const rIn = re + HEAD_SCULPT.cup.gap + HEAD_SCULPT.cup.thick * 0.6;
  const lobeR = Math.max(...P.radius) * 1.6;
  // (the arm's half-width along it, shoulder → elbow → wrist: the tube holds the arm's own skin, within 1.25× of it, and
  // not the flank round the shoulder, which the tube would see nearer than the arm's medial root and hide it)
  const tElbow = segL(P.shoulder, P.elbow) / lobeLen;
  const armHalf = (t) => (t <= tElbow ? P.radius[0] + (P.radius[1] - P.radius[0]) * Math.max(0, t) / tElbow : P.radius[1] + (P.radius[2] - P.radius[1]) * Math.min(1, (t - tElbow) / (1 - tElbow)));
  // the lobe's own surface: where the fish field's lobe part is nearer than the rest of the body (fishSDF parts: the
  // rig's share of the lobe, > 0.5), so the flank under the hanging lobe stays on the body
  const fishHL = o.field ?? fishSDFmm(HL, K).hl;
  const isLowerLip = gapeSide(HEAD_SCULPT), GP = HEAD_SCULPT.gape;
  const lipY = (x) => GP.yFront + (GP.yBack - GP.yFront) * smoothstep(0.03, GP.rictus, x);
  const lobeShareAt = (q) => {
    const pp = fishHL.parts(q[0], q[1], q[2]);
    return smoothstep(-P.blend, P.blend, pp.noLobe - pp.lobe);
  };
  const eyeR = o.eyeReach ?? 0.10;
  // where a point lies along a lobe (HL, side ±1): { t (share of the shoulder → wrist length), r }
  const along = (q, s) => {
    const pts = [side3(P.shoulder, s), side3(P.elbow, s), side3(P.wrist, s)];
    let best = { t: 0, r: Infinity }, acc = 0;
    for (let i = 0; i < 2; i++) {
      const a = pts[i], b = pts[i + 1], ab = vec.sub(b, a), l = Math.hypot(...ab);
      let t = vec.dot(vec.sub(q, a), ab) / (l * l);
      if (i === 0) t = Math.min(t, 1); else t = Math.max(t, 0);
      const r = Math.hypot(...vec.sub(q, vec.add(a, vec.scale(ab, t))));
      if (r < best.r) best = { t: (acc + t * l) / lobeLen, r };
      acc += l;
    }
    return best;
  };
  const prefer = (p, n, v) => {
    const q = [p[0] / HL, p[1] / HL, p[2] / HL];
    // the eyes: the socket's lining faces the globe; round it (the dome above the rim, the cup's outside, the collar
    // down to its underside in the infraorbital crease) the skin facing away from the globe's centre
    for (const s of [1, -1]) {
      const c = [E.s, E.y, E.z * s], d = vec.sub(q, c), r = Math.hypot(...d);
      if (r < rIn && vec.dot(n, d) / r < -0.15) { const k = s > 0 ? cSockL : cSockR; if (k >= 0) return k; }
    }
    const s = q[2] >= 0 ? 1 : -1, c = [E.s, E.y, E.z * s], d = vec.sub(q, c), r = Math.hypot(...d);
    if (r < re + eyeR && vec.dot(n, d) > 0.2 * r) { const k = s > 0 ? cDomeL : cDomeR; if (k >= 0) return k; }
    // (the slit's walls and the pockets' as they face each other; their rounded ends, edge-on in those projections,
    // stay with the outer skin's charts, or the patch where those cannot see them)
    if (o.interior?.mouth?.[v] && Math.abs(n[1]) > 0.45 && cMouthRoof >= 0) return n[1] < 0 ? cMouthRoof : cMouthFloor;
    // (hero: the lips' margins, the upper lip's underside and the lower lip's top within `lipBand` of the closed mouth's
    // line, face down / up onto the slit's plane as its walls do: they go with the walls, whose planar projection sees
    // them from below / above; from inside the head the face's chart sees each behind the other lip, and B1 laid them
    // in the patch as a red line along both lips)
    if (o.interior?.mouth && cMouthRoof >= 0 && q[0] < LIP.s && Math.abs(n[1]) > LIP.ny && Math.abs(q[1] - lipY(q[0])) < LIP.band) {
      const lower = isLowerLip(q[0], q[1], fishHL.head.parts(q[0], q[1], q[2]));
      if (!lower && n[1] < 0) return cMouthRoof;
      if (lower && n[1] > 0) return cMouthFloor;
    }
    if (o.interior?.gill?.[v] && cGillRoofL >= 0 && Math.abs(n[2]) > 0.45) return n[2] * s < 0 ? (s > 0 ? cGillRoofL : cGillRoofR) : (s > 0 ? cGillFloorL : cGillFloorR);
    if (q[0] > 0.95 && q[0] < 1.8 && q[1] < 0.5) {
      const a = along(q, s);
      // (from the shoulder on: the root's band, where the arm turns into the flank, is the arm's; B1 left t < 0.06 on the
      // body, where the flank in front of it hid it, and its crop cut t < 0.10: a ring of patch round every root)
      if (a.t >= lobeTmin && a.r < Math.min(lobeR, 1.25 * armHalf(a.t) + 0.01) && lobeShareAt(q) > 0.5) return s > 0 ? cLobeL : cLobeR;
    }
    // (the tail's end: the body halves' since round B3, see sEnd; the tailCap rect is left to the patch, SPARE_CHARTS)
    if (p[0] < sC) return cHead;
    return s > 0 ? cBodyL : cBodyR;
  };
  // a triangle whose centroid lies inside a resting globe (the cap that closes the skin there) is never seen
  const forceTri = (cm) => {
    for (const s of [1, -1]) {
      const r = Math.hypot(cm[0] - EYE_MM.center[0], cm[1] - EYE_MM.center[1], cm[2] - EYE_MM.center[2] * s);
      if (r < EYE_MM.radius - 0.008 * HL) return cHidden;
    }
    return -1;
  };
  return { charts, prefer, index, forceTri, fallback, axisY, sOp };
}

/** The mesh with only the triangles `keep(t)` accepts, its vertices compacted (`source`: new vertex → old). */
export function filterTriangles(mesh, keep) {
  const n = mesh.position.length / 3, remap = new Int32Array(n).fill(-1), tris = [];
  let m = 0;
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    if (!keep(t)) continue;
    for (let k = 0; k < 3; k++) { const v = mesh.indices[t * 3 + k]; if (remap[v] < 0) remap[v] = m++; tris.push(remap[v]); }
  }
  const source = new Uint32Array(m), position = new Float32Array(m * 3), normal = new Float32Array(m * 3);
  for (let v = 0; v < n; v++) {
    const j = remap[v];
    if (j < 0) continue;
    source[j] = v;
    position.set(mesh.position.subarray(v * 3, v * 3 + 3), j * 3);
    normal.set(mesh.normal.subarray(v * 3, v * 3 + 3), j * 3);
  }
  return { position, normal, indices: Uint32Array.from(tris), source };
}

/** Only the largest edge-connected component (the surface nets also mesh closed bubbles inside the sculpt, such as the
 * mouth cavity behind the closed slit: never seen, but they cost triangles and fold the UV charts). */
export function keepLargestComponent(mesh) {
  const n = mesh.position.length / 3, parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const I = mesh.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const count = new Map();
  for (let t = 0; t < I.length; t += 3) { const r = find(I[t]); count.set(r, (count.get(r) ?? 0) + 1); }
  let best = -1, bestN = -1;
  for (const [r, c] of count) if (c > bestN) { best = r; bestN = c; }
  const out = filterTriangles(mesh, (t) => find(I[t * 3]) === best);
  out.dropped = I.length / 3 - bestN;
  return out;
}

/** Without the triangles lying wholly inside a resting eye globe (more than `margin` HL under its surface): the globe
 * mesh covers them, the head rig gives them the eye joint alone, and the blink keeps them inside the lowered globe. */
export function pruneInsideGlobes(mesh, { margin = 0.004 } = {}) {
  const r = EYE_MM.radius - margin * HL, c = EYE_MM.center, P = mesh.position, I = mesh.indices;
  const inside = (v) => {
    const x = P[v * 3] - c[0], y = P[v * 3 + 1] - c[1], z = Math.abs(P[v * 3 + 2]) - c[2];
    return x * x + y * y + z * z < r * r;
  };
  const out = filterTriangles(mesh, (t) => !(inside(I[t * 3]) && inside(I[t * 3 + 1]) && inside(I[t * 3 + 2])));
  out.pruned = I.length / 3 - out.indices.length / 3;
  return out;
}

/**
 * Split every vertex where the surface touches itself (its triangles form more than one fan through its edges, as
 * where a pruned hole's rim runs through one vertex twice): one copy per fan, so each boundary is a simple loop and
 * the skin is a manifold at its vertices too. The copies keep the vertex's normal and source, and (round B4) lie
 * `apart` mm apart (each copy and the original eased into its own sheet's solid), so they do not share a position.
 */
export function splitPinches(mesh, { field = null, h = 0, apart = 0 } = {}) {
  const I = Uint32Array.from(mesh.indices), P = mesh.position, nv = P.length / 3, nt = I.length / 3;
  const vt = Array.from({ length: nv }, () => []);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) vt[I[t * 3 + k]].push(t);
  // (with the field: an edge shared by four triangles (two sheets touching along it, where the cells could not part
  // them) joins only the two pairs that bound the same solid wedge, so each sheet keeps its own copy of the edge)
  const pairOf = new Map();
  let nmSplit = 0;
  if (field) {
    const ek = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
    const E = new Map();
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const q = ek(I[t * 3 + k], I[t * 3 + (k + 1) % 3]); let l = E.get(q); if (!l) E.set(q, (l = [])); l.push(t); }
    for (const [q, ts] of E) {
      if (ts.length !== 4) continue;
      const a = Math.floor(q / 4194304), b = q % 4194304;
      const A = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], B = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]];
      const e = vec.norm(vec.sub(B, A)), m = vec.scale(vec.add(A, B), 0.5);
      const x0 = vec.norm(Math.abs(e[0]) < 0.9 ? vec.cross(e, [1, 0, 0]) : vec.cross(e, [0, 1, 0])), y0 = vec.cross(e, x0);
      const ang = ts.map((t) => {
        let c = 0;
        for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; if (v !== a && v !== b) c = v; }
        const d = vec.sub([P[c * 3], P[c * 3 + 1], P[c * 3 + 2]], A), u = vec.sub(d, vec.scale(e, vec.dot(d, e)));
        return [Math.atan2(vec.dot(u, y0), vec.dot(u, x0)), t];
      }).sort((p, r) => p[0] - r[0]);
      const solid = (i) => {
        const a0 = ang[i][0], a1 = ang[(i + 1) % 4][0] + (i === 3 ? Math.PI * 2 : 0), am = (a0 + a1) / 2, dl = Math.max(h * 0.3, 1e-3);
        const p = vec.add(m, vec.add(vec.scale(x0, Math.cos(am) * dl), vec.scale(y0, Math.sin(am) * dl)));
        return field(p[0], p[1], p[2]) < 0;
      };
      const pairs = solid(0) ? [[0, 1], [2, 3]] : [[1, 2], [3, 0]];
      for (const [i, j] of pairs) { pairOf.set(`${q}:${ang[i][1]}`, ang[j][1]); pairOf.set(`${q}:${ang[j][1]}`, ang[i][1]); }
      nmSplit++;
    }
  }
  const ek2 = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const extra = [];
  for (let v = 0; v < nv; v++) {
    const ts = vt[v];
    if (ts.length < 2) continue;
    // fans: triangles round v joined when they share an edge (v, w) (on a paired edge, only with their pair)
    const pa = new Map(ts.map((t) => [t, t]));
    const f = (a) => { while (pa.get(a) !== a) { pa.set(a, pa.get(pa.get(a))); a = pa.get(a); } return a; };
    const byW = new Map();
    for (const t of ts) for (let k = 0; k < 3; k++) {
      const w = I[t * 3 + k];
      if (w === v) continue;
      const q = ek2(v, w), pr = pairOf.get(`${q}:${t}`);
      if (pr !== undefined) { if (pa.has(pr)) { const a = f(pr), b = f(t); if (a !== b) pa.set(b, a); } continue; }
      const u = byW.get(w);
      if (u === undefined) byW.set(w, t); else { const a = f(u), b = f(t); if (a !== b) pa.set(b, a); }
    }
    const roots = [...new Set(ts.map(f))];
    if (roots.length < 2) continue;
    for (let r = 1; r < roots.length; r++) {
      const c = nv + extra.length;
      extra.push(v);
      for (const t of ts) if (f(t) === roots[r]) for (let k = 0; k < 3; k++) if (I[t * 3 + k] === v) I[t * 3 + k] = c;
    }
  }
  if (!extra.length) return { ...mesh, split: 0, nmSplit };
  const m = nv + extra.length;
  const position = new Float32Array(m * 3), normal = new Float32Array(m * 3);
  position.set(P); normal.set(mesh.normal);
  const source = mesh.source ? new Uint32Array(m) : null;
  if (source) source.set(mesh.source);
  extra.forEach((v, i) => {
    position.set(P.subarray(v * 3, v * 3 + 3), (nv + i) * 3);
    normal.set(mesh.normal.subarray(v * 3, v * 3 + 3), (nv + i) * 3);
    if (source) source[nv + i] = mesh.source[v];
  });
  // (round B4, tech P5: each copy of a split vertex, the original too, eased `apart` (mm) into its own sheet's solid,
  // along its fan's area normal: the parted sheets no longer share a point, so the skin is manifold welded by position
  // as by source — B3's lod1 had 2 non-manifold edges by position where its kept lining meets the skin at the cup front)
  if (apart > 0) {
    const fan = new Float64Array(m * 3), moved = new Uint8Array(m);
    extra.forEach((v, i) => { moved[v] = 1; moved[nv + i] = 1; });
    for (let t = 0; t < nt; t++) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      if (!moved[a] && !moved[b] && !moved[c]) continue;
      const u = [0, 1, 2].map((k) => position[b * 3 + k] - position[a * 3 + k]), w = [0, 1, 2].map((k) => position[c * 3 + k] - position[a * 3 + k]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      for (const x of [a, b, c]) if (moved[x]) for (let k = 0; k < 3; k++) fan[x * 3 + k] += n[k];
    }
    for (let x = 0; x < m; x++) {
      if (!moved[x]) continue;
      const l = Math.hypot(fan[x * 3], fan[x * 3 + 1], fan[x * 3 + 2]);
      if (l > 0) for (let k = 0; k < 3; k++) position[x * 3 + k] -= (apart * fan[x * 3 + k]) / l;
    }
  }
  return { position, normal, indices: I, source, split: extra.length, nmSplit };
}

/**
 * Close every hole of a mesh (its boundary loops: here the rims left inside each globe by pruneInsideGlobes) with a
 * fan from a new vertex at the loop's mean, wound against the loop's own edges. The new vertices take the source and
 * normal of the loop's first vertex. In place of nothing: returns a new mesh with `capVertices` (their indices).
 */
export function capHoles(mesh) {
  const I = mesh.indices, P = mesh.position, nv = P.length / 3;
  const E = new Set();
  const key = (a, b) => a * 4194304 + b;
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) E.add(key(I[t + k], I[t + (k + 1) % 3]));
  // boundary half-edges a → b (no b → a): the cap needs b → a
  const next = new Map();
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = I[t + k], b = I[t + (k + 1) % 3];
    if (!E.has(key(b, a))) { if (!next.has(a)) next.set(a, []); next.get(a).push(b); }
  }
  const loops = [], used = new Set();
  for (const [a0, outs] of next) {
    for (const b0 of outs) {
      if (used.has(key(a0, b0))) continue;
      const loop = [a0];
      let a = a0, b = b0, guard = 0;
      used.add(key(a, b));
      while (b !== a0 && guard++ < 1e6) {
        loop.push(b);
        const cand = (next.get(b) ?? []).filter((c) => !used.has(key(b, c)));
        if (!cand.length) break;
        a = b; b = cand[0]; used.add(key(a, b));
      }
      if (b === a0 && loop.length >= 3) loops.push(loop);
    }
  }
  const m = nv + loops.length;
  const position = new Float32Array(m * 3), normal = new Float32Array(m * 3);
  position.set(P); normal.set(mesh.normal);
  const source = mesh.source ? new Uint32Array(m) : null;
  if (source) source.set(mesh.source);
  const tris = Array.from(I), capVertices = [];
  loops.forEach((loop, i) => {
    const c = nv + i, mean = [0, 0, 0];
    for (const v of loop) for (let q = 0; q < 3; q++) mean[q] += P[v * 3 + q] / loop.length;
    position.set(mean, c * 3);
    normal.set(mesh.normal.subarray(loop[0] * 3, loop[0] * 3 + 3), c * 3);
    if (source) source[c] = mesh.source[loop[0]];
    capVertices.push(c);
    for (let j = 0; j < loop.length; j++) { const a = loop[j], b = loop[(j + 1) % loop.length]; tris.push(b, a, c); }
  });
  return { position, normal, indices: Uint32Array.from(tris), source, capVertices, loops: loops.map((l) => l.length) };
}

/**
 * The whole fish's dense skin at a cell of h mm (fish frame mm): surface nets of the field, triangles wound with their
 * neighbours, nothing hidden inside the globes, only the outer skin (no inner bubbles), and the holes the globes
 * leave closed by a fan inside each globe (cap: false keeps them open), so the skin is one closed surface. `source`
 * maps each vertex to the raw surface-nets vertex (a cap's centre to its loop's first vertex).
 * @param o { h, field?: distance (mm; default the full sculpt), box?, cap?, log? }
 * @returns { position, normal, indices, source, field, stats: { turned, dropped, pruned, capped, capVertices } }
 */
export function fishDense({ h, field, box = BODY_BOX, cap = true, partSheets, log = () => {} }) {
  const f = field ?? fishSDFmm(HL);
  // (the sheets two surfaces make where they touch within a cell parted by the field when the field asks for it: the
  // lod1 field with the hero's lining, seal.mjs)
  partSheets ??= !!f.partSheets;
  const raw = surfaceNets(f, box, h, { log });
  const turned = fixWinding(raw.indices);
  // (the field may ask for a deeper margin: what lies within it under the globe's surface stays, e.g. the band the
  // hero's blink lays over the dome's front)
  const a = pruneInsideGlobes(raw, { margin: f.pruneMargin ?? 0.004 });
  const b = keepLargestComponent(a);
  let source = new Uint32Array(b.source.length);
  for (let i = 0; i < source.length; i++) source[i] = a.source[b.source[i]];
  let mesh = { position: b.position, normal: b.normal, indices: b.indices, source };
  let capped = [], capVertices = [], split = 0, nmSplit = 0;
  let dropped = b.dropped;
  if (cap) {
    // (a pinch can hold a few triangles that hang by one vertex: split off, they are dropped as bits)
    // (round B4: the parted sheets' copies eased apart only where the field parts sheets — lod1's kept lining —: the
    // hero's dense mesh, which the accepted head is meshed into, stays as it was; easing its 5 pinch copies 0.002 mm
    // changed which lip and gill-cover triangles its charts lay in the patch, 17.3 → 19.5 mm² of it in view)
    const sp = splitPinches(mesh, { field: partSheets ? f : null, h, apart: partSheets ? 0.002 : 0 });
    split = sp.split; nmSplit = sp.nmSplit;
    let sk = sp;
    if (split) {
      const k = keepLargestComponent(sp);
      const src = new Uint32Array(k.source.length);
      for (let i = 0; i < src.length; i++) src[i] = sp.source[k.source[i]];
      sk = { position: k.position, normal: k.normal, indices: k.indices, source: src };
      dropped += k.dropped;
    }
    const c = capHoles(sk);
    mesh = { position: c.position, normal: c.normal, indices: c.indices, source: c.source };
    capped = c.loops; capVertices = c.capVertices;
  }
  log(`dense h ${h}: ${mesh.position.length / 3} vertices, ${mesh.indices.length / 3} triangles (turned ${turned}, pruned ${a.pruned} inside the globes, dropped ${dropped} in bubbles and bits, ${nmSplit} edges of two touching sheets parted, ${split} vertices split, capped ${capped.length} holes of ${capped.join('/')} edges)`);
  return { ...mesh, field: f, stats: { turned, dropped, pruned: a.pruned, split, nmSplit, capped, capVertices } };
}

/**
 * Per-vertex classes of a dense mesh (fish mm) for the charts and the locks:
 *   mouth  on the gape slit's walls (hero: inside the sealed field by more than 0.003 HL, in front of s 0.5 HL)
 *   gill   in a gill pocket (inside the sealed field, near the opercle's margin)
 *   lips   the slit's lips: a vertex with an edge to the other side of the gape (headrig.gapeSide, the unsealed
 *          sculpt), in front of the rictus (s < 0.33 HL)
 *   gill split   an edge between the flap and the body wall inside the slit's band (headWeights' rule: the wall is
 *          deeper than gillSlit.depth under the upper head's field)
 *   cup    the cup–globe junction: re − 0.004 … re + 0.010 HL from a globe's centre, above the rim
 * @returns { mouth, gill, lock: Uint8Array per vertex, counts }
 */
export function denseClasses(dense, { interior = false, locks = [], ringSpacing = 0.45, liningSpacing = 0.3, K = BODY_SCULPT, log = () => {} } = {}) {
  const P = dense.position, I = dense.indices, nv = P.length / 3;
  const mouth = new Uint8Array(nv), gill = new Uint8Array(nv), lock = new Uint8Array(nv);
  const counts = { mouth: 0, gill: 0, lips: 0, gillSplit: 0, cup: 0 };
  const full = fishSDFmm(HL, K).hl;
  const head = full.head;
  const GS = HEAD_SCULPT.gillSlit, sOp = marginCurve(HEAD_SCULPT.opercle.path);
  if (interior) {
    // (the openings closed and nothing else: what lies inside that is the slit's walls and the pockets)
    const sealed = sealedFishSDFmm(HL, { K, minimal: true }).hl;
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3] / HL, y = P[v * 3 + 1] / HL, z = P[v * 3 + 2] / HL;
      if (x > 1.15 || y > 0.45) continue;
      const nearGill = y > GS.y0 - 0.03 && y < GS.y1 + 0.03 && Math.abs(x - sOp(y)) < 0.08;
      if (!nearGill && (x > 0.5 || y > 0.24)) continue;
      if (sealed(x, y, z) < -0.003) { if (nearGill) { gill[v] = 1; counts.gill++; } else { mouth[v] = 1; counts.mouth++; } }
    }
  }
  const edges = (fn) => {
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = I[t + k], b = I[t + (k + 1) % 3];
      fn(a, b);
    }
  };
  if (locks.includes('lips')) {
    const lower = new Int8Array(nv).fill(-1), isLower = gapeSide(HEAD_SCULPT);
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3] / HL, y = P[v * 3 + 1] / HL, z = P[v * 3 + 2] / HL;
      if (x > 0.36 || y > 0.25) continue;
      lower[v] = isLower(x, y, head.parts(x, y, z)) ? 1 : 0;
    }
    edges((a, b) => {
      if (lower[a] < 0 || lower[b] < 0 || lower[a] === lower[b]) return;
      if (P[a * 3] / HL > 0.33 && P[b * 3] / HL > 0.33) return;
      if (!lock[a]) counts.lips++; if (!lock[b]) counts.lips++;
      lock[a] = 1; lock[b] = 1;
    });
  }
  if (locks.includes('gill')) {
    // headWeights: in the slit's band, skin deeper than −gillSlit.depth under the upper head's field is the trunk's
    const wall = new Int8Array(nv).fill(-1);
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3] / HL, y = P[v * 3 + 1] / HL, z = P[v * 3 + 2] / HL;
      if (y < 0.165 || y > 0.385) continue;
      const behind = x - sOp(y);
      if (behind < -0.045 || behind > 0.02) continue;
      wall[v] = head.parts(x, y, z).f < -GS.depth ? 1 : 0;
    }
    edges((a, b) => {
      if (wall[a] < 0 || wall[b] < 0 || wall[a] === wall[b]) return;
      if (!lock[a]) counts.gillSplit++; if (!lock[b]) counts.gillSplit++;
      lock[a] = 1; lock[b] = 1;
    });
  }
  if (locks.includes('cup')) {
    const cup = cupField(HEAD_SCULPT), E = HEAD.eye, re = E.d / 2;
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3] / HL, y = P[v * 3 + 1] / HL, z = Math.abs(P[v * 3 + 2] / HL);
      const dx = x - E.s, dy = y - E.y, dz = z - E.z, r = Math.hypot(dx, dy, dz);
      if (r < re - 0.004 || r > re + 0.010) continue;
      if (dy <= cup.rimH(dx, dz)) continue;
      if (!lock[v]) counts.cup++;
      lock[v] = 1;
    }
  }
  if (locks.includes('lining')) {
    // (lod1 with the hero's lining, seal.mjs: the lid's rim, the lining inside it and the junction above, every vertex
    // within [re − 0.004, re + 0.03] of a globe's centre and no higher than 0.03 over the rim, thinned to one vertex per
    // `liningSpacing` mm cell, so the hood the blink swings over the lowered globe keeps its rings)
    const cup = cupField(HEAD_SCULPT), E = HEAD.eye, re = E.d / 2, sp = liningSpacing;
    const taken = new Set();
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3] / HL - E.s, y = P[v * 3 + 1] / HL - E.y, z = Math.abs(P[v * 3 + 2] / HL) - E.z, r = Math.hypot(x, y, z);
      if (r < re - 0.004 || r > re + 0.03 || y > cup.rimH(x, z) + 0.03) continue;
      const k = `${Math.floor(P[v * 3] / sp)},${Math.floor(P[v * 3 + 1] / sp)},${Math.floor(P[v * 3 + 2] / sp)}`;
      if (taken.has(k) || lock[v]) continue;
      taken.add(k); lock[v] = 1; counts.lining = (counts.lining ?? 0) + 1;
    }
  }
  if (locks.includes('cupRing')) {
    // (the coarse tiers: only the junction line itself, where an edge crosses the globe's sphere above the rim, one
    // vertex per `ringSpacing` mm along it, so the low-poly globe still meets the skin all round)
    const cup = cupField(HEAD_SCULPT), E = HEAD.eye, re = E.d / 2, sp = ringSpacing;
    const rr = (v) => { const x = P[v * 3] / HL - E.s, y = P[v * 3 + 1] / HL - E.y, z = Math.abs(P[v * 3 + 2] / HL) - E.z; return [Math.hypot(x, y, z), x, y, z]; };
    const taken = new Set();
    edges((a, b) => {
      const A = rr(a), B = rr(b);
      if ((A[0] < re) === (B[0] < re)) return;
      const o = A[0] >= re ? a : b, Q = A[0] >= re ? A : B;
      if (Q[2] <= cup.rimH(Q[1], Q[3])) return;
      const k = `${Math.floor(P[o * 3] / sp)},${Math.floor(P[o * 3 + 1] / sp)},${Math.floor(P[o * 3 + 2] / sp)}`;
      if (taken.has(k) || lock[o]) return;
      taken.add(k); lock[o] = 1; counts.cup++;
    });
  }
  log(`classes: mouth ${counts.mouth}, gill ${counts.gill}; locked lips ${counts.lips}, gill split ${counts.gillSplit}, cup junction ${counts.cup}${counts.lining ? `, lining ${counts.lining}` : ''}`);
  return { mouth, gill, lock, counts };
}

/**
 * A ring of dense vertices kept at each station of the axial chain (rig.mjs: every joint's pivot and the knot half way
 * to the next, from the rig's first trunk joint to the caudal base), so the far tier's long triangles cannot span a
 * bending joint: per station, the vertex nearest the station's plane in each of `n` sectors round the body's axis
 * (within `reach` mm of the plane; the arms excluded). Returns a Uint8Array lock per dense vertex.
 */
export function axialRings(dense, { n = 10, reach = null, stations = null, K = BODY_SCULPT, log = () => {} } = {}) {
  const P = dense.position, nv = P.length / 3, lock = new Uint8Array(nv);
  const st = stations ?? (AXIAL ? [...AXIAL.pivots, ...AXIAL.knots.filter((k) => k > AXIAL.pivots[0] && k < AXIAL.pivots[AXIAL.pivots.length - 1])].sort((a, b) => a - b) : null);
  if (!st) { log('axialRings: no stations (rig.mjs not loaded: await fishmesh.ready)'); return lock; }
  const prof = trunkProfile(K), Pc = K.pectoral, h = reach ?? 0.03 * HL;
  const best = new Map();
  for (let v = 0; v < nv; v++) {
    const s = P[v * 3] / HL;
    let k = -1, d = Infinity;
    for (let i = 0; i < st.length; i++) { const e = Math.abs(s - st[i]); if (e < d) { d = e; k = i; } }
    if (d * HL > h) continue;
    // (not on the arms: their skin is not the trunk's section)
    const z = Math.abs(P[v * 3 + 2] / HL), y = P[v * 3 + 1] / HL;
    if (s > 0.95 && s < 1.8 && z > prof.at(Math.max(1.05, Math.min(s, 4.3))).w + 0.04) continue;
    const yc = prof.at(Math.max(1.05, Math.min(st[k], 4.3))).yc, ph = Math.atan2(P[v * 3 + 2] / HL, -(y - yc));
    const sec = Math.min(n - 1, Math.floor(((ph + Math.PI) / (2 * Math.PI)) * n)), key = k * 64 + sec;
    const b = best.get(key);
    if (!b || d < b[1]) best.set(key, [v, d]);
  }
  for (const [v] of best.values()) lock[v] = 1;
  log(`axial rings: ${st.length} stations × ${n} sectors → ${best.size} vertices kept`);
  return lock;
}

/**
 * The body's render mesh for a tier.
 * @param tierName 'hero' | 'lod1' | 'lod2' (or a tier spec { h, field, regions | target, simplifyFirst, locks })
 * @param o { dense (the tier's fishDense result, if the caller already has it: the rig's data are per its vertices),
 *          extraAttrs: { data: Float32Array(nDense·k), weights: number[k] } (e.g. the head morphs' displacements,
 *          scaled to about 1 per 0.01 HL), lock: Uint8Array(nDense) (more vertices to keep), K, layout, log }
 * @returns tiers.tierMesh's result (fish mm; `source` → the dense vertex, `region` per triangle: 0 head, 1 trunk) with
 *   { dense, charted, charts, layout, tier, classes }
 */
export function bodyTierMesh(tierName, o = {}, K0 = BODY_SCULPT) {
  // (the older form bodyTierMesh({ h, target, permissive, log }, K))
  if (typeof tierName === 'object' && tierName.field === undefined) return bodyTierMesh({ h: tierName.h, field: 'full', target: tierName.target, simplifyFirst: !!tierName.permissive, tex: 2048 }, { log: tierName.log }, o && o.trunk ? o : K0);
  const T = typeof tierName === 'string' ? TIERS[tierName] : tierName;
  if (!T) throw new Error(`bodyTierMesh: unknown tier ${tierName}`);
  const K = o.K ?? K0, log = o.log ?? (() => {});
  const field = typeof T.field === 'function' ? T.field : tierField(T, K);
  const dense = o.dense ?? fishDense({ h: T.h, field, log });
  const nD = dense.position.length / 3;
  if (o.extraAttrs && o.extraAttrs.data.length !== nD * o.extraAttrs.weights.length) throw new Error('bodyTierMesh: extraAttrs do not match the dense mesh');
  const classes = denseClasses(dense, { interior: T.field === 'full', locks: T.locks ?? [], K, log });
  if (T.axialRings) {
    const r = axialRings(dense, { ...T.axialRings, K, log });
    for (let v = 0; v < nD; v++) if (r[v]) classes.lock[v] = 1;
  }
  // (the axial chain's hat functions, one per station, as simplifier attributes: a triangle across a station cannot
  // carry its kink, so the far tier keeps vertices along every station instead of long triangles across them)
  let extraAttrs = o.extraAttrs;
  if (T.axialAttrs && AXIAL) {
    const st = [...AXIAL.pivots, ...AXIAL.knots.filter((k) => k > AXIAL.pivots[0] && k < AXIAL.pivots[AXIAL.pivots.length - 1])].sort((a, b) => a - b);
    const k0 = extraAttrs ? extraAttrs.weights.length : 0, k = k0 + st.length, data = new Float32Array(nD * k), Pd = dense.position;
    for (let v = 0; v < nD; v++) {
      if (k0) for (let j = 0; j < k0; j++) data[v * k + j] = extraAttrs.data[v * k0 + j];
      const sv = Pd[v * 3] / HL;
      for (let i = 0; i < st.length; i++) {
        const a = i > 0 ? st[i - 1] : st[i] - 0.3, b = i + 1 < st.length ? st[i + 1] : st[i] + 0.3;
        data[v * k + k0 + i] = sv <= st[i] ? Math.max(0, (sv - a) / (st[i] - a)) : Math.max(0, (b - sv) / (b - st[i]));
      }
    }
    extraAttrs = { data, weights: [...(extraAttrs?.weights ?? []), ...new Array(st.length).fill(T.axialAttrs)] };
  }
  const lockDense = new Uint8Array(nD);
  lockDense.set(classes.lock);
  if (o.lock) for (let v = 0; v < nD; v++) if (o.lock[v]) lockDense[v] = 1;
  // (the ends of the dense mesh's non-manifold edges (the hero's, where two sheets touch along a cell: none on the
  // sealed tiers) stay, so the simplification keeps those edges as they are and makes no new ones round them)
  {
    const E = new Map(), I = dense.indices, key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const q = key(I[t + k], I[t + (k + 1) % 3]); E.set(q, (E.get(q) ?? 0) + 1); }
    let nm = 0;
    const ends = new Set();
    for (const [q, c] of E) if (c > 2) { ends.add(Math.floor(q / 4194304)); ends.add(q % 4194304); nm++; }
    // (and their neighbours: a collapse next to such an edge can make another)
    if (nm) for (let t = 0; t < I.length; t += 3) if (ends.has(I[t]) || ends.has(I[t + 1]) || ends.has(I[t + 2])) { lockDense[I[t]] = 1; lockDense[I[t + 1]] = 1; lockDense[I[t + 2]] = 1; }
    if (nm) log(`locked the ends of ${nm} non-manifold edges and their neighbours`);
    // (and the vertices fishDense split — a pinch, or two touching sheets parted (partSheets): copies at one place
    // with one raw source — with their neighbours, so the simplification keeps the parting as it is)
    if (dense.source && (dense.stats?.split || dense.stats?.nmSplit)) {
      const seen = new Map(), dup = new Uint8Array(nD), capC = new Set(dense.stats.capVertices ?? []);
      for (let v = 0; v < nD; v++) { if (capC.has(v)) continue; const s = dense.source[v], u = seen.get(s); if (u === undefined) seen.set(s, v); else { dup[u] = 1; dup[v] = 1; } }
      let nd = 0;
      for (let t = 0; t < I.length; t += 3) if (dup[I[t]] || dup[I[t + 1]] || dup[I[t + 2]]) { lockDense[I[t]] = 1; lockDense[I[t + 1]] = 1; lockDense[I[t + 2]] = 1; nd++; }
      if (nd) log(`locked the split vertices and their ${nd} triangles`);
    }
  }
  const B = bodyCharts(K, { layout: o.layout ?? T.layout, interior: classes, margin: T.margin ?? (T.simplifyFirst ? 0.35 : 0.12), lobeShare: T.lobeShare });
  const { charts, prefer, index, forceTri, fallback } = B;
  const lobes = new Set([index.lobeL, index.lobeR]);
  const regions = T.regions
    ? [{ name: 'head', target: T.regions.head, flags: T.headFlags ?? [], select: (c, ch) => c[0] < S_HEAD * HL && !lobes.has(ch) }, { name: 'trunk', target: T.regions.trunk, flags: T.trunkFlags ?? ['Regularize'] }]
    : [{ name: 'all', target: T.target, flags: T.flags ?? [] }];
  const tex = T.tex ?? 2048;
  const res = tierMesh(field, BODY_BOX, {
    h: T.h, dense, charts, prefer: T.simplifyFirst ? (p, n) => prefer(p, n, -1) : prefer, forceTri, regions,
    // (the far tier: what the simplification leaves inside the globes refilled as one fan per junction ring)
    refill: T.simplifyFirst ? (c) => forceTri(c) >= 0 : undefined,
    extraAttrs, lockDense, simplifyFirst: !!T.simplifyFirst, uvWeight: T.uvWeight, normalWeight: T.normalWeight,
    // (the depth test at the tier's texture size; a surface counts as behind another past a quarter of the cell)
    resolve: { size: tex, eps: 0.25 * T.h, share: 0.25, fallback },
    denseRepair: T.denseRepair ?? { close: 3, ring: 0, minIsland: 0 },
    // (the patch's islands at the charts' density, 0.0019 HL per texel at 2048; 2 texels apart at the tier's size)
    repair: T.noRepair ? false : { density: 1 / (0.0019 * HL * 2048), pad: (T.pad ?? 4) / tex, close: T.repairClose ?? 6, ring: T.repairRing ?? 0, minIsland: T.minIsland ?? 4, spare: SPARE_CHARTS, overlap: { size: tex, eps: T.overlapEps ?? 0.01, share: T.overlapShare ?? 0.1 }, ...(T.bleed === false ? {} : { bleed: { size: tex, gap: T.bleedGap ?? 3, mm: T.bleedMM ?? 0.3 } }) }, log,
  });
  return { ...res, charts, layout: o.layout ?? T.layout ?? BODY_LAYOUT, tier: T, classes, chartIndex: index };
}

/**
 * The head morphs' displacements as extra simplifier attributes for bodyTierMesh: each displacement (fish mm, n·3 per
 * dense vertex) in units of 0.01 HL, weight 0.25 per component. (Proxy morphs on the hero, shots-uv.mjs morphs: the jaw
 * dropped 20°, the cups lowered 0.08 HL, the cheeks swollen 0.04 HL; the posed dense mesh against the posed hero, max
 * distance without → with: 0.023 → 0.009 mm, 0.068 → 0.014 mm, 0.044 → 0.014 mm; the rest pose unchanged, 0.042 mm.)
 */
export function morphAttrs(deltas, { weight = 0.25, unit = 0.01 * HL } = {}) {
  const k = deltas.length * 3, n = deltas[0].length / 3, data = new Float32Array(n * k);
  deltas.forEach((d, j) => { for (let v = 0; v < n; v++) for (let q = 0; q < 3; q++) data[v * k + j * 3 + q] = d[v * 3 + q] / unit; });
  // (weight: one for all, or one per displacement)
  return { data, weights: deltas.flatMap((_, j) => new Array(3).fill(Array.isArray(weight) ? weight[j] : weight)) };
}

/** morphAttrs with the tier's weights per shape (TIERS[tier].morphWeights; 0.25 for a shape it does not list):
 * names[i] is the shape of deltas[i]. lod1 weighs its blinks 2 (the lid's hood keeps its rings: B1's 0.25 let it crumple
 * when the carried blink closed it). */
export function tierMorphAttrs(tierName, names, deltas, o = {}) {
  const W = TIERS[tierName]?.morphWeights ?? {};
  return morphAttrs(deltas, { ...o, weight: names.map((k) => W[k] ?? 0.25) });
}

/** A layout rect [x0, y0, x1, y1] as [u, v, w, h] (the goby consumers' irisRect form). */
export const rectUVWH = (r) => [r[0], r[1], r[2] - r[0], r[3] - r[1]];

/** The eye mesh's UVs on the body texture (eye.mjs eyeGlobe's uv: u = φ / 2π, v = ρ / 2 with the window at v ≤ 0.5):
 * the window into the iris rect, the skin into the eye-skin rect, each linearly. */
export function eyeAtlasUV(uv, layout = BODY_LAYOUT) {
  const out = new Float32Array(uv.length), I = layout.iris, S = layout.eyeSkin;
  for (let i = 0; i < uv.length / 2; i++) {
    const u = uv[i * 2], v = uv[i * 2 + 1], R = v <= 0.5 ? I : S, t = v <= 0.5 ? v / 0.5 : (v - 0.5) / 0.5;
    out[i * 2] = R[0] + u * (R[2] - R[0]);
    out[i * 2 + 1] = R[1] + t * (R[3] - R[1]);
  }
  return out;
}
