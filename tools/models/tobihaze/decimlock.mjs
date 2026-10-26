#!/usr/bin/env node
// The decimation lock (2026-10-25): lod1's and lod2's skin as round T3 (e6079e5) simplified it, held by the build
// outside the eye and the mouth (FREE_ZONES) whatever the head's sculpt does there. Each tier's skin is simplified region
// by region (tiers.mjs simplifyRegions: lod1 the head in front of s 1.32 HL and the trunk, lod2 the whole skin as one), so
// an edit to the eye or the lips alone re-tessellated the whole head region at lod1 and the whole fish at lod2 (the
// 9977d95 rebuild: 561 lod1 triangles changed outside the eye and the mouth, s 5.5–21.3 mm, and 188 at lod2 down to the
// tail). With the lock, tiers.mjs (frozenPlan) keeps every T3 triangle that lies outside the zones on dense skin the sculpt
// did not change (its corners found at the same place in the new dense mesh, no changed dense cell under it) as it was —
// its vertices locked — and simplifies only the rest: the new dense triangles of the zones, joined to the kept ones by
// a fan along each kept edge, to T3's triangle count there. The new tier's vertices outside the zones are T3's (exactly, but
// those next to the zones found within MOVE_TOL_MM, round 2).
// Stored per tier (lod1, lod2): T3's skin triangles (fish mm), each one's atlas chart (by its UV's rect: the chart the
// charted simplification gives its corners, lod1), each one's corner UVs as T3's GLB holds them (2026-10-26), and the
// dense mesh's cells (CELL_MM) each with a hash of the dense vertices in it, so the build knows where the sculpt changed
// even outside the zones.
// 2026-10-26 (the regression review of the lock's first build): the held triangles keep T3's atlas as well as its
// places — tiers.restoreHeld puts each on its corner UVs in T3's chart and charts.repairFolds keeps them as they are,
// packing what it lays round T3's patch islands. The first build had taken each corner's first copy in the chart:
// across a wrapping chart's seam (the pectoral lobes) the wrong one, so the lobes' triangles folded over the rect, the
// overlap test failed the lobes round them, and the repair laid 817 triangles in the patch at 0.78 of the density (T3
// 162 at 1.00), the arm's 420 among them (texels 18 → 12.8 a mm), and the seams outside the zones grew 215.5 → 295 mm.
// Now: every held triangle on T3's UVs (outside the zones the atlas is T3's to the texel), the repair 62 at 1.00 in the
// zones, the seams outside them 216 mm. FOCUS: lod1's median lip simplified to a finer error than the rest of the free
// part (tiers.simplifyRegions), so lod1 keeps the hero's lip on the front views.
// 2026-10-26, round 2 (the reviews of round 1): (a) the focus kept out of the patch — its fine triangles at the notch
// where the median lip meets the pad folded in the head chart and went to the patch as islands of 4–9 triangles, which
// the bake bled dark (the "sawtooth" along the pad's top on lod1's front view); tiers.tierMesh now leaves the focus off
// round any of its triangles the repair lays in the patch and simplifies again (none left on the base, geoA2 and geoB2
// heads). (b) The fringe (FRINGE_MM, MOVE_TOL_MM): the lock keeps the dense vertices next to the zones, so skin the
// zones' sculpt moved by less than 0.01 mm there counts as unchanged — lod1 holds 63 more of T3's triangles at s 6–9 mm
// and lod2 the big ones out to s 12 (round 1 put a new vertex 0.235 mm off T3's skin at fish [10.91, −0.11, −3.40]).
// (c) FLOOR: lod2's chin no lower than T3's (its contact had sunk 0.14 mm into the ground).
// 2026-10-26, round 3 (the reviews of round 2): FOCUS_PARTS — lod1's focus in parts, each at its own error, and shaped by
// the head's own pad (the median lip finer, the pad's top held to the hero's outline: the front views' upper lip and
// the pad's h/l at u1 on whichever head the mouth keys give) —; FAIR — lod1's cup lip faired before the simplification
// (the saw teeth along it in clay were the dense mesh's staircase). Both act in the zones only: outside them the lock
// holds T3's triangles and UVs as before.
//   node tools/models/tobihaze/decimlock.mjs --from-git e6079e5 --dense-tree <a checkout of the same commit's tools/>
//   node tools/models/tobihaze/decimlock.mjs --from-dir <dir with tobihaze.{lod1,lod2}.glb> [--dense-tree <dir>]
// (--dense-tree: the tree whose fishmesh.mjs meshes the dense skin the GLBs were simplified from; default this tree. build.mjs
// reads tools/models/tobihaze/decimationlock.json by default, --decimation-lock <file> another, --no-decimation-lock
// simplifies afresh: do that, and write a new lock from the result, only when the body itself is meant to change)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { S0, HL, HEAD, toObject } from './anatomy.mjs';
import { HEAD_SCULPT, cupField } from './head.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DECIMATION_LOCK_FILE = path.join(here, 'decimationlock.json');
/** The tiers the lock holds. */
export const LOCKED_TIERS = ['lod1', 'lod2'];
/** The dense cells' size (mm) for the change test. */
export const CELL_MM = 1;
/** The eye and the mouth (fish mm: s back from the snout, y up from the head's floor, z to the left), the parts the lock
 * leaves to the build: a triangle whose centroid lies in one is simplified afresh. The eye: the turret, the hood over the
 * globe, the cup and its fold, the collar (the globes at s 5.32, y 10.33, |z| 1.71, radius 1.67); the mouth: the snout's
 * lips, the gape's corner and the jaw's front under the eyes. The 9977d95 sculpt's changes all lie inside the tighter
 * boxes s 1.5–9.5, y ≥ 7, |z| ≤ 5 and s ≤ 5.5, y ≤ 7 (lod1 and lod2 dense meshes against T3's); these are 1 mm wider. */
