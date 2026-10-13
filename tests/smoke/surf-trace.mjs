#!/usr/bin/env node
// What the swash leaves on the sand (SurfMemory) as one walks and looks about on 走水: standing at the waterline
// looking along the beach, then walking along it, then turning round and back. The software renderer takes many
// seconds over a frame, so Playwright's clock holds the game's frames and the sand's memory alone is stepped at 60 Hz
// between the pictures, as it would be at 60 frames a second. The memory must show no edge of its window.
// Headless Chromium (SwiftShader); starts the Vite dev server itself.
// Usage: node tests/smoke/surf-trace.mjs [--out <dir>] [--quality mid|high|low] [--w 640 --h 360] [--port 5215]
// Output: tests/smoke/out/surf-trace/*.png (or <dir>). Fails on any page error or shader error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const outDir = path.resolve(opt('--out', path.join(root, 'tests', 'smoke', 'out', 'surf-trace')));
const quality = opt('--quality', 'mid');
const W = Number(opt('--w', 640)), H = Number(opt('--h', 360));
fs.mkdirSync(outDir, { recursive: true });
const PORT = Number(opt('--port', 5215));
const url = `http://localhost:${PORT}/gerupamasini/`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
  page.setDefaultTimeout(900000);
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
  const start = await page.evaluate(() => window.__higata.frameCount);
  await page.waitForFunction((s) => window.__higata.frameCount >= s + 3, start, { timeout: 600000 });
  // noon, the tide at -16 cm and rising, the day's usual sea; the picture alone
  const pose = await page.evaluate(() => {
    const a = window.__higata, w = a.world;
    a.clock.cancelTicket?.();
    const d = new Date();
    a.clock.setDebugTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 30));
    w.setSeaState({ height: 0.4, period: 4.2, angle: 0.22, spread: 0.16 });
    a.setTideOverride(-0.16);
    if (a.settings.sunglasses) a.toggleSunglasses();
    a.renderNetOverlay = () => {};
    const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.head.appendChild(st);
    // at the waterline (z = 0), a little up the beach, looking along it with the sea on the left (+z)
    let x = -40;
    for (; x < 40; x += 0.05) if (w.terrain.heightAt(x, 0) < -0.16) break;
    a.player.lowView = false;
    return { x: x - 0.6, z: 0 };
  });
  /** the player at (x, z) looking `yaw` from along the beach (+z), a little down */
  const place = (x, z, yaw) => page.evaluate(([x, z, yaw]) => { const p = window.__higata.player; p.setPose(x, z, Math.PI + yaw); p.pitch = -0.22; }, [x, z, yaw]);
  await place(pose.x, pose.z, 0);
  // from here on the page's clock is Playwright's, so the game draws a frame only when asked (the software renderer
  // takes many seconds over one). In between, the sand's memory alone is stepped at 60 Hz, the water's clock with it,
  // the viewer's eye going where the walk takes it: the memory sees what it would at 60 frames a second.
  await page.clock.install();
  await page.clock.runFor(1000 / 60);
  /** `n` steps of 1/60 s, the eye at `at`, an expression in the step i giving [x, z, yaw] */
  const steps = async (n, at) => {
    for (let i0 = 0; i0 < n; i0 += 30) {
      await page.evaluate(([i0, n, at]) => {
        const a = window.__higata, w = a.world, cam = a.camera, f = new Function('i', `return ${at};`);
        const eye = cam.position.y - w.terrain.heightAt(cam.position.x, cam.position.z);
        for (let i = i0; i < Math.min(i0 + 30, n); i++) {
          const [x, z, yaw] = f(i), th = Math.PI + yaw;
          cam.position.set(x, w.terrain.heightAt(x, z) + eye, z);
          cam.lookAt(x - Math.sin(th), cam.position.y - 0.22, z - Math.cos(th));
          w.water.uniforms.uTime.value += 1 / 60;
          w.surfMemory.update(a.renderer.gl, cam, w.tideLevel, w.water.uniforms.uTime.value, 1 / 60);
        }
      }, [i0, n, at]);
    }
  };
  /** a frame of the game with the player where the path ended */
  const shot = async (name, x, z, yaw) => {
    await place(x, z, yaw);
    await page.clock.runFor(1000 / 60);
    await page.clock.runFor(1000 / 60);
    await page.screenshot({ path: path.join(outDir, name) });
    console.log('shot', name);
  };
  const X = pose.x, Z = pose.z;
  // standing: ten seconds for the memory to fill, then a frame a second
  await steps(600, `[${X}, ${Z}, 0]`);
  await shot('stand-0.png', X, Z, 0);
  await steps(60, `[${X}, ${Z}, 0]`);
  await shot('stand-1.png', X, Z, 0);
  // walking along the beach at 1.7 m/s for four seconds
  for (let s = 0; s < 4; s++) {
    await steps(60, `[${X}, ${Z} + (${s * 60} + i) * 1.7 / 60, 0]`);
    await shot(`walk-${s}.png`, X, Z + (s + 1) * 1.7, 0);
  }
  const Z1 = Z + 4 * 1.7;
  // turning round (a second) and back (a second): the window must leave no mark of where it was
  await steps(60, `[${X}, ${Z1}, Math.PI * (i + 1) / 60]`);
  await shot('turn-away.png', X, Z1, Math.PI);
  await steps(60, `[${X}, ${Z1}, Math.PI * (1 - (i + 1) / 60)]`);
  await shot('turn-back.png', X, Z1, 0);
  await steps(120, `[${X}, ${Z1}, 0]`);
  await shot('turn-after.png', X, Z1, 0);
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
