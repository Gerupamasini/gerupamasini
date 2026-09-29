import fs from 'node:fs';
import { serve } from './server.mjs';
import { launch } from './build-model.mjs';
const views = (process.argv[2] || 'front,top,side,under,claw,leg').split(',');
const srv = await serve(8124), browser = await launch(), page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto('http://localhost:8124/index.html');
await page.waitForFunction('window.__ready', null, { timeout: 60000 });
await page.evaluate(() => { document.getElementById('rot').click(); document.getElementById('ui').style.display = 'none'; });
fs.mkdirSync('shots', { recursive: true });
for (const v of views) { await page.evaluate((v) => window.__api.setView(v), v); await page.waitForTimeout(600); await page.screenshot({ path: `shots/${v}.png` }); }
await browser.close(); srv.close();