export const FREE_ZONES = [
  { name: 'eye', s: [0.5, 10.5], y: [6.0, Infinity], z: 6.0 },
  { name: 'mouth', s: [-Infinity, 6.5], y: [-Infinity, 7.0], z: Infinity },
];
export const inFreeZone = ([s, y, z]) => FREE_ZONES.some((Z) => s >= Z.s[0] && s <= Z.s[1] && y >= Z.y[0] && y <= Z.y[1] && Math.abs(z) <= Z.z);
/** (2026-10-26) The part of a free zone a tier simplifies to a finer error than the rest (tiers.simplifyRegions' focus;
 * HL, fish frame; per tier): lod1's median lip, the thin roll across the snout's front over the lower jaw — at the free
 * part's own error (T3's count there) lod1 flattened it, the upper lip on the front views' midline 26.4 / 21.3 px
 * against the hero's 33.9 / 30.9 (the mouth review's own_full metric at the in-game front camera, head elevation −9°,
 * and u5's, +1°; lod1's dense mesh 33.3 / 29.2), the dense lip 0.043 mm off on average; at 1e-3 (meshopt's error, of
 * the mesh's extent) 34.2 / 30.2 and 0.019 mm, for 79 triangles more. The box reaches over the snout above the lip (y
 * to 0.19), so its top edge, where the finer focus meets the coarser rest, lies on smooth skin; it stops short of the
 * pad's sides (|z| 0.10): there the mouth line's finer triangles folded under the inflation (26 new folds against
 * 11) and the gape stretched more of them (72 over 3× against 48), for no gain on the front views. (Round 2) `also`: the
 * pad's top over the snout's front (s < 0.16, y 0.09–0.13, |z| < 0.14 HL), the notch where the median lip meets the pad
 * included — the mouth review asked for it on lod1's front view; with it the focus's notch triangles no longer fold
 * into the patch (one simplification pass, no retry) and lod1's gapes stretch fewer triangles than round 1's (gapeHalf
 * 59 / gapeFull 66 over 3× against 62 / 68; inflated 6 new folds, T3's 6; |z| < 0.16 made it 8). */
