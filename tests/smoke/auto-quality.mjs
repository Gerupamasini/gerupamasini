#!/usr/bin/env node
// Builds nothing: run `npm run build` first. A first run on a PC (headless Chromium, SwiftShader WebGL): the flat's
// tier is measured in the flat and settled, the player is told, the choice is kept with the GPU's name and not measured
// again after a reload; picking a tier in the menu ends it. Software rendering is slow, so the measured tier must come
// out low.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4177;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser, code = 0;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* startup */ }
    if (i === 59) throw new Error('preview did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__higata?.settings);
  const first = await page.evaluate(() => ({ auto: window.__higata.settings.fieldAuto, gpu: window.__higata.settings.autoGpu, timer: window.__higata.renderer.gpuTimer.available }));
  assert.equal(first.auto, true, 'a first run on a PC measures the flat');
  assert.equal(first.gpu, '');
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(() => window.__higata.enterField());
  await page.waitForFunction(() => window.__higata.mode === 'field' && window.__higata.renderer.upscalingOn);
  await page.waitForFunction(() => window.__higata.settings.autoGpu !== '', null, { timeout: 600000 });
  const chosen = await page.evaluate(() => ({ q: window.__higata.settings.fieldQuality, auto: window.__higata.settings.fieldAuto, gpu: window.__higata.settings.autoGpu, gpuName: window.__higata.renderer.gpuName, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' / ') }));
  console.log('chosen', JSON.stringify({ ...chosen, timer: first.timer }));
  assert.equal(chosen.auto, true);
  assert.equal(chosen.gpu, chosen.gpuName || '?');
  assert.ok(['minimal', 'low'].includes(chosen.q), `software rendering measured as ${chosen.q}`);
  assert.match(chosen.toast, /この PC で測って/);
  // kept over a reload, and not measured again
  await page.reload();
  await page.waitForFunction(() => !!window.__higata?.settings);
  assert.deepEqual(await page.evaluate(() => [window.__higata.settings.fieldQuality, window.__higata.settings.fieldAuto, window.__higata.settings.autoGpu]), [chosen.q, true, chosen.gpu]);
  // a tier picked in the menu ends the measured choice; 自動 asks for it again
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(() => window.__higata.openOverlay('menu'));
  const field = page.locator('.setting').nth(1);
  await field.getByRole('button', { name: '中', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => [window.__higata.settings.fieldQuality, window.__higata.settings.fieldAuto]), ['mid', false]);
  await field.getByRole('button', { name: /^自動/ }).click();
  assert.deepEqual(await page.evaluate(() => [window.__higata.settings.fieldAuto, window.__higata.settings.autoGpu]), [true, '']);
  assert.deepEqual(errors, []);
  console.log('PASS measured field quality: chosen, told, kept, overridden and asked for again');
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser?.close();
  server.kill();
}
process.exit(code);
