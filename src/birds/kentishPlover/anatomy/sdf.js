// Signed-distance sculpting of the feathered body outline + Surface Nets polygonisation.
// Working unit inside this file: millimetres (converted to metres by the caller).

function sdEllipsoid(px, py, pz, c, r, rx = 0) {
  // Inigo Quilez' bound-corrected ellipsoid distance. rx (degrees): pitch of the ellipsoid about X, + = front
  // up / rear down (the relaxed body tilt is sculpted into the bind pose, body_shape_spec.md §16)
  let dy = py - c[1];
  let dz = pz - c[2];
  if (rx) {
    const a = (rx * Math.PI) / 180;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    [dy, dz] = [cs * dy - sn * dz, sn * dy + cs * dz];
  }
  const x = (px - c[0]) / r[0];
  const y = dy / r[1];
  const z = dz / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x2 = x / r[0];
  const y2 = y / r[1];
  const z2 = z / r[2];
  const k1 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}

function sdCapsule(px, py, pz, a, b, r) {
  const pax = px - a[0];
  const pay = py - a[1];
  const paz = pz - a[2];
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
  h = Math.max(0, Math.min(1, h));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

// vesica: the intersection of two capsules a–b of radius r shifted by ±off — a tube with an almond section
// (eye openings: corners where the two lid arcs meet)
function sdVesica(x, y, z, p) {
  const o = p.off;
  const a1 = [p.a[0] + o[0], p.a[1] + o[1], p.a[2] + o[2]];
  const b1 = [p.b[0] + o[0], p.b[1] + o[1], p.b[2] + o[2]];
  const a2 = [p.a[0] - o[0], p.a[1] - o[1], p.a[2] - o[2]];
  const b2 = [p.b[0] - o[0], p.b[1] - o[1], p.b[2] - o[2]];
  return Math.max(sdCapsule(x, y, z, a1, b1, p.r), sdCapsule(x, y, z, a2, b2, p.r));
}

function primDist(p, x, y, z) {
  if (p.type === 'vesica') return sdVesica(x, y, z, p);
  return p.type === 'capsule' ? sdCapsule(x, y, z, p.a, p.b, p.r) : sdEllipsoid(x, y, z, p.c, p.r, p.rx);
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Bed of the folded wing and the scapulars (sculpt.bed): the outline sunk by `depth` mm where they lie on it — away
 * from the dorsal midline (|x| from x[0] to x[1]), above the wing's lower edge (the polyline `edge` of (z, y), from
 * y[0] to y[1] over it) and between the rump and the shoulders (z ramps z[0]→z[1] in, z[2]→z[3] out). The feathers lie
 * 1–2 mm deep on it, the mantle between the scapulars does not: without the bed the plumage over the back was a
 * flat-topped plateau, flatter than the belly in cross-section (validation §Y). ≤ depth / ramp per mm of slope, so
 * the field stays nearly a distance.
 */
function bedDepth(b, x, y, z) {
  const mx = smoothstep(b.x[0], b.x[1], Math.abs(x));
  if (mx <= 0) return 0;
  const mz = smoothstep(b.z[0], b.z[1], z) * (1 - smoothstep(b.z[2], b.z[3], z));
  if (mz <= 0) return 0;
  const e = b.edge;
  let ye = e[0][1];
  if (z <= e[e.length - 1][0]) ye = e[e.length - 1][1];
  else
    for (let i = 0; i < e.length - 1; i++)
      if (z <= e[i][0] && z >= e[i + 1][0]) {
        ye = e[i][1] + ((e[i + 1][1] - e[i][1]) * (z - e[i][0])) / (e[i + 1][0] - e[i][0]);
        break;
      }
  return b.depth * mx * mz * smoothstep(ye + b.y[0], ye + b.y[1], y);
}

/**
 * Plan-view (top) widening of the sculpt (sculpt.plan): the outline is stretched across (x) by a factor s(z) — a
 * Catmull-Rom curve through the knots [[z, s], …] (front to rear), 1 in front of the first and held at the last
 * behind it. Every cross-section keeps its shape (scaled in width), so the side silhouette (the y–z projection) is
 * exactly the same, and a factor of 1 in front of the trunk leaves the shoulders and the neck base — the neck
 * sleeve's field (bodyMesh.sleeveAt) — untouched. Returns s(z) and ds/dz.
 */
export function planScale(plan, z) {
  const K = plan.knots;
  if (z >= K[0][0]) return [K[0][1], 0];
  if (z <= K[K.length - 1][0]) return [K[K.length - 1][1], 0];
  let i = 0;
  while (z < K[i + 1][0]) i++;
  const P = (j) => K[Math.max(0, Math.min(K.length - 1, j))];
  const [z0, s0] = P(i - 1);
  const [z1, s1] = P(i);
  const [z2, s2] = P(i + 1);
  const [z3, s3] = P(i + 2);
  const h = z2 - z1;
  // tangents (per unit of z) from the neighbouring knots; flat at the ends
  const m1 = i === 0 ? 0 : (s2 - s0) / (z2 - z0);
  const m2 = i + 1 === K.length - 1 ? 0 : (s3 - s1) / (z3 - z1);
  const t = (z - z1) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const s = (2 * t3 - 3 * t2 + 1) * s1 + (t3 - 2 * t2 + t) * h * m1 + (-2 * t3 + 3 * t2) * s2 + (t3 - t2) * h * m2;
  const ds = ((6 * t2 - 6 * t) * s1 + (3 * t2 - 4 * t + 1) * h * m1 + (-6 * t2 + 6 * t) * s2 + (3 * t2 - 2 * t) * h * m2) / h;
  return [s, ds];
}

/** Height weight of the plan widening (sculpt.plan.y = [y0, y1, y2, y3], base) and its derivative. */
function planBand(plan, y) {
  const [y0, y1, y2, y3] = plan.y;
  const b = plan.base;
  const a = smoothstep(y0, y1, y);
  const e = 1 - smoothstep(y2, y3, y);
  const da = y > y0 && y < y1 ? (6 * (y - y0) * (y1 - y)) / (y1 - y0) ** 3 : 0;
  const de = y > y2 && y < y3 ? (-6 * (y - y2) * (y3 - y)) / (y3 - y2) ** 3 : 0;
  return [b + (1 - b) * a * e, (1 - b) * (da * e + a * de)];
}

/** Build the SDF function (mm → mm) from the sculpt description. */
export function makeBodySDF(sculpt) {
  const prims = sculpt.prims;
  const cuts = sculpt.cuts || [];
  const adds = sculpt.adds || []; // smooth-unioned after the cuts (eyelid folds over the eye openings)
  const bed = sculpt.bed;
  const plan = sculpt.plan;
  const k = sculpt.smooth;
  const field = makeField(prims, cuts, adds, k);
  return (x, y, z) => {
    let d;
    if (plan) {
      const [c, dc] = planScale(plan, z);
      if (c !== 1) {
        // across-scale s(y, z) = 1 + (c(z) − 1)·w(y): full in the band of the folded wing, `base` of it under the belly
        const [w, dw] = planBand(plan, y);
        const s = 1 + (c - 1) * w;
        const u = x / s;
        // (the stretched field, divided by its gradient's growth along y and z so it stays ≈ a distance; across it
        // is s times flatter, which only errs toward the outline)
        d = field(u, y, z) / Math.hypot(1, (u * dc * w) / s, (u * (c - 1) * dw) / s);
      } else d = field(x, y, z);
    } else d = field(x, y, z);
    return bed ? d + bedDepth(bed, x, y, z) : d;
  };
}

function makeField(prims, cuts, adds, k) {
  return (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      d = smin(d, primDist(p, x, y, z), p.k ?? k);
    }
    for (let i = 0; i < cuts.length; i++) {
      const c = cuts[i];
      d = smax(d, -primDist(c, x, y, z), c.k ?? 1.5);
    }
    for (let i = 0; i < adds.length; i++) d = smin(d, primDist(adds[i], x, y, z), adds[i].k ?? 1);
    return d;
  };
}

