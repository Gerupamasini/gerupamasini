#!/usr/bin/env node
// In-game close-ups of トビハゼ on the exposed flat at low water (needs `npx vite --port 5199`):
//   node tools/models/tobihaze/gameshots2.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = process.argv[2] ?? 'tests/smoke/out/tobihaze';
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:5199/gerupamasini/';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) console.error('console:', m.text().slice(0, 300)); });
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
await page.evaluate((lvl) => {
  const a = window.__higata;
  const d = new Date(a.clock.nowReal() + 9 * 3600000);
  a.setDebugTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 30) - 9 * 3600000);
  a.setTideOverride(lvl);
}, Number(process.env.TIDE ?? -0.6));
await frames(4);
await page.evaluate(() => window.__higata.teleport('waterline'));
await frames(4);
await page.evaluate(() => window.__higata.forceSpawn());
await frames(30);
const pick = await page.evaluate(() => {
  const a = window.__higata;
  const all = a.creatures.individuals.filter((i) => i.species.id === 'periophthalmus_modestus');
  const w = a.world;
  const rows = all.map((i) => ({ id: i.id, d: i.pos.distanceTo(a.player.position), depth: w.habitat.depthAt(i.pos.x, i.pos.z) }));
  rows.sort((x, y) => (x.depth < 0 ? 0 : 1) - (y.depth < 0 ? 0 : 1) || x.d - y.d);
  const hist = rows.map((r) => r.depth.toFixed(3)).join(' ');
  return { n: all.length, first: rows[0], hist };
});
console.log('pick', JSON.stringify(pick));
if (!pick.first) { await browser.close(); process.exit(1); }
const id = pick.first.id;
// the player stands 3 m off so the animal stays calm; the observation camera goes close
const land = await page.evaluate((id) => {
  const a = window.__higata;
  const g = a.creatures.get(id);
  const ang = g.heading + Math.PI / 2;
  const px = g.pos.x + Math.sin(ang) * 3, pz = g.pos.z + Math.cos(ang) * 3;
  a.player.setPose(px, pz, Math.atan2(-(g.pos.x - px), -(g.pos.z - pz)));
  a.player.pitch = -0.1;
  // the nearest patch of wet, exposed mud: where a fish in the shallows would climb out
  const h = a.world.habitat;
  for (let r = 0.25; r <= 3; r += 0.125) {
    for (let k = 0; k < 24; k++) {
      const t = (k / 24) * Math.PI * 2;
      const x = g.pos.x + Math.sin(t) * r, z = g.pos.z + Math.cos(t) * r;
      const d = h.depthAt(x, z);
      if (d < -0.012 && d > -0.08) return { x, z, d, r };
    }
  }
  return null;
}, id);
console.log('land', JSON.stringify(land));
await frames(3);
await page.evaluate((id) => {
  const a = window.__higata;
  a.enterObserve(a.creatures.get(id));
}, id);
await frames(3);
const camDist = () => page.evaluate((id) => {
  const a = window.__higata;
  const p = a.creatures.anchorOf(id);
  return p ? +a.observation.camera.position.distanceTo(p).toFixed(3) : null;
}, id);
console.log('cam before nudge', await camDist());
await page.evaluate(() => { const a = window.__higata; a.observation.nudge(-1); a.observation.nudge(-1); });
await frames(2);
console.log('cam after nudge', await camDist());
const dbg = () => page.evaluate((id) => window.__higata.creatures.driverOf(id)?.debug, id);
const shots = (process.env.SHOTS ?? 'land:30,land:60,land:90,rest:40,forage:60,forage:60,crawl:50,flee:25,flee:25,burrow:60,rest:80,rest:120').split(',');
let landSent = false;
let k = 0;
for (const s of shots) {
  const [what, n] = s.split(':');
  if (what === 'land' && land && !landSent) {
    landSent = true;
    await page.evaluate(({ id, land }) => {
      const a = window.__higata;
      const g = a.creatures.get(id);
      a.creatures.forceIntent(id, { id: -1, kind: 'moveTo', urgency: 0.35, seconds: 30, target: g.pos.clone().set(land.x, g.pos.y, land.z) });
    }, { id, land });
  } else if (what !== 'rest' && what !== 'land') {
    await page.evaluate(({ id, what }) => {
      const a = window.__higata;
      const g = a.creatures.get(id);
      const f = { x: Math.sin(g.heading), z: Math.cos(g.heading) };
      const P = g.pos.clone();
      if (what === 'forage') a.creatures.forceIntent(id, { id: -1, kind: 'forage', urgency: 0.3, seconds: 20 });
      if (what === 'crawl') a.creatures.forceIntent(id, { id: -1, kind: 'moveTo', urgency: 0.3, seconds: 20, target: P.clone().add({ x: f.x * 0.3, y: 0, z: f.z * 0.3 }) });
      if (what === 'flee') a.creatures.forceIntent(id, { id: -1, kind: 'flee', urgency: 1, seconds: 6, from: P.clone().add({ x: -f.x * 0.6, y: 0, z: -f.z * 0.6 }) });
      if (what === 'burrow') a.creatures.forceIntent(id, { id: -1, kind: 'burrow', urgency: 0.5, seconds: 8 });
    }, { id, what });
  }
  await frames(Number(n));
  const file = `${String(k++).padStart(2, '0')}-${what}.png`;
  await page.screenshot({ path: path.join(outDir, file) });
  console.log(file, JSON.stringify(await dbg()), 'cam', await camDist());
}
await browser.close();
