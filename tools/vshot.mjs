// Screenshot the high-quality viewer: node tools/vshot.mjs "<url>" out.png [w h] [waitMs]
import { chromium } from 'playwright';
const [url, out, w = '1280', h = '800', wait = '25000'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
const t0 = Date.now();
await page.waitForFunction(() => window.__mahazeReady || window.__edohazeReady, null, { timeout: 180000 }).catch(() => logs.push('ready timeout'));
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
// optional: project fish-space points (mm) to pixels → JSON next to the image (for photo overlays)
if (process.env.PROJECT) {
  const pts = JSON.parse(process.env.PROJECT);
  const res = await page.evaluate((pts) => {
    const { fish, camera, THREE } = window.__mahaze;
    const F = fish.frame;
    fish.root.updateMatrixWorld(true);
    return pts.map(([s, y, z]) => {
      const v = new THREE.Vector3(z * 0.001, (y - F.Y0) * 0.001, (F.S0 - s) * 0.001);
      fish.root.localToWorld(v); v.project(camera);
      return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
    });
  }, pts);
  (await import('node:fs')).writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify(res));
  console.log('projected', JSON.stringify(res));
}
console.log('ready+shot in', ((Date.now() - t0) / 1000).toFixed(1), 's'); console.log(logs.slice(0, 12).join('\n'));
await browser.close();
