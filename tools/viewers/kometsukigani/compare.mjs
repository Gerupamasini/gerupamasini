#!/usr/bin/env node
// Dev helper: render the photo-match presets of the コメツキガニ viewer and lay each render beside its photograph.
// usage: node tools/viewers/kometsukigani/compare.mjs <photoDir> <outDir> [p1 p2 …]
//   photoDir holds the reference photographs as p1.png … p6.png (not in the repository: see
//   docs/creatures/kometsukigani/REFERENCES.md for which photograph each preset matches).
//   Needs the vite dev server (PORT, default 5199) and ImageMagick `convert` for the side-by-side sheets; without
//   it only the renders are written. EXTRA="&dbg=1" appends query parameters to every shot (dbg=1: albedo only).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [photoDir, outDir, ...want] = process.argv.slice(2);
if (!photoDir || !outDir) {
  console.error('usage: node tools/viewers/kometsukigani/compare.mjs <photoDir> <outDir> [p1 p2 …]');
  process.exit(1);
}
const presets = want.length ? want : ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
fs.mkdirSync(outDir, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const shoot = path.join(here, '..', 'shoot.mjs');
const hasConvert = (() => { try { execFileSync('convert', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const size = (file) => {
  if (!hasConvert || !fs.existsSync(file)) return [1200, 675];
  return execFileSync('identify', ['-format', '%w %h', file]).toString().trim().split(' ').map(Number);
};
const shots = presets.map((p) => {
  const [w, h] = size(path.join(photoDir, `${p}.png`));
  return `${p}?preset=${p}&w=${w}&h=${h}&hud=0&lod=0${process.env.EXTRA ?? ''}`;
});
execFileSync('node', [shoot, outDir, ...shots], { stdio: 'inherit' });
if (!hasConvert) process.exit(0);
for (const p of presets) {
  const photo = path.join(photoDir, `${p}.png`);
  if (!fs.existsSync(photo)) continue;
  execFileSync('convert', [photo, path.join(outDir, `${p}.png`), '+append', path.join(outDir, `cmp-${p}.png`)]);
  console.log('sheet', `cmp-${p}.png`);
}
