#!/usr/bin/env node
// Build first. The home tank's renderer: every quality tier draws without shader errors; the bed's relief carries the
// animals and the decorations; the water pass covers the tank (and only the tank); the camera may go under water;
// the shrimp's own shader survives the tank's caustic copy. Screenshots in tests/smoke/out/water-*.png.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4189;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const output = new URL('out/', import.meta.url); fs.mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* startup */ }
    if (i === 59) throw new Error('Water preview did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 400)); });
  page.setDefaultTimeout(180000);
  // the decorations' places come from Math.random: the same every run
  await page.addInitScript(() => { let x = 4242; Math.random = () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; });
  await page.goto(url); await page.waitForFunction(() => !!window.__higata);
  await page.locator('button.primary').first().click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  const frames = async (n) => { const f = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction(({ f, n }) => window.__higata.frameCount >= f + n, { f, n }); };
  assert.ok(await page.evaluate(() => !!window.__higata.tankRenderer), 'the tank renderer is up');
  // the screenshots show the tank, not the HUD
  await page.evaluate(() => { document.getElementById('ui').style.visibility = 'hidden'; });

  // a goby, a shrimp (its pattern's defines must survive the tank's material copy) and a hermit crab, with decorations
  await page.evaluate(async () => {
    const a = window.__higata, recs = [];
    const add = (sid, len, n) => { const sp = a.data.species.get(sid); const stage = sp.stages.find((s) => s.maxLength_mm === undefined || len <= s.maxLength_mm).id; recs.push({ id: `water-${n}`, number: n, speciesId: sid, length_mm: len, weight_g: 10, sex: 'f', stage, traits: [], caughtAt: 1000 + n, caughtWhere: [0, 0], tideLevel: 0 }); };
    add('acanthogobius_flavimanus', 110, 1); add('palaemon_pacificus', 40, 2); add('pagurus_minutus', 40, 3);
    a.encyclopedia.tankItems.value = recs; await a.tank.setOccupants(recs, (id) => a.data.species.get(id));
    for (const t of ['stone_l', 'driftwood', 'plant', 'shell']) a.tankAddItem(t);
  });

  for (const q of ['minimal', 'low', 'mid', 'high']) {
    await page.evaluate(async (q) => { const a = window.__higata; await a.updateSettings({ homeQuality: q }); a.tankRenderer.fixedScale = 1; a.tank.resetView(); }, q);
    await frames(3);
    const s = await page.evaluate(() => { const a = window.__higata, r = a.tankRenderer; return { w: r.stats.width, h: r.stats.height, shafts: !!a.tank.passes.shafts, buf: a.renderer.gl.getDrawingBufferSize(a.tank.camera.position.clone()).toArray() }; });
    assert.ok(s.w > 0 && s.h > 0 && Math.abs(s.w - s.buf[0]) <= 1, `${q}: internal size ${JSON.stringify(s)}`);
    assert.equal(s.shafts, q !== 'minimal', `${q}: light shafts`);
    await page.screenshot({ path: new URL(`water-${q}.png`, output).pathname });
  }
  assert.deepEqual(errors, [], 'no shader or page errors on any tier');
  console.log('every tier draws');

  // the bed's relief: within a centimetre of its mean, the same under the animals' feet as in the mesh
  const bed = await page.evaluate(() => {
    const a = window.__higata, t = a.tank, out = [];
    for (let i = 0; i < 40; i++) { const x = (i / 39 - 0.5) * 0.56, z = Math.sin(i * 1.7) * 0.13; out.push(t.substrate.heightAt(x, z)); }
    const items = t.currentLayout.items.map((it) => t.itemsRoot.children.find((o) => o.userData.itemId === it.id)?.position.y - t.substrate.heightAt(it.x, it.z));
    return { min: Math.min(...out), max: Math.max(...out), items };
  });
  assert.ok(bed.min > 0.035 && bed.max < 0.065 && bed.max - bed.min > 0.002, `relief ${JSON.stringify(bed)}`);
  assert.ok(bed.items.every((d) => Math.abs(d + 0.002) < 1e-6), `decorations sit on the relief ${JSON.stringify(bed.items)}`);
  for (const sub of ['mud', 'none', 'sand']) {
    await page.evaluate((s) => window.__higata.tankSetSubstrate(s), sub);
    await frames(2);
    const y = await page.evaluate(() => window.__higata.tank.substrate.heightAt(0, 0));
    assert.ok(sub === 'none' ? y === 0 : y > 0.035 && y < 0.065, `${sub}: bed ${y}`);
  }
  console.log('the bed carries the animals and the decorations');

  await page.evaluate(async () => { await window.__higata.updateSettings({ homeQuality: 'mid' }); window.__higata.tankRenderer.fixedScale = 1; window.__higata.tank.resetView(); });
  await frames(3);
  // under water, looking up at the surface: Snell's window and the mirror round it
  await page.evaluate(() => { const t = window.__higata.tank, o = t.aquariumRoot.position; t.camera.position.set(o.x + 0.02, o.y + 0.12, o.z + 0.05); t.controls.target.set(o.x, o.y + 0.3, o.z - 0.1); t.controls.update(); });
  await frames(3);
  await page.screenshot({ path: new URL('water-under.png', output).pathname });
  assert.deepEqual(errors, [], 'no errors under water');
  console.log('under water');

  // without float targets (or before the pipeline), the plain path still runs: the tank's own render
  await page.evaluate(() => { const a = window.__higata; a.tank.resetView(); a.renderer.gl.render(a.tank.scene, a.tank.camera); });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', bed, checks: ['four tiers', 'relief under feet and decorations', 'substrates', 'under water', 'plain render'] }));
} finally { await browser?.close(); server.kill(); }
