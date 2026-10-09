#!/usr/bin/env node
// Build first. Exercises equipment inventory, gacha, preset wiring, raised coordinates and IndexedDB restoration.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4178;
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
  console.log('home loaded');
  await page.evaluate(() => window.__higata.openTankEdit()); await page.waitForFunction(() => window.__higata.mode === 'tankEdit');
  await page.getByRole('button', { name: '設備', exact: true }).click();
  await page.locator('.equipment-slot').first().waitFor();
  assert.ok((await page.getByRole('button', { name: '設備', exact: true }).getAttribute('class')).includes('on'));
  const initial = await page.evaluate(() => {
    const app = window.__higata, r = app.tank.equipment;
    app.tank.scene.updateMatrixWorld(true);
    return { devices: r.devices.size, lights: r.lightLevel, edges: r.currentLayout.connections.length, rootY: app.tank.aquariumRoot.position.y, floorY: app.tank.scene.getObjectByName('roomFloor').position.y, shelfY: app.tank.shelf.group.position.y, cameraY: app.tank.camera.position.y, layout: r.currentLayout };
  });
  assert.equal(initial.devices, 9); assert.equal(initial.lights, 1); assert.ok(initial.edges > 5);
  assert.equal(initial.rootY, 0.73); assert.ok(Math.abs(initial.floorY + 0.008) < 1e-6); assert.equal(initial.shelfY, 0.05); assert.ok(initial.cameraY > 0.73);
  assert.equal(await page.locator('.equipment-slot').count(), 18);
  assert.equal(await page.getByText('手動で接続', { exact: true }).count(), 0);
  await page.screenshot({ animations: 'disabled', path: new URL('aquarium-front.png', output).pathname });

  await page.locator('.equipment-slot[data-category="stand"]').click();
  await page.locator('.equipment-choice').filter({ hasText: 'スタジオメタルフレーム 60' }).click();
  assert.equal(await page.getByRole('button', { name: '入れ替える', exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__higata.tankInstallEquipment('stand-studio', 'stand')), false);
  assert.equal(await page.evaluate(() => window.__higata.tank.equipment.currentLayout.stand), 'wood');
  await page.getByRole('button', { name: '設備ガチャへ', exact: true }).click();
  await page.getByRole('heading', { name: '水槽設備ガチャ' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /1回引く/ }).isDisabled(), false);
  assert.equal(await page.getByRole('button', { name: /10回引く/ }).isDisabled(), false);
  const initialWallet = await page.evaluate(() => { const a = window.__higata; return { money: a.encyclopedia.money.value, tickets: a.equipmentCollection.value.tickets, draws: a.equipmentCollection.value.draws }; });
  assert.deepEqual(initialWallet, { money: 0, tickets: 10, draws: 0 });
  await page.getByRole('button', { name: /排出アイテム・確率を見る/ }).click();
  assert.equal(await page.locator('.gacha-pool li').count(), 36);
  await page.getByLabel('ガチャの設備種類').selectOption('stand'); assert.equal(await page.locator('.gacha-pool li').count(), 2);
  await page.getByRole('button', { name: /排出アイテム・確率を見る/ }).click();
  await page.evaluate(() => window.__higata.addMoney(1200));
  // Controlled draws make the integration reproducible, including duplicates and all relevant finishes.
  await page.evaluate(() => {
    window.__gachaRandom = Math.random;
    const values = [9.5, 0.5, 20.5, 50.5, 50.5, 54.5, 9.5, 0.5, 50.5, 54.5]; let i = 0;
    Math.random = () => values[i++ % values.length] / 90;
  });
  await page.getByRole('button', { name: /10回引く/ }).click();
  await page.waitForFunction(() => !window.__higata.gachaBusy.value && window.__higata.equipmentCollection.value.draws === 10);
  await page.evaluate(() => { Math.random = window.__gachaRandom; });
  assert.equal(await page.locator('.gacha-result').count(), 10);
  const draw = await page.evaluate(() => ({ collection: window.__higata.equipmentCollection.value, money: window.__higata.encyclopedia.money.value }));
  assert.equal(draw.money, 1200); assert.equal(draw.collection.tickets, 0); assert.equal(draw.collection.draws, 10);
  assert.equal(draw.collection.stock['stand-studio'], 2); assert.equal(draw.collection.stock['airStone-ivory'], 3);
  assert.equal(await page.getByRole('button', { name: /1回引く/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: /10回引く/ }).isDisabled(), true);
  await page.evaluate(() => window.__higata.rollGacha(1));
  assert.deepEqual(await page.evaluate(() => ({ collection: window.__higata.equipmentCollection.value, money: window.__higata.encyclopedia.money.value })), draw);
  await page.screenshot({ animations: 'disabled', path: new URL('aquarium-gacha.png', output).pathname });
  // Test-only grant exercises the single draw button and concurrent draw guard.
  await page.evaluate(() => { const a = window.__higata; a.equipmentCollection.value = { ...a.equipmentCollection.value, tickets: 2 }; window.__gachaRandom = Math.random; Math.random = () => 85.5 / 90; });
  await page.getByRole('button', { name: /1回引く/ }).click();
  await page.waitForFunction(() => !window.__higata.gachaBusy.value && window.__higata.equipmentCollection.value.draws === 11);
  assert.equal(await page.evaluate(() => window.__higata.equipmentCollection.value.tickets), 1);
  await page.evaluate(async () => { const a = window.__higata; await Promise.all([a.rollGacha(1), a.rollGacha(1)]); Math.random = window.__gachaRandom; });
  assert.equal(await page.evaluate(() => window.__higata.equipmentCollection.value.draws), 12);
  assert.equal(await page.evaluate(() => window.__higata.equipmentCollection.value.tickets), 0);
  assert.equal(await page.evaluate(() => window.__higata.encyclopedia.money.value), 1200);
  console.log('initial tickets, ticket spending, unchanged CR, rewards, duplicates and locked items passed');
  await page.getByRole('button', { name: /戻る/ }).click(); await page.waitForFunction(() => window.__higata.mode === 'tankEdit');
  await page.getByRole('button', { name: '入れ替える', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__higata.tank.equipment.currentLayout.stand), 'metal');
  await page.getByRole('button', { name: '‹ 設備一覧', exact: true }).click();
  await page.locator('.equipment-slot[data-category="tank"]').click();
  await page.locator('.equipment-choice').filter({ hasText: 'アイボリー 水槽本体' }).click();
  await page.getByRole('button', { name: '入れ替える', exact: true }).click();
  await page.getByRole('button', { name: '‹ 設備一覧', exact: true }).click();
  await page.locator('.equipment-slot[data-category="ledLight"]').click();
  await page.locator('.equipment-choice').filter({ hasText: 'アイボリー LEDライト' }).click();
  await page.getByRole('button', { name: '入れ替える', exact: true }).click();
  await page.getByRole('button', { name: '消灯する', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__higata.tank.equipment.lightLevel), 0);
  await page.getByRole('button', { name: '点灯する', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__higata.tank.equipment.lightLevel), 1);
  await page.getByRole('button', { name: '‹ 設備一覧', exact: true }).click();
  await page.locator('.equipment-slot[data-category="airStone"]').click();
  await page.locator('.equipment-choice').filter({ hasText: 'アイボリー エアストーン' }).click();
  await page.getByRole('button', { name: '入れ替える', exact: true }).click();
  await page.getByLabel('設備のX (cm)').fill('12'); await page.getByLabel('設備のX (cm)').press('Tab');
  await page.getByLabel('設備のZ (cm)').fill('5'); await page.getByLabel('設備のZ (cm)').press('Tab');
  await page.getByRole('button', { name: '45° 回転', exact: true }).click();
  await page.getByRole('button', { name: 'もう1個設置する', exact: true }).click();
  await page.getByRole('button', { name: 'もう1個設置する', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'もう1個設置する', exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__higata.tankInstallEquipment('airStone-ivory')), false);
  const stones = await page.evaluate(() => {
    const a = window.__higata, r = a.tank.equipment;
    a.tankSetSubstrate('none'); const bare = r.currentLayout.devices.find((d) => d.id === 'airStone').position[1];
    a.tankSetSubstrate('sand'); const sand = r.currentLayout.devices.find((d) => d.id === 'airStone').position[1];
    return { records: r.currentLayout.devices.filter((d) => d.kind === 'airStone'), air: r.currentLayout.connections.filter((c) => c.kind === 'air').length, bare, sand, warnings: r.warnings };
  });
  assert.equal(stones.records.length, 3); assert.equal(stones.air, 3); assert.deepEqual(stones.warnings, []);
  assert.ok(Math.abs(stones.bare - 0.004) < 1e-6); assert.ok(Math.abs(stones.sand - 0.054) < 1e-6);
  assert.equal(stones.records[0].position[0], 0.12); assert.equal(stones.records[0].position[2], 0.05);
  assert.ok(stones.records[0].rotation > 0);
  await page.screenshot({ animations: 'disabled', path: new URL('aquarium-equipment-detail.png', output).pathname });
  // Raised water, picking and decoration dragging retain tank-local saved positions.
  const interaction = await page.evaluate(() => {
    const a = window.__higata; a.tank.scene.updateMatrixWorld(true); a.tank.camera.updateMatrixWorld(true);
    const p = a.tank.camera.position.clone().set(0, 1.03, 0).project(a.tank.camera);
    const poke = a.tank.pokeAt(p.x, p.y);
    const item = a.tank.addItem('stone_s'), target = a.tank.camera.position.clone().set(0.1, 0.78, 0.03).project(a.tank.camera);
    a.tank.moveItem(item.id, target.x, target.y);
    const decoration = a.tank.currentLayout.items.find((i) => i.id === item.id);
    const device = a.tank.equipment.devices.get('airStone'), hit = device.getWorldPosition(a.tank.camera.position.clone()); hit.y += 0.004; hit.project(a.tank.camera);
    return { poke, decoration, picked: a.tank.pickEquipment(hit.x, hit.y) };
  });
  assert.equal(interaction.poke, true); assert.ok(Math.abs(interaction.decoration.x - 0.1) < 0.001); assert.ok(Math.abs(interaction.decoration.z - 0.03) < 0.001); assert.equal(interaction.picked, 'airStone');
  console.log('raised coordinates, item replacement, multiple placement and automatic air connections passed');
  // Render one of main's new procedural species in the translated aquarium as a regression check.
  await page.evaluate(async () => {
    const a = window.__higata, species = a.data.species.get('rudarius_ercodes');
    const fish = { id: 'aquarium-smoke-fish', number: 1, speciesId: species.id, length_mm: 35, weight_g: 0.5, sex: 'f', stage: species.stages[0].id, traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 };
    a.encyclopedia.tankItems.value = [fish]; await a.tank.setOccupants([fish], (id) => a.data.species.get(id));
    a.tank.update(0.016, 1);
  });
  const fishFrame = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction((f) => window.__higata.frameCount >= f + 2, fishFrame);
  const fishHeight = await page.evaluate(() => { const a = window.__higata, o = a.tank.occupants[0]; return o.root.getWorldPosition(a.tank.camera.position.clone()).y; });
  assert.ok(fishHeight >= 0.73 && fishHeight <= 1.04);
  await page.getByRole('button', { name: '‹ 設備一覧', exact: true }).click();
  await page.getByRole('button', { name: '背面を見る', exact: true }).click();
  await page.evaluate(() => { for (let i = 0; i < 70; i++) window.__higata.tank.updateFrozen(); });
  const rearFrame = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction((f) => window.__higata.frameCount >= f + 2, rearFrame);
  await page.screenshot({ animations: 'disabled', path: new URL('aquarium-rear.png', output).pathname });
  await page.evaluate(() => window.__higata.writeSave());
  const saved = await page.evaluate(() => ({ layout: window.__higata.tank.currentLayout, collection: window.__higata.equipmentCollection.value, money: window.__higata.encyclopedia.money.value }));
  await page.reload(); await page.waitForFunction(() => !!window.__higata);
  await page.getByRole('button', { name: /つづきから/ }).click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.waitForFunction(() => window.__higata.tank.occupants.length === 1);
  const restored = await page.evaluate(() => ({ layout: window.__higata.tank.currentLayout, collection: window.__higata.equipmentCollection.value, money: window.__higata.encyclopedia.money.value }));
  assert.deepEqual(restored.layout.equipment.devices, saved.layout.equipment.devices); assert.deepEqual(restored.layout.equipment.connections, saved.layout.equipment.connections);
  assert.equal(restored.layout.equipment.standItemId, 'stand-studio'); assert.equal(restored.layout.equipment.tankItemId, 'tank-ivory');
  assert.deepEqual(restored.collection, saved.collection); assert.equal(restored.money, saved.money); assert.deepEqual(restored.layout.items, saved.layout.items);
  assert.equal(restored.collection.tickets, 0);
  await page.getByRole('button', { name: /ガチャ/ }).click(); await page.getByRole('heading', { name: '水槽設備ガチャ' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => { const e = document.querySelector('.gacha-panel').getBoundingClientRect(); return { left: e.left, right: e.right, bottom: e.bottom, width: innerWidth, height: innerHeight }; });
  assert.ok(mobile.left >= 0 && mobile.right <= mobile.width); assert.ok(mobile.bottom <= mobile.height);
  await page.screenshot({ animations: 'disabled', path: new URL('aquarium-gacha-mobile.png', output).pathname });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', equipment: restored.layout.equipment.devices.length, connections: restored.layout.equipment.connections.length, checks: ['73cm aquarium and floor offset', '18 item categories', 'unowned items blocked', '10 initial tickets', 'ticket spending, unchanged CR and reward quantities', 'gacha buttons and probabilities', 'model replacement', 'multiple air stones', 'automatic connections', 'light OFF/ON', 'placement and substrate', 'water picking and decoration dragging', 'new species in translated aquarium', 'IndexedDB collection, spent ticket balance and layout restoration', 'mobile layout', 'no shader/page errors'] }));
} finally { await browser?.close(); server.kill(); }
