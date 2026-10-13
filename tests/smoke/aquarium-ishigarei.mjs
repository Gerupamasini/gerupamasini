#!/usr/bin/env node
// Build first. The イシガレイ juvenile in the home tank: its procedural materials survive the tank's caustic copies
// (no shader errors), it is drawn on the bottom inside the tank, and it buries in sand but not on a bare floor.
// Output: tests/smoke/out/aquarium-ishigarei-*.png
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4183;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const output = new URL('out/', import.meta.url); fs.mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;

/** Mean colour on the back of the buried first occupant against the bed in a ring round it (sRGB), and the worst relative difference per channel. */
async function coverMatch(page, file) {
  const pts = await page.evaluate(() => {
    const a = window.__higata, t = a.tank, o = t.occupants[0], st = o.driver.behaviour.state, K = o.root.scale.x, cam = t.camera;
    const W = innerWidth, H = innerHeight, v = cam.position.clone(), R = t.aquariumRoot.position;
    const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
    const at = (x, z, y) => { v.set(x + R.x, (y ?? t.floor.heightAt(x, z)) + R.y, z + R.z).project(cam); return [Math.round((v.x + 1) / 2 * W), Math.round((1 - v.y) / 2 * H)]; };
    const back = [];
    for (const s of [0.01, 0.018, 0.026]) for (const l of [-0.005, 0, 0.005]) back.push(at(st.pos.x - fx * s * K + fz * l * K, st.pos.z - fz * s * K - fx * l * K, st.pos.y + 0.002 * K));
    const ring = [];
    // just outside the fins beside the body (half width 28 mm on the 70 mm fish), along the same stretch as the samples on its back
    for (let i = 0; i < 16; i++) { const th = (i / 16) * Math.PI * 2, a = Math.cos(th) * 0.022 * K, l = (Math.sin(th) >= 0 ? 1 : -1) * 0.028 * K; ring.push(at(st.pos.x - fx * 0.016 * K + fx * a + fz * l, st.pos.z - fz * 0.016 * K + fz * a - fx * l)); }
    return { back, ring };
  });
  // several moments: the caustics and the light shafts move over the bed and the fish alike
  const shots = [];
  for (let i = 0; i < 10; i++) {
    if (i) { const f = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction((n) => window.__higata.frameCount >= n, f + 8, { timeout: 600000 }); }
    shots.push(PNG.sync.read(await page.screenshot({ animations: 'disabled', path: i === 0 ? new URL(file, output).pathname : undefined })));
  }
  const each = shots.map((png) => compare(png, pts));
  const cover = [0, 1, 2].map((c) => each.reduce((a, e) => a + e.cover[c], 0) / each.length), ground = [0, 1, 2].map((c) => each.reduce((a, e) => a + e.ground[c], 0) / each.length);
  const diff = cover.map((c, i) => (c - ground[i]) / Math.max(1, ground[i]));
  return { worst: Math.max(...diff.map(Math.abs)), diff: diff.map((x) => +x.toFixed(3)), cover: cover.map(Math.round), ground: ground.map(Math.round), each: each.map((e) => e.diff) };
}

/** mean colours (sRGB) on the fish's back and in the ring round it, in one screenshot */
function compare(png, pts) {
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
  return { cover, ground, diff: cover.map((c, i) => +((c - ground[i]) / Math.max(1, ground[i])).toFixed(3)) };
}
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
  // set into the tank, each is seen on the sand first (it may bury itself a few seconds later)
  const placed = await page.evaluate(() => window.__higata.tank.occupants.map((o) => o.driver.debugLabel()));
  for (const l of placed) assert.ok(!/\(砂\)/.test(l), JSON.stringify(placed));
  await shot('sand');
  const sand = await state();
  for (const s of sand) {
    assert.ok(s.visible && s.drawn >= 3, JSON.stringify(s));
    assert.ok(s.minY > s.floorWorld - 0.006, JSON.stringify(s));
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
  // buried: the sand thrown over it takes the bed's colour (sand, then mud)
  const covers = {};
  for (const bed of ['sand', 'mud']) {
    if (bed !== 'sand') await page.evaluate((bed) => window.__higata.tankSetSubstrate(bed), bed);
    await page.evaluate(() => window.__higata.tank.occupants[0].driver.setIntent({ id: 10, kind: 'burrow', urgency: 0, seconds: 300 }));
    await page.waitForFunction(() => window.__higata.tank.occupants[0].driver.behaviour?.state.phase === 'buried' && window.__higata.tank.occupants[0].driver.behaviour.state.bury > 0.8, null, { timeout: 900000 });
    await page.evaluate(() => {
      const t = window.__higata.tank, o = t.occupants[0], p = o.root.getWorldPosition(o.root.position.clone());
      t.controls.target.copy(p);
      t.camera.position.set(p.x + 0.03, p.y + 0.13, p.z + 0.09);
    });
    await shot(`${bed}-buried`, 4);
    covers[bed] = await coverMatch(page, `aquarium-ishigarei-${bed}-cover.png`);
    assert.ok(covers[bed].worst < 0.1, `${bed}: ${JSON.stringify(covers[bed])}`);
  }
  await page.evaluate(() => window.__higata.tankSetSubstrate('sand'));
  await page.evaluate(() => { const a = window.__higata; a.tank.frameTank(); a.tankSetSubstrate('none'); });
  await shot('bare');
  const bare = await state();
  await close('bare-close');
  for (const s of bare) assert.ok(s.visible && s.drawn >= 3 && !/\(砂\)/.test(s.label), JSON.stringify(s));
  // the shader lays the body onto the ground patch (world space): it must follow the floor when the sand is taken out
  for (const s of [...sand, ...bare]) assert.ok(Math.abs(s.patch - s.floorWorld) < 0.002, JSON.stringify(s));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', sand, bare, covers }));
} finally { await browser?.close(); server.kill(); }
