// node tools/debug-shot.mjs "<js to eval before shot>" out.png cx,cy,cz tx,ty,tz
import fs from 'node:fs';
import { serve } from './server.mjs';
import { launch } from './build-model.mjs';
const [code, out, c, t] = process.argv.slice(2);
const srv = await serve(8125), browser = await launch(), page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8125/index.html');
await page.waitForFunction('window.__ready', null, { timeout: 90000 });
await page.evaluate(() => { document.getElementById('rot').click(); document.getElementById('ui').style.display = 'none'; });
await page.evaluate(new Function('api', code || ''), await page.evaluateHandle(() => window.__api));
await page.evaluate(([c, t]) => window.__api.setCam(c.split(',').map(Number), t.split(',').map(Number)), [c, t]);
await page.waitForTimeout(800); fs.mkdirSync('shots', { recursive: true }); await page.screenshot({ path: `shots/${out}` });
await browser.close(); srv.close();
