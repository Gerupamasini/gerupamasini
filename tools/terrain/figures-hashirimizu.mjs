#!/usr/bin/env node
// Figures for docs/maps/hashirimizu/ straight from the shared shape (src/world/maps/hashirimizu/shape.ts):
//   plan.png     the shore from above at the exploring tide (sand, clam flat, eelgrass classes, rocks, water depth)
//   profile.svg  the cross-section with the zones, the tides and how far chest waders go
//   node tools/terrain/figures-hashirimizu.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shape = await import(path.join(root, 'src', 'world', 'maps', 'hashirimizu', 'shape.ts'));
const mapDef = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'maps', 'hashirimizu.json'), 'utf8'));
const outDir = path.join(root, 'docs', 'maps', 'hashirimizu');
fs.mkdirSync(outDir, { recursive: true });
const { heightAt, substrateAt, eelgrassField, rockiness, ROCKS, ZERO_X, REF_TIDE, ALONG } = shape;
const WADE = mapDef.wading.maxDepth_m;

// ---------------------------------------------------------------- plan: sea to the right (+x), north (-z) up
const S = 6, X0 = -34, X1 = 26, Z0 = -44, Z1 = 44;
const W = (X1 - X0) * S, H = (Z1 - Z0) * S;
const png = new PNG({ width: W, height: H });
const mix = (a, b, t) => a.map((v, k) => v * (1 - t) + b[k] * t);
const SUB = [[206, 198, 176], [176, 164, 140], [128, 116, 98], [150, 144, 136]];
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = X0 + (i + 0.5) / S, z = Z0 + (j + 0.5) / S, d = x - ZERO_X;
  const h = heightAt(x, z);
  let c = SUB[substrateAt(x, z)].slice();
  if (d < -10.6) c = [118, 138, 84];                              // grass behind the wall
  else if (d < -9.9) c = [168, 168, 160];                         // the seawall
  const depth = REF_TIDE - h;
  if (depth > 0) c = mix(c, [52, 118, 140], Math.min(0.85, 0.3 + depth * 0.55));
  const q = eelgrassField(x, z);
  if (q > 0.6) c = mix(c, [24, 82, 30], 0.62); else if (q > 0.53) c = mix(c, [58, 116, 44], 0.42); else if (q > 0.47) c = mix(c, [88, 140, 64], 0.25);
  // 25 cm contours
  const hc = (v) => Math.floor(v / 0.25);
  if (hc(h) !== hc(heightAt(x + 1 / S, z)) || hc(h) !== hc(heightAt(x, z + 1 / S))) c = mix(c, [0, 0, 0], 0.18);
  // the zone boundaries (0, 5, 12, 22, 25 m) as dashes
  for (const b of [0, 5, 12, 22, 25]) if (i === Math.round((ZERO_X + b - X0) * S) && ((j >> 3) & 1) === 0) c = [250, 250, 250];
  const k = (j * W + i) * 4;
  png.data[k] = c[0]; png.data[k + 1] = c[1]; png.data[k + 2] = c[2]; png.data[k + 3] = 255;
}
// rocks as dark discs, oysters on them as pale dots
for (const r of ROCKS) {
  for (let j = Math.floor((r.z - r.r - Z0) * S); j <= Math.ceil((r.z + r.r - Z0) * S); j++) for (let i = Math.floor((r.x - r.r - X0) * S); i <= Math.ceil((r.x + r.r - X0) * S); i++) {
    if (i < 0 || j < 0 || i >= W || j >= H) continue;
    const x = X0 + (i + 0.5) / S, z = Z0 + (j + 0.5) / S;
    const rr = Math.hypot(x - r.x, z - r.z) / r.r;
    if (rr > 1) continue;
    const k = (j * W + i) * 4;
    const v = 70 + 40 * (1 - rr) + (r.oysters > 0.3 && rr > 0.7 ? 90 : 0);
    png.data[k] = v; png.data[k + 1] = v * 0.97; png.data[k + 2] = v * 0.92;
  }
}
fs.writeFileSync(path.join(outDir, 'plan.png'), PNG.sync.write(png));

