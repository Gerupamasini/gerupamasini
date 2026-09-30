// Solves rest joint angles so key points of each limb reach target positions (body frame, 1 unit = 1 cm ~ carapace width).
// node tools/solve-pose.mjs  -> prints the `rest` tables to paste into crab-builder.js
import { serve } from './server.mjs';
import { launch } from './build-model.mjs';
import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync('tools/pose-targets.json', 'utf8'));
const srv = await serve(8130), browser = await launch(), page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8130/index.html'); await page.waitForFunction('window.__ready', null, { timeout: 90000 });
const out = await page.evaluate(async (cfg) => {
  const THREE = await import('three'); const api = window.__api, N = api.nodes(), D = Math.PI / 180;
  const body = N.Body; const V = (a) => new THREE.Vector3(...a);
  const bodyPos = (o, local = [0, 0, 0]) => { o.updateWorldMatrix(true, false); const w = V(local).applyMatrix4(o.matrixWorld); return body.worldToLocal(w); };
  const bodyDir = (o, local) => { const q = new THREE.Quaternion(); const p = new THREE.Vector3(), s = new THREE.Vector3(); o.updateWorldMatrix(true, false); o.matrixWorld.decompose(p, q, s); const bq = new THREE.Quaternion(); body.matrixWorld.decompose(p, bq, s); return V(local).applyQuaternion(q).applyQuaternion(bq.invert()).normalize(); };
  const results = {};
  for (const limb of cfg.limbs) {
    const joints = limb.joints.map((j) => ({ name: j.name, node: N[j.name], axes: j.axes, lim: j.lim, init: j.init }));
    joints.forEach((j) => { j.node.rotation.set(0, 0, 0); });
    const nvar = joints.reduce((a, j) => a + j.axes.length, 0);
    const set = (x) => { let k = 0; joints.forEach((j) => { const r = [0, 0, 0]; j.axes.forEach((ax) => { r['xyz'.indexOf(ax)] = x[k++] * D; }); j.node.rotation.set(r[0], r[1], r[2]); }); body.updateMatrixWorld(true); };
    const cost = (x) => {
      set(x); let c = 0;
      for (const t of limb.targets) {
        const nd = N[t.node];
        if (t.pos) { const p = bodyPos(nd, t.local || [0, 0, 0]); c += (t.w || 1) * p.distanceToSquared(V(t.pos)); }
        if (t.dir) { const d = bodyDir(nd, t.axis), tg = V(t.dir).normalize(); c += (t.w || 1) * 0.5 * (1 - d.dot(tg)); }
      }
      let k = 0; joints.forEach((j) => j.axes.forEach((ax, ai) => { const lo = j.lim[ai][0], hi = j.lim[ai][1], v = x[k++]; if (v < lo) c += 1e-3 * (lo - v) ** 2; if (v > hi) c += 1e-3 * (v - hi) ** 2; }));
      return c;
    };
    let best = null, bc = 1e9; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let rs = 0; rs < 60; rs++) {
      let x = []; joints.forEach((j) => j.axes.forEach((ax, ai) => x.push(rs === 0 ? j.init[ai] : j.lim[ai][0] + rnd() * (j.lim[ai][1] - j.lim[ai][0]))));
      let c = cost(x), step = 40;
      for (let it = 0; it < 220 && step > 0.05; it++) {
        let improved = false;
        for (let i = 0; i < x.length; i++) for (const sg of [1, -1]) { const y = x.slice(); y[i] += sg * step; const cy = cost(y); if (cy < c) { x = y; c = cy; improved = true; } }
        if (!improved) step *= 0.5;
      }
      if (c < bc) { bc = c; best = x; }
    }
    set(best);
    const res = {}; let k = 0; joints.forEach((j) => { const r = [0, 0, 0]; j.axes.forEach((ax) => { r['xyz'.indexOf(ax)] = +best[k++].toFixed(1); }); res[j.name] = r; });
    const dev = limb.targets.filter((t) => t.pos).map((t) => +bodyPos(N[t.node], t.local || [0, 0, 0]).distanceTo(V(t.pos)).toFixed(3));
    const dirs = limb.targets.filter((t) => t.dir).map((t) => bodyDir(N[t.node], t.axis).toArray().map((v) => +v.toFixed(2)));
    results[limb.name] = { cost: +bc.toFixed(4), angles: res, posErrors: dev, dirs };
  }
  return results;
}, cfg);
console.log(JSON.stringify(out, null, 1));
await browser.close(); srv.close();
