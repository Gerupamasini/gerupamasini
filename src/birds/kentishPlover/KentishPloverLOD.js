import * as THREE from 'three';
import { KentishPloverConfig as CFG } from './KentishPloverConfig.js';
import { KentishPlover } from './KentishPlover.js';
import { getPalette, plumageAlbedo } from './KentishPloverMaterials.js';
import { getBodySDF, wingEdgeY } from './anatomy/bodyMesh.js';

// Flock manager: LOD policy + update scheduling + spatial queries + far-LOD instanced impostors.
// docs/optimization.md
//   LOD0  (< 2.5 m)  full geometry (≈24k tris), all feathers, eye cornea/lids, micro-normals, every-frame anim, 20 Hz AI
//   LOD1  (< 9 m)    coarser SDF body, no lesser/median coverts, simple eyes, every-frame anim, 20 Hz AI
//   LOD2  (< 30 m)   very coarse body, merged feather cards, no micro-normals, 30 Hz anim, 8 Hz AI
//   LOD3  (≥ 30 m)   one InstancedMesh for all far birds (≈300 tris each, flap in vertex shader), 3 Hz AI,
//                    skeleton not updated at all

const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

export class KentishPloverManager {
  constructor(world, scene, { maxFar = 256 } = {}) {
    this.world = world;
    this.scene = scene;
    this.all = [];
    this.grid = new Map();
    this.cell = 2;
    this.far = this._buildFarMesh(maxFar);
    scene.add(this.far);
    this.stats = { lod: [0, 0, 0, 0], culled: 0 };
    // the bird the camera follows: posed every frame at any LOD (a throttled pose would step against the camera)
    this.focus = null;
    world.birds = this;
  }

  spawn(opts) {
    const b = new KentishPlover({ world: this.world, id: this.all.length, ...opts });
    this.all.push(b);
    this.scene.add(b.model.object);
    return b;
  }

  // ------------------------------------------------------------ spatial queries
  _rebuildGrid() {
    this.grid.clear();
    for (const b of this.all) {
      const k = `${Math.floor(b.pos.x / this.cell)},${Math.floor(b.pos.z / this.cell)}`;
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(b);
    }
  }

  neighbours(bird, r, out = []) {
    out.length = 0;
    const c = this.cell;
    const i0 = Math.floor((bird.pos.x - r) / c);
    const i1 = Math.floor((bird.pos.x + r) / c);
    const k0 = Math.floor((bird.pos.z - r) / c);
    const k1 = Math.floor((bird.pos.z + r) / c);
    const r2 = r * r;
    for (let i = i0; i <= i1; i++)
      for (let k = k0; k <= k1; k++) {
        const a = this.grid.get(`${i},${k}`);
        if (!a) continue;
        for (const o of a) {
          if (o === bird) continue;
          const dx = o.pos.x - bird.pos.x;
          const dz = o.pos.z - bird.pos.z;
          if (dx * dx + dz * dz <= r2) out.push(o);
        }
      }
    return out;
  }

  centroid(bird, r) {
    const n = this.neighbours(bird, r, []);
    if (!n.length) return null;
    const c = { x: 0, z: 0 };
    for (const o of n) {
      c.x += o.pos.x / n.length;
      c.z += o.pos.z / n.length;
    }
    return c;
  }

  /** Flight-initiation contagion: nearby birds' fear rises with proximity (not a synchronised flock). */
  broadcastAlarm(from, landing) {
    const R = CFG.social.alarmContagionRadius;
    for (const o of this.neighbours(from, R, [])) {
      const d = o.pos.distanceTo(from.pos);
      const strength = CFG.social.alarmContagion * (1 - d / R) * (0.7 + 0.6 * Math.random()) / o.individual.fearThreshold;
      // reaction delay 0–0.35 s (birds don't lift off in perfect sync)
      setTimeout(() => o.ai.onAlarm(from, landing, strength), Math.random() * 350);
    }
  }

