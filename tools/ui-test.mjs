import fs from 'node:fs';
import { serve } from './server.mjs';
import { launch } from './build-model.mjs';
const srv = await serve(8126), browser = await launch(), page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:8126/index.html');
await page.waitForFunction('window.__ready', null, { timeout: 90000 });
await page.evaluate(() => { document.getElementById('rot').click(); window.__api.setView('front'); });
await page.waitForTimeout(500);
// click on the right claw
const pt = await page.evaluate(async () => {
  const a = window.__api, n = a.nodes()['R_cheliped_propodus_mesh']; const THREE_V = n.position.constructor;
  const v = new THREE_V(); n.getWorldPosition(v); v.y -= 0.0; const box = (await import('three')).Box3; const b = new box().setFromObject(n); b.getCenter(v);
  v.project(a.camera); const r = a.renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
});
await page.mouse.click(pt.x, pt.y);
const sel = await page.textContent('#sel'); console.log('selected after click:', sel);
const before = await page.evaluate(() => window.__api.nodes()['R_cheliped_propodus'].rotation.z);
await page.evaluate(() => { const i = document.querySelectorAll('#sliders input')[2]; i.value = 10; i.dispatchEvent(new Event('input')); });
const after = await page.evaluate(() => [window.__api.nodes()['R_cheliped_propodus'].rotation.z, window.__api.nodes()['L_cheliped_propodus'].rotation.z]);
console.log('rot.z before/after (R, L mirrored):', before.toFixed(3), after.map((x) => x.toFixed(3)));
fs.mkdirSync('shots', { recursive: true });
await page.screenshot({ path: 'shots/ui.png' });
for (const c of ['Wave', 'Sidewalk']) {
  await page.evaluate((c) => window.__api.freeze(c, 0), c);
  for (const t of [0.4, 0.8]) { await page.evaluate(([c, t]) => window.__api.freeze(c, t), [c, t]); await page.waitForTimeout(300); await page.screenshot({ path: `shots/clip_${c}_${t}.png` }); }
}
console.log('errors:', errs.length ? errs : 'none');
await browser.close(); srv.close();
