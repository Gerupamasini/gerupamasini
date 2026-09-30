// Steering primitives for the fish brain. Outputs are desired velocity
// vectors (m/s) that are blended by the active behaviour and handed to the
// locomotion layer as (direction, speed).

import * as THREE from 'three';
import { TANK } from '../world/TankConfig.js';

const _g = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Vision-based look-ahead obstacle avoidance: probe points ahead along the
 * current heading (≈1.2 s of travel, min 1.2 BL) and turn away from the
 * nearest boundary; a short-range "lateral line" repulsion (< 0.5 BL) keeps a
 * minimum clearance even when hovering.
 * Returns a UNITLESS steering vector in `out`; `.danger` (0..1) says how
 * urgently the fish should slow down / turn.
 */
export function avoidObstacles(fish, world, out, opts = {}) {
  const SL = fish.SL;
  const L = fish.loc;
  out.set(0, 0, 0);
  out.danger = 0;
  const fwd = L.forward;
  const speed = Math.max(L.speed, 0.3 * SL);
  const look = Math.max(1.2 * SL, speed * 1.2);
  const probes = [0.3, 0.65, 1.0];
  const side = new THREE.Vector3();
  for (const m of probes) {
    _p.copy(L.pos).addScaledVector(fwd, look * m + 0.36 * SL);
    const d = world.distance(_p, _g, opts);
    const clearance = 0.3 * SL + 0.45 * SL * m;
    if (d < clearance) {
      const w = clamp01(1 - d / clearance) * (1.3 - m * 0.5);
      // turn away: outward normal + sideways escape so the fish swings round
      side.crossVectors(_g, UP);
      if (side.lengthSq() < 1e-6) side.set(-fwd.z, 0, fwd.x);
      side.normalize();
      if (side.dot(fwd) < 0) side.negate();
      out.addScaledVector(_g, w * 1.1).addScaledVector(side, w * 0.9);
      out.danger = Math.max(out.danger, w * (1 - 0.4 * m));
    }
  }
  // lateral-line close-range repulsion around the body
  const d0 = world.distance(L.pos, _g, opts);
  const r0 = 0.45 * SL;
  if (d0 < r0) {
    const w = 1 - Math.max(0, d0) / r0;
    out.addScaledVector(_g, w * 2.0);
    out.danger = Math.max(out.danger, w);
  }
  return out;
}

const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Separation from neighbours (and their long tails). */
export function separation(fish, neighbours, out) {
  out.set(0, 0, 0);
  const SL = fish.SL;
  for (const n of neighbours) {
    const other = n.fish;
    const d = n.dist;
    const r = 1.1 * (SL + other.SL) * 0.5 + 0.3 * SL;
    if (d < r && d > 1e-5) {
      const w = (1 - d / r) ** 2;
      out.addScaledVector(n.delta, (-w / d) * 3.2);
    }
    // predicted collision (time of closest approach)
    const rv = new THREE.Vector3().subVectors(other.loc.vel, fish.loc.vel);
    const tca = -n.delta.dot(rv) / Math.max(rv.lengthSq(), 1e-6);
    if (tca > 0 && tca < 1.2) {
      const closest = new THREE.Vector3().copy(n.delta).addScaledVector(rv, tca);
      const cd = closest.length();
      if (cd < r * 0.9) out.addScaledVector(closest, (-(1 - cd / r) / Math.max(cd, 1e-3)) * 0.8 * (1 - tca / 1.2));
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

/**
 * Soft positional de-penetration between fish bodies (two spheres per fish:
 * head/trunk). Steering avoids most contacts; this keeps bodies from
 * interpenetrating in feeding scrums, as real fish would bump and slide.
 */
export function resolveOverlaps(fishList) {
  const n = fishList.length;
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const fi = fishList[i];
    const fwdI = fi.loc.forward;
    for (let j = i + 1; j < n; j++) {
      const fj = fishList[j];
      if (fi.loc.pos.distanceToSquared(fj.loc.pos) > (fi.SL + fj.SL) ** 2) continue;
      const fwdJ = fj.loc.forward;
      for (const oi of [0.18, -0.2]) {
        for (const oj of [0.18, -0.2]) {
          A.copy(fi.loc.pos).addScaledVector(fwdI, oi * fi.SL);
          B.copy(fj.loc.pos).addScaledVector(fwdJ, oj * fj.SL);
          d.subVectors(B, A);
          const dist = d.length();
          const minD = 0.13 * (fi.SL + fj.SL) + 0.06 * (fi.SL + fj.SL);
          if (dist < minD && dist > 1e-6) {
            const corr = (minD - dist) * 0.5 * 0.5;
            d.multiplyScalar(corr / dist);
            fi.loc.pos.sub(d);
            fj.loc.pos.add(d);
          }
        }
      }
    }
  }
}
