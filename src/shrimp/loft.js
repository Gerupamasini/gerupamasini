import * as THREE from 'three';

/**
 * Lofting of exoskeletal segments from traced cross-section contours.
 *
 * A section is described by a HALF contour (left side, z >= 0) running from the
 * dorsal midline to the ventral midline as normalised [z, y] pairs:
 *   z in [0, 1]  -> multiplied by the station half-width
 *   y in [-1, 1] -> positive values multiplied by `top`, negative by `bottom`
 * The contour is resampled uniformly by arc length (Catmull-Rom) and mirrored.
 */

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

/** Resample an open polyline of control points into n points evenly spaced by arc length. */
export function resampleSpline(ctrl, n) {
  const dense = [];
  const m = ctrl.length;
  for (let i = 0; i < m - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(m - 1, i + 2)];
    for (let k = 0; k < 16; k++) dense.push(catmullRom(p0, p1, p2, p3, k / 16));
  }
  dense.push(ctrl[m - 1]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * total;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-12, cum[j + 1] - cum[j]);
    out.push([dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f, dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f]);
  }
  return out;
}

/** Piecewise-linear lookup in a table of [x, v] rows (x ascending). */
export function table(rows, x) {
  if (x <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) {
    if (x <= rows[i][0]) {
      const f = (x - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]);
      return rows[i - 1][1] + (rows[i][1] - rows[i - 1][1]) * f;
    }
  }
  return rows[rows.length - 1][1];
}

/** Smooth (Catmull-Rom) lookup in a table of [x, v] rows. */
export function smoothTable(rows, x) {
  if (x <= rows[0][0]) return rows[0][1];
  const n = rows.length;
  if (x >= rows[n - 1][0]) return rows[n - 1][1];
  let i = 1;
  while (rows[i][0] < x) i++;
  const p0 = rows[Math.max(0, i - 2)];
  const p1 = rows[i - 1];
  const p2 = rows[i];
  const p3 = rows[Math.min(n - 1, i + 1)];
  const t = (x - p1[0]) / (p2[0] - p1[0]);
  return catmullRom([0, p0[1]], [0, p1[1]], [0, p2[1]], [0, p3[1]], t)[1];
}

/**
 * Loft a closed segment along local X.
 * @param {object} o
 *   length   segment length (m)
 *   dir      +1 builds toward +X, -1 toward -X
 *   station  (t) => { top, bottom, half, y, contour }   t in [0,1] along the segment
 *   rings    rings along the length
 *   half     points on the half contour (dorsal -> ventral)
 *   attrs    (t, zN, yN, side) => { joint, pig, thick }   per-vertex shading data
 *   caps     [bool, bool] close ends
 */
