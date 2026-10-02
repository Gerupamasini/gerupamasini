#!/usr/bin/env node
// Screenshots of the fictional flat (flat.html) from fixed viewpoints, in headless Chromium (SwiftShader).
// Run `npm run build` first.   node tests/smoke/flat.mjs [--size 1280x720] [--q mid] [--only name,name] [--extra "k=v&..."]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const outDir = path.join(root, 'tests', 'smoke', 'out', 'flat');
fs.mkdirSync(outDir, { recursive: true });
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const q = arg('q', 'mid');
const only = arg('only', '');
const extra = arg('extra', '');
const PORT = 4177, BASE = process.env.VITE_BASE ?? '/gerupamasini/';
const url = `http://localhost:${PORT}${BASE}flat.html?q=${q}&ui=0&fixed${extra ? `&${extra}` : ''}`;

// name: [x, z, yawDeg, pitchDeg, eye, tide?, hour?]
const DEBUG = Number(arg('debug', '0'));
const FRAMES = Number(arg('frames', '6'));
const SHOTS = {
  'photo': [-40, 70, 188, -6, 1.6],
  'sea-view': [-8, 40, 200, -4, 1.6],
  'pool-low': [0, 0, 180, -10, 0.5],
  'ripples-down': [10, -30, 200, -38, 1.6],
  'creek': [-36, 12, 112, -12, 1.6],
  'wall': [20, -140, 0, 4, 1.6],
  'block': [21, -98.6, 0, -24, 1.6],
  'beach-north': [0, -100, 0, -3, 1.6],
  'waterline': [0, 110, 180, -8, 1.6],
  'evening': [-8, 40, 250, -3, 1.6, null, 17.4],
};

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* retry */ } await waitFor(500); }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { console.error('pageerror:', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')); server.kill(); process.exit(1); });
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || /THREE\.WebGLProgram|Shader Error|ERROR:/.test(t)) { console.error(`console.${m.type()}:`, t.slice(0, 4000)); if (m.type() === 'error') code = 1; }
    else if (/\[flat\]/.test(t)) console.log(t);
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__flat && window.__flat.ready, null, { timeout: 600000 });
  console.log(`ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const frames = async (n) => {
    const s = await page.evaluate(() => window.__flat.frames);
    await page.waitForFunction((target) => window.__flat.frames >= target, s + n, { timeout: 600000 });
  };
  await frames(2);
  for (const [name0, s0] of Object.entries(SHOTS)) {
    if (only && !only.split(',').includes(name0)) continue;
    const s = [...s0]; while (s.length < 7) s.push(null); s[7] = DEBUG;
    const name = DEBUG ? `${name0}-dbg${DEBUG}` : name0;
    const t1 = Date.now();
    await page.evaluate((s) => {
      const f = window.__flat;
      if (f.state.hour0 === undefined) f.state.hour0 = f.state.hour;
      f.setTime(s[6] != null ? s[6] : f.state.hour0);
      f.setCam(s[0], s[1], s[2], s[3], s[4]);
      f.setDebug(s[7] ?? 0);
    }, s);
    if (s[5] != null) await page.evaluate((t) => window.__flat.setTide(t), s[5]);
    await frames(FRAMES);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log(`${name}: ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  }
  await browser.close();
} catch (e) { console.error(e); code = 1; } finally { server.kill(); }
process.exit(code);
