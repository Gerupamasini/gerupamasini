// The fins' numeric gates (round B2, updated for round B3 at its integration: the one-lobe pectoral's longer blade and
// fleshy base, the caudal's roots embedded in the peduncle's tongue, the denser far cards; each B2 gate a B3 design
// replaces is kept as a 'report (B2 design)' line beside its replacement; round B1's in out/fins/test-fins.mjs):
//   node tools/models/tobihaze/test-fins.mjs [--json out.json] [--body <module.mjs>:<export>] [--fins <module.mjs>]
//   [--verbose]  (--body: another sculpt to test against, e.g. a trunk owner's work in progress, default body.mjs
//   BODY_SCULPT; --fins: another fins module, e.g. an earlier round's copy, for a before / after table)
//  1 triangles: hero D1 ≤ 6k, D2 ≤ 6k, anal ≤ 5k, caudal ≤ 7k, pectoral ≤ 4k each, pelvic ≤ 4k (≤ 40k all);
//    lod1 ≤ 4k all and each fin ≤ 1/5 of its hero; lod2 cards ≤ 20 triangles each (≤ 100 all; round B3: the far fish's
//    spread fins and pressed cup need 5 pectoral, 7 caudal and 11 pelvic stations, B2's ≤ 8 / ≤ 60 reported; the lod2
//    tier stays within class M's 1.5k), every state of a card (def.cardTargets) the same vertices
//  2 the base row (rayT 0) within 0.01 HL of the skin, never outside it by more than 0.002 HL (no gap) (the distance
//    to the skin: the field over its gradient, or marched where the limbs' field is not a distance); round B3: the
//    pectoral's measured at its rays' centrelines (mesh.root: its fleshy lenses lie up to 0.015 HL inside the lobe by
//    design), every base vertex still none outside; the caudal's roots embedded in the tongue by design (gate 10)
//  3 no vertex inside the body farther than 0.02 HL from its root, in the bind and in every target at weight 1 (the
//    pectoral's fold in the arm's rest pose it is authored in, against the trunk there)
//  4 the right pectoral = the left mirrored (z → −z) with every triangle rewound, its normals mirrored
//  5 every uv inside its FIN_ATLAS rect; no rect overlaps the iris corner (+16 px) or another fin's rect (but the
//    pectorals' shared one)
//  6 winding: the faces agree with the vertex normals (dot > 0) for ≥ 99 % of the triangles, in every state
//  7 everything finite; the targets' deltas finite
//  8 shape against the photo measurements (hero): D1 height / BD half raised 0.55-0.75 (A070 0.72, B067 0.57, lit.
//    0.59), erect 0.88-0.97 (A001 0.93), folded ≤ 0.035 HL over the back (a streak in a groove: A030, BFC §2.3); D2
//    erect 0.35-0.45 BD (A065, A001; BFC 0.45); anal / D2 erect 0.7-0.95; caudal tip at TL ± 0.02 HL, folded tip below
//    the axis by < 0.08 HL, folded length 2.2-2.8 × peduncle depth (2.4); pectoral (round B3's one lobe: u1 0.60 HL of
//    furled fin, A070 0.45, B067 0.48): blade 0.45-0.50 HL, shoulder → blade tip 0.80-0.95 HL, ray bases across ≥ 0.85
//    of the junction's width, spread fan 120-150° with a radius (median ray tip from the bases' middle) 0.41-0.49 HL,
//    lobe ÷ blade reported (B2's anatomy review asked ≤ 0.7); pelvic 0.3-0.5 HL long, its bind cup
//    a dish from the front (deepest point ≤ 0.13 HL under its root, depth / half-span ≤ 0.75)
//  9 the fins keep clear of each other: D1 folded ends before D2 (Lee 1995), D2 and anal folded before the caudal's
//    procurrent rays, the pelvic ≥ 0.01 HL from the pectoral blades in every bind-space state pairing
// 10 the caudal springs from the peduncle: the first and last principal rays' bases within 0.02 HL of the dorsal and
//    ventral skin just in front of them; the side outline (body ∪ fin, bind and fold) without a notch deeper than
//    0.006 HL over s plate − 0.15 … plate + 0.25; round B3 (the rays rooted on a hypural plate inside the peduncle's
//    tongue, def.plate): every principal ray's base inside the body, and each ray inside the body from its base for
//    ≥ 0.08 HL along it in bind, fold and spread (B2's 'body half-width ÷ root lens ≤ 2.5' measured the end-plate
//    design: reported)
// 11 the pectoral's plant: the sole (each ray past its turn, def.sole.from) one plane: its normal within 2° of
//    def.sole.normal, all its vertices within 0.15 mm of the plane's lowest (the ground once levelled), its underside
//    (lens points facing the ground) within 0.10 mm; the inner blade continues the forearm (the middle rays' bases →
//    heel within 10° of elbow → wrist); the heel 0.25-0.32 HL from the bases (round B3: u1's short distal sole on a
//    0.5 HL blade; B2's 0.15-0.20 reported)
// 12 the pectoral's fold, in the arm's rest pose: the blade past rayT 0.3 lies on the flank, 0 … 0.3 mm off the trunk's
//    skin (A030, A040, B067)
// 13 the pelvic's fold hugs the belly: every vertex past 0.02 HL from its root no more than 0.01 HL under the belly's
//    midline at its s, |z| ≤ 0.10 HL
// 14 posed (rig.mjs finWeights; the axial chain J_sp1 … J_caudal at ±8° pitch, then ±8° yaw a joint, and round B1's
//    tail-up arch): the folded D1, D2, anal and caudal no more than 0.05 mm inside the posed body past rayT 0.15 (the
//    body's skin there follows rig.axialRow; a point is unposed through the body's own blend of the joints and tested
//    against the bind field; round B3: the caudal against its clearance field def.space, the body but for the inside of
//    the tongue its roots are embedded in, and none of its vertices hidden in the bind coming out posed); reported beside
//    it, the rule round B2 proposes for finWeights (mesh.foldS)
// 15 texel density (hero), see there; 16 the lod2 cards follow the hero's states, see there
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HL } from './anatomy.mjs';
import { fishSDF, trunkProfile, BODY_SCULPT } from './body.mjs';

