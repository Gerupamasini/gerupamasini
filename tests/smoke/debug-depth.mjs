// npm run build first. Checks debug wiring against the actual field and input on the production build.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url), port = 4196;
const url = `http://127.0.0.1:${port}/gerupamasini/?debug=1`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(url)).ok) break; } catch { /* starting */ }
    if (n > 60) throw Error('Preview unavailable');
    await new Promise(r => setTimeout(r, 200));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(m.text()); });
  const frames = async (n = 5) => {
    const f = await page.evaluate(() => window.__higata.frameCount);
    await page.waitForFunction(({ f, n }) => window.__higata.frameCount >= f + n, { f, n });
  };
  await page.goto(url); await page.locator('.title-screen').waitFor();
  await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'minimal', fieldQuality: 'minimal' }));
  await page.locator('.title-actions .primary').click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(() => window.__higata.enterField('kasai_west'));
  await page.waitForFunction(() => window.__higata.mode === 'field');
  assert.equal(await page.evaluate(() => window.__higata.player.ignoreDepthLimit), true, 'URL debug applies to a newly built controller');

  const point = await page.evaluate(() => {
    const a = window.__higata, t = a.world.terrain;
    for (let z = -100; z <= 100; z += 10) for (let x = -100; x <= 100; x += 10) {
      const h = t.heightAt(x, z);
      if (h < -0.3 && t.normalAt(x, z).y > 0.99 && Math.abs(t.heightAt(x, z - 1) - h) < 0.1 && !a.world.riprap?.heightBoost(x, z)) {
        a.setTideOverride(h + 2);
        a.player.setPose(x, z, 0, -1.3);
        return { x, z, h };
      }
    }
    throw Error('No smooth submerged test position');
  });
  await frames();
  assert.ok(await page.evaluate(() => window.__higata.player.depthHere > window.__higata.player.wadeDepth));
  assert.ok(await page.evaluate(() => window.__higata.camera.position.y < window.__higata.world.habitat.waterAt(window.__higata.player.position.x, window.__higata.player.position.z)));
  await page.keyboard.press('F3');
  await page.waitForFunction(() => !window.__higata.player.ignoreDepthLimit);
  const before = await page.evaluate(() => window.__higata.player.position.z);
  await page.keyboard.down('KeyW'); await frames();
  const stopped = await page.evaluate(() => ({ z: window.__higata.player.position.z, blocked: window.__higata.player.blockedByDepth }));
  await page.keyboard.up('KeyW');
  assert.equal(stopped.z, before); assert.equal(stopped.blocked, true);
  assert.ok(await page.evaluate(() => window.__higata.camera.position.y > window.__higata.world.habitat.waterAt(window.__higata.player.position.x, window.__higata.player.position.z)));
  await page.keyboard.press('F3');
  await page.waitForFunction(() => window.__higata.player.ignoreDepthLimit);
  await page.keyboard.down('KeyW'); await frames(); await page.keyboard.up('KeyW');
  assert.ok(await page.evaluate(() => window.__higata.player.position.z) < before - 0.01);
  assert.equal(await page.evaluate(() => window.__higata.player.blockedByDepth), false);
  console.log('PASS URL debug, F3 restoration, real keyboard movement and underwater view');

  // In normal mode the shovel is in reach but the 20 cm water still prevents digging.
  await page.evaluate(p => { const a = window.__higata; a.setTool('shovel'); a.setTideOverride(p.h + 0.2); a.player.setPose(p.x, p.z, 0, -1.3); }, point);
  await page.keyboard.press('F3');
  await page.waitForFunction(() => !window.__higata.player.ignoreDepthLimit && window.__higata.player.depthHere >= 0.19 && window.__higata.player.depthHere < 0.25);
  assert.equal(await page.evaluate(() => window.__higata.digTarget()?.far), false);
  await page.evaluate(() => window.__higata.useTool());
  assert.equal(await page.evaluate(() => window.__higata.mode), 'field');
  await page.keyboard.press('F3'); await page.waitForFunction(() => window.__higata.player.ignoreDepthLimit);
  await page.evaluate(p => window.__higata.setTideOverride(p.h + 2), point); await frames();
  await page.evaluate(() => window.__higata.useTool());
  assert.equal(await page.evaluate(() => window.__higata.mode), 'capture');
  console.log('PASS normal submerged digging limit and debug deep-water digging');
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.setDefaultTimeout(60000); mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto(url); await mobile.locator('.title-screen').waitFor();
  await mobile.locator('.title-actions .primary').tap();
  await mobile.waitForFunction(() => window.__higata.mode === 'home');
  await mobile.keyboard.press('F3'); await mobile.evaluate(() => window.__higata.toggleDebug());
  assert.equal(await mobile.locator('.debug-panel').count(), 0);
  assert.equal(await mobile.evaluate(() => window.__higata.input.touchDevice), true);
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('PASS mobile debug disabled, no browser or shader errors');
} finally { await browser?.close(); server.kill('SIGTERM'); }
