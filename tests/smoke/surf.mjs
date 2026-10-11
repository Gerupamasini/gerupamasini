#!/usr/bin/env node
// The surf on 走水 in the game, in headless Chromium (SwiftShader): standing on the beach looking out to sea into the
// morning sun at the exploring tide (the waves spilling across the clam flat) and at high water (a shore break on the
// steep beach face), a run of frames through one wave's cycle (break, bore, swash, backwash), the swash at one's feet,
// and the debug views of the zones and the foams. Starts the Vite dev server itself.
// Usage: node tests/smoke/surf.mjs [--out <dir>] [--quality mid|high|low|minimal] [--only <name,...>]
// Output: tests/smoke/out/surf/*.png (or <dir>). Fails on any page error or shader error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const outDir = path.resolve(opt('--out', path.join(root, 'tests', 'smoke', 'out', 'surf')));
const quality = opt('--quality', 'mid');
const only = opt('--only', '') ? opt('--only', '').split(',') : null;
const W = Number(opt('--w', 960)), H = Number(opt('--h', 540));
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5211;
const url = `http://localhost:${PORT}/gerupamasini/`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFrames(page, n, timeoutMs = 900000) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((target) => (window.__higata?.frameCount ?? 0) >= target, start + n, { timeout: timeoutMs });
}
let code = 0;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 120) throw new Error('vite did not start');
    await wait(250);
  }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { console.error('pageerror:', e.message); code = 1; });
  page.on('console', (m) => {
    const t = m.text();
    if (/Shader Error|ERROR: 0:|WebGLProgram/.test(t)) { console.error('shader:', t.slice(0, 4000)); code = 1; }
    else if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(t)) { console.error('console:', t.slice(0, 300)); code = 1; }
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 120000 });
  await page.evaluate((q) => window.__higata.updateSettings({ quality: q, fieldQuality: q }), quality);
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 120000 });
  await page.evaluate(() => window.__higata.enterField('hashirimizu'));
  await page.waitForFunction(() => window.__higata.world && window.__higata.creatures && window.__higata.mode === 'field', null, { timeout: 600000 });
  await waitFrames(page, 3);
  // half past seven in the morning (JST): the sun low over the sea, in front of the beach; the day's sea fixed
  await page.evaluate(() => {
    const a = window.__higata;
    a.clock.cancelTicket?.();
    const d = new Date();
    a.clock.setDebugTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 22, 30) - 86400000);
    a.world.setSeaState({ height: 0.34, period: 3.8, angle: 0.22, spread: 0.16 });
    if (a.settings.sunglasses) a.toggleSunglasses();
    // (the picture alone: no HUD, no tool in hand)
    a.renderNetOverlay = () => {};
    const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.head.appendChild(st);
  });
  /** stand on the beach `back` metres up from the still waterline at z, looking out to sea (yaw from seaward) */
  const stand = (tide, back, z = 0, pitch = -0.1, turn = 0) => page.evaluate(([tide, back, z, pitch, turn]) => {
    const a = window.__higata, w = a.world;
    a.setTideOverride(tide);
    let x = -40;
    for (; x < 40; x += 0.05) if (w.terrain.heightAt(x, z) < tide) break;
    a.player.lowView = false;
    a.player.setPose(x - back, z, -Math.PI / 2 + turn);
    a.player.pitch = pitch;
    return { x: +(x - back).toFixed(2) };
  }, [tide, back, z, pitch, turn]);
  /** set the water's clock (the surf's time) */
  const clockAt = (t) => page.evaluate((t) => { window.__higata.world.water.uniforms.uTime.value = t; }, t);
  const shot = async (name, n = 4) => {
    if (only && !only.some((o) => name.startsWith(o))) return;
    await waitFrames(page, n);
    await page.screenshot({ path: path.join(outDir, name) });
    console.log('shot', name);
  };
  const want = (group) => !only || only.some((o) => o.startsWith(group) || group.startsWith(o));
  if (want('mid')) {
    console.log('mid tide', await stand(-0.3, 1.2, 0, -0.08));
    await shot('mid-tide.png', 8);
    for (let i = 0; i < 8; i++) { await clockAt(300 + i * 0.5); await shot(`mid-seq-${i}.png`, 1); }
    await page.evaluate(() => window.__higata.world.water.setSurfDebug(2));
    for (let i = 0; i < 8; i++) { await clockAt(300 + i * 0.5); await shot(`middbg-${i}.png`, 1); }
    await page.evaluate(() => window.__higata.world.water.setSurfDebug(0));
  }
  if (want('high')) {
    console.log('high tide', await stand(0.55, 1.4, 0, -0.1));
    await shot('high-tide.png', 10);
    for (let i = 0; i < 6; i++) await shot(`high-seq-${i}.png`, 3);
  }
  if (want('feet')) {
    // the swash at one's feet through one wave: the uprush, the sheet stopping, the backwash, the sand left wet
    await page.evaluate(() => window.__higata.world.setSeaState({ height: 0.45, period: 4.6, angle: 0.22, spread: 0.16 }));
    await stand(0.55, 2.2, 0, -0.62);
    await waitFrames(page, 6);
    for (let i = 0; i < 8; i++) { await clockAt(900 + i * 0.6); await shot(`feet-${i}.png`, 1); }
  }
  if (want('side')) {
    // a livelier day, standing in the swash at high water, looking along the beach: the waves' profiles
    await page.evaluate(() => window.__higata.world.setSeaState({ height: 0.5, period: 5, angle: 0.22, spread: 0.16 }));
    await stand(0.55, -0.6, 0, -0.06, Math.PI / 2 - 0.25);
    for (let i = 0; i < 4; i++) await shot(`side-${i}.png`, i === 0 ? 8 : 3);
  }
  if (want('big')) {
    await page.evaluate(() => window.__higata.world.setSeaState({ height: 0.5, period: 5, angle: 0.22, spread: 0.16 }));
    await stand(0.55, 1.4, 0, -0.1);
    await waitFrames(page, 6);
    for (let i = 0; i < 8; i++) { await clockAt(600 + i * 0.6); await shot(`big-${i}.png`, 1); }
    await page.evaluate(() => window.__higata.world.water.setSurfDebug(2));
    for (let i = 0; i < 8; i++) { await clockAt(600 + i * 0.6); await shot(`bigdbg-${i}.png`, 1); }
    await page.evaluate(() => window.__higata.world.water.setSurfDebug(0));
    console.log('band', await page.evaluate(() => window.__higata.world.band.toArray().map((v) => +v.toFixed(2))));
    await page.evaluate(() => window.__higata.world.setSeaState({ height: 0.34, period: 3.8, angle: 0.22, spread: 0.16 }));
  }
  if (want('along')) {
    await page.evaluate(() => window.__higata.world.setSeaState({ height: 0.45, period: 4.6, angle: 0.22, spread: 0.16 }));
    await stand(0.55, 1.6, 0, -0.14, 0.9);
    await waitFrames(page, 6);
    for (let i = 0; i < 4; i++) { await clockAt(1200 + i * 0.8); await shot(`along-${i}.png`, 1); }
  }
  if (want('debug')) {
    await stand(-0.3, 2, 0, -0.25);
    await page.evaluate(() => window.__higata.world.water.setSurfDebug(1));
    await shot('debug-zones.png', 6);
    await page.evaluate(() => window.__higata.world.water.setSurfDebug(2));
    await shot('debug-foams.png', 4);
    await page.evaluate(() => window.__higata.world.water.setSurfDebug(3));
    await shot('debug-phase.png', 4);
    await page.evaluate(() => window.__higata.world.water.setSurfDebug(4));
    await shot('debug-zonetex.png', 4);
    await page.evaluate(() => window.__higata.world.water.setSurfDebug(5));
    await shot('debug-depth.png', 4);
    await page.evaluate(() => window.__higata.world.water.setSurfDebug(0));
  }
  const stats = await page.evaluate(() => {
    const a = window.__higata, w = a.world, cam = a.camera.position;
    let wl = -40; for (; wl < 40; wl += 0.05) if (w.terrain.heightAt(wl, cam.z) < w.tideLevel) break;
    return { bakes: w.surfZone?.bakes, sea: w.sea, lv: w.surfZone?.uniforms.uSurfLv.value.toArray(), cam: cam.toArray().map((v) => +v.toFixed(2)), player: a.player.position.toArray().map((v) => +v.toFixed(2)), fov: a.camera.fov, tide: w.tideLevel, wl: +wl.toFixed(2), groundCam: +w.terrain.heightAt(cam.x, cam.z).toFixed(3), zoneCam: +w.surfZone.groundAt(cam.x, cam.z).toFixed(3) };
  });
  console.log(JSON.stringify(stats));
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
