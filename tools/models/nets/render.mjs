#!/usr/bin/env node
// Renders the hand nets with the reference viewer in headless Chromium (software WebGL):
//   node tools/models/nets/render.mjs [--only <shot-name,...>] [--out <dir>]
// Writes JPEGs to docs/models/nets/ by default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'nets')));
const only = arg('--only', null)?.split(',');
const { SHOTS } = await import(path.resolve(arg('--shots', path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots.mjs'))));
const W = Number(arg('--width', 1600)), H = Number(arg('--height', 1000)), DPR = Number(arg('--dpr', 1.5));
fs.mkdirSync(outDir, { recursive: true });

const PORT = 5199;
const url = `http://localhost:${PORT}/gerupamasini/reference/nets-viewer/index.html?capture&dpr=${DPR}`;
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
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text().slice(0, 300)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__nets);
  for (const shot of SHOTS) {
    if (only && !only.includes(shot.name)) continue;
    const t = Date.now();
    const info = await page.evaluate((s) => window.__nets.set(s), shot);
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
