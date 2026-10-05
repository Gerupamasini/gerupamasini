// Part builders shared by the six nets: hoop wire paths, hems, joints, shafts and grips.
// Frame parts are built in frame-local space (joint at the origin, hoop toward +Z in the y = 0
// plane). Handle parts are built along +Z in root space (main grip at the origin).
import { lathe, sweep, bezier, resample, circleProfile, m4, v3, MeshData, TAU, clamp, smooth } from './geom.mjs';

// ---------------------------------------------------------------- hoop paths

/**
 * Round hoop formed from one wire: two parallel legs leave the joint at z0, flare through a neck and
 * close into a circle of centre-line radius R. Returns the open wire path (legs included) and the
 * closed mouth loop (neck + circle; starts at the back-right so the bag seam sits at the joint).
 */
export function roundHoop({ R, legHalf, z0, legIn, neck, phi0 = 0.6, samples }) {
  const zc = z0 + neck + R * Math.cos(phi0);
  const P = (phi) => [R * Math.sin(phi), 0, zc - R * Math.cos(phi)];
  const Tg = (phi) => [Math.cos(phi), 0, Math.sin(phi)];
  const nb = Math.max(6, Math.round(samples * 0.08));
  const right = bezier([legHalf, 0, z0], [legHalf, 0, z0 + neck * 0.55], v3.sub(P(phi0), v3.mul(Tg(phi0), neck * 0.55)), P(phi0), nb);
  const arcN = Math.max(16, Math.round(samples * 0.84));
  const arc = [];
  for (let k = 1; k < arcN; k++) arc.push(P(phi0 + ((TAU - 2 * phi0) * k) / arcN));
  const left = right.map((q) => [-q[0], q[1], q[2]]).reverse();
  const mouth = [...right, ...arc, ...left];
  const legR = [[legHalf, 0, z0 - legIn], [legHalf, 0, z0 - legIn * 0.5]];
  const legL = legR.map((q) => [-q[0], q[1], q[2]]).reverse();
  const wire = [...legR, ...mouth, ...legL];
  return { wire, mouth, center: [0, 0, zc], R };
}

/**
 * D frame: straight bottom edge (far end, +Z) and a half-ellipse arch back to the apex where the
 * stem enters the socket. Corners between edge and arch are filleted.
 */
export function dFrame({ W, D, zApex, fillet, samples }) {
  const a = W / 2, zEdge = zApex + D;
  const pts = [];
  const n = samples;
  // arch: x = a sin(t), z = zEdge - D cos(t)  for t in [-pi/2 .. pi/2] goes left -> apex -> right
  const arch = [];
  for (let k = 0; k <= n; k++) {
    const t = -Math.PI / 2 + (Math.PI * k) / n;
    arch.push([a * Math.sin(t), 0, zEdge - D * Math.cos(t)]);
  }
  // pull the arch ends in for the fillets and add the straight edge (right -> left)
  const fr = fillet;
  const keep = arch.filter((q) => q[2] < zEdge - fr * 0.9);
  // start at the apex so the bag seam sits at the socket
  const apexI = Math.floor(keep.length / 2);
  const rightArch = keep.slice(apexI);
  const leftArch = keep.slice(0, apexI);
  const cornerR = bezier(rightArch[rightArch.length - 1], [a, 0, zEdge - fr * 0.25], [a, 0, zEdge], [a - fr, 0, zEdge], 8);
  const edgeN = Math.max(6, Math.round(n * 0.5));
  const edge = [];
  for (let k = 1; k < edgeN; k++) edge.push([a - fr - ((W - 2 * fr) * k) / edgeN, 0, zEdge]);
  const cornerL = bezier([-a + fr, 0, zEdge], [-a, 0, zEdge], [-a, 0, zEdge - fr * 0.25], leftArch[0], 8);
  pts.push(...rightArch, ...cornerR.slice(1), ...edge, ...cornerL, ...leftArch.slice(1));
  return { mouth: pts, center: [0, 0, zApex + D * 0.55], zEdge };
}

// ---------------------------------------------------------------- hems (profiles in (inward, up))

/** teardrop: rounded over the wire (radius rr), tapering down to a tail `tail` below, thickness th */
export function teardropProfile(rr, tail, th, n = 16) {
  const pts = [];
  const nTop = Math.max(6, Math.round(n * 0.6));
  for (let k = 0; k <= nTop; k++) { const a = (Math.PI * k) / nTop; pts.push([rr * Math.cos(a), rr * Math.sin(a)]); }
  const nSide = Math.max(2, Math.round(n * 0.2));
  for (let k = 1; k <= nSide; k++) { const t = k / nSide; pts.push([-rr + (rr - th) * t * (2 - t), -tail * t]); }
  pts.push([0, -tail - th * 0.6]);
  for (let k = nSide; k >= 1; k--) { const t = k / nSide; pts.push([rr - (rr - th) * t * (2 - t), -tail * t]); }
  return pts;
}

/** offset a mouth loop inward (toward the centre) and up by (inward, up) metres */
export function offsetLoop(loop, center, inward, up) {
  return loop.map((q) => {
    const r = v3.norm([center[0] - q[0], 0, center[2] - q[2]]);
    return [q[0] + r[0] * inward, q[1] + up, q[2] + r[2] * inward];
  });
}

