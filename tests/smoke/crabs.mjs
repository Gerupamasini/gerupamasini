#!/usr/bin/env node
// コメツキガニ in the real game: a daytime low tide, the nearest colony, the crabs close up, observation, a net
// swing, and the spade on a burrow. Screenshots to tests/smoke/out/crabs-*.png, a summary on stdout.
// Uses `vite preview` of the last build (npm run build first), or an already running server: URL=http://… node …
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tests', 'smoke', 'out');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 4174;
const BASE = process.env.VITE_BASE ?? '/gerupamasini/';
const url = process.env.URL ?? `http://localhost:${PORT}${BASE}`;
const server = process.env.URL ? null : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await waitFor(500);
  }
  throw new Error('server did not start');
}
// the software renderer can take minutes per frame in the macro observation view: FRAME_TIMEOUT (ms) lifts the wait
async function waitFrames(page, n, timeoutMs = Number(process.env.FRAME_TIMEOUT ?? 180000)) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((target) => (window.__higata?.frameCount ?? 0) >= target, start + n, { timeout: timeoutMs });
}

let exitCode = 0;
try {
  await waitServer();
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    headless: true, ...(exe ? { executablePath: exe } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
  page.setDefaultTimeout(Math.max(240000, Number(process.env.FRAME_TIMEOUT ?? 0)));
  const errors = [];
  page.on('pageerror', (e) => { errors.push(`pageerror: ${e.message}`); console.error('pageerror:', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')); });
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text();
    if (/net::ERR_|Failed to load resource|Context Lost|Context Restored|PCFSoftShadowMap/.test(text)) return;
    if (m.type() === 'warning') { console.error('warning:', text.slice(0, 300)); return; }
    errors.push(`console: ${text}`); console.error('console:', text.slice(0, 600));
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 60000 });
  await page.evaluate((q) => window.__higata.updateSettings({ quality: q }), process.env.Q ?? 'mid');
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 60000 });
  await page.evaluate(() => window.__higata.enterField());
  await page.waitForFunction(() => window.__higata?.world && window.__higata.player && window.__higata.mode === 'field', null, { timeout: 180000 });
  // a daytime low tide within the next fortnight, in summer if possible (DOY override for waving)
  const when = await page.evaluate((month) => {
    const a = window.__higata;
    const now = a.clock.nowReal();
    const ex = a.world.tide.extrema(now - 2 * 86400000, now + 16 * 86400000);
    const jstHour = (t) => new Date(t + 9 * 3600000).getUTCHours();
    const low = ex.filter((e) => e.kind === 'low' && jstHour(e.t) >= 10 && jstHour(e.t) <= 15).sort((x, y) => x.level - y.level)[0] ?? ex.find((e) => e.kind === 'low');
    // an hour and a half after low water: the flat has been dry a while, the crabs are out
    a.setDebugTime(low.t);
    if (month === 'summer') a.setCrabSeason(190);
    return { t: low.t, level: low.level };
  }, process.env.SEASON ?? 'calendar');
  console.log('low tide', JSON.stringify(when));
  await page.evaluate(() => { const a = window.__higata; a.teleport('crabs'); a.player.lowView = false; a.player.pitch = -0.55; });
  await waitFrames(page, 20);
  await waitFor(1500);
  await waitFrames(page, 30);
  const s1 = await page.evaluate(() => ({ ...window.__higata.crabs.stats(), pos: window.__higata.player.position.toArray().map((v) => +v.toFixed(2)) }));
  console.log('colony', JSON.stringify(s1));
  await page.screenshot({ path: path.join(outDir, 'crabs-01-standing.png') });
  // crouch near the nearest crab that is out
  const target = await page.evaluate(() => {
    const a = window.__higata;
    const p = a.player.position;
    const live = [...a.crabs.live.values()].map((L) => L.crab).filter((c) => c.behavior.onSurface);
    const all = [...a.crabs.live.values()].map((L) => L.crab);
    const pool = live.length ? live : all;
    pool.sort((x, y) => x.pos.distanceTo(p) - y.pos.distanceTo(p));
    const c = pool[0];
    if (!c) return null;
    const ang = 0.6, dist = 0.55;
    const px = c.pos.x + Math.sin(ang) * dist, pz = c.pos.z + Math.cos(ang) * dist;
    a.player.setPose(px, pz, Math.atan2(-(c.pos.x - px), -(c.pos.z - pz)), -0.55);
    a.player.lowView = true;
    return { state: c.state, cw: c.cw_mm, sex: c.sex, n: all.length, out: live.length };
  });
  console.log('target', JSON.stringify(target));
  await waitFrames(page, 30);
  await page.screenshot({ path: path.join(outDir, 'crabs-02-crouched.png') });
  // observe the nearest visible crab
  const obs = await page.evaluate(() => {
    const a = window.__higata;
    const p = a.player.position;
    const inds = a.creatures.individuals.filter((i) => i.species.id === 'scopimera_globosa' && !a.creatures.driverOf(i.id)?.hidden).sort((x, y) => x.pos.distanceTo(p) - y.pos.distanceTo(p));
    const ind = inds[0];
    if (!ind) return null;
    a.enterObserve(ind);
    return { id: ind.id, len: ind.length_mm, sex: ind.sex };
  });
  console.log('observe', JSON.stringify(obs));
  if (obs) {
    await waitFrames(page, 40);
    await page.screenshot({ path: path.join(outDir, 'crabs-03-observe.png') });
    await page.evaluate(() => window.__higata.observation.nudge(-1));
    await page.evaluate(() => window.__higata.observation.nudge(-1));
    await waitFrames(page, 30);
    await page.screenshot({ path: path.join(outDir, 'crabs-04-observe-close.png') });
    for (let k = 0; k < 3; k++) {
      await waitFor(2500);
      const st = await page.evaluate((id) => window.__higata.creatures.driverOf(id)?.debugText, obs.id);
      console.log('observed state', st);
      await page.screenshot({ path: path.join(outDir, `crabs-05-observe-${k}.png`) });
    }
    const rec = await page.evaluate(() => window.__higata.observation.state.value?.recorded);
    console.log('recorded behaviours', JSON.stringify(rec));
    await page.evaluate(() => window.__higata.exitObserve());
  }
  // stand up and walk toward the crabs: they should bolt for their burrows
  const before = await page.evaluate(() => window.__higata.crabs.stats());
  await page.evaluate(() => { const a = window.__higata; a.player.lowView = false; const p = a.player.position; a.player.setPose(p.x + 1.2, p.z + 1.2, a.player.yaw, -0.6); });
  await waitFrames(page, 20);
  await page.evaluate(() => { const a = window.__higata; const p = a.player.position; a.player.setPose(p.x - 1.2, p.z - 1.2, a.player.yaw, -0.6); });
  await waitFrames(page, 60);
  const after = await page.evaluate(() => window.__higata.crabs.stats());
  console.log('out before/after the approach', before.out, after.out);
  await page.screenshot({ path: path.join(outDir, 'crabs-06-after-approach.png') });
  if (errors.length) { console.error(`${errors.length} errors`); exitCode = 1; }
  await browser.close();
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  server?.kill();
}
process.exit(exitCode);
