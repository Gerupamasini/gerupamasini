#!/usr/bin/env node
// The ヤマトオサガニ in the game: enters the 葛西 flat at low tide, finds the exposed mud by the water's edge, puts
// three crabs (a mature male, a female, a young one) on it in front of the player and photographs them standing by
// their burrows, foraging, walking, down a burrow, peeking out eyestalks first, rearing up at the player and running
// home, and in the observation view, in headless Chromium (SwiftShader). Starts the Vite dev server itself.
// Usage: node tests/smoke/osagani.mjs [--out <dir>] [--quality low|mid|high]. Output: tests/smoke/out/osagani-*.png.
// Fails on any page error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const outDir = path.resolve(arg('--out', path.join(root, 'tests', 'smoke', 'out')));
const quality = arg('--quality', 'low');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5227;
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
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) { console.error('console:', m.text().slice(0, 600)); code = 1; } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 120000 });
  await page.evaluate((q) => window.__higata.updateSettings({ quality: q }), quality);
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 120000 });
  await page.evaluate(() => window.__higata.enterField('kasai_west'));
  await page.waitForFunction(() => window.__higata.world && window.__higata.creatures, null, { timeout: 300000 });
  await waitFrames(page, 4);
  // a summer morning (JST) at low tide, at the water's edge
  await page.evaluate(() => { const a = window.__higata; a.clock.cancelTicket?.(); const d = new Date(); a.clock.setDebugTime(Date.UTC(d.getUTCFullYear(), 6, 8, 0, 30)); a.setTideOverride(0.15); a.teleport('waterline'); });
  await waitFrames(page, 6);
  const crabs = await page.evaluate(() => {
    const a = window.__higata, cs = a.creatures, h = a.world.habitat;
    const species = cs.spawner.speciesList.find((s) => s.id === 'macrophthalmus_japonicus');
    if (!species) throw new Error('no species');
    // exposed mud a little up from the water, the player standing on it 0.9 m back
    const p0 = a.player.position;
    let spot = null;
    for (let r = 1; r < 60 && !spot; r += 0.5) {
      for (let k = 0; k < 24 && !spot; k++) {
        const x = p0.x + Math.cos(k * 0.26) * r, z = p0.z + Math.sin(k * 0.26) * r;
        const s = h.sample(x, z, Date.now());
        if (s.exposed && (s.substrate === 'mud' || s.substrate === 'muddy_sand') && s.depth > -0.25) spot = { x, z };
      }
    }
    if (!spot) throw new Error('no exposed mud');
    const px = spot.x - 0.9, pz = spot.z;
    a.player.setPose(px, pz, Math.atan2(-(spot.x - px), -(spot.z - pz)));
    const out = [];
    [[0, 0, 36, 'm'], [0.2, 0.25, 30, 'f'], [-0.25, 0.3, 17, 'm']].forEach(([dz, dx, cw, sex], i) => {
      const x = spot.x + dx, z = spot.z + dz;
      const ind = cs.spawner.create({ species, ruleIndex: 0, cell: 0, seed: 7171 + i * 13, x, z, lengthRange: [cw, cw + 1] }, Date.now());
      ind.sex = sex;
      cs.spawn(ind);
      out.push({ id: ind.id, len: ind.length_mm, sex, pos: [x, z].map((v) => +v.toFixed(2)), sub: h.sample(x, z, Date.now()).substrate });
    });
    return out;
  });
  console.log('crabs', JSON.stringify(crabs));
  await waitFrames(page, 10);
  const label = (id) => page.evaluate((id) => window.__higata.creatures.driverOf(id)?.debugLabel(), id);
  const shot = async (name) => { await waitFrames(page, 8); await page.screenshot({ path: path.join(outDir, `osagani-${name}.png`) }); };
  const hold = (id) => page.evaluate((id) => { const a = window.__higata, br = a.creatures.get(id).brain; br.done = false; br.busyUntil = 1e12; a.creatures.get(id).wariness = 0.01; }, id);
  const beh = (id, fn, ...a) => page.evaluate(([id, fn, a]) => { const d = window.__higata.creatures.driverOf(id), b = d.behaviour; if (fn === 'walk') { const p = b.pos; b.walk({ x: p.x + a[0], z: p.z + a[1] }); } else if (fn === 'defend' || fn === 'escape') b[fn](window.__higata.player.position.clone(), ...a); else b[fn](...a); }, [id, fn, a]);
  const look = async (id, dist, h, pitch) => page.evaluate(([id, dist, h, pitch]) => {
    const a = window.__higata, d = a.creatures.driverOf(id);
    const c = d.anchor().clone();
    const p = a.player.position;
    const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
    const px = c.x + (dx / l) * dist, pz = c.z + (dz / l) * dist;
    a.player.setPose(px, pz, Math.atan2(-(c.x - px), -(c.z - pz)));
    a.player.lowView = h < 0.8;
    a.player.pitch = pitch;
  }, [id, dist, h, pitch]);
  const observe = async (id, name, zoomSteps = 1) => {
    await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); }, id);
    await waitFrames(page, 8);
    await page.evaluate((n) => { const o = window.__higata.observation; for (let i = 0; i < n; i++) o.nudge(-1); o.zoom = true; }, zoomSteps);
    console.log(name, await label(id));
    await shot(name);
    await page.evaluate(() => window.__higata.exitObserve());
  };
  const [A, B, C] = crabs.map((o) => o.id);
  for (const id of [A, B, C]) await hold(id);
  // out of their burrows first, whatever they were born doing
  for (const id of [A, B, C]) await beh(id, 'exitBurrow', 0.3);
  await waitFrames(page, 60);
  await beh(A, 'idle', 60); await beh(B, 'forage', 60); await beh(C, 'walk', 0.12, 0.05);
  await waitFrames(page, 20);
  await look(A, 0.8, 0.5, -0.5);
  console.log('overview', await label(A), await label(B), await label(C));
  await shot('ingame-overview');
  await observe(A, 'ingame-idle');
  await observe(B, 'ingame-forage');
  await observe(C, 'ingame-walk');
  await beh(A, 'defend', 20);
  await waitFrames(page, 14);
  await observe(A, 'ingame-defend');
  await beh(B, 'enterBurrow', 60);
  await waitFrames(page, 50);
  console.log('burrow', await label(B), await page.evaluate((id) => window.__higata.creatures.driverOf(id).hidden, B));
  await beh(B, 'exitBurrow', 30);
  await waitFrames(page, 30);
  await observe(B, 'ingame-peek', 1);
  await beh(C, 'escape');
  await waitFrames(page, 50);
  console.log('escape', await label(C), await page.evaluate((id) => window.__higata.creatures.driverOf(id).hidden, C));
  await look(A, 0.8, 0.5, -0.5);
  await shot('ingame-after');
  const all = await page.evaluate(() => window.__higata.creatures.individuals.filter((x) => x.species.id === 'macrophthalmus_japonicus').map((x) => window.__higata.creatures.driverOf(x.id)?.debugLabel()));
  console.log('end', JSON.stringify(all));
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
