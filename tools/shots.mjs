import fs from 'node:fs';
import { serve } from './server.mjs';
import { launch } from './build-model.mjs';
// usage: node tools/shots.mjs front,top  |  node tools/shots.mjs "custom:name:cx,cy,cz:tx,ty,tz"  [--ui] [--clip=Wave --t=1.0]
const args = process.argv.slice(2), flags = args.filter((a) => a.startsWith('--')), views = (args.find((a) => !a.startsWith('--')) || 'front;top;side;under;claw;leg').split(';');
const srv = await serve(8124), browser = await launch(), page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto('http://localhost:8124/index.html');
await page.waitForFunction('window.__ready', null, { timeout: 90000 });
const ui = flags.includes('--ui');
await page.evaluate((ui) => { document.getElementById('rot').click(); if (!ui) document.getElementById('ui').style.display = 'none'; }, ui);
const clip = (flags.find((f) => f.startsWith('--clip=')) || '').slice(7), tt = +((flags.find((f) => f.startsWith('--t=')) || '--t=0').slice(4));
if (clip) await page.evaluate(([c, t]) => window.__api.freeze(c, t), [clip, tt]);
fs.mkdirSync('shots', { recursive: true });
for (const v of views) {
  if (v.startsWith('custom:')) { const [, name, c, t] = v.split(':'); await page.evaluate(([c, t]) => window.__api.setCam(c.split(',').map(Number), t.split(',').map(Number)), [c, t]); v2(name); }
  else await page.evaluate((v) => window.__api.setView(v), v);
  await page.waitForTimeout(700); await page.screenshot({ path: `shots/${v.startsWith('custom:') ? v.split(':')[1] : v}.png` });
}
function v2() {}
await browser.close(); srv.close();
