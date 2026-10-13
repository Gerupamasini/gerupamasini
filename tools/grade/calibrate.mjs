#!/usr/bin/env node
// Fits the look of the flat (the sky, the sunset's cast, the wet ground) to photographs of flats. Builds nothing: run
// `npm run build` first. Draws the default flat at a midday low water (looking along the flat) and at sunset (looking
// at the sun), from low on the flat (`--above` m over the low water, 0.3), with each set of look parameters, measures
// the same regions as were measured on the photographs (relative to the horizon) and prints them against the
// photographs' values, with a score (the smaller the closer).
//   node tools/grade/calibrate.mjs [sets.json] [--out <dir>] [--above <m>]
// sets.json: [{ "name": "...", "sky": { scale, saturation, turbidity, turbidityDusk, rayleigh, mie, mieDusk, ozone,
//   ambientDusk }, "terrain": { wetDark, filmTable, filmFarRough }, "grade": { duskTint: [r, g, b] } }, ...]
//   (fields left out keep the game's values). Frames go to tests/smoke/out/grade-<name>-{noon,sunset}.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

/**
 * The photographs' values (sRGB means; b_r: blue minus red, r_g: red over green; spread: the 90th minus the 10th
 * percentile of brightness), measured on five photographs of flats the player sent (2026-10-13): two at midday low
 * water (sand ripples under a cumulus sky, a muddy flat with tide pools), two sunsets over the wet flat taken long
 * (the sun's disc a thirtieth of the width and more: their whole sky is the band just over the horizon), one
 * late-afternoon backlit, wide. The photographs themselves are not in the repository.
 * Regions: skyTop the top 15 % of the frame, skyLow the 1-8 % above the horizon, groundMid 2-15 % below it, groundNear
 * the bottom 10 %. Noon: the two midday photographs' mean. Sunset: the sky over it from the wide one (a pale, neutral
 * grey-lilac, not blue), the band by the horizon and the flat mirroring it from the long sunset and the wide one.
 */
