#!/usr/bin/env node
// Renders the ハク with the reference viewer in headless Chromium (software WebGL):
//   node tools/models/haku/render.mjs [--only <shot,...>] [--out <dir>]
// Writes JPEGs to docs/models/haku/ by default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'haku')));
const only = arg('--only', null)?.split(',');
const W = Number(arg('--width', 1280)), H = Number(arg('--height', 760)), DPR = Number(arg('--dpr', 1));
fs.mkdirSync(outDir, { recursive: true });

// each shot: viewer state, then optional simulated seconds before the picture
const SHOTS = [
  { name: 'side_lod0', set: { scene: 'side', lod: 0 } },
  { name: 'side_lod1', set: { scene: 'side', lod: 1 } },
  { name: 'side_lod2', set: { scene: 'side', lod: 2 } },
  { name: 'top_lod0', set: { scene: 'top', lod: 0 } },
  { name: 'front_lod0', set: { scene: 'front', lod: 0 } },
  { name: 'head_lod0', set: { scene: 'side', lod: 0, cam: [0.028, 0.004, 0.018], target: [0, 0.0, 0.008] } },
  { name: 'shallows_school', set: { scene: 'shallows' }, advance: 6, follow: true },
  { name: 'shallows_close', set: { scene: 'shallows', cam: [0.1, 0.28, 0.32], target: [0, -0.04, 0] }, advance: 2, follow: true },
  { name: 'escape_0', startle: true, advance: 0.06, follow: true },
  { name: 'escape_1', advance: 0.12 },
  { name: 'escape_2', advance: 0.5, follow: true },
  { name: 'escape_3', advance: 2.5, follow: true },
];

const PORT = 5198;
const url = `http://localhost:${PORT}/gerupamasini/reference/haku-viewer/index.html?capture&dpr=${DPR}`;
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
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('console', m.type(), m.text().slice(0, 600)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__haku);
  for (const shot of SHOTS) {
    const t = Date.now();
    if (shot.set) await page.evaluate((s) => window.__haku.set(s), shot.set);
    if (shot.startle) await page.evaluate(() => window.__haku.startle());
    if (shot.advance) await page.evaluate((s) => window.__haku.advance(s), shot.advance);
    if (shot.follow) await page.evaluate(() => { const st = window.__haku.state()[0]; if (st) window.__haku.set({ target: st.center }); });
    const info = await page.evaluate(() => window.__haku.state());
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
  server.kill();
}
process.exit(code);