const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
// (--fins <module.mjs>: another fins module, e.g. an earlier round's copy for a before / after table)
const { finDefinitions, buildFinMesh, buildFinTargets, finCard, finTierParams, FIN_ATLAS, IRIS_RECT } = await import(argOf('--fins') ? pathToFileURL(path.resolve(argOf('--fins'))).href : './fins.mjs');
let K = BODY_SCULPT, bodyName = 'body.mjs BODY_SCULPT';
if (argOf('--body')) {
  const [file, exp] = argOf('--body').split(':');
  const mod = await import(pathToFileURL(path.resolve(file)).href);
  K = exp.split('.').reduce((o, k) => o[k], mod);
  bodyName = argOf('--body');
}
const F = fishSDF(K);
// the distance to the skin (HL) at a mm point: the field over its gradient's length (the sculpt's flattened limbs and
// caps are bounds, not distances: at a spatulate wrist the field's gradient runs to 10–17)
const fmm = (x, y, z) => {
  const p = [x / HL, y / HL, z / HL], e = 1e-4, f0 = F(...p);
  const g = [0, 1, 2].map((i) => { const a = p.slice(), b = p.slice(); a[i] += e; b[i] -= e; return (F(...a) - F(...b)) / (2 * e); });
  return f0 / Math.max(1e-6, Math.hypot(...g));
};
// (deeper than a cell: the true distance to the skin, by marching 26 directions to the first sign change; the field's
// value inside a limb segment jumps at its end cap, so f/|∇f| over-reads there)
const DIRS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) { const l = Math.hypot(x, y, z); DIRS.push([x / l, y / l, z / l]); }
const depthMM = (x, y, z) => {
  const d0 = fmm(x, y, z);
  if (d0 > -0.008) return d0;
  const p = [x / HL, y / HL, z / HL];
  let best = Infinity;
  for (const d of DIRS) {
    let a = 0, b = null;
    for (let s = 0.002; s <= 0.12; s += 0.002) if (F(p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s) >= 0) { b = s; break; } else a = s;
    if (b === null) continue;
    for (let i = 0; i < 20; i++) { const m = (a + b) / 2; if (F(p[0] + d[0] * m, p[1] + d[1] * m, p[2] + d[2] * m) >= 0) b = m; else a = m; }
    best = Math.min(best, (a + b) / 2);
  }
  return Number.isFinite(best) ? -best : d0;
};
const defs = finDefinitions(K);
const D = Object.fromEntries(defs.map((d) => [d.name, d]));
const LIM = { Fin_Dorsal1: 6000, Fin_Dorsal2: 6000, Fin_Anal: 5000, Fin_Caudal: 7000, Fin_Pectoral_L: 4000, Fin_Pectoral_R: 4000, Fin_Pelvic: 4000 };
const results = [];
const gate = (name, value, target, pass) => { results.push({ name, value, target, pass }); };
const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) < 0.01 && v !== 0 ? v.toExponential(2) : +v.toFixed(4)) : v);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((c) => c / l); };
const DEG = 180 / Math.PI;
console.log(`body: ${bodyName}`);

// 1 triangles
const P = { hero: finTierParams('hero'), lod1: finTierParams('lod1') };
const meshes = { hero: {}, lod1: {} };
let heroT = 0, lod1T = 0, cardT = 0, cardMax = 0, cardSame = true;
for (const d of defs) {
  for (const tier of ['hero', 'lod1']) meshes[tier][d.name] = buildFinMesh(d, P[tier][d.name]);
  const h = meshes.hero[d.name].indices.length / 3, l = meshes.lod1[d.name].indices.length / 3;
  heroT += h; lod1T += l;
  gate(`tris hero ${d.name}`, h, `≤ ${LIM[d.name]}`, h <= LIM[d.name]);
  gate(`tris lod1 ${d.name}`, l, `≤ hero/5 (${Math.floor(h / 5)})`, l <= h / 5);
  const c0 = finCard(d), c = c0.indices.length / 3;
  cardT += c; cardMax = Math.max(cardMax, c);
  for (const st of d.cardTargets ?? (d.type === 'pectoral' ? ['fold', 'plant'] : ['fold'])) {
    const cs = finCard(d, { state: st });
    if (cs.position.length !== c0.position.length || cs.indices.some((v, i) => v !== c0.indices[i])) cardSame = false;
  }
}
gate('tris hero all fins', heroT, '≤ 40000', heroT <= 40000);
gate('tris lod1 all fins', lod1T, '≤ 4000', lod1T <= 4000);
gate('tris lod2 cards (max each / all)', `${cardMax} / ${cardT}`, '≤ 20 / ≤ 100', cardMax <= 20 && cardT <= 100);
gate('tris lod2 cards (max each / all; report: B2\'s budget)', `${cardMax} / ${cardT}`, 'report (≤ 8 / ≤ 60)', true);
gate('lod2 cards: every card state the same vertices and triangles as the bind', cardSame, 'true', cardSame);

const TG = {};
const faceN = (pos, I, t) => {
  const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
  const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], v = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};
