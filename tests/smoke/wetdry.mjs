#!/usr/bin/env node
// Builds nothing: run `npm run build` first. The drying flat: one place on the default flat seen on the ebb (two hours
// before a midday low water), at the low water, two hours after, and at an evening low water, written to
// tests/smoke/out/wetdry-*.png (and the sunset that day, looking west) and side by side to wetdry-sheet.png. Fails on
// page errors, and when the ground looks the same on the ebb and on the flood (the drying must show).
//   node tests/smoke/wetdry.mjs [--root <dir with a dist>] [--tag <name>] [--quality high|mid|low|minimal] [--above <m>]
//     [--turn <deg>] [--tone aces|agx]
// (--above: how high over the low water the viewpoint stands, 0.6 m by default; --turn: degrees to turn the view (70 by default, off a tide pool)
// from the seaward heading)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(arg('--root', here));
const tag = arg('--tag', 'wetdry');
const quality = arg('--quality', 'high');
const above = Number(arg('--above', 0.6));
const turn = Number(arg('--turn', 70));
const tone = arg('--tone', null);
const outDir = path.join(here, 'tests', 'smoke', 'out');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 4181;
const url = `http://127.0.0.1:${PORT}/gerupamasini/${tone ? `?tone=${tone}` : ''}`;
const server = spawn(process.execPath, [path.join(here, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
async function waitFrames(page, n) {
  const start = await page.evaluate(() => window.__higata?.frameCount ?? 0);
  await page.waitForFunction((t) => (window.__higata?.frameCount ?? 0) >= t, start + n, { timeout: 240000 });
}
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 80) throw new Error('preview server did not start');
    await wait(250);
  }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => { console.error('pageerror', e.message); code = 1; });
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) { console.error('console', m.text().slice(0, 300)); code = 1; } });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__higata?.settings);
  await page.evaluate((q) => window.__higata.updateSettings({ homeQuality: 'low', fieldQuality: q }), quality);
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(() => window.__higata.enterField());
  await page.waitForFunction(() => window.__higata.mode === 'field' && !!window.__higata.world, null, { timeout: 300000 });
  // a low water between 11 and 14 JST, and one between 16 and 19 JST, within the next 40 days
  const lows = await page.evaluate(() => {
    const a = window.__higata, now = a.clock.nowReal();
    const ex = a.world.tide.extrema(now, now + 40 * 86400000).filter((e) => e.kind === 'low');
    const hour = (t) => new Date(t + 9 * 3600000).getUTCHours() + new Date(t + 9 * 3600000).getUTCMinutes() / 60;
    // (the evening one with the sun still up but low: 14:30–16:50 JST, the autumn sun sets about 17)
    return { noon: ex.find((e) => hour(e.t) >= 11 && hour(e.t) <= 14)?.t, evening: ex.find((e) => hour(e.t) >= 14.5 && hour(e.t) <= 16.8)?.t };
  });
  if (!lows.noon || !lows.evening) throw new Error(`no low water found ${JSON.stringify(lows)}`);
  // the view: at the midday low water, from the map's start walk seaward until the ground stands `above` over the
  // water, and look on out to it (the drying flat in front, the freshly exposed band, the water)
  await page.evaluate((t) => { const a = window.__higata; a.clock.useTicket(t); }, lows.noon);
  await waitFrames(page, 3);
  const pose = await page.evaluate(([above, turn]) => {
    const a = window.__higata, w = a.world, tr = w.terrain, s = w.map.spawnStart;
    const yaw = (s.heading * Math.PI) / 180;
    // (the player's forward is (-sin yaw, -cos yaw))
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let x = s.x, z = s.z;
    for (let t = 0; t < 400; t += 0.5) {
      const px = s.x + fx * t, pz = s.z + fz * t;
      if (Math.abs(px) > tr.half - 2 || Math.abs(pz) > tr.half - 2) break;
      // (on bare ground: not in a tide pool)
      if (w.habitat.depthAt(px, pz) > 0) continue;
      x = px; z = pz;
      if (tr.heightAt(px, pz) < w.tideLevel + above) break;
    }
    return { x, z, yaw: yaw + (turn * Math.PI) / 180, ground: tr.heightAt(x, z), water: w.tideLevel };
  }, [above, turn]);
  console.log('view', JSON.stringify(pose));
  // (and the same day's sunset, looking west: 16:50 JST, the autumn sun a few degrees up)
  const day0 = Math.floor((lows.noon + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000;
  const stages = [['a-ebb', lows.noon - 2 * 3600000], ['b-low', lows.noon], ['c-flood', lows.noon + 2 * 3600000], ['d-evening', lows.evening], ['e-sunset', day0 + 16.83 * 3600000, Math.PI / 2]];
  const shots = [];
  for (const [name, t, yaw] of stages) {
    await page.evaluate(([t, p, yaw]) => {
      const a = window.__higata;
      a.clock.useTicket(t);
      a.player.setPose(p.x, p.z, yaw ?? p.yaw);
      a.player.pitch = -0.32;
      document.querySelector('#ui')?.setAttribute('style', 'display:none');
    }, [t, pose, yaw ?? null]);
    await waitFrames(page, 8);
    const file = path.join(outDir, `${tag}-${name}.png`);
    await page.screenshot({ path: file });
    shots.push(PNG.sync.read(fs.readFileSync(file)));
    const level = await page.evaluate(() => window.__higata.world.tideLevel.toFixed(2));
    console.log(`${name}: tide ${level} m`);
  }
  // the ground (the lower half) freshly out of the water against hours later: the drying must show
  {
    const [a, c] = [shots[0], shots[2]];
    let se = 0, n = 0;
    for (let i = (a.data.length / 2) & ~3; i < a.data.length; i += 4) for (let k = 0; k < 3; k++) { const d = a.data[i + k] - c.data[i + k]; se += d * d; n++; }
    const db = 10 * Math.log10((255 * 255 * n) / Math.max(se, 1e-9));
    console.log(`ground, ebb against flood: ${db.toFixed(1)} dB`);
    if (db > 40) { console.error('FAIL the ground did not change between the ebb and the flood'); code = 1; }
  }
  // all of them side by side, at half size
  const w = shots[0].width / 2, h = shots[0].height / 2;
  const sheet = new PNG({ width: w * 2, height: h * Math.ceil(shots.length / 2) });
  shots.forEach((s, n) => {
    const ox = (n % 2) * w, oy = Math.floor(n / 2) * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = ((y * 2) * s.width + x * 2) * 4, di = ((oy + y) * sheet.width + ox + x) * 4;
      for (let c = 0; c < 4; c++) sheet.data[di + c] = s.data[si + c];
    }
  });
  fs.writeFileSync(path.join(outDir, `${tag}-sheet.png`), PNG.sync.write(sheet));
  console.log(`sheet: tests/smoke/out/${tag}-sheet.png`);
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
