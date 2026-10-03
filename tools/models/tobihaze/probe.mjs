#!/usr/bin/env node
// Persistent in-game probe for slow (software-rendered) environments: loads the game once from a production build,
// then runs command files dropped into <dir>/cmd/ one after another.
//
//   npx vite build --outDir /tmp/dist && npx vite preview --outDir /tmp/dist --port 5200 &
//   VIRT=50 W=960 H=540 node tools/models/tobihaze/probe.mjs /tmp/probe [http://localhost:5200/gerupamasini/]
//
// A command file NNN.js is the body of an async function — `a` is window.__higata and `frames(n)` waits n frames —
// whose return value is written to <dir>/out/NNN.json. A first line `//shot name.png` takes a screenshot afterwards.
// VIRT=<ms> makes every animation frame advance Date.now / performance.now by a fixed step, so the brains (game
// clock) and the bodies (frame dt) stay in step however long a frame takes to render.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const dir = process.argv[2] ?? 'tests/smoke/out/probe';
const base = process.argv[3] ?? 'http://localhost:5200/gerupamasini/';
const cmdDir = path.join(dir, 'cmd'), outDir = path.join(dir, 'out');
fs.mkdirSync(cmdDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => log('pageerror:', e.message));
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/net::ERR_|Failed to load resource/.test(m.text())) log('console:', m.text().slice(0, 300)); });
if (process.env.VIRT) {
  await page.addInitScript((step) => {
    const realRAF = window.requestAnimationFrame.bind(window);
    const realPerf = performance.now.bind(performance);
    const start = Date.now(), p0 = realPerf();
    let virt = 0;
    Date.now = () => start + virt;
    performance.now = () => p0 + virt;
    let pending = [];
    window.requestAnimationFrame = (cb) => { pending.push(cb); return pending.length; };
    const pump = () => {
      virt += step;
      const cbs = pending;
      pending = [];
      for (const cb of cbs) { try { cb(p0 + virt); } catch (e) { console.error(e); } }
      realRAF(pump);
    };
    realRAF(pump);
  }, Number(process.env.VIRT));
}
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.title-screen') || document.querySelector('.card h2'));
await page.evaluate((q) => window.__higata.updateSettings({ quality: q }), process.env.Q ?? 'mid');
await page.locator('button.primary').first().click();
await page.waitForFunction(() => window.__higata && window.__higata.mode === 'home');
await page.evaluate(() => window.__higata.enterField());
await page.waitForFunction(() => window.__higata && window.__higata.world && window.__higata.player && window.__higata.mode === 'field');
await page.evaluate(() => {
  window.__frames = (n) => new Promise((res) => {
    const s = window.__higata.frameCount;
    const tick = () => (window.__higata.frameCount >= s + n ? res() : requestAnimationFrame(tick));
    tick();
  });
});
fs.writeFileSync(path.join(dir, 'READY'), String(Date.now()));
log('ready');
const done = new Set();
for (;;) {
  const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith('.js') && !done.has(f)).sort();
  for (const f of files) {
    done.add(f);
    const src = fs.readFileSync(path.join(cmdDir, f), 'utf8');
    const name = f.replace(/\.js$/, '');
    const shot = /^\/\/shot\s+(\S+)/m.exec(src)?.[1];
    const t = Date.now();
    let result;
    try {
      result = await page.evaluate(`(async () => { const a = window.__higata; const frames = window.__frames; ${src}\n })()`);
    } catch (err) { result = { error: String(err.message ?? err) }; }
    if (shot) await page.screenshot({ path: path.join(outDir, shot) });
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(result ?? null, null, 1));
    log(name, `${Date.now() - t}ms`, shot ?? '');
    if (/^\/\/quit/m.test(src)) { await browser.close(); process.exit(0); }
  }
  await new Promise((r) => setTimeout(r, 250));
}
