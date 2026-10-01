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
console.log('ready+shot in', ((Date.now() - t0) / 1000).toFixed(1), 's'); console.log(logs.slice(0, 12).join('\n'));
await browser.close();
