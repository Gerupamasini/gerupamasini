import * as THREE from 'three';
import { KentishPloverConfig as CFG } from './KentishPloverConfig.js';
import { KentishPlover } from './KentishPlover.js';
import { getPalette } from './KentishPloverMaterials.js';

// Flock manager: LOD policy + update scheduling + spatial queries + far-LOD instanced impostors.
// docs/optimization.md
//   LOD0  (< 2.5 m)  full geometry (≈24k tris), all feathers, eye cornea/lids, micro-normals, 60 Hz anim, 20 Hz AI
//   LOD1  (< 9 m)    coarser SDF body, no lesser/median coverts, simple eyes, 60 Hz anim, 20 Hz AI
//   LOD2  (< 30 m)   very coarse body, merged feather cards, no micro-normals, 30 Hz anim, 8 Hz AI
//   LOD3  (≥ 30 m)   one InstancedMesh for all far birds (≈90 tris each, flap in vertex shader), 3 Hz AI,
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
      const sched = { aiRate: CFG.lod.aiRate[lvl], animRate: CFG.lod.animRate[lvl], visible: visible && lvl < 3 };
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
      const cc = col(color);
      for (let i = 0; i < n; i++) {
        c.set([cc.r, cc.g, cc.b], i * 3);
        w[i] = wing;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geo.setAttribute('aWing', new THREE.BufferAttribute(w, 1));
      parts.push(geo.index ? geo.toNonIndexed() : geo);
    };
    const body = new THREE.SphereGeometry(1, 8, 5);
    body.scale(0.02, 0.018, 0.042);
    body.translate(0, 0.057, -0.004);
    add(body, pal.underparts);
    const back = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    back.scale(0.021, 0.012, 0.043);
    back.translate(0, 0.06, -0.006);
    add(back, pal.mantle);
    const head = new THREE.SphereGeometry(0.0105, 7, 5);
    head.translate(0, 0.08, 0.047);
    add(head, pal.underparts);
    const cap = new THREE.SphereGeometry(0.0108, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2.6);
    cap.translate(0, 0.081, 0.046);
    add(cap, pal.crown);
    const bill = new THREE.ConeGeometry(0.0022, 0.016, 4);
    bill.rotateX(Math.PI / 2);
    bill.translate(0, 0.077, 0.066);
    add(bill, pal.bill);
    for (const s of [1, -1]) {
      const leg = new THREE.BoxGeometry(0.0022, 0.045, 0.0022);
      leg.translate(0.01 * s, 0.022, -0.006);
      add(leg, pal.legs);
      const wing = new THREE.BufferGeometry();
      // wing panel in the bind (spread) frame: root at shoulder, pivot handled in the shader
      const v = [0, 0, 0.02, 0.19 * s, 0, -0.01, 0.2 * s, 0, -0.035, 0, 0, 0.02, 0.2 * s, 0, -0.035, 0, 0, -0.035];
      wing.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      wing.translate(0.008 * s, 0.064, 0.0);
      wing.computeVertexNormals();
      add(wing, pal.flightDark, s);
    }
    const tail = new THREE.PlaneGeometry(0.014, 0.03);
    tail.rotateX(-Math.PI / 2);
    tail.translate(0, 0.058, -0.06);
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
            vec3 p = transformed - vec3(0.008 * s, 0.064, 0.0);
            // fold: shorten span to the flank when not flying
            float span = mix(0.08, 1.0, step(0.01, fly));
            p.x *= span;
            float c = cos(ang), sn = sin(ang) * s;
            p = vec3(p.x * c - p.y * sn, p.x * sn + p.y * c, p.z);
            transformed = p + vec3(0.008 * s, 0.064, 0.0);
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
