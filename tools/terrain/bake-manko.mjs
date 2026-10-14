#!/usr/bin/env node
// Bakes the 漫湖 terrain and derives the mangrove front rows (real tree models) from the same shape:
// trees within ~14 m of the open water/mud, islands, and seedling scatters on the flat. The deeper forest
// is the canopy shell drawn by maps/manko/land.ts.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { heightAt, substrateAt, forestDepth, lakeOpen, THICKET_DEPTH, ISLANDS, HALF } from '../../src/world/maps/manko/shape.ts';
const root = new URL('../../public/data/maps/', import.meta.url);
const map = JSON.parse(fs.readFileSync(new URL('manko.json', root), 'utf8'));
const n = map.resolution, height = new PNG({ width: n, height: n }), substrate = new PNG({ width: n, height: n });
for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
  const xx = (x / (n - 1) - 0.5) * map.size_m, zz = (z / (n - 1) - 0.5) * map.size_m;
  const h = heightAt(xx, zz), v = Math.round((h - map.height.min_tp_m) / (map.height.max_tp_m - map.height.min_tp_m) * 65535), i = (z * n + x) * 4;
  if (v < 0 || v > 65535) throw new Error(`Height outside encoded range at ${xx},${zz}: ${h}`);
  height.data.set([v >> 8, v & 255, 0, 255], i);
  substrate.data.set([substrateAt(xx, zz), 0, 0, 255], i);
}
fs.mkdirSync(new URL('manko/', root), { recursive: true });
fs.writeFileSync(new URL('manko/height.png', root), PNG.sync.write(height));
fs.writeFileSync(new URL('manko/substrate.png', root), PNG.sync.write(substrate));

// Front rows (all qualities) within the thicket depth of the open edge; deeper rows for mid/high quality.
const clusters = [], step = 7, limit = HALF - 6;
for (let z = -limit; z <= limit; z += step) for (let x = -limit; x <= limit; x += step) {
  const jx = x + ((x * 7 + z * 13) % 3), jz = z + ((x * 11 - z * 5) % 3);
  if (ISLANDS.some(i => Math.hypot(jx - i.x, jz - i.z) < i.r + 3)) continue;
  const d = forestDepth(jx, jz);
  if (d < 0.5 || d > 26) continue;
  if (d <= THICKET_DEPTH) clusters.push({ x: jx, z: jz, radius: 4.6, count: d <= 5 ? 6 : 4 });
  else clusters.push({ x: jx, z: jz, radius: 4.6, count: 3, deep: true });
}
for (const i of ISLANDS) clusters.push({ x: i.x, z: i.z, radius: i.r, count: Math.round(i.r * i.r * 0.42) });
// Seedlings grow in patches just off the forest edge where the parents' propagules strand (photo 2), never
// as isolated plants spread evenly over the open flat.
const seen = [];
for (let z = -limit; z <= limit; z += 5) for (let x = -limit; x <= limit; x += 5) {
  if (Math.abs(x) > 98 || Math.abs(z) > 98) continue;
  if (forestDepth(x, z) > 0.1 || lakeOpen(x, z) > 0.3) continue;
  // 1.5-5 m out from the edge
  let edge = false;
  for (let k = 0; k < 8 && !edge; k++) { const a = k * Math.PI / 4; if (forestDepth(x + Math.cos(a) * 4, z + Math.sin(a) * 4) > 0.5) edge = true; }
  if (!edge || ((x * 31 + z * 17) & 7) > 1 || seen.some(p => Math.hypot(p[0] - x, p[1] - z) < 14)) continue;
  seen.push([x, z]);
  clusters.push({ x, z, radius: 2.2, count: 5 + ((x * 7 + z) & 3), juvenileFraction: 1 });
}
map.mangroves.clusters = clusters;
fs.writeFileSync(new URL('manko.json', root), JSON.stringify(map, null, 2) + '\n');
console.log(`Manko: ${map.size_m} m × ${map.size_m} m, ${n} × ${n}; ${clusters.length} mangrove clusters`);
