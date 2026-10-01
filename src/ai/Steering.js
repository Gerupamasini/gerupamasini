// Steering primitives for the fish brain. Outputs are desired velocity
// vectors (m/s) that are blended by the active behaviour and handed to the
// locomotion layer as (direction, speed).

import * as THREE from 'three';
import { TANK } from '../world/TankConfig.js';
import { profile } from '../fish/morphology.js';
import { NS } from '../fish/RigLayout.js';

const _g = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();

// ---------------------------------------------------------------- body model
// Collision model of a fish: a chain of points along the (bent) midline with
// elliptic cross-sections (half width w, half height h, centred c above the
// axis, all in SL), followed by the caudal fin: two thin, tall sections
// through the middle and the tips of the simulated caudal rays (so the
// collision fin trails and swings with the drawn one).
const CAP = [0.04, 0.2, 0.4, 0.6, 0.8, 1.0].map((s) => ({
  i: Math.round(s * (NS - 1)),
  w: profile.hw(s),
  h: 0.5 * (profile.top(s) - profile.bot(s)),
  c: 0.5 * (profile.top(s) + profile.bot(s)),
}));
const NB = CAP.length; // body points; the fin adds two more
const NCAP = NB + 2;
const FIN_W = 0.025; // half thickness of the fin sections (SL)
let _capFrame = 0;

/** World-space collision chain of a fish (cached per simulation frame). */
export function bodyCapsule(f, force = false) {
  let c = f._cap;
  if (!c) c = f._cap = { p: new Float32Array(NCAP * 3), w: new Float32Array(NCAP), h: new Float32Array(NCAP), up: new THREE.Vector3(), frame: -1 };
  if (!force && c.frame === _capFrame) return c;
  c.frame = _capFrame;
  const L = f.loc;
  const SL = f.SL;
  const up = c.up.set(0, 1, 0).applyQuaternion(L.quat);
  // this individual's build: deep / slim, broad / narrow body
  const v = f.variation;
  const ds = v ? v.depthScale : 1;
  const ws = v ? v.widthScale : 1;
  for (let k = 0; k < NB; k++) {
    const e = CAP[k];
    _p.fromArray(L.localP, e.i * 3).applyQuaternion(L.quat).add(L.pos).addScaledVector(up, e.c * SL * ds);
    _p.toArray(c.p, k * 3);
    c.w[k] = e.w * SL * ws;
    c.h[k] = e.h * SL * ds;
  }
  const rig = f.rig;
  const b = (NB - 1) * 3;
  if (rig && rig.initialized) {
    // centroid and vertical spread of the caudal ray nodes at mid length and at the tips
    for (let m = 0; m < 2; m++) {
      let x = 0;
      let y = 0;
      let z = 0;
      let n = 0;
      let hi = -Infinity;
      let lo = Infinity;
      for (const ch of rig.chains) {
        if (ch.type !== 0) continue;
        const o = (ch.offset + (m === 0 ? ch.M >> 1 : ch.M - 1)) * 3;
        const px = rig.pos[o];
        const py = rig.pos[o + 1];
        const pz = rig.pos[o + 2];
        x += px;
        y += py;
        z += pz;
        n++;
        const v = px * up.x + py * up.y + pz * up.z;
        if (v > hi) hi = v;
        if (v < lo) lo = v;
      }
      const k = (NB + m) * 3;
      c.p[k] = x / n;
      c.p[k + 1] = y / n;
      c.p[k + 2] = z / n;
      c.w[NB + m] = FIN_W * SL;
      c.h[NB + m] = Math.max(0.05 * SL, 0.45 * (hi - lo));
    }
  } else {
    // before the fins exist: a straight fin continuing the peduncle
    const a = (NB - 2) * 3;
    _n.set(c.p[b] - c.p[a], c.p[b + 1] - c.p[a + 1], c.p[b + 2] - c.p[a + 2]).normalize();
    for (let m = 0; m < 2; m++) {
      const k = (NB + m) * 3;
      const l = (m === 0 ? 0.35 : 0.7) * SL;
      c.p[k] = c.p[b] + _n.x * l;
      c.p[k + 1] = c.p[b + 1] + _n.y * l;
      c.p[k + 2] = c.p[b + 2] + _n.z * l;
      c.w[NB + m] = FIN_W * SL;
      c.h[NB + m] = (m === 0 ? 0.17 : 0.28) * SL;
    }
  }
  return c;
}

