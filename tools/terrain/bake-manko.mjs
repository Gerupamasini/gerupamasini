#!/usr/bin/env node
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { heightAt, substrateAt } from '../../src/world/maps/manko/shape.ts';
const root = new URL('../../public/data/maps/', import.meta.url);
const map = JSON.parse(fs.readFileSync(new URL('manko.json', root), 'utf8'));
const n = map.resolution, height = new PNG({ width: n, height: n }), substrate = new PNG({ width: n, height: n });
for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
  const xx = (x / (n - 1) - 0.5) * map.size_m, zz = (z / (n - 1) - 0.5) * map.size_m;
  const h = heightAt(xx, zz), v = Math.round((h - map.height.min_tp_m) / (map.height.max_tp_m - map.height.min_tp_m) * 65535), i = (z * n + x) * 4;
  if (v < 0 || v > 65535) throw new Error('Height outside encoded range');
  height.data.set([v >> 8, v & 255, 0, 255], i);
  substrate.data.set([substrateAt(xx, zz), 0, 0, 255], i);
}
fs.mkdirSync(new URL('manko/', root), { recursive: true });
fs.writeFileSync(new URL('manko/height.png', root), PNG.sync.write(height));
fs.writeFileSync(new URL('manko/substrate.png', root), PNG.sync.write(substrate));
console.log(`Manko: ${map.size_m} m × ${map.size_m} m, ${n} × ${n}`);
