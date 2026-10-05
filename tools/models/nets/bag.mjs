// The net bag: a parametric surface hung from the mouth loop, with morph targets for how a real bag
// behaves in water and air. Built in frame-local space (mouth in the y = 0 plane, opening facing +Y,
// handle toward -Z).
//
// Morph targets (order is fixed and recorded in mesh.extras.targetNames):
//   Stream  - bag pulled taut along -Y (net moving toward its opening: lifting, pushing a D-net forward)
//   Invert  - bag blown back up through the hoop (+Y) (net plunged downward, mouth first)
//   Trail   - bag swept back toward the handle (-Z) (net swung forward through the water)
//   Wet     - waterlogged: narrower, clinging, deeper creases (just lifted out)
import { perlin3 } from '../../lib/noise.mjs';
import { grid, MeshData, v3, clamp, smooth, TAU } from './geom.mjs';

export const BAG_TARGETS = ['Stream', 'Invert', 'Trail', 'Wet'];

/**
 * @param {object} o
 *   mouth: closed loop of [x, y, z] (frame local), first point at the back (the bag seam goes there)
 *   depth: bag depth below the mouth (m); p: profile exponent (2 = round bowl, >2 boxier)
 *   taper: narrowing of the bag's middle (0..0.4); flatBottom: 0..1 (D-net bags sit flat)
 *   folds: radial fold amplitude as a fraction of the local radius; seed
 *   nu, nv: resolution
 */
export function buildBag(o) {
  const { mouth, depth, p = 2.2, taper = 0.15, folds = 0.06, seed = 1, nu, nv, flatBottom = 0 } = o;
  // resample the mouth evenly by arc length
  const M = resampleLoop(mouth, nu);
  const C = M.reduce((a, q) => v3.add(a, q), [0, 0, 0]).map((c) => c / nu);
  const Rmean = M.reduce((a, q) => a + Math.hypot(q[0] - C[0], q[2] - C[2]), 0) / nu;

  // one fold field shared by the shapes so the targets read as the same cloth moving
  const fold = (u, v, freq, s) => {
    const a = u * TAU;
    return perlin3(Math.cos(a) * freq, Math.sin(a) * freq, v * freq * 0.9, seed + s);
  };

  const drift = (v) => {
    const k = v * v * Rmean;
    return [perlin3(0.3, v * 1.3, 5.5, seed + 70) * 0.18 * k, 0, perlin3(4.1, v * 1.3, 0.7, seed + 71) * 0.18 * k];
  };
  const profile = (v, pp) => {
    const t = v * Math.PI / 2;
    const c = Math.cos(t), s = Math.sin(t);
    let w = Math.pow(c, 2 / pp) * (1 - taper * s * s);
    let h = Math.pow(s, 2 / pp);
    if (flatBottom > 0) {
      // keep the walls wide until late and drop the floor flat
      w = Math.pow(c, (2 / pp) * (1 - 0.6 * flatBottom)) * (1 - taper * s * s);
      h = Math.min(1, h * (1 + 0.15 * flatBottom));
    }
    return { w, h };
  };

  const shapes = {
    rest(i, j) {
      const u = i / nu, v = j / nv;
      const { w, h } = profile(v, p);
      const m = M[i % nu];
      const r = v3.sub(m, C);
      const radial = v3.norm([r[0], 0, r[2]]);
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.08)), 0.8) * smooth(0, 0.12, v);
      const f = fold(u, v, 2.6, 0) * 0.55 + fold(u, v, 6.5, 11) * 0.3 + fold(u, v * 0.4, 11, 17) * 0.15;
      const amp = folds * Rmean * env * 1.35;
      let P = v3.add(C, v3.mul(r, w));
      P = v3.add(P, [0, -depth * h, 0]);
      P = v3.add(P, v3.mul(radial, amp * f));
      P[1] += amp * 0.35 * fold(u, v, 4.1, 23);
      // the lower bag never hangs dead centre: a slow lateral drift and a slack belly
      return v3.add(P, drift(v));
    },
    Stream(i, j) {
      const u = i / nu, v = j / nv;
      const t = v * Math.PI / 2;
      const w = Math.pow(Math.cos(t), 0.85) * (1 - 0.3 * v);
      const h = 1.16 * (0.8 * v + 0.2 * Math.sin(t));
      const m = M[i % nu];
      const r = v3.sub(m, C);
      const radial = v3.norm([r[0], 0, r[2]]);
      const env = Math.sin(Math.PI * Math.min(1, v * 1.05)) * smooth(0, 0.1, v);
      // taut cloth: long longitudinal creases instead of soft folds
      const f = fold(u, v * 0.25, 6.0, 31) * 0.8 + fold(u, v, 3.2, 0) * 0.2;
      let P = v3.add(C, v3.mul(r, w));
      P = v3.add(P, [0, -depth * h, 0]);
      return v3.add(P, v3.mul(radial, folds * 0.55 * Rmean * env * f));
    },
    Invert(i, j) {
      const u = i / nu, v = j / nv;
      const { w, h } = profile(v, p * 0.9);
      const m = M[i % nu];
      const r = v3.sub(m, C);
      const radial = v3.norm([r[0], 0, r[2]]);
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.08)), 0.8) * smooth(0, 0.12, v);
      const f = fold(u, v, 3.2, 0) * 0.6 + fold(u, v, 5.3, 41) * 0.4;
      // the bag billows up through the hoop, a little narrower and shorter than at rest
      let P = v3.add(C, v3.mul(r, w * 0.93));
      P = v3.add(P, [0, depth * 0.78 * h - depth * 0.04 * Math.sin(Math.PI * v), 0]);
      return v3.add(P, v3.mul(radial, folds * 1.25 * Rmean * env * f));
    },
    Trail(i, j) {
      const u = i / nu, v = j / nv;
      const base = shapes.rest(i, j);
      // rotate the hanging bag about X (through the mouth centre) toward -Z, more toward the bottom
      const th = 1.2 * Math.pow(v, 1.15);
      const d = v3.sub(base, C);
      // rotate only the hanging offset, keep the mouth ring where it is
      const hang = [0, d[1], 0];
      const ring = [d[0], 0, d[2]];
      const hy = hang[1] * Math.cos(th), hz = hang[1] * Math.sin(th);
      const squeeze = 1 - 0.18 * v;
      let P = v3.add(C, [ring[0] * squeeze, hy * 1.06, ring[2] * squeeze + hz * 1.06]);
      P[1] += fold(u, v, 5.0, 51) * folds * Rmean * 0.5 * Math.sin(Math.PI * v);
      return P;
    },
    Wet(i, j) {
      const u = i / nu, v = j / nv;
      const { w, h } = profile(v, p * 0.85);
      const m = M[i % nu];
      const r = v3.sub(m, C);
      const radial = v3.norm([r[0], 0, r[2]]);
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.04)), 0.7) * smooth(0, 0.1, v);
      const f = fold(u, v, 3.2, 0) * 0.45 + fold(u, v * 0.5, 9.0, 61) * 0.55;
      const narrow = 1 - 0.2 * smooth(0.02, 0.5, v);
      let P = v3.add(C, v3.mul(r, w * narrow));
      P = v3.add(P, [0, -depth * 1.07 * h, 0]);
      return v3.add(P, v3.mul(radial, folds * 1.7 * Rmean * env * f));
    },
  };

  const make = (fn) => grid({ nu, nv, closedU: true, posFn: fn, uvFn: 'arc', tile: [1, 1], uOffset: 0.5, flip: false });
  const rest = make(shapes.rest);
  const targets = BAG_TARGETS.map((name) => {
    const g = make(shapes[name]);
    const dpos = new Float32Array(rest.pos.length), dnrm = new Float32Array(rest.pos.length);
    for (let k = 0; k < rest.pos.length; k++) { dpos[k] = g.pos[k] - rest.pos[k]; dnrm[k] = g.nrm[k] - rest.nrm[k]; }
    return { name, dpos, dnrm };
  });
  // dirt collects toward the bottom; the inside of a deep bag is darker
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = j * (nu + 1) + i, v = j / nv;
    rest.dirt[k] = 0.15 + 0.85 * smooth(0.25, 1, v);
    rest.ao[k] = 1 - 0.28 * Math.pow(v, 1.4);
  }
  const bottomIndex = nv * (nu + 1);
  const bottom = rest.pos.slice(bottomIndex * 3, bottomIndex * 3 + 3);
  return { rest, targets, center: C, Rmean, bottom, bottomDelta: targets.map((t) => Array.from(t.dpos.slice(bottomIndex * 3, bottomIndex * 3 + 3))), nu, nv };
}

