#!/usr/bin/env node
// Silhouette fit check: compares the sculpted body (anatomy field()) against photo-measured contours.
//   node tools/fitcheck.mjs --species edohaze [--json]
// Targets: tools/<species>/targets.json  { SL, axis: { snoutY, baseY }, stations: [{ s, top, bot, halfW }] }
// where s is a fraction of SL and top/bot are heights (fractions of SL) relative to the line from the
// snout tip (s = 0) to the centre of the caudal-fin base (s = 1) — the same axis the photos were measured on.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const species = args.includes('--species') ? args[args.indexOf('--species') + 1] : 'edohaze';
const A = await import(`./${species}/anatomy.mjs`);
const T = JSON.parse(fs.readFileSync(path.join(root, 'tools', species, 'targets.json'), 'utf8'));
const SL = A.SL;

// axis line used by the photogrammetry: snout tip → middle of the caudal base
function silhouette(s) {
  let top = -Infinity, bot = Infinity, half = 0;
  for (let y = -1.5; y <= 9; y += 0.02) {
    for (let z = 0; z <= 4.5; z += 0.04) {
      if (A.field(s, y, z) < 0) {
        if (y > top) top = y;
        if (y < bot) bot = y;
        if (z > half) half = z;
      }
    }
  }
  return { top, bot, half };
}
function snoutTip() {
  // most anterior point of the head (upper jaw tip): smallest s inside at any y
  for (let s = -0.6; s < 1.5; s += 0.005) {
    for (let y = -1; y < 7; y += 0.01) if (A.field(s, y, 0) < 0) return { s, y };
  }
  return { s: 0, y: 2 };
}
const tip = snoutTip();
const baseSil = silhouette(SL - 0.02);
const baseY = 0.5 * (baseSil.top + baseSil.bot);
const axisY = (s) => tip.y + ((baseY - tip.y) * (s - tip.s)) / (SL - tip.s);

const rows = [];
let e2 = 0, n = 0;
for (const st of T.stations) {
  const s = tip.s + st.s * (SL - tip.s);
  const m = silhouette(s);
  const ay = axisY(s);
  const r = {
    s: st.s,
    top: (m.top - ay) / SL, topT: st.top,
    bot: (m.bot - ay) / SL, botT: st.bot,
    halfW: m.half / SL, halfWT: st.halfW,
  };
  rows.push(r);
  for (const [a, b] of [[r.top, r.topT], [r.bot, r.botT], [r.halfW, r.halfWT]]) if (b != null) { e2 += (a - b) ** 2; n++; }
}
const rms = Math.sqrt(e2 / Math.max(n, 1));
if (args.includes('--json')) console.log(JSON.stringify({ tip, baseY, rows, rmsSL: rms }));
else {
  console.log(`snout tip s=${tip.s.toFixed(2)} y=${tip.y.toFixed(2)} mm, caudal-base centre y=${baseY.toFixed(2)} mm`);
  console.log('  s      top(model/photo)   bottom(model/photo)   halfWidth(model/photo)   [fractions of SL]');
  for (const r of rows) {
    const f = (a, b) => `${a.toFixed(3)}/${b == null ? '  -  ' : b.toFixed(3)}${b == null ? '' : (Math.abs(a - b) > 0.006 ? ' *' : '  ')}`;
    console.log(`  ${r.s.toFixed(2)}   ${f(r.top, r.topT)}       ${f(r.bot, r.botT)}         ${f(r.halfW, r.halfWT)}`);
  }
  console.log(`RMS error ${(rms * 100).toFixed(2)} %SL  (* = off by more than 0.6 %SL)`);
}
