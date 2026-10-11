#!/usr/bin/env node
// Quick visual pass (≈2 min): daylight shots of the runnel, waterline, creek and a dusk shot. Run `npm run build` first.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tests', 'smoke', 'out', 'visual');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 4176, BASE = process.env.VITE_BASE ?? '/gerupamasini/', url = `http://localhost:${PORT}${BASE}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFrames(page, n) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((target) => (window.__higata?.frameCount ?? 0) >= target, start + n, { timeout: 120000 });
}
let code = 0;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* retry */ } await waitFor(500); }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => { console.error('pageerror:', e.message); code = 1; });
  page.on('console', (m) => { if (m.type() === 'error') { console.error('console:', m.text().slice(0, 200)); } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen'), null, { timeout: 60000 });
  await page.evaluate(() => window.__higata.updateSettings({ quality: 'mid' }));
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata?.mode === 'home', null, { timeout: 60000 });
  await page.evaluate(() => window.__higata.enterField());
  await page.waitForFunction(() => window.__higata?.mode === 'field', null, { timeout: 120000 });
  const at = (h) => page.evaluate((h) => { const a = window.__higata; const d = new Date(a.clock.nowReal() + 9 * 3600000); a.setDebugTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, 0) - 9 * 3600000); }, h);
  const shot = async (name, n = 6) => { await waitFrames(page, n); await page.screenshot({ path: path.join(outDir, name) }); };
  await at(13);
  await page.evaluate(() => { const a = window.__higata; a.setTideOverride(0.1); a.teleport('runnel'); a.player.pitch = -0.1; });
  await shot('runnel-13h-tide10.png', 10);
  await page.evaluate(() => { const a = window.__higata; a.player.yaw += Math.PI; });
  await shot('runnel-north.png');
  await page.evaluate(() => { const a = window.__higata; a.setTideOverride(-0.6); a.teleport('waterline'); a.player.pitch = -0.2; });
  await shot('waterline-lowtide.png', 8);
  await page.evaluate(() => { const a = window.__higata; a.player.pitch = -0.8; });
  await shot('waterline-down.png');
  await page.evaluate(() => { const a = window.__higata; a.setTideOverride(0.3); a.teleport('creek'); a.player.pitch = -0.25; });
  await shot('creek.png', 8);
  await page.evaluate(() => { const a = window.__higata; a.setTideOverride(-0.5); a.teleport('pool'); a.player.pitch = -0.45; });
  await shot('pool.png', 8);
  await page.evaluate(() => { const a = window.__higata; a.player.pitch = -0.9; });
  await shot('pool-down.png', 6);
  await page.evaluate(() => { const a = window.__higata; a.setTideOverride(-0.2); a.teleport('waterline'); a.player.pitch = -0.55; a.player.setPose(a.player.position.x, a.player.position.z + 3, Math.PI); });
  await shot('shallow-down.png', 8);
  await at(18);
  await page.evaluate(() => { const a = window.__higata; a.setTideOverride(0.0); a.teleport('runnel'); a.player.pitch = -0.1; });
  await shot('runnel-18h.png', 8);
  await at(21);
  await shot('runnel-21h.png', 8);
  await page.evaluate(() => { const a = window.__higata; a.setTideOverride(null); a.setDebugTime(null); });
  await browser.close();
  console.log(`ok: ${path.relative(root, outDir)}`);
} catch (e) { console.error(e); code = 1; } finally { server.kill(); }
process.exit(code);
