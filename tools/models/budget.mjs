#!/usr/bin/env node
// Checks the creatures' packed models (src/assets/models-packed) against the model budget (tools/models/budget.json,
// explained in docs/quality/model-budget.md): each file's triangles, texture maps (how many, the largest), download size,
// GPU memory of its textures (block-compressed, with mipmaps), materials and joints, by the species' size class and
// the file's level of detail; and, per map, the far models (lod2) of every form that spawns there.
// Reports only (exit 0) unless --strict. Procedural species build their models in code: their figures are in the doc.
//   node tools/models/budget.mjs [--strict]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const budget = JSON.parse(fs.readFileSync(path.join(root, 'tools/models/budget.json'), 'utf8'));
const packed = path.join(root, 'src/assets/models-packed');
const strict = process.argv.includes('--strict');

/** the size class of a species from its largest length (mm) */
function sizeClass(maxMm) {
  for (const c of budget.classes) if (c.maxLength_mm === null || maxMm <= c.maxLength_mm) return c.id;
  return budget.classes.at(-1).id;
}

/** a packed GLB's figures */
function measure(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const bin = 20 + jsonLen + 8;
  const acc = j.accessors ?? [];
  let tris = 0;
  for (const m of j.meshes ?? []) for (const p of m.primitives) {
    if ((p.mode ?? 4) !== 4) continue;
    tris += Math.floor((p.indices !== undefined ? acc[p.indices].count : acc[p.attributes.POSITION].count) / 3);
  }
  let mapPx = 0, gpu = 0;
  for (const im of j.images ?? []) {
    const bv = j.bufferViews[im.bufferView], off = bin + (bv.byteOffset ?? 0);
    // (KTX2: pixel width and height at bytes 20 and 24; BC7 / ASTC 4×4 hold a byte a pixel, the mipmaps a third more)
    const w = b.readUInt32LE(off + 20), h = b.readUInt32LE(off + 24);
    mapPx = Math.max(mapPx, w, h);
    gpu += (w * h * 4) / 3;
  }
  const joints = Math.max(0, ...(j.skins ?? []).map((s) => s.joints.length));
  return { tris, maps: (j.images ?? []).length, mapPx, downloadMB: b.length / 1e6, gpuMB: gpu / 1e6, materials: (j.materials ?? []).length, joints };
}

const KEYS = ['tris', 'maps', 'mapPx', 'downloadMB', 'gpuMB', 'materials', 'joints'];
const fmt = (k, v) => (k.endsWith('MB') ? v.toFixed(2) : String(v));
let over = 0;
const rows = [];
const lod2ByMap = new Map();
for (const f of fs.readdirSync(path.join(root, 'public/data/species')).filter((n) => n.endsWith('.json')).sort()) {
  const text = fs.readFileSync(path.join(root, 'public/data/species', f), 'utf8');
  const sp = JSON.parse(text);
  const cls = sizeClass(sp.size?.length_mm?.max ?? 0);
  // every model file the species names (stages and forms included), and the tier each is used for
  const uses = new Map();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && /\.glb$/.test(v) && ['hero', 'lod1', 'lod2'].includes(k)) {
        if (!uses.has(v)) uses.set(v, new Set());
        uses.get(v).add(k);
      } else walk(v);
    }
  };
  walk(sp.model);
  walk(sp.stages);
  walk(sp.forms);
  for (const [rel, tiers] of uses) {
    const file = path.join(packed, rel);
    if (!fs.existsSync(file)) continue;
    const m = measure(file);
    for (const tier of tiers) {
      const lim = budget.limits[tier][cls];
      const bad = KEYS.filter((k) => m[k] > lim[k]);
      over += bad.length ? 1 : 0;
      rows.push({ species: sp.id, cls, tier, file: rel, m, lim, bad });
      if (tier === 'lod2') for (const map of new Set((sp.spawn ?? []).flatMap((rule) => rule.maps ?? []))) {
        const t = lod2ByMap.get(map) ?? { downloadMB: 0, gpuMB: 0, files: new Set() };
        if (!t.files.has(rel)) { t.files.add(rel); t.downloadMB += m.downloadMB; t.gpuMB += m.gpuMB; }
        lod2ByMap.set(map, t);
      }
    }
  }
}
for (const r of rows) {
  const cells = KEYS.map((k) => `${k} ${fmt(k, r.m[k])}${r.bad.includes(k) ? ` (> ${r.lim[k]})` : ''}`);
  console.log(`${r.bad.length ? 'OVER' : 'ok  '} ${r.species} [${r.cls} ${r.tier}] ${r.file}: ${cells.join(', ')}`);
}
for (const [map, t] of lod2ByMap) {
  const bad = t.downloadMB > budget.map.lod2DownloadMB || t.gpuMB > budget.map.lod2GpuMB;
  if (bad) over++;
  console.log(`${bad ? 'OVER' : 'ok  '} map ${map}: far models ${t.files.size} files, ${t.downloadMB.toFixed(1)} MB download (≤ ${budget.map.lod2DownloadMB}), ${t.gpuMB.toFixed(1)} MB GPU (≤ ${budget.map.lod2GpuMB})`);
}
console.log(`${over} over the budget`);
process.exit(strict && over ? 1 : 0);
