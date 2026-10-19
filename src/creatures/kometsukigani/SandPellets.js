import { Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Sphere, Vector3 } from 'three';
import { makePelletMaterial, SAND_LINEAR } from './ScopimeraGlobosaMaterial.js';
import { pelletGeometry } from './ScopimeraGlobosaModel.js';

/**
 * Sand pellets on the flat — the feeding pellets コメツキガニ leave in radiating rows and the larger wet lumps it
 * carries out of its burrow. Every pellet is a real object at a real place: stored in 0.5 m cells, drawn as one
 * InstancedMesh per cell with the detail of its distance, found by a 1 cm hash so a foot that lands on one stands
 * on it. Fresh pellets are dark with water and dry pale in minutes; when the water covers them (the tide, or a pool
 * on the flat) they slump and are gone within half a minute: a burrow under water has none round it.
 */

const CELL = 0.5;
const BUCKET = 0.01;
const MAX_PER_CELL = 4096;
const STRIDE = 11;                   // x, y, z, r, seed, birth, kind, washAt, sand r, g, b
/**
 * distances (m, from the eye) within which a pellet is drawn with 180 / 80 / 20 triangles; beyond, an octahedron.
 * A 2 mm pellet is some 15 px across at 0.1 m (the observation camera), 7 at 0.22 m, 2.5 at 0.6 m and a pixel at
 * 1.5 m (1080 lines, 70°); past the colony's pellet range (1.9–3.4 m by quality) it draws a pellet-field decal
 * instead of geometry.
 */
const DETAIL_DIST = [0.1, 0.22, 0.6];
const detailAt = (d) => (d < DETAIL_DIST[0] ? 3 : d < DETAIL_DIST[1] ? 2 : d < DETAIL_DIST[2] ? 1 : 0);
/**
 * a pixel or less: of the feeding pellets a cell this far off (m) draws a half / a third, each grown so the sand
 * they cover stays the same (picked by their seed, so the same ones stay; the larger dug lumps all stay)
 */
const THIN_DIST = [1.6, 2.4];
const keepAt = (d) => (d > THIN_DIST[1] ? 1 / 3 : d > THIN_DIST[0] ? 0.5 : 1);
/** seconds from the water reaching a pellet to its slumping away (the shader's dissolve takes the first 20) */
const WASH_S = 30;

const _m = new Matrix4(), _q = new Quaternion(), _s = new Vector3(), _p = new Vector3(), _c = new Color();
const UP = new Vector3(0, 1, 0);

class Cell {
  constructor(key, cx, cz) {
    this.key = key;
    this.cx = cx; this.cz = cz;
    this.data = new Float32Array(MAX_PER_CELL * STRIDE);
    this.n = 0;
    /** a mesh per detail: one for a cell all at one distance, several for one by the camera (each pellet its own) */
    this.meshes = [null, null, null, null];
    this.caps = [0, 0, 0, 0];
    this.groups = null;              // per detail, the pellets drawn with it (a split cell)
    this.split = false;
    this.keep = 1;
    this.camAt = new Vector3(Infinity, 0, 0);
    this.dirty = true;
    this.minY = Infinity;
    this.maxY = -Infinity;
  }
}

export class SandPellets {
  /** @param o {{ far?: number }} far: the distance (m) within which pellets are drawn as geometry */
  constructor({ far = 2.8 } = {}) {
    this.group = new Group();
    this.group.name = 'kg-pellets';
    this.cells = new Map();
    this.buckets = new Map();
    this.material = makePelletMaterial({ detail: 1 });
    this.material.userData.uniforms.uPelScale.value = 0.001;
    // the far pellets (8 and 20 triangles: a pixel or two) without the lumps; the same uniforms
    this.materialFar = makePelletMaterial({ detail: 1, simple: true, shared: this.material.userData.uniforms });
    this.far = far;
    this.time = 0;
    this.total = 0;
    this.castShadow = false;
    this.sand = SAND_LINEAR.clone();
    /**
     * the dry sand's colour at a point (x, z, out: Color) → out, or null: each pellet is the sand it was made of,
     * where it lies (the colony gives the flat's Terrain.colorAt); without it the pellets take the flat's mean
     */
    this.colorAt = null;
  }