for (const tier of ['hero', 'lod1']) {
  for (const d of defs) {
    const m = meshes[tier][d.name], n = m.position.length / 3, I = m.indices, nT = I.length / 3;
    // 7 finite
    let finite = true;
    for (const arr of [m.position, m.normal, m.uv, m.rayT, m.ray, m.baseS]) for (const v of arr) if (!Number.isFinite(v)) finite = false;
    // 2 base row
    let bMax = 0, bOut = -Infinity, cMax = 0;
    const centre = d.type === 'pectoral' && m.root, seen = new Set();
    for (let i = 0; i < n; i++) {
      if (m.rayT[i] > 1e-9) continue;
      const dd = depthMM(m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2]);
      bMax = Math.max(bMax, Math.abs(dd)); bOut = Math.max(bOut, dd);
      // (round B3, the pectoral: its rays' centrelines, the root point under each base vertex)
      if (centre) { const key = `${m.root[i * 3].toFixed(4)},${m.root[i * 3 + 1].toFixed(4)},${m.root[i * 3 + 2].toFixed(4)}`; if (!seen.has(key)) { seen.add(key); cMax = Math.max(cMax, Math.abs(depthMM(m.root[i * 3], m.root[i * 3 + 1], m.root[i * 3 + 2]))); } }
    }
    if (d.type === 'caudal') {
      gate(`${tier} ${d.name} base: roots inside the body (outside max, HL; embedded by design, gate 10)`, fmt(bOut), '≤ 0.002', bOut <= 0.002);
      gate(`${tier} ${d.name} base |d| max (HL; report: B2's end-plate design)`, fmt(bMax), 'report (≤ 0.01)', true);
    } else if (centre) {
      gate(`${tier} ${d.name} base: ray centrelines |d| max (HL) / every base vertex outside max`, `${fmt(cMax)} / ${fmt(bOut)}`, '≤ 0.01 / ≤ 0.002', cMax <= 0.01 && bOut <= 0.002);
      gate(`${tier} ${d.name} base |d| max over the lenses (HL; report: the fleshy base lies inside the lobe)`, fmt(bMax), 'report (B2 ≤ 0.01)', true);
    } else gate(`${tier} ${d.name} base |d| max (HL) / outside max`, `${fmt(bMax)} / ${fmt(bOut)}`, '≤ 0.01 / ≤ 0.002', bMax <= 0.01 && bOut <= 0.002);
    // 3 + 6 per state
    const tg = buildFinTargets(d, m);
    (TG[tier] ??= {})[d.name] = tg;
    for (const d2 of tg.deltas) for (const v of d2) if (!Number.isFinite(v)) finite = false;
    const states = [['bind', null], ...tg.names.map((nm, k) => [nm, tg.deltas[k], tg.normals[k]])];
    for (const [nm, dl, dn] of states) {
      if (nm === 'plantMid') continue; // a corrective, never at weight 1 alone
      const pos = dl ? m.position.map((v, i) => v + dl[i]) : m.position;
      const nor = dn ? m.normal.map((v, i) => v + dn[i]) : m.normal;
      // (a state authored in another pose: tested there, against that pose's body)
      const space = (d.mirrorOf ?? d).space?.(nm) ?? null, side = d.side === 'R' ? -1 : 1;
      const fieldAt = (x, y, z) => {
        if (!space) return fmm(x, y, z);
        const q = space.to([x / HL, y / HL, (side * z) / HL]);
        return space.f(q);
      };
      let inside = 0, worst = 0;
      for (let i = 0; i < n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const r = [m.root[i * 3], m.root[i * 3 + 1], m.root[i * 3 + 2]];
        const far = Math.hypot(x - r[0], y - r[1], z - r[2]) / HL;
        if (far <= 0.02) continue;
        const dd = fieldAt(x, y, z);
        if (dd < 0) { inside++; worst = Math.min(worst, dd); }
      }
      gate(`${tier} ${d.name} ${nm}${space ? ' (rest pose)' : ''}: verts inside the body past 0.02 HL of the root`, `${inside} (deepest ${fmt(worst)})`, '0', inside === 0);
      let agree = 0;
      for (let t = 0; t < nT; t++) {
        const fn = faceN(pos, I, t);
        const vn = [0, 1, 2].map((c) => nor[I[t * 3] * 3 + c] + nor[I[t * 3 + 1] * 3 + c] + nor[I[t * 3 + 2] * 3 + c]);
        if (dot(fn, vn) > 0) agree++;
      }
      gate(`${tier} ${d.name} ${nm}: faces agree with normals`, `${(100 * agree / nT).toFixed(2)} %`, '≥ 99 %', agree >= 0.99 * nT);
    }
    gate(`${tier} ${d.name} finite`, finite, 'true', finite);
    // 5 uv in rect
    const [rx, ry, rw, rh] = FIN_ATLAS[d.name];
    let out = 0;
    for (let i = 0; i < n; i++) {
      const u = m.uv[i * 2] * 2048, v = m.uv[i * 2 + 1] * 2048;
      if (u < rx - 1e-6 || u > rx + rw + 1e-6 || v < ry - 1e-6 || v > ry + rh + 1e-6) out++;
    }
    gate(`${tier} ${d.name} uv outside its rect`, out, '0', out === 0);
  }
  // 4 mirror
  const L = meshes[tier].Fin_Pectoral_L, R = meshes[tier].Fin_Pectoral_R;
  let maxd = 0, wind = 0, nd = 0;
  for (let i = 0; i < L.position.length; i += 3) {
    maxd = Math.max(maxd, Math.abs(L.position[i] - R.position[i]), Math.abs(L.position[i + 1] - R.position[i + 1]), Math.abs(L.position[i + 2] + R.position[i + 2]));
    nd = Math.max(nd, Math.abs(L.normal[i + 2] + R.normal[i + 2]), Math.abs(L.normal[i] - R.normal[i]));
  }
  for (let t = 0; t < L.indices.length; t += 3)
    if (!(L.indices[t] === R.indices[t] && L.indices[t + 1] === R.indices[t + 2] && L.indices[t + 2] === R.indices[t + 1])) wind++;
  gate(`${tier} pectoral R = L mirrored (pos / normal max diff mm, rewound tris off)`, `${fmt(maxd)} / ${fmt(nd)} / ${wind}`, '0 / 0 / 0', maxd < 1e-6 && nd < 1e-6 && wind === 0);
}
// 5 atlas: iris corner free, rects disjoint
{
  const E = 16, ir = [IRIS_RECT.x - E, IRIS_RECT.y - E, IRIS_RECT.w + 2 * E, IRIS_RECT.h + 2 * E];
  const ov = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const names = Object.keys(FIN_ATLAS);
  const bad = [];
  for (const nm of names) if (ov(FIN_ATLAS[nm], ir)) bad.push(`${nm}∩iris`);
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = FIN_ATLAS[names[i]], b = FIN_ATLAS[names[j]];
      const same = a.every((v, k) => v === b[k]);
      if (!same && ov(a, b)) bad.push(`${names[i]}∩${names[j]}`);
      if (same && !(/Pectoral/.test(names[i]) && /Pectoral/.test(names[j]))) bad.push(`${names[i]}=${names[j]}`);
    }
  for (const nm of names) { const [x, y, w, h] = FIN_ATLAS[nm]; if (x < 0 || y < 0 || x + w > 2048 || y + h > 2048) bad.push(`${nm} off the atlas`); }
  gate('atlas: iris corner (+16 px) free, rects disjoint', bad.length ? bad.join(', ') : 'ok', 'ok', bad.length === 0);
}

