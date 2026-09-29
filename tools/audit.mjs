// Renders a fixed set of audit views to shots/audit_*.png (optionally with a pose expression)
import fs from 'node:fs';
import { serve } from './server.mjs';
import { launch } from './build-model.mjs';
const V = {
  face: ['0.5,1.1,2.4', '0.05,0.55,0.4'], top: ['0,4.2,0.9', '0,0.3,0.1'], side: ['3.6,1.2,0.3', '0,0.5,0.1'], rear: ['-1.2,1.4,-3.2', '0,0.45,0'],
  claw: ['1.6,0.8,2.0', '0.25,0.3,0.7'], eye: ['0.5,1.5,1.5', '0.15,0.7,0.3'], leg: ['2.6,0.9,1.2', '1.0,0.3,0.05'], joint: ['1.5,1.0,0.9', '0.7,0.35,0.1'],
  fing: ['1.2,0.2,1.7', '0.35,0.1,0.85'], cornea: ['0.25,1.1,1.1', '0.3,0.75,0.3'], edge: ['-2.0,1.0,0.6', '-0.4,0.3,0.1'], hero: ['-3.0,2.4,4.2', '0,0.4,0.2'], hero2: ['3.4,1.6,3.6', '0,0.4,0.2'], abd: ['0,-2.0,-0.3', '0,0,-0.15'], under: ['0,-2.6,1.2', '0,0,0.1'],
};
const which = (process.argv[2] || Object.keys(V).join(',')).split(',');
const srv = await serve(8128), browser = await launch(), page = await browser.newPage({ viewport: { width: 900, height: 620 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8128/index.html'); await page.waitForFunction('window.__ready', null, { timeout: 90000 });
await page.evaluate(() => { document.getElementById('rot').click(); document.getElementById('ui').style.display = 'none';
  const api = window.__api; api.scene.traverse((o) => { if (o.name === 'Ground') o.visible = true; }); });
fs.mkdirSync('shots', { recursive: true });
for (const k of which) {
  const [c, t] = V[k];
  await page.evaluate(([k, c, t]) => { const api = window.__api; api.scene.traverse((o) => { if (o.name === 'Ground') o.visible = !(k === 'under' || k === 'abd'); });
    if (!window.__fill) { window.__fill = new (api.scene.children.find((o) => o.isDirectionalLight).constructor)(0xffffff, 0); api.scene.add(window.__fill); window.__fill.position.set(0, -5, 1); }
    window.__fill.intensity = (k === 'under' || k === 'abd') ? 3 : 0;
    api.setCam(c.split(',').map(Number), t.split(',').map(Number)); }, [k, c, t]);
  await page.waitForTimeout(500); await page.screenshot({ path: `shots/audit_${k}.png` });
}
await browser.close(); srv.close();
