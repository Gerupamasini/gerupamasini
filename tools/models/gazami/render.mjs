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

const TOP = { cam: [0, 0.42, 0.0001], target: [0, 0, 0.01], up: [0, 0, 1] };
const DEFAULT_SHOTS = [
  // the shape stage: untextured clay in the four views compared with the photographs (outline overlay on 61 / 19)
  { name: 'clay_top', set: { view: 'top', clay: true, behave: false, lod: 0, pose: 'rest', morph: 0, seed: 4, floor: false, ortho: 0.075, ...TOP } },
  { name: 'clay_front', set: { view: 'front', pose: 'rest', legs: {}, floor: true, ortho: 0, fov: 40, cam: [0.03, 0.028, 0.15], target: [-0.004, 0.014, 0.0] } },
  { name: 'clay_side', set: { view: 'side', pose: 'stand', legs: {}, ortho: 0.06, cam: [0.4, 0.015, 0.0], target: [0.0, 0.015, 0.0], up: [0, 1, 0] } },
  { name: 'clay_oblique', set: { view: 'oblique', pose: 'stand', ortho: 0, fov: 30, cam: [0.2, 0.17, 0.22], target: [0.0, 0.01, 0.0] } },
  { name: 'clay_shell_top', set: { view: 'top', floor: false, pose: 'bind', hideLegs: true, ortho: 0.045, ...TOP, target: [0, 0, 0] } },
  // the finished crab in the six views of the final check
  { name: 'top', set: { view: 'top', floor: false, clay: false, hideLegs: false, pose: 'rest', ortho: 0.075, bg: 9419972, ...TOP } },
  { name: 'front', set: { view: 'front', pose: 'rest', legs: {}, floor: true, ortho: 0, fov: 40, cam: [0.03, 0.028, 0.15], target: [-0.004, 0.014, 0.0] } },
  { name: 'side', set: { view: 'side', pose: 'stand', legs: {}, floor: true, ortho: 0, fov: 30, cam: [0.28, 0.05, 0.02], target: [0.0, 0.014, 0.0] } },
  { name: 'oblique', set: { view: 'oblique', pose: 'stand', fov: 30, cam: [0.2, 0.17, 0.22], target: [0.0, 0.01, 0.0] } },
  { name: 'macro_carapace', set: { view: 'macro', pose: 'rest', fov: 30, cam: [0.0, 0.07, 0.065], target: [0.0, 0.016, 0.0] } },
  { name: 'macro_chela', set: { view: 'macro', pose: 'stand', fov: 28, cam: [0.07, 0.035, 0.11], target: [0.03, 0.006, 0.045] } },
  { name: 'macro_paddle', set: { view: 'macro', pose: 'stand', fov: 30, cam: [0.1, 0.08, -0.1], target: [0.035, 0.012, -0.035] } },
  { name: 'macro_eye', set: { view: 'macro', pose: 'rest', legs: {}, floor: true, fov: 10, cam: [0.0447, 0.0436, 0.0624], target: [0.0112, 0.0254, 0.0239] } },
  { name: 'macro_face', set: { view: 'front', pose: 'stand', legs: {}, floor: true, ortho: 0, fov: 22, cam: [0.02, 0.03, 0.12], target: [0.0, 0.017, 0.02] } },
  { name: 'under', set: { view: 'under', pose: 'stand', ortho: 0.07, cam: [0, -0.4, 0.0001], target: [0, 0.05, 0.0], up: [0, 0, 1] } },
  { name: 'under_female', set: { view: 'under', sex: 1, pose: 'stand', ortho: 0.07, cam: [0, -0.4, 0.0001], target: [0, 0.05, 0.0], up: [0, 0, 1] } },
  // the tiers
  { name: 'lod0', set: { view: 'oblique', sex: 0, pose: 'stand', ortho: 0, fov: 30, lod: 0, cam: [0.2, 0.17, 0.22], target: [0.0, 0.01, 0.0] } },
  { name: 'lod1', set: { lod: 1 } },
  { name: 'lod2', set: { lod: 2 } },
  // the colour morphs and the juvenile (top view)
  { name: 'morph_olive', set: { view: 'top', floor: false, lod: 0, pose: 'rest', morph: 0, seed: 4, ortho: 0.075, bg: 15461355, ...TOP } },
  { name: 'morph_purple', set: { view: 'top', floor: false, morph: 1, seed: 6, ortho: 0.075, ...TOP } },
  { name: 'morph_dark', set: { view: 'top', floor: false, morph: 2, seed: 7, ortho: 0.075, ...TOP } },
  { name: 'morph_green', set: { view: 'top', floor: false, morph: 3, seed: 8, ortho: 0.075, ...TOP } },
  { name: 'juvenile', set: { view: 'top', floor: false, morph: 0, juvenile: 1, cw: 32, seed: 9, ortho: 0.024, ...TOP, cam: [0, 0.2, 0.0001], target: [0, 0, 0.003] } },
  // the seven behaviours on a sand bed (studio light)
  { name: 'b_idle', set: { view: 'oblique', behave: true, juvenile: 0, cw: 100, morph: 0, seed: 4, ortho: 0, fov: 30, floor: true }, call: { fn: 'mode', args: ['IDLE'] }, advance: 2, follow: { offset: [0.2, 0.16, 0.22] } },
  { name: 'b_walk', call: { fn: 'mode', args: ['WALK'] }, advance: 1.3, follow: { offset: [0.05, 0.12, 0.3] } },
  { name: 'b_forage', call: { fn: 'mode', args: ['FORAGE'] }, advance: 2.2, follow: { offset: [0.12, 0.1, 0.22] } },
  { name: 'b_dig', call: { fn: 'mode', args: ['BURROW'] }, advance: 2.2, follow: { offset: [0.15, 0.13, 0.22] } },
  { name: 'b_buried', advance: 6, follow: { offset: [0.1, 0.09, 0.2] } },
  { name: 'b_defend', set: { view: 'oblique', behave: true, seed: 5 }, call: { fn: 'mode', args: ['DEFEND'] }, advance: 1.6, follow: { offset: [0.04, 0.09, 0.3] } },
  { name: 'b_escape', call: { fn: 'mode', args: ['ESCAPE'] }, advance: 0.7, follow: { offset: [0.1, 0.14, 0.32] } },
  { name: 'b_swim', set: { view: 'side', behave: true, seed: 6 }, call: { fn: 'mode', args: ['SWIM'] }, advance: 1.4, follow: { offset: [0.02, 0.03, 0.3], dt: [0, 0, 0] } },
  { name: 'b_swim_stroke2', advance: 0.08, follow: { offset: [0.02, 0.03, 0.3], dt: [0, 0, 0] } },
  { name: 'b_swim_oblique', advance: 0.08, follow: { offset: [0.2, 0.12, 0.2] } },
  // the swimming crab from above, as in photograph 6
  { name: 'photo6_view', advance: 0.1, follow: { offset: [0.0, 0.32, 0.001] } },
  // the views of the photographs used for the comparison (no photograph is reproduced here)
  { name: 'photo19_view', set: { view: 'top', floor: false, behave: false, sex: 1, pose: 'rest', morph: 0, seed: 4, ortho: 0.075, bg: 9419972, ...TOP } },
  { name: 'photo61_view', set: { view: 'top', floor: false, sex: 0, pose: 'stand', morph: 1, seed: 6, ortho: 0.075, bg: 15461355, ...TOP } },
  { name: 'photo66_view', set: { view: 'front', floor: true, pose: 'stand', morph: 0, seed: 4, ortho: 0, fov: 40, legs: { P1R: { promo: 0.55, lev: -0.1, meYaw: 0.3, mcYaw: -1.3, mc: -0.55, cp: -0.5, cpRoll: 0.0, cpYaw: -0.05 } }, cam: [0.03, 0.028, 0.15], target: [-0.004, 0.014, 0.0] } },
  { name: 'photo64_view', set: { view: 'oblique', floor: true, pose: 'defend', legs: {}, morph: 0, seed: 8, fov: 35, cam: [-0.06, 0.16, 0.2], target: [0.0, 0.012, 0.0] } },
  // the sandy shallow under 30 cm of water (the game's water pass)
  { name: 'flat_day', set: { scene: 'flat', count: 3 }, advance: 6 },
  { name: 'flat_close', follow: { i: 0, offset: [0.18, 0.14, 0.2] } },
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