// 15 texel density (hero): within a fin, the texels per mm of its triangles (area-weighted p5 … p95) within 4×, the
//    caudal 6× (a fan in a rectangle, its root rays converging, and the fleshy base as thick as the plate; round B1's
//    u = ray index, v = rayT gave 5.0× area-weighted on its body, 20× between single rays); the caudal's procurrent
//    strips ≤ 20 % of its u range (B1 40 %)
{
  for (const d of defs) {
    if (d.mirrorOf) continue;
    const m = meshes.hero[d.name], I = m.indices, P = m.position, U = m.uv, rows = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
      const A3 = 0.5 * Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
      const A2 = 0.5 * Math.abs((U[b * 2] - U[a * 2]) * (U[c * 2 + 1] - U[a * 2 + 1]) - (U[c * 2] - U[a * 2]) * (U[b * 2 + 1] - U[a * 2 + 1])) * 2048 * 2048;
      if (A3 > 1e-6 && A2 > 1e-9) rows.push([Math.sqrt(A2 / A3), A3]);
    }
    rows.sort((x, y) => x[0] - y[0]);
    const tot = rows.reduce((s, r) => s + r[1], 0);
    const q = (p) => { let acc = 0; for (const r of rows) { acc += r[1]; if (acc >= p * tot) return r[0]; } return rows[rows.length - 1][0]; };
    const ratio = q(0.95) / q(0.05), lim = d.type === 'caudal' ? 6 : 4;
    gate(`uv ${d.name}: texels/mm p5 / p95 (area-weighted) ratio`, `${fmt(q(0.05))} / ${fmt(q(0.95))} = ${fmt(ratio)}`, `≤ ${lim}`, ratio <= lim);
  }
  const d = D.Fin_Caudal, m = meshes.hero.Fin_Caudal, np = d.rays.filter((r) => r.kind === 'proc').length / 2;
  let lo = Infinity, hi = -Infinity, pl = Infinity, ph = -Infinity;
  for (let i = 0; i < m.ray.length; i++) {
    const u = m.uv[i * 2]; lo = Math.min(lo, u); hi = Math.max(hi, u);
    if (m.ray[i] <= np - 1 + 0.5) pl = Math.min(pl, u), ph = Math.max(ph, u);
  }
  let ql = Infinity, qh = -Infinity;
  for (let i = 0; i < m.ray.length; i++) if (m.ray[i] >= d.rays.length - np - 0.5) { ql = Math.min(ql, m.uv[i * 2]); qh = Math.max(qh, m.uv[i * 2]); }
  const share = (ph - pl + (qh - ql)) / (hi - lo);
  gate('uv caudal: procurrent strips\' share of its u range', fmt(share), '≤ 0.20', share <= 0.2);
}

