#!/usr/bin/env node
// 東なぎさ sand close-ups for comparing with the photos: run `npm run build` first. Opens the flat on a summer noon at a
// chosen quality and saves views of dry sand, the wet flat at low water, ripples close up and ripples whose troughs
// still hold water to tests/smoke/out/sand-<quality>-*.png, with the mean sRGB of a central patch of each printed.
//   node tests/smoke/kasai-sand.mjs [--quality mid] [--month 7]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tests', 'smoke', 'out');
fs.mkdirSync(outDir, { recursive: true });
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const quality = arg('--quality', 'mid'), month = Number(arg('--month', 7));
const PORT = 4176;
const BASE = process.env.VITE_BASE ?? '/gerupamasini/';
const url = `http://localhost:${PORT}${BASE}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFrames(page, n, timeoutMs = 240000) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((target) => (window.__higata?.frameCount ?? 0) >= target, start + n, { timeout: timeoutMs });
}
/** mean sRGB and luminance spread of the image's centre box (fractions of the frame) */
function stats(file, box = [0.3, 0.55, 0.7, 0.9]) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const [x0, y0, x1, y1] = box.map((v, i) => Math.round(v * (i % 2 ? png.height : png.width)));
  let r = 0, g = 0, b = 0, l2 = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * png.width + x) * 4, L = 0.2126 * png.data[o] + 0.7152 * png.data[o + 1] + 0.0722 * png.data[o + 2];
    r += png.data[o]; g += png.data[o + 1]; b += png.data[o + 2]; l2 += L * L; n++;
  }
  r /= n; g /= n; b /= n;
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { rgb: [r, g, b].map((v) => Math.round(v)), ratio: [1, g / r, b / r].map((v) => v.toFixed(3)), sdL: Math.sqrt(Math.max(0, l2 / n - L * L)).toFixed(1) };
}
let exitCode = 0;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch { /* retry */ } await waitFor(500); }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    headless: true, ...(exe ? { executablePath: exe } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => { exitCode = 1; console.error('pageerror:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) { exitCode = 1; console.error('console:', m.text().slice(0, 400)); } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 60000 });
  await page.evaluate((q) => window.__higata.updateSettings({ quality: q }), quality);
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 60000 });
  await page.evaluate(() => window.__higata.enterField('kasai_west'));
  await page.waitForFunction(() => window.__higata?.world && window.__higata.player && window.__higata.mode === 'field', null, { timeout: 240000 });
  await page.evaluate((m) => window.__higata.setDebugTime(Date.UTC(2026, m - 1, 15, 3, 0)), month);   // 12:00 JST
  // a spot of clean sand at a given height, near the start, with the ripples well formed
  const find = (lo, hi) => page.evaluate(([lo, hi]) => {
    const t = window.__higata.world.terrain;
    let best = null;
    for (let r = 4; r < 120 && !best; r += 3) for (let a = 0; a < 6.28 && !best; a += 0.2) {
      const x = -100 + r * Math.cos(a), z = -10 + r * Math.sin(a);
      if (!t.inside(x, z, 4)) continue;
      const h = t.heightAt(x, z);
      if (h < lo || h > hi || t.substrateAt(x, z) !== 'sand') continue;
      if (t.substrateAt(x + 2, z) !== 'sand' || t.substrateAt(x, z + 2) !== 'sand') continue;
      best = { x, z, h };
    }
    return best;
  }, [lo, hi]);
  const shot = async (name, spot, { tide, wet, pitch, eye, yaw = 0.6 }) => {
    if (!spot) { console.error('no spot for', name); exitCode = 1; return; }
    await page.evaluate(([s, tide, wet, pitch, eye, yaw]) => {
      const a = window.__higata;
      a.setTideOverride(tide);
      const p = a.player; p.eyeHeight = eye; p.setPose(s.x, s.z, yaw, pitch);
      if (wet !== null) a.world.habitat.wetLevel = wet;
    }, [spot, tide, wet, pitch, eye, yaw]);
    await waitFrames(page, 5);
    if (wet !== null) await page.evaluate((w) => { window.__higata.world.habitat.wetLevel = w; }, wet);
    await waitFrames(page, 2);
    const file = path.join(outDir, `sand-${quality}-${name}.png`);
    await page.screenshot({ path: file });
    console.log(name, JSON.stringify(spot), JSON.stringify(stats(file)));
  };
  const dry = await find(1.1, 1.5), flat = await find(-0.3, 0.1);
  await shot('dry', dry, { tide: -0.6, wet: -0.6, pitch: -0.75, eye: 1.6 });
  await shot('wet', flat, { tide: flat ? flat.h - 0.25 : 0, wet: flat ? flat.h + 0.05 : 0, pitch: -0.35, eye: 1.6 });
  await shot('ripples', flat, { tide: flat ? flat.h - 0.4 : 0, wet: flat ? flat.h - 0.4 : 0, pitch: -1.2, eye: 0.6 });
  await shot('troughs', flat, { tide: flat ? flat.h - 0.03 : 0, wet: flat ? flat.h + 0.1 : 0, pitch: -1.0, eye: 0.7 });
  await browser.close();
} catch (e) {
  console.error(e);
  exitCode = 1;
} finally {
  server.kill();
  process.exit(exitCode);
}
