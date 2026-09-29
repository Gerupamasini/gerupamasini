import { serve } from './server.mjs';
import { launch } from './build-model.mjs';
const srv = await serve(8127), browser = await launch(), page = await browser.newPage({ viewport: { width: 420, height: 820 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8127/index.html'); await page.waitForFunction('window.__ready', null, { timeout: 90000 });
await page.waitForTimeout(800); await page.screenshot({ path: 'shots/mobile.png' });
await browser.close(); srv.close();