// (2026-10-26, round 3: the focus in parts, each at its own error — FOCUS_PARTS below)
export const FOCUS = {
  lod1: { label: 'the median lip', error: 1e-3, s: [-Infinity, 0.25], y: [0.03, 0.19], z: 0.10, also: [{ s: [-Infinity, 0.16], y: [0.09, 0.13], z: 0.14 }] },
};
/** (2026-10-26, round 3) The focus in parts, each simplified to its own error (finest first; tiers.simplifyRegions), the
 * box form above or one of the head's own shapes, so each follows whatever head the sculpt gives:
 *   box   { s, y, z, also } (HL), as FOCUS
 *   tube  'pad': the upper-lip pad (HEAD_SCULPT.pad: its path, radii and vertical squash sy; mirrored in z) — the skin
 *         within d [from, to] HL of the tube's surface, s ≤ sMax
 *   cup   the cup's lip under each globe (head.cupField: the rim's height rimH about the globe's centre, the bead's outer
 *         radius re + gap + thick): the skin dy [from, to] HL of the rim's height and dr [from, to] of that radius
 * A tier with FOCUS_PARTS takes them instead of its FOCUS entry.
 * lod1 (round 3, the mouth review's lod1 items: the upper lip low from the front, jaw/upper 1.525 at the in-game camera,
 * and the pad rounded, its box h/l 0.486 at u1, limit 0.47; tried on both round-3 heads, geoA3 and geoB3, each with eye3's
 * cup): the median lip above the mouth's line (y ≥ 0.05) at 3e-4 — on the geoB3 head's taller lip the 1e-3 focus left
 * the front view's upper lip at 44.0 px of the dense mesh's 52.2 (jaw/upper 1.44 against the hero's 1.01); now 56.7
 * (1.02); geoA3 44.0 → 45.8 (dense 45.0, hero 46.2) —; the mouth's front below it at the round-2 focus' 1e-3 (finer there,
 * 3e-4 from y 0.02 or 0.03, gave the same front views but its small triangles along the closed mouth's line stretched
 * in the gapes: gapeHalf over 3× 43 → 62–91, edge × 2.5 23 → 46–79, geoA3); the pad's top — its skin from 0.004 inside
 * the tube to 0.016 outside, above the tube's axis, back to s 0.32: the groove over the pad, where the u1 pad label's
 * box ended on a few big triangles' corners — at 1e-3: box h/l at u1 geoA3 0.462 → 0.455, geoB3 0.481 → 0.466 (the
 * dense mesh 0.472, the hero 0.455; its underside along the mouth's line left out, for the gapes as above). lod1's skin
 * 8,938–8,942 → 9,118–9,122 triangles (the tier 14,612–14,616 of the class's 15,000); the gapes and the inflation stretch
 * and fold as many as with the round-2 focus (geoA3 gapeHalf 41 / 23 / 5 against 43 / 23 / 4). */
export const FOCUS_PARTS = {
  lod1: [
    { label: 'the median lip', error: 3e-4, s: [-Infinity, 0.25], y: [0.05, 0.19], z: 0.10 },
    { label: 'the mouth\'s front', error: 1e-3, s: [-Infinity, 0.25], y: [0.03, 0.19], z: 0.10, also: [{ s: [-Infinity, 0.16], y: [0.09, 0.13], z: 0.14 }] },
    { label: 'the pad\'s top', error: 1e-3, tube: 'pad', d: [-0.004, 0.016], sMax: 0.32, top: true },
  ],
};
/** (2026-10-26, round 2) The part of a free zone whose skin a tier keeps no lower than the lock's (fish mm; per tier):
 * lod2's chin. The chin's contact is a ray down at s 0.25 HL on the midline (rig.contactsFor), and the states' ground
 * heights are held at T3's (poselock): T3's lod2 had no vertex on the chin's midline (its lowest there 0.255 mm up, at
 * |z| 0.99), the round 1 jaw's dense skin put one 0.13 mm lower, and lod2's chin sank 0.14 mm into the ground in every
 * state (J_head y −6.542 → −6.682). Each free vertex in the box lying below the lock's lower surface there (the lowest
 * lock triangle over its s, z) is lifted onto it (tiers.floorToLock), so the chin's skin and its contact stay where T3's
 * were whatever the jaw's sculpt does (at lod2's distance the lift, ≤ 0.15 mm, is not seen). The box: round the contact's
 * station (the ray meets the triangles of the midline's vertices); a vertex more than maxLift below is left (the jaw's
 * front, where the round 1 envelope lies 0.4–1.2 mm under T3's lod2: new skin, not a simplification's error).
 * (Round 3: the box to |z| 1.6 and s 6.6, the lift `share` 0.6 of the way. On the round-3 heads the triangle the chin's
 * ray meets had its two free corners at |z| 1.4, outside the box, and the chin sank 0.08 mm (geoA3: the ray's skin at
 * s 0.25 HL 0.195 mm up against T3's 0.275; J_head −6.551 → −6.631); lifted the whole way onto T3's big flat triangles,
 * which chord the curved underside, those corners put the midline 0.07 mm over T3's (0.342); at 0.6 of the way 0.283
 * (geoA3) and 0.250 (geoB3), within 0.05 mm of T3.) */
