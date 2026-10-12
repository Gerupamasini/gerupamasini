#!/usr/bin/env node
// Builds nothing: run `npm run build` first. The sun's shadows beyond the near map, on the default flat (葛西):
//  - the relief's own shadow (TerrainShadow): with the sun 4° up in the west, the west bank shades a band of the flat
//    (some 70 m wide); at mid-morning nothing is shaded
//  - the far shadow map (FarShadow): the riprap and the reef's far clumps are drawn into it
//  - the terrain shader takes both: a black relief map darkens the sunlit flat
// The two maps are written to tests/smoke/out/shadows-relief.png and shadows-far.png (the flat seen from above, -z up).
//   node tests/smoke/shadows.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tests', 'smoke', 'out');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 4187;
const url = `http://127.0.0.1:${PORT}/gerupamasini/`;
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
async function waitFrames(page, n) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((t) => (window.__higata?.frameCount ?? 0) >= t, start + n, { timeout: 240000 });
}
function writeMap(file, n, values) {
  const png = new PNG({ width: n, height: n });
  for (let i = 0; i < n * n; i++) { const v = values[i], o = i * 4; png.data[o] = png.data[o + 1] = png.data[o + 2] = v; png.data[o + 3] = 255; }
  fs.writeFileSync(path.join(outDir, file), PNG.sync.write(png));
}
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 80) throw new Error('preview server did not start');
    await wait(250);
  }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__higata?.settings);
  await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'low', fieldQuality: 'high' }));
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(() => window.__higata.enterField());
  await page.waitForFunction(() => window.__higata.mode === 'field' && !!window.__higata.world, null, { timeout: 300000 });
  const setHour = (hour) => page.evaluate((hour) => {
    const a = window.__higata, d = new Date(a.clock.nowReal() + 9 * 3600000);
    a.setDebugTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0) - 9 * 3600000 + hour * 3600000);
  }, hour);
  // the relief map, read back (one byte a texel)
  const relief = () => page.evaluate(() => {
    const a = window.__higata, t = a.world.terrainShadow.target, n = t.width, buf = new Uint8Array(n * n);
    a.renderer.gl.readRenderTargetPixels(t, 0, 0, n, n, buf);
    let dark = 0, westDark = 0, west = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = buf[y * n + x];
      if (v < 128) dark++;
      // (the band within 70 m of the west edge of the 320 m flat)
      if (x < n * (70 / 320)) { west++; if (v < 128) westDark++; }
    }
    return { n, dark: dark / (n * n), westDark: westDark / west, elevation: a.world.sunElevation, values: Array.from(buf) };
  });
  await setHour(16.75);
  await waitFrames(page, 4);
  const low = await relief();
  console.log(`relief, sun ${low.elevation.toFixed(1)}° up: ${(low.dark * 100).toFixed(1)} % of the flat shaded, ${(low.westDark * 100).toFixed(0)} % of the band by the west bank`);
  writeMap('shadows-relief.png', low.n, low.values);
  assert.ok(low.elevation < 6 && low.elevation > 1, `the sun is ${low.elevation}° up`);
  assert.ok(low.westDark > 0.4, 'the west bank shades the flat by it');
  await setHour(10);
  await waitFrames(page, 4);
  const high = await relief();
  console.log(`relief, sun ${high.elevation.toFixed(1)}° up: ${(high.dark * 100).toFixed(2)} % shaded`);
  assert.ok(high.dark < 0.005, 'a high sun leaves the flat lit');
  // the far map: what it holds (its colour is 1 - depth where a caster stands, 0 elsewhere)
  const far = await page.evaluate(() => {
    const a = window.__higata, f = a.world.farShadow, t = f.target, n = t.width, buf = new Uint8Array(n * n * 4);
    a.renderer.gl.readRenderTargetPixels(t, 0, 0, n, n, buf);
    let filled = 0;
    const small = new Uint8Array(512 * 512), k = n / 512;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (buf[(y * n + x) * 4] > 0) { filled++; small[Math.floor(y / k) * 512 + Math.floor(x / k)] = 255; }
    }
    return { n, filled, small: Array.from(small) };
  });
  console.log(`far map: ${far.filled} of ${far.n}² texels hold a caster`);
  writeMap('shadows-far.png', 512, far.small);
  assert.ok(far.filled > 50, 'the riprap and the reef are in the far map');
  // the terrain shader takes the relief: a black map in its place darkens the sunlit flat (the map's updates held)
  await page.evaluate(() => { const a = window.__higata; a.setTideOverride(-1.2); a.player.setPose(10, -65.5, Math.PI * 1.39, -0.3); a.clock.setPaused(true); document.querySelector('#ui')?.setAttribute('style', 'display:none'); });
  await waitFrames(page, 6);
  const mean = async () => { const p = PNG.sync.read(await page.screenshot()); let s = 0; for (let y = p.height / 2; y < p.height; y++) for (let x = 0; x < p.width; x++) s += p.data[(y * p.width + x) * 4 + 1]; return s / (p.width * p.height / 2); };
  const lit = await mean();
  await page.evaluate(() => {
    const w = window.__higata.world, ts = w.terrainShadow, H = w.terrain.heightTexture.constructor;
    const black = new H(new Uint8Array([0, 0, 0, 255]), 1, 1);
    black.needsUpdate = true;
    ts.on = false;
    ts.uniforms.uTerrainSun.value = black;
  });
  await waitFrames(page, 4);
  const shaded = await mean();
  console.log(`the flat in the sun: ${lit.toFixed(0)}, under a black relief map: ${shaded.toFixed(0)}`);
  assert.ok(shaded < lit * 0.8, 'the terrain shader darkens the flat under the relief map');
  assert.deepEqual(errors, []);
  console.log('PASS relief shadow, far shadow map, terrain shading');
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
