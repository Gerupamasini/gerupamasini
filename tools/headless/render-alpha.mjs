// Render a page with a transparent background to PNG (for overlays on photos). usage: node tools/headless/render-alpha.mjs "/viewer/dev/still.html?..&alpha=1" out.png [w] [h]
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
const [, , pagePath, out, w = '1200', h = '800'] = process.argv;
const { server, port } = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 })).newPage();
const logs = []; page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:${port}${pagePath}`);
try { await page.waitForFunction('window.__ready === true', null, { timeout: 120000 }); } catch { logs.push('[harness] timeout'); }
await page.screenshot({ path: out, omitBackground: true });
if (logs.length) console.log(logs.join('\n'));
await browser.close(); server.close();