export const FLOOR = {
  lod2: { label: 'the chin', s: [3.0, 6.6], y: [-Infinity, 1.0], z: 1.6, maxLift: 0.25, share: 0.6 },
};
const floorOf = (F) => F && { label: F.label, maxLift: F.maxLift ?? Infinity, share: F.share ?? 1, box: { s: F.s, y: F.y, z: F.z }, inside: ([s, y, z]) => s >= F.s[0] && s <= F.s[1] && y >= F.y[0] && y <= F.y[1] && Math.abs(z) <= F.z };
/** (2026-10-26, round 3) The part of a free zone whose dense skin a tier fairs before it is charted and simplified
 * (tiers.fairBand; per tier, FOCUS_PARTS' forms): lod1's cup lip. The eye review (round 2) found its lip under the globe
 * saw-toothed in clay (u1, the whole lip; the hero's smooth): the sealed field's surface nets at 0.16 mm staircase the
 * lip's crease (its rounding 0.010 HL is one cell), so the dense mesh had the teeth already and no finer simplification
 * took them out (the lip at error 3e-4 as a focus part, +370 triangles: the same teeth). Faired — 10 rounds of Taubin's
 * umbrella pair (lambda 0.5, mu −0.53), not projected back onto the field (projected, the vertices went back onto its
 * sharp crease and the teeth stayed), normals the faired mesh's own —, the lip is a soft rounded roll along its whole
 * length at u1, B012 and B010, for no triangles more. The band: 0.016 HL under the rim's height to 0.008 over it, 0.03 HL
 * inside the bead's outer radius to 0.015 outside (397 dense vertices of both cups move, the lining's and the junction's
 * locked ones stay: tierMesh passes its lockDense), at most 0.32 mm (along the lip). */
export const FAIR = {
  lod1: { label: 'the cup\'s lip', cup: { dy: [-0.016, 0.008], dr: [-0.03, 0.015] }, iters: 10, lambda: 0.5, mu: -0.53, project: false, normals: 'mesh' },
};
const fairOf = (F) => F && { label: F.label, iters: F.iters, lambda: F.lambda, mu: F.mu ?? 0, project: F.project ?? true, normals: F.normals ?? 'field', inside: partInside(F) };
const inBoxHL = (B, [s, y, z]) => s >= B.s[0] * HL && s <= B.s[1] * HL && y >= B.y[0] * HL && y <= B.y[1] * HL && Math.abs(z) <= B.z * HL;
// (a focus part's test, fish mm: its box, the pad's tube or the cups' lips)
const partInside = (F) => {
  if (F.tube === 'pad') {
    const T = HEAD_SCULPT.pad, sy = T.sy ?? 1, path = T.path, rad = T.radius, [d0, d1] = F.d, sMax = F.sMax ?? Infinity;
    // (idw.tube's distance: each segment's, its radius linear along it, y squashed by sy)
    // (also the height of the nearest point of the tube's axis, for `top`: only the skin above the axis — the pad's top
    // and the groove over it, not its underside along the mouth's line, whose finer triangles the gapes stretch)
    const dist = (q) => {
      let best = Infinity, cy = 0;
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i], b = path[i + 1], ab = [b[0] - a[0], (b[1] - a[1]) / sy, b[2] - a[2]], ap = [q[0] - a[0], (q[1] - a[1]) / sy, q[2] - a[2]];
        const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2])));
        const d = Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]) - (rad[i] + (rad[i + 1] - rad[i]) * t);
        if (d < best) { best = d; cy = a[1] + (b[1] - a[1]) * t; }
      }
      return [best, cy];
    };
    return ([s, y, z]) => {
      if (s / HL > sMax) return false;
      const [d, cy] = dist([s / HL, y / HL, Math.abs(z) / HL]);
      return d >= d0 && d <= d1 && (!F.top || y / HL >= cy + (F.top === true ? 0 : F.top));
    };
  }
  if (F.cup) {
    const E = HEAD.eye, re = E.d / 2, C = HEAD_SCULPT.cup, cup = cupField(HEAD_SCULPT), [y0, y1] = F.cup.dy, [r0, r1] = F.cup.dr, R = re + C.gap + C.thick;
    return ([s, y, z]) => {
      const px = s / HL - E.s, py = y / HL - E.y, pz = Math.abs(z) / HL - E.z;
      if (Math.abs(px) > 0.2 || Math.abs(py) > 0.2 || Math.abs(pz) > 0.2) return false;
      const dy = py - cup.rimH(px, pz), dr = Math.hypot(px, py, pz) - R;
      return dy >= y0 && dy <= y1 && dr >= r0 && dr <= r1;
    };
  }
  return (p) => inBoxHL(F, p) || (F.also ?? []).some((B) => inBoxHL(B, p));
};
export const focusOf = (F) => {
  if (!F) return null;
  // (parts: the union is the focus — what tiers.tierMesh keeps out of the patch —, each part at its own error)
  if (Array.isArray(F)) {
    const parts = F.map((P) => ({ label: P.label, error: P.error, inside: partInside(P) })).sort((a, b) => a.error - b.error);
    return { label: parts.map((P) => P.label).join(', '), error: parts[0].error, parts, inside: (p) => parts.some((P) => P.inside(p)) };
  }
  return { label: F.label, error: F.error, box: { s: F.s.map((x) => x * HL), y: F.y.map((x) => x * HL), z: F.z * HL }, inside: partInside(F) };
};

