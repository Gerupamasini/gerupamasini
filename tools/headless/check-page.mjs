// Open a page from the repo server, wait, print console messages and save a screenshot. usage: node tools/headless/check-page.mjs /dist/yamame-demo.html out.png [waitMs] [w] [h]
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
const [, , pagePath, out = 'check.png', waitMs = '4000', w = '1280', h = '720'] = process.argv;
const { server, port } = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: +w, height: +h } })).newPage();
const logs = []; page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`)); page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`)); page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url().slice(0, 100)}`));
const t0 = Date.now(); await page.goto(`http://127.0.0.1:${port}${pagePath}`); await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out }); console.log('loaded in', Date.now() - t0, 'ms'); console.log(logs.join('\n') || '(no console output)');
await browser.close(); server.close();
