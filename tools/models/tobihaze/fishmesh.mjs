// The whole fish's skin as a render mesh per tier: the sculpt meshed at the tier's cell size (one closed manifold
// skin: fishDense), split into UV charts (charts.mjs) and simplified region by region to the tier's triangle targets
// (tiers.mjs). Every tier vertex is a vertex of the tier's dense mesh (`source`), so the rig and the morphs computed
// on the dense mesh carry over exactly.
//
// Tiers (TIERS): hero  the full sculpt at h 0.09 mm (the cell the head rig was validated at), head 45 000 + trunk
//                      31 000 triangles, the slit's lips, the gill flap/wall split and the cup–globe junction locked
//                lod1  the sealed sculpt (seal.mjs: no slit, no gill pocket) at h 0.16 mm, head 4 600 + trunk 3 900
//                lod2  the far sculpt at h 0.40 mm, simplified first to 1 000 triangles, then charted
// The head region is every triangle in front of s 1.32 HL but the pectoral lobes'; the trunk the rest. Their border is
// locked, so they meet without a crack.
//
// The body texture is square (2048² hero, 1024² lod1, 256² lod2); BODY_LAYOUT ([x0, y0, x1, y1], v down) sizes each
// chart for about 0.0019 HL (0.031 mm) of skin per texel at 2048 on the body and 0.0015 on the face (shots-uv.mjs
// tiers reports it per chart):
//   bodyL, bodyR   one side each of the body from s 0.43 HL to the tail's end, round from the ventral midline to the
//                  dorsal one by arc length (half cylinders, no wrap: the seams lie on the midlines, under the keels
//                  and fins)
//   head           the face, snout and the front of the eye turret, azimuthal about the forward axis
//   domeL, domeR   the skin round each eye globe facing away from its centre within 0.1 HL of the globe (the domes,
//                  their backs and medial lobes, the cup's outside, the collar down into the infraorbital crease:
//                  all of which fold in the head's chart), azimuthal from the globe's centre about the up-and-out axis
//   socketL, socketR  the cup's lining, facing the globe (it would overlap the cup's outside)
//   lobeL, lobeR   each pectoral arm (the fish field's lobe part, past 6 % of its length), a tube about the smoothed
//                  shoulder → elbow → wrist curve with a parallel-transported reference (seam on the medial side)
//   tailCap        the peduncle's rounded end, azimuthal about +s
//   mouthRoof, mouthFloor   (hero) the gape slit's walls, flat on the closed mouth's plane
//   gillRoofL/R, gillFloorL/R  (hero) each gill pocket's two walls, flat on the flank
//   patch          what no projection maps without a fold or an overlap (a pad's underside behind the lip, a pocket's
//                  rounded end, the pelvic base's front), laid flat region by region and packed (charts.repairFolds)
//   iris, eyeSkin  the eye meshes' window and skin (eyeAtlasUV): the eye is a separate mesh on the same texture
//   teeth          a swatch for the teeth's constant UV
//   hidden         one texel for the cap that closes the skin inside each globe (never seen)
// The charts are assigned per vertex, then a depth test in UV space from each projection's viewpoint moves what a
// chart sees behind another of its own surfaces to its fallback chart (charts.chartResolve), and repairFolds lays flat
// whatever still folds, before and after the simplification.
import { HL, HEAD, EYE_MM } from './anatomy.mjs';
import { HEAD_SCULPT, cupField } from './head.mjs';
import { BODY_SCULPT, fishSDFmm, trunkProfile } from './body.mjs';
import { azimuthal, halfCylinder, limbPath, planar, pointChart, vec } from './charts.mjs';
import { tierMesh, ready, meshTopology } from './tiers.mjs';
import { surfaceNets } from './mesher.mjs';
import { fixWinding, gapeSide, marginCurve } from './headrig.mjs';
import { smoothstep } from './sdf.mjs';
import { sealedFishSDFmm } from './seal.mjs';

export { ready, meshTopology };