// ------------------------------------------------------------------------------------------------ the dense cells

/** A dense mesh's cells: Map 'i,j,k' → hash of the vertices in it (order-free: the sum of each quantized position's hash,
 * mod 2³²). */
export function cellHashes(position, cell = CELL_MM) {
  const out = new Map(), q = (x) => Math.round(x * 1e4);
  for (let v = 0; v < position.length / 3; v++) {
    const x = position[v * 3], y = position[v * 3 + 1], z = position[v * 3 + 2];
    const k = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    let h = 2166136261;
    for (const c of [q(x), q(y), q(z)]) { h ^= c & 0xffff; h = Math.imul(h, 16777619); h ^= (c >>> 16) & 0xffff; h = Math.imul(h, 16777619); }
    out.set(k, ((out.get(k) ?? 0) + (h >>> 0)) >>> 0);
  }
  return out;
}
/** (2026-10-26, round 2) The fringe: the cells outside the zones whose centre lies within FRINGE_MM (and half a cell's
 * diagonal) of one, those across a zone's edge too. The lock keeps its dense vertices there (`fringe`), and a fringe cell whose vertices all moved by no
 * more than MOVE_TOL_MM (each new vertex with an old one that near, and each old one with a new one) is not changed;
 * a lock vertex outside the zones with no vertex of the new mesh at its place but one within MOVE_TOL_MM takes that
 * one (tiers.simplifyRegions). The zones' sculpt reaches a little past their boxes: the round 1 jaw moved the dense
 * skin at s 7–8 mm (the cells next to the mouth zone's back edge) by 0.0002–0.0088 mm, and with the exact test that
 * freed T3's triangles there and every big triangle they touch — lod1 141 (s 6–9 mm), lod2 23 out to s 12, where the
 * new free part put a vertex 0.235 mm off T3's skin on one side only (fish [10.91, −0.11, −3.40]). */
export const FRINGE_MM = 1.5;
export const MOVE_TOL_MM = 0.01;
const zoneDist = ([s, y, z]) => Math.min(...FREE_ZONES.map((Z) => Math.hypot(Math.max(0, Z.s[0] - s, s - Z.s[1]), Math.max(0, Z.y[0] - y, y - Z.y[1]), Math.max(0, Math.abs(z) - Z.z))));
// (a cell not wholly inside the zones — a corner outside them: one across a zone's edge counts, its outer part may hold
// a held triangle — near one)
const inFringe = (key, cell = CELL_MM) => {
  const ijk = key.split(',').map(Number), c = ijk.map((x) => (x + 0.5) * cell);
  if (zoneDist(c) > FRINGE_MM + 0.87 * cell) return false;
  for (let q = 0; q < 8; q++) if (!inFreeZone(ijk.map((x, a) => (x + ((q >> a) & 1)) * cell))) return true;
  return false;
};
const cellKey = (P, v, cell) => `${Math.floor(P[v * 3] / cell)},${Math.floor(P[v * 3 + 1] / cell)},${Math.floor(P[v * 3 + 2] / cell)}`;
const byCellOf = (P, cell) => { const m = new Map(); for (let v = 0; v < P.length / 3; v++) { const k = cellKey(P, v, cell); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(v); } return m; };
/** The cells whose hash differs between the lock's dense mesh and this one (either side missing counts): a Set of keys.
 * With the lock's fringe (lockCells.fringe, loadDecimationLock), a fringe cell whose vertices moved within its tolerance
 * is left out. */
