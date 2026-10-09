#!/usr/bin/env node
// npm run build first. Uses real multi-touch events on the production build, with software WebGL.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4181;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const shots = new URL('../../docs/mobile/screenshots/', import.meta.url);
await mkdir(shots, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* startup */ }
    if (i === 59) throw new Error('Mobile preview did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const frames = async (n = 3) => {
    const f = await page.evaluate(() => window.__higata.frameCount);
    await page.waitForFunction(({ f, n }) => window.__higata.frameCount >= f + n, { f, n });
  };
  const shot = (name) => page.screenshot({ path: new URL(`${name}.png`, shots).pathname });
  const point = async (locator, id = 1) => {
    const r = await locator.boundingBox(); assert.ok(r);
    return { id, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const touch = (type, points = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const pose = () => page.evaluate(() => ({ p: window.__higata.tank.camera.position.toArray(), q: window.__higata.tank.camera.quaternion.toArray() }));
  const same = (a, b) => assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-7), `${a} vs ${b}`);
  const reachable = async (selector) => {
    const failures = await page.locator(selector).evaluateAll((elements) => elements.flatMap((el) => {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return [];
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.x < 0 || r.y < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || !el.contains(hit)
        ? [{ text: el.textContent, rect: r.toJSON(), hit: hit?.className }] : [];
    }));
    assert.deepEqual(failures, [], selector);
  };

  await page.goto(`${url}?debug=1`);
  await page.locator('.title-screen').waitFor();
  assert.equal(await page.evaluate(() => window.__higata.input.touchDevice), true);
  assert.equal(await page.evaluate(() => window.__higata.settings.quality), 'low');
  await page.locator('.title-actions .primary').tap();
  await page.waitForFunction(() => window.__higata.mode === 'home'); await frames();
  await page.locator('.home-nav').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await reachable('.home-nav button, .touch-controls button, .touch-stick');
  assert.equal(await page.locator('.home-nav button').count(), 7);
  await page.keyboard.press('F3'); await page.evaluate(() => window.__higata.toggleDebug()); await frames();
  assert.equal(await page.locator('.debug-panel, .markers').count(), 0);
  assert.equal(await page.locator('.menu').count(), 0);
  await shot('home-portrait');
  let before = await pose();
  const up = await point(page.locator('[data-action="viewUp"]'));
  await touch('touchStart', [up]); await frames(5); await touch('touchEnd');
  let after = await pose(); assert.ok(after.p[1] > before.p[1]); same(before.q, after.q);
  await frames(); same(after.p, (await pose()).p);
  const down = await point(page.locator('[data-action="viewDown"]'));
  await touch('touchStart', [down]); await frames(4); await touch('touchCancel');
  after = await pose(); await frames(); same(after.p, (await pose()).p);
  await page.getByRole('button', { name: '視点リセット', exact: true }).tap();
  before = await pose();
  await touch('touchStart', [{ id: 1, x: 170, y: 400 }]);
  await touch('touchMove', [{ id: 1, x: 215, y: 420 }]); await frames(); await touch('touchEnd');
  after = await pose(); assert.ok(after.q.some((v, i) => Math.abs(v - before.q[i]) > 1e-4));
  await frames(); same(after.p, (await pose()).p); same(after.q, (await pose()).q);
  assert.equal(await page.evaluate(() => window.__higata.mode), 'home');
  // Pinch must zoom without a false object tap or an edit-screen transition.
  await page.getByRole('button', { name: '視点リセット', exact: true }).tap();
  before = await pose();
  await touch('touchStart', [{ id: 1, x: 155, y: 400 }, { id: 2, x: 235, y: 400 }]);
  await touch('touchMove', [{ id: 1, x: 130, y: 400 }, { id: 2, x: 260, y: 400 }]); await frames(); await touch('touchEnd');
  after = await pose(); assert.ok(after.p.some((v, i) => Math.abs(v - before.p[i]) > 0.01));
  assert.equal(await page.evaluate(() => window.__higata.mode), 'home');
  for (const size of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await frames();
    await reachable('.home-nav button, .touch-controls button, .touch-stick');
    if (size.width === 568) await shot('home-small-landscape');
  }
  await shot('home-landscape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '視点リセット', exact: true }).tap();
  await page.getByRole('button', { name: '水槽', exact: true }).tap();
  await page.waitForFunction(() => window.__higata.mode === 'tankEdit');
  await page.getByRole('button', { name: '設備', exact: true }).tap();
  await page.locator('[data-category="airStone"]').tap();
  await page.getByLabel('設備のX (cm)').fill('12'); await page.getByLabel('設備のX (cm)').press('Tab');
  assert.ok(await page.evaluate(() => window.__higata.tank.equipment.currentLayout.devices.some((d) => d.kind === 'airStone' && d.position[0] === .12)));
  await page.locator('.drawer-body').evaluate((el) => { el.scrollTop = 0; });
  await shot('tank-edit');
  await page.getByRole('button', { name: '水槽を見る', exact: true }).tap();
  await page.locator('.sheet-collapsed').waitFor();
  await reachable('.drawer-head button');
  await page.getByRole('button', { name: '編集を表示', exact: true }).tap();
  await page.getByLabel('閉じる', { exact: true }).tap();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.getByRole('button', { name: 'ガチャ', exact: true }).tap();
  await page.waitForFunction(() => window.__higata.mode === 'gacha');
  await page.getByRole('button', { name: /^1回引く/ }).tap();
  await page.locator('.gacha-result').waitFor();
  assert.equal(await page.evaluate(() => window.__higata.equipmentCollection.value.tickets), 9);
  await shot('gacha');
  await page.locator('.gacha-head button').tap(); await page.waitForFunction(() => window.__higata.mode === 'home');
  console.log('PASS mobile home, pinch, height buttons, four sizes, equipment and gacha; debug absent');

  if (process.argv.includes('--layout-only')) {
    assert.deepEqual(errors, []);
    console.log('PASS layout checks; use the default command for field gameplay checks');
  } else {

  await page.locator('.home-nav .nav-primary').tap();
  await page.locator('.spots-detail .primary').tap();
  await page.waitForFunction(() => window.__higata.mode === 'field', null, { timeout: 240000 });
  await frames();
  assert.equal(await page.locator('.ready').count(), 0);
  await reachable('.touch-controls button, .touch-stick, .hud-tools button');
  await shot('field-portrait');
  const stick = await point(page.locator('.touch-stick'));
  const location = () => page.evaluate(() => ({ p: window.__higata.player.position.toArray(), yaw: window.__higata.player.yaw, pitch: window.__higata.player.pitch }));
  before = await location();
  await touch('touchStart', [stick]);
  const walking = { ...stick, y: stick.y - 34 };
  await touch('touchMove', [walking]); await frames(5);
  // Simultaneous right-hand camera drag while the left stick continues moving.
  await touch('touchStart', [walking, { id: 2, x: 235, y: 390 }]);
  await touch('touchMove', [walking, { id: 2, x: 270, y: 370 }]); await frames(4);
  await touch('touchEnd'); await frames(); after = await location();
  assert.ok(Math.hypot(after.p[0] - before.p[0], after.p[2] - before.p[2]) > .05);
  assert.ok(Math.abs(after.yaw - before.yaw) > .01 && Math.abs(after.pitch - before.pitch) > .01);
  await frames(); const stopped = await location(); same([after.p[0], after.p[2]], [stopped.p[0], stopped.p[2]]);
  const posture = await page.evaluate(() => window.__higata.player.lowView);
  await page.locator('[data-action="crouch"]').tap(); await frames();
  assert.equal(await page.evaluate(() => window.__higata.player.lowView), !posture);
  const run = await point(page.locator('[data-action="run"]'), 2);
  await touch('touchStart', [walking, run]); await frames();
  assert.equal(await page.evaluate(() => window.__higata.player.running), true);
  await touch('touchEnd'); await frames();
  assert.equal(await page.evaluate(() => window.__higata.player.running), false);
  const zoom = await point(page.locator('[data-action="zoom"]'));
  await touch('touchStart', [zoom]); await frames(4);
  assert.equal(await page.evaluate(() => window.__higata.player.zooming), true);
  await touch('touchCancel'); await frames();
  assert.equal(await page.evaluate(() => window.__higata.player.zooming), false);
  await page.locator('[data-action="interact"]').tap();
  await page.waitForFunction(() => window.__higata.mode === 'capture');
  assert.equal(await page.evaluate(() => window.__higata.input.moveForward), 0);
  await page.waitForFunction(() => window.__higata.mode === 'field');
  await page.getByRole('button', { name: 'その他', exact: true }).tap();
  await page.getByRole('button', { name: '地図', exact: true }).tap();
  await page.locator('.map-card').waitFor(); assert.equal(await page.locator('.touch-stick').count(), 0);
  assert.equal(await page.evaluate(() => window.__higata.input.blocked), true);
  await page.getByLabel('閉じる', { exact: true }).tap(); await page.locator('.map-card').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'ケース', exact: true }).tap();
  await page.waitForFunction(() => window.__higata.mode === 'caseView');
  await page.locator('.case-drawer .drawer-head button').tap(); await page.waitForFunction(() => window.__higata.mode === 'field');
  // Fix the target to a real animal so its motion does not make a UI input check random.
  await page.evaluate(() => {
    const a = window.__higata, ind = a.creatures.individuals.find((i) => i.species.collectable);
    if (!ind) throw new Error('No animal for observation');
    window.__mobilePickOriginal = a.creatures.pickTarget; a.creatures.pickTarget = () => ind;
  });
  await frames(); await page.locator('[data-action="observe"]').tap();
  await page.waitForFunction(() => window.__higata.mode === 'observe');
  await page.evaluate(() => { window.__higata.creatures.pickTarget = window.__mobilePickOriginal; });
  await page.locator('.observe-bottom .seg button').first().tap();
  assert.equal(await page.evaluate(() => window.__higata.observation.speed), .25);
  await page.getByRole('button', { name: '観察を終了', exact: true }).tap();
  await page.waitForFunction(() => window.__higata.mode === 'field');
  await page.setViewportSize({ width: 844, height: 390 }); await frames();
  await reachable('.touch-controls button, .touch-stick, .hud-tools button'); await shot('field-landscape');
  await page.getByRole('button', { name: 'メニュー', exact: true }).tap();
  assert.equal(await page.locator('.menu').getByText('デバッグ', { exact: false }).count(), 0);
  assert.equal(await page.evaluate(() => window.__higata.input.moveRight), 0);
  await reachable('.menu .card-head button');
  await page.locator('.menu .buttons').scrollIntoViewIfNeeded();
  await reachable('.menu .buttons button');
  assert.deepEqual(errors, []);
  console.log('PASS mobile movement + simultaneous camera drag, release/cancel, posture, zoom, capture, map, case, observation, landscape and menu; no page/shader errors');
  }
} finally { await browser?.close(); server.kill(); }
