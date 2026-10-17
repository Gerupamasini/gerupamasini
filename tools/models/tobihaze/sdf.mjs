// Signed-distance building blocks for the トビハゼ sculpt (tools/models/tobihaze). Every shape is a function
// (x, y, z) → distance, negative inside; the head and body are blends of these (head.mjs, body.mjs), meshed by
// mesher.mjs. Coordinates are the fish frame of anatomy.mjs (s back from the snout tip, y up, z to the fish's left).
// The distances are bounds rather than exact for the ellipsoids and the blends, which is all the mesher needs: the zero
// crossing exact, the gradient smooth.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Polynomial smooth minimum (union) with blend radius k. */
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}
/** Smooth maximum (intersection) with blend radius k. */
export function smax(a, b, k) {
  return -smin(-a, -b, k);
}
/** Smooth subtraction: a minus b. */
export function ssub(a, b, k) {
  return smax(a, -b, k);
}

/** Ellipsoid at centre c with semi-axes r (Inigo Quilez's bound). */
export function ellipsoid(c, r) {
  const [cx, cy, cz] = c, [rx, ry, rz] = r;
  const ix = 1 / rx, iy = 1 / ry, iz = 1 / rz;
  return (x, y, z) => {
    const px = x - cx, py = y - cy, pz = z - cz;
    const k0 = Math.hypot(px * ix, py * iy, pz * iz);
    const k1 = Math.hypot(px * ix * ix, py * iy * iy, pz * iz * iz);
    return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
  };
}

/** Sphere. */
export function sphere(c, r) {
  const [cx, cy, cz] = c;
  return (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r;
}

/** Capsule between a and b with radius r (or radii ra → rb, a cone with round ends). */
export function capsule(a, b, ra, rb = ra) {
  const [ax, ay, az] = a;
  const bx = b[0] - ax, by = b[1] - ay, bz = b[2] - az;
  const bb = bx * bx + by * by + bz * bz;
  return (x, y, z) => {
    const px = x - ax, py = y - ay, pz = z - az;
    const t = clamp((px * bx + py * by + pz * bz) / bb, 0, 1);
    return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - mix(ra, rb, t);
  };
}

/**
 * A tube along a polyline of points [s, y, z] with radius per point (smoothly varying), the union of its capsules.
 * Far from the tube (beyond `far`) it returns the distance to its bounding box instead: a lower bound, exact enough
 * wherever the blends (radius < far) can reach the surface, and much cheaper.
 */
export function tube(points, radii, far = 0.15) {
  const caps = [];
  for (let i = 0; i + 1 < points.length; i++) caps.push(capsule(points[i], points[i + 1], radii[i], radii[i + 1]));
  const rMax = Math.max(...radii);
  const lo = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])) - rMax);
  const hi = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])) + rMax);
  return (x, y, z) => {
    const bx = Math.max(lo[0] - x, 0, x - hi[0]), by = Math.max(lo[1] - y, 0, y - hi[1]), bz = Math.max(lo[2] - z, 0, z - hi[2]);
    const box = Math.hypot(bx, by, bz);
    if (box > far) return box;
    let d = Infinity;
    for (const c of caps) { const v = c(x, y, z); if (v < d) d = v; }
    return d;
  };
}

/** Catmull-Rom resampling of a polyline (points and radii) into n segments, for smooth tubes. */
export function smoothPath(points, radii, n) {
  const P = [], R = [];
  const m = points.length;
  const at = (i) => points[clamp(i, 0, m - 1)], ar = (i) => radii[clamp(i, 0, m - 1)];
  for (let k = 0; k <= n; k++) {
    const u = (k / n) * (m - 1);
    const i = Math.min(m - 2, Math.floor(u)), t = u - i;
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    P.push([0, 1, 2].map((j) => cr(p0[j], p1[j], p2[j], p3[j])));
    R.push(cr(ar(i - 1), ar(i), ar(i + 1), ar(i + 2)));
  }
  return { points: P, radii: R };
}

/** Half-space below the plane through point o with unit normal n (distance > 0 on the normal's side). */
export function plane(o, n) {
  const l = Math.hypot(n[0], n[1], n[2]);
  const nx = n[0] / l, ny = n[1] / l, nz = n[2] / l;
  return (x, y, z) => (x - o[0]) * nx + (y - o[1]) * ny + (z - o[2]) * nz;
}

/** Mirror a shape defined for z ≥ 0 onto both sides (|z|). */
export function mirrorZ(f) {
  return (x, y, z) => f(x, y, Math.abs(z));
}

/** Smooth union of many shapes with one blend radius. */
export function unionAll(fs, k) {
  return (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k);
    return d;
  };
}

/** Numerical gradient (central differences). */
export function gradient(f, x, y, z, e) {
  const gx = f(x + e, y, z) - f(x - e, y, z);
  const gy = f(x, y + e, z) - f(x, y - e, z);
  const gz = f(x, y, z + e) - f(x, y, z - e);
  return [gx / (2 * e), gy / (2 * e), gz / (2 * e)];
}
