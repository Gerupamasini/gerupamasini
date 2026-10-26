#!/usr/bin/env node
// Builds nothing: run `npm run build` first. The sun's shadows beyond the near map, on the default flat:
//  - the relief's own shadow (TerrainShadow): with the sun 4° up in the west, the banks shade part of the flat, where
//    the same march toward the sun over the terrain's heights on the CPU says they do; at mid-morning nothing is shaded
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
  // on a fixed day (JST): at 16:45 the sun's height depends on the date, and by late October it has set below 1°
  const setHour = (hour) => page.evaluate((hour) => {
    window.__higata.setDebugTime(Date.UTC(2026, 9, 13, 0, 0) - 9 * 3600000 + hour * 3600000);
  }, hour);
  // the relief map, read back (one byte a texel), against the same march on the CPU at texels spread over the map (the
  // ones in the penumbra left out)
  const relief = () => page.evaluate(() => {
    const a = window.__higata, w = a.world, tr = w.terrain, t = w.terrainShadow.target, n = t.width, buf = new Uint8Array(n * n);
    a.renderer.gl.readRenderTargetPixels(t, 0, 0, n, n, buf);
    let dark = 0;
    for (let i = 0; i < n * n; i++) if (buf[i] < 128) dark++;
    const s = w.sunDir, hl = Math.hypot(s.x, s.z), dx = s.x / hl, dz = s.z / hl, tan = s.y / hl, half = tr.half;
    let seed = 7, agree = 0, decisive = 0, shadedCpu = 0;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 600; k++) {
      const x = Math.floor(rnd() * n), y = Math.floor(rnd() * n);
      const px = ((x + 0.5) / n) * 2 * half - half, pz = ((y + 0.5) / n) * 2 * half - half;
      const h0 = tr.heightAt(px, pz) + 0.04;
      let vis = 1, d = 0.5;
      for (let i = 0; i < 80 && vis > 0; i++) {
        d = d * 1.06 + 0.25;
        const qx = px + dx * d, qz = pz + dz * d;
        if (Math.abs(qx) > half || Math.abs(qz) > half) break;
        vis = Math.min(vis, Math.min(1, Math.max(0, (tan - (tr.heightAt(qx, qz) - h0) / d) / 0.0094 + 0.5)));
      }
      if (vis > 0.15 && vis < 0.85) continue;
      decisive++;
      if (vis < 0.5) shadedCpu++;
      if ((vis < 0.5) === (buf[y * n + x] < 128)) agree++;
    }
    return { n, dark: dark / (n * n), agree: agree / decisive, shadedCpu: shadedCpu / decisive, elevation: w.sunElevation, values: Array.from(buf) };
  });
  await setHour(16.75);
  await waitFrames(page, 4);
  const low = await relief();
  console.log(`relief, sun ${low.elevation.toFixed(1)}° up: ${(low.dark * 100).toFixed(1)} % of the flat shaded (the CPU march: ${(low.shadedCpu * 100).toFixed(1)} %), the two agree at ${(low.agree * 100).toFixed(1)} % of the texels`);
  writeMap('shadows-relief.png', low.n, low.values);
  assert.ok(low.elevation < 6 && low.elevation > 1, `the sun is ${low.elevation}° up`);
  assert.ok(low.dark > 0.05, 'the banks shade part of the flat');
  assert.ok(low.agree > 0.95, 'the relief map is where the march over the heights puts the shadows');
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
