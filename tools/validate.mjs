// Headless capture of the validation sheets (and demo) with the pre-installed Chromium.
// Usage: node tools/validate.mjs [shot ...]   shots: name=query  e.g.  bind=pose=bind  side=pose=stand
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const outDir = 'docs/validation';
mkdirSync(outDir, { recursive: true });

const server = await createServer({ logLevel: 'error', server: { port: 5199, host: '127.0.0.1' } });
await server.listen();
const base = 'http://127.0.0.1:5199';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const shots = process.argv.slice(2).length
  ? process.argv.slice(2).map((s) => {
      const i = s.indexOf('=');
      return [s.slice(0, i), s.slice(i + 1)];
    })
  : [['sheet_bind', 'pose=bind']];

for (const [name, query] of shots) {
  const isDemo = query.startsWith('demo');
  const page = await browser.newPage({ viewport: { width: isDemo ? 1280 : 1400, height: isDemo ? 800 : 1000 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const url = isDemo ? `${base}/index.html?${query.slice(5)}` : `${base}/validation.html?${query}`;
  await page.goto(url);
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  } catch (e) {
    console.log(`timeout for ${name}`);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  const errs = logs.filter((l) => /error|warn/i.test(l));
  console.log(`${name}: saved ${errs.length ? '\n  ' + errs.slice(0, 8).join('\n  ') : ''}`);
  await page.close();
}
await browser.close();
await server.close();
