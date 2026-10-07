#!/usr/bin/env node
// Bakes the 走水 (hashirimizu) terrain from the shared shape (src/world/maps/hashirimizu/shape.ts):
// height.png (16-bit height split into R/G) and substrate.png (palette index in R).
//   node tools/terrain/bake-hashirimizu.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shape = await import(path.join(root, 'src', 'world', 'maps', 'hashirimizu', 'shape.ts'));
const mapDef = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'maps', 'hashirimizu.json'), 'utf8'));
const outDir = path.join(root, 'public', 'data', 'maps', 'hashirimizu');
fs.mkdirSync(outDir, { recursive: true });

const N = mapDef.resolution, SIZE = mapDef.size_m, HALF = SIZE / 2;
const { min_tp_m: hmin, max_tp_m: hmax } = mapDef.height;
if (N !== shape.RES || SIZE !== shape.SIZE || hmin !== shape.MIN_TP || hmax !== shape.MAX_TP) {
  console.error('hashirimizu.json and shape.ts disagree on the grid'); process.exit(1);
}
const cell = SIZE / (N - 1);
const hPng = new PNG({ width: N, height: N });
const sPng = new PNG({ width: N, height: N });
let lo = Infinity, hi = -Infinity;
const hist = [0, 0, 0, 0, 0];
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = -HALF + i * cell, z = -HALF + j * cell;
  const h = shape.heightAt(x, z);
  lo = Math.min(lo, h); hi = Math.max(hi, h);
  const v = Math.round(Math.max(0, Math.min(1, (h - hmin) / (hmax - hmin))) * 65535);
  const k = (j * N + i) * 4;
  hPng.data[k] = v >> 8; hPng.data[k + 1] = v & 255; hPng.data[k + 2] = 0; hPng.data[k + 3] = 255;
  const s = shape.substrateAt(x, z);
  hist[s]++;
  sPng.data[k] = s; sPng.data[k + 1] = 0; sPng.data[k + 2] = 0; sPng.data[k + 3] = 255;
}
fs.writeFileSync(path.join(outDir, 'height.png'), PNG.sync.write(hPng, { colorType: 6 }));
fs.writeFileSync(path.join(outDir, 'substrate.png'), PNG.sync.write(sPng, { colorType: 6 }));
const palette = mapDef.substrate.palette;
console.log(`wrote ${path.relative(root, outDir)}/height.png + substrate.png (${N}x${N}, ${SIZE} m, ${cell.toFixed(3)} m cells)`);
console.log(`height range ${lo.toFixed(2)} .. ${hi.toFixed(2)} m (encoded ${hmin}..${hmax})`);
console.log('substrate:', palette.map((p, i) => `${p} ${(100 * hist[i] / (N * N)).toFixed(1)}%`).join(', '));
if (lo < hmin || hi > hmax) { console.error('height out of encoded range'); process.exit(1); }
