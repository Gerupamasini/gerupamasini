#!/usr/bin/env node
// 波打ち際ラボ (surf-lab.html) in headless Chromium (SwiftShader): the views of the lab's beach through one wave's
// cycle, each at fixed moments of the surf's clock. Starts the Vite dev server itself.
// Usage: node tests/smoke/surf-lab.mjs [--out <dir>] [--q mid] [--views beach,feet,along,side,reef,drone] [--n 6]
//   [--dt 0.6] [--t0 600] [--tide 0.3] [--hs 0.6] [--period 7] [--hour 8.5] [--debug 0] [--w 960 --h 540]
// Output: tests/smoke/out/surf-lab/<view>-<i>.png. Fails on any page or shader error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const outDir = path.resolve(opt('--out', path.join(root, 'tests', 'smoke', 'out', 'surf-lab')));
const q = opt('--q', 'mid');
const views = opt('--views', 'beach,feet,along,side,reef,drone').split(',');
const n = Number(opt('--n', 6)), dt = Number(opt('--dt', 0.6)), t0 = Number(opt('--t0', 600));
const set = { tide: Number(opt('--tide', 0.3)), hs: Number(opt('--hs', 0.6)), period: Number(opt('--period', 7)), hour: Number(opt('--hour', 8.5)) };
const debug = Number(opt('--debug', 0));
const W = Number(opt('--w', 960)), H = Number(opt('--h', 540));
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5217;
const url = `http://localhost:${PORT}/gerupamasini/surf-lab.html?shot&q=${q}`;
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
  page.setDefaultTimeout(900000);
  page.on('pageerror', (e) => { console.error('pageerror:', e.message); code = 1; });
  page.on('console', (m) => {
    const t = m.text();
    if (/Shader Error|ERROR: 0:/.test(t)) { console.error('shader:', t.slice(0, 3000)); code = 1; }
    else if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(t)) { console.error('console:', t.slice(0, 300)); code = 1; }
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__surfLab?.world, null, { timeout: 900000 });
  await page.evaluate(() => window.__surfLab.ready());
  await page.evaluate(([set, debug]) => { const L = window.__surfLab; for (const [k, v] of Object.entries(set)) L.set(k, v); L.state.paused = true; L.world.water.setSurfDebug(debug); }, [set, debug]);
  const frames = async (k) => { const f0 = await page.evaluate(() => window.__surfLab.world.water.uniforms.uTime.value); for (let i = 0; i < k; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); return f0; };
  for (const v of views) {
    await page.evaluate((v) => window.__surfLab.setView(v), v);
    await frames(6);
    for (let i = 0; i < n; i++) {
      await page.evaluate((t) => window.__surfLab.setClock(t), t0 + i * dt);
      await frames(2);
      await page.screenshot({ path: path.join(outDir, `${v}-${i}.png`) });
      console.log('shot', v, i);
    }
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