/** take rows j0..j1 (inclusive) of a bag grid as a separate primitive (e.g. a canvas skirt) */
export function subRows(bag, j0, j1) {
  const W = bag.nu + 1;
  const m = new MeshData();
  const R = bag.rest;
  const pick = (arr, k, n) => arr.slice(k * n, k * n + n);
  for (let j = j0; j <= j1; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    m.pos.push(...pick(R.pos, k, 3)); m.nrm.push(...pick(R.nrm, k, 3)); m.uv.push(...pick(R.uv, k, 2)); m.dirt.push(R.dirt[k]); m.ao.push(R.ao[k]);
  }
  for (let j = 0; j < j1 - j0; j++) for (let i = 0; i < bag.nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    m.idx.push(a, b, c, b, d, c);
  }
  const targets = bag.targets.map((t) => ({
    name: t.name,
    dpos: Float32Array.from({ length: (j1 - j0 + 1) * W * 3 }, (_, q) => t.dpos[j0 * W * 3 + q]),
    dnrm: Float32Array.from({ length: (j1 - j0 + 1) * W * 3 }, (_, q) => t.dnrm[j0 * W * 3 + q]),
  }));
  return { mesh: m, targets };
}

function resampleLoop(pts, n) {
  const P = [...pts, pts[0]];
  const s = [0];
  for (let k = 1; k < P.length; k++) s.push(s[k - 1] + v3.len(v3.sub(P[k], P[k - 1])));
  const L = s[s.length - 1];
  const out = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * L;
    while (seg < s.length - 2 && s[seg + 1] < t) seg++;
    out.push(v3.lerp(P[seg], P[seg + 1], clamp((t - s[seg]) / Math.max(1e-12, s[seg + 1] - s[seg]))));
  }
  return out;
}
