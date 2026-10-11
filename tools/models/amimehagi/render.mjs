#!/usr/bin/env node
// Renders the アミメハギ with the reference viewer in headless Chromium (software WebGL):
//   node tools/models/amimehagi/render.mjs [--only <shot,...>] [--out <dir>] [--shots <file.json>]
// Writes JPEGs to docs/models/amimehagi/ by default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'amimehagi')));
const only = arg('--only', null)?.split(',');
const W = Number(arg('--width', 1280)), H = Number(arg('--height', 760)), DPR = Number(arg('--dpr', 1));
fs.mkdirSync(outDir, { recursive: true });

const R = 0.04;
// each shot: viewer state, then optional simulated seconds before the picture
const DEFAULT_SHOTS = [
  { name: 'side_lod0', set: { scene: 'side', lod: 0, palette: 1 } },
  { name: 'side_lod1', set: { scene: 'side', lod: 1, palette: 1 } },
  { name: 'side_lod2', set: { scene: 'side', lod: 2, palette: 1 } },
  { name: 'top_lod0', set: { scene: 'top', lod: 0, palette: 1 } },
  { name: 'front_lod0', set: { scene: 'front', lod: 0, palette: 1 } },
  { name: 'head_lod0', set: { scene: 'side', lod: 0, palette: 1, cam: [R * 1.1, 0.004, 0.012], target: [0, 0.002, 0.008] } },
  // roused: the spine up, the flap down, the fins spread, the soft fins in mid-wave
  { name: 'display_lod0', set: { scene: 'side', lod: 0, palette: 7, pose: { spine: 1, flap: 1, caudalSpread: 1, medAmp: 0.35, medPhase: 1.2, pecOpenL: 0.8 } } },
  { name: 'spine_folded', set: { scene: 'side', lod: 0, palette: 1, pose: { spine: 0, flap: 0, caudalSpread: 0.1 }, cam: [R * 1.4, 0.012, 0.0], target: [0, 0.006, 0.002] } },
  { name: 'tank_orange', set: { scene: 'tank', lod: 0, palette: 0 } },
  { name: 'tank_olive', set: { scene: 'tank', lod: 0, palette: 2 } },
  { name: 'tank_grey', set: { scene: 'tank', lod: 0, palette: 3 } },
  { name: 'tank_yellow', set: { scene: 'tank', lod: 0, palette: 4 } },
  { name: 'tank_dark', set: { scene: 'tank', lod: 0, palette: 5 } },
  { name: 'tank_saddled', set: { scene: 'tank', lod: 0, palette: 7 } },
  // the eelgrass bed under 75 cm of water, the camera down among the leaves (the water pass fades the view)
  { name: 'meadow_wide', set: { scene: 'meadow' }, advance: 3 },
  { name: 'meadow_hover', advance: 1, portrait: { i: 0, dist: 0.13, fov: 35 } },
  { name: 'meadow_hover2', portrait: { i: 4, dist: 0.13, fov: 35 } },
  { name: 'meadow_forage', call: { fn: 'intent', args: ['forage', null, 0] }, advance: 2.4, portrait: { i: 0, dist: 0.14, fov: 35, angle: 0.6 } },
  { name: 'meadow_hide', call: { fn: 'intent', args: ['display', null, 4] }, advance: 4, follow: { i: 4, offset: [0.13, 0.03, 0.08] } },
  { name: 'escape_0', call: { fn: 'startle' }, advance: 0.08, follow: { i: 3, offset: [0.0, 0.06, 0.24] } },
  { name: 'escape_1', advance: 0.2 },
  { name: 'escape_2', advance: 1.2, follow: { i: 3, offset: [0.12, 0.04, 0.12] } },
];

const shotsFile = arg('--shots', null);
const SHOTS = shotsFile ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : DEFAULT_SHOTS;

const PORT = 5199;
const url = `http://localhost:${PORT}/gerupamasini/reference/amimehagi-viewer/index.html?capture&dpr=${DPR}`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('console', m.type(), m.text().slice(0, 1600)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__amh);
  for (const shot of SHOTS) {
    const t = Date.now();
    if (shot.set) await page.evaluate((s) => window.__amh.set(s), shot.set);
    if (shot.call) await page.evaluate((c) => window.__amh[c.fn](...(c.args ?? [])), shot.call);
    if (shot.advance) await page.evaluate((s) => window.__amh.advance(s), shot.advance);
    if (shot.follow) await page.evaluate((f) => window.__amh.follow(f), shot.follow);
    if (shot.portrait) await page.evaluate((f) => window.__amh.portrait(f), shot.portrait);
    const info = await page.evaluate(() => window.__amh.state());
    if (only && !only.includes(shot.name)) continue;
    const file = path.join(outDir, `${shot.name}.jpg`);
    await page.locator('#view').screenshot({ path: file, type: 'jpeg', quality: 90 });
    console.log(`${shot.name}: ${((Date.now() - t) / 1000).toFixed(1)} s`, JSON.stringify(info));
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  try { process.kill(-server.pid); } catch { server.kill(); }
}
process.exit(code);
