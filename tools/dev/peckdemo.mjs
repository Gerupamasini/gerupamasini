// Timed capture of an AI bird feeding in the demo (run/walk to the prey → stop → fixation → peck → handling →
// recover): fixed 60 Hz simulation steps, frame-exact (demo ?fixedDt&manual), a screenshot every `every` steps
// with the bird's state and action phase printed per frame. The camera follows the bird from its side.
// usage: node tools/dev/peckdemo.mjs [--out=dir] [--every=2] [--secs=3] [--prey=polychaete|crab|amphipod|any]
//        [--seed=3] [--dist=0.42] [--n=1] (n: feeding sequences to capture)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const out = args.out ?? 'peckdemo-out';
const every = Number(args.every ?? 2);
const secs = Number(args.secs ?? 3);
const want = args.prey ?? 'any';
const camDist = Number(args.dist ?? 0.42);
mkdirSync(out, { recursive: true });

const server = await createServer({ logLevel: 'error', server: { port: 5230, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base}/index.html?capture&debug=0&fixedDt=${1 / 60}&manual&readyAfter=30&seed=${args.seed ?? 3}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
// (only the canvas: the HUD and the panel hidden)
await page.evaluate(() => {
  const c = document.querySelector('canvas');
  for (const d of document.body.querySelectorAll('*')) if (d !== c && !d.contains(c)) d.style.display = 'none';
});

const log = [];
for (let seq = 0; seq < Number(args.n ?? 1); seq++) {
  // advance until some bird heads for a prey item of the wanted type
  const found = await page.evaluate((want) => {
    const D = window.demo;
    for (let i = 0; i < 60 * 300; i++) {
      D.tick(1, false);
      for (const b of D.birds.all) {
        const ai = b.ai;
        if ((ai.state === 'RUN' || ai.state === 'WALK') && ai.purpose === 'prey' && ai.targetPrey && (want === 'any' || ai.targetPrey.type === want) && ai.stateTime < 0.05) {
          D.selected = b;
          D.__cap = b;
          return { id: D.birds.all.indexOf(b), type: ai.targetPrey.type, d: Math.hypot(ai.targetPrey.pos.x - b.pos.x, ai.targetPrey.pos.z - b.pos.z) };
        }
      }
    }
    return null;
  }, want);
  if (!found) {
    console.log('no feeding bird found');
    break;
  }
  console.log(`sequence ${seq}: bird ${found.id}, ${found.type} at ${found.d.toFixed(2)} m`);
  const n = Math.round((secs * 60) / every);
  let peckSeen = false;
  let after = 0;
  for (let f = 0; f < n; f++) {
    const info = await page.evaluate(
      ({ every, camDist }) => {
        const D = window.demo;
        const b = D.__cap;
        // camera on the bird's left, slightly in front and above (like p007), following it
        const h = b.heading;
        const side = { x: Math.cos(h), z: -Math.sin(h) };
        const fx = Math.sin(h);
        const fz = Math.cos(h);
        D.controls.target.set(b.pos.x + fx * 0.02, b.pos.y + 0.045, b.pos.z + fz * 0.02);
        D.camera.position.set(b.pos.x + side.x * camDist + fx * camDist * 0.35, b.pos.y + 0.07, b.pos.z + side.z * camDist + fz * camDist * 0.35);
        D.camera.lookAt(D.controls.target);
        D.selected = b; // (resets the follow reference: the camera then moves with the bird while stepping)
        D.tick(every - 1, false);
        D.tick(1);
        const a = b.animator.action;
        return { state: b.ai.state, act: a ? `${a.name} ${(a.t / a.dur).toFixed(2)}` : '-', speed: b.speed.toFixed(2), t: D.world.time.toFixed(3) };
      },
      { every, camDist },
    );
    await page.screenshot({ path: `${out}/s${seq}_${String(f).padStart(3, '0')}.png` });
    log.push({ seq, f, ...info });
    console.log(`  ${String(f).padStart(3)} t=${info.t} ${info.state.padEnd(14)} ${info.act.padEnd(12)} v=${info.speed}`);
    if (info.act.startsWith('peck')) peckSeen = true;
    if (peckSeen && info.act === '-' && ++after > 12) break;
  }
}
writeFileSync(`${out}/log.json`, JSON.stringify(log, null, 1));
await browser.close();
await server.close();
