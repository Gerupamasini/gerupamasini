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

const ROCK = {
  coralline: new THREE.Color().setRGB(0.72, 0.47, 0.53, THREE.SRGBColorSpace),
  red: new THREE.Color().setRGB(0.46, 0.12, 0.14, THREE.SRGBColorSpace),
  green: new THREE.Color().setRGB(0.36, 0.4, 0.2, THREE.SRGBColorSpace),
};

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
    // Floor of a rocky tide pool: coarse shell grit and gravel between the rocks, gently uneven.
    const swell = (vnoise(x * 9, z * 9) - 0.5) * 0.014;
    const grit = (vnoise(x * 160, z * 160) - 0.5) * 0.0012;
    return swell + grit;
  }

  mudAmount() {
    return 0; // no mud in a rock pool
  }

  buildTerrain() {
    const size = 0.8;
    const g = new THREE.PlaneGeometry(size, size, 240, 240);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    // dark volcanic grit, pale shell fragments, an olive diatom film [PHOTO 21, 23, 32, 46]
    const grit = new THREE.Color(0x4a4640);
    const shell = new THREE.Color(0xb8ad98);
    const film = new THREE.Color(0x6a6438);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));
      const h = hash2(x * 1e4, z * 1e4);
      c.copy(grit).lerp(shell, THREE.MathUtils.smoothstep(h, 0.86, 0.97) * 0.8 + vnoise(x * 70, z * 70) * 0.08);
      c.lerp(film, vnoise(x * 18 + 3, z * 18) * 0.45);
      c.multiplyScalar(0.8 + 0.4 * hash2(x * 3e3 + 1, z * 3e3));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const nm = this.makeGrainNormalMap();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, normalMap: nm, normalScale: new THREE.Vector2(1.2, 1.2) });
    addCaustics(mat, this.uniforms);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    this.scene.add(m);
    this.terrain = m;
    this.buildGravel();
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

  /** Pebbles and shell fragments as one InstancedMesh each. */
  buildGravel() {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const pebG = new THREE.DodecahedronGeometry(1, 1);
    const pebM = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: false });
    addCaustics(pebM, this.uniforms);
    const N = 900;
    const peb = new THREE.InstancedMesh(pebG, pebM, N);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const x = (Math.random() * 2 - 1) * 0.38;
      const z = (Math.random() * 2 - 1) * 0.3;
      const r = 0.0012 + Math.pow(Math.random(), 3) * 0.006;
      q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      sc.set(r, r * (0.45 + Math.random() * 0.4), r * (0.7 + Math.random() * 0.4));
      p.set(x, this.heightAt(x, z) + sc.y * 0.4, z);
      peb.setMatrixAt(i, m4.compose(p, q, sc));
      const k = Math.random();
      c.setRGB(0.2 + k * 0.22, 0.19 + k * 0.2, 0.17 + k * 0.17, THREE.SRGBColorSpace);
      if (Math.random() < 0.12) c.setRGB(0.66, 0.62, 0.55, THREE.SRGBColorSpace); // shell fragment
      peb.setColorAt(i, c);
    }
    peb.castShadow = peb.receiveShadow = true;
    this.scene.add(peb);
  }

  /** Rock surface colour: dark basalt with pink crustose coralline, green film and red algal crust [PHOTO 09, 22, 26, 27, 31]. */
  rockColour(v, r, seed, out) {
    const top = Math.max(0, v.y / r);
    const n1 = vnoise(v.x * 260 + seed, v.z * 260 + v.y * 180);
    const n2 = vnoise(v.x * 120 - seed, v.y * 140 + v.z * 90);
    const n3 = vnoise(v.x * 600 + seed * 2, v.z * 600);
    out.setRGB(0.2 + n3 * 0.08, 0.19 + n3 * 0.07, 0.17 + n3 * 0.06, THREE.SRGBColorSpace);
    const coralline = THREE.MathUtils.smoothstep(n1 * (0.7 + 0.6 * n3), 0.62, 0.8);
    out.lerp(ROCK.coralline, coralline * 0.8);
    const redCrust = THREE.MathUtils.smoothstep(n2, 0.64, 0.76) * (1 - coralline);
    out.lerp(ROCK.red, redCrust * 0.8);
    const green = THREE.MathUtils.smoothstep(top * n2, 0.22, 0.45);
    out.lerp(ROCK.green, green * 0.55);
    return out;
  }

  buildRocks() {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.86, vertexColors: true, flatShading: false });
    addCaustics(mat, this.uniforms);
    // [x, z, radius, flatten, climbable]: low boulders and a rock shelf the shrimp walk over, a few tall stones
    const specs = [
      [0.02, -0.03, 0.06, 0.32, true],
      [-0.12, -0.1, 0.045, 0.4, true],
      [-0.02, 0.1, 0.035, 0.42, true],
      [0.06, 0.12, 0.022, 0.6, true],
      [-0.22, 0.02, 0.05, 0.75, false],
      [0.0, -0.15, 0.03, 0.8, false],
      [-0.24, -0.12, 0.03, 0.5, true],
    ];
    const col3 = new THREE.Color();
    for (const [x, z, r, flat, climbable] of specs) {
      let g = new THREE.IcosahedronGeometry(r, THREE.MathUtils.clamp(Math.round(r * 260), 6, 16)); // fine enough for the pits
      g.deleteAttribute('normal');
      g.deleteAttribute('uv');
      g = mergeVertices(g);
      const p = g.attributes.position;
      const col = new Float32Array(p.count * 3);
      const seed = x * 100 + z * 37;
      for (let i = 0; i < p.count; i++) {
        _v.fromBufferAttribute(p, i);
        // weathered, pitted basalt: broad lumps plus small pits
        const n = vnoise(_v.x * 60 + seed, _v.z * 60 + _v.y * 40) * 0.35 + vnoise(_v.x * 260, _v.y * 260 + seed) * 0.1 + vnoise(_v.x * 900 + seed, _v.y * 900 - _v.z * 400) * 0.035 - Math.pow(vnoise(_v.x * 520 + seed, _v.z * 520), 4) * 0.14;
        _v.multiplyScalar(1 + n - 0.2);
        _v.y *= flat;
        p.setXYZ(i, _v.x, _v.y, _v.z);
        this.rockColour(_v, r * flat, seed, col3);
        col.set([col3.r, col3.g, col3.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, this.heightAt(x, z) - r * flat * 0.15, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      this.rocks.push({ center: m.position.clone(), radius: r * 1.05, mesh: m, climbable });
      this.walkables.push(m);
    }
    // Overhanging slab resting on two stones -> the crevice the animals hide in by day [PHOTO 22, 31].
    const slabG = new THREE.BoxGeometry(0.1, 0.007, 0.07, 14, 1, 10);
    const sp = slabG.attributes.position;
    const sCol = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i++) {
      sp.setY(i, sp.getY(i) + vnoise(sp.getX(i) * 200, sp.getZ(i) * 200) * 0.003);
      _v.fromBufferAttribute(sp, i);
      this.rockColour(_v, 0.004, 5, col3);
      sCol.set([col3.r, col3.g, col3.b], i * 3);
    }
    slabG.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
    slabG.computeVertexNormals();
    const slab = new THREE.Mesh(slabG, mat);
    const sx = 0.2;
    const sz = -0.1;
    slab.position.set(sx, this.heightAt(sx, sz) + 0.024, sz);
    slab.rotation.set(0.05, -0.5, -0.06);
    slab.castShadow = slab.receiveShadow = true;
    this.scene.add(slab);
    this.walkables.push(slab);
    for (const dz of [-0.03, 0.03]) {
      const g = new THREE.DodecahedronGeometry(0.013, 1);
      const m = new THREE.Mesh(g, mat);
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < g.attributes.position.count; i++) {
        _v.fromBufferAttribute(g.attributes.position, i);
        this.rockColour(_v, 0.013, 9, col3);
        col.set([col3.r, col3.g, col3.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const px = sx + dz * 0.5;
      const pz = sz + dz;
      m.position.set(px, this.heightAt(px, pz) + 0.009, pz);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      this.rocks.push({ center: m.position.clone(), radius: 0.014, mesh: m, climbable: false });
      this.walkables.push(m);
    }
    this.shelters.push({ kind: 'crevice', position: new THREE.Vector3(sx, this.heightAt(sx, sz), sz), facing: new THREE.Vector3(sx - 0.1, 0, sz + 0.05) });
    // The lee of the tall stones also serves as cover.
    for (const r of this.rocks.filter((k) => !k.climbable && k.radius > 0.025)) {
      const p = r.center.clone().add(new THREE.Vector3(r.radius + 0.008, 0, 0));
      p.y = this.heightAt(p.x, p.z);
      this.shelters.push({ kind: 'rock', position: p, facing: r.center.clone().add(new THREE.Vector3(0.2, 0, 0)) });
    }
  }

  /** Sway shader shared by the eelgrass and the algal tufts (vertex displacement in the blade's own frame). */
  swayMaterial(color, height, o = {}) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 0.7, side: THREE.DoubleSide, transparent: false });
    const uniforms = this.plantUniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uFlow;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float h = transformed.y / ${height.toFixed(4)};
          vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float ph = ip.x*40.0 + ip.z*23.0;
          float bend = h*h;
          transformed.x += bend * (0.02*sin(uTime*0.9+ph) + uFlow.x*1.2);
          transformed.z += bend * (0.012*cos(uTime*0.7+ph*1.3) + uFlow.z*1.2);
          transformed.y -= bend * 0.01 * length(uFlow.xz)*30.0;`
        );
    };
    return mat;
  }

  buildPlants() {
    this.plantUniforms = { uTime: this.uniforms.uTime, uFlow: { value: new THREE.Vector3() } };
    this.buildAlgae();
    this.buildEelgrass();
  }

  /** Red and brown algal tufts on and around the rocks [PHOTO 23, 25, 29, 32]. */
  buildAlgae() {
    const H = 0.022;
    const g = new THREE.PlaneGeometry(0.0007, H, 1, 6);
    g.translate(0, H / 2, 0);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (const [color, count, spots] of [
      [0x4a1614, 1400, [[0.0, -0.06], [-0.1, -0.13], [-0.05, 0.08], [0.09, 0.09], [-0.24, 0.07]]],
      [0x564220, 900, [[0.06, -0.02], [-0.16, -0.06], [-0.26, -0.14], [0.03, 0.13]]],
    ]) {
      const inst = new THREE.InstancedMesh(g, this.swayMaterial(color, H, { roughness: 0.6 }), count);
      for (let i = 0; i < count; i++) {
        const [cx, cz] = spots[i % spots.length];
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 0.025;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 1.4, Math.random() * Math.PI, (Math.random() - 0.5) * 1.4));
        s.set(1, 0.35 + Math.random() * 0.8, 1);
        m4.compose(new THREE.Vector3(x, this.groundY(x, z, 0.3) - 0.001, z), q, s);
        inst.setMatrixAt(i, m4);
      }
      inst.castShadow = true;
      this.scene.add(inst);
    }
  }

  /**
   * アマモ場: eelgrass blades (InstancedMesh + sway shader, as in the シラタエビ viewer). bladeFrame() evaluates
   * the same sway on the CPU so a shrimp holding a blade moves with it.
   */
  buildEelgrass() {
    const H = 0.16;
    this.bladeH = H;
    this.bladeHalfWidth = 0.0028;
    const g = new THREE.PlaneGeometry(this.bladeHalfWidth * 2, H, 1, 16);
    g.translate(0, H / 2, 0);
    const mat = this.swayMaterial(0x4d6229, H, { roughness: 0.55 });
    const count = 110;
    const inst = new THREE.InstancedMesh(g, mat, count);
    this.blades = [];
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const meadow = { center: new THREE.Vector3(0.2, 0, 0.08), rx: 0.075, rz: 0.075 };
    this.meadow = meadow;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      const x = meadow.center.x + Math.cos(a) * r * meadow.rx;
      const z = meadow.center.z + Math.sin(a) * r * meadow.rz;
      q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3));
      s.set(1, 0.6 + Math.random() * 0.7, 1);
      const pos = new THREE.Vector3(x, this.heightAt(x, z), z);
      const m4 = new THREE.Matrix4().compose(pos, q, s);
      inst.setMatrixAt(i, m4);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      normal.y = 0;
      normal.normalize();
      this.blades.push({ index: i, matrix: m4, base: pos, normal, length: H * s.y, ph: x * 40 + z * 23 });
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.scene.add(inst);
    this.shelters.push({ kind: 'amamo', position: new THREE.Vector3(meadow.center.x, this.heightAt(meadow.center.x, meadow.center.z), meadow.center.z), facing: new THREE.Vector3(0, 0, 0) });
  }

  /** Blade centreline point in the blade's local frame, displaced exactly as the vertex shader does. */
  bladeLocal(b, yLocal, out) {
    const h = yLocal / this.bladeH;
    const bend = h * h;
    const t = this.uniforms.uTime.value;
    const F = this.plantUniforms.uFlow.value;
    out.set(bend * (0.02 * Math.sin(t * 0.9 + b.ph) + F.x * 1.2), yLocal - bend * 0.01 * Math.hypot(F.x, F.z) * 30, bend * (0.012 * Math.cos(t * 0.7 + b.ph * 1.3) + F.z * 1.2));
    return out.applyMatrix4(b.matrix);
  }

  /**
   * Frame on blade `index` at distance h (m) up from its base: p (centreline), t (unit tangent, up the blade),
   * n (unit face normal), e (unit across the blade, t x n).
   */
  bladeFrame(index, h, out) {
    const b = this.blades[index];
    const sy = b.length / this.bladeH;
    const y = THREE.MathUtils.clamp(h / sy, 0, this.bladeH);
    const e = 0.002;
    this.bladeLocal(b, y, out.p);
    const a = this.bladeLocal(b, Math.max(0, y - e), new THREE.Vector3());
    const c = this.bladeLocal(b, Math.min(this.bladeH, y + e), new THREE.Vector3());
    out.t.subVectors(c, a).normalize();
    out.n.copy(b.normal).addScaledVector(out.t, -b.normal.dot(out.t)).normalize();
    out.e.crossVectors(out.t, out.n).normalize();
    return out;
  }

  /** Nearest free blade within range (horizontal distance to its base), with the side of it the animal is on. */
  nearestBlade(p, range) {
    if (!this.blades) return null;
    let best = null;
    let bd = range;
    for (const b of this.blades) {
      const d = Math.hypot(p.x - b.base.x, p.z - b.base.z);
      if (d >= bd) continue;
      if (this.shrimps.some((s) => s.position !== p && s.brain.cling && s.brain.cling.blade === b.index)) continue;
      bd = d;
      best = b;
    }
    if (!best) return null;
    const side = Math.sign((p.x - best.base.x) * best.normal.x + (p.z - best.base.z) * best.normal.z) || 1;
    return { index: best.index, base: best.base, normal: best.normal, length: best.length, dist: bd, facing: side };
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
      if (onGround && r.climbable) continue; // walked over, not around
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
      if (onGround && r.climbable) continue;
      _v.subVectors(p, r.center);
      if (onGround) _v.y = 0;
      const d = _v.length();
      const minD = r.radius + 0.006;
      if (d < minD && d > 1e-6) p.addScaledVector(_v.normalize(), minD - d);
    }
  }

  isFree(p, margin) {
    for (const r of this.rocks) {
      if (r.climbable) continue;
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
