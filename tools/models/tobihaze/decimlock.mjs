#!/usr/bin/env node
// The decimation lock (2026-10-25): lod1's and lod2's skin as round T3 (e6079e5) simplified it, held by the build
// outside the eye and the mouth (FREE_ZONES) whatever the head's sculpt does there. Each tier's skin is simplified region
// by region (tiers.mjs simplifyRegions: lod1 the head in front of s 1.32 HL and the trunk, lod2 the whole skin as one), so
// an edit to the eye or the lips alone re-tessellated the whole head region at lod1 and the whole fish at lod2 (the
// 9977d95 rebuild: 561 lod1 triangles changed outside the eye and the mouth, s 5.5–21.3 mm, and 188 at lod2 down to the
// tail). With the lock, tiers.mjs (frozenPlan) keeps every T3 triangle that lies outside the zones on dense skin the sculpt
// did not change (its corners found at the same place in the new dense mesh, no changed dense cell under it) as it was —
// its vertices locked — and simplifies only the rest: the new dense triangles of the zones, joined to the kept ones by
// a fan along each kept edge, to T3's triangle count there. The new tier's vertices outside the zones are T3's, exactly.
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
import { S0, HL, toObject } from './anatomy.mjs';

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
 * 11) and the gape stretched more of them (72 over 3× against 48), for no gain on the front views. */
export const FOCUS = {
  lod1: { label: 'the median lip', error: 1e-3, s: [-Infinity, 0.25], y: [0.03, 0.19], z: 0.10 },
};
const focusOf = (F) => F && { label: F.label, error: F.error, box: { s: F.s.map((x) => x * HL), y: F.y.map((x) => x * HL), z: F.z * HL }, inside: ([s, y, z]) => s >= F.s[0] * HL && s <= F.s[1] * HL && y >= F.y[0] * HL && y <= F.y[1] * HL && Math.abs(z) <= F.z * HL };

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
/** The cells whose hash differs between the lock's dense mesh and this one (either side missing counts): a Set of keys. */
export function changedCells(lockCells, position, cell = CELL_MM) {
  const now = cellHashes(position, cell), out = new Set();
  for (const [k, h] of now) if (lockCells.get(k) !== h) out.add(k);
  for (const k of lockCells.keys()) if (!now.has(k)) out.add(k);
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
      focus: focusOf(FOCUS[t]) ?? null,
      cells: (() => { const K = fromB64(T.cellKeys, Int16Array), H = fromB64(T.cellHashes, Uint32Array), m = new Map(); for (let i = 0; i < H.length; i++) m.set(`${K[i * 3]},${K[i * 3 + 1]},${K[i * 3 + 2]}`, H[i]); return m; })(), cell: T.cellMM,
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
  return { cells: cellHashes(dense.position), layout: T.layout ?? FM.BODY_LAYOUT, spare: FM.SPARE_CHARTS, targets: T.regions ? { ...T.regions } : { all: T.target } };
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
    tiers[t] = { triangles: ci.length, vertices: nv, position: b64(S.position), indices: b64(nv < 65536 ? Uint16Array.from(S.indices) : S.indices), chartNames, chart: b64(ci), uv: b64(S.cornerUV), targets: D.targets, cellMM: CELL_MM, cellCount: cells.length, cellKeys: b64(cellKeys), cellHashes: b64(cellH) };
  }
  return { format: 'tobihaze-decimation-lock/1', source, about: 'lod1\'s and lod2\'s skin as round T3 simplified it (decimlock.mjs): positions fish mm (Float32), triangles (Uint16 under 65 536 vertices, else Uint32), a chart per triangle (Uint8 into chartNames, 255 none), each triangle\'s corner UVs as the GLB held them (uv: Uint16 normalized, u v per corner), the dense cells (Int16 i, j, k at cellMM) and their hashes (Uint32); every block raw-deflated and base64', zones: FREE_ZONES, tiers };
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
