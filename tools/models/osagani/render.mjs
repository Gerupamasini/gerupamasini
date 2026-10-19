#!/usr/bin/env node
// Renders the ヤマトオサガニ with the reference viewer in headless Chromium (software WebGL):
//   node tools/models/osagani/render.mjs [--only <shot,...>] [--out <dir>] [--shots <file.json|.mjs>] [--port <n>] [--url <running server>]
// Writes JPEGs to docs/models/yamatoosagani/ by default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'yamatoosagani')));
const only = arg('--only', null)?.split(',');
const W = Number(arg('--width', 1280)), H = Number(arg('--height', 760)), DPR = Number(arg('--dpr', 1));
fs.mkdirSync(outDir, { recursive: true });

const shotsFile = arg('--shots', null);
const SHOTS = shotsFile
  ? shotsFile.endsWith('.json') ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : (await import(pathToFileURL(path.resolve(shotsFile)).href)).default
  : (await import('./shots.mjs')).default;

const PORT = Number(arg('--port', 5223));
const base = arg('--url', null);
const url = `${base ?? `http://localhost:${PORT}`}/gerupamasini/reference/osagani-viewer/index.html?capture&dpr=${DPR}`;
const server = base ? null : spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('console', m.type(), m.text().slice(0, 2400)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__os);
  if (fs.existsSync(path.join(root, 'reference', 'osagani-viewer', 'scan.glb')) && SHOTS.some((s) => s.set?.scan)) await page.evaluate(() => window.__os.loadScan());
  for (const shot of SHOTS) {
    const t = Date.now();
    if (shot.size) await page.setViewportSize({ width: shot.size[0], height: shot.size[1] });
    if (shot.set) await page.evaluate((s) => window.__os.set(s), shot.set);
    if (shot.call) await page.evaluate((c) => window.__os[c.fn](...(c.args ?? [])), shot.call);
    if (shot.advance) await page.evaluate((s) => window.__os.advance(s), shot.advance);
    if (shot.follow) await page.evaluate((f) => window.__os.follow(f), shot.follow);
    const info = await page.evaluate(() => window.__os.info?.());
    if (only && !only.includes(shot.name)) continue;
    if (shot.name.startsWith('_')) continue;
    const file = path.join(outDir, `${shot.name}.jpg`);
    await page.locator('#view').screenshot({ path: file, type: 'jpeg', quality: 90 });
    console.log(`${shot.name}: ${((Date.now() - t) / 1000).toFixed(1)} s`, JSON.stringify(info ?? null));
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  if (server) { try { process.kill(-server.pid); } catch { server.kill(); } }
}
process.exit(code);
