#!/usr/bin/env node
// Validates every JSON file under public/data against the zod schemas (Node 22 strips the TS types).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = path.join(root, 'public', 'data');
const schemas = await import(path.join(root, 'src', 'data', 'schemas', 'index.ts'));
const read = (p) => JSON.parse(fs.readFileSync(path.join(dataDir, p), 'utf8'));

let errors = 0;
const check = (label, schema, value) => {
  const r = schema.safeParse(value);
  if (!r.success) {
    errors++;
    console.error(`✗ ${label}`);
    for (const issue of r.error.issues) console.error(`    ${issue.path.join('.')}: ${issue.message}`);
  } else console.log(`✓ ${label}`);
  return r.success ? r.data : null;
};

const manifest = check('manifest.json', schemas.ManifestSchema, read('manifest.json'));
if (!manifest) process.exit(1);
const species = new Map(), behaviors = new Map(), maps = new Map(), stations = new Map();
for (const id of manifest.species) { const v = check(`species/${id}.json`, schemas.SpeciesSchema, read(`species/${id}.json`)); if (v) species.set(id, v); }
for (const id of manifest.behaviors) { const v = check(`behaviors/${id}.json`, schemas.BehaviorTreeSchema, read(`behaviors/${id}.json`)); if (v) behaviors.set(id, v); }
for (const id of manifest.maps) { const v = check(`maps/${id}.json`, schemas.MapSchema, read(`maps/${id}.json`)); if (v) maps.set(id, v); }
for (const id of manifest.stations) { const v = check(`tide/stations/${id}.json`, schemas.TideStationSchema, read(`tide/stations/${id}.json`)); if (v) stations.set(id, v); }
const tools = check(manifest.items, schemas.ToolsFileSchema, read(manifest.items));
check(manifest.strings, schemas.StringsSchema, read(manifest.strings));
if (manifest.spots) {
  const spots = check(manifest.spots, schemas.SpotsFileSchema, read(manifest.spots));
  if (spots) for (const s of spots.spots) if (s.map && !maps.has(s.map)) { errors++; console.error(`✗ spot ${s.id}: 地図 ${s.map} がありません`); }
}

// cross references
const toolIds = new Set((tools?.tools ?? []).map((t) => t.id));
for (const [id, sp] of species) {
  if (sp.id !== id) { errors++; console.error(`✗ species/${id}.json: id が一致しません (${sp.id})`); }
  const photo = path.join(dataDir, 'photos', `${id}.jpg`);
  if (!fs.existsSync(photo) || fs.statSync(photo).size < 1000) { errors++; console.error(`✗ ${id}: 図鑑の静止画像がありません`); }
  if (!behaviors.has(sp.brain.tree)) { errors++; console.error(`✗ ${id}: 行動ツリー ${sp.brain.tree} がありません`); }
  for (const t of sp.capture.tools) if (!toolIds.has(t)) { errors++; console.error(`✗ ${id}: 道具 ${t} がありません`); }
  for (const m of [sp.model, ...sp.stages.map((st) => st.model).filter(Boolean)]) {
    for (const key of ['hero', 'lod1', 'lod2']) {
      const f = m[key];
      if (f && !fs.existsSync(path.join(root, 'src', 'assets', 'models', f))) { errors++; console.error(`✗ ${id}: モデル ${f} がありません`); }
    }
  }
}
for (const [id, m] of maps) {
  if (!stations.has(m.station)) { errors++; console.error(`✗ ${id}: 観測点 ${m.station} がありません`); }
  for (const f of [m.height.file, m.substrate.file]) if (!fs.existsSync(path.join(dataDir, 'maps', f))) { errors++; console.error(`✗ ${id}: ${f} がありません`); }
}
if (!maps.has(manifest.defaultMap)) { errors++; console.error(`✗ defaultMap ${manifest.defaultMap} がありません`); }

if (errors) { console.error(`${errors} 件のエラー`); process.exit(1); }
console.log('データ検証 OK');