export const PHOTO = {
  noon: {
    skyTop: { rgb: [136, 180, 214], b_r: 78, r_g: 0.75 },
    skyLow: { rgb: [190, 201, 203], b_r: 13, r_g: 0.95 },
    groundMid: { rgb: [132, 143, 150], b_r: 18, r_g: 0.92, spread: 120 },
    groundNear: { rgb: [60, 75, 88], b_r: 28, r_g: 0.84 },
  },
  sunset: {
    skyTop: { b_r: 2, r_g: 1.05 },
    skyLow: { b_r: -45, r_g: 1.6 },
    groundMid: { b_r: -36, r_g: 1.3 },
    groundNear: { b_r: -20, r_g: 1.1 },
  },
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const setsFile = args.find((a, i) => !a.startsWith('--') && !['--out', '--above'].includes(args[i - 1]));
const above = Number(arg('--above', 0.3));
const sets = setsFile ? JSON.parse(fs.readFileSync(setsFile, 'utf8')) : [{ name: 'current' }];
const outDir = path.resolve(arg('--out', path.join(root, 'tests', 'smoke', 'out')));
fs.mkdirSync(outDir, { recursive: true });

function metrics(png, hz) {
  const { width: w, height: h, data } = png;
  const region = (y0, y1) => {
    const a = Math.max(0, Math.round(h * y0)), b = Math.min(h, Math.round(h * y1));
    const sum = [0, 0, 0], lum = [];
    for (let y = a; y < b; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      sum[0] += data[o]; sum[1] += data[o + 1]; sum[2] += data[o + 2];
      lum.push((data[o] + data[o + 1] + data[o + 2]) / 3);
    }
    const n = Math.max(1, lum.length), m = sum.map((s) => s / n);
    lum.sort((p, q) => p - q);
    return { rgb: m.map(Math.round), b_r: Math.round(m[2] - m[0]), r_g: +(m[0] / Math.max(1, m[1])).toFixed(2), spread: Math.round(lum[Math.floor(n * 0.9)] - lum[Math.floor(n * 0.1)]) };
  };
  return { skyTop: region(0, Math.min(0.15, hz - 0.05)), skyLow: region(hz - 0.08, hz - 0.01), groundMid: region(hz + 0.02, hz + 0.15), groundNear: region(0.9, 1) };
}

/** Prints the regions against the photographs'; returns the score (a level of b-r or brightness off counts as much
 * as a hundredth of r/g) */
function report(name, scene, m) {
  const t = PHOTO[scene];
  let score = 0;
  for (const [k, ref] of Object.entries(t)) {
    const g = m[k], parts = [];
    if (ref.rgb) {
      parts.push(`rgb ${g.rgb.join(',')} (photo ${ref.rgb.join(',')})`);
      score += g.rgb.reduce((s, v, i) => s + Math.abs(v - ref.rgb[i]), 0) / 3;
    }
    parts.push(`b-r ${g.b_r} (${ref.b_r})`, `r/g ${g.r_g} (${ref.r_g})`);
    score += Math.abs(g.b_r - ref.b_r) + 100 * Math.abs(g.r_g - ref.r_g);
    if (ref.spread !== undefined) {
      parts.push(`spread ${g.spread} (${ref.spread})`);
      score += Math.abs(g.spread - ref.spread) / 2;
    }
    console.log(`  ${name} ${scene} ${k.padEnd(10)} ${parts.join('  ')}`);
  }
  return score;
}

const PORT = 4191;
const url = `http://127.0.0.1:${PORT}/gerupamasini/`;
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 80) throw new Error('preview server did not start');
    await wait(250);
  }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => { console.error('pageerror', e.message); code = 1; });
  const frames = async (n) => { const s = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction((t) => window.__higata.frameCount >= t, s + n); };
  await page.goto(url);
  await page.waitForFunction(() => !!window.__higata?.settings);
  await page.evaluate(() => window.__higata.updateSettings({ homeQuality: 'low', fieldQuality: 'high' }));
  await page.locator('button.primary').first().click();
  await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(() => window.__higata.enterField());
  await page.waitForFunction(() => window.__higata.mode === 'field' && !!window.__higata.world, null, { timeout: 300000 });
  // a midday low water within the next 40 days, and that day's sunset
  const times = await page.evaluate(() => {
    const a = window.__higata, now = a.clock.nowReal();
    const hour = (t) => { const d = new Date(t + 9 * 3600000); return d.getUTCHours() + d.getUTCMinutes() / 60; };
    const low = a.world.tide.extrema(now, now + 40 * 86400000).find((e) => e.kind === 'low' && hour(e.t) >= 11 && hour(e.t) <= 14).t;
    const day0 = Math.floor((low + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000;
    return { noon: low, sunset: day0 + 16.83 * 3600000 };
  });
  // the viewpoint: from the map's start, seaward to ground `above` over the low water (off the pools), turned along
  // the flat
  await page.evaluate((t) => window.__higata.clock.useTicket(t), times.noon);
  await frames(3);
  const pose = await page.evaluate((above) => {
    const a = window.__higata, w = a.world, tr = w.terrain, s = w.map.spawnStart, yaw = (s.heading * Math.PI) / 180;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let x = s.x, z = s.z;
    for (let t = 0; t < 400; t += 0.5) {
      const px = s.x + fx * t, pz = s.z + fz * t;
      if (Math.abs(px) > tr.half - 2 || Math.abs(pz) > tr.half - 2) break;
      if (w.habitat.depthAt(px, pz) > 0) continue;
      x = px; z = pz;
      if (tr.heightAt(px, pz) < w.tideLevel + above) break;
    }
    document.querySelector('#ui')?.setAttribute('style', 'display:none');
    return { x, z, yaw: yaw + (70 * Math.PI) / 180 };
  }, above);
  const scores = [];
  // (each set starts from the game's values)
  await page.evaluate(() => {
    const w = window.__higata.world;
    window.__lookDefaults = JSON.stringify({ sky: w.sky.look, terrain: Object.fromEntries(Object.entries(w.terrain.look).map(([k, u]) => [k, u.value])), grade: { duskTint: w.grade.duskTint.toArray() } });
  });
  for (const set of sets) {
    await page.evaluate((set) => {
      const w = window.__higata.world, d = JSON.parse(window.__lookDefaults);
      set = { sky: { ...d.sky, ...set.sky }, terrain: { ...d.terrain, ...set.terrain }, grade: { ...d.grade, ...set.grade } };
      Object.assign(w.sky.look, set.sky);
      for (const [k, v] of Object.entries(set.terrain ?? {})) w.terrain.look[k].value = v;
      if (set.grade?.duskTint) w.grade.duskTint.set(...set.grade.duskTint);
      w.sky.invalidateEnvironment();
    }, set);
    let score = 0;
    for (const [scene, t] of [['noon', times.noon], ['sunset', times.sunset]]) {
      await page.evaluate(([t, p]) => {
        const a = window.__higata;
        a.clock.useTicket(t);
        a.player.setPose(p.x, p.z, p.yaw, -0.06);
        a.world.sky.invalidateEnvironment();
      }, [t, pose]);
      // (the sun is placed on the next frame: at sunset the view turns to it after that)
      await frames(2);
      if (scene === 'sunset') {
        await page.evaluate((p) => {
          const a = window.__higata, s = a.world.sunDir;
          a.player.setPose(p.x, p.z, Math.atan2(-s.x, -s.z), -0.06);
        }, pose);
      }
      await frames(10);
      // the horizon's row: a point far out along the view, projected
      const hz = await page.evaluate(() => {
        const a = window.__higata, c = a.camera, d = c.getWorldDirection(c.position.clone());
        const p = c.position.clone().add(d.setY(0).normalize().multiplyScalar(5000)).project(c);
        return 0.5 - p.y / 2;
      });
      const file = path.join(outDir, `grade-${set.name}-${scene}.png`);
      await page.screenshot({ path: file });
      const m = metrics(PNG.sync.read(fs.readFileSync(file)), hz);
      score += report(set.name, scene, m);
    }
    scores.push([set.name, Math.round(score)]);
  }
  console.log(scores.map(([n, s]) => `${n} ${s}`).join('\n'));
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