  // ------------------------------------------------------------ update
  update(dt, camera) {
    this._rebuildGrid();
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m);
    const fovScale = Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 45) / 2) / Math.tan(THREE.MathUtils.degToRad(22.5));
    const D = CFG.lod.distances;
    this.stats.lod = [0, 0, 0, 0];
    this.stats.culled = 0;
    let farCount = 0;
    const farM = this.far;
    for (const b of this.all) {
      const d = camera.position.distanceTo(b.pos) * fovScale;
      // hysteresis: need to be 10% past a threshold to switch
      let lvl = d < D[0] ? 0 : d < D[1] ? 1 : d < D[2] ? 2 : 3;
      if (b.lod !== undefined && Math.abs(lvl - b.lod) === 1) {
        const edge = D[Math.min(lvl, b.lod)];
        if (Math.abs(d - edge) < edge * 0.1) lvl = b.lod;
      }
      _sphere.center.copy(b.pos);
      _sphere.radius = 0.3;
      const visible = _frustum.intersectsSphere(_sphere);
      if (!visible) this.stats.culled++;
      b.lod = lvl;
      this.stats.lod[lvl]++;
      const sched = { aiRate: CFG.lod.aiRate[lvl], animRate: b === this.focus ? Infinity : CFG.lod.animRate[lvl], visible: visible && lvl < 3, dist: d };
      if (lvl < 3) b.model.setLOD(lvl);
      b.model.object.visible = visible && lvl < 3;
      b.update(dt, sched);
      if (lvl === 3 && visible && farCount < farM.instanceMatrix.count) {
        this._writeFar(farCount++, b);
      }
    }
    farM.count = farCount;
    farM.instanceMatrix.needsUpdate = true;
    farM.geometry.attributes.aFlap.needsUpdate = true;
    farM.material.userData.uniforms.uTime.value += dt;
  }

  _writeFar(i, b) {
    const s = b.individual.bodyScale;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.heading);
    if (b.airborne) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(b.animator.attitude.pitch, 0, b.animator.attitude.roll)));
    _m.compose(b.pos, q, new THREE.Vector3(s, s, s));
    this.far.setMatrixAt(i, _m);
    const a = this.far.geometry.attributes.aFlap;
    const f = b.animator.flight;
    a.setXYZ(i, b.airborne ? f.amp ?? 1 : 0, b.airborne ? f.hz : 0, b.id * 0.37);
  }

  _buildFarMesh(max) {
    // ~90-triangle bird for distant views: rounded body, head, bill, legs, two wing panels (flap in shader)
    const pal = getPalette('maleBreeding');
    const col = (h) => new THREE.Color(h);
    const parts = [];
    const add = (geo, color, wing = 0) => {
      const n = geo.getAttribute('position').count;
      const c = new Float32Array(n * 3);
      const w = new Float32Array(n);
      const cc = color && col(color);
      for (let i = 0; i < n; i++) {
        if (cc) c.set([cc.r, cc.g, cc.b], i * 3);
        w[i] = wing;
      }
      if (cc) geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geo.setAttribute('aWing', new THREE.BufferAttribute(w, 1));
      parts.push(geo.index ? geo.toNonIndexed() : geo);
    };
    // Body and head: one loft of elliptic rings whose top, bottom and width are read off the sculpted outline
    // (the relaxed bind = the stand, body_shape_spec.md §16) — so the impostor keeps the photo silhouette
    // (fitcheck.mjs lod=3 vs LOD0 in Frame A). Mantle / wing brown down to the visible wing edge (§10.1),
    // crown cap on the head, white underparts.
    add(farBodyGeometry(pal), null);
    // bill: base under the forehead → tip (bareParts BILL, 25° down): a six-sided cone, broader than deep at the
    // base like the bill's (anatomy/bill.js: ≈4.6 × 4 mm where it leaves the plumage)
    const tip = new THREE.Vector3(0, 0.0824, 0.0539);
    const base = new THREE.Vector3(0, 0.0872, 0.0385);
    const bill = new THREE.ConeGeometry(1, tip.distanceTo(base), 6);
    bill.scale(0.0023, 1, 0.002);
    bill.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(base).normalize()));
    bill.translate(...base.clone().add(tip).multiplyScalar(0.5).toArray());
    add(bill, pal.bill);
    for (const s of [1, -1]) {
      // tarsus from the foot (MTP, spec §9) to the heel, tibia to where it leaves the belly
      const leg = new THREE.BoxGeometry(0.0022, 0.038, 0.0022);
      leg.translate(((CFG.joints.foot[0] + CFG.joints.ankle[0]) / 2000) * s, 0.019, -0.01);
      add(leg, pal.legs);
      const wing = new THREE.BufferGeometry();
      // wing panel in the bind (spread) frame: root at the shoulder, pivot handled in the shader
      const v = [0, 0, 0.02, 0.19 * s, 0, -0.01, 0.2 * s, 0, -0.035, 0, 0, 0.02, 0.2 * s, 0, -0.035, 0, 0, -0.035];
      wing.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      wing.translate(...FAR_SHOULDER.map((x, i) => (i ? x : x * s)));
      wing.computeVertexNormals();
      add(wing, pal.flightDark, s);
    }
    // closed tail and the primary tips over it: a tapered wedge to the tail tip (z −85, spec §11)
    const tail = new THREE.BufferGeometry();
    const tv = [
      [0.008, 0.063, -0.056], [-0.008, 0.063, -0.056], [-0.007, 0.05, -0.056], [0.007, 0.05, -0.056],
      [0.003, 0.0565, -0.0852], [-0.003, 0.0565, -0.0852], [-0.002, 0.0535, -0.0852], [0.002, 0.0535, -0.0852],
    ];
    const quads = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]];
    tail.setAttribute('position', new THREE.Float32BufferAttribute(quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d].flatMap((k) => tv[k])), 3));
    tail.computeVertexNormals();
    add(tail, pal.tailDark);
    const merged = mergeGeos(parts);
    merged.setAttribute('aFlap', new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const uniforms = { uTime: { value: 0 } };
    mat.userData.uniforms = uniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWing; attribute vec3 aFlap; uniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // folded when perched (wing panels collapse onto the flank), flapping when airborne
          float s = aWing;
          if (abs(s) > 0.5) {
            float fly = aFlap.x;
            float ang = sin(uTime * 6.2831 * max(aFlap.y, 1.0) + aFlap.z * 6.0) * 0.9 * fly;
            vec3 p = transformed - vec3(${FAR_SHOULDER[0]} * s, ${FAR_SHOULDER[1]}, ${FAR_SHOULDER[2]});
            // fold: shorten span to the flank when not flying
            float span = mix(0.08, 1.0, step(0.01, fly));
            p.x *= span;
            float c = cos(ang), sn = sin(ang) * s;
            p = vec3(p.x * c - p.y * sn, p.x * sn + p.y * c, p.z);
            transformed = p + vec3(${FAR_SHOULDER[0]} * s, ${FAR_SHOULDER[1]}, ${FAR_SHOULDER[2]});
          }`
        );
    };
    const m = new THREE.InstancedMesh(merged, mat, max);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = false;
    m.name = 'plover-far-lod3';
    return m;
  }
}

// shoulder (m, folded-wing joint, spec §10.2): pivot of the far wing panels
const FAR_SHOULDER = [0.01, 0.077, 0.006];

/** Loft of the sculpted body + head outline (rest = relaxed stand), vertex-coloured. */
function farBodyGeometry(pal) {
  const sdf = getBodySDF(CFG); // mm
  const RING = 10;
  // outline crossing along a ray from an inside point (bisection; mm)
  const edge = (from, dir, max) => {
    let lo = 0;
    let hi = max;
    for (let i = 0; i < 22; i++) {
      const m = (lo + hi) / 2;
      if (sdf(from[0] + dir[0] * m, from[1] + dir[1] * m, from[2] + dir[2] * m) < 0) lo = m;
      else hi = m;
    }
    return lo;
  };
  // inside point of a slice: lowest SDF on the midline of the slice
  const inside = (z) => {
    let best = [Infinity, 0];
    for (let y = 30; y <= 110; y += 1) {
      const d = sdf(0, y, z);
      if (d < best[0]) best = [d, y];
    }
    return best;
  };
  const zs = [];
  for (let z = 60; z >= -100; z -= 0.5) if (inside(z)[0] < -0.5) zs.push(z);
  const [zFront, zRear] = [zs[0], zs[zs.length - 1]];
  const rings = [];
  const N = 16;
  for (let k = 0; k <= N; k++) {
    // rings packed toward both ends (rounded breast / face and under-tail)
    const t = 0.5 * (k / N) + 0.5 * (0.5 - 0.5 * Math.cos((k / N) * Math.PI));
    const z = zFront - 0.6 - (zFront - zRear - 1.2) * t;
    const yIn = inside(z)[1];
    const top = yIn + edge([0, yIn, z], [0, 1, 0], 60);
    const bot = yIn - edge([0, yIn, z], [0, -1, 0], 60);
    const yc = (top + bot) / 2;
    const hx = edge([0, yc, z], [1, 0, 0], 40);
    rings.push({ z, yc, hy: (top - bot) / 2, hx });
  }
  const colour = (x, y, z) => {
    // (v4.1: the grey-brown shoulders come down to y 74.5 in front of the wing, outside the breast-side horseshoe)
    const shoulder = z > 14 && z < 30 && Math.abs(x) > 14.5 && y > 74.5 && y < 90;
    const hex = shoulder ? pal.mantle : z > 14 ? (y > 92 ? pal.crown : pal.underparts) : y > wingEdgeY(z) ? pal.mantle : pal.underparts;
    return plumageAlbedo(hex);
  };
  const pos = [];
  const col = [];
  const vert = (x, y, z) => {
    pos.push(x * 1e-3, y * 1e-3, z * 1e-3);
    const c = colour(x, y, z);
    col.push(c.r, c.g, c.b);
  };
  const ringPt = (r, j) => {
    const a = (j / RING) * Math.PI * 2;
    return [r.hx * Math.sin(a), r.yc + r.hy * Math.cos(a), r.z];
  };
  for (let k = 0; k < rings.length - 1; k++)
    for (let j = 0; j < RING; j++) {
      const [a, b, c, d] = [ringPt(rings[k], j), ringPt(rings[k], j + 1), ringPt(rings[k + 1], j + 1), ringPt(rings[k + 1], j)];
      for (const p of [a, d, c, a, c, b]) vert(...p);
    }
  // caps: fans to the front (breast / face) and rear (under-tail) extremes
  for (const [r, z, flip] of [[rings[0], zFront, false], [rings[rings.length - 1], zRear, true]])
    for (let j = 0; j < RING; j++) {
      const [a, b] = [ringPt(r, j), ringPt(r, j + 1)];
      const c = [0, r.yc, z];
      for (const p of flip ? [a, b, c] : [a, c, b]) vert(...p);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function mergeGeos(geos) {
  let n = 0;
  for (const g of geos) n += g.getAttribute('position').count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'aWing']) {
    const size = geos[0].getAttribute(name).itemSize;
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of geos) {
      const a = g.getAttribute(name);
      arr.set(a.array.subarray(0, a.count * size), o);
      o += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
