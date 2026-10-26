// The coastal fishes in the home tank (the game's own renderer), for judging their look and their swimming:
//   node tests/smoke/aquarium-fish.mjs <outDir> [species:mm,...]                 close shots of each (side, ¾)
//   node tests/smoke/aquarium-fish.mjs <outDir> [species:mm,...] --seq i n d    n frames following fish i from its
//                                                                                left at d body lengths (d < 0: above)
// (npm run build first; the frames are 0.1 s of the game apart, the longest step the game takes)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const seqAt = args.indexOf('--seq');
const seq = seqAt >= 0 ? args.slice(seqAt + 1, seqAt + 4).map(Number) : null;
const pos = seqAt >= 0 ? args.slice(0, seqAt) : args;
const out = path.resolve(pos[0] ?? path.join(os.tmpdir(), 'aquarium-fish'));
const only = (pos[1] ?? 'lateolabrax_japonicus:150').split(',');
const port = 4191;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
fs.mkdirSync(out, { recursive: true });
const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
let code = 0;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ } if (i > 60) throw new Error('no server'); await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: seq ? { width: 900, height: 560 } : { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load/.test(m.text())) errors.push(m.text()); });
  page.setDefaultTimeout(600000);
  await page.goto(url); await page.waitForFunction(() => !!window.__higata);
  await page.locator('button.primary').first().click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(async ([only, hideUi]) => {
    const a = window.__higata;
    const records = only.map((s, i) => { const [id, len] = s.split(':'); const sp = a.data.species.get(id); return { id: `fish-${i}`, number: i + 1, speciesId: id, length_mm: Number(len), weight_g: 10, sex: 'f', stage: sp.stages[sp.stages.length - 1].id, traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 }; });
    a.encyclopedia.tankItems.value = records;
    await a.tank.setOccupants(records, (id) => a.data.species.get(id));
    a.tank.setAutoRotate(false); a.tank.frameTank();
    if (hideUi) document.querySelectorAll('body *').forEach((e) => { if (!(e instanceof HTMLCanvasElement) && !e.querySelector('canvas')) e.style.visibility = 'hidden'; });
  }, [only, !!seq]);
  const wait = async (n) => { const f = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction((k) => window.__higata.frameCount >= k, f + n); };
  await wait(60);
  // the camera beside a fish: its own left (+X of its frame, level), `off` = [forward, up, left] in body lengths, or above it
  const look = (i, off) => page.evaluate(([i, off]) => {
    const t = window.__higata.tank, o = t.occupants[i];
    const p = o.root.getWorldPosition(o.root.position.clone()), L = o.ind.length_mm / 1000;
    const e = o.root.matrixWorld.elements, n = Math.hypot(e[0], e[2]) || 1, lx = e[0] / n, lz = e[2] / n, fx = -lz, fz = lx;
    t.controls.target.copy(p);
    if (off === null) t.camera.position.set(p.x - lx * 0.3 * L, p.y + 0.9 * L, p.z - lz * 0.3 * L);
    else t.camera.position.set(p.x + (lx * off[2] + fx * off[0]) * L, p.y + off[1] * L, p.z + (lz * off[2] + fz * off[0]) * L);
    t.controls.update();
  }, [i, off]);
  if (seq) {
    const [i, n, d] = seq;
    for (let k = 0; k < n; k++) {
      await look(i, d < 0 ? null : [0, 0.1, d]);
      await wait(1);
      await page.screenshot({ path: path.join(out, `seq${String(k).padStart(2, '0')}.png`) });
    }
  } else {
    await page.screenshot({ path: path.join(out, 'tank-wide.png') });
    for (let i = 0; i < Math.min(only.length, 4); i++) {
      for (const [tag, off] of [['side', [0, 0.01, 1.1]], ['q', [0.77, 0.39, 0.77]]]) {
        await look(i, off);
        await wait(3);
        await page.screenshot({ path: path.join(out, `fish${i}-${tag}.png`) });
      }
    }
  }
  if (errors.length) { code = 1; console.error(errors.join('\n')); }
  console.log(out);
} catch (e) { console.error(e); code = 1; } finally { await browser?.close(); server.kill(); }
process.exit(code);
