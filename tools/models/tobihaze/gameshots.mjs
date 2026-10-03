#!/usr/bin/env node
// In-game screenshots of トビハゼ (needs `npx vite --port 5199` running): node tools/models/tobihaze/gameshots.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = process.argv[2] ?? 'tests/smoke/out/tobihaze';
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:5199/gerupamasini/';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) console.error('console:', m.text().slice(0, 300)); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function frames(n) {
  const s = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((t) => (window.__higata?.frameCount ?? 0) >= t, s + n);
}
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'));
await page.evaluate((q) => window.__higata.updateSettings({ quality: q }), process.env.Q ?? 'mid');
await page.locator('button.primary').first().click();
await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home');
await page.evaluate(() => window.__higata.enterField());
await page.waitForFunction(() => window.__higata && window.__higata.world && window.__higata.player && window.__higata.mode === 'field');
// a summer afternoon at low water
await page.evaluate(() => {
  const a = window.__higata;
  const d = new Date(a.clock.nowReal() + 9 * 3600000);
  a.setDebugTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 0) - 9 * 3600000);
});
await frames(4);
await page.evaluate(() => { const a = window.__higata; a.teleport('waterline'); });
await frames(4);
await page.evaluate(() => window.__higata.forceSpawn());
await frames(20);
const info = await page.evaluate(() => {
  const a = window.__higata;
  const all = a.creatures.individuals.filter((i) => i.species.id === 'periophthalmus_modestus');
  return all.map((i) => ({ id: i.id, x: +i.pos.x.toFixed(2), z: +i.pos.z.toFixed(2), d: +i.pos.distanceTo(a.player.position).toFixed(1), lod: i.lod }));
});
console.log('tobihaze:', JSON.stringify(info));
if (!info.length) { await page.screenshot({ path: path.join(outDir, 'none.png') }); await browser.close(); process.exit(1); }
const target = info.sort((a, b) => a.d - b.d)[0];
const look = async (dist, height, label, yawOff = 0.6) => {
  await page.evaluate(({ id, dist, height, yawOff }) => {
    const a = window.__higata;
    const g = a.creatures.get(id);
    const ang = g.heading + Math.PI / 2 + yawOff;
    const px = g.pos.x + Math.sin(ang) * dist, pz = g.pos.z + Math.cos(ang) * dist;
    a.player.setPose(px, pz, Math.atan2(-(g.pos.x - px), -(g.pos.z - pz)));
    a.player.lowView = true;
    a.player.pitch = -Math.atan2(height, dist);
  }, { id: target.id, dist, height, yawOff });
  await frames(6);
  await page.screenshot({ path: path.join(outDir, `${label}.png`) });
  console.log('shot', label, JSON.stringify(await page.evaluate((id) => window.__higata.creatures.driverOf(id)?.debug, target.id)));
};
await look(1.2, 0.6, '01-field');
await page.evaluate((id) => { const a = window.__higata; a.enterObserve(a.creatures.get(id)); }, target.id);
for (let k = 0; k < 6; k++) {
  await frames(30);
  await page.screenshot({ path: path.join(outDir, `02-observe-${k}.png`) });
  console.log('observe', k, JSON.stringify(await page.evaluate((id) => window.__higata.creatures.driverOf(id)?.debug, target.id)));
}
await browser.close();
