import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4198, url = `http://127.0.0.1:${port}/gerupamasini/`;
const shots = new URL('../../docs/aquarium-amamo/', import.meta.url); await mkdir(shots, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
const errors = [];
try {
  for (let n = 0; ; n++) { try { if ((await fetch(url)).ok) break; } catch {} if (n > 60) throw Error('Preview unavailable'); await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  if (!process.argv.includes('--mobile-only')) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } }); page.setDefaultTimeout(90000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(m.text()); });
  const settled = () => page.locator('.transition').waitFor({ state: 'hidden' });
  const frames = async (n = 2) => { const start = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction(({ start, n }) => window.__higata.frameCount >= start + n, { start, n }); };
  const layout = () => page.evaluate(() => window.__higata.tank.currentLayout.items);
  const placeClumps = () => page.evaluate(() => {
    const a = window.__higata, items = a.tank.currentLayout.items;
    for (const [i, item] of items.entries()) {
      const point = a.tank.camera.position.clone().set(i ? 0.11 : -0.07, a.tank.sandTop, i ? -0.035 : 0.04).add(a.tank.aquariumRoot.position).project(a.tank.camera);
      a.tank.moveItem(item.id, point.x, point.y);
    }
    a.commitTankLayout();
  });
  const edit = async () => { await page.evaluate(() => window.__higata.openTankEdit()); await page.waitForFunction(() => window.__higata.mode === 'tankEdit'); await settled(); await page.getByRole('button', { name: 'レイアウト', exact: true }).click(); };
  const home = async () => { await page.evaluate(() => { const a = window.__higata; a.closeRoomPlacement(); a.closeTankEdit(); }); await page.waitForFunction(() => window.__higata.mode === 'home'); await settled(); };
  const reachable = async selector => {
    const bad = await page.locator(selector).evaluateAll(elements => elements.flatMap(el => {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return [];
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || !el.contains(hit) ? [el.textContent] : [];
    })); assert.deepEqual(bad, [], selector);
  };
  await page.goto(url); await page.locator('.title-screen').waitFor();
  await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'mid', heroMaterials: false }));
  await page.locator('.title-actions .primary').click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  const mainId = await page.evaluate(() => window.__higata.activeTankId.value);
  await edit(); await page.getByRole('button', { name: '+ アマモ', exact: true }).click(); await page.getByRole('button', { name: '+ アマモ', exact: true }).click();
  assert.equal((await layout()).filter(i => i.type === 'amamo').length, 2);
  assert.equal(await page.locator('.tank-items li').filter({ hasText: 'アマモ' }).count(), 2);
  const first = (await layout())[0];
  await page.locator('.tank-items li').first().getByRole('button', { name: '回転', exact: true }).click();
  assert.ok(Math.abs((await layout())[0].rot - first.rot - Math.PI / 4) < 1e-9);
  // Keep the pointer test out from behind the editor even when the random initial position is on the right.
  await placeClumps(); const dragStart = (await layout())[0];
  await frames();
  const grab = await page.evaluate(id => {
    const a = window.__higata, o = a.tank.itemObjects.get(id), p = o.position.clone().add(a.tank.aquariumRoot.position); p.y += 0.09;
    p.project(a.tank.camera); const r = a.renderer.gl.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2, selected: a.tank.pickItem(p.x, p.y) };
  }, first.id);
  assert.equal(grab.selected, first.id);
  await page.mouse.move(grab.x, grab.y); await page.mouse.down(); await page.mouse.move(grab.x + 45, grab.y + 15, { steps: 5 }); await page.mouse.up();
  const moved = (await layout())[0]; assert.ok(Math.hypot(moved.x - dragStart.x, moved.z - dragStart.z) > 0.005);
  await placeClumps();
  await frames(); await page.screenshot({ path: new URL('desktop.png', shots).pathname, animations: 'disabled' });
  await home(); const time = await page.evaluate(() => window.__higata.tank.amamo.kit.uniforms.uAmTime.value); await frames(3);
  assert.ok(await page.evaluate(t => window.__higata.tank.amamo.kit.uniforms.uAmTime.value > t, time));
  assert.equal(await page.evaluate(() => window.__higata.tank.amamo.kit.uniforms.uAmWater.value), 1.03);
  console.log('PASS existing amamo model, add/rotate/pointer drag, world water level and home sway');

  await page.evaluate(async () => { const a = window.__higata, s = JSON.parse(a.exportSave()); s.player.research = 1600; s.equipmentCollection.progression.sizes.push(45); await a.importSave(JSON.stringify(s)); a.openRoomPlacement(); });
  assert.equal(await page.evaluate(() => window.__higata.addRoomTank(45)), true);
  await home(); await edit(); await page.getByRole('button', { name: '+ アマモ', exact: true }).click(); await home();
  assert.equal(await page.evaluate(() => window.__higata.tank.amamo.kit.uniforms.uAmWater.value), 0.98);
  assert.equal(await page.evaluate(() => window.__higata.roomTanks.getObjectsByProperty('name', 'AquariumAmamo').length), 2);
  await page.evaluate(id => window.__higata.selectRoomTank(id), mainId); await frames();
  assert.equal((await layout()).filter(i => i.type === 'amamo').length, 2);
  assert.equal(await page.evaluate(() => window.__higata.roomTanks.getObjectsByProperty('name', 'AquariumAmamo').length), 1);
  const before = await page.evaluate(() => JSON.parse(window.__higata.exportSave()).aquariumRoom.tanks.map(t => ({ id: t.id, items: t.layout.items })));
  await page.evaluate(() => window.__higata.writeSave()); await page.reload(); await page.locator('.title-screen').waitFor(); await page.locator('.title-actions .primary').click(); await page.waitForFunction(() => window.__higata.mode === 'home'); await frames();
  assert.deepEqual(await page.evaluate(() => JSON.parse(window.__higata.exportSave()).aquariumRoom.tanks.map(t => ({ id: t.id, items: t.layout.items }))), before);
  for (const quality of ['minimal', 'low', 'mid', 'high']) {
    await page.evaluate(q => window.__higata.updateSettings({ homeQuality: q }), quality); await frames();
    const drawn = await page.evaluate(() => [...window.__higata.tank.amamo.plants].map(p => ({ visible: p.visible, lod: p.lod, vertices: p.drawnVertices })));
    assert.ok(drawn.every(p => p.visible && p.vertices > 0));
    if (quality === 'minimal') assert.ok(drawn.every(p => p.lod === 2));
  }
  await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'mid' })); await edit();
  await page.locator('.tank-items li').first().getByRole('button', { name: '削除', exact: true }).click(); await frames();
  assert.equal(await page.evaluate(() => window.__higata.tank.amamo.plants.size), 1);
  await page.locator('.tank-items li').first().getByRole('button', { name: '削除', exact: true }).click(); await frames();
  assert.equal(await page.evaluate(() => window.__higata.tank.amamo.kit), null);
  assert.equal(await page.evaluate(() => window.__higata.roomTanks.getObjectsByProperty('name', 'AquariumAmamo').length), 1);
  console.log('PASS multi-tank models, save/reload, all quality tiers and shared-material cleanup');
  await reachable('.tank-add button'); await page.close();
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); mobile.setDefaultTimeout(90000);
  mobile.on('pageerror', e => errors.push(e.message)); mobile.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(m.text()); });
  await mobile.goto(url); await mobile.locator('.title-screen').waitFor(); await mobile.evaluate(() => window.__higata.updateSettings({ homeQuality: 'minimal' })); await mobile.locator('.title-actions .primary').tap(); await mobile.waitForFunction(() => window.__higata.mode === 'home');
  await mobile.evaluate(() => window.__higata.openTankEdit()); await mobile.waitForFunction(() => window.__higata.mode === 'tankEdit'); await mobile.locator('.transition').waitFor({ state: 'hidden' });
  await mobile.getByRole('button', { name: 'レイアウト', exact: true }).tap(); await mobile.getByRole('button', { name: '+ アマモ', exact: true }).tap();
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await mobile.setViewportSize(size);
    const frame = await mobile.evaluate(() => window.__higata.frameCount); await mobile.waitForFunction(f => window.__higata.frameCount > f, frame);
    const bad = await mobile.locator('.tank-add button, .tank-items button, .tank-substrate-row button').evaluateAll(elements => elements.filter(el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || !el.contains(hit); }).map(el => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON() })));
    assert.deepEqual(bad, [], `mobile ${size.width}x${size.height}`);
  }
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.evaluate(() => { window.__higata.updateSettings({ homeQuality: 'low' }); document.querySelector('.drawer-body').scrollTop = 0; });
  const shotFrame = await mobile.evaluate(() => window.__higata.frameCount); await mobile.waitForFunction(f => window.__higata.frameCount >= f + 3, shotFrame);
  await mobile.getByRole('button', { name: '+ アマモ', exact: true }).waitFor({ state: 'visible' });
  await mobile.screenshot({ path: new URL('mobile.png', shots).pathname, animations: 'disabled' });
  await mobile.locator('.tank-items li').first().getByRole('button', { name: '回転', exact: true }).tap();
  await mobile.locator('.tank-items li').first().getByRole('button', { name: '削除', exact: true }).tap();
  assert.equal(await mobile.evaluate(() => window.__higata.tank.currentLayout.items.length), 0);
  console.log('PASS mobile amamo controls without scrolling at four portrait/landscape sizes');
  assert.deepEqual(errors, []);
} finally { await browser?.close(); server.kill(); }
