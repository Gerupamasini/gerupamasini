// the coastal fishes in the home tank (the game's own renderer): close shots for judging the look
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const root = '/home/user/gerupamasini/', port = 4191;
const url = `http://127.0.0.1:${port}/gerupamasini/`;
const out = process.argv[2] ?? '/tmp/claude-0/tank';
const only = (process.argv[3] ?? 'lateolabrax_japonicus:150').split(',');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(url)).ok) break; } catch {} if (i > 60) throw new Error('no server'); await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load/.test(m.text())) errors.push(m.text()); });
  page.setDefaultTimeout(600000);
  await page.goto(url); await page.waitForFunction(() => !!window.__higata);
  await page.locator('button.primary').first().click(); await page.waitForFunction(() => window.__higata.mode === 'home');
  await page.evaluate(async (only) => {
    const a = window.__higata;
    const records = only.map((s, i) => { const [id, len] = s.split(':'); const sp = a.data.species.get(id); return { id: `fish-${i}`, number: i + 1, speciesId: id, length_mm: Number(len), weight_g: 10, sex: 'f', stage: sp.stages[sp.stages.length - 1].id, traits: [], caughtAt: Date.now(), caughtWhere: [0, 0], tideLevel: 0 }; });
    a.encyclopedia.tankItems.value = records;
    await a.tank.setOccupants(records, (id) => a.data.species.get(id));
    a.tank.setAutoRotate(false); a.tank.frameTank();
  }, only);
  const wait = async (n) => { const f = await page.evaluate(() => window.__higata.frameCount); await page.waitForFunction((k) => window.__higata.frameCount >= k, f + n); };
  await wait(60);
  await page.screenshot({ path: `${out}/tank-wide.png` });
  const n = only.length;
  for (let i = 0; i < Math.min(n, 4); i++) {
    for (const [tag, off] of [['side', [0, 0.01, 1]], ['q', [0.7, 0.35, 0.7]]]) {
      await page.evaluate(([i, off]) => {
        const t = window.__higata.tank, o = t.occupants[i];
        const p = o.root.getWorldPosition(o.root.position.clone()), L = o.ind.length_mm / 1000, h = o.ind.heading;
        // beside the fish: its left flank (+X of the fish turned by its heading)
        const lx = Math.cos(h), lz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
        const d = 1.1 * L;
        t.controls.target.copy(p);
        t.camera.position.set(p.x + (lx * off[2] + fx * off[0]) * d, p.y + off[1] * d, p.z + (lz * off[2] + fz * off[0]) * d);
        t.controls.update();
      }, [i, off]);
      await wait(3);
      await page.screenshot({ path: `${out}/fish${i}-${tag}.png` });
    }
  }
  console.log(JSON.stringify({ errors }));
} finally { await browser?.close(); server.kill(); }
