// 符号付き距離関数（SDF）による有機的な形状の組み立てと、Surface Nets によるメッシュ化
import * as THREE from 'three';

// ---------- 演算 ----------
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

// ---------- 形状 ----------
export function sphere(c, r) {
  const [cx, cy, cz] = c;
  return (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r;
}

// 楕円体（iq の近似）
export function ellipsoid(c, r) {
  const [cx, cy, cz] = c, [rx, ry, rz] = r;
  return (x, y, z) => {
    const px = x - cx, py = y - cy, pz = z - cz;
    const k0 = Math.hypot(px / rx, py / ry, pz / rz);
    const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
  };
}

// 半径が変化するカプセル（iq の sdRoundCone）
export function cone(a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

// 角の丸い箱
export function roundBox(c, h, r) {
  const [cx, cy, cz] = c, [hx, hy, hz] = h;
  return (x, y, z) => {
    const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
  };
}

// 点列をつなぐ曲がった管（各節点に半径）
export function tube(points, radii, k = 0) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) segs.push(cone(points[i], points[i + 1], radii[i], radii[i + 1]));
  return (x, y, z) => {
    let d = segs[0](x, y, z);
    for (let i = 1; i < segs.length; i++) d = smin(d, segs[i](x, y, z), k);
    return d;
  };
}

// 軸ごとの伸縮（距離はおおよそ保たれる）
export function scaled(f, sx, sy, sz) {
  const m = Math.min(sx, sy, sz);
  return (x, y, z) => f(x / sx, y / sy, z / sz) * m;
}

export function union(k, ...fs) {
  return (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k);
    return d;
  };
}

// ---------- Surface Nets メッシュ化 ----------
// f: (x,y,z) => 距離, 負が内部。bmin/bmax: 境界, cell: セルサイズ
export function meshSDF(f, bmin, bmax, cell, opts = {}) {
  const pad = cell * 2;
  const x0 = bmin[0] - pad, y0 = bmin[1] - pad, z0 = bmin[2] - pad;
  const nx = Math.ceil((bmax[0] - bmin[0] + 2 * pad) / cell) + 1;
  const ny = Math.ceil((bmax[1] - bmin[1] + 2 * pad) / cell) + 1;
  const nz = Math.ceil((bmax[2] - bmin[2] + 2 * pad) / cell) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * cell;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * cell;
      for (let i = 0; i < nx; i++) vals[idx(i, j, k)] = f(x0 + i * cell, y, z);
    }
  }
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const cidx = (i, j, k) => i + cx * (j + cy * k);
  const pos = [];
  const corner = new Float32Array(8);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  let nv = 0;
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = vals[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
      corner[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = corner[a], vb = corner[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
      const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
      sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t;
      n++;
    }
    pos.push(x0 + (i + sx / n) * cell, y0 + (j + sy / n) * cell, z0 + (k + sz / n) * cell);
    cellVert[cidx(i, j, k)] = nv++;
  }
  // 面：符号の変わる格子辺ごとに、その辺を共有する4セルの頂点で四角形
  const index = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c); else index.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
    const v0 = vals[idx(i, j, k)];
    const inside = v0 < 0;
    // x 方向の辺 (i,j,k)-(i+1,j,k) を共有するセル: (i, j-1..j, k-1..k)
    if (i < cx && (vals[idx(i + 1, j, k)] < 0) !== inside) {
      quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], !inside);
    }
    if (j < cy && (vals[idx(i, j + 1, k)] < 0) !== inside) {
      quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], !inside);
    }
    if (k < cz && (vals[idx(i, j, k + 1)] < 0) !== inside) {
      quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], !inside);
    }
  }
  // 法線は SDF の勾配から（滑らかな陰影）
  const nrm = new Float32Array(pos.length);
  const e = cell * 0.5;
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z);
    let gy = f(x, y + e, z) - f(x, y - e, z);
    let gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[v * 3] = gx / l; nrm[v * 3 + 1] = gy / l; nrm[v * 3 + 2] = gz / l;
  }
  // 頂点を等値面へ1回だけ引き寄せる（ポリゴン感を減らす）
  if (opts.project !== false) {
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const d = f(x, y, z);
      pos[v * 3] -= nrm[v * 3] * d; pos[v * 3 + 1] -= nrm[v * 3 + 1] * d; pos[v * 3 + 2] -= nrm[v * 3 + 2] * d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(index);
  // 三角形の向きを勾配と揃える（念のため全体で判定）
  fixWinding(geo);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function fixWinding(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, ix = geo.index.array;
  let agree = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
  for (let t = 0; t < ix.length; t += 3 * 17) {
    a.fromBufferAttribute(p, ix[t]); b.fromBufferAttribute(p, ix[t + 1]); c.fromBufferAttribute(p, ix[t + 2]);
    fn.subVectors(b, a).cross(c.sub(a));
    vn.fromBufferAttribute(n, ix[t]);
    agree += fn.dot(vn) > 0 ? 1 : -1;
  }
  if (agree < 0) {
    for (let t = 0; t < ix.length; t += 3) { const s = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = s; }
  }
}

// f を評価して範囲を自動推定するのは高価なので、形状ごとに境界を与える
export function meshAuto(f, bmin, bmax, targetCells = 64, opts) {
  const size = Math.max(bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2]);
  return meshSDF(f, bmin, bmax, size / targetCells, opts);
}