/** The meshing box (fish mm): snout to the peduncle's end, the pectoral lobes and the eye domes inside. */
export const BODY_BOX = { min: [-0.08 * HL, -0.16 * HL, -0.62 * HL], max: [4.32 * HL, 0.85 * HL, 0.62 * HL] };

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
  iris: [0.796, 0.746, 0.946, 0.866],
  eyeSkin: [0.796, 0.876, 0.946, 0.996],
  patch: [0.41, 0.874, 0.786, 0.99],
};

/** The part [a0, b0, a1, b1] of each projection's unit square its rect holds (the rest is never used: the eye's
 * charts are discs the skin fills only part of, the lobe's runs past both ends of the arm). */
export const CHART_CROP = {
  socketL: [0.15, 0.42, 0.88, 1.0],
  socketR: [0.14, 0.0, 0.87, 0.58],
  domeL: [0.11, 0.20, 0.95, 0.97],
  domeR: [0.11, 0.03, 0.95, 0.80],
  lobeL: [0.12, 0, 0.94, 1],
  lobeR: [0.12, 0, 0.94, 1],
  tailCap: [0.10, 0.18, 0.90, 0.82],
  mouthRoof: [0.17, 0.17, 0.74, 0.83],
  mouthFloor: [0.17, 0.17, 0.74, 0.83],
  gillRoofL: [0.24, 0.55, 0.76, 0.82],
  gillFloorL: [0.24, 0.55, 0.76, 0.82],
  gillRoofR: [0.24, 0.55, 0.76, 0.82],
  gillFloorR: [0.24, 0.55, 0.76, 0.82],
};

/** The tiers' meshing and simplification. */
export const TIERS = {
  hero: { h: 0.09, field: 'full', regions: { head: 45000, trunk: 31000 }, locks: ['lips', 'gill', 'cup'], tex: 2048 },
  lod1: { h: 0.16, field: 'sealed', regions: { head: 4600, trunk: 3900 }, locks: ['cupRing'], tex: 1024 },
  lod2: { h: 0.40, field: 'far', target: 1000, simplifyFirst: true, tex: 256 },
};

/** The tier's field (fish mm, .hl in HL with .head / .parts / .cup). */
export function tierField(name, K = BODY_SCULPT) {
  const f = TIERS[name]?.field ?? name;
  return f === 'full' ? fishSDFmm(HL, K) : sealedFishSDFmm(HL, { K, far: f === 'far' });
}

const S_HEAD = 1.32, S_CHART = 0.45;
const memo = new Map();

/** The body halves' arc-length tables: per station s (HL) the share of the section's arc from the ventral midline up
 * to each angle, measured on the field (rays from the body's axis to where they first leave the skin). */
