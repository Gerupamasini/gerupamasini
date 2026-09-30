// node tools/compare.mjs  -> shots/cmp_<name>.png : reference photo (left) vs render from a matched camera (right)
import fs from 'node:fs';
import { serve } from './server.mjs';
import { launch } from './build-model.mjs';
const C = {
  p02_1: { cam: [0.0, 0.55, 3.6], tg: [0, 0.35, 0.3], note: 'front, claws folded' },
  p06_0: { cam: [3.7, 0.7, 1.2], tg: [0, 0.3, 0.3], note: 'side' },
  p13_0: { cam: [2.4, 0.9, 3.0], tg: [0, 0.3, 0.3], note: '3/4 front' },
  p25_0: { cam: [-0.4, 1.4, -3.4], tg: [0, 0.3, 0], note: 'rear/dorsal' },
  p21_1: { cam: [2.9, 1.4, 2.3], tg: [0, 0.35, 0.3], note: '3/4 front high' },
  p24_1: { cam: [0.0, 0.8, 4.3], tg: [0, 0.3, 0.3], note: 'front, low' },
  p14_0: { cam: [2.2, 2.6, 2.2], tg: [0, 0.3, 0.3], note: 'high, one claw raised' },
};
const which = (process.argv[2] || Object.keys(C).join(',')).split(',');
const pose = process.argv[3] || '';
const srv = await serve(8129), browser = await launch(), page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8129/index.html'); await page.waitForFunction('window.__ready', null, { timeout: 90000 });
await page.evaluate(() => { document.getElementById('rot').click(); document.getElementById('ui').style.display = 'none'; window.__api.camera.fov = 26; window.__api.camera.updateProjectionMatrix(); });
if (pose) await page.evaluate(new Function('api', pose), await page.evaluateHandle(() => window.__api));
fs.mkdirSync('shots', { recursive: true });
for (const k of which) {
  await page.evaluate(([c, t]) => window.__api.setCam(c, t), [C[k].cam, C[k].tg]);
  await page.waitForTimeout(500); await page.screenshot({ path: `shots/r_${k}.png` });
}
await browser.close(); srv.close();