export function loft(o) {
  const rings = o.rings ?? 24;
  const H = o.half ?? 18;
  const ringN = 2 * H - 2; // mirrored ring without duplicated midline points
  const pos = [];
  const uv = [];
  const aJoint = [];
  const aPig = [];
  const aThick = [];
  const idx = [];
  const push = (x, y, z, t, zN, yN, side, v) => {
    pos.push(x, y, z);
    uv.push(t, v);
    const a = o.attrs ? o.attrs(t, zN, yN, side) : {};
    aJoint.push(a.joint ?? 0);
    aPig.push(a.pig ?? 0.5);
    aThick.push(a.thick ?? 1);
  };
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const st = o.station(t);
    const halfPts = resampleSpline(st.contour, H);
    const x = o.dir * t * o.length + (st.x ?? 0);
    // left side (z >= 0): dorsal -> ventral, then right side ventral -> dorsal (skipping the midline points)
    for (let k = 0; k < H; k++) {
      const [zN, yN] = halfPts[k];
      const y = (st.y ?? 0) + (yN >= 0 ? yN * st.top : yN * st.bottom);
      push(x, y, zN * st.half, t, zN, yN, 1, k / (ringN));
    }
    for (let k = H - 2; k >= 1; k--) {
      const [zN, yN] = halfPts[k];
      const y = (st.y ?? 0) + (yN >= 0 ? yN * st.top : yN * st.bottom);
      push(x, y, -zN * st.half, t, zN, yN, -1, (2 * H - 2 - k) / ringN);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < ringN; k++) {
      const a = i * ringN + k;
      const b = i * ringN + ((k + 1) % ringN);
      const c = a + ringN;
      const d = b + ringN;
      // Winding chosen so normals face outward for both build directions.
      if (o.dir > 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const caps = o.caps ?? [true, true];
  for (const [ring, on] of [[0, caps[0]], [rings, caps[1]]]) {
    if (!on) continue;
    const t = ring / rings;
    const st = o.station(t);
    let cy = 0;
    for (let k = 0; k < ringN; k++) cy += pos[(ring * ringN + k) * 3 + 1];
    cy /= ringN;
    const ci = pos.length / 3;
    push(o.dir * t * o.length + (st.x ?? 0), cy, 0, t, 0, 0, 1, 0);
    aJoint[aJoint.length - 1] = 1;
    const front = (ring === 0) === (o.dir > 0);
    for (let k = 0; k < ringN; k++) {
      const a = ring * ringN + k;
      const b = ring * ringN + ((k + 1) % ringN);
      if (front) idx.push(ci, a, b);
      else idx.push(ci, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aJoint', new THREE.Float32BufferAttribute(aJoint, 1));
  g.setAttribute('aPig', new THREE.Float32BufferAttribute(aPig, 1));
  g.setAttribute('aThick', new THREE.Float32BufferAttribute(aThick, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Ensure a geometry has the shading attributes the shell shader expects. */
export function withShellAttrs(g, { joint = 0, pig = 0.5, thick = 1 } = {}) {
  const n = g.attributes.position.count;
  if (!g.attributes.aJoint) g.setAttribute('aJoint', new THREE.Float32BufferAttribute(new Float32Array(n).fill(joint), 1));
  if (!g.attributes.aPig) g.setAttribute('aPig', new THREE.Float32BufferAttribute(new Float32Array(n).fill(pig), 1));
  if (!g.attributes.aThick) g.setAttribute('aThick', new THREE.Float32BufferAttribute(new Float32Array(n).fill(thick), 1));
  return g;
}

const LENS = [[0, 1], [0.55, 0.85], [0.9, 0.45], [1, 0], [0.9, -0.45], [0.55, -0.85], [0, -1]];

/**
 * Thin lanceolate blade along +X (uropod rami, scaphocerite, pleopod rami).
 * width(t) = half-width, thick(t) = half-thickness; `flat` puts the width in Z
 * (horizontal blade), otherwise in Y (vertical blade).
 */
export function blade({ len, width, thick, offset = () => 0, rings = 20, half = 8, attrs, flat = true }) {
  const g = loft({
    length: len,
    dir: 1,
    rings,
    half,
    station: (t) => ({ top: thick(t), bottom: thick(t), half: Math.max(1e-6, width(t)), y: 0, contour: LENS }),
    attrs,
    caps: [true, true],
  });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / len;
    // Lateral offset of the blade midline (asymmetric outlines).
    p.setZ(i, p.getZ(i) + offset(t));
    if (!flat) {
      const y = p.getY(i);
      p.setY(i, p.getZ(i));
      p.setZ(i, y);
    }
  }
  if (!flat) g.index.array.reverse();
  g.computeVertexNormals();
  return g;
}

/** Bend a geometry built along +X about the Z axis: angle grows as (x/len)^power * total. */
export function bendZ(g, len, total, power = 2) {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = Math.max(0, v.x / len);
    const a = total * Math.pow(t, power);
    // Rotate the point about the running centreline (approximate arc bending).
    const r = v.x;
    const x = r * Math.cos(a * 0.5) - v.y * Math.sin(a);
    const y = r * Math.sin(a * 0.5) + v.y * Math.cos(a);
    p.setXYZ(i, x, y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Overwrite shading attributes with constants. */
export function paint(g, values) {
  withShellAttrs(g);
  for (const [k, v] of Object.entries(values)) {
    const name = { joint: 'aJoint', pig: 'aPig', thick: 'aThick' }[k];
    g.attributes[name].array.fill(v);
    g.attributes[name].needsUpdate = true;
  }
  return g;
}
