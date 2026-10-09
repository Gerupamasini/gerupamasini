#!/usr/bin/env node
// npm run build first. Uses real multi-touch events on the production build, with software WebGL.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = process.argv.includes('--field-only') ? 4183 : 4181;
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
  assert.equal(await page.locator('.mobile-home-tide .gauge > svg').count(), 1);
  assert.equal(await page.locator('.touch-view-hint, .home-hint, .home-almanac, .home-status').count(), 0);
  await page.keyboard.press('F3'); await page.evaluate(() => window.__higata.toggleDebug()); await frames();
  assert.equal(await page.locator('.debug-panel, .markers').count(), 0);
  assert.equal(await page.locator('.menu').count(), 0);
  await shot('home-portrait');
  let before, after;
  if (!process.argv.includes('--field-only')) {
  if (!process.argv.includes('--editor-only') && !process.argv.includes('--editor-lite')) {
  const locked = await pose();
  for (let i = 0; i < 2; i++) {
    await touch('touchStart', [{ id: 1, x: 200, y: 400 }]);
    await touch('touchMove', [{ id: 1, x: 230, y: 420 }]); await frames(); await touch('touchEnd');
  }
  same(locked.p, (await pose()).p); same(locked.q, (await pose()).q);
  const openCamera = async () => {
    await page.getByRole('button', { name: '視点移動', exact: true }).tap();
  };
  await openCamera();
  before = await pose();
  const up = await point(page.locator('[data-action="viewUp"]'));
  await touch('touchStart', [up]); await frames(5); await touch('touchEnd');
  after = await pose(); assert.ok(after.p[1] > before.p[1]); same(before.q, after.q);
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
  await page.getByRole('button', { name: '視点を閉じる', exact: true }).tap();
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await frames(1);
    await reachable('.home-nav button, .mobile-home-status button, .mobile-home-utility button, .mobile-home-tide');
    if (size.width === 568) await shot('home-small-landscape');
    if (size.width === 844) await shot('home-landscape');
    await page.getByRole('button', { name: 'UI非表示', exact: true }).tap();
    assert.equal(await page.locator('.home-nav, .mobile-home-status, .mobile-home-tide, .touch-home').count(), 0);
    await reachable('.mobile-home-restore');
    await page.getByRole('button', { name: 'UI表示', exact: true }).tap();
    await openCamera();
    await reachable('.home-nav button, .touch-controls button, .touch-stick');
    await page.getByRole('button', { name: '視点を閉じる', exact: true }).tap();
    await page.locator('.home-nav .nav-primary').tap();
    await page.locator('.mobile-spots-card').waitFor();
    await reachable('.mobile-spots-card button');
    assert.equal(await page.locator('.mobile-spots-card').evaluate((el) => el.scrollHeight > el.clientHeight + 1), false);
    assert.deepEqual(await page.locator('.mobile-spot').evaluateAll((buttons) => buttons.flatMap((button) => {
      const r = button.getBoundingClientRect();
      return [...button.children].filter((child) => { const c = child.getBoundingClientRect(); return c.top < r.top || c.bottom > r.bottom + 1; }).map((child) => child.textContent);
    })), []);
    assert.equal(await page.locator('.mobile-spots-card .mobile-spot').count(), 2);
    assert.equal(await page.locator('.mobile-spots-card .spots-maps svg').count(), 2);
    await page.locator('.mobile-spot').last().tap();
    assert.equal(await page.locator('.mobile-spot').last().getAttribute('aria-pressed'), 'true');
    await page.locator('.mobile-spot').first().tap();
    if (size.width === 390) await shot('spots-portrait');
    if (size.width === 568) await shot('spots-landscape');
    await page.locator('.mobile-spots-card').getByLabel('閉じる', { exact: true }).tap();
    await page.waitForFunction(() => window.__higata.mode === 'home');
  }
  console.log('PASS home camera enable/lock, gestures, UI hide/restore, all seven buttons and maps at four sizes');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '道具', exact: true }).tap();
  await page.locator('.tools-drawer').waitFor();
  await page.getByRole('button', { name: 'UI非表示', exact: true }).tap();
  assert.equal(await page.locator('.tools-drawer, .home-nav').count(), 0);
  await page.getByRole('button', { name: 'UI表示', exact: true }).tap();
  await page.locator('.tools-drawer').waitFor();
  await page.getByRole('button', { name: '視点移動', exact: true }).tap();
  await page.locator('.touch-stick').waitFor();
  assert.equal(await page.locator('.tools-drawer').count(), 0);
  await page.waitForFunction(() => window.__higata.tank.camT >= 1);
  await page.getByRole('button', { name: '視点を閉じる', exact: true }).tap();
  await page.evaluate(async (lite) => {
    const a = window.__higata, sp = a.data.species.get('acanthogobius_flavimanus');
    const record = (id, number) => ({ id, number, speciesId: sp.id, length_mm: 50 + number * 5, weight_g: 8, sex: 'f', stage: sp.stages[0].id, traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 });
    a.encyclopedia.caseItems.value = Array.from({ length: 6 }, (_, i) => record(`mobile-case-${i}`, i + 1));
    const tank = record('mobile-tank', 1);
    if (!lite) {
      a.encyclopedia.tankItems.value = [tank];
      await a.tank.setOccupants([tank], (id) => a.data.species.get(id));
    }
  }, process.argv.includes('--editor-lite'));
  const homeView = await pose();
  await page.getByRole('button', { name: '水槽', exact: true }).tap();
  await page.waitForFunction(() => window.__higata.mode === 'tankEdit');
  await page.locator('.specimen-source button').last().tap();
  await page.locator('.mobile-specimen').last().tap();
  await page.waitForFunction(() => document.querySelector('.mobile-specimen:last-child')?.getAttribute('aria-pressed') === 'true');
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await frames(1);
    assert.equal(await page.locator('.mobile-specimen').count(), 6);
    await reachable('.tank-editor-panel .drawer-head button, .mobile-specimen-actions button');
    if (size.width === 390 && !process.argv.includes('--editor-lite')) await shot('tank-fish-portrait');
  }
  console.log('PASS tank specimen actions at four sizes');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '設備', exact: true }).tap();
  await page.getByLabel('設備の種類').selectOption('3');
  await page.locator('[data-category="airStone"]').tap();
  await page.getByLabel('設備のX (cm)').fill('12'); await page.getByLabel('設備のX (cm)').press('Tab');
  assert.ok(await page.evaluate(() => window.__higata.tank.equipment.currentLayout.devices.some((d) => d.kind === 'airStone' && d.position[0] === .12)));
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await frames(1);
    await page.locator('.drawer-body').evaluate((el) => { el.scrollTop = 0; });
    await reachable('.equipment-back, .equipment-tabs button, .equipment-position input, .equipment-actions button');
    if (size.width === 390) await shot('tank-edit');
    if (size.width === 568) await shot('tank-edit-landscape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'デザイン', exact: true }).tap();
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await frames(1);
    await page.locator('.drawer-body').evaluate((el) => { el.scrollTop = 0; });
    await reachable('.equipment-choices button, .equipment-actions button');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.equipment-choice').last().tap();
  assert.equal(await page.locator('.equipment-actions button').first().isDisabled(), true);
  await page.locator('.equipment-choice').first().tap();
  await page.getByRole('button', { name: '位置・向き', exact: true }).tap();
  await page.getByRole('button', { name: '水槽を見る', exact: true }).tap();
  await page.locator('.sheet-collapsed').waitFor();
  await reachable('.drawer-head button');
  await page.getByRole('button', { name: '編集を表示', exact: true }).tap();
  await page.getByLabel('閉じる', { exact: true }).tap();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  const restoredHome = await pose();
  same(homeView.p, restoredHome.p); same(homeView.q, restoredHome.q);
  await page.evaluate(() => { window.__higata.encyclopedia.caseItems.value = []; });
  await page.getByRole('button', { name: 'ガチャ', exact: true }).tap();
  await page.waitForFunction(() => window.__higata.mode === 'gacha');
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await frames(1);
    await reachable('.gacha-head button, .gacha-draw button');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^1回引く/ }).tap();
  await page.locator('.gacha-result').waitFor();
  assert.equal(await page.evaluate(() => window.__higata.equipmentCollection.value.tickets), 9);
  await shot('gacha');
  await page.locator('.gacha-head button').tap(); await page.waitForFunction(() => window.__higata.mode === 'home');
  console.log('PASS compact mobile home + destination selector without scrolling, pinch, height buttons, four sizes, equipment and gacha; debug absent');

  }
  if (process.argv.includes('--layout-only') || process.argv.includes('--editor-only') || process.argv.includes('--editor-lite')) {
    assert.deepEqual(errors, []);
    console.log('PASS layout checks; use the default command for field gameplay checks');
  } else {

  await page.locator('.home-nav .nav-primary').tap();
  await page.locator('.spot-go').tap();
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
  assert.equal(await page.locator('.hud-cb, .prompt, .hud-tools, .hud-tr').count(), 0);
  assert.equal(await page.locator('.touch-actions button').count(), 5);
  assert.equal(await page.locator('.mobile-field-tide .gauge > svg, .mobile-minimap canvas').count(), 2);
  const posture = await page.evaluate(() => window.__higata.player.lowView);
  await page.locator('[data-action="crouch"]').tap(); await frames();
  assert.equal(await page.evaluate(() => window.__higata.player.lowView), !posture);
  const run = await point(page.locator('[data-action="run"]'), 2);
  await touch('touchStart', [walking, run]); await frames();
  assert.equal(await page.evaluate(() => window.__higata.player.running), true);
  await touch('touchEnd'); await frames();
  assert.equal(await page.evaluate(() => window.__higata.player.running), false);
  await page.getByRole('button', { name: 'メニュー', exact: true }).tap();
  await reachable('.touch-more button, .touch-actions button, .touch-toolbar button, .touch-stick');
  const zoom = await point(page.locator('[data-action="zoom"]'));
  await touch('touchStart', [zoom]); await frames(4);
  assert.equal(await page.evaluate(() => window.__higata.player.zooming), true);
  await touch('touchCancel'); await frames();
  assert.equal(await page.evaluate(() => window.__higata.player.zooming), false);
  await page.locator('.touch-toolbar button').tap();
  await page.locator('[data-action="interact"]').tap();
  await page.waitForFunction(() => window.__higata.mode === 'capture');
  assert.equal(await page.evaluate(() => window.__higata.input.moveForward), 0);
  await page.waitForFunction(() => window.__higata.mode === 'field');
  // Deterministic real bivalve drivers: one shell on the sand, one buried at the same reach.
  // Use the normal swing, removal and case-record pipeline; only the spawn/pose is fixed.
  const fixture = await page.evaluate(() => {
    const a = window.__higata, c = a.creatures, p = a.player;
    const sp = a.data.species.get('meretrix_lusoria');
    p.setPose(p.position.x, p.position.z, 0, 0);
    const z = p.position.z - .7, y = a.world.terrain.heightAt(p.position.x, z);
    p.setPose(p.position.x, p.position.z, 0, Math.atan2(y + .01 - a.camera.position.y, .7));
    const ids = [];
    for (const [seed, surface, dx] of [[9123, true, -.04], [9124, false, .04]]) {
      const ind = c.spawner.create({ species: sp, seed, ruleIndex: 0, cell: -1, x: p.position.x + dx, z, pitId: -2, lengthRange: [60, 60] }, a.clock.nowGame());
      ind.brain.nextTick = Infinity;
      c.spawn(ind);
      const e = c.entries.get(ind.id), root = c.group.clone(false);
      root.userData.startOnSurface = surface;
      e.driver.attach(root, ind, {}, {}, []);
      if (!surface) e.driver.beh.burial = 1;
      c.group.add(root);
      e.view = { root, tier: 'placeholder', model: null, radius: .06, hero: null };
      e.driver.update(0, { floor: c.floor, player: p.position, simScale: 0, nowMs: a.clock.nowGame() });
      // Pause only these behaviours so slow software rendering cannot let the exposed one bury between taps.
      e.driver.update = () => {};
      ids.push(ind.id);
    }
    const hits = a.netZoneHits().map((h) => h.ind.id);
    if (!hits.includes(ids[0]) || hits.includes(ids[1])) throw new Error(`Bivalve eligibility: ${JSON.stringify({ ids, hits })}`);
    return { ids, count: a.encyclopedia.caseItems.value.length };
  });
  await page.locator('[data-action="interact"]').tap();
  await page.waitForFunction(() => window.__higata.mode === 'capture');
  assert.ok(await page.evaluate((id) => window.__higata.capture.catches.some((i) => i.id === id), fixture.ids[0]));
  await page.waitForFunction(() => window.__higata.mode === 'field');
  assert.equal(await page.evaluate((id) => !!window.__higata.creatures.get(id), fixture.ids[0]), false);
  assert.equal(await page.evaluate((id) => !!window.__higata.creatures.get(id), fixture.ids[1]), true);
  assert.ok(await page.evaluate((count) => window.__higata.encyclopedia.caseItems.value.length > count && window.__higata.encyclopedia.caseItems.value.some((r) => r.speciesId === 'meretrix_lusoria'), fixture.count));
  await page.evaluate((id) => window.__higata.creatures.despawn(id), fixture.ids[1]);
  console.log('PASS exposed hamaguri caught by net and added to case; buried hamaguri excluded');
  await page.getByRole('button', { name: 'メニュー', exact: true }).tap();
  await page.getByRole('button', { name: '地図', exact: true }).tap();
  await page.locator('.map-card').waitFor(); assert.equal(await page.locator('.touch-stick').count(), 0);
  assert.equal(await page.evaluate(() => window.__higata.input.blocked), true);
  await page.getByLabel('閉じる', { exact: true }).tap(); await page.locator('.map-card').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'ケース', exact: true }).tap();
  await page.waitForFunction(() => window.__higata.mode === 'caseView');
  await page.evaluate(async () => {
    const a = window.__higata, r = a.encyclopedia.caseItems.value[0];
    a.encyclopedia.caseItems.value = Array.from({ length: 6 }, (_, i) => ({ ...r, id: `case-layout-${i}`, number: i + 1 }));
    await a.fieldCase.setOccupants(a.encyclopedia.caseItems.value, (id) => a.data.species.get(id));
  });
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await frames(1);
    assert.equal(await page.locator('.mobile-specimen').count(), 6);
    await page.locator('.mobile-specimen').last().tap();
    await page.waitForFunction(() => document.querySelector('.mobile-specimen:last-child')?.getAttribute('aria-pressed') === 'true');
    await reachable('.case-drawer button');
    assert.equal(await page.locator('.case-drawer .drawer-body').evaluate((el) => el.scrollHeight > el.clientHeight + 1), false);
    const centre = await page.evaluate(() => {
      const a = window.__higata, center = a.caseControls.target.clone().project(a.camera);
      return { x: (center.x + 1) * innerWidth / 2, y: (1 - center.y) * innerHeight / 2, view: a.camera.view?.enabled };
    });
    const panel = await page.locator('.case-drawer').boundingBox();
    assert.ok(centre.view && centre.x > 0 && centre.y > 0);
    assert.ok(size.width > size.height ? centre.x < panel.x : centre.y < panel.y);
    if (size.width === 390) await shot('case-portrait');
    if (size.width === 568) await shot('case-landscape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.case-drawer .drawer-head button').tap();
  assert.equal(await page.evaluate(() => window.__higata.camera.view?.enabled ?? false), false); await page.waitForFunction(() => window.__higata.mode === 'field');
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
  await page.locator('.touch-tool-select > button').tap();
  await reachable('.touch-tool-options button');
  await page.locator('.touch-tool-options button').last().tap();
  await page.locator('.touch-tool-select > button').tap();
  await page.locator('.touch-tool-options button').first().tap();
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await frames(1);
    await reachable('.touch-controls button, .touch-stick, .mobile-minimap');
    await page.getByRole('button', { name: 'メニュー', exact: true }).tap();
    await reachable('.touch-more button, .touch-actions button, .touch-tool-select > button, .touch-toolbar button, .touch-stick, .mobile-minimap');
    if (size.width === 320) await shot('field-menu-small');
    if (size.width === 844) await shot('field-menu-landscape');
    await page.locator('.touch-toolbar button').tap();
    if (size.width === 844) await shot('field-landscape');
  }
  await page.getByRole('button', { name: 'メニュー', exact: true }).tap();
  await page.getByRole('button', { name: '設定', exact: true }).tap();
  assert.equal(await page.locator('.menu').getByText('デバッグ', { exact: false }).count(), 0);
  assert.equal(await page.evaluate(() => window.__higata.input.moveRight), 0);
  await reachable('.menu .card-head button');
  const sensitivity = page.locator('.menu input[type=range]').first();
  assert.equal(await sensitivity.getAttribute('max'), '10');
  await sensitivity.evaluate((el) => { el.value = '10'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => window.__higata.settings.mouseSensitivity === 10);
  await page.locator('.menu .buttons').scrollIntoViewIfNeeded();
  await reachable('.menu .buttons button');
  assert.deepEqual(errors, []);
  console.log('PASS mobile movement + simultaneous camera drag, release/cancel, posture, zoom, capture, map, case, observation, landscape and menu; no page/shader errors');
  }
} finally { await browser?.close(); server.kill(); }
