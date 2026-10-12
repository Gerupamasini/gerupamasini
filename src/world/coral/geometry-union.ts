import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from 'three';

export interface CoralGrowthAxis {
  points: Vector3[];
  radius: number;
  terminal: boolean;
  broken: boolean;
}
interface Segment {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  ra: number;
  rb: number;
  t0: number;
  t1: number;
}
interface AxisField {
  segments: Segment[];
  min: Vector3;
  max: Vector3;
  end: Vector3;
  tangent: Vector3;
  radius: number;
  terminal: boolean;
  broken: boolean;
}
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
// The same Freudenthal face diagonals in every adjacent cube guarantee a conforming, closed mesh.
const TETS = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
];

// Match the tetrahedral lattice's edges so a narrow diagonal opening remains an opening.
const NEIGHBORS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
  [1, 1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, -1],
  [1, 1, 1],
  [-1, -1, -1],
];

/** One indexed living surface per colony. Called once per cached growth variant/LOD, never per frame. */
export function unifiedCoralGeometry(axes: CoralGrowthAxis[], lod: 0 | 1, name: string): BufferGeometry {
  const started = performance.now(),
    cell = lod === 0 ? 0.007 : 0.018,
    blend = 0.0065,
    band = 0.035,
    maxVertices = lod === 0 ? 300_000 : 75_000;
  const lower = new Vector3(Infinity, Infinity, Infinity),
    upper = new Vector3(-Infinity, -Infinity, -Infinity);
  const fields: AxisField[] = axes.map((axis) => {
    const curve = new CatmullRomCurve3(axis.points),
      steps = Math.max(3, Math.ceil(curve.getLength() / 0.018)),
      points = curve.getPoints(steps),
      segments: Segment[] = [],
      min = new Vector3(Infinity, Infinity, Infinity),
      max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < steps; i++) {
      const a = points[i],
        b = points[i + 1],
        t0 = i / steps,
        t1 = (i + 1) / steps,
        ra = axis.radius * (1 - 0.28 * t0),
        rb = axis.radius * (1 - 0.28 * t1);
      segments.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, ra, rb, t0, t1 });
      min.min(a).min(b);
      max.max(a).max(b);
    }
    min.addScalar(-axis.radius - band - blend);
    max.addScalar(axis.radius + band + blend);
    lower.min(min);
    upper.max(max);
    return {
      segments,
      min,
      max,
      end: points[steps],
      tangent: curve.getTangent(1).normalize(),
      radius: axis.radius * 0.72,
      terminal: axis.terminal,
      broken: axis.broken,
    };
  });
  lower.addScalar(-cell * 2);
  upper.addScalar(cell * 2);
  const nx = Math.ceil((upper.x - lower.x) / cell) + 1,
    ny = Math.ceil((upper.y - lower.y) / cell) + 1,
    nz = Math.ceil((upper.z - lower.z) / cell) + 1,
    plane = nx * ny,
    total = plane * nz;
  if (total > 4_000_000) throw new Error('Coral union grid exceeds its bounded scratch budget');
  const field = new Float32Array(total).fill(band),
    growth = new Uint8Array(total);
  let local = new Float32Array(0),
    localGrowth = new Uint8Array(0);
  for (const axis of fields) {
    const x0 = clamp(Math.floor((axis.min.x - lower.x) / cell), 1, nx - 2),
      x1 = clamp(Math.ceil((axis.max.x - lower.x) / cell), 1, nx - 2),
      y0 = clamp(Math.floor((axis.min.y - lower.y) / cell), 1, ny - 2),
      y1 = clamp(Math.ceil((axis.max.y - lower.y) / cell), 1, ny - 2),
      z0 = clamp(Math.floor((axis.min.z - lower.z) / cell), 1, nz - 2),
      z1 = clamp(Math.ceil((axis.max.z - lower.z) / cell), 1, nz - 2),
      lx = x1 - x0 + 1,
      ly = y1 - y0 + 1,
      lplane = lx * ly,
      count = lplane * (z1 - z0 + 1);
    if (local.length < count) {
      local = new Float32Array(count);
      localGrowth = new Uint8Array(count);
    }
    local.fill(band, 0, count);
    localGrowth.fill(0, 0, count);
    // Min within one curved axis; smooth union only between axes. This avoids beads at sampled curve knots.
    for (const segment of axis.segments) {
      const pad = Math.max(segment.ra, segment.rb) + band + blend,
        xa = Math.max(x0, Math.floor((Math.min(segment.ax, segment.bx) - pad - lower.x) / cell)),
        xb = Math.min(x1, Math.ceil((Math.max(segment.ax, segment.bx) + pad - lower.x) / cell)),
        ya = Math.max(y0, Math.floor((Math.min(segment.ay, segment.by) - pad - lower.y) / cell)),
        yb = Math.min(y1, Math.ceil((Math.max(segment.ay, segment.by) + pad - lower.y) / cell)),
        za = Math.max(z0, Math.floor((Math.min(segment.az, segment.bz) - pad - lower.z) / cell)),
        zb = Math.min(z1, Math.ceil((Math.max(segment.az, segment.bz) + pad - lower.z) / cell)),
        dx = segment.bx - segment.ax,
        dy = segment.by - segment.ay,
        dz = segment.bz - segment.az,
        inverseLength = 1 / Math.max(1e-16, dx * dx + dy * dy + dz * dz),
        radiusDelta = segment.rb - segment.ra;
      for (let z = za; z <= zb; z++) {
        const qz = lower.z + z * cell - segment.az;
        for (let y = ya; y <= yb; y++) {
          const qy = lower.y + y * cell - segment.ay,
            row = (z - z0) * lplane + (y - y0) * lx;
          for (let x = xa; x <= xb; x++) {
            const qx = lower.x + x * cell - segment.ax,
              t = clamp((qx * dx + qy * dy + qz * dz) * inverseLength, 0, 1),
              xx = qx - dx * t,
              yy = qy - dy * t,
              zz = qz - dz * t,
              d = Math.sqrt(xx * xx + yy * yy + zz * zz) - segment.ra - radiusDelta * t,
              index = row + x - x0;
            if (d < local[index]) {
              local[index] = d;
              localGrowth[index] =
                axis.terminal && !axis.broken
                  ? Math.round(clamp((segment.t0 + (segment.t1 - segment.t0) * t - 0.82) / 0.18, 0, 1) * 255)
                  : 0;
            }
          }
        }
      }
    }
    const cupRadius = Math.min(0.0042, axis.radius * 0.23),
      cupX = axis.end.x + axis.tangent.x * (axis.radius + 0.0012),
      cupY = axis.end.y + axis.tangent.y * (axis.radius + 0.0012),
      cupZ = axis.end.z + axis.tangent.z * (axis.radius + 0.0012);
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++) {
        const globalRow = z * plane + y * nx,
          localRow = (z - z0) * lplane + (y - y0) * lx,
          py = lower.y + y * cell,
          pz = lower.z + z * cell;
        for (let x = x0; x <= x1; x++) {
          const li = localRow + x - x0,
            gi = globalRow + x,
            px = lower.x + x * cell;
          let d = local[li];
          if (d >= band) continue;
          if (axis.broken)
            d = Math.max(
              d,
              (px - axis.end.x) * axis.tangent.x +
                (py - axis.end.y) * axis.tangent.y +
                (pz - axis.end.z) * axis.tangent.z,
            );
          else if (lod === 0 && axis.terminal) {
            const cx = px - cupX,
              cy = py - cupY,
              cz = pz - cupZ;
            // A shallow axial calyx is part of the single surface, not a separate ring or mesh.
            if (Math.abs(cx) < cupRadius && Math.abs(cy) < cupRadius && Math.abs(cz) < cupRadius)
              d = Math.max(d, cupRadius - Math.sqrt(cx * cx + cy * cy + cz * cz));
          }
          const previous = field[gi],
            h = clamp(0.5 + (0.5 * (previous - d)) / blend, 0, 1);
          if (h <= 0) continue;
          field[gi] = previous * (1 - h) + d * h - blend * h * (1 - h);
          growth[gi] = Math.round(growth[gi] * (1 - h) + localGrowth[li] * h);
        }
      }
  }
  // Keep the zero set off exact grid corners. Twenty micrometres is below the geometric detail budget,
  // and avoids zero-area triangles/duplicate positions without opening holes by deleting faces.
  for (let i = 0; i < total; i++)
    if (Math.abs(field[i]) < 0.00002) field[i] = field[i] < 0 ? -0.00002 : 0.00002;
  // Remove fully enclosed voids where crowded branches have fused. An exterior flood follows the
  // same edges as the mesher; open channels and the shallow terminal calices are preserved.
  const exterior = new Uint8Array(total),
    queue = new Uint32Array(total);
  const flood = (start: number, solid: boolean): void => {
    exterior.fill(0);
    exterior[start] = 1;
    queue[0] = start;
    let head = 0,
      tail = 1;
    while (head < tail) {
      const q = queue[head++],
        z = Math.floor(q / plane),
        y = Math.floor((q - z * plane) / nx),
        x = q - z * plane - y * nx;
      for (const [dx, dy, dz] of NEIGHBORS) {
        const xx = x + dx,
          yy = y + dy,
          zz = z + dz;
        if (xx < 0 || xx >= nx || yy < 0 || yy >= ny || zz < 0 || zz >= nz) continue;
        const n = q + dx + dy * nx + dz * plane;
        if (exterior[n] || field[n] < 0 !== solid) continue;
        exterior[n] = 1;
        queue[tail++] = n;
      }
    }
  };
  let filledVoids = 0,
    omittedTipSamples = 0;
  if (lod === 1) {
    // A coarse cell can intersect a narrow fork's tip while missing its neck. Omit only these
    // disconnected low-detail samples, rather than rendering floating fragments of a living branch.
    let deepest = 0;
    for (let i = 1; i < total; i++) if (field[i] < field[deepest]) deepest = i;
    flood(deepest, true);
    for (let i = 0; i < total; i++)
      if (field[i] < 0 && !exterior[i]) {
        field[i] = Math.max(cell * 0.5, -field[i]);
        omittedTipSamples++;
      }
  }
  flood(0, false);
  for (let i = 0; i < total; i++)
    if (!exterior[i] && field[i] > 0) {
      field[i] = -Math.max(cell * 0.5, field[i]);
      filledVoids++;
    }
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    tips: number[] = [],
    occlusion: number[] = [],
    indices: number[] = [],
    edges = new Map<number, number>();
  const sample = (x: number, y: number, z: number): number => {
    if (x < 1 || y < 1 || z < 1 || x >= nx - 2 || y >= ny - 2 || z >= nz - 2) return band;
    const ix = Math.floor(x),
      iy = Math.floor(y),
      iz = Math.floor(z),
      fx = x - ix,
      fy = y - iy,
      fz = z - iz,
      q = iz * plane + iy * nx + ix;
    const a = field[q] * (1 - fx) + field[q + 1] * fx,
      b = field[q + nx] * (1 - fx) + field[q + nx + 1] * fx,
      c = field[q + plane] * (1 - fx) + field[q + plane + 1] * fx,
      d = field[q + plane + nx] * (1 - fx) + field[q + plane + nx + 1] * fx;
    return (a * (1 - fy) + b * fy) * (1 - fz) + (c * (1 - fy) + d * fy) * fz;
  };
  const vertex = (a: number, b: number): number => {
    const key = Math.min(a, b) * total + Math.max(a, b),
      cached = edges.get(key);
    if (cached !== undefined) return cached;
    const t = field[a] / (field[a] - field[b]),
      izA = Math.floor(a / plane),
      izB = Math.floor(b / plane),
      iyA = Math.floor((a - izA * plane) / nx),
      iyB = Math.floor((b - izB * plane) / nx),
      ixA = a - izA * plane - iyA * nx,
      ixB = b - izB * plane - iyB * nx,
      x = ixA + (ixB - ixA) * t,
      y = iyA + (iyB - iyA) * t,
      z = izA + (izB - izA) * t;
    let gx = (field[a + 1] - field[a - 1]) * (1 - t) + (field[b + 1] - field[b - 1]) * t,
      gy = (field[a + nx] - field[a - nx]) * (1 - t) + (field[b + nx] - field[b - nx]) * t,
      gz = (field[a + plane] - field[a - plane]) * (1 - t) + (field[b + plane] - field[b - plane]) * t;
    const inverse = 1 / Math.max(1e-12, Math.hypot(gx, gy, gz));
    gx *= inverse;
    gy *= inverse;
    gz *= inverse;
    const index = positions.length / 3,
      px = lower.x + x * cell,
      py = lower.y + y * cell,
      pz = lower.z + z * cell;
    if (index >= maxVertices) throw new Error('Coral union mesh exceeds its bounded vertex budget');
    positions.push(px, py, pz);
    normals.push(gx, gy, gz);
    uvs.push(px, pz);
    tips.push((growth[a] * (1 - t) + growth[b] * t) / 255);
    let shade = 0;
    for (const distance of [0.012, 0.028]) {
      const measured = sample(
        x + (gx * distance) / cell,
        y + (gy * distance) / cell,
        z + (gz * distance) / cell,
      );
      shade += clamp(1 - measured / distance, 0, 1) * 0.5;
    }
    occlusion.push(1 - shade);
    edges.set(key, index);
    return index;
  };
  const triangle = (a: number, b: number, c: number): void => {
    if (indices.length >= maxVertices * 7)
      throw new Error('Coral union mesh exceeds its bounded triangle budget');
    const ax = positions[b * 3] - positions[a * 3],
      ay = positions[b * 3 + 1] - positions[a * 3 + 1],
      az = positions[b * 3 + 2] - positions[a * 3 + 2],
      bx = positions[c * 3] - positions[a * 3],
      by = positions[c * 3 + 1] - positions[a * 3 + 1],
      bz = positions[c * 3 + 2] - positions[a * 3 + 2],
      dx = normals[a * 3] + normals[b * 3] + normals[c * 3],
      dy = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1],
      dz = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2];
    if ((ay * bz - az * by) * dx + (az * bx - ax * bz) * dy + (ax * by - ay * bx) * dz < 0)
      indices.push(a, c, b);
    else indices.push(a, b, c);
  };
  const corner = new Int32Array(8),
    inside = new Int32Array(4),
    outside = new Int32Array(4);
  for (let z = 1; z < nz - 2; z++)
    for (let y = 1; y < ny - 2; y++)
      for (let x = 1; x < nx - 2; x++) {
        const q = z * plane + y * nx + x;
        corner[0] = q;
        corner[1] = q + 1;
        corner[2] = q + 1 + nx;
        corner[3] = q + nx;
        corner[4] = q + plane;
        corner[5] = q + plane + 1;
        corner[6] = q + plane + 1 + nx;
        corner[7] = q + plane + nx;
        let count = 0;
        for (let i = 0; i < 8; i++) count += Number(field[corner[i]] < 0);
        if (count === 0 || count === 8) continue;
        for (const tet of TETS) {
          let ni = 0,
            no = 0;
          for (let i = 0; i < 4; i++) {
            const v = corner[tet[i]];
            if (field[v] < 0) inside[ni++] = v;
            else outside[no++] = v;
          }
          if (!ni || !no) continue;
          if (ni === 1)
            triangle(
              vertex(inside[0], outside[0]),
              vertex(inside[0], outside[1]),
              vertex(inside[0], outside[2]),
            );
          else if (no === 1)
            triangle(
              vertex(outside[0], inside[0]),
              vertex(outside[0], inside[1]),
              vertex(outside[0], inside[2]),
            );
          else {
            const a = vertex(inside[0], outside[0]),
              b = vertex(inside[0], outside[1]),
              c = vertex(inside[1], outside[0]),
              d = vertex(inside[1], outside[1]);
            triangle(a, b, c);
            triangle(b, d, c);
          }
        }
      }
  const geometry = new BufferGeometry();
  geometry.name = name;
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aGrowth', new Float32BufferAttribute(tips, 1));
  geometry.setAttribute('aOcclusion', new Float32BufferAttribute(occlusion, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.union = {
    cell,
    grid: [nx, ny, nz],
    scalarScratchBytes:
      field.byteLength +
      growth.byteLength +
      local.byteLength +
      localGrowth.byteLength +
      exterior.byteLength +
      queue.byteLength,
    filledVoids,
    omittedTipSamples,
    vertices: positions.length / 3,
    triangles: indices.length / 3,
    milliseconds: performance.now() - started,
  };
  return geometry;
}
