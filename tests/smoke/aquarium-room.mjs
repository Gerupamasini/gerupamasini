import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4194, url = `http://127.0.0.1:${port}/gerupamasini/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(url)).ok) break; } catch {} if (i > 60) throw Error('Preview unavailable'); await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(m.text()); });
  const state = () => page.evaluate(() => { const a = window.__higata, saved = JSON.parse(a.exportSave()); return { active: a.activeTankId.value, main: saved.aquariumRoom.mainTankId, tanks: saved.aquariumRoom.tanks.map(t => ({ id: t.id, size: t.size, fish: t.individuals.map(r => r.id), position: t.position })), case: a.encyclopedia.caseItems.value.map(r => r.id), width: a.tank.dimensions.width, rootScale: a.tank.aquariumRoot.scale.toArray() }; });
  const openRoom = async () => { await page.evaluate(() => window.__higata.openRoomPlacement()); await page.locator('.room-placement').waitFor(); };
  const home = async () => { await page.evaluate(() => { const a = window.__higata; a.closeRoomPlacement(); a.closeTankEdit(); }); await page.waitForFunction(() => window.__higata.mode === 'home'); };
  const level = async research => page.evaluate(async research => { const a = window.__higata, s = JSON.parse(a.exportSave()); s.player.research = research; await a.importSave(JSON.stringify(s)); }, research);
  const reload = async () => { await page.evaluate(() => window.__higata.writeSave()); await page.reload(); await page.locator('.title-screen').waitFor(); await page.locator('.title-actions .primary').click(); await page.waitForFunction(() => window.__higata.mode === 'home'); };
  await page.goto(url); await page.locator('.title-screen').waitFor();
  await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'minimal' }));
  await page.locator('.title-actions .primary').click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(async () => {
    const a = window.__higata, s = JSON.parse(a.exportSave());
    const fish = id => ({ id, speciesId: 'acanthogobius_flavimanus', number: id === 'one' ? 1 : 2, length_mm: 80, weight_g: 10, sex: 'unknown', stage: 'subadult', traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 });
    s.case = [fish('one'), fish('two')]; s.equipmentCollection.stock['airStone-ivory'] = 1; await a.importSave(JSON.stringify(s)); await a.tankPut(a.encyclopedia.caseItems.value[0]);
  });
  await page.getByRole('button', { name: '水槽', exact: true }).click(); await page.waitForFunction(() => window.__higata.mode === 'tankEdit');
  await page.getByRole('button', { name: '部屋に設置', exact: true }).click(); await page.locator('.room-placement').waitFor();
  assert.equal(await page.evaluate(() => window.__higata.addRoomTank(45)), false);
  await page.getByRole('button', { name: '撤去する', exact: true }).click();
  await page.waitForFunction(() => !window.__higata.roomBusy.value && window.__higata.aquariumRoom.value.tanks.length === 0);
  assert.deepEqual((await state()).case.sort(), ['one', 'two']);
  await home(); await reload(); assert.equal((await state()).tanks.length, 0); assert.equal((await state()).main, null);
  assert.equal(await page.evaluate(() => window.__higata.tank.aquariumRoot.visible), false);
  console.log('PASS initial 60cm removal, animal transfer and empty-room reload');

  await page.getByRole('button', { name: '水槽を設置', exact: true }).click();
  await page.getByRole('button', { name: '水槽と標準台を設置', exact: true }).click();
  await page.waitForFunction(() => !window.__higata.roomBusy.value && window.__higata.aquariumRoom.value.tanks.length === 1);
  assert.equal((await state()).width, 0.45);
  await home();
  await page.evaluate(async () => { const a = window.__higata; await a.tankPut(a.encyclopedia.caseItems.value.find(r => r.id === 'one')); });
  for (const [item, width] of [['tank-initial', 0.6], ['tank-45-initial', 0.45]]) {
    assert.equal(await page.evaluate(item => window.__higata.tankInstallEquipment(item, 'tank'), item), true);
    await page.waitForFunction(() => !window.__higata.roomBusy.value);
    assert.equal((await state()).width, width);
    assert.deepEqual(await page.evaluate(() => window.__higata.tank.occupants.map(o => [o.record.id, o.record.length_mm])), [['one', 80]]);
    assert.deepEqual((await state()).rootScale, [1, 1, 1]);
  }
  await openRoom();
  await page.evaluate(() => { const a = window.__higata, template = a.encyclopedia.caseItems.value[0]; a.encyclopedia.caseItems.value = [template, ...Array.from({ length: 5 }, (_, i) => ({ ...template, id: `full-${i}` }))]; });
  assert.equal(await page.evaluate(() => { const a = window.__higata; return a.removeRoomTank(a.activeTankId.value); }), false);
  assert.equal((await state()).tanks.length, 1); assert.equal((await state()).case.length, 6);
  assert.deepEqual((await state()).tanks[0].fish, ['one']);
  await page.evaluate(() => { const a = window.__higata; a.encyclopedia.caseItems.value = a.encyclopedia.caseItems.value.filter(r => r.id === 'two'); });
  await home();
  console.log('PASS resizing preserves animal dimensions and case-full removal leaves both containers intact');
  await level(1600); await openRoom();
  await page.getByRole('button', { name: '＋追加', exact: true }).click(); await page.getByLabel('追加する水槽のサイズ').selectOption('90');
  await page.getByRole('button', { name: '水槽と標準台を設置', exact: true }).click();
  await page.waitForFunction(() => !window.__higata.roomBusy.value && window.__higata.aquariumRoom.value.tanks.length === 2);
  await page.getByRole('button', { name: 'メイン水槽にする', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__higata.addRoomTank(120)), false);
  await home(); await page.evaluate(async () => { const a = window.__higata; await a.tankPut(a.encyclopedia.caseItems.value.find(r => r.id === 'two')); });
  const two = await state(); assert.equal(two.width, 0.9); assert.deepEqual(two.tanks.map(t => t.fish), [['one'], ['two']]);
  console.log('PASS level 5 second tank, separate residents and main selection');

  await level(8100); await openRoom();
  await page.getByRole('button', { name: '＋追加', exact: true }).click(); await page.getByLabel('追加する水槽のサイズ').selectOption('120');
  await page.getByRole('button', { name: '水槽と標準台を設置', exact: true }).click();
  await page.waitForFunction(() => !window.__higata.roomBusy.value && window.__higata.aquariumRoom.value.tanks.length === 3);
  assert.equal((await state()).width, 1.2); assert.deepEqual((await state()).rootScale, [1, 1, 1]);
  assert.equal(await page.evaluate(() => window.__higata.addRoomTank(60)), false);
  assert.equal(await page.evaluate(() => { const a = window.__higata; return a.moveRoomTank(a.activeTankId.value, [0, 0]); }), false);
  assert.equal(await page.evaluate(() => { const a = window.__higata; return a.moveRoomTank(a.activeTankId.value, [1.8, 1]); }), true);
  const screenshots = new URL('../../docs/aquarium-room/', import.meta.url); await mkdir(screenshots, { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const failures = await page.locator('.room-placement button, .room-placement input, .room-placement select, .room-plan').evaluateAll(elements => elements.flatMap(el => {
      const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.x < 0 || r.y < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || (el.tagName !== 'svg' && !el.contains(hit)) ? [{ text: el.textContent, rect: r.toJSON(), hit: hit?.className }] : [];
    }));
    assert.deepEqual(failures, [], JSON.stringify(viewport));
    const box = await page.locator('.room-placement').evaluate(el => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    assert.ok(box.scroll <= box.client + 1, `room scroll ${JSON.stringify(viewport)} ${JSON.stringify(box)}`);
    if (viewport.width === 390) await page.screenshot({ path: new URL('placement-mobile.png', screenshots).pathname });
  }
  await page.setViewportSize({ width: 1280, height: 800 }); await page.screenshot({ path: new URL('placement-desktop.png', screenshots).pathname });
  await page.getByRole('button', { name: 'メイン水槽にする', exact: true }).click(); await home();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '水槽1を見る', exact: true }).click(); await page.waitForFunction(() => !window.__higata.roomBusy.value);
  assert.deepEqual(await page.evaluate(() => window.__higata.tank.occupants.map(o => o.record.id)), ['one']);
  assert.equal(await page.evaluate(() => window.__higata.tankInstallEquipment('airStone-ivory', 'airStone')), true);
  await page.getByRole('button', { name: '水槽2を見る', exact: true }).click(); await page.waitForFunction(() => !window.__higata.roomBusy.value);
  assert.deepEqual(await page.evaluate(() => window.__higata.tank.occupants.map(o => o.record.id)), ['two']);
  assert.equal(await page.evaluate(() => window.__higata.tankInstallEquipment('airStone-ivory', 'airStone')), false);
  await page.screenshot({ path: new URL('home-mobile.png', screenshots).pathname });
  await reload(); const final = await state(); assert.equal(final.active, final.main); assert.equal(final.width, 1.2);
  assert.deepEqual(final.tanks.map(t => t.size), [45, 90, 120]); assert.deepEqual(final.tanks.map(t => t.fish), [['one'], ['two'], []]);
  assert.deepEqual(final.tanks[2].position, [1.8, 1]);
  const exported = await page.evaluate(() => JSON.parse(window.__higata.exportSave())); assert.equal(exported.tank.layout.equipment.tankItemId, 'tank-120-initial');
  assert.deepEqual(errors, []);
  console.log('PASS level 10 third tank, physical sizes, placement bounds, shared inventory, home switching, save/reload and mobile layouts');
} finally { await browser?.close(); server.kill('SIGTERM'); }
