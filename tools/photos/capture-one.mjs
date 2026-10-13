// One species' 図鑑 still, taken the way tools/photos/capture.mjs takes them all (the studio page, 640 × 400), with its
// own dev server:  node tools/photos/capture-one.mjs <species_id>   (writes public/data/photos/<id>.jpg, adds it to the index)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const id = process.argv[2];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 5219;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const url = `http://localhost:${PORT}/gerupamasini/tools/photos/studio.html`;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(url)).ok) break; } catch {} if (i > 80) throw new Error('vite'); await wait(250); }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text().slice(0, 500)); });
  await page.goto(url);
  await page.waitForFunction(() => window.photoStudio, null, { timeout: 120000 });
  const name = await page.evaluate((i) => window.photoStudio.show(i), id);
  await page.waitForTimeout(1500);
  await page.locator('canvas').screenshot({ path: `${root}/public/data/photos/${id}.jpg`, type: 'jpeg', quality: 82 });
  console.log('captured', name);
  // the index the 図鑑 reads
  const indexPath = `${root}/public/data/photos/index.json`;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (!index.species.some((s) => s.id === id)) {
    index.species.push({ id, name, file: `${id}.jpg` });
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  }
  await browser.close();
} finally { try { process.kill(-server.pid); } catch {} }
