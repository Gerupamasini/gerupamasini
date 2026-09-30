// Performance measurement (headless Chromium).
//
//   npm run perf                  # uses a local dev server on :5173 (npm run dev)
//   node tools/perf.mjs --url http://localhost:5173 --gpu   # use the real GPU
//
// Reports, per scenario: CPU simulation time (behaviour + locomotion + fin
// physics), render submission time incl. GPU sync (gl.finish), draw calls,
// triangles, LOD distribution. NOTE: without --gpu the browser renders with
// SwiftShader (software) — GPU numbers are then meaningless, CPU numbers are
// conservative (the container CPU is slower than a desktop).

import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const base = opt('--url', 'http://localhost:5173');
const useGpu = args.includes('--gpu');
const exe = opt('--chrome', process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome');
const launchArgs = useGpu ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const scenarios = [
  { name: '1 fish, studio close-up (LOD0)', q: 'mode=studio&view=side' },
  { name: '10 fish aquarium (default)', q: 'fish=10' },
  { name: '20 fish aquarium', q: 'fish=20' },
  { name: '40 fish aquarium', q: 'fish=40' },
  { name: '20 fish, forced LOD0', q: 'fish=20&lod=0' },
  { name: '20 fish, forced LOD2', q: 'fish=20&lod=2' },
];

const browser = await chromium.launch({ executablePath: exe, headless: true, args: launchArgs });
const results = [];
for (const sc of scenarios) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`${base}/?test=1&t=0.5&gui=0&${sc.q}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000, polling: 500 });
  const r = await page.evaluate(async (frames) => {
    const app = window.__app;
    const gl = app.renderer.getContext();
    const qs = new URLSearchParams(location.search);
    if (qs.has('lod')) app.fishSystem.forceLOD = Number(qs.get('lod'));
    const sim = [];
    const ren = [];
    app.renderer.info.autoReset = false;
    // warm-up
    for (let i = 0; i < 5; i++) {
      app.step(1 / 60);
      app.render();
    }
    gl.finish();
    for (let i = 0; i < frames; i++) {
      app.renderer.info.reset();
      const t0 = performance.now();
      app.step(1 / 60);
      const t1 = performance.now();
      app.render();
      gl.finish();
      const t2 = performance.now();
      sim.push(t1 - t0);
      ren.push(t2 - t1);
    }
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const info = app.renderer.info;
    const fs = app.fishSystem;
    return {
      fish: fs.fish.length,
      simMs: avg(sim),
      simPerFishUs: (avg(sim) / fs.fish.length) * 1000,
      renderMs: avg(ren),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      lod: fs.stats.lod.join('/'),
      fishTriangles: fs.stats.triangles,
      lodTris: fs.lods.map((l) => ({ body: l.bodyTris, fins: l.finTris, eye: l.eyeTris })),
    };
  }, Number(opt('--frames', 20)));
  results.push({ scenario: sc.name, ...r });
  console.log(`${sc.name}: sim ${r.simMs.toFixed(2)} ms (${r.simPerFishUs.toFixed(0)} µs/fish), render+sync ${r.renderMs.toFixed(1)} ms, calls ${r.drawCalls}, tris ${(r.triangles / 1000).toFixed(0)}k, LOD ${r.lod}`);
  await page.close();
}
console.log('\nLOD triangle budgets (per fish):', JSON.stringify(results[0].lodTris));
console.log(JSON.stringify(results, null, 2));
await browser.close();