// radius of an elliptic section (half axes w, h; dorsal axis `up`) toward the unit direction (nx,ny,nz)
function sectionRadius(w, h, up, nx, ny, nz) {
  const sn = Math.min(1, Math.abs(nx * up.x + ny * up.y + nz * up.z));
  const cs2 = Math.max(0, 1 - sn * sn);
  return (w * h) / Math.sqrt(h * h * cs2 + w * w * sn * sn);
}

const _cp = { s: 0, t: 0 };
// closest points between segments p1-q1 and p2-q2 (flat arrays, offsets a1,b1,a2,b2)
function closestSegSeg(P, a1, b1, Q, a2, b2, out) {
  const d1x = P[b1] - P[a1];
  const d1y = P[b1 + 1] - P[a1 + 1];
  const d1z = P[b1 + 2] - P[a1 + 2];
  const d2x = Q[b2] - Q[a2];
  const d2y = Q[b2 + 1] - Q[a2 + 1];
  const d2z = Q[b2 + 2] - Q[a2 + 2];
  const rx = P[a1] - Q[a2];
  const ry = P[a1 + 1] - Q[a2 + 1];
  const rz = P[a1 + 2] - Q[a2 + 2];
  const A = d1x * d1x + d1y * d1y + d1z * d1z;
  const E = d2x * d2x + d2y * d2y + d2z * d2z;
  const F = d2x * rx + d2y * ry + d2z * rz;
  const C = d1x * rx + d1y * ry + d1z * rz;
  const Bv = d1x * d2x + d1y * d2y + d1z * d2z;
  const den = A * E - Bv * Bv;
  let s = den > 1e-12 ? clamp01((Bv * F - C * E) / den) : 0;
  let t = (Bv * s + F) / Math.max(E, 1e-12);
  if (t < 0) {
    t = 0;
    s = clamp01(-C / Math.max(A, 1e-12));
  } else if (t > 1) {
    t = 1;
    s = clamp01((Bv - C) / Math.max(A, 1e-12));
  }
  out.s = s;
  out.t = t;
}

/**
 * Smallest surface gap between two fish bodies (negative = penetration).
 * `outN` receives the unit direction from A toward B at the closest pair.
 * Fin-to-fin contacts are ignored (fins overlap and bend around each other).
 */
export function bodyGap(fa, fb, outN) {
  const A = bodyCapsule(fa);
  const B = bodyCapsule(fb);
  let best = Infinity;
  for (let i = 0; i < NCAP - 1; i++) {
    for (let j = 0; j < NCAP - 1; j++) {
      if (i >= NB - 1 && j >= NB - 1) continue; // fin against fin
      closestSegSeg(A.p, i * 3, i * 3 + 3, B.p, j * 3, j * 3 + 3, _cp);
      const s = _cp.s;
      const t = _cp.t;
      const ax = A.p[i * 3] + (A.p[i * 3 + 3] - A.p[i * 3]) * s;
      const ay = A.p[i * 3 + 1] + (A.p[i * 3 + 4] - A.p[i * 3 + 1]) * s;
      const az = A.p[i * 3 + 2] + (A.p[i * 3 + 5] - A.p[i * 3 + 2]) * s;
      const bx = B.p[j * 3] + (B.p[j * 3 + 3] - B.p[j * 3]) * t;
      const by = B.p[j * 3 + 1] + (B.p[j * 3 + 4] - B.p[j * 3 + 1]) * t;
      const bz = B.p[j * 3 + 2] + (B.p[j * 3 + 5] - B.p[j * 3 + 2]) * t;
      let nx = bx - ax;
      let ny = by - ay;
      let nz = bz - az;
      const d = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (d < 1e-7) {
        nx = 0;
        ny = 1;
        nz = 0;
      } else {
        nx /= d;
        ny /= d;
        nz /= d;
      }
      const rA = sectionRadius(A.w[i] + (A.w[i + 1] - A.w[i]) * s, A.h[i] + (A.h[i + 1] - A.h[i]) * s, A.up, nx, ny, nz);
      const rB = sectionRadius(B.w[j] + (B.w[j + 1] - B.w[j]) * t, B.h[j] + (B.h[j + 1] - B.h[j]) * t, B.up, nx, ny, nz);
      const gap = d - rA - rB;
      if (gap < best) {
        best = gap;
        if (outN) outN.set(nx, ny, nz);
      }
    }
  }
  return best;
}