// ---------------------------------------------------------------- profile
const D0 = -14, D1 = 42, HLO = -2.2, HHI = 2.8;
const PW = 1000, PH = 430, ML = 56, MR = 16, MT = 24, MB = 52;
const px = (d) => ML + ((d - D0) / (D1 - D0)) * (PW - ML - MR);
const py = (h) => MT + ((HHI - h) / (HHI - HLO)) * (PH - MT - MB);
const meanH = (d) => { let s = 0, n = 0; for (let z = -ALONG + 4; z <= ALONG - 4; z += 2) { if (rockiness(ZERO_X + d, z) > 0.05) continue; s += heightAt(ZERO_X + d, z); n++; } return n ? s / n : heightAt(ZERO_X + d, 0); };
const ground = [];
for (let d = D0; d <= D1; d += 0.1) ground.push([px(d), py(meanH(d))]);
const tides = [
  { h: 0.8, label: '満潮（大潮） +0.8 m', col: '#3b6fa0' },
  { h: REF_TIDE, label: `探索の潮位 ${REF_TIDE} m`, col: '#2a8f8a' },
  { h: -0.85, label: '大潮の干潮 −0.85 m', col: '#b0702a' },
];
const wadeAt = (tide) => { let lim = 0; for (let d = 0; d < D1; d += 0.05) if (tide - meanH(d) < WADE) lim = d; return lim; };
const zones = [[-10, 0, '砂浜'], [0, 5, '水際'], [5, 12, '潮干狩り帯'], [12, 22, '胴長で入るアマモ場'], [22, 25, '奥'], [25, D1, '深場（徒歩不可）']];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-size="13">
<rect width="${PW}" height="${PH}" fill="#f7f6f1"/>
`;
zones.forEach(([a, b, name], i) => {
  svg += `<rect x="${px(a)}" y="${MT}" width="${px(b) - px(a)}" height="${PH - MT - MB}" fill="${['#efe8d6', '#e9e4d4', '#e6dcc0', '#dde8d2', '#d4e2cc', '#dfe5ea'][i]}"/>\n`;
  svg += `<text x="${(px(a) + px(b)) / 2}" y="${PH - MB + 34}" text-anchor="middle" fill="#444">${name}</text>\n`;
});
for (let h = -2; h <= 2.5; h += 0.5) svg += `<line x1="${ML}" x2="${PW - MR}" y1="${py(h)}" y2="${py(h)}" stroke="#0001"/><text x="${ML - 6}" y="${py(h) + 4}" text-anchor="end" fill="#666" font-size="11">${h.toFixed(1)}</text>\n`;
for (let d = -10; d <= 40; d += 5) svg += `<line x1="${px(d)}" x2="${px(d)}" y1="${MT}" y2="${PH - MB}" stroke="#0001"/><text x="${px(d)}" y="${PH - MB + 15}" text-anchor="middle" fill="#666" font-size="11">${d} m</text>\n`;
for (const t of tides) {
  svg += `<line x1="${ML}" x2="${PW - MR}" y1="${py(t.h)}" y2="${py(t.h)}" stroke="${t.col}" stroke-width="1.6" stroke-dasharray="6 4"/>\n`;
  svg += `<text x="${PW - MR - 4}" y="${py(t.h) - 5}" text-anchor="end" fill="${t.col}">${t.label}</text>\n`;
  const lim = wadeAt(t.h);
  if (lim > 0.5 && lim < D1) svg += `<line x1="${px(lim)}" x2="${px(lim)}" y1="${py(t.h) - 10}" y2="${py(meanH(lim)) + 4}" stroke="${t.col}" stroke-width="2"/><text x="${px(lim) + 4}" y="${py(t.h) + 16}" fill="${t.col}" font-size="11">胴長の限界 ${lim.toFixed(0)} m</text>\n`;
}
svg += `<polygon points="${ground.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} ${px(D1)},${PH - MB} ${px(D0)},${PH - MB}" fill="#c9b994" stroke="#6b5a3a" stroke-width="1.5"/>\n`;
svg += `<text x="${ML}" y="16" fill="#333" font-size="14">走水: 岸からの断面（沿岸方向の平均、縦 ${(((PH - MT - MB) / (HHI - HLO)) / ((PW - ML - MR) / (D1 - D0))).toFixed(1)} 倍に強調）</text>\n`;
svg += `<text x="${px(-10.3)}" y="${py(2.55)}" fill="#555" font-size="11" text-anchor="middle">護岸</text>\n</svg>\n`;
fs.writeFileSync(path.join(outDir, 'profile.svg'), svg);
console.log(`wrote ${path.relative(root, outDir)}/plan.png (${W}x${H}) + profile.svg; waders reach ${tides.map((t) => `${wadeAt(t.h).toFixed(1)} m at ${t.h}`).join(', ')}`);
