#!/usr/bin/env node
// The ガザミ in the game: enters the 走水 shore, wades in at the water's edge, puts three crabs (a juvenile, a young
// one and an adult) on the sand in front of the player and photographs them resting, foraging, dug in, rearing up at
// the player, running and swimming off, and in the observation view, in headless Chromium (SwiftShader). Starts the
// Vite dev server itself.
// Usage: node tests/smoke/gazami.mjs [--out <dir>] [--map <id>]. Output: tests/smoke/out/gazami-*.png. Fails on any page error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(root, 'tests', 'smoke', 'out'));
const map = args.includes('--map') ? args[args.indexOf('--map') + 1] : 'hashirimizu';
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5223;
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
  await page.evaluate(() => { const a = window.__higata; a.clock.cancelTicket?.(); const d = new Date(); a.clock.setDebugTime(Date.UTC(d.getUTCFullYear(), 5, 12, 1, 30)); a.setTideOverride(0.55); a.teleport('waterline'); });
  await waitFrames(page, 6);
  // three juveniles on the sand a little way out in front of the player: one resting, one buried, one further
  const fish = await page.evaluate(() => {
    const a = window.__higata, cs = a.creatures;
    const species = cs.spawner.speciesList.find((s) => s.id === 'portunus_trituberculatus');
    // a spot under 12–20 cm of water on the open sand, the player standing 0.8 m back from it on the shore side
    const h = a.world.habitat, p0 = a.player.position;
    let w = null;
    for (const r of [8, 20, 60, 160]) { w = h.nearestWater(p0.x, p0.z, 0.2, r); if (w && h.depthAt(w.x, w.z) < 0.6) break; }
    if (!w) throw new Error('no water');
    // step along the depth gradient to 12–20 cm
    for (let i = 0; i < 40; i++) {
      const dd = h.depthAt(w.x, w.z);
      if (dd >= 0.28 && dd <= 0.45) break;
      const e = 0.3, gx = h.depthAt(w.x + e, w.z) - h.depthAt(w.x - e, w.z), gz = h.depthAt(w.x, w.z + e) - h.depthAt(w.x, w.z - e), gl = Math.hypot(gx, gz) || 1;
      const k = dd < 0.28 ? 0.15 : -0.15;
      w.x += (gx / gl) * k; w.z += (gz / gl) * k;
    }
    const gx = h.depthAt(w.x + 0.5, w.z) - h.depthAt(w.x - 0.5, w.z), gz = h.depthAt(w.x, w.z + 0.5) - h.depthAt(w.x, w.z - 0.5), gl = Math.hypot(gx, gz) || 1;
    const px = w.x - (gx / gl) * 0.8, pz = w.z - (gz / gl) * 0.8;
    a.player.setPose(px, pz, Math.atan2(-(w.x - px), -(w.z - pz)));
    const fx = (w.x - px) / 0.8, fz = (w.z - pz) / 0.8;
    const d = 0.8;
    const p = { x: px, z: pz };
    const out = [];
    [[0, 0, 95], [0.3, 0.15, 45], [-0.35, 0.4, 140]].forEach(([s, f, cw], i) => {
      const x = p.x + fx * (d + f) + fz * s, z = p.z + fz * (d + f) - fx * s;
      const ind = cs.spawner.create({ species, ruleIndex: 0, cell: 0, seed: 5151 + i * 17, x, z, lengthRange: [cw, cw + 2] }, Date.now());
      cs.spawn(ind);
      out.push({ id: ind.id, len: ind.length_mm, pos: [x, z].map((v) => +v.toFixed(2)), depth: +a.world.habitat.depthAt(x, z).toFixed(3) });
    });
    return { out, d };
  });
  console.log('crabs', JSON.stringify(fish));
  await waitFrames(page, 10);
  console.log('alive', JSON.stringify(await page.evaluate(() => window.__higata.creatures.individuals.filter((x) => x.species.id === 'portunus_trituberculatus').map((x) => [x.id, x.length_mm, x.pos.toArray().map((v) => +v.toFixed(2)), window.__higata.creatures.driverOf(x.id)?.debugLabel()]))));
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
  const shot = async (name) => { await waitFrames(page, 10); await page.screenshot({ path: path.join(outDir, `gazami-${name}.png`) }); };
  const intent = (id, kind, seconds, extra = {}) => page.evaluate(([id, kind, seconds, extra]) => {
    const a = window.__higata, d = a.creatures.driverOf(id);
    const it = { id: 99, kind, urgency: 0.5, seconds, ...extra };
    if (extra.ahead) { const c = d.anchor(); it.target = c.clone(); it.target.x += extra.ahead[0]; it.target.z += extra.ahead[1]; }
    // (the brain keeps to it until the driver is done, as if it had chosen it itself)
    const br = a.creatures.get(id).brain; br.done = false; br.busyUntil = 1e12;
    d.setIntent(it);
  }, [id, kind, seconds, extra]);
  const label = (id) => page.evaluate((id) => window.__higata.creatures.driverOf(id).debugLabel(), id);
  const [A, B, C] = fish.out.map((o) => o.id);
  const observe = async (id, name, zoomSteps = 6) => {
    await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); }, id);
    await waitFrames(page, 8);
    await page.evaluate((n) => { const o = window.__higata.observation; for (let i = 0; i < n; i++) o.nudge(-1); o.zoom = true; }, zoomSteps);
    console.log(name, await label(id));
    await shot(name);
    await page.evaluate(() => window.__higata.exitObserve());
  };
  // the smoke test drives these three
  await page.evaluate((ids) => { for (const id of ids) { const x = window.__higata.creatures.get(id); x.wariness = 0.01; } }, [A, B, C]);
  await intent(A, 'rest', 60); await intent(B, 'forage', 60); await intent(C, 'burrow', 90);
  await waitFrames(page, 30);
  console.log('overview', await look(A, 0.7, 0.5, -0.55));
  await shot('ingame-overview');
  await observe(A, 'ingame-rest');
  await observe(B, 'ingame-forage');
  await observe(C, 'ingame-buried', 4);
  await intent(A, 'display', 20);
  await waitFrames(page, 12);
  await observe(A, 'ingame-defend');
  await page.evaluate((id) => { const a = window.__higata, br = a.creatures.get(id).brain; br.done = false; br.busyUntil = 1e12; const b = a.creatures.driverOf(id).behaviour; const p = b.pos; b.swim({ x: p.x - 2.5, z: p.z + 0.6 }); }, C);
  await waitFrames(page, 6);
  await observe(C, 'ingame-swim', 3);
  const events = await page.evaluate(() => window.__higata.creatures.individuals.filter((x) => x.species.id === 'portunus_trituberculatus').map((x) => window.__higata.creatures.driverOf(x.id)?.debugLabel()));
  console.log('end', JSON.stringify(events));
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