/**
 * Vision-based look-ahead obstacle avoidance: probe points ahead along the
 * current heading (≈1.2 s of travel, min 1.2 BL) and turn away from the
 * nearest boundary; a short-range "lateral line" repulsion (< 0.5 BL) keeps a
 * minimum clearance even when hovering. Look-ahead only matters for a fish
 * that is actually moving: a hovering fish is not steered by what lies in
 * front of it (unless it is about to set off: `opts.intent`), and the floor
 * only repels at close range (a fish may settle just above the gravel), more
 * strongly the faster it swims.
 * Returns a UNITLESS steering vector in `out`; `.danger` (0..1) says how
 * urgently the fish should slow down / turn.
 */
export function avoidObstacles(fish, world, out, opts = {}) {
  const SL = fish.SL;
  const L = fish.loc;
  out.set(0, 0, 0);
  out.danger = 0;
  const fwd = L.forward;
  const U = L.speed / SL;
  // probes are active when the fish moves or is about to (opts.intent = 1)
  const moving = Math.max(smoothstep01((U - 0.1) / 0.3), opts.intent || 0);
  if (moving > 0) {
    const speed = Math.max(L.speed, 0.3 * SL);
    const look = Math.max(1.2 * SL, speed * 1.2);
    const probes = [0.3, 0.65, 1.0];
    const side = _side;
    for (const m of probes) {
      _p.copy(L.pos).addScaledVector(fwd, look * m + 0.36 * SL);
      const d = world.distance(_p, _g, opts);
      const clearance = 0.3 * SL + 0.45 * SL * m;
      if (d < clearance) {
        const w = clamp01(1 - d / clearance) * (1.3 - m * 0.5) * moving;
        // turn away: outward normal + sideways escape so the fish swings round
        side.crossVectors(_g, UP);
        if (side.lengthSq() < 1e-6) side.set(-fwd.z, 0, fwd.x);
        side.normalize();
        if (side.dot(fwd) < 0) side.negate();
        // in a corner the default side may lead into the next wall: escape
        // toward whichever side has more room
        const gx = _g.x;
        const gy = _g.y;
        const gz = _g.z;
        const dA = world.distance(_q.copy(_p).addScaledVector(side, 0.8 * SL), null, opts);
        const dB = world.distance(_q.copy(_p).addScaledVector(side, -0.8 * SL), null, opts);
        if (dB > dA + 0.1 * SL) side.negate();
        _g.set(gx, gy, gz);
        out.addScaledVector(_g, w * 1.1).addScaledVector(side, w * 0.9);
        out.danger = Math.max(out.danger, w * (1 - 0.4 * m));
      }
    }
  }
  // lateral-line close-range repulsion around the body. The glass walls are
  // summed (a corner pushes out along its diagonal instead of flipping
  // between its two walls); rocks, plants and the surface come from the
  // nearest-boundary query.
  // (a turning fish swings its rear half outward: it keeps more room)
  const r0 = (0.45 + 0.12 * Math.min(1, Math.abs(L.yawRate || 0) / 2.5)) * SL;
  const p = L.pos;
  const { min, max } = world.bounds;
  let dWall = Infinity;
  const wall = (d, gx, gz) => {
    dWall = Math.min(dWall, d);
    if (d < r0) {
      const w = 1 - Math.max(0, d) / r0;
      out.x += gx * w * 2.0;
      out.z += gz * w * 2.0;
      out.danger = Math.max(out.danger, w);
    }
  };
  wall(p.x - min.x, 1, 0);
  wall(max.x - p.x, -1, 0);
  wall(p.z - min.z, 0, 1);
  wall(max.z - p.z, 0, -1);
  const d0 = world.distance(p, _g, { ...opts, ignoreFloor: true });
  if (d0 < r0 && d0 < dWall - 1e-6) {
    const w = 1 - Math.max(0, d0) / r0;
    out.addScaledVector(_g, w * 2.0);
    out.danger = Math.max(out.danger, w);
  }
  // floor: radius grows with speed (0.2 BL hovering .. 0.45 BL swimming)
  if (!opts.ignoreFloor) {
    const dF = L.pos.y - world.groundHeight(L.pos.x, L.pos.z);
    const rF = (0.2 + 0.25 * smoothstep01((U - 0.1) / 0.7)) * SL;
    if (dF < rF) {
      const w = 1 - Math.max(0, dF) / rF;
      out.y += w * 2.0;
      out.danger = Math.max(out.danger, w);
    }
  }
  return out;
}

const _side = new THREE.Vector3();
const smoothstep01 = (x) => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};

