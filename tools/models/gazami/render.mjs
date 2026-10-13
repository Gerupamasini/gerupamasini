#!/usr/bin/env node
// Renders the ガザミ with the reference viewer in headless Chromium (software WebGL):
//   node tools/models/gazami/render.mjs [--only <shot,...>] [--out <dir>] [--shots <file.json>] [--port <n>]
// Writes JPEGs to docs/models/gazami/ by default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'gazami')));
const only = arg('--only', null)?.split(',');
const W = Number(arg('--width', 1280)), H = Number(arg('--height', 760)), DPR = Number(arg('--dpr', 1));
fs.mkdirSync(outDir, { recursive: true });

const DEFAULT_SHOTS = [
  { name: 'clay_top', set: { view: 'top', clay: true, lod: 0, pose: 'stand' } },
  { name: 'clay_front', set: { view: 'front' } },
  { name: 'clay_side', set: { view: 'side' } },
  { name: 'clay_oblique', set: { view: 'oblique' } },
];

const shotsFile = arg('--shots', null);
const SHOTS = shotsFile ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : DEFAULT_SHOTS;

const PORT = Number(arg('--port', 5213));
const url = `http://localhost:${PORT}/gerupamasini/reference/gazami-viewer/index.html?capture&dpr=${DPR}`;
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
  await page.waitForFunction(() => window.__gz);
  for (const shot of SHOTS) {
    const t = Date.now();
    if (shot.set) await page.evaluate((s) => window.__gz.set(s), shot.set);
    if (shot.call) await page.evaluate((c) => window.__gz[c.fn](...(c.args ?? [])), shot.call);
    if (shot.advance) await page.evaluate((s) => window.__gz.advance(s), shot.advance);
    if (shot.follow) await page.evaluate((f) => window.__gz.follow(f), shot.follow);
    const info = await page.evaluate(() => window.__gz.info?.());
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
