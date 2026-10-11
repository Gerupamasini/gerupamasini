#!/usr/bin/env node
// Build first. The イシガレイ juvenile in the home tank: its procedural materials survive the tank's caustic copies
// (no shader errors), it is drawn on the bottom inside the tank, and it buries in sand but not on a bare floor.
// Output: tests/smoke/out/aquarium-ishigarei-*.png
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4183;
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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.setDefaultTimeout(120000);
  await page.goto(url); await page.waitForFunction(() => !!window.__higata);
  await page.locator('button.primary').first().click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(async () => {
    const a = window.__higata, species = a.data.species.get('platichthys_bicoloratus');
    const records = [62, 78].map((length, i) => ({ id: `ishigarei-smoke-${i}`, number: i + 1, speciesId: species.id, length_mm: length, weight_g: 4, sex: 'f', stage: species.stages[0].id, traits: [], caughtAt: Date.now() - i * 1000, caughtWhere: [0, 0], tideLevel: 0 }));
    a.encyclopedia.tankItems.value = records;
    await a.tank.setOccupants(records, (id) => a.data.species.get(id));
    a.tank.setAutoRotate(false); a.tank.frameTank();
  });
  const shot = async (name, frames = 90) => {
    const f = await page.evaluate(() => window.__higata.frameCount);
    await page.waitForFunction((n) => window.__higata.frameCount >= n, f + frames, { timeout: 600000 });
    await page.screenshot({ animations: 'disabled', path: new URL(`aquarium-ishigarei-${name}.png`, output).pathname });
  };
  const state = () => page.evaluate(() => {
    const a = window.__higata, tmp = a.tank.occupants[0].root.position.clone();
    a.tank.scene.updateMatrixWorld(true);
    return a.tank.occupants.map((o) => {
      let drawn = 0, minY = Infinity;
      o.root.traverse((m) => {
        if (!m.isMesh || !m.visible) return;
        let v = m.parent; while (v && v.visible) v = v.parent;
        if (v) return;  // under a hidden LOD level
        drawn++;
        if (m.isSkinnedMesh) for (let i = 0; i < m.geometry.attributes.position.count; i += 7) { m.getVertexPosition(i, tmp).applyMatrix4(m.matrixWorld); minY = Math.min(minY, tmp.y); }
      });
      return { visible: o.root.visible, drawn, label: o.driver.debugLabel(), y: o.root.position.y, minY, floorWorld: a.tank.floor.heightAt(o.root.position.x, o.root.position.z) + a.tank.aquariumRoot.position.y, patch: o.driver.model.look.ground.uniforms.uGroundRect.value.w };
    });
  });
  await shot('sand');
  const sand = await state();
  for (const s of sand) {
    assert.ok(s.visible && s.drawn >= 3, JSON.stringify(s));
    assert.ok(s.minY > s.floorWorld - 0.006, JSON.stringify(s));
    // set into the tank, it is seen on the sand first (it may bury itself later)
    assert.ok(!/\(砂\)/.test(s.label), JSON.stringify(s));
  }
  // close: the camera at a hand's distance above the first fish
  const close = async (name) => {
    await page.evaluate(() => {
      const t = window.__higata.tank, o = t.occupants[0];
      o.driver.setIntent({ id: 9, kind: 'rest', urgency: 0, seconds: 60 });
      const p = o.root.getWorldPosition(o.root.position.clone());
      t.controls.target.copy(p);
      t.camera.position.set(p.x + 0.04, p.y + 0.11, p.z + 0.12);
    });
    await shot(name, 4);
  };
  await close('sand-close');
  await page.evaluate(() => { const a = window.__higata; a.tank.frameTank(); a.tankSetSubstrate('none'); });
  await shot('bare');
  const bare = await state();
  await close('bare-close');
  for (const s of bare) assert.ok(s.visible && s.drawn >= 3 && !/\(砂\)/.test(s.label), JSON.stringify(s));
  // the shader lays the body onto the ground patch (world space): it must follow the floor when the sand is taken out
  for (const s of [...sand, ...bare]) assert.ok(Math.abs(s.patch - s.floorWorld) < 0.002, JSON.stringify(s));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', sand, bare }));
} finally { await browser?.close(); server.kill(); }
