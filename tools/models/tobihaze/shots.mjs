#!/usr/bin/env node
// Screenshots of the トビハゼ viewer: node tools/models/tobihaze/shots.mjs <outDir> "<query>" ["<query>" …]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [outDir, ...queries] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5199;
const page0 = process.env.SHOT_PAGE ?? 'tools/models/tobihaze/viewer/';
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://localhost:${PORT}/gerupamasini/`;
try {
  for (let i = 0; i < 80; i++) { try { const r = await fetch(base); if (r.ok) break; } catch { /* retry */ } await wait(300); }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: Number(process.env.SHOT_W ?? 960), height: Number(process.env.SHOT_H ?? 640) } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(m.type(), m.text().slice(0, 300)); });
  for (const q of queries) {
    await page.goto(`${base}${page0}?${q}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
    const name = q.replace(/[^a-z0-9]+/gi, '_').slice(0, 80) || 'shot';
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log('shot', name);
  }
  await browser.close();
} finally { server.kill(); }
