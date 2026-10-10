#!/usr/bin/env node
// Renders the アラムシロ with the reference viewer in headless Chromium (software WebGL):
//   node tools/models/aramushiro/render.mjs [--only <shot,...>] [--out <dir>] [--shots <file.mjs>]
// Writes JPEGs to docs/models/aramushiro/ by default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'aramushiro')));
const only = arg('--only', null)?.split(',');
const W = Number(arg('--width', 1280)), H = Number(arg('--height', 760)), DPR = Number(arg('--dpr', 1));
fs.mkdirSync(outDir, { recursive: true });

const shotsFile = arg('--shots', null);
const SHOTS = shotsFile ? (await import(pathToFileURL(path.resolve(shotsFile)).href)).default : (await import('./shots.mjs')).default;

const PORT = Number(arg('--port', 5197));
const url = `http://localhost:${PORT}/gerupamasini/reference/aramushiro-viewer/index.html?capture&dpr=${DPR}`;
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
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('console', m.type(), m.text().slice(0, 1200)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__am);
  // (with --only, the shots after the last one asked for are not run)
  const lastShot = only ? Math.max(...only.map((n) => SHOTS.findIndex((s) => s.name === n))) : SHOTS.length - 1;
  for (const shot of SHOTS.slice(0, lastShot + 1)) {
    const t = Date.now();
    for (const step of shot.steps ?? []) await page.evaluate(([k, a]) => window.__am[k](...a), step);
    const info = await page.evaluate(() => (window.__am.state ? window.__am.state() : null));
    if (only && !only.includes(shot.name)) continue;
    const file = path.join(outDir, `${shot.name}.jpg`);
    await page.locator('#view').screenshot({ path: file, type: 'jpeg', quality: 90 });
    console.log(`${shot.name}: ${((Date.now() - t) / 1000).toFixed(1)} s`, info ? JSON.stringify(info).slice(0, 300) : '');
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
