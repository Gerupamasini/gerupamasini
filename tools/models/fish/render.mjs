#!/usr/bin/env node
// Renders each coastal fish (fish/species.ts) in four views (side, front, top, ¾) with the reference viewer in
// headless Chromium: node tools/models/fish/render.mjs [--only suzuki,mejina] [--lod 0] [--jaw 0] [--out <dir>]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(arg('--out', path.join(root, 'docs', 'models', 'fish')));
const all = ['suzuki', 'mejina', 'kisu', 'magochi', 'hirame', 'bora', 'sappa', 'konoshiro', 'ishimochi'];
const only = arg('--only', null)?.split(',') ?? all;
// --photo: the 図鑑's stills (public/data/photos/<species>.jpg, 640 × 400)
const PHOTO = { suzuki: 'lateolabrax_japonicus', mejina: 'girella_punctata', kisu: 'sillago_japonica', magochi: 'platycephalus_sp2', hirame: 'paralichthys_olivaceus', bora: 'mugil_cephalus_adult', sappa: 'sardinella_zunasi', konoshiro: 'konosirus_punctatus', ishimochi: 'pennahia_argentata' };
const lod = Number(arg('--lod', 0)), jaw = Number(arg('--jaw', 0)), head = Number(arg('--head', 0)), photo = args.includes('--photo');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5207;
const url = `http://localhost:${PORT}/gerupamasini/reference/fish-viewer/index.html`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (i > 80) throw new Error('vite did not start');
    await wait(250);
  }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: photo ? { width: 640, height: 400 } : { width: 1200, height: 700 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { console.error('pageerror', e.message); code = 1; });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
  await page.goto(`${url}?fish=${only[0]}&lod=${lod}`);
  await page.waitForFunction(() => window.view?.ready);
  for (const id of only) {
    await page.evaluate(([id, lod, jaw, head, photo]) => window.view.set({ fish: id, lod, jaw, head, photo: photo ? 1 : 0, amp: photo ? 0.05 : 0, curv: photo ? 0.3 : 0, phase: 1.2 }), [id, lod, jaw, head, photo]);
    const file = photo ? path.join(outDir, `${PHOTO[id]}.jpg`) : path.join(outDir, `${id}${lod ? `_lod${lod}` : ''}${jaw ? '_jaw' : ''}${head ? '_head' : ''}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
    console.log(file);
  }
  await browser.close();
} catch (e) { console.error(e); code = 1; } finally {
  try { process.kill(-server.pid); } catch { /* gone */ }
}
process.exit(code);