/** lacing loops of twine binding the net's rope edge to the wire */
export function lacing(loop, { every, rw, rr, twine, segs, loopSegs, tilt = 0.35 }) {
  const out = new MeshData();
  const L = loop.length;
  let acc = 0;
  const step = [];
  for (let k = 0; k < L; k++) {
    const a = loop[k], b = loop[(k + 1) % L];
    acc += v3.len(v3.sub(b, a));
    if (acc >= every) { step.push(k); acc = 0; }
  }
  for (const k of step) {
    const p = loop[k];
    const t = v3.norm(v3.sub(loop[(k + 1) % L], loop[(k - 1 + L) % L]));
    const side = v3.norm(v3.cross(t, [0, 1, 0]));
    // the loop rides diagonally around wire (y = 0) and rope (y = -(rw + rr))
    const ex = Math.max(rw, rr) + twine * 1.2, ey = rw + rr + twine;
    const cy = -rr * 0.95;
    const path = [];
    for (let q = 0; q < loopSegs; q++) {
      const a = (q / loopSegs) * TAU;
      const sx = Math.cos(a) * ex, sy = Math.sin(a) * ey + cy;
      const along = Math.sin(a) * ey * tilt;
      path.push(v3.add(p, v3.add(v3.add(v3.mul(side, sx), [0, sy, 0]), v3.mul(t, along))));
    }
    out.append(sweep(path, circleProfile(twine, segs), { closed: true, upFn: () => t, tile: [twine * TAU, 0.012] }));
  }
  return out;
}

// ---------------------------------------------------------------- lathe profiles

/** tube end with a small chamfer: returns [[z, r], ...] for a straight pipe from z0 to z1 */
export function pipeProfile(z0, z1, r, chamfer = 0.0006, closed = true) {
  const p = [];
  if (closed) p.push([z0, 0], [z0, r - chamfer * 1.5], [z0, r - chamfer * 1.5]);
  p.push([z0 + chamfer * 0.3, r - chamfer * 0.4], [z0 + chamfer, r], [z0 + chamfer, r]);
  p.push([z1 - chamfer, r], [z1 - chamfer, r], [z1 - chamfer * 0.3, r - chamfer * 0.4]);
  if (closed) p.push([z1, r - chamfer * 1.5], [z1, r - chamfer * 1.5], [z1, 0]);
  return p;
}

/** sample f(z) -> r into a profile with n steps between z0 and z1 */
export function sampled(z0, z1, n, f) {
  const p = [];
  for (let k = 0; k <= n; k++) { const z = z0 + ((z1 - z0) * k) / n; p.push([z, f(z, k / n)]); }
  return p;
}

/** EVA / foam sleeve with soft rounded shoulders and a faint barrel */
export function foamGrip(z0, z1, rCore, rMax, n) {
  const L = z1 - z0, sh = Math.min(0.012, L * 0.12);
  return [
    [z0, rCore], [z0, rCore],
    ...sampled(z0, z1, n, (z) => {
      const a = clamp((z - z0) / sh), b = clamp((z1 - z) / sh);
      const shoulder = Math.sqrt(a * (2 - a)) * Math.sqrt(b * (2 - b));
      const barrel = 1 - 0.035 * ((2 * (z - z0)) / L - 1) ** 2;
      return rCore + (rMax * barrel - rCore) * shoulder;
    }),
    [z1, rCore], [z1, rCore],
  ];
}

/** ribbed twist-lock collar or knurled ring: rMod adding axial ribs */
export const ribs = (count, depth, z0, z1) => (a, z, r) => (z > z0 && z < z1 ? r - depth * (0.5 - 0.5 * Math.cos(a * count)) ** 2 : r);
/** hexagon across-flats rMod between z0 and z1 */
export const hexFlats = (across, z0, z1) => (a, z, r) => {
  if (z < z0 || z > z1) return r;
  const seg = Math.PI / 3;
  const local = ((a % seg) + seg) % seg - seg / 2;
  return Math.min(r, (across / 2) / Math.cos(local));
};
/** fine straight knurl ring */
export const knurl = (count, depth, z0, z1) => (a, z, r) => (z > z0 && z < z1 ? r - depth * Math.abs(Math.sin(a * count / 2)) : r);

// ---------------------------------------------------------------- misc solids

/** a cylinder along an arbitrary axis (for bolts, pins and knobs) built from a lathe profile */
export function latheAlong(profile, segs, from, axis, opts = {}) {
  const m = lathe(profile, segs, opts);
  const z = v3.norm(axis);
  const x = v3.norm(Math.abs(z[1]) < 0.9 ? v3.cross([0, 1, 0], z) : v3.cross([1, 0, 0], z));
  const y = v3.cross(z, x);
  return m.transform([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, from[0], from[1], from[2], 1]);
}

/** a rounded box (superellipse prism along Z) from z0 to z1 with half sizes (hx, hy) */
export function roundedBlock(z0, z1, hx, hy, segs, rnd = 4, bevel = 0.0012, taper = null) {
  const prof = [[z0, 0], [z0, 0.7], [z0, 0.7], [z0 + bevel * 0.3, 0.92], [z0 + bevel, 1], [z0 + bevel, 1], [z1 - bevel, 1], [z1 - bevel, 1], [z1 - bevel * 0.3, 0.92], [z1, 0.7], [z1, 0.7], [z1, 0]];
  return lathe(prof, segs, {
    rMod: (a, z, r) => {
      const c = Math.cos(a), s = Math.sin(a);
      const k = taper ? taper(z) : 1;
      const se = Math.pow(Math.pow(Math.abs(c) / hx, rnd) + Math.pow(Math.abs(s) / hy, rnd), -1 / rnd);
      return se * r * k;
    },
    tile: [0.03, 0.03], rRef: Math.max(hx, hy),
  });
}

export { lathe, sweep, resample, circleProfile, m4, v3, MeshData, smooth };
