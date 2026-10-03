#!/usr/bin/env node
// Dev helper: screenshots of the コメツキガニ viewer (headless Chromium, SwiftShader).
// usage: node tools/viewers/shoot.mjs <outDir> "<name>?<query>" ...   (vite dev server must be running on PORT)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.PORT ?? 5199);
const outDir = process.argv[2];
const shots = process.argv.slice(3);
fs.mkdirSync(outDir, { recursive: true });
const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(m.type(), m.text().slice(0, 1500)); });
for (const s of shots) {
  const [name, query] = s.split('?');
  const page2 = page;
  await page2.goto(`http://localhost:${PORT}/gerupamasini/tools/viewers/kometsukigani/index.html?${query ?? ''}`, { waitUntil: 'load' });
  await page2.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  if (process.env.WAIT) await page2.waitForTimeout(Number(process.env.WAIT));
  await page2.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('shot', name);
}
await browser.close();
