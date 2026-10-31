#!/usr/bin/env node
// The nine coastal fishes (src/creatures/fish) on the Tokyo Bay maps, 東なぎさ and 走水: through a day's tides (a fixed
// autumn day, when every one of them has a rule), standing at the waterline, at the map's start and in the deepest
// water the player can wade, each species whose rules name the map is spawned there at least once; the adult ボラ
// (the coastal fish's mullet, 20 cm and over) as well as the ハク. Needs `npm run build`.
// Positions: the map's start, the waterline, the deepest wadeable water, the oyster reef (東なぎさ) or the eelgrass (走水).
//   node tests/smoke/tokyo-bay-fish.mjs [map …]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 4193;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const NINE = ['lateolabrax_japonicus', 'girella_punctata', 'sillago_japonica', 'platycephalus_sp2', 'paralichthys_olivaceus', 'mugil_cephalus', 'sardinella_zunasi', 'konosirus_punctatus', 'pennahia_argentata'];
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['kasai_west', 'hashirimizu'];
// 2026-10-15, 09:00 JST: autumn
const DAY = Date.UTC(2026, 9, 15, 0, 0);
const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p) && fs.statSync(p).isFile());
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser, code = 0;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(url)).ok) break; } catch { /* starting */ } if (i > 60) throw new Error('no preview server'); await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.setDefaultTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url); await page.waitForFunction(() => !!window.__higata);
  await page.evaluate(() => window.__higata.updateSettings({ quality: 'low' }));
  await page.locator('button.primary').first().click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  const frames = async (n) => { const f = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction((k) => window.__higata.frameCount >= k, f + n); };
  for (const mapId of maps) {
    await page.evaluate((m) => window.__higata.enterField(m), mapId);
    await page.waitForFunction((m) => window.__higata.world?.map.id === m && window.__higata.mode === 'field', mapId);
    await frames(5);
    // the species this map's rules name, and the day's tides: each high and low water and the half-way between
    const { expected, times } = await page.evaluate(([nine, day, m]) => {
      const a = window.__higata;
      const expected = nine.filter((id) => a.data.species.get(id).spawn.some((r) => !r.maps || r.maps.includes(m)));
      const ex = a.world.tide.extrema(day, day + 24 * 3600000).map((e) => e.t);
      const times = [];
      for (let i = 0; i < ex.length; i++) { times.push(ex[i]); if (i + 1 < ex.length) times.push((ex[i] + ex[i + 1]) / 2); }
      return { expected, times };
    }, [NINE, DAY, mapId]);
    const seen = new Map();
    for (const t of times) {
      // (and where メジナ lives: the oyster reef's stones on 東なぎさ, the eelgrass on 走水)
      for (const where of ['spawn', 'waterline', 'deep', mapId === 'kasai_west' ? 'oysters' : 'amamo']) {
        await page.evaluate((t) => window.__higata.setDebugTime(t), t);
        await frames(3);
        await page.evaluate((where) => {
          const a = window.__higata, w = a.world, h = w.habitat;
          if (where === 'deep') {
            // the deepest water the player can stand in, away from the map's edge
            let best = null, bd = -1;
            for (let k = 0; k < h.cn * h.cn; k++) {
              const [x, z] = h.coarseCenter(k % h.cn, Math.floor(k / h.cn));
              const d = h.depthAt(x, z);
              if (d > bd && d < (w.map.wading?.maxDepth_m ?? 0.6) && Math.abs(x) < w.terrain.half - 20 && Math.abs(z) < w.terrain.half - 20) { bd = d; best = [x, z]; }
            }
            if (best) a.player.setPose(best[0], best[1], a.player.yaw);
          } else a.teleport(where);
          a.forceSpawn();
        }, where);
        await frames(12);
        const here = await page.evaluate((nine) => window.__higata.creatures.individuals.filter((i) => nine.includes(i.species.id)).map((i) => [i.species.id, i.length_mm]), NINE);
        for (const [id, len] of here) {
          const k = id === 'mugil_cephalus' ? (len >= 200 ? 'mugil_cephalus' : 'mugil_cephalus (ハク・スバシリ)') : id;
          seen.set(k, Math.max(seen.get(k) ?? 0, here.filter(([j, l]) => j === id && (id !== 'mugil_cephalus' || (l >= 200) === (len >= 200))).length));
        }
      }
    }
    const missing = expected.filter((id) => !seen.has(id));
    console.log(mapId, JSON.stringify(Object.fromEntries(seen)));
    if (missing.length) { console.error(`FAIL ${mapId}: never spawned: ${missing.join(', ')}`); code = 1; } else console.log(`PASS ${mapId}: ${expected.length} of the nine coastal fishes spawn through the day`);
  }
  if (errors.length) { console.error('page errors', errors); code = 1; }
} catch (e) { console.error(e); code = 1; } finally {
  await browser?.close();
  server.kill();
}
process.exit(code);
