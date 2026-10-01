#!/usr/bin/env node
// Headless screenshots of the mudflat scene (higata.html) for checking: serves dist with vite preview,
// opens the page in Chromium (SwiftShader WebGL), advances the simulation and saves PNGs.
//   node tools/scene/shot.mjs <outDir> [query] [--steps "label:seconds:js|..."]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'tests', 'smoke', 'out', 'scene'));
const query = process.argv[3] || '';
const stepsArg = process.argv.indexOf('--steps');
// steps separated by '|', each 'label:seconds:javascript'
const steps = stepsArg > 0 ? process.argv[stepsArg + 1].split('|').filter(Boolean) : ['view:0:'];
const w = Number(process.env.W || 960), h = Number(process.env.H || 540);
fs.mkdirSync(outDir, { recursive: true });
const PORT = 4174;
const BASE = process.env.VITE_BASE ?? '/gerupamasini/';
const url = `http://localhost:${PORT}${BASE}higata.html?nohelp&capture${query ? '&' + query : ''}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch { /* retry */ } await wait(500); }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => { code = 1; console.error('pageerror:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('console:', m.text().slice(0, 600)); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__higataScene && window.__higataScene.frameCount > 2, null, { timeout: 300000 });
  for (const s of steps) {
    const [label, sec, ...rest] = s.split(':');
    const js = rest.join(':');
    if (js) await page.evaluate(js);
    if (Number(sec) > 0) await page.evaluate((t) => window.__higataScene.step(t), Number(sec));
    const n = await page.evaluate(() => window.__higataScene.frameCount);
    await page.waitForFunction((t) => window.__higataScene.frameCount >= t, n + Number(process.env.FRAMES || 3), { timeout: 600000 });
    await page.screenshot({ path: path.join(outDir, `${label}.png`), timeout: 300000 });
    console.log('saved', label);
  }
  await browser.close();
} catch (e) { console.error(e); code = 1; } finally { server.kill(); }
process.exit(code);
