// Headless behaviour test: runs the simulation and reports statistics.
import { chromium } from 'playwright';
const secs = +(process.argv[2] || 180);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:4173/?pause=1&shot=wide&fish=8', { waitUntil: 'load' });
await page.waitForTimeout(3000);
const res = await page.evaluate(async (secs) => {
  const T = window.__edo; const F = T.fishes;
  const occ = {}; const trans = {}; let nan = 0, belowGround = 0, maxBL = 0, hidden = 0, escapes = 0, entries = 0, peeks = 0, feeds = 0;
  const prevState = F.map((f) => f.behavior.state);
  const dt = 1 / 60; let t = 0; let netCycle = 0;
  while (t < secs) {
    // periodically sweep the net across a random fish
    netCycle += dt;
    if (netCycle > 20) { netCycle = 0; const f = F[(Math.random() * F.length) | 0]; T.world.threats[0].position.set(f.loco.pos.x + 0.5, f.loco.pos.y + 0.06, f.loco.pos.z); T.world.threats[0].sweepTo(f.loco.pos.clone().add({ x: -0.3, y: 0, z: 0 })); }
    T.step(dt); t += dt;
    F.forEach((f, i) => {
      const s = f.behavior.state; occ[s] = (occ[s] || 0) + dt;
      if (s !== prevState[i]) { const k = prevState[i] + '>' + s; trans[k] = (trans[k] || 0) + 1; if (s === 'ESCAPE') escapes++; if (s === 'BURROW_ENTER') entries++; if (s === 'FEED') feeds++; prevState[i] = s; }
      if (f.behavior.data.peek) peeks += dt;
      const p = f.loco.pos; if (!isFinite(p.x + p.y + p.z)) nan++;
      const g = T.world.getGroundHeight(p.x, p.z);
      if (f.loco.cmd.type !== 'burrow' && p.y < g) belowGround++;
      maxBL = Math.max(maxBL, Math.abs(f.loco.speed) / f.TL);
      if (f.loco.hidden) hidden += dt;
    });
  }
  const tot = Object.values(occ).reduce((a, b) => a + b, 0);
  const pct = Object.fromEntries(Object.entries(occ).map(([k, v]) => [k, +(100 * v / tot).toFixed(1)]));
  const topTrans = Object.entries(trans).sort((a, b) => b[1] - a[1]).slice(0, 18);
  return { pct, topTrans, nan, belowGround, maxBL: +maxBL.toFixed(1), hiddenPct: +(100 * hidden / tot).toFixed(1), escapes, entries, feeds, peekPct: +(100 * peeks / tot).toFixed(1), eaten: T.world.prey.length };
}, secs);
console.log(JSON.stringify(res, null, 1));
console.log('errors:', errs.slice(0, 5));
await browser.close();
