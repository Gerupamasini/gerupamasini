// Calibrates the body albedo inverse model of tools/build-assets/textures.mjs against the studio still (viewer/dev/still.html).
//   The still renders M_Body with ACES tone mapping, RoomEnvironment (0.9), a 1.6 directional light and the body clearcoat. Scene-linear colour is modelled as
//   S(r) = a(r) * albedo + v(r) (r = side-projected relative height), display = ACES(S).  `fit` renders the bare ground (no marks / spots / scales) with three flat
//   albedo levels, inverts ACES, least-squares fits a and v per r and prints (or --write patches) the CAL_KNOTS table.  `check` renders the bare ground with the
//   built-in knots and prints design vs rendered colour per r (max / mean error in sRGB).  Re-run `fit` whenever the ORM design (AO / roughness / silver LUTs) changes.
//   usage: node tools/verify/body_calibrate.mjs fit|check [--template assets/generated/yamame.glb] [--write]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { createSurface, loadParams } from '../build-assets/surface.mjs';
import { applyStage } from '../build-assets/stages.mjs';
import { generateBodyTextures, acesInverse } from '../build-assets/textures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const mode = process.argv[2] || 'check';
const template = path.resolve(ROOT, arg('template', 'assets/generated/yamame.glb'));
const work = path.join(ROOT, 'assets/generated/_body_cal');
const params = applyStage(loadParams(), JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/src/stage_adult.json'), 'utf8')), 'adult');
const surface = createSurface(params, {}); const SL = surface.SL; const W = 2048, H = 1024;
const dec = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const enc = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const RB = []; for (let i = -9; i <= 9; i++) RB.push(+(i * 0.1).toFixed(1));         // r knots
const S0 = 0.63, S1 = 0.70, PX = 4667;                                              // measured section (clear of fins) and render scale of still.html?half=0.075 at 1500x700
const jpeg = async (img, q) => new Uint8Array(await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } }).removeAlpha().jpeg({ quality: q, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer());
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(work, { recursive: true });

async function renderGround(genome) {
  const t = generateBodyTextures({ surface, params, seed: 1, genome: { debugGround: true, ...genome } });
  const doc = await io.read(template); const by = {}; for (const x of doc.getRoot().listTextures()) by[x.getName()] = x;
  by.body_albedo.setImage(await jpeg(t.albedo, 93)); by.body_normal.setImage(await jpeg(t.normal, 96)); by.body_orm.setImage(await jpeg(t.orm, 95));
  const glb = path.join(work, 'cal.glb'), png = path.join(work, 'cal.png'); await io.write(glb, doc);
  const rel = '/' + path.relative(ROOT, glb);
  execFileSync('node', ['tools/headless/render-snapshot.mjs', `/viewer/dev/still.html?view=side&half=0.075&file=${rel}`, png, '--w', '1500', '--h', '700'], { cwd: ROOT, stdio: 'pipe' });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const prof = RB.map((r) => { const acc = [0, 0, 0]; let n = 0;
    for (let s = S0; s <= S1; s += 0.0015) { const sec = surface.section(s); const xp = Math.round(750 + surface.sToX(s) * PX), yp = Math.round(350 - (sec.c + r * sec.h) * SL * PX);
      for (let dy = -1; dy <= 1; dy++) { const o = ((yp + dy) * info.width + xp) * 3; acc[0] += dec(data[o]); acc[1] += dec(data[o + 1]); acc[2] += dec(data[o + 2]); n++; } }
    return acc.map((v) => v / n); });
  return { prof, tex: t };
}
const designAt = (t) => RB.map((r) => { const acc = [0, 0, 0]; let n = 0;
  for (let s = S0; s <= S1; s += 0.0015) { const x = Math.round(s * (W - 1)), sec = surface.section(s); const j = Math.round(surface.alphaAtHeight(s, (sec.c + r * sec.h) * SL) / (2 * Math.PI) * (H - 1));
    for (let c = 0; c < 3; c++) acc[c] += dec(t.albedo.data[(j * W + x) * 4 + c]); n++; }
  return acc.map((v) => v / n); });
const fmt = (v) => v.map((q) => Math.round(enc(q))).join(',');

try {
  if (mode === 'fit') {
    const levels = [0.0008, 0.10, 0.35]; const rows = RB.map(() => []);
    for (const g of levels) { const R = await renderGround({ calFlat: g }); RB.forEach((r, i) => { const S = acesInverse(...R.prof[i]); rows[i].push({ g, S: (S[0] + S[1] + S[2]) / 3 }); }); }
    const knots = RB.map((r, i) => { const p = rows[i], n = p.length, mg = p.reduce((t, q) => t + q.g, 0) / n, mS = p.reduce((t, q) => t + q.S, 0) / n;
      let num = 0, den = 0; for (const q of p) { num += (q.g - mg) * (q.S - mS); den += (q.g - mg) ** 2; } const a = num / den; return [r, a, Math.max(0, mS - a * mg)]; });
    const all = [[-1, ...knots[0].slice(1)], ...knots, [1, ...knots[knots.length - 1].slice(1)]];
    const txt = 'const CAL_KNOTS = [\n  ' + all.map((k) => `[${k[0].toFixed(2)}, ${k[1].toFixed(4)}, ${k[2].toFixed(5)}]`).join(',\n  ') + '];';
    console.log(txt);
    if (process.argv.includes('--write')) { const f = path.join(ROOT, 'tools/build-assets/textures.mjs'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/const CAL_KNOTS = \[[\s\S]*?\];/, txt)); console.log('patched', f); }
  } else {
    const target = designAt(generateBodyTextures({ surface, params, seed: 1, genome: { debugGround: true, photoExposure: true } }));
    const R = await renderGround({}); let mx = 0, sum = 0;
    RB.forEach((r, i) => { const e = Math.max(...[0, 1, 2].map((c) => Math.abs(enc(R.prof[i][c]) - enc(target[i][c])))); mx = Math.max(mx, e); sum += e; console.log(r.toFixed(1).padStart(5), 'design', fmt(target[i]).padEnd(12), 'render', fmt(R.prof[i]).padEnd(12), 'err', e.toFixed(1)); });
    console.log(`max err ${mx.toFixed(1)}  mean ${(sum / RB.length).toFixed(1)} (sRGB levels)`);
  }
} finally { fs.rmSync(work, { recursive: true, force: true }); }
