#!/usr/bin/env node
// Renders the イシガレイ with the reference viewer in headless Chromium (software WebGL):
//   node tools/models/ishigarei/render.mjs [--only <shot,...>] [--out <dir>] [--shots <file.json>]
// Writes JPEGs to docs/models/ishigarei/ by default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'ishigarei')));
const only = arg('--only', null)?.split(',');
const W = Number(arg('--width', 1280)), H = Number(arg('--height', 760)), DPR = Number(arg('--dpr', 1));
fs.mkdirSync(outDir, { recursive: true });

// each shot: viewer state, then optional simulated seconds before the picture
const DEFAULT_SHOTS = [
  { name: 'top_lod0', set: { scene: 'top', lod: 0, seed: 1 } },
  { name: 'top_lod1', set: { scene: 'top', lod: 1, seed: 1 } },
  { name: 'top_lod2', set: { scene: 'top', lod: 2, seed: 1 } },
  { name: 'side_lod0', set: { scene: 'side', lod: 0, seed: 1 } },
  { name: 'head_closed', set: { scene: 'head', lod: 0, seed: 1, jaw: 0 } },
  { name: 'head_open', set: { scene: 'head', lod: 0, seed: 1, jaw: 1 } },
  { name: 'head_front', set: { scene: 'head', lod: 0, seed: 1, jaw: 0, cam: [0.055, 0.01, -0.002], target: [0.02, 0.001, -0.001] } },
  { name: 'head_top', set: { scene: 'head', lod: 0, seed: 1, jaw: 0, cam: [0.0175, 0.05, 0.0001], target: [0.0175, 0.0, -0.0005] } },
  { name: 'blind_lod0', set: { scene: 'blind', lod: 0, seed: 1 } },
  { name: 'tray_a', set: { scene: 'tray', lod: 0, seed: 2 } },
  { name: 'tray_b', set: { scene: 'tray', lod: 0, seed: 5 } },
  // a sandy shallow under 22 cm of water: three fish on their own, a stand-in brain, the game's water pass
  { name: 'flat_wide', set: { scene: 'flat' }, advance: 2 },
  { name: 'flat_rest', advance: 0.5, follow: { i: 0, offset: [0.08, 0.07, 0.06] } },
  { name: 'flat_buried', call: { fn: 'intent', args: ['burrow', 0, { seconds: 60 }] }, advance: 7, follow: { i: 0, offset: [0.05, 0.08, 0.06] } },
  { name: 'flat_glide', call: { fn: 'intent', args: ['wander', 1, { dx: 0.35, dz: -0.05, seconds: 8 }] }, advance: 1.1, follow: { i: 1, offset: [0.02, 0.025, 0.16], dt: [0, 0.008, 0] } },
  { name: 'flat_forage', call: { fn: 'intent', args: ['forage', 2, { seconds: 8 }] }, advance: 2.2, follow: { i: 2, offset: [0.07, 0.05, 0.05] } },
  { name: 'escape_0', call: { fn: 'startle' }, advance: 0.12, follow: { i: 0, offset: [0.02, 0.06, 0.22] } },
  { name: 'escape_1', advance: 0.3 },
];

const shotsFile = arg('--shots', null);
const SHOTS = shotsFile ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : DEFAULT_SHOTS;

const PORT = 5201;
const url = `http://localhost:${PORT}/gerupamasini/reference/ishigarei-viewer/index.html?capture&dpr=${DPR}`;
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
  await page.waitForFunction(() => window.__ish);
  for (const shot of SHOTS) {
    const t = Date.now();
    if (shot.set) await page.evaluate((s) => window.__ish.set(s), shot.set);
    if (shot.call) await page.evaluate((c) => window.__ish[c.fn](...(c.args ?? [])), shot.call);
    if (shot.advance) await page.evaluate((s) => window.__ish.advance(s), shot.advance);
    if (shot.follow) await page.evaluate((f) => window.__ish.follow(f), shot.follow);
    if (shot.portrait) await page.evaluate((f) => window.__ish.portrait(f), shot.portrait);
    const info = await page.evaluate(() => [window.__ish.state(), window.__ish.heights?.()]);
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