const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Separation from neighbours (and their long tails). */
export function separation(fish, neighbours, out) {
  out.set(0, 0, 0);
  const SL = fish.SL;
  bodyCapsule(fish, true);
  for (const n of neighbours) {
    const other = n.fish;
    const d = n.dist;
    const r = 1.25 * (SL + other.SL) * 0.5 + 0.35 * SL;
    if (d < r && d > 1e-5) {
      const w = (1 - d / r) ** 2;
      out.addScaledVector(n.delta, (-w / d) * 3.2);
    }
    // body contact: keep clear of the nearest part of the neighbour's body,
    // its peduncle and tail included (the centres alone say little about
    // two fish lying side by side or across each other)
    if (d < 1.2 * (SL + other.SL)) {
      const gap = bodyGap(fish, other, _u);
      const range = 0.5 * SL;
      if (gap < range) out.addScaledVector(_u, -3.5 * (1 - Math.max(gap, 0) / range) ** 2);
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

// ventral clearance samples along the body: spine index, ventral depth (SL,
// negative) and the clearance kept above the base of the gravel bed (m;
// pebble tops reach ~3–4 mm)
const CLEAR = [0, 0.05, 0.1, 0.18, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0].map((s) => ({ i: Math.round(s * (NS - 1)), bot: profile.bot(s), hw: profile.hw(s), margin: s < 0.25 ? 0.0045 : 0.0025 }));

// largest per-frame correction of the bent body out of the glass (m)
const GLASS_STEP = 0.0005;

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
  // the head and belly (bent midline, body pitch) stay above the pebble tops:
  // a foraging fish touches the gravel with its lips, it never sinks into it
  _u.set(0, 1, 0).applyQuaternion(L.quat);
  let lift = 0;
  // the whole bent body (not just its centre) stays inside the glass: a
  // fish turning close to a wall never swings its rear half through it
  const { min, max } = world.bounds;
  const ds = fish.variation ? fish.variation.depthScale : 1;
  const ws = fish.variation ? fish.variation.widthScale : 1;
  let sx0 = 0;
  let sx1 = 0;
  let sz0 = 0;
  let sz1 = 0;
  for (const e of CLEAR) {
    _q.fromArray(L.localP, e.i * 3).applyQuaternion(L.quat).add(p);
    const low = _q.y + _u.y * e.bot * SL * ds;
    lift = Math.max(lift, world.groundHeight(_q.x, _q.z) + e.margin - low);
    const r = e.hw * SL * ws + 0.002;
    sx0 = Math.max(sx0, min.x + r - _q.x);
    sx1 = Math.max(sx1, _q.x - (max.x - r));
    sz0 = Math.max(sz0, min.z + r - _q.z);
    sz1 = Math.max(sz1, _q.z - (max.z - r));
  }
  // (the bent body swinging into the glass in a turn is eased out: a small
  // positional step per frame, the rest as a short outward drift - a full
  // correction in one frame shows as a sideways jolt of the whole fish)
  const bx = sx0 - sx1;
  const bz = sz0 - sz1;
  const cx = THREE.MathUtils.clamp(bx, -GLASS_STEP, GLASS_STEP);
  const cz = THREE.MathUtils.clamp(bz, -GLASS_STEP, GLASS_STEP);
  p.x += cx;
  p.z += cz;
  if (bx !== cx || bz !== cz) {
    L.contactVel.x += (bx - cx) * 15;
    L.contactVel.z += (bz - cz) * 15;
    L.contactVel.clampLength(0, 0.6 * SL);
  }
  L.groundContact = lift;
  if (lift > 0) {
    p.y += lift;
    // the lift is not a collision: the fish slides along the gravel (and
    // levels out, see Locomotion) at the cost of a little speed
    before.y += lift;
    if (L.vel.y < 0) L.contactBrake = Math.max(L.contactBrake, 1.2);
  }
  // local ground plane for the fin dynamics (fins rest on the gravel, they
  // do not hang into it)
  const fl = fish.rig.floor || (fish.rig.floor = { y: 0, gx: 0, gz: 0, x: 0, z: 0 });
  fl.x = p.x;
  fl.z = p.z;
  fl.y = world.groundHeight(p.x, p.z);
  fl.gx = (world.groundHeight(p.x + 0.02, p.z) - fl.y) / 0.02;
  fl.gz = (world.groundHeight(p.x, p.z + 0.02) - fl.y) / 0.02;
  // glass faces for the fin dynamics (fins slide along the glass, never through it)
  fish.rig.walls = world.bounds;
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
      // (the speed loss is spread over a few frames: Locomotion.contactBrake)
      if (vn > 0) L.contactBrake = Math.max(L.contactBrake, 2.5);
    }
  }
}

