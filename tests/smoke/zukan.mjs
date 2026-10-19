import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4199;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const shots = new URL('../../docs/zukan/', import.meta.url);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(url)).ok) break; } catch { /* starting */ }
    if (n > 50) throw new Error('Preview did not start');
    await new Promise(r => setTimeout(r, 200));
  }
  await mkdir(shots, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error' && /shader|WebGLProgram/i.test(msg.text())) errors.push(msg.text()); });
  await page.addInitScript(() => localStorage.setItem('higata.quality', 'minimal'));
  await page.goto(url); await page.locator('.title-screen').waitFor();
  await page.locator('.title-actions .primary').click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(async () => {
    const a = window.__higata;
    await a.updateSettings({ homeQuality: 'minimal', fieldQuality: 'minimal', fieldAuto: false });
    const ids = ['acanthogobius_flavimanus', 'exopalaemon_orientis', 'palaemon_pacificus', 'ruditapes_philippinarum', 'reticunassa_festiva'];
    const entries = {};
    for (const id of ids) entries[id] = { discovered: Date.now(), observed: Date.now(), behaviors: {}, individuals: [], nextNumber: 1 };
    const goby = entries.acanthogobius_flavimanus;
    goby.behaviors[a.data.species.get('acanthogobius_flavimanus').encyclopedia.behaviors[0].id] = Date.now();
    goby.captured = Date.now(); goby.nextNumber = 2;
    goby.individuals = [{ id: 'guide-fixture', speciesId: 'acanthogobius_flavimanus', number: 1, length_mm: 90, weight_g: 8, sex: 'm', stage: 'subadult', traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 }];
    a.encyclopedia.progress.value = entries;
    window.guideRecords = JSON.stringify(entries);
    a.openOverlay('zukan');
  });
  const item = id => page.locator(`.zukan-item[data-species="${id}"]`);
  const query = page.getByRole('searchbox', { name: '生物名を検索' });
  const map = page.getByLabel('干潟で絞り込む');
  const taxon = page.getByLabel('生物の分類');
  const status = page.getByLabel('発見状況', { exact: true });
  const reset = () => page.getByRole('button', { name: '絞り込み解除', exact: true }).click();
  const count = () => page.locator('.zukan-item').count();
  await page.locator('.zukan-photo').waitFor();
  await page.waitForFunction(() => document.querySelector('.zukan-photo')?.naturalWidth > 0);
  const total = await count(); assert.equal(total, 19);
  await page.waitForFunction(() => !document.querySelector('.toast'));
  await page.screenshot({ animations: 'disabled', path: new URL('desktop.png', shots).pathname });
  await map.selectOption('hashirimizu');
  assert.equal(await item('palaemon_pacificus').count(), 1);
  assert.equal(await item('gymnogobius_macrognathos').count(), 0);
  assert.equal(await item('crassostrea_gigas').count(), 0);
  await taxon.selectOption('crustacean'); await status.selectOption('known');
  assert.equal(await count(), 2);
  await query.fill('いそすじ'); assert.equal(await count(), 1);
  await reset(); assert.equal(await count(), total);
  await map.selectOption('manko'); assert.equal(await count(), 0);
  await page.getByText('該当するいきものがいません', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'すべて表示', exact: true }).click();
  assert.equal(await count(), total);
  await item('charadrius_alexandrinus').click();
  assert.equal(await page.locator('.zukan-detail h3').innerText(), 'シロチドリ');
  assert.equal(await page.locator('.zukan-detail :is(img,canvas,.habitat,.behaviors,.tags,.sci)').count(), 0);
  assert.equal(await item('charadrius_alexandrinus').locator('img,.status-dots').count(), 0);
  await query.fill('Charadrius'); assert.equal(await count(), 0);
  await reset();
  await item('acanthogobius_flavimanus').click();
  await page.locator('.zukan-sections').getByRole('button', { name: /^行動/ }).click();
  assert.equal(await page.locator('.behaviors button:enabled').count(), 1);
  await page.locator('.behaviors button:enabled').click(); await page.locator('.beh-note').waitFor();
  await page.locator('.zukan-sections').getByRole('button', { name: /^採集/ }).click();
  assert.match(await page.locator('.ind-table').innerText(), /9\.0 cm/);
  await query.focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => window.__higata.mode), 'zukan');
  assert.equal(await taxon.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__higata.mode === 'home');
  console.log('PASS desktop classification/map/status/search, unknown privacy, records and keyboard');

  // Full 3D preview survives species changes, unknown transitions and quality changes.
  await page.evaluate(async () => { const a = window.__higata; await a.updateSettings({ homeQuality: 'low' }); a.openOverlay('zukan'); });
  await page.waitForFunction(() => document.querySelector('canvas.zukan-preview') && !document.querySelector('.zukan-detail [role="status"], .preview-error'));
  await item('palaemon_pacificus').click();
  await page.waitForFunction(() => document.querySelector('.zukan-detail h3')?.textContent === 'イソスジエビ' && !document.querySelector('.zukan-detail [role="status"], .preview-error'));
  await page.waitForTimeout(500); // settle the real WebGL frame
  await page.screenshot({ animations: 'disabled', path: new URL('desktop-3d.png', shots).pathname });
  await item('charadrius_alexandrinus').click(); assert.equal(await page.locator('canvas.zukan-preview').count(), 0);
  await item('acanthogobius_flavimanus').click();
  await page.waitForFunction(() => document.querySelector('canvas.zukan-preview') && !document.querySelector('.zukan-detail [role="status"], .preview-error'));
  await page.evaluate(async () => { await window.__higata.updateSettings({ homeQuality: 'minimal' }); window.__higata.closeOverlay(); });
  assert.equal(await page.evaluate(() => JSON.stringify(window.__higata.encyclopedia.progress.value) === window.guideRecords), true, 'Browsing must preserve species and individual records');
  await page.evaluate(() => window.__higata.openOverlay('zukan'));
  await item('acanthogobius_flavimanus').click();
  await page.locator('.zukan-sections').getByRole('button', { name: '履歴', exact: true }).click();
  await page.locator('.history-legacy').waitFor();
  await page.locator('.zukan-sections').getByRole('button', { name: '生態', exact: true }).click();
  await page.locator('.encounter-conditions summary').click();
  await page.getByLabel('条件を確認する干潟').selectOption('hashirimizu');
  assert.equal(await page.locator('.condition-seasons .on').allTextContents().then(labels => labels.includes('冬')), false);
  await page.locator('.encounter-conditions').scrollIntoViewIfNeeded();
  await page.screenshot({ animations: 'disabled', path: new URL('conditions.png', shots).pathname });
  await page.locator('.encounter-conditions summary').click();
  await item('charadrius_alexandrinus').click();
  await page.getByRole('button', { name: 'しおりを挟む', exact: true }).click();
  assert.equal(await page.evaluate(() => !!window.__higata.encyclopedia.progress.value.charadrius_alexandrinus.discovered), false);
  await page.locator('.guide-bookmark-tab').click(); assert.equal(await count(), 1);
  assert.equal(await page.locator('.zukan-detail :is(img,canvas,.sci,.habitat,.encounter-conditions)').count(), 0);
  await page.getByRole('button', { name: 'しおりを外す', exact: true }).click();
  await page.getByText('しおりはまだありません', { exact: true }).waitFor();
  await page.getByRole('button', { name: '図鑑を見る', exact: true }).click();
  await item('acanthogobius_flavimanus').click(); await page.getByRole('button', { name: 'しおりを挟む', exact: true }).click();
  await item('charadrius_alexandrinus').click(); await page.getByRole('button', { name: 'しおりを挟む', exact: true }).click();
  await page.evaluate(async () => {
    const a = window.__higata, species = a.data.species.get('acanthogobius_flavimanus');
    const first = Date.parse('2030-07-12T05:30:00+09:00');
    a.encyclopedia.onObserved({ species, sex: 'unknown' }, first, 'kasai_west');
    a.encyclopedia.onObserved({ species, sex: 'unknown' }, first + 3600000, 'hashirimizu');
    a.encyclopedia.onCaptured({ id: 'guide-new-catch', species, length_mm: 70, weight_g: 5, sex: 'unknown', stage: 'juvenile', traits: [], pos: a.camera.position.clone().set(1, 0, 2) }, first + 7200000, 0.2, 'hashirimizu');
    await a.writeSave();
    const exported = a.exportSave(); await a.importSave(exported);
  });
  await page.reload(); await page.locator('.title-screen').waitFor();
  await page.locator('.title-actions .primary').click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(() => window.__higata.openOverlay('zukan'));
  await page.locator('.guide-bookmark-tab').click(); assert.equal(await count(), 2);
  await item('acanthogobius_flavimanus').click();
  await page.locator('.zukan-sections').getByRole('button', { name: '履歴', exact: true }).click();
  assert.equal(await page.locator('.history-place').count(), 2);
  assert.equal(await page.locator('.zukan-detail :is(canvas.zukan-preview, img.zukan-photo)').count(), 0, 'History gives the space to records and releases the preview');
  assert.match(await page.locator('.encounter-history').innerText(), /2030\/7\/12 05:30/);
  assert.match(await page.locator('.history-place').nth(1).innerText(), /採集 1回/);
  await page.screenshot({ animations: 'disabled', path: new URL('bookmarks-history.png', shots).pathname });
  await map.selectOption('hashirimizu'); await page.getByRole('button', { name: '出会った生物', exact: true }).click();
  assert.equal(await count(), 1); assert.equal(await item('acanthogobius_flavimanus').count(), 1);
  await reset(); await page.locator('.guide-tabs').getByRole('button', { name: '図鑑', exact: true }).click();
  await item('acanthogobius_flavimanus').click();
  await page.locator('.zukan-sections').getByRole('button', { name: /^採集/ }).click();
  assert.match(await page.locator('.ind-table').innerText(), /干潟不明/);
  assert.match(await page.locator('.ind-table').innerText(), /走水/);
  if (process.argv.includes('--field')) {
    await page.evaluate(async () => { const a = window.__higata; a.closeOverlay(); await a.enterField('hashirimizu'); });
    await page.waitForFunction(() => window.__higata.mode === 'field');
    const result = await page.evaluate(async () => {
      const a = window.__higata; a.forceSpawn();
      const ind = a.creatures.individuals.find(ind => ind.species.collectable && ind.species.id === 'acanthogobius_flavimanus');
      if (!ind) throw new Error('Field did not spawn a goby for encounter integration');
      const before = a.encyclopedia.progress.value[ind.species.id]?.encounters?.hashirimizu;
      a.enterObserve(ind); a.onCaptureResolved([ind]);
      const after = a.encyclopedia.progress.value[ind.species.id]?.encounters?.hashirimizu;
      const rec = a.encyclopedia.caseItems.value.find(r => r.id === ind.id);
      await a.enterHome();
      return { observations: after.observations - (before?.observations ?? 0), captures: after.captures - (before?.captures ?? 0), map: rec?.caughtMap };
    });
    assert.deepEqual(result, { observations: 1, captures: 1, map: 'hashirimizu' });
    console.log('PASS live field observe/capture callbacks record the actual map');
  }
  console.log('PASS ribbon bookmarks, unknown bookmarks, conditions, per-map history, export/import + reload and legacy records');
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const mp = await mobile.newPage(); mp.setDefaultTimeout(60000);
  mp.on('pageerror', e => errors.push(e.message));
  mp.on('console', msg => { if (msg.type() === 'error' && /shader|WebGLProgram/i.test(msg.text())) errors.push(msg.text()); });
  await mp.addInitScript(() => localStorage.setItem('higata.quality', 'minimal'));
  await mp.goto(url); await mp.locator('.title-screen').waitFor();
  await mp.locator('.title-actions .primary').click();
  await mp.waitForFunction(() => window.__higata.mode === 'home');
  await mp.evaluate(async () => {
    const a = window.__higata; await a.updateSettings({ homeQuality: 'minimal' });
    a.encyclopedia.progress.value = { acanthogobius_flavimanus: { discovered: Date.now(), behaviors: {}, individuals: [], nextNumber: 1 } };
    a.openOverlay('zukan');
  });
  const withinScreen = async () => {
    await mp.locator('.field-guide').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    const bounds = await mp.evaluate(() => {
      const guide = document.querySelector('.field-guide').getBoundingClientRect();
      return { fits: guide.left >= 0 && guide.top >= 0 && guide.right <= innerWidth + 1 && guide.bottom <= innerHeight + 1, overflow: document.documentElement.scrollWidth > innerWidth, cardScroll: document.querySelector('.field-guide').scrollHeight > guide.height + 2 };
    });
    assert.deepEqual(bounds, { fits: true, overflow: false, cardScroll: false });
  };
  for (const [width, height] of [[390,844], [320,568], [844,390], [768,1024]]) {
    await mp.setViewportSize({ width, height }); await mp.waitForTimeout(300);
    await mp.getByRole('searchbox').fill('');
    await withinScreen();
    assert.equal(await mp.locator('canvas.zukan-preview').count(), 0, 'Index must not create a hidden 3D renderer');
    if (width === 390) { await mp.waitForFunction(() => !document.querySelector('.toast')); await mp.screenshot({ animations: 'disabled', path: new URL('mobile-index.png', shots).pathname }); }
    await mp.locator('[data-species="acanthogobius_flavimanus"]').click();
    await mp.waitForFunction(() => document.querySelector('.zukan-photo')?.naturalWidth > 0);
    await withinScreen();
    await mp.getByRole('button', { name: '‹ 一覧に戻る', exact: true }).waitFor();
    if (width === 390) await mp.screenshot({ animations: 'disabled', path: new URL('mobile-detail.png', shots).pathname });
    await mp.getByRole('button', { name: '‹ 一覧に戻る', exact: true }).click();
    await mp.getByLabel('干潟で絞り込む').selectOption('hashirimizu');
    await mp.getByLabel('生物の分類').selectOption('fish');
    await mp.locator('[data-species="favonigobius_gymnauchen"]').click();
    assert.equal(await mp.locator('.zukan-detail h3').textContent(), 'ヒメハゼ');
    assert.equal(await mp.locator('.zukan-detail :is(img, canvas, .habitat, .behaviors, .tags, .sci)').count(), 0);
    await mp.getByRole('button', { name: '‹ 一覧に戻る', exact: true }).click();
    assert.equal(await mp.getByLabel('干潟で絞り込む').inputValue(), 'hashirimizu');
    await mp.getByRole('button', { name: '絞り込み解除', exact: true }).click();
  }
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.locator('[data-species="acanthogobius_flavimanus"]').click();
  await mp.getByRole('button', { name: 'しおりを挟む', exact: true }).click();
  await mp.getByRole('button', { name: '‹ 一覧に戻る', exact: true }).click();
  await mp.locator('.guide-bookmark-tab').click();
  assert.equal(await mp.locator('.zukan-item').count(), 1);
  await mp.locator('[data-species="acanthogobius_flavimanus"]').click();
  await mp.getByRole('button', { name: 'しおりを外す', exact: true }).click();
  await mp.getByText('しおりはまだありません', { exact: true }).waitFor();
  await mp.getByRole('button', { name: '図鑑を見る', exact: true }).click();
  for (const id of ['acanthogobius_flavimanus', 'charadrius_alexandrinus']) {
    await mp.locator(`[data-species="${id}"]`).click();
    await mp.getByRole('button', { name: 'しおりを挟む', exact: true }).click();
    await mp.getByRole('button', { name: '‹ 一覧に戻る', exact: true }).click();
  }
  await mp.locator('.guide-bookmark-tab').click(); await withinScreen();
  await mp.screenshot({ animations: 'disabled', path: new URL('mobile-bookmarks.png', shots).pathname });
  await mp.evaluate(() => {
    const a = window.__higata, species = a.data.species.get('acanthogobius_flavimanus');
    a.encyclopedia.onObserved({ species, sex: 'unknown' }, Date.parse('2030-07-12T05:30:00+09:00'), 'hashirimizu');
  });
  await mp.locator('[data-species="acanthogobius_flavimanus"]').click();
  await mp.locator('.zukan-sections').getByRole('button', { name: '履歴', exact: true }).click();
  await withinScreen(); assert.equal(await mp.locator('canvas.zukan-preview, .zukan-photo').count(), 0);
  await mp.screenshot({ animations: 'disabled', path: new URL('mobile-history.png', shots).pathname });
  await mp.getByRole('button', { name: '‹ 一覧に戻る', exact: true }).click();
  await mp.locator('.guide-tabs').getByRole('button', { name: '図鑑', exact: true }).click();
  // A mobile 3D specimen keeps its camera aspect when rotating the device.
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.evaluate(async () => { await window.__higata.updateSettings({ homeQuality: 'low' }); });
  await mp.locator('[data-species="acanthogobius_flavimanus"]').click();
  await mp.locator('.zukan-sections').getByRole('button', { name: '生態', exact: true }).click();
  await mp.waitForTimeout(200);
  await mp.waitForFunction(() => document.querySelector('canvas.zukan-preview') && !document.querySelector('.zukan-detail [role="status"], .preview-error'));
  await mp.setViewportSize({ width: 844, height: 390 });
  await mp.waitForFunction(() => { const c = document.querySelector('canvas.zukan-preview'); return c && Math.abs(c.width / c.height - c.clientWidth / c.clientHeight) < 0.02; });
  await withinScreen();
  await mp.getByRole('button', { name: '‹ 一覧に戻る', exact: true }).click();
  assert.equal(await mp.locator('canvas.zukan-preview').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS mobile portrait/landscape/tablet, bounded layout, list/detail navigation and no hidden preview');
  await mobile.close();
} finally { await browser?.close(); server.kill('SIGTERM'); }
