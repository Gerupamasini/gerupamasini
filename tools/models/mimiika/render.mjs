#!/usr/bin/env node
// Renders the ミミイカ with the reference viewer in headless Chromium (software WebGL):
//   node tools/models/mimiika/render.mjs [--only <shot,...>] [--out <dir>] [--shots <file.json>]
// Writes JPEGs to docs/models/mimiika/ by default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'mimiika')));
const only = arg('--only', null)?.split(',');
const W = Number(arg('--width', 1280)), H = Number(arg('--height', 760)), DPR = Number(arg('--dpr', 1));
fs.mkdirSync(outDir, { recursive: true });

const DEFAULT_SHOTS = [
  // the model: side, back, front; the three tiers from above
  { name: 'side_lod0', set: { scene: 'tank', lod: 0, seed: 2, cam: [0.004, 0.012, 0.1] } },
  { name: 'top_lod0', set: { scene: 'top', lod: 0, seed: 2 } },
  { name: 'top_lod1', set: { scene: 'top', lod: 1, seed: 2 } },
  { name: 'top_lod2', set: { scene: 'top', lod: 2, seed: 2 } },
  { name: 'front_lod0', set: { scene: 'front', lod: 0, seed: 2 } },
  // the chromatophores: pale and glassy, the resting mottle, fully spread
  { name: 'skin_pale', set: { scene: 'tank', lod: 0, seed: 2, chroma: 'pale', cam: [0.035, 0.022, 0.055] } },
  { name: 'skin_mid', set: { chroma: null, cam: [0.035, 0.022, 0.055] } },
  { name: 'skin_dark', set: { chroma: 'dark', cam: [0.035, 0.022, 0.055] } },
  { name: 'skin_close', set: { chroma: null, cam: [-0.005, 0.03, 0.035], target: [-0.006, 0.008, 0.0] } },
  { name: 'eye_close', set: { cam: [0.022, 0.016, 0.03], target: [0.014, 0.007, 0.004] } },
  // the mantle's collar round the neck and the mouth of the mantle cavity; the suckers on the arms
  { name: 'collar', set: { scene: 'side', lod: 0, seed: 2, cam: [0.045, -0.03, 0.035], target: [0.004, 0.0, 0.0] } },
  { name: 'suckers', set: { cam: [0.045, -0.012, 0.012], target: [0.02, -0.002, 0.0] } },
  // the views of the photographs used for the comparison (12, 29)
  { name: 'photo12_view', set: { scene: 'tank', lod: 0, seed: 2, cam: [0.02, 0.03, 0.075], target: [0.004, 0.004, 0.0] } },
  { name: 'photo29_view', set: { cam: [0.045, 0.012, 0.06], target: [0.003, 0.004, 0.0] } },
  // burrowing: the jets blow the pit, the dorsal arms throw sand over the head, buried to the eyes
  { name: 'burrow_blow', set: { scene: 'tank', seed: 2 }, call: { fn: 'mode', args: ['BURROW'] }, advance: 1.6, follow: { offset: [0.045, 0.025, 0.05] } },
  { name: 'burrow_sweep', call: { fn: 'until', args: ['sweep', 10, 0, 0.62] }, follow: { offset: [0.045, 0.02, 0.05] } },
  { name: 'burrow_buried', call: { fn: 'until', args: ['buried', 10, 0, 2] }, follow: { offset: [0.05, 0.03, 0.045] } },
  // hovering on the fins; hunting: the strike and the catch
  { name: 'hover', set: { scene: 'tank', seed: 2 }, call: { fn: 'mode', args: ['HOVER'] }, advance: 3, follow: { offset: [0.0, 0.015, 0.09] } },
  { name: 'hover_top', follow: { offset: [0.001, 0.09, 0.0001] } },
  { name: 'hunt_watch', set: { scene: 'tank', seed: 3 }, call: { fn: 'mode', args: ['HUNT'] }, advance: 0.2, follow: { offset: [0.02, 0.03, 0.09] } },
  { name: 'hunt_approach', call: { fn: 'until', args: ['approach', 6, 0, 0.8] }, follow: { offset: [0.06, 0.02, 0.06] } },
  { name: 'hunt_strike', call: { fn: 'until', args: ['strike', 10, 0, 0.07] }, follow: { offset: [0.06, 0.02, 0.06] } },
  { name: 'hunt_eat', call: { fn: 'until', args: ['eat', 3, 0, 0.6] }, follow: { offset: [0.06, 0.02, 0.06] } },
  // escape: the flash and the ink, the jets mantle first
  { name: 'escape_ink', set: { scene: 'tank', seed: 2 }, call: { fn: 'mode', args: ['ESCAPE'] }, advance: 0.2, follow: { offset: [0.03, 0.04, 0.13] } },
  { name: 'escape_jet', advance: 0.25, follow: { offset: [0.03, 0.04, 0.16] } },
  // the sandy shallow under 30 cm of water: by day buried, at night out on the fins under a diver's torch
  { name: 'flat_rest', set: { scene: 'flat', awake: true }, call: { fn: 'mode', args: ['REST', 0] }, advance: 4, follow: { i: 0, offset: [0.03, 0.025, 0.055], dt: [0, 0.004, 0] } },
  { name: 'flat_rest_top', follow: { i: 0, offset: [0.0, 0.06, 0.012] } },
  { name: 'flat_day', set: { scene: 'flat' }, advance: 2 },
  { name: 'flat_buried', follow: { i: 0, offset: [0.05, 0.04, 0.05] } },
  { name: 'flat_night_hover', set: { scene: 'flat', night: true }, call: { fn: 'mode', args: ['HOVER', 0] }, advance: 4, follow: { i: 0, offset: [0.02, 0.03, 0.1] } },
  { name: 'flat_night_hunt', call: { fn: 'mode', args: ['HUNT', 0] }, advance: 0.1, follow: { i: 0, offset: [0.05, 0.035, 0.08] } },
  { name: 'flat_night_strike', call: { fn: 'until', args: ['strike', 10, 0, 0.07] }, follow: { i: 0, offset: [0.06, 0.03, 0.07] } },
];

const shotsFile = arg('--shots', null);
const SHOTS = shotsFile ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : DEFAULT_SHOTS;

const PORT = 5207;
const url = `http://localhost:${PORT}/gerupamasini/reference/mimiika-viewer/index.html?capture&dpr=${DPR}`;
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
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('console', m.type(), m.text().slice(0, 2400)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__mm);
  for (const shot of SHOTS) {
    const t = Date.now();
    if (shot.set) await page.evaluate((s) => window.__mm.set(s), shot.set);
    if (shot.call) await page.evaluate((c) => window.__mm[c.fn](...(c.args ?? [])), shot.call);
    if (shot.advance) await page.evaluate((s) => window.__mm.advance(s), shot.advance);
    if (shot.follow) await page.evaluate((f) => window.__mm.follow(f), shot.follow);
    const info = await page.evaluate(() => window.__mm.state?.());
    if (only && !only.includes(shot.name)) continue;
    const file = path.join(outDir, `${shot.name}.jpg`);
    await page.locator('#view').screenshot({ path: file, type: 'jpeg', quality: 90 });
    console.log(`${shot.name}: ${((Date.now() - t) / 1000).toFixed(1)} s`, JSON.stringify(info ?? null));
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  try { process.kill(-server.pid); } catch { server.kill(); }
}
process.exit(code);
