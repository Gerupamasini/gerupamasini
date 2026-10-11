#!/usr/bin/env node
// Renders the アマモ viewer in headless Chromium (software WebGL):
//   node tools/models/amamo/render.mjs [--only <shot,...>] [--out <dir>] [--width 1400 --height 900 --dpr 1]
//   node tools/models/amamo/render.mjs --only none --shot '{"kind":"single","depth":0.5,"cam":[1,0.3,1]}'   (one ad-hoc view)
//   node tools/models/amamo/render.mjs --anim '{"name":"under","kind":"dense","depth":1.4,...}' --frames 40 --dt 0.12
// Writes JPEGs to docs/models/amamo/ by default (docs/models/amamo/sway.gif is the --anim sequence above, as a GIF).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

/** depth: water over the bed (m); current: tidal current (+ = ebb, toward the sea); time: seconds into the sway */
export const SHOTS = [
  { name: 'tide_high', kind: 'dense', depth: 1.4, current: 0.05, wave: 0.14, time: 3.1, cam: [3.1, 1.75, 3.4], target: [0, 0.2, 0] },
  { name: 'tide_high_under', kind: 'dense', depth: 1.4, current: 0.05, wave: 0.14, time: 3.1, cam: [3.4, 0.32, 2.6], target: [0, 0.32, 0] },
  { name: 'tide_shallow', kind: 'dense', depth: 0.3, current: 0.08, wave: 0.12, time: 3.1, cam: [2.6, 1.35, 3.0], target: [0, 0.1, 0] },
  { name: 'tide_low', kind: 'dense', depth: -0.08, current: 0, wave: 0.12, time: 3.1, cam: [2.4, 1.3, 2.8], target: [0, 0.0, 0] },
  { name: 'single_under', kind: 'single', depth: 1.2, current: 0.03, wave: 0.08, time: 1.0, cam: [0.62, 0.22, 0.72], target: [0, 0.28, 0], fov: 40 },
  { name: 'single_low', kind: 'single', depth: -0.1, current: 0, wave: 0, time: 1.0, cam: [0.45, 0.42, 0.55], target: [0, 0.0, 0.1], fov: 40 },
  { name: 'clump_shallow', kind: 'clump', depth: 0.45, current: 0.05, wave: 0.1, time: 2.0, cam: [1.1, 0.9, 1.4], target: [0, 0.1, 0] },
  { name: 'meadow_edge', kind: 'meadow', depth: 0.9, current: 0.06, wave: 0.12, time: 4.0, cam: [7.5, 3.6, 7.0], target: [0, 0, 0] },
  { name: 'meadow_low', kind: 'meadow', depth: -0.08, current: 0, wave: 0.1, time: 4.0, cam: [7.5, 3.6, 7.0], target: [0, 0, 0] },
  { name: 'lod0', kind: 'dense', depth: 1.0, current: 0.06, wave: 0.12, time: 2.0, cam: [1.6, 0.9, 1.8], target: [0, 0.2, 0], lod: 0 },
  { name: 'lod1', kind: 'dense', depth: 1.0, current: 0.06, wave: 0.12, time: 2.0, cam: [1.6, 0.9, 1.8], target: [0, 0.2, 0], lod: 1 },
  { name: 'lod2', kind: 'dense', depth: 1.0, current: 0.06, wave: 0.12, time: 2.0, cam: [1.6, 0.9, 1.8], target: [0, 0.2, 0], lod: 2 },
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'amamo')));
const only = arg('--only', null)?.split(',');
// --shot '<json>': one ad-hoc shot (debugging a view)
const extra = arg('--shot', null);
if (extra) SHOTS.push({ name: 'shot', ...JSON.parse(extra) });
const W = Number(arg('--width', 1400)), H = Number(arg('--height', 900)), DPR = Number(arg('--dpr', 1));
fs.mkdirSync(outDir, { recursive: true });

const PORT = 5197;
const url = `http://localhost:${PORT}/gerupamasini/reference/amamo-viewer/index.html?capture&dpr=${DPR}`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 80) throw new Error('vite did not start');
    await wait(250);
  }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { console.error('pageerror', e.message); code = 1; });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { console.error('console', m.text().slice(0, 3000)); if (m.type() === 'error') code = 1; } });
  await page.goto(url);
  await page.waitForFunction(() => window.__amamo);
  for (const shot of SHOTS) {
    if (shot.name !== 'shot' && (only ? !only.includes(shot.name) : !!extra || args.includes('--anim'))) continue;
    const t = Date.now();
    const info = await page.evaluate((s) => window.__amamo.set({ lod: 'auto', fov: 45, ...s }), shot);
    const file = path.join(outDir, `${shot.name}.jpg`);
    await page.locator('#view').screenshot({ path: file, type: 'jpeg', quality: 88 });
    console.log(`${shot.name}: ${((Date.now() - t) / 1000).toFixed(1)} s`, JSON.stringify(info));
  }
  // --anim '<json shot>' --frames N --dt S: an image sequence of the sway (assembled into a GIF by the caller)
  const anim = arg('--anim', null);
  if (anim) {
    const shot = JSON.parse(anim), frames = Number(arg('--frames', 24)), dt = Number(arg('--dt', 0.125));
    for (let i = 0; i < frames; i++) {
      await page.evaluate((s) => window.__amamo.set({ lod: 'auto', fov: 45, ...s }), { ...shot, time: (shot.time ?? 0) + i * dt });
      await page.locator('#view').screenshot({ path: path.join(outDir, `${shot.name ?? 'anim'}_${String(i).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 85 });
    }
    console.log(`anim: ${frames} frames`);
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
