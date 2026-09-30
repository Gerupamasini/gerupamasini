// Headless behaviour simulation (no rendering): time budgets, peck rates, run–stop rhythm, disturbance.
// usage: node tools/dev/simulate.mjs [seconds=600] [birds=10] [approach=1]
import * as THREE from 'three';
import { Tide } from '../../src/world/Tide.js';
import { Terrain } from '../../src/world/Terrain.js';
import { PreyField } from '../../src/world/PreyField.js';
import { KentishPloverManager } from '../../src/birds/kentishPlover/KentishPloverLOD.js';

globalThis.setTimeout = (fn) => fn(); // alarm delays resolve immediately in the headless run
const secs = Number(process.argv[2] ?? 600);
const n = Number(process.argv[3] ?? 10);
const approach = Number(process.argv[4] ?? 1);
const tide = new Tide({ startHour: 8, timeScale: 60, phase: -1.9 });
const terrain = new Terrain({ tide, segments: 8 });
const prey = new PreyField(terrain, tide);
const world = { terrain, tide, prey, threats: [], time: 0, context: 'foraging' };
const scene = new THREE.Scene();
const mgr = new KentishPloverManager(world, scene);
let z0 = 0;
for (let z = 80; z > -140; z -= 0.5) if (terrain.heightAt(0, z) < tide.level + 0.25) { z0 = z; break; }
for (let i = 0; i < n; i++) mgr.spawn({ seed: 300 + i, palette: i % 3 === 1 ? 'femaleBreeding' : 'maleBreeding', position: new THREE.Vector3((i - n / 2) * 1.6, 0, z0 + 1.5 + (i % 3)), lods: [2], shadows: false });
const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
cam.position.set(0, 500, 0); // far → LOD3, not visible → exercises the advance() path
cam.updateMatrixWorld();
const player = { type: 'human', pos: new THREE.Vector3(0, 0, z0 + 90), vel: new THREE.Vector3() };
world.threats.push(player);
world.player = player;
const dt = 1 / 30;
const budget = {};
const moves = [];
const scans = [];
const perBird = mgr.all.map(() => ({ state: null, t0: 0, from: null }));
const flushAt = [];
for (let step = 0; step < secs / dt; step++) {
  const t = step * dt;
  world.time = t;
  tide.update(dt);
  prey.update(dt);
  // player walks straight at the flock during the last third of the run
  if (approach && t > secs * 0.66) {
    player.vel.set(0, 0, -1.35);
    player.pos.addScaledVector(player.vel, dt);
  }
  mgr.update(dt, cam);
  mgr.all.forEach((b, i) => {
    const s = b.ai.state;
    budget[s] = (budget[s] ?? 0) + dt;
    const pb = perBird[i];
    if (s !== pb.state) {
      if ((pb.state === 'RUN' || pb.state === 'WALK') && pb.from) moves.push({ d: b.pos.distanceTo(pb.from), dur: t - pb.t0, purpose: b.ai.purpose });
      if (pb.state === 'FORAGE_SEARCH') scans.push(t - pb.t0);
      if (s === 'TAKEOFF') flushAt.push({ t, d: Math.hypot(player.pos.x - b.pos.x, player.pos.z - b.pos.z), reason: b.ai.flightReason });
      pb.state = s;
      pb.t0 = t;
      pb.from = b.pos.clone();
    }
  });
}
const tot = Object.values(budget).reduce((a, b) => a + b, 0);
console.log(`\n=== ${n} birds × ${secs}s (game ×${tide.timeScale}); tide now ${tide.state} ${tide.level.toFixed(2)} m`);
console.log('Time budget (%):', Object.entries(budget).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / tot).toFixed(1)}`).join('  '));
const pecks = mgr.all.reduce((a, b) => a + b.ai.stats.pecks, 0);
const eaten = mgr.all.reduce((a, b) => a + b.ai.stats.eaten, 0);
const foragingTime = (budget.FORAGE_SEARCH ?? 0) + (budget.PECK ?? 0) + (budget.EAT ?? 0) + (budget.RUN ?? 0) * 0.5 + (budget.WALK ?? 0) * 0.5;
console.log(`Pecks ${pecks} (${((pecks / Math.max(1, foragingTime)) * 60).toFixed(1)} per foraging-minute), success ${((eaten / Math.max(1, pecks)) * 100).toFixed(0)}%`);
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN; };
const rel = moves.filter((m) => m.purpose === 'relocate' || m.purpose === 'prey');
console.log(`Foraging moves: n=${rel.length}, distance median ${q(rel.map((m) => m.d), 0.5).toFixed(2)} m (10–90%: ${q(rel.map((m) => m.d), 0.1).toFixed(2)}–${q(rel.map((m) => m.d), 0.9).toFixed(2)}), duration median ${q(rel.map((m) => m.dur), 0.5).toFixed(2)} s`);
console.log(`Stationary search bouts: n=${scans.length}, median ${q(scans, 0.5).toFixed(2)} s (10–90%: ${q(scans, 0.1).toFixed(2)}–${q(scans, 0.9).toFixed(2)})`);
console.log(`Take-offs: ${flushAt.length}; flush distances to approaching person: ${flushAt.filter((f) => f.reason === 'flee').map((f) => f.d.toFixed(1)).join(', ') || '—'}`);
console.log('Stats per bird (eaten/pecks/flights):', mgr.all.map((b) => `${b.ai.stats.eaten}/${b.ai.stats.pecks}/${b.ai.stats.flights}`).join(' '));