/**
 * Surface Nets (naive dual contouring). Produces an indexed quad mesh (as triangles) with one vertex
 * per surface cell, then relaxes vertices back onto the isosurface along the SDF gradient.
 * Returns { positions: Float32Array (mm), normals, indices }.
 */
export function surfaceNets(sdf, bounds, res, region = null) {
  // region {c, r}: polygonise only the part of the surface inside that sphere (a finer patch laid over a coarser
  // mesh): the grid spans the sphere, points beyond r + 2·res are not evaluated, and only quads whose four cells
  // lie inside r are emitted
  if (region) bounds = { min: region.c.map((v) => v - region.r - res), max: region.c.map((v) => v + region.r + res) };
  // one extra cell layer around the bounds (same grid alignment): the quad pass skips the outermost grid
  // edges, so a surface crossing the first cell layer (the flank at a coarse resolution) was left open
  const [x0, y0, z0] = bounds.min.map((v) => v - res);
  const nx = Math.ceil((bounds.max[0] - bounds.min[0]) / res) + 3;
  const ny = Math.ceil((bounds.max[1] - bounds.min[1]) / res) + 3;
  const nz = Math.ceil((bounds.max[2] - bounds.min[2]) / res) + 3;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const rEval = region ? (region.r + 2 * res) ** 2 : Infinity;
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * res;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * res;
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * res;
        field[idx(i, j, k)] = region && (x - region.c[0]) ** 2 + (y - region.c[1]) ** 2 + (z - region.c[2]) ** 2 > rEval ? 1 : sdf(x, y, z);
      }
    }
  }
  const rCell = region ? region.r ** 2 : Infinity;
  const cellIn = (i, j, k) => !region || (x0 + (i + 0.5) * res - region.c[0]) ** 2 + (y0 + (j + 0.5) * res - region.c[1]) ** 2 + (z0 + (k + 0.5) * res - region.c[2]) ** 2 <= rCell;

  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const cc = corners[c];
          v[c] = field[idx(i + cc[0], j + cc[1], k + cc[2])];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255 || !cellIn(i, j, k)) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of edges) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          const ca = corners[a];
          const cb = corners[b];
          sx += ca[0] + (cb[0] - ca[0]) * t;
          sy += ca[1] + (cb[1] - ca[1]) * t;
          sz += ca[2] + (cb[2] - ca[2]) * t;
          n++;
        }
        cellVert[cidx(i, j, k)] = pos.length / 3;
        pos.push(x0 + (i + sx / n) * res, y0 + (j + sy / n) * res, z0 + (k + sz / n) * res);
      }
    }
  }

  const indices = [];
  // For each grid edge crossing the surface, emit the quad of the 4 cells sharing that edge.
  // Quads are listed in the cyclic (y→z, z→x, x→y) order, i.e. counter-clockwise around the +axis.
  // When the lower corner is inside (s0), the outward normal points along +axis → keep that order.
  const quad = (a, b, c, d, insideLow) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (insideLow) indices.push(a, b, c, a, c, d);
    else indices.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const s0 = field[idx(i, j, k)] < 0;
        // x-edge
        if (i < nx - 1 && s0 !== field[idx(i + 1, j, k)] < 0) {
          quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], s0);
        }
        if (j < ny - 1 && s0 !== field[idx(i, j + 1, k)] < 0) {
          quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], s0);
        }
        if (k < nz - 1 && s0 !== field[idx(i, j, k + 1)] < 0) {
          quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], s0);
        }
      }
    }
  }

  const positions = new Float32Array(pos);
  const normals = new Float32Array(pos.length);
  const e = res * 0.25;
  for (let p = 0; p < positions.length; p += 3) {
    let x = positions[p];
    let y = positions[p + 1];
    let z = positions[p + 2];
    // Two Newton steps onto the isosurface.
    for (let it = 0; it < 2; it++) {
      const d = sdf(x, y, z);
      let gx = sdf(x + e, y, z) - sdf(x - e, y, z);
      let gy = sdf(x, y + e, z) - sdf(x, y - e, z);
      let gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl;
      gy /= gl;
      gz /= gl;
      x -= gx * d;
      y -= gy * d;
      z -= gz * d;
      if (it === 1) {
        normals[p] = gx;
        normals[p + 1] = gy;
        normals[p + 2] = gz;
      }
    }
    positions[p] = x;
    positions[p + 1] = y;
    positions[p + 2] = z;
  }
  return { positions, normals, indices: new Uint32Array(indices) };
}

