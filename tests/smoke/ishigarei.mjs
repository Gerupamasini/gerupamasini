#!/usr/bin/env node
// The イシガレイ in the game: enters the 葛西 flat, wades in at the water's edge, puts a few juvenile flounders on the
// sand in front of the player and photographs them (crouched, resting and buried, and in the observation view) in
// headless Chromium (SwiftShader). Starts the Vite dev server itself. Usage: node tests/smoke/ishigarei.mjs [--out <dir>]
// Output: tests/smoke/out/ishigarei-*.png (or <dir>). Fails on any page error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
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

/**
 * Mean colour on the back of a buried fish against the ground in a ring round it, in a screenshot: the relative
 * difference per channel (worst) and both means (sRGB 0..255).
 */
async function coverMatch(page, id, file) {
  const pts = await page.evaluate((id) => {
    const a = window.__higata, d = a.creatures.driverOf(id), st = d.behaviour.state, K = d.root.scale.x, cam = a.camera;
    const W = innerWidth, H = innerHeight, v = cam.position.clone();
    const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
    const at = (x, z, y) => { v.set(x, y ?? a.world.terrain.heightAt(x, z), z).project(cam); return [Math.round((v.x + 1) / 2 * W), Math.round((1 - v.y) / 2 * H)]; };
    const back = [];
    for (const s of [0.01, 0.018, 0.026]) for (const l of [-0.005, 0, 0.005]) back.push(at(st.pos.x - fx * s * K + fz * l * K, st.pos.z - fz * s * K - fx * l * K, st.pos.y + 0.002 * K));
    const ring = [];
    // just outside the fins: an ellipse round the body (half length 46 mm, half width 30 mm on the 70 mm fish)
    for (let i = 0; i < 16; i++) { const th = (i / 16) * Math.PI * 2, a = Math.cos(th) * 0.046 * K, l = Math.sin(th) * 0.03 * K; ring.push(at(st.pos.x - fx * 0.016 * K + fx * a + fz * l, st.pos.z - fz * 0.016 * K + fz * a - fx * l)); }
    return { back, ring };
  }, id);
  const buf = await page.screenshot({ path: file });
  const png = PNG.sync.read(buf);
  const mean = (list) => {
    const m = [0, 0, 0]; let n = 0;
    for (const [x, y] of list) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= png.width || Y >= png.height) continue;
      const k = (Y * png.width + X) * 4; m[0] += png.data[k]; m[1] += png.data[k + 1]; m[2] += png.data[k + 2]; n++;
    }
    return m.map((c) => c / Math.max(1, n));
  };
  const cover = mean(pts.back), ground = mean(pts.ring);
  const diff = cover.map((c, i) => (c - ground[i]) / Math.max(1, ground[i]));
  return { worst: Math.max(...diff.map(Math.abs)), diff: diff.map((x) => +x.toFixed(3)), cover: cover.map(Math.round), ground: ground.map(Math.round) };
}
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
  await page.evaluate((id) => { const a = window.__higata, i = a.creatures.get(id); i.brain.busyUntil = Infinity; i.brain.done = false; a.creatures.driverOf(id).setIntent({ id: 99, kind: 'burrow', urgency: 0.5, seconds: 60 }); }, fish.out[0].id);
  await waitFrames(page, 40);
  console.log('burrow', await page.evaluate((id) => window.__higata.creatures.driverOf(id).debugLabel(), fish.out[0].id));
  await page.screenshot({ path: path.join(outDir, 'ishigarei-ingame-buried.png') });
  // the sand thrown over it takes the colour of the ground round it
  // (the player stands back, out of their flight distance; whichever lies buried, the first told again to dig in)
  await look(fish.out[0].id, 1.6, 1.5, -0.6);
  const ids = fish.out.map((f) => f.id);
  let buried = null;
  for (let round = 0; round < 60 && !buried; round++) {
    const st = await page.evaluate((ids) => {
      const cs = window.__higata.creatures;
      // (told through the driver, the brain is kept busy meanwhile, or its next idle choice would cut the digging short)
      const d0 = cs.driverOf(ids[0]), i0 = cs.get(ids[0]);
      if (d0 && i0 && d0.behaviour.state.mode !== 'BURROW_IN_SAND') {
        i0.brain.busyUntil = Infinity; i0.brain.done = false;
        d0.setIntent({ id: 98, kind: 'burrow', urgency: 0.5, seconds: 120 });
      }
      return ids.map((id) => { const b = cs.driverOf(id)?.behaviour; return b ? [id, b.state.mode, b.state.phase, +b.state.bury.toFixed(2)] : [id, 'gone']; });
    }, ids);
    buried = st.find((x) => x[2] === 'buried' && x[3] > 0.8)?.[0] ?? null;
    if (!buried) { if (round % 5 === 0) console.log('waiting for a buried one', JSON.stringify(st)); await waitFrames(page, 3); }
  }
  if (!buried) throw new Error('no flounder buried itself');
  // the observation's own camera, close
  await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); const o = a.observation; for (let i = 0; i < 8; i++) o.nudge(-1); o.zoom = true; }, buried);
  await waitFrames(page, 10);
  const match = await coverMatch(page, buried, path.join(outDir, 'ishigarei-ingame-cover.png'));
  console.log('cover', JSON.stringify(match));
  if (match.worst > 0.1) { console.error(`the sand over the fish does not match the ground (${JSON.stringify(match)})`); code = 1; }
  await page.evaluate(() => window.__higata.exitObserve());
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
