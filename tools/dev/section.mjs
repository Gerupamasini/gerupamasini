// Cross-sections of the body sculpt (relaxed bind, mm): for each z the half-width of the outline at a set of heights,
// the top and bottom of the section and its widest point — to place the folded wing, the scapulars and the legs on
// the v4 body (body_shape_spec.md v4 §5).
// usage: node tools/dev/section.mjs [--trunk] [--z=20,10,…] [--y=50,55,…]
import { getBodySDF, getTorsoSDF } from '../../src/birds/kentishPlover/anatomy/bodyMesh.js';
import { KentishPloverConfig as CFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const sdf = process.argv.includes('--trunk') ? getTorsoSDF(CFG, { trunkOnly: true }) : getBodySDF(CFG);
const ZS = arg('z', '30,20,10,0,-10,-20,-30,-40,-50,-60').split(',').map(Number);
const YS = arg('y', '40,45,50,55,60,65,70,75,80,85,90,95').split(',').map(Number);
const half = (y, z) => {
  if (sdf(0, y, z) > 0) {
    // hollow at the midline? scan outward
    for (let x = 0; x < 60; x += 0.25) if (sdf(x, y, z) < 0) return NaN;
    return 0;
  }
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (sdf(m, y, z) < 0) lo = m;
    else hi = m;
  }
  return lo;
};
console.log('half-width (mm) by z (rows) and y (columns); top / bottom of the midline section; widest');
console.log('   z |' + YS.map((y) => String(y).padStart(6)).join('') + ' |   top   bot | max@y');
for (const z of ZS) {
  let top = -Infinity;
  let bot = Infinity;
  for (let y = 20; y < 115; y += 0.25) if (sdf(0, y, z) < 0) (top = Math.max(top, y)), (bot = Math.min(bot, y));
  let best = [0, 0];
  for (let y = 30; y < 110; y += 0.5) {
    const h = half(y, z);
    if (h > best[0]) best = [h, y];
  }
  console.log(String(z).padStart(4) + ' |' + YS.map((y) => half(y, z).toFixed(1).padStart(6)).join('') + ` | ${top.toFixed(1).padStart(5)} ${bot.toFixed(1).padStart(5)} | ${best[0].toFixed(1)}@${best[1]}`);
}
