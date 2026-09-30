// Render the standard evaluation set (same views, same simulated time, same
// seed) into a folder, reusing one headless browser.
// usage: node tools/dev/render-set.mjs <outDir> [names,comma,separated]
//   BASE=http://localhost:5173 by default
import { chromium } from 'playwright-core';
import fs from 'node:fs';

export const VIEWS = [
  ['aq_overview', '/?test=1&t=8'],
  ['aq_follow', '/?test=1&t=8&follow=1'],
  ['cine_head34', '/?test=1&t=8&cine=head34'],
  ['cine_profile', '/?test=1&t=8&cine=profile'],
  ['cine_low', '/?test=1&t=8&cine=low'],
  ['studio_side', '/?mode=studio&test=1&t=2&anim=idle&view=side'],
  ['studio_head', '/?mode=studio&test=1&t=2&anim=idle&view=head&zoom=0.6'],
  ['studio_white', '/?mode=studio&test=1&t=2&anim=idle&view=side&color=4'],
  ['aq_motion_strip', '/?test=1&t=8&strip=8&stripDt=0.5&cols=4'],
];

const [, , outDir = 'renders', only = ''] = process.argv;
const pick = only ? only.split(',') : null;
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.BASE || 'http://localhost:5173';
const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
// warm-up load (Vite may re-optimise / reload on the first request after edits)
{
  const p = await b.newPage({ viewport: { width: 320, height: 200 } });
  await p.goto(base + '/?test=1&t=0.1', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 600000, polling: 500 }).catch(() => {});
  await p.close();
}
for (const [name, path] of VIEWS) {
  if (pick && !pick.includes(name)) continue;
  const t0 = Date.now();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text()) && errs.push(m.text()));
  await p.goto(base + path, { waitUntil: 'commit' });
  let ok = true;
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 900000, polling: 500 }).catch(() => (ok = false));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${outDir}/${name}.png`, timeout: 240000 });
  console.log(`${name.padEnd(16)} ${ok ? 'ok ' : 'TIMEOUT'} ${((Date.now() - t0) / 1000).toFixed(0)}s ${errs.slice(0, 3).join(' | ')}`);
  await p.close();
}
await b.close();