function sectionArcs(field, axisY, { s0 = 0.40, s1 = 4.30, ds = 0.05, na = 48 } = {}) {
  const ns = Math.round((s1 - s0) / ds) + 1, tab = new Float32Array(ns * (na + 1));
  for (let i = 0; i < ns; i++) {
    const s = (s0 + i * ds) * HL, yc = axisY(s);
    const pts = [];
    for (let j = 0; j <= na; j++) {
      const ph = (Math.PI * j) / na, dy = -Math.cos(ph), dz = Math.sin(ph);
      let r = 0, step = 0.012 * HL, inside = field(s, yc, 0) < 0;
      if (!inside) { pts.push([yc, 0]); continue; }
      while (r < HL && field(s, yc + dy * (r + step), dz * (r + step)) < 0) r += step;
      let lo = r, hi = r + step;
      for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (field(s, yc + dy * m, dz * m) < 0) lo = m; else hi = m; }
      pts.push([yc + dy * lo, dz * lo]);
    }
    let acc = 0;
    tab[i * (na + 1)] = 0;
    for (let j = 1; j <= na; j++) { acc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); tab[i * (na + 1) + j] = acc; }
    for (let j = 1; j <= na; j++) tab[i * (na + 1) + j] /= acc || 1;
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
  const key = JSON.stringify(K);
  if (!memo.has(key)) memo.set(key, sectionArcs(fishSDFmm(HL, K), axisY));
  const arc = memo.get(key);
  const E = HEAD.eye, re = E.d / 2, g = vec.norm(HEAD_SCULPT.cup.open);
  const P = K.pectoral, mm = (v) => v.map((c) => c * HL);
  const side3 = (v, s) => [v[0], v[1], v[2] * s];
  const lobePts = (s) => [mm(side3(P.shoulder, s)), mm(side3(P.elbow, s)), mm(side3(P.wrist, s))];
  const segL = (a, b) => Math.hypot(...vec.sub(b, a));
  const lobeLen = segL(P.shoulder, P.elbow) + segL(P.elbow, P.wrist);
  const lobeT1 = 1 + (P.radius[2] + 0.05) / lobeLen, lobeT0 = 0.05;
  const margin = o.margin ?? 0.12;
  const cup = cupField(HEAD_SCULPT);
  const charts = [];
  const add = (name, c) => { charts.push({ name, rect: L[name], ...(CHART_CROP[name] && !o.noCrop ? { crop: CHART_CROP[name] } : {}), ...c }); return charts.length - 1; };
  const cHead = add('head', { project: azimuthal([sC, yC, 0], [-1, 0, 0], [0, 1, 0], Math.PI * 0.56) });
  const cBodyL = add('bodyL', { project: halfCylinder(0.43 * HL, 4.25 * HL, axisY, 1, { margin, arc }) });
  const cBodyR = add('bodyR', { project: halfCylinder(0.43 * HL, 4.25 * HL, axisY, -1, { margin, arc }) });
  const ec = (s) => [E.s * HL, E.y * HL, E.z * HL * s];
  const cSockL = add('socketL', { project: azimuthal(ec(1), [-g[0], -g[1], -g[2]], [1, 0, 0], Math.PI * 0.75) });
  const cSockR = add('socketR', { project: azimuthal(ec(-1), [-g[0], -g[1], g[2]], [1, 0, 0], Math.PI * 0.75) });
  const domeMax = o.domeMax ?? 0.85;
  const cDomeL = add('domeL', { project: azimuthal(ec(1), [0, 1, 0.35], [-1, 0, 0], Math.PI * domeMax) });
  const cDomeR = add('domeR', { project: azimuthal(ec(-1), [0, 1, -0.35], [-1, 0, 0], Math.PI * domeMax) });
  const ls = o.lobeShare ?? 0.86;
  const cLobeL = add('lobeL', { wrapV: true, wrapShare: ls, project: limbPath(lobePts(1), [0, 0, 1], -lobeT0, lobeT1) });
  const cLobeR = add('lobeR', { wrapV: true, wrapShare: ls, project: limbPath(lobePts(-1), [0, 0, -1], -lobeT0, lobeT1) });
  const cTail = add('tailCap', { project: azimuthal([4.10 * HL, axisY(4.10 * HL), 0], [1, 0, 0], [0, 1, 0], Math.PI * 0.55) });
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
    if (c === cSockL) return cDomeL;
    if (c === cSockR) return cDomeR;
    if (c === cLobeL) return cBodyL;
    if (c === cLobeR) return cBodyR;
    if (c === cHidden) return cHidden;
    return cPatch;
  };

  const rIn = re + HEAD_SCULPT.cup.gap + HEAD_SCULPT.cup.thick * 0.6;
  const lobeR = Math.max(...P.radius) * 1.6;
  // the lobe's own surface: where the fish field's lobe part is nearer than the rest of the body (fishSDF parts: the
  // rig's share of the lobe, > 0.5), so the flank under the hanging lobe stays on the body
  const fishHL = o.field ?? fishSDFmm(HL, K).hl;
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
      if (r < rIn && vec.dot(n, d) / r < -0.15) return s > 0 ? cSockL : cSockR;
    }
    const s = q[2] >= 0 ? 1 : -1, c = [E.s, E.y, E.z * s], d = vec.sub(q, c), r = Math.hypot(...d);
    if (r < re + eyeR && vec.dot(n, d) > 0.2 * r) return s > 0 ? cDomeL : cDomeR;
    // (the slit's walls and the pockets' as they face each other; their rounded ends, edge-on in those projections,
    // stay with the outer skin's charts, or the patch where those cannot see them)
    if (o.interior?.mouth?.[v] && Math.abs(n[1]) > 0.45) return n[1] < 0 ? cMouthRoof : cMouthFloor;
    if (o.interior?.gill?.[v] && Math.abs(n[2]) > 0.45) return n[2] * s < 0 ? (s > 0 ? cGillRoofL : cGillRoofR) : (s > 0 ? cGillFloorL : cGillFloorR);
    if (q[0] > 0.95 && q[0] < 1.8 && q[1] < 0.5) {
      const a = along(q, s);
      if (a.t >= 0.06 && a.r < lobeR && lobeShareAt(q) > 0.5) return s > 0 ? cLobeL : cLobeR;
    }
    if (q[0] > 4.15) return cTail;
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
 * the skin is a manifold at its vertices too. The copies keep the vertex's position, normal and source.
 */
