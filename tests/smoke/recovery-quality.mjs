// Production-browser regressions for save loss and the minimum-quality encyclopedia.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4192;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(url)).ok) break; } catch { /* starting */ }
    if (n > 50) throw new Error('Preview did not start');
    await new Promise(r => setTimeout(r, 200));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const reload = async () => { await page.reload(); await page.locator('.title-screen').waitFor(); };
  const stored = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('keyval-store'); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, read = db.transaction('keyval', 'readonly').objectStore('keyval').get('save:slot1'); read.onsuccess = () => { resolve(read.result ?? null); db.close(); }; read.onerror = () => reject(read.error); };
  }));
  await page.goto(url); await page.locator('.title-screen').waitFor();
  await page.locator('.title-actions .primary').click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  assert.equal(await page.evaluate(() => {
    const app = window.__higata, seconds = app.save.stats.playSeconds;
    app.step(app.lastFrame - 1);
    return app.save.stats.playSeconds === seconds;
  }), true, 'A queued frame before a scene clock reset must not subtract saved play time');
  await page.evaluate(async () => { const app = window.__higata; app.encyclopedia.money.value = 777; await app.writeSave(); });
  await reload();
  assert.equal(await page.locator('.title-actions .primary').textContent(), 'つづきから ');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '新しくはじめる', exact: true }).click();
  assert.equal((await stored()).player.money, 777);
  await page.locator('.title-actions .primary').click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  try { await page.evaluate(async () => {
    const app = window.__higata, s = JSON.parse(app.exportSave());
    s.player.money = 54321;
    s.encyclopedia.acanthogobius_flavimanus = { discovered: Date.now(), behaviors: {}, individuals: [], nextNumber: 1 };
    await app.importSave(JSON.stringify(s));
  }); } catch (e) { console.error('Live import failed; exported state:', await page.evaluate(() => window.__higata.exportSave())); throw e; }
  assert.equal(await page.evaluate(() => window.__higata.encyclopedia.money.value), 54321);
  await reload(); await page.locator('.title-actions .primary').click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  assert.equal((await stored()).player.money, 54321);
  const invalid = await page.evaluate(async () => { try { await window.__higata.importSave('{"version":1}'); return false; } catch { return true; } });
  assert.equal(invalid, true); assert.equal((await stored()).player.money, 54321);

  const failed = await page.evaluate(async () => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = () => { throw new DOMException('full', 'QuotaExceededError'); };
    const app = window.__higata; app.encyclopedia.money.value = 9876;
    return await app.writeSave();
  });
  assert.equal(failed, false); await page.locator('.save-warning').waitFor();
  assert.equal((await stored()).player.money, 54321);
  // Restore storage and click in one task so an already queued autosave cannot clear the warning first.
  await page.getByRole('button', { name: '保存を再試行' }).evaluate(button => { IDBObjectStore.prototype.put = window.originalPut; button.click(); });
  await page.waitForFunction(() => !document.querySelector('.save-warning'));
  assert.equal((await stored()).player.money, 9876);
  console.log('PASS save protection, import and quota retry');
  await page.evaluate(() => window.__higata.openOverlay('menu'));
  const settings = page.locator('.setting');
  await settings.nth(0).getByRole('button', { name: '超軽量', exact: true }).click();
  await settings.nth(1).getByRole('button', { name: '高', exact: true }).click();
  const qualities = await page.evaluate(() => ({ home: window.__higata.settings.homeQuality, field: window.__higata.settings.fieldQuality, dpr: window.__higata.renderer.gl.getPixelRatio() }));
  assert.deepEqual(qualities, { home: 'minimal', field: 'high', dpr: 0.67 });
  const glbs = []; page.on('request', r => { if (/\.glb(?:$|\?)/.test(r.url())) glbs.push(r.url()); });
  await page.evaluate(() => { const app = window.__higata; app.closeOverlay(); app.openOverlay('zukan'); });
  await page.locator('.zukan-photo').waitFor();
  await page.waitForFunction(() => document.querySelector('.zukan-photo')?.naturalWidth === 640);
  assert.equal(await page.locator('.zukan-preview canvas, canvas.zukan-preview').count(), 0);
  assert.deepEqual(glbs, []);
  console.log('PASS independent quality and minimum encyclopedia without model requests');
  const shots = new URL('../../docs/quality/screenshots/', import.meta.url); await mkdir(shots, { recursive: true });
  await page.screenshot({ path: new URL('minimum-encyclopedia-mobile.png', shots).pathname });
  await reload(); await page.locator('.title-actions .primary').click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  assert.deepEqual(await page.evaluate(() => [window.__higata.settings.homeQuality, window.__higata.settings.fieldQuality]), ['minimal', 'high']);

  // A failed model promise must be evicted so the visible retry really makes another request.
  await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'low' }));
  let attempts = 0;
  await page.route('**/*mahaze_subadult.lod1*.glb', route => ++attempts === 1 ? route.abort() : route.continue());
  await page.evaluate(() => window.__higata.openOverlay('zukan'));
  await page.locator('.preview-error').waitFor();
  await page.locator('.preview-error').getByRole('button', { name: '再読み込み' }).click();
  try { await page.waitForFunction(() => !document.querySelector('.preview-error') && !document.querySelector('.zukan-detail [role="status"]')); }
  catch (e) { console.error('Preview retry failed', { attempts, errors, detail: await page.locator('.zukan-detail').textContent() }); throw e; }
  assert.equal(attempts, 2);
  console.log('PASS failed model request evicted and retried');
  await page.evaluate(() => window.__higata.closeOverlay());

  // Releasing a fish while its GLB is loading must survive a material/quality rebuild.
  await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'minimal' }));
  let releaseModel, modelRequested;
  const modelHeld = new Promise(resolve => { releaseModel = resolve; });
  const modelStarted = new Promise(resolve => { modelRequested = resolve; });
  const adultModel = '**/*mahaze_adult.lod2*.glb';
  await page.route(adultModel, async route => { modelRequested(); await modelHeld; await route.continue(); });
  await page.evaluate(() => {
    const a = window.__higata;
    const record = { id: 'pending-release', speciesId: 'acanthogobius_flavimanus', number: 1, length_mm: 180, weight_g: 40, sex: 'm', stage: 'adult', traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 };
    window.pendingTankLoad = a.tank.setOccupants([record], id => a.data.species.get(id));
  });
  let modelTimeout;
  try {
    await Promise.race([modelStarted, new Promise((_, reject) => { modelTimeout = setTimeout(() => reject(new Error('Adult tank model was not requested')), 15000); })]);
    await page.evaluate(() => { const a = window.__higata; a.tank.removeOccupant('pending-release'); window.pendingTankRefresh = a.tank.refreshHero(); });
  } finally { clearTimeout(modelTimeout); releaseModel(); }
  await page.evaluate(async () => { await window.pendingTankLoad; await window.pendingTankRefresh; });
  await page.unroute(adultModel);
  assert.deepEqual(await page.evaluate(() => window.__higata.tank.occupants.map(o => o.record.id)), []);
  assert.deepEqual(await page.evaluate(() => window.__higata.tank.occupantRecords.map(o => o.id)), []);
  console.log('PASS pending tank release preserved through material rebuild');

  if (process.argv.includes('--field')) {
    await page.evaluate(async () => { await window.__higata.updateSettings({ fieldQuality: 'low' }); await window.__higata.enterField(); });
    await page.waitForFunction(() => window.__higata.mode === 'field');
    await page.evaluate(async () => { await window.__higata.updateSettings({ fieldQuality: 'high' }); });
    assert.deepEqual(await page.evaluate(() => { const a = window.__higata; return { lod: a.creatures.preset.lod1Count, shadow: a.world.sky.sunLight.castShadow, size: a.world.sky.sunLight.shadow.mapSize.x, samples: a.field.preset.msaa }; }), { lod: 6, shadow: true, size: 2048, samples: 4 });
    assert.deepEqual(await page.evaluate(() => { const a = window.__higata; return { samples: a.hero.mainRT.samples, waterLite: !!a.world.water.material.defines.WATER_LITE, tankLite: a.tank.lite }; }), { samples: 4, waterLite: false, tankLite: true });
    await page.evaluate(() => window.__higata.updateSettings({ fieldQuality: 'minimal' }));
    assert.deepEqual(await page.evaluate(() => { const a = window.__higata; return { lod: a.creatures.preset.lod1Count, shadow: a.world.sky.sunLight.castShadow, samples: a.field.preset.msaa, dpr: a.renderer.gl.getPixelRatio(), tier: a.fieldToolTier }; }), { lod: 0, shadow: false, samples: 0, dpr: 0.67, tier: 'lod2' });
    assert.deepEqual(await page.evaluate(() => { const a = window.__higata; return { samples: a.hero.mainRT.samples, waterLite: !!a.world.water.material.defines.WATER_LITE, groundStride: a.world.terrain.material.defines.WAVE_STRIDE }; }), { samples: 0, waterLite: true, groundStride: 2 });
    await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'high' }));
    assert.deepEqual(await page.evaluate(() => { const a = window.__higata; return { samples: a.hero.mainRT.samples, waterLite: !!a.world.water.material.defines.WATER_LITE, tankLite: a.tank.lite }; }), { samples: 0, waterLite: true, tankLite: false });
    await page.evaluate(() => window.__higata.openOverlay('zukan'));
    await page.locator('.zukan-photo').waitFor();
    assert.equal(await page.locator('canvas.zukan-preview').count(), 0);
    await page.evaluate(() => window.__higata.closeOverlay());
    await page.evaluate(() => {
      const a = window.__higata; a.enterHome(); window.hiddenWorldUpdates = 0;
      const update = a.world.update.bind(a.world); a.world.update = (...args) => { window.hiddenWorldUpdates++; update(...args); };
    });
    assert.equal(await page.evaluate(() => window.__higata.hero.mainRT.samples), 4);
    await page.waitForTimeout(1200); assert.equal(await page.evaluate(() => window.hiddenWorldUpdates), 0);
    console.log('PASS live low/high/minimum field quality and hidden-world pause');
  }
  await page.evaluate(() => { void window.__higata.resetSave(); });
  await page.waitForEvent('load'); await page.locator('.title-screen').waitFor();
  assert.equal(await stored(), null);
  assert.equal(await page.evaluate(() => window.__higata.save), null);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('keyval-store'); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, tx = db.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put({ version: 1 }, 'save:slot1'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  }));
  await reload();
  await page.locator('.save-recovery').waitFor();
  await page.getByRole('button', { name: 'バックアップを復元', exact: true }).click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  assert.equal((await stored()).player.money, 9876);
  assert.deepEqual(errors, []);
  await context.close();
  // Failed WebGL construction must produce a useful screen rather than a blank UI.
  const unsupported = await browser.newPage();
  await unsupported.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await unsupported.goto(url);
  await unsupported.getByRole('button', { name: '再読み込み' }).waitFor();
  assert.match(await unsupported.locator('#ui').textContent(), /WebGL2/);
  console.log('PASS: protected new game, live import + reload, invalid import, quota retry, independent quality, static encyclopedia, reset, unsupported WebGL');
} finally { await browser?.close(); server.kill('SIGTERM'); }
