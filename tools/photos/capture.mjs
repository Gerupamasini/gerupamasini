// npm run dev -- --host 127.0.0.1, then node tools/photos/capture.mjs
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  await page.goto(`${process.env.GAME_URL || 'http://127.0.0.1:5173/gerupamasini'}/tools/photos/studio.html`);
  await page.waitForFunction(() => window.photoStudio);
  const species = await page.evaluate(() => window.photoStudio.species);
  await mkdir('public/data/photos', { recursive: true });
  const index = [];
  for (const id of species) {
    const name = await page.evaluate(id => window.photoStudio.show(id), id);
    await page.waitForTimeout(500);
    await page.locator('canvas').screenshot({ path: `public/data/photos/${id}.jpg`, type: 'jpeg', quality: 82 });
    index.push({ id, name, file: `${id}.jpg` }); console.log(name);
  }
  await writeFile('public/data/photos/index.json', JSON.stringify({ source: 'ゲーム内3Dモデルの静止画像', width: 640, height: 400, species: index }, null, 2) + '\n');
} finally { await browser.close(); }
