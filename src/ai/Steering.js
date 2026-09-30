// Steering primitives for the fish brain. Outputs are desired velocity
// vectors (m/s) that are blended by the active behaviour and handed to the
// locomotion layer as (direction, speed).

import * as THREE from 'three';
import { TANK } from '../world/TankConfig.js';

const _g = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Vision-based look-ahead obstacle avoidance: probe points ahead along the
 * current heading (1–2 s of travel, min 1.5 BL) and turn away from the
 * nearest boundary; a short-range "lateral line" repulsion (< 0.3 BL) keeps a
 * minimum clearance even when hovering.
 */
export function avoidObstacles(fish, world, out, opts = {}) {
  const SL = fish.SL;
  const L = fish.loc;
  out.set(0, 0, 0);
  const fwd = L.forward;
  const speed = Math.max(L.speed, 0.4 * SL);
  const look = Math.max(1.5 * SL, speed * 1.4);
  const margins = [0.35, 0.7, 1.0];
  for (const m of margins) {
    _p.copy(L.pos).addScaledVector(fwd, look * m + 0.36 * SL);
    const d = world.distance(_p, _g, opts);
    const clearance = 0.45 * SL + 0.5 * SL * m;
    if (d < clearance) {
      const w = (1 - Math.max(d, -clearance) / clearance) * (1.4 - m * 0.5);
      // turn away: combine outward normal with a sideways escape so the fish
      // swings around instead of stopping dead in front of the glass
      const side = new THREE.Vector3().crossVectors(_g, new THREE.Vector3(0, 1, 0));
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      if (side.dot(fwd) < 0) side.negate();
      out.addScaledVector(_g, w * 1.2).addScaledVector(side, w * 0.8);
    }
  }
  // lateral-line close-range repulsion around the body
  const d0 = world.distance(L.pos, _g, opts);
  const r0 = 0.55 * SL;
  if (d0 < r0) out.addScaledVector(_g, (1 - d0 / r0) * 2.5);
  return out.multiplyScalar(SL * 2.0);
}

/** Separation from neighbours (and their long tails). */
export function separation(fish, neighbours, out) {
  out.set(0, 0, 0);
  const SL = fish.SL;
  for (const n of neighbours) {
    const other = n.fish;
    const d = n.dist;
    const r = 0.9 * (SL + other.SL) * 0.5 + 0.25 * SL;
    if (d < r && d > 1e-5) {
      const w = (1 - d / r) ** 2;
      out.addScaledVector(n.delta, (-w / d) * SL * 3.5);
    }
    // predicted collision (time of closest approach)
    const rv = new THREE.Vector3().subVectors(other.loc.vel, fish.loc.vel);
    const tca = -n.delta.dot(rv) / Math.max(rv.lengthSq(), 1e-6);
    if (tca > 0 && tca < 1.2) {
      const closest = new THREE.Vector3().copy(n.delta).addScaledVector(rv, tca);
      const cd = closest.length();
      if (cd < r * 0.9) out.addScaledVector(closest, (-(1 - cd / r) / Math.max(cd, 1e-3)) * SL * 1.2 * (1 - tca / 1.2));
    }
  }
  return out;
}

/** Shoaling: loose cohesion + weak alignment (goldfish shoals are poorly polarised). */
export function shoal(fish, neighbours, out, { cohesion = 1, alignment = 0.25, preferred = 2.5 } = {}) {
  out.set(0, 0, 0);
  if (!neighbours.length) return out;
  const c = new THREE.Vector3();
  const a = new THREE.Vector3();
  let w = 0;
  for (const n of neighbours) {
    const wi = 1 / (1 + n.dist / (3 * fish.SL));
    c.addScaledVector(n.fish.loc.pos, wi);
    a.addScaledVector(n.fish.loc.vel, wi);
    w += wi;
  }
  c.divideScalar(w);
  a.divideScalar(w);
  const toC = c.sub(fish.loc.pos);
  const dist = toC.length();
  const want = preferred * fish.SL;
  if (dist > want * 0.6) out.addScaledVector(toC.normalize(), cohesion * Math.min(1.5, (dist - want * 0.6) / want) * fish.SL * 1.5);
  out.addScaledVector(a, alignment);
  return out;
}

/** Keep the centre of mass inside the tank (hard safety net after steering). */
export function clampToTank(fish, world) {
  const L = fish.loc;
  const SL = fish.SL;
  const m = 0.28 * SL;
  const p = L.pos;
  const g = world.groundHeight(p.x, p.z);
  const before = p.clone();
  p.x = THREE.MathUtils.clamp(p.x, -TANK.L / 2 + m, TANK.L / 2 - m);
  p.z = THREE.MathUtils.clamp(p.z, -TANK.D / 2 + m, TANK.D / 2 - m);
  p.y = THREE.MathUtils.clamp(p.y, g + 0.13 * SL, TANK.water - 0.1 * SL);
  // push out of rocks
  for (const c of world.colliders) {
    if (c.type !== 'ellipsoid') continue;
    const v = new THREE.Vector3().subVectors(p, c.center).divide(c.radii);
    const l = v.length();
    const need = 1 + (0.18 * SL) / Math.min(c.radii.x, c.radii.y, c.radii.z);
    if (l < need) {
      v.multiplyScalar(need / Math.max(l, 1e-4)).multiply(c.radii);
      p.copy(c.center).add(v);
    }
  }
  if (!before.equals(p)) {
    // cancel the velocity component into the boundary
    const n = before.sub(p);
    if (n.lengthSq() > 0) {
      n.normalize();
      const vn = L.vel.dot(n);
      if (vn > 0) L.speed *= 0.85;
    }
  }
}