export function splitPinches(mesh, { field = null, h = 0 } = {}) {
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
export function fishDense({ h, field, box = BODY_BOX, cap = true, partSheets = false, log = () => {} }) {
  const f = field ?? fishSDFmm(HL);
  const raw = surfaceNets(f, box, h, { log });
  const turned = fixWinding(raw.indices);
  const a = pruneInsideGlobes(raw);
  const b = keepLargestComponent(a);
  let source = new Uint32Array(b.source.length);
  for (let i = 0; i < source.length; i++) source[i] = a.source[b.source[i]];
  let mesh = { position: b.position, normal: b.normal, indices: b.indices, source };
  let capped = [], capVertices = [], split = 0, nmSplit = 0;
  let dropped = b.dropped;
  if (cap) {
    // (a pinch can hold a few triangles that hang by one vertex: split off, they are dropped as bits)
    const sp = splitPinches(mesh, { field: partSheets ? f : null, h });
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
export function denseClasses(dense, { interior = false, locks = [], ringSpacing = 0.45, K = BODY_SCULPT, log = () => {} } = {}) {
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
  log(`classes: mouth ${counts.mouth}, gill ${counts.gill}; locked lips ${counts.lips}, gill split ${counts.gillSplit}, cup junction ${counts.cup}`);
  return { mouth, gill, lock, counts };
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
  const field = typeof T.field === 'function' ? T.field : tierField(T.field, K);
  const dense = o.dense ?? fishDense({ h: T.h, field, log });
  const nD = dense.position.length / 3;
  if (o.extraAttrs && o.extraAttrs.data.length !== nD * o.extraAttrs.weights.length) throw new Error('bodyTierMesh: extraAttrs do not match the dense mesh');
  const classes = denseClasses(dense, { interior: T.field === 'full', locks: T.locks ?? [], K, log });
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
  }
  const B = bodyCharts(K, { layout: o.layout, interior: classes, margin: T.simplifyFirst ? 0.35 : 0.12 });
  const { charts, prefer, index, forceTri, fallback } = B;
  const lobes = new Set([index.lobeL, index.lobeR]);
  const regions = T.regions
    ? [{ name: 'head', target: T.regions.head, flags: T.headFlags ?? [], select: (c, ch) => c[0] < S_HEAD * HL && !lobes.has(ch) }, { name: 'trunk', target: T.regions.trunk, flags: T.trunkFlags ?? ['Regularize'] }]
    : [{ name: 'all', target: T.target, flags: T.flags ?? [] }];
  const tex = T.tex ?? 2048;
  const res = tierMesh(field, BODY_BOX, {
    h: T.h, dense, charts, prefer: T.simplifyFirst ? (p, n) => prefer(p, n, -1) : prefer, forceTri, regions,
    extraAttrs: o.extraAttrs, lockDense, simplifyFirst: !!T.simplifyFirst,
    // (the depth test at the tier's texture size; a surface counts as behind another past a quarter of the cell)
    resolve: { size: tex, eps: 0.25 * T.h, share: 0.25, fallback },
    denseRepair: T.denseRepair ?? { ring: 0 },
    // (the patch's islands at the charts' density, 0.0019 HL per texel at 2048; 2 texels apart at the tier's size)
    repair: T.noRepair ? false : { density: 1 / (0.0019 * HL * 2048), pad: 2 / tex, ring: T.repairRing ?? 0, overlap: { size: tex, eps: 0.001 } }, log,
  });
  return { ...res, charts, layout: o.layout ?? BODY_LAYOUT, tier: T, classes, chartIndex: index };
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
  return { data, weights: new Array(k).fill(weight) };
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
