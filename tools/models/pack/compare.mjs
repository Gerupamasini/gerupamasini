#!/usr/bin/env node
// Renders every model master and its packed copy the same way in headless Chromium (software WebGL) and compares
// the two pictures: a packing that broke the geometry or a texture's colour space shows as a low PSNR.
//   node tools/models/pack/compare.mjs [filter ...] [--out <dir>] [--min <dB>]
// Writes side-by-side PNGs (master | packed) to tests/smoke/out/pack-compare/ by default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { psnr } from './ktx2.mjs';
import { MASTER_DIR } from './settings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'tests', 'smoke', 'out', 'pack-compare')));
// (an alpha-tested fin's thin rays flip a few pixels at the threshold: 28 dB still looks the same; a broken colour
// space or mesh falls far below)
const minDb = Number(arg('--min', 28));
const filters = args.filter((a, i) => !a.startsWith('--') && !['--out', '--min'].includes(args[i - 1]));
fs.mkdirSync(outDir, { recursive: true });

const models = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.glb')) models.push(path.relative(path.join(root, MASTER_DIR), p).split(path.sep).join('/'));
  }
})(path.join(root, MASTER_DIR));
const wanted = models.sort().filter((m) => !filters.length || filters.some((f) => m.includes(f)));

const PORT = 5198;
const url = `http://localhost:${PORT}/gerupamasini/tools/models/pack/compare.html`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (dataUrl) => PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
let code = 0;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 80) throw new Error('vite did not start');
    await wait(250);
  }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { console.error('pageerror', e.message); code = 1; });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) console.error('HTTP', r.status(), r.url()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__cmp);
  for (const rel of wanted) {
    const r = await page.evaluate((m) => window.__cmp.show(m), rel);
    const a = decode(r.master), b = decode(r.packed);
    // (over the model's own pixels: the background would flatter the figure)
    const bg = [a.data[0], a.data[1], a.data[2]];
    const keep = (d, i) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 6;
    const ma = [], mb = [];
    for (let i = 0; i < a.data.length; i += 4) if (keep(a.data, i) || keep(b.data, i)) { ma.push(a.data[i], a.data[i + 1], a.data[i + 2], 255); mb.push(b.data[i], b.data[i + 1], b.data[i + 2], 255); }
    const db = ma.length ? psnr(ma, mb, [0, 1, 2]) : 0;
    const side = new PNG({ width: a.width * 2, height: a.height });
    PNG.bitblt(a, side, 0, 0, a.width, a.height, 0, 0);
    PNG.bitblt(b, side, 0, 0, b.width, b.height, a.width, 0);
    fs.writeFileSync(path.join(outDir, `${rel.replace(/\//g, '__')}.png`), PNG.sync.write(side));
    const bad = db < minDb;
    if (bad) code = 1;
    console.log(`${rel.padEnd(42)} ${db.toFixed(1).padStart(5)} dB over ${ma.length / 4} px${bad ? '  << below ' + minDb : ''}`);
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
