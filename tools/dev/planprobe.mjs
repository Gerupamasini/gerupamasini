// Plan-view (top) and back cross-section probe of the body SDF (relaxed bind, mm): for each z the half-width of the
// sculpt, the height where it is widest, the top of the back and the half-widths 2 / 5 / 10 mm below the back's top
// (a round back: ≈ 0.45 / 0.68 / 0.86 of the max half-width for a circle of the section's width).
// usage: node tools/dev/planprobe.mjs [--trunk]   (--trunk: the trunk-only outline under the folded wing)
import { getBodySDF, getTorsoSDF } from '../../src/birds/kentishPlover/anatomy/bodyMesh.js';
import { KentishPloverConfig as CFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';

const sdf = process.argv.includes('--trunk') ? getTorsoSDF(CFG, { trunkOnly: true }) : getBodySDF(CFG);
const hw = (y, z) => {
  if (sdf(0, y, z) > 0) return 0;
  let a = 0;
  let b = 40;
  for (let i = 0; i < 30; i++) {
    const m = (a + b) / 2;
    if (sdf(m, y, z) < 0) a = m;
    else b = m;
  }
  return a;
};
const top = (z, x = 0) => {
  let y = 110;
  while (y > 30 && sdf(x, y, z) > 0) y -= 0.1;
  return y;
};
console.log('   z   halfW  @y   topY  hw(top-2) hw(top-5) hw(top-10) ratios');
for (let z = -65; z <= 35; z += 5) {
  let best = 0;
  let by = 0;
  for (let y = 36; y < 105; y += 0.5) {
    const w = hw(y, z);
    if (w > best) [best, by] = [w, y];
  }
  const t = top(z);
  const r = [2, 5, 10].map((d) => hw(t - d, z));
  console.log(`${String(z).padStart(4)}  ${best.toFixed(1).padStart(5)} ${by.toFixed(0).padStart(4)}  ${t.toFixed(1)}  ${r.map((x) => x.toFixed(1).padStart(8)).join(' ')}   ${r.map((x) => (x / best).toFixed(2)).join('/')}`);
}