  setSandColor(c) { this.material.userData.uniforms.uPelSand.value.copy(c); }
  /** grain mix: 0 the flat's sand, 1 salt and pepper */
  setPepper(p) { this.material.userData.uniforms.uPelPepper.value = p; }

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
    if (this.colorAt) { this.colorAt(x, z, _c); c.data[o + 8] = _c.r; c.data[o + 9] = _c.g; c.data[o + 10] = _c.b; }
    else { c.data[o + 8] = 0; c.data[o + 9] = 0; c.data[o + 10] = 0; }
    c.minY = Math.min(c.minY, y);
    c.maxY = Math.max(c.maxY, y);
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
   * Per frame: detail and visibility by distance, the drying clock, and the water: pellets it has reached start to
   * wash away; washed-out ones are removed.
   * waterAt(x, z): the water surface there (or -Infinity when unknown)
   */
  update(dt, cam, waterAt) {
    this.time += dt;
    this.material.userData.uniforms.uPelTime.value = this.time;
    this.tideAcc = (this.tideAcc ?? 0) + dt;
    const tide = this.tideAcc > 1;
    if (tide) this.tideAcc = 0;
    const far = this.far;
    for (const c of this.cells.values()) {
      if (tide && waterAt) this.washCell(c, waterAt);
      // the cell's nearest and farthest point from the eye (a standing player's feet are a metre and a half away)
      const dh = Math.hypot(c.cx - cam.x, c.cz - cam.z);
      const dNear = Math.hypot(Math.max(0, dh - CELL * 0.71), cam.y - c.maxY);
      if (c.n === 0 || dNear > far) { this.dropMeshes(c); continue; }
      const hi = detailAt(dNear), lo = detailAt(Math.hypot(dh + CELL * 0.71, cam.y - c.minY));
      if (hi === lo) {
        // all at one distance: one mesh (thinned out where a pellet is a pixel)
        for (let d = 0; d < 4; d++) if (d !== hi) this.dropMesh(c, d);
        const keep = hi === 0 ? keepAt(dNear) : 1;
        if (!c.meshes[hi] || c.split || c.n > c.caps[hi]) { c.split = false; c.keep = keep; this.buildMesh(c, hi, null); }
        else if (c.dirty || keep !== c.keep) { c.keep = keep; this.refreshMesh(c, hi, null); }
      } else if (c.dirty || !c.split || c.camAt.distanceToSquared(cam) > 1e-4) {
        // by the camera: each pellet the detail of its own distance, sorted again when the eye has moved a centimetre
        c.split = true;
        c.keep = 1;
        c.camAt.copy(cam);
        const G = c.groups ??= [[], [], [], []];
        for (const g of G) g.length = 0;
        for (let k = 0; k < c.n; k++) {
          const o = k * STRIDE;
          G[detailAt(Math.hypot(c.data[o] - cam.x, c.data[o + 1] - cam.y, c.data[o + 2] - cam.z))].push(k);
        }
        for (let d = 0; d < 4; d++) {
          if (!G[d].length) this.dropMesh(c, d);
          else if (!c.meshes[d] || G[d].length > c.caps[d]) this.buildMesh(c, d, G[d]);
          else this.refreshMesh(c, d, G[d]);
        }
      }
      c.dirty = false;
    }
  }

