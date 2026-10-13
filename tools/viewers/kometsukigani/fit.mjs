#!/usr/bin/env node
// Dev helper: fit the コメツキガニ viewer's posture and an orthographic view to a photograph's silhouette, so what
// is left over is the difference in SHAPE (docs/creatures/kometsukigani/SHAPE_AUDIT.md).
// usage: node tools/viewers/kometsukigani/fit.mjs <config.json> <outDir>
//   config: { "mask": "photo mask PNG (crab white on black)", "w": 512, "sex": "m",
//             "start": { el, az, tx, ty, oh, bh, roll, hd, reach: [8], lyaw: [8], ldac: [8], lcp: [8], lh: [8], cpose, cposeR },
//             "free": { "el": 0.05, "reach.0": 0.08, ... }   parameter → first step; list items as "name.i"
//             "bounds": { "el": [0, 0.3] }, "roi": [x, y, w, h] (mask px), "rounds": 4 }
//   Writes <outDir>/fit.json (the best parameters, IoU, and the viewer query that reproduces the view),
//   <outDir>/model.png (the fitted model's silhouette at the mask's size). Needs the vite dev server (PORT).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { chromium } from 'playwright-core';

const [cfgPath, outDir] = process.argv.slice(2);
if (!cfgPath || !outDir) { console.error('usage: node tools/viewers/kometsukigani/fit.mjs <config.json> <outDir>'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const base = path.dirname(path.resolve(cfgPath));
fs.mkdirSync(outDir, { recursive: true });
const PORT = Number(process.env.PORT ?? 5199);

// the photograph's mask, resampled (box filter) to the canvas size
const src = PNG.sync.read(fs.readFileSync(path.resolve(base, cfg.mask)));
const W = cfg.w ?? 512, H = Math.round(W * src.height / src.width);
const target = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const x0 = Math.floor(x * src.width / W), x1 = Math.max(x0 + 1, Math.floor((x + 1) * src.width / W));
  const y0 = Math.floor(y * src.height / H), y1 = Math.max(y0 + 1, Math.floor((y + 1) * src.height / H));
  let s = 0, n = 0;
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += src.data[(yy * src.width + xx) * 4]; n++; }
  target[y * W + x] = s / n > 127 ? 1 : 0;
}

const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.setDefaultTimeout(600000);
page.on('pageerror', (e) => console.error('pageerror:', e.message));
const q = `scene=sil&pose=stand&hud=0&lod=${cfg.lod ?? 0}&sex=${cfg.sex ?? 'm'}&seed=${cfg.seed ?? 1}&setae=${cfg.setae ?? 0}&w=${W}&h=${H}&ortho=3&fit=1`;
await page.goto(`http://localhost:${PORT}/gerupamasini/tools/viewers/kometsukigani/index.html?${q}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true);
await page.evaluate((t) => { window.__fitTarget = new Uint8Array(t); }, Array.from(target));

const P = structuredClone(cfg.start);
const get = (k) => { const [a, i] = k.split('.'); return i === undefined ? P[a] : P[a][Number(i)]; };
const set = (o, k, v) => { const [a, i] = k.split('.'); if (i === undefined) o[a] = v; else o[a][Number(i)] = v; };
// roi: [x, y, w, h] in the mask's own pixels — compare only there (e.g. the carapace, to fit the camera first)
const roi = cfg.roi ? cfg.roi.map((v) => Math.round(v * W / src.width)) : null;
const evalP = async (p) => (await page.evaluate((pp) => window.__fit(pp), { ...p, roi })).iou;
let best = await evalP(P);
console.log('start IoU', best.toFixed(4));
const steps = { ...cfg.free };
for (let round = 0; round < (cfg.rounds ?? 4); round++) {
  for (const k of Object.keys(steps)) {
    const st = steps[k];
    let improved = true, tries = 0;
    while (improved && tries++ < 6) {
      improved = false;
      for (const d of [st, -st]) {
        const c = structuredClone(P);
        const nv = get(k) + d, bd = cfg.bounds?.[k];
        if (bd && (nv < bd[0] || nv > bd[1])) continue;
        set(c, k, nv);
        const s = await evalP(c);
        if (s > best + 1e-5) { best = s; set(P, k, get(k) + d); improved = true; break; }
      }
    }
  }
  for (const k of Object.keys(steps)) steps[k] *= 0.5;
  console.log(`round ${round + 1} IoU ${best.toFixed(4)}`);
}
const res = await page.evaluate((pp) => window.__fit(pp), { ...P, roi });
const mask = await page.evaluate((pp) => window.__fit({ ...pp, mask: true }), P);
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) { const v = mask[i] ? 0 : 255; png.data[i * 4] = png.data[i * 4 + 1] = png.data[i * 4 + 2] = v; png.data[i * 4 + 3] = 255; }
fs.writeFileSync(path.join(outDir, 'model.png'), PNG.sync.write(png));
// the viewer query that reproduces this view at any canvas size of the same aspect
const dir = [Math.sin(P.az) * Math.cos(P.el), Math.sin(P.el), Math.cos(P.az) * Math.cos(P.el)];
const right = [Math.cos(P.az), 0, -Math.sin(P.az)];
const up = [-(dir[1] * right[2] - dir[2] * right[1]), -(dir[2] * right[0] - dir[0] * right[2]), -(dir[0] * right[1] - dir[1] * right[0])];
const c = [0, 0.35, 0].map((v, i) => v + right[i] * P.tx + up[i] * P.ty);
const f = (a) => a.map((v) => +v.toFixed(4)).join(',');
const pose = ['bh', 'roll', 'hd'].filter((k) => P[k] !== undefined && P[k] !== null).map((k) => `${k}=${+P[k].toFixed(4)}`)
  .concat(['reach', 'lyaw', 'ldac', 'lcp', 'lh', 'cpose', 'cposeR'].filter((k) => P[k]).map((k) => `${k}=${f(P[k])}`));
const query = [`ortho=${+P.oh.toFixed(4)}`, `cam=${f(dir.map((v) => v * 20))}`, `tgt=${f(c)}`, ...pose].join('&');
fs.writeFileSync(path.join(outDir, 'fit.json'), JSON.stringify({ iou: res.iou, photoOnly: res.photoOnly, modelOnly: res.modelOnly, params: P, query, w: W, h: H }, null, 1));
console.log('IoU', res.iou.toFixed(4), 'photo-only', res.photoOnly, 'model-only', res.modelOnly);
console.log(query);
await browser.close();
