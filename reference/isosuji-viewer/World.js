import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const w = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

const CAUSTIC_GLSL = /* glsl */ `
uniform float uTime; uniform float uCaustic;
varying vec3 vWPos;
float caustic(vec2 p){
  // Sum of warped sines approximates refracted-light caustic network.
  vec2 q = p*55.0;
  float c = 0.0;
  for(int i=0;i<3;i++){
    float fi=float(i);
    q += vec2(sin(q.y*0.9+uTime*0.7+fi), cos(q.x*0.8-uTime*0.6+fi*1.7))*0.6;
    c += abs(sin(q.x+q.y*0.3)*cos(q.y-q.x*0.2));
  }
  return pow(1.0 - clamp(c/3.0,0.0,1.0), 5.0);
}`;

function addCaustics(mat, uniforms) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CAUSTIC_GLSL)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float up = clamp(dot(normal, vec3(0.0,1.0,0.0)), 0.0, 1.0);
        totalEmissiveRadiance += diffuseColor.rgb * caustic(vWPos.xz) * uCaustic * (0.3+0.7*up);`);
  };
  // World-space normal approx: `normal` is view space; fine as a coarse facing term.
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.bounds = { x: 0.28, z: 0.17, top: 0.26 };
    this.daylight = 1;
    this.flowBase = new THREE.Vector3(0.0, 0, 0);
    this.flowSpeed = 0;
    this.time = 0;
    this.shrimps = [];
    this.foods = [];
    this.rocks = [];
    this.shelters = [];
    this.walkables = [];
    this.uniforms = { uTime: { value: 0 }, uCaustic: { value: 1.2 } };
    this.buildTerrain();
    this.buildRocks();
    this.buildPlants();
    this.buildParticles();
    this.buildTank();
  }

  // ---------------------------------------------------------------- terrain
  heightAt(x, z) {
    // Rippled sand + a shallow muddy depression.
    const ripples = Math.sin(x * 140 + Math.sin(z * 30) * 1.5) * 0.0007;
    const dunes = (vnoise(x * 12, z * 12) - 0.5) * 0.012;
    const mud = -0.006 * Math.exp(-((x + 0.12) ** 2 + (z - 0.05) ** 2) / 0.004);
    return dunes + ripples * (1 - this.mudAmount(x, z)) + mud;
  }

  mudAmount(x, z) {
    return Math.exp(-((x + 0.12) ** 2 + (z - 0.05) ** 2) / 0.006);
  }

  buildTerrain() {
    const size = 0.8;
    const g = new THREE.PlaneGeometry(size, size, 220, 220);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xb9a888);
    const sand2 = new THREE.Color(0x8f8068);
    const mud = new THREE.Color(0x4b4032);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));
      c.copy(sand).lerp(sand2, vnoise(x * 90, z * 90) * 0.7 + hash2(x * 1e4, z * 1e4) * 0.3);
      c.lerp(mud, this.mudAmount(x, z) * 0.85);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    // Grain-scale normal detail via a procedural canvas normal map.
    const nm = this.makeGrainNormalMap();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, normalMap: nm, normalScale: new THREE.Vector2(0.8, 0.8) });
    addCaustics(mat, this.uniforms);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    this.scene.add(m);
    this.terrain = m;
  }

  makeGrainNormalMap() {
    const S = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = Math.random();
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
        const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
        const o = (y * S + x) * 4;
        img.data[o] = 128 + dx * 60;
        img.data[o + 1] = 128 + dy * 60;
        img.data[o + 2] = 255;
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 60);
    return t;
  }

  buildRocks() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6d675c, roughness: 0.9, vertexColors: true });
    addCaustics(mat, this.uniforms);
    const specs = [
      [0.1, -0.05, 0.035],
      [-0.03, 0.09, 0.025],
      [0.17, 0.08, 0.02],
      [-0.2, -0.08, 0.03],
      [0.02, -0.11, 0.018],
    ];
    for (const [x, z, r] of specs) {
      let g = new THREE.IcosahedronGeometry(r, 5);
      g.deleteAttribute('normal');
      g.deleteAttribute('uv');
      g = mergeVertices(g);
      const p = g.attributes.position;
      const col = new Float32Array(p.count * 3);
      const seed = x * 100;
      for (let i = 0; i < p.count; i++) {
        _v.fromBufferAttribute(p, i);
        const n = vnoise(_v.x * 80 + seed, _v.z * 80 + _v.y * 50) * 0.35 + vnoise(_v.x * 300, _v.y * 300 + seed) * 0.08;
        _v.multiplyScalar(1 + n - 0.2);
        _v.y *= 0.6;
        p.setXYZ(i, _v.x, _v.y, _v.z);
        // Biofilm/algal tint on upper surfaces.
        const alg = Math.max(0, _v.y / r) * vnoise(_v.x * 200, _v.z * 200);
        col.set([0.42 - alg * 0.12, 0.4 + alg * 0.05, 0.36 - alg * 0.12], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, this.heightAt(x, z) + r * 0.05, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      this.rocks.push({ center: m.position.clone(), radius: r * 1.05, mesh: m });
      this.walkables.push(m);
    }
    // Overhanging slab resting on two stones → shelter crevice.
    const slabG = new THREE.BoxGeometry(0.09, 0.006, 0.06, 12, 1, 8);
    const sp = slabG.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setY(i, sp.getY(i) + vnoise(sp.getX(i) * 200, sp.getZ(i) * 200) * 0.003);
    slabG.computeVertexNormals();
    const slab = new THREE.Mesh(slabG, new THREE.MeshStandardMaterial({ color: 0x5c574d, roughness: 0.95 }));
    const sx = -0.15;
    const sz = 0.08;
    slab.position.set(sx, this.heightAt(sx, sz) + 0.022, sz);
    slab.rotation.set(0.05, 0.4, -0.06);
    slab.castShadow = slab.receiveShadow = true;
    this.scene.add(slab);
    this.walkables.push(slab);
    for (const dz of [-0.026, 0.026]) {
      const g = new THREE.DodecahedronGeometry(0.012, 1);
      const m = new THREE.Mesh(g, mat);
      const px = sx + dz * 0.4;
      const pz = sz + dz;
      m.position.set(px, this.heightAt(px, pz) + 0.009, pz);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      this.rocks.push({ center: m.position.clone(), radius: 0.013, mesh: m });
      this.walkables.push(m);
    }
    this.shelters.push({ position: new THREE.Vector3(sx, this.heightAt(sx, sz), sz), facing: new THREE.Vector3(sx + 0.1, 0, sz + 0.04) });
    // Rock lees also act as partial shelters.
    for (const r of this.rocks.slice(0, 3)) {
      const p = r.center.clone().add(new THREE.Vector3(-r.radius - 0.01, 0, 0));
      p.y = this.heightAt(p.x, p.z);
      this.shelters.push({ position: p, facing: r.center.clone().add(new THREE.Vector3(-0.2, 0, 0)) });
    }
  }

  buildPlants() {
    // Eelgrass-like ribbons (Zostera occurs in brackish estuaries), swayed in the vertex shader.
    const blades = 140;
    const g = new THREE.PlaneGeometry(0.005, 0.16, 1, 12);
    g.translate(0, 0.08, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4f6b2a, roughness: 0.7, side: THREE.DoubleSide, transparent: false });
    const uniforms = { uTime: this.uniforms.uTime, uFlow: { value: new THREE.Vector3() } };
    this.plantUniforms = uniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uFlow;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float h = transformed.y / 0.16;
          vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float ph = ip.x*40.0 + ip.z*23.0;
          float bend = h*h;
          transformed.x += bend * (0.02*sin(uTime*0.9+ph) + uFlow.x*1.2);
          transformed.z += bend * (0.012*cos(uTime*0.7+ph*1.3) + uFlow.z*1.2);
          transformed.y -= bend * 0.01 * length(uFlow.xz)*30.0;`
        );
    };
    const inst = new THREE.InstancedMesh(g, mat, blades);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const clumps = [[0.2, -0.12], [-0.23, 0.1], [0.23, 0.13]];
    let k = 0;
    this.plantPatches = [];
    for (const [cx, cz] of clumps) {
      this.plantPatches.push({ center: new THREE.Vector3(cx, 0, cz), radius: 0.04 });
      for (let i = 0; i < blades / clumps.length; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.04;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3));
        s.set(1, 0.5 + Math.random() * 0.8, 1);
        m4.compose(new THREE.Vector3(x, this.heightAt(x, z), z), q, s);
        if (k < blades) inst.setMatrixAt(k++, m4);
      }
      // Plants provide shelter
      this.shelters.push({ position: new THREE.Vector3(cx, this.heightAt(cx, cz), cz), facing: new THREE.Vector3(0, 0, 0) });
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.scene.add(inst);
  }

  buildParticles() {
    // Suspended detritus / plankton ("marine snow"), advected by flow and wakes.
    const N = 2500;
    this.pN = N;
    this.pPos = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3);
    const B = this.bounds;
    for (let i = 0; i < N; i++) {
      this.pPos[i * 3] = (Math.random() * 2 - 1) * B.x;
      this.pPos[i * 3 + 1] = Math.random() * B.top;
      this.pPos[i * 3 + 2] = (Math.random() * 2 - 1) * B.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dc = dot.getContext('2d');
    const grd = dc.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = grd;
    dc.fillRect(0, 0, 32, 32);
    const m = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), color: 0xd8e0d0, size: 0.0006, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false });
    this.particles = new THREE.Points(g, m);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.pNext = 0;
  }

  buildTank() {
    // Water surface seen from below (total internal reflection look).
    const g = new THREE.PlaneGeometry(0.8, 0.8, 1, 1);
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: 0x9ec6c4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    m.position.y = this.bounds.top;
    this.scene.add(m);
  }

  // ---------------------------------------------------------------- queries
  groundY(x, z, fromY = 0.3) {
    let y = this.heightAt(x, z);
    _ray.set(_v.set(x, fromY, z), DOWN);
    _ray.far = fromY - y + 0.001;
    const hit = _ray.intersectObjects(this.walkables, false)[0];
    if (hit) y = Math.max(y, hit.point.y);
    return y;
  }

  onSediment(p) {
    return p.y - this.heightAt(p.x, p.z) < 0.001;
  }

  flowAt(p, out) {
    // Base current + slow turbulent eddies; boundary layer slows flow near the bottom.
    const h = Math.max(0, p.y - this.heightAt(p.x, p.z));
    const bl = Math.min(1, h / 0.02);
    const t = this.time;
    out.copy(this.flowBase).multiplyScalar(bl);
    const turb = this.flowSpeed * 0.3 + 0.0008;
    out.x += (vnoise(p.x * 20 + t * 0.3, p.z * 20) - 0.5) * turb;
    out.y += (vnoise(p.z * 20 - t * 0.2, p.y * 20) - 0.5) * turb * 0.5;
    out.z += (vnoise(p.y * 20, p.x * 20 + t * 0.25) - 0.5) * turb;
    return out;
  }

  upstreamness(from, to) {
    if (this.flowSpeed < 0.002) return 0;
    _v.subVectors(to, from).normalize();
    return -_v.dot(this.flowBase) / this.flowSpeed;
  }

  steer(pos, dir, onGround) {
    // Obstacle avoidance with wall-following: blend in tangential direction around rocks.
    for (const r of this.rocks) {
      _v.subVectors(pos, r.center);
      if (onGround) _v.y = 0;
      const d = _v.length();
      const range = r.radius + 0.025;
      if (d < range) {
        _v.normalize();
        const toward = -dir.dot(_v);
        if (toward > -0.2) {
          const tangent = new THREE.Vector3(-_v.z, 0, _v.x);
          if (tangent.dot(dir) < 0) tangent.negate();
          const w = (range - d) / 0.025;
          dir.addScaledVector(tangent, w * 1.2).addScaledVector(_v, w * 0.6);
        }
      }
    }
    const B = this.bounds;
    const m = 0.03;
    if (pos.x > B.x - m) dir.x -= (pos.x - (B.x - m)) / m;
    if (pos.x < -B.x + m) dir.x += (-B.x + m - pos.x) / m;
    if (pos.z > B.z - m) dir.z -= (pos.z - (B.z - m)) / m;
    if (pos.z < -B.z + m) dir.z += (-B.z + m - pos.z) / m;
    if (!onGround && pos.y > B.top - 0.03) dir.y -= 1;
    return dir.normalize();
  }

  constrain(p, onGround, vel) {
    const B = this.bounds;
    const clampAxis = (k, lim) => {
      if (p[k] > lim) {
        p[k] = lim;
        if (vel && vel[k] > 0) vel[k] *= -0.3;
      }
      if (p[k] < -lim) {
        p[k] = -lim;
        if (vel && vel[k] < 0) vel[k] *= -0.3;
      }
    };
    clampAxis('x', B.x);
    clampAxis('z', B.z);
    if (p.y > B.top - 0.01) {
      p.y = B.top - 0.01;
      if (vel && vel.y > 0) vel.y *= -0.3;
    }
    // Push out of rocks (body is not allowed to interpenetrate).
    for (const r of this.rocks) {
      _v.subVectors(p, r.center);
      if (onGround) _v.y = 0;
      const d = _v.length();
      const minD = r.radius + 0.006;
      if (d < minD && d > 1e-6) p.addScaledVector(_v.normalize(), minD - d);
    }
  }

  isFree(p, margin) {
    for (const r of this.rocks) {
      if (Math.hypot(p.x - r.center.x, p.z - r.center.z) < r.radius + margin) return false;
    }
    const B = this.bounds;
    return Math.abs(p.x) < B.x - 0.03 && Math.abs(p.z) < B.z - 0.03;
  }

  nearestFood(p, range) {
    let best = null;
    let bd = range;
    for (const f of this.foods) {
      const d = f.position.distanceTo(p);
      if (d < bd && f.amount > 0) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  nearestShelter(p) {
    let best = null;
    let bd = Infinity;
    for (const s of this.shelters) {
      const d = s.position.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  neighbors(self, r) {
    return this.shrimps.filter((o) => o !== self && o.position.distanceTo(self.position) < r);
  }

  // ---------------------------------------------------------------- events
  addFood(point) {
    const g = new THREE.DodecahedronGeometry(0.0022, 0);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.8 }));
    m.position.copy(point);
    m.position.y = Math.min(point.y + 0.08, this.bounds.top - 0.01);
    m.castShadow = true;
    this.scene.add(m);
    const food = {
      position: m.position,
      mesh: m,
      amount: 1,
      settled: false,
      consume: (a) => {
        food.amount -= a;
        m.scale.setScalar(Math.max(0.2, food.amount));
      },
    };
    this.foods.push(food);
    return food;
  }

  stimulus(point, strength) {
    for (const s of this.shrimps) s.brain.stimulus(point, strength);
    this.wake(point, new THREE.Vector3(0, -1, 0), strength * 0.1, 'water');
  }

  wake(pos, dir, strength, mode) {
    // Push nearby particles with the jet from the tail fan.
    const P = this.pPos;
    const V = this.pVel;
    for (let i = 0; i < this.pN; i++) {
      const dx = P[i * 3] - pos.x;
      const dy = P[i * 3 + 1] - pos.y;
      const dz = P[i * 3 + 2] - pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 0.0016) {
        const k = strength * 0.4 * Math.exp(-d2 / 0.0004);
        V[i * 3] += -dir.x * k + dx * k * 5;
        V[i * 3 + 1] += -dir.y * k + dy * k * 5;
        V[i * 3 + 2] += -dir.z * k + dz * k * 5;
      }
    }
    if (pos.y - this.heightAt(pos.x, pos.z) < 0.02) this.puff(pos, 60, 0.03 * strength + 0.01);
  }

  puff(pos, n, speed) {
    // Resuspend sediment: recycle particles as a local cloud.
    const P = this.pPos;
    const V = this.pVel;
    for (let k = 0; k < n; k++) {
      const i = this.pNext;
      this.pNext = (this.pNext + 1) % this.pN;
      P[i * 3] = pos.x + (Math.random() - 0.5) * 0.01;
      P[i * 3 + 1] = this.heightAt(pos.x, pos.z) + Math.random() * 0.003;
      P[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.01;
      V[i * 3] = (Math.random() - 0.5) * speed;
      V[i * 3 + 1] = Math.random() * speed * 0.8;
      V[i * 3 + 2] = (Math.random() - 0.5) * speed;
    }
  }

  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.flowSpeed = this.flowBase.length();
    this.plantUniforms.uFlow.value.copy(this.flowBase);
    // Particles
    const P = this.pPos;
    const V = this.pVel;
    const B = this.bounds;
    const f = new THREE.Vector3();
    const p = new THREE.Vector3();
    const drag = Math.exp(-dt * 3);
    for (let i = 0; i < this.pN; i++) {
      p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (i % 4 === (Math.floor(this.time * 60) & 3)) this.flowAt(p, f).multiplyScalar(4 * dt);
      else f.set(0, 0, 0);
      V[i * 3] = V[i * 3] * drag + f.x * 3;
      V[i * 3 + 1] = V[i * 3 + 1] * drag + f.y * 3 - dt * 0.0006;
      V[i * 3 + 2] = V[i * 3 + 2] * drag + f.z * 3;
      P[i * 3] += (V[i * 3] + this.flowBase.x * 0.5) * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += (V[i * 3 + 2] + this.flowBase.z * 0.5) * dt;
      if (P[i * 3] > B.x) P[i * 3] -= 2 * B.x;
      if (P[i * 3] < -B.x) P[i * 3] += 2 * B.x;
      if (P[i * 3 + 2] > B.z) P[i * 3 + 2] -= 2 * B.z;
      if (P[i * 3 + 2] < -B.z) P[i * 3 + 2] += 2 * B.z;
      const gy = this.heightAt(P[i * 3], P[i * 3 + 2]);
      if (P[i * 3 + 1] < gy) {
        P[i * 3 + 1] = gy + B.top * Math.random();
        V[i * 3 + 1] = 0;
      }
      if (P[i * 3 + 1] > B.top) P[i * 3 + 1] = gy + 0.001;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    // Food sinks and settles
    for (const fd of this.foods) {
      const gy = this.groundY(fd.position.x, fd.position.z, fd.position.y) + 0.0015;
      if (fd.position.y > gy) {
        fd.position.y = Math.max(gy, fd.position.y - dt * 0.03);
        fd.position.x += this.flowBase.x * dt * 0.5;
        fd.position.z += this.flowBase.z * dt * 0.5;
        fd.mesh.rotation.x += dt;
      }
    }
    this.foods = this.foods.filter((fd) => {
      if (fd.amount <= 0) {
        this.scene.remove(fd.mesh);
        return false;
      }
      return true;
    });
    for (const s of this.shrimps) s.update(dt);
  }
}