  /** the water over each pellet where it lies (a pool can cover one side of a cell and not the other) */
  washCell(c, waterAt) {
    if (c.n === 0) return;
    // the cell's corners and centre first: dry all round, nothing to do
    const h = CELL * 0.5;
    const w = Math.max(waterAt(c.cx, c.cz), waterAt(c.cx - h, c.cz - h), waterAt(c.cx + h, c.cz - h), waterAt(c.cx - h, c.cz + h), waterAt(c.cx + h, c.cz + h));
    if (!(w > c.minY + 0.0005)) return;
    let removed = false;
    for (let k = 0; k < c.n; k++) {
      const o = k * STRIDE;
      if (c.data[o + 7] === 0 && waterAt(c.data[o], c.data[o + 2]) > c.data[o + 1] + c.data[o + 3] * 0.3) { c.data[o + 7] = this.time; c.dirty = true; }
      if (c.data[o + 7] > 0 && this.time - c.data[o + 7] > WASH_S) { c.data[o + 3] = -1; removed = true; }
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

  /** the cell's mesh of one detail, for all its pellets (idx null) or those listed */
  buildMesh(c, detail, idx) {
    this.dropMesh(c, detail);
    // room for the pellets there are and some to come (a crab feeding next to the camera adds a few a minute)
    const n = idx ? idx.length : c.n;
    const cap = Math.min(MAX_PER_CELL, Math.max(64, 2 ** Math.ceil(Math.log2(n + 32))));
    const mesh = new InstancedMesh(pelletGeometry(detail), detail <= 1 ? this.materialFar : this.material, cap);
    mesh.name = 'kg-pellet-cell';
    // culled as a whole by the cell's own bounds (all its pellets lie in its square on the sand)
    mesh.frustumCulled = true;
    mesh.boundingSphere = new Sphere(new Vector3(c.cx, (c.minY + c.maxY) * 0.5, c.cz), CELL * 0.75 + 0.02 + (c.maxY - c.minY) * 0.5);
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = true;
    const attr = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const wash = new InstancedBufferAttribute(new Float32Array(cap), 1);
    const col = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('aPel', attr);
    mesh.geometry.setAttribute('aWash', wash);
    mesh.geometry.setAttribute('aPelCol', col);
    c.meshes[detail] = mesh;
    c.caps[detail] = cap;
    this.group.add(mesh);
    this.refreshMesh(c, detail, idx);
  }

  refreshMesh(c, detail, idx) {
    const mesh = c.meshes[detail];
    // (a pellet added at a new height: the bounds follow)
    const bs = mesh.boundingSphere;
    bs.center.y = (c.minY + c.maxY) * 0.5;
    bs.radius = CELL * 0.75 + 0.02 + (c.maxY - c.minY) * 0.5;
    const attr = mesh.geometry.getAttribute('aPel');
    const wash = mesh.geometry.getAttribute('aWash');
    const col = mesh.geometry.getAttribute('aPelCol');
    const n0 = idx ? idx.length : c.n;
    const keep = idx ? 1 : c.keep, grow = 1 / Math.sqrt(keep);
    let n = 0;
    for (let j = 0; j < n0; j++) {
      const k = idx ? idx[j] : j;
      const o = k * STRIDE;
      const seed = c.data[o + 4];
      const lump = c.data[o + 6] > 0.5;
      if (!lump && seed >= keep) continue;
      const r = c.data[o + 3] * (lump ? 1 : grow);
      const i = n++;
      _q.setFromAxisAngle(UP, seed * 6.283);
      _p.set(c.data[o], c.data[o + 1] + r * 0.32, c.data[o + 2]);
      _s.set(r, r, r);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      attr.setXYZW(i, seed, c.data[o + 5], c.data[o + 6], c.data[o + 6] > 0.5 ? 1 : 0.85);
      wash.setX(i, c.data[o + 7]);
      col.setXYZ(i, c.data[o + 8], c.data[o + 9], c.data[o + 10]);
    }
    mesh.count = n;
    for (const a of [mesh.instanceMatrix, attr, wash, col]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  dropMesh(c, detail) {
    const m = c.meshes[detail];
    if (!m) return;
    m.removeFromParent();
    m.geometry.dispose();
    c.meshes[detail] = null;
    c.caps[detail] = 0;
  }

  dropMeshes(c) {
    for (let d = 0; d < 4; d++) this.dropMesh(c, d);
    c.split = false;
  }

  setShadows(on) {
    if (on === this.castShadow) return;
    this.castShadow = on;
    for (const c of this.cells.values()) for (const m of c.meshes) if (m) m.castShadow = on;
  }

  /** all pellets everywhere gone (a new tide cycle after a time jump) */
  clear() {
    for (const c of this.cells.values()) this.dropMeshes(c);
    this.cells.clear();
    this.buckets.clear();
    this.total = 0;
  }

  dispose() {
    this.clear();
    this.material.dispose();
    this.materialFar.dispose();
    this.group.removeFromParent();
  }
}
