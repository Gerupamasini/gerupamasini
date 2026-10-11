#!/usr/bin/env node
// The gobies' translucent bodies in the game: wades to the water's edge, puts a マハゼ, an エドハゼ and a ヒメハゼ side by side
// on the sand and watches the マハゼ through the observation camera, in front light and against the sun — first with the
// hero material on (the observed fish volumetric, its neighbours in their field material), then off (all three in the
// field material, drawn by the field's own renderer). Headless Chromium (SwiftShader); starts the Vite dev server itself.
// Usage: node tests/smoke/goby-translucency.mjs [--out <dir>] [--map <id>] [--quality low|mid|high]
// Output: tests/smoke/out/goby-<quality>-<hero|field>-<front|back>.png. Fails on any page or shader error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const outDir = path.resolve(arg('--out', path.join(root, 'tests', 'smoke', 'out')));
const map = arg('--map', 'kasai_west');
const quality = arg('--quality', 'high');
fs.mkdirSync(outDir, { recursive: true });
const PORT = Number(arg('--port', '5213'));
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
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { console.error('pageerror:', e.message); code = 1; });
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(t)) { console.error('console:', t.slice(0, 2000)); code = 1; }
    if (m.type() === 'warning' && /hero|shader|program|goby/i.test(t)) { console.warn('warn:', t.slice(0, 2000)); }
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 120000 });
  await page.evaluate((q) => window.__higata.updateSettings({ quality: q, heroMaterials: true }), quality);
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 120000 });
  await page.evaluate((m) => window.__higata.enterField(m), map);
  await page.waitForFunction(() => window.__higata.world && window.__higata.creatures, null, { timeout: 600000 });
  await waitFrames(page, 4);
  // late afternoon (JST, the sun low enough to stand behind a fish), the tide in, at the water's edge; the flat's own
  // animals out of the pictures
  await page.evaluate(() => {
    const a = window.__higata, cs = a.creatures;
    a.clock.cancelTicket?.(); const d = new Date(); a.clock.setDebugTime(Date.UTC(d.getUTCFullYear(), 5, 12, 7, 45)); a.setTideOverride(0.6); a.teleport('waterline');
    cs.setHiddenSpecies(cs.spawner.speciesList.map((s) => s.id)); cs.spawner.hidden = new Set();
    cs.spawner.plan = () => [];
  });
  await waitFrames(page, 6);
  const fish = await page.evaluate(() => {
    const a = window.__higata, cs = a.creatures;
    const h = a.world.habitat, p0 = a.player.position;
    let w = null;
    for (const r of [8, 20, 60, 160]) { w = h.nearestWater(p0.x, p0.z, 0.12, r); if (w && h.depthAt(w.x, w.z) < 0.5) break; }
    if (!w) throw new Error('no water');
    for (let i = 0; i < 40; i++) {
      const dd = h.depthAt(w.x, w.z);
      if (dd >= 0.15 && dd <= 0.3) break;
      const e = 0.3, gx = h.depthAt(w.x + e, w.z) - h.depthAt(w.x - e, w.z), gz = h.depthAt(w.x, w.z + e) - h.depthAt(w.x, w.z - e), gl = Math.hypot(gx, gz) || 1;
      const k = dd < 0.15 ? 0.15 : -0.15;
      w.x += (gx / gl) * k; w.z += (gz / gl) * k;
    }
    // side by side across the sun's direction, all heading the same way (across the light)
    const s = a.world.sunDir, sl = Math.hypot(s.x, s.z) || 1, sx = s.x / sl, sz = s.z / sl;
    const out = [];
    [['acanthogobius_flavimanus', 0], ['gymnogobius_macrognathos', -1], ['favonigobius_gymnauchen', 1]].forEach(([sid, k], i) => {
      const species = cs.spawner.speciesList.find((q) => q.id === sid);
      if (!species) return;
      const x = w.x - sz * k * 0.075 + sx * k * 0.02, z = w.z + sx * k * 0.075 + sz * k * 0.02;
      const ind = cs.spawner.create({ species, ruleIndex: 0, cell: 0, seed: 777 + i * 31, x, z, lengthRange: [55, 56] }, Date.now());
      ind.heading = Math.atan2(-sz, sx);
      cs.spawn(ind);
      out.push({ id: ind.id, sid, len: ind.length_mm, pos: [x, z].map((v) => +v.toFixed(2)), depth: +h.depthAt(x, z).toFixed(3) });
    });
    return { out, sun: [sx, sz, s.y] };
  });
  console.log('gobies', JSON.stringify(fish));
  for (const f of fish.out) await page.evaluate((id) => { window.__higata.creatures.driverOf(id)?.setIntent({ id: 99, kind: 'rest', urgency: 0, seconds: 900 }); }, f.id);
  await waitFrames(page, 20);
  await page.addStyleTag({ content: '#ui { display: none !important; }' });
  const main = fish.out[0].id;
  await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); }, main);
  await waitFrames(page, 20);
  // the orbit camera on the sun's side looking down (front light) or on the far side, low, looking toward the sun
  const view = (against) => page.evaluate(([against, sun]) => {
    const a = window.__higata, o = a.observation, c = o.controls;
    const k = against ? -1 : 1, el = against ? 0.32 : 0.75, d = 0.2;
    a.camera.position.set(c.target.x + sun[0] * k * d * Math.cos(el), c.target.y + d * Math.sin(el), c.target.z + sun[1] * k * d * Math.cos(el));
    c.update();
    return a.creatures.individuals.map((x) => [x.species.id.slice(0, 12), a.creatures.entries.get(x.id)?.view?.tier, !!a.creatures.entries.get(x.id)?.view?.hero]);
  }, [against, fish.sun]);
  const shot = async (name) => { await waitFrames(page, 14); await page.screenshot({ path: path.join(outDir, `goby-${quality}-${name}.png`) }); };
  await waitFrames(page, 10);
  console.log('hero front', JSON.stringify(await view(false)));
  await shot('hero-front');
  console.log('hero back', JSON.stringify(await view(true)));
  await shot('hero-back');
  // the field material on all three (the observed one in its hero-tier mesh)
  await page.evaluate(() => window.__higata.updateSettings({ heroMaterials: false }));
  await waitFrames(page, 30);
  console.log('field front', JSON.stringify(await view(false)));
  await shot('field-front');
  console.log('field back', JSON.stringify(await view(true)));
  await shot('field-back');
  await page.evaluate(() => window.__higata.exitObserve());
  await waitFrames(page, 4);
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
  process.exit(code);
}
