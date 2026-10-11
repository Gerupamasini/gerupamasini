#!/usr/bin/env node
// The イシガレイ in the game: enters the 葛西 flat, wades in at the water's edge, puts a few juvenile flounders on the
// sand in front of the player and photographs them (crouched, resting and buried, and in the observation view) in
// headless Chromium (SwiftShader). Starts the Vite dev server itself. Usage: node tests/smoke/ishigarei.mjs [--out <dir>]
// Output: tests/smoke/out/ishigarei-*.png (or <dir>). Fails on any page error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(root, 'tests', 'smoke', 'out'));
const map = args.includes('--map') ? args[args.indexOf('--map') + 1] : 'kasai_west';
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5204;
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
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) console.error('console:', m.text().slice(0, 600)); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 120000 });
  await page.evaluate(() => window.__higata.updateSettings({ quality: 'low' }));
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 120000 });
  await page.evaluate((m) => window.__higata.enterField(m), map);
  await page.waitForFunction(() => window.__higata.world && window.__higata.creatures, null, { timeout: 300000 });
  await waitFrames(page, 4);
  // late morning (JST), the tide half in, at the water's edge
  await page.evaluate(() => { const a = window.__higata; a.clock.cancelTicket?.(); const d = new Date(); a.clock.setDebugTime(Date.UTC(d.getUTCFullYear(), 5, 12, 1, 30)); a.setTideOverride(0.2); a.teleport('waterline'); });
  await waitFrames(page, 6);
  // three juveniles on the sand a little way out in front of the player: one resting, one buried, one further
  const fish = await page.evaluate(() => {
    const a = window.__higata, cs = a.creatures;
    const species = cs.spawner.speciesList.find((s) => s.id === 'platichthys_bicoloratus');
    // a spot under 12–20 cm of water on the open sand, the player standing 0.8 m back from it on the shore side
    const h = a.world.habitat, p0 = a.player.position;
    let w = null;
    for (const r of [8, 20, 60, 160]) { w = h.nearestWater(p0.x, p0.z, 0.12, r); if (w && h.depthAt(w.x, w.z) < 0.3) break; }
    if (!w) throw new Error('no water');
    // step along the depth gradient to 12–20 cm
    for (let i = 0; i < 40; i++) {
      const dd = h.depthAt(w.x, w.z);
      if (dd >= 0.12 && dd <= 0.2) break;
      const e = 0.3, gx = h.depthAt(w.x + e, w.z) - h.depthAt(w.x - e, w.z), gz = h.depthAt(w.x, w.z + e) - h.depthAt(w.x, w.z - e), gl = Math.hypot(gx, gz) || 1;
      const k = dd < 0.12 ? 0.15 : -0.15;
      w.x += (gx / gl) * k; w.z += (gz / gl) * k;
    }
    const gx = h.depthAt(w.x + 0.5, w.z) - h.depthAt(w.x - 0.5, w.z), gz = h.depthAt(w.x, w.z + 0.5) - h.depthAt(w.x, w.z - 0.5), gl = Math.hypot(gx, gz) || 1;
    const px = w.x - (gx / gl) * 0.8, pz = w.z - (gz / gl) * 0.8;
    a.player.setPose(px, pz, Math.atan2(-(w.x - px), -(w.z - pz)));
    const fx = (w.x - px) / 0.8, fz = (w.z - pz) / 0.8;
    const d = 0.8;
    const p = { x: px, z: pz };
    const out = [];
    [[0, 0], [0.25, 0.12], [-0.3, 0.35]].forEach(([s, f], i) => {
      const x = p.x + fx * (d + f) + fz * s, z = p.z + fz * (d + f) - fx * s;
      const ind = cs.spawner.create({ species, ruleIndex: 0, cell: 0, seed: 4242 + i * 17, x, z, lengthRange: [64 + i * 6, 70 + i * 6] }, Date.now());
      cs.spawn(ind);
      out.push({ id: ind.id, len: ind.length_mm, pos: [x, z].map((v) => +v.toFixed(2)), depth: +a.world.habitat.depthAt(x, z).toFixed(3) });
    });
    return { out, d };
  });
  console.log('flounders', JSON.stringify(fish));
  await waitFrames(page, 10);
  console.log('alive', JSON.stringify(await page.evaluate(() => window.__higata.creatures.individuals.filter((x) => x.species.id === 'platichthys_bicoloratus').map((x) => [x.id, x.pos.toArray().map((v) => +v.toFixed(2)), window.__higata.creatures.driverOf(x.id)?.debugLabel()]))));
  const look = async (id, dist, h, pitch) => page.evaluate(([id, dist, h, pitch]) => {
    const a = window.__higata, d = a.creatures.driverOf(id);
    const c = d.anchor().clone();
    const p = a.player.position;
    const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
    const px = c.x + (dx / l) * dist, pz = c.z + (dz / l) * dist;
    a.player.setPose(px, pz, Math.atan2(-(c.x - px), -(c.z - pz)));
    a.player.lowView = h < 0.8;
    a.player.pitch = pitch;
    return d.debugLabel();
  }, [id, dist, h, pitch]);
  console.log('rest', await look(fish.out[0].id, 0.55, 0.5, -0.75));
  await waitFrames(page, 8);
  await page.screenshot({ path: path.join(outDir, 'ishigarei-ingame-crouch.png') });
  await page.evaluate((id) => { const a = window.__higata; a.creatures.driverOf(id).setIntent({ id: 99, kind: 'burrow', urgency: 0.5, seconds: 60 }); }, fish.out[0].id);
  await waitFrames(page, 40);
  console.log('burrow', await page.evaluate((id) => window.__higata.creatures.driverOf(id).debugLabel(), fish.out[0].id));
  await page.screenshot({ path: path.join(outDir, 'ishigarei-ingame-buried.png') });
  await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); }, fish.out[1].id);
  await waitFrames(page, 14);
  console.log('observed', await page.evaluate((id) => window.__higata.creatures.driverOf(id).debugLabel(), fish.out[1].id));
  await page.screenshot({ path: path.join(outDir, 'ishigarei-ingame-observe.png') });
  // close in on it (the observation's own steps), then a little closer still with the zoom
  await page.evaluate(() => { const o = window.__higata.observation; for (let i = 0; i < 8; i++) o.nudge(-1); o.zoom = true; });
  await waitFrames(page, 14);
  await page.screenshot({ path: path.join(outDir, 'ishigarei-ingame-observe-close.png') });
  await page.evaluate(() => window.__higata.exitObserve());
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
