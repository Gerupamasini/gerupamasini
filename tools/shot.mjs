// Headless validation renders: node tools/shot.mjs "<query>" out.png [w h]
import { chromium } from 'playwright';
const [q = 'shot=profile&pause=1', out = 'shot.png', w = '1280', h = '800'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto('http://localhost:4173/?' + q, { waitUntil: 'load' });
await page.waitForTimeout(+(process.env.WAIT || 6000));
if (process.env.PRE) { console.log(JSON.stringify(await page.evaluate(process.env.PRE))); await page.waitForTimeout(+(process.env.WAIT2 || 5000)); }
await page.screenshot({ path: out });
if (process.env.EVAL) console.log(JSON.stringify(await page.evaluate(process.env.EVAL)));
console.log(logs.slice(0, 15).join('\n'));
await browser.close();
