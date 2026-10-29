#!/usr/bin/env node
// Renders the トビハゼ with the reference viewer (reference/tobihaze-viewer) in headless Chromium (software WebGL):
//   node tools/models/tobihaze/render.mjs [--shots <file.mjs>] [--model <glb>] [--only a,b] [--out <dir>]
// The shots module exports SHOTS: [{ name, mode: 'clay' | 'textured' | 'silhouette', view: {...} }] (see the viewer's
// setView). Writes JPEGs (PNG with --png) to --out (default tools/models/tobihaze/out/render).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(here, 'out', 'render')));
const only = arg('--only', null)?.split(',');
const { SHOTS } = await import(path.resolve(arg('--shots', path.join(here, 'shots-head.mjs'))));
const model = path.resolve(arg('--model', path.join(here, 'out', 'head-clay.glb')));
const W = Number(arg('--width', 1200)), H = Number(arg('--height', 900)), DPR = Number(arg('--dpr', 1));
const png = args.includes('--png');
fs.mkdirSync(outDir, { recursive: true });

const PORT = Number(arg('--port', 5207));
const modelUrl = `/gerupamasini/${path.relative(root, model).split(path.sep).join('/')}`;
const url = `http://localhost:${PORT}/gerupamasini/reference/tobihaze-viewer/index.html?capture&dpr=${DPR}&model=${encodeURIComponent(modelUrl)}`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 120) throw new Error('vite did not start');
    await wait(250);
  }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { console.error('pageerror', e.message); code = 1; });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__tobi);
  for (const shot of SHOTS) {
    if (only && !only.includes(shot.name)) continue;
    const t = Date.now();
    const s = { ...shot, model: shot.model ? `/gerupamasini/${shot.model}` : undefined };
    await page.evaluate((x) => window.__tobi.set(x), s);
    const file = path.join(outDir, `${shot.name}.${png ? 'png' : 'jpg'}`);
    await page.locator('#view').screenshot({ path: file, type: png ? 'png' : 'jpeg', ...(png ? {} : { quality: 92 }) });
    console.log(`${shot.name}: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