/**
 * Positional de-penetration between fish bodies (elliptic body sections along
 * the bent midline, plus the caudal fins). Steering avoids most contacts;
 * this keeps bodies and tails from passing through each other in feeding
 * scrums, as real fish would bump and slide. A resting fish yields less.
 */
export function resolveOverlaps(fishList) {
  _capFrame++;
  const n = fishList.length;
  for (const f of fishList) bodyCapsule(f, true);
  // (one pass: the contact is resolved over several frames, see below)
  {
    for (let i = 0; i < n; i++) {
      const fi = fishList[i];
      for (let j = i + 1; j < n; j++) {
        const fj = fishList[j];
        const reach = 1.15 * (fi.SL + fj.SL);
        if (fi.loc.pos.distanceToSquared(fj.loc.pos) > reach * reach) continue;
        // bodies keep a thin film of water between them: overlaps are
        // removed, near-contacts are eased apart
        const buffer = 0.04 * Math.min(fi.SL, fj.SL);
        const gap = bodyGap(fi, fj, _n);
        if (gap >= buffer) continue;
        const mi = fi.loc.restLevel > 0.5 ? 0.25 : 1;
        const mj = fj.loc.restLevel > 0.5 ? 0.25 : 1;
        // Soft contact: a near-contact or shallow overlap is a stiff, well
        // damped spring acting on the velocity (Locomotion.contactVel), so
        // the bodies ease apart over a few frames; positional steps (which
        // chatter on and off from frame to frame and read as twitching) are
        // kept for real interpenetration only, and are small.
        const SLm = Math.min(fi.SL, fj.SL);
        {
          const pen = buffer - gap;
          _kick(fi, _n, (-pen * mi) / (mi + mj));
          _kick(fj, _n, (pen * mj) / (mi + mj));
        }
        if (gap < 0) {
          // (the step is a smooth function of the depth: it fades in from
          // zero, takes half the overlap per frame up to a small cap, and only
          // a deep overlap is removed faster - no on/off chatter)
          const pen = -gap;
          const step = Math.min(0.5 * pen, MAX_STEP) * smoothstep01(pen / (0.02 * SLm)) + 2 * MAX_STEP * smoothstep01((pen - 0.12 * SLm) / (0.1 * SLm));
          _push(fi, _n, (-step * mi) / (mi + mj));
          _push(fj, _n, (step * mj) / (mi + mj));
        }
        // the fish driving into the other loses some speed (gradually)
        if (fi.loc.vel.dot(_n) > 0) fi.loc.contactBrake = Math.max(fi.loc.contactBrake, 1.5);
        if (fj.loc.vel.dot(_n) < 0) fj.loc.contactBrake = Math.max(fj.loc.contactBrake, 1.5);
      }
    }
  }
}

const _d = new THREE.Vector3();
// largest positional contact correction per fish pair and frame (m; up to
// three times this for a deep overlap)
const MAX_STEP = 0.00015;
// contact spring on the velocity: per frame, m/s per m of overlap (≈ 100 s⁻²
// at 60 fps; the contact velocity decays with 0.06 s in Locomotion, which
// makes the contact well damped: the bodies separate without bouncing)
const K_CONTACT = 1.6;
function _kick(f, d, k) {
  const v = f.loc.contactVel;
  v.addScaledVector(d, k * K_CONTACT);
  if (v.y < 0 && (f.loc.groundContact > 0 || f.loc.pos.y - f.rig.floorY() < 0.32 * f.SL)) v.y = 0;
  v.clampLength(0, 0.6 * f.SL);
}
// move a fish (and its already posed rig) by d*k; a fish close to the gravel
// is not pushed down into it
function _push(f, d, k) {
  _d.copy(d).multiplyScalar(k);
  if (_d.y < 0 && (f.loc.groundContact > 0 || f.loc.pos.y - f.rig.floorY() < 0.32 * f.SL)) _d.y = 0;
  f.loc.pos.add(_d);
  _shiftCapsule(f._cap, _d, 1);
  // the rig moves along, so what is drawn matches the corrected position
  f.rig.translate(_d.x, _d.y, _d.z);
}

function _shiftCapsule(c, d, k) {
  for (let i = 0; i < NCAP; i++) {
    c.p[i * 3] += d.x * k;
    c.p[i * 3 + 1] += d.y * k;
    c.p[i * 3 + 2] += d.z * k;
  }
}
