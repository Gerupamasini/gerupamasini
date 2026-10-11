#!/usr/bin/env node
// In-game pictures of the アミメハギ (headless Chromium, software WebGL): the 走水 shore on a summer noon, the tide set
// over the アマモ beds, a few fish set down among the leaves and one of them observed.
//   node tools/models/amimehagi/ingame.mjs [--out <dir>] [--tide <m>] [--quality low|mid|high]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'amimehagi')));
const tide = Number(arg('--tide', 0.25));
const quality = arg('--quality', 'low');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5197;
const url = `http://localhost:${PORT}/gerupamasini/`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
async function frames(page, n) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((t) => (window.__higata?.frameCount ?? 0) >= t, start + n, { timeout: 600000 });
}
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 80) throw new Error('vite did not start');
    await wait(250);
  }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { console.error('pageerror', e.message); code = 1; });
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/net::ERR_|Failed to load resource/.test(t)) { console.error('console', t.slice(0, 1200)); code = 1; } } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 120000 });
  await page.evaluate((q) => window.__higata.updateSettings({ quality: q }), quality);
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 120000 });
  await page.evaluate(() => window.__higata.enterField('hashirimizu'));
  await page.waitForFunction(() => window.__higata.world && window.__higata.player && window.__higata.mode === 'field', null, { timeout: 300000 });
  // a summer noon, the tide over the beds
  await page.evaluate((tide) => {
    const a = window.__higata;
    a.setDebugTime(Date.UTC(2026, 7, 12, 3, 30));
    a.setTideOverride(tide);
    a.teleport('amamo');
  }, tide);
  await frames(page, 6);
  await page.screenshot({ path: path.join(outDir, 'ingame_meadow_view.jpg'), type: 'jpeg', quality: 88 });
  // four fish a few metres ahead, among the leaves
  const ids = await page.evaluate(() => {
    const a = window.__higata;
    a.creatures.setHiddenSpecies(['mugil_cephalus']);
    for (let i = 0; i < 4; i++) a.debugSpawn('rudarius_ercodes', 3.2 + i * 0.25);
    return a.creatures.individuals.filter((i) => i.species.id === 'rudarius_ercodes').map((i) => i.id);
  });
  console.log('fish', ids.length);
  await frames(page, 8);
  // walk up to the nearest and crouch beside it
  await page.evaluate(() => {
    const a = window.__higata;
    const p = a.player.position;
    const f = a.creatures.individuals.filter((i) => i.species.id === 'rudarius_ercodes').sort((x, y) => x.pos.distanceTo(p) - y.pos.distanceTo(p))[0];
    const px = f.pos.x - 0.9, pz = f.pos.z + 0.3;
    a.player.setPose(px, pz, Math.atan2(-(f.pos.x - px), -(f.pos.z - pz)));
    a.player.lowView = true;
    a.player.pitch = -0.55;
  });
  await frames(page, 6);
  await page.screenshot({ path: path.join(outDir, 'ingame_meadow_low.jpg'), type: 'jpeg', quality: 88 });
  // observe one
  const obs = await page.evaluate(() => {
    const a = window.__higata;
    const p = a.player.position;
    const f = a.creatures.individuals.filter((i) => i.species.id === 'rudarius_ercodes').sort((x, y) => x.pos.distanceTo(p) - y.pos.distanceTo(p))[0];
    a.enterObserve(f);
    return { id: f.id, len: f.length_mm };
  });
  console.log('observe', JSON.stringify(obs));
  for (let k = 0; k < 3; k++) {
    await frames(page, 12);
    const label = await page.evaluate((id) => window.__higata.creatures.driverOf(id)?.debugLabel?.() ?? '', obs.id);
    console.log(`observe_${k}`, label);
    await page.screenshot({ path: path.join(outDir, `ingame_observe_${k}.jpg`), type: 'jpeg', quality: 88 });
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  try { process.kill(-server.pid); } catch { server.kill(); }
}
process.exit(code);