// 8 shape, 9 clearance between fins (hero)
const prof = trunkProfile(K);
const skinY = (s, up, z = 0) => { let a = prof.at(Math.max(1.05, s)).yc, b = a + up; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (F(s, m, z) < 0) a = m; else b = m; } return (a + b) / 2; };
const st = (name, state, tier = 'hero') => {
  const m = meshes[tier][name], tg = TG[tier][name], k = tg.names.indexOf(state);
  const n = m.position.length / 3, P = new Float64Array(n * 3);
  for (let i = 0; i < n * 3; i++) P[i] = (m.position[i] + (k >= 0 ? tg.deltas[k][i] : 0)) / HL;
  return { P, n, m };
};
{
  const BD = skinY(1.115, 1) - skinY(1.115, -1);
  const height = (name, state, up) => { const { P, n } = st(name, state); let h = 0; for (let i = 0; i < n; i++) { const b = skinY(Math.min(4.15, Math.max(1.06, P[i * 3])), up); h = Math.max(h, up > 0 ? P[i * 3 + 1] - b : b - P[i * 3 + 1]); } return h; };
  const maxS = (name, state) => { const { P, n } = st(name, state); let s = -Infinity; for (let i = 0; i < n; i++) s = Math.max(s, P[i * 3]); return s; };
  const inRange = (v, a, b) => v >= a && v <= b;
  const d1b = height('Fin_Dorsal1', 'bind', 1) / BD, d1s = height('Fin_Dorsal1', 'spread', 1) / BD, d1f = height('Fin_Dorsal1', 'fold', 1);
  gate('shape D1 height/BD half raised (bind)', fmt(d1b), '0.55-0.75', inRange(d1b, 0.55, 0.75));
  gate('shape D1 height/BD erect (spread)', fmt(d1s), '0.88-0.97', inRange(d1s, 0.88, 0.97));
  gate('shape D1 folded height over the back (HL)', fmt(d1f), '≤ 0.035', d1f <= 0.035);
  for (const nm of ['Fin_Dorsal2', 'Fin_Anal']) { const h = height(nm, 'fold', nm === 'Fin_Anal' ? -1 : 1); gate(`shape ${nm} folded height over the skin (HL; report)`, fmt(h), 'report', true); }
  const d2s = height('Fin_Dorsal2', 'spread', 1) / BD, as = height('Fin_Anal', 'spread', -1) / BD;
  gate('shape D2 height/BD erect', fmt(d2s), '0.35-0.45', inRange(d2s, 0.35, 0.45));
  gate('shape anal / D2 erect height', fmt(as / d2s), '0.7-0.95', inRange(as / d2s, 0.7, 0.95));
  const TLh = 80 / HL, axis = prof.at(K.caudalBase).yc, depth = prof.at(K.caudalBase).yT - prof.at(K.caudalBase).yB;
  for (const state of ['bind', 'fold']) {
    const { P, n } = st('Fin_Caudal', state);
    let ti = 0; for (let i = 1; i < n; i++) if (P[i * 3] > P[ti * 3]) ti = i;
    gate(`shape caudal ${state} tip s vs TL (HL)`, `${fmt(P[ti * 3])} vs ${fmt(TLh)}`, '± 0.02', Math.abs(P[ti * 3] - TLh) <= 0.02);
    if (state === 'fold') {
      const below = axis - P[ti * 3 + 1];
      gate('shape caudal folded tip below the axis (HL)', fmt(below), '0-0.08', inRange(below, 0, 0.08));
      const L = (P[ti * 3] - K.caudalBase) / depth;
      gate('shape caudal folded length / peduncle depth', fmt(L), '2.2-2.8', inRange(L, 2.2, 2.8));
    }
  }
  {
    const d = D.Fin_Pectoral_L, Pc = K.pectoral, sh = Pc.shoulder;
    const blade = Math.max(...d.rays.map((r) => r.len));
    gate('shape pectoral blade (longest ray, HL)', fmt(blade), '0.45-0.50', inRange(blade, 0.45, 0.50));
    const arm = Math.hypot(...sub(Pc.elbow, sh)) + Math.hypot(...sub(Pc.wrist, Pc.elbow));
    gate('shape pectoral lobe shoulder → junction (HL; the pectoral key\'s design 0.30-0.45)', fmt(arm), '0.30-0.45', inRange(arm, 0.30, 0.45));
    gate('shape pectoral lobe ÷ blade (report: B2\'s anatomy review asked ≤ 0.7)', fmt(arm / blade), 'report', true);
    const { P, n } = st('Fin_Pectoral_L', 'bind');
    let far = 0; for (let i = 0; i < n; i++) far = Math.max(far, Math.hypot(P[i * 3] - sh[0], P[i * 3 + 1] - sh[1], P[i * 3 + 2] - sh[2]));
    gate('shape pectoral shoulder → blade tip (HL)', fmt(far), '0.80-0.95', inRange(far, 0.80, 0.95));
    const span = Math.hypot(...sub(d.rays[0].base, d.rays[d.rays.length - 1].base)), wrist = 2 * Pc.radius[2];
    gate('shape pectoral ray bases across / the wrist\'s width', `${fmt(span)} / ${fmt(wrist)} = ${fmt(span / wrist)}`, '≥ 0.85', span / wrist >= 0.85);
    const S = st('Fin_Pectoral_L', 'spread'), m = S.m;
    const tipOf = (k) => { for (let i = 0; i < S.n; i++) if (Math.abs(m.ray[i] - k) < 1e-6 && m.rayT[i] === 1) return i; return -1; };
    const dirOf = (k) => { const tip = tipOf(k); const r = [m.root[tip * 3] / HL, m.root[tip * 3 + 1] / HL, m.root[tip * 3 + 2] / HL]; return nrm([S.P[tip * 3] - r[0], S.P[tip * 3 + 1] - r[1], S.P[tip * 3 + 2] - r[2]]); };
    const a = dirOf(0), b = dirOf(13), ang = Math.acos(dot(a, b)) * DEG;
    gate('shape pectoral spread fan angle (deg)', fmt(ang), '120-150', inRange(ang, 120, 150));
    const c = d.rays.map((r) => r.base).reduce((p, q) => p.map((v, i) => v + q[i] / d.rays.length), [0, 0, 0]);
    const rad = d.rays.map((r, k) => { const tip = tipOf(k); return Math.hypot(S.P[tip * 3] - c[0], S.P[tip * 3 + 1] - c[1], S.P[tip * 3 + 2] - c[2]); }).sort((x, y) => x - y);
    const med = (rad[6] + rad[7]) / 2;
    gate('shape pectoral spread fan radius (median ray tip from the bases\' middle, HL)', fmt(med), '0.41-0.49', inRange(med, 0.41, 0.49));
  }
  {
    const { P, n } = st('Fin_Pelvic', 'bind');
    let lo = Infinity, hi = -Infinity, ymin = Infinity, zmax = 0; for (let i = 0; i < n; i++) { lo = Math.min(lo, P[i * 3]); hi = Math.max(hi, P[i * 3]); ymin = Math.min(ymin, P[i * 3 + 1]); zmax = Math.max(zmax, Math.abs(P[i * 3 + 2])); }
    gate('shape pelvic length (HL)', fmt(hi - lo), '0.3-0.5', inRange(hi - lo, 0.3, 0.5));
    const rootY = Math.min(...D.Fin_Pelvic.rays.map((r) => r.base[1])), depthP = rootY - ymin;
    gate('shape pelvic bind cup: deepest under its root (HL) / depth ÷ half-span', `${fmt(depthP)} / ${fmt(depthP / zmax)}`, '≤ 0.13 / ≤ 0.75', depthP <= 0.13 && depthP / zmax <= 0.75);
  }
  const firstBase = (name) => Math.min(...D[name].rays.map((r) => r.base[0]));
  const d1e = maxS('Fin_Dorsal1', 'fold'), d2o = firstBase('Fin_Dorsal2');
  gate('clear D1 folded ends before D2 (s HL)', `${fmt(d1e)} < ${fmt(d2o)}`, '<', d1e < d2o);
  const cp = firstBase('Fin_Caudal');
  for (const nm of ['Fin_Dorsal2', 'Fin_Anal']) { const e = maxS(nm, 'fold'); gate(`clear ${nm} folded ends before the caudal's procurrent rays`, `${fmt(e)} < ${fmt(cp)}`, '<', e < cp); }
  const minDist = (A, B) => { let d = Infinity; for (let i = 0; i < A.n; i += 2) for (let j = 0; j < B.n; j += 2) { const x = A.P[i * 3] - B.P[j * 3], y = A.P[i * 3 + 1] - B.P[j * 3 + 1], z = A.P[i * 3 + 2] - B.P[j * 3 + 2]; const q = x * x + y * y + z * z; if (q < d) d = q; } return Math.sqrt(d); };
  let worst = Infinity, at = '';
  for (const [a, b] of [['bind', 'bind'], ['fold', 'bind'], ['spread', 'spread'], ['bind', 'plant'], ['spread', 'plant'], ['fold', 'plant'], ['spread', 'bind']]) {
    const dd = minDist(st('Fin_Pelvic', a), st('Fin_Pectoral_L', b));
    if (dd < worst) { worst = dd; at = `pelvic ${a} / pectoral ${b}`; }
  }
  gate('clear pelvic ↔ pectoral blade (HL, worst bind-space pairing)', `${fmt(worst)} (${at})`, '≥ 0.01', worst >= 0.01);
}

// 16 the lod2 cards follow the hero's states (bind space): in the states that meet the ground (the median fins', the
//    caudal's and the pelvic's fold, the pectorals' plant) the card's lowest point (along −y; the planted pectoral
//    along −def.sole.normal, the ground) within 0.3 mm of the hero fin's in the same state; in every state its
//    highest within 0.05 HL (D1 folded: round B1's card stayed half raised, 0.455 HL against 0.074)
{
  let worstLo = 0, worstHi = 0, at = '';
  for (const d of defs) {
    for (const stn of ['bind', 'fold', ...(d.type === 'pectoral' ? ['plant'] : [])]) {
      const c = finCard(d, { state: stn });
      const { P, n } = st(d.name, stn);
      const down = stn === 'plant' && d.sole ? d.sole.normal.map((v) => -v) : [0, -1, 0];
      let hLo = -Infinity, hHi = Infinity, cLo = -Infinity, cHi = Infinity;
      for (let i = 0; i < n; i++) { const h = (P[i * 3] * down[0] + P[i * 3 + 1] * down[1] + P[i * 3 + 2] * down[2]) * HL; hLo = Math.max(hLo, h); hHi = Math.min(hHi, h); }
      for (let i = 0; i < c.position.length / 3; i++) { const h = c.position[i * 3] * down[0] + c.position[i * 3 + 1] * down[1] + c.position[i * 3 + 2] * down[2]; cLo = Math.max(cLo, h); cHi = Math.min(cHi, h); }
      const ground = d.type === 'pectoral' ? stn === 'plant' : stn === 'fold';
      const dLo = ground ? Math.abs(cLo - hLo) : 0, dHi = Math.abs(cHi - hHi) / HL;
      if (args.includes('--verbose')) console.log(`  card ${d.name} ${stn}: lowest ${fmt(dLo)} mm, highest ${fmt(dHi)} HL`);
      if (dLo > worstLo) { worstLo = dLo; at = `${d.name} ${stn}`; }
      worstHi = Math.max(worstHi, dHi);
    }
  }
  gate('lod2 cards vs hero: lowest point on the ground states (mm) / highest, every state (HL)', `${fmt(worstLo)} (${at}) / ${fmt(worstHi)}`, '≤ 0.3 / ≤ 0.05', worstLo <= 0.3 && worstHi <= 0.05);
}

