#!/usr/bin/env node
// The アラムシロ in the game: enters the 走水 map at mid tide, walks to the water's edge, spawns the animals, lays a
// crushed clam by the nearest snails and photographs them (crouched, and in the observation view) in headless
// Chromium (SwiftShader). Starts the Vite dev server itself. Usage: node tests/smoke/aramushiro.mjs [--out <dir>]
// Output: tests/smoke/out/aramushiro-*.png (or <dir>). Fails on any page error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(root, 'tests', 'smoke', 'out'));
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5207;
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
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) { console.error('console:', m.text().slice(0, 300)); code = 1; } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 120000 });
  await page.evaluate(() => window.__higata.updateSettings({ quality: 'low' }));
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 120000 });
  await page.evaluate(() => window.__higata.enterField('hashirimizu'));
  await page.waitForFunction(() => window.__higata.world && window.__higata.creatures, null, { timeout: 300000 });
  await waitFrames(page, 4);
  // late morning (JST), low water, at the water's edge of the clam flat; polarised sunglasses (the glare off the
  // surface hides the bed otherwise)
  await page.evaluate(() => { const a = window.__higata; a.clock.cancelTicket?.(); const d = new Date(); a.clock.setDebugTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 1, 30)); a.setTideOverride(0.12); a.teleport('waterline'); if (!a.settings.sunglasses) a.toggleSunglasses(); });
  await waitFrames(page, 6);
  const snails = await page.evaluate(() => {
    const a = window.__higata;
    for (let i = 0; i < 10; i++) {
      a.forceSpawn();
      if (a.creatures.individuals.filter((x) => x.species.id === 'reticunassa_festiva').length >= 3) break;
    }
    const all = a.creatures.individuals.filter((x) => x.species.id === 'reticunassa_festiva');
    const p = a.player.position;
    all.sort((x, y) => x.pos.distanceTo(p) - y.pos.distanceTo(p));
    return all.map((x) => ({ id: x.id, len: x.length_mm, pos: x.pos.toArray().map((v) => +v.toFixed(2)) }));
  });
  console.log('snails', snails.length, JSON.stringify(snails.slice(0, 4)));
  if (!snails.length) throw new Error('no アラムシロ spawned');
  // go to it first (its model is made once it is in view)
  await page.evaluate((id) => {
    const a = window.__higata;
    const ind = a.creatures.get(id);
    a.player.setPose(ind.pos.x + 0.4, ind.pos.z + 0.4, Math.atan2(0.4, 0.4));
  }, snails[0].id);
  await page.waitForFunction((id) => !!window.__higata.creatures.driverOf(id)?.behaviour, snails[0].id, { timeout: 600000 });
  await waitFrames(page, 4);
  // a crushed clam by the nearest snail: it and the ones about it gather on it (as they do at a bait)
  const set = await page.evaluate((id) => {
    const a = window.__higata;
    const ind = a.creatures.get(id);
    const d = a.creatures.driverOf(id);
    const s = d.behaviour;
    const food = a.world.carrion.add(ind.pos.x + Math.sin(ind.heading) * 0.03, ind.pos.z + Math.cos(ind.heading) * 0.03, 0.5);
    a.world.carrion.update(a.player.position.x, a.player.position.z, 0);
    const ang = a.world.carrion.claim(food, s.id, Math.atan2(s.pos.x - food.x, s.pos.z - food.z));
    if (ang !== null) {
      const r = food.r + s.size * 0.75;
      s.pos.set(food.x + Math.sin(ang) * r, s.pos.y, food.z + Math.cos(ang) * r);
      s.heading = Math.atan2(food.x - s.pos.x, food.z - s.pos.z);
      s.startFeeding(food, ang);
    }
    const c = d.anchor().clone();
    // crouched a stride off, looking down at it
    const dist = 0.55;
    a.player.setPose(c.x + dist * 0.7, c.z + dist * 0.7, Math.atan2(0.7, 0.7));
    a.player.lowView = true;
    a.player.pitch = -0.75;
    return { state: d.debugLabel(), len: ind.length_mm, food: [food.x, food.z].map((v) => +v.toFixed(3)), depth: +(a.world.habitat.depthAt(c.x, c.z)).toFixed(3) };
  }, snails[0].id);
  console.log('nearest', JSON.stringify(set));
  await waitFrames(page, 12);
  await page.screenshot({ path: path.join(outDir, 'aramushiro-ingame-wade.png') });
  await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); }, snails[0].id);
  await waitFrames(page, 16);
  const st = await page.evaluate((id) => window.__higata.creatures.driverOf(id).debugLabel(), snails[0].id);
  console.log('observed', st);
  await page.screenshot({ path: path.join(outDir, 'aramushiro-ingame-observe.png') });
  // closer, as a player zooms in
  await page.evaluate((id) => {
    const a = window.__higata;
    const c = a.creatures.anchorOf(id);
    const cam = a.camera;
    const d = cam.position.clone().sub(c).setLength(0.035);
    cam.position.copy(c).add(d);
    a.observation.controls?.update();
  }, snails[0].id);
  await waitFrames(page, 8);
  await page.screenshot({ path: path.join(outDir, 'aramushiro-ingame-observe-close.png') });
  await page.evaluate(() => window.__higata.exitObserve());
  // the second snail, wherever it is and whatever it is doing
  if (snails[1]) {
    await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); }, snails[1].id);
    await waitFrames(page, 16);
    console.log('second', await page.evaluate((id) => window.__higata.creatures.driverOf(id).debugLabel(), snails[1].id));
    await page.screenshot({ path: path.join(outDir, 'aramushiro-ingame-observe2.png') });
    await page.evaluate(() => window.__higata.exitObserve());
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
