#!/usr/bin/env node
// Offline video of the mudflat scene: a scripted camera move rendered frame by frame in headless Chromium
// (deterministic: seeded Math.random, fixed time step), split over several browser workers, then encoded
// with ffmpeg. Build first (npm run build).
//   node tools/scene/video.mjs <out.mp4> [--seconds 15] [--fps 30] [--size 960x540] [--workers 2] [--frames a-b]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(args[0] || 'higata.mp4');
const SECONDS = Number(opt('seconds', 15)), FPS = Number(opt('fps', 30));
const [W, H] = opt('size', '960x540').split('x').map(Number);
const WORKERS = Number(opt('workers', 2));
const N = Math.round(SECONDS * FPS);
const [F0, F1] = (opt('frames', `0-${N - 1}`)).split('-').map(Number);
const frameDir = path.join(path.dirname(out), `${path.basename(out, path.extname(out))}_frames`);
fs.mkdirSync(frameDir, { recursive: true });

const PORT = 4176;
const BASE = process.env.VITE_BASE ?? '/gerupamasini/';
const url = `http://localhost:${PORT}${BASE}higata.html?nohelp&capture&calm&dpr=1`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch { /* retry */ } await wait(500); }
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));

// camera script, evaluated in the page: t (s) → { pos, target, focus } around the first エドハゼ and its burrow
const SHOT = `(() => {
  const s = window.__higataScene;
  const f = s.fish[0];
  const T = f.root.position.clone();
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
  // fixed compass bearing of the approach (the camera comes in from the fish's side)
  const h = f.behavior.state.heading + Math.PI / 2 + 0.35;
  window.__shot = (t) => {
    // 0–5 s: high above the water, looking down at the flat; 5–9 s: descend through the surface;
    // 9–15 s: low under water, slowly closing in on the goby while orbiting a little
    const k1 = ease(t / 9), k2 = ease((t - 8) / 7);
    const dist = lerp(lerp(0.34, 0.15, k1), 0.075, k2);
    const height = lerp(lerp(0.36, 0.02, ease((t - 2.5) / 6.5)), 0.012, k2);
    const ang = h + 0.25 * k1 + 0.35 * k2;
    const tgt = [T.x, lerp(T.y - 0.01, T.y + 0.003, k1), T.z];
    const pos = [T.x + Math.sin(ang) * dist, s.flat.height(T.x, T.z) + height, T.z + Math.cos(ang) * dist];
    const focus = Math.hypot(pos[0] - tgt[0], pos[1] - tgt[1], pos[2] - tgt[2]);
    return { pos, target: tgt, focus };
  };
})()`;

async function worker(from, to) {
  const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  // deterministic randomness in every worker
  await page.addInitScript(() => { let a = 1234567; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await page.addStyleTag({ content: '' }).catch(() => {});
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: '.title,#help,#help-btn{display:none!important}' });
  await page.waitForFunction(() => window.__higataScene && window.__higataScene.frameCount > 0, null, { timeout: 600000 });
  await page.evaluate(() => { window.__higataScene.state.external = true; });
  await page.evaluate(SHOT);
  const dt = 1 / FPS;
  // fast-forward the simulation (no drawing) to this worker's first frame
  await page.evaluate(([n, d]) => { for (let i = 0; i < n; i++) window.__higataScene.advance(d); }, [from, dt]);
  for (let i = from; i <= to; i++) {
    const file = path.join(frameDir, `f${String(i).padStart(5, '0')}.jpg`);
    const t0 = Date.now();
    const data = await page.evaluate(([i, d]) => {
      const s = window.__higataScene;
      const c = window.__shot(i * d);
      s.renderExternal(d, c.pos, c.target, c.focus);
      return document.getElementById('view').toDataURL('image/jpeg', 0.93);
    }, [i, dt]);
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    console.log(`frame ${i} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await browser.close();
}

try {
  const per = Math.ceil((F1 - F0 + 1) / WORKERS);
  await Promise.all(Array.from({ length: WORKERS }, (_, w) => {
    const a = F0 + w * per, b = Math.min(F1, a + per - 1);
    return a <= b ? worker(a, b) : null;
  }));
  if (F0 === 0 && F1 === N - 1) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frameDir, 'f%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', out], { stdio: 'inherit' });
    console.log('wrote', out);
  }
} finally { server.kill(); }
