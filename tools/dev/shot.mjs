// usage: node tools/dev/shot.mjs <url-path> <out.png> [w] [h] [waitMs]
import { chromium } from 'playwright-core';
const [,, path, out, w = '1600', h = '1000', wait = '500'] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto('http://localhost:5173' + path, { waitUntil: 'commit', timeout: 120000 });
try { await p.waitForFunction(() => window.__ready === true, null, { timeout: 900000, polling: 500 }); } catch (e) { logs.push('timeout waiting for __ready'); }
await p.waitForTimeout(+wait);
await p.screenshot({ path: out, timeout: 240000 });
console.log(logs.slice(0, 40).join('\n'));
await b.close();
