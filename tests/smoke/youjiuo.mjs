#!/usr/bin/env node
// The ヨウジウオ in the game: enters the 走水 map, wades into the eelgrass at high water, spawns the animals and
// photographs a pipefish (crouched at the bed's edge, and in the observation view) in headless Chromium (SwiftShader).
// Starts the Vite dev server itself. Usage: node tests/smoke/youjiuo.mjs [--out <dir>]
// Output: tests/smoke/out/youjiuo-*.png (or <dir>). Fails on any page error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(root, 'tests', 'smoke', 'out'));
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5203;
const url = `http://localhost:${PORT}/gerupamasini/`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFrames(page, n, timeoutMs = 900000) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((target) => (window.__higata?.frameCount ?? 0) >= target, start + n, { timeout: timeoutMs });
}
let code = 0;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 120) throw new Error('vite did not start');
    await wait(250);
  }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => { console.error('pageerror:', e.message); code = 1; });
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) console.error('console:', m.text().slice(0, 300)); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 120000 });
  await page.evaluate(() => window.__higata.updateSettings({ quality: 'low' }));
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 120000 });
  await page.evaluate(() => window.__higata.enterField('hashirimizu'));
  await page.waitForFunction(() => window.__higata.world && window.__higata.creatures, null, { timeout: 300000 });
  await waitFrames(page, 4);
  // high water over the eelgrass, then into the bed
  await page.evaluate(() => { const a = window.__higata; a.clock.cancelTicket?.(); a.setTideOverride(0.9); a.teleport('amamo'); });
  await waitFrames(page, 6);
  // spawn until there are pipefish, then put one in front of the player
  const fish = await page.evaluate(() => {
    const a = window.__higata;
    for (let i = 0; i < 8; i++) {
      a.forceSpawn();
      if (a.creatures.individuals.some((x) => x.species.id === 'syngnathus_schlegeli')) break;
    }
    const all = a.creatures.individuals.filter((x) => x.species.id === 'syngnathus_schlegeli');
    const p = a.player.position;
    all.sort((x, y) => x.pos.distanceTo(p) - y.pos.distanceTo(p));
    return all.map((x) => ({ id: x.id, len: x.length_mm, pos: x.pos.toArray().map((v) => +v.toFixed(2)) }));
  });
  console.log('pipefish', JSON.stringify(fish));
  if (!fish.length) throw new Error('no pipefish spawned in the eelgrass');
  // a few seconds for it to settle on a blade (software GL runs at a few frames a second)
  await waitFrames(page, 24);
  const near = await page.evaluate((id) => {
    const a = window.__higata;
    const f = a.creatures.get(id);
    const d = a.creatures.driverOf(id);
    const c = d.anchor().clone();
    const dist = 0.7;
    const s = a.world.amamo.seaward;
    // from the open side of the bed if possible
    const px = c.x + s.x * dist, pz = c.z + s.y * dist;
    a.player.setPose(px, pz, Math.atan2(-(c.x - px), -(c.z - pz)));
    a.player.lowView = true;
    a.player.pitch = -0.15;
    return { state: d.debugLabel(), len: f.length_mm };
  }, fish[0].id);
  console.log('nearest', JSON.stringify(near));
  await waitFrames(page, 8);
  await page.screenshot({ path: path.join(outDir, 'youjiuo-ingame-wade.png') });
  await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); }, fish[0].id);
  await waitFrames(page, 12);
  const st = await page.evaluate((id) => window.__higata.creatures.driverOf(id).debugLabel(), fish[0].id);
  console.log('observed', st);
  await page.screenshot({ path: path.join(outDir, 'youjiuo-ingame-observe.png') });
  await page.evaluate(() => window.__higata.exitObserve());
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
