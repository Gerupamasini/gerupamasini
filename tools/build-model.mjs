import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { serve } from './server.mjs';
export async function launch() {
  return chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const srv = await serve(8123), browser = await launch(), page = await browser.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join('\n')));
  await page.goto('http://localhost:8123/tools/build.html');
  await page.waitForFunction('window.ready', null, { timeout: 30000 });
  for (const [variant, file] of [['brown', 'ilyoplax_pusilla.glb'], ['blue', 'ilyoplax_pusilla_blue.glb']]) {
    const r = await page.evaluate((v) => window.exportCrab(v), variant);
    fs.mkdirSync('models', { recursive: true });
    fs.writeFileSync('models/' + file, Buffer.from(r.b64, 'base64'));
    console.log('GLB', variant, (r.size / 1e6).toFixed(2), 'MB');
  }
  await browser.close(); srv.close();
}
