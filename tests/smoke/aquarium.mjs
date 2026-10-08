#!/usr/bin/env node
// Build first. Exercises equipment editing, power propagation, routing, and IndexedDB restoration without loading fish.
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
  await page.getByText('木製キャビネット', { exact: true }).waitFor();
  const initial = await page.evaluate(() => { const r = window.__higata.tank.equipment; return { devices: r.devices.size, lights: r.lightLevel, edges: r.currentLayout.connections.length }; });
  assert.equal(initial.devices, 9); assert.equal(initial.lights, 1); assert.ok(initial.edges > 5);
  const substratePositions = await page.evaluate(() => {
    const app = window.__higata;
    app.tankSetSubstrate('none'); const bare = app.tank.equipment.currentLayout.devices.find((d) => d.id === 'airStone').position[1];
    app.tankSetSubstrate('sand'); const sand = app.tank.equipment.currentLayout.devices.find((d) => d.id === 'airStone').position[1];
    return { bare, sand };
  });
  assert.ok(Math.abs(substratePositions.bare - 0.004) < 1e-6); assert.ok(Math.abs(substratePositions.sand - 0.054) < 1e-6);
  await page.screenshot({ path: new URL('aquarium-front.png', output).pathname });
  await page.getByRole('button', { name: '金属フレーム', exact: true }).click();
  await page.locator('.equipment-card').filter({ hasText: '電源タップ' }).locator('summary').click();
  await page.locator('.equipment-card').filter({ hasText: '電源タップ' }).getByRole('button', { name: 'OFFにする', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__higata.tank.equipment.lightLevel), 0);
  await page.locator('.equipment-card').filter({ hasText: '電源タップ' }).getByRole('button', { name: 'ONにする', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__higata.tank.equipment.lightLevel), 1);
  await page.getByLabel('追加する設備').selectOption('flowPump'); await page.getByRole('button', { name: '追加', exact: true }).click();
  await page.getByRole('button', { name: '標準配線・配管に整える', exact: true }).click();
  const pumpId = await page.evaluate(() => window.__higata.tank.equipment.currentLayout.devices.find((d) => d.kind === 'flowPump').id);
  await page.evaluate((id) => window.__higata.tankChangeEquipment(id, { position: [0.25, 0.21, -0.06], rotation: 0.8, setting: 450 }), pumpId);
  // Exercise all remaining device shaders and meshes in the real application, then return to a realistic assembly.
  const extras = await page.evaluate(() => { const app = window.__higata; const kinds = ['lightFixture', 'filter', 'topFilter', 'spongeFilter', 'circulationPump', 'chiller']; return kinds.map((k) => app.tank.equipment.addDevice(k)); });
  const frame = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction((f) => window.__higata.frameCount >= f + 2, frame);
  await page.screenshot({ path: new URL('aquarium-all-equipment.png', output).pathname });
  await page.evaluate((ids) => { for (const id of ids) window.__higata.tankRemoveEquipment(id); }, extras);
  await page.getByRole('button', { name: '配管・背面を見る', exact: true }).click();
  // Advance only the camera tween in the paused editor; rendering 70 software-GL frames is unnecessary.
  await page.evaluate(() => { for (let i = 0; i < 70; i++) window.__higata.tank.updateFrozen(); });
  const rearFrame = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction((f) => window.__higata.frameCount >= f + 2, rearFrame);
  await page.screenshot({ path: new URL('aquarium-rear.png', output).pathname });
  await page.evaluate(() => window.__higata.writeSave());
  const saved = await page.evaluate(() => window.__higata.tank.equipment.currentLayout);
  await page.reload(); await page.waitForFunction(() => !!window.__higata);
  await page.getByRole('button', { name: /つづきから/ }).click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  const restored = await page.evaluate(() => window.__higata.tank.equipment.currentLayout);
  assert.equal(restored.stand, 'metal');
  assert.deepEqual(restored.devices, saved.devices); assert.deepEqual(restored.connections, saved.connections);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', equipment: restored.devices.length, connections: restored.connections.length, screenshots: ['aquarium-front.png', 'aquarium-all-equipment.png', 'aquarium-rear.png'], checks: ['equipment UI', 'power OFF/ON', 'substrate placement', 'device placement/flow setting', 'all models rendered', 'rear routing', 'IndexedDB restoration', 'no shader/page errors'] }));
} finally { await browser?.close(); server.kill(); }
