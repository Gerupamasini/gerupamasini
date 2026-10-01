#!/usr/bin/env node
// Behaviour check for the mudflat scene: runs the simulation for a few simulated minutes in headless
// Chromium and reports, per goby, how its time was spent, how often it changed mode, burrow use, and any
// NaN, ground penetration or overlap between fish. Build first (npm run build).
//   node tools/scene/simcheck.mjs [seconds] [query]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const seconds = Number(process.argv[2] || 240);
const query = process.argv[3] || '';
const PORT = 4175;
const BASE = process.env.VITE_BASE ?? '/gerupamasini/';
const url = `http://localhost:${PORT}${BASE}higata.html?nohelp&dpr=0.25${query ? '&' + query : ''}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch { /* retry */ } await wait(500); }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  page.on('pageerror', (e) => { code = 1; console.error('pageerror:', e.message); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__higataScene && window.__higataScene.frameCount > 1, null, { timeout: 300000 });
  const report = await page.evaluate((sec) => {
    const s = window.__higataScene;
    s.state.paused = true; // the page loop stops stepping; we step here
    const dt = 1 / 60;
    const stats = s.fish.map((f) => ({ species: f.behavior.species, modes: {}, changes: 0, last: f.behavior.state.mode, nan: 0, below: 0, maxBelow: 0, enters: 0, peeks: 0, emerges: 0, dist: 0 }));
    let overlap = 0, minPair = 1;
    const prev = s.fish.map((f) => f.root.position.clone());
    const v = new s.THREE.Vector3();
    for (let t = 0; t < sec; t += dt) {
      s.step(dt);
      s.fish.forEach((f, i) => {
        const st = f.behavior.state, S = stats[i];
        S.modes[st.mode] = (S.modes[st.mode] || 0) + dt;
        if (st.mode !== S.last) {
          S.changes++;
          if (st.mode === 'enter') S.enters++;
          if (st.mode === 'peek') S.peeks++;
          if (st.mode === 'emerge') S.emerges++;
          S.last = st.mode;
        }
        const p = f.root.position;
        if (!Number.isFinite(p.x + p.y + p.z)) S.nan++;
        S.dist += p.distanceTo(prev[i]);
        prev[i].copy(p);
        // body points that sink into the sediment (only checked on the ground)
        if (!st.inPath) {
          for (const name of ['J_head', 'J_root', 'J_sp3', 'J_sp6']) {
            f.bones[name].getWorldPosition(v);
            const g = s.flat.height(v.x, v.z);
            const pen = g - (v.y - 0.0008);
            if (pen > 0.0008) { S.below++; S.maxBelow = Math.max(S.maxBelow, pen); }
          }
        }
      });
      for (let i = 0; i < s.fish.length; i++) for (let j = i + 1; j < s.fish.length; j++) {
        const a = s.fish[i].behavior, b = s.fish[j].behavior;
        if (a.hidden || b.hidden || a.state.inPath || b.state.inPath) continue;
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
        minPair = Math.min(minPair, d);
        if (d < 0.25 * (a.bl + b.bl)) overlap += dt;
      }
    }
    return { stats: stats.map((S) => ({ ...S, modes: Object.fromEntries(Object.entries(S.modes).map(([k, x]) => [k, +(x / sec * 100).toFixed(1)])) })), overlap, minPair };
  }, seconds);
  for (const [i, S] of report.stats.entries()) {
    console.log(`#${i} ${S.species.padEnd(8)} changes ${String(S.changes).padStart(3)}  moved ${(S.dist * 100).toFixed(0).padStart(4)} cm  enter ${S.enters} peek ${S.peeks} emerge ${S.emerges}  nan ${S.nan}  sink ${S.below} (max ${(S.maxBelow * 1000).toFixed(2)} mm)`);
    console.log('    ', JSON.stringify(S.modes));
    if (S.nan) code = 1;
  }
  console.log(`overlap (bodies closer than half a length): ${report.overlap.toFixed(1)} s, closest pair ${(report.minPair * 100).toFixed(1)} cm`);
  await browser.close();
} catch (e) { console.error(e); code = 1; } finally { server.kill(); }
process.exit(code);