export function changedCells(lockCells, position, cell = CELL_MM) {
  const now = cellHashes(position, cell), out = new Set();
  for (const [k, h] of now) if (lockCells.get(k) !== h) out.add(k);
  for (const k of lockCells.keys()) if (!now.has(k)) out.add(k);
  const F = lockCells.fringe;
  if (F && out.size) {
    const NB = byCellOf(position, cell), tol2 = F.tol * F.tol;
    const near = (P, by, x, y, z) => {
      const i0 = Math.floor(x / cell), j0 = Math.floor(y / cell), k0 = Math.floor(z / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const v of by.get(`${i0 + a},${j0 + b},${k0 + c}`) ?? []) if ((P[v * 3] - x) ** 2 + (P[v * 3 + 1] - y) ** 2 + (P[v * 3 + 2] - z) ** 2 <= tol2) return true;
      return false;
    };
    // (a fringe cell still changed: its moved points — new vertices with no old one within the tolerance, and old ones
    // with no new one — kept on the lock's cells as `moved` (key → [x, y, z, …]), so tiers.frozenPlan tests a held
    // triangle against them instead of against the whole cell: a cell across the mouth zone's edge changed in its zone
    // part only)
    const moved = new Map();
    for (const k of [...out]) {
      if (!inFringe(k, cell)) continue;
      const a = F.byCell.get(k) ?? [], b = NB.get(k) ?? [], O = F.position, pts = [];
      for (const v of b) if (!near(O, F.byCell, position[v * 3], position[v * 3 + 1], position[v * 3 + 2])) pts.push(position[v * 3], position[v * 3 + 1], position[v * 3 + 2]);
      for (const i of a) if (!near(position, NB, O[i * 3], O[i * 3 + 1], O[i * 3 + 2])) pts.push(O[i * 3], O[i * 3 + 1], O[i * 3 + 2]);
      if (pts.length) moved.set(k, pts); else out.delete(k);
    }
    lockCells.moved = moved;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ reading the lock

// (binary blocks deflated, base64)
const b64 = (a) => zlib.deflateRawSync(Buffer.from(a.buffer, a.byteOffset, a.byteLength), { level: 9 }).toString('base64');
const fromB64 = (s, T) => { const b = zlib.inflateRawSync(Buffer.from(s, 'base64')), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); return new T(ab); };

/** The lock (null without the file): { file, source, tiers: { lod1: { position (mm), indices, chart (per triangle: a name
 * or null), cells: Map, cell } } }. */
export function loadDecimationLock(file = DECIMATION_LOCK_FILE) {
  if (!file || !fs.existsSync(file)) return null;
  const J = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (J.format !== 'tobihaze-decimation-lock/1') throw new Error(`decimlock: ${file} is not a tobihaze-decimation-lock/1 file`);
  const tiers = {};
  for (const [t, T] of Object.entries(J.tiers)) {
    const ci = fromB64(T.chart, Uint8Array);
    tiers[t] = {
      position: fromB64(T.position, Float32Array), indices: Uint32Array.from(fromB64(T.indices, T.vertices < 65536 ? Uint16Array : Uint32Array)),
      chart: Array.from(ci, (c) => (c === 255 ? null : T.chartNames[c])),
      // (each triangle's corner UVs in T3's GLB, u v per corner in the lock's corner order: the held triangles keep them,
      // tiers.restoreHeld; a lock written before 2026-10-26 has none)
      uv: T.uv ? Float32Array.from(fromB64(T.uv, Uint16Array), (x) => x / 65535) : null,
      // (the tier's focus, FOCUS: not the lock's data, the build's rule for its free part)
      focus: focusOf(FOCUS_PARTS[t] ?? FOCUS[t]) ?? null,
      // (the tier's floor, FLOOR: the build's rule as well)
      floor: floorOf(FLOOR[t]) ?? null,
      // (the tier's fairing, FAIR: the build's rule as well)
      fair: fairOf(FAIR[t]) ?? null,
      cells: (() => {
        const K = fromB64(T.cellKeys, Int16Array), H = fromB64(T.cellHashes, Uint32Array), m = new Map(); for (let i = 0; i < H.length; i++) m.set(`${K[i * 3]},${K[i * 3 + 1]},${K[i * 3 + 2]}`, H[i]);
        // (2026-10-26, round 2: the fringe's dense vertices, FRINGE_MM; a lock without them has the exact test only)
        if (T.fringe) { const position = fromB64(T.fringe, Float32Array); m.fringe = { position, byCell: byCellOf(position, T.cellMM), tol: T.fringeTolMM ?? MOVE_TOL_MM }; }
        return m;
      })(), cell: T.cellMM,
      // (a lock vertex outside the zones found within this of a vertex of the new mesh, tiers.simplifyRegions; 0: exactly)
      tol: T.fringe ? T.fringeTolMM ?? MOVE_TOL_MM : 0,
      // (the regions' triangle targets the lock's tier was simplified to: a region's free part takes any change of its
      // target since — tiers.simplifyRegions)
      targets: T.targets ?? null,
    };
  }
  return { file, source: J.source, tiers };
}

// ------------------------------------------------------------------------------------------------ writing the lock

function glbParts(buf) {
  const len = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  const binLen = buf.readUInt32LE(20 + len), bin = buf.subarray(28 + len, 28 + len + binLen);
  return { json, bin };
}
function accessor(G, i) {
  const A = G.json.accessors[i], V = G.json.bufferViews[A.bufferView], T = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[A.componentType];
  const n = A.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[A.type]), off = (V.byteOffset ?? 0) + (A.byteOffset ?? 0);
  if (V.byteStride && V.byteStride !== n / A.count * T.BYTES_PER_ELEMENT) throw new Error('decimlock: interleaved accessors are not read');
  const a = new T(G.bin.buffer.slice(G.bin.byteOffset + off, G.bin.byteOffset + off + n * T.BYTES_PER_ELEMENT));
  // (KHR_mesh_quantization: the UVs as normalized integers)
  return A.normalized ? Float32Array.from(a, (x) => x / (T === Uint8Array ? 255 : 65535)) : a;
}
/** A tier GLB's skin: the Body mesh's largest welded component (lod2 merges the resting globes into it), fish mm. */
function skinOf(buf) {
  const G = glbParts(buf), node = G.json.nodes.find((n) => n.name === 'Body' && n.mesh !== undefined), prim = G.json.meshes[node.mesh].primitives[0];
  const P = accessor(G, prim.attributes.POSITION), UV = accessor(G, prim.attributes.TEXCOORD_0), I = Uint32Array.from(accessor(G, prim.indices));
  const n = P.length / 3, Y0 = -toObject([0, 0, 0])[1] * 1000, pos = new Float64Array(n * 3);
  for (let v = 0; v < n; v++) { pos[v * 3] = S0 - P[v * 3 + 2] * 1000; pos[v * 3 + 1] = P[v * 3 + 1] * 1000 + Y0; pos[v * 3 + 2] = P[v * 3] * 1000; }
  // (weld by position, then the largest connected component)
  const key = new Map(), w = new Int32Array(n);
  for (let v = 0; v < n; v++) { const k = `${Math.round(pos[v * 3] * 1e4)},${Math.round(pos[v * 3 + 1] * 1e4)},${Math.round(pos[v * 3 + 2] * 1e4)}`; let id = key.get(k); if (id === undefined) key.set(k, (id = key.size)); w[v] = id; }
  const par = Int32Array.from({ length: key.size }, (_, i) => i), find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (let t = 0; t < I.length; t += 3) { const a = find(w[I[t]]); for (const q of [I[t + 1], I[t + 2]]) { const b = find(w[q]); if (a !== b) par[b] = a; } }
  const size = new Map(); for (let t = 0; t < I.length; t += 3) { const r = find(w[I[t]]); size.set(r, (size.get(r) ?? 0) + 1); }
  const big = [...size].sort((a, b) => b[1] - a[1])[0][0];
  const keep = []; for (let t = 0; t < I.length; t += 3) if (find(w[I[t]]) === big) keep.push(t);
  // (welded positions and indices; the UV of each triangle's centroid for its chart)
  const wpos = new Float32Array(key.size * 3); for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) wpos[w[v] * 3 + c] = pos[v * 3 + c];
  const idx = new Uint32Array(keep.length * 3), cuv = new Float32Array(keep.length * 2), corner = new Uint16Array(keep.length * 6);
  keep.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      idx[i * 3 + k] = w[I[t + k]]; cuv[i * 2] += UV[I[t + k] * 2] / 3; cuv[i * 2 + 1] += UV[I[t + k] * 2 + 1] / 3;
      // (each corner's UV as the GLB holds it: KHR_mesh_quantization's normalized uint16, as GLBBuilder writes it)
      for (let q = 0; q < 2; q++) corner[i * 6 + k * 2 + q] = Math.max(0, Math.min(65535, Math.round(UV[I[t + k] * 2 + q] * 65535)));
    }
  });
  return { position: wpos, indices: idx, centroidUV: cuv, cornerUV: corner };
}

