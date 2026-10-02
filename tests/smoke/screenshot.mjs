#!/usr/bin/env node
// Builds nothing: run `npm run build` first. Serves dist with vite preview, opens the game in headless Chromium
// (SwiftShader WebGL) and saves screenshots to tests/smoke/out/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tests', 'smoke', 'out');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 4173;
const BASE = process.env.VITE_BASE ?? '/gerupamasini/';
const url = `http://localhost:${PORT}${BASE}`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await waitFor(500);
  }
  throw new Error('preview server did not start');
}

let exitCode = 0;
/** wait until the game rendered n more frames (software GL can be very slow) */
async function waitFrames(page, n, timeoutMs = 120000) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((target) => (window.__higata?.frameCount ?? 0) >= target, start + n, { timeout: timeoutMs });
}
try {
  await waitServer();
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    headless: true,
    ...(exe ? { executablePath: exe } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // the software renderer can stall for a long time on a heavy frame (shader compiles, environment refresh)
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('pageerror', (e) => { errors.push(`pageerror: ${e.message}`); console.error('pageerror:', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')); });
  // a blocked font CDN in a sandbox is not a page error: resource failures are reported but do not fail the run
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const text = m.text(); if (/net::ERR_|Failed to load resource|Context Lost|Context Restored/.test(text)) { console.error('notice:', text.slice(0, 200)); return; } if (m.type() === 'warning') { console.error('warning:', text.slice(0, 300)); return; } errors.push(`console: ${text}`); console.error('console:', text.slice(0, 300)); } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'), null, { timeout: 60000 });
  await page.screenshot({ path: path.join(outDir, '01-title.png') });
  await page.evaluate(() => window.__higata.updateSettings({ quality: 'low' }));
  const titleBtn = page.locator('button.primary').first();
  await titleBtn.click();
  await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 60000 });
  await waitFrames(page, 8);
  await page.screenshot({ path: path.join(outDir, '01b-home.png') });
  await page.evaluate(() => window.__higata.openOverlay('tidetable'));
  await waitFrames(page, 3);
  await page.screenshot({ path: path.join(outDir, '01c-tidetable.png') });
  await page.evaluate(() => window.__higata.closeOverlay());
  await page.evaluate(() => window.__higata.enterField());
  await page.waitForFunction(() => window.__higata && window.__higata.world && window.__higata.player && window.__higata.mode === 'field', null, { timeout: 120000 });
  // daylight for the visual checks (debug clock), real clock again for the ticket test below
  const noon = () => page.evaluate(() => { const a = window.__higata; const d = new Date(a.clock.nowReal() + 9 * 3600000); a.setDebugTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 30) - 9 * 3600000); });
  await noon();
  await waitFrames(page, 6);
  await page.screenshot({ path: path.join(outDir, '02-field.png') });
  // look around: turn 90° left and tilt down, then towards the sea
  await page.evaluate(() => { const a = window.__higata; a.player.yaw += Math.PI / 2; a.player.pitch = -0.25; });
  await waitFor(400);
  await page.screenshot({ path: path.join(outDir, '03-field-left.png') });
  await page.evaluate(() => { const a = window.__higata; a.player.yaw = Math.PI; a.player.pitch = -0.1; a.player.setPose(0, 20, Math.PI); });
  await waitFor(400);
  await page.screenshot({ path: path.join(outDir, '04-flat-south.png') });
  // low tide / evening via a ticket: find next low water today
  await page.evaluate(() => {
    const a = window.__higata;
    a.setDebugTime(null);
    const now = a.clock.nowReal();
    const ex = a.world.tide.extrema(now, now + 2 * 86400000);
    const low = ex.find((e) => e.kind === 'low');
    if (low) a.clock.useTicket(low.t);
  });
  await waitFor(800);
  await page.screenshot({ path: path.join(outDir, '05-low-tide.png') });
  await page.evaluate(() => { const a = window.__higata; const now = a.clock.nowReal(); const d = new Date(now + 9 * 3600000); const h = d.getUTCHours(); a.clock.useTicket(now + ((18.5 - h) * 3600000)); a.player.yaw = Math.PI * 0.75; });
  await waitFor(800);
  await page.screenshot({ path: path.join(outDir, '06-evening.png') });
  // stand at the waterline at the current tide and look across the shallows
  await noon();
  // the world runs on the debug clock here, so place the player from the world's own water level
  await page.evaluate(() => { const a = window.__higata; a.clock.cancelTicket(); a.teleport('waterline'); a.player.pitch = -0.35; });
  await waitFor(4500);
  await page.screenshot({ path: path.join(outDir, '07-waterline.png') });
  // make sure the close-up steps below have something to look at
  const gobyCount = await page.evaluate(() => window.__higata.creatures.individuals.filter((i) => i.species.id === 'acanthogobius_flavimanus').length);
  if (gobyCount === 0) {
    console.log('no goby around the waterline, forcing a spawn');
    await page.evaluate(() => window.__higata.forceSpawn());
    await waitFrames(page, 10);
  }
  // close-ups of the placeholder species when they are around
  for (const [sid, file] of [['exopalaemon_orientis', '14-shrimp.png'], ['charadrius_alexandrinus', '15-plover.png']]) {
    const found = await page.evaluate((sid) => {
      const a = window.__higata;
      const p = a.player.position;
      const ind = a.creatures.individuals.filter((i) => i.species.id === sid).sort((x, y) => x.pos.distanceTo(p) - y.pos.distanceTo(p))[0];
      if (!ind) return false;
      const dist = sid === 'charadrius_alexandrinus' ? 3 : 0.9;
      const px = ind.pos.x + dist, pz = ind.pos.z;
      a.player.setPose(px, pz, Math.atan2(-(ind.pos.x - px), -(ind.pos.z - pz)));
      a.player.pitch = -Math.atan2(1.6, dist);
      return true;
    }, sid);
    if (found) { await waitFrames(page, 10); await page.screenshot({ path: path.join(outDir, file) }); }
    else console.log(`no ${sid} nearby for a close-up`);
  }
  // walk up to the nearest goby, observe it, catch it, open the zukan and put it in the tank
  const near = await page.evaluate(() => {
    const a = window.__higata;
    const p = a.player.position;
    const gobies = a.creatures.individuals.filter((i) => i.species.id === 'acanthogobius_flavimanus').sort((x, y) => x.pos.distanceTo(p) - y.pos.distanceTo(p));
    const g = gobies[0];
    if (!g) return null;
    const dist = 1.2;
    const ang = Math.random() * Math.PI * 2;
    const px = g.pos.x + Math.sin(ang) * dist, pz = g.pos.z + Math.cos(ang) * dist;
    const yaw = Math.atan2(-(g.pos.x - px), -(g.pos.z - pz));
    a.player.setPose(px, pz, yaw);
    a.player.pitch = -Math.atan2(1.6, dist);
    return { id: g.id, len: g.length_mm };
  });
  console.log('nearest goby', JSON.stringify(near));
  await waitFrames(page, 12);
  await page.screenshot({ path: path.join(outDir, '08-near-goby.png') });
  if (near) {
    await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); }, near.id);
    await waitFrames(page, 12);
    await page.screenshot({ path: path.join(outDir, '09-observe.png') });
    await page.evaluate((id) => { const a = window.__higata; a.exitObserve(); a.startCapture(a.creatures.get(id)); }, near.id);
    await waitFrames(page, 4);
    await page.screenshot({ path: path.join(outDir, '10-capture.png') });
    const beforeAttempt = await page.evaluate(() => { const a = window.__higata; return { mode: a.mode, frames: a.frameCount, state: a.capture.state.value }; });
    console.log('before attempt', JSON.stringify(beforeAttempt));
    await page.evaluate(() => { const a = window.__higata; const st = a.capture.state.value; a.capture.state.value = { ...st, cursor: (st.bandStart + st.bandEnd) / 2 }; a.capture.attempt(); });
    const afterAttempt = await page.evaluate(() => { const a = window.__higata; return { mode: a.mode, state: a.capture.state.value }; });
    console.log('after attempt', JSON.stringify(afterAttempt));
    await page.waitForFunction(() => { const s = window.__higata.capture.state.value; return !!s && s.phase === 'check' && s.revealed; }, null, { timeout: 60000 });
    await waitFrames(page, 2);
    console.log('reveal', JSON.stringify(await page.evaluate(() => { const a = window.__higata; const s = a.capture.state.value; return { phase: s?.phase, revealed: s?.revealed, text: s?.catchText, net: a.net?.group.visible }; })));
    await page.screenshot({ path: path.join(outDir, '10b-net-check.png') });
    await page.waitForFunction(() => window.__higata.mode === 'field', null, { timeout: 60000 });
    console.log('after wait', JSON.stringify(await page.evaluate(() => { const a = window.__higata; return { mode: a.mode, frames: a.frameCount, state: a.capture.state.value, caseCount: a.encyclopedia.caseItems.value.length }; })));
    const caught = await page.evaluate(() => ({ caseCount: window.__higata.encyclopedia.caseItems.value.length, research: window.__higata.encyclopedia.research.value }));
    console.log('after capture', JSON.stringify(caught));
    if (caught.caseCount !== 1) errors.push('capture did not add to the case');
    await page.evaluate(() => window.__higata.openOverlay('zukan'));
    await waitFrames(page, 2);
    await page.screenshot({ path: path.join(outDir, '11-zukan.png') });
    await page.evaluate(() => { const a = window.__higata; a.closeOverlay(); a.enterHome(); a.setHomePanel('tank'); return a.tankPut(a.encyclopedia.caseItems.value[0]); });
    await waitFrames(page, 12);
    await page.screenshot({ path: path.join(outDir, '12-tank.png') });
    await page.evaluate(() => { const a = window.__higata; return a.writeSave(); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('.title-screen'), null, { timeout: 60000 });
    const hasContinue = await page.evaluate(() => [...document.querySelectorAll('.title-actions button, .title-buttons button')].some((b) => b.textContent.includes('つづき')));
    if (!hasContinue) errors.push('no continue button after save');
    await page.evaluate(() => window.__higata.continueGame());
    await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home', null, { timeout: 60000 });
    await page.evaluate(() => window.__higata.enterField());
    await page.waitForFunction(() => window.__higata && window.__higata.world && window.__higata.player && window.__higata.mode === 'field', null, { timeout: 120000 });
    const restored = await page.evaluate(() => ({ research: window.__higata.encyclopedia.research.value, tank: window.__higata.encyclopedia.tankItems.value.length, removed: window.__higata.removed.size }));
    console.log('after reload', JSON.stringify(restored));
    if (restored.research <= 0 || restored.tank !== 1 || restored.removed !== 1) errors.push('save did not restore progress');
    await waitFrames(page, 6);
    await page.screenshot({ path: path.join(outDir, '13-continue.png') });
  } else errors.push('no goby spawned near the player');
  // runnel at mid tide, then debug mode at low tide with markers (daylight)
  await noon();
  await page.evaluate(() => { const a = window.__higata; a.toggleDebug(); a.setTideOverride(0.15); a.teleport('runnel'); a.player.pitch = -0.12; });
  await waitFrames(page, 8);
  await page.screenshot({ path: path.join(outDir, '16-runnel-midtide.png') });
  await page.evaluate(() => { const a = window.__higata; a.setTideOverride(-0.8); a.teleport('waterline'); a.forceSpawn(); });
  await waitFrames(page, 10);
  await page.screenshot({ path: path.join(outDir, '17-debug-lowtide.png') });
  await page.evaluate(() => { const a = window.__higata; a.setTideOverride(null); a.toggleDebug(); a.setDebugTime(null); });
  const stats = await page.evaluate(() => { const a = window.__higata; return { tide: a.world.tideLevel, pools: a.world.habitat.pools.length, calls: a.renderer.gl.info.render.calls, tris: a.renderer.gl.info.render.triangles, creatures: a.creatures?.stats(), species: Object.fromEntries(a.creatures.individuals.reduce((m, i) => m.set(i.species.id, (m.get(i.species.id) ?? 0) + 1), new Map())) }; });
  console.log('stats', JSON.stringify(stats));
  await browser.close();
  if (errors.length) { console.error('page errors:\n' + errors.join('\n')); exitCode = 1; }
  else console.log(`ok: screenshots in ${path.relative(root, outDir)}`);
} catch (e) {
  console.error(e);
  exitCode = 1;
} finally {
  server.kill();
}
process.exit(exitCode);
