#!/usr/bin/env node
// Build first. Verify real goby rigs and rendered bounds in the raised aquarium.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4179;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const output = new URL('out/', import.meta.url); fs.mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* startup */ }
    if (i === 59) throw new Error('Aquarium preview did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.setDefaultTimeout(60000);
  await page.goto(url); await page.waitForFunction(() => !!window.__higata);
  await page.locator('button.primary').first().click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(async () => { const a = window.__higata; await a.updateSettings({ heroMaterials: true }); a.openTankEdit(); });
  const samples = [];
  for (const length of [50, 100, 180]) {
    const sample = await page.evaluate(async (length) => {
      const a = window.__higata, species = a.data.species.get('acanthogobius_flavimanus');
      const stage = species.stages.find((s) => s.maxLength_mm === undefined || length <= s.maxLength_mm).id;
      const record = { id: `goby-smoke-${length}`, number: 1, speciesId: species.id, length_mm: length, weight_g: 10, sex: 'f', stage, traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 };
      a.encyclopedia.tankItems.value = [record]; await a.tank.setOccupants([record], (id) => a.data.species.get(id));
      const o = a.tank.occupants[0], tmp = o.ind.pos.clone(), floorY = 0.05;
      o.driver.setIntent({ id: 1, kind: 'rest', urgency: 0, seconds: 60 });
      for (let i = 0; i < 120; i++) o.driver.update(1 / 60, { floor: { heightAt: () => floorY, waterAt: () => 0.3 }, player: tmp.clone().set(0, 1, 2), simScale: 1, nowMs: Date.now() });
      // Match the renderer's traversal, including SkinnedMesh's attached bind-matrix update.
      a.tank.scene.updateMatrixWorld(true);
      let minY = Infinity, maxY = -Infinity;
      o.root.traverse((m) => {
        if (!m.isMesh) return;
        for (let i = 0; i < m.geometry.attributes.position.count; i++) {
          m.getVertexPosition(i, tmp).applyMatrix4(m.matrixWorld);
          minY = Math.min(minY, tmp.y); maxY = Math.max(maxY, tmp.y);
        }
      });
      return { length, stage, hero: !!o.hero, localY: o.root.position.y, worldY: o.root.getWorldPosition(tmp).y, minY, maxY };
    }, length);
    assert.ok(sample.localY >= 0.05 && sample.localY < 0.1, JSON.stringify(sample));
    assert.ok(Math.abs(sample.worldY - sample.localY - 0.73) < 1e-8, JSON.stringify(sample));
    assert.ok(sample.minY >= 0.77 && sample.minY <= 0.80, JSON.stringify(sample));
    assert.ok(sample.maxY < 1.03, JSON.stringify(sample));
    assert.equal(sample.hero, true); samples.push(sample);
  }
  for (const substrate of ['none', 'sand']) {
    const y = await page.evaluate((substrate) => {
      const a = window.__higata; a.tankSetSubstrate(substrate);
      const o = a.tank.occupants[0], floorY = substrate === 'none' ? 0 : 0.05;
      o.driver.update(1 / 60, { floor: { heightAt: () => floorY, waterAt: () => 0.3 }, player: o.ind.pos.clone().set(0, 1, 2), simScale: 1, nowMs: Date.now() });
      return o.root.position.y;
    }, substrate);
    const floorY = substrate === 'none' ? 0 : 0.05;
    assert.ok(y >= floorY && y < floorY + 0.05);
  }
  await page.evaluate(() => { const a = window.__higata; a.closeTankEdit(); a.tank.setAutoRotate(false); a.tank.frameTank(); });
  const frame = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction((f) => window.__higata.frameCount >= f + 2, frame);
  await page.screenshot({ animations: 'disabled', path: new URL('aquarium-goby.png', output).pathname });
  await page.evaluate(() => window.__higata.writeSave());
  await page.reload(); await page.waitForFunction(() => !!window.__higata);
  await page.getByRole('button', { name: /つづきから/ }).click(); await page.waitForFunction(() => window.__higata.mode === 'home' && window.__higata.tank.occupants.length === 1 && window.__higata.tank.occupants[0].root.position.y >= 0.05);
  assert.ok(await page.evaluate(() => window.__higata.tank.occupants[0].root.position.y < 0.1));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', samples, checks: ['juvenile, young and adult hero rigs', 'skinned geometry below water and on the substrate', 'substrate replacement', 'save reload', 'no shader/page errors'] }));
} finally { await browser?.close(); server.kill(); }