// 10 the caudal's root on the end plate
{
  const d = D.Fin_Caudal, pr = d.rays.filter((r) => r.kind === 'soft');
  // (the plate: the body's section just in front of the principal rays' bases)
  const sF = Math.min(...pr.map((r) => r.base[0])) - 0.01, pl = { s: sF + 0.01, top: skinY(sF, 1), bottom: skinY(sF, -1) };
  const dTop = pl.top - pr[0].base[1], dBot = pr[pr.length - 1].base[1] - pl.bottom;
  gate('caudal principal bases within 0.02 HL of the end\'s dorsal / ventral skin (HL)', `${fmt(dTop)} / ${fmt(dBot)}`, '≤ 0.02 / ≤ 0.02', dTop <= 0.02 && dBot <= 0.02);
  // the side outline: the top and bottom envelope of body ∪ fin by s (the fin's triangles' edges sampled finer than the
  // bins), its notches (a dip under the chord of ±0.03)
  const ds = 0.005, s0 = pl.s - 0.15, s1 = pl.s + 0.25, nb = Math.round((s1 - s0) / ds);
  for (const state of ['bind', 'fold']) {
    const { P, m } = st('Fin_Caudal', state), I = m.indices;
    const top = new Float64Array(nb + 1).fill(-Infinity), bot = new Float64Array(nb + 1).fill(Infinity);
    const put = (s, y) => { const b = Math.round((s - s0) / ds); if (b < 0 || b > nb) return; top[b] = Math.max(top[b], y); bot[b] = Math.min(bot[b], y); };
    for (let t = 0; t < I.length; t += 3)
      for (let e = 0; e < 3; e++) {
        const a = I[t + e] * 3, b = I[t + ((e + 1) % 3)] * 3, steps = Math.max(1, Math.ceil(Math.abs(P[b] - P[a]) / (ds * 0.4)));
        for (let j = 0; j <= steps; j++) { const f = j / steps; put(P[a] + (P[b] - P[a]) * f, P[a + 1] + (P[b + 1] - P[a + 1]) * f); }
      }
    for (let b = 0; b <= nb; b++) {
      const s = s0 + b * ds;
      if (F(s, prof.at(Math.min(s, 4.3)).yc, 0) < 0) { top[b] = Math.max(top[b], skinY(s, 1)); bot[b] = Math.min(bot[b], skinY(s, -1)); }
    }
    let notchT = 0, notchB = 0, atT = 0, atB = 0;
    const w = Math.round(0.03 / ds);
    for (let b = w; b + w <= nb; b++) {
      if (!Number.isFinite(top[b - w]) || !Number.isFinite(top[b + w]) || !Number.isFinite(top[b])) continue;
      const cT = (top[b - w] + top[b + w]) / 2 - top[b], cB = bot[b] - (bot[b - w] + bot[b + w]) / 2;
      if (cT > notchT) { notchT = cT; atT = s0 + b * ds; }
      if (cB > notchB) { notchB = cB; atB = s0 + b * ds; }
    }
    gate(`caudal ${state}: side outline notch top / bottom (HL, at s)`, `${fmt(notchT)} (${fmt(atT)}) / ${fmt(notchB)} (${fmt(atB)})`, '≤ 0.006', notchT <= 0.006 && notchB <= 0.006);
  }
  // the fleshy base: the body's half-width just in front of the face over the root lens' half-thickness
  const m = meshes.hero.Fin_Caudal;
  let worstR = 0;
  pr.forEach((r) => {
    const k = d.rays.indexOf(r);
    let hz = 0;
    for (let i = 0; i < m.position.length / 3; i++) if (Math.abs(m.ray[i] - k) < 1e-6 && m.rayT[i] <= 0.03) hz = Math.max(hz, Math.abs(m.position[i * 3 + 2]) / HL);
    const s = r.base[0] - 0.003, y = r.base[1];
    let a = 0, b = 0.3; for (let i = 0; i < 40; i++) { const mm = (a + b) / 2; if (F(s, y, mm) < 0) a = mm; else b = mm; }
    if (hz > 0) worstR = Math.max(worstR, a / hz);
  });
  gate('caudal: body half-width at the plate ÷ the root lens\' half-thickness (worst ray; report: B2\'s end-plate design)', fmt(worstR), 'report (≤ 2.5)', true);
  // (round B3) the roots embedded: each principal ray's base inside the body, and the ray inside it from its base for
  // ≥ 0.08 HL (its own vertices near the ray line ordered up the ray: the first one outside the body)
  let baseOut = -Infinity; pr.forEach((r) => { baseOut = Math.max(baseOut, F(...r.base)); });
  gate('caudal: principal ray bases inside the body (field max, HL)', fmt(baseOut), '< 0', baseOut < 0);
  for (const state of ['bind', 'fold', 'spread']) {
    const { P } = st('Fin_Caudal', state);
    const per = pr.map((r) => {
      const k = d.rays.indexOf(r), vs = [];
      for (let i = 0; i < m.position.length / 3; i++) if (Math.abs(m.ray[i] - k) < 0.12) vs.push(i);
      vs.sort((a, b) => m.rayT[a] - m.rayT[b]);
      for (const i of vs) if (F(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) >= 0) return m.rayT[i] * r.len;
      return r.len;
    });
    const inner = per.slice(1, -1), lo = Math.min(...per), loIn = Math.min(...inner);
    gate(`caudal ${state}: principal rays inside the body from the base (HL; min all / inner 15 / marginal pair)`, `${fmt(lo)} / ${fmt(loIn)} / ${fmt(per[0])}, ${fmt(per[per.length - 1])}`, '≥ 0.08', lo >= 0.08);
  }
}

