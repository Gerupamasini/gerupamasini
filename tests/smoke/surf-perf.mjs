#!/usr/bin/env node
// What the surf costs, tier by tier, in headless Chromium (SwiftShader: software rendering, so the numbers are
// relative, not a phone's or a desktop's): standing on 走水's beach at high water looking out into the surf, the mean
// frame time with the surf on, and with it off (no waves, no swash memory, no lips, no spray). Also checks that every
// tier compiles its shaders. Usage: node tests/smoke/surf-perf.mjs [--tiers minimal,low,mid,high] [--frames 12]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const tiers = opt('--tiers', 'minimal,low,mid,high').split(',');
const frames = Number(opt('--frames', 12));
const outDir = path.join(root, 'tests', 'smoke', 'out', 'surf');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5215;
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
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const rows = [];
  for (const q of tiers) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.setDefaultTimeout(600000);
    page.on('pageerror', (e) => { console.error('pageerror:', e.message); code = 1; });
    page.on('console', (m) => { const t = m.text(); if (/Shader Error|ERROR: 0:/.test(t)) { console.error('shader:', t.slice(0, 2000)); code = 1; } });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 120000 });
    await page.evaluate((q) => window.__higata.updateSettings({ quality: q, fieldQuality: q }), q);
    await page.locator('button.primary').first().click();
    await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 120000 });
    await page.evaluate(() => window.__higata.enterField('hashirimizu'));
    await page.waitForFunction(() => window.__higata.world && window.__higata.mode === 'field', null, { timeout: 600000 });
    await page.evaluate(() => {
      const a = window.__higata, w = a.world;
      a.renderNetOverlay = () => {};
      const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.head.appendChild(st);
      a.setTideOverride(0.55);
      let x = -40; for (; x < 40; x += 0.05) if (w.terrain.heightAt(x, 0) < 0.55) break;
      a.player.lowView = false;
      a.player.setPose(x - 1.4, 0, -Math.PI / 2); a.player.pitch = -0.1;
    });
    const time = () => page.evaluate(async (n) => {
      const a = window.__higata;
      const f0 = a.frameCount;
      await new Promise((r) => { const tick = () => (a.frameCount >= f0 + 2 ? r() : requestAnimationFrame(tick)); tick(); });
      const t0 = performance.now(), f1 = a.frameCount;
      await new Promise((r) => { const tick = () => (a.frameCount >= f1 + n ? r() : requestAnimationFrame(tick)); tick(); });
      return (performance.now() - t0) / (a.frameCount - f1);
    }, frames);
    await time();
    const on = await time();
    await page.screenshot({ path: path.join(outDir, `perf-${q}.png`) });
    // the same view without the surf
    await page.evaluate(() => {
      const w = window.__higata.world;
      w.surf.uSurf.value.w = 0;
      w.water.setSpray(null);
      if (w.surfLip) w.surfLip.mesh.visible = false;
      w.surfMemory = null;
    });
    await time();
    const off = await time();
    rows.push({ tier: q, surfOn: +on.toFixed(1), surfOff: +off.toFixed(1), share: `${Math.round((100 * (on - off)) / on)}%` });
    console.log(JSON.stringify(rows[rows.length - 1]));
    await page.close();
  }
  console.table(rows);
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