/** Closest-point projection onto the SDF surface (mm), returns [pos, normal]. */
export function projectToSurface(sdf, x, y, z, e = 0.2) {
  for (let it = 0; it < 4; it++) {
    const d = sdf(x, y, z);
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z);
    let gy = sdf(x, y + e, z) - sdf(x, y - e, z);
    let gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl;
    gy /= gl;
    gz /= gl;
    x -= gx * d;
    y -= gy * d;
    z -= gz * d;
    if (it === 3) return [[x, y, z], [gx, gy, gz]];
  }
  return [[x, y, z], [0, 1, 0]];
}

/**
 * The same SDF sampled on a lazily filled grid (trilinear; each grid corner is evaluated once, when a query
 * first needs it). For the animator's per-frame contact tests (hundreds of head / neck samples, several
 * passes): an exact evaluation runs through every sculpt primitive. On a 1.5 mm grid the interpolation error
 * of the smooth outline is ≈0.02 mm. Points outside `bounds` are evaluated exactly.
 */
export function gridCachedSDF(sdf, bounds, res = 1.5) {
  const [x0, y0, z0] = bounds.min;
  const nx = Math.ceil((bounds.max[0] - x0) / res) + 1;
  const ny = Math.ceil((bounds.max[1] - y0) / res) + 1;
  const nz = Math.ceil((bounds.max[2] - z0) / res) + 1;
  const vals = new Float32Array(nx * ny * nz).fill(NaN);
  const at = (i, j, k) => {
    const idx = i + nx * (j + ny * k);
    let v = vals[idx];
    if (v !== v) v = vals[idx] = sdf(x0 + i * res, y0 + j * res, z0 + k * res);
    return v;
  };
  return (x, y, z) => {
    const fx = (x - x0) / res;
    const fy = (y - y0) / res;
    const fz = (z - z0) / res;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const k = Math.floor(fz);
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return sdf(x, y, z);
    const u = fx - i;
    const v = fy - j;
    const w = fz - k;
    const c00 = at(i, j, k) * (1 - u) + at(i + 1, j, k) * u;
    const c10 = at(i, j + 1, k) * (1 - u) + at(i + 1, j + 1, k) * u;
    const c01 = at(i, j, k + 1) * (1 - u) + at(i + 1, j, k + 1) * u;
    const c11 = at(i, j + 1, k + 1) * (1 - u) + at(i + 1, j + 1, k + 1) * u;
    return (c00 * (1 - v) + c10 * v) * (1 - w) + (c01 * (1 - v) + c11 * v) * w;
  };
}
