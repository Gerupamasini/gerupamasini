#!/usr/bin/env node
// 東なぎさ (kasai_west) views: run `npm run build` first. Opens the flat in headless Chromium on a summer noon and
// saves a few ground views, a high view over the enclosure and the map overlay to tests/smoke/out/kasai-*.png.
//   node tests/smoke/kasai-east.mjs [--tide 0.2] [--month 7]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tests', 'smoke', 'out');
fs.mkdirSync(outDir, { recursive: true });
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const tide = opt('--tide', 0.2), month = opt('--month', 7);
const PORT = 4175;
const BASE = process.env.VITE_BASE ?? '/gerupamasini/';
const url = `http://localhost:${PORT}${BASE}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFrames(page, n, timeoutMs = 180000) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((target) => (window.__higata?.frameCount ?? 0) >= target, start + n, { timeout: timeoutMs });
}
let exitCode = 0;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch { /* retry */ } await waitFor(500); }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    headless: true, ...(exe ? { executablePath: exe } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => { exitCode = 1; console.error('pageerror:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) console.error('console:', m.text().slice(0, 300)); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 60000 });
  await page.evaluate(() => window.__higata.updateSettings({ quality: 'low' }));
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 60000 });
  await page.evaluate(() => window.__higata.enterField('kasai_west'));
  await page.waitForFunction(() => window.__higata?.world && window.__higata.player && window.__higata.mode === 'field', null, { timeout: 180000 });
  await page.evaluate(([m, t]) => {
    const a = window.__higata;
    a.setDebugTime(Date.UTC(2026, m - 1, 15, 3, 0));   // 12:00 JST
    a.setTideOverride(t);
  }, [month, tide]);
  await waitFrames(page, 6);
  const shot = async (name, x, z, yaw, pitch, eye) => {
    await page.evaluate(([x, z, yaw, pitch, eye]) => { const p = window.__higata.player; p.eyeHeight = eye; p.setPose(x, z, yaw, pitch); }, [x, z, yaw, pitch, eye]);
    await waitFrames(page, 4);
    await page.screenshot({ path: path.join(outDir, `kasai-m${month}-${name}.png`) });
    console.log('saved', name);
  };
  const s = await page.evaluate(() => window.__higata.world.map.spawnStart);
  await shot('spawn', s.x, s.z, (s.heading * Math.PI) / 180, -0.12, 1.6);
  await shot('levee-north', -40, -100, 0, -0.18, 1.6);          // toward the north levee over the berm
  await shot('levee-west', -95, 10, Math.PI / 2, -0.15, 1.6);    // toward the west levee
  await shot('mouth', 20, 60, Math.PI, -0.1, 1.6);               // out through the mouth
  await shot('reeds', -110, 6, Math.PI / 2, -0.05, 1.6);         // close by the reeds on the west berm
  await shot('stakes', -86, 118, Math.PI * 0.95, -0.2, 1.6);     // the bamboo stakes off the spit
  await shot('aerial', 0, 120, 0, -0.75, 140);                    // high over the mouth, looking in
  await page.evaluate(() => { window.__higata.player.eyeHeight = 1.6; window.__higata.toggleMap(); });
  await waitFrames(page, 4);
  await page.screenshot({ path: path.join(outDir, `kasai-m${month}-map.png`) });
  await browser.close();
} catch (e) {
  console.error(e);
  exitCode = 1;
} finally {
  server.kill();
  process.exit(exitCode);
}
