#!/usr/bin/env node
// Builds nothing: run `npm run build` first. Opens the flat in headless Chromium (SwiftShader WebGL) and draws the
// same view at full size, and at 67 % and 50 % scaled up by FSR 1 and by plain bilinear scaling, to tests/smoke/out/
// (upscale-*.png, plus upscale-crops.png: the middle of each, enlarged). Fails on page errors, on an upscaled view
// that is not drawn at the size asked, or on a picture far from the full-size one.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tests', 'smoke', 'out');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 4176;
const BASE = process.env.VITE_BASE ?? '/gerupamasini/';
const url = `http://localhost:${PORT}${BASE}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let code = 0;
const fail = (m) => { console.error(`FAIL ${m}`); code = 1; };
async function waitFrames(page, n) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((t) => (window.__higata?.frameCount ?? 0) >= t, start + n, { timeout: 180000 });
}
function psnr(a, b) {
  let se = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) { const d = a.data[i + c] - b.data[i + c]; se += d * d; n++; }
  return 10 * Math.log10((255 * 255 * n) / Math.max(se, 1e-9));
}
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 80) throw new Error('preview server did not start');
    await wait(250);
  }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) fail(`console: ${m.text().slice(0, 300)}`); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 60000 });
  await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'low', fieldQuality: 'mid' }));
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata?.mode === 'home', null, { timeout: 60000 });
  await page.evaluate(() => window.__higata.enterField());
  await page.waitForFunction(() => window.__higata?.world && window.__higata.player && window.__higata.mode === 'field', null, { timeout: 180000 });
  // noon, the clock held, the HUD hidden: the frames differ only by how they are drawn
  await page.evaluate(() => {
    const a = window.__higata;
    const d = new Date(a.clock.nowReal() + 9 * 3600000);
    a.setDebugTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 30) - 9 * 3600000);
    a.player.yaw = Math.PI * 0.75; a.player.pitch = -0.12;
    document.querySelector('#ui')?.setAttribute('style', 'display:none');
  });
  await waitFrames(page, 6);
  const shots = [];
  for (const [name, scale, mode] of [['100', 1, 'fsr'], ['67-fsr', 0.67, 'fsr'], ['67-bilinear', 0.67, 'bilinear'], ['50-fsr', 0.5, 'fsr'], ['50-bilinear', 0.5, 'bilinear']]) {
    const info = await page.evaluate(([s, m]) => {
      const a = window.__higata;
      a.renderer.setFixedScale(s);
      a.field.upscaler.mode = m;
      a.clock.setPaused(true);
      return { view: [a.renderer.renderSize.x, a.renderer.renderSize.y], screen: [a.renderer.gl.domElement.width, a.renderer.gl.domElement.height], upscaled: a.renderer.upscaled };
    }, [scale, mode]);
    await waitFrames(page, 4);
    const file = path.join(outDir, `upscale-${name}.png`);
    await page.screenshot({ path: file });
    const want = [Math.round(info.screen[0] * scale), Math.round(info.screen[1] * scale)];
    if (info.view[0] !== want[0] || info.view[1] !== want[1] || info.upscaled !== scale < 1) fail(`${name}: view ${info.view} (screen ${info.screen}), upscaled ${info.upscaled}`);
    shots.push({ name, png: PNG.sync.read(fs.readFileSync(file)) });
    console.log(`${name}: view ${info.view.join('×')} → screen ${info.screen.join('×')}`);
  }
  const ref = shots[0].png;
  for (const s of shots.slice(1)) {
    const db = psnr(ref, s.png);
    console.log(`${s.name}: ${db.toFixed(1)} dB against full size`);
    if (db < 20) fail(`${s.name} is far from the full-size picture (${db.toFixed(1)} dB)`);
  }
  // the middle of each picture, 3× enlarged, side by side
  const cw = 160, ch = 120, k = 3, x0 = Math.round(ref.width / 2 - cw / 2), y0 = Math.round(ref.height * 0.55 - ch / 2);
  const crops = new PNG({ width: cw * k * shots.length, height: ch * k });
  shots.forEach((s, n) => {
    for (let y = 0; y < ch * k; y++) for (let x = 0; x < cw * k; x++) {
      const si = ((y0 + Math.floor(y / k)) * s.png.width + x0 + Math.floor(x / k)) * 4, di = (y * crops.width + n * cw * k + x) * 4;
      for (let c = 0; c < 4; c++) crops.data[di + c] = s.png.data[si + c];
    }
  });
  fs.writeFileSync(path.join(outDir, 'upscale-crops.png'), PNG.sync.write(crops));
  console.log(`crops (${shots.map((s) => s.name).join(' | ')}): tests/smoke/out/upscale-crops.png`);
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