// 11 the pectoral's plant
{
  const d = D.Fin_Pectoral_L, m = meshes.hero.Fin_Pectoral_L;
  // (a fins module without def.sole, round B1's: its plant laid the blade square to the forearm from rayT 0.35)
  const so = d.sole ?? { normal: nrm(sub(K.pectoral.elbow, K.pectoral.wrist)), from: { rayT: d.rays.map(() => 0.33) }, heel: [NaN, NaN, NaN] };
  const { P, n } = st('Fin_Pectoral_L', 'plant');
  const nS = so.normal, sel = [];
  for (let i = 0; i < n; i++) { const k = Math.round(m.ray[i]); if (Math.abs(m.ray[i] - k) < 0.2 && m.rayT[i] >= so.from.rayT[k] + 0.02) sel.push(i); }
  // plane fit (least squares through the centroid: the smallest eigenvector, by power iteration on the inverse-shifted covariance)
  const c = [0, 0, 0]; sel.forEach((i) => { for (let j = 0; j < 3; j++) c[j] += P[i * 3 + j] / sel.length; });
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  sel.forEach((i) => { const v = [P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += v[a] * v[b]; });
  let nfit = nS.slice();
  const tr = C[0][0] + C[1][1] + C[2][2];
  for (let it = 0; it < 200; it++) { const M = [0, 1, 2].map((a) => [0, 1, 2].map((b) => (a === b ? tr : 0) - C[a][b])); nfit = nrm([0, 1, 2].map((a) => M[a][0] * nfit[0] + M[a][1] * nfit[1] + M[a][2] * nfit[2])); }
  const tilt = Math.acos(Math.min(1, Math.abs(dot(nfit, nS)))) * DEG;
  gate('plant: sole plane vs def.sole.normal (deg)', fmt(tilt), '≤ 2', tilt <= 2);
  let lo = Infinity, hi = -Infinity, loU = Infinity, hiU = -Infinity;
  sel.forEach((i) => { const h = dot([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], nS) * HL; lo = Math.min(lo, h); hi = Math.max(hi, h); });
  // (the underside: the vertices whose normal faces the ground)
  const tg = TG.hero.Fin_Pectoral_L, kP = tg.names.indexOf('plant');
  sel.forEach((i) => { const nn = [0, 1, 2].map((j) => m.normal[i * 3 + j] + tg.normals[kP][i * 3 + j]); if (dot(nn, nS) < -0.5) { const h = dot([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], nS) * HL; loU = Math.min(loU, h); hiU = Math.max(hiU, h); } });
  gate('plant: sole vertices above its lowest (mm) / underside spread (mm)', `${fmt(hi - lo)} / ${fmt(hiU - loU)} (${sel.length} vertices)`, '≤ 0.15 / ≤ 0.10', hi - lo <= 0.15 && hiU - loU <= 0.1);
  const u = nrm(sub(K.pectoral.wrist, K.pectoral.elbow));
  const mid = [(d.rays.length - 1) >> 1, d.rays.length >> 1].map((k) => d.rays[k].base).reduce((a, b) => a.map((v, i) => (v + b[i]) / 2));
  const heel = so.heel.map((v) => v / HL), inner = nrm(sub(heel, mid)), ang = Math.acos(dot(inner, u)) * DEG, hd = Math.hypot(...sub(heel, mid));
  gate('plant: inner blade (bases → heel) vs the lobe (deg) / heel from the bases (HL)', `${fmt(ang)} / ${fmt(hd)}`, '≤ 10 / 0.25-0.32', ang <= 10 && hd >= 0.25 && hd <= 0.32);
}

// 12 the pectoral's fold in the arm's rest pose: on the flank
if (!D.Fin_Pectoral_L.space) gate('fold (rest pose): the fins module authors no rest pose', 'n/a', '≥ 0 / ≤ 0.3', false);
else {
  const d = D.Fin_Pectoral_L, sp = d.space('fold'), m = meshes.hero.Fin_Pectoral_L;
  const { P, n } = st('Fin_Pectoral_L', 'fold');
  let lo = Infinity, hi = -Infinity, cnt = 0;
  for (let i = 0; i < n; i++) {
    if (m.rayT[i] < 0.3) continue;
    const q = sp.to([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]), dd = sp.f(q) * HL;
    lo = Math.min(lo, dd); hi = Math.max(hi, dd); cnt++;
  }
  gate('fold (rest pose): blade past rayT 0.3 off the flank, min / max (mm)', `${fmt(lo)} / ${fmt(hi)} (${cnt} vertices)`, '≥ 0 / ≤ 0.3', lo >= 0 && hi <= 0.3);
}

// 13 the pelvic's fold hugs the belly
{
  const m = meshes.hero.Fin_Pelvic, { P, n } = st('Fin_Pelvic', 'fold');
  let worst = Infinity, at = null, zmax = 0;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const r = [m.root[i * 3] / HL, m.root[i * 3 + 1] / HL, m.root[i * 3 + 2] / HL];
    zmax = Math.max(zmax, Math.abs(z));
    if (Math.hypot(x - r[0], y - r[1], z - r[2]) <= 0.02) continue;
    const below = y - skinY(x, -1, 0);
    if (below < worst) { worst = below; at = [x, z]; }
  }
  gate('pelvic fold: lowest vertex vs the skin above it (HL) / max |z| (HL)', `${fmt(worst)} (s ${fmt(at[0])}, z ${fmt(at[1])}) / ${fmt(zmax)}`, '≥ −0.01 / ≤ 0.10', worst >= -0.01 && zmax <= 0.10);
}

