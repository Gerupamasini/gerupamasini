import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4197, url = `http://127.0.0.1:${port}/gerupamasini/`;
const shots = new URL('../../docs/aquarium-progression/', import.meta.url); await mkdir(shots, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; ; n++) { try { if ((await fetch(url)).ok) break; } catch {} if (n > 60) throw Error('Preview unavailable'); await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); page.setDefaultTimeout(120000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(m.text()); });
  const state = () => page.evaluate(() => { const a = window.__higata; return { p: a.aquariumProgression, cr: a.encyclopedia.money.value, max: a.tankMax, fish: a.encyclopedia.tankItems.value.map(r => r.id), case: a.encyclopedia.caseItems.value.map(r => r.id), tickets: a.equipmentCollection.value.tickets }; });
  const settled = async () => { await page.locator('.transition').waitFor({ state: 'hidden' }); };
  const shop = async tab => { await page.evaluate(tab => window.__higata.openShop(tab), tab); await page.waitForFunction(() => window.__higata.mode === 'shop'); await settled(); };
  const home = async () => { await page.evaluate(() => { const a = window.__higata; if (a.mode === 'shop') a.closeShop(); else if (a.mode === 'tankEdit') a.closeTankEdit(); else if (a.mode === 'roomPlacement') a.closeRoomPlacement(); }); await page.waitForFunction(() => window.__higata.mode === 'home'); await settled(); };
  const seedCase = async numbers => page.evaluate(async numbers => {
    const a = window.__higata, s = JSON.parse(a.exportSave());
    // Ambient fish behavior must not change the exact CR balances under test.
    if (!s.equipmentCollection.progression.questRewards.includes('behavior')) s.equipmentCollection.progression.questRewards.push('behavior');
    s.case = numbers.map(n => ({ id: `fish-${n}`, speciesId: 'acanthogobius_flavimanus', number: n + 1, length_mm: 25, weight_g: 0.5, sex: 'unknown', stage: 'juvenile', traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 }));
    await a.importSave(JSON.stringify(s));
  }, numbers);
  const putFirst = () => page.evaluate(() => { const a = window.__higata; return a.tankPut(a.encyclopedia.caseItems.value[0]); });
  const reachable = async selector => {
    const bad = await page.locator(selector).evaluateAll(elements => elements.flatMap(el => {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return [];
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || !el.contains(hit) ? [{ text: el.textContent, rect: r.toJSON(), hit: hit?.className }] : [];
    })); assert.deepEqual(bad, [], selector);
  };
  await page.goto(url); await page.locator('.title-screen').waitFor();
  await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'minimal', fieldQuality: 'minimal' }));
  await page.locator('.title-actions .primary').tap(); await page.waitForFunction(() => window.__higata.mode === 'home');
  assert.equal((await state()).max, 4); assert.equal((await state()).cr, 0);
  assert.equal(await page.evaluate(() => window.__higata.tank.equipment.currentLayout.devices.filter(d => /^(filter|spongeFilter|topFilter|canisterFilter)$/.test(d.kind)).map(d => d.kind).join()), 'filter');
  assert.equal(await page.evaluate(() => window.__higata.tankInstallEquipment('canisterFilter-initial')), false);
  await shop('filters');
  await page.getByRole('button', { name: '外部 500 CR', exact: true }).tap();
  assert.equal(await page.getByRole('button', { name: 'フィルターを解放', exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__higata.buyFilterLevel('canisterFilter')), false);
  console.log('PASS initial underwater filter, four slots and insufficient-CR protection');

  await home(); await seedCase([0, 1, 2, 3, 4, 5]);
  await page.evaluate(() => { const a = window.__higata, r = a.encyclopedia.caseItems.value[0]; return Promise.all([a.tankPut(r), a.tankPut(r)]); });
  assert.equal((await state()).fish.length, 1); assert.equal((await state()).cr, 150);
  for (let n = 0; n < 3; n++) await putFirst();
  await putFirst(); assert.equal((await state()).fish.length, 4); assert.equal((await state()).case.length, 2);
  await shop('filters'); await page.getByRole('button', { name: 'Lv.2へ強化', exact: true }).tap();
  assert.equal((await state()).max, 5); assert.equal((await state()).cr, 200);
  await home(); await putFirst();
  await page.waitForFunction(() => window.__higata.tank.occupants.length === 5);
  console.log('PASS one-time introduction CR, duplicate transfer protection and rendering a fifth animal');

  await page.evaluate(() => window.__higata.encyclopedia.addMoney(5000));
  await shop('tanks');
  for (const size of [45, 90, 120]) assert.equal(await page.evaluate(size => window.__higata.buyTankSize(size), size), true);
  const balance = (await state()).cr;
  assert.equal(await page.evaluate(() => window.__higata.buyTankSize(120)), false); assert.equal((await state()).cr, balance);
  await shop('filters');
  for (const kind of ['canisterFilter', 'topFilter', 'spongeFilter']) assert.equal(await page.evaluate(kind => window.__higata.buyFilterLevel(kind), kind), true);
  for (let n = 0; n < 4; n++) assert.equal(await page.evaluate(() => window.__higata.buyFilterLevel('canisterFilter')), true);
  assert.equal(await page.evaluate(() => window.__higata.buyFilterLevel('canisterFilter')), false);
  await home();
  assert.equal(await page.evaluate(() => window.__higata.tankInstallEquipment('canisterFilter-initial')), true);
  assert.equal((await state()).max, 10);
  assert.equal(await page.evaluate(() => window.__higata.tankInstallEquipment('tank-120-initial')), true);
  await page.waitForFunction(() => !window.__higata.roomBusy.value); assert.equal((await state()).max, 20);
  for (const numbers of [[5, 6, 7, 8, 9, 10], [11, 12, 13, 14, 15, 16], [17, 18, 19]]) {
    await seedCase(numbers); for (const _ of numbers) await putFirst();
  }
  await page.waitForFunction(() => window.__higata.tank.occupants.length === 20);
  await seedCase([20]); await putFirst();
  assert.equal((await state()).fish.length, 20); assert.deepEqual((await state()).case, ['fish-20']);
  const fishIds = (await state()).fish;
  for (const item of ['filter-initial', 'spongeFilter-initial', 'tank-90-initial']) assert.equal(await page.evaluate(item => window.__higata.tankInstallEquipment(item), item), false);
  assert.deepEqual((await state()).fish, fishIds);
  assert.equal(await page.evaluate(() => window.__higata.tank.equipment.currentLayout.devices.filter(d => /^(filter|spongeFilter|topFilter|canisterFilter)$/.test(d.kind)).map(d => d.kind).join()), 'canisterFilter');
  assert.equal((await state()).tickets, 10);
  console.log('PASS CR unlocks, level cap, size cap, twenty rendered animals and safe downgrade rejection');

  await page.evaluate(async () => { const a = window.__higata, s = JSON.parse(a.exportSave()); s.player.research = 1600; await a.importSave(JSON.stringify(s)); a.openRoomPlacement(); });
  assert.equal(await page.evaluate(() => window.__higata.addRoomTank(90)), true);
  assert.equal((await state()).max, 5); // New tanks use the initial filter, whose level is shared.
  assert.equal(await page.evaluate(() => window.__higata.tankInstallEquipment('canisterFilter-initial')), true);
  assert.equal((await state()).max, 16);
  const saved = await state(); await home(); await page.evaluate(() => window.__higata.writeSave());
  await page.reload(); await page.locator('.title-screen').waitFor(); await page.locator('.title-actions .primary').tap(); await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.waitForFunction(() => window.__higata.tank.occupants.length === 20);
  assert.equal((await state()).max, 20); assert.deepEqual((await state()).p, saved.p); assert.equal((await state()).cr, saved.cr);
  await page.evaluate(() => window.__higata.requestSave()); assert.equal((await state()).cr, saved.cr);
  console.log('PASS shared levels across room tanks, twenty-fish save/reload and no repeated quest rewards');

  await page.evaluate(() => window.__higata.openTankEdit());
  await page.waitForFunction(() => window.__higata.mode === 'tankEdit');
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await reachable('.specimen-source button, .specimen-pagination button, .mobile-specimen-actions button');
    assert.equal(await page.locator('.mobile-specimen').count(), 6);
  }
  await page.locator('.specimen-pagination').getByRole('button', { name: '次へ', exact: true }).tap();
  assert.match(await page.locator('.specimen-pagination').innerText(), /2\/4/);
  await home();
  console.log('PASS twenty-fish mobile editor pagination and actions at four sizes');

  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await shop('filters');
    await reachable('.shop-top button, .shop-tabs button, .shop-catalog button');
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1), false);
    await shop('tanks'); await reachable('.shop-catalog button');
    await shop('quests'); await reachable('.shop-catalog button');
    if (size.width === 390) await page.screenshot({ path: new URL('quests-mobile.png', shots).pathname, animations: 'disabled' });
    await home();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await shop('filters'); await page.getByRole('button', { name: /外部 Lv.5/ }).tap();
  await page.screenshot({ path: new URL('filter-shop-mobile.png', shots).pathname, animations: 'disabled' });
  await home(); await page.locator('.first-steps summary').tap(); await reachable('.first-steps button');
  console.log('PASS mobile shop and quest controls at four portrait/landscape sizes');
  await page.close();

  // The first-trip goal is driven by entering a real map, not by a seeded reward flag.
  const desktop = await browser.newPage({ viewport: { width: 800, height: 600 } }); desktop.setDefaultTimeout(120000);
  desktop.on('pageerror', e => errors.push(e.message));
  await desktop.goto(url); await desktop.locator('.title-screen').waitFor();
  await desktop.evaluate(() => window.__higata.updateSettings({ homeQuality: 'minimal', fieldQuality: 'minimal' }));
  await desktop.locator('.title-actions .primary').click(); await desktop.waitForFunction(() => window.__higata.mode === 'home');
  await desktop.evaluate(() => window.__higata.enterField('manko')); await desktop.waitForFunction(() => window.__higata.mode === 'field');
  assert.deepEqual(await desktop.evaluate(() => ({ cr: window.__higata.encyclopedia.money.value, rewards: window.__higata.aquariumProgression.questRewards })), { cr: 100, rewards: ['field'] });
  await desktop.evaluate(() => window.__higata.enterField('manko')); assert.equal(await desktop.evaluate(() => window.__higata.encyclopedia.money.value), 100);
  console.log('PASS real field entry awards CR only once');
  assert.deepEqual(errors, []);
} finally { await browser?.close(); server.kill('SIGTERM'); }
