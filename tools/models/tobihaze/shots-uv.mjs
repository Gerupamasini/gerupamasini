#!/usr/bin/env node
// The skin's tiers checked: meshing, topology, UV charts, the face's detail and the silhouettes, with renders.
//   node tools/models/tobihaze/shots-uv.mjs seal                 the sealed fields' acceptance (seal.mjs)
//   node tools/models/tobihaze/shots-uv.mjs tiers [hero,lod1,lod2] build each tier (fishmesh.bodyTierMesh), print its
//                                                                topology, regions and per-chart UV quality, keep it in
//                                                                the work dir and write a GLB with a UV checker
//   node tools/models/tobihaze/shots-uv.mjs hausdorff            the hero against its dense mesh, per face region
//   node tools/models/tobihaze/shots-uv.mjs sil                  lod1 / lod2 silhouettes against the hero's (pixel IoU)
//   node tools/models/tobihaze/shots-uv.mjs gates --cache <hero data> [--tiers hero,lod1,lod2] [--json <file>]
//                                                                the tiers as build.mjs makes them (heroData's dense mesh
//                                                                charted anew, lighterSkin): topology (welded by source and
//                                                                by position), UV folds / collapsed / outside / overlap,
//                                                                texel density, tangents, the patch's islands — where, and
//                                                                how much of each the skin shows from 42 directions (round
//                                                                B3) — and lod2's axial edges and dome charts
//   node tools/models/tobihaze/shots-uv.mjs render [--port 5324] [--which tex,clay,ncheck] the checker GLBs (textured),
//                                                                the hero against the dense mesh (clay macros) and the
//                                                                tangent-space checker normal maps, through render.mjs
// As a shots module (render.mjs --shots shots-uv.mjs) it exports SHOTS: the textured views (side, top, front, under,
// 3/4, the face macro), or with UV_SHOTS=clay the macros of the mouth, the eye, the gill slit and the nostril.
// Work files go to $UV_WORK (default the session's scratch dir) and out/mesh/.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HL, HEAD, EYE_MM, toObject } from './anatomy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- shots (object-frame boxes from fish-frame HL)
const box = (s0, s1, y0, y1, z0, z1) => {
  const a = toObject([s0 * HL, y0 * HL, z0 * HL]), b = toObject([s1 * HL, y1 * HL, z1 * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
export const BOXES = {
  mouth: box(-0.02, 0.42, -0.01, 0.32, -0.33, 0.33), mouthL: box(-0.02, 0.42, -0.01, 0.32, 0.0, 0.33),
  eye: box(0.18, 0.50, 0.40, 0.78, 0.0, 0.30), gill: box(0.85, 1.20, 0.08, 0.48, 0.1, 0.42),
  nostril: box(-0.02, 0.16, 0.28, 0.46, -0.02, 0.16),
};
const tex = (name, view) => ({ name, mode: 'textured', view: { fit: 'body', margin: 0.06, ...view } });
const clay = (name, view) => ({ name, mode: 'clay', view: { margin: 0.04, fov: 24, ...view } });
const TEX = [
  tex('t_side', { azim: 90, elev: 0, ortho: true }),
  tex('t_top', { azim: 0, elev: 90, ortho: true, topUp: 1 }),
  tex('t_front', { azim: 0, elev: 0, ortho: true }),
  tex('t_under', { azim: 0, elev: -90, ortho: true, topUp: 1 }),
  tex('t_q34', { azim: 40, elev: 22, fov: 25 }),
  tex('t_face', { fit: 'face', azim: 25, elev: 22, fov: 20 }),
];
const CLAY = [
  clay('m_side', { fit: BOXES.mouthL, azim: 90, elev: 0 }),
  clay('m_front', { fit: BOXES.mouth, azim: 0, elev: 0 }),
  clay('m_low', { fit: BOXES.mouth, azim: 25, elev: -25 }),
  clay('e_q34', { fit: BOXES.eye, azim: 45, elev: 10 }),
  clay('e_top', { fit: BOXES.eye, azim: 60, elev: 50 }),
  clay('g_side', { fit: BOXES.gill, azim: 100, elev: 5 }),
  clay('g_back', { fit: BOXES.gill, azim: 150, elev: 10 }),
  clay('n_front', { fit: BOXES.nostril, azim: 20, elev: 5 }),
];
export const SHOTS = (process.env.UV_SHOTS ?? 'tex') === 'clay' ? CLAY : TEX;

// ---- the command line

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const WORK = process.env.UV_WORK ?? '/tmp/claude-0/-home-user-gerupamasini/2d93d55d-46eb-5657-8d95-9431085fe97d/scratchpad/ref/work/b3_tech/uv';
  const OUT = path.join(here, 'out', 'mesh');
  fs.mkdirSync(WORK, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${m}`);
  const report = (name, obj) => fs.writeFileSync(path.join(WORK, `report_${name}.json`), JSON.stringify(obj, null, 1));
  if (cmd === 'seal') return sealCmd(log, report);
  if (cmd === 'tiers') return tiersCmd((args[1] && !args[1].startsWith('--') ? args[1] : 'hero,lod1,lod2').split(','), { WORK, OUT, log, report });
  if (cmd === 'hausdorff') return hausdorffCmd({ WORK, log, report });
  if (cmd === 'sil') return silCmd({ WORK, OUT, log, report });
  if (cmd === 'render') return renderCmd({ WORK, OUT, log, port: Number(arg('--port', 5324)), which: arg('--which', 'tex,clay') });
  if (cmd === 'gates') return gatesCmd({ cache: arg('--cache', null), tiers: arg('--tiers', 'hero,lod1,lod2').split(','), json: arg('--json', null), log });
  if (cmd === 'morphs') return morphsCmd({ WORK, log, report, h: Number(arg('--h', 0.09)), weights: arg('--weights', '0,0.05,0.25').split(',').map(Number) });
  console.log('usage: shots-uv.mjs seal | tiers [hero,lod1,lod2] | hausdorff | sil | gates --cache <file> | render [--port 5324] | morphs');
}

// ---- the extra attributes: proxy head morphs (the jaw dropped 20° about J_jaw, each cup lowered 0.08 HL, the cheeks
// swollen 0.04 HL along their normals) given to the hero's simplification at a few weights; each pose of the dense
// mesh against the same pose of the hero (its vertices moved by their dense vertex's displacement)
async function morphsCmd({ WORK, log, report, h, weights }) {
  const { bodyTierMesh, ready, fishDense, tierField } = await import('./fishmesh.mjs');
  const { HEAD_SCULPT } = await import('./head.mjs');
  const { gapeSide } = await import('./headrig.mjs');
  const { smoothstep } = await import('./sdf.mjs');
  await ready;
  const field = tierField('full');
  const dense = fishDense({ h, field, log });
  const P = dense.position, N = dense.normal, n = P.length / 3, head = field.hl.head, isLower = gapeSide(HEAD_SCULPT);
  const D = { gape: new Float32Array(n * 3), blink: new Float32Array(n * 3), inflate: new Float32Array(n * 3) };
  const E = HEAD.eye, re = E.d / 2, th = (-20 * Math.PI) / 180, piv = [0.372, 0.095];
  for (let v = 0; v < n; v++) {
    const x = P[v * 3] / HL, y = P[v * 3 + 1] / HL, z = P[v * 3 + 2] / HL;
    if (x < 0.36 && y < 0.2 && isLower(x, y, head.parts(x, y, z))) {
      const w = 1 - smoothstep(0.30, 0.36, x), a = th * w, dx = x - piv[0], dy = y - piv[1];
      D.gape[v * 3] = (dx * Math.cos(a) - dy * Math.sin(a) - dx) * HL; D.gape[v * 3 + 1] = (dx * Math.sin(a) + dy * Math.cos(a) - dy) * HL;
    }
    const r = Math.hypot(x - E.s, y - E.y, Math.abs(z) - E.z);
    if (r < re + 0.06) D.blink[v * 3 + 1] = -0.08 * HL * (1 - smoothstep(re + 0.005, re + 0.06, r));
    if (x > 0.35 && x < 1.05 && y > 0 && y < 0.45) {
      const w = Math.sin(Math.PI * (x - 0.35) / 0.7) * Math.sin(Math.PI * y / 0.45);
      for (let k = 0; k < 3; k++) D.inflate[v * 3 + k] = N[v * 3 + k] * 0.04 * HL * w;
    }
  }
  const data = new Float32Array(n * 9), sc = 1 / (0.01 * HL);
  for (let v = 0; v < n; v++) ['gape', 'blink', 'inflate'].forEach((k, j) => { for (let q = 0; q < 3; q++) data[v * 9 + j * 3 + q] = D[k][v * 3 + q] * sc; });
  const out = {};
  for (const w of weights) {
    const m = bodyTierMesh('hero', { dense, extraAttrs: w > 0 ? { data, weights: new Array(9).fill(w) } : undefined, log: () => {} });
    const row = {};
    for (const k of ['rest', 'gape', 'blink', 'inflate']) {
      const d = k === 'rest' ? null : D[k];
      const tp = Float32Array.from(m.position);
      if (d) for (let i = 0; i < m.source.length; i++) for (let q = 0; q < 3; q++) tp[i * 3 + q] += d[m.source[i] * 3 + q];
      const dist = pointMeshDistance({ position: tp, indices: m.indices });
      let mx = 0; const all = [];
      for (let v = 0; v < n; v++) {
        if (d && !(Math.abs(d[v * 3]) + Math.abs(d[v * 3 + 1]) + Math.abs(d[v * 3 + 2]) > 1e-6)) continue;
        if (!d && P[v * 3] > 1.32 * HL) continue;
        const p = [P[v * 3] + (d ? d[v * 3] : 0), P[v * 3 + 1] + (d ? d[v * 3 + 1] : 0), P[v * 3 + 2] + (d ? d[v * 3 + 2] : 0)];
        const e = dist(p); all.push(e); mx = Math.max(mx, e);
      }
      all.sort((a, b) => a - b);
      row[k] = { max: mx, p99: all[Math.floor(all.length * 0.99)], mean: all.reduce((a, b) => a + b, 0) / all.length, n: all.length };
    }
    out[w] = row;
    log(`weight ${w}: ${Object.entries(row).map(([k, r]) => `${k} max ${r.max.toFixed(4)} p99 ${r.p99.toFixed(4)} mm`).join(' | ')}`);
  }
  report('morphs', out);
}

// ---- gates: the skin tiers as build.mjs makes them (round B3)
/** The triangles that win a pixel of an orthographic z-buffer from any of `nDir` directions (a Fibonacci sphere),
 * `px` mm per pixel: Uint8Array per triangle. */
export function visibleTriangles(P, I, { nDir = 42, px = 0.05 } = {}) {
  const nt = I.length / 3, vis = new Uint8Array(nt), n = P.length / 3, X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  for (let d = 0; d < nDir; d++) {
    const z = 1 - (2 * (d + 0.5)) / nDir, r = Math.sqrt(1 - z * z), ph = d * Math.PI * (3 - Math.sqrt(5)), D = [r * Math.cos(ph), r * Math.sin(ph), z];
    const a = Math.abs(D[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let e1 = [D[1] * a[2] - D[2] * a[1], D[2] * a[0] - D[0] * a[2], D[0] * a[1] - D[1] * a[0]];
    const l1 = Math.hypot(...e1); e1 = e1.map((x) => x / l1);
    const e2 = [D[1] * e1[2] - D[2] * e1[1], D[2] * e1[0] - D[0] * e1[2], D[0] * e1[1] - D[1] * e1[0]];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let v = 0; v < n; v++) {
      const p0 = P[v * 3], p1 = P[v * 3 + 1], p2 = P[v * 3 + 2];
      X[v] = p0 * e1[0] + p1 * e1[1] + p2 * e1[2]; Y[v] = p0 * e2[0] + p1 * e2[1] + p2 * e2[2]; Z[v] = p0 * D[0] + p1 * D[1] + p2 * D[2];
      x0 = Math.min(x0, X[v]); y0 = Math.min(y0, Y[v]); x1 = Math.max(x1, X[v]); y1 = Math.max(y1, Y[v]);
    }
    const W = Math.ceil((x1 - x0) / px) + 2, H = Math.ceil((y1 - y0) / px) + 2, zb = new Float32Array(W * H).fill(-Infinity), id = new Int32Array(W * H).fill(-1);
    for (let t = 0; t < nt; t++) {
      const A = I[t * 3], B = I[t * 3 + 1], C = I[t * 3 + 2];
      const ax = (X[A] - x0) / px, ay = (Y[A] - y0) / px, bx = (X[B] - x0) / px, by = (Y[B] - y0) / px, cx = (X[C] - x0) / px, cy = (Y[C] - y0) / px;
      const den = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(den) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const j0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), j1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = i + 0.5, y = j + 0.5, w1 = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / den, w2 = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / den, w3 = 1 - w1 - w2;
        if (w1 < 0 || w2 < 0 || w3 < 0) continue;
        const zz = w1 * Z[A] + w2 * Z[B] + w3 * Z[C], k = j * W + i;
        if (zz > zb[k]) { zb[k] = zz; id[k] = t; }
      }
    }
    for (let k = 0; k < id.length; k++) if (id[k] >= 0) vis[id[k]] = 1;
  }
  return vis;
}

async function gatesCmd({ cache, tiers: which, json, log }) {
  const { HEAD_SCULPT } = await import('./head.mjs');
  const { marginCurve } = await import('./headrig.mjs');
  const { BODY_SCULPT } = await import('./body.mjs');
  const { meshTopology, TIERS: MT, ready, bodyTierMesh, morphAttrs } = await import('./fishmesh.mjs');
  const { uvStats } = await import('./charts.mjs');
  const { tangentCheck } = await import('./tiers.mjs');
  const { JOINTS } = await import('./rig.mjs');
  const { heroData, lighterSkin } = await import('./build.mjs');
  await ready;
  const H = await heroData({ cache, log: () => {} });
  const tiers = {};
  // (the hero's tier charted anew from the cached dense mesh: the cache keeps the tier it was made with)
  if (which.includes('hero')) tiers.hero = bodyTierMesh('hero', { dense: H.dense, extraAttrs: morphAttrs(['blinkL', 'blinkR', 'gape', 'vent', 'inflate', 'throat'].map((k) => H.D[k])) });
  for (const t of ['lod1', 'lod2']) if (which.includes(t)) tiers[t] = lighterSkin(t, H, () => {}).tier;
  const E = HEAD.eye, re = E.d / 2, sOp = marginCurve(HEAD_SCULPT.opercle.path), PC = BODY_SCULPT.pectoral;
  const where = (c, cls, src) => {
    const [s, y, z] = c.map((x) => x / HL);
    if (cls.mouth?.[src]) return 'mouth walls';
    if (cls.gill?.[src]) return 'gill pocket';
    if (Math.hypot(s - E.s, y - E.y, Math.abs(z) - E.z) < re + 0.1) return 'eye';
    if (s < 0.36 && y < 0.25) return 'lips/mouth';
    if (y > 0.12 && y < 0.45 && Math.abs(s - sOp(y)) < 0.08) return 'gill cover';
    if (s < 1.32 && y < 0.06 && Math.abs(z) < 0.35) return 'cheek/throat';
    if (s > 0.95 && s < 1.5 && Math.hypot(s - PC.shoulder[0], y - PC.shoulder[1], Math.abs(z) - PC.shoulder[2]) < 0.18) return 'arm root';
    if (s > 1.0 && s < 1.9 && Math.abs(z) > 0.25 && y < 0.4) return 'arm';
    if (s < 1.32) return 'head other';
    if (s > 4.0) return 'tail';
    return 'trunk';
  };
  const triArea = (P, I, t) => { const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3; const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]; return 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]); };
  const chain = ['J_root', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'].map((nm) => JOINTS.find((j) => j.name === nm).at[0] / HL);
  const out = {};
  for (const [name, m] of Object.entries(tiers)) {
    const R = {}, I = m.indices, P = m.position, nt = I.length / 3;
    const ch = m.charts.map((c) => ({ ...c, hidden: c.hidden ?? c.name === 'hidden', relay: c.relay ?? c.name === 'patch' }));
    const topo = meshTopology(m, { weld: m.source });
    // (welded by position too: two dense vertices at one point, as where lod1's kept lining meets the outer skin)
    const pk = new Map(), wpos = new Uint32Array(P.length / 3);
    for (let v = 0; v < P.length / 3; v++) { const k = `${P[v * 3].toFixed(5)},${P[v * 3 + 1].toFixed(5)},${P[v * 3 + 2].toFixed(5)}`; let j = pk.get(k); if (j === undefined) { j = pk.size; pk.set(k, j); } wpos[v] = j; }
    R.topology = { tris: topo.F, vertices: P.length / 3, components: topo.components, open: topo.open, nonManifold: topo.nonManifold, nonManifoldByPosition: meshTopology(m, { weld: wpos }).nonManifold, genus: topo.genus };
    const ci = ch.findIndex((c) => c.name === 'patch'), st = uvStats(m, ch, { size: MT[name].tex });
    const body = ['bodyL', 'bodyR'].map((nm) => st.charts.find((c) => c.name === nm).density.p50).reduce((a, b) => a + b) / 2;
    R.uv = { folds: st.total.folds, collapsed: st.total.collapsed, outside: st.total.outside, overlapTexels: st.total.overlap, texels: st.total.texels };
    // (round B4: the bake's padding — triangles of an island within 3 texels of another island of their chart whose surface
    // lies > 0.3 mm away: charts.bleedTriangles; 0 = every chart's islands either continue each other or stand apart)
    { const { bleedTriangles } = await import('./charts.mjs'); const bl = bleedTriangles(m, ch, { size: MT[name].tex, gap: 3, mm: 0.3 }); R.uv.bleedTris = bl.reduce((a, b) => a + b, 0); }
    R.density = Object.fromEntries(st.charts.filter((c, i) => c.tris && !ch[i].hidden).map((c) => [c.name, +(c.density.p50 / HL * 1000).toFixed(2)]));
    R.patchOverBody = +(st.charts[ci].density.p50 / body).toFixed(2);
    // (round B4: the skin's rects the tier leaves empty, as a share of its atlas — lod2 bakes its own layout,
    // fishmesh BODY_LAYOUT_LOD2; the eyes' rects belong to the eye meshes and are not skin charts)
    { const un = st.charts.map((c, i) => ({ c, r: ch[i].rect })).filter(({ c }) => !c.tris); R.unusedRects = { names: un.map(({ c }) => c.name), share: +un.reduce((a, { r }) => a + (r[2] - r[0]) * (r[3] - r[1]), 0).toFixed(4) }; }
    // the patch's islands (joined through shared vertices): where, and the area the skin shows of each
    const vis = visibleTriangles(P, I, { px: name === 'hero' ? 0.04 : name === 'lod1' ? 0.06 : 0.12 });
    const par = new Int32Array(nt).map((_, i) => i), f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const own = new Map();
    for (let t = 0; t < nt; t++) if (m.triChart[t] === ci) for (let k = 0; k < 3; k++) { const v = I[t * 3 + k], u = own.get(v); if (u === undefined) own.set(v, t); else { const a = f(u), b = f(t); if (a !== b) par[b] = a; } }
    const isl = new Map();
    for (let t = 0; t < nt; t++) if (m.triChart[t] === ci) { const r = f(t); if (!isl.has(r)) isl.set(r, []); isl.get(r).push(t); }
    const byWhere = {};
    let nv = 0, area = 0;
    for (const g of isl.values()) {
      const c = [0, 0, 0]; let A = 0, Av = 0;
      for (const t of g) { const a = triArea(P, I, t); A += a; if (vis[t]) Av += a; for (let k = 0; k < 3; k++) for (let q = 0; q < 3; q++) c[q] += P[I[t * 3 + k] * 3 + q] / (g.length * 3); }
      const w = where(c, m.classes ?? {}, m.source[I[g[0] * 3]]), B = (byWhere[w] ??= { islands: 0, tris: 0, visibleMM2: 0 });
      B.islands++; B.tris += g.length;
      if (Av > 0.05 * A && Av > 0.02) { B.visibleMM2 = +(B.visibleMM2 + Av).toFixed(2); nv++; area += Av; }
    }
    const sizes = [...isl.values()].map((g) => g.length);
    R.patch = { tris: sizes.reduce((a, b) => a + b, 0), islands: sizes.length, singles: sizes.filter((x) => x === 1).length, visibleIslands: nv, visibleMM2: +area.toFixed(2), byWhere };
    const tc = tangentCheck(m.normal, m.tangent);
    R.tangents = { vertices: tc.n, bad: tc.bad };
    if (name === 'lod2') {
      const S = m.source, seen = new Set();
      let over = 0, worst = 0;
      const sp = (s) => { for (let i = 0; i + 1 < chain.length; i++) if (s <= chain[i + 1]) return chain[i + 1] - chain[i]; return chain[chain.length - 1] - chain[chain.length - 2]; };
      for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
        const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3], key = Math.min(S[a], S[b]) * 1e7 + Math.max(S[a], S[b]);
        if (seen.has(key)) continue; seen.add(key);
        const sa = P[a * 3] / HL, sb = P[b * 3] / HL, mid = (sa + sb) / 2;
        if (mid < chain[0] || mid > chain[chain.length - 1]) continue;
        const r = Math.abs(sa - sb) / sp(mid); if (r > 0.6) over++; worst = Math.max(worst, r);
      }
      R.axialEdges = { over06: over, worst: +worst.toFixed(2) };
      // (the skin round each globe by chart, per side: the two eyes charted alike)
      const domes = { L: {}, R: {} };
      for (let t = 0; t < nt; t++) {
        const c = [0, 1, 2].map((q) => (P[I[t * 3] * 3 + q] + P[I[t * 3 + 1] * 3 + q] + P[I[t * 3 + 2] * 3 + q]) / 3 / HL), sd = c[2] >= 0 ? 'L' : 'R';
        const r = Math.hypot(c[0] - E.s, c[1] - E.y, Math.abs(c[2]) - E.z);
        if (r > re + 0.1 || r < re - 0.01) continue;
        const nm = ch[m.triChart[t]].name; domes[sd][nm] = (domes[sd][nm] ?? 0) + 1;
      }
      R.domes = domes;
    }
    out[name] = R;
    log(`${name} ${JSON.stringify(R)}`);
  }
  if (json) fs.writeFileSync(json, JSON.stringify(out, null, 1));
  return out;
}

// ---- seal: the sealed and far fields' topology at h 0.16 and 0.40 (raw surface nets, then the tier's dense skin)
async function sealCmd(log, report) {
  const { surfaceNets } = await import('./mesher.mjs');
  const { fixWinding } = await import('./headrig.mjs');
  const { BODY_BOX, fishDense, tierField, meshTopology } = await import('./fishmesh.mjs');
  const rows = [];
  for (const field of ['full', 'sealed', 'far']) for (const h of [0.16, 0.40]) {
    const f = tierField(field);
    const raw = surfaceNets(f, BODY_BOX, h);
    fixWinding(raw.indices);
    const T = edgeCensus(raw, { box: { s: 0.4 * HL, y: 0.2 * HL } });
    const d = fishDense({ h, field: f });
    const D = meshTopology(d, { weld: Uint32Array.from({ length: d.position.length / 3 }, (_, i) => i) });
    const row = { field, h, raw: { components: T.components, open: T.open, nonManifold: T.nm, gapeBox: T.nmBox }, dense: { tris: D.F, components: D.components, open: D.open, nonManifold: D.nonManifold, pinched: D.pinched, chi: D.chi, genus: D.genus } };
    rows.push(row);
    log(`${field.padEnd(6)} h ${h.toFixed(2)}: raw ${T.components} component(s), ${T.nm} non-manifold edges (${T.nmBox} in the gape box); dense skin ${D.F} tris, ${D.components} component, ${D.open} open, ${D.nonManifold} non-manifold, ${D.pinched} pinched, χ ${D.chi}, genus ${D.genus}`);
  }
  const ok = rows.filter((r) => r.field !== 'full').every((r) => r.raw.components === 1 && r.raw.gapeBox === 0);
  log(`acceptance (sealed and far: one component, no non-manifold edge in the gape box at 0.16 and 0.40): ${ok ? 'PASS' : 'FAIL'}`);
  report('seal', { rows, pass: ok });
}

function edgeCensus(mesh, { box }) {
  const I = mesh.indices, P = mesh.position, n = P.length / 3, E = new Map();
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const q = key(I[t + k], I[t + (k + 1) % 3]); E.set(q, (E.get(q) ?? 0) + 1); }
  let open = 0, nm = 0, nmBox = 0;
  for (const [q, c] of E) {
    if (c === 1) open++;
    if (c > 2) { nm++; const a = Math.floor(q / 4194304), b = q % 4194304; if ((P[a * 3] + P[b * 3]) / 2 < box.s && (P[a * 3 + 1] + P[b * 3 + 1]) / 2 < box.y) nmBox++; }
  }
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < I.length; t += 3) { const a = find(I[t]), b = find(I[t + 1]); if (a !== b) parent[b] = a; const c = find(I[t + 2]); if (c !== find(a)) parent[c] = find(a); }
  const roots = new Set();
  for (let t = 0; t < I.length; t += 3) roots.add(find(I[t]));
  return { components: roots.size, open, nm, nmBox };
}

// ---- tiers
async function tiersCmd(names, { WORK, OUT, log, report }) {
  const { bodyTierMesh, ready, meshTopology, TIERS } = await import('./fishmesh.mjs');
  const { uvStats } = await import('./charts.mjs');
  const { tangentCheck } = await import('./tiers.mjs');
  await ready;
  const out = {};
  for (const name of names) {
    const T = TIERS[name];
    log(`== ${name}`);
    const m = bodyTierMesh(name, { log });
    const nD = m.dense.position.length / 3;
    const topoDense = meshTopology(m.dense, { weld: Uint32Array.from({ length: nD }, (_, i) => i) });
    const topo = meshTopology(m, { weld: m.source });
    const stDense = uvStats(m.charted, m.charts, { size: T.tex });
    const st = uvStats(m, m.charts, { size: T.tex });
    const regionTris = m.stats.regions;
    log(`dense: ${topoDense.F} tris, ${topoDense.components} component, ${topoDense.open} open, ${topoDense.nonManifold} non-manifold, ${topoDense.pinched} pinched, χ ${topoDense.chi}`);
    log(`tier:  ${topo.F} tris, ${m.position.length / 3} vertices (${topo.V} welded), ${topo.components} component, ${topo.open} open, ${topo.nonManifold} non-manifold, ${topo.pinched} pinched, χ ${topo.chi}, genus ${topo.genus}`);
    log(`regions: ${regionTris.map((r) => `${r.name} ${r.triangles}/${r.target} (error ${r.error.toExponential(1)})`).join(', ')}; locked ${m.stats.locked} (${JSON.stringify(m.classes.counts)})`);
    const px = (d) => (d / HL * 1000).toFixed(2);
    console.log(`  chart       dense: tris folds overlap%  |  tier: tris folds coll out overlap%  cover  HL/texel·1e3 @${T.tex} p10/p50/p90`);
    st.charts.forEach((c, i) => {
      const d = stDense.charts[i];
      if (!c.tris && !d.tris) return;
      console.log(`  ${c.name.padEnd(10)} ${String(d.tris).padStart(7)} ${String(d.folds).padStart(5)} ${(d.overlapShare * 100).toFixed(2).padStart(6)}  | ${String(c.tris).padStart(6)} ${String(c.folds).padStart(4)} ${String(c.collapsed).padStart(4)} ${String(c.outside).padStart(4)} ${(c.overlapShare * 100).toFixed(2).padStart(6)}  ${(c.coverage * 100).toFixed(0).padStart(4)}%  ${px(c.density.p10)}/${px(c.density.p50)}/${px(c.density.p90)}`);
    });
    // every UV inside its rect (badTriangles' 'outside' is per triangle; here per vertex against rect + 0)
    let outside = 0;
    for (let v = 0; v < m.chart.length; v++) {
      const R = m.charts[m.chart[v]].rect, x = m.uv[v * 2], y = m.uv[v * 2 + 1];
      if (x < R[0] || x > R[2] || y < R[1] || y > R[3]) outside++;
    }
    const tc = tangentCheck(m.normal, m.tangent);
    log(`UVs outside their rect: ${outside}; tangents (per vertex: |t| = 1, t ⟂ n, w = ±1 within 1e-3): ${tc.bad} bad of ${tc.n} (max |n·t| ${tc.maxDot.toExponential(1)})`);
    saveTier(path.join(WORK, `tier_${name}.bin`), m);
    const glb = path.join(OUT, `${name}-uv.glb`);
    await writeTierGLB(m, name, glb);
    await writeNormalCheckGLB(m, name, path.join(OUT, `${name}-ncheck.glb`));
    log(`wrote ${glb} and ${name}-ncheck.glb`);
    if (name === 'hero') {
      const dglb = path.join(OUT, 'hero-dense.glb');
      await writePlainGLB(m.dense, 'Dense', dglb);
      await writePlainGLB(m, 'Hero', path.join(OUT, 'hero-clay.glb'));
      log(`wrote ${dglb} and hero-clay.glb`);
    }
    out[name] = {
      tris: topo.F, vertices: m.position.length / 3, welded: topo.V, regions: regionTris, locked: m.stats.locked, classes: m.classes.counts,
      topoDense: { ...topoDense, componentSizes: undefined }, topo: { ...topo, componentSizes: undefined }, outside,
      dense: stDense.charts.filter((c) => c.tris).map((c) => ({ name: c.name, tris: c.tris, folds: c.folds, overlapShare: c.overlapShare })),
      tier: st.charts.filter((c) => c.tris).map((c) => ({ name: c.name, tris: c.tris, folds: c.folds, collapsed: c.collapsed, outside: c.outside, overlapShare: c.overlapShare, coverage: c.coverage, density: { p10: c.density.p10 / HL, p50: c.density.p50 / HL, p90: c.density.p90 / HL } })),
      repair: m.stats.repair,
    };
  }
  report(`tiers_${names.join('_')}`, out);
}

function saveTier(file, m) {
  const parts = { position: m.position, normal: m.normal, tangent: m.tangent, uv: m.uv, indices: m.indices, chart: m.chart, source: m.source, region: m.region, triChart: m.triChart, densePosition: m.dense.position, denseNormal: m.dense.normal, denseIndices: m.dense.indices };
  const head = { charts: m.charts.map((c) => ({ name: c.name, rect: c.rect, hidden: !!c.hidden, relay: !!c.relay })), arrays: {} };
  const bufs = [];
  let at = 0;
  for (const [k, a] of Object.entries(parts)) { head.arrays[k] = { type: a.constructor.name, length: a.length, at }; const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength); bufs.push(b); at += b.length; }
  const hj = Buffer.from(JSON.stringify(head)), hl = Buffer.alloc(4); hl.writeUInt32LE(hj.length);
  fs.writeFileSync(file, Buffer.concat([hl, hj, ...bufs]));
}
export function loadTier(file) {
  const b = fs.readFileSync(file), hl = b.readUInt32LE(0), head = JSON.parse(b.subarray(4, 4 + hl).toString());
  const base = 4 + hl, T = { Float32Array, Uint32Array, Int16Array, Uint8Array, Int32Array, Uint16Array };
  const m = { charts: head.charts };
  for (const [k, d] of Object.entries(head.arrays)) {
    const C = T[d.type], start = base + d.at;
    m[k] = new C(b.buffer.slice(b.byteOffset + start, b.byteOffset + start + d.length * C.BYTES_PER_ELEMENT));
  }
  m.dense = { position: m.densePosition, normal: m.denseNormal, indices: m.denseIndices };
  return m;
}

// ---- GLBs: the tier with a UV checker (each chart its own hue, 1/64 of the atlas per square, a line every 1/16),
// the eyes on the same texture (eyeAtlasUV); and plain clay meshes
async function checkerPNG(layout, size = 2048) {
  const { encodePNG } = await import('../../lib/png.mjs');
  const img = new Uint8Array(size * size * 3).fill(96);
  const names = Object.keys(layout);
  names.forEach((name, i) => {
    const R = layout[name], hue = (i * 0.618034) % 1;
    const rgb = (l, s) => { const k = (n) => (n + hue * 12) % 12, a = s * Math.min(l, 1 - l); return [0, 8, 4].map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))); };
    const c0 = rgb(0.42, 0.65), c1 = rgb(0.78, 0.55);
    const x0 = Math.floor(R[0] * size), x1 = Math.ceil(R[2] * size), y0 = Math.floor(R[1] * size), y1 = Math.ceil(R[3] * size);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cell = ((x >> 5) + (y >> 5)) & 1, line = x % 128 === 0 || y % 128 === 0, edge = x === x0 || x === x1 - 1 || y === y0 || y === y1 - 1;
      const c = edge ? [20, 20, 20] : line ? [250, 250, 250] : cell ? c1 : c0;
      img.set(c, (y * size + x) * 3);
    }
  });
  return encodePNG(size, size, 3, img);
}

function objectMesh(m) {
  const n = m.position.length / 3, p = new Float32Array(n * 3), nn = new Float32Array(n * 3), t = m.tangent ? new Float32Array(n * 4) : null;
  for (let i = 0; i < n; i++) {
    p.set(toObject([m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2]]), i * 3);
    nn[i * 3] = m.normal[i * 3 + 2]; nn[i * 3 + 1] = m.normal[i * 3 + 1]; nn[i * 3 + 2] = -m.normal[i * 3];
    if (t) { t[i * 4] = m.tangent[i * 4 + 2]; t[i * 4 + 1] = m.tangent[i * 4 + 1]; t[i * 4 + 2] = -m.tangent[i * 4]; t[i * 4 + 3] = m.tangent[i * 4 + 3]; }
  }
  return { position: p, normal: nn, tangent: t, indices: m.indices };
}

function regionsExtras() {
  const region = (s0, s1, y0, y1, z) => box(s0, s1, y0, y1, -z, z);
  return { head: region(-0.02, 1.3, -0.02, HEAD.eye.y + HEAD.eye.d / 2 + 0.02, 0.38), face: region(-0.02, 0.5, -0.02, HEAD.eye.y + HEAD.eye.d / 2 + 0.02, 0.36), body: region(-0.02, 4.3, -0.12, HEAD.eye.y + HEAD.eye.d / 2 + 0.02, 0.55) };
}

let checkerCache = null;

export async function writeTierGLB(m, name, file, { layout } = {}) {
  const { GLBBuilder } = await import('../../lib/glb.mjs');
  const { BODY_LAYOUT } = await import('./fishmesh.mjs');
  const L = layout ?? BODY_LAYOUT;
  checkerCache ??= await checkerPNG(L);
  const gb = new GLBBuilder('tobihaze-uv-check');
  const img = gb.addImage(checkerCache, 'image/png', 'uv_checker');
  const smp = gb.addSampler({ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 });
  const texI = gb.addTexture(img, smp, 'uv_checker');
  const mat = gb.addMaterial({ name: 'Body', pbrMetallicRoughness: { baseColorTexture: { index: texI }, metallicFactor: 0, roughnessFactor: 0.7 } });
  const body = objectMesh(m);
  const nodes = [gb.addNode({ name: 'Body', mesh: gb.addMesh('Body', [gb.primitive({ ...body, uv: m.uv, material: mat })]) })];
  nodes.push(...await eyeNodes(gb, name, mat, L));
  const root = gb.addNode({ name: `Tobihaze_${name}`, children: nodes, extras: { regions: regionsExtras(), HLmm: HL } });
  gb.addScene(`Tobihaze_${name}`, [root]);
  fs.writeFileSync(file, gb.toBuffer());
}

/** Both eyes at rest as nodes drawing `mat` (the tier's rings; eyemesh.mjs parts: the skin in eyeSkin, the window in
 * the iris rect, each with its tangents). */
async function eyeNodes(gb, name, mat, layout) {
  const { eyeMeshForTier, EYE_TIERS } = await import('./eyemesh.mjs');
  const nodes = [];
  for (const side of [1, -1]) {
    const e = eyeMeshForTier({ ...(EYE_TIERS[name] ?? EYE_TIERS.hero), side, layout });
    const prims = [e.parts.skin, e.parts.window].map((p) => gb.primitive({ position: p.position, normal: p.normal, tangent: p.tangent, uv: p.uv, indices: p.indices, material: mat }));
    nodes.push(gb.addNode({ name: side > 0 ? 'Eye_L' : 'Eye_R', mesh: gb.addMesh(side > 0 ? 'Eye_L' : 'Eye_R', prims), translation: toObject([EYE_MM.center[0], EYE_MM.center[1], EYE_MM.center[2] * side]) }));
  }
  return nodes;
}

/**
 * The tier with a tangent-space normal map that is a checker of round bumps (each 1/64 of the atlas a dome, +z out of
 * the skin; glTF convention: +y up the image) on a plain clay colour, and the mesh's TANGENT: where a tangent frame is
 * wrong — reversed, swapped, or a vertex's corners averaged across a chart seam — the bumps there turn into dimples or
 * light from the side, and a chart's border shows as a seam in the shading.
 */
export async function writeNormalCheckGLB(m, name, file, { layout, size = 1024 } = {}) {
  const { GLBBuilder } = await import('../../lib/glb.mjs');
  const { encodePNG } = await import('../../lib/png.mjs');
  const { BODY_LAYOUT } = await import('./fishmesh.mjs');
  const L = layout ?? BODY_LAYOUT, img = new Uint8Array(size * size * 3), cell = size / 64;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // a dome per cell: height √(1 − r²); its normal (−∂h/∂x, −∂h/∂y, 1) with y up the image (−v)
    const u = ((x + 0.5) % cell) / cell * 2 - 1, v = ((y + 0.5) % cell) / cell * 2 - 1, r2 = u * u + v * v;
    let nx = 0, ny = 0, nz = 1;
    if (r2 < 0.81) { const h = Math.sqrt(1 - r2) || 1; nx = u / h * 0.6; ny = -v / h * 0.6; }
    const l = Math.hypot(nx, ny, nz);
    img.set([Math.round((nx / l * 0.5 + 0.5) * 255), Math.round((ny / l * 0.5 + 0.5) * 255), Math.round((nz / l * 0.5 + 0.5) * 255)], (y * size + x) * 3);
  }
  const gb = new GLBBuilder('tobihaze-normal-check');
  const tex = gb.addTexture(gb.addImage(encodePNG(size, size, 3, img), 'image/png', 'normal_check'), gb.addSampler({ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }), 'normal_check');
  const mat = gb.addMaterial({ name: 'Body', normalTexture: { index: tex, scale: 1 }, pbrMetallicRoughness: { baseColorFactor: [0.72, 0.70, 0.66, 1], metallicFactor: 0, roughnessFactor: 0.45 } });
  const body = objectMesh(m);
  const nodes = [gb.addNode({ name: 'Body', mesh: gb.addMesh('Body', [gb.primitive({ ...body, uv: m.uv, material: mat })]) })];
  nodes.push(...await eyeNodes(gb, name, mat, L));
  const root = gb.addNode({ name: `Tobihaze_${name}`, children: nodes, extras: { regions: regionsExtras(), HLmm: HL } });
  gb.addScene(`Tobihaze_${name}`, [root]);
  fs.writeFileSync(file, gb.toBuffer());
}

export async function writePlainGLB(m, name, file, { eyes = true } = {}) {
  const { GLBBuilder } = await import('../../lib/glb.mjs');
  const { eyeGlobe } = await import('./eye.mjs');
  const gb = new GLBBuilder('tobihaze-clay');
  const mat = gb.addMaterial({ name: 'Clay', pbrMetallicRoughness: { baseColorFactor: [0.72, 0.7, 0.66, 1], metallicFactor: 0, roughnessFactor: 0.6 } });
  const cornea = gb.addMaterial({ name: 'Cornea', pbrMetallicRoughness: { baseColorFactor: [0.08, 0.09, 0.08, 1], metallicFactor: 0, roughnessFactor: 0.12 } });
  const iris = gb.addMaterial({ name: 'Iris (Cornea)', pbrMetallicRoughness: { baseColorFactor: [0.52, 0.40, 0.17, 1], metallicFactor: 0, roughnessFactor: 0.12 } });
  const body = objectMesh({ position: m.position, normal: m.normal, indices: m.indices });
  const nodes = [gb.addNode({ name, mesh: gb.addMesh(name, [gb.primitive({ position: body.position, normal: body.normal, indices: body.indices, material: mat })]) })];
  if (eyes) for (const side of [1, -1]) {
    const g = eyeGlobe(EYE_MM.radius * 0.001, { side });
    const n = g.position.length / 3, p = new Float32Array(n * 3), nn = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = g.position[i * 3 + 2]; p[i * 3 + 1] = g.position[i * 3 + 1]; p[i * 3 + 2] = -g.position[i * 3];
      nn[i * 3] = g.normal[i * 3 + 2]; nn[i * 3 + 1] = g.normal[i * 3 + 1]; nn[i * 3 + 2] = -g.normal[i * 3];
    }
    const mesh = gb.addMesh(side > 0 ? 'Eye_L' : 'Eye_R', [
      gb.primitive({ position: p, normal: nn, indices: g.skin, material: mat }),
      gb.primitive({ position: p, normal: nn, indices: g.pupil, material: cornea }),
      gb.primitive({ position: p, normal: nn, indices: g.iris, material: iris }),
    ]);
    nodes.push(gb.addNode({ name: side > 0 ? 'Eye_L' : 'Eye_R', mesh, translation: toObject([EYE_MM.center[0], EYE_MM.center[1], EYE_MM.center[2] * side]) }));
  }
  const root = gb.addNode({ name: `Tobihaze_${name}`, children: nodes, extras: { regions: regionsExtras(), HLmm: HL } });
  gb.addScene(`Tobihaze_${name}`, [root]);
  fs.writeFileSync(file, gb.toBuffer());
}

// ---- the hero's detail against its dense mesh: one-sided Hausdorff (every dense vertex to the hero's surface; the
// hero's vertices are dense vertices, so the other side is 0), per region of the face
async function hausdorffCmd({ WORK, log, report }) {
  const { HEAD_SCULPT } = await import('./head.mjs');
  const { marginCurve } = await import('./headrig.mjs');
  const m = loadTier(path.join(WORK, 'tier_hero.bin'));
  const D = m.dense, nD = D.position.length / 3;
  const sOp = marginCurve(HEAD_SCULPT.opercle.path), E = HEAD.eye, re = E.d / 2, NO = HEAD_SCULPT.nostril.base;
  const regionOf = (x, y, z) => {
    if (Math.hypot(x - E.s, y - E.y, Math.abs(z) - E.z) < re + 0.06) return 'eye cups';
    if (Math.hypot(x - NO[0], y - NO[1], Math.abs(z) - NO[2]) < 0.04) return 'nostrils';
    if (x < 0.36 && y < 0.22) return 'mouth & lips';
    if (y > 0.15 && y < 0.40 && Math.abs(x - sOp(y)) < 0.06) return 'gill slit';
    return x < 1.32 ? 'head (rest)' : 'trunk';
  };
  const dist = pointMeshDistance(m);
  const by = new Map();
  for (let v = 0; v < nD; v++) {
    const p = [D.position[v * 3], D.position[v * 3 + 1], D.position[v * 3 + 2]];
    const r = regionOf(p[0] / HL, p[1] / HL, p[2] / HL);
    if (!by.has(r)) by.set(r, []);
    by.get(r).push(dist(p));
  }
  const out = {};
  for (const [r, a] of by) {
    a.sort((x, y) => x - y);
    const q = (f) => a[Math.min(a.length - 1, Math.floor(f * a.length))];
    out[r] = { vertices: a.length, maxMM: a[a.length - 1], p99MM: q(0.99), p95MM: q(0.95), meanMM: a.reduce((s, x) => s + x, 0) / a.length, maxHL: a[a.length - 1] / HL };
    log(`${r.padEnd(14)} ${String(a.length).padStart(7)} dense vertices: max ${a[a.length - 1].toFixed(4)} mm (${(a[a.length - 1] / HL).toFixed(4)} HL), p99 ${q(0.99).toFixed(4)}, p95 ${q(0.95).toFixed(4)}, mean ${out[r].meanMM.toFixed(4)} mm`);
  }
  report('hausdorff', out);
}

/** Distance from a point (mm) to a mesh's surface: triangles binned in a uniform grid, searched ring by ring. */
export function pointMeshDistance(m, cell = 0.4) {
  const P = m.position, I = m.indices, nt = I.length / 3;
  let lo = [Infinity, Infinity, Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) lo[k] = Math.min(lo[k], P[i + k]);
  lo = lo.map((v) => v - cell);
  const grid = new Map();
  const key = (i, j, k) => (i * 4096 + j) * 4096 + k;
  for (let t = 0; t < nt; t++) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) { const x = P[I[t * 3 + c] * 3 + k]; mn[k] = Math.min(mn[k], x); mx[k] = Math.max(mx[k], x); }
    const a = mn.map((v, k) => Math.floor((v - lo[k]) / cell)), b = mx.map((v, k) => Math.floor((v - lo[k]) / cell));
    for (let i = a[0]; i <= b[0]; i++) for (let j = a[1]; j <= b[1]; j++) for (let k = a[2]; k <= b[2]; k++) { const q = key(i, j, k); let l = grid.get(q); if (!l) grid.set(q, (l = [])); l.push(t); }
  }
  return (p) => {
    const c = p.map((v, k) => Math.floor((v - lo[k]) / cell));
    let best = Infinity;
    for (let r = 0; r < 64; r++) {
      const seen = new Set();
      for (let i = c[0] - r; i <= c[0] + r; i++) for (let j = c[1] - r; j <= c[1] + r; j++) for (let k = c[2] - r; k <= c[2] + r; k++) {
        if (Math.max(Math.abs(i - c[0]), Math.abs(j - c[1]), Math.abs(k - c[2])) !== r) continue;
        const l = grid.get(key(i, j, k));
        if (!l) continue;
        for (const t of l) { if (seen.has(t)) continue; seen.add(t); best = Math.min(best, pointTri(p, P, I, t)); }
      }
      if (best <= r * cell) break;
    }
    return best;
  };
}
function pointTri(p, P, I, t) {
  const a = [P[I[t * 3] * 3], P[I[t * 3] * 3 + 1], P[I[t * 3] * 3 + 2]], b = [P[I[t * 3 + 1] * 3], P[I[t * 3 + 1] * 3 + 1], P[I[t * 3 + 1] * 3 + 2]], c = [P[I[t * 3 + 2] * 3], P[I[t * 3 + 2] * 3 + 1], P[I[t * 3 + 2] * 3 + 2]];
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  // (Ericson, Real-Time Collision Detection 5.1.5)
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  let q;
  if (d1 <= 0 && d2 <= 0) q = a;
  else {
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) q = b;
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
      else {
        const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) q = c;
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
            else { const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]; }
          }
        }
      }
    }
  }
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

// ---- silhouettes: each tier's skin with the two globes, rasterised orthographically from the side, the top and the
// front at 0.04 mm per pixel, against the hero's (pixel IoU)
async function silCmd({ WORK, OUT, log, report }) {
  const tiers = Object.fromEntries(['hero', 'lod1', 'lod2'].map((n) => [n, loadTier(path.join(WORK, `tier_${n}.bin`))]));
  const views = { side: [0, 1], top: [0, 2], front: [2, 1] };
  const px = 0.04, out = {};
  const masks = {};
  for (const [n, m] of Object.entries(tiers)) masks[n] = Object.fromEntries(Object.entries(views).map(([v, ax]) => [v, silhouette(m, ax, px)]));
  for (const n of ['lod1', 'lod2']) {
    out[n] = {};
    for (const v of Object.keys(views)) {
      const a = masks.hero[v], b = masks[n][v];
      let I = 0, U = 0;
      for (let i = 0; i < a.data.length; i++) { const x = a.data[i], y = b.data[i]; if (x && y) I++; if (x || y) U++; }
      out[n][v] = I / U;
      log(`${n} ${v.padEnd(5)} IoU ${(I / U).toFixed(4)} (gate ${n === 'lod1' ? 0.97 : 0.93})`);
    }
  }
  // the masks as one image per view: hero white, the tier's misses red, its excess blue
  const { encodePNG } = await import('../../lib/png.mjs');
  for (const v of Object.keys(views)) {
    const a = masks.hero[v], W = a.W, H = a.H, img = new Uint8Array(W * H * 2 * 3);
    for (const [row, n] of [[0, 'lod1'], [1, 'lod2']]) {
      const b = masks[n][v];
      for (let i = 0; i < W * H; i++) {
        // (image rows top down: the fish's y up)
        const x = a.data[i], y = b.data[i], o = (row * W * H + (H - 1 - Math.floor(i / W)) * W + (i % W)) * 3;
        img.set(x && y ? [235, 235, 235] : x ? [220, 40, 40] : y ? [40, 80, 230] : [40, 40, 40], o);
      }
    }
    fs.writeFileSync(path.join(OUT, `sil_${v}.png`), encodePNG(W, H * 2, 3, img));
  }
  report('sil', out);
}

function silhouette(m, [ax, ay], px) {
  const x0 = -2, y0 = -12, W = Math.ceil(76 / px), H = Math.ceil(26 / px), data = new Uint8Array(W * H);
  const P = m.position, I = m.indices;
  const X = (v) => (P[v * 3 + ax] - x0 - (ax === 2 ? -13 + 2 : 0)) / px, Y = (v) => (P[v * 3 + ay] - y0) / px;
  const fill = (xa, ya, xb, yb, xc, yc) => {
    const minx = Math.max(0, Math.floor(Math.min(xa, xb, xc))), maxx = Math.min(W - 1, Math.ceil(Math.max(xa, xb, xc)));
    const miny = Math.max(0, Math.floor(Math.min(ya, yb, yc))), maxy = Math.min(H - 1, Math.ceil(Math.max(ya, yb, yc)));
    const area = (xb - xa) * (yc - ya) - (yb - ya) * (xc - xa);
    if (area === 0) return;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px_ = x + 0.5, py = y + 0.5;
      const w0 = ((xb - px_) * (yc - py) - (yb - py) * (xc - px_)) / area, w1 = ((xc - px_) * (ya - py) - (yc - py) * (xa - px_)) / area, w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) data[y * W + x] = 1;
    }
  };
  for (let t = 0; t < I.length / 3; t++) { const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2]; fill(X(a), Y(a), X(b), Y(b), X(c), Y(c)); }
  // the globes (discs)
  const r = EYE_MM.radius / px;
  for (const s of [1, -1]) {
    const c = [EYE_MM.center[0], EYE_MM.center[1], EYE_MM.center[2] * s];
    const cx = (c[ax] - x0 - (ax === 2 ? -13 + 2 : 0)) / px, cy = (c[ay] - y0) / px;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) data[y * W + x] = 1;
    }
  }
  return { W, H, data };
}

// ---- renders: the checker GLBs (textured views) at hero and lod1, the hero against the dense mesh (clay macros)
async function renderCmd({ WORK, OUT, log, port, which }) {
  const render = (model, shotsSet, outDir) => {
    const r = spawnSync('node', [path.join(here, 'render.mjs'), '--model', model, '--shots', fileURLToPath(import.meta.url), '--out', outDir, '--port', String(port), '--width', '1200', '--height', '900'], { stdio: 'inherit', env: { ...process.env, UV_SHOTS: shotsSet } });
    if (r.status) throw new Error(`render failed: ${model}`);
  };
  for (const w of which.split(',')) {
    if (w === 'tex') for (const n of ['hero', 'lod1', 'lod2']) { log(`render ${n} textured`); render(path.join(OUT, `${n}-uv.glb`), 'tex', path.join(OUT, `render_${n}`)); }
    if (w === 'ncheck') for (const n of ['hero', 'lod1', 'lod2']) { log(`render ${n} normal-map check`); render(path.join(OUT, `${n}-ncheck.glb`), 'tex', path.join(OUT, `render_${n}_ncheck`)); }
    if (w === 'clay') for (const n of ['hero-clay', 'hero-dense']) { log(`render ${n} macros`); render(path.join(OUT, `${n}.glb`), 'clay', path.join(OUT, `render_${n}`)); }
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await main();
