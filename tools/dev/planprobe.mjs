// Plan-view (top) and back cross-section probe of the body SDF (relaxed bind, mm): for each z the half-width of the
// sculpt, the height where it is widest, the top of the back and the half-widths 2 / 5 / 10 mm below the back's top
// (a round back: ≈ 0.45 / 0.68 / 0.86 of the max half-width for a circle of the section's width).
// usage: node tools/dev/planprobe.mjs [--trunk]   (--trunk: the trunk-only outline under the folded wing)
//        node tools/dev/planprobe.mjs --outline [--lod=0] [--pose=stand] [--json=out.json]
//   --outline: the plan outline of the posed bird with its feathers (as planparts.mjs, LOD0 relaxed stand): half-width
//   per mm of z (the cut of every posed triangle every 0.25 mm, left and right averaged), smoothed (Gaussian σ 3 mm), and along it the curvature κ (1/mm, > 0 convex),
//   the position of the maximum width, the near-straight runs (|κ| < 0.002 /mm, radius > 500 mm, longer than 5 mm) and
//   the concave runs (κ < −0.001) and the runs that are not convex (κ < 0.002) between the neck (z +20) and the wing tips (z −65). An egg / teardrop outline: one
//   maximum in the middle of the body, κ > 0 all along, no near-straight run over ≈ 15 mm (validation §AA).
import { getBodySDF, getTorsoSDF } from '../../src/birds/kentishPlover/anatomy/bodyMesh.js';
import { KentishPloverConfig as CFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;

if (process.argv.includes('--outline')) await outline();
else probe();

function probe() {
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
}

async function outline() {
  const THREE = await import('three');
  const { KentishPloverModel } = await import('../../src/birds/kentishPlover/KentishPloverModel.js');
  const { KentishPloverAnimator } = await import('../../src/birds/kentishPlover/KentishPloverAnimator.js');
  const { CONFORM_FOLD } = await import('../../src/birds/kentishPlover/anatomy/wingFold.js');
  const LOD = Number(arg('lod', 0));
  const m = new KentishPloverModel({ lods: [LOD], shadows: false });
  const a = new KentishPloverAnimator(m, { seed: 1 });
  Object.assign(a.gaze, { yaw: 0, tYaw: 0, roll: 0, tRoll: 0, timer: 1e9, mode: 'idle' });
  a.previewAction(arg('pose', 'stand'), 0.25);
  m.object.updateMatrixWorld(true);
  // the silhouette seen from straight above: every triangle (posed as the shaders pose it) cut by the lines z = const
  // every 0.25 mm, the largest |x| of the cut on each side
  const Z0 = -90;
  const STEP = 0.25;
  const N = Math.round(140 / STEP);
  const side = [new Float64Array(N), new Float64Array(N)];
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  const fold = m.current.feathers.userData.uniforms.uFold.value;
  const put = (z, x) => {
    const b = Math.round((z - Z0) / STEP);
    if (b < 0 || b >= N) return;
    const s = x >= 0 ? 0 : 1;
    side[s][b] = Math.max(side[s][b], Math.abs(x));
  };
  for (const mesh of m.lods[LOD].meshes) {
    const isF = mesh.name.startsWith('feathers');
    if (!isF && !mesh.name.startsWith('body')) continue;
    const g = mesh.geometry;
    const P = g.getAttribute('position');
    const conf = g.getAttribute('aConform');
    const core = g.getAttribute('aCore');
    const X = new Float64Array(P.count);
    const Z = new Float64Array(P.count);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      if (isF) {
        // the feather shader's fold bend and arm tube (as planparts.mjs)
        const fv = v.x >= 0 ? fold.x : fold.y;
        const u = Math.min(1, Math.max(0, (fv - CONFORM_FOLD[0]) / (CONFORM_FOLD[1] - CONFORM_FOLD[0])));
        v.addScaledVector(c.fromBufferAttribute(conf, i), u * u * (3 - 2 * u));
        v.addScaledVector(c.fromBufferAttribute(core, i), Math.min(1, fv / 0.5));
      }
      mesh.applyBoneTransform(i, v);
      v.applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);
      X[i] = v.x;
      Z[i] = v.z;
      put(v.z, v.x);
    }
    const I = g.index ? g.index.array : Array.from({ length: P.count }, (_, i) => i);
    for (let t = 0; t < I.length; t += 3) {
      const q = [I[t], I[t + 1], I[t + 2]].sort((p, r) => Z[p] - Z[r]);
      const [za, zb, zc] = q.map((k) => Z[k]);
      for (let b = Math.ceil((za - Z0) / STEP); b * STEP + Z0 <= zc; b++) {
        const z = b * STEP + Z0;
        // the cut: on the long edge a–c and on a–b or b–c
        const xl = X[q[0]] + ((X[q[2]] - X[q[0]]) * (z - za)) / (zc - za || 1);
        const xs = z <= zb ? X[q[0]] + ((X[q[1]] - X[q[0]]) * (z - za)) / (zb - za || 1) : X[q[1]] + ((X[q[2]] - X[q[1]]) * (z - zb)) / (zc - zb || 1);
        put(z, xl);
        put(z, xs);
      }
    }
  }
  const raw = Array.from({ length: N }, (_, i) => (side[0][i] + side[1][i]) / 2);
  // Gaussian smoothing (σ 3 mm: the outline's shape, not the serration of single feather tips) over the rows with outline
  const SIG = 3 / STEP;
  const R = Math.ceil(3 * SIG);
  const sm = raw.map((_, i) => {
    let acc = 0;
    let ws = 0;
    for (let j = -R; j <= R; j++) {
      const k = i + j;
      if (k < 0 || k >= N || !raw[k]) continue;
      const w = Math.exp(-(j * j) / (2 * SIG * SIG));
      acc += w * raw[k];
      ws += w;
    }
    return ws ? acc / ws : 0;
  });
  const zOf = (i) => i * STEP + Z0;
  // curvature of the outline x(z) (differences over ±1 mm): κ = −x'' / (1 + x'²)^1.5, > 0 where it bulges outward
  const H = Math.round(1 / STEP);
  const kap = sm.map((x, i) => {
    if (i < H || i >= N - H || !sm[i - H] || !sm[i + H]) return NaN;
    const d1 = (sm[i + H] - sm[i - H]) / 2;
    const d2 = sm[i + H] - 2 * x + sm[i - H];
    return -d2 / (1 + d1 * d1) ** 1.5;
  });
  const lo = -65;
  const hi = 20;
  let imax = 0;
  for (let i = 0; i < N; i++) if (zOf(i) >= lo && zOf(i) <= hi && sm[i] > sm[imax]) imax = i;
  // where the width is within 0.25 mm of the maximum (the flat top of the outline)
  let a0 = imax;
  let a1 = imax;
  while (a0 > 0 && sm[a0 - 1] > sm[imax] - 0.125) a0--;
  while (a1 < N - 1 && sm[a1 + 1] > sm[imax] - 0.125) a1++;
  const runs = (pred) => {
    const out = [];
    let s = null;
    for (let i = 0; i < N; i++) {
      const z = zOf(i);
      const ok = z >= lo && z <= hi && pred(kap[i]);
      if (ok && s === null) s = z;
      if (!ok && s !== null) {
        out.push([z - STEP, s]);
        s = null;
      }
    }
    if (s !== null) out.push([hi, s]);
    return out.filter(([z1, z0]) => z1 - z0 >= 5).sort((p, q) => q[0] - q[1] - (p[0] - p[1]));
  };
  const straight = runs((k) => Math.abs(k) < 0.002);
  const flat = runs((k) => k < 0.002);
  const concave = runs((k) => k < -0.001);
  console.log(`plan outline (LOD${LOD}, ${arg('pose', 'stand')}, feathers + body, σ 3 mm): width (mm) and curvature κ (1/mm)`);
  console.log('   z   width  smooth      κ');
  for (let z = 25; z >= -80; z -= 2.5) {
    const i = Math.round((z - Z0) / STEP);
    console.log(`${z.toFixed(1).padStart(6)}  ${(2 * raw[i]).toFixed(1).padStart(5)}  ${(2 * sm[i]).toFixed(2).padStart(6)}  ${Number.isNaN(kap[i]) ? '     -' : kap[i].toFixed(4).padStart(8)}`);
  }
  const fmt = (r) => r.map(([z1, z0]) => `${z0}…${z1} (${z1 - z0} mm)`).join(', ') || 'none';
  console.log(`max width ${(2 * sm[imax]).toFixed(2)} mm at z ${zOf(imax)} (within 0.25 mm: z ${zOf(a0)}…${zOf(a1)})`);
  console.log(`near-straight runs (|κ| < 0.002, z ${lo}…${hi}): ${fmt(straight)}; longest ${straight.length ? straight[0][0] - straight[0][1] : 0} mm`);
  console.log(`concave runs (κ < −0.001): ${fmt(concave)}`);
  console.log(`not convex (κ < 0.002: straight or concave): ${fmt(flat)}; longest ${flat.length ? flat[0][0] - flat[0][1] : 0} mm`);
  const json = arg('json');
  if (json) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(json, JSON.stringify({ z0: Z0, raw, smooth: sm, kappa: kap, max: [zOf(imax), 2 * sm[imax]], straight, concave, flat }));
  }
}
