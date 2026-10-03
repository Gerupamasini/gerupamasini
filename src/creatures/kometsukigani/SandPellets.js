import { Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { makePelletMaterial, SAND_LINEAR } from './ScopimeraGlobosaMaterial.js';
import { pelletGeometry } from './ScopimeraGlobosaModel.js';

/**
 * Sand pellets on the flat — the feeding pellets コメツキガニ leave in radiating rows and the larger wet lumps it
 * carries out of its burrow. Every pellet is a real object at a real place: stored in 0.5 m cells, drawn as one
 * InstancedMesh per cell with the detail of its distance, found by a 1 cm hash so a foot that lands on one stands
 * on it. Fresh pellets are dark with water and dry pale in minutes; when the tide covers them they slump and are
 * gone a few minutes later.
 */

const CELL = 0.5;
const BUCKET = 0.01;
const MAX_PER_CELL = 4096;
const STRIDE = 8;                    // x, y, z, r, seed, birth, kind, washAt
/**
 * draw distances (m) for detail 2 / 1 / 0. A 2 mm pellet is under a pixel beyond about 2.5 m: past that the
 * colony draws a pellet-field decal instead of geometry.
 */
const DETAIL_DIST = [0.5, 1.3, 2.8];

const _m = new Matrix4(), _q = new Quaternion(), _s = new Vector3(), _p = new Vector3();
const UP = new Vector3(0, 1, 0);

class Cell {
  constructor(key, cx, cz) {
    this.key = key;
    this.cx = cx; this.cz = cz;
    this.data = new Float32Array(MAX_PER_CELL * STRIDE);
    this.n = 0;
    this.mesh = null;
    this.detail = -1;
    this.dirty = true;
    this.minY = Infinity;
  }
}

export class SandPellets {
  constructor({ quality = 1 } = {}) {
    this.group = new Group();
    this.group.name = 'kg-pellets';
    this.cells = new Map();
    this.buckets = new Map();
    this.material = makePelletMaterial({ detail: 1 });
    this.material.userData.uniforms.uPelScale.value = 0.001;
    this.quality = quality;
    this.time = 0;
    this.total = 0;
    this.castShadow = false;
    this.sand = SAND_LINEAR.clone();
  }

  setSandColor(c) { this.material.userData.uniforms.uPelSand.value.copy(c); }

  cellKey(x, z) { return Math.floor(z / CELL) * 100003 + Math.floor(x / CELL); }

  /** add a pellet (world position of its base on the sand), radius in metres, kind 'feed' | 'dig' */
  add(x, y, z, r, kind = 'feed', time = this.time, seed = Math.random()) {
    const key = this.cellKey(x, z);
    let c = this.cells.get(key);
    if (!c) { c = new Cell(key, (Math.floor(x / CELL) + 0.5) * CELL, (Math.floor(z / CELL) + 0.5) * CELL); this.cells.set(key, c); }
    if (c.n >= MAX_PER_CELL) return -1;
    const i = c.n++;
    const o = i * STRIDE;
    c.data[o] = x; c.data[o + 1] = y; c.data[o + 2] = z; c.data[o + 3] = r;
    c.data[o + 4] = seed; c.data[o + 5] = time; c.data[o + 6] = kind === 'dig' ? 1 : 0; c.data[o + 7] = 0;
    c.minY = Math.min(c.minY, y);
    c.dirty = true;
    this.total++;
    const bk = this.bucketKey(x, z);
    let b = this.buckets.get(bk);
    if (!b) { b = []; this.buckets.set(bk, b); }
    b.push(c, i);
    return i;
  }

  bucketKey(x, z) { return Math.floor(z / BUCKET) * 1000003 + Math.floor(x / BUCKET); }

  /** height of the top of whatever pellet lies under (x, z), or -Infinity */
  heightAt(x, z) {
    let best = -Infinity;
    const bx = Math.floor(x / BUCKET), bz = Math.floor(z / BUCKET);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const b = this.buckets.get((bz + j) * 1000003 + (bx + i));
      if (!b) continue;
      for (let k = 0; k < b.length; k += 2) {
        const c = b[k], o = b[k + 1] * STRIDE;
        const dx = x - c.data[o], dz = z - c.data[o + 2], r = c.data[o + 3];
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        // a flattened ball: about 0.75 r high at the centre, sitting a little sunk
        const top = c.data[o + 1] + r * 0.62 * Math.sqrt(1 - d2 / (r * r)) + r * 0.1;
        if (top > best) best = top;
      }
    }
    return best;
  }

  /** count pellets within r of a point (for the colony's statistics) */
  countNear(x, z, r) {
    let n = 0;
    const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL), r0 = Math.floor((z - r) / CELL), r1 = Math.floor((z + r) / CELL);
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) {
      const c = this.cells.get(j * 100003 + i);
      if (!c) continue;
      for (let k = 0; k < c.n; k++) { const o = k * STRIDE; if (Math.hypot(c.data[o] - x, c.data[o + 2] - z) < r) n++; }
    }
    return n;
  }

  /**
   * Per frame: detail and visibility by distance, the drying clock, and the tide: pellets the water has reached
   * start to wash away; washed-out ones are removed.
   * waterAt(x, z): the water surface there (or -Infinity when unknown)
   */
  update(dt, cam, waterAt) {
    this.time += dt;
    this.material.userData.uniforms.uPelTime.value = this.time;
    this.tideAcc = (this.tideAcc ?? 0) + dt;
    const tide = this.tideAcc > 1;
    if (tide) this.tideAcc = 0;
    const far = DETAIL_DIST[2] * (this.quality > 0 ? 1 : 0.65);
    for (const c of this.cells.values()) {
      const d = Math.hypot(c.cx - cam.x, c.cz - cam.z) - CELL * 0.7;
      if (tide && waterAt) this.washCell(c, waterAt);
      if (c.n === 0) { this.dropMesh(c); continue; }
      if (d > far) { this.dropMesh(c); continue; }
      const detail = d < DETAIL_DIST[0] ? 2 : d < DETAIL_DIST[1] ? 1 : 0;
      if (!c.mesh || c.detail !== detail) this.buildMesh(c, detail);
      else if (c.dirty) this.refreshMesh(c);
    }
  }

  washCell(c, waterAt) {
    const w = waterAt(c.cx, c.cz);
    if (!(w > c.minY + 0.001)) return;
    let removed = false;
    for (let k = 0; k < c.n; k++) {
      const o = k * STRIDE;
      if (c.data[o + 7] === 0 && w > c.data[o + 1] + c.data[o + 3] * 0.3) { c.data[o + 7] = this.time; c.dirty = true; }
      // gone three minutes after the water came
      if (c.data[o + 7] > 0 && this.time - c.data[o + 7] > 180) { c.data[o + 3] = -1; removed = true; }
    }
    if (removed) this.compact(c);
  }

  compact(c) {
    let j = 0;
    for (let k = 0; k < c.n; k++) {
      const o = k * STRIDE;
      if (c.data[o + 3] < 0) { this.total--; continue; }
      if (j !== k) c.data.copyWithin(j * STRIDE, o, o + STRIDE);
      j++;
    }
    c.n = j;
    c.dirty = true;
    // rebuild this cell's buckets
    for (const [bk, b] of this.buckets) {
      let w = 0;
      for (let k = 0; k < b.length; k += 2) if (b[k] !== c) { b[w++] = b[k]; b[w++] = b[k + 1]; }
      b.length = w;
      if (!w) this.buckets.delete(bk);
    }
    for (let k = 0; k < c.n; k++) {
      const o = k * STRIDE;
      const bk = this.bucketKey(c.data[o], c.data[o + 2]);
      let b = this.buckets.get(bk);
      if (!b) { b = []; this.buckets.set(bk, b); }
      b.push(c, k);
    }
  }

  buildMesh(c, detail) {
    this.dropMesh(c);
    const mesh = new InstancedMesh(pelletGeometry(detail), this.material, MAX_PER_CELL);
    mesh.name = 'kg-pellet-cell';
    mesh.frustumCulled = false;
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = true;
    const attr = new InstancedBufferAttribute(new Float32Array(MAX_PER_CELL * 4), 4);
    const wash = new InstancedBufferAttribute(new Float32Array(MAX_PER_CELL), 1);
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('aPel', attr);
    mesh.geometry.setAttribute('aWash', wash);
    c.mesh = mesh;
    c.detail = detail;
    c.dirty = true;
    this.group.add(mesh);
    this.refreshMesh(c);
  }

  refreshMesh(c) {
    const mesh = c.mesh;
    const attr = mesh.geometry.getAttribute('aPel');
    const wash = mesh.geometry.getAttribute('aWash');
    for (let k = 0; k < c.n; k++) {
      const o = k * STRIDE;
      const r = c.data[o + 3];
      const seed = c.data[o + 4];
      _q.setFromAxisAngle(UP, seed * 6.283);
      _p.set(c.data[o], c.data[o + 1] + r * 0.32, c.data[o + 2]);
      _s.set(r, r, r);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(k, _m);
      attr.setXYZW(k, seed, c.data[o + 5], c.data[o + 6], c.data[o + 6] > 0.5 ? 1 : 0.85);
      wash.setX(k, c.data[o + 7]);
    }
    mesh.count = c.n;
    mesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
    wash.needsUpdate = true;
    c.dirty = false;
  }

  dropMesh(c) {
    if (!c.mesh) return;
    c.mesh.removeFromParent();
    c.mesh.geometry.dispose();
    c.mesh = null;
    c.detail = -1;
  }

  setShadows(on) {
    if (on === this.castShadow) return;
    this.castShadow = on;
    for (const c of this.cells.values()) if (c.mesh) c.mesh.castShadow = on;
  }

  /** all pellets everywhere gone (a new tide cycle after a time jump) */
  clear() {
    for (const c of this.cells.values()) this.dropMesh(c);
    this.cells.clear();
    this.buckets.clear();
    this.total = 0;
  }

  dispose() {
    this.clear();
    this.material.dispose();
    this.group.removeFromParent();
  }
}

export { CELL as PELLET_CELL };