// 14 posed: the axial chain pitched and yawed ±8° a joint (and the tail-up arch), the folded median fins and caudal
// against the posed body
{
  const R = await import('./rig.mjs');
  const { JOINTS, J, NJ, finWeights, axialRow } = R;
  const chain = ['J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'];
  const rot = (axis, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), [x, y, z] = axis; return [[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s], [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s], [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]]; };
  const mm3 = (A, B) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => A[r][0] * B[0][c] + A[r][1] * B[1][c] + A[r][2] * B[2][c]));
  const ap = (A, v) => [dot(A[0], v), dot(A[1], v), dot(A[2], v)];
  // world transforms (R, t: x ↦ R x + t, fish mm) of every joint for a pose { name: [axis, deg] }
  const posed = (pose) => {
    const W = new Array(NJ);
    JOINTS.forEach((j, i) => {
      const pa = j.parent ? W[J[j.parent]] : { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
      const L = pose[j.name] ? rot(...pose[j.name]) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      // local: about the joint's pivot
      const Rw = mm3(pa.R, L), piv = j.at, tw = sub(ap(pa.R, sub(piv, ap(L, piv))), [0, 0, 0]).map((v, k) => v + pa.t[k]);
      W[i] = { R: Rw, t: tw };
    });
    return W;
  };
  const blend = (W, ws) => { const Rb = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], tb = [0, 0, 0]; ws.forEach(([j, w]) => { for (let a = 0; a < 3; a++) { tb[a] += w * W[j].t[a]; for (let b = 0; b < 3; b++) Rb[a][b] += w * W[j].R[a][b]; } }); return { R: Rb, t: tb }; };
  const inv3 = (A) => { const [[a, b, c], [d, e, f], [g, h, i]] = A, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g); return [[(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det], [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det], [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]]; };
  const row = new Float32Array(NJ);
  const bodyBlend = (W, sHL) => { row.fill(0); axialRow(sHL, row, 1); const ws = []; for (let j = 0; j < NJ; j++) if (row[j] > 1e-6) ws.push([j, row[j]]); return blend(W, ws); };
  // a posed point → the bind point of the body that lands there (fixed point over the body's s), its field
  const unpose = (W, q) => { let p = q; for (let it = 0; it < 8; it++) { const M = bodyBlend(W, p[0] / HL); p = ap(inv3(M.R), sub(q, M.t)); } return p; };
  const poses = {
    'pitch +8°/joint': Object.fromEntries(chain.map((n) => [n, [[0, 0, 1], 8]])), 'pitch −8°/joint': Object.fromEntries(chain.map((n) => [n, [[0, 0, 1], -8]])),
    'yaw +8°/joint': Object.fromEntries(chain.map((n) => [n, [[0, 1, 0], 8]])), 'yaw −8°/joint': Object.fromEntries(chain.map((n) => [n, [[0, 1, 0], -8]])),
    // (round B1's fins review, m3 tailUpFold: the rear spine arched up 0, 2, 4, 8, 12, 14, 14° and the caudal 30°)
    'tail up (0,2,4,8,12,14,14 + caudal 30°)': Object.fromEntries(chain.map((n, i) => [n, [[0, 0, 1], [0, 2, 4, 8, 12, 14, 14, 30][i]]])),
  };
  // (and, reported beside the rig's own weights, the rule fins.mjs proposes for them: past the root's ease each
  // median-fin vertex on the axial row at lerp(baseS, foldS, smoothstep(0.15, 0.6, rayT)), the vertebrae under the
  // folded ray)
  const proposed = (m) => {
    const n = m.position.length / 3, joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4), row = new Float32Array(NJ);
    for (let v = 0; v < n; v++) {
      row.fill(0);
      const s = m.baseS[v] + (m.foldS[v] - m.baseS[v]) * Math.min(1, Math.max(0, (m.rayT[v] - 0.15) / 0.45)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, (m.rayT[v] - 0.15) / 0.45)));
      axialRow((m.type === 'caudal' ? m.position[v * 3] : s) / HL, row, 1);
      const top = [...row.keys()].sort((a, b) => row[b] - row[a]).slice(0, 4);
      let sum = 0; top.forEach((j) => (sum += row[j]));
      top.forEach((j, k) => { joints[v * 4 + k] = j; weights[v * 4 + k] = Math.round((255 * row[j]) / sum); });
    }
    return { joints, weights };
  };
  // (round B3: the caudal's roots are embedded in the peduncle's tongue, so its test field is its clearance field
  // def.space (the body but for the tongue's inside), and the vertices hidden in the body in the bind must stay hidden)
  const pose14 = { ...poses, 'caudal yaw 30°': { J_caudal: [[0, 1, 0], 30] } };
  for (const name of ['Fin_Dorsal1', 'Fin_Dorsal2', 'Fin_Anal', 'Fin_Caudal']) {
    const d = D[name], m = meshes.hero[name], tg = TG.hero[name], kf = tg.names.indexOf('fold'), n = m.position.length / 3;
    const sp = d.space ? d.space('fold') : null;
    const hidden = sp ? new Set([...Array(n).keys()].filter((v) => fmm(...[0, 1, 2].map((c) => m.position[v * 3 + c] + tg.deltas[kf][v * 3 + c])) / HL < -0.001)) : null;
    for (const [wn, w] of [['rig.finWeights', finWeights(d, m)], ...(m.foldS ? [['proposed foldS rule (report)', proposed({ ...m, type: d.type })]] : [])]) {
      for (const [pn, pose] of Object.entries(sp ? pose14 : poses)) {
        const W = posed(pose);
        let inside = 0, worst = 0, out = 0, worstOut = 0;
        for (let v = 0; v < n; v++) {
          const p = [0, 1, 2].map((c) => m.position[v * 3 + c] + tg.deltas[kf][v * 3 + c]);
          const ws = []; for (let k = 0; k < 4; k++) if (w.weights[v * 4 + k]) ws.push([w.joints[v * 4 + k], w.weights[v * 4 + k] / 255]);
          const M = blend(W, ws), q = ap(M.R, p).map((c, i) => c + M.t[i]), u = unpose(W, q);
          if (hidden?.has(v)) { const dd = fmm(...u); if (dd > 0) { out++; worstOut = Math.max(worstOut, dd * HL); } }
          // (past the root's ease, where finWeights blends the fin's own rule in from the body's row)
          if (m.rayT[v] < 0.15) continue;
          const dd = sp ? sp.f(u.map((c) => c / HL)) * HL : fmm(...u) * HL;
          if (dd < -0.05) { inside++; worst = Math.min(worst, dd); }
        }
        const report = wn !== 'rig.finWeights';
        gate(`posed ${pn} (${wn}): ${name} folded, vertices > 0.05 mm inside the ${sp ? 'clearance field (def.space)' : 'body'}`, `${inside} (deepest ${fmt(worst)} mm)`, report ? 'report' : '0', report || inside === 0);
        if (hidden && !report) gate(`posed ${pn}: ${name} folded, of the ${hidden.size} vertices hidden in the bind body, come out`, `${out} (max ${fmt(worstOut)} mm)`, '0', out === 0);
      }
    }
  }
}

let fail = 0;
for (const r of results) { if (!r.pass) fail++; console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}: ${r.value}  (target ${r.target})`); }
console.log(`${results.length - fail}/${results.length} gates pass`);
if (argOf('--json')) fs.writeFileSync(argOf('--json'), JSON.stringify({ body: bodyName, results }, null, 1));
process.exit(fail ? 1 : 0);
