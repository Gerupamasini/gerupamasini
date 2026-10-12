#!/usr/bin/env node
// The animals' physics in the game (src/creatures/physics): on the 走水 shore it puts a heap of ヒメハゼ and イソスジエビ
// down on top of one another in the shallows and checks that they part (no pair still overlapping a few seconds
// later), that a goby lies along the slope of the bed, and that the ハク fry and the アミメハギ go to and fro with the
// swell and the surf; photographs the heap before and after. Headless Chromium (SwiftShader); starts the Vite dev
// server itself.
// Usage: node tests/smoke/physics.mjs [--out <dir>]. Output: tests/smoke/out/physics-*.png. Fails on a page error or a
// failed check.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(root, 'tests', 'smoke', 'out'));
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5213;
const url = `http://localhost:${PORT}/gerupamasini/`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFrames(page, n, timeoutMs = 900000) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((target) => (window.__higata?.frameCount ?? 0) >= target, start + n, { timeout: timeoutMs });
}
let code = 0;
const fail = (msg) => { console.error('FAIL:', msg); code = 1; };
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
  await page.evaluate(() => window.__higata.enterField('hashirimizu'));
  await page.waitForFunction(() => window.__higata.world && window.__higata.creatures, null, { timeout: 300000 });
  await waitFrames(page, 4);
  // late morning (JST), the tide half in, at the water's edge; only the animals put down here
  await page.evaluate(() => {
    const a = window.__higata; a.clock.cancelTicket?.(); const d = new Date();
    a.clock.setDebugTime(Date.UTC(d.getUTCFullYear(), 5, 12, 1, 30)); a.setTideOverride(0.2); a.teleport('waterline');
    const cs = a.creatures;
    cs.setHiddenSpecies(cs.spawner.speciesList.map((s) => s.id));
  });
  await waitFrames(page, 6);
  const heap = await page.evaluate(() => {
    const a = window.__higata, cs = a.creatures, h = a.world.habitat, p0 = a.player.position;
    cs.setHiddenSpecies([]);
    // keep the spawner out of it: the animals are the ones put here
    cs.spawner.hidden = new Set(cs.spawner.speciesList.map((s) => s.id));
    let w = null;
    for (const r of [8, 20, 60]) { w = h.nearestWater(p0.x, p0.z, 0.12, r); if (w && h.depthAt(w.x, w.z) < 0.4) break; }
    if (!w) throw new Error('no water');
    for (let i = 0; i < 40; i++) {
      const dd = h.depthAt(w.x, w.z);
      if (dd >= 0.2 && dd <= 0.3) break;
      const e = 0.3, gx = h.depthAt(w.x + e, w.z) - h.depthAt(w.x - e, w.z), gz = h.depthAt(w.x, w.z + e) - h.depthAt(w.x, w.z - e), gl = Math.hypot(gx, gz) || 1;
      const k = dd < 0.2 ? 0.15 : -0.15;
      w.x += (gx / gl) * k; w.z += (gz / gl) * k;
    }
    const gx = h.depthAt(w.x + 0.5, w.z) - h.depthAt(w.x - 0.5, w.z), gz = h.depthAt(w.x, w.z + 0.5) - h.depthAt(w.x, w.z - 0.5), gl = Math.hypot(gx, gz) || 1;
    const px = w.x - (gx / gl) * 0.7, pz = w.z - (gz / gl) * 0.7;
    a.player.setPose(px, pz, Math.atan2(-(w.x - px), -(w.z - pz)));
    a.player.lowView = true;
    a.player.pitch = -0.75;
    const sp = (id) => cs.spawner.speciesList.find((s) => s.id === id);
    const ids = { heap: [], fry: [], filefish: [] };
    // six gobies and three shrimp dropped within a couple of centimetres of one spot
    for (let i = 0; i < 9; i++) {
      const goby = i < 6;
      const ind = cs.spawner.create({ species: sp(goby ? 'favonigobius_gymnauchen' : 'palaemon_pacificus'), ruleIndex: 0, cell: 0, seed: 777 + i * 31, x: w.x + Math.sin(i * 2.4) * 0.012, z: w.z + Math.cos(i * 2.4) * 0.012, lengthRange: goby ? [55, 65] : [38, 45] }, Date.now());
      cs.spawn(ind);
      ids.heap.push(ind.id);
    }
    // a school of fry and two filefish a little further out
    const out = { x: w.x + (gx / gl) * 1.2, z: w.z + (gz / gl) * 1.2 };
    for (let i = 0; i < 6; i++) {
      const ind = cs.spawner.create({ species: sp('mugil_cephalus'), ruleIndex: 0, cell: 99, seed: 991 + i * 7, x: out.x + (i % 3) * 0.06, z: out.z + Math.floor(i / 3) * 0.06, lengthRange: [26, 30] }, Date.now());
      cs.spawn(ind); ids.fry.push(ind.id);
    }
    for (let i = 0; i < 2; i++) {
      const ind = cs.spawner.create({ species: sp('rudarius_ercodes'), ruleIndex: 0, cell: 98, seed: 313 + i * 5, x: out.x - 0.3 + i * 0.15, z: out.z, lengthRange: [32, 36] }, Date.now());
      cs.spawn(ind); ids.filefish.push(ind.id);
    }
    return { ids, at: [w.x, w.z], depth: h.depthAt(w.x, w.z) };
  });
  console.log('put down', JSON.stringify({ at: heap.at.map((v) => +v.toFixed(2)), depth: +heap.depth.toFixed(3), n: heap.ids.heap.length }));
  // the bodies of the heap: overlapping pairs (capsules from the drivers' bodies and the species' builds)
  const overlaps = () => page.evaluate((ids) => {
    const cs = window.__higata.creatures;
    const bodies = ids.map((id) => cs.entries.get(id)?.body).filter((b) => b && b.mode !== 'away');
    let n = 0, worst = 0;
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      if (A.y >= B.y + B.shape.height || B.y >= A.y + A.shape.height) continue;
      // closest points of the two core segments (sampled)
      let best = Infinity;
      for (let s = 0; s <= 8; s++) for (let t = 0; t <= 8; t++) {
        const ua = (s / 8 - 0.5) * 2 * A.shape.half + A.shape.ahead, ub = (t / 8 - 0.5) * 2 * B.shape.half + B.shape.ahead;
        const d = Math.hypot(A.x + Math.sin(A.heading) * ua - B.x - Math.sin(B.heading) * ub, A.z + Math.cos(A.heading) * ua - B.z - Math.cos(B.heading) * ub);
        best = Math.min(best, d);
      }
      const pen = A.shape.radius + B.shape.radius - best;
      if (pen > 0.0015) { n++; worst = Math.max(worst, pen); }
    }
    return { n, worst: +(worst * 1000).toFixed(1), bodies: bodies.length };
  }, heap.ids.heap);
  await waitFrames(page, 2);
  const before = await overlaps();
  console.log('overlapping at first', JSON.stringify(before));
  await page.screenshot({ path: path.join(outDir, 'physics-heap-before.png') });
  // the fry and the filefish: how far the water takes them to and fro
  const sway = () => page.evaluate((ids) => {
    const cs = window.__higata.creatures;
    return ids.map((id) => { const d = cs.driverOf(id)?.rider?.drift; return d ? [d.x, d.y, d.z] : null; });
  }, [...heap.ids.fry, ...heap.ids.filefish]);
  const track = [];
  for (let k = 0; k < 12; k++) { await waitFrames(page, 8); track.push(await sway()); }
  const after = await overlaps();
  console.log('overlapping after', JSON.stringify(after));
  await page.screenshot({ path: path.join(outDir, 'physics-heap-after.png') });
  if (before.n === 0) fail('the heap was not overlapping to begin with');
  if (after.n > 0) fail(`still ${after.n} overlapping pairs (worst ${after.worst} mm)`);
  // each fry moved to and fro by at least a few millimetres over the run
  const ranges = track[0].map((_, i) => {
    const xs = track.map((t) => t[i]).filter(Boolean);
    if (!xs.length) return 0;
    const lo = [0, 1, 2].map((c) => Math.min(...xs.map((v) => v[c]))), hi = [0, 1, 2].map((c) => Math.max(...xs.map((v) => v[c])));
    return Math.hypot(hi[0] - lo[0], hi[2] - lo[2]);
  });
  console.log('to and fro (mm)', JSON.stringify(ranges.map((r) => +(r * 1000).toFixed(1))));
  if (ranges.filter((r) => r > 0.003).length < ranges.length / 2) fail('the fry hardly move with the water');
  // a goby lies along the bed: its up vector against the bed's normal under it
  const lie = await page.evaluate((ids) => {
    const a = window.__higata, cs = a.creatures, t = a.world.terrain;
    return ids.slice(0, 6).map((id) => {
      const e = cs.entries.get(id);
      if (!e?.view) return null;
      const r = e.view.root, up = r.up.clone().set(0, 1, 0).applyQuaternion(r.quaternion), n = t.normalAt(r.position.x, r.position.z);
      // (its own posture — the head propped up — is a few degrees; the slope's is what is compared)
      return { slope: +(Math.acos(Math.min(1, n.y)) * 57.3).toFixed(1), off: +(Math.acos(Math.min(1, up.dot(n))) * 57.3).toFixed(1) };
    });
  }, heap.ids.heap);
  console.log('gobies on the bed (deg)', JSON.stringify(lie));
  if (lie.some((l) => l && l.off > Math.max(8, l.slope))) fail('a goby does not lie with the bed');
  // the fry up close
  await page.evaluate((id) => {
    const a = window.__higata, d = a.creatures.driverOf(id), c = d.anchor().clone(), p = a.player.position;
    const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
    a.player.setPose(c.x + (dx / l) * 0.6, c.z + (dz / l) * 0.6, Math.atan2(dx, dz));
    a.player.pitch = -0.5;
  }, heap.ids.fry[0]);
  await waitFrames(page, 10);
  await page.screenshot({ path: path.join(outDir, 'physics-fry.png') });
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
