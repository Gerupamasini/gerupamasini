// Filmstrip of one fish seen from above: node tools/filmstrip.mjs out.png mode(escape|hop) frames stepMs
import { chromium } from 'playwright';
const [out, mode = 'escape', n = '10', stepMs = '20', view = 'top'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 360, height: 300 } });
await page.goto('http://localhost:4173/?pause=1&nogui=1&shot=' + view + '&fish=2&t=1', { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.evaluate((mode) => {
  const T = __edo; const f = T.fishes[0];
  T.world.threats.forEach((t) => { t.active = false; });
  f.behavior.setState('BOTTOM_REST', {}, 1e9);
  for (let i = 0; i < 30; i++) T.step(1 / 60);
  if (mode === 'escape') T.params.escapeSelected();
  else { const p = f.loco.pos.clone(); const fw = f.loco.forward(); p.x += fw.x * 0.12; p.z += fw.z * 0.12; f.behavior.setState('EXPLORE', { hops: 1, target: p, landedAt: undefined }); f.loco.setCommand({ type: 'hop', target: p, urgency: 0.3 }); }
}, mode);
const shots = [];
for (let i = 0; i < +n; i++) {
  await page.evaluate(([ms, view]) => { const T = __edo; const k = Math.round(ms / 1000 * 240); for (let j = 0; j < k; j++) T.step(1 / 240); T.applyShot(view, T.fishes[0]); }, [+stepMs, view]);
  await page.waitForTimeout(700);
  shots.push(await page.screenshot({ clip: { x: 0, y: 0, width: 360, height: 300 } }));
}
await browser.close();
// stitch with a tiny HTML page
const b2 = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p2 = await b2.newPage({ viewport: { width: 360 * 5, height: 300 * Math.ceil(shots.length / 5) } });
await p2.setContent('<body style="margin:0;display:flex;flex-wrap:wrap;background:#000">' + shots.map((b, i) => `<div style="position:relative"><img src="data:image/png;base64,${b.toString('base64')}"><span style="position:absolute;left:4px;top:2px;color:#fff;font:12px monospace">${(i + 1) * stepMs}ms</span></div>`).join('') + '</body>');
await p2.screenshot({ path: out, fullPage: true }); await b2.close();
