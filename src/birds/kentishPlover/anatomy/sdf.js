// Signed-distance sculpting of the feathered body outline + Surface Nets polygonisation.
// Working unit inside this file: millimetres (converted to metres by the caller).

function sdEllipsoid(px, py, pz, c, r) {
  // Inigo Quilez' bound-corrected ellipsoid distance
  const x = (px - c[0]) / r[0];
  const y = (py - c[1]) / r[1];
  const z = (pz - c[2]) / r[2];
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

function primDist(p, x, y, z) {
  return p.type === 'capsule' ? sdCapsule(x, y, z, p.a, p.b, p.r) : sdEllipsoid(x, y, z, p.c, p.r);
}

/** Build the SDF function (mm → mm) from the sculpt description. */
export function makeBodySDF(sculpt) {
  const prims = sculpt.prims;
  const cuts = sculpt.cuts || [];
  const k = sculpt.smooth;
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
    return d;
  };
}

/**
 * Surface Nets (naive dual contouring). Produces an indexed quad mesh (as triangles) with one vertex
 * per surface cell, then relaxes vertices back onto the isosurface along the SDF gradient.
 * Returns { positions: Float32Array (mm), normals, indices }.
 */
export function surfaceNets(sdf, bounds, res) {
  const [x0, y0, z0] = bounds.min;
  const nx = Math.ceil((bounds.max[0] - x0) / res) + 1;
  const ny = Math.ceil((bounds.max[1] - y0) / res) + 1;
  const nz = Math.ceil((bounds.max[2] - z0) / res) + 1;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * res;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * res;
      for (let i = 0; i < nx; i++) field[idx(i, j, k)] = sdf(x0 + i * res, y, z);
    }
  }

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
        if (mask === 0 || mask === 255) continue;
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
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
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
