#!/usr/bin/env node
// Renders the エドハゼ tiers through the game's own loader and materials in headless Chromium (software WebGL):
// each tier at the size it is seen at (hero full frame and head, lod1 near / tank, lod2 at a distance, enlarged),
// for checking a rebuilt tier against what it replaces.
//   node tools/models/edohaze/tiers.mjs [--out <dir>] [--set <dir under models-packed>]... [--gravid] [--only <tier>]
// Writes <out>/<set>[_gravid]__<shot>.png (default out: tests/smoke/out/edohaze-tiers, set: edohaze). To compare with an
// older build, copy its packed tiers into another directory under src/assets/models-packed (e.g. edohaze-before) and
// pass both sets. Remove that directory afterwards: it has no masters, so `npm run models:check` (and `npm run check`)
// fails while it is there, the packer deletes it, and a build would bundle it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const all = (k) => args.flatMap((a, i) => (args[i - 1] === k ? [a] : []));
const arg = (k, d) => all(k)[0] ?? d;
const outDir = path.resolve(arg('--out', path.join(root, 'tests', 'smoke', 'out', 'edohaze-tiers')));
const sets = all('--set').length ? all('--set') : ['edohaze'];
const only = arg('--only', null);
const gravid = args.includes('--gravid');
fs.mkdirSync(outDir, { recursive: true });

const SHOTS = [
  { name: 'hero-side', tier: 'hero', hero: true, px: 1000, view: 'side' },
  { name: 'hero-head', tier: 'hero', hero: true, px: 1000, view: 'head' },
  { name: 'hero-top', tier: 'hero', hero: true, px: 560, view: 'top' },
  { name: 'hero-yawn', tier: 'hero', hero: true, px: 1000, view: 'mouth', yawn: true },
  { name: 'hero-tail', tier: 'hero', hero: true, px: 1000, view: 'tail' },
  { name: 'herostd-side', tier: 'hero', hero: false, px: 1000, view: 'side' },
  { name: 'lod1-tank', tier: 'lod1', px: 460, view: 'front34', size: [640, 400] },
  { name: 'lod1-side', tier: 'lod1', px: 240, view: 'side', size: [320, 200] },
  { name: 'lod2-side', tier: 'lod2', px: 60, view: 'side', size: [96, 60] },
  { name: 'lod2-34', tier: 'lod2', px: 60, view: 'front34', size: [96, 60] },
  { name: 'lod1-at60', tier: 'lod1', px: 60, view: 'side', size: [96, 60] },
];

const PORT = 5199;
const url = `http://localhost:${PORT}/gerupamasini/tools/models/edohaze/tiers.html`;
// (vite itself, not through npx: killing it at the end then stops the server)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 120) throw new Error('vite did not start');
    await wait(250);
  }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { console.error('pageerror', e.message); code = 1; });
  page.on('console', (m) => { if (m.type() === 'error') { console.error('console:', m.text().slice(0, 1500)); code = 1; } });
  await page.goto(url);
  await page.waitForFunction(() => window.__tiersReady);
  for (const set of sets) {
    for (const s of SHOTS) {
      if (only && s.tier !== only) continue;
      const rel = `${set}/edohaze${gravid ? '_gravid' : ''}.${s.tier}.glb`;
      const r = await page.evaluate((o) => window.__tiers.shot(o), { rel, hero: s.hero, px: s.px, view: s.view, size: s.size, yawn: s.yawn });
      fs.writeFileSync(path.join(outDir, `${set}${gravid ? '_gravid' : ''}__${s.name}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
      console.log(`${set} ${s.name}: ${JSON.stringify(r.info)}`);
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
