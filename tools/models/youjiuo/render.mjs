#!/usr/bin/env node
// Renders the ヨウジウオ with the reference viewer in headless Chromium (software WebGL):
//   node tools/models/youjiuo/render.mjs [--only <shot,...>] [--out <dir>]
// Writes JPEGs to docs/models/youjiuo/ by default.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'youjiuo')));
const only = arg('--only', null)?.split(',');
const W = Number(arg('--width', 1280)), H = Number(arg('--height', 760)), DPR = Number(arg('--dpr', 1));
fs.mkdirSync(outDir, { recursive: true });

// each shot: viewer state, an action, simulated seconds, a camera that follows fish 0 (offset, head, or flank)
const SHOTS = [
  { name: 'side_lod0', set: { scene: 'side', lod: 0 } },
  { name: 'side_lod1', set: { scene: 'side', lod: 1 } },
  { name: 'side_lod2', set: { scene: 'side', lod: 2 } },
  { name: 'specimen', set: { scene: 'specimen', lod: 0 } },
  { name: 'portrait', set: { scene: 'portrait', lod: 0 } },
  { name: 'portrait_belly', set: { cam: [0.03, -0.05, 0.15], target: [-0.03, -0.008, 0.0], fov: 26 } },
  { name: 'head_lod0', set: { scene: 'head', lod: 0 } },
  { name: 'front_lod0', set: { scene: 'front', lod: 0 } },
  { name: 'aquarium_hold', set: { scene: 'aquarium', lod: 'auto' }, advance: 9 },
  { name: 'aquarium_close', set: { fov: 30 }, advance: 1, side: [0.17, 0.045, 0.01] },
  { name: 'meadow_wide', set: { scene: 'meadow', lod: 'auto' }, advance: 14 },
  { name: 'meadow_hold', act: 'hold', until: ['GRASS_HOLD', 'hold', 20], advance: 0.5, follow: [0.34, 0.02, 0.1] },
  { name: 'meadow_hold_close', advance: 1.3, follow: [0.16, -0.04, 0.06] },
  { name: 'forage_stalk', act: 'forage', until: ['FORAGE', 'stalk', 10], advance: 1.0, follow: [0.2, 0.03, 0.08] },
  { name: 'forage_strike', until: ['FORAGE', 'strike', 12], follow: [0.2, 0.03, 0.08] },
  { name: 'forage_strike_head', advance: 0.02, head: [0.065, 0.014, 0.035] },
  { name: 'forage_recover_head', advance: 0.12, head: [0.065, 0.014, 0.035] },
  { name: 'swim', act: 'swim', advance: 3, follow: [0.12, 0.08, 0.45] },
  { name: 'escape_0', startle: true, advance: 0.15, follow: [0.45, 0.12, 0.2] },
  { name: 'escape_1', advance: 0.35 },
  { name: 'escape_2', advance: 2.5, follow: [0.45, 0.1, 0.2] },
];

const PORT = 5199;
const url = `http://localhost:${PORT}/gerupamasini/reference/youjiuo-viewer/index.html?capture&dpr=${DPR}`;
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
  await page.waitForFunction(() => window.__yj);
  // (with --only, the shots after the last one asked for are not run)
  const lastShot = only ? Math.max(...only.map((n) => SHOTS.findIndex((s) => s.name === n))) : SHOTS.length - 1;
  for (const shot of SHOTS.slice(0, lastShot + 1)) {
    const t = Date.now();
    if (shot.set) await page.evaluate((s) => window.__yj.set(s), shot.set);
    if (shot.act) await page.evaluate((a) => window.__yj.act(a), shot.act);
    if (shot.startle) await page.evaluate(() => window.__yj.startle());
    if (shot.until) await page.evaluate((u) => window.__yj.until(...u), shot.until);
    if (shot.advance) await page.evaluate((s) => window.__yj.advance(s), shot.advance);
    if (shot.follow) await page.evaluate((o) => window.__yj.follow(0, o), shot.follow);
    if (shot.head) await page.evaluate((o) => window.__yj.followHead(0, o), shot.head);
    if (shot.side) await page.evaluate((o) => window.__yj.followSide(0, ...o), shot.side);
    const info = await page.evaluate(() => window.__yj.state());
    if (only && !only.includes(shot.name)) continue;
    const file = path.join(outDir, `${shot.name}.jpg`);
    await page.locator('#view').screenshot({ path: file, type: 'jpeg', quality: 90 });
    console.log(`${shot.name}: ${((Date.now() - t) / 1000).toFixed(1)} s`, JSON.stringify(info[0]));
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
