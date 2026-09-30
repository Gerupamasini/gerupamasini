import * as THREE from 'three';
import { Tide } from '../../src/world/Tide.js';
import { Terrain } from '../../src/world/Terrain.js';
import { PreyField } from '../../src/world/PreyField.js';
import { KentishPloverManager } from '../../src/birds/kentishPlover/KentishPloverLOD.js';
globalThis.setTimeout = (fn) => fn();
const secs = Number(process.argv[2] ?? 120);
const tide = new Tide({ startHour: 8, timeScale: 60, phase: -1.9 });
const terrain = new Terrain({ tide, segments: 8 });
const prey = new PreyField(terrain, tide);
const world = { terrain, tide, prey, threats: [], time: 0, context: 'foraging' };
const mgr = new KentishPloverManager(world, new THREE.Scene());
let z0 = 0;
for (let z = 80; z > -140; z -= 0.5) if (terrain.heightAt(0, z) < tide.level + 0.25) { z0 = z; break; }
for (let i = 0; i < 4; i++) mgr.spawn({ seed: 300 + i, position: new THREE.Vector3((i - 2) * 1.6, 0, z0 + 1.5), lods: [2], shadows: false });
const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 10); cam.position.set(0, 500, 0); cam.updateMatrixWorld();
const b = mgr.all[1];
let last = '';
const dt = 1 / 30;
for (let step = 0; step < secs / dt; step++) {
  const t = step * dt; world.time = t; tide.update(dt); prey.update(dt);
  mgr.update(dt, cam);
  const s = `${b.ai.state}/${b.ai.activity}`;
  if (s !== last) {
    const P = b.ai.perception; const U = b.ai.utilities ?? {};
    console.log(`${t.toFixed(1).padStart(6)} ${s.padEnd(24)} surf=${P.surface?.key} food=${P.foodHere?.toFixed(2)} best=${(b.ai._bestFoodNearby ?? 0).toFixed(2)} H=${b.ai.drives.hunger.toFixed(2)} F=${b.ai.drives.fatigue.toFixed(2)} fear=${b.ai.drives.fear.toFixed(2)} tide=${tide.state}/${tide.level.toFixed(2)} U=${Object.entries(U).map(([k, v]) => k[0] + v.toFixed(2)).join(',')} purpose=${b.ai.purpose} water=${P.distanceToWater.toFixed(1)}`);
    last = s;
  }
}
