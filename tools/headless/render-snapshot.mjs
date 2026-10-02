// Headless Chromium (SwiftShader software WebGL2) screenshot tool.
// usage: node tools/headless/render-snapshot.mjs "<page path with query>" out.png [--w 1280] [--h 720] [--timeout 120000]
// The page must set `window.__ready = true` when the frame to capture is rendered.
// Several shots from one page load: page may expose window.__shots = [{name, apply()}...]; use --multi prefix.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : def;
}

export async function snapshot({ page: pagePath, out, w = 1280, h = 720, timeout = 120000, log = true }) {
  const { server, port } = await startServer();
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}${pagePath}`);
    try { await page.waitForFunction('window.__ready === true', null, { timeout }); }
    catch { logs.push('[harness] timeout waiting for window.__ready'); }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const shots = await page.evaluate(() => (window.__shots ? window.__shots.map((s) => s.name) : null));
    if (shots) {
      for (let i = 0; i < shots.length; i++) {
        await page.evaluate(async (idx) => { await window.__shots[idx].apply(); }, i);
        await page.waitForFunction('window.__shotReady === true', null, { timeout });
        const f = out.replace(/\.png$/, `_${shots[i]}.png`);
        await page.screenshot({ path: f });
        if (log) console.log('wrote', f);
        await page.evaluate(() => { window.__shotReady = false; });
      }
    } else {
      await page.screenshot({ path: out });
      if (log) console.log('wrote', out);
    }
    const info = await page.evaluate(() => window.__info || null);
    if (log) { console.log('--- console ---'); console.log(logs.join('\n')); if (info) console.log('info', JSON.stringify(info)); }
    return { logs, info };
  } finally { await browser.close(); server.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const page = process.argv[2];
  const out = process.argv[3];
  await snapshot({ page, out, w: Number(arg('w', 1280)), h: Number(arg('h', 720)), timeout: Number(arg('timeout', 120000)) });
}