async function denseCells(tree, tier) {
  const FM = await import(pathToFileURL(path.join(tree, 'tools/models/tobihaze/fishmesh.mjs')).href);
  await FM.ready;
  const T = FM.TIERS[tier], dense = FM.fishDense({ h: T.h, field: FM.tierField(tier) });
  // (the fringe's dense vertices, round 2: those in the cells next to the zones, FRINGE_MM)
  const P = dense.position, keep = [];
  for (let v = 0; v < P.length / 3; v++) if (inFringe(cellKey(P, v, CELL_MM))) keep.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
  return { cells: cellHashes(dense.position), fringe: Float32Array.from(keep), layout: T.layout ?? FM.BODY_LAYOUT, spare: FM.SPARE_CHARTS, targets: T.regions ? { ...T.regions } : { all: T.target } };
}

/** The lock's JSON from the tiers' GLBs (Buffers by tier) and a tree to mesh their dense skins with. */
export async function decimationLockFromGLBs(glbs, source, tree) {
  const tiers = {};
  for (const t of LOCKED_TIERS) {
    const S = skinOf(glbs[t]), D = await denseCells(tree, t);
    // (each triangle's chart: the layout rect its centroid's UV lies in — a rect the tier leaves to the patch (SPARE_CHARTS)
    // holds patch islands under that rect's name, which the build finds no chart of and takes the corners' common chart)
    const chartNames = Object.keys(D.layout).filter((k) => k !== 'eyeSkin');
    const ci = new Uint8Array(S.indices.length / 3).fill(255);
    for (let i = 0; i < ci.length; i++) {
      const u = S.centroidUV[i * 2], v = S.centroidUV[i * 2 + 1];
      const hit = chartNames.findIndex((k) => u >= D.layout[k][0] && u <= D.layout[k][2] && v >= D.layout[k][1] && v <= D.layout[k][3]);
      if (hit >= 0) ci[i] = hit;
    }
    const cells = [...D.cells].sort((a, b) => (a[0] < b[0] ? -1 : 1)), nv = S.position.length / 3;
    const cellKeys = Int16Array.from(cells.flatMap(([k]) => k.split(',').map(Number))), cellH = Uint32Array.from(cells.map(([, h]) => h));
    tiers[t] = { triangles: ci.length, vertices: nv, position: b64(S.position), indices: b64(nv < 65536 ? Uint16Array.from(S.indices) : S.indices), chartNames, chart: b64(ci), uv: b64(S.cornerUV), targets: D.targets, cellMM: CELL_MM, cellCount: cells.length, cellKeys: b64(cellKeys), cellHashes: b64(cellH), fringeMM: FRINGE_MM, fringeTolMM: MOVE_TOL_MM, fringeCount: D.fringe.length / 3, fringe: b64(D.fringe) };
  }
  return { format: 'tobihaze-decimation-lock/1', source, about: 'lod1\'s and lod2\'s skin as round T3 simplified it (decimlock.mjs): positions fish mm (Float32), triangles (Uint16 under 65 536 vertices, else Uint32), a chart per triangle (Uint8 into chartNames, 255 none), each triangle\'s corner UVs as the GLB held them (uv: Uint16 normalized, u v per corner), the dense cells (Int16 i, j, k at cellMM) and their hashes (Uint32), the fringe\'s dense vertices (fringe: Float32, fish mm; the cells outside the zones within fringeMM of one, whose vertices may move by fringeTolMM); every block raw-deflated and base64', zones: FREE_ZONES, tiers };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const rev = arg('--from-git', null), dir = arg('--from-dir', null), out = path.resolve(arg('--out', DECIMATION_LOCK_FILE));
  const tree = path.resolve(arg('--dense-tree', path.resolve(here, '../../..')));
  if (!rev && !dir) { console.error('usage: decimlock.mjs --from-git <rev> | --from-dir <dir> [--dense-tree <dir>] [--out <file>]'); process.exit(2); }
  const root = path.resolve(here, '../../..');
  const glbs = Object.fromEntries(LOCKED_TIERS.map((t) => [t, rev
    ? execFileSync('git', ['show', `${rev}:src/assets/models/tobihaze/tobihaze.${t}.glb`], { cwd: root, maxBuffer: 1 << 28 })
    : fs.readFileSync(path.join(dir, `tobihaze.${t}.glb`))]));
  const J = await decimationLockFromGLBs(glbs, `${rev ? `git ${rev}: src/assets/models/tobihaze/` : `${path.basename(dir)}/`}tobihaze.{lod1,lod2}.glb (the Body's skin)${arg('--dense-label', null) ? `, dense cells from ${arg('--dense-label')}` : ''}`, tree);
  fs.writeFileSync(out, JSON.stringify(J, null, 1) + '\n');
  console.log(`decimation lock → ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(1)} kB): ${LOCKED_TIERS.map((t) => `${t} ${J.tiers[t].triangles} triangles, ${J.tiers[t].cellCount} cells`).join('; ')}`);
}
